export type LearningStats = {
  ambiguous: number;
  losses: number;
  total: number;
  wins: number;
};

export type LearningWeight = {
  ambiguityPenalty: number;
  confidenceAdjustment: number;
  sampleWeight: number;
  winRate: number;
};

export function calculateLearningWeight(stats: LearningStats): LearningWeight {
  const resolved = Math.max(stats.wins + stats.losses, 0);
  const total = Math.max(stats.total, resolved + Math.max(stats.ambiguous, 0));
  const winRate = stats.wins / Math.max(resolved, 1);
  const baseSampleWeight = resolved >= 20
    ? 1
    : resolved >= 8
    ? resolved / 20
    : 0;
  const ambiguityShare = total > 0 ? Math.max(stats.ambiguous, 0) / total : 0;
  const ambiguityPenalty = Math.min(0.45, ambiguityShare * 0.75);
  const sampleWeight = roundWeight(baseSampleWeight * (1 - ambiguityPenalty));
  const confidenceAdjustment = roundWeight(
    Math.max(-10, Math.min(10, (winRate - 0.5) * 20)) * sampleWeight,
  );

  return {
    ambiguityPenalty: roundWeight(ambiguityPenalty),
    confidenceAdjustment,
    sampleWeight,
    winRate: roundWeight(winRate),
  };
}

function roundWeight(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}
