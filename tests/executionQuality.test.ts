import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { estimateExecutionQuality } from "../supabase/functions/trade-analyzer/executionQuality.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { calculateLearningWeight } from "../supabase/functions/trade-analyzer/learning.ts";
import { parseFmpQuoteSnapshot } from "../supabase/functions/trade-analyzer/quotes.ts";

describe("execution quality model", () => {
  it("charges forex the venue's commission — the bill CO-3 found missing", () => {
    // Pre-repair this fixture graded "Clean" on spread+slippage alone
    // (RT 0.00008). The venue's published $5/lot RT adds 0.00006 — 75% of
    // the modeled figure, the exact understatement round-8 CO-3 measured
    // — and an honest 4.7% cost-to-risk reads "Thin", not "Clean".
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

    // 1.1579 * 5e-5 = 0.0000579 EXACTLY. It read 0.00006 until 2026-08-24,
    // which is the quantized value, not the venue's: roundPrice governed the
    // cost legs at an absolute 1e-5 and restated E8's published $5/lot by
    // 0.1/price — +3.6% here, +13.2% at price 0.53, +66.7% at 0.12.
    assert.ok(
      Math.abs(quality.estimatedCommission - 0.0000579) < 1e-9,
      `commission must be the venue's figure, not a rounding of it: ${quality.estimatedCommission}`,
    );
    // And it must NOT be a multiple of the old 1e-5 quantum. That is the
    // property, stated directly: a cost proportional to price cannot land on
    // an absolute grid except by accident.
    assert.notEqual(
      quality.estimatedCommission,
      Number(quality.estimatedCommission.toFixed(5)),
      "an unquantized commission must differ from its own 5-decimal rounding",
    );
    assert.equal(quality.label, "Thin");
    assert.equal(quality.confidencePenalty, 4);
    assert.equal(quality.effectiveRewardRisk < quality.grossRewardRisk, true);
    assert.equal(quality.effectiveRewardRisk > 2.2, true);
  });

  it("charges execution cost once — against the payoff, never also into the risk (2d)", () => {
    // The old form was (reward - cost) / (risk + cost): the same round trip
    // billed to both sides of the ratio. One trade pays its cost once, and
    // the realized-R accountant (realizedRFromLegs) charges the same single
    // round trip — so the gate's metric and the measured corpus agree on
    // what a unit of cost is.
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

    const rewardDistance = 1.164 - 1.156;
    const riskDistance = 1.156 - 1.153;
    assert.equal(
      quality.effectiveRewardRisk,
      Number(
        (
          Math.max(0, rewardDistance - quality.estimatedRoundTripCost) /
          Math.max(riskDistance, 0.00001)
        ).toFixed(5),
      ),
    );
  });

  it("floors a tick-gridded contract's modeled spread at its own tick, not its family's mean (2j)", () => {
    // E8 publishes NO spread for futures — cost is exchange-native tick
    // pricing plus itemized fees (e8-futures-dossier §5.4, finding 9). The
    // family-mean bps model billed the E-mini Nasdaq ~13 ticks of spread
    // (1.4bps of ~23,000 = 3.2 points against a 0.25 tick) and billed the
    // 2-year note BELOW one tick — both directions wrong, from one lossy
    // mean. A symbol with a known tick pays its own floor.
    const nasdaq = estimateExecutionQuality({
      assetType: "futures",
      atr: 8,
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      dailyAtr: 180,
      entryPrice: 23_000,
      latestClose: 23_010,
      providerWarnings: [],
      side: "buy",
      stopLoss: 22_960,
      symbol: "NQUSD",
      takeProfit: 23_090,
      tickSize: 0.25,
    });
    assert.equal(nasdaq.modeledSpread, 0.25);
    assert.equal(nasdaq.estimatedSpread, 0.25);

    const twoYear = estimateExecutionQuality({
      assetType: "futures",
      atr: 0.05,
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      dailyAtr: 0.3,
      entryPrice: 103,
      latestClose: 103.02,
      providerWarnings: [],
      side: "buy",
      stopLoss: 102.8,
      symbol: "ZTUSD",
      takeProfit: 103.4,
      tickSize: 0.015625,
    });
    // 1/64 EXACTLY — the contract's own tick. The old 0.01563 was that tick
    // seen through an absolute 1e-5 quantizer.
    assert.equal(twoYear.modeledSpread, 0.015625);
  });

  it("keeps the volatility-widening term above the tick floor (2j)", () => {
    const stressed = estimateExecutionQuality({
      assetType: "futures",
      atr: 30,
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      dailyAtr: 300,
      entryPrice: 23_000,
      latestClose: 23_010,
      providerWarnings: [],
      side: "buy",
      stopLoss: 22_900,
      symbol: "NQUSD",
      takeProfit: 23_200,
      tickSize: 0.25,
    });
    assert.equal(stressed.modeledSpread, 0.36);
  });

  it("leaves classes without a tick grid on their measured class model (2j)", () => {
    const forex = estimateExecutionQuality({
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
    assert.ok(
      Math.abs(forex.modeledSpread - 0.00004053) < 1e-10,
      `class model, unquantized: ${forex.modeledSpread}`,
    );
  });

  it("threads the contract tick from the plan and banks live quoted spreads (2j)", () => {
    const pricePlan = readFileSync(
      "supabase/functions/trade-analyzer/pricePlan.ts",
      "utf8",
    );
    assert.match(
      pricePlan,
      /tickSize: futuresTickPlan\?\.contractSpec\.tickSize \?\? null/,
    );
    // START BANKING (2j): production sees real bid/ask spreads on every
    // quote fetch and used to drop them on the floor. Each success now
    // lands an append-only analyzer_events row so 4a can measure per-symbol
    // spreads from evidence instead of modeling them forever.
    const loader = readFileSync(
      "supabase/functions/trade-analyzer/marketLoader.ts",
      "utf8",
    );
    assert.match(loader, /action: "quote_fetch",\s*\n\s*durationMs,\s*\n\s*metadata: \{\s*\n\s*ask: quote\.ask,\s*\n\s*bid: quote\.bid,\s*\n\s*spread: quote\.spread,/);
    assert.match(loader, /status: "success",/);
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

  it("models index and energy execution with distinct cost floors", () => {
    const indexQuality = estimateExecutionQuality({
      assetType: "indices",
      atr: 42,
      availableTimeframes: ["1day", "4hour", "1hour", "15min", "5min"],
      dailyAtr: 180,
      entryPrice: 7478,
      latestClose: 7485,
      providerWarnings: [],
      side: "buy",
      stopLoss: 7420,
      symbol: "SP",
      takeProfit: 7600,
    });
    const energyQuality = estimateExecutionQuality({
      assetType: "energies",
      atr: 0.55,
      availableTimeframes: ["1day", "4hour", "1hour", "15min", "5min"],
      dailyAtr: 2.1,
      entryPrice: 67.2,
      latestClose: 67.75,
      providerWarnings: [],
      side: "buy",
      stopLoss: 66.25,
      symbol: "WTI",
      takeProfit: 69.2,
    });

    assert.equal(indexQuality.estimatedSpread >= 0.01, true);
    assert.equal(energyQuality.estimatedSpread >= 0.001, true);
    assert.notEqual(indexQuality.estimatedSpread, energyQuality.estimatedSpread);
  });

  // The cost model's floor was an ABSOLUTE price increment (futures/indices
  // 0.01). One E8 class spans natural gas at 2.67 to E-mini S&P at 7752 —
  // 2900x — so no single absolute floor can be right for all of it. At 0.01
  // the "guard" became the governing term for the cheap contracts: modeled
  // round-trip cost reached 1.8x copper's entire risk distance and 2.7x
  // gas's, reporting a true 2:1 setup as 0.077 and 0.018 and rejecting 100%
  // of them. HGUSD never cleared reward:risk 1.25 in 2304 replayed setups
  // (max 0.956); NGUSD never in 1689 (max 1.140). ZNUSD was throttled to 136
  // filled against ZBUSD's 1540 by the same term.
  //
  // The invariant these pin: execution cost is SCALE-FREE. Spread and
  // slippage are proportional to price (bps) or to volatility (ATR), so a
  // market's cost-to-risk ratio must not depend on where its decimal point
  // sits. A floor may exist to keep cost above zero; it may never outrank
  // both real terms.
  describe("cost is scale-free — no absolute floor may govern (2026-08-05)", () => {
    function costToRisk(assetType: "futures" | "indices", close: number, atr: number): number {
      const risk = atr * 1.4;
      const quality = estimateExecutionQuality({
        assetType,
        atr,
        availableTimeframes: ["1day", "4hour", "1hour", "15min"],
        dailyAtr: atr * 8,
        entryPrice: close,
        latestClose: close,
        providerWarnings: [],
        side: "buy",
        stopLoss: close - risk,
        takeProfit: close + risk * 2,
        symbol: "TEST",
      });
      return quality.estimatedRoundTripCost / risk;
    }

    it("charges the same cost-to-risk to a cheap and an expensive futures contract", () => {
      // Identical price:ATR ratio, three orders of magnitude apart. Copper
      // (6.73) against a synthetic contract at 6730 — same market shape, so
      // the same proportional cost.
      const cheap = costToRisk("futures", 6.73, 0.012);
      const expensive = costToRisk("futures", 6730, 12);
      assert.ok(
        Math.abs(cheap - expensive) < 0.02,
        `cost-to-risk must not track the decimal point: cheap ${cheap.toFixed(3)} vs expensive ${expensive.toFixed(3)}`,
      );
    });

    it("never lets modeled cost exceed the risk it is charged against", () => {
      // The two contracts the absolute floor disqualified outright. Their
      // real cost is a couple of basis points of a single-digit price, so a
      // cost anywhere near their risk distance could only ever have come
      // from a constant that ignored price.
      for (const [label, close, atr] of [
        ["natural gas", 2.67, 0.008],
        ["copper", 6.73, 0.012],
      ] as const) {
        const ratio = costToRisk("futures", close, atr);
        assert.ok(
          ratio < 0.5,
          `${label}: modeled round-trip cost is ${ratio.toFixed(3)}x its risk distance — the floor is governing`,
        );
      }
    });

    // ZNUSD is deliberately NOT in the loop above, and the distinction is the
    // point. Its cost-to-risk is ~0.52 even with the floor gone, and that
    // figure is honest: 1.4 bps of 108.89 is 0.0152, within a rounding error
    // of ZN's real one-tick spread (1/64 = 0.015625). A stop scaled to its
    // 15-minute ATR lands only ~4 spreads away, so the note is genuinely
    // marginal on this timescale. That is a geometry question for its own
    // calibration — a wider stop or a longer review window — never something
    // to fix by understating cost. Pinned so a future edit cannot quietly
    // "improve" ZN by making its spread a fiction.
    it("keeps the 10-year note's cost honest rather than flattering it", () => {
      const ratio = costToRisk("futures", 108.89, 0.045);
      assert.ok(
        ratio > 0.45 && ratio < 0.6,
        `ZN's modeled cost-to-risk drifted to ${ratio.toFixed(3)}; its one-tick spread puts it near 0.52`,
      );
    });

    it("is a no-op where the floor never bound — the E-mini's spread is unchanged", () => {
      // Regression guard for the fix's blast radius: every instrument whose
      // bps or ATR term already outranked 0.01 must price exactly as before.
      // The round trip additionally carries ES's three-fee venue bill
      // (0.1152 — round-8 CO-1); spread and slippage stay untouched.
      const risk = 7.27 * 1.4;
      const quality = estimateExecutionQuality({
        assetType: "futures",
        atr: 7.27,
        availableTimeframes: ["1day", "4hour", "1hour", "15min"],
        dailyAtr: 58,
        entryPrice: 7752,
        latestClose: 7752,
        providerWarnings: [],
        side: "buy",
        stopLoss: 7752 - risk,
        takeProfit: 7752 + risk * 2,
        symbol: "ESUSD",
      });
      assert.ok(
        Math.abs(quality.estimatedSpread - 1.08528) < 1e-9,
        `unchanged, at full precision: ${quality.estimatedSpread}`,
      );
      assert.equal(quality.estimatedSlippage, 0.62016);
      assert.equal(quality.estimatedCommission, 0.1152);
      assert.equal(quality.estimatedRoundTripCost, 2.4408);
    });

    it("leaves a genuine 2:1 setup tradable on a cheap contract", () => {
      const risk = 0.012 * 1.4;
      const quality = estimateExecutionQuality({
        assetType: "futures",
        atr: 0.012,
        availableTimeframes: ["1day", "4hour", "1hour", "15min"],
        dailyAtr: 0.096,
        entryPrice: 6.73,
        latestClose: 6.73,
        providerWarnings: [],
        side: "buy",
        stopLoss: 6.73 - risk,
        takeProfit: 6.73 + risk * 2,
        symbol: "HGUSD",
      });
      // Gross is 2.0 by construction; cost must erode it, never erase it.
      assert.ok(
        quality.effectiveRewardRisk > 1.4,
        `copper's 2:1 setup came back as ${quality.effectiveRewardRisk.toFixed(3)}`,
      );
      assert.ok(quality.effectiveRewardRisk < quality.grossRewardRisk);
    });
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

/**
 * Build cohort stats from the ACTUAL resolutions, not from precomputed moments.
 *
 * A fixture that states `realizedRSum: 7.5` asserts nothing about whether the
 * sum matches the trades; one that states the trades cannot disagree with
 * itself.
 */
function cohort(
  realizedR: number[],
  counts: { ambiguous: number; losses: number; total: number; wins: number },
) {
  return {
    ...counts,
    realizedRCount: realizedR.length,
    realizedRSum: realizedR.reduce((sum, r) => sum + r, 0),
    realizedRSumSq: realizedR.reduce((sum, r) => sum + r * r, 0),
  };
}

/** `n` resolutions alternating around `mean`, so a real error bar exists. */
function spread(n: number, mean: number, halfWidth = 0.4): number[] {
  return Array.from(
    { length: n },
    (_, index) => mean + (index % 2 === 0 ? halfWidth : -halfWidth),
  );
}

describe("global learning weights", () => {
  it("discounts high ambiguity before applying a confidence adjustment", () => {
    // THE ORDERING CLAIM IS BACK. It was suspended while the adjustment was
    // withheld — both sides were 0 and the test could only assert that — and
    // the note left here said it "returns with a derived neutral point".
    // D1 derived it: in realized R the neutral point is 0.
    const wins = spread(60, 0.3);
    const clean = calculateLearningWeight(
      cohort(wins, { ambiguous: 0, losses: 5, total: 25, wins: 20 }),
    );
    const ambiguous = calculateLearningWeight(
      cohort(wins, { ambiguous: 25, losses: 5, total: 50, wins: 20 }),
    );

    assert.ok(
      clean.confidenceAdjustment > 0,
      `the clean cohort must actually score, or the ordering below is two ` +
        `zeroes compared: ${clean.confidenceAdjustment}`,
    );
    assert.ok(
      clean.confidenceAdjustment > ambiguous.confidenceAdjustment,
      `identical money, more ambiguity, and the discount did not bite: ` +
        `${clean.confidenceAdjustment} vs ${ambiguous.confidenceAdjustment}`,
    );
    assert.equal(clean.sampleWeight > ambiguous.sampleWeight, true);
    assert.equal(ambiguous.ambiguityPenalty > 0, true);
  });

  it("does not learn aggressively from tiny samples", () => {
    const weight = calculateLearningWeight(
      cohort(spread(3, 0.5), { ambiguous: 0, losses: 0, total: 3, wins: 3 }),
    );

    assert.equal(weight.sampleWeight, 0);
    // Three resolutions cannot clear their own error bar, so the mean shrinks
    // to zero. That is the sample floor now — measured, not a threshold.
    assert.equal(weight.confidenceAdjustment, 0);
  });
});

describe("the venue's commission joins the round trip (round-8 CO-1/3/4)", () => {
  const base = {
    atr: 12,
    availableTimeframes: ["15min", "1hour", "4hour"],
    dailyAtr: 60,
    entryPrice: 5500,
    latestClose: 5500,
    providerWarnings: [],
    side: "buy" as const,
    stopLoss: 5488,
    takeProfit: 5530,
  };

  it("charges ES the three-fee bill on top of spread and slippage", () => {
    const withCommission = estimateExecutionQuality({
      ...base,
      assetType: "futures",
      symbol: "ESUSD",
      tickSize: 0.25,
    });
    assert.equal(withCommission.estimatedCommission, 0.1152);
    assert.ok(
        Math.abs(
          withCommission.estimatedRoundTripCost -
            (withCommission.estimatedSpread +
          withCommission.estimatedSlippage * 2 + 0.1152),
        ) < 1e-12,
        `the round trip is the sum of its legs, unquantized`,
      );
  });

  it("a symbol the venue tables cannot bill carries zero commission, stated", () => {
    const unknown = estimateExecutionQuality({
      ...base,
      assetType: "indices",
      symbol: "FESX",
    });
    assert.equal(unknown.estimatedCommission, 0);
  });

  it("floors ADA's modeled spread at its sampled book width (CO-2)", () => {
    const ada = estimateExecutionQuality({
      ...base,
      assetType: "crypto",
      atr: 0.001,
      dailyAtr: 0.004,
      entryPrice: 0.1941,
      latestClose: 0.1941,
      stopLoss: 0.1921,
      takeProfit: 0.1981,
      symbol: "ADAUSD",
    });
    assert.ok(
      ada.modeledSpread >= 0.1941 * 11.3e-4 - 1e-9,
      `ADA modeled spread ${ada.modeledSpread} sits under its book floor`,
    );
    // The expected value mirrored the defect: it applied .toFixed(5) to the
    // venue's figure, so the test could only ever agree with the quantizer.
    assert.ok(
      Math.abs(ada.estimatedCommission - 0.1941 * 7e-4) < 1e-12,
      `the venue's figure, unquantized: ${ada.estimatedCommission}`,
    );
  });

  it("a quoted spread still outranks the floored model", () => {
    const quoted = estimateExecutionQuality({
      ...base,
      assetType: "crypto",
      atr: 0.001,
      dailyAtr: 0.004,
      entryPrice: 0.1941,
      latestClose: 0.1941,
      stopLoss: 0.1921,
      takeProfit: 0.1981,
      symbol: "ADAUSD",
      quotedSpread: 0.00009,
    });
    assert.equal(quoted.spreadSource, "quoted");
    assert.equal(quoted.estimatedSpread, 0.00009);
  });
});

describe("ambiguous resolves AGAINST the trade in learning (2e, round-8 PH-7)", () => {
  it("counts ambiguous rows in the win-rate denominator", () => {
    // 10 wins, 5 stops, 5 ambiguous. Under 2e an unknowable path is a
    // loss for every scoring purpose — the engine already prices its
    // exit at the stop side, and the learning layer may not quietly
    // resurrect it as a non-event. Win rate is 10/20, not 10/15.
    const weight = calculateLearningWeight(
      cohort(spread(20, 0.1), {
        ambiguous: 5,
        losses: 5,
        total: 20,
        wins: 10,
      }),
    );
    assert.equal(weight.winRate, 0.5);
  });

  it("a market that is half ambiguous cannot show a positive adjustment", () => {
    // The MONEY is what decides now, and this cohort lost it: eight banked
    // partials cannot cover ten resolutions priced at the stop side.
    const weight = calculateLearningWeight(
      cohort([...spread(8, 0.3), ...spread(2, -1), ...spread(10, -1)], {
        ambiguous: 10,
        losses: 2,
        total: 20,
        wins: 8,
      }),
    );
    assert.ok(
      weight.confidenceAdjustment <= 0,
      `8W/2L/10A must not read as a winner: ${weight.confidenceAdjustment}`,
    );
  });
});

describe("the modeled-cost sensitivity is measurement-only (owner standard 2026-08-11)", () => {
  const fixture = {
    assetType: "crypto" as const,
    atr: 0.001,
    availableTimeframes: ["15min", "1hour", "4hour"],
    dailyAtr: 0.004,
    entryPrice: 0.1941,
    latestClose: 0.1941,
    providerWarnings: [],
    side: "buy" as const,
    stopLoss: 0.1921,
    symbol: "ADAUSD",
    takeProfit: 0.1981,
  };

  it("defaults to the full model when nothing sets it", () => {
    delete process.env.LEVELFLOW_MODELED_COST_SCALE;
    const full = estimateExecutionQuality(fixture);
    assert.ok(
        Math.abs(
          full.estimatedRoundTripCost -
            (full.estimatedSpread + full.estimatedSlippage * 2 +
          full.estimatedCommission),
        ) < 1e-12,
        `the round trip is the sum of its legs, unquantized`,
      );
  });

  it("at zero, only the venue's PUBLISHED commission remains", () => {
    process.env.LEVELFLOW_MODELED_COST_SCALE = "0";
    try {
      const gross = estimateExecutionQuality(fixture);
      assert.equal(gross.estimatedRoundTripCost, gross.estimatedCommission);
      assert.ok(gross.estimatedCommission > 0, "the published bill stays");
    } finally {
      delete process.env.LEVELFLOW_MODELED_COST_SCALE;
    }
  });

  it("refuses a scale that would INVENT cost, or a malformed one", () => {
    for (const bad of ["2", "-1", "nonsense"]) {
      process.env.LEVELFLOW_MODELED_COST_SCALE = bad;
      try {
        const cell = estimateExecutionQuality(fixture);
        assert.ok(
          Math.abs(
            cell.estimatedRoundTripCost -
              (cell.estimatedSpread + cell.estimatedSlippage * 2 +
                cell.estimatedCommission),
          ) < 1e-12,
          `${bad} must fall back to the full model`,
        );
      } finally {
        delete process.env.LEVELFLOW_MODELED_COST_SCALE;
      }
    }
  });

  it("no production path sets it — only the sweep driver may", () => {
    const analyzer = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    assert.doesNotMatch(analyzer, /LEVELFLOW_MODELED_COST_SCALE/);
  });
});

describe("cost is scale-free, over the ROSTER (2026-08-24)", () => {
  // The invariant was already declared in this file — "execution cost is
  // SCALE-FREE... a market's cost-to-risk ratio must not depend on where its
  // decimal point sits" — while roundPrice governed every cost leg at an
  // absolute 1e-5. Both could not be true, and the probes never descended
  // below price 2.67, so the contradiction never showed.
  //
  // The population is the ROSTER, not one symbol per class: a hand-picked
  // probe set is what let an absolute quantum sit under a scale-free claim.
  it("charges the venue's published commission at every price scale", () => {
    // Every forex pair on the roster, priced across four decades. The
    // commission is price * 5e-5 by definition (E8's $5/lot), so the RATIO to
    // price must be constant — that is what scale-free means here.
    const forex = defaultScanSymbols.filter((symbol) =>
      getAssetType(symbol) === "forex" && /^[A-Z]{6}$/.test(symbol)
    );
    assert.ok(forex.length >= 20, `expected the FX roster, got ${forex.length}`);
    for (const symbol of forex) {
      const ratios = [0.12, 0.53, 1.16, 12.5, 155].map((price) => {
        const quality = estimateExecutionQuality({
          assetType: "forex",
          atr: price * 0.001,
          availableTimeframes: ["1day", "4hour", "1hour", "15min"],
          dailyAtr: price * 0.005,
          entryPrice: price,
          latestClose: price,
          providerWarnings: [],
          side: "buy",
          stopLoss: price * 0.997,
          symbol,
          takeProfit: price * 1.006,
        });
        return quality.estimatedCommission / price;
      });
      const spread = Math.max(...ratios) - Math.min(...ratios);
      assert.ok(
        spread < 1e-12,
        `${symbol}: commission/price must not depend on the decimal point — ` +
          `ratios ${ratios.map((r) => r.toExponential(4)).join(", ")}`,
      );
    }
  });

  it("never annihilates a positive quoted spread to zero", () => {
    // roundPrice sent any positive spread below 5e-6 to exactly zero, and
    // zero survives downstream because replay.ts guards `spread < 0`. The
    // setup would price as if the book were free while carrying
    // spreadSource "quoted".
    const quality = estimateExecutionQuality({
      assetType: "forex",
      atr: 0.0012,
      availableTimeframes: ["1day", "4hour", "1hour", "15min"],
      dailyAtr: 0.006,
      entryPrice: 1.156,
      latestClose: 1.158,
      providerWarnings: [],
      quotedSpread: 0.0000012,
      side: "buy",
      stopLoss: 1.153,
      symbol: "EURUSD",
      takeProfit: 1.164,
    });
    assert.ok(
      (quality.quotedSpread ?? 0) > 0,
      `a positive quote must stay positive, got ${quality.quotedSpread}`,
    );
  });
});
