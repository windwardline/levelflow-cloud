// R0 "one clock" (remediation program 2026-08-11, Phase 0): measurable
// evidence of which clock a cached series' stamps are on, computed from the
// series itself — never assumed from provenance.
//
// The defect this guards against: the pre-2026-08-09 normalizer read FMP's
// New-York wall stamps as UTC ("naive"), and the rolling cache only ever
// tops up, so bars normalized under that era survived every later fix. The
// 4c/4d corpus resolved every setup 4-5 hours out of register with its own
// decision bar because the 15-minute and daily stores were naive while the
// 5-minute store (first fetched after the fix) was true UTC.
//
// Everything here judges PER YEAR and then aggregates, because the real
// defect shape is era-mixing: an aggregate share blurs a minority naive
// era into an affirmative healthy verdict (measured in the #358
// adversarial round: a 30%-naive weekly histogram still cleared the 0.6
// modal floor, a 5-of-16-naive-year transition mean read 0.987 "utc", and
// a half-poisoned primary matched its true mate on 51% of days —
// "aligned"). Year granularity is the honest resolution: the condemned
// store's naive era spans ~16 years and its true era weeks.
//
// The witnesses, each honest about what it can and cannot see:
//
// - DAILY-STAMP witness (universal, condemning): FMP end-of-day rows are
//   date-only labels; the current normalizer stamps them at New York
//   midnight (04/05 UTC), the naive era at 00 UTC. Judged per year: one
//   naive year among true years is "mixed", down to a ~5% admixture
//   within the year AND at least 5 rows of each midnight (~12 trading
//   days in a full year; the absolute floor keeps a partial first/last
//   year from condemning on two rows) — the stated noise floor, below
//   which this witness is blind.
//
// - WEEKLY-OPEN witness (intraday, proving only): a session market's week
//   opens at a fixed venue wall hour, so under true UTC the weekly first
//   bar's UTC hour moves by exactly one hour between the EDT and EST
//   regimes; under naive stamps it never moves. Seasonal INVARIANCE
//   proves nothing — a venue without DST (Tokyo) is invariant in UTC too
//   — so this witness only ever returns "utc" or "indeterminate", never
//   condemns. tests/clockWitness.test.ts pins the Nikkei-shaped false
//   positive it must not commit.
//
// - SPRING-TRANSITION witness (24/7 intraday, condemning): on the
//   spring-forward Sunday the New York wall clock has no 02:xx hour, so a
//   naive 24/7 series is missing exactly that hour's stamps (ratio
//   23/24 ≈ 0.958 against neighboring Sundays) while true UTC keeps the
//   full day. Fall-back days discriminate nothing — the repeated wall
//   hour collapses to one instant under BOTH parsers — so only spring
//   Sundays are sampled, and only 2007+ (the current US DST rule; the
//   pre-2007 rule differed and a mis-sampled ordinary Sunday reads ~1.0,
//   diluting toward a false pass). Judged per year against the
//   NAIVE-SHAPED band [0.93, 0.975] — the signature of losing exactly
//   one wall hour — so an outage dent (arbitrary, usually deeper) reads
//   as a gap, never as clock evidence: two or more naive-shaped years
//   is "mixed" even when the median is clean; a naive-shaped median
//   condemns an all-naive store. Three sampled springs suffice — the
//   young 2020-2023 crypto listings carry 3-6, the deep majors (BTC
//   2013-11, ETH 2015, DASH/DOGE 2017) 9-13.
//
// - CROSS-SERIES registration (per symbol, condemning): two series of the
//   same market on the same clock agree on each day's extremes at zero
//   shift; a naive series against a true-UTC one registers at ±4/5 hours
//   instead. This is the audit's own instrument. Judged globally AND per
//   year, because a half-poisoned primary still matches its healthy mate
//   on the healthy half's days. It measures RELATIVE registration only:
//   two series that are both naive read as aligned — which for a
//   sessioned market no venue-agnostic instrument can catch (measured,
//   not conjectured), and is why the reference session anchor below and
//   the constructive store stamp exist.
//
// - REFERENCE SESSION ANCHOR (one designated symbol, condemning): the 2b
//   proof mechanized. ^GSPC's cash session opens 09:30 New York wall in
//   July AND January — a measured venue fact, safe to assert precisely
//   because it is venue-SPECIFIC (the Tokyo trap does not apply to a
//   symbol whose venue we name). A store whose modal first-bar wall time
//   is displaced from 09:30 is on the wrong clock — including the one
//   failure the relative instruments provably cannot see: the provider
//   changing its own stamp convention under a normalizer still carrying
//   the old assumption, which shifts every series together.
//
// A verdict is never a substitute for the constructive guarantee — the
// rolling store's clock stamp (calibrationCache.ts), written only by the
// current normalizer's build — but it is the independent check that the
// guarantee holds on the data itself (amendment 38: verify, don't relay).

import { newYorkClockParts } from "../supabase/functions/trade-analyzer/bars.ts";
import { VENUE_CLOCKS } from "../supabase/functions/trade-analyzer/venues.ts";

/**
 * The economic-calendar store's clock. FMP stamps CALENDAR events in true
 * UTC (NFP Jul-2026 stamps 12:30:00 = 08:30 ET) — the other half of the
 * one-provider-two-conventions split that bars.ts documents — and
 * replay-sweep.ts's fetchCalendarEvents has always parsed it that way
 * (`+"Z"`) across this repository's entire history. (The repo's history
 * begins 2026-08-10, after the normalizer fix; the pre-repo era is
 * unverifiable from git and is covered by the rebuild runbook archiving
 * the whole cache directory, cot files included.)
 */
export const CALENDAR_CLOCK = "fmp-calendar-utc-v1";

