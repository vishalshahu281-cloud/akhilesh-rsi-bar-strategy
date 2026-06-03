import type { RSIDataPoint } from "@/lib/rsiTypes";
import { computeBarSignals } from "@/lib/tradingSignals";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Side = "CE" | "PE";

interface Trade {
  side: Side;
  strike: number;
  entryTime: string;
  entryNifty: number;
  entryPremium: number;
  exitTime?: string;
  exitNifty?: number;
  exitPremium?: number;
  exitReason?:
    | "STOP_NEG"
    | "TRAIL_35"
    | "TRAIL_80"
    | "CPSIG_EXIT"
    | "EOD_FLAT"
    | "OPEN";
  pnl?: number;
  peakPremium: number;
}

const ENTRY_PREMIUM = 50;     // Rs — paper-trading baseline for ATM
const ATM_DELTA = 0.5;        // option delta approximation for ATM
const TRAIL1_TRIGGER = 35;    // profit that arms trailing stop @ +35
const TRAIL2_TRIGGER = 80;    // profit that bumps trailing stop to +80

function atmStrike(price: number): number {
  return Math.round(price / 50) * 50;
}

function premium(side: Side, entryNifty: number, currentNifty: number): number {
  const move = (currentNifty - entryNifty) * ATM_DELTA;
  const px = side === "CE" ? ENTRY_PREMIUM + move : ENTRY_PREMIUM - move;
  return Math.max(0.05, px);
}

function addOneMinute(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m + 1);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** CALL/PUT signal table logic (mirrors CallPutSignalTable). */
type CPSig = "BULL" | "BEAR" | null;
function computeCPSignals(data: RSIDataPoint[]): CPSig[] {
  const out: CPSig[] = new Array(data.length).fill(null);
  for (let i = 1; i < data.length; i++) {
    const c = data[i], p = data[i - 1];
    if (c.rsi == null || p.rsi == null) continue;
    const rsiDiff = c.rsi - p.rsi;
    const barChange = c.niftyPrice - p.niftyPrice;
    if (rsiDiff >= 3.5 && barChange >= 20) out[i] = "BULL";
    else if (rsiDiff <= -3.5 && barChange <= -20) out[i] = "BEAR";
  }
  return out;
}

function runBacktest(data: RSIDataPoint[]): Trade[] {
  const signals = computeBarSignals(data);
  const cpSignals = computeCPSignals(data);
  const trades: Trade[] = [];
  let openCE: Trade | null = null;
  let openPE: Trade | null = null;

  const closeTrade = (
    t: Trade,
    exitBarIdx: number,
    reason: NonNullable<Trade["exitReason"]>,
    exitPx: number,
  ) => {
    const bar = data[exitBarIdx] ?? data[data.length - 1];
    t.exitTime = bar.time;
    t.exitNifty = bar.niftyPrice;
    t.exitPremium = exitPx;
    t.exitReason = reason;
    t.pnl = exitPx - t.entryPremium;
  };

  // Open a trade triggered at signal bar `sigIdx`. Entry candle = sigIdx+1.
  const openTrade = (side: Side, sigIdx: number): Trade | null => {
    const entryIdx = sigIdx + 1;
    if (entryIdx >= data.length) return null;
    const entryBar = data[entryIdx];
    return {
      side,
      strike: atmStrike(entryBar.niftyPrice),
      entryTime: entryBar.time,
      entryNifty: entryBar.niftyPrice,
      entryPremium: ENTRY_PREMIUM,
      peakPremium: ENTRY_PREMIUM,
      exitReason: "OPEN",
    };
  };

  // For each bar i, evaluate open trades against this bar's price, then
  // process triggers that fire at this bar (entry happens at i+1).
  for (let i = 0; i < data.length; i++) {
    const bar = data[i];

    for (const slot of ["CE", "PE"] as const) {
      const t = slot === "CE" ? openCE : openPE;
      if (!t) continue;
      // skip the entry bar itself
      const entryIdx = data.findIndex((d) => d.time === t.entryTime);
      if (i <= entryIdx) continue;

      const px = premium(t.side, t.entryNifty, bar.niftyPrice);
      if (px > t.peakPremium) t.peakPremium = px;
      const peakProfit = t.peakPremium - t.entryPremium;
      const profit = px - t.entryPremium;

      // Preference 1: never reached +35 and price goes negative → exit @ entry
      if (peakProfit < TRAIL1_TRIGGER && profit < 0) {
        closeTrade(t, i, "STOP_NEG", t.entryPremium);
        if (slot === "CE") openCE = null; else openPE = null;
        continue;
      }

      // Peak reached +80 → trailing stop locked at +80; exit only when price falls back below +80
      if (peakProfit >= TRAIL2_TRIGGER && profit < TRAIL2_TRIGGER) {
        closeTrade(t, i, "TRAIL_80", t.entryPremium + TRAIL2_TRIGGER);
        if (slot === "CE") openCE = null; else openPE = null;
        continue;
      }

      // In +35..+80 zone
      if (peakProfit >= TRAIL1_TRIGGER && peakProfit < TRAIL2_TRIGGER) {
        // Trailing stop locked at +35; exit only when price falls back below +35
        if (profit < TRAIL1_TRIGGER) {
          closeTrade(t, i, "TRAIL_35", t.entryPremium + TRAIL1_TRIGGER);
          if (slot === "CE") openCE = null; else openPE = null;
          continue;
        }
        // Preference 3: CALL/PUT signal table opposite signal → exit +1 min later
        // CE opposite = BEAR, PE opposite = BULL
        const opp: CPSig = t.side === "CE" ? "BEAR" : "BULL";
        // signal must have fired on some bar BEFORE i, with exit candle = sigBar+1 == i
        if (i - 1 >= 0 && cpSignals[i - 1] === opp) {
          closeTrade(t, i, "CPSIG_EXIT", px);
          if (slot === "CE") openCE = null; else openPE = null;
          continue;
        }
      }
    }

    // Trigger entries from this bar's events (entry executes at i+1 close)
    const s = signals[i];
    if (s) {
      for (const ev of s.events) {
        if (ev === "GREEN_TAKE" && !openCE) {
          const t = openTrade("CE", i);
          if (t) { openCE = t; trades.push(t); }
        } else if (ev === "RED_TAKE" && !openPE) {
          const t = openTrade("PE", i);
          if (t) { openPE = t; trades.push(t); }
        }
        // Note: opposite-LEAVE events are intentionally ignored per spec.
      }
    }
  }

  // End of data: flatten any still-open trade at entry (never reached +35)
  for (const t of [openCE, openPE]) {
    if (!t || t.pnl != null) continue;
    closeTrade(t, data.length - 1, "EOD_FLAT", t.entryPremium);
  }

  return trades;
}

