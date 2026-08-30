import { confidenceThresholdForAssetOrSymbol } from "../../lib/advisorReview";
import {
  CONFIDENCE_TIERS,
  formatConfidenceWithTier,
  resolveConfidenceTier,
} from "../../lib/confidenceTiers";
import {
  classifyWinLoss,
  normalizeSetupOutcome,
  type SetupOutcome,
} from "../../lib/outcomes";
import {
  compareAssetSymbols,
  getSecurityOption,
  SECURITY_GROUPS,
  type SecurityGroup,
  type SecurityType,
} from "../../lib/symbolMap";
import { deriveTradeState, entryHasFilled } from "../../lib/tradeState";
import type {
  LifetimeSetupRow,
  OutcomeEvidenceRow,
  TradeSetupRow,
} from "../../lib/tradeAnalyzer";
import { formatNumber } from "./advisorFormat";
import { ATTRIBUTION_LEARNING_MIN_RESOLVED } from "./attribution";
import type { ScanScope } from "./ScopeMenu";

/**
 * What the two history surfaces say when the fetch that feeds them failed
 * (Q2-C2). One constant, because Insights and the Current trades rail read one
 * request: a failure is one fact about one fetch, so it reads the same on both.
 *
 * The register is the scan rail's, already set by MarketScanPanel's "Market scan
 * could not complete. Try again shortly." — name what did not happen, say what to
 * do, stop. The reader never sees the provider's own words: a PostgREST timeout,
 * an RLS denial and a dropped connection are one fact to someone looking at their
 * trades, and the detail goes to the console for whoever is debugging it (§17f).
 */
export const HISTORY_LOAD_FAILED_COPY =
  "Trade history could not load. Try again shortly.";

export type HistorySetupGroup = {
  items: TradeSetupRow[];
  key: string;
  label: string;
};

/**
 * The durable sort law, as one comparator: the strongest setup first, ties
 * settled by the universal base/quote symbol comparator.
 *
 * Spec §4: "Menus are alphabetical for finding; results are sorted by confidence
 * for deciding — that is the only sorting deviation." Two result surfaces obey
 * it, so it is written once:
 *
 * - the Insights ledger, where it is the tie-break chain UNDER the day key —
 *   a scan batch shares one created_at second, and before this chain existed
 *   those rows rendered in whatever order the fetch happened to deliver
 *   (owner-observed, 2026-08-01);
 * - the Current trades rail, where it is the PRIMARY order inside each state
 *   group — the rail rendered fetch order until the owner's 2026-08-02 finding.
 *
 * One function, not a mirror: the rail already imports from this module, so
 * there is no layering boundary that would force a second copy (the sanctioned
 * mirror in this repo, src/lib/scanBatching.ts against the analyzer's own
 * scanRanking.ts, exists because a browser module cannot import a Deno one —
 * and it is pinned byte-for-byte in tests/scanBatching.test.ts for exactly that
 * reason).
 *
 * `confidence_score` arrives from PostgREST as a numeric string, hence the
 * coercion. A non-numeric score yields NaN, which is falsy, so such a row falls
 * through to the symbol tier rather than poisoning the sort — the behavior the
 * ledger has always had.
 */
export function compareSetupsByConfidence(
  first: TradeSetupRow,
  second: TradeSetupRow,
) {
  return Number(second.confidence_score) - Number(first.confidence_score) ||
    compareAssetSymbols(first.symbol, second.symbol);
}

/**
 * The ledger's one ordering: newest first, then the tie-break tiers.
 *
 * Q1-#20 removed the mode parameter. Only buildInsightsGroups calls this, always
 * with "newest", so the oldest / confidence / asset branches were reachable from
 * their own tests and nowhere else — the Insights sort control they were written
 * for does not exist, and §10's ledger is chronological.
 */
export function sortHistorySetups(setups: TradeSetupRow[]) {
  return [...setups].sort((first, second) => {
    const firstDate = new Date(first.created_at).getTime();
    const secondDate = new Date(second.created_at).getTime();

    return secondDate - firstDate || compareSetupsByConfidence(first, second);
  });
}

/**
 * Day groups, in the order the rows already arrive in (spec §10's ledger).
 *
 * Q1-#20 removed the mode parameter here too, and with it the asset / category /
 * status groupings, HISTORY_STATUS_ORDER and getOutcomeLabel: the same one caller
 * always asked for "date". No re-sort of the groups is needed — the rows come in
 * newest-first from sortHistorySetups, so first appearance IS the group order.
 */
