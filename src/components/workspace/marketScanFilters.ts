import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
  normalizeSymbol,
  type SecurityType,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import type { MarketScanCandidate } from "../../lib/tradeAnalyzer";
import type { ScanScope } from "./ScopeMenu";

export type MarketScanCategoryFilter = "all" | SecurityType;

export function getMarketScanSymbolsForCategory(
  category: MarketScanCategoryFilter,
): SupportedSymbol[] {
  if (category === "all") {
    return AVAILABLE_ASSET_SYMBOLS;
  }

  return AVAILABLE_ASSET_GROUPS.find((group) => group.label === category)
    ?.options.map((option) => option.symbol) ?? [];
}

export function filterMarketScanCandidates(
  candidates: MarketScanCandidate[],
  category: MarketScanCategoryFilter,
  minimumConfidence: number,
) {
  return candidates.filter((candidate) =>
    matchesMarketScanCategory(candidate, category) &&
    (candidate.confidenceScore ?? 0) >= minimumConfidence
  );
}

export function countMarketScanCandidatesInCategory(
  candidates: MarketScanCandidate[],
  category: MarketScanCategoryFilter,
) {
  return candidates.filter((candidate) =>
    matchesMarketScanCategory(candidate, category)
  ).length;
}

function matchesMarketScanCategory(
  candidate: MarketScanCandidate,
  category: MarketScanCategoryFilter,
) {
  return category === "all" ||
    normalizeAssetType(candidate.assetType) === normalizeAssetType(category);
}

function normalizeAssetType(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

// Scope-aware counterparts of the category helpers above (kept separate,
// not a replacement - tests/core.test.ts pins the category functions'
// signatures directly). ScanScope (ScopeMenu.tsx) adds a "symbol" kind the
// old MarketScanCategoryFilter union has no room for.
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
