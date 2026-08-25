import type { BrokerAccount, BrokerClassification } from "../profile";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_OPTIONS,
  type SecurityGroup,
  type SecurityType,
} from "../symbolMap";
import { isContractSizeVariant } from "./contractVariants";
import {
  BROKER_VISIBILITY_EXCLUSIONS,
  isExcludedForAccountType,
  type BrokerVisibilityExclusion,
} from "./exclusions";

// Amendment 13. E8 Forex accounts cannot trade futures, so futures markets are
// removed from user view and from scanner action and results whenever an E8
// Forex account is active. NOTHING IS DELETED behind that curtain (owner,
// explicit): futures calibration, replay-sweep artifacts, and learned state are
// all retained, and futures series may continue to serve as internal derivation
// sources — WTI reads CLUSD and BRENT reads BZUSD exactly as before.
//
// Energies (WTI, BRENT) remain on Forex accounts: the owner's own tickets
// priced both on the live Pro Forex account
// (docs/research/e8-observations-2026-08-02.md, batches 1-2).
//
// The account governs the menu; the edge record governs setups.
//
// Amendment 24 (§19 retrofit, Task 19, owner 2026-08-05): this file replaces
// the old pairing of a SecurityType-keyed HIDDEN_ASSET_TYPES_BY_CLASSIFICATION
// table (applied directly to symbolMap's raw AVAILABLE_ASSET_GROUPS) plus
// offsets.ts's `isDisplayExcluded` check applied UNCONDITIONALLY, regardless
// of account. That old pairing is retired here — not merely superseded
// alongside it — because it could not express what the owner's end-state
// spec requires: a market excluded on ONE E8 account type while staying
// visible on another. The classification table was account-scoped but only
// at the coarse SecurityType level; the display-exclusion check was
// symbol-level but global. Neither alone, nor the two composed, could name
// "excluded on forex, present on crypto."
//
// scannableSymbolsFor below is THE single resolver every user surface
// (AdvisorWorkspace.tsx's scope menu and chart/security selection,
// marketScanFilters.ts's scan universe, HistoryPanel.tsx's Insights market
// filter) reaches through visibleAssetGroups/visibleAssetSymbols — same
// signatures as before this task, so every call site is untouched. It
// computes: which of E8's account-classification products this account
// type's own product bundles together (OFFERED_CLASSIFICATIONS_BY_ACCOUNT_
// TYPE, the registry's own classification vocabulary — masterList.ts's
// `classification` field's own concept — replacing the old SecurityType
// table with the SAME account-type boundaries, proven identical
// symbol-for-symbol by tests/brokerVisibility.test.ts's before/after
// equality pins), minus owner exclusions scoped to that account type
// (exclusions.ts's BROKER_VISIBILITY_EXCLUSIONS, or an injected list for
// testing the mechanism itself against a synthetic fixture row).
//
// Deliberately built on symbolMap.ts's AVAILABLE_ASSET_OPTIONS (the
// already-served master list) rather than on masterList.ts's full 98-row
// registry, even though the registry is this task's own conceptual anchor
// and this file is intentionally kept in step with its vocabulary
// (classificationOfType below mirrors masterList.ts's own private
// function, one-for-one). The registry's ~50 additional rows — the
// unonboarded crypto mates, the no-FMP-source futures orphans, the two
// backend-only unsizeable futures instruments — can never have a Levelflow
// symbol to appear as here regardless (masterList.ts's own row-shape
// invariant: a row's levelflowSymbol is null unless it is already served),
// so importing the registry itself for the "minus no-FMP-source rows" step
// would buy nothing at runtime and cost real, measured bytes: masterList.ts
// is documented and load-bearing as a module NEVER imported from
// src/components (see its own header) — its ~500 lines of per-row ground
// and source-citation prose are deliberately excluded from dist/assets.
// This file's first draft imported masterList.ts directly for
// "registry-derived truth" and was caught, by inspecting the built bundle,
// pulling that entire registry — status strings, research-doc citations,
// and all — into the client JS. AVAILABLE_ASSET_OPTIONS's own `fmpSymbol`
// field is typed as a non-nullable string, so "minus no-FMP-source rows"
// is vacuous here BY THE TYPE SYSTEM, not merely by today's data — the one
// case where a formula step is satisfied by construction rather than by a
// runtime check, and worth stating rather than writing dead code to prove.
//
// offsets.ts's own isDisplayExcluded/DISPLAY_EXCLUDED_SYMBOLS stay exactly
// as they were, unedited by this task, for their OTHER, deliberately
// account-agnostic job: the stored-setup reopen gate
// (AdvisorWorkspace.tsx's canReopenStoredSetup, CurrentTradesRail.tsx,
// HistoryPanel.tsx's reopen affordance), which amendment 23's fix round 1
// documented as never an account-scoped question — reopening a past
// record is not "is this scannable on the account I am trading right now,"
// which is this file's only concern. Two independently-justified
// predicates answering two different questions, not two competing sources
// for the same one.
//
// AVAILABLE_ASSET_GROUPS (symbolMap.ts) stays the unfiltered master-50
// backend broker-matching and replay sweeps read, untouched by this filter.

