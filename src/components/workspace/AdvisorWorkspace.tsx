import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Clock3,
  Layers3,
  LineChart,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { MarketChart } from "../charts/MarketChart";
import { RecommendationPanel } from "./AdvisorRecommendationPanel";
import {
  DataHealthPanel,
  DeskStatusStrip,
  MarketClockPanel,
  MarketResultsPanel,
  RecentSetupsPanel,
} from "./AdvisorStatusPanels";
import {
  formatPrice,
  formatTimeframe,
  formatTimestamp,
  TIMEFRAMES,
} from "./advisorFormat";
import { CurrentTradesRail } from "./CurrentTradesRail";
import { MarketScanPanel } from "./MarketScanPanel";
import { ScopeMenu } from "./ScopeMenu";
import { VolatilityWindowPanel } from "./VolatilityWindowPanel";
import type { SecurityStat } from "../../hooks/useTradeSetups";
import { getGlobalSessions, getMarketClock } from "../../lib/marketSessions";
import {
  type ChartTimeframe,
  fetchMarketData,
  type MarketDataResponse,
} from "../../lib/marketData";
import type { UserProfile } from "../../lib/profile";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_OPTIONS,
  formatSecurityLabel,
  getSecurityOption,
  type SecurityType,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import {
  type AnalyzerResponse,
  generateTradeSetup,
  type MarketScanResponse,
  scanMarketOpportunities,
  type TradeSetupRow,
} from "../../lib/tradeAnalyzer";
import {
  advisorChartViewLabel,
  advisorExecutionIntervalLabel,
  advisorSignalIntervalLabel,
  reviewWindowLabel,
} from "../../lib/advisorReview";

// Spec §3: mobile's bottom tab bar swaps between the same three columns the
// ≥lg Desk always shows at once. "review" is the stage (chart, ladder, why
// this setup), "scan" is the left rail (MarketScanPanel), "trades" is the
// right rail (CurrentTradesRail). Owned here, not by App.tsx, because these
// three names only ever mean something inside the Desk tab.
export type DeskMobileView = "review" | "scan" | "trades";

// Desktop (≥lg) is frozen: every column must go on rendering exactly as it
// always has, so `lg:${display}` is unconditional here regardless of which
// mobile tab is active — only the base (sub-lg) utility ever changes. Below
// lg, exactly one column is ever visible at a time, matching the mobile tab
// bar's own selection (spec §3); the CSS-only toggle (rather than
// conditionally mounting/unmounting the three columns) is what lets Review,
// Scan, and Trades share one AdvisorWorkspace instance and its state
// (symbol, scanResult, clockNow…) instead of remounting and losing it on
// every tab switch.
export function deskColumnClassName(
  isActiveOnMobile: boolean,
  display: "block" | "flex",
  className: string,
): string {
  return `${isActiveOnMobile ? display : "hidden"} lg:${display} ${className}`;
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
  setupStats: SecurityStat[];
  setups: TradeSetupRow[];
};

