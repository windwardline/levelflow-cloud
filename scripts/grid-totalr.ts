/**
 * The acceptance gate over a manifested grid corpus (3b + 3f + 3g).
 *
 * Reads a grid by TOTAL R across both splits, per class — but from the
 * EMIT, never from a printed table. The table form this replaces read
 * total R as expectancy-over-filled x setups-including-unfilled (the
 * e x n unit mismatch behind rounds 25-28's totals), gated on bare `>`
 * inequalities, and deliberately ignored per-trade expectancy while
 * sweep-analysis deliberately ignored volume. Here:
 *
 * - Total R is a SUM of realized R over filled, accepted outcomes
 *   (sweepStats — the engine's vocabulary).
 * - 3f: improvement is stated in standard errors. The SE of a total is
 *   rSd x sqrt(filled); a delta's sigma adds the two in quadrature. The
 *   gate wants both splits positive and the test split at least one
 *   sigma above zero.
 * - 3g: total R AND per-trade expectancy must both improve on test —
 *   amendment 25 cut the other way (volume matters), and both lessons
 *   hold: volume bought by degrading every trade is rejected, quality
 *   bought by refusing most of the volume is refused as THIN.
 * - 3b: a day-block permutation null prices the improvement. Within each
 *   symbol and split, whole DAYS of outcomes swap variant labels —
 *   blocks, not rows, because outcomes inside a day share their market —
 *   and the p-value is how often shuffled labels match the observed test
 *   delta. Multiplicity across a crossed grid is priced here rather than
 *   ignored.
 *
 * Usage:
 *   npx tsx scripts/grid-totalr.ts <emit.jsonl> [--permutations 1000] [--seed 7]
 *
 * The emit must carry its manifest beside it (2i): an undescribed corpus
 * is refused at the door.
 */
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  addOutcome,
  assertManifest,
  assertManifestedCorpusStreaming,
  emptyStats,
  expectancy,
  rStdDev,
  type SweepEmitRow,
  type SweepStats,
} from "./sweepStats.ts";
import { stableStringify, type SweepManifest } from "./sweepManifest.ts";
import { stratifiedHoldout } from "./sweepFolds.ts";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const DAY_MS = 86_400_000;

// A cube cell is the shared stats vocabulary plus the day-block ledger the
// permutation null permutes — whole days, because outcomes inside a day
// share their market.
export type GateCell = SweepStats & { dayR: Map<number, number> };

// symbol -> variant -> split -> cell
export type GridCube = Map<string, Map<string, Map<string, GateCell>>>;

export function readGridCube(
  rows: SweepEmitRow[],
  options: { includeHoldout?: boolean } = {},
): GridCube {
  const cube: GridCube = new Map();
  for (const row of rows) {
    addRowToCube(cube, row, options);
  }
  return cube;
}

/** One row into the cube — shared by the array and streaming readers. */
function addRowToCube(
  cube: GridCube,
  row: SweepEmitRow,
  options: { includeHoldout?: boolean },
): void {
  {
    // capture-all corpora include rejected records for calibration reads;
    // the gate grades the stream production would actually take.
    if (row.accepted === false) {
      return;
    }
    // 3e: holdout markets exist for the one confirmation read and are
    // excluded from every tuning aggregate by default.
    if (row.holdout === true && !options.includeHoldout) {
      return;
    }
    const variant = typeof row.variant === "string" ? row.variant : "baseline";
    const split = typeof row.split === "string" ? row.split : "all";
    if (!cube.has(row.symbol)) {
      cube.set(row.symbol, new Map());
    }
    const byVariant = cube.get(row.symbol)!;
    if (!byVariant.has(variant)) {
      byVariant.set(variant, new Map());
    }
    const bySplit = byVariant.get(variant)!;
    if (!bySplit.has(split)) {
      bySplit.set(split, { ...emptyStats(), dayR: new Map() });
    }
    const cell = bySplit.get(split)!;
    addOutcome(cell, row);
    if (row.outcome !== "unfilled") {
      const day = Math.floor(Number(row.time ?? 0) / DAY_MS);
      cell.dayR.set(day, (cell.dayR.get(day) ?? 0) + (Number(row.realizedR) || 0));
    }
  }
}

export type VariantVerdict = {
  // One word for the row's disposition, with THIN carrying its count —
  // stated on the verdict rather than reconstructed by every printer.
  // REQUIRED (#364 round 43, smaller): optional, it backed a
  // `?? "NO VERDICT"` fallback in the printer — the one path by which a
  // future noVerdict without a reason prints the causeless label rounds
  // 39 and 41 spent two rounds eliminating. Required makes the omission
  // a compile error, the same move that made noVerdict required.
  reason: string;
  // TRUE when the gate could not resolve this variant at all — an
  // unresolvable pairing or an absent group baseline — as a FIELD, not
  // a message prefix (#364 round 42, finding 2): the printer had
  // re-derived this boolean by prefix-matching the reason's wording,
  // so a reworded reason silently reopened round 39's bare-"fails"
  // defect with every test green. The printer keys on this field and
  // reuses the reason verbatim; the pin refuses any prefix
  // discriminator.
  noVerdict: boolean;
  fitFilled?: number;
  accepted: boolean;
  // Days the variant traded that the baseline never did — reported apart
  // from the paired test (LA-4c): "trades more days" is composition, not
  // improvement on shared days.
  compositionR: number | null;
  // The OTHER half of the non-shared portion (#364 round 40, finding
  // 1): total baseline select-fold R on days the variant did not trade
  // — the R a tightening dial forwent. Both halves are descriptive;
  // the whole-fold deltas carry both, by the exact identity
  // selectTotalDelta = Σ(shared deltas) + compositionR − droppedR
  // (#364 round 41, smaller) — droppedR enters ΔR sel NEGATED, so a
  // NEGATIVE droppedR is avoided baseline loss (a positive
  // contribution to the printed delta), while compositionR enters with
  // its own sign.
  droppedR: number | null;
  // The confirm fold is read ONLY under confirmFinal, appended to the
  // burned-log — discipline by mechanism, not promise (LA-6). NULL
  // unless the delta has evidence on BOTH sides (#364 round 43,
  // finding 1): totalOf is `rSum ?? 0` and mergeInto skips absent
  // cells, so an accepted variant that produced no filled confirm-fold
  // outcomes yielded 0 − 0 = 0 — a printable figure over an absent
  // denominator, and since round 42 the very thing that burns the
  // corpus's one read. One side missing is the round-37 shape at this
  // grain besides: a "delta" that is really one side's own total. The
  // file's established disposition for a quantity with no evidence is
  // null with the cause named, so that is what this is.
  confirmTotalDelta: number | null;
  // The confirm delta's two denominators, so the figure states its own
  // sample the way the E8 rollup's clustered s.e. does (#364 round 43,
  // finding 1: `0.0 over nothing` and `0.0 net over 400 outcomes` had
  // printed identically, in the one number LA-6 exists to ration).
  // NULL when the confirm fold is not in play at all — a legacy
  // two-split corpus, or a run without --confirm-final — which is how
  // the printer tells "not requested" from "requested and unevidenced".
  confirmFilled: number | null;
  confirmBaseFilled: number | null;
  fitTotalDelta: number;
  // The ENFORCED statistic (LA-3/LA-4): family-wise max-T sign-flip
  // permutation over shared-day deltas, one flip pattern per iteration
  // across the whole class family.
  pairedP: number;
  // Retired from the rule, kept descriptive (LA-5): the pooled-permutation
  // p and the iid sigma both mismodel paired, serially-dependent data.
  permutationP: number;
  breachDayShare: number | null;
  selectExpectancyDelta: number;
  // Censoring readout (LA-10): expiries / filled on the select fold, so a
  // sizing-factor cell carries its own license.
  selectExpiryShare: number | null;
  selectFilled: number;
  selectSigma: number;
  selectTotalDelta: number;
  sharedDays: number;
  // Days whose delta is NONZERO — the support of the paired statistic
  // (#364 round 39, finding 1): a zero delta contributes nothing under
  // any sign assignment, so this count, not sharedDays, sets the
  // minimum attainable pairedP (~2^-effectivePairs) and is the
  // quantity the acceptance floor gates.
  effectivePairs: number;
  thin: boolean;
  // Survival readout (RM-3/8): the variant's own worst select-fold day in
  // R, and the share of its days at or beyond -4R.
  worstDayR: number | null;
};

