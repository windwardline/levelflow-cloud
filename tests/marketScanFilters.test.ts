import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  filterMarketScanCandidatesByScope,
  filterSymbolsByAvailability,
  getMarketScanSymbolsForScope,
} from "../src/components/workspace/marketScanFilters";
import {
  HIDDEN_ASSET_TYPES_BY_CLASSIFICATION,
  visibleAssetGroups,
  visibleAssetSymbols,
} from "../src/lib/broker/visibility";
import { AVAILABLE_ASSET_GROUPS, AVAILABLE_ASSET_SYMBOLS } from "../src/lib/symbolMap";
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
    const resolved = getMarketScanSymbolsForScope({ kind: "all" }, null);
    assert.ok(resolved.length > 0);
    assert.deepEqual(resolved, ALL_AVAILABLE_SYMBOLS);
  });

  it("a closed single-market scope resolves to no attemptable symbols at all, on a mocked weekend clock", () => {
    const resolved = getMarketScanSymbolsForScope({
      kind: "symbol",
      symbol: "EURUSD",
    }, null);
    assert.deepEqual(
      filterSymbolsByAvailability(resolved, SATURDAY_NOON_ET),
      [],
    );
  });

  it("a closed group scope also resolves to nothing attemptable, on the same mocked clock", () => {
    const resolved = getMarketScanSymbolsForScope({
      assetType: "Metals",
      kind: "group",
    }, null);
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
      null,
    );
    assert.equal(result.length, 1);
  });

  it("still excludes a candidate outside the selected scope", () => {
    const result = filterMarketScanCandidatesByScope(
      [candidate({ symbol: "BTCUSD" })],
      { kind: "symbol", symbol: "EURUSD" },
      null,
    );
    assert.deepEqual(result, []);
  });
});

const FOREX_ACCOUNT = {
  accountSize: 100_000,
  brokerId: "e8" as const,
  classification: "forex" as const,
  drawdownTier: "2.5-8",
  id: "acc-1",
  platform: "tradelocker" as const,
  programLine: "pro_forex" as const,
  riskPercent: 0.5,
  stage: "performance" as const,
};

describe("amendment 13 — market availability follows the account classification", () => {
  it("shows everything with no active account", () => {
    assert.deepEqual(visibleAssetGroups(null), AVAILABLE_ASSET_GROUPS);
    assert.deepEqual(visibleAssetSymbols(null), AVAILABLE_ASSET_SYMBOLS);
  });

  it("hides Futures on a Forex account and keeps Energies", () => {
    const labels = visibleAssetGroups(FOREX_ACCOUNT).map((group) => group.label);
    assert.ok(!labels.includes("Futures"), "E8 Forex accounts cannot trade futures");
    assert.ok(labels.includes("Energies"), "Energies remain on Forex accounts");
    const symbols = visibleAssetSymbols(FOREX_ACCOUNT);
    assert.ok(symbols.includes("WTI") && symbols.includes("BRENT"));
    for (const futures of ["ESUSD", "NQUSD", "YMUSD", "RTYUSD", "GCUSD", "MGCUSD", "SIUSD", "CLUSD", "BZUSD", "ZBUSD", "ZNUSD"]) {
      assert.ok(!symbols.includes(futures), `${futures} must not be visible`);
    }
  });

  it("shows only Futures on a Futures account", () => {
    const account = {
      ...FOREX_ACCOUNT,
      classification: "futures" as const,
      drawdownTier: null,
      platform: "tradovate" as const,
      programLine: "signature_futures" as const,
    };
    assert.deepEqual(
      visibleAssetGroups(account).map((group) => group.label),
      ["Futures"],
    );
  });

  it("shows only Crypto on a Crypto account", () => {
    const account = {
      ...FOREX_ACCOUNT,
      classification: "crypto" as const,
      programLine: "pro_crypto" as const,
    };
    assert.deepEqual(
      visibleAssetGroups(account).map((group) => group.label),
      ["Crypto"],
    );
  });

  // The owner was explicit: nothing is deleted behind the curtain.
  it("deletes nothing — the full universe is still reachable from the modules", () => {
    const source = readFileSync("src/lib/broker/visibility.ts", "utf8");
    assert.doesNotMatch(source, /NO_TRADE_SYMBOLS|TEMPORARILY_HIDDEN/);
    assert.equal(AVAILABLE_ASSET_SYMBOLS.length, 50);
  });

  // HIDDEN_ASSET_TYPES_BY_CLASSIFICATION is the table the four tests above
  // exercise indirectly, through visibleAssetGroups/visibleAssetSymbols. Pinned
  // directly too: forex hides only Futures (Indices/Metals have no classification
  // of their own, so they simply stay off forex's list and remain scannable),
  // while crypto and futures each hide every other class, Indices/Metals
  // included — so a future edit to one classification's row can't silently
  // change another's by accident.
  it("names exactly what each classification cannot trade", () => {
    assert.deepEqual(HIDDEN_ASSET_TYPES_BY_CLASSIFICATION.forex, ["Futures"]);
    assert.deepEqual(
      HIDDEN_ASSET_TYPES_BY_CLASSIFICATION.crypto,
      ["Forex", "Metals", "Energies", "Indices", "Futures"],
    );
    assert.deepEqual(
      HIDDEN_ASSET_TYPES_BY_CLASSIFICATION.futures,
      ["Forex", "Metals", "Energies", "Indices", "Crypto"],
    );
  });
});

