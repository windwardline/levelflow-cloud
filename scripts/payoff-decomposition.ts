/**
 * payoff-decomposition — what a win pays, what a loss costs, and where the
 * planned ratio goes.
 *
 * Amendment 39: profit is the measure and win rate is a result. The gate
 * admits a setup on a planned reward:risk (`rewardRisk`), the ladder pays a
 * different one (`ladderRewardRisk`), and the corpus realises a third. This
 * reader puts the three side by side per class and fold, decomposes realised
 * R by outcome, and prints the break-even win share at the REALISED payoff —
 * the bar a rate has to clear before it means money — beside the rate the
 * fold actually achieved. It ranks nothing and proposes nothing.
 *
 * Wins and stops are the repo's own vocabulary (`sweepStats.addOutcome`):
 * a win is `take_profit` or `tp1_partial`, a stop is `stop_loss`. Expiries
 * and ambiguous rows are neither; their share and mean are held fixed when
 * the break-even is solved, so the bar reflects the fold's real outcome mix
 * rather than a two-outcome idealisation.
 *
 * The confirm fold is SEALED: the door withholds it before a row reaches this
 * reader, and `--folds confirm` is refused by name. Held-out markets are the
 * stratified set the other readers use, never the stamped flag.
 *
 *   tsx scripts/payoff-decomposition.ts <emit.jsonl> [more shards...]
 *     [--folds fit,select] [--variant baseline] [--include-holdout]
 *     [--years all|contained|escaping [--witness docs/research/r3/feed-character.txt]]
 *
 * `--years` stratifies by feed character (scripts/feedYears.ts): the year map
 * comes from the manifest's `feedCharacter` or from the tracked witness table;
 * rows outside the named bucket are counted, never decomposed. Default `all`.
 *
 * `--include-holdout` pools the held-out markets too, labelled as such — the
 * form that reproduces a whole-roster measurement, never the form a verdict
 * reads.
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

const VALUE_FLAGS = new Set(["--folds", "--variant", "--years", "--witness"]);
const BOOLEAN_FLAGS = new Set(["--include-holdout"]);

/** Terms every shard of one decomposition must share, or it is two measurements. */
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

const WIN_OUTCOMES = new Set(["take_profit", "tp1_partial"]);
const STOP_OUTCOMES = new Set(["stop_loss"]);

export type OutcomeTally = {
  forgoneRunnerN: number;
  forgoneRunnerSum: number;
  grossN: number;
  grossSum: number;
  n: number;
  rSum: number;
};

export type Moments = { mean: number | null; n: number; sum: number };

export type PayoffCell = {
  assetType: string;
  breakEvenWinShare: number | null;
  byOutcome: Map<string, OutcomeTally & { forgoneRunnerMean: number | null; grossMean: number | null; mean: number | null; share: number }>;
  expectancy: number | null;
  filled: number;
  fold: string;
  grossExpectancy: number | null;
  grossFilled: number;
  grossSum: number;
  /** meanWin / |meanStop| — what a win pays per unit a stop costs, realised. */
  payoff: number | null;
  plannedLadderRewardRisk: number | null;
  plannedRewardRisk: number | null;
  rSum: number;
  rest: Moments;
  stops: Moments;
  winShare: number | null;
  wins: Moments;
};

type RawCell = {
  assetType: string;
  byOutcome: Map<string, OutcomeTally>;
  filled: number;
  fold: string;
  grossFilled: number;
  grossSum: number;
  ladderN: number;
  ladderSum: number;
  rSum: number;
  rrN: number;
  rrSum: number;
};

