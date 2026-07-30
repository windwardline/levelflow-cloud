import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arcColorForScore } from "../src/components/trade/ConfidenceGauge";
import { CONFIDENCE_TIERS } from "../src/lib/confidenceTiers";

// No jsdom in this repo's unit-test stack (see tests/workspaceNav.test.tsx),
// and importing ConfidenceGauge.tsx never touches `document` at module
// scope, so this loads cleanly under plain node:test.
const COLORS = { buy: "BUY", caution: "CAUTION", sell: "SELL" };

function tierMin(id: "qualified" | "strong" | "best"): number {
  const tier = CONFIDENCE_TIERS.find((candidate) => candidate.id === id);
  assert.ok(tier, `confidenceTiers.ts must define a "${id}" tier`);
  return tier.min;
}

describe("arcColorForScore", () => {
  it("colors the Strong tier's whole range buy — regression for the 76-79 caution/Strong-label mismatch", () => {
    // Pre-fix thresholds (>=80/>=65) put 76-79 in the caution band while
    // confidenceTiers.ts already labels 75-84 "Strong" — a visible
    // color/label mismatch. The fix folds Strong and Best into one buy band.
    for (const score of [75, 76, 77, 78, 79, 80, 84, 85, 100]) {
      assert.equal(arcColorForScore(score, COLORS), "BUY", `score ${score}`);
    }
  });

  it("colors the Qualified tier's range caution", () => {
    for (const score of [66, 70, 74]) {
      assert.equal(arcColorForScore(score, COLORS), "CAUTION", `score ${score}`);
    }
  });

  it("colors anything below Qualified sell", () => {
    for (const score of [0, 1, 50, 65]) {
      assert.equal(arcColorForScore(score, COLORS), "SELL", `score ${score}`);
    }
  });

  it("clamps out-of-range scores before comparing", () => {
    assert.equal(arcColorForScore(150, COLORS), "BUY");
    assert.equal(arcColorForScore(-10, COLORS), "SELL");
  });

  it("derives its thresholds from confidenceTiers.ts, not duplicated literals", () => {
    const strongMin = tierMin("strong");
    const qualifiedMin = tierMin("qualified");

    // One tick below/above each real tier boundary flips the color — proves
    // the function is actually driven by CONFIDENCE_TIERS' current values,
    // not coincidentally-matching hardcoded numbers.
    assert.equal(arcColorForScore(strongMin, COLORS), "BUY");
    assert.equal(arcColorForScore(strongMin - 1, COLORS), "CAUTION");
    assert.equal(arcColorForScore(qualifiedMin, COLORS), "CAUTION");
    assert.equal(arcColorForScore(qualifiedMin - 1, COLORS), "SELL");
  });
});