export type FoldNames = { confirm?: string; fit: string; select: string };

type GateOptions = {
  acknowledgePriorReads?: boolean;
  // The variant every other cell compares against. Defaults to the bare
  // "baseline" label; a 4c measurement grid that retires the confidence
  // gate names its threshold-0 current-geometry cell here instead, so
  // comparisons isolate one axis change at a time.
  baselineVariant?: string;
  confirmFinal?: boolean;
  confirmLogPath?: string;
  foldNames?: FoldNames;
  permutations?: number;
  seed?: number;
};

// Deterministic PRNG (mulberry32): permutation p-values must reproduce
// run to run, or two readers of one corpus argue about the same number.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function seedFrom(base: number, text: string): number {
  let hash = base >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(hash, 31) + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * Family-wise paired sign-flip permutation (LA-3/LA-4): each variant's
 * statistic is its normalized shared-day delta sum; each iteration flips
 * ONE sign per day, applied consistently to every variant in the class
 * family, and the null distribution is the maximum statistic across the
 * family — strong family-wise control over the crossed grid.
 */
// THE PAIRING FLOOR'S BASIS (#364 round 38, finding 2; counted quantity
// corrected round 39, finding 1): for same-signed NONZERO deltas the
// sign-flip maximum is reached only by the all-matching assignment, so
// the smallest attainable pairedP at k nonzero shared-day deltas is
// ~2^-k — 0.50 at k=1, 0.125 at k=3, 0.0625 at k=4, 0.03125 at k=5 —
// and 5 is therefore the smallest pairing at which the 0.05 threshold
// is reachable at all. The count is the SUPPORT, never the raw shared
// day count: a zero delta contributes s_i·0 = 0 under EVERY sign
// assignment, and exact zeros are the grid's common case (a parameter
// tweak leaves most days' trades bit-identical, and dayTotals sums
// symbols in a fixed order, so unaffected days difference to exactly
// zero at both grains) — round 38's day-count floor admitted a
// four-day effective pairing riding behind a forty-day one. Below the
// floor acceptance was already impossible in EXPECTATION, but the
// permutation p is an estimate: at k=4 the exceed count is
// Binomial(permutations, 1/16), and with the default 1,000 draws
// roughly one seed in twenty realises p <= 0.05 — the floor makes the
// impossibility deterministic instead of leaving it to estimator
// noise. Any floor below 5 admits verdicts the statistic cannot
// support; raising it above 5 is a strictness choice this derivation
// does not compel. The five-pair boundary is pinned from BOTH sides in
// tests/acceptanceGate.test.ts (accept at exactly five, refuse at
// four — sparse and dense).
const MIN_EFFECTIVE_PAIRS = 5;

/**
 * The support of a delta vector — days whose delta is NONZERO, the one
 * count the paired machinery keys on. Declared ONCE (#364 round 41,
 * finding 2): familyPairedP's null membership and p-floor and
 * groupVerdicts' acceptance floor and NO VERDICT reason all rest on
 * the invariant that a variant is in the null IFF it can be accepted,
 * so the zero test lives in one predicate — two independent `!== 0`
 * checks could silently diverge (a tolerance on one side) and print a
 * certain-looking wrong diagnosis. tests/acceptanceGate.test.ts pins
 * the single occurrence.
 */
export function supportOf(deltas: Map<number, number>): number {
  let nonzero = 0;
  for (const delta of deltas.values()) {
    if (delta !== 0) nonzero += 1;
  }
  return nonzero;
}