export type PayoffSummary = {
  analyzerVersion: string;
  anchor: string;
  cells: Map<string, PayoffCell>;
  corpora: Array<{ manifestHash: string; path: string }>;
  folds: string[];
  holdout: ResolvedHeldOut;
  includeHoldout: boolean;
  years: YearsFilter;
  yearMapSource: YearMap["source"] | null;
  witnessTablePath?: string;
  rows: {
    counted: number;
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

function emptyTally(): OutcomeTally {
  return { forgoneRunnerN: 0, forgoneRunnerSum: 0, grossN: 0, grossSum: 0, n: 0, rSum: 0 };
}

function rawCell(assetType: string, fold: string): RawCell {
  return {
    assetType,
    byOutcome: new Map(),
    filled: 0,
    fold,
    grossFilled: 0,
    grossSum: 0,
    ladderN: 0,
    ladderSum: 0,
    rSum: 0,
    rrN: 0,
    rrSum: 0,
  };
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return value !== undefined && value !== null && Number.isFinite(number) ? number : null;
}

function addRow(cell: RawCell, row: SweepEmitRow, realized: number): void {
  cell.filled += 1;
  cell.rSum += realized;
  const gross = finite(row.grossRealizedR);
  if (gross !== null) {
    cell.grossFilled += 1;
    cell.grossSum += gross;
  }
  const rr = finite(row.rewardRisk);
  if (rr !== null) {
    cell.rrN += 1;
    cell.rrSum += rr;
  }
  const ladder = finite(row.ladderRewardRisk);
  if (ladder !== null) {
    cell.ladderN += 1;
    cell.ladderSum += ladder;
  }
  const outcome = String(row.outcome);
  let tally = cell.byOutcome.get(outcome);
  if (!tally) {
    tally = emptyTally();
    cell.byOutcome.set(outcome, tally);
  }
  tally.n += 1;
  tally.rSum += realized;
  if (gross !== null) {
    tally.grossN += 1;
    tally.grossSum += gross;
  }
  const forgone = finite(row.forgoneRunnerR);
  if (forgone !== null) {
    tally.forgoneRunnerN += 1;
    tally.forgoneRunnerSum += forgone;
  }
}

/**
 * The win share at which expectancy is zero, holding the mean win, the mean
 * stop, and the share and mean of every other outcome (expiries, ambiguous)
 * fixed:
 *
 *   w·MW + (1 − e − w)·MS + e·ME = 0  ⇒  w* = (−(1 − e)·MS − e·ME) / (MW − MS)
 *
 * With no wins or no stops there is no ratio, and the answer is null rather
 * than a number nothing earned.
 */
export function breakEvenWinShare(input: {
  meanStop: number | null;
  meanWin: number | null;
  restMean: number | null;
  restShare: number;
}): number | null {
  if (input.meanWin === null || input.meanStop === null) {
    return null;
  }
  const denominator = input.meanWin - input.meanStop;
  if (!(denominator > 0)) {
    return null;
  }
  const restMean = input.restShare > 0 ? (input.restMean ?? 0) : 0;
  return (-(1 - input.restShare) * input.meanStop - input.restShare * restMean) / denominator;
}

function moments(n: number, sum: number): Moments {
  return { mean: n > 0 ? sum / n : null, n, sum };
}

function derive(raw: RawCell): PayoffCell {
  let winN = 0, winSum = 0, stopN = 0, stopSum = 0, restN = 0, restSum = 0;
  const byOutcome: PayoffCell["byOutcome"] = new Map();
  for (const [outcome, tally] of [...raw.byOutcome.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))) {
    if (WIN_OUTCOMES.has(outcome)) {
      winN += tally.n;
      winSum += tally.rSum;
    } else if (STOP_OUTCOMES.has(outcome)) {
      stopN += tally.n;
      stopSum += tally.rSum;
    } else {
      restN += tally.n;
      restSum += tally.rSum;
    }
    byOutcome.set(outcome, {
      ...tally,
      forgoneRunnerMean: tally.forgoneRunnerN > 0 ? tally.forgoneRunnerSum / tally.forgoneRunnerN : null,
      grossMean: tally.grossN > 0 ? tally.grossSum / tally.grossN : null,
      mean: tally.n > 0 ? tally.rSum / tally.n : null,
      share: raw.filled > 0 ? tally.n / raw.filled : 0,
    });
  }
  const wins = moments(winN, winSum);
  const stops = moments(stopN, stopSum);
  const rest = moments(restN, restSum);
  const payoff = wins.mean !== null && stops.mean !== null && stops.mean < 0
    ? wins.mean / Math.abs(stops.mean)
    : null;
  return {
    assetType: raw.assetType,
    breakEvenWinShare: breakEvenWinShare({
      meanStop: stops.mean,
      meanWin: wins.mean,
      restMean: rest.mean,
      restShare: raw.filled > 0 ? restN / raw.filled : 0,
    }),
    byOutcome,
    expectancy: raw.filled > 0 ? raw.rSum / raw.filled : null,
    filled: raw.filled,
    fold: raw.fold,
    grossExpectancy: raw.grossFilled > 0 ? raw.grossSum / raw.grossFilled : null,
    grossFilled: raw.grossFilled,
    grossSum: raw.grossSum,
    payoff,
    plannedLadderRewardRisk: raw.ladderN > 0 ? raw.ladderSum / raw.ladderN : null,
    plannedRewardRisk: raw.rrN > 0 ? raw.rrSum / raw.rrN : null,
    rSum: raw.rSum,
    rest,
    stops,
    winShare: raw.filled > 0 ? winN / raw.filled : null,
    wins,
  };
}

/** The fold names a manifest declares, whichever of its two shapes it carries. */
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

export async function decomposePayoff(input: {
  folds: string[];
  /** Where the anchor's pinned set is looked for; the tracked default when absent. */
  holdoutPinDir?: string;
  /** Pool the held-out markets too (labelled). Off by default, as every verdict reader has it. */
  includeHoldout?: boolean;
  paths: string[];
  variant: string;
  witnessTablePath?: string;
  years?: YearsFilter;
}): Promise<PayoffSummary> {
  if (input.paths.length === 0) {
    throw new OperatorInputError(
      "payoff-decomposition: no corpus paths given — pass one or more emit.jsonl shards, each with its .manifest.json beside it",
    );
  }
  if (input.folds.includes(SEALED_FOLD)) {
    throw new OperatorInputError(`the "${SEALED_FOLD}" fold is sealed — see --folds`);
  }
  const wanted = new Set(input.folds);
  // Every manifest first (the door's manifest half): one identity across the
  // shards, refused before a row is read, and the held-out set drawn over
  // their requested roster.
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
        `${input.paths[index]}: this shard's engine, anchor, depth, grid, folds, clock, conditions, cost scales or acceptance mode differ from the first shard's — two measurements cannot be decomposed as one`,
      );
    }
    const declared = declaredFoldNames(manifest);
    if (declared === null) {
      throw new Error(
        `${input.paths[index]}: the manifest declares no folds — a legacy two-split corpus cannot be read by fold name`,
      );
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
  const yearMap = years === "all"
    ? null
    : resolveYearMap({ manifests: manifests as unknown as Parameters<typeof resolveYearMap>[0]["manifests"], witnessTablePath: input.witnessTablePath });
  if (yearMap) {
    const unplaceable = manifests.flatMap((manifest) => manifest.symbols.map((entry) => entry.symbol))
      .filter((symbol, index, all) => all.indexOf(symbol) === index && !heldOut.has(symbol) && yearMap.bucketOf(symbol, 2000) === "unknown")
      .sort();
    if (unplaceable.length > 0) {
      throw new OperatorInputError(`the year map (${yearMap.source}) cannot place ${unplaceable.length} market(s) this read would decompose: ${unplaceable.join(", ")}`);
    }
  }
  const raw = new Map<string, RawCell>();
  const summary: PayoffSummary = {
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
      counted: 0,
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
    // The row half of the door: the manifest verified again before a row is
    // handed over, the confirm fold sealed.
    const manifest = await assertManifestedCorpusStreaming(path, (row) => {
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
      if (row.outcome === "unfilled") {
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
      const realized = finite(row.realizedR);
      if (realized === null) {
        throw new Error(`${path}: a filled ${symbol} row carries no finite realizedR — a hole in the corpus is a refused corpus`);
      }
      summary.rows.counted += 1;
      const assetType = getAssetType(symbol);
      for (const key of [`${assetType}|${split}`, `pooled|${split}`]) {
        let cell = raw.get(key);
        if (!cell) {
          cell = rawCell(key.startsWith("pooled|") ? "pooled" : assetType, split);
          raw.set(key, cell);
        }
        addRow(cell, row, realized);
      }
    });
    // The door withholds the confirm fold before a row reaches this reader:
    // those rows still sit in the file, so the totals count them as sealed.
    summary.rows.total += manifest.sealedRows;
    summary.rows.sealed += manifest.sealedRows;
    summary.corpora.push({ manifestHash: manifest.manifestHash, path });
  }
  for (const [key, cell] of [...raw.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    summary.cells.set(key, derive(cell));
  }
  return summary;
}

function fmt(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function formatDecomposition(summary: PayoffSummary): string {
  const lines: string[] = [];
  lines.push(
    `corpus ${summary.corpora.map((corpus) => corpus.manifestHash.slice(0, 12)).join("+")} · engine ${summary.analyzerVersion} · anchor ${summary.anchor} · variant ${summary.variant}`,
  );
  lines.push(
    `folds read: ${summary.folds.join(", ")} · ${SEALED_FOLD}: SEALED, not read (${summary.rows.sealed} rows withheld at the door)`,
  );
  lines.push(
    `rows ${summary.rows.total}: ${summary.rows.counted} decomposed · ${summary.rows.notAccepted} not accepted · ${summary.rows.otherFolds} in other folds · ${summary.rows.otherVariants} other variants · ${summary.rows.unfilled} unfilled · ${summary.rows.dataAbsent} data-absent · ${summary.rows.heldOut} held out · ${summary.rows.otherYears} in other years`,
  );
  lines.push(
    summary.years === "all"
      ? "years: all (no feed-character stratification)"
      : `years: ${summary.years} · ${describeYearMap(summary.yearMapSource, summary.witnessTablePath)}`,
  );
  lines.push(
    summary.includeHoldout
      ? `held-out markets INCLUDED in every pool (--include-holdout): ${summary.holdout.markets.join(", ")} — a whole-roster measurement, not a verdict's`
      : describeHeldOut(summary.holdout, { labels: false, pools: true }),
  );
  lines.push("");
  lines.push(
    "wins = take_profit + tp1_partial; stops = stop_loss; rest = expiries and ambiguous, held fixed when the break-even is solved. " +
      "payoff = mean win / |mean stop|, realised. break-even = the win share at which expectancy is zero at that payoff and that rest.",
  );
  for (const fold of summary.folds) {
    lines.push("");
    lines.push(`=== ${fold.toUpperCase()} ===`);
    lines.push(
      "| class | filled | net R | gross R | E (net) | mean win | mean stop | payoff | win share | break-even | rest share | rest mean | planned RR | ladder RR |",
    );
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const [key, cell] of summary.cells) {
      if (cell.fold !== fold) continue;
      const restShare = cell.filled > 0 ? cell.rest.n / cell.filled : null;
      lines.push(
        `| ${key.startsWith("pooled|") ? "**pooled**" : cell.assetType} | ${cell.filled} | ${fmt(cell.rSum, 1)} | ${fmt(cell.grossFilled > 0 ? cell.grossSum : null, 1)} | ${fmt(cell.expectancy, 4)} | ${fmt(cell.wins.mean)} | ${fmt(cell.stops.mean)} | ${fmt(cell.payoff)} | ${pct(cell.winShare)} | ${pct(cell.breakEvenWinShare)} | ${pct(restShare)} | ${fmt(cell.rest.mean)} | ${fmt(cell.plannedRewardRisk, 2)} | ${fmt(cell.plannedLadderRewardRisk, 2)} |`,
      );
    }
    lines.push("");
    lines.push("| class | outcome | n | share | mean net R | mean gross R | mean forgone runner R |");
    lines.push("| --- | --- | ---: | ---: | ---: | ---: | ---: |");
    for (const [key, cell] of summary.cells) {
      if (cell.fold !== fold) continue;
      for (const [outcome, tally] of cell.byOutcome) {
        lines.push(
          `| ${key.startsWith("pooled|") ? "**pooled**" : cell.assetType} | ${outcome} | ${tally.n} | ${pct(tally.share)} | ${fmt(tally.mean, 4)} | ${fmt(tally.grossMean, 4)} | ${fmt(tally.forgoneRunnerMean, 4)} |`,
        );
      }
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
  const summary = await decomposePayoff({ folds, includeHoldout, paths, variant, witnessTablePath: str("--witness") ?? undefined, years: yearsArg });
  console.log(formatDecomposition(summary));
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
