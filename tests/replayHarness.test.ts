import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  evaluateSetupOutcome,
  fillOptionsFromRiskModel,
  getSetupExpiryTime,
  type ReplayBar,
  type ReplaySetup,
  resolutionSeriesFor,
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

describe("engine v2 — the venue's fills (round-8 FR-1/3/4/6/7/8, LA-2/13)", () => {
  const farNow = createdAt + 365 * 24 * 60 * 60 * 1000;

  it("FR-1: a buy limit needs the ASK at its level — mid a hair above is no fill", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [buildBar(15, 101, 99.97, 100.5)];
    const withoutSpread = evaluateSetupOutcome(setup, bars, farNow);
    const withSpread = evaluateSetupOutcome(setup, bars, farNow, {
      halfSpread: 0.05,
    });
    assert.equal(
      withoutSpread.state === "resolved" ? withoutSpread.outcome : null,
      "expired_in_profit",
    );
    assert.equal(
      withSpread.state === "resolved" ? withSpread.outcome : null,
      "unfilled",
    );
  });

  it("FR-1: the BID reaches the stop half a spread before mid does", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [
      buildBar(15, 100.4, 99.9, 100.2),
      buildBar(30, 100.5, 98.03, 100.4, 100.1),
    ];
    const withoutSpread = evaluateSetupOutcome(setup, bars, farNow);
    assert.notEqual(
      withoutSpread.state === "resolved" ? withoutSpread.outcome : null,
      "stop_loss",
    );
    const withSpread = evaluateSetupOutcome(setup, bars, farNow, {
      halfSpread: 0.05,
    });
    assert.equal(
      withSpread.state === "resolved" ? withSpread.outcome : null,
      "stop_loss",
    );
    const exit = withSpread.state === "resolved"
      ? withSpread.legs.find((leg) => leg.leg === "exit")
      : null;
    assert.equal(exit?.price, 98);
  });

  it("FR-1: the target needs the BID at its level — mid touching is not a fill", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [
      buildBar(15, 100.4, 99.9, 100.2),
      buildBar(30, 105.03, 100.1, 104.9),
    ];
    const withoutSpread = evaluateSetupOutcome(setup, bars, farNow);
    assert.equal(
      withoutSpread.state === "resolved" ? withoutSpread.outcome : null,
      "take_profit",
    );
    const withSpread = evaluateSetupOutcome(setup, bars, farNow, {
      halfSpread: 0.05,
    });
    assert.equal(
      withSpread.state === "resolved" ? withSpread.outcome : null,
      "expired_in_profit",
    );
  });

  it("FR-1: a gapped stop prints at the BID side of the open", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [
      buildBar(15, 100.4, 99.9, 100.2),
      buildBar(30, 97.4, 96.8, 97.1, 97),
    ];
    const result = evaluateSetupOutcome(setup, bars, farNow, {
      halfSpread: 0.05,
    });
    const exit = result.state === "resolved"
      ? result.legs.find((leg) => leg.leg === "exit")
      : null;
    assert.equal(exit?.price, 96.95);
  });

  it("FR-7: a gapped exit can carry reopen slippage on top of the bid print", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [
      buildBar(15, 100.4, 99.9, 100.2),
      buildBar(30, 97.4, 96.8, 97.1, 97),
    ];
    const result = evaluateSetupOutcome(setup, bars, farNow, {
      gapExitSlippage: 0.05,
      halfSpread: 0.05,
    });
    const exit = result.state === "resolved"
      ? result.legs.find((leg) => leg.leg === "exit")
      : null;
    assert.equal(exit?.price, 96.9);
    const clean = evaluateSetupOutcome(setup, [
      bars[0],
      buildBar(30, 100.5, 97.9, 100.2, 100.1),
    ], farNow, { gapExitSlippage: 0.05 });
    const cleanExit = clean.state === "resolved"
      ? clean.legs.find((leg) => leg.leg === "exit")
      : null;
    assert.equal(cleanExit?.price, 98);
  });

  it("LA-2: a bar straddling expiry cannot resolve anything", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);
    const straddleStart = expiresAt - 60 * 1000;
    const bars = [
      buildBar(15, 100.4, 99.9, 100.3),
      {
        close: 105.5,
        high: 105.6,
        low: 100.1,
        open: 100.2,
        time: straddleStart,
        volume: 1000,
      },
    ];
    const result = evaluateSetupOutcome(setup, bars, farNow);
    assert.equal(
      result.state === "resolved" ? result.outcome : null,
      "expired_in_profit",
    );
    const exit = result.state === "resolved"
      ? result.legs.find((leg) => leg.leg === "exit")
      : null;
    assert.equal(exit?.price, 100.3);
  });

  it("FR-8: the expired label reads NET of the round trip, not price drift", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [
      buildBar(15, 100.4, 99.9, 100.2),
      buildBar(30, 100.3, 99.9, 100.2),
    ];
    const gross = evaluateSetupOutcome(setup, bars, farNow);
    assert.equal(
      gross.state === "resolved" ? gross.outcome : null,
      "expired_in_profit",
    );
    const net = evaluateSetupOutcome(setup, bars, farNow, {
      roundTripCost: 0.5,
    });
    assert.equal(
      net.state === "resolved" ? net.outcome : null,
      "expired_at_loss",
    );
  });

  it("FR-3: banking TP1 arms the breakeven stop within the SAME bar's close", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const bars = [
      buildBar(15, 100.4, 99.9, 100.2),
      buildBar(30, 101.4, 99.95, 99.9, 100.1),
      buildBar(45, 100.6, 99.2, 100.5),
    ];
    const deferred = evaluateSetupOutcome(setup, bars, farNow);
    const sameBar = evaluateSetupOutcome(setup, bars, farNow, {
      sameBarProtectionArming: true,
    });
    assert.equal(
      sameBar.state === "resolved" ? sameBar.outcome : null,
      "tp1_partial",
    );
    const exit = sameBar.state === "resolved"
      ? sameBar.legs.find((leg) => leg.leg === "exit")
      : null;
    assert.equal(exit?.kind, "breakeven_stop");
    assert.equal(exit?.price, 100);
    assert.equal(exit?.time, createdAt + 30 * 60 * 1000);
    const deferredExit = deferred.state === "resolved"
      ? deferred.legs.find((leg) => leg.leg === "exit")
      : null;
    assert.equal(deferredExit?.time, createdAt + 45 * 60 * 1000);
  });

  it("FR-4: a manual TP1 exit can carry its haircut", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const bars = [
      buildBar(15, 100.4, 99.9, 100.2),
      buildBar(30, 101.4, 100.05, 101.2, 100.1),
    ];
    const result = evaluateSetupOutcome(setup, bars, farNow, {
      tp1FillHaircut: 0.02,
    });
    const tp1Leg = result.state === "resolved" || result.state === "placed"
      ? (result.feedback.legs as Array<{ leg: string; price: number }>).find(
        (leg) => leg.leg === "tp1",
      )
      : null;
    assert.equal(tp1Leg?.price, 100.98);
  });

  it("FR-6: one bar of placement latency skips the creation bar's fill", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [buildBar(15, 100.2, 99.5, 100.1)];
    const immediate = evaluateSetupOutcome(setup, bars, farNow);
    assert.notEqual(
      immediate.state === "resolved" ? immediate.outcome : null,
      "unfilled",
    );
    const delayed = evaluateSetupOutcome(setup, bars, farNow, {
      entryLatencyBars: 1,
    });
    assert.equal(
      delayed.state === "resolved" ? delayed.outcome : null,
      "unfilled",
    );
  });

  it("LA-13: touch-fill penetration demands price beyond the limit", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [buildBar(15, 100.4, 99.99, 100.2)];
    const touched = evaluateSetupOutcome(setup, bars, farNow);
    assert.equal(
      touched.state === "resolved" ? touched.outcome : null,
      "expired_in_profit",
    );
    const strict = evaluateSetupOutcome(setup, bars, farNow, {
      touchFillPenetration: 0.02,
    });
    assert.equal(
      strict.state === "resolved" ? strict.outcome : null,
      "unfilled",
    );
  });
});

