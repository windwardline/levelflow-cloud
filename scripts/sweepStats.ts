// Item 3, first commit: the one stats vocabulary for every emit-reader.
// Seven readers shared ZERO code — five private add/expectancy
// implementations, one of which had already drifted into regex-classified
// wins and all-rows denominators before sweep-analysis.ts recorded the
// repair. The engine's definitions (summarizeSweepOutcomes) are the
// authority: filled = outcome !== "unfilled"; a win is take_profit OR
// tp1_partial; a stop is stop_loss; ambiguous is its own column, never
// folded into a denominator; expectancy is mean realizedR OVER FILLED.
//
// Two additions the old readers could not make:
// - rSumSq (3a): no reader carried a dispersion term, so the acceptance
//   bar's ±0.005 lived only in prose and every "improvement" was stated
//   without a standard error. Deviation is measured from the corpus, never
//   assumed from a flag.
// - assertManifestedCorpus (2i's door): a reader aggregates a corpus only
//   after recomputing the manifest hash over the manifest's own payload —
//   an emit whose conditions were edited, or that never recorded them, is
//   refused instead of averaged.

import { closeSync, createReadStream, openSync, readFileSync, readSync } from "node:fs";
import { createInterface } from "node:readline";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import {
  getAssetType,
  hasKnownAssetType,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { CALENDAR_CLOCK } from "./clockWitness.ts";
import {
  type SeriesFacts,
  sha256Hex,
  stableStringify,
  type SweepConditions,
  type SweepManifest,
} from "./sweepManifest.ts";

export type SweepEmitRow = {
  outcome: string;
  realizedR: number;
  symbol: string;
  [key: string]: unknown;
};

export type SweepStats = {
  ambiguous: number;
  // #364 round 4, finding 2: rows the resolver marked
  // noBarsInReviewWindow — data absence, not market evidence. Held OUT
  // of n so fill rate (filled/n) states its own denominator: E2's
  // premise (data absence is not a market verdict) is enforced at the
  // resolver and recorded per corpus row, and an aggregator that blends
  // those rows back into the denominator is the exact unstated-
  // denominator class the remediation program exists to end.
  dataAbsent: number;
  filled: number;
  n: number;
  rSum: number;
  rSumSq: number;
  stops: number;
  wins: number;
};

export function emptyStats(): SweepStats {
  return {
    ambiguous: 0,
    dataAbsent: 0,
    filled: 0,
    n: 0,
    rSum: 0,
    rSumSq: 0,
    stops: 0,
    wins: 0,
  };
}

/**
 * Every raw-row key this vocabulary's partition and accounting read
 * (#364 round 7, finding 2): vocabularyRow projects exactly this list,
 * and the input-side pin in tests/sweepStats.test.ts scans addOutcome's
 * own source for `row.<field>` reads and asserts each one is here — so
 * a new partition fact added to addOutcome without joining this list
 * fails in CI instead of arriving as undefined on every projected row
 * (round 6's defect, made structurally impossible on the input side the
 * way the rollup pin already made it on the output side).
 */
export const VOCABULARY_ROW_KEYS = [
  "noBarsInReviewWindow",
  "outcome",
  "realizedR",
  "symbol",
] as const;

/**
 * The vocabulary's own projection off a raw emit row (#364 round 6,
 * finding 1). A reader that narrows rows for memory (sweep-analysis
 * holds a projection of a 505 MB corpus) spreads THIS through its
 * projection instead of enumerating fields — round 5's raw-row fix was
 * applied to a row that was itself a sixteen-field rebuild from one
 * layer up, so the marker never arrived and dataAbsent was structurally
 * zero there. Derived from VOCABULARY_ROW_KEYS so a key added there
 * flows into every projecting reader by construction; values pass
 * through verbatim (realizedR included) so each reader keeps its own
 * null-coercion.
 */
export function vocabularyRow(raw: SweepEmitRow): SweepEmitRow {
  const projected: Record<string, unknown> = {};
  for (const key of VOCABULARY_ROW_KEYS) {
    if (raw[key] !== undefined) {
      projected[key] = raw[key];
    }
  }
  return projected as SweepEmitRow;
}

export function addOutcome(stats: SweepStats, row: SweepEmitRow): void {
  if (row.noBarsInReviewWindow === true) {
    stats.dataAbsent += 1;
    return;
  }
  stats.n += 1;
  if (row.outcome === "unfilled") {
    return;
  }
  stats.filled += 1;
  const realized = Number(row.realizedR);
  if (Number.isFinite(realized)) {
    stats.rSum += realized;
    stats.rSumSq += realized * realized;
  }
  if (row.outcome === "take_profit" || row.outcome === "tp1_partial") {
    stats.wins += 1;
  } else if (row.outcome === "stop_loss") {
    stats.stops += 1;
  } else if (row.outcome === "ambiguous") {
    stats.ambiguous += 1;
  }
}

export function expectancy(stats: SweepStats): number | null {
  return stats.filled > 0 ? stats.rSum / stats.filled : null;
}

/** Sample standard deviation of realized R over filled outcomes. */
export function rStdDev(stats: SweepStats): number | null {
  if (stats.filled < 2) {
    return null;
  }
  const variance =
    (stats.rSumSq - (stats.rSum * stats.rSum) / stats.filled) /
    (stats.filled - 1);
  return Math.sqrt(Math.max(variance, 0));
}

export function rStandardError(stats: SweepStats): number | null {
  const deviation = rStdDev(stats);
  return deviation === null ? null : deviation / Math.sqrt(stats.filled);
}

/**
 * 3a: the pooled mean's standard error CLUSTERED BY MARKET. Outcomes
 * inside one market share regime, session and calibration, so treating
 * them as independent understates the error of a class rollup — the
 * exact overconfidence the ±0.005 prose constant hid. Cluster-robust
 * form: SE² = Σ_market (rSum_m − filled_m × pooledMean)² / filledTotal².
 * Null below two filled clusters — one market cannot price its own
 * between-market spread.
 */
export function clusteredStandardError(
  clusters: SweepStats[],
): number | null {
  const filledClusters = clusters.filter((cluster) => cluster.filled > 0);
  if (filledClusters.length < 2) {
    return null;
  }
  const filledTotal = filledClusters.reduce(
    (sum, cluster) => sum + cluster.filled,
    0,
  );
  const pooledMean = filledClusters.reduce(
    (sum, cluster) => sum + cluster.rSum,
    0,
  ) / filledTotal;
  const residualSquares = filledClusters.reduce((sum, cluster) => {
    const residual = cluster.rSum - cluster.filled * pooledMean;
    return sum + residual * residual;
  }, 0);
  return Math.sqrt(residualSquares) / filledTotal;
}

/**
 * The one door to a corpus: rows plus a manifest whose hash verifies.
 * Throws on a missing manifest, a hash mismatch, or an unparseable row —
 * a hole in the corpus is a refused corpus, not a smaller one.
 */
/**
 * The streaming form of the same door, for corpora too large to hold
 * (the 2026-08-05 run emitted 505MB): the manifest hash verifies BEFORE
 * a single row is read, rows stream one at a time, and an unparseable
 * line still refuses the whole corpus.
 */
export async function assertManifestedCorpusStreaming(
  emitPath: string,
  onRow: (row: SweepEmitRow) => void,
): Promise<SweepManifest> {
  const manifest = verifyManifest(emitPath);
  const reader = createInterface({
    crlfDelay: Number.POSITIVE_INFINITY,
    input: createReadStream(emitPath),
  });
  let lineNumber = 0;
  for await (const line of reader) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      onRow(JSON.parse(trimmed) as SweepEmitRow);
    } catch {
      throw new Error(
        `${emitPath}: line ${lineNumber} failed to parse — a holed corpus is refused, not shrunk`,
      );
    }
  }
  return manifest;
}

