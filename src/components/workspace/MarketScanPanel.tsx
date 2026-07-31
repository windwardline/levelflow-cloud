import { useState } from "react";
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
  filterSymbolsByAvailability,
  formatScanRowMeta,
  getMarketScanSymbolsForScope,
} from "./marketScanFilters";
import { describeExecutionLabel } from "./reviewCopy";
import { formatScopeCountLine, ScopeMenu, type ScanScope } from "./ScopeMenu";

// Spec §10: the rail's one closing line, exactly as the mock words it
// (a-desk-v3.html:158). Insights carries its own longer per-broker version of
// the same promise; these two are deliberately different sentences on
// different surfaces, so neither may be edited into the other.
const RAIL_FOOTNOTE =
  "Every setup Levelflow generates is saved to Insights automatically.";

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
  // The market the stage is showing, so the matching row reads as selected
  // (a-desk-v3.html:153's `.mkt.sel`). Presentation only — the rail never
  // drives selection from this, it only reflects it.
  selectedSymbol: SupportedSymbol;
  status: "idle" | "scanning";
};

// The scan rail (spec §16, a-desk-v3.html:87-158): a quiet column, not a
// panel. Eyebrow + Scan now on one row, the scope menu, the server-truth count
// line, the result rows, one footnote. The two-line panel title block, the
// legend box and the empty-state illustration are all deleted — the rail's own
// copy carries what they used to explain, and the per-row cost chip keeps its
// rating's plain-language gloss on hover. tests/deskComposition.test.ts pins
// their absence, so the retired title strings deliberately appear nowhere in
// this file, comments included.
export function MarketScanPanel({
  onResetResult,
  onScan,
  onSelectCandidate,
  onSelectSymbol,
  result,
  scanCompletedAt,
  selectedSymbol,
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
    <section className="min-w-0" data-testid="market-scan-rail">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-normal text-ink-muted">
          Scan
        </h3>
        {/* The mock's compact accent button (a-desk-v3.html:88). The kit's own
            44px tap-target floor still applies from .primary-button — spec §16
            trims the padding and type size, never the hit area. */}
        <button
          className="primary-button px-3 py-1.5 text-xs"
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

      <ScopeMenu
        label="Scan scope"
        showLabel={false}
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

      {result && !result.failed
        ? (
          <p className="mt-2 font-mono text-xs leading-5 text-ink-muted">
            {formatScopeCountLine(scope, result, scanCompletedAt ?? new Date())}
          </p>
        )
        : null}

      {filteredOpportunities.length > 0
        ? (
          <div className="scrolly mt-2 max-h-[404px] overflow-y-auto">
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
        : (
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {status === "scanning" ? "Checking active markets." : emptyMessage}
          </p>
        )}

      <p className="mt-3.5 text-xs leading-5 text-ink-muted">{RAIL_FOOTNOTE}</p>
    </section>
  );
}

// One row per qualifying market (a-desk-v3.html:152-156): the market, one meta
// line, and the cost rating as a chip on the right. The selected row takes the
// sheet fill plus a 3px inset accent edge — inset rather than a real border so
// the row's text never shifts by 3px when selection moves.
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
        ? "flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border-b border-hairline bg-sheet px-2.5 py-2 text-left shadow-[inset_3px_0_0_var(--color-accent)] transition"
        : "flex min-h-11 w-full min-w-0 items-center justify-between gap-3 border-b border-hairline px-2.5 py-2 text-left transition hover:bg-accent/10"}
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
