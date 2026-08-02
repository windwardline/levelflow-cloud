import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ExpandedChartOverlay } from "../charts/ExpandedChartOverlay";
import { MarketChart } from "../charts/MarketChart";
import { RecommendationPanel } from "./AdvisorRecommendationPanel";
import { TIMEFRAMES } from "./advisorFormat";
import { buildConfidenceMeta, ConfidenceUnit } from "./ConfidenceUnit";
import { CurrentTradesRail } from "./CurrentTradesRail";
import {
  MOBILE_FRAME,
  MOBILE_FRAME_PINNED,
  MOBILE_FRAME_SCROLL,
} from "../mobileFrame";
import { useIsMobileViewport } from "../../hooks/useMobileViewport";
import { MarketScanPanel, MarketScanResults } from "./MarketScanPanel";
import {
  filterSymbolsByAvailability,
  getMarketScanSymbolsForScope,
} from "./marketScanFilters";
import { type ScanScope, ScopeMenu } from "./ScopeMenu";
import { formatReopen, marketAvailability } from "../../lib/marketHours";
import {
  type ChartTimeframe,
  fetchMarketData,
  type MarketDataResponse,
} from "../../lib/marketData";
import type { UserProfile } from "../../lib/profile";
import {
  AVAILABLE_ASSET_OPTIONS,
  formatSecurityDisplaySymbol,
  getSecurityOption,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import {
  type AnalyzerResponse,
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
  // Q2-C2: threaded straight through to CurrentTradesRail, whose empty state is
  // otherwise a factual claim about an account the fetch failed to read.
  loadFailed: boolean;
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
  // only a scan that just returned its verdict about this market may set it
  // (adoptScanVerdict). A setup lifted out of an older scan row carries null:
  // that scan may have run an hour ago, and neither AnalyzerSetup nor
  // MarketScanCandidate carries a creation timestamp, so there is no honest
  // review time to print. The stamp is then simply absent rather than
  // asserting a review that did not happen at the moment shown.
  reviewedAt: number | null;
  response: AnalyzerResponse | null;
  symbol: SupportedSymbol;
};

export function AdvisorWorkspace(
  {
    loadFailed,
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
  // The scan scope lives here rather than inside the rail: spec §17e's merged
  // mobile surface fires the same scan from its own control row, and the scope
  // is what decides which markets that one Scan covers — one, a group, or all.
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
    setAnalysisState(null);
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

  // What "the stage follows the Scan column" is made of: the scope menu's own
  // symbol selection and a scan-row click both land here (spec §4: selecting a
  // symbol "drives the advisor selection like clicking a scan row does today").
  // Below, selectCandidate calls this too, then layers the candidate's own setup
  // on top when it has one — clicking a scan row without an attached setup
  // reduces to exactly this.
  function selectSymbolForReview(nextSymbol: SupportedSymbol) {
    requestIdRef.current += 1;
    selectedSymbolRef.current = nextSymbol;
    setSymbol(nextSymbol);
    setAnalysisState(null);
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

  // Spec §17m.1: the stage generates nothing, so a finished scan is what puts
  // a setup on it. The market on screen adopts THIS scan's verdict about
  // itself — and only about itself:
  //   qualified        → its setup, stamped with the scan that just produced it
  //   attempted, no setup → no setup, and the engine's own reason
  //   not in this scan → left exactly as it was
  // The stamp is honest in the first case for the same reason it is null when
  // an old scan row is clicked (selectCandidate): this scan ran against live
  // data moments ago, that one may have run an hour before the click.
  // Returns whether this scan had a verdict about the market on screen, so the
  // caller knows whether the visible chart is now behind the data the verdict
  // was built on.
  function adoptScanVerdict(result: MarketScanResponse) {
    const shownSymbol = selectedSymbolRef.current;
    const qualified = result.opportunities.find(
      (candidate) => candidate.symbol === shownSymbol,
    );
    if (qualified?.setup) {
      setAnalysisState({
        response: { advisoryOnly: true, setup: qualified.setup },
        reviewedAt: Date.now(),
        symbol: shownSymbol,
      });
      return true;
    }
    const blocked = result.blocked.find(
      (candidate) => candidate.symbol === shownSymbol,
    );
    if (!blocked) {
      // The parity guard (core.test.ts) proves the menu and the scan universe
      // are the same 50 symbols, so the only path here is availability
      // filtering a closed market out of a group scan — and a market this
      // scan never looked at keeps its stage exactly as it was.
      return false;
    }
    setAnalysisState({
      response: { advisoryOnly: true, blocked: true, reason: blocked.reason },
      reviewedAt: Date.now(),
      symbol: shownSymbol,
    });
    return true;
  }

  async function scanMarkets(symbols: SupportedSymbol[] = []) {
    // An empty list means "all markets": the server applies its curated
    // default universe (markets with measured model edge).
    const scanSymbols = symbols.length > 0 ? symbols : undefined;
    // Not a bump — a reading. Any selection change while this scan is in
    // flight (a scan row click, a scope change, an Insights cross-link) moves
    // requestIdRef, and adopting a verdict about the market the reader has
    // since left is the staleness this guards against.
    const requestId = requestIdRef.current;
    setScanStatus("scanning");
    try {
      const nextResult = await scanMarketOpportunities(scanSymbols);
      setScanResult(nextResult);
      if (requestIdRef.current === requestId && adoptScanVerdict(nextResult)) {
        // The engine analyzed live provider data server-side moments ago;
        // re-fetching the chart for the market that just took this scan's
        // verdict keeps what the reader sees in step with the bars the levels
        // were built on. Only when there WAS a verdict — a scan of another
        // group leaves this market, and its chart, alone.
        setRefreshNonce((value) => value + 1);
      }
      // Every qualifying setup is written server-side (spec §17m.2), so the
      // history the rest of the app reads has just changed.
      onSetupsChanged();
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

  // Spec §17e, "one surface, one verb", now with §17m.1's single door behind
  // it: the merged mobile surface offers one Scan button and it sends the same
  // scan_opportunities request the ≥lg rail's button sends. The scope decides
  // WHAT the scan covers — one market, a group, or all of them — never which
  // engine path runs it. Reviewing one market is still possible, and this is
  // still the way to do it; it just no longer reaches a second endpoint with
  // its own origin value, its own dedupe rules and its own exemption from the
  // placed-position guard. One rule for availability too, and it is the rail's
  // own: nothing to scan, or a scan already running.
  const scanDisabled = scanStatus === "scanning" || openScanSymbols.length === 0;

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
        // No review ran at this moment — this setup came out of a scan that may
        // have completed long before the row was clicked, so there is no review
        // time to claim. The head's meta line shows the setup's expiry alone
        // until a scan runs against this market again (adoptScanVerdict).
        reviewedAt: null,
        symbol: candidate.symbol,
      });
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
        marketName={formatSecurityDisplaySymbol(symbol)}
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

  // The Desk's page heading, and the only surface heading in the app that is not
  // drawn: the mock puts no title here (§16 deleted the one that used to exist),
  // but every other authed surface carries an h1, so heading-level navigation —
  // how many screen reader users move around a page — found nothing at all on the
  // app's primary surface. One element, placed by whichever branch renders, so
  // the Desk can never end up with two headings or with none.
  const deskTitle = <h1 className="sr-only">Desk</h1>;

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
        {deskTitle}
        <div
          className={mobileView === "scan" ? MOBILE_FRAME : "hidden"}
          data-testid="mobile-scan-surface"
        >
          <div className={MOBILE_FRAME_PINNED}>
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
                disabled={scanDisabled}
                onClick={() => scanMarkets(openScanSymbols)}
              >
                {scanStatus === "scanning"
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
              {/* A real heading, not a styled span: below lg this market IS the
                  surface, and the scan rail's own "Scan" eyebrow — which used to
                  be this surface's only landmark, clipped for exactly that
                  reason — is ≥lg-only now. Heading semantics, the mock's type. */}
              <h2 className="min-w-0 truncate font-display text-[19px] font-bold tracking-[-0.02em] text-ink">
                {formatSecurityDisplaySymbol(symbol)}
              </h2>
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
              line, and the qualifying markets. The class string is the one every
              mobile surface shares since §17g (../mobileFrame), tab-bar
              clearance included. */}
          <div
            ref={mobileScrollRef}
            className={MOBILE_FRAME_SCROLL}
            data-testid="mobile-scan-scroll"
          >
            <RecommendationPanel
              result={activeResult}
              setup={setup}
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
            Desk's right column carries, inside the same fixed frame the Scan
            surface uses — spec §17g pins the rail's header and scrolls the cards
            list under it, so `fixedFrame` tells the rail which of its two shapes
            to draw. */}
        <aside className={mobileView === "trades" ? MOBILE_FRAME : "hidden"}>
          <CurrentTradesRail
            fixedFrame
            isActiveOnMobile={mobileView === "trades"}
            loadFailed={loadFailed}
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
      {/* .sr-only is position:absolute, so this consumes no grid cell. */}
      {deskTitle}
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
          market name as the display heading, its side tag, and the confidence
          unit under it, with the chart-view control opposite — then the chart
          sheet, then the setup sheet attached hairline-flush beneath it. No
          surface title, no status tiles, no session cards, no metric cards, no
          action: that furniture is what the owner rejected as box-on-box, and
          tests/deskComposition.test.ts pins its absence — so the retired
          component and card names appear nowhere in this file, comments
          included.

          Spec §17m.3, the vertical budget: the stage is a flex column exactly
          the region's height, and the three parts divide it rather than stacking
          past it — stagehead at its natural height, chart at ~1/3 (basis-[30%],
          grow-0/shrink-0, so it is a share of the region and not a fixed pixel
          height that fits one viewport), and the setup sheet taking the whole
          remainder, which is the majority and belongs to the ladder. The sheet
          is what scrolls when its own content is taller than that remainder, so
          the stage itself never has to — and the column keeps its own
          overflow-y-auto as the last resort at an edge viewport, exactly as the
          ruling allows. */}
      <div className="scrolly min-w-0 flex-col gap-5 lg:flex lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1">
        <section className="min-w-0 shrink-0 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
          <div className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1">
                {/* Spec §17m.1: the stage is a pure display of the Scan
                    column's selection, so this is a heading and nothing else —
                    the picker that used to live here is deleted with the Review
                    button beside it, and the rail's scope menu (which carries
                    single markets) is the one place a market is chosen. Same
                    element the merged mobile head draws, at the stage's scale.
                    `shrink-0 whitespace-nowrap` is §17's "the stagehead must
                    never truncate the market name": the row it sits in wraps,
                    so a long name pushes the chart-view control to a second
                    line instead of clipping. */}
                <h2 className="shrink-0 whitespace-nowrap font-display text-2xl font-bold text-ink">
                  {formatSecurityDisplaySymbol(symbol)}
                </h2>
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
              {/* The stage's one remaining control (spec §17m.1: the timeframe
                  select stays, display-only). The visible "Chart view" caption
                  is gone with the rest of the stage's form chrome; the
                  aria-label carries the same name (and is the e2e contract for
                  this control). */}
              <ChartViewSelect
                className="min-h-11 rounded-lg border border-ink bg-transparent px-3 text-sm font-semibold text-ink"
                value={timeframe}
                onSelect={selectTimeframe}
              />
            </div>
          </div>

          {/* MarketChart draws the chart sheet itself — square-cornered
              hairline border on sheet — so the setup sheet below can attach to
              it border-t-0 with no second frame in between. `fill` hands the
              height to this wrapper (spec §17m.3's ~1/3 share) instead of the
              chart's own fixed 500/560px, which was most of the region on a
              laptop and pushed the ladder off the bottom. */}
          <div className="min-h-0 shrink-0 grow-0 basis-[30%]">
            <MarketChart
              data={marketData?.points ?? []}
              fill
              loading={marketLoading}
              onExpand={() => setChartExpanded(true)}
              setup={setup}
              viewKey={`${symbol}:${timeframe}`}
            />
          </div>

          {/* Spec §17's Expand chart overlay, built once above and rendered by
              both compositions. It mounts a SECOND MarketChart with the same
              props rather than moving the mounted one, which would tear down the
              canvas and leave the inline container empty behind the dialog.
              Since §17m.3 its trigger renders at every width: "the small inline
              chart is the frame; the overlay is how you see a big one." */}
          {chartOverlay}

          {/* The remainder of the budget, and the ladder's majority share: the
              sheet takes everything the stagehead and the chart did not, and
              scrolls inside itself if the ladder plus the why panel are taller
              than that. Thin scrollbars via .scrolly, the same treatment every
              other scroll region in the app uses. */}
          <div className="scrolly min-w-0 border border-hairline border-t-0 bg-sheet lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <RecommendationPanel
              result={activeResult}
              setup={setup}
              symbol={symbol}
            />
          </div>

          {/* I4/spec §10b: the closed-market reopen notice, in its standing
              position as the stage's last element. Rendered only when there is
              a notice — an empty paragraph would leave its own margin behind
              on every successful load. shrink-0 so the budget above never
              squeezes it out of the column it belongs to. */}
          {marketNotice
            ? (
              <p className="mt-3 shrink-0 text-sm font-medium text-ink-muted">
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
            loadFailed={loadFailed}
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
