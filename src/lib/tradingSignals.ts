import type { RSIDataPoint } from "@/lib/rsiTypes";

export type SignalEvent =
  | "GREEN_TAKE"
  | "GREEN_LEAVE"
  | "RED_TAKE"
  | "RED_LEAVE";

export interface BarSignal {
  index: number;
  time: string;
  niftyPrice: number;
  delta: number | null;
  events: SignalEvent[];
}

/**
 * Δ Bar Change = (current bar change) + (previous bar change)
 * State machine:
 *  - GREEN_TAKE when delta >= +18 and green not active
 *  - GREEN_LEAVE when green active and delta <= -18
 *  - RED_TAKE when delta <= -18 and red not active
 *  - RED_LEAVE when red active and delta >= +18
 */
export function computeBarSignals(data: RSIDataPoint[]): BarSignal[] {
  const out: BarSignal[] = [];
  let greenActive = false;
  let redActive = false;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const prev = i > 0 ? data[i - 1] : null;
    const prev2 = i > 1 ? data[i - 2] : null;
    const barChange = prev ? row.niftyPrice - prev.niftyPrice : null;
    const prevBarChange =
      prev && prev2 ? prev.niftyPrice - prev2.niftyPrice : null;
    const delta =
      barChange != null && prevBarChange != null
        ? barChange + prevBarChange
        : null;

    const events: SignalEvent[] = [];
    if (delta != null) {
      if (delta >= 18 && !greenActive) {
        events.push("GREEN_TAKE");
        greenActive = true;
      } else if (greenActive && delta <= -18) {
        events.push("GREEN_LEAVE");
        greenActive = false;
      }
      if (delta <= -18 && !redActive) {
        events.push("RED_TAKE");
        redActive = true;
      } else if (redActive && delta >= 18) {
        events.push("RED_LEAVE");
        redActive = false;
      }
    }

    out.push({
      index: i,
      time: row.time,
      niftyPrice: row.niftyPrice,
      delta,
      events,
    });
  }

  return out;
}
