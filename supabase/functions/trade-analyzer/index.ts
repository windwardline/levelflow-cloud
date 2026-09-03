import {
  ANALYZER_VERSION,
  engineDeclines,
  engineDeclineSentence,
  getAssetType,
  getCategoryCalibration,
} from "./calibration.ts";
import { getFuturesContractSpec, needsFuturesTickGrid } from "./futures.ts";
import { averageTrueRange } from "./indicators.ts";
import {
  classifyRegime,
  runStrategyCommittee,
  scoreConsensus,
} from "./strategies.ts";
import {
  type Bar,
  type MarketContext,
  type Regime,
  type Side,
  type StrategyVote,
  type SupportedSymbol,
} from "./types.ts";
import {
  evaluateSetupOutcome,
  fillOptionsFromRiskModel,
  getSetupExpiryTime,
  resolutionSeriesFor,
  type ResolvedOutcome,
} from "./replay.ts";
import { type ExecutionQuality } from "./executionQuality.ts";
import {
  accumulateLearningStats,
  calculateLearningWeight,
  CONFIDENCE_Z,
} from "./learning.ts";
import {
  calculateMacroRateAdjustment,
  fetchMacroRateContext,
  type MacroRateContext,
} from "./macroContext.ts";
import { scoreSetupConfidence } from "./scoring.ts";
import { getSessionContext, type SessionContext } from "./sessions.ts";
import {
  defaultScanSymbols,
  getCorrelatedSymbols,
  getCorrelationGroup,
  getRelatedSymbols,
  isKnownSymbol,
  isTemporarilyUnavailableSymbol,
  noScanSymbols,
  noTradeSymbols,
  resolveProviderSymbols,
} from "./symbols.ts";
import { buildPricePlan } from "./pricePlan.ts";
import { mapWithConcurrency } from "./concurrency.ts";
import { rankOpportunities } from "./scanRanking.ts";
import {
  groupCollapseCandidates,
  rankCollapseGroup,
} from "./scanCollapse.ts";
import {
  persistScannedOpportunities,
  type ScanWriteOutcome,
} from "./scanPersistence.ts";
import { completedDailyBars } from "./dailyCompletion.ts";
import {
  fetchFirstAvailableMarketContext,
  fetchFmpBars,
} from "./marketLoader.ts";
import { corsHeaders, getBearerToken, jsonResponse } from "../_shared/http.ts";
import {
  buildNewsContext,
  newsWindow,
} from "./newsContext.ts";
import { recordAnalyzerEvent, recordMarketDataHealth } from "./telemetry.ts";
import {
  adminFetchRows,
  adminInsertSingle,
  adminRpcRows,
  adminUpdateRows,
  adminUpsertRows,
  fetchRows,
  fetchSingle,
  fetchWithTimeout,
  getAuthenticatedUser,
  hasSupabaseAdminConfig,
  hasSupabaseRuntimeConfig,
} from "./supabaseRest.ts";

const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
// Global learning aggregates up to 2,500 outcome rows; once per warm
// instance per interval is enough — it is auxiliary to every request.
const LEARNING_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_SECONDS = 60;
// The analyzer's whole surface, and the rate-limit budget for each. §17m.1
// retired the single-market review action; `analyzer_rate_limits` still
// accepts its name (the check constraint is a superset, harmless) but nothing
// sends it any more.
const RATE_LIMITS = {
  refresh_outcomes: 12,
  // A scan is a fan-out of chunked requests since the 2026-08-02 CPU failures
  // (src/lib/scanBatching.ts): one claim per chunk, and the chunk count comes
  // from the live roster. 40 -> 60 on 2026-08-07, when the universe grew from
  // 50 markets to the full roster and the old budget would have rate-limited a
  // scan against its own second half.
  //
  // NO COUNTS HERE, deliberately. This comment used to carry the roster size,
  // the chunk count and a "markets x 7 = 735 provider calls" total. Every one
  // of those had gone stale — the roster moved, and #362 deleted the minute
  // fetch on 2026-08-18 so the per-market cost is 6, not 7 — while reading
  // like current arithmetic. Restating them with today's numbers would
  // recreate the same defect with a fresh date stamp.
  //
  // The relations, which do not rot:
  //   - a scan claims one budget unit per chunk;
  //     tests/scanBatching.test.ts asserts chunks x 5 <= this limit, reading
  //     both sides from their live sources.
  //   - a market costs 1 daily + 1 quote + one call per DECISION TIMEFRAME
  //     (marketLoader.ts), so a scan's provider cost is
  //     markets x (2 + decisionTimeframes.length) however the markets are
  //     grouped. Chunk size cannot move it; only the timeframe list can, and
  //     tests/scanBatching.test.ts fails if that list changes.
  //
  // The binding constraint is FMP's request ceiling, not this limiter, and it
  // is a small number of full scans a minute. A single operator never
  // approaches it; the e2e suite is the only caller that runs full scans back
  // to back, and spacing them is the fix on that side rather than a wider door
  // here.
  scan_opportunities: 60,
} as const;
// The hard ceiling on one request's work, and what makes a 546 impossible
// rather than unlikely: a 50-market scan measured ~1.84s of CPU against
// Supabase's 2s budget (PR #168), and roughly half of 2026-08-02's open-market
// scans exceeded it. No request may carry a fraction of the universe large
// enough to reach that. Fifteen leaves the client's 10-market chunks room
// without ever admitting a request that could. Requests above it are refused,
// not truncated — a scan that silently dropped five of the markets it named
// would report a count the caller never asked for.
const MAX_SCAN_SYMBOLS = 15;
type AnalyzerAction = keyof typeof RATE_LIMITS;
type AnalyzeRequest = {
  action?: AnalyzerAction;
  // Which bundle the caller is running (its entry filename). A tab left open
  // across a deploy keeps sending the old bundle's requests — on 2026-08-03 one
  // sent the retired all-markets form all morning — and the fleet had no way to
  // see it: the refusals never reached analyzer_events at all. Echoed into
  // telemetry and nothing else, exactly like the trace below.
  buildStamp?: string;
  // The caller's own name for one scan, and this request's place in it. A scan
  // is several requests now, and without these its record in analyzer_events is
  // several unrelated rows — this is what lets an operator put one click back
  // together. Echoed into telemetry and nothing else: no code path reads them.
  chunkCount?: number;
  chunkIndex?: number;
  scanId?: string;
  symbols?: string[];
};

/**
 * The scan trace, read the way any caller-supplied value has to be read.
 *
 * These land in `analyzer_events.metadata`, so they are validated rather than
 * copied: a UUID-shaped string and two small integers, or nothing. Unvalidated
 * passthrough would let a caller write arbitrary payloads into the telemetry
 * table through the one field that accepts free JSON.
 */
function readScanTrace(body: AnalyzeRequest) {
  const isChunkNumber = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0 &&
    value <= 99;
  return {
    chunkCount: isChunkNumber(body.chunkCount) ? body.chunkCount : undefined,
    chunkIndex: isChunkNumber(body.chunkIndex) ? body.chunkIndex : undefined,
    scanId: typeof body.scanId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          .test(body.scanId)
      ? body.scanId
      : undefined,
  };
}

/**
 * The caller's build stamp, read the way readScanTrace reads the trace.
 *
 * Same column, same rule: `analyzer_events.metadata` is the one field that takes
 * free JSON, so a caller-supplied label is shape-checked before it lands there —
 * a bounded string over a closed set, or nothing. Sixty-four characters is four
 * times what Vite's `index-<hash>.js` needs, and the set admits no path
 * separator, no whitespace and no quote.
 *
 * A malformed stamp is dropped, never refused: the label on a request says nothing
 * about the work it asks for, and a 4xx over it would cost the reader a scan for a
 * field no code path reads.
 */
function readBuildStamp(body: AnalyzeRequest) {
  return typeof body.buildStamp === "string" &&
      /^[A-Za-z0-9._-]{1,64}$/.test(body.buildStamp)
    ? body.buildStamp
    : undefined;
}
type ScanTrace = ReturnType<typeof readScanTrace>;

type NewsEvent = {
  currency?: string;
  event_type?: "scheduled" | "earnings" | "headline";
  event_name?: string;
  impact?: string;
  provider?: string;
  scheduled_at?: string;
  symbol?: string | null;
  url?: string | null;
};

type NewsContext = {
  active: NewsEvent[];
  blocking: NewsEvent[];
  /**
   * Where the calendar reading came from, and why it might be absent.
   *
   * Both are read at the diagnostics sites and neither was declared. They
   * belong to the calendar-provenance work that made "an empty calendar" and
   * "no calendar" separable (#456) — the distinction is the whole point, and
   * it was carried on an undeclared property.
   */
  calendarSource?: string | null;
  headlineCount: number;
  penaltyUnits: number;
  unavailableReason?: string | null;
  upcoming: NewsEvent[];
};

type ExistingSetupRow = {
  analyzer_version?: string | null;
  breakeven_trigger_price: number | string;
  confidence_score: number | string;
  confluence: Record<string, unknown> | null;
  created_at: string;
  id: string;
  limit_entry: number | string;
  provider_symbol: string;
  side: Side;
  stop_loss: number | string;
  status: string;
  symbol: string;
  take_profit: number | string;
  take_profit_1?: number | string | null;
};

type SetupForOutcome = ExistingSetupRow & {
  risk_model: Record<string, unknown> | null;
};

type OutcomeRefreshSummary = {
  ambiguous: number;
  expired: number;
  expiredAtLoss: number;
  expiredInProfit: number;
  failed: number;
  pending: number;
  placed: number;
  reviewed: number;
  stopLoss: number;
  takeProfit: number;
  tp1Partial: number;
};

type UpsertedSetupResult = {
  deduplicated: boolean;
  // Which of the three things this call actually did (scanPersistence.ts):
  // wrote a new row, updated the active one, or left a live position alone
  // (C2). The scan's persistence report reads this — "did nothing, correctly"
  // and "did nothing, because the write failed" have to be distinguishable.
  outcome: ScanWriteOutcome;
  setupId: string;
  updated: boolean;
};

type MarketScanCandidate = {
  assetType: string;
  blocked?: boolean;
  /**
   * The market this one was held back FOR — #457's correlation sibling.
   *
   * Shipped since #457, read by the client at
   * `src/components/workspace/AdvisorWorkspace.tsx`, and never declared on
   * this type. It compiled because nothing type-checks these files: they sit
   * outside `tsconfig.tests.json` for their Deno globals, so `npm run check`
   * never sees them. `deno check` had reported it as TS2353 all along.
   */
  withheldFor?: string;
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
  side?: Side;
  setup?: unknown;
  stopLoss?: number;
  symbol: SupportedSymbol;
  takeProfit?: number;
  takeProfit1?: number;
};

type ReviewedSetup = NonNullable<Awaited<ReturnType<typeof analyzeSetup>>>;

