import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { estimateExecutionQuality } from "../supabase/functions/trade-analyzer/executionQuality.ts";
import { buildPricePlan, type PlanRefusal } from "../supabase/functions/trade-analyzer/pricePlan.ts";
import type { Bar, MarketContext, Regime } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * The 21-cross commission, priced in the right currency on one physics
 * (2026-09-14). E8 bills $5 per 100,000 BASE units — 5e-5 USD per base unit
 * — and the accountant needs it in QUOTE units: 5e-5 / (USD per quote).
 * Until the 2026-09-14 cross-rate version the engine charged
 * referencePrice × 5e-5 on the crosses, the true figure multiplied by
 * USD-per-BASE (two-sided; record: forex-commission-conversion-2026-09-13.md).
 *
 * The rate on both paths is the USD leg's last COMPLETED daily close: live
 * through the bar store, the sweep from the pinned cache. Without it a cross
 * is refused by name — never charged zero, never the old figure.
 */

const regime: Regime = {
  bias: "neutral",
  name: "range",
  rationale: "test",
  trendStrength: 0.5,
  volatilityPercentile: 0.5,
};

/** A JPY-quoted cross near 165: a triangle wave with real-looking daily range. */
function crossMarket(quoteCurrencyUsd: MarketContext["quoteCurrencyUsd"]): MarketContext {
  const primary: Bar[] = [];
  for (let index = 0; index < 120; index += 1) {
    const position = index % 20;
    const value = position < 10 ? 164 + 0.4 * position : 168 - 0.4 * (position - 10);
    primary.push({ close: value, high: value + 0.3, low: value - 0.3, open: value, time: index * 900_000, volume: 1_000 });
  }
  const daily: Bar[] = Array.from({ length: 80 }, (_, index) => ({
    close: 166 + (index % 2 === 0 ? 0.5 : -0.5),
    high: 169.2,
    low: 162.8,
    open: 166,
    time: index * 86_400_000,
    volume: 10_000,
  }));
  return {
    availableTimeframes: ["1day", "1hour", "15min"],
    daily,
    latest: primary.at(-1)!,
    latestTimeframe: "15min",
    primary,
    primaryTimeframe: "15min",
    providerWarnings: [],
    quote: null,
    quoteCurrencyUsd,
    timeframes: { "15min": primary, "1day": daily },
  };
}

const USDJPY_CLOSE = 153.5;
const USD_PER_JPY = 1 / USDJPY_CLOSE;

describe("estimateExecutionQuality on a forex cross", () => {
  const base = {
    assetType: "forex" as const,
    atr: 0.16,
    availableTimeframes: ["1day", "4hour", "1hour", "15min"],
    dailyAtr: 0.8,
    entryPrice: 165.2,
    latestClose: 165.4,
    providerWarnings: [],
    side: "buy" as const,
    stopLoss: 164.7,
    symbol: "EURJPY",
    takeProfit: 166.4,
  };

  it("charges 5e-5 over USD-per-quote: $5 per 100,000 EUR, in yen", () => {
    const quality = estimateExecutionQuality({ ...base, usdPerQuote: USD_PER_JPY });
    // 5e-5 USD per EUR × 153.5 JPY per USD = 0.007675 JPY per EUR.
    assert.ok(Math.abs(quality.estimatedCommission - 0.007675) < 1e-12, `${quality.estimatedCommission}`);
    // The cross's own price is not in the figure: the old code charged
    // 165.4 × 5e-5 = 0.00827 here, EURUSD-fold too much.
    const dearer = estimateExecutionQuality({ ...base, entryPrice: 180.2, latestClose: 180.4, stopLoss: 179.7, takeProfit: 181.4, usdPerQuote: USD_PER_JPY });
    assert.equal(dearer.estimatedCommission, quality.estimatedCommission);
    assert.ok(
      Math.abs(quality.estimatedRoundTripCost - (quality.estimatedSpread + quality.estimatedSlippage * 2 + 0.007675)) < 1e-12,
      "the exact commission joins the round trip like any other",
    );
  });

  it("throws, never charges zero, when a cross reaches it without a rate", () => {
    assert.throws(() => estimateExecutionQuality({ ...base, usdPerQuote: null }), /EURJPY: no commission figure/);
    assert.throws(() => estimateExecutionQuality({ ...base }), /needs usdPerQuote/);
  });

  it("USD pairs ignore the rate — their figure needs none", () => {
    const withRate = estimateExecutionQuality({ ...base, symbol: "USDJPY", usdPerQuote: 0.42 });
    const without = estimateExecutionQuality({ ...base, symbol: "USDJPY", usdPerQuote: null });
    assert.equal(withRate.estimatedCommission, without.estimatedCommission);
    assert.ok(Math.abs(without.estimatedCommission - 165.4 * 0.00005) < 1e-12);
  });
});

