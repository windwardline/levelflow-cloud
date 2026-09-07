import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ABSOLUTE_RANGE_RATIO_LIMIT,
  BAR_RANGE_DRIFT_LIMIT,
  DAILY_CONTAINMENT_TOLERANCE,
  dailyContainment,
  formatFeedCharacter,
  MIN_BARS_PER_DAY,
  MIN_MONTHS_FOR_YEAR_SPLIT,
  monthKey,
  type OhlcBar,
  RANGE_DRIFT_LIMIT,
  serializeContainment,
} from "../scripts/feedCharacter.ts";

/**
 * A daily bar is the parent of every intraday bar on its day, so the
 * intraday series' range over a day cannot exceed the daily bar's range:
 * containment is a property of the aggregation, the same principle
 * gridRegistration applies one tier down. On 2026-09-06 the calibration
 * cache's forex 5-minute stores were found to ESCAPE their daily bars for
 * 2021–2024 (AUDNZD by 35–120%, the USD majors by 1–6%) and nowhere else,
 * which is a feed defect, not a market. This witness is the mechanised form
 * of that finding: per store, per year, the medians of the containment
 * ratios and their drift against the store's own baseline, and a verdict.
 *
 * Every figure here is hand-computed from synthetic stores; the real cache's
 * decided cases (AUDNZD 2021 escapes, EURUSD 2019 contained) are mimicked in
 * shape so the instrument reproduces them before it speaks on an open store.
 */

const DAY = 86_400_000;
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "feed-character.ts");

/** A daily bar keyed like the cache's: its time sits on the UTC day it describes. */
function dailyBar(dayIndex: number, low: number, high: number) {
  return { high, low, time: Date.UTC(2015, 0, 1) + dayIndex * DAY + 4 * 3_600_000 };
}

/**
 * `bars` intraday bars on the UTC day, each spanning `barRange` around the
 * mid, with the day's intraday extremes set to exactly `low` and
 * `high + overBy` on the first two bars.
 */
function intradayDay(dayIndex: number, low: number, high: number, bars: number, overBy: number, barRange = 0.0004) {
  const start = Date.UTC(2015, 0, 1) + dayIndex * DAY;
  const out: Array<{ high: number; low: number; time: number }> = [];
  const mid = (low + high) / 2;
  for (let i = 0; i < bars; i += 1) {
    const time = start + i * 300_000;
    if (i === 0) out.push({ high: high + overBy, low: mid, time });
    else if (i === 1) out.push({ high: mid, low, time });
    else out.push({ high: Math.min(high, mid + barRange / 2), low: Math.max(low, mid - barRange / 2), time });
  }
  return out;
}

function year(dayIndex: number): number {
  return new Date(Date.UTC(2015, 0, 1) + dayIndex * DAY).getUTCFullYear();
}

/** Six full years (2015–2020) of a store: clean everywhere except where `overByFor(year)` or `barRangeFor(year)` says otherwise. */
function store(overByFor: (y: number) => number, barRangeFor: (y: number) => number = () => 0.0004, bars = 60) {
  const daily = []; const intraday = [];
  for (let d = 0; d < 6 * 365 + 2; d += 1) {
    daily.push(dailyBar(d, 1.0, 1.01));
    intraday.push(...intradayDay(d, 1.0, 1.01, bars, overByFor(year(d)), barRangeFor(year(d))));
  }
  return { daily, intraday };
}

