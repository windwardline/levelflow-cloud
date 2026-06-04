import { SECURITY_GROUPS, type SecurityGroup, type SecurityOption } from "./symbolMap";
import { supabase } from "./supabase";

export type MarketSymbolsResponse = {
  asOf: string;
  groups: SecurityGroup[];
  provider: "FMP" | "LevelFlow";
  total: number;
};

export async function fetchMarketSymbols() {
  if (!supabase) {
    return fallbackMarketSymbols();
  }

  const { data, error } = await supabase.functions.invoke<MarketSymbolsResponse>("market-symbols", {
    body: {},
  });

  if (error || !data?.groups?.length) {
    return fallbackMarketSymbols();
  }

  return mergeCuratedFirst(data);
}

function fallbackMarketSymbols(): MarketSymbolsResponse {
  return {
    asOf: new Date().toISOString(),
    groups: SECURITY_GROUPS,
    provider: "LevelFlow",
    total: SECURITY_GROUPS.reduce((sum, group) => sum + group.options.length, 0),
  };
}

function mergeCuratedFirst(response: MarketSymbolsResponse): MarketSymbolsResponse {
  const seen = new Set<string>();
  const groups: SecurityGroup[] = [];

  for (const group of SECURITY_GROUPS) {
    const options = group.options.filter((option) => markSeen(seen, option));
    if (options.length > 0) {
      groups.push({ ...group, options });
    }
  }

  for (const group of response.groups) {
    const options = group.options.filter((option) => markSeen(seen, option));
    if (options.length > 0) {
      groups.push({ ...group, options });
    }
  }

  return {
    ...response,
    groups,
    total: groups.reduce((sum, group) => sum + group.options.length, 0),
  };
}

function markSeen(seen: Set<string>, option: SecurityOption) {
  const key = `${option.assetType}:${option.fmpSymbol}`;
  if (seen.has(key)) {
    return false;
  }

  seen.add(key);
  return true;
}