export function groupHistorySetups(
  setups: TradeSetupRow[],
): HistorySetupGroup[] {
  const groups = new Map<string, HistorySetupGroup>();

  setups.forEach((setup) => {
    const key = formatHistoryDateGroup(new Date(setup.created_at));
    const existingGroup = groups.get(key);
    if (existingGroup) {
      existingGroup.items.push(setup);
      return;
    }
    groups.set(key, { items: [setup], key, label: key });
  });

  return Array.from(groups.values());
}

// The one lookup path from a symbol to its class's qualifying bar: the class
// from the same symbol→class mapping every surface reads (getSecurityOption,
// Forex-shaped fallback for unknown tickers included), the bar from the
// calibration mirror tests/core.test.ts pins against the engine's own values.
// formatSetupConfidence, buildConfidenceBands and Attribution's confidence
// tally all resolve through here, so the word printed beside a row's score
// and the band it counts under can never read different bars.
export function confidenceThresholdForSymbol(symbol: string): number {
  // Symbol-first, because the engine's calibration class is no longer implied by
  // the display SecurityType: agriculture and livestock both display as Futures
  // and carry a floor of 30 against futures' 68 (advisorReview.ts).
  return confidenceThresholdForAssetOrSymbol(
    symbol,
    getSecurityOption(symbol).assetType,
  );
}

/**
 * The confidence aggregate behind §18 Attribution's confidence slice —
 * threshold-aware, row by row, through the same resolveConfidenceTier rule
 * the ledger's confidence column prints with (§18's parked "confidence
 * 40-65 band gap" observation, closed 2026-08-03).
 *
 * Membership: a score inside a fixed tier keeps that tier; a score below
 * the fixed 66 floor that cleared its own class's qualifying bar has earned
 * Qualified (Forex qualifies at 40, so its whole 40-65 range used to vanish
 * from this aggregate while the ledger printed "Qualified" beside every one
 * of those rows); Strong and Best stay absolute. Resolution rounds exactly
 * as the formatter rounds — the old raw min/max comparison also dropped any
 * fractional score in the seams between bands (74.6 printed "Strong 75%"
 * and counted nowhere).
 *
 * A row that cleared no bar — legacy/historical only, the engine refuses
 * generation below the bar — lands in no band and is returned as
 * `unbanded` rather than being silently dropped: sum of every band's count
 * plus `unbanded` equals the rows given, on any input (the exhaustiveness
 * invariant, pinned in tests/core.test.ts). Deliberately unrendered, by
 * owner ruling (2026-08-03, recorded in §18's As-built note): the launch
 * slate-clean plus the engine's below-bar refusal make this population
 * structurally zero on every real account, so there is nothing a sentence
 * could honestly announce. The counter exists so the arithmetic is
 * checkable — and so a future calibration raise that strands resolved rows
 * below a new bar reopens the rendering question with real rows on screen.
 *
 * The rows carry no `range`: Qualified's lower edge is each class's own
 * bar now, so a single stated range stopped being one truth, and a field
 * with no reader is not carried as data (CONFIDENCE_TIERS' own min/max
 * stay the raw bounds of record). Each row carries its tier `id` instead —
 * the join key buildAttribution's confidence slice reads.
 */
export function buildConfidenceBands(setups: LifetimeSetupRow[]) {
  const bands = CONFIDENCE_TIERS.map((tier) => ({
    ambiguous: 0,
    count: 0,
    id: tier.id,
    label: tier.label,
    losses: 0,
    wins: 0,
  }));
  let unbanded = 0;

  for (const setup of setups) {
    const tier = resolveConfidenceTier(
      setup.confidence_score,
      confidenceThresholdForSymbol(setup.symbol),
    );
    const band = tier
      ? bands.find((candidate) => candidate.id === tier.id)
      : undefined;
    if (!band) {
      unbanded += 1;
      continue;
    }
    const outcome = getSetupOutcome(setup);
    const winLoss = classifyWinLoss(outcome);
    band.count += 1;
    if (winLoss === "win") {
      band.wins += 1;
    } else if (winLoss === "loss") {
      band.losses += 1;
    } else if (outcome === "unclear_path") {
      band.ambiguous += 1;
    }
  }

  return {
    bands: bands.map((band) => {
      const resolved = band.wins + band.losses;
      return {
        ambiguous: band.ambiguous,
        count: band.count,
        id: band.id,
        label: band.label,
        resolved,
        winRate: resolved > 0
          ? Math.round((band.wins / resolved) * 100)
          : null,
      };
    }),
    unbanded,
  };
}

