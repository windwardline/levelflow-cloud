import { useEffect, useMemo, useState } from "react";
import {
  type CategoryStat,
  type OutcomeSummary,
  type SecurityStat,
} from "../../hooks/useTradeSetups";
import {
  normalizeSetupOutcome,
  OUTCOME_COPY,
  type SetupOutcome,
} from "../../lib/outcomes";
import {
  CONFIDENCE_TIERS,
  formatConfidenceTierRange,
  formatConfidenceWithTier,
} from "../../lib/confidenceTiers";
import {
  compareAssetCategories,
  compareAssetSymbols,
  formatSecurityLabel,
  getSecurityOption,
  sortAssetSymbols,
  type SecurityType,
} from "../../lib/symbolMap";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";

type HistoryGroupBy = "date" | "category" | "asset" | "status";
type HistorySort = "newest" | "oldest" | "confidence" | "asset";
type HistoryStatusFilter = "all" | SetupOutcome;
type HistorySetupGroup = {
  items: TradeSetupRow[];
  key: string;
  label: string;
};

const ALL_HISTORY_FILTER = "all";
const HISTORY_STATUS_ORDER: SetupOutcome[] = [
  "still_tracking",
  "target_reached",
  "stopped_out",
  "unclear_path",
  "entry_not_filled",
];

