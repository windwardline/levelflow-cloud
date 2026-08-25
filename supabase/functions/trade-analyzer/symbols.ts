import type { SupportedSymbol } from "./types.ts";

const symbolMap: Record<string, string> = {
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  USDJPY: "USDJPY",
  AUDUSD: "AUDUSD",
  USDCAD: "USDCAD",
  USDCHF: "USDCHF",
  NZDUSD: "NZDUSD",
  NZDJPY: "NZDJPY",
  NZDCHF: "NZDCHF",
  NZDCAD: "NZDCAD",
  GBPNZD: "GBPNZD",
  GBPJPY: "GBPJPY",
  GBPCHF: "GBPCHF",
  GBPCAD: "GBPCAD",
  GBPAUD: "GBPAUD",
  EURNZD: "EURNZD",
  EURJPY: "EURJPY",
  EURGBP: "EURGBP",
  EURCHF: "EURCHF",
  EURCAD: "EURCAD",
  EURAUD: "EURAUD",
  CHFJPY: "CHFJPY",
  CADJPY: "CADJPY",
  CADCHF: "CADCHF",
  AUDNZD: "AUDNZD",
  AUDJPY: "AUDJPY",
  AUDCHF: "AUDCHF",
  AUDCAD: "AUDCAD",
  XAUUSD: "XAUUSD",
  XAGUSD: "XAGUSD",
  BZUSD: "BZUSD",
  CLUSD: "CLUSD",
  ESUSD: "ESUSD",
  GCUSD: "GCUSD",
  HGUSD: "HGUSD",
  MGCUSD: "MGCUSD",
  NGUSD: "NGUSD",
  NQUSD: "NQUSD",
  RTYUSD: "RTYUSD",
  SIUSD: "SIUSD",
  YMUSD: "YMUSD",
  ZBUSD: "ZBUSD",
  ZNUSD: "ZNUSD",
  SP: "^GSPC",
  // Task 16c: ASX/DAX/NSDQ's ETF fallbacks measured 41x-560x off their index
  // primaries — ASX/EWA ~304x, NSDQ/QQQ ~41x, DAX/"DAX" ~560x
  // (docs/research/e8-feed-verification-2026-08-02.md, Open Item 7) — the
  // same "tracks the primary at scale" failure WTI's USO fallback failed
  // below, so no symbol keeps a stand-in source anymore. (An earlier
  // revision said noTradeSymbols refuses these three — that list has been
  // EMPTY since the 2026-08-07 owner ruling; all six cash indices scan on
  // their index primaries like every other market, and the no-stand-in
  // decision stands on its own: no bars means the no-data path, never a
  // scaled substitute. Stale-comment fix, #364 round 12.)
  NSDQ: "^NDX",
  NIKKEI: "^N225",
  DOW: "^DJI",
  DAX: "^GDAXI",
  ASX: "^AXJO",
  // Task 16b: USO measured ~53% off CLUSD's scale (F10, docs/research/
  // e8-feed-verification-2026-08-02.md) — a fund share price is not a
  // per-barrel number, so no fallback stands in here. When CLUSD has no
  // bars, the honest behavior is the existing no-data path.
  WTI: "CLUSD",
  // BRENT left 2026-08-09 (amendment 32, the owner's frame): the CFD
  // prices a month BZUSD does not serve. The masterList row carries it.
  XRPUSD: "XRPUSD",
  SOLUSD: "SOLUSD",
  LTCUSD: "LTCUSD",
  ETHUSD: "ETHUSD",
  BTCUSD: "BTCUSD",
  BNBUSD: "BNBUSD",
  BCHUSD: "BCHUSD",
  ADAUSD: "ADAUSD",
  ZFUSD: "ZFUSD",
  ZTUSD: "ZTUSD",
  HOUSD: "HOUSD",
  RBUSD: "RBUSD",
  PLUSD: "PLUSD",
  PAUSD: "PAUSD",
  ZCUSX: "ZCUSX",
  ZSUSX: "ZSUSX",
  ZLUSX: "ZLUSX",
  ZMUSD: "ZMUSD",
  ZOUSX: "ZOUSX",
  ZRUSD: "ZRUSD",
  LEUSX: "LEUSX",
  GFUSX: "GFUSX",
  HEUSX: "HEUSX",
  // Amendment 32 (2026-08-09): FESX/FDAX/EMD/NKD/FDXM left this map — each
  // was served on its underlying's CASH index series, which was never a
  // match. Their masterList rows carry the dormancy and the re-probe path.
  AAVEUSD: "AAVEUSD",
  ALGOUSD: "ALGOUSD",
  ARWUSD: "ARUSD",
  ATOMUSD: "ATOMUSD",
  AVAXUSD: "AVAXUSD",
  CAKEUSD: "CAKEUSD",
  DASHUSD: "DASHUSD",
  DOGEUSD: "DOGEUSD",
  DOTUSD: "DOTUSD",
  DYDXUSD: "DYDXUSD",
  EGLDUSD: "EGLDUSD",
  ETCUSD: "ETCUSD",
  FILUSD: "FILUSD",
  GRTUSD: "GRTUSD",
  HBARUSD: "HBARUSD",
  IMXUSD: "IMXUSD",
  LINKUSD: "LINKUSD",
  NEARUSD: "NEARUSD",
  THETAUSD: "THETAUSD",
  TRUMPUSD: "OTRUMPUSD",
  TRXUSD: "TRXUSD",
  UNIUSD: "UNIUSD",
  XLMUSD: "XLMUSD",
  XMRUSD: "XMRUSD",
  XTZUSD: "XTZUSD",
};

