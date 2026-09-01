import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getCategoryCalibration,
  type CategoryCalibration,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { GRID_STRING_KEYS, parseGridSpec } from "../scripts/sweepGrid.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import { defaultScanSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * R2b question 4 as a crossable axis, rather than as a decision.
 *
 * The ladder reads all four pivot arrays; the stop reads the intraday pair
 * alone. Measured over 1,908,189 decisions, giving the stop the daily arrays
 * too would move the shipped stop on 32.0% of decisions across the 71 markets
 * that can be structure-stopped.
 *
 * It is NOT adopted on that evidence. Adding levels to a nearest-beyond search
 * can only find a NEARER level, so this always tightens and never widens — and
 * a tighter stop mechanically improves every printed reward-to-risk with no
 * structural reason to believe the money improves. Amendment 39 names that
 * manufacture. Placement is not profit; R3 prices it in realized R.
 *
 * So the two things worth pinning are opposite: that the default is unchanged,
 * and that the other arm is not inert.
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

function toBars(values: readonly number[]): Bar[] {
  return values.map((value, index) => ({
    close: value,
    high: value + 0.15,
    low: value - 0.15,
    open: value,
    time: startTime + index * 900_000,
    volume: 1_000,
  }));
}

/**
 * A daily series whose swing lows sit BETWEEN the entry and the intraday lows.
 *
 * Both properties are tuned and both were arrived at by measurement. It must
 * precede the intraday series or every decision falls under the 40-bar daily
 * floor; it must swing far wider than the intraday series or `dailyAtr`
 * collapses `expectedWindowMove` and every plan refuses
 * `window_cannot_carry_payoff`; and its troughs must land ABOVE the intraday
 * sawtooth's lows, or the daily arrays add nothing the stop's search did not
 * already have and the axis reads inert.
 *
 * Centred at 101.5 with a 1.2 amplitude and a 2.5 half-range, its lows fall
 * around 97.8 against intraday lows at 95.85 and entries near 100 — so the
 * daily level is the nearer one. Centred at 100 with a 3.0 amplitude (the
 * shape `tests/q4Reader.test.ts` uses, where it is right) the troughs sit
 * below the intraday lows and the arm changes nothing at all.
 */
function precedingDailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 101.5 + 1.2 * Math.sin(index / 4.5);
    return {
      close,
      high: close + 2.5,
      low: close - 2.5,
      open: close,
      time: startTime - count * 86_400_000 + index * 86_400_000,
      volume: 10_000,
    };
  });
}

const primaryBars = toBars([...sawtooth(450, 12, 4), ...sawtooth(450, 24, 8)]);
const dailyBars = precedingDailyBars(300);

/**
 * A daily series whose swing lows sit BELOW the intraday lows — farther from
 * the entry, so the union must ignore them entirely.
 *
 * This is the fixture that separates a UNION from a REPLACEMENT, and it exists
 * because a mutation proved the other one cannot. Where the daily level is
 * nearer, both wirings pick the same level and the two are indistinguishable;
 * only a decision whose nearest daily level is FARTHER can tell them apart —
 * a replacement widens the stop there, and a union changes nothing at all.
 */
