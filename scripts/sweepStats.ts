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

import { readFileSync } from "node:fs";
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
export function assertManifestedCorpus(emitPath: string): {
  manifest: SweepManifest;
  rows: SweepEmitRow[];
} {
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

  const rows: SweepEmitRow[] = [];
  const lines = readFileSync(emitPath, "utf8").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }
    try {
      rows.push(JSON.parse(line) as SweepEmitRow);
    } catch {
      throw new Error(
        `${emitPath}: line ${index + 1} failed to parse — a holed corpus is refused, not shrunk`,
      );
    }
  }
  return { manifest, rows };
}
