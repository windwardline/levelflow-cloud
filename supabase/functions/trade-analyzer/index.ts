import {
  type CategoryCalibration,
  getAssetType,
  getCategoryCalibration,
} from "./calibration.ts";
import { averageTrueRange, findStructureLevels } from "./indicators.ts";
import {
  classifyRegime,
  runStrategyCommittee,
  scoreConsensus,
} from "./strategies.ts";
import {
  type Bar,
  intradayTimeframes,
  type MarketContext,
  type Regime,
  type Side,
  type StrategyVote,
  type SupportedSymbol,
  type Timeframe,
} from "./types.ts";
import {
  evaluateSetupOutcome,
  getSetupExpiryTime,
  type ResolvedOutcome,
} from "./replay.ts";
import {
  estimateExecutionQuality,
  type ExecutionQuality,
} from "./executionQuality.ts";
import { calculateLearningWeight } from "./learning.ts";
import { parseFmpQuoteSnapshot, type QuoteSnapshot } from "./quotes.ts";
import { applyFuturesTickRules } from "./futures.ts";
import { getSessionContext, type SessionContext } from "./sessions.ts";
import {
  defaultScanSymbols,
  getCorrelationGroup,
  getRelatedSymbols,
  isCurrencyRelevantForSymbol,
  isEquityCalendarSensitiveSymbol,
  isKnownSymbol,
  isTemporarilyUnavailableSymbol,
  resolveProviderSymbols,
} from "./symbols.ts";

const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ??
  "https://financialmodelingprep.com/stable";
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANALYZER_VERSION = "2026.06.28.category-strategy-profiles";
const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ??
  "https://levelflow.windwardline.com,https://windwardline.github.io,http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMITS: Record<string, number> = {
  generate_setup: 24,
  refresh_outcomes: 12,
  scan_opportunities: 8,
};
const SUPABASE_FETCH_TIMEOUT_MS = 8_000;
const MARKET_DATA_FETCH_TIMEOUT_MS = 12_000;
const QUOTE_FETCH_TIMEOUT_MS = 6_000;
const CANDLE_CACHE_TTL_MS: Record<Timeframe, number> = {
  "15min": 45_000,
  "1hour": 90_000,
  "4hour": 180_000,
  "1day": 10 * 60_000,
};
const SLOW_PROVIDER_CALL_MS = 2_500;
const candleCache = new Map<string, { bars: Bar[]; expiresAt: number }>();

type AnalyzeRequest = {
  action?: "analyze" | "refresh_outcomes" | "scan_opportunities";
  symbols?: string[];
  symbol?: string;
};

type FmpBar = {
  close?: number;
  date?: string;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
};

