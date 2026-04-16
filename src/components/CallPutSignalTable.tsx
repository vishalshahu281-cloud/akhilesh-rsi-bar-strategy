import type { RSIDataPoint } from "@/lib/rsiTypes";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface SignalRow {
  time: string;
  niftyPrice: number;
  rsiDiff: number;
  barChange: number;
  callSignal: "ENTRY" | "EXIT" | "—";
  putSignal: "ENTRY" | "EXIT" | "—";
}

function computeSignals(data: RSIDataPoint[]): SignalRow[] {
  const signals: SignalRow[] = [];

  for (let i = 1; i < data.length; i++) {
    const curr = data[i];
    const prev = data[i - 1];
    if (curr.rsi == null || prev.rsi == null) continue;

    const rsiDiff = curr.rsi - prev.rsi;
    const barChange = curr.niftyPrice - prev.niftyPrice;

    // CALL ENTRY / PUT EXIT: RSI diff >= +3.5 AND Bar change >= +20.00
    // CALL EXIT / PUT ENTRY: RSI diff <= -3.5 AND Bar change <= -20.00
    const isBullish = rsiDiff >= 3.5 && barChange >= 20.0;
    const isBearish = rsiDiff <= -3.5 && barChange <= -20.0;

    let callSignal: SignalRow["callSignal"] = "—";
    let putSignal: SignalRow["putSignal"] = "—";

    if (isBullish) {
      callSignal = "ENTRY";
      putSignal = "EXIT";
    } else if (isBearish) {
      callSignal = "EXIT";
      putSignal = "ENTRY";
    }

    if (callSignal !== "—" || putSignal !== "—") {
      signals.push({
        time: curr.time,
        niftyPrice: curr.niftyPrice,
        rsiDiff,
        barChange,
        callSignal,
        putSignal,
      });
    }
  }

  return signals;
}

function signalBadge(signal: "ENTRY" | "EXIT" | "—", type: "call" | "put") {
  if (signal === "—") return <span className="text-muted-foreground font-mono text-xs">—</span>;

  const isEntry = signal === "ENTRY";
  const bgClass = isEntry
    ? type === "call"
      ? "bg-bullish/15 text-bullish border-bullish/30"
      : "bg-bearish/15 text-bearish border-bearish/30"
    : type === "call"
      ? "bg-bearish/15 text-bearish border-bearish/30"
      : "bg-bullish/15 text-bullish border-bullish/30";

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${bgClass}`}>
      {isEntry ? "▶" : "◼"} {signal}
    </span>
  );
}

export default function CallPutSignalTable({ data }: { data: RSIDataPoint[] }) {
  const signals = computeSignals(data);

  return (
    <div className="rounded-xl border border-border bg-card glow-primary overflow-hidden">
      <div className="p-4 md:p-6 pb-0">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          CALL / PUT Signal Table
        </h2>
        <p className="text-xs font-mono text-muted-foreground mb-4">
          ENTRY when RSI(21) diff ≥ ±3.5 &amp; Bar Change ≥ ±20.00
        </p>
      </div>

      {signals.length === 0 ? (
        <div className="p-8 text-center font-mono text-sm text-muted-foreground">
          No CALL/PUT signals generated in this session yet.
        </div>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card">Time</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">NIFTY 50</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">RSI Diff</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-right">Bar Change</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-center">CALL</TableHead>
                <TableHead className="font-mono text-xs text-muted-foreground sticky top-0 bg-card text-center">PUT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.map((row) => (
                <TableRow key={row.time} className="border-border hover:bg-secondary/40 transition-colors">
                  <TableCell className="font-mono text-sm text-foreground">{row.time}</TableCell>
                  <TableCell className="font-mono text-sm text-foreground text-right">
                    {row.niftyPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className={`font-mono text-sm text-right font-semibold ${row.rsiDiff >= 0 ? "text-bullish" : "text-bearish"}`}>
                    {row.rsiDiff >= 0 ? "+" : ""}{row.rsiDiff.toFixed(2)}
                  </TableCell>
                  <TableCell className={`font-mono text-sm text-right font-semibold ${row.barChange >= 0 ? "text-bullish" : "text-bearish"}`}>
                    {row.barChange >= 0 ? "+" : ""}{row.barChange.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    {signalBadge(row.callSignal, "call")}
                  </TableCell>
                  <TableCell className="text-center">
                    {signalBadge(row.putSignal, "put")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
