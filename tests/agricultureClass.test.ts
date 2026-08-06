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

  it("leaves livestock in futures — 55 setups cannot calibrate a class", () => {
    // The honest half of this change. Live cattle, feeder cattle and lean hogs
    // produced 55 filled setups across all three markets and all available
    // history: not one confidence bucket carries enough test fills to judge. A
    // livestock class could only be hand-authored, which is the exact failure
    // this class exists to escape. They stay in futures with thinness as the
    // stated reason, and remain reentry candidates when more data exists.
    for (const symbol of LIVESTOCK) {
      assert.equal(getAssetType(symbol), "futures", symbol);
    }
  });

  it("pins the derived confidence floor at 30, distinct from futures' 68", () => {
    // Monotone survival on 6922 filled setups: test expectancy positive at 30
    // and in every judgeable bucket above, 108 test fills at that floor.
    assert.equal(getCategoryCalibration("ZCUSX").confidenceThreshold, 30);
    assert.equal(getCategoryCalibration("ESUSD").confidenceThreshold, 68);
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

  it("carries no grain in the futures symbol list any longer", () => {
    // The bug this caught when it was written: removing the grains from futures
    // by first-match replace deleted them from the agriculture list instead,
    // leaving every grain classified futures while the new class sat empty.
    for (const symbol of GRAINS) {
      assert.notEqual(getAssetType(symbol), "futures", `${symbol} must have left futures`);
    }
  });
});
