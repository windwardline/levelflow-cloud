// Amendment 23's offset ruling (owner, 2026-08-05,
// docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md). Amendment
// 23 itself recorded three measured E8-vs-FMP bases and proposed a
// significance bar without ruling on it; this module is that bar decided:
// XAGUSD and WTI stay visible with their basis shown alongside the price,
// BRENT is withheld from every user-visible surface. The enumeration of
// grounds for withholding a market is open-ended — a future case may be
// posed and decided on evidence this module does not yet carry — so this
// file records the offset ground specifically, not "the" exclusion list.
//
// Every value here is owner-observed on the broker's live platform, not E8-
// published and not derived: docs/research/e8-feed-verification-2026-08-02.md,
// frames F1 (XAGUSD, 2026-08-02 21:40:18 EDT), F4/F6 (WTI/BRENT,
// 2026-08-02 22:40-22:56 EDT, the Appendix A order tickets), and F10
// (2026-08-04, the divergence set adjudicated instrument by instrument,
// reproducing F1/F4/F6/F7 to the cent). Each basis is E8's price minus this
// app's FMP-sourced feed, in the instrument's own quote units, and held
// stable across every sampling.
//
// A guarded data module, not a database row — the same §19a rule
// instruments.ts follows and for the same reason: a number this load-bearing
// belongs in code review and in CI, not in a table an app update can edit
// unseen. Literal-value pins live in tests/brokerOffsets.test.ts (§19f
// discipline): changing a basis or a display verdict here without editing
// that test's expectation, citing a fresh measurement, is the failure mode
// this file exists to catch.
export type BrokerOffset = {
  /** Levelflow's own symbol (§19a's join key), never the FMP symbol — WTI
   * and BRENT already share one FMP symbol each with a Futures-classified
   * row (crossmap precedent), so an FMP key could not stay unique here
   * either. */
  levelflowSymbol: string;
  /** E8's price minus this app's FMP-sourced feed, in the instrument's own
   * quote units. Positive on every row measured so far — E8 quotes above
   * this feed on all three. */
  basis: number;
  /** Amendment 23 ruling A: a significant offset excludes a market from
   * every user-visible surface without disconnecting its backend match —
   * the row (and its basis) stays recorded for the master list and replay
   * sweeps regardless. `true` withholds the basis line and removes the
   * symbol from the visible universe; `false` keeps both. */
  displayExcluded: boolean;
  /** The F-series frame IDs the basis was measured across (provenance,
   * travels with the value per catalog.ts's own convention). */
  measuredAt: readonly string[];
};

// SYMBOLS: external E8 quote offsets | 2 of 98 vs known
export const BROKER_OFFSETS: readonly BrokerOffset[] = [
  {
    levelflowSymbol: "XAGUSD",
    basis: 0.17,
    displayExcluded: false,
    measuredAt: ["F1", "F7", "F10"],
  },
  {
    levelflowSymbol: "WTI",
    basis: 0.24,
    displayExcluded: false,
    measuredAt: ["F4", "F6", "F10"],
  },
  // BRENT's row left with its market (2026-08-09). The sentence above it
  // used to end "The basis is stable across three frames, which is what
  // makes the line honest" — and the stability premise is what died: the
  // owner's 2026-08-09 frame measured +1.10 where three frames of
  // 2026-08-02..04 measured +1.61/+1.675. A basis that moves half a dollar
  // in a week is a contract-month spread, not a venue offset, so there is
  // no honest number for a line to state and no matched market to state it
  // on (amendment 32; the masterList row carries the full evidence chain).
  //
  // WTI measured +0.10 in the same frame against its recorded +0.24 —
  // identity-safe (inside its own spread) but the CONSTANT deserves a
  // re-measurement pass across several sessions before the printed line
  // moves; flagged in HANDOFF rather than churned off one Sunday frame.
];

/**
 * The visible-universe derivations' displayExcluded marking (§19 retrofit,
 * Task 17d): symbolMap.ts's AVAILABLE_ASSET_* stays the full master list —
 * unfiltered, unchanged, still carrying every recorded row for backend
 * broker-matching and replay-sweep purposes — while broker/visibility.ts's
 * visibleAssetGroups/visibleAssetSymbols (the actual user-facing derivation
 * every scope menu, scan trigger, and chart selector reads through) filters
 * this set out. NOT a deletion anywhere: a row landing here still keeps its
 * FMP mapping and its basis in BROKER_OFFSETS above.
 */
export const DISPLAY_EXCLUDED_SYMBOLS: ReadonlySet<string> = new Set(
  BROKER_OFFSETS.filter((offset) => offset.displayExcluded).map(
    (offset) => offset.levelflowSymbol,
  ),
);

/**
 * The one predicate every "does this symbol reach a user surface" check
 * reuses (fix round 1, 2026-08-05): visibility.ts's own filter, the stored-
 * setup reopen gate (AdvisorWorkspace.tsx), and the Current trades rail /
 * Insights row reopen affordances (CurrentTradesRail.tsx, HistoryPanel.tsx)
 * all call this — never a second, independently-maintained list. A stored
 * row for a display-excluded symbol is still a record and still renders in
 * full; only the route back onto the chart closes.
 */
export function isDisplayExcluded(symbol: string): boolean {
  return DISPLAY_EXCLUDED_SYMBOLS.has(symbol);
}

export function getBrokerOffset(symbol: string): BrokerOffset | null {
  return BROKER_OFFSETS.find((offset) => offset.levelflowSymbol === symbol) ??
    null;
}

/**
 * Whether the setup surface's basis line renders for this symbol (owner
 * ruling item 1): a recorded offset that is not display-excluded. XAGUSD and
 * WTI today; BRENT never (its own offset is recorded but withheld); any
 * symbol with no recorded offset at all (every other market) never.
 */
export function isBasisDisplayed(symbol: string): boolean {
  const offset = getBrokerOffset(symbol);
  return offset !== null && !offset.displayExcluded;
}

/**
 * The ladder's entry restated on E8's own feed — display only. Returns null
 * for a display-excluded symbol (BRENT) and for any symbol with no recorded
 * offset, so a careless caller gets nothing rather than a number that must
 * not be shown. NEVER wire this into a copy payload or a chart level: the
 * offset ruling's own prohibition (tests/advisorRecommendationPanel.test.ts
 * pins both directions).
 */
export function adjustedEntryFor(
  symbol: string,
  entryPrice: number,
): number | null {
  const offset = getBrokerOffset(symbol);
  if (offset === null || offset.displayExcluded) {
    return null;
  }
  return entryPrice + offset.basis;
}
