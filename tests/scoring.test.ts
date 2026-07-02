import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { scoreSetupConfidence } from "../supabase/functions/trade-analyzer/scoring.ts";

describe("setup confidence scoring", () => {
  it("combines category-specific penalties through one score path", () => {
    const calibration = getCategoryCalibration("WTI");
    const score = scoreSetupConfidence({
      availableTimeframeCount: 2,
      calibration,
      consensusScore: 84,
      executionPenalty: 4,
      providerWarningCount: 2,
      sessionPenalty: 3,
      upcomingEventCount: 2,
      weightAdjustment: 1,
    });

    assert.equal(score.newsPenalty, 6);
    assert.equal(score.timeframePenalty, calibration.timeframePenalty);
    assert.equal(score.providerPenalty, 6);
    assert.equal(score.sessionPenalty, 3);
    assert.equal(score.executionPenalty, 4);
    assert.equal(score.macroAdjustment, 0);
    assert.equal(score.weightAdjustment, 1);
    assert.equal(score.confidenceScore, 61);
  });

  it("supports weighted news risk from scheduled events and headlines", () => {
    const calibration = getCategoryCalibration("BTCUSD");
    const score = scoreSetupConfidence({
      availableTimeframeCount: 5,
      calibration,
      consensusScore: 82,
      executionPenalty: 2,
      newsPenaltyUnits: 1.75,
      providerWarningCount: 0,
      sessionPenalty: 0,
      weightAdjustment: 0,
    });

    assert.equal(score.newsPenalty, 1.75);
    assert.equal(score.confidenceScore, 78);
  });

  it("applies macro-rate context without changing the shared score path", () => {
    const score = scoreSetupConfidence({
      availableTimeframeCount: 5,
      calibration: getCategoryCalibration("XAUUSD"),
      consensusScore: 76,
      executionPenalty: 1,
      macroAdjustment: -2,
      providerWarningCount: 0,
      sessionPenalty: 0,
      upcomingEventCount: 0,
      weightAdjustment: 1,
    });

    assert.equal(score.macroAdjustment, -2);
    assert.equal(score.confidenceScore, 74);
  });

  it("keeps strong setups high when data coverage and timing are clean", () => {
    const score = scoreSetupConfidence({
      availableTimeframeCount: 5,
      calibration: getCategoryCalibration("EURUSD"),
      consensusScore: 82,
      executionPenalty: 1,
      providerWarningCount: 0,
      sessionPenalty: 0,
      upcomingEventCount: 0,
      weightAdjustment: 2,
    });

    assert.equal(score.confidenceScore, 83);
    assert.equal(score.newsPenalty, 0);
    assert.equal(score.timeframePenalty, 0);
    assert.equal(score.providerPenalty, 0);
  });
});
