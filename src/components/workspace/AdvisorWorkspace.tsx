import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ExpandedChartOverlay } from "../charts/ExpandedChartOverlay";
import { MarketChart } from "../charts/MarketChart";
import { RecommendationPanel } from "./AdvisorRecommendationPanel";
import { TIMEFRAMES } from "./advisorFormat";
import { buildConfidenceMeta, ConfidenceUnit } from "./ConfidenceUnit";
import { CurrentTradesRail } from "./CurrentTradesRail";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import { MarketScanPanel, MarketScanResults } from "./MarketScanPanel";
import {
  filterSymbolsByAvailability,
  getMarketScanSymbolsForScope,
} from "./marketScanFilters";
import { type ScanScope, ScopeMenu, scopeTriggerLabel } from "./ScopeMenu";
import { formatReopen, marketAvailability } from "../../lib/marketHours";
import {
  type ChartTimeframe,
  fetchMarketData,
  type MarketDataResponse,
} from "../../lib/marketData";
import type { UserProfile } from "../../lib/profile";
import {
  AVAILABLE_ASSET_OPTIONS,
  formatSecurityLabel,
  getSecurityOption,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import {
  type AnalyzerResponse,
  generateTradeSetup,
  type MarketScanCandidate,
  type MarketScanResponse,
  scanMarketOpportunities,
  type TradeSetupRow,
} from "../../lib/tradeAnalyzer";

// Spec §17e: mobile's bottom tab bar is THREE tabs, and the Desk owns two of
// them. "scan" is the merged surface (m-scan-v3.html) — one surface, one verb:
// the controls, the market head, the chart, the ladder, the why line and the
// qualifying markets, all of it; "trades" is CurrentTradesRail. The old
// "review" sub-view is gone, merged into "scan", so a mobile reader never has
// to hold two tabs in their head to read one setup. Owned here, not by App.tsx,
// because these names only ever mean something inside the Desk tab.
export type DeskMobileView = "scan" | "trades";

type AdvisorWorkspaceProps = {
  // Which of the Desk's two mobile surfaces is showing below lg (spec §17e).
  // Ignored at ≥lg, where the three-column shell renders instead.
  mobileView: DeskMobileView;
  // Bound to useTradeSetups' forceOutcomeRefresh path (App.tsx). Wired to
  // Desk-tab activation there and to CurrentTradesRail's own manual refresh
  // here — the rail never grows fetch machinery of its own (spec §8).
  onForceOutcomeRefresh: () => void;
  // Called once the effect below has applied openRequest, so the caller
  // (App) can clear it. AdvisorWorkspace unmounts whenever its tab isn't
  // active, so without this the same request would still be sitting there
  // on the next mount and would re-apply itself over a symbol the user
  // picked in the meantime.
  onOpenRequestHandled?: () => void;
  onSetupsChanged: () => void;
  // A cross-link elsewhere in the app (Insights, Profile) asked to open a
  // specific market here. token is a nonce so requesting the same symbol
  // twice in a row still re-selects it.
  openRequest?: { symbol: string; token: number } | null;
  profile: UserProfile;
  setups: TradeSetupRow[];
};

type AnalysisState = {
  // When a review actually ran against this symbol, epoch milliseconds — the
  // provenance behind the stagehead's "Reviewed {time}" stamp (spec §16), so
  // only analyze() may set it. A setup lifted straight out of a scan result
  // carries null: that scan may have run an hour ago, and neither
  // AnalyzerSetup nor MarketScanCandidate carries a creation timestamp, so
  // there is no honest review time to print. The stamp is then simply absent
  // rather than asserting a review that did not happen at the moment shown.
  reviewedAt: number | null;
  response: AnalyzerResponse | null;
  symbol: SupportedSymbol;
};

export function AdvisorWorkspace(
  {
    mobileView,
    onForceOutcomeRefresh,
    onOpenRequestHandled,
    onSetupsChanged,
    openRequest,
    profile,
    setups,
  }: AdvisorWorkspaceProps,
) {
  const [symbol, setSymbol] = useState<SupportedSymbol>("EURUSD");
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(
    profile.defaultTimeframe,
  );
  const [timeframeTouched, setTimeframeTouched] = useState(false);
  const [marketData, setMarketData] = useState<MarketDataResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketNotice, setMarketNotice] = useState("Loading market context.");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [analysisState, setAnalysisState] = useState<AnalysisState | null>(
    null,
  );
  const [analyzerStatus, setAnalyzerStatus] = useState<"idle" | "analyzing">(
    "idle",
  );
  const [advisorNotice, setAdvisorNotice] = useState("");
  // The scan scope lives here rather than inside the rail: spec §17e's merged
  // mobile surface fires the same scan from its own control row, and the one
  // verb it offers ("Scan") reads the scope to decide whether this run is a
  // review of one market or a scan of many.
  const [scope, setScope] = useState<ScanScope>({ kind: "all" });
  const [scanResult, setScanResult] = useState<MarketScanResponse | null>(null);
  const [scanCompletedAt, setScanCompletedAt] = useState<Date | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning">("idle");
  const [clockNow, setClockNow] = useState(() => new Date());
  // Spec §17's mobile Expand chart. Owned here rather than inside MarketChart
  // because the overlay mounts a second chart of its own: a component cannot
  // render another instance of itself without the recursion reading as a
  // puzzle, and the stage already holds every prop both instances need.
  const [chartExpanded, setChartExpanded] = useState(false);
  const requestIdRef = useRef(0);
  const selectedSymbolRef = useRef<SupportedSymbol>("EURUSD");
  // The merged mobile surface's single scrolling region (spec §17e). Held as a
  // ref so selecting another market can return the reader to the top of it —
  // null at ≥lg, where the region does not exist and nothing scrolls but the
  // columns themselves.
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  // Which composition this Desk is: the merged mobile surface, or the ≥lg
  // three-column shell. A JS check rather than CSS because the two are not
  // restylings of each other — mobile pins a control row, a market head and the
  // chart above ONE scrolling region, and no reordering of the desktop DOM
  // produces those two boxes. Rendering one (not both, CSS-hidden) is what
  // keeps a single "Scan scope" trigger, one chart canvas, and one accessible
  // name per control at every width.
  const isMobile = useIsMobileViewport();

  // I5: never sent straight to the server — a closed market has no chance of
  // qualifying and would only inflate the server's `scanned` count with markets
  // that were never really attempted. Computed fresh on every render rather
  // than memoized (same reasoning as ScopeMenu.tsx's own clock: a `new Date()`
  // dependency would defeat a memo anyway) so a scan fired right on a market's
  // open/close boundary still sees the current answer.
  const openScanSymbols = filterSymbolsByAvailability(
    getMarketScanSymbolsForScope(scope),
    new Date(),
  );
  const selectedAsset = getSecurityOption(symbol);
  const activeResult = analysisState?.symbol === symbol
    ? analysisState.response
    : null;
  const setup = activeResult?.setup ?? null;
  // The stagehead's confidence meta line says when this review ran, alongside
  // the setup's own expiry (spec §16 folds both into one quiet line in place of
  // the deleted metric card). Read straight off the analysis state so a
  // scan-selected setup — which has no review of its own yet — prints no review
  // stamp at all; ConfidenceUnit drops the missing half rather than filling it.
  // The stored value is epoch milliseconds; formatTimestamp works on the same
  // ISO strings every other timestamp on this surface arrives from the server
  // as.
  const reviewedAt = analysisState?.symbol === symbol && analysisState.reviewedAt
    ? new Date(analysisState.reviewedAt).toISOString()
    : null;
  // The merged mobile head renders the stamp itself (the compact confidence
  // cluster is the score and its meter alone, per m-scan-v3.html:22-27), so it
  // reads the same builder the full unit does rather than a second grammar.
  const confidenceMeta = setup
    ? buildConfidenceMeta(reviewedAt, setup.expiresAt ?? null)
    : "";

  useEffect(() => {
    if (!timeframeTouched) {
      setTimeframe(profile.defaultTimeframe);
    }
  }, [profile.defaultTimeframe, timeframeTouched]);

  useEffect(() => {
    selectedSymbolRef.current = symbol;
  }, [symbol]);

  useEffect(() => {
    const requestedSymbol = openRequest?.symbol;
    if (!requestedSymbol) {
      return;
    }
    const isAvailable = AVAILABLE_ASSET_OPTIONS.some(
      (option) => option.symbol === requestedSymbol,
    );
    if (!isAvailable) {
      // Consume the request even though it can't be applied — mirrors
      // HistoryPanel's initialSymbol handling (HistoryPanel.tsx:87-92).
      // Without this, a symbol outside the menu leaves openRequest set
      // forever and re-fires this effect on every later Advisor mount.
      // Selection is left untouched.
      onOpenRequestHandled?.();
      return;
    }
    requestIdRef.current += 1;
    selectedSymbolRef.current = requestedSymbol;
    setSymbol(requestedSymbol);
    setAnalyzerStatus("idle");
    setAnalysisState(null);
    setAdvisorNotice("");
    onOpenRequestHandled?.();
  }, [onOpenRequestHandled, openRequest?.symbol, openRequest?.token]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketData() {
      setMarketLoading(true);
      setMarketNotice("Loading market context.");

      try {
        const nextData = await fetchMarketData({
          symbol,
          timeframe,
        });
        if (!cancelled) {
          setMarketData(nextData);
          // Nothing to say on success: spec §2's copy discipline rules out
          // process narration, and the chart itself is the evidence that the
          // data arrived (its own overlay covers the loading and empty
          // states). This notice now speaks only when something is genuinely
          // worth telling the reader — a closed market, or missing data.
          setMarketNotice("");
        }
      } catch {
        if (!cancelled) {
          setMarketData(null);
          // I4/spec §10b: a closed market's own quiet reopen notice replaces
          // the generic chart error — `symbol` (not the outer `selectedAsset`)
          // is read directly here since it's already an effect dependency,
          // so this needs no extra one to stay lint-clean.
          const availability = marketAvailability(
            getSecurityOption(symbol).assetType,
            symbol,
            new Date(),
          );
          setMarketNotice(
            availability.open
              ? "Verified market data is not available for this market yet."
              : `Closed · opens ${
                formatReopen(availability.opensAt, new Date())
              }.`,
          );
        }
      } finally {
        if (!cancelled) {
          setMarketLoading(false);
        }
      }
    }

    loadMarketData();

    return () => {
      cancelled = true;
    };
  }, [refreshNonce, symbol, timeframe]);

  // Direct-review shortcut shared by the stage's own market picker and the
  // scan scope menu's symbol selection (spec §4: selecting a symbol "drives
  // the advisor selection like clicking a scan row does today"). Below,
  // onSelectCandidate calls this too, then layers the candidate's own setup
  // on top when it has one — clicking a scan row without an attached setup
  // reduces to exactly this.
  function selectSymbolForReview(nextSymbol: SupportedSymbol) {
    requestIdRef.current += 1;
    selectedSymbolRef.current = nextSymbol;
    setSymbol(nextSymbol);
    setAnalyzerStatus("idle");
    setAnalysisState(null);
    setAdvisorNotice("");
  }

  // Every scope change, from either platform's control row. The engine never
  // runs without an explicit click, so changing scope clears the previous
  // result rather than re-running: stale counts can never describe a different
  // symbol set. A single market additionally drives the stage selection
  // (spec §4).
  function selectScope(nextScope: ScanScope) {
    setScope(nextScope);
    setScanResult(null);
    setScanCompletedAt(null);
    if (nextScope.kind === "symbol") {
      selectSymbolForReview(nextScope.symbol);
    }
  }

  async function analyze() {
    const requestedSymbol = selectedSymbolRef.current;
    const requestedLabel = formatSecurityLabel(requestedSymbol);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setAnalyzerStatus("analyzing");
    setAdvisorNotice(`Analyzing ${requestedLabel}.`);
    // The engine always analyzes live provider data server-side; refreshing
    // the visible chart at the same moment keeps what the user sees in
    // step with the data the setup was built on.
    setRefreshNonce((value) => value + 1);
    setAnalysisState({
      response: null,
      reviewedAt: Date.now(),
      symbol: requestedSymbol,
    });
    if (requestedSymbol !== symbol) {
      setSymbol(requestedSymbol);
    }

    try {
      const nextResult = await generateTradeSetup(requestedSymbol);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setAnalysisState({
        response: nextResult,
        reviewedAt: Date.now(),
        symbol: requestedSymbol,
      });
      if (nextResult.setup) {
        setAdvisorNotice(
          nextResult.deduplicated
            ? `${requestedLabel} current setup refreshed.`
            : `${requestedLabel} limit setup saved.`,
        );
        onSetupsChanged();
      } else {
        setAdvisorNotice(
          nextResult.reason ??
            `No current ${requestedLabel} limit setup passed review.`,
        );
        onSetupsChanged();
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setAnalysisState({
          response: null,
          reviewedAt: Date.now(),
          symbol: requestedSymbol,
        });
        setAdvisorNotice(
          `Market context is refreshing for ${requestedLabel}. Try again shortly.`,
        );
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setAnalyzerStatus("idle");
      }
    }
  }

  async function scanMarkets(symbols: SupportedSymbol[] = []) {
    // An empty list means "all markets": the server applies its curated
    // default universe (markets with measured model edge).
    const scanSymbols = symbols.length > 0 ? symbols : undefined;
    setScanStatus("scanning");
    try {
      setScanResult(await scanMarketOpportunities(scanSymbols));
    } catch {
      setScanResult({
        advisoryOnly: true,
        blocked: [],
        failed: true,
        opportunities: [],
        qualified: 0,
        scanned: 0,
      });
    } finally {
      setScanCompletedAt(new Date());
      setScanStatus("idle");
    }
  }

  // Spec §17e, "one surface, one verb": the merged mobile surface offers a
  // single Scan button, and the scope decides what that click means — a review
  // when the scope is one market, a scan when it is a group or All. Neither path
  // is new or altered: both are the same two functions the ≥lg Desk's own
  // "Review" and "Scan now" have always called, with every behavior contract
  // (fresh data on every run, the server-side placed-guard, confidence-desc
  // results, scan persistence) untouched.
  const scopeActionIsReview = scope.kind === "symbol";
  const scopeActionBusy = scopeActionIsReview
    ? analyzerStatus === "analyzing"
    : scanStatus === "scanning";
  // Each path keeps its own disabled rule rather than inheriting a merged one:
  // a review waits on the chart load it refreshes, and a scan cannot run with
  // nothing open to scan.
  const scopeActionDisabled = scopeActionIsReview
    ? analyzerStatus === "analyzing" || marketLoading
    : scanStatus === "scanning" || openScanSymbols.length === 0;

  async function runScopeAction() {
    if (scopeActionIsReview) {
      await analyze();
      return;
    }
    await scanMarkets(openScanSymbols);
  }

  function selectTimeframe(nextTimeframe: ChartTimeframe) {
    setTimeframeTouched(true);
    setTimeframe(nextTimeframe);
  }

  // Tapping a qualifying market. Shared by both platforms: the stage (or, on
  // mobile, the head and chart above the list) follows the row, and the row's
  // own setup rides along when it has one.
  function selectCandidate(candidate: MarketScanCandidate) {
    selectSymbolForReview(candidate.symbol);
    if (candidate.setup) {
      setAnalysisState({
        response: {
          advisoryOnly: true,
          message: "Selected from Market Scan.",
          setup: candidate.setup,
        },
        // No review ran here — this setup came out of a scan that may have
        // completed long before the row was clicked, so there is no review time
        // to claim. The head's meta line shows the setup's expiry alone until
        // Review actually runs.
        reviewedAt: null,
        symbol: candidate.symbol,
      });
      setAdvisorNotice(
        "Selected from Market Scan. Review refreshes the same rules and saves the current setup.",
      );
    }
    // The chart, the head and the ladder all sit ABOVE the list on the merged
    // mobile surface and have just swapped to this market, so the reader is
    // returned to them. A no-op at ≥lg, where the ref holds nothing.
    mobileScrollRef.current?.scrollTo({ top: 0 });
  }

  // Spec §17: the same MarketChart full-viewport, with its level lines and its
  // own theme reactivity. Held in one place and rendered by both compositions:
  // the trigger that sets this state is mobile-only (MarketChart gates it
  // lg:hidden), so at ≥lg this is always null.
  const chartOverlay = chartExpanded
    ? (
      <ExpandedChartOverlay
        marketName={scopeTriggerLabel({ kind: "symbol", symbol }, "heading")}
        onClose={() => setChartExpanded(false)}
      >
        <MarketChart
          data={marketData?.points ?? []}
          fill
          loading={marketLoading}
          setup={setup}
          viewKey={`${symbol}:${timeframe}`}
        />
      </ExpandedChartOverlay>
    )
    : null;

  if (isMobile) {
    // The merged mobile Scan surface (spec §17e, m-scan-v3.html): a fixed
    // viewport — App.tsx hands this a flex column exactly "viewport minus
    // header" tall — with the controls, the market head and the compact chart
    // PINNED, and one scrolling region under them carrying the ladder, the why
    // line, the count line and the qualifying markets. Both mobile surfaces
    // stay mounted and toggle by display, so flipping to Trades and back keeps
    // this surface's chart canvas and every piece of its state alive.
    return (
      <>
        <div
          className={mobileView === "scan"
            ? "flex min-h-0 flex-1 flex-col"
            : "hidden"}
          data-testid="mobile-scan-surface"
        >
          <div className="shrink-0 px-4 pt-3">
            {/* m-scan-v3.html:76-80: scope · timeframe · Scan, one row. */}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ScopeMenu
                  label="Scan scope"
                  showLabel={false}
                  value={scope}
                  onSelect={selectScope}
                />
              </div>
              <ChartViewSelect
                className="min-h-11 shrink-0 rounded-lg border border-hairline bg-sheet px-2.5 text-[12.5px] font-bold text-ink"
                value={timeframe}
                onSelect={selectTimeframe}
              />
              <button
                className="primary-button shrink-0 px-4 py-2 text-[13px]"
                type="button"
                disabled={scopeActionDisabled}
                onClick={runScopeAction}
              >
                {scopeActionBusy
                  ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )
                  : null}
                Scan
              </button>
            </div>

            {/* The market head (m-scan-v3.html:81-85): the market, its side tag,
                and the compact confidence cluster right-aligned. The name is a
                heading-scale label rather than a second picker — the scope menu
                above IS the picker on this surface. */}
            <div className="mt-3 flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate font-display text-[19px] font-bold tracking-[-0.02em] text-ink">
                {scopeTriggerLabel({ kind: "symbol", symbol }, "heading")}
              </span>
              {setup
                ? (
                  <span
                    className={setup.side === "buy"
                      ? "shrink-0 text-xs font-bold uppercase text-buy"
                      : "shrink-0 text-xs font-bold uppercase text-sell"}
                  >
                    {setup.side === "buy" ? "Buy" : "Sell"} limit
                  </span>
                )
                : null}
              {setup
                ? (
                  <ConfidenceUnit
                    assetType={selectedAsset.assetType}
                    compact
                    score={setup.confidenceScore}
                  />
                )
                : null}
            </div>
            {/* §17's stamp, the one thing in the head's cluster the surface
                cannot show for itself. Same grammar as ≥lg — the same builder
                the full ConfidenceUnit uses, so the two can never drift. */}
            {confidenceMeta
              ? (
                <p className="mt-1 font-mono text-[11px] leading-4 text-ink-muted">
                  {confidenceMeta}
                </p>
              )
              : null}

            <div className="mt-1.5">
              <MarketChart
                data={marketData?.points ?? []}
                loading={marketLoading}
                onExpand={() => setChartExpanded(true)}
                setup={setup}
                viewKey={`${symbol}:${timeframe}`}
              />
            </div>
          </div>

          {/* The only scroll on this surface (m-scan-v3.html:32): the ladder's
              copy rows, the one-line why plus its Why disclosure, the count
              line, and the qualifying markets. pb-24 is the fixed tab bar's own
              clearance, the same reserve every other surface gives it. */}
          <div
            ref={mobileScrollRef}
            className="scrolly min-h-0 flex-1 overflow-y-auto px-4 pb-24"
            data-testid="mobile-scan-scroll"
          >
            <RecommendationPanel
              notice={advisorNotice}
              result={activeResult}
              setup={setup}
              status={analyzerStatus}
              symbol={symbol}
            />
            <MarketScanResults
              onSelectCandidate={selectCandidate}
              result={scanResult}
              scanCompletedAt={scanCompletedAt}
              scope={scope}
              selectedSymbol={symbol}
              status={scanStatus}
            />
            {marketNotice
              ? (
                <p className="mt-3 text-sm font-medium text-ink-muted">
                  {marketNotice}
                </p>
              )
              : null}
          </div>
        </div>

        {/* The Trades tab (spec §8 as a tab): the same rail component the ≥lg
            Desk's right column carries, on the ordinary scrolling page App.tsx
            gives every surface that is not this fixed one. */}
        <aside className={mobileView === "trades" ? "min-w-0" : "hidden"}>
          <CurrentTradesRail
            isActiveOnMobile={mobileView === "trades"}
            now={clockNow}
            onRefresh={onForceOutcomeRefresh}
            setups={setups}
          />
        </aside>

        {chartOverlay}
      </>
    );
  }

  return (
    // The Desk grid (spec §2): 264px scan rail / flexible stage / 300px
    // trades rail, all three the same height and each independently
    // scrollable, inside the fixed "viewport minus header" shell App.tsx hands
    // it (App.tsx's grid-rows-[auto_1fr] + this flex-1 min-h-0). This whole
    // composition is the ≥lg Desk and nothing else now: below lg the merged
    // mobile surface above renders instead, so the columns no longer carry the
    // base display utilities that used to gate them there.
    <div className="grid min-w-0 gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[264px_minmax(0,1fr)_300px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      {/* Left rail: the scan (a-desk-v3.html:87-158). */}
      <div className="scrolly min-w-0 lg:block lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-hairline lg:pr-4">
        <MarketScanPanel
          onScan={scanMarkets}
          onSelectCandidate={selectCandidate}
          onSelectScope={selectScope}
          openScanSymbols={openScanSymbols}
          result={scanResult}
          scanCompletedAt={scanCompletedAt}
          scope={scope}
          selectedSymbol={symbol}
          status={scanStatus}
        />
      </div>

      {/* Center stage (spec §16, a-desk-v3.html:161-213): stagehead — the
          market picker rendered as the display heading, its side tag, and the
          confidence unit under it, with the chart-view control and the one
          primary action (Review; spec §17) opposite — then the chart sheet, then
          the setup sheet attached hairline-flush beneath it. No surface title,
          no status tiles, no session cards, no metric cards, no second action:
          that furniture is what the owner rejected as box-on-box, and
          tests/deskComposition.test.ts pins its absence — so the retired
          component and card names appear nowhere in this file, comments
          included.
          flex-col rather than grid: an unconstrained grid's implicit auto
          rows shrink to fit the scroll container's height instead of
          overflowing it, which silently defeats the scrolling this column
          exists for. Flex only avoids the same trap because every direct
          child below is pinned shrink-0. */}
      <div className="scrolly min-w-0 flex-col gap-5 lg:flex lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1">
        <section className="min-w-0 shrink-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1">
                <ScopeMenu
                  label="Market"
                  showLabel={false}
                  symbolOnly
                  value={{ kind: "symbol", symbol }}
                  variant="heading"
                  onSelect={(nextScope) => {
                    // symbolOnly guarantees every selectable row (and thus
                    // every scope this can fire with) is symbol-kind - see
                    // ScopeMenu.tsx's effectiveRows.
                    if (nextScope.kind === "symbol") {
                      selectSymbolForReview(nextScope.symbol);
                    }
                  }}
                />
                {setup
                  ? (
                    <span
                      className={setup.side === "buy"
                        ? "shrink-0 text-[15px] font-bold uppercase text-buy"
                        : "shrink-0 text-[15px] font-bold uppercase text-sell"}
                    >
                      {setup.side === "buy" ? "Buy" : "Sell"} limit
                    </span>
                  )
                  : null}
              </div>
              {setup
                ? (
                  <ConfidenceUnit
                    assetType={selectedAsset.assetType}
                    reviewedAt={reviewedAt}
                    score={setup.confidenceScore}
                    validUntil={setup.expiresAt ?? null}
                  />
                )
                : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              {/* The visible "Chart view" caption is gone with the rest of the
                  stage's form chrome; the aria-label carries the same name
                  (and is the e2e contract for this control). */}
              <ChartViewSelect
                className="min-h-11 rounded-lg border border-ink bg-transparent px-3 text-sm font-semibold text-ink"
                value={timeframe}
                onSelect={selectTimeframe}
              />
              <button
                className="primary-button"
                type="button"
                disabled={analyzerStatus === "analyzing" || marketLoading}
                onClick={analyze}
              >
                {analyzerStatus === "analyzing"
                  ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )
                  : null}
                Review
              </button>
            </div>
          </div>

          {/* MarketChart draws the chart sheet itself — square-cornered
              hairline border on sheet — so the setup sheet below can attach to
              it border-t-0 with no second frame in between. */}
          <MarketChart
            data={marketData?.points ?? []}
            loading={marketLoading}
            onExpand={() => setChartExpanded(true)}
            setup={setup}
            viewKey={`${symbol}:${timeframe}`}
          />

          {/* Spec §17's Expand chart overlay, built once above and rendered by
              both compositions. It mounts a SECOND MarketChart with the same
              props rather than moving the mounted one, which would tear down the
              canvas and leave the inline container empty behind the dialog. Its
              trigger only exists below lg (MarketChart gates it lg:hidden), so
              at this width this is always null. */}
          {chartOverlay}

          <div className="min-w-0 border border-hairline border-t-0 bg-sheet">
            <RecommendationPanel
              notice={advisorNotice}
              result={activeResult}
              setup={setup}
              status={analyzerStatus}
              symbol={symbol}
            />
          </div>

          {/* I4/spec §10b: the closed-market reopen notice, in its standing
              position as the stage's last element. Rendered only when there is
              a notice — an empty paragraph would leave its own margin behind
              on every successful load. */}
          {marketNotice
            ? (
              <p className="mt-3 text-sm font-medium text-ink-muted">
                {marketNotice}
              </p>
            )
            : null}
        </section>
      </div>

      {/* Right rail: Current trades (spec §8) — live pending/open state,
          computed from setups+outcomes already loaded above. Force-refreshed
          on every Desk surface show (App.tsx's tab-activation effect) and on
          demand via the rail's own manual control; no fetch logic lives here.
          This column is the surface's frame (a-desk-v3.html:56 `.railR`):
          left hairline, the mock's sheet-over-paper tint, and its 16px
          inset — CurrentTradesRail itself draws no panel, so the tint has to
          live here or nowhere. lg:-gated with the rest of the column
          geometry, since the mobile Trades tab is a full-width surface, not a
          rail. */}
      <aside className="scrolly min-w-0 flex-col gap-5 lg:flex lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-hairline lg:bg-[color-mix(in_srgb,var(--color-sheet)_55%,var(--color-paper))] lg:pl-4 lg:pr-4">
        <div className="shrink-0">
          <CurrentTradesRail
            isActiveOnMobile={mobileView === "trades"}
            now={clockNow}
            onRefresh={onForceOutcomeRefresh}
            setups={setups}
          />
        </div>
      </aside>
    </div>
  );
}

// The chart-view control (spec §17: two-character timeframes), one component so
// the ≥lg stagehead and the merged mobile control row cannot drift in what they
// offer or in what they call it — the aria-label is the e2e contract for this
// control on both platforms. Only the geometry differs, and it arrives as a
// literal class string from each caller (C1: never an interpolated variant).
function ChartViewSelect({
  className,
  onSelect,
  value,
}: {
  className: string;
  onSelect: (timeframe: ChartTimeframe) => void;
  value: ChartTimeframe;
}) {
  return (
    <select
      aria-label="Chart view"
      className={className}
      value={value}
      onChange={(event) => onSelect(event.target.value as ChartTimeframe)}
    >
      {TIMEFRAMES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
