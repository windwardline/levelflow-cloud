import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getGlobalSessions, getMarketClock } from "../src/lib/marketSessions";
import { normalizeSetupOutcome, OUTCOME_COPY } from "../src/lib/outcomes";
import { buildProfileReviewPattern } from "../src/lib/profileInsights";
import {
  getAssetType,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  coerceToSupportedUsTimeZone,
  formatUsTimeZoneOptionLabel,
  getTimeZoneAbbreviation,
  US_TIME_ZONE_GROUPS,
  US_TIME_ZONE_OPTIONS,
} from "../src/lib/profile";
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

describe("trade analyzer category handling", () => {
  it("keeps asset categories on distinct analyzer calibrations", () => {
    assert.equal(getAssetType("BTCUSD"), "crypto");
    assert.equal(getAssetType("EURUSD"), "forex");
    assert.equal(getAssetType("ESUSD"), "futures");
    assert.equal(getAssetType("XAUUSD"), "metals");

    const crypto = getCategoryCalibration("BTCUSD");
    const forex = getCategoryCalibration("EURUSD");
    const futures = getCategoryCalibration("ESUSD");
    const metals = getCategoryCalibration("XAUUSD");

    assert.ok(crypto.defaultReviewHours > futures.defaultReviewHours);
    assert.ok(crypto.minRewardRisk > forex.minRewardRisk);
    assert.ok(forex.newsPenaltyPerEvent >= crypto.newsPenaltyPerEvent);
    assert.ok(metals.stopAtrMultiplier > forex.stopAtrMultiplier);
    assert.ok(futures.defaultReviewHours < metals.defaultReviewHours);
  });
});

