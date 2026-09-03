// Every offered market, at its TRUE effective configuration, measured
// for absolute expectancy on the SELECT tuning fold.
//
// THE CONFIRM FOLD IS SEALED AT THE DOOR (R4 act 1, 2026-09-02): this reader
// opens the corpus through the sealed door, which withholds the held-back
// fold, and classifies each row by the split the sweep EMITTED against the
// manifest's own fold vocabulary — until then it re-cut folds itself at
// 50%/75% of every market's span and pooled a "confirm" cell no ledger
// recorded. The only confirm figures it may PRINT are the ones the LEDGERED
// READ wrote (R4 act 2): `--ledgered-read <path>` opens that artifact through
// `readLedgeredArtifact`, the one door, bound to the manifest hash of every
// shard read here for select, and prints the shipped cell's NET confirm
// figure verbatim beside each market — the gate's interval, the gate's M3,
// never a rule recomputed here and never a decision taken on it. Without
// the flag the audit judges on select alone and says so. The RECORDED 4d
// reads (`4d-*-confirm-read.json`) still decide which markets own a derived
// cell, and that map is carried as provenance.
//
// THE SHIPPED CELL IS NAMED FROM THE MANIFEST'S GRID (R4 act 2, deliverable
// 5). Every grid cell is named the way the driver names it, with
// `describeOverride`, and the SHAPE of the grid decides how a market is read:
//
//   the EMPTY cell `{}` ("baseline") without the named BASELINE — R3's
//   corpora, and the 2026-08-10 evaluator-repair corpus whose grid is [{}].
//   The empty cell IS every market's shipped configuration at sweep time:
//   the live class calibration plus the market's per-symbol layer, which the
//   manifest records per symbol as `symbols[].symbolOverride`. EVERY market
//   is read there, and the derived map becomes an ANNOTATION beside each
//   market (the tranche and variant its cell was derived from) — never a row
//   filter. Until this rule the derived branch filtered R3's rows to a 4d
//   pick string no R3 cell carries and came back silently empty for 79
//   markets: a wrong number, where the baseline branch at least refused.
//
//   BOTH `{}` and the named BASELINE — the 4c corpus, whose grid[0] is `{}`
//   and grid[1] the threshold-0 reference cell. Two calibrations, so the
//   audit refuses unless `--baseline-cell` names one (ONE CELL, NOT EITHER
//   OF TWO). The earlier comment here claimed no tracked corpus carried the
//   empty cell; 4c and the evaluator-repair corpus both do.
//
//   only the named BASELINE — the 4d-era shape, read as before: a derived
//   market at its own pick cell (threshold 0, the cell sets it) and every
//   other market at the named cell, re-gated at its CLASS confidence
//   threshold, which is what the shipped engine actually gates on.
//
// A swept market whose select rows all sit in OTHER cells while none sits in
// its shipped cell is a REFUSAL that names the market, never a silent
// UNMEASURABLE — that is the exact shape of the silently-empty derived
// branch. A market with no select row in ANY cell (its tuning folds hold
// nothing on this corpus — six markets on R3's per-class corpus) is not
// silent: its verdict stays UNMEASURABLE, its provenance says so, and the
// summary line counts it apart.
//
// The 4d cycles measured the markets that earned derived cells — 79 of the
// 97-market roster, DERIVED from the three picks artifacts. The other 18
// trade on CLASS calibration and were never measured in absolute terms at
// all — the same blind spot that hid fifteen losing markets, one population
// over. This closes it for the roster.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CategoryCalibration,
  ENGINE_DECLINED_MARKETS,
  getCategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  assertManifest,
  assertManifestedCorpusSync,
  SEALED_FOLD,
  tuningFolds,
} from "./sweepStats.ts";
import { flagReader } from "./flagReader.ts";
import {
  type LedgeredReadArtifact,
  readLedgeredArtifact,
  sha256File,
} from "./ledgeredRead.ts";
import { describeOverride } from "./replay-sweep.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";

