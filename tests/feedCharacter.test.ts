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
  RANGE_DRIFT_LIMIT,
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
