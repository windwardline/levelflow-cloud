import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyStrategyProfile,
  getStrategyProfileWeight,
} from "../supabase/functions/trade-analyzer/strategyProfiles.ts";

const baseVotes = [
  {
    confidence: 0.7,
    name: "volatility_expansion",
    rationale: "Range expansion.",
    score: 20,
  },
  {
    confidence: 0.7,
    name: "range_mean_reversion",
    rationale: "Range edge.",
    score: 20,
  },
];

describe("strategy category profiles", () => {
  it("emphasizes volatility expansion more for crypto than forex", () => {
    assert.ok(
      getStrategyProfileWeight("crypto", "volatility_expansion") >
        getStrategyProfileWeight("forex", "volatility_expansion"),
    );
  });

  it("emphasizes range mean reversion more for forex than crypto", () => {
    assert.ok(
      getStrategyProfileWeight("forex", "range_mean_reversion") >
        getStrategyProfileWeight("crypto", "range_mean_reversion"),
    );
  });

  it("keeps original scores available after applying category profiles", () => {
    const [volatilityVote] = applyStrategyProfile("crypto", baseVotes);

    assert.equal(volatilityVote.baseScore, 20);
    assert.equal(volatilityVote.profileWeight, 1.12);
    assert.equal(volatilityVote.score, 22);
  });
});