function distantDailyBars(count: number): Bar[] {
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

function runWith(
  source?: CategoryCalibration["stopStructureSource"],
  daily: Bar[] = dailyBars,
) {
  return simulateSymbol({
    calibrationOverride: {
      blockedRegimes: [],
      runnerWindowShare: 1,
      tp1RiskShare: 0.8,
      ...(source === undefined ? {} : { stopStructureSource: source }),
    },
    dailyBars: daily,
    primaryBars,
    stepBars: 8,
    symbol: "EURUSD",
    warmupBars: 120,
  }).outcomes;
}

describe("the shipped default is untouched", () => {
  it("no calibration cell sets it, so ANALYZER_VERSION need not bump", () => {
    // Stated as an executable premise rather than a claim in a commit message.
    // The day a cell sets this, global learning would pool two stop geometries
    // under one version — which is the defect the version exists to prevent —
    // and that PR must bump it. This test is what makes the omission loud.
    const set = defaultScanSymbols.filter((symbol) =>
      getCategoryCalibration(symbol).stopStructureSource !== undefined
    );
    assert.deepEqual(
      set,
      [],
      `${set.join(", ")} now ship a stop-structure cell — that is a ` +
        "behaviour-changing analyzer PR and must bump ANALYZER_VERSION",
    );
  });

  it("is bit-identical to the explicit intraday arm", () => {
    // The safety property. If these ever diverge the axis is not a research
    // dial, it is a live change nobody asked for.
    assert.deepEqual(runWith(undefined), runWith("intraday"));
  });
});

describe("the other arm is not inert, and only ever tightens", () => {
  const base = runWith("intraday");
  const daily = runWith("intraday_and_daily");

  it("the fixture produces rows, or everything below is vacuous", () => {
    assert.ok(base.length >= 10, `only ${base.length} rows`);
  });

  it("changes what the engine decides", () => {
    // On a synthetic series the axis expresses itself as ADMISSION rather than
    // as a moved stop on a shared decision, and the mechanism says why: a
    // nearer pivot shrinks `riskDistance`, which shrinks the payoff floor, so
    // the decisions it changes are mostly ones the wide-stop arm refused
    // outright. Measured on this fixture: the arms differ by 16 decisions and
    // none is lost. That is the observable to assert — requiring a moved stop
    // on a shared row would be asserting the fixture rather than the axis.
    const baseTimes = new Set(base.map((row) => row.time));
    const dailyTimes = new Set(daily.map((row) => row.time));
    const admitted = [...dailyTimes].filter((time) => !baseTimes.has(time));
    const lost = [...baseTimes].filter((time) => !dailyTimes.has(time));
    const movedStops = daily.filter((row) => {
      const before = base.find((entry) => entry.time === row.time);
      return before !== undefined && before.stopLoss !== row.stopLoss;
    });
    assert.ok(
      admitted.length + movedStops.length > 0,
      "the arm changed nothing at all, so the axis is inert and R3 would " +
        "price two identical corpora",
    );
    assert.deepEqual(
      lost,
      [],
      `${lost.length} decisions were LOST to the tighter stop — a nearer ` +
        "stop shrinks riskDistance and therefore loosens every gate " +
        "downstream, so a loss means something other than the pivot set moved",
    );
  });

  it("never places a stop FARTHER, on any decision both arms plan", () => {
    // THE UNION IS THE CLAIM. `[...pivots.lows, ...dailyPivots.lows]` is a
    // superset, and a nearest-beyond search over a superset returns a level at
    // least as near — so the pivot distance and the risk cannot grow. Wiring
    // the daily arrays as a REPLACEMENT rather than a union is the mistake
    // this catches: on a fixture whose daily pivots sit farther out, a
    // replacement widens the stop.
    let compared = 0;
    for (const row of daily) {
      const before = base.find((entry) => entry.time === row.time);
      if (!before || before.side !== row.side) continue;
      compared += 1;
      assert.ok(
        row.riskDistance <= before.riskDistance + 1e-12,
        `${row.side} at ${row.time}: risk grew from ${before.riskDistance} ` +
          `to ${row.riskDistance}, so the daily arrays replaced the intraday ` +
          "ones rather than joining them",
      );
      if (
        row.stopPivotDistance !== null && before.stopPivotDistance !== null
      ) {
        assert.ok(
          row.stopPivotDistance <= before.stopPivotDistance + 1e-12,
          `${row.time}: the chosen pivot moved FARTHER, from ` +
            `${before.stopPivotDistance} to ${row.stopPivotDistance}`,
        );
      }
    }
    assert.ok(compared > 0, "no decision appeared in both arms");
  });

  it("JOINS the daily arrays rather than replacing them", () => {
    // The mutation that proved the other assertions could not tell the
    // difference. On a market whose daily troughs sit BELOW the intraday lows,
    // every daily level is farther from the entry — so a union changes nothing
    // and a replacement widens every structural stop it touches. Bit-identical
    // is the whole assertion.
    const distant = distantDailyBars(300);
    const intraday = runWith("intraday", distant);
    const both = runWith("intraday_and_daily", distant);
    assert.ok(intraday.length >= 10, `only ${intraday.length} rows`);
    assert.deepEqual(
      both,
      intraday,
      "adding farther-away daily levels changed the corpus, so the daily " +
        "arrays are replacing the intraday ones rather than joining them",
    );
  });

  it("reaches the stop's search and not the ladder's", () => {
    // The ladder ALREADY reads all four arrays. If this axis also changed the
    // ladder it would be varying two things under one name, and R3 could not
    // attribute whatever it measured. `nearestStructureDistance` is the
    // ladder's own unfloored structural reading, computed from every array in
    // both arms, so it must be identical wherever the stop did not move the
    // planned entry — which it never does, since the entry is set before the
    // stop chain runs.
    let checked = 0;
    for (const row of daily) {
      const before = base.find((entry) => entry.time === row.time);
      if (!before || before.side !== row.side) continue;
      checked += 1;
      assert.equal(
        row.nearestStructureDistance,
        before.nearestStructureDistance,
        `${row.time}: the axis reached the ladder's structural search, which ` +
          "already reads every array",
      );
    }
    assert.ok(checked > 0, "no decision appeared in both arms");
  });
});

describe("the axis is validated like the one before it", () => {
  it("crosses in a grid spec", () => {
    const combos = parseGridSpec("stopStructureSource=intraday,intraday_and_daily");
    assert.deepEqual(combos.map((combo) => combo.stopStructureSource), [
      "intraday",
      "intraday_and_daily",
    ]);
  });

  it("refuses a value the engine cannot read", () => {
    // A typo'd value that silently overrode nothing would report the
    // baseline's numbers back as if it had varied — the reason string axes
    // are validated at all.
    assert.throws(() => parseGridSpec("stopStructureSource=daily"));
  });

  it("offers exactly the values the type allows", () => {
    // Derived from the type through an assignment the compiler checks, so a
    // third value added to one and not the other fails to build rather than
    // becoming an axis nobody can select.
    const allowed: ReadonlyArray<CategoryCalibration["stopStructureSource"]> =
      GRID_STRING_KEYS.stopStructureSource;
    assert.deepEqual([...allowed], ["intraday", "intraday_and_daily"]);
  });
});
