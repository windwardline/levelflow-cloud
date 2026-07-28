import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rankOpportunities,
  scoreOpportunity,
} from "../supabase/functions/trade-analyzer/scanRanking.ts";

describe("market scan ranking", () => {
  it("ranks by confidence so the list reads most to least probable", () => {
    const modestConfidenceGoodPayoff = {
      confidenceScore: 70,
      rewardRisk: 2.4,
      symbol: "EURUSD",
    };
    const highConfidenceThinPayoff = {
      confidenceScore: 80,
      rewardRisk: 1.4,
      symbol: "XAUUSD",
    };

    const ranked = rankOpportunities([
      modestConfidenceGoodPayoff,
      highConfidenceThinPayoff,
    ]);

    assert.equal(ranked[0].symbol, "XAUUSD");
  });

  it("ignores payoff in the primary score", () => {
    assert.equal(
      scoreOpportunity({ confidenceScore: 50, rewardRisk: 30 }),
      scoreOpportunity({ confidenceScore: 50, rewardRisk: 1 }),
    );
  });

  it("sinks candidates without a confidence score to the bottom", () => {
    const ranked = rankOpportunities([
      { confidenceScore: undefined, rewardRisk: 2, symbol: "A" },
      { confidenceScore: 60, rewardRisk: 2, symbol: "B" },
    ]);

    assert.equal(ranked[0].symbol, "B");
  });

  it("breaks confidence ties by payoff", () => {
    const ranked = rankOpportunities([
      { confidenceScore: 70, rewardRisk: 1.5, symbol: "THIN" },
      { confidenceScore: 70, rewardRisk: 2.2, symbol: "RICH" },
    ]);

    assert.equal(ranked[0].symbol, "RICH");
  });
});
