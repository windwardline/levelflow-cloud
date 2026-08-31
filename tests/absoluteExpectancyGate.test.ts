import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classVerdicts, readGridCube } from "../scripts/grid-totalr.ts";
import {
  emptyStats,
  rExpectancyLower95,
  type SweepEmitRow,
  tMultiplier95,
} from "../scripts/sweepStats.ts";

/**
 * D4: the gate's `accepted` was four delta conditions and a thinness check,
 * with NO ABSOLUTE EXPECTANCY TERM — "the defect that let a losing market
 * pass".
 *
 * Every term was a comparison against the baseline, so a variant could beat
 * its baseline on fit R, select R, the paired p and the expectancy delta while
 * both of them lost money, and the gate called that an accept: the best of a
 * losing set, reported as a pick. Amendment 39 is the rule it broke — profit
 * is the measure, and nothing may rank on a quantity where the money is
 * knowable.
 *
 * The headline test is the FIRST one: two losing arms, the better one refused.
 * Under the old rule it was accepted, and the corpus that produced the 4d
 * derivation is what that rule was applied to.
 */

const DAY = 86_400_000;

function outcomeRow(
  variant: string,
  dayIndex: number,
  realizedR: number,
  split = "test",
  symbol = "EURUSD",
): SweepEmitRow {
  return {
    accepted: true,
    outcome: realizedR > 0 ? "take_profit" : "stop_loss",
    realizedR,
    split,
    symbol,
    time: (split === "train" ? Date.UTC(2024, 0, 8) : Date.UTC(2025, 0, 6)) +
      dayIndex * DAY + 12 * 3_600_000,
    variant,
  } as SweepEmitRow;
}

/** One day of both splits for a baseline and a variant. */
function pair(day: number, baseR: number, variantR: number): SweepEmitRow[] {
  return [
    outcomeRow("baseline", day, baseR, "train"),
    outcomeRow("baseline", day, baseR),
    outcomeRow("tighter", day, variantR, "train"),
    outcomeRow("tighter", day, variantR),
  ];
}

const OPTIONS = {
  foldNames: { fit: "train", select: "test" },
  permutations: 400,
  seed: 11,
};

describe("the best of a losing set is not a pick", () => {
  // Both arms lose. The variant loses LESS on every single day, so it clears
  // every comparison the old gate made: fit delta positive, select delta
  // positive, the paired sign-flip null decisive, expectancy delta positive.
  const bothLose = () => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 40; day += 1) {
      const swing = day % 2 === 0 ? 0.1 : -0.1;
      rows.push(...pair(day, -0.8 + swing, -0.3 + swing));
    }
    return rows;
  };

  const verdict = () =>
    classVerdicts(readGridCube(bothLose()), OPTIONS).get("forex")!
      .get("tighter")!;

  it("clears every comparison the old rule made", () => {
    // THE PREMISE, asserted rather than assumed. If any of these ever stops
    // holding, this fixture has stopped demonstrating the defect and the
    // refusal below would be passing for the wrong reason.
    const v = verdict();
    assert.ok(v.fitTotalDelta > 0, `fit delta ${v.fitTotalDelta}`);
    assert.ok(v.selectTotalDelta > 0, `select delta ${v.selectTotalDelta}`);
    assert.ok(v.pairedP <= 0.05, `paired p ${v.pairedP}`);
    assert.ok(
      v.selectExpectancyDelta >= 0,
      `expectancy delta ${v.selectExpectancyDelta}`,
    );
    assert.equal(v.thin, false);
    assert.equal(v.noVerdict, false);
  });

  it("is REFUSED anyway, because it never earned anything", () => {
    const v = verdict();
    assert.ok(
      (v.selectExpectancy ?? 0) < 0,
      `the variant must actually lose money for this to be the defect's ` +
        `case: ${v.selectExpectancy}`,
    );
    assert.equal(
      v.accepted,
      false,
      "a variant that loses money on every fold was accepted because it lost " +
        "less than its baseline — this is D4 exactly",
    );
  });

  it("says WHY, in words a reader can act on", () => {
    // A refusal at -0.4R over 40 decisions and one at +0.3R over 6 are
    // opposite findings, and before D4 both printed "fails".
    const v = verdict();
    assert.match(v.reason, /^LOSES MONEY/);
    assert.match(v.reason, /beat the baseline on every delta/);
    assert.match(v.reason, /not positive beyond its error/);
    assert.notEqual(v.reason, "fails");
  });

  it("carries the measurement, not only the boolean", () => {
    const v = verdict();
    assert.ok(v.selectExpectancy !== null && v.selectExpectancySe !== null);
    assert.ok(v.selectExpectancyLower !== null);
    assert.ok(
      v.selectExpectancyLower! < v.selectExpectancy!,
      "the lower bound must sit inside the point estimate",
    );
  });
});

