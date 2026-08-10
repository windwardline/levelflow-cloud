import { useEffect, useState } from "react";
import { isDisplayExcluded } from "../../lib/broker/offsets";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import type { LifetimeSetupRow, TradeSetupRow } from "../../lib/tradeAnalyzer";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../mobileFrame";
import { buildAttribution } from "./attribution";
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
  groupsForTradedSymbols,
  HISTORY_LOAD_FAILED_COPY,
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
  lifetimeSetups,
  loadFailed,
  loading,
  setups,
}: {
  // The lifetime record (spec §18): what the record band and Attribution are
  // computed over. Separate from `setups` on purpose — that is the ledger's
  // display window, and a header describing a page while claiming the account
  // is the fork these rulings close.
  lifetimeSetups: LifetimeSetupRow[];
  // Q2-C2: the history fetch failed, so an empty ledger is unknown rather than
  // known-empty.
  loadFailed: boolean;
  loading: boolean;
  setups: TradeSetupRow[];
}) {
  // Insights is EXEMPT from account segmentation (owner ruling, 2026-08-07).
  //
  // The Desk is segmented because it generates setups: offering a futures
  // market to a forex account would produce a limit price the operator cannot
  // place. Insights generates nothing. It is the record of what the operator
  // has ALREADY traded, across every market and every account they hold, and a
  // record that hides part of itself because of which account is selected today
  // is not a record.
  //
  // The rows were never filtered — the ledger has always shown everything — but
  // the market FILTER was built from visibleAssetGroups, so an operator on a
  // forex account could not slice their own history to a futures market they
  // had traded. The data was there and the way to look at it was not.
  //
  // The filter now offers exactly the markets this operator has actually
  // traded, which is both wider than one account's offering and narrower than
  // the whole roster: a market with no rows is not a filter, it is noise.
  const tradedGroups = groupsForTradedSymbols(setups);
  const [marketScope, setMarketScope] = useState<ScanScope>({ kind: "all" });
  const [statusFilter, setStatusFilter] = useState<InsightsStatusFilter>(
    "all",
  );
  const [periodDays, setPeriodDays] = useState<InsightsPeriodDays>(
    DEFAULT_PERIOD_DAYS,
  );

  // §19 retrofit, Task 8 (amendment 13): the same rule the scan scope menu
  // follows (AdvisorWorkspace's own reset effect) — a filter naming a market
  // this account can no longer trade is one the reader can neither see (the
  // select no longer lists it) nor clear from the control itself, so an
  // account switch that hides the current filter falls back to "All markets"
  // on its own. The ledger's own rows are untouched either way (amendment
  // 13 deletes nothing): this only resets which filter is ACTIVE, never what
  // history exists to filter.
  useEffect(() => {
    if (marketScope.kind === "all") {
      return;
    }
    const stillVisible = marketScope.kind === "group"
      ? tradedGroups.some((group) => group.label === marketScope.assetType)
      : tradedGroups.some((group) =>
        group.options.some((option) => option.symbol === marketScope.symbol)
      );
    if (!stillVisible) {
      setMarketScope({ kind: "all" });
    }
  }, [tradedGroups, marketScope]);

  // A plain per-render read, not a ticking clock: pending/open/closed
  // classification and period-boundary filtering only need "roughly now",
  // never a stable reference. The ledger's own computations scan at most
  // LEDGER_WINDOW_ROWS rows; the two lifetime aggregates scan the record, which
  // is 23 rows on the largest account today (measured 2026-08-03) and grows with
  // it. None of it is wrapped in useMemo — with `now` legitimately fresh every
  // render, a memo keyed on it would recompute every render anyway and buy
  // nothing. The size at which a per-render scan stops being free is also the
  // size at which the aggregate belongs server-side (§18 authorizes it), so the
  // answer there is the read, not a memo.
  const now = new Date();
  const recordBand = buildRecordBand(lifetimeSetups, now);
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

  // §17n (mobile minimalism), the slimming the ruling pre-approved by name.
  // Measured against the built CSS at 375x812: this band was 192px and the filter
  // row below it 185px, so 409px of the 743px content row was pinned chrome and
  // the ledger — the thing the surface exists to deliver — had 334px. The band's
  // own numbers were a 32px h1 line, a 16px gap, four 48px stat blocks wrapping
  // into two ragged rows at a 32px row gap, and 14px of pad under the 2px rule.
  //
  // Below lg it is now 138px: the 19px page head every mobile surface draws
  // (m-trades-v1.html's own `.phead .t`, which CurrentTradesRail already ships),
  // an 8px gap, the four stats as a deliberate 2x2 grid at 18px, and 8px of pad.
  // Nothing above lg moves — every reduction is a max-lg: literal, and the ≥lg
  // page is the mock's byte for byte.
  const recordBandHead = (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-3.5 max-lg:gap-x-3 max-lg:gap-y-2 max-lg:pb-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-normal text-ink max-lg:text-[19px] max-lg:leading-6">
          Insights
        </h1>
        {loading
          ? <p className="text-sm font-semibold text-ink-muted">Loading</p>
          : null}
      </div>
      {/* Four blocks in two flex rows became four in a 2x2 grid: the same two
          rows, 32px of row gap less, and columns that line up instead of
          wrapping wherever the labels happen to end. w-full is what gives the
          grid its own two columns once it has dropped below the h1. */}
      <div className="flex flex-wrap gap-8 max-lg:grid max-lg:w-full max-lg:grid-cols-2 max-lg:gap-x-4 max-lg:gap-y-2">
        <StatBlock
          label="Setups this week"
          value={recordBand.setupsThisWeek.toString()}
        />
        <StatBlock
          label="Money-positive"
          value={recordBand.moneyPositivePercent === null
            ? "Learning"
            : `${recordBand.moneyPositivePercent}% of ${recordBand.resolved}`}
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

  // §17n, the other half of the pre-approved slimming. Measured at 375x812: three
  // `.field` selects at 48px, each in a label pair too wide to share a line, stacked
  // to three rows at a 12px gap with 16px of pad under them — 185px. Below lg the
  // pairs now measure 137px (Status) and 170px (Period) of the 343px available, so
  // they share the second row and the row is 105px: two 44px rows, an 8px gap, 8px
  // of pad.
  //
  // The compaction is padding and type, never the tap target: `.field`'s 48px is
  // above the kit's 44px floor, not at it, so max-lg:min-h-11 lands the selects ON
  // the floor and every filter stays a real 44px touch target. The visible labels
  // stay too — §17f runs first, and "All" beside a market filter reading "All
  // markets" is not a string the surface already shows.
  const filterRow = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline pb-4 max-lg:gap-x-3 max-lg:gap-y-2 max-lg:pb-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink max-lg:gap-1.5 max-lg:text-xs">
        Market
        <select
          aria-label="Market"
          className="field max-lg:min-h-11 max-lg:px-2 max-lg:text-[13px]"
          value={marketFilterValue(marketScope)}
          onChange={(event) =>
            setMarketScope(parseMarketFilterValue(event.target.value))}
        >
          <option value={ALL_MARKETS_FILTER}>All markets</option>
          {tradedGroups.map((group) => (
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
      <label className="flex items-center gap-2 text-sm font-semibold text-ink max-lg:gap-1.5 max-lg:text-xs">
        Status
        <select
          aria-label="Status"
          className="field max-lg:min-h-11 max-lg:px-2 max-lg:text-[13px]"
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
      <label className="flex items-center gap-2 text-sm font-semibold text-ink max-lg:gap-1.5 max-lg:text-xs">
        Period
        <select
          aria-label="Period"
          className="field max-lg:min-h-11 max-lg:px-2 max-lg:text-[13px]"
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
            {loadFailed ? HISTORY_LOAD_FAILED_COPY : "No setups have been logged yet."}
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

  // Attribution (spec §18, hedge-mind pillar 1). Reads `lifetimeSetups` — never
  // `filteredSetups`, and never `setups` either: the section answers "what
  // works", not "what am I looking at" and not "what did this page load". §18
  // states both so nobody wires the filters in later and calls it a fix, and so
  // nobody re-derives the aggregate from the ledger's window and calls that the
  // full history. It renders whatever the record holds, including nothing — an
  // empty record shows all four groups reading "Learning", because the section's
  // presence is what teaches which evidence accrues.
  const attributionGroups = buildAttribution(lifetimeSetups);

  // Built once and placed by whichever branch renders, the same way the three
  // blocks above are: below lg it lands in the Insights frame's scroll region
  // after the ledger, at ≥lg inside the table frame after the ledger, so §17g
  // parity is structural rather than a second copy of the section. Flat
  // throughout — hairline rules between rows and nothing else, since the frame
  // it sits in is already the surface's one allowed perimeter.
  const attributionSection = (
    <section className="mt-6 grid gap-4" data-testid="attribution">
      {/* §17n: the section head follows the surface head down. The h1 above it
          is 19px below lg now, and a 20px h2 under a 19px h1 is a heading scale
          that reads backwards — so this drops to 16px and the hierarchy is real
          at both widths (24 over 20 at ≥lg, 19 over 16 below it). */}
      <h2 className="text-xl font-semibold tracking-normal text-ink max-lg:text-base">
        Attribution
      </h2>
      {/* Two columns at ≥lg, one below it, each group capped at the measure
          where a label and its three figures still read as one row. Across the
          ≥lg frame's full 1180px a single stretched row would strand the
          numbers half a screen from the label they belong to, which is the one
          thing a right-aligned figure column must not do. The switch is lg
          rather than sm because lg is where the surface changes composition
          (§17g): a second column inside the phone frame's own range would put
          two 240px figure clusters in a 608px region and overlap them. */}
      <div className="grid gap-x-10 gap-y-5 lg:grid-cols-2">
        {attributionGroups.map((group) => (
          <div className="max-w-[420px]" key={group.key}>
            <p className="eyebrow border-b border-hairline pb-2">
              {group.label}
            </p>
            {group.rows.map((row) => (
              <div
                className="flex items-baseline justify-between gap-4 border-b border-hairline py-1.5 last:border-b-0"
                key={row.key}
              >
                <span className="text-sm font-semibold text-ink">
                  {row.label}
                </span>
                {/* The three figures sit in fixed-width right-aligned cells so
                    they read as columns down the group without a table's own
                    headers, which §17f would have to justify as copy.

                    One gate, both numbers (§18, amendment 3): below three
                    resolved both cells withhold, and above it the em dash means
                    the other withholding entirely — enough history, one row
                    without an R. The aggregator owns the threshold;
                    `row.learning` is the whole of it that reaches here, so the
                    surface cannot drift from the law. */}
                <span className="flex shrink-0 items-baseline gap-4 font-mono text-sm tabular-nums text-ink">
                  <span className="w-8 text-right">{row.resolved}</span>
                  <span className="w-20 text-right">
                    {row.learning
                      ? "Learning"
                      : `${row.moneyPositivePercent}%`}
                  </span>
                  <span className="w-20 text-right">
                    {row.learning
                      ? "Learning"
                      : row.netR === null
                      ? "—"
                      : formatSignedR(row.netR)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );

  if (isMobile) {
    // Spec §17g: "Insights: record band + filters pinned; the ledger (day groups
    // + rows) is the scroll region." The filter row's hairline is the only
    // separation between the chrome and the ledger — no second frame.
    //
    // The gap between the two pinned blocks is chrome as well (§17n names "every
    // label and gap between them"), so below lg it is 12px rather than the ≥lg
    // page's 20px — this wrapper exists only in the mobile branch, so it needs no
    // variant. Measured: 267px of pinned chrome now against 484px of ledger, from
    // 409px against 334px before the wave.
    return (
      <div className={MOBILE_FRAME}>
        <div className={MOBILE_FRAME_PINNED}>
          <div className="grid gap-3">
            {recordBandHead}
            {filterRow}
          </div>
        </div>
        <div
          className={MOBILE_FRAME_SCROLL}
          data-testid="mobile-insights-scroll"
        >
          {ledger}
          {attributionSection}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1180px] gap-5">
      {recordBandHead}
      {filterRow}
      <div className="terminal-panel p-3 sm:p-4">
        {ledger}
        {attributionSection}
      </div>
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
          Advisor" caption/column, the same consume-once nav.openAdvisor flow
          the Current trades rail's own cards use. Keeps the
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

          The whole stored row goes over, not its symbol (owner finding 3,
          2026-08-02: "Clicking on the trade in the Insights tab loads the chart,
          but not the details below it. It should."). A bare symbol reselected
          the market and left the stage's analysis state null, so the chart
          reloaded above an empty ladder; the row is what the stage restores from.
        */}
        {isDisplayExcluded(setup.symbol)
          ? (
            // Amendment 23's offset ruling (owner, 2026-08-05), fix round 1:
            // the row is a record and renders in full, but a display-excluded
            // symbol (BRENT today) has no route back onto the chart — the
            // affordance is ABSENT, not disabled (§17c: an inert control is a
            // lie). Same treatment as the Current trades rail's own
            // !reopenable branch; AdvisorWorkspace's canReopenStoredSetup is
            // the belt to this suspender.
            <span className="inline-flex min-h-11 items-center font-semibold text-ink">
              {setup.symbol}
            </span>
          )
          : (
            <button
              aria-label={`Open ${setup.symbol} in Advisor`}
              className="link-accent inline-flex min-h-11 items-center font-semibold text-ink"
              type="button"
              onClick={() => nav.openAdvisor(setup)}
            >
              {setup.symbol}
            </button>
          )}
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
//
// §17n: the value steps to 18px below lg — 10px of the band's height across two
// rows — and the label does not move. The 12px .eyebrow is the kit's smallest
// label and legibility is what holds it there; the value is a figure with no
// smaller legible size worth the hierarchy it would cost.
function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-2xl font-semibold tabular-nums text-ink max-lg:text-lg">
        {value}
      </p>
      <p className="eyebrow">
        {label}
      </p>
    </div>
  );
}
