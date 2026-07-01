import { BarChart3, CheckCircle2, Clock } from "lucide-react";
import type { SecurityStat } from "../../hooks/useTradeSetups";
import { formatConfidenceWithTier } from "../../lib/confidenceTiers";
import { getGlobalSessions, getMarketClock } from "../../lib/marketSessions";
import type { MarketDataResponse } from "../../lib/marketData";
import {
  getSecurityOption,
  type SupportedSymbol,
  TEMPORARILY_HIDDEN_ASSET_TYPES,
} from "../../lib/symbolMap";
import type { AnalyzerResponse, TradeSetupRow } from "../../lib/tradeAnalyzer";
import { formatDate, formatPrice, formatTimestamp } from "./advisorFormat";
import { MetricRow } from "./AdvisorMetricRow";

export function DataHealthPanel({
  activeMarketCount,
  data,
  loading,
  notice,
}: {
  activeMarketCount: number;
  data: MarketDataResponse | null;
  loading: boolean;
  notice: string;
}) {
  const hiddenCategories = Array.from(TEMPORARILY_HIDDEN_ASSET_TYPES).sort();
  const lastUpdated = data?.asOf
    ? formatTimestamp(data.asOf)
    : "Awaiting refresh";
  const status = loading
    ? "Refreshing"
    : data?.resultsCount
    ? "Ready"
    : "Needs data";

  return (
    <section className="terminal-panel p-5">
      <div className="mb-4 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-bullish" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-slate">Market data</p>
          <h3 className="text-lg font-semibold tracking-normal text-navy">
            {status}
          </h3>
        </div>
      </div>
      <div className="grid gap-2 text-sm">
        <MetricRow label="Feed" value="Chart feed" />
        <MetricRow
          label="Candles loaded"
          value={loading ? "Refreshing" : String(data?.resultsCount ?? 0)}
        />
        <MetricRow label="Last updated" value={lastUpdated} />
        <MetricRow label="Active markets" value={String(activeMarketCount)} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate">{notice}</p>
      {hiddenCategories.length > 0
        ? (
          <p className="mt-3 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs font-semibold leading-5 text-warning">
            {hiddenCategories.join(" and ")}{" "}
            are hidden until their chart data is verified.
          </p>
        )
        : null}
    </section>
  );
}

export function DeskStatusStrip({
  analysisStatus,
  clockStatus,
  latestClose,
  loading,
  result,
  stat,
  symbol,
}: {
  analysisStatus: "idle" | "analyzing";
  clockStatus: string;
  latestClose: number | null;
  loading: boolean;
  result: AnalyzerResponse | null;
  stat: SecurityStat | undefined;
  symbol: SupportedSymbol;
}) {
  const stateLabel = analysisStatus === "analyzing"
    ? "Reviewing"
    : result?.setup
    ? "Setup ready"
    : result?.blocked
    ? "No setup"
    : "Ready";

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <DeskStatusItem
        label="Data"
        value={loading ? "Refreshing" : "Ready"}
        detail={latestClose === null
          ? "Awaiting price"
          : `Latest ${formatPrice(symbol, latestClose)}`}
      />
      <DeskStatusItem
        label="Session"
        value={clockStatus}
        detail="Local clock"
      />
      <DeskStatusItem
        label="Advisor"
        value={stateLabel}
        detail="Fresh review"
      />
      <DeskStatusItem
        label="Market history"
        value={stat ? `${stat.count} reviewed` : "No history"}
        detail={stat?.winRate === null || !stat
          ? "Results building"
          : `${stat.winRate}% win rate`}
      />
    </div>
  );
}

