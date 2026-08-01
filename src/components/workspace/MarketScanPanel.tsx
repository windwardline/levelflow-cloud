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
// panel. Eyebrow + button on one row, the scope menu, the server-truth count
// line, the result rows. Spec §17m.4 renames both halves of that first row —
// the eyebrow is "Markets" (what the column lists) and the button is "Scan"
// (what it lists) and the button is the verb alone: the mock's own pairing said
// the verb twice and is superseded by name. The two-line panel title block, the legend box and
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
      {/* a-desk-v3.html:88's control row: the eyebrow opposite the button, the
          scope select on its own line below — `order-last w-full` is what
          floats the scope onto that second line, and the container's 8px row
          gap stands in for the old header row's mb-2.
          This row is the ≥lg rail's alone since spec §17e: the merged mobile
          surface pins its own control row (scope · timeframe · one Scan
          button), so the mobile treatments this row used to carry — the
          clipped eyebrow, the side-by-side reflow — described a composition
          that no longer renders and are gone rather than left as dead CSS. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="eyebrow">
          Markets
        </h3>
        <div className="order-last w-full min-w-0">
          <ScopeMenu
            label="Scan scope"
            showLabel={false}
            value={scope}
            onSelect={onSelectScope}
          />
        </div>
        {/* One verb, at the same compact scale the merged mobile control row
            uses for its own Scan button (spec §17m.4) — one door, one button,
            reading the same on both platforms. Smaller in the only dimension
            that was ever the complaint: the retired two-word label at 12px
            measured ~82px wide, this one at 13px measures ~64px. The kit's 44px tap-target floor still
            comes from .primary-button — §16 trims padding and type, never the
            hit area. */}
        <button
          className="primary-button shrink-0 px-4 py-2 text-[13px]"
          type="button"
          onClick={() => onScan(openScanSymbols)}
          disabled={status === "scanning" || openScanSymbols.length === 0}
        >
          {status === "scanning"
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : null}
          Scan
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
          (a-desk-v3.html:21). Below lg they lift: the merged surface's own
          scrolling region is the only scroller there (m-scan-v3.html:32), and a
          second one nested inside it would trap the list in a ~400px window
          halfway down a fixed viewport. */}
      {filteredOpportunities.length > 0
        ? (
          <div className="scrolly mt-2 max-h-[404px] overflow-y-auto max-lg:max-h-none max-lg:overflow-visible">
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
// m-scan-v3.html:40-45 draws the same flat row below lg, so both platforms now
// share one treatment: the inset card m-scan-v1 drew here is superseded (a card
// per market inside a fixed viewport spends the surface on borders). The only
// mobile-only utilities left are the mock's own 2px inset and the 10px it gives
// back to the selected row so its text clears the accent edge.
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
        ? "flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border-b border-hairline bg-sheet px-2.5 py-2 text-left shadow-[inset_3px_0_0_var(--color-accent)] transition max-lg:px-0.5 max-lg:pl-2.5"
        : "flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border-b border-hairline px-2.5 py-2 text-left transition hover:bg-accent/10 max-lg:px-0.5"}
      type="button"
      aria-current={selected}
      onClick={() => onSelectCandidate(candidate)}
    >
      <span className="min-w-0">
        {/* The ticker form, per mock :152-156 ("XAU/USD"). The full descriptive
            label truncates mid-description in a 264px rail; the scope menu's
            own option rows still carry it in full. */}
        <span className="block truncate text-sm font-bold text-ink">
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