// Hidden until the chart feed is verified against the matching traded CFD.
//
// Empty since 2026-08-07. ASX was the last entry and its own condition is met:
// F2 measured ^AXJO against E8's AUS200 book at -5.7 (0.06%) during Sydney's
// cash session — "TRACKS (cash hours)", the same verdict NIKKEI and DAX carry.
// The hide outlived the question it was asking.
//
// Mirrors src/lib/symbolMap.ts's TEMPORARILY_HIDDEN_ASSET_SYMBOLS and
// market-data/index.ts's own copy; tests/core.test.ts's scan-door invariant is
// what caught this file lagging the other two.
const temporarilyUnavailableSymbols = new Set<string>([]);

const equityCalendarSensitiveSymbols = new Set([
  "ASX",
  "DAX",
  "DOW",
  "ESUSD",
  "NIKKEI",
  "NQUSD",
  "NSDQ",
  "RTYUSD",
  "SP",
  "YMUSD",
]);

const headlineNewsSymbols: Record<string, string[]> = {
  ASX: ["EWA", "^AXJO"],
  BZUSD: ["BNO", "BZUSD"],
  CLUSD: ["USO", "CLUSD"],
  DAX: ["EWG", "^GDAXI"],
  DOW: ["DIA", "^DJI", "YMUSD"],
  ESUSD: ["SPY", "^GSPC", "ESUSD"],
  GCUSD: ["GLD", "GCUSD", "XAUUSD"],
  HGUSD: ["CPER", "HGUSD"],
  MGCUSD: ["GLD", "MGCUSD", "XAUUSD"],
  NGUSD: ["UNG", "NGUSD"],
  NIKKEI: ["EWJ", "^N225"],
  NQUSD: ["QQQ", "^NDX", "NQUSD"],
  NSDQ: ["QQQ", "^NDX", "NQUSD"],
  RTYUSD: ["IWM", "RTYUSD"],
  SIUSD: ["SLV", "SIUSD", "XAGUSD"],
  SP: ["SPY", "^GSPC", "ESUSD"],
  WTI: ["USO", "CLUSD"],
  XAGUSD: ["SLV", "SIUSD", "XAGUSD"],
  XAUUSD: ["GLD", "GCUSD", "XAUUSD"],
  YMUSD: ["DIA", "^DJI", "YMUSD"],
  ZBUSD: ["TLT", "ZBUSD"],
  ZNUSD: ["IEF", "ZNUSD"],
};

