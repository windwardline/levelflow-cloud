import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateExecutionQuality } from "../supabase/functions/trade-analyzer/executionQuality.ts";
import { calculateLearningWeight } from "../supabase/functions/trade-analyzer/learning.ts";
import { parseFmpQuoteSnapshot } from "../supabase/functions/trade-analyzer/quotes.ts";

describe("execution quality model", () => {
  it("keeps clean forex execution inside the payoff budget", () => {
    const quality = estimateExecutionQuality({
      assetType: "forex",
      atr: 0.0012,
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      dailyAtr: 0.006,
      entryPrice: 1.156,
      latestClose: 1.158,
      providerWarnings: [],
      side: "buy",
      stopLoss: 1.153,
      symbol: "EURUSD",
      takeProfit: 1.164,
    });

    assert.equal(quality.label, "Clean");
    assert.equal(quality.confidencePenalty <= 2, true);
    assert.equal(quality.effectiveRewardRisk < quality.grossRewardRisk, true);
    assert.equal(quality.effectiveRewardRisk > 2.2, true);
  });

  it("penalizes setups where execution cost consumes too much risk", () => {
    const quality = estimateExecutionQuality({
      assetType: "crypto",
      atr: 75,
      availableTimeframes: ["1day", "1hour"],
      dailyAtr: 600,
      entryPrice: 64800,
      latestClose: 64810,
      providerWarnings: ["15min missing"],
      side: "sell",
      stopLoss: 64920,
      symbol: "BTCUSD",
      takeProfit: 64480,
    });

    assert.equal(quality.confidencePenalty >= 8, true);
    assert.equal(quality.score < 72, true);
    assert.equal(
      quality.notes.some((note) => note.includes("execution cost")),
      true,
    );
  });

  it("uses a live bid/ask spread when the provider returns one", () => {
    const quality = estimateExecutionQuality({
      assetType: "forex",
      atr: 0.0012,
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      dailyAtr: 0.006,
      entryPrice: 1.156,
      latestClose: 1.158,
      providerWarnings: [],
      quotedSpread: 0.00004,
      side: "buy",
      stopLoss: 1.153,
      symbol: "EURUSD",
      takeProfit: 1.164,
    });

    assert.equal(quality.spreadSource, "quoted");
    assert.equal(quality.quotedSpread, 0.00004);
    assert.equal(quality.estimatedSpread, 0.00004);
    assert.equal(
      quality.notes.some((note) => note.includes("Live bid/ask spread")),
      true,
    );
  });
});

describe("FMP quote parsing", () => {
  it("extracts a usable spread from quote payloads", () => {
    const quote = parseFmpQuoteSnapshot([
      {
        ask: "1.15824",
        bid: "1.1582",
        price: "1.15822",
        symbol: "EURUSD",
      },
    ]);

    assert.deepEqual(quote, {
      ask: 1.15824,
      bid: 1.1582,
      price: 1.15822,
      source: "fmp_quote",
      spread: 0.00004,
    });
  });

  it("ignores quote payloads that do not contain a valid bid and ask", () => {
    assert.equal(
      parseFmpQuoteSnapshot([{ askSize: 20, bidSize: 10, price: 1.1582 }]),
      null,
    );
    assert.equal(
      parseFmpQuoteSnapshot([{ ask: 1.1581, bid: 1.1582 }]),
      null,
    );
  });
});

describe("global learning weights", () => {
  it("discounts high ambiguity before applying a confidence adjustment", () => {
    const clean = calculateLearningWeight({
      ambiguous: 0,
      losses: 5,
      total: 25,
      wins: 20,
    });
    const ambiguous = calculateLearningWeight({
      ambiguous: 25,
      losses: 5,
      total: 50,
      wins: 20,
    });

    assert.equal(clean.confidenceAdjustment > ambiguous.confidenceAdjustment, true);
    assert.equal(clean.sampleWeight > ambiguous.sampleWeight, true);
    assert.equal(ambiguous.ambiguityPenalty > 0, true);
  });

  it("does not learn aggressively from tiny samples", () => {
    const weight = calculateLearningWeight({
      ambiguous: 0,
      losses: 0,
      total: 3,
      wins: 3,
    });

    assert.equal(weight.sampleWeight, 0);
    assert.equal(weight.confidenceAdjustment, 0);
  });
});
