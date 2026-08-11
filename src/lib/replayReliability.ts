import type { SecurityType } from "./symbolMap";

// Measured outcomes from the 2026-07-30 instrumented replay: each symbol's
// full available history (discovered at run time and rolling — forex reaches
// 2010, gold 2013, CME futures 2023), the roster as it stood at the replay
// commit, session-aware, walk-forward test split only, accepted setups that
// filled, under the configuration shipped that day (chop gate, low-edge hour
// gates, buy-side tilt, per-symbol threshold overrides, r13 tight stop caps)
// with the replay news-aware: scheduled high-impact events block reviews
// exactly as production does. "Money-positive" counts any resolution that
// ended profitable under ladder accounting (full target, banked TP1,
// profitable expiry). These are historical frequencies, not predictions or
// promises.
//
// This docblock used to list "measured-edge curation" among the run
// conditions — a mechanism nothing in the scan path implements (1h). The
// claim is deleted rather than kept for symmetry with the run notes: a
// stated rule the code does not enforce devalues every rule the app states
// about itself.
export type ReplayRecord = {
  moneyPositiveRate: number;
  sampleSize: number;
  /**
   * True where the shipped engine has moved past the configuration this row
   * was measured under. Round 28 (2026-08-06) moved indices' geometry —
   * review window 5 -> 8h, stop cap 3.0 -> 1.0 — so the 952 setups came
   * from an engine the shipped one no longer is, and the sentence says so.
   * Re-measuring is calibration item 4's first act; that re-sweep is what
   * deletes this flag, never a restatement.
   */
  superseded?: true;
};

export const REPLAY_RECORD_BY_ASSET_TYPE: Record<SecurityType, ReplayRecord> = {
  Crypto: { moneyPositiveRate: 0.87, sampleSize: 6106 },
  Energies: { moneyPositiveRate: 0.6, sampleSize: 474 },
  Forex: { moneyPositiveRate: 0.89, sampleSize: 123254 },
  Futures: { moneyPositiveRate: 0.83, sampleSize: 2368 },
  Indices: { moneyPositiveRate: 0.51, sampleSize: 952, superseded: true },
  Metals: { moneyPositiveRate: 0.9, sampleSize: 453 },
};

// A record belongs to the population it was measured on, and to no other.
//
// These are the rosters at the replay commit (d947245, 2026-07-30 21:40 EDT),
// extracted from git — `git show d947245:src/lib/symbolMap.ts` — not recalled.
// The old guard here subtracted agriculture and livestock by name and let
// every OTHER market onboarded since inherit a record that predates it:
// twelve newer Futures-displayed rows (mini corn wore the record its full-size
// parent was correctly denied), twenty-five newer cryptos, every promoted
// forex exotic. Membership is the honest line the stored aggregates can
// support; the per-market manifests of calibration item 4a supersede this
// file's whole approach when the re-sweep lands.
export const MEASURED_POPULATION_BY_ASSET_TYPE: Record<
  SecurityType,
  ReadonlySet<string>
> = {
  Crypto: new Set([
    "ADAUSD",
    "BCHUSD",
    "BNBUSD",
    "BTCUSD",
    "ETHUSD",
    "LTCUSD",
    "SOLUSD",
    "XRPUSD",
  ]),
  Energies: new Set(["BRENT", "WTI"]),
  Forex: new Set([
    "AUDCAD",
    "AUDCHF",
    "AUDJPY",
    "AUDNZD",
    "AUDUSD",
    "CADCHF",
    "CADJPY",
    "CHFJPY",
    "EURAUD",
    "EURCAD",
    "EURCHF",
    "EURGBP",
    "EURJPY",
    "EURNZD",
    "EURUSD",
    "GBPAUD",
    "GBPCAD",
    "GBPCHF",
    "GBPJPY",
    "GBPNZD",
    "GBPUSD",
    "NZDCAD",
    "NZDCHF",
    "NZDJPY",
    "NZDUSD",
    "USDCAD",
    "USDCHF",
    "USDJPY",
  ]),
  Futures: new Set([
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
  ]),
  Indices: new Set(["ASX", "DAX", "DOW", "NIKKEI", "NSDQ", "SP"]),
  Metals: new Set(["XAGUSD", "XAUUSD"]),
};

function hasOwnMeasuredRecord(
  symbol: string,
  assetType: SecurityType,
): boolean {
  return MEASURED_POPULATION_BY_ASSET_TYPE[assetType]?.has(
    symbol.toUpperCase().trim(),
  ) ?? false;
}

export function describeReplayRecord(symbol: string, assetType: SecurityType) {
  const record = REPLAY_RECORD_BY_ASSET_TYPE[assetType];
  if (!record || !hasOwnMeasuredRecord(symbol, assetType)) {
    return null;
  }
  const rate = Math.round(record.moneyPositiveRate * 100);
  // 1j: the uncertainty rides with the rate — one standard error of a
  // binomial proportion, in percentage points, derived from the row rather
  // than typed beside it. Indices' 51% on 952 is ±1.6pp, a figure
  // indistinguishable from a coin flip; forex's 89% on 123,254 is ±0.1pp.
  // Printing both in one bare grammar hid three orders of magnitude of
  // difference in precision.
  const sePoints = (
    Math.sqrt(
      record.moneyPositiveRate * (1 - record.moneyPositiveRate) /
        record.sampleSize,
    ) * 100
  ).toFixed(1);
  // "before costs" is the whole of the cost bound, and it is not decoration.
  // These stored rows were measured by the RETIRED touch-fill engine, which
  // charged no spread, commission or financing — so for THESE figures,
  // before-costs is the truth and must keep being said. The live engine
  // (2026.08.11.engine-v2) now charges the full venue round trip; when the
  // v2 corpus re-measures the record, the rows and this sentence are
  // replaced together (round-8 batch 4, with the superseded flags). Until
  // then a net-of-costs claim here would be false for the data rendered.
  const provenance = record.superseded
    ? " under a configuration the engine has since moved past"
    : "";
  return {
    detail:
      `Across ${record.sampleSize} past ${assetType} setups reserved for honest testing${provenance}, ` +
      `filled setups ended money-positive ${rate}% (±${sePoints}pp) of the time before costs.`,
  };
}