function reasonLabel(r?: Trade["exitReason"]) {
  switch (r) {
    case "STOP_NEG": return "Stop @ Entry (−)";
    case "TRAIL_35": return "Trail +35";
    case "TRAIL_80": return "Trail +80";
    case "CPSIG_EXIT": return "CALL/PUT Sig";
    case "EOD_FLAT": return "Flat @ Entry";
    case "OPEN":
    default: return "Open";
  }
}

function reasonExplanation(r?: Trade["exitReason"]) {
  switch (r) {
    case "STOP_NEG":
      return "Peak profit never reached +35 and premium went negative — instant stop at entry price.";
    case "TRAIL_35":
      return "Peak profit reached +35; trailing stop locked at +35 and was hit on pullback.";
    case "TRAIL_80":
      return "Peak profit reached +80; trailing stop locked at +80 and was hit on pullback.";
    case "CPSIG_EXIT":
      return "Opposite CALL/PUT signal fired while peak was in +35–+80 zone — exited at +1 min after that signal.";
    case "EOD_FLAT":
      return "End of session reached; peak never hit +35 — flattened at entry price.";
    case "OPEN":
    default:
      return "Trade still open. Entry taken at the close of the +1 min candle after the Δ Bar / Δ RSI 21 trigger.";
  }
}

export default function OptionTradesTable({ data }: { data: RSIDataPoint[] }) {
  const trades = runBacktest(data);
  const closed = trades.filter((t) => t.pnl != null);
  const totalPnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses = closed.filter((t) => (t.pnl ?? 0) < 0).length;

  return (
    <div className="rounded-xl border border-border bg-card glow-primary overflow-hidden">
      <div className="p-4 md:p-6 pb-0 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Option Trades — Paper Backtest (ATM CE / PE)
          </h2>
          <p className="text-xs font-mono text-muted-foreground">
            Entry at close of +1 min candle after Δ Bar (≥±18) OR Δ RSI 21 (≥±3) • Premium base ₹{ENTRY_PREMIUM} • Δ≈{ATM_DELTA} • Stop @ entry if never +35 • Trail +35 → +80 • Opp. CALL/PUT signal exit in +35–+80 zone
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-lg bg-secondary">
            <span className="text-muted-foreground">Trades </span>
            <span className="text-foreground font-bold">{trades.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-secondary">
            <span className="text-bullish">W {wins}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-bearish">L {losses}</span>
          </div>
          <div className={`px-3 py-1.5 rounded-lg font-bold ${totalPnl >= 0 ? "bg-bullish/15 text-bullish" : "bg-bearish/15 text-bearish"}`}>
            P&amp;L {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="p-8 text-center font-mono text-sm text-muted-foreground">
          No option trades triggered yet — waiting for Δ Bar Change ≥ ±18 or Δ RSI 21 ≥ ±3.
        </div>
      ) : (
        <div className="max-h-[480px] overflow-auto mt-4">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card">Side</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">Strike</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card">Entry Time</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">Entry NIFTY</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">Entry ₹</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card">Exit Time</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">Exit ₹</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card">Reason</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card">Exit Explanation</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">P&amp;L ₹</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((t, i) => {
                const isCE = t.side === "CE";
                const pnl = t.pnl;
                return (
                  <TableRow key={i} className="border-border hover:bg-secondary/40 transition-colors">
                    <TableCell>
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-bold border ${isCE ? "bg-bullish/15 text-bullish border-bullish/30" : "bg-bearish/15 text-bearish border-bearish/30"}`}>
                        {t.side}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground text-right">{t.strike}</TableCell>
                    <TableCell className="font-mono text-sm text-foreground">{t.entryTime}</TableCell>
                    <TableCell className="font-mono text-sm text-foreground text-right">
                      {t.entryNifty.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground text-right">
                      {t.entryPremium.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {t.exitTime ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-foreground text-right">
                      {t.exitPremium != null ? t.exitPremium.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {reasonLabel(t.exitReason)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[280px] whitespace-normal leading-snug">
                      {reasonExplanation(t.exitReason)}
                    </TableCell>
                    <TableCell className={`font-mono text-sm text-right font-bold ${pnl == null ? "text-muted-foreground" : pnl >= 0 ? "text-bullish" : "text-bearish"}`}>
                      {pnl == null ? "—" : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
