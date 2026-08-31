import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  accumulateLearningStats,
  calculateLearningWeight,
  LEARNED_OUTCOMES,
  type LearningResolution,
} from "../supabase/functions/trade-analyzer/learning.ts";
import { ANALYZER_VERSION } from "../supabase/functions/trade-analyzer/calibration.ts";

/**
 * D1: global learning reads the money, and reads ALL of it.
 *
 * Two changes, either of which alone would scope the cohort. The QUANTITY
 * moved from a win rate to mean realized R, and the POPULATION widened by four
 * outcomes — `expired_in_profit` and `expired_at_loss` are filled trades that
 * banked or lost real money and were excluded outright, because under a win
 * rate they were neither a win nor a loss and there was nowhere to put them.
 *
 * The fold is tested by RUNNING it. `accumulateLearningStats` was split out of
 * the refresh for exactly that reason: the defect it replaces survived three
 * weeks of assertions that matched source and proved nothing.
 */

function fold(resolutions: LearningResolution[]) {
  return accumulateLearningStats(resolutions);
}

function res(
  outcome: string,
  netRealizedR: unknown,
  setupKey = "eurusd-trend",
): LearningResolution {
  return { netRealizedR, outcome, setupKey };
}

describe("an expiry is money, and used to be thrown away", () => {
  it("counts a profitable expiry into the mean", () => {
    const stats = fold([
      res("expired_in_profit", 0.4),
      res("expired_at_loss", -0.6),
    ]).get("eurusd-trend")!;
    assert.equal(stats.realizedRCount, 2);
    assert.equal(Number(stats.realizedRSum.toFixed(10)), -0.2);
    assert.equal(stats.total, 2);
  });

  it("leaves an expiry out of BOTH the win and the loss count", () => {
    // The taxonomy is unchanged and still means what it meant — an expiry is
    // not a target hit and not a stop hit. Amendment 39 permits the rate to
    // sit beside the money; it just stopped deciding anything.
    const stats = fold([
      res("expired_in_profit", 0.4),
      res("expired_at_loss", -0.6),
      res("take_profit", 1.0),
      res("stop_loss", -1.0),
      res("ambiguous", -1.0),
    ]).get("eurusd-trend")!;
    assert.equal(stats.wins, 1);
    assert.equal(stats.losses, 1);
    assert.equal(stats.ambiguous, 1);
    assert.equal(stats.total, 5);
    // ...but every one of the five contributed its money.
    assert.equal(stats.realizedRCount, 5);
  });

  it("names exactly the filled outcomes, and no unfilled one", () => {
    // Derived from the set the engine actually branches on, so a new outcome
    // has to be classified here rather than silently ignored.
    assert.equal(LEARNED_OUTCOMES.has("unfilled"), false);
    assert.equal(LEARNED_OUTCOMES.has("pending"), false);
    assert.equal(LEARNED_OUTCOMES.size, 6);
    const dropped = fold([res("unfilled", 0), res("pending", 0)]);
    assert.equal(dropped.size, 0, "a position never taken reached the cohort");
  });
});