function familyPairedP(
  deltasByVariant: Map<string, Map<number, number>>,
  permutations: number,
  random: () => number,
): Map<string, number> {
  const variants = [...deltasByVariant.keys()];
  const allDays = [...new Set(
    variants.flatMap((variant) => [...deltasByVariant.get(variant)!.keys()]),
  )].sort((a, b) => a - b);
  const observed = new Map<string, number>();
  const scale = new Map<string, number>();
  const support = new Map<string, number>();
  for (const variant of variants) {
    const deltas = deltasByVariant.get(variant)!;
    let sum = 0;
    let sumSq = 0;
    for (const delta of deltas.values()) {
      sum += delta;
      sumSq += delta * delta;
    }
    const norm = Math.sqrt(sumSq);
    scale.set(variant, norm);
    support.set(variant, supportOf(deltas));
    observed.set(variant, norm > 0 ? sum / norm : 0);
  }
  const exceed = new Map<string, number>(variants.map((v) => [v, 0]));
  for (let iteration = 0; iteration < permutations; iteration += 1) {
    const signs = new Map<number, number>();
    for (const day of allDays) {
      signs.set(day, random() < 0.5 ? -1 : 1);
    }
    let maxT = Number.NEGATIVE_INFINITY;
    for (const variant of variants) {
      const deltas = deltasByVariant.get(variant)!;
      const norm = scale.get(variant)!;
      // #364 round 40, finding 2: the family-wise null spans the
      // hypotheses actually under test. A sub-floor variant cannot be
      // accepted at any p (rounds 38–39), so it contributes nothing
      // to maxT — a two-pair sibling reaches T = √2 on a quarter of
      // draws and would block an accept-eligible six-pair variant
      // (observed ≈ 1.195, own p 1/64) at p ≈ 0.25 — and round 37's
      // norm === 0 exclusion is this rule's zero point (support ≥ 1
      // implies norm > 0, so the division below stays safe).
      if (support.get(variant)! < MIN_EFFECTIVE_PAIRS) continue;
      let sum = 0;
      for (const [day, delta] of deltas) {
        sum += signs.get(day)! * delta;
      }
      const statistic = sum / norm;
      if (statistic > maxT) maxT = statistic;
    }
    for (const variant of variants) {
      if (maxT >= observed.get(variant)!) {
        exceed.set(variant, exceed.get(variant)! + 1);
      }
    }
  }
  // #364 round 37, finding 1: a variant with NO pairs — an empty delta
  // map, or all-zero deltas (norm 0 either way) — reads p = 1, never
  // the minimum attainable value. When every variant in the family was
  // degenerate, the permutation loop continued past all of them, maxT
  // stayed -Infinity, "-Infinity >= observed(0)" was false on every
  // iteration, exceed stayed 0, and the gate printed
  // p = 1/(permutations+1) ≈ 0.001 EXACTLY (no RNG involved) from zero
  // pairs — while the sibling permutationPValue guards its own
  // degenerate case (baselineCount 0 → 1) and is descriptive only. A
  // paired test with no pairs supports no verdict.
  // Round 40 extended the same rule to the sub-floor band: a variant
  // below MIN_EFFECTIVE_PAIRS neither joins the maxT family nor
  // receives a p from a null it is excluded from — its p is 1,
  // matching its NO VERDICT disposition (which subsumes round 37's
  // scale === 0 case: support 0 implies norm 0).
  return new Map(variants.map((variant) => [
    variant,
    support.get(variant)! < MIN_EFFECTIVE_PAIRS
      ? 1
      : (1 + exceed.get(variant)!) / (permutations + 1),
  ]));
}

function totalOf(stats: SweepStats | undefined): number {
  return stats?.rSum ?? 0;
}

function totalVarianceOf(stats: SweepStats | undefined): number {
  if (!stats) {
    return 0;
  }
  const deviation = rStdDev(stats);
  return deviation === null ? 0 : deviation * deviation * stats.filled;
}

/**
 * Day-block permutation (3b): the class's baseline and variant day-blocks
 * pool together, and whole days shuffle sides, preserving each side's day
 * count. Returns the p-value of the observed total-R delta under that
 * label-exchangeable null.
 */
function permutationPValue(
  baselineBlocks: number[],
  variantBlocks: number[],
  observedDelta: number,
  permutations: number,
  random: () => number,
): number {
  const blocks = [...baselineBlocks, ...variantBlocks];
  const baselineCount = baselineBlocks.length;
  if (blocks.length < 2 || baselineCount === 0 ||
      baselineCount === blocks.length) {
    return 1;
  }
  const totalSum = blocks.reduce((sum, value) => sum + value, 0);
  let atLeastAsExtreme = 0;
  for (let iteration = 0; iteration < permutations; iteration += 1) {
    // Partial Fisher-Yates: choose baselineCount blocks for the baseline.
    const indices = blocks.map((_, index) => index);
    let baselineSum = 0;
    for (let pick = 0; pick < baselineCount; pick += 1) {
      const chosen = pick +
        Math.floor(random() * (indices.length - pick));
      [indices[pick], indices[chosen]] = [indices[chosen], indices[pick]];
      baselineSum += blocks[indices[pick]];
    }
    const shuffledDelta = totalSum - baselineSum - baselineSum;
    if (shuffledDelta >= observedDelta) {
      atLeastAsExtreme += 1;
    }
  }
  return (1 + atLeastAsExtreme) / (permutations + 1);
}

export function classVerdicts(
  cube: GridCube,
  options: GateOptions = {},
): Map<string, Map<string, VariantVerdict>> {
  const symbolsByClass = new Map<string, string[]>();
  for (const symbol of cube.keys()) {
    const assetClass = getAssetType(symbol);
    if (!symbolsByClass.has(assetClass)) {
      symbolsByClass.set(assetClass, []);
    }
    symbolsByClass.get(assetClass)!.push(symbol);
  }
  return groupVerdicts(cube, symbolsByClass, options);
}

/**
 * 4d: the derivation unit is ONE market (amendment 33 — per market,
 * never per class). Same statistics, singleton groups, plus an absolute
 * sample floor: a market with fewer than 30 filled select-fold decisions
 * cannot carry a verdict whatever its ratios (the sweep's own min-n).
 */
export function marketVerdicts(
  cube: GridCube,
  options: GateOptions = {},
): Map<string, Map<string, VariantVerdict>> {
  const singletons = new Map<string, string[]>();
  for (const symbol of cube.keys()) {
    singletons.set(symbol, [symbol]);
  }
  return groupVerdicts(cube, singletons, { ...options, minFilled: 30 });
}

