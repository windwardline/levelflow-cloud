// Every offered market, at its TRUE effective configuration, measured
// for absolute expectancy on the SELECT tuning fold.
//
// THE CONFIRM FOLD IS SEALED AT THE DOOR (R4 act 1, 2026-09-02): this reader
// opens the corpus through the sealed door, which withholds the held-back
// fold, and classifies each row by the split the sweep EMITTED against the
// manifest's own fold vocabulary — until then it re-cut folds itself at
// 50%/75% of every market's span and pooled a "confirm" cell no ledger
// recorded. The only confirm figures it may carry are the RECORDED reads
// (`4d-*-confirm-read.json`), which decide which markets own a derived cell.
//
// The 4d cycles measured the markets that earned derived cells — 79 of the
// 97-market roster, DERIVED from the three picks artifacts rather than the
// 72 this comment used to state. The other 18 trade on CLASS calibration and
// were never measured in absolute terms at all — the same blind spot that hid
// fifteen losing markets, one population over. This closes it for the roster.
//
// The effective configuration of a market is:
//   derived cell  -> its variant, threshold 0 (the cell sets it)
//   no cell       -> the grid's baseline variant, filtered to the
//                    market's CLASS confidence threshold, which is what
//                    the shipped engine actually gates on
// Both are reads of the SAME capture-all corpus: every decision is
// present with its score, so a threshold is a filter, not a new
// assumption.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
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
import { writeResearchArtifact } from "./researchArtifact.ts";

export const BASELINE =
  "confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1";
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
const VALUE_FLAGS = new Set(["--out"]);

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

/** What the door handed over, by fold, and what it withheld. */
export type CollectedSelect = {
  folds: { fit: string; select: string };
  rows: { fit: number; sealed: number; select: number };
  select: Map<string, Acc>;
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
 * confirm reads) and the variant that cell pins.
 */