export function MarketClockPanel({
  clock,
  sessions,
}: {
  clock: ReturnType<typeof getMarketClock>;
  sessions: ReturnType<typeof getGlobalSessions>;
}) {
  return (
    <div className="mb-4 grid min-w-0 gap-3 rounded-lg border border-slate/15 bg-canvas p-3 xl:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.45fr)]">
      <div className="min-w-0 rounded-lg border border-slate/10 bg-white p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 text-xs font-semibold uppercase tracking-normal text-slate">
            {clock.marketLabel}
          </p>
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold uppercase ${
              clock.isOpen
                ? "bg-bullish/10 text-bullish"
                : "bg-danger/10 text-danger"
            }`}
          >
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
              session.isPreferred
                ? "border-bullish/40 bg-bullish/10"
                : "border-slate/15 bg-white"
            }`}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-semibold text-navy">
                  {session.label}
                </p>
                <span
                  className={`shrink-0 whitespace-nowrap text-xs font-bold uppercase ${
                    session.isOpen ? "text-bullish" : "text-slate"
                  }`}
                >
                  {session.isOpen ? "Open" : "Closed"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-slate">
                {session.marketTime}
              </p>
            </div>
            <p className="min-w-0 text-xs font-semibold text-navy">
              <span className="whitespace-nowrap">
                {session.nextEventLabel}
              </span>{" "}
              in {session.countdownLabel}
            </p>
            <p className="min-w-0 text-xs text-slate">
              {session.nextEventUserTime} local
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecentSetupsPanel({ setups }: { setups: TradeSetupRow[] }) {
  return (
    <section className="terminal-panel p-5">
      <div className="mb-4 flex items-center gap-3">
        <Clock className="h-5 w-5 text-navy" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-slate">Recent setups</p>
          <h3 className="text-lg font-semibold tracking-normal text-navy">
            Latest activity
          </h3>
        </div>
      </div>
      <SetupList setups={setups.slice(0, 5)} />
    </section>
  );
}

export function MarketResultsPanel({
  stat,
  symbol,
}: {
  stat: SecurityStat | undefined;
  symbol: SupportedSymbol;
}) {
  const selectedAsset = getSecurityOption(symbol);

  return (
    <section className="terminal-panel p-5">
      <div className="mb-4 flex items-center gap-3">
        <BarChart3 className="h-5 w-5 text-navy" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-slate">Market results</p>
          <h3 className="text-lg font-semibold tracking-normal text-navy">
            {selectedAsset.symbol}
          </h3>
        </div>
      </div>
      {stat
        ? (
          <div className="grid gap-2 text-sm">
            <MetricRow label="Setups shown" value={stat.count.toString()} />
            <MetricRow
              label="Average confidence"
              value={`${stat.averageConfidence}%`}
            />
            <MetricRow
              label="Win rate"
              value={stat.winRate === null ? "Learning" : `${stat.winRate}%`}
            />
            <MetricRow label="Reached target" value={stat.wins.toString()} />
            <MetricRow label="Hit stop" value={stat.losses.toString()} />
            <MetricRow label="Still tracking" value={stat.pending.toString()} />
          </div>
        )
        : (
          <p className="text-sm leading-6 text-slate">
            No saved setups for this market yet.
          </p>
        )}
    </section>
  );
}

function DeskStatusItem({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-h-[72px] min-w-0 content-center rounded-lg border border-slate/15 bg-canvas px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate">
        {label}
      </p>
      <div className="mt-1 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-base font-semibold leading-6 text-navy">
          {value}
        </p>
        <p className="min-w-0 text-sm font-medium leading-5 text-slate">
          {detail}
        </p>
      </div>
    </div>
  );
}

function SetupList({ setups }: { setups: TradeSetupRow[] }) {
  if (setups.length === 0) {
    return <p className="text-sm leading-6 text-slate">No setups yet.</p>;
  }

  return (
    <div className="grid gap-2">
      {setups.map((setup) => (
        <div
          key={setup.id}
          className="min-w-0 rounded-lg border border-slate/15 bg-canvas px-3 py-2"
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 font-semibold text-navy">{setup.symbol}</p>
            <span
              className={`text-xs font-bold uppercase ${
                setup.side === "buy" ? "text-bullish" : "text-danger"
              }`}
            >
              {setup.side} limit
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-3 text-xs text-slate">
            <span>{formatDate(setup.created_at)}</span>
            <span>
              {formatConfidenceWithTier(setup.confidence_score)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
