import { marketAvailability } from "../../lib/marketHours";
import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
  getSecurityOption,
  normalizeSymbol,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import type { MarketScanCandidate } from "../../lib/tradeAnalyzer";
import type { ScanScope } from "./ScopeMenu";

function normalizeAssetType(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

// Scope-aware market-scan filtering, keyed on ScopeMenu.tsx's ScanScope
// (which adds a "symbol" kind alongside "all" and per-group scoping).
export function getMarketScanSymbolsForScope(
  scope: ScanScope,
): SupportedSymbol[] {
  if (scope.kind === "all") {
    return AVAILABLE_ASSET_SYMBOLS;
  }
  if (scope.kind === "symbol") {
    return [scope.symbol];
  }
  return AVAILABLE_ASSET_GROUPS.find((group) => group.label === scope.assetType)
    ?.options.map((option) => option.symbol) ?? [];
}

// Defensive, not strictly load-bearing today: AdvisorWorkspace's selectScope
// clears the result whenever scope changes, so a completed scan's candidates
// already match the current scope by construction. (The reset used to live in
// MarketScanPanel, which this comment named until the scope moved up to the
// workspace for §17e's merged mobile surface.) This still
// guards the case where scope changes while a scan is in flight and an
// earlier request's response lands after a narrower scope is selected.
// m3: no longer also filters by a minimum-confidence band — the rail's
// legacy Quality filter is retired (spec §5 has none), since letting a
// client-side band hide rows made the visible list disagree with the
// server-truth scanned/qualified count line.
export function filterMarketScanCandidatesByScope(
  candidates: MarketScanCandidate[],
  scope: ScanScope,
) {
  return candidates.filter((candidate) => matchesScanScope(candidate, scope));
}

// I5: the scan must never ask the server to attempt a market that's
// currently closed - the engine has no calendar awareness of its own on
// this path (marketHours.ts is a client-only module), so skipping closed
// markets is entirely this filter's job, applied uniformly to every scope
// including "all". "All" used to send an empty symbol list and let the
// server fall back to its own curated default universe
// (supabase/functions/trade-analyzer/symbols.ts's defaultScanSymbols) -
// that curation already excludes the same no-trade/temporarily-unavailable
// symbols AVAILABLE_ASSET_OPTIONS does client-side, so resolving "all" to
// that same explicit list and filtering it here loses nothing while
// finally letting closed markets drop out of it too. The server's own
// `scanned` count (normalizedSymbols.length) then reflects exactly this
// list's length - only markets actually attempted.
export function filterSymbolsByAvailability(
  symbols: SupportedSymbol[],
  now: Date,
): SupportedSymbol[] {
  return symbols.filter((symbol) => {
    const { assetType } = getSecurityOption(symbol);
    return marketAvailability(assetType, symbol, now).open;
  });
}

function matchesScanScope(
  candidate: MarketScanCandidate,
  scope: ScanScope,
): boolean {
  if (scope.kind === "all") {
    return true;
  }
  if (scope.kind === "symbol") {
    return normalizeSymbol(candidate.symbol) === normalizeSymbol(scope.symbol);
  }
  return normalizeAssetType(candidate.assetType) ===
    normalizeAssetType(scope.assetType);
}

// Scan rail row meta (design spec §5): "Buy · confidence N" / "Sell ·
// confidence N". Every real opportunity carries both a side and a score, so
// the fallbacks below are defensive, not a documented product state — they
// degrade to what's actually known rather than fabricating either half.
export function formatScanRowMeta(
  side: MarketScanCandidate["side"],
  confidenceScore: MarketScanCandidate["confidenceScore"],
): string {
  if (!side) {
    // Defensive: a candidate always carries a side in practice. The em dash
    // is the app-wide absent-value mark - never a retired verb.
    return "\u2014";
  }
  const sideLabel = side === "buy" ? "Buy" : "Sell";
  return typeof confidenceScore === "number" &&
      Number.isFinite(confidenceScore)
    ? `${sideLabel} · confidence ${Math.round(confidenceScore)}`
    : sideLabel;
}
