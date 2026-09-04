import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { normalizeFmpBars } from "../supabase/functions/trade-analyzer/bars.ts";
import {
  completedDailyBars,
  completedDailySeries,
  dailyBarCompletionMs,
} from "../supabase/functions/trade-analyzer/dailyCompletion.ts";
import {
  buildDecisionMarketContext,
  resampleBars,
} from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

// 2a + 2k + 2l (2026-08-09): the decision-time context. Every expectation in
// this file is anchored to a measured provider fact, probed against the
// minute bank and FMP's own responses on 2026-08-09 (recorded in
// docs/research/evaluator-repair-map-2026-08-09.md):
//
// - An FMP daily bar is a SETTLEMENT-DAY aggregate, not a calendar-day one.
//   ES stamped Friday 2026-08-07 opens 7735 — the bank's Thursday 18:00 ET
//   print exactly; the calendar-Friday open (7729.25) matches nothing.
//   EURUSD Monday opens equal Sunday-evening opens two weeks running, and
//   Friday's open sits 0.7 pips off the bank's Thursday 17:05 bar. ZCUSX
//   (corn) stamped Friday opens 461.75 — the bank's Thursday 20:00 print,
//   exactly. So a bar stamped D holds data through D's own session close:
//   17:00 ET (complex and FX), 14:20 ET (grains).
// - BTCUSD daily bars roll at UTC midnight: the 2026-08-08 row closes
//   64908.72, the bank's 19:59 ET minute close to the cent (NY midnight
//   reads 64734.97).
// - FX persists partial Sunday-stamped rows that are strict subsets of the
//   Monday row that follows (open/high equality, two consecutive weeks);
//   CME emits weekend-stamped in-progress rows whose true completion is
//   Monday. Neither is ever an admissible completed day.
// - FMP intraday bars anchor to the New York wall clock: hourly at :00,
//   4hour at 00/04/08/12/16/20 NY (both EURUSD and ESUSD probed). During
//   EST that grid is NOT a UTC floor.
//
// The defect this repairs: sweep.ts admitted a daily bar the moment its
// 00:00 stamp was past, so every replay decision saw its own day's
// completed OHLC — ATR, EMAs, regime, volatility percentile and the
// expected-window move all read the future. The live loader had the twin
// defect in the other direction: it fed indicators a genuinely partial
// current bar. One shared completion module now gates both sides.

function bar(time: number, value = 100, volume = 1_000): Bar {
  return {
    close: value,
    high: value + 0.5,
    low: value - 0.5,
    open: value,
    time,
    volume,
  };
}

// 2026 calendar facts used throughout: Aug 7 is a Friday (Aug 9 today is
// Sunday), Jan 9 is a Friday, Aug 2 a Sunday, Aug 1 a Saturday, Jul 31 a
// Friday, Mar 8 the spring-forward Sunday. EDT offset -4, EST offset -5.
const NY_MIDNIGHT_FRI_AUG7 = Date.UTC(2026, 7, 7, 4);
const NY_MIDNIGHT_FRI_JAN9 = Date.UTC(2026, 0, 9, 5);

