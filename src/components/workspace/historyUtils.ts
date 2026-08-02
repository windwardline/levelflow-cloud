import { CONFIDENCE_THRESHOLD_BY_ASSET_TYPE } from "../../lib/advisorReview";
import {
  CONFIDENCE_TIERS,
  formatConfidenceTierRange,
  formatConfidenceWithTier,
} from "../../lib/confidenceTiers";
import {
  classifyWinLoss,
  normalizeSetupOutcome,
  OUTCOME_COPY,
  type SetupOutcome,
} from "../../lib/outcomes";
import {
  compareAssetCategories,
  compareAssetSymbols,
  formatSecurityLabel,
  getSecurityOption,
  type SecurityType,
} from "../../lib/symbolMap";
import { deriveTradeState, entryHasFilled } from "../../lib/tradeState";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";
import { formatNumber } from "./advisorFormat";
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

export type HistoryGroupBy = "date" | "category" | "asset" | "status";
export type HistorySort = "newest" | "oldest" | "confidence" | "asset";

export type HistorySetupGroup = {
  items: TradeSetupRow[];
  key: string;
  label: string;
};

// Insights (spec §10) no longer exposes a "group by status" control or the
// old 8-way status filter — its own Status filter is the coarser
// pending/open/closed split (InsightsStatusFilter, below), driven by
// deriveTradeState. groupHistorySetups's "status" mode still needs this
// ordering internally, and stays covered by tests/core.test.ts, so it stays
// — just no longer part of this module's public surface.
const HISTORY_STATUS_ORDER: SetupOutcome[] = [
  "still_tracking",
  "target_reached",
  "partial_target",
  "expired_in_profit",
  "expired_in_loss",
  "stopped_out",
  "closed_manually",
  "unclear_path",
  "entry_not_filled",
];

export function sortHistorySetups(
  setups: TradeSetupRow[],
  sortBy: HistorySort,
) {
  // Every mode ends in the same full tie-break chain so no ordering is ever
  // left to database return order — a scan batch shares one created_at
  // second, and before this chain existed those rows rendered in whatever
  // order the fetch happened to deliver (owner-observed, 2026-08-01). The
  // tiers after the mode's own key: confidence descending (the strongest
  // first, echoing the scan results' one sanctioned ordering deviation),
  // then the universal base/quote symbol comparator.
  return [...setups].sort((first, second) => {
    const firstDate = new Date(first.created_at).getTime();
    const secondDate = new Date(second.created_at).getTime();
    const confidenceGap =
      Number(second.confidence_score) - Number(first.confidence_score);
    const symbolOrder = compareAssetSymbols(first.symbol, second.symbol);

    if (sortBy === "oldest") {
      return firstDate - secondDate || confidenceGap || symbolOrder;
    }
    if (sortBy === "confidence") {
      return confidenceGap || secondDate - firstDate || symbolOrder;
    }
    if (sortBy === "asset") {
      return symbolOrder || secondDate - firstDate || confidenceGap;
    }
    return secondDate - firstDate || confidenceGap || symbolOrder;
  });
}

export function groupHistorySetups(
  setups: TradeSetupRow[],
  groupBy: HistoryGroupBy,
): HistorySetupGroup[] {
  const groups = new Map<string, HistorySetupGroup>();

  setups.forEach((setup) => {
    const group = getHistoryGroup(setup, groupBy);
    const existingGroup = groups.get(group.key);
    if (existingGroup) {
      existingGroup.items.push(setup);
      return;
    }
    groups.set(group.key, { ...group, items: [setup] });
  });

  const orderedGroups = Array.from(groups.values());
  if (groupBy === "asset") {
    return orderedGroups.sort((first, second) =>
      compareAssetSymbols(first.key, second.key)
    );
  }
  if (groupBy === "category") {
    return orderedGroups.sort((first, second) =>
      compareAssetCategories(
        first.key as SecurityType,
        second.key as SecurityType,
      )
    );
  }
  if (groupBy === "status") {
    return orderedGroups.sort(
      (first, second) =>
        HISTORY_STATUS_ORDER.indexOf(first.key as SetupOutcome) -
        HISTORY_STATUS_ORDER.indexOf(second.key as SetupOutcome),
    );
  }
  return orderedGroups;
}

