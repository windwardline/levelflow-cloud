import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resampleBars,
  simulateSymbol,
  summarizeSweepOutcomes,
} from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

// Mid-week anchor so weekly-close expiry logic stays out of the way.
const startTime = Date.parse("2026-06-15T00:00:00.000Z");

function triangleBars(count: number, period = 20, amplitude = 4): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    const half = period / 2;
    const value = position < half
      ? 98 + (amplitude / half) * position
      : 98 + amplitude - (amplitude / half) * (position - half);
    return {
      close: value,
      high: value + 0.3,
      low: value - 0.3,
      open: value,
      time: startTime + index * 900_000,
      volume: 1_000,
    };
  });
}

// Daily range ~10x the 15-minute ATR so window-feasibility math matches
// real intraday-to-daily volatility ratios.
function dailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
    high: 103.2,
    low: 96.8,
    open: 100,
    time: startTime - count * 86_400_000 + index * 86_400_000,
    volume: 10_000,
  }));
}

describe("replay sweep", () => {
  it("simulates a symbol across time and resolves outcomes from future bars", () => {
    // The synthetic oscillator registers as volatile chop; disable the
    // regime gate here — this test verifies outcome resolution, not policy.
    const result = simulateSymbol({
      calibrationOverride: { blockedRegimes: [] },
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });

    assert.ok(result.decisionPoints > 0);
    assert.ok(result.outcomes.length > 0);
    assert.equal(
      result.summary.total,
      result.outcomes.length,
    );
    // Every generated setup must resolve deterministically on synthetic data.
    for (const outcome of result.outcomes) {
      assert.ok(outcome.outcome !== "pending");
    }
  });

  it("blocks decision points inside an active high-impact news window", () => {
    // First decision point sits at warmup index 120: startTime + 120 bars.
    const firstDecisionTime = startTime + 120 * 900_000;
    const result = simulateSymbol({
      dailyBars: dailyBars(80),
      newsEvents: [
        { currency: "USD", impact: "high", time: firstDecisionTime },
      ],
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });

    assert.ok(result.rejections.newsBlocked >= 1);
    assert.equal(
      result.decisionPoints,
      result.outcomes.length + result.rejections.noConsensus +
        result.rejections.planRejected + result.rejections.belowThreshold +
        result.rejections.regimeBlocked + result.rejections.sessionBlocked +
        result.rejections.newsBlocked,
    );
  });

  it("marks regime-blocked setups as not accepted even in capture-all", () => {
    // The synthetic oscillator classifies as volatile chop, which every
    // class blocks by default. Capture-all still evaluates the records,
    // but none may carry accepted=true.
    const result = simulateSymbol({
      captureAll: true,
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });

    assert.ok(result.outcomes.length > 0);
    for (const record of result.outcomes) {
      assert.equal(record.accepted, false);
    }
  });

  it("resamples 15min bars into higher-timeframe bars", () => {
    const bars = triangleBars(8);
    const hourly = resampleBars(bars, 4);

    assert.equal(hourly.length, 2);
    assert.equal(hourly[0].open, bars[0].open);
    assert.equal(hourly[0].close, bars[3].close);
    assert.equal(hourly[0].high, Math.max(...bars.slice(0, 4).map((bar) => bar.high)));
    assert.equal(hourly[0].low, Math.min(...bars.slice(0, 4).map((bar) => bar.low)));
    assert.equal(hourly[0].time, bars[0].time);
    assert.equal(hourly[0].volume, 4_000);
  });

  it("reports why decision points produced no setup", () => {
    const result = simulateSymbol({
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });

    assert.equal(
      result.decisionPoints,
      result.outcomes.length + result.rejections.noConsensus +
        result.rejections.planRejected + result.rejections.belowThreshold +
        result.rejections.regimeBlocked + result.rejections.sessionBlocked +
        result.rejections.newsBlocked,
    );
  });

  it("summarizes expectancy in R across outcome types", () => {
    const summary = summarizeSweepOutcomes([
      { outcome: "take_profit", realizedR: 2 },
      { outcome: "tp1_partial", realizedR: 0.5 },
      { outcome: "stop_loss", realizedR: -1 },
      { outcome: "expired_in_profit", realizedR: 0.3 },
      { outcome: "unfilled", realizedR: 0 },
    ]);

    assert.equal(summary.total, 5);
    assert.equal(summary.filled, 4);
    assert.equal(summary.tp1HitRate, 0.5);
    assert.equal(summary.expectancyR, 0.45);
  });
});
