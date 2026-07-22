import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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

function dailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
    high: 101,
    low: 99,
    open: 100,
    time: startTime - count * 86_400_000 + index * 86_400_000,
    volume: 10_000,
  }));
}

describe("replay sweep", () => {
  it("simulates a symbol across time and resolves outcomes from future bars", () => {
    const result = simulateSymbol({
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