export function buildConfidenceBands(setups: TradeSetupRow[]) {
  const bands = CONFIDENCE_TIERS.map((tier) => ({
    ambiguous: 0,
    count: 0,
    label: tier.label,
    losses: 0,
    max: tier.max,
    min: tier.min,
    range: formatConfidenceTierRange(tier),
    wins: 0,
  }));

  for (const setup of setups) {
    const score = Number(setup.confidence_score);
    const band = bands.find(
      (candidate) => score >= candidate.min && score <= candidate.max,
    );
    if (!band) {
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

  return bands.map((band) => {
    const resolved = band.wins + band.losses;
    return {
      ambiguous: band.ambiguous,
      count: band.count,
      label: band.label,
      range: band.range,
      resolved,
      winRate: resolved > 0 ? Math.round((band.wins / resolved) * 100) : null,
    };
  });
}

export function getSetupOutcome(setup: TradeSetupRow): SetupOutcome {
  return normalizeSetupOutcome(setup);
}

export function getOutcomeLabel(outcome: SetupOutcome) {
  return OUTCOME_COPY[outcome].label;
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

function getHistoryGroup(
  setup: TradeSetupRow,
  groupBy: HistoryGroupBy,
): Omit<HistorySetupGroup, "items"> {
  if (groupBy === "asset") {
    return { key: setup.symbol, label: formatSecurityLabel(setup.symbol) };
  }
  if (groupBy === "category") {
    const category = getSecurityOption(setup.symbol).assetType;
    return { key: category, label: category };
  }
  if (groupBy === "status") {
    const outcome = getSetupOutcome(setup);
    return { key: outcome, label: getOutcomeLabel(outcome) };
  }

  const date = new Date(setup.created_at);
  const key = Number.isNaN(date.getTime())
    ? "unknown-date"
    : date.toISOString().slice(0, 10);
  return { key, label: formatHistoryDateGroup(date) };
}

// ---------------------------------------------------------------------------
// Insights ledger (spec §10) — record band, one filter row, day-grouped
// table. Everything below this line is new for that recomposition; the
// grouping/sorting/outcome utilities above are unchanged and reused as-is.
// ---------------------------------------------------------------------------

export function formatSetupConfidence(setup: TradeSetupRow): string {
  const category = getSecurityOption(setup.symbol).assetType;
  return formatConfidenceWithTier(
    setup.confidence_score,
    CONFIDENCE_THRESHOLD_BY_ASSET_TYPE[category],
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

// trade_outcomes.feedback is the only place realizedR lives (no column —
// spec §10). Present for tp1_partial/expired_in_profit/expired_at_loss
// today (supabase/functions/trade-analyzer/replay.ts's expiry branch);
// absent everywhere else including every open/placed row and every
// take_profit/stop_loss resolution — callers must treat null as "no
// figure yet," never as zero.
export function extractRealizedR(setup: TradeSetupRow): number | null {
  const feedback = asRecord(setup.trade_outcomes?.[0]?.feedback);
  return asNumber(feedback.realizedR);
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
  setup: TradeSetupRow,
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
// its ScanScope type and AVAILABLE_ASSET_GROUPS data for that ordering. It
// is deliberately NOT the ScopeMenu component itself: that component grays
// out and disables closed markets and labels them with scan affordances
// ("SCAN {N}", "OPENS {time}") — correct for choosing what to scan right
// now, wrong for filtering a historical ledger, where a market closed for
// the weekend must still be selectable to see its past setups. A plain
// <select> (HistoryPanel.tsx) carries the same three-tier data without
// borrowing scan-only behavior that doesn't apply here.
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
  return groupHistorySetups(sortHistorySetups(setups, "newest"), "date");
}

export type RecordBand = {
  bestMarket: string | null;
  moneyPositivePercent: number | null;
  netR: number | null;
  setupsThisWeek: number;
};

const RECORD_BAND_WEEK_DAYS = 7;

// Always computed from every loaded row, independent of the panel's own
// Market/Status/Period filters (spec §10: "computed from the loaded
// rows") — a stable header even while the table below is filtered down.
export function buildRecordBand(
  setups: TradeSetupRow[],
  now: Date,
): RecordBand {
  const setupsThisWeek = setups.filter((setup) =>
    isWithinPeriod(setup, RECORD_BAND_WEEK_DAYS, now)
  ).length;

  let wins = 0;
  let losses = 0;
  let netRSum = 0;
  let netRPresent = false;
  const bySymbol = new Map<string, { losses: number; wins: number }>();

  for (const setup of setups) {
    // classifyWinLoss (lib/outcomes.ts) is the single source of truth for
    // money-positive vs. money-negative — tests/outcomes.test.ts's drift
    // guard counts every call site so an inline copy can't creep back in on
    // a future outcome-taxonomy change. Pending, unfilled, and ambiguous
    // setups classify "neither" and affect neither side of the ratio.
    const outcome = getSetupOutcome(setup);
    const winLoss = classifyWinLoss(outcome);

    if (winLoss !== "neither") {
      const symbolStat = bySymbol.get(setup.symbol) ?? { losses: 0, wins: 0 };
      if (winLoss === "win") {
        wins += 1;
        symbolStat.wins += 1;
      } else {
        losses += 1;
        symbolStat.losses += 1;
      }
      bySymbol.set(setup.symbol, symbolStat);
    }

    const realizedR = extractRealizedR(setup);
    if (realizedR !== null) {
      netRSum += realizedR;
      netRPresent = true;
    }
  }

  const resolved = wins + losses;
  const moneyPositivePercent = resolved > 0
    ? Math.round((wins / resolved) * 100)
    : null;

  // Best market: highest money-positive rate among symbols with at least
  // one resolved outcome, tie-broken by more resolved evidence, then
  // alphabetically for a fully deterministic result.
  const bestMarket = Array.from(bySymbol.entries())
    .map(([symbol, stat]) => ({
      resolved: stat.wins + stat.losses,
      symbol,
      winRate: stat.wins / (stat.wins + stat.losses),
    }))
    .filter((entry) => entry.resolved > 0)
    .sort((first, second) =>
      second.winRate - first.winRate ||
      second.resolved - first.resolved ||
      first.symbol.localeCompare(second.symbol)
    )[0]?.symbol ?? null;

  return {
    bestMarket,
    moneyPositivePercent,
    netR: netRPresent ? netRSum : null,
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
//   about what the user did, so the label reads no origin at all. (The
//   database column stays; tradeState.ts still reads it to keep an unfilled
//   scan row off the trades rail.)
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
  // Everything left is the unresolved bucket on a row deriveTradeState
  // reports as off-rail: a scan-surfaced setup whose order was never placed
  // with a broker, or — a data anomaly, since a closed status should always
  // carry a resolved outcome — a closed row whose outcome is missing or still
  // literally pending. Either way §17b answers with the lifecycle word the
  // fill evidence supports, never a seventh word for engine bookkeeping.
  return entryHasFilled(setup)
    ? withRealizedR("Open", realizedR)
    : "Pending";
}

function withRealizedR(label: string, realizedR: number | null): string {
  return realizedR === null ? label : `${label} · ${formatSignedR(realizedR)}`;
}
