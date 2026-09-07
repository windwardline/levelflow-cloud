/**
 * Daily containment — a feed-character witness across the daily tier.
 *
 * A daily bar is the parent of every intraday bar on its day, so the intraday
 * series' range over a day cannot exceed the daily bar's range: containment
 * is a property of the aggregation, not of any timezone, session or market —
 * the same principle `gridRegistration` applies between the 15-minute and
 * 5-minute tiers, one tier up.
 *
 * WHY THIS EXISTS. On 2026-09-06 the calibration cache's forex 5-minute and
 * 15-minute stores were found to ESCAPE their daily bars for 2021–2024 and
 * nowhere else: AUDNZD's intraday range ran 1.35×–2.20× its own daily bar for
 * three years, NZDCHF/AUDCHF/EURCHF 15–20% beyond, the USD majors 1–6%; the
 * change lands in one month (2020-12 → 2021-01) on all 28 pairs and reverts
 * by 2024-10; bar counts never change; metals show nothing of the kind. In
 * those same months the corpus's forex outcome mix steps (stops 28% → 16%,
 * take-profit 4.0% → 1.5%) and the shipped ladder's forex R turns from
 * −1,314 R (2018–20) to +2,918 R (2021–22H1). A feed whose child series
 * exceeds its parent is not a market; it is a defect, and every verdict priced
 * on those bars inherits it. This witness makes that visible per store, per
 * year, so a manifest can carry it and a reader can refuse or stratify.
 *
 * WHAT IT MEASURES, per UTC day that both series carry (daily bar present,
 * daily range > 0, at least MIN_BARS_PER_DAY intraday bars):
 *   rangeRatio    = (max intraday high − min intraday low) / (daily high − daily low)
 *   barRangeRatio = mean(intraday bar high − low) / (daily high − daily low)
 * Per year it records the days judged, the median of each ratio, and the
 * share of days whose rangeRatio escapes above or falls under 1 by more than
 * DAILY_CONTAINMENT_TOLERANCE. The day-grain shares are FACTS, not the
 * verdict: the intraday day is keyed to the UTC calendar day while a venue's
 * daily bar keeps its own day (a forex day closes at 17:00 New York), so a
 * few percent of clean days escape by a session's edge in every year of every
 * store — measured across the cache on 2026-09-06, clean forex years carry
 * 10–15% escaping days and crypto stores read a systematic offset. A share
 * cannot separate a feed defect from a keying edge; the medians can.
 *
 * THE VERDICT is drift of a year's medians against the store's own baseline
 * (the median across its judged years), plus one absolute clause:
 *   a year ESCAPES when medianRangeRatio ≥ baseline + RANGE_DRIFT_LIMIT,
 *   or medianBarRangeRatio ≥ baseline × (1 + BAR_RANGE_DRIFT_LIMIT),
 *   or medianRangeRatio ≥ ABSOLUTE_RANGE_RATIO_LIMIT (no keying edge puts a
 *   child series that far outside its parent).
 * The store escapes when any year does; a store with nothing judgeable is
 * `unjudgeable`, never a pass.
 *
 * THRESHOLDS, from the cache on 2026-09-06 (`docs/research/r3/feed-character-all-2026-09-06.log`;
 * the tracked witness output is `docs/research/r3/feed-character.txt`).
 * Clean forex years: medianRangeRatio 0.998–1.003 and medianBarRangeRatio
 * within ±12% of the store's baseline (USDJPY 2024 at −12% is the widest).
 * Named forex years: the USD majors' medianRangeRatio 1.001–1.06 with
 * medianBarRangeRatio +11% to +90% over baseline; the crosses' 1.08–2.20 with
 * +60% to +400%. RANGE_DRIFT_LIMIT 0.02 and BAR_RANGE_DRIFT_LIMIT 0.25 name
 * every named year on every cross, every major's 2021, and the majors'
 * 2022–2023 where the bar drift exceeds a quarter; they leave USDJPY 2022
 * (+11%) and EURUSD 2024 (+15%) as recorded-but-contained tails of the
 * window, which is what the reversion looked like. ABSOLUTE 1.30 catches a
 * store contaminated in every year it carries, where drift has no baseline.
 */