// The extra context a scan candidate needs to be written to trade_setups
// that isn't part of the client-facing MarketScanCandidate shape.
type ScanPersistenceContext = {
  correlationGroup: string;
  fmpSymbol: string;
  newsContext: NewsContext;
  setup: ReviewedSetup;
  symbol: SupportedSymbol;
};
type CurrentMarketReview =
  | {
    analysisDiagnostics?: string[];
    blocked: true;
    /**
     * The sibling this market was held back for (#457). Set on this branch and
     * read from it; declared on `MarketScanCandidate` and not here, so the
     * read was untyped on the union that actually carries it.
     */
    withheldFor?: string;
    /**
     * A TYPED DISCRIMINATOR, for the same reason `withheldFor` is one.
     *
     * The panel's heading has to tell a PERMANENT decline from a near miss,
     * and the only thing distinguishing them was the wording of `reason` —
     * so the heading read "Nothing passed review" and the body "did not find
     * a CURRENT limit setup strong enough to show" directly above a sentence
     * saying the market's measured record is negative. Two of the three
     * elements invited a retry the third had just ruled out. Matching the
     * sentence instead would break the moment the sentence improves, which
     * is exactly how the collapse path came to render as "Nothing passed
     * review" before #457 typed it.
     */
    declined?: true;
    correlationGroup?: string;
    newsEvents?: NewsEvent[];
    providerWarnings?: string[];
    reason: string;
    statusCode?: number;
    symbol: SupportedSymbol;
  }
  | {
    blocked: false;
    correlationGroup: string;
    fmpSymbol: string;
    marketContext: MarketContext;
    newsContext: NewsContext;
    providerFailures: string[];
    setup: ReviewedSetup;
    symbol: SupportedSymbol;
  };

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method not allowed" }, 405);
    }

    if (!FMP_API_KEY || !hasSupabaseRuntimeConfig()) {
      return jsonResponse(req, {
        error: "Analyzer provider configuration is incomplete",
      }, 500);
    }

    const token = getBearerToken(req);
    const user = await getAuthenticatedUser(token);
    if (!token || !user) {
      return jsonResponse(req, {
        error: "Authenticated Supabase session required",
      }, 401);
    }

    let body: AnalyzeRequest;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    // §17m.1 left the analyzer two actions, and an unrecognized one is refused
    // rather than reinterpreted. The old default — anything unknown means
    // "review this symbol" — is exactly how a request with no action at all
    // became a second door into the engine.
    const actionName = normalizeActionName(body.action);
    if (!actionName) {
      return jsonResponse(req, { error: "Unsupported analyzer action" }, 400);
    }

    // Read once, for whichever of the two actions this is: both write an event,
    // and the sender's bundle is as true of an outcome refresh as of a scan.
    const buildStamp = readBuildStamp(body);

    const rateLimit = await claimAnalyzerRequest(user.id, actionName);
    if (!rateLimit.allowed) {
      await recordAnalyzerEvent({
        action: actionName,
        message: "Rate limit exceeded",
        status: "blocked",
        userId: user.id,
      });
      return jsonResponse(
        req,
        {
          blocked: true,
          reason: "Too many review requests. Wait a moment, then try again.",
          resetAt: rateLimit.resetAt,
        },
        429,
      );
    }

    if (actionName === "refresh_outcomes") {
      const outcomeRefresh = await refreshUserOutcomes(token, user.id);
      const learningRefresh = await refreshGlobalStrategyWeightsThrottled();
      await recordAnalyzerEvent({
        action: "refresh_outcomes",
        metadata: { buildStamp, outcomeRefresh, learningRefresh },
        status: outcomeRefresh.failed > 0 ? "error" : "success",
        userId: user.id,
      });
      return jsonResponse(req, {
        advisoryOnly: true,
        learningRefresh,
        message: "Trade outcomes refreshed.",
        outcomeRefresh,
      });
    }

    // The one door (§17m.1). Reached by exhaustion, not by default: the only
    // other action returned above, and anything else was refused before the
    // rate limit was even claimed.
    //
    // Every scan names its markets, and never more than one request's worth.
    // Refused before any engine work — no learning refresh, no provider fetch,
    // no telemetry row a caller could force. The meter above already counted
    // the request, which is the honest order: a malformed request is still a
    // request, and refusing it must not be the cheap way to make many.
    //
    // A tab left open across this deploy still posts the retired all-markets
    // form (no symbols at all, which used to mean "the server's own curated
    // universe"). It gets this 400 carrying its reason, and reloading is the
    // fix — the same acknowledged cost as §17m.1's one-door 400.
    const scanRequest = readScanRequestSymbols(body.symbols);
    if (scanRequest.reason !== undefined) {
      return jsonResponse(req, { error: scanRequest.reason }, 400);
    }
    const scanTrace = readScanTrace(body);
    const learningRefresh = await refreshGlobalStrategyWeightsThrottled();
    const scan = await scanOpportunities(
      token,
      user.id,
      scanRequest.symbols,
      scanTrace,
    );
    await recordAnalyzerEvent({
      action: "scan_opportunities",
      metadata: {
        blocked: scan.blocked.length,
        // Which bundle sent this scan. A fleet running two bundles is invisible
        // without it, which is how 2026-08-03's stale tab went a whole morning
        // unnoticed.
        buildStamp,
        opportunities: scan.opportunities.length,
        // The persistence contract, in the record of the request itself:
        // a scan that showed setups and wrote none is now legible in
        // analyzer_events rather than only in a console (spec §17m.2).
        persistence: scan.persistence,
        scanned: scan.scanned,
        // Which click this request belonged to, and which of its chunks this
        // was. Absent when the caller sent nothing usable.
        ...scanTrace,
      },
      // A scan that could not write part of what it showed is not a
      // success — "scan_failure" is the enum's own word for it
      // (supabase/init.sql's analyzer_events status check).
      status: scan.persistence.failed > 0 ? "scan_failure" : "success",
      userId: user.id,
    });
    return jsonResponse(req, {
      advisoryOnly: true,
      learningRefresh,
      ...scan,
    });
  } catch (error) {
    console.error("trade-analyzer request failed", error);
    return jsonResponse(
      req,
      {
        blocked: true,
        error: "Market review could not complete. Try again shortly.",
      },
      500,
    );
  }
});

/**
 * The scan request's symbol contract: a named, request-sized list, or the reason
 * it is refused.
 *
 * The empty list is no longer the "all markets" form. It used to mean "use the
 * server's own curated universe" (defaultScanSymbols), and that is precisely
 * the request that spent ~1.84s of a 2s CPU budget and failed roughly half the
 * time under open markets on 2026-08-02. The client resolves "All markets" to an
 * explicit list already (marketScanFilters.ts, so closed markets drop out of the
 * count) and now splits it into request-sized chunks (src/lib/scanBatching.ts) —
 * so nothing legitimate sends either shape this refuses.
 */
function readScanRequestSymbols(
  requested: string[] | undefined,
):
  | { reason: string; symbols?: undefined }
  | { reason?: undefined; symbols: string[] } {
  if (!Array.isArray(requested) || requested.length === 0) {
    return { reason: "A market scan must name the markets to scan." };
  }
  if (requested.length > MAX_SCAN_SYMBOLS) {
    return {
      reason:
        `A market scan may cover at most ${MAX_SCAN_SYMBOLS} markets per request; this one named ${requested.length}.`,
    };
  }
  return { symbols: requested };
}

