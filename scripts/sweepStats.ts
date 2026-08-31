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
import { ECON_CALENDAR_CLOCK } from "./clockWitness.ts";
import {
  type CrossSeriesDensity,
  type TreasuryCurveFacts,
  type SeriesFacts,
  sha256Hex,
  stableStringify,
  type SweepConditions,
  type SweepManifest,
  TREASURY_FETCH_START_MS,
  treasuryGapTouching,
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
    // The try wraps ONLY the parse (#364 round 28, finding 2): every
    // reader's per-row logic runs in this callback, and a bare catch
    // around it reported any reader defect as corpus corruption — a
    // re-sweep remedy that cannot clear a code bug, with the real
    // error and stack discarded. A parse failure keeps the
    // holed-corpus diagnosis; a reader defect surfaces as itself.
    let row: SweepEmitRow;
    try {
      row = JSON.parse(trimmed) as SweepEmitRow;
    } catch {
      throw new Error(
        `${emitPath}: line ${lineNumber} failed to parse — a holed corpus is refused, not shrunk`,
      );
    }
    onRow(row);
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
    manifest.clock.calendar !== ECON_CALENDAR_CLOCK
  ) {
    if (process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK !== "1") {
      throw new Error(
        `${emitPath}: corpus swept under clock "${manifest.clock.normalizer}"/` +
          `"${manifest.clock.calendar}" but this build is "${BAR_CLOCK}"/` +
          `"${ECON_CALENDAR_CLOCK}" — a superseded-clock corpus is re-swept, not ` +
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
        `build is "${BAR_CLOCK}"/"${ECON_CALENDAR_CLOCK}". Figures derived from ` +
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
    // C3: the grid registration, judged at the door. The relative check above
    // cannot see a one-sided shift on a market whose session sits inside the
    // UTC day — it read "aligned" at matchRateAtZero 1.000 against a real
    // 4-hour displacement on nine of them, all of which the density gate also
    // abstains for. This is the only instrument those nine have.
    if (
      entry.gridRegistration && entry.gridRegistration.verdict !== "registered"
    ) {
      throw new Error(
        `${emitPath}: ${entry.symbol} 15-minute parents do not bracket their ` +
          `own 5-minute children ` +
          `(${JSON.stringify(entry.gridRegistration)}) — the two series are ` +
          `not on one grid; the corpus is refused`,
      );
    }
    // R0f: the ABSOLUTE witness, judged at the door beside the relative one.
    // The check above cannot see a store whose two series are displaced
    // TOGETHER — it read "aligned" on three indices standing 6, 13 and 14
    // hours out of register, because a provider labelling bars in local
    // exchange time moves both. Only the venue anchor sees that, and until
    // 2026-08-24 no manifest carried it, so this door had no fact to judge.
    // A corpus written from displaced stores resolves every setup against
    // bars hours away from its own decision — the 2026-08-11 look-ahead
    // mechanism, on a different axis.
    if (entry.sessionAnchor?.verdict === "displaced") {
      throw new Error(
        `${emitPath}: ${entry.symbol} intraday bars do not open at its ` +
          `venue's session open (${JSON.stringify(entry.sessionAnchor)}) — ` +
          `the store's stamps are displaced from the venue clock; the ` +
          `corpus is refused`,
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
      availableTimeframeCount: "min-four-by-construction",
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
    // #364 round 16, finding 1: only the BLOCK'S ABSENCE is a terms gap
    // (a pre-R1b manifest measured under hardwired-zero macro, where no
    // curve was used and none can have poisoned anything) — refused on
    // the current path, exempt under the historical-read override. Facts
    // that ARE present get their integrity asserted below, OUTSIDE this
    // gate, on every read path: a holed or stale-tailed curve scored
    // non-zero stale macro adjustments no per-row field can reveal —
    // poison, not terms, the density door's standing. Without this
    // split, the next BAR_CLOCK bump would turn every post-R1b corpus
    // into a historical read whose real curve evidence nothing checks.
    if (!manifest.treasuryCurve) {
      throw new Error(
        `${emitPath}: conditions claim historical-treasury-curve but the ` +
          `manifest carries no treasuryCurve facts — a claim without ` +
          `evidence is refused; re-sweep with the curve store intact`,
      );
    }
    // #364 round 11, finding 2: crossSeriesDensity is evidence like the
    // curve facts — the driver writes it whenever both series have bars
    // and their windows meet, so on the current path its absence means
    // the manifest predates the fact, and missing evidence must buy a
    // refusal, never the weaker own-span fallback (which abstains for
    // most of the roster at depth). Manifests that genuinely predate
    // the fact are exactly the historical-read population, where the
    // fallback legitimately remains.
    for (const entry of manifest.symbols ?? []) {
      const five = entry.series?.["5min"];
      const fifteen = entry.series?.["15min"];
      if (
        five && five.count > 0 && fifteen && fifteen.count > 0 &&
        !entry.crossSeriesDensity
      ) {
        throw new Error(
          `${emitPath}: ${entry.symbol} carries both 5-minute and ` +
            `15-minute series but no crossSeriesDensity shared-window ` +
            `facts — the ratio's claim without its evidence is refused; ` +
            `re-sweep with the current driver`,
        );
      }
    }
  }
  // #364 round 2, finding 1 (re-gated round 16, finding 1): the door
  // checks the EVIDENCE, not just the literal — an empty curve scores
  // the hardwired zero E6 abolished; a holed or stale-tailed one is
  // worse, scoring months-old rows as fresh where the visibility
  // pointer stalls. The LEADING edge (#364 round 3, finding 2) is
  // asserted with one tolerance: a curve starting at the requested
  // fetch floor passes regardless of corpus depth — decisions before
  // it score stance "unavailable", visible per row (macroStance) — but
  // one starting BOTH after that floor AND after the corpus start is a
  // shallow rebuild, restoring E6's original zero under the claim.
  // Seven days exceeds any real Treasury publication gap (weekend plus
  // holiday runs are <=5). These checks bind EVERY read path whenever
  // the facts are present — present evidence saying the curve was
  // holed, stale-tailed, or shallow is data poison with the density
  // door's standing, not a superseded term the override may accept.
  // #364 round 18, smaller: narrowed against the EXPORTED type, so a
  // field rename in sweepManifest.ts breaks this file at compile time
  // instead of silently reverting a check to its fallback.
  const curve = manifest.treasuryCurve as TreasuryCurveFacts | undefined;
  if (curve) {
    if (!Number.isFinite(curve.count) || (curve.count ?? 0) < 2) {
      // #364 round 17, smaller: evidence voice, not the conditions
      // block's — this check also runs on historical reads, where the
      // conditions block may be absent entirely, so the refusal speaks
      // about the evidence itself.
      throw new Error(
        `${emitPath}: treasuryCurve facts carry ${
          curve.count ?? 0
        } rows — too thin to witness any curve, so every macro score in ` +
          `this corpus is unsupported; re-sweep with the curve store ` +
          `intact`,
      );
    }
    const weekMs = 7 * 86_400_000;
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
    // #364 round 14, finding 2: the hole check is corpus-relative like
    // its two neighbours — the store always spans the full fetch depth,
    // and a hole years outside the corpus touches no decision. The
    // manifested gap POSITIONS make that judgement exact (largestGapMs
    // alone is positionless); a manifest predating the positions falls
    // back to the absolute refusal, conservative by construction. The
    // remedy distinguishes the one hole a refetch cannot clear: rows
    // the parser refuses are refused deterministically on every fetch.
    const holeRemedy = `delete the treasury-rates store, refetch full ` +
      `history, and re-sweep — and if the hole persists across the ` +
      `refetch, the rows inside it are being refused by the parser ` +
      `(macroRates.ts date/tenor bounds); investigate those rows, not ` +
      `the store`;
    const gapsOverWeekMs = curve.gapsOverWeekMs;
    if (gapsOverWeekMs && gapsOverWeekMs.length > 0) {
      // Same predicate as the driver pre-flight (#364 round 15) — one
      // mechanism for one law; only the span differs (exact corpus
      // bounds here, the requested window there).
      const touching = Number.isFinite(corpusStartMs) &&
          Number.isFinite(corpusEndMs)
        ? treasuryGapTouching(
          gapsOverWeekMs,
          corpusStartMs - weekMs,
          corpusEndMs,
        )
        : gapsOverWeekMs[0];
      if (touching) {
        throw new Error(
          `${emitPath}: Treasury curve has a ${
            Math.round((touching.endMs - touching.startMs) / 86_400_000)
          }-day interior hole (${
            new Date(touching.startMs).toISOString().slice(0, 10)
          }..${
            new Date(touching.endMs).toISOString().slice(0, 10)
          }) inside the corpus span — decisions there scored months-stale ` +
            `rows as fresh; ${holeRemedy}`,
        );
      }
    } else if ((curve.largestGapMs ?? 0) > weekMs) {
      throw new Error(
        `${emitPath}: Treasury curve has a ${
          Math.round((curve.largestGapMs ?? 0) / 86_400_000)
        }-day interior hole — decisions inside it scored months-stale rows ` +
          `as fresh; ${holeRemedy}`,
      );
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
    // The fetch start THIS CORPUS was requested under, plus a week
    // (#364 round 13, finding 3; round 17, finding 2): a curve reaching
    // the start it was asked for is as deep as the claim can honestly
    // be — judged against the corpus's own RECORDED request, so
    // deepening TREASURY_FETCH_START_MS later never retroactively
    // condemns an archived corpus that was correct when swept ("we now
    // fetch deeper" is a term of the current build, not poison in the
    // recorded data). The build-constant fallback is exact for every
    // manifest predating the field: all were requested at the
    // 2013-01-01 constant, whose comment carries the 2026-08-19
    // endpoint probe (coverage to at least 2005-01-03).
    // requestedStartMs is a DRIVER-DECLARED term — self-certifying,
    // trusted because only the driver writes manifests and its
    // pre-flight refuses a store shallower than the request, which is
    // what keeps the declaration true (#364 round 18). This check has
    // no override behind it since round 16, so that discipline is the
    // floor the shallow-rebuild refusal rests on.
    const treasuryFloorMs =
      (curve.requestedStartMs ?? TREASURY_FETCH_START_MS) + weekMs;
    const curveFirst = curve.firstTime;
    if (
      Number.isFinite(corpusStartMs) &&
      typeof curveFirst === "number" &&
      curveFirst > treasuryFloorMs &&
      curveFirst > corpusStartMs
    ) {
      throw new Error(
        `${emitPath}: Treasury curve starts ${
          new Date(curveFirst).toISOString().slice(0, 10)
        } — after both the requested fetch floor and the corpus start (${
          new Date(corpusStartMs).toISOString().slice(0, 10)
        }); a shallow rebuilt store scores those decisions at the ` +
          `hardwired zero the claim abolished, and the corpus is refused. ` +
          `If a full refetch cannot reach the floor, the provider's ` +
          `coverage moved — re-probe its earliest served date and update ` +
          `TREASURY_FETCH_START_MS with the recorded evidence`,
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
// Every constant below is measured (FMP 5-minute probe, 2026-08-11..17,
// rows per CALENDAR day averaged over the week — weekends inside):
// BTCUSD 288.0 and THETAUSD 287.9, EURUSD 205.6, XAUUSD 197.1,
// ESUSD/CLUSD 197.7 (CLUSD is also the series that SERVES WTI —
// symbols.ts maps WTI to CLUSD with no fallback — so this one
// measurement backs both the futures ratio population and the energies
// floor, whose only sweepable member is WTI; #364 round 12, finding 1),
// PAUSD 198.7 (slot-dense despite thin volume), ZCUSX 146.7, ^GDAXI
// 73.6, ^GSPC 55.7, ^AXJO ~52, ^N225 48.6, LEUSX 40.0 — while ZRUSD ~36
// prints with intra-session holes, XC ~8.6 prints only where trades
// occurred, and QG serves no 5-minute data at all. Measured does NOT
// mean every bound member was probed (#364 round 12, finding 2): each
// class floor generalises from its probed members to classmates on a
// HOMOGENEITY assumption — crypto 260 binds 33 roster symbols from
// BTCUSD/THETAUSD (the tightest margin, 90.3% of a perfect 288 grid,
// asserted across the twenty-five onboarded 2026-08-06); forex 150
// binds all 28 roster pairs from EURUSD; metals 140 binds
// XAGUSD/XAUUSD from XAUUSD; indices 34 binds SIX members (ASX, DAX,
// DOW, NIKKEI, NSDQ, SP — all sweepable since the 2026-08-07 ruling
// emptied noTradeSymbols) from four probes (^AXJO, ^GDAXI, ^N225,
// ^GSPC; DOW and NSDQ were never probed). The nightly warm-only survey
// is the instrument that tests the assumption at depth, and the
// pre-flight refusal names it.
// That last group is the design constraint: trade-sparse series are
// HONEST provider data whose parent-child arithmetic legitimately
// degenerates (a 15-minute parent holding one print yields one 5-minute
// child), so a fixed law over every symbol would either false-refuse
// them or be vacuous for the dense ones. The instruments therefore
// self-select:
// - The tight ratio judges only slot-dense markets: symbols whose
//   max(15-minute, 5-minute/3) density runs >=60 15-minute-equivalent
//   rows/day — the near-24h markets (weekly-average arithmetic: crypto
//   96, forex 68.5, metals 65.7, ES-class futures 65.9 on the 15-minute
//   side, with the 5-minute side agreeing at 197-288/3). Under max()
//   the densest excluded symbol is ZCUSX, MEASURED at 52.4 15-minute
//   rows/calendar day (probed 2026-08-19 over the same 2026-08-11..17
//   week: 367 rows across 7 days — Fri closes without a night session;
//   #364 round 17 replaced round 16's DERIVED 146.7/3 = 48.9, which
//   assumed the very ratio this gate tests, and ^GDAXI's 24.5 before
//   it was the retired 15-minute-only filter's boundary). That is a
//   12.7% margin, and ZCUSX is agriculture, a no-floor class, so today
//   it is judged by nothing at all: the one named exception to the
//   liquid-members clause below, honest until the deep survey
//   re-derives the constants (carried: density-ceiling tightening).
//   Its measured same-week ratio is 146.7/52.4 = 2.80 — inside the
//   band — so if depth lifts BOTH tiers proportionally past the floor
//   it is admitted AND passes; the certain-refusal wedge (15-minute
//   >=60 with the 5-minute side frozen) requires the tiers to diverge,
//   which the survey would surface as its own anomaly. The other
//   symbols quoted only on the 5-minute side are structurally far from
//   the boundary by session length alone: ~6.5h cash-index sessions
//   cap 15-minute density near 19/calendar day (^GSPC, ^AXJO, ^N225)
//   and ~5.25h livestock sessions near 15 (LEUSX). The filter takes
//   the
//   MAX of the two so that a clip on either single series cannot move a
//   symbol out of the population (#364 round 11, finding 1 — filtering
//   on the 15-minute count alone was self-defeating: the clip lowered
//   the filter and the ratio's denominator together, so metals left the
//   gate above an 8.7% clip and floorless ES-class futures above 9.0%).
//   Exactly these are the markets whose 29-day chunks approach provider
//   caps, i.e. the band's home; a clipped primary moves a true ~3.0
//   ratio above 3.25 at a >=7.7% clip, shrinking the band's blind
//   residue from <=14.3% to <=7.7% across the WHOLE population, and any
//   cap low enough to clip the 5-minute chunks drags the ratio far
//   below 2.7. The residue that remains is the symmetric case — both
//   series clipped by the same factor — which no ratio can see and the
//   absolute floors carry where they exist.
// - The absolute floors bind the four structurally deterministic classes
//   (probed margin under the measured week: crypto 260, forex 150,
//   metals 140, energies 140 — backed by CLUSD-as-WTI, see above) plus
//   cash indices at 34 (four of six members probed at 48.6-73.6; their
//   chunks sit far from any cap, so the floor is the holed-store
//   detector). futures, agriculture and livestock carry no absolute
//   floor: their spread spans 8.6..197.7 rows/day, so any shared floor
//   either condemns honest sparseness or defends nothing — their liquid
//   members are exactly the ones the ratio gate already judges — WITH
//   NINE EXCEPTIONS, not the one this comment named until 2026-08-24.
//   The old text said "ZCUSX, measured at 52.4 15-minute rows/calendar
//   day, sits 12.7% under the gate's population floor... judged by
//   nothing at all". Both halves were wrong. The exception list had been
//   assembled from the symbols that happened to get a 15-minute probe
//   rather than derived by evaluating the two gates over the classes,
//   and the hedge word "liquid" is defined nowhere in code.
//
//   Derived over the roster at the gate's own statistic —
//   max(d15, d5/3) over the recent-90 intersection window — nine
//   markets carry NEITHER an absolute class floor NOR ratio-gate
//   membership: ZMUSD 51.91, ZCUSX 50.18, ZSUSX 49.74, ZLUSX 49.26,
//   ZOUSX 22.06, ZRUSD 17.11, and LEUSX / GFUSX / HEUSX at 13.09 each.
//   ZMUSD is the densest excluded symbol, not ZCUSX, and the margin is
//   10.0% rather than 12.7%. All 18 futures clear the floor, RBUSD
//   lowest at 61.40 — 2.33% of margin, with HOUSD next at 64.77, so one
//   thin quarter moves either into this set and leaving the population
//   is not an event the gate reports.
//
//   They are no longer judged by nothing. `gridRegistration`
//   (clockWitness.ts, added the same day) covers exactly this
//   population: it asks whether a 15-minute parent brackets its own
//   5-minute children, which needs no density floor and no calendar,
//   and it reads 0 violations of 23,922 judged parents on ZOUSX against
//   ~90% under a 4-hour shift. The density gate still abstains for
//   them; the absolute instrument does not. One
//   provider series can carry TWO roster names under two laws: WTI and
//   CLUSD are both on defaultScanSymbols and load identical bytes, with
//   WTI judged by the energies floor plus the ratio and CLUSD by the
//   ratio alone — if that series degrades below 140, the pre-flight
//   refuses on WTI and would have passed CLUSD, which is the floor
//   doing its job on the class that carries one.
// - Both ratio claims above hold AT DEPTH through the manifested
//   shared-window counts (#364 round 10, finding 1): the band is a
//   same-window statistic, the stores' own windows diverge at depth,
//   and without crossSeriesDensity the ratio would either false-refuse
//   era differences (round 8's shape) or abstain for most of the
//   roster (round 9's shape) — silently un-judging the no-floor
//   classes and reopening the clipped-primary band exactly where
//   --days max lives.
const DENSITY_MIN_SPAN_DAYS = 5;
export const DENSITY_RATIO_PRIMARY_FLOOR = 60;
const DENSITY_RATIO_MIN = 2.7;
const DENSITY_RATIO_MAX = 3.25;
// CRYPTO WAS 260, AND 260 WAS THE DEFECT — corrected 2026-08-30, R0d.
//
// It was derived from two probes (BTCUSD 288.0, THETAUSD 287.9) that both sat
// AT the class ceiling, then generalised to 33 symbols on a homogeneity
// assumption. The census now beside it
// (docs/research/five-minute-density-census-2026-08-30.json, measured off the
// warm stores) settles what that produced:
//
//   class     floor  ceiling  floor/ceiling  floor/min  refuses
//   forex       150    204.7          0.733      0.734        0
//   metals      140    196.5          0.712      0.717        0
//   crypto      260    288.0          0.903      1.042        1
//
// Crypto's floor sat ABOVE the thinnest market it binds. A floor above its own
// population cannot do anything except refuse a healthy member, and it was
// refusing exactly one: DYDXUSD at 249.6 rows/day, whose health was verified
// five independent ways before this change and which reads 86.7% of a perfect
// 24/7 grid. Under amendment 31 a matched market leaves the offering on a
// calibration verdict, never on an instrument that cannot see straight.
//
// The replacement is the SAME RULE the siblings already encode, applied to
// crypto's own measured ceiling: 0.733 (forex — the tightest ratio any sibling
// carries, so the conservative choice of the two) x 288.0 = 211, taken as 210
// to match the round constants beside it. That is a re-derivation, not a new
// number picked to admit a symbol — anchored on the CEILING rather than on
// DYDXUSD, so the disputed market is nowhere in its own threshold.
//
// WHAT IT COSTS, stated rather than buried: the depth floor is the only
// instrument here that can see a clip applied symmetrically to both
// resolutions — no ratio can. At 260 that band began at a 10% clip; at 210 it
// begins at 27%. Forex and metals have always lived at 27-29%, so this makes
// crypto consistent with the fleet rather than more permissive than it, and
// the alternative was refusing a market the evidence says is healthy.
//
// The HANDOFF's premise for the per-symbol baseline — "the only class whose
// homogeneity is empirically false" — is the reverse of what the stores say.
// 28 of the 31 measured crypto markets sit at exactly 288.0 and the class CV
// is 2.5%, making crypto one of the MOST homogeneous classes on the roster.
// The defect was under-sampling (two probes), not heterogeneity, which is why
// re-deriving the constant closes R0d and no per-symbol baseline, new manifest
// fact, or R2b dependency is needed.
const FIVE_MIN_CLASS_FLOORS: Partial<
  Record<ReturnType<typeof getAssetType>, number>
> = {
  crypto: 210,
  energies: 140,
  forex: 150,
  indices: 34,
  metals: 140,
};

// #364 round 12, finding 3: getAssetType resolves every class EXCEPT
// forex by explicit list membership — forex is the FALLBACK, so a
// symbol onboarded into symbolMap but not yet added to a class list
// would inherit the forex floor of 150 and abort the sweep pre-flight
// with exactly the wrong diagnosis (the series is fine; the class list
// is incomplete — the same silent-default hazard calibration.ts
// documents for parameters, now with a run-killing consequence). The
// forex floor therefore binds only DELIBERATE currency pairs, named by
// shape over the roster's own eight currencies; any other
// fallback-resolved symbol is floorless — the standing the door
// already gives an off-roster symbol, for the same reason. The other
// floored classes need no such guard: their resolution IS explicit
// listing.
const FOREX_PAIR_CURRENCIES = new Set([
  "AUD",
  "CAD",
  "CHF",
  "EUR",
  "GBP",
  "JPY",
  "NZD",
  "USD",
]);

export function fiveMinuteFloorFor(symbol: string): number | undefined {
  const assetType = getAssetType(symbol);
  if (assetType === "forex") {
    const deliberatePair = /^[A-Z]{6}$/.test(symbol) &&
      FOREX_PAIR_CURRENCIES.has(symbol.slice(0, 3)) &&
      FOREX_PAIR_CURRENCIES.has(symbol.slice(3));
    return deliberatePair ? FIVE_MIN_CLASS_FLOORS.forex : undefined;
  }
  return FIVE_MIN_CLASS_FLOORS[assetType];
}

// This assertion runs inside the per-symbol loop and therefore binds
// DELIBERATE HISTORICAL READS too, unlike the conditions check below it
// (#364 round 1, finding 5 — intended, stated): the superseded-clock
// override accepts superseded MEASUREMENT TERMS, never poisoned data. A
// clipped or holed series is wrong, not old — the same standing as the
// clock witnesses beside it in the loop, which have always bound
// historical reads. A historical corpus this refuses was measuring
// against data the door can now prove defective; there is nothing
// honest to read from it.
/**
 * Refuse a corpus that cannot answer the question being asked of it.
 *
 * A reader wanting the give-back, the ladder payoff or the cost breakdown has
 * two ways to be wrong about a corpus that lacks the column: read `undefined`
 * and coerce it to 0, or filter the rows out and report on a silently smaller
 * population. Both produce a number. Amendment 39 and §19e both say the same
 * thing about that — a refusal beats a wrong number — and the corpus is the
 * one place that can tell the difference, because `analyzerVersion` cannot:
 * none of the three columns added in the week of 2026-08-30 moved it, and
 * correctly so, since none changed what the engine decides.
 *
 * ABSENT `emitColumns` is NOT a refusal. Every corpus written before the field
 * existed genuinely lacks it, and refusing those would retire the deliberate
 * historical reads for a capability check — the same standing the conditions
 * block gives a legacy manifest. It returns the columns it could not confirm
 * so a caller can say what it is missing rather than pretending it checked.
 */
export function assertEmitColumns(
  emitPath: string,
  manifest: { emitColumns?: string[] },
  required: readonly string[],
): { unverifiable: boolean } {
  if (manifest.emitColumns === undefined) {
    return { unverifiable: true };
  }
  const have = new Set(manifest.emitColumns);
  const missing = required.filter((column) => !have.has(column));
  if (missing.length > 0) {
    throw new Error(
      `${emitPath}: the corpus does not carry ${missing.join(", ")} — it ` +
        `declares ${manifest.emitColumns.length} columns and this read needs ` +
        `${required.length} of them. Reading on would grade the missing ` +
        `quantity as zero or drop the rows, and both report a number the ` +
        `corpus cannot support`,
    );
  }
  return { unverifiable: false };
}

export function assertFiveMinuteDensity(
  emitPath: string,
  entry: {
    crossSeriesDensity?: CrossSeriesDensity;
    series?: Record<string, SeriesFacts>;
    symbol: string;
  },
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
  // #364 round 11, finding 2 rider: two stores that share NO time
  // window cannot be one symbol's feed at two resolutions — that is
  // shape poison, not degradation, and like the clock witnesses it
  // binds every read, historical included. It sits ABOVE the sub-week
  // silence deliberately (#364 round 12, smaller): disjointness is a
  // statement about shape, not density, so a young span does not excuse
  // it — and below the silence, a sub-week disjoint pair would fall
  // through to the missing-evidence refusal and its wrong "re-sweep"
  // diagnosis, since the driver cannot write crossSeriesDensity for
  // windows that never meet.
  if (
    five.firstTime !== null && five.lastTime !== null &&
    fifteen.firstTime !== null && fifteen.lastTime !== null &&
    Math.min(five.lastTime, fifteen.lastTime) <=
      Math.max(five.firstTime, fifteen.firstTime)
  ) {
    throw new Error(
      `${emitPath}: ${entry.symbol} 5-minute and 15-minute series share no ` +
        `time window — two stores that never overlap cannot be one ` +
        `symbol's feed; the corpus is refused`,
    );
  }
  if (
    five.spanDays < DENSITY_MIN_SPAN_DAYS ||
    fifteen.spanDays < DENSITY_MIN_SPAN_DAYS
  ) {
    return;
  }
  // JUDGED ON THE RECENT WINDOW, not the whole span. The class floors are
  // "probed margin under the measured week" — a seven-day recent sample — and
  // applying them to a whole-span average is depth-blind: a series reaching
  // back to 2013 falls under a floor calibrated on 2026 coverage because its
  // early years are legitimately sparser, which is none of the three things
  // this gate exists to catch (clipped, holed, or not this symbol's feed).
  //
  // Measured on the R0 rebuild's own stores, 2026-08-23: LTCUSD 216.6 rows/day
  // whole-span against the crypto floor of 260, and 288.0/day over its last 90
  // — the theoretical maximum for a 24/7 5-minute series. BTCUSD 235.9 ->
  // 288.0. Both were forecast REFUSED at max depth by a gate measuring the
  // wrong window, and amendment 31 says a matched market leaves the offering
  // only on a calibration verdict, never on caution.
  //
  // WHAT THIS GATE DOES AND DOES NOT JUDGE, stated because the first version of
  // this comment claimed a backstop that does not exist. It said holes "remain
  // largestGapMs's job over the whole span" — but `largestGapMs` is read only
  // for the TREASURY curve (the `curve.largestGapMs` check above). Nothing has
  // ever read it for a bar series, so that sentence invented a guard.
  //
  // Judged: current feed health, which is what a clip, a hole in the live tail,
  // or a wrong feed shows up in — and what the floors were actually calibrated
  // against.
  //
  // NOT judged: the early era. And it cannot be, by a gap threshold — measured
  // across the 79 five-minute stores the R0 rebuild had written by 2026-08-23,
  // 25 of them carry a largest gap of 14 days or more, twelve exceed 30, and
  // NZDUSD reaches 72. Those are healthy markets shipping today; the provider's
  // deep history is simply gappier than its recent history. Any threshold low
  // enough to catch a real early hole refuses a third of the roster, which is
  // amendment 31's forbidden trade — caution removing matched markets.
  //
  // So the early era is STATED, not gated: `count` and `spanDays` remain on
  // every SeriesFacts, so whole-span density is derivable per symbol and a
  // reader conditioning on era quality has the numbers. That is the same
  // standing the project gives every other measurable it will not act on — a
  // measurable offset is stated, never hidden.
  //
  // Manifests predating the recent-window fact fall back to the own-span rate.
  const fiveRecentSpan = five.recentSpanDays ?? 0;
  const fifteenRecentSpan = fifteen.recentSpanDays ?? 0;
  const fivePerDay = five.recentCount !== undefined &&
      fiveRecentSpan >= DENSITY_MIN_SPAN_DAYS
    ? five.recentCount / fiveRecentSpan
    : five.count / five.spanDays;
  const fifteenPerDay = fifteen.recentCount !== undefined &&
      fifteenRecentSpan >= DENSITY_MIN_SPAN_DAYS
    ? fifteen.recentCount / fifteenRecentSpan
    : fifteen.count / fifteen.spanDays;
  // The roster is the class authority; an off-roster symbol (which only a
  // hand-built manifest can carry — the driver refuses them) gets no
  // class floor rather than inheriting getAssetType's forex fallback,
  // and fiveMinuteFloorFor extends the same standing to ON-roster
  // symbols the fallback mis-classes (#364 round 12, finding 3).
  const floor = hasKnownAssetType(entry.symbol)
    ? fiveMinuteFloorFor(entry.symbol)
    : undefined;
  if (floor !== undefined && fivePerDay < floor) {
    // THIS GATE MAY NOT NAME A DIAGNOSIS IT CANNOT MAKE. Until 2026-08-24
    // this refusal read "the series is clipped, holed, or not this symbol's
    // feed" — three claims, none of which depth alone can establish, and one
    // ("holed") which nothing in the codebase measures for a bar series at
    // all: `largestGapMs` is read only for the Treasury curve, as the comment
    // below already records. The wording was borrowed from the RATIO check,
    // which genuinely can separate a clipped 5-minute series from a clipped
    // 15-minute primary, and which a symbol refused here may well be passing.
    //
    // DYDXUSD is the worked case (2026-08-24). It read 249.4 rows/day against
    // crypto's 260 and was refused as "clipped, holed, or not this symbol's
    // feed" while its 5/15 ratio sat at 2.83, inside [2.7, 3.25] — the
    // clip-and-hole instrument cleared it in the same run. It is the roster's
    // thinnest crypto: 69.1 15-minute rows/day whole-span against 94.2-94.8
    // for every classmate, both resolutions thinning and recovering together
    // with volume, and two independent fetches ten days apart returning
    // bit-identical daily counts for the trough. An operator sent to look for
    // a clip would have found none, because there is none.
    throw new Error(
      `${emitPath}: ${entry.symbol} 5-minute series runs ${
        fivePerDay.toFixed(1)
      } rows/day over ${
        five.recentCount !== undefined && fiveRecentSpan >= DENSITY_MIN_SPAN_DAYS
          ? `its last ${fiveRecentSpan} days`
          : `${five.spanDays} days`
      } — under the ${
        getAssetType(entry.symbol)
      } floor of ${floor} (measured 2026-08-11..17). DEPTH IS ALL THIS ` +
        `GATE MEASURES: an honestly thin market and a symmetrically ` +
        `clipped one read alike here. The instrument that separates them ` +
        `is the 5/15 ratio below — read it before concluding the feed is ` +
        `broken. The corpus is refused`,
    );
  }
  // #364 rounds 9-10: the band is a SAME-WINDOW statistic — the probe
  // measured both series over one shared week — and at depth the two
  // stores' own windows diverge (FMP's 5-minute depth is shallower than
  // 15-minute for most symbols, the driver's own words), where
  // era-density differences masquerade as clipping through own-span
  // rates. So the ratio judges the manifested INTERSECTION-window
  // counts (crossSeriesDensity, recorded by the driver from the raw
  // arrays): two counts over one shared window, exact at any depth —
  // this is what keeps the gate live for the no-floor classes' liquid
  // members and keeps the clipped-primary blind band closed on a
  // --days max corpus. When the fact is present it is the sole judge
  // (running the own-span heuristic beside it would resurrect the
  // false positive the fact exists to kill); the own-span computation
  // below is the FALLBACK for manifests predating the fact, gated on
  // near-identical windows so it never compares across eras. On a
  // CURRENT-clock fact-less manifest this fallback can fire before the
  // evidence block's "re-sweep with the current driver" refusal —
  // deliberate (#364 round 16, smaller, declined ordering change): the
  // sameWindow gate means any ratio it throws is a genuine same-window
  // anomaly, a data diagnosis the poison-outranks-terms ordering ranks
  // above the evidence gap, and every fix path ends in a current-driver
  // re-sweep that writes the fact anyway. A
  // fact-less manifest without window agreement is silent here, and the
  // absolute floors above still bind.
  const shared = entry.crossSeriesDensity;
  if (shared) {
    // Population filter (#364 round 11, finding 1): whether the ratio
    // judges a symbol is decided by max(fifteen, five/3) per day — a
    // quantity a SINGLE clipped series cannot move out of the
    // population, because the un-clipped side still testifies that the
    // market is slot-dense. Filtering on the 15-minute count alone was
    // self-defeating: a clip lowered the filter and the ratio's
    // denominator together, so metals left the gate above an 8.7% clip
    // and ES-class futures (no absolute floor, BY DESIGN judged here)
    // above 9.0% — the clip removed the symbol from the instrument
    // that detects clipping. Under max(), a one-sided clip of either
    // series keeps the symbol in the population and moves the ratio
    // out of band; only a SYMMETRIC clip of both stays invisible,
    // which no ratio can see and the absolute floors carry where they
    // exist.

    // Same correction, same reason. PAUSD measured 2.678 over its 1,057-day
    // shared window — below a band opening at 2.70 — and 2.916 over its last
    // 90. Era-density differences move the ratio too, which is the very
    // failure the intersection window was introduced to kill; the intersection
    // fixed WHICH bars are compared and left WHEN unbounded.
    const recentShared = shared.recentFiveCount !== undefined &&
        shared.recentFifteenCount !== undefined &&
        (shared.recentSpanDays ?? 0) >= DENSITY_MIN_SPAN_DAYS &&
        shared.recentFifteenCount > 0
      ? {
        fifteenCount: shared.recentFifteenCount,
        fiveCount: shared.recentFiveCount,
        spanDays: shared.recentSpanDays!,
      }
      : shared;
    // The population filter judges the SAME window the ratio does. It was
    // whole-span, which made it depth-blind in the opposite direction to the
    // floor: a deep series' low whole-span rate drops it BELOW this floor, so
    // it leaves the population and the ratio never judges it at all. That is
    // false silence rather than false refusal — LTCUSD and BTCUSD tripped the
    // absolute floor while the ratio stayed quiet on them, and PAUSD (a
    // 1,057-day series, high enough whole-span rate to stay in) tripped the
    // ratio. Judging both on the recent window makes the deep markets visible
    // to the gate rather than exempt from it.
    const slotDense = recentShared.fifteenCount > 0 &&
      Math.max(recentShared.fifteenCount, recentShared.fiveCount / 3) /
            recentShared.spanDays >= DENSITY_RATIO_PRIMARY_FLOOR;
    if (recentShared.spanDays >= DENSITY_MIN_SPAN_DAYS && slotDense) {
      const ratio = recentShared.fiveCount / recentShared.fifteenCount;
      if (ratio < DENSITY_RATIO_MIN || ratio > DENSITY_RATIO_MAX) {
        throw new Error(
          `${emitPath}: ${entry.symbol} 5min/15min density ${
            ratio.toFixed(2)
          } (${(recentShared.fiveCount / recentShared.spanDays).toFixed(1)}/${
            (recentShared.fifteenCount / recentShared.spanDays).toFixed(1)
          } rows/day over the ${recentShared.spanDays}d judged window) ` +
            `outside [${DENSITY_RATIO_MIN}, ${DENSITY_RATIO_MAX}] — above ` +
            `means a clipped 15-minute primary (the verify-cache-clock ` +
            `blind band), below means a clipped or holed 5-minute series; ` +
            `the corpus is refused`,
        );
      }
    }
    return;
  }
  const sharedSpanDays = five.firstTime !== null && five.lastTime !== null &&
      fifteen.firstTime !== null && fifteen.lastTime !== null
    ? (Math.min(five.lastTime, fifteen.lastTime) -
      Math.max(five.firstTime, fifteen.firstTime)) / 86_400_000
    : 0;
  const sameWindow = sharedSpanDays >= 0.9 * five.spanDays &&
    sharedSpanDays >= 0.9 * fifteen.spanDays;
  if (
    sameWindow &&
    Math.max(fifteenPerDay, fivePerDay / 3) >= DENSITY_RATIO_PRIMARY_FLOOR
  ) {
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
