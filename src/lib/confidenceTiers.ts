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
    body: "Ranks among the clearest current opportunities Levelflow can show.",
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

// `threshold` is the setup's own class's qualifying bar (advisorReview.ts's
// CONFIDENCE_THRESHOLD_BY_ASSET_TYPE). CONFIDENCE_TIERS' fixed 66-100 bands
// predate per-class thresholds and describe absolute strength (Strong,
// Best) — they're still correct for that. But a class whose real bar sits
// below 66 (Forex qualifies at 40) produced a bare, unlabeled percentage
// for its entire 40-65 qualifying range, because nothing in that range
// matched any fixed band. A score that clears its own class's bar has
// earned at least the "Qualified" word regardless of where that bar sits;
// omit `threshold` and this is exactly the old behavior. A score that
// doesn't clear it stays a bare percentage either way — the engine refuses
// setup generation below the bar, so only legacy/historical rows can land
// there, and they should read as exactly what they are, not "Qualified."
export function formatConfidenceWithTier(
  score: number | string | null | undefined,
  threshold?: number,
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
  const label = tier?.label ??
    (threshold !== undefined && roundedScore >= threshold
      ? "Qualified"
      : null);
  return label ? `${label} ${roundedScore}%` : `${roundedScore}%`;
}
