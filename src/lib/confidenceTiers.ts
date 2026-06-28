export type ConfidenceTierId = "qualified" | "strong" | "best";

export type ConfidenceTier = {
  body: string;
  id: ConfidenceTierId;
  label: string;
  max: number;
  min: number;
};

export const CONFIDENCE_TIERS: ConfidenceTier[] = [
  {
    body: "Meets the review bar and has enough alignment, timing, and payoff to appear.",
    id: "qualified",
    label: "Qualified",
    max: 74,
    min: 66,
  },
  {
    body: "Shows cleaner agreement across direction, location, timing, and payoff.",
    id: "strong",
    label: "Strong",
    max: 84,
    min: 75,
  },
  {
    body: "Ranks among the clearest current opportunities LevelFlow can show.",
    id: "best",
    label: "Best",
    max: 100,
    min: 85,
  },
];

export function getConfidenceTier(score: number | string | null | undefined) {
  if (score === null || score === undefined || score === "") {
    return null;
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return null;
  }

  return CONFIDENCE_TIERS.find(
    (tier) => numericScore >= tier.min && numericScore <= tier.max,
  ) ?? null;
}

export function formatConfidenceTierRange(tier: ConfidenceTier) {
  return `${tier.min}-${tier.max}`;
}

export function formatConfidenceWithTier(
  score: number | string | null | undefined,
) {
  if (score === null || score === undefined || score === "") {
    return "Pending";
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return "Pending";
  }

  const roundedScore = Math.round(numericScore);
  const tier = getConfidenceTier(roundedScore);
  return tier ? `${tier.label} ${roundedScore}%` : `${roundedScore}%`;
}
