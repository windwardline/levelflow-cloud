import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AssetType,
  getClassCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  ADJUSTMENT_CAP,
  ADJUSTMENT_PER_R,
  calculateLearningWeight,
  CONFIDENCE_Z,
  MIN_RESOLUTIONS_FOR_ADJUSTMENT,
} from "../supabase/functions/trade-analyzer/learning.ts";

/**
 * Global learning scored a market against a neutral point of 0.5.
 *
 * BREAK-EVEN IS NOT A CONSTANT HERE, which is the whole finding. It is
 * `1 / (1 + avgWinR)`, and avgWinR depends on which of the two winning outcomes
 * a cohort actually produces:
 *
 *   tp1_partial  ~ +0.20R  (banks the partial, runner then exits at entry)
 *   take_profit  ~ +1.00R  (banks the partial AND reaches a target at least
 *                           minimumTargetRewardRisk away)
 *   stop_loss      -1.00R
 *
 * So the neutral point runs from 0.500 for a cohort that always reaches the
 * runner target to 0.833 for one that never does.
 *
 * A CORRECTION TO THIS FILE'S FIRST VERSION, which asserted 0.71-0.83 as the
 * whole range and that a 70% win rate always loses money. That is true only of
 * a partial-heavy cohort; at a 65% partial share break-even is about 0.676 and
 * 70% is marginally profitable. The first version generalised the all-partial
 * bound into a universal claim — the same over-reach it was written to catch.
 *
 * The defect is not that 0.5 is the wrong constant. It is that ANY constant is
 * wrong. 0.5 happens to be right at one extreme of the range, and the observed
 * fill mix sits nowhere near that extreme.
 *
 * Both ENDS are derived from shipped calibration, never transcribed. A test
 * restating "0.833" would agree with itself forever while the geometry moved
 * underneath it.
 */

const CLASSES: AssetType[] = [
  "agriculture",
  "livestock",
  "crypto",
  "energies",
  "forex",
  "futures",
  "indices",
  "metals",
];

/** The position fraction banked at TP1, hardcoded in replay.ts realizedRFromLegs. */
const BANKED_FRACTION = 0.5;

/**
 * What a tp1_partial banks. TP1 sits at `min(max(riskDistance * tp1RiskShare,
 * atr * tp1AtrMultiplier), windowCap)` (pricePlan.ts); the window cap can only
 * pull it closer, so the larger of the two lower candidates is the most
 * favourable ratio a market can have.
 */
function partialR(assetType: AssetType): number {
  const cal = getClassCalibration(assetType);
  const ratio = Math.max(
    cal.tp1RiskShare,
    // maxStopAtrMultiplier, NOT stopAtrMultiplier.
    //
    // A CORRECTION. The first version divided by stopAtrMultiplier, which is a
    // BUFFER INPUT — pricePlan computes `stopBuffer = max(atr * stopAtrMultiplier,
    // dailyAtr * dailyStopAtrMultiplier)` around a pivot and then CAPS the result
    // at `atr * maxStopAtrMultiplier`. Risk distance therefore cannot exceed the
    // cap, so dividing by the larger buffer constant was not merely a different
    // choice, it was not a valid bound at all: it understated the ratio and so
    // OVERSTATED break-even, on five of the eight classes.
    cal.tp1AtrMultiplier / cal.maxStopAtrMultiplier,
  );
  return BANKED_FRACTION * ratio;
}

/**
 * What a take_profit banks: the partial, plus the runner half carried to a
 * target at least `minimumTargetRewardRisk` away (pricePlan.ts computes
 * `minimumRunnerDistance = riskDistance * minimumTargetRewardRisk`).
 */
function fullWinR(assetType: AssetType): number {
  const cal = getClassCalibration(assetType);
  return partialR(assetType) + BANKED_FRACTION * cal.minimumTargetRewardRisk;
}

