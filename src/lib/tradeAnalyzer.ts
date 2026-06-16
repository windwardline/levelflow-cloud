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
  analysisDiagnostics?: string[];
  advisoryOnly?: boolean;
  blocked?: boolean;
  deduplicated?: boolean;
  error?: string;
  message?: string;
  outcomeRefresh?: {
    ambiguous: number;
    expired: number;
    failed: number;
    pending: number;
    placed: number;
    reviewed: number;
    stopLoss: number;
    takeProfit: number;
  };
  learningRefresh?: {
    reason?: string;
    skipped: boolean;
    updated: number;
  };
  pendingOrderId?: string;
  providerWarnings?: string[];
  reason?: string;
  setup?: AnalyzerSetup;
  setupId?: string;
  updated?: boolean;
};

export type MarketScanCandidate = {
  assetType: string;
  blocked?: boolean;
  confidenceScore?: number;
  entryPrice?: number;
  reason?: string;
  rewardRisk?: number;
  side?: "buy" | "sell";
  stopLoss?: number;
  symbol: SupportedSymbol;
  takeProfit?: number;
};

export type MarketScanResponse = {
  advisoryOnly?: boolean;
  blocked: MarketScanCandidate[];
  learningRefresh?: AnalyzerResponse["learningRefresh"];
  opportunities: MarketScanCandidate[];
  scanned: number;
};

export type TradeSetupRow = {
  breakeven_trigger_price: number | string;
  confidence_score: number | string;
  analyzer_version?: string | null;
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
    exit_at?: string | null;
    feedback?: Record<string, unknown> | null;
    filled_at?: string | null;
    outcome: string;
    realized_pnl: number | string | null;
    reviewed_at?: string | null;
  }>;
};

export async function generateTradeSetup(symbol: SupportedSymbol) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke<AnalyzerResponse>("trade-analyzer", {
    body: {
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

export async function scanMarketOpportunities(symbols?: SupportedSymbol[]) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke<MarketScanResponse>("trade-analyzer", {
    body: {
      action: "scan_opportunities",
      symbols,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("No market scan response was returned.");
  }

  return data;
}

export async function refreshTradeOutcomes() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke<AnalyzerResponse>("trade-analyzer", {
    body: {
      action: "refresh_outcomes",
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchTradeSetups() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  let query = supabase
    .from("trade_setups")
    .select(
      "id, pending_order_id, symbol, side, limit_entry, stop_loss, take_profit, breakeven_trigger_price, confidence_score, analyzer_version, confluence, risk_model, correlation_group, status, created_at, trade_outcomes(outcome, realized_pnl, reviewed_at, filled_at, exit_at, feedback)",
    )
    .order("created_at", { ascending: false })
    .limit(80);

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as TradeSetupRow[];
}
