import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  type AssetType,
  getClassCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";

/**
 * The Desk printed the runner target's ratio under the words "payoff after
 * costs". Half the position leaves at TP1.
 *
 * `pricePlan.rewardRisk` is `(targetDistance - roundTrip) / riskDistance` on a
 * FULL-SIZE basis. The ladder banks half at TP1 — about 0.4R to 0.5R of risk
 * distance — and runs the rest to a target gated at `minimumTargetRewardRisk`
 * (1.5 to 1.7). So a setup admitted at 1.6x realises
 *
 *   0.5 * tp1R + 0.5 * targetR  ~=  1.0R
 *
 * against a −1.00R stop, while the surface said 1.6x. The operator read an edge
 * materially larger than the ladder can deliver (33% to 60% by class), on
 * the screen they read before
 * placing the trade.
 *
 * AMENDMENT 39: profit potential must exceed loss potential STRUCTURALLY and
 * may never be manufactured. Nothing here touches the geometry — the target
 * still comes from real structure and window feasibility, and widening it to
 * improve this number is prohibited. What changes is that the number shown is
 * the one the ladder pays.
 *
 * The figures below are DERIVED from shipped calibration. A test restating
 * "1.0x" would agree with itself while the geometry moved underneath it.
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

/** Position fraction banked at TP1 — replay.ts realizedRFromLegs. */
const BANKED = 0.5;

/** TP1's distance as a share of risk, by the branch that binds (pricePlan.ts). */
function tp1RatioOf(assetType: AssetType): number {
  const cal = getClassCalibration(assetType);
  return Math.max(cal.tp1RiskShare, cal.tp1AtrMultiplier / cal.maxStopAtrMultiplier);
}

/** What the gate admits, on a full-size runner basis. */
function gateRatioOf(assetType: AssetType): number {
  return getClassCalibration(assetType).minimumTargetRewardRisk;
}

/** What the ladder actually pays on a full win, before costs. */
function ladderRatioOf(assetType: AssetType): number {
  return BANKED * tp1RatioOf(assetType) + BANKED * gateRatioOf(assetType);
}

describe("what the ladder pays is not what the gate admits", () => {
  it("delivers materially less than the gate's ratio, in every class", () => {
    let checked = 0;
    for (const assetType of CLASSES) {
      const gate = gateRatioOf(assetType);
      const ladder = ladderRatioOf(assetType);
      assert.ok(
        ladder < gate,
        `${assetType}: the ladder cannot pay MORE than the gate's target ` +
          `(ladder ${ladder.toFixed(2)}, gate ${gate.toFixed(2)}) — the ` +
          `blend is wrong if it does`,
      );
      assert.ok(
        gate - ladder > 0.25,
        `${assetType}: the gate and the ladder are only ` +
          `${(gate - ladder).toFixed(2)} apart. If they ever converged, ` +
          `reporting the gate's ratio would stop overstating the edge and ` +
          `this file's premise would be gone.`,
      );
      checked++;
    }
    // NON-VACUITY: an empty class list passes a loop that never runs.
    assert.equal(checked, CLASSES.length);
  });

  it("overstates by 33% to 60%, and 60% is the MAXIMUM not the typical case", () => {
    // The figure four comments quoted as "roughly 60%" is metals alone.
    // DERIVED per class from shipped calibration rather than restated, because
    // a prose constant is exactly what went stale: energies overstates by
    // 33.3%, and four classes sit at 52.4%. Quoting the extreme as the norm
    // is the same shape as counting the wrong population — it makes a real
    // finding sound like a bigger one than the evidence carries.
    const over = CLASSES.map((assetType) => ({
      assetType,
      pct: (gateRatioOf(assetType) / ladderRatioOf(assetType) - 1) * 100,
    })).sort((first, second) => second.pct - first.pct);
    const worst = over[0];
    const best = over.at(-1)!;
    assert.ok(
      worst.pct <= 62 && worst.pct >= 55,
      `the worst class now overstates by ${worst.pct.toFixed(1)}% ` +
        `(${worst.assetType}) — outside the band the record states`,
    );
    assert.ok(
      best.pct <= 40 && best.pct >= 28,
      `the best class now overstates by ${best.pct.toFixed(1)}% ` +
        `(${best.assetType}) — outside the band the record states`,
    );
    assert.ok(
      worst.pct - best.pct > 15,
      `the classes now span only ${(worst.pct - best.pct).toFixed(1)} points, ` +
        `so a single figure would no longer be misleading and the four ` +
        `comments citing a RANGE should be simplified rather than left`,
    );
  });

  it("lands near 1:1 against a full risk unit, which is the finding", () => {
    // The number amendment 39 records: a full win pays about one risk unit
    // against a stop that costs exactly one. Asserted as a band rather than a
    // point, because the classes differ and a point would be a restatement.
    for (const assetType of CLASSES) {
      const ladder = ladderRatioOf(assetType);
      assert.ok(
        ladder >= 0.9 && ladder <= 1.3,
        `${assetType} ladder payoff is ${ladder.toFixed(2)} — outside the ` +
          `0.9-1.3 band the ruling was written against`,
      );
    }
  });
});