function groupVerdicts(
  cube: GridCube,
  groups: Map<string, string[]>,
  options: GateOptions & { minFilled?: number } = {},
): Map<string, Map<string, VariantVerdict>> {
  const permutations = options.permutations ?? 1_000;
  const baselineVariant = options.baselineVariant ?? "baseline";
  const foldNames = options.foldNames ?? { fit: "fit", select: "select" };
  const random = mulberry32(options.seed ?? 7);
  const minFilled = options.minFilled ?? 0;
  const verdicts = new Map<string, Map<string, VariantVerdict>>();
  const symbolsByClass = groups;

  const variants = new Set<string>();
  for (const byVariant of cube.values()) {
    for (const variant of byVariant.keys()) {
      variants.add(variant);
    }
  }
  // #364 round 37, finding 2: a baseline that matches NO cell makes
  // every class degenerate at once — empty baseline days, deltas
  // against nothing, fit/select "deltas" that are the variant's own
  // totals — and with finding 1's floor it would quietly fail every
  // variant while the real defect is a typo'd name (before the floor
  // it ACCEPTED every profitable variant at the minimum p). Refuse,
  // naming what the corpus actually carries.
  if (!variants.has(baselineVariant)) {
    throw new Error(
      `baseline variant "${baselineVariant}" carries no cell in this ` +
        `corpus — every class would grade against nothing; variants ` +
        `present: ${[...variants].sort().join(", ")}`,
    );
  }

  for (const [assetClass, symbols] of symbolsByClass) {
    const classMap = new Map<string, VariantVerdict>();
    verdicts.set(assetClass, classMap);
    // Class-level select-fold day totals per variant, for the paired test
    // and the survival readout.
    const dayTotals = (variant: string): Map<number, number> => {
      const totals = new Map<number, number>();
      for (const symbol of symbols) {
        const cell = cube.get(symbol)?.get(variant)?.get(foldNames.select);
        if (!cell) continue;
        for (const [day, value] of cell.dayR) {
          totals.set(day, (totals.get(day) ?? 0) + value);
        }
      }
      return totals;
    };
    const baselineDays = dayTotals(baselineVariant);
    // #364 round 41, smaller: a GROUP whose baseline carries no
    // select-fold days — reachable at the market grain even though the
    // cube-wide baseline-exists refusal passed — is diagnosed by name,
    // never blamed on the pairing (a "pairing 0 of 0 shared" reason at
    // the 4d grain pointed at the statistic when the absent baseline
    // was the fact; the amendment-25 starvation shape lands exactly
    // here).
    const baselineAbsentInGroup = baselineDays.size === 0;
    const deltasByVariant = new Map<string, Map<number, number>>();
    const compositionByVariant = new Map<string, number>();
    const droppedByVariant = new Map<string, number>();
    const variantDayCache = new Map<string, Map<number, number>>();
    for (const variant of variants) {
      if (variant === baselineVariant) continue;
      const variantDays = dayTotals(variant);
      variantDayCache.set(variant, variantDays);
      const deltas = new Map<number, number>();
      let composition = 0;
      // #364 round 40, finding 1: the non-shared portion has TWO
      // halves. compositionR carries the variant-only days ("trades
      // more days"); the days the BASELINE traded and the variant did
      // not — the dominant half for a TIGHTENING dial, which removes
      // days — were in neither map and on no printed line, while the
      // whole-fold selectTotalDelta silently carried them: a variant
      // trading a winning subset of the baseline's days printed comp
      // 0.0 with its real edge living in the forgone baseline R.
      // droppedR names that half.
      let dropped = 0;
      for (const [day, value] of variantDays) {
        if (baselineDays.has(day)) {
          deltas.set(day, value - baselineDays.get(day)!);
        } else {
          composition += value;
        }
      }
      for (const [day, value] of baselineDays) {
        if (!variantDays.has(day)) dropped += value;
      }
      deltasByVariant.set(variant, deltas);
      compositionByVariant.set(variant, composition);
      droppedByVariant.set(variant, dropped);
    }
    const pairedPs = familyPairedP(
      deltasByVariant,
      permutations,
      mulberry32(seedFrom(options.seed ?? 7, assetClass)),
    );
    for (const variant of variants) {
      if (variant === baselineVariant) {
        continue;
      }
      const aggregate = {
        base: {
          confirm: emptyStats(),
          fit: emptyStats(),
          select: emptyStats(),
        },
        variant: {
          confirm: emptyStats(),
          fit: emptyStats(),
          select: emptyStats(),
        },
      };
      for (const symbol of symbols) {
        for (const fold of ["confirm", "fit", "select"] as const) {
          const splitName = fold === "confirm"
            ? foldNames.confirm
            : foldNames[fold];
          if (!splitName) continue;
          mergeInto(
            aggregate.base[fold],
            cube.get(symbol)?.get(baselineVariant)?.get(splitName),
          );
          mergeInto(
            aggregate.variant[fold],
            cube.get(symbol)?.get(variant)?.get(splitName),
          );
        }
      }
      const selectTotalDelta = totalOf(aggregate.variant.select) -
        totalOf(aggregate.base.select);
      const fitTotalDelta = totalOf(aggregate.variant.fit) -
        totalOf(aggregate.base.fit);
      const sigma = Math.sqrt(
        totalVarianceOf(aggregate.variant.select) +
          totalVarianceOf(aggregate.base.select),
      );
      const selectSigma = sigma > 0 ? selectTotalDelta / sigma : 0;
      const baseExpectancy = expectancy(aggregate.base.select) ?? 0;
      const variantExpectancy = expectancy(aggregate.variant.select) ?? 0;
      const selectExpectancyDelta = variantExpectancy - baseExpectancy;
      const thin = aggregate.variant.select.filled <
          aggregate.base.select.filled * 0.5 ||
        aggregate.variant.select.filled < minFilled;

      const baselineBlocks: number[] = [];
      const variantBlocks: number[] = [];
      for (const symbol of symbols) {
        for (
          const value of cube.get(symbol)?.get(baselineVariant)
            ?.get(foldNames.select)?.dayR.values() ?? []
        ) {
          baselineBlocks.push(value);
        }
        for (
          const value of cube.get(symbol)?.get(variant)
            ?.get(foldNames.select)?.dayR.values() ?? []
        ) {
          variantBlocks.push(value);
        }
      }
      const permutationP = permutationPValue(
        baselineBlocks,
        variantBlocks,
        selectTotalDelta,
        permutations,
        random,
      );

      const pairedP = pairedPs.get(variant) ?? 1;
      const variantDeltas = deltasByVariant.get(variant);
      const sharedDays = variantDeltas?.size ?? 0;
      const effectivePairs = variantDeltas ? supportOf(variantDeltas) : 0;
      // The rule (round-8 batch 1): both folds positive, the PAIRED
      // family-wise p enforced at 0.05, expectancy holds, not thin —
      // and a pairing the statistic can actually resolve (#364 round
      // 37, finding 1 drew the floor at zero pairs; round 38 raised it
      // to five; round 39, finding 1 corrected the counted quantity to
      // the SUPPORT — zero deltas cannot flip the statistic, so the
      // floor gates effectivePairs, the same scale the round-37
      // norm === 0 floor sits on). Stated plainly (#364 round 38): the
      // p certifies the SHARED days only, while the fit/select deltas
      // and the expectancy term are whole-fold aggregates — the
      // non-shared portion's two halves are named per verdict
      // (compositionR the variant-only days, droppedR the
      // baseline-only days, #364 round 40, finding 1), printed,
      // descriptive — so a variant that composes heavily, or rides
      // the baseline R it forwent, carries an acceptance whose p
      // speaks for its pairing alone. Sigma and the pooled p remain
      // printed, descriptive only.
      const accepted = !thin && fitTotalDelta > 0 && selectTotalDelta > 0 &&
        effectivePairs >= MIN_EFFECTIVE_PAIRS && pairedP <= 0.05 &&
        selectExpectancyDelta >= 0;
      const selectStats = aggregate.variant.select;
      const expiries = selectStats.filled - selectStats.wins -
        selectStats.stops - selectStats.ambiguous;
      const variantDays = variantDayCache.get(variant) ?? new Map();
      let worstDayR: number | null = null;
      let breachDays = 0;
      for (const value of variantDays.values()) {
        if (worstDayR === null || value < worstDayR) worstDayR = value;
        if (value <= -4) breachDays += 1;
      }
      classMap.set(variant, {
        accepted,
        // #364 round 39, finding 2: an unresolvable pairing is NO
        // VERDICT with the pairing named — the round-31 rule at the
        // sibling starvation gate — never the same "fails" as a
        // measured loss. The reasons carry their full specifics so
        // every printer reuses them verbatim, an absent baseline
        // is named before the pairing it empties (#364 round 41,
        // smaller), and the noVerdict FIELD carries the disposition
        // so no printer parses the message (#364 round 42, finding 2).
        noVerdict: !thin &&
          (baselineAbsentInGroup || effectivePairs < MIN_EFFECTIVE_PAIRS),
        reason: thin
          ? `THIN (${selectStats.filled} filled)`
          : baselineAbsentInGroup
          ? `NO VERDICT — baseline "${baselineVariant}" has no ` +
            `${foldNames.select}-fold days in this group; no ` +
            `comparison is possible`
          : effectivePairs < MIN_EFFECTIVE_PAIRS
          ? `NO VERDICT — pairing ${effectivePairs} nonzero of ` +
            `${sharedDays} shared days is below the statistic's ` +
            `floor (${MIN_EFFECTIVE_PAIRS})`
          : accepted
          ? "accept"
          : "fails",
        compositionR: compositionByVariant.get(variant) ?? null,
        droppedR: droppedByVariant.get(variant) ?? null,
        // #364 round 43, finding 1: a delta needs evidence on BOTH
        // sides. Without the filled guards this read 0 − 0 = 0 for an
        // accepted variant that produced no confirm-fold outcomes
        // (addRowToCube drops unaccepted rows, so such a variant has no
        // cell at all, and one whose confirm setups all expired
        // unfilled has rSum 0 by the same path) — and acceptance is
        // decided on fit+select alone, so clearing the gate implies
        // nothing about confirm-fold presence.
        confirmTotalDelta: accepted && foldNames.confirm &&
            aggregate.variant.confirm.filled > 0 &&
            aggregate.base.confirm.filled > 0
          ? totalOf(aggregate.variant.confirm) -
            totalOf(aggregate.base.confirm)
          : null,
        confirmFilled: foldNames.confirm
          ? aggregate.variant.confirm.filled
          : null,
        confirmBaseFilled: foldNames.confirm
          ? aggregate.base.confirm.filled
          : null,
        fitTotalDelta,
        pairedP,
        permutationP,
        breachDayShare: variantDays.size > 0
          ? breachDays / variantDays.size
          : null,
        selectExpectancyDelta,
        selectExpiryShare: selectStats.filled > 0
          ? Number((expiries / selectStats.filled).toFixed(4))
          : null,
        fitFilled: aggregate.variant.fit.filled,
        selectFilled: selectStats.filled,
        selectSigma,
        selectTotalDelta,
        sharedDays,
        effectivePairs,
        thin,
        worstDayR,
      });
    }
  }
  return verdicts;
}

