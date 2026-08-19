// E6 (R1b): the environment-free half of the Treasury-rate context, split
// out of macroContext.ts the way bars.ts carries marketLoader's pure
// boundary — macroContext.ts reads Deno.env at module top, so the offline
// sweep (and the node:test harness behind it) could never import the
// adjustment arithmetic it needed to reconstruct macroAdjustment per
// decision instant. Everything here is deterministic in its inputs — the
// one module-level state is treasuryVisibleAtMs's memo of a
// deterministic map (bounded by distinct treasury dates, the same shape
// as bars.ts's formatter caches) — while the fetch, its response cache
// and its telemetry recorder stay in macroContext.ts.

import { newYorkWallClockToUtcMs } from "./bars.ts";
import { getAssetType } from "./calibration.ts";
import type { Side, SupportedSymbol } from "./types.ts";

export type MacroRateContext = {
  curveSpreadBps: number | null;
  latestDate: string | null;
  previousDate: string | null;
  source: "fmp_treasury_rates" | "unavailable";
  tenYearChangeBps: number | null;
  tenYearYield: number | null;
  twoYearYield: number | null;
  unavailableReason?: string;
};

export type MacroRateAdjustment = {
  adjustment: number;
  detail: string;
  stance: "aligned" | "against" | "neutral" | "unavailable";
};

/** One provider row, date carried as the label's UTC-midnight instant. */
export type DatedTreasuryRow = {
  dateMs: number;
  tenYear: number;
  twoYear: number;
};

const EQUITY_INDEX_SYMBOLS = new Set([
  "ASX",
  "DAX",
  "DOW",
  "ESUSD",
  "NIKKEI",
  "NQUSD",
  "NSDQ",
  "RTYUSD",
  "SP",
  "YMUSD",
]);
const RATE_SENSITIVE_METALS = new Set([
  "GCUSD",
  "MGCUSD",
  "SIUSD",
  "XAGUSD",
  "XAUUSD",
]);
const TREASURY_FUTURES = new Set(["ZBUSD", "ZNUSD"]);
const ENERGY_SYMBOLS = new Set(["BRENT", "BZUSD", "CLUSD", "NGUSD", "WTI"]);

