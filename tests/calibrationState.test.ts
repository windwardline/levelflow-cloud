import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { getSessionContext } from "../supabase/functions/trade-analyzer/sessions.ts";
import { noTradeSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import { REVIEW_WINDOW_HOURS_BY_ASSET_TYPE } from "../src/lib/advisorReview.ts";
import { REPLAY_RECORD_BY_ASSET_TYPE } from "../src/lib/replayReliability.ts";
import type { SecurityType } from "../src/lib/symbolMap.ts";

// The state of record after the 23-round calibration arc (2026-07-30,
// docs/trade-model.md "Current engine state"). Every value here was
// derived at full history under the walk-forward both-splits gate and is
// FROZEN until the resumption protocol reopens the work. A failure in
// this file means someone changed a derived constant without a round —
// that is the point.
const STATE = {
  crypto: { threshold: 82, window: 12, stopCap: 1.8, tp1: 0.4, runner: 0.8, offsets: [0.78, 0.8], payoff: 1.3, newsCap: 4 },
  energies: { threshold: 69, window: 6, stopCap: 2.4, tp1: 0.8, runner: 0.8, offsets: [0.6, 0.48], payoff: 1.25, newsCap: 8 },
  forex: { threshold: 40, window: 8, stopCap: 1.4, tp1: 0.4, runner: 0.6, offsets: [0.55, 0.55], payoff: 1.2, newsCap: 8 },
  futures: { threshold: 68, window: 6, stopCap: 1.4, tp1: 0.4, runner: 0.6, offsets: [0.58, 0.75], payoff: 1.25, newsCap: 8 },
  indices: { threshold: 68, window: 5, stopCap: 1.8, tp1: 1.2, runner: 1.1, offsets: [0.18, 0.12], payoff: 1.2, newsCap: 9 },
  metals: { threshold: 90, window: 8, stopCap: 1.6, tp1: 0.4, runner: 0.8, offsets: [0.75, 0.78], payoff: 1.25, newsCap: 8 },
} as const;

const REPRESENTATIVE: Record<keyof typeof STATE, string> = {
  crypto: "BTCUSD",
  energies: "WTI",
  forex: "EURUSD",
  futures: "ESUSD",
  indices: "SP",
  metals: "XAUUSD",
};

const ASSET_TYPE_BY_CLASS: Record<keyof typeof STATE, SecurityType> = {
  crypto: "Crypto",
  energies: "Energies",
  forex: "Forex",
  futures: "Futures",
  indices: "Indices",
  metals: "Metals",
};

describe("calibration state of record (arc complete 2026-07-30)", () => {
  for (const [cls, expected] of Object.entries(STATE)) {
    it(`pins ${cls} exactly`, () => {
      const c = getCategoryCalibration(
        REPRESENTATIVE[cls as keyof typeof STATE],
      );
      assert.equal(c.confidenceThreshold, expected.threshold);
      assert.equal(c.defaultReviewHours, expected.window);
      assert.equal(c.maxStopAtrMultiplier, expected.stopCap);
      assert.equal(c.tp1RiskShare, expected.tp1);
      assert.equal(c.runnerWindowShare, expected.runner);
      assert.equal(c.entryOffsetDefault, expected.offsets[0]);
      assert.equal(c.entryOffsetTrend, expected.offsets[1]);
      assert.equal(c.minRewardRisk, expected.payoff);
      assert.equal(c.maxNewsPenalty, expected.newsCap);
      assert.deepEqual(c.blockedRegimes, ["volatile_chop"]);
    });
  }

  it("pins the r5 buy-side tilt where it was measured, nowhere else", () => {
    assert.equal(getCategoryCalibration("EURUSD").sideScoreAdjustments?.buy, -6);
    assert.equal(getCategoryCalibration("ESUSD").sideScoreAdjustments?.buy, -6);
    assert.equal(getCategoryCalibration("XAUUSD").sideScoreAdjustments?.buy ?? 0, 0);
    assert.equal(getCategoryCalibration("BTCUSD").sideScoreAdjustments?.buy ?? 0, 0);
  });

  it("pins the oil overrides and only the oil overrides on geometry", () => {
    for (const oil of ["BZUSD", "CLUSD"]) {
      const c = getCategoryCalibration(oil);
      assert.equal(c.tp1RiskShare, 0.6, `${oil} keeps late banking`);
      assert.equal(c.runnerWindowShare, 0.8, `${oil} keeps the wider runner`);
    }
  });

  it("keeps the UI review-window mirror in parity for every class", () => {
    for (const [cls, assetType] of Object.entries(ASSET_TYPE_BY_CLASS)) {
      assert.equal(
        REVIEW_WINDOW_HOURS_BY_ASSET_TYPE[assetType],
        STATE[cls as keyof typeof STATE].window,
        `${assetType} review-window mirror drifted from calibration`,
      );
    }
  });

  it("pins the measured replay record the UI shows", () => {
    // Literals on purpose — independent of the module's own constants,
    // so a transcription slip in either place fails here.
    assert.deepEqual(REPLAY_RECORD_BY_ASSET_TYPE, {
      Crypto: { moneyPositiveRate: 0.87, sampleSize: 6106 },
      Energies: { moneyPositiveRate: 0.6, sampleSize: 474 },
      Forex: { moneyPositiveRate: 0.89, sampleSize: 123254 },
      Futures: { moneyPositiveRate: 0.83, sampleSize: 2368 },
      Indices: { moneyPositiveRate: 0.51, sampleSize: 952 },
      Metals: { moneyPositiveRate: 0.9, sampleSize: 453 },
    });
  });

  it("blocks every measured energies low-edge hour", () => {
    // Blocked UTC hours {3,4,12,15,19,21} (r15). Hour 21 is checked on a
    // winter date: in summer 21:30 UTC falls inside the CME maintenance
    // closure (17:00-18:00 ET), which blocks first as a hard closure and
    // shadows the low-edge marker.
    for (const hour of [3, 4, 12, 15, 19]) {
      const when = new Date(Date.UTC(2026, 5, 15, hour, 30));
      const session = getSessionContext("WTI", when);
      assert.equal(session.block, true, `hour ${hour} should block`);
      assert.equal(session.lowEdge, true, `hour ${hour} should be lowEdge`);
    }
    const winterHour21 = getSessionContext(
      "WTI",
      new Date(Date.UTC(2026, 0, 12, 21, 30)),
    );
    assert.equal(winterHour21.block, true);
    assert.equal(winterHour21.lowEdge, true);
    // A neighboring open hour stays open.
    const open = getSessionContext("WTI", new Date(Date.UTC(2026, 5, 15, 5, 30)));
    assert.equal(open.block, false);
  });

  it("gates crypto at exactly hours 12-17 UTC and nowhere else", () => {
    // Full 24-hour probe on a Monday: crypto has no hard closures, so the
    // lowEdge window is the only blocking mechanism — its membership must
    // be exactly {12..17}.
    for (let hour = 0; hour < 24; hour++) {
      const session = getSessionContext(
        "BTCUSD",
        new Date(Date.UTC(2026, 0, 12, hour, 30)),
      );
      const expected = hour >= 12 && hour < 18;
      assert.equal(session.block, expected, `crypto hour ${hour}`);
      if (expected) assert.equal(session.lowEdge, true, `crypto hour ${hour} lowEdge`);
    }
  });

  it("pins the no-trade menu exactly", () => {
    assert.deepEqual(
      [...noTradeSymbols].sort(),
      ["BNBUSD", "DAX", "DOW", "HGUSD", "NGUSD", "NIKKEI", "NSDQ", "SP"],
    );
  });

  it("pins the cohort version string", () => {
    // Read as text — importing index.ts would boot the edge server. Any
    // behavior-changing PR must bump the version AND this pin together;
    // that is the version discipline, enforced.
    const src = readFileSync(
      new URL("../supabase/functions/trade-analyzer/index.ts", import.meta.url),
      "utf8",
    );
    assert.match(src, /ANALYZER_VERSION = "2026\.08\.01\.one-door-guarded"/);
  });
});
