import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  resampleBars,
  simulateSymbol,
  summarizeSweepOutcomes,
  type SweepNewsEvent,
  type SweepOutcomeRecord,
} from "../supabase/functions/trade-analyzer/sweep.ts";
import {
  realizedRFromLegs,
  type ResolutionLeg,
} from "../supabase/functions/trade-analyzer/replay.ts";
import { treasuryVisibleAtMs } from "../supabase/functions/trade-analyzer/macroRates.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

// summarizeSweepOutcomes only reads .outcome and .realizedR (sweep.ts:373-395),
// but SweepOutcomeRecord carries every other field describing the decision that
// produced it. This fills them with inert placeholders so fixtures below can
// stay focused on the two fields the function under test actually consumes.
// Deliberately not a count: the record grows (executionScore joined it for E4),
// and a number here would read as accurate while being wrong. The typechecker
// is what keeps this fixture complete.
function outcomeRecord(
  outcome: SweepOutcomeRecord["outcome"],
  realizedR: number,
): SweepOutcomeRecord {
  return {
    accepted: true,
    confidenceScore: 0,
    cotPercentile: null,
    cotStance: "neutral",
    atr: 0,
    dailyAtr: 0,
    exitAtMs: 0,
    executionScore: 0,
    grossRewardRisk: 0,
    latestClose: 0,
    stopPivotDistance: null,
    trendStrength: 0,
    volatilityPercentile: 0,
    filledAtMs: null,
    legs: [],
    macroAdjustment: 0,
    macroStance: "unavailable",
    maxAdverseMove: null,
    maxFavorableMove: null,
    newsPenalty: 0,
    outcome,
    realizedR,
    resolutionIntervalMs: 900_000,
    riskDistance: 1,
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
    tp1Hit: false,
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

// Split each 15-minute bar into three coherent 5-minute sub-bars with the
// parent's full range confined to the MIDDLE sub-bar. A touch that the
// narrow first sub-bar cannot reach lands at parent.time + 300_000 — an
// instant the 15-minute grid cannot produce — so a fill or exit stamped
// there is unfakeable proof the 5-minute stream governed grading.
function fiveMinuteSplit(primary: Bar[]): Bar[] {
  return primary.flatMap((bar) => [
    {
      close: bar.open,
      high: bar.open + 0.05,
      low: bar.open - 0.05,
      open: bar.open,
      time: bar.time,
      volume: 300,
    },
    {
      close: bar.close,
      high: bar.high,
      low: bar.low,
      open: bar.open,
      time: bar.time + 300_000,
      volume: 400,
    },
    {
      close: bar.close,
      high: bar.close + 0.05,
      low: bar.close - 0.05,
      open: bar.close,
      time: bar.time + 600_000,
      volume: 300,
    },
  ]);
}

// A flat, self-coherent 5-minute series for the tier-admission pin: its
// content is irrelevant to the assertions — only where it BEGINS and ENDS
// relative to the decision instants matters.
function flatFiveMinute(firstTime: number, count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: 100,
    high: 100.3,
    low: 99.7,
    open: 100,
    time: firstTime + index * 300_000,
    volume: 500,
  }));
}

