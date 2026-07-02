import type { SupportedSymbol } from "./symbolMap";
import { supabase } from "./supabase";

export const CHART_TIMEFRAME_OPTIONS = [
  { label: "1 minute", value: "1min" },
  { label: "5 minutes", value: "5min" },
  { label: "15 minutes", value: "15min" },
  { label: "1 hour", value: "1hour" },
  { label: "4 hours", value: "4hour" },
  { label: "Daily", value: "1day" },
] as const;

export type ChartTimeframe = typeof CHART_TIMEFRAME_OPTIONS[number]["value"];

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

const MARKET_DATA_TIMEOUT_MS = 15_000;

export function isChartTimeframe(value: unknown): value is ChartTimeframe {
  return typeof value === "string" &&
    CHART_TIMEFRAME_OPTIONS.some((option) => option.value === value);
}

export function chartTimeframeLabel(timeframe: ChartTimeframe) {
  return CHART_TIMEFRAME_OPTIONS.find((option) => option.value === timeframe)
    ?.label ?? timeframe;
}

export function defaultMarketDataDays(timeframe: ChartTimeframe) {
  switch (timeframe) {
    case "1min":
      return 3;
    case "5min":
      return 10;
    case "15min":
      return 45;
    case "1hour":
      return 90;
    case "4hour":
      return 180;
    case "1day":
      return 520;
  }
}

export async function fetchMarketData(
  { days, symbol, timeframe = "1hour" }: MarketDataRequest,
) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const lookbackDays = days ?? defaultMarketDataDays(timeframe);

  const { data, error } = await withTimeout(
    supabase.functions.invoke<MarketDataResponse | MarketDataError>(
      "market-data",
      {
        body: {
          days: lookbackDays,
          symbol,
          timeframe,
        },
      },
    ),
    MARKET_DATA_TIMEOUT_MS,
    "Market data timed out.",
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No market data response was returned.");
  }

  if ("error" in data && data.error) {
    throw new Error(
      data.providerStatus
        ? `${data.error}: ${data.providerStatus}`
        : data.error,
    );
  }

  return data as MarketDataResponse;
}

function withTimeout<T>(
  request: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  return Promise.race([
    request,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}