/**
 * The economic-calendar store's own clock, split from CALENDAR_CLOCK on
 * 2026-08-25 so a calendar-only defect could invalidate the calendar alone.
 *
 * The two stores shared a constant because they share a TIME CONVENTION, and
 * that was right until the convention stopped being the only thing a stamp
 * had to carry. The calendar's merge key changed — it was collapsing 43% of
 * every fetch onto one survivor per instant — so its store must be refetched
 * and every corpus built on the old one refused. The Treasury curve has the
 * same convention, is correct, took five build attempts to get right, and
 * shares none of that defect. Bumping one constant would have deleted it as
 * collateral.
 *
 * v2 rather than v1: any store or manifest carrying the old stamp predates
 * the composite key and is missing events that cannot be recovered from it.
 */
export const ECON_CALENDAR_CLOCK = "fmp-econ-calendar-utc-v2";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type WitnessVerdict = "indeterminate" | "mixed" | "naive" | "utc";

export type SeriesClockWitness = {
  /** Daily-stamp evidence: aggregate shares plus per-year verdict counts. */
  daily?: {
    midnightNyShare: number;
    midnightUtcShare: number;
    mixedYears: number;
    naiveYears: number;
    sampled: number;
    utcYears: number;
  };
  /** Spring-forward evidence: whether the skipped wall hour is empty, per year. */
  transition?: {
    /** Springs whose UTC hour 02 was empty against an intact day. */
    naiveYears: number;
    sampled: number;
    /**
     * Median occupancy of the skipped wall hour as a share of the day's
     * other hours: ~0 on a naive store, ~1 on a true-UTC one. Reported for
     * the reader; the per-year counts are what carry the verdict.
     */
    skippedHourShare: number | null;
    /**
     * Spring Sundays dropped because the day was too ragged to testify about
     * one hour of itself — a naive day keeps 23 full hours and loses exactly
     * one, so a day dented across many hours is a gap, not evidence. Present
     * only when some were dropped, so an abstention says which kind it is.
     */
    sparseSkipped?: number;
    /** Springs whose UTC hour 02 was populated like the rest of the day. */
    utcYears: number;
  };
  verdict: WitnessVerdict;
  /**
   * WHICH sub-witness produced `verdict`. Recorded because the two were
   * collapsed into one field until 2026-08-24, and one of them was circular:
   * a reader could not tell a constructive spring-transition verdict from a
   * weekly-open verdict that merely restated the normalizer's own signature.
   * "none" means nothing could speak — an honest abstention, not health.
   */
  verdictFrom: "daily" | "transition" | "none";
  /** Weekly-open evidence: modal UTC hour of the week's first bar, by DST regime. */
  weekly?: {
    edtHour: number | null;
    edtShare: number;
    estHour: number | null;
    estShare: number;
    sampled: number;
  };
};

export type SeriesRole = "daily" | "intraday";

