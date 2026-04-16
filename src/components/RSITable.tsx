import type { RSIDataPoint } from "@/lib/rsiTypes";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

function signalStyle(signal: RSIDataPoint["signal"]) {
  switch (signal) {
    case "Overbought": return "text-overbought bg-overbought/10 border-overbought/20";
    case "Oversold": return "text-bullish bg-bullish/10 border-bullish/20";
    default: return "text-muted-foreground bg-muted/50 border-border";
  }
}

export default function RSITable({ data }: { data: RSIDataPoint[] }) {
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
              <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-center">Signal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, idx) => {
              const prevRow = idx > 0 ? data[idx - 1] : null;
              const rsiDiff = row.rsi != null && prevRow?.rsi != null ? row.rsi - prevRow.rsi : null;
              const barChange = prevRow ? row.niftyPrice - prevRow.niftyPrice : null;

              return (
                <TableRow key={row.time} className="border-border hover:bg-secondary/40 transition-colors">
                  <TableCell className="font-mono text-sm text-foreground">{row.time}</TableCell>
                  <TableCell className="font-mono text-sm text-foreground text-right">
                    {row.niftyPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className={`font-mono text-sm text-right ${barChange != null ? (barChange >= 0 ? "text-bullish" : "text-bearish") : "text-muted-foreground"}`}>
                    {barChange != null ? `${barChange >= 0 ? "+" : ""}${barChange.toFixed(2)}` : "—"}
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
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${signalStyle(row.signal)}`}>
                      {row.signal}
                    </span>
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
