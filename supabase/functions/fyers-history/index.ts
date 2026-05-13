const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FYERS_HISTORY_URL = 'https://api-t1.fyers.in/data/history';

// Generic FYERS history proxy — used by the option backtest to pull
// historical intraday candles for any symbol (index or option contract).
// Query params:
//   symbol     (required) e.g. NSE:NIFTY25MAY24500CE  or  NSE:NIFTY50-INDEX
//   resolution (optional) default "1" (1-min). Also accepts 3, 5, 15, D...
//   range_from (required, YYYY-MM-DD)
//   range_to   (required, YYYY-MM-DD)
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const APP_ID = Deno.env.get('FYERS_APP_ID');
    const TOKEN = Deno.env.get('FYERS_ACCESS_TOKEN');
    if (!APP_ID || !TOKEN) throw new Error('FYERS credentials not configured');

    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const resolution = url.searchParams.get('resolution') ?? '1';
    const range_from = url.searchParams.get('range_from');
    const range_to = url.searchParams.get('range_to');
    if (!symbol || !range_from || !range_to) {
      throw new Error('symbol, range_from, range_to are required');
    }

    const params = new URLSearchParams({
      symbol, resolution, date_format: '1', range_from, range_to, cont_flag: '1',
    });
    const res = await fetch(`${FYERS_HISTORY_URL}?${params}`, {
      headers: { Authorization: `${APP_ID}:${TOKEN}` },
    });
    const json = await res.json();
    if (!res.ok || json.s !== 'ok') {
      throw new Error(`FYERS history ${res.status}: ${json.message ?? json.s}`);
    }

    const candles = (json.candles ?? []).map((c: number[]) => ({
      ts: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5],
    }));

    return new Response(JSON.stringify({
      success: true, source: 'fyers', symbol, resolution, count: candles.length, candles,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('fyers-history failed:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});