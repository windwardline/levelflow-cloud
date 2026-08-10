import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  directionalBias,
  ema,
  relativeStrengthIndex,
} from "../supabase/functions/trade-analyzer/indicators.ts";
import {
  classifyRegime,
  runStrategyCommittee,
} from "../supabase/functions/trade-analyzer/strategies.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar, MarketContext, Timeframe } from "../supabase/functions/trade-analyzer/types.ts";

// 2m/2n (2026-08-09): an indicator that cannot be computed must abstain,
// never improvise. ema() seeded on the first sample value and returned 0 —
// a PRICE, not a sentinel — for empty input; RSI returned 100 on a frozen
// series because `losses === 0` catches gains === 0 too, firing
// opposite-direction votes from range-reversion (overbought → sell) and
// momentum (rsi > 55 → buy) on the same degenerate input. Abstention
// propagates: null EMAs make directionalBias neutral, a regime that cannot
// form makes the whole decision refuse — counted in its own `notWarm`
// bucket so decision arithmetic still closes, because the accepted-setup
// count moves and no existing corpus can validate this change.

function bar(time: number, value: number): Bar {
  return {
    close: value,
    high: value + 0.5,
    low: value - 0.5,
    open: value,
    time,
    volume: 1_000,
  };
}

const start = Date.UTC(2026, 5, 15);

function risingBars(count: number, stepMs = 86_400_000): Bar[] {
  return Array.from(
    { length: count },
    (_, index) => bar(start + index * stepMs, 100 + index * 0.5),
  );
}

function frozenBars(count: number, stepMs = 900_000): Bar[] {
  return Array.from({ length: count }, (_, index) => bar(start + index * stepMs, 100));
}

describe("ema — a seed is an average, an absence is null (2m)", () => {
  it("abstains below its period instead of degrading into a biased guess", () => {
    assert.equal(ema([100], 2), null);
    assert.equal(ema([], 20), null);
  });

  it("seeds on the simple average of the first period, then smooths", () => {
    // period 2 over [1, 3, 5]: seed = avg(1,3) = 2; smooth 5 with k = 2/3:
    // 5 * 2/3 + 2 * 1/3 = 4. The old first-value seed gave a different
    // number for the same series.
    assert.equal(ema([1, 3, 5], 2), 4);
  });

  it("equals the simple average when the series is exactly one period long", () => {
    assert.equal(ema([2, 4], 2), 3);
  });
});

describe("relative strength — frozen is unknown, not overbought (2m)", () => {
  it("abstains on a frozen series", () => {
    assert.equal(
      relativeStrengthIndex(frozenBars(20), 14),
      null,
    );
  });

  it("abstains below its period", () => {
    assert.equal(relativeStrengthIndex(risingBars(5), 14), null);
  });

  it("still reads 100 on genuine all-gains input", () => {
    assert.equal(relativeStrengthIndex(risingBars(16), 14), 100);
  });

  it("reads 50 on balanced alternation", () => {
    const closes = Array.from(
      { length: 15 },
      (_, index) => bar(start + index * 900_000, index % 2 === 0 ? 100 : 101),
    );
    assert.equal(relativeStrengthIndex(closes, 14), 50);
  });
});

describe("directionalBias — no bias from an unwarm slow leg (2m)", () => {
  it("abstains under 50 bars even on a monotone rise", () => {
    assert.equal(directionalBias(risingBars(45)), "neutral");
  });

  it("signals once both EMAs are warm", () => {
    assert.equal(directionalBias(risingBars(60)), "buy");
  });
});

describe("regime — refuses to classify what it cannot measure (2n)", () => {
  it("returns null when the daily series cannot warm the slow EMA", () => {
    const daily = risingBars(45);
    assert.equal(classifyRegime(contextFor(daily, frozenBars(300))), null);
  });

  it("classifies once warm", () => {
    const regime = classifyRegime(contextFor(risingBars(80), frozenBars(300)));
    assert.notEqual(regime, null);
  });
});

describe("the committee on degenerate input — no opposite pair from one frozen series (2m)", () => {
  it("keeps range-reversion and momentum neutral when RSI abstains", () => {
    const market = contextFor(risingBars(80), frozenBars(300));
    const regime = classifyRegime(market);
    assert.ok(regime);
    const votes = runStrategyCommittee("EURUSD", market, regime!);
    for (const vote of votes) {
      if (
        vote.name.startsWith("momentum_") ||
        vote.name === "range_mean_reversion"
      ) {
        assert.equal(
          vote.direction,
          "neutral",
          `${vote.name} voted ${vote.direction} on a frozen series`,
        );
      }
    }
  });
});

describe("notWarm — the decision arithmetic still closes (2n)", () => {
  it("counts regime-unwarm decisions in their own bucket", () => {
    // 45 weekday-stamped daily bars: past the sweep's 40-bar floor, short
    // of the 50 the slow EMA needs — every decision refuses as notWarm.
    const daily: Bar[] = [];
    let day = Date.UTC(2026, 3, 1, 4);
    while (daily.length < 45) {
      const weekday = new Date(day).getUTCDay();
      if (weekday !== 0 && weekday !== 6) {
        daily.push(bar(day, 100 + daily.length * 0.1));
      }
      day += 86_400_000;
    }
    const primary = Array.from(
      { length: 600 },
      (_, index) =>
        bar(Date.UTC(2026, 5, 15) + index * 900_000, 100 + (index % 20) * 0.2),
    );
    const result = simulateSymbol({
      dailyBars: daily,
      primaryBars: primary,
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(result.decisionPoints > 0);
    assert.ok(result.rejections.notWarm > 0);
    assert.equal(result.outcomes.length, 0);
    assert.equal(
      result.rejections.notWarm,
      result.decisionPoints - result.rejections.sessionBlocked -
        result.rejections.newsBlocked,
    );
  });

  it("appears in the sweep driver's table so a thin corpus cannot hide", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(script, /notWarm/);
  });

  it("refuses in the live analyzer through the same shared engine", () => {
    const analyzer = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    assert.match(analyzer, /if \(!regime\)/);
  });
});

function contextFor(daily: Bar[], primary: Bar[]): MarketContext {
  const timeframes: Partial<Record<Timeframe, Bar[]>> = {
    "15min": primary,
    "1day": daily,
  };
  return {
    availableTimeframes: ["1day", "15min"],
    daily,
    latest: primary.at(-1)!,
    latestTimeframe: "15min",
    primary,
    primaryTimeframe: "15min",
    providerWarnings: [],
    quote: null,
    timeframes,
  };
}
