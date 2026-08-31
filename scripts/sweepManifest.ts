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
  type GridRegistration,
  type SeriesClockWitness,
  seriesClockWitness,
  type SessionAnchorWitness,
  type SeriesRole,
} from "./clockWitness.ts";

export type SeriesFacts = {
  // R0: the series' own clock evidence (clockWitness.ts) — recorded so a
  // reader can see WHY the corpus was accepted, not merely that it was.
  clock: SeriesClockWitness;
  count: number;
  firstTime: number | null;
  largestGapMs: number;
  /**
   * P5: the longest gap between consecutive bars INSIDE the recent window —
   * this series' own measure of a long-but-lawful silence, spanning ~13
   * weekends and any holidays among them. A staleness gate reads it so the
   * bound is the MARKET'S rather than a constant chosen for a different
   * market's cadence.
   */
  recentMaxGapMs?: number;
  lastTime: number | null;
  // Rows in the last DENSITY_RECENT_WINDOW_DAYS, so the class floor can judge
  // current feed health rather than a whole-span average that penalises depth.
  // Optional for the same reason as CrossSeriesDensity's.
  recentCount?: number;
  recentSpanDays?: number;
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
  const first = times[0];
  const last = times[times.length - 1];
  let largestGapMs = 0;
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (gap > largestGapMs) {
      largestGapMs = gap;
    }
  }
  // P5: THE MARKET'S OWN IDEA OF A LONG SILENCE, so a staleness gate can judge
  // it against itself rather than against a constant.
  //
  // A flat bound cannot serve this roster. Seven days is right for the daily
  // Treasury curve it was derived for, far too loose for a 24/7 five-minute
  // crypto store that is dead at six hours, and too tight for an agricultural
  // future carrying a lawful weekend-plus-holiday gap.
  //
  // Two statistics were tried and rejected, both recorded because the second
  // was wrong in a way that reads plausible:
  //
  //   the MAXIMUM over all history — too loose. 25 of the roster's stores
  //   carry a historical gap of 14 days or more and NZDUSD carries 72, so the
  //   bound would permit a silence as long as the market's worst past outage.
  //
  //   the p99 over all history — too TIGHT, and the first draft of this
  //   comment claimed the opposite: that "a session market's routine gaps are
  //   the bulk of its distribution rather than its tail". They are the bulk;
  //   the WEEKEND gaps are the thin tail. A five-day forex week has 40
  //   weekend gaps among 19,040 bars, i.e. 0.2%, so the p99 sits at the
  //   ordinary 15-minute inter-bar gap and every lawful weekend is past the
  //   bound. A fixture caught it immediately.
  //
  // What is right is the LONGEST SILENCE THIS MARKET HAS HAD RECENTLY: the
  // maximum gap inside the same recent window the density gate judges. That
  // window spans ~13 weekends and any holidays among them, so every lawful
  // gap is inside the bound by construction, while an outage from years ago
  // is outside the window and cannot loosen it.
  const recentGapStart = last - DENSITY_RECENT_WINDOW_DAYS * 86_400_000;
  let recentMaxGapMs = 0;
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] < recentGapStart) continue;
    const gap = times[index] - times[index - 1];
    if (gap > recentMaxGapMs) recentMaxGapMs = gap;
  }
  const recent = recentWindow(times, last);
  return {
    clock: seriesClockWitness(bars, role),
    count: bars.length,
    firstTime: first,
    recentMaxGapMs,
    largestGapMs,
    recentCount: recent.count,
    recentSpanDays: recent.spanDays,
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
  // The same counts over the last DENSITY_RECENT_WINDOW_DAYS of the shared
  // window. Optional so a pre-2026-08-23 manifest still parses; the gate falls
  // back to the whole span when they are absent.
  recentFifteenCount?: number;
  recentFiveCount?: number;
  recentSpanDays?: number;
  spanDays: number;
};