export type OhlcBar = { high: number; low: number; time: number };

/** A day's intraday range may exceed (or fall short of) the daily bar's by this fraction of the daily range and still count as contained at the DAY grain. Recorded, not judged. */
export const DAILY_CONTAINMENT_TOLERANCE = 0.03;
/** A year escapes when its median range ratio exceeds the store's baseline by this much (in units of the daily range). */
export const RANGE_DRIFT_LIMIT = 0.02;
/** A year escapes when its median bar-range ratio exceeds the store's baseline by this fraction. */
export const BAR_RANGE_DRIFT_LIMIT = 0.25;
/** A year escapes outright when its median range ratio reaches this — a child series that far outside its parent is no keying edge. */
export const ABSOLUTE_RANGE_RATIO_LIMIT = 1.3;
/** Days with fewer intraday bars than this are not judged: a thin day proves nothing about the feed. */
export const MIN_BARS_PER_DAY = 20;
/** Years with fewer judged days than this do not enter the store's baseline (they are still judged against it). */
export const MIN_DAYS_FOR_BASELINE = 30;

/**
 * Days a MONTH must carry before it may name itself an escape. The artifact
 * this witness names does not begin or end on a January — round 2 (2026-09-07)
 * found stores running heavy through 2024-07 and clean from 2024-08, which a
 * year bin calls contained — so the witness states months as well as years.
 * Fifteen is half a trading month: enough that a median means something,
 * loose enough that a holiday month still speaks. A month below it is
 * measured and reported, never named.
 */
export const MIN_MONTHS_FOR_YEAR_SPLIT = 15;

/** The UTC month a day belongs to, as YYYYMM — sortable, printable, JSON-safe. */
export function monthKey(dayKey: number): number {
  const date = new Date(dayKey * 86_400_000);
  return date.getUTCFullYear() * 100 + date.getUTCMonth() + 1;
}

export type YearFacts = {
  /** Days judged: a daily bar with a positive range and at least MIN_BARS_PER_DAY intraday bars. */
  days: number;
  /** Share of judged days whose intraday range escaped the daily bar beyond the tolerance (a keying-sensitive fact). */
  escapeShare: number;
  /** Share of judged days whose intraday range fell short of the daily bar beyond the tolerance. */
  underShare: number;
  /** Median over judged days of intraday-derived daily range / daily-store range. */
  medianRangeRatio: number;
  /** Median over judged days of mean intraday bar range / daily-store range. */
  medianBarRangeRatio: number;
  /** Why the year escaped, empty when it did not. */
  escapedBy: Array<"range-drift" | "bar-range-drift" | "absolute-range">;
};

export type DailyContainment = {
  verdict: "contained" | "escapes" | "unjudgeable";
  /** Years that escaped, ascending. */
  escapeYears: number[];
  /**
   * Months that escaped, ascending, as YYYYMM — measured against the SAME
   * store baseline and the same three clauses as the years. A month may be
   * named inside a year the year grain calls contained: that is the point of
   * it (the reversion edge runs mid-year). The year verdict is unaffected.
   */
  escapeMonths: number[];
  judgedDays: number;
  /** Months carrying at least one judged day. */
  judgedMonths: number;
  /** The store's own baseline: the median across qualifying years of each per-year median. */
  baseline: { rangeRatio: number; barRangeRatio: number } | null;
  years: Map<number, YearFacts>;
  /** Per month, the same facts, keyed YYYYMM. */
  months: Map<number, YearFacts>;
};

