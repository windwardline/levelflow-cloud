import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  cacheDays,
  parseQ4Args,
  pinnedSeries,
  resolveDays,
  stopUnder,
} from "../scripts/q4-daily-structure-stop.ts";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  averageTrueRange,
  findSwingPivots,
} from "../supabase/functions/trade-analyzer/indicators.ts";
import { buildPricePlan } from "../supabase/functions/trade-analyzer/pricePlan.ts";
import {
  classifyRegime,
  runStrategyCommittee,
  scoreConsensus,
} from "../supabase/functions/trade-analyzer/strategies.ts";
import { buildDecisionMarketContext } from "../supabase/functions/trade-analyzer/sweep.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * R2b question 4's reader: what the stop's structural search cannot see.
 *
 * The reader computes a counterfactual production cannot be asked for — the
 * stop under a pivot set the engine never builds — so its arithmetic is a
 * reimplementation, and a reimplementation of production inherits production's
 * bugs and none of its correctness. Everything below is about the two things
 * that keeps honest: the ANCHOR (the reproduction must equal the plan's own
 * emitted field) and the DOOR (a cache miss is a refusal, never a purchase).
 */

const startTime = Date.parse("2026-06-15T00:00:00.000Z");

function sawtooth(count: number, fall: number, rise: number): number[] {
  const period = fall + rise;
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    return position < fall
      ? 104 - (8 / fall) * position
      : 96 + (8 / rise) * (position - fall);
  });
}

function toBars(values: readonly number[], stepMs: number): Bar[] {
  return values.map((value, index) => ({
    close: value,
    high: value + 0.15,
    low: value - 0.15,
    open: value,
    time: startTime + index * stepMs,
    volume: 1_000,
  }));
}

/**
 * A daily series that PRECEDES the intraday one and swings far wider than it.
 *
 * Both properties are load-bearing and both were learned by getting them
 * wrong. Built forward from the same instant, a 300-bar daily series supplies
 * four visible bars against a nine-day intraday window and every decision
 * falls under the 40-bar daily floor — the fixture then reports zero plans
 * while looking like a planner that refuses. Given the intraday series' own
 * amplitude, `dailyAtr` lands near the 15-minute ATR, `expectedWindowMove`
 * collapses, and every plan refuses `window_cannot_carry_payoff`. Real daily
 * ranges are multiples of intraday ones; this fixture has to be too.
 */
function precedingDailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + 3 * Math.sin(index / 4.5);
    return {
      close,
      high: close + 3.2,
      low: close - 3.2,
      open: close,
      time: startTime - count * 86_400_000 + index * 86_400_000,
      volume: 10_000,
    };
  });
}

describe("the reader refuses rather than guesses", () => {
  it("has no default anchor, because every distance is relative to one", () => {
    assert.throws(() => parseQ4Args([]), /q4AnchorRequired/);
    assert.throws(
      () => parseQ4Args(["--anchor", "yesterday"]),
      /q4AnchorRequired/,
    );
  });

  it("names an unknown flag instead of ignoring it", () => {
    assert.throws(
      () => parseQ4Args(["--anchor", "2026-08-26", "--steps", "4"]),
      /q4UnknownFlag/,
    );
  });

  it("refuses an empty market list", () => {
    assert.throws(
      () => parseQ4Args(["--anchor", "2026-08-26", "--symbols", " , "]),
      /q4EmptyPopulation/,
    );
  });

  it("refuses a repeated flag instead of taking one of them", () => {
    // Through `flagReader`, the directory's law: `indexOf` finds only the
    // first occurrence, so `--days 180 --days 7000` would walk one value
    // somewhere it does not belong under a confident success line.
    assert.throws(
      () =>
        parseQ4Args([
          "--anchor",
          "2026-08-26",
          "--days",
          "180",
          "--days",
          "7000",
        ]),
      /given 2 times/,
    );
  });

  it("refuses a flag whose value is the next FLAG", () => {
    assert.throws(
      () => parseQ4Args(["--anchor", "--json", "out.json"]),
      /owns the token after it/,
    );
  });

  it("refuses a non-integer depth rather than reading NaN", () => {
    assert.throws(
      () => parseQ4Args(["--anchor", "2026-08-26", "--days", "7000.5"]),
      /whole number/,
    );
    assert.throws(
      () => parseQ4Args(["--anchor", "2026-08-26", "--days", "x"]),
      /cannot read "x" as a number/,
    );
  });

  it("defaults the population to the scan roster, derived not listed", () => {
    const args = parseQ4Args(["--anchor", "2026-08-26"]);
    assert.equal(args.symbols.length, defaultScanSymbols.length);
  });
});