describe("dailyBarCompletionMs — when a daily bar's data actually ends (2a)", () => {
  it("completes a complex bar at 17:00 New York of its stamp date, both DST regimes", () => {
    // ES probe: Friday row opens at the bank's Thursday 18:00 print (7735),
    // so the Friday row's data runs to Friday 17:00 and no further.
    assert.equal(
      dailyBarCompletionMs("ESUSD", NY_MIDNIGHT_FRI_AUG7),
      Date.UTC(2026, 7, 7, 21),
    );
    assert.equal(
      dailyBarCompletionMs("ESUSD", NY_MIDNIGHT_FRI_JAN9),
      Date.UTC(2026, 0, 9, 22),
    );
  });

  it("completes a forex bar at 17:00 New York — the trading-day convention the Monday=Sunday opens prove", () => {
    assert.equal(
      dailyBarCompletionMs("EURUSD", NY_MIDNIGHT_FRI_AUG7),
      Date.UTC(2026, 7, 7, 21),
    );
  });

  it("completes a grain bar at 14:20 New York — corn's Friday row opens on Thursday 20:00 exactly", () => {
    assert.equal(
      dailyBarCompletionMs("ZCUSX", NY_MIDNIGHT_FRI_AUG7),
      Date.UTC(2026, 7, 7, 18, 20),
    );
  });

  it("completes a crypto bar at the next UTC midnight — BTC's daily close is the 19:59 ET minute close to the cent", () => {
    assert.equal(
      dailyBarCompletionMs("BTCUSD", NY_MIDNIGHT_FRI_AUG7),
      Date.UTC(2026, 7, 8),
    );
    assert.equal(
      dailyBarCompletionMs("BTCUSD", NY_MIDNIGHT_FRI_JAN9),
      Date.UTC(2026, 0, 10),
    );
  });

  it("never completes a weekend-stamped non-crypto row — FX Sundays are persisted duplicates, CME weekend rows are in-progress transients", () => {
    assert.equal(dailyBarCompletionMs("EURUSD", Date.UTC(2026, 7, 2, 4)), null);
    assert.equal(dailyBarCompletionMs("ESUSD", Date.UTC(2026, 7, 2, 4)), null);
    assert.equal(dailyBarCompletionMs("ZCUSX", Date.UTC(2026, 7, 2, 4)), null);
    assert.equal(dailyBarCompletionMs("EURUSD", Date.UTC(2026, 7, 1, 4)), null);
    // Crypto weekends are genuine completed UTC days.
    assert.equal(
      dailyBarCompletionMs("BTCUSD", Date.UTC(2026, 7, 2, 4)),
      Date.UTC(2026, 7, 3),
    );
  });
});

describe("completedDailySeries — the corpus's daily view, weekend duplicates removed (2a)", () => {
  it("drops the FX Sunday duplicate and keeps completions strictly increasing", () => {
    const series = completedDailySeries("EURUSD", [
      bar(Date.UTC(2026, 6, 31, 4)),
      bar(Date.UTC(2026, 7, 2, 4)),
      bar(Date.UTC(2026, 7, 3, 4)),
    ]);
    assert.deepEqual(
      series.map((entry) => entry.completeAtMs),
      [Date.UTC(2026, 6, 31, 21), Date.UTC(2026, 7, 3, 21)],
    );
    assert.deepEqual(
      series.map((entry) => entry.bar.time),
      [Date.UTC(2026, 6, 31, 4), Date.UTC(2026, 7, 3, 4)],
    );
  });

  it("keeps every crypto day — Saturday and Sunday are real UTC trading days", () => {
    const series = completedDailySeries("BTCUSD", [
      bar(Date.UTC(2026, 6, 31, 4)),
      bar(Date.UTC(2026, 7, 1, 4)),
      bar(Date.UTC(2026, 7, 2, 4)),
    ]);
    assert.equal(series.length, 3);
  });
});

describe("completedDailyBars — the leak this exists to close (2a)", () => {
  const thursday = bar(Date.UTC(2026, 7, 6, 4), 101);
  const friday = bar(NY_MIDNIGHT_FRI_AUG7, 102);

  it("hides Friday's completed OHLC from a Friday-morning decision", () => {
    // The old gate admitted the Friday row at 00:00 Friday, so a 09:30
    // decision read the full session's range hours before it traded.
    const visible = completedDailyBars(
      "ESUSD",
      [thursday, friday],
      Date.UTC(2026, 7, 7, 13, 30),
    );
    assert.deepEqual(visible, [thursday]);
  });

  it("admits Friday's row the moment its session closes", () => {
    const visible = completedDailyBars(
      "ESUSD",
      [thursday, friday],
      Date.UTC(2026, 7, 7, 21),
    );
    assert.deepEqual(visible, [thursday, friday]);
  });

  it("excludes the live in-progress row mid-session — the loader's twin defect", () => {
    // At Monday 11:00 the provider already serves a Monday-stamped partial;
    // indicators must wait for 17:00.
    const monday = bar(Date.UTC(2026, 7, 10, 4), 103);
    const visible = completedDailyBars(
      "ESUSD",
      [thursday, friday, monday],
      Date.UTC(2026, 7, 10, 15),
    );
    assert.deepEqual(visible, [thursday, friday]);
  });
});