// The window the density gates JUDGE on, and why it exists.
//
// Both density predicates — the absolute class floor and the 5min/15min ratio —
// were evaluated over a series' WHOLE span while the floors themselves were
// "probed margin under the measured week" (sweepStats.ts), a seven-day recent
// window. That is depth-blind, and it penalises exactly the markets worth most:
// a series reaching back to 2013 averages below a floor calibrated on 2026
// coverage because its early years are legitimately sparser, not because the
// feed is clipped, holed or wrong — which is the only thing the floor exists to
// catch.
//
// Measured 2026-08-23 on the R0 rebuild's own stores: LTCUSD 216.6 rows/day
// whole-span against a floor of 260, and 288.0/day over its last 90 — which is
// the theoretical MAXIMUM for a 24/7 5-minute series. BTCUSD 235.9 -> 288.0.
// PAUSD's ratio 2.678 whole-span against a band opening at 2.70, and 2.916 over
// its last 90. All four were forecast REFUSED at R3's max depth by a gate
// measuring the wrong thing, and amendment 31 says a matched market leaves the
// offering only on a calibration verdict, never on caution.
//
// 90 days rather than the calibration's 7: long enough that a holiday cluster
// cannot move it, short enough to state current feed health. Holes remain the
// job of `largestGapMs`, which reads the whole span and is untouched.
export const DENSITY_RECENT_WINDOW_DAYS = 90;

