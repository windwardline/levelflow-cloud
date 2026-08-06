import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAssetType,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { estimateExecutionQuality } from "../supabase/functions/trade-analyzer/executionQuality.ts";

// Agriculture became its own class on 2026-08-06, derived from its own first
// sweep rather than seeded from a neighbour. §19f discipline: literal pins, so a
// value cannot move without a deliberate test edit citing fresh measurement.
const GRAINS = ["ZCUSX", "ZSUSX", "ZLUSX", "ZMUSD", "ZOUSX", "ZRUSD"];
const LIVESTOCK = ["LEUSX", "GFUSX", "HEUSX"];

describe("agriculture is its own calibration class (derived 2026-08-06)", () => {
  it("classifies exactly the six grains", () => {
    for (const symbol of GRAINS) {
      assert.equal(getAssetType(symbol), "agriculture", symbol);
    }
  });

  it("gives livestock its own class on a derived 24-hour window", () => {
    // OVERTURNED, and the reversal is the lesson. This test first asserted
    // livestock stayed in `futures` because 55 filled setups could not calibrate
    // anything — read at the time as thin trading and thin FMP intraday. The
    // starvation audit proved the opposite: livestock reached the geometry stage
    // 416 times and the LADDER REFUSED 396, a 5% survival rate. The data was
    // there and a 6-hour review window was discarding it.
    //
    // At 24h: total R across both splits +2.9/+1.4 -> +32.4/+36.9, on 158 test
    // setups against EIGHT. Live cattle +0.244, feeder cattle +0.237, lean hogs
    // +0.222, all at 84-87% hit rates. Amendment 25 exists because of this.
    for (const symbol of LIVESTOCK) {
      assert.equal(getAssetType(symbol), "livestock", symbol);
      assert.equal(getCategoryCalibration(symbol).defaultReviewHours, 24);
    }
    // And the window change is scoped: the classes it was NOT derived for keep
    // their own.
    assert.equal(getCategoryCalibration("ZCUSX").defaultReviewHours, 6);
    assert.equal(getCategoryCalibration("ESUSD").defaultReviewHours, 6);
  });

  it("pins the derived confidence floor at 30, distinct from futures' 25", () => {
    // Monotone survival on 6922 filled setups: test expectancy positive at 30
    // and in every judgeable bucket above, 108 test fills at that floor.
    assert.equal(getCategoryCalibration("ZCUSX").confidenceThreshold, 30);
    // futures 68 -> 25 on 2026-08-06 from the final sweep. What this assertion
    // is for is that agriculture carries its OWN floor rather than inheriting
    // futures', and it still does — 30 against 25.
    assert.equal(getCategoryCalibration("ESUSD").confidenceThreshold, 25);
  });

  it("charges agricultural execution cost about 3x the futures profile", () => {
    // The reason the class exists. One tick is the tightest spread a contract
    // can quote, and tick over price is arithmetic: the grains average 4.0 bps
    // against the E-mini S&P's 0.32. Understating cost is how a market gets
    // credited with edge it does not have — the same defect, in the opposite
    // direction, as the absolute floor that silenced copper.
    const risk = 3.5 * 1.4;
    const shared = {
      atr: 3.5,
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      dailyAtr: 28,
      entryPrice: 449.75,
      latestClose: 449.75,
      providerWarnings: [],
      quotedSpread: null,
      side: "buy" as const,
      stopLoss: 449.75 - risk,
      symbol: "ZCUSX",
      takeProfit: 449.75 + risk * 2,
    };
    const asAg = estimateExecutionQuality({ ...shared, assetType: "agriculture" });
    const asFutures = estimateExecutionQuality({ ...shared, assetType: "futures" });
    assert.ok(
      asAg.estimatedRoundTripCost > asFutures.estimatedRoundTripCost * 2.5,
      `agriculture must charge materially more: ${asAg.estimatedRoundTripCost} vs ${asFutures.estimatedRoundTripCost}`,
    );
    // And it must still leave a genuine 2:1 setup tradable — a cost model that
    // disqualifies everything is the copper defect wearing different clothes.
    assert.ok(asAg.effectiveRewardRisk > 1.5, `${asAg.effectiveRewardRisk}`);
  });

  it("pins the derived runner ceiling at 1.4 and TP1 at 0.4", () => {
    // Runner DERIVED on total R across both splits (+107.5/+23.8 -> +197.7/+72.7,
    // 648 test setups against 271). TP1 derived as a validated null. The pair
    // matters together: forex's TP1 optimum is 0.3 and agriculture's is 0.4, so a
    // shared value would be wrong for one of them.
    const ag = getCategoryCalibration("ZCUSX");
    // 0.8 -> 1.4 on 2026-08-06, RE-DERIVED at the new stop cap. The first runner
    // grid ran at the old cap of 1.4; tightening the stop to 1.0 shrinks the
    // absolute floor minimumTargetRewardRisk imposes, so more structural levels
    // qualify and the optimal ceiling moves. Deriving the two levers
    // independently would have shipped the wrong pair.
    assert.equal(ag.runnerWindowShare, 1.4);
    assert.equal(ag.tp1RiskShare, 0.4);
    assert.equal(getCategoryCalibration("EURUSD").tp1RiskShare, 0.4);
  });

  it("carries no grain in the futures symbol list any longer", () => {
    // The bug this caught when it was written: removing the grains from futures
    // by first-match replace deleted them from the agriculture list instead,
    // leaving every grain classified futures while the new class sat empty.
    for (const symbol of GRAINS) {
      assert.notEqual(getAssetType(symbol), "futures", `${symbol} must have left futures`);
    }
  });
});