/** New York's UTC offset in hours at an instant: 4 under EDT, 5 under EST. */
export function newYorkOffsetHours(utcMs: number): number {
  const parts = newYorkClockParts(utcMs);
  const wallReadAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  const minuteFloor = Math.floor(utcMs / 60_000) * 60_000;
  return Math.round((minuteFloor - wallReadAsUtc) / HOUR_MS);
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function median(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * The daily series' stamps, read for the two possible midnights and
 * judged per year. Date-only EOD labels land at New York midnight (UTC
 * hour 4 or 5) under the current normalizer and at 00 UTC under the
 * naive era; a year of one kind among years of the other is "mixed"
 * whatever its share of the aggregate. Sub-daily or otherwise unexpected
 * stamp hours dilute both shares and resolve toward "indeterminate"
 * rather than toward either era.
 */
// Returns everything but `verdictFrom`, which seriesClockWitness stamps —
// so a sub-witness cannot claim to be the source of a verdict it did not
// produce.
function dailyWitness(
  times: number[],
): Omit<SeriesClockWitness, "verdictFrom"> {
  const sampled = times.length;
  if (sampled < 30) {
    return { verdict: "indeterminate" };
  }
  type YearTally = { atNy: number; atUtc: number; rows: number };
  const byYear = new Map<number, YearTally>();
  let atUtcTotal = 0;
  let atNyTotal = 0;
  for (const time of times) {
    const date = new Date(time);
    const year = date.getUTCFullYear();
    const tally = byYear.get(year) ?? { atNy: 0, atUtc: 0, rows: 0 };
    tally.rows += 1;
    if (date.getUTCMinutes() === 0) {
      const hour = date.getUTCHours();
      if (hour === 0) {
        tally.atUtc += 1;
        atUtcTotal += 1;
      } else if (hour === 4 || hour === 5) {
        tally.atNy += 1;
        atNyTotal += 1;
      }
    }
    byYear.set(year, tally);
  }
  let utcYears = 0;
  let naiveYears = 0;
  let mixedYears = 0;
  for (const tally of byYear.values()) {
    if (tally.rows < 30) {
      continue;
    }
    const nyShare = tally.atNy / tally.rows;
    const utcShare = tally.atUtc / tally.rows;
    // No dead band between the branches (#358 re-review): a year showing
    // BOTH midnights above the 5% noise floor is mixed, full stop — the
    // pure branches demand the other midnight stay UNDER that floor. A
    // legitimate store has exactly zero of the other midnight, so ~12
    // days of admixture in a full year is the smallest contamination
    // this can see, and that floor is the stated limit, not a hidden
    // one. The floor is absolute as well as proportional (#358 round 3):
    // in a partial first/last year, 5% can be two rows, and a
    // run-aborting verdict should not hang on two rows.
    if (
      nyShare >= 0.05 && utcShare >= 0.05 &&
      tally.atNy >= 5 && tally.atUtc >= 5
    ) {
      mixedYears += 1;
    } else if (nyShare >= 0.8 && utcShare < 0.05) {
      utcYears += 1;
    } else if (utcShare >= 0.8 && nyShare < 0.05) {
      naiveYears += 1;
    }
  }
  const daily = {
    midnightNyShare: round3(atNyTotal / sampled),
    midnightUtcShare: round3(atUtcTotal / sampled),
    mixedYears,
    naiveYears,
    sampled,
    utcYears,
  };
  const verdict: WitnessVerdict = mixedYears > 0 ||
      (naiveYears > 0 && utcYears > 0)
    ? "mixed"
    : naiveYears > 0
    ? "naive"
    : utcYears > 0
    ? "utc"
    : "indeterminate";
  return { daily, verdict };
}

type ModalHour = { hour: number | null; share: number };

function modalHour(hours: number[]): ModalHour {
  if (hours.length === 0) {
    return { hour: null, share: 0 };
  }
  const counts = new Map<number, number>();
  for (const hour of hours) {
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [hour, count] of counts) {
    if (count > bestCount) {
      best = hour;
      bestCount = count;
    }
  }
  return { hour: best, share: bestCount / hours.length };
}

/**
 * Weekly first-bar UTC hour by New York DST regime. Proves "utc" when the
 * EST modal hour sits exactly one hour after the EDT modal hour (the same
 * venue wall time read through two offsets); anything else — including
 * perfect invariance, which a no-DST venue produces legitimately — is
 * "indeterminate". A minority naive era dilutes the modal shares below
 * the proof floor, so contamination costs the proof rather than earning
 * it; this witness never certifies a mixed store as clean on its own —
 * the cross-series and anchor witnesses carry condemnation.
 */
function weeklyWitness(
  times: number[],
): Pick<SeriesClockWitness, "weekly"> {
  const edtHours: number[] = [];
  const estHours: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] - times[index - 1] < 40 * HOUR_MS) {
      continue;
    }
    const openMs = times[index];
    const hour = new Date(openMs).getUTCHours();
    if (newYorkOffsetHours(openMs) === 4) {
      edtHours.push(hour);
    } else {
      estHours.push(hour);
    }
  }
  const sampled = edtHours.length + estHours.length;
  if (sampled < 8 || edtHours.length < 3 || estHours.length < 3) {
    return {};
  }
  const edt = modalHour(edtHours);
  const est = modalHour(estHours);
  const weekly = {
    edtHour: edt.hour,
    edtShare: round3(edt.share),
    estHour: est.hour,
    estShare: round3(est.share),
    sampled,
  };
  // NO VERDICT. This block is EVIDENCE, and it was a verdict until
  // 2026-08-24. The rule it applied — EST modal hour is exactly one after
  // the EDT one — is a property the NORMALIZER IMPOSES, not one the data
  // carries: every stamp goes through newYorkWallClockToUtcMs, so the New
  // York DST signature appears whatever the provider's label meant. The
  // witness therefore could not fail, and its "utc" was the store's own
  // construction restated as evidence about the store.
  //
  // Reproduced against the transform (2026-08-24): a series opening at a
  // fixed LOCAL hour and read as New York wall gives Tokyo 09:00 ->
  // {edtHour 13, estHour 14}, Frankfurt 09:00 -> {13, 14}, Sydney 10:00 ->
  // {14, 15} — and NYSE 09:30 -> {13, 14}. Tokyo's block is byte-identical
  // to the NYSE block. In the live cache ^GSPC and ^N225 carry the same
  // pair while their venue anchors read "anchored" and "displaced 13 hours
  // out of register".
  //
  // It blessed 63 of 96 intraday stores as the SOLE source of their
  // recorded verdict. The modal hours stay because they are a real
  // observation worth reading; what is gone is the claim they prove
  // anything.
  return { weekly };
}

/**
 * Second Sunday of March as a UTC day index — valid for the 2007+ US DST
 * rule only. Pre-2007 springs moved in April; sampling those years under
 * this rule would read ordinary Sundays (~ratio 1.0) and dilute a naive
 * store toward a pass, so they are excluded rather than mis-sampled.
 */
function springForwardUtcDay(year: number): number | null {
  if (year < 2007) {
    return null;
  }
  const firstOfMarch = Date.UTC(year, 2, 1);
  const firstDow = new Date(firstOfMarch).getUTCDay();
  const firstSundayDate = 1 + ((7 - firstDow) % 7);
  return Math.floor(Date.UTC(year, 2, firstSundayDate + 7) / DAY_MS);
}

/**
 * The UTC hour a naive store cannot fill. The defect transform reads an
 * instant's New York wall digits back as UTC, and on spring-forward Sunday
 * the wall clock never produces 02:xx — it jumps 01:59 EST straight to
 * 03:00 EDT — so a naive series has NO bars in UTC hour 02 that day, while
 * a true-UTC series fills it like any other hour.
 */
const SKIPPED_WALL_HOUR = 2;

