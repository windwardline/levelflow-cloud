import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectHighestProbabilityTarget } from "../supabase/functions/trade-analyzer/pricePlan.ts";

describe("trade analyzer price plan", () => {
  it("uses the nearest qualifying buy target instead of the farthest target", () => {
    const target = selectHighestProbabilityTarget("buy", {
      liquidityTarget: 110,
      minimumTarget: 105,
      volatilityTarget: 108,
    });

    assert.equal(target, 108);
  });

  it("uses the nearest qualifying sell target instead of the farthest target", () => {
    const target = selectHighestProbabilityTarget("sell", {
      liquidityTarget: 90,
      minimumTarget: 95,
      volatilityTarget: 92,
    });

    assert.equal(target, 92);
  });

  it("preserves the required payoff floor when nearby targets are too close", () => {
    assert.equal(
      selectHighestProbabilityTarget("buy", {
        liquidityTarget: 103,
        minimumTarget: 105,
        volatilityTarget: 104,
      }),
      105,
    );
    assert.equal(
      selectHighestProbabilityTarget("sell", {
        liquidityTarget: 97,
        minimumTarget: 95,
        volatilityTarget: 96,
      }),
      95,
    );
  });
});
