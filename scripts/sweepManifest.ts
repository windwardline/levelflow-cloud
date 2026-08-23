// 2i (2026-08-09): the corpus describes itself. A sweep emit used to leave
// no record of the conditions that produced it — variant:"baseline" is
// byte-identical across engine edits, the exact aliasing hazard
// calibration.ts documents for NGUSD — so two corpora measured under
// different engines could be aggregated as one. The manifest written
// beside every emit carries the analyzer version, the resolved per-symbol
// calibration (hashed), the grid, warmup/split parameters, the cache
// anchor, per-(symbol, timeframe) bar facts including the largest gap, and
// the provider-boundary rejection tally. Item 3's aggregation readers
// assert manifestHash before touching a single row.

import { createHash } from "node:crypto";
import {
  type CrossSeriesClock,
  type SeriesClockWitness,
  seriesClockWitness,
  type SeriesRole,
} from "./clockWitness.ts";

export type SeriesFacts = {
  // R0: the series' own clock evidence (clockWitness.ts) — recorded so a
  // reader can see WHY the corpus was accepted, not merely that it was.
  clock: SeriesClockWitness;
  count: number;
  firstTime: number | null;
  largestGapMs: number;
  lastTime: number | null;
  spanDays: number;
};

/**
 * Deterministic JSON: object keys sorted at every depth, array order
 * preserved. Hashes over this cannot move with insertion order.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entryValue]) =>
        `${JSON.stringify(key)}:${stableStringify(entryValue)}`
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Continuity as a recorded fact: ends, count, largest inter-bar gap — and
 * since R0, the series' clock witness. The role names which witnesses
 * apply — a daily series testifies through its stamp hour, an intraday
 * one through weekly opens and spring transitions — and it is REQUIRED:
 * a defaulted role once let a daily series ride under intraday witnesses,
 * where a naive daily store can never be condemned (#358 finding 9).
 */
export function seriesFacts(
  bars: Array<{ time: number }>,
  role: SeriesRole,
): SeriesFacts {
  if (bars.length === 0) {
    return {
      clock: seriesClockWitness(bars, role),
      count: 0,
      firstTime: null,
      largestGapMs: 0,
      lastTime: null,
      spanDays: 0,
    };
  }
  const times = bars.map((bar) => bar.time).sort((a, b) => a - b);
  let largestGapMs = 0;
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (gap > largestGapMs) {
      largestGapMs = gap;
    }
  }
  const first = times[0];
  const last = times[times.length - 1];
  return {
    clock: seriesClockWitness(bars, role),
    count: bars.length,
    firstTime: first,
    largestGapMs,
    lastTime: last,
    spanDays: Number(((last - first) / 86_400_000).toFixed(2)),
  };
}

// #364 round 10, finding 1: the 5/15 density ratio is a SAME-WINDOW
// statistic, and at depth the two stores' own windows diverge (FMP's
// 5-minute depth is shallower than 15-minute for most symbols) — so the
// driver, which holds both bar arrays while it builds seriesFacts,
// records the counts inside the INTERSECTION window as a manifested
// fact. The door's ratio then divides two counts measured over one
// shared window on every symbol, whatever the depths; per-day rates
// over one window cancel their span, so the ratio is fiveCount /
// fifteenCount, and spanDays rides along only for the sub-week silence
// rule and the primary-density gate.
export type CrossSeriesDensity = {
  fifteenCount: number;
  fiveCount: number;
  spanDays: number;
};

export function crossSeriesDensityFacts(
  fiveBars: Array<{ time: number }>,
  fifteenBars: Array<{ time: number }>,
): CrossSeriesDensity | undefined {
  if (fiveBars.length === 0 || fifteenBars.length === 0) {
    return undefined;
  }
  const bounds = (bars: Array<{ time: number }>) => {
    let min = Infinity;
    let max = -Infinity;
    for (const bar of bars) {
      if (bar.time < min) min = bar.time;
      if (bar.time > max) max = bar.time;
    }
    return { max, min };
  };
  const five = bounds(fiveBars);
  const fifteen = bounds(fifteenBars);
  const start = Math.max(five.min, fifteen.min);
  const end = Math.min(five.max, fifteen.max);
  if (end <= start) {
    return undefined;
  }
  const within = (bars: Array<{ time: number }>) =>
    bars.reduce(
      (total, bar) => total + (bar.time >= start && bar.time <= end ? 1 : 0),
      0,
    );
  return {
    fifteenCount: within(fifteenBars),
    fiveCount: within(fiveBars),
    spanDays: Number(((end - start) / 86_400_000).toFixed(2)),
  };
}