describe("buildPricePlan on a forex cross", () => {
  it("refuses a cross whose context carries no rate, by name (§19e)", () => {
    const refusal: PlanRefusal = {};
    const plan = buildPricePlan("buy", "EURJPY", crossMarket(null), regime, getCategoryCalibration("EURJPY"), refusal);
    assert.equal(plan, null);
    assert.equal(refusal.reason, "commission_rate_unavailable");
  });

  it("prices the plan at the exact figure when the leg's close is in the context", () => {
    const market = crossMarket({ leg: "USDJPY", legCloseAtMs: 79 * 86_400_000, usdPerQuote: USD_PER_JPY });
    const refusal: PlanRefusal = {};
    const plan = buildPricePlan("buy", "EURJPY", market, regime, getCategoryCalibration("EURJPY"), refusal);
    assert.ok(plan, `refused: ${refusal.reason}`);
    assert.ok(Math.abs(plan.executionQuality.estimatedCommission - 0.007675) < 1e-12, `${plan.executionQuality.estimatedCommission}`);
  });

  it("a USD pair with a null rate is not refused on the rate: it needs none", () => {
    const refusal: PlanRefusal = {};
    const plan = buildPricePlan("buy", "USDJPY", crossMarket(null), regime, getCategoryCalibration("USDJPY"), refusal);
    assert.ok(plan, `refused: ${refusal.reason}`);
    assert.notEqual(refusal.reason, "commission_rate_unavailable");
  });
});

// ---------------------------------------------------------------------------
// The sweep: the leg's last completed daily close prices every decision.

import { completedDailySeries } from "../supabase/functions/trade-analyzer/dailyCompletion.ts";
import { simulateSymbol, visibleQuoteCurrencyUsd } from "../supabase/functions/trade-analyzer/sweep.ts";

const startTime = Date.parse("2026-06-15T00:00:00.000Z");

function sawtooth(count: number, fall: number, rise: number): number[] {
  const period = fall + rise;
  const low = 96;
  const high = 104;
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    return position < fall
      ? high - ((high - low) / fall) * position
      : low + ((high - low) / rise) * (position - fall);
  });
}

function toBars(values: readonly number[]): Bar[] {
  return values.map((value, index) => ({
    close: value,
    high: value + 0.15,
    low: value - 0.15,
    open: value,
    time: startTime + index * 900_000,
    volume: 1_000,
  }));
}

function dailyBars(count: number, close = 100, startMs = startTime - count * 86_400_000): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: close + (index % 2 === 0 ? 0.5 : -0.5) * (close / 100),
    high: close * 1.032,
    low: close * 0.968,
    open: close,
    time: startMs + index * 86_400_000,
    volume: 10_000,
  }));
}

const primary = toBars([...sawtooth(450, 12, 4), ...sawtooth(450, 24, 8)]);
const calibrationOverride = { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 };

describe("visibleQuoteCurrencyUsd — the one pointer both readers walk", () => {
  const series = completedDailySeries("USDJPY", dailyBars(6, 150));
  it("answers null while nothing has completed, and past the series", () => {
    assert.equal(visibleQuoteCurrencyUsd("USDJPY", true, series, 0), null);
    assert.equal(visibleQuoteCurrencyUsd("USDJPY", true, series, series.length + 1), null);
  });
  it("prices the LAST visible entry, inverted for a USD-based leg, direct otherwise, with its completion instant", () => {
    const two = visibleQuoteCurrencyUsd("USDJPY", true, series, 2)!;
    assert.deepEqual(two, { leg: "USDJPY", legCloseAtMs: series[1].completeAtMs, usdPerQuote: 1 / series[1].bar.close });
    const direct = visibleQuoteCurrencyUsd("GBPUSD", false, series, 2)!;
    assert.equal(direct.usdPerQuote, series[1].bar.close);
  });
  it("refuses a non-positive close", () => {
    const broken = [{ ...series[0], bar: { ...series[0].bar, close: 0 } }];
    assert.equal(visibleQuoteCurrencyUsd("USDJPY", true, broken, 1), null);
  });
});

