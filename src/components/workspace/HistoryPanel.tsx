import { useEffect, useState } from "react";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import { AVAILABLE_ASSET_GROUPS } from "../../lib/symbolMap";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../mobileFrame";
import type { ScanScope } from "./ScopeMenu";
import { useWorkspaceNav } from "./WorkspaceNav";
import {
  ALL_MARKETS_FILTER,
  buildInsightsGroups,
  buildRecordBand,
  filterInsightsSetups,
  formatInsightsResult,
  formatPriceValue,
  formatSetupConfidence,
  formatSignedR,
  getOutcomeClassName,
  getSetupOutcome,
  marketFilterValue,
  parseMarketFilterValue,
  type InsightsPeriodDays,
  type InsightsStatusFilter,
} from "./historyUtils";

// Order matches spec §10's own listing: "All / Open / Pending / Closed".
const STATUS_FILTER_OPTIONS: Array<
  { label: string; value: InsightsStatusFilter }
> = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Pending", value: "pending" },
  { label: "Closed", value: "closed" },
];

const PERIOD_OPTIONS: Array<{ label: string; value: InsightsPeriodDays }> = [
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

const DEFAULT_PERIOD_DAYS: InsightsPeriodDays = 30;

export function HistoryPanel({
  initialSymbol,
  loading,
  onInitialSymbolHandled,
  setups,
}: {
  // A cross-link elsewhere in the app (Advisor, Profile) asked to filter
  // Insights to one market. Adopted once per change so the user can still
  // clear the filter afterwards without it snapping back.
  initialSymbol?: string | null;
  loading: boolean;
  // Called once the effect below has adopted initialSymbol, so the caller
  // (App) can clear it. HistoryPanel unmounts whenever its tab isn't
  // active, so without this the same request would still be sitting there
  // on the next mount and would re-apply itself over a market the user
  // picked in the meantime — the same stale-remount shape openRequest had
  // before AdvisorWorkspace grew onOpenRequestHandled.
  onInitialSymbolHandled?: () => void;
  setups: TradeSetupRow[];
}) {
  const [marketScope, setMarketScope] = useState<ScanScope>({ kind: "all" });
  const [statusFilter, setStatusFilter] = useState<InsightsStatusFilter>(
    "all",
  );
  const [periodDays, setPeriodDays] = useState<InsightsPeriodDays>(
    DEFAULT_PERIOD_DAYS,
  );

  useEffect(() => {
    if (initialSymbol) {
      setMarketScope({ kind: "symbol", symbol: initialSymbol });
      onInitialSymbolHandled?.();
    }
  }, [initialSymbol, onInitialSymbolHandled]);

  // A plain per-render read, not a ticking clock: pending/open/closed
  // classification and period-boundary filtering only need "roughly now",
  // never a stable reference. Every computation below is a cheap scan over
  // at most 80 rows (fetchTradeSetups' own limit), so none of it is wrapped
  // in useMemo — with `now` legitimately fresh every render, a memo keyed
  // on it would recompute every render anyway and buy nothing.
  const now = new Date();
  const recordBand = buildRecordBand(setups, now);
  const filteredSetups = filterInsightsSetups(
    setups,
    { market: marketScope, periodDays, status: statusFilter },
    now,
  );
  const groupedSetups = buildInsightsGroups(filteredSetups);
  // Which composition this surface is (spec §17g): below lg a fixed-viewport
  // frame with the record band and the filters pinned above one scrolling
  // ledger, at ≥lg the flat scrolling page i-insights-v1.html draws. A JS check
  // rather than CSS for the same reason the Desk uses one — the pinned/scroll
  // split needs wrapper boxes no restyling of the ≥lg tree produces — and the
  // three blocks below are built once and placed by whichever branch renders, so
  // the ≥lg page is byte-for-byte the one it already was.
  const isMobile = useIsMobileViewport();

  const recordBandHead = (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-3.5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-normal text-ink">
          Insights
        </h1>
        {loading
          ? <p className="text-sm font-semibold text-ink-muted">Loading</p>
          : null}
      </div>
      <div className="flex flex-wrap gap-8">
        <StatBlock
          label="Setups this week"
          value={recordBand.setupsThisWeek.toString()}
        />
        <StatBlock
          label="Money-positive"
          value={recordBand.moneyPositivePercent === null
            ? "Learning"
            : `${recordBand.moneyPositivePercent}%`}
        />
        <StatBlock
          label="Net R"
          value={recordBand.netR === null
            ? "—"
            : formatSignedR(recordBand.netR)}
        />
        <StatBlock
          label="Best market"
          value={recordBand.bestMarket ?? "Learning"}
        />
      </div>
    </div>
  );

  const filterRow = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline pb-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink">
        Market
        <select
          aria-label="Market"
          className="field"
          value={marketFilterValue(marketScope)}
          onChange={(event) =>
            setMarketScope(parseMarketFilterValue(event.target.value))}
        >
          <option value={ALL_MARKETS_FILTER}>All markets</option>
          {AVAILABLE_ASSET_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              <option value={`group:${group.label}`}>
                All {group.label}
              </option>
              {group.options.map((option) => (
                <option key={option.symbol} value={`symbol:${option.symbol}`}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink">
        Status
        <select
          aria-label="Status"
          className="field"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as InsightsStatusFilter)}
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink">
        Period
        <select
          aria-label="Period"
          className="field"
          value={periodDays}
          onChange={(event) =>
            setPeriodDays(Number(event.target.value) as InsightsPeriodDays)}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  // The ledger itself, frame-free: at ≥lg the mock's own table box wraps this
  // (spec §17c names it as the one surviving frame), and below lg the scroll
  // region carries it flat, since §17g extends the box-on-box rule to scroll
  // regions. The horizontal scroller inside is shared by both — it is an axis the
  // 720px table needs at any width, not a second region.
  const ledger = (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="eyebrow border-b border-hairline text-left">
              <th className="py-2 pr-3">Market</th>
              <th className="py-2 pr-3">Side</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2 pr-3">Entry</th>
              <th className="py-2 pr-3">Stop</th>
              <th className="py-2 pr-3">Target 1</th>
              <th className="py-2 pr-3">Target 2</th>
              <th className="py-2 pr-3">Result</th>
            </tr>
          </thead>
          {groupedSetups.map((group) => (
            <tbody key={group.key}>
              <tr className="bg-sheet">
                <th
                  className="eyebrow px-0 py-2 text-left"
                  colSpan={8}
                >
                  {group.label} · {group.items.length}{" "}
                  {group.items.length === 1 ? "setup" : "setups"}
                </th>
              </tr>
              {group.items.map((setup) => (
                <InsightsRow key={setup.id} now={now} setup={setup} />
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {!loading && setups.length === 0
        ? (
          <p className="mt-4 text-sm leading-6 text-ink-muted">
            No setups have been logged yet.
          </p>
        )
        : null}
      {!loading && setups.length > 0 && filteredSetups.length === 0
        ? (
          <p className="mt-4 text-sm leading-6 text-ink-muted">
            No setups match the current filters.
          </p>
        )
        : null}
    </>
  );

  if (isMobile) {
    // Spec §17g: "Insights: record band + filters pinned; the ledger (day groups
    // + rows) is the scroll region." The pinned block keeps the page's own 20px
    // rhythm between its two rules, and the filter row's hairline is the only
    // separation between the chrome and the ledger — no second frame.
    return (
      <div className={MOBILE_FRAME}>
        <div className={MOBILE_FRAME_PINNED}>
          <div className="grid gap-5">
            {recordBandHead}
            {filterRow}
          </div>
        </div>
        <div
          className={MOBILE_FRAME_SCROLL}
          data-testid="mobile-insights-scroll"
        >
          {ledger}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-5">
      {recordBandHead}
      {filterRow}
      <div className="terminal-panel p-3 sm:p-4">{ledger}</div>
      {/* Spec §17c deletes the below-table blurb outright: the Guide teaches
          that every setup is kept and that the record follows the broker, the
          table itself shows the setups, and the masthead's chip shows the
          broker. tests/historyPanel.test.tsx pins every fragment's absence, so
          none of that sentence appears in this file, comments included. */}
    </div>
  );
}

function InsightsRow({ now, setup }: { now: Date; setup: TradeSetupRow }) {
  const nav = useWorkspaceNav();
  const isBuy = setup.side === "buy";
  const outcome = getSetupOutcome(setup);

  return (
    <tr className="border-b border-hairline last:border-b-0">
      <td className="pr-3">
        {/*
          The symbol itself is the affordance — no separate "Open in
          Advisor" caption/column, same consume-once nav.openAdvisor flow
          ProfilePanel.tsx's per-market button already uses. Keeps the
          Market column's existing bold/ink look (font-semibold text-ink,
          unchanged from before this button existed) rather than switching
          to .tertiary-link's muted/small treatment, which would visually
          demote the ledger's primary identifying column; link-accent
          supplies the hover affordance without touching color/weight.
          min-h-11 alone (not .tertiary-link's negative-margin trick, which
          relies on generous surrounding whitespace to hide the overflow —
          fine in a standalone paragraph like ProfilePanel's or Current
          trades' refresh link, but here it would visually spill into the
          table rows above and below) grows this cell to a real 44px; the
          cell's own py-2 is dropped so the button supplies all the height
          itself rather than stacking on top of it. Table rows size to
          their tallest cell, so every cell in the row grows with it.
        */}
        <button
          aria-label={`Open ${setup.symbol} in Advisor`}
          className="link-accent inline-flex min-h-11 items-center font-semibold text-ink"
          type="button"
          onClick={() => nav.openAdvisor(setup.symbol)}
        >
          {setup.symbol}
        </button>
      </td>
      <td className="py-2 pr-3">
        <span className={`chip ${isBuy ? "text-buy" : "text-sell"}`}>
          {isBuy ? "Buy" : "Sell"}
        </span>
      </td>
      <td className="py-2 pr-3 font-mono tabular-nums text-ink">
        {formatSetupConfidence(setup)}
      </td>
      <td className="py-2 pr-3 font-mono tabular-nums text-ink">
        {formatPriceValue(setup.limit_entry)}
      </td>
      <td className="py-2 pr-3 font-mono tabular-nums text-ink">
        {formatPriceValue(setup.stop_loss)}
      </td>
      <td className="py-2 pr-3 font-mono tabular-nums text-ink">
        {formatPriceValue(setup.take_profit_1)}
      </td>
      <td className="py-2 pr-3 font-mono tabular-nums text-ink">
        {formatPriceValue(setup.take_profit)}
      </td>
      <td
        className={`py-2 pr-3 font-mono font-semibold tabular-nums ${
          getOutcomeClassName(outcome)
        }`}
      >
        {formatInsightsResult(setup, now)}
      </td>
    </tr>
  );
}

// Insights record band (spec §16): flat value+label pairs, no card chrome —
// the mock draws these as bare text (i-insights-v1.html `.stat`), hairline-
// separated from the filters below by the phead's own bottom rule rather
// than by a border around each stat.
function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold tabular-nums text-ink">
        {value}
      </p>
      <p className="eyebrow">
        {label}
      </p>
    </div>
  );
}
