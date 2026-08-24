import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  crossSeriesClock,
  newYorkOffsetHours,
  REFERENCE_SESSION_ANCHORS,
  seriesClockWitness,
  sessionAnchorWitness,
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
// exact populations it must separate. The #358 adversarial round added
// the pins for what an aggregate-only witness could NOT separate: a
// minority naive era certified "utc", a half-poisoned primary reading
// "aligned", the untested −4 polarity that carries the real 2026-08-11
// signature, and a single outage Sunday condemning a healthy store.

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

describe("daily-stamp witness — the universal condemning witness, per year", () => {
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
    assert.equal(witness.daily!.naiveYears, 0);
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

  it("condemns a MINORITY naive era that an aggregate share would absolve (#358)", () => {
    // Ten years true, one naive year in the middle: ~9% of rows — under
    // every aggregate threshold, but a whole year of 4-5h-early stamps.
    const bars = [];
    for (let index = 0; index < 11 * 365; index += 1) {
      const { day, month, year } = utcDate(Date.UTC(2015, 0, 1) + index * DAY);
      bars.push(
        bar(
          year === 2019
            ? Date.UTC(year, month - 1, day)
            : newYorkWallClockToUtcMs(year, month, day, 0, 0, 0),
        ),
      );
    }
    const witness = seriesClockWitness(bars, "daily");
    assert.equal(witness.verdict, "mixed");
    assert.equal(witness.daily!.naiveYears, 1);
    assert.ok(witness.daily!.utcYears >= 9);
  });

  it("stays indeterminate below the sample floor", () => {
    const witness = seriesClockWitness(
      days(10, (y, m, d) => Date.UTC(y, m - 1, d)),
      "daily",
    );
    assert.equal(witness.verdict, "indeterminate");
  });

  it("has no dead band — a ~12% one-year admixture is mixed, not invisible (#358 re-review)", () => {
    // 45 naive days inside one otherwise-true year: 12.3% of that year —
    // inside the old 0.10–0.15 gap where the year matched no branch and
    // the store verdicted "utc".
    const bars = [];
    for (let index = 0; index < 11 * 365; index += 1) {
      const { day, month, year } = utcDate(Date.UTC(2015, 0, 1) + index * DAY);
      const naiveDay = year === 2019 && month >= 3 && month <= 4 &&
        day <= 23;
      bars.push(
        bar(
          naiveDay
            ? Date.UTC(year, month - 1, day)
            : newYorkWallClockToUtcMs(year, month, day, 0, 0, 0),
        ),
      );
    }
    const witness = seriesClockWitness(bars, "daily");
    assert.equal(witness.verdict, "mixed");
    assert.equal(witness.daily!.mixedYears, 1);
  });

  it("does not let a partial year condemn on two rows — the floor is absolute too (#358 round 3)", () => {
    // Ten clean full years, then a 40-row partial 2025 whose first two
    // rows are naive: 5% of that year's rows — over the proportional
    // floor — but only 2 rows, under the absolute one. Not mixed.
    const bars = [];
    for (let ms = Date.UTC(2015, 0, 1); ms < Date.UTC(2025, 0, 1); ms += DAY) {
      const { day, month, year } = utcDate(ms);
      bars.push(bar(newYorkWallClockToUtcMs(year, month, day, 0, 0, 0)));
    }
    for (let index = 0; index < 40; index += 1) {
      const { day, month, year } = utcDate(Date.UTC(2025, 0, 1) + index * DAY);
      bars.push(
        bar(
          index < 2
            ? Date.UTC(year, month - 1, day)
            : newYorkWallClockToUtcMs(year, month, day, 0, 0, 0),
        ),
      );
    }
    const witness = seriesClockWitness(bars, "daily");
    assert.equal(witness.verdict, "utc");
    assert.equal(witness.daily!.mixedYears, 0);
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

  it("a fully naive sessioned series is indeterminate here — the stated limit, not a pass", () => {
    // Both witnesses stand down for a naive forex-shaped store: weekly
    // sees invariance (indistinguishable from Tokyo), transition has no
    // bars at the closed 02:00 hour. The condemnation path for this
    // population is the store stamp, the cross-series mate, and the
    // reference anchor — pinned as such so nobody mistakes the
    // indeterminate for a clean bill.
    const witness = seriesClockWitness(
      weeks((sunday) => {
        const { day, month, year } = utcDate(sunday);
        return naiveStamp(newYorkWallClockToUtcMs(year, month, day, 17, 0, 0));
      }),
      "intraday",
    );
    assert.equal(witness.verdict, "indeterminate");
  });
});

describe("spring-transition witness — the 24/7 condemning witness, per year", () => {
  // Nine years of hourly bars: every spring-forward Sunday has no 02:xx
  // New York wall hour, so the naive transform is missing that hour's
  // stamps while true UTC keeps the full day.
  const start = Date.UTC(2017, 0, 2);
  const hours = 9 * 365 * 24;

  const trueUtcBars = () => {
    const bars = [];
    for (let index = 0; index < hours; index += 1) {
      bars.push(bar(start + index * HOUR));
    }
    return bars;
  };

  it("keeps a true-UTC series at full transition-day counts", () => {
    const witness = seriesClockWitness(trueUtcBars(), "intraday");
    assert.equal(witness.verdict, "utc");
    assert.ok(witness.transition!.ratioMedian! >= 0.985);
    assert.ok(witness.transition!.sampled >= 8);
  });

  // A day too sparse to hold the signal must read as a GAP, not as clock
  // evidence — the witness's own doctrine, extended from a dent in a day to a
  // day that is all dent. DYDXUSD stopped the R0 rebuild at 81 of 97 symbols on
  // 2026-08-24: a token listed 2021-09 whose early spring Sundays held 46, 61,
  // 92, 43 and 96 bars of a 96-bar day, producing a median ratio of 0.968 that
  // landed inside the naive band by coincidence and CONDEMNED a healthy store.
  // Its cross-series registration is aligned at zero shift, 99.9% over 1,767
  // days — the witness that CAN judge it says its clock is clean.
  it("abstains on a series whose sampled days are too sparse to testify", () => {
    // Dense recent history, trade-sparse early years: bars survive with a
    // probability that climbs over time, deterministically.
    const bars = [];
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let index = 0; index < hours; index += 1) {
      const at = start + index * HOUR;
      const progress = index / hours;
      if (progress > 0.75 || rand() < 0.35 + progress) {
        bars.push(bar(at));
      }
    }
    const witness = seriesClockWitness(bars, "intraday");
    assert.notEqual(
      witness.verdict,
      "naive",
      "a sparse early era must not be condemned as a clock defect",
    );
    assert.notEqual(witness.verdict, "mixed");
    // And prove the GUARD is what did it. Without this the case passes for any
    // reason the verdict is not naive — including a series too young to sample
    // three springs, which is a different fact with a different remedy.
    assert.ok(
      (witness.transition?.sparseSkipped ?? 0) > 0,
      `the sparse-day guard must be what abstained; transition was ${
        JSON.stringify(witness.transition)
      }`,
    );
  });

  // #358's band logic, re-covered. The outage-dent pins below now exercise the
  // sparse guard instead of the band, because a half-missing Sunday is dropped
  // before it can be judged — so the naive-shaped band needs its own dense
  // case or it is pinned nowhere. A dent of exactly one bar in 96 is dense
  // enough to be judged (0.99) and OUTSIDE the band, which is the distinction
  // the band exists to draw.
  it("judges a dense but shallow dent against the band rather than skipping it", () => {
    const bars = [];
    const springDays = new Set(
      [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((year) => {
        const first = new Date(Date.UTC(year, 2, 1)).getUTCDay();
        return Math.floor(Date.UTC(year, 2, 1 + ((7 - first) % 7) + 7) / DAY);
      }),
    );
    let dropped = 0;
    for (let index = 0; index < hours; index += 1) {
      const time = start + index * HOUR;
      // One hour missing on each spring Sunday: ratio 23/24, naive-shaped.
      if (springDays.has(Math.floor(time / DAY)) && new Date(time).getUTCHours() === 7) {
        dropped += 1;
        continue;
      }
      bars.push(bar(time));
    }
    assert.ok(dropped >= 8, "the fixture must dent every sampled spring");
    const witness = seriesClockWitness(bars, "intraday");
    // Dense days, so nothing is skipped — the band is what judges this.
    assert.equal(witness.transition?.sparseSkipped, undefined);
    assert.ok(
      (witness.transition?.sampled ?? 0) >= 3,
      "dense dented Sundays must still be sampled, not skipped",
    );
    assert.equal(
      witness.verdict,
      "naive",
      "a one-hour dent on every spring is the naive signature and must condemn",
    );
  });

  // The safety property, and the reason the sparse guard does not weaken the
  // witness: a genuinely naive day KEEPS 23 of its 24 hours, so it clears the
  // density floor comfortably and still condemns. If this ever fails, the guard
  // has been set too high and the 2026-08-11 defect could pass.
  it("still condemns a naive series after the sparse-day guard", () => {
    const stamps = new Set<number>();
    for (let index = 0; index < hours; index += 1) {
      stamps.add(naiveStamp(start + index * HOUR));
    }
    const witness = seriesClockWitness(
      [...stamps].sort((a, b) => a - b).map(bar),
      "intraday",
    );
    assert.equal(
      witness.verdict,
      "naive",
      "the sparse-day guard must never let a naive series through",
    );
    assert.ok(
      (witness.transition!.sampled ?? 0) >= 3,
      "a naive dense series must still contribute its sampled springs",
    );
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
    assert.ok(witness.transition!.ratioMedian! <= 0.97);
  });

  it("does NOT condemn a healthy series for one outage-dented transition Sunday (#358)", () => {
    const springOf2020 = (() => {
      // Second Sunday of March 2020, as the witness computes it.
      const first = new Date(Date.UTC(2020, 2, 1)).getUTCDay();
      return Math.floor(
        Date.UTC(2020, 2, 1 + ((7 - first) % 7) + 7) / DAY,
      );
    })();
    const bars = trueUtcBars().filter((entry, index) =>
      Math.floor(entry.time / DAY) !== springOf2020 || index % 2 === 0
    );
    const witness = seriesClockWitness(bars, "intraday");
    assert.equal(witness.verdict, "utc");
    // A half-missing Sunday (ratio ~0.5) is far outside the naive-shaped
    // band, so it reads as a gap — not as clock evidence at all.
    assert.equal(witness.transition!.lowYears, 0);
  });

  it("condemns a MINORITY naive era among true years as mixed (#358)", () => {
    // 2019 and 2020 naive, the rest true: the median is clean, the two
    // low years are the tell.
    const bars = [];
    for (let index = 0; index < hours; index += 1) {
      const time = start + index * HOUR;
      const year = new Date(time).getUTCFullYear();
      bars.push(bar(year === 2019 || year === 2020 ? naiveStamp(time) : time));
    }
    const deduped = [...new Set(bars.map((entry) => entry.time))]
      .sort((a, b) => a - b).map(bar);
    const witness = seriesClockWitness(deduped, "intraday");
    assert.equal(witness.verdict, "mixed");
    assert.ok(witness.transition!.lowYears >= 2);
  });

  it("does NOT condemn a 3-spring store for two outage-dented Sundays — gaps are not clock evidence (#358 round 3)", () => {
    // Two of the three sampled springs half-missing: the old <=0.97 rule
    // read the 0.5 ratios as naive and condemned run-globally; the
    // naive-shaped band reads them as gaps and refuses to verdict.
    const youngStart = Date.UTC(2023, 3, 1);
    const youngHours = Math.floor((Date.UTC(2026, 7, 1) - youngStart) / HOUR);
    const springDays = [2024, 2025].map((year) => {
      const first = new Date(Date.UTC(year, 2, 1)).getUTCDay();
      return Math.floor(Date.UTC(year, 2, 1 + ((7 - first) % 7) + 7) / DAY);
    });
    const bars = [];
    for (let index = 0; index < youngHours; index += 1) {
      const time = youngStart + index * HOUR;
      if (springDays.includes(Math.floor(time / DAY)) && index % 2 === 1) {
        continue;
      }
      bars.push(bar(time));
    }
    const witness = seriesClockWitness(bars, "intraday");
    assert.equal(witness.verdict, "indeterminate");
    assert.equal(witness.transition!.lowYears, 0);
  });

  it("fires at realistic young-crypto depth — three springs decide (#358 re-review)", () => {
    // A 2023-04 listing (the CAKE/HBAR vintage) reaches 2026 with exactly
    // three spring Sundays. The old floor of 8 made the witness
    // unreachable for this population; the per-year median makes 3 safe.
    const youngStart = Date.UTC(2023, 3, 1);
    const youngHours = Math.floor((Date.UTC(2026, 7, 1) - youngStart) / HOUR);
    const trueBars = [];
    for (let index = 0; index < youngHours; index += 1) {
      trueBars.push(bar(youngStart + index * HOUR));
    }
    const healthy = seriesClockWitness(trueBars, "intraday");
    assert.equal(healthy.verdict, "utc");
    assert.equal(healthy.transition!.sampled, 3);

    const stamps = new Set<number>();
    for (let index = 0; index < youngHours; index += 1) {
      stamps.add(naiveStamp(youngStart + index * HOUR));
    }
    const poisoned = seriesClockWitness(
      [...stamps].sort((a, b) => a - b).map(bar),
      "intraday",
    );
    assert.equal(poisoned.verdict, "naive");
    assert.ok(poisoned.transition!.ratioMedian! <= 0.97);
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

describe("cross-series registration — the audit's mixed-clock instrument, per year", () => {
  // One deterministic price path, sampled at 5 minutes; the 15-minute
  // series aggregates exactly three 5-minute bars, so extremes agree
  // bar-for-bar when the clocks agree. Spans two calendar years so the
  // per-year condemnation has year boundaries to work with.
  const START = Date.UTC(2025, 10, 1);
  const TOTAL_DAYS = 150;
  const buildPair = (input: {
    fiveShiftMs?: number;
    primaryShiftMs?: number | ((time: number) => number);
  } = {}) => {
    const fiveShift = input.fiveShiftMs ?? 0;
    const primaryShiftOf = typeof input.primaryShiftMs === "function"
      ? input.primaryShiftMs
      : () => (input.primaryShiftMs as number | undefined) ?? 0;
    const fiveMinute = [];
    const primary = [];
    const totalFive = TOTAL_DAYS * 288;
    for (let index = 0; index < totalFive; index += 1) {
      const high = 100 + 10 * Math.sin(index / 37) + (index % 13) * 0.01;
      fiveMinute.push({
        high,
        low: high - 0.5 - (index % 7) * 0.01,
        time: START + index * 300_000 + fiveShift,
      });
    }
    for (let index = 0; index < totalFive; index += 3) {
      const window = [];
      for (let k = index; k < index + 3; k += 1) {
        const high = 100 + 10 * Math.sin(k / 37) + (k % 13) * 0.01;
        window.push({ high, low: high - 0.5 - (k % 7) * 0.01 });
      }
      const time = START + index * 300_000;
      primary.push({
        high: Math.max(...window.map((entry) => entry.high)),
        low: Math.min(...window.map((entry) => entry.low)),
        time: time + primaryShiftOf(time),
      });
    }
    return { fiveMinute, primary };
  };

  it("reads a same-clock pair as aligned at zero shift", () => {
    const { fiveMinute, primary } = buildPair();
    const registration = crossSeriesClock(primary, fiveMinute);
    assert.equal(registration.verdict, "aligned");
    assert.equal(registration.bestShiftHours, 0);
    assert.ok(registration.matchRateAtZero! >= 0.9);
    assert.equal(registration.shiftedYears, 0);
  });

  it("reads a naive 5-minute series against a true primary as shifted at +4", () => {
    const { fiveMinute, primary } = buildPair({ fiveShiftMs: -4 * HOUR });
    const registration = crossSeriesClock(primary, fiveMinute);
    assert.equal(registration.verdict, "shifted");
    assert.equal(registration.bestShiftHours, 4);
  });

  it("reads a naive PRIMARY against a true 5-minute mate as shifted at −4 — the real 2026-08-11 polarity (#358)", () => {
    const { fiveMinute, primary } = buildPair({ primaryShiftMs: -4 * HOUR });
    const registration = crossSeriesClock(primary, fiveMinute);
    assert.equal(registration.verdict, "shifted");
    assert.equal(registration.bestShiftHours, -4);
  });

  it("condemns a HALF-poisoned primary whose healthy half clears the aligned floor (#358)", () => {
    // First 75 days naive, rest true: globally ~half the days match at
    // zero shift (the healthy era), which the old aggregate read as
    // aligned at 0.5+. The poisoned era's own year registers shifted.
    const cutover = START + 75 * DAY;
    const { fiveMinute, primary } = buildPair({
      primaryShiftMs: (time) => (time < cutover ? -4 * HOUR : 0),
    });
    const registration = crossSeriesClock(primary, fiveMinute);
    assert.equal(registration.verdict, "shifted");
    assert.ok(registration.shiftedYears >= 1);
  });

  it("stays indeterminate below the common-day floor", () => {
    const { fiveMinute, primary } = buildPair();
    const registration = crossSeriesClock(
      primary.slice(0, 96 * 5),
      fiveMinute.slice(0, 288 * 5),
    );
    assert.equal(registration.verdict, "indeterminate");
  });
});

describe("reference session anchor — the absolute check for a named venue (#358)", () => {
  // NYSE-shaped days: 09:30–16:00 New York wall, 15-minute bars, across
  // both DST regimes (Aug 2025 – Jun 2026).
  const sessionDays = (naive: boolean) => {
    const bars = [];
    for (let index = 0; index < 220; index += 1) {
      const base = Date.UTC(2025, 7, 4) + index * DAY;
      const at = new Date(base);
      if (at.getUTCDay() === 0 || at.getUTCDay() === 6) {
        continue;
      }
      const { day, month, year } = utcDate(base);
      for (let barIndex = 0; barIndex < 26; barIndex += 1) {
        const wallMinutes = 9 * 60 + 30 + barIndex * 15;
        const time = newYorkWallClockToUtcMs(
          year,
          month,
          day,
          Math.floor(wallMinutes / 60),
          wallMinutes % 60,
          0,
        );
        bars.push(bar(naive ? naiveStamp(time) : time));
      }
    }
    return bars;
  };

  it("anchors a true-UTC store at the venue's known open in both regimes", () => {
    const witness = sessionAnchorWitness(
      sessionDays(false),
      REFERENCE_SESSION_ANCHORS["^GSPC"],
    );
    assert.equal(witness.verdict, "anchored");
    assert.ok(witness.anchoredYears >= 2);
    assert.equal(witness.displacedYears, 0);
  });

  it("condemns the naive transform — the store's first bar reads hours before the open", () => {
    const witness = sessionAnchorWitness(
      sessionDays(true),
      REFERENCE_SESSION_ANCHORS["^GSPC"],
    );
    assert.equal(witness.verdict, "displaced");
  });

  it("condemns a provider convention flip, which every relative instrument misses (#358)", () => {
    // FMP starts stamping true-UTC digits while the normalizer still
    // applies the NY-wall reading: every bar lands 4-5h late. Weekly,
    // transition and cross-series all pass (everything shifts together);
    // the venue anchor does not.
    const flipped = sessionDays(false).map((entry) => {
      const digits = new Date(entry.time);
      return bar(
        newYorkWallClockToUtcMs(
          digits.getUTCFullYear(),
          digits.getUTCMonth() + 1,
          digits.getUTCDate(),
          digits.getUTCHours(),
          digits.getUTCMinutes(),
          0,
        ),
      );
    });
    const witness = sessionAnchorWitness(
      flipped,
      REFERENCE_SESSION_ANCHORS["^GSPC"],
    );
    assert.equal(witness.verdict, "displaced");
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
