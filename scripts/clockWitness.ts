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
// Three witnesses, each honest about what it can and cannot see:
//
// - DAILY-STAMP witness (universal, condemning): FMP end-of-day rows are
//   date-only labels, and the current normalizer (bars.ts toTimestamp)
//   stamps a date-only label at New York midnight — 04:00 UTC in EDT,
//   05:00 in EST. The naive era stamped the same label at 00:00 UTC. The
//   modal stamp hour therefore separates the eras for EVERY market,
//   including 24/7 crypto.
//
// - WEEKLY-OPEN witness (intraday, proving only): a session market's week
//   opens at a fixed venue wall hour, so under true UTC the weekly first
//   bar's UTC hour moves by exactly one hour between the EDT and EST
//   regimes; under naive stamps it never moves. Seasonal INVARIANCE proves
//   nothing, though — a venue without DST (Tokyo) is invariant in UTC too —
//   so this witness only ever returns "utc" or "indeterminate", never
//   condemns. tests/clockWitness.test.ts pins the Nikkei-shaped false
//   positive it must not commit.
//
// - SPRING-TRANSITION witness (24/7 intraday, condemning): on the
//   spring-forward Sunday the New York wall clock has no 02:xx hour, so a
//   naive 24/7 series is missing exactly that hour's stamps (~92 of 96
//   15-minute bars) while a true-UTC series keeps all 96. Fall-back days
//   discriminate nothing — the repeated wall hour collapses to one instant
//   under BOTH parsers — so only spring Sundays are sampled.
//
// - CROSS-SERIES registration (per symbol, condemning): two series of the
//   same market on the same clock agree on each day's extremes at zero
//   shift; a naive series against a true-UTC one registers at ±4/5 hours
//   instead. This is the audit's own instrument (75-84% match at +4h across
//   2010-2025, 0.0% at zero). It measures RELATIVE registration only: two
//   series that are both naive read as aligned, which is why the absolute
//   witnesses above exist.
//
// A verdict is never a substitute for the constructive guarantee — the
// rolling store's clock stamp (calibrationCache.ts), written only by the
// current normalizer's build — but it is the independent check that the
// guarantee holds on the data itself (amendment 38: verify, don't relay).

import { newYorkClockParts } from "../supabase/functions/trade-analyzer/bars.ts";

/**
 * The economic-calendar store's clock. FMP stamps CALENDAR events in true
 * UTC (NFP Jul-2026 stamps 12:30:00 = 08:30 ET) — the other half of the
 * one-provider-two-conventions split that bars.ts documents — and
 * replay-sweep.ts's fetchCalendarEvents has always parsed it that way
 * (`+"Z"`). Distinct from BAR_CLOCK because the conventions are distinct;
 * a calendar store must never satisfy a bar store's stamp or vice versa.
 */
export const CALENDAR_CLOCK = "fmp-calendar-utc-v1";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type WitnessVerdict = "indeterminate" | "mixed" | "naive" | "utc";

