/**
 * The tuning folds, summarised — fit and select, NEVER confirm.
 *
 * WHY A NEW READER. The 2026-09-02 audit of every corpus reader found that
 * twelve of them pool or print figures computed over the CONFIRM fold with no
 * opt-in and no ledger entry: `sweep-analysis`, `stop-provenance`,
 * `roster-expectancy-audit`, `market-dossier`, `cost-sensitivity-verdict`,
 * `threshold-rescue`, `account-type-report`, `ag-class-derivation`,
 * `confidence-bands`, `exclusion-suspects`, `geometry-evidence`,
 * `e4-collapse`. The confirm fold is the held-back fold whose ONE authorized
 * read is `grid-totalr --confirm-final`, recorded in
 * `docs/research/confirm-reads/`; a read through any of those twelve is an
 * unrecorded one. Describing R3's corpus therefore needed a reader that
 * cannot open that fold at all — this one refuses the name outright, and a
 * fold the manifest does not declare is refused too.
 *
 * WHAT IT SAYS, in the engine's own vocabulary (`sweepStats.ts`): per class
 * and variant, per class, variant and fold, and per market and variant —
 * decisions, filled, data-absent, the TP1 hit and stop rates BESIDE the money
 * (amendment 39: a rate may sit beside money, never instead of it), net and
 * gross expectancy, net and gross total R, the class rollup's standard error
 * clustered by market (3a), and a THIN marker below `--min-filled`. Held-out
 * markets (the manifest's stamped 3e flag) are excluded from every class
 * rollup and listed per market as HELD OUT. Rows the sweep did not accept
 * (a capture-all arm) are counted and skipped: this describes the accepted
 * population.
 *
 * WHAT IT DOES NOT DO. It ranks nothing and accepts nothing — the acceptance
 * gate is `grid-totalr`, with its permutation null and its family-wise
 * correction. This is the description a report quotes, not a verdict.
 *
 *   npx tsx scripts/tuning-folds-summary.ts <emit.jsonl> [more shards ...]
 *     [--folds fit,select] [--min-filled 30]
 */
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { type SweepManifest, stableStringify } from "./sweepManifest.ts";
import {
  addOutcome,
  assertEmitColumns,
  assertManifestedCorpusStreaming,
  clusteredStandardError,
  emptyStats,
  expectancy,
  rStandardError,
  type SweepEmitRow,
  type SweepStats,
} from "./sweepStats.ts";

const VALUE_FLAGS = new Set(["--folds", "--min-filled"]);

/** The one fold this reader can never be asked for. */
export const SEALED_FOLD = "confirm";

/** Terms every shard of one summary must share, or it is two measurements. */
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
  "stepBars",
] as const;

const REQUIRED_COLUMNS = [
  "accepted",
  "grossOutcome",
  "grossRealizedR",
  "holdout",
  "split",
  "symbol",
  "variant",
] as const;

type Cell = { gross: SweepStats; net: SweepStats };

export type TuningSummary = {
  anchor: string;
  analyzerVersion: string;
  byClassVariant: Map<string, Cell & { assetType: string; variant: string }>;
  byClassVariantFold: Map<
    string,
    Cell & { assetType: string; fold: string; variant: string }
  >;
  bySymbolVariant: Map<
    string,
    Cell & { assetType: string; holdout: boolean; symbol: string; variant: string }
  >;
  columnsUnverifiable: boolean;
  foldWindows: Array<{ endMs: number; name: string; startMs: number }>;
  folds: string[];
  manifestHashes: string[];
  minFilled: number;
  rows: {
    accepted: number;
    heldOut: number;
    notAccepted: number;
    otherFolds: number;
    total: number;
  };
};

function cell(): Cell {
  return { gross: emptyStats(), net: emptyStats() };
}

function addBoth(target: Cell, row: SweepEmitRow): void {
  addOutcome(target.net, row);
  addOutcome(target.gross, {
    ...row,
    outcome: String(row.grossOutcome),
    realizedR: Number(row.grossRealizedR),
  });
}

function mergeStats(into: SweepStats, from: SweepStats): void {
  into.ambiguous += from.ambiguous;
  into.dataAbsent += from.dataAbsent;
  into.filled += from.filled;
  into.n += from.n;
  into.rSum += from.rSum;
  into.rSumSq += from.rSumSq;
  into.stops += from.stops;
  into.wins += from.wins;
}

