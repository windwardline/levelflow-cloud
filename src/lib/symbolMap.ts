export type SupportedSymbol = string;

export type SecurityType = "Forex" | "Metals" | "Indices" | "Energies" | "Crypto";

export type SecurityOption = {
  assetType: SecurityType;
  description: string;
  fallbackFmpSymbol?: string;
  fmpSymbol: string;
  label: string;
  symbol: SupportedSymbol;
};

export type SecurityGroup = {
  label: SecurityType;
  options: SecurityOption[];
};

const forex = [
  ["USDJPY", "USD/JPY", "U.S. Dollar / Japanese Yen", "USDJPY"],
  ["USDCHF", "USD/CHF", "U.S. Dollar / Swiss Franc", "USDCHF"],
  ["USDCAD", "USD/CAD", "U.S. Dollar / Canadian Dollar", "USDCAD"],
  ["NZDUSD", "NZD/USD", "New Zealand Dollar / U.S. Dollar", "NZDUSD"],
  ["NZDJPY", "NZD/JPY", "New Zealand Dollar / Japanese Yen", "NZDJPY"],
  ["NZDCHF", "NZD/CHF", "New Zealand Dollar / Swiss Franc", "NZDCHF"],
  ["NZDCAD", "NZD/CAD", "New Zealand Dollar / Canadian Dollar", "NZDCAD"],
  ["GBPUSD", "GBP/USD", "British Pound / U.S. Dollar", "GBPUSD"],
  ["GBPNZD", "GBP/NZD", "British Pound / New Zealand Dollar", "GBPNZD"],
  ["GBPJPY", "GBP/JPY", "British Pound / Japanese Yen", "GBPJPY"],
  ["GBPCHF", "GBP/CHF", "British Pound / Swiss Franc", "GBPCHF"],
  ["GBPCAD", "GBP/CAD", "British Pound / Canadian Dollar", "GBPCAD"],
  ["GBPAUD", "GBP/AUD", "British Pound / Australian Dollar", "GBPAUD"],
  ["EURUSD", "EUR/USD", "Euro / U.S. Dollar", "EURUSD"],
  ["EURNZD", "EUR/NZD", "Euro / New Zealand Dollar", "EURNZD"],
  ["EURJPY", "EUR/JPY", "Euro / Japanese Yen", "EURJPY"],
  ["EURGBP", "EUR/GBP", "Euro / British Pound", "EURGBP"],
  ["EURCHF", "EUR/CHF", "Euro / Swiss Franc", "EURCHF"],
  ["EURCAD", "EUR/CAD", "Euro / Canadian Dollar", "EURCAD"],
  ["EURAUD", "EUR/AUD", "Euro / Australian Dollar", "EURAUD"],
  ["CHFJPY", "CHF/JPY", "Swiss Franc / Japanese Yen", "CHFJPY"],
  ["CADJPY", "CAD/JPY", "Canadian Dollar / Japanese Yen", "CADJPY"],
  ["CADCHF", "CAD/CHF", "Canadian Dollar / Swiss Franc", "CADCHF"],
  ["AUDUSD", "AUD/USD", "Australian Dollar / U.S. Dollar", "AUDUSD"],
  ["AUDNZD", "AUD/NZD", "Australian Dollar / New Zealand Dollar", "AUDNZD"],
  ["AUDJPY", "AUD/JPY", "Australian Dollar / Japanese Yen", "AUDJPY"],
  ["AUDCHF", "AUD/CHF", "Australian Dollar / Swiss Franc", "AUDCHF"],
  ["AUDCAD", "AUD/CAD", "Australian Dollar / Canadian Dollar", "AUDCAD"],
] satisfies Array<[string, string, string, string]>;

const crypto = [
  ["XRPUSD", "XRP/USD", "XRP / U.S. Dollar", "XRPUSD"],
  ["SOLUSD", "SOL/USD", "Solana / U.S. Dollar", "SOLUSD"],
  ["LTCUSD", "LTC/USD", "Litecoin / U.S. Dollar", "LTCUSD"],
  ["ETHUSD", "ETH/USD", "Ethereum / U.S. Dollar", "ETHUSD"],
  ["BTCUSD", "BTC/USD", "Bitcoin / U.S. Dollar", "BTCUSD"],
  ["BNBUSD", "BNB/USD", "BNB / U.S. Dollar", "BNBUSD"],
  ["BCHUSD", "BCH/USD", "Bitcoin Cash / U.S. Dollar", "BCHUSD"],
  ["ADAUSD", "ADA/USD", "Cardano / U.S. Dollar", "ADAUSD"],
] satisfies Array<[string, string, string, string]>;