export type SeriesClockWitness = {
  /** Daily-stamp evidence: share of stamps at 00 UTC vs New York midnight. */
  daily?: {
    midnightNyShare: number;
    midnightUtcShare: number;
    sampled: number;
  };
  /** Spring-forward evidence: transition-Sunday bar count vs neighbors. */
  transition?: {
    ratio: number | null;
    sampled: number;
  };
  verdict: WitnessVerdict;
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

/**
 * The daily series' stamps, read for the two possible midnights. Date-only
 * EOD labels land at New York midnight (UTC hour 4 or 5) under the current
 * normalizer and at 00 UTC under the naive era. Sub-daily or otherwise
 * unexpected stamp hours dilute both shares and resolve toward
 * "indeterminate" rather than toward either era.
 */
function dailyWitness(times: number[]): SeriesClockWitness {
  const sampled = times.length;
  if (sampled < 30) {
    return { verdict: "indeterminate" };
  }
  let atUtcMidnight = 0;
  let atNyMidnight = 0;
  for (const time of times) {
    const hour = new Date(time).getUTCHours();
    const minute = new Date(time).getUTCMinutes();
    if (minute !== 0) {
      continue;
    }
    if (hour === 0) {
      atUtcMidnight += 1;
    } else if (hour === 4 || hour === 5) {
      atNyMidnight += 1;
    }
  }
  const midnightUtcShare = atUtcMidnight / sampled;
  const midnightNyShare = atNyMidnight / sampled;
  const daily = {
    midnightNyShare: round3(midnightNyShare),
    midnightUtcShare: round3(midnightUtcShare),
    sampled,
  };
  if (midnightNyShare >= 0.8 && midnightUtcShare <= 0.1) {
    return { daily, verdict: "utc" };
  }
  if (midnightUtcShare >= 0.8 && midnightNyShare <= 0.1) {
    return { daily, verdict: "naive" };
  }
  if (midnightUtcShare >= 0.15 && midnightNyShare >= 0.15) {
    return { daily, verdict: "mixed" };
  }
  return { daily, verdict: "indeterminate" };
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
 * "indeterminate".
 */
function weeklyWitness(times: number[]): Pick<SeriesClockWitness, "verdict" | "weekly"> {
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
    return { verdict: "indeterminate" };
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
  const provesUtc = edt.hour !== null && est.hour !== null &&
    est.hour === (edt.hour + 1) % 24 && edt.share >= 0.6 && est.share >= 0.6;
  return { verdict: provesUtc ? "utc" : "indeterminate", weekly };
}

/** Second Sunday of March, as a UTC day index (spring-forward in New York). */
function springForwardUtcDay(year: number): number {
  const firstOfMarch = Date.UTC(year, 2, 1);
  const firstDow = new Date(firstOfMarch).getUTCDay();
  const firstSundayDate = 1 + ((7 - firstDow) % 7);
  return Math.floor(Date.UTC(year, 2, firstSundayDate + 7) / DAY_MS);
}

/**
 * Spring-transition bar counts for a series that trades through the New
 * York 02:00 wall hour (24/7 markets). A naive series is missing that
 * hour's stamps on every spring-forward Sunday (~92/96 for 15-minute);
 * true UTC keeps the full day. Session markets are closed at that hour and
 * return "indeterminate" here.
 */
function transitionWitness(
  times: number[],
): Pick<SeriesClockWitness, "transition" | "verdict"> {
  if (times.length < 1_000) {
    return { verdict: "indeterminate" };
  }
  const barsByDay = new Map<number, number>();
  for (const time of times) {
    const day = Math.floor(time / DAY_MS);
    barsByDay.set(day, (barsByDay.get(day) ?? 0) + 1);
  }
  const firstDay = Math.floor(times[0] / DAY_MS);
  const lastDay = Math.floor(times[times.length - 1] / DAY_MS);
  const coverage = barsByDay.size / Math.max(1, lastDay - firstDay + 1);
  // Only a market trading through the transition hour can witness it; a
  // weekend-closed market has no bars to lose there.
  if (coverage < 0.9) {
    return { verdict: "indeterminate" };
  }
  const ratios: number[] = [];
  const firstYear = new Date(times[0]).getUTCFullYear();
  const lastYear = new Date(times[times.length - 1]).getUTCFullYear();
  for (let year = firstYear; year <= lastYear; year += 1) {
    const transitionDay = springForwardUtcDay(year);
    const transitionCount = barsByDay.get(transitionDay);
    if (transitionDay <= firstDay || transitionDay >= lastDay || !transitionCount) {
      continue;
    }
    const neighborCounts = [-14, -7, 7, 14]
      .map((offset) => barsByDay.get(transitionDay + offset))
      .filter((count): count is number => count !== undefined && count > 0)
      .sort((first, second) => first - second);
    if (neighborCounts.length < 2) {
      continue;
    }
    const median = neighborCounts[Math.floor(neighborCounts.length / 2)];
    ratios.push(transitionCount / median);
  }
  if (ratios.length < 8) {
    return { verdict: "indeterminate" };
  }
  const ratio = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
  const transition = { ratio: round3(ratio), sampled: ratios.length };
  if (ratio <= 0.97) {
    return { transition, verdict: "naive" };
  }
  if (ratio >= 0.985) {
    return { transition, verdict: "utc" };
  }
  return { transition, verdict: "indeterminate" };
}

/**
 * The series' own clock evidence. Condemning verdicts ("naive", "mixed")
 * come only from witnesses that cannot false-positive on a legitimate
 * store; "indeterminate" means the series carries no absolute evidence and
 * the store's constructive clock stamp is the only guarantee.
 */
export function seriesClockWitness(
  bars: Array<{ time: number }>,
  role: SeriesRole,
): SeriesClockWitness {
  const times = bars.map((bar) => bar.time);
  if (role === "daily") {
    return dailyWitness(times);
  }
  const weekly = weeklyWitness(times);
  const transition = transitionWitness(times);
  const verdicts = [weekly.verdict, transition.verdict];
  const verdict = verdicts.includes("naive")
    ? "naive"
    : verdicts.includes("mixed")
    ? "mixed"
    : verdicts.includes("utc")
    ? "utc"
    : "indeterminate";
  return {
    ...(transition.transition && { transition: transition.transition }),
    verdict,
    ...(weekly.weekly && { weekly: weekly.weekly }),
  };
}

export type CrossSeriesClock = {
  bestShiftHours: number;
  matchRateAtBest: number | null;
  matchRateAtZero: number | null;
  sampledDays: number;
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

/**
 * Relative registration of the 5-minute series against the 15-minute
 * primary: at which shift do the two agree on each UTC day's extremes?
 * Shift 0 with a high match rate is the healthy state; a best shift of
 * ±4/5 hours is the mixed-clock signature the 2026-08-11 audit measured.
 * Both-series-naive reads as aligned here — the absolute witnesses and the
 * store stamps exist for exactly that blind spot.
 */
export function crossSeriesClock(
  primary: OhlcBar[],
  fiveMinute: OhlcBar[],
): CrossSeriesClock {
  const primaryDays = dayExtremes(primary, 0, 8);
  const shifts = [0, 4, 5, -4, -5];
  let sampledDays = 0;
  const rates = new Map<number, number>();
  for (const shift of shifts) {
    const shiftedDays = dayExtremes(fiveMinute, shift, 24);
    let common = 0;
    let matched = 0;
    for (const [day, extremes] of shiftedDays) {
      const reference = primaryDays.get(day);
      if (!reference) {
        continue;
      }
      common += 1;
      if (
        closeEnough(reference.high, extremes.high) &&
        closeEnough(reference.low, extremes.low)
      ) {
        matched += 1;
      }
    }
    if (shift === 0) {
      sampledDays = common;
    }
    rates.set(shift, common >= 30 ? matched / common : Number.NaN);
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
  if (matchRateAtZero === null || matchRateAtBest === null) {
    return {
      bestShiftHours: 0,
      matchRateAtBest,
      matchRateAtZero,
      sampledDays,
      verdict: "indeterminate",
    };
  }
  const shifted = bestShiftHours !== 0 && matchRateAtBest >= 0.5 &&
    matchRateAtBest >= matchRateAtZero + 0.3;
  const aligned = matchRateAtZero >= 0.5 &&
    matchRateAtZero >= matchRateAtBest - 0.05;
  return {
    bestShiftHours,
    matchRateAtBest,
    matchRateAtZero,
    sampledDays,
    verdict: shifted ? "shifted" : aligned ? "aligned" : "indeterminate",
  };
}

/**
 * The clock a rolling store's key implies, for readers that scan the cache
 * directory itself (scripts/verify-cache-clock.ts). Bar stores carry
 * BAR_CLOCK (bars.ts); the calendar store carries CALENDAR_CLOCK. COT
 * files are bespoke per-contract JSON, not rolling stores, and never
 * carried the defect (weekly date labels, parsed as UTC since inception).
 */
export function storeKindForKey(
  key: string,
): { kind: "bars"; role: SeriesRole } | { kind: "calendar" } | null {
  if (key === "econ-calendar") {
    return { kind: "calendar" };
  }
  if (/-(15min|5min)-/.test(key)) {
    return { kind: "bars", role: "intraday" };
  }
  if (/-daily-/.test(key)) {
    return { kind: "bars", role: "daily" };
  }
  return null;
}