/**
 * The manifest half of the door alone — for readers (4a's data-limits)
 * that need the corpus's verified conditions but not a single row.
 */
export function assertManifest(emitPath: string): SweepManifest {
  return verifyManifest(emitPath);
}

/**
 * Synchronous chunked line reader: the 2026-08-10 baseline emit is 1.2GB,
 * past Node's maximum string length — readFileSync-as-one-string can never
 * read a full-depth corpus. 64KB reads, lines split as they complete.
 */
export function readLinesSync(
  path: string,
  onLine: (line: string, lineNumber: number) => void,
): void {
  const fd = openSync(path, "r");
  try {
    const chunk = Buffer.alloc(65_536);
    let carry = "";
    let lineNumber = 0;
    for (;;) {
      const bytes = readSync(fd, chunk, 0, chunk.length, null);
      if (bytes === 0) {
        break;
      }
      carry += chunk.toString("utf8", 0, bytes);
      let newlineIndex = carry.indexOf("\n");
      while (newlineIndex !== -1) {
        lineNumber += 1;
        onLine(carry.slice(0, newlineIndex), lineNumber);
        carry = carry.slice(newlineIndex + 1);
        newlineIndex = carry.indexOf("\n");
      }
    }
    if (carry.trim()) {
      onLine(carry, lineNumber + 1);
    }
  } finally {
    closeSync(fd);
  }
}