type AnalysisState = {
  requestedAt: number;
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
    setupStats,
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
  const symbolStat = setupStats.find((stat) => stat.symbol === symbol);
  const activeMarketCount = AVAILABLE_ASSET_GROUPS.reduce(
    (sum, group) => sum + group.options.length,
    0,
  );
  const marketClock = useMemo(
    () => getMarketClock(symbol, profile.defaultTimezone, clockNow),
    [clockNow, profile.defaultTimezone, symbol],
  );
  const globalSessions = useMemo(
    () =>
      getGlobalSessions(
        profile.defaultTimezone,
        profile.preferredSession,
        clockNow,
      ),
    [clockNow, profile.defaultTimezone, profile.preferredSession],
  );

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
          setMarketNotice(
            `${nextData.resultsCount} ${
              formatTimeframe(timeframe)
            } candles loaded.`,
          );
        }
      } catch {
        if (!cancelled) {
          setMarketData(null);
          setMarketNotice(
            "Verified market data is not available for this market yet.",
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
      requestedAt: Date.now(),
      response: null,
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
        requestedAt: Date.now(),
        response: nextResult,
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
          requestedAt: Date.now(),
          response: null,
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
        blocked: [
          {
            assetType: "System",
            blocked: true,
            reason: "Market scan could not complete. Try again shortly.",
            symbol: "SCAN",
          },
        ],
        opportunities: [],
        qualified: 0,
        scanned: scanSymbols?.length ?? 0,
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
          "scrolly min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",
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
            if (candidate.setup) {
              setAnalysisState({
                requestedAt: Date.now(),
                response: {
                  advisoryOnly: true,
                  message: "Selected from Market Scan.",
                  setup: candidate.setup,
                },
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
          status={scanStatus}
        />
      </div>

      {/* Center stage: the market picker is the header — no surface title
          or eyebrow above it (spec §2 copy discipline) — then the chart,
          then the recommendation panel that used to sit in the sidebar.
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
        <section className="terminal-panel shrink-0 overflow-hidden">
          <div className="border-b border-hairline px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0 flex-1 sm:max-w-sm">
                <ScopeMenu
                  label="Market"
                  symbolOnly
                  value={{ kind: "symbol", symbol }}
                  onSelect={(nextScope) => {
                    // symbolOnly guarantees every selectable row (and thus
                    // every scope this can fire with) is symbol-kind - see
                    // ScopeMenu.tsx's effectiveRows.
                    if (nextScope.kind === "symbol") {
                      selectSymbolForReview(nextScope.symbol);
                    }
                  }}
                />
              </div>
              <button
                className="secondary-button min-h-10 px-3 py-2"
                type="button"
                onClick={() => setRefreshNonce((value) => value + 1)}
                disabled={marketLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${marketLoading ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                Refresh
              </button>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(200px,1fr)_auto]">
              <label className="grid gap-2 text-sm font-semibold text-ink">
                Chart view
                <select
                  aria-label="Advisor chart view"
                  className="field"
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
              </label>

              <div className="flex items-end">
                <button
                  className="primary-button w-full lg:min-w-48"
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
                    : <Brain className="h-4 w-4" aria-hidden="true" />}
                  Review market
                </button>
              </div>
            </div>

            <AdvisorReviewScope
              assetType={selectedAsset.assetType}
              timeframe={timeframe}
              validUntil={setup?.expiresAt ?? null}
            />

            <DeskStatusStrip
              analysisStatus={analyzerStatus}
              clockStatus={marketClock.statusLabel}
              latestClose={marketData?.latestClose ?? null}
              loading={marketLoading}
              result={activeResult}
              stat={symbolStat}
              symbol={symbol}
            />
          </div>

          <div className="p-4 sm:p-6">
            <MarketClockPanel clock={marketClock} sessions={globalSessions} />
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-muted">
                  {selectedAsset.assetType}
                </p>
                <h3 className="text-xl font-semibold tracking-normal text-ink">
                  {formatSecurityLabel(symbol)}
                </h3>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
                  Latest close
                </p>
                <p className="font-mono text-lg font-semibold tabular-nums tracking-normal text-ink">
                  {typeof marketData?.latestClose === "number"
                    ? formatPrice(symbol, marketData.latestClose)
                    : "Pending"}
                </p>
              </div>
            </div>
            <MarketChart
              data={marketData?.points ?? []}
              loading={marketLoading}
              setup={setup}
              viewKey={`${symbol}:${timeframe}`}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-medium text-ink-muted">{marketNotice}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-normal text-ink-muted">
                <span className="font-mono tabular-nums">
                  {activeMarketCount} active markets
                </span>
                <span className="hidden sm:inline">/</span>
                <span>Verified chart feed</span>
              </div>
            </div>
          </div>
        </section>

        <section className="terminal-panel shrink-0 p-5">
          <RecommendationPanel
            notice={advisorNotice}
            result={activeResult}
            setup={setup}
            status={analyzerStatus}
            symbol={symbol}
          />
        </section>

        {/* Task 7 relocates these four panels here from the right rail,
            which CurrentTradesRail (spec §8) now owns exclusively. The
            brief is silent on their new destination, so they land as
            secondary stacked panels below the stage's own content instead
            of being dropped — same shrink-0 wrapper reasoning as above,
            since none of them accept a className. */}
        <div className="shrink-0">
          <DataHealthPanel
            activeMarketCount={activeMarketCount}
            data={marketData}
            loading={marketLoading}
            notice={marketNotice}
          />
        </div>

        <div className="shrink-0">
          <VolatilityWindowPanel
            symbol={symbol}
            timezone={profile.defaultTimezone}
          />
        </div>

        <div className="shrink-0">
          <RecentSetupsPanel setups={setups} />
        </div>

        <div className="shrink-0">
          <MarketResultsPanel stat={symbolStat} symbol={symbol} />
        </div>
      </div>

      {/* Right rail: Current trades (spec §8) — live pending/open state,
          computed from setups+outcomes already loaded above. Force-refreshed
          on every Desk surface show (App.tsx's tab-activation effect) and on
          demand via the rail's own manual control; no fetch logic lives
          here. Below lg this is the "Trades" tab's entire content (spec
          §3); at ≥lg it always shows. */}
      <aside
        className={deskColumnClassName(
          mobileView === "trades",
          "flex",
          "scrolly min-w-0 flex-col gap-5 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1",
        )}
      >
        <div className="shrink-0">
          <CurrentTradesRail
            now={clockNow}
            onRefresh={onForceOutcomeRefresh}
            setups={setups}
          />
        </div>
      </aside>
    </div>
  );
}

function AdvisorReviewScope({
  assetType,
  timeframe,
  validUntil,
}: {
  assetType: SecurityType;
  timeframe: ChartTimeframe;
  validUntil: string | null;
}) {
  const items = [
    {
      detail: "Changes the visible chart only.",
      icon: <LineChart className="h-4 w-4" aria-hidden="true" />,
      label: "Chart view",
      value: advisorChartViewLabel(timeframe),
    },
    {
      detail: `${advisorExecutionIntervalLabel()} help validate the latest price.`,
      icon: <Layers3 className="h-4 w-4" aria-hidden="true" />,
      label: "Advisor checks",
      value: advisorSignalIntervalLabel(),
    },
    {
      detail: validUntil
        ? "Refresh after this time before using the levels."
        : "Any setup shown will use this window.",
      icon: <Clock3 className="h-4 w-4" aria-hidden="true" />,
      label: "Valid until",
      value: validUntil ? formatTimestamp(validUntil) : reviewWindowLabel(assetType),
    },
  ];

  return (
    <div className="mt-4 grid gap-2 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid min-w-0 gap-1 rounded-lg border border-hairline bg-paper px-3 py-3"
        >
          <div className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            <span className="shrink-0 text-accent">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </div>
          <p className="truncate font-mono text-sm font-semibold tabular-nums text-ink">
            {item.value}
          </p>
          <p className="text-xs leading-5 text-ink-muted">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
