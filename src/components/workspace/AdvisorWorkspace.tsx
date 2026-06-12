import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Brain, CheckCircle2, Clock, Loader2, RefreshCw, ShieldCheck, Target } from "lucide-react";
import { MarketChart } from "../charts/MarketChart";
import { ConfidenceGauge } from "../trade/ConfidenceGauge";
import type { SecurityStat } from "../../hooks/useTradeSetups";
import { getGlobalSessions, getMarketClock } from "../../lib/marketSessions";
import { fetchMarketData, type ChartTimeframe, type MarketDataResponse } from "../../lib/marketData";
import type { UserProfile } from "../../lib/profile";
import { AVAILABLE_ASSET_GROUPS, formatSecurityLabel, getSecurityOption, type SupportedSymbol } from "../../lib/symbolMap";
import { generateTradeSetup, type AnalyzerResponse, type AnalyzerSetup, type TradeSetupRow } from "../../lib/tradeAnalyzer";

type AdvisorWorkspaceProps = {
  onSetupsChanged: () => void;
  profile: UserProfile;
  setupStats: SecurityStat[];
  setups: TradeSetupRow[];
};

type AnalysisState = {
  requestedAt: number;
  response: AnalyzerResponse | null;
  symbol: SupportedSymbol;
};

const TIMEFRAMES: Array<{ label: string; value: ChartTimeframe }> = [
  { label: "15 minutes", value: "15min" },
  { label: "1 hour", value: "1hour" },
  { label: "4 hours", value: "4hour" },
  { label: "Daily", value: "1day" },
];

