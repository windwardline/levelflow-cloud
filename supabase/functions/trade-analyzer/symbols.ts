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
  // below, so no symbol keeps a stand-in source anymore. noTradeSymbols below
  // already refuses these three, and the rest of the measured no-trade list,
  // before any provider fetch.
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
  BRENT: "BZUSD",
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
  FESX: "^STOXX50E",
  FDAX: "^GDAXI",
  EMD: "^MID",
  NKD: "^N225",
  FDXM: "^GDAXI",
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
const temporarilyUnavailableSymbols = new Set<string>([
  "ASX",
]);

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
  BRENT: ["BNO", "BZUSD"],
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
  BRENT: ["USD"],
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
const correlationGroups: Record<string, string[]> = {
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
    "WTI",
    "BRENT",
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
  treasury_futures: ["ZBUSD", "ZNUSD"],
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
  "SP",
  "NSDQ",
  "DOW",
  "NIKKEI",
  "DAX",
  "NGUSD",
  "HGUSD",
  "BNBUSD",
  // The 44 markets onboarded 2026-08-05/06 under the owner's standing order:
  // every market E8 trades with a confirmed FMP match is represented and
  // analyzed. Withheld here for the order's own condition — visible only once
  // there is an ACCEPTABLE analyzed match — so they enter the replay universe
  // and no user surface. This set must stay in step with src/lib/symbolMap.ts's
  // NO_TRADE_SYMBOLS across the Deno boundary; tests/core.test.ts's scan-door
  // pin is what catches drift, and it caught exactly this omission.
  //
  // FDXM is deliberately ABSENT: it is a contract-size variant, excluded by
  // `contractSizeVariants` below on entirely different grounds — not withheld
  // pending evidence, but never a market of its own.
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
  "AAVEUSD",
  "ALGOUSD",
  "ARWUSD",
  "ATOMUSD",
  "AVAXUSD",
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
  "NEARUSD",
  "THETAUSD",
  "TRUMPUSD",
  "TRXUSD",
  "UNIUSD",
  "XLMUSD",
  "XMRUSD",
  "XTZUSD",
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
  "FDXM",
  "MES",
  "MNQ",
  "MYM",
  "QM",
  "QG",
  "XK",
  "XC",
]);

export const defaultScanSymbols = Object.keys(symbolMap).filter(
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

export function getCorrelationGroup(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return Object.entries(correlationGroups).find(([, symbols]) =>
    symbols.includes(normalized)
  )?.[0] ?? normalized;
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
