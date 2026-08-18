// R0's intraday chunk plan, extracted pure so the 1b fix is pinned by
// behaviour rather than by source-text regexes (fleet review #358,
// findings 1 and 5). replay-sweep.ts runs main() on import, so anything
// that must be testable cannot live there.
//
// FMP caps a single intraday response, and the cap is a per-timeframe
// FACT, not one number: 15-minute chunks of 30 days came back complete
// for every market including 24/7 crypto (proven by the corpus itself —
// crypto densities ran 98%+ with ~1-day largest gaps, 4a report), while
// 5-minute chunks were observed clipping at ~2,000 rows (remediation 1b:
// the 30-day sawtooth that left EURUSD 5-minute-dense on 1,408 of 5,247
// days and made 64.7% of confirm-fold decisions phantoms).
//
// Window arithmetic is DATE-based (the endpoint takes YYYY-MM-DD), and
// adjacent windows deliberately share their boundary date so no hole can
// open whichever way the provider treats `to` (inclusive or exclusive —
// unsettled while FMP is dark; the rebuild runbook's probe settles it).
// The chunk sizes are therefore chosen so the WORST case — chunkDays + 1
// calendar dates under an inclusive `to` — stays under the cap with
// margin:
//
//   5min:  5 days → worst 6 dates × 288 = 1,728 rows  (clip ~2,000)
//   15min: 29 days → worst 30 dates × 96 = 2,880 rows (cap ~3,000)
//
// The tripwire makes the cap assumption self-verifying instead of
// silent: a chunk whose RAW payload row count reaches it is
// indistinguishable from a clipped one and fails the run — a clipped
// chunk keeps its newest rows, so the hole lands at the old end of the
// window where nothing downstream can tell a thin market from a
// truncated fetch, and the rolling cache would never refetch it.

export type IntradayTimeframe = "15min" | "5min";

export const INTRADAY_CHUNK_DAYS: Record<IntradayTimeframe, number> = {
  "15min": 29,
  "5min": 5,
};

// Complete worst cases sit below these (15min: 2,880; 5min: 1,728) under
// either date convention; a trip means the window is oversized for the
// cap or FMP lowered it — both demand resizing, never a holed series.
export const INTRADAY_ROW_CAP_TRIPWIRE: Record<IntradayTimeframe, number> = {
  "15min": 2_950,
  "5min": 1_900,
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
// sits above every confirmed provider floor. Measured 2026-07-29 by
// walking back until history ended: forex begins 2010-01 (~6,050 days),
// XAUUSD 2013-07 (~4,760), ^GSPC 2020-02 (~2,350), ^NDX 2020-08 (~2,175),
// crypto and XAGUSD ~1,060-1,200, and CME futures 2023-09/10
// (~1,031-1,038). Depth is discovered per symbol at run time, never
// assumed.
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
