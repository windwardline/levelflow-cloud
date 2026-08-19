// ⛔ THIS SCRIPT'S MECHANISM DOES NOT WORK. Do not run it, and do not
// treat any artifact it has written as evidence. `LEVELFLOW_MODELED_COST_SCALE`
// scales `estimatedRoundTripCost` only, and the replay resolver never reads
// that value — fills take `estimatedSpread`/`estimatedSlippage` directly and
// realized R charges commission through `perLegCost`. So the "gross" corpus
// below charges the SAME costs as the net one; setting the scale to 0 removes
// nothing from the R accounting and only loosens the payoff gate, admitting
// more setups. Eleven of twenty rows came back bit-identical, which is proof
// the switch did nothing, read at the time as agreement.
//
// Amendment 36's standard therefore was never met for the 15 declines. The
// repair is Phase 2 / M5 in docs/research/remediation-program-2026-08-11.md:
// route the scale into the resolver, and assert that a bit-identical
// gross/net row emits "COST MODEL INERT" instead of a verdict. Everything
// below describes the INTENT, which is still correct; only the wiring failed.
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
import { readFileSync, writeFileSync } from "node:fs";
import { assertManifest, readLinesSync } from "./sweepStats.ts";
import { flagReader } from "./flagReader.ts";

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
  for (const symbol of [...cells.keys()].sort()) {
    const n = read(net.get(symbol));
    const g = read(gross.get(symbol));
    let verdict: string;
    if (g.confirm === null) {
      verdict = "unreadable — the gross run has no confirm sample";
      unreadable += 1;
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
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        derivedAt: new Date().toISOString(),
        note:
          "INVALID — the 'gross' arm charged the same costs as the net arm. " +
          "LEVELFLOW_MODELED_COST_SCALE never reaches the replay resolver " +
          "(defect 1c, 2026-08-11), so this file measures nothing. Do not use " +
          "these numbers to withdraw, defend, or ship a market. See " +
          "docs/research/remediation-program-2026-08-11.md.",
        summary: { costDependent, indistinguishable, unreadable, withdrawable },
        verdicts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `cost sensitivity: ${withdrawable} data-negative beyond error (decline), ` +
      `${costDependent} cost-dependent (keep), ${indistinguishable} indistinguishable from zero (keep), ` +
      `${unreadable} unreadable -> ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
