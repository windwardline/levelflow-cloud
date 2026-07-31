import { useMemo, useState } from "react";
import {
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
} from "lucide-react";
import {
  SCANNABLE_ASSET_GROUPS,
  formatSecurityLabel,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import {
  CONFIDENCE_TIERS,
  type ConfidenceTierId,
  formatConfidenceTierRange,
  formatConfidenceWithTier,
} from "../../lib/confidenceTiers";
import type {
  MarketScanCandidate,
  MarketScanResponse,
} from "../../lib/tradeAnalyzer";
import { HowThisWorksLink } from "./HowThisWorksLink";
import {
  countMarketScanCandidatesInCategory,
  filterMarketScanCandidates,
  getMarketScanSymbolsForCategory,
  type MarketScanCategoryFilter,
} from "./marketScanFilters";
import { describeExecutionLabel } from "./reviewCopy";

type ConfidenceBand = "all" | ConfidenceTierId;

type MarketScanPanelProps = {
  onResetResult: () => void;
  onScan: (symbols: SupportedSymbol[]) => void;
  onSelectCandidate: (candidate: MarketScanCandidate) => void;
  result: MarketScanResponse | null;
  status: "idle" | "scanning";
};

const CONFIDENCE_BANDS: Array<
  { label: string; min: number; value: ConfidenceBand }
> = [
  { label: "All tiers", min: 0, value: "all" },
  ...[...CONFIDENCE_TIERS].reverse().map((tier) => ({
    label: `${tier.label} (${formatConfidenceTierRange(tier)}%)`,
    min: tier.min,
    value: tier.id,
  })),
];

export function MarketScanPanel({
  onResetResult,
  onScan,
  onSelectCandidate,
  result,
  status,
}: MarketScanPanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<MarketScanCategoryFilter>(
    "all",
  );
  const [confidenceBand, setConfidenceBand] = useState<ConfidenceBand>("all");
  const selectedBand =
    CONFIDENCE_BANDS.find((band) => band.value === confidenceBand) ??
      CONFIDENCE_BANDS[0];
  const scanSymbols = useMemo(
    () => getMarketScanSymbolsForCategory(categoryFilter),
    [categoryFilter],
  );
  const filteredOpportunities = useMemo(
    () =>
      filterMarketScanCandidates(
        result?.opportunities ?? [],
        categoryFilter,
        selectedBand.min,
      ),
    [categoryFilter, result?.opportunities, selectedBand.min],
  );
  const blockedCount = useMemo(
    () =>
      countMarketScanCandidatesInCategory(
        result?.blocked ?? [],
        categoryFilter,
      ),
    [categoryFilter, result?.blocked],
  );
  const topCandidate = filteredOpportunities[0] ?? null;
  const emptyMessage = result?.failed
    ? "Market scan could not complete. Try again shortly."
    : result
    ? "No markets match the current scan filters."
    : "Scan every active market to find the strongest current limit setups.";

  return (
    <section className="terminal-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-muted">Market scan</p>
          <h3 className="text-lg font-semibold tracking-normal text-ink">
            Best current markets
          </h3>
        </div>
        <button
          className="secondary-button min-h-10 px-3 py-2"
          type="button"
          onClick={() => onScan(categoryFilter === "all" ? [] : scanSymbols)}
          disabled={status === "scanning" ||
            (categoryFilter !== "all" && scanSymbols.length === 0)}
        >
          {status === "scanning"
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Scan
        </button>
      </div>

      <div className="mb-4 grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            Group
            <select
              className="field h-10 text-sm normal-case"
              value={categoryFilter}
              onChange={(event) => {
                const nextCategory = event.target
                  .value as MarketScanCategoryFilter;
                setCategoryFilter(nextCategory);
                // The engine never runs without an explicit Scan click.
                // Changing the group clears the previous result so stale
                // counts can never describe a different symbol set.
                onResetResult();
              }}
            >
              <option value="all">All markets</option>
              {SCANNABLE_ASSET_GROUPS.map((group) => (
                <option key={group.label} value={group.label}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            Quality
            <select
              className="field h-10 text-sm normal-case"
              value={confidenceBand}
              onChange={(event) =>
                setConfidenceBand(event.target.value as ConfidenceBand)}
            >
              {CONFIDENCE_BANDS.map((band) => (
                <option key={band.value} value={band.value}>
                  {band.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-lg border border-hairline bg-paper px-3 py-3">
          <p className="text-xs leading-5 text-ink-muted">
            Scan shows the strongest qualifying setup among closely linked
            markets. <HowThisWorksLink anchor="cost-ratings" />
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="chip text-buy">Clean</span>
            <span className="chip text-ink-muted">Acceptable</span>
            <span className="chip text-caution">Thin</span>
            <span className="chip text-sell">Poor</span>
          </div>
        </div>

        {result
          ? (
            <MarketScanSummary
              blockedCount={blockedCount}
              result={result}
              topCandidate={topCandidate}
              visibleCount={filteredOpportunities.length}
            />
          )
          : null}
      </div>

      {filteredOpportunities.length > 0
        ? (
          <div className="grid max-h-[640px] gap-3 overflow-y-auto pr-1">
            {filteredOpportunities.map((candidate, index) => (
              <MarketScanRow
                key={candidate.symbol}
                candidate={candidate}
                onSelectCandidate={onSelectCandidate}
                rank={index + 1}
              />
            ))}
          </div>
        )
        : (
          <div className="rounded-lg border border-hairline bg-paper px-4 py-5 text-sm leading-6 text-ink-muted">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-sheet text-ink">
              <Search className="h-5 w-5" aria-hidden="true" />
            </div>
            {status === "scanning" ? "Checking active markets." : emptyMessage}
          </div>
        )}

      {result && !result.failed
        ? (
          <p className="mt-3 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            {result.scanned}{" "}
            reviewed{blockedCount > 0 ? ` / ${blockedCount} not shown` : ""}.
            Select a row to load its chart.
          </p>
        )
        : null}
    </section>
  );
}

function MarketScanSummary({
  blockedCount,
  result,
  topCandidate,
  visibleCount,
}: {
  blockedCount: number;
  result: MarketScanResponse;
  topCandidate: MarketScanCandidate | null;
  visibleCount: number;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-hairline bg-paper p-3 text-xs font-semibold leading-5 text-ink-muted">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate font-mono tabular-nums">
            {visibleCount} shown from {result.scanned} reviewed
          </span>
        </span>
        <span className="shrink-0 font-mono tabular-nums">
          {blockedCount} not shown
        </span>
      </div>
      {topCandidate
        ? (
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-sheet px-2 py-2">
            <span className="min-w-0 truncate text-ink">
              Top: {formatSecurityLabel(topCandidate.symbol)}
            </span>
            <span className="shrink-0 font-mono tabular-nums text-accent">
              {formatConfidenceWithTier(topCandidate.confidenceScore)}
            </span>
          </div>
        )
        : null}
    </div>
  );
}

function MarketScanRow({
  candidate,
  onSelectCandidate,
  rank,
}: {
  candidate: MarketScanCandidate;
  onSelectCandidate: (candidate: MarketScanCandidate) => void;
  rank: number;
}) {
  const isBuy = candidate.side === "buy";
  const sideLabel = candidate.side ? `${candidate.side} limit` : "Review";
  const levelPreview = candidate.entryPrice && candidate.takeProfit
    ? candidate.takeProfit1
      ? `Entry ${formatNumber(candidate.entryPrice)} · First target ${
        formatNumber(candidate.takeProfit1)
      } · Second target ${formatNumber(candidate.takeProfit)}`
      : `Entry ${formatNumber(candidate.entryPrice)} · Target ${
        formatNumber(candidate.takeProfit)
      }`
    : "Load chart for details";
  const rationale = candidate.rationale?.length ? candidate.rationale : [
    `${formatConfidenceWithTier(candidate.confidenceScore)} confidence.`,
    `${formatPayoff(candidate.rewardRisk)} after review.`,
    candidate.executionLabel
      ? `${candidate.executionLabel} cost check.`
      : "Cost check complete.",
  ];
  const relatedMarkets = (candidate.relatedSymbols ?? [])
    .slice(0, 3)
    .map((symbol) => formatSecurityLabel(symbol));

  return (
    <button
      className="grid min-w-0 gap-3 rounded-lg border border-hairline bg-paper px-3 py-3 text-left transition hover:border-accent/40 hover:bg-accent/10"
      type="button"
      onClick={() => onSelectCandidate(candidate)}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sheet font-mono text-xs font-bold tabular-nums text-ink">
              {rank}
            </span>
            <p className="truncate font-semibold text-ink">
              {formatSecurityLabel(candidate.symbol)}
            </p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
            {formatAssetType(candidate.assetType)}
          </p>
        </div>
        <span className={`chip shrink-0 ${isBuy ? "text-buy" : "text-sell"}`}>
          {sideLabel}
        </span>
      </div>

      <div className="grid gap-2 rounded-lg bg-sheet px-3 py-2 text-xs sm:grid-cols-3">
        <Metric
          label="Confidence"
          mono
          value={formatConfidenceWithTier(candidate.confidenceScore)}
        />
        <Metric
          label="Payoff"
          mono
          value={formatPayoff(candidate.rewardRisk)}
        />
        <Metric
          label="Costs"
          title={describeExecutionLabel(candidate.executionLabel)}
          value={candidate.executionLabel || "Checked"}
        />
      </div>

      <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink-muted">
        <Target className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate font-mono tabular-nums">
          {levelPreview}
        </span>
      </div>

      {relatedMarkets.length > 0
        ? (
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-hairline bg-sheet px-2 py-1.5 text-xs font-medium text-ink-muted">
            <Filter
              className="h-3.5 w-3.5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span className="min-w-0 truncate">
              Related markets checked: {relatedMarkets.join(", ")}
            </span>
          </div>
        )
        : null}

      <div className="grid gap-1.5">
        {rationale.slice(0, 3).map((reason) => (
          <span
            key={reason}
            className="flex min-w-0 items-start gap-2 rounded-md bg-sheet px-2 py-1.5 text-xs leading-5 text-ink-muted"
          >
            <ShieldCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>{reason}</span>
          </span>
        ))}
      </div>
    </button>
  );
}

function Metric(
  { label, mono = false, title, value }: {
    label: string;
    mono?: boolean;
    title?: string;
    value: string;
  },
) {
  return (
    <div className="min-w-0" title={title}>
      <p className="font-semibold uppercase tracking-normal text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate font-semibold text-ink ${
          mono ? "font-mono tabular-nums" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function formatAssetType(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPayoff(value: number | null | undefined) {
  return value ? `${value.toFixed(2)}x` : "Pending";
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
  });
}
