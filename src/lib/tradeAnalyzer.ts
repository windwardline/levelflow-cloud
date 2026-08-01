import type { SupportedSymbol } from "./symbolMap";
import { supabase } from "./supabase";

export type AnalyzerSetup = {
  breakevenTriggerPrice: number;
  confidenceScore: number;
  confluence: Record<string, unknown>;
  correlationGroup: string;
  dataProvider?: string;
  entryPrice: number;
  expiresAt?: string;
  fmpSymbol?: string;
  orderType: "limit";
  riskModel: Record<string, unknown>;
  side: "buy" | "sell";
  stopLoss: number;
  symbol: SupportedSymbol;
  takeProfit: number;
  takeProfit1?: number;
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
  correlationGroup?: string;
  entryPrice?: number;
  executionLabel?: string;
  executionScore?: number;
  marketRegime?: string;
  rationale?: string[];
  reason?: string;
  relatedSymbols?: SupportedSymbol[];
  rewardRisk?: number;
  side?: "buy" | "sell";
  setup?: AnalyzerSetup;
  stopLoss?: number;
  symbol: SupportedSymbol;
  takeProfit?: number;
  takeProfit1?: number;
};

export type MarketScanResponse = {
  advisoryOnly?: boolean;
  blocked: MarketScanCandidate[];
  // Set client-side when the scan request itself failed — a failed scan
  // must never render like a scan that genuinely found nothing.
  failed?: boolean;
  learningRefresh?: AnalyzerResponse["learningRefresh"];
  opportunities: MarketScanCandidate[];
  qualified: number;
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
  // Populated for every row going forward (migration
  // 20260730080000_setup_origin.sql backfills existing rows to 'review');
  // optional/nullable here purely defensively, since this client type
  // predates that column and nothing guarantees every future select lists
  // it. Never rendered — not as a column, not as a filter, and since spec
  // §17 not as a label either: the Insights result for an entry that never
  // filled reads "Unfilled" whatever the row's provenance. The one reader
  // left is tradeState.ts, which keeps an unfilled scan row off the Current
  // trades rail because no order was ever placed with a broker for it.
  origin?: "review" | "scan" | null;
  risk_model: Record<string, unknown> | null;
  side: "buy" | "sell";
  status: string;
  stop_loss: number | string;
  symbol: string;
  take_profit: number | string;
  take_profit_1?: number | string | null;
  trade_outcomes?: Array<{
    exit_at?: string | null;
    feedback?: Record<string, unknown> | null;
    filled_at?: string | null;
    outcome: string;
    realized_pnl: number | string | null;
    reviewed_at?: string | null;
  }>;
};

const ANALYZER_TIMEOUT_MS = 18_000;
const MARKET_SCAN_TIMEOUT_MS = 60_000;
const OUTCOME_REFRESH_TIMEOUT_MS = 15_000;
const HISTORY_TIMEOUT_MS = 12_000;

export async function generateTradeSetup(symbol: SupportedSymbol) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await withTimeout(
    supabase.functions.invoke<AnalyzerResponse>("trade-analyzer", {
      body: {
        symbol,
      },
    }),
    ANALYZER_TIMEOUT_MS,
    "Market review timed out.",
  );

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

  const { data, error } = await withTimeout(
    supabase.functions.invoke<MarketScanResponse>("trade-analyzer", {
      body: {
        action: "scan_opportunities",
        symbols,
      },
    }),
    MARKET_SCAN_TIMEOUT_MS,
    "Market scan timed out.",
  );

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

  const { data, error } = await withTimeout(
    supabase.functions.invoke<AnalyzerResponse>("trade-analyzer", {
      body: {
        action: "refresh_outcomes",
      },
    }),
    OUTCOME_REFRESH_TIMEOUT_MS,
    "Outcome refresh timed out.",
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchTradeSetups() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const query = supabase
    .from("trade_setups")
    .select(
      "id, symbol, side, limit_entry, stop_loss, take_profit, take_profit_1, breakeven_trigger_price, confidence_score, analyzer_version, confluence, risk_model, correlation_group, status, origin, created_at, trade_outcomes(outcome, realized_pnl, reviewed_at, filled_at, exit_at, feedback)",
    )
    .order("created_at", { ascending: false })
    .limit(80);

  const { data, error } = await withTimeout(query, HISTORY_TIMEOUT_MS, "History timed out.");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as TradeSetupRow[];
}

function withTimeout<T>(request: PromiseLike<T>, timeoutMs: number, message: string) {
  return Promise.race([
    request,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}
