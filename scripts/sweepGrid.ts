// The crossed-axes grid parser (4c). Extracted from replay-sweep so tests
// can exercise it without executing the sweep's main — and extended for
// the owner-approved string axis: runnerProtection's values are validated
// the way keys always were, because a typo'd value that silently overrode
// nothing would report the baseline's numbers back as if it had varied.

import type { CategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";

// Mirrors CategoryCalibration's numeric fields; the satisfies-check keeps
// the list from drifting from the type it mirrors.
export const GRID_OVERRIDE_KEYS = [
  "confidenceThreshold",
  "cotScoreAdjustment",
  "dailyTargetAtrMultiplier",
  "dailyStopAtrMultiplier",
  "defaultReviewHours",
  "entryOffsetDefault",
  "entryOffsetTrend",
  "maxNewsPenalty",
  "maxProviderPenalty",
  "maxStopAtrMultiplier",
  "minimumTargetRewardRisk",
  "minRewardRisk",
  "newsPenaltyPerEvent",
  "providerWarningPenalty",
  "runnerWindowShare",
  "sizingHoursFactor",
  "stopAtrMultiplier",
  "timeframePenalty",
  "tp1AtrMultiplier",
  "tp1RiskShare",
  "volatilityTargetAtrMultiplier",
] as const satisfies ReadonlyArray<keyof CategoryCalibration>;

export const GRID_STRING_KEYS = {
  runnerProtection: ["breakeven", "hold", "trail_tp1"],
  // R2b question 4's axis. The stop's structural search reads the intraday
  // pivots alone while the ladder reads all four arrays, and no ruling chose
  // that. Measured 2026-09-01 it would move the shipped stop on 32.0% of
  // decisions across the 71 markets that can be structure-stopped — but
  // placement is not profit, and adopting it on that evidence would be
  // manufacturing a ratio (amendment 39). An axis lets R3 price both arms in
  // one run at zero additional provider bytes.
  stopStructureSource: ["intraday", "intraday_and_daily"],
} as const satisfies Partial<
  { [K in keyof CategoryCalibration]: ReadonlyArray<CategoryCalibration[K]> }
>;

function isGridOverrideKey(
  key: string,
): key is (typeof GRID_OVERRIDE_KEYS)[number] {
  return (GRID_OVERRIDE_KEYS as readonly string[]).includes(key);
}

function isGridStringKey(key: string): key is keyof typeof GRID_STRING_KEYS {
  return key in GRID_STRING_KEYS;
}

/** Parse one --grid spec into the full cross product of its axes. */
export function parseGridSpec(
  spec: string,
): Array<Partial<CategoryCalibration>> {
  let combos: Array<Partial<CategoryCalibration>> = [{}];
  for (const axis of spec.split(";")) {
    if (!axis.trim()) continue;
    const [rawKey, values] = axis.split("=");
    const key = rawKey.trim();
    if (isGridStringKey(key)) {
      const legal = GRID_STRING_KEYS[key] as readonly string[];
      const parsed = (values ?? "").split(",").map((value) => value.trim())
        .filter(Boolean);
      for (const value of parsed) {
        if (!legal.includes(value)) {
          throw new Error(
            `--grid ${key} value "${value}" is not one of: ${
              legal.join(", ")
            }`,
          );
        }
      }
      if (parsed.length === 0) continue;
      const crossed: Array<Partial<CategoryCalibration>> = [];
      for (const existing of combos) {
        for (const value of parsed) {
          crossed.push({
            ...existing,
            [key]: value as (typeof GRID_STRING_KEYS)[typeof key][number],
          });
        }
      }
      combos = crossed;
      continue;
    }
    if (!isGridOverrideKey(key)) {
      throw new Error(
        `--grid key "${key}" is not a numeric CategoryCalibration field. ` +
          `Valid keys: ${
            [...GRID_OVERRIDE_KEYS, ...Object.keys(GRID_STRING_KEYS)].join(
              ", ",
            )
          }`,
      );
    }
    const numerics = (values ?? "")
      .split(",")
      .map((value) => Number(value))
      .filter((numeric) => Number.isFinite(numeric));
    if (numerics.length === 0) continue;
    const crossed: Array<Partial<CategoryCalibration>> = [];
    for (const existing of combos) {
      for (const numeric of numerics) {
        crossed.push({ ...existing, [key]: numeric });
      }
    }
    combos = crossed;
  }
  return combos;
}
