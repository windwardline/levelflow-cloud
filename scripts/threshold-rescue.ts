// Can a per-market confidence threshold rescue a confirmed-but-negative
// cell? (Owner mandate 2026-08-11: a positive outcome where one is
// reachable, data-derived backing where it is not.)
//
// The 4d gate measured IMPROVEMENT against a negative baseline, so a
// confirmed cell can still carry negative ABSOLUTE expectancy — 20 of
// the 72 shipped cells do. This reads the SAME corpus (no re-simulation)
// and, for each such market, walks its own confidence-score distribution
// looking for a threshold whose accepted stream is positive on the SELECT
// fold with enough sample to mean anything.
//
// SELECT ONLY (R4 act 1, 2026-09-02). Until then the rule was "positive on
// both select and confirm", with the folds re-cut here at 50/75% of the
// span — a SELECTION made on the held-back fold, through a door that
// recorded nothing. The confirm fold is for confirmation by the one
// ledgered read (grid-totalr --confirm-final), never for choosing a
// threshold: the door now seals it, and this reader classifies rows by the
// split the sweep stamped on them (fit/select, or train/test on a legacy
// corpus — `tuningFolds`). A rescue found here is a candidate for that
// read, not a result.
//
// NO LEDGERED READ HERE, BY DESIGN (R4 act 2, review finding D2(d)). The
// two purpose-confirm readers — roster-expectancy-audit and
// cost-sensitivity-verdict — take `--ledgered-read` and print the shipped
// cell's confirm figures from the one read's artifact. This screen takes
// no such flag and consumes NOTHING from confirm: a threshold is a filter
// with no confirmation path of its own, and a curve over thresholds served
// from the held-back fold would be a selection on it. A rescue proposed
// here becomes a supplementary grid arm (confidenceThreshold is a grid
// axis) and is confirmed, if at all, as an accepted variant through the
// one read.
//
// The corpus was swept with --capture-all at confidenceThreshold=0, so
// every decision is present with its score; a threshold is a READ over
// rows already measured, not a new assumption.
//
//   npx tsx scripts/threshold-rescue.ts sweeps/4c/shard-*.jsonl \
//     --markets EGLDUSD,ZCUSX,... --out docs/research/.../4d-threshold-rescue.json
import {
  assertAcceptanceMode,
  assertManifest,
  assertManifestedCorpusSync,
  SEALED_FOLD,
  tuningFolds,
} from "./sweepStats.ts";
import { flagReader } from "./flagReader.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";

const MIN_FILLED = 30; // the same floor the market-unit gate uses

type Bucket = { filled: number; sumR: number };

function expectancy(bucket: Bucket): number | null {
  return bucket.filled >= MIN_FILLED ? bucket.sumR / bucket.filled : null;
}

const VALUE_FLAGS = new Set(["--markets", "--out"]);

