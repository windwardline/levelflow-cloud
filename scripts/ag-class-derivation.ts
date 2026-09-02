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
 *
 * The confirm fold is sealed at the door (R4 act 1, 2026-09-02): this reads
 * the fit and select folds — train and test on a legacy corpus — and never
 * sees a confirm row.
 */
import {
  assertAcceptanceMode,
  assertManifest,
  assertManifestedCorpusStreaming,
  SEALED_FOLD,
  tuningFolds,
} from "./sweepStats.ts";

// SYMBOLS: external the grain complex | 6 of 6 vs agriculture
const GRAINS = new Set(["ZCUSX", "ZSUSX", "ZLUSX", "ZMUSD", "ZOUSX", "ZRUSD"]);
// SYMBOLS: external the livestock complex | 3 of 3 vs livestock
const LIVESTOCK = new Set(["LEUSX", "GFUSX", "HEUSX"]);
const BUCKET = 5;
/** The select fold judges a band; a thinner bucket cannot support a floor. */
const MIN_SELECT_FILLS = 30;

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
  /** Rows the door handed over, before any filter here — zero is a refusal. */
  let handed = 0;
  /** Rows the door withheld as the sealed fold, summed across shards. */
  let sealed = 0;
  // The fold names come from the manifest, never from this file; keyed by
  // vocabulary so shards of two shapes are refused as two corpora.
  const tunings = new Map<string, ReturnType<typeof tuningFolds>>();
  for (const file of files) {
    // R0: the one-clock door (#358 round 3) — the manifest half first, so
    // the premise below is refused before a single row is read.
    const corpusManifest = assertManifest(file);
    // THE PREMISE THIS READER OPENS BY STATING, now asserted.
    //
    // Its header promises "the monotone-survival confidence floor", and a
    // floor cannot be derived from a corpus that already applied one: a gated
    // sweep emits only rows that passed the confidence gate, so every band
    // below the shipped threshold is empty and every band above it reads as
    // surviving. The curve would be built from survivors and called the
    // population — the same words `confidence-bands.ts` and
    // `threshold-rescue.ts` use for the same failure.
    //
    // A refusal rather than a filter, unlike the readers that want only
    // shipped decisions: this one needs the rows the gate rejected, so a gated
    // corpus is not a narrower answer, it is no answer.
    assertAcceptanceMode(file, corpusManifest, { captureAll: true });
    const vocabulary = tuningFolds(corpusManifest);
    tunings.set(`${vocabulary.fit}/${vocabulary.select}`, vocabulary);
    // The row half is SEALED (R4 act 1): a confirm row never reaches this
    // callback, and a holed line refuses the corpus instead of being skipped.
    const manifest = await assertManifestedCorpusStreaming(file, (raw) => {
      const r = raw as unknown as Row;
      handed += 1;
      // The door seals confirm; any other split is a vocabulary this reader
      // does not know, refused by name rather than tallied and never printed.
      if (r.split !== vocabulary.fit && r.split !== vocabulary.select) {
        throw new Error(
          `${file}: row carries split "${r.split}", which is neither ` +
            `${vocabulary.fit} nor ${vocabulary.select} — an unknown fold ` +
            `is refused, not pooled`,
        );
      }
      if (r.variant && r.variant !== "baseline") return;
      const cohort = GRAINS.has(r.symbol) ? "agriculture"
        : LIVESTOCK.has(r.symbol) ? "livestock" : null;
      if (!cohort) return;
      const floor = Math.floor(r.confidenceScore / BUCKET) * BUCKET;
      for (const [m, k] of [
        [bands, `${cohort}|${floor}|${r.split}`],
        [hours, `${cohort}|${new Date(r.time).getUTCHours()}`],
        [totals, cohort],
      ] as Array<[Map<string, S>, string]>) {
        let s = m.get(k); if (!s) { s = blank(); m.set(k, s); }
        add(s, r);
      }
    });
    sealed += manifest.sealedRows;
  }

  if (tunings.size !== 1) {
    console.error(
      `ag-class-derivation: the shards name ${tunings.size} fold vocabularies ` +
        `[${[...tunings.keys()].join(", ")}] — two vocabularies are two ` +
        `corpora, not one`,
    );
    process.exit(1);
  }
  const [tuning] = tunings.values();
  // The door handed nothing: a class derived from zero rows is not derived,
  // and when every row sat in the sealed fold the operator needs to hear that
  // the seal, not the corpus, is why.
  if (handed === 0) {
    console.error(
      `ag-class-derivation: the door handed this reader NO rows` +
        (sealed > 0
          ? ` — all ${sealed} sit in the sealed ${SEALED_FOLD} fold and were ` +
            `withheld at the door (R4 act 1); nothing readable remains`
          : ` — the corpus holds none`) +
        `. That is a refusal, not a result.`,
    );
    process.exit(1);
  }
  if (sealed > 0) {
    console.error(
      `ag-class-derivation: ${sealed} ${SEALED_FOLD} row(s) withheld at the ` +
        `door — sealed, not read`,
    );
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
    // The SELECT tuning fold judges: it carries the fills floor and the
    // monotone-survival verdict; the fit fold is printed beside it.
    const selectBand = (f: number) => bands.get(`${cohort}|${f}|${tuning.select}`);
    const judgeable = uniq.filter((f) => (selectBand(f)?.filled ?? 0) >= MIN_SELECT_FILLS);
    let verdict: number | null = null;
    for (const cand of judgeable) {
      if (judgeable.filter((f) => f >= cand).every((f) => (E(selectBand(f)!) ?? -1) > 0)) {
        verdict = cand; break;
      }
    }
    console.log(
      `  band  ${`${tuning.fit} E`.padStart(10)}  ${`${tuning.select} E`.padStart(10)}` +
        `  ${`${tuning.select} fills`.padStart(14)}`,
    );
    for (const f of uniq) {
      const fit = bands.get(`${cohort}|${f}|${tuning.fit}`), sel = selectBand(f);
      if (!sel || sel.filled < 10) continue;
      console.log(`  ${String(f).padStart(4)}  ${(fit && E(fit) !== null ? E(fit)!.toFixed(3) : "—").padStart(10)}` +
        `  ${E(sel)!.toFixed(3).padStart(10)}  ${String(sel.filled).padStart(14)}` +
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