export function AdvisorWorkspace({ onSetupsChanged, profile, setupStats, setups }: AdvisorWorkspaceProps) {
  const [symbol, setSymbol] = useState<SupportedSymbol>("EURUSD");
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(profile.defaultTimeframe);
  const [timeframeTouched, setTimeframeTouched] = useState(false);
  const [marketData, setMarketData] = useState<MarketDataResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketNotice, setMarketNotice] = useState("Loading market context.");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [analysisState, setAnalysisState] = useState<AnalysisState | null>(null);
  const [analyzerStatus, setAnalyzerStatus] = useState<"idle" | "analyzing">("idle");
  const [advisorNotice, setAdvisorNotice] = useState("");
  const [clockNow, setClockNow] = useState(() => new Date());
  const requestIdRef = useRef(0);

  const selectedAsset = getSecurityOption(symbol);
  const activeResult = analysisState?.symbol === symbol ? analysisState.response : null;
  const setup = activeResult?.setup ?? null;
  const symbolStat = setupStats.find((stat) => stat.symbol === symbol);
  const activeAssetCount = AVAILABLE_ASSET_GROUPS.reduce((sum, group) => sum + group.options.length, 0);
  const marketClock = useMemo(() => getMarketClock(symbol, profile.defaultTimezone, clockNow), [clockNow, profile.defaultTimezone, symbol]);
  const globalSessions = useMemo(() => getGlobalSessions(profile.defaultTimezone, profile.preferredSession, clockNow), [clockNow, profile.defaultTimezone, profile.preferredSession]);

  useEffect(() => {
    if (!timeframeTouched) {
      setTimeframe(profile.defaultTimeframe);
    }
  }, [profile.defaultTimeframe, timeframeTouched]);

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
        const nextData = await fetchMarketData({ days: timeframe === "1day" ? 180 : 21, symbol, timeframe });
        if (!cancelled) {
          setMarketData(nextData);
          setMarketNotice(`${nextData.resultsCount} ${formatTimeframe(timeframe)} bars loaded.`);
        }
      } catch {
        if (!cancelled) {
          setMarketData(null);
          setMarketNotice("Market data is unavailable for this asset.");
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
    const requestedSymbol = symbol;
    const requestedLabel = formatSecurityLabel(requestedSymbol);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setAnalyzerStatus("analyzing");
    setAdvisorNotice(`Analyzing ${requestedLabel}.`);
    setAnalysisState({ requestedAt: Date.now(), response: null, symbol: requestedSymbol });

    try {
      const nextResult = await generateTradeSetup(requestedSymbol);
      if (requestIdRef.current !== requestId) {
        return;
      }
      setAnalysisState({ requestedAt: Date.now(), response: nextResult, symbol: requestedSymbol });
      if (nextResult.setup) {
        setAdvisorNotice(nextResult.deduplicated ? `${requestedLabel} active setup refreshed.` : `${requestedLabel} limit setup logged.`);
        onSetupsChanged();
      } else {
        setAdvisorNotice(nextResult.reason ?? `No current ${requestedLabel} limit setup qualifies.`);
        onSetupsChanged();
      }
    } catch {
      if (requestIdRef.current === requestId) {
        setAnalysisState({ requestedAt: Date.now(), response: null, symbol: requestedSymbol });
        setAdvisorNotice(`Market context is refreshing for ${requestedLabel}. Try again shortly.`);
      }
    } finally {
      if (requestIdRef.current === requestId) {
        setAnalyzerStatus("idle");
      }
    }
  }

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="terminal-panel overflow-hidden">
        <div className="border-b border-slate/15 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Market advisor</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Trade setup desk</h2>
              <p className="mt-1 text-sm text-slate">Review the chart, then generate the current limit setup.</p>
            </div>
            <button className="secondary-button min-h-10 px-3 py-2" type="button" onClick={() => setRefreshNonce((value) => value + 1)} disabled={marketLoading}>
              <RefreshCw className={`h-4 w-4 ${marketLoading ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_minmax(160px,0.55fr)_auto]">
            <label className="grid gap-2 text-sm font-semibold text-navy">
              Asset
              <select
                className="field"
                value={symbol}
                onChange={(event) => {
                  requestIdRef.current += 1;
                  setSymbol(event.target.value as SupportedSymbol);
                  setAnalyzerStatus("idle");
                  setAnalysisState(null);
                  setAdvisorNotice("");
                }}
              >
                {AVAILABLE_ASSET_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.symbol} value={option.symbol}>
                        {option.fallbackFmpSymbol ? `${option.label} (${option.fmpSymbol}, fallback ${option.fallbackFmpSymbol})` : `${option.label} (${option.fmpSymbol})`}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-navy">
              Chart timeframe
              <select
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
              <button className="primary-button w-full lg:min-w-48" type="button" disabled={analyzerStatus === "analyzing"} onClick={analyze}>
                {analyzerStatus === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Brain className="h-4 w-4" aria-hidden="true" />}
                Generate setup
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          <MarketClockPanel clock={marketClock} sessions={globalSessions} />
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate">{selectedAsset.assetType}</p>
              <h3 className="text-xl font-semibold tracking-normal text-navy">{formatSecurityLabel(symbol)}</h3>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-normal text-slate">Latest close</p>
              <p className="text-lg font-semibold tracking-normal text-navy">
                {typeof marketData?.latestClose === "number" ? formatPrice(symbol, marketData.latestClose) : "Pending"}
              </p>
            </div>
          </div>
          <MarketChart data={marketData?.points ?? []} loading={marketLoading} setup={setup} viewKey={`${symbol}:${timeframe}`} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-medium text-slate">{marketNotice}</p>
            <p className="text-xs font-semibold uppercase tracking-normal text-slate">{activeAssetCount} active assets</p>
          </div>
        </div>
      </section>

      <aside className="grid content-start gap-5">
        <section className="terminal-panel p-5">
          <RecommendationPanel notice={advisorNotice} result={activeResult} setup={setup} />
        </section>

        <section className="terminal-panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-navy" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate">Recent recommendations</p>
              <h3 className="text-lg font-semibold tracking-normal text-navy">Latest activity</h3>
            </div>
          </div>
          <SetupList setups={setups.slice(0, 5)} />
        </section>

        <section className="terminal-panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-navy" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate">Focus statistics</p>
              <h3 className="text-lg font-semibold tracking-normal text-navy">{selectedAsset.symbol}</h3>
            </div>
          </div>
          {symbolStat ? (
            <div className="grid gap-2 text-sm">
              <MetricRow label="Recommendations" value={symbolStat.count.toString()} />
              <MetricRow label="Avg confidence" value={`${symbolStat.averageConfidence}%`} />
              <MetricRow label="Win rate" value={symbolStat.winRate === null ? "Pending" : `${symbolStat.winRate}%`} />
              <MetricRow label="Take profit" value={symbolStat.wins.toString()} />
              <MetricRow label="Stop loss" value={symbolStat.losses.toString()} />
              <MetricRow label="Pending / live" value={symbolStat.pending.toString()} />
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate">No saved recommendations for this asset yet.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function RecommendationPanel({
  notice,
  result,
  setup,
}: {
  notice: string;
  result: AnalyzerResponse | null;
  setup: Pick<AnalyzerSetup, "breakevenTriggerPrice" | "confidenceScore" | "entryPrice" | "side" | "stopLoss" | "takeProfit"> | null;
}) {
  if (setup) {
    const isBuy = setup.side === "buy";

    return (
      <div className="grid gap-4">
        <div className={`rounded-lg px-4 py-3 text-center text-xl font-bold tracking-normal ${isBuy ? "bg-bullish/10 text-bullish" : "bg-danger/10 text-danger"}`}>
          {setup.side.toUpperCase()} LIMIT
        </div>
        <ConfidenceGauge score={setup.confidenceScore} />
        <div className="grid gap-2 text-sm">
          <MetricRow label="Limit entry" value={formatNumber(setup.entryPrice)} valueClassName={isBuy ? "text-bullish" : "text-danger"} />
          <MetricRow label="Stop loss" value={formatNumber(setup.stopLoss)} />
          <MetricRow label="Take profit" value={formatNumber(setup.takeProfit)} />
          <MetricRow label="Breakeven" value={formatNumber(setup.breakevenTriggerPrice)} />
        </div>
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isBuy ? "bg-bullish/10 text-bullish" : "bg-danger/10 text-danger"}`}>
          {result?.deduplicated ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          {notice || "Current advisory setup ready. LevelFlow does not execute trades."}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 text-sm leading-6 text-slate">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy text-white">
        <Target className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-navy">Ready for review</h3>
        <p className="mt-1">{notice || "Select an asset, review the chart, then generate the current limit setup."}</p>
      </div>
    </div>
  );
}