function utcDayKey(timeMs: number): number {
  return Math.floor(timeMs / 86_400_000);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function dailyContainment(intraday: OhlcBar[], daily: OhlcBar[]): DailyContainment {
  // One refusal, after the count: an empty series, a series the daily store
  // never overlaps, and a store of thin days all end at zero judged days,
  // and a second guard ahead of that one would be a mutant nothing can kill.
  const empty: DailyContainment = { baseline: null, escapeMonths: [], escapeYears: [], judgedDays: 0, judgedMonths: 0, months: new Map(), verdict: "unjudgeable", years: new Map() };
  const dailyByDay = new Map<number, OhlcBar>();
  for (const bar of daily) {
    dailyByDay.set(utcDayKey(bar.time), bar);
  }
  const days = new Map<number, { count: number; high: number; low: number; rangeSum: number }>();
  for (const bar of intraday) {
    const key = utcDayKey(bar.time);
    const day = days.get(key);
    if (day) {
      day.count += 1;
      day.rangeSum += bar.high - bar.low;
      if (bar.high > day.high) day.high = bar.high;
      if (bar.low < day.low) day.low = bar.low;
    } else {
      days.set(key, { count: 1, high: bar.high, low: bar.low, rangeSum: bar.high - bar.low });
    }
  }
  type Accumulator = { escapes: number; judged: number; ratios: number[]; barRatios: number[]; unders: number };
  const perYear = new Map<number, Accumulator>();
  const perMonth = new Map<number, Accumulator>();
  let judgedDays = 0;
  for (const [key, day] of days) {
    const parent = dailyByDay.get(key);
    if (!parent || day.count < MIN_BARS_PER_DAY) continue;
    const dailyRange = parent.high - parent.low;
    if (!(dailyRange > 0)) continue;
    const ratio = (day.high - day.low) / dailyRange;
    const barRatio = day.rangeSum / day.count / dailyRange;
    const year = new Date(key * 86_400_000).getUTCFullYear();
    for (const [bucket, bucketKey] of [[perYear, year], [perMonth, monthKey(key)]] as Array<[Map<number, Accumulator>, number]>) {
      let acc = bucket.get(bucketKey);
      if (!acc) {
        acc = { escapes: 0, judged: 0, ratios: [], barRatios: [], unders: 0 };
        bucket.set(bucketKey, acc);
      }
      acc.judged += 1;
      acc.ratios.push(ratio);
      acc.barRatios.push(barRatio);
      if (ratio > 1 + DAILY_CONTAINMENT_TOLERANCE) acc.escapes += 1;
      if (ratio < 1 - DAILY_CONTAINMENT_TOLERANCE) acc.unders += 1;
    }
    judgedDays += 1;
  }
  if (judgedDays === 0) {
    return empty;
  }
  const factsOf = (source: Map<number, { escapes: number; judged: number; ratios: number[]; barRatios: number[]; unders: number }>) => {
    const out = new Map<number, YearFacts>();
    for (const bucketKey of [...source.keys()].sort((a, b) => a - b)) {
      const acc = source.get(bucketKey)!;
      out.set(bucketKey, {
        days: acc.judged,
        escapeShare: acc.escapes / acc.judged,
        escapedBy: [],
        medianBarRangeRatio: median(acc.barRatios),
        medianRangeRatio: median(acc.ratios),
        underShare: acc.unders / acc.judged,
      });
    }
    return out;
  };
  const facts = factsOf(perYear);
  const monthFacts = factsOf(perMonth);
  // The store's own baseline: the median of the per-year medians over the
  // years that carry enough days to speak — a three-year window inside a
  // seventeen-year store cannot move it, which is the point.
  const qualifying = [...facts.values()].filter((f) => f.days >= MIN_DAYS_FOR_BASELINE);
  const pool = qualifying.length > 0 ? qualifying : [...facts.values()];
  const baseline = {
    barRangeRatio: median(pool.map((f) => f.medianBarRangeRatio)),
    rangeRatio: median(pool.map((f) => f.medianRangeRatio)),
  };
  // The same three clauses against the same store baseline, at both grains.
  // A month must also carry enough days to speak: a three-day holiday month
  // has a median, and it is not a fact about the feed.
  const judge = (source: Map<number, YearFacts>, minDays: number) => {
    const escaped: number[] = [];
    for (const [bucketKey, f] of source) {
      if (f.medianRangeRatio >= baseline.rangeRatio + RANGE_DRIFT_LIMIT) f.escapedBy.push("range-drift");
      if (f.medianBarRangeRatio >= baseline.barRangeRatio * (1 + BAR_RANGE_DRIFT_LIMIT)) f.escapedBy.push("bar-range-drift");
      if (f.medianRangeRatio >= ABSOLUTE_RANGE_RATIO_LIMIT) f.escapedBy.push("absolute-range");
      if (f.escapedBy.length > 0 && f.days >= minDays) escaped.push(bucketKey);
    }
    return escaped;
  };
  const escapeYears = judge(facts, 1);
  const escapeMonths = judge(monthFacts, MIN_MONTHS_FOR_YEAR_SPLIT);
  return {
    baseline,
    escapeMonths,
    escapeYears,
    judgedDays,
    judgedMonths: monthFacts.size,
    months: monthFacts,
    // The year grain alone decides the store's verdict: the months state where
    // inside a year the character sits, they do not re-judge the store.
    verdict: escapeYears.length > 0 ? "escapes" : "contained",
    years: facts,
  };
}

/** The witness in the manifest's shape: plain JSON, years as string keys in ascending order. */
export type FeedCharacterRecord = {
  baseline: { barRangeRatio: number; rangeRatio: number } | null;
  escapeMonths: number[];
  escapeYears: number[];
  judgedDays: number;
  judgedMonths: number;
  months: Record<string, YearFacts>;
  verdict: DailyContainment["verdict"];
  years: Record<string, YearFacts>;
};

/**
 * The manifest form of a witness. Stable and JSON-safe: what the manifest
 * hashes is exactly what a reader parses back, and a Map would hash to `{}`.
 */
export function serializeContainment(witness: DailyContainment): FeedCharacterRecord {
  // No sort here, deliberately: every key is an integer-like string, and a
  // JavaScript object always enumerates those in ascending numeric order
  // whatever the insertion order. A sort would be a guard that cannot fire —
  // a mutation reversing it changed nothing, which is how it was found.
  const plain = (source: Map<number, YearFacts>) => {
    const out: Record<string, YearFacts> = {};
    for (const [bucketKey, facts] of source) {
      out[String(bucketKey)] = { ...facts, escapedBy: [...facts.escapedBy] };
    }
    return out;
  };
  const years = plain(witness.years);
  return {
    baseline: witness.baseline ? { ...witness.baseline } : null,
    escapeMonths: [...witness.escapeMonths].sort((a, b) => a - b),
    escapeYears: [...witness.escapeYears],
    judgedDays: witness.judgedDays,
    judgedMonths: witness.judgedMonths,
    months: plain(witness.months),
    verdict: witness.verdict,
    years,
  };
}

/** One store's witness as text: the verdict line, then one line per year. */
export function formatFeedCharacter(symbol: string, timeframe: string, witness: DailyContainment): string {
  const head = witness.verdict === "escapes"
    ? `${symbol} ${timeframe} ESCAPES: ${witness.escapeYears.join(", ")}`
    : `${symbol} ${timeframe} ${witness.verdict}`;
  const lines = [head];
  if (witness.baseline) {
    lines.push(`  baseline range ${witness.baseline.rangeRatio.toFixed(3)} bar ${witness.baseline.barRangeRatio.toFixed(4)} over ${witness.judgedDays} days`);
  }
  for (const [year, facts] of witness.years) {
    lines.push(
      `  ${year} days ${facts.days} range ${facts.medianRangeRatio.toFixed(3)} bar ${facts.medianBarRangeRatio.toFixed(4)} ` +
        `escape ${(facts.escapeShare * 100).toFixed(1)}% under ${(facts.underShare * 100).toFixed(1)}%` +
        (facts.escapedBy.length > 0 ? ` ESCAPES (${facts.escapedBy.join(", ")})` : ""),
    );
    // The months this year hides: named months inside a year the year grain
    // calls contained is the reversion edge, and the whole reason the month
    // grain exists. Indented, so the table's parser (feedYears.ts) reads only
    // the verdict lines and nothing here can change a year map.
    const hidden = witness.escapeMonths.filter((key) => Math.floor(key / 100) === year);
    if (hidden.length > 0 && facts.escapedBy.length === 0) {
      lines.push(
        `    HIDDEN INSIDE A CONTAINED YEAR — months ${hidden.join(", ")}: ` +
          hidden.map((key) => {
            const m = witness.months.get(key)!;
            return `${key} range ${m.medianRangeRatio.toFixed(3)} bar ${m.medianBarRangeRatio.toFixed(4)} (${m.escapedBy.join(", ")})`;
          }).join("; "),
      );
    }
  }
  return lines.join("\n");
}