function mergeInto(target: SweepStats, source: SweepStats | undefined): void {
  if (!source) {
    return;
  }
  target.ambiguous += source.ambiguous;
  target.dataAbsent += source.dataAbsent;
  target.filled += source.filled;
  target.n += source.n;
  target.rSum += source.rSum;
  target.rSumSq += source.rSumSq;
  target.stops += source.stops;
  target.wins += source.wins;
}

/**
 * Grade one corpus, or several SHARDS of one measurement: every shard's
 * manifest must state identical engine, grid, folds and holdout —
 * per-symbol sections differ by construction — or the read refuses.
 */
export async function gradeCorpus(
  emitPathOrPaths: string | string[],
  options: GateOptions & {
    includeHoldout?: boolean;
    // Totality (owner mandate, 2026-08-11): folds re-cut per MARKET over
    // each market's own row span — 50/25/25 by decision time — with
    // containment EXACT per row: a row whose exit crosses its fold's end
    // is dropped, stricter than the emit-time embargo it replaces.
    // row.split is ignored in this mode; the corpus's times are the
    // authority.
    perMarketFolds?: boolean;
    // The holdout cycle's surgical read: only these symbols enter the
    // cube at all, so a confirm-final run consults exactly the named
    // markets' held-back rows and nothing else's.
    symbolFilter?: Set<string>;
    // 4d: "market" grades every symbol on its own rows (singleton
    // groups, absolute sample floor); default stays the 4c class unit.
    verdictUnit?: "class" | "market";
  } = {},
): Promise<{
  // #364 round 24, finding 3: the data-absence rows the vocabulary held
  // out of every GRADED cell's n — scoped to the folds this read
  // computes (round 25, finding 2), so the number reconciles with the
  // tables under it — returned so the report states its own denominator
  // instead of leaving the held-out volume silent. Scoped further by
  // this call's own options (#364 round 27, finding 1): the read-time
  // stratified holdout (or none under includeHoldout), any
  // symbolFilter, and per-market-folds' exact-containment drops all
  // narrow the graded population before a cell exists — a caller
  // printing this figure states those terms.
  dataAbsentRows: number;
  foldNames: FoldNames;
  // #364 round 29, finding 1: the markets THIS read held out — the
  // read-time stratified set's size (0 under includeHoldout) — returned
  // so the report prints the set it actually excluded, never the
  // manifest's stamped list, which is a different definition entirely
  // (round 27: the stratified rule holds nothing out of a class under
  // three members, and the stamp is one shard's class-blind 1-in-5).
  heldOutMarkets: number;
  manifest: SweepManifest;
  verdicts: Map<string, Map<string, VariantVerdict>>;
  // Whether the confirm fold was actually READ — the same boolean the
  // burned-log keys on, returned so the report cannot claim a read the
  // ledger did not record (#364 round 43, finding 2: the folds line
  // still announced "read once" off the fold merely existing, the gate
  // round 42 retired one function away, so a zero-accept run printed
  // "read once", burned nothing, and pointed the next run at
  // --acknowledge-prior-reads for a read that never happened).
  confirmRead: boolean;
}> {
  const paths = Array.isArray(emitPathOrPaths)
    ? emitPathOrPaths
    : [emitPathOrPaths];
  // STREAMED: a full 4c grid is tens of millions of rows across shards —
  // far past what a rows array can hold. The cube aggregates row by row
  // (it is small: cells x day ledgers), and each shard's manifest hash
  // verifies before its first row, same door as ever.
  //
  // Holdout is recomputed at READ time, stratified per class over the
  // union of every shard's symbols (round-8 batch 1, CV-4/CV-5): the
  // stamped per-row field stays as provenance, and holdout policy changes
  // never require a resweep. Rows for held-out markets never enter the
  // tuning cube.
  const cube: GridCube = new Map();
  const conditionsOf = (candidate: SweepManifest) =>
    stableStringify({
      analyzerVersion: candidate.analyzerVersion,
      // R0 (#358 re-review): shards swept either side of a BAR_CLOCK bump
      // are two measurements — combining them assembles a mixed-clock
      // corpus at read time, the exact defect class R0 ends.
      clock: candidate.clock,
      // R1b (#364 round 7): the E6 stated terms and the curve evidence
      // behind them are measurement identity too. The corpus door
      // asserts both only on the !historicalRead branch, and THIS
      // comparison is the second layer for exactly the historical-read
      // path — without these axes, a pre-R1b hardwired-zero-macro shard
      // and a post-R1b reconstructed-macro shard (same version, same
      // superseded clock, same grid) would pool into one verdict.
      conditions: candidate.conditions ?? null,
      folds: candidate.folds ?? null,
      foldsByClass: candidate.foldsByClass ?? null,
      grid: candidate.grid,
      stepBars: candidate.stepBars,
      // Only the DAY-STABLE curve facts join identity (#364 round 8,
      // finding 1): count and lastTime move with the run day — the
      // rolling store pins per anchor, so a cross-midnight shard pair or
      // a re-run dead shard would refuse as different measurements, the
      // exact per-shard top-up hazard the fold spec exists to remove
      // (replay-sweep.ts, 3c-across-shards). conditions alone separates
      // pre/post-R1b (null vs the block); firstTime/largestGapMs carry
      // the shallow- or holed-store case on the historical-read path.
      // Precision (#364 round 9, smaller; figure aligned round 16):
      // firstTime is exact — the floor is fixed. largestGapMs is
      // monotone NON-DECREASING under a tail top-up, invariant today
      // only because the historical max (<=5 days — weekend plus
      // holiday runs, the door's own constant figure) dominates any
      // tail gap the door's 7-day bound would admit; a tail gap that
      // DID exceed it would refuse at the door before ever reaching
      // this comparison.
      treasuryCurve: candidate.treasuryCurve
        ? {
          firstTime: candidate.treasuryCurve.firstTime,
          largestGapMs: candidate.treasuryCurve.largestGapMs,
        }
        : null,
      warmupBars: candidate.warmupBars,
    });
  const unionSymbols = new Set<string>();
  const shardManifests: SweepManifest[] = [];
  for (const path of paths) {
    const shardManifest = assertManifest(path);
    shardManifests.push(shardManifest);
    for (const entry of shardManifest.symbols) unionSymbols.add(entry.symbol);
  }
  const manifest = shardManifests[0];
  if (!manifest) {
    throw new Error("gradeCorpus: no corpus paths given");
  }
  const firstConditions = conditionsOf(manifest);
  for (let index = 1; index < shardManifests.length; index += 1) {
    if (conditionsOf(shardManifests[index]) !== firstConditions) {
      throw new Error(
        `${paths[index]}: shard conditions differ from ${paths[0]} — engine, clock, stated conditions, treasury curve, grid, folds, step or warmup do not match; these are not shards of one measurement`,
      );
    }
  }
  const held = options.includeHoldout
    ? new Set<string>()
    : stratifiedHoldout([...unionSymbols], (symbol) => getAssetType(symbol));
  // Per-market fold boundaries from the manifests' own measured series
  // spans — no pre-pass over the corpus needed.
  const marketSpans = new Map<string, { first: number; last: number }>();
  if (options.perMarketFolds) {
    for (const shardManifest of shardManifests) {
      for (const entry of shardManifest.symbols) {
        const series =
          (entry as {
            series?: Record<string, { firstTime?: number; lastTime?: number }>;
          }).series?.["15min"];
        if (
          !Number.isFinite(series?.firstTime) ||
          !Number.isFinite(series?.lastTime)
        ) continue;
        const current = marketSpans.get(entry.symbol);
        marketSpans.set(entry.symbol, {
          first: Math.min(current?.first ?? Infinity, series!.firstTime!),
          last: Math.max(current?.last ?? -Infinity, series!.lastTime!),
        });
      }
    }
  }
  const refold = (row: SweepEmitRow): SweepEmitRow | null => {
    if (!options.perMarketFolds) return row;
    const span = marketSpans.get(row.symbol);
    const time = Number(row.time);
    if (!span || !Number.isFinite(time)) return null;
    const fitEnd = span.first + (span.last - span.first) * 0.5;
    const selectEnd = span.first + (span.last - span.first) * 0.75;
    const fold = time < fitEnd ? "fit" : time < selectEnd ? "select" : "confirm";
    const foldEnd = fold === "fit"
      ? fitEnd
      : fold === "select"
      ? selectEnd
      : span.last + 1;
    const exit = Number((row as { exitAtMs?: number }).exitAtMs);
    if (Number.isFinite(exit) && exit > foldEnd) {
      // Exact containment: this row's outcome leaked past its fold.
      return null;
    }
    return { ...row, split: fold };
  };
  for (const path of paths) {
    await assertManifestedCorpusStreaming(path, (row) => {
      if (held.has(row.symbol)) return;
      if (options.symbolFilter && !options.symbolFilter.has(row.symbol)) {
        return;
      }
      const refolded = refold(row);
      if (refolded === null) return;
      addRowToCube(cube, refolded, { includeHoldout: true });
    });
  }

  // Confirm-fold discipline by mechanism (LA-6): without confirmFinal the
  // confirm fold is never computed; with it, the read is appended to a
  // burned-log keyed by the corpus's manifest hash, and a corpus whose
  // log already holds a read refuses without explicit acknowledgement.
  // The CHECK runs here, before any confirm figure can be computed; the
  // APPEND runs after the verdicts exist (#364 round 41, finding 1) —
  // appended first, any throw in between (round 37's baseline-exists
  // refusal, reached by exactly the typo the str() message names) burned
  // the corpus's one acknowledged read on a run that produced no confirm
  // number, and the corrected re-run then demanded the escape hatch the
  // discipline exists to make expensive. The log records READS, never
  // attempts. Stated plainly (#364 round 42, smaller): the two halves
  // are no longer adjacent — the check-to-append window now spans the
  // whole grading pass, so two --confirm-final runs racing over one
  // corpus would each pass this check and each append (two recorded
  // reads, no refusal). LA-6 disciplines the analyst's re-reads, not
  // concurrency, and one-shot confirm reads are not a parallel
  // workload — do not assume the old adjacency.
  const confirmLogPath = options.confirmLogPath ??
    `${paths[0]}.confirm-log.jsonl`;
  if (options.confirmFinal) {
    if (existsSync(confirmLogPath)) {
      const prior = readFileSync(confirmLogPath, "utf8").trim().split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { corpusHash: string })
        .filter((entry) => entry.corpusHash === manifest.manifestHash);
      if (prior.length > 0 && !options.acknowledgePriorReads) {
        throw new Error(
          `confirm fold for corpus ${manifest.manifestHash.slice(0, 12)} has already been read ${prior.length} time(s) — pass acknowledgePriorReads to read again; every read is logged`,
        );
      }
    }
  }
  // A folded corpus names its own partition; a legacy two-split corpus
  // maps train->fit, test->select and has no confirm fold to read.
  const derived: FoldNames = options.foldNames ??
    (manifest.folds || manifest.foldsByClass || options.perMarketFolds
      ? { confirm: "confirm", fit: "fit", select: "select" }
      : { fit: "train", select: "test" });
  const foldNames: FoldNames = options.confirmFinal
    ? derived
    : { fit: derived.fit, select: derived.select };
  // #364 round 24, finding 3 (fold-scoped round 25, finding 2): sum
  // what the vocabulary held out — each row lands in exactly one
  // (symbol, variant, split) cell, so the sum is exact across shard
  // merges — but only over the splits this read GRADES: the cube also
  // holds the confirm fold, which foldNames drops without
  // --confirm-final, and a held-out count spanning a fold no table
  // computes could not be reconciled with any printed n, which is the
  // whole point of stating a denominator.
  const gradedSplits = new Set(
    Object.values(foldNames).filter((name): name is string =>
      typeof name === "string"
    ),
  );
  let dataAbsentRows = 0;
  for (const byVariant of cube.values()) {
    for (const bySplit of byVariant.values()) {
      for (const [split, cell] of bySplit) {
        if (gradedSplits.has(split)) {
          dataAbsentRows += cell.dataAbsent;
        }
      }
    }
  }
  const verdicts =
    (options.verdictUnit === "market" ? marketVerdicts : classVerdicts)(
      cube,
      { ...options, foldNames },
    );
  // The burn lands only once a confirm figure actually exists (#364
  // round 41, finding 1; round 42, finding 1 finished the criterion):
  // after the verdicts are computed, and only when a confirm number
  // was actually PRODUCED — the fold merely existing is not a read.
  // The confirm figure is computed for accepted variants only (the
  // folds line says so), so a --confirm-final run that accepts nothing
  // reads nothing and burns nothing, by the same evidence that exempts
  // a legacy two-split corpus; rounds 38–40 tightened acceptance three
  // times, so the zero-accept confirm run is a transition this change
  // set itself creates.
  const confirmRead = options.confirmFinal === true &&
    foldNames.confirm !== undefined &&
    [...verdicts.values()].some((byVariant) =>
      [...byVariant.values()].some(
        (verdict) => verdict.confirmTotalDelta !== null,
      )
    );
  if (confirmRead) {
    appendFileSync(
      confirmLogPath,
      JSON.stringify({
        corpusHash: manifest.manifestHash,
        readAt: new Date().toISOString(),
      }) + "\n",
    );
  }
  return {
    confirmRead,
    dataAbsentRows,
    foldNames,
    heldOutMarkets: held.size,
    manifest,
    verdicts,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // The ONE declaration of which flags own the token after them (#364
  // round 36, smaller — the round-34 VALUE_FLAGS form, at its third
  // file; the name list and the accessors were two places for one
  // fact). The path filter consumes it, and num() REFUSES a token it
  // cannot parse instead of falling back: a mistyped --permutations
  // made every p-value NaN and pairedP <= 0.05 false, silently
  // refusing every variant — conservative, but with no hint the dial
  // was the cause. --baseline's value is a STRING (a variant name),
  // read through the guarded str() below (#364 round 37, finding 2:
  // it had ridden the Set for the path filter only, with NEITHER
  // refusal — and its failure is anti-conservative: a baseline that
  // matches nothing had made every class degenerate and accepted
  // every profitable variant; groupVerdicts now also refuses a
  // baseline that carries no cell in the cube). The dials are read
  // BEFORE the usage check so the specific refusal wins when a flag
  // typed without its value eats the only shard path.
  const VALUE_FLAGS = new Set(["--baseline", "--permutations", "--seed"]);
  // The sequential walker the sibling readers carry (#364 round 38,
  // smaller — the indexOf-per-flag Set that stood here covered only a
  // flag's FIRST occurrence, so "--seed 7 --seed 8" walked "8" into
  // the shard paths and the corpus door refused it as a missing
  // manifest, the wrong diagnosis).
  const paths: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith("--")) {
      if (VALUE_FLAGS.has(args[i])) i += 1;
      continue;
    }
    paths.push(args[i]);
  }
  const num = (arg: string, fallback: number): number => {
    if (!VALUE_FLAGS.has(arg)) {
      throw new Error(
        `num("${arg}") reads a value outside VALUE_FLAGS — declare it ` +
          `there, or its value stays in the shard paths`,
      );
    }
    const index = args.indexOf(arg);
    if (index === -1) return fallback;
    const token = args[index + 1];
    const parsed = Number(token);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `${arg} owns the token after it and cannot read ${
          token === undefined ? "a missing value" : `"${token}"`
        } as a number — the filter already kept that token out of the ` +
          `shard paths, and a NaN dial silently refuses every variant; ` +
          `pass ${arg} <number>`,
      );
    }
    return parsed;
  };
  const str = (arg: string): string | undefined => {
    if (!VALUE_FLAGS.has(arg)) {
      throw new Error(
        `str("${arg}") reads a value outside VALUE_FLAGS — declare it ` +
          `there, or its value stays in the shard paths`,
      );
    }
    const index = args.indexOf(arg);
    if (index === -1) return undefined;
    const token = args[index + 1];
    if (token === undefined || token.startsWith("--")) {
      throw new Error(
        `${arg} owns the token after it and got ${
          token === undefined ? "no value" : `"${token}"`
        } — a variant name, never a flag; pass ${arg} <variant> (an ` +
          `eaten shard path lands at the cube's baseline-exists refusal)`,
      );
    }
    return token;
  };
  const permutations = num("--permutations", 1_000);
  const seed = num("--seed", 7);
  const baselineVariant = str("--baseline");
  if (paths.length === 0) {
    console.error(
      "Usage: npx tsx scripts/grid-totalr.ts <emit.jsonl> [more-shards.jsonl ...] [--baseline <variant>] [--permutations 1000] [--seed 7]",
    );
    process.exit(1);
  }
  const {
    confirmRead,
    dataAbsentRows,
    foldNames,
    heldOutMarkets,
    manifest,
    verdicts,
  } = await gradeCorpus(paths, {
    acknowledgePriorReads: args.includes("--acknowledge-prior-reads"),
    baselineVariant,
    confirmFinal: args.includes("--confirm-final"),
    includeHoldout: args.includes("--include-holdout"),
    permutations,
    seed,
  });
  // The holdout clause reports what THIS read excluded (#364 round 29,
  // finding 1): the old form printed shardManifests[0]'s STAMPED list —
  // a different definition than the read-time stratified set gradeCorpus
  // excludes over every shard's union — and kept printing under
  // --include-holdout, where nothing is excluded at all.
  console.log(
    `folds: fit=${foldNames.fit} select=${foldNames.select}` +
      `${
        foldNames.confirm
          // #364 round 43, finding 2: the STATEMENT keys on the same
          // boolean the ledger does. Announcing the read off the fold's
          // mere existence left a zero-accept run claiming "read once"
          // over a burned-log that was never written.
          ? confirmRead
            ? ` confirm=${foldNames.confirm} (read once, accepted variants only)`
            : ` confirm=${foldNames.confirm} NOT READ (no accepted variant carried filled outcomes on both sides — nothing burned)`
          : " (legacy two-split corpus)"
      }` +
      `${
        args.includes("--include-holdout")
          ? " · holdout INCLUDED by --include-holdout (none excluded)"
          : heldOutMarkets > 0
          ? ` · holdout ${heldOutMarkets} markets excluded (read-time stratified)`
          : ""
      }`,
  );
  console.log(
    `corpus ${manifest.manifestHash.slice(0, 12)} · engine ${manifest.analyzerVersion} · anchor ${manifest.anchor}`,
  );
  // The graded population states its own denominator (#364 round 24,
  // finding 3, following sweep-analysis's round-7 pattern): the
  // vocabulary holds data-absence rows out of every cell's n, and the
  // held-out volume is printed rather than silent.
  // Each reader's held-out line names its OWN population AND its own
  // holdout definition (#364 rounds 26-27): this reader ignores the
  // emit's stamped holdout flag and excludes a read-time stratified
  // recomputation instead — a genuinely different set (the stamped
  // draw is class-blind 1-in-5; the stratified one holds nothing out
  // of a class under three members) — and --include-holdout empties
  // that set, flipping the population.
  if (dataAbsentRows > 0) {
    console.log(
      `(data-absence rows held out of every fold denominator: ${dataAbsentRows}` +
        ` — all variants, graded folds only, accepted rows; ` +
        // The graded folds INCLUDE the confirm fold under
        // --confirm-final (#364 round 43, finding 2), so on a run that
        // burned nothing this count is still partly confirm-derived —
        // stated, since it is the second place "was the confirm fold
        // read?" gets an answer.
        `${foldNames.confirm ? "INCLUDES the confirm fold; " : ""}` +
        `${
          args.includes("--include-holdout")
            ? "holdout INCLUDED by --include-holdout"
            : "holdout excluded by read-time stratified recomputation, " +
              "not the stamped flag"
        })`,
    );
  }
  for (const [assetClass, classMap] of verdicts) {
    console.log(`\n=== ${assetClass.toUpperCase()} ===`);
    console.log(
      `${"variant".padEnd(28)}${"ΔR fit".padStart(10)}${"ΔR sel".padStart(9)}${"pairedP".padStart(9)}${"pairs".padStart(10)}${"ΔE sel".padStart(9)}${"comp".padStart(10)}${"drop".padStart(10)}${"expry".padStart(7)}${"worstDay".padStart(10)}  verdict`,
    );
    for (const [variant, verdict] of classMap) {
      // #364 round 39, finding 2: the pairing prints beside the p it
      // sizes (nonzero/shared), and a NO VERDICT refusal names itself
      // — the reason field carries the full wording (stated on the
      // verdict, its own rule), so the printer reuses it verbatim, and
      // the DISPOSITION is the noVerdict field, never a prefix match
      // on the message (#364 round 42, finding 2 — a reworded reason
      // had silently restored the bare-"fails" defect).
      const label = verdict.thin
        ? `THIN (${verdict.selectFilled} filled) — refuse`
        : verdict.noVerdict
        ? verdict.reason
        : verdict.accepted
        ? "ACCEPT — fit+select, paired p, expectancy holds"
        : "fails";
      // The confirm figure states its own two denominators, and an
      // accepted variant whose confirm read found no evidence says so
      // rather than printing nothing (#364 round 43, finding 1) — the
      // reader would otherwise see an accepted row with a silent
      // confirm column and no way to tell it from a variant the fold
      // never covered.
      const confirmNote = verdict.confirmTotalDelta !== null
        ? ` · confirm ΔR ${verdict.confirmTotalDelta.toFixed(1)} over ` +
          `${verdict.confirmFilled}/${verdict.confirmBaseFilled} filled`
        : verdict.accepted && verdict.confirmFilled !== null
        ? ` · confirm NOT READ — no filled outcomes on both sides ` +
          `(variant ${verdict.confirmFilled}, baseline ` +
          `${verdict.confirmBaseFilled})`
        : "";
      console.log(
        `${variant.padEnd(28)}${verdict.fitTotalDelta.toFixed(1).padStart(10)}${
          verdict.selectTotalDelta.toFixed(1).padStart(9)
        }${verdict.pairedP.toFixed(3).padStart(9)}${
          `${verdict.effectivePairs}/${verdict.sharedDays}`.padStart(10)
        }${
          verdict.selectExpectancyDelta.toFixed(3).padStart(9)
        }${(verdict.compositionR ?? 0).toFixed(1).padStart(10)}${
          (verdict.droppedR ?? 0).toFixed(1).padStart(10)
        }${
          (verdict.selectExpiryShare ?? 0).toFixed(2).padStart(7)
        }${(verdict.worstDayR ?? 0).toFixed(1).padStart(10)}  ${label}${confirmNote}`,
      );
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
