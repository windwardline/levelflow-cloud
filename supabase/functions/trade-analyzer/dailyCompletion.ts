import { newYorkClockParts, newYorkWallClockToUtcMs } from "./bars.ts";
import { getAssetType } from "./calibration.ts";
import type { Bar } from "./types.ts";

// 2a (2026-08-09): when is a daily bar's data actually complete?
//
// FMP daily bars are settlement-day aggregates, not calendar-day ones —
// probed against the minute bank on 2026-08-09 (full protocol in
// docs/research/evaluator-repair-map-2026-08-09.md):
//
// - ES stamped Friday opens at the bank's Thursday 18:00 ET print (7735,
//   exact); corn stamped Friday opens at Thursday 20:00 (461.75, exact);
//   EURUSD Monday opens equal Sunday-evening opens two weeks running. So a
//   bar stamped D holds data through D's OWN session close and no further:
//   17:00 New York for the CME complex and FX, 14:20 for the grains.
// - BTCUSD rolls at UTC midnight: the daily close equals the bank's
//   19:59 ET minute close to the cent. A crypto bar stamped D completes at
//   UTC midnight of D+1 — hours before New York midnight.
// - Weekend-stamped non-crypto rows are never completed days: FX persists
//   Sunday partials that are strict subsets of the Monday row that follows
//   (double-counting Sunday evening in any series that keeps them), and CME
//   emits weekend-stamped in-progress rows whose true completion is Monday
//   under a different stamp.
//
// Both sides of the Deno boundary run THIS module: sweep.ts gates what a
// replay decision may see (the old time<=now admission leaked the decision
// day's completed OHLC into ATR, EMAs, regime and the expected-window
// move), and the live loader gates the genuinely-partial current bar out of
// the same indicators. One implementation, so parity is structural.

export type CompletedDailyBar = { bar: Bar; completeAtMs: number };

/**
 * The instant a daily bar stamped at `barTimeMs` (New York midnight of its
 * stamp date, per toTimestamp) stops changing — or null for the
 * weekend-stamped non-crypto rows that never represent a completed day.
 */
export function dailyBarCompletionMs(
  symbol: string,
  barTimeMs: number,
): number | null {
  const stamp = newYorkClockParts(barTimeMs);
  if (getAssetType(symbol) === "crypto") {
    // UTC midnight after the stamp date. The stamp's NY date and UTC date
    // agree for a NY-midnight stamp, so this is Date.UTC of D plus one day.
    return Date.UTC(stamp.year, stamp.month - 1, stamp.day) + 86_400_000;
  }
  if (stamp.weekday >= 6) {
    return null;
  }
  if (getAssetType(symbol) === "agriculture") {
    return newYorkWallClockToUtcMs(
      stamp.year,
      stamp.month,
      stamp.day,
      14,
      20,
      0,
    );
  }
  // The complex and FX share the 17:00 close. Livestock settles earlier in
  // the afternoon, so 17:00 admits its bar a few hours late — a delay,
  // never a leak; the session calendar (sessions.ts) keeps it on the same
  // complex branch for the same reason.
  return newYorkWallClockToUtcMs(stamp.year, stamp.month, stamp.day, 17, 0, 0);
}

/**
 * The corpus's admissible daily view: weekend duplicates and transients
 * removed, each surviving bar annotated with its completion instant.
 * Completions are strictly increasing for a time-sorted series, which is
 * what lets the sweep advance a pointer instead of re-filtering.
 */
export function completedDailySeries(
  symbol: string,
  bars: Bar[],
): CompletedDailyBar[] {
  const series: CompletedDailyBar[] = [];
  for (const bar of bars) {
    const completeAtMs = dailyBarCompletionMs(symbol, bar.time);
    if (completeAtMs !== null) {
      series.push({ bar, completeAtMs });
    }
  }
  return series;
}

/** The live-loader convenience: bars whose data is complete as of `asOfMs`. */
export function completedDailyBars(
  symbol: string,
  bars: Bar[],
  asOfMs: number,
): Bar[] {
  return completedDailySeries(symbol, bars)
    .filter((entry) => entry.completeAtMs <= asOfMs)
    .map((entry) => entry.bar);
}
