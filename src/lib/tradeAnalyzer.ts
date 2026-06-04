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
  deduplicated?: boolean;
  error?: string;
  message?: string;
  pendingOrderId?: string;
  providerWarnings?: string[];
  reason?: string;
  setup?: AnalyzerSetup;
  setupId?: string;
};

export type TradeSetupRow = {
  account_id: string;
  breakeven_trigger_price: number | string;
  confidence_score: number | string;
  confluence: Record<string, unknown> | null;
  correlation_group: string | null;
  created_at: string;
  id: string;
  limit_entry: number | string;
  pending_order_id: string | null;
  risk_model: Record<string, unknown> | null;
  side: "buy" | "sell";
  status: string;
  stop_loss: number | string;
  symbol: string;
  take_profit: number | string;
  trade_outcomes?: Array<{
    outcome: string;
    realized_pnl: number | string | null;
  }>;
  user_accounts?: {
    account_name: string;
  } | null;
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

export async function fetchTradeSetups(accountId?: string) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  let query = supabase
    .from("trade_setups")
    .select(
      "id, account_id, pending_order_id, symbol, side, limit_entry, stop_loss, take_profit, breakeven_trigger_price, confidence_score, confluence, risk_model, correlation_group, status, created_at, user_accounts(account_name), trade_outcomes(outcome, realized_pnl)",
    )
    .order("created_at", { ascending: false })
    .limit(80);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as TradeSetupRow[];
}
