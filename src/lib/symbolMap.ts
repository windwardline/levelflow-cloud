export type SupportedSymbol = string;

export type SecurityType = "Forex" | "Metals" | "Indices" | "ETFs" | "Stocks" | "Crypto";

export type SecurityOption = {
  assetType: SecurityType;
  description: string;
  fmpSymbol: string;
  label: string;
  symbol: SupportedSymbol;
};

export type SecurityGroup = {
  label: SecurityType;
  options: SecurityOption[];
};

export const SECURITY_GROUPS: SecurityGroup[] = [
  {
    label: "Forex",
    options: [
      { assetType: "Forex", description: "Euro / U.S. Dollar", fmpSymbol: "EURUSD", label: "EURUSD - Euro / U.S. Dollar", symbol: "EURUSD" },
      { assetType: "Forex", description: "British Pound / U.S. Dollar", fmpSymbol: "GBPUSD", label: "GBPUSD - British Pound / U.S. Dollar", symbol: "GBPUSD" },
      { assetType: "Forex", description: "U.S. Dollar / Japanese Yen", fmpSymbol: "USDJPY", label: "USDJPY - U.S. Dollar / Japanese Yen", symbol: "USDJPY" },
      { assetType: "Forex", description: "Australian Dollar / U.S. Dollar", fmpSymbol: "AUDUSD", label: "AUDUSD - Australian Dollar / U.S. Dollar", symbol: "AUDUSD" },
      { assetType: "Forex", description: "U.S. Dollar / Canadian Dollar", fmpSymbol: "USDCAD", label: "USDCAD - U.S. Dollar / Canadian Dollar", symbol: "USDCAD" },
      { assetType: "Forex", description: "U.S. Dollar / Swiss Franc", fmpSymbol: "USDCHF", label: "USDCHF - U.S. Dollar / Swiss Franc", symbol: "USDCHF" },
      { assetType: "Forex", description: "New Zealand Dollar / U.S. Dollar", fmpSymbol: "NZDUSD", label: "NZDUSD - New Zealand Dollar / U.S. Dollar", symbol: "NZDUSD" },
    ],
  },
  {
    label: "Metals",
    options: [
      { assetType: "Metals", description: "Gold continuous futures proxy", fmpSymbol: "GCUSD", label: "XAUUSD - Gold", symbol: "XAUUSD" },
      { assetType: "Metals", description: "Silver continuous futures proxy", fmpSymbol: "SIUSD", label: "XAGUSD - Silver", symbol: "XAGUSD" },
    ],
  },
  {
    label: "Indices",
    options: [
      { assetType: "Indices", description: "Dow Jones Industrial Average", fmpSymbol: "^DJI", label: "US30 - Dow Jones Industrial Average", symbol: "US30" },
      { assetType: "Indices", description: "Nasdaq 100 Index", fmpSymbol: "^NDX", label: "NAS100 - Nasdaq 100 Index", symbol: "NAS100" },
      { assetType: "Indices", description: "S&P 500 Index", fmpSymbol: "^GSPC", label: "SPX500 - S&P 500 Index", symbol: "SPX500" },
      { assetType: "Indices", description: "Nasdaq Composite Index", fmpSymbol: "^IXIC", label: "NASDAQ - Nasdaq Composite", symbol: "NASDAQ" },
    ],
  },
  {
    label: "ETFs",
    options: [
      { assetType: "ETFs", description: "SPDR S&P 500 ETF Trust", fmpSymbol: "SPY", label: "SPY - SPDR S&P 500 ETF", symbol: "SPY" },
      { assetType: "ETFs", description: "Invesco QQQ Trust", fmpSymbol: "QQQ", label: "QQQ - Nasdaq 100 ETF", symbol: "QQQ" },
      { assetType: "ETFs", description: "SPDR Dow Jones Industrial Average ETF", fmpSymbol: "DIA", label: "DIA - Dow Jones ETF", symbol: "DIA" },
      { assetType: "ETFs", description: "iShares Russell 2000 ETF", fmpSymbol: "IWM", label: "IWM - Russell 2000 ETF", symbol: "IWM" },
      { assetType: "ETFs", description: "SPDR Gold Shares", fmpSymbol: "GLD", label: "GLD - Gold ETF", symbol: "GLD" },
      { assetType: "ETFs", description: "iShares Silver Trust", fmpSymbol: "SLV", label: "SLV - Silver ETF", symbol: "SLV" },
    ],
  },
];

export const SECURITY_OPTIONS = SECURITY_GROUPS.flatMap((group) => group.options);

export const CORRELATION_GROUPS: Record<string, SupportedSymbol[]> = {
  commodity_fx: ["AUDUSD", "NZDUSD", "USDCAD"],
  eur_beta: ["EURUSD", "GBPUSD"],
  metals: ["XAUUSD", "XAGUSD", "GLD", "SLV"],
  us_indices: ["US30", "NAS100", "SPX500", "NASDAQ", "SPY", "QQQ", "DIA", "IWM"],
};

export function toFmpSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const match = SECURITY_OPTIONS.find((option) => option.symbol === normalized || normalizeSymbol(option.fmpSymbol) === normalized);

  if (!match) {
    return symbol.toUpperCase().trim();
  }

  return match.fmpSymbol;
}

export function getSecurityOption(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return (
    SECURITY_OPTIONS.find((option) => option.symbol === normalized || normalizeSymbol(option.fmpSymbol) === normalized) ?? {
      assetType: "Stocks",
      description: symbol,
      fmpSymbol: symbol,
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
