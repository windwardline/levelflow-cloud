import { useState } from "react";
import {
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
} from "lucide-react";
import {
  formatSecurityLabel,
  getSecurityOption,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import { CONFIDENCE_THRESHOLD_BY_ASSET_TYPE } from "../../lib/advisorReview";
import { formatConfidenceWithTier } from "../../lib/confidenceTiers";
import type {
  MarketScanCandidate,
  MarketScanResponse,
} from "../../lib/tradeAnalyzer";
import { formatNumber } from "./advisorFormat";
import { HowThisWorksLink } from "./HowThisWorksLink";
import {
  filterMarketScanCandidatesByScope,
  filterSymbolsByAvailability,
  formatScanRowMeta,
  getMarketScanSymbolsForScope,
} from "./marketScanFilters";
import { describeExecutionLabel } from "./reviewCopy";
import { formatScopeCountLine, ScopeMenu, type ScanScope } from "./ScopeMenu";

type MarketScanPanelProps = {
  onResetResult: () => void;
  onScan: (symbols: SupportedSymbol[]) => void;
  onSelectCandidate: (candidate: MarketScanCandidate) => void;
  // Fires when the scope menu selects a single market - drives the stage
  // selection the same way clicking a scan row does today (spec §4:
  // "selecting a market scopes the scan to that one market and the stage
  // follows").
  onSelectSymbol: (symbol: SupportedSymbol) => void;
  result: MarketScanResponse | null;
  // Snapshot of when `result` was produced, for the count line's "{time}"
  // segment (spec §5). Frozen at completion by the caller rather than read
  // live here, so it doesn't silently advance on unrelated re-renders (the
  // workspace clock ticks every 60s).
  scanCompletedAt: Date | null;
  status: "idle" | "scanning";
};

export function MarketScanPanel({
  onResetResult,
  onScan,
  onSelectCandidate,
  onSelectSymbol,
  result,
  scanCompletedAt,
  status,
}: MarketScanPanelProps) {
  const [scope, setScope] = useState<ScanScope>({ kind: "all" });
  const scanSymbols = getMarketScanSymbolsForScope(scope);
  // I5: never sent straight to the server - a closed market has no chance
  // of qualifying and would only inflate the server's `scanned` count with
  // markets that were never really attempted. Computed fresh on every
  // render rather than memoized (same reasoning as ScopeMenu.tsx's own
  // clock: a `new Date()` dependency would defeat a memo anyway) so a scan
  // fired right on a market's open/close boundary still sees the current
  // answer.
  const openScanSymbols = filterSymbolsByAvailability(scanSymbols, new Date());
  const filteredOpportunities = filterMarketScanCandidatesByScope(
    result?.opportunities ?? [],
    scope,
  );
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
          onClick={() => onScan(openScanSymbols)}
          disabled={status === "scanning" || openScanSymbols.length === 0}
        >
          {status === "scanning"
            ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Scan
        </button>
      </div>

      <div className="mb-4 grid gap-2">
        <ScopeMenu
          label="Scan scope"
          value={scope}
          onSelect={(nextScope) => {
            setScope(nextScope);
            // The engine never runs without an explicit Scan click.
            // Changing scope clears the previous result so stale counts
            // can never describe a different symbol set.
            onResetResult();
            if (nextScope.kind === "symbol") {
              onSelectSymbol(nextScope.symbol);
            }
          }}
        />

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

        {result && !result.failed
          ? (
            <p className="rounded-lg border border-hairline bg-paper px-3 py-3 text-xs font-semibold leading-5 text-ink-muted">
              {formatScopeCountLine(
                scope,
                result,
                scanCompletedAt ?? new Date(),
              )}
            </p>
          )
          : null}
      </div>

      {filteredOpportunities.length > 0
        ? (
          <div className="scrolly grid max-h-[640px] gap-3 overflow-y-auto pr-1">
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
    </section>
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
  const rowMeta = formatScanRowMeta(candidate.side, candidate.confidenceScore);
  const confidenceThreshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE[
    getSecurityOption(candidate.symbol).assetType
  ];
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
    `${
      formatConfidenceWithTier(candidate.confidenceScore, confidenceThreshold)
    } confidence.`,
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
          {rowMeta}
        </span>
      </div>

      <div className="grid gap-2 rounded-lg bg-sheet px-3 py-2 text-xs sm:grid-cols-3">
        <Metric
          label="Confidence"
          mono
          value={formatConfidenceWithTier(
            candidate.confidenceScore,
            confidenceThreshold,
          )}
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
