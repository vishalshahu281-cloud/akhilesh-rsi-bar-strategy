import { useState, useEffect, useCallback } from "react";
import type { RSIDataPoint } from "@/lib/rsiTypes";
import { generateRSIData } from "@/lib/rsiData";

interface RSIResponse {
  success: boolean;
  date?: string;
  interval?: number;
  dataPoints?: number;
  data?: RSIDataPoint[];
  error?: string;
}

export function useRSIData(refreshInterval = 60000, intervalMinutes = 5) {
  const [data, setData] = useState<RSIDataPoint[]>([]);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase not configured");
      }

      const headers = {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      };

      // 1. Try FYERS first
      let json: RSIResponse | null = null;
      try {
        const r = await fetch(
          `${supabaseUrl}/functions/v1/fyers-nifty-rsi?interval=${intervalMinutes}`,
          { headers },
        );
        if (r.ok) json = await r.json();
      } catch (e) {
        console.warn('FYERS feed failed, falling back to nifty-rsi:', e);
      }

      // 2. Fallback to Yahoo-backed nifty-rsi
      if (!json || !json.success || !json.data?.length) {
        const r = await fetch(
          `${supabaseUrl}/functions/v1/nifty-rsi?interval=${intervalMinutes}`,
          { headers },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        json = await r.json();
      }

      if (json && json.success && json.data && json.data.length > 0) {
        setData(json.data);
        setDate(json.date || "");
        setUsingFallback(false);
      } else {
        throw new Error(json?.error || "No live data available");
      }
    } catch (err) {
      console.warn("Live data unavailable, using simulated:", err);
      const simulated = generateRSIData(42, intervalMinutes);
      setData(simulated);
      setDate("Simulated");
      setUsingFallback(true);
      setError(err instanceof Error ? err.message : "Failed to fetch live data");
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [intervalMinutes]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return { data, date, loading, error, lastRefresh, usingFallback, refresh };
}
