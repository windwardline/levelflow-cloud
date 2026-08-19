/**
 * Does market structure set a better stop than the ATR cap?
 *
 * The corpus records, per setup, WHICH mechanism placed the stop: `pivot` (a
 * structural level), `cap` (maxStopAtrMultiplier clipped it), or
 * `volatility_floor`. Tonight's bands run showed the cap binding on 84-96% of
 * stops in every class that has an edge, and on only 59% in indices — the one
 * class with no edge. That inversion is either a clue or a coincidence, and
 * which one it is decides how the stop-cap grid should be read.
 *
 * So this splits outcomes by provenance WITHIN each class. Same markets, same
 * bars, same everything else — the only difference is which rule won. If
 * cap-clipped stops outperform structural ones, the cap is doing real work and
 * should be tuned tighter. If structural stops win, the cap is destroying
 * information and should be loosened until structure governs.
 *
 * Read with care in one respect: provenance is not randomly assigned. The cap
 * binds precisely when structure asked for a WIDER stop than the cap allows, so
 * the two groups differ in the setups they contain, not only in how they were
 * treated. This measures an association, and the grid measures the causal
 * effect — this is how you know which grid to run and what to expect from it.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { assertManifest } from "./sweepStats.ts";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";

type Row = {
  symbol: string; outcome: string; realizedR: number | null;
  split: string; stopProvenance?: string; rewardRisk: number; variant?: string;
};
type S = { filled: number; wins: number; stops: number; rSum: number };
const key = (c: string, p: string, s: string) => `${c}|${p}|${s}`;
const acc = new Map<string, S>();

function add(k: string, row: Row): void {
  let s = acc.get(k);
  if (!s) { s = { filled: 0, wins: 0, stops: 0, rSum: 0 }; acc.set(k, s); }
  if (row.outcome === "unfilled") return;
  s.filled += 1;
  s.rSum += typeof row.realizedR === "number" && Number.isFinite(row.realizedR) ? row.realizedR : 0;
  if (row.outcome === "take_profit" || row.outcome === "tp1_partial") s.wins += 1;
  if (row.outcome === "stop_loss") s.stops += 1;
}

const files = process.argv.slice(2);
// WIF-4, derived population (#364 round 54, finding 2): a run over zero
// rows cannot report a verdict, and this reader had no door — with no
// shard the loop never runs and the table prints its column header alone
// under exit 0, which is exactly what a real corpus holding no qualifying
// row also prints. The operator cannot tell "nothing qualified" from "I
// forgot the shard path". Round 53 installed this law over a HAND-PICKED
// five-file population; the population is derived in tests/sweepStats.ts's
// scan now, the way the flag law's is.
if (files.length === 0) {
  console.error(
    "usage: stop-provenance.ts <emit.jsonl> [more.jsonl ...] — a run over " +
      "zero rows cannot compare stop mechanisms; the header-only table it " +
      "would print is what a corpus with no class clearing the 30-filled " +
      "floor prints too",
  );
  process.exit(1);
}
for (const file of files) {
  // R0: the one-clock door (#358 round 3).
  assertManifest(file);
  const stream = createInterface({ crlfDelay: Infinity, input: createReadStream(file) });
  for await (const line of stream) {
    if (!line) continue;
    let row: Row;
    try { row = JSON.parse(line) as Row; } catch { continue; }
    if (row.variant && row.variant !== "baseline") continue;
    if (!row.stopProvenance) continue;
    add(key(getAssetType(row.symbol), row.stopProvenance, row.split), row);
  }
}

const E = (s: S) => s.filled ? s.rSum / s.filled : null;
const pct = (a: number, b: number) => b ? `${((a / b) * 100).toFixed(0)}%` : "—";
const classes = [...new Set([...acc.keys()].map((k) => k.split("|")[0]))].sort();
console.log(`${"class".padEnd(10)}${"stop set by".padEnd(18)}${"train E".padStart(9)}${"test E".padStart(9)}${"test fill".padStart(10)}${"win".padStart(6)}${"stop".padStart(6)}`);
for (const c of classes) {
  for (const p of ["pivot", "cap", "volatility_floor"]) {
    const tr = acc.get(key(c, p, "train")), te = acc.get(key(c, p, "test"));
    if (!te || te.filled < 30) continue;
    console.log(
      `${c.padEnd(10)}${p.padEnd(18)}` +
      `${(tr && E(tr) !== null ? E(tr)!.toFixed(3) : "—").padStart(9)}` +
      `${E(te)!.toFixed(3).padStart(9)}${String(te.filled).padStart(10)}` +
      `${pct(te.wins, te.filled).padStart(6)}${pct(te.stops, te.filled).padStart(6)}`,
    );
  }
  console.log();
}
