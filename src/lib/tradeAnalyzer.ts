import type { SupportedSymbol } from "./symbolMap";
import { supabase } from "./supabase";

export type AnalyzerSetup = {
  breakevenTriggerPrice: number;
  confidenceScore: number;
  confluence: Record<string, unknown>;
  correlationGroup: string;
  dataProvider?: string;
  entryPrice: number;
  fmpSymbol?: string;
  lotSize: number;
  massiveSymbol: string;
  orderType: "limit";
  riskModel: Record<string, unknown>;
  side: "buy" | "sell";
  stopLoss: number;
  symbol: SupportedSymbol;
  takeProfit: number;
};

export type AnalyzerResponse = {
  advisoryOnly?: boolean;
  blocked?: boolean;
  error?: string;
  message?: string;
  pendingOrderId?: string;
  providerWarnings?: string[];
  reason?: string;
  setup?: AnalyzerSetup;
  setupId?: string;
};

export async function generateTradeSetup(accountId: string, symbol: SupportedSymbol) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke<AnalyzerResponse>("trade-analyzer", {
    body: {
      accountId,
      symbol,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No analyzer response was returned.");
  }

  return data;
}
