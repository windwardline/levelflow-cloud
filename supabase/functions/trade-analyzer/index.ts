import { getAssetType, getCategoryCalibration } from "./calibration.ts";
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
  getSetupExpiryTime,
  type ResolvedOutcome,
} from "./replay.ts";
import { type ExecutionQuality } from "./executionQuality.ts";
import { calculateLearningWeight } from "./learning.ts";
import {
  calculateMacroRateAdjustment,
  fetchMacroRateContext,
  type MacroRateContext,
} from "./macroContext.ts";
import { scoreSetupConfidence } from "./scoring.ts";
import { getSessionContext, type SessionContext } from "./sessions.ts";
import {
  defaultScanSymbols,
  getCorrelationGroup,
  getRelatedSymbols,
  isCurrencyRelevantForSymbol,
  isEquityCalendarSensitiveSymbol,
  isHeadlineNewsRelevantForSymbol,
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
  persistScannedOpportunities,
  type ScanWriteOutcome,
} from "./scanPersistence.ts";
import {
  fetchFirstAvailableMarketContext,
  fetchFmpBars,
} from "./marketLoader.ts";
import { corsHeaders, getBearerToken, jsonResponse } from "../_shared/http.ts";
import {
  calculateNewsPenaltyUnits,
  isBlockingNewsEvent,
  NEWS_ACTIVE_AFTER_MS,
  NEWS_ACTIVE_BEFORE_MS,
  NEWS_UPCOMING_HORIZON_MS,
} from "./newsRules.ts";
import { recordAnalyzerEvent, recordMarketDataHealth } from "./telemetry.ts";
import {
  adminFetchRows,
  adminRpcRows,
  adminUpsertRows,
  fetchRows,
  fetchSingle,
  fetchWithTimeout,
  getAuthenticatedUser,
  hasSupabaseAdminConfig,
  hasSupabaseRuntimeConfig,
  insertSingle,
  updateRows,
  upsertRows,
} from "./supabaseRest.ts";

