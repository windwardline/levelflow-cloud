import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classVerdicts, readGridCube } from "../scripts/grid-totalr.ts";
import {
  emptyStats,
  rDeltaInterval95,
  rExpectancyInterval95,
  type SweepEmitRow,
} from "../scripts/sweepStats.ts";

/**
 * M3: the confirm read decided on a bare `confirmTotalDelta > 0`.
 *
 * No sample floor, no error bar, no p — on a SUM, which is the wrong unit for
 * that question twice over. A total grows with the number of trades, so a thin
 * fold and a deep one are not comparable; and a sum carries no dispersion, so
 * +0.3R over four outcomes and over four thousand printed identically.
 *
 * The 2026-08-11 completeness pass recorded that `confirmedPositive` was "a
 * bucket of positive DELTAS wearing an absolute name" and killed it as
 * cosmetic. It stops being cosmetic when the quantity changes, which is why
 * the artifact keys change with it.
 *
 * The p is delivered as an INTERVAL rather than a separate statistic: a 95%
 * confidence interval excluding zero is exactly p < 0.05 for that expectancy.
 * A permutation p over confirm-fold days would be a second, heavier instrument
 * answering the same question, and LA-6 rations reads of this fold.
 */

const DAY = 86_400_000;
const SPLIT_EPOCH: Record<string, number> = {
  train: Date.UTC(2024, 0, 8),
  test: Date.UTC(2025, 0, 6),
  confirm: Date.UTC(2026, 0, 5),
};

function row(
  variant: string,
  day: number,
  realizedR: number,
  split: string,
): SweepEmitRow {
  return {
    accepted: true,
    outcome: realizedR > 0 ? "take_profit" : "stop_loss",
    realizedR,
    split,
    symbol: "EURUSD",
    time: SPLIT_EPOCH[split] + day * DAY + 12 * 3_600_000,
    variant,
  } as SweepEmitRow;
}

const OPTIONS = {
  foldNames: { confirm: "confirm", fit: "train", select: "test" },
  permutations: 400,
  seed: 11,
};

/**
 * A variant that CLEARS the gate on fit and select, with a confirm fold whose
 * per-day R the caller chooses.
 *
 * The select fold is decisively profitable so the pick is genuinely accepted —
 * post-D4 that also means its own select expectancy is positive beyond error.
 * Everything under test then happens in the confirm fold alone.
 */
function corpus(confirmVariant: number[], confirmBase = confirmVariant.map(() => 0)) {
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < 40; day += 1) {
    const swing = day % 2 === 0 ? 0.1 : -0.1;
    for (const split of ["train", "test"]) {
      rows.push(row("baseline", day, 0.05 + swing, split));
      rows.push(row("tighter", day, 0.6 + swing, split));
    }
  }
  confirmVariant.forEach((r, index) => {
    rows.push(row("tighter", index, r, "confirm"));
    rows.push(row("baseline", index, confirmBase[index] ?? 0, "confirm"));
  });
  return rows;
}

function verdictFor(rows: SweepEmitRow[]) {
  return classVerdicts(readGridCube(rows), OPTIONS).get("forex")!
    .get("tighter")!;
}

describe("a positive total is not a confirmation", () => {
  // Six outcomes, mean +0.3R, and swings that dwarf it. The SUM is +1.8R and
  // positive, which is all the old read asked for.
  const NOISY = [2.2, -1.6, 2.2, -1.6, 2.2, -1.6];

  it("the total really is positive — the premise, not an assumption", () => {
    const v = verdictFor(corpus(NOISY));
    assert.ok(
      (v.confirmTotalDelta ?? 0) > 0,
      `the old rule's whole test must pass here, or this proves nothing: ` +
        `${v.confirmTotalDelta}`,
    );
    assert.equal(v.accepted, true, v.reason);
  });

  it("but the interval spans zero, so it confirms nothing", () => {
    const v = verdictFor(corpus(NOISY));
    assert.ok((v.confirmExpectancy ?? 0) > 0, `mean ${v.confirmExpectancy}`);
    assert.ok(
      (v.confirmExpectancyLower ?? 0) < 0,
      `lower bound ${v.confirmExpectancyLower} should not clear zero`,
    );
    assert.ok(
      (v.confirmExpectancyUpper ?? 0) > 0,
      `upper bound ${v.confirmExpectancyUpper} should not fall below zero`,
    );
  });

  it("carries BOTH ends, because a refutation earns the same bar", () => {
    // Amendment 36's symmetry. With only a lower bound a reader cannot tell a
    // measured loss from a result too noisy to call, and the old binary
    // reported both as "negative".
    const v = verdictFor(corpus(NOISY));
    assert.ok(v.confirmExpectancyLower !== null);
    assert.ok(v.confirmExpectancyUpper !== null);
    assert.ok(v.confirmExpectancyLower! < v.confirmExpectancy!);
    assert.ok(v.confirmExpectancyUpper! > v.confirmExpectancy!);
  });
});

