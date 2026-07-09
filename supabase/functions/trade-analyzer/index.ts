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
  resolveProviderSymbols,
} from "./symbols.ts";
import { buildPricePlan } from "./pricePlan.ts";
import {
  fetchFirstAvailableMarketContext,
  fetchFmpBars,
  type ProviderContextResult,
} from "./marketLoader.ts";
import { corsHeaders, getBearerToken, jsonResponse } from "./http.ts";
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
const ANALYZER_VERSION = "2026.07.02.fmp-ultimate-market-expansion";
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMITS: Record<string, number> = {
  generate_setup: 24,
  refresh_outcomes: 12,
  scan_opportunities: 8,
};
type AnalyzeRequest = {
  action?: "analyze" | "refresh_outcomes" | "scan_opportunities";
  symbols?: string[];
  symbol?: string;
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
};

type SetupForOutcome = ExistingSetupRow & {
  risk_model: Record<string, unknown> | null;
};

type OutcomeRefreshSummary = {
  ambiguous: number;
  expired: number;
  failed: number;
  pending: number;
  placed: number;
  reviewed: number;
  stopLoss: number;
  takeProfit: number;
};

type UpsertedSetupResult = {
  deduplicated: boolean;
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
};

type ReviewActionName = "generate_setup" | "scan_opportunities";
type ReviewedSetup = NonNullable<Awaited<ReturnType<typeof analyzeSetup>>>;
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

    const actionName = normalizeActionName(body.action);
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

    if (body.action === "refresh_outcomes") {
      const outcomeRefresh = await refreshUserOutcomes(token, user.id);
      const learningRefresh = await refreshGlobalStrategyWeights();
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

    if (body.action === "scan_opportunities") {
      const learningRefresh = await refreshGlobalStrategyWeights();
      const scan = await scanOpportunities(token, user.id, body.symbols);
      await recordAnalyzerEvent({
        action: "scan_opportunities",
        metadata: {
          blocked: scan.blocked.length,
          opportunities: scan.opportunities.length,
          scanned: scan.scanned,
        },
        status: "success",
        userId: user.id,
      });
      return jsonResponse(req, {
        advisoryOnly: true,
        learningRefresh,
        ...scan,
      });
    }

    const requestedSymbol =
      typeof body.symbol === "string" && body.symbol.trim()
        ? body.symbol.trim()
        : "EURUSD";
    const uiSymbol = normalizeSymbol(requestedSymbol);
    const symbol = uiSymbol as SupportedSymbol;
    const outcomeRefresh = await refreshUserOutcomes(token, user.id, {
      limit: 24,
      symbols: [symbol],
    });
    const learningRefresh = await refreshGlobalStrategyWeights();

    const review = await reviewCurrentMarket(
      token,
      user.id,
      symbol,
      "generate_setup",
    );
    if (review.blocked) {
      await invalidateActiveSetupsForSymbol(
        token,
        user.id,
        symbol,
        review.reason,
      );
      return jsonResponse(
        req,
        {
          analysisDiagnostics: review.analysisDiagnostics,
          blocked: true,
          correlationGroup: review.correlationGroup,
          learningRefresh,
          newsEvents: review.newsEvents,
          outcomeRefresh,
          providerWarnings: review.providerWarnings,
          reason: review.reason,
        },
        review.statusCode,
      );
    }

    const savedSetup = await upsertActiveSetup(
      token,
      user.id,
      symbol,
      review.fmpSymbol,
      review.correlationGroup,
      review.setup,
      review.newsContext,
    );

    await recordAnalyzerEvent({
      action: "generate_setup",
      metadata: {
        confidenceScore: review.setup.confidenceScore,
        deduplicated: savedSetup.deduplicated,
        rewardRisk: review.setup.confluence.rewardRisk,
        side: review.setup.side,
        setupId: savedSetup.setupId,
        updated: savedSetup.updated,
      },
      providerSymbol: review.fmpSymbol,
      status: "success",
      symbol,
      userId: user.id,
    });

    return jsonResponse(req, {
      advisoryOnly: true,
      deduplicated: savedSetup.deduplicated,
      message: savedSetup.updated
        ? "Updated the current setup without creating a duplicate entry."
        : "Built a current limit setup. LevelFlow does not place trades.",
      learningRefresh,
      outcomeRefresh,
      setupId: savedSetup.setupId,
      setup: review.setup,
      updated: savedSetup.updated,
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
            !isTemporarilyUnavailableSymbol(symbol),
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

  for (const result of results) {
    if (result.opportunity) {
      opportunities.push(result.opportunity);
    }
    if (result.blocked) {
      blocked.push(result.blocked);
    }
  }
  const ranked = collapseRelatedMarketOpportunities(opportunities);
  blocked.push(...ranked.blocked);

  return {
    blocked,
    opportunities: ranked.opportunities.sort((first, second) =>
      (second.confidenceScore ?? 0) - (first.confidenceScore ?? 0)
    ),
    scanned: normalizedSymbols.length,
  };
}

async function reviewCurrentMarket(
  token: string,
  userId: string,
  symbol: SupportedSymbol,
  action: ReviewActionName,
): Promise<CurrentMarketReview> {
  const eventStatus = action === "generate_setup" ? "blocked" : "scan_failure";
  const normalizedSymbol = normalizeSymbol(symbol) as SupportedSymbol;

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
        "This market group is temporarily unavailable while LevelFlow verifies chart coverage.",
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
      reason: "Unsupported LevelFlow market symbol.",
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
      message: action === "generate_setup"
        ? "No current limit setup met review threshold"
        : "No current limit setup met scan threshold",
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
      message: action === "generate_setup"
        ? "Correlation filter kept stronger active setup"
        : "Correlation filter skipped scan candidate",
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
}> {
  try {
    const review = await reviewCurrentMarket(
      token,
      userId,
      symbol,
      "scan_opportunities",
    );
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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    }),
  );

  return results;
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
    sessionPenalty: sessionContext.penalty,
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
  const breakevenTriggerPrice = consensus.side === "buy"
    ? pricePlan.entryPrice +
      Math.abs(pricePlan.takeProfit - pricePlan.entryPrice) * 0.5
    : pricePlan.entryPrice -
      Math.abs(pricePlan.takeProfit - pricePlan.entryPrice) * 0.5;

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
        "LevelFlow records directional market setups only; position sizing should be handled in the trader's execution platform.",
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
      reviewWindowExpiresAt: expiresAt,
      stopLogic: pricePlan.stopLogic,
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
      sessionPenalty: sessionContext.penalty,
      newsPenaltyUnits: newsContext.penaltyUnits,
      weightAdjustment,
    });
    const confidenceScore = scoreBreakdown.confidenceScore;

    diagnostics.push(
      `The current ${consensus.side} setup scored ${confidenceScore}; LevelFlow requires ${calibration.confidenceThreshold} or higher for this market.`,
    );
    if (!pricePlan) {
      diagnostics.push(
        "Limit entry failed price validation, so no limit setup was shown.",
      );
    } else if (pricePlan.rewardRisk < calibration.minRewardRisk) {
      diagnostics.push(
        `Payoff was ${
          pricePlan.rewardRisk.toFixed(2)
        }x; LevelFlow requires at least ${
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
    `trade_setups?select=id,symbol,provider_symbol,side,limit_entry,stop_loss,take_profit,breakeven_trigger_price,confidence_score,analyzer_version,confluence,correlation_group,status,created_at&user_id=eq.${
      encodeURIComponent(userId)
    }&symbol=eq.${
      encodeURIComponent(
        symbol,
      )
    }&status=in.(generated,placed)&order=created_at.desc&limit=1`,
  );
  const activeSetup = rows[0] ?? null;
  const expiresAt = setup.expiresAt;

  if (activeSetup && activeSetup.side === setup.side) {
    await updateRows(
      token,
      `trade_setups?id=eq.${encodeURIComponent(activeSetup.id)}&user_id=eq.${
        encodeURIComponent(userId)
      }`,
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
        risk_model: setup.riskModel,
        side: setup.side,
        status: "generated",
        stop_loss: setup.stopLoss,
        take_profit: setup.takeProfit,
      },
    );

    return {
      deduplicated: true,
      setupId: activeSetup.id,
      updated: true,
    };
  }

  if (activeSetup) {
    await invalidateActiveSetupsForSymbol(
      token,
      userId,
      symbol,
      "A newer analysis produced a different current setup.",
    );
  }

  const tradeSetup = await insertSingle(token, "trade_setups", {
    user_id: userId,
    symbol,
    provider_symbol: fmpSymbol,
    side: setup.side,
    limit_entry: setup.entryPrice,
    stop_loss: setup.stopLoss,
    take_profit: setup.takeProfit,
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
    status: "generated",
  });

  return {
    deduplicated: false,
    setupId: tradeSetup.id,
    updated: false,
  };
}

async function invalidateActiveSetupsForSymbol(
  token: string,
  userId: string,
  symbol: SupportedSymbol,
  reason: string,
) {
  await updateRows(
    token,
    `trade_setups?user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${
      encodeURIComponent(symbol)
    }&status=in.(generated,placed)`,
    {
      status: "invalidated",
    },
  );
}

async function refreshUserOutcomes(
  token: string,
  userId: string,
  options: { limit?: number; symbols?: SupportedSymbol[] } = {},
): Promise<OutcomeRefreshSummary> {
  const summary: OutcomeRefreshSummary = {
    ambiguous: 0,
    expired: 0,
    failed: 0,
    pending: 0,
    placed: 0,
    reviewed: 0,
    stopLoss: 0,
    takeProfit: 0,
  };
  const symbolFilter = options.symbols && options.symbols.length > 0
    ? `&symbol=in.(${
      options.symbols.map((symbol) => encodeURIComponent(symbol)).join(",")
    })`
    : "";
  const limit = Math.max(1, Math.min(options.limit ?? 120, 120));
  const setups = await fetchRows<SetupForOutcome>(
    token,
    `trade_setups?select=id,symbol,provider_symbol,side,limit_entry,stop_loss,take_profit,breakeven_trigger_price,confidence_score,analyzer_version,confluence,risk_model,correlation_group,status,created_at&user_id=eq.${
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
      } else if (evaluation.outcome === "stop_loss") {
        summary.stopLoss += 1;
      } else if (evaluation.outcome === "ambiguous") {
        summary.ambiguous += 1;
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
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}

async function markSetupStatus(
  token: string,
  userId: string,
  setup: SetupForOutcome,
  status: "expired" | "filled" | "placed",
) {
  await updateRows(
    token,
    `trade_setups?id=eq.${encodeURIComponent(setup.id)}&user_id=eq.${
      encodeURIComponent(userId)
    }`,
    {
      status,
    },
  );
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
      analyzer_version: setup.analyzer_version ?? ANALYZER_VERSION,
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

function normalizeActionName(action: unknown) {
  return typeof action === "string" && action in RATE_LIMITS
    ? action
    : "generate_setup";
}

async function claimAnalyzerRequest(userId: string, action: string) {
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
    p_limit: RATE_LIMITS[action] ?? RATE_LIMITS.generate_setup,
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

async function refreshGlobalStrategyWeights() {
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
    }&outcome=in.(take_profit,stop_loss,ambiguous)&order=reviewed_at.desc&limit=2500`,
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
      outcome !== "take_profit" && outcome !== "stop_loss" &&
      outcome !== "ambiguous"
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
    if (outcome === "take_profit") {
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
  const headlineStart = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const activeStart = new Date(now - 10 * 60 * 1000).toISOString();
  const activeEnd = new Date(now + 20 * 60 * 1000).toISOString();
  const upcomingEnd = new Date(now + 6 * 60 * 60 * 1000).toISOString();
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

function isBlockingNewsEvent(event: NewsEvent) {
  return event.event_type !== "headline" && event.impact === "high";
}

function calculateNewsPenaltyUnits(active: NewsEvent[], upcoming: NewsEvent[]) {
  const nonBlockingActive = active.filter((event) =>
    !isBlockingNewsEvent(event)
  );
  const weightedEvents = [...nonBlockingActive, ...upcoming];

  return weightedEvents.reduce((sum, event) => {
    if (event.event_type === "headline") {
      return sum + (event.impact === "high" ? 0.5 : 0.25);
    }
    return sum + (event.impact === "high" ? 1 : 0.5);
  }, 0);
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
