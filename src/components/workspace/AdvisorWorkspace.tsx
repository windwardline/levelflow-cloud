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
import { MarketScanPanel } from "./MarketScanPanel";
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

type AdvisorWorkspaceProps = {
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
  { onSetupsChanged, openRequest, profile, setupStats, setups }:
    AdvisorWorkspaceProps,
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
      return;
    }
    requestIdRef.current += 1;
    selectedSymbolRef.current = requestedSymbol;
    setSymbol(requestedSymbol);
    setAnalyzerStatus("idle");
    setAnalysisState(null);
    setAdvisorNotice("");
  }, [openRequest?.symbol, openRequest?.token]);

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
        scanned: scanSymbols?.length ?? 0,
      });
    } finally {
      setScanStatus("idle");
    }
  }

  return (
    <div className="grid gap-5">
      <MarketScanPanel
        onResetResult={() => setScanResult(null)}
        onScan={scanMarkets}
        onSelectCandidate={(candidate) => {
          const nextSymbol = candidate.symbol;
          requestIdRef.current += 1;
          selectedSymbolRef.current = nextSymbol;
          setSymbol(nextSymbol);
          setAnalyzerStatus("idle");
          if (candidate.setup) {
            setAnalysisState({
              requestedAt: Date.now(),
              response: {
                advisoryOnly: true,
                message: "Selected from Market Scan.",
                setup: candidate.setup,
              },
              symbol: nextSymbol,
            });
            setAdvisorNotice(
              "Selected from Market Scan. Review market refreshes the same rules and saves the current setup.",
            );
          } else {
            setAnalysisState(null);
            setAdvisorNotice("");
          }
        }}
        result={scanResult}
        status={scanStatus}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="terminal-panel overflow-hidden">
        <div className="border-b border-hairline px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-normal text-accent">
                Advisor
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal text-ink">
                Market review
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Select a market, review the chart, then ask Levelflow for the
                current limit setup.
              </p>
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

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(160px,0.55fr)_auto]">
            <label className="grid gap-2 text-sm font-semibold text-ink">
              Market
              <select
                className="field"
                value={symbol}
                onChange={(event) => {
                  const nextSymbol = event.target.value as SupportedSymbol;
                  requestIdRef.current += 1;
                  selectedSymbolRef.current = nextSymbol;
                  setSymbol(nextSymbol);
                  setAnalyzerStatus("idle");
                  setAnalysisState(null);
                  setAdvisorNotice("");
                }}
              >
                {AVAILABLE_ASSET_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.symbol} value={option.symbol}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

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

      <aside className="grid content-start gap-5">
        <section className="terminal-panel p-5">
          <RecommendationPanel
            notice={advisorNotice}
            result={activeResult}
            setup={setup}
            status={analyzerStatus}
            symbol={symbol}
          />
        </section>

        <DataHealthPanel
          activeMarketCount={activeMarketCount}
          data={marketData}
          loading={marketLoading}
          notice={marketNotice}
        />

        <VolatilityWindowPanel
          symbol={symbol}
          timezone={profile.defaultTimezone}
        />

        <RecentSetupsPanel setups={setups} />

        <MarketResultsPanel stat={symbolStat} symbol={symbol} />
      </aside>
      </div>
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
