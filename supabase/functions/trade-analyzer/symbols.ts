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
  ESUSD: "ESUSD",
  GCUSD: "GCUSD",
  SIUSD: "SIUSD",
  BZUSD: "BZUSD",
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

const temporarilyUnavailableSymbols = new Set([
  "SP",
  "NSDQ",
  "NIKKEI",
  "DOW",
  "DAX",
  "ASX",
  "WTI",
  "BRENT",
]);

const equityCalendarSensitiveSymbols = new Set(["ESUSD", "SP", "NSDQ", "DOW"]);

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
  ESUSD: ["USD"],
  GCUSD: ["USD"],
  SIUSD: ["USD"],
  BZUSD: ["USD"],
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

const correlationGroups: Record<string, string[]> = {
  aud_crosses: [
    "AUDUSD",
    "AUDNZD",
    "AUDJPY",
    "AUDCHF",
    "AUDCAD",
    "EURAUD",
    "GBPAUD",
  ],
  crypto: [
    "XRPUSD",
    "SOLUSD",
    "LTCUSD",
    "ETHUSD",
    "BTCUSD",
    "BNBUSD",
    "BCHUSD",
    "ADAUSD",
  ],
  energies: ["WTI", "BRENT"],
  futures: ["ESUSD", "GCUSD", "SIUSD", "BZUSD"],
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
    "EURGBP",
  ],
  jpy_crosses: [
    "USDJPY",
    "NZDJPY",
    "GBPJPY",
    "EURJPY",
    "CHFJPY",
    "CADJPY",
    "AUDJPY",
  ],
  metals: ["XAUUSD", "XAGUSD"],
  nzd_crosses: [
    "NZDUSD",
    "NZDJPY",
    "NZDCHF",
    "NZDCAD",
    "AUDNZD",
    "EURNZD",
    "GBPNZD",
  ],
  us_indices: ["SP", "NSDQ", "NIKKEI", "DOW", "DAX", "ASX"],
  usd_majors: [
    "USDJPY",
    "USDCHF",
    "USDCAD",
    "NZDUSD",
    "GBPUSD",
    "EURUSD",
    "AUDUSD",
  ],
};

export const defaultScanSymbols = Object.keys(normalizedSymbolMap).filter(
  (symbol) => !temporarilyUnavailableSymbols.has(symbol),
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