function recentWindow(
  times: number[],
  endMs: number,
): { count: number; spanDays: number } {
  const startMs = Math.max(
    endMs - DENSITY_RECENT_WINDOW_DAYS * 86_400_000,
    times[0],
  );
  const spanDays = (endMs - startMs) / 86_400_000;
  if (spanDays <= 0) {
    return { count: times.length, spanDays: 0 };
  }
  let count = 0;
  for (const time of times) {
    if (time >= startMs && time <= endMs) count += 1;
  }
  return { count, spanDays: Number(spanDays.toFixed(2)) };
}

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
  const recentStart = Math.max(
    end - DENSITY_RECENT_WINDOW_DAYS * 86_400_000,
    start,
  );
  const withinRecent = (bars: Array<{ time: number }>) =>
    bars.reduce(
      (total, bar) =>
        total + (bar.time >= recentStart && bar.time <= end ? 1 : 0),
      0,
    );
  return {
    fifteenCount: within(fifteenBars),
    fiveCount: within(fiveBars),
    recentFifteenCount: withinRecent(fifteenBars),
    recentFiveCount: withinRecent(fiveBars),
    recentSpanDays: Number(((end - recentStart) / 86_400_000).toFixed(2)),
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
  /**
   * The fourth hardwired score term, named by its INPUT rather than by one of
   * its two effects.
   *
   * `buildDecisionMarketContext` builds `15min`, `1day`, `1hour` and `4hour`
   * unconditionally and admits each on `length > 0`; only `5min` carries a
   * floor. So the count is at least four offline, always — while live it can
   * fall below three whenever the loader is short a frame. TWO things read it
   * and both are therefore zero-by-construction in a corpus and live in
   * production: `scoring.ts`'s `timeframePenalty`, and
   * `executionQuality.ts`'s coverage penalty. An earlier proposal named this
   * term `timeframePenalty`, which is one of the two — naming the input keeps
   * the other from hiding behind it.
   *
   * A STATED CONDITION, deliberately not a per-row field: it never varies
   * within a corpus, and a column of identical values is a fact about the
   * build wearing the costume of a measurement.
   */
  availableTimeframeCount: "min-four-by-construction";
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

/**
 * Four facts about the economic-calendar store, recorded beside the Treasury
 * curve's. NOT a coverage statement: two counts and two endpoints cannot
 * detect a hole in the middle. Deleting three months from the live store
 * leaves both endpoints bit-identical and moves the ratio by 0.002 while
 * 1,348 events go missing, so read these as what they are.
 *
 * `itemCount` SITS BESIDE `distinctTimes` deliberately. The two being EQUAL
 * ACROSS THE WHOLE STORE is the signature of the collapse that discarded 42.4%
 * of the calendar — a Map keyed on the timestamp alone keeps one row per
 * instant, so the counts match exactly.
 *
 * THE SCALE QUALIFIER IS LOAD-BEARING and an earlier draft of this comment
 * omitted it. Equality is unremarkable on a narrow slice of HEALTHY data:
 * measured on the live store, 581 of 4,194 single-day slices satisfy it and
 * 37 of 92 single-currency slices do. It is zero of 164 month slices and zero
 * of 14 year slices. So the claim holds of the store whole and of nothing
 * smaller.
 *
 * And it detects ONE shape. A merge key one field short — time|currency, or
 * time|currency|impact — discards 32.9% and 27.0% of the calendar
 * respectively while leaving the counts unequal and the ratio inside the
 * healthy band, which runs 1.463 in 2013 to 2.000 in 2026. These two numbers
 * cannot see that, and no threshold over them can: the collapsed ratio 1.490
 * sits ABOVE the healthy early-era value. What guards it is the merge key
 * being recorded and clock-coupled, not this census.
 *
 * `firstEventMs` answers a different question the corpus could not answer at
 * all: `newsPenalty: 0` conflates "no events matched this instant" with "the
 * calendar has no coverage here". The store begins 2013-01-02 while forex
 * bars begin 2009-09-24, so 38.8% of the forex fit fold is news-BLIND rather
 * than news-free. A reader compares a decision instant to this.
 *
 * NOT part of `conditions`. verifyManifest compares each conditions term to a
 * hardcoded build constant, so a store-derived number there would make every
 * corpus unreadable — the trap already documented for modeledCostScale.
 */
export type CalendarCensus = {
  distinctTimes: number;
  firstEventMs: number | null;
  itemCount: number;
  lastEventMs: number | null;
};

export function calendarCensus(
  events: Array<{ time: number }>,
): CalendarCensus {
  // A LINEAR min/max, not a spread. `Math.min(...times)` throws RangeError
  // above roughly 125,000 arguments — measured on this engine — and the store
  // already holds 74,115, so the headroom was 1.69x. Widening the impact
  // filter in replay-sweep.ts to admit low-impact events is a one-line change
  // that crosses it immediately.
  //
  // Where it would have thrown is the point: this runs AFTER the sweep body,
  // so a run of tens of hours would have ended by throwing while writing its
  // manifest, and an emit with no manifest is refused by the corpus door. The
  // whole run, unreadable, at the last step. Both siblings in this file
  // already avoid the spread — seriesFacts and treasuryCurveFacts sort and
  // index — and this one did not.
  let first: number | null = null;
  let last: number | null = null;
  const distinct = new Set<number>();
  for (const event of events) {
    const time = event.time;
    // A non-finite stamp is REFUSED rather than folded in. Left to Math.min
    // it produced NaN, which JSON.stringify writes as null — so a corrupted
    // store serialised byte-identically to an empty one, which is a silent
    // failure by this repository's own rule. Sorting would have hidden it
    // more thoroughly, not less.
    if (!Number.isFinite(time)) {
      throw new Error(
        `calendarCensus: a calendar event carries a non-finite time (${time}); ` +
          `a store that cannot state its own span must not be summarised as ` +
          `though it had none`,
      );
    }
    distinct.add(time);
    if (first === null || time < first) first = time;
    if (last === null || time > last) last = time;
  }
  return {
    distinctTimes: distinct.size,
    firstEventMs: first,
    itemCount: events.length,
    lastEventMs: last,
  };
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
  /**
   * The CLASS row for every class present in this run, before any per-symbol
   * layer. Not redundant with `symbols[].calibration`: three classes — forex,
   * metals, energies — have ZERO class-pure members, so their class row is
   * applied to nothing observable and cannot be recovered by subtracting the
   * overrides from the merges. Without this the artifact could not state the
   * class row it actually ran under.
   *
   * Derived from the asset types the run actually loaded, never a hand-kept
   * list of classes.
   */
  calibrationByClass?: Record<string, Record<string, unknown>>;
  calendarCensus?: CalendarCensus;
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
  /**
   * Every symbol the run was ASKED for, whatever came of it.
   *
   * `symbols` below holds only what survived: a market that dropped out —
   * refused at a door, starved of bars, or thrown by a fetch — is
   * indistinguishable in this manifest from one that was never requested.
   * R4 grades every matched market individually and R5 IS the never-analyzed
   * population, so both need to know what was asked and produced nothing.
   *
   * Recorded once at the top rather than as a flag per symbol, because the
   * absent rows are precisely the ones that have nowhere to carry a flag.
   */
  requestedSymbols?: string[];
  /**
   * THE COLUMNS THIS CORPUS ACTUALLY HAS, sorted, taken from the first row
   * written.
   *
   * Three columns were found missing from the emit inside a single week —
   * `ladderRewardRisk` (#473), the cost decomposition (#474), and
   * `forgoneRunnerR`, the give-back amendment 39 names by hand (#477). Each
   * was caught by a person looking, and each would have cost a second full
   * sweep against an exhausted FMP allowance had R3 run first.
   *
   * None of them moved `ANALYZER_VERSION`, correctly: none changed what the
   * engine decides. But that leaves two corpora stamped with the same version
   * differing in which columns exist, and NOTHING in the file saying which.
   * A reader that finds no `forgoneRunnerR` cannot tell a corpus that predates
   * the column from one where every runner gave back nothing — so it grades
   * the give-back as zero and reports a result.
   *
   * Recording the columns turns that into a refusal. It is not an identity
   * term and deliberately not part of `conditionsOf`: a reader asking "can
   * this corpus answer my question" is asking about capability, not about
   * whether two shards are the same measurement.
   */
  /**
   * THE ACCEPTANCE MODE THIS CORPUS WAS PRODUCED UNDER.
   *
   * Neither flag reached this file before 2026-08-31 — `buildSweepManifest`
   * took neither as an input — so two corpora with entirely different accepted
   * populations hashed byte-identically and would pool into one verdict.
   *
   * `ignoreLowEdge` is the one that moves the ACCEPTED population.
   * `sessions.ts`'s low-edge gates carry `block: true`, and `sweep.ts` rewrites
   * the context to `{ block: false, penalty: 0 }` one line before the branch
   * that would have rejected it — so an `--ignore-low-edge` arm grades hours
   * the live desk refuses outright, and a normal arm does not.
   *
   * `captureAll` never sets `accepted: true`; it KEEPS rows that failed a
   * gate, and skips the regime block and the acceptance-gate attribution. So
   * it changes the denominator rather than the numerator — which is exactly
   * the kind of difference a reader computing a rate must not be blind to.
   *
   * Top level, never in `conditions`: those terms are compared to a hardcoded
   * literal, and both values here are legitimate by design, so any literal
   * would refuse one arm on every path. It DOES join `conditionsOf` — like
   * `days`, it is a CLI parameter constant across a legitimate shard set, so
   * it separates two measurements without making the corpus id
   * population-dependent.
   */
  acceptance?: { captureAll: boolean; ignoreLowEdge: boolean };
  emitColumns?: string[];
  /**
   * The engine revision this corpus was measured under. Optional because
   * every pre-#409 corpus on disk genuinely lacks it — not because a new
   * sweep may omit it.
   */
  source?: SweepSource;
  stepBars: number;
  symbols: Array<{
    /** The class the merged calibration inherited from. */
    assetType?: string;
    calibration: Record<string, unknown>;
    calibrationHash: string;
    /**
     * The per-symbol override ALONE — what was chosen for this market rather
     * than applied to it. `calibration` above is the MERGE of the class row
     * and this, and a merge cannot be un-merged: it answers which values
     * applied and never whether they were authored for the market. 72 of 97
     * markets carry one.
     *
     * It answers class-vs-symbol only. Derived-vs-legacy is a different
     * question and `source` below is what addresses it.
     */
    symbolOverride?: Record<string, unknown>;
    // R0: relative registration of the 5-minute series against the
    // 15-minute primary — the audit's own mixed-clock instrument.
    crossSeriesClock?: CrossSeriesClock;
    // #364 round 10: shared-window counts for the density ratio.
    crossSeriesDensity?: CrossSeriesDensity;
    /**
     * C3: whether the 5-minute children bracket inside their 15-minute
     * parents. crossSeriesClock beside it compares DAY EXTREMES bucketed on
     * the UTC calendar day, so it cannot see a one-sided shift on a market
     * whose session sits inside the day — it read "aligned" at matchRateAtZero
     * 1.000 against a real 4-hour displacement on nine of them.
     */
    gridRegistration?: GridRegistration;
    providerSymbol: string;
    series: Record<string, SeriesFacts>;
    // R0f: the venue session anchor — the ONLY ABSOLUTE intraday witness,
    // and until 2026-08-24 the only one absent from this manifest. The
    // relative instrument beside it (crossSeriesClock) is blind to a store
    // whose 5-minute and 15-minute series are displaced TOGETHER, which is
    // exactly what a provider labelling bars in local exchange time
    // produces; it reported "aligned" on three indices displaced by 6, 13
    // and 14 hours. The absolute witness that can see it ran only when a
    // human typed `npx tsx scripts/verify-cache-clock.ts`, so the corpus
    // door had no fact to judge. Present only for symbols carrying an
    // anchor (REFERENCE_SESSION_ANCHORS), absent for continuous markets.
    sessionAnchor?: SessionAnchorWitness;
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
  calibrationByClass?: Record<string, Record<string, unknown>>;
  calendarCensus?: CalendarCensus;
  clock: SweepManifest["clock"];
  conditions: SweepConditions;
  days: number;
  folds?: SweepManifest["folds"];
  foldsByClass?: SweepManifest["foldsByClass"];
  generatedAt: string;
  grid: unknown[];
  holdoutSymbols?: string[];
  source?: SweepSource;
  stepBars: number;
  // Precomputed per-series FACTS, not raw bars: the driver computes
  // seriesFacts per symbol as it loads and releases the arrays — holding
  // every symbol's full series until the end of the run for the manifest
  // is what OOM'd the first baseline attempt at the 4GB default heap.
  symbols: Array<{
    assetType?: string;
    calibration: Record<string, unknown>;
    symbolOverride?: Record<string, unknown>;
    crossSeriesClock?: CrossSeriesClock;
    crossSeriesDensity?: CrossSeriesDensity;
    gridRegistration?: GridRegistration;
    sessionAnchor?: SessionAnchorWitness;
    providerSymbol: string;
    series: Record<string, SeriesFacts>;
    symbol: string;
  }>;
  trainShare: number;
  /**
   * Every symbol the run was ASKED for, whatever came of it.
   *
   * `symbols` below holds only what survived: a market that dropped out —
   * refused at a door, starved of bars, or thrown by a fetch — is
   * indistinguishable in this manifest from one that was never requested.
   * R4 grades every matched market individually and R5 IS the never-analyzed
   * population, so both need to know what was asked and produced nothing.
   *
   * Recorded once at the top rather than as a flag per symbol, because the
   * absent rows are precisely the ones that have nowhere to carry a flag.
   */
  requestedSymbols?: string[];
  /** See `SweepManifest.acceptance`. Required on every new manifest. */
  acceptance?: { captureAll: boolean; ignoreLowEdge: boolean };
  /** Sorted keys of the first emitted row. See `SweepManifest.emitColumns`. */
  emitColumns?: string[];
  treasuryCurve: TreasuryCurveFacts;
  warmupBars: number;
}): SweepManifest {
  const symbols = input.symbols.map((entry) => ({
    ...(entry.assetType && { assetType: entry.assetType }),
    calibration: entry.calibration,
    calibrationHash: sha256Hex(stableStringify(entry.calibration)),
    ...(entry.symbolOverride && { symbolOverride: entry.symbolOverride }),
    ...(entry.gridRegistration && { gridRegistration: entry.gridRegistration }),
    ...(entry.sessionAnchor && { sessionAnchor: entry.sessionAnchor }),
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
  // The hash covers everything that DEFINES the measurement, and the engine
  // revision is part of that definition: `analyzerVersion` is bumped by hand
  // and covers the analyzer only, so two corpora can carry identical
  // conditions and still have been measured by different code — which is
  // exactly how the 2026-08-11 clock defect crossed a whole corpus unseen.
  // A doc-only commit therefore re-hashes an otherwise identical run. That
  // is the conservative direction: a false difference asks a human to look,
  // where a false sameness silently licenses comparing two engines.
  //
  // The write timestamp still sits outside the hash: a reader asserting the
  // hash is asserting conditions, not wall-clock provenance.
  const hashedPayload = {
    analyzerVersion: input.analyzerVersion,
    anchor: input.anchor,
    barRejections: input.barRejections,
    ...(input.calibrationByClass &&
      { calibrationByClass: input.calibrationByClass }),
    clock: input.clock,
    conditions: input.conditions,
    days: input.days,
    ...(input.folds && { folds: input.folds }),
    ...(input.foldsByClass && { foldsByClass: input.foldsByClass }),
    grid: input.grid,
    ...(input.holdoutSymbols && { holdoutSymbols: input.holdoutSymbols }),
    ...(input.source && { source: input.source }),
    stepBars: input.stepBars,
    symbols,
    trainShare: input.trainShare,
    ...(input.calendarCensus && { calendarCensus: input.calendarCensus }),
    ...(input.requestedSymbols &&
      { requestedSymbols: [...input.requestedSymbols].sort() }),
    // Sorted at the boundary so a reordered emit cannot re-hash a corpus
    // whose columns are unchanged. Conditionally spread, so no existing
    // fixture's hash moves.
    ...(input.acceptance && { acceptance: input.acceptance }),
    ...(input.emitColumns && { emitColumns: [...input.emitColumns].sort() }),
    treasuryCurve: input.treasuryCurve,
    warmupBars: input.warmupBars,
  };
  return {
    ...hashedPayload,
    generatedAt: input.generatedAt,
    manifestHash: sha256Hex(stableStringify(hashedPayload)),
  };
}

/**
 * The engine revision a corpus was measured under.
 *
 * `analyzerVersion` does not answer this. It is bumped by hand on
 * behavior-changing analyzer PRs, so it moves for some changes and not for
 * others, and it says nothing at all about the harness — `replay-sweep.ts`,
 * `sweep.ts`, the witnesses — which is where the 2026-08-11 clock defect
 * lived. Two corpora can carry the same analyzerVersion and the same
 * conditions and still be two different measurements.
 *
 * `dirty` is not decoration. A corpus measured on a working tree with
 * uncommitted edits cannot be reproduced from its revision, and the register
 * has to be able to say so rather than imply a clean checkout.
 */
export type SweepSource = { dirty: boolean; revision: string };

/**
 * Resolve the revision from git, refusing rather than guessing.
 *
 * Call this at sweep START. A sweep runs for tens of hours, and a git failure
 * discovered while writing the manifest would discard the whole run; resolved
 * up front it costs a second. Validate before mutating.
 */
export function resolveSweepSource(
  run: (args: string[]) => string,
): SweepSource {
  const revision = run(["rev-parse", "HEAD"]).trim();
  // A short or empty answer means git answered something other than a commit.
  // Recording it would put an unusable string where provenance goes.
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(
      `resolveSweepSource: git rev-parse HEAD returned ${JSON.stringify(revision)}, not a commit SHA`,
    );
  }
  return { dirty: run(["status", "--porcelain"]).trim().length > 0, revision };
}
