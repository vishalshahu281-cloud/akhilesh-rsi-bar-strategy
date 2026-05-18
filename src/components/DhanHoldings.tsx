import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface Holding {
  tradingSymbol?: string;
  exchange?: string;
  isin?: string;
  totalQty?: number;
  avgCostPrice?: number;
  lastTradedPrice?: number;
  [k: string]: unknown;
}

export default function DhanHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("dhan-holdings");
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error?.errorMessage || data?.error || "Failed to load holdings");
      const list: Holding[] = Array.isArray(data.holdings) ? data.holdings : data.holdings?.data ?? [];
      setHoldings(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const fmt = (n: unknown, d = 2) => typeof n === "number" ? n.toFixed(d) : "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-mono">Dhan Holdings</CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-7 px-2 text-xs font-mono">
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-md border border-overbought/30 bg-overbought/5 px-3 py-2 text-xs font-mono text-overbought mb-3">
            {error}
          </div>
        )}
        {!error && holdings.length === 0 && !loading && (
          <div className="text-xs font-mono text-muted-foreground py-6 text-center">No holdings found.</div>
        )}
        {holdings.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Exch</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Avg Cost</TableHead>
                <TableHead className="text-right">LTP</TableHead>
                <TableHead className="text-right">P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((h, i) => {
                const qty = Number(h.totalQty ?? 0);
                const avg = Number(h.avgCostPrice ?? 0);
                const ltp = Number(h.lastTradedPrice ?? 0);
                const pnl = (ltp - avg) * qty;
                return (
                  <TableRow key={(h.isin as string) ?? i}>
                    <TableCell className="font-mono">{h.tradingSymbol ?? "—"}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{h.exchange ?? "—"}</TableCell>
                    <TableCell className="font-mono text-right">{qty}</TableCell>
                    <TableCell className="font-mono text-right">{fmt(avg)}</TableCell>
                    <TableCell className="font-mono text-right">{fmt(ltp)}</TableCell>
                    <TableCell className={`font-mono text-right ${pnl >= 0 ? "text-bullish" : "text-overbought"}`}>
                      {fmt(pnl)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}