import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type AssetType,
  getClassCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  calculateLearningWeight,
  WITHHELD_REASON,
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

  it("withholds the adjustment instead of emitting a mis-centred one", () => {
    // §19e, and the same call this repo made for the replay record: a refusal
    // beats a wrong number. Every win rate, including the extremes, must come
    // back as no adjustment at all rather than a number centred on 0.5.
    for (const wins of [0, 5, 14, 20]) {
      const weight = calculateLearningWeight({
        ambiguous: 0,
        losses: 20 - wins,
        total: 20,
        wins,
      });
      assert.equal(
        weight.confidenceAdjustment,
        0,
        `winRate ${weight.winRate} still produced an adjustment`,
      );
      assert.equal(weight.withheld, WITHHELD_REASON);
    }
  });

  it("keeps measuring what it refuses to score", () => {
    // Withholding the ADJUSTMENT must not stop recording the win rate and
    // sample weight: those are the inputs a corrected neutral point will need,
    // and dropping them would turn a suspension into data loss.
    const weight = calculateLearningWeight({
      ambiguous: 2,
      losses: 6,
      total: 20,
      wins: 12,
    });
    assert.equal(weight.winRate, 0.6);
    assert.ok(weight.sampleWeight > 0, "sample weight stopped being computed");
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
