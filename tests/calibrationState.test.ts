import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { getSessionContext } from "../supabase/functions/trade-analyzer/sessions.ts";
import { noTradeSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  confidenceThresholdForAssetOrSymbol,
  reviewWindowHoursForSymbol,
} from "../src/lib/advisorReview.ts";
import { REPLAY_RECORD_BY_ASSET_TYPE } from "../src/lib/replayReliability.ts";
import type { SecurityType } from "../src/lib/symbolMap.ts";

// The state of record after the 23-round calibration arc (2026-07-30,
// docs/trade-model.md "Current engine state"). Every value here was
// derived at full history under the walk-forward both-splits gate and is
// FROZEN until the resumption protocol reopens the work. A failure in
// this file means someone changed a derived constant without a round —
// that is the point.
const STATE = {
  // Stop caps DERIVED 2026-08-06 from a 102-market grid read by TOTAL R across
  // both splits. Six classes tightened to 1.0; metals HELD at 1.6 (test R
  // improves but train degrades, the one class preferring a wider stop); indices
  // LOOSENED to 3.0, the opposite direction, exactly as the stop-provenance split
  // predicted. Total test R: forex +30457 -> +49828, crypto +3627 -> +4375,
  // futures +855 -> +1260, agriculture +161 -> +194, energies +58 -> +119,
  // livestock +1.4 -> +27.8, indices -32.4 -> -5.6 (still negative, still withheld).
  //
  // Agriculture and livestock are new classes and appear in this table for the
  // first time; both are derived, and livestock's 24h window is what made it
  // measurable at all.
  // Confidence floors ALL re-derived 2026-08-06 from the final 1,020,464-setup
  // sweep at the shipped geometry: crypto 82->25, forex 40->20, futures 68->25,
  // metals 90->30, energies 69->85, livestock 30->40. The old values predate the
  // execution-cost and stop-cap corrections, so they were gating against
  // expectancy curves the engine no longer produces. Two exceptions, both
  // deliberate: agriculture HOLDS at 30 because no floor survives its curve
  // (test expectancy dips negative above every candidate), and indices HOLDS at
  // 68 because its sample is starved — 55-70% of decisions rejected at the
  // geometry stage — and amendment 25 forbids a verdict either way on that.
  agriculture: { threshold: 30, window: 6, stopCap: 1.0, tp1: 0.4, runner: 1.4, offsets: [0.58, 0.75], payoff: 1.25, newsCap: 8 },
  livestock: { threshold: 40, window: 24, stopCap: 1.0, tp1: 0.4, runner: 0.6, offsets: [0.58, 0.75], payoff: 1.25, newsCap: 8 },
  crypto: { threshold: 25, window: 12, stopCap: 1.0, tp1: 0.4, runner: 1.0, offsets: [0.78, 0.8], payoff: 1.3, newsCap: 4 },
  energies: { threshold: 85, window: 6, stopCap: 1.0, tp1: 0.8, runner: 0.8, offsets: [0.6, 0.48], payoff: 1.25, newsCap: 8 },
  forex: { threshold: 20, window: 8, stopCap: 1.0, tp1: 0.4, runner: 1.0, offsets: [0.55, 0.55], payoff: 1.2, newsCap: 8 },
  futures: { threshold: 25, window: 6, stopCap: 1.0, tp1: 0.4, runner: 1.0, offsets: [0.58, 0.75], payoff: 1.25, newsCap: 8 },
  indices: { threshold: 68, window: 5, stopCap: 3.0, tp1: 1.2, runner: 1.0, offsets: [0.18, 0.12], payoff: 1.2, newsCap: 9 },
  metals: { threshold: 30, window: 8, stopCap: 1.6, tp1: 0.4, runner: 0.8, offsets: [0.75, 0.78], payoff: 1.25, newsCap: 8 },
} as const;

const REPRESENTATIVE: Record<keyof typeof STATE, string> = {
  agriculture: "ZCUSX",
  livestock: "LEUSX",
  crypto: "BTCUSD",
  energies: "WTI",
  forex: "EURUSD",
  futures: "ESUSD",
  indices: "SP",
  metals: "XAUUSD",
};

const ASSET_TYPE_BY_CLASS: Record<keyof typeof STATE, SecurityType> = {
  // Both new classes carry the "Futures" SecurityType: the DISPLAY taxonomy is a
  // separate axis from the engine's calibration class, and E8 offers corn and
  // cattle on its futures program. Keeping the two axes independent is what let
  // agriculture and livestock get their own geometry without inventing a new
  // display group or moving a single market between account types.
  agriculture: "Futures",
  livestock: "Futures",
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
    // Resolved by SYMBOL, not by SecurityType. On 2026-08-06 the two stopped
    // being interchangeable: agriculture and livestock are separate calibration
    // classes that both DISPLAY as Futures, with windows of 6h and 24h. Keyed by
    // SecurityType this test could not even express the requirement — and the UI
    // would have told a lean-hogs user "6h" while the engine used 24.
    for (const [cls, assetType] of Object.entries(ASSET_TYPE_BY_CLASS)) {
      const symbol = REPRESENTATIVE[cls as keyof typeof STATE];
      assert.equal(
        reviewWindowHoursForSymbol(symbol, assetType),
        STATE[cls as keyof typeof STATE].window,
        `${cls} review-window mirror drifted from calibration`,
      );
      assert.equal(
        confidenceThresholdForAssetOrSymbol(symbol, assetType),
        STATE[cls as keyof typeof STATE].threshold,
        `${cls} confidence mirror drifted from calibration`,
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
    // Eight until 2026-08-05, then 52: the nineteen E8 futures and the Crypto
    // account's other twenty-five were onboarded under the owner's standing
    // order — every market E8 trades with a confirmed FMP match is represented
    // and analyzed — and the same order withholds them until a sweep produces an
    // acceptable result. Listed literally, so promoting or demoting a market is
    // always a deliberate edit here as well as a calibration decision.
    //
    // FDXM is absent by design: it is a contract-size variant of FDAX
    // (contractVariants.ts), excluded from the scan on different grounds than
    // "withheld pending evidence" — it is never a market of its own.
    assert.deepEqual(
      [...noTradeSymbols].sort(),
      ["AAVEUSD", "ALGOUSD", "ARWUSD", "ATOMUSD", "AVAXUSD", "BNBUSD", "CAKEUSD", "DASHUSD", "DAX", "DOGEUSD", "DOTUSD", "DOW", "DYDXUSD", "EGLDUSD", "EMD", "ETCUSD", "FDAX", "FESX", "FILUSD", "GFUSX", "GRTUSD", "HBARUSD", "HEUSX", "HGUSD", "HOUSD", "IMXUSD", "LEUSX", "LINKUSD", "NEARUSD", "NGUSD", "NIKKEI", "NKD", "NSDQ", "PAUSD", "PLUSD", "RBUSD", "SP", "THETAUSD", "TRUMPUSD", "TRXUSD", "UNIUSD", "XLMUSD", "XMRUSD", "XTZUSD", "ZCUSX", "ZFUSD", "ZLUSX", "ZMUSD", "ZOUSX", "ZRUSD", "ZSUSX", "ZTUSD"],
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
    assert.match(src, /ANALYZER_VERSION = "2026\.08\.06\.geometry-derived"/);
  });
});