describe("OP-8 — the expiry path cannot pay Intl construction per call", () => {
  it("computes 2,000 expiry times inside the CI budget", () => {
    const start = performance.now();
    for (let index = 0; index < 2000; index += 1) {
      getSetupExpiryTime("EURUSD", createdAt + index * 60_000);
    }
    const elapsed = performance.now() - start;
    assert.ok(
      elapsed < 250,
      `2,000 expiry computations took ${elapsed.toFixed(0)}ms — the ` +
        "per-call Intl construction class is back (round-8 OP-8)",
    );
  });
});

describe("FR-1 — the expiry close crosses the book too", () => {
  it("prints the expiry exit at the bid side of the last close", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const bars = [
      buildBar(15, 100.4, 99.9, 100.2),
      buildBar(30, 100.4, 99.9, 100.2),
    ];
    const result = evaluateSetupOutcome(
      setup,
      bars,
      createdAt + 365 * 24 * 60 * 60 * 1000,
      { halfSpread: 0.05 },
    );
    const exit = result.state === "resolved"
      ? result.legs.find((leg) => leg.leg === "exit")
      : null;
    assert.equal(exit?.kind, "expiry");
    assert.equal(exit?.price, 100.15);
    assert.equal(
      result.state === "resolved" ? result.feedback.realizedR : null,
      0.075,
    );
  });
});

