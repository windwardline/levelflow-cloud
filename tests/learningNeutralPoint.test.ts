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
 * A win rate of 0.5 is break-even only when a win and a loss are the same size.
 * This ladder's are not. It banks half the position at TP1 and runs the rest
 * with the stop moved to entry, so a `tp1_partial` realises
 * `0.5 * (tp1Distance / riskDistance)` R while a `stop_loss` is a full -1R.
 *
 * The consequence is a WRONG SIGN rather than a small miscalibration: a market
 * winning 70% of its setups is losing money and was receiving +4.0 confidence,
 * pushed UP on the strength of losing. The inverted band is everything between
 * 0.5 and the real break-even, and a TP1-heavy ladder lives inside it by
 * construction.
 *
 * The break-even here is DERIVED from each class's own shipped geometry, never
 * transcribed. A test that restated "0.833" would agree with itself forever
 * while the calibration moved underneath it — the shadow-test failure this repo
 * has spent the week removing.
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
 * TP1 sits at `min(max(riskDistance * tp1RiskShare, atr * tp1AtrMultiplier),
 * windowCap)` (pricePlan.ts). The window cap can only pull it CLOSER, which
 * raises break-even, so taking the larger of the two lower candidates gives the
 * most favourable ratio a market can have — and therefore a LOWER BOUND on its
 * break-even win rate. Bounding rather than pinning is deliberate: the exact
 * value depends on live ATR, and a bound is the part that is always true.
 */
function breakEvenLowerBound(assetType: AssetType): number {
  const cal = getClassCalibration(assetType);
  const ratioFromRisk = cal.tp1RiskShare;
  const ratioFromAtr = cal.tp1AtrMultiplier / cal.stopAtrMultiplier;
  const bestRatio = Math.max(ratioFromRisk, ratioFromAtr);
  const bankedR = BANKED_FRACTION * bestRatio;
  return 1 / (1 + bankedR);
}

describe("the learning layer's neutral point", () => {
  it("is above 0.5 in every class, by the class's own geometry", () => {
    let checked = 0;
    const table: string[] = [];
    for (const assetType of CLASSES) {
      const breakEven = breakEvenLowerBound(assetType);
      table.push(`${assetType}=${breakEven.toFixed(3)}`);
      assert.ok(
        breakEven > 0.65,
        `${assetType} break-even is ${breakEven.toFixed(3)} — if a class ever ` +
          `really sat near 0.5 the old transfer function would have been ` +
          `defensible, and this whole file would be wrong`,
      );
      checked++;
    }
    // NON-VACUITY: an empty class list passes a loop that never runs.
    assert.equal(checked, CLASSES.length);
    assert.ok(checked >= 8, `only ${checked} classes checked: ${table.join(" ")}`);
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
    // intention. forex is the highest-volume class; its own geometry decides.
    const breakEven = breakEvenLowerBound("forex");
    const winRateThatLosesMoney = 0.7;
    assert.ok(
      winRateThatLosesMoney < breakEven,
      `0.7 should sit below forex break-even ${breakEven.toFixed(3)}`,
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