export function parseFolds(spec: string): string[] {
  const folds = spec.split(",").map((name) => name.trim()).filter(Boolean);
  if (folds.length === 0) {
    throw new OperatorInputError(
      "--folds names no fold — pass a comma-separated list such as fit,select",
    );
  }
  if (folds.includes(SEALED_FOLD)) {
    throw new OperatorInputError(
      `--folds names "${SEALED_FOLD}", the held-back fold. Its ONE authorized ` +
        `read is grid-totalr --confirm-final, recorded in ` +
        `docs/research/confirm-reads/; this reader never opens it`,
    );
  }
  return [...new Set(folds)];
}

/** The fold names a manifest declares, whichever of its two shapes it carries. */
function declaredFolds(
  manifest: SweepManifest,
): Array<{ endMs: number; name: string; startMs: number }> | null {
  if (manifest.folds) {
    return manifest.folds.map(({ endMs, name, startMs }) => ({
      endMs,
      name,
      startMs,
    }));
  }
  if (manifest.foldsByClass) {
    const seen = new Map<string, { endMs: number; name: string; startMs: number }>();
    for (const classFolds of Object.values(manifest.foldsByClass)) {
      for (const fold of classFolds) {
        const prior = seen.get(fold.name);
        seen.set(fold.name, {
          endMs: Math.max(prior?.endMs ?? fold.endMs, fold.endMs),
          name: fold.name,
          startMs: Math.min(prior?.startMs ?? fold.startMs, fold.startMs),
        });
      }
    }
    return [...seen.values()];
  }
  return null;
}

export async function summarizeTuningFolds(input: {
  folds: string[];
  minFilled: number;
  paths: string[];
}): Promise<TuningSummary> {
  if (input.paths.length === 0) {
    throw new OperatorInputError(
      "tuning-folds-summary: no corpus paths given — pass one or more " +
        "emit.jsonl shards, each with its .manifest.json beside it",
    );
  }
  if (input.folds.includes(SEALED_FOLD)) {
    throw new OperatorInputError(
      `the "${SEALED_FOLD}" fold is sealed — see --folds`,
    );
  }
  const wanted = new Set(input.folds);
  const summary: TuningSummary = {
    anchor: "",
    analyzerVersion: "",
    byClassVariant: new Map(),
    byClassVariantFold: new Map(),
    bySymbolVariant: new Map(),
    columnsUnverifiable: false,
    foldWindows: [],
    folds: input.folds,
    manifestHashes: [],
    minFilled: input.minFilled,
    rows: { accepted: 0, heldOut: 0, notAccepted: 0, otherFolds: 0, total: 0 },
  };
  let identity: string | null = null;
  for (const path of input.paths) {
    // The manifest half of the door first, so a shard that cannot state its
    // folds is refused before a single row of it is read.
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
      summary.rows.accepted += 1;
      const symbol = String(row.symbol);
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      const assetType = getAssetType(symbol);
      const holdout = row.holdout === true;
      const symbolKey = `${assetType}|${symbol}|${variant}`;
      let symbolCell = summary.bySymbolVariant.get(symbolKey);
      if (!symbolCell) {
        symbolCell = { ...cell(), assetType, holdout, symbol, variant };
        summary.bySymbolVariant.set(symbolKey, symbolCell);
      }
      addBoth(symbolCell, row);
      if (holdout) {
        // 3e: held-out markets enter no tuning aggregate. Listed per market
        // with the flag, never rolled into a class.
        summary.rows.heldOut += 1;
        return;
      }
      const classKey = `${assetType}|${variant}`;
      let classCell = summary.byClassVariant.get(classKey);
      if (!classCell) {
        classCell = { ...cell(), assetType, variant };
        summary.byClassVariant.set(classKey, classCell);
      }
      addBoth(classCell, row);
      const foldKey = `${assetType}|${variant}|${split}`;
      let foldCell = summary.byClassVariantFold.get(foldKey);
      if (!foldCell) {
        foldCell = { ...cell(), assetType, fold: split, variant };
        summary.byClassVariantFold.set(foldKey, foldCell);
      }
      addBoth(foldCell, row);
    }).catch((error: unknown) => {
      throw error;
    });
    // The checks below run AFTER the stream for the door's sake, but they
    // are about the manifest alone; a shard refused here has contributed
    // rows to nothing a caller can read, since the throw abandons the summary.
    const windows = declaredFolds(manifest);
    if (windows === null) {
      throw new Error(
        `${path}: the manifest declares no folds — a legacy two-split corpus ` +
          `(train/test) has no fit or select fold to summarise; grade it ` +
          `with grid-totalr, which maps the legacy names`,
      );
    }
    for (const fold of input.folds) {
      if (!windows.some((window) => window.name === fold)) {
        throw new Error(
          `${path}: the manifest declares folds ${
            windows.map((window) => window.name).join(", ")
          } and no "${fold}" — a fold this corpus was not decided under cannot ` +
            `be summarised from it`,
        );
      }
    }
    const { unverifiable } = assertEmitColumns(path, manifest, REQUIRED_COLUMNS);
    if (unverifiable) summary.columnsUnverifiable = true;
    const record = manifest as unknown as Record<string, unknown>;
    const shardIdentity = stableStringify(
      Object.fromEntries(IDENTITY_TERMS.map((term) => [term, record[term]])),
    );
    if (identity === null) {
      identity = shardIdentity;
      summary.anchor = manifest.anchor;
      summary.analyzerVersion = manifest.analyzerVersion;
      summary.foldWindows = windows.filter((window) => wanted.has(window.name));
    } else if (identity !== shardIdentity) {
      throw new Error(
        `${path}: this shard's engine, anchor, depth, grid, folds, clock, ` +
          `conditions, cost scales or acceptance mode differ from the first ` +
          `shard's — two measurements cannot be summarised as one`,
      );
    }
    summary.manifestHashes.push(manifest.manifestHash.slice(0, 12));
  }
  return summary;
}

