/**
 * banked-fraction — what the ladder's allocation is worth, at every fraction.
 *
 * The share of the position banked at TP1 is the literal `0.5` in
 * `realizedRFromLegs` (replay.ts) — the R2b geometry round's first standing
 * question: "realized R is linear in that allocation and it has never been
 * varied, measured, or represented", and "answerable from R3's corpus without
 * a second sweep: net R at any fraction is exact arithmetic on `legs`". This
 * reader is that arithmetic, per class and fold, at 0, ¼, ½ (shipped), ¾ and 1.
 *
 * What it is: the ALLOCATION question alone. The exit path is the emitted
 * one at every fraction — the runner's protection re-arms on the TP1 touch,
 * not on the size banked — and costs are the emitted commission (spread and
 * slippage ride in the leg prices). A row without a tp1 leg ran full size to
 * one exit and prices the same at every fraction.
 *
 * Its control runs on every row it prices: at ½ the arithmetic must reproduce
 * the emitted `realizedR` to its four decimals, or the whole corpus is
 * refused — an instrument that fails its control reports nothing.
 *
 * It ranks nothing and proposes nothing. Amendment 39 governs what may be
 * done with a figure here: nothing that manufactures a ratio.
 *
 *   tsx scripts/banked-fraction.ts <emit.jsonl> [more shards...]
 *     [--folds fit,select] [--variant baseline] [--include-holdout]
 *     [--years all|contained|escaping [--witness docs/research/r3/feed-character.txt]]
 *
 * `--years` stratifies by feed character (scripts/feedYears.ts): the year map
 * comes from the manifest's `feedCharacter` or from the tracked witness table;
 * rows outside the named bucket are counted, never priced. Default `all`.
 */
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import {
  describeHeldOut,
  type ResolvedHeldOut,
  resolveHeldOut,
} from "./sweepFolds.ts";
import { type SweepManifest, stableStringify } from "./sweepManifest.ts";
import {
  assertManifest,
  assertManifestedCorpusStreaming,
  type SweepEmitRow,
} from "./sweepStats.ts";
import { describeYearMap, resolveYearMap, type YearMap, yearOf, type YearsFilter } from "./feedYears.ts";
import { parseFolds, SEALED_FOLD } from "./tuning-folds-summary.ts";

export { parseFolds, SEALED_FOLD };

/** The fractions priced; ½ is what the engine ships. */
export const FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
export const SHIPPED_FRACTION = 0.5;

/** The emitted realizedR is rounded to four decimals; the control allows that and nothing more. */
const CONTROL_TOLERANCE = 0.00011;

/** The outcomes a resolution can carry; anything else never filled and prices nothing. */
const FILLED_OUTCOMES = new Set(["take_profit", "tp1_partial", "stop_loss", "expired_at_loss", "expired_in_profit", "ambiguous"]);

const VALUE_FLAGS = new Set(["--folds", "--variant", "--years", "--witness"]);
const BOOLEAN_FLAGS = new Set(["--include-holdout"]);

const IDENTITY_TERMS = [
  "acceptance",
  "analyzerVersion",
  "anchor",
  "clock",
  "conditions",
  "days",
  "folds",
  "foldsByClass",
  "grid",
  "grossCostScale",
  "modeledCostScale",
] as const;

type Leg = { leg: string; price: number };

/**
 * Realised R at a banked fraction, from the legs — `realizedRFromLegs` with
 * the 0.5 freed. Null when the legs do not describe a resolution.
 */
export function rFromLegs(input: {
  commission: number;
  fraction: number;
  legs: Leg[];
  riskDistance: number;
  side: "buy" | "sell";
}): number | null {
  const entry = input.legs.find((leg) => leg.leg === "entry");
  const exit = input.legs.find((leg) => leg.leg === "exit");
  if (!entry || !exit || !(input.riskDistance > 0)) {
    return null;
  }
  const sign = input.side === "buy" ? 1 : -1;
  const tp1 = input.legs.find((leg) => leg.leg === "tp1");
  const costR = input.commission / input.riskDistance;
  const exitR = (sign * (exit.price - entry.price)) / input.riskDistance;
  if (!tp1) {
    return exitR - costR;
  }
  const tp1R = (sign * (tp1.price - entry.price)) / input.riskDistance;
  return input.fraction * tp1R + (1 - input.fraction) * exitR - costR;
}

