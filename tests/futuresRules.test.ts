import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFuturesTickRules,
  getFuturesContractSpec,
} from "../supabase/functions/trade-analyzer/futures.ts";

describe("futures tick rules", () => {
  it("rounds ES buy limits to valid ticks and preserves order direction", () => {
    const plan = applyFuturesTickRules({
      entryPrice: 5234.13,
      side: "buy",
      stopLoss: 5233.91,
      symbol: "ESUSD",
      takeProfit: 5234.77,
    });

    assert.ok(plan);
    assert.equal(plan.contractSpec.tickSize, 0.25);
    assert.equal(plan.entryPrice, 5234);
    assert.equal(plan.stopLoss, 5233);
    assert.equal(plan.takeProfit, 5236);
    assert.ok(plan.stopLoss < plan.entryPrice);
    assert.ok(plan.takeProfit > plan.entryPrice);
  });

  it("rounds ES sell limits to valid ticks and preserves order direction", () => {
    const plan = applyFuturesTickRules({
      entryPrice: 5234.13,
      side: "sell",
      stopLoss: 5234.28,
      symbol: "ESUSD",
      takeProfit: 5233.88,
    });

    assert.ok(plan);
    assert.equal(plan.entryPrice, 5234.25);
    assert.equal(plan.stopLoss, 5235.25);
    assert.equal(plan.takeProfit, 5232.25);
    assert.ok(plan.stopLoss > plan.entryPrice);
    assert.ok(plan.takeProfit < plan.entryPrice);
  });

  it("uses smaller tick increments for silver futures", () => {
    const plan = applyFuturesTickRules({
      entryPrice: 31.2374,
      side: "buy",
      stopLoss: 31.211,
      symbol: "SIUSD",
      takeProfit: 31.251,
    });

    assert.ok(plan);
    assert.equal(plan.contractSpec.tickSize, 0.005);
    assert.equal(plan.entryPrice, 31.235);
    assert.equal(plan.stopLoss, 31.195);
    assert.equal(plan.takeProfit, 31.315);
  });

  it("uses CME-style ticks for additional verified futures feeds", () => {
    assert.equal(getFuturesContractSpec("NQUSD")?.tickSize, 0.25);
    assert.equal(getFuturesContractSpec("YMUSD")?.tickSize, 1);
    assert.equal(getFuturesContractSpec("RTYUSD")?.tickSize, 0.1);
    assert.equal(getFuturesContractSpec("CLUSD")?.tickSize, 0.01);
    assert.equal(getFuturesContractSpec("NGUSD")?.tickSize, 0.001);
    assert.equal(getFuturesContractSpec("HGUSD")?.tickSize, 0.0005);
    assert.equal(getFuturesContractSpec("ZBUSD")?.tickSize, 0.03125);
    assert.equal(getFuturesContractSpec("ZNUSD")?.tickSize, 0.015625);
  });

  it("rounds treasury futures to fractional ticks", () => {
    const plan = applyFuturesTickRules({
      entryPrice: 109.517,
      side: "buy",
      stopLoss: 109.503,
      symbol: "ZNUSD",
      takeProfit: 109.559,
    });

    assert.ok(plan);
    assert.equal(plan.entryPrice, 109.515625);
    assert.equal(plan.stopLoss, 109.453125);
    assert.equal(plan.takeProfit, 109.640625);
  });

  it("does not apply contract rules to unsupported symbols", () => {
    assert.equal(getFuturesContractSpec("EURUSD"), null);
    assert.equal(
      applyFuturesTickRules({
        entryPrice: 1.1,
        side: "buy",
        stopLoss: 1.09,
        symbol: "EURUSD",
        takeProfit: 1.12,
      }),
      null,
    );
  });
});