/**
 * Spring-transition evidence for a series that trades through the New York
 * 02:00 wall hour (24/7 markets), judged per year and BY LOCATION.
 *
 * The witness asks the constructive question — is the hour a naive stamp
 * cannot produce actually empty, while the rest of that day is intact? —
 * instead of the proxy the pre-2026-08-24 version asked, which was whether
 * the day's TOTAL ran low against neighbouring Sundays.
 *
 * The proxy failed twice in one rebuild, both times by condemning a healthy
 * store, and the second failure is why it was replaced rather than retuned.
 * ALGOUSD stopped the rebuild at 82 of 97 reading "mixed" on two low years:
 * 2020, whose deficit was smeared across THIRTEEN hours of a thin
 * early-listing day (ALGO listed 2019-08) with hour 02 holding 11 of 12;
 * and 2025, a clean two-hour provider outage at 21:00-22:59 with hour 02
 * holding 12 of 12. Neither is a clock fault, and three other witnesses said
 * so: its daily-stamp witness reads "utc" over 8 years with zero naive
 * years, its 15-minute transition reads "utc", and its cross-series
 * registration is "aligned" at ZERO shift with a 1.00 match rate over 2,565
 * days.
 *
 * A ratio band could not be repaired in place because it is
 * resolution-dependent and the defect is not. The SAME 2025 outage read
 * 268/288 = 0.9306 at 5-minute — inside the old [0.93, 0.975] band — and
 * 88/96 = 0.9167 at 15-minute, outside it: one physical event, two verdicts.
 * In bar terms that band admitted a 4-bar-wide window at 15-minute and a
 * 13-bar-wide window at 5-minute, wide enough to swallow a two-hour outage
 * whole. The naive signature is resolution-free — 23 of 24 hours at every
 * timeframe — so judging WHERE the hole sits removes the dependence, and
 * separates the populations by an empty hour against a full one rather than
 * by ~4% of a day's bars.
 *
 * What this deliberately does NOT do is condemn a UTC-SERVED series that was
 * mis-converted. FMP serves crypto bars already in UTC — measured, not
 * assumed: the condemned archive's ALGOUSD 5-minute store starts each day at
 * 05:00Z where the rebuilt store starts at 00:00Z, so the pre-R0 code was the
 * one converting. A uniform 4-5 hour shift moves every bar and empties no
 * hour, so no spring witness of any design can see it. That defect belongs
 * to crossSeriesClock and the daily-stamp witness; this one stays silent on
 * it rather than guessing, which is why a condemning verdict here is never
 * the only guard standing.
 *
 * Session markets are closed at that hour and return "indeterminate" here.
 */
function transitionWitness(
  times: number[],
): Pick<SeriesClockWitness, "transition" | "verdict"> {
  if (times.length < 1_000) {
    return { verdict: "indeterminate" };
  }
  const hoursByDay = new Map<number, number[]>();
  for (const time of times) {
    const day = Math.floor(time / DAY_MS);
    let hours = hoursByDay.get(day);
    if (!hours) {
      hours = new Array<number>(24).fill(0);
      hoursByDay.set(day, hours);
    }
    hours[new Date(time).getUTCHours()] += 1;
  }
  const firstDay = Math.floor(times[0] / DAY_MS);
  const lastDay = Math.floor(times[times.length - 1] / DAY_MS);
  const coverage = hoursByDay.size / Math.max(1, lastDay - firstDay + 1);
  // Only a market trading through the transition hour can witness it; a
  // weekend-closed market has no bars to lose there.
  if (coverage < 0.9) {
    return { verdict: "indeterminate" };
  }
  let sparseSkipped = 0;
  let naiveYears = 0;
  let utcYears = 0;
  const shares: number[] = [];
  const firstYear = new Date(times[0]).getUTCFullYear();
  const lastYear = new Date(times[times.length - 1]).getUTCFullYear();
  for (let year = firstYear; year <= lastYear; year += 1) {
    const transitionDay = springForwardUtcDay(year);
    if (transitionDay === null) {
      continue;
    }
    const hours = hoursByDay.get(transitionDay);
    if (transitionDay <= firstDay || transitionDay >= lastDay || !hours) {
      continue;
    }
    // The day's own reference, taken from the 23 hours the transition
    // cannot touch, so an outage anywhere ELSE moves the reference rather
    // than the reading.
    const others = hours.filter((_, hour) => hour !== SKIPPED_WALL_HOUR);
    const reference = median(others);
    // A DAY MUST BE INTACT TO TESTIFY ABOUT ONE HOUR OF IT. A naive day
    // keeps 23 full hours and loses exactly one, so a day ragged across
    // many hours is a gap rather than clock evidence — which is precisely
    // what ALGOUSD's 2020 spring was, at 13 deficient hours of 24. Two
    // dented hours are tolerated so a single unrelated outage cannot
    // silence an otherwise readable day.
    const intact = others.filter((count) => count >= reference * 0.8).length;
    if (reference === 0 || intact < others.length - 2) {
      sparseSkipped += 1;
      continue;
    }
    const share = hours[SKIPPED_WALL_HOUR] / reference;
    shares.push(share);
    if (share <= 0.25) {
      naiveYears += 1;
    } else if (share >= 0.8) {
      utcYears += 1;
    }
    // A share between the two is a year that cannot say: a partly-dented
    // transition hour is neither an absent wall hour nor a full one, and
    // counting it either way would be the proxy's mistake again.
  }
  const transition = {
    naiveYears,
    sampled: shares.length,
    skippedHourShare: shares.length > 0 ? round3(median(shares)) : null,
    utcYears,
    // On EVERY verdict, not just an abstention. A "utc" reading over three
    // springs where four were dropped is a different fact from a "utc" over
    // three where none were, and an operator cannot tell them apart unless
    // the count rides along.
    ...(sparseSkipped > 0 && { sparseSkipped }),
  };
  // Two independent springs with the wall hour empty is the defect; one is
  // an outage that happened to land there, and is tolerated. The direction
  // of caution is deliberate and asymmetric: a naive store certified healthy
  // is what invalidated the 4c/4d corpus, while a healthy store refused only
  // stops a rebuild — so condemnation does not wait for a third spring the
  // young 2023 listings may not have.
  if (naiveYears >= 2) {
    return { transition, verdict: utcYears > 0 ? "mixed" : "naive" };
  }
  if (naiveYears === 0 && utcYears >= 3) {
    return { transition, verdict: "utc" };
  }
  return { transition, verdict: "indeterminate" };
}

