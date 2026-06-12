import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getGlobalSessions, getMarketClock } from "../src/lib/marketSessions";
import { US_STATE_TIME_ZONES } from "../src/lib/profile";
import { AVAILABLE_ASSET_GROUPS, formatSecurityLabel } from "../src/lib/symbolMap";

describe("asset catalog", () => {
  it("keeps the public asset list focused and sorted by category, base, then quote", () => {
    assert.deepEqual(
      AVAILABLE_ASSET_GROUPS.map((group) => group.label),
      ["Crypto", "Forex", "Futures", "Metals"],
    );

    const forex = AVAILABLE_ASSET_GROUPS.find((group) => group.label === "Forex")?.options.map((option) => option.symbol);
    assert.deepEqual(forex?.slice(0, 8), ["AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "CADCHF", "CADJPY", "CHFJPY"]);

    const crypto = AVAILABLE_ASSET_GROUPS.find((group) => group.label === "Crypto")?.options.map((option) => option.symbol);
    assert.deepEqual(crypto, ["ADAUSD", "BCHUSD", "BNBUSD", "BTCUSD", "ETHUSD", "LTCUSD", "SOLUSD", "XRPUSD"]);
  });

  it("formats user-facing asset labels without provider fallback details", () => {
    assert.equal(formatSecurityLabel("EURUSD"), "EUR/USD - Euro / U.S. Dollar");
    assert.equal(formatSecurityLabel("XAUUSD"), "XAU/USD - Gold / U.S. Dollar");
  });
});

describe("profile preferences", () => {
  it("limits timezone choices to the six time zones covering the fifty states", () => {
    assert.deepEqual(
      US_STATE_TIME_ZONES.map((option) => option.label),
      ["Eastern Time", "Central Time", "Mountain Time", "Pacific Time", "Alaska Time", "Hawaii-Aleutian Time"],
    );
  });
});

describe("market clocks", () => {
  it("uses timezone-aware market status for forex", () => {
    const beforeFridayClose = new Date("2026-06-12T20:30:00.000Z");
    const clock = getMarketClock("EURUSD", "America/Chicago", beforeFridayClose);

    assert.equal(clock.marketLabel, "Global FX session");
    assert.equal(clock.statusLabel, "Open");
    assert.equal(clock.nextEventLabel, "Closes");
    assert.equal(clock.countdownLabel, "30m");
  });

  it("returns all global sessions with the selected session highlighted", () => {
    const sessions = getGlobalSessions("America/New_York", "north_america", new Date("2026-06-12T14:00:00.000Z"));

    assert.deepEqual(
      sessions.map((session) => session.label),
      ["Asia", "Europe", "North America", "Australia"],
    );
    assert.equal(sessions.find((session) => session.id === "north_america")?.isPreferred, true);
  });
});
