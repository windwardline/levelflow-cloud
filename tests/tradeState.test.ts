import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_PRICE_DECIMALS } from "../src/components/workspace/advisorFormat";
import { deriveTradeState } from "../src/lib/tradeState";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer";

// Spec §7's canonical two-target sentence, verbatim — the same pinned
// literal tests/languageGuard.test.ts checks against
// AdvisorRecommendationPanel.tsx. The "open, pre-Target-1" trade state
// reuses this exact wording rather than a paraphrase.
const CANONICAL_LADDER_INSTRUCTION =
  "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — profit locked either way.";

const NOW = new Date("2026-07-30T12:00:00.000Z");

// Mirrors formatNumber's own toLocaleString(undefined, ...) call instead of
// hardcoding one locale's decimal/grouping — same technique
// tests/advisorFormat.test.ts and tests/scopeMenu.test.tsx already use for
// locale-dependent Intl output, so this suite passes under any machine
// locale.
function formattedPrice(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: MAX_PRICE_DECIMALS,
  });
}

type OutcomeRow = NonNullable<TradeSetupRow["trade_outcomes"]>[number];

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

describe("deriveTradeState — pending (spec §8)", () => {
  it("an unfilled, freshly generated setup is Pending with the exact wait instruction", () => {
    const setup = buildSetup({ limit_entry: 1.0865, status: "generated" });
    assert.deepEqual(deriveTradeState(setup, NOW), {
      instruction: `Order pending at ${formattedPrice(1.0865)} — nothing to do yet`,
      progressR: null,
      status: "pending",
    });
  });

  it("ignores any stray outcome row while status is still generated", () => {
    // The engine never writes trade_outcomes before a fill (outcome-sync
    // only calls writeOutcome once evaluation.state is "placed" or
    // "resolved"), but the rail must not misread one if it ever showed up.
    const setup = buildSetup({
      status: "generated",
      trade_outcomes: [buildOutcome({ outcome: "pending" })],
    });
    assert.equal(deriveTradeState(setup, NOW)?.status, "pending");
  });

  it("formats the sell-side entry the same way", () => {
    const setup = buildSetup({
      limit_entry: 0.8821,
      side: "sell",
      status: "generated",
    });
    assert.equal(
      deriveTradeState(setup, NOW)?.instruction,
      `Order pending at ${formattedPrice(0.8821)} — nothing to do yet`,
    );
  });
});

describe("deriveTradeState — open, pre-Target-1 (spec §8)", () => {
  it("a filled setup still short of Target 1 is Open with the canonical two-target instruction, verbatim", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { tp1Hit: false },
          filled_at: "2026-07-30T11:00:00.000Z",
        }),
      ],
    });
    assert.deepEqual(deriveTradeState(setup, NOW), {
      instruction: CANONICAL_LADDER_INSTRUCTION,
      progressR: null,
      status: "open",
    });
  });

  it("carries feedback.realizedR through as progressR when the engine already has one", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: 0.3, tp1Hit: false } }),
      ],
    });
    assert.equal(deriveTradeState(setup, NOW)?.progressR, 0.3);
  });

  it("progressR is null, not zero or NaN, when the engine has not recorded a realizedR yet", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ feedback: { tp1Hit: false } })],
    });
    assert.equal(deriveTradeState(setup, NOW)?.progressR, null);
  });

  it("treats a missing feedback blob the same as an empty one, without throwing", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ feedback: null })],
    });
    const state = deriveTradeState(setup, NOW);
    assert.equal(state?.status, "open");
    assert.equal(state?.progressR, null);
    assert.equal(state?.instruction, CANONICAL_LADDER_INSTRUCTION);
  });

  it("treats a freshly-placed setup with no outcome row yet the same way (defensive)", () => {
    const setup = buildSetup({ status: "placed", trade_outcomes: undefined });
    const state = deriveTradeState(setup, NOW);
    assert.equal(state?.status, "open");
    assert.equal(state?.instruction, CANONICAL_LADDER_INSTRUCTION);
  });
});