/**
 * The series' own clock evidence. Condemning verdicts ("naive", "mixed")
 * come only from witnesses that cannot false-positive on a legitimate
 * store; "indeterminate" means the series carries no absolute evidence
 * and the store's constructive clock stamp is the only guarantee — which
 * is the honest resting state for most sessioned intraday series (their
 * absolute check is the reference anchor below, on the one symbol whose
 * venue hours are measured fact).
 */
export function seriesClockWitness(
  bars: Array<{ time: number }>,
  role: SeriesRole,
): SeriesClockWitness {
  const times = bars.map((bar) => bar.time);
  if (role === "daily") {
    const daily = dailyWitness(times);
    return {
      ...daily,
      verdictFrom: daily.verdict === "indeterminate" ? "none" : "daily",
    };
  }
  const weekly = weeklyWitness(times);
  const transition = transitionWitness(times);
  // ONE SUB-WITNESS SPEAKS, AND THE RECORD SAYS WHICH. Before 2026-08-24 the
  // two verdicts were collapsed into one field, so no reader could tell a
  // constructive "utc" from the weekly witness's circular one — and the
  // weekly witness was the sole source for 63 of 96 intraday stores. With it
  // demoted to evidence the transition witness is the only intraday voice
  // here, and a store it cannot judge now says so instead of inheriting a
  // blessing. The absolute instrument for those stores is the venue anchor
  // (sessionAnchorWitness), which the sweep driver and the corpus door run.
  const verdict = transition.verdict;
  return {
    ...(transition.transition && { transition: transition.transition }),
    verdict,
    verdictFrom: verdict === "indeterminate" ? "none" : "transition",
    ...(weekly.weekly && { weekly: weekly.weekly }),
  };
}

export type CrossSeriesClock = {
  bestShiftHours: number;
  matchRateAtBest: number | null;
  matchRateAtZero: number | null;
  sampledDays: number;
  /** Years whose own days register best at a non-zero shift. */
  shiftedYears: number;
  verdict: "aligned" | "indeterminate" | "shifted";
};

type OhlcBar = { high: number; low: number; time: number };

function dayExtremes(
  bars: OhlcBar[],
  shiftHours: number,
  minBars: number,
): Map<number, { count: number; high: number; low: number }> {
  const byDay = new Map<number, { count: number; high: number; low: number }>();
  for (const bar of bars) {
    const day = Math.floor((bar.time + shiftHours * HOUR_MS) / DAY_MS);
    const entry = byDay.get(day);
    if (!entry) {
      byDay.set(day, { count: 1, high: bar.high, low: bar.low });
    } else {
      entry.count += 1;
      entry.high = Math.max(entry.high, bar.high);
      entry.low = Math.min(entry.low, bar.low);
    }
  }
  for (const [day, entry] of byDay) {
    if (entry.count < minBars) {
      byDay.delete(day);
    }
  }
  return byDay;
}

function closeEnough(first: number, second: number): boolean {
  return Math.abs(first - second) <=
    1e-6 * Math.max(Math.abs(first), Math.abs(second));
}

export type GridRegistration = {
  /** 15-minute parents whose whole span lay in the shared window and held at least one child. */
  judged: number;
  /** Parents whose children escaped their high/low bracket. */
  violations: number;
  verdict: "misregistered" | "registered" | "unjudgeable";
};

/**
 * THE ABSOLUTE REGISTRATION TEST, on a common bar grid.
 *
 * `crossSeriesClock` above compares the two series by DAY EXTREMES bucketed on
 * the UTC calendar day, so a one-sided shift is visible only when it moves a
 * day's high or low across UTC midnight. For a market whose session sits
 * INSIDE the UTC day a four-hour mis-registration moves no day's extremes at
 * all — so that instrument does not abstain, it issues a clean bill at
 * matchRateAtZero 1.000. Verified against the real 2026-08-11 naive transform
 * on GFUSX, HEUSX and LEUSX, whose sessions occupy UTC 13-19 only.
 *
 * This one asks a question with no calendar in it: a 15-minute parent must
 * BRACKET whatever 5-minute children it has, because those children are the
 * same trades. Containment is a property of the aggregation, not of a
 * timezone, so a relative shift breaks it and sparseness cannot — a parent
 * holding one child still brackets that child.
 *
 * Measured across all 97 markets on the R0 cache (2026-08-24):
 *
 *   worst healthy violation rate   0.00301%   (THETAUSD, 3 of ~100k)
 *   weakest detection under a shift    57.9%   (over +/-1, 4, 5, 6, 13, 14h)
 *   separation                       19,271x
 *
 * The healthy violations are provider inconsistencies where a parent equals
 * only its first child — one bar in ~400,000 on EURUSD and BTCUSD. The
 * threshold sits 332x above the worst of those and 58x below the weakest
 * detection, which is why it is a constant here and not a per-market figure:
 * the empty region between the two populations spans four orders of
 * magnitude, and no market sits in it.
 */
const GRID_VIOLATION_LIMIT = 0.01;

