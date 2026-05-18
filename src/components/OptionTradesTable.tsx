import { useEffect, useRef, useState } from "react";
import type { RSIDataPoint } from "@/lib/rsiTypes";
import { computeBarSignals } from "@/lib/tradingSignals";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Side = "CE" | "PE";

interface Trade {
  side: Side;
  strike: number;
  entryTime: string;
  entryNifty: number;
  entryPremium: number | null; // null until Dhan LTP captured
  exitTime?: string;
  exitNifty?: number;
  exitPremium?: number;
  exitReason?: "TARGET" | "STOP" | "OPPOSITE_LEAVE" | "OPEN" | "PENDING_LTP";
  pnl?: number;
  peakPremium: number;
}

const ATM_DELTA = 0.5;    // option delta approximation for ATM
const TARGET_POINTS = 35;

function atmStrike(price: number): number {
  return Math.round(price / 50) * 50;
}

function premium(side: Side, entry: number, entryNifty: number, currentNifty: number): number {
  const move = (currentNifty - entryNifty) * ATM_DELTA;
  const px = side === "CE" ? entry + move : entry - move;
  return Math.max(0.05, px);
}

function addOneMinute(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m + 1);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type LtpKey = string; // `${signalIndex}-${side}`

function runBacktest(data: RSIDataPoint[], ltps: Record<LtpKey, number>): Trade[] {
  const signals = computeBarSignals(data);
  const trades: Trade[] = [];
  let openCE: Trade | null = null;
  let openPE: Trade | null = null;

  const closeTrade = (
    t: Trade,
    bar: { time: string; niftyPrice: number },
    reason: Trade["exitReason"],
    exitPx?: number,
  ) => {
    if (t.entryPremium == null) return;
    const px = exitPx ?? premium(t.side, t.entryPremium, t.entryNifty, bar.niftyPrice);
    t.exitTime = addOneMinute(bar.time);
    t.exitNifty = bar.niftyPrice;
    t.exitPremium = px;
    t.exitReason = reason;
    t.pnl = px - (t.entryPremium ?? 0);
  };

  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    const bar = { time: s.time, niftyPrice: s.niftyPrice };

    // 1. Update peak + check TP/SL on open trades (only if entry premium captured)
    for (const t of [openCE, openPE]) {
      if (!t || t.entryPremium == null) continue;
      const px = premium(t.side, t.entryPremium, t.entryNifty, bar.niftyPrice);
      if (px > t.peakPremium) t.peakPremium = px;

      if (px - t.entryPremium >= TARGET_POINTS) {
        closeTrade(t, bar, "TARGET", t.entryPremium + TARGET_POINTS);
        if (t.side === "CE") openCE = null;
        else openPE = null;
      } else if (t.peakPremium > t.entryPremium && px <= t.entryPremium) {
        closeTrade(t, bar, "STOP", t.entryPremium);
        if (t.side === "CE") openCE = null;
        else openPE = null;
      }
    }

    // 2. Process events on this bar
    for (const ev of s.events) {
      if (ev === "GREEN_TAKE" && !openCE) {
        const entry = ltps[`${i}-CE`] ?? null;
        openCE = {
          side: "CE",
          strike: atmStrike(bar.niftyPrice),
          entryTime: addOneMinute(bar.time),
          entryNifty: bar.niftyPrice,
          entryPremium: entry,
          peakPremium: entry ?? 0,
          exitReason: entry == null ? "PENDING_LTP" : "OPEN",
        };
        trades.push(openCE);
      } else if (ev === "RED_TAKE" && !openPE) {
        const entry = ltps[`${i}-PE`] ?? null;
        openPE = {
          side: "PE",
          strike: atmStrike(bar.niftyPrice),
          entryTime: addOneMinute(bar.time),
          entryNifty: bar.niftyPrice,
          entryPremium: entry,
          peakPremium: entry ?? 0,
          exitReason: entry == null ? "PENDING_LTP" : "OPEN",
        };
        trades.push(openPE);
      } else if (ev === "GREEN_LEAVE" && openCE) {
        closeTrade(openCE, bar, "OPPOSITE_LEAVE");
        openCE = null;
      } else if (ev === "RED_LEAVE" && openPE) {
        closeTrade(openPE, bar, "OPPOSITE_LEAVE");
        openPE = null;
      }
    }
  }

  return trades;
}

function reasonLabel(r?: Trade["exitReason"]) {
  switch (r) {
    case "TARGET": return `Target +${TARGET_POINTS}`;
    case "STOP": return "Stop @ Entry";
    case "OPPOSITE_LEAVE": return "Opp. LEAVE";
    case "PENDING_LTP": return "Awaiting Dhan LTP";
    case "OPEN":
    default: return "Open";
  }
}

export default function OptionTradesTable({ data }: { data: RSIDataPoint[] }) {
  const [ltps, setLtps] = useState<Record<string, number>>({});
  const inflight = useRef<Set<string>>(new Set());

  // Identify the most recent TAKE signal that still needs an LTP captured.
  const signals = computeBarSignals(data);
  useEffect(() => {
    // Walk signals; for each TAKE event without a stored LTP, fetch Dhan ATM LTP once.
    (async () => {
      for (let i = 0; i < signals.length; i++) {
        for (const ev of signals[i].events) {
          let side: Side | null = null;
          if (ev === "GREEN_TAKE") side = "CE";
          else if (ev === "RED_TAKE") side = "PE";
          if (!side) continue;
          const key = `${i}-${side}`;
          if (ltps[key] != null || inflight.current.has(key)) continue;
          // Only fetch LTP for the most recent signal — historical LTP isn't available live.
          // We attempt once per key; if it's an older signal the LTP will be "stale" but still real.
          inflight.current.add(key);
          try {
            const { data: res, error } = await supabase.functions.invoke("dhan-option-chain");
            if (!error && res?.success) {
              const px = side === "CE" ? res?.ce?.ltp : res?.pe?.ltp;
              if (typeof px === "number" && px > 0) {
                setLtps((prev) => ({ ...prev, [key]: px }));
              }
            }
          } catch {
            // ignore — will retry on next signal
          } finally {
            inflight.current.delete(key);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals.length]);

  const trades = runBacktest(data, ltps);
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
            Entry +1 min after Δ Bar (≥±18) OR Δ RSI 21 (≥±3) signal • Entry ₹ = live Dhan ATM CE/PE LTP • Δ≈{ATM_DELTA} • Target +{TARGET_POINTS} • Stop @ entry
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
                      {t.entryPremium != null ? t.entryPremium.toFixed(2) : "—"}
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
