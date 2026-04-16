export interface RSIDataPoint {
  time: string;
  rsi: number | null;
  rsiMA: number | null;
  signal: "Overbought" | "Oversold" | "Neutral" | "N/A";
  niftyPrice: number;
}