export function gridRegistration(
  primary: OhlcBar[],
  fiveMinute: OhlcBar[],
): GridRegistration {
  if (primary.length === 0 || fiveMinute.length === 0) {
    return { judged: 0, verdict: "unjudgeable", violations: 0 };
  }
  const children = new Map<number, OhlcBar>();
  for (const bar of fiveMinute) {
    children.set(bar.time, bar);
  }
  const windowStart = Math.max(primary[0].time, fiveMinute[0].time);
  // Bounded by the CHILD series' end, not by min(ends). A parent's children
  // sit at +0, +5 and +10 minutes, so they legitimately extend past the
  // parent's own timestamp — taking the minimum drops the last parent even
  // when all three of its children are present, which is a lost sample rather
  // than a protected one. What must be excluded is a parent whose children
  // were never fetched.
  const lastChildTime = fiveMinute[fiveMinute.length - 1].time;
  let judged = 0;
  let violations = 0;
  for (const bar of primary) {
    // The parent's WHOLE span must lie inside the shared window: its third
    // child sits at +10 minutes, and judging a parent whose children fall
    // outside would condemn a healthy store for bars it could never cover.
    if (bar.time < windowStart || bar.time + 600_000 > lastChildTime) {
      continue;
    }
    const kids: OhlcBar[] = [];
    for (const offset of [0, 300_000, 600_000]) {
      const child = children.get(bar.time + offset);
      if (child) {
        kids.push(child);
      }
    }
    // No child at all is the DENSITY gate's finding, not this one's.
    if (kids.length === 0) {
      continue;
    }
    judged += 1;
    let high = kids[0].high;
    let low = kids[0].low;
    for (const kid of kids) {
      if (kid.high > high) high = kid.high;
      if (kid.low < low) low = kid.low;
    }
    // Relative tolerance, for values that round-tripped through JSON.
    if (high > bar.high * (1 + 1e-9) || low < bar.low * (1 - 1e-9)) {
      violations += 1;
    }
  }
  if (judged === 0) {
    // Both series carry bars in the shared window and not one parent could be
    // judged: they do not share a grid at all, which is itself a defect —
    // never a pass.
    return { judged, verdict: "unjudgeable", violations };
  }
  return {
    judged,
    verdict: violations / judged > GRID_VIOLATION_LIMIT
      ? "misregistered"
      : "registered",
    violations,
  };
}

/**
 * Relative registration of the 5-minute series against the 15-minute
 * primary: at which shift do the two agree on each UTC day's extremes?
 * Judged globally AND per year: a half-poisoned primary still matches its
 * healthy mate on the healthy era's days (measured: 51% at zero shift for
 * a half-naive store — over the "aligned" floor), but the poisoned era's
 * own YEARS register best at ±4/5, and one such year condemns. The shift
 * list carries both polarities deliberately: the 2026-08-11 store (naive
 * primary, true 5-min) registers at −4; the mirror shape at +4 — both
 * pinned in tests. Both-series-naive still reads as aligned here; the
 * absolute witnesses, the reference anchor and the store stamps exist for
 * exactly that blind spot.
 */
export function crossSeriesClock(
  primary: OhlcBar[],
  fiveMinute: OhlcBar[],
): CrossSeriesClock {
  const primaryDays = dayExtremes(primary, 0, 8);
  const shifts = [0, 4, 5, -4, -5];
  let sampledDays = 0;
  const rates = new Map<number, number>();
  type YearTally = { common: number; matched: number };
  const perYear = new Map<number, Map<number, YearTally>>();
  for (const shift of shifts) {
    const shiftedDays = dayExtremes(fiveMinute, shift, 24);
    let common = 0;
    let matched = 0;
    const yearTallies = new Map<number, YearTally>();
    for (const [day, extremes] of shiftedDays) {
      const reference = primaryDays.get(day);
      if (!reference) {
        continue;
      }
      const year = new Date(day * DAY_MS).getUTCFullYear();
      const tally = yearTallies.get(year) ?? { common: 0, matched: 0 };
      common += 1;
      tally.common += 1;
      if (
        closeEnough(reference.high, extremes.high) &&
        closeEnough(reference.low, extremes.low)
      ) {
        matched += 1;
        tally.matched += 1;
      }
      yearTallies.set(year, tally);
    }
    if (shift === 0) {
      sampledDays = common;
    }
    rates.set(shift, common >= 30 ? matched / common : Number.NaN);
    perYear.set(shift, yearTallies);
  }
  const zeroRate = rates.get(0);
  const matchRateAtZero = zeroRate !== undefined && Number.isFinite(zeroRate)
    ? round3(zeroRate)
    : null;
  let bestShiftHours = 0;
  let bestRate = Number.NEGATIVE_INFINITY;
  for (const [shift, rate] of rates) {
    if (Number.isFinite(rate) && rate > bestRate) {
      bestRate = rate;
      bestShiftHours = shift;
    }
  }
  const matchRateAtBest = Number.isFinite(bestRate) ? round3(bestRate) : null;

  // Per-year condemnation: a year with enough common days whose best
  // non-zero shift beats its own zero-shift rate decisively.
  let shiftedYears = 0;
  const zeroYears = perYear.get(0) ?? new Map<number, YearTally>();
  const allYears = new Set<number>();
  for (const tallies of perYear.values()) {
    for (const year of tallies.keys()) {
      allYears.add(year);
    }
  }
  for (const year of allYears) {
    const zero = zeroYears.get(year);
    const zeroYearRate = zero && zero.common >= 30
      ? zero.matched / zero.common
      : null;
    // No zero-shift evidence for the year means no verdict for the year
    // (#358 re-review): condemning against an absent baseline would let
    // a partial boundary year false-positive, and condemning verdicts
    // here must come only from evidence that cannot.
    if (zeroYearRate === null) {
      continue;
    }
    let bestYearRate = Number.NEGATIVE_INFINITY;
    for (const shift of shifts) {
      if (shift === 0) {
        continue;
      }
      const tally = perYear.get(shift)?.get(year);
      if (tally && tally.common >= 30) {
        bestYearRate = Math.max(bestYearRate, tally.matched / tally.common);
      }
    }
    if (
      Number.isFinite(bestYearRate) && bestYearRate >= 0.5 &&
      bestYearRate >= zeroYearRate + 0.3
    ) {
      shiftedYears += 1;
    }
  }

  if (matchRateAtZero === null || matchRateAtBest === null) {
    return {
      bestShiftHours: 0,
      matchRateAtBest,
      matchRateAtZero,
      sampledDays,
      shiftedYears,
      verdict: shiftedYears > 0 ? "shifted" : "indeterminate",
    };
  }
  const shifted = shiftedYears > 0 ||
    (bestShiftHours !== 0 && matchRateAtBest >= 0.5 &&
      matchRateAtBest >= matchRateAtZero + 0.3);
  const aligned = !shifted && matchRateAtZero >= 0.5 &&
    matchRateAtZero >= matchRateAtBest - 0.05;
  return {
    bestShiftHours,
    matchRateAtBest,
    matchRateAtZero,
    sampledDays,
    shiftedYears,
    verdict: shifted ? "shifted" : aligned ? "aligned" : "indeterminate",
  };
}

