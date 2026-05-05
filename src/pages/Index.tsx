import { useState } from "react";
import { useRSIData } from "@/hooks/useRSIData";
import RSIChart from "@/components/RSIChart";
import PriceChart from "@/components/PriceChart";
import RSITable from "@/components/RSITable";
import CallPutSignalTable from "@/components/CallPutSignalTable";
import OptionTradesTable from "@/components/OptionTradesTable";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [intervalMinutes, setIntervalMinutes] = useState<3 | 5>(5);
  const { data, date, loading, error, lastRefresh, usingFallback, refresh } = useRSIData(60000, intervalMinutes);

  const validRSI = data.filter((d) => d.rsi != null);
  const latest = validRSI.length > 0 ? validRSI[validRSI.length - 1] : null;
  const highest = validRSI.length > 0 ? Math.max(...validRSI.map((d) => d.rsi!)) : 0;
  const lowest = validRSI.length > 0 ? Math.min(...validRSI.map((d) => d.rsi!)) : 0;
  const avg = validRSI.length > 0 ? validRSI.reduce((s, d) => s + d.rsi!, 0) / validRSI.length : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${usingFallback ? "bg-overbought" : "bg-bullish"} animate-pulse`} />
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              NIFTY 50 <span className="text-primary">RSI Monitor</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
              <button onClick={() => setIntervalMinutes(3)} className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${intervalMinutes === 3 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>3 min</button>
              <button onClick={() => setIntervalMinutes(5)} className={`px-3 py-1 text-xs font-mono rounded-md transition-colors ${intervalMinutes === 5 ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>5 min</button>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span>MA: 21</span>
              <span className="text-border">|</span>
              <span>{date || "Loading..."}</span>
              <span className="text-border">|</span>
              {usingFallback ? (
                <span className="flex items-center gap-1 text-overbought">
                  <WifiOff className="w-3 h-3" /> Simulated
                </span>
              ) : (
                <span className="flex items-center gap-1 text-bullish">
                  <Wifi className="w-3 h-3" /> Live
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="h-7 px-2 text-xs font-mono">
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-overbought/30 bg-overbought/5 px-4 py-2 text-xs font-mono text-overbought">
            {error}
          </div>
        )}

        {lastRefresh && (
          <div className="text-xs font-mono text-muted-foreground text-right">
            Last updated: {lastRefresh.toLocaleTimeString("en-IN")} • Auto-refresh: 60s • Interval: {intervalMinutes}min
          </div>
        )}

        {latest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Latest RSI", value: latest.rsi?.toFixed(2) ?? "—", color: (latest.rsi ?? 50) >= 70 ? "text-overbought" : (latest.rsi ?? 50) <= 30 ? "text-bullish" : "text-primary" },
              { label: "Session High", value: highest.toFixed(2), color: "text-overbought" },
              { label: "Session Low", value: lowest.toFixed(2), color: "text-bullish" },
              { label: "Average", value: avg.toFixed(2), color: "text-foreground" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-1">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{stat.label}</span>
                <span className={`text-2xl font-mono font-bold ${stat.color}`}>{stat.value}</span>
              </div>
            ))}
          </div>
        )}

        {loading && data.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-16 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-primary animate-spin mr-3" />
            <span className="font-mono text-muted-foreground">Fetching NIFTY 50 data ({intervalMinutes}min)...</span>
          </div>
        )}

        {data.length > 0 && <PriceChart data={data} />}
        {data.length > 0 && <RSIChart data={data} />}
        {data.length > 0 && <CallPutSignalTable data={data} />}
        {data.length > 0 && <RSITable data={data} />}
        {data.length > 0 && <OptionTradesTable data={data} />}
      </main>

      <footer className="border-t border-border py-4 text-center text-xs font-mono text-muted-foreground">
        {usingFallback ? "Simulated data" : `Live data for ${date}`} • RSI MA length 21 • {intervalMinutes}min candles • Auto-refresh every 60s
      </footer>
    </div>
  );
};

export default Index;
