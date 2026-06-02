export type SupportedSymbol = keyof typeof UI_TO_MASSIVE_SYMBOL;

export const UI_TO_MASSIVE_SYMBOL = {
  EURUSD: "C:EURUSD",
  GBPUSD: "C:GBPUSD",
  USDJPY: "C:USDJPY",
  AUDUSD: "C:AUDUSD",
  USDCAD: "C:USDCAD",
  USDCHF: "C:USDCHF",
  NZDUSD: "C:NZDUSD",
  XAUUSD: "C:XAUUSD",
  XAGUSD: "C:XAGUSD",
  US30: "I:DJI",
  NAS100: "I:NDX",
  SPX500: "I:SPX",
} as const;

export const CORRELATION_GROUPS: Record<string, string[]> = {
  eur_beta: ["EURUSD", "GBPUSD"],
  commodity_fx: ["AUDUSD", "NZDUSD", "USDCAD"],
  metals: ["XAUUSD", "XAGUSD"],
  us_indices: ["US30", "NAS100", "SPX500"],
};

export function toMassiveTicker(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ticker = UI_TO_MASSIVE_SYMBOL[normalized as SupportedSymbol];

  if (!ticker) {
    throw new Error(`Unsupported symbol for Massive.com mapping: ${symbol}`);
  }

  return ticker;
}

export function getCorrelationGroup(symbol: string) {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return Object.entries(CORRELATION_GROUPS).find(([, symbols]) => symbols.includes(normalized))?.[0] ?? normalized;
}
