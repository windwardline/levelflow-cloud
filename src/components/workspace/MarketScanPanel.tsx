import { Loader2 } from "lucide-react";
import {
  formatSecurityDisplaySymbol,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import type {
  MarketScanCandidate,
  MarketScanResponse,
} from "../../lib/tradeAnalyzer";
import {
  filterMarketScanCandidatesByScope,
  formatScanRowMeta,
} from "./marketScanFilters";
import { describeExecutionLabel } from "./reviewCopy";
import { formatScopeCountLine, ScopeMenu, type ScanScope } from "./ScopeMenu";

type MarketScanPanelProps = {
  // The availability-filtered symbol list this scope would actually scan, and
  // the scope itself. Both are derived once in AdvisorWorkspace (spec §17e: the
  // merged mobile surface fires the same scan from its own control row, and two
  // derivations of "what would this scope scan" is exactly how the two buttons
  // would drift apart).
  openScanSymbols: SupportedSymbol[];
  onScan: (symbols: SupportedSymbol[]) => void;
  onSelectCandidate: (candidate: MarketScanCandidate) => void;
  // Fires with every scope change. The caller resets the previous result and,
  // for a single market, drives the stage selection the same way clicking a
  // scan row does (spec §4: "selecting a market scopes the scan to that one
  // market and the stage follows").
  onSelectScope: (scope: ScanScope) => void;
  result: MarketScanResponse | null;
  // Snapshot of when `result` was produced, for the count line's "{time}"
  // segment (spec §5). Frozen at completion by the caller rather than read
  // live here, so it doesn't silently advance on unrelated re-renders (the
  // workspace clock ticks every 60s).
  scanCompletedAt: Date | null;
  scope: ScanScope;
  // The market the stage is showing, so the matching row reads as selected
  // (a-desk-v3.html:153's `.mkt.sel`). Presentation only — the rail never
  // drives selection from this, it only reflects it.
  selectedSymbol: SupportedSymbol;
  status: "idle" | "scanning";
};

// The scan rail (spec §16, a-desk-v3.html:87-158): a quiet column, not a
// panel. Eyebrow + Scan now on one row, the scope menu, the server-truth count
// line, the result rows. The two-line panel title block, the legend box and
// the empty-state illustration are all deleted — the per-row cost chip keeps
// its rating's plain-language gloss on hover. tests/deskComposition.test.ts
// pins their absence, so the retired title strings deliberately appear nowhere
// in this file, comments included.
//
// Spec §17c supersedes the mock's closing footnote and its empty-state
// sentence, both by name: the rail narrates nothing. Before the first scan it
// draws its controls and stops — "the empty rail is the controls, quietly
// stark" — and anything that ever fills that space must be useful and
// succinct. What is left speaks only to a state the reader cannot otherwise
// see: a scan in flight, a scan that failed, or a result the current scope
// filtered down to nothing.
export function MarketScanPanel({
  onScan,
  onSelectCandidate,
  onSelectScope,
  openScanSymbols,
  result,
  scanCompletedAt,
  scope,
  selectedSymbol,
  status,
}: MarketScanPanelProps) {
  return (
    <section className="min-w-0" data-testid="market-scan-rail">
      {/* One control row for both platforms. At ≥lg it is a-desk-v3.html:88's
          geometry unchanged: the eyebrow opposite Scan now, the scope select
          on its own line below — `order-last w-full` is what floats the scope
          onto that second line, and the container's 8px row gap stands in for
          the old header row's mb-2, so nothing shifts. Below lg the mock draws
          no eyebrow at all (the tab bar already names the surface) and puts
          the scope pill and Scan now side by side on one row
          (m-scan-v1.html:39-42).
          The eyebrow goes .sr-only there rather than display:none — same
          reasoning ScopeMenu.tsx documents for its own suppressed caption:
          clipped keeps the heading in the accessibility tree, so a screen
          reader on mobile still has a landmark for this surface even though
          nothing is drawn. It is absolutely positioned that way, so it leaves
          the flex row entirely and the two controls fill it. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 max-lg:flex-nowrap max-lg:items-center max-lg:gap-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-ink-muted max-lg:sr-only">
          Scan
        </h3>
        <div className="order-last w-full min-w-0 max-lg:order-none max-lg:w-auto max-lg:flex-1">
          <ScopeMenu
            label="Scan scope"
            showLabel={false}
            value={scope}
            onSelect={onSelectScope}
          />
        </div>
        {/* The mock's compact accent button (a-desk-v3.html:88). The kit's own
            44px tap-target floor still applies from .primary-button — spec §16
            trims the padding and type size, never the hit area. */}
        <button
          className="primary-button px-3 py-1.5 text-xs max-lg:shrink-0"
          type="button"
          onClick={() => onScan(openScanSymbols)}
          disabled={status === "scanning" || openScanSymbols.length === 0}
        >
          {status === "scanning"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : null}
          Scan now
        </button>
      </div>

      <MarketScanResults
        onSelectCandidate={onSelectCandidate}
        result={result}
        scanCompletedAt={scanCompletedAt}
        scope={scope}
        selectedSymbol={selectedSymbol}
        status={status}
      />
    </section>
  );
}

// The count line, the qualifying rows, and whatever the rail has to say when
// there are none. Its own component because it is the half of this surface the
// merged mobile Scan surface also carries (spec §17e, m-scan-v3.html:39-45),
// where it sits inside that surface's single scrolling region instead of under
// the rail's own control row — one implementation, two compositions.
export function MarketScanResults({
  onSelectCandidate,
  result,
  scanCompletedAt,
  scope,
  selectedSymbol,
  status,
}: {
  onSelectCandidate: (candidate: MarketScanCandidate) => void;
  result: MarketScanResponse | null;
  scanCompletedAt: Date | null;
  scope: ScanScope;
  selectedSymbol: SupportedSymbol;
  status: "idle" | "scanning";
}) {
  const filteredOpportunities = filterMarketScanCandidatesByScope(
    result?.opportunities ?? [],
    scope,
  );
  // null is the un-scanned rail: no result, no failure, nothing in flight, and
  // so nothing to say (spec §17c). The render below is gated on it, so the
  // paragraph itself does not exist rather than existing empty.
  const emptyMessage = status === "scanning"
    ? "Checking active markets."
    : result?.failed
    ? "Market scan could not complete. Try again shortly."
    : result
    ? "No markets match the current scan filters."
    : null;

  return (
    <>
      {result && !result.failed
        ? (
          <p className="mt-2 font-mono text-xs leading-5 text-ink-muted">
            {formatScopeCountLine(scope, result, scanCompletedAt ?? new Date())}
          </p>
        )
        : null}

      {/* The 404px cap and the rail's own scroll area are ≥lg geometry
          (a-desk-v3.html:21). Below lg the mock stacks the cards down the page
          with 8px between them and lets the page scroll, rather than nesting a
          second scroller inside it (m-scan-v1.html:45-51). */}
      {filteredOpportunities.length > 0
        ? (
          <div className="scrolly mt-2 max-h-[404px] overflow-y-auto max-lg:grid max-lg:max-h-none max-lg:gap-2 max-lg:overflow-visible">
            {filteredOpportunities.map((candidate) => (
              <MarketScanRow
                key={candidate.symbol}
                candidate={candidate}
                onSelectCandidate={onSelectCandidate}
                selected={candidate.symbol === selectedSymbol}
              />
            ))}
          </div>
        )
        : emptyMessage
        ? (
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {emptyMessage}
          </p>
        )
        : null}
    </>
  );
}

// One row per qualifying market (a-desk-v3.html:152-156): the market, one meta
// line, and the cost rating as a chip on the right. The selected row takes the
// sheet fill plus a 3px inset accent edge — inset rather than a real border so
// the row's text never shifts by 3px when selection moves.
//
// Below lg the same row is the mock's inset card (m-scan-v1.html:17-20): 8px
// radius, a full hairline border on sheet at 13/14 padding, 15px symbol. The
// card's sides are ADDED to the base `border-b` rather than swapped for it, so
// the ≥lg rule set is untouched — and the sheet fill, which every card carries
// below lg, stays the selected row's own signal at ≥lg.
function MarketScanRow({
  candidate,
  onSelectCandidate,
  selected,
}: {
  candidate: MarketScanCandidate;
  onSelectCandidate: (candidate: MarketScanCandidate) => void;
  selected: boolean;
}) {
  return (
    <button
      className={selected
        ? "flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border-b border-hairline bg-sheet px-2.5 py-2 text-left shadow-[inset_3px_0_0_var(--color-accent)] transition max-lg:rounded-lg max-lg:border max-lg:px-3.5 max-lg:py-3"
        : "flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border-b border-hairline px-2.5 py-2 text-left transition hover:bg-accent/10 max-lg:rounded-lg max-lg:border max-lg:bg-sheet max-lg:px-3.5 max-lg:py-3"}
      type="button"
      aria-current={selected}
      onClick={() => onSelectCandidate(candidate)}
    >
      <span className="min-w-0">
        {/* The ticker form, per mock :152-156 ("XAU/USD"). The full descriptive
            label truncates mid-description in a 264px rail; the scope menu's
            own option rows still carry it in full. */}
        <span className="block truncate text-sm font-bold text-ink max-lg:text-[15px]">
          {formatSecurityDisplaySymbol(candidate.symbol)}
        </span>
        <span className="block truncate text-xs text-ink-muted">
          {formatScanRowMeta(candidate.side, candidate.confidenceScore)}
        </span>
      </span>
      <span
        className={`chip shrink-0 ${executionChipTone(candidate.executionLabel)}`}
        title={describeExecutionLabel(candidate.executionLabel)}
      >
        {candidate.executionLabel || "Checked"}
      </span>
    </button>
  );
}

// The cost-rating colors the deleted legend box used to spell out, applied
// where the rating actually appears. Literal class strings per branch — never
// an interpolated variant prefix (tests/tailwindVariantGuard.test.ts, C1).
function executionChipTone(label: string | null | undefined): string {
  if (label === "Clean") {
    return "text-buy";
  }
  if (label === "Thin") {
    return "text-caution";
  }
  if (label === "Poor") {
    return "text-sell";
  }
  return "text-ink-muted";
}
