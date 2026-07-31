export type SupportedSymbol = string;

export type SecurityType =
  | "Forex"
  | "Metals"
  | "Indices"
  | "Energies"
  | "Crypto"
  | "Futures";

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

export const TEMPORARILY_HIDDEN_ASSET_TYPES = new Set<SecurityType>();
// Hidden until the chart feed is verified against the matching traded CFD.
export const TEMPORARILY_HIDDEN_ASSET_SYMBOLS = new Set<SupportedSymbol>([
  "ASX",
]);
const ASSET_CATEGORY_ORDER: SecurityType[] = [
  "Crypto",
  "Energies",
  "Forex",
  "Futures",
  "Indices",
  "Metals",
];
const KNOWN_QUOTE_CURRENCIES = [
  "USDT",
  "USD",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "EUR",
  "GBP",
  "BTC",
  "ETH",
];

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

const UNSORTED_SECURITY_GROUPS: SecurityGroup[] = [
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
      {
        assetType: "Indices",
        description: "S&P 500 Index",
        fmpSymbol: "^GSPC",
        label: "SP - S&P 500 Index",
        symbol: "SP",
      },
      {
        assetType: "Indices",
        description: "Nasdaq 100 Index",
        fallbackFmpSymbol: "QQQ",
        fmpSymbol: "^NDX",
        label: "NSDQ - Nasdaq 100 Index",
        symbol: "NSDQ",
      },
      {
        assetType: "Indices",
        description: "Nikkei 225 Index",
        fmpSymbol: "^N225",
        label: "NIKKEI - Nikkei 225 Index",
        symbol: "NIKKEI",
      },
      {
        assetType: "Indices",
        description: "Dow Jones Industrial Average",
        fmpSymbol: "^DJI",
        label: "DOW - Dow Jones Industrial Average",
        symbol: "DOW",
      },
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
      {
        assetType: "Metals",
        description: "Gold / U.S. Dollar",
        fmpSymbol: "XAUUSD",
        label: "XAU/USD - Gold / U.S. Dollar",
        symbol: "XAUUSD",
      },
      {
        assetType: "Metals",
        description: "Silver / U.S. Dollar",
        fmpSymbol: "XAGUSD",
        label: "XAG/USD - Silver / U.S. Dollar",
        symbol: "XAGUSD",
      },
    ],
  },
  {
    label: "Futures",
    options: [
      {
        assetType: "Futures",
        description: "Brent Crude Oil Futures",
        fmpSymbol: "BZUSD",
        label: "BZ - Brent Crude Oil Futures",
        symbol: "BZUSD",
      },
      {
        assetType: "Futures",
        description: "WTI Crude Oil Futures",
        fmpSymbol: "CLUSD",
        label: "CL - WTI Crude Oil Futures",
        symbol: "CLUSD",
      },
      {
        assetType: "Futures",
        description: "E-Mini S&P 500 Futures",
        fmpSymbol: "ESUSD",
        label: "ES - E-Mini S&P 500 Futures",
        symbol: "ESUSD",
      },
      {
        assetType: "Futures",
        description: "Gold Futures",
        fmpSymbol: "GCUSD",
        label: "GC - Gold Futures",
        symbol: "GCUSD",
      },
      {
        assetType: "Futures",
        description: "Copper Futures",
        fmpSymbol: "HGUSD",
        label: "HG - Copper Futures",
        symbol: "HGUSD",
      },
      {
        assetType: "Futures",
        description: "Micro Gold Futures",
        fmpSymbol: "MGCUSD",
        label: "MGC - Micro Gold Futures",
        symbol: "MGCUSD",
      },
      {
        assetType: "Futures",
        description: "Natural Gas Futures",
        fmpSymbol: "NGUSD",
        label: "NG - Natural Gas Futures",
        symbol: "NGUSD",
      },
      {
        assetType: "Futures",
        description: "E-Mini Nasdaq 100 Futures",
        fmpSymbol: "NQUSD",
        label: "NQ - E-Mini Nasdaq 100 Futures",
        symbol: "NQUSD",
      },
      {
        assetType: "Futures",
        description: "E-Mini Russell 2000 Futures",
        fmpSymbol: "RTYUSD",
        label: "RTY - E-Mini Russell 2000 Futures",
        symbol: "RTYUSD",
      },
      {
        assetType: "Futures",
        description: "Silver Futures",
        fmpSymbol: "SIUSD",
        label: "SI - Silver Futures",
        symbol: "SIUSD",
      },
      {
        assetType: "Futures",
        description: "E-Mini Dow Futures",
        fmpSymbol: "YMUSD",
        label: "YM - E-Mini Dow Futures",
        symbol: "YMUSD",
      },
      {
        assetType: "Futures",
        description: "U.S. Treasury Bond Futures",
        fmpSymbol: "ZBUSD",
        label: "ZB - U.S. Treasury Bond Futures",
        symbol: "ZBUSD",
      },
      {
        assetType: "Futures",
        description: "10-Year Treasury Note Futures",
        fmpSymbol: "ZNUSD",
        label: "ZN - 10-Year Treasury Note Futures",
        symbol: "ZNUSD",
      },
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
      {
        assetType: "Energies",
        description: "Brent Crude Oil",
        fmpSymbol: "BZUSD",
        label: "BRENT - Brent Crude Oil",
        symbol: "BRENT",
      },
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

export const SECURITY_GROUPS: SecurityGroup[] = sortSecurityGroups(
  UNSORTED_SECURITY_GROUPS,
);

export const SECURITY_OPTIONS = SECURITY_GROUPS.flatMap(
  (group) => group.options,
);

// The measured no-trade list (mirrors the server's noTradeSymbols in
// supabase/functions/trade-analyzer/symbols.ts — the server enforces it
// regardless of what any client shows). These markets' records clearly say
// no setups: cash indices (round 12) and NGUSD/HGUSD (round 14, zero
// accepted setups across full history). They keep their identities and
// chart sources, and every calibration round re-derives their record from
// accruing FMP history — the list shrinks when the evidence flips.
export const NO_TRADE_SYMBOLS = new Set([
  "SP",
  "NSDQ",
  "DOW",
  "NIKKEI",
  "DAX",
  "NGUSD",
  "HGUSD",
  "BNBUSD",
]);

export const AVAILABLE_ASSET_GROUPS = SECURITY_GROUPS
  .filter((group) => !TEMPORARILY_HIDDEN_ASSET_TYPES.has(group.label))
  .map((group) => ({
    ...group,
    options: group.options.filter(
      (option) =>
        !TEMPORARILY_HIDDEN_ASSET_SYMBOLS.has(option.symbol) &&
        !NO_TRADE_SYMBOLS.has(option.symbol),
    ),
  }))
  .filter((group) => group.options.length > 0);

// All no-trade markets are already out of AVAILABLE_ASSET_GROUPS; the scan
// list is the same set today. The alias stays so scan surfaces keep their
// own name for it.
export const SCANNABLE_ASSET_GROUPS = AVAILABLE_ASSET_GROUPS;

export const AVAILABLE_ASSET_OPTIONS = AVAILABLE_ASSET_GROUPS.flatMap(
  (group) => group.options,
);

export const AVAILABLE_ASSET_SYMBOLS = AVAILABLE_ASSET_OPTIONS.map(
  (option) => option.symbol,
);

export function isAvailableAssetSymbol(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  return AVAILABLE_ASSET_OPTIONS.some(
    (option) =>
      option.symbol === normalized ||
      normalizeSymbol(option.fmpSymbol) === normalized,
  );
}

export const CORRELATION_GROUPS: Record<string, SupportedSymbol[]> = {
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

export function getSecurityOption(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const exactMatch = SECURITY_OPTIONS.find(
    (option) => option.symbol === normalized,
  );
  if (exactMatch) {
    return exactMatch;
  }

  return (
    SECURITY_OPTIONS.find(
      (option) => normalizeSymbol(option.fmpSymbol) === normalized,
    ) ?? {
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
  return (
    Object.entries(CORRELATION_GROUPS).find(([, symbols]) =>
      symbols.includes(normalized),
    )?.[0] ?? normalized
  );
}

export function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function compareAssetCategories(
  first: SecurityType,
  second: SecurityType,
) {
  return (
    ASSET_CATEGORY_ORDER.indexOf(first) -
      ASSET_CATEGORY_ORDER.indexOf(second) || first.localeCompare(second)
  );
}

export function compareAssetSymbols(first: string, second: string) {
  const firstOption = getSecurityOption(first);
  const secondOption = getSecurityOption(second);
  return (
    compareAssetCategories(firstOption.assetType, secondOption.assetType) ||
    compareSecurityOptions(firstOption, secondOption)
  );
}

export function sortAssetSymbols(symbols: string[]) {
  return [...symbols].sort(compareAssetSymbols);
}

function sortSecurityGroups(groups: SecurityGroup[]) {
  return [...groups]
    .sort((first, second) => compareAssetCategories(first.label, second.label))
    .map((group) => ({
      ...group,
      options: [...group.options].sort(compareSecurityOptions),
    }));
}

function compareSecurityOptions(first: SecurityOption, second: SecurityOption) {
  const firstParts = getAssetSortParts(first);
  const secondParts = getAssetSortParts(second);

  return (
    firstParts.base.localeCompare(secondParts.base) ||
    firstParts.quote.localeCompare(secondParts.quote) ||
    firstParts.symbol.localeCompare(secondParts.symbol)
  );
}

function getAssetSortParts(option: SecurityOption) {
  const pair =
    splitBaseQuote(option.symbol) ?? splitBaseQuote(option.fmpSymbol);
  return {
    base: pair?.base ?? normalizeSymbol(option.symbol),
    quote: pair?.quote ?? "ZZZ",
    symbol: normalizeSymbol(option.symbol),
  };
}

function splitBaseQuote(value: string) {
  const normalized = normalizeSymbol(value);
  const quote = KNOWN_QUOTE_CURRENCIES.find(
    (candidate) =>
      normalized.endsWith(candidate) && normalized.length > candidate.length,
  );

  if (!quote) {
    return null;
  }

  return {
    base: normalized.slice(0, -quote.length),
    quote,
  };
}
