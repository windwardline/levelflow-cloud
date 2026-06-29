import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ema } from "../supabase/functions/trade-analyzer/indicators.ts";

describe("trade analyzer indicators", () => {
  it("seeds EMA from the sampled window rather than stale early history", () => {
    const values = [1000, ...Array.from({ length: 12 }, () => 10)];

    assert.equal(ema(values, 3), 10);
  });

  it("returns zero for empty EMA input", () => {
    assert.equal(ema([], 20), 0);
  });
});
