import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInsightsResult } from "../src/components/workspace/historyUtils.ts";
import { OUTCOME_COPY } from "../src/lib/outcomes.ts";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer.ts";

describe("outcome copy — plain target vocabulary", () => {
  it("labels the partial-target outcome around the first target, not TP1", () => {
    assert.equal(OUTCOME_COPY.partial_target.label, "First target reached");
    assert.equal(
      OUTCOME_COPY.partial_target.filterLabel,
      "First target reached",
    );
    assert.equal(OUTCOME_COPY.partial_target.shortLabel, "Target 1");
  });

  it("describes the partial-target outcome in first/second-target language", () => {
    assert.match(OUTCOME_COPY.partial_target.description, /first target/i);
    assert.match(OUTCOME_COPY.partial_target.description, /second target/i);
  });

  it("never mentions TP1 or runner in any outcome copy string", () => {
    for (const [outcome, copy] of Object.entries(OUTCOME_COPY)) {
      for (const [field, value] of Object.entries(copy)) {
        assert.doesNotMatch(value, /\bTP1\b/, `${outcome}.${field}: "${value}"`);
        assert.doesNotMatch(
          value,
          /\brunner\b/i,
          `${outcome}.${field}: "${value}"`,
        );
      }
    }
  });
});

// Insights ledger result labels (spec §10). Same builder shape as
// tests/tradeState.test.ts and tests/currentTradesRail.test.tsx.
type OutcomeRow = NonNullable<TradeSetupRow["trade_outcomes"]>[number];

const NOW = new Date("2026-07-30T12:00:00.000Z");

function buildSetup(overrides: Partial<TradeSetupRow> = {}): TradeSetupRow {
  return {
    analyzer_version: "unversioned",
    breakeven_trigger_price: 1.0865,
    confidence_score: 78,
    confluence: {},
    correlation_group: null,
    created_at: "2026-07-30T09:00:00.000Z",
    id: "setup-1",
    limit_entry: 1.0865,
    origin: "review",
    risk_model: {},
    side: "buy",
    status: "generated",
    stop_loss: 1.083,
    symbol: "EURUSD",
    take_profit: 1.095,
    take_profit_1: 1.09,
    trade_outcomes: undefined,
    ...overrides,
  };
}

function buildOutcome(overrides: Partial<OutcomeRow> = {}): OutcomeRow {
  return {
    exit_at: null,
    feedback: {},
    filled_at: null,
    outcome: "pending",
    realized_pnl: null,
    reviewed_at: null,
    ...overrides,
  };
}

describe("formatInsightsResult — one label per outcome class (spec §10)", () => {
  it("an unfilled, freshly generated setup reads Pending, never with an R", () => {
    assert.equal(
      formatInsightsResult(buildSetup({ status: "generated" }), NOW),
      "Pending",
    );
  });

  it("a filled, unresolved setup with no realizedR yet reads bare Open", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ feedback: { tp1Hit: false } })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Open");
  });

  it("a filled, unresolved setup carries its realizedR when the engine has one", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ feedback: { realizedR: 0.8 } })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Open · +0.8R");
  });

  it("target_reached reads Target 2, bare when no realizedR is recorded", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Target 2");
  });

  it("target_reached carries its realizedR, exactly per spec's example", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: 2.1 }, outcome: "take_profit" }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Target 2 · +2.1R");
  });

  it("partial_target (tp1_partial) reads Banked half with its realizedR, exactly per spec's example", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: 0.4 }, outcome: "tp1_partial" }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Banked half · +0.4R");
  });

  it("stopped_out reads Stopped with a negative realizedR, exactly per spec's example (typographic minus)", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: -1 }, outcome: "stop_loss" }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Stopped · −1.0R");
  });

  it("stopped_out reads bare Stopped when no realizedR is recorded", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [buildOutcome({ outcome: "stop_loss" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Stopped");
  });

  it("expired_in_profit reads Expired with its positive realizedR", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({
          feedback: { realizedR: 0.3 },
          outcome: "expired_in_profit",
        }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Expired · +0.3R");
  });

  it("expired_in_loss reads Expired with its negative realizedR", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({
          feedback: { realizedR: -0.5 },
          outcome: "expired_at_loss",
        }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Expired · −0.5R");
  });

  it("unclear_path (ambiguous) reads Needs review", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [buildOutcome({ outcome: "ambiguous" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Needs review");
  });

  it('entry_not_filled on a scan-origin setup reads "Not taken", never "Unfilled"', () => {
    const setup = buildSetup({
      origin: "scan",
      status: "expired",
      trade_outcomes: [buildOutcome({ outcome: "unfilled" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Not taken");
  });

  it('entry_not_filled on a review-origin setup reads "Unfilled", never "Not taken"', () => {
    const setup = buildSetup({
      origin: "review",
      status: "expired",
      trade_outcomes: [buildOutcome({ outcome: "unfilled" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Unfilled");
  });

  it('treats a missing origin the same as review-origin ("Unfilled"), never crashing or reading "Not taken"', () => {
    const setup = buildSetup({
      origin: undefined,
      status: "expired",
      trade_outcomes: [buildOutcome({ outcome: "unfilled" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Unfilled");
  });

  it("never renders the raw origin value anywhere in the label (owner ruling: no origin in the UI)", () => {
    for (
      const origin of ["review", "scan"] as const
    ) {
      const setup = buildSetup({
        origin,
        status: "filled",
        trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
      });
      assert.doesNotMatch(formatInsightsResult(setup, NOW), /review|scan/i);
    }
  });

  it("falls back to the plain outcome label for a closed setup with no outcome row (data anomaly), instead of throwing", () => {
    const setup = buildSetup({ status: "cancelled", trade_outcomes: undefined });
    assert.equal(formatInsightsResult(setup, NOW), OUTCOME_COPY.still_tracking.label);
  });
});