describe("a profitable variant still passes", () => {
  it("accepts when the money is there beyond its own error", () => {
    // The other direction, or the term above is just a way of refusing
    // everything. Same shape, both arms profitable, the variant more so.
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 40; day += 1) {
      const swing = day % 2 === 0 ? 0.1 : -0.1;
      rows.push(...pair(day, 0.1 + swing, 0.6 + swing));
    }
    const v = classVerdicts(readGridCube(rows), OPTIONS).get("forex")!
      .get("tighter")!;
    assert.ok((v.selectExpectancyLower ?? -1) > 0, `lower ${v.selectExpectancyLower}`);
    assert.equal(v.accepted, true, v.reason);
    assert.match(v.reason, /accept/);
  });
});

describe("an edge that is one lucky day is not an edge", () => {
  it("refuses a variant whose whole profit is a single outlier", () => {
    // Found by D4 against this repo's own fixture: a variant beating the
    // baseline on all six days with +5.0 of its +7.2 total on ONE of them has
    // a mean of +1.2R and a 95% lower bound of -0.86R. The old gate accepted
    // it — the paired sign-flip null only sees that six deltas are positive.
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 6; day += 1) {
      rows.push(...pair(day, 0.2, 0.2 + (day === 0 ? 5.0 : 0.2)));
    }
    const v = classVerdicts(readGridCube(rows), OPTIONS).get("forex")!
      .get("tighter")!;
    assert.ok(
      (v.selectExpectancy ?? 0) > 1,
      `mean should look excellent: ${v.selectExpectancy}`,
    );
    assert.ok(
      (v.selectExpectancyLower ?? 0) < 0,
      `but its lower bound should not: ${v.selectExpectancyLower}`,
    );
    assert.equal(v.accepted, false);
  });
});

describe("the multiplier is Student's t, and that is the whole floor", () => {
  it("is far wider than 1.96 where a normal multiplier lies", () => {
    // The learning layer met this at three resolutions and answered it with a
    // 30-row floor. Here the multiplier answers it directly, so no arbitrary
    // population constant is needed: two observations carry 12.706.
    assert.equal(tMultiplier95(1), 12.706);
    assert.equal(tMultiplier95(2), 4.303);
    assert.equal(tMultiplier95(29), 2.045);
  });

  it("approaches the normal multiplier and never goes below it", () => {
    assert.equal(tMultiplier95(10_000), 1.96);
    let previous = Number.POSITIVE_INFINITY;
    for (let df = 1; df <= 400; df += 1) {
      const t = tMultiplier95(df);
      assert.ok(t >= 1.96, `df ${df} gave ${t}, below the normal multiplier`);
      assert.ok(t <= previous, `df ${df} widened to ${t} from ${previous}`);
      previous = t;
    }
  });

  it("charges the WIDER interval between anchors, never interpolates down", () => {
    // df 50 sits between the 40 and 60 anchors; taking 60's narrower 2.000
    // would credit evidence the sample does not have. The first draft did
    // exactly that, and this line is why it did not ship.
    assert.equal(tMultiplier95(50), 2.021);
    assert.equal(tMultiplier95(59), 2.021);
    assert.equal(tMultiplier95(60), 2.000);
    assert.equal(tMultiplier95(0), Number.POSITIVE_INFINITY);
  });

  it("has no bound below two filled outcomes, where no dispersion exists", () => {
    const one = { ...emptyStats(), filled: 1, rSum: 1, rSumSq: 1 };
    assert.equal(rExpectancyLower95(one), null);
    const none = emptyStats();
    assert.equal(rExpectancyLower95(none), null);
  });

  it("computes the bound the gate decides on", () => {
    // Stated arithmetic, not a fixture that agrees with itself: four
    // outcomes of +1, +1, +1, -1 have a mean of 0.5, a sample sd of 1, a
    // standard error of 0.5, and t(3) = 3.182 — so the bound is well below
    // zero and a "75% win rate" earns nothing.
    const stats = { ...emptyStats(), filled: 4, rSum: 2, rSumSq: 4 };
    const lower = rExpectancyLower95(stats)!;
    assert.equal(Number(lower.toFixed(3)), Number((0.5 - 3.182 * 0.5).toFixed(3)));
    assert.ok(lower < 0);
  });
});