describe("the cache depth is derived from the cache", () => {
  it("reads the depth off the 15-minute stores alone", () => {
    assert.deepEqual(
      cacheDays([
        "EURUSD-15min-7000.rolling.json",
        "EURUSD-daily-7000.rolling.json",
        "EURUSD-5min-7000.rolling.json",
        "treasury-rates.rolling.json",
      ]),
      [7000],
    );
  });

  it("refuses an empty cache rather than reporting zero markets", () => {
    assert.throws(() => resolveDays(null, []), /q4EmptyCache/);
  });

  it("refuses to PICK between two rebuild depths", () => {
    // Two depths in one directory are two populations. Choosing either
    // without being told is the curated-population defect in miniature.
    assert.throws(() => resolveDays(null, [180, 7000]), /q4AmbiguousDepth/);
    assert.equal(resolveDays(7000, [180, 7000]), 7000);
    assert.throws(() => resolveDays(365, [180, 7000]), /q4DepthAbsent/);
  });
});

describe("a cache miss is a refusal, never a purchase", () => {
  it("throws q4PinMissing instead of fetching the series", async () => {
    // Executed rather than asserted from the source: this calls the real
    // `loadRollingSeries`, which reaches `fetchFull` when no store exists.
    // Reaching it IS the test — the fetcher refuses, so the only way out of
    // an empty cache is an error.
    const dir = mkdtempSync(join(tmpdir(), "q4-"));
    await assert.rejects(
      pinnedSeries({ anchor: "2026-08-26", cacheDir: dir, key: "NOPE-15min-1" }),
      /q4PinMissing/,
    );
  });
});

describe("the counterfactual differs from production by the pivot set alone", () => {
  // The fixture walks the same decision shape the reader does and asks
  // production for a plan at each point.
  const primaryBars = toBars(
    [...sawtooth(450, 12, 4), ...sawtooth(450, 24, 8)],
    900_000,
  );
  const dailyBars = precedingDailyBars(300);
  const symbol = "EURUSD";
  // The regime block is lifted the same way `simulateSymbol`'s own fixtures
  // lift it: a synthetic series sits in one regime, and the roster's cell
  // would refuse every decision on it. Nothing about the STOP chain under test
  // reads these three.
  const calibration = {
    ...getCategoryCalibration(symbol),
    blockedRegimes: [],
    runnerWindowShare: 1,
    tp1RiskShare: 0.8,
  };

  type Point = {
    atr: number;
    dailyLevels: number[];
    intradayLevels: number[];
    plannedEntry: number;
    side: "buy" | "sell";
    stopPivotDistance: number | null;
    stopBuffer: number;
  };

  const points: Point[] = [];
  for (let index = 120; index < primaryBars.length - 1; index += 8) {
    const history = primaryBars.slice(0, index + 1);
    const latest = history.at(-1)!;
    const daily = dailyBars.filter((bar) => bar.time <= latest.time);
    if (daily.length < 40) continue;
    const market = buildDecisionMarketContext({ daily, history });
    const regime = classifyRegime(market);
    if (!regime) continue;
    const consensus = scoreConsensus(
      runStrategyCommittee(symbol, market, regime),
      regime,
    );
    if (!consensus.side) continue;
    const plan = buildPricePlan(
      consensus.side,
      symbol,
      market,
      regime,
      calibration,
    );
    if (!plan) continue;
    const bars = market.primary;
    const atr = averageTrueRange(bars, 14);
    const dailyAtr = averageTrueRange(daily, 14);
    const pivots = findSwingPivots(bars, 3);
    const dailyPivots = findSwingPivots(daily, 2);
    const side = consensus.side;
    const entryOffset = atr *
      (regime.name === "trend"
        ? calibration.entryOffsetTrend
        : calibration.entryOffsetDefault);
    points.push({
      atr,
      dailyLevels: side === "buy" ? dailyPivots.lows : dailyPivots.highs,
      intradayLevels: side === "buy" ? pivots.lows : pivots.highs,
      plannedEntry: side === "buy"
        ? latest.close - entryOffset
        : latest.close + entryOffset,
      side,
      stopPivotDistance: plan.stopPivotDistance,
      stopBuffer: Math.max(
        atr * calibration.stopAtrMultiplier,
        dailyAtr * calibration.dailyStopAtrMultiplier,
      ),
    });
  }

  it("the fixture reaches production's planner, or nothing below is tested", () => {
    assert.ok(points.length >= 10, `only ${points.length} plans`);
    assert.ok(
      points.some((point) => point.stopPivotDistance !== null),
      "no plan chose a structural pivot, so the anchor is never exercised",
    );
  });

  it("REPRODUCES the plan's own stopPivotDistance on every point", () => {
    // THE ANCHOR, and the reason a shadow of production is admissible here.
    // Matching this field proves the reconstruction of the planned entry, the
    // pivot arrays, the buffer and the search direction all at once — the
    // reader refuses any market where it fails, and this is that check run
    // against the engine rather than against the reader's own beliefs.
    for (const point of points) {
      const shipped = stopUnder({
        atr: point.atr,
        entryPrice: point.plannedEntry,
        maxStopAtrMultiplier: calibration.maxStopAtrMultiplier,
        protectiveLevels: point.intradayLevels,
        side: point.side,
        stopBuffer: point.stopBuffer,
      });
      const reproduced = shipped.pivot === null
        ? null
        : Math.abs(shipped.pivot - point.plannedEntry);
      if (point.stopPivotDistance === null) {
        assert.equal(reproduced, null);
        continue;
      }
      assert.ok(reproduced !== null, "the reader found no pivot where the plan did");
      assert.ok(
        Math.abs(reproduced - point.stopPivotDistance) <= 1e-9,
        `reproduced ${reproduced} against the plan's ${point.stopPivotDistance}`,
      );
    }
  });

  it("moves nothing when the extra levels are all farther away", () => {
    // The other half of the anchor: if the union arm differed from the base
    // arm for any reason OTHER than a nearer level, every share the reader
    // prints would be inflated by that reason.
    for (const point of points) {
      const far = point.side === "buy"
        ? [point.plannedEntry - 1e6]
        : [point.plannedEntry + 1e6];
      assert.equal(
        stopUnder({
          atr: point.atr,
          entryPrice: point.plannedEntry,
          maxStopAtrMultiplier: calibration.maxStopAtrMultiplier,
          protectiveLevels: [...point.intradayLevels, ...far],
          side: point.side,
          stopBuffer: point.stopBuffer,
        }).stop,
        stopUnder({
          atr: point.atr,
          entryPrice: point.plannedEntry,
          maxStopAtrMultiplier: calibration.maxStopAtrMultiplier,
          protectiveLevels: point.intradayLevels,
          side: point.side,
          stopBuffer: point.stopBuffer,
        }).stop,
      );
    }
  });
});

