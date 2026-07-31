import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Copy, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { formatSecurityLabel, type SupportedSymbol } from "../../lib/symbolMap";
import type { AnalyzerResponse, AnalyzerSetup } from "../../lib/tradeAnalyzer";
import { HowThisWorksLink } from "./HowThisWorksLink";
import { SetupQualityReceipt } from "./SetupQualityReceipt";
import { formatStrategyName, uniqueReviewMessages } from "./reviewCopy";
import { formatCopyValue, formatNumber } from "./advisorFormat";

// Spec §7, verbatim, load-bearing: the exact wording the design authority
// signed off on. Render it as-is everywhere the ladder values appear —
// never paraphrase it, even to shorten a line.
const LADDER_TARGET_INSTRUCTION =
  "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — profit locked either way.";

// The stage's setup sheet (spec §16, a-desk-v3.html:196-213): the sheet
// itself is the ONE frame — AdvisorWorkspace draws it, attached hairline-flush
// under the chart — so nothing in here carries a border, radius or fill of its
// own. With a setup showing, the sheet splits into the ladder (left) and "Why
// this setup" (right); every other state fills it as a single padded column.
//
// The side tag, the confidence unit and the valid-until stamp all moved up to
// the stagehead (AdvisorWorkspace + ConfidenceUnit) — this panel starts at the
// ladder.
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

  // m1: the ✓ is now success-conditional — it only appears once the write
  // actually resolves, never on a rejected/unavailable clipboard, so it
  // can't silently claim a copy that didn't happen.
  async function handleCopy(field: string, value: string) {
    if (!navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
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
    const hasLadder = typeof setup.takeProfit1 === "number" &&
      setup.takeProfit1 > 0;
    const rewardRisk = Number(
      (setup.confluence as Record<string, unknown>)?.rewardRisk ?? 0,
    );

    return (
      <div className="grid min-w-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-w-0 border-b border-hairline px-5 py-4 lg:border-b-0 lg:border-r">
          {/* Payoff was its own metric box before spec §16; the mock folds it
              into the ladder's eyebrow (a-desk-v3.html:198). Costs kept their
              own row inside "Why this setup" all along. */}
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-normal text-ink-muted">
            The setup · payoff{" "}
            <span className="font-mono tabular-nums">
              {rewardRisk > 0 ? `${rewardRisk.toFixed(2)}x` : "Pending"}
            </span>
          </p>
          <div className="grid">
            <CopyableMetricRow
              copied={copiedField === "entry"}
              label="Limit entry"
              onCopy={() => handleCopy("entry", formatCopyValue(setup.entryPrice))}
              value={formatNumber(setup.entryPrice)}
              valueClassName={isBuy ? "text-buy" : "text-sell"}
            />
            <CopyableMetricRow
              copied={copiedField === "stop"}
              label="Stop loss"
              onCopy={() => handleCopy("stop", formatCopyValue(setup.stopLoss))}
              value={formatNumber(setup.stopLoss)}
              valueClassName="text-sell"
            />
            {hasLadder
              ? (
                <CopyableMetricRow
                  copied={copiedField === "target1"}
                  label="Target 1 · bank half"
                  onCopy={() => handleCopy("target1", formatCopyValue(setup.takeProfit1!))}
                  value={formatNumber(setup.takeProfit1!)}
                  valueClassName="text-buy"
                />
              )
              : null}
            <CopyableMetricRow
              copied={copiedField === "target2"}
              label={hasLadder ? "Target 2 · take-profit" : "Target"}
              onCopy={() => handleCopy("target2", formatCopyValue(setup.takeProfit))}
              value={formatNumber(setup.takeProfit)}
              valueClassName="text-buy"
            />
          </div>
          {hasLadder
            ? (
              <p className="mt-3 border-t border-hairline pt-2.5 text-xs leading-5 text-ink-muted">
                {LADDER_TARGET_INSTRUCTION}{" "}
                <HowThisWorksLink anchor="targets-and-stops" />
              </p>
            )
            : null}
          {setup.correlationGroup
            ? (
              <p className="mt-2 text-xs font-medium leading-5 text-ink-muted">
                Closely linked market group: {formatStrategyName(setup.correlationGroup)}. Only the
                strongest setup in a linked group is shown at a time.
              </p>
            )
            : null}
          <p
            className={isBuy
              ? "mt-2.5 flex items-start gap-2 text-xs font-semibold leading-5 text-buy"
              : "mt-2.5 flex items-start gap-2 text-xs font-semibold leading-5 text-sell"}
          >
            {result?.deduplicated
              ? (
                <CheckCircle2
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              )
              : (
                <ShieldCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
              )}
            {notice || "Current setup ready for review."}
          </p>
        </div>
        <div className="min-w-0 px-5 py-4">
          <SetupQualityReceipt result={result} setup={setup} />
        </div>
      </div>
    );
  }

  if (result?.blocked || result?.reason || result?.providerWarnings?.length) {
    return <NoSetupPanel notice={notice} result={result} symbol={symbol} />;
  }

  return (
    <div className="grid min-w-0 gap-1 px-5 py-4 text-sm leading-6 text-ink-muted">
      <h3 className="text-base font-semibold text-ink">Ready for review</h3>
      <p>
        {notice ||
          "Select a market, review the chart, then ask Levelflow for the current limit setup."}
      </p>
    </div>
  );
}

// Spec §7: every ladder value (Entry, Stop, Target 1, Target 2) copies on
// its own — the value plus a subtle ⧉ affordance that flips to a ✓ for a
// couple of seconds. `value` is the readable, locale-formatted display
// string (what this component renders); `onCopy` is a closure the caller
// prepares with the actual clipboard payload baked in. The two are
// deliberately NOT the same string — see formatCopyValue in
// advisorFormat.ts — so no label, side, or symbol ever rides along, but
// also so a grouped/locale-formatted display value never corrupts a
// pasted price either.
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
    <div className="flex min-h-11 min-w-0 items-baseline justify-between gap-3 border-b border-hairline py-1.5 last:border-b-0">
      <span className="min-w-0 text-xs font-semibold uppercase tracking-normal text-ink-muted">
        {label}
      </span>
      <span className="flex min-w-0 items-baseline gap-1">
        <span
          className={`min-w-0 text-right font-mono text-xl font-bold tabular-nums ${valueClassName}`}
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
    <div className="grid min-w-0 gap-2 px-5 py-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-accent">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Analyzing {symbol}
      </p>
      <h3 className="text-base font-semibold text-ink">
        Building the current setup
      </h3>
      <div className="grid gap-1">
        {steps.map((step) => (
          <p
            key={step}
            className="flex items-center gap-2 text-sm font-medium text-ink-muted"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            {step}
          </p>
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
    <div className="grid min-w-0 gap-2 px-5 py-4 text-sm leading-6 text-ink-muted">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-normal text-caution">
        <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        No trade setup
      </p>
      <h3 className="text-base font-semibold text-ink">
        {relatedMarketBlocked ? "Related market is stronger" : "Nothing passed review"}
      </h3>
      <p>
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
      <div className="mt-1 border-t border-hairline pt-2">
        <p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          Primary reason
        </p>
        <p className="mt-0.5 font-medium text-ink">{primaryReason}</p>
      </div>
      {supportingReasons.length > 0
        ? (
          <div className="grid gap-1">
            {supportingReasons.map((reason) => (
              <p key={reason} className="text-xs font-medium leading-5">
                {reason}
              </p>
            ))}
          </div>
        )
        : null}
    </div>
  );
}