describe("profile preferences", () => {
  it("groups U.S. time zones by Daylight Saving Time observance", () => {
    assert.deepEqual(
      US_TIME_ZONE_GROUPS.map((group) => ({
        label: group.label,
        options: group.options.map(formatUsTimeZoneOptionLabel),
      })),
      [
        {
          label: "Observes Daylight Saving Time",
          options: [
            "Eastern Time - EDT/EST",
            "Central Time - CDT/CST",
            "Mountain Time - MDT/MST",
            "Pacific Time - PDT/PST",
            "Alaska Time - AKDT/AKST",
            "Aleutian Time - HADT/HAST",
          ],
        },
        {
          label: "Standard Time Year-Round",
          options: [
            "Atlantic Time - AST",
            "Arizona Time - MST",
            "Hawaii Time - HST",
            "Samoa Time - SST",
            "Chamorro Time - ChST",
          ],
        },
      ],
    );
    assert.deepEqual(
      US_TIME_ZONE_OPTIONS.map(formatUsTimeZoneOptionLabel),
      US_TIME_ZONE_GROUPS.flatMap((group) =>
        group.options.map(formatUsTimeZoneOptionLabel)
      ),
    );
  });

  it("normalizes detailed browser zones to the supported profile choices", () => {
    assert.equal(
      coerceToSupportedUsTimeZone("America/Indiana/Indianapolis"),
      "America/New_York",
    );
    assert.equal(
      coerceToSupportedUsTimeZone("America/Phoenix"),
      "America/Phoenix",
    );
    assert.equal(coerceToSupportedUsTimeZone("Pacific/Saipan"), "Pacific/Guam");
    assert.equal(
      coerceToSupportedUsTimeZone("America/St_Thomas"),
      "America/Puerto_Rico",
    );
  });

  it("uses IANA rules to switch daylight and standard labels by date", () => {
    assert.equal(
      getTimeZoneAbbreviation(
        "America/New_York",
        new Date("2026-06-24T12:00:00Z"),
      ),
      "EDT",
    );
    assert.equal(
      getTimeZoneAbbreviation(
        "America/New_York",
        new Date("2026-01-24T12:00:00Z"),
      ),
      "EST",
    );
    assert.equal(
      getTimeZoneAbbreviation(
        "America/Phoenix",
        new Date("2026-06-24T12:00:00Z"),
      ),
      "MST",
    );
    assert.equal(
      getTimeZoneAbbreviation(
        "America/Phoenix",
        new Date("2026-01-24T12:00:00Z"),
      ),
      "MST",
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
    assert.equal(clock.countdownLabel, "29m");
  });

  it("accounts for the daily New York rollover pause in the global FX session", () => {
    const rolloverPause = getMarketClock(
      "EURUSD",
      "America/New_York",
      new Date("2026-06-15T21:00:00.000Z"),
    );

    assert.equal(rolloverPause.statusLabel, "Closed");
    assert.equal(rolloverPause.nextEventLabel, "Opens");
    assert.equal(rolloverPause.countdownLabel, "5m");
  });

  it("uses a dedicated spot metals session instead of the futures label", () => {
    const maintenanceWindow = getMarketClock(
      "XAUUSD",
      "America/Chicago",
      new Date("2026-06-15T21:30:00.000Z"),
    );

    assert.equal(maintenanceWindow.marketLabel, "Spot metals session");
    assert.equal(maintenanceWindow.statusLabel, "Closed");
    assert.equal(maintenanceWindow.nextEventLabel, "Opens");
    assert.equal(maintenanceWindow.countdownLabel, "30m");
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

  it("uses each session center's local hours instead of fixed UTC offsets", () => {
    const cases = [
      {
        id: "asia",
        now: "2026-06-12T00:30:00.000Z",
      },
      {
        id: "europe",
        now: "2026-01-12T08:30:00.000Z",
      },
      {
        id: "north_america",
        now: "2026-06-12T12:30:00.000Z",
      },
      {
        id: "australia",
        now: "2026-06-12T06:30:00.000Z",
      },
    ] as const;

    for (const testCase of cases) {
      const sessions = getGlobalSessions(
        "America/New_York",
        "any",
        new Date(testCase.now),
      );
      assert.equal(
        sessions.find((session) => session.id === testCase.id)?.isOpen,
        true,
      );
    }
  });

  it("keeps regional trading sessions closed on the weekend", () => {
    const sessions = getGlobalSessions(
      "America/New_York",
      "any",
      new Date("2026-06-13T14:00:00.000Z"),
    );

    assert.equal(sessions.every((session) => !session.isOpen), true);
  });

  it("finds the next local session after a daylight-saving clock change", () => {
    const sessions = getGlobalSessions(
      "America/New_York",
      "any",
      new Date("2026-10-30T22:30:00.000Z"),
    );
    const northAmerica = sessions.find((session) =>
      session.id === "north_america"
    );

    assert.equal(northAmerica?.isOpen, false);
    assert.equal(northAmerica?.nextEventLabel, "Opens");
    assert.equal(northAmerica?.nextEventUserTime, "8:00 AM EST");
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

describe("profile insights", () => {
  it("summarizes the user's most reviewed markets without changing asset sort rules", () => {
    const setups = [
      buildTradeSetup({ created_at: "2026-06-20T12:00:00.000Z", id: "1", outcome: "take_profit", symbol: "EURUSD" }),
      buildTradeSetup({ created_at: "2026-06-21T12:00:00.000Z", id: "2", outcome: "stop_loss", symbol: "EURUSD" }),
      buildTradeSetup({ created_at: "2026-06-22T12:00:00.000Z", id: "3", outcome: "pending", symbol: "BTCUSD" }),
      buildTradeSetup({ created_at: "2026-06-23T12:00:00.000Z", id: "4", outcome: "take_profit", symbol: "AUDUSD" }),
      buildTradeSetup({ created_at: "2026-06-24T12:00:00.000Z", id: "5", outcome: "pending", symbol: "AUDUSD" }),
      buildTradeSetup({ created_at: "2026-06-25T12:00:00.000Z", id: "6", outcome: "pending", symbol: "XAUUSD" }),
    ];

    assert.deepEqual(
      buildProfileReviewPattern(setups).map((item) => ({
        count: item.count,
        symbol: item.symbol,
        winRate: item.winRate,
      })),
      [
        { count: 2, symbol: "AUDUSD", winRate: 100 },
        { count: 2, symbol: "EURUSD", winRate: 50 },
        { count: 1, symbol: "BTCUSD", winRate: null },
      ],
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

function buildTradeSetup({
  created_at,
  id,
  outcome,
  symbol,
}: {
  created_at: string;
  id: string;
  outcome: string;
  symbol: string;
}): TradeSetupRow {
  return {
    analyzer_version: "test",
    breakeven_trigger_price: 1.02,
    confidence_score: 80,
    confluence: {},
    correlation_group: null,
    created_at,
    id,
    limit_entry: 1,
    risk_model: {},
    side: "buy",
    status: "generated",
    stop_loss: 0.98,
    symbol,
    take_profit: 1.04,
    trade_outcomes: [{ outcome, realized_pnl: null }],
  };
}

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
