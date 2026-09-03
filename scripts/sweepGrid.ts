// The crossed-axes grid parser (4c). Extracted from replay-sweep so tests
// can exercise it without executing the sweep's main — and extended for
// the owner-approved string axis: runnerProtection's values are validated
// the way keys always were, because a typo'd value that silently overrode
// nothing would report the baseline's numbers back as if it had varied.

import {
  type CategoryCalibration,
  getAssetType,
  getClassCalibration,
  getSymbolCalibrationOverride,
} from "../supabase/functions/trade-analyzer/calibration.ts";

/**
 * A grid cell: calibration overrides, plus the one TOKEN that is not a
 * calibration field. `symbolOverride: "none"` (R4 act 3) asks the driver
 * to run each market on its CLASS row with its per-symbol layer removed —
 * the only way to grade the invalidated 2026-08-11 derived cells against
 * their absence. The token never reaches the engine: `expandGridCell`
 * resolves it per market into the class row's values for exactly the
 * fields that market's layer overrides, so the sweep composes class row +
 * layer + cell and the cell wins them back. The row's `variant` and the
 * manifest's `grid` carry the cell as written, and the manifest's
 * `symbols[].symbolOverride` and `calibrationByClass` make the expansion
 * derivable by any reader.
 */
export type GridCell = Partial<CategoryCalibration> & { symbolOverride?: "none" };

export const GRID_TOKEN_KEYS = { symbolOverride: ["none"] } as const;

function isGridTokenKey(key: string): key is keyof typeof GRID_TOKEN_KEYS {
  return key in GRID_TOKEN_KEYS;
}

/** The engine-facing override for one market: the token resolved, explicit keys on top. */
export function expandGridCell(symbol: string, cell: GridCell): Partial<CategoryCalibration> {
  const { symbolOverride, ...explicit } = cell;
  if (symbolOverride === undefined) return explicit;
  const layer = getSymbolCalibrationOverride(symbol);
  const classRow = getClassCalibration(getAssetType(symbol));
  const restored: Partial<CategoryCalibration> = {};
  for (const key of Object.keys(layer) as Array<keyof CategoryCalibration>) {
    (restored as Record<string, unknown>)[key] = classRow[key];
  }
  return { ...restored, ...explicit };
}

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
  "maxCostShare",
  "minimumTargetRewardRisk",
  "pivotStrengthDaily",
  "pivotStrengthIntraday",
  "minRewardRisk",
  "newsPenaltyPerEvent",
  "providerWarningPenalty",
  "rsiBuyThreshold",
  "rsiSellThreshold",
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
): GridCell[] {
  let combos: GridCell[] = [{}];
  for (const axis of spec.split(";")) {
    if (!axis.trim()) continue;
    const [rawKey, values] = axis.split("=");
    const key = rawKey.trim();
    if (isGridTokenKey(key)) {
      const legal = GRID_TOKEN_KEYS[key] as readonly string[];
      const parsed = (values ?? "").split(",").map((value) => value.trim()).filter(Boolean);
      for (const value of parsed) {
        if (!legal.includes(value)) {
          throw new Error(`--grid ${key} value "${value}" is not one of: ${legal.join(", ")}`);
        }
      }
      if (parsed.length === 0) continue;
      const crossed: GridCell[] = [];
      for (const existing of combos) {
        for (const value of parsed) crossed.push({ ...existing, [key]: value as "none" });
      }
      combos = crossed;
      continue;
    }
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
      const crossed: GridCell[] = [];
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
            [...GRID_OVERRIDE_KEYS, ...Object.keys(GRID_STRING_KEYS), ...Object.keys(GRID_TOKEN_KEYS)].join(
              ", ",
            )
          }`,
      );
    }
    const parsed = (values ?? "").split(",").map((value) => ({ raw: value, numeric: Number(value) }));
    const numerics = parsed.filter((entry) => Number.isFinite(entry.numeric)).map((entry) => entry.numeric);
    // REFUSES, where it used to `continue`. A silent skip drops the axis and
    // sweeps the shipped value under the name of the arm that was asked for —
    // and `Infinity`, the natural way to write "no cap at all" for
    // maxCostShare, parses to a non-finite number and was skipped in exactly
    // that silence. An uncapped arm is expressed as a cap above any reachable
    // share (tests/maxCostShare.test.ts pins that an unreachable cap
    // reproduces the uncapped run exactly).
    if (numerics.length === 0) {
      throw new Error(
        `--grid ${key}=${values ?? ""} names no usable value — a grid axis that parses to nothing would be ` +
          `swept as the shipped cell under the arm's name; for "no cap", pass a value above any reachable one ` +
          `(1e9), not Infinity`,
      );
    }
    const crossed: GridCell[] = [];
    for (const existing of combos) {
      for (const numeric of numerics) {
        crossed.push({ ...existing, [key]: numeric });
      }
    }
    combos = crossed;
  }
  return combos;
}