function fixed(value: number | null, digits = 3): string {
  return value === null ? "—" : value.toFixed(digits);
}

function rate(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((100 * numerator) / denominator).toFixed(1)}%` : "—";
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function thin(stats: SweepStats, minFilled: number): string {
  return stats.filled < minFilled ? "THIN" : "";
}

export function formatSummary(summary: TuningSummary): string {
  const lines: string[] = [];
  lines.push(
    `corpus ${summary.manifestHashes.join(", ")} · engine ${
      summary.analyzerVersion
    } · anchor ${summary.anchor}`,
    `folds read: ${
      summary.foldWindows.map((window) =>
        `${window.name} ${iso(window.startMs)}..${iso(window.endMs)}`
      ).join(" · ")
    } · ${SEALED_FOLD}: SEALED, not read`,
    `rows: ${summary.rows.total} total · ${summary.rows.accepted} accepted in ` +
      `the folds read · ${summary.rows.notAccepted} not accepted (skipped) · ${
        summary.rows.otherFolds
      } in other folds (not read) · ${summary.rows.heldOut} on held-out ` +
      `markets (per-market lines only)`,
    `thin floor: ${summary.minFilled} filled` +
      (summary.columnsUnverifiable
        ? " · NOTE: a manifest carries no emitColumns, so the gross columns " +
          "could not be verified present before reading"
        : ""),
    "",
    "## Per class × variant — held-out markets excluded, folds pooled",
    "",
    "| class | variant | n | filled | dataAbsent | tp1 hit | stop | net E | ±SE clustered (k) | gross E | net total R | gross total R | flag |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  );
  const classKeys = [...summary.byClassVariant.keys()].sort();
  for (const key of classKeys) {
    const entry = summary.byClassVariant.get(key)!;
    const clusters = [...summary.bySymbolVariant.values()]
      .filter((symbolCell) =>
        symbolCell.assetType === entry.assetType &&
        symbolCell.variant === entry.variant && !symbolCell.holdout
      )
      .map((symbolCell) => symbolCell.net);
    const clustered = clusteredStandardError(clusters);
    const k = clusters.filter((cluster) => cluster.filled > 0).length;
    lines.push(
      `| ${entry.assetType} | ${entry.variant} | ${entry.net.n} | ${entry.net.filled} | ${entry.net.dataAbsent} | ${
        rate(entry.net.wins, entry.net.filled)
      } | ${rate(entry.net.stops, entry.net.filled)} | ${
        fixed(expectancy(entry.net))
      } | ${clustered === null ? "—" : `±${clustered.toFixed(3)} (${k})`} | ${
        fixed(expectancy(entry.gross))
      } | ${entry.net.rSum.toFixed(1)} | ${entry.gross.rSum.toFixed(1)} | ${
        thin(entry.net, summary.minFilled)
      } |`,
    );
  }
  lines.push(
    "",
    "## Per class × variant × fold — held-out markets excluded",
    "",
    "| class | variant | fold | n | filled | tp1 hit | net E | ±SE | gross E | net total R |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const key of [...summary.byClassVariantFold.keys()].sort()) {
    const entry = summary.byClassVariantFold.get(key)!;
    const se = rStandardError(entry.net);
    lines.push(
      `| ${entry.assetType} | ${entry.variant} | ${entry.fold} | ${entry.net.n} | ${entry.net.filled} | ${
        rate(entry.net.wins, entry.net.filled)
      } | ${fixed(expectancy(entry.net))} | ${
        se === null ? "—" : `±${se.toFixed(3)}`
      } | ${fixed(expectancy(entry.gross))} | ${entry.net.rSum.toFixed(1)} |`,
    );
  }
  lines.push(
    "",
    "## Frequency beside money — baseline, folds pooled, held-out excluded",
    "",
  );
  const baselineMarkets = [...summary.bySymbolVariant.values()].filter((entry) =>
    entry.variant === "baseline" && !entry.holdout &&
    entry.net.filled >= summary.minFilled
  );
  const winningMostLosingMoney = baselineMarkets.filter((entry) =>
    entry.net.wins / entry.net.filled >= 0.5 && (expectancy(entry.net) ?? 0) < 0
  );
  const positive = baselineMarkets.filter((entry) =>
    (expectancy(entry.net) ?? 0) > 0
  );
  lines.push(
    `markets above the thin floor at baseline: ${baselineMarkets.length} · ` +
      `net expectancy > 0: ${positive.length} · winning at least half their ` +
      `filled setups while losing money: ${winningMostLosingMoney.length}` +
      (winningMostLosingMoney.length > 0
        ? ` (${
          winningMostLosingMoney.map((entry) => entry.symbol).sort().join(", ")
        })`
        : ""),
    "",
    "## Per market × variant — folds pooled",
    "",
    "| class | market | variant | held out | n | filled | dataAbsent | tp1 hit | stop | net E | ±SE | gross E | net total R | gross total R | flag |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  );
  for (const key of [...summary.bySymbolVariant.keys()].sort()) {
    const entry = summary.bySymbolVariant.get(key)!;
    const se = rStandardError(entry.net);
    lines.push(
      `| ${entry.assetType} | ${entry.symbol} | ${entry.variant} | ${
        entry.holdout ? "HELD OUT" : ""
      } | ${entry.net.n} | ${entry.net.filled} | ${entry.net.dataAbsent} | ${
        rate(entry.net.wins, entry.net.filled)
      } | ${rate(entry.net.stops, entry.net.filled)} | ${
        fixed(expectancy(entry.net))
      } | ${se === null ? "—" : `±${se.toFixed(3)}`} | ${
        fixed(expectancy(entry.gross))
      } | ${entry.net.rSum.toFixed(1)} | ${entry.gross.rSum.toFixed(1)} | ${
        thin(entry.net, summary.minFilled)
      } |`,
    );
  }
  return lines.join("\n");
}

/** Pool the per-fold cells back into one, for callers that want the sum. */
export function pooled(cells: Cell[]): Cell {
  const out = cell();
  for (const entry of cells) {
    mergeStats(out.net, entry.net);
    mergeStats(out.gross, entry.gross);
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { num, str } = flagReader(args, VALUE_FLAGS);
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) index += 1;
      continue;
    }
    paths.push(args[index]);
  }
  const folds = parseFolds(str("--folds") ?? "fit,select");
  const minFilled = num("--min-filled", 30, {
    basis: "below one filled outcome no expectancy exists to flag; 30 is the " +
      "floor the per-market verdicts and the starvation gate both carry",
    integer: true,
    min: 1,
  });
  const summary = await summarizeTuningFolds({ folds, minFilled, paths });
  console.log(formatSummary(summary));
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