describe("fillOptionsFromRiskModel — live outcome-sync adopts the venue's fills (batch 4)", () => {
  it("builds v2 options from the stored decision-time execution quality", () => {
    const options = fillOptionsFromRiskModel({
      executionQuality: {
        estimatedCommission: 0.00006,
        estimatedSlippage: 0.00004,
        estimatedSpread: 0.0001,
      },
    });
    assert.equal(options.halfSpread, 0.00005);
    assert.equal(options.gapExitSlippage, 0.00004);
    assert.equal(options.roundTripCost, 0.00006);
    assert.equal(options.barIntervalMs, 15 * 60 * 1000);
    assert.equal(options.sameBarProtectionArming, true);
  });

  it("a row without stored quality resolves v1-style — no invented numbers", () => {
    assert.deepEqual(fillOptionsFromRiskModel(null), {});
    assert.deepEqual(fillOptionsFromRiskModel({}), {});
    assert.deepEqual(
      fillOptionsFromRiskModel({ executionQuality: { estimatedSpread: "x" } }),
      {},
    );
  });
});

describe("outcome-sync wires the stored costs into the live resolver (source pin)", () => {
  it("selects risk_model and passes the built options through", () => {
    const source = readFileSync(
      "supabase/functions/outcome-sync/index.ts",
      "utf8",
    );
    assert.match(source, /take_profit_1,risk_model,/);
    assert.match(source, /fillOptionsFromRiskModel\(setup\.risk_model\)/);
  });
});

describe("ops hygiene — outcome-sync budget and retention (round-8 OP-1/OP-4, source pins)", () => {
  it("keeps the response under the cron invoker's timeout and prunes with a cap", () => {
    const source = readFileSync(
      "supabase/functions/outcome-sync/index.ts",
      "utf8",
    );
    assert.match(source, /RUN_BUDGET_MS = 12_000/);
    assert.match(source, /EVENT_RETENTION_DAYS = 60/);
    assert.match(source, /EVENT_PRUNE_LIMIT = 5_000/);
    assert.match(source, /skippedForBudget/);
    assert.match(source, /pruneFailed/);
    assert.match(
      source,
      /analyzer_events\?created_at=lt\./,
      "the prune must be age-based",
    );
  });
});

