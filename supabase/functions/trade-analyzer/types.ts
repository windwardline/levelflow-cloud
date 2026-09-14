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

/**
 * USD per one unit of a forex cross's QUOTE currency, at decision time — the
 * rate E8's $5 per 100,000 base units needs to become a distance in quote
 * units (venueCosts.ts). ONE source on both paths (2026-09-14): the USD leg's
 * previous COMPLETED daily close — live through the bar store, the sweep from
 * the pinned cache, both behind the same daily-completion gate — so what is
 * measured is what trades. `leg` and `legCloseAtMs` say which bar priced it.
 */
export type QuoteCurrencyUsd = {
  leg: string;
  legCloseAtMs: number;
  usdPerQuote: number;
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
  /**
   * Null where the commission needs no rate (every symbol but the 21 forex
   * crosses) — and, on a cross, null means the rate could not be had, which
   * `buildPricePlan` refuses as `commission_rate_unavailable`. Required, so
   * every constructor states which.
   */
  quoteCurrencyUsd: QuoteCurrencyUsd | null;
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