// Takes only the fields normalizeSetupOutcome reads (OutcomeEvidenceRow), so the
// lifetime record's narrower row reaches the one outcome taxonomy without a second
// copy of the predicate — the convention entryHasFilled already follows.
export function getSetupOutcome(setup: OutcomeEvidenceRow): SetupOutcome {
  return normalizeSetupOutcome(setup);
}

export function getOutcomeClassName(outcome: SetupOutcome) {
  // classifyWinLoss (lib/outcomes.ts) is the single source of truth for the
  // win/loss split (fix round 2 — this was a fourth independent copy of the
  // same predicates). The caution/muted split below is genuinely this
  // function's own concern, not part of classifyWinLoss's job, so it stays
  // as its own outcome check.
  const winLoss = classifyWinLoss(outcome);
  if (winLoss === "win") {
    return "text-buy";
  }
  if (winLoss === "loss") {
    return "text-sell";
  }
  if (outcome === "entry_not_filled") {
    return "text-caution";
  }
  if (outcome === "unclear_path") {
    return "text-ink-muted";
  }
  return "text-ink";
}

// Insights' Target 1 column (spec §10) is the first real caller that can
// pass `null` for a genuine, expected reason — a non-laddered instrument's
// take_profit_1 — rather than only ever seeing a real number. That exposed
// a latent gap here: `Number(null) === 0` in JavaScript (unlike
// `Number(undefined)`, which is NaN), so the old isFinite-only check would
// have rendered a bare "0" for "no second target" instead of a dash. Every
// existing caller (Entry/Stop/Target/Break-even) only ever passed a real
// number in practice, so this null/undefined/empty-string guard changes
// nothing for them and only fixes the newly-reachable case. Fallback
// changed from "Pending" to the em dash used everywhere else absent-value
// prices render (tradeState.ts's formatEntry, CurrentTradesRail's
// formatLevel) — "Pending" implied a value that would arrive later, which
// is wrong for a target that will never exist on this instrument.
export function formatPriceValue(
  value: number | string | null | undefined,
) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatNumber(numericValue) : "—";
}

export function formatHistoryDateGroup(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();

  if (dateStart === todayStart) {
    return "Today";
  }
  if (dateStart === todayStart - 86_400_000) {
    return "Yesterday";
  }

  // Q2-C1: "en-US", like every other date the app draws. This label sits in the
  // Insights ledger's own group headers beside Today and Yesterday, which are
  // English by construction — a locale-formatted third form ("2. Aug. 2026")
  // beside them was a grammar the mock never draws.
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    date,
  );
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}


// ---------------------------------------------------------------------------
// Insights ledger (spec §10) — record band, one filter row, day-grouped
// table. Everything below this line is new for that recomposition; the
// grouping/sorting/outcome utilities above are unchanged and reused as-is.
// ---------------------------------------------------------------------------

export function formatSetupConfidence(setup: TradeSetupRow): string {
  return formatConfidenceWithTier(
    setup.confidence_score,
    confidenceThresholdForSymbol(setup.symbol),
  );
}

// Signed R, everywhere the app prints one: the Insights ledger (spec §10's own
// examples, "Open · +0.8R", "Stopped · −1.0R") and the Current trades rail's
// progress figure.
//
// One function and one minus sign (Q1-I12). The rail used to render its negative
// R with an ASCII hyphen on the grounds that it predates §10 and is not governed
// by it — but the two print the same quantity in the same lifecycle vocabulary,
// side by side in one app, and the reader has no way to know which surface a spec
// section reached first. The typographic minus (U+2212) stands because it is what
// §10 states and what lib/outcomes.ts's "Expired −" labels already carry; with
// the sign settled the two formatters were identical, so there is one.
//
// null is "no figure yet", which the rail needs (a pending trade has no progress)
// and the ledger's own callers already guard against upstream.
export function formatSignedR(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const sign = value < 0 ? "−" : "+";
  return `${sign}${Math.abs(value).toFixed(1)}R`;
}