function verifyManifest(emitPath: string): SweepManifest {
  let manifestText: string;
  try {
    manifestText = readFileSync(`${emitPath}.manifest.json`, "utf8");
  } catch {
    throw new Error(
      `${emitPath}: no manifest beside the emit — an undescribed corpus cannot be aggregated (2i)`,
    );
  }
  const manifest = JSON.parse(manifestText) as SweepManifest;
  const { generatedAt: _generatedAt, manifestHash, ...hashedPayload } =
    manifest;
  const recomputed = sha256Hex(stableStringify(hashedPayload));
  if (recomputed !== manifestHash) {
    throw new Error(
      `${emitPath}: manifest hash mismatch — recorded ${manifestHash}, recomputed ${recomputed}; the corpus's stated conditions cannot be trusted`,
    );
  }
  // R0 one clock: a corpus that does not state its normalization predates
  // the clock stamp and is the 2026-08-11 mixed-clock population by
  // definition — refused, not read. This deliberately kills the legacy
  // two-split affordance below for pre-R0 corpora: the item-2 baseline was
  // invalidated with the rest.
  if (!manifest.clock?.normalizer || !manifest.clock?.calendar) {
    throw new Error(
      `${emitPath}: manifest carries no clock block — a corpus built before ` +
        `the R0 one-clock rebuild is mixed-clock (see docs/research/` +
        `remediation-program-2026-08-11.md) and cannot be aggregated; ` +
        `re-sweep on the rebuilt cache`,
    );
  }
  // And the stated clock must be THIS build's clock (#358 round 4): a
  // BAR_CLOCK bump supersedes every corpus swept before it — the store
  // guard forces the CACHE rebuild, and this forces the RE-SWEEP, closing
  // the same "a fix cannot reach an already-persisted artifact" mechanism
  // one layer up. A deliberate historical read is an explicit act:
  //   LEVELFLOW_ALLOW_SUPERSEDED_CLOCK=1
  let historicalRead = false;
  if (
    manifest.clock.normalizer !== BAR_CLOCK ||
    manifest.clock.calendar !== CALENDAR_CLOCK
  ) {
    if (process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK !== "1") {
      throw new Error(
        `${emitPath}: corpus swept under clock "${manifest.clock.normalizer}"/` +
          `"${manifest.clock.calendar}" but this build is "${BAR_CLOCK}"/` +
          `"${CALENDAR_CLOCK}" — a superseded-clock corpus is re-swept, not ` +
          `aggregated (set LEVELFLOW_ALLOW_SUPERSEDED_CLOCK=1 only for a ` +
          `deliberate historical read)`,
      );
    }
    // The override never passes silently (#358 round 4b): a figure read
    // under it must be distinguishable from one that passed the door, or
    // a superseded-clock number gets cited later as if it were clean.
    console.warn(
      `SUPERSEDED-CLOCK READ: ${emitPath} was swept under ` +
        `"${manifest.clock.normalizer}"/"${manifest.clock.calendar}"; this ` +
        `build is "${BAR_CLOCK}"/"${CALENDAR_CLOCK}". Figures derived from ` +
        `this corpus are historical, not current.`,
    );
    historicalRead = true;
  }
  for (const entry of manifest.symbols ?? []) {
    for (const [timeframe, facts] of Object.entries(entry.series ?? {})) {
      const verdict = facts.clock?.verdict;
      if (verdict === "naive" || verdict === "mixed") {
        throw new Error(
          `${emitPath}: ${entry.symbol} ${timeframe} series witnesses a ` +
            `"${verdict}" clock — the corpus disagrees with its own stated ` +
            `normalization and is refused`,
        );
      }
    }
    if (entry.crossSeriesClock?.verdict === "shifted") {
      throw new Error(
        `${emitPath}: ${entry.symbol} 5-minute series registers against the ` +
          `15-minute primary at a ${entry.crossSeriesClock.bestShiftHours}h ` +
          `shift — the mixed-clock signature; the corpus is refused`,
      );
    }
    assertFiveMinuteDensity(emitPath, entry);
  }
  // E6 (R1b): the corpus states the score-input terms it was measured
  // under, or it is refused. This check deliberately runs LAST — data
  // poison (the witness refusals above) outranks unstated terms in the
  // diagnosis — and deliberately has no escape hatch of its own. The
  // honest provenance (#364 round 7, smaller): R1b bumps neither clock,
  // so a corpus swept in the R0-to-R1b window WOULD be current-clock and
  // legitimately condition-less — none exists because the R0 rebuild has
  // not produced its first corpus and HANDOFF schedules the one re-sweep
  // as R3's, a scheduling fact, not a definitional one. If such a corpus
  // ever surfaces, this refusal is still the right behaviour: it was
  // measured under unstated terms, and the remedy is the R3 re-sweep,
  // not an override. The literals are the contract: a corpus stating
  // other terms was measured under a different sweep and cannot
  // aggregate beside these.
  if (!historicalRead) {
    const conditions = manifest.conditions as
      | Record<string, unknown>
      | undefined;
    if (!conditions) {
      throw new Error(
        `${emitPath}: manifest carries no conditions block — a corpus swept ` +
          `before the R1b stated-inputs rebuild measured macroAdjustment as ` +
          `a hardwired zero (see docs/research/r1-divergence-map-2026-08-18` +
          `.md, E6) and is re-swept, not aggregated`,
      );
    }
    const expectedConditions: SweepConditions = {
      macroAdjustment: "historical-treasury-curve",
      providerWarningCount: "zero-by-construction",
      weightAdjustment: "raw-engine-zero",
    };
    for (const [term, expected] of Object.entries(expectedConditions)) {
      if (conditions[term] !== expected) {
        throw new Error(
          `${emitPath}: conditions.${term} is ${
            JSON.stringify(conditions[term])
          } but this build's readers understand ${JSON.stringify(expected)} ` +
            `— a corpus measured under other terms is refused, not aggregated`,
        );
      }
    }
    // #364 round 2, finding 1: conditions.macroAdjustment is a claim,
    // and the door checks the EVIDENCE, not just the literal — an empty
    // curve scores the hardwired zero E6 abolished; a holed or
    // stale-tailed one is worse, scoring months-old rows as fresh where
    // the visibility pointer stalls. The LEADING edge (#364 round 3,
    // finding 2) is asserted with one tolerance: a curve starting at
    // the provider's own 2013 floor passes regardless of corpus depth —
    // decisions before it score stance "unavailable", which the emit
    // now records per row (macroStance) so the zero is visible
    // downstream — but a curve that starts BOTH after that floor AND
    // after the corpus does is a shallow rebuild (the provider's floor
    // moved, or the store was rebuilt partial), restoring E6's original
    // zero under the claim, and is refused. Seven days exceeds any real
    // Treasury publication gap (weekend plus holiday runs are <=5).
    const curve = manifest.treasuryCurve as
      | { count?: number; largestGapMs?: number; lastTime?: number | null }
      | undefined;
    if (!curve || !Number.isFinite(curve.count) || (curve.count ?? 0) < 2) {
      throw new Error(
        `${emitPath}: conditions claim historical-treasury-curve but the ` +
          `manifest carries ${
            curve ? `${curve.count ?? 0} curve rows` : "no treasuryCurve facts"
          } — a claim without evidence is refused; re-sweep with the curve ` +
          `store intact`,
      );
    }
    const weekMs = 7 * 86_400_000;
    if ((curve.largestGapMs ?? 0) > weekMs) {
      throw new Error(
        `${emitPath}: Treasury curve has a ${
          Math.round((curve.largestGapMs ?? 0) / 86_400_000)
        }-day interior hole — decisions inside it scored months-stale rows ` +
          `as fresh; delete the treasury-rates store, refetch full history, ` +
          `and re-sweep`,
      );
    }
    let corpusEndMs = Number.NEGATIVE_INFINITY;
    let corpusStartMs = Number.POSITIVE_INFINITY;
    for (const entry of manifest.symbols ?? []) {
      const facts = entry.series?.["15min"];
      if (typeof facts?.lastTime === "number" && facts.lastTime > corpusEndMs) {
        corpusEndMs = facts.lastTime;
      }
      if (
        typeof facts?.firstTime === "number" && facts.firstTime < corpusStartMs
      ) {
        corpusStartMs = facts.firstTime;
      }
    }
    if (
      Number.isFinite(corpusEndMs) &&
      typeof curve.lastTime === "number" &&
      curve.lastTime < corpusEndMs - weekMs
    ) {
      throw new Error(
        `${emitPath}: Treasury curve ends ${
          new Date(curve.lastTime).toISOString().slice(0, 10)
        } but the corpus runs to ${
          new Date(corpusEndMs).toISOString().slice(0, 10)
        } — every later decision scored the curve's stale tail as fresh; ` +
          `the corpus is refused`,
      );
    }
    // The 2013-01-01 floor the driver's fetchFull hard-codes, plus a
    // week: a curve reaching its own provider floor is as deep as the
    // claim can honestly be.
    const treasuryFloorMs = Date.UTC(2013, 0, 8);
    const curveFirst = (curve as { firstTime?: number | null }).firstTime;
    if (
      Number.isFinite(corpusStartMs) &&
      typeof curveFirst === "number" &&
      curveFirst > treasuryFloorMs &&
      curveFirst > corpusStartMs
    ) {
      throw new Error(
        `${emitPath}: Treasury curve starts ${
          new Date(curveFirst).toISOString().slice(0, 10)
        } — after both the provider's 2013 floor and the corpus start (${
          new Date(corpusStartMs).toISOString().slice(0, 10)
        }); a shallow rebuilt store scores those decisions at the ` +
          `hardwired zero the claim abolished, and the corpus is refused`,
      );
    }
  }
  return manifest;
}