// E6 (R1b): the three score inputs the sweep used to hardwire to zero,
// each resolved and STATED — reconstructed (macro), zero-by-construction
// (provider warnings), or a deliberate raw-engine measurement (the
// learning weight). The exact literals are the contract: verifyManifest
// refuses a manifest whose conditions are absent or differ, so a corpus
// measured under other terms can never aggregate beside these — the same
// door mechanism as the clock block, one layer up. A future variant that
// legitimately changes a term updates the literal and the door together.
export type SweepConditions = {
  macroAdjustment: "historical-treasury-curve";
  providerWarningCount: "zero-by-construction";
  weightAdjustment: "raw-engine-zero";
};

// #364 round 13, finding 3: the ONE requested start both the driver's
// treasury fetchFull and the door's leading-edge tolerance derive from,
// so the two cannot drift. It is a driver CHOICE, not a provider edge —
// probed 2026-08-19 against FMP /treasury-rates: rows serve
// continuously across the 2013-01 boundary (2013-01-02 onward present)
// and coverage reaches at least 2005-01-03, so the requested start sits
// roughly eight years inside provider depth. If a REBUILT store ever
// refuses at the door's leading edge, re-probe the endpoint's earliest
// served date and move THIS constant with the recorded evidence; the
// door's tolerance follows it automatically. The STORE does not (#364
// round 18): an existing rolling store never re-fetches its head —
// fetchFull runs only on an empty store, and top-ups touch only the
// tail — so deepening this constant requires deleting the
// treasury-rates rolling store first. The driver pre-flight refuses a
// store whose head sits later than this requested start, naming that
// remedy, which is also what keeps each manifest's requestedStartMs an
// honest term rather than a build artifact.
export const TREASURY_FETCH_START_MS = Date.UTC(2013, 0, 1);

// #364 round 2, finding 1: conditions.macroAdjustment is a CLAIM, and a
// claim without evidence is exactly what the manifest exists to end —
// an empty or holed curve would score zeros (or worse, months-stale
// rows where the visibility pointer stalls inside a hole) under a
// manifest asserting reconstruction. So the curve carries facts the way
// every bar series does, and verifyManifest asserts them beside the
// conditions literals. Not seriesFacts: the clock witnesses expect
// New-York-stamped bars, and treasury rows are UTC-midnight date labels
// a daily witness would false-condemn.
export type TreasuryCurveFacts = {
  count: number;
  firstTime: number | null;
  // #364 round 14, finding 2: largestGapMs is POSITIONLESS, so the door
  // could only refuse a holed curve absolutely — a 2015 hole blocking a
  // 2020-2026 corpus no decision of which reads across it. Week-plus
  // gaps therefore carry their positions (present only when any exist,
  // so healthy curves hash identically to before), letting the door
  // refuse exactly the corpora whose span a hole touches. NOT part of
  // conditionsOf identity — that keeps firstTime/largestGapMs, both
  // day-stable.
  gapsOverWeekMs?: Array<{ endMs: number; startMs: number }>;
  largestGapMs: number;
  lastTime: number | null;
  // #364 round 17, finding 2: the fetch start THIS corpus was requested
  // under — a measurement TERM, recorded so the door's leading-edge
  // check judges the corpus by its own request rather than by the
  // current build's constant. Without it, deepening
  // TREASURY_FETCH_START_MS (a live option — the provider serves to at
  // least 2005) would retroactively condemn every archived corpus whose
  // curve was exactly as deep as it was asked to be, permanently and
  // with no override. Absent on manifests predating the field, which
  // were all requested at the 2013-01-01 constant, so the build-value
  // fallback is exact for that population. Set by the driver, not
  // derivable from rows.
  requestedStartMs?: number;
};