// trade_outcomes.feedback is the only place realized R lives (no column —
// spec §10). D2 (R1a): the resolver now writes netRealizedR and realizedR
// on EVERY filled resolution, so a stat labelled "Net R" reads NET —
// gross realizedR is the fallback for rows graded before the change
// (where only the expiry branch wrote it, and net exists beside it
// anyway on all but the oldest rows). Callers must treat null as "no
// figure yet," never as zero — open/placed rows and unfilled resolutions
// carry neither field.
export function extractRealizedR(
  setup: Pick<OutcomeEvidenceRow, "trade_outcomes">,
): number | null {
  const feedback = asRecord(setup.trade_outcomes?.[0]?.feedback);
  return asNumber(feedback.netRealizedR) ?? asNumber(feedback.realizedR);
}

/**
 * What the runner half handed back, from the same feedback blob realized R
 * lives in (replay.ts writes it on every resolution that HAD a runner).
 *
 * Null means the resolution had no second leg at all, which is not the same as
 * zero. A full-size resolution never faced the question, and folding it in as 0
 * would dilute the total with rows that could not have given anything back —
 * the same denominator error that makes a win rate look better than the
 * account.
 *
 * (Phrased without quoting the ladder's own vocabulary: tests/languageGuard
 * scans string literals on working surfaces, and a quoted phrase in a comment
 * reads as one. It caught the first draft of this line.)
 */
export function extractForgoneRunnerR(
  setup: Pick<OutcomeEvidenceRow, "trade_outcomes">,
): number | null {
  const feedback = asRecord(setup.trade_outcomes?.[0]?.feedback);
  return asNumber(feedback.forgoneRunnerR);
}

// The Insights Status filter (spec §10: "All / Open / Pending / Closed") is
// coarser than the 8-way SetupOutcome taxonomy the old filter used — it's
// the same pending/open/closed split Current trades already lives by
// (spec §8's "closed = null" contract), so this reuses deriveTradeState
// directly rather than inventing a second classification of the same facts.
export type InsightsStatus = "closed" | "open" | "pending";
export type InsightsStatusFilter = "all" | InsightsStatus;

export function computeInsightsStatus(
  setup: TradeSetupRow,
  now: Date,
): InsightsStatus {
  return deriveTradeState(setup, now)?.status ?? "closed";
}

export type InsightsPeriodDays = 7 | 30 | 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Inclusive at the boundary: a setup created exactly `days` ago still
// counts as within the period. Also backs the record band's "setups this
// week" figure (days = 7), so both use one boundary rule.
export function isWithinPeriod(
  setup: Pick<TradeSetupRow, "created_at">,
  days: number,
  now: Date,
): boolean {
  const createdAt = new Date(setup.created_at).getTime();
  if (Number.isNaN(createdAt)) {
    return false;
  }
  return now.getTime() - createdAt <= days * MS_PER_DAY;
}

// The Market filter is structured after the scan scope menu's universal
// contract (spec §4: all → groups alphabetical → symbols nested) and reuses
// its ScanScope type for that ordering, over the same active-account-scoped
// groups the scope menu now offers (visibleAssetGroups(activeAccount) — §19
// retrofit, amendment 13, superseding the raw AVAILABLE_ASSET_GROUPS this
// comment used to name). It is deliberately NOT the ScopeMenu component
// itself: that component grays out and disables closed markets and labels
// them with scan affordances ("SCAN {N}", "OPENS {time}") — correct for
// choosing what to scan right now, wrong for filtering a historical ledger,
// where a market closed for the weekend must still be selectable to see its
// past setups. A plain <select> (HistoryPanel.tsx) carries the same
// three-tier data without borrowing scan-only behavior that doesn't apply
// here.
export const ALL_MARKETS_FILTER = "all";

export function marketFilterValue(scope: ScanScope): string {
  if (scope.kind === "all") {
    return ALL_MARKETS_FILTER;
  }
  if (scope.kind === "group") {
    return `group:${scope.assetType}`;
  }
  return `symbol:${scope.symbol}`;
}

export function parseMarketFilterValue(value: string): ScanScope {
  if (value.startsWith("group:")) {
    return { assetType: value.slice("group:".length) as SecurityType, kind: "group" };
  }
  if (value.startsWith("symbol:")) {
    return { kind: "symbol", symbol: value.slice("symbol:".length) };
  }
  return { kind: "all" };
}