/** The 4d-era reference cell: 4c's grid[1], threshold 0 so the class gate is re-applied at read time. */
export const BASELINE =
  "confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1";
/** What `describeOverride({})` names the empty grid cell. */
export const EMPTY_CELL = "baseline";
const MIN_FILLED = 30;

export type Acc = { n: number; sum: number; sumSq: number };

/** One fold's interval; every field null under the fill floor. */
export type FoldStats = {
  ci95Lower: number | null;
  ci95Upper: number | null;
  expectancy: number | null;
  n: number;
  se: number | null;
};

function empty(): Acc {
  return { n: 0, sum: 0, sumSq: 0 };
}

export function stats(acc: Acc): FoldStats {
  if (acc.n < MIN_FILLED) {
    return {
      ci95Lower: null,
      ci95Upper: null,
      expectancy: null,
      n: acc.n,
      se: null,
    };
  }
  const expectancy = acc.sum / acc.n;
  const variance = Math.max(
    0,
    (acc.sumSq - acc.sum * acc.sum / acc.n) / (acc.n - 1),
  );
  const se = Math.sqrt(variance / acc.n);
  return {
    ci95Lower: expectancy - 1.96 * se,
    ci95Upper: expectancy + 1.96 * se,
    expectancy,
    n: acc.n,
    se,
  };
}

/**
 * Positional arguments are shard paths; `--flag value` pairs are skipped.
 *
 * An audit that read no shards is not an audit that found nothing. With zero
 * paths every market falls through to "unmeasurable" and the artifact reads
 * like a finished run — the exact silent pass the standard forbids, so this
 * refuses rather than reports (WIF-4, 2026-08-11).
 */
const VALUE_FLAGS = new Set(["--baseline-cell", "--ledgered-read", "--out"]);

export function shardPathsFromArgv(argv: string[]): string[] {
  // POSITIVE membership test (#364 round 50, finding 2): the old form
  // consumed the token after EVERY --flag, so a boolean or typo'd flag
  // ate the shard path following it and the audit ran over a corpus one
  // shard short of the one named — round 44's defect, surfaced here by
  // the derived scan.
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      if (VALUE_FLAGS.has(argv[index])) index += 1;
      continue;
    }
    paths.push(argv[index]);
  }
  if (paths.length === 0) {
    throw new Error(
      "roster-expectancy-audit: no shard paths given. Pass the sweep shards " +
        "explicitly; a run over zero rows cannot report a verdict.",
    );
  }
  return paths;
}

/** A market's derived cell, from the RECORDED confirm reads: which tranche picked which variant. */
export type DerivedCell = { tranche: string; variant: string };

/** The cell this audit reads the roster's shipped configuration at, resolved from a grid. */
export type ShippedCell = {
  /** The cell every non-derived market is read at ("baseline" or the named BASELINE). */
  cell: string;
  /**
   * "empty": the empty cell is every market's shipped configuration; every
   * market is read there and the derived map is an annotation.
   * "named": the 4d-era shape — a derived market at its own pick cell, every
   * other market at `cell`, re-gated at its class threshold.
   */
  mode: "empty" | "named";
  /** Every cell of the grid, named as the driver names it. */
  names: string[];
  /**
   * The cell pins confidenceThreshold=0, so its accepted rows were gated
   * open and the class threshold — what the shipped engine gates on — is
   * re-applied at read time. The empty cell never pins it: the engine
   * already gated its rows at each market's shipped threshold.
   */
  reapplyClassThreshold: boolean;
};

/**
 * Name every grid cell and decide how the roster is read — see the header.
 * `baselineCell` is the operator's `--baseline-cell`, admitted only when it
 * names one of the two shipped-standing cells and the grid carries it.
 */
