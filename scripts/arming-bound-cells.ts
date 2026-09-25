/**
 * The eight forex cells under three conventions of the same fills.
 *
 * Fold × pool × span — fit/select, in-pool/held-out, decision hour 16–21 UTC
 * or not — is the grain the in-span finding was recorded at
 * (hour-mechanism-2026-09-07.txt under the research tree). Each cell is
 * printed three times from one corpus: the net arm as emitted (FR-3's
 * zero-latency arming, the record's own column), the gross arm (E8's
 * published commission, none of the modelled spread or slippage), and the
 * arming-bound arm (2026-09-14: the same decision at the net cost with the
 * protection arming one bar late). The open-scope round measured 89–97% of
 * the lock's value over hold inside the TP1 touch bar; this reader is how
 * the eight cells are graded under both conventions from the one corpus
 * that carries the column — the re-simulate — not from the record's own.
 *
 * The control: run with `--control <tracked eight-cell table>` the net
 * column must reproduce every cell of the record — n exactly, net R, E and
 * lo95 to their printed precision — or the reader refuses before it prints
 * the other two columns. Without `--control` it prints all three and says
 * no control was named. The record's table is the contained-years
 * population, so a control run is `--years contained --witness
 * docs/research/r3/feed-character.txt --control docs/research/r3/
 * hour-mechanism-2026-09-07.txt`; any other population refuses on n. An
 * instrument that cannot reproduce the cases already decided has no
 * standing on an open one.
 *
 * Population, as the record's: accepted, baseline, the tuning folds, forex
 * by the roster, filled, years by the feed witness when `--years` names a
 * bucket, pool by the pinned holdout. The confirm fold is sealed at the door
 * (R4 act 1) and refused by name; a corpus that does not carry the
 * arming-bound columns is refused, never graded on the net figure in their
 * place.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { describeYearMap, resolveYearMap, type YearMap, yearOf, type YearsFilter } from "./feedYears.ts";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { admitManifests } from "./forex-commission-conversion.ts";
import { describeHeldOut, resolveHeldOut } from "./sweepFolds.ts";
import {
  ARM_COLUMNS,
  type ArmName,
  assertEmitColumns,
  assertManifest,
  assertManifestedCorpusStreaming,
  type SweepEmitRow,
} from "./sweepStats.ts";
import { parseFolds, SEALED_FOLD } from "./tuning-folds-summary.ts";

const VALUE_FLAGS = new Set(["--control", "--folds", "--variant", "--years", "--witness"]);
const BOOLEAN_FLAGS = new Set(["--include-holdout"]);

/** The decision hours the in-span finding names (hour-gate verdict, 2026-09-12). */
const SPAN_HOURS = { first: 16, last: 21 };

const ARMS = ARM_COLUMNS;
type Arm = ArmName;
const ARM_ORDER: readonly Arm[] = ["net", "gross", "bound"];

type Stat = { n: number; sum: number; sumSq: number };
export type CellSummary = { cell: string; fold: string; pool: string; span: string } & Record<Arm, Stat>;

export type CellsInput = {
  controlPath?: string;
  folds: string[];
  holdoutPinDir?: string;
  includeHoldout: boolean;
  paths: string[];
  variant: string;
  witnessTablePath?: string;
  years: YearsFilter;
};

export type CellsSummary = {
  cells: CellSummary[];
  control: { cellsChecked: number; path: string } | null;
  provenance: string[];
  rows: {
    notAccepted: number;
    notFilled: number;
    notForex: number;
    otherYears: number;
    priced: number;
    sealed: number;
    total: number;
    wrongFold: number;
    wrongVariant: number;
  };
};

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function stat(): Stat {
  return { n: 0, sum: 0, sumSq: 0 };
}

export function mean(s: Stat): number {
  return s.n > 0 ? s.sum / s.n : Number.NaN;
}

/**
 * mean − 1.96·sd/√n with the sample sd (n − 1): the record's own producer's
 * formula (docs/research/r3/re-simulate-2026-09-24/hour-mechanism.py.txt), kept so the control is a
 * reproduction and not a re-derivation. The shared t-interval helper would
 * differ by 6e-6 at the record's smallest cell — inside the control's
 * tolerance, but a different formula. Below two fills there is no interval:
 * one fill is an absence of evidence, never a bound, so the caller prints
 * "—" and a one-fill cell can never count as clearing zero.
 */
