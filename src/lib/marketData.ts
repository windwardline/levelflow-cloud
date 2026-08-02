import type { SupportedSymbol } from "./symbolMap";
import { supabase } from "./supabase";

// Labels are the compact timeframe codes, universally (spec §17: "Timeframes
// are two characters — 1H, 4H, 1D … every surface that names a timeframe").
// This is the one list every such surface reads — advisorFormat's TIMEFRAMES
// re-exports it and the Desk's chart-view select renders these labels
// directly — so the codes cannot differ from one control to the next. Same
// grammar the engine already speaks internally (its signal intervals are
// 4H, 1H, and 15M): the interval's digits plus its unit's initial, which
// makes fifteen minutes "15M" — three characters because the number has two
// digits, not because the grammar changes.
export const CHART_TIMEFRAME_OPTIONS = [
  { label: "1M", value: "1min" },
  { label: "5M", value: "5min" },
  { label: "15M", value: "15min" },
  { label: "1H", value: "1hour" },
  { label: "4H", value: "4hour" },
  { label: "1D", value: "1day" },
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
