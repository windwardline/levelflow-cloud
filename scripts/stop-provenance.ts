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
  accepted?: boolean;
  symbol: string; outcome: string; realizedR: number | null;
  split: string; stopProvenance?: string; rewardRisk: number; variant?: string;
};
type S = { filled: number; wins: number; stops: number; rSum: number };
const key = (c: string, p: string, s: string) => `${c}|${p}|${s}`;
const acc = new Map<string, S>();
/** Every split name the corpus actually carried, derived while reading. */
const splitsSeen = new Set<string>();

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
// five-file population; the population is derived in tests/emptyCorpusRefusals.test.ts's
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
    // SHIPPED DECISIONS ONLY, and this reader had no such filter.
    //
    // A `--capture-all` corpus emits the rows that FAILED the confidence,
    // payoff and regime gates alongside the ones that passed, flagged
    // `accepted: false` — measured on BTCUSD at the 2026-08-26 anchor, 351 of
    // 2,966 rows, 13.4%. Without this line every one of them was folded into
    // the provenance tallies, so the question this reader asks — do cap-clipped
    // stops out-earn structural ones — would have been answered over a
    // population including setups the engine would never ship.
    //
    // A NO-OP ON A GATED CORPUS, which is why it is a filter rather than an
    // `assertAcceptanceMode` refusal: a gated sweep emits `accepted: true` on
    // every row (verified: 2,615 of 2,615), so this reader now reads the same
    // population from either mode and needs no mode declaration at all. Two
    // readers already REQUIRE captureAll: true (`confidence-bands.ts:234`,
    // `threshold-rescue.ts:95`) and none requires false, so a corpus this
    // reader refused would be one the others need.
    if (row.accepted === false) continue;
    if (!row.stopProvenance) continue;
    splitsSeen.add(row.split);
    add(key(getAssetType(row.symbol), row.stopProvenance, row.split), row);
  }
}

const E = (s: S) => s.filled ? s.rSum / s.filled : null;
const pct = (a: number, b: number) => b ? `${((a / b) * 100).toFixed(0)}%` : "—";
const classes = [...new Set([...acc.keys()].map((k) => k.split("|")[0]))].sort();

/**
 * THE FOLD NAMES, TAKEN FROM THE CORPUS RATHER THAN ASSUMED.
 *
 * This reader looked up splits called "train" and "test". The fold vocabulary
 * became `fit` / `select` / `confirm` (`sweepFolds.ts:21`), and nothing
 * updated here — so `acc.get(key(c, p, "test"))` was undefined on every row of
 * every modern corpus, the `!te` guard skipped all of them, and the script
 * printed its column header and exited 0. Measured on a 322 MB three-market
 * emit: 2,966 rows read, nine tallies built, ZERO rows printed.
 *
 * The file's own door comment named this exact shape — "the table prints its
 * column header alone under exit 0, which is exactly what a real corpus
 * holding no qualifying row also prints" — and the door it installed only
 * covered the zero-FILES case. The zero-MATCHED-ROWS case is the one that had
 * been firing.
 *
 * `grid-totalr.ts:1521` already carries the legacy map (`{fit: "train",
 * select: "test"}`), so both vocabularies are live in the corpus population
 * and neither may be hardcoded here.
 */
const FOLD_ORDER = ["fit", "select", "confirm", "train", "test"];
const folds = FOLD_ORDER.filter((name) => splitsSeen.has(name));
const unknown = [...splitsSeen].filter((name) => !FOLD_ORDER.includes(name));
if (unknown.length > 0) {
  console.error(
    `stop-provenance: the corpus carries split name(s) this reader does not ` +
      `know: ${unknown.join(", ")}. It would silently omit them rather than ` +
      `report a partial table.`,
  );
  process.exit(1);
}

console.log(
  `${"class".padEnd(10)}${"stop set by".padEnd(18)}` +
    folds.map((f) => `${f} E`.padStart(11)).join("") +
    `${"filled".padStart(10)}${"win".padStart(6)}${"stop".padStart(6)}` +
    `   (win/stop/filled on ${folds[folds.length - 1]})`,
);
let printed = 0;
for (const c of classes) {
  for (const p of ["pivot", "cap", "volatility_floor"]) {
    // The LAST fold is the held-out one, and it carries the row's counts.
    const held = acc.get(key(c, p, folds[folds.length - 1]));
    if (!held || held.filled < 30) continue;
    printed += 1;
    console.log(
      `${c.padEnd(10)}${p.padEnd(18)}` +
        folds.map((f) => {
          const cell = acc.get(key(c, p, f));
          return (cell && E(cell) !== null ? E(cell)!.toFixed(3) : "—")
            .padStart(11);
        }).join("") +
        `${String(held.filled).padStart(10)}` +
        `${pct(held.wins, held.filled).padStart(6)}` +
        `${pct(held.stops, held.filled).padStart(6)}`,
    );
  }
  if (printed > 0) console.log();
}

// The door the zero-files check was half of. A table that printed nothing is
// indistinguishable from one nobody ran, and this reader spent two months in
// exactly that state.
if (printed === 0) {
  console.error(
    `stop-provenance: read ${acc.size} tallies across ` +
      `${splitsSeen.size} split(s) [${[...splitsSeen].sort().join(", ")}] and ` +
      `printed NO rows — every class/provenance cell was missing or under the ` +
      `30-filled floor. That is a refusal, not a result: a header-only table ` +
      `is what a wrong path prints too.`,
  );
  process.exit(1);
}
