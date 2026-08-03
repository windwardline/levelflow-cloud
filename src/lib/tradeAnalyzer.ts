import { runningBundleId } from "./deployedVersion";
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
  // Always an array by the time any reader sees it, and at most one element
  // long — normalizeEmbeddedOutcomes below is what makes that true of the wire
  // shape PostgREST actually sends.
  trade_outcomes?: TradeOutcomeRow[];
};

export type TradeOutcomeRow = {
  exit_at?: string | null;
  feedback?: Record<string, unknown> | null;
  filled_at?: string | null;
  outcome: string;
  realized_pnl: number | string | null;
  reviewed_at?: string | null;
};

/**
 * One fetched row, before its embed is normalized.
 *
 * trade_outcomes.setup_id carries `unique (setup_id)` (supabase/init.sql) — the
 * same constraint both outcome writers' `on_conflict=setup_id` upserts depend
 * on — and that is precisely what PostgREST detects as the "to-one" end of a
 * one-to-one relationship, so it returns the embed as a single OBJECT (or null),
 * never the array a to-many embed produces. The array is what every reader in
 * this app indexes into: tradeState.ts's deriveTradeState and entryHasFilled,
 * lib/outcomes.ts's normalizeSetupOutcome, historyUtils.ts's extractRealizedR.
 */
export type FetchedTradeSetupRow = Omit<TradeSetupRow, "trade_outcomes"> & {
  trade_outcomes?: TradeOutcomeRow | TradeOutcomeRow[] | null;
};

/**
 * The outcome fields the lifetime read fetches — exactly LIFETIME_SELECT's embed,
 * and exactly what the two aggregates read of it: `outcome` and `filled_at` for
 * resolution (normalizeSetupOutcome, entryHasFilled), `feedback` for realizedR.
 *
 * Narrowed rather than borrowed whole, because a row type that promises fields
 * the query never asks for is the PR #186 shape-lie one step removed: the cast at
 * the fetch seam would assert `realized_pnl` onto a row that never carries it, and
 * the next reader to reach for a P&L figure would get `Number(undefined)` with the
 * compiler agreeing. The type says what the wire says.
 */
export type LifetimeOutcomeRow = Pick<
  TradeOutcomeRow,
  "feedback" | "filled_at" | "outcome"
>;

/**
 * The minimum any reader needs to say whether a setup resolved, how, and at what
 * R — `status` plus the three outcome fields above. Both row types satisfy it
 * (TradeOutcomeRow carries strictly more than LifetimeOutcomeRow), which is what
 * lets normalizeSetupOutcome, entryHasFilled, getSetupOutcome and extractRealizedR
 * stay ONE implementation each across the ledger's read and the lifetime read
 * instead of a second copy of the taxonomy per row shape.
 */
export type OutcomeEvidenceRow = {
  status: string;
  trade_outcomes?: LifetimeOutcomeRow[];
};

/**
 * One row of the LIFETIME record — every field the two lifetime aggregates read
 * (buildRecordBand and buildAttribution), plus `id`, which the walk below uses
 * as its own dedupe key. Nothing else.
 *
 * Spec §18 (amendment 2, owner 2026-08-02: "Can we let it involve the engine?
 * If so, do it. I want accuracy."): the record band's three figures and every
 * Attribution slice are computed over the complete history, not the page the
 * ledger happens to have loaded. The ledger's own read stays what it always was
 * — LEDGER_WINDOW_ROWS of full rows, because reopening one in the Advisor
 * restores it from its stored analysis — and this narrower shape is what makes a
 * lifetime read affordable beside it: measured 2026-08-03, `confluence` and
 * `risk_model` are ~5.6KB of the ~5.9KB a full row weighs, and the aggregates
 * read neither.
 */
export type LifetimeSetupRow = Pick<
  TradeSetupRow,
  "confidence_score" | "created_at" | "id" | "side" | "status" | "symbol"
> & {
  // Always an array by the time any reader sees it, and at most one element long
  // — normalizeEmbeddedOutcome is what makes that true of the wire shape.
  trade_outcomes?: LifetimeOutcomeRow[];
};

/** One lifetime row before its embed is normalized (see FetchedTradeSetupRow). */
export type FetchedLifetimeSetupRow = Omit<LifetimeSetupRow, "trade_outcomes"> & {
  trade_outcomes?: LifetimeOutcomeRow | LifetimeOutcomeRow[] | null;
};

// One budget for the whole scan, not one per request. The fan-out below sends
// several requests where there used to be one, and the reader is still waiting
// on a single scan — so the chunks share the 60s the single request had, and a
// scan that cannot finish inside it fails inside it.
const MARKET_SCAN_TIMEOUT_MS = 60_000;
const OUTCOME_REFRESH_TIMEOUT_MS = 15_000;
const HISTORY_TIMEOUT_MS = 12_000;