export function collect(
  paths: string[],
  derived: Map<string, string>,
): CollectedSelect {
  const select = new Map<string, Acc>();
  const rows = { fit: 0, sealed: 0, select: 0 };
  let folds: { fit: string; select: string } | undefined;
  for (const path of paths) {
    // R0: the one-clock door — a corpus that cannot state its clock (or
    // whose witnesses condemn it) is refused here too, not only in the
    // aggregation readers. The manifest half is opened first for its fold
    // vocabulary, so every row is classified as it streams; the row door
    // below verifies the same manifest again before it hands over a line,
    // which costs one hash and keeps the door the only source of rows.
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
    const vocabulary = folds;
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
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      const cell = derived.get(symbol);
      // A derived market is read at its own cell; every other market is
      // read at the grid baseline, gated by its CLASS threshold — which
      // is what the shipped engine does.
      //
      // VERIFIED 2026-08-31, because the claim reads like the kind that rots.
      // For all 18 markets that actually reach this branch, the named
      // baseline cell IS their shipped geometry: `maxStopAtrMultiplier` 1,
      // `sizingHoursFactor` 1, and `runnerProtection` undefined — which
      // `replay.ts` resolves to "breakeven" via `?? "breakeven"`, the cell's
      // value. `confidenceThreshold` differs (cell 0, shipped 25/40/68) and
      // that is exactly why the class threshold is re-applied three lines
      // down rather than inherited from the cell.
      //
      // The check is worth stating because the OBVIOUS way to test it is
      // wrong: measured across all 97 markets, ZERO match this cell — the 79
      // derived markets ship 4x stops and trail_tp1 and never reach here.
      // Judge the branch on the population that reaches it.
      if (cell !== undefined) {
        if (variant !== cell) return;
      } else {
        // ONE CELL, NOT EITHER OF TWO. `BASELINE` is a named grid cell;
        // `"baseline"` is what `describeOverride({})` emits for an EMPTY
        // override, which is a DIFFERENT cell. Admitting both with `||` would
        // pool two calibrations into one market's expectancy the day a grid
        // included the empty cell — and no tracked corpus does today (all 25
        // distinct cells across `sweeps/**` carry explicit overrides), so the
        // second arm has never fired and its hazard has never shown.
        //
        // Refused rather than silently accepted: pooling two cells is a wrong
        // number, and §19e prefers the refusal.
        if (variant === "baseline") {
          throw new Error(
            `roster-expectancy-audit: ${symbol} carries a row from the EMPTY ` +
              `grid cell ("baseline") as well as the named baseline ` +
              `("${BASELINE}"). Those are two different calibrations and ` +
              `pooling them would report one market's expectancy from both. ` +
              `Name which cell this audit should read.`,
          );
        }
        if (variant !== BASELINE) return;
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
  if (folds === undefined) {
    throw new Error(
      "roster-expectancy-audit: collect() was given no shard paths — a run " +
        "over zero rows cannot report a verdict.",
    );
  }
  return { folds, rows, select };
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
      verdict: "UNMEASURABLE — under the fill floor at its shipped settings",
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

async function main() {
  const argv = process.argv.slice(2);
  const paths = shardPathsFromArgv(argv);
  const { str } = flagReader(argv, VALUE_FLAGS);
  const outPath = str("--out") ??
    "docs/research/baseline-2026-08-10/roster-expectancy-audit.json";
  const picksDir = "docs/research/baseline-2026-08-10";

  // Which markets carry a derived cell, and which variant — from the
  // RECORDED confirm reads, the only confirm figures this audit may use.
  const derived = new Map<string, string>();
  for (
    const [picksFile, confirmFile] of [
      ["4d-final-picks.json", "4d-confirm-read.json"],
      ["4d-holdout-final-picks.json", "4d-holdout-confirm-read.json"],
      ["4d-totality-final-picks.json", "4d-totality-confirm-read.json"],
    ]
  ) {
    const picks = JSON.parse(
      readFileSync(`${picksDir}/${picksFile}`, "utf8"),
    ) as { finalPicks: Record<string, { variant: string }> };
    const confirm = JSON.parse(
      readFileSync(`${picksDir}/${confirmFile}`, "utf8"),
    ) as {
      confirmReport: Record<string, { confirmTotalDelta: number | null }>;
    };
    for (const [symbol, row] of Object.entries(confirm.confirmReport)) {
      if ((row.confirmTotalDelta ?? 0) > 0) {
        derived.set(symbol, picks.finalPicks[symbol].variant);
      }
    }
  }

  const { folds, rows, select } = collect(paths, derived);

  const report: Record<string, unknown> = {};
  const tally: Tally = {
    declined: 0,
    measurablyNegative: 0,
    measurablyPositive: 0,
    unmeasurable: 0,
    zeroSpanning: 0,
  };
  for (const symbol of [...defaultScanSymbols].sort()) {
    const fold = stats(select.get(symbol) ?? empty());
    const { key, verdict } = verdictFor(fold, symbol in ENGINE_DECLINED_MARKETS);
    tally[key] += 1;
    // Every figure carries its fold in its name, so a reader of the JSON
    // cannot take a select interval for a confirm one.
    report[symbol] = {
      confidenceThreshold: getCategoryCalibration(symbol).confidenceThreshold,
      configuration: derived.get(symbol) ?? "class calibration (no derived cell)",
      selectCi95Lower: fold.ci95Lower,
      selectCi95Upper: fold.ci95Upper,
      selectExpectancy: fold.expectancy,
      selectN: fold.n,
      selectSe: fold.se,
      verdict,
    };
  }

  writeResearchArtifact(outPath, {
    folds: { dropped: folds.fit, judgedOn: folds.select, sealed: SEALED_FOLD },
    report,
    rows,
    tally,
  });
  console.log(
    `roster expectancy on the ${folds.select} fold ` +
      `(${rows.sealed} ${SEALED_FOLD} rows withheld at the door): ` +
      `${tally.measurablyPositive} positive, ` +
      `${tally.zeroSpanning} zero-spanning, ` +
      `${tally.measurablyNegative} MEASURABLY NEGATIVE AND STILL TRADED, ` +
      `${tally.declined} already declined, ${tally.unmeasurable} unmeasurable -> ${outPath}`,
  );
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