describe("replay sweep", () => {
  it("takes its resolution tier from the shared admission rule — reach-back, not non-emptiness (#362 round 3, finding 1)", () => {
    const base = {
      calibrationOverride: {
        blockedRegimes: [],
        runnerWindowShare: 1,
        tp1RiskShare: 0.8,
      },
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    };
    const baseline = simulateSymbol({ ...base });
    assert.ok(
      baseline.outcomes.some((record) => record.filledAtMs !== null),
      "fixture must fill on 15-minute physics for the pin to discriminate",
    );
    // Emit tier symmetry (R1b): every corpus row states the tier that
    // graded it, exactly as the live writers' feedback stamp does.
    assert.ok(
      baseline.outcomes.every((record) =>
        record.resolutionIntervalMs === 900_000
      ),
      "15-minute physics must stamp the 15-minute tier on every row",
    );

    // A 5-minute corpus that BEGINS after every decision instant. The
    // old admission (mere non-emptiness) graded every decision from an
    // empty slice — data absence wearing a market verdict, E2's own
    // defect. The shared rule refuses the tier, and grading is
    // indistinguishable from having no 5-minute series at all.
    const lateStart = simulateSymbol({
      ...base,
      fiveMinuteBars: flatFiveMinute(startTime + 700 * 900_000, 40),
    });
    assert.deepStrictEqual(lateStart.outcomes, baseline.outcomes);
    assert.deepStrictEqual(lateStart.rejections, baseline.rejections);

    // The companion: a corpus that DOES reach back is admitted, and the
    // 5-minute stream then governs grading — this one ends before any
    // decision's window opens, so every accepted setup resolves through
    // the no-bars branch and nothing fills, where the identical run on
    // 15-minute physics fills. (Forward coverage is the corpus door's
    // job — R1b's per-symbol density assertion; the admission rule pins
    // reach-back.)
    const reaching = simulateSymbol({
      ...base,
      fiveMinuteBars: flatFiveMinute(startTime, 10),
    });
    assert.ok(reaching.outcomes.length > 0);
    assert.ok(
      reaching.outcomes.every((record) => record.filledAtMs === null),
      "an admitted 5-minute stream must govern grading",
    );
    // These rows resolve through the resolver's no-bars branch, and the
    // emit carries both the admitted tier and the data-absence marker —
    // the exact columns a cohort read filters on (E2/R1b).
    assert.ok(
      reaching.outcomes.every((record) =>
        record.resolutionIntervalMs === 300_000 &&
        record.noBarsInReviewWindow === true
      ),
      "no-bars rows must carry the 5-minute tier and the absence marker",
    );

    // The positive physics (#362 round 4, smaller item — the short
    // corpus above proves admission, not use, since the old rule would
    // have produced the same all-unfilled shape): a corpus that reaches
    // back AND covers the window grades ON the 5-minute stream. The
    // discriminator is the graded content, not the stamp instants —
    // fills stamp at bar time and this fixture's 0.4-per-bar step
    // gap-throughs entries at the narrow first sub-bar, so instants
    // stay on the parent grid — but 3× finer event ordering changes the
    // legs, exits and realized R of every emitted row (measured when
    // this pin was written: 13 of 13 rows differ, including the emitted
    // count), where a refused tier reproduces the baseline exactly.
    const covered = simulateSymbol({
      ...base,
      fiveMinuteBars: fiveMinuteSplit(triangleBars(600)),
    });
    assert.ok(covered.outcomes.length > 0);
    assert.ok(
      covered.outcomes.some((record) => record.filledAtMs !== null),
      "a covering 5-minute stream must actually fill",
    );
    assert.ok(
      covered.outcomes.every((record) =>
        record.resolutionIntervalMs === 300_000
      ),
      "an admitted covering stream must stamp the 5-minute tier",
    );
    assert.notDeepStrictEqual(
      covered.outcomes,
      baseline.outcomes,
      "an admitted, covering 5-minute stream must grade differently from 15-minute physics",
    );
  });

  it("E6 (R1b): the historical Treasury curve steers each decision's score through the live arithmetic, at decision-time visibility", () => {
    const base = {
      calibrationOverride: {
        blockedRegimes: [],
        runnerWindowShare: 1,
        tp1RiskShare: 0.8,
      },
      captureAll: true,
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    };
    const without = simulateSymbol({ ...base });
    assert.ok(without.outcomes.length > 0);
    assert.ok(
      without.outcomes.every((record) =>
        record.macroAdjustment === 0 && record.macroStance === "unavailable"
      ),
      "no visible curve must score as the live outage does — adjustment 0, stance recorded so the zero is disambiguated downstream",
    );

    // Two rows fully visible before the corpus (+10 bps: rising, >=8 —
    // magnitude 2; EURUSD's rate-aligned side is sell), then a mid-corpus
    // reversal (-20 bps) that becomes visible only from the New York
    // midnight after its label date. Every row's expected adjustment is
    // derivable from its own decision instant, which pins the visibility
    // rule and the moving pointer end to end.
    const flipRow = {
      dateMs: startTime + 2 * 86_400_000,
      tenYear: 3.9,
      twoYear: 3.7,
    };
    const withCurve = simulateSymbol({
      ...base,
      treasuryRates: [
        { dateMs: startTime - 10 * 86_400_000, tenYear: 4.0, twoYear: 3.8 },
        { dateMs: startTime - 9 * 86_400_000, tenYear: 4.1, twoYear: 3.85 },
        flipRow,
      ],
    });
    const flipVisibleAt = treasuryVisibleAtMs(flipRow.dateMs);
    assert.equal(withCurve.outcomes.length, without.outcomes.length);
    let beforeFlip = 0;
    let afterFlip = 0;
    for (let index = 0; index < withCurve.outcomes.length; index += 1) {
      const record = withCurve.outcomes[index];
      const bare = without.outcomes[index];
      assert.equal(record.time, bare.time);
      const risingVisible = record.time < flipVisibleAt;
      const expected = (record.side === "sell" ? 2 : -2) *
        (risingVisible ? 1 : -1);
      assert.equal(record.macroAdjustment, expected);
      assert.equal(
        record.macroStance,
        expected > 0 ? "aligned" : "against",
      );
      assert.equal(
        record.confidenceScore - bare.confidenceScore,
        expected,
        "the adjustment must flow through the one scoring function",
      );
      if (risingVisible) beforeFlip += 1;
      else afterFlip += 1;
    }
    assert.ok(
      beforeFlip > 0 && afterFlip > 0,
      "the fixture must exercise both sides of the visibility flip",
    );
  });

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
        {
          currency: "USD",
          impact: "high",
          name: "Nonfarm Payrolls",
          time: firstDecisionTime,
        },
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
        result.rejections.planRejected + result.rejections.unresolvable +
        result.rejections.belowThreshold +
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
    // #364 round 4, finding 3 — the structural argument behind the
    // round-3 decline, executed: rejections.regimeGated is ZERO in both
    // modes. In capture-all (this run) gated decisions EMIT instead of
    // tallying; in gate mode (below) blocked regimes exit at the
    // pre-plan gate as regimeBlocked. That is what keeps the driver's
    // regimeBlk column a pure pre-geometry block and the amendment-25
    // starvation gate's reachedGeometry subtraction honest — deleting
    // the pre-plan gate's !captureAll guard would flip this with every
    // other test still green, so it is pinned here.
    assert.equal(result.rejections.regimeGated, 0);
    const gateMode = simulateSymbol({
      calibrationOverride: { runnerWindowShare: 1, tp1RiskShare: 0.8 },
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(gateMode.rejections.regimeBlocked > 0);
    assert.equal(gateMode.rejections.regimeGated, 0);
  });

  it("leaves a window shorter than the stream's first slot UNMARKED — the sweep's stream starts one decision bar late (#364 round 4, finding 1)", () => {
    // A 24-minute review window sits between one and two 15-minute bar
    // spans: the decision bar's own slot fits inside it, but FR-5's
    // stream begins one decision bar after creation, so the first slot
    // the resolver could ever be handed needs a 30-minute window. Every
    // decision here resolves unfilled through the no-bars branch, and
    // none may carry the marker — computed from createdAt alone, all of
    // them would (the run without the wiring marks all 12), one
    // weekly-clamp artifact per symbol writ large. The daily range is
    // widened so expectedWindowMove clears the ladder inside 24 minutes;
    // the shipped 6.4-range fixture is (correctly) plan-starved at this
    // window, which would make the pin vacuous.
    const wideDaily = dailyBars(80).map((bar) => ({
      ...bar,
      high: 115,
      low: 85,
    }));
    const clamped = simulateSymbol({
      calibrationOverride: {
        blockedRegimes: [],
        defaultReviewHours: 0.4,
        runnerWindowShare: 1,
        tp1RiskShare: 0.8,
      },
      captureAll: true,
      dailyBars: wideDaily,
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(clamped.outcomes.length > 0);
    for (const record of clamped.outcomes) {
      assert.equal(record.outcome, "unfilled");
      assert.equal(record.noBarsInReviewWindow, undefined);
    }
    assert.equal(clamped.summary.dataAbsent, 0);
    assert.equal(clamped.summary.unfilled, clamped.outcomes.length);

    // Executed control (#364 round 5, smaller): widen the window by ONE
    // stream slot — 30 minutes — and the same fixture grades through the
    // stream (fills happen), so the 24-minute run's all-unfilled shape
    // above is observed to come from the no-bars branch, not from a
    // fixture that quietly stopped reaching it.
    const oneSlot = simulateSymbol({
      calibrationOverride: {
        blockedRegimes: [],
        defaultReviewHours: 0.5,
        runnerWindowShare: 1,
        tp1RiskShare: 0.8,
      },
      captureAll: true,
      dailyBars: wideDaily,
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(
      oneSlot.outcomes.some((record) => record.filledAtMs !== null),
      "one admissible stream slot must grade — the clamped run's shape is the branch, not the fixture",
    );
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

  it("carries the resolver's evidence on every record — legs, excursions, exit clock (4b's input)", () => {
    // The resolver computes gap-aware legs, both excursion statistics and the
    // exit instant, and the emit used to drop all of them — the map's
    // "captured and simply never read". 4b's lenses (breakeven tax,
    // winner-MAE, time-to-resolution) read them from the corpus directly.
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
      assert.ok(Array.isArray(record.legs));
      assert.ok(Number.isFinite(record.exitAtMs));
      assert.equal(typeof record.tp1Hit, "boolean");
      if (record.outcome !== "unfilled") {
        assert.equal(record.legs[0]?.leg, "entry");
        assert.ok(Number.isFinite(record.filledAtMs));
        assert.ok(Number.isFinite(record.maxAdverseMove));
        assert.ok(Number.isFinite(record.maxFavorableMove));
        assert.ok(record.riskDistance > 0);
      }
    }
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
        result.rejections.planRejected + result.rejections.unresolvable +
        result.rejections.belowThreshold +
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

describe("the rejection ledger (P1) — an account, not a tally", () => {
  // A rejected decision emits no outcome row, so before 2026-08-24 the
  // engine's entire record of what it declined was eleven integers per run.
  // Four of the eleven measured sweep-live divergences are sweep-RESTRICTIVE,
  // which means their populations were not measurable from the corpus at all:
  // a permissive divergence leaves rows a reader can prune, a restrictive one
  // leaves an incremented integer.
  const run = () =>
    simulateSymbol({
      calibrationOverride: {
        blockedRegimes: [],
        runnerWindowShare: 1,
        tp1RiskShare: 0.8,
      },
      dailyBars: dailyBars(80),
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });

  it("records one ledger row per rejected decision, and no row for the aggregate", () => {
    const result = run();
    const counters = result.rejections as unknown as Record<string, number>;
    // belowThreshold counts the three acceptance-gate branches; a ledger row
    // for it would double-count each of them.
    const distinct = Object.entries(counters)
      .filter(([reason]) => reason !== "belowThreshold")
      .reduce((total, [, count]) => total + count, 0);
    assert.equal(
      result.rejectionLedger.length,
      distinct,
      "one row per rejection, aggregates excluded",
    );
    assert.equal(
      counters.belowThreshold,
      counters.belowConfidence + counters.belowPayoff + counters.regimeGated,
      "belowThreshold must remain exactly the sum of its three branches, or " +
        "excluding it from the ledger drops real rejections",
    );
  });

  it("uses only reasons that are counter keys — the enum is DERIVED", () => {
    // Hand-listing the reasons is how the counter struct itself froze:
    // regimeGated arrived later as an else-branch and no reader knew to expect
    // it. The reason type is `keyof typeof rejections`, so adding a counter
    // creates the reason and there is no second list to forget.
    const result = run();
    const keys = new Set(Object.keys(result.rejections));
    for (const row of result.rejectionLedger) {
      assert.ok(
        keys.has(row.reason),
        `${row.reason} is not a counter key — the ledger and the counters have ` +
          `diverged`,
      );
    }
  });

  it("stamps every ledger row with a decision instant inside the run", () => {
    const result = run();
    for (const row of result.rejectionLedger) {
      assert.equal(typeof row.time, "number");
      assert.ok(Number.isFinite(row.time) && row.time > 0);
    }
  });

  it("routes every rejection site through the recorder, in source", () => {
    // The counter and the ledger cannot be allowed to drift, so nothing may
    // increment a counter directly except the one aggregate.
    const source = readFileSync(
      "supabase/functions/trade-analyzer/sweep.ts",
      "utf8",
    );
    const direct = [...source.matchAll(/rejections\.(\w+) \+= 1/g)]
      .map((match) => match[1]);
    assert.deepEqual(
      direct,
      ["belowThreshold"],
      "only the aggregate may increment directly; every distinct reason goes " +
        "through reject() so the counter and the ledger move together",
    );
    assert.match(
      source,
      /const reject = \(reason: keyof typeof rejections, atMs: number\)/,
      "the reason type must stay DERIVED from the counter struct",
    );

    // AND THE AGGREGATE NEVER REACHES THE LEDGER. This is pinned in SOURCE
    // rather than by execution, deliberately and with the limit stated: the
    // fixture above reaches only noConsensus and sessionBlocked, so the three
    // acceptance-gate branches are not exercised at run time and a mutation
    // swapping one of them for the aggregate is invisible to any assertion
    // over a run. Statically it is not.
    const reasons = [...source.matchAll(/reject\("(\w+)"/g)]
      .map((match) => match[1]);
    assert.ok(
      !reasons.includes("belowThreshold"),
      "belowThreshold counts the three acceptance-gate branches; a ledger row " +
        "for it double-counts every one of them",
    );
    // Every distinct counter key must have a site. This is what makes the
    // enum derived in practice rather than only in the type: adding a counter
    // and forgetting its reject() call fails here.
    const counterKeys = [
      ...source.slice(source.indexOf("const rejections = {"))
        .slice(0, 400)
        .matchAll(/^\s{4}(\w+): 0,$/gm),
    ].map((match) => match[1]);
    assert.ok(counterKeys.length >= 11, `found ${counterKeys.length} counters`);
    const missing = counterKeys
      .filter((key) => key !== "belowThreshold")
      .filter((key) => !reasons.includes(key));
    assert.deepEqual(
      missing,
      [],
      `these counters have no reject() site, so they can be incremented ` +
        `without ever appearing in the ledger: ${missing.join(", ")}`,
    );
  });
});

describe("a calendar collapse changes rejections, not just penalties", () => {
  // The count is load-bearing TWICE. calculateNewsPenaltyUnits sums per
  // event, and `activeNews.some(isBlockingNewsEvent)` rejects the setup
  // outright when any active scheduled event is high-impact. So an event
  // discarded by a time-only merge key does not merely under-penalise — it
  // produces a corpus row the live engine would have refused as newsBlocked.
  //
  // This is what makes the collapse a corpus defect rather than a magnitude
  // error, and it is why the fix had to land before the one re-sweep.
  // The module-level startTime the bar fixtures are built from; the first
  // decision point sits at warmup index 120.
  const firstDecisionTime = startTime + 120 * 900_000;

  const runWith = (newsEvents: SweepNewsEvent[]) =>
    simulateSymbol({
      dailyBars: dailyBars(80),
      newsEvents,
      primaryBars: triangleBars(600),
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });

  it("blocks on a high-impact event that a time-only key would have discarded", () => {
    // Two USD events at ONE instant. Under a time-only merge the medium one
    // could be the survivor; under the composite key both are present and the
    // high-impact one blocks.
    const bothKept = runWith([
      {
        currency: "USD",
        impact: "medium",
        name: "Initial Jobless Claims",
        time: firstDecisionTime,
      },
      {
        currency: "USD",
        impact: "high",
        name: "Nonfarm Payrolls",
        time: firstDecisionTime,
      },
    ]);
    const collapsed = runWith([
      {
        currency: "USD",
        impact: "medium",
        name: "Initial Jobless Claims",
        time: firstDecisionTime,
      },
    ]);
    assert.ok(
      bothKept.rejections.newsBlocked > collapsed.rejections.newsBlocked,
      `keeping the high-impact event must block at least one more decision: ` +
        `${bothKept.rejections.newsBlocked} vs ${collapsed.rejections.newsBlocked}`,
    );
  });
});