/**
 * The ledger's display window (spec §18: "The ledger's 80-row read is a display
 * window; Attribution is not inside it"). Unchanged in size and now named, so
 * that nothing reads it as the account's record again.
 */
export const LEDGER_WINDOW_ROWS = 80;

/**
 * The lifetime walk's page size, and the number of pages past which it refuses
 * to keep walking.
 *
 * 500 sits well inside PostgREST's own 1,000-row response ceiling, so a page is
 * never silently clipped by the server. 40 pages is 20,000 rows: far past any
 * real account today (measured 2026-08-03: 23 rows on the largest, one full page
 * covers every account forty times over) and low enough that a runaway walk
 * fails loudly instead of paging forever. Exported so the guard reads the same
 * numbers the code does.
 */
export const LIFETIME_PAGE_ROWS = 500;
export const LIFETIME_MAX_PAGES = 40;

// Every field here has a reader: the five setup columns the aggregates slice and
// gate on, `id` for the walk's dedupe, and the three outcome fields resolution and
// realizedR need. `reviewed_at` is deliberately absent — nothing in src reads it,
// and a selected column with no reader is a payload with no purpose.
const LIFETIME_SELECT =
  "id, symbol, side, confidence_score, status, created_at, trade_outcomes(outcome, filled_at, feedback)";

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

  // The click's own name, carried by every one of its requests. Splitting the
  // scan split its record in analyzer_events into six unrelated rows; this is
  // what lets an operator put them back together. Passthrough only — the server
  // echoes it into telemetry and nothing branches on it.
  //
  // Absent rather than faked where the platform has no randomUUID (a page served
  // outside a secure context): a trace that fails a scan would be worse than no
  // trace, and the server treats it as optional for exactly this reason.
  const scanId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : undefined;
  const deadline = Date.now() + MARKET_SCAN_TIMEOUT_MS;
  const responses = await mapWithConcurrency(
    chunks.map((chunk, chunkIndex) => ({ chunk, chunkIndex })),
    SCAN_REQUEST_CONCURRENCY,
    async ({ chunk, chunkIndex }) => {
      const { data, error } = await withTimeout(
        client.functions.invoke<MarketScanResponse>("trade-analyzer", {
          body: {
            action: "scan_opportunities",
            // Which bundle is asking. On 2026-08-03 a tab running the pre-#174
            // bundle sent the retired all-markets form all morning: the server
            // refused each attempt before writing any telemetry, so the fleet's
            // own record showed nothing at all while the reader watched a scan
            // fail. The stamp puts the sender's identity on the requests that DO
            // write a record — and gives the next breaking change a way to see
            // how much of the fleet is still behind. Passthrough exactly like
            // scanId: the server validates the shape and echoes it, and nothing
            // anywhere branches on it.
            //
            // Absent rather than faked where there is no built bundle to name
            // (the dev server's entry is `/src/main.tsx`), the same choice scanId
            // makes where crypto.randomUUID is missing.
            buildStamp: runningBundleId() ?? undefined,
            chunkCount: chunks.length,
            chunkIndex,
            scanId,
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
        // The scan path's stamp, on the app's other analyzer request: a reader who
        // never scans is still a tab in the fleet, and this is the request every
        // surface show sends (spec §8).
        buildStamp: runningBundleId() ?? undefined,
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

/**
 * The one seam where the wire's embed shape becomes the app's row type.
 *
 * Every fetched row passes through here, because a row that skips it is a
 * resolved trade the whole app reads as one the engine never reviewed: with the
 * embed arriving as an object (see FetchedTradeSetupRow), `trade_outcomes[0]` is
 * undefined, so the outcome, its feedback and its fill timestamp all vanish
 * together. That is what put three stopped-out trades and one banked half on the
 * Insights ledger reading "Open" — the ledger's own honest word for a filled row
 * with no outcome row (§17b) — on 2026-08-02.
 *
 * Both shapes are read rather than the object shape assumed: PostgREST's choice
 * follows from the unique constraint, so the day that constraint changes the
 * array arrives instead, and a normalizer that only understood objects would
 * invert the same defect.
 *
 * The shape rule lives in normalizeEmbeddedOutcome, generic over the outcome, so
 * the lifetime read shares it instead of growing a second reader of the same
 * embed. Each read keeps the outcome shape its own select asked for — a single
 * concrete embed type here would hand the narrower read fields it never fetched,
 * which is the same lie in a new place.
 */
export function normalizeEmbeddedOutcomes(
  rows: FetchedTradeSetupRow[],
): TradeSetupRow[] {
  return rows.map((row) => ({
    ...row,
    trade_outcomes: normalizeEmbeddedOutcome(row.trade_outcomes),
  }));
}

/** The one embed reader: object → a one-element array, array → itself, absent → absent. */
export function normalizeEmbeddedOutcome<Outcome>(
  embedded: Outcome | Outcome[] | null | undefined,
): Outcome[] | undefined {
  if (embedded == null) {
    return undefined;
  }
  return Array.isArray(embedded) ? embedded : [embedded];
}

export async function fetchTradeSetups(): Promise<TradeSetupRow[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const query = supabase
    .from("trade_setups")
    .select(
      "id, symbol, side, limit_entry, stop_loss, take_profit, take_profit_1, breakeven_trigger_price, confidence_score, analyzer_version, confluence, risk_model, correlation_group, status, origin, created_at, trade_outcomes(outcome, realized_pnl, reviewed_at, filled_at, exit_at, feedback)",
    )
    .order("created_at", { ascending: false })
    .limit(LEDGER_WINDOW_ROWS);

  const { data, error } = await withTimeout(query, HISTORY_TIMEOUT_MS, "History timed out.");

  if (error) {
    throw new Error(error.message);
  }

  return normalizeEmbeddedOutcomes(
    (data ?? []) as unknown as FetchedTradeSetupRow[],
  );
}

/**
 * The lifetime record: every one of the caller's resolved-and-unresolved rows,
 * newest first, for the two aggregates that read the complete history (spec §18
 * and §10's record band).
 *
 * Row scoping is RLS's, exactly as the ledger's read has always relied on it —
 * `trade_setups select own` and `trade_outcomes select own` (supabase/init.sql)
 * — so there is no user filter to get wrong here.
 *
 * Nothing about resolution is asked of the server. `normalizeSetupOutcome` and
 * `classifyWinLoss` (lib/outcomes.ts) stay the only definitions of what a
 * resolved row and a money-positive one are, and §18 states plainly why: "A
 * second definition of a win is not an implementation detail — it is a second
 * product." A `where outcome in (...)` here would be exactly that second
 * definition, since resolution also depends on `status` and on whether the entry
 * ever filled. The server pages rows; the client classifies them.
 *
 * One timeout budget for the whole walk rather than one per page, the same
 * reasoning the market scan's shared deadline carries: the reader is waiting on
 * one surface, so a walk that cannot finish inside the ledger's own budget fails
 * inside it.
 */
export async function fetchLifetimeSetups(): Promise<LifetimeSetupRow[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }
  const client = supabase;
  const deadline = Date.now() + HISTORY_TIMEOUT_MS;

  return paginateLifetimeSetups(async (from, to) => {
    const { data, error } = await withTimeout(
      client
        .from("trade_setups")
        .select(LIFETIME_SELECT)
        // A total order, so an offset page continues where the previous one
        // stopped: `created_at` alone is not unique (rows written inside one
        // transaction share it to the microsecond), and equal sort keys leave
        // the boundary between two pages up to the planner.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
      deadline - Date.now(),
      "History timed out.",
    );

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as unknown as FetchedLifetimeSetupRow[];
  });
}

/**
 * The walk itself, over any page reader — which is what makes its two honest
 * defences testable: a row that shifts across a page boundary is counted once,
 * and a walk that never reaches a short page fails instead of returning a
 * fraction of a lifetime.
 *
 * Keyed by id rather than concatenated: offset pages describe a moving table, so
 * a setup inserted while the walk is in flight pushes every row down one place
 * and the last row of page k arrives again as the first row of page k+1. Counted
 * twice it would inflate every figure it touches.
 */
export async function paginateLifetimeSetups(
  readPage: (from: number, to: number) => Promise<FetchedLifetimeSetupRow[]>,
): Promise<LifetimeSetupRow[]> {
  const rowsById = new Map<string, FetchedLifetimeSetupRow>();

  for (let page = 0; page < LIFETIME_MAX_PAGES; page += 1) {
    const from = page * LIFETIME_PAGE_ROWS;
    const pageRows = await readPage(from, from + LIFETIME_PAGE_ROWS - 1);

    for (const row of pageRows) {
      rowsById.set(row.id, row);
    }

    if (pageRows.length < LIFETIME_PAGE_ROWS) {
      return Array.from(rowsById.values()).map((row) => ({
        ...row,
        trade_outcomes: normalizeEmbeddedOutcome(row.trade_outcomes),
      }));
    }
  }

  // Never a truncated set presented as a lifetime: the aggregates above this
  // read publish figures about the whole account, so a walk that cannot see the
  // whole account has to fail the way any other failed read fails (the hook's
  // loadFailed flag, the surface's existing line). The fix at that size is the
  // server-side aggregate §18 authorizes, not a bigger ceiling here.
  throw new Error("History is larger than this read can walk.");
}

function withTimeout<T>(request: PromiseLike<T>, timeoutMs: number, message: string) {
  return Promise.race([
    request,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}