export function shippedCellOf(
  grid: unknown[],
  baselineCell?: string,
): ShippedCell {
  const names = grid.map((cell) =>
    describeOverride(cell as Partial<CategoryCalibration>)
  );
  const quoted = names.map((name) => `"${name}"`).join(", ");
  const hasEmpty = names.includes(EMPTY_CELL);
  const hasNamed = names.includes(BASELINE);
  let cell: string;
  if (baselineCell !== undefined) {
    if (baselineCell !== EMPTY_CELL && baselineCell !== BASELINE) {
      throw new Error(
        `roster-expectancy-audit: --baseline-cell "${baselineCell}" is neither ` +
          `the empty cell ("${EMPTY_CELL}") nor the named baseline ` +
          `("${BASELINE}"); no other cell stands for the roster's shipped ` +
          `configuration. This corpus's grid: ${quoted}.`,
      );
    }
    if (!names.includes(baselineCell)) {
      throw new Error(
        `roster-expectancy-audit: --baseline-cell "${baselineCell}" names no ` +
          `cell of this corpus's grid (${quoted}).`,
      );
    }
    cell = baselineCell;
  } else if (hasEmpty && hasNamed) {
    throw new Error(
      `roster-expectancy-audit: ONE CELL, NOT EITHER OF TWO. This corpus's ` +
        `grid carries the EMPTY cell ("${EMPTY_CELL}") as well as the named ` +
        `baseline ("${BASELINE}") — the 4c shape. Those are two different ` +
        `calibrations, and pooling them would report one market's ` +
        `expectancy from both. Name which cell this audit should read: ` +
        `--baseline-cell ${EMPTY_CELL} or --baseline-cell "${BASELINE}".`,
    );
  } else if (hasEmpty) {
    cell = EMPTY_CELL;
  } else if (hasNamed) {
    cell = BASELINE;
  } else {
    throw new Error(
      `roster-expectancy-audit: this corpus's grid carries neither the empty ` +
        `cell ("${EMPTY_CELL}") nor the named baseline ("${BASELINE}") — ` +
        `cells: ${quoted}. The roster's shipped configuration is not in it, ` +
        `and no other cell can stand for it.`,
    );
  }
  const override = grid[names.indexOf(cell)] as Partial<CategoryCalibration>;
  const pinned = override.confidenceThreshold;
  if (pinned !== undefined && pinned !== 0) {
    throw new Error(
      `roster-expectancy-audit: cell "${cell}" pins confidenceThreshold=` +
        `${pinned}; its accepted rows were gated at that value rather than ` +
        `at the roster's shipped thresholds, and the shipped population ` +
        `cannot be recovered from it.`,
    );
  }
  return {
    cell,
    mode: cell === EMPTY_CELL ? "empty" : "named",
    names,
    reapplyClassThreshold: pinned === 0,
  };
}

/** A swept market: the cell it was read at, its select-row counts, its per-symbol layer. */
export type SweptMarket = {
  readAtCell: string;
  selectRowsAtCell: number;
  selectRowsInAnyCell: number;
  symbolOverride: Record<string, unknown> | null;
};

/** What the door handed over, by fold, and what it withheld. */
export type CollectedSelect = {
  cell: ShippedCell;
  folds: { fit: string; select: string };
  /** manifestHash of every shard read, in order, deduplicated. */
  manifestHashes: string[];
  rows: { fit: number; sealed: number; select: number };
  select: Map<string, Acc>;
  /**
   * Every market the shards' manifests list — the swept population — with
   * the cell it was read at, its select-row counts, and its per-symbol layer
   * as the manifest records it (provenance for the empty cell).
   */
  swept: Map<string, SweptMarket>;
};

/**
 * The SELECT-fold accumulation per market, read through the sealed door.
 *
 * Rows are classified by the split the SWEEP emitted, against the fold
 * vocabulary the manifest declares (`tuningFolds`: fit/select on a folded
 * corpus, train/test on a legacy one). The fit fold is dropped — this audit
 * judges on select, as it always did — and a split the reader cannot name is
 * refused rather than skipped: a corpus carrying a fold this audit does not
 * know is not a corpus it can report on. Confirm rows never reach the
 * callback; the door withholds them and counts them on the manifest.
 *
 * `derived` names the markets that own a derived cell (from the RECORDED
 * confirm reads), the variant that cell pins and the tranche that picked it.
 * In the named-baseline shape it is a row filter, as it always was; in the
 * empty-cell shape it is provenance only.
 */