describe("simulateSymbol on a forex cross", () => {
  it("throws at entry for a cross simulated without its USD leg — a driver defect is not a market refusing", () => {
    assert.throws(
      () => simulateSymbol({ calibrationOverride, dailyBars: dailyBars(80), primaryBars: primary, stepBars: 8, symbol: "EURJPY", warmupBars: 120 }),
      /EURJPY: a forex cross needs its USD leg USDJPY's daily bars/,
    );
    assert.throws(
      () =>
        simulateSymbol({
          calibrationOverride,
          dailyBars: dailyBars(80),
          primaryBars: primary,
          quoteCurrencyLeg: { dailyBars: dailyBars(80, 1.35), symbol: "GBPUSD", usdIsBase: false },
          stepBars: 8,
          symbol: "EURJPY",
          warmupBars: 120,
        }),
      /names USDJPY as its USD leg, not GBPUSD/,
    );
    // The right leg with the wrong orientation would price the cross 23,000×
    // off and record the rate as if correct: refused, never trusted.
    assert.throws(
      () =>
        simulateSymbol({
          calibrationOverride,
          dailyBars: dailyBars(80),
          primaryBars: primary,
          quoteCurrencyLeg: { dailyBars: dailyBars(80, 153.5), symbol: "USDJPY", usdIsBase: false },
          stepBars: 8,
          symbol: "EURJPY",
          warmupBars: 120,
        }),
      /USDJPY is based in USD, but the driver passed usdIsBase=false/,
    );
  });

  it("prices every decision at 5e-5 over the leg's previous completed close, inverted for a USD-based leg — and the pointer MOVES", () => {
    // USDJPY daily bars stamped ACROSS the decision range (the decisions run
    // ~9.4 days from startTime): the visible close changes as bars complete,
    // so a pointer that advances once and freezes, or one bar late, is caught
    // here — not only the pointer that never advances.
    const leg = dailyBars(14, 153.5, startTime - 2 * 86_400_000);
    const result = simulateSymbol({
      calibrationOverride,
      captureAll: true,
      dailyBars: dailyBars(80),
      primaryBars: primary,
      quoteCurrencyLeg: { dailyBars: leg, symbol: "USDJPY", usdIsBase: true },
      stepBars: 8,
      symbol: "EURJPY",
      warmupBars: 120,
    });
    const rows = result.outcomes;
    assert.ok(rows.length >= 20, `only ${rows.length} rows`);
    // The expectation walks the completion gate independently: at each
    // decision the visible leg bar is the last whose COMPLETION instant is at
    // or before the decision bar — a weekend-stamped bar the gate drops is
    // never it, and a bar completing after the decision is not yet readable.
    const completed = completedDailySeries("USDJPY", leg);
    assert.ok(completed.length >= 5 && completed.length < leg.length, "the gate must drop some weekend bars for this test to bite");
    const seen = new Set<number>();
    for (const row of rows) {
      const visible = completed.filter((entry) => entry.completeAtMs <= row.time).at(-1)!;
      const expectedRate = 1 / visible.bar.close;
      seen.add(expectedRate);
      assert.equal(row.usdPerQuote, expectedRate, `at ${row.time}: the emitted rate is the visible leg close, inverted`);
      assert.ok(
        Math.abs(row.estimatedCommission - 0.00005 / expectedRate) < 1e-12,
        `commission ${row.estimatedCommission} is not 5e-5 / ${expectedRate}`,
      );
    }
    assert.ok(seen.size > 1, `the visible leg close never changed across the decisions (${seen.size} distinct) — the pointer was not exercised`);
    // A decision that sits between two completions prices the EARLIER close.
    const between = rows.find((row) => completed.some((entry, index) =>
      index + 1 < completed.length && entry.completeAtMs <= row.time && row.time < completed[index + 1].completeAtMs
    ));
    assert.ok(between, "no decision fell between two leg completions");
    const earlier = completed.filter((entry) => entry.completeAtMs <= between!.time).at(-1)!;
    assert.equal(between!.usdPerQuote, 1 / earlier.bar.close);
    assert.equal(result.rejectionLedger.filter((row) => row.reason.includes("commission_rate_unavailable")).length, 0);
  });

  it("refuses every decision by name while the leg has no completed bar yet, and the ledger says so", () => {
    // The leg's series starts AFTER the last decision bar: nothing is visible
    // at any decision, so no plan can be priced.
    const late = dailyBars(80, 153.5, startTime + primary.length * 900_000 + 86_400_000);
    const result = simulateSymbol({
      calibrationOverride,
      captureAll: true,
      dailyBars: dailyBars(80),
      primaryBars: primary,
      quoteCurrencyLeg: { dailyBars: late, symbol: "USDJPY", usdIsBase: true },
      stepBars: 8,
      symbol: "EURJPY",
      warmupBars: 120,
    });
    assert.equal(result.outcomes.length, 0, "a decision without a rate must not emit a row");
    const named = result.rejectionLedger.filter((row) => row.reason === "planRejected:commission_rate_unavailable");
    assert.ok(named.length > 0, "the ledger never named the rate refusal");
    assert.equal(result.rejections.planRejected, named.length + result.rejectionLedger.filter((row) => row.reason.startsWith("planRejected:") && row.reason !== "planRejected:commission_rate_unavailable").length);
  });

  it("a USD pair carries no rate and no leg, unchanged", () => {
    const result = simulateSymbol({ calibrationOverride, captureAll: true, dailyBars: dailyBars(80), primaryBars: primary, stepBars: 8, symbol: "EURUSD", warmupBars: 120 });
    assert.ok(result.outcomes.length >= 20);
    for (const row of result.outcomes) {
      assert.equal(row.usdPerQuote, null);
      assert.equal(row.estimatedCommission, 0.00005);
    }
  });
});

