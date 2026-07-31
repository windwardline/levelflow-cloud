import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { MarketChart } from "../charts/MarketChart";
import { RecommendationPanel } from "./AdvisorRecommendationPanel";
import { TIMEFRAMES } from "./advisorFormat";
import { ConfidenceUnit } from "./ConfidenceUnit";
import { CurrentTradesRail } from "./CurrentTradesRail";
import { MarketScanPanel } from "./MarketScanPanel";
import { ScopeMenu } from "./ScopeMenu";
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
  type MarketScanResponse,
  scanMarketOpportunities,
  type TradeSetupRow,
} from "../../lib/tradeAnalyzer";

// Spec §3: mobile's bottom tab bar swaps between the same three columns the
// ≥lg Desk always shows at once. "review" is the stage (chart, ladder, why
// this setup), "scan" is the left rail (MarketScanPanel), "trades" is the
// right rail (CurrentTradesRail). Owned here, not by App.tsx, because these
// three names only ever mean something inside the Desk tab.
export type DeskMobileView = "review" | "scan" | "trades";

// Desktop (≥lg) is frozen: every column must go on rendering exactly as it
// always has, so lg:block/lg:flex apply unconditionally here regardless of
// which mobile tab is active — only the base (sub-lg) utility ever changes.
// Literal per-branch strings below, never the variant prefix and the
// utility split apart by a template-literal interpolation (C1): Tailwind
// v4's build-time scanner greps source text for complete,
// statically-analyzable class tokens, and a class name assembled that way
// never appears as a real "lg:block" or "lg:flex" substring anywhere in the
// source — so .lg\:block/.lg\:flex were never generated into the built CSS
// at all (confirmed absent from dist), and every column this helper gates
// was silently display:none at every width, rail included. Below lg,
// exactly one column is ever visible at a time, matching the mobile tab
// bar's own selection (spec §3); the CSS-only toggle (rather than
// conditionally mounting/unmounting the three columns) is what lets
// Review, Scan, and Trades share one AdvisorWorkspace instance and its
// state (symbol, scanResult, clockNow…) instead of remounting and losing
// it on every tab switch.
export function deskColumnClassName(
  isActiveOnMobile: boolean,
  display: "block" | "flex",
  className: string,
): string {
  const gating = display === "block"
    ? (isActiveOnMobile ? "block lg:block" : "hidden lg:block")
    : (isActiveOnMobile ? "flex lg:flex" : "hidden lg:flex");
  return `${gating} ${className}`;
}