export function lower95(s: Stat): number {
  if (s.n < 2) return Number.NaN;
  const m = s.sum / s.n;
  const variance = (s.sumSq - s.n * m * m) / (s.n - 1);
  return m - 1.96 * Math.sqrt(Math.max(variance, 0) / s.n);
}

/**
 * Half a unit in the last printed place, plus an epsilon: a true
 * reproduction of a figure printed to one decimal (net R) or four (E, lo95)
 * can differ from the print by at most half a unit, and is never refused.
 */
const PRINTED = { netR: 1, rate: 4 } as const;
const tolerance = (decimals: number) => 0.5 * 10 ** -decimals + 10 ** -(decimals + 2);

/**
 * The tracked eight-cell table's rows: `| fold | pool | span | n | net R | E | lo95 | …`.
 * Only the first seven columns are read; the record's later columns (stop
 * rate, tp1 rate, excursions) are not this reader's subject.
 */
export function parseControlTable(text: string): Map<string, { e: number; lo95: number; n: number; netR: number }> {
  const cells = new Map<string, { e: number; lo95: number; n: number; netR: number }>();
  for (const line of text.split("\n")) {
    const match = line.match(/^\|\s*(fit|select)\s*\|\s*(in-pool|held-out)\s*\|\s*(in|out)\s*\|\s*(\d+)\s*\|\s*([+-]?\d+(?:\.\d+)?)\s*\|\s*([+-]?\d+\.\d+)\s*\|\s*([+-]?\d+\.\d+)\s*\|/);
    if (!match) continue;
    cells.set(`${match[1]}|${match[2]}|${match[3]}`, {
      e: Number(match[6]),
      lo95: Number(match[7]),
      n: Number(match[4]),
      netR: Number(match[5]),
    });
  }
  return cells;
}

