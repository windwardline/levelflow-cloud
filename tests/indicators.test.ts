import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ema,
  findSwingPivots,
  nearestLevelBeyond,
} from "../supabase/functions/trade-analyzer/indicators.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

function bar(high: number, low: number, index = 0): Bar {
  const mid = (high + low) / 2;
  return {
    close: mid,
    high,
    low,
    open: mid,
    time: index,
  } as Bar;
}

describe("trade analyzer indicators", () => {
  it("seeds EMA from the sampled window rather than stale early history", () => {
    const values = [1000, ...Array.from({ length: 12 }, () => 10)];

    assert.equal(ema(values, 3), 10);
  });

  it("abstains on empty EMA input — 0 was a price, not a sentinel (2m)", () => {
    assert.equal(ema([], 20), null);
  });
});

describe("swing pivot detection", () => {
  it("finds interior pivot highs and lows, not window extremes", () => {
    // Highs:  10 11 12 11 10 11 14 11 10  -> pivots at 12 (idx 2) and 14 (idx 6)
    // Lows:    5  6  7  6  4  6  8  6  5  -> pivot low at 4 (idx 4)
    const highs = [10, 11, 12, 11, 10, 11, 14, 11, 10];
    const lows = [5, 6, 7, 6, 4, 6, 8, 6, 5];
    const bars = highs.map((high, index) => bar(high, lows[index], index));

    const pivots = findSwingPivots(bars, 2);

    assert.deepEqual(pivots.highs, [12, 14]);
    assert.deepEqual(pivots.lows, [4]);
  });

  it("excludes edge bars that lack full confirmation on both sides", () => {
    // The last bar is the global low, but it cannot confirm as a pivot
    // because there are no bars beyond it.
    const highs = [9, 11, 12, 11, 10];
    const lows = [6, 5, 7, 6, 2];
    const bars = highs.map((high, index) => bar(high, lows[index], index));

    const pivots = findSwingPivots(bars, 2);

    assert.deepEqual(pivots.highs, [12]);
    assert.deepEqual(pivots.lows, []);
  });

  it("returns empty pivot sets when there are too few bars", () => {
    const bars = [bar(10, 5), bar(11, 6)];

    assert.deepEqual(findSwingPivots(bars, 2), { highs: [], lows: [] });
  });
});

describe("nearest level beyond entry", () => {
  it("picks the nearest level above entry for buys", () => {
    assert.equal(nearestLevelBeyond("buy", 100, [98, 103, 110, 101]), 101);
  });

  it("picks the nearest level below entry for sells", () => {
    assert.equal(nearestLevelBeyond("sell", 100, [104, 97, 92, 99]), 99);
  });

  it("returns null when no level lies beyond entry", () => {
    assert.equal(nearestLevelBeyond("buy", 100, [90, 95, 100]), null);
    assert.equal(nearestLevelBeyond("sell", 100, [100, 105]), null);
  });
});
