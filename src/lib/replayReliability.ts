import type { SecurityType } from "./symbolMap";

// Measured outcomes from the 2026-07-30 instrumented replay: each symbol's
// full available history (discovered at run time and rolling — forex reaches
// 2010, gold 2013, CME futures 2023), all supported symbols,
// session-aware, walk-forward test split only, accepted setups that filled,
// under the shipped configuration (chop gate, low-edge hour gates,
// measured-edge curation, buy-side tilt, per-symbol threshold overrides,
// r13 tight stop caps) with the replay news-aware: scheduled high-impact
// events block reviews exactly as production does. "Money-positive" counts
// any resolution that ended profitable under ladder accounting (full target,
// banked TP1, profitable expiry). These are historical frequencies, not
// predictions or promises.
export type ReplayRecord = {
  moneyPositiveRate: number;
  sampleSize: number;
};

export const REPLAY_RECORD_BY_ASSET_TYPE: Record<SecurityType, ReplayRecord> = {
  Crypto: { moneyPositiveRate: 0.87, sampleSize: 6106 },
  Energies: { moneyPositiveRate: 0.6, sampleSize: 474 },
  Forex: { moneyPositiveRate: 0.89, sampleSize: 90907 },
  Futures: { moneyPositiveRate: 0.83, sampleSize: 2368 },
  Indices: { moneyPositiveRate: 0.51, sampleSize: 952 },
  Metals: { moneyPositiveRate: 0.9, sampleSize: 453 },
};

export function describeReplayRecord(assetType: SecurityType) {
  const record = REPLAY_RECORD_BY_ASSET_TYPE[assetType];
  if (!record) {
    return null;
  }
  const rate = Math.round(record.moneyPositiveRate * 100);
  const weakRecord = record.moneyPositiveRate < 0.55;
  const base =
    `In a full-history replay, filled ${assetType} setups ended money-positive ${rate}% of the time across ${record.sampleSize} out-of-sample setups. This measures how often, not how much — follow the ladder to manage size.`;
  return {
    detail: weakRecord
      ? `${base} This market's historical record is weak, so Levelflow's scans skip it — review it here only with care.`
      : base,
    value: `${rate}% money-positive`,
  };
}