// E2's corpus-door half (R1b): the per-symbol 5-minute density assertion.
// This door carries verify-cache-clock's stated blind band — its ratio
// instrument accepts [2.5, 3.5], and a provider cap of ~2,386-2,784 rows
// per response clips ONLY the 15-minute series (29-day chunks, worst
// 2,884 rows; 5-minute chunks max 1,740) by <=~14%, leaving the ratio in
// band — so the door binds ABSOLUTE 5-minute rows per calendar day, not
// only the 5/15 ratio, and binds the ratio TIGHTER than the cache
// instrument can afford to.
//
// Every constant below is measured, not assumed (FMP 5-minute probe,
// 2026-08-11..17, rows per CALENDAR day averaged over the week —
// weekends inside): BTCUSD 288.0 and THETAUSD 287.9 (crypto is
// full-density across the class), EURUSD 205.6, XAUUSD 197.1,
// ESUSD/CLUSD 197.7, PAUSD 198.7 (slot-dense despite thin volume),
// ZCUSX 146.7, ^GDAXI 73.6, ^GSPC 55.7, ^AXJO ~52, ^N225 48.6, LEUSX
// 40.0 — while ZRUSD ~36 prints with intra-session holes, XC ~8.6 prints
// only where trades occurred, and QG serves no 5-minute data at all.
// That last group is the design constraint: trade-sparse series are
// HONEST provider data whose parent-child arithmetic legitimately
// degenerates (a 15-minute parent holding one print yields one 5-minute
// child), so a fixed law over every symbol would either false-refuse
// them or be vacuous for the dense ones. The instruments therefore
// self-select:
// - The tight ratio judges only symbols whose PRIMARY runs >=60
//   15-minute rows/day — the near-24h markets (weekly-average arithmetic:
//   crypto 96, forex 68.5, metals 65.7, ES-class futures 65.9; the
//   densest excluded symbol is ^GDAXI at 24.5). Exactly these are the
//   markets whose 29-day chunks approach provider caps, i.e. the band's
//   home; a clipped primary moves a true ~3.0 ratio above 3.25 at a
//   >=7.7% clip, shrinking the band's blind residue from <=14.3% to
//   <=7.7%, and any cap low enough to clip the 5-minute chunks drags the
//   ratio far below 2.7.
// - The absolute floors bind the four structurally deterministic classes
//   (probed margin under the measured week: crypto 260, forex 150,
//   metals 140, energies 140) plus cash indices at 34 (all four members
//   measured 48.6-73.6; their chunks sit far from any cap, so the floor
//   is the holed-store detector). futures, agriculture and livestock
//   carry no absolute floor: their spread spans 8.6..197.7 rows/day, so
//   any shared floor either condemns honest sparseness or defends
//   nothing — their liquid members are exactly the ones the ratio gate
//   already judges.
const DENSITY_MIN_SPAN_DAYS = 5;
const DENSITY_RATIO_PRIMARY_FLOOR = 60;
const DENSITY_RATIO_MIN = 2.7;
const DENSITY_RATIO_MAX = 3.25;
const FIVE_MIN_CLASS_FLOORS: Partial<
  Record<ReturnType<typeof getAssetType>, number>
