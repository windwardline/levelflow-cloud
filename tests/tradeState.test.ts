import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MAX_PRICE_DECIMALS } from "../src/components/workspace/advisorFormat";
import { deriveTradeState } from "../src/lib/tradeState";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer";

// Spec §7's canonical two-target sentence, verbatim — the same pinned
// literal tests/languageGuard.test.ts checks against
// AdvisorRecommendationPanel.tsx. The "open, pre-Target-1" trade state
// reuses this exact wording rather than a paraphrase.
const CANONICAL_LADDER_INSTRUCTION =
  "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — the banked half is yours either way.";

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
      tp1Banked: false,
    });
  });

  it("ignores a still-pending outcome row while status is generated", () => {
    // The engine never writes trade_outcomes before a fill (outcome-sync
    // only calls writeOutcome once evaluation.state is "placed" or
    // "resolved"), but the rail must not misread one if it ever showed up.
    const setup = buildSetup({
      status: "generated",
      trade_outcomes: [buildOutcome({ outcome: "pending" })],
    });
    assert.equal(deriveTradeState(setup, NOW)?.status, "pending");
  });

  // Q2-I6: this file's header states that RESOLVED_OUTCOMES is checked "even
  // when setup.status hasn't (or couldn't) catch up in lockstep, since the rail
  // must never show a done trade as actionable" — and the generated early return
  // used to sit AHEAD of that check, so a resolved outcome on a generated row
  // came back Pending and the rail offered a finished trade as an order to
  // place. The test that claimed to cover it stubbed outcome "pending", which is
  // Pending either way. Not producible by today's engine, which writes status
  // before outcome sequentially — but not relying on that is the whole point of
  // the defensive check.
  it("takes a generated row off the rail when its outcome is already resolved, whatever the status says", () => {
    for (
      const outcome of [
        "stop_loss",
        "take_profit",
        "unfilled",
        "tp1_partial",
        "expired_at_loss",
        "manual_close",
        "ambiguous",
      ]
    ) {
      const setup = buildSetup({
        status: "generated",
        trade_outcomes: [buildOutcome({ outcome })],
      });
      assert.equal(deriveTradeState(setup, NOW), null, outcome);
    }
  });

  it("checks the resolved outcome before it decides a generated row is pending", () => {
    // The ordering itself, so a future edit cannot restore the early return
    // above the guard and leave the behaviour above passing by luck.
    const source = readFileSync("src/lib/tradeState.ts", "utf8");
    const resolvedGuard = source.indexOf("RESOLVED_OUTCOMES.has(outcomeRow.outcome)");
    const generatedReturn = source.indexOf('if (setup.status === "generated")');
    assert.ok(resolvedGuard > 0 && generatedReturn > 0);
    assert.ok(
      resolvedGuard < generatedReturn,
      "the resolved-outcome guard must precede the generated early return",
    );
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

describe("deriveTradeState — every generated setup is Pending (§17m supersedes I1)", () => {
  it("a scan-origin, unfilled setup earns Pending — since Scan is the only door, its setups ARE the orders-in-waiting (owner-observed miss, 2026-08-01)", () => {
    const setup = buildSetup({ origin: "scan", status: "generated" });
    assert.equal(deriveTradeState(setup, NOW)?.status, "pending");
  });

  it("a review-origin, unfilled setup still keeps Pending", () => {
    const setup = buildSetup({ origin: "review", status: "generated" });
    assert.equal(deriveTradeState(setup, NOW)?.status, "pending");
  });

  it("an unfilled setup with no origin at all (pre-migration rows) still keeps Pending", () => {
    const setup = buildSetup({ origin: undefined, status: "generated" });
    assert.equal(deriveTradeState(setup, NOW)?.status, "pending");
  });

  it("the origin field is not read at all — the derivation is origin-blind by construction", () => {
    const source = readFileSync("src/lib/tradeState.ts", "utf8");
    assert.doesNotMatch(source, /\.origin\b/);
  });

  it("a scan-origin setup that has actually been placed and filled still earns Open — the gate is only on the unfilled/generated state", () => {
    const setup = buildSetup({
      origin: "scan",
      status: "placed",
      trade_outcomes: [buildOutcome({ feedback: { tp1Hit: false } })],
    });
    assert.equal(deriveTradeState(setup, NOW)?.status, "open");
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
      tp1Banked: false,
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

describe("deriveTradeState — open, Target 1 already hit (spec §8, I6)", () => {
  it("banks the exact bank-half instruction with the entry price and no age — there is no genuine Target 1 timestamp to report one from", () => {
    const setup = buildSetup({
      limit_entry: 1.0865,
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { tp1Hit: true },
          filled_at: "2026-07-30T11:46:00.000Z",
        }),
      ],
    });
    assert.deepEqual(deriveTradeState(setup, NOW), {
      instruction:
        `Target 1 hit — bank half, move stop to ${formattedPrice(1.0865)}`,
      progressR: null,
      status: "open",
      tp1Banked: true,
    });
  });

  it("never reports an age, however old filled_at is — it's the entry fill, not Target 1's own timestamp", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [
        buildOutcome({
          feedback: { tp1Hit: true },
          filled_at: "2026-07-29T11:00:00.000Z", // 25 hours before NOW
        }),
      ],
    });
    const state = deriveTradeState(setup, NOW);
    assert.equal("eventAge" in (state ?? {}), false);
    assert.doesNotMatch(state?.instruction ?? "", /\bago\b|\bjust now\b/);
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

  it("sets tp1Banked so the rail knows to drop Target 1 from the remaining levels (CurrentTradesRail.buildRemainingLevels)", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ feedback: { tp1Hit: true } })],
    });
    assert.equal(deriveTradeState(setup, NOW)?.tp1Banked, true);
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
