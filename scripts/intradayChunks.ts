// R0's intraday chunk plan, extracted pure so the 1b fix is pinned by
// behaviour rather than by source-text regexes (fleet review #358,
// findings 1 and 5). replay-sweep.ts runs main() on import, so anything
// that must be testable cannot live there.
//
// FMP caps a single intraday response, and the cap is a per-timeframe
// FACT — MEASURED 2026-08-18, after the allowance upgrade, one probe
// each (recorded in docs/cache-rebuild-r0.md §0):
//
//   15min: a 29-day BTCUSD window returned 2,880 rows — 30 dates at
//          96/96 min/max per date, COMPLETE → cap ≥ 2,880
//   5min:  an 8-date BTCUSD window returned 2,304 rows complete
//          → cap ≥ 2,304 (the audit-era ~2,000 clip — remediation 1b:
//          the sawtooth that left EURUSD 5-minute-dense on 1,408 of
//          5,247 days — is not currently binding)
//
// Window arithmetic is DATE-based (the endpoint takes YYYY-MM-DD), `to`
// is MEASURED INCLUSIVE, and adjacent windows deliberately share their
// boundary date so no hole can open. The chunk sizes keep the physical
// worst case — chunkDays + 1 calendar dates, plus the fall-back day's
// extra hour — under the measured caps:
//
//   5min:  5 days → worst 6 dates × 288 + 12 = 1,740 rows  (cap ≥ 2,304)
//   15min: 29 days → worst 30 dates × 96 + 4 = 2,884 rows  (cap ≥ 2,880)
//
// HOW A FUTURE CLIP IS CAUGHT — stated honestly, because two designs
// died here (#358 rounds 1 and 4): a row-count tripwire above the
// physical maximum can never fire (a complete chunk cannot reach it and
// a clipped chunk returns fewer rows still), and an oldest-bar coverage
// check false-trips on sessioned markets (a holiday-cluster window can
// legitimately open days late — a run-killing false positive). Per-chunk
// clip detection without false positives is not achievable from inside
// one response. The guard is therefore layered where the context is:
// the sweep records a per-timeframe chunk row-count tally into the
// manifest (a clip shows as a constant count below the window's physical
// maximum, visible to any reader), verify-cache-clock bounds the
// 5min/15min density with a floor AND a ceiling (a clipped primary
// inflates the ratio), and R1's E2 adds the per-symbol density assertion
// at the corpus door.

export type IntradayTimeframe = "15min" | "5min";

export const INTRADAY_CHUNK_DAYS: Record<IntradayTimeframe, number> = {
  "15min": 29,
  "5min": 5,
};

/** Bars per date at full 24/7 density, for physical-maximum arithmetic. */
export const BARS_PER_DATE: Record<IntradayTimeframe, number> = {
  "15min": 96,
  "5min": 288,
};

// Walking back stops after this many consecutive empty DAYS — how the end
// of a symbol's history is detected rather than assumed. 90 days clears
// any plausible holiday or provider gap (largest observed: 33.9d,
// XAUUSD). Expressed in days, not windows: when the 5-minute chunk
// shrank, a three-WINDOW streak would have quietly become a ~15-day stop
// and amputated any history behind a moderate gap.
export const EMPTY_WINDOW_CLEARANCE_DAYS = 90;

export function emptyStreakLimitFor(timeframe: IntradayTimeframe): number {
  return Math.ceil(
    EMPTY_WINDOW_CLEARANCE_DAYS / INTRADAY_CHUNK_DAYS[timeframe],
  );
}

// Safety ceiling only — it must never be the binding constraint, so it
// sits above every confirmed provider floor. Floors from the 2026-08-10
// corpus manifest (the 4a report — which superseded a 2026-07-29
// walk-back that had read crypto as ~1,060-1,200 days): forex begins
// 2010-01 (~6,050 days), crypto MAJORS 2013-2017 (BTCUSD 2013-11 with
// 383k 15-minute bars, ETHUSD 2015-08, DASH/DOGE 2017), young listings
// 2020-2023 (~1,030-2,150), XAUUSD 2013-07 (~4,760), CME futures
// 2023-09/10 (~1,031-1,038). Depth is discovered per symbol at run
// time, never assumed.
export const MAX_DEPTH_DAYS = 7_000;

export type ChunkWindow = { fromMs: number; toMs: number };

/**
 * The backward walk's windows, newest first. Adjacent windows share their
 * boundary instant (this window's `fromMs` is the next older window's
 * `toMs`), so date-truncated requests tile without holes under either
 * `to` convention; the cache's mergeByTime dissolves the duplicate
 * boundary day. In top-up mode (`sinceMs`), the walk stops at the first
 * window that ends before the floor — everything older is already stored.
 */
export function intradayChunkWindows(input: {
  days: number;
  nowMs: number;
  sinceMs?: number;
  timeframe: IntradayTimeframe;
}): ChunkWindow[] {
  const { days, nowMs, sinceMs, timeframe } = input;
  const chunkDays = INTRADAY_CHUNK_DAYS[timeframe];
  const ceiling = days >= MAX_DEPTH_DAYS ? MAX_DEPTH_DAYS : days;
  const windows: ChunkWindow[] = [];
  for (
    let offset = chunkDays;
    offset <= ceiling + chunkDays;
    offset += chunkDays
  ) {
    const fromMs = nowMs - offset * 86_400_000;
    const toMs = nowMs - (offset - chunkDays) * 86_400_000;
    if (sinceMs !== undefined && toMs < sinceMs) {
      break;
    }
    windows.push({ fromMs, toMs });
  }
  return windows;
}