> = {
  crypto: 260,
  energies: 140,
  forex: 150,
  indices: 34,
  metals: 140,
};

// This assertion runs inside the per-symbol loop and therefore binds
// DELIBERATE HISTORICAL READS too, unlike the conditions check below it
// (#364 round 1, finding 5 — intended, stated): the superseded-clock
// override accepts superseded MEASUREMENT TERMS, never poisoned data. A
// clipped or holed series is wrong, not old — the same standing as the
// clock witnesses beside it in the loop, which have always bound
// historical reads. A historical corpus this refuses was measuring
// against data the door can now prove defective; there is nothing
// honest to read from it.
export function assertFiveMinuteDensity(
  emitPath: string,
  entry: { series?: Record<string, SeriesFacts>; symbol: string },
): void {
  const five = entry.series?.["5min"];
  const fifteen = entry.series?.["15min"];
  // An ABSENT 5-minute series is honest degradation, not a density lie:
  // the sweep grades those rows at 15-minute physics and each emit row
  // carries its tier (resolutionIntervalMs). Sub-week spans cannot
  // separate a holiday from a hole, so young fixtures stay silent too.
  if (!five || five.count === 0 || !fifteen || fifteen.count === 0) {
    return;
  }
  if (
    five.spanDays < DENSITY_MIN_SPAN_DAYS ||
    fifteen.spanDays < DENSITY_MIN_SPAN_DAYS
  ) {
    return;
  }
  const fivePerDay = five.count / five.spanDays;
  const fifteenPerDay = fifteen.count / fifteen.spanDays;
  // The roster is the class authority; an off-roster symbol (which only a
  // hand-built manifest can carry — the driver refuses them) gets no
  // class floor rather than inheriting getAssetType's forex fallback.
  const floor = hasKnownAssetType(entry.symbol)
    ? FIVE_MIN_CLASS_FLOORS[getAssetType(entry.symbol)]
    : undefined;
  if (floor !== undefined && fivePerDay < floor) {
    throw new Error(
      `${emitPath}: ${entry.symbol} 5-minute series runs ${
        fivePerDay.toFixed(1)
      } rows/day over ${five.spanDays} days — under the ${
        getAssetType(entry.symbol)
      } floor of ${floor} (measured 2026-08-11..17); the series is clipped, ` +
        `holed, or not this symbol's feed, and the corpus is refused`,
    );
  }
  if (fifteenPerDay >= DENSITY_RATIO_PRIMARY_FLOOR) {
    const ratio = fivePerDay / fifteenPerDay;
    if (ratio < DENSITY_RATIO_MIN || ratio > DENSITY_RATIO_MAX) {
      throw new Error(
        `${emitPath}: ${entry.symbol} 5min/15min density ${ratio.toFixed(2)} ` +
          `(${fivePerDay.toFixed(1)}/${fifteenPerDay.toFixed(1)} rows/day) ` +
          `outside [${DENSITY_RATIO_MIN}, ${DENSITY_RATIO_MAX}] — above ` +
          `means a clipped 15-minute primary (the verify-cache-clock blind ` +
          `band), below means a clipped or holed 5-minute series; the ` +
          `corpus is refused`,
      );
    }
  }
}

export function assertManifestedCorpus(emitPath: string): {
  manifest: SweepManifest;
  rows: SweepEmitRow[];
} {
  const manifest = verifyManifest(emitPath);

  const rows: SweepEmitRow[] = [];
  readLinesSync(emitPath, (line, lineNumber) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    try {
      rows.push(JSON.parse(trimmed) as SweepEmitRow);
    } catch {
      throw new Error(
        `${emitPath}: line ${lineNumber} failed to parse — a holed corpus is refused, not shrunk`,
      );
    }
  });
  return { manifest, rows };
}