// D2 (R1a): the resolver writes realized R from its own legs on EVERY
// filled resolution — the expiry branch used to be the only writer, so any
// R sum over the live cohort was a sum over expiries alone (0.34% of
// filled outcomes, completeness register D2), and even that branch applied
// full-size arithmetic to a half-sized runner after TP1 banked. The
// register's whyMissed: every consumer test built `feedback.realizedR`
// fixtures by hand, so the producer was never tested. These pin the
// producer.
describe("D2 (R1a) — realized R on every filled resolution", () => {
  const farNow = createdAt + 365 * 24 * 60 * 60 * 1000;

  it("a take_profit resolution carries gross and net realized R", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 101, 99.8, 100.5, 100.5),
      buildBar(30, 105.4, 100.2, 104.8, 104.8),
    ], farNow, { roundTripCost: 0.4 });
    assert.equal(result.state, "resolved");
    if (result.state !== "resolved") {
      return;
    }
    // Fill at the limit (100), target banked at its level (105), risk 2:
    // gross (105-100)/2 = 2.5; net charges the one round trip 0.4/2 = 0.2R.
    assert.equal(result.feedback.realizedR, 2.5);
    assert.equal(result.feedback.netRealizedR, 2.3);
  });

  it("a stop_loss resolution carries its negative realized R", () => {
    const setup = buildSetup({ entry: 100, side: "sell", stop: 102, target: 95 });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 100.4, 99.7, 100.1, 100.1),
      buildBar(30, 102.5, 99.4, 102.1, 102.1),
    ], farNow);
    assert.equal(result.state, "resolved");
    if (result.state !== "resolved") {
      return;
    }
    // Price-improved sell fill at the open (100.1); the stop gaps to the
    // open's print (102.1): (100.1 - 102.1)/2 = -1.
    assert.equal(result.outcome, "stop_loss");
    assert.equal(result.feedback.realizedR, -1);
    assert.equal(result.feedback.netRealizedR, -1);
  });

  it("a tp1_partial breakeven return scores the LADDER — half banked at TP1, half flat", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 100.4, 99.8, 100.2, 100.2),
      buildBar(30, 101.3, 100.1, 101.1, 100.5),
      buildBar(45, 101.2, 99.9, 100.0, 100.0),
    ], farNow);
    assert.equal(result.state, "resolved");
    if (result.state !== "resolved") {
      return;
    }
    // Half banked at TP1 (101, +0.5R on the half = 0.25R), runner exits at
    // breakeven (0R): 0.25R total.
    assert.equal(result.outcome, "tp1_partial");
    assert.equal(result.feedback.realizedR, 0.25);
  });

  it("a TP1-banked EXPIRY scores the ladder too — the branch that used to bill full size on a half-sized runner", () => {
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 100.4, 99.8, 100.2, 100.2),
      buildBar(30, 102, 100.1, 102, 100.5),
    ], expiresAt + 1, { roundTripCost: 0.4 });
    assert.equal(result.state, "resolved");
    if (result.state !== "resolved") {
      return;
    }
    // Half banked at TP1 (+0.25R), runner half expires at the last close
    // 102 (+0.5R on the half): 0.75R gross — NOT the 1.0R the old
    // full-size expiry arithmetic printed for this path — and 0.55R net
    // of the 0.2R round trip.
    assert.equal(result.outcome, "tp1_partial");
    assert.equal(result.feedback.realizedR, 0.75);
    assert.equal(result.feedback.netRealizedR, 0.55);
  });

  it("an unfilled resolution carries NO realized R — no position, no R", () => {
    const setup = buildSetup({ entry: 98, side: "buy", stop: 96, target: 103 });
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);
    const result = evaluateSetupOutcome(
      setup,
      [buildBar(15, 101, 99, 100)],
      expiresAt + 1,
    );
    assert.equal(result.state, "resolved");
    if (result.state !== "resolved") {
      return;
    }
    assert.equal(result.outcome, "unfilled");
    assert.equal(result.feedback.realizedR, undefined);
    assert.equal(result.feedback.netRealizedR, undefined);
  });
});

