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
  assertManifestedCorpusStreaming,
  emptyStats,
  expectancy,
  rStdDev,
  type SweepEmitRow,
  type SweepStats,
} from "./sweepStats.ts";
import { stableStringify, type SweepManifest } from "./sweepManifest.ts";

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
  accepted: boolean;
  // The confirm fold is read ONCE, for accepted variants only — reported,
  // never part of selection (3d). Null when the corpus has no confirm
  // fold or the variant was not accepted.
  confirmTotalDelta: number | null;
  fitTotalDelta: number;
  permutationP: number;
  selectExpectancyDelta: number;
  selectFilled: number;
  selectSigma: number;
  selectTotalDelta: number;
  thin: boolean;
};

export type FoldNames = { confirm?: string; fit: string; select: string };

type GateOptions = {
  // The variant every other cell compares against. Defaults to the bare
  // "baseline" label; a 4c measurement grid that retires the confidence
  // gate names its threshold-0 current-geometry cell here instead, so
  // comparisons isolate one axis change at a time.
  baselineVariant?: string;
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
  const permutations = options.permutations ?? 1_000;
  const baselineVariant = options.baselineVariant ?? "baseline";
  const foldNames = options.foldNames ?? { fit: "fit", select: "select" };
  const random = mulberry32(options.seed ?? 7);
  const verdicts = new Map<string, Map<string, VariantVerdict>>();

  const symbolsByClass = new Map<string, string[]>();
  for (const symbol of cube.keys()) {
    const assetClass = getAssetType(symbol);
    if (!symbolsByClass.has(assetClass)) {
      symbolsByClass.set(assetClass, []);
    }
    symbolsByClass.get(assetClass)!.push(symbol);
  }

  const variants = new Set<string>();
  for (const byVariant of cube.values()) {
    for (const variant of byVariant.keys()) {
      variants.add(variant);
    }
  }

  for (const [assetClass, symbols] of symbolsByClass) {
    const classMap = new Map<string, VariantVerdict>();
    verdicts.set(assetClass, classMap);
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
        aggregate.base.select.filled * 0.5;

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

      const accepted = !thin && fitTotalDelta > 0 && selectTotalDelta > 0 &&
        selectSigma >= 1 && selectExpectancyDelta >= 0;
      classMap.set(variant, {
        accepted,
        confirmTotalDelta: accepted && foldNames.confirm
          ? totalOf(aggregate.variant.confirm) -
            totalOf(aggregate.base.confirm)
          : null,
        fitTotalDelta,
        permutationP,
        selectExpectancyDelta,
        selectFilled: aggregate.variant.select.filled,
        selectSigma,
        selectTotalDelta,
        thin,
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
  options: GateOptions & { includeHoldout?: boolean } = {},
): Promise<{
  foldNames: FoldNames;
  manifest: SweepManifest;
  verdicts: Map<string, Map<string, VariantVerdict>>;
}> {
  const paths = Array.isArray(emitPathOrPaths)
    ? emitPathOrPaths
    : [emitPathOrPaths];
  // STREAMED: a full 4c grid is tens of millions of rows across shards —
  // far past what a rows array can hold. The cube aggregates row by row
  // (it is small: cells x day ledgers), and each shard's manifest hash
  // verifies before its first row, same door as ever.
  const cube: GridCube = new Map();
  const conditionsOf = (candidate: SweepManifest) =>
    stableStringify({
      analyzerVersion: candidate.analyzerVersion,
      folds: candidate.folds ?? null,
      foldsByClass: candidate.foldsByClass ?? null,
      grid: candidate.grid,
      stepBars: candidate.stepBars,
      warmupBars: candidate.warmupBars,
    });
  let manifest: SweepManifest | null = null;
  let firstConditions = "";
  for (const path of paths) {
    const shardManifest = await assertManifestedCorpusStreaming(
      path,
      (row) =>
        addRowToCube(cube, row, {
          includeHoldout: options.includeHoldout,
        }),
    );
    if (manifest === null) {
      manifest = shardManifest;
      firstConditions = conditionsOf(shardManifest);
    } else if (conditionsOf(shardManifest) !== firstConditions) {
      throw new Error(
        `${path}: shard conditions differ from ${paths[0]} — engine, grid, folds, step or warmup do not match; these are not shards of one measurement`,
      );
    }
  }
  if (manifest === null) {
    throw new Error("gradeCorpus: no corpus paths given");
  }
  // A folded corpus names its own partition; a legacy two-split corpus
  // maps train->fit, test->select and has no confirm fold to read.
  const foldNames: FoldNames = options.foldNames ??
    (manifest.folds || manifest.foldsByClass
      ? { confirm: "confirm", fit: "fit", select: "select" }
      : { fit: "train", select: "test" });
  return {
    foldNames,
    manifest,
    verdicts: classVerdicts(cube, { ...options, foldNames }),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flagValueIndexes = new Set<number>();
  for (const name of ["baseline", "permutations", "seed"]) {
    const index = args.indexOf(`--${name}`);
    if (index >= 0) flagValueIndexes.add(index + 1);
  }
  const paths = args.filter((arg, index) =>
    !arg.startsWith("--") && !flagValueIndexes.has(index)
  );
  const flag = (name: string, fallback: number) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
  };
  if (paths.length === 0) {
    console.error(
      "Usage: npx tsx scripts/grid-totalr.ts <emit.jsonl> [more-shards.jsonl ...] [--baseline <variant>] [--permutations 1000] [--seed 7]",
    );
    process.exit(1);
  }
  const baselineIndex = args.indexOf("--baseline");
  const { foldNames, manifest, verdicts } = await gradeCorpus(paths, {
    baselineVariant: baselineIndex >= 0 ? args[baselineIndex + 1] : undefined,
    includeHoldout: args.includes("--include-holdout"),
    permutations: flag("permutations", 1_000),
    seed: flag("seed", 7),
  });
  console.log(
    `folds: fit=${foldNames.fit} select=${foldNames.select}` +
      `${foldNames.confirm ? ` confirm=${foldNames.confirm} (read once, accepted variants only)` : " (legacy two-split corpus)"}` +
      `${manifest.holdoutSymbols?.length ? ` · holdout ${manifest.holdoutSymbols.length} markets excluded` : ""}`,
  );
  console.log(
    `corpus ${manifest.manifestHash.slice(0, 12)} · engine ${manifest.analyzerVersion} · anchor ${manifest.anchor}`,
  );
  for (const [assetClass, classMap] of verdicts) {
    console.log(`\n=== ${assetClass.toUpperCase()} ===`);
    console.log(
      `${"variant".padEnd(28)}${"ΔR fit".padStart(10)}${"ΔR sel".padStart(9)}${"σ".padStart(7)}${"ΔE sel".padStart(9)}${"p".padStart(8)}  verdict`,
    );
    for (const [variant, verdict] of classMap) {
      const label = verdict.thin
        ? `THIN (${verdict.selectFilled} filled) — refuse`
        : verdict.accepted
        ? "ACCEPT — fit+select, ≥1σ, expectancy holds"
        : "fails";
      const confirmNote = verdict.confirmTotalDelta === null
        ? ""
        : ` · confirm ΔR ${verdict.confirmTotalDelta.toFixed(1)}`;
      console.log(
        `${variant.padEnd(28)}${verdict.fitTotalDelta.toFixed(1).padStart(10)}${
          verdict.selectTotalDelta.toFixed(1).padStart(9)
        }${verdict.selectSigma.toFixed(2).padStart(7)}${
          verdict.selectExpectancyDelta.toFixed(3).padStart(9)
        }${verdict.permutationP.toFixed(3).padStart(8)}  ${label}${confirmNote}`,
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
