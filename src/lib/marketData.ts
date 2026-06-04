import type { SupportedSymbol } from "./symbolMap";
import { supabase } from "./supabase";

export type ChartTimeframe = "15min" | "1hour" | "4hour" | "1day";

export type MarketDataPoint = {
  close: number;
  high: number | null;
  low: number | null;
  open: number | null;
  time: string | number;
  value: number;
  volume: number | null;
};

export type MarketDataResponse = {
  adjusted: boolean;
  asOf: string;
  from: string;
  latestClose: number | null;
  points: MarketDataPoint[];
  provider: string;
  providerStatus: string;
  resultsCount: number;
  symbol: SupportedSymbol;
  timeframe: ChartTimeframe;
  ticker: string;
  to: string;
};

type MarketDataRequest = {
  days?: number;
  symbol: SupportedSymbol;
  timeframe?: ChartTimeframe;
};

type MarketDataError = {
  error?: string;
  providerStatus?: string;
};

export async function fetchMarketData({ days = 45, symbol, timeframe = "1hour" }: MarketDataRequest) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke<MarketDataResponse | MarketDataError>("market-data", {
    body: {
      days,
      symbol,
      timeframe,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No market data response was returned.");
  }

  if ("error" in data && data.error) {
    throw new Error(data.providerStatus ? `${data.error}: ${data.providerStatus}` : data.error);
  }

  return data as MarketDataResponse;
}
