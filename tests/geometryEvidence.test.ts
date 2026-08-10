import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decomposeLegs,
  quantile,
  spearman,
} from "../scripts/geometry-evidence.ts";

// 4b's evidence extractor: wrong arithmetic here becomes a wrong owner
// decision at the geometry review, so the three primitives that carry the
// numbers are pinned exactly.

describe("decomposeLegs — the accountant's arithmetic, split for the review", () => {
  it("splits a laddered win into banked, runner half, derived cost, and the single-target counterfactual", () => {
    const parts = decomposeLegs({
      legs: [
        { leg: "entry", price: 100, time: 0 },
        { leg: "tp1", price: 101, time: 1 },
        { kind: "take_profit", leg: "exit", price: 105, time: 2 },
      ],
      outcome: "take_profit",
      realizedR: 1.45,
      riskDistance: 2,
      side: "buy",
      symbol: "EURUSD",
    })!;
    assert.equal(parts.bankedR, 0.25);
    assert.equal(parts.exitR, 1.25);
    // gross 1.5 − realized 1.45 = one round trip of cost.
    assert.equal(parts.costR, 0.05);
    // Full size to the same exit print, same cost: 2×1.25 − 0.05... the
    // counterfactual is (exit−entry)/risk − cost = 2.5 − 0.05.
    assert.equal(parts.singleTargetR, 2.45);
  });

  it("mirrors for a sell and refuses degenerate risk", () => {
    const parts = decomposeLegs({
      legs: [
        { leg: "entry", price: 100, time: 0 },
        { kind: "stop_loss", leg: "exit", price: 102, time: 1 },
      ],
      outcome: "stop_loss",
      realizedR: -1.05,
      riskDistance: 2,
      side: "sell",
      symbol: "EURUSD",
    })!;
    assert.equal(parts.exitR, -1);
    assert.equal(parts.costR, 0.05);
    assert.equal(
      decomposeLegs({
        legs: [{ leg: "entry", price: 100, time: 0 }],
        outcome: "expired_at_loss",
        realizedR: 0,
        riskDistance: 0,
        side: "buy",
        symbol: "EURUSD",
      }),
      null,
    );
  });
});

describe("spearman — rank correlation with ties", () => {
  it("reads a monotone relation as 1 and an inverse as -1", () => {
    assert.equal(spearman([[1, 10], [2, 20], [3, 30]]), 1);
    assert.equal(spearman([[1, 30], [2, 20], [3, 10]]), -1);
  });

  it("handles ties by shared ranks and refuses degenerate inputs", () => {
    const rho = spearman([[1, 5], [1, 5], [2, 10], [3, 15]])!;
    assert.ok(rho > 0.9);
    assert.equal(spearman([[1, 1], [2, 2]]), null);
    assert.equal(spearman([[1, 1], [1, 2], [1, 3]]), null);
  });
});

describe("quantile — interpolated, sorted-input", () => {
  it("interpolates between order statistics", () => {
    assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(quantile([1, 2, 3, 4], 0), 1);
    assert.equal(quantile([1, 2, 3, 4], 1), 4);
    assert.equal(quantile([], 0.5), null);
  });
});