describe("the surface reads the ladder's payoff", () => {
  const plan = readFileSync(
    join(
      new URL("..", import.meta.url).pathname,
      "supabase/functions/trade-analyzer/pricePlan.ts",
    ),
    "utf8",
  );
  const engine = readFileSync(
    join(
      new URL("..", import.meta.url).pathname,
      "supabase/functions/trade-analyzer/index.ts",
    ),
    "utf8",
  );
  const panel = readFileSync(
    join(
      new URL("..", import.meta.url).pathname,
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
    ),
    "utf8",
  );

  it("blends both legs and charges the round trip once", () => {
    // Entry at full size plus two half-size exits is ONE round trip of size,
    // and the venue bills per lot rather than per ticket (venueCosts.ts), so
    // charging it twice would understate the payoff as surely as ignoring the
    // TP1 leg overstated it.
    // Anchored on the EXPRESSION, not the first occurrence of the name — the
    // type declaration carries it too, and slicing from there cut the body out
    // entirely while the assertion still looked meaningful.
    const at = plan.indexOf("ladderRewardRisk: takeProfit1 === null");
    assert.ok(at >= 0, "the ladder payoff expression is gone");
    const body = plan.slice(at, plan.indexOf("\n    rewardRisk:", at));
    assert.match(body, /0\.5 \* Math\.abs\(takeProfit1 - entryPrice\)/);
    assert.match(body, /0\.5 \* Math\.abs\(takeProfit - entryPrice\)/);
    assert.equal(
      (body.match(/estimatedRoundTripCost/g) ?? []).length,
      1,
      "the round trip must be charged exactly once against the blended reward",
    );
  });

  it("refuses rather than repeating rewardRisk when there is no TP1 leg", () => {
    // A full-size runner IS rewardRisk. Duplicating it under a second name
    // would let the two drift and give the surface two answers to one question.
    assert.match(plan, /ladderRewardRisk: takeProfit1 === null \? null :/);
  });

  it("puts it on the wire and reads it on the Desk", () => {
    assert.match(engine, /ladderRewardRisk: pricePlan\.ladderRewardRisk === null/);
    assert.match(
      panel,
      /const rewardRisk = ladderRewardRisk > 0\s*\n?\s*\? ladderRewardRisk\s*\n?\s*: Number\(confluence\?\.rewardRisk \?\? 0\)/,
      "the Desk is not preferring the ladder's payoff",
    );
  });

  it("leaves the GATE reading the runner target", () => {
    // The gate is calibration and is not being re-tuned here. Whether it
    // SHOULD admit on a ratio the ladder does not deliver is an owner
    // question; silently changing it under cover of a display fix is not.
    assert.match(
      engine,
      /rewardRisk: Number\(pricePlan\.rewardRisk\.toFixed\(2\)\)/,
      "the gate's own figure stopped being published",
    );
    assert.match(
      readFileSync(
        join(
          new URL("..", import.meta.url).pathname,
          "supabase/functions/trade-analyzer/index.ts",
        ),
        "utf8",
      ),
      /pricePlan\.rewardRisk < calibration\.minRewardRisk/,
      "the gate no longer compares the runner ratio to minRewardRisk",
    );
  });
});