describe("daily containment — the witness", () => {
  it("a store whose days sit inside their daily bars is contained, with the facts and a baseline", () => {
    const { daily, intraday } = store(() => 0);
    const w = dailyContainment(intraday, daily);
    assert.equal(w.verdict, "contained");
    assert.deepEqual(w.escapeYears, []);
    const y2016 = w.years.get(2016)!;
    assert.equal(y2016.days, 366);
    assert.equal(y2016.escapeShare, 0);
    assert.equal(y2016.underShare, 0);
    assert.deepEqual(y2016.escapedBy, []);
    // The day's intraday range equals the daily range exactly: ratio 1.
    assert.equal(Number(y2016.medianRangeRatio.toFixed(6)), 1);
    // Mean bar range over the daily range: 58 bars at 0.0004 plus the two extreme bars at 0.005 each, over 60, over 0.01.
    const expectedBar = (58 * 0.0004 + 2 * 0.005) / 60 / 0.01;
    assert.equal(Number(y2016.medianBarRangeRatio.toFixed(6)), Number(expectedBar.toFixed(6)));
    assert.equal(Number(w.baseline!.rangeRatio.toFixed(6)), 1);
    assert.equal(Number(w.baseline!.barRangeRatio.toFixed(6)), Number(expectedBar.toFixed(6)));
  });

  it("a year whose range escapes the daily bar is named by range drift, and the store escapes", () => {
    // 2018 escapes by 35% of the daily range on every day; the other five years are clean.
    const { daily, intraday } = store((y) => (y === 2018 ? 0.0035 : 0));
    const w = dailyContainment(intraday, daily);
    assert.equal(w.verdict, "escapes");
    assert.deepEqual(w.escapeYears, [2018]);
    const y2018 = w.years.get(2018)!;
    assert.equal(Number(y2018.medianRangeRatio.toFixed(3)), 1.35);
    assert.equal(y2018.escapeShare, 1);
    // 1.35 is past the absolute clause too; both reasons are named.
    assert.deepEqual(y2018.escapedBy, ["range-drift", "bar-range-drift", "absolute-range"].filter((r) =>
      r !== "bar-range-drift" || y2018.medianBarRangeRatio >= w.baseline!.barRangeRatio * (1 + BAR_RANGE_DRIFT_LIMIT)));
    // The baseline is the median of the per-year medians, so one dirty year of six cannot move it.
    assert.equal(Number(w.baseline!.rangeRatio.toFixed(6)), 1);
    assert.equal(w.years.get(2017)!.escapeShare, 0);
  });

  it("the range-drift limit is a boundary against the store's own baseline", () => {
    const inside = store((y) => (y === 2018 ? 0.01 * (RANGE_DRIFT_LIMIT - 0.001) : 0));
    const outside = store((y) => (y === 2018 ? 0.01 * (RANGE_DRIFT_LIMIT + 0.001) : 0));
    const wIn = dailyContainment(inside.intraday, inside.daily);
    assert.deepEqual(wIn.escapeYears, []);
    // Every 2018 day escaped at the day grain, and that is recorded — the verdict is the medians'.
    assert.equal(wIn.years.get(2018)!.escapeShare, 0.01 * (RANGE_DRIFT_LIMIT - 0.001) > 0.01 * DAILY_CONTAINMENT_TOLERANCE ? 1 : 0);
    const wOut = dailyContainment(outside.intraday, outside.daily);
    assert.deepEqual(wOut.escapeYears, [2018]);
    assert.deepEqual(wOut.years.get(2018)!.escapedBy, ["range-drift"]);
  });

  it("a year whose bars widen without the range escaping is named by bar-range drift — the majors' shape", () => {
    // 2018's bars are 40% wider than the baseline's; the day's extremes stay inside the daily bar.
    const wider = store(() => 0, (y) => (y === 2018 ? 0.0004 * 1.4 : 0.0004));
    const w = dailyContainment(wider.intraday, wider.daily);
    assert.deepEqual(w.escapeYears, [2018]);
    assert.deepEqual(w.years.get(2018)!.escapedBy, ["bar-range-drift"]);
    assert.equal(w.years.get(2018)!.escapeShare, 0);
    const narrower = store(() => 0, (y) => (y === 2018 ? 0.0004 * (1 + BAR_RANGE_DRIFT_LIMIT - 0.05) : 0.0004));
    assert.deepEqual(dailyContainment(narrower.intraday, narrower.daily).escapeYears, []);
  });

  it("a store contaminated in every year has no drift to show and is caught by the absolute clause", () => {
    const { daily, intraday } = store(() => 0.0035);
    const w = dailyContainment(intraday, daily);
    assert.equal(w.verdict, "escapes");
    assert.equal(w.escapeYears.length, 6);
    assert.deepEqual(w.years.get(2016)!.escapedBy, ["absolute-range"]);
    assert.ok(w.years.get(2016)!.medianRangeRatio >= ABSOLUTE_RANGE_RATIO_LIMIT);
  });

  it("a handful of escaping days does not move a year's median, and is recorded as the share it is", () => {
    // Ten percent of 2018's days escape by 20% of the daily range; the median day is clean.
    const { daily, intraday } = store(() => 0);
    const dirty = intraday.map((bar) => {
      const d = Math.floor((bar.time - Date.UTC(2015, 0, 1)) / DAY);
      return year(d) === 2018 && d % 10 === 0 && bar.time % DAY === 0 ? { ...bar, high: bar.high + 0.002 } : bar;
    });
    const w = dailyContainment(dirty, daily);
    assert.equal(w.verdict, "contained");
    assert.ok(w.years.get(2018)!.escapeShare > 0.09 && w.years.get(2018)!.escapeShare < 0.11);
    assert.equal(Number(w.years.get(2018)!.medianRangeRatio.toFixed(6)), 1);
  });

  it("a day with too few intraday bars is not judged, and a store with nothing judgeable is unjudgeable", () => {
    const daily = [dailyBar(0, 1.0, 1.01), dailyBar(1, 1.0, 1.01)];
    const sparse = [...intradayDay(0, 1.0, 1.01, MIN_BARS_PER_DAY - 1, 0.01), ...intradayDay(1, 1.0, 1.01, MIN_BARS_PER_DAY, 0)];
    const w = dailyContainment(sparse, daily);
    assert.equal(w.years.get(2015)!.days, 1);
    assert.equal(w.years.get(2015)!.escapeShare, 0);
    assert.equal(dailyContainment([], daily).verdict, "unjudgeable");
    assert.equal(dailyContainment(sparse, []).verdict, "unjudgeable");
    assert.equal(dailyContainment(sparse, []).baseline, null);
    // Days the daily store does not carry are not judged either.
    assert.equal(dailyContainment(intradayDay(5, 1.0, 1.01, 60, 0.01), daily).verdict, "unjudgeable");
  });

  it("reproduces the decided cases in shape: a contaminated cross year escapes, a clean major year is contained", () => {
    // AUDNZD 2021 read a median intraday/daily range ratio of 1.35 with a baseline near 1;
    // EURUSD 2019 read exactly 1.000 with nothing escaping.
    const audnzd = store((y) => (y === 2018 ? 0.0035 : 0), undefined, 200);
    const a = dailyContainment(audnzd.intraday, audnzd.daily);
    assert.deepEqual(a.escapeYears, [2018]);
    assert.ok(a.years.get(2018)!.medianRangeRatio > 1.3);
    const eurusd = store(() => 0, undefined, 200);
    const e = dailyContainment(eurusd.intraday, eurusd.daily);
    assert.equal(e.verdict, "contained");
    assert.equal(e.years.get(2019)!.medianRangeRatio, 1);
  });

  it("prints the baseline, the facts per year, and names the escaping years and their reasons", () => {
    const { daily, intraday } = store((y) => (y === 2018 ? 0.0035 : 0));
    const text = formatFeedCharacter("AUDNZD", "5min", dailyContainment(intraday, daily));
    assert.match(text, /^AUDNZD 5min ESCAPES: 2018/);
    assert.match(text, /baseline range 1\.000 bar/);
    assert.match(text, /2018 days 365 range 1\.350 .* ESCAPES \(range-drift/);
    assert.match(text, /2017 days 365 range 1\.000 .* escape 0\.0% under 0\.0%$/m);
  });
});

describe("the manifest form", () => {
  it("serialises a witness as plain JSON with years as sorted string keys, stable under a round trip", () => {
    const { daily, intraday } = store((y) => (y === 2018 ? 0.0035 : 0));
    const w = dailyContainment(intraday, daily);
    const record = serializeContainment(w);
    assert.equal(record.verdict, "escapes");
    assert.deepEqual(record.escapeYears, [2018]);
    assert.equal(record.judgedDays, w.judgedDays);
    assert.deepEqual(Object.keys(record.years), ["2015", "2016", "2017", "2018", "2019", "2020"]);
    assert.deepEqual(record.years["2018"].escapedBy, w.years.get(2018)!.escapedBy);
    assert.equal(record.years["2016"].days, 366);
    assert.equal(record.baseline!.rangeRatio, w.baseline!.rangeRatio);
    // JSON-safe and stable: what the manifest hashes is what a reader gets back.
    assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
    const unjudged = serializeContainment(dailyContainment([], daily));
    assert.equal(unjudged.verdict, "unjudgeable");
    assert.equal(unjudged.baseline, null);
    assert.deepEqual(unjudged.years, {});
  });
});

describe("the reader over a cache", () => {
  function writeStore(dir: string, symbol: string, tf: string, items: Array<{ high: number; low: number; time: number }>) {
    writeFileSync(join(dir, `${symbol}-${tf}-7000.rolling.json`), JSON.stringify({ clock: "test", items: items.map((b) => ({ ...b, open: b.low, close: b.high, volume: 1 })), pinned: {} }));
  }
  it("reads every store it is pointed at, prints the table, and exits non-zero on an escaping store when asked", () => {
    const cache = mkdtempSync(join(tmpdir(), "feed-character-"));
    mkdirSync(cache, { recursive: true });
    const clean = store(() => 0);
    const dirty = store((y) => (y === 2018 ? 0.0035 : 0));
    writeStore(cache, "CLEANX", "daily", clean.daily); writeStore(cache, "CLEANX", "5min", clean.intraday);
    writeStore(cache, "DIRTYX", "daily", dirty.daily); writeStore(cache, "DIRTYX", "5min", dirty.intraday);
    const out = execFileSync(TSX, [READER, "--cache-dir", cache, "--symbols", "CLEANX,DIRTYX"], { encoding: "utf8" });
    assert.match(out, /CLEANX 5min contained/);
    assert.match(out, /DIRTYX 5min ESCAPES: 2018/);
    assert.match(out, /1 store\(s\) escape their daily bars: DIRTYX 5min \(2018\)/);
    assert.throws(
      () => execFileSync(TSX, [READER, "--cache-dir", cache, "--symbols", "CLEANX,DIRTYX", "--fail-on-escape"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      /DIRTYX/,
    );
    // An absent store is named in the table and the summary, never skipped in silence —
    // and under --fail-on-escape it fails the run.
    const absent = execFileSync(TSX, [READER, "--cache-dir", cache, "--symbols", "NOSUCH,CLEANX"], { encoding: "utf8" });
    assert.match(absent, /^NOSUCH daily ABSENT/m);
    assert.match(absent, /1 store\(s\) absent: NOSUCH daily/);
    assert.match(absent, /CLEANX 5min contained/);
    const tier = execFileSync(TSX, [READER, "--cache-dir", cache, "--symbols", "CLEANX", "--timeframes", "15min"], { encoding: "utf8" });
    assert.match(tier, /^CLEANX 15min ABSENT/m);
    assert.throws(
      () => execFileSync(TSX, [READER, "--cache-dir", cache, "--symbols", "NOSUCH", "--fail-on-escape"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      /NOSUCH daily absent/,
    );
  });
});

/**
 * The reversion edge (round 2, 2026-09-07). The witness bins by UTC year, and
 * the artifact it names does not begin or end on a January: the refuters
 * measured stores whose 2024 runs heavy through July and clean from August,
 * which a year bin calls contained. A year that is contained AS A YEAR while
 * some of its months are not is the case the map has to be able to state, or
 * a per-market span exclusion built on it excludes the wrong rows.
 */
describe("the month grain — a year is not the smallest thing that can escape", () => {
  const DAY = 86_400_000;

  /** One day of intraday bars whose derived range is `ratio` x the daily bar's, in `bars` equal steps. */
  function day(dayIndex: number, ratio: number, bars = 24): { daily: OhlcBar; intraday: OhlcBar[] } {
    const time = dayIndex * DAY;
    const intraday: OhlcBar[] = [];
    for (let i = 0; i < bars; i += 1) {
      const low = 100 + (i * ratio) / bars;
      intraday.push({ high: low + ratio / bars, low, time: time + i * 3_600_000 });
    }
    return { daily: { high: 101, low: 100, time }, intraday };
  }

  function store(spec: Array<{ days: number; from: number; ratio: number }>) {
    const daily: OhlcBar[] = [];
    const intraday: OhlcBar[] = [];
    for (const part of spec) {
      for (let i = 0; i < part.days; i += 1) {
        const built = day(part.from + i, part.ratio);
        daily.push(built.daily);
        intraday.push(...built.intraday);
      }
    }
    return { daily, intraday };
  }

  it("keys a month as YYYYMM from the UTC day", () => {
    assert.equal(monthKey(Date.UTC(2024, 0, 1) / DAY), 202401);
    assert.equal(monthKey(Date.UTC(2024, 11, 31) / DAY), 202412);
    assert.equal(monthKey(Date.UTC(2009, 8, 25) / DAY), 200909);
  });

  it("names the months that escape inside a year the year verdict calls contained", () => {
    // 2009-2010 clean at 1.00 (the baseline), then a 2011 whose first half runs
    // at 1.20 and whose second half is clean — heavy enough to be named by the
    // month, diluted enough that the year's own median stays at the baseline.
    const start = Math.floor(Date.UTC(2009, 0, 1) / DAY);
    const y2011 = Math.floor(Date.UTC(2011, 0, 1) / DAY);
    const witness = dailyContainment(
      store([
        { days: 720, from: start, ratio: 1.0 },
        { days: 150, from: y2011, ratio: 1.2 },
        { days: 200, from: y2011 + 160, ratio: 1.0 },
      ]).intraday,
      store([
        { days: 720, from: start, ratio: 1.0 },
        { days: 150, from: y2011, ratio: 1.2 },
        { days: 200, from: y2011 + 160, ratio: 1.0 },
      ]).daily,
    );
    assert.equal(witness.escapeYears.includes(2011), false, "the year's own median is diluted to the baseline");
    const named = witness.escapeMonths.filter((key) => key >= 201101 && key <= 201112);
    assert.ok(named.length >= 4, `the heavy months are named: ${JSON.stringify(witness.escapeMonths)}`);
    assert.ok(named.every((key) => key <= 201106), `only the heavy half is named: ${JSON.stringify(named)}`);
    for (const key of named) {
      assert.ok(witness.months.get(key)!.escapedBy.length > 0);
      assert.ok(witness.months.get(key)!.days > 0);
    }
    // The year verdict is untouched by the month grain: nothing downstream moves.
    assert.equal(witness.verdict, witness.escapeYears.length > 0 ? "escapes" : "contained");
  });

  it("judges a month only when it carries enough days: a thin month is measured, never named", () => {
    const start = Math.floor(Date.UTC(2015, 0, 1) / DAY);
    // Three wild days in their own month, against 400 clean ones. The month's
    // median is off the scale; it still may not name itself, because three days
    // is not a fact about the feed.
    const built = store([{ days: 400, from: start, ratio: 1.0 }, { days: 3, from: start + 500, ratio: 3.0 }]);
    const witness = dailyContainment(built.intraday, built.daily);
    const thin = monthKey(start + 500);
    const facts = witness.months.get(thin);
    assert.ok(facts, "the thin month is measured");
    assert.equal(facts.days, 3);
    assert.ok(facts.days < MIN_MONTHS_FOR_YEAR_SPLIT);
    assert.ok(facts.escapedBy.length > 0, "and it does breach the clauses — that is why the day floor is the only thing holding it back");
    assert.equal(witness.escapeMonths.includes(thin), false, "a month of three days does not get to name itself an escape");
    assert.ok(witness.judgedMonths >= 12);
  });

  it("the day floor is exactly MIN_MONTHS_FOR_YEAR_SPLIT: a month one day short is measured and not named", () => {
    const start = Math.floor(Date.UTC(2016, 0, 1) / DAY);
    // 400 clean days set the baseline; then two heavy runs in months of their own,
    // one of MIN_MONTHS_FOR_YEAR_SPLIT days and one of that minus one.
    const atFloor = Math.floor(Date.UTC(2018, 0, 1) / DAY);
    const belowFloor = Math.floor(Date.UTC(2018, 5, 1) / DAY);
    const spec = [
      { days: 400, from: start, ratio: 1.0 },
      { days: MIN_MONTHS_FOR_YEAR_SPLIT, from: atFloor, ratio: 2.0 },
      { days: MIN_MONTHS_FOR_YEAR_SPLIT - 1, from: belowFloor, ratio: 2.0 },
    ];
    const built = store(spec);
    const witness = dailyContainment(built.intraday, built.daily);
    assert.equal(witness.months.get(monthKey(atFloor))!.days, MIN_MONTHS_FOR_YEAR_SPLIT);
    assert.equal(witness.months.get(monthKey(belowFloor))!.days, MIN_MONTHS_FOR_YEAR_SPLIT - 1);
    assert.equal(witness.escapeMonths.includes(monthKey(atFloor)), true, "exactly the floor is enough");
    assert.equal(witness.escapeMonths.includes(monthKey(belowFloor)), false, "one day short is not");
  });

  it("prints the hidden months only where the year grain hides them — never under a year that already escapes", () => {
    const start = Math.floor(Date.UTC(2009, 0, 1) / DAY);
    const y2011 = Math.floor(Date.UTC(2011, 0, 1) / DAY);
    // 2011: heavy first half, clean second — the year's median stays at the baseline.
    // 2013: heavy throughout — the year itself escapes, so its months say nothing new.
    const y2013 = Math.floor(Date.UTC(2013, 0, 1) / DAY);
    const spec = [
      { days: 720, from: start, ratio: 1.0 },
      { days: 150, from: y2011, ratio: 1.2 },
      { days: 200, from: y2011 + 160, ratio: 1.0 },
      { days: 330, from: y2013, ratio: 1.4 },
    ]
    const built = store(spec)
    const witness = dailyContainment(built.intraday, built.daily);
    assert.equal(witness.escapeYears.includes(2011), false);
    assert.equal(witness.escapeYears.includes(2013), true);
    const text = formatFeedCharacter("EURUSD", "5min", witness);
    const hidden = text.split("\n").filter((line) => line.includes("HIDDEN INSIDE A CONTAINED YEAR"));
    assert.equal(hidden.length, 1, `exactly the contained year says it: ${JSON.stringify(hidden)}`);
    assert.match(hidden[0], /months 2011/);
    assert.doesNotMatch(hidden[0], /2013/);
  });

  it("carries the months into the manifest record and back, ascending", () => {
    const start = Math.floor(Date.UTC(2020, 0, 1) / DAY);
    const witness = dailyContainment(
      store([{ days: 400, from: start, ratio: 1.0 }, { days: 60, from: start + 420, ratio: 1.6 }]).intraday,
      store([{ days: 400, from: start, ratio: 1.0 }, { days: 60, from: start + 420, ratio: 1.6 }]).daily,
    );
    const record = serializeContainment(witness);
    assert.deepEqual(record.escapeMonths, [...witness.escapeMonths].sort((a, b) => a - b));
    assert.deepEqual(Object.keys(record.months).map(Number), [...witness.months.keys()].sort((a, b) => a - b));
    assert.equal(record.judgedMonths, witness.judgedMonths);
  });
});

