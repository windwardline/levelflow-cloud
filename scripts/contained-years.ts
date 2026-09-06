/**
 * contained-years — the money split the feed-window question needs, as a
 * tracked number: per class and tuning fold, fills, net R and gross R in
 * the years the feed-character witness names (`escaping`) against the years
 * it does not (`contained`), and pooled.
 *
 * The year map is never this reader's: it comes from the corpus manifest's
 * `feedCharacter` (corpora built after #589) or from the tracked witness
 * table for a corpus that predates the field (`--witness path`). A symbol
 * the map cannot place is a refusal, not a clean row. The confirm fold is
 * sealed at the door; held-out markets are the stratified set.
 *
 * It ranks nothing and proposes nothing. What a contained-years figure means
 * for a verdict is the remedy round's question; this reader makes the figure
 * exact and repeatable.
 *
 *   tsx scripts/contained-years.ts <emit.jsonl> [more shards...]
 *     [--folds fit,select] [--variant baseline] [--witness docs/research/r3/feed-character.txt]
 */
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { describeYearMap, resolveYearMap, type YearBucket, type YearMap, yearOf } from "./feedYears.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { describeHeldOut, type ResolvedHeldOut, resolveHeldOut } from "./sweepFolds.ts";
import { type SweepManifest, stableStringify } from "./sweepManifest.ts";
import { assertManifest, assertManifestedCorpusStreaming, type SweepEmitRow } from "./sweepStats.ts";
import { parseFolds, SEALED_FOLD } from "./tuning-folds-summary.ts";

export { parseFolds, SEALED_FOLD };

const VALUE_FLAGS = new Set(["--folds", "--variant", "--witness"]);

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

export type SplitCell = {
  assetType: string;
  bucket: YearBucket;
  expectancy: number | null;
  filled: number;
  fold: string;
  grossFilled: number;
  grossSum: number;
  rSum: number;
};

