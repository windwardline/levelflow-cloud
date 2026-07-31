import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterMarketScanCandidatesByScope,
  filterSymbolsByAvailability,
  getMarketScanSymbolsForScope,
} from "../src/components/workspace/marketScanFilters";
import { AVAILABLE_ASSET_GROUPS } from "../src/lib/symbolMap";
import type { MarketScanCandidate } from "../src/lib/tradeAnalyzer";

// Same known week tests/marketHours.test.ts and tests/scopeMenu.test.tsx
// already use (America/New_York): a Wednesday when every class is open,
// and the Saturday when only crypto is (spec
// 2026-07-30-levelflow-desk-design.md #10b).
const WEDNESDAY_2PM_ET = new Date("2026-06-10T18:00:00.000Z");
const SATURDAY_NOON_ET = new Date("2026-06-13T16:00:00.000Z");

const ALL_AVAILABLE_SYMBOLS = AVAILABLE_ASSET_GROUPS.flatMap((group) =>
  group.options.map((option) => option.symbol)
);

describe("filterSymbolsByAvailability (I5: the scan must never attempt a closed market)", () => {
  it("keeps every symbol when every class is open (mocked clock: Wednesday)", () => {
    assert.deepEqual(
      filterSymbolsByAvailability(ALL_AVAILABLE_SYMBOLS, WEDNESDAY_2PM_ET),
      ALL_AVAILABLE_SYMBOLS,
    );
  });

  it("on a mocked weekend clock, keeps only crypto and drops every other class", () => {
    const cryptoSymbols = AVAILABLE_ASSET_GROUPS.find((group) =>
      group.label === "Crypto"
    )?.options.map((option) => option.symbol) ?? [];
    assert.ok(cryptoSymbols.length > 0);

    assert.deepEqual(
      filterSymbolsByAvailability(ALL_AVAILABLE_SYMBOLS, SATURDAY_NOON_ET),
      cryptoSymbols,
    );
  });

  it("preserves input order rather than re-sorting", () => {
    assert.deepEqual(
      filterSymbolsByAvailability(
        ["XAUUSD", "BTCUSD", "EURUSD"],
        SATURDAY_NOON_ET,
      ),
      ["BTCUSD"],
    );
  });

  it("returns an empty list for an empty input, never throwing", () => {
    assert.deepEqual(filterSymbolsByAvailability([], SATURDAY_NOON_ET), []);
  });
});

describe("getMarketScanSymbolsForScope + filterSymbolsByAvailability composed (I5's actual call shape)", () => {
  it('resolves "all" to every available symbol explicitly, never an empty placeholder list for the server to fill in', () => {
    const resolved = getMarketScanSymbolsForScope({ kind: "all" });
    assert.ok(resolved.length > 0);
    assert.deepEqual(resolved, ALL_AVAILABLE_SYMBOLS);
  });

  it("a closed single-market scope resolves to no attemptable symbols at all, on a mocked weekend clock", () => {
    const resolved = getMarketScanSymbolsForScope({
      kind: "symbol",
      symbol: "EURUSD",
    });
    assert.deepEqual(
      filterSymbolsByAvailability(resolved, SATURDAY_NOON_ET),
      [],
    );
  });

  it("a closed group scope also resolves to nothing attemptable, on the same mocked clock", () => {
    const resolved = getMarketScanSymbolsForScope({
      assetType: "Metals",
      kind: "group",
    });
    assert.ok(resolved.length > 0);
    assert.deepEqual(
      filterSymbolsByAvailability(resolved, SATURDAY_NOON_ET),
      [],
    );
  });
});

describe("filterMarketScanCandidatesByScope (m3: no longer also bands by confidence)", () => {
  function candidate(
    overrides: Partial<MarketScanCandidate> = {},
  ): MarketScanCandidate {
    return {
      assetType: "Forex",
      confidenceScore: 10,
      symbol: "EURUSD",
      ...overrides,
    };
  }

  it("keeps a low-confidence candidate that matches scope — there is no band left to exclude it (spec §5 has no Quality filter)", () => {
    const result = filterMarketScanCandidatesByScope(
      [candidate({ confidenceScore: 5 })],
      { kind: "all" },
    );
    assert.equal(result.length, 1);
  });

  it("still excludes a candidate outside the selected scope", () => {
    const result = filterMarketScanCandidatesByScope(
      [candidate({ symbol: "BTCUSD" })],
      { kind: "symbol", symbol: "EURUSD" },
    );
    assert.deepEqual(result, []);
  });
});
