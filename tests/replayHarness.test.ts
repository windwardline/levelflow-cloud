import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateSetupOutcome,
  getSetupExpiryTime,
  type ReplayBar,
  type ReplaySetup,
} from "../supabase/functions/trade-analyzer/replay.ts";

const createdAt = Date.parse("2026-06-15T14:00:00.000Z");

describe("trade analyzer replay harness", () => {
  it("resolves a buy limit that fills and reaches target", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 101, 99.8, 100.5),
      buildBar(30, 105.4, 100.2, 104.8),
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "take_profit",
    );
  });

  it("resolves a sell limit that fills and hits stop", () => {
    const setup = buildSetup({
      entry: 100,
      side: "sell",
      stop: 102,
      target: 95,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 100.4, 99.7, 100.1),
      buildBar(30, 102.5, 99.4, 102.1),
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "stop_loss",
    );
  });

  it("marks an unfilled setup after the category review window expires", () => {
    const setup = buildSetup({
      entry: 98,
      side: "buy",
      stop: 96,
      target: 103,
    });
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);
    const result = evaluateSetupOutcome(
      setup,
      [buildBar(15, 101, 99, 100)],
      expiresAt + 1,
    );

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "unfilled",
    );
  });

  it("cuts off forex reviews before the Friday New York close", () => {
    const fridayAfternoon = Date.parse("2026-06-12T20:45:00.000Z");

    assert.equal(
      new Date(getSetupExpiryTime("EURUSD", fridayAfternoon)).toISOString(),
      "2026-06-12T20:54:00.000Z",
    );
  });

  it("cuts off futures reviews before the Friday New York close", () => {
    const fridayAfternoon = Date.parse("2026-06-12T20:45:00.000Z");

    assert.equal(
      new Date(getSetupExpiryTime("ESUSD", fridayAfternoon)).toISOString(),
      "2026-06-12T20:55:00.000Z",
    );
  });

  it("uses futures-style Friday cutoffs for indices and energies", () => {
    const fridayAfternoon = Date.parse("2026-06-12T20:45:00.000Z");

    assert.equal(
      new Date(getSetupExpiryTime("SP", fridayAfternoon)).toISOString(),
      "2026-06-12T20:55:00.000Z",
    );
    assert.equal(
      new Date(getSetupExpiryTime("WTI", fridayAfternoon)).toISOString(),
      "2026-06-12T20:55:00.000Z",
    );
  });

  it("resolves tp1_partial when TP1 hits and price returns to breakeven", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 100.4, 99.8, 100.2),
      buildBar(30, 101.3, 100.1, 101.1), // TP1 touched
      buildBar(45, 101.2, 99.9, 100.0), // back to breakeven, runner never hit
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "tp1_partial",
    );
    assert.equal(
      result.state === "resolved" ? result.feedback.tp1Hit : null,
      true,
    );
  });

  it("resolves take_profit when the runner hits after TP1", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 100.4, 99.8, 100.2),
      buildBar(30, 101.3, 100.1, 101.1),
      buildBar(45, 105.2, 100.9, 104.9),
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "take_profit",
    );
  });

  it("resolves tp1_partial when TP1 hit and the window expires", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);
    const result = evaluateSetupOutcome(
      setup,
      [
        buildBar(15, 100.4, 99.8, 100.2),
        buildBar(30, 101.3, 100.4, 101.1),
      ],
      expiresAt + 1,
    );

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "tp1_partial",
    );
  });

  it("splits filled expiries into profit and loss instead of ambiguous", () => {
    const inProfit = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105, tp1: 103 }),
      [
        buildBar(15, 100.6, 99.8, 100.2),
        buildBar(30, 101.4, 100.1, 101.2),
      ],
      getSetupExpiryTime("EURUSD", createdAt) + 1,
    );
    const atLoss = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105, tp1: 103 }),
      [
        buildBar(15, 100.4, 99.7, 100.1),
        buildBar(30, 100.3, 99.1, 99.3),
      ],
      getSetupExpiryTime("EURUSD", createdAt) + 1,
    );

    assert.equal(inProfit.state, "resolved");
    assert.equal(
      inProfit.state === "resolved" ? inProfit.outcome : null,
      "expired_in_profit",
    );
    assert.equal(
      inProfit.state === "resolved" ? inProfit.feedback.realizedR : null,
      0.6,
    );
    assert.equal(atLoss.state, "resolved");
    assert.equal(
      atLoss.state === "resolved" ? atLoss.outcome : null,
      "expired_at_loss",
    );
  });

  it("keeps legacy single-target setups working without a TP1", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 101, 99.8, 100.5),
      buildBar(30, 105.4, 100.2, 104.8),
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "take_profit",
    );
  });

  it("resolves a fill-bar stop-and-target bar as stop_loss — the stop is certain, the target is not (2c)", () => {
    // On the FILL bar of a buy limit, price provably crossed down through
    // the entry (that crossing IS the fill), and any path to the stop below
    // passes entry first — so a stop-reach is certain. The high may have
    // printed before the fill ever happened, so a target-reach is
    // unknowable. The old resolver called this "ambiguous" and the
    // accountant scored it 0R — phantom neutrality on bars that were
    // knowably losses.
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 104,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 104.5, 97.5, 101.2),
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "stop_loss",
    );
  });

  it("keeps ambiguity for post-fill bars, where extreme order is genuinely unknowable", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 104,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 100.6, 99.8, 100.2),
      buildBar(30, 104.5, 97.5, 101.2),
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "ambiguous",
    );
    assert.equal(
      result.state === "resolved" ? result.feedback.ambiguousSameBar : null,
      true,
    );
  });

  it("never credits a target touched on the fill bar itself (2c)", () => {
    // The fill bar's high clears the runner target; the next bar hits the
    // stop. A resolver that reads the fill bar's high as post-fill would
    // print take_profit on a trade that was knowably never in profit.
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 105.5, 99.9, 100.5),
      buildBar(30, 100.8, 97.9, 98.2),
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "stop_loss",
    );
  });

  it("never banks a TP1 touched on the fill bar, and starts favorable excursion after it (2c)", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 103.5, 99.9, 100.4),
      buildBar(30, 100.8, 97.9, 98.2),
    ]);

    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "stop_loss",
    );
    assert.equal(
      result.state === "resolved" ? result.feedback.tp1Hit : null,
      false,
    );
    // maxFavorableMove reads 0.8 (bar two's high over entry), never the fill
    // bar's 3.5 — the excursion statistic obeys the same knowability rule.
    assert.equal(
      result.state === "resolved" ? result.feedback.maxFavorableMove : null,
      0.8,
    );
  });

  // Regression for the r19/r20 window-grid artifact: a review-hours override
  // must govern outcome resolution, not just setup construction. A variant
  // measured with shortened geometry but file-length resolution time reports
  // inflated results.
  it("lets a review-hours override govern resolution", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
    });
    const bars = [
      buildBar(60, 102, 100.5, 101),
      buildBar(300, 101, 99.5, 100.6),
      buildBar(390, 105.5, 100.4, 105.2),
    ];
    const now = createdAt + 9 * 60 * 60 * 1000;

    assert.equal(
      getSetupExpiryTime("EURUSD", createdAt, 4),
      createdAt + 4 * 60 * 60 * 1000,
    );

    const fileWindow = evaluateSetupOutcome(setup, bars, now);
    assert.equal(fileWindow.state, "resolved");
    assert.equal(
      fileWindow.state === "resolved" ? fileWindow.outcome : null,
      "take_profit",
    );

    const shortWindow = evaluateSetupOutcome(setup, bars, now, {
      reviewHours: 4,
    });
    assert.equal(shortWindow.state, "resolved");
    assert.equal(
      shortWindow.state === "resolved" ? shortWindow.outcome : null,
      "unfilled",
    );
  });
});

