import { formatConfidenceWithTier } from "../../lib/confidenceTiers";
import { getSecurityOption } from "../../lib/symbolMap";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";
import {
  asNumber,
  asRecord,
  formatDate,
  formatDisplayName,
  formatPayoff,
  formatPriceValue,
  getOutcomeClassName,
  getOutcomeLabel,
  getSetupOutcome,
} from "./historyUtils";
import { useWorkspaceNav } from "./WorkspaceNav";

export function HistorySetupCard({ setup }: { setup: TradeSetupRow }) {
  const nav = useWorkspaceNav();
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
    <article className="min-w-0 rounded-lg border border-hairline bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-semibold text-ink">{setup.symbol}</h4>
            <span className="chip text-ink-muted">{category}</span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {formatDate(setup.created_at)}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            {formatDisplayName(setupKey)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`chip ${isBuy ? "text-buy" : "text-sell"}`}>
            {setup.side} limit
          </span>
          <span className={`chip ${getOutcomeClassName(outcome)}`}>
            {outcomeLabel}
          </span>
          <button
            className="tertiary-link"
            type="button"
            onClick={() => nav.openAdvisor(setup.symbol)}
          >
            Open in Advisor
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <HistoryMetric
          label="Entry"
          value={formatPriceValue(setup.limit_entry)}
          valueClassName={isBuy ? "text-buy" : "text-sell"}
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
  valueClassName = "text-ink",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-sheet px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
        {label}
      </p>
      <p
        className={`mt-1 truncate font-mono font-semibold tabular-nums ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  );
}