export async function armingBoundCells(input: CellsInput): Promise<CellsSummary> {
  if (input.paths.length === 0) {
    throw new OperatorInputError("no corpus shard named — a run over zero rows cannot grade a cell");
  }
  if (input.folds.includes(SEALED_FOLD)) {
    throw new OperatorInputError(`the ${SEALED_FOLD} fold is sealed — this reader grades the tuning folds only`);
  }
  const preflight = input.paths.map((path) => {
    const manifest = assertManifest(path);
    // The columns this read exists to grade. A corpus emitted before the
    // arming-bound arm carries none of them and is refused here, not graded
    // on the net figure in their place. A manifest without emitColumns
    // (legacy) is checked row by row below instead.
    assertEmitColumns(path, manifest, [ARMS.bound.r, ARMS.bound.outcome, ARMS.gross.r, ARMS.gross.outcome]);
    return manifest;
  });
  const yearMap: YearMap | null = input.years === "all"
    ? null
    : resolveYearMap({ manifests: preflight, witnessTablePath: input.witnessTablePath });
  const manifests = admitManifests(input.paths, input.folds, yearMap, (symbol) => getAssetType(symbol) === "forex");
  const holdout = resolveHeldOut(manifests, input.holdoutPinDir);
  const heldOut = new Set(input.includeHoldout ? [] : holdout.markets);
  const wanted = new Set(input.folds);
  const rows: CellsSummary["rows"] = {
    notAccepted: 0, notFilled: 0, notForex: 0, otherYears: 0, priced: 0, sealed: 0, total: 0,
    wrongFold: 0, wrongVariant: 0,
  };
  const cells = new Map<string, CellSummary>();
  for (const path of input.paths) {
    const manifest = await assertManifestedCorpusStreaming(path, (row: SweepEmitRow) => {
      rows.total += 1;
      if (row.accepted !== true) {
        rows.notAccepted += 1;
        return;
      }
      const split = String(row.split);
      if (!wanted.has(split)) {
        rows.wrongFold += 1;
        return;
      }
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      if (variant !== input.variant) {
        rows.wrongVariant += 1;
        return;
      }
      const symbol = String(row.symbol);
      if (getAssetType(symbol) !== "forex") {
        rows.notForex += 1;
        return;
      }
      const record = row as unknown as Record<string, unknown>;
      const time = finite(row.time);
      if (record.noBarsInReviewWindow === true || row.outcome === "unfilled" || time === null) {
        rows.notFilled += 1;
        return;
      }
      const values: Partial<Record<Arm, number>> = {};
      for (const arm of ARM_ORDER) {
        const value = finite(record[ARMS[arm].r]);
        if (value === null) {
          throw new Error(
            `${path}: ${symbol} at ${time} carries no finite ${ARMS[arm].r} — a filled row without the ${arm} arm cannot be graded under it, and grading the others alone would print an interval with one end missing`,
          );
        }
        values[arm] = value;
      }
      if (yearMap && yearMap.bucketOf(symbol, yearOf(time)) !== input.years) {
        rows.otherYears += 1;
        return;
      }
      rows.priced += 1;
      const hour = new Date(time).getUTCHours();
      const fold = split;
      const pool = heldOut.has(symbol) ? "held-out" : "in-pool";
      const span = hour >= SPAN_HOURS.first && hour <= SPAN_HOURS.last ? "in" : "out";
      const key = `${fold}|${pool}|${span}`;
      const cell = cells.get(key) ?? { bound: stat(), cell: key, fold, gross: stat(), net: stat(), pool, span };
      for (const arm of ARM_ORDER) {
        const value = values[arm] as number;
        cell[arm].n += 1;
        cell[arm].sum += value;
        cell[arm].sumSq += value * value;
      }
      cells.set(key, cell);
    });
    rows.total += manifest.sealedRows;
    rows.sealed += manifest.sealedRows;
  }
  const ordered = [...cells.values()].sort((a, b) => a.cell.localeCompare(b.cell));

  let control: CellsSummary["control"] = null;
  if (input.controlPath !== undefined) {
    const expected = parseControlTable(readFileSync(input.controlPath, "utf8"));
    if (expected.size === 0) {
      throw new OperatorInputError(`--control ${input.controlPath}: no eight-cell rows found — the control table must carry | fold | pool | span | n | net R | E | lo95 | rows`);
    }
    const failures: string[] = [];
    for (const [key, want] of expected) {
      const got = cells.get(key);
      if (!got) {
        failures.push(`${key}: absent from this read, ${want.n} fills in the record`);
        continue;
      }
      const netR = got.net.sum;
      const e = mean(got.net);
      const lo = lower95(got.net);
      if (got.net.n !== want.n) failures.push(`${key}: n ${got.net.n} vs ${want.n} recorded`);
      if (Math.abs(netR - want.netR) > tolerance(PRINTED.netR)) failures.push(`${key}: net R ${netR.toFixed(1)} vs ${want.netR.toFixed(1)} recorded`);
      if (Math.abs(e - want.e) > tolerance(PRINTED.rate)) failures.push(`${key}: E ${e.toFixed(4)} vs ${want.e.toFixed(4)} recorded`);
      if (Math.abs(lo - want.lo95) > tolerance(PRINTED.rate)) failures.push(`${key}: lo95 ${lo.toFixed(4)} vs ${want.lo95.toFixed(4)} recorded`);
    }
    if (failures.length > 0) {
      throw new OperatorInputError(
        `the net column does not reproduce the control ${input.controlPath} — this instrument has no standing on the open question until it does:\n  ${failures.join("\n  ")}`,
      );
    }
    control = { cellsChecked: expected.size, path: input.controlPath };
  }

  const provenance = [
    `folds read: ${input.folds.join(", ")} · ${SEALED_FOLD}: SEALED, not read (${rows.sealed.toLocaleString()} rows withheld at the door) · variant ${input.variant} · years ${input.years}` +
      (yearMap ? ` (${describeYearMap(yearMap.source, input.witnessTablePath)})` : ""),
    input.includeHoldout
      ? `held-out markets INCLUDED in every pool (--include-holdout): ${holdout.markets.join(", ")}`
      : `${describeHeldOut(holdout, { labels: true, pools: false })} — held-out fills form the held-out cells; nothing is excluded`,
    `span = decision hour ${SPAN_HOURS.first}–${SPAN_HOURS.last} UTC · arms: net = realizedR as emitted (FR-3 zero-latency arming) · gross = grossRealizedR · bound = armingBoundRealizedR (protection arms one bar late)`,
    control
      ? `control: the net column reproduces all ${control.cellsChecked} cells of ${control.path}`
      : "control: none named — with --control <tracked eight-cell table> (contained years, --witness) a read that does not reproduce the record refuses",
  ];
  return { cells: ordered, control, provenance, rows };
}