// 4c axis (owner-approved 2026-08-10): runner protection is a parameter,
// not a hardcoded jump. The baseline measured the breakeven jump as a tax
// — 44% of forex fills touched TP1 at +0.92R median MFE and scratched at
// breakeven — so the resolver now takes the protection mode: "breakeven"
// (the shipped default, unchanged), "hold" (the stop never moves), and
// "trail_tp1" (the stop locks to TP1's level once banked).
describe("runner protection — the post-TP1 stop is a mode (4c)", () => {
  const ladder = () =>
    buildSetup({ entry: 100, side: "buy", stop: 98, target: 105, tp1: 101 });
  const bars = (thirdBar: ReplayBar) => [
    buildBar(15, 100.4, 99.8, 100.2),
    buildBar(30, 101.3, 100.1, 101.1),
    thirdBar,
  ];

  it("holds the original stop when protection is hold — a breakeven touch is not an exit", () => {
    const result = evaluateSetupOutcome(
      ladder(),
      bars(buildBar(45, 100.6, 99.6, 100.2)),
      // Inside the review window: the question is the stop, not expiry.
      Date.parse("2026-06-15T15:30:00.000Z"),
      { runnerProtection: "hold" },
    );
    // Under breakeven protection this bar (low 99.6 <= entry 100) exits;
    // under hold the runner stays open and the window expires later.
    assert.equal(result.state, "placed");
  });

  it("exits at the ORIGINAL stop under hold, pricing the full loss on the runner half", () => {
    const result = evaluateSetupOutcome(
      ladder(),
      bars(buildBar(45, 100.4, 97.9, 98.2)),
      undefined,
      { runnerProtection: "hold" },
    );
    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "tp1_partial",
    );
    if (result.state === "resolved") {
      assert.deepEqual(result.legs.at(-1), {
        kind: "stop_loss",
        leg: "exit",
        price: 98,
        time: Date.parse("2026-06-15T14:45:00.000Z"),
      });
    }
  });

  it("locks the runner at TP1's level under trail_tp1", () => {
    const result = evaluateSetupOutcome(
      ladder(),
      // Opens ABOVE the lock so the exit is the level, not a gap print —
      // the gap rule (2f) still applies to a locked stop like any other.
      bars(buildBar(45, 101.4, 100.7, 100.8, 101.2)),
      undefined,
      { runnerProtection: "trail_tp1" },
    );
    assert.equal(result.state, "resolved");
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "tp1_partial",
    );
    if (result.state === "resolved") {
      assert.deepEqual(result.legs.at(-1), {
        kind: "tp1_lock",
        leg: "exit",
        price: 101,
        time: Date.parse("2026-06-15T14:45:00.000Z"),
      });
    }
  });

  it("defaults to breakeven — the shipped behavior is byte-identical without the option", () => {
    const explicit = evaluateSetupOutcome(
      ladder(),
      bars(buildBar(45, 101.2, 99.9, 100.0)),
      undefined,
      { runnerProtection: "breakeven" },
    );
    const implicit = evaluateSetupOutcome(
      ladder(),
      bars(buildBar(45, 101.2, 99.9, 100.0)),
    );
    assert.deepEqual(explicit, implicit);
    assert.equal(
      implicit.state === "resolved" ? implicit.legs.at(-1)?.kind : null,
      "breakeven_stop",
    );
  });
});