export type ContainedYearsSummary = {
  analyzerVersion: string;
  anchor: string;
  cells: Map<string, SplitCell>;
  corpora: Array<{ manifestHash: string; path: string }>;
  folds: string[];
  holdout: ResolvedHeldOut;
  rows: {
    counted: number;
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
  witnessTablePath?: string;
  yearMapSource: YearMap["source"];
};

function finite(value: unknown): number | null {
  const number = Number(value);
  return value !== undefined && value !== null && Number.isFinite(number) ? number : null;
}

function declaredFoldNames(manifest: SweepManifest): Set<string> | null {
  if (manifest.folds) return new Set(manifest.folds.map((fold) => fold.name));
  if (manifest.foldsByClass) {
    const names = new Set<string>();
    for (const classFolds of Object.values(manifest.foldsByClass)) for (const fold of classFolds) names.add(fold.name);
    return names;
  }
  return null;
}

export async function containedYears(input: {
  folds: string[];
  holdoutPinDir?: string;
  paths: string[];
  variant: string;
  witnessTablePath?: string;
}): Promise<ContainedYearsSummary> {
  if (input.paths.length === 0) {
    throw new OperatorInputError("contained-years: no corpus paths given — pass one or more emit.jsonl shards, each with its .manifest.json beside it");
  }
  if (input.folds.includes(SEALED_FOLD)) {
    throw new OperatorInputError(`the "${SEALED_FOLD}" fold is sealed — see --folds`);
  }
  const wanted = new Set(input.folds);
  const manifests = input.paths.map((path) => assertManifest(path));
  let identity: string | null = null;
  for (const [index, manifest] of manifests.entries()) {
    const record = manifest as unknown as Record<string, unknown>;
    const shardIdentity = stableStringify(Object.fromEntries(IDENTITY_TERMS.map((term) => [term, record[term]])));
    if (identity === null) identity = shardIdentity;
    else if (identity !== shardIdentity) {
      throw new Error(`${input.paths[index]}: this shard's engine, anchor, depth, grid, folds, clock, conditions, cost scales or acceptance mode differ from the first shard's — two measurements cannot be split as one`);
    }
    const declared = declaredFoldNames(manifest);
    if (declared === null) throw new Error(`${input.paths[index]}: the manifest declares no folds — a legacy two-split corpus cannot be read by fold name`);
    for (const fold of input.folds) {
      if (!declared.has(fold)) throw new OperatorInputError(`${input.paths[index]}: the manifest declares no "${fold}" fold (it declares ${[...declared].sort().join(", ")})`);
    }
  }
  const yearMap = resolveYearMap({ manifests: manifests as unknown as Parameters<typeof resolveYearMap>[0]["manifests"], witnessTablePath: input.witnessTablePath });
  const holdout = resolveHeldOut(manifests, input.holdoutPinDir);
  const heldOut = new Set(holdout.markets);
  // Every symbol this read will place must be placeable BEFORE a row is read:
  // a symbol the map cannot place would otherwise surface as a refusal in
  // the middle of a 16 GB pass, or worse, as a contained row.
  const unplaceable = manifests.flatMap((manifest) => manifest.symbols.map((entry) => entry.symbol))
    .filter((symbol, index, all) => all.indexOf(symbol) === index && !heldOut.has(symbol) && yearMap.bucketOf(symbol, 2000) === "unknown")
    .sort();
  if (unplaceable.length > 0) {
    throw new OperatorInputError(`the year map (${yearMap.source}) cannot place ${unplaceable.length} market(s) this read would count: ${unplaceable.join(", ")} — an absent verdict is not a contained one`);
  }
  const cells = new Map<string, SplitCell>();
  const summary: ContainedYearsSummary = {
    analyzerVersion: manifests[0].analyzerVersion,
    anchor: manifests[0].anchor,
    cells,
    corpora: [],
    folds: [...input.folds],
    holdout,
    rows: { counted: 0, dataAbsent: 0, heldOut: 0, notAccepted: 0, otherFolds: 0, otherVariants: 0, sealed: 0, total: 0, unfilled: 0 },
    variant: input.variant,
    ...(input.witnessTablePath && { witnessTablePath: input.witnessTablePath }),
    yearMapSource: yearMap.source,
  };
  const cellOf = (assetType: string, fold: string, bucket: YearBucket): SplitCell => {
    const key = `${assetType}|${fold}|${bucket}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { assetType, bucket, expectancy: null, filled: 0, fold, grossFilled: 0, grossSum: 0, rSum: 0 };
      cells.set(key, cell);
    }
    return cell;
  };
  for (const path of input.paths) {
    const manifest = await assertManifestedCorpusStreaming(path, (row: SweepEmitRow) => {
      summary.rows.total += 1;
      if (row.accepted !== true) { summary.rows.notAccepted += 1; return; }
      const split = String(row.split);
      if (!wanted.has(split)) { summary.rows.otherFolds += 1; return; }
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      if (variant !== input.variant) { summary.rows.otherVariants += 1; return; }
      if (row.noBarsInReviewWindow === true) { summary.rows.dataAbsent += 1; return; }
      if (row.outcome === "unfilled") { summary.rows.unfilled += 1; return; }
      const symbol = String(row.symbol);
      if (heldOut.has(symbol)) { summary.rows.heldOut += 1; return; }
      const realized = finite(row.realizedR);
      const time = finite(row.time);
      if (realized === null || time === null) throw new Error(`${path}: a filled ${symbol} row carries no finite realizedR or time — a hole in the corpus is a refused corpus`);
      const bucket = yearMap.bucketOf(symbol, yearOf(time));
      if (bucket === "unknown") throw new Error(`${path}: ${symbol} reached the split with no year map — the pre-read check should have refused it`);
      summary.rows.counted += 1;
      const gross = finite(row.grossRealizedR);
      for (const cell of [cellOf(getAssetType(symbol), split, bucket), cellOf("pooled", split, bucket)]) {
        cell.filled += 1;
        cell.rSum += realized;
        if (gross !== null) { cell.grossFilled += 1; cell.grossSum += gross; }
      }
    });
    summary.rows.total += manifest.sealedRows;
    summary.rows.sealed += manifest.sealedRows;
    summary.corpora.push({ manifestHash: manifest.manifestHash, path });
  }
  for (const cell of cells.values()) cell.expectancy = cell.filled > 0 ? cell.rSum / cell.filled : null;
  summary.cells = new Map([...cells.entries()].sort(([a], [b]) => a.localeCompare(b)));
  return summary;
}

function fmt(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

export function formatContainedYears(summary: ContainedYearsSummary): string {
  const lines: string[] = [];
  lines.push(`corpus ${summary.corpora.map((c) => c.manifestHash.slice(0, 12)).join("+")} · engine ${summary.analyzerVersion} · anchor ${summary.anchor} · variant ${summary.variant}`);
  lines.push(`folds read: ${summary.folds.join(", ")} · ${SEALED_FOLD}: SEALED, not read (${summary.rows.sealed} rows withheld at the door)`);
  lines.push(describeYearMap(summary.yearMapSource, summary.witnessTablePath));
  lines.push(`rows ${summary.rows.total}: ${summary.rows.counted} split · ${summary.rows.notAccepted} not accepted · ${summary.rows.otherFolds} in other folds · ${summary.rows.otherVariants} other variants · ${summary.rows.unfilled} unfilled · ${summary.rows.dataAbsent} data-absent · ${summary.rows.heldOut} held out`);
  lines.push(describeHeldOut(summary.holdout, { labels: false, pools: true }));
  lines.push("");
  lines.push("escaping = years the feed-character witness names for the market (5min tier); contained = the rest. A verdict on either bucket is the remedy round's, not this reader's.");
  for (const fold of summary.folds) {
    lines.push("");
    lines.push(`=== ${fold.toUpperCase()} ===`);
    lines.push("| class | fold | bucket | filled | net R | gross R | E (net) |");
    lines.push("| --- | --- | --- | ---: | ---: | ---: | ---: |");
    for (const [key, cell] of summary.cells) {
      if (cell.fold !== fold) continue;
      lines.push(`| ${key.startsWith("pooled|") ? "**pooled**" : cell.assetType} | ${fold} | ${cell.bucket} | ${cell.filled} | ${fmt(cell.rSum)} | ${fmt(cell.grossFilled > 0 ? cell.grossSum : null)} | ${fmt(cell.expectancy, 4)} |`);
    }
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { str } = flagReader(args, VALUE_FLAGS);
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) index += 1;
      else throw new OperatorInputError(`unknown flag ${args[index]}`);
      continue;
    }
    paths.push(args[index]);
  }
  const folds = parseFolds(str("--folds") ?? "fit,select");
  const variant = (str("--variant") ?? "baseline").trim();
  if (!variant) throw new OperatorInputError("--variant names no variant — the default is baseline");
  const witnessTablePath = str("--witness") ?? undefined;
  const summary = await containedYears({ folds, paths, variant, witnessTablePath });
  console.log(formatContainedYears(summary));
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