/**
 * `partialShare` of 1 is an all-partial cohort; 0 is an all-runner cohort.
 *
 * Recomputed with the binding constant, the per-class figures moved even though
 * the RANGE did not: all-partial break-even is 0.800 for agriculture,
 * livestock, crypto, forex and futures (was 0.828-0.833), and unchanged at
 * 0.714 for energies and 0.833 for indices and metals. The published range
 * survives because its two extremes come from classes the correction does not
 * touch — which is exactly why a range can look right while the derivation
 * under it is wrong.
 */
function breakEven(assetType: AssetType, partialShare: number): number {
  const avgWin = partialShare * partialR(assetType) +
    (1 - partialShare) * fullWinR(assetType);
  return 1 / (1 + avgWin);
}

/**
 * `n` resolutions of a cohort with the given win and partial shares, valued in
 * R from SHIPPED CALIBRATION.
 *
 * Deliberately not a list of plausible numbers. The claim under test is that a
 * mostly-winning cohort can lose money on THIS ladder, so the fixture has to
 * be the ladder — if the geometry ever changes enough to make that false, the
 * test must fail rather than keep asserting a shape the engine abandoned.
 */
function mixedCohort(
  assetType: AssetType,
  n: number,
  winShare: number,
  partialShare: number,
): number[] {
  const winners = Math.round(n * winShare);
  const partials = Math.round(winners * partialShare);
  return [
    ...Array.from({ length: partials }, () => partialR(assetType)),
    ...Array.from({ length: winners - partials }, () => fullWinR(assetType)),
    ...Array.from({ length: n - winners }, () => -1),
  ];
}