export function HistoryPanel({
  categoryStats,
  loading,
  setups,
  stats,
  summary,
}: {
  categoryStats: CategoryStat[];
  loading: boolean;
  setups: TradeSetupRow[];
  stats: SecurityStat[];
  summary: OutcomeSummary;
}) {
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState(ALL_HISTORY_FILTER);
  const [assetFilter, setAssetFilter] = useState(ALL_HISTORY_FILTER);
  const [groupBy, setGroupBy] = useState<HistoryGroupBy>("date");
  const [sortBy, setSortBy] = useState<HistorySort>("newest");

  const categories = useMemo(() => {
    return Array.from(
      new Set(setups.map((setup) => getSecurityOption(setup.symbol).assetType)),
    ).sort(compareAssetCategories);
  }, [setups]);

  const assets = useMemo(() => {
    return sortAssetSymbols(
      Array.from(
        new Set(
          setups
            .filter(
              (setup) =>
                categoryFilter === ALL_HISTORY_FILTER ||
                getSecurityOption(setup.symbol).assetType === categoryFilter,
            )
            .map((setup) => setup.symbol),
        ),
      ),
    );
  }, [categoryFilter, setups]);

  useEffect(() => {
    if (assetFilter !== ALL_HISTORY_FILTER && !assets.includes(assetFilter)) {
      setAssetFilter(ALL_HISTORY_FILTER);
    }
  }, [assetFilter, assets]);

  const filteredSetups = useMemo(() => {
    return sortHistorySetups(
      setups.filter((setup) => {
        const outcome = getSetupOutcome(setup);
        const category = getSecurityOption(setup.symbol).assetType;
        const statusMatches =
          statusFilter === "all" || outcome === statusFilter;
        const categoryMatches =
          categoryFilter === ALL_HISTORY_FILTER || category === categoryFilter;
        const assetMatches =
          assetFilter === ALL_HISTORY_FILTER || setup.symbol === assetFilter;
        return statusMatches && categoryMatches && assetMatches;
      }),
      sortBy,
    );
  }, [assetFilter, categoryFilter, setups, sortBy, statusFilter]);

  const groupedSetups = useMemo(
    () => groupHistorySetups(filteredSetups, groupBy),
    [filteredSetups, groupBy],
  );
  const confidenceBands = useMemo(
    () => buildConfidenceBands(filteredSetups),
    [filteredSetups],
  );
  const activeFilterCount = [
    statusFilter !== "all",
    categoryFilter !== ALL_HISTORY_FILTER,
    assetFilter !== ALL_HISTORY_FILTER,
  ].filter(Boolean).length;

  function clearFilters() {
    setStatusFilter("all");
    setCategoryFilter(ALL_HISTORY_FILTER);
    setAssetFilter(ALL_HISTORY_FILTER);
    setGroupBy("date");
    setSortBy("newest");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="terminal-panel p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Results
            </p>
            <h2 className="text-2xl font-semibold tracking-normal text-navy">
              Insights
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate">
              See which setups were shown, how they finished, and where
              performance is improving.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm font-semibold text-slate">
              {loading
                ? "Loading"
                : `${filteredSetups.length} of ${setups.length} shown`}
            </p>
            {activeFilterCount > 0 ? (
              <button
                className="mt-1 text-sm font-bold text-bullish"
                type="button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatPill label="Total setups" value={summary.total.toString()} />
          <StatPill
            label="Overall win rate"
            value={summary.winRate === null ? "Pending" : `${summary.winRate}%`}
          />
          <StatPill label="Reached target" value={summary.wins.toString()} />
          <StatPill label="Hit stop" value={summary.losses.toString()} />
          <StatPill label="Needs review" value={summary.ambiguous.toString()} />
          <StatPill label="Still tracking" value={summary.pending.toString()} />
        </div>

        <div className="mb-5 grid gap-3 rounded-lg border border-slate/15 bg-canvas p-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Status
            <select
              className="field min-h-11"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as HistoryStatusFilter)
              }
            >
              <option value="all">All statuses</option>
              {HISTORY_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {OUTCOME_COPY[status].filterLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Category
            <select
              className="field min-h-11"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value={ALL_HISTORY_FILTER}>All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Market
            <select
              className="field min-h-11"
              value={assetFilter}
              onChange={(event) => setAssetFilter(event.target.value)}
            >
              <option value={ALL_HISTORY_FILTER}>All markets</option>
              {assets.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Group by
            <select
              className="field min-h-11"
              value={groupBy}
              onChange={(event) =>
                setGroupBy(event.target.value as HistoryGroupBy)
              }
            >
              <option value="date">Date</option>
              <option value="status">Status</option>
              <option value="category">Category</option>
              <option value="asset">Market</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-navy">
            Sort
            <select
              className="field min-h-11"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as HistorySort)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="confidence">Highest confidence</option>
              <option value="asset">Market name</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4">
          {groupedSetups.map((group) => (
            <section key={group.key} className="min-w-0">
              <div className="mb-2 flex min-w-0 items-center justify-between gap-3 border-b border-slate/15 pb-2">
                <h3 className="min-w-0 text-lg font-semibold text-navy">
                  {group.label}
                </h3>
                <span className="shrink-0 text-sm font-semibold text-slate">
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "setup" : "setups"}
                </span>
              </div>
              <div className="grid gap-3">
                {group.items.map((setup) => (
                  <HistorySetupCard key={setup.id} setup={setup} />
                ))}
              </div>
            </section>
          ))}
        </div>
        {!loading && setups.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-slate">
            No setups have been logged yet.
          </p>
        ) : null}
        {!loading && setups.length > 0 && filteredSetups.length === 0 ? (
          <p className="mt-4 rounded-lg border border-slate/15 bg-canvas px-4 py-3 text-sm leading-6 text-slate">
            No setups match the current filters.
          </p>
        ) : null}
      </section>

      <aside className="grid content-start gap-5">
        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Performance
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              Resolution
            </h2>
          </div>
          <div className="grid gap-3">
            <HistoryPerformanceRow
              label="Finished setups"
              value={summary.resolved.toString()}
              detail={`${summary.wins} reached target / ${summary.losses} hit stop`}
              tone="neutral"
            />
            <HistoryPerformanceRow
              label="Needs review"
              value={summary.ambiguous.toString()}
              detail={OUTCOME_COPY.unclear_path.description}
              tone="neutral"
            />
            <HistoryPerformanceRow
              label="Entry not filled"
              value={summary.unfilled.toString()}
              detail={OUTCOME_COPY.entry_not_filled.description}
              tone="neutral"
            />
            <HistoryPerformanceRow
              label="Still tracking"
              value={summary.pending.toString()}
              detail={OUTCOME_COPY.still_tracking.description}
              tone={summary.pending > 0 ? "bullish" : "neutral"}
            />
          </div>
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Confidence
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              By score range
            </h2>
          </div>
          <div className="grid gap-3">
            {confidenceBands.map((band) => (
              <ConfidenceBandRow key={band.label} {...band} />
            ))}
          </div>
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Market trends
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              By market
            </h2>
          </div>
          <div className="grid gap-3">
            {categoryStats.map((stat) => (
              <HistoryStatRow
                key={stat.category}
                label={stat.category}
                stat={stat}
              />
            ))}
          </div>
          {categoryStats.length === 0 ? (
            <p className="text-sm leading-6 text-slate">
              Market results will appear after setups are logged.
            </p>
          ) : null}
        </section>

        <section className="terminal-panel p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-normal text-bullish">
              Market trends
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-normal text-navy">
              Most reviewed
            </h2>
          </div>
          <div className="grid gap-3">
            {stats.slice(0, 8).map((stat) => (
              <HistoryStatRow
                key={stat.symbol}
                label={stat.symbol}
                stat={stat}
              />
            ))}
          </div>
          {stats.length === 0 ? (
            <p className="text-sm leading-6 text-slate">
              Market results will appear after setups are reviewed.
            </p>
          ) : null}
        </section>
      </aside>
    </div>
  );
}