// #364 round 15: ONE overlap predicate for the interior-hole law,
// called by the driver pre-flight (span = the requested --days window)
// and the corpus door (span = the corpus bounds) — the round-13
// shared-constant discipline applied to the mechanism, so the next
// scoping change lands in both places by construction. A gap touches a
// span when any part of it can stall the visibility pointer for a
// decision inside the span; gaps must come from the WHOLE store's
// facts — measuring gaps over pre-filtered rows deletes the left
// anchor of exactly the hole that straddles the span's edge (round 15,
// finding 1).
export function treasuryGapTouching(
  gaps: Array<{ endMs: number; startMs: number }> | undefined,
  spanStartMs: number,
  spanEndMs: number,
): { endMs: number; startMs: number } | undefined {
  return gaps?.find((gap) =>
    gap.endMs >= spanStartMs && gap.startMs <= spanEndMs
  );
}

// The fetch-time zero-row chunk law (#364 round 2, finding 1; split
// #364 round 20, finding 1). I3's reasoning covers a 200 carrying an
// empty or unparseable body, which !response.ok does not — a zero-row
// chunk would hole the curve permanently (fetchSince only tops up the
// tail) and every decision inside the hole would score against stale
// rows. The Treasury market publishes ~250 rows/year, so any window of
// a week or more with zero parseable rows is a provider failure, never
// a holiday run; windows under 7 days (top-ups, the truncated final
// chunk) may be legitimately empty over a weekend.
//
// Round 20 split the diagnosis: a zero-row chunk that STARTS at
// TREASURY_FETCH_START_MS is not a hole — it is the constant asking
// deeper than the provider serves, and the runbook's own deepening
// procedure (probe → move the constant → delete the store) routes the
// operator straight into this branch when the probe was wrong. The
// hole remedies ("delete the store and refetch") cannot clear it — the
// store is already gone — so this branch names the constant and the
// move-it-back remedy, which round 19 had placed only on the
// store-head pre-flight that an empty store can never reach. Interior
// chunks keep the hole diagnosis: a zero-row window inside served
// coverage is exactly what this guard was built for. Both branches
// carry the chunk's own parser-refusal count (#364 round 14, finding
// 2): rows the parser refused are deterministic on refetch, so without
// the count "the provider serves nothing" is unverifiable from the
// message alone.
//
// Both branches carry must-stay-red TOKENS (#364 round 21, finding 1)
// the way the cache integrity errors do, because both causes are
// DETERMINISTIC, never transport: swallowed by the driver's
// --warm-only transport tolerance, the survey would exit 0, the
// top-up script would print "top-up complete", and the store would
// never warm (the rolling store writes only after a successful
// fetch) — a permanent false green. That lie is the whole cost (#364
// round 22, finding 2): this function throws on the FIRST zero-row
// chunk, so a wrong constant costs one request per run and a
// cold-store interior hole at most ~13 — never a quota problem. The
// driver matches both tokens and exits red DEFERRED to the end of
// the bar survey (#364 round 22, finding 1), so the roster still
// warms under a cause that never self-heals.
// How far past a chunk's requested `from` its oldest returned row may sit
// before the response reads as truncated rather than merely thin. Two weeks
// covers a holiday cluster and a provider whose coverage starts a few days
// into the window; the failure this exists for left NINE MONTHS.
const TREASURY_CHUNK_REACHBACK_TOLERANCE_MS = 14 * 86_400_000;

