export type RankableOpportunity = {
  confidenceScore?: number;
  rewardRisk?: number;
};

// Confidence is the probability proxy and the primary sort: the scan lists
// setups from most to least likely, full stop. Payoff breaks ties only —
// multiplying it in scrambled probability order without adding information.
export function scoreOpportunity(candidate: RankableOpportunity) {
  const confidence = Number(candidate.confidenceScore);
  return Number.isFinite(confidence) ? confidence : 0;
}

export function rankOpportunities<T extends RankableOpportunity>(
  candidates: T[],
): T[] {
  return [...candidates].sort((first, second) =>
    scoreOpportunity(second) - scoreOpportunity(first) ||
    (second.rewardRisk ?? 0) - (first.rewardRisk ?? 0)
  );
}
