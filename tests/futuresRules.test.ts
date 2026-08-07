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
      takeProfit1: null
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
      takeProfit1: null
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
      takeProfit1: null
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
      takeProfit1: null
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
      takeProfit1: null
      }),
      null,
    );
  });
});

// TP1 was the one ladder level never passed into the tick rules, so it was
// never aligned: 98.9% of futures plans shipped a TP1 off the contract's grid,
// with a copy button beside it. An ES TP1 of 4557.080357142857 is 18,228.32
// ticks at 0.25 — a price the exchange cannot accept, in the operator's
// clipboard.
//
// The post-condition inside applyFuturesTickRules is the real guard, because
// the defect was a level nobody passed in and no test asserting the levels it
// knew about could have caught it. These prove the guard fires.
describe("every level the tick rules return is on the contract's grid", () => {
  const onGrid = (level: number, tick: number) => {
    const ticks = level / tick;
    return Math.abs(ticks - Math.round(ticks)) < 1e-6;
  };

  it("aligns TP1 along with the other three", () => {
    const plan = applyFuturesTickRules({
      entryPrice: 4559.7534,
      side: "buy",
      stopLoss: 4549.4871,
      symbol: "ESUSD",
      takeProfit: 4580.1119,
      takeProfit1: 4570.080357142857,
    });
    assert.ok(plan);
    for (const level of [
      plan!.entryPrice,
      plan!.stopLoss,
      plan!.takeProfit,
      plan!.takeProfit1!,
    ]) {
      assert.ok(onGrid(level, 0.25), `${level} is not a multiple of 0.25`);
    }
  });

  it("rounds TP1 toward entry, so a reachable partial stays reachable", () => {
    const plan = applyFuturesTickRules({
      entryPrice: 4559.75,
      side: "buy",
      stopLoss: 4549.5,
      symbol: "ESUSD",
      takeProfit: 4580,
      takeProfit1: 4570.24,
    });
    assert.ok(plan);
    // 4570.24 sits between 4570.00 and 4570.25. A buy banks half ABOVE entry,
    // so rounding down is toward entry — nearer, not further.
    assert.equal(plan!.takeProfit1, 4570);
  });

  it("carries a null TP1 through rather than inventing one", () => {
    const plan = applyFuturesTickRules({
      entryPrice: 4559.75,
      side: "buy",
      stopLoss: 4549.5,
      symbol: "ESUSD",
      takeProfit: 4580,
      takeProfit1: null,
    });
    assert.ok(plan);
    assert.equal(plan!.takeProfit1, null);
  });

  it("keeps its decimals on a tick that stringifies exponentially", () => {
    // decimalPlaces split toString() on "." — and 1e-7 has no decimal part, so
    // it returned 0 and toFixed(0) rounded the price to a whole number. E8
    // publishes 6J at exactly 1e-7, so this arms the moment the grid is
    // generated from E8's own table. Verified across the real tick sizes in
    // use: 0.25 -> 2, 0.005 -> 3, 0.03125 -> 5, 1e-7 -> 7.
    const plan = applyFuturesTickRules({
      entryPrice: 109.078125,
      side: "buy",
      stopLoss: 108.5,
      symbol: "ZBUSD",
      takeProfit: 110.25,
      takeProfit1: 109.6,
    });
    assert.ok(plan);
    assert.ok(onGrid(plan!.takeProfit1!, plan!.contractSpec.tickSize));
  });
});