export function collect(
  paths: string[],
  derived: Map<string, DerivedCell>,
  options: { baselineCell?: string } = {},
): CollectedSelect {
  const select = new Map<string, Acc>();
  const rows = { fit: 0, sealed: 0, select: 0 };
  const manifestHashes: string[] = [];
  const swept = new Map<string, SweptMarket>();
  const selectRowsByCell = new Map<string, Map<string, number>>();
  const declinedAtSweep = new Set<string>();
  let folds: { fit: string; select: string } | undefined;
  let shipped: ShippedCell | undefined;
  const cellFor = (symbol: string, cell: ShippedCell): string =>
    cell.mode === "named" ? derived.get(symbol)?.variant ?? cell.cell : cell.cell;
  for (const path of paths) {
    // R0: the one-clock door — a corpus that cannot state its clock (or
    // whose witnesses condemn it) is refused here too, not only in the
    // aggregation readers. The manifest half is opened first for its fold
    // vocabulary and its grid, so every row is classified as it streams;
    // the row door below verifies the same manifest again before it hands
    // over a line, which costs one hash and keeps the door the only source
    // of rows.
    const manifest = assertManifest(path);
    const named = tuningFolds(manifest);
    if (folds === undefined) {
      folds = named;
    } else if (folds.fit !== named.fit || folds.select !== named.select) {
      throw new Error(
        `roster-expectancy-audit: ${path} names its tuning folds ` +
          `${named.fit}/${named.select} while the first shard named ` +
          `${folds.fit}/${folds.select} — a legacy two-split shard and a ` +
          `folded one are two measurements and cannot be pooled as one.`,
      );
    }
    const cellHere = shippedCellOf(manifest.grid, options.baselineCell);
    if (shipped === undefined) {
      shipped = cellHere;
    } else if (shipped.names.join(" ") !== cellHere.names.join(" ")) {
      throw new Error(
        `roster-expectancy-audit: ${path} carries grid ` +
          `[${cellHere.names.join(" | ")}] while the first shard carried ` +
          `[${shipped.names.join(" | ")}] — two grids are two measurements ` +
          `and cannot be pooled as one.`,
      );
    }
    const vocabulary = folds;
    const cell = shipped;
    const gridNames = new Set(cell.names);
    if (!manifestHashes.includes(manifest.manifestHash)) {
      manifestHashes.push(manifest.manifestHash);
    }
    for (const declined of manifest.engineDeclined ?? []) declinedAtSweep.add(declined);
    for (const entry of manifest.symbols) {
      if (!swept.has(entry.symbol)) {
        swept.set(entry.symbol, {
          readAtCell: cellFor(entry.symbol, cell),
          selectRowsAtCell: 0,
          selectRowsInAnyCell: 0,
          symbolOverride: entry.symbolOverride ?? null,
        });
      }
    }
    const read = assertManifestedCorpusSync(path, (row) => {
      const symbol = row.symbol;
      if (!symbol) return;
      // Classified by the split the sweep EMITTED, never by where the row's
      // time falls in the span. A fold this reader cannot name is refused,
      // not skipped; the sealed fold never arrives.
      const split = String(row.split);
      if (split === vocabulary.fit) {
        rows.fit += 1;
        return;
      }
      if (split !== vocabulary.select) {
        throw new Error(
          `roster-expectancy-audit: ${path}: ${symbol} carries a row in split ` +
            `"${split}", which this reader does not know. It reads the ` +
            `"${vocabulary.select}" fold and drops "${vocabulary.fit}"; the ` +
            `"${SEALED_FOLD}" fold is sealed at the door. A fold this audit ` +
            `cannot name is refused, not skipped.`,
        );
      }
      rows.select += 1;
      const variant = typeof row.variant === "string" ? row.variant : EMPTY_CELL;
      // A cell the manifest's grid does not name is refused the way an
      // unknown split is: a row from it is not a row this audit can place,
      // and skipping it would shrink a market's measurement in silence.
      if (!gridNames.has(variant)) {
        throw new Error(
          `roster-expectancy-audit: ${path}: ${symbol} carries a select row ` +
            `in cell "${variant}", which this corpus's grid does not name ` +
            `(${cell.names.map((name) => `"${name}"`).join(", ")}). A cell the ` +
            `manifest does not declare is refused, not skipped.`,
        );
      }
      let byCell = selectRowsByCell.get(symbol);
      if (!byCell) {
        byCell = new Map();
        selectRowsByCell.set(symbol, byCell);
      }
      byCell.set(variant, (byCell.get(variant) ?? 0) + 1);
      // ONE CELL PER MARKET. In the empty-cell shape that is the empty cell
      // for everyone — the shipped configuration, per-symbol layer included,
      // with the engine's own gate already in `accepted`. In the named shape
      // a derived market is read at its own cell and every other market at
      // the named baseline, gated by its CLASS threshold — which is what the
      // shipped engine does.
      //
      // VERIFIED 2026-08-31, because the claim reads like the kind that rots.
      // For all 18 markets that reach the named branch, the named baseline
      // cell IS their shipped geometry: `maxStopAtrMultiplier` 1,
      // `sizingHoursFactor` 1, and `runnerProtection` undefined — which
      // `replay.ts` resolves to "breakeven" via `?? "breakeven"`, the cell's
      // value. `confidenceThreshold` differs (cell 0, shipped 25/40/68) and
      // that is exactly why the class threshold is re-applied below rather
      // than inherited from the cell. Judge the branch on the population
      // that reaches it: measured across all 97 markets, ZERO match this
      // cell — the 79 derived markets ship 4x stops and trail_tp1.
      if (variant !== cellFor(symbol, cell)) return;
      if (cell.mode === "named" && cell.reapplyClassThreshold && !derived.has(symbol)) {
        const threshold = getCategoryCalibration(symbol).confidenceThreshold;
        const score = Number(row.confidenceScore);
        if (!Number.isFinite(score) || score < threshold) return;
      }
      if (row.accepted !== true || row.outcome === "unfilled") return;
      const r = Number(row.realizedR);
      if (!Number.isFinite(r)) return;
      let acc = select.get(symbol);
      if (!acc) {
        acc = empty();
        select.set(symbol, acc);
      }
      acc.n += 1;
      acc.sum += r;
      acc.sumSq += r * r;
    });
    rows.sealed += read.sealedRows;
  }
  if (folds === undefined || shipped === undefined) {
    throw new Error(
      "roster-expectancy-audit: collect() was given no shard paths — a run " +
        "over zero rows cannot report a verdict.",
    );
  }
  // THE SILENT SHAPE, REFUSED: a swept market whose select rows all sit in
  // other cells while its shipped cell has none is a market this audit is
  // reading at the wrong cell — the R3 derived-branch defect exactly — and
  // it would otherwise print as UNMEASURABLE n=0. A market with no select
  // row in ANY cell is starved on this corpus, not misread; it stays
  // UNMEASURABLE and says why in its provenance.
  const misread: string[] = [];
  for (const [symbol, entry] of [...swept].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const byCell = selectRowsByCell.get(symbol);
    entry.selectRowsAtCell = byCell?.get(entry.readAtCell) ?? 0;
    entry.selectRowsInAnyCell = byCell
      ? [...byCell.values()].reduce((total, count) => total + count, 0)
      : 0;
    if (symbol in ENGINE_DECLINED_MARKETS || declinedAtSweep.has(symbol)) continue;
    if (entry.selectRowsAtCell === 0 && entry.selectRowsInAnyCell > 0) {
      misread.push(
        `${symbol} at "${entry.readAtCell}" (its select rows: ` +
          `${[...byCell!].map(([name, count]) => `${name}=${count}`).join(", ")})`,
      );
    }
  }
  if (misread.length > 0) {
    throw new Error(
      `roster-expectancy-audit: ${misread.length} swept market(s) carry ` +
        `select rows in other cells and ZERO at the cell this audit reads ` +
        `them at — a market read at a cell it did not run is a refusal, ` +
        `never a silent UNMEASURABLE: ${misread.join("; ")}.`,
    );
  }
  return { cell: shipped, folds, manifestHashes, rows, select, swept };
}

