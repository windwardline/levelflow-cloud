/**
 * Derives the agriculture and livestock classes from their own data.
 *
 * They sit in `futures` today only as transport for their first sweep. Their
 * measured character says they do not belong there: minimum spread from tick
 * over price is 5.6 bps for corn and 7.9 for oats against the E-mini S&P's
 * 0.32, they trade CME day sessions rather than near-24h, and they carry daily
 * limit moves index futures do not have.
 *
 * The owner's constraint is that the classes be DERIVED, never seeded from a
 * neighbour — seeding is what put oil under an energies TP1 share twice the
 * healthy value and corn under a cost floor built for contracts priced a
 * thousand times higher. So this reports only what the corpus can actually
 * settle: the monotone-survival confidence floor, and the outcome split by
 * session hour. Stop cap comes from the running grid; TP1 and the runner need
 * their own.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { assertAcceptanceMode, assertManifest } from "./sweepStats.ts";

// SYMBOLS: external the grain complex | 6 of 6 vs agriculture
const GRAINS = new Set(["ZCUSX", "ZSUSX", "ZLUSX", "ZMUSD", "ZOUSX", "ZRUSD"]);
// SYMBOLS: external the livestock complex | 3 of 3 vs livestock
const LIVESTOCK = new Set(["LEUSX", "GFUSX", "HEUSX"]);
const BUCKET = 5;
const MIN_TEST_FILLS = 30;

type Row = {
  symbol: string; confidenceScore: number; outcome: string;
  realizedR: number | null; split: string; time: number; variant?: string;
};
type S = { filled: number; wins: number; stops: number; rSum: number };
const blank = (): S => ({ filled: 0, wins: 0, stops: 0, rSum: 0 });

function add(s: S, r: Row): void {
  if (r.outcome === "unfilled") return;
  s.filled += 1;
  s.rSum += typeof r.realizedR === "number" && Number.isFinite(r.realizedR) ? r.realizedR : 0;
  if (r.outcome === "take_profit" || r.outcome === "tp1_partial") s.wins += 1;
  if (r.outcome === "stop_loss") s.stops += 1;
}
const E = (s: S) => (s.filled ? s.rSum / s.filled : null);

async function main(): Promise<void> {
  const bands = new Map<string, S>();     // cohort|floor|split
  const hours = new Map<string, S>();     // cohort|utcHour
  const totals = new Map<string, S>();
  const files = process.argv.slice(2);
  // WIF-4, derived population (#364 round 54, finding 2): a run over zero
  // rows cannot report a verdict, and this reader had no door — with no
  // shard the loop never runs and the table prints its column header alone
  // under exit 0, which is exactly what a real corpus holding no qualifying
  // row also prints. The operator cannot tell "nothing qualified" from "I
  // forgot the shard path". Round 53 installed this law over a HAND-PICKED
  // five-file population; the population is derived in tests/emptyCorpusRefusals.test.ts's
  // scan now, the way the flag law's is.
  // Its own text is honest — it prints "no rows" per cohort — but the
  // EXIT CODE says the run succeeded, and a cohort legitimately holding no
  // rows prints the same line.
  if (files.length === 0) {
    console.error(
      "usage: ag-class-derivation.ts <emit.jsonl> [more.jsonl ...] — a run " +
        "over zero rows cannot derive a class; \"no rows\" per cohort under " +
        "exit 0 is indistinguishable from a corpus that really holds none",
    );
    process.exit(1);
  }
  for (const file of files) {
    // R0: the one-clock door (#358 round 3).
    const corpusManifest = assertManifest(file);
    // THE PREMISE THIS READER OPENS BY STATING, now asserted.
    //
    // Its header promises "the monotone-survival confidence floor", and a
    // floor cannot be derived from a corpus that already applied one: a gated
    // sweep emits only rows that passed the confidence gate, so every band
    // below the shipped threshold is empty and every band above it reads as
    // surviving. The curve would be built from survivors and called the
    // population — the same words `confidence-bands.ts:234` and
    // `threshold-rescue.ts:95` use for the same failure.
    //
    // A refusal rather than a filter, unlike the readers that want only
    // shipped decisions: this one needs the rows the gate rejected, so a gated
    // corpus is not a narrower answer, it is no answer.
    assertAcceptanceMode(file, corpusManifest, { captureAll: true });
    const stream = createInterface({ crlfDelay: Infinity, input: createReadStream(file) });
    for await (const line of stream) {
      if (!line) continue;
      let r: Row;
      try { r = JSON.parse(line) as Row; } catch { continue; }
      if (r.variant && r.variant !== "baseline") continue;
      const cohort = GRAINS.has(r.symbol) ? "agriculture"
        : LIVESTOCK.has(r.symbol) ? "livestock" : null;
      if (!cohort) continue;
      const floor = Math.floor(r.confidenceScore / BUCKET) * BUCKET;
      for (const [m, k] of [
        [bands, `${cohort}|${floor}|${r.split}`],
        [hours, `${cohort}|${new Date(r.time).getUTCHours()}`],
        [totals, cohort],
      ] as Array<[Map<string, S>, string]>) {
        let s = m.get(k); if (!s) { s = blank(); m.set(k, s); }
        add(s, r);
      }
    }
  }

  for (const cohort of ["agriculture", "livestock"]) {
    const t = totals.get(cohort);
    if (!t) { console.log(`\n${cohort}: no rows\n`); continue; }
    console.log(`\n=== ${cohort.toUpperCase()} ===`);
    console.log(`  overall: filled=${t.filled} win=${(t.wins / t.filled * 100).toFixed(0)}% ` +
      `stop=${(t.stops / t.filled * 100).toFixed(0)}% E=${E(t)!.toFixed(3)}`);
    const floors = [...bands.keys()].filter((k) => k.startsWith(`${cohort}|`))
      .map((k) => Number(k.split("|")[1]));
    const uniq = [...new Set(floors)].sort((a, b) => a - b);
    const judgeable = uniq.filter((f) => (bands.get(`${cohort}|${f}|test`)?.filled ?? 0) >= MIN_TEST_FILLS);
    let verdict: number | null = null;
    for (const cand of judgeable) {
      if (judgeable.filter((f) => f >= cand).every((f) => (E(bands.get(`${cohort}|${f}|test`)!) ?? -1) > 0)) {
        verdict = cand; break;
      }
    }
    console.log(`  band   train E    test E   test fills`);
    for (const f of uniq) {
      const tr = bands.get(`${cohort}|${f}|train`), te = bands.get(`${cohort}|${f}|test`);
      if (!te || te.filled < 10) continue;
      console.log(`  ${String(f).padStart(4)}  ${(tr && E(tr) !== null ? E(tr)!.toFixed(3) : "—").padStart(8)}` +
        `  ${E(te)!.toFixed(3).padStart(8)}  ${String(te.filled).padStart(8)}` +
        (f === verdict ? "  <- derived floor" : ""));
    }
    console.log(`  CONFIDENCE FLOOR: ${verdict ?? "none survives"}`);
    const hot = [...hours.entries()].filter(([k]) => k.startsWith(`${cohort}|`))
      .map(([k, s]) => [Number(k.split("|")[1]), s] as [number, S])
      .filter(([, s]) => s.filled >= 40)
      .sort((a, b) => (E(a[1]) ?? 0) - (E(b[1]) ?? 0));
    if (hot.length) {
      console.log(`  worst UTC hours: ${hot.slice(0, 4).map(([h, s]) => `${h}h ${E(s)!.toFixed(3)} (${s.filled})`).join(" · ")}`);
      console.log(`  best  UTC hours: ${hot.slice(-3).map(([h, s]) => `${h}h ${E(s)!.toFixed(3)} (${s.filled})`).join(" · ")}`);
    }
  }
}
await main();
