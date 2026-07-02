import type { RegimeName } from "./calibration.ts";
import type { QuoteSnapshot } from "./quotes.ts";

export const signalTimeframes = ["4hour", "1hour", "15min"] as const;
export const executionTimeframes = ["5min", "1min"] as const;
export const intradayTimeframes = [
  ...signalTimeframes,
  ...executionTimeframes,
] as const;

export type SupportedSymbol = string;
export type Direction = "buy" | "sell" | "neutral" | "block";
export type Side = "buy" | "sell";
export type Timeframe = "1day" | (typeof intradayTimeframes)[number];

export type Bar = {
  close: number;
  high: number;
  low: number;
  open: number;
  time: number;
  volume: number;
};

export type MarketContext = {
  availableTimeframes: Timeframe[];
  daily: Bar[];
  latest: Bar;
  latestTimeframe: Timeframe;
  primary: Bar[];
  primaryTimeframe: Timeframe;
  providerWarnings: string[];
  quote: QuoteSnapshot | null;
  timeframes: Partial<Record<Timeframe, Bar[]>>;
};

export type Regime = {
  bias: Direction;
  name: RegimeName;
  rationale: string;
  trendStrength: number;
  volatilityPercentile: number;
};

export type StrategyVote = {
  baseScore?: number;
  confidence: number;
  direction: Direction;
  name: string;
  profileWeight?: number;
  rationale: string;
  score: number;
  timeframe: Timeframe | "multi";
};
