export type AssetType = "crypto" | "forex" | "futures" | "metals";
export type RegimeName = "compression" | "range" | "trend" | "volatile_chop";

export type CategoryCalibration = {
  confidenceThreshold: number;
  dailyTargetAtrMultiplier: number;
  dailyStopAtrMultiplier: number;
  defaultReviewHours: number;
  entryOffsetDefault: number;
  entryOffsetTrend: number;
  maxNewsPenalty: number;
  maxProviderPenalty: number;
  minimumTargetRewardRisk: number;
  minRewardRisk: number;
  newsPenaltyPerEvent: number;
  providerWarningPenalty: number;
  stopAtrMultiplier: number;
  timeframePenalty: number;
  volatilityTargetAtrMultiplier: number;
};

const ASSET_TYPE_BY_SYMBOL: Record<AssetType, string[]> = {
  crypto: [
    "ADAUSD",
    "BCHUSD",
    "BNBUSD",
    "BTCUSD",
    "ETHUSD",
    "LTCUSD",
    "SOLUSD",
    "XRPUSD",
  ],
  forex: [],
  futures: [
    "ASX",
    "BRENT",
    "BZUSD",
    "DAX",
    "DOW",
    "ESUSD",
    "GCUSD",
    "NIKKEI",
    "NSDQ",
    "SIUSD",
    "SP",
    "WTI",
  ],
  metals: ["XAGUSD", "XAUUSD"],
};

const CALIBRATION: Record<AssetType, CategoryCalibration> = {
  crypto: {
    confidenceThreshold: 70,
    dailyStopAtrMultiplier: 0.16,
    dailyTargetAtrMultiplier: 0.42,
    defaultReviewHours: 8,
    entryOffsetDefault: 0.62,
    entryOffsetTrend: 0.5,
    maxNewsPenalty: 4,
    maxProviderPenalty: 8,
    minimumTargetRewardRisk: 2,
    minRewardRisk: 1.55,
    newsPenaltyPerEvent: 1,
    providerWarningPenalty: 3,
    stopAtrMultiplier: 1.45,
    timeframePenalty: 6,
    volatilityTargetAtrMultiplier: 3.8,
  },
  forex: {
    confidenceThreshold: 66,
    dailyStopAtrMultiplier: 0.12,
    dailyTargetAtrMultiplier: 0.35,
    defaultReviewHours: 6,
    entryOffsetDefault: 0.55,
    entryOffsetTrend: 0.42,
    maxNewsPenalty: 8,
    maxProviderPenalty: 6,
    minimumTargetRewardRisk: 1.8,
    minRewardRisk: 1.35,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 2,
    stopAtrMultiplier: 1.2,
    timeframePenalty: 5,
    volatilityTargetAtrMultiplier: 3.2,
  },
  futures: {
    confidenceThreshold: 68,
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.38,
    defaultReviewHours: 4,
    entryOffsetDefault: 0.58,
    entryOffsetTrend: 0.46,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    minimumTargetRewardRisk: 1.9,
    minRewardRisk: 1.4,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    stopAtrMultiplier: 1.3,
    timeframePenalty: 5,
    volatilityTargetAtrMultiplier: 3.4,
  },
  metals: {
    confidenceThreshold: 68,
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.4,
    defaultReviewHours: 6,
    entryOffsetDefault: 0.6,
    entryOffsetTrend: 0.48,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    minimumTargetRewardRisk: 1.9,
    minRewardRisk: 1.45,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    stopAtrMultiplier: 1.32,
    timeframePenalty: 5,
    volatilityTargetAtrMultiplier: 3.5,
  },
};

export function getAssetType(symbol: string): AssetType {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ASSET_TYPE_BY_SYMBOL.crypto.includes(normalized)) {
    return "crypto";
  }
  if (ASSET_TYPE_BY_SYMBOL.metals.includes(normalized)) {
    return "metals";
  }
  if (ASSET_TYPE_BY_SYMBOL.futures.includes(normalized)) {
    return "futures";
  }
  return "forex";
}

export function getCategoryCalibration(symbol: string) {
  return CALIBRATION[getAssetType(symbol)];
}
