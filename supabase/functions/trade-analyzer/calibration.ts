export type AssetType =
  | "crypto"
  | "energies"
  | "forex"
  | "futures"
  | "indices"
  | "metals";
export type RegimeName = "compression" | "range" | "trend" | "volatile_chop";

export type CategoryCalibration = {
  // Regimes in which no new setup may be initiated, regardless of score.
  // Entering elevated-volatility chop is a losing proposition across
  // classes; structure and signals both degrade.
  blockedRegimes?: RegimeName[];
  confidenceThreshold: number;
  // Score magnitude applied when CFTC speculative positioning sits at a
  // crowded extreme (contrarian). Zero until calibration validates it.
  cotScoreAdjustment?: number;
  // Per-side score adjustments. Sell setups measured better than buy setups
  // on both walk-forward splits for forex and futures over the full
  // available history, so buys carry a higher bar in those classes. This
  // tilts selection; it never blocks a side outright, because buys remained
  // profitable in the training era.
  sideScoreAdjustments?: Partial<Record<"buy" | "sell", number>>;
  // Per-regime score adjustments derived from measured follow-through
  // (positive emphasizes, negative de-emphasizes). Applied inside the
  // shared confidence score path.
  regimeScoreAdjustments?: Partial<Record<RegimeName, number>>;
  dailyTargetAtrMultiplier: number;
  dailyStopAtrMultiplier: number;
  defaultReviewHours: number;
  entryOffsetDefault: number;
  entryOffsetTrend: number;
  maxNewsPenalty: number;
  maxProviderPenalty: number;
  // Hard ceiling on stop distance in primary-ATR units. Structure may place
  // the stop nearer, never farther — risk stays on the review window's
  // timescale instead of the swing timescale.
  maxStopAtrMultiplier: number;
  minimumTargetRewardRisk: number;
  minRewardRisk: number;
  newsPenaltyPerEvent: number;
  providerWarningPenalty: number;
  // Runner ceiling as a share of the window's expected move
  // (dailyATR * sqrt(reviewHours/24)). Targets beyond what the window can
  // statistically deliver reject the setup instead of decorating it.
  runnerWindowShare: number;
  stopAtrMultiplier: number;
  timeframePenalty: number;
  tp1AtrMultiplier: number;
  // TP1 as a share of risk distance: the partial must be meaningful in R,
  // not a fixed ATR crumb against a multi-ATR stop.
  tp1RiskShare: number;
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
  energies: ["BRENT", "WTI"],
  forex: [],
  futures: [
    "BZUSD",
    "CLUSD",
    "ESUSD",
    "GCUSD",
    "HGUSD",
    "MGCUSD",
    "NGUSD",
    "NQUSD",
    "RTYUSD",
    "SIUSD",
    "YMUSD",
    "ZBUSD",
    "ZNUSD",
    // The nineteen onboarded 2026-08-05. Listing them here is not cosmetic:
    // getAssetType FALLS BACK TO "forex" for any symbol it does not find, so
    // an unlisted futures contract would be analyzed with forex's threshold,
    // window, stop cap and 0.35 bps execution profile. Corn priced like a
    // currency pair is the same silent-default failure the absolute cost floor
    // was, and it is caught here rather than discovered in a sweep result.
    //
    // Grains and livestock sit in `futures` as an explicitly TEMPORARY
    // transport for their first sweep. Their measured character — minimum
    // spreads of 2-8 bps against ES's 0.32, CME day sessions rather than
    // near-24h, and daily limit moves index futures do not have — says they
    // belong in classes of their own. Those classes get created from the
    // sweep's own numbers; seeding them by hand would be inventing parameters.
    "ZFUSD",
    "ZTUSD",
    "HOUSD",
    "RBUSD",
    "PLUSD",
    "PAUSD",
    "ZCUSX",
    "ZSUSX",
    "ZLUSX",
    "ZMUSD",
    "ZOUSX",
    "ZRUSD",
    "LEUSX",
    "GFUSX",
    "HEUSX",
    "FESX",
    "FDAX",
    "EMD",
    "NKD",
  ],
  indices: ["ASX", "DAX", "DOW", "NIKKEI", "NSDQ", "SP"],
  metals: ["XAGUSD", "XAUUSD"],
};

