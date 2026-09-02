// THE MECHANISM WORKS SINCE M5 (2026-08-31), AND DID NOT BEFORE IT.
//
// `LEVELFLOW_MODELED_COST_SCALE` used to scale `estimatedRoundTripCost` alone,
// which the replay resolver never reads. Fills took `estimatedSpread` and
// `estimatedSlippage` straight, and realized R charged commission through
// `perLegCost`, so the "gross" corpus charged the SAME costs as the net one:
// setting the scale to 0 removed nothing from the R accounting and only
// loosened the payoff gate, admitting more setups. Eleven of twenty rows came
// back bit-identical — proof the switch did nothing, read at the time as
// agreement between the arms.
//
// M5 routed the scale through `resolverCostOptions`, the single mapping both
// the sweep and the live bridge now use. The INERT door below is the other
// half of that repair and the half that outlives it: a market whose two arms
// produce IDENTICAL sufficient statistics has not been measured, and this
// script now says so instead of computing a verdict over a switch that did
// nothing. Any future re-break of the wiring lands there rather than in an
// artifact that reads like agreement.
//
// Does a market's negative verdict survive charging ONLY the venue's
// published bill? (Owner standard 2026-08-11: no withdrawal on a flawed
// parameter of our own making.)
//
// Reads two corpora of the SAME markets and cells:
//   net   — the shipped engine (published commission + our modeled
//           spread and slippage)
//   gross — LEVELFLOW_MODELED_COST_SCALE=0 (published commission only)
// and computes each market's SELECT-fold expectancy, every row classified
// by the split the sweep stamped on it, so the two are apples-to-apples.
//
// THE CONFIRM FOLD IS SEALED (R4 act 1, 2026-09-02). Until then this script
// re-cut the folds itself at 50/75% of each market's span and decided its
// verdict on the last quarter — a confirm read that no ledger recorded, one
// of the twelve the audit found. The door now withholds confirm rows by
// default and this reader never asks for them: a verdict here is a
// SELECTION on the tuning folds (fit/select, or train/test on a legacy
// corpus — `tuningFolds`), and confirmation belongs to the one ledgered
// read, grid-totalr --confirm-final.
//
// The verdict rule:
//   gross select E <= 0  -> genuinely data-negative. Withdrawal is
//                           defensible: even at the venue's own
//                           published bill the market loses.
//   gross select E  > 0  -> the negative rests on OUR modeled cost.
//                           DO NOT withdraw; disclose the sensitivity.
import {
  assertManifest,
  assertManifestedCorpusSync,
  SEALED_FOLD,
  tuningFolds,
} from "./sweepStats.ts";
import { flagReader } from "./flagReader.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";

type Acc = {
  selectN: number;
  selectSum: number;
  selectSumSq: number;
};

type Collected = { acc: Map<string, Acc>; sealedRows: number };

/**
 * Single streaming pass, scalars only — the corpora are tens of GB and
 * an array of rows per market is what OOMed the first attempt. Rows are
 * classified by the split the sweep stamped on them, in the corpus's own
 * fold vocabulary; the fold edges are the emitter's, never re-cut here,
 * and so is containment — a decision whose review window would cross a
 * fold edge is the emitter's `decisionEndMs` law, so `exitAtMs` is no
 * longer read.
 */