export type Tally = {
  declined: number;
  measurablyNegative: number;
  measurablyPositive: number;
  unmeasurable: number;
  zeroSpanning: number;
};

/**
 * The verdict, from the SELECT fold's interval — the thresholds the confirm
 * cell carried until the door sealed it: measurably negative when the upper
 * bound sits below zero, measurably positive when the lower bound clears it,
 * zero-spanning between, and unmeasurable under the fill floor.
 */
export function verdictFor(
  select: FoldStats,
  isDeclined: boolean,
): { key: keyof Tally; verdict: string } {
  if (isDeclined) {
    return {
      key: "declined",
      verdict: "DECLINED — the engine already refuses this market",
    };
  }
  if (
    select.expectancy === null || select.ci95Upper === null ||
    select.ci95Lower === null
  ) {
    return {
      key: "unmeasurable",
      verdict: select.n === 0
        ? "UNMEASURABLE — no row in any tuning fold (every decision sits in the sealed fold)"
        : "UNMEASURABLE — under the fill floor at its shipped settings",
    };
  }
  if (select.ci95Upper < 0) {
    return {
      key: "measurablyNegative",
      verdict:
        "MEASURABLY NEGATIVE — loses beyond its own error, and the engine still trades it",
    };
  }
  if (select.ci95Lower > 0) {
    return { key: "measurablyPositive", verdict: "MEASURABLY POSITIVE" };
  }
  return {
    key: "zeroSpanning",
    verdict: "ZERO-SPANNING — no measured edge, no measured loss",
  };
}

