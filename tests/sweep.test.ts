import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  realizedRFromLegs,
  resampleBars,
  simulateSymbol,
  summarizeSweepOutcomes,
  type SweepOutcomeRecord,
} from "../supabase/functions/trade-analyzer/sweep.ts";
import type { ResolutionLeg } from "../supabase/functions/trade-analyzer/replay.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

// summarizeSweepOutcomes only reads .outcome and .realizedR (sweep.ts:373-395),
// but SweepOutcomeRecord carries 16 other fields describing the decision that
// produced it. This fills them with inert placeholders so fixtures below can
// stay focused on the two fields the function under test actually consumes.
function outcomeRecord(
  outcome: SweepOutcomeRecord["outcome"],
  realizedR: number,
): SweepOutcomeRecord {
  return {
    accepted: true,
    confidenceScore: 0,
    cotPercentile: null,
    cotStance: "neutral",
    newsPenalty: 0,
    outcome,
    realizedR,
    regime: "trend",
    rewardRisk: 0,
    sessionLabel: "",
    sessionPenalty: 0,
    side: "buy",
    stopProvenance: "",
    runnerProvenance: "",
    tp1Provenance: "",
    entryProvenance: "",
    time: 0,
    votes: [],
  };
}

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
    // Ladder geometry is pinned for the same reason: the shipped tight
    // runner rejects this fixture's synthetic payoffs outright.
    const result = simulateSymbol({
      calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
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
    // "Every generated setup must resolve deterministically on synthetic
    // data" is no longer a runtime check here: SweepOutcomeRecord.outcome is
    // typed Exclude<ResolvedOutcome, "pending"> (sweep.ts:49), so a record
    // that reached this array already can't hold "pending" — the compiler
    // proves it on every build, which is why `outcome.outcome !== "pending"`
    // stopped type-checking (TS2367, no overlap) the moment tests/ joined
    // the typecheck graph.
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
        result.rejections.notWarm +
        result.rejections.planRejected + result.rejections.belowThreshold +
        result.rejections.regimeBlocked + result.rejections.sessionBlocked +
        result.rejections.newsBlocked,
    );
  });

  it("marks regime-blocked setups as not accepted even in capture-all", () => {
    // The synthetic oscillator classifies as volatile chop, which every
    // class blocks by default. Capture-all still evaluates the records,
    // but none may carry accepted=true.
    // Geometry pinned like the resolution test above: capture-all still
    // requires the plan gate to produce records at all.
    const result = simulateSymbol({
      calibrationOverride: { runnerWindowShare: 1, tp1RiskShare: 0.8 },
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

  it("records stop provenance on every setup and reports cap binding", () => {
    // Geometry pinned like the resolution test; capture-all so gate policy
    // cannot hide records. A generous cap cannot bind, so provenance must be
    // structural (pivot or the 1.25-ATR volatility floor). The review window
    // is widened with the cap: an uncapped structural stop on this fixture
    // is ~4.4 units of required runner against a 3.7-unit 8-hour window, so
    // the ladder's feasibility filter would (correctly) reject every plan —
    // 2k's real clock buckets landed consensus on wider structure than the
    // old count-groups did, and the filter is the law here, not the subject.
    const uncapped = simulateSymbol({
      calibrationOverride: {
        defaultReviewHours: 72,
        maxStopAtrMultiplier: 50,
        runnerWindowShare: 1,
        tp1RiskShare: 0.8,
      },
      captureAll: true,
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(uncapped.outcomes.length > 0);
    for (const record of uncapped.outcomes) {
      assert.ok(
        record.stopProvenance === "pivot" ||
          record.stopProvenance === "volatility_floor",
        `unexpected provenance ${record.stopProvenance}`,
      );
    }

    // A cap tighter than the 1.25-ATR minimum width always clips: every
    // record must attribute its stop to the cap.
    const capped = simulateSymbol({
      calibrationOverride: {
        maxStopAtrMultiplier: 0.5,
        runnerWindowShare: 1,
        tp1RiskShare: 0.8,
      },
      captureAll: true,
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(capped.outcomes.length > 0);
    for (const record of capped.outcomes) {
      assert.equal(record.stopProvenance, "cap");
    }
  });

  it("emits per-method committee votes on every record", () => {
    const result = simulateSymbol({
      calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(result.outcomes.length > 0);
    for (const record of result.outcomes) {
      assert.ok(Array.isArray(record.votes) && record.votes.length > 0);
      for (const vote of record.votes) {
        assert.equal(typeof vote.n, "string");
        assert.ok(["buy", "sell", "block", "neutral"].includes(vote.d));
        assert.equal(typeof vote.s, "number");
      }
    }
  });

  it("splits acceptance-gate rejections by the failing gate", () => {
    // Impossible confidence bar: every consensus setup rejects on the
    // confidence gate, and the combined tally must equal the split sum.
    const result = simulateSymbol({
      calibrationOverride: {
        blockedRegimes: [],
        confidenceThreshold: 101,
        runnerWindowShare: 1,
        tp1RiskShare: 0.8,
      },
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(result.rejections.belowThreshold > 0);
    assert.equal(result.rejections.belowConfidence, result.rejections.belowThreshold);
    assert.equal(
      result.rejections.belowThreshold,
      result.rejections.belowConfidence + result.rejections.belowPayoff +
        result.rejections.regimeGated,
    );
  });

  it("resamples 15min bars into higher-timeframe bars", () => {
    // triangleBars start on an hour boundary (00:00 UTC = 20:00 New York),
    // so the wall-clock buckets coincide with the old count-of-four groups
    // here; tests/sweepDecisionContext.test.ts covers where they diverge.
    const bars = triangleBars(8);
    const hourly = resampleBars(bars, 60);

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
        result.rejections.notWarm +
        result.rejections.planRejected + result.rejections.belowThreshold +
        result.rejections.regimeBlocked + result.rejections.sessionBlocked +
        result.rejections.newsBlocked,
    );
  });

  it("accounts realized R from the legs that actually executed (2g), cost charged once (2d)", () => {
    // The ten R implementations this replaces reconstructed exits from the
    // plan's NOMINAL levels — every stop exactly at the stop, every fill at
    // the limit, cost nowhere. One accountant now reads the resolver's legs:
    // planned risk is the unit, actual prints are the numerator, and one
    // round trip of cost (2 x perLegCost: full entry plus half-exits or one
    // full exit) is charged in R space.
    const leg = (
      legName: ResolutionLeg["leg"],
      price: number,
      kind?: ResolutionLeg["kind"],
    ): ResolutionLeg => ({ leg: legName, price, time: 0, ...(kind && { kind }) });
    const account = (legs: ResolutionLeg[], side: "buy" | "sell" = "buy") =>
      realizedRFromLegs({ legs, perLegCost: 0.05, riskDistance: 2, side });

    // Ladder to the runner: 0.5x(101-100)/2 + 0.5x(105-100)/2 - 0.05.
    assert.equal(
      account([
        leg("entry", 100),
        leg("tp1", 101),
        leg("exit", 105, "take_profit"),
      ]),
      1.45,
    );
    // Full stop: -1R and the round trip on top.
    assert.equal(
      account([leg("entry", 100), leg("exit", 98, "stop_loss")]),
      -1.05,
    );
    // A gap through the stop realizes the open's worse print.
    assert.equal(
      account([leg("entry", 100), leg("exit", 97.4, "stop_loss")]),
      -1.35,
    );
    // A gap-improved fill earns its improvement.
    assert.equal(
      account([leg("entry", 99.5), leg("exit", 105, "take_profit")]),
      2.7,
    );
    // Breakeven runner after TP1 keeps only the banked half.
    assert.equal(
      account([
        leg("entry", 100),
        leg("tp1", 101),
        leg("exit", 100, "breakeven_stop"),
      ]),
      0.2,
    );
    // 2e: ambiguity is priced at the stop side by the resolver, so the
    // explicit -1 (and its cost) emerges from plain arithmetic.
    assert.equal(
      account([leg("entry", 100), leg("exit", 98, "ambiguous")]),
      -1.05,
    );
    // Expiry closes at the last print.
    assert.equal(
      account([leg("entry", 100), leg("exit", 100.7, "expiry")]),
      0.3,
    );
    // Sell mirror.
    assert.equal(
      account([leg("entry", 100), leg("exit", 102, "stop_loss")], "sell"),
      -1.05,
    );
    // No fill, no position, no cost.
    assert.equal(account([]), 0);
    // Degenerate risk cannot mint R.
    assert.equal(
      realizedRFromLegs({
        legs: [leg("entry", 100), leg("exit", 105, "take_profit")],
        perLegCost: 0.05,
        riskDistance: 0,
        side: "buy",
      }),
      0,
    );
  });

  it("wires the accountant into the simulator and retires the nominal-level reconstruction", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/sweep.ts",
      "utf8",
    );
    assert.match(source, /realizedR: realizedRFromLegs\(/);
    assert.match(source, /legs: evaluation\.legs/);
    assert.doesNotMatch(source, /function realizedRFor\(/);
  });

  it("summarizes expectancy in R across outcome types", () => {
    const summary = summarizeSweepOutcomes([
      outcomeRecord("take_profit", 2),
      outcomeRecord("tp1_partial", 0.5),
      outcomeRecord("stop_loss", -1),
      outcomeRecord("expired_in_profit", 0.3),
      outcomeRecord("unfilled", 0),
    ]);

    assert.equal(summary.total, 5);
    assert.equal(summary.filled, 4);
    assert.equal(summary.tp1HitRate, 0.5);
    assert.equal(summary.expectancyR, 0.45);
  });
});
