import { getAssetType } from "./calibration.ts";
import type { MarketContext, SupportedSymbol } from "./types.ts";
import {
  adminInsertRows,
  adminUpsertRows,
  hasSupabaseAdminConfig,
} from "./supabaseRest.ts";

export type AnalyzerEventStatus =
  | "blocked"
  | "cache_hit"
  | "error"
  | "scan_failure"
  | "slow_provider"
  | "success";

export type AnalyzerEventPayload = {
  action: string;
  assetType?: string | null;
  cacheHit?: boolean | null;
  durationMs?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
  providerSymbol?: string | null;
  status: AnalyzerEventStatus;
  symbol?: string | null;
  userId?: string | null;
};

export async function recordMarketDataHealth(
  symbol: SupportedSymbol,
  providerSymbol: string | null,
  marketContext: MarketContext | null,
  providerFailures: string[],
) {
  try {
    const providerWarnings = [
      ...providerFailures,
      ...(marketContext?.providerWarnings ?? []),
    ];
    // E3 dropped the analyzer's 1-minute fetch (#362 round 3, finding
    // 2), so the timeframe ceiling fell from six to five. "limited"
    // keeps its meaning — more than two series missing — by moving the
    // threshold in step: < 4 of a possible six ≡ < 3 of a possible five
    // for every symbol that served 1min, which was every symbol that
    // could reach the old bar. Left at < 4 it would have flipped
    // symbols to "limited" with no change in provider coverage.
    const status = !marketContext
      ? "unavailable"
      : providerWarnings.length > 0 ||
          marketContext.availableTimeframes.length < 3
      ? "limited"
      : "ready";

    await adminUpsertRows("market_data_health", {
      asset_type: getAssetType(symbol),
      available_timeframes: marketContext?.availableTimeframes ?? [],
      daily_bars: marketContext?.daily.length ?? 0,
      intraday_bars: marketContext?.availableTimeframes
        .filter((timeframe) => timeframe !== "1day")
        .reduce(
          (total, timeframe) =>
            total + (marketContext?.timeframes[timeframe]?.length ?? 0),
          0,
        ) ?? 0,
      last_checked_at: new Date().toISOString(),
      // E3: `latest` is the completed decision anchor now, so this stamp
      // reports the DECISION BASIS' age — up to one primary span behind
      // the clock in the ordinary case, a daily stamp on the loader's
      // daily fallback — not a freshness probe of the provider (that is
      // last_checked_at's job). Named in the divergence map's residue.
      latest_bar_at: marketContext?.latest
        ? new Date(marketContext.latest.time).toISOString()
        : null,
      provider_symbol: providerSymbol,
      provider_warnings: providerWarnings,
      status,
      symbol,
    }, "symbol");
  } catch (error) {
    console.warn("market data health recording failed", error);
  }
}

export async function recordAnalyzerEvent(event: AnalyzerEventPayload) {
  if (!hasSupabaseAdminConfig()) {
    return;
  }

  try {
    await adminInsertRows("analyzer_events", {
      action: event.action,
      asset_type: event.assetType ??
        (event.symbol ? getAssetType(event.symbol) : null),
      cache_hit: event.cacheHit ?? false,
      duration_ms: event.durationMs ?? null,
      message: event.message ?? null,
      metadata: event.metadata ?? {},
      provider_symbol: event.providerSymbol ?? null,
      status: event.status,
      symbol: event.symbol ?? null,
      user_id: event.userId ?? null,
    });
  } catch (error) {
    console.warn("analyzer event recording failed", error);
  }
}
