import { useEffect, useMemo, useState } from "react";
import { BarChart3, Brain, CheckCircle2, Clock, Loader2, RefreshCw, ShieldCheck, Target } from "lucide-react";
import { MarketChart } from "../charts/MarketChart";
import { ConfidenceGauge } from "../trade/ConfidenceGauge";
import type { SavedAccount } from "../../hooks/useUserAccounts";
import type { SecurityStat } from "../../hooks/useTradeSetups";
import { fetchMarketData, type ChartTimeframe, type MarketDataResponse } from "../../lib/marketData";
import { SECURITY_GROUPS, formatSecurityLabel, getSecurityOption, type SupportedSymbol } from "../../lib/symbolMap";
import { generateTradeSetup, type AnalyzerResponse, type AnalyzerSetup, type TradeSetupRow } from "../../lib/tradeAnalyzer";
import { formatCurrency } from "../../lib/e8Matrix";

type AdvisorWorkspaceProps = {
  accounts: SavedAccount[];
  accountsLoading: boolean;
  onOpenAccounts: () => void;
  onSelectAccount: (accountId: string) => void;
  onSetupsChanged: () => void;
  selectedAccountId: string;
  setupStats: SecurityStat[];
  setups: TradeSetupRow[];
};

const TIMEFRAMES: Array<{ label: string; value: ChartTimeframe }> = [
  { label: "15 minutes", value: "15min" },
  { label: "1 hour", value: "1hour" },
  { label: "4 hours", value: "4hour" },
  { label: "Daily", value: "1day" },
];

