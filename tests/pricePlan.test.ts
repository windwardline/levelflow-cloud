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
  runnerWindowShare: 1,
  tp1AtrMultiplier: 0.8,
  tp1RiskShare: 0.8,
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

  it("falls back to the expected-move objective when no structural level qualifies", () => {
    // No pivot sits in the reachable band, so the runner is the window's own
    // expected-move objective: entry + runnerWindowShare * expectedWindowMove.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [90, 95, 99],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.runnerTarget, 105);
  });

  it("rejects the setup when the payoff floor is unreachable inside the window", () => {
    // minimumRunnerDistance = 1.9 * risk 3 = 5.7 exceeds the window's
    // reachable move of 5; the setup is rejected, not stretched.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104, 108, 120],
      riskDistance: 3,
      side: "buy",
    });

    assert.equal(ladder, null);
  });

  it("keeps the runner inside the reachable band even when structure sits farther", () => {
    // The only pivots beyond the floor are outside the reachable band, so the
    // runner caps at the expected-move objective instead of chasing them.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [108, 112],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.runnerTarget, 105);
  });

  it("banks a risk-scaled TP1 rather than a fixed ATR crumb", () => {
    // tp1 = max(risk 4 * 0.8 = 3.2, atr 2 * 0.8 = 1.6) capped by
    // 0.6 * expectedWindowMove 5 = 3.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: { ...ladderCalibration, minimumTargetRewardRisk: 1.2 },
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104.9],
      riskDistance: 4,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.takeProfit1, 103);
  });

  it("skips past too-close pivots to the nearest qualifying runner", () => {
    // Nearest pivot 102.5 is inside the 1.9 * risk 2 = 3.8 minimum distance;
    // the runner must advance to 104, the nearest level that qualifies.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [102.5, 104, 108],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.runnerTarget, 104);
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
    // Daily range is ~10x the 15-minute ATR, matching real intraday-to-daily
    // volatility ratios, so window-feasibility math behaves like production.
    const daily: Bar[] = Array.from({ length: 80 }, (_, index) => ({
      close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
      high: 103.2,
      low: 96.8,
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

// stopLogic was a constant asserting the stop sat "beyond the nearest confirmed
// swing pivot with a volatility buffer" on EVERY setup. It does not: structural
// candidates are floored at 1.25 ATR while the cap is maxStopAtrMultiplier × ATR
// — 1.0 in seven of eight classes — so the cap binds unconditionally and the
// pivot never wins outside metals. The sentence was false wherever it mattered,
// while stopProvenance sat two lines away recording the truth.
//
// It is now derived from that provenance, so the description cannot outlive the
// mechanism. These assert the pairing rather than any one wording.
describe("stopLogic describes what actually set the stop", () => {
  const cases: Array<[string, string]> = [
    ["cap", "volatility ceiling"],
    ["pivot", "swing pivot"],
    ["volatility_floor", "minimum volatility width"],
  ];

  it("says the ceiling bound it when the ceiling bound it", () => {
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(plan);
    const expected = cases.find(([provenance]) =>
      provenance === plan.stopProvenance
    );
    assert.ok(expected, `unknown provenance ${plan.stopProvenance}`);
    assert.match(plan.stopLogic, new RegExp(expected![1]));
  });

  it("never claims a pivot anchored a stop the cap set", () => {
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(plan);
    if (plan.stopProvenance !== "pivot") {
      assert.doesNotMatch(
        plan.stopLogic,
        /swing pivot/,
        "a stop the pivot did not set must not be described as pivot-anchored",
      );
    }
  });
});
});

