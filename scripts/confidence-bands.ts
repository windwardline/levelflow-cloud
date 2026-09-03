/**
 * Confidence-band derivation from an instrumented sweep corpus.
 *
 * A `--capture-all` sweep emits every setup with its `confidenceScore`
 * regardless of whether the live gate would have taken it. That makes the
 * acceptance threshold a purely offline question: any candidate band can be
 * scored against one corpus without replaying a single bar. Geometry cannot
 * be evaluated this way (moving a target changes outcomes); a threshold can.
 *
 * Reports, per symbol and per asset class:
 *   - the outcome curve by confidence bucket, split by the manifest's two
 *     tuning folds (fit/select, or train/test on a legacy corpus)
 *   - the lowest threshold whose SELECT-fold expectancy is positive and stays
 *     positive for every higher bucket (monotone survival, not a lucky bin)
 *   - stop provenance (structure vs ATR cap), which says whether the stop
 *     cap is overriding market structure rather than bounding it
 *
 * Metrics mirror summarizeSweepOutcomes field for field: filled = outcome is
 * not "unfilled"; a win is take_profit OR tp1_partial; expectancy is mean
 * realizedR over FILLED setups only. Diverging from it once already produced
 * understated hit rates across an entire analysis.
 *
 * The confirm fold is sealed at the door (R4 act 1, 2026-09-02): this reads
 * the fit and select folds — train and test on a legacy corpus — and never
 * sees a confirm row.
 *
 *   npx tsx scripts/confidence-bands.ts <emit.jsonl> [more.jsonl ...]
 */
import {
  assertAcceptanceMode,
  assertManifest,
  assertManifestedCorpusStreaming,
  SEALED_FOLD,
  tuningFolds,
} from "./sweepStats.ts";
import {
  getAssetType,
  getCategoryCalibration,
  type RegimeName,
} from "../supabase/functions/trade-analyzer/calibration.ts";

const BUCKET_WIDTH = 5;
/** A bucket thinner than this cannot support a threshold decision. */
const MIN_BUCKET_FILLED = 30;

type Row = {
  symbol: string;
  confidenceScore: number;
  estimatedRoundTripCost?: number;
  outcome: string;
  realizedR: number | null;
  regime: string;
  rewardRisk: number;
  riskDistance?: number;
  split: string;
  stopProvenance?: string;
  variant?: string;
};

/** The two folds a reader may tune on, as the manifest names them. */
type Tuning = ReturnType<typeof tuningFolds>;

/**
 * Isolating the confidence gate means holding the other two closed.
 * `--capture-all` bypasses confidence, payoff, AND regime together, so a raw
 * band curve blames confidence for setups the payoff floor had already
 * doomed — a real contamination measured here at roughly a third of the
 * corpus. Only rows that clear payoff and regime may speak to where the
 * confidence threshold belongs.
 */
/**
 * The cost weight per trade, derived the way the acceptance gate derives it:
 * the emitted round trip over the emitted risk distance, never a rounded
 * column. It REFUSES rather than skipping — a reader that silently drops a
 * live gate because an older corpus lacks its columns reports a population
 * production does not trade, and reports it as if it did.
 */
function costShareOfRow(row: Row): number {
  const cost = row.estimatedRoundTripCost;
  const risk = row.riskDistance;
  if (typeof cost !== "number" || !Number.isFinite(cost) || typeof risk !== "number" || !(risk > 0)) {
    throw new Error(
      `${row.symbol}: the calibration caps the cost weight per trade but this corpus emits no usable ` +
        `estimatedRoundTripCost/riskDistance, so the gate cannot be applied — re-sweep, or read a corpus that carries them`,
    );
  }
  return cost / risk;
}

function passesOtherGates(row: Row): boolean {
  const calibration = getCategoryCalibration(row.symbol);
  if (row.rewardRisk < calibration.minRewardRisk) {
    return false;
  }
  // THE FOURTH GATE (2026-09-03). Isolating the confidence gate means holding
  // every OTHER gate closed, and forex now caps the cost weight per trade; a
  // band curve that leaves it open blames confidence for rows the cost cap
  // had already refused. Derived as the acceptance gate derives it.
  if (
    calibration.maxCostShare !== undefined &&
    costShareOfRow(row) > calibration.maxCostShare
  ) {
    return false;
  }
  return !(calibration.blockedRegimes ?? []).includes(row.regime as RegimeName);
}

type Stats = {
  n: number;
  filled: number;
  wins: number;
  stops: number;
  rSum: number;
};

function emptyStats(): Stats {
  return { n: 0, filled: 0, wins: 0, stops: 0, rSum: 0 };
}

