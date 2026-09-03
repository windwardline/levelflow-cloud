import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  getAssetType,
  getClassCalibration,
  getSymbolCalibrationOverride,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";
import { GRID_OVERRIDE_KEYS } from "../scripts/sweepGrid.ts";

/**
 * The cost weight per trade as an admission cap (R4 act 3, amendment 39's
 * named axis). `maxCostShare` is INERT until a calibration row sets it: no
 * class row and no symbol layer carries it, so every corpus swept before the
 * knob existed reproduces, and the derived read that accepted 0.15 for forex
 * at the class grain ships nothing until the ledgered confirm read.
 */

const startTime = Date.UTC(2024, 0, 2, 14, 30);
function dailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
    high: 103.2,
    low: 96.8,
    open: 100,
    time: startTime - count * 86_400_000 + index * 86_400_000,
    volume: 10_000,
  }));
}
function triangleBars(count: number, period = 20, amplitude = 4): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    const half = period / 2;
    const value = position < half
      ? 98 + (amplitude / half) * position
      : 98 + amplitude - (amplitude / half) * (position - half);
    return { close: value, high: value + 0.3, low: value - 0.3, open: value, time: startTime - count * 900_000 + index * 900_000, volume: 1_000 };
  });
}
const base = {
  calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
  dailyBars: dailyBars(80),
  primaryBars: triangleBars(600),
  stepBars: 16,
  symbol: "EURUSD" as const,
  warmupBars: 120,
};

describe("maxCostShare is inert until a row sets it", () => {
  it("no class row and no symbol layer carries it", () => {
    const prov = JSON.parse(readFileSync("docs/research/r4/shipped-cell-provenance.json", "utf8")) as { markets: Array<{ symbol: string }> };
    const symbols = prov.markets.map((entry) => entry.symbol);
    assert.ok(symbols.length >= 90, "the roster artifact is the population, not a guess");
    for (const className of new Set(symbols.map((symbol) => getAssetType(symbol)))) {
      assert.equal(getClassCalibration(className).maxCostShare, undefined, `${className}'s class row sets maxCostShare before any read earned it`);
    }
    for (const symbol of symbols) {
      assert.equal((getSymbolCalibrationOverride(symbol) as { maxCostShare?: number }).maxCostShare, undefined, `${symbol}'s layer sets maxCostShare before any read earned it`);
    }
  });

  it("is a grid axis, so a sweep can carry it as a cell", () => {
    assert.ok((GRID_OVERRIDE_KEYS as readonly string[]).includes("maxCostShare"));
  });

  it("an unreachable cap reproduces the uncapped run exactly, and a zero cap declines every setup the other gates admitted", () => {
    const uncapped = simulateSymbol(base);
    assert.ok(uncapped.summary.total > 0, "the fixture admits setups, or the cap has nothing to decline");
    assert.equal(uncapped.rejections.aboveCostShare, 0);
    const unreachable = simulateSymbol({ ...base, calibrationOverride: { ...base.calibrationOverride, maxCostShare: Number.POSITIVE_INFINITY } });
    assert.deepEqual(unreachable.rejections, uncapped.rejections);
    assert.deepEqual(unreachable.summary, uncapped.summary);
    const zero = simulateSymbol({ ...base, calibrationOverride: { ...base.calibrationOverride, maxCostShare: 0 } });
    assert.equal(zero.summary.total, 0, "nothing is admitted past a zero cap");
    assert.equal(zero.rejections.aboveCostShare, uncapped.summary.total, "exactly the setups the other gates admitted die at the cost gate — first failing gate wins");
    assert.equal(zero.rejections.belowConfidence, uncapped.rejections.belowConfidence);
    assert.equal(zero.rejections.belowPayoff, uncapped.rejections.belowPayoff);
    assert.equal(
      zero.rejections.belowThreshold,
      zero.rejections.belowConfidence + zero.rejections.belowPayoff + zero.rejections.aboveCostShare + zero.rejections.regimeGated,
      "the aggregate counts the fourth branch",
    );
    assert.equal(zero.rejectionLedger.filter((entry) => entry.reason === "aboveCostShare").length, zero.rejections.aboveCostShare, "the ledger names the reason on every declined instant");
  });
});
