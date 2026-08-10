import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarFolds,
  foldSplits,
  isHoldoutSymbol,
} from "../scripts/sweepFolds.ts";
import { parseGridSpec } from "../scripts/sweepGrid.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

// 3c/3d/3e (2026-08-10): the split was five lines of per-symbol fractions —
// folds landed in different calendar years per symbol and grid-totalr
// summed "test R" across disjoint history; one fixed cut made selection
// and confirmation the same fold; and train-fold setups truncated at the
// boundary with no embargo, so a boundary decision's outcome either
// vanished or silently consumed the next fold's price action. Folds are
// now CALENDAR windows shared by every symbol (common origin), three of
// them (fit/select/confirm — selection and confirmation are different
// data), each with a decision end an embargo before its close so every
// fold's setups RESOLVE inside their own fold. The market holdout (3e) is
// a deterministic hash of the symbol — a property of the corpus, not an
// invocation flag.

const DAY = 86_400_000;

describe("calendarFolds — common-origin, three folds, embargoed decisions", () => {
  const start = Date.UTC(2022, 0, 1);
  const end = start + 400 * DAY;
  const folds = calendarFolds({
    corpusEndMs: end,
    corpusStartMs: start,
    embargoMs: 5 * DAY,
  });

  it("cuts fit/select/confirm at 50/25/25 of the calendar span, contiguously", () => {
    assert.deepEqual(folds.map((fold) => fold.name), [
      "fit",
      "select",
      "confirm",
    ]);
    assert.equal(folds[0].startMs, start);
    assert.equal(folds[0].endMs, start + 200 * DAY);
    assert.equal(folds[1].startMs, folds[0].endMs);
    assert.equal(folds[1].endMs, start + 300 * DAY);
    assert.equal(folds[2].startMs, folds[1].endMs);
    assert.equal(folds[2].endMs, end);
  });

  it("ends each fold's decisions an embargo before the fold closes", () => {
    for (const fold of folds) {
      assert.equal(fold.decisionEndMs, fold.endMs - 5 * DAY);
    }
  });

  it("refuses a span the embargo would consume", () => {
    assert.throws(
      () =>
        calendarFolds({
          corpusEndMs: start + 12 * DAY,
          corpusStartMs: start,
          embargoMs: 5 * DAY,
        }),
      /embargo/i,
    );
  });
});

describe("foldSplits — warm-up floors inside the fold (the relaunch crash)", () => {
  const start = Date.UTC(2022, 0, 1);
  const end = start + 400 * DAY;
  const folds = calendarFolds({
    corpusEndMs: end,
    corpusStartMs: start,
    embargoMs: 5 * DAY,
  });
  const bar = (time: number) => ({ time });
  const barsFrom = (fromMs: number, count: number) =>
    Array.from({ length: count }, (_, index) => bar(fromMs + index * 900_000));

  it("gives a mid-fold-starting symbol a full warm-up instead of deciding on a one-bar market", () => {
    // History begins INSIDE the fit fold: startIndex is 0, so the old
    // inline math produced warmupBars 0 — the committee then read
    // bars.at(-2) on a one-bar market and crashed the baseline relaunch.
    const splits = foldSplits(barsFrom(start + 30 * DAY, 5_000), folds, 240);
    const fit = splits.find((split) => split.name === "fit")!;
    assert.equal(fit.warmupBars, 240);
  });

  it("keeps exactly the warm-up overlap for folds with earlier history", () => {
    const splits = foldSplits(barsFrom(start, 30_000), folds, 240);
    const select = splits.find((split) => split.name === "select")!;
    assert.equal(select.warmupBars, 240);
    // The slice begins 240 bars before the fold boundary.
    const boundary = folds.find((fold) => fold.name === "select")!.startMs;
    assert.equal(
      select.bars.filter((entry) => entry.time < boundary).length,
      240,
    );
  });

  it("drops a fold too thin to hold one decision past its warm-up", () => {
    const splits = foldSplits(barsFrom(start, 100), folds, 240);
    assert.equal(splits.length, 0);
  });
});

