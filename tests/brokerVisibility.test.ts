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
  // The offering, pinned symbol-for-symbol.
  //
  // These arrays were captured from the pre-retrofit code as a before/after
  // equality proof — the §19 retrofit changed the MECHANISM by which the
  // offering was derived and deliberately did not change the offering itself.
  // That premise is now retired on purpose.
  //
  // Owner ruling 2026-08-07: "If a market exists for an account type on E8, and
  // we have a match for the data on FMP, it needs to be visible and usable on
  // Levelflow when a user is working within that account structure. This is
  // nonnegotiable." The only ground for withholding is no verifiable data
  // source. Measured the same day: every one of the 52 markets that had been
  // withheld has an FMP match, and no roster row lacks a source at all — so the
  // withheld list is empty by derivation.
  //
  // Forex 38 -> 46 and crypto 7 -> 33 are now EXACT matches to what E8 offers
  // on those account types, counted from the owner's own live-account frames.
  // Futures 10 -> 31; its remainder is not withholding but the rule working —
  // the rest of E8's futures roster has no FMP series, probed 2026-08-07, and
  // sits on the dormant excluded list (tests/e8RosterConformance.test.ts).
  //
  // The table stays a literal on purpose. A future change to the visible
  // offering — deliberate or not — must edit it, and that edit is the review's
  // signal to ask whether the change is an owner ruling or an accident.
  const PINNED_FOREX = [
    // 28 FX pairs: the closed 8-currency matrix, C(8,2) = 28, matching E8's own
    // published table symbol for symbol.
    "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "CADCHF", "CADJPY",
    "CHFJPY", "EURAUD", "EURCAD", "EURCHF", "EURGBP", "EURJPY", "EURNZD",
    "EURUSD", "GBPAUD", "GBPCAD", "GBPCHF", "GBPJPY", "GBPNZD", "GBPUSD",
    "NZDCAD", "NZDCHF", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF", "USDJPY",
    // 8 crypto CFDs — a FOREX account carries eight, not the Crypto account's
    // thirty-three. BNBUSD released with the rest.
    "ADAUSD", "BCHUSD", "BNBUSD", "BTCUSD", "ETHUSD", "LTCUSD", "SOLUSD",
    "XRPUSD",
    // 2 metals, 2 energies. BRENT joins WTI under amendment 30: a real match
    // with a measurable offset is shown WITH its basis line, never hidden.
    "XAGUSD", "XAUUSD", "WTI", "BRENT",
    // 6 indices. ASX un-hidden — F2 measured ^AXJO against E8's AUS200 book at
    // -5.7 (0.06%) in Sydney's cash session, the same "TRACKS (cash hours)"
    // verdict NIKKEI and DAX carry, so the hide's own condition was met.
    "ASX", "DAX", "DOW", "NIKKEI", "NSDQ", "SP",
  ].sort();

  const PINNED_CRYPTO = [
    // All 33 E8 offers on a Crypto account, every one FMP-matched with a
    // measured delta (docs/research/e8-crypto-source-resolution-2026-08-05.md).
    // Two carry name traps in the map: ARWUSD reads FMP's ARUSD, and TRUMPUSD
    // reads OTRUMPUSD — FMP's literal TRUMPUSD is a different, moribund coin.
    "AAVEUSD", "ADAUSD", "ALGOUSD", "ARWUSD", "ATOMUSD", "AVAXUSD", "BCHUSD",
    "BNBUSD", "BTCUSD", "CAKEUSD", "DASHUSD", "DOGEUSD", "DOTUSD", "DYDXUSD",
    "EGLDUSD", "ETCUSD", "ETHUSD", "FILUSD", "GRTUSD", "HBARUSD", "IMXUSD",
    "LINKUSD", "LTCUSD", "NEARUSD", "SOLUSD", "THETAUSD", "TRUMPUSD", "TRXUSD",
    "UNIUSD", "XLMUSD", "XMRUSD", "XRPUSD", "XTZUSD",
  ].sort();

  const PINNED_FUTURES = [
    // MGCUSD stays out: micro gold is a contract-size variant of GCUSD, and one
    // analyzed market per underlying per account type is its own owner ruling
    // (contractVariants.ts). It keeps its sizing identity and loses its scan
    // slot — that is not a data-source withholding.
    "BZUSD", "CLUSD", "ESUSD", "GCUSD", "GFUSX",
    "HEUSX", "HGUSD", "HOUSD", "LEUSX", "NGUSD", "NQUSD", "PAUSD",
    "PLUSD", "RBUSD", "RTYUSD", "SIUSD", "YMUSD", "ZBUSD", "ZCUSX", "ZFUSD",
    "ZLUSX", "ZMUSD", "ZNUSD", "ZOUSX", "ZRUSD", "ZSUSX", "ZTUSD",
  ].sort();

  // Crypto is no longer a subset of forex's crypto CFDs, so the union takes all
  // three. Forex and crypto overlap on exactly the eight CFDs above.
  const PINNED_NULL = [
    ...new Set([...PINNED_FOREX, ...PINNED_CRYPTO, ...PINNED_FUTURES]),
  ].sort();

  it("forex: exactly 46 symbols — E8's whole forex offering", () => {
    assert.deepEqual([...visibleAssetSymbols(FOREX_ACCOUNT)].sort(), PINNED_FOREX);
    assert.equal(PINNED_FOREX.length, 46);
  });

  it("crypto: exactly 33 symbols — E8's whole crypto offering", () => {
    assert.deepEqual([...visibleAssetSymbols(CRYPTO_ACCOUNT)].sort(), PINNED_CRYPTO);
    assert.equal(PINNED_CRYPTO.length, 33);
  });

  it("futures: exactly 27 symbols — every futures market with an FMP source", () => {
    // 31 -> 27 (amendment 32, 2026-08-09): EMD, FDAX, FESX and NKD were
    // served on their underlyings' CASH index series, which was never a
    // match. Dormant, not deleted — masterList carries them with the ruling.
    assert.deepEqual([...visibleAssetSymbols(FUTURES_ACCOUNT)].sort(), PINNED_FUTURES);
    assert.equal(PINNED_FUTURES.length, 27);
  });

  it("null (no active account): the union of all three, 98 symbols, pinned", () => {
    // 102 -> 98 with amendment 32's four departures.
    assert.deepEqual([...visibleAssetSymbols(null)].sort(), PINNED_NULL);
    assert.equal(PINNED_NULL.length, 98);
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
          // The same treatment for the forex crypto-CFD correction (owner,
          // 2026-08-06). The retired mechanism hid by asset TYPE, so on a forex
          // account it offered every Crypto-typed row — all 33. That was wrong,
          // and FOREX_ACCOUNT_CRYPTO_CFDS is the correction: a forex account
          // carries eight crypto CFDs, ticketed live on the Pro Forex record.
          //
          // It went unnoticed while NO_TRADE_SYMBOLS withheld 26 of the 33, so
          // both sides answered 7 and agreed by accident. The 2026-08-07
          // release removed that withholding and the accident with it.
          // Applying the correction to both sides keeps this an equality proof
          // about the MECHANISM, which is all it ever claimed.
          .filter((option) =>
            classification !== "forex" ||
            option.assetType !== "Crypto" ||
            FOREX_ACCOUNT_CRYPTO_CFDS.has(option.symbol)
          )
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
    // Proven the other way round since the register emptied. BRENT used to be
    // its only entry, so "a synthetic-only list un-excludes BRENT" was the
    // natural demonstration; amendment 30 released BRENT (a real match with a
    // measurable offset is shown WITH its basis line, never hidden), so there
    // is no production entry left to drop.
    //
    // Replacement is the same contract read from the other end: a synthetic
    // list naming BTCUSD must REMOVE it, which can only happen if the passed
    // list is what the resolver uses rather than something added to a
    // production register that never mentioned BTCUSD.
    const dropsBtc = {
      levelflowSymbol: "BTCUSD",
      accountTypes: ["forex"] as const,
      ground: "data-drift" as const,
      detail: "synthetic fixture — never a production exclusion",
    };
    assert.ok(scannableSymbolsFor("forex").includes("BTCUSD"));
    assert.ok(!scannableSymbolsFor("forex", [dropsBtc]).includes("BTCUSD"));
    // And the production register is genuinely empty, which is what makes the
    // first assertion meaningful rather than incidental.
    assert.equal(BROKER_VISIBILITY_EXCLUSIONS.length, 0);
  });
});