describe("a missing measurement is not a break-even one", () => {
  const ABSENT: Array<[string, unknown]> = [
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["non-numeric text", "abc"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ];

  for (const [label, value] of ABSENT) {
    it(`counts a ${label} realized R in total but not in the mean`, () => {
      // `Number(null)` and `Number("")` are both 0, so a bare isFinite check
      // would fold two absences in as genuine break-evens and drag every
      // cohort toward the neutral point it is being measured against.
      const stats = fold([res("take_profit", value)]).get("eurusd-trend")!;
      assert.equal(stats.total, 1, "the resolution stopped being counted at all");
      assert.equal(stats.wins, 1);
      assert.equal(
        stats.realizedRCount,
        0,
        `${label} was accepted as a realized R of ${Number(value)}`,
      );
    });
  }

  it("keeps a genuine zero, which is a real result", () => {
    const stats = fold([res("expired_at_loss", 0)]).get("eurusd-trend")!;
    assert.equal(stats.realizedRCount, 1);
    assert.equal(stats.realizedRSum, 0);
  });

  it("accepts a numeric string, which is how a JSON number can arrive", () => {
    const stats = fold([res("take_profit", "0.5")]).get("eurusd-trend")!;
    assert.equal(stats.realizedRCount, 1);
    assert.equal(stats.realizedRSum, 0.5);
  });
});

describe("cohorts stay separate", () => {
  it("folds by setup key and never pools two", () => {
    const grouped = fold([
      res("take_profit", 1, "a"),
      res("stop_loss", -1, "b"),
      res("take_profit", 1, "a"),
    ]);
    assert.equal(grouped.get("a")!.realizedRSum, 2);
    assert.equal(grouped.get("b")!.realizedRSum, -1);
    assert.equal(grouped.size, 2);
  });
});

describe("the refresh reads what the fold expects", () => {
  const SRC = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  it("asks the database for the widened outcome set", () => {
    // The fold cannot see a row the query never returned, so the widening has
    // to hold at BOTH ends. This is the half no unit test can reach.
    for (const outcome of LEARNED_OUTCOMES) {
      assert.ok(
        SRC.includes(`,${outcome},`) || SRC.includes(`(${outcome},`) ||
          SRC.includes(`,${outcome})`),
        `the trade_outcomes query does not request ${outcome}, so the fold ` +
          `will never see one`,
      );
    }
  });

  it("asks for feedback, which is where the money lives", () => {
    assert.match(SRC, /select=setup_id,outcome,feedback/);
  });

  it("says so when the page was full, rather than silently truncating", () => {
    // A mean over the most recent 2,500 resolutions is a different measurement
    // from one over all of them, and the widened filter admits more rows into
    // the same cap.
    assert.match(SRC, /if \(outcomes\.length === OUTCOME_LIMIT\)/);
    assert.match(SRC, /not all of them/);
  });

  it("distinguishes a scored zero from a withheld one in the log", () => {
    // Until D1 every adjustment was 0 by design and the log named the
    // withholding. A 0 now means the cohort's mean does not clear its own
    // error bar, which for a marginal cohort may be permanent and correct.
    assert.match(SRC, /scored on mean realized R/);
    assert.match(SRC, /not distinguishable from zero/);
  });

  it("writes the audit trail, not just the score", () => {
    for (const column of [
      "conservative_mean_r",
      "mean_realized_r",
      "realized_r_count",
    ]) {
      assert.ok(
        SRC.includes(`${column}:`),
        `${column} is not written, so the adjustment cannot be audited`,
      );
    }
  });

  it("scoped the cohort — the version moved with the measure", () => {
    // ANALYZER_VERSION is what separates weights fitted by one model from
    // another's. Changing both the quantity learned from and the population it
    // is learned over, without moving it, would apply the new curve to rows
    // the old one produced.
    // SHAPE, not the literal. `calibrationState.test.ts` owns the exact
    // string and derives the tests/ directory to prove nothing else pins it —
    // a constant with two independent pins has two chances to be forgotten
    // and nothing that notices the second. Asserting the value here would
    // have been the third pin, and that guard failed this file for it.
    assert.match(ANALYZER_VERSION, /^\d{4}\.\d{2}\.\d{2}\.[a-z0-9-]+$/);
    const migration = readFileSync(
      "supabase/migrations/20260831190000_learning_on_realized_r.sql",
      "utf8",
    );
    assert.match(migration, /add column if not exists mean_realized_r/);
    assert.match(migration, /add column if not exists conservative_mean_r/);
  });
});

describe("end to end, the fold feeds the weight", () => {
  it("turns a run of resolutions into a score with no hand-built moments", () => {
    // The two halves joined: rows in, adjustment out. Nothing here states a
    // sum or a sum of squares, so the fold and the weight have to agree.
    const ladder = (wins: number, stops: number) => [
      ...Array.from(
        { length: wins },
        (_, i) =>
          res(
            i % 2 === 0 ? "take_profit" : "tp1_partial",
            i % 2 === 0 ? 1.0 : 0.3,
          ),
      ),
      ...Array.from({ length: stops }, () => res("stop_loss", -1)),
    ];
    const stats = fold(ladder(300, 120)).get("eurusd-trend")!;
    const weight = calculateLearningWeight(stats);
    assert.equal(stats.realizedRCount, 420);
    assert.ok(
      (weight.meanRealizedR ?? 0) > 0,
      `mean should be positive: ${weight.meanRealizedR}`,
    );
    assert.ok(
      weight.confidenceAdjustment > 0,
      `a 560-resolution cohort at ${weight.meanRealizedR}R scored ` +
        `${weight.confidenceAdjustment}`,
    );
    assert.ok(
      (weight.conservativeMeanR ?? 0) < (weight.meanRealizedR ?? 0),
      "the conservative bound must sit inside the point estimate",
    );

    // AND THE SAME LADDER, LOSING. 300 wins against 260 stops is a 53.6% win
    // rate and a mean of -0.116R: the account shrinks while more than half the
    // trades are winners. This fixture was written as the POSITIVE case and
    // had to be corrected, which is the clearest evidence available that the
    // intuition the retired curve encoded is the easy one to have.
    const losing = calculateLearningWeight(
      fold(ladder(300, 260)).get("eurusd-trend")!,
    );
    assert.equal(losing.winRate, 0.536);
    assert.ok(
      (losing.meanRealizedR ?? 0) < 0,
      `a 53.6% win rate on this ladder must lose money: ${losing.meanRealizedR}`,
    );
    assert.ok(
      losing.confidenceAdjustment < 0,
      `the losing cohort scored ${losing.confidenceAdjustment}; the retired ` +
        `curve would have paid it +${((0.536 - 0.5) * 20).toFixed(2)}`,
    );
  });
});
