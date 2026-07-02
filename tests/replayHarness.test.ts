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

  it("flags same-bar target and stop touches as needing review", () => {
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
      "ambiguous",
    );
    assert.equal(
      result.state === "resolved" ? result.feedback.ambiguousSameBar : null,
      true,
    );
  });
});

function buildSetup({
  entry,
  side,
  stop,
  target,
}: {
  entry: number;
  side: ReplaySetup["side"];
  stop: number;
  target: number;
}): ReplaySetup {
  return {
    created_at: new Date(createdAt).toISOString(),
    limit_entry: entry,
    side,
    stop_loss: stop,
    symbol: "EURUSD",
    take_profit: target,
  };
}

function buildBar(
  minutesAfterCreated: number,
  high: number,
  low: number,
  close: number,
): ReplayBar {
  return {
    close,
    high,
    low,
    open: close,
    time: createdAt + minutesAfterCreated * 60 * 1000,
    volume: 1000,
  };
}
