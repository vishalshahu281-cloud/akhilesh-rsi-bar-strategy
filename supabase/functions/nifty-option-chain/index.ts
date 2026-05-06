const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NSE_BASE = 'https://www.nseindia.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function nseFetch(symbol: string) {
  const baseHeaders: Record<string, string> = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${NSE_BASE}/option-chain`,
  };

  // 1. Warm up to capture cookies
  const warm = await fetch(`${NSE_BASE}/option-chain`, { headers: baseHeaders });
  await warm.text();
  const cookie = warm.headers.get('set-cookie') ?? '';

  // 2. Hit the JSON endpoint with the cookie
  const res = await fetch(
    `${NSE_BASE}/api/option-chain-indices?symbol=${encodeURIComponent(symbol)}`,
    { headers: { ...baseHeaders, Cookie: cookie } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`NSE ${res.status}: ${body.slice(0, 200)}`);
  }
  return await res.json();
}

function nearestStrike(strikes: number[], target: number): number {
  let best = strikes[0];
  let bestDiff = Math.abs(strikes[0] - target);
  for (const s of strikes) {
    const d = Math.abs(s - target);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  return best;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const symbol = (url.searchParams.get('symbol') ?? 'NIFTY').toUpperCase();
    const strikeParam = url.searchParams.get('strike');

    const data = await nseFetch(symbol);
    const records = data?.records;
    const underlying: number = records?.underlyingValue ?? 0;
    const allRows: any[] = records?.data ?? [];

    // Group nearest expiry only
    const expiry: string = records?.expiryDates?.[0] ?? '';
    const rows = allRows.filter((r) => r.expiryDate === expiry);
    const strikes = rows.map((r) => r.strikePrice as number).sort((a, b) => a - b);
    const target = strikeParam ? Number(strikeParam) : Math.round(underlying / 50) * 50;
    const atm = nearestStrike(strikes, target);
    const row = rows.find((r) => r.strikePrice === atm);

    return new Response(
      JSON.stringify({
        success: true,
        symbol,
        underlying,
        expiry,
        atmStrike: atm,
        ce: row?.CE
          ? { ltp: row.CE.lastPrice, bid: row.CE.bidprice, ask: row.CE.askPrice, oi: row.CE.openInterest }
          : null,
        pe: row?.PE
          ? { ltp: row.PE.lastPrice, bid: row.PE.bidprice, ask: row.PE.askPrice, oi: row.PE.openInterest }
          : null,
        ts: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, // keep 200 so the client sees the error payload, not a fetch error
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});