const CALIBRATION: Record<AssetType, CategoryCalibration> = {
  crypto: {
    blockedRegimes: ["volatile_chop"],
    // Sweep 2026-07-28: crypto OOS expectancy is positive only at high
    // selectivity (ETH +0.21R at 82); lower thresholds trade more and lose.
    confidenceThreshold: 82,
    dailyStopAtrMultiplier: 0.16,
    dailyTargetAtrMultiplier: 0.42,
    defaultReviewHours: 12,
    entryOffsetDefault: 0.78,
    entryOffsetTrend: 0.8,
    maxNewsPenalty: 4,
    maxProviderPenalty: 8,
    // r13: 2.8 -> 1.8 walked forward through three probe waves; tighter
    // passed both splits at every step (test +0.059R, 74.9% money-positive).
    maxStopAtrMultiplier: 1.8,
    minimumTargetRewardRisk: 1.7,
    minRewardRisk: 1.3,
    newsPenaltyPerEvent: 1,
    providerWarningPenalty: 3,
    runnerWindowShare: 0.8,
    stopAtrMultiplier: 1.45,
    timeframePenalty: 6,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.8,
  },
  energies: {
    blockedRegimes: ["volatile_chop"],
    confidenceThreshold: 69,
    dailyStopAtrMultiplier: 0.16,
    dailyTargetAtrMultiplier: 0.42,
    defaultReviewHours: 6,
    entryOffsetDefault: 0.6,
    entryOffsetTrend: 0.48,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    maxStopAtrMultiplier: 2.4,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.25,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    runnerWindowShare: 0.8,
    stopAtrMultiplier: 1.38,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.8,
    volatilityTargetAtrMultiplier: 3.6,
  },
  forex: {
    blockedRegimes: ["volatile_chop"],
    // r18: the score does not rank forex outcomes at any band — the old
    // gate was pure volume tax. r21 confirmed the r18-ledgered 40 on
    // fresh caches under the restored windows: quality flat on both
    // splits (train -0.0004, test +0.0001), money-positive 78.6->78.7%,
    // +35.5% accepted volume vs 55 — exactly the +35.4% r18's own curve
    // predicted for 40-vs-55.
    confidenceThreshold: 40,
    // Sweep 2026-07-29 (2010-2026, both splits): sells outperformed buys
    // (train +0.042 vs +0.023, test +0.118 vs -0.010).
    sideScoreAdjustments: { buy: -6 },
    dailyStopAtrMultiplier: 0.12,
    dailyTargetAtrMultiplier: 0.35,
    defaultReviewHours: 8,
    entryOffsetDefault: 0.55,
    entryOffsetTrend: 0.55,
    maxNewsPenalty: 8,
    maxProviderPenalty: 6,
    // r13: 2.2 -> 1.4 walked forward through three probe waves; tighter
    // passed both splits at every step (test +0.054R, 78.3% money-positive).
    maxStopAtrMultiplier: 1.4,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.2,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 2,
    runnerWindowShare: 0.6,
    stopAtrMultiplier: 1.2,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.2,
  },
  futures: {
    blockedRegimes: ["volatile_chop"],
    confidenceThreshold: 68,
    // Sweep 2026-07-29: sells outperformed buys on both splits
    // (train -0.016 vs -0.035, test +0.110 vs +0.054).
    sideScoreAdjustments: { buy: -6 },
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.38,
    defaultReviewHours: 6,
    entryOffsetDefault: 0.58,
    entryOffsetTrend: 0.75,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    // r13: 2.2 -> 1.4 walked forward through three probe waves; tighter
    // passed both splits at every step (test +0.075R, 70.6% money-positive),
    // oil included (BZ/CL 1.4 test +0.035R).
    maxStopAtrMultiplier: 1.4,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.25,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    runnerWindowShare: 0.6,
    stopAtrMultiplier: 1.3,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.4,
  },
  indices: {
    blockedRegimes: ["volatile_chop"],
    confidenceThreshold: 68,
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.36,
    defaultReviewHours: 5,
    // Deep limit offsets never filled on index cash sessions (0/15 in
    // production); entries must sit close to the market.
    entryOffsetDefault: 0.18,
    entryOffsetTrend: 0.12,
    maxNewsPenalty: 9,
    maxProviderPenalty: 7,
    maxStopAtrMultiplier: 1.8,
    minimumTargetRewardRisk: 1.5,
    minRewardRisk: 1.2,
    newsPenaltyPerEvent: 4,
    providerWarningPenalty: 3,
    runnerWindowShare: 1.1,
    stopAtrMultiplier: 1.28,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 1.2,
    volatilityTargetAtrMultiplier: 3.3,
  },
  metals: {
    blockedRegimes: ["volatile_chop"],
    // Sweep 2026-07-28: metals expectancy improves monotonically with
    // selectivity (XAU +0.18R, XAG +0.04R OOS at 82).
    // r18: metals' score genuinely ranks outcomes under the rebuilt engine
    // (0.131 -> 0.196R by band); 90 is the ceiling with viable samples
    // (95 collapses acceptance to nothing).
    confidenceThreshold: 90,
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.4,
    defaultReviewHours: 8,
    entryOffsetDefault: 0.75,
    entryOffsetTrend: 0.78,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    // r13: 2.4 -> 1.6 walked forward through three probe waves; tighter
    // passed both splits at every step (test +0.055R, 72.2% money-positive).
    maxStopAtrMultiplier: 1.6,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.25,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    runnerWindowShare: 0.8,
    stopAtrMultiplier: 1.32,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.5,
  },
};