describe("deriveTradeState — open, Target 1 already hit (spec §8)", () => {
  it("banks the exact bank-half instruction with the entry price and a coarse age in minutes", () => {
    const setup = buildSetup({
      limit_entry: 1.0865,
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { tp1Hit: true },
          filled_at: "2026-07-30T11:46:00.000Z", // 14 minutes before NOW
        }),
      ],
    });
    assert.deepEqual(deriveTradeState(setup, NOW), {
      eventAge: "14 min ago",
      instruction:
        `Target 1 hit 14 min ago — bank half, move stop to ${formattedPrice(1.0865)}`,
      progressR: null,
      status: "open",
    });
  });

  it("buckets in whole hours once past 60 minutes", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { tp1Hit: true },
          filled_at: "2026-07-30T09:55:00.000Z", // 125 minutes before NOW
        }),
      ],
    });
    assert.equal(deriveTradeState(setup, NOW)?.eventAge, "2 h ago");
  });

  it("buckets in whole days once past 24 hours", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { tp1Hit: true },
          filled_at: "2026-07-29T11:00:00.000Z", // 25 hours before NOW
        }),
      ],
    });
    assert.equal(deriveTradeState(setup, NOW)?.eventAge, "1 d ago");
  });

  it('reports "just now" for an age under a minute', () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { tp1Hit: true },
          filled_at: "2026-07-30T11:59:40.000Z",
        }),
      ],
    });
    assert.equal(deriveTradeState(setup, NOW)?.eventAge, "just now");
  });

  it("falls back to reviewed_at when filled_at is missing", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { tp1Hit: true },
          filled_at: null,
          reviewed_at: "2026-07-30T11:46:00.000Z",
        }),
      ],
    });
    assert.equal(deriveTradeState(setup, NOW)?.eventAge, "14 min ago");
  });

  it("still reports progressR from feedback.realizedR alongside the bank-half instruction", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { realizedR: 0.5, tp1Hit: true },
          filled_at: "2026-07-30T11:46:00.000Z",
        }),
      ],
    });
    assert.equal(deriveTradeState(setup, NOW)?.progressR, 0.5);
  });
});

describe("deriveTradeState — resolved outcomes are excluded; Insights holds them (spec §8)", () => {
  const resolvedCases: Array<{ outcome: string; status: string }> = [
    { outcome: "take_profit", status: "filled" },
    { outcome: "stop_loss", status: "filled" },
    { outcome: "breakeven", status: "filled" },
    { outcome: "manual_close", status: "filled" },
    { outcome: "expired", status: "filled" },
    { outcome: "ambiguous", status: "filled" },
    { outcome: "tp1_partial", status: "filled" },
    { outcome: "expired_in_profit", status: "filled" },
    { outcome: "expired_at_loss", status: "filled" },
    { outcome: "unfilled", status: "expired" },
  ];

  for (const { outcome, status } of resolvedCases) {
    it(`outcome "${outcome}" (status "${status}") returns null`, () => {
      const setup = buildSetup({
        status,
        trade_outcomes: [buildOutcome({ outcome })],
      });
      assert.equal(deriveTradeState(setup, NOW), null);
    });
  }

  it("a cancelled setup is excluded even with no outcome row", () => {
    assert.equal(
      deriveTradeState(buildSetup({ status: "cancelled" }), NOW),
      null,
    );
  });

  it("an invalidated setup is excluded even with no outcome row", () => {
    assert.equal(
      deriveTradeState(buildSetup({ status: "invalidated" }), NOW),
      null,
    );
  });

  it("defensively excludes a 'placed' setup whose outcome already resolved, even if status lags", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ outcome: "stop_loss" })],
    });
    assert.equal(deriveTradeState(setup, NOW), null);
  });
});