function MarketClockPanel({ clock, sessions }: { clock: ReturnType<typeof getMarketClock>; sessions: ReturnType<typeof getGlobalSessions> }) {
  return (
    <div className="mb-4 grid min-w-0 gap-3 rounded-lg border border-slate/15 bg-canvas p-3 xl:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.45fr)]">
      <div className="min-w-0 rounded-lg border border-slate/10 bg-white p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 text-xs font-semibold uppercase tracking-normal text-slate">{clock.marketLabel}</p>
          <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold uppercase ${clock.isOpen ? "bg-bullish/10 text-bullish" : "bg-danger/10 text-danger"}`}>
            {clock.statusLabel}
          </span>
        </div>
        <p className="mt-2 text-lg font-semibold text-navy">
          {clock.nextEventLabel}: {clock.countdownLabel}
        </p>
        <div className="mt-2 grid gap-1 text-xs leading-5 text-slate">
          <span>User time: {clock.userTime}</span>
          <span>Market time: {clock.marketTime}</span>
          <span>
            Next event: {clock.nextEventUserTime} / {clock.nextEventMarketTime}
          </span>
        </div>
      </div>

      <div className="grid min-w-0 gap-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`grid min-w-0 gap-2 rounded-lg border px-3 py-2.5 sm:grid-cols-[minmax(132px,0.85fr)_minmax(124px,0.65fr)_minmax(158px,1fr)] sm:items-center ${
              session.isPreferred ? "border-bullish/40 bg-bullish/10" : "border-slate/15 bg-white"
            }`}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-semibold text-navy">{session.label}</p>
                <span className={`shrink-0 whitespace-nowrap text-xs font-bold uppercase ${session.isOpen ? "text-bullish" : "text-slate"}`}>{session.isOpen ? "Open" : "Closed"}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate">{session.marketTime}</p>
            </div>
            <p className="min-w-0 text-xs font-semibold text-navy">
              <span className="whitespace-nowrap">{session.nextEventLabel}</span> in {session.countdownLabel}
            </p>
            <p className="min-w-0 text-xs text-slate">{session.nextEventUserTime} local</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SetupList({ setups }: { setups: TradeSetupRow[] }) {
  if (setups.length === 0) {
    return <p className="text-sm leading-6 text-slate">No recommendations yet.</p>;
  }

  return (
    <div className="grid gap-2">
      {setups.map((setup) => (
        <div key={setup.id} className="min-w-0 rounded-lg border border-slate/15 bg-canvas px-3 py-2">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 font-semibold text-navy">{setup.symbol}</p>
            <span className={`text-xs font-bold uppercase ${setup.side === "buy" ? "text-bullish" : "text-danger"}`}>{setup.side} limit</span>
          </div>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-3 text-xs text-slate">
            <span>{formatDate(setup.created_at)}</span>
            <span>{Number(setup.confidence_score)}% confidence</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricRow({ label, value, valueClassName = "text-navy" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
      <span className="min-w-0 text-slate">{label}</span>
      <span className={`min-w-0 text-right font-semibold ${valueClassName}`}>{value}</span>
    </div>
  );
}

function formatPrice(symbol: string, value: number) {
  const maximumFractionDigits = symbol.includes("USD") && !symbol.startsWith("US") ? 5 : 2;
  return value.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  });
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
  });
}

function formatTimeframe(timeframe: ChartTimeframe) {
  return TIMEFRAMES.find((option) => option.value === timeframe)?.label.toLowerCase() ?? timeframe;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
