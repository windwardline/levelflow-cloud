import {
  CheckCircle2,
  Clipboard,
  Loader2,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";
import { ConfidenceGauge } from "../trade/ConfidenceGauge";
import { formatSecurityLabel, type SupportedSymbol } from "../../lib/symbolMap";
import type { AnalyzerResponse, AnalyzerSetup } from "../../lib/tradeAnalyzer";
import { SetupQualityReceipt } from "./SetupQualityReceipt";
import { uniqueReviewMessages } from "./reviewCopy";
import { formatNumber, formatTimestamp } from "./advisorFormat";
import { MetricRow } from "./AdvisorMetricRow";

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
  if (status === "analyzing") {
    return <AnalysisProgress symbol={symbol} />;
  }

  if (setup) {
    const isBuy = setup.side === "buy";
    const levelSummary = `${setup.side.toUpperCase()} LIMIT ${setup.symbol} @ ${
      formatNumber(setup.entryPrice)
    } | SL ${formatNumber(setup.stopLoss)} | TP ${
      formatNumber(setup.takeProfit)
    }`;

    return (
      <div className="grid gap-4">
        <div
          className={`rounded-lg px-4 py-3 text-center text-xl font-bold tracking-normal ${
            isBuy ? "bg-bullish/10 text-bullish" : "bg-danger/10 text-danger"
          }`}
        >
          {setup.side.toUpperCase()} LIMIT
        </div>
        <ConfidenceGauge score={setup.confidenceScore} />
        <div className="grid gap-2 text-sm">
          <MetricRow
            label="Limit entry"
            value={formatNumber(setup.entryPrice)}
            valueClassName={isBuy ? "text-bullish" : "text-danger"}
          />
          <MetricRow label="Stop loss" value={formatNumber(setup.stopLoss)} />
          <MetricRow
            label="Take profit"
            value={formatNumber(setup.takeProfit)}
          />
          <MetricRow
            label="Break-even reference"
            value={formatNumber(setup.breakevenTriggerPrice)}
          />
          {setup.expiresAt
            ? (
              <MetricRow
                label="Review by"
                value={formatTimestamp(setup.expiresAt)}
              />
            )
            : null}
        </div>
        <button
          className="secondary-button w-full"
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(levelSummary);
          }}
        >
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          Copy levels
        </button>
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
            isBuy ? "bg-bullish/10 text-bullish" : "bg-danger/10 text-danger"
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
    <div className="grid gap-4 text-sm leading-6 text-slate">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy text-white">
        <Target className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-navy">Ready for review</h3>
        <p className="mt-1">
          {notice ||
            "Select a market, review the chart, then ask LevelFlow for the current limit setup."}
        </p>
      </div>
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
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-navy text-white">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-normal text-bullish">
          Analyzing {symbol}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-navy">
          Building the current setup
        </h3>
      </div>
      <div className="grid gap-2">
        {steps.map((step) => (
          <div
            key={step}
            className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-sm font-semibold text-slate"
          >
            <span className="h-2 w-2 rounded-full bg-bullish" />
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

  return (
    <div className="grid gap-4 text-sm leading-6 text-slate">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/15 text-warning">
        <XCircle className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-normal text-bullish">
          No trade setup
        </p>
        <h3 className="mt-1 text-lg font-semibold text-navy">
          Nothing passed review
        </h3>
        <p className="mt-1">
          LevelFlow cleared the prior display for {formatSecurityLabel(symbol)}
          {" "}
          and did not find a current limit setup strong enough to show.
        </p>
      </div>
      <div className="rounded-lg border border-slate/15 bg-canvas px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-normal text-slate">
          Primary reason
        </p>
        <p className="mt-1 font-medium text-navy">{primaryReason}</p>
      </div>
      {supportingReasons.length > 0
        ? (
          <div className="grid gap-2">
            {supportingReasons.map((reason) => (
              <div
                key={reason}
                className="rounded-lg border border-slate/15 bg-canvas px-3 py-2 font-medium text-slate"
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