function add(stats: Stats, row: Row): void {
  stats.n += 1;
  if (row.outcome === "unfilled") {
    return;
  }
  stats.filled += 1;
  stats.rSum += typeof row.realizedR === "number" && Number.isFinite(row.realizedR)
    ? row.realizedR
    : 0;
  if (row.outcome === "take_profit" || row.outcome === "tp1_partial") {
    stats.wins += 1;
  }
  if (row.outcome === "stop_loss") {
    stats.stops += 1;
  }
}

function expectancy(stats: Stats): number | null {
  return stats.filled === 0 ? null : stats.rSum / stats.filled;
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "—" : `${((part / whole) * 100).toFixed(0)}%`;
}

function fmtR(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

/** Buckets keyed by their floor, so 67 -> 65 with BUCKET_WIDTH 5. */
function bucketOf(score: number): number {
  return Math.floor(score / BUCKET_WIDTH) * BUCKET_WIDTH;
}

type Group = {
  /** bucket floor -> split -> stats */
  buckets: Map<number, Map<string, Stats>>;
  provenance: Map<string, number>;
  total: Stats;
};

function emptyGroup(): Group {
  return { buckets: new Map(), provenance: new Map(), total: emptyStats() };
}

function record(group: Group, row: Row): void {
  add(group.total, row);
  const floor = bucketOf(row.confidenceScore);
  let bySplit = group.buckets.get(floor);
  if (!bySplit) {
    bySplit = new Map();
    group.buckets.set(floor, bySplit);
  }
  let stats = bySplit.get(row.split);
  if (!stats) {
    stats = emptyStats();
    bySplit.set(row.split, stats);
  }
  add(stats, row);
  if (row.outcome !== "unfilled" && row.stopProvenance) {
    group.provenance.set(
      row.stopProvenance,
      (group.provenance.get(row.stopProvenance) ?? 0) + 1,
    );
  }
}

/**
 * The lowest bucket floor whose SELECT-fold expectancy is positive AND stays
 * positive for every higher bucket carrying enough fills to judge. A single
 * positive bin proves nothing; survival up the curve is the claim.
 */
function survivingThreshold(
  group: Group,
  select: string,
): { floor: number | null; why: string } {
  const floors = [...group.buckets.keys()].sort((a, b) => a - b);
  const judgeable = floors.filter((floor) => {
    const held = group.buckets.get(floor)!.get(select);
    return held !== undefined && held.filled >= MIN_BUCKET_FILLED;
  });
  if (judgeable.length === 0) {
    return { floor: null, why: `no bucket carries ${MIN_BUCKET_FILLED}+ ${select} fills` };
  }
  for (const candidate of judgeable) {
    const atOrAbove = judgeable.filter((floor) => floor >= candidate);
    const allPositive = atOrAbove.every((floor) => {
      const value = expectancy(group.buckets.get(floor)!.get(select)!);
      return value !== null && value > 0;
    });
    if (allPositive) {
      return {
        floor: candidate,
        why: `${select} expectancy positive at ${candidate} and every judgeable bucket above`,
      };
    }
  }
  return {
    floor: null,
    why: `no floor survives — ${select} expectancy negative somewhere above every candidate`,
  };
}

function reportGroup(label: string, group: Group, tuning: Tuning): void {
  const verdict = survivingThreshold(group, tuning.select);
  console.log(`\n### ${label}`);
  console.log(
    `    all setups: n=${group.total.n} filled=${group.total.filled} ` +
      `win=${pct(group.total.wins, group.total.filled)} ` +
      `stop=${pct(group.total.stops, group.total.filled)} ` +
      `E=${fmtR(expectancy(group.total))}`,
  );
  if (group.provenance.size > 0) {
    const parts = [...group.provenance.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${key} ${pct(count, group.total.filled)}`);
    console.log(`    stop provenance: ${parts.join("  ")}`);
  }
  console.log(
    `    band  ${tuning.fit.padStart(26)}  ${tuning.select.padStart(26)}`,
  );
  console.log(
    `          ${"fill  win  stop      E".padStart(26)}  ${"fill  win  stop      E".padStart(26)}`,
  );
  for (const floor of [...group.buckets.keys()].sort((a, b) => a - b)) {
    const bySplit = group.buckets.get(floor)!;
    const cells: string[] = [];
    for (const split of [tuning.fit, tuning.select]) {
      const stats = bySplit.get(split);
      if (!stats) {
        cells.push("—".padStart(26));
        continue;
      }
      cells.push(
        `${String(stats.filled).padStart(5)} ${pct(stats.wins, stats.filled).padStart(4)} ` +
          `${pct(stats.stops, stats.filled).padStart(5)} ${fmtR(expectancy(stats)).padStart(7)}`,
      );
    }
    const mark = verdict.floor !== null && floor === verdict.floor ? " <-" : "";
    console.log(`    ${String(floor).padStart(4)}  ${cells.join("  ")}${mark}`);
  }
  console.log(`    VERDICT: ${verdict.floor ?? "none"} — ${verdict.why}`);
}

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (files.length === 0) {
    console.error("usage: confidence-bands.ts <emit.jsonl> [more.jsonl ...]");
    process.exit(1);
  }

  const bySymbol = new Map<string, Group>();
  const byClass = new Map<string, Group>();
  let read = 0;
  let gated = 0;
  /** Rows the door handed over, before any filter here — zero is a refusal. */
  let handed = 0;
  /** Rows the door withheld as the sealed fold, summed across shards. */
  let sealed = 0;
  // The fold names come from the manifest, never from this file; keyed by
  // vocabulary so shards of two shapes are refused as two corpora.
  const tunings = new Map<string, Tuning>();

  for (const file of files) {
    // R0: the one-clock door — no corpus aggregates without proving its
    // clock (#358 round 3: this reader decides a shipped scoring input).
    // The manifest half first, so the premise below is refused before a
    // single row is read.
    const corpusManifest = assertManifest(file);
    // The premise this reader opens by STATING, now asserted. A gated sweep
    // emits only rows that passed the confidence gate, so reading one here
    // reports a curve built from survivors and calls it the population.
    assertAcceptanceMode(file, corpusManifest, { captureAll: true });
    const vocabulary = tuningFolds(corpusManifest);
    tunings.set(`${vocabulary.fit}/${vocabulary.select}`, vocabulary);
    // The row half is SEALED (R4 act 1): a confirm row never reaches this
    // callback, and a holed line refuses the corpus instead of being skipped.
    const manifest = await assertManifestedCorpusStreaming(file, (raw) => {
      const row = raw as unknown as Row;
      // The door seals confirm; any other split is a vocabulary this reader
      // does not know, refused by name rather than tallied and never printed.
      if (row.split !== vocabulary.fit && row.split !== vocabulary.select) {
        throw new Error(
          `${file}: row carries split "${row.split}", which is neither ` +
            `${vocabulary.fit} nor ${vocabulary.select} — an unknown fold ` +
            `is refused, not pooled`,
        );
      }
      handed += 1;
      // Grid runs emit multiple variants into one file; only the shipped
      // configuration belongs in a band derivation.
      if (row.variant && row.variant !== "baseline") {
        return;
      }
      if (!passesOtherGates(row)) {
        gated += 1;
        return;
      }
      read += 1;
      let group = bySymbol.get(row.symbol);
      if (!group) {
        group = emptyGroup();
        bySymbol.set(row.symbol, group);
      }
      record(group, row);

      const assetType = getAssetType(row.symbol);
      let classGroup = byClass.get(assetType);
      if (!classGroup) {
        classGroup = emptyGroup();
        byClass.set(assetType, classGroup);
      }
      record(classGroup, row);
    });
    sealed += manifest.sealedRows;
  }

  if (tunings.size !== 1) {
    console.error(
      `confidence-bands: the shards name ${tunings.size} fold vocabularies ` +
        `[${[...tunings.keys()].join(", ")}] — two vocabularies are two ` +
        `corpora, not one`,
    );
    process.exit(1);
  }
  const [tuning] = tunings.values();
  // The door handed nothing: a curve over zero rows is not a curve, and when
  // every row sat in the sealed fold the operator needs to hear that the
  // seal, not the corpus, is why.
  if (handed === 0) {
    console.error(
      `confidence-bands: the door handed this reader NO rows` +
        (sealed > 0
          ? ` — all ${sealed} sit in the sealed ${SEALED_FOLD} fold and were ` +
            `withheld at the door (R4 act 1); nothing readable remains`
          : ` — the corpus holds none`) +
        `. That is a refusal, not a result.`,
    );
    process.exit(1);
  }

  console.log(
    `read ${read} baseline rows that clear payoff+regime (${gated} dropped by those ` +
      `gates, ${sealed} ${SEALED_FOLD} rows sealed at the door) from ${files.length} file(s)`,
  );
  console.log(`\n${"=".repeat(72)}\nBY ASSET CLASS\n${"=".repeat(72)}`);
  for (const key of [...byClass.keys()].sort()) {
    reportGroup(key, byClass.get(key)!, tuning);
  }
  console.log(`\n${"=".repeat(72)}\nBY SYMBOL\n${"=".repeat(72)}`);
  for (const key of [...bySymbol.keys()].sort()) {
    reportGroup(key, bySymbol.get(key)!, tuning);
  }
}

await main();