const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const ANALYZER_VERSION = "2026.08.01.one-door-guarded";
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
  scan_opportunities: 8,
} as const;
type AnalyzerAction = keyof typeof RATE_LIMITS;
type AnalyzeRequest = {
  action?: AnalyzerAction;
  symbols?: string[];
};

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
  headlineCount: number;
  penaltyUnits: number;
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
        metadata: { outcomeRefresh, learningRefresh },
        status: "success",
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
    const learningRefresh = await refreshGlobalStrategyWeightsThrottled();
    const scan = await scanOpportunities(token, user.id, body.symbols);
    await recordAnalyzerEvent({
      action: "scan_opportunities",
      metadata: {
        blocked: scan.blocked.length,
        opportunities: scan.opportunities.length,
        // The persistence contract, in the record of the request itself:
        // a scan that showed setups and wrote none is now legible in
        // analyzer_events rather than only in a console (spec §17m.2).
        persistence: scan.persistence,
        scanned: scan.scanned,
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

async function scanOpportunities(
  token: string,
  userId: string,
  requestedSymbols: string[] | undefined,
) {
  const normalizedSymbols = Array.from(
    new Set(
      (requestedSymbols && requestedSymbols.length > 0
        ? requestedSymbols
        : defaultScanSymbols).map((symbol) => normalizeSymbol(symbol)).filter(
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

  const newsContext = await fetchRelevantNews(token, normalizedSymbol);
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

  const { fmpSymbol, marketContext, providerFailures } =
    await fetchFirstAvailableMarketContext(
      providerSymbols,
      recordAnalyzerEvent,
      fetchWithTimeout,
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
      reason: "FMP did not return enough bars for this instrument.",
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

  const macroRateContext = await fetchMacroRateContext(fetchWithTimeout);
  const correlationGroup = getCorrelationGroup(normalizedSymbol);
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
  );
  if (!setup) {
    const analysisDiagnostics = await explainNoSetup(
      token,
      normalizedSymbol,
      marketContext,
      newsContext,
      macroRateContext,
      sessionContext,
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
    return {
      analysisDiagnostics,
      blocked: true,
      providerWarnings: marketContext.providerWarnings,
      reason: "No current limit setup met the review threshold.",
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
          reason: review.reason,
          symbol,
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

function collapseRelatedMarketOpportunities(
  opportunities: MarketScanCandidate[],
) {
  const grouped = new Map<string, MarketScanCandidate[]>();
  const blocked: MarketScanCandidate[] = [];

  for (const candidate of opportunities) {
    const group = candidate.correlationGroup ?? candidate.symbol;
    grouped.set(group, [...(grouped.get(group) ?? []), candidate]);
  }

  const winners: MarketScanCandidate[] = [];
  for (const candidates of grouped.values()) {
    const sorted = [...candidates].sort((first, second) =>
      compareScanCandidates(second, first)
    );
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

function compareScanCandidates(
  first: MarketScanCandidate,
  second: MarketScanCandidate,
) {
  const confidenceDifference = (first.confidenceScore ?? 0) -
    (second.confidenceScore ?? 0);
  if (confidenceDifference !== 0) {
    return confidenceDifference;
  }

  const rewardDifference = (first.rewardRisk ?? 0) - (second.rewardRisk ?? 0);
  if (rewardDifference !== 0) {
    return rewardDifference;
  }

  const executionDifference = (first.executionScore ?? 0) -
    (second.executionScore ?? 0);
  if (executionDifference !== 0) {
    return executionDifference;
  }

  return second.symbol.localeCompare(first.symbol);
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
  group: string,
  symbol: SupportedSymbol,
  confidenceScore: number,
) {
  const rows = await fetchRows<
    { id: string; symbol: string; confidence_score: number }
  >(
    token,
    `trade_setups?select=id,symbol,confidence_score&user_id=eq.${
      encodeURIComponent(userId)
    }&correlation_group=eq.${
      encodeURIComponent(group)
    }&status=in.(generated,placed)&created_at=gte.${
      encodeURIComponent(
        new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      )
    }`,
  );

  return rows.find((row) =>
    row.symbol !== symbol && Number(row.confidence_score) >= confidenceScore
  ) ?? null;
}

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
) {
  const calibration = getCategoryCalibration(symbol);
  const regime = classifyRegime(market);
  if (calibration.blockedRegimes?.includes(regime.name)) {
    return null;
  }
  const votes = runStrategyCommittee(symbol, market, regime);
  const consensus = scoreConsensus(votes, regime);
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
    `strategy_weightings_global?select=confidence_adjustment,sample_weight,total_setups&setup_key=eq.${
      encodeURIComponent(setupKey)
    }&limit=1`,
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
    pricePlan.rewardRisk < calibration.minRewardRisk
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
        headlineEvents: newsContext.headlineCount,
        penaltyUnits: Number(newsContext.penaltyUnits.toFixed(2)),
        upcomingEvents: newsContext.upcoming.length,
      },
      orderConstruction: {
        contractSpec: pricePlan.contractSpec,
        futuresTickAdjustments: pricePlan.futuresTickAdjustments,
        orderType: "limit",
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
) {
  const calibration = getCategoryCalibration(symbol);
  const regime = classifyRegime(market);
  const votes = runStrategyCommittee(symbol, market, regime);
  const consensus = scoreConsensus(votes, regime);
  const diagnostics: string[] = [];

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
      `strategy_weightings_global?select=confidence_adjustment&setup_key=eq.${
        encodeURIComponent(setupKey)
      }&limit=1`,
    );
    const weightAdjustment = Number(weight?.confidence_adjustment ?? 0);
    const pricePlan = buildPricePlan(
      consensus.side,
      symbol,
      market,
      regime,
      calibration,
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

    diagnostics.push(
      `The current ${consensus.side} setup scored ${confidenceScore}; Levelflow requires ${calibration.confidenceThreshold} or higher for this market.`,
    );
    if (!pricePlan) {
      diagnostics.push(
        "Limit entry failed price validation, so no limit setup was shown.",
      );
    } else if (pricePlan.rewardRisk < calibration.minRewardRisk) {
      diagnostics.push(
        `Payoff was ${
          pricePlan.rewardRisk.toFixed(2)
        }x; Levelflow requires at least ${
          calibration.minRewardRisk.toFixed(2)
        }x for this market.`,
      );
    } else if (pricePlan.executionQuality.confidencePenalty > 0) {
      diagnostics.push(
        `Estimated spread and slippage reduced the setup score by ${pricePlan.executionQuality.confidencePenalty}.`,
      );
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
    const updatedRows = await updateRows(
      token,
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

  const tradeSetup = await insertSingle(token, "trade_setups", {
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
  const invalidatedRows = await updateRows(
    token,
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

      if (!barsByProviderSymbol.has(providerSymbol)) {
        barsByProviderSymbol.set(
          providerSymbol,
          fetchFmpBars(
            providerSymbol,
            "15min",
            recordAnalyzerEvent,
            fetchWithTimeout,
          ),
        );
      }
      const bars = await barsByProviderSymbol.get(providerSymbol)!;
      const evaluation = evaluateSetupOutcome(setup, bars);
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
  const updatedRows = await updateRows(
    token,
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
  await upsertRows(
    token,
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
  reason: "Global learning has not refreshed in this instance yet.",
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
      reason: "Global learning refresh failed; see function logs.",
    };
  }
  return lastLearningRefresh;
}

async function refreshGlobalStrategyWeights(): Promise<
  LearningRefreshSummary
> {
  if (!hasSupabaseAdminConfig()) {
    return {
      skipped: true,
      updated: 0,
      reason:
        "SUPABASE_SERVICE_ROLE_KEY is not configured for global learning updates.",
    };
  }

  const outcomes = await adminFetchRows<{ outcome: string; setup_id: string }>(
    `trade_outcomes?select=setup_id,outcome&analyzer_version=eq.${
      encodeURIComponent(ANALYZER_VERSION)
    }&outcome=in.(take_profit,tp1_partial,stop_loss,ambiguous)&order=reviewed_at.desc&limit=2500`,
  );
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
    // ANALYZER_VERSION moved with this change (2026.08.01.scan-only-door,
    // widening the training population is a change in how the analyzer learns,
    // and the version is what scopes global learning — so the boundary between
    // the review-origin-only cohort and this one is explicit in the data rather
    // than implied by a deploy date. Setup construction itself is untouched.
    `trade_setups?select=id,symbol,correlation_group,confluence&id=in.(${
      setupIds.map((id) => encodeURIComponent(id)).join(",")
    })`,
  );
  const setupsById = new Map(rows.map((row) => [row.id, row]));
  const grouped = new Map<
    string,
    { ambiguous: number; losses: number; total: number; wins: number }
  >();

  for (const outcomeRow of outcomes) {
    const row = setupsById.get(outcomeRow.setup_id);
    if (!row) {
      continue;
    }
    const outcome = outcomeRow.outcome;
    if (
      outcome !== "take_profit" && outcome !== "tp1_partial" &&
      outcome !== "stop_loss" && outcome !== "ambiguous"
    ) {
      continue;
    }
    const setupKey = extractSetupKey(
      row.confluence,
      row.correlation_group,
      row.symbol,
    );
    const current = grouped.get(setupKey) ??
      { ambiguous: 0, losses: 0, total: 0, wins: 0 };
    current.total += 1;
    if (outcome === "take_profit" || outcome === "tp1_partial") {
      current.wins += 1;
    } else if (outcome === "stop_loss") {
      current.losses += 1;
    } else {
      current.ambiguous += 1;
    }
    grouped.set(setupKey, current);
  }

  const payloads = Array.from(grouped.entries()).map(([setupKey, stats]) => {
    const learningWeight = calculateLearningWeight(stats);

    return {
      ambiguous: stats.ambiguous,
      analyzer_version: ANALYZER_VERSION,
      confidence_adjustment: roundPrice(learningWeight.confidenceAdjustment),
      last_reviewed_at: new Date().toISOString(),
      losses: stats.losses,
      sample_weight: roundPrice(learningWeight.sampleWeight),
      setup_key: setupKey,
      total_setups: stats.total,
      wins: stats.wins,
    };
  });

  if (payloads.length > 0) {
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

async function fetchRelevantNews(token: string, symbol: SupportedSymbol) {
  const now = Date.now();
  const headlineStart = new Date(now - NEWS_UPCOMING_HORIZON_MS).toISOString();
  const activeStart = new Date(now - NEWS_ACTIVE_BEFORE_MS).toISOString();
  const activeEnd = new Date(now + NEWS_ACTIVE_AFTER_MS).toISOString();
  const upcomingEnd = new Date(now + NEWS_UPCOMING_HORIZON_MS).toISOString();
  const rows = await fetchRows<NewsEvent>(
    token,
    `economic_events?select=provider,currency,event_name,event_type,impact,scheduled_at,symbol,url&impact=in.(medium,high)&scheduled_at=gte.${
      encodeURIComponent(headlineStart)
    }&scheduled_at=lte.${encodeURIComponent(upcomingEnd)}`,
  );
  const relevant = rows.filter((event) => isNewsRelevant(symbol, event));
  const active = relevant.filter((event) =>
    event.event_type !== "headline" &&
    typeof event.scheduled_at === "string" &&
    event.scheduled_at >= activeStart && event.scheduled_at <= activeEnd
  );
  const blocking = active.filter(isBlockingNewsEvent);
  const upcoming = relevant.filter((event) =>
    typeof event.scheduled_at === "string" &&
    (event.event_type === "headline"
      ? event.scheduled_at >= headlineStart &&
        event.scheduled_at <= new Date(now).toISOString()
      : event.scheduled_at > activeEnd && event.scheduled_at <= upcomingEnd)
  );

  return {
    active,
    blocking,
    headlineCount: upcoming.filter((event) => event.event_type === "headline")
      .length,
    penaltyUnits: calculateNewsPenaltyUnits(active, upcoming),
    upcoming,
  };
}

function isNewsRelevant(symbol: SupportedSymbol, event: NewsEvent) {
  if (event.symbol) {
    return isHeadlineNewsRelevantForSymbol(symbol, event.symbol);
  }
  if (event.provider === "fmp_earnings") {
    return isEquityCalendarSensitiveSymbol(symbol);
  }

  const currency = event.currency?.toUpperCase();
  if (!currency) {
    return true;
  }
  return isCurrencyRelevantForSymbol(symbol, currency);
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
