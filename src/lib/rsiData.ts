import type { RSIDataPoint } from "./rsiTypes";

function generateSessionTimes(intervalMinutes: number = 5): string[] {
  const times: string[] = [];
  let h = 9, m = 15;
  while (h < 15 || (h === 15 && m <= 30)) {
    times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += intervalMinutes;
    if (m >= 60) { m -= 60; h++; }
  }
  return times;
}

function getSignal(rsi: number): RSIDataPoint["signal"] {
  if (rsi >= 70) return "Overbought";
  if (rsi <= 30) return "Oversold";
  return "Neutral";
}

export function generateRSIData(seed = 42, intervalMinutes = 5): RSIDataPoint[] {
  const times = generateSessionTimes(intervalMinutes);
  const data: RSIDataPoint[] = [];

  let s = seed;
  const rand = () => { s = (s * 16807 + 7) % 2147483647; return s / 2147483647; };

  let rsi = 48 + rand() * 10;
  let price = 24150 + rand() * 200;

  for (const time of times) {
    const drift = (rand() - 0.48) * 4;
    rsi = Math.max(15, Math.min(85, rsi + drift));
    price += (rand() - 0.5) * 30;

    data.push({
      time,
      rsi: parseFloat(rsi.toFixed(2)),
      rsiMA: null,
      signal: getSignal(rsi),
      niftyPrice: parseFloat(price.toFixed(2)),
    });
  }

  for (let i = 0; i < data.length; i++) {
    if (i >= 20) {
      const slice = data.slice(i - 20, i + 1).map(d => d.rsi!);
      data[i].rsiMA = parseFloat((slice.reduce((s, v) => s + v, 0) / 21).toFixed(2));
    }
  }

  return data;
}
