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
  AVAILABLE_ASSET_GROUPS,
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
import {
  countMarketScanCandidatesInCategory,
  filterMarketScanCandidates,
  getMarketScanSymbolsForCategory,
  type MarketScanCategoryFilter,
} from "./marketScanFilters";
import { describeExecutionLabel } from "./reviewCopy";

type ConfidenceBand = "all" | ConfidenceTierId;

type MarketScanPanelProps = {
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
  const emptyMessage = result
    ? "No markets match the current scan filters."
    : "Scan every active market to find the strongest current limit setups.";

  return (
    <section className="terminal-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate">Market scan</p>
          <h3 className="text-lg font-semibold tracking-normal text-navy">
            Best current markets
          </h3>
        </div>
        <button
          className="secondary-button min-h-10 px-3 py-2"
          type="button"
          onClick={() => onScan(scanSymbols)}
          disabled={status === "scanning" || scanSymbols.length === 0}
        >
          {status === "scanning"
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Scan
        </button>
      </div>

      <div className="mb-4 grid gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate">
            Group
            <select
              className="field h-10 text-sm normal-case"
              value={categoryFilter}
              onChange={(event) => {
                const nextCategory = event.target
                  .value as MarketScanCategoryFilter;
                setCategoryFilter(nextCategory);
                // A group change re-scans that group immediately so counts
                // and rows always describe the symbols actually reviewed.
                onScan(getMarketScanSymbolsForCategory(nextCategory));
              }}
            >
              <option value="all">All markets</option>
              {AVAILABLE_ASSET_GROUPS.map((group) => (
                <option key={group.label} value={group.label}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-normal text-slate">
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
        <MarketScanSummary
          blockedCount={blockedCount}
          result={result}
          topCandidate={topCandidate}
          visibleCount={filteredOpportunities.length}
        />
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
          <div className="rounded-lg border border-slate/15 bg-canvas px-4 py-5 text-sm leading-6 text-slate">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-white text-navy">
              <Search className="h-5 w-5" aria-hidden="true" />
            </div>
            {status === "scanning" ? "Checking active markets." : emptyMessage}
          </div>
        )}

      {result
        ? (
          <p className="mt-3 text-xs font-semibold uppercase tracking-normal text-slate">
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
  result: MarketScanResponse | null;
  topCandidate: MarketScanCandidate | null;
  visibleCount: number;
}) {
  if (!result) {
    return (
      <div className="rounded-lg border border-slate/15 bg-canvas px-3 py-2 text-xs font-semibold leading-5 text-slate">
        Market Scan uses the same review rules as the main advisor and shows
        only the strongest setup when closely linked markets qualify together.
        Cost ratings: Clean and Acceptable mean spread and slippage leave the
        payoff intact; Thin and Poor mean costs eat a meaningful share of it.
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg border border-slate/15 bg-canvas p-3 text-xs font-semibold leading-5 text-slate">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {visibleCount} shown from {result.scanned} reviewed
          </span>
        </span>
        <span className="shrink-0">{blockedCount} not shown</span>
      </div>
      {topCandidate
        ? (
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-white px-2 py-2">
            <span className="min-w-0 truncate text-navy">
              Top: {formatSecurityLabel(topCandidate.symbol)}
            </span>
            <span className="shrink-0 text-bullish">
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
  const sideLabel = candidate.side
    ? `${candidate.side.toUpperCase()} LIMIT`
    : "Review";
  const levelPreview = candidate.entryPrice && candidate.takeProfit
    ? candidate.takeProfit1
      ? `Entry ${formatNumber(candidate.entryPrice)} / TP1 ${
        formatNumber(candidate.takeProfit1)
      } / Runner ${formatNumber(candidate.takeProfit)}`
      : `Entry ${formatNumber(candidate.entryPrice)} / Target ${
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
      className="grid min-w-0 gap-3 rounded-lg border border-slate/15 bg-canvas px-3 py-3 text-left transition hover:border-bullish/40 hover:bg-bullish/10"
      type="button"
      onClick={() => onSelectCandidate(candidate)}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-xs font-bold text-navy">
              {rank}
            </span>
            <p className="truncate font-semibold text-navy">
              {formatSecurityLabel(candidate.symbol)}
            </p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-normal text-slate">
            {formatAssetType(candidate.assetType)}
          </p>
        </div>
        <span
          className={`shrink-0 whitespace-nowrap text-xs font-bold uppercase ${
            isBuy ? "text-bullish" : "text-danger"
          }`}
        >
          {sideLabel}
        </span>
      </div>

      <div className="grid gap-2 rounded-lg bg-white px-3 py-2 text-xs sm:grid-cols-3">
        <Metric
          label="Confidence"
          value={formatConfidenceWithTier(candidate.confidenceScore)}
        />
        <Metric label="Payoff" value={formatPayoff(candidate.rewardRisk)} />
        <Metric
          label="Costs"
          title={describeExecutionLabel(candidate.executionLabel)}
          value={candidate.executionLabel || "Checked"}
        />
      </div>

      <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-slate">
        <Target className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{levelPreview}</span>
      </div>

      {relatedMarkets.length > 0
        ? (
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-slate/15 bg-white px-2 py-1.5 text-xs font-medium text-slate">
            <Filter
              className="h-3.5 w-3.5 shrink-0 text-bullish"
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
            className="flex min-w-0 items-start gap-2 rounded-md bg-white px-2 py-1.5 text-xs leading-5 text-slate"
          >
            <ShieldCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bullish"
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
  { label, title, value }: { label: string; title?: string; value: string },
) {
  return (
    <div className="min-w-0" title={title}>
      <p className="font-semibold uppercase tracking-normal text-slate">
        {label}
      </p>
      <p className="mt-0.5 truncate font-semibold text-navy">{value}</p>
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
