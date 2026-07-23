export type RankableOpportunity = {
  confidenceScore?: number;
  rewardRisk?: number;
};

// Payoff is capped so a single outlier reward:risk cannot outrank a setup
// with genuinely better hit odds. Calibrated P(TP1) replaces this proxy once
// the replay sweep produces per-class hit-rate curves.
const REWARD_RISK_CAP = 3;

export function scoreOpportunity(candidate: RankableOpportunity) {
  const confidence = Number(candidate.confidenceScore);
  const rewardRisk = Number(candidate.rewardRisk);
  if (!Number.isFinite(confidence) || !Number.isFinite(rewardRisk)) {
    return 0;
  }
  return confidence * Math.min(Math.max(rewardRisk, 0), REWARD_RISK_CAP);
}

export function rankOpportunities<T extends RankableOpportunity>(
  candidates: T[],
): T[] {
  return [...candidates].sort((first, second) =>
    scoreOpportunity(second) - scoreOpportunity(first) ||
    (second.confidenceScore ?? 0) - (first.confidenceScore ?? 0)
  );
}