export function treasuryChunkRefusal(input: {
  chunkRows: number;
  earliestRowMs?: number | null;
  fromMs: number;
  parserRefusals: number;
  windowToMs: number;
}): string | null {
  const iso0 = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  // TRUNCATION, checked before emptiness because a truncated chunk is not
  // empty and every previous guard here tested only `chunkRows > 0`. The
  // endpoint sets no `limit` and served the NEWEST ~62 rows of each window,
  // so a 365-day chunk returned its last quarter and the guard passed it —
  // 25.4% coverage, pinned into the store, invisible to every reader.
  //
  // Scoped away from the requested start, where a later first row is the
  // provider's floor rather than truncation; that case is the coverage
  // refusal below and its remedy is different.
  if (
    input.chunkRows > 0 &&
    input.earliestRowMs != null &&
    input.fromMs !== TREASURY_FETCH_START_MS &&
    input.earliestRowMs - input.fromMs > TREASURY_CHUNK_REACHBACK_TOLERANCE_MS
  ) {
    return (
      `treasuryChunkTruncated: Treasury-rate chunk ${iso0(input.fromMs)}..` +
      `${iso0(input.windowToMs)} returned ${input.chunkRows} rows but its ` +
      `oldest is ${iso0(input.earliestRowMs)} — ${
        Math.round((input.earliestRowMs - input.fromMs) / 86_400_000)
      } days after the window opened. The response was capped newest-first, ` +
      `so the chunk is a partial view pinned as if it were the whole one. ` +
      `Narrow the fetch chunk until each response reaches its own start; do ` +
      `not widen the tolerance.`
    );
  }
  if (
    input.chunkRows > 0 || input.windowToMs - input.fromMs < 7 * 86_400_000
  ) {
    return null;
  }
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const span = `${iso(input.fromMs)}..${iso(input.windowToMs)}`;
  const parserNote = input.parserRefusals > 0
    ? ` NOTE: ${input.parserRefusals} provider rows in this chunk were ` +
      `refused by the parser THIS run (macroRates.ts date/tenor bounds) — ` +
      `the provider may be serving rows we refuse; investigate those rows ` +
      `first`
    : "";
  if (input.fromMs === TREASURY_FETCH_START_MS) {
    return (
      `treasuryCoverageRefused: Treasury-rate chunk ${span} starts at the ` +
      `requested fetch start and returned zero parseable rows — the ` +
      `provider serves nothing at TREASURY_FETCH_START_MS's depth, so this ` +
      `is coverage, not a hole: deleting and refetching the store cannot ` +
      `clear it; re-probe the endpoint's earliest served date and move ` +
      `TREASURY_FETCH_START_MS with the recorded evidence.` + parserNote
    );
  }
  return (
    `treasuryChunkHole: Treasury-rate chunk ${span} returned zero ` +
    `parseable rows — a holed curve is refused, never merged and pinned.` +
    parserNote
  );
}

export function treasuryCurveFacts(
  rows: Array<{ dateMs: number }>,
): TreasuryCurveFacts {
  if (rows.length === 0) {
    return { count: 0, firstTime: null, largestGapMs: 0, lastTime: null };
  }
  const times = rows.map((row) => row.dateMs).sort((a, b) => a - b);
  let largestGapMs = 0;
  const gapsOverWeekMs: Array<{ endMs: number; startMs: number }> = [];
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (gap > largestGapMs) {
      largestGapMs = gap;
    }
    if (gap > 7 * 86_400_000) {
      gapsOverWeekMs.push({ endMs: times[index], startMs: times[index - 1] });
    }
  }
  return {
    count: rows.length,
    firstTime: times[0],
    ...(gapsOverWeekMs.length > 0 && { gapsOverWeekMs }),
    largestGapMs,
    lastTime: times[times.length - 1],
  };
}