// Per-symbol adjustments layered over the class calibration. Sparse by
// design: an entry exists only where an asset's character diverges from its
// class and the replay sweep confirms the adjustment out-of-sample.
const SYMBOL_CALIBRATION_OVERRIDES: Record<
  string,
  Partial<CategoryCalibration>
> = {
  // Natural gas runs far hotter than the energy class baseline.
  // r13: NGUSD produced zero accepted setups in the full-history replay
  // under every stop-cap variant including baseline — this override is
  // currently inert and untestable. Kept as-is pending an acceptance audit.
  NGUSD: { confidenceThreshold: 70, maxStopAtrMultiplier: 2.8 },
  // Oil trends: earlier TP1 banking fails the test split for both oil
  // futures (r10), matching cash energies' rejection of 0.6 in r8.
  BZUSD: { tp1RiskShare: 0.6, runnerWindowShare: 0.8 },
  CLUSD: { tp1RiskShare: 0.6, runnerWindowShare: 0.8 },
};

export function getAssetType(symbol: string): AssetType {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ASSET_TYPE_BY_SYMBOL.crypto.includes(normalized)) {
    return "crypto";
  }
  if (ASSET_TYPE_BY_SYMBOL.metals.includes(normalized)) {
    return "metals";
  }
  if (ASSET_TYPE_BY_SYMBOL.energies.includes(normalized)) {
    return "energies";
  }
  if (ASSET_TYPE_BY_SYMBOL.indices.includes(normalized)) {
    return "indices";
  }
  if (ASSET_TYPE_BY_SYMBOL.futures.includes(normalized)) {
    return "futures";
  }
  return "forex";
}

export function getCategoryCalibration(symbol: string): CategoryCalibration {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = CALIBRATION[getAssetType(symbol)];
  const override = SYMBOL_CALIBRATION_OVERRIDES[normalized];
  return override ? { ...base, ...override } : base;
}
