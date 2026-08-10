import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { buildPricePlan } from "../supabase/functions/trade-analyzer/pricePlan.ts";
import { scoreSetupConfidence } from "../supabase/functions/trade-analyzer/scoring.ts";
import {
  classifyRegime,
  runStrategyCommittee,
  scoreConsensus,
} from "../supabase/functions/trade-analyzer/strategies.ts";
import type {
  Bar,
  MarketContext,
  Timeframe,
} from "../supabase/functions/trade-analyzer/types.ts";

// analyzeSetup ran classifyRegime + runStrategyCommittee + scoreConsensus, and
// when it returned null explainNoSetup ran all three again to write the
// diagnostics — 45 of the 50 symbols on a live open-market scan, inside a 2s
// CPU budget that half of those scans blew (HTTP 546, `CPU Time exceeded`,
// 2026-08-02). The committee now runs once and both readers are handed the
// result.
//
// That is only free if one pass and two passes cannot disagree. These four
// functions are pure — calibration.ts is frozen tables, strategies.ts and
// scoring.ts carry no module state, no clock and no randomness — so this
// asserts it on real fixtures rather than trusting the reading.

const ANALYZER = readFileSync(
  "supabase/functions/trade-analyzer/index.ts",
  "utf8",
);

function series(count: number, stepMs: number, seed: number): Bar[] {
  const out: Bar[] = [];
  let price = 100 + seed;
  for (let index = 0; index < count; index += 1) {
    price += Math.sin((index + seed) / 13) * 0.6 + Math.cos(index / 31) * 0.35;
    out.push({
      close: price + 0.05,
      high: price + 0.55,
      low: price - 0.5,
      open: price,
      time: Date.UTC(2026, 0, 1) + index * stepMs,
      volume: 5_000 + index,
    });
  }
  return out;
}

function marketFixture(seed: number): MarketContext {
  const timeframes: Partial<Record<Timeframe, Bar[]>> = {
    "1day": series(1_000, 86_400_000, seed),
    "4hour": series(771, 14_400_000, seed + 1),
    "1hour": series(1_543, 3_600_000, seed + 2),
    "15min": series(3_000, 900_000, seed + 3),
    "5min": series(2_400, 300_000, seed + 4),
    "1min": series(1_800, 60_000, seed + 5),
  };
  return {
    availableTimeframes: Object.keys(timeframes) as Timeframe[],
    daily: timeframes["1day"]!,
    latest: timeframes["1min"]!.at(-1)!,
    latestTimeframe: "1min",
    primary: timeframes["15min"]!,
    primaryTimeframe: "15min",
    providerWarnings: [],
    quote: null,
    timeframes,
  };
}

// index.ts's analyzeMarket, which is what both readers now share. These
// fixtures carry 1,000 daily bars, so the 2n not-warm branch (regime null,
// empty committee) never fires here; the non-null assertion keeps the
// mirror honest about that assumption.
function analyzeMarket(symbol: string, market: MarketContext) {
  const calibration = getCategoryCalibration(symbol);
  const regime = classifyRegime(market);
  if (!regime) {
    throw new Error(`${symbol}: fixture unexpectedly not warm`);
  }
  const votes = runStrategyCommittee(symbol, market, regime);
  return {
    calibration,
    consensus: scoreConsensus(votes, regime),
    regime,
    votes,
  };
}

// explainNoSetup's diagnostics, rebuilt from a given analysis with the exact
// templates index.ts uses. weightAdjustment is the one input that comes from a
// DB read rather than the analysis, so it is passed in and held constant.
function diagnosticsFor(
  symbol: string,
  market: MarketContext,
  analysis: ReturnType<typeof analyzeMarket>,
  weightAdjustment: number,
) {
  const { calibration, consensus, regime } = analysis;
  const diagnostics: string[] = [];

  if (calibration.blockedRegimes?.includes(regime.name)) {
    diagnostics.push(
      "Market conditions are in elevated-volatility chop; Levelflow does not open new setups in this regime.",
    );
  }

  if (!consensus.side) {
    diagnostics.push(
      `No clear direction passed review: buy ${consensus.buyScore}, sell ${consensus.sellScore}, block ${consensus.blockScore}.`,
    );
    return diagnostics;
  }

  const pricePlan = buildPricePlan(
    consensus.side,
    symbol,
    market,
    regime,
    calibration,
  );
  const scoreBreakdown = scoreSetupConfidence({
    availableTimeframeCount: market.availableTimeframes.length,
    calibration,
    consensusScore: consensus.score,
    executionPenalty: pricePlan?.executionQuality.confidencePenalty ?? 0,
    macroAdjustment: 0,
    newsPenaltyUnits: 0,
    providerWarningCount: market.providerWarnings.length,
    regimeAdjustment: calibration.regimeScoreAdjustments?.[regime.name] ?? 0,
    sessionPenalty: 0,
    sideAdjustment: calibration.sideScoreAdjustments?.[consensus.side] ?? 0,
    weightAdjustment,
  });

  diagnostics.push(
    `The current ${consensus.side} setup scored ${scoreBreakdown.confidenceScore}; Levelflow requires ${calibration.confidenceThreshold} or higher for this market.`,
  );
  if (!pricePlan) {
    diagnostics.push(
      "Limit entry failed price validation, so no limit setup was shown.",
    );
  } else if (pricePlan.rewardRisk < calibration.minRewardRisk) {
    diagnostics.push(
      `Payoff was ${
        pricePlan.rewardRisk.toFixed(2)
      }x; Levelflow requires at least ${
        calibration.minRewardRisk.toFixed(2)
      }x for this market.`,
    );
  } else if (pricePlan.executionQuality.confidencePenalty > 0) {
    diagnostics.push(
      `Estimated spread and slippage reduced the setup score by ${pricePlan.executionQuality.confidencePenalty}.`,
    );
  }
  return diagnostics;
}

