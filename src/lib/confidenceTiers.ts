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

// `threshold` is the setup's own class's qualifying bar (advisorReview.ts's
// CONFIDENCE_THRESHOLD_BY_ASSET_TYPE). CONFIDENCE_TIERS' fixed 66-100 bands
// predate per-class thresholds and describe absolute strength (Strong,
// Best) — they're still correct for that. But a class whose real bar sits
// below 66 (Forex qualifies at 40) left its entire 40-65 qualifying range
// outside every fixed band. A score that clears its own class's bar has
// earned at least the "Qualified" word regardless of where that bar sits;
// omit `threshold` and this is exactly the fixed-band behavior. A score
// that clears no bar resolves to no tier either way — the engine refuses
// setup generation below the bar, so only legacy/historical rows can land
// there, and they should read as exactly what they are, not "Qualified."
//
// One law, two readers: formatConfidenceWithTier prints the resolved
// tier's word beside the score (the display half, shipped first), and
// historyUtils' buildConfidenceBands counts the row under the resolved
// tier (the aggregate half — the two halves used to disagree, and every
// qualifying row below 66 vanished from the aggregate while the ledger
// printed "Qualified" beside it). Rounding happens here, once, so a
// fractional score can never band apart from the word printed beside it.
export function resolveConfidenceTier(
  score: number | string | null | undefined,
  threshold?: number,
): ConfidenceTier | null {
  if (score === null || score === undefined || score === "") {
    return null;
  }

  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return null;
  }

  const roundedScore = Math.round(numericScore);
  const tier = getConfidenceTier(roundedScore);
  if (tier) {
    return tier;
  }
  return threshold !== undefined && roundedScore >= threshold
    ? CONFIDENCE_TIERS.find((candidate) => candidate.id === "qualified") ??
      null
    : null;
}

// The display half of resolveConfidenceTier's rule (see its comment — that
// is the law): the resolved tier's word beside the rounded score, a bare
// percentage where no tier resolves, "Pending" where there is no score to
// read at all.
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

  // The resolver rounds; this rounding is only for the printed number. The
  // raw score goes through so the resolver's comment stays literally true —
  // rounding happens there, once — and the parity sweep in
  // tests/core.test.ts holds the two sites together on fractional input.
  const tier = resolveConfidenceTier(numericScore, threshold);
  const roundedScore = Math.round(numericScore);
  return tier ? `${tier.label} ${roundedScore}%` : `${roundedScore}%`;
}