describe("the stop chain's own properties, tested directly", () => {
  // The market fixture above cannot exercise these: a synthetic intraday
  // sawtooth pivots every twelve bars, so its nearest low is always nearer
  // than any daily trough and the union arm never moves. Measured on the live
  // cache the union moves on 15-34% of decisions, so the property matters —
  // it just is not reachable through that fixture, and a test that quietly
  // asserted nothing would be worse than none.
  const base = {
    atr: 1,
    entryPrice: 100,
    maxStopAtrMultiplier: 4,
    side: "buy" as const,
    stopBuffer: 0.2,
  };

  it("can only TIGHTEN, never widen, when levels are added", () => {
    // Structural, not observed. `nearestLevelBeyond` over a superset returns a
    // level at least as near, so the buffered stop is at least as near and the
    // cap only clips the far side. A run reporting a widening would be a bug
    // in the reader rather than a finding about the engine.
    const intraday = [97.4, 95.1, 92.8];
    for (const added of [99.2, 98.0, 97.5, 96.0, 93.0, 80.0]) {
      const only = stopUnder({ ...base, protectiveLevels: intraday });
      const union = stopUnder({
        ...base,
        protectiveLevels: [...intraday, added],
      });
      assert.ok(
        union.stop >= only.stop,
        `adding ${added} WIDENED the stop from ${only.stop} to ${union.stop}`,
      );
    }
  });

  it("does move when the added level is nearer, or the reader is inert", () => {
    const only = stopUnder({ ...base, protectiveLevels: [95.1] });
    const union = stopUnder({ ...base, protectiveLevels: [95.1, 98.6] });
    assert.ok(union.stop > only.stop, "a nearer level changed nothing");
    assert.equal(union.pivot, 98.6);
    assert.equal(union.provenance, "pivot");
  });

  it("falls to the volatility floor when no level exists at all", () => {
    const none = stopUnder({ ...base, protectiveLevels: [] });
    assert.equal(none.pivot, null);
    assert.equal(none.provenance, "volatility_floor");
    assert.equal(none.stop, 100 - 1.25);
  });

  it("cannot move the stop where the cap sits under the 1.25 ATR floor", () => {
    // The prediction the always-capped markets make: with
    // `maxStopAtrMultiplier <= 1.25` the cap binds on every decision, so no
    // pivot set can change the shipped stop — and a reader reporting movement
    // on one of them would be reporting its own arithmetic.
    for (const cap of [0.8, 1.0, 1.25]) {
      const capped = { ...base, maxStopAtrMultiplier: cap };
      const only = stopUnder({ ...capped, protectiveLevels: [95.1] });
      const union = stopUnder({
        ...capped,
        protectiveLevels: [95.1, 99.9, 98.6],
      });
      assert.equal(only.provenance, "cap");
      assert.equal(union.stop, only.stop, `cap ${cap} did not bind`);
    }
  });

  it("mirrors every branch for a sell", () => {
    const sell = { ...base, side: "sell" as const };
    const only = stopUnder({ ...sell, protectiveLevels: [104.9] });
    const union = stopUnder({ ...sell, protectiveLevels: [104.9, 101.4] });
    assert.ok(union.stop < only.stop, "a nearer level did not tighten a sell");
    assert.equal(
      stopUnder({ ...sell, protectiveLevels: [] }).stop,
      100 + 1.25,
    );
  });
});
