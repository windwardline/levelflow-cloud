import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  storedSetupAsCandidate,
  storedSetupReviewedAt,
} from "../src/lib/storedSetup";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer";

// Same builder shape as tests/tradeState.test.ts and
// tests/currentTradesRail.test.tsx.
function buildSetup(overrides: Partial<TradeSetupRow> = {}): TradeSetupRow {
  return {
    analyzer_version: "unversioned",
    breakeven_trigger_price: 1.0865,
    confidence_score: 78,
    confluence: { orderConstruction: { latestClose: 1.0871 } },
    correlation_group: "eur_crosses",
    created_at: "2026-07-30T09:00:00.000Z",
    id: "setup-1",
    limit_entry: 1.0865,
    risk_model: { executionQuality: { label: "Clean" } },
    side: "buy",
    status: "generated",
    stop_loss: 1.083,
    symbol: "EURUSD",
    take_profit: 1.095,
    take_profit_1: 1.09,
    ...overrides,
  };
}

// The owner's ruling behind this module (2026-08-02): "The whole point of the
// Current Trades section is to serve as a reliable reference for the trades we
// generate." A reference restores what was STORED. Re-analyzing the market on a
// click could return different levels for the same card the reader is looking
// at, which is the one thing a reference may not do — so this adapter reads the
// row and nothing else, and the only network call a restore makes is the chart's
// own bars.
describe("storedSetupAsCandidate — the stored row as the stage's one input", () => {
  it("restores every price the ladder and the chart draw, coerced from PostgREST's strings", () => {
    const candidate = storedSetupAsCandidate(buildSetup({
      breakeven_trigger_price: "1.0865",
      confidence_score: "78",
      limit_entry: "1.0865",
      stop_loss: "1.0830",
      take_profit: "1.0950",
      take_profit_1: "1.0900",
    }));

    assert.equal(candidate.symbol, "EURUSD");
    assert.deepEqual(
      {
        breakevenTriggerPrice: candidate.setup?.breakevenTriggerPrice,
        confidenceScore: candidate.setup?.confidenceScore,
        entryPrice: candidate.setup?.entryPrice,
        side: candidate.setup?.side,
        stopLoss: candidate.setup?.stopLoss,
        takeProfit: candidate.setup?.takeProfit,
        takeProfit1: candidate.setup?.takeProfit1,
      },
      {
        breakevenTriggerPrice: 1.0865,
        confidenceScore: 78,
        entryPrice: 1.0865,
        side: "buy",
        stopLoss: 1.083,
        takeProfit: 1.095,
        takeProfit1: 1.09,
      },
    );
    assert.equal(candidate.setup?.orderType, "limit");
  });

  it("carries the stored confluence and risk model through untouched — the receipt renders from them", () => {
    const row = buildSetup();
    const candidate = storedSetupAsCandidate(row);
    assert.deepEqual(candidate.setup?.confluence, row.confluence);
    assert.deepEqual(candidate.setup?.riskModel, row.risk_model);
  });

  it("reads a null confluence or risk model as empty, never as a missing object", () => {
    const candidate = storedSetupAsCandidate(
      buildSetup({ confluence: null, risk_model: null }),
    );
    assert.deepEqual(candidate.setup?.confluence, {});
    assert.deepEqual(candidate.setup?.riskModel, {});
  });

  it("leaves a non-laddered setup without a first target, so the sheet draws one plain Target", () => {
    for (const takeProfit1 of [null, undefined]) {
      const candidate = storedSetupAsCandidate(buildSetup({ take_profit_1: takeProfit1 }));
      assert.equal(candidate.setup?.takeProfit1, undefined);
    }
  });

  it("reads no correlation group as none, so the linked-market line stays absent", () => {
    const candidate = storedSetupAsCandidate(
      buildSetup({ correlation_group: null }),
    );
    assert.equal(candidate.setup?.correlationGroup, "");
  });

  it("invents nothing the row does not hold — no expiry, no provider, no scan meta", () => {
    // Gaps 1 and 2 of the three storedSetup.ts's own docblock names (the third
    // is the Size row's bridged-pair degrade, which lives in
    // lib/broker/quotes.ts and has no assertion to make here).
    const candidate = storedSetupAsCandidate(buildSetup());
    assert.equal(candidate.setup?.expiresAt, undefined);
    assert.equal(candidate.setup?.dataProvider, undefined);
    assert.equal(candidate.setup?.fmpSymbol, undefined);
    // Scan-row meta the rail rows draw (cost chip, payoff, regime, rationale)
    // is a scan's own reporting, not a stored fact.
    assert.equal(candidate.executionLabel, undefined);
    assert.equal(candidate.rewardRisk, undefined);
    assert.equal(candidate.rationale, undefined);
    assert.equal(candidate.reason, undefined);
    assert.equal(candidate.blocked, undefined);
  });

  it("restores no setup at all rather than a ladder of NaN when a required level is unreadable", () => {
    // Every required level through the same finite guard take_profit_1 already
    // used. The stage's formatNumber does not guard, so a price that slipped
    // through as NaN would print the literal "NaN" on the ladder while the rail
    // card beside it drew "—" for the same column.
    for (
      const column of [
        "breakeven_trigger_price",
        "limit_entry",
        "stop_loss",
        "take_profit",
      ] as const
    ) {
      const candidate = storedSetupAsCandidate(
        buildSetup({ [column]: "not-a-number" }),
      );
      assert.equal(candidate.setup, undefined, column);
      // The market is still selected; only the setup is withheld.
      assert.equal(candidate.symbol, "EURUSD", column);
    }
  });

  it("keeps a readable score readable and lets an unreadable one fall to its own downstream floor", () => {
    assert.equal(
      storedSetupAsCandidate(buildSetup({ confidence_score: "78" })).setup
        ?.confidenceScore,
      78,
    );
    // Not in the refusal set: ConfidenceUnit clamps a non-finite score to 0
    // (clampConfidencePercent), so it degrades to a meter at zero rather than to
    // a printed lie — and withholding a whole setup over the score would take
    // the ladder down with it.
    const candidate = storedSetupAsCandidate(
      buildSetup({ confidence_score: "not-a-number" }),
    );
    assert.ok(candidate.setup, "expected the setup to survive an unreadable score");
    assert.ok(Number.isNaN(candidate.setup!.confidenceScore));
  });

  it("derives the asset class the same way every other surface does", () => {
    assert.equal(storedSetupAsCandidate(buildSetup()).assetType, "Forex");
    assert.equal(
      storedSetupAsCandidate(buildSetup({ symbol: "BTCUSD" })).assetType,
      "Crypto",
    );
  });

  it("reaches no network — the restore costs zero analyzer claims", () => {
    // A restore reads the row it was handed. The only request a click makes is
    // the chart's own bars, which every market selection already triggers; no
    // scan_opportunities and no generate, so the analyzer rate-limit ledger in
    // playwright.config.ts is untouched by either new entry point.
    const source = readFileSync("src/lib/storedSetup.ts", "utf8");
    const imports = (source.match(/^import [\s\S]*?;$/gm) ?? []).join("\n");
    assert.deepEqual(imports.match(/from "([^"]+)"/g), [
      'from "./symbolMap"',
      'from "./tradeAnalyzer"',
    ]);
    // and the tradeAnalyzer import is type-only, so none of its request
    // machinery is even reachable from here.
    assert.match(imports, /import type \{[^}]*\} from "\.\/tradeAnalyzer";/);
    assert.doesNotMatch(source, /\bfetch\(|scanMarketOpportunities|supabase\b/);
  });
});

describe("storedSetupReviewedAt", () => {
  it("stamps the review from the row's own creation moment", () => {
    // AdvisorWorkspace's AnalysisState docblock nulls this for a scan ROW click
    // for one stated reason: "neither AnalyzerSetup nor MarketScanCandidate
    // carries a creation timestamp, so there is no honest review time to
    // print." A stored row does carry one — created_at is exactly when the
    // analyzer produced these levels — so the restore prints it, and a reader
    // reopening a three-day-old setup sees how old it is.
    assert.equal(
      storedSetupReviewedAt(buildSetup({ created_at: "2026-07-30T09:00:00.000Z" })),
      Date.parse("2026-07-30T09:00:00.000Z"),
    );
  });

  it("prints no stamp at all rather than a placeholder for an unparseable timestamp", () => {
    assert.equal(storedSetupReviewedAt(buildSetup({ created_at: "" })), null);
    assert.equal(
      storedSetupReviewedAt(buildSetup({ created_at: "not-a-date" })),
      null,
    );
  });
});
