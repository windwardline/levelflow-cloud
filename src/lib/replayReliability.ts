import { AGRICULTURE_SYMBOLS, LIVESTOCK_SYMBOLS } from "./advisorReview";
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
  Forex: { moneyPositiveRate: 0.89, sampleSize: 123254 },
  Futures: { moneyPositiveRate: 0.83, sampleSize: 2368 },
  Indices: { moneyPositiveRate: 0.51, sampleSize: 952 },
  Metals: { moneyPositiveRate: 0.9, sampleSize: 453 },
};

// A record belongs to the population it was measured on, and to no other.
//
// The table above is keyed on the DISPLAY SecurityType, and agriculture and
// livestock both display as `Futures` — so corn, soybeans, oats and lean hogs
// were each carrying "Across 2,368 past Futures setups ... 83%", a figure
// measured on a handful of CME financials weeks before any of them existed in
// the universe. A precise, numeric, market-specific sentence is exactly what
// makes a claim credible, and exactly what makes a wrong one damaging.
//
// They resolve to their own engine class, which has no record of its own yet,
// so they render none. An absent row is honest; an inherited one is not.
function hasOwnMeasuredRecord(symbol: string): boolean {
  return !AGRICULTURE_SYMBOLS.has(symbol) && !LIVESTOCK_SYMBOLS.has(symbol);
}

export function describeReplayRecord(symbol: string, assetType: SecurityType) {
  const record = REPLAY_RECORD_BY_ASSET_TYPE[assetType];
  if (!record || !hasOwnMeasuredRecord(symbol)) {
    return null;
  }
  const rate = Math.round(record.moneyPositiveRate * 100);
  // "before costs" is the whole of the bound, and it is not decoration. The
  // replay fills an order whenever price touches the level and subtracts no
  // spread, commission or financing anywhere — grep sweep.ts and replay.ts for
  // a cost term and there is none. So this is a ceiling, not a forecast, and a
  // reader who takes it for a net figure has been misled by omission.
  return {
    detail:
      `Across ${record.sampleSize} past ${assetType} setups reserved for honest testing, ` +
      `filled setups ended money-positive ${rate}% of the time before costs.`,
    value: `${rate}% money-positive before costs`,
  };
}