export function calculateMacroRateAdjustment(
  symbol: SupportedSymbol,
  side: Side,
  context: MacroRateContext,
): MacroRateAdjustment {
  if (
    context.source === "unavailable" ||
    context.tenYearChangeBps === null ||
    Math.abs(context.tenYearChangeBps) < 4
  ) {
    return {
      adjustment: 0,
      detail: context.source === "unavailable"
        ? "Treasury-rate context was unavailable, so it did not affect this review."
        : "Treasury rates were steady enough to avoid changing the setup score.",
      stance: context.source === "unavailable" ? "unavailable" : "neutral",
    };
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  const preferredSide = getRateAlignedSide(
    normalizedSymbol,
    context.tenYearChangeBps,
  );
  if (!preferredSide) {
    const shockPenalty = ENERGY_SYMBOLS.has(normalizedSymbol) &&
        Math.abs(context.tenYearChangeBps) >= 8
      ? -1
      : 0;
    return {
      adjustment: shockPenalty,
      detail: shockPenalty
        ? "A large Treasury-rate move added macro noise for this energy market."
        : "Treasury rates were reviewed but did not directly affect this market.",
      stance: "neutral",
    };
  }

  const magnitude = Math.abs(context.tenYearChangeBps) >= 8 ? 2 : 1;
  const aligned = side === preferredSide;
  return {
    adjustment: aligned ? magnitude : -magnitude,
    detail: buildRateDetail(context, preferredSide, aligned),
    stance: aligned ? "aligned" : "against",
  };
}

/**
 * The one context construction, shared by the live fetch (macroContext.ts,
 * most-recent two rows of the response) and the sweep (E6: most-recent two
 * VISIBLE rows at each decision instant). The two arguments are (latest,
 * previous) — note the callers hold OPPOSITE array orders (#364 round 6,
 * smaller): the live fetch sorts its response DESCENDING and passes
 * rows[0]/rows[1], while the sweep's rolling store is ASCENDING (the
 * visibility pointer requires it) and passes [pointer−1]/[pointer−2].
 * This function sees only the pair; each caller owns its ordering, and
 * the sweep's is executed end-to-end in tests/sweep.test.ts.
 */
export function treasuryContextFromRows(
  latest: DatedTreasuryRow,
  previous: DatedTreasuryRow,
): MacroRateContext {
  return {
    curveSpreadBps: roundBps((latest.tenYear - latest.twoYear) * 100),
    latestDate: isoDateFromMs(latest.dateMs),
    previousDate: isoDateFromMs(previous.dateMs),
    source: "fmp_treasury_rates",
    tenYearChangeBps: roundBps((latest.tenYear - previous.tenYear) * 100),
    tenYearYield: latest.tenYear,
    twoYearYield: latest.twoYear,
  };
}

// E6: when a Treasury row becomes DECISION-TIME information. The daily
// mark exists at the New York close and providers publish it that
// evening, but the exact publication minute is not reconstructible
// historically — so the sweep admits a row only from New York midnight
// after its label date. That is deliberately conservative: for most of
// each trading day the live analyzer's "latest" row is also yesterday's
// (the fetch sees today's row only after publication), so the offline
// join errs a few evening hours later than live, never earlier. The
// completed-daily-bar gate (2a) draws its visibility line by the same
// principle.
const visibleAtCache = new Map<number, number>();

export function treasuryVisibleAtMs(dateMs: number): number {
  const cached = visibleAtCache.get(dateMs);
  if (cached !== undefined) {
    return cached;
  }
  // dateMs is the label's UTC midnight; +24h lands on the FOLLOWING
  // label's UTC midnight, whose UTC calendar parts name the day whose New
  // York midnight (04:00-05:00 UTC, DST-aware via bars.ts) we want.
  const next = new Date(dateMs + 86_400_000);
  const visibleAt = newYorkWallClockToUtcMs(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
  );
  visibleAtCache.set(dateMs, visibleAt);
  return visibleAt;
}

/** Parse one provider treasury row; null when a required field is absent. */
export function parseTreasuryRow(value: unknown): DatedTreasuryRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  // dateMs is CONTRACTUALLY the label's UTC midnight — treasuryVisibleAtMs
  // adds 24h and reads UTC calendar parts, so an off-midnight instant
  // could name the wrong day. Date.parse alone cannot guarantee that
  // (#364 round 1, finding 6): V8 parses "2026-08-11 00:00:00" — space
  // separator — as LOCAL time, making the offline join TZ-dependent. So
  // the label is taken as exactly its leading YYYY-MM-DD (a bare ISO
  // date parses as UTC by spec), and a row whose date does not start
  // with one is refused rather than guessed at.
  const label = String(row.date ?? row.calendarDate ?? "").slice(0, 10);
  const dateMs = /^\d{4}-\d{2}-\d{2}$/.test(label)
    ? Date.parse(label)
    : Number.NaN;
  const tenYear = numberFromKeys(row, [
    "year10",
    "tenYear",
    "tenYearYield",
    "10Y",
    "10y",
    "year_10",
  ]);
  const twoYear = numberFromKeys(row, [
    "year2",
    "twoYear",
    "twoYearYield",
    "2Y",
    "2y",
    "year_2",
  ]);

  if (!Number.isFinite(dateMs) || tenYear === null || twoYear === null) {
    return null;
  }
  return { dateMs, tenYear, twoYear };
}

export function unavailableContext(reason: string): MacroRateContext {
  return {
    curveSpreadBps: null,
    latestDate: null,
    previousDate: null,
    source: "unavailable",
    tenYearChangeBps: null,
    tenYearYield: null,
    twoYearYield: null,
    unavailableReason: reason,
  };
}

function getRateAlignedSide(
  symbol: string,
  tenYearChangeBps: number,
): Side | null {
  const rateDirection = tenYearChangeBps > 0 ? "rising" : "falling";
  const usdStrengthSide = getUsdStrengthSide(symbol);
  if (usdStrengthSide) {
    return rateDirection === "rising"
      ? usdStrengthSide
      : inverseSide(usdStrengthSide);
  }

  if (
    EQUITY_INDEX_SYMBOLS.has(symbol) ||
    RATE_SENSITIVE_METALS.has(symbol) ||
    TREASURY_FUTURES.has(symbol) ||
    getAssetType(symbol) === "crypto"
  ) {
    return rateDirection === "rising" ? "sell" : "buy";
  }

  return null;
}

function getUsdStrengthSide(symbol: string): Side | null {
  if (/^USD[A-Z]{3}$/.test(symbol)) {
    return "buy";
  }
  if (/^[A-Z]{3}USD$/.test(symbol)) {
    return "sell";
  }
  return null;
}

function inverseSide(side: Side): Side {
  return side === "buy" ? "sell" : "buy";
}

function buildRateDetail(
  context: MacroRateContext,
  preferredSide: Side,
  aligned: boolean,
) {
  const move = context.tenYearChangeBps ?? 0;
  const direction = move > 0 ? "higher" : "lower";
  const absMove = Math.abs(move).toFixed(1);
  return `The U.S. 10-year yield moved ${direction} by ${absMove} bps; that ${
    aligned ? "supports" : "works against"
  } this ${preferredSide} view.`;
}

function numberFromKeys(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function isoDateFromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function roundBps(value: number) {
  return Number(value.toFixed(2));
}