async function scanOpportunities(
  token: string,
  userId: string,
  requestedSymbols: string[],
  trace: ScanTrace,
) {
  const normalizedSymbols = Array.from(
    new Set(
      requestedSymbols.map((symbol) => normalizeSymbol(symbol)).filter(
        (symbol) =>
          Boolean(symbol) && isKnownSymbol(symbol) &&
          !isTemporarilyUnavailableSymbol(symbol) &&
          !noScanSymbols.has(symbol),
      ),
    ),
  );

  const results = await mapWithConcurrency(
    normalizedSymbols,
    4,
    (symbol) => scanOpportunity(token, userId, symbol),
  );
  const opportunities: MarketScanCandidate[] = [];
  const blocked: MarketScanCandidate[] = [];
  const persistenceBySymbol = new Map<SupportedSymbol, ScanPersistenceContext>();

  for (const result of results) {
    if (result.opportunity) {
      opportunities.push(result.opportunity);
    }
    if (result.persistence) {
      persistenceBySymbol.set(result.persistence.symbol, result.persistence);
    }
    if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  const ranked = collapseRelatedMarketOpportunities(opportunities);
  blocked.push(...ranked.blocked);

  const rankedOpportunities = rankOpportunities(ranked.opportunities);

  // Persist exactly what the caller is about to see below — post ranking
  // and correlation collapse — so the scan response and the historical
  // record never disagree. scanOpportunities only runs for an
  // authenticated caller (Deno.serve rejects unauthenticated requests
  // before any action handler runs), so persistence is unconditional here.
  //
  // Spec §17m.2: the Scan column is the only door a setup comes through, so
  // "every qualifying setup persists" is a contract, not an intention. The
  // report below is that contract as numbers the response carries — see
  // scanPersistence.ts — and every failure also lands in analyzer_events,
  // because the previous shape of this pass logged write failures to a
  // console nobody reads and reported success regardless.
  const persistence = await persistScannedOpportunities({
    contexts: persistenceBySymbol,
    onFailure: async (symbol, error) => {
      console.error("scan setup persistence failed", symbol, error);
      await recordAnalyzerEvent({
        action: "scan_opportunities",
        message: `Scan setup persistence failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        // The click this write belonged to: a per-symbol failure is only
        // legible next to the scan that produced it.
        metadata: { ...trace },
        status: "scan_failure",
        symbol,
        userId,
      });
    },
    opportunities: rankedOpportunities,
    write: (context) =>
      upsertActiveSetup(
        token,
        userId,
        context.symbol,
        context.fmpSymbol,
        context.correlationGroup,
        context.setup,
        context.newsContext,
      ),
  });

  return {
    blocked,
    opportunities: rankedOpportunities,
    persistence,
    qualified: rankedOpportunities.length,
    scanned: normalizedSymbols.length,
  };
}

async function reviewCurrentMarket(
  token: string,
  userId: string,
  symbol: SupportedSymbol,
): Promise<CurrentMarketReview> {
  // §17m.1: every review that runs is part of a scan, so the telemetry action
  // and the status a refusal records are fixed rather than chosen by a caller.
  // The parameter that used to carry them existed only for the second door.
  const action = "scan_opportunities";
  const eventStatus = "scan_failure";
  const normalizedSymbol = normalizeSymbol(symbol) as SupportedSymbol;

  // The measured no-trade list is enforced here, not just in the UI: these
  // markets' records clearly say no setups (owner directive, r15). They stay
  // in the replay universe, and this block lifts the round the evidence does.
  if (noTradeSymbols.has(normalizedSymbol)) {
    await recordAnalyzerEvent({
      action,
      message: "No-trade market (measured record)",
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      reason:
        "Levelflow's measured record says this market does not earn setups, so reviews are off for it. It stays under analysis and returns if the data changes.",
      symbol: normalizedSymbol,
    };
  }

  if (isTemporarilyUnavailableSymbol(normalizedSymbol)) {
    await recordAnalyzerEvent({
      action,
      message: "Temporarily unavailable market group",
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      reason:
        "This market group is temporarily unavailable while Levelflow verifies chart coverage.",
      symbol: normalizedSymbol,
    };
  }

  const providerSymbols = resolveProviderSymbols(normalizedSymbol);
  if (providerSymbols.length === 0) {
    await recordAnalyzerEvent({
      action,
      message: "Unsupported market symbol",
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      reason: "Unsupported Levelflow market symbol.",
      statusCode: 400,
      symbol: normalizedSymbol,
    };
  }

  const sessionContext = getSessionContext(normalizedSymbol);
  if (sessionContext.block) {
    await recordAnalyzerEvent({
      action,
      message: sessionContext.label,
      metadata: { sessionContext },
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      reason: sessionContext.reason ?? "The market session is not open.",
      symbol: normalizedSymbol,
    };
  }

  // 1b: a futures-shaped market without a verified contract spec refuses
  // HERE, with its own ground, before any data or scoring work — not inside
  // buildPricePlan, where the null would wear "A valid limit entry was not
  // available", replacing one lie with another. The spec table covers every
  // market whose grid is verified; what remains is exactly the population
  // whose prices could not honestly be aligned.
  if (
    needsFuturesTickGrid(normalizedSymbol) &&
    !getFuturesContractSpec(normalizedSymbol)
  ) {
    await recordAnalyzerEvent({
      action,
      message: "No verified contract spec",
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      reason: "This market's price increments are not yet verified, so no setup is shown.",
      symbol: normalizedSymbol,
    };
  }

  const newsContext = await fetchRelevantNews(token, normalizedSymbol);
  // A READ THAT FAILED CANNOT CLEAR A BLOCK. `blocking` is empty both when the
  // calendar says there is no active high-impact event and when the calendar
  // could not be read at all, and the gate below treats empty as permission to
  // publish. Before the provenance work the failed read THREW and the review
  // died; #456 caught it and let the review continue, which silently converted
  // a safety refusal into a pass — a setup published while blind to a possible
  // high-impact event.
  //
  // macroContext's precedent does not extend here, and reading it as if it did
  // was the error: an unavailable rate curve costs a score ADJUSTMENT, while an
  // unavailable calendar costs a BLOCK. §19e — a refusal beats a wrong number,
  // and "no active event" from a read that never happened is a wrong number.
  //
  // `stale` is deliberately NOT blocked: the table answered and simply holds no
  // future events, which is the same evidence the pre-#456 engine acted on, and
  // refusing every market on it would be a new outage rather than a repair.
  if (newsContext.calendarSource === "unavailable") {
    await recordAnalyzerEvent({
      action,
      message: "Economic calendar unreadable",
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      reason:
        "The economic calendar could not be read, so this market was not reviewed.",
      symbol: normalizedSymbol,
    };
  }
  if (newsContext.blocking.length > 0) {
    await recordAnalyzerEvent({
      action,
      message: "Active major scheduled event",
      metadata: { activeNewsEvents: newsContext.blocking },
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      newsEvents: newsContext.blocking,
      reason: "A major scheduled event is active for this market.",
      symbol: normalizedSymbol,
    };
  }

  const { fetchFailed, fmpSymbol, marketContext, providerFailures } =
    await fetchFirstAvailableMarketContext(
      providerSymbols,
      recordAnalyzerEvent,
      fetchWithTimeout,
      // 2a: indicators read completed daily bars only — the roster symbol
      // classifies the session close; the forming current row and weekend
      // transients drop out here exactly as they do in the replay corpus.
      (bars) => completedDailyBars(normalizedSymbol, bars, Date.now()),
    );
  await recordMarketDataHealth(
    normalizedSymbol,
    fmpSymbol,
    marketContext,
    providerFailures,
  );

  if (!fmpSymbol || !marketContext) {
    if (action === "scan_opportunities" && providerFailures.length > 0) {
      console.warn(
        "scan market data unavailable",
        normalizedSymbol,
        providerFailures[0],
      );
    }
    await recordAnalyzerEvent({
      action,
      message: "Market data unavailable",
      metadata: { providerFailures },
      providerSymbol: fmpSymbol,
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      providerWarnings: providerFailures,
      // 1m: two different facts wore one sentence. Thin history is a durable
      // statement about the instrument; a thrown fetch is a transient the
      // reader should retry — telling them the instrument lacks bars taught
      // them to stop trying when a retry would have worked.
      reason: fetchFailed
        ? "Market data did not load. Try again shortly."
        : "FMP did not return enough bars for this instrument.",
      symbol: normalizedSymbol,
    };
  }

  if (marketContext.daily.length < 80) {
    await recordAnalyzerEvent({
      action,
      message: "Insufficient daily history",
      metadata: {
        dailyBars: marketContext.daily.length,
        providerFailures,
        providerWarnings: marketContext.providerWarnings,
      },
      providerSymbol: fmpSymbol,
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      providerWarnings: [
        ...providerFailures,
        ...marketContext.providerWarnings,
      ],
      reason: "Not enough FMP daily bars returned for analyzer confidence.",
      symbol: normalizedSymbol,
    };
  }

  const macroRateContext = await fetchMacroRateContext(
    fetchWithTimeout,
    recordAnalyzerEvent,
  );
  const correlationGroup = getCorrelationGroup(normalizedSymbol);
  // Computed once for both readers below. analyzeSetup ran the committee and
  // explainNoSetup ran it again for every symbol that produced no setup — 45 of
  // 50 on a live open-market scan — and all four functions are pure in their
  // arguments, so one pass and two passes cannot disagree (tests/setupAnalysis
  // .test.ts pins that).
  const analysis = analyzeMarket(normalizedSymbol, marketContext);
  const setup = await analyzeSetup(
    token,
    userId,
    normalizedSymbol,
    fmpSymbol,
    correlationGroup,
    marketContext,
    newsContext,
    macroRateContext,
    sessionContext,
    analysis,
  );
  if (!setup) {
    const analysisDiagnostics = await explainNoSetup(
      token,
      normalizedSymbol,
      marketContext,
      newsContext,
      macroRateContext,
      sessionContext,
      analysis,
    );
    await recordAnalyzerEvent({
      action,
      message: "No current limit setup met scan threshold",
      metadata: { analysisDiagnostics },
      providerSymbol: fmpSymbol,
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    // THE DECLINE SPEAKS ON `reason`, not only in analysisDiagnostics.
    //
    // A declined market is not a near miss and must never be answered as one.
    // `analysisDiagnostics` carries the honest sentence, but it reaches nobody:
    // `scanOpportunity` rebuilds the blocked candidate field by field and
    // `AdvisorWorkspace` rebuilds it AGAIN, and neither carries the field —
    // two boundaries, which is why widening the server type alone would have
    // been a no-op (AdvisorWorkspace's own comment says exactly that). So all
    // fifteen declined markets were answered "No current limit setup met the
    // review threshold." — a transient sentence inviting a rescan that can
    // never succeed, against an FMP quota already exhausted twice.
    //
    // `reason` is the channel that already crosses both rebuilds. This is the
    // #457 lesson applied one surface over: the fix for a field lost in
    // transit is to send it on the wire that arrives, not to widen a second
    // type and hope.
    const declined = engineDeclines(normalizedSymbol);
    return {
      analysisDiagnostics,
      blocked: true,
      ...(declined && { declined: true as const }),
      providerWarnings: marketContext.providerWarnings,
      reason: declined
        ? engineDeclineSentence(declined)
        : "No current limit setup met the review threshold.",
      symbol: normalizedSymbol,
    };
  }

  const strongerExisting = await findStrongerActiveCorrelatedSetup(
    token,
    userId,
    correlationGroup,
    normalizedSymbol,
    setup.confidenceScore,
  );
  if (strongerExisting) {
    await recordAnalyzerEvent({
      action,
      message: "Correlation filter skipped scan candidate",
      metadata: { correlationGroup, strongerExisting },
      providerSymbol: fmpSymbol,
      status: eventStatus,
      symbol: normalizedSymbol,
      userId,
    });
    return {
      blocked: true,
      correlationGroup,
      reason:
        `A stronger closely linked setup is already active on ${strongerExisting.symbol}.`,
      symbol: normalizedSymbol,
      // BOTH withholding paths state it. This one's sentence happened to match
      // the panel's old regex and the collapse path's did not, which is the
      // whole reason one of them silently read as "Nothing passed review".
      // Fixing only the broken sentence would leave the same coin-flip in
      // place.
      withheldFor: strongerExisting.symbol,
    };
  }

  return {
    blocked: false,
    correlationGroup,
    fmpSymbol,
    marketContext,
    newsContext,
    providerFailures,
    setup,
    symbol: normalizedSymbol,
  };
}

async function scanOpportunity(
  token: string,
  userId: string,
  symbol: SupportedSymbol,
): Promise<{
  blocked?: MarketScanCandidate;
  opportunity?: MarketScanCandidate;
  persistence?: ScanPersistenceContext;
}> {
  try {
    const review = await reviewCurrentMarket(token, userId, symbol);
    if (review.blocked) {
      return {
        blocked: {
          assetType: getAssetType(symbol),
          blocked: true,
          ...(review.declined && { declined: true as const }),
          // THE CAUSE, not just the verdict. This rebuild dropped both fields,
          // so the panel's supporting-reason section had nothing to render and
          // every no-setup market said only "No current limit setup met the
          // review threshold." The analyzer had already computed which gate
          // failed and by how much; it went to analyzer_events and stopped.
          ...(review.analysisDiagnostics?.length &&
            { analysisDiagnostics: review.analysisDiagnostics }),
          ...(review.providerWarnings?.length &&
            { providerWarnings: review.providerWarnings }),
          reason: review.reason,
          symbol,
          // REBUILT FIELD BY FIELD, so anything not named here is dropped
          // between the review and the panel. #457 added withheldFor at both
          // engine sites and missed this rebuild, which took the cross-scan
          // withholding from working (the panel's old regex matched its
          // sentence) to broken. The guard was a count of engine sites and
          // could not see a field lost in transit.
          withheldFor: review.withheldFor,
        },
      };
    }

    return {
      opportunity: {
        assetType: getAssetType(symbol),
        confidenceScore: review.setup.confidenceScore,
        correlationGroup: review.correlationGroup,
        entryPrice: review.setup.entryPrice,
        executionLabel: String(
          review.setup.riskModel.executionQuality?.label ?? "",
        ),
        executionScore: Number(
          review.setup.riskModel.executionQuality?.score ?? 0,
        ),
        marketRegime: String(
          review.setup.confluence.marketRegime?.name ?? "",
        ),
        rationale: buildScanRationale(review.setup),
        relatedSymbols: getRelatedScanSymbols(review.correlationGroup, symbol),
        rewardRisk: Number(review.setup.confluence.rewardRisk ?? 0),
        setup: review.setup,
        side: review.setup.side,
        stopLoss: review.setup.stopLoss,
        symbol,
        takeProfit: review.setup.takeProfit,
        takeProfit1: review.setup.takeProfit1,
      },
      persistence: {
        correlationGroup: review.correlationGroup,
        fmpSymbol: review.fmpSymbol,
        newsContext: review.newsContext,
        setup: review.setup,
        symbol,
      },
    };
  } catch (error) {
    console.warn("scan market failed", symbol, error);
    await recordAnalyzerEvent({
      action: "scan_opportunities",
      message: error instanceof Error ? error.message : "Scan failed",
      status: "scan_failure",
      symbol,
      userId,
    });
    return {
      blocked: {
        assetType: getAssetType(symbol),
        blocked: true,
        reason: "This market could not be reviewed right now.",
        symbol,
      },
    };
  }
}

// The grouping key, the comparator and the winner-first ordering now live in
// scanCollapse.ts so the offline E4 instrument (R1c) replays this exact rule
// instead of a transcription of it. Behaviour is unchanged: same primary-group
// key, same four tiers, same winner, same order for the blocked remainder.
function collapseRelatedMarketOpportunities(
  opportunities: MarketScanCandidate[],
) {
  const blocked: MarketScanCandidate[] = [];
  const winners: MarketScanCandidate[] = [];

  for (const candidates of groupCollapseCandidates(opportunities).values()) {
    const sorted = rankCollapseGroup(candidates);
    const winner = sorted[0];
    if (!winner) {
      continue;
    }
    winners.push(winner);
    blocked.push(
      ...sorted.slice(1).map((candidate) =>
        buildRelatedMarketBlockedCandidate(candidate, winner)
      ),
    );
  }

  return {
    blocked,
    opportunities: winners,
  };
}

function buildRelatedMarketBlockedCandidate(
  blockedCandidate: MarketScanCandidate,
  winner: MarketScanCandidate,
): MarketScanCandidate {
  return {
    assetType: blockedCandidate.assetType,
    blocked: true,
    confidenceScore: blockedCandidate.confidenceScore,
    correlationGroup: blockedCandidate.correlationGroup,
    reason:
      `Showing ${winner.symbol} instead; it is the strongest current setup among closely linked markets.`,
    symbol: blockedCandidate.symbol,
    // Stated as a field so the client never has to read the sentence to learn
    // what happened. The wording above and the panel's branch drifted apart
    // exactly once and the panel then told operators nothing had qualified.
    withheldFor: winner.symbol,
  };
}

function getRelatedScanSymbols(_group: string, symbol: SupportedSymbol) {
  return getRelatedSymbols(symbol).filter((candidate) =>
    defaultScanSymbols.includes(candidate)
  );
}

function buildScanRationale(
  setup: NonNullable<Awaited<ReturnType<typeof analyzeSetup>>>,
) {
  const confluence = setup.confluence as Record<string, unknown>;
  const riskModel = setup.riskModel as Record<string, unknown>;
  const consensus = asRecord(confluence.consensus);
  const marketRegime = asRecord(confluence.marketRegime);
  const orderConstruction = asRecord(confluence.orderConstruction);
  const sessionContext = asRecord(confluence.sessionContext);
  const executionQuality = asExecutionQuality(riskModel.executionQuality);
  const reasons = [
    `${setup.side.toUpperCase()} setup scored ${setup.confidenceScore}/100.`,
    `${formatTitle(String(marketRegime.name ?? "current"))} conditions.`,
    `Payoff ${
      Number(confluence.rewardRisk ?? 0).toFixed(2)
    }x after trading-cost checks.`,
  ];
  const tickValidation = orderConstruction.tickValidation;
  if (typeof tickValidation === "string" && tickValidation.length > 0) {
    reasons.push(tickValidation);
  }
  reasons.push(
    executionQuality
      ? `${executionQuality.label} trading-cost check.`
      : "Trading-cost check complete.",
    String(sessionContext.label ?? "Session checked."),
  );
  const agreementRatio = Number(consensus.agreementRatio ?? 0);
  if (agreementRatio > 0) {
    reasons.push(`${Math.round(agreementRatio * 100)}% direction agreement.`);
  }

  return reasons.slice(0, 5);
}

async function findStrongerActiveCorrelatedSetup(
  token: string,
  userId: string,
  _group: string,
  symbol: SupportedSymbol,
  confidenceScore: number,
) {
  // RM-5: screen against the SYMBOL union across every group this market
  // belongs to, not one stored group name — a cross's stored group is its
  // primary only, and the group-equality query missed the second
  // membership every pair has (CADJPY under cad_crosses was invisible to
  // an AUDJPY candidate's yen exposure).
  const correlated = getCorrelatedSymbols(symbol);
  if (correlated.length === 0) {
    return null;
  }
  const rows = await fetchRows<
    { id: string; symbol: string; confidence_score: number }
  >(
    token,
    `trade_setups?select=id,symbol,confidence_score&user_id=eq.${
      encodeURIComponent(userId)
    }&symbol=in.(${
      correlated.map((member) => encodeURIComponent(member)).join(",")
    })&status=in.(generated,placed)&created_at=gte.${
      encodeURIComponent(
        new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      )
    }`,
  );

  return rows.find((row) =>
    row.symbol !== symbol && Number(row.confidence_score) >= confidenceScore
  ) ?? null;
}

// The analyzer's read of a market, before any threshold is applied to it.
// Pure in (symbol, market): calibration.ts holds frozen tables, and
// strategies.ts carries no module state, no clock and no randomness.
function analyzeMarket(symbol: SupportedSymbol, market: MarketContext) {
  const calibration = getCategoryCalibration(symbol);
  const regime = classifyRegime(market);
  if (!regime) {
    // 2n: the regime abstained — daily history too thin for the slow EMA.
    // Unreachable behind the loader's >=80-bar sufficiency, but the shared
    // engine refuses honestly rather than classifying on a degenerate seed;
    // a null-side consensus flows through the same no-setup channel every
    // other refusal uses.
    return {
      calibration,
      consensus: {
        blockScore: 0,
        buyScore: 0,
        score: 0,
        sellScore: 0,
        side: null as Side | null,
      },
      regime,
      votes: [],
    };
  }
  const votes = runStrategyCommittee(symbol, market, regime);
  return { calibration, consensus: scoreConsensus(votes, regime), regime, votes };
}

type MarketAnalysis = ReturnType<typeof analyzeMarket>;

async function analyzeSetup(
  token: string,
  userId: string,
  symbol: SupportedSymbol,
  fmpSymbol: string,
  correlationGroup: string,
  market: MarketContext,
  newsContext: NewsContext,
  macroRateContext: MacroRateContext,
  sessionContext: SessionContext,
  analysis: MarketAnalysis,
) {
  const { calibration, consensus, regime, votes } = analysis;
  // Amendment 36 / the roster law: a market measured to lose money is
  // one the engine declines to build a setup for — visible, scanned,
  // and answered honestly rather than hidden.
  if (engineDeclines(symbol)) {
    return null;
  }
  if (!regime) {
    // 2n: the regime abstained (thin daily history) — no setup can be
    // built on an unclassified market. Unreachable behind the loader's
    // sufficiency floor.
    return null;
  }
  if (calibration.blockedRegimes?.includes(regime.name)) {
    return null;
  }
  if (!consensus.side) {
    return null;
  }

  const setupKey = buildSetupKey(
    symbol,
    market,
    sessionContext,
    regime,
    consensus.side,
    votes,
  );
  const weight = await fetchSingle<
    {
      confidence_adjustment: number | string;
      sample_weight?: number | string;
      total_setups?: number | string;
    }
  >(
    token,
    // The version predicate is not decoration. The learning WRITE filters on
    // ANALYZER_VERSION and the reads did not, so a version bump left production
    // applying adjustments fitted by the previous engine — forever, because the
    // refresh then matches zero outcomes at the new version, upserts nothing,
    // and reports `updated: 0`, which reads as "nothing to do". Every calibration
    // round that bumps the version depends on this being here.
    `strategy_weightings_global?select=confidence_adjustment,sample_weight,total_setups&setup_key=eq.${
      encodeURIComponent(setupKey)
    }&analyzer_version=eq.${encodeURIComponent(ANALYZER_VERSION)}&limit=1`,
  );
  const weightAdjustment = Number(weight?.confidence_adjustment ?? 0);

  const pricePlan = buildPricePlan(
    consensus.side,
    symbol,
    market,
    regime,
    calibration,
  );
  if (!pricePlan) {
    return null;
  }

  const macroRateAdjustment = calculateMacroRateAdjustment(
    symbol,
    consensus.side,
    macroRateContext,
  );
  const scoreBreakdown = scoreSetupConfidence({
    availableTimeframeCount: market.availableTimeframes.length,
    calibration,
    consensusScore: consensus.score,
    executionPenalty: pricePlan.executionQuality.confidencePenalty,
    macroAdjustment: macroRateAdjustment.adjustment,
    providerWarningCount: market.providerWarnings.length,
    regimeAdjustment: calibration.regimeScoreAdjustments?.[regime.name] ?? 0,
    sessionPenalty: sessionContext.penalty,
    sideAdjustment: calibration.sideScoreAdjustments?.[consensus.side] ?? 0,
    newsPenaltyUnits: newsContext.penaltyUnits,
    weightAdjustment,
  });
  const confidenceScore = scoreBreakdown.confidenceScore;

  if (
    confidenceScore < calibration.confidenceThreshold ||
    pricePlan.rewardRisk < calibration.minRewardRisk ||
    (calibration.maxCostShare !== undefined &&
      pricePlan.executionQuality.costToRisk > calibration.maxCostShare)
  ) {
    return null;
  }

  const lotSize = 0.01;
  const expiresAt = new Date(getSetupExpiryTime(symbol, Date.now()))
    .toISOString();
  // TP1 is the breakeven trigger: once the first target banks, the runner
  // is protected at entry.
  const breakevenTriggerPrice = pricePlan.takeProfit1;

  return {
    symbol,
    dataProvider: "FMP",
    fmpSymbol,
    providerSymbol: fmpSymbol,
    expiresAt,
    side: consensus.side,
    orderType: "limit" as const,
    entryPrice: roundPrice(pricePlan.entryPrice),
    stopLoss: roundPrice(pricePlan.stopLoss),
    takeProfit: roundPrice(pricePlan.takeProfit),
    takeProfit1: roundPrice(pricePlan.takeProfit1),
    breakevenTriggerPrice: roundPrice(breakevenTriggerPrice),
    lotSize,
    confidenceScore,
    correlationGroup,
    confluence: {
      setupKey,
      consensus,
      marketRegime: regime,
      strategyVotes: votes,
      activeTimeframes: market.availableTimeframes,
      currentPriceTimeframe: market.latestTimeframe,
      primaryTimeframe: market.primaryTimeframe,
      providerWarnings: market.providerWarnings,
      categoryCalibration: {
        assetType: getAssetType(symbol),
        confidenceThreshold: calibration.confidenceThreshold,
        minRewardRisk: calibration.minRewardRisk,
        reviewWindowHours: calibration.defaultReviewHours,
      },
      executionQuality: pricePlan.executionQuality,
      grossRewardRisk: Number(pricePlan.grossRewardRisk.toFixed(2)),
      // What the ladder pays, beside what the runner target pays. The gate
      // still reads rewardRisk; the SURFACE reads this, because half the
      // position leaves at TP1 and a figure that ignores that overstates the
      // edge by 33% to 60% on every laddered setup, depending on the
      // class — 60.0% is metals, the maximum, not the typical case.
      ladderRewardRisk: pricePlan.ladderRewardRisk === null
        ? null
        : Number(pricePlan.ladderRewardRisk.toFixed(2)),
      rewardRisk: Number(pricePlan.rewardRisk.toFixed(2)),
      scoreBreakdown,
      macroRateContext: {
        adjustment: macroRateAdjustment.adjustment,
        curveSpreadBps: macroRateContext.curveSpreadBps,
        detail: macroRateAdjustment.detail,
        latestDate: macroRateContext.latestDate,
        source: macroRateContext.source,
        stance: macroRateAdjustment.stance,
        tenYearChangeBps: macroRateContext.tenYearChangeBps,
        tenYearYield: macroRateContext.tenYearYield,
        twoYearYield: macroRateContext.twoYearYield,
        unavailableReason: macroRateContext.unavailableReason ?? null,
      },
      newsContext: {
        activeEvents: newsContext.active.length,
        // Provenance rides WITH the numbers, mirroring macroRateContext's
        // unavailableReason a few lines below. Without it a zero penalty is
        // ambiguous on the wire in exactly the way it was ambiguous in the
        // engine, and the receipt would go on printing an all-clear it cannot
        // stand behind.
        calendarSource: newsContext.calendarSource,
        headlineEvents: newsContext.headlineCount,
        penaltyUnits: Number(newsContext.penaltyUnits.toFixed(2)),
        unavailableReason: newsContext.unavailableReason,
        upcomingEvents: newsContext.upcoming.length,
      },
      orderConstruction: {
        contractSpec: pricePlan.contractSpec,
        futuresTickAdjustments: pricePlan.futuresTickAdjustments,
        orderType: "limit",
        // E3 aged this field (#362 round 2, finding 3): the completed
        // decision-anchor close, no longer a ≤1-minute print. The
        // client's §19c Size row reads it as the market's rate —
        // staleness now bounded by the primary span (a daily close on
        // the loader's fallback) — accepted for sizing tolerance and
        // named in the divergence map's residue; sourcing it from
        // market.quote is a §19 governor change, not a rider here.
        latestClose: market.latest.close,
        tickValidation: pricePlan.contractSpec
          ? `Prices rounded to the ${pricePlan.contractSpec.contractLabel} tick size.`
          : null,
        validation: consensus.side === "buy"
          ? "buy limit entry below latest close"
          : "sell limit entry above latest close",
      },
      sessionContext,
      strategyWeightAdjustment: weightAdjustment,
      strategyWeightSource: "global",
      strategyWeightSampleSize: Number(weight?.total_setups ?? 0),
      strategyWeightSampleWeight: Number(weight?.sample_weight ?? 0),
      analyzerVersion: ANALYZER_VERSION,
      upcomingNewsEvents: newsContext.upcoming,
    },
    riskModel: {
      atr: pricePlan.atr,
      dailyAtr: averageTrueRange(market.daily, 14),
      executionQuality: pricePlan.executionQuality,
      futuresContract: pricePlan.contractSpec,
      // E7 (R1a slice 2): the resolver's runner protection is a MODE
      // (4c axis) and the resolution's review window is a DECISION-TIME
      // fact — both must ride the row, because the grading bridge
      // (fillOptionsFromRiskModel) reads decision-time facts from the
      // row, never a re-model at sync time. Before this, the bridge had
      // nothing to read: both live writers graded every row with the
      // resolver's "breakeven" fallback while the calibration ships
      // trail_tp1/hold for most categories — the corpus measured one
      // physics and the cohort was graded under another.
      runnerProtection: calibration.runnerProtection ?? "breakeven",
      reviewWindowHours: calibration.defaultReviewHours,
      positionSizingStatus: "not_calculated",
      positionSizingReason:
        "Levelflow records directional market setups only; position sizing should be handled in the trader's execution platform.",
      activeNewsEventsTracked: newsContext.active.length,
      headlineNewsEventsTracked: newsContext.headlineCount,
      newsPenaltyUnits: Number(newsContext.penaltyUnits.toFixed(2)),
      upcomingNewsEventsTracked: newsContext.upcoming.length,
      macroRateContext: {
        adjustment: macroRateAdjustment.adjustment,
        curveSpreadBps: macroRateContext.curveSpreadBps,
        source: macroRateContext.source,
        stance: macroRateAdjustment.stance,
        tenYearChangeBps: macroRateContext.tenYearChangeBps,
      },
      expectedWindowMove: roundPrice(pricePlan.expectedWindowMove),
      reviewWindowExpiresAt: expiresAt,
      stopLogic: pricePlan.stopLogic,
      stopProvenance: pricePlan.stopProvenance,
      // 1o's residue: these three were computed in the plan and dropped
      // here, so the corpus could not audit which anchor placed TP1, the
      // runner, or the entry — exactly what calibration 4d's per-market
      // derivation needs to read back.
      runnerProvenance: pricePlan.runnerProvenance,
      tp1Provenance: pricePlan.tp1Provenance,
      entryProvenance: pricePlan.entryProvenance,
      targetLogic: pricePlan.targetLogic,
    },
  };
}

async function explainNoSetup(
  token: string,
  symbol: SupportedSymbol,
  market: MarketContext,
  newsContext: NewsContext,
  macroRateContext: MacroRateContext,
  sessionContext: SessionContext,
  analysis: MarketAnalysis,
) {
  const { calibration, consensus, regime, votes } = analysis;
  const diagnostics: string[] = [];

  if (!regime) {
    // 2n mirror of analyzeSetup's guard: one stated reason, no committee
    // diagnostics to report because none could run.
    diagnostics.push(
      "This market's daily history is too thin to classify conditions.",
    );
    return diagnostics;
  }

  if (calibration.blockedRegimes?.includes(regime.name)) {
    diagnostics.push(
      "Market conditions are in elevated-volatility chop; Levelflow does not open new setups in this regime.",
    );
  }

  if (!consensus.side) {
    diagnostics.push(
      `No clear direction passed review: buy ${consensus.buyScore}, sell ${consensus.sellScore}, block ${consensus.blockScore}.`,
    );
  } else {
    const setupKey = buildSetupKey(
      symbol,
      market,
      sessionContext,
      regime,
      consensus.side,
      votes,
    );
    const weight = await fetchSingle<
      { confidence_adjustment: number | string }
    >(
      token,
      // Same version predicate as the single-market path above, for the same
      // reason — the scan path scores with the same adjustment.
      `strategy_weightings_global?select=confidence_adjustment&setup_key=eq.${
        encodeURIComponent(setupKey)
      }&analyzer_version=eq.${encodeURIComponent(ANALYZER_VERSION)}&limit=1`,
    );
    const weightAdjustment = Number(weight?.confidence_adjustment ?? 0);
    const planRefusal: { reason?: "quote_crossed" } = {};
    const pricePlan = buildPricePlan(
      consensus.side,
      symbol,
      market,
      regime,
      calibration,
      planRefusal,
    );
    const macroRateAdjustment = calculateMacroRateAdjustment(
      symbol,
      consensus.side,
      macroRateContext,
    );
    const scoreBreakdown = scoreSetupConfidence({
      availableTimeframeCount: market.availableTimeframes.length,
      calibration,
      consensusScore: consensus.score,
      executionPenalty: pricePlan?.executionQuality.confidencePenalty ?? 0,
      macroAdjustment: macroRateAdjustment.adjustment,
      providerWarningCount: market.providerWarnings.length,
      regimeAdjustment: calibration.regimeScoreAdjustments?.[regime.name] ?? 0,
      sessionPenalty: sessionContext.penalty,
      sideAdjustment: consensus.side
        ? calibration.sideScoreAdjustments?.[consensus.side] ?? 0
        : 0,
      newsPenaltyUnits: newsContext.penaltyUnits,
      weightAdjustment,
    });
    const confidenceScore = scoreBreakdown.confidenceScore;

    // THE PLAN REFUSAL RUNS FIRST, and above the decline for a reason.
    //
    // 1b's rule applied to the quote-admission gate (#362 round 5, finding 1):
    // a distinct cause carries its own sentence — geometry failing to place a
    // limit and the market having already crossed a placed one are different
    // facts and different instructions.
    //
    // It is also the anchor-latency instrument. `analyzer_events` carries
    // `analysisDiagnostics` verbatim, so this sentence's frequency is the one
    // measurable read on the through-market rate before §21's minute bank, and
    // a run of them on one symbol is the un-de-spiked bad-quote signal the
    // admission gate otherwise lacks. The decline below returns early, and
    // returning above this push silently narrowed that instrument's population
    // from 97 markets to 82 while still paying to compute the reading — a
    // measurement dropped as a side effect of a copy fix.
    if (!pricePlan) {
      if (planRefusal.reason === "quote_crossed") {
        diagnostics.push(
          "The live market has already crossed the computed limit entry, so the setup was withheld rather than shown as a resting order.",
        );
      } else {
        diagnostics.push(
          "Limit entry failed price validation, so no limit setup was shown.",
        );
      }
    }
    const declined = engineDeclines(symbol);
    if (declined) {
      // The honest sentence for a market the engine will not trade: the
      // measurement, not a mood, and the door back in. Its wording — and what
      // it deliberately no longer claims — lives with the register in
      // calibration.ts, because `reviewCurrentMarket` says the same thing on
      // the channel that reaches the panel.
      diagnostics.push(engineDeclineSentence(declined));
      // RETURN, but not before the anchor-latency reading. A decline is
      // permanent for this corpus, so the near-miss reporting below is about a
      // setup that was never going to be built — the score sentence most of
      // all, which invited the reader to try again at a higher score on a
      // market whose record is the reason no score would help.
      //
      // The plan-refusal reading above is NOT near-miss reporting and has
      // already been recorded, which is why it sits before this branch.
      return diagnostics;
    }
    // Quoted ONLY when there is a plan. Without one, `buildPricePlan` returned
    // null and the `executionPenalty: ... ?? 0` above means "not computable",
    // not "zero" — so this number would be the score of a setup that could
    // never have existed, inflated by exactly the execution cost the missing
    // plan would have charged. It was being shown in the one branch whose
    // entire job is telling the operator how close the setup came, which is
    // the reading it can least afford to overstate.
    //
    // Nothing else consumes it: this function returns strings, so the fix is
    // to stop saying it rather than to compute it differently. The refusal
    // below already carries the real cause, and it is the actionable one.
    // ...and only when the threshold is a BAR the score can fail against.
    //
    // 72 of the 98 markets in the symbol map resolve to
    // `confidenceThreshold: 0` through `getCategoryCalibration`, so on those
    // this sentence read "scored 47; Levelflow requires 0 or higher" — true of
    // every number, and an instruction to try harder against a gate that
    // cannot reject (scoring.ts clamps the score to [0,100], so zero rejects
    // nothing). 26 markets carry a positive threshold (25:18, 30:2, 40:3,
    // 68:3) and still get the sentence, which is why this is a gate and not a
    // deletion.
    //
    // THE POPULATION IS THE MARKETS, not the table. An earlier version of this
    // comment said "72 of the 81 calibration entries": the table holds 80
    // entries (the 81st match was the type declaration), and a per-entry
    // census answers a different question from a per-market one — the two
    // agree at 72 only because every zero is a per-symbol override while the
    // positive values are category bases covering many markets each. Counting
    // the wrong population is the failure this repo names by name.
    //
    // Derived from the calibration rather than a market list: a threshold
    // restored to a positive value starts speaking again with no edit here.
    if (pricePlan && calibration.confidenceThreshold > 0) {
      diagnostics.push(
        `The current ${consensus.side} setup scored ${confidenceScore}; Levelflow requires ${calibration.confidenceThreshold} or higher for this market.`,
      );
    }
    if (pricePlan && pricePlan.rewardRisk < calibration.minRewardRisk) {
      // PH-9: the refusal names its cause. A payoff that cleared the bar
      // gross and lost it to the round trip is a COST story, not a
      // geometry story — and under the venue's real bill they are very
      // different instructions to the operator.
      if (pricePlan.grossRewardRisk >= calibration.minRewardRisk) {
        diagnostics.push(
          `Trading costs took the payoff from ${
            pricePlan.grossRewardRisk.toFixed(2)
          }x to ${
            pricePlan.rewardRisk.toFixed(2)
          }x; Levelflow requires at least ${
            calibration.minRewardRisk.toFixed(2)
          }x for this market.`,
        );
      } else {
        diagnostics.push(
          `Payoff was ${
            pricePlan.rewardRisk.toFixed(2)
          }x; Levelflow requires at least ${
            calibration.minRewardRisk.toFixed(2)
          }x for this market.`,
        );
      }
      // GUARDED, and it was not. `if (pricePlan && ...)` above sends the
      // null case here, where every line dereferences it — so a market whose
      // geometry refused and which the engine has NOT declined reached
      // `pricePlan.executionQuality` on null. The refusal sentence pushed a
      // few lines up does not return; it falls through to exactly this branch.
      //
      // `deno check` has reported it as TS18047 five times over, and nothing
      // read that output: these files are outside `tsconfig.tests.json`
      // because of their Deno globals, so `npm run check` never sees them and
      // ESLint does not flag an undefined dereference in them either.
    } else if (
      pricePlan && calibration.maxCostShare !== undefined &&
      pricePlan.executionQuality.costToRisk > calibration.maxCostShare
    ) {
      // The cost weight per trade (R4 act 3): the round trip's share of the
      // risk unit exceeded the market's cap. A cost story, named as one.
      diagnostics.push(
        `Trading costs would take ${
          (pricePlan.executionQuality.costToRisk * 100).toFixed(0)
        }% of the risk unit; Levelflow admits at most ${
          (calibration.maxCostShare * 100).toFixed(0)
        }% for this market.`,
      );
    } else if (pricePlan && pricePlan.executionQuality.confidencePenalty > 0) {
      // 1b's rule again: a distinct cause carries its own sentence. This
      // printed the WHOLE penalty as "trading costs", and the penalty also
      // carries missing chart intervals, provider warnings and short-term
      // movement running hot — none of which a tighter spread would fix. A
      // failed 5-minute fetch was being reported to the operator as a
      // spread-and-slippage problem, which is the wrong instruction: costs say
      // size down or wait for better pricing, coverage says the market could
      // not be seen well enough yet.
      if (pricePlan.executionQuality.costPenalty > 0) {
        diagnostics.push(
          `Estimated trading costs reduced the setup score by ${pricePlan.executionQuality.costPenalty}.`,
        );
      }
      if (pricePlan.executionQuality.coveragePenalty > 0) {
        diagnostics.push(
          `Chart coverage gaps reduced the setup score by ${pricePlan.executionQuality.coveragePenalty}.`,
        );
      }
    }
    if (macroRateAdjustment.adjustment < 0) {
      diagnostics.push(
        "Current Treasury-rate movement worked against the setup.",
      );
    }
  }

  if (newsContext.penaltyUnits > 0) {
    diagnostics.push(
      "Scheduled events or recent market headlines reduced setup quality.",
    );
  }
  if (sessionContext.penalty > 0) {
    diagnostics.push(
      `${sessionContext.label} reduced confidence.`,
    );
  }
  if (market.availableTimeframes.length < 3) {
    diagnostics.push(
      "Fewer than three review timeframes were available from the provider.",
    );
  }

  return diagnostics.slice(0, 5);
}

async function upsertActiveSetup(
  token: string,
  userId: string,
  symbol: SupportedSymbol,
  fmpSymbol: string,
  group: string,
  setup: NonNullable<Awaited<ReturnType<typeof analyzeSetup>>>,
  newsContext: NewsContext,
): Promise<UpsertedSetupResult> {
  const rows = await fetchRows<ExistingSetupRow>(
    token,
    `trade_setups?select=id,symbol,provider_symbol,side,limit_entry,stop_loss,take_profit,take_profit_1,breakeven_trigger_price,confidence_score,analyzer_version,confluence,correlation_group,status,created_at&user_id=eq.${
      encodeURIComponent(userId)
    }&symbol=eq.${
      encodeURIComponent(
        symbol,
      )
    }&status=in.(generated,placed)&order=created_at.desc&limit=1`,
  );
  const activeSetup = rows[0] ?? null;

  // C2: a scan is advisory background research, never an authority over a
  // position that's already live. If the existing active row is "placed"
  // (filled and live — see tradeState.ts's status-naming note for why
  // "placed" means that, not "order placed"), leave it completely untouched:
  // the same-side branch below would otherwise overwrite its levels and force
  // status back to "generated" (demoting a filled trade to pending), and the
  // opposite-side branch would fall through to
  // invalidateActiveSetupsForSymbol and erase it outright. No duplicate insert
  // either: the existing live row already represents this symbol.
  //
  // The guard used to exempt review-origin calls, on the reasoning that a
  // human reviewing a market may supersede what is live. §17m.1 deleted that
  // door — the button a reader presses now says Scan, on both platforms — so
  // the exemption had become a way for one platform's Scan to do what the
  // other's could not. It is unconditional.
  if (activeSetup && activeSetup.status === "placed") {
    return {
      deduplicated: true,
      outcome: "skipped_live_position",
      setupId: activeSetup.id,
      updated: false,
    };
  }

  if (activeSetup && activeSetup.side === setup.side) {
    // The persistence contract (§17m.2) reaches into this branch too: a PATCH
    // whose filter matches nothing returns 200 with an empty representation,
    // and counting that as "updated" would be the exact silent divergence the
    // contract exists to end. Zero rows here means the row moved out from
    // under the read above — deleted, or advanced to another status by
    // outcome-sync — and it is thrown so the per-symbol accounting records it
    // failed, with the reason in analyzer_events.
    //
    // C1: the status filter is what makes that check a real compare-and-set
    // rather than a report on a race already lost. Between the read above and
    // this write, the hourly outcome-sync (service role, all users) can resolve
    // this very row: without the filter, the PATCH would rewrite the levels its
    // verdict was computed from and reset status to "generated", so the next
    // sync would re-resolve the NEW geometry and overwrite the first verdict —
    // one setup, two verdicts, the second measured against prices that never
    // existed at decision time. With it, the write simply matches nothing and
    // this scan reports the symbol as failed.
    const updatedRows = await adminUpdateRows(
      `trade_setups?id=eq.${encodeURIComponent(activeSetup.id)}&user_id=eq.${
        encodeURIComponent(userId)
      }&status=eq.${encodeURIComponent(activeSetup.status)}`,
      {
        breakeven_trigger_price: setup.breakevenTriggerPrice,
        confidence_score: setup.confidenceScore,
        analyzer_version: ANALYZER_VERSION,
        confluence: setup.confluence,
        correlation_group: group,
        limit_entry: setup.entryPrice,
        provider_symbol: fmpSymbol,
        news_context: {
          activeEvents: newsContext.active,
          headlineEvents: newsContext.headlineCount,
          penaltyUnits: Number(newsContext.penaltyUnits.toFixed(2)),
          upcomingEvents: newsContext.upcoming,
        },
        origin: "scan",
        risk_model: setup.riskModel,
        side: setup.side,
        status: "generated",
        stop_loss: setup.stopLoss,
        take_profit: setup.takeProfit,
        take_profit_1: setup.takeProfit1,
      },
    );

    if (updatedRows.length === 0) {
      throw new Error(
        `dedupe update matched no rows for setup ${activeSetup.id} — it was removed or resolved mid-scan`,
      );
    }

    return {
      deduplicated: true,
      outcome: "updated",
      setupId: activeSetup.id,
      updated: true,
    };
  }

  if (activeSetup) {
    // An opposite-side signal supersedes the pending row rather than living
    // beside it. C1: the read said there was one, so a write that matches
    // nothing means the row moved out from under this scan — thrown so the
    // per-symbol accounting records the symbol as failed instead of inserting
    // a second active row beside whatever is actually there now.
    const invalidated = await invalidateActiveSetupsForSymbol(
      token,
      userId,
      symbol,
    );
    if (invalidated === 0) {
      throw new Error(
        `superseding ${symbol} matched no active rows — the setup was removed or resolved mid-scan`,
      );
    }
  }

  const tradeSetup = await adminInsertSingle("trade_setups", {
    user_id: userId,
    symbol,
    provider_symbol: fmpSymbol,
    side: setup.side,
    limit_entry: setup.entryPrice,
    stop_loss: setup.stopLoss,
    take_profit: setup.takeProfit,
    take_profit_1: setup.takeProfit1,
    breakeven_trigger_price: setup.breakevenTriggerPrice,
    confidence_score: setup.confidenceScore,
    analyzer_version: ANALYZER_VERSION,
    confluence: setup.confluence,
    risk_model: setup.riskModel,
    news_context: {
      activeEvents: newsContext.active,
      headlineEvents: newsContext.headlineCount,
      penaltyUnits: Number(newsContext.penaltyUnits.toFixed(2)),
      upcomingEvents: newsContext.upcoming,
    },
    correlation_group: group,
    // One door, one honest answer (§17m.1). Rows written before that ruling
    // carry 'review'; the column is kept for that history and read by nothing.
    origin: "scan",
    status: "generated",
  });

  return {
    deduplicated: false,
    outcome: "inserted",
    setupId: tradeSetup.id,
    updated: false,
  };
}

// The user-facing reason is already recorded via analyzer_events; the
// setup row only tracks the status flip. The status filter is the write's own
// guard (C1) — a row that resolved since the caller read it is no longer
// `generated`/`placed`, so this cannot un-resolve it. Returns how many rows it
// actually moved, because "none" means something else got there first and the
// caller has to say so rather than assume.
async function invalidateActiveSetupsForSymbol(
  token: string,
  userId: string,
  symbol: SupportedSymbol,
): Promise<number> {
  const invalidatedRows = await adminUpdateRows(
    `trade_setups?user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${
      encodeURIComponent(symbol)
    }&status=in.(generated,placed)`,
    {
      status: "invalidated",
    },
  );
  return invalidatedRows.length;
}

async function refreshUserOutcomes(
  token: string,
  userId: string,
  options: { limit?: number; symbols?: SupportedSymbol[] } = {},
): Promise<OutcomeRefreshSummary> {
  const summary: OutcomeRefreshSummary = {
    ambiguous: 0,
    expired: 0,
    expiredAtLoss: 0,
    expiredInProfit: 0,
    failed: 0,
    pending: 0,
    placed: 0,
    reviewed: 0,
    stopLoss: 0,
    takeProfit: 0,
    tp1Partial: 0,
  };
  const symbolFilter = options.symbols && options.symbols.length > 0
    ? `&symbol=in.(${
      options.symbols.map((symbol) => encodeURIComponent(symbol)).join(",")
    })`
    : "";
  const limit = Math.max(1, Math.min(options.limit ?? 120, 120));
  const setups = await fetchRows<SetupForOutcome>(
    token,
    `trade_setups?select=id,symbol,provider_symbol,side,limit_entry,stop_loss,take_profit,take_profit_1,breakeven_trigger_price,confidence_score,analyzer_version,confluence,risk_model,correlation_group,status,created_at&user_id=eq.${
      encodeURIComponent(
        userId,
      )
    }&status=in.(generated,placed)${symbolFilter}&order=created_at.asc&limit=${limit}`,
  );
  const barsByProviderSymbol = new Map<string, Promise<Bar[]>>();

  for (const setup of setups) {
    summary.reviewed += 1;

    try {
      const providerSymbol = setup.provider_symbol ||
        resolveProviderSymbols(setup.symbol)[0];
      if (!providerSymbol) {
        summary.failed += 1;
        continue;
      }

      // E1 (R1a slice 2): both series per symbol, resolved on the finest
      // one that reaches the setup's creation — the sweep's own tiering
      // (FR-5), so live grading and the corpus share one physics. A
      // thrown 15-MINUTE fetch fails the setup for THIS run (transient —
      // the next refresh retries): without the resolution series there
      // is nothing to grade on. A thrown 5-MINUTE fetch degrades to the
      // 15-minute tier instead (#362 review, finding 3) — the
      // degradation is per-row-visible via feedback.resolutionIntervalMs,
      // while failing would block grading the coarser series completes
      // alone — and the CAUGHT promise is what enters the cache, so one
      // 5-minute failure cannot poison every later setup on the symbol.
      const fifteenKey = `${providerSymbol}:15min`;
      if (!barsByProviderSymbol.has(fifteenKey)) {
        barsByProviderSymbol.set(
          fifteenKey,
          fetchFmpBars(
            providerSymbol,
            "15min",
            recordAnalyzerEvent,
            fetchWithTimeout,
          ),
        );
      }
      const fiveKey = `${providerSymbol}:5min`;
      if (!barsByProviderSymbol.has(fiveKey)) {
        barsByProviderSymbol.set(
          fiveKey,
          fetchFmpBars(
            providerSymbol,
            "5min",
            recordAnalyzerEvent,
            fetchWithTimeout,
          ).catch(() => []),
        );
      }
      const [fifteenMinute, fiveMinute] = await Promise.all([
        barsByProviderSymbol.get(fifteenKey)!,
        barsByProviderSymbol.get(fiveKey)!,
      ]);
      const resolution = resolutionSeriesFor({
        createdAtMs: new Date(setup.created_at).getTime(),
        fifteenMinute,
        fiveMinute,
      });
      // ONE resolver, one physics. This in-request refresh graded with
      // the cost-free v1 touch-fill model while outcome-sync graded the
      // same rows with the venue's fills — so whether a setup was judged
      // honestly depended on whether its owner opened the app before the
      // hourly cron reached it, and whichever ran first owned the row
      // permanently. Batch 4 wired the options at one call site and
      // missed this one. The interval override rides AFTER the spread so
      // the tier chosen above governs regardless of the bridge's default.
      const evaluation = evaluateSetupOutcome(
        setup,
        resolution.bars,
        Date.now(),
        {
          ...fillOptionsFromRiskModel(setup.risk_model),
          barIntervalMs: resolution.barIntervalMs,
        },
      );
      if (evaluation.state === "pending") {
        summary.pending += 1;
        continue;
      }

      if (evaluation.state === "placed") {
        summary.placed += 1;
        await markSetupStatus(token, userId, setup, "placed");
        await upsertOutcome(token, userId, setup, {
          feedback: evaluation.feedback,
          filledAt: evaluation.filledAt,
          outcome: "pending",
          reviewedAt: new Date().toISOString(),
        });
        continue;
      }

      if (evaluation.outcome === "take_profit") {
        summary.takeProfit += 1;
      } else if (evaluation.outcome === "tp1_partial") {
        summary.tp1Partial += 1;
      } else if (evaluation.outcome === "stop_loss") {
        summary.stopLoss += 1;
      } else if (evaluation.outcome === "ambiguous") {
        summary.ambiguous += 1;
      } else if (evaluation.outcome === "expired_in_profit") {
        summary.expiredInProfit += 1;
      } else if (evaluation.outcome === "expired_at_loss") {
        summary.expiredAtLoss += 1;
      } else {
        summary.expired += 1;
      }

      await markSetupStatus(
        token,
        userId,
        setup,
        evaluation.outcome === "unfilled" ? "expired" : "filled",
      );
      await upsertOutcome(token, userId, setup, {
        exitAt: evaluation.exitAt,
        feedback: evaluation.feedback,
        filledAt: evaluation.filledAt,
        outcome: evaluation.outcome,
        reviewedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("outcome refresh setup failed", setup.id, error);
      summary.failed += 1;
    }
  }

  return summary;
}

// C1: the status this row carried when it was read is part of the filter, so a
// verdict can only advance the row it was computed from. A scan that rewrote
// this setup's levels between the read and here has already put its status back
// to `generated`, and the write then matches nothing — thrown so the caller
// counts the setup as failed instead of stamping a verdict onto geometry that no
// longer exists.
async function markSetupStatus(
  token: string,
  userId: string,
  setup: SetupForOutcome,
  status: "expired" | "filled" | "placed",
) {
  const updatedRows = await adminUpdateRows(
    `trade_setups?id=eq.${encodeURIComponent(setup.id)}&user_id=eq.${
      encodeURIComponent(userId)
    }&status=eq.${encodeURIComponent(setup.status)}`,
    {
      status,
    },
  );

  if (updatedRows.length === 0) {
    throw new Error(
      `status flip to ${status} matched no rows for setup ${setup.id} — it changed after it was read`,
    );
  }
}

async function upsertOutcome(
  token: string,
  userId: string,
  setup: SetupForOutcome,
  outcome: {
    exitAt?: string;
    feedback: Record<string, unknown>;
    filledAt?: string;
    outcome: ResolvedOutcome;
    reviewedAt: string;
  },
) {
  await adminUpsertRows(
    "trade_outcomes",
    {
      analyzer_version: setup.analyzer_version ?? "unversioned",
      exit_at: outcome.exitAt ?? null,
      feedback: {
        ...outcome.feedback,
        confidenceScore: setup.confidence_score,
        side: setup.side,
        symbol: setup.symbol,
      },
      filled_at: outcome.filledAt ?? null,
      outcome: outcome.outcome,
      realized_pnl: null,
      reviewed_at: outcome.reviewedAt,
      setup_id: setup.id,
      user_id: userId,
    },
    "setup_id",
  );
}

// Null for anything the analyzer does not answer — the caller turns that into
// a 400. There is deliberately no default action: the previous fallback made
// every malformed or stale request a single-market review, which is the second
// door §17m.1 ruled out.
function normalizeActionName(action: unknown): AnalyzerAction | null {
  return typeof action === "string" && action in RATE_LIMITS
    ? action as AnalyzerAction
    : null;
}

async function claimAnalyzerRequest(userId: string, action: AnalyzerAction) {
  if (!hasSupabaseAdminConfig()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for analyzer rate limiting.",
    );
  }

  const rows = await adminRpcRows<{
    allowed: boolean;
    limit_count: number;
    request_count: number;
    reset_at: string;
  }>("claim_analyzer_request", {
    p_action: action,
    p_limit: RATE_LIMITS[action],
    p_user_id: userId,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  const result = rows[0];
  if (!result) {
    throw new Error("Analyzer rate limit check returned no result.");
  }

  return {
    allowed: Boolean(result.allowed),
    limit: Number(result.limit_count),
    requestCount: Number(result.request_count),
    resetAt: result.reset_at,
  };
}

type LearningRefreshSummary = {
  reason?: string;
  skipped: boolean;
  throttled?: boolean;
  updated: number;
};

let lastLearningRefreshAt = 0;
let lastLearningRefresh: LearningRefreshSummary = {
  skipped: true,
  updated: 0,
  reason: "Shared scoring weights have not refreshed on this server yet.",
};

async function refreshGlobalStrategyWeightsThrottled(): Promise<
  LearningRefreshSummary
> {
  if (Date.now() - lastLearningRefreshAt < LEARNING_REFRESH_INTERVAL_MS) {
    return { ...lastLearningRefresh, throttled: true };
  }

  lastLearningRefreshAt = Date.now();
  try {
    lastLearningRefresh = await refreshGlobalStrategyWeights();
  } catch (error) {
    console.error("global learning refresh failed", error);
    lastLearningRefresh = {
      skipped: true,
      updated: 0,
      // States only what is known. "the last good weights were used" was the
      // first wording and it is false on a cold start, where the refresh fails
      // before any weights have ever loaded.
      reason: "Shared scoring weights did not refresh on this request.",
    };
  }
  return lastLearningRefresh;
}

async function refreshGlobalStrategyWeights(): Promise<
  LearningRefreshSummary
> {
  if (!hasSupabaseAdminConfig()) {
    // The env var's NAME belongs here and not in `reason`: that string is
    // rendered to the operator in the no-setup panel, and naming a server
    // variable tells a reader who cannot set it about a machine they cannot
    // reach. The detail is not dropped, only moved to where it is actionable.
    console.error(
      "global learning disabled: SUPABASE_SERVICE_ROLE_KEY is not configured",
    );
    return {
      skipped: true,
      updated: 0,
      reason:
        "Shared scoring weights are not configured on this server, so they did not refresh.",
    };
  }

  // EVERY FILLED RESOLUTION, which is four outcomes wider than this query used
  // to be. `expired_in_profit` and `expired_at_loss` are filled trades that
  // banked or lost real money and were excluded outright, because under a win
  // rate they are neither a win nor a loss and there was nowhere to put them.
  // Amendment 39 removes the excuse: where realized R exists it governs, and a
  // review window closing on a position is not an absence of money. Only
  // `unfilled` (no position was ever taken) and `pending` (not resolved) carry
  // none, and neither appears here.
  //
  // `feedback` is pulled whole rather than through a JSON-path select. It
  // carries the resolution's legs, so this is the heavier read — but the table
  // holds zero rows today and a correct query beats an unverified narrower one
  // on a population that does not exist yet. Revisit when a refresh is
  // measurably slow, not before.
  const OUTCOME_LIMIT = 2500;
  const outcomes = await adminFetchRows<{
    feedback: Record<string, unknown> | null;
    outcome: string;
    setup_id: string;
  }>(
    `trade_outcomes?select=setup_id,outcome,feedback&analyzer_version=eq.${
      encodeURIComponent(ANALYZER_VERSION)
    }&outcome=in.(take_profit,tp1_partial,stop_loss,ambiguous,expired_in_profit,expired_at_loss)` +
      `&order=reviewed_at.desc&limit=${OUTCOME_LIMIT}`,
  );
  // A full page means the cohort was TRUNCATED to a recency window nobody
  // declared, and the widened outcome filter admits more rows into the same
  // cap. Said out loud rather than inferred from a suspiciously round number:
  // a mean realized R computed over the most recent 2,500 resolutions is a
  // different measurement from one computed over all of them, and silence
  // here is what would make the two look alike.
  if (outcomes.length === OUTCOME_LIMIT) {
    console.warn(
      `global learning: read the full ${OUTCOME_LIMIT}-row page, so the ` +
        `cohort is the most RECENT resolutions at this analyzer version and ` +
        `not all of them`,
    );
  }
  const setupIds = Array.from(
    new Set(outcomes.map((outcome) => outcome.setup_id).filter(Boolean)),
  );
  if (setupIds.length === 0) {
    return {
      skipped: false,
      updated: 0,
    };
  }

  const rows = await adminFetchRows<{
    confluence: Record<string, unknown> | null;
    correlation_group: string | null;
    id: string;
    symbol: string;
  }>(
    // Every origin trains the cohort (spec §17m: "every qualifying setup the
    // Scan column generates persists to history/Insights/the cohort").
    //
    // This query used to filter the setups down to review origin, from a
    // build where a scan
    // was background research running alongside deliberate single-market
    // reviews. §17m.1 deleted the stage's Review button and made the Scan
    // column the only door, so that filter would have left global learning
    // with no eligible rows at all on desktop — permanently frozen weights
    // dressed up as a working model. Nothing about the signal changed: these
    // are measured outcomes (take_profit / tp1_partial / stop_loss /
    // ambiguous) resolved by the same replay engine from the same live bars,
    // whichever door asked for the setup.
    //
    // ANALYZER_VERSION moved with this change: widening the training
    // population is a change in how the analyzer learns,
    // and the version is what scopes global learning — so the boundary between
    // the review-origin-only cohort and this one is explicit in the data rather
    // than implied by a deploy date. Setup construction itself is untouched.
    `trade_setups?select=id,symbol,correlation_group,confluence&id=in.(${
      setupIds.map((id) => encodeURIComponent(id)).join(",")
    })`,
  );
  const setupsById = new Map(rows.map((row) => [row.id, row]));
  // Joined to its cohort here; folded in `learning.ts`, which is pure and
  // therefore testable without a database.
  const grouped = accumulateLearningStats(
    outcomes.flatMap((outcomeRow) => {
      const row = setupsById.get(outcomeRow.setup_id);
      if (!row) return [];
      return [{
        netRealizedR:
          (outcomeRow.feedback as { netRealizedR?: unknown } | null)
            ?.netRealizedR,
        outcome: outcomeRow.outcome,
        setupKey: extractSetupKey(
          row.confluence,
          row.correlation_group,
          row.symbol,
        ),
      }];
    }),
  );

  const payloads = Array.from(grouped.entries()).map(([setupKey, stats]) => {
    const learningWeight = calculateLearningWeight(stats);

    return {
      ambiguous: stats.ambiguous,
      analyzer_version: ANALYZER_VERSION,
      confidence_adjustment: roundPrice(learningWeight.confidenceAdjustment),
      // BOTH the point estimate and the bound the score was derived from. A
      // row carrying only the adjustment cannot be audited: +1.8 could be a
      // strong cohort heavily discounted or a modest one barely discounted,
      // and those want different responses from a reader.
      conservative_mean_r: learningWeight.conservativeMeanR,
      last_reviewed_at: new Date().toISOString(),
      losses: stats.losses,
      mean_realized_r: learningWeight.meanRealizedR,
      realized_r_count: learningWeight.realizedRCount,
      sample_weight: roundPrice(learningWeight.sampleWeight),
      setup_key: setupKey,
      total_setups: stats.total,
      wins: stats.wins,
    };
  });

  if (payloads.length > 0) {
    // A ZERO IS NOW A MEASUREMENT, NOT A REFUSAL, and the log has to say which.
    // Until D1 every adjustment here was 0 by design and this line named the
    // withholding. Now a 0 means the cohort's mean realized R does not clear
    // its own 95% error bar — which for a marginal cohort is the correct and
    // possibly permanent answer. Counting the two states apart is what keeps a
    // column of zeroes from reading as a broken model.
    const scored = payloads.filter((row) => row.confidence_adjustment !== 0);
    console.log(
      `global learning: ${payloads.length} keys updated, ${scored.length} ` +
        `scored on mean realized R, ${payloads.length - scored.length} at 0 ` +
        `(mean not distinguishable from zero at ${CONFIDENCE_Z} SE)`,
    );
    await adminUpsertRows("strategy_weightings_global", payloads, "setup_key");
  }

  return {
    skipped: false,
    updated: payloads.length,
  };
}

function extractSetupKey(
  confluence: Record<string, unknown> | null,
  correlationGroup: string | null,
  symbol: string,
) {
  return typeof confluence?.setupKey === "string" && confluence.setupKey.trim()
    ? confluence.setupKey
    : correlationGroup || symbol;
}

/**
 * Does the calendar hold ANY event scheduled after now — the watchdog's own
 * coverage question (migration 20260729040000).
 *
 * MEMOISED, because the answer is a fact about the TABLE and not about the
 * symbol. fetchRelevantNews runs once per market, so a 15-market scan asked
 * this identical question fifteen times: fifteen round trips against the same
 * row, on a function with a 2s CPU budget that has already been exceeded in
 * production once (scanBatching.ts's header records it).
 *
 * The TTL is short because the failure it guards against is an ingest that
 * stopped, which is measured in hours, not seconds. Same shape as
 * lastLearningRefresh above: a module-scoped value with an explicit age.
 */
const CALENDAR_COVERAGE_TTL_MS = 60_000;
let calendarCoverage: { at: number; hasFuture: boolean } | null = null;

async function calendarHasFutureEvents(
  token: string,
  nowIso: string,
): Promise<boolean> {
  const now = Date.now();
  if (calendarCoverage && now - calendarCoverage.at < CALENDAR_COVERAGE_TTL_MS) {
    return calendarCoverage.hasFuture;
  }
  // FILTERED TO THE POPULATION THE CHECK READS, which the first version was not.
  // The window query reads `impact=in.(medium,high)`; this probe read the whole
  // table, so a single future-dated LOW-impact row — an earnings entry, say —
  // answered "covered" while the economic-calendar feed itself was dead. Any
  // live sibling feed masked the one that had stopped.
  //
  // This is where it departs from the watchdog deliberately, and calling the
  // two questions the same was the error. The watchdog asks whether the TABLE
  // is being fed; a review needs to know whether the rows IT READS are being
  // fed. A coverage probe over a wider population than the thing it certifies
  // can only ever be optimistic.
  const future = await fetchRows<{ id: string }>(
    token,
    `economic_events?select=id&impact=in.(medium,high)&scheduled_at=gt.${
      encodeURIComponent(nowIso)
    }&limit=1`,
  );
  calendarCoverage = { at: now, hasFuture: future.length > 0 };
  return calendarCoverage.hasFuture;
}

async function fetchRelevantNews(token: string, symbol: SupportedSymbol) {
  const now = Date.now();
  const window = newsWindow(now);
  // TWO READS, and the second is the one that makes the first interpretable.
  // A window query returning zero rows is byte-identical whether the calendar
  // is clear or the ingest is dead — and the dead case has happened in
  // production (migration 20260729040000's header). The coverage probe asks the
  // watchdog's own question, `any event scheduled after now`, so the analyzer
  // and the watchdog cannot drift on what stale means.
  let rows: NewsEvent[] | null = null;
  let hasFutureEvents = false;
  try {
    rows = await fetchRows<NewsEvent>(
      token,
      `economic_events?select=provider,currency,event_name,event_type,impact,scheduled_at,symbol,url&impact=in.(medium,high)&scheduled_at=gte.${
        encodeURIComponent(window.headlineStart)
      }&scheduled_at=lte.${encodeURIComponent(window.upcomingEnd)}`,
    );
    hasFutureEvents = await calendarHasFutureEvents(token, window.now);
  } catch (error) {
    console.error("economic calendar read failed", error);
    rows = null;
  }

  return buildNewsContext({ hasFutureEvents, nowMs: now, rows, symbol });
}



function buildSetupKey(
  symbol: SupportedSymbol,
  market: MarketContext,
  sessionContext: SessionContext,
  regime: Regime,
  side: Side,
  votes: StrategyVote[],
) {
  const leaders = votes
    .filter((vote) => vote.direction === side)
    .sort((first, second) => second.score - first.score)
    .slice(0, 3)
    .map((vote) => vote.name)
    .join("+");
  const context = [
    getAssetType(symbol),
    market.primaryTimeframe,
    sessionContext.marketKind,
    regime.name,
    side,
    leaders || "balanced",
  ].join("_");
  return context.replace(/[^a-zA-Z0-9_+.-]/g, "_");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asExecutionQuality(value: unknown): ExecutionQuality | null {
  const record = asRecord(value);
  return typeof record.label === "string" && typeof record.score === "number"
    ? record as unknown as ExecutionQuality
    : null;
}

function formatTitle(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}
