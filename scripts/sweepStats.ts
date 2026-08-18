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
import { CALENDAR_CLOCK } from "./clockWitness.ts";
import {
  sha256Hex,
  stableStringify,
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
    filled: 0,
    n: 0,
    rSum: 0,
    rSumSq: 0,
    stops: 0,
    wins: 0,
  };
}

export function addOutcome(stats: SweepStats, row: SweepEmitRow): void {
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
  if (
    (manifest.clock.normalizer !== BAR_CLOCK ||
      manifest.clock.calendar !== CALENDAR_CLOCK) &&
    process.env.LEVELFLOW_ALLOW_SUPERSEDED_CLOCK !== "1"
  ) {
    throw new Error(
      `${emitPath}: corpus swept under clock "${manifest.clock.normalizer}"/` +
        `"${manifest.clock.calendar}" but this build is "${BAR_CLOCK}"/` +
        `"${CALENDAR_CLOCK}" — a superseded-clock corpus is re-swept, not ` +
        `aggregated (set LEVELFLOW_ALLOW_SUPERSEDED_CLOCK=1 only for a ` +
        `deliberate historical read)`,
    );
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
  }
  return manifest;
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