export function matchesMarketFilter(
  setup: TradeSetupRow,
  scope: ScanScope,
): boolean {
  if (scope.kind === "all") {
    return true;
  }
  if (scope.kind === "group") {
    return getSecurityOption(setup.symbol).assetType === scope.assetType;
  }
  return setup.symbol === scope.symbol;
}

export type InsightsFilters = {
  market: ScanScope;
  periodDays: InsightsPeriodDays;
  status: InsightsStatusFilter;
};

export function filterInsightsSetups(
  setups: TradeSetupRow[],
  filters: InsightsFilters,
  now: Date,
): TradeSetupRow[] {
  return setups.filter((setup) =>
    matchesMarketFilter(setup, filters.market) &&
    (filters.status === "all" ||
      computeInsightsStatus(setup, now) === filters.status) &&
    isWithinPeriod(setup, filters.periodDays, now)
  );
}

// Insights' table is always day-grouped, newest day first, newest setup
// first within a day (spec §10) — no user-facing group-by/sort controls
// anymore, so this pins the one combination the ledger actually uses
// rather than leaving two separate calls duplicated at the call site.
export function buildInsightsGroups(
  setups: TradeSetupRow[],
): HistorySetupGroup[] {
  return groupHistorySetups(sortHistorySetups(setups));
}

export type RecordBand = {
  bestMarket: string | null;
  /**
   * R the runner half reached and did not keep, summed over the resolutions
   * that had a runner. Null until at least one carries the figure.
   *
   * Amendment 39 makes closing the profit gap the standing priority, and the 4b
   * geometry review put the gap here: forex banked +62,646R at TP1 and gave
   * 51,696R of it back. Those magnitudes are UNVERIFIED (from docs/research/baseline-2026-08-10, which remediation-program-2026-08-11.md lists as not to be trusted until re-measured — the direction is why this is ranked first, the magnitudes are not evidence) That was a finding in a review document. This is the
   * number on the screen the operator actually reads.
   */
  forgoneR: number | null;
  /** How many resolutions the figure above is drawn from. */
  forgoneRows: number;
  moneyPositivePercent: number | null;
  netR: number | null;
  /** 1j: what the percentage stands on — rendered beside it, never implied. */
  resolved: number;
  setupsThisWeek: number;
};

const RECORD_BAND_WEEK_DAYS = 7;

