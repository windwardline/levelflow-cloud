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
 *
 * Columns are resolved BY NAME from the table's own header (#364 round 1,
 * finding 1): the positional map that stood here had already drifted once
 * (never re-indexed when notWarm joined the driver's table — geometryKill
 * silently summed noConsensus + belowConf) and R1b's unresolv column would
 * have drifted it again. A required name missing from the header is a
 * refusal, never a zero; notWarm and unresolv are optional-with-zero so
 * pre-notWarm logs stay readable. tests/sweepManifest.test.ts pins the
 * driver's header against the names required here AND against the data
 * row's own order.
 *
 * R1b narrowed planRejected's meaning (#364 round 7, smaller): decisions
 * whose review window held no bars used to land here; they now resolve
 * and emit as setups rows carrying the data-absence marker (dataAbsent
 * in the driver's table). So planRejected — and geometryKill/survival
 * built on it — is the ladder's own refusals only, and figures recorded
 * before R1b (the rice 263-of-424 above) sit on the wider meaning;
 * compare across that boundary with the marker in hand.
 *
 * Run this gate on a NORMAL sweep's table, never a --capture-all one:
 * capture-all deliberately emits below-threshold decisions as outcome
 * rows instead of tallying the acceptance gates, so belowConf and
 * belowPayoff read 0 there and survival is overstated — the opposite
 * lie from the drift this file just closed. (regimeBlk is safe either
 * way: the driver's regimeGated addend is structurally zero — blocked
 * regimes exit at the pre-plan gate in normal mode and skip the
 * acceptance tally in capture-all — so the column is the pre-geometry
 * block exactly.)
 *
 * unresolv (R1b's defect bucket — the plan built and the resolver still
 * returned non-finite numbers) is excluded from BOTH sides of the
 * survival arithmetic (#364 round 14): counting those decisions as
 * survivors biased survival up and this gate under-flagged, while
 * counting them as geometry kills would blame parameters for a sweep
 * bug. A nonzero unresolv is a debugging signal, not a starvation one.
 */
import { readFileSync } from "node:fs";

type Row = {
  symbol: string; split: string; decisions: number; sessionBlk: number;
  newsBlk: number; notWarm: number; regimeBlk: number; noConsensus: number;
  planRejected: number; unresolv: number; belowConf: number;
  belowPayoff: number; setups: number;
};

// The names this audit's arithmetic consumes. `need` entries refuse a table
// that lacks them; `optional` entries read 0 from an older table.
const NEED_COLUMNS = [
  "symbol", "variant", "split", "decisions", "sessionBlk", "newsBlk",
  "regimeBlk", "noConsensus", "planRejected", "belowConf", "belowPayoff",
  "setups",
] as const;
const OPTIONAL_COLUMNS = ["notWarm", "unresolv"] as const;
for (const name of OPTIONAL_COLUMNS) {
  if ((NEED_COLUMNS as readonly string[]).includes(name)) {
    throw new Error(`column "${name}" is listed both required and optional`);
  }
}

function parse(paths: string[]): Row[] {
  const rows: Row[] = [];
  for (const path of paths) {
    const lines = readFileSync(path, "utf8").split("\n");
    const headerLine = lines.find((line) =>
      line.trim().startsWith("symbol")
    );
    if (!headerLine) {
      throw new Error(
        `${path}: no sweep header row (a line starting with "symbol") — ` +
          `this audit refuses to guess column positions`,
      );
    }
    const header = headerLine.trim().split(/\s+/);
    const index = new Map(header.map((name, i) => [name, i] as const));
    for (const name of NEED_COLUMNS) {
      if (!index.has(name)) {
        throw new Error(
          `${path}: sweep header carries no "${name}" column — the driver's ` +
            `table and this audit have diverged; fix the mapping, never guess`,
        );
      }
    }
    for (const line of lines) {
      const f = line.trim().split(/\s+/);
      if (f.length < header.length || f[0] === "symbol" || !/^[A-Z^]/.test(f[0])) continue;
      const text = (name: string) => f[index.get(name)!] ?? "";
      if (text("variant") !== "baseline") continue;
      const n = (name: typeof NEED_COLUMNS[number]) =>
        Number(text(name)) || 0;
      const opt = (name: typeof OPTIONAL_COLUMNS[number]) =>
        index.has(name) ? Number(text(name)) || 0 : 0;
      rows.push({
        symbol: text("symbol"), split: text("split"),
        decisions: n("decisions"), sessionBlk: n("sessionBlk"),
        newsBlk: n("newsBlk"), notWarm: opt("notWarm"),
        regimeBlk: n("regimeBlk"), noConsensus: n("noConsensus"),
        planRejected: n("planRejected"), unresolv: opt("unresolv"),
        belowConf: n("belowConf"), belowPayoff: n("belowPayoff"),
        setups: n("setups"),
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
  for (const k of ["decisions","sessionBlk","newsBlk","notWarm","regimeBlk",
    "noConsensus","planRejected","unresolv","belowConf","belowPayoff",
    "setups"] as const) prev[k] += r[k];
}

const out = [...byS.values()].map((r) => {
  // Decisions that reached the geometry stage at all. notWarm decisions never
  // did (the regime could not form) — subtracting it is part of the same
  // repair as the named columns: the drifted map had silently excluded it
  // from BOTH sides of this arithmetic. unresolv leaves both sides too
  // (#364 round 14, finding 3): those decisions built a plan and the
  // resolver still could not grade it — a DEFECT bucket, not a parameter
  // verdict — so counting them as survivors biased survival up and the
  // amendment-25 gate under-flagged, while folding them into geometryKill
  // would blame parameters for a sweep bug.
  const reachedGeometry = r.decisions - r.sessionBlk - r.newsBlk - r.notWarm -
    r.regimeBlk - r.noConsensus - r.unresolv;
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