const symbolCurrencies: Record<SupportedSymbol, string[]> = {
  EURUSD: ["EUR", "USD"],
  GBPUSD: ["GBP", "USD"],
  USDJPY: ["USD", "JPY"],
  AUDUSD: ["AUD", "USD"],
  USDCAD: ["USD", "CAD"],
  USDCHF: ["USD", "CHF"],
  NZDUSD: ["NZD", "USD"],
  NZDJPY: ["NZD", "JPY"],
  NZDCHF: ["NZD", "CHF"],
  NZDCAD: ["NZD", "CAD"],
  GBPNZD: ["GBP", "NZD"],
  GBPJPY: ["GBP", "JPY"],
  GBPCHF: ["GBP", "CHF"],
  GBPCAD: ["GBP", "CAD"],
  GBPAUD: ["GBP", "AUD"],
  EURNZD: ["EUR", "NZD"],
  EURJPY: ["EUR", "JPY"],
  EURGBP: ["EUR", "GBP"],
  EURCHF: ["EUR", "CHF"],
  EURCAD: ["EUR", "CAD"],
  EURAUD: ["EUR", "AUD"],
  CHFJPY: ["CHF", "JPY"],
  CADJPY: ["CAD", "JPY"],
  CADCHF: ["CAD", "CHF"],
  AUDNZD: ["AUD", "NZD"],
  AUDJPY: ["AUD", "JPY"],
  AUDCHF: ["AUD", "CHF"],
  AUDCAD: ["AUD", "CAD"],
  XAUUSD: ["USD"],
  XAGUSD: ["USD"],
  BZUSD: ["USD"],
  CLUSD: ["USD"],
  ESUSD: ["USD"],
  GCUSD: ["USD"],
  HGUSD: ["USD"],
  MGCUSD: ["USD"],
  NGUSD: ["USD"],
  NQUSD: ["USD"],
  RTYUSD: ["USD"],
  SIUSD: ["USD"],
  YMUSD: ["USD"],
  ZBUSD: ["USD"],
  ZNUSD: ["USD"],
  SP: ["USD"],
  NSDQ: ["USD"],
  NIKKEI: ["JPY"],
  DOW: ["USD"],
  DAX: ["EUR"],
  ASX: ["AUD"],
  WTI: ["USD"],
  XRPUSD: ["USD"],
  SOLUSD: ["USD"],
  LTCUSD: ["USD"],
  ETHUSD: ["USD"],
  BTCUSD: ["USD"],
  BNBUSD: ["USD"],
  BCHUSD: ["USD"],
  ADAUSD: ["USD"],
};

// These are intentionally not full asset categories. A group should only
// contain markets that are close substitutes or strongly linked enough that
// showing both would duplicate the same trade idea.
/**
 * Exported so tests can DERIVE a population from the families this repo
 * already asserts, instead of listing one by hand. The macro role table's
 * family-closure test reads treasury_futures and us_equity_indices from here
 * — and that closure is precisely what would have caught ZFUSD and ZTUSD
 * receiving no Treasury treatment while this very object called all four
 * tenors one curve.
 */
export const correlationGroups: Record<string, string[]> = {
  aud_crosses: [
    "AUDUSD",
    "AUDNZD",
    "AUDJPY",
    "AUDCHF",
    "AUDCAD",
  ],
  cad_crosses: ["USDCAD", "CADJPY", "CADCHF"],
  chf_crosses: ["USDCHF", "CHFJPY"],
  crypto_majors: ["BTCUSD", "ETHUSD"],
  crypto_momentum: ["ADAUSD", "BNBUSD", "SOLUSD"],
  crypto_payment: ["BCHUSD", "LTCUSD", "XRPUSD"],
  crude_oil: [
    // BRENT left the group with its dormancy (2026-08-09).
    "WTI",
    "BZUSD",
    "CLUSD",
  ],
  eur_crosses: [
    "EURUSD",
    "EURNZD",
    "EURJPY",
    "EURGBP",
    "EURCHF",
    "EURCAD",
    "EURAUD",
  ],
  gbp_crosses: [
    "GBPUSD",
    "GBPNZD",
    "GBPJPY",
    "GBPCHF",
    "GBPCAD",
    "GBPAUD",
  ],
  gold: ["XAUUSD", "GCUSD", "MGCUSD"],
  jpy_crosses: [
    "USDJPY",
    "NZDJPY",
  ],
  nzd_crosses: [
    "NZDUSD",
    "NZDCHF",
    "NZDCAD",
  ],
  silver: ["XAGUSD", "SIUSD"],
  // The whole curve (RM-5): 2s, 5s, 10s and the long bond move together
  // far more than they diverge.
  treasury_futures: ["ZBUSD", "ZNUSD", "ZFUSD", "ZTUSD"],
  grains: ["ZCUSX", "ZSUSX", "ZLUSX", "ZMUSD", "ZOUSX", "ZRUSD"],
  livestock_complex: ["LEUSX", "GFUSX", "HEUSX"],
  platinum_group: ["PLUSD", "PAUSD"],

  us_equity_indices: ["SP", "NSDQ", "DOW", "ESUSD", "NQUSD", "RTYUSD", "YMUSD"],
};

