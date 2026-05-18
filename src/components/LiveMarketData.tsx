import { useEffect, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Wifi, WifiOff } from "lucide-react";

interface Tick {
  securityId: number;
  ltp: number;
  ltt?: number;
  ts: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// NIFTY 50 index = security id 13, IDX_I segment
const NIFTY_SECURITY_ID = 13;

export default function LiveMarketData() {
  const [tick, setTick] = useState<Tick | null>(null);
  const [prevLtp, setPrevLtp] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!SUPABASE_URL) return;
    const wsUrl =
      SUPABASE_URL.replace(/^http/, "ws") +
      `/functions/v1/dhan-ws?apikey=${encodeURIComponent(SUPABASE_KEY)}`;

    let cancelled = false;
    let retryTimer: number | undefined;

    const connect = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if ((msg.type === "tick" || msg.type === "quote") && typeof msg.ltp === "number") {
            setTick((prev) => {
              if (prev) setPrevLtp(prev.ltp);
              return { securityId: msg.securityId, ltp: msg.ltp, ltt: msg.ltt, ts: Date.now() };
            });
          } else if (msg.type === "error") {
            setError("Upstream feed error");
          }
        } catch {
          // ignore non-JSON
        }
      };
      ws.onerror = () => setError("WebSocket error");
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          // exponential-ish reconnect
          retryTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { wsRef.current?.close(); } catch { /* noop */ }
    };
  }, []);

  const change = tick && prevLtp != null ? tick.ltp - prevLtp : 0;
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-mono">Live NIFTY 50 (Dhan WS)</CardTitle>
        <span className={`flex items-center gap-1 text-xs font-mono ${connected ? "text-bullish" : "text-overbought"}`}>
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? "Live" : "Disconnected"}
        </span>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md border border-overbought/30 bg-overbought/5 px-3 py-2 text-xs font-mono text-overbought mb-3">
            {error}
          </div>
        )}
        <div className="flex items-baseline gap-4">
          <span
            className={`text-3xl font-mono font-bold ${
              dir === "up" ? "text-bullish" : dir === "down" ? "text-overbought" : "text-foreground"
            }`}
          >
            {tick ? tick.ltp.toFixed(2) : "—"}
          </span>
          {tick && prevLtp != null && (
            <span
              className={`text-sm font-mono ${
                change > 0 ? "text-bullish" : change < 0 ? "text-overbought" : "text-muted-foreground"
              }`}
            >
              {change >= 0 ? "+" : ""}{change.toFixed(2)}
            </span>
          )}
          <span className="text-xs font-mono text-muted-foreground ml-auto">
            {tick ? new Date(tick.ts).toLocaleTimeString("en-IN") : "waiting…"}
          </span>
        </div>
        <div className="text-xs font-mono text-muted-foreground mt-2">
          SecurityId {NIFTY_SECURITY_ID} • IDX_I • streaming ticker packets
        </div>
      </CardContent>
    </Card>
  );
}