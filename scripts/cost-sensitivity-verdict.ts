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
// and computes each market's confirm-fold expectancy under identical
// per-market folds, so the two are apples-to-apples.
//
// The verdict rule:
//   gross confirm E <= 0  -> genuinely data-negative. Withdrawal is
//                            defensible: even at the venue's own
//                            published bill the market loses.
//   gross confirm E  > 0  -> the negative rests on OUR modeled cost.
//                            DO NOT withdraw; disclose the sensitivity.
import { readFileSync } from "node:fs";
import { assertManifest, readLinesSync } from "./sweepStats.ts";
import { flagReader } from "./flagReader.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";

function spansFrom(paths: string[]): Map<string, { first: number; last: number }> {
  const spans = new Map<string, { first: number; last: number }>();
  for (const path of paths) {
    const manifest = JSON.parse(
      readFileSync(`${path}.manifest.json`, "utf8"),
    ) as {
      symbols: Array<
        {
          symbol: string;
          series?: Record<string, { firstTime?: number; lastTime?: number }>;
        }
      >;
    };
    for (const entry of manifest.symbols) {
      const series = entry.series?.["15min"];
      if (
        !Number.isFinite(series?.firstTime) || !Number.isFinite(series?.lastTime)
      ) continue;
      const current = spans.get(entry.symbol);
      spans.set(entry.symbol, {
        first: Math.min(current?.first ?? Infinity, series!.firstTime!),
        last: Math.max(current?.last ?? -Infinity, series!.lastTime!),
      });
    }
  }
  return spans;
}

type Acc = {
  confirmN: number;
  confirmSum: number;
  confirmSumSq: number;
  selectN: number;
  selectSum: number;
};

/**
 * Single streaming pass, scalars only — the corpora are tens of GB and
 * an array of rows per market is what OOMed the first attempt. Fold
 * boundaries come from the manifests' own measured spans, which is where
 * gradeCorpus reads them too, so the two agree by construction.
 */
function collect(
  paths: string[],
  cells: Map<string, string>,
  spans: Map<string, { first: number; last: number }>,
): Map<string, Acc> {
  const acc = new Map<string, Acc>();
  for (const path of paths) {
    // R0: the one-clock door — a corpus that cannot state its clock (or
    // whose witnesses condemn it) is refused here too, not only in the
    // aggregation readers. These five scripts produced the invalidated
    // 4d-era figures by reading emits bare.
    assertManifest(path);
    readLinesSync(path, (line) => {
      if (!line) return;
      const row = JSON.parse(line) as {
        accepted?: boolean;
        exitAtMs?: number;
        outcome?: string;
        realizedR?: number;
        symbol?: string;
        time?: number;
        variant?: string;
      };
      const symbol = row.symbol;
      if (!symbol || cells.get(symbol) !== (row.variant ?? "baseline")) return;
      if (row.accepted !== true || row.outcome === "unfilled") return;
      const span = spans.get(symbol);
      const time = Number(row.time);
      const r = Number(row.realizedR);
      if (!span || !Number.isFinite(time) || !Number.isFinite(r)) return;
      const fitEnd = span.first + (span.last - span.first) * 0.5;
      const selectEnd = span.first + (span.last - span.first) * 0.75;
      if (!acc.has(symbol)) {
        acc.set(symbol, {
          confirmN: 0,
          confirmSum: 0,
          confirmSumSq: 0,
          selectN: 0,
          selectSum: 0,
        });
      }
      const cell = acc.get(symbol)!;
      const exit = Number(row.exitAtMs);
      if (time >= fitEnd && time < selectEnd) {
        // Exact containment, the same rule the graded folds use.
        if (Number.isFinite(exit) && exit > selectEnd) return;
        cell.selectSum += r;
        cell.selectN += 1;
      } else if (time >= selectEnd) {
        cell.confirmSum += r;
        cell.confirmSumSq += r * r;
        cell.confirmN += 1;
      }
    });
  }
  return acc;
}

/**
 * Did the cost model move ANYTHING on this market?
 *
 * Compared on the sufficient statistics rather than row by row, because the
 * corpora are tens of GB and these five scalars are what every figure in the
 * artifact is computed from. If they agree, every derived number agrees, and
 * the arms are indistinguishable no matter how the rows are ordered.
 *
 * EXACT equality, not a tolerance. The question is "did the switch do
 * anything", and a tolerance would answer "not much" — which is precisely the
 * reading that let eleven bit-identical rows pass as agreement in the
 * 2026-08-11 run. A real difference of one ULP is still a real difference,
 * and the confirm interval downstream is what decides whether it matters.
 */
