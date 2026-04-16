import { useState, useEffect, useCallback } from "react";
import type { RSIDataPoint } from "@/lib/rsiTypes";
import { generateRSIData } from "@/lib/rsiData";

export function useRSIData(refreshInterval = 60000, intervalMinutes = 5) {
  const [data, setData] = useState<RSIDataPoint[]>([]);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    const simulated = generateRSIData(Date.now() % 1000, intervalMinutes);
    setData(simulated);
    setDate(new Date().toLocaleDateString("en-IN"));
    setLoading(false);
    setLastRefresh(new Date());
  }, [intervalMinutes]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, refreshInterval);
    return () => clearInterval(interval);
  }, [refresh, refreshInterval]);

  return { data, date, loading, lastRefresh, refresh };
}
