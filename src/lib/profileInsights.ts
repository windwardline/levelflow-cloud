import { normalizeSetupOutcome } from "./outcomes";
import { compareAssetSymbols, getSecurityOption } from "./symbolMap";
import type { TradeSetupRow } from "./tradeAnalyzer";

export type ProfileReviewPatternItem = {
  category: string;
  count: number;
  latestAt: string;
  losses: number;
  symbol: string;
  winRate: number | null;
  wins: number;
};

export function buildProfileReviewPattern(
  setups: TradeSetupRow[],
): ProfileReviewPatternItem[] {
  const bySymbol = new Map<string, ProfileReviewPatternItem>();

  for (const setup of setups) {
    const option = getSecurityOption(setup.symbol);
    const current = bySymbol.get(setup.symbol) ?? {
      category: option.assetType,
      count: 0,
      latestAt: setup.created_at,
      losses: 0,
      symbol: setup.symbol,
      winRate: null,
      wins: 0,
    };
    const outcome = normalizeSetupOutcome(setup);

    current.count += 1;
    if (new Date(setup.created_at).getTime() > new Date(current.latestAt).getTime()) {
      current.latestAt = setup.created_at;
    }
    if (outcome === "target_reached") {
      current.wins += 1;
    } else if (outcome === "stopped_out") {
      current.losses += 1;
    }

    bySymbol.set(setup.symbol, current);
  }

  return Array.from(bySymbol.values())
    .map((item) => {
      const finished = item.wins + item.losses;
      return {
        ...item,
        winRate: finished > 0 ? Math.round((item.wins / finished) * 100) : null,
      };
    })
    .sort((first, second) =>
      second.count - first.count ||
      compareAssetSymbols(first.symbol, second.symbol),
    )
    .slice(0, 3);
}
