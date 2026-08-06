/**
 * Which markets are STARVED by our parameters rather than short of edge?
 *
 * One failure mode repeated four times in a single night: a parameter constrains
 * setup generation, the market produces a thin sample, and the thin sample is
 * read as "no edge". Oil (an energies TP1 share twice the healthy value),
 * indices (an ATR cap clipping structural stops), copper and gas (an absolute
 * cost floor), then oats and rough rice (a runner ceiling too tight to reach —
 * rice produced SEVEN setups and was called a -0.200 market).
 *
 * Four discoveries by accident is not a method. This is the method: the sweep
 * records where every decision dies, so starvation is directly measurable rather
 * than stumbled upon. For each market it reports what share of decisions each
 * gate consumes, and flags the ones whose survival rate is low enough that any
 * expectancy verdict about them is really a verdict about our own gates.
 *
 * The two gates that matter most here are the geometry gates:
 *   planRejected — the ladder refused to build at all: the required target is
 *     unreachable inside the review window, or the runner landed inside TP1.
 *     Rice at runnerWindowShare 0.6 died here 263 times out of 424 decisions.
 *   belowPayoff  — reward:risk under the class floor. Copper died here on 100%
 *     of 2304 setups because an absolute cost floor exceeded its risk distance.
 *
 * Session and news blocks are deliberate and not starvation; they are reported
 * for completeness so the arithmetic is legible.
 */
import { readFileSync } from "node:fs";

type Row = {
  symbol: string; split: string; decisions: number; sessionBlk: number;
  newsBlk: number; regimeBlk: number; noConsensus: number; planRejected: number;
  belowConf: number; belowPayoff: number; setups: number;
};

function parse(paths: string[]): Row[] {
  const rows: Row[] = [];
  for (const path of paths) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const f = line.trim().split(/\s+/);
      if (f.length < 16 || f[0] === "symbol" || !/^[A-Z^]/.test(f[0])) continue;
      if (f[1] !== "baseline") continue;
      const n = (i: number) => Number(f[i]) || 0;
      rows.push({
        symbol: f[0], split: f[2], decisions: n(3), sessionBlk: n(4), newsBlk: n(5),
        regimeBlk: n(6), noConsensus: n(7), planRejected: n(8), belowConf: n(9),
        belowPayoff: n(10), setups: n(11),
      });
    }
  }
  return rows;
}

// Flags filtered out, or readFileSync tries to open "--report" as a log and the
// gate fails for the wrong reason — which it did on first test.
const rows = parse(process.argv.slice(2).filter((arg) => !arg.startsWith("--")));
const byS = new Map<string, Row>();
for (const r of rows) {
  const prev = byS.get(r.symbol);
  if (!prev) { byS.set(r.symbol, { ...r }); continue; }
  for (const k of ["decisions","sessionBlk","newsBlk","regimeBlk","noConsensus",
    "planRejected","belowConf","belowPayoff","setups"] as const) prev[k] += r[k];
}

const out = [...byS.values()].map((r) => {
  // Decisions that reached the geometry stage at all.
  const reachedGeometry = r.decisions - r.sessionBlk - r.newsBlk - r.regimeBlk - r.noConsensus;
  const geometryKill = r.planRejected + r.belowPayoff;
  const survival = reachedGeometry > 0 ? 1 - geometryKill / reachedGeometry : 0;
  return { ...r, reachedGeometry, geometryKill, survival };
}).sort((a, b) => a.survival - b.survival);

console.log(`${"market".padEnd(9)}${"decisions".padStart(10)}${"reached".padStart(9)}` +
  `${"planRej".padStart(9)}${"belowPay".padStart(9)}${"survive".padStart(9)}  flag`);
let starved = 0;
for (const r of out) {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  // Under a third surviving the geometry gates means the geometry, not the
  // market, is deciding how much evidence we ever collect about it.
  const flag = r.survival < 0.15
    ? "STARVED — geometry kills 85%+"
    : r.survival < 0.33
    ? "thin — geometry kills 2 of 3"
    : "";
  if (flag) starved += 1;
  console.log(
    `${r.symbol.padEnd(9)}${String(r.decisions).padStart(10)}${String(r.reachedGeometry).padStart(9)}` +
    `${String(r.planRejected).padStart(9)}${String(r.belowPayoff).padStart(9)}` +
    `${pct(r.survival).padStart(9)}  ${flag}`,
  );
}
console.log(`\n${starved} of ${out.length} markets flagged. Ranked worst first.`);

// A gate, not a report (amendment 25). Run this against any broker's first sweep
// BEFORE any market's expectancy is read as a verdict about that market. Exit 1
// when anything is flagged, so a starved market cannot pass silently into an
// exclusion decision — which is how five markets were misjudged in one night.
//
// --report suppresses the failure for the case where flagged markets are already
// known and being actively fixed, as they are while the starved-cohort grids run.
if (starved > 0 && !process.argv.includes("--report")) {
  console.error(
    `\nFAIL: ${starved} market(s) are starved by geometry, not short of edge. ` +
      `Fix their geometry and re-sweep before drawing any expectancy verdict ` +
      `about them (amendment 25). Re-run with --report to acknowledge and continue.`,
  );
  process.exit(1);
}