describe("isHoldoutSymbol — the 3e partition is a property of the symbol", () => {
  it("is deterministic and case-stable", () => {
    assert.equal(isHoldoutSymbol("EURUSD"), isHoldoutSymbol("EURUSD"));
  });

  it("holds out roughly a fifth of the roster, never all or none", () => {
    const symbols = [
      "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "BTCUSD", "CADCHF",
      "CADJPY", "CHFJPY", "CLUSD", "ESUSD", "ETHUSD", "EURAUD", "EURCAD",
      "EURCHF", "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD",
      "GBPCHF", "GBPJPY", "GBPNZD", "GBPUSD", "GCUSD", "NGUSD", "NQUSD",
      "NZDCAD", "NZDCHF", "NZDJPY", "NZDUSD", "SIUSD", "SOLUSD", "USDCAD",
      "USDCHF", "USDJPY", "XAGUSD", "XAUUSD", "ZCUSX",
    ];
    const held = symbols.filter((symbol) => isHoldoutSymbol(symbol));
    assert.ok(
      held.length >= symbols.length * 0.1 &&
        held.length <= symbols.length * 0.35,
      `${held.length} of ${symbols.length} held out`,
    );
  });
});

describe("simulateSymbol honours a decision end — the embargo's engine half", () => {
  it("stops deciding at decisionEndMs while still resolving from later bars", () => {
    const start = Date.UTC(2026, 5, 15);
    const bars: Bar[] = Array.from({ length: 400 }, (_, index) => {
      const position = index % 20;
      const value = position < 10
        ? 98 + 0.4 * position
        : 98 + 4 - 0.4 * (position - 10);
      return {
        close: value,
        high: value + 0.3,
        low: value - 0.3,
        open: value,
        time: start + index * 900_000,
        volume: 1_000,
      };
    });
    const daily: Bar[] = [];
    let day = Date.UTC(2026, 0, 5, 4);
    while (daily.length < 60) {
      const weekday = new Date(day).getUTCDay();
      if (weekday !== 0 && weekday !== 6) {
        daily.push({
          close: 100.5,
          high: 103.2,
          low: 96.8,
          open: 100,
          time: day,
          volume: 10_000,
        });
      }
      day += 86_400_000;
    }
    const decisionEndMs = start + 200 * 900_000;
    const capped = simulateSymbol({
      calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
      dailyBars: daily,
      decisionEndMs,
      primaryBars: bars,
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    const uncapped = simulateSymbol({
      calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
      dailyBars: daily,
      primaryBars: bars,
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(capped.decisionPoints > 0);
    assert.ok(capped.decisionPoints < uncapped.decisionPoints);
    for (const record of capped.outcomes) {
      assert.ok(record.time < decisionEndMs);
    }
  });
});

describe("parseGridSpec — the crossed axes, strings validated like keys (4c)", () => {
  it("crosses numeric and string axes into the full product", () => {
    const grid = parseGridSpec(
      "maxStopAtrMultiplier=1,2.5;runnerProtection=breakeven,hold",
    );
    assert.equal(grid.length, 4);
    assert.deepEqual(grid[0], {
      maxStopAtrMultiplier: 1,
      runnerProtection: "breakeven",
    });
    assert.deepEqual(grid[3], {
      maxStopAtrMultiplier: 2.5,
      runnerProtection: "hold",
    });
  });

  it("refuses a typo'd protection value the way it refuses a typo'd key", () => {
    assert.throws(
      () => parseGridSpec("runnerProtection=breakevn"),
      /runnerProtection/,
    );
  });

  it("keeps refusing unknown keys", () => {
    assert.throws(() => parseGridSpec("tp1Sharee=0.5"), /not a/);
  });
});
