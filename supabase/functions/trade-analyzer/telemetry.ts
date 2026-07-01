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
    const status = !marketContext
      ? "unavailable"
      : providerWarnings.length > 0 ||
          marketContext.availableTimeframes.length < 4
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