function HistorySetupCard({ setup }: { setup: TradeSetupRow }) {
  const outcome = getSetupOutcome(setup);
  const outcomeLabel = getOutcomeLabel(outcome);
  const isBuy = setup.side === "buy";
  const category = getSecurityOption(setup.symbol).assetType;
  const confluence = asRecord(setup.confluence);
  const setupKey = String(
    confluence.setupKey ?? setup.correlation_group ?? "setup type",
  );
  const rewardRisk = asNumber(confluence.rewardRisk);

  return (
    <article className="min-w-0 rounded-lg border border-slate/15 bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-semibold text-navy">{setup.symbol}</h4>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-bold uppercase text-slate">
              {category}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate">
            {formatDate(setup.created_at)}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-slate">
            {formatDisplayName(setupKey)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${isBuy ? "bg-bullish/10 text-bullish" : "bg-danger/10 text-danger"}`}
          >
            {setup.side} limit
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${getOutcomeClassName(outcome)}`}
          >
            {outcomeLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <HistoryMetric
          label="Entry"
          value={formatPriceValue(setup.limit_entry)}
          valueClassName={isBuy ? "text-bullish" : "text-danger"}
        />
        <HistoryMetric label="Stop" value={formatPriceValue(setup.stop_loss)} />
        <HistoryMetric
          label="Target"
          value={formatPriceValue(setup.take_profit)}
        />
        <HistoryMetric
          label="Break-even"
          value={formatPriceValue(setup.breakeven_trigger_price)}
        />
        <HistoryMetric
          label="Confidence"
          value={formatConfidenceWithTier(setup.confidence_score)}
        />
        <HistoryMetric
          label="Payoff"
          value={formatPayoff(rewardRisk)}
        />
      </div>
    </article>
  );
}

function HistoryMetric({
  label,
  value,
  valueClassName = "text-navy",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-normal text-slate">
        {label}
      </p>
      <p className={`mt-1 truncate font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function HistoryPerformanceRow({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "bullish" | "neutral";
  value: string;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${tone === "bullish" ? "border-bullish/25 bg-bullish/10" : "border-slate/15 bg-canvas"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-navy">{label}</p>
        <p className="text-lg font-semibold text-navy">{value}</p>
      </div>
      <p className="mt-1 text-sm leading-5 text-slate">{detail}</p>
    </div>
  );
}

function HistoryStatRow({
  label,
  stat,
}: {
  label: string;
  stat: CategoryStat | SecurityStat;
}) {
  const resolvedLabel =
    stat.winRate === null ? "Learning" : `${stat.winRate}% win rate`;
  const barWidth = stat.winRate === null ? 0 : stat.winRate;

  return (
    <div className="rounded-lg border border-slate/15 bg-canvas p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-navy">{label}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-slate">
            {stat.count} setups
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-navy">
          {resolvedLabel}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-bullish"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <p className="font-semibold text-navy">{stat.wins}</p>
          <p className="text-slate">Target</p>
        </div>
        <div>
          <p className="font-semibold text-navy">{stat.losses}</p>
          <p className="text-slate">Stop</p>
        </div>
        <div>
          <p className="font-semibold text-navy">{stat.pending}</p>
          <p className="text-slate">Tracking</p>
        </div>
        <div>
          <p className="font-semibold text-navy">{stat.ambiguous}</p>
          <p className="text-slate">Review</p>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBandRow({
  ambiguous,
  count,
  label,
  range,
  resolved,
  winRate,
}: {
  ambiguous: number;
  count: number;
  label: string;
  range: string;
  resolved: number;
  winRate: number | null;
}) {
  const barWidth = winRate ?? 0;

  return (
    <div className="rounded-lg border border-slate/15 bg-canvas p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-navy">{label}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-slate">
            {range} / {count} setups / {resolved} finished
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-navy">
          {winRate === null ? "Learning" : `${winRate}% win rate`}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div
          className="h-full rounded-full bg-bullish"
          style={{ width: `${barWidth}%` }}
        />
      </div>
      {ambiguous > 0 ? (
        <p className="mt-2 text-xs font-semibold text-slate">
          {ambiguous} need review
        </p>
      ) : null}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-2">
      <p className="font-semibold text-navy">{value}</p>
      <p className="text-slate">{label}</p>
    </div>
  );
}

function sortHistorySetups(setups: TradeSetupRow[], sortBy: HistorySort) {
  return [...setups].sort((first, second) => {
    const firstDate = new Date(first.created_at).getTime();
    const secondDate = new Date(second.created_at).getTime();

    if (sortBy === "oldest") {
      return firstDate - secondDate;
    }
    if (sortBy === "confidence") {
      return (
        Number(second.confidence_score) - Number(first.confidence_score) ||
        secondDate - firstDate
      );
    }
    if (sortBy === "asset") {
      return (
        compareAssetSymbols(first.symbol, second.symbol) ||
        secondDate - firstDate
      );
    }
    return secondDate - firstDate;
  });
}

function groupHistorySetups(
  setups: TradeSetupRow[],
  groupBy: HistoryGroupBy,
): HistorySetupGroup[] {
  const groups = new Map<string, HistorySetupGroup>();

  setups.forEach((setup) => {
    const group = getHistoryGroup(setup, groupBy);
    const existingGroup = groups.get(group.key);
    if (existingGroup) {
      existingGroup.items.push(setup);
      return;
    }
    groups.set(group.key, { ...group, items: [setup] });
  });

  const orderedGroups = Array.from(groups.values());
  if (groupBy === "asset") {
    return orderedGroups.sort((first, second) =>
      compareAssetSymbols(first.key, second.key),
    );
  }
  if (groupBy === "category") {
    return orderedGroups.sort((first, second) =>
      compareAssetCategories(
        first.key as SecurityType,
        second.key as SecurityType,
      ),
    );
  }
  if (groupBy === "status") {
    return orderedGroups.sort(
      (first, second) =>
        HISTORY_STATUS_ORDER.indexOf(first.key as SetupOutcome) -
        HISTORY_STATUS_ORDER.indexOf(second.key as SetupOutcome),
    );
  }
  return orderedGroups;
}

function buildConfidenceBands(setups: TradeSetupRow[]) {
  const bands = CONFIDENCE_TIERS.map((tier) => ({
      ambiguous: 0,
      count: 0,
      label: tier.label,
      losses: 0,
      max: tier.max,
      min: tier.min,
      range: formatConfidenceTierRange(tier),
      wins: 0,
  }));

  for (const setup of setups) {
    const score = Number(setup.confidence_score);
    const band = bands.find(
      (candidate) => score >= candidate.min && score <= candidate.max,
    );
    if (!band) {
      continue;
    }
    const outcome = getSetupOutcome(setup);
    band.count += 1;
    if (outcome === "target_reached") {
      band.wins += 1;
    } else if (outcome === "stopped_out") {
      band.losses += 1;
    } else if (outcome === "unclear_path") {
      band.ambiguous += 1;
    }
  }

  return bands.map((band) => {
    const resolved = band.wins + band.losses;
    return {
      ambiguous: band.ambiguous,
      count: band.count,
      label: band.label,
      range: band.range,
      resolved,
      winRate: resolved > 0 ? Math.round((band.wins / resolved) * 100) : null,
    };
  });
}

function getHistoryGroup(
  setup: TradeSetupRow,
  groupBy: HistoryGroupBy,
): Omit<HistorySetupGroup, "items"> {
  if (groupBy === "asset") {
    return { key: setup.symbol, label: formatSecurityLabel(setup.symbol) };
  }
  if (groupBy === "category") {
    const category = getSecurityOption(setup.symbol).assetType;
    return { key: category, label: category };
  }
  if (groupBy === "status") {
    const outcome = getSetupOutcome(setup);
    return { key: outcome, label: getOutcomeLabel(outcome) };
  }

  const date = new Date(setup.created_at);
  const key = Number.isNaN(date.getTime())
    ? "unknown-date"
    : date.toISOString().slice(0, 10);
  return { key, label: formatHistoryDateGroup(date) };
}

function formatHistoryDateGroup(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();

  if (dateStart === todayStart) {
    return "Today";
  }
  if (dateStart === todayStart - 86_400_000) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

function getSetupOutcome(setup: TradeSetupRow): SetupOutcome {
  return normalizeSetupOutcome(setup);
}

function getOutcomeLabel(outcome: SetupOutcome) {
  return OUTCOME_COPY[outcome].label;
}

function getOutcomeClassName(outcome: SetupOutcome) {
  if (outcome === "target_reached") {
    return "bg-bullish/10 text-bullish";
  }
  if (outcome === "stopped_out") {
    return "bg-danger/10 text-danger";
  }
  if (outcome === "entry_not_filled") {
    return "bg-warning/15 text-warning";
  }
  if (outcome === "unclear_path") {
    return "bg-slate/10 text-slate";
  }
  return "bg-navy/10 text-navy";
}

function formatPriceValue(value: number | string | null | undefined) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatNumber(numericValue) : "Pending";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
  });
}

function formatPayoff(value: number | null) {
  return value === null ? "Pending" : `${value.toFixed(2)}x payoff`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatDisplayName(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}
