/**
 * Global learning, on the money rather than on how often it arrived.
 *
 * AMENDMENT 39 (2026-08-27): profit is the measure; win rate is a result.
 * Nothing may publish, rank, gate, or LEARN on a frequency where the
 * underlying money is knowable. It is knowable here — `replay.ts` computes
 * `netRealizedR` on every resolution and stores it in the outcome row's
 * feedback — and this layer spent its whole life ignoring it.
 *
 * WHAT THE WIN RATE COULD NOT SEE. The retired curve was
 * `(winRate - 0.5) * 20`, which treats 0.5 as the point where a market is
 * neither helping nor hurting. That is only true when a win and a loss are
 * the same size, and on the ladder they are not: a `tp1_partial` banks the
 * partial and the runner then exits at entry, while a `take_profit` banks the
 * partial AND carries the runner half to a target at least
 * `minimumTargetRewardRisk` away. Both increment `wins`, so the rate cannot
 * distinguish the two outcomes whose difference IS the break-even point —
 * which ran from about 0.50 for an all-runner cohort to about 0.83 for an
 * all-partial one. 0.5 was right at one extreme and wrong everywhere else.
 *
 * Derived from shipped calibration in `tests/learningNeutralPoint.test.ts`: a
 * cohort winning 65% of the time, of which 65% are partials, has a mean
 * realized R of -0.0055 on forex and -0.049 on indices. It wins two in three
 * and shrinks the account, and the retired curve paid it +3 confidence.
 *
 * IN R THE NEUTRAL POINT IS 0. Not a constant that happens to be right, but
 * the definition of break-even — which retires the per-market pivot problem
 * entirely rather than solving it, and is why the answer was never a better
 * win-rate curve.
 */

import { tMultiplier95 } from "./confidence.ts";

/**
 * One cohort's resolutions.
 *
 * The win/loss counts SURVIVE the rewrite. Amendment 39 permits a rate beside
 * money, never instead of it, and these are what `strategy_weightings_global`
 * publishes next to the adjustment — dropping them would turn a change of
 * measure into data loss. Nothing here decides on them.
 */
export type LearningStats = {
  ambiguous: number;
  losses: number;
  /** Sum of `netRealizedR` over every FILLED resolution. */
  realizedRSum: number;
  /** Sum of squares, so the standard error is computable in one pass. */
  realizedRSumSq: number;
  /** How many resolutions carried a usable realized R. */
  realizedRCount: number;
  total: number;
  wins: number;
};

export type LearningWeight = {
  ambiguityPenalty: number;
  confidenceAdjustment: number;
  /** The interval bound nearest zero — what the adjustment is derived FROM. */
  conservativeMeanR: number | null;
  meanRealizedR: number | null;
  realizedRCount: number;
  sampleWeight: number;
  winRate: number;
  /** Non-null when the adjustment is refused rather than computed. */
  withheld: string | null;
};

/**
 * How many standard errors a cohort's mean must clear before it is acted on.
 *
 * STUDENT-T, BY DEGREES OF FREEDOM — corrected 2026-08-31, hours after this
 * file shipped, by the review that landed `tMultiplier95`.
 *
 * This constant was justified as "one statistical standard in the repo, not one
 * per consumer", which was true when D1 merged and false by the end of the same
 * day: D4 and M3 put a Student-t table in `scripts/sweepStats.ts` and used it
 * for exactly this question. A fixed 1.96 was then the second standard, and the
 * looser one — at every n below 10,000 the t multiplier is wider. The second
 * justification, "rather than carry a t table into the engine", is moot for the
 * same reason: the table exists.
 *
 * Kept as a NAMED export because the driver and the tests read it, and because
 * an asymptotic bound is still the right thing to describe. It is now the
 * limit the multiplier approaches, not the multiplier used.
 *
 * THE CONSEQUENCE IS INTENDED AND IS THE POINT. Realized R has a standard
 * deviation near 0.8 on every class, because it is dominated by the gap
 * between a full stop at -1R and a win — so a cohort at +0.20R clears this at
 * about 62 resolutions, one at +0.10R needs about 246, and one at +0.05R needs
 * roughly 984. A marginal cohort is therefore never scored, which is §19e
 * rather than a shortfall: its edge genuinely is not measurable yet, and the
 * retired curve's willingness to score it immediately is what made it
 * dangerous.
 */
export const CONFIDENCE_Z = 1.96;

/**
 * The multiplier actually applied, widened for the sample's own size.
 *
 * Imported rather than reimplemented: two tables would be the divergence this
 * correction exists to remove.
 */
export function confidenceMultiplier(resolutions: number): number {
  return tMultiplier95(resolutions - 1);
}

