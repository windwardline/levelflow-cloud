import {
  chunkScanSymbols,
  mapWithConcurrency,
  mergeScanResponses,
  SCAN_REQUEST_CONCURRENCY,
} from "./scanBatching";
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
  error?: string;
  // Sent by the analyzer on its blocked/error paths; no client reader today.
  // Kept because the wire actually carries it — a type that omits a field
  // the server sends documents the protocol wrong.
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
  // The server's persistence contract for this scan (spec §17m.2,
  // supabase/functions/trade-analyzer/scanPersistence.ts):
  // persisted + skipped + failed === attempted === qualified. Nothing renders
  // it — §17f, the surface already shows what qualified — and no client
  // behavior reads it. It exists so "the scan showed setups and saved none"
  // is a legible, assertable state instead of an invisible one: the e2e
  // persistence spec reads these numbers straight off the response.
  persistence?: {
    attempted: number;
    failed: number;
    persisted: number;
    skipped: number;
  };
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
  // Historical provenance only. Rows written before §17m.1 carry 'review'
  // (migration 20260730080000_setup_origin.sql backfilled them); every row
  // since carries 'scan', because the Scan column is the only door. Optional
  // and nullable purely defensively — this client type predates the column and
  // nothing guarantees every future select lists it. Nothing reads it: not a
  // rendered column, not a filter, not a label (spec §17 — an entry that never
  // filled reads "Unfilled" whatever its provenance), and not the Current
  // trades rail either (tradeState.ts derives that from status and outcome
  // alone).
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

// One budget for the whole scan, not one per request. The fan-out below sends
// several requests where there used to be one, and the reader is still waiting
// on a single scan — so the chunks share the 60s the single request had, and a
// scan that cannot finish inside it fails inside it.
const MARKET_SCAN_TIMEOUT_MS = 60_000;
const OUTCOME_REFRESH_TIMEOUT_MS = 15_000;
const HISTORY_TIMEOUT_MS = 12_000;

/**
 * One scan, several requests. The analyzer refuses more than MAX_SCAN_SYMBOLS
 * per request (and no longer accepts the empty "all markets" list), because a
 * request big enough to scan every market is a request big enough to exceed
 * Supabase's 2s CPU budget — which is what half of 2026-08-02's open-market
 * scans did.
 *
 * All or nothing: any chunk that fails throws, and the caller renders the same
 * failure state a single failed request always rendered. A scan that returned
 * four fifths of its markets is not a smaller scan, it is a failed one, and
 * nothing here may quietly present it as the former.
 */
export async function scanMarketOpportunities(symbols: SupportedSymbol[]) {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const client = supabase;

  const chunks = chunkScanSymbols(symbols);
  if (chunks.length === 0) {
    // Defensive: both Scan controls disable at zero markets. A scan that asked
    // the server nothing must not render as a scan that found nothing.
    throw new Error("A market scan must name at least one market.");
  }

  const deadline = Date.now() + MARKET_SCAN_TIMEOUT_MS;
  const responses = await mapWithConcurrency(
    chunks,
    SCAN_REQUEST_CONCURRENCY,
    async (chunk) => {
      const { data, error } = await withTimeout(
        client.functions.invoke<MarketScanResponse>("trade-analyzer", {
          body: {
            action: "scan_opportunities",
            symbols: chunk,
          },
        }),
        deadline - Date.now(),
        "Market scan timed out.",
      );

      if (error) {
        throw new Error(error.message);
      }

      if (!data) {
        throw new Error("No market scan response was returned.");
      }

      return data;
    },
  );

  return mergeScanResponses(responses);
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