const SYMBOLS = ["EURUSD", "XAUUSD", "BTCUSD", "ESUSD", "WTI", "GBPJPY"];
const FIXTURES = SYMBOLS.map((symbol, index) => ({
  market: marketFixture(index * 7),
  symbol,
}));

describe("the committee reads a market the same way every time", () => {
  it("returns a deep-equal analysis on repeat passes", () => {
    for (const { market, symbol } of FIXTURES) {
      assert.deepStrictEqual(
        analyzeMarket(symbol, market),
        analyzeMarket(symbol, market),
        symbol,
      );
    }
  });

  it("scores every vote identically, down to the float", () => {
    for (const { market, symbol } of FIXTURES) {
      const first = analyzeMarket(symbol, market);
      const second = analyzeMarket(symbol, market);
      assert.equal(first.votes.length, second.votes.length);
      assert.equal(first.votes.length > 0, true, `${symbol} cast no votes`);
      for (const [index, vote] of first.votes.entries()) {
        assert.equal(Object.is(vote.score, second.votes[index].score), true);
        assert.equal(vote.direction, second.votes[index].direction);
        assert.equal(vote.rationale, second.votes[index].rationale);
      }
      assert.equal(
        Object.is(first.consensus.score, second.consensus.score),
        true,
      );
      assert.equal(
        Object.is(
          first.regime.volatilityPercentile,
          second.regime.volatilityPercentile,
        ),
        true,
      );
    }
  });
});

describe("one shared pass writes the diagnostics two passes wrote", () => {
  it("produces identical text for every fixture", () => {
    for (const { market, symbol } of FIXTURES) {
      // What the code did before: analyzeSetup's pass, then a second pass
      // inside explainNoSetup. What it does now: one pass, read twice.
      const twoPasses = diagnosticsFor(
        symbol,
        market,
        analyzeMarket(symbol, market),
        0,
      );
      const shared = analyzeMarket(symbol, market);
      const onePass = diagnosticsFor(symbol, market, shared, 0);
      assert.deepStrictEqual(onePass, twoPasses, symbol);
      assert.equal(onePass.length > 0, true, `${symbol} explained nothing`);
    }
  });

  it("covers a fixture that genuinely reaches no setup", () => {
    const noSetup = FIXTURES.filter(({ market, symbol }) => {
      const { calibration, consensus } = analyzeMarket(symbol, market);
      return !consensus.side ||
        consensus.score < calibration.confidenceThreshold;
    });
    assert.equal(
      noSetup.length > 0,
      true,
      "no fixture exercised the explainNoSetup path",
    );
    for (const { market, symbol } of noSetup) {
      const diagnostics = diagnosticsFor(
        symbol,
        market,
        analyzeMarket(symbol, market),
        0,
      );
      assert.deepStrictEqual(
        diagnostics,
        diagnosticsFor(symbol, market, analyzeMarket(symbol, market), 0),
      );
      assert.match(diagnostics.join(" "), /Levelflow requires|passed review/);
    }
  });
});

describe("index.ts runs the committee once per symbol", () => {
  function body(start: string, end: string) {
    const from = ANALYZER.indexOf(start);
    assert.notEqual(from, -1, `expected to find ${start}`);
    const to = ANALYZER.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `expected to find ${end}`);
    return ANALYZER.slice(from, to);
  }

  it("computes the analysis in one place", () => {
    const calls = ANALYZER.match(/runStrategyCommittee\(/g) ?? [];
    assert.equal(calls.length, 1);
    assert.equal((ANALYZER.match(/classifyRegime\(/g) ?? []).length, 1);
    assert.equal((ANALYZER.match(/scoreConsensus\(/g) ?? []).length, 1);
    assert.match(ANALYZER, /const analysis = analyzeMarket\(/);
  });

  it("hands that analysis to both readers instead of recomputing", () => {
    for (
      const [name, end] of [
        ["async function analyzeSetup(", "\nasync function explainNoSetup"],
        ["async function explainNoSetup(", "\nfunction buildSetupKey"],
      ] as [string, string][]
    ) {
      const source = body(name, end);
      assert.match(source, /analysis: MarketAnalysis,/, name);
      assert.match(
        source,
        /const \{ calibration, consensus, regime, votes \} = analysis;/,
        name,
      );
      assert.doesNotMatch(source, /classifyRegime\(/, name);
      assert.doesNotMatch(source, /runStrategyCommittee\(/, name);
      assert.doesNotMatch(source, /scoreConsensus\(/, name);
      assert.doesNotMatch(source, /getCategoryCalibration\(/, name);
    }
  });
});