/**
 * Mirrors masterList.ts's own private `classificationOfType` one-for-one —
 * duplicated rather than imported so this file never depends on
 * masterList.ts (see the header comment above). Six lines, pure, and the
 * registry's own row-classification concept: which E8 account
 * classification a symbolMap.ts SecurityType belongs to.
 */
function classificationOfType(assetType: SecurityType): BrokerClassification {
  switch (assetType) {
    case "Crypto":
      return "crypto";
    case "Futures":
      return "futures";
    default:
      return "forex";
  }
}

/**
 * Registry-derived replacement for the retired HIDDEN_ASSET_TYPES_BY_
 * CLASSIFICATION: which of the registry's own classification groups
 * (masterList.ts's per-row `classification` concept, restated here via
 * classificationOfType above rather than a raw SecurityType) does a given
 * account TYPE's E8 product bundle together for trading purposes. The
 * underlying platform fact is unchanged from before this task: E8's Crypto
 * and Futures account types are exclusive (each shows only its own
 * classification's rows); its Forex/CFD account type additionally carries
 * every Crypto-classified row — amendment 13's own account of Energies
 * staying on Forex accounts, and amendment 19 clause 3's ruling that "the
 * crypto markets a Forex account carries are confirmed part of that
 * account's offering." tests/brokerVisibility.test.ts's before/after
 * equality pins prove this reproduces, symbol for symbol, exactly what the
 * old table produced for all three account types.
 */
export const OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE: Record<
  BrokerClassification,
  readonly BrokerClassification[]
> = {
  forex: ["forex", "crypto"],
  crypto: ["crypto"],
  futures: ["futures"],
};

/**
 * The crypto CFDs an E8 FOREX-line account actually offers — eight, not the
 * Crypto account's thirty-three.
 *
 * CORRECTED 2026-08-06 against the screenshots, per the owner's standing
 * instruction to confirm each account type's tradable markets from the live
 * record rather than from inference. Amendment 19 clause 3 had been read as
 * "a Forex account carries every crypto-classified market", and the table
 * above still expresses that coarsely by classification. It is wrong at that
 * granularity: the Pro Forex record
 * (docs/research/e8-observations-2026-08-02.md) tickets exactly these eight,
 * each with E8's `.C` CFD suffix, and totals the account itself — "+ 8 crypto
 * = 46 instruments — the complete CFD universe".
 *
 * The error was latent rather than visible, which is why it survived: only
 * these eight crypto rows are onboarded today, so "all crypto" and "these
 * eight" coincide. Onboarding the Crypto account's other twenty-five — which
 * the standing order requires — would have silently put all of them on Forex
 * accounts that cannot trade them.
 *
 * Stated as an explicit symbol list because that is what the evidence is. A
 * classification-level rule cannot express "some of this classification", and
 * guessing which crypto a CFD desk carries is precisely the inference this
 * replaces.
 */
// SYMBOLS: external E8 forex-account crypto CFDs | 8 of 33 vs crypto
export const FOREX_ACCOUNT_CRYPTO_CFDS: ReadonlySet<string> = new Set([
  "ADAUSD",
  "BCHUSD",
  "BNBUSD",
  "BTCUSD",
  "ETHUSD",
  "LTCUSD",
  "SOLUSD",
  "XRPUSD",
]);

const ALL_CLASSIFICATIONS: readonly BrokerClassification[] = [
  "forex",
  "crypto",
  "futures",
];