// Character groups the 2026-07-28 universe sweep measured as edge-negative
// for the current model: CHF-quote pairs (managed-franc grind), crypto
// alt-coins (noisier microstructure than BTC/ETH), and cash-index sessions
// (truncated windows; the index futures YM/NQ/ES cover that exposure with
// measured positive expectancy). The default all-market scan highlights
// markets where the model has demonstrated edge; users can still scan any
// group explicitly or review any symbol directly in the advisor.
// The measured no-trade list: assets whose evidence clearly says Levelflow
// should not produce setups. No scan includes them and setup generation is
// refused server-side — they are not an option, period (owner directive,
// r15). They remain full members of the symbol map and the replay universe:
// every calibration round re-derives their record from accruing FMP history,
// and this list shrinks the round the evidence flips (exactly how 14
// symbols left the deprioritized list in r15).
// - Cash indices (r12 dedicated round: confidence does not rank outcomes
//   out-of-sample; r15 re-check: DAX/NSDQ negative both splits, DOW/NIKKEI
//   mixed-weak, SP weak — the category verdict stands).
// - NGUSD/HGUSD (r14 audit: zero accepted setups across full history;
//   generation can only ever return "no setup").
// - BNBUSD (r16, owner standard: a mixed record — train -0.030 / test
//   +0.099, split disagreement — does not meet the provable bar; the menu
//   is binary now, measured-in or fully out).
export const noTradeSymbols = new Set<string>([
  // Empty. Owner ruling 2026-08-07: a market E8 offers on an account type, with
  // a matching FMP source, is visible and usable — nonnegotiable. The only
  // ground for withholding is no verifiable data source, and measured
  // 2026-08-07 every previously-withheld market has one.
  //
  // Expectancy is not a ground. A thin or negative market is one the ENGINE
  // declines to produce a setup for, and one per-market geometry has to earn;
  // it is not a market the product hides.
  //
  // Stays in step with src/lib/symbolMap.ts's NO_TRADE_SYMBOLS and with
  // market-data/index.ts across the Deno boundary — tests/feedSource.test.ts
  // asserts all three are equal, in both directions.
]);

// Scan-path exclusion set: everything no-trade, by definition.
export const noScanSymbols = noTradeSymbols;

/**
 * Contract-size variants — the same market at a different notional, so never a
 * scan slot of its own (owner ruling 2026-08-05).
 *
 * Deliberately NOT a second reason to withhold a market, which is why it is not
 * folded into noScanSymbols: "the scan skips it" and "the server refuses it" are
 * one condition in this file by documented design, and a variant is neither. It
 * is a market the server knows and can size, whose PRICE ACTION already belongs
 * to another row — MGC reads gold, FDXM reads FDAX's ^GDAXI. Scanning it would
 * put one opportunity on the board twice and count one outcome twice in the
 * record every calibration decision reads.
 *
 * Duplicated from src/lib/broker/contractVariants.ts rather than imported: this
 * is a Deno-global Edge Function module and cannot reach src/, the same boundary
 * that makes this file's symbolMap its own independent copy. The two are pinned
 * to each other by test rather than by import, as every other fact spanning this
 * boundary is.
 */
export const contractSizeVariants = new Set([
  "MGCUSD",
  // FDXM left with amendment 32 (2026-08-09) — its parent FDAX is dormant.
  "MES",
  "MNQ",
  "MYM",
  "QM",
  "QG",
  "XK",
  "XC",
]);

/**
 * Every symbol the analysis door admits — `isKnownSymbol` tests exactly this
 * membership.
 *
 * Distinct from `defaultScanSymbols` below, which subtracts contract-size
 * variants that the door still accepts on an explicit request. Anything
 * enumerating "the markets this engine can be asked about" wants THIS list;
 * anything enumerating "the markets a scan sweeps" wants that one. The macro
 * role table wants this one, and a table built from the scan roster would
 * silently omit MGCUSD, which is scored today.
 */
export const knownSymbols: readonly string[] = Object.keys(symbolMap);

export const defaultScanSymbols = knownSymbols.filter(
  (symbol) =>
    !temporarilyUnavailableSymbols.has(symbol) &&
    !noScanSymbols.has(symbol) &&
    !contractSizeVariants.has(symbol),
);

export function isKnownSymbol(symbol: string) {
  return normalizeSymbol(symbol) in symbolMap;
}

export function isTemporarilyUnavailableSymbol(symbol: string) {
  return temporarilyUnavailableSymbols.has(normalizeSymbol(symbol));
}

export function isEquityCalendarSensitiveSymbol(symbol: string) {
  return equityCalendarSensitiveSymbols.has(normalizeSymbol(symbol));
}

export function isCurrencyRelevantForSymbol(
  symbol: SupportedSymbol,
  currency: string,
) {
  return symbolCurrencies[symbol]?.includes(currency) ?? currency === "USD";
}

