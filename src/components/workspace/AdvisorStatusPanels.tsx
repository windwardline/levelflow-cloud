import type { SecurityStat } from "../../hooks/useTradeSetups";
import { getGlobalSessions, getMarketClock } from "../../lib/marketSessions";
import type { SupportedSymbol } from "../../lib/symbolMap";
import type { AnalyzerResponse } from "../../lib/tradeAnalyzer";
import { formatPrice } from "./advisorFormat";

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
    <div className="mb-4 grid min-w-0 gap-3 rounded-lg border border-hairline bg-paper p-3 xl:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.45fr)]">
      <div className="min-w-0 rounded-lg border border-hairline bg-sheet p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="min-w-0 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            {clock.marketLabel}
          </p>
          <span
            className={`chip shrink-0 ${
              clock.isOpen ? "text-buy" : "text-sell"
            }`}
          >
            {clock.statusLabel}
          </span>
        </div>
        <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-ink">
          {clock.nextEventLabel}: {clock.countdownLabel}
        </p>
        <div className="mt-2 grid gap-1 text-xs leading-5 text-ink-muted">
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
                ? "border-accent/40 bg-accent/10"
                : "border-hairline bg-sheet"
            }`}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate font-semibold text-ink">
                  {session.label}
                </p>
                <span
                  className={`shrink-0 whitespace-nowrap text-xs font-bold uppercase ${
                    session.isOpen ? "text-buy" : "text-ink-muted"
                  }`}
                >
                  {session.isOpen ? "Open" : "Closed"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-ink-muted">
                {session.marketTime}
              </p>
            </div>
            <p className="min-w-0 font-mono text-xs font-semibold tabular-nums text-ink">
              <span className="whitespace-nowrap">
                {session.nextEventLabel}
              </span>{" "}
              in {session.countdownLabel}
            </p>
            <p className="min-w-0 text-xs text-ink-muted">
              {session.nextEventUserTime} local
            </p>
          </div>
        ))}
      </div>
    </div>
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
    <div className="grid min-h-[72px] min-w-0 content-center rounded-lg border border-hairline bg-paper px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
        {label}
      </p>
      <div className="mt-1 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 font-mono text-base font-semibold tabular-nums leading-6 text-ink">
          {value}
        </p>
        <p className="min-w-0 text-sm font-medium leading-5 text-ink-muted">
          {detail}
        </p>
      </div>
    </div>
  );
}