// Computed over the LIFETIME record, independent of the panel's own
// Market/Status/Period filters and independent of the ledger's display window
// (spec §10 as amended, and §18's own extension — owner 2026-08-02: "Yes. I want
// fidelity across the board", so one aggregate serves the band and the section
// below it). A stable header even while the table below is filtered down.
//
// "Setups this week" is the one figure that is not lifetime by intent: §10
// defines it as a period stat, and reading it off the lifetime record is what
// makes it exact — the display window could not count a week that ran past its
// own ceiling.
//
// The band's net R below stays LOOSER than Attribution's, deliberately and by
// owner ruling (2026-08-02, conflict 3a): it sums every figure present, an open
// runner's banked partial included, because the band is the account's running
// pulse. attribution.ts's netRForSlice answers a different question — the settled
// result of a slice — so it withholds unless every resolved row carried an R. Two
// figures, two questions, and neither claims to be the other; forcing the band
// all-or-nothing would em-dash it for any account whose older rows predate
// realizedR, which is less fidelity, not more.
export function buildRecordBand(
  setups: LifetimeSetupRow[],
  now: Date,
): RecordBand {
  const setupsThisWeek = setups.filter((setup) =>
    isWithinPeriod(setup, RECORD_BAND_WEEK_DAYS, now)
  ).length;

  let wins = 0;
  let losses = 0;
  let netRSum = 0;
  let netRPresent = false;
  let forgoneSum = 0;
  let forgoneRows = 0;
  const bySymbol = new Map<
    string,
    { losses: number; rSum: number; resolvedWithR: number; wins: number }
  >();

  for (const setup of setups) {
    // classifyWinLoss (lib/outcomes.ts) is the single source of truth for
    // money-positive vs. money-negative — tests/outcomes.test.ts's drift
    // guard counts every call site so an inline copy can't creep back in on
    // a future outcome-taxonomy change. Pending, unfilled, and ambiguous
    // setups classify "neither" and affect neither side of the ratio.
    const outcome = getSetupOutcome(setup);
    const winLoss = classifyWinLoss(outcome);

    const realizedR = extractRealizedR(setup);
    const forgone = extractForgoneRunnerR(setup);
    if (forgone !== null) {
      forgoneSum += forgone;
      forgoneRows += 1;
    }

    if (winLoss !== "neither") {
      const symbolStat = bySymbol.get(setup.symbol) ??
        { losses: 0, rSum: 0, resolvedWithR: 0, wins: 0 };
      if (winLoss === "win") {
        wins += 1;
        symbolStat.wins += 1;
      } else {
        losses += 1;
        symbolStat.losses += 1;
      }
      // Per-symbol R, kept beside the counts so "best" can be decided on money
      // rather than on frequency. Counted only for RESOLVED rows, so the
      // denominator below is the same population the rate uses.
      if (realizedR !== null) {
        symbolStat.rSum += realizedR;
        symbolStat.resolvedWithR += 1;
      }
      bySymbol.set(setup.symbol, symbolStat);
    }

    if (realizedR !== null) {
      netRSum += realizedR;
      netRPresent = true;
    }
  }

  // 1j: the rate obeys the same threshold every other published figure here
  // obeys — one resolved row used to print "100%". Below the gate the band
  // reads "Learning", exactly as Attribution does eight rows down for the
  // same reason, and the denominator ships alongside so the reader can
  // weigh what the percentage stands on.
  const resolved = wins + losses;
  const moneyPositivePercent = resolved >= ATTRIBUTION_LEARNING_MIN_RESOLVED
    ? Math.round((wins / resolved) * 100)
    : null;

  // Best market: highest NET R PER RESOLVED SETUP among symbols that have
  // reached §18's gate, tie-broken by more resolved evidence, then
  // alphabetically for a fully deterministic result.
  //
  // IT RANKED ON WIN RATE UNTIL 2026-08-27, and win rate is not what makes an
  // account grow on this ladder. A partial banks about +0.20R and a stop costs
  // -1.00R, so a market taking 85% partials nets +0.2R per ten setups while one
  // hitting 60% full runners nets +2.0R per ten — ten times the money, ranked
  // below it. The superlative pointed the operator at the wrong market using
  // the metric that is a RESULT of profit rather than the measure of it.
  //
  // A symbol whose resolved rows do not ALL carry an R is not eligible, rather
  // than being ranked on a partial sum: mixing a four-row R total with a
  // twelve-row one compares two different questions, and netRForSlice already
  // set that precedent in this file. Below the gate, or with no eligible
  // symbol, the panel reads "Learning" exactly as it did before.
  //
  // The gate used to be `> 0`, which crowned a market on ONE outcome — and it
  // rendered a superlative twenty lines above attribution rows that were
  // reading "Learning" on the same screen for the same reason. One lucky oats
  // win outranked forty EURUSD trades, and the panel contradicted its own
  // stated law in one glance. A superlative is a claim; it obeys the same
  // threshold every other published figure here obeys.
  const bestMarket = Array.from(bySymbol.entries())
    .map(([symbol, stat]) => ({
      expectancyR: stat.resolvedWithR > 0 ? stat.rSum / stat.resolvedWithR : null,
      resolved: stat.wins + stat.losses,
      resolvedWithR: stat.resolvedWithR,
      symbol,
    }))
    .filter((entry) =>
      entry.resolved >= ATTRIBUTION_LEARNING_MIN_RESOLVED &&
      entry.expectancyR !== null &&
      entry.resolvedWithR === entry.resolved
    )
    .sort((first, second) =>
      (second.expectancyR ?? 0) - (first.expectancyR ?? 0) ||
      second.resolved - first.resolved ||
      first.symbol.localeCompare(second.symbol)
    )[0]?.symbol ?? null;

  return {
    bestMarket,
    // Withheld rather than zeroed when nothing carries the figure: a "0.0R
    // given back" on an account that has never resolved a runner is a claim
    // about the ladder, and the honest answer is that it has not been measured.
    forgoneR: forgoneRows > 0 ? Number(forgoneSum.toFixed(1)) : null,
    forgoneRows,
    moneyPositivePercent,
    netR: netRPresent ? netRSum : null,
    resolved,
    setupsThisWeek,
  };
}