export function isHeadlineNewsRelevantForSymbol(
  symbol: SupportedSymbol,
  newsSymbol: string | null | undefined,
) {
  if (!newsSymbol) {
    return false;
  }
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedNewsSymbol = normalizeSymbol(newsSymbol);
  const directSymbols = [
    normalizedSymbol,
    normalizedSymbol.replace(/USD$/, ""),
  ].filter(Boolean);
  const proxySymbols = headlineNewsSymbols[normalizedSymbol] ?? [];

  return [...directSymbols, ...proxySymbols].some((candidate) =>
    normalizeSymbol(candidate) === normalizedNewsSymbol
  );
}

export function getHeadlineNewsSymbols(symbols: SupportedSymbol[]) {
  const candidates = new Set<string>();
  for (const symbol of symbols) {
    const normalized = normalizeSymbol(symbol);
    candidates.add(normalized);
    for (const proxy of headlineNewsSymbols[normalized] ?? []) {
      candidates.add(proxy);
    }
  }
  return Array.from(candidates);
}

// Union-only RISK groups (round-8 RM-5). These are deliberately NOT in
// correlationGroups: a symbol's primary group drives storage and the
// client's scan batching, which packs whole primary clusters into single
// requests (cap 10) and never crosses account classifications — a
// 31-member alt group or a cross-account product complex can never be a
// primary. The gate's getCorrelatedSymbols unions across BOTH structures,
// which is where these bite.
const riskUnionGroups: Record<string, string[]> = {
  // The FULL funding-currency complex: a cross belongs to BOTH of its
  // currencies' groups, and only this union makes the second membership
  // bite — the primary map is single-membership by guarded invariant
  // (batching needs unambiguous clusters), so the yen side lives here.
  jpy_complex: [
    "USDJPY",
    "AUDJPY",
    "CADJPY",
    "CHFJPY",
    "EURJPY",
    "GBPJPY",
    "NZDJPY",
  ],
  crypto_alts: [
    "AAVEUSD",
    "ADAUSD",
    "ALGOUSD",
    "ARWUSD",
    "ATOMUSD",
    "AVAXUSD",
    "BCHUSD",
    "BNBUSD",
    "CAKEUSD",
    "DASHUSD",
    "DOGEUSD",
    "DOTUSD",
    "DYDXUSD",
    "EGLDUSD",
    "ETCUSD",
    "FILUSD",
    "GRTUSD",
    "HBARUSD",
    "IMXUSD",
    "LINKUSD",
    "LTCUSD",
    "NEARUSD",
    "SOLUSD",
    "THETAUSD",
    "TRUMPUSD",
    "TRXUSD",
    "UNIUSD",
    "XLMUSD",
    "XMRUSD",
    "XRPUSD",
    "XTZUSD",
  ],
  // The crack spread is a relationship, not independence — and WTI (the
  // forex account's CFD) can never share a scan request with the futures
  // account's contracts, so this complex lives here rather than in the
  // primary map.
  oil_products: ["WTI", "BZUSD", "CLUSD", "RBUSD", "HOUSD"],
};

export function getCorrelationGroup(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return Object.entries(correlationGroups).find(([, symbols]) =>
    symbols.includes(normalized)
  )?.[0] ?? normalized;
}

/**
 * Every symbol sharing ANY group with this one (round-8 RM-5). The stored
 * correlation_group is a single primary name, so a group-equality query
 * misses the second membership every cross has — CADJPY stored under
 * cad_crosses was invisible to an AUDJPY candidate's yen exposure. The
 * gate screens against this union by SYMBOL, which needs no migration and
 * cannot miss a stored row.
 */
export function getCorrelatedSymbols(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const union = new Set<string>();
  for (
    const symbols of [
      ...Object.values(correlationGroups),
      ...Object.values(riskUnionGroups),
    ]
  ) {
    if (!symbols.includes(normalized)) {
      continue;
    }
    for (const member of symbols) {
      union.add(member);
    }
  }
  union.delete(normalized);
  return Array.from(union).filter((candidate) =>
    isKnownSymbol(candidate) && !isTemporarilyUnavailableSymbol(candidate)
  );
}

export function getRelatedSymbols(symbol: string) {
  const group = getCorrelationGroup(symbol);
  return (correlationGroups[group] ?? [])
    .filter((candidate) =>
      candidate !== symbol &&
      isKnownSymbol(candidate) &&
      !isTemporarilyUnavailableSymbol(candidate)
    )
    .slice(0, 4);
}

export function resolveProviderSymbols(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const provider = symbolMap[normalized];
  if (provider) {
    return [provider];
  }
  const sanitized = sanitizeFmpSymbol(symbol);
  return sanitized ? [sanitized] : [];
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sanitizeFmpSymbol(value: string) {
  const symbol = value.toUpperCase().replace(/[^A-Z0-9.^_-]/g, "").slice(0, 32);
  return symbol || null;
}
