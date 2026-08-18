import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BARS_PER_DATE,
  EMPTY_WINDOW_CLEARANCE_DAYS,
  emptyStreakLimitFor,
  INTRADAY_CHUNK_DAYS,
  intradayChunkWindows,
  MAX_DEPTH_DAYS,
} from "../scripts/intradayChunks.ts";

// R0's 1b fix, pinned by BEHAVIOUR (#358 finding 5): the chunk plan is
// what decides whether the rebuilt 5-minute series is whole, and a
// source-text regex cannot notice an off-by-one in the walk.

const DAY = 86_400_000;

// The caps as MEASURED 2026-08-18 (runbook §0): one probe each, both
// windows returned complete. Per-chunk clip detection is deliberately
// absent (three candidate detectors died in review as dead or
// false-positive — intradayChunks.ts header); the guard is these
// measured facts plus the verifier's density floor+ceiling and R1's E2.
const MEASURED_CAP_FLOOR = { "15min": 2_880, "5min": 2_304 } as const;

describe("chunk sizes are bounded against the MEASURED provider caps", () => {
  it("worst-case rows fit the measured caps, with the one 4-row ambiguity stated", () => {
    // Adjacent windows share a boundary date and `to` is measured
    // inclusive, so a window covers chunkDays + 1 calendar dates
    // (#358 finding 1).
    const worst15 = (INTRADAY_CHUNK_DAYS["15min"] + 1) *
        BARS_PER_DATE["15min"] + 4;
    const worst5 = (INTRADAY_CHUNK_DAYS["5min"] + 1) * BARS_PER_DATE["5min"] +
      12;
    // 5min: comfortably under the measured floor.
    assert.ok(worst5 < MEASURED_CAP_FLOOR["5min"]);
    // 15min: the floor was measured on a complete non-fall-back window,
    // so the cap is >= 2,880 and only a fall-back-week window (once a
    // year) exceeds it — by exactly the repeated hour's 4 bars. If the
    // cap were exactly 2,880 those 4 bars would clip; the loss is bounded
    // at 4 bars/year and sits under the density ceiling's sensitivity —
    // accepted and stated rather than detected.
    assert.equal(worst15, MEASURED_CAP_FLOOR["15min"] + 4);
  });

  it("pins the deliberate values — moving any of these is a provider-cap decision", () => {
    assert.equal(INTRADAY_CHUNK_DAYS["15min"], 29);
    assert.equal(INTRADAY_CHUNK_DAYS["5min"], 5);
    assert.equal(BARS_PER_DATE["15min"], 96);
    assert.equal(BARS_PER_DATE["5min"], 288);
    assert.equal(EMPTY_WINDOW_CLEARANCE_DAYS, 90);
    assert.equal(MAX_DEPTH_DAYS, 7_000);
  });

  it("keeps the walk-back clearance at ~90 days whatever the chunk size", () => {
    for (const timeframe of ["15min", "5min"] as const) {
      const limit = emptyStreakLimitFor(timeframe);
      const clearance = limit * INTRADAY_CHUNK_DAYS[timeframe];
      assert.ok(
        clearance >= EMPTY_WINDOW_CLEARANCE_DAYS,
        `${timeframe}: ${clearance}d clearance`,
      );
    }
  });
});

describe("intradayChunkWindows — the backward walk tiles without holes", () => {
  const nowMs = Date.UTC(2026, 7, 18, 12, 0);

  it("adjacent windows share exactly their boundary instant", () => {
    for (const timeframe of ["15min", "5min"] as const) {
      const windows = intradayChunkWindows({ days: 400, nowMs, timeframe });
      assert.ok(windows.length >= 2);
      assert.equal(windows[0].toMs, nowMs);
      for (let index = 1; index < windows.length; index += 1) {
        assert.equal(windows[index].toMs, windows[index - 1].fromMs);
      }
    }
  });

  it("covers at least the requested depth and never a window wider than chunkDays", () => {
    for (const timeframe of ["15min", "5min"] as const) {
      const days = 1_000;
      const windows = intradayChunkWindows({ days, nowMs, timeframe });
      const oldest = windows[windows.length - 1];
      assert.ok(nowMs - oldest.fromMs >= days * DAY);
      for (const window of windows) {
        assert.equal(
          window.toMs - window.fromMs,
          INTRADAY_CHUNK_DAYS[timeframe] * DAY,
        );
      }
    }
  });

  it("caps the walk at MAX_DEPTH_DAYS", () => {
    const windows = intradayChunkWindows({
      days: MAX_DEPTH_DAYS * 3,
      nowMs,
      timeframe: "15min",
    });
    const oldest = windows[windows.length - 1];
    assert.ok(nowMs - oldest.fromMs <= (MAX_DEPTH_DAYS + 2 * 29) * DAY);
  });

  it("stops the top-up walk at the first window that ends before the floor", () => {
    const sinceMs = nowMs - 40 * DAY;
    const windows = intradayChunkWindows({
      days: 5_000,
      nowMs,
      sinceMs,
      timeframe: "5min",
    });
    const oldest = windows[windows.length - 1];
    // The last kept window still reaches the floor; the next older one
    // would have ended before it.
    assert.ok(oldest.toMs >= sinceMs);
    assert.ok(oldest.toMs - INTRADAY_CHUNK_DAYS["5min"] * DAY < sinceMs);
    // And the floor's own coverage is intact: windows tile from now back
    // past sinceMs.
    assert.ok(oldest.fromMs < sinceMs);
  });
});