// R1a slice 2 — one physics (E1/E2/E7). The zero-failure run that
// preceded these pins was itself the finding: nothing held the old
// behavior, the same producer-never-tested pattern D2's register entry
// named. Each divergence closure gets its pin here.
describe("R1a slice 2 — one physics", () => {
  const farNow = createdAt + 365 * 24 * 60 * 60 * 1000;

  it("E1: the tiering rule resolves on the finest series that reaches creation", () => {
    const fifteen = [buildBar(15, 101, 99.8, 100.5)];
    const reaches = [buildBar(-30, 100.2, 99.9, 100.1), buildBar(5, 100.4, 99.9, 100.2)];
    const late = [buildBar(45, 100.4, 99.9, 100.2)];

    const fine = resolutionSeriesFor({
      createdAtMs: createdAt,
      fifteenMinute: fifteen,
      fiveMinute: reaches,
    });
    assert.equal(fine.barIntervalMs, 5 * 60 * 1000);
    assert.equal(fine.bars, reaches);

    // A 5-minute series that starts AFTER creation cannot see the fill
    // window — the setup degrades to 15-minute physics, recorded.
    const degraded = resolutionSeriesFor({
      createdAtMs: createdAt,
      fifteenMinute: fifteen,
      fiveMinute: late,
    });
    assert.equal(degraded.barIntervalMs, 15 * 60 * 1000);
    assert.equal(degraded.bars, fifteen);

    const noFive = resolutionSeriesFor({
      createdAtMs: createdAt,
      fifteenMinute: fifteen,
      fiveMinute: [],
    });
    assert.equal(noFive.barIntervalMs, 15 * 60 * 1000);
  });

  it("E1: every resolution records the interval that graded it", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const fine = evaluateSetupOutcome(setup, [
      buildBar(15, 101, 99.8, 100.5),
      buildBar(30, 105.4, 100.2, 104.8),
    ], farNow, { barIntervalMs: 5 * 60 * 1000 });
    assert.equal(fine.state, "resolved");
    assert.equal(
      fine.state === "resolved" ? fine.feedback.resolutionIntervalMs : null,
      5 * 60 * 1000,
    );

    const coarse = evaluateSetupOutcome(setup, [
      buildBar(15, 101, 99.8, 100.5),
      buildBar(30, 105.4, 100.2, 104.8),
    ], farNow);
    assert.equal(
      coarse.state === "resolved" ? coarse.feedback.resolutionIntervalMs : null,
      15 * 60 * 1000,
    );
  });

  it("E2: data absence carries its own marker; a genuine no-fill does not", () => {
    const setup = buildSetup({ entry: 98, side: "buy", stop: 96, target: 103 });
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);

    const noBars = evaluateSetupOutcome(setup, [], expiresAt + 1);
    assert.equal(noBars.state, "resolved");
    assert.equal(
      noBars.state === "resolved" ? noBars.feedback.noBarsInReviewWindow : null,
      true,
    );
    // The tier stamp rides the unfilled branches too (#362 round 3,
    // smaller item) — a DEGRADED no-bars row is exactly what a cohort
    // read needs to separate, so the stamp matters most here.
    assert.equal(
      noBars.state === "resolved"
        ? noBars.feedback.resolutionIntervalMs
        : null,
      15 * 60 * 1000,
    );

    // Bars existed, the limit never filled — a market verdict, unmarked.
    const noFill = evaluateSetupOutcome(
      setup,
      [buildBar(15, 101, 99, 100)],
      expiresAt + 1,
    );
    assert.equal(noFill.state, "resolved");
    assert.equal(
      noFill.state === "resolved"
        ? noFill.feedback.noBarsInReviewWindow
        : null,
      undefined,
    );
    assert.equal(
      noFill.state === "resolved"
        ? noFill.feedback.resolutionIntervalMs
        : null,
      15 * 60 * 1000,
    );
  });

  it("E2 (R1b, corrected #364 round 3): the marker gates on whether a completed bar COULD have existed, so an uncontainable window is unmarked and a real outage still marks", () => {
    const setup = buildSetup({ entry: 98, side: "buy", stop: 96, target: 103 });

    // A review window shorter than one bar span — the live shape is a
    // setup created inside the final bar before the weekly close, where
    // getSetupExpiryTime clamps the window under 15 minutes. No grid
    // slot fits inside [createdAt, expiresAt), so no bar could ever
    // complete there regardless of what the provider served — a
    // grading-law fact, unmarked, whether bars overlap the window or
    // sit entirely elsewhere (#362 round 7's motivating shape).
    const shortWindow = { reviewHours: 0.1 };
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt, 0.1);
    const farNow = expiresAt + 60 * 60 * 1000;
    for (const streamBars of [
      [buildBar(-10, 101, 99, 100), buildBar(0, 101, 99, 100)],
      [buildBar(60, 101, 99, 100)],
    ]) {
      const clamped = evaluateSetupOutcome(
        setup,
        streamBars,
        farNow,
        shortWindow,
      );
      assert.equal(clamped.state, "resolved");
      assert.equal(
        clamped.state === "resolved" ? clamped.outcome : null,
        "unfilled",
      );
      assert.equal(
        clamped.state === "resolved"
          ? clamped.feedback.noBarsInReviewWindow
          : null,
        undefined,
      );
      assert.match(
        String(clamped.state === "resolved" ? clamped.feedback.reason : ""),
        /before any complete bar could form inside it/,
      );
    }

    // The outage shape #364 round 3 caught the presence test losing:
    // live's stream reaches back past creation by construction, so the
    // bar straddling createdAt is always served — a setup created
    // mid-bar whose provider then goes dark for the whole window must
    // still carry the marker. (created_at sits 7 minutes inside the
    // straddler so containment excludes it, and a completed bar could
    // plainly have existed in the full-length window.)
    const midBarSetup = {
      ...setup,
      created_at: new Date(createdAt + 7 * 60 * 1000).toISOString(),
    };
    const outage = evaluateSetupOutcome(
      midBarSetup,
      [buildBar(0, 101, 99, 100)],
      createdAt + 4 * 60 * 60 * 1000,
      { reviewHours: 2 },
    );
    assert.equal(outage.state, "resolved");
    assert.equal(
      outage.state === "resolved"
        ? outage.feedback.noBarsInReviewWindow
        : null,
      true,
    );
    assert.match(
      String(outage.state === "resolved" ? outage.feedback.reason : ""),
      /No post-recommendation bars were available/,
    );

    // #364 round 4, finding 1: the discriminator asks about the STREAM's
    // first admissible slot. A 20-minute window sits between one and two
    // bar spans — the creation instant's own slot fits, so a live caller
    // (whose stream reaches back past creation) marks a genuinely empty
    // window; a sweep-shaped caller whose stream starts one decision bar
    // later could never have been handed a gradeable slot, and the same
    // window is unmarked.
    const twentyMinutes = { reviewHours: 1 / 3 };
    const liveShaped = evaluateSetupOutcome(
      setup,
      [],
      createdAt + 2 * 60 * 60 * 1000,
      twentyMinutes,
    );
    assert.equal(
      liveShaped.state === "resolved"
        ? liveShaped.feedback.noBarsInReviewWindow
        : null,
      true,
    );
    const sweepShaped = evaluateSetupOutcome(
      setup,
      [],
      createdAt + 2 * 60 * 60 * 1000,
      { ...twentyMinutes, streamStartsAtMs: createdAt + 15 * 60 * 1000 },
    );
    assert.equal(
      sweepShaped.state === "resolved"
        ? sweepShaped.feedback.noBarsInReviewWindow
        : null,
      undefined,
    );
    assert.match(
      String(
        sweepShaped.state === "resolved" ? sweepShaped.feedback.reason : "",
      ),
      /before any complete bar could form inside it/,
    );
  });

  it("E7: the bridge reads the row's stored protection mode and review window", () => {
    const base = {
      estimatedCommission: 0.1,
      estimatedSlippage: 0.02,
      estimatedSpread: 0.04,
      label: "good",
      score: 80,
    };
    const options = fillOptionsFromRiskModel({
      executionQuality: base,
      reviewWindowHours: 12,
      runnerProtection: "trail_tp1",
    });
    assert.equal(options.runnerProtection, "trail_tp1");
    assert.equal(options.reviewHours, 12);

    // An unknown mode is not an invented one, and a pre-slice-2 row
    // (no fields) keeps today's exact behavior — the resolver's
    // "breakeven" default and the calibration at resolution time.
    const garbage = fillOptionsFromRiskModel({
      executionQuality: base,
      reviewWindowHours: -3,
      runnerProtection: "yolo",
    });
    assert.equal(garbage.runnerProtection, undefined);
    assert.equal(garbage.reviewHours, undefined);
    const legacy = fillOptionsFromRiskModel({ executionQuality: base });
    assert.equal(legacy.runnerProtection, undefined);
    assert.equal(legacy.reviewHours, undefined);

    // #362 round 4, finding 2: the mode and window are decision-time
    // facts orthogonal to the cost triple — a malformed (or absent)
    // cost stamp must not send a validly stamped row back to the
    // breakeven fallback and resolution-time calibration. The cost
    // fields alone die on the cost gate.
    const badCosts = fillOptionsFromRiskModel({
      executionQuality: { ...base, estimatedSpread: "corrupt" },
      reviewWindowHours: 12,
      runnerProtection: "trail_tp1",
    });
    assert.equal(badCosts.runnerProtection, "trail_tp1");
    assert.equal(badCosts.reviewHours, 12);
    assert.equal(badCosts.halfSpread, undefined);
    assert.equal(badCosts.roundTripCost, undefined);
    // Arming is resolver physics the corpus applies unconditionally, not
    // a cost (#362 round 5, smaller item) — a stamped row keeps it even
    // with a corrupt cost triple.
    assert.equal(badCosts.sameBarProtectionArming, true);
    const noCosts = fillOptionsFromRiskModel({
      reviewWindowHours: 12,
      runnerProtection: "hold",
    });
    assert.equal(noCosts.runnerProtection, "hold");
    assert.equal(noCosts.reviewHours, 12);
    assert.equal(noCosts.halfSpread, undefined);
    assert.equal(noCosts.sameBarProtectionArming, true);
    // An entirely unstamped row still resolves v1-style — no arming.
    const v1 = fillOptionsFromRiskModel({});
    assert.equal(v1.sameBarProtectionArming, undefined);
  });

  it("E7: a stored trail_tp1 row grades under trail_tp1 physics through the bridge", () => {
    // Same price path as the direct trail_tp1 test above: TP1 banks at
    // 101, the runner is stopped at TP1's own level, not at breakeven.
    const setup = buildSetup({
      entry: 100,
      side: "buy",
      stop: 98,
      target: 105,
      tp1: 101,
    });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 100.4, 99.8, 100.2, 100.2),
      buildBar(30, 101.6, 100.4, 101.5, 100.5),
      buildBar(45, 101.4, 100.2, 100.6, 101.2),
    ], farNow, fillOptionsFromRiskModel({
      executionQuality: {
        estimatedCommission: 0,
        estimatedSlippage: 0,
        estimatedSpread: 0,
      },
      runnerProtection: "trail_tp1",
    }));
    assert.equal(result.state, "resolved");
    if (result.state !== "resolved") {
      return;
    }
    assert.equal(result.outcome, "tp1_partial");
    const exit = result.legs.find((leg) => leg.leg === "exit");
    assert.equal(exit?.kind, "tp1_lock");
    assert.equal(exit?.price, 101);
  });
});

