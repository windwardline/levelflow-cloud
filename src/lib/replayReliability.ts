import type { SecurityType } from "./symbolMap";

// Measured outcomes from the 2026-07-28 instrumented replay: 150 days,
// all 58 supported symbols, walk-forward test split only, accepted setups
// that filled, volatile-chop regime gated (the shipped configuration).
// "Money-positive" counts any resolution that ended profitable under
// ladder accounting (full target, banked TP1, profitable expiry).
// These are historical frequencies, not predictions or promises.
export type ReplayRecord = {
  moneyPositiveRate: number;
  sampleSize: number;
};

export const REPLAY_RECORD_BY_ASSET_TYPE: Record<SecurityType, ReplayRecord> = {
  Crypto: { moneyPositiveRate: 0.56, sampleSize: 673 },
  Energies: { moneyPositiveRate: 0.58, sampleSize: 207 },
  Forex: { moneyPositiveRate: 0.55, sampleSize: 3066 },
  Futures: { moneyPositiveRate: 0.6, sampleSize: 931 },
  Indices: { moneyPositiveRate: 0.41, sampleSize: 131 },
  Metals: { moneyPositiveRate: 0.58, sampleSize: 139 },
};

export function describeReplayRecord(assetType: SecurityType) {
  const record = REPLAY_RECORD_BY_ASSET_TYPE[assetType];
  if (!record) {
    return null;
  }
  const rate = Math.round(record.moneyPositiveRate * 100);
  return {
    detail:
      `In a 150-day historical replay, filled ${assetType} setups ended money-positive ${rate}% of the time across ${record.sampleSize} out-of-sample setups. This measures how often, not how much — follow the ladder to manage size.`,
    value: `${rate}% money-positive`,
  };
}
