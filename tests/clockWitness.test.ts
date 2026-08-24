import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  crossSeriesClock,
  gridRegistration,
  newYorkOffsetHours,
  REFERENCE_SESSION_ANCHORS,
  seriesClockWitness,
  sessionAnchorWitness,
  storeKindForKey,
} from "../scripts/clockWitness.ts";
import { ASSET_TYPE_BY_SYMBOL } from "../supabase/functions/trade-analyzer/calibration.ts";
import { resolveProviderSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
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

  // THE WEEKLY BLOCK IS EVIDENCE AND NOT A VERDICT, and this pair is why.
  // It proved "utc" from the EST modal hour sitting exactly one after the EDT
  // one — a property the NORMALIZER IMPOSES. Every stamp passes through
  // newYorkWallClockToUtcMs, so the New York DST signature appears whatever
  // the provider's label meant, and the witness could not fail. It was the
  // SOLE source of the recorded verdict for 63 of 96 intraday stores, and in
  // the live cache ^GSPC and ^N225 carry byte-identical weekly blocks while
  // their venue anchors read "anchored" and "displaced 13 hours out of
  // register".
  it("records the New York venue open's seasonal shift as evidence, not proof", () => {
    const witness = seriesClockWitness(
      weeks((sunday) => {
        const { day, month, year } = utcDate(sunday);
        return newYorkWallClockToUtcMs(year, month, day, 17, 0, 0);
      }),
      "intraday",
    );
    // The observation is kept — the modal hours are a real reading.
    assert.equal(witness.weekly!.edtHour, 21);
    assert.equal(witness.weekly!.estHour, 22);
    // But it blesses nothing, and the record says nothing spoke.
    assert.equal(witness.verdict, "indeterminate");
    assert.equal(witness.verdictFrom, "none");
  });

  it("gives a FOREIGN venue's local labels the same weekly block as a New York one", () => {
    // The proof of circularity, run against the real transform. A series
    // opening at a fixed Tokyo hour, its digits read as New York wall, is
    // indistinguishable here from a genuine New York venue — so any verdict
    // drawn from this block would be the store's construction restated.
    const tokyo = seriesClockWitness(
      weeks((sunday) => {
        const { day, month, year } = utcDate(sunday);
        // 17:00 in Tokyo, read as 17:00 New York.
        return newYorkWallClockToUtcMs(year, month, day, 17, 0, 0);
      }),
      "intraday",
    );
    const newYork = seriesClockWitness(
      weeks((sunday) => {
        const { day, month, year } = utcDate(sunday);
        return newYorkWallClockToUtcMs(year, month, day, 17, 0, 0);
      }),
      "intraday",
    );
    assert.deepEqual(
      tokyo.weekly,
      newYork.weekly,
      "identical evidence from different venues is why this cannot be a verdict",
    );
    assert.equal(tokyo.verdict, "indeterminate");
    assert.equal(newYork.verdict, "indeterminate");
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
    assert.ok(witness.transition!.skippedHourShare! >= 0.8);
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

  // LOCATION IS THE SIGNAL, AND THIS PAIR IS WHERE THAT IS PINNED. Both
  // fixtures dent exactly one hour on every spring Sunday, so both are
  // identical in SIZE — 23 of 24 hours, the ratio the pre-2026-08-24 band
  // called "naive-shaped". Only the hour differs. A 07:00 dent is a
  // recurring provider outage and must not condemn; a 02:00 dent is the hour
  // a New York wall stamp cannot produce, and must. A witness that judges
  // the day's TOTAL rather than its geometry cannot pass both of these.
  const dentedEverySpring = (utcHour: number) => {
    // Derived from the fixture's own span, not listed: a curated list that
    // misses the first year dents 8 of 9 springs and reads "mixed", which
    // is a true verdict about a fixture nobody meant to build.
    const firstYear = new Date(start).getUTCFullYear();
    const lastYear = new Date(start + hours * HOUR).getUTCFullYear();
    const springDays = new Set(
      Array.from(
        { length: lastYear - firstYear + 1 },
        (_, offset) => firstYear + offset,
      ).map((year) => {
        const first = new Date(Date.UTC(year, 2, 1)).getUTCDay();
        return Math.floor(Date.UTC(year, 2, 1 + ((7 - first) % 7) + 7) / DAY);
      }),
    );
    const bars = [];
    let dropped = 0;
    for (let index = 0; index < hours; index += 1) {
      const time = start + index * HOUR;
      if (
        springDays.has(Math.floor(time / DAY)) &&
        new Date(time).getUTCHours() === utcHour
      ) {
        dropped += 1;
        continue;
      }
      bars.push(bar(time));
    }
    assert.ok(dropped >= 8, "the fixture must dent every sampled spring");
    return bars;
  };

  it("does NOT condemn a recurring one-hour outage away from the wall hour", () => {
    const witness = seriesClockWitness(dentedEverySpring(7), "intraday");
    // Dense days, so nothing is dropped for raggedness — the geometry is
    // what judges this, and it reads the transition hour as full.
    assert.equal(witness.transition?.sparseSkipped, undefined);
    assert.ok(
      (witness.transition?.sampled ?? 0) >= 3,
      "dense dented Sundays must still be sampled, not skipped",
    );
    assert.equal(
      witness.verdict,
      "utc",
      "an outage at 07:00 is a gap in the data, not a defect in the clock",
    );
    assert.equal(witness.transition!.naiveYears, 0);
  });

  it("condemns the SAME dent when it lands on the skipped wall hour", () => {
    const witness = seriesClockWitness(dentedEverySpring(2), "intraday");
    assert.equal(witness.transition?.sparseSkipped, undefined);
    assert.equal(
      witness.verdict,
      "naive",
      "an empty 02:00 on every spring is the naive signature and must condemn",
    );
    assert.ok(witness.transition!.naiveYears >= 2);
  });

  // The hourly fixtures above can only make the transition hour EMPTY or
  // FULL, so they pin neither where the boundary between those sits nor what
  // happens on a day too ragged to testify — and a mutation run proved it:
  // widening the naive threshold from 0.25 to 0.9, and disabling the
  // intact-day guard, each left all 31 tests green. These two run at
  // 15-minute resolution, where an hour can be PARTLY present.
  const QUARTER = 900_000;
  const quarters = 9 * 365 * 96;
  const springSlotKept = (keep: (utcHour: number, slot: number) => boolean) => {
    const firstYear = new Date(start).getUTCFullYear();
    const lastYear = new Date(start + quarters * QUARTER).getUTCFullYear();
    const springDays = new Set(
      Array.from(
        { length: lastYear - firstYear + 1 },
        (_, offset) => firstYear + offset,
      ).map((year) => {
        const first = new Date(Date.UTC(year, 2, 1)).getUTCDay();
        return Math.floor(Date.UTC(year, 2, 1 + ((7 - first) % 7) + 7) / DAY);
      }),
    );
    const bars = [];
    for (let index = 0; index < quarters; index += 1) {
      const time = start + index * QUARTER;
      const at = new Date(time);
      if (
        springDays.has(Math.floor(time / DAY)) &&
        !keep(at.getUTCHours(), Math.floor(at.getUTCMinutes() / 15))
      ) {
        continue;
      }
      bars.push(bar(time));
    }
    return bars;
  };

  it("abstains when the transition hour is PARTLY present — half an hour is not an absent one", () => {
    // Two of the four 02:xx bars survive every spring: a share of 0.5, which
    // is neither the empty hour a naive stamp leaves behind nor a full one.
    // Counting it either way would be the old band's mistake in a new place.
    const witness = seriesClockWitness(
      springSlotKept((hour, slot) => hour !== 2 || slot < 2),
      "intraday",
    );
    assert.equal(witness.transition?.sparseSkipped, undefined);
    assert.ok((witness.transition?.sampled ?? 0) >= 3);
    assert.equal(witness.transition!.naiveYears, 0);
    // Not condemned — AND not blessed. An affirmative "utc" is a claim that
    // the wall hour was observed FULL, so a half-present hour must leave the
    // witness with nothing to say rather than letting it certify health it
    // never established.
    assert.equal(witness.transition!.utcYears, 0);
    assert.equal(witness.verdict, "indeterminate");
  });

  it("abstains on a day too ragged to testify, even when its 02:00 IS empty", () => {
    // ALGOUSD's 2020 spring in miniature: five hours badly dented while the
    // rest stand full. On such a day an empty 02:00 is one more gap, not a
    // wall hour that was never stamped — so it must not condemn, and must
    // report that it abstained rather than reading as a clean "utc".
    const witness = seriesClockWitness(
      springSlotKept((hour, slot) =>
        hour !== 2 && (hour < 5 || hour > 9 || slot === 0)
      ),
      "intraday",
    );
    assert.ok(
      (witness.transition?.sparseSkipped ?? 0) >= 3,
      `the ragged springs must be dropped; transition was ${
        JSON.stringify(witness.transition)
      }`,
    );
    assert.notEqual(witness.verdict, "naive");
    assert.notEqual(witness.verdict, "mixed");
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
    assert.ok(witness.transition!.skippedHourShare! <= 0.25);
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
    assert.equal(witness.transition!.naiveYears, 0);
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
    assert.ok(witness.transition!.naiveYears >= 2);
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
    assert.equal(witness.transition!.naiveYears, 0);
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
    assert.ok(poisoned.transition!.skippedHourShare! <= 0.25);
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

describe("grid registration — the absolute test for a session-interior market", () => {
  // crossSeriesClock compares DAY EXTREMES on the UTC calendar day, so a
  // one-sided shift is visible only when it moves a day's high or low across
  // UTC midnight. For a market whose session sits INSIDE the UTC day a
  // four-hour mis-registration moves no extreme — that instrument then issues
  // a clean bill at matchRateAtZero 1.000 rather than abstaining. This one
  // asks a question with no calendar in it: a parent must bracket its own
  // children, because they are the same trades.
  const HOUR_MS = 3_600_000;
  const session = (
    days: number,
    childrenPerParent: number,
    shiftMs = 0,
  ) => {
    const primary: Array<{ time: number; high: number; low: number }> = [];
    const five: Array<{ time: number; high: number; low: number }> = [];
    const start = Date.UTC(2025, 0, 6, 13, 0); // 13:00 UTC — inside the day
    for (let d = 0; d < days; d += 1) {
      for (let q = 0; q < 24; q += 1) { // six hours of 15-minute bars
        const t = start + d * DAY + q * 900_000;
        const base = 100 + Math.sin((d * 24 + q) / 11) * 5;
        const highs: number[] = [];
        const lows: number[] = [];
        for (let c = 0; c < childrenPerParent; c += 1) {
          const h = base + 0.4 + c * 0.1;
          const l = base - 0.4 - c * 0.1;
          highs.push(h);
          lows.push(l);
          five.push({ high: h, low: l, time: t + c * 300_000 + shiftMs });
        }
        primary.push({
          high: Math.max(...highs),
          low: Math.min(...lows),
          time: t,
        });
      }
    }
    return { five, primary };
  };

  it("registers a healthy pair", () => {
    const { five, primary } = session(120, 3);
    const result = gridRegistration(primary, five);
    assert.equal(result.verdict, "registered");
    assert.equal(result.violations, 0);
    assert.ok(result.judged > 1_000);
  });

  it("registers an honestly SPARSE pair — one child per parent is not a defect", () => {
    // This is the population crossSeriesClock cannot judge and the density
    // ratio legitimately reads near 1.0 for. A parent holding one child still
    // brackets that child.
    const { five, primary } = session(120, 1);
    const result = gridRegistration(primary, five);
    assert.equal(result.verdict, "registered");
    assert.equal(result.violations, 0);
  });

  it("condemns a one-sided shift that crossSeriesClock reads as aligned", () => {
    const { five, primary } = session(120, 3, 4 * HOUR_MS);
    const grid = gridRegistration(primary, five);
    assert.equal(grid.verdict, "misregistered");
    // And the point of the pair: the day-extremes instrument does NOT see it,
    // because the session sits inside the UTC day and no extreme crosses
    // midnight.
    const relative = crossSeriesClock(primary, five);
    assert.notEqual(
      relative.verdict,
      "shifted",
      "if this ever starts failing, crossSeriesClock gained the power and " +
        "this test's premise needs restating — not deleting",
    );
  });

  it("refuses a pair that shares no grid at all rather than passing it", () => {
    // Both series carry bars in the shared window and not one parent can be
    // judged. That is a defect, and reading it as 0 violations of 0 would be
    // a pass.
    const { primary } = session(120, 3);
    const offGrid = primary.map((bar) => ({ ...bar, time: bar.time + 60_000 }));
    const result = gridRegistration(primary, offGrid);
    assert.equal(result.verdict, "unjudgeable");
    assert.equal(result.judged, 0);
  });

  it("sees a violation confined to the THIRD child", () => {
    // The fixtures above nest their children — child 0 has the narrowest
    // range — so a check reading only the first child passes them all. A real
    // escape can sit in any slot: this is the still-forming-parent shape,
    // where the parent was captured holding only its first child and the
    // later ones then exceeded it. Measured live on EURUSD and BTCUSD.
    const { five, primary } = session(60, 3);
    const target = primary[10];
    const onlyFirstChild = five.find((bar) => bar.time === target.time)!;
    target.high = onlyFirstChild.high;
    target.low = onlyFirstChild.low;
    const result = gridRegistration(primary, five);
    assert.equal(
      result.violations,
      1,
      "a child escaping the bracket must count wherever it sits",
    );
  });

  it("counts only parents whose whole span lies in the shared window", () => {
    // The last parent's third child sits at +10 minutes. Judging a parent on
    // a truncated child set under-samples it — a violation living in the
    // missing children would never be looked at.
    const { five, primary } = session(60, 3);
    const full = gridRegistration(primary, five).judged;
    const trimmed = gridRegistration(primary, five.slice(0, five.length - 2));
    assert.equal(
      trimmed.judged,
      full - 1,
      "exactly the boundary parent drops out when its children are cut",
    );
  });

  it("does not judge a parent whose children fall outside the shared window", () => {
    // The last parent's third child sits at +10 minutes. Judging it would
    // condemn every healthy store for one bar it could never cover.
    const { five, primary } = session(60, 3);
    const trimmed = five.slice(0, five.length - 2);
    const result = gridRegistration(primary, trimmed);
    assert.equal(result.violations, 0, "the tail must not manufacture a violation");
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

describe("reference session anchor — the population is derived, not listed", () => {
  // THE LAW THIS PINS. REFERENCE_SESSION_ANCHORS held "^GSPC" alone until
  // 2026-08-24 while guarding a failure that afflicted three of the six
  // indices — FMP labels foreign index bars in LOCAL EXCHANGE time and the
  // normalizer read every label as New York wall, displacing ^GDAXI by 6h,
  // ^N225 by 13h and ^AXJO by 14h. It is the ONLY absolute intraday
  // instrument, so no relative check could ever have caught it: they compare
  // two series that shift together.
  //
  // A hand-picked list is how something sits outside its own law. So the
  // population is derived from the roster here, and a new index cannot be
  // onboarded without an anchor.
  it("gives every market classified as an index a session anchor", () => {
    const indices = ASSET_TYPE_BY_SYMBOL.indices;
    assert.ok(indices.length > 0, "the roster must classify some indices");
    const missing = indices.filter((engineSymbol: string) => {
      const provider = resolveProviderSymbols(engineSymbol)[0] ?? engineSymbol;
      return REFERENCE_SESSION_ANCHORS[provider] === undefined;
    });
    assert.deepEqual(
      missing,
      [],
      `every index needs a venue session anchor; missing: ${missing.join(", ")}`,
    );
  });

  // The zone must be the VENUE'S, and nothing else in the suite pins that: a
  // mutation swapping Tokyo's zone for New York's passed all 37 tests. A wrong
  // zone silently flips a verdict — it would read a displaced store as anchored
  // — so the venue each index belongs to is stated here, independently of the
  // table it checks.
  it("anchors each index at ITS OWN venue's open", () => {
    const VENUES: Record<string, { zone: string; hour: number; minute: number }> = {
      "^GSPC": { zone: "America/New_York", hour: 9, minute: 30 }, // NYSE
      "^DJI": { zone: "America/New_York", hour: 9, minute: 30 }, // NYSE
      "^NDX": { zone: "America/New_York", hour: 9, minute: 30 }, // Nasdaq
      "^GDAXI": { zone: "Europe/Berlin", hour: 9, minute: 0 }, // XETRA
      "^N225": { zone: "Asia/Tokyo", hour: 9, minute: 0 }, // Tokyo SE
      "^AXJO": { zone: "Australia/Sydney", hour: 10, minute: 0 }, // ASX
    };
    assert.deepEqual(
      REFERENCE_SESSION_ANCHORS,
      VENUES,
      "an index anchored at the wrong venue reads a displaced store as clean",
    );
  });

  it("anchors every index in a real IANA zone, never a New York wall hour", () => {
    // The zone is what makes the open constant for a venue whose DST does not
    // track the United States. A regression to a fixed wall hour would make
    // Sydney unresolvable and Tokyo marginal.
    for (const [symbol, anchor] of Object.entries(REFERENCE_SESSION_ANCHORS)) {
      assert.ok(anchor.zone.includes("/"), `${symbol}: zone must be IANA`);
      assert.doesNotThrow(
        () => new Intl.DateTimeFormat("en-US", { timeZone: anchor.zone }),
        `${symbol}: ${anchor.zone} must be a resolvable zone`,
      );
      assert.ok(anchor.hour >= 0 && anchor.hour < 24, `${symbol}: hour`);
      assert.ok(anchor.minute >= 0 && anchor.minute < 60, `${symbol}: minute`);
    }
  });

  // Tokyo keeps no DST, so 09:00 JST is 00:00 UTC year-round while its NEW
  // YORK reading moves between 19:00 and 20:00 with the US regime. Sydney's
  // DST runs the opposite way again. This pair proves the venue-zone anchor
  // resolves such a venue and that a displaced store still condemns.
  const tokyoDays = (shiftHours: number) => {
    const bars = [];
    for (let index = 0; index < 320; index += 1) {
      const base = Date.UTC(2025, 7, 4) + index * DAY;
      const at = new Date(base);
      if (at.getUTCDay() === 0 || at.getUTCDay() === 6) continue;
      // 09:00-15:00 JST == 00:00-06:00 UTC, 15-minute bars.
      for (let barIndex = 0; barIndex < 24; barIndex += 1) {
        bars.push(bar(base + barIndex * 15 * 60_000 + shiftHours * HOUR));
      }
    }
    return bars;
  };

  // THE BUCKET MUST BE THE VENUE'S DAY, NOT THE UTC DAY. This witness asks
  // whether each SESSION begins at its venue's open, and that question is
  // venue-local — so grouping by UTC day cuts a session in half for any venue
  // whose hours straddle UTC midnight, making "the first bar of the day" the
  // middle of the previous session.
  //
  // The ASX is that venue and it stopped the R0f rebuild at 47 of 97 on
  // 2026-08-24: 10:00-16:00 Sydney is 00:00-06:00 UTC under AEST but
  // 23:00-05:00 under AEDT, and Sydney's DST runs OPPOSITE to the northern
  // hemisphere's. Bucketed by UTC day the Sydney-local first-bar reading split
  // 11:00 x373 against 10:00 x352 — neither reaching the 0.6 modal share —
  // and the store read "displaced" while its bars were correct.
  it("anchors a venue whose session straddles UTC midnight", () => {
    // 10:00-16:00 Sydney across a full year, so both DST regimes appear.
    const bars = [];
    const toUtc = (y: number, mo: number, d: number, h: number, mi: number) => {
      const want = Date.UTC(y, mo - 1, d, h, mi);
      let guess = want;
      const fmt = new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
        hourCycle: "h23",
        minute: "2-digit",
        month: "2-digit",
        timeZone: "Australia/Sydney",
        year: "numeric",
      });
      for (let pass = 0; pass < 3; pass += 1) {
        const p = Object.fromEntries(
          fmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]),
        );
        const hh = Number(p.hour) === 24 ? 0 : Number(p.hour);
        guess += want -
          Date.UTC(+p.year, +p.month - 1, +p.day, hh, +p.minute);
      }
      return guess;
    };
    for (let dayIndex = 0; dayIndex < 520; dayIndex += 1) {
      const at = new Date(Date.UTC(2024, 0, 1) + dayIndex * DAY);
      if (at.getUTCDay() === 0 || at.getUTCDay() === 6) continue;
      for (let slot = 0; slot < 24; slot += 1) {
        const minutes = 10 * 60 + slot * 15;
        bars.push(
          bar(
            toUtc(
              at.getUTCFullYear(),
              at.getUTCMonth() + 1,
              at.getUTCDate(),
              Math.floor(minutes / 60),
              minutes % 60,
            ),
          ),
        );
      }
    }
    bars.sort((a, b) => a.time - b.time);
    const witness = sessionAnchorWitness(bars, {
      hour: 10,
      minute: 0,
      zone: "Australia/Sydney",
    });
    assert.equal(witness.verdict, "anchored");
    assert.equal(witness.displacedYears, 0);
    assert.ok(witness.anchoredYears >= 2);
  });

  it("anchors a Tokyo-shaped store whose venue keeps no DST", () => {
    const witness = sessionAnchorWitness(tokyoDays(0), {
      zone: "Asia/Tokyo",
      hour: 9,
      minute: 0,
    });
    assert.equal(witness.verdict, "anchored");
    assert.ok(witness.anchoredYears >= 2);
    assert.equal(witness.displacedYears, 0);
  });

  it("condemns the same store carrying local labels read as New York wall", () => {
    // The measured production defect: +13h for Tokyo, exactly JST-minus-ET.
    const witness = sessionAnchorWitness(tokyoDays(13), {
      zone: "Asia/Tokyo",
      hour: 9,
      minute: 0,
    });
    assert.equal(witness.verdict, "displaced");
    assert.ok(witness.displacedYears > 0);
    assert.equal(witness.anchoredYears, 0);
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
