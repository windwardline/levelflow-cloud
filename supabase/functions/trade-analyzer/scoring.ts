import type { CategoryCalibration } from "./calibration.ts";

export type ConfidenceScoreInput = {
  availableTimeframeCount: number;
  calibration: CategoryCalibration;
  consensusScore: number;
  // Calibrated CFTC positioning adjustment (contrarian at crowded extremes).
  cotAdjustment?: number;
  executionPenalty: number;
  macroAdjustment?: number;
  newsPenaltyUnits?: number;
  providerWarningCount: number;
  // Calibrated per-regime adjustment (e.g., range emphasis); negative
  // values de-emphasize regimes with weak measured follow-through.
  regimeAdjustment?: number;
  sessionPenalty: number;
  // Calibrated per-side adjustment (buy setups carry a higher bar where
  // measured results justify it).
  sideAdjustment?: number;
  upcomingEventCount?: number;
  weightAdjustment: number;
};

export type ConfidenceScoreBreakdown = {
  confidenceScore: number;
  cotAdjustment: number;
  executionPenalty: number;
  macroAdjustment: number;
  newsPenalty: number;
  providerPenalty: number;
  regimeAdjustment: number;
  sessionPenalty: number;
  sideAdjustment: number;
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
        (input.macroAdjustment ?? 0) + (input.regimeAdjustment ?? 0) +
        (input.cotAdjustment ?? 0) + (input.sideAdjustment ?? 0) -
        newsPenalty - input.sessionPenalty -
        timeframePenalty - providerPenalty - input.executionPenalty,
    ),
    0,
    100,
  );

  return {
    confidenceScore,
    cotAdjustment: input.cotAdjustment ?? 0,
    executionPenalty: input.executionPenalty,
    macroAdjustment: input.macroAdjustment ?? 0,
    newsPenalty,
    providerPenalty,
    regimeAdjustment: input.regimeAdjustment ?? 0,
    sessionPenalty: input.sessionPenalty,
    sideAdjustment: input.sideAdjustment ?? 0,
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