const signed = (value: number, digits: number): string =>
  Number.isNaN(value) ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

export function formatArmingBoundCells(summary: CellsSummary): string {
  const { rows } = summary;
  const lines: string[] = [];
  lines.push("THE EIGHT FOREX CELLS UNDER THREE CONVENTIONS OF THE SAME FILLS");
  for (const line of summary.provenance) lines.push(`  ${line}`);
  lines.push(
    `rows ${rows.total.toLocaleString()} (${rows.sealed.toLocaleString()} sealed) · not accepted ${rows.notAccepted.toLocaleString()} · other fold ${rows.wrongFold.toLocaleString()} · other variant ${rows.wrongVariant.toLocaleString()} · not forex ${rows.notForex.toLocaleString()} · unfilled ${rows.notFilled.toLocaleString()} · other years ${rows.otherYears.toLocaleString()} · priced ${rows.priced.toLocaleString()}`,
  );
  if (summary.cells.length === 0) {
    lines.push("nothing priced — no forex fill in scope, so no table follows");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("| fold | pool | span | fills | net R | E net | lo95 net | E gross | lo95 gross | E bound | lo95 bound | ΔE bound − net |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const cell of summary.cells) {
    lines.push(
      `| ${cell.fold} | ${cell.pool} | ${cell.span} | ${cell.net.n.toLocaleString()} | ${signed(cell.net.sum, 1)} | ${signed(mean(cell.net), 4)} | ${signed(lower95(cell.net), 4)} | ${signed(mean(cell.gross), 4)} | ${signed(lower95(cell.gross), 4)} | ${signed(mean(cell.bound), 4)} | ${signed(lower95(cell.bound), 4)} | ${signed(mean(cell.bound) - mean(cell.net), 4)} |`,
    );
  }
  const clears = (arm: Arm) => summary.cells.filter((cell) => cell.span === "in" && lower95(cell[arm]) > 0).length;
  const inSpan = summary.cells.filter((cell) => cell.span === "in").length;
  lines.push("");
  lines.push(`in-span cells clearing zero at lo95: net ${clears("net")} of ${inSpan} · gross ${clears("gross")} of ${inSpan} · bound ${clears("bound")} of ${inSpan}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { str } = flagReader(args, VALUE_FLAGS);
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      if (VALUE_FLAGS.has(args[index])) {
        index += 1;
      } else if (!BOOLEAN_FLAGS.has(args[index])) {
        throw new OperatorInputError(`unknown flag ${args[index]}`);
      }
      continue;
    }
    paths.push(args[index]);
  }
  // Read by NAME after the walk, never inferred from membership in it
  // (2026-09-22): a flag dropped from BOOLEAN_FLAGS then leaves this literal
  // read undeclared, which tests/unknownFlagRefused.test.ts refuses. Set by
  // the walk, the dropped flag was refused as unknown and nothing noticed.
  const includeHoldout = args.includes("--include-holdout");
  // WIF-4: a run over zero rows cannot grade a cell, and a header printed
  // under exit 0 reads exactly like a corpus that priced nothing.
  if (paths.length === 0) {
    throw new OperatorInputError(
      "usage: arming-bound-cells.ts <emit.jsonl> [more.jsonl ...] [--control <tracked eight-cell table>] " +
        "[--folds fit,select] [--variant baseline] [--years all|contained|escaping [--witness <feed-character table>]] " +
        "[--include-holdout] — no corpus shard named, so there is nothing to grade; the record's control is " +
        "contained years, so pass --years contained --witness with --control",
    );
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
  const summary = await armingBoundCells({
    controlPath: str("--control") ?? undefined,
    folds,
    includeHoldout,
    paths,
    variant,
    witnessTablePath: str("--witness") ?? undefined,
    years: yearsArg,
  });
  console.log(formatArmingBoundCells(summary));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    if (error instanceof OperatorInputError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
