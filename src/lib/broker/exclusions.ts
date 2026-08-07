import type { BrokerClassification } from "../profile";

// Amendment 24 (§19 retrofit, Task 19, owner 2026-08-05, distilled): the
// scannable offering for the account a user is trading equals exactly the
// markets E8 makes visible and tradable on that account TYPE — nothing that
// is not visible for that type. Two exceptions only: markets with genuinely
// no FMP counterpart (amendment 20, handled upstream — masterList.ts's
// scannableSymbolsFor drops any row whose fmpSymbol is null before this
// register is ever consulted), and owner-decided exclusions grounded in
// data drift or poor replay-sweep performance — this file. Inclusion and
// exclusion are decided per E8 account type because E8 treats forex,
// crypto, and futures as distinct products: the SAME market may be
// included on one account type and excluded on another. Every confirmed
// match stays a candidate for inclusion AND exclusion at every sweep — the
// reentry rule below, not a note left only in prose.
//
// This is the gap the retrofit closes. Before this file, exactly one
// mechanism could express a symbol-level exclusion at all
// (offsets.ts's DISPLAY_EXCLUDED_SYMBOLS / isDisplayExcluded), and it
// applied UNCONDITIONALLY — "regardless of account" was its own header
// comment's word for it. A per-account-type symbol exclusion was
// inexpressible. This register is that missing axis: each entry names a
// market, the account type(s) it is withheld on, and why — nothing more.
//
// A guarded data module, the same discipline offsets.ts and instruments.ts
// already follow for this reason: a fact this load-bearing belongs in code
// review and in CI, not in a table an app update can edit unseen. Literal-
// value pins live in tests/brokerMasterList.test.ts (§19f discipline).
//
// Deliberately NOT the same list as offsets.ts's DISPLAY_EXCLUDED_SYMBOLS,
// even though BRENT appears in both today. The two answer different
// questions for different features: offsets.ts's isDisplayExcluded is
// classification-agnostic ON PURPOSE (AdvisorWorkspace.tsx's own comment)
// — it gates whether a STORED setup's reopen affordance shows, a record-
// integrity question with no active-account input at all. This register
// gates whether a market is scannable on the account being traded RIGHT
// NOW — masterList.ts's scannableSymbolsFor is its only reader. BRENT's
// presence in both is two independently-grounded facts that happen to
// agree (E8's BRENT quote diverges from FMP's the same way regardless of
// which account views it), not one fact awkwardly split across two files —
// tests/brokerMasterList.test.ts's cross-consistency check pins that they
// keep agreeing rather than assuming it.
export type BrokerVisibilityExclusionGround =
  | "no-fmp-source"
  | "data-drift"
  | "sweep-performance";

export type BrokerVisibilityExclusion = {
  /** masterList.ts's join key — Levelflow's own symbol, never the FMP
   * symbol (masterList.ts's own field carries the same rule, for the same
   * crossmap reason: WTI/BRENT already share one FMP symbol each with a
   * Futures-classified row). */
  levelflowSymbol: string;
  /** Which E8 account classification(s) this market is withheld on. Never
   * empty — an entry naming zero account types would not be an exclusion. */
  accountTypes: readonly BrokerClassification[];
  /** "no-fmp-source" is carried in this union for the same completeness
   * masterList.ts's own MasterListStatus keeps its `excluded-no-fmp-source`
   * state for, but no entry below uses it today: a served row (this
   * register's only domain — see masterList.ts's scannableSymbolsFor)
   * always carries an fmpSymbol by construction, so that subtraction is
   * handled directly against the row, upstream of this register entirely.
   * The value stays available for a future case this module cannot yet
   * see — e.g. a served row whose FMP source is later found to serve one
   * account type's product but not another's. */
  ground: BrokerVisibilityExclusionGround;
  /** Free-text citation and reasoning — the WHY behind accountTypes/ground,
   * same discipline masterList.ts's own `ground` field follows. */
  detail: string;
  /**
   * REQUIRED for `sweep-performance`, and forbidden otherwise: proof the market
   * was not STARVED when its performance was judged.
   *
   * Amendment 25 (owner, 2026-08-06) exists because one failure repeated five
   * times in a single night, each time as a market that looked edgeless and
   * turned out to be constrained by our own parameters:
   *   oil        — an energies TP1 share twice every healthy class's value
   *   indices    — an ATR cap clipping structural stops; the class-level
   *                negative was a profitable structural subset averaged with a
   *                badly negative cap-clipped one
   *   copper/gas — an absolute cost floor exceeding their entire risk distance,
   *                so 0 of 2304 and 0 of 1689 setups could clear reward:risk
   *   oats/rice  — a runner ceiling too tight to reach; rice's "-0.200" was
   *                SEVEN setups, and at a reachable ceiling it produces 71,
   *                its stop rate falls 33% -> 11%, and it turns positive
   *   livestock  — diagnosed as too thinly traded to calibrate, when in fact
   *                the ladder refused 396 of 416 decisions that reached it
   *
   * A verdict drawn on a starved market is a verdict about our configuration,
   * not about the market. So an exclusion on performance grounds must carry the
   * evidence that the market had a fair chance to produce evidence:
   *
   *   `survivalRate` — the share of decisions REACHING the geometry stage that
   *     survived it (1 - (planRejected + belowPayoff) / reached), from
   *     scripts/starvation-audit.ts. Below 0.33 the geometry, not the market, is
   *     deciding how much evidence exists, and the exclusion is refused.
   *   `filledSetups` — the sample the expectancy was computed over. Rice's seven
   *     is the cautionary number.
   *
   * tests/brokerExclusions.test.ts enforces both, so a performance exclusion
   * cannot be added without them. The rule is broker-agnostic by construction:
   * it constrains this register, and every broker's exclusions land here.
   */
  starvationCheck?: {
    survivalRate: number;
    filledSetups: number;
    /** Where the two numbers came from — the sweep or audit artifact. */
    source: string;
  };
};