/**
 * The reference symbols whose venue session opens are MEASURED facts,
 * safe to assert precisely because they are venue-specific — the Tokyo
 * trap (never infer a venue's clock behavior from invariance) does not
 * apply to a symbol whose venue we name. ^GSPC is the 2b proof itself:
 * the banked S&P cash session reads 09:30–15:45 New York wall in July
 * AND January.
 */
/**
 * A venue's session open, expressed in the VENUE'S OWN timezone.
 *
 * It was New York wall time until 2026-08-24, which silently restricted the
 * witness to venues whose DST tracks the United States. Tokyo keeps no DST at
 * all, so 09:00 JST reads 20:00 in New York for the ~64% of the year the US
 * sits on EDT and 19:00 for the rest; Sydney's DST runs the OPPOSITE way, so
 * 10:00 AEST/AEDT takes four New-York readings across a year. The witness
 * needs a modal share of 0.6 within a year to judge one, so Tokyo sat barely
 * above the floor and Sydney could not resolve at all — and a non-resolving
 * anchor reads INDETERMINATE, which verify-cache-clock fails. Expressed in the
 * venue's own zone the open is constant by construction, for every venue.
 */
export type SessionAnchor = {
  /** IANA zone the venue's open is fixed in. */
  zone: string;
  hour: number;
  minute: number;
};

/**
 * THE POPULATION IS DERIVED, NOT LISTED. Every market `getAssetType` classifies
 * as `indices` must appear here; `tests/clockWitness.test.ts` walks
 * ASSET_TYPE_BY_SYMBOL and fails if one is missing, so the table cannot fall
 * behind the roster the way it did.
 *
 * It held "^GSPC" alone until 2026-08-24, guarding a failure that afflicted
 * three of the six indices. FMP labels foreign index bars in LOCAL EXCHANGE
 * time while the normalizer reads every label as New York wall, so each foreign
 * index was displaced by exactly its local-to-New-York difference: ^GDAXI +6h,
 * ^N225 +13h, ^AXJO +14h, against 0h for the three US indices. This witness
 * convicts all three (4 displaced years each, 0 anchored) and always could
 * have — nothing else can, because it is the only ABSOLUTE intraday
 * instrument, and every relative one compares two series that shift together.
 *
 * Confirmed four independent ways before this table was written: the offsets
 * equal each venue's local-to-NY difference exactly; ^N225's hourly histogram
 * dips at the raw 12:00 label, the Tokyo lunch break; each index observes its
 * OWN exchange holidays (^AXJO absent on Australia Day and ANZAC Day, present
 * on US Independence Day; ^N225 absent on Golden Week); and this witness
 * condemns them.
 *
 * Keys are PROVIDER symbols, because that is what the cache stores are keyed by.
 */
export const REFERENCE_SESSION_ANCHORS: Record<string, SessionAnchor> =
  Object.fromEntries(
    Object.entries(VENUE_CLOCKS).map(([symbol, venue]) => [
      symbol,
      { hour: venue.open.hour, minute: venue.open.minute, zone: venue.zone },
    ]),
  );

// Hoisted for the same production reason bars.ts states at
// NEW_YORK_CLOCK_FORMAT: constructing an Intl.DateTimeFormat costs ~50us
// against a few us to read one, and this runs per sampled day.
const ZONE_FORMATS = new Map<string, Intl.DateTimeFormat>();
const ZONE_DATE_FORMATS = new Map<string, Intl.DateTimeFormat>();

function venueDateFormat(zone: string): Intl.DateTimeFormat {
  let format = ZONE_DATE_FORMATS.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone: zone,
      year: "numeric",
    });
    ZONE_DATE_FORMATS.set(zone, format);
  }
  return format;
}

function venueClockMinutes(utcMs: number, zone: string): number {
  let format = ZONE_FORMATS.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: zone,
    });
    ZONE_FORMATS.set(zone, format);
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(utcMs)).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour ?? "0");
  return (hour === 24 ? 0 : hour) * 60 + Number(parts.minute ?? "0");
}

export type SessionAnchorWitness = {
  anchoredYears: number;
  displacedYears: number;
  sampledDays: number;
  verdict: "anchored" | "displaced" | "indeterminate";
};

/**
 * The absolute intraday witness for a designated reference symbol: the
 * New York wall reading of each UTC day's first bar, judged per year
 * against the venue's known session open. A true-UTC store reads the
 * anchor in both DST regimes; a naive store reads 4–5 hours early; a
 * provider convention flip under an unchanged normalizer — the failure
 * the relative instruments provably cannot see, because every series
 * shifts together — displaces it too. One displaced year condemns.
 */