// 2f (2026-08-09): a resolution is a sequence of executions, not a label.
// The sweep's accountant used to reconstruct R from the plan's NOMINAL
// levels — every stop exits exactly at the stop, every fill exactly at the
// limit — which no gapped market honors. The resolver now records the legs
// it actually concluded: {leg, price, time}, gap-aware. A bar that OPENS
// beyond a level executes at its open — worse than the stop on a gap
// through it, better than a limit on a gap past it — because the open is
// the first print an order could meet.
describe("resolution legs — what actually executed, at what price (2f)", () => {
  const legsOf = (result: ReturnType<typeof evaluateSetupOutcome>) =>
    result.state === "resolved" ? result.legs : null;

  it("records entry and target legs at their levels when no gap intervenes", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 }),
      [
        buildBar(15, 101, 99.8, 100.5),
        buildBar(30, 105.4, 100.2, 104.8),
      ],
    );
    assert.deepEqual(legsOf(result), [
      { leg: "entry", price: 100, time: createdAt + 15 * 60_000 },
      {
        kind: "take_profit",
        leg: "exit",
        price: 105,
        time: createdAt + 30 * 60_000,
      },
    ]);
  });

  it("records the banked TP1 leg between entry and runner exit", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105, tp1: 101 }),
      [
        buildBar(15, 100.4, 99.8, 100.2),
        buildBar(30, 101.3, 100.1, 100.9),
        buildBar(45, 105.2, 100.9, 104.9),
      ],
    );
    assert.deepEqual(legsOf(result), [
      { leg: "entry", price: 100, time: createdAt + 15 * 60_000 },
      { leg: "tp1", price: 101, time: createdAt + 30 * 60_000 },
      {
        kind: "take_profit",
        leg: "exit",
        price: 105,
        time: createdAt + 45 * 60_000,
      },
    ]);
  });

  it("fills a limit at the open when the bar gaps through it — price improvement is real", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 }),
      [
        buildBar(15, 100.2, 99.3, 99.8, 99.5),
        buildBar(30, 105.4, 100.2, 104.8),
      ],
    );
    const legs = legsOf(result);
    assert.equal(legs?.[0].price, 99.5);
  });

  it("exits at the open when a bar gaps through the stop — the stop's price is a hope, the open is a print", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 }),
      [
        buildBar(15, 100.6, 99.9, 100.2),
        buildBar(30, 97.9, 97.1, 97.6, 97.4),
      ],
    );
    assert.equal(result.state === "resolved" ? result.outcome : null, "stop_loss");
    assert.deepEqual(legsOf(result)?.at(-1), {
      kind: "stop_loss",
      leg: "exit",
      price: 97.4,
      time: createdAt + 30 * 60_000,
    });
  });

  it("mirrors the gap rule for a sell — an open above the stop is the exit print", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "sell", stop: 102, target: 95 }),
      [
        buildBar(15, 100.4, 99.7, 100.1),
        buildBar(30, 103.1, 102.2, 102.8, 102.6),
      ],
    );
    assert.deepEqual(legsOf(result)?.at(-1), {
      kind: "stop_loss",
      leg: "exit",
      price: 102.6,
      time: createdAt + 30 * 60_000,
    });
  });

  it("banks a runner that gaps beyond the target at the open's better price", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 }),
      [
        buildBar(15, 100.6, 99.9, 100.2),
        buildBar(30, 106.2, 105.1, 105.8, 105.6),
      ],
    );
    assert.deepEqual(legsOf(result)?.at(-1), {
      kind: "take_profit",
      leg: "exit",
      price: 105.6,
      time: createdAt + 30 * 60_000,
    });
  });

  it("records the breakeven exit as its own kind at its own print", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105, tp1: 101 }),
      [
        buildBar(15, 100.4, 99.8, 100.2),
        buildBar(30, 101.3, 100.1, 101.1),
        buildBar(45, 100.4, 99.6, 99.9, 99.95),
      ],
    );
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "tp1_partial",
    );
    assert.deepEqual(legsOf(result)?.at(-1), {
      kind: "breakeven_stop",
      leg: "exit",
      price: 99.95,
      time: createdAt + 45 * 60_000,
    });
  });

  it("prices an ambiguous exit at the stop side — unknowable order resolves against the trade (2e's ground)", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 104 }),
      [
        buildBar(15, 100.6, 99.8, 100.2),
        buildBar(30, 104.5, 97.5, 101.2),
      ],
    );
    assert.equal(result.state === "resolved" ? result.outcome : null, "ambiguous");
    assert.deepEqual(legsOf(result)?.at(-1), {
      kind: "ambiguous",
      leg: "exit",
      price: 98,
      time: createdAt + 30 * 60_000,
    });
  });

  it("closes an expiry at the last close it saw", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 }),
      [
        buildBar(15, 100.4, 99.7, 100.1),
        buildBar(30, 100.9, 100.0, 100.7),
      ],
      getSetupExpiryTime("EURUSD", createdAt) + 1,
    );
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "expired_in_profit",
    );
    assert.deepEqual(legsOf(result)?.at(-1), {
      kind: "expiry",
      leg: "exit",
      price: 100.7,
      time: createdAt + 30 * 60_000,
    });
  });

  it("measures an expiry's realized R from the actual fill price, not the nominal limit", () => {
    // Gap-improved entry at 99.5; last close 100.7; risk stays the planned
    // |100-98|=2, so realized R = (100.7-99.5)/2 = 0.6.
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 }),
      [
        buildBar(15, 100.2, 99.3, 99.8, 99.5),
        buildBar(30, 100.9, 100.0, 100.7),
      ],
      getSetupExpiryTime("EURUSD", createdAt) + 1,
    );
    assert.equal(
      result.state === "resolved" ? result.feedback.realizedR : null,
      0.6,
    );
  });

  it("resolves a fill bar that opens beyond the stop as an immediate scratch at the open", () => {
    // A resting buy limit meets a gap open below the stop: it fills at the
    // open, and the stop closes it at the same print — both legs at 97.4.
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 }),
      [buildBar(15, 98.0, 97.0, 97.7, 97.4)],
    );
    assert.equal(result.state === "resolved" ? result.outcome : null, "stop_loss");
    assert.deepEqual(legsOf(result), [
      { leg: "entry", price: 97.4, time: createdAt + 15 * 60_000 },
      {
        kind: "stop_loss",
        leg: "exit",
        price: 97.4,
        time: createdAt + 15 * 60_000,
      },
    ]);
  });

  it("reports an unfilled resolution with no legs", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 90, side: "buy", stop: 88, target: 95 }),
      [buildBar(15, 100.4, 99.7, 100.1)],
      getSetupExpiryTime("EURUSD", createdAt) + 1,
    );
    assert.equal(result.state === "resolved" ? result.outcome : null, "unfilled");
    assert.deepEqual(legsOf(result), []);
  });

  it("carries the legs into feedback, where outcome-sync persists them for the learning tables", () => {
    const result = evaluateSetupOutcome(
      buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 }),
      [
        buildBar(15, 101, 99.8, 100.5),
        buildBar(30, 105.4, 100.2, 104.8),
      ],
    );
    assert.equal(result.state, "resolved");
    if (result.state === "resolved") {
      assert.deepEqual(result.feedback.legs, result.legs);
    }
  });
});

function buildSetup({
  entry,
  side,
  stop,
  target,
  tp1,
}: {
  entry: number;
  side: ReplaySetup["side"];
  stop: number;
  target: number;
  tp1?: number;
}): ReplaySetup {
  return {
    created_at: new Date(createdAt).toISOString(),
    limit_entry: entry,
    side,
    stop_loss: stop,
    symbol: "EURUSD",
    take_profit: target,
    take_profit_1: tp1 ?? null,
  };
}

function buildBar(
  minutesAfterCreated: number,
  high: number,
  low: number,
  close: number,
  open = close,
): ReplayBar {
  return {
    close,
    high,
    low,
    open,
    time: createdAt + minutesAfterCreated * 60 * 1000,
    volume: 1000,
  };
}