export type SweepManifest = {
  analyzerVersion: string;
  anchor: string;
  barRejections: Record<string, number>;
  // R0: the normalization every series in this corpus was stamped under —
  // asserted by the store guard at load, witnessed per series in the
  // facts below, and REQUIRED by every reader (sweepStats.verifyManifest
  // refuses a manifest without it, which is every pre-R0 corpus).
  clock: {
    calendar: string;
    normalizer: string;
  };
  conditions: SweepConditions;
  days: number;
  // 3c/3d: the calendar folds this corpus was decided under — absent on
  // legacy two-split corpora, whose readers map train/test instead.
  folds?: Array<{
    decisionEndMs: number;
    endMs: number;
    name: string;
    startMs: number;
  }>;
  // Per-class fold sets (each class walks forward on its own union span);
  // present on fleet corpora built with --fold-spec, replacing `folds`.
  foldsByClass?: Record<
    string,
    Array<{
      decisionEndMs: number;
      endMs: number;
      name: string;
      startMs: number;
    }>
  >;
  generatedAt: string;
  grid: unknown[];
  // 3e: markets whose rows exist for the one confirmation read and are
  // excluded from every tuning aggregate — a property of the corpus.
  holdoutSymbols?: string[];
  manifestHash: string;
  stepBars: number;
  symbols: Array<{
    calibration: Record<string, unknown>;
    calibrationHash: string;
    // R0: relative registration of the 5-minute series against the
    // 15-minute primary — the audit's own mixed-clock instrument.
    crossSeriesClock?: CrossSeriesClock;
    // #364 round 10: shared-window counts for the density ratio.
    crossSeriesDensity?: CrossSeriesDensity;
    providerSymbol: string;
    series: Record<string, SeriesFacts>;
    symbol: string;
  }>;
  trainShare: number;
  // The evidence behind conditions.macroAdjustment (#364 round 2,
  // finding 1) — asserted by verifyManifest beside the literals.
  treasuryCurve: TreasuryCurveFacts;
  warmupBars: number;
};

export function buildSweepManifest(input: {
  analyzerVersion: string;
  anchor: string;
  barRejections: Record<string, number>;
  clock: SweepManifest["clock"];
  conditions: SweepConditions;
  days: number;
  folds?: SweepManifest["folds"];
  foldsByClass?: SweepManifest["foldsByClass"];
  generatedAt: string;
  grid: unknown[];
  holdoutSymbols?: string[];
  stepBars: number;
  // Precomputed per-series FACTS, not raw bars: the driver computes
  // seriesFacts per symbol as it loads and releases the arrays — holding
  // every symbol's full series until the end of the run for the manifest
  // is what OOM'd the first baseline attempt at the 4GB default heap.
  symbols: Array<{
    calibration: Record<string, unknown>;
    crossSeriesClock?: CrossSeriesClock;
    crossSeriesDensity?: CrossSeriesDensity;
    providerSymbol: string;
    series: Record<string, SeriesFacts>;
    symbol: string;
  }>;
  trainShare: number;
  treasuryCurve: TreasuryCurveFacts;
  warmupBars: number;
}): SweepManifest {
  const symbols = input.symbols.map((entry) => ({
    calibration: entry.calibration,
    calibrationHash: sha256Hex(stableStringify(entry.calibration)),
    ...(entry.crossSeriesClock && {
      crossSeriesClock: entry.crossSeriesClock,
    }),
    ...(entry.crossSeriesDensity && {
      crossSeriesDensity: entry.crossSeriesDensity,
    }),
    providerSymbol: entry.providerSymbol,
    series: entry.series,
    symbol: entry.symbol,
  }));
  // The hash covers everything that DEFINES the measurement. The write
  // timestamp deliberately sits outside it: two runs under identical
  // conditions produce one hash, and a reader asserting the hash is
  // asserting conditions, not wall-clock provenance.
  const hashedPayload = {
    analyzerVersion: input.analyzerVersion,
    anchor: input.anchor,
    barRejections: input.barRejections,
    clock: input.clock,
    conditions: input.conditions,
    days: input.days,
    ...(input.folds && { folds: input.folds }),
    ...(input.foldsByClass && { foldsByClass: input.foldsByClass }),
    grid: input.grid,
    ...(input.holdoutSymbols && { holdoutSymbols: input.holdoutSymbols }),
    stepBars: input.stepBars,
    symbols,
    trainShare: input.trainShare,
    treasuryCurve: input.treasuryCurve,
    warmupBars: input.warmupBars,
  };
  return {
    ...hashedPayload,
    generatedAt: input.generatedAt,
    manifestHash: sha256Hex(stableStringify(hashedPayload)),
  };
}