describe("unfilledApproachDistance — how close an unfilled setup came", () => {
  // An unfilled row carried no price information whatsoever: the legs are
  // empty and riskDistance is a distance, so "missed by a tick" and "never
  // came near" were the same row. R4 cannot ask whether an entry offset is
  // too wide from a corpus that cannot tell them apart, and R3 is the one
  // re-sweep.

  it("measures the gap, and a nearer miss reports a smaller one", () => {
    // Two setups identical but for the price path. The ORDERING is the
    // assertion: a fixed value cannot produce it, which is what a hardcoded
    // or never-updated measurement would be.
    const setup = buildSetup({ entry: 98, side: "buy", stop: 96, target: 103 });
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);
    const near = evaluateSetupOutcome(
      setup,
      [buildBar(15, 101, 98.2, 100)],
      expiresAt + 1,
    );
    const far = evaluateSetupOutcome(
      setup,
      [buildBar(15, 101, 99.5, 100)],
      expiresAt + 1,
    );
    assert.equal(near.state === "resolved" ? near.outcome : null, "unfilled");
    assert.equal(far.state === "resolved" ? far.outcome : null, "unfilled");
    const nearGap = near.state === "resolved"
      ? near.unfilledApproachDistance
      : null;
    const farGap = far.state === "resolved" ? far.unfilledApproachDistance : null;
    assert.ok(typeof nearGap === "number", "the near miss carries no distance");
    assert.ok(typeof farGap === "number", "the far miss carries no distance");
    assert.ok(
      nearGap < farGap,
      `a low of 98.2 must read nearer than 99.5, got ${nearGap} vs ${farGap}`,
    );
    assert.ok(nearGap >= 0, "a negative gap would mean the entry filled");
  });

  it("measures against the level the FILL test uses, spread included", () => {
    // Not an idealised gap to the quoted limit. The fill level carries half
    // the spread and the touch penetration, so measuring to the raw entry
    // would under-report every row by exactly the amount that decides fills.
    const setup = buildSetup({ entry: 98, side: "buy", stop: 96, target: 103 });
    const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);
    // A spread is supplied so the fill level and the quoted limit DIFFER;
    // with the default zero-spread options they coincide and this fixture
    // could not tell the two apart. An earlier draft did not, and asserted a
    // strict inequality that the defaults made false.
    const result = evaluateSetupOutcome(
      setup,
      [buildBar(15, 101, 99, 100)],
      expiresAt + 1,
      { halfSpread: 0.25 },
    );
    const gap = result.state === "resolved"
      ? result.unfilledApproachDistance
      : null;
    assert.ok(typeof gap === "number");
    // A buy fills when the ask reaches the limit, so the fill level sits
    // half a spread BELOW 98 and the true gap from a low of 99 is 1.25.
    // Measuring to the raw entry would report 1.0 and under-state every row
    // by exactly the amount that decides fills.
    assert.equal(
      gap,
      1.25,
      `the gap must be measured to the fill level, not the quoted limit`,
    );
  });

  it("carries nothing on a setup that filled", () => {
    const setup = buildSetup({ entry: 100, side: "buy", stop: 98, target: 105 });
    const result = evaluateSetupOutcome(setup, [
      buildBar(15, 101, 99.8, 100.5),
      buildBar(30, 105.4, 100.2, 104.8),
    ]);
    assert.equal(result.state === "resolved" ? result.outcome : null, "take_profit");
    assert.equal(
      result.state === "resolved" ? result.unfilledApproachDistance : "absent",
      undefined,
    );
  });
});
