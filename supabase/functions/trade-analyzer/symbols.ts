import type { SupportedSymbol } from "./types.ts";

type SymbolConfig = {
  fallback?: string;
  primary: string;
};

const symbolMap: Record<string, string | SymbolConfig> = {
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
  NSDQ: { primary: "^NDX", fallback: "QQQ" },
  NIKKEI: "^N225",
  DOW: "^DJI",
  DAX: { primary: "^GDAXI", fallback: "DAX" },
  ASX: { primary: "^AXJO", fallback: "EWA" },
  WTI: { primary: "CLUSD", fallback: "USO" },
  BRENT: "BZUSD",
  XRPUSD: "XRPUSD",
  SOLUSD: "SOLUSD",
  LTCUSD: "LTCUSD",
  ETHUSD: "ETHUSD",
  BTCUSD: "BTCUSD",
  BNBUSD: "BNBUSD",
  BCHUSD: "BCHUSD",
  ADAUSD: "ADAUSD",
};

const normalizedSymbolMap: Record<string, SymbolConfig> = Object.fromEntries(
  Object.entries(symbolMap).map(([symbol, value]) => [
    symbol,
    typeof value === "string" ? { primary: value } : value,
  ]),
);

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
const scanDeprioritizedSymbols = new Set<string>([
  "USDCHF",
  "AUDCHF",
  "GBPCHF",
  "EURCHF",
  "NZDCHF",
  "CADCHF",
  // Durable negatives across independent 150-day and 1,200-day windows
  // (2026-07-28 round-4 durability table).
  "AUDCAD",
  "AUDUSD",
  "GBPAUD",
  "GBPJPY",
  "ADAUSD",
  "BCHUSD",
  "BNBUSD",
  "LTCUSD",
  "SOLUSD",
  "XRPUSD",
  "SP",
  "NSDQ",
  "DOW",
  "NIKKEI",
  "DAX",
  // r14 acceptance audit: zero accepted setups across full history under
  // every gate variant — session blocks, confidence, and payoff each starve
  // what the others let through. Scanning them spends review slots on
  // guaranteed nothing; both stay individually reviewable and in explicit
  // group scans.
  "NGUSD",
  "HGUSD",
]);

// Cash indices carry no measured edge at any tested lever (round 12:
// threshold curves diverge train-vs-test, every session bucket and regime
// negative on both splits). They stay individually reviewable so the live
// cohort can earn them back, but no scan path includes them.
export const noScanSymbols = new Set<string>([
  "SP",
  "NSDQ",
  "DOW",
  "NIKKEI",
  "DAX",
]);

export const defaultScanSymbols = Object.keys(normalizedSymbolMap).filter(
  (symbol) =>
    !temporarilyUnavailableSymbols.has(symbol) &&
    !scanDeprioritizedSymbols.has(symbol) &&
    !noScanSymbols.has(symbol),
);

export function isKnownSymbol(symbol: string) {
  return normalizeSymbol(symbol) in normalizedSymbolMap;
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
  const config = normalizedSymbolMap[normalized];
  const sanitized = sanitizeFmpSymbol(symbol);
  const symbols = config
    ? [config.primary, config.fallback].filter(Boolean)
    : [sanitized].filter(Boolean);
  return Array.from(new Set(symbols)) as string[];
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sanitizeFmpSymbol(value: string) {
  const symbol = value.toUpperCase().replace(/[^A-Z0-9.^_-]/g, "").slice(0, 32);
  return symbol || null;
}
