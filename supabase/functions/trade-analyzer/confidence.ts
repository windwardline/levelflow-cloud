/**
 * Student-t multipliers, on the ENGINE side of the tree.
 *
 * The table was born in `scripts/sweepStats.ts` for D4's absolute-expectancy
 * gate, and D1's learning layer needed the same question answered hours later.
 * The obvious move — import it from `scripts/` — would have dragged
 * `node:readline` and `node:fs` into the Deno deployment graph through
 * `learning.ts`, breaking the live analyzer while every local gate stayed
 * green: `npm run check` type-checks both trees together and `npm run build`
 * builds the frontend, so nothing here would have caught it.
 *
 * So the table lives where the stricter runtime is, and the looser side
 * imports it. That is the direction `sweepStats.ts` already uses for
 * `BAR_CLOCK`.
 */

/**
 * Two-sided 95% multipliers by degrees of freedom.
 *
 * A NORMAL MULTIPLIER LIES AT SMALL n, and not by a little: at two degrees of
 * freedom the true multiplier is 4.303 against 1.96, so three resolutions of
 * +0.9/+0.1/+0.9 read as a measured profit under z and as nothing under t.
 *
 * Exact to df 30, then anchored at the conventional steps and out to the
 * asymptote. A df BETWEEN anchors takes the multiplier of the largest anchor at
 * or below it — the WIDER interval, the direction that refuses. An earlier
 * draft did the reverse and charged df 50 the df-60 multiplier, crediting
 * evidence the sample does not have; its own test caught it.
 */
const T_95: ReadonlyArray<readonly [number, number]> = [
  [1, 12.706], [2, 4.303], [3, 3.182], [4, 2.776], [5, 2.571],
  [6, 2.447], [7, 2.365], [8, 2.306], [9, 2.262], [10, 2.228],
  [11, 2.201], [12, 2.179], [13, 2.160], [14, 2.145], [15, 2.131],
  [16, 2.120], [17, 2.110], [18, 2.101], [19, 2.093], [20, 2.086],
  [21, 2.080], [22, 2.074], [23, 2.069], [24, 2.064], [25, 2.060],
  [26, 2.056], [27, 2.052], [28, 2.048], [29, 2.045], [30, 2.042],
  [40, 2.021], [60, 2.000], [80, 1.990], [100, 1.984], [120, 1.980],
  [200, 1.972], [500, 1.965], [1000, 1.962], [10_000, 1.960],
];

/** The 95% two-sided t multiplier for `df` degrees of freedom. */
export function tMultiplier95(df: number): number {
  if (!Number.isFinite(df) || df < 1) return Number.POSITIVE_INFINITY;
  let chosen = T_95[0][1];
  for (const [threshold, multiplier] of T_95) {
    if (df >= threshold) chosen = multiplier;
  }
  return chosen;
}