describe("the gate must be cheap — it runs inside the scan's 2s CPU budget", () => {
  it("completes 22,000 gate reads in well under the chunk budget", () => {
    // #288's deploy failure: the completion gate cost ~595ms per 11-symbol
    // scan chunk because the wall-clock converter constructed two
    // Intl.DateTimeFormat objects PER CALL, and chunks were already sized
    // near the 2s Edge CPU ceiling — chunk two died 546 and the client
    // aborted the scan (2 of 10 requests). Hoisted formatters plus a
    // completion memo keyed on (rule, bar time) — daily stamps are shared
    // across every symbol on a warm instance — put the same work near
    // zero. The ceiling here is ~80x the memoized cost so CI runners
    // cannot flake it, while the unmemoized regression (~1,200ms) can
    // never pass it.
    const bars = Array.from({ length: 1_000 }, (_, index) =>
      bar(Date.UTC(2022, 0, 3, 5) + index * 86_400_000, 100));
    const started = performance.now();
    for (let pass = 0; pass < 2; pass += 1) {
      for (let symbolIndex = 0; symbolIndex < 11; symbolIndex += 1) {
        completedDailyBars("ESUSD", bars, Date.UTC(2026, 7, 9));
      }
    }
    const elapsed = performance.now() - started;
    assert.ok(
      elapsed < 400,
      `22 gate passes over 1,000 bars took ${elapsed.toFixed(0)}ms`,
    );
  });

  it("decodes a cold scan chunk's bar volume inside the budget too", () => {
    // #289's deploy still died 546 after the gate fix: the DECODE was the
    // other half. toTimestamp pays the wall-clock conversion per bar, and a
    // cold 11-symbol chunk decodes ~66 series — at ~19ms per 3,000-bar
    // series that is ~1.2s of CPU before any analysis. Bar stamps repeat
    // across every symbol on the same timeframe grid, so the conversion
    // memoizes per wall-clock stamp: the first series pays the Intl reads,
    // the other ten hit the map. Ceiling sized for CI hardware: memoized
    // measures ~117ms on the slowest runner (~30ms locally), the
    // unmemoized regression ~183ms locally and 2-4x that on CI — 250ms
    // sits about 2x above the one and safely under the other.
    const payload = Array.from({ length: 3_000 }, (_, index) => {
      const day = 1 + Math.floor(index / 96) % 28;
      const minuteOfDay = (index % 96) * 15;
      const hour = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
      const minute = String(minuteOfDay % 60).padStart(2, "0");
      return {
        close: 100,
        date: `2026-07-${String(day).padStart(2, "0")} ${hour}:${minute}:00`,
        high: 101,
        low: 99,
        open: 100,
        volume: 1,
      };
    });
    // The ceiling used to be wall-clock: `elapsed < 250` for eleven series.
    // That measured the machine as much as the code. On a loaded laptop it read
    // 261-578ms and failed on untouched main, so it produced local reds that
    // were not defects — and a red that is not a defect is worse than no gate,
    // because the next real one is indistinguishable from it.
    //
    // The property this exists to protect is the sentence above: the first
    // series pays the Intl reads, the other ten hit the map. That is a RATIO,
    // and a ratio cancels the machine out. Both halves are timed in the same
    // process on the same hardware, so a slow runner slows both and the verdict
    // does not move.
    //
    // The zone is deliberately one no other test touches. `wallClockCache` is
    // module-level and keyed by zone, so a shared zone would arrive already
    // warm from whichever test ran first and the cold half would measure
    // nothing.
    const coldZone = "Pacific/Chatham";

    const coldStart = performance.now();
    normalizeFmpBars(payload, 3_000, coldZone);
    const cold = performance.now() - coldStart;

    const warmRuns = 10;
    const warmStart = performance.now();
    for (let symbolIndex = 0; symbolIndex < warmRuns; symbolIndex += 1) {
      normalizeFmpBars(payload, 3_000, coldZone);
    }
    const warmPerSeries = (performance.now() - warmStart) / warmRuns;

    // A cold read too small to measure makes the ratio noise rather than
    // evidence. Refuse instead of reporting a pass this run did not earn.
    assert.ok(
      cold >= 5,
      `cold decode measured ${cold.toFixed(1)}ms, too small for the ratio below to mean anything — the payload or the zone cache changed shape`,
    );

    // Removing the memo makes every series pay the Intl reads, so warm rises to
    // meet cold and the ratio collapses toward 1. Locally the memoized path is
    // roughly 6x cheaper; 3x is the failure line, far enough from 1 to catch the
    // regression and far enough from 6 to ignore scheduling noise.
    assert.ok(
      warmPerSeries * 3 < cold,
      `wall-clock memo is not paying: cold series ${cold.toFixed(1)}ms vs warm ${warmPerSeries.toFixed(1)}ms/series (${(cold / warmPerSeries).toFixed(1)}x, needs > 3x)`,
    );
  });
});