export function AdvisorWorkspace({
  accounts,
  accountsLoading,
  onOpenAccounts,
  onSelectAccount,
  onSetupsChanged,
  selectedAccountId,
  setupStats,
  setups,
}: AdvisorWorkspaceProps) {
  const [symbol, setSymbol] = useState<SupportedSymbol>("EURUSD");
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1hour");
  const [marketData, setMarketData] = useState<MarketDataResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketNotice, setMarketNotice] = useState("Loading FMP market context.");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [result, setResult] = useState<AnalyzerResponse | null>(null);
  const [analyzerStatus, setAnalyzerStatus] = useState<"idle" | "analyzing">("idle");
  const [advisorNotice, setAdvisorNotice] = useState("");

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? accounts[0] ?? null;
  const selectedSecurity = getSecurityOption(symbol);
  const latestSavedSetup = useMemo(
    () => setups.find((setup) => setup.account_id === selectedAccount?.id && setup.symbol === symbol) ?? null,
    [selectedAccount?.id, setups, symbol],
  );
  const setup = result?.setup ?? mapSavedSetup(latestSavedSetup);
  const symbolStat = setupStats.find((stat) => stat.symbol === symbol);
  const scopedSymbolCount = SECURITY_GROUPS.reduce((sum, group) => sum + group.options.length, 0);

  useEffect(() => {
    let cancelled = false;

    async function loadMarketData() {
      setMarketLoading(true);
      setMarketNotice("Loading FMP market context.");

      try {
        const nextData = await fetchMarketData({ days: timeframe === "1day" ? 160 : 21, symbol, timeframe });
        if (!cancelled) {
          setMarketData(nextData);
          const providerLabel = nextData.providerStatus.startsWith("OK_FALLBACK") ? `FMP fallback ${nextData.ticker}` : `FMP ${nextData.ticker}`;
          setMarketNotice(`${nextData.resultsCount} ${formatTimeframe(timeframe)} bars from ${providerLabel}.`);
        }
      } catch {
        if (!cancelled) {
          setMarketData(null);
          setMarketNotice("FMP chart access is pending for this instrument or timeframe. The advisor will continue using available provider context.");
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
    if (!selectedAccount) {
      setAdvisorNotice("Create or select an E8 account before requesting a setup.");
      return;
    }

    setAnalyzerStatus("analyzing");
    setAdvisorNotice("");

    try {
      const nextResult = await generateTradeSetup(selectedAccount.id, symbol);
      setResult(nextResult);
      if (nextResult.setup) {
        setAdvisorNotice(
          nextResult.deduplicated
            ? "Matching active setup refreshed. No duplicate log entry was created."
            : "Advisory setup generated and logged for this account.",
        );
        onSetupsChanged();
      } else {
        setAdvisorNotice(nextResult.reason ?? "No qualified setup met the committee threshold on this pass.");
      }
    } catch {
      setAdvisorNotice("LevelFlow is updating provider context for this selection. Try again shortly.");
    } finally {
      setAnalyzerStatus("idle");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.55fr)]">
      <section className="terminal-panel overflow-hidden">
        <div className="border-b border-slate/15 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-normal text-bullish">Advisor workflow</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">Trade setup desk</h2>
            </div>
            <button className="secondary-button min-h-10 px-3 py-2" type="button" onClick={() => setRefreshNonce((value) => value + 1)} disabled={marketLoading}>
              <RefreshCw className={`h-4 w-4 ${marketLoading ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh chart
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_1.25fr_0.72fr_auto]">
            <label className="grid gap-2 text-sm font-semibold text-navy">
              E8 account
              <select className="field" value={selectedAccount?.id ?? ""} disabled={accountsLoading} onChange={(event) => onSelectAccount(event.target.value)}>
                {accounts.length === 0 ? <option value="">No saved account</option> : null}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.account_name} - {formatCurrency(Number(account.initial_balance))}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-navy">
              Security
              <select
                className="field"
                value={symbol}
                onChange={(event) => {
                  setSymbol(event.target.value as SupportedSymbol);
                  setResult(null);
                }}
              >
                {SECURITY_GROUPS.map((group) => (
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
              <select className="field" value={timeframe} onChange={(event) => setTimeframe(event.target.value as ChartTimeframe)}>
                {TIMEFRAMES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button className="primary-button w-full lg:min-w-48" type="button" disabled={analyzerStatus === "analyzing" || !selectedAccount} onClick={analyze}>
                {analyzerStatus === "analyzing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Brain className="h-4 w-4" aria-hidden="true" />}
                Generate setup
              </button>
            </div>
          </div>

          {!selectedAccount ? (
            <button className="secondary-button mt-4" type="button" onClick={onOpenAccounts}>
              Configure first account
            </button>
          ) : null}
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate">{selectedSecurity.assetType}</p>
                <h3 className="text-xl font-semibold tracking-normal text-navy">{formatSecurityLabel(symbol)}</h3>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-normal text-slate">Latest close</p>
                <p className="text-lg font-semibold tracking-normal text-navy">
                  {typeof marketData?.latestClose === "number" ? formatPrice(symbol, marketData.latestClose) : "Pending"}
                </p>
              </div>
            </div>
            <MarketChart data={marketData?.points ?? []} loading={marketLoading} setup={setup} />
            <p className="mt-3 text-sm font-medium text-slate">{marketNotice}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-slate">E8 scope: {scopedSymbolCount} approved instruments</p>
          </div>

          <aside className="border-t border-slate/15 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <RecommendationPanel notice={advisorNotice} result={result} setup={setup} latestSavedSetup={latestSavedSetup} />
          </aside>
        </div>
      </section>

      <aside className="grid gap-5">
        <section className="terminal-panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-navy" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate">Recent recommendations</p>
              <h3 className="text-lg font-semibold tracking-normal text-navy">{selectedAccount?.account_name ?? "No account selected"}</h3>
            </div>
          </div>
          <SetupList setups={setups.filter((item) => !selectedAccount || item.account_id === selectedAccount.id).slice(0, 5)} />
        </section>

        <section className="terminal-panel p-5">
          <div className="mb-4 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-navy" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-slate">Focus statistics</p>
              <h3 className="text-lg font-semibold tracking-normal text-navy">{selectedSecurity.symbol}</h3>
            </div>
          </div>
          {symbolStat ? (
            <div className="grid gap-2 text-sm">
              <MetricRow label="Recommendations" value={symbolStat.count.toString()} />
              <MetricRow label="Avg confidence" value={`${symbolStat.averageConfidence}%`} />
              <MetricRow label="Tracked wins" value={symbolStat.wins.toString()} />
              <MetricRow label="Tracked losses" value={symbolStat.losses.toString()} />
              <MetricRow label="Pending review" value={symbolStat.pending.toString()} />
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate">No saved recommendations for this security yet.</p>
          )}
        </section>
      </aside>
    </div>
  );
}

function RecommendationPanel({
  latestSavedSetup,
  notice,
  result,
  setup,
}: {
  latestSavedSetup: TradeSetupRow | null;
  notice: string;
  result: AnalyzerResponse | null;
  setup: Pick<AnalyzerSetup, "breakevenTriggerPrice" | "confidenceScore" | "entryPrice" | "lotSize" | "side" | "stopLoss" | "takeProfit"> | null;
}) {
  if (setup) {
    return (
      <div className="grid gap-4">
        <ConfidenceGauge score={setup.confidenceScore} />
        <div className="grid gap-2 text-sm">
          <MetricRow label="Side" value={`${setup.side.toUpperCase()} LIMIT`} />
          <MetricRow label="Entry" value={formatNumber(setup.entryPrice)} />
          <MetricRow label="Stop loss" value={formatNumber(setup.stopLoss)} />
          <MetricRow label="Take profit" value={formatNumber(setup.takeProfit)} />
          <MetricRow label="Breakeven" value={formatNumber(setup.breakevenTriggerPrice)} />
          <MetricRow label="Lot size" value={setup.lotSize > 0 ? setup.lotSize.toString() : "Logged setup"} />
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-bullish/10 px-3 py-2 text-sm font-semibold text-bullish">
          {result?.deduplicated ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          {notice || (latestSavedSetup ? "Showing latest saved recommendation for this security." : "Advisory setup ready. LevelFlow does not execute trades.")}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 text-sm leading-6 text-slate">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy text-white">
        <Target className="h-5 w-5" aria-hidden="true" />
      </div>
      <p>{notice || "Choose an account and security, then generate the best current advisory setup. Results are logged once per unique active setup."}</p>
    </div>
  );
}

function SetupList({ setups }: { setups: TradeSetupRow[] }) {
  if (setups.length === 0) {
    return <p className="text-sm leading-6 text-slate">No recommendations logged yet.</p>;
  }

  return (
    <div className="grid gap-2">
      {setups.map((setup) => (
        <div key={setup.id} className="rounded-lg border border-slate/15 bg-canvas px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-navy">{setup.symbol}</p>
            <span className={`text-xs font-bold uppercase ${setup.side === "buy" ? "text-bullish" : "text-danger"}`}>{setup.side}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-slate">
            <span>{formatDate(setup.created_at)}</span>
            <span>{Number(setup.confidence_score)}% confidence</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2">
      <span className="text-slate">{label}</span>
      <span className="text-right font-semibold text-navy">{value}</span>
    </div>
  );
}

function mapSavedSetup(setup: TradeSetupRow | null) {
  if (!setup) {
    return null;
  }

  return {
    breakevenTriggerPrice: Number(setup.breakeven_trigger_price),
    confidenceScore: Number(setup.confidence_score),
    entryPrice: Number(setup.limit_entry),
    lotSize: Number(setup.risk_model?.lotSize ?? 0),
    side: setup.side,
    stopLoss: Number(setup.stop_loss),
    takeProfit: Number(setup.take_profit),
  };
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTimeframe(timeframe: ChartTimeframe) {
  return TIMEFRAMES.find((option) => option.value === timeframe)?.label.toLowerCase() ?? timeframe;
}
