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
export const REVIEW_WINDOW_HOURS_BY_ASSET_TYPE: Record<SecurityType, number> = {
  Crypto: 12,
  Energies: 6,
  Forex: 8,
  Futures: 6,
  Indices: 5,
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
  Crypto: 82,
  Energies: 69,
  Forex: 40,
  Futures: 68,
  Indices: 68,
  Metals: 90,
};