/**
 * The inverse of OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE: given a market's
 * registry classification, which E8 ACCOUNT TYPES actually offer it.
 *
 * The two directions answer different questions and only one of them is the
 * offering. `classification` is a single value by design — masterList.ts's own
 * JSDoc calls it where an instrument's offering EVIDENCE came from — so reading
 * it as "the account type this market belongs to" quietly understates reality.
 * Amendment 19 clause 3 rules that a Forex account carries every
 * crypto-classified market, which makes all 33 crypto rows dual-listed: offered
 * on Crypto AND Forex. BNBUSD is simply where that first became visible (the
 * owner's own order ticket priced it on the live Pro Forex account,
 * docs/research/e8-observations-2026-08-02.md), but it was never a fact about
 * BNB.
 *
 * Derived rather than stored, so a single classification can never drift from
 * the bundling rule beside it — and so amendment 24's per-account-type verdicts
 * have an honest domain to range over: a market offered on two account types
 * can be included on one and excluded on the other, which is exactly what
 * exclusions.ts's `accountTypes` scoping expresses.
 */
export function accountTypesOffering(
  classification: BrokerClassification,
): BrokerClassification[] {
  return ALL_CLASSIFICATIONS.filter((accountType) =>
    OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE[accountType].includes(classification)
  );
}

/**
 * THE resolver (§19 retrofit, Task 19 / amendment 24): the single place
 * that answers "what is scannable for this account classification" — the
 * registry's offering for that account type, minus no-FMP-source rows
 * (vacuous here by AVAILABLE_ASSET_OPTIONS's own non-nullable fmpSymbol
 * type — see this file's header), minus owner exclusions scoped to that
 * account type (exclusions.ts's BROKER_VISIBILITY_EXCLUSIONS, or an
 * injected list — the `exclusions` parameter exists so the MECHANISM
 * itself can be proven against a synthetic fixture row without editing
 * production data; tests/brokerVisibility.test.ts's cross-account-type
 * proof is the reason this is a parameter and not a closed-over constant).
 *
 * `classification: null` resolves the union across all three account
 * types — "could this ever be seen, on SOME account" — computed as a
 * genuine union of the three per-classification resolutions, not merely
 * the forex pool (the largest today, but not guaranteed to stay a
 * superset once an exclusion can differ per account type for the same
 * symbol). This is visibleAssetSymbols(null)'s own implementation, below.
 */
export function scannableSymbolsFor(
  classification: BrokerClassification | null,
  exclusions: readonly BrokerVisibilityExclusion[] = BROKER_VISIBILITY_EXCLUSIONS,
): string[] {
  if (classification === null) {
    const union = new Set<string>();
    for (const single of ALL_CLASSIFICATIONS) {
      for (const symbol of scannableSymbolsFor(single, exclusions)) {
        union.add(symbol);
      }
    }
    return [...union];
  }

  const offered = new Set(OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE[classification]);

  return AVAILABLE_ASSET_OPTIONS
    .filter((option) =>
      offered.has(classificationOfType(option.assetType)) &&
      // One analyzed market per underlying, per account type (owner ruling
      // 2026-08-05). A contract-size variant sizes against its parent in the
      // §19 layer and never takes a scan slot of its own — two rows for one
      // gold opportunity would double-count it in the ranking and in the
      // money-positive record. See contractVariants.ts for why this is
      // declared rather than detected.
      !isContractSizeVariant(option.symbol) &&
      // A Forex-line account carries only the eight crypto CFDs its own
      // screenshots ticket, never the Crypto account's full thirty-three.
      // Without this, onboarding the Crypto account's remaining mates would
      // put every one of them on Forex accounts that cannot trade them.
      (classification !== "forex" ||
        classificationOfType(option.assetType) !== "crypto" ||
        FOREX_ACCOUNT_CRYPTO_CFDS.has(option.symbol)) &&
      !isExcludedForAccountType(option.symbol, classification, exclusions)
    )
    .map((option) => option.symbol);
}

export function visibleAssetGroups(account: BrokerAccount | null): SecurityGroup[] {
  const scannable = new Set(scannableSymbolsFor(account?.classification ?? null));
  return AVAILABLE_ASSET_GROUPS
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => scannable.has(option.symbol)),
    }))
    .filter((group) => group.options.length > 0);
}

export function visibleAssetSymbols(account: BrokerAccount | null): string[] {
  return visibleAssetGroups(account).flatMap((group) =>
    group.options.map((option) => option.symbol),
  );
}
