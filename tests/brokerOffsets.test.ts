import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BROKER_OFFSETS,
  DISPLAY_EXCLUDED_SYMBOLS,
  adjustedEntryFor,
  getBrokerOffset,
  isBasisDisplayed,
  isDisplayExcluded,
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

  // Fix round 1 (2026-08-05): the one predicate every reopen-affordance check
  // (AdvisorWorkspace's stored-setup gate, the Current trades rail, the
  // Insights row) reuses — never a second, independently-maintained list.
  it("isDisplayExcluded agrees with DISPLAY_EXCLUDED_SYMBOLS for every case", () => {
    assert.equal(isDisplayExcluded("BRENT"), true);
    assert.equal(isDisplayExcluded("XAGUSD"), false);
    assert.equal(isDisplayExcluded("WTI"), false);
    assert.equal(isDisplayExcluded("EURUSD"), false);
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

// Fix round 1's two remaining pins, source-text form (AdvisorWorkspace's and
// HistoryPanel's import graphs are browser-shaped; the repo's established
// source-pin idiom covers what direct import cannot):
import { readFileSync } from "node:fs";

describe("the reopen routes close for display-excluded symbols (amendment 23, fix round 1)", () => {
  const workspace = readFileSync(
    "src/components/workspace/AdvisorWorkspace.tsx",
    "utf8",
  );
  const history = readFileSync(
    "src/components/workspace/HistoryPanel.tsx",
    "utf8",
  );

  it("the stored-setup gate refuses display-excluded symbols", () => {
    assert.match(
      workspace,
      /export function canReopenStoredSetup\(symbol: string\): boolean \{[\s\S]{0,200}?!isDisplayExcluded\(symbol\);/,
    );
    assert.match(
      workspace,
      /const isAvailable = canReopenStoredSetup\(requestedSetup\.symbol\);/,
    );
  });

  it("the Insights row renders a display-excluded symbol as a record without the affordance", () => {
    // ONE anchored pattern spanning the whole ternary, deliberately: three
    // separate matches all pass under a SWAPPED ternary (excluded symbols
    // keeping the button, ordinary ones losing it) — which is the exact
    // Critical this fix round closes. The branch ORDER is the assertion:
    // isDisplayExcluded -> plain span (the record, no affordance) THEN the
    // <button> branch with its aria-label. Both branches render
    // {setup.symbol}: the record never disappears from the ledger.
    assert.match(
      history,
      /\{isDisplayExcluded\(setup\.symbol\)\)?[\s\S]{0,80}?\?[\s\S]{0,900}?<span className="inline-flex min-h-11 items-center font-semibold text-ink">[\s\S]{0,60}?\{setup\.symbol\}[\s\S]{0,200}?:[\s\S]{0,400}?aria-label=\{`Open \$\{setup\.symbol\} in Advisor`\}/,
    );
    // And the record branch is not a disabled control wearing a span's
    // clothes (§17c): between the predicate and the branch separator there is
    // no button and no handler at all. The slice stops AT the separator on
    // purpose — one character further and it swallows the else branch's own
    // <button>, which is exactly what it must not be measuring.
    const branchStart = history.indexOf("{isDisplayExcluded(setup.symbol)");
    const recordBranch = history.slice(
      branchStart,
      history.indexOf("\n          : (", branchStart),
    );
    assert.ok(recordBranch.length > 0 && recordBranch.length < 900);
    assert.doesNotMatch(recordBranch, /onClick|<button/);
    assert.match(recordBranch, /<span className="inline-flex min-h-11/);
  });
});
