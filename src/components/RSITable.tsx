import type { RSIDataPoint } from "@/lib/rsiTypes";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function RSITable({ data }: { data: RSIDataPoint[] }) {
  // Pre-compute Δ Bar Change signals row-by-row using a state machine.
  // - When diff >= +18 and we are not currently in a green-TAKE state -> "TAKE" (green)
  // - While green-TAKE is active, show "-" until diff <= -18 -> then "LEAVE" (green)
  // - When diff <= -18 and we are not currently in a red-TAKE state -> "TAKE" (red)
  // - While red-TAKE is active, show "-" until diff >= +18 -> then "LEAVE" (red)
  // If both a green and red event collide on the same row, stack them vertically.
  type Tag = { label: "TAKE" | "LEAVE" | "-"; color: "green" | "red" | "muted" };
  const signals: Tag[][] = [];
  const deltas: (number | null)[] = [];
  const calcs: (string | null)[] = [];
  let greenActive = false; // long/CALL-style position open
  let redActive = false;   // short/PUT-style position open

  // Bar change per row = niftyPrice[i] - niftyPrice[i-1]
  const barChanges: (number | null)[] = data.map((row, i) =>
    i > 0 ? row.niftyPrice - data[i - 1].niftyPrice : null
  );

  for (let i = 0; i < data.length; i++) {
    // Δ Bar Change = barChange[i] - barChange[i-1]
    const curBC = barChanges[i];
    const prevBC = i > 0 ? barChanges[i - 1] : null;
    const diff = curBC != null && prevBC != null ? Math.round(curBC - prevBC) : null;
    deltas.push(diff);
    if (curBC != null && prevBC != null) {
      const a = Math.round(curBC);
      const b = Math.round(prevBC);
      calcs.push(`${a} − (${b}) = ${a - b}`);
    } else {
      calcs.push(null);
    }
    const tags: Tag[] = [];

    if (diff == null) {
      tags.push({ label: "-", color: "muted" });
    } else {
      // Green side
      if (diff >= 18 && !greenActive) {
        tags.push({ label: "TAKE", color: "green" });
        greenActive = true;
      } else if (greenActive && diff <= -18) {
        tags.push({ label: "LEAVE", color: "green" });
        greenActive = false;
      }

      // Red side
      if (diff <= -18 && !redActive) {
        tags.push({ label: "TAKE", color: "red" });
        redActive = true;
      } else if (redActive && diff >= 18) {
        tags.push({ label: "LEAVE", color: "red" });
        redActive = false;
      }

      if (tags.length === 0) tags.push({ label: "-", color: "muted" });
    }

    signals.push(tags);
  }

  return (
    <div className="rounded-xl border border-border bg-card glow-primary overflow-hidden">
      <div className="p-4 md:p-6 pb-0">
        <h2 className="text-lg font-semibold text-foreground mb-4">Session Data — 9:15 to 15:30</h2>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card">Time</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">NIFTY 50</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">Bar Change</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">RSI (21)</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">RSI MA (21)</TableHead>
              <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-center">Δ Bar Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => {
              const prevRow = idx > 0 ? data[idx - 1] : null;
              const rsiDiff = row.rsi != null && prevRow?.rsi != null ? row.rsi - prevRow.rsi : null;
              const barChange = prevRow ? row.niftyPrice - prevRow.niftyPrice : null;
              const tags = signals[idx];
              const delta = deltas[idx];
              const calc = calcs[idx];

              return (
                <TableRow key={row.time} className="border-border hover:bg-secondary/40 transition-colors">
                  <TableCell className="font-mono text-sm text-foreground">{row.time}</TableCell>
                  <TableCell className="font-mono text-sm text-foreground text-right">
                    {row.niftyPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className={`font-mono text-sm text-right ${barChange != null ? (barChange >= 0 ? "text-bullish" : "text-bearish") : "text-muted-foreground"}`}>
                    {barChange != null ? `${barChange >= 0 ? "+" : ""}${Math.round(barChange)}` : "—"}
                  </TableCell>
                  <TableCell className={`font-mono text-sm text-right font-semibold ${(row.rsi ?? 0) >= 70 ? "text-overbought" : (row.rsi ?? 0) <= 30 ? "text-bullish" : "text-foreground"}`}>
                    {row.rsi != null ? row.rsi.toFixed(2) : "—"}
                    {rsiDiff != null && (
                      <span className={`ml-1.5 text-xs font-normal ${rsiDiff > 0 ? "text-bullish" : rsiDiff < 0 ? "text-bearish" : "text-muted-foreground"}`}>
                        ({rsiDiff > 0 ? "+" : ""}{rsiDiff.toFixed(2)})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-right text-foreground">
                    {row.rsiMA != null ? row.rsiMA.toFixed(2) : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span
                        className={`font-mono text-xs ${
                          delta == null
                            ? "text-muted-foreground"
                            : delta > 0
                            ? "text-bullish"
                            : delta < 0
                            ? "text-bearish"
                            : "text-foreground"
                        }`}
                      >
                        {calc ?? "—"}
                      </span>
                      {tags.map((t, i) => (
                        <span
                          key={i}
                          className={`font-mono text-xs font-semibold ${
                            t.color === "green"
                              ? "text-bullish"
                              : t.color === "red"
                              ? "text-bearish"
                              : "text-muted-foreground"
                          }`}
                        >
                          {t.label}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
