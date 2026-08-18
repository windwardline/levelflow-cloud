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
    // E3 dropped the analyzer's 1-minute fetch (#362 rounds 3-4), so
    // the timeframe ceiling fell from six to five. For a symbol whose
    // 1min series qualified, < 4 of six ≡ < 3 of five — status
    // preserved; left at < 4, those symbols would have flipped
    // "limited" with no coverage change. For a symbol that never served
    // 1min (its 3-day lookback against the same 40-bar floor drops out
    // exactly on thin and holiday-shortened markets), the count is
    // unchanged and the move is deliberately LOOSER: such a symbol at
    // 3-of-5 was "limited" only because a series the engine no longer
    // consumes was counted as missing, and absence of decision-
    // irrelevant data is not a coverage defect. The asymmetry is
    // stated, not accidental (#362 round 4, finding 3).
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