/**
 * The floor a market's geometry-survival rate must clear before its measured
 * performance may be used to exclude it (amendment 25). One in three decisions
 * surviving is already generous: the five markets that fooled us ranged from 5%
 * (feeder cattle) to 27% (rough rice), while the healthy core of the universe
 * runs 73-99%.
 */
export const MIN_SURVIVAL_FOR_PERFORMANCE_EXCLUSION = 0.33;

/** The smallest sample an expectancy verdict may rest on (amendment 25). */
export const MIN_FILLED_FOR_PERFORMANCE_EXCLUSION = 300;

export const BROKER_VISIBILITY_EXCLUSIONS: readonly BrokerVisibilityExclusion[] =
  [
    // Empty since 2026-08-07, and the emptiness is a ruling rather than an
    // oversight.
    //
    // BRENT was its only entry. Amendment 23 had excluded it because E8 quotes
    // ~1.67 (~196bp) above this feed, "past the significance bar for display".
    // Amendment 30 retires that bar: a real match with a measurable offset is
    // shown WITH its basis line — "E8 quotes ~+1.67 above this feed — entry
    // there ~= 85.72" — never hidden. XAGUSD (+0.17) and WTI (+0.24) were
    // already served that way; a larger offset is a reason to state it more
    // plainly, not a reason to hide a market the operator's account offers and
    // the data supports.
    //
    // What this register is still FOR, unchanged: withholding a market on ONE
    // account type while it stays visible on another. That is a real shape —
    // an instrument E8 offers on a futures account and not on a forex one, or
    // a feed that drifts only where a particular account prices it — and the
    // resolver, its per-account-type scoping and its full-replacement contract
    // are all still exercised by tests/brokerVisibility.test.ts's synthetic
    // fixtures. An empty production register is the correct state today, not a
    // retired mechanism.
    //
    // A market with no verifiable data source does NOT belong here. That is
    // masterList.ts's `excluded-no-fmp-source` status: enumerated, dormant,
    // re-probed by verify-fmp-matches.ts each run, and re-admitted the moment a
    // source appears.
  ];

/**
 * The register's own clean, independently-testable predicate — the one
 * masterList.ts's scannableSymbolsFor consumes, rather than reaching into
 * BROKER_VISIBILITY_EXCLUSIONS's shape directly. Takes an injectable list
 * (defaulting to the real register) so the exclusion MECHANISM can be
 * exercised in tests against a synthetic entry without editing production
 * data — tests/brokerMasterList.test.ts's cross-account-type proof.
 */
export function isExcludedForAccountType(
  symbol: string,
  classification: BrokerClassification,
  exclusions: readonly BrokerVisibilityExclusion[] = BROKER_VISIBILITY_EXCLUSIONS,
): boolean {
  return exclusions.some(
    (exclusion) =>
      exclusion.levelflowSymbol === symbol &&
      exclusion.accountTypes.includes(classification),
  );
}

/**
 * Amendment 24's standing reentry rule, restated for this register: no
 * visibility exclusion is permanent, ever. Contrast masterList.ts's own
 * `reentryCandidate` field, which is DERIVED per row because that registry
 * has six possible statuses and only one of them (`served-and-visible`) is
 * exempt. This register has exactly one state — "excluded, on the named
 * account types" — so the equivalent fact has no row-level variation to
 * derive: it is a constant, made queryable rather than left a doc comment's
 * claim. There is deliberately no field on BrokerVisibilityExclusion that
 * could mark one otherwise.
 */
export function isReentryCandidate(_exclusion: BrokerVisibilityExclusion): true {
  return true;
}

/** Every current exclusion, proven reachable as a reentry candidate —
 * trivial by construction (isReentryCandidate never returns false), which
 * is the point: nothing here can be marked permanent even by accident. */
export function reentryCandidates(): readonly BrokerVisibilityExclusion[] {
  return BROKER_VISIBILITY_EXCLUSIONS.filter(isReentryCandidate);
}