// ---------------------------------------------------------------------------
// The live path is Edge-only (Deno globals), so its wiring is pinned by
// source, the way the other market-level refusals are (tests/pricePlan.test.ts).

import { readFileSync } from "node:fs";

describe("the live review resolves the rate beside the market load and refuses a cross without one", () => {
  const INDEX = readFileSync("supabase/functions/trade-analyzer/index.ts", "utf8");
  const LOADER = readFileSync("supabase/functions/trade-analyzer/marketLoader.ts", "utf8");

  it("one rate memo per scan request, handed to every review", () => {
    assert.match(INDEX, /const quoteRates: QuoteCurrencyRateMemo = new Map\(\);/);
    assert.match(INDEX, /scanOpportunity\(token, userId, symbol, quoteRates\)/);
    assert.match(INDEX, /reviewCurrentMarket\(token, userId, symbol, quoteRates\)/);
  });

  it("starts the leg's load before the market's own, from the bar store's daily bars", () => {
    const resolveAt = INDEX.indexOf("const quoteRatePending = resolveQuoteCurrencyUsd({");
    const loadAt = INDEX.indexOf("await fetchFirstAvailableMarketContext(");
    assert.ok(resolveAt > 0 && loadAt > resolveAt, "the rate is resolved beside the load, not after it");
    assert.match(INDEX, /fetchFmpBars\(legProviderSymbol, "1day", recordAnalyzerEvent, fetchWithTimeout\)/);
  });

  it("blocks a cross whose leg did not load, with the fact and nothing else, and only after the market's own gates", () => {
    const gateAt = INDEX.indexOf("if (loadedContext.daily.length < 80) {");
    const blockAt = INDEX.indexOf('if (quoteRate.kind === "unavailable") {');
    const analysisAt = INDEX.indexOf("const analysis = analyzeMarket(normalizedSymbol, marketContext);");
    assert.ok(gateAt > 0 && blockAt > gateAt && analysisAt > blockAt, "the rate block sits between the bar gates and the analysis");
    assert.match(
      INDEX,
      /reason: "The commission for this cross could not be priced because its USD leg's daily bars did not load\.",/,
    );
    assert.match(INDEX, /message: "Commission rate unavailable",/);
  });

  it("prices the context only once the rate is known, and the loader never claims one", () => {
    assert.match(INDEX, /quoteCurrencyUsd: quoteRate\.kind === "rate" \? quoteRate\.rate : null,/);
    assert.match(LOADER, /quoteCurrencyUsd: null,/);
  });
});