describe("resampleBars — New York wall-clock buckets (2k)", () => {
  const nyBar = (
    month: number,
    day: number,
    hourUtc: number,
    minute: number,
    value: number,
  ) => bar(Date.UTC(2026, month, day, hourUtc, minute), value);

  it("buckets hourly at :00 New York and stamps the bucket start, merging OHLCV", () => {
    // FMP's own hourly grid: stamps at :00, probed on EURUSD 2026-08-06/07.
    const bars = [
      nyBar(7, 7, 13, 15, 100),
      nyBar(7, 7, 13, 30, 101),
      nyBar(7, 7, 13, 45, 99),
      nyBar(7, 7, 14, 0, 102),
    ];
    const hourly = resampleBars(bars, 60);
    assert.equal(hourly.length, 2);
    assert.equal(hourly[0].time, Date.UTC(2026, 7, 7, 13));
    assert.equal(hourly[0].open, 100);
    assert.equal(hourly[0].close, 99);
    assert.equal(hourly[0].high, 101.5);
    assert.equal(hourly[0].low, 98.5);
    assert.equal(hourly[0].volume, 3_000);
    assert.equal(hourly[1].time, Date.UTC(2026, 7, 7, 14));
    assert.equal(hourly[1].volume, 1_000);
  });

  it("is phase-independent — dropping the leading bar cannot move a later bucket", () => {
    // The count-grouping it replaces shifted every boundary when the slice
    // offset changed, so the same clock hour resampled differently at
    // different decision points.
    const bars = [
      nyBar(7, 7, 13, 15, 100),
      nyBar(7, 7, 13, 30, 101),
      nyBar(7, 7, 13, 45, 99),
      nyBar(7, 7, 14, 0, 102),
      nyBar(7, 7, 14, 15, 103),
    ];
    const full = resampleBars(bars, 60);
    const offset = resampleBars(bars.slice(1), 60);
    assert.deepEqual(offset.at(-1), full.at(-1));
    assert.equal(offset[0].time, full[0].time);
  });

  it("leaves a session gap empty instead of spanning it", () => {
    // ES has no 17:00 hour — the maintenance break. A bucket for it would
    // be an invented bar.
    const bars = [
      nyBar(7, 6, 20, 0, 100),
      nyBar(7, 6, 20, 15, 100),
      nyBar(7, 6, 20, 30, 100),
      nyBar(7, 6, 20, 45, 100),
      nyBar(7, 6, 22, 0, 101),
    ];
    const hourly = resampleBars(bars, 60);
    assert.deepEqual(
      hourly.map((entry) => entry.time),
      [Date.UTC(2026, 7, 6, 20), Date.UTC(2026, 7, 6, 22)],
    );
  });

  it("anchors 4hour buckets to New York midnight in EST — where UTC floors break", () => {
    // FMP 4hour stamps: 00/04/08/12/16/20 NY on both probed symbols. In
    // EST, NY midnight is 05:00 UTC; a UTC floor would stamp 04:00.
    const bars = [
      nyBar(0, 9, 5, 0, 100),
      nyBar(0, 9, 6, 15, 101),
      nyBar(0, 9, 8, 45, 102),
      nyBar(0, 9, 9, 0, 103),
    ];
    const fourHour = resampleBars(bars, 240);
    assert.deepEqual(
      fourHour.map((entry) => entry.time),
      [Date.UTC(2026, 0, 9, 5), Date.UTC(2026, 0, 9, 9)],
    );
  });

  it("holds one bucket across the spring-forward jump", () => {
    // Mar 8 2026, 02:00 EST → 03:00 EDT: 01:45 EST and 03:00 EDT are both
    // inside the 00:00–04:00 NY bucket even though a wall-clock hour
    // vanished between them.
    const bars = [
      bar(Date.UTC(2026, 2, 8, 6, 45), 100),
      bar(Date.UTC(2026, 2, 8, 7, 0), 101),
    ];
    const fourHour = resampleBars(bars, 240);
    assert.equal(fourHour.length, 1);
    assert.equal(fourHour[0].time, Date.UTC(2026, 2, 8, 5));
  });
});