/**
 * Resolutions required before a mean is computed at all.
 *
 * 30, the same floor `cost-sensitivity-verdict.ts` applies before it will read
 * a confirm expectancy. ONE statistical standard in the repo, not one per
 * consumer — and the floor is what makes `CONFIDENCE_Z` defensible rather than
 * a decoration.
 *
 * A POLICY floor, and now only that. It began as a statistical one — a normal
 * multiplier is badly wrong at small n, and three resolutions of +0.9/+0.1/+0.9
 * scored +2.2 confidence under 1.96 where t at two degrees of freedom (4.303)
 * puts the bound below zero. `confidenceMultiplier` answers that directly now,
 * so the floor is no longer load-bearing for the arithmetic.
 *
 * It stays because a cohort of five resolutions should not move what every
 * operator is told to trade even when its interval clears zero, and because
 * removing it would LOOSEN the layer — which is not a change to make on the
 * argument that something else got stricter.
 */
export const MIN_RESOLUTIONS_FOR_ADJUSTMENT = 30;

/**
 * Confidence points per 1R of conservatively-estimated mean.
 *
 * ANCHORED TO THE RETIRED CURVE'S PRACTICAL MAGNITUDE, not chosen for feel.
 * `(winRate - 0.5) * 20` paid about +3 points to a 0.65 win rate — its typical
 * output, far from its bounds. At 20 points per R a genuinely positive cohort
 * (+0.20R) scores about +1.8 at 200 resolutions and +3.2 at 1,000, so learning
 * keeps the authority it always had while changing what earns it. Raising this
 * would hand a model that has just changed measures MORE influence than the
 * one it replaced, on its first day.
 */
export const ADJUSTMENT_PER_R = 20;

/**
 * The hard bound, unchanged from the retired curve's own range of ±10.
 *
 * A safety rail rather than an operating point: reaching it needs a
 * conservative mean of 0.5R, which is far beyond any cohort the ladder can
 * plausibly produce. If it ever binds, something upstream is wrong and a
 * clamped adjustment is the least of it.
 */
export const ADJUSTMENT_CAP = 10;

/**
 * The mean, pulled toward zero by its own error, and never past it.
 *
 * Returns the end of the 95% interval NEAREST ZERO, which is conservative in
 * both directions by construction: a cohort that looks good is scored on the
 * least good reading its data supports, and one that looks bad on the least
 * bad. Amendment 36 requires exactly this symmetry for a withdrawal, and there
 * is no reason a reward should answer to a weaker standard than a penalty.
 *
 * Null below `MIN_RESOLUTIONS_FOR_ADJUSTMENT`, where a normal multiplier
 * overstates the evidence. A single +1R resolution has a mean of +1R and no
 * error bar at all, and scoring it would be the retired curve's mistake in a
 * new unit.
 */
export function conservativeMeanR(stats: LearningStats): number | null {
  const n = Math.max(0, Math.floor(stats.realizedRCount));
  if (n < MIN_RESOLUTIONS_FOR_ADJUSTMENT) return null;
  const mean = stats.realizedRSum / n;
  const variance = Math.max(
    0,
    (stats.realizedRSumSq - stats.realizedRSum * stats.realizedRSum / n) /
      (n - 1),
  );
  const standardError = Math.sqrt(variance / n);
  const margin = confidenceMultiplier(n) * standardError;
  if (mean > 0) return Math.max(0, mean - margin);
  if (mean < 0) return Math.min(0, mean + margin);
  return 0;
}

/**
 * The outcomes a cohort learns from: every FILLED resolution.
 *
 * FOUR WIDER THAN THE WIN-RATE ERA. `expired_in_profit` and `expired_at_loss`
 * are filled trades that banked or lost real money and were excluded outright,
 * because under a win rate they are neither a win nor a loss and there was
 * nowhere to put them. Amendment 39 removes the excuse: where realized R
 * exists it governs, and a review window closing on an open position is not an
 * absence of money.
 *
 * `unfilled` (no position was ever taken) and `pending` (not resolved) carry
 * none and are absent by construction rather than by omission.
 */
export const LEARNED_OUTCOMES: ReadonlySet<string> = new Set([
  "ambiguous",
  "expired_at_loss",
  "expired_in_profit",
  "stop_loss",
  "take_profit",
  "tp1_partial",
]);

/** One resolution, as the refresh reads it out of the database. */
export type LearningResolution = {
  /** Raw from `feedback`, so the narrowing is exercised rather than assumed. */
  netRealizedR: unknown;
  outcome: string;
  setupKey: string;
};

/**
 * Fold resolutions into one `LearningStats` per cohort.
 *
 * PURE, and separated from the refresh for that reason. The defect this
 * replaces survived three weeks of source-shaped assertions; the only way to
 * show that an expiry now reaches the mean and a malformed row does not is to
 * run the fold and read the numbers out.
 */