export const SECURITY_GROUPS: SecurityGroup[] = [
  {
    label: "Forex",
    options: forex.map(([symbol, display, description, fmpSymbol]) => ({
      assetType: "Forex",
      description,
      fmpSymbol,
      label: `${display} - ${description}`,
      symbol,
    })),
  },
  {
    label: "Indices",
    options: [
      { assetType: "Indices", description: "S&P 500 Index", fmpSymbol: "^GSPC", label: "SP - S&P 500 Index", symbol: "SP" },
      {
        assetType: "Indices",
        description: "Nasdaq 100 Index",
        fallbackFmpSymbol: "QQQ",
        fmpSymbol: "^NDX",
        label: "NSDQ - Nasdaq 100 Index",
        symbol: "NSDQ",
      },
      { assetType: "Indices", description: "Nikkei 225 Index", fmpSymbol: "^N225", label: "NIKKEI - Nikkei 225 Index", symbol: "NIKKEI" },
      { assetType: "Indices", description: "Dow Jones Industrial Average", fmpSymbol: "^DJI", label: "DOW - Dow Jones Industrial Average", symbol: "DOW" },
      {
        assetType: "Indices",
        description: "DAX Performance Index",
        fallbackFmpSymbol: "DAX",
        fmpSymbol: "^GDAXI",
        label: "DAX - DAX Performance Index",
        symbol: "DAX",
      },
      {
        assetType: "Indices",
        description: "S&P/ASX 200 Index",
        fallbackFmpSymbol: "EWA",
        fmpSymbol: "^AXJO",
        label: "ASX - S&P/ASX 200 Index",
        symbol: "ASX",
      },
    ],
  },
  {
    label: "Metals",
    options: [
      { assetType: "Metals", description: "Gold / U.S. Dollar", fmpSymbol: "XAUUSD", label: "XAU/USD - Gold / U.S. Dollar", symbol: "XAUUSD" },
      { assetType: "Metals", description: "Silver / U.S. Dollar", fmpSymbol: "XAGUSD", label: "XAG/USD - Silver / U.S. Dollar", symbol: "XAGUSD" },
    ],
  },
  {
    label: "Energies",
    options: [
      {
        assetType: "Energies",
        description: "WTI Crude Oil",
        fallbackFmpSymbol: "USO",
        fmpSymbol: "CLUSD",
        label: "WTI - WTI Crude Oil",
        symbol: "WTI",
      },
      { assetType: "Energies", description: "Brent Crude Oil", fmpSymbol: "BZUSD", label: "BRENT - Brent Crude Oil", symbol: "BRENT" },
    ],
  },
  {
    label: "Crypto",
    options: crypto.map(([symbol, display, description, fmpSymbol]) => ({
      assetType: "Crypto",
      description,
      fmpSymbol,
      label: `${display} - ${description}`,
      symbol,
    })),
  },
];

export const SECURITY_OPTIONS = SECURITY_GROUPS.flatMap((group) => group.options);

export const CORRELATION_GROUPS: Record<string, SupportedSymbol[]> = {
  aud_crosses: ["AUDUSD", "AUDNZD", "AUDJPY", "AUDCHF", "AUDCAD", "EURAUD", "GBPAUD"],
  crypto: ["XRPUSD", "SOLUSD", "LTCUSD", "ETHUSD", "BTCUSD", "BNBUSD", "BCHUSD", "ADAUSD"],
  energies: ["WTI", "BRENT"],
  eur_crosses: ["EURUSD", "EURNZD", "EURJPY", "EURGBP", "EURCHF", "EURCAD", "EURAUD"],
  gbp_crosses: ["GBPUSD", "GBPNZD", "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "EURGBP"],
  jpy_crosses: ["USDJPY", "NZDJPY", "GBPJPY", "EURJPY", "CHFJPY", "CADJPY", "AUDJPY"],
  metals: ["XAUUSD", "XAGUSD"],
  nzd_crosses: ["NZDUSD", "NZDJPY", "NZDCHF", "NZDCAD", "AUDNZD", "EURNZD", "GBPNZD"],
  us_indices: ["SP", "NSDQ", "NIKKEI", "DOW", "DAX", "ASX"],
  usd_majors: ["USDJPY", "USDCHF", "USDCAD", "NZDUSD", "GBPUSD", "EURUSD", "AUDUSD"],
};

export function toFmpSymbol(symbol: string) {
  return getSecurityOption(symbol).fmpSymbol;
}

export function getSecurityOption(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return (
    SECURITY_OPTIONS.find((option) => option.symbol === normalized || normalizeSymbol(option.fmpSymbol) === normalized) ?? {
      assetType: "Forex",
      description: symbol,
      fmpSymbol: symbol.toUpperCase().trim(),
      label: symbol,
      symbol,
    }
  );
}

export function formatSecurityLabel(symbol: string) {
  return getSecurityOption(symbol).label;
}

export function getCorrelationGroup(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return Object.entries(CORRELATION_GROUPS).find(([, symbols]) => symbols.includes(normalized))?.[0] ?? normalized;
}

export function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
