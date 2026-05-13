const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FYERS_QUOTES_URL = 'https://api-t1.fyers.in/data/quotes';
const FYERS_OPTIONCHAIN_URL = 'https://api-t1.fyers.in/data/options-chain-v3';
const NIFTY_INDEX = 'NSE:NIFTY50-INDEX';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const APP_ID = Deno.env.get('FYERS_APP_ID');
    const TOKEN = Deno.env.get('FYERS_ACCESS_TOKEN');
    if (!APP_ID || !TOKEN) throw new Error('FYERS credentials not configured');
    const auth = `${APP_ID}:${TOKEN}`;

    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get('symbols');

    // Mode A: explicit symbols => return live quote(s)
    if (symbolsParam) {
      const res = await fetch(`${FYERS_QUOTES_URL}?symbols=${encodeURIComponent(symbolsParam)}`, {
        headers: { Authorization: auth },
      });
      const json = await res.json();
      if (!res.ok || json.s !== 'ok') {
        throw new Error(`FYERS quotes ${res.status}: ${json.message ?? json.s}`);
      }
      const quotes = (json.d ?? []).map((q: any) => ({
        symbol: q.n,
        ltp: q.v?.lp ?? null,
        bid: q.v?.bid ?? null,
        ask: q.v?.ask ?? null,
        volume: q.v?.volume ?? null,
      }));
      return new Response(JSON.stringify({ success: true, source: 'fyers', quotes, ts: new Date().toISOString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mode B: ATM option chain (default) — returns underlying + nearest CE/PE LTP
    const strikeCount = url.searchParams.get('strikecount') ?? '1';
    const res = await fetch(
      `${FYERS_OPTIONCHAIN_URL}?symbol=${encodeURIComponent(NIFTY_INDEX)}&strikecount=${strikeCount}&timestamp=`,
      { headers: { Authorization: auth } },
    );
    const json = await res.json();
    if (!res.ok || json.s !== 'ok') {
      throw new Error(`FYERS option-chain ${res.status}: ${json.message ?? json.s}`);
    }

    const data = json.data ?? {};
    const underlying: number = data.indiavixData?.ltp ?? data.callOi ?? 0; // fallback
    const optionsChain: any[] = data.optionsChain ?? [];
    const expiryData: any[] = data.expiryData ?? [];
    const expiry = expiryData[0]?.date ?? null;

    // Find underlying spot (entry with strike_price == 0 or symbol == NIFTY index)
    const spotEntry = optionsChain.find((o) => o.symbol === NIFTY_INDEX || o.strike_price === -1 || o.strike_price === 0);
    const spot = spotEntry?.ltp ?? underlying;
    const target = Math.round(spot / 50) * 50;

    const ces = optionsChain.filter((o) => o.option_type === 'CE');
    const pes = optionsChain.filter((o) => o.option_type === 'PE');
    const atmCE = ces.reduce((b, o) => Math.abs(o.strike_price - target) < Math.abs((b?.strike_price ?? 1e9) - target) ? o : b, ces[0]);
    const atmPE = pes.reduce((b, o) => Math.abs(o.strike_price - target) < Math.abs((b?.strike_price ?? 1e9) - target) ? o : b, pes[0]);

    return new Response(JSON.stringify({
      success: true,
      source: 'fyers',
      underlying: spot,
      expiry,
      atmStrike: atmCE?.strike_price ?? target,
      ce: atmCE ? { symbol: atmCE.symbol, ltp: atmCE.ltp, oi: atmCE.oi, volume: atmCE.volume } : null,
      pe: atmPE ? { symbol: atmPE.symbol, ltp: atmPE.ltp, oi: atmPE.oi, volume: atmPE.volume } : null,
      ts: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('fyers-quote failed:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});