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
  rsiDelta: number | null;
  events: SignalEvent[];
}

/**
 * Combined signals: a TAKE/LEAVE fires when EITHER
 *   |Δ Bar Change| >= 18   OR   |Δ RSI 21| >= 3
 * Δ Bar Change = (current bar change) + (previous bar change)
 * Δ RSI 21     = (current RSI bracket) + (previous RSI bracket)
 * Independent green/red state machines.
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
      barChange != null ? barChange + (prevBarChange ?? 0) : null;
    const currRsiBracket =
      row.rsi != null && prev?.rsi != null ? row.rsi - prev.rsi : null;
    const prevRsiBracket =
      prev?.rsi != null && prev2?.rsi != null ? prev.rsi - prev2.rsi : null;
    const rsiDelta =
      currRsiBracket != null
        ? currRsiBracket + (prevRsiBracket ?? 0)
        : null;

    const greenTrigger =
      (delta != null && delta >= 18) || (rsiDelta != null && rsiDelta >= 3);
    const redTrigger =
      (delta != null && delta <= -18) || (rsiDelta != null && rsiDelta <= -3);

    const events: SignalEvent[] = [];
    if (greenTrigger && !greenActive) {
      events.push("GREEN_TAKE");
      greenActive = true;
    } else if (greenActive && redTrigger) {
      events.push("GREEN_LEAVE");
      greenActive = false;
    }
    if (redTrigger && !redActive) {
      events.push("RED_TAKE");
      redActive = true;
    } else if (redActive && greenTrigger) {
      events.push("RED_LEAVE");
      redActive = false;
    }

    out.push({
      index: i,
      time: row.time,
      niftyPrice: row.niftyPrice,
      delta,
      rsiDelta,
      events,
    });
  }

  return out;
}
