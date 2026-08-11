// 2i (2026-08-09): the corpus describes itself. A sweep emit used to leave
// no record of the conditions that produced it — variant:"baseline" is
// byte-identical across engine edits, the exact aliasing hazard
// calibration.ts documents for NGUSD — so two corpora measured under
// different engines could be aggregated as one. The manifest written
// beside every emit carries the analyzer version, the resolved per-symbol
// calibration (hashed), the grid, warmup/split parameters, the cache
// anchor, per-(symbol, timeframe) bar facts including the largest gap, and
// the provider-boundary rejection tally. Item 3's aggregation readers
// assert manifestHash before touching a single row.

import { createHash } from "node:crypto";

export type SeriesFacts = {
  count: number;
  firstTime: number | null;
  largestGapMs: number;
  lastTime: number | null;
  spanDays: number;
};

/**
 * Deterministic JSON: object keys sorted at every depth, array order
 * preserved. Hashes over this cannot move with insertion order.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entryValue]) =>
        `${JSON.stringify(key)}:${stableStringify(entryValue)}`
      );
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Continuity as a recorded fact: ends, count, largest inter-bar gap. */
export function seriesFacts(bars: Array<{ time: number }>): SeriesFacts {
  if (bars.length === 0) {
    return {
      count: 0,
      firstTime: null,
      largestGapMs: 0,
      lastTime: null,
      spanDays: 0,
    };
  }
  const times = bars.map((bar) => bar.time).sort((a, b) => a - b);
  let largestGapMs = 0;
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (gap > largestGapMs) {
      largestGapMs = gap;
    }
  }
  const first = times[0];
  const last = times[times.length - 1];
  return {
    count: bars.length,
    firstTime: first,
    largestGapMs,
    lastTime: last,
    spanDays: Number(((last - first) / 86_400_000).toFixed(2)),
  };
}

export type SweepManifest = {
  analyzerVersion: string;
  anchor: string;
  barRejections: Record<string, number>;
  days: number;
  // 3c/3d: the calendar folds this corpus was decided under — absent on
  // legacy two-split corpora, whose readers map train/test instead.
  folds?: Array<{
    decisionEndMs: number;
    endMs: number;
    name: string;
    startMs: number;
  }>;
  // Per-class fold sets (each class walks forward on its own union span);
  // present on fleet corpora built with --fold-spec, replacing `folds`.
  foldsByClass?: Record<
    string,
    Array<{
      decisionEndMs: number;
      endMs: number;
      name: string;
      startMs: number;
    }>
  >;
  generatedAt: string;
  grid: unknown[];
  // 3e: markets whose rows exist for the one confirmation read and are
  // excluded from every tuning aggregate — a property of the corpus.
  holdoutSymbols?: string[];
  manifestHash: string;
  stepBars: number;
  symbols: Array<{
    calibration: Record<string, unknown>;
    calibrationHash: string;
    providerSymbol: string;
    series: Record<string, SeriesFacts>;
    symbol: string;
  }>;
  trainShare: number;
  warmupBars: number;
};

export function buildSweepManifest(input: {
  analyzerVersion: string;
  anchor: string;
  barRejections: Record<string, number>;
  days: number;
  folds?: SweepManifest["folds"];
  foldsByClass?: SweepManifest["foldsByClass"];
  generatedAt: string;
  grid: unknown[];
  holdoutSymbols?: string[];
  stepBars: number;
  // Precomputed per-series FACTS, not raw bars: the driver computes
  // seriesFacts per symbol as it loads and releases the arrays — holding
  // every symbol's full series until the end of the run for the manifest
  // is what OOM'd the first baseline attempt at the 4GB default heap.
  symbols: Array<{
    calibration: Record<string, unknown>;
    providerSymbol: string;
    series: Record<string, SeriesFacts>;
    symbol: string;
  }>;
  trainShare: number;
  warmupBars: number;
}): SweepManifest {
  const symbols = input.symbols.map((entry) => ({
    calibration: entry.calibration,
    calibrationHash: sha256Hex(stableStringify(entry.calibration)),
    providerSymbol: entry.providerSymbol,
    series: entry.series,
    symbol: entry.symbol,
  }));
  // The hash covers everything that DEFINES the measurement. The write
  // timestamp deliberately sits outside it: two runs under identical
  // conditions produce one hash, and a reader asserting the hash is
  // asserting conditions, not wall-clock provenance.
  const hashedPayload = {
    analyzerVersion: input.analyzerVersion,
    anchor: input.anchor,
    barRejections: input.barRejections,
    days: input.days,
    ...(input.folds && { folds: input.folds }),
    ...(input.foldsByClass && { foldsByClass: input.foldsByClass }),
    grid: input.grid,
    ...(input.holdoutSymbols && { holdoutSymbols: input.holdoutSymbols }),
    stepBars: input.stepBars,
    symbols,
    trainShare: input.trainShare,
    warmupBars: input.warmupBars,
  };
  return {
    ...hashedPayload,
    generatedAt: input.generatedAt,
    manifestHash: sha256Hex(stableStringify(hashedPayload)),
  };
}
