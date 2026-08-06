import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isDisplayExcluded } from "../src/lib/broker/offsets.ts";
import {
  BROKER_VISIBILITY_EXCLUSIONS,
  type BrokerVisibilityExclusion,
} from "../src/lib/broker/exclusions.ts";
import {
  MASTER_LIST_ROWS,
  sweepUniverse,
} from "../src/lib/broker/masterList.ts";
import {
  AVAILABLE_ASSET_GROUPS,
  type SecurityType,
} from "../src/lib/symbolMap.ts";
import type { BrokerClassification } from "../src/lib/profile.ts";
import {
  OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE,
  scannableSymbolsFor,
  visibleAssetGroups,
  visibleAssetSymbols,
} from "../src/lib/broker/visibility.ts";

// §19 retrofit, Task 19 (amendment 24). scannableSymbolsFor (plus
// visibility.ts's visibleAssetGroups/visibleAssetSymbols, which call it)
// replaces the old pairing of a SecurityType-keyed classification table
// applied to symbolMap's raw AVAILABLE_ASSET_GROUPS plus offsets.ts's
// unconditional isDisplayExcluded check. Every test below either pins the
// resolved set literally (§19f) or proves the new mechanism reproduces the
// OLD mechanism's output exactly — a mechanism change, never an offering
// change.

const FOREX_ACCOUNT = {
  accountSize: 100_000,
  brokerId: "e8" as const,
  classification: "forex" as const,
  displayName: null,
  drawdownTier: "2.5-8",
  id: "acc-1",
  platform: "tradelocker" as const,
  programLine: "pro_forex" as const,
  riskPercent: 0.5,
  stage: "performance" as const,
};

const CRYPTO_ACCOUNT = {
  ...FOREX_ACCOUNT,
  classification: "crypto" as const,
  programLine: "pro_crypto" as const,
};

const FUTURES_ACCOUNT = {
  ...FOREX_ACCOUNT,
  classification: "futures" as const,
  drawdownTier: null,
  platform: "tradovate" as const,
  programLine: "signature_futures" as const,
};

describe("scannableSymbolsFor / visibleAssetSymbols — per-account-type sets, pinned symbol-for-symbol", () => {
  // Captured from the pre-retrofit code (visibility.ts's old
  // HIDDEN_ASSET_TYPES_BY_CLASSIFICATION + offsets.ts's unconditional
  // isDisplayExcluded, applied to symbolMap's raw AVAILABLE_ASSET_GROUPS)
  // before this task touched a single line, via a throwaway probe script
  // against the pre-edit files. Every array below is that captured output,
  // sorted. A future change to the visible offering — deliberate or not —
  // must edit this literal table; that edit is the review's signal to ask
  // whether the change is the owner's separate ruling this task explicitly
  // disclaims making.
  const PINNED_FOREX = [
    "ADAUSD", "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "BCHUSD",
    "BTCUSD", "CADCHF", "CADJPY", "CHFJPY", "ETHUSD", "EURAUD", "EURCAD",
    "EURCHF", "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD",
    "GBPCHF", "GBPJPY", "GBPNZD", "GBPUSD", "LTCUSD", "NZDCAD", "NZDCHF",
    "NZDJPY", "NZDUSD", "SOLUSD", "USDCAD", "USDCHF", "USDJPY", "WTI",
    "XAGUSD", "XAUUSD", "XRPUSD",
  ].sort();

  const PINNED_CRYPTO = [
    "ADAUSD", "BCHUSD", "BTCUSD", "ETHUSD", "LTCUSD", "SOLUSD", "XRPUSD",
  ].sort();

  const PINNED_FUTURES = [
    "BZUSD", "CLUSD", "ESUSD", "GCUSD", "MGCUSD", "NQUSD", "RTYUSD",
    "SIUSD", "YMUSD", "ZBUSD", "ZNUSD",
  ].sort();

  const PINNED_NULL = [...new Set([...PINNED_FOREX, ...PINNED_FUTURES])].sort();

  it("forex: exactly 38 symbols, pinned", () => {
    assert.deepEqual([...visibleAssetSymbols(FOREX_ACCOUNT)].sort(), PINNED_FOREX);
    assert.equal(PINNED_FOREX.length, 38);
  });

  it("crypto: exactly 7 symbols, pinned", () => {
    assert.deepEqual([...visibleAssetSymbols(CRYPTO_ACCOUNT)].sort(), PINNED_CRYPTO);
    assert.equal(PINNED_CRYPTO.length, 7);
  });

  it("futures: exactly 11 symbols, pinned", () => {
    assert.deepEqual([...visibleAssetSymbols(FUTURES_ACCOUNT)].sort(), PINNED_FUTURES);
    assert.equal(PINNED_FUTURES.length, 11);
  });

  it("null (no active account): the union of all three, 49 symbols, pinned", () => {
    assert.deepEqual([...visibleAssetSymbols(null)].sort(), PINNED_NULL);
    assert.equal(PINNED_NULL.length, 49);
  });

  it("scannableSymbolsFor agrees with visibleAssetSymbols for every classification", () => {
    assert.deepEqual([...scannableSymbolsFor("forex")].sort(), PINNED_FOREX);
    assert.deepEqual([...scannableSymbolsFor("crypto")].sort(), PINNED_CRYPTO);
    assert.deepEqual([...scannableSymbolsFor("futures")].sort(), PINNED_FUTURES);
    assert.deepEqual([...scannableSymbolsFor(null)].sort(), PINNED_NULL);
  });
});

describe("before/after equality — the retrofit changes MECHANISM, not the offering", () => {
  // The RETIRED mechanism, reconstructed here from the primitives it was
  // built from (symbolMap.ts's AVAILABLE_ASSET_GROUPS, offsets.ts's
  // isDisplayExcluded) — both untouched by this task — rather than copied
  // from visibility.ts, which no longer contains this logic at all. This is
  // an independent re-derivation, not a second pin of the same literal
  // list above: if a future edit changed either the new resolver OR one of
  // these untouched primitives in a way that altered the visible universe,
  // this comparison would catch it even if the literal pins above were
  // (wrongly) updated to match.
  const RETIRED_HIDDEN_ASSET_TYPES_BY_CLASSIFICATION: Record<
    BrokerClassification,
    SecurityType[]
  > = {
    crypto: ["Forex", "Metals", "Energies", "Indices", "Futures"],
    forex: ["Futures"],
    futures: ["Forex", "Metals", "Energies", "Indices", "Crypto"],
  };

  function preRetrofitVisibleAssetSymbols(
    classification: BrokerClassification | null,
  ): string[] {
    const hidden = classification === null
      ? new Set<SecurityType>()
      : new Set(RETIRED_HIDDEN_ASSET_TYPES_BY_CLASSIFICATION[classification]);
    return AVAILABLE_ASSET_GROUPS
      .filter((group) => !hidden.has(group.label))
      .flatMap((group) =>
        group.options
          .filter((option) => !isDisplayExcluded(option.symbol))
          .map((option) => option.symbol)
      );
  }

  for (const [label, account, classification] of [
    ["forex", FOREX_ACCOUNT, "forex" as const],
    ["crypto", CRYPTO_ACCOUNT, "crypto" as const],
    ["futures", FUTURES_ACCOUNT, "futures" as const],
    ["null (no active account)", null, null],
  ] as const) {
    it(`${label}: the new resolver's output equals the retired mechanism's output, symbol-for-symbol`, () => {
      const before = preRetrofitVisibleAssetSymbols(classification).sort();
      const after = [...visibleAssetSymbols(account)].sort();
      assert.deepEqual(after, before);
    });
  }

  it("the equality holds for visibleAssetGroups' shape too, not just the flattened symbol list", () => {
    for (const [account, classification] of [
      [FOREX_ACCOUNT, "forex" as const],
      [CRYPTO_ACCOUNT, "crypto" as const],
      [FUTURES_ACCOUNT, "futures" as const],
      [null, null],
    ] as const) {
      const before = preRetrofitVisibleAssetSymbols(classification).sort();
      const afterGroups = visibleAssetGroups(account);
      const afterFlat = afterGroups.flatMap((group) => group.options.map((o) => o.symbol)).sort();
      assert.deepEqual(afterFlat, before);
      // No empty group ever renders — the same rule the retired mechanism enforced.
      for (const group of afterGroups) {
        assert.ok(group.options.length > 0, `${group.label} rendered with zero options`);
      }
    }
  });
});

describe("an exclusion scoped to ONE account type — present on another (synthetic fixture, mechanism proof)", () => {
  // No REAL symbol is excluded on only one of several account types it
  // would otherwise be reachable from today — BRENT (the one live
  // exclusion) is offered on no account type but forex, so scoping it
  // changes nothing observable. The owner has flagged BNBUSD as the real
  // case coming (include on crypto, absent on forex) but has not yet
  // ruled on it (exclusions.ts's own header comment), so this proves the
  // MECHANISM against a synthetic fixture row instead, per this task's own
  // instruction. BTCUSD is the stand-in: a real, currently-servedToday
  // Crypto-classified symbol reachable from BOTH forex (whose offered set
  // includes "crypto") and crypto accounts today — exactly BNB's future
  // shape, one classification removed from being it.
  const syntheticExclusion: BrokerVisibilityExclusion = {
    levelflowSymbol: "BTCUSD",
    accountTypes: ["crypto"],
    ground: "sweep-performance",
    detail: "test fixture — proves the cross-account-type mechanism, not a real exclusion",
  };

  // `exclusions` is an injected REPLACEMENT list, not an addition (see
  // scannableSymbolsFor's own signature) — every call below that wants "the
  // real register, plus this one synthetic row" must spell that out, or it
  // silently un-excludes BRENT for the duration of that call. This is a
  // property of the resolver's dependency-injection contract, not a bug;
  // exercised directly two tests down.
  const withSynthetic = [...BROKER_VISIBILITY_EXCLUSIONS, syntheticExclusion];

  it("BTCUSD is present on both forex and crypto with no injected exclusion (today's real baseline)", () => {
    assert.ok(scannableSymbolsFor("forex").includes("BTCUSD"));
    assert.ok(scannableSymbolsFor("crypto").includes("BTCUSD"));
  });

  it("with the synthetic exclusion added alongside the real register, BTCUSD is absent on crypto but still present on forex", () => {
    const onCrypto = scannableSymbolsFor("crypto", withSynthetic);
    const onForex = scannableSymbolsFor("forex", withSynthetic);
    assert.ok(!onCrypto.includes("BTCUSD"), "BTCUSD must be excluded on crypto");
    assert.ok(onForex.includes("BTCUSD"), "BTCUSD must stay visible on forex — the exclusion is scoped, not global");
  });

  it("the injected exclusion touches no other symbol on either account type", () => {
    const baselineCrypto = scannableSymbolsFor("crypto").filter((s) => s !== "BTCUSD");
    const excludedCrypto = scannableSymbolsFor("crypto", withSynthetic);
    assert.deepEqual([...excludedCrypto].sort(), [...baselineCrypto].sort());

    const baselineForex = scannableSymbolsFor("forex");
    const excludedForex = scannableSymbolsFor("forex", withSynthetic);
    assert.deepEqual([...excludedForex].sort(), [...baselineForex].sort());
  });

  it("the synthetic exclusion never leaks into the production register or a call with no injected list", () => {
    assert.ok(scannableSymbolsFor("crypto").includes("BTCUSD"));
    assert.ok(!scannableSymbolsFor("crypto", withSynthetic).includes("BTCUSD"));
  });

  it("passing an exclusions list is a full replacement, not an addition — proven directly, since the resolver's own contract depends on it", () => {
    // A bare synthetic-only list (no BRENT entry) un-excludes BRENT on
    // forex — this is the exact mistake the tests above avoid by spreading
    // BROKER_VISIBILITY_EXCLUSIONS first. Pinned here so the contract is
    // asserted, not just relied upon silently.
    assert.ok(!scannableSymbolsFor("forex").includes("BRENT"));
    assert.ok(scannableSymbolsFor("forex", [syntheticExclusion]).includes("BRENT"));
  });
});

describe("no-FMP-source rows and NOT_SCANNABLE rows never appear in any account type's resolved set", () => {
  it("BNBUSD stays absent from every account type — governed by symbolMap.ts's own NO_TRADE_SYMBOLS, upstream of this resolver and unruled-on by the owner still", () => {
    for (const classification of ["forex", "crypto", "futures"] as const) {
      assert.ok(!scannableSymbolsFor(classification).includes("BNBUSD"));
    }
    assert.ok(!scannableSymbolsFor(null).includes("BNBUSD"));
  });

  it("the twelve no-FMP-source futures orphans never appear — they carry no Levelflow symbol to appear as", () => {
    const orphanBrokerNames = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "excluded-no-fmp-source")
      .map((entry) => entry.brokerName);
    assert.equal(orphanBrokerNames.length, 12);
    for (const classification of ["forex", "crypto", "futures"] as const) {
      const resolved = new Set(scannableSymbolsFor(classification));
      for (const brokerName of orphanBrokerNames) {
        assert.ok(!resolved.has(brokerName));
      }
    }
  });
});

describe("the sweep universe stays whole — unaffected by account type or the new exclusion register", () => {
  it("sweepUniverse takes no account/classification parameter at all", () => {
    assert.equal(sweepUniverse.length, 0);
  });

  it("still includes BRENT, despite BRENT's forex-scoped visibility exclusion", () => {
    const symbols = sweepUniverse().map((entry) => entry.levelflowSymbol);
    assert.ok(symbols.includes("BRENT"));
  });

  it("still includes every served-but-not-scannable row (SP, NSDQ, DOW, NIKKEI, DAX, NGUSD, HGUSD, BNBUSD, ASX) — these carry an FMP mate and are matched, whatever their scannable-today status", () => {
    const notScannable = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "served-but-not-scannable")
      .map((entry) => entry.levelflowSymbol);
    assert.equal(notScannable.length, 9);
    const swept = new Set(sweepUniverse().map((entry) => entry.levelflowSymbol));
    for (const symbol of notScannable) {
      assert.ok(swept.has(symbol), `${symbol} must stay in the sweep universe`);
    }
  });

  it("excludes only the twelve rows with no FMP mate at all — nothing the new exclusion register names", () => {
    const sweptCount = sweepUniverse().length;
    const noFmpCount = MASTER_LIST_ROWS.filter((entry) => entry.fmpSymbol === null).length;
    assert.equal(noFmpCount, 12);
    assert.equal(sweptCount, MASTER_LIST_ROWS.length - noFmpCount);
  });
});

describe("cross-consistency — masterList's display-excluded STATUS label agrees with exclusions.ts's register", () => {
  // masterList.ts's SERVED_ROWS still labels BRENT's STATUS off offsets.ts's
  // DISPLAY_EXCLUDED_SYMBOLS (a deliberate, documented choice — masterList.ts
  // is untouched by this task, precisely to avoid widening the diff onto the
  // basis-line feature; see visibility.ts's own header for the full
  // reasoning). That leaves two independently-authored facts about BRENT
  // (offsets.ts's displayExcluded flag, and exclusions.ts's register entry)
  // that could drift apart if one were edited without the other. This test
  // exists to fail loudly if they ever do.
  it("every served-but-display-excluded row is excluded, via the new register, on every account type where it would otherwise be reachable", () => {
    const displayExcludedRows = MASTER_LIST_ROWS.filter(
      (entry) => entry.status === "served-but-display-excluded",
    );
    assert.ok(displayExcludedRows.length > 0, "expected at least one display-excluded row to check");
    for (const entry of displayExcludedRows) {
      const symbol = entry.levelflowSymbol as string;
      for (const classification of ["forex", "crypto", "futures"] as const) {
        const offeredHere = OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE[classification]
          .includes(entry.classification);
        if (!offeredHere) {
          continue;
        }
        assert.ok(
          !scannableSymbolsFor(classification).includes(symbol),
          `${symbol} carries served-but-display-excluded but is NOT excluded by the register on "${classification}", where its own classification ("${entry.classification}") is reachable`,
        );
      }
    }
  });
});

describe("no user surface bypasses the resolver — source-text pins over the four named surfaces", () => {
  it("AdvisorWorkspace.tsx (scope menu + chart/security selection) imports the resolver from visibility.ts, not a competing table", () => {
    const source = readFileSync("src/components/workspace/AdvisorWorkspace.tsx", "utf8");
    assert.match(
      source,
      /import \{ visibleAssetGroups, visibleAssetSymbols \} from "\.\.\/\.\.\/lib\/broker\/visibility";/,
    );
    assert.doesNotMatch(source, /HIDDEN_ASSET_TYPES_BY_CLASSIFICATION/);
    assert.doesNotMatch(source, /OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE/);
  });

  it("marketScanFilters.ts (the scan universe) imports the resolver from visibility.ts, not a competing table", () => {
    const source = readFileSync("src/components/workspace/marketScanFilters.ts", "utf8");
    assert.match(
      source,
      /import \{ visibleAssetSymbols \} from "\.\.\/\.\.\/lib\/broker\/visibility";/,
    );
    assert.doesNotMatch(source, /HIDDEN_ASSET_TYPES_BY_CLASSIFICATION/);
    assert.doesNotMatch(source, /OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE/);
  });

  it("HistoryPanel.tsx (the Insights market filter) imports the resolver from visibility.ts, not a competing table", () => {
    const source = readFileSync("src/components/workspace/HistoryPanel.tsx", "utf8");
    assert.match(
      source,
      /import \{ visibleAssetGroups \} from "\.\.\/\.\.\/lib\/broker\/visibility";/,
    );
    assert.doesNotMatch(source, /HIDDEN_ASSET_TYPES_BY_CLASSIFICATION/);
    assert.doesNotMatch(source, /OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE/);
  });

  it("ScopeMenu.tsx and MarketScanPanel.tsx never import visibility.ts, masterList.ts, or exclusions.ts directly — they render whatever pre-filtered groups/symbols their caller threads through as props", () => {
    for (
      const file of [
        "src/components/workspace/ScopeMenu.tsx",
        "src/components/workspace/MarketScanPanel.tsx",
      ]
    ) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /from "..\/..\/lib\/broker\/(visibility|masterList|exclusions)"/);
    }
  });

  it("visibility.ts itself never imports masterList.ts — the live resolver is built on symbolMap.ts's already-served master 50, not the backend-only registry (bundle discipline: see visibility.ts's own header)", () => {
    const source = readFileSync("src/lib/broker/visibility.ts", "utf8");
    assert.doesNotMatch(source, /from "\.\/masterList"/);
    assert.doesNotMatch(source, /from "\.\/offsets"/);
    assert.match(source, /from "\.\/exclusions"/);
  });

  it("masterList.ts is still never imported from src/components — the bundle-exclusion invariant its own header claims holds after this task too", () => {
    for (
      const file of [
        "src/components/workspace/AdvisorWorkspace.tsx",
        "src/components/workspace/marketScanFilters.ts",
        "src/components/workspace/HistoryPanel.tsx",
        "src/components/workspace/ScopeMenu.tsx",
        "src/components/workspace/MarketScanPanel.tsx",
        "src/lib/broker/visibility.ts",
      ]
    ) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /from ".*\/broker\/masterList"/,
        `${file} must not import masterList.ts — it would pull the 98-row registry's prose into the client bundle`,
      );
    }
  });
});
