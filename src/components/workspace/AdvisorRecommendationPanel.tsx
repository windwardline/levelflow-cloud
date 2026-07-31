import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";
import {
  formatSecurityLabel,
  getSecurityOption,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import type { AnalyzerResponse, AnalyzerSetup } from "../../lib/tradeAnalyzer";
import { ConfidenceUnit } from "./ConfidenceUnit";
import { HowThisWorksLink } from "./HowThisWorksLink";
import { SetupQualityReceipt } from "./SetupQualityReceipt";
import {
  describeExecutionLabel,
  formatStrategyName,
  uniqueReviewMessages,
} from "./reviewCopy";
import { formatNumber, formatTimestamp } from "./advisorFormat";
import { MetricRow } from "./AdvisorMetricRow";

// Spec §7, verbatim, load-bearing: the exact wording the design authority
// signed off on. Render it as-is everywhere the ladder values appear —
// never paraphrase it, even to shorten a line.
const LADDER_TARGET_INSTRUCTION =
  "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — profit locked either way.";

export function RecommendationPanel({
  notice,
  result,
  setup,
  status,
  symbol,
}: {
  notice: string;
  result: AnalyzerResponse | null;
  setup: AnalyzerSetup | null;
  status: "idle" | "analyzing";
  symbol: SupportedSymbol;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyResetRef = useRef<number | null>(null);

  // The ✓ confirmation is transient (spec §7); a second copy before the
  // first one clears must restart the clock, not race it, and a pending
  // timer must never fire setState after the panel unmounts.
  useEffect(() => {
    return () => {
      if (copyResetRef.current !== null) {
        window.clearTimeout(copyResetRef.current);
      }
    };
  }, []);

  function handleCopy(field: string, value: string) {
    void navigator.clipboard?.writeText(value);
    if (copyResetRef.current !== null) {
      window.clearTimeout(copyResetRef.current);
    }
    setCopiedField(field);
    copyResetRef.current = window.setTimeout(() => setCopiedField(null), 2000);
  }

  if (status === "analyzing") {
    return <AnalysisProgress symbol={symbol} />;
  }

  if (setup) {
    const isBuy = setup.side === "buy";
    const assetType = getSecurityOption(symbol).assetType;
    const hasLadder = typeof setup.takeProfit1 === "number" &&
      setup.takeProfit1 > 0;
    const executionLabel = String(
      (setup.riskModel as Record<string, Record<string, unknown>>)
        ?.executionQuality?.label ?? "",
    );
    const rewardRisk = Number(
      (setup.confluence as Record<string, unknown>)?.rewardRisk ?? 0,
    );

    return (
      <div className="grid gap-4">
        <div className="flex justify-center">
          <span className={`chip ${isBuy ? "text-buy" : "text-sell"}`}>
            {isBuy ? "Buy" : "Sell"} limit
          </span>
        </div>
        <ConfidenceUnit assetType={assetType} score={setup.confidenceScore} />
        <p>
          <HowThisWorksLink anchor="confidence-tiers" />
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-hairline bg-paper px-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="font-semibold uppercase tracking-normal text-ink-muted">
              Payoff
            </p>
            <p className="mt-0.5 truncate font-mono font-semibold tabular-nums text-ink">
              {rewardRisk > 0 ? `${rewardRisk.toFixed(2)}x` : "Pending"}
            </p>
          </div>
          <div
            className="min-w-0"
            title={describeExecutionLabel(executionLabel)}
          >
            <p className="font-semibold uppercase tracking-normal text-ink-muted">
              Costs
            </p>
            <p className="mt-0.5 truncate font-semibold text-ink">
              {executionLabel || "Checked"}
            </p>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <CopyableMetricRow
            copied={copiedField === "entry"}
            label="Limit entry"
            onCopy={() => handleCopy("entry", formatNumber(setup.entryPrice))}
            value={formatNumber(setup.entryPrice)}
            valueClassName={isBuy ? "text-buy" : "text-sell"}
          />
          <CopyableMetricRow
            copied={copiedField === "stop"}
            label="Stop loss"
            onCopy={() => handleCopy("stop", formatNumber(setup.stopLoss))}
            value={formatNumber(setup.stopLoss)}
          />
          {hasLadder
            ? (
              <CopyableMetricRow
                copied={copiedField === "target1"}
                label="Target 1 · bank half"
                onCopy={() => handleCopy("target1", formatNumber(setup.takeProfit1!))}
                value={formatNumber(setup.takeProfit1!)}
              />
            )
            : null}
          <CopyableMetricRow
            copied={copiedField === "target2"}
            label={hasLadder ? "Target 2 · take-profit" : "Target"}
            onCopy={() => handleCopy("target2", formatNumber(setup.takeProfit))}
            value={formatNumber(setup.takeProfit)}
          />
          {setup.expiresAt
            ? (
              <MetricRow
                label="Valid until"
                value={formatTimestamp(setup.expiresAt)}
              />
            )
            : null}
        </div>
        {hasLadder
          ? (
            <div className="grid gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-2 text-xs leading-5 text-ink-muted">
              <p>{LADDER_TARGET_INSTRUCTION}</p>
              <HowThisWorksLink anchor="targets-and-stops" />
            </div>
          )
          : null}
        {setup.correlationGroup
          ? (
            <p className="rounded-lg border border-hairline bg-paper px-3 py-2 text-xs font-medium leading-5 text-ink-muted">
              Closely linked market group: {formatStrategyName(setup.correlationGroup)}. Only the
              strongest setup in a linked group is shown at a time.
            </p>
          )
          : null}
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            isBuy ? "bg-buy/10 text-buy" : "bg-sell/10 text-sell"
          }`}
        >
          {result?.deduplicated
            ? (
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            )
            : (
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
            )}
          {notice || "Current setup ready for review."}
        </div>
        <SetupQualityReceipt result={result} setup={setup} />
      </div>
    );
  }

  if (result?.blocked || result?.reason || result?.providerWarnings?.length) {
    return <NoSetupPanel notice={notice} result={result} symbol={symbol} />;
  }

  return (
    <div className="grid gap-4 text-sm leading-6 text-ink-muted">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ink text-paper">
        <Target className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-ink">Ready for review</h3>
        <p className="mt-1">
          {notice ||
            "Select a market, review the chart, then ask Levelflow for the current limit setup."}
        </p>
      </div>
    </div>
  );
}

// Spec §7: every ladder value (Entry, Stop, Target 1, Target 2) copies on
// its own — the value plus a subtle ⧉ affordance that flips to a ✓ for a
// couple of seconds. `value` is written to the clipboard exactly as shown,
// with no label, side, or symbol stitched on.
function CopyableMetricRow({
  copied,
  label,
  onCopy,
  value,
  valueClassName = "text-ink",
}: {
  copied: boolean;
  label: string;
  onCopy: () => void;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-h-10 min-w-0 items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2">
      <span className="min-w-0 text-ink-muted">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={`min-w-0 text-right font-mono font-semibold tabular-nums ${valueClassName}`}
        >
          {value}
        </span>
        <button
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className="cpv-copy"
          onClick={onCopy}
          type="button"
        >
          {copied
            ? <Check aria-hidden="true" className="h-4 w-4 text-buy" />
            : <Copy aria-hidden="true" className="h-4 w-4" />}
        </button>
      </span>
    </div>
  );
}

function AnalysisProgress({ symbol }: { symbol: SupportedSymbol }) {
  const steps = [
    "Refreshing chart data",
    "Checking direction",
    "Checking timing risk",
    "Building limit levels",
  ];

  return (
    <div className="grid gap-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ink text-paper">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-normal text-accent">
          Analyzing {symbol}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-ink">
          Building the current setup
        </h3>
      </div>
      <div className="grid gap-2">
        {steps.map((step) => (
          <div
            key={step}
            className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-sm font-semibold text-ink-muted"
          >
            <span className="h-2 w-2 rounded-full bg-accent" />
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function NoSetupPanel({
  notice,
  result,
  symbol,
}: {
  notice: string;
  result: AnalyzerResponse;
  symbol: SupportedSymbol;
}) {
  const reasons = uniqueReviewMessages([
    result.reason ?? notice,
    ...(result.analysisDiagnostics ?? []),
    ...(result.providerWarnings ?? []),
    result.learningRefresh?.reason ? result.learningRefresh.reason : "",
  ]);
  const primaryReason = reasons[0] ??
    "The current mix of direction, timing, and payoff is not strong enough.";
  const supportingReasons = reasons.slice(1, 4);
  const relatedMarketBlocked = /stronger (?:related|closely linked) setup/i
    .test(primaryReason);

  return (
    <div className="grid gap-4 text-sm leading-6 text-ink-muted">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-caution/15 text-caution">
        <XCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-normal text-accent">
          No trade setup
        </p>
        <h3 className="mt-1 text-lg font-semibold text-ink">
          {relatedMarketBlocked ? "Related market is stronger" : "Nothing passed review"}
        </h3>
        <p className="mt-1">
          {relatedMarketBlocked
            ? `${formatSecurityLabel(symbol)} is not shown because a closely linked market has the better current setup.`
            : (
              <>
                Levelflow cleared the prior display for{" "}
                {formatSecurityLabel(symbol)} and did not find a current limit
                setup strong enough to show.
              </>
            )}
        </p>
      </div>
      <div className="rounded-lg border border-hairline bg-paper px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          Primary reason
        </p>
        <p className="mt-1 font-medium text-ink">{primaryReason}</p>
      </div>
      {supportingReasons.length > 0
        ? (
          <div className="grid gap-2">
            {supportingReasons.map((reason) => (
              <div
                key={reason}
                className="rounded-lg border border-hairline bg-paper px-3 py-2 font-medium text-ink-muted"
              >
                {reason}
              </div>
            ))}
          </div>
        )
        : null}
    </div>
  );
}
