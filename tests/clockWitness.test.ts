import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  crossSeriesClock,
  newYorkOffsetHours,
  seriesClockWitness,
  storeKindForKey,
} from "../scripts/clockWitness.ts";
import {
  newYorkClockParts,
  newYorkWallClockToUtcMs,
} from "../supabase/functions/trade-analyzer/bars.ts";

// R0 "one clock": the witnesses that let a cache PROVE which clock its
// stamps are on. The synthetic series here are built two ways from the
// same underlying instants — through the current normalizer's conversion
// (true UTC) and through the pre-2026-08-09 defect's transform (New York
// wall digits read back as UTC) — so each witness is tested against the
// exact populations it must separate.

const HOUR = 3_600_000;
const DAY = 86_400_000;

const utcDate = (ms: number) => {
  const date = new Date(ms);
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
};

/** The defect era's transform: the instant's NY wall digits, read as UTC. */
const naiveStamp = (utcMs: number) => {
  const parts = newYorkClockParts(utcMs);
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
};

const bar = (time: number) => ({ time });

describe("newYorkOffsetHours", () => {
  it("reads 4 under EDT and 5 under EST", () => {
    assert.equal(newYorkOffsetHours(Date.UTC(2026, 6, 15, 12, 0)), 4);
    assert.equal(newYorkOffsetHours(Date.UTC(2026, 0, 15, 12, 0)), 5);
  });
});

describe("daily-stamp witness — the universal condemning witness", () => {
  const days = (count: number, stamp: (y: number, m: number, d: number) => number) => {
    const bars = [];
    for (let index = 0; index < count; index += 1) {
      const { day, month, year } = utcDate(Date.UTC(2025, 0, 1) + index * DAY);
      bars.push(bar(stamp(year, month, day)));
    }
    return bars;
  };

  it("reads New-York-midnight stamps as utc across both DST regimes", () => {
    const witness = seriesClockWitness(
      days(200, (y, m, d) => newYorkWallClockToUtcMs(y, m, d, 0, 0, 0)),
      "daily",
    );
    assert.equal(witness.verdict, "utc");
    assert.ok(witness.daily!.midnightNyShare >= 0.99);
  });

  it("condemns the defect era's 00:00-UTC stamps as naive", () => {
    const witness = seriesClockWitness(
      days(200, (y, m, d) => Date.UTC(y, m - 1, d)),
      "daily",
    );
    assert.equal(witness.verdict, "naive");
    assert.ok(witness.daily!.midnightUtcShare >= 0.99);
  });

  it("condemns a store holding both eras as mixed — the actual 2026-08-11 shape", () => {
    const naiveEra = days(150, (y, m, d) => Date.UTC(y, m - 1, d));
    const utcEra = [];
    for (let index = 150; index < 200; index += 1) {
      const { day, month, year } = utcDate(Date.UTC(2025, 0, 1) + index * DAY);
      utcEra.push(bar(newYorkWallClockToUtcMs(year, month, day, 0, 0, 0)));
    }
    const witness = seriesClockWitness([...naiveEra, ...utcEra], "daily");
    assert.equal(witness.verdict, "mixed");
  });

  it("stays indeterminate below the sample floor", () => {
    const witness = seriesClockWitness(
      days(10, (y, m, d) => Date.UTC(y, m - 1, d)),
      "daily",
    );
    assert.equal(witness.verdict, "indeterminate");
  });
});

describe("weekly-open witness — proves utc, never condemns", () => {
  // 40 weeks spanning the 2025-11-02 fall-back and 2026-03-08
  // spring-forward, so both DST regimes are sampled.
  const weeks = (openFor: (sundayUtcMs: number) => number) => {
    const bars = [];
    const firstSunday = Date.UTC(2025, 7, 3);
    for (let week = 0; week < 40; week += 1) {
      const open = openFor(firstSunday + week * 7 * DAY);
      for (let day = 0; day < 5; day += 1) {
        for (let hour = 0; hour < 23; hour += 1) {
          bars.push(bar(open + day * 24 * HOUR + hour * HOUR));
        }
      }
    }
    return bars;
  };

  it("proves utc from the one-hour seasonal shift of a New York venue open", () => {
    const witness = seriesClockWitness(
      weeks((sunday) => {
        const { day, month, year } = utcDate(sunday);
        return newYorkWallClockToUtcMs(year, month, day, 17, 0, 0);
      }),
      "intraday",
    );
    assert.equal(witness.verdict, "utc");
    assert.equal(witness.weekly!.edtHour, 21);
    assert.equal(witness.weekly!.estHour, 22);
  });

  it("does NOT read a no-DST venue's seasonal invariance as naive — the Nikkei pin", () => {
    // Tokyo has no DST: its week opens at one fixed UTC hour year-round,
    // exactly the invariance a naive-stamped New York series shows. The
    // witness must return indeterminate here; condemning is the daily
    // witness's job, which does not depend on venue hours.
    const witness = seriesClockWitness(
      weeks((sunday) => sunday),
      "intraday",
    );
    assert.equal(witness.verdict, "indeterminate");
    assert.equal(witness.weekly!.edtHour, witness.weekly!.estHour);
  });
});

