import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { estimateExecutionQuality } from "../supabase/functions/trade-analyzer/executionQuality.ts";
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

    assert.equal(quality.estimatedCommission, 0.00006);
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
    assert.equal(twoYear.modeledSpread, 0.01563);
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
    assert.equal(forex.modeledSpread, 0.00004);
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
      assert.equal(quality.estimatedSpread, 1.08528);
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
    assert.equal(
      withCommission.estimatedRoundTripCost,
      Number(
        (withCommission.estimatedSpread +
          withCommission.estimatedSlippage * 2 + 0.1152).toFixed(5),
      ),
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
    assert.equal(
      ada.estimatedCommission,
      Number((0.1941 * 7e-4).toFixed(5)),
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