/** The RECORDED 4d reads: which markets own a derived cell, which variant, which tranche. */
export function derivedFromRecordedReads(picksDir: string): Map<string, DerivedCell> {
  const derived = new Map<string, DerivedCell>();
  for (
    const [tranche, picksFile, confirmFile] of [
      ["4d", "4d-final-picks.json", "4d-confirm-read.json"],
      ["4d-holdout", "4d-holdout-final-picks.json", "4d-holdout-confirm-read.json"],
      ["4d-totality", "4d-totality-final-picks.json", "4d-totality-confirm-read.json"],
    ]
  ) {
    const picks = JSON.parse(
      readFileSync(`${picksDir}/${picksFile}`, "utf8"),
    ) as { finalPicks: Record<string, { variant: string }> };
    const confirmed = JSON.parse(
      readFileSync(`${picksDir}/${confirmFile}`, "utf8"),
    ) as {
      confirmReport: Record<string, { confirmTotalDelta: number | null }>;
    };
    for (const [symbol, row] of Object.entries(confirmed.confirmReport)) {
      if ((row.confirmTotalDelta ?? 0) > 0) {
        derived.set(symbol, { tranche, variant: picks.finalPicks[symbol].variant });
      }
    }
  }
  return derived;
}

/**
 * Open the ledgered read through the one door, once per shard read for
 * select: every manifest hash must be among the read's shards, or the figure
 * does not belong to this corpus. Returns the artifact, verbatim.
 */
/** One shard's binding: its manifest hash and the sha256 of its emit bytes. */
export type ShardBinding = { emitSha256: string; manifestHash: string };

export async function bindShards(paths: readonly string[]): Promise<ShardBinding[]> {
  return Promise.all(
    paths.map(async (path) => ({ emitSha256: await sha256File(path), manifestHash: assertManifest(path).manifestHash })),
  );
}