type AdvisorWorkspaceProps = {
  // Which of the three columns is the sole visible one below lg (spec §3).
  // Ignored at ≥lg, where all three always render — see the className
  // helper below for exactly how that freeze is enforced.
  mobileView: DeskMobileView;
  // Bound to useTradeSetups' forceOutcomeRefresh path (App.tsx). Wired to
  // Desk-tab activation there and to CurrentTradesRail's own manual refresh
  // here — the rail never grows fetch machinery of its own (spec §8).
  onForceOutcomeRefresh: () => void;
  // App.tsx's setDeskMobileView, threaded down so an in-workspace action can
  // switch which mobile sub-view is showing (I3) — today that's selecting a
  // scan candidate, which should land the user on "review" to actually see
  // it, the same way App.tsx's own openAdvisor nav action does.
  onMobileViewChange: (view: DeskMobileView) => void;
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
    onMobileViewChange,
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
  const [scanResult, setScanResult] = useState<MarketScanResponse | null>(null);
  const [scanCompletedAt, setScanCompletedAt] = useState<Date | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning">("idle");
  const [clockNow, setClockNow] = useState(() => new Date());
  const requestIdRef = useRef(0);
  const selectedSymbolRef = useRef<SupportedSymbol>("EURUSD");

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

  return (
    // The Desk grid (spec §2): 264px scan rail / flexible stage / 300px
    // trades rail, all three the same height and each independently
    // scrollable — only at lg, where AdvisorWorkspace fills the fixed
    // "viewport minus header" shell App.tsx hands it (App.tsx's
    // grid-rows-[auto_1fr] + this flex-1 min-h-0). Below lg there's no
    // height constraint here at all, so the three wrapper elements just
    // stack in normal document flow — the pre-existing mobile behavior,
    // untouched until Task 9's mobile pass.
    <div className="grid min-w-0 gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[264px_minmax(0,1fr)_300px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      {/* Left rail: the scan. Task 4 replaces MarketScanPanel's internals;
          here it only moves into its own column. Below lg it is the "Scan"
          tab's entire content (spec §3); at ≥lg it always shows. */}
      <div
        className={deskColumnClassName(
          mobileView === "scan",
          "block",
          "scrolly min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-hairline lg:pr-4",
        )}
      >
        <MarketScanPanel
          onResetResult={() => {
            setScanResult(null);
            setScanCompletedAt(null);
          }}
          onScan={scanMarkets}
          onSelectCandidate={(candidate) => {
            selectSymbolForReview(candidate.symbol);
            // I3: tapping a scan row is a decisive "go look at this" action
            // (unlike scoping the scan itself), so on mobile it also jumps
            // to the review column — otherwise the user stays parked on
            // "Scan" and never sees what selecting the row actually did.
            onMobileViewChange("review");
            if (candidate.setup) {
              setAnalysisState({
                response: {
                  advisoryOnly: true,
                  message: "Selected from Market Scan.",
                  setup: candidate.setup,
                },
                // No review ran here — this setup came out of a scan that may
                // have completed long before the row was clicked, so there is
                // no review time to claim. The stagehead's meta line shows the
                // setup's expiry alone until Review market actually runs.
                reviewedAt: null,
                symbol: candidate.symbol,
              });
              setAdvisorNotice(
                "Selected from Market Scan. Review market refreshes the same rules and saves the current setup.",
              );
            }
          }}
          onSelectSymbol={selectSymbolForReview}
          result={scanResult}
          scanCompletedAt={scanCompletedAt}
          selectedSymbol={symbol}
          status={scanStatus}
        />
      </div>

      {/* Center stage (spec §16, a-desk-v3.html:161-213): stagehead — the
          market picker rendered as the display heading, its side tag, and the
          confidence unit under it, with the chart-view control and the one
          primary action (Review market) opposite — then the chart sheet, then
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
          child below is pinned shrink-0. Below lg this is the "Review" tab's
          entire content (spec §3); at ≥lg it always shows. */}
      <div
        className={deskColumnClassName(
          mobileView === "review",
          "flex",
          "scrolly min-w-0 flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",
        )}
      >
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
              <select
                aria-label="Chart view"
                className="min-h-11 rounded-lg border border-ink bg-transparent px-3 text-sm font-semibold text-ink"
                value={timeframe}
                onChange={(event) => {
                  setTimeframeTouched(true);
                  setTimeframe(event.target.value as ChartTimeframe);
                }}
              >
                {TIMEFRAMES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                Review market
              </button>
            </div>
          </div>

          {/* MarketChart draws the chart sheet itself — square-cornered
              hairline border on sheet — so the setup sheet below can attach to
              it border-t-0 with no second frame in between. */}
          <MarketChart
            data={marketData?.points ?? []}
            loading={marketLoading}
            setup={setup}
            viewKey={`${symbol}:${timeframe}`}
          />

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
          demand via the rail's own manual control; no fetch logic lives
          here. Below lg this is the "Trades" tab's entire content (spec
          §3); at ≥lg it always shows.
          This column is the surface's frame (a-desk-v3.html:56 `.railR`):
          left hairline, the mock's sheet-over-paper tint, and its 16px
          inset — CurrentTradesRail itself draws no panel, so the tint has to
          live here or nowhere. lg:-gated with the rest of the column
          geometry, since below lg the rail is a full-width tab, not a rail. */}
      <aside
        className={deskColumnClassName(
          mobileView === "trades",
          "flex",
          "scrolly min-w-0 flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-hairline lg:bg-[color-mix(in_srgb,var(--color-sheet)_55%,var(--color-paper))] lg:pl-4 lg:pr-4",
        )}
      >
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