function collect(
  paths: string[],
  cells: Map<string, string>,
  /**
   * Which R column to accumulate. `realizedR` is the net arm; `grossRealizedR`
   * is the PAIRED gross twin every row has carried since item 5 — the same
   * decision re-resolved at the published bill alone.
   */
  column: "grossRealizedR" | "realizedR" = "realizedR",
): Collected {
  const acc = new Map<string, Acc>();
  let sealedRows = 0;
  for (const path of paths) {
    // R0: the one-clock door — a corpus that cannot state its clock (or
    // whose witnesses condemn it) is refused here too, not only in the
    // aggregation readers. These five scripts produced the invalidated
    // 4d-era figures by reading emits bare. The manifest half comes FIRST
    // because the fold vocabulary must be known before the first row is
    // classified; the row door verifies it again and seals the confirm fold.
    const corpusManifest = assertManifest(path);
    const folds = tuningFolds(corpusManifest);
    const manifest = assertManifestedCorpusSync(path, (row) => {
      const symbol = row.symbol;
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      if (!symbol || cells.get(symbol) !== variant) return;
      // Classified BEFORE the acceptance and fill filters: a judged market's
      // row in a fold this reader cannot name is a corpus it does not
      // understand, whatever the row's outcome.
      const split = String(row.split);
      if (split === folds.fit) return;
      if (split !== folds.select) {
        throw new Error(
          `${path}: ${symbol} row carries split "${split}" — this corpus ` +
            `names "${folds.fit}" and "${folds.select}" as its tuning folds ` +
            `and the door seals "${SEALED_FOLD}"; a fold this reader cannot ` +
            `name is refused, not pooled`,
        );
      }
      if (row.accepted !== true || row.outcome === "unfilled") return;
      const r = Number(row[column]);
      if (!Number.isFinite(r)) return;
      let cell = acc.get(symbol);
      if (!cell) {
        cell = { selectN: 0, selectSum: 0, selectSumSq: 0 };
        acc.set(symbol, cell);
      }
      cell.selectSum += r;
      cell.selectSumSq += r * r;
      cell.selectN += 1;
    });
    sealedRows += manifest.sealedRows;
  }
  return { acc, sealedRows };
}

/**
 * Did the cost model move ANYTHING on this market?
 *
 * Compared on the sufficient statistics rather than row by row, because the
 * corpora are tens of GB and these three scalars are what every figure in the
 * artifact is computed from. If they agree, every derived number agrees, and
 * the arms are indistinguishable no matter how the rows are ordered.
 *
 * EXACT equality, not a tolerance. The question is "did the switch do
 * anything", and a tolerance would answer "not much" — which is precisely the
 * reading that let eleven bit-identical rows pass as agreement in the
 * 2026-08-11 run. A real difference of one ULP is still a real difference,
 * and the select interval downstream is what decides whether it matters.
 */
function identical(a: Acc | undefined, b: Acc | undefined): boolean {
  if (!a || !b) return false;
  return a.selectN === b.selectN && a.selectSum === b.selectSum &&
    a.selectSumSq === b.selectSumSq;
}