describe("buildDecisionMarketContext — what a replay decision is allowed to see (2l)", () => {
  const history = Array.from(
    { length: 60 },
    (_, index) => bar(Date.UTC(2026, 7, 6, 12) + index * 900_000, 100 + index * 0.01),
  );
  const daily = Array.from(
    { length: 45 },
    (_, index) => bar(Date.UTC(2026, 5, 1, 4) + index * 86_400_000, 100),
  );
  const fiveMin = (count: number) =>
    Array.from(
      { length: count },
      (_, index) =>
        bar(Date.UTC(2026, 7, 7, 8) + index * 300_000, 100 + index * 0.001),
    );

  it("offers four timeframes without a real 5min series — never a resampled imitation", () => {
    const market = buildDecisionMarketContext({ daily, history });
    assert.deepEqual(market.availableTimeframes, [
      "1day",
      "4hour",
      "1hour",
      "15min",
    ]);
    assert.equal(market.latest, history.at(-1));
    assert.equal(market.latestTimeframe, "15min");
    assert.equal(market.primaryTimeframe, "15min");
    assert.equal(market.quote, null);
    assert.equal(market.timeframes["5min"], undefined);
  });

  it("seats 5min in the committee once the series clears the loader's own 40-bar floor", () => {
    // Production votes over five timeframes (1min is filtered from the
    // committee); replay voting over four moved scores 63.9% and flipped
    // sides on 5min-breakable ties. Same list, same order, same floor as
    // marketLoader.ts builds live.
    const market = buildDecisionMarketContext({
      daily,
      fiveMin: fiveMin(40),
      history,
    });
    assert.deepEqual(market.availableTimeframes, [
      "1day",
      "4hour",
      "1hour",
      "15min",
      "5min",
    ]);
    assert.equal(market.timeframes["5min"]?.length, 40);
    assert.equal(market.latestTimeframe, "15min");
  });

  it("refuses a 5min series below the floor, exactly as the live loader would", () => {
    const market = buildDecisionMarketContext({
      daily,
      fiveMin: fiveMin(39),
      history,
    });
    assert.equal(market.timeframes["5min"], undefined);
    assert.deepEqual(market.availableTimeframes, [
      "1day",
      "4hour",
      "1hour",
      "15min",
    ]);
  });

  it("resamples signal timeframes from the same wall-clock buckets the resampler owns", () => {
    const market = buildDecisionMarketContext({ daily, history });
    assert.deepEqual(
      market.timeframes["1hour"],
      resampleBars(history.slice(-960), 60).slice(-240),
    );
    assert.deepEqual(
      market.timeframes["4hour"],
      resampleBars(history.slice(-3840), 240).slice(-240),
    );
  });
});

describe("both sides run the one completion module — the parity that makes 2a a fix, not a fork", () => {
  const sweepSource = readFileSync(
    "supabase/functions/trade-analyzer/sweep.ts",
    "utf8",
  );
  const loaderSource = readFileSync(
    "supabase/functions/trade-analyzer/marketLoader.ts",
    "utf8",
  );
  const indexSource = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );
  const scriptSource = readFileSync("scripts/replay-sweep.ts", "utf8");

  it("replay gates its daily series through completedDailySeries and builds context through the shared builder", () => {
    assert.match(sweepSource, /completedDailySeries\(/);
    assert.match(sweepSource, /buildDecisionMarketContext\(\{/);
    assert.match(sweepSource, /fiveMinuteBars\?\:\s*Bar\[\]/);
  });

  it("the live loader applies the completion gate before assembling context", () => {
    assert.match(
      loaderSource,
      /completeDaily/,
      "marketLoader must accept and apply the completion policy",
    );
    assert.match(indexSource, /completedDailyBars\(/);
    assert.match(
      indexSource,
      /from "\.\/dailyCompletion\.ts"/,
    );
  });

  it("the sweep driver fetches a real 5min series and hands it to the simulator", () => {
    assert.match(scriptSource, /-5min-/);
    assert.match(scriptSource, /fiveMinuteBars/);
    assert.match(scriptSource, /historical-chart\/\$\{timeframe\}/);
    assert.match(
      scriptSource,
      /fetchIntradayBars\(providerSymbol, args\.days, [^)]*"5min"\)/,
    );
  });

  it("the chart feed stays ungated — a forming candle on screen is truth, a forming candle in an indicator is a leak", () => {
    const marketData = readFileSync("supabase/functions/market-data/index.ts", "utf8");
    assert.doesNotMatch(marketData, /completedDailyBars|dailyCompletion/);
  });
});
