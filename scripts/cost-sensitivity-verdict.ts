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
import { writeFileSync } from "node:fs";
import { readLinesSync } from "./sweepStats.ts";

type Fold = { fitEnd: number; selectEnd: number };

function foldsFor(times: number[]): Fold {
  const first = Math.min(...times);
  const last = Math.max(...times);
  return {
    fitEnd: first + (last - first) * 0.5,
    selectEnd: first + (last - first) * 0.75,
  };
}

function expectancyByFold(
  rows: Array<{ time: number; r: number; exit: number | null }>,
): { select: number | null; confirm: number | null; selectN: number; confirmN: number } {
  if (rows.length === 0) {
    return { confirm: null, confirmN: 0, select: null, selectN: 0 };
  }
  const { fitEnd, selectEnd } = foldsFor(rows.map((row) => row.time));
  let selectSum = 0, selectN = 0, confirmSum = 0, confirmN = 0;
  for (const row of rows) {
    // Exact containment, the same rule the graded folds use.
    if (row.time >= fitEnd && row.time < selectEnd) {
      if (row.exit !== null && row.exit > selectEnd) continue;
      selectSum += row.r;
      selectN += 1;
    } else if (row.time >= selectEnd) {
      confirmSum += row.r;
      confirmN += 1;
    }
  }
  return {
    confirm: confirmN >= 30 ? confirmSum / confirmN : null,
    confirmN,
    select: selectN >= 30 ? selectSum / selectN : null,
    selectN,
  };
}

function collect(paths: string[], cells: Map<string, string>) {
  const byMarket = new Map<
    string,
    Array<{ time: number; r: number; exit: number | null }>
  >();
  for (const path of paths) {
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
      const time = Number(row.time);
      const r = Number(row.realizedR);
      if (!Number.isFinite(time) || !Number.isFinite(r)) return;
      if (!byMarket.has(symbol)) byMarket.set(symbol, []);
      byMarket.get(symbol)!.push({
        exit: Number.isFinite(Number(row.exitAtMs)) ? Number(row.exitAtMs) : null,
        r,
        time,
      });
    });
  }
  return byMarket;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const netPaths = (flag("net") ?? "").split(",").filter(Boolean);
  const grossPaths = (flag("gross") ?? "").split(",").filter(Boolean);
  const cells = new Map<string, string>();
  for (const pair of (flag("cells") ?? "").split(";")) {
    const [symbol, variant] = pair.split("|");
    if (symbol && variant) cells.set(symbol.trim(), variant.trim());
  }
  const outPath = flag("out") ??
    "docs/research/baseline-2026-08-10/4d-cost-sensitivity.json";

  const net = collect(netPaths, cells);
  const gross = collect(grossPaths, cells);

  const verdicts: Record<string, unknown> = {};
  let withdrawable = 0, costDependent = 0, unreadable = 0;
  for (const symbol of [...cells.keys()].sort()) {
    const n = expectancyByFold(net.get(symbol) ?? []);
    const g = expectancyByFold(gross.get(symbol) ?? []);
    let verdict: string;
    if (g.confirm === null) {
      verdict = "unreadable — the gross run has no confirm sample";
      unreadable += 1;
    } else if (g.confirm > 0) {
      verdict = "COST-DEPENDENT — positive at the published bill alone; DO NOT withdraw";
      costDependent += 1;
    } else {
      verdict = "DATA-NEGATIVE — negative even at the published bill; withdrawal defensible";
      withdrawable += 1;
    }
    verdicts[symbol] = {
      cell: cells.get(symbol),
      grossConfirmE: g.confirm,
      grossConfirmN: g.confirmN,
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
          "gross = LEVELFLOW_MODELED_COST_SCALE=0 (E8's published commission only). " +
          "Per-market folds, exact containment, 30-fill floor, both corpora.",
        summary: { costDependent, unreadable, withdrawable },
        verdicts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `cost sensitivity: ${withdrawable} data-negative (withdrawal defensible), ` +
      `${costDependent} cost-dependent (keep), ${unreadable} unreadable -> ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