function read(acc: Acc | undefined) {
  if (!acc) {
    return {
      select: null,
      selectCiUpper: null,
      selectN: 0,
      selectSe: null,
    };
  }
  const select = acc.selectN >= 30 ? acc.selectSum / acc.selectN : null;
  // Declining a market is as consequential as accepting one and earns
  // the same evidentiary bar: the loss must be distinguishable from
  // zero. A market at -0.004R on 54 fills is not a measured loss, it is
  // a measurement of nothing, and amendment 36 forbids acting on that in
  // EITHER direction.
  let selectSe: number | null = null;
  let selectCiUpper: number | null = null;
  if (select !== null && acc.selectN > 1) {
    const variance = Math.max(
      0,
      (acc.selectSumSq - acc.selectSum * acc.selectSum / acc.selectN) /
        (acc.selectN - 1),
    );
    selectSe = Math.sqrt(variance / acc.selectN);
    selectCiUpper = select + 1.96 * selectSe;
  }
  return {
    select,
    selectCiUpper,
    selectN: acc.selectN,
    selectSe,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const VALUE_FLAGS = new Set([
    "--net",
    "--gross",
    "--paired",
    "--cells",
    "--out",
  ]);
  const { str } = flagReader(argv, VALUE_FLAGS);
  // ONE CORPUS, BOTH ARMS (item 5). Every emitted row carries
  // `grossRealizedR` beside `realizedR` — the same decision re-resolved at the
  // published bill alone — so the comparison no longer needs two sweeps.
  //
  // PAIRED IS THE BETTER INSTRUMENT, not merely the cheaper one. Two separate
  // runs also move the payoff GATE, so their accepted populations differ and
  // the comparison confounds cost with selection — systematically, since a
  // looser gate admits MARGINAL setups and drags the gross arm down. Here the
  // decision set is identical by construction.
  //
  // `--net`/`--gross` stay for the historical two-corpus artifacts, which
  // cannot be re-derived: their emits are gone and their corpus is the one the
  // clock defect invalidated.
  const pairedPaths = (str("--paired") ?? "").split(",").filter(Boolean);
  const netPaths = pairedPaths.length > 0
    ? pairedPaths
    : (str("--net") ?? "").split(",").filter(Boolean);
  const grossPaths = pairedPaths.length > 0
    ? pairedPaths
    : (str("--gross") ?? "").split(",").filter(Boolean);
  const cells = new Map<string, string>();
  for (const pair of (str("--cells") ?? "").split(";")) {
    const [symbol, variant] = pair.split("|");
    if (symbol && variant) cells.set(symbol.trim(), variant.trim());
  }
  const outPath = str("--out") ??
    "docs/research/baseline-2026-08-10/4d-cost-sensitivity.json";

  // A run over zero rows cannot report a verdict — WIF-4, the law
  // roster-expectancy-audit states at its own door and this file had no
  // form of (#364 round 53, finding 2). All three inputs default to the
  // empty string and are then split, so any one of them omitted produced
  // a complete-looking artifact — verdicts {}, summary all zeros, and a
  // summary line reading "0 data-negative … 0 cost-dependent" — over a
  // corpus nobody opened. The three are named separately because they
  // fail for different reasons: a missed --gross is the arm this whole
  // comparison exists for, and its absence would otherwise read as
  // agreement between two corpora only one of which was supplied.
  // (This script's MECHANISM is known broken — see the banner at the top
  // — so nothing it writes is evidence either way. The refusals are here
  // because a broken instrument that also cannot say it read nothing is
  // two defects, and the second one outlives the first: whatever repairs
  // the wiring inherits these doors.)
  for (
    const [flag, paths] of [
      ["--net", netPaths],
      ["--gross", grossPaths],
    ] as const
  ) {
    if (paths.length === 0) {
      throw new Error(
        `cost-sensitivity-verdict: ${flag} named no shard. Both arms are ` +
          `read and compared, so a missing one cannot be reported as a ` +
          `verdict. Pass --paired shard-a.jsonl,shard-b.jsonl for a corpus ` +
          `carrying both arms per row (every corpus since item 5), or ` +
          `${flag} for the historical two-corpus artifacts.`,
      );
    }
  }
  if (cells.size === 0) {
    throw new Error(
      "cost-sensitivity-verdict: --cells named no (symbol|variant) cell. " +
        "The verdict loop walks this map, so an empty one reads both " +
        "corpora and judges nothing; pass --cells SYM|variant;… .",
    );
  }

  // The same symbols were swept both times and every row carries the split
  // the sweep stamped on it, so the folds land identically by construction.
  const net = collect(netPaths, cells);
  // In paired mode both arms come from the SAME rows, differing only in which
  // R column is read — which is what makes the INERT door below exact rather
  // than approximate.
  const gross = collect(
    grossPaths,
    cells,
    pairedPaths.length > 0 ? "grossRealizedR" : "realizedR",
  );

  const verdicts: Record<string, unknown> = {};
  let withdrawable = 0, costDependent = 0, unreadable = 0, indistinguishable = 0;
  let inert = 0;
  for (const symbol of [...cells.keys()].sort()) {
    const netAcc = net.acc.get(symbol);
    const grossAcc = gross.acc.get(symbol);
    const n = read(netAcc);
    const g = read(grossAcc);
    let verdict: string;
    if (g.select === null) {
      verdict = "unreadable — the gross run has no select sample";
      unreadable += 1;
    } else if (identical(netAcc, grossAcc)) {
      // THE M5 DOOR. Checked after `unreadable` on purpose: two empty
      // accumulators are trivially identical, and calling that an inert cost
      // model would blame the instrument for what is simply no data. Reaching
      // here means there IS a select sample and the two arms agree on every
      // sufficient statistic to the bit — so the cost model moved nothing on
      // this market and there is no sensitivity to report.
      //
      // Legitimate when a market's modelled spread and slippage are already
      // zero; a defect when the scale has stopped reaching the resolver. The
      // verdict is the same either way, because the two are indistinguishable
      // from here and both mean the comparison cannot decide anything.
      verdict =
        "COST MODEL INERT — both arms produced identical statistics; no comparison exists, no decision";
      inert += 1;
    } else if (g.select > 0) {
      verdict = "COST-DEPENDENT — positive at the published bill alone; DO NOT withdraw";
      costDependent += 1;
    } else if (g.selectCiUpper === null || g.selectCiUpper >= 0) {
      // Negative in point estimate, but its 95% interval still contains
      // zero: not a measured loss. Amendment 36 refuses this in both
      // directions — no decline, and no claim of edge either.
      verdict =
        "INDISTINGUISHABLE FROM ZERO — negative point estimate, CI spans zero; no decline, no claim";
      indistinguishable += 1;
    } else {
      verdict = "DATA-NEGATIVE — negative even at the published bill, beyond its own error; withdrawal defensible";
      withdrawable += 1;
    }
    verdicts[symbol] = {
      cell: cells.get(symbol),
      grossSelectCiUpper: g.selectCiUpper,
      grossSelectE: g.select,
      grossSelectN: g.selectN,
      grossSelectSe: g.selectSe,
      netSelectE: n.select,
      netSelectN: n.selectN,
      verdict,
    };
  }
  const readable = cells.size - unreadable;
  writeResearchArtifact(outPath, {
    derivedAt: new Date().toISOString(),
    note: (inert > 0
      ? `${inert} of ${readable} readable markets produced IDENTICAL ` +
        `statistics in both arms; those carry no sensitivity finding and no ` +
        `decision. See docs/research/remediation-program-2026-08-11.md. `
      : "The gross arm charges the venue's published commission alone; the " +
        "net arm adds our modelled spread and slippage. Both reach the " +
        "resolver since M5 (2026-08-31). ") +
      "Every verdict is decided on the corpus's select fold (test, on a " +
      `legacy two-split corpus); the ${SEALED_FOLD} fold is sealed and unread.`,
    sealed: {
      fold: SEALED_FOLD,
      grossRowsWithheld: gross.sealedRows,
      netRowsWithheld: net.sealedRows,
    },
    summary: {
      costDependent,
      indistinguishable,
      inert,
      unreadable,
      withdrawable,
    },
    verdicts,
  });
  console.log(
    `cost sensitivity: ${withdrawable} data-negative beyond error (decline), ` +
      `${costDependent} cost-dependent (keep), ${indistinguishable} indistinguishable from zero (keep), ` +
      `${inert} cost model inert, ${unreadable} unreadable; ${SEALED_FOLD} sealed ` +
      `(net ${net.sealedRows}, gross ${gross.sealedRows} rows withheld) -> ${outPath}`,
  );
  // WRITTEN FIRST, THEN REFUSED. The artifact is the evidence of the failure
  // and has to survive it; throwing before the write would leave an operator
  // with a non-zero exit and nothing to read.
  //
  // Every market we could read came back identical, which is the exact
  // signature of the 2026-08-11 defect: a scale that reaches the payoff gate
  // and not the resolver. A summary of all-zero verdicts is indistinguishable
  // from a clean run at a glance, and that glance is what happened last time.
  if (inert > 0 && inert === readable) {
    throw new Error(
      `cost-sensitivity-verdict: all ${readable} readable markets came back ` +
        `INERT — the two arms charged the same costs, so this run compared ` +
        `nothing. Check that LEVELFLOW_MODELED_COST_SCALE was actually set ` +
        `for the gross sweep and that MODELED_COST_SCALE_REACHES_RESOLVER is ` +
        `still true. The artifact was written to ${outPath} as evidence.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
