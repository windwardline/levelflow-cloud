import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  findSwingPivots,
  nearestLevelBeyond,
} from "../supabase/functions/trade-analyzer/indicators.ts";
import { GRID_OVERRIDE_KEYS, parseGridSpec } from "../scripts/sweepGrid.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * AXES-3 — pivot depth — was pre-R3 register item 4, and it was a literal.
 *
 * `findSwingPivots(bars, 3)` and `findSwingPivots(daily, 2)` sat as constants at
 * two call sites in `pricePlan.ts`. The register recorded the consequence: R3's
 * one re-sweep "cannot produce the corpus R4 is defined to read", because R4's
 * per-market program varies this axis and the grid could not express it.
 *
 * Pivot depth is upstream of everything structural — which levels exist at all,
 * and from there the stop's chosen pivot, the runner's structural target and
 * `nearestStructureDistance`. A shallower strength admits more, noisier levels.
 * Nothing has measured which pays.
 *
 * EXPRESSIBLE IS NOT CROSSED. The defaults are the shipped literals, so this
 * costs R3 nothing unless the run card names it.
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

/**
 * SHORT legs first, then long ones — and the short half is the whole point.
 *
 * With 12- and 24-bar legs, strength 3 and strength 6 find the SAME 42 swing
 * lows: the legs are longer than either dominance window, so both isolate every
 * turning point and the axis reads inert. Measured on a 4-up/2-down section,
 * strength 3 finds 89 lows and strength 6 finds 14 — a fixture where depth
 * actually decides which levels exist. The long half stays so the sweep still
 * produces ordinary plans to compare.
 */
const primaryBars: Bar[] = [...sawtooth(450, 4, 2), ...sawtooth(450, 24, 8)]
  .map((value, index) => ({
    close: value,
    high: value + 0.15,
    low: value - 0.15,
    open: value,
    time: startTime + index * 900_000,
    volume: 1_000,
  }));

const dailyBars: Bar[] = Array.from({ length: 300 }, (_, index) => {
  const close = 101.5 + 1.2 * Math.sin(index / 4.5);
  return {
    close,
    high: close + 2.5,
    low: close - 2.5,
    open: close,
    time: startTime - 300 * 86_400_000 + index * 86_400_000,
    volume: 10_000,
  };
});

function run(override: Record<string, number> = {}) {
  return simulateSymbol({
    calibrationOverride: {
      blockedRegimes: [],
      runnerWindowShare: 1,
      tp1RiskShare: 0.8,
      ...override,
    },
    dailyBars,
    primaryBars,
    stepBars: 8,
    symbol: "EURUSD",
    warmupBars: 120,
  }).outcomes;
}

describe("the shipped depth is untouched", () => {
  it("no calibration cell sets either field", () => {
    // The premise that lets this ship without an ANALYZER_VERSION bump, stated
    // as an executable check rather than a claim in a commit message.
    const set = defaultScanSymbols.filter((symbol) => {
      const cell = getCategoryCalibration(symbol);
      return cell.pivotStrengthIntraday !== undefined ||
        cell.pivotStrengthDaily !== undefined;
    });
    assert.deepEqual(
      set,
      [],
      `${set.join(", ")} now ship a pivot-depth cell — that is a ` +
        "behaviour-changing analyzer PR and must bump ANALYZER_VERSION",
    );
  });

  it("is bit-identical to the literals it replaced", () => {
    assert.deepEqual(run(), run({ pivotStrengthIntraday: 3, pivotStrengthDaily: 2 }));
  });

  it("still reads 3 and 2 in the source, as the defaults", () => {
    const source = readFileSync(
      "supabase/functions/trade-analyzer/pricePlan.ts",
      "utf8",
    );
    assert.match(source, /calibration\.pivotStrengthIntraday \?\? 3/);
    assert.match(source, /calibration\.pivotStrengthDaily \?\? 2/);
  });
});