export function sessionAnchorWitness(
  bars: Array<{ time: number }>,
  anchor: SessionAnchor,
): SessionAnchorWitness {
  // GROUPED BY THE VENUE'S DAY, NOT BY THE UTC DAY. The question this witness
  // asks — does each SESSION begin at its venue's open? — is venue-local, so
  // the bucket has to be too. Grouping by UTC day cuts a session in half for
  // any venue whose hours straddle UTC midnight, and then the "first bar of
  // the day" is the middle of the previous session rather than the open.
  //
  // The ASX is exactly that venue and it stopped the R0f rebuild at 47 of 97
  // on 2026-08-24. Its session is 10:00-16:00 Sydney, which is 00:00-06:00 UTC
  // under AEST but 23:00-05:00 under AEDT — and Sydney's DST runs opposite to
  // the northern hemisphere's, so half the year straddles. Bucketed by UTC day
  // the Sydney-local reading of the first bar split 11:00 x373 against 10:00
  // x352, neither reaching the 0.6 modal share, and the store read
  // "displaced" though its bars were correct: hours 06 through 22 exactly
  // empty, the session on 23 and 00-05.
  //
  // The offset is cached per UTC HOUR rather than computed per bar: a zone's
  // offset cannot change within an hour, and this runs over series of ~400k
  // bars where an Intl read each would dominate.
  const offsetByHour = new Map<number, number>();
  const localOffsetMs = (time: number): number => {
    const hourKey = Math.floor(time / 3_600_000);
    const cached = offsetByHour.get(hourKey);
    if (cached !== undefined) {
      return cached;
    }
    const parts = Object.fromEntries(
      venueDateFormat(anchor.zone)
        .formatToParts(new Date(time))
        .map((part) => [part.type, part.value]),
    );
    const hour = Number(parts.hour ?? "0");
    const asUtc = Date.UTC(
      Number(parts.year ?? "1970"),
      Number(parts.month ?? "1") - 1,
      Number(parts.day ?? "1"),
      hour === 24 ? 0 : hour,
      Number(parts.minute ?? "0"),
    );
    // Whole minutes: Date.UTC of the local reading minus the instant.
    const offset = asUtc - Math.floor(time / 60_000) * 60_000;
    offsetByHour.set(hourKey, offset);
    return offset;
  };
  const barsByDay = new Map<number, number[]>();
  for (const bar of bars) {
    const day = Math.floor((bar.time + localOffsetMs(bar.time)) / DAY_MS);
    const times = barsByDay.get(day) ?? [];
    times.push(bar.time);
    barsByDay.set(day, times);
  }
  const wallMinutesByYear = new Map<number, number[]>();
  let sampledDays = 0;
  for (const times of barsByDay.values()) {
    if (times.length < 20) {
      continue;
    }
    sampledDays += 1;
    const first = Math.min(...times);
    // The venue's year, for the same reason as the venue's day. NOT separately
    // pinned, deliberately: for a straddling venue it moves at most one
    // session per year boundary between buckets, which is below this
    // witness's own resolution (40 days minimum and a 0.6 modal share), so a
    // test asserting it would be asserting noise. Correctness hygiene, not a
    // guard — and a mutation reverting it passes, which is the honest
    // description of its weight.
    const year = new Date(first + localOffsetMs(first)).getUTCFullYear();
    const list = wallMinutesByYear.get(year) ?? [];
    list.push(venueClockMinutes(first, anchor.zone));
    wallMinutesByYear.set(year, list);
  }
  const anchorMinutes = anchor.hour * 60 + anchor.minute;
  let anchoredYears = 0;
  let displacedYears = 0;
  for (const minutes of wallMinutesByYear.values()) {
    if (minutes.length < 40) {
      continue;
    }
    const counts = new Map<number, number>();
    for (const value of minutes) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    let modal = -1;
    let modalCount = 0;
    for (const [value, count] of counts) {
      if (count > modalCount) {
        modal = value;
        modalCount = count;
      }
    }
    const share = modalCount / minutes.length;
    if (share < 0.6) {
      continue;
    }
    if (modal === anchorMinutes) {
      anchoredYears += 1;
    } else {
      displacedYears += 1;
    }
  }
  return {
    anchoredYears,
    displacedYears,
    sampledDays,
    verdict: displacedYears > 0
      ? "displaced"
      : anchoredYears > 0
      ? "anchored"
      : "indeterminate",
  };
}

/**
 * The clock a rolling store's key implies, for readers that scan the cache
 * directory itself (scripts/verify-cache-clock.ts). Bar stores carry
 * BAR_CLOCK (bars.ts); the calendar store carries CALENDAR_CLOCK. COT
 * files are bespoke per-contract JSON, not rolling stores; their parse is
 * unchanged across this repository's history and the rebuild archives
 * them with the rest of the directory.
 */
export function storeKindForKey(
  key: string,
): { kind: "bars"; role: SeriesRole } | { kind: "calendar" } | { kind: "rates" } | null {
  if (key === "econ-calendar") {
    return { kind: "calendar" };
  }
  // R1b's Treasury curve. Calendar-clocked like econ-calendar — calibrationCache
  // already classes the two together — but deliberately its OWN kind rather than
  // sharing "calendar", because the verifier uses the calendar branch to satisfy
  // a presence gate and a rates store must not stand in for a missing calendar.
  //
  // Without this the store fell through to null and every rebuilt cache earned
  // `treasury-rates: unknown store kind` — a RED line on a healthy store, in the
  // gate whose own runbook says any red means "the rebuild did not take; do not
  // sweep, do not delete the archive". It arrived with the store in R1b and
  // would have failed the first R0 rebuild to reach step 3.
  if (key === "treasury-rates") {
    return { kind: "rates" };
  }
  if (/-(15min|5min)-/.test(key)) {
    return { kind: "bars", role: "intraday" };
  }
  if (/-daily-/.test(key)) {
    return { kind: "bars", role: "daily" };
  }
  return null;
}
