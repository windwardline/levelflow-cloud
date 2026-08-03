export type RankableOpportunity = {
  confidenceScore?: number;
  rewardRisk?: number;
  symbol?: string;
};

// Confidence is the probability proxy and the primary sort: the scan lists
// setups from most to least likely, full stop. Payoff breaks ties only —
// multiplying it in scrambled probability order without adding information.
export function scoreOpportunity(candidate: RankableOpportunity) {
  const confidence = Number(candidate.confidenceScore);
  return Number.isFinite(confidence) ? confidence : 0;
}

// The last tiebreak, and the reason it exists: since the scan arrives as several
// requests (src/lib/scanBatching.ts), "equal on both keys" used to mean "input
// order", and the input order of a merged list is which request happened to hold
// a market. The symbol settles it identically whichever way a scan was split.
//
// Compared by code unit rather than localeCompare: the client mirror runs in a
// browser and this runs in Deno, and locale collation is not guaranteed to be
// the same in both — a mirror that disagrees on data is worse than no mirror.
function compareSymbols(first: RankableOpportunity, second: RankableOpportunity) {
  const firstSymbol = String(first.symbol ?? "");
  const secondSymbol = String(second.symbol ?? "");
  if (firstSymbol === secondSymbol) {
    return 0;
  }
  return firstSymbol < secondSymbol ? -1 : 1;
}

export function rankOpportunities<T extends RankableOpportunity>(
  candidates: T[],
): T[] {
  return [...candidates].sort((first, second) =>
    scoreOpportunity(second) - scoreOpportunity(first) ||
    (second.rewardRisk ?? 0) - (first.rewardRisk ?? 0) ||
    compareSymbols(first, second)
  );
}