describe("the axis is live and reaches the structure", () => {
  it("a deeper intraday strength changes the corpus", () => {
    const shallow = run({ pivotStrengthIntraday: 3 });
    const deep = run({ pivotStrengthIntraday: 6 });
    assert.ok(shallow.length > 0, "the fixture produced no rows");
    assert.notDeepEqual(
      deep,
      shallow,
      "pivot depth changed nothing, so the axis is inert and R3 would price " +
        "two identical corpora",
    );
  });

  it("reaches the structural reading a plan is built from", () => {
    // Targeted rather than sampled. The two arms' SHARED decisions all fall in
    // the long-leg half, where both depths isolate the same turning points — so
    // asserting a moved reading across shared rows would assert the fixture,
    // not the axis. This asks the question where depth actually bites: over the
    // short-leg region, is the nearest level below a given entry farther under
    // the deeper search?
    const shortLeg = primaryBars.slice(0, 450);
    const shallow = findSwingPivots(shortLeg, 3);
    const deep = findSwingPivots(shortLeg, 6);
    const entry = 101;
    const near = (lows: number[]) =>
      nearestLevelBeyond("sell", entry, lows);
    const shallowLevel = near(shallow.lows);
    const deepLevel = near(deep.lows);
    // Presence against absence, which is as stark as this gets: the 4-bar down
    // legs are shorter than a 6-bar dominance window, so strength 6 isolates
    // NO swing low in this region at all while strength 3 finds one. A plan
    // built here is structure-stopped under one depth and falls to the
    // volatility floor under the other.
    assert.equal(
      shallowLevel,
      95.85,
      "strength 3 no longer finds the short-leg trough — re-derive this fixture",
    );
    assert.equal(
      deepLevel,
      null,
      `strength 6 found ${deepLevel} in a region whose legs are shorter than ` +
        "its own dominance window — the depth is not reaching findSwingPivots",
    );
  });

  it("the deep pivot set is a SUBSET of the shallow one, at the operator", () => {
    // The property the end-to-end assertions rest on, tested where it lives: a
    // bar dominating 6 neighbours either side also dominates 3, so strength 6
    // can only ever find a subset. Asserted directly on findSwingPivots because
    // a plan-level check can only sample it.
    const shallow = findSwingPivots(primaryBars, 3);
    const deep = findSwingPivots(primaryBars, 6);
    assert.ok(deep.lows.length > 0, "the fixture has no deep pivots");
    assert.ok(
      shallow.lows.length > deep.lows.length,
      `depth changed nothing: ${shallow.lows.length} vs ${deep.lows.length} ` +
        "lows — the fixture's legs are longer than both dominance windows",
    );
    const shallowLows = new Set(shallow.lows);
    for (const low of deep.lows) {
      assert.ok(shallowLows.has(low), `${low} survives 6 but not 3`);
    }
    const shallowHighs = new Set(shallow.highs);
    for (const high of deep.highs) {
      assert.ok(shallowHighs.has(high), `${high} survives 6 but not 3`);
    }
  });

  it("a deeper search never finds MORE levels than a shallower one", () => {
    // A property of the operator: a pivot dominating 6 bars either side also
    // dominates 3, so the deep set is a subset and its nearest level can only
    // be farther or equal. A closer one would mean the depth is not the
    // dominance window it claims to be.
    const shallow = run({ pivotStrengthIntraday: 3 });
    const deep = run({ pivotStrengthIntraday: 6 });
    const byTime = new Map(shallow.map((row) => [row.time, row]));
    let compared = 0;
    for (const row of deep) {
      const before = byTime.get(row.time);
      if (!before) continue;
      if (
        row.nearestStructureDistance === null ||
        before.nearestStructureDistance === null
      ) continue;
      compared += 1;
      assert.ok(
        row.nearestStructureDistance >= before.nearestStructureDistance - 1e-12,
        `${row.time}: strength 6 found a NEARER level (` +
          `${row.nearestStructureDistance}) than strength 3 (` +
          `${before.nearestStructureDistance}) — the deeper set is not a subset`,
      );
    }
    assert.ok(compared > 0, "no decision carried both readings");
  });
});

describe("the axis is a declared grid override", () => {
  it("both fields are in GRID_OVERRIDE_KEYS", () => {
    for (const key of ["pivotStrengthIntraday", "pivotStrengthDaily"]) {
      assert.ok(
        (GRID_OVERRIDE_KEYS as readonly string[]).includes(key),
        `${key} is a calibration field the grid cannot reach — which is ` +
          "exactly the state pre-R3 register item 4 recorded",
      );
    }
  });

  it("crosses in a spec", () => {
    const combos = parseGridSpec("pivotStrengthIntraday=3,5");
    assert.deepEqual(combos.map((c) => c.pivotStrengthIntraday), [3, 5]);
  });
});
