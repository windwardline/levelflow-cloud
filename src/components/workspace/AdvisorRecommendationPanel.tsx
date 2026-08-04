import { useEffect, useRef, useState } from "react";
import { Check, Copy, XCircle } from "lucide-react";
import { sizeSetup, sizeUnitFor } from "../../lib/broker/sizing";
import { activeAccountOf, type UserProfile } from "../../lib/profile";
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
  profile,
  quotes,
  result,
  setup,
  symbol,
}: {
  profile: UserProfile;
  /** Levelflow's own in-roster quotes the client already holds (§19c). */
  quotes: Readonly<Record<string, number>>;
  result: AnalyzerResponse | null;
  setup: AnalyzerSetup | null;
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

  if (setup) {
    const isBuy = setup.side === "buy";
    const hasLadder = typeof setup.takeProfit1 === "number" &&
      setup.takeProfit1 > 0;
    const rewardRisk = Number(
      (setup.confluence as Record<string, unknown>)?.rewardRisk ?? 0,
    );

    return (
      <div className="grid min-w-0 lg:grid-cols-[1.1fr_0.9fr]">
        {/* §17m.3's budget: the ladder owns the majority of the sheet, and the
            sheet is a share of the region rather than whatever its content
            wants — so the ≥lg insets tighten (the mock's 20px inset stays
            horizontally; the vertical rhythm gives back 8px per column) while
            every row keeps its own 44px copy target and its type. */}
        <div className="min-w-0 border-b border-hairline px-5 py-4 max-lg:px-0 lg:border-b-0 lg:border-r lg:py-3">
          {/* Payoff was its own metric box before spec §16; the mock folds it
              into the ladder's eyebrow (a-desk-v3.html:198). Costs kept their
              own row inside "Why this setup" all along. */}
          <p className="eyebrow mb-1.5 lg:mb-1">
            The setup · payoff{" "}
            <span className="font-mono tabular-nums">
              {rewardRisk > 0 ? `${rewardRisk.toFixed(2)}x` : "Pending"}
            </span>
          </p>
          {/* Flush hairline rows on both platforms now (a-desk-v3.html:199-202,
              m-scan-v3.html:34-37): the hairline between two rows is the
              separation, so there is no gap to add below lg either. */}
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
            {/* Spec §19d: the Size row joins the ladder as its LAST row. Last for
                three reasons — the four price rows are one ladder and the canonical
                §7 instruction narrates them in order, so a non-price row inside them
                breaks the taught sequence; a conditional row at the end never
                reflows the rows above it when a program is set or cleared; and it
                inherits the existing flush-hairline rhythm without touching a single
                row above it. Both platforms get it from this one render path. */}
            <SizeRow
              copied={copiedField === "size"}
              onCopy={(payload) => handleCopy("size", payload)}
              profile={profile}
              quotes={quotes}
              setup={setup}
            />
          </div>
          {hasLadder
            ? (
              <p className="mt-3 border-t border-hairline pt-2.5 text-xs leading-5 text-ink-muted lg:mt-2 lg:pt-2">
                {LADDER_TARGET_INSTRUCTION}{" "}
                <HowThisWorksLink anchor="targets-and-stops" />
              </p>
            )
            : null}
          {setup.correlationGroup
            ? (
              <p className="mt-2 text-xs font-medium leading-5 text-ink-muted lg:mt-1.5">
                Closely linked market group: {formatStrategyName(setup.correlationGroup)}. Only the
                strongest setup in a linked group is shown at a time.
              </p>
            )
            : null}
        </div>
        <div className="min-w-0 px-5 py-4 max-lg:px-0 lg:py-3">
          <SetupQualityReceipt result={result} setup={setup} />
        </div>
      </div>
    );
  }

  if (result?.blocked || result?.reason || result?.providerWarnings?.length) {
    return <NoSetupPanel result={result} symbol={symbol} />;
  }

  return (
    <div className="grid min-w-0 gap-1 px-5 py-4 text-sm leading-6 text-ink-muted max-lg:px-0">
      <h3 className="text-base font-semibold text-ink">No setup yet</h3>
      {/* Spec §17m.1: the Scan column is the only door, so this line names the
          one verb. The old wording ("Select a market, review the chart, then ask
          Levelflow…") narrated a stage picker and a Review button that no longer
          exist. §17f keeps what is left to the one thing the surface cannot show
          for itself: that scanning is how a setup arrives. */}
      <p>Scan to see the current limit setup.</p>
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
//
// Below lg the same row is m-scan-v3.html:34-37's `.copy`: ONE line — the
// label, the value in mono, and a bordered Copy button that says what it does —
// separated from its neighbours by a hairline and nothing else. (The card
// treatment m-mobile-v3 drew here is superseded: §17e's merged surface has a
// fixed viewport to spend, and four cards spend it on their own borders.)
// Reached without touching the ≥lg DOM: the row becomes a three-column grid and
// the value/button wrapper dissolves to `display: contents`, so label, value and
// button become its cells. At ≥lg the wrapper is a real box again, holding value
// and ⧉ together at the row's right edge exactly as before.
// `max-lg:last:border-b` is not redundant — the un-prefixed `last:border-b-0`
// that keeps ≥lg's final row flush carries a pseudo-class and so outranks a
// plain border utility on specificity.
// Spec §19d/§19e: with no `onCopy` the row renders a state word instead of a
// number — muted, non-mono, and with the copy affordance ABSENT. There is nothing
// to copy, and an affordance that copies a word is a lie. One row shell for both,
// so the ladder's padding, hairline rhythm and hit target cannot drift between a
// priced row and a blocked one.
function CopyableMetricRow({
  copied = false,
  label,
  onCopy,
  value,
  valueClassName = "text-ink",
}: {
  copied?: boolean;
  label: string;
  onCopy?: () => void;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-h-11 min-w-0 items-baseline justify-between gap-3 border-b border-hairline py-1.5 last:border-b-0 max-lg:grid max-lg:grid-cols-[1fr_auto_auto] max-lg:items-center max-lg:gap-x-2.5 max-lg:px-0.5 max-lg:last:border-b">
      <span className="eyebrow min-w-0 max-lg:text-[10px] max-lg:tracking-[0.07em]">
        {label}
      </span>
      {onCopy === undefined
        ? (
          <span className="min-w-0 text-right text-sm font-semibold text-ink-muted max-lg:text-[13px]">
            {value}
          </span>
        )
        : (
      <span className="flex min-w-0 items-baseline gap-1 max-lg:contents">
        <span
          // The value never wraps, truncates, or loses a digit — a price is
          // the product (owner finding, 2026-08-04: 8-decimal crypto prices
          // crowded the copy control at text-xl in the ≥lg ladder column).
          // The type steps down by length instead, uniformly for every row
          // this component draws: ≤9 characters keep the display size, 10+
          // (the 0.19636671 class) take lg, 13+ (a five-figure crypto price
          // with cents) take base. Below lg the row's own grid already
          // gives the value an auto column at 15.5px — verified uncrowded
          // at 375px alongside this change.
          className={`min-w-0 whitespace-nowrap text-right font-mono font-bold tabular-nums max-lg:text-[15.5px] ${
            value.length >= 13
              ? "lg:text-base"
              : value.length >= 10
              ? "lg:text-lg"
              : "lg:text-xl"
          } ${valueClassName}`}
        >
          {value}
        </span>
        <button
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className={copied
            ? "cpv-copy max-lg:m-0 max-lg:gap-1.5 max-lg:rounded-md max-lg:border max-lg:border-hairline max-lg:bg-sheet max-lg:px-2.5 max-lg:text-[11.5px] max-lg:font-semibold max-lg:text-buy"
            : "cpv-copy max-lg:m-0 max-lg:gap-1.5 max-lg:rounded-md max-lg:border max-lg:border-hairline max-lg:bg-sheet max-lg:px-2.5 max-lg:text-[11.5px] max-lg:font-semibold"}
          onClick={onCopy}
          type="button"
        >
          {copied
            ? <Check aria-hidden="true" className="h-4 w-4 text-buy" />
            : <Copy aria-hidden="true" className="h-4 w-4" />}
          {/* The mock's own button text (:28-29). aria-label still supplies the
              accessible name, so every copy contract keeps its exact wording. */}
          <span className="lg:hidden">{copied ? "Copied" : "Copy"}</span>
        </button>
      </span>
        )}
    </div>
  );
}

// Spec §19d + §19e. The unit lives in the label, not the value, so the numeral
// column stays clean — the same idiom as `Target 1 · bank half`. The value is the
// bare number, and the copy payload is the same bare number, so a paste into a
// quantity field is clean.
//
// With no ACTIVE account the row DOES NOT EXIST: not a dash, not an empty value,
// not a prompt to go set one. The ladder is exactly what it is today.
//
// §19 retrofit (Task 5): reads activeAccountOf(profile) — amendment 14's
// confirmed-accounts list — rather than the six retired single-selection
// columns. Those columns stay live on UserProfile (task 1's migration seeds
// them, and brokerSelectionProblem still validates them), but a saved
// account that is not the active one must not price this row.
function SizeRow({
  copied,
  onCopy,
  profile,
  quotes,
  setup,
}: {
  copied: boolean;
  onCopy: (payload: string) => void;
  profile: UserProfile;
  quotes: Readonly<Record<string, number>>;
  setup: AnalyzerSetup;
}) {
  const activeAccount = activeAccountOf(profile);
  if (activeAccount === null) {
    return null;
  }

  const size = sizeSetup({
    accountSize: activeAccount.accountSize,
    entryPrice: setup.entryPrice,
    levelflowSymbol: setup.symbol,
    programLine: activeAccount.programLine,
    quotes,
    riskPercent: activeAccount.riskPercent,
    stage: activeAccount.stage,
    stopLoss: setup.stopLoss,
  });

  const label = `Size · ${sizeUnitFor(activeAccount.programLine)}`;
  if (size.kind === "blocked") {
    return <CopyableMetricRow label={label} value={size.word} />;
  }

  return (
    <CopyableMetricRow
      copied={copied}
      label={label}
      onCopy={() => onCopy(formatCopyValue(size.units))}
      value={formatNumber(size.units)}
    />
  );
}

function NoSetupPanel({
  result,
  symbol,
}: {
  result: AnalyzerResponse;
  symbol: SupportedSymbol;
}) {
  const reasons = uniqueReviewMessages([
    result.reason ?? "",
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
    <div className="grid min-w-0 gap-2 px-5 py-4 text-sm leading-6 text-ink-muted max-lg:px-0">
      <p className="eyebrow flex items-center gap-2 text-caution">
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
        <p className="eyebrow">
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