describe("the three outcomes the binary could not express", () => {
  it("confirms a fold that is profitable beyond its error", () => {
    const v = verdictFor(corpus(Array.from({ length: 40 }, (_, i) =>
      0.5 + (i % 2 === 0 ? 0.1 : -0.1))));
    assert.ok((v.confirmExpectancyLower ?? -1) > 0);
  });

  it("contradicts a fold that LOSES beyond its error", () => {
    const v = verdictFor(corpus(Array.from({ length: 40 }, (_, i) =>
      -0.5 + (i % 2 === 0 ? 0.1 : -0.1))));
    assert.ok(
      (v.confirmExpectancyUpper ?? 1) < 0,
      `upper ${v.confirmExpectancyUpper} — a measured loss must be nameable ` +
        `as one, not merged with "too noisy to say"`,
    );
  });

  it("leaves a fold with no dispersion unmeasurable rather than certain", () => {
    // One confirm outcome. A single +5R has a mean of +5R and no error bar at
    // all, and calling that a confirmation is the retired rule's mistake in a
    // new unit.
    const v = verdictFor(corpus([5]));
    assert.equal(v.confirmExpectancyLower, null);
    assert.equal(v.confirmExpectancyUpper, null);
  });
});

describe("the comparison sits beside the money, never instead of it", () => {
  it("reports the delta and its error without deciding on them", () => {
    const v = verdictFor(corpus(
      Array.from({ length: 40 }, (_, i) => 0.5 + (i % 2 === 0 ? 0.1 : -0.1)),
      Array.from({ length: 40 }, (_, i) => 0.2 + (i % 2 === 0 ? 0.1 : -0.1)),
    ));
    assert.ok(v.confirmExpectancyDelta !== null);
    assert.ok(v.confirmExpectancyDeltaLower !== null);
    assert.ok(
      v.confirmExpectancyDeltaLower! < v.confirmExpectancyDelta!,
      "the delta's interval must be wider than the delta",
    );
  });
});

describe("LA-6: the held-back fold is read only for a pick the gate accepted", () => {
  it("gives a REFUSED variant no confirm figure at all", () => {
    // The burned-log discipline, and the one thing this change could have
    // broken: the variant's own expectancy needs only its own outcomes, so
    // computing it unconditionally would read held-back data for variants
    // nobody picked.
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < 40; day += 1) {
      // Both arms lose, so D4 refuses the variant however the deltas look.
      const swing = day % 2 === 0 ? 0.1 : -0.1;
      for (const split of ["train", "test"]) {
        rows.push(row("baseline", day, -0.8 + swing, split));
        rows.push(row("tighter", day, -0.3 + swing, split));
      }
      rows.push(row("tighter", day, 0.9, "confirm"));
      rows.push(row("baseline", day, 0.1, "confirm"));
    }
    const v = verdictFor(rows);
    assert.equal(v.accepted, false, "fixture must be refused for this to test anything");
    assert.equal(v.confirmExpectancy, null);
    assert.equal(v.confirmExpectancyLower, null);
    assert.equal(v.confirmExpectancyUpper, null);
    assert.equal(v.confirmTotalDelta, null);
  });
});

describe("the interval helpers", () => {
  it("gives both ends, symmetric about the mean", () => {
    // +1,+1,+1,-1: mean 0.5, sample sd 1, standard error 0.5, t(3) = 3.182.
    const stats = { ...emptyStats(), filled: 4, rSum: 2, rSumSq: 4 };
    const interval = rExpectancyInterval95(stats)!;
    assert.equal(Number(interval.lower.toFixed(3)), Number((0.5 - 1.591).toFixed(3)));
    assert.equal(Number(interval.upper.toFixed(3)), Number((0.5 + 1.591).toFixed(3)));
  });

  it("has no interval below two filled outcomes", () => {
    assert.equal(rExpectancyInterval95({ ...emptyStats(), filled: 1, rSum: 1, rSumSq: 1 }), null);
    assert.equal(rExpectancyInterval95(emptyStats()), null);
  });

  it("combines two independent errors in quadrature", () => {
    // Both sides +1,+1,+1,-1: each se 0.5, so the delta's se is
    // sqrt(0.25 + 0.25) = 0.7071, and df is the smaller sample's 3 -> 3.182.
    const side = { ...emptyStats(), filled: 4, rSum: 2, rSumSq: 4 };
    const result = rDeltaInterval95(side, side)!;
    assert.equal(result.delta, 0);
    assert.equal(
      Number(result.lower.toFixed(3)),
      Number((-3.182 * Math.sqrt(0.5)).toFixed(3)),
    );
  });

  it("takes the THINNER side's degrees of freedom", () => {
    // A comparison is only as well-resolved as its thinner side; Welch's exact
    // figure is larger and would narrow the interval.
    const thin = { ...emptyStats(), filled: 3, rSum: 0, rSumSq: 2 };
    const deep = { ...emptyStats(), filled: 500, rSum: 0, rSumSq: 250 };
    const result = rDeltaInterval95(thin, deep)!;
    const wide = rDeltaInterval95(thin, thin)!;
    // df 2 either way -> t 4.303. If it took the deeper side's df the
    // multiplier would collapse toward 1.96 and this margin would shrink.
    assert.ok(
      Math.abs(result.lower) > Math.abs(result.delta) + 1,
      `margin ${result.lower} is too narrow for a 3-outcome side`,
    );
    assert.ok(Math.abs(wide.lower) > 0);
  });

  it("refuses a delta whose either side cannot state an error", () => {
    const one = { ...emptyStats(), filled: 1, rSum: 1, rSumSq: 1 };
    const many = { ...emptyStats(), filled: 40, rSum: 4, rSumSq: 10 };
    assert.equal(rDeltaInterval95(one, many), null);
    assert.equal(rDeltaInterval95(many, one), null);
  });
});