describe("spring-transition witness — the 24/7 condemning witness", () => {
  // Nine years of hourly bars: every spring-forward Sunday has no 02:xx
  // New York wall hour, so the naive transform is missing that hour's
  // stamps while true UTC keeps the full day.
  const start = Date.UTC(2017, 0, 2);
  const hours = 9 * 365 * 24;

  it("keeps a true-UTC series at full transition-day counts", () => {
    const bars = [];
    for (let index = 0; index < hours; index += 1) {
      bars.push(bar(start + index * HOUR));
    }
    const witness = seriesClockWitness(bars, "intraday");
    assert.equal(witness.verdict, "utc");
    assert.ok(witness.transition!.ratio! >= 0.985);
    assert.ok(witness.transition!.sampled >= 8);
  });

  it("condemns the naive transform by its missing spring hours", () => {
    const stamps = new Set<number>();
    for (let index = 0; index < hours; index += 1) {
      stamps.add(naiveStamp(start + index * HOUR));
    }
    const witness = seriesClockWitness(
      [...stamps].sort((a, b) => a - b).map(bar),
      "intraday",
    );
    assert.equal(witness.verdict, "naive");
    assert.ok(witness.transition!.ratio! <= 0.97);
  });

  it("stays indeterminate for a session market that is closed at the transition hour", () => {
    // Five trading days a week means day coverage ~0.71, below the 24/7
    // floor — and no bars exist at Sunday 02:00 to go missing.
    const bars = [];
    for (let week = 0; week < 470; week += 1) {
      for (let day = 0; day < 5; day += 1) {
        for (let hour = 0; hour < 24; hour += 1) {
          bars.push(bar(start + week * 7 * DAY + day * DAY + hour * HOUR));
        }
      }
    }
    const witness = seriesClockWitness(bars, "intraday");
    assert.notEqual(witness.verdict, "naive");
    assert.equal(witness.transition, undefined);
  });
});

describe("cross-series registration — the audit's mixed-clock instrument", () => {
  // One deterministic price path, sampled at 5 minutes; the 15-minute
  // series aggregates exactly three 5-minute bars, so extremes agree
  // bar-for-bar when the clocks agree.
  const buildPair = (fiveMinShiftMs: number) => {
    const start = Date.UTC(2026, 3, 1);
    const fiveMinute = [];
    const primary = [];
    const totalFive = 60 * 288;
    for (let index = 0; index < totalFive; index += 1) {
      const high = 100 + 10 * Math.sin(index / 37) + (index % 13) * 0.01;
      fiveMinute.push({
        high,
        low: high - 0.5 - (index % 7) * 0.01,
        time: start + index * 300_000 + fiveMinShiftMs,
      });
    }
    for (let index = 0; index < totalFive; index += 3) {
      const window = fiveMinute.slice(index, index + 3);
      primary.push({
        high: Math.max(...window.map((entry) => entry.high)),
        low: Math.min(...window.map((entry) => entry.low)),
        time: start + index * 300_000,
      });
    }
    return { fiveMinute, primary };
  };

  it("reads a same-clock pair as aligned at zero shift", () => {
    const { fiveMinute, primary } = buildPair(0);
    const registration = crossSeriesClock(primary, fiveMinute);
    assert.equal(registration.verdict, "aligned");
    assert.equal(registration.bestShiftHours, 0);
    assert.ok(registration.matchRateAtZero! >= 0.9);
  });

  it("reads a naive-vs-utc pair as shifted — the 4-hour signature", () => {
    const { fiveMinute, primary } = buildPair(-4 * HOUR);
    const registration = crossSeriesClock(primary, fiveMinute);
    assert.equal(registration.verdict, "shifted");
    assert.equal(registration.bestShiftHours, 4);
    assert.ok(
      registration.matchRateAtBest! >= registration.matchRateAtZero! + 0.3,
    );
  });

  it("stays indeterminate below the common-day floor", () => {
    const { fiveMinute, primary } = buildPair(0);
    const registration = crossSeriesClock(
      primary.slice(0, 96 * 5),
      fiveMinute.slice(0, 288 * 5),
    );
    assert.equal(registration.verdict, "indeterminate");
  });
});

describe("storeKindForKey — every rolling store has one expected clock", () => {
  it("maps bar and calendar stores and refuses unknown keys", () => {
    assert.deepEqual(storeKindForKey("EURUSD-15min-7000"), {
      kind: "bars",
      role: "intraday",
    });
    assert.deepEqual(storeKindForKey("BTCUSD-5min-7000"), {
      kind: "bars",
      role: "intraday",
    });
    assert.deepEqual(storeKindForKey("^GDAXI-daily-7000"), {
      kind: "bars",
      role: "daily",
    });
    assert.deepEqual(storeKindForKey("econ-calendar"), { kind: "calendar" });
    assert.equal(storeKindForKey("something-else"), null);
  });
});