// Task 8 fix round 1 — review finding on 22e5fc1: AdvisorWorkspace.tsx's
// amendment-13 reset effect used to touch only `scope`, leaving a just-
// finished scan's candidates on screen under a scope the menu no longer
// offers. filterMarketScanCandidatesByScope's "all" case (marketScanFilters.ts,
// this file's own import) passes every candidate through unconditionally, so
// the rail would keep rendering the stale rows — fully clickable, with no
// account-visibility check anywhere downstream — while the scanned/qualified
// count line kept describing a scan whose rows no longer honestly belong to
// it. That is the exact visible-list-vs-count disagreement the m3 note above
// (filterMarketScanCandidatesByScope's own header comment) retired the
// Quality band over: a render-side filter alone reintroduces it one layer up.
// Source-pinned rather than rendered — no jsdom in this repo's unit-test
// stack (see tests/historyPanel.test.tsx's header comment) — and scoped to
// the reset effect's own block, not merely that these calls exist somewhere
// in the file, so a future edit that moves setScanResult/setScanCompletedAt
// out of this branch (rather than genuinely fixing it) still fails this pin.
describe("amendment 13 fix round 1 — the scope reset also drops the stale scan", () => {
  it("clears scanResult and scanCompletedAt in the same block that resets scope to All markets", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorWorkspace.tsx",
      "utf8",
    );
    assert.match(
      source,
      /if \(!stillVisible\) \{\s*setScope\(\{ kind: "all" \}\);\s*setScanResult\(null\);\s*setScanCompletedAt\(null\);\s*\}/,
    );
  });
});

// §19 retrofit, Task 9: the scan ACTION and its RESULTS follow the active
// account, not just the scope menu Task 8 already scoped. The reset effect
// pinned just above only fires for a named group/symbol scope the new
// account hides, and deliberately leaves scope "all" alone (every account
// can see *something*, so "all" is never itself invalid) — so a scan
// completed under one account can still be sitting in scanResult, under
// scope "all", after a switch to an account of a different classification.
// getMarketScanSymbolsForScope (the request) and
// filterMarketScanCandidatesByScope (the render) both close that gap.
describe("amendment 13 — the scan action never reaches a hidden market", () => {
  it("amendment 13 — the scan action never reaches a hidden market", () => {
    const all = getMarketScanSymbolsForScope({ kind: "all" }, FOREX_ACCOUNT);
    for (const futures of ["ESUSD", "NQUSD", "YMUSD", "RTYUSD", "GCUSD", "MGCUSD", "SIUSD", "CLUSD", "BZUSD", "ZBUSD", "ZNUSD"]) {
      assert.ok(!all.includes(futures));
    }
    assert.ok(all.includes("EURUSD") && all.includes("WTI") && all.includes("XAUUSD"));
  });

  it("amendment 13 — a named hidden symbol yields no scan rather than a hidden one", () => {
    assert.deepEqual(
      getMarketScanSymbolsForScope({ kind: "symbol", symbol: "ESUSD" }, FOREX_ACCOUNT),
      [],
    );
  });

  it("amendment 13 — results drop hidden markets too", () => {
    const candidates = [
      { symbol: "EURUSD" },
      { symbol: "ESUSD" },
    ] as Parameters<typeof filterMarketScanCandidatesByScope>[0];
    assert.deepEqual(
      filterMarketScanCandidatesByScope(candidates, { kind: "all" }, FOREX_ACCOUNT)
        .map((row) => row.symbol),
      ["EURUSD"],
    );
  });
});
