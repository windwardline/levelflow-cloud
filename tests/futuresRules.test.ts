import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyFuturesTickRules,
  getFuturesContractSpec,
} from "../supabase/functions/trade-analyzer/futures.ts";
import {
  E8_FUTURES_SPECS,
  FUTURES_MAPPINGS,
} from "../src/lib/broker/instruments";

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

// 1b: 19 of 31 live futures markets shipped every price off-grid, because the
// spec table held 13 symbols while the futures class held 31 — and agriculture
// and livestock, which trade on the same exchange grids, never reached the
// alignment at all. The table now covers every market whose grid is verified,
// from two sources with one boundary between them:
//
//  - E8's own published tick table (13004287), already transcribed in
//    src/lib/broker/instruments.ts CANONICAL_ROWS — the same source the
//    existing 13 used.
//  - The exchange's contract specification where E8 publishes no tick — the
//    precedent ZBUSD (1/32) and ZNUSD (1/64) already set, because an
//    exchange-traded contract's grid is the exchange's property, not the
//    broker's. §20i ruling 5 still bars exchange values from the SIZING
//    table; alignment is a price-grid fact, not a money fact.
//
// The five CME-sourced ticks are each grounded in evidence beyond memory:
// ZOUSX 0.25 and ZRUSD 0.005 measured as the exact price-delta gcd of the
// banked minute series (234 and 458 bars); ZFUSD/ZTUSD 0.0078125 confirmed by
// the futures-account dossier's own conversion (ZFU6 106'070 = 106.21875 =
// exactly 13,596 quarter-32nds).
//
// GFUSX is the only one resting on the grid alone, and its old grounding was
// STRUCK 2026-09-01 (amendment 40). It read "consistent with the live
// watchlist print (GFQ6 348.300) and its LE/HE siblings' published tick".
// Neither half holds: 348.300 divides evenly by 0.025 AND by 0.005, so it
// discriminates nothing, and inference from siblings is what the third route
// forbids in terms. What grounds it now is a CONTROL on the alternative —
// re-deriving from the bank returns 0.005 for LEUSX and HEUSX, whose
// E8-published tick is 0.025, so that instrument misses both known answers by
// five and cannot settle the open one.
describe("amendment 40's grounding cannot be silently deleted", () => {
  // The bank is gitignored, so CI cannot recompute the gcd that decided this.
  // What CI can do is refuse a silent deletion of the reasoning, which is the
  // same shape tests/macroStateReachesTheEmit.test.ts uses for UNDERIVED.
  const source = readFileSync(
    new URL("../supabase/functions/trade-analyzer/futures.ts", import.meta.url),
    "utf8",
  );

  it("keeps the control that replaced GFUSX's struck corroboration", () => {
    assert.match(source, /RATIFIED as amendment 40/);
    assert.match(source, /LEUSX and HEUSX are published 0\.025 and their bank gcd is/);
    // A naive absence check cannot work here: the comment QUOTES the struck
    // sentence in order to record that it was struck, so the phrase is
    // legitimately present. What must hold is that it never appears as a LIVE
    // grounding — i.e. every occurrence sits downstream of the strike record.
    // Matched loosely on purpose: the marker also carries its register
    // reference, "(amendment 40, §6b-1 E)", and an exact-string guard broke
    // the moment that was added. A guard should pin the CLAIM, not the
    // punctuation around it.
    const struckAt = source.search(/STRUCK 2026-09-01 \(amendment 40[,)]/);
    assert.notEqual(struckAt, -1, "the strike record itself was removed");
    for (
      let at = source.indexOf("siblings' published 0.025");
      at !== -1;
      at = source.indexOf("siblings' published 0.025", at + 1)
    ) {
      assert.ok(
        at > struckAt,
        "the sibling-inference grounding appears BEFORE the strike record, so it " +
          "is being used as live justification again. Amendment 40 replaced it " +
          "with a control on the alternative instrument, because inference from " +
          "adjacent instruments is what the sizing boundary's third route forbids.",
      );
    }
  });

  it("keeps GFUSX at the published-control value, not the bank's", () => {
    // Not sibling inference: LEUSX/HEUSX are cited as CONTROLS ON THE
    // INSTRUMENT, never as evidence for GFUSX's own value. If someone
    // "corrects" GFUSX to the bank's 0.005, this is where it stops.
    assert.equal(getFuturesContractSpec("GFUSX")?.tickSize, 0.025);
  });
});

describe("1b: every verified-grid market has a spec; the unverifiable refuse", () => {
  const expectedTicks: Record<string, number> = {
    // E8-published (tick table 13004287, via instruments.ts):
    HEUSX: 0.025,
    HOUSD: 0.0001,
    LEUSX: 0.025,
    PAUSD: 0.1,
    PLUSD: 0.1,
    RBUSD: 0.0001,
    ZCUSX: 0.25,
    ZLUSX: 0.01,
    ZMUSD: 0.1,
    ZSUSX: 0.25,
    // CME contract specifications (the ZB/ZN precedent):
    GFUSX: 0.025,
    ZFUSD: 0.0078125,
    ZOUSX: 0.25,
    ZRUSD: 0.005,
    ZTUSD: 0.0078125,
  };

  it("carries the fifteen new specs at their verified ticks", () => {
    for (const [symbol, tick] of Object.entries(expectedTicks)) {
      const spec = getFuturesContractSpec(symbol);
      assert.ok(spec, `${symbol} must have a contract spec`);
      assert.equal(spec.tickSize, tick, symbol);
    }
  });

  it("agrees with E8's published tick wherever E8 published one", () => {
    // The Deno boundary: futures.ts cannot import instruments.ts, so the two
    // declarations are pinned to each other here (the contractVariants
    // pattern). Every sizing-side mapped symbol with a published tick must
    // match the analyzer's grid exactly — one fact, two homes, zero drift.
    for (const [levelflowSymbol, e8Symbol] of Object.entries(FUTURES_MAPPINGS)) {
      const published = E8_FUTURES_SPECS[e8Symbol]?.tickSize.value;
      if (published === null || published === undefined) {
        continue;
      }
      const spec = getFuturesContractSpec(levelflowSymbol);
      assert.ok(spec, `${levelflowSymbol} is mapped but has no analyzer spec`);
      assert.equal(spec.tickSize, published, levelflowSymbol);
    }
  });

  it("refuses a spec to the four index futures served on cash series (amendment 32)", () => {
    // A derivative is not its underlying. EMD/FDAX/FESX/NKD are served today
    // on CASH index series, so no honest grid exists for what is actually
    // served — E8's futures ticks describe contracts these series are not.
    // They refuse under 1b until item 1.5 makes them dormant; adding their
    // specs would align the wrong instrument.
    for (const symbol of ["EMD", "FDAX", "FESX", "NKD", "FDXM"]) {
      assert.equal(getFuturesContractSpec(symbol), null, symbol);
    }
  });
});
