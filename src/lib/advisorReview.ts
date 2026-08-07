import type { SecurityType } from "./symbolMap";

/**
 * Mirrors supabase/functions/trade-analyzer/calibration.ts's per-class
 * defaultReviewHours — the window a setup's limit order waits in before the
 * engine calls it unfilled. Duplicated rather than imported: that file is a Deno
 * edge function, and pulling it into the client bundle would be architecturally
 * wrong. tests/calibrationState.test.ts pins every class against the frozen
 * calibration state of record, so a change here without a calibration round
 * fails CI — which is why this survived Q2-I4's orphan sweep while the interval
 * labels beside it did not.
 */
/**
 * The engine's calibration class is NOT the display SecurityType, and on
 * 2026-08-06 the two stopped being interchangeable. Agriculture and livestock
 * were derived as their own calibration classes while both still DISPLAY as
 * Futures — corn's confidence floor is 30 against futures' 68, and livestock's
 * review window is 24 hours against futures' 6.
 *
 * Keyed by SecurityType alone, these mirrors would have told a user trading lean
 * hogs "6h review, threshold 68" while the engine used 24h and 30. Nothing
 * renders it today because every agriculture and livestock market is gated
 * no-trade, so the defect was latent — which is exactly the kind of landmine
 * this codebase has spent the night removing. Resolved by symbol instead.
 *
 * Duplicated from calibration.ts's ASSET_TYPE_BY_SYMBOL rather than imported:
 * that file is a Deno edge module and cannot enter the client bundle, the same
 * boundary every other mirror in this file crosses by duplication.
 * tests/calibrationState.test.ts pins these against the engine's real values.
 */
export const AGRICULTURE_SYMBOLS = new Set([
  "ZCUSX",
  "ZSUSX",
  "ZLUSX",
  "ZMUSD",
  "ZOUSX",
  "ZRUSD",
]);
export const LIVESTOCK_SYMBOLS = new Set(["LEUSX", "GFUSX", "HEUSX"]);

/** Extra review windows for the classes SecurityType cannot distinguish. */
const REVIEW_WINDOW_HOURS_BY_CLASS = {
  agriculture: 6,
  livestock: 24,
} as const;

/**
 * Per-symbol windows, mirroring the engine's SYMBOL_CALIBRATION_OVERRIDES.
 *
 * A third resolution layer, added 2026-08-07 because round 28 created the first
 * symbol override to touch a value this file mirrors. Oats gets 24 hours where
 * its agriculture class gets 6, and without this the UI would have told an oats
 * user "6h" while the engine reviewed over 24 — the same divergence the
 * class-level layer was built to prevent, one level further down.
 *
 * Checked FIRST, because the engine resolves symbol overrides last and therefore
 * most specifically. tests/calibrationState.test.ts walks every tradable symbol
 * against the engine's own resolver, so the next override that lands here fails
 * that test rather than shipping a wrong number to the surface.
 */
const REVIEW_WINDOW_HOURS_BY_SYMBOL: Record<string, number> = {
  ZOUSX: 24,
};

/** Extra confidence floors for the same two classes. */
const CONFIDENCE_THRESHOLD_BY_CLASS = {
  // agriculture HOLDS at 30: the final sweep derives no surviving floor for it
  // (test expectancy dips negative somewhere above every candidate), so the
  // standing value stays rather than a fabricated one.
  agriculture: 30,
  // livestock 30 -> 40, derived from the final sweep. No bucket in its
  // 1,204-fill corpus reaches 100 test fills, so the sample guard that raised
  // forex and crypto cannot apply here and the derived floor stands as-is.
  livestock: 40,
} as const;

/**
 * The review window a given market is actually reviewed over. Prefer this to the
 * SecurityType table wherever a symbol is in hand.
 */
export function reviewWindowHoursForSymbol(
  symbol: string,
  assetType: SecurityType,
): number {
  const bySymbol = REVIEW_WINDOW_HOURS_BY_SYMBOL[symbol];
  if (bySymbol !== undefined) return bySymbol;
  if (AGRICULTURE_SYMBOLS.has(symbol)) return REVIEW_WINDOW_HOURS_BY_CLASS.agriculture;
  if (LIVESTOCK_SYMBOLS.has(symbol)) return REVIEW_WINDOW_HOURS_BY_CLASS.livestock;
  return REVIEW_WINDOW_HOURS_BY_ASSET_TYPE[assetType];
}

/** The confidence floor a given market is actually gated on. */
export function confidenceThresholdForAssetOrSymbol(
  symbol: string,
  assetType: SecurityType,
): number {
  if (AGRICULTURE_SYMBOLS.has(symbol)) return CONFIDENCE_THRESHOLD_BY_CLASS.agriculture;
  if (LIVESTOCK_SYMBOLS.has(symbol)) return CONFIDENCE_THRESHOLD_BY_CLASS.livestock;
  return CONFIDENCE_THRESHOLD_BY_ASSET_TYPE[assetType];
}

export const REVIEW_WINDOW_HOURS_BY_ASSET_TYPE: Record<SecurityType, number> = {
  Crypto: 12,
  Energies: 6,
  Forex: 8,
  Futures: 6,
  // 5 -> 8 (round 28, 2026-08-06). The five-hour window was half of why the
  // cash indices were starved: it capped the runner so near that no plan could
  // satisfy minimumTargetRewardRisk against a TP1 required further out than the
  // stop. Derived jointly with tp1RiskShare and the stop cap, because those
  // three could not be derived one at a time.
  Indices: 8,
  Metals: 8,
};

// Mirrors supabase/functions/trade-analyzer/calibration.ts's per-class
// confidenceThreshold. Duplicated, not imported: that file is a Deno edge
// function, and pulling it into the client bundle at runtime would be
// architecturally wrong (same reasoning as REVIEW_WINDOW_HOURS_BY_ASSET_TYPE
// above). tests/core.test.ts pins every class against the real
// getCategoryCalibration(...).confidenceThreshold so this can never drift
// silently from live calibration.
export const CONFIDENCE_THRESHOLD_BY_ASSET_TYPE: Record<SecurityType, number> = {
  // All six re-derived 2026-08-06 from the final 1,020,464-setup sweep at the
  // shipped geometry. The old values were set before the execution-cost and
  // stop-cap defects were found, so they were gating against expectancy curves
  // the engine no longer produces — four of them by 40 to 60 points.
  Crypto: 25,
  Energies: 85,
  Forex: 20,
  Futures: 25,
  // HELD at 68 under amendment 25. The sweep derives 85 and that derivation is
  // refused: this class is the cash indices, whose geometry stage rejects
  // 55-70% of the decisions reaching it. A starved sample yields no verdict.
  Indices: 68,
  Metals: 30,
};
