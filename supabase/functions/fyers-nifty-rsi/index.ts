const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FYERS_HISTORY_URL = 'https://api-t1.fyers.in/data/history';
const NIFTY_SYMBOL = 'NSE:NIFTY50-INDEX';
// IST = UTC + 5:30
const IST_OFFSET_SEC = 19800;

function calculateRSI(closes: number[], period: number): number[] {
  const out: number[] = [];
  if (closes.length < period + 1) return out;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  let avgG = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let avgL = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = 0; i < period; i++) out.push(NaN);
  const rs0 = avgL === 0 ? 100 : avgG / avgL;
  out.push(avgL === 0 ? 100 : 100 - 100 / (1 + rs0));
  for (let i = period; i < gains.length; i++) {
    avgG = (avgG * (period - 1) + gains[i]) / period;
    avgL = (avgL * (period - 1) + losses[i]) / period;
    const rs = avgL === 0 ? 100 : avgG / avgL;
    out.push(parseFloat((avgL === 0 ? 100 : 100 - 100 / (1 + rs)).toFixed(2)));
  }
  return out;
}

function calculateRSI_MA(rsi: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  const buf: number[] = [];
  for (const v of rsi) {
    if (isNaN(v)) { out.push(null); continue; }
    buf.push(v);
    if (buf.length >= period) {
      const sum = buf.slice(-period).reduce((s, x) => s + x, 0);
      out.push(parseFloat((sum / period).toFixed(2)));
    } else out.push(null);
  }
  return out;
}

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const APP_ID = Deno.env.get('FYERS_APP_ID');
    const TOKEN = Deno.env.get('FYERS_ACCESS_TOKEN');
    if (!APP_ID || !TOKEN) throw new Error('FYERS credentials not configured');

    const url = new URL(req.url);
    let interval = parseInt(url.searchParams.get('interval') ?? '5', 10);
    if (interval !== 3 && interval !== 5) interval = 5;

    // Pull 5 IST trading days to ensure coverage even on holidays/weekends
    const nowIst = new Date(Date.now() + IST_OFFSET_SEC * 1000);
    const from = new Date(nowIst.getTime() - 7 * 86400 * 1000);
    const params = new URLSearchParams({
      symbol: NIFTY_SYMBOL,
      resolution: String(interval),
      date_format: '1',
      range_from: fmtDate(from),
      range_to: fmtDate(nowIst),
      cont_flag: '1',
    });

    const res = await fetch(`${FYERS_HISTORY_URL}?${params}`, {
      headers: { Authorization: `${APP_ID}:${TOKEN}` },
    });
    const json = await res.json();
    if (!res.ok || json.s !== 'ok') {
      console.error('FYERS history error:', res.status, JSON.stringify(json).slice(0, 300));
      throw new Error(`FYERS history ${res.status}: ${json.message ?? json.s ?? 'unknown'}`);
    }

    const candles: number[][] = json.candles ?? [];
    if (candles.length === 0) throw new Error('FYERS returned no candles');

    const timestamps = candles.map((c) => c[0]);
    const closes = candles.map((c) => c[4]);

    const rsiAll = calculateRSI(closes, 21);
    const rsiMaAll = calculateRSI_MA(rsiAll, 21);

    // Group by IST date, return latest day's session bars
    const byDate = new Map<string, { time: string; ts: number; close: number; idx: number }[]>();
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const ist = new Date((ts + IST_OFFSET_SEC) * 1000);
      const h = ist.getUTCHours();
      const m = ist.getUTCMinutes();
      const totalMin = h * 60 + m;
      // 09:15 - 15:30 IST
      if (totalMin < 555 || totalMin > 930) continue;
      const dateStr = fmtDate(ist);
      const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      if (!byDate.has(dateStr)) byDate.set(dateStr, []);
      byDate.get(dateStr)!.push({ time, ts, close: closes[i], idx: i });
    }

    const dates = [...byDate.keys()].sort();
    const latest = dates[dates.length - 1];
    const todayBars = byDate.get(latest) ?? [];

    const output = todayBars.map((b) => {
      const rsi = rsiAll[b.idx];
      const rsiVal = rsi != null && !isNaN(rsi) ? rsi : null;
      const rsiMA = rsiMaAll[b.idx] ?? null;
      const signal = rsiVal == null ? 'N/A' : rsiVal >= 70 ? 'Overbought' : rsiVal <= 30 ? 'Oversold' : 'Neutral';
      return {
        time: b.time,
        niftyPrice: parseFloat(b.close.toFixed(2)),
        rsi: rsiVal,
        rsiMA,
        signal,
      };
    });

    console.log(`FYERS NIFTY: ${output.length} bars on ${latest} (interval=${interval})`);

    return new Response(JSON.stringify({
      success: true,
      source: 'fyers',
      date: latest,
      interval,
      dataPoints: output.length,
      data: output,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('fyers-nifty-rsi failed:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});