import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isContractSizeVariant } from "../src/lib/broker/contractVariants.ts";
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
  AVAILABLE_ASSET_SYMBOLS,
  NO_TRADE_SYMBOLS,
  type SecurityType,
} from "../src/lib/symbolMap.ts";
import type { BrokerClassification } from "../src/lib/profile.ts";
import {
  FOREX_ACCOUNT_CRYPTO_CFDS,
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
  //
  // REFRESHED 2026-08-06 (round 28, 49 markets released) — a data change
  // (calibration.ts, symbolMap.ts's NO_TRADE_SYMBOLS shrinking from 52 to 3
  // entries), not a mechanism change, so it is exactly the kind of edit the
  // paragraph above asks a reviewer to interrogate. FOREX additionally
  // reflects Task 19's own eight-CFD carve-out (FOREX_ACCOUNT_CRYPTO_CFDS),
  // which had never bitten before because only eight or fewer crypto markets
  // were ever onboarded at once — see the dedicated divergence test below.
  const PINNED_FOREX = [
    "ADAUSD", "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD",
    "BCHUSD", "BNBUSD", "BTCUSD", "CADCHF", "CADJPY", "CHFJPY",
    "DAX", "DOW", "ETHUSD", "EURAUD", "EURCAD", "EURCHF",
    "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD",
    "GBPCHF", "GBPJPY", "GBPNZD", "GBPUSD", "LTCUSD", "NIKKEI",
    "NSDQ", "NZDCAD", "NZDCHF", "NZDJPY", "NZDUSD", "SOLUSD",
    "SP", "USDCAD", "USDCHF", "USDJPY", "WTI", "XAGUSD",
    "XAUUSD", "XRPUSD",
  ].sort();

  const PINNED_CRYPTO = [
    "AAVEUSD", "ADAUSD", "ALGOUSD", "ARWUSD", "ATOMUSD", "AVAXUSD",
    "BCHUSD", "BNBUSD", "BTCUSD", "CAKEUSD", "DASHUSD", "DOGEUSD",
    "DOTUSD", "EGLDUSD", "ETCUSD", "ETHUSD", "FILUSD", "GRTUSD",
    "HBARUSD", "IMXUSD", "LINKUSD", "LTCUSD", "NEARUSD", "SOLUSD",
    "THETAUSD", "TRUMPUSD", "TRXUSD", "UNIUSD", "XLMUSD", "XMRUSD",
    "XRPUSD", "XTZUSD",
  ].sort();

  const PINNED_FUTURES = [
    // MGCUSD left the scannable set on 2026-08-05: it is micro gold, a contract-size variant of GCUSD, and the owner ruled one analyzed market per underlying per account type (contractVariants.ts). It keeps its sizing identity and loses its scan slot.
    // The nineteen further down (EMD, FDAX, FESX, GFUSX, HEUSX, HGUSD, HOUSD,
    // LEUSX, NGUSD, NKD, PAUSD, PLUSD, RBUSD, ZCUSX, ZLUSX, ZMUSD, ZOUSX,
    // ZRUSD, ZSUSX) are round 28's release (2026-08-06) — held "pending sweep
    // evidence" until now, per symbolMap.ts's NO_TRADE_SYMBOLS header.
    "BZUSD", "CLUSD", "EMD", "ESUSD", "FDAX", "FESX",
    "GCUSD", "GFUSX", "HEUSX", "HGUSD", "HOUSD", "LEUSX",
    "NGUSD", "NKD", "NQUSD", "PAUSD", "PLUSD", "RBUSD",
    "RTYUSD", "SIUSD", "YMUSD", "ZBUSD", "ZCUSX", "ZLUSX",
    "ZMUSD", "ZNUSD", "ZOUSX", "ZRUSD", "ZSUSX",
  ].sort();

  // No longer forexSet ∪ futuresSet alone: that formula relied on
  // PINNED_CRYPTO being a subset of PINNED_FOREX, true only while a Forex
  // account saw every crypto market. Task 19's eight-CFD carve-out broke
  // that the moment more than eight crypto markets were onboarded — 24 of
  // the 32 crypto markets are crypto-account-only — so the union that
  // answers "reachable from SOME account" must add PINNED_CRYPTO explicitly,
  // or those 24 would silently vanish from NULL.
  const PINNED_NULL = [...new Set([...PINNED_FOREX, ...PINNED_CRYPTO, ...PINNED_FUTURES])].sort();

  it("forex: exactly 44 symbols, pinned", () => {
    assert.deepEqual([...visibleAssetSymbols(FOREX_ACCOUNT)].sort(), PINNED_FOREX);
    assert.equal(PINNED_FOREX.length, 44);
  });

  it("crypto: exactly 32 symbols, pinned", () => {
    assert.deepEqual([...visibleAssetSymbols(CRYPTO_ACCOUNT)].sort(), PINNED_CRYPTO);
    assert.equal(PINNED_CRYPTO.length, 32);
  });

  it("futures: exactly 29 symbols, pinned", () => {
    assert.deepEqual([...visibleAssetSymbols(FUTURES_ACCOUNT)].sort(), PINNED_FUTURES);
    assert.equal(PINNED_FUTURES.length, 29);
  });

  it("null (no active account): the union of all three, 97 symbols, pinned", () => {
    assert.deepEqual([...visibleAssetSymbols(null)].sort(), PINNED_NULL);
    assert.equal(PINNED_NULL.length, 97);
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
          // The retired mechanism predates the contract-size rule (owner,
          // 2026-08-05), so reproducing it verbatim would now expect MGCUSD.
          // Applying the rule to BOTH sides keeps this an equality proof about
          // the MECHANISM — which is all it ever claimed — instead of silently
          // becoming a claim that the offering never changes. The offering did
          // change here, deliberately, by owner ruling.
          .filter((option) => !isContractSizeVariant(option.symbol))
          .map((option) => option.symbol)
      );
  }

  // forex deliberately excluded from this loop — see the dedicated
  // divergence test below, which is where it now belongs.
  for (const [label, account, classification] of [
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

  it("forex: the new resolver's output diverges from the retired mechanism's — by exactly the crypto carve-out, and nothing else", () => {
    // GENUINE DIVERGENCE, not a bug (owner-reviewed, 2026-08-06). The retired
    // mechanism hides whole SecurityTypes per account type — its forex entry
    // hides only "Futures", so it grants a Forex account every Crypto-typed
    // market there is (32 today). That was harmless while eight or fewer
    // crypto markets existed: "all crypto" and "the eight CFDs E8's Pro Forex
    // account actually tickets" coincided, so this equality held by accident.
    // Onboarding the other 24 broke the coincidence, not the mechanism: E8's
    // Forex account genuinely offers only eight named crypto CFDs
    // (visibility.ts's FOREX_ACCOUNT_CRYPTO_CFDS, sourced from the owner's own
    // account screenshots), and a SecurityType-keyed hide list has no way to
    // express "some of this type" — only "all of it" or "none of it". So the
    // new resolver is right and the retired one is structurally unable to
    // reproduce it; this test pins the SHAPE of that gap instead of an
    // equality that no longer holds.
    const before = new Set(preRetrofitVisibleAssetSymbols("forex"));
    const after = new Set(visibleAssetSymbols(FOREX_ACCOUNT));

    const droppedByCarveOut = [...before].filter((symbol) => !after.has(symbol));
    assert.ok(droppedByCarveOut.length > 0, "the carve-out must actually drop something today");
    // Every symbol the new resolver excludes that the retired one would have
    // allowed is a crypto mate outside the eight ticketed CFDs — never a
    // forex, metals, energies or futures symbol, and never one of the eight.
    const allOptionsBySymbol = new Map(
      AVAILABLE_ASSET_GROUPS.flatMap((group) => group.options).map((option) => [
        option.symbol,
        option,
      ]),
    );
    for (const symbol of droppedByCarveOut) {
      assert.ok(
        !FOREX_ACCOUNT_CRYPTO_CFDS.has(symbol),
        `${symbol} is one of the eight carved-in CFDs and must not be dropped`,
      );
      assert.equal(
        allOptionsBySymbol.get(symbol)?.assetType,
        "Crypto",
        `${symbol} must be a crypto-classified market`,
      );
    }
    // And the new resolver adds nothing the retired one lacked — the
    // carve-out only ever narrows the forex set, it never widens it.
    const addedByCarveOut = [...after].filter((symbol) => !before.has(symbol));
    assert.deepEqual(addedByCarveOut, []);
  });

  it("the equality holds for visibleAssetGroups' shape too, not just the flattened symbol list", () => {
    for (const [account, classification] of [
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

    // Forex diverges from the retired mechanism here too (see the dedicated
    // divergence test above) — visibleAssetGroups' shape is checked for
    // self-consistency with visibleAssetSymbols and the no-empty-group rule
    // instead of against the retired mechanism's now-wrong answer.
    const forexGroups = visibleAssetGroups(FOREX_ACCOUNT);
    const forexFlat = forexGroups.flatMap((group) => group.options.map((o) => o.symbol)).sort();
    assert.deepEqual(forexFlat, [...visibleAssetSymbols(FOREX_ACCOUNT)].sort());
    for (const group of forexGroups) {
      assert.ok(group.options.length > 0, `${group.label} rendered with zero options`);
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
  it("keeps every market calibration currently withholds out of every account type", () => {
    // MECHANISM, NOT MEMBERSHIP (owner, 2026-08-06). This used to name SP, NSDQ,
    // DOW, NIKKEI, DAX, NGUSD, HGUSD and BNBUSD as literals, which made a
    // calibration verdict read as a permanent property of those markets. It is
    // not: "every single market is subject to inclusion/exclusion every time we
    // run a replay sweep and tune the engine." Three of those eight came back
    // the moment a defect of ours was fixed, and the literals were what made
    // that a test edit instead of a data change.
    //
    // So the assertion reads the LIVE list and checks the wiring around it.
    // Whichever markets calibration puts there are enforced everywhere; which
    // markets those are belongs to calibration.ts and the sweep, not here.
    for (const symbol of NO_TRADE_SYMBOLS) {
      for (const classification of ["forex", "crypto", "futures"] as const) {
        assert.ok(
          !scannableSymbolsFor(classification).includes(symbol),
          `${symbol} is withheld but reachable on ${classification}`,
        );
      }
      assert.ok(!scannableSymbolsFor(null).includes(symbol), symbol);
    }
  });

  it("keeps every market it does NOT withhold reachable on at least one account type", () => {
    // The other direction, and the one that would have caught 49 markets sitting
    // analyzed-but-invisible for a day: a market Levelflow serves and does not
    // withhold must be reachable somewhere, or it is neither in nor out.
    const reachable = new Set([
      ...scannableSymbolsFor("forex"),
      ...scannableSymbolsFor("crypto"),
      ...scannableSymbolsFor("futures"),
    ]);
    for (const symbol of AVAILABLE_ASSET_SYMBOLS) {
      // A contract-size variant is never itself a scan slot on ANY account
      // type (owner ruling 2026-08-05, contractVariants.ts) — scannableSymbolsFor
      // filters it out unconditionally, on a ground that has nothing to do with
      // being withheld or display-excluded. Without this exemption, MGCUSD/
      // MES/MNQ/MYM/QM/QG/XC/XK/FDXM read as "reachable nowhere" and false-positive
      // this test.
      if (
        NO_TRADE_SYMBOLS.has(symbol) ||
        isDisplayExcluded(symbol) ||
        isContractSizeVariant(symbol)
      ) continue;
      assert.ok(reachable.has(symbol), `${symbol} is served, not withheld, and reachable nowhere`);
    }
  });

  it("the seven no-FMP-source futures orphans never appear — they carry no Levelflow symbol to appear as", () => {
    const orphanBrokerNames = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "excluded-no-fmp-source")
      .map((entry) => entry.brokerName);
    // Was twelve until 2026-08-05, when FDAX/FDXM/FESX/NKD/EMD were matched to
    // owner-accepted cash-index proxies. They are still absent from every
    // account type's resolved set — being mapped is not being onboarded — but
    // they are no longer counted here.
    assert.equal(orphanBrokerNames.length, 7);
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

  it("still includes every served-but-not-scannable row — these carry an FMP mate and are matched, whatever their scannable-today status", () => {
    const notScannable = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "served-but-not-scannable")
      // A contract-size variant is the one not-scannable row that is also
      // deliberately UNSWEPT: it is the same market as its parent, so sweeping
      // it would duplicate that market's setups in the corpus rather than add
      // anything. Every other withheld row has its own series and is swept.
      .filter((entry) => entry.levelflowSymbol !== null &&
        !isContractSizeVariant(entry.levelflowSymbol))
      .map((entry) => entry.levelflowSymbol);
    // 9 -> 28 on 2026-08-05, then 4 on 2026-08-06 (round 28): the nineteen
    // onboarded futures plus the 25 crypto mates once again joined this
    // status pending their sweep, and the sweep itself released 49 of those
    // rows straight to served-and-visible. What is left is DYDXUSD, ASX,
    // ZFUSD and ZTUSD — every one must still stay in the sweep universe, the
    // same property as before, just over a smaller set.
    assert.equal(notScannable.length, 4);
    const swept = new Set(sweepUniverse().map((entry) => entry.levelflowSymbol));
    for (const symbol of notScannable) {
      assert.ok(swept.has(symbol), `${symbol} must stay in the sweep universe`);
    }
  });

  it("excludes only the seven rows with no FMP mate at all — nothing the new exclusion register names", () => {
    const sweptCount = sweepUniverse().length;
    const noFmpCount = MASTER_LIST_ROWS.filter((entry) => entry.fmpSymbol === null).length;
    assert.equal(noFmpCount, 7);
    // Two reasons a row leaves the sweep, and only two: no series to sweep, or
    // it IS another row's market at a different contract size.
    const variantCount = MASTER_LIST_ROWS.filter((entry) =>
      entry.levelflowSymbol !== null && isContractSizeVariant(entry.levelflowSymbol)
    ).length;
    assert.equal(variantCount, 9);
    assert.equal(sweptCount, MASTER_LIST_ROWS.length - noFmpCount - variantCount);
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