export function openLedgeredRead(
  path: string,
  bindings: readonly ShardBinding[],
): LedgeredReadArtifact {
  let artifact: LedgeredReadArtifact | undefined;
  // Every shard binds the artifact by manifest hash AND by the bytes it
  // read: a manifest hash covers the manifest's payload only, so an edited
  // emit under an untouched manifest would pass the door without the digest.
  for (const binding of bindings) {
    artifact = readLedgeredArtifact(path, binding);
  }
  if (artifact === undefined) {
    throw new Error(
      `roster-expectancy-audit: no shard manifest to bind ${path} to — a ` +
        `ledgered read travels only with the corpus it was read from.`,
    );
  }
  return artifact;
}

/** The ledgered read's shipped-cell NET figure per market, verbatim, under keys that name the source. */
export type LedgeredNetRow = {
  confirmNetExpectancy: number | null;
  confirmNetLower: number | null;
  confirmNetN: number | null;
  confirmNetUpper: number | null;
  heldBack: boolean;
  m3: string;
  variant: string;
};

export function ledgeredBlockOf(read: LedgeredReadArtifact, path: string) {
  const shipped: Record<string, LedgeredNetRow> = {};
  for (const symbol of Object.keys(read.markets).sort()) {
    const cell = read.markets[symbol].shipped;
    const net = cell.confirm.net;
    shipped[symbol] = {
      confirmNetExpectancy: net?.expectancy ?? null,
      confirmNetLower: net?.lower ?? null,
      confirmNetN: net?.n ?? null,
      confirmNetUpper: net?.upper ?? null,
      heldBack: cell.provenance.heldBack,
      m3: cell.m3,
      variant: cell.variant,
    };
  }
  return {
    artifactHash: read.artifactHash,
    calendarKey: read.calendarKey,
    interval: `gate's t-interval, from the ledgered read ${read.readId}`,
    path,
    readAt: read.readAt,
    readId: read.readId,
    shipped,
    verdictUnit: read.verdictUnit,
  };
}