describe("no-FMP-source rows and NOT_SCANNABLE rows never appear in any account type's resolved set", () => {
  it("BNBUSD is served on both account types that offer it — the withholding is gone", () => {
    // Was pinned absent everywhere, "unruled-on by the owner still". It is
    // ruled on now: 2026-08-07, a market E8 offers with an FMP match is visible
    // and usable, and BNBUSD is matched (-13.1 bp, measured on the live crypto
    // book). It was withheld on a calibration finding, which amendment 30's
    // three states no longer admit as a ground.
    assert.ok(scannableSymbolsFor("forex").includes("BNBUSD"));
    assert.ok(scannableSymbolsFor("crypto").includes("BNBUSD"));
    assert.ok(scannableSymbolsFor(null).includes("BNBUSD"));
    // Futures is a different offering, not a withholding: a Crypto-classified
    // CFD is not on a Tradovate futures account at all.
    assert.ok(!scannableSymbolsFor("futures").includes("BNBUSD"));
  });

  it("the twenty no-FMP-source rows never appear — they carry no Levelflow symbol to appear as", () => {
    const orphanBrokerNames = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "excluded-no-fmp-source")
      .map((entry) => entry.brokerName);
    // 7 -> 20 (amendment 32, 2026-08-09): the original seven, plus the five
    // index futures whose cash-proxy matches the ruling unwound, plus the
    // eight CME currency futures whose spot mates were proxies all along.
    assert.equal(orphanBrokerNames.length, 20);
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
    // 53 -> 9 on 2026-08-07. The release emptied NO_TRADE_SYMBOLS, so every
    // market withheld on a calibration finding became served-and-visible and
    // left this population. What remains is the rows withheld for reasons the
    // release does not touch — a contract-size variant is one market at two
    // notionals, not a market with no source.
    //
    // The invariant is unchanged and is the point: whatever sits here still
    // has an FMP mate and must stay in the sweep universe, because being
    // withheld from the scan is not being absent from the corpus.
    // Zero after the contract-variant filter. All nine rows still carrying this
    // status ARE contract-size variants — one market at two notionals, which is
    // the one not-scannable ground the release does not touch and the one row
    // deliberately left unswept, since sweeping it would duplicate its parent's
    // setups in the corpus rather than add anything.
    //
    // So the loop below is vacuous today. Kept, because the invariant is what
    // matters and it is the one this whole describe exists for: anything
    // withheld from the scan for a reason OTHER than being a variant still has
    // an FMP mate and must stay in the sweep universe. Being invisible to the
    // operator is not being absent from the corpus.
    assert.equal(notScannable.length, 0);
    const swept = new Set(sweepUniverse().map((entry) => entry.levelflowSymbol));
    for (const symbol of notScannable) {
      assert.ok(swept.has(symbol), `${symbol} must stay in the sweep universe`);
    }
  });

  it("excludes only the twenty no-FMP rows and the eight variants — nothing else", () => {
    const sweptCount = sweepUniverse().length;
    const noFmpCount = MASTER_LIST_ROWS.filter((entry) => entry.fmpSymbol === null).length;
    // 7 -> 20 (amendment 32): the dormant families joined the null-mate set.
    assert.equal(noFmpCount, 20);
    // Two reasons a row leaves the sweep, and only two: no series to sweep, or
    // it IS another row's market at a different contract size. 9 -> 8:
    // FDXM's variant slot left with its parent.
    const variantCount = MASTER_LIST_ROWS.filter((entry) =>
      entry.levelflowSymbol !== null && isContractSizeVariant(entry.levelflowSymbol)
    ).length;
    assert.equal(variantCount, 8);
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
    // Zero since amendment 30. BRENT was the only one, and a real match with a
    // measurable offset is now shown WITH its basis line rather than hidden —
    // so the cross-consistency this test asserts holds vacuously today.
    //
    // Kept rather than deleted, because the mechanism is what matters: if a row
    // ever earns this status again, it must be excluded on every account type
    // that would otherwise reach it, and this is what says so.
    assert.equal(displayExcludedRows.length, 0);
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

  it("HistoryPanel.tsx resolves nothing — Insights is exempt (amendment 29)", () => {
    // This used to require the resolver import, on the reasoning that every
    // user surface must reach the offering through one place rather than a
    // competing table. Correct for surfaces that GENERATE; wrong for Insights,
    // which produces no price and is the record of every account the operator
    // holds (amendment 29, owner 2026-08-07).
    //
    // The requirement inverts rather than relaxes: Insights must consult NO
    // account resolver, so there is nothing to compete with. A competing table
    // is still barred, and now so is the resolver itself.
    const source = readFileSync("src/components/workspace/HistoryPanel.tsx", "utf8");
    assert.doesNotMatch(source, /from "\.\.\/\.\.\/lib\/broker\/visibility"/);
    assert.doesNotMatch(source, /HIDDEN_ASSET_TYPES_BY_CLASSIFICATION/);
    assert.doesNotMatch(source, /OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE/);
    assert.doesNotMatch(source, /AVAILABLE_ASSET_GROUPS/);
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
