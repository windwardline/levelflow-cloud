/**
 * FMP bar-payload normalization, lifted out of marketLoader.ts so the harness
 * can reach it — marketLoader reads Deno.env at module load, so no test can
 * import it, and this is the analyzer's hottest loop.
 *
 * An open-market all-markets scan decodes ~50 symbols x 6 timeframes, roughly
 * 580,000 bars and 67 MiB of JSON, inside one 2s CPU budget. On 2026-08-02 that
 * budget was crossed on half of the scans: eleven completed, eleven died with
 * `CPU Time exceeded` behind HTTP 546. The chained filter/map/sort/slice built
 * four arrays per timeframe and a fifth defensive copy on return; this builds
 * one and keeps the same output, bar for bar.
 *
 * Bars are read-only for every consumer (indicators, strategies, pricePlan,
 * sweep all read or build fresh arrays), so the caller may share the array the
 * candle cache holds. tests/barDecode.test.ts pins both halves of that: the
 * output equals the old pipeline's, and nothing downstream mutates a bar.
 */
import type { Bar } from "./types.ts";

export type FmpBar = {
  close?: number;
  date?: string;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
};

export function normalizeFmpBars(payload: FmpBar[], maxBars: number): Bar[] {
  const bars: Bar[] = [];
  for (const point of payload) {
    if (
      typeof point.date !== "string" || typeof point.open !== "number" ||
      typeof point.high !== "number" || typeof point.low !== "number" ||
      typeof point.close !== "number"
    ) {
      continue;
    }
    bars.push({
      close: point.close,
      high: point.high,
      low: point.low,
      open: point.open,
      time: toTimestamp(point.date),
      volume: point.volume ?? 0,
    });
  }
  bars.sort((first, second) => first.time - second.time);
  return bars.length > maxBars ? bars.slice(-maxBars) : bars;
}

export function toTimestamp(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}
