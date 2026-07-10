import {
  AVAILABLE_ASSET_GROUPS,
  AVAILABLE_ASSET_SYMBOLS,
  type SecurityType,
  type SupportedSymbol,
} from "../../lib/symbolMap";
import type { MarketScanCandidate } from "../../lib/tradeAnalyzer";

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