async function main() {
  const argv = process.argv.slice(2);
  // POSITIVE membership test (#364 round 50, finding 2). The old form
  // consumed the token after EVERY --flag, so a boolean flag — or a
  // typo'd one — ate the shard path following it and the run graded a
  // corpus one shard short of the one the operator named. That is the
  // defect round 44 found in the two 4d scripts; the derived scan
  // surfaced it here.
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      if (VALUE_FLAGS.has(argv[index])) index += 1;
      continue;
    }
    paths.push(argv[index]);
  }
  const { str } = flagReader(argv, VALUE_FLAGS);
  const wanted = new Map<string, string>();
  for (const pair of (str("--markets") ?? "").split(";")) {
    const [symbol, variant] = pair.split("|");
    if (symbol && variant) wanted.set(symbol.trim(), variant.trim());
  }
  const outPath = str("--out") ??
    "docs/research/baseline-2026-08-10/4d-threshold-rescue.json";
  // A run over zero rows cannot report a verdict — WIF-4, the law
  // roster-expectancy-audit states at its own door and this file had no
  // form of (#364 round 53, finding 2). Both inputs are refusals, because
  // both produce the SAME artifact: `report` stays {} and the summary
  // line reads "0 of 0 markets have a select-positive threshold", which
  // is indistinguishable from a real corpus in which no threshold
  // rescued anything — and this script exists to answer whether a
  // negative cell can be rescued, so "no rescue found" is a decision
  // input, never a shrug. --markets carries no default, and an empty one
  // matches nothing: `wanted.get(symbol)` is undefined for every row and
  // every row returns early.
  if (paths.length === 0) {
    throw new Error(
      "threshold-rescue: no shard paths given. Pass the sweep shards " +
        "explicitly; a run over zero rows cannot report a verdict.",
    );
  }
  if (wanted.size === 0) {
    throw new Error(
      "threshold-rescue: --markets named no (symbol|variant) cell. Every " +
        "row is filtered against this map, so an empty one reads the whole " +
        "corpus and reports on nothing; pass --markets SYM|variant;… .",
    );
  }

  type Row = { filled: boolean; r: number; score: number };
  const rowsBySymbol = new Map<string, Row[]>();
  let sealedRows = 0;

  for (const path of paths) {
    // R0: the one-clock door — a corpus that cannot state its clock (or
    // whose witnesses condemn it) is refused here too, not only in the
    // aggregation readers. These five scripts produced the invalidated
    // 4d-era figures by reading emits bare. The manifest half comes FIRST:
    // the acceptance mode and the fold vocabulary must both be known
    // before the first row is read.
    const corpusManifest = assertManifest(path);
    // The premise this reader opens by STATING, now asserted. A gated sweep
    // emits only rows that passed the confidence gate, so reading one here
    // reports a curve built from survivors and calls it the population.
    assertAcceptanceMode(path, corpusManifest, { captureAll: true });
    const folds = tuningFolds(corpusManifest);
    const manifest = assertManifestedCorpusSync(path, (row) => {
      const symbol = row.symbol;
      if (!symbol) return;
      const variant = typeof row.variant === "string" ? row.variant : "baseline";
      if (wanted.get(symbol) !== variant) return;
      // Classified by the split the sweep stamped on the row — never re-cut
      // here — and BEFORE the acceptance filter: a named market's row in a
      // fold this reader cannot name is a corpus it does not understand.
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
      // The tradeable stream: the variant's own payoff/regime gates said
      // yes. The confidence gate was open (threshold 0), which is what
      // makes this a clean threshold read.
      if (row.accepted !== true) return;
      const score = Number(row.confidenceScore);
      const r = Number(row.realizedR);
      if (!Number.isFinite(score) || !Number.isFinite(r)) return;
      let bucket = rowsBySymbol.get(symbol);
      if (!bucket) {
        bucket = [];
        rowsBySymbol.set(symbol, bucket);
      }
      bucket.push({ filled: row.outcome !== "unfilled", r, score });
    });
    sealedRows += manifest.sealedRows;
  }

  const report: Record<string, unknown> = {};
  for (const [symbol, rows] of rowsBySymbol) {
    const candidates: Array<{
      selectE: number | null;
      selectFilled: number;
      threshold: number;
    }> = [];
    for (let threshold = 0; threshold <= 95; threshold += 5) {
      const select: Bucket = { filled: 0, sumR: 0 };
      for (const row of rows) {
        if (row.score < threshold || !row.filled) continue;
        select.filled += 1;
        select.sumR += row.r;
      }
      candidates.push({
        selectE: expectancy(select),
        selectFilled: select.filled,
        threshold,
      });
    }
    // A rescue is the LOWEST threshold POSITIVE on the select fold with
    // sample behind it (`expectancy` is null below MIN_FILLED), so the
    // market keeps as much of its stream as the evidence allows. Select
    // alone: the confirm fold confirms, through the ledgered read, and
    // never chooses.
    const rescue = candidates.find((candidate) =>
      candidate.selectE !== null && candidate.selectE > 0
    ) ?? null;
    report[symbol] = { candidates, rescue };
  }

  // The third route to "0 of 0": shards and cells both given, and not one
  // named cell found a row (a variant name that does not appear, a market
  // swept under a different one). The two inputs above cannot see this —
  // only the corpus can — and the artifact it would write is the same
  // empty one (#364 round 53, finding 2).
  if (Object.keys(report).length === 0) {
    throw new Error(
      `threshold-rescue: none of the ${wanted.size} named cell(s) matched a ` +
        `row across ${paths.length} shard(s) — check the variant names ` +
        `against the corpus; an empty report cannot be read as "no rescue ` +
        `available".`,
    );
  }
  writeResearchArtifact(outPath, {
    minFilled: MIN_FILLED,
    report,
    rule: "the lowest threshold whose select-fold expectancy is positive " +
      `on at least minFilled fills; the ${SEALED_FOLD} fold is sealed and ` +
      "never chooses — a rescue is a candidate for the ledgered confirm read",
    sealed: { fold: SEALED_FOLD, rowsWithheld: sealedRows },
  });
  const rescued = Object.values(report).filter((entry) =>
    (entry as { rescue: unknown }).rescue !== null
  ).length;
  console.log(
    `threshold rescue: ${rescued} of ${Object.keys(report).length} markets ` +
      `have a select-positive threshold; ${SEALED_FOLD} sealed ` +
      `(${sealedRows} rows withheld) -> ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