export function accumulateLearningStats(
  resolutions: readonly LearningResolution[],
): Map<string, LearningStats> {
  const grouped = new Map<string, LearningStats>();
  for (const resolution of resolutions) {
    if (!LEARNED_OUTCOMES.has(resolution.outcome)) continue;
    const current = grouped.get(resolution.setupKey) ?? {
      ambiguous: 0,
      losses: 0,
      realizedRCount: 0,
      realizedRSum: 0,
      realizedRSumSq: 0,
      total: 0,
      wins: 0,
    };
    current.total += 1;
    // THE COUNTS STILL MOVE, and still mean what they meant. Amendment 39
    // allows a rate BESIDE money; these are published next to the adjustment
    // and no longer decide it. An expiry is neither a win nor a loss under
    // that taxonomy and increments neither — its MONEY is counted below, which
    // is the whole point of the widening.
    if (
      resolution.outcome === "take_profit" ||
      resolution.outcome === "tp1_partial"
    ) {
      current.wins += 1;
    } else if (resolution.outcome === "stop_loss") {
      current.losses += 1;
    } else if (resolution.outcome === "ambiguous") {
      current.ambiguous += 1;
    }
    // A resolution whose feedback carries no usable figure is counted in
    // `total` and LEFT OUT of the mean rather than folded in as a zero. A
    // missing measurement is not a break-even one, and averaging it as one
    // would drag every cohort toward the neutral point it is measured against
    // — the same collapse the win rate made between a partial and a full win.
    const realizedR = Number(resolution.netRealizedR);
    if (
      resolution.netRealizedR !== null && resolution.netRealizedR !== "" &&
      Number.isFinite(realizedR)
    ) {
      current.realizedRSum += realizedR;
      current.realizedRSumSq += realizedR * realizedR;
      current.realizedRCount += 1;
    }
    grouped.set(resolution.setupKey, current);
  }
  return grouped;
}

export function calculateLearningWeight(stats: LearningStats): LearningWeight {
  // 2e / round-8 PH-7: an ambiguous path resolved AGAINST the trade — the
  // engine prices its exit at the stop side — so it carries a real, deliberately
  // pessimistic realized R and joins the mean like any other resolution. The
  // ambiguity penalty below stays a separate DATA QUALITY discount; the double
  // effect is deliberate and conservative, which is the direction 2e demands.
  const ambiguous = Math.max(stats.ambiguous, 0);
  const resolved = Math.max(stats.wins + stats.losses, 0) + ambiguous;
  const total = Math.max(stats.total, resolved);
  const winRate = stats.wins / Math.max(resolved, 1);
  const baseSampleWeight = resolved >= 20
    ? 1
    : resolved >= 8
    ? resolved / 20
    : 0;
  const ambiguityShare = total > 0 ? ambiguous / total : 0;
  const ambiguityPenalty = Math.min(0.45, ambiguityShare * 0.75);
  const sampleWeight = roundWeight(baseSampleWeight * (1 - ambiguityPenalty));

  const realizedRCount = Math.max(0, Math.floor(stats.realizedRCount));
  const meanRealizedR = realizedRCount > 0
    ? stats.realizedRSum / realizedRCount
    : null;
  const conservative = conservativeMeanR(stats);

  // The ambiguity discount rides on the ADJUSTMENT, because nothing else
  // consumes it. `sample_weight` is recorded onto the setup row for a reader
  // and never multiplies the score, so an adjustment that did not carry the
  // discount itself would not carry it at all.
  const confidenceAdjustment = conservative === null ? 0 : clamp(
    conservative * ADJUSTMENT_PER_R * (1 - ambiguityPenalty),
    -ADJUSTMENT_CAP,
    ADJUSTMENT_CAP,
  );

  return {
    ambiguityPenalty: roundWeight(ambiguityPenalty),
    confidenceAdjustment: roundWeight(confidenceAdjustment),
    conservativeMeanR: conservative === null ? null : roundWeight(conservative),
    meanRealizedR: meanRealizedR === null ? null : roundWeight(meanRealizedR),
    realizedRCount,
    sampleWeight,
    winRate: roundWeight(winRate),
    // NOT a refusal any more. The neutral point was never derivable from a win
    // rate and this layer refused rather than guess one; in R it is 0 by
    // definition. A cohort too thin to clear its own error bar scores 0 through
    // `conservativeMeanR`, which is a measurement, not a withholding — and the
    // two must not be reported as the same thing.
    withheld: null,
  };
}

/** Retired with the win-rate curve; kept exported so a stale import fails loudly. */
export const WITHHELD_REASON: null = null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundWeight(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)) : 0;
}
