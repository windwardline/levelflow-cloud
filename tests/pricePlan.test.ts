import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLadderTargets,
  buildPricePlan,
} from "../supabase/functions/trade-analyzer/pricePlan.ts";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import type {
  Bar,
  MarketContext,
  Regime,
} from "../supabase/functions/trade-analyzer/types.ts";

const ladderCalibration = {
  defaultReviewHours: 6,
  minimumTargetRewardRisk: 1.9,
  tp1AtrMultiplier: 0.8,
};

describe("ladder targets", () => {
  it("places TP1 a window-scaled ATR multiple from entry and the runner at the nearest pivot", () => {
    // expectedWindowMove = dailyAtr 10 * sqrt(6h / 24h) = 5
    // tp1Distance = min(0.8 * atr 2, 0.6 * 5) = 1.6
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [98, 104, 108],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.takeProfit1, 101.6);
    assert.equal(ladder.runnerTarget, 104);
    assert.equal(ladder.expectedWindowMove, 5);
  });

  it("caps TP1 at the expected move the review window can deliver", () => {
    // Raw ATR distance 0.8 * 6 = 4.8 exceeds 0.6 * expectedWindowMove 5 = 3.
    const ladder = buildLadderTargets({
      atr: 6,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104.5, 110],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.takeProfit1, 103);
  });

  it("rejects the setup instead of stretching when no pivot lies beyond entry", () => {
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [90, 95, 99],
      riskDistance: 2,
      side: "buy",
    });

    assert.equal(ladder, null);
  });

  it("rejects the setup when the runner cannot clear the minimum reward risk", () => {
    // Nearest pivot is 104 (4 away); 1.9 * risk 3 = 5.7 required.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104],
      riskDistance: 3,
      side: "buy",
    });

    assert.equal(ladder, null);
  });

  it("rejects the setup when TP1 would sit at or beyond the runner", () => {
    // tp1Distance = 1.6, but the only valid pivot is 101 (1 away).
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: { ...ladderCalibration, minimumTargetRewardRisk: 0.4 },
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [101],
      riskDistance: 2,
      side: "buy",
    });

    assert.equal(ladder, null);
  });

  it("mirrors the ladder for sells", () => {
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104, 96, 92],
      riskDistance: 2,
      side: "sell",
    });

    assert.ok(ladder);
    assert.equal(ladder.takeProfit1, 98.4);
    assert.equal(ladder.runnerTarget, 96);
  });
});

describe("price plan integration", () => {
  // Triangle wave oscillating 98..102 so pivot highs sit near 102.3 and pivot
  // lows near 97.7, with one early spike low to 90 that must NOT anchor the stop.
  function syntheticMarket(): MarketContext {
    const primary: Bar[] = [];
    for (let index = 0; index < 120; index += 1) {
      const position = index % 20;
      const value = position < 10
        ? 98 + 0.4 * position
        : 102 - 0.4 * (position - 10);
      const spike = index === 60;
      primary.push({
        close: value,
        high: value + 0.3,
        low: spike ? 90 : value - 0.3,
        open: value,
        time: index * 900_000,
        volume: 1_000,
      });
    }
    const daily: Bar[] = Array.from({ length: 80 }, (_, index) => ({
      close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
      high: 101,
      low: 99,
      open: 100,
      time: index * 86_400_000,
      volume: 10_000,
    }));
    const latest = primary.at(-1)!;

    return {
      availableTimeframes: ["1day", "1hour", "15min"],
      daily,
      latest,
      latestTimeframe: "15min",
      primary,
      primaryTimeframe: "15min",
      providerWarnings: [],
      quote: null,
      timeframes: { "15min": primary, "1day": daily },
    };
  }

  const regime: Regime = {
    bias: "neutral",
    name: "range",
    rationale: "test",
    trendStrength: 0.5,
    volatilityPercentile: 0.5,
  };

  it("emits a ladder with TP1 between entry and the runner target", () => {
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );

    assert.ok(plan);
    assert.ok(plan.takeProfit1 > plan.entryPrice);
    assert.ok(plan.takeProfit1 < plan.takeProfit);
  });

  it("anchors the stop to the nearest pivot low, not the window extreme", () => {
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );

    assert.ok(plan);
    // Old geometry: stop below the 90 spike minus a buffer. New geometry:
    // stop hangs off the nearest confirmed pivot low near 97.7.
    assert.ok(plan.stopLoss > 92);
    assert.ok(plan.stopLoss < plan.entryPrice);
  });

  it("keeps indices entry offsets shallow enough to fill in a cash session", () => {
    // Production data: 15 of 15 index setups expired unfilled with offsets
    // near 0.5 ATR. Index entries must sit close to the market.
    const calibration = getCategoryCalibration("SP");

    assert.ok(calibration.entryOffsetDefault <= 0.2);
    assert.ok(calibration.entryOffsetTrend <= 0.15);
  });

  it("defines a tp1 multiplier for every asset category", () => {
    for (
      const symbol of ["BTCUSD", "WTI", "EURUSD", "ESUSD", "SP", "XAUUSD"]
    ) {
      const calibration = getCategoryCalibration(symbol);
      assert.ok(
        calibration.tp1AtrMultiplier > 0 &&
          calibration.tp1AtrMultiplier <= 1.5,
        `tp1AtrMultiplier missing or out of range for ${symbol}`,
      );
    }
  });
});
