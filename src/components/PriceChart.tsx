import type { RSIDataPoint } from "@/lib/rsiTypes";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const price = payload[0].value as number;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg font-mono">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-semibold text-primary">
        ₹{price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
};

export default function PriceChart({ data }: { data: RSIDataPoint[] }) {
  const prices = data.map((d) => d.niftyPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.15 || 10;
  const isPositive = prices[prices.length - 1] >= prices[0];
  const strokeColor = isPositive ? "hsl(152 60% 48%)" : "hsl(0 72% 55%)";
  const fillId = isPositive ? "priceGradientUp" : "priceGradientDown";

  return (
    <div className="rounded-xl border border-border bg-card p-4 md:p-6 glow-primary">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">NIFTY 50 — Price Action</h2>
        <span className={`text-xs font-mono ${isPositive ? "text-bullish" : "text-bearish"}`}>
          {isPositive ? "▲" : "▼"} {Math.abs(prices[prices.length - 1] - prices[0]).toFixed(2)} (
          {((Math.abs(prices[prices.length - 1] - prices[0]) / prices[0]) * 100).toFixed(2)}%)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 25% 15%)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: "hsl(222 25% 18%)" }} interval={11} />
          <YAxis domain={[Math.floor(minPrice - padding), Math.ceil(maxPrice + padding)]} tick={{ fill: "hsl(215 15% 50%)", fontSize: 11, fontFamily: "JetBrains Mono" }} tickLine={false} axisLine={{ stroke: "hsl(222 25% 18%)" }} tickFormatter={(v: number) => v.toLocaleString("en-IN")} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="niftyPrice" stroke={strokeColor} strokeWidth={2} fill={`url(#${fillId})`} dot={false} activeDot={{ r: 5, fill: strokeColor, stroke: "hsl(222 47% 6%)", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