type NewsEvent = {
  currency?: string;
  event_name?: string;
  impact?: string;
  provider?: string;
  scheduled_at?: string;
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

type ProviderContextResult = {
  fmpSymbol: string | null;
  marketContext: MarketContext | null;
  providerFailures: string[];
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

type AnalyzerEventStatus =
  | "blocked"
  | "cache_hit"
  | "error"
  | "scan_failure"
  | "slow_provider"
  | "success";

type AnalyzerEventPayload = {
  action: string;
  assetType?: string | null;
  cacheHit?: boolean | null;
  durationMs?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
  providerSymbol?: string | null;
  status: AnalyzerEventStatus;
  symbol?: string | null;
  userId?: string | null;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method not allowed" }, 405);
    }

    if (!FMP_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
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
    if (isTemporarilyUnavailableSymbol(uiSymbol)) {
      await recordAnalyzerEvent({
        action: "generate_setup",
        message: "Temporarily unavailable market group",
        status: "blocked",
        symbol: uiSymbol,
        userId: user.id,
      });
      return jsonResponse(req, {
        blocked: true,
        reason:
          "This market group is temporarily unavailable while LevelFlow verifies chart coverage.",
        symbol: uiSymbol,
      });
    }

    const providerSymbols = resolveProviderSymbols(requestedSymbol);
    if (providerSymbols.length === 0) {
      await recordAnalyzerEvent({
        action: "generate_setup",
        message: "Unsupported market symbol",
        status: "blocked",
        symbol: uiSymbol,
        userId: user.id,
      });
      return jsonResponse(
        req,
        { error: "Unsupported LevelFlow market symbol" },
        400,
      );
    }

    const symbol = uiSymbol as SupportedSymbol;
    const outcomeRefresh = await refreshUserOutcomes(token, user.id, {
      limit: 24,
      symbols: [symbol],
    });
    const learningRefresh = await refreshGlobalStrategyWeights();
    const sessionContext = getSessionContext(symbol);
    if (sessionContext.block) {
      await invalidateActiveSetupsForSymbol(
        token,
        user.id,
        symbol,
        sessionContext.reason ?? "The market session is not open.",
      );
      await recordAnalyzerEvent({
        action: "generate_setup",
        message: sessionContext.label,
        metadata: { sessionContext },
        status: "blocked",
        symbol,
        userId: user.id,
      });
      return jsonResponse(req, {
        blocked: true,
        reason: sessionContext.reason ?? "The market session is not open.",
        learningRefresh,
        outcomeRefresh,
      });
    }

    const { active: activeNewsEvents, upcoming: upcomingNewsEvents } =
      await fetchRelevantNews(token, symbol);
    if (activeNewsEvents.length > 0) {
      await invalidateActiveSetupsForSymbol(
        token,
        user.id,
        symbol,
        "A major scheduled event is active for this market.",
      );
      await recordAnalyzerEvent({
        action: "generate_setup",
        message: "Active major scheduled event",
        metadata: { activeNewsEvents },
        status: "blocked",
        symbol,
        userId: user.id,
      });
      return jsonResponse(req, {
        blocked: true,
        reason: "A major scheduled event is active for this market.",
        newsEvents: activeNewsEvents,
        learningRefresh,
        outcomeRefresh,
      });
    }

    const { fmpSymbol, marketContext, providerFailures } =
      await fetchFirstAvailableMarketContext(providerSymbols);
    await recordMarketDataHealth(
      symbol,
      fmpSymbol,
      marketContext,
      providerFailures,
    );
    if (!fmpSymbol || !marketContext) {
      await invalidateActiveSetupsForSymbol(
        token,
        user.id,
        symbol,
        "FMP did not return enough bars for this instrument.",
      );
      await recordAnalyzerEvent({
        action: "generate_setup",
        message: "Market data unavailable",
        metadata: { providerFailures },
        providerSymbol: fmpSymbol,
        status: "blocked",
        symbol,
        userId: user.id,
      });
      return jsonResponse(req, {
        blocked: true,
        learningRefresh,
        reason: "FMP did not return enough bars for this instrument.",
        providerWarnings: providerFailures,
        outcomeRefresh,
      });
    }

    if (marketContext.daily.length < 80) {
      await invalidateActiveSetupsForSymbol(
        token,
        user.id,
        symbol,
        "Not enough FMP daily bars returned for analyzer confidence.",
      );
      await recordAnalyzerEvent({
        action: "generate_setup",
        message: "Insufficient daily history",
        metadata: {
          dailyBars: marketContext.daily.length,
          providerFailures,
          providerWarnings: marketContext.providerWarnings,
        },
        providerSymbol: fmpSymbol,
        status: "blocked",
        symbol,
        userId: user.id,
      });
      return jsonResponse(req, {
        blocked: true,
        reason: "Not enough FMP daily bars returned for analyzer confidence.",
        providerWarnings: [
          ...providerFailures,
          ...marketContext.providerWarnings,
        ],
        learningRefresh,
        outcomeRefresh,
      });
    }

    const group = getCorrelationGroup(symbol);
    const setup = await analyzeSetup(
      token,
      user.id,
      symbol,
      fmpSymbol,
      group,
      marketContext,
      activeNewsEvents,
      upcomingNewsEvents,
      sessionContext,
    );
    if (!setup) {
      const analysisDiagnostics = await explainNoSetup(
        token,
        symbol,
        marketContext,
        upcomingNewsEvents,
        sessionContext,
      );
      await invalidateActiveSetupsForSymbol(
        token,
        user.id,
        symbol,
        "No current limit-order setup met the review threshold.",
      );
      await recordAnalyzerEvent({
        action: "generate_setup",
        message: "No current limit setup met review threshold",
        metadata: { analysisDiagnostics },
        providerSymbol: fmpSymbol,
        status: "blocked",
        symbol,
        userId: user.id,
      });
      return jsonResponse(req, {
        analysisDiagnostics,
        blocked: true,
        reason: "No current limit-order setup met the review threshold.",
        providerWarnings: marketContext.providerWarnings,
        learningRefresh,
        outcomeRefresh,
      });
    }

    const strongerExisting = await findStrongerActiveCorrelatedSetup(
      token,
      user.id,
      group,
      symbol,
      setup.confidenceScore,
    );
    if (strongerExisting) {
      await invalidateActiveSetupsForSymbol(
        token,
        user.id,
        symbol,
        `Correlation filter kept existing ${strongerExisting.symbol} setup with equal or higher confidence.`,
      );
      await recordAnalyzerEvent({
        action: "generate_setup",
        message: "Correlation filter kept stronger active setup",
        metadata: { correlationGroup: group, strongerExisting },
        providerSymbol: fmpSymbol,
        status: "blocked",
        symbol,
        userId: user.id,
      });
      return jsonResponse(req, {
        blocked: true,
        reason:
          `Correlation filter kept existing ${strongerExisting.symbol} setup with equal or higher confidence.`,
        correlationGroup: group,
        learningRefresh,
        outcomeRefresh,
      });
    }

    const savedSetup = await upsertActiveSetup(
      token,
      user.id,
      symbol,
      fmpSymbol,
      group,
      setup,
      activeNewsEvents,
      upcomingNewsEvents,
    );

    await recordAnalyzerEvent({
      action: "generate_setup",
      metadata: {
        confidenceScore: setup.confidenceScore,
        deduplicated: savedSetup.deduplicated,
        rewardRisk: setup.confluence.rewardRisk,
        side: setup.side,
        setupId: savedSetup.setupId,
        updated: savedSetup.updated,
      },
      providerSymbol: fmpSymbol,
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
      setup,
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

async function fetchFirstAvailableMarketContext(
  providerSymbols: string[],
): Promise<ProviderContextResult> {
  const providerFailures: string[] = [];

  for (const [index, providerSymbol] of providerSymbols.entries()) {
    try {
      const marketContext = await fetchMarketContext(providerSymbol);
      if (marketContext.daily.length >= 80) {
        if (index > 0) {
          marketContext.providerWarnings.unshift(
            `Using FMP fallback symbol ${providerSymbol}; primary ${
              providerSymbols[0]
            } was unavailable.`,
          );
        }
        return {
          fmpSymbol: providerSymbol,
          marketContext,
          providerFailures,
        };
      }

      providerFailures.push(
        `${providerSymbol}: insufficient daily history (${marketContext.daily.length} bars)`,
      );
    } catch (error) {
      providerFailures.push(
        `${providerSymbol}: ${
          error instanceof Error ? error.message : "FMP request failed"
        }`,
      );
    }
  }

  return {
    fmpSymbol: null,
    marketContext: null,
    providerFailures,
  };
}

async function recordMarketDataHealth(
  symbol: SupportedSymbol,
  providerSymbol: string | null,
  marketContext: MarketContext | null,
  providerFailures: string[],
) {
  try {
    const providerWarnings = [
      ...providerFailures,
      ...(marketContext?.providerWarnings ?? []),
    ];
    const status = !marketContext
      ? "unavailable"
      : providerWarnings.length > 0 ||
          marketContext.availableTimeframes.length < 4
      ? "limited"
      : "ready";

    await adminUpsertRows("market_data_health", {
      asset_type: getAssetType(symbol),
      available_timeframes: marketContext?.availableTimeframes ?? [],
      daily_bars: marketContext?.daily.length ?? 0,
      intraday_bars: marketContext?.availableTimeframes
        .filter((timeframe) => timeframe !== "1day")
        .reduce(
          (total, timeframe) =>
            total + (marketContext?.timeframes[timeframe]?.length ?? 0),
          0,
        ) ?? 0,
      last_checked_at: new Date().toISOString(),
      latest_bar_at: marketContext?.latest
        ? new Date(marketContext.latest.time).toISOString()
        : null,
      provider_symbol: providerSymbol,
      provider_warnings: providerWarnings,
      status,
      symbol,
    }, "symbol");
  } catch (error) {
    console.warn("market data health recording failed", error);
  }
}

async function recordAnalyzerEvent(event: AnalyzerEventPayload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  try {
    await adminInsertRows("analyzer_events", {
      action: event.action,
      asset_type: event.assetType ??
        (event.symbol ? getAssetType(event.symbol) : null),
      cache_hit: event.cacheHit ?? false,
      duration_ms: event.durationMs ?? null,
      message: event.message ?? null,
      metadata: event.metadata ?? {},
      provider_symbol: event.providerSymbol ?? null,
      status: event.status,
      symbol: event.symbol ?? null,
      user_id: event.userId ?? null,
    });
  } catch (error) {
    console.warn("analyzer event recording failed", error);
  }
}

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

  return {
    blocked,
    opportunities: opportunities.sort((first, second) =>
      (second.confidenceScore ?? 0) - (first.confidenceScore ?? 0)
    ),
    scanned: normalizedSymbols.length,
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
  const providerSymbols = resolveProviderSymbols(symbol);
  if (providerSymbols.length === 0) {
    return {
      blocked: {
        assetType: getAssetType(symbol),
        blocked: true,
        reason: "Unsupported market symbol.",
        symbol,
      },
    };
  }

  try {
    const sessionContext = getSessionContext(symbol);
    if (sessionContext.block) {
      return {
        blocked: {
          assetType: getAssetType(symbol),
          blocked: true,
          reason: sessionContext.reason ?? "The market session is not open.",
          symbol,
        },
      };
    }

    const { active: activeNewsEvents, upcoming: upcomingNewsEvents } =
      await fetchRelevantNews(token, symbol);
    if (activeNewsEvents.length > 0) {
      return {
        blocked: {
          assetType: getAssetType(symbol),
          blocked: true,
          reason: "A major scheduled event is active.",
          symbol,
        },
      };
    }

    const { fmpSymbol, marketContext, providerFailures } =
      await fetchFirstAvailableMarketContext(providerSymbols);
    await recordMarketDataHealth(
      symbol,
      fmpSymbol,
      marketContext,
      providerFailures,
    );
    if (!fmpSymbol || !marketContext || marketContext.daily.length < 80) {
      if (providerFailures.length > 0) {
        console.warn(
          "scan market data unavailable",
          symbol,
          providerFailures[0],
        );
      }
      await recordAnalyzerEvent({
        action: "scan_opportunities",
        message: "Market data unavailable during scan",
        metadata: {
          dailyBars: marketContext?.daily.length ?? 0,
          providerFailures,
        },
        providerSymbol: fmpSymbol,
        status: "scan_failure",
        symbol,
        userId,
      });
      return {
        blocked: {
          assetType: getAssetType(symbol),
          blocked: true,
          reason: "Chart data is not ready for this market yet.",
          symbol,
        },
      };
    }

    const group = getCorrelationGroup(symbol);
    const setup = await analyzeSetup(
      token,
      userId,
      symbol,
      fmpSymbol,
      group,
      marketContext,
      activeNewsEvents,
      upcomingNewsEvents,
      sessionContext,
    );
    if (!setup) {
      const diagnostics = await explainNoSetup(
        token,
        symbol,
        marketContext,
        upcomingNewsEvents,
        sessionContext,
      );
      await recordAnalyzerEvent({
        action: "scan_opportunities",
        message: "No current limit setup met scan threshold",
        metadata: { diagnostics },
        providerSymbol: fmpSymbol,
        status: "scan_failure",
        symbol,
        userId,
      });
      return {
        blocked: {
          assetType: getAssetType(symbol),
          blocked: true,
          reason: diagnostics[0] ??
            "No current limit-order setup passed review.",
          symbol,
        },
      };
    }

    const strongerExisting = await findStrongerActiveCorrelatedSetup(
      token,
      userId,
      group,
      symbol,
      setup.confidenceScore,
    );
    if (strongerExisting) {
      await recordAnalyzerEvent({
        action: "scan_opportunities",
        message: "Correlation filter skipped scan candidate",
        metadata: { strongerExisting },
        providerSymbol: fmpSymbol,
        status: "scan_failure",
        symbol,
        userId,
      });
      return {
        blocked: {
          assetType: getAssetType(symbol),
          blocked: true,
          reason:
            `A related market already has an equal or stronger current setup: ${strongerExisting.symbol}.`,
          symbol,
        },
      };
    }

    return {
      opportunity: {
        assetType: getAssetType(symbol),
        confidenceScore: setup.confidenceScore,
        correlationGroup: group,
        entryPrice: setup.entryPrice,
        executionLabel: String(setup.riskModel.executionQuality?.label ?? ""),
        executionScore: Number(setup.riskModel.executionQuality?.score ?? 0),
        marketRegime: String(setup.confluence.marketRegime?.name ?? ""),
        rationale: buildScanRationale(setup),
        relatedSymbols: getRelatedScanSymbols(group, symbol),
        rewardRisk: Number(setup.confluence.rewardRisk ?? 0),
        setup,
        side: setup.side,
        stopLoss: setup.stopLoss,
        symbol,
        takeProfit: setup.takeProfit,
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
  activeNewsEvents: NewsEvent[],
  upcomingNewsEvents: NewsEvent[],
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

  const newsPenalty = Math.min(
    calibration.maxNewsPenalty,
    upcomingNewsEvents.length * calibration.newsPenaltyPerEvent,
  );
  const timeframePenalty = market.availableTimeframes.length < 3
    ? calibration.timeframePenalty
    : 0;
  const providerPenalty = Math.min(
    calibration.maxProviderPenalty,
    market.providerWarnings.length * calibration.providerWarningPenalty,
  );
  const confidenceScore = clampInteger(
    Math.round(
      consensus.score + weightAdjustment - newsPenalty -
        sessionContext.penalty - timeframePenalty - providerPenalty -
        pricePlan.executionQuality.confidencePenalty,
    ),
    0,
    100,
  );

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
      upcomingNewsEvents,
    },
    riskModel: {
      atr: pricePlan.atr,
      dailyAtr: averageTrueRange(market.daily, 14),
      executionQuality: pricePlan.executionQuality,
      futuresContract: pricePlan.contractSpec,
      positionSizingStatus: "not_calculated",
      positionSizingReason:
        "LevelFlow records directional market setups only; position sizing should be handled in the trader's execution platform.",
      activeNewsEventsTracked: activeNewsEvents.length,
      upcomingNewsEventsTracked: upcomingNewsEvents.length,
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
  upcomingNewsEvents: NewsEvent[],
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
    const newsPenalty = Math.min(
      calibration.maxNewsPenalty,
      upcomingNewsEvents.length * calibration.newsPenaltyPerEvent,
    );
    const timeframePenalty = market.availableTimeframes.length < 3
      ? calibration.timeframePenalty
      : 0;
    const providerPenalty = Math.min(
      calibration.maxProviderPenalty,
      market.providerWarnings.length * calibration.providerWarningPenalty,
    );
    const confidenceScore = clampInteger(
      Math.round(
        consensus.score + weightAdjustment - newsPenalty -
          sessionContext.penalty - timeframePenalty - providerPenalty -
          (pricePlan?.executionQuality.confidencePenalty ?? 0),
      ),
      0,
      100,
    );

    diagnostics.push(
      `The current ${consensus.side} setup scored ${confidenceScore}; LevelFlow requires ${calibration.confidenceThreshold} or higher for this market.`,
    );
    if (!pricePlan) {
      diagnostics.push(
        "Limit entry failed price validation, so no limit-order setup was shown.",
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
  }

  if (upcomingNewsEvents.length > 0) {
    diagnostics.push(
      `${upcomingNewsEvents.length} major scheduled event${
        upcomingNewsEvents.length === 1 ? "" : "s"
      } reduced setup quality.`,
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
  activeNewsEvents: NewsEvent[],
  upcomingNewsEvents: NewsEvent[],
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
          activeEvents: activeNewsEvents,
          upcomingEvents: upcomingNewsEvents,
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
      activeEvents: activeNewsEvents,
      upcomingEvents: upcomingNewsEvents,
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
          fetchFmpBars(providerSymbol, "15min"),
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
  if (!SUPABASE_SERVICE_ROLE_KEY) {
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
  if (!SUPABASE_SERVICE_ROLE_KEY) {
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

async function fetchMarketContext(fmpSymbol: string): Promise<MarketContext> {
  const providerWarnings: string[] = [];
  const [daily, quote] = await Promise.all([
    fetchFmpBars(fmpSymbol, "1day"),
    fetchFmpQuoteSnapshot(fmpSymbol),
  ]);
  const timeframes: Partial<Record<Timeframe, Bar[]>> = { "1day": daily };

  await Promise.all(
    intradayTimeframes.map(async (timeframe) => {
      try {
        const bars = await fetchFmpBars(fmpSymbol, timeframe);
        if (bars.length >= 40) {
          timeframes[timeframe] = bars;
        }
      } catch (error) {
        providerWarnings.push(
          `${timeframe}: ${
            error instanceof Error
              ? error.message
              : "FMP intraday request failed"
          }`,
        );
      }
    }),
  );

  const availableTimeframes = (["1day", ...intradayTimeframes] as Timeframe[])
    .filter((timeframe) => (timeframes[timeframe]?.length ?? 0) > 0);
  const primaryTimeframe = pickPrimaryTimeframe(timeframes);
  const primary = timeframes[primaryTimeframe] ?? daily;

  return {
    availableTimeframes,
    daily,
    latest: primary.at(-1) ?? daily.at(-1)!,
    primary,
    primaryTimeframe,
    providerWarnings,
    quote,
    timeframes,
  };
}

async function fetchFmpQuoteSnapshot(
  fmpSymbol: string,
): Promise<QuoteSnapshot | null> {
  const endpoint = new URL(
    `${FMP_API_BASE_URL.replace(/\/$/, "")}/quote`,
  );
  endpoint.searchParams.set("symbol", fmpSymbol);
  endpoint.searchParams.set("apikey", FMP_API_KEY ?? "");

  const startedAt = performance.now();
  try {
    const response = await fetchWithTimeout(
      endpoint,
      {},
      QUOTE_FETCH_TIMEOUT_MS,
    );
    const durationMs = Math.round(performance.now() - startedAt);
    const responseText = await response.text();

    if (!response.ok) {
      await recordAnalyzerEvent({
        action: "quote_fetch",
        durationMs,
        message: `FMP quote request failed (${response.status})`,
        providerSymbol: fmpSymbol,
        status: "error",
      });
      return null;
    }

    const payload = JSON.parse(responseText) as unknown;
    const quote = parseFmpQuoteSnapshot(payload);
    if (!quote) {
      return null;
    }

    if (durationMs >= SLOW_PROVIDER_CALL_MS) {
      await recordAnalyzerEvent({
        action: "quote_fetch",
        durationMs,
        providerSymbol: fmpSymbol,
        status: "slow_provider",
      });
    }

    return quote;
  } catch (error) {
    await recordAnalyzerEvent({
      action: "quote_fetch",
      durationMs: Math.round(performance.now() - startedAt),
      message: error instanceof Error ? error.message : "FMP quote failed",
      providerSymbol: fmpSymbol,
      status: "error",
    });
    return null;
  }
}

async function fetchFmpBars(fmpSymbol: string, timeframe: Timeframe) {
  const cacheKey = `${fmpSymbol}:${timeframe}`;
  const cached = candleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    await recordAnalyzerEvent({
      action: "market_data_fetch",
      cacheHit: true,
      providerSymbol: fmpSymbol,
      status: "cache_hit",
      metadata: {
        bars: cached.bars.length,
        timeframe,
      },
    });
    return cached.bars.map((bar) => ({ ...bar }));
  }

  const endpoint = timeframe === "1day"
    ? new URL(
      `${FMP_API_BASE_URL.replace(/\/$/, "")}/historical-price-eod/full`,
    )
    : new URL(
      `${FMP_API_BASE_URL.replace(/\/$/, "")}/historical-chart/${timeframe}`,
    );
  endpoint.searchParams.set("symbol", fmpSymbol);
  endpoint.searchParams.set("apikey", FMP_API_KEY ?? "");

  const startedAt = performance.now();
  let response: Response;
  let responseText = "";
  try {
    response = await fetchWithTimeout(
      endpoint,
      {},
      MARKET_DATA_FETCH_TIMEOUT_MS,
    );
    responseText = await response.text();
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    await recordAnalyzerEvent({
      action: "market_data_fetch",
      durationMs,
      message: error instanceof Error ? error.message : "FMP request failed",
      providerSymbol: fmpSymbol,
      status: durationMs >= SLOW_PROVIDER_CALL_MS ? "slow_provider" : "error",
      metadata: {
        timeframe,
      },
    });
    throw error;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    const message = `FMP ${timeframe} request failed (${response.status}): ${
      responseText.slice(0, 160)
    }`;
    await recordAnalyzerEvent({
      action: "market_data_fetch",
      durationMs,
      message,
      providerSymbol: fmpSymbol,
      status: "error",
      metadata: {
        responseStatus: response.status,
        timeframe,
      },
    });
    throw new Error(message);
  }

  if (durationMs >= SLOW_PROVIDER_CALL_MS) {
    await recordAnalyzerEvent({
      action: "market_data_fetch",
      durationMs,
      providerSymbol: fmpSymbol,
      status: "slow_provider",
      metadata: {
        timeframe,
      },
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    await recordAnalyzerEvent({
      action: "market_data_fetch",
      durationMs,
      message: `FMP ${timeframe} response was not JSON`,
      providerSymbol: fmpSymbol,
      status: "error",
      metadata: {
        timeframe,
      },
    });
    throw new Error(`FMP ${timeframe} response was not JSON`);
  }

  if (!Array.isArray(payload)) {
    await recordAnalyzerEvent({
      action: "market_data_fetch",
      durationMs,
      message: `FMP ${timeframe} response was not an array`,
      providerSymbol: fmpSymbol,
      status: "error",
      metadata: {
        timeframe,
      },
    });
    throw new Error(`FMP ${timeframe} response was not an array`);
  }

  const bars = (payload as FmpBar[])
    .filter((point) =>
      typeof point.date === "string" && typeof point.open === "number" &&
      typeof point.high === "number" && typeof point.low === "number" &&
      typeof point.close === "number"
    )
    .map((point) => ({
      close: point.close as number,
      high: point.high as number,
      low: point.low as number,
      open: point.open as number,
      time: toTimestamp(point.date as string),
      volume: point.volume ?? 0,
    }))
    .sort((first, second) => first.time - second.time)
    .slice(timeframe === "1day" ? -260 : -500);

  candleCache.set(cacheKey, {
    bars,
    expiresAt: Date.now() + CANDLE_CACHE_TTL_MS[timeframe],
  });

  return bars.map((bar) => ({ ...bar }));
}

function buildPricePlan(
  side: Side,
  symbol: SupportedSymbol,
  market: MarketContext,
  regime: Regime,
  calibration: CategoryCalibration,
) {
  const bars = market.primary;
  const daily = market.daily;
  const latest = bars.at(-1)!;
  const atr = averageTrueRange(bars, 14);
  const dailyAtr = averageTrueRange(daily, 14);
  const structure = findStructureLevels(bars);
  const dailyStructure = findStructureLevels(daily);
  const entryOffset = atr *
    (regime.name === "trend"
      ? calibration.entryOffsetTrend
      : calibration.entryOffsetDefault);
  let entryPrice = side === "buy"
    ? latest.close - entryOffset
    : latest.close + entryOffset;
  const stopBuffer = Math.max(
    atr * calibration.stopAtrMultiplier,
    dailyAtr * calibration.dailyStopAtrMultiplier,
  );
  let stopLoss = side === "buy"
    ? Math.min(structure.latestSwingLow - stopBuffer, entryPrice - atr * 1.25)
    : Math.max(structure.latestSwingHigh + stopBuffer, entryPrice + atr * 1.25);
  let riskDistance = Math.abs(entryPrice - stopLoss);
  const minimumLimitDistance = Math.max(
    atr * 0.05,
    Math.abs(latest.close) * 0.00005,
    0.00001,
  );

  if (
    side === "buy" &&
    roundPrice(entryPrice) >= roundPrice(latest.close - minimumLimitDistance)
  ) {
    return null;
  }

  if (
    side === "sell" &&
    roundPrice(entryPrice) <= roundPrice(latest.close + minimumLimitDistance)
  ) {
    return null;
  }

  if (side === "buy" && roundPrice(stopLoss) >= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "sell" && roundPrice(stopLoss) <= roundPrice(entryPrice)) {
    return null;
  }

  const liquidityTarget = side === "buy"
    ? Math.max(structure.nextLiquidityHigh, dailyStructure.latestSwingHigh)
    : Math.min(structure.nextLiquidityLow, dailyStructure.latestSwingLow);
  const minimumTarget = side === "buy"
    ? entryPrice + riskDistance * calibration.minimumTargetRewardRisk
    : entryPrice - riskDistance * calibration.minimumTargetRewardRisk;
  const volatilityTarget = side === "buy"
    ? entryPrice +
      Math.max(
        atr * calibration.volatilityTargetAtrMultiplier,
        dailyAtr * calibration.dailyTargetAtrMultiplier,
      )
    : entryPrice -
      Math.max(
        atr * calibration.volatilityTargetAtrMultiplier,
        dailyAtr * calibration.dailyTargetAtrMultiplier,
      );
  let takeProfit = side === "buy"
    ? Math.max(liquidityTarget, minimumTarget, volatilityTarget)
    : Math.min(liquidityTarget, minimumTarget, volatilityTarget);

  if (side === "buy" && takeProfit <= entryPrice) {
    takeProfit = entryPrice + riskDistance * 2;
  }
  if (side === "sell" && takeProfit >= entryPrice) {
    takeProfit = entryPrice - riskDistance * 2;
  }

  const assetType = getAssetType(symbol);
  const futuresTickPlan = assetType === "futures"
    ? applyFuturesTickRules({
      entryPrice,
      side,
      stopLoss,
      symbol,
      takeProfit,
    })
    : null;

  if (futuresTickPlan) {
    entryPrice = futuresTickPlan.entryPrice;
    stopLoss = futuresTickPlan.stopLoss;
    takeProfit = futuresTickPlan.takeProfit;
    riskDistance = Math.abs(entryPrice - stopLoss);
  }

  if (side === "buy" && roundPrice(takeProfit) <= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "sell" && roundPrice(takeProfit) >= roundPrice(entryPrice)) {
    return null;
  }

  const rewardRisk = Math.abs(takeProfit - entryPrice) /
    Math.max(riskDistance, 0.00001);
  if (!Number.isFinite(rewardRisk) || riskDistance <= 0) {
    return null;
  }
  const executionQuality = estimateExecutionQuality({
    assetType,
    atr,
    availableTimeframes: market.availableTimeframes,
    dailyAtr,
    entryPrice,
    latestClose: latest.close,
    providerWarnings: market.providerWarnings,
    quotedSpread: market.quote?.spread ?? null,
    side,
    stopLoss,
    symbol,
    takeProfit,
  });

  return {
    atr,
    contractSpec: futuresTickPlan?.contractSpec ?? null,
    entryPrice,
    executionQuality,
    futuresTickAdjustments: futuresTickPlan?.adjustments ?? [],
    grossRewardRisk: rewardRisk,
    rewardRisk: executionQuality.effectiveRewardRisk,
    stopLogic:
      "Structure invalidation with ATR buffer and daily-volatility floor.",
    stopLoss,
    targetLogic:
      "Liquidity target, minimum reward-to-risk, and volatility projection.",
    takeProfit,
  };
}

async function fetchRelevantNews(token: string, symbol: SupportedSymbol) {
  const activeStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const activeEnd = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const upcomingEnd = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const rows = await fetchRows<NewsEvent>(
    token,
    `economic_events?select=provider,currency,event_name,impact,scheduled_at&impact=eq.high&scheduled_at=gte.${
      encodeURIComponent(activeStart)
    }&scheduled_at=lte.${encodeURIComponent(upcomingEnd)}`,
  );
  const relevant = rows.filter((event) => isNewsRelevant(symbol, event));

  return {
    active: relevant.filter((event) =>
      typeof event.scheduled_at === "string" &&
      event.scheduled_at >= activeStart && event.scheduled_at <= activeEnd
    ),
    upcoming: relevant.filter((event) =>
      typeof event.scheduled_at === "string" && event.scheduled_at > activeEnd
    ),
  };
}

function isNewsRelevant(symbol: SupportedSymbol, event: NewsEvent) {
  if (event.provider === "fmp_earnings") {
    return isEquityCalendarSensitiveSymbol(symbol);
  }

  const currency = event.currency?.toUpperCase();
  if (!currency) {
    return true;
  }
  return isCurrencyRelevantForSymbol(symbol, currency);
}

function pickPrimaryTimeframe(
  timeframes: Partial<Record<Timeframe, Bar[]>>,
): Timeframe {
  if ((timeframes["15min"]?.length ?? 0) >= 80) {
    return "15min";
  }
  if ((timeframes["1hour"]?.length ?? 0) >= 80) {
    return "1hour";
  }
  if ((timeframes["4hour"]?.length ?? 0) >= 60) {
    return "4hour";
  }
  return "1day";
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

async function fetchSingle<T>(token: string, path: string) {
  const rows = await fetchRows<T>(
    token,
    /(?:^|[?&])limit=/.test(path)
      ? path
      : `${path}${path.includes("?") ? "&" : "?"}limit=1`,
  );
  return rows[0] ?? null;
}

async function fetchRows<T>(token: string, path: string): Promise<T[]> {
  const response = await supabaseFetch(token, path);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

async function insertSingle(
  token: string,
  table: string,
  payload: Record<string, unknown>,
) {
  const response = await supabaseFetch(token, table, {
    body: JSON.stringify(payload),
    headers: {
      Prefer: "return=representation",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const rows = (await response.json()) as Array<{ id: string }>;
  return rows[0];
}

async function updateRows<T = unknown>(
  token: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<T[]> {
  const response = await supabaseFetch(token, path, {
    body: JSON.stringify(payload),
    headers: {
      Prefer: "return=representation",
    },
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

async function upsertRows<T = unknown>(
  token: string,
  table: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
  onConflict: string,
): Promise<T[]> {
  const response = await supabaseFetch(
    token,
    `${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

async function adminFetchRows<T>(path: string): Promise<T[]> {
  const response = await adminSupabaseFetch(path);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

async function adminInsertRows<T = unknown>(
  table: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
): Promise<T[]> {
  const response = await adminSupabaseFetch(table, {
    body: JSON.stringify(payload),
    headers: {
      Prefer: "return=minimal",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.status === 204) {
    return [];
  }
  return (await response.json()) as T[];
}

async function adminRpcRows<T>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<T[]> {
  const response = await adminSupabaseFetch(`rpc/${functionName}`, {
    body: JSON.stringify(payload),
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

async function adminUpsertRows<T = unknown>(
  table: string,
  payload: Record<string, unknown> | Array<Record<string, unknown>>,
  onConflict: string,
): Promise<T[]> {
  const response = await adminSupabaseFetch(
    `${table}?on_conflict=${encodeURIComponent(onConflict)}`,
    {
      body: JSON.stringify(payload),
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

async function supabaseFetch(
  token: string,
  path: string,
  init: RequestInit = {},
) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  }, SUPABASE_FETCH_TIMEOUT_MS);
}

async function adminSupabaseFetch(path: string, init: RequestInit = {}) {
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  }, SUPABASE_FETCH_TIMEOUT_MS);
}

async function getAuthenticatedUser(token: string | null) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  }, SUPABASE_FETCH_TIMEOUT_MS);

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return typeof user?.id === "string" ? user : null;
}

function getBearerToken(req: Request) {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null;
}

function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = SUPABASE_FETCH_TIMEOUT_MS,
) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function toTimestamp(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0] ?? "https://levelflow.windwardline.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
    status,
  });
}
