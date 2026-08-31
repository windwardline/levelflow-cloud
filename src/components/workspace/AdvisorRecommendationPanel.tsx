import { useEffect, useRef, useState } from "react";
import { Check, Copy, XCircle } from "lucide-react";
import { adjustedEntryFor, getBrokerOffset } from "../../lib/broker/offsets";
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
  "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — the banked half is yours either way.";

// The basis line (owner ruling, amendment 23's offset extension, 2026-08-05,
// docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md). XAGUSD and
// WTI carry a real, stable broker-vs-feed basis (src/lib/broker/offsets.ts);
// this states it plainly rather than leaving the ladder's entry looking off
// by a few cents against what E8's own platform will actually show. The
// template is owner-approved copy, registered in tests/languageGuard.test.ts
// — the two numbers are live-computed data, not part of the registered
// vocabulary. BRENT's own offset is recorded in the same module but never
// reaches this function: adjustedEntryFor returns null for a display-excluded
// symbol, so there is nothing here for a future edit to accidentally wire up.
//
// Display only, deliberately: the adjusted number returned here must never
// enter handleCopy's payload and must never reach the chart
// (tests/advisorRecommendationPanel.test.ts pins both directions).
function formatBasisLine(symbol: string, entryPrice: number): string | null {
  const adjustedEntry = adjustedEntryFor(symbol, entryPrice);
  if (adjustedEntry === null) {
    return null;
  }
  const offset = getBrokerOffset(symbol)!;
  return `E8 quotes ~+${offset.basis.toFixed(2)} above this feed — entry there ≈ ${
    formatNumber(adjustedEntry)
  }`;
}

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
  now,
  profile,
  quotes,
  result,
  setup,
  symbol,
}: {
  /**
   * 1l: the stage's ticking clock (AdvisorWorkspace's clockNow), so a setup
   * whose review window elapses ON SCREEN loses its copy affordances at the
   * moment it expires — §17c's inert-control law, the same
   * absent-not-disabled remedy the Size row and both reopen affordances
   * already apply. The prices stay printed; they are historical fact.
   */
  now: Date;
  profile: UserProfile;
  /** Levelflow's own in-roster quotes the client already holds (§19c). */
  quotes: Readonly<Record<string, number>>;
  result: AnalyzerResponse | null;
  setup: AnalyzerSetup | null;
  symbol: SupportedSymbol;
}) {
  // The confirmation belongs to a VALUE, not to a field name. Keyed on the
  // name alone it outlived the thing it described in two ways, both of which
  // put the previous market's price under a green tick:
  //
  //   - Tapping a scan row swaps `setup` on this same instance (no `key` at
  //     either render site), so the ladder became XAU/USD's while the Entry
  //     row still read "Copied" beside a EUR/USD number in the clipboard.
  //   - adoptScanVerdict rewrites the DISPLAYED market's prices in place when
  //     a scan returns, so the four numbers changed under a standing tick.
  //
  // Both are the same bug and the token closes both: symbol and value are in
  // it, so a tick can only survive while the exact number it described is
  // still on screen. Nothing has to remember to clear it.
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  // A rejected write needs its own state, not merely the absence of the tick.
  // Silence is what the operator already gets from a row they never touched,
  // so silence after a tap reads as "it worked" — which is the failure this
  // whole mechanism exists to prevent.
  const [failedToken, setFailedToken] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string>("");
  const copyResetRef = useRef<number | null>(null);

  const tokenFor = (field: string, value: string) =>
    `${symbol}:${field}:${value}`;

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

  // m1: the ✓ is success-conditional — it only appears once the write actually
  // resolves, never on a rejected or unavailable clipboard.
  //
  // What m1 did not do was CLEAR it. Both failure paths returned early, so the
  // last successful row kept its tick while a later row silently failed: the
  // operator taps Copy on Stop loss, iOS rejects the write because focus went
  // to the broker app, nothing on screen changes — and Entry is still green
  // beside a clipboard that still holds the entry price. They paste it into the
  // stop field. A failed copy must therefore leave NOTHING confirmed, which is
  // why both paths now clear rather than return.
  async function handleCopy(field: string, label: string, value: string) {
    const token = tokenFor(field, value);
    if (copyResetRef.current !== null) {
      window.clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }
    const settle = (ok: boolean) => {
      setCopiedToken(ok ? token : null);
      setFailedToken(ok ? null : token);
      setCopyStatus(ok ? `${label} copied` : `${label} not copied`);
      copyResetRef.current = window.setTimeout(() => {
        setCopiedToken(null);
        setFailedToken(null);
      }, 2000);
    };
    if (!navigator.clipboard) {
      settle(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      settle(false);
      return;
    }
    settle(true);
  }

  if (setup) {
    const isBuy = setup.side === "buy";
    const hasLadder = typeof setup.takeProfit1 === "number" &&
      setup.takeProfit1 > 0;
    // WHAT THE LADDER PAYS, not what the far target pays.
    //
    // rewardRisk is the far target measured on a FULL-SIZE basis, and half the
    // position leaves at TP1. A setup gated at 1.6x realises about 1.0R
    // against a -1.00R stop, and this row printed the first number under the
    // words "payoff after costs" — 33% to 60% more than the ladder
    // delivers, by class,
    // on the surface read before the trade is placed.
    //
    // (Written without apostrophes on purpose: tests/languageGuard scans
    // string literals on working surfaces, and an apostrophe inside a comment
    // opens one to the scanner. It caught the first draft of this block.)
    //
    // Falls back to rewardRisk when there is no TP1 leg, where the full-size
    // runner IS the payoff. Older stored setups predate the field and fall
    // back too rather than reading as Pending.
    const confluence = setup.confluence as Record<string, unknown> | undefined;
    const ladderRewardRisk = Number(confluence?.ladderRewardRisk ?? 0);
    const rewardRisk = ladderRewardRisk > 0
      ? ladderRewardRisk
      : Number(confluence?.rewardRisk ?? 0);
    // 1l: expired means the review window has closed — copying these prices
    // into a platform now would place levels the engine no longer stands
    // behind. Scan-adopted setups carry expiresAt; stored reopens carry
    // copyWindowEndsAt, derived for THIS GATE and printed nowhere (the
    // recorded §17f no-printed-stamp decision stands; §17c's inert-control
    // law gets its gate — the owner's simple-rules directive, 2026-08-09).
    const copyWindowEnd = setup.expiresAt ?? setup.copyWindowEndsAt;
    const copyExpired = typeof copyWindowEnd === "string" &&
      new Date(copyWindowEnd).getTime() <= now.getTime();
    const basisLine = formatBasisLine(setup.symbol, setup.entryPrice);

    return (
      <div className="grid min-w-0 lg:grid-cols-[1.1fr_0.9fr]">
        {/* The only non-visual confirmation this surface has. Before it, the
            tick was the whole signal: a name change on an already-focused
            control, announced by NVDA, unreliably by VoiceOver, and never on
            the revert — so five rows sharing one state produced no
            distinguishable audio at all. One polite region, owned here rather
            than per row, so sequential copies read in order. .sr-only is
            position:absolute, so it consumes no grid cell. */}
        <span aria-live="polite" className="sr-only" role="status">
          {copyStatus}
        </span>
        {/* §17m.3's budget: the ladder owns the majority of the sheet, and the
            sheet is a share of the region rather than whatever its content
            wants — so the ≥lg insets tighten (the mock's 20px inset stays
            horizontally; the vertical rhythm gives back 8px per column) while
            every row keeps its own 44px copy target and its type. */}
        <div className="min-w-0 border-b border-hairline px-5 py-4 max-lg:px-0 lg:border-b-0 lg:border-r lg:py-3">
          {/* Payoff was its own metric box before spec §16; the mock folds it
              into the ladder's eyebrow (a-desk-v3.html:198). Costs kept their
              own row inside "Why this setup" all along. */}
          {/* 1q: 'after costs', because the figure IS the after-costs ratio
              — the printed prices are pre-cost, so without the qualifier the
              number is underivable from the levels below it and reads as
              wrong. The Costs row in the receipt carries the reconciling
              number. */}
          <p className="eyebrow mb-1.5 lg:mb-1">
            The setup · payoff after costs{" "}
            <span className="font-mono tabular-nums">
              {rewardRisk > 0 ? `${rewardRisk.toFixed(2)}x` : "Pending"}
            </span>
          </p>
          {/* Flush hairline rows on both platforms now (a-desk-v3.html:199-202,
              m-scan-v3.html:34-37): the hairline between two rows is the
              separation, so there is no gap to add below lg either. */}
          <div className="grid">
            <CopyableMetricRow
              copied={copiedToken === tokenFor("entry", formatCopyValue(setup.entryPrice))}
              failed={failedToken === tokenFor("entry", formatCopyValue(setup.entryPrice))}
              label="Limit entry"
              onCopy={copyExpired ? undefined : () => handleCopy("entry", "Limit entry", formatCopyValue(setup.entryPrice))}
              value={formatNumber(setup.entryPrice)}
              valueClassName={isBuy ? "text-buy" : "text-sell"}
            />
            <CopyableMetricRow
              copied={copiedToken === tokenFor("stop", formatCopyValue(setup.stopLoss))}
              failed={failedToken === tokenFor("stop", formatCopyValue(setup.stopLoss))}
              label="Stop loss"
              onCopy={copyExpired ? undefined : () => handleCopy("stop", "Stop loss", formatCopyValue(setup.stopLoss))}
              value={formatNumber(setup.stopLoss)}
              valueClassName="text-sell"
            />
            {hasLadder
              ? (
                <CopyableMetricRow
                  copied={copiedToken === tokenFor("target1", formatCopyValue(setup.takeProfit1!))}
              failed={failedToken === tokenFor("target1", formatCopyValue(setup.takeProfit1!))}
                  label="Target 1 · bank half"
                  onCopy={copyExpired ? undefined : () => handleCopy("target1", "Target 1", formatCopyValue(setup.takeProfit1!))}
                  value={formatNumber(setup.takeProfit1!)}
                  valueClassName="text-buy"
                />
              )
              : null}
            <CopyableMetricRow
              copied={copiedToken === tokenFor("target2", formatCopyValue(setup.takeProfit))}
              failed={failedToken === tokenFor("target2", formatCopyValue(setup.takeProfit))}
              label={hasLadder ? "Target 2 · take-profit" : "Target"}
              onCopy={copyExpired ? undefined : () => handleCopy("target2", hasLadder ? "Target 2" : "Target", formatCopyValue(setup.takeProfit))}
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
              copiedToken={copiedToken}
              failedToken={failedToken}
              onCopy={copyExpired ? undefined : (payload) => handleCopy("size", "Size", payload)}
              tokenFor={tokenFor}
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
          {basisLine
            ? (
              <p className="mt-2 text-xs leading-5 text-ink-muted lg:mt-1.5">
                {basisLine}
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
  failed = false,
  label,
  onCopy,
  value,
  valueClassName = "text-ink",
}: {
  copied?: boolean;
  /** A write the browser rejected. Distinct from "not copied yet": an
      untouched row and a failed one must never look the same, because the
      operator reads silence after a tap as success. */
  failed?: boolean;
  label: string;
  onCopy?: () => void;
  value: string;
  valueClassName?: string;
}) {
  return (
    // The ≥lg row is a grid whose value column is `auto` — the same
    // structural guarantee the sub-lg grid below has always used: an auto
    // column can never be squeezed below its content, so a long label
    // WRAPS instead of shrinking the value block and letting nowrap
    // digits paint under the copy control (the owner's second screenshot
    // verdict: Target 1's two-line label did exactly that while the
    // measured boxes claimed clearance — boxes shrink, paint does not).
    <div className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-hairline py-1.5 last:border-b-0 max-lg:grid-cols-[1fr_auto_auto] max-lg:items-center max-lg:gap-x-2.5 max-lg:px-0.5 max-lg:last:border-b">
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
      <span className="flex min-w-0 items-baseline gap-2 max-lg:contents">
        <span
          // The value never wraps, truncates, or loses a digit — a price is
          // the product. OWNER DIRECTIVE (2026-08-04, second ruling on this
          // row, superseding the stepped-by-length sizes): the ladder is
          // smaller in px, flat — one 16px size at every length, so the
          // longest live value keeps visible air before its copy control
          // instead of fitting by measurement. The gap-2 beside it is the
          // other half of the same ruling: 4px of technical clearance
          // between bold mono digits and an icon reads as run-on (the
          // owner's screenshot verdict on the first fix); 8px reads as
          // separation. Below lg the row's own grid already gives the
          // value an auto column at 15.5px.
          className={`min-w-0 whitespace-nowrap text-right font-mono font-bold tabular-nums max-lg:text-[15.5px] lg:text-base ${valueClassName}`}
        >
          {value}
        </span>
        <button
          aria-label={copied
            ? `${label} copied`
            : failed
            ? `${label} not copied`
            : `Copy ${label}`}
          className={`cpv-copy max-lg:m-0 max-lg:gap-1.5 max-lg:rounded-md max-lg:border max-lg:border-hairline max-lg:bg-sheet max-lg:px-2.5 max-lg:text-[11.5px] max-lg:font-semibold${
            copied ? " max-lg:text-buy" : failed ? " max-lg:text-sell" : ""
          }`}
          onClick={onCopy}
          type="button"
        >
          {copied
            ? <Check aria-hidden="true" className="h-4 w-4 text-buy" />
            : failed
            ? <XCircle aria-hidden="true" className="h-4 w-4 text-sell" />
            : <Copy aria-hidden="true" className="h-4 w-4" />}
          {/* The mock's own button text (:28-29). aria-label still supplies the
              accessible name, so every copy contract keeps its exact wording.
              The third state is the browser refusing the write — it reuses the
              row's own two-word register rather than explaining itself. */}
          <span className="lg:hidden">
            {copied ? "Copied" : failed ? "Not copied" : "Copy"}
          </span>
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
  copiedToken,
  failedToken,
  onCopy,
  profile,
  quotes,
  setup,
  tokenFor,
}: {
  copiedToken: string | null;
  failedToken: string | null;
  onCopy?: (payload: string) => void;
  profile: UserProfile;
  quotes: Readonly<Record<string, number>>;
  setup: AnalyzerSetup;
  /** Only this row knows its own payload, so only it can build its token. */
  tokenFor: (field: string, value: string) => string;
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

  const payload = formatCopyValue(size.units);
  return (
    <CopyableMetricRow
      copied={copiedToken === tokenFor("size", payload)}
      failed={failedToken === tokenFor("size", payload)}
      label={label}
      onCopy={onCopy === undefined ? undefined : () => onCopy(payload)}
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
  // A TYPED FIELD, not a sentence match. The retired regex needed "stronger …
  // setup"; the collapse path's sentence says "it is the STRONGEST current
  // setup", so it never matched and a market whose setup was found and withheld
  // was announced as "Nothing passed review". A branch that reads prose breaks
  // silently every time the prose is improved.
  const relatedMarketBlocked = Boolean(result.withheldFor);

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
