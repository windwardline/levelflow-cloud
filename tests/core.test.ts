import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getGlobalSessions, getMarketClock } from "../src/lib/marketSessions";
import { normalizeSetupOutcome, OUTCOME_COPY } from "../src/lib/outcomes";
import { US_STATE_TIME_ZONES } from "../src/lib/profile";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
  formatSecurityLabel,
  sortAssetSymbols,
} from "../src/lib/symbolMap";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer";

describe("asset catalog", () => {
  it("keeps the public asset list focused and sorted by category, base, then quote", () => {
    assert.deepEqual(
      AVAILABLE_ASSET_GROUPS.map((group) => group.label),
      ["Crypto", "Forex", "Futures", "Metals"],
    );

    const forex = AVAILABLE_ASSET_GROUPS.find(
      (group) => group.label === "Forex",
    )?.options.map((option) => option.symbol);
    assert.deepEqual(forex?.slice(0, 8), [
      "AUDCAD",
      "AUDCHF",
      "AUDJPY",
      "AUDNZD",
      "AUDUSD",
      "CADCHF",
      "CADJPY",
      "CHFJPY",
    ]);

    const crypto = AVAILABLE_ASSET_GROUPS.find(
      (group) => group.label === "Crypto",
    )?.options.map((option) => option.symbol);
    assert.deepEqual(crypto, [
      "ADAUSD",
      "BCHUSD",
      "BNBUSD",
      "BTCUSD",
      "ETHUSD",
      "LTCUSD",
      "SOLUSD",
      "XRPUSD",
    ]);
  });

  it("formats user-facing asset labels without provider fallback details", () => {
    assert.equal(formatSecurityLabel("EURUSD"), "EUR/USD - Euro / U.S. Dollar");
    assert.equal(formatSecurityLabel("XAUUSD"), "XAU/USD - Gold / U.S. Dollar");
    assert.equal(formatSecurityLabel("BZUSD"), "BZ - Brent Crude Oil Futures");
  });

  it("uses the same category, base, quote ordering for asset lists outside the selector", () => {
    assert.deepEqual(
      sortAssetSymbols([
        "XAUUSD",
        "ETHUSD",
        "AUDJPY",
        "BTCUSD",
        "ESUSD",
        "EURUSD",
      ]),
      ["BTCUSD", "ETHUSD", "AUDJPY", "EURUSD", "ESUSD", "XAUUSD"],
    );
  });

  it("keeps market scan symbols aligned with the visible advisor dropdown", () => {
    assert.deepEqual(
      AVAILABLE_ASSET_SYMBOLS,
      AVAILABLE_ASSET_GROUPS.flatMap((group) =>
        group.options.map((option) => option.symbol)
      ),
    );
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("SP"), false);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.includes("WTI"), false);
  });
});

describe("profile preferences", () => {
  it("limits timezone choices to the six time zones covering the fifty states", () => {
    assert.deepEqual(
      US_STATE_TIME_ZONES.map((option) => option.label),
      [
        "Eastern Time",
        "Central Time",
        "Mountain Time",
        "Pacific Time",
        "Alaska Time",
        "Hawaii-Aleutian Time",
      ],
    );
  });
});

describe("market clocks", () => {
  it("uses timezone-aware market status for forex", () => {
    const beforeFridayClose = new Date("2026-06-12T20:30:00.000Z");
    const clock = getMarketClock(
      "EURUSD",
      "America/Chicago",
      beforeFridayClose,
    );

    assert.equal(clock.marketLabel, "Global FX session");
    assert.equal(clock.statusLabel, "Open");
    assert.equal(clock.nextEventLabel, "Closes");
    assert.equal(clock.countdownLabel, "30m");
  });

  it("returns all global sessions with the selected session highlighted", () => {
    const sessions = getGlobalSessions(
      "America/New_York",
      "north_america",
      new Date("2026-06-12T14:00:00.000Z"),
    );

    assert.deepEqual(
      sessions.map((session) => session.label),
      ["Asia", "Europe", "North America", "Australia"],
    );
    assert.equal(
      sessions.find((session) => session.id === "north_america")?.isPreferred,
      true,
    );
  });
});

describe("recommendation outcomes", () => {
  it("uses clear user-facing labels for each internal status", () => {
    assert.equal(OUTCOME_COPY.still_tracking.label, "Still tracking");
    assert.equal(OUTCOME_COPY.target_reached.label, "Reached target");
    assert.equal(OUTCOME_COPY.stopped_out.label, "Hit stop");
    assert.equal(OUTCOME_COPY.unclear_path.label, "Needs review");
    assert.equal(OUTCOME_COPY.entry_not_filled.label, "Entry not filled");
  });

  it("separates unresolved, unfilled, and unclear results", () => {
    assert.equal(
      normalizeSetupOutcome(buildSetup({ status: "generated" })),
      "still_tracking",
    );
    assert.equal(
      normalizeSetupOutcome(buildSetup({ status: "expired" })),
      "entry_not_filled",
    );
    assert.equal(
      normalizeSetupOutcome(
        buildSetup({ outcome: "ambiguous", status: "filled" }),
      ),
      "unclear_path",
    );
    assert.equal(
      normalizeSetupOutcome(
        buildSetup({ outcome: "take_profit", status: "filled" }),
      ),
      "target_reached",
    );
    assert.equal(
      normalizeSetupOutcome(
        buildSetup({ outcome: "stop_loss", status: "filled" }),
      ),
      "stopped_out",
    );
  });
});

describe("database schema", () => {
  it("uses provider-neutral market symbol naming in the current baseline schema", () => {
    const initSql = readFileSync("supabase/init.sql", "utf8");

    assert.match(initSql, /provider_symbol text not null/);
    assert.doesNotMatch(initSql, /massive_symbol text not null/);
  });

  it("keeps setup persistence consolidated and records data health", () => {
    const initSql = readFileSync("supabase/init.sql", "utf8");

    assert.doesNotMatch(
      initSql,
      /create table if not exists public\.pending_orders/,
    );
    assert.doesNotMatch(initSql, /pending_order_id uuid/);
    assert.match(
      initSql,
      /create table if not exists public\.market_data_health/,
    );
    assert.match(initSql, /create table if not exists public\.analyzer_events/);
    assert.match(
      initSql,
      /market data health readable by authenticated users/,
    );
  });
});

function buildSetup({
  outcome,
  status,
}: {
  outcome?: string;
  status: string;
}): Pick<TradeSetupRow, "status" | "trade_outcomes"> {
  return {
    status,
    trade_outcomes: outcome
      ? [
        {
          exit_at: null,
          feedback: null,
          filled_at: null,
          outcome,
          realized_pnl: null,
          reviewed_at: "2026-06-16T12:00:00.000Z",
        },
      ]
      : [],
  };
}