describe("the learning layer's neutral point", () => {
  it("moves with the outcome mix, so no single constant can be right", () => {
    // THE CORRECTED CLAIM. The old curve did not pick a bad constant; it picked
    // a constant at all. This asserts the SPREAD between the two extremes is
    // real and wide, which is what makes a fixed pivot indefensible.
    let checked = 0;
    const table: string[] = [];
    for (const assetType of CLASSES) {
      const allPartials = breakEven(assetType, 1);
      const allRunners = breakEven(assetType, 0);
      table.push(
        `${assetType}=${allRunners.toFixed(3)}..${allPartials.toFixed(3)}`,
      );
      assert.ok(
        allPartials > allRunners,
        `${assetType}: a partial-heavy cohort must break even HIGHER than a ` +
          `runner-heavy one, or the two outcomes are not being told apart`,
      );
      assert.ok(
        allPartials - allRunners > 0.15,
        `${assetType}: the two extremes are only ` +
          `${(allPartials - allRunners).toFixed(3)} apart. If they ever ` +
          `converged, a fixed pivot would be defensible and this file's ` +
          `premise would be gone.`,
      );
      checked++;
    }
    // NON-VACUITY: an empty class list passes a loop that never runs.
    assert.equal(checked, CLASSES.length);
    assert.ok(checked >= 8, `only ${checked} classes checked: ${table.join(" ")}`);
  });

  it("puts 0.5 at one end of the range, not the middle", () => {
    // 0.5 was not arbitrary — it is exactly right for a cohort that always
    // reaches the runner target. It is wrong everywhere else, and the live fill
    // mix is nowhere near that end.
    for (const assetType of CLASSES) {
      const allRunners = breakEven(assetType, 0);
      assert.ok(
        Math.abs(allRunners - 0.5) < 0.06,
        `${assetType}: an all-runner cohort breaks even at ` +
          `${allRunners.toFixed(3)}, so the retired pivot of 0.5 was not even ` +
          `right at the extreme it seemed to describe`,
      );
    }
  });

  it("scores a MOSTLY-WINNING cohort negative when it lost money", () => {
    // AMENDMENT 39'S HEADLINE, as a test. The law says a market can win four
    // in five and shrink the account; the ladder is what makes that possible.
    // Every resolution here is derived from shipped calibration, so the
    // fixture cannot drift away from the geometry it claims to describe.
    for (const assetType of ["forex", "indices", "metals"] as AssetType[]) {
      const resolutions = mixedCohort(assetType, 120, 0.65, 0.65);
      const wins = resolutions.filter((r) => r > 0).length;
      const weight = calculateLearningWeight({
        ambiguous: 0,
        losses: resolutions.length - wins,
        realizedRCount: resolutions.length,
        realizedRSum: resolutions.reduce((sum, r) => sum + r, 0),
        realizedRSumSq: resolutions.reduce((sum, r) => sum + r * r, 0),
        total: resolutions.length,
        wins,
      });
      assert.ok(
        weight.winRate >= 0.6,
        `${assetType}: fixture must actually be a mostly-winning cohort, ` +
          `else this proves nothing (got ${weight.winRate})`,
      );
      assert.ok(
        (weight.meanRealizedR ?? 0) < 0,
        `${assetType}: wins ${weight.winRate} of the time and its mean R is ` +
          `${weight.meanRealizedR} — if that ever goes positive the ladder ` +
          `changed and this test's premise with it`,
      );
      assert.ok(
        weight.confidenceAdjustment <= 0,
        `${assetType}: a money-losing cohort was REWARDED ${weight.confidenceAdjustment}`,
      );
      // And what the retired curve would have paid it.
      const retired = (weight.winRate - 0.5) * 20;
      assert.ok(
        retired > 0,
        `${assetType}: the retired curve is supposed to reward this market — ` +
          `if it no longer does, the comparison below is empty`,
      );
    }
  });

  it("is centred on zero, so break-even earns nothing in either direction", () => {
    // The whole reason the win rate had to go: its neutral point moved with
    // the outcome mix. In R there is nothing to derive — break-even IS zero.
    const flat = Array.from(
      { length: 200 },
      (_, index) => (index % 2 === 0 ? 0.8 : -0.8),
    );
    const weight = calculateLearningWeight({
      ambiguous: 0,
      losses: 100,
      realizedRCount: flat.length,
      realizedRSum: flat.reduce((sum, r) => sum + r, 0),
      realizedRSumSq: flat.reduce((sum, r) => sum + r * r, 0),
      total: flat.length,
      wins: 100,
    });
    assert.equal(weight.meanRealizedR, 0);
    assert.equal(weight.confidenceAdjustment, 0);
  });

  it("refuses a mean it cannot distinguish from zero, in both directions", () => {
    // Amendment 36's symmetry. A reward answers to the same evidentiary bar
    // as a penalty, or the model is optimistic by construction.
    for (const mean of [0.15, -0.15]) {
      const thin = Array.from(
        { length: MIN_RESOLUTIONS_FOR_ADJUSTMENT + 5 },
        (_, index) => mean + (index % 2 === 0 ? 0.85 : -0.85),
      );
      const weight = calculateLearningWeight({
        ambiguous: 0,
        losses: 0,
        realizedRCount: thin.length,
        realizedRSum: thin.reduce((sum, r) => sum + r, 0),
        realizedRSumSq: thin.reduce((sum, r) => sum + r * r, 0),
        total: thin.length,
        wins: 0,
      });
      assert.ok(
        Math.abs(weight.meanRealizedR ?? 0) > 0.1,
        "fixture lost its point estimate, so the shrinkage is not being tested",
      );
      assert.equal(
        weight.confidenceAdjustment,
        0,
        `a mean of ${mean} on ${thin.length} resolutions with sd 0.85 is not ` +
          `distinguishable from zero, yet it scored ` +
          `${weight.confidenceAdjustment}`,
      );
    }
  });

  it("needs a real sample before a normal multiplier is honest", () => {
    // THE DEFECT THIS FLOOR EXISTS FOR. Three resolutions of +0.9/+0.1/+0.9
    // have a mean of 0.633 and a standard error of 0.267, so 1.96 leaves a
    // conservative mean of 0.111 and scores +2.2 off three trades. The correct
    // multiplier at two degrees of freedom is t = 4.303, which puts the bound
    // below zero.
    const three = [0.9, 0.1, 0.9];
    const weight = calculateLearningWeight({
      ambiguous: 0,
      losses: 0,
      realizedRCount: three.length,
      realizedRSum: three.reduce((sum, r) => sum + r, 0),
      realizedRSumSq: three.reduce((sum, r) => sum + r * r, 0),
      total: 3,
      wins: 3,
    });
    assert.equal(weight.conservativeMeanR, null);
    assert.equal(weight.confidenceAdjustment, 0);
    // But the mean is still REPORTED. Refusing to score is not refusing to
    // measure, and a reader looking at why a cohort scores nothing needs it.
    assert.ok((weight.meanRealizedR ?? 0) > 0.6);
  });

  it("keeps the retired curve's authority rather than granting itself more", () => {
    // ANCHORED, not chosen. `(winRate - 0.5) * 20` paid about +3 to a 0.65 win
    // rate — its typical output, far from its ±10 bound. A genuinely positive
    // cohort must land in that same band, or this change quietly hands a model
    // that has just switched measures more influence than the one it replaced.
    const strong = Array.from(
      { length: 1000 },
      (_, index) => 0.2 + (index % 2 === 0 ? 0.8 : -0.8),
    );
    const weight = calculateLearningWeight({
      ambiguous: 0,
      losses: 500,
      realizedRCount: strong.length,
      realizedRSum: strong.reduce((sum, r) => sum + r, 0),
      realizedRSumSq: strong.reduce((sum, r) => sum + r * r, 0),
      total: strong.length,
      wins: 500,
    });
    assert.ok(
      weight.confidenceAdjustment > 1 && weight.confidenceAdjustment < 5,
      `a +0.2R cohort over 1,000 resolutions scored ` +
        `${weight.confidenceAdjustment}; the retired curve paid ~3 at its ` +
        `typical operating point and this must not exceed that band`,
    );
    assert.ok(
      weight.confidenceAdjustment < ADJUSTMENT_CAP,
      "the cap is a safety rail, not an operating point — if a realistic " +
        "cohort reaches it, ADJUSTMENT_PER_R is too large",
    );
  });

  it("states the constants it is derived from, so a change is visible", () => {
    assert.equal(CONFIDENCE_Z, 1.96);
    assert.equal(ADJUSTMENT_PER_R, 20);
    assert.equal(ADJUSTMENT_CAP, 10);
    assert.equal(MIN_RESOLUTIONS_FOR_ADJUSTMENT, 30);
  });

  it("names the band the old curve got backwards", () => {
    // Documents the defect with the arithmetic that made it one, so a future
    // reader restoring the curve has to confront the number rather than the
    // intention. Stated at the PARTIAL-HEAVY end, and said so: the first
    // version of this test asserted the same thing without the qualifier and
    // was wrong for runner-heavy cohorts.
    const breakEvenAllPartials = breakEven("forex", 1);
    const winRateThatLosesMoney = 0.7;
    assert.ok(
      winRateThatLosesMoney < breakEvenAllPartials,
      `0.7 should sit below forex's all-partial break-even ` +
        `${breakEvenAllPartials.toFixed(3)}`,
    );
    // What the retired expression would have said about that losing market.
    const retired = Math.max(-10, Math.min(10, (winRateThatLosesMoney - 0.5) * 20));
    assert.ok(
      retired > 0,
      "the retired curve is supposed to reward a below-break-even market — " +
        "if it no longer does, this file's premise changed",
    );
    // Rounded: (0.7 - 0.5) is 0.19999999999999996 in binary floating point, so
    // the product is 3.9999999999999996 and an exact compare fails on the
    // arithmetic rather than on the claim.
    assert.equal(
      Number(retired.toFixed(3)),
      4,
      "the inverted band paid +4.0 confidence at a 0.7 win rate",
    );
  });
});
