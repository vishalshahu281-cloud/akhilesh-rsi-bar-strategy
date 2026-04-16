import { corsHeaders } from '@supabase/supabase-js/cors'

function calculateRSI(closes: number[], period: number): number[] {
  const rsiValues: number[] = [];
  if (closes.length < period + 1) return rsiValues;

  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? Math.abs(diff) : 0);
  }

  let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period;

  for (let i = 0; i < period; i++) rsiValues.push(NaN);

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiValues.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiValues.push(avgLoss === 0 ? 100 : parseFloat((100 - 100 / (1 + rs)).toFixed(2)));
  }

  return rsiValues;
}

function calculateRSISmoothedMA(rsiValues: number[], period: number): (number | null)[] {
  const maValues: (number | null)[] = [];
  const validBuffer: number[] = [];
  
  for (let i = 0; i < rsiValues.length; i++) {
    if (isNaN(rsiValues[i])) {
      maValues.push(null);
      continue;
    }
    validBuffer.push(rsiValues[i]);
    if (validBuffer.length >= period) {
      const sum = validBuffer.slice(-period).reduce((s, v) => s + v, 0);
      maValues.push(parseFloat((sum / period).toFixed(2)));
    } else {
      maValues.push(null);
    }
  }
  return maValues;
}

function aggregateCandles(
  timestamps: number[],
  closes: number[],
  intervalMinutes: number,
  gmtOffset: number
): { timestamps: number[]; closes: number[] } {
  if (intervalMinutes <= 1) return { timestamps, closes };
  
  const buckets = new Map<number, { ts: number; close: number }>();
  
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue;
    const ts = timestamps[i];
    const date = new Date((ts + gmtOffset) * 1000);
    const h = date.getUTCHours();
    const m = date.getUTCMinutes();
    const totalMin = h * 60 + m;
    const bucketMin = Math.floor(totalMin / intervalMinutes) * intervalMinutes;
    const bucketKey = Math.floor(ts / 86400) * 86400 + bucketMin * 60;
    buckets.set(bucketKey, { ts, close: closes[i] });
  }
  
  const sorted = [...buckets.values()].sort((a, b) => a.ts - b.ts);
  return {
    timestamps: sorted.map(s => s.ts),
    closes: sorted.map(s => s.close),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let intervalMinutes = 5;
    const url = new URL(req.url);
    const intervalParam = url.searchParams.get('interval');
    if (intervalParam) {
      const parsed = parseInt(intervalParam, 10);
      if (parsed === 3 || parsed === 5) intervalMinutes = parsed;
    }

    const yahooInterval = intervalMinutes === 3 ? '1m' : '5m';
    const yahooRange = intervalMinutes === 3 ? '1d' : '5d';
    
    const symbol = '%5ENSEI';
    const fetchUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${yahooInterval}&range=${yahooRange}&includePrePost=false`;

    console.log(`Fetching NIFTY 50 data: interval=${yahooInterval}, range=${yahooRange}`);

    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Yahoo Finance error:', response.status, text);
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      throw new Error('No data returned from Yahoo Finance');
    }

    let rawTimestamps: number[] = result.timestamp || [];
    let rawCloses: number[] = result.indicators?.quote?.[0]?.close || [];
    const gmtOffset = result.meta?.gmtoffset || 19800;

    let timestamps: number[];
    let closes: number[];
    if (intervalMinutes === 3) {
      const agg = aggregateCandles(rawTimestamps, rawCloses, 3, gmtOffset);
      timestamps = agg.timestamps;
      closes = agg.closes;
    } else {
      timestamps = rawTimestamps;
      closes = rawCloses;
    }

    const sessionData: { time: string; close: number; timestamp: number }[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      const ts = timestamps[i];
      const date = new Date((ts + gmtOffset) * 1000);
      const utcHours = date.getUTCHours();
      const utcMinutes = date.getUTCMinutes();
      const totalMinutes = utcHours * 60 + utcMinutes;

      if (totalMinutes >= 555 && totalMinutes <= 930) {
        const timeStr = `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}`;
        sessionData.push({ time: timeStr, close: closes[i], timestamp: ts });
      }
    }

    const allValidCloses = closes.filter((c) => c != null);
    const rsiAll = calculateRSI(allValidCloses, 21);
    const rsiMAAll = calculateRSISmoothedMA(rsiAll, 21);

    let validIndex = 0;
    const rsiMap = new Map<number, number>();
    const rsiMAMap = new Map<number, number | null>();
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null) {
        if (validIndex < rsiAll.length) {
          rsiMap.set(timestamps[i], rsiAll[validIndex]);
          rsiMAMap.set(timestamps[i], validIndex < rsiMAAll.length ? rsiMAAll[validIndex] : null);
        }
        validIndex++;
      }
    }

    const dateGroups = new Map<string, typeof sessionData>();
    for (const item of sessionData) {
      const date = new Date((item.timestamp + gmtOffset) * 1000);
      const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
      if (!dateGroups.has(dateStr)) dateGroups.set(dateStr, []);
      dateGroups.get(dateStr)!.push(item);
    }

    const sortedDates = [...dateGroups.keys()].sort();
    const latestDate = sortedDates[sortedDates.length - 1];
    const todayData = dateGroups.get(latestDate) || [];

    const output = todayData.map((item) => {
      const rsi = rsiMap.get(item.timestamp);
      const rsiVal = rsi != null && !isNaN(rsi) ? rsi : null;
      const rsiMA = rsiMAMap.get(item.timestamp) ?? null;
      const signal = rsiVal == null ? 'N/A' : rsiVal >= 70 ? 'Overbought' : rsiVal <= 30 ? 'Oversold' : 'Neutral';

      return {
        time: item.time,
        niftyPrice: parseFloat(item.close.toFixed(2)),
        rsi: rsiVal,
        rsiMA,
        signal,
      };
    });

    console.log(`Returning ${output.length} data points for ${latestDate} (${intervalMinutes}min)`);

    return new Response(
      JSON.stringify({
        success: true,
        date: latestDate,
        interval: intervalMinutes,
        dataPoints: output.length,
        data: output,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching NIFTY data:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
