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
  assertManifestedCorpus,
  emptyStats,
  expectancy,
  rStdDev,
  type SweepEmitRow,
  type SweepStats,
} from "./sweepStats.ts";
import type { SweepManifest } from "./sweepManifest.ts";

const DAY_MS = 86_400_000;

// A cube cell is the shared stats vocabulary plus the day-block ledger the
// permutation null permutes — whole days, because outcomes inside a day
// share their market.
export type GateCell = SweepStats & { dayR: Map<number, number> };

// symbol -> variant -> split -> cell
export type GridCube = Map<string, Map<string, Map<string, GateCell>>>;

export function readGridCube(rows: SweepEmitRow[]): GridCube {
  const cube: GridCube = new Map();
  for (const row of rows) {
    // capture-all corpora include rejected records for calibration reads;
    // the gate grades the stream production would actually take.
    if (row.accepted === false) {
      continue;
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
  return cube;
}

export type VariantVerdict = {
  accepted: boolean;
  permutationP: number;
  testExpectancyDelta: number;
  testFilled: number;
  testSigma: number;
  testTotalDelta: number;
  thin: boolean;
  trainTotalDelta: number;
};

type GateOptions = { permutations?: number; seed?: number };

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
      if (variant === "baseline") {
        continue;
      }
      const aggregate = {
        base: { test: emptyStats(), train: emptyStats() },
        variant: { test: emptyStats(), train: emptyStats() },
      };
      for (const symbol of symbols) {
        for (const split of ["test", "train"] as const) {
          mergeInto(
            aggregate.base[split],
            cube.get(symbol)?.get("baseline")?.get(split),
          );
          mergeInto(
            aggregate.variant[split],
            cube.get(symbol)?.get(variant)?.get(split),
          );
        }
      }
      const testTotalDelta = totalOf(aggregate.variant.test) -
        totalOf(aggregate.base.test);
      const trainTotalDelta = totalOf(aggregate.variant.train) -
        totalOf(aggregate.base.train);
      const sigma = Math.sqrt(
        totalVarianceOf(aggregate.variant.test) +
          totalVarianceOf(aggregate.base.test),
      );
      const testSigma = sigma > 0 ? testTotalDelta / sigma : 0;
      const baseExpectancy = expectancy(aggregate.base.test) ?? 0;
      const variantExpectancy = expectancy(aggregate.variant.test) ?? 0;
      const testExpectancyDelta = variantExpectancy - baseExpectancy;
      const thin = aggregate.variant.test.filled <
        aggregate.base.test.filled * 0.5;

      const baselineBlocks: number[] = [];
      const variantBlocks: number[] = [];
      for (const symbol of symbols) {
        for (
          const value of cube.get(symbol)?.get("baseline")?.get("test")
            ?.dayR.values() ?? []
        ) {
          baselineBlocks.push(value);
        }
        for (
          const value of cube.get(symbol)?.get(variant)?.get("test")
            ?.dayR.values() ?? []
        ) {
          variantBlocks.push(value);
        }
      }
      const permutationP = permutationPValue(
        baselineBlocks,
        variantBlocks,
        testTotalDelta,
        permutations,
        random,
      );

      classMap.set(variant, {
        accepted: !thin && trainTotalDelta > 0 && testTotalDelta > 0 &&
          testSigma >= 1 && testExpectancyDelta >= 0,
        permutationP,
        testExpectancyDelta,
        testFilled: aggregate.variant.test.filled,
        testSigma,
        testTotalDelta,
        thin,
        trainTotalDelta,
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

export function gradeCorpus(
  emitPath: string,
  options: GateOptions = {},
): {
  manifest: SweepManifest;
  verdicts: Map<string, Map<string, VariantVerdict>>;
} {
  const { manifest, rows } = assertManifestedCorpus(emitPath);
  return {
    manifest,
    verdicts: classVerdicts(readGridCube(rows), options),
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const paths = args.filter((arg) => !arg.startsWith("--"));
  const flag = (name: string, fallback: number) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
  };
  if (paths.length !== 1) {
    console.error(
      "Usage: npx tsx scripts/grid-totalr.ts <emit.jsonl> [--permutations 1000] [--seed 7]",
    );
    process.exit(1);
  }
  const { manifest, verdicts } = gradeCorpus(paths[0], {
    permutations: flag("permutations", 1_000),
    seed: flag("seed", 7),
  });
  console.log(
    `corpus ${manifest.manifestHash.slice(0, 12)} · engine ${manifest.analyzerVersion} · anchor ${manifest.anchor}`,
  );
  for (const [assetClass, classMap] of verdicts) {
    console.log(`\n=== ${assetClass.toUpperCase()} ===`);
    console.log(
      `${"variant".padEnd(28)}${"ΔR train".padStart(10)}${"ΔR test".padStart(9)}${"σ".padStart(7)}${"ΔE test".padStart(9)}${"p".padStart(8)}  verdict`,
    );
    for (const [variant, verdict] of classMap) {
      const label = verdict.thin
        ? `THIN (${verdict.testFilled} filled) — refuse`
        : verdict.accepted
        ? "ACCEPT — both splits, ≥1σ, expectancy holds"
        : "fails";
      console.log(
        `${variant.padEnd(28)}${verdict.trainTotalDelta.toFixed(1).padStart(10)}${
          verdict.testTotalDelta.toFixed(1).padStart(9)
        }${verdict.testSigma.toFixed(2).padStart(7)}${
          verdict.testExpectancyDelta.toFixed(3).padStart(9)
        }${verdict.permutationP.toFixed(3).padStart(8)}  ${label}`,
      );
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
