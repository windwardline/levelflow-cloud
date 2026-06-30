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

export function HistorySetupCard({ setup }: { setup: TradeSetupRow }) {
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
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
              isBuy ? "bg-bullish/10 text-bullish" : "bg-danger/10 text-danger"
            }`}
          >
            {setup.side} limit
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
              getOutcomeClassName(outcome)
            }`}
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