const signed = (value: number | null): string =>
  value === null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(4)}`;

async function main() {
  const argv = process.argv.slice(2);
  const paths = shardPathsFromArgv(argv);
  const { str } = flagReader(argv, VALUE_FLAGS);
  const outPath = str("--out") ??
    "docs/research/baseline-2026-08-10/roster-expectancy-audit.json";
  const baselineCell = str("--baseline-cell");
  const ledgeredPath = str("--ledgered-read");
  const picksDir = "docs/research/baseline-2026-08-10";

  // Which markets carry a derived cell, and which variant — from the
  // RECORDED confirm reads, the only 4d confirm figures this audit may use.
  const derived = derivedFromRecordedReads(picksDir);

  const { cell, folds, rows, select, swept } = collect(
    paths,
    derived,
    { baselineCell },
  );

  // VALIDATED BEFORE ANYTHING IS WRITTEN: the ledgered read is opened
  // against every shard's manifest hash, and a refusal here leaves no
  // artifact behind that reads like a run with confirm figures.
  const ledgeredResolved = ledgeredPath === undefined ? null : resolve(ledgeredPath);
  const ledgeredRead = ledgeredResolved === null
    ? null
    : ledgeredBlockOf(openLedgeredRead(ledgeredResolved, await bindShards(paths)), ledgeredResolved);

  const report: Record<string, unknown> = {};
  const tally: Tally = {
    declined: 0,
    measurablyNegative: 0,
    measurablyPositive: 0,
    unmeasurable: 0,
    zeroSpanning: 0,
  };
  let notSwept = 0;
  let noSelectRow = 0;
  for (const symbol of [...defaultScanSymbols].sort()) {
    const fold = stats(select.get(symbol) ?? empty());
    const { key, verdict } = verdictFor(fold, symbol in ENGINE_DECLINED_MARKETS);
    tally[key] += 1;
    const sweptEntry = swept.get(symbol);
    const derivedCell = derived.get(symbol) ?? null;
    if (key === "unmeasurable") {
      if (sweptEntry === undefined) notSwept += 1;
      else if (sweptEntry.selectRowsInAnyCell === 0) noSelectRow += 1;
    }
    // Every figure carries its fold in its name, so a reader of the JSON
    // cannot take a select interval for a confirm one. The cell each market
    // was read at, and where its shipped layer came from, ride beside the
    // figures as provenance — an object, so no figure hides in it.
    report[symbol] = {
      confidenceThreshold: getCategoryCalibration(symbol).confidenceThreshold,
      configuration: cell.mode === "empty"
        ? `${EMPTY_CELL} — the shipped configuration at sweep time (class calibration + per-symbol layer)`
        : derivedCell?.variant ?? "class calibration (no derived cell)",
      provenance: {
        derivedCell,
        readAtCell: sweptEntry?.readAtCell ?? null,
        selectRowsAtCell: sweptEntry?.selectRowsAtCell ?? 0,
        selectRowsInAnyCell: sweptEntry?.selectRowsInAnyCell ?? 0,
        swept: sweptEntry !== undefined,
        symbolOverride: sweptEntry?.symbolOverride ?? null,
      },
      selectCi95Lower: fold.ci95Lower,
      selectCi95Upper: fold.ci95Upper,
      selectExpectancy: fold.expectancy,
      selectN: fold.n,
      selectSe: fold.se,
      verdict,
    };
  }

  writeResearchArtifact(outPath, {
    cell: { grid: cell.names, mode: cell.mode, readAtCell: cell.cell },
    confirmSource: ledgeredRead === null
      ? "no ledgered read given — select only"
      : `ledgered read ${ledgeredRead.readId} at ${ledgeredRead.path}`,
    folds: { dropped: folds.fit, judgedOn: folds.select, sealed: SEALED_FOLD },
    ledgeredRead,
    report,
    rows,
    tally,
  });
  console.log(
    `shipped cell "${cell.cell}" (${
      cell.mode === "empty"
        ? "the empty cell — every market read at its sweep-time configuration; derived cells annotated"
        : "the named baseline — derived markets at their pick cells, others re-gated at the class threshold"
    }); grid: ${cell.names.join(" | ")}`,
  );
  console.log(
    `roster expectancy on the ${folds.select} fold ` +
      `(${rows.sealed} ${SEALED_FOLD} rows withheld at the door): ` +
      `${tally.measurablyPositive} positive, ` +
      `${tally.zeroSpanning} zero-spanning, ` +
      `${tally.measurablyNegative} MEASURABLY NEGATIVE AND STILL TRADED, ` +
      `${tally.declined} already declined, ${tally.unmeasurable} unmeasurable ` +
      `(${notSwept} not in this corpus, ${noSelectRow} with no select row in any cell) -> ${outPath}`,
  );
  if (ledgeredRead === null) {
    console.log("no ledgered read given — select only");
    return;
  }
  console.log(
    `ledgered read ${ledgeredRead.readId} (${ledgeredRead.readAt}, calendar ` +
      `${ledgeredRead.calendarKey.slice(0, 12)}, artifact ${ledgeredRead.artifactHash.slice(0, 12)}): ` +
      `the shipped cell's NET confirm figure per market, verbatim`,
  );
  for (const [symbol, row] of Object.entries(ledgeredRead.shipped)) {
    console.log(
      `  ${symbol.padEnd(9)} ${row.variant}  confirm net E ${signed(row.confirmNetExpectancy)} ` +
        `[${signed(row.confirmNetLower)}, ${signed(row.confirmNetUpper)}] n=${row.confirmNetN ?? 0}  ` +
        `heldBack=${row.heldBack}  M3=${row.m3} (${ledgeredRead.interval})`,
    );
  }
  const absent = [...defaultScanSymbols]
    .filter((symbol) => !(symbol in ledgeredRead.shipped))
    .sort();
  if (absent.length > 0) {
    console.log(
      `  ${absent.length} roster market(s) not in the ledgered read: ${absent.join(", ")}`,
    );
  }
}

// Self-execute only as the entrypoint (the grid-totalr idiom). An ESM body
// runs on import, so a bare `main()` call here made the module untestable —
// importing it ran the whole audit.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
