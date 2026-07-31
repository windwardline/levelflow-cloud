import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
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

// Defensive, not strictly load-bearing today: MarketScanPanel already
// resets its result whenever scope changes, so a completed scan's
// candidates already match the current scope by construction. This still
// guards the case where scope changes while a scan is in flight and an
// earlier request's response lands after a narrower scope is selected.
export function filterMarketScanCandidatesByScope(
  candidates: MarketScanCandidate[],
  scope: ScanScope,
  minimumConfidence: number,
) {
  return candidates.filter((candidate) =>
    matchesScanScope(candidate, scope) &&
    (candidate.confidenceScore ?? 0) >= minimumConfidence
  );
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
    return "Review";
  }
  const sideLabel = side === "buy" ? "Buy" : "Sell";
  return typeof confidenceScore === "number" &&
      Number.isFinite(confidenceScore)
    ? `${sideLabel} · confidence ${Math.round(confidenceScore)}`
    : sideLabel;
}