function identical(a: Acc | undefined, b: Acc | undefined): boolean {
  if (!a || !b) return false;
  return a.confirmN === b.confirmN && a.confirmSum === b.confirmSum &&
    a.confirmSumSq === b.confirmSumSq && a.selectN === b.selectN &&
    a.selectSum === b.selectSum;
}

function read(acc: Acc | undefined) {
  if (!acc) {
    return {
      confirm: null,
      confirmCiUpper: null,
      confirmN: 0,
      confirmSe: null,
      select: null,
      selectN: 0,
    };
  }
  const confirm = acc.confirmN >= 30 ? acc.confirmSum / acc.confirmN : null;
  // Declining a market is as consequential as accepting one and earns
  // the same evidentiary bar: the loss must be distinguishable from
  // zero. A market at -0.004R on 54 fills is not a measured loss, it is
  // a measurement of nothing, and amendment 36 forbids acting on that in
  // EITHER direction.
  let confirmSe: number | null = null;
  let confirmCiUpper: number | null = null;
  if (confirm !== null && acc.confirmN > 1) {
    const variance = Math.max(
      0,
      (acc.confirmSumSq - acc.confirmSum * acc.confirmSum / acc.confirmN) /
        (acc.confirmN - 1),
    );
    confirmSe = Math.sqrt(variance / acc.confirmN);
    confirmCiUpper = confirm + 1.96 * confirmSe;
  }
  return {
    confirm,
    confirmCiUpper,
    confirmN: acc.confirmN,
    confirmSe,
    select: acc.selectN >= 30 ? acc.selectSum / acc.selectN : null,
    selectN: acc.selectN,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const VALUE_FLAGS = new Set(["--net", "--gross", "--cells", "--out"]);
  const { str } = flagReader(argv, VALUE_FLAGS);
  const netPaths = (str("--net") ?? "").split(",").filter(Boolean);
  const grossPaths = (str("--gross") ?? "").split(",").filter(Boolean);
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
          `verdict; pass ${flag} shard-a.jsonl,shard-b.jsonl .`,
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

  // Spans from each corpus's OWN manifests; the same symbols were swept
  // both times, so the folds land identically.
  const net = collect(netPaths, cells, spansFrom(netPaths));
  const gross = collect(grossPaths, cells, spansFrom(grossPaths));

  const verdicts: Record<string, unknown> = {};
  let withdrawable = 0, costDependent = 0, unreadable = 0, indistinguishable = 0;
  let inert = 0;
  for (const symbol of [...cells.keys()].sort()) {
    const netAcc = net.get(symbol);
    const grossAcc = gross.get(symbol);
    const n = read(netAcc);
    const g = read(grossAcc);
    let verdict: string;
    if (g.confirm === null) {
      verdict = "unreadable — the gross run has no confirm sample";
      unreadable += 1;
    } else if (identical(netAcc, grossAcc)) {
      // THE M5 DOOR. Checked after `unreadable` on purpose: two empty
      // accumulators are trivially identical, and calling that an inert cost
      // model would blame the instrument for what is simply no data. Reaching
      // here means there IS a confirm sample and the two arms agree on every
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
    } else if (g.confirm > 0) {
      verdict = "COST-DEPENDENT — positive at the published bill alone; DO NOT withdraw";
      costDependent += 1;
    } else if (g.confirmCiUpper === null || g.confirmCiUpper >= 0) {
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
      grossConfirmCiUpper: g.confirmCiUpper,
      grossConfirmE: g.confirm,
      grossConfirmN: g.confirmN,
      grossConfirmSe: g.confirmSe,
      grossSelectE: g.select,
      netConfirmE: n.confirm,
      netConfirmN: n.confirmN,
      netSelectE: n.select,
      verdict,
    };
  }
  const readable = cells.size - unreadable;
  writeResearchArtifact(outPath, {
    derivedAt: new Date().toISOString(),
    note: inert > 0
      ? `${inert} of ${readable} readable markets produced IDENTICAL ` +
        `statistics in both arms; those carry no sensitivity finding and no ` +
        `decision. See docs/research/remediation-program-2026-08-11.md.`
      : "The gross arm charges the venue's published commission alone; the " +
        "net arm adds our modelled spread and slippage. Both reach the " +
        "resolver since M5 (2026-08-31).",
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
      `${inert} cost model inert, ${unreadable} unreadable -> ${outPath}`,
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
