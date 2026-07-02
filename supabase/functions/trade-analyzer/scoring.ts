import type { CategoryCalibration } from "./calibration.ts";

export type ConfidenceScoreInput = {
  availableTimeframeCount: number;
  calibration: CategoryCalibration;
  consensusScore: number;
  executionPenalty: number;
  macroAdjustment?: number;
  newsPenaltyUnits?: number;
  providerWarningCount: number;
  sessionPenalty: number;
  upcomingEventCount?: number;
  weightAdjustment: number;
};

export type ConfidenceScoreBreakdown = {
  confidenceScore: number;
  executionPenalty: number;
  macroAdjustment: number;
  newsPenalty: number;
  providerPenalty: number;
  sessionPenalty: number;
  timeframePenalty: number;
  weightAdjustment: number;
};

export function scoreSetupConfidence(
  input: ConfidenceScoreInput,
): ConfidenceScoreBreakdown {
  const newsPenalty = Math.min(
    input.calibration.maxNewsPenalty,
    (input.newsPenaltyUnits ?? input.upcomingEventCount ?? 0) *
      input.calibration.newsPenaltyPerEvent,
  );
  const timeframePenalty = input.availableTimeframeCount < 3
    ? input.calibration.timeframePenalty
    : 0;
  const providerPenalty = Math.min(
    input.calibration.maxProviderPenalty,
    input.providerWarningCount * input.calibration.providerWarningPenalty,
  );
  const confidenceScore = clampInteger(
    Math.round(
      input.consensusScore + input.weightAdjustment +
        (input.macroAdjustment ?? 0) - newsPenalty - input.sessionPenalty -
        timeframePenalty - providerPenalty - input.executionPenalty,
    ),
    0,
    100,
  );

  return {
    confidenceScore,
    executionPenalty: input.executionPenalty,
    macroAdjustment: input.macroAdjustment ?? 0,
    newsPenalty,
    providerPenalty,
    sessionPenalty: input.sessionPenalty,
    timeframePenalty,
    weightAdjustment: input.weightAdjustment,
  };
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}
