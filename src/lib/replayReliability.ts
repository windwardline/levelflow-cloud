import type { SecurityType } from "./symbolMap";

// Measured outcomes from the 2026-07-28 instrumented replay: 1,200 days
// (rolling window anchored at run time), all 58 supported symbols,
// session-aware, walk-forward test split only, accepted setups that
// filled, under the shipped configuration (chop gate, low-edge hour
// gates, measured-edge curation). "Money-positive" counts any resolution
// that ended profitable under ladder accounting (full target, banked
// TP1, profitable expiry). These are historical frequencies, not
// predictions or promises.
export type ReplayRecord = {
  moneyPositiveRate: number;
  sampleSize: number;
};

export const REPLAY_RECORD_BY_ASSET_TYPE: Record<SecurityType, ReplayRecord> = {
  Crypto: { moneyPositiveRate: 0.56, sampleSize: 2193 },
  Energies: { moneyPositiveRate: 0.58, sampleSize: 546 },
  Forex: { moneyPositiveRate: 0.57, sampleSize: 12282 },
  Futures: { moneyPositiveRate: 0.57, sampleSize: 2352 },
  Indices: { moneyPositiveRate: 0.55, sampleSize: 511 },
  Metals: { moneyPositiveRate: 0.61, sampleSize: 526 },
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
