import type { RSIDataPoint } from "@/lib/rsiTypes";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const rsi = payload[0].value as number;
  const signal = rsi >= 70 ? "Overbought" : rsi <= 30 ? "Oversold" : "Neutral";
  const colorClass = signal === "Overbought" ? "text-overbought" : signal === "Oversold" ? "text-bullish" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg font-mono">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm font-semibold ${colorClass}`}>RSI: {rsi.toFixed(2)}</p>
      <p className="text-xs text-muted-foreground">{signal}</p>
    </div>
  );
};

export default function RSIChart({ data }: { data: RSIDataPoint[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-6 glow-primary">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">RSI (MA 21) — Session Chart</h2>
        <div className="flex gap-3 text-xs font-mono flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(187 80% 50%)" }} />RSI</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "hsl(0 0% 100%)" }} />RSI MA (21)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-overbought" />Overbought (≥70)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-bullish" />Oversold (≤30)</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 25% 15%)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: "hsl(222 25% 18%)" }} interval={11} />
          <YAxis domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: "hsl(222 25% 18%)" }} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={70} stroke="hsl(35 90% 55%)" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "70", position: "right", fill: "hsl(35 90% 55%)", fontSize: 11, fontFamily: "JetBrains Mono" }} />
          <ReferenceLine y={30} stroke="hsl(152 60% 48%)" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "30", position: "right", fill: "hsl(152 60% 48%)", fontSize: 11, fontFamily: "JetBrains Mono" }} />
          <ReferenceLine y={50} stroke="hsl(222 25% 22%)" strokeDasharray="2 4" strokeWidth={1} />
          <Line type="monotone" dataKey="rsi" stroke="hsl(187 80% 50%)" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: "hsl(187 80% 50%)", stroke: "hsl(222 47% 6%)", strokeWidth: 2 }} className="glow-line" />
          <Line type="monotone" dataKey="rsiMA" stroke="hsl(0 0% 100%)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 4, fill: "hsl(0 0% 100%)", stroke: "hsl(222 47% 6%)", strokeWidth: 2 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