export type FractionCell = {
  assetType: string;
  /** The shipped ladder's TP1 half: ½ × tp1R summed over rows with a tp1 leg. */
  bankedHalf: number;
  bestFraction: number;
  byFraction: Map<number, { deltaVsShipped: number; expectancy: number | null; total: number }>;
  costTotal: number;
  filled: number;
  fold: string;
  noTp1Rows: number;
  /** Rows without a tp1 leg, at their one price. */
  noTp1Total: number;
  /** The shipped ladder's runner half: ½ × exitR summed over rows with a tp1 leg. */
  runnerHalf: number;
  shippedTotal: number;
  tp1Rows: number;
};

type RawCell = {
  assetType: string;
  bankedHalf: number;
  byFraction: number[];
  costTotal: number;
  filled: number;
  fold: string;
  noTp1Rows: number;
  noTp1Total: number;
  runnerHalf: number;
  shippedTotal: number;
  tp1Rows: number;
};

export type FractionSummary = {
  analyzerVersion: string;
  anchor: string;
  cells: Map<string, FractionCell>;
  corpora: Array<{ manifestHash: string; path: string }>;
  folds: string[];
  holdout: ResolvedHeldOut;
  includeHoldout: boolean;
  years: YearsFilter;
  yearMapSource: YearMap["source"] | null;
  witnessTablePath?: string;
  rows: {
    controlChecked: number;
    otherYears: number;
    dataAbsent: number;
    heldOut: number;
    notAccepted: number;
    otherFolds: number;
    otherVariants: number;
    sealed: number;
    total: number;
    unfilled: number;
  };
  variant: string;
};

function rawCell(assetType: string, fold: string): RawCell {
  return {
    assetType,
    bankedHalf: 0,
    byFraction: FRACTIONS.map(() => 0),
    costTotal: 0,
    filled: 0,
    fold,
    noTp1Rows: 0,
    noTp1Total: 0,
    runnerHalf: 0,
    shippedTotal: 0,
    tp1Rows: 0,
  };
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return value !== undefined && value !== null && Number.isFinite(number) ? number : null;
}

function declaredFoldNames(manifest: SweepManifest): Set<string> | null {
  if (manifest.folds) {
    return new Set(manifest.folds.map((fold) => fold.name));
  }
  if (manifest.foldsByClass) {
    const names = new Set<string>();
    for (const classFolds of Object.values(manifest.foldsByClass)) {
      for (const fold of classFolds) names.add(fold.name);
    }
    return names;
  }
  return null;
}

function derive(raw: RawCell): FractionCell {
  const byFraction = new Map<number, { deltaVsShipped: number; expectancy: number | null; total: number }>();
  let best = SHIPPED_FRACTION;
  let bestTotal = Number.NEGATIVE_INFINITY;
  FRACTIONS.forEach((fraction, index) => {
    const total = raw.byFraction[index];
    byFraction.set(fraction, {
      deltaVsShipped: total - raw.shippedTotal,
      expectancy: raw.filled > 0 ? total / raw.filled : null,
      total,
    });
    if (total > bestTotal + 1e-9) {
      bestTotal = total;
      best = fraction;
    }
  });
  return {
    assetType: raw.assetType,
    bankedHalf: raw.bankedHalf,
    bestFraction: best,
    byFraction,
    costTotal: raw.costTotal,
    filled: raw.filled,
    fold: raw.fold,
    noTp1Rows: raw.noTp1Rows,
    noTp1Total: raw.noTp1Total,
    runnerHalf: raw.runnerHalf,
    shippedTotal: raw.shippedTotal,
    tp1Rows: raw.tp1Rows,
  };
}