// Result column (spec §10; the words themselves are §17d's canonical seven,
// owner-approved verbatim, superseding §17b's table): "Pending" -> "Open · ±R"
// -> one of "Unfilled" / "Banked half · +R" / "Banked full · +R" /
// "Stopped · −R" / "Expired · ±R", and every surface in the app uses exactly
// those words. Two more finish the table (controller rulings, wave 4):
// "Unclear" for a path the chart cannot resolve, and "Closed · ±R" for the
// unreachable manual_close enum value. Status comes from deriveTradeState
// (pending/open first; everything else is closed), then closed rows branch on
// the outcome bucket.
//
// Both expiry buckets read the one word "Expired" — filled, window ended,
// neither level hit — because the R value beside it is what says where price
// stood when it ended, and a bare "Expired" is the honest reading when the
// engine recorded no R at all.
//
// Two rulings shaped what this does NOT do:
// - §17: `entry_not_filled` reads "Unfilled" for every row. It is a market
//   fact — price never reached the entry inside the window — never a claim
//   about what the user did, so the label reads no origin at all. (The database
//   column stays and is still selected, but §17m left it with no reader anywhere
//   in src: tradeState.ts became origin-blind when Scan became the only door,
//   and tests/tradeState.test.ts pins that.)
// - §17b: an unresolved row never reads the banned tracking phrase. It reads
//   whichever of the two unresolved words its own fill evidence supports,
//   through the same predicate the trades rail state machine uses.
export function formatInsightsResult(
  setup: TradeSetupRow,
  now: Date,
): string {
  const tradeState = deriveTradeState(setup, now);
  const realizedR = extractRealizedR(setup);

  if (tradeState?.status === "pending") {
    return "Pending";
  }
  if (tradeState?.status === "open") {
    return withRealizedR("Open", realizedR);
  }

  const outcome = getSetupOutcome(setup);
  if (outcome === "entry_not_filled") {
    return "Unfilled";
  }
  if (outcome === "target_reached") {
    return withRealizedR("Banked full", realizedR);
  }
  if (outcome === "partial_target") {
    return withRealizedR("Banked half", realizedR);
  }
  if (outcome === "stopped_out") {
    return withRealizedR("Stopped", realizedR);
  }
  if (outcome === "expired_in_profit" || outcome === "expired_in_loss") {
    return withRealizedR("Expired", realizedR);
  }
  if (outcome === "closed_manually") {
    return withRealizedR("Closed", realizedR);
  }
  if (outcome === "unclear_path") {
    return withRealizedR("Unclear", realizedR);
  }
  // Everything left is the unresolved bucket on a row deriveTradeState reports as
  // off-rail, which since §17m means one thing: a data anomaly. A closed status
  // should always carry a resolved outcome, so this is a closed row whose outcome
  // is missing or still literally pending. (The second reading this comment used
  // to give — a scan-surfaced setup whose order was never placed with a broker —
  // went with the provenance exclusion §17m deleted: a generated row now returns
  // "Pending" from the branch above and never reaches here.) §17b answers with
  // the lifecycle word the fill evidence supports, never a seventh word for
  // engine bookkeeping.
  return entryHasFilled(setup)
    ? withRealizedR("Open", realizedR)
    : "Pending";
}

function withRealizedR(label: string, realizedR: number | null): string {
  return realizedR === null ? label : `${label} · ${formatSignedR(realizedR)}`;
}

/**
 * The market groups an operator has actually traded, for Insights' filter.
 *
 * Insights is exempt from account segmentation (owner ruling, 2026-08-07): it
 * generates nothing, so there is no unplaceable-price risk to protect against,
 * and it is the record of every market across every account the operator holds.
 * A record that hides part of itself because of which account is selected today
 * is not a record.
 *
 * Not the whole roster either. A filter option for a market with no rows behind
 * it is noise, and on a 100+ market universe it is a lot of noise. So the list
 * is derived from the ledger itself: exactly the markets that have rows, in the
 * roster's own group order, which makes it self-maintaining as the universe
 * grows and as the operator's history does.
 */
export function groupsForTradedSymbols(
  setups: Pick<TradeSetupRow, "symbol">[],
): SecurityGroup[] {
  const traded = new Set(setups.map((setup) => setup.symbol));
  if (traded.size === 0) {
    return [];
  }
  return SECURITY_GROUPS.map((group) => ({
    ...group,
    options: group.options.filter((option) => traded.has(option.symbol)),
  })).filter((group) => group.options.length > 0);
}
