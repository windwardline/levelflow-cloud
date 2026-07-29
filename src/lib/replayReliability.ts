import type { SecurityType } from "./symbolMap";

// Measured outcomes from the 2026-07-29 instrumented replay: each symbol's
// full available history (discovered at run time and rolling — forex reaches
// 2010, gold 2013, CME futures 2023), all 58 supported symbols,
// session-aware, walk-forward test split only, accepted setups that filled,
// under the shipped configuration (chop gate, low-edge hour gates,
// measured-edge curation, buy-side tilt, per-symbol threshold overrides)
// with the replay news-aware: scheduled high-impact events block reviews
// exactly as production does. "Money-positive" counts any
// resolution that ended profitable under ladder accounting (full target,
// banked TP1, profitable expiry). These are historical frequencies, not
// predictions or promises.
export type ReplayRecord = {
  moneyPositiveRate: number;
  sampleSize: number;
};

export const REPLAY_RECORD_BY_ASSET_TYPE: Record<SecurityType, ReplayRecord> = {
  Crypto: { moneyPositiveRate: 0.57, sampleSize: 1380 },
  Energies: { moneyPositiveRate: 0.65, sampleSize: 127 },
  Forex: { moneyPositiveRate: 0.6, sampleSize: 13308 },
  Futures: { moneyPositiveRate: 0.61, sampleSize: 532 },
  Indices: { moneyPositiveRate: 0.56, sampleSize: 166 },
  Metals: { moneyPositiveRate: 0.55, sampleSize: 223 },
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
