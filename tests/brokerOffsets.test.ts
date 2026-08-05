import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BROKER_OFFSETS,
  DISPLAY_EXCLUDED_SYMBOLS,
  adjustedEntryFor,
  getBrokerOffset,
  isBasisDisplayed,
} from "../src/lib/broker/offsets.ts";

// The offset ruling of record (owner, 2026-08-05 — amendment 23's extension,
// docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md). Three
// E8-vs-FMP bases, each measured at least twice and stable across sessions
// and days (docs/research/e8-feed-verification-2026-08-02.md, frames
// F1/F4/F6/F7/F9/F10). Literal-value pins, §19f discipline: changeable only
// with a deliberate test edit citing a fresh measurement — the same law
// tests/calibrationState.test.ts enforces for the calibration constants.
const STATE = {
  XAGUSD: { basis: 0.17, displayExcluded: false },
  WTI: { basis: 0.24, displayExcluded: false },
  BRENT: { basis: 1.67, displayExcluded: true },
} as const;

describe("broker offsets (amendment 23's offset ruling, owner 2026-08-05)", () => {
  it("pins the three recorded offsets exactly", () => {
    for (const [symbol, expected] of Object.entries(STATE)) {
      const offset = getBrokerOffset(symbol);
      assert.ok(offset, `expected a recorded offset for ${symbol}`);
      assert.equal(offset!.basis, expected.basis);
      assert.equal(offset!.displayExcluded, expected.displayExcluded);
    }
  });

  it("records exactly these three symbols, no more and no fewer", () => {
    assert.deepEqual(
      BROKER_OFFSETS.map((offset) => offset.levelflowSymbol).sort(),
      ["BRENT", "WTI", "XAGUSD"],
    );
  });

  it("returns null for a symbol with no recorded offset", () => {
    assert.equal(getBrokerOffset("EURUSD"), null);
  });

  it("carries every offset's provenance — at least one measured frame apiece", () => {
    for (const offset of BROKER_OFFSETS) {
      assert.ok(
        offset.measuredAt.length > 0,
        `${offset.levelflowSymbol} carries no measured-frame provenance`,
      );
    }
  });

  it("display-excludes exactly BRENT — the offset ruling's own scope", () => {
    assert.deepEqual([...DISPLAY_EXCLUDED_SYMBOLS], ["BRENT"]);
  });

  it("shows the basis line for XAGUSD and WTI, never for BRENT or an unrecorded symbol", () => {
    assert.equal(isBasisDisplayed("XAGUSD"), true);
    assert.equal(isBasisDisplayed("WTI"), true);
    assert.equal(isBasisDisplayed("BRENT"), false);
    assert.equal(isBasisDisplayed("EURUSD"), false);
  });

  describe("adjustedEntryFor — the ladder's entry restated on E8's own feed", () => {
    it("adds XAGUSD's basis to a live entry (the ruling's own worked example)", () => {
      // The approved template's worked example: "E8 quotes ~+0.17 above this
      // feed — entry there ≈ 57.97" from a recorded entry of 57.80.
      assert.equal(adjustedEntryFor("XAGUSD", 57.80), 57.97);
    });

    it("adds WTI's basis to a live entry", () => {
      assert.equal(adjustedEntryFor("WTI", 80.00), 80.24);
    });

    it("never computes an adjusted entry for BRENT — display-excluded means never shown", () => {
      assert.equal(adjustedEntryFor("BRENT", 85.00), null);
    });

    it("returns null for a symbol with no recorded offset", () => {
      assert.equal(adjustedEntryFor("EURUSD", 1.085), null);
    });
  });
});
