import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rankOpportunities,
  scoreOpportunity,
} from "../supabase/functions/trade-analyzer/scanRanking.ts";

describe("market scan ranking", () => {
  it("ranks by expected value, not raw confidence", () => {
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
      highConfidenceThinPayoff,
      modestConfidenceGoodPayoff,
    ]);

    assert.equal(ranked[0].symbol, "EURUSD");
  });

  it("caps the payoff term so outlier reward:risk cannot dominate", () => {
    assert.equal(
      scoreOpportunity({ confidenceScore: 50, rewardRisk: 30 }),
      scoreOpportunity({ confidenceScore: 50, rewardRisk: 3 }),
    );
  });

  it("sinks candidates without a payoff or confidence to the bottom", () => {
    const ranked = rankOpportunities([
      { confidenceScore: undefined, rewardRisk: 2, symbol: "A" },
      { confidenceScore: 60, rewardRisk: 2, symbol: "B" },
      { confidenceScore: 60, rewardRisk: undefined, symbol: "C" },
    ]);

    assert.equal(ranked[0].symbol, "B");
  });

  it("breaks expected-value ties by confidence", () => {
    const ranked = rankOpportunities([
      { confidenceScore: 60, rewardRisk: 2, symbol: "LOW" },
      { confidenceScore: 80, rewardRisk: 1.5, symbol: "HIGH" },
    ]);

    // 60 * 2 = 120 = 80 * 1.5 — the tie goes to higher confidence.
    assert.equal(ranked[0].symbol, "HIGH");
  });
});