export async function bankedFraction(input: {
  folds: string[];
  holdoutPinDir?: string;
  includeHoldout?: boolean;
  paths: string[];
  variant: string;
  witnessTablePath?: string;
  years?: YearsFilter;
}): Promise<FractionSummary> {
  if (input.paths.length === 0) {
    throw new OperatorInputError(
      "banked-fraction: no corpus paths given — pass one or more emit.jsonl shards, each with its .manifest.json beside it",
    );
  }
  if (input.folds.includes(SEALED_FOLD)) {
    throw new OperatorInputError(`the "${SEALED_FOLD}" fold is sealed — see --folds`);
  }
  const wanted = new Set(input.folds);
  const manifests = input.paths.map((path) => assertManifest(path));
  let identity: string | null = null;
  for (const [index, manifest] of manifests.entries()) {
    const record = manifest as unknown as Record<string, unknown>;
    const shardIdentity = stableStringify(
      Object.fromEntries(IDENTITY_TERMS.map((term) => [term, record[term]])),
    );
    if (identity === null) {
      identity = shardIdentity;
    } else if (identity !== shardIdentity) {
      throw new Error(
        `${input.paths[index]}: this shard's engine, anchor, depth, grid, folds, clock, conditions, cost scales or acceptance mode differ from the first shard's — two measurements cannot be priced as one`,
      );
    }
    const declared = declaredFoldNames(manifest);
    if (declared === null) {
      throw new Error(`${input.paths[index]}: the manifest declares no folds — a legacy two-split corpus cannot be read by fold name`);
    }
    for (const fold of input.folds) {
      if (!declared.has(fold)) {
        throw new OperatorInputError(
          `${input.paths[index]}: the manifest declares no "${fold}" fold (it declares ${[...declared].sort().join(", ")})`,
        );
      }
    }
  }
  const holdout = resolveHeldOut(manifests, input.holdoutPinDir);
  const heldOut = new Set(input.includeHoldout ? [] : holdout.markets);
  const years: YearsFilter = input.years ?? "all";
  // A stratified read needs a year map for every market it will price,
  // resolved BEFORE a row is read: an absent verdict is not a contained one.
  const yearMap = years === "all"
    ? null
    : resolveYearMap({ manifests, witnessTablePath: input.witnessTablePath });
  if (yearMap) {
    const unplaceable = manifests.flatMap((manifest) => manifest.symbols.map((entry) => entry.symbol))
      .filter((symbol, index, all) => all.indexOf(symbol) === index && !heldOut.has(symbol) && yearMap.bucketOf(symbol, 2000) === "unknown")
      .sort();
    if (unplaceable.length > 0) {
      throw new OperatorInputError(`the year map (${yearMap.source}) cannot place ${unplaceable.length} market(s) this read would price: ${unplaceable.join(", ")}`);
    }
  }
  const raw = new Map<string, RawCell>();
  const summary: FractionSummary = {
    analyzerVersion: manifests[0].analyzerVersion,
    anchor: manifests[0].anchor,
    cells: new Map(),
    corpora: [],
    folds: [...input.folds],
    holdout,
    includeHoldout: Boolean(input.includeHoldout),
    years,
    yearMapSource: yearMap ? yearMap.source : null,
    ...(input.witnessTablePath && { witnessTablePath: input.witnessTablePath }),
    rows: {
      controlChecked: 0,
      otherYears: 0,
      dataAbsent: 0,
      heldOut: 0,
      notAccepted: 0,
      otherFolds: 0,
      otherVariants: 0,
      sealed: 0,
      total: 0,
      unfilled: 0,
    },
    variant: input.variant,
  };
  for (const path of input.paths) {
    const manifest = await assertManifestedCorpusStreaming(path, (row: SweepEmitRow) => {
      summary.rows.total += 1;
      if (row.accepted !== true) {
        summary.rows.notAccepted += 1;
        return;
      }
      const split = String(row.split);
      if (!wanted.has(split)) {
        summary.rows.otherFolds += 1;
        return;
      }
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      if (variant !== input.variant) {
        summary.rows.otherVariants += 1;
        return;
      }
      if (row.noBarsInReviewWindow === true) {
        summary.rows.dataAbsent += 1;
        return;
      }
      if (!FILLED_OUTCOMES.has(String(row.outcome))) {
        // "unfilled", and any synthetic label a fixture uses for a row that
        // never resolved: no legs, nothing to price.
        summary.rows.unfilled += 1;
        return;
      }
      const symbol = String(row.symbol);
      if (heldOut.has(symbol)) {
        summary.rows.heldOut += 1;
        return;
      }
      if (yearMap) {
        const time = finite(row.time);
        if (time === null) {
          throw new Error(`${path}: a filled ${symbol} row carries no finite time — a stratified read cannot place it`);
        }
        if (yearMap.bucketOf(symbol, yearOf(time)) !== years) {
          summary.rows.otherYears += 1;
          return;
        }
      }
      const legs = Array.isArray(row.legs) ? (row.legs as Leg[]) : null;
      const riskDistance = finite(row.riskDistance);
      const realized = finite(row.realizedR);
      const side = row.side === "sell" ? "sell" : row.side === "buy" ? "buy" : null;
      const commission = finite(row.estimatedCommission) ?? 0;
      if (!legs || riskDistance === null || realized === null || side === null) {
        throw new Error(`${path}: a filled ${symbol} row carries no legs, riskDistance, realizedR or side — a hole in the corpus is a refused corpus`);
      }
      const priced = FRACTIONS.map((fraction) => rFromLegs({ commission, fraction, legs, riskDistance, side }));
      if (priced.some((value) => value === null)) {
        throw new Error(`${path}: a filled ${symbol} row's legs describe no resolution (no entry or exit leg)`);
      }
      // The control: at the shipped fraction the arithmetic IS the emitter's.
      const shipped = priced[FRACTIONS.indexOf(SHIPPED_FRACTION)] as number;
      if (Math.abs(shipped - realized) > CONTROL_TOLERANCE) {
        throw new Error(
          `${path}: the shipped fraction does not reproduce realizedR on a ${symbol} ${String(row.outcome)} row ` +
            `(legs give ${shipped.toFixed(4)}, the row says ${realized.toFixed(4)}) — this reader's arithmetic is not this corpus's, so it reports nothing`,
        );
      }
      summary.rows.controlChecked += 1;
      const entry = legs.find((leg) => leg.leg === "entry") as Leg;
      const exit = legs.find((leg) => leg.leg === "exit") as Leg;
      const tp1 = legs.find((leg) => leg.leg === "tp1");
      const sign = side === "buy" ? 1 : -1;
      const assetType = getAssetType(symbol);
      for (const key of [`${assetType}|${split}`, `pooled|${split}`]) {
        let cell = raw.get(key);
        if (!cell) {
          cell = rawCell(key.startsWith("pooled|") ? "pooled" : assetType, split);
          raw.set(key, cell);
        }
        cell.filled += 1;
        cell.shippedTotal += realized;
        priced.forEach((value, index) => {
          cell.byFraction[index] += value as number;
        });
        if (tp1) {
          cell.tp1Rows += 1;
          cell.bankedHalf += (SHIPPED_FRACTION * sign * (tp1.price - entry.price)) / riskDistance;
          cell.runnerHalf += ((1 - SHIPPED_FRACTION) * sign * (exit.price - entry.price)) / riskDistance;
          cell.costTotal += commission / riskDistance;
        } else {
          cell.noTp1Rows += 1;
          cell.noTp1Total += realized;
        }
      }
    });
    summary.rows.total += manifest.sealedRows;
    summary.rows.sealed += manifest.sealedRows;
    summary.corpora.push({ manifestHash: manifest.manifestHash, path });
  }
  for (const [key, cell] of [...raw.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    summary.cells.set(key, derive(cell));
  }
  return summary;
}

function fmt(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function formatBankedFraction(summary: FractionSummary): string {
  const lines: string[] = [];
  lines.push(
    `corpus ${summary.corpora.map((corpus) => corpus.manifestHash.slice(0, 12)).join("+")} · engine ${summary.analyzerVersion} · anchor ${summary.anchor} · variant ${summary.variant}`,
  );
  lines.push(
    `folds read: ${summary.folds.join(", ")} · ${SEALED_FOLD}: SEALED, not read (${summary.rows.sealed} rows withheld at the door)`,
  );
  lines.push(
    `rows ${summary.rows.total}: ${summary.rows.controlChecked} priced · ${summary.rows.notAccepted} not accepted · ${summary.rows.otherFolds} in other folds · ${summary.rows.otherVariants} other variants · ${summary.rows.unfilled} unfilled · ${summary.rows.dataAbsent} data-absent · ${summary.rows.heldOut} held out · ${summary.rows.otherYears} in other years`,
  );
  lines.push(
    summary.years === "all"
      ? "years: all (no feed-character stratification)"
      : `years: ${summary.years} · ${describeYearMap(summary.yearMapSource, summary.witnessTablePath)}`,
  );
  lines.push(
    `control: ${summary.rows.controlChecked} rows reproduced their emitted realizedR at the shipped fraction ${SHIPPED_FRACTION} (tolerance ${CONTROL_TOLERANCE})`,
  );
  lines.push(
    summary.includeHoldout
      ? `held-out markets INCLUDED in every pool (--include-holdout): ${summary.holdout.markets.join(", ")} — a whole-roster measurement, not a verdict's`
      : describeHeldOut(summary.holdout, { labels: false, pools: true }),
  );
  lines.push("");
  lines.push(
    "allocation only: the exit path is the emitted one at every fraction (the runner's protection re-arms on the TP1 touch, not on the size banked); " +
      "costs are the emitted commission — spread and slippage ride in the leg prices. Rows without a tp1 leg price the same at every fraction.",
  );
  for (const fold of summary.folds) {
    lines.push("");
    lines.push(`=== ${fold.toUpperCase()} ===`);
    lines.push(
      `| class | filled | tp1 rows | no-tp1 rows | shipped R (½) | banked half | runner half | costs | no-tp1 R | ${FRACTIONS.map((fraction) => `R(${fraction})`).join(" | ")} | best f | Δ best vs ½ |`,
    );
    lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ${FRACTIONS.map(() => "---:").join(" | ")} | ---: | ---: |`);
    for (const [key, cell] of summary.cells) {
      if (cell.fold !== fold) continue;
      const best = cell.byFraction.get(cell.bestFraction)!;
      lines.push(
        `| ${key.startsWith("pooled|") ? "**pooled**" : cell.assetType} | ${cell.filled} | ${cell.tp1Rows} | ${cell.noTp1Rows} | ${fmt(cell.shippedTotal)} | ${fmt(cell.bankedHalf)} | ${fmt(cell.runnerHalf)} | ${fmt(-cell.costTotal)} | ${fmt(cell.noTp1Total)} | ${FRACTIONS.map((fraction) => fmt(cell.byFraction.get(fraction)!.total)).join(" | ")} | ${cell.bestFraction} | ${fmt(best.deltaVsShipped)} |`,
      );
    }
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { str } = flagReader(args, VALUE_FLAGS);
  const paths: string[] = [];
  let includeHoldout = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) {
        index += 1;
      } else if (BOOLEAN_FLAGS.has(args[index])) {
        includeHoldout = true;
      } else {
        throw new OperatorInputError(`unknown flag ${args[index]}`);
      }
      continue;
    }
    paths.push(args[index]);
  }
  const folds = parseFolds(str("--folds") ?? "fit,select");
  const variant = (str("--variant") ?? "baseline").trim();
  if (!variant) {
    throw new OperatorInputError("--variant names no variant — the default is baseline");
  }
  const yearsArg = (str("--years") ?? "all").trim();
  if (yearsArg !== "all" && yearsArg !== "contained" && yearsArg !== "escaping") {
    throw new OperatorInputError(`--years must be all, contained or escaping — got "${yearsArg}"`);
  }
  const summary = await bankedFraction({ folds, includeHoldout, paths, variant, witnessTablePath: str("--witness") ?? undefined, years: yearsArg });
  console.log(formatBankedFraction(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    if (error instanceof OperatorInputError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  });
}
