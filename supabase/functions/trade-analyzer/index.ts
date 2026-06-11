const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ?? "https://financialmodelingprep.com/stable";
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "https://app.windwardline.com,https://windwardline.github.io,http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

type SymbolConfig = {
  fallback?: string;
  primary: string;
};

const symbolMap: Record<string, string | SymbolConfig> = {
  EURUSD: "EURUSD",
  GBPUSD: "GBPUSD",
  USDJPY: "USDJPY",
  AUDUSD: "AUDUSD",
  USDCAD: "USDCAD",
  USDCHF: "USDCHF",
  NZDUSD: "NZDUSD",
  NZDJPY: "NZDJPY",
  NZDCHF: "NZDCHF",
  NZDCAD: "NZDCAD",
  GBPNZD: "GBPNZD",
  GBPJPY: "GBPJPY",
  GBPCHF: "GBPCHF",
  GBPCAD: "GBPCAD",
  GBPAUD: "GBPAUD",
  EURNZD: "EURNZD",
  EURJPY: "EURJPY",
  EURGBP: "EURGBP",
  EURCHF: "EURCHF",
  EURCAD: "EURCAD",
  EURAUD: "EURAUD",
  CHFJPY: "CHFJPY",
  CADJPY: "CADJPY",
  CADCHF: "CADCHF",
  AUDNZD: "AUDNZD",
  AUDJPY: "AUDJPY",
  AUDCHF: "AUDCHF",
  AUDCAD: "AUDCAD",
  XAUUSD: "XAUUSD",
  XAGUSD: "XAGUSD",
  ESUSD: "ESUSD",
  GCUSD: "GCUSD",
  SIUSD: "SIUSD",
  BZUSD: "BZUSD",
  SP: "^GSPC",
  NSDQ: { primary: "^NDX", fallback: "QQQ" },
  NIKKEI: "^N225",
  DOW: "^DJI",
  DAX: { primary: "^GDAXI", fallback: "DAX" },
  ASX: { primary: "^AXJO", fallback: "EWA" },
  WTI: { primary: "CLUSD", fallback: "USO" },
  BRENT: "BZUSD",
  XRPUSD: "XRPUSD",
  SOLUSD: "SOLUSD",
  LTCUSD: "LTCUSD",
  ETHUSD: "ETHUSD",
  BTCUSD: "BTCUSD",
  BNBUSD: "BNBUSD",
  BCHUSD: "BCHUSD",
  ADAUSD: "ADAUSD",
};

for (const [symbol, value] of Object.entries(symbolMap)) {
  if (typeof value === "string") {
    symbolMap[symbol] = { primary: value };
  }
}

const temporarilyUnavailableSymbols = new Set(["SP", "NSDQ", "NIKKEI", "DOW", "DAX", "ASX", "WTI", "BRENT"]);
const equityCalendarSensitiveSymbols = new Set(["ESUSD", "SP", "NSDQ", "DOW"]);

const symbolCurrencies: Record<SupportedSymbol, string[]> = {
  EURUSD: ["EUR", "USD"],
  GBPUSD: ["GBP", "USD"],
  USDJPY: ["USD", "JPY"],
  AUDUSD: ["AUD", "USD"],
  USDCAD: ["USD", "CAD"],
  USDCHF: ["USD", "CHF"],
  NZDUSD: ["NZD", "USD"],
  NZDJPY: ["NZD", "JPY"],
  NZDCHF: ["NZD", "CHF"],
  NZDCAD: ["NZD", "CAD"],
  GBPNZD: ["GBP", "NZD"],
  GBPJPY: ["GBP", "JPY"],
  GBPCHF: ["GBP", "CHF"],
  GBPCAD: ["GBP", "CAD"],
  GBPAUD: ["GBP", "AUD"],
  EURNZD: ["EUR", "NZD"],
  EURJPY: ["EUR", "JPY"],
  EURGBP: ["EUR", "GBP"],
  EURCHF: ["EUR", "CHF"],
  EURCAD: ["EUR", "CAD"],
  EURAUD: ["EUR", "AUD"],
  CHFJPY: ["CHF", "JPY"],
  CADJPY: ["CAD", "JPY"],
  CADCHF: ["CAD", "CHF"],
  AUDNZD: ["AUD", "NZD"],
  AUDJPY: ["AUD", "JPY"],
  AUDCHF: ["AUD", "CHF"],
  AUDCAD: ["AUD", "CAD"],
  XAUUSD: ["USD"],
  XAGUSD: ["USD"],
  ESUSD: ["USD"],
  GCUSD: ["USD"],
  SIUSD: ["USD"],
  BZUSD: ["USD"],
  SP: ["USD"],
  NSDQ: ["USD"],
  NIKKEI: ["JPY"],
  DOW: ["USD"],
  DAX: ["EUR"],
  ASX: ["AUD"],
  WTI: ["USD"],
  BRENT: ["USD"],
  XRPUSD: ["USD"],
  SOLUSD: ["USD"],
  LTCUSD: ["USD"],
  ETHUSD: ["USD"],
  BTCUSD: ["USD"],
  BNBUSD: ["USD"],
  BCHUSD: ["USD"],
  ADAUSD: ["USD"],
};

const correlationGroups: Record<string, string[]> = {
  aud_crosses: ["AUDUSD", "AUDNZD", "AUDJPY", "AUDCHF", "AUDCAD", "EURAUD", "GBPAUD"],
  crypto: ["XRPUSD", "SOLUSD", "LTCUSD", "ETHUSD", "BTCUSD", "BNBUSD", "BCHUSD", "ADAUSD"],
  energies: ["WTI", "BRENT"],
  futures: ["ESUSD", "GCUSD", "SIUSD", "BZUSD"],
  eur_crosses: ["EURUSD", "EURNZD", "EURJPY", "EURGBP", "EURCHF", "EURCAD", "EURAUD"],
  gbp_crosses: ["GBPUSD", "GBPNZD", "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "EURGBP"],
  jpy_crosses: ["USDJPY", "NZDJPY", "GBPJPY", "EURJPY", "CHFJPY", "CADJPY", "AUDJPY"],
  metals: ["XAUUSD", "XAGUSD"],
  nzd_crosses: ["NZDUSD", "NZDJPY", "NZDCHF", "NZDCAD", "AUDNZD", "EURNZD", "GBPNZD"],
  us_indices: ["SP", "NSDQ", "NIKKEI", "DOW", "DAX", "ASX"],
  usd_majors: ["USDJPY", "USDCHF", "USDCAD", "NZDUSD", "GBPUSD", "EURUSD", "AUDUSD"],
};

const intradayTimeframes = ["4hour", "1hour", "15min"] as const;

type SupportedSymbol = string;
type Direction = "buy" | "sell" | "neutral" | "block";
type Side = "buy" | "sell";
type Timeframe = "1day" | (typeof intradayTimeframes)[number];
type RegimeName = "trend" | "range" | "volatile_chop" | "compression";

type AnalyzeRequest = {
  action?: "analyze" | "refresh_outcomes";
  symbol?: string;
};

type Bar = {
  close: number;
  high: number;
  low: number;
  open: number;
  time: number;
  volume: number;
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

type StrategyVote = {
  confidence: number;
  direction: Direction;
  name: string;
  rationale: string;
  score: number;
  timeframe: Timeframe | "multi";
};

type MarketContext = {
  availableTimeframes: Timeframe[];
  daily: Bar[];
  latest: Bar;
  primary: Bar[];
  primaryTimeframe: Timeframe;
  providerWarnings: string[];
  timeframes: Partial<Record<Timeframe, Bar[]>>;
};

type Regime = {
  bias: Direction;
  name: RegimeName;
  rationale: string;
  trendStrength: number;
  volatilityPercentile: number;
};

type SessionContext = {
  block: boolean;
  label: string;
  penalty: number;
  reason?: string;
};

type ExistingSetupRow = {
  account_id: string | null;
  breakeven_trigger_price: number | string;
  confidence_score: number | string;
  confluence: Record<string, unknown> | null;
  created_at: string;
  id: string;
  limit_entry: number | string;
  massive_symbol: string;
  pending_order_id: string | null;
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
  pendingOrderId: string | null;
  setupId: string;
  updated: boolean;
};

type ProviderContextResult = {
  fmpSymbol: string | null;
  marketContext: MarketContext | null;
  providerFailures: string[];
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
      return jsonResponse(req, { error: "Analyzer provider configuration is incomplete" }, 500);
    }

    const token = getBearerToken(req);
    const user = await getAuthenticatedUser(token);
    if (!token || !user) {
      return jsonResponse(req, { error: "Authenticated Supabase session required" }, 401);
    }

    let body: AnalyzeRequest;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    if (body.action === "refresh_outcomes") {
      const outcomeRefresh = await refreshUserOutcomes(token, user.id);
      await refreshStrategyWeights(token, user.id);
      return jsonResponse(req, {
        advisoryOnly: true,
        message: "Trade outcomes refreshed.",
        outcomeRefresh,
      });
    }

    const requestedSymbol = typeof body.symbol === "string" && body.symbol.trim() ? body.symbol.trim() : "EURUSD";
    const uiSymbol = normalizeSymbol(requestedSymbol);
    if (temporarilyUnavailableSymbols.has(uiSymbol)) {
      return jsonResponse(req, {
        blocked: true,
        reason: "This asset group is temporarily unavailable while LevelFlow verifies provider coverage.",
        symbol: uiSymbol,
      });
    }

    const providerSymbols = resolveProviderSymbols(requestedSymbol);
    if (providerSymbols.length === 0) {
      return jsonResponse(req, { error: "Unsupported LevelFlow market symbol" }, 400);
    }

    const symbol = uiSymbol as SupportedSymbol;
    const outcomeRefresh = await refreshUserOutcomes(token, user.id, { limit: 24, symbols: [symbol] });
    await refreshStrategyWeights(token, user.id);
    const sessionContext = getSessionContext();

    const { active: activeNewsEvents, upcoming: upcomingNewsEvents } = await fetchRelevantNews(token, symbol);
    if (activeNewsEvents.length > 0) {
      await invalidateActiveSetupsForSymbol(token, user.id, symbol, "High-impact calendar risk is active for this asset.");
      return jsonResponse(req, {
        blocked: true,
        reason: "Relevant high-impact calendar risk is active for this asset.",
        newsEvents: activeNewsEvents,
        outcomeRefresh,
      });
    }

    const { fmpSymbol, marketContext, providerFailures } = await fetchFirstAvailableMarketContext(providerSymbols);
    if (!fmpSymbol || !marketContext) {
      await invalidateActiveSetupsForSymbol(token, user.id, symbol, "FMP did not return enough bars for this instrument.");
      return jsonResponse(req, { blocked: true, reason: "FMP did not return enough bars for this instrument.", providerWarnings: providerFailures, outcomeRefresh });
    }

    if (marketContext.daily.length < 80) {
      await invalidateActiveSetupsForSymbol(token, user.id, symbol, "Not enough FMP daily bars returned for analyzer confidence.");
      return jsonResponse(req, {
        blocked: true,
        reason: "Not enough FMP daily bars returned for analyzer confidence.",
        providerWarnings: [...providerFailures, ...marketContext.providerWarnings],
        outcomeRefresh,
      });
    }

    const group = getCorrelationGroup(symbol);
    const setup = await analyzeSetup(token, user.id, symbol, fmpSymbol, group, marketContext, activeNewsEvents, upcomingNewsEvents, sessionContext);
    if (!setup) {
      await invalidateActiveSetupsForSymbol(token, user.id, symbol, "No setup met the LevelFlow committee confluence threshold.");
      return jsonResponse(req, {
        blocked: true,
        reason: "No setup met the LevelFlow committee confluence threshold.",
        providerWarnings: marketContext.providerWarnings,
        outcomeRefresh,
      });
    }

    const activeCorrelated = await fetchRows<{ id: string; symbol: string; confidence_score: number }>(
      token,
      `trade_setups?select=id,symbol,confidence_score&user_id=eq.${encodeURIComponent(user.id)}&correlation_group=eq.${encodeURIComponent(group)}&status=in.(generated,placed)&created_at=gte.${encodeURIComponent(
        new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      )}`,
    );

    const strongerExisting = activeCorrelated.find((row) => row.symbol !== symbol && row.confidence_score >= setup.confidenceScore);
    if (strongerExisting) {
      await invalidateActiveSetupsForSymbol(token, user.id, symbol, `Correlation filter kept existing ${strongerExisting.symbol} setup with equal or higher confidence.`);
      return jsonResponse(req, {
        blocked: true,
        reason: `Correlation filter kept existing ${strongerExisting.symbol} setup with equal or higher confidence.`,
        correlationGroup: group,
        outcomeRefresh,
      });
    }

    const savedSetup = await upsertActiveSetup(token, user.id, symbol, fmpSymbol, group, setup, activeNewsEvents, upcomingNewsEvents);

    return jsonResponse(req, {
      advisoryOnly: true,
      deduplicated: savedSetup.deduplicated,
      message: savedSetup.updated ? "Updated current active advisory setup. LevelFlow did not create a duplicate log entry." : "Generated advisory limit-order setup. LevelFlow does not execute trades.",
      outcomeRefresh,
      pendingOrderId: savedSetup.pendingOrderId,
      setupId: savedSetup.setupId,
      setup,
      updated: savedSetup.updated,
    });
  } catch (error) {
    return jsonResponse(
      req,
      {
        blocked: true,
        error: error instanceof Error ? error.message : "Analyzer request failed.",
      },
      500,
    );
  }
});

async function fetchFirstAvailableMarketContext(providerSymbols: string[]): Promise<ProviderContextResult> {
  const providerFailures: string[] = [];

  for (const [index, providerSymbol] of providerSymbols.entries()) {
    try {
      const marketContext = await fetchMarketContext(providerSymbol);
      if (marketContext.daily.length >= 80) {
        if (index > 0) {
          marketContext.providerWarnings.unshift(`Using FMP fallback symbol ${providerSymbol}; primary ${providerSymbols[0]} was unavailable.`);
        }
        return {
          fmpSymbol: providerSymbol,
          marketContext,
          providerFailures,
        };
      }

      providerFailures.push(`${providerSymbol}: insufficient daily history (${marketContext.daily.length} bars)`);
    } catch (error) {
      providerFailures.push(`${providerSymbol}: ${error instanceof Error ? error.message : "FMP request failed"}`);
    }
  }

  return {
    fmpSymbol: null,
    marketContext: null,
    providerFailures,
  };
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
  const regime = classifyRegime(market);
  const votes = runStrategyCommittee(market, regime);
  const consensus = scoreConsensus(votes, regime);
  if (!consensus.side) {
    return null;
  }

  const setupKey = buildSetupKey(regime, consensus.side, votes);
  const weight = await fetchSingle<{ confidence_adjustment: number | string }>(
    token,
    `strategy_weightings?select=confidence_adjustment&user_id=eq.${encodeURIComponent(userId)}&setup_key=eq.${encodeURIComponent(setupKey)}&limit=1`,
  );
  const weightAdjustment = Number(weight?.confidence_adjustment ?? 0);

  const pricePlan = buildPricePlan(consensus.side, market, regime);
  if (!pricePlan) {
    return null;
  }

  const newsPenalty = Math.min(8, upcomingNewsEvents.length * 3);
  const timeframePenalty = market.availableTimeframes.length < 3 ? 5 : 0;
  const providerPenalty = Math.min(6, market.providerWarnings.length * 2);
  const confidenceScore = clampInteger(
    Math.round(consensus.score + weightAdjustment - newsPenalty - sessionContext.penalty - timeframePenalty - providerPenalty),
    0,
    100,
  );

  if (confidenceScore < 66 || pricePlan.rewardRisk < 1.35) {
    return null;
  }

  const lotSize = 0.01;
  const breakevenTriggerPrice =
    consensus.side === "buy"
      ? pricePlan.entryPrice + Math.abs(pricePlan.takeProfit - pricePlan.entryPrice) * 0.5
      : pricePlan.entryPrice - Math.abs(pricePlan.takeProfit - pricePlan.entryPrice) * 0.5;

  return {
    symbol,
    dataProvider: "FMP",
    fmpSymbol,
    providerSymbol: fmpSymbol,
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
      rewardRisk: Number(pricePlan.rewardRisk.toFixed(2)),
      orderConstruction: {
        orderType: "limit",
        latestClose: market.latest.close,
        validation: consensus.side === "buy" ? "buy limit entry below latest close" : "sell limit entry above latest close",
      },
      sessionContext,
      strategyWeightAdjustment: weightAdjustment,
      upcomingNewsEvents,
    },
    riskModel: {
      atr: pricePlan.atr,
      dailyAtr: averageTrueRange(market.daily, 14),
      positionSizingStatus: "not_calculated",
      positionSizingReason: "LevelFlow records directional market setups only; position sizing should be handled in the trader's execution platform.",
      activeNewsEventsTracked: activeNewsEvents.length,
      upcomingNewsEventsTracked: upcomingNewsEvents.length,
      stopLogic: pricePlan.stopLogic,
      targetLogic: pricePlan.targetLogic,
    },
  };
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
    `trade_setups?select=id,account_id,pending_order_id,symbol,massive_symbol,side,limit_entry,stop_loss,take_profit,breakeven_trigger_price,confidence_score,confluence,correlation_group,status,created_at&user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${encodeURIComponent(
      symbol,
    )}&status=in.(generated,placed)&order=created_at.desc&limit=1`,
  );
  const activeSetup = rows[0] ?? null;
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();

  if (activeSetup && activeSetup.side === setup.side) {
    if (activeSetup.pending_order_id) {
      await updateRows(token, `pending_orders?id=eq.${encodeURIComponent(activeSetup.pending_order_id)}&user_id=eq.${encodeURIComponent(userId)}`, {
        confidence_score: setup.confidenceScore,
        entry_price: setup.entryPrice,
        expires_at: expiresAt,
        invalidation_reason: null,
        massive_symbol: fmpSymbol,
        side: setup.side,
        status: "generated",
        stop_loss: setup.stopLoss,
        take_profit: setup.takeProfit,
      });
    }

    await updateRows(token, `trade_setups?id=eq.${encodeURIComponent(activeSetup.id)}&user_id=eq.${encodeURIComponent(userId)}`, {
      breakeven_trigger_price: setup.breakevenTriggerPrice,
      confidence_score: setup.confidenceScore,
      confluence: setup.confluence,
      correlation_group: group,
      limit_entry: setup.entryPrice,
      massive_symbol: fmpSymbol,
      news_context: {
        activeEvents: activeNewsEvents,
        upcomingEvents: upcomingNewsEvents,
      },
      risk_model: setup.riskModel,
      side: setup.side,
      status: "generated",
      stop_loss: setup.stopLoss,
      take_profit: setup.takeProfit,
    });

    return {
      deduplicated: true,
      pendingOrderId: activeSetup.pending_order_id,
      setupId: activeSetup.id,
      updated: true,
    };
  }

  if (activeSetup) {
    await invalidateActiveSetupsForSymbol(token, userId, symbol, "A newer analysis produced a different current setup.");
  }

  const pendingOrder = await insertSingle(token, "pending_orders", {
    user_id: userId,
    account_id: null,
    symbol,
    massive_symbol: fmpSymbol,
    side: setup.side,
    order_type: "limit",
    entry_price: setup.entryPrice,
    stop_loss: setup.stopLoss,
    take_profit: setup.takeProfit,
    lot_size: setup.lotSize,
    confidence_score: setup.confidenceScore,
    status: "generated",
    expires_at: expiresAt,
  });

  const tradeSetup = await insertSingle(token, "trade_setups", {
    user_id: userId,
    account_id: null,
    pending_order_id: pendingOrder.id,
    symbol,
    massive_symbol: fmpSymbol,
    side: setup.side,
    limit_entry: setup.entryPrice,
    stop_loss: setup.stopLoss,
    take_profit: setup.takeProfit,
    breakeven_trigger_price: setup.breakevenTriggerPrice,
    confidence_score: setup.confidenceScore,
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
    pendingOrderId: pendingOrder.id,
    setupId: tradeSetup.id,
    updated: false,
  };
}

async function invalidateActiveSetupsForSymbol(token: string, userId: string, symbol: SupportedSymbol, reason: string) {
  await updateRows(token, `pending_orders?user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${encodeURIComponent(symbol)}&status=in.(generated,placed)`, {
    invalidation_reason: reason,
    status: "invalidated",
  });
  await updateRows(token, `trade_setups?user_id=eq.${encodeURIComponent(userId)}&symbol=eq.${encodeURIComponent(symbol)}&status=in.(generated,placed)`, {
    status: "invalidated",
  });
}

async function refreshUserOutcomes(token: string, userId: string, options: { limit?: number; symbols?: SupportedSymbol[] } = {}): Promise<OutcomeRefreshSummary> {
  const summary: OutcomeRefreshSummary = {
    expired: 0,
    failed: 0,
    pending: 0,
    placed: 0,
    reviewed: 0,
    stopLoss: 0,
    takeProfit: 0,
  };
  const symbolFilter =
    options.symbols && options.symbols.length > 0 ? `&symbol=in.(${options.symbols.map((symbol) => encodeURIComponent(symbol)).join(",")})` : "";
  const limit = Math.max(1, Math.min(options.limit ?? 120, 120));
  const setups = await fetchRows<SetupForOutcome>(
    token,
    `trade_setups?select=id,account_id,pending_order_id,symbol,massive_symbol,side,limit_entry,stop_loss,take_profit,breakeven_trigger_price,confidence_score,confluence,risk_model,correlation_group,status,created_at&user_id=eq.${encodeURIComponent(
      userId,
    )}&status=in.(generated,placed)${symbolFilter}&order=created_at.asc&limit=${limit}`,
  );
  const barsByProviderSymbol = new Map<string, Promise<Bar[]>>();

  for (const setup of setups) {
    summary.reviewed += 1;

    try {
      const providerSymbol = setup.massive_symbol || resolveProviderSymbols(setup.symbol)[0];
      if (!providerSymbol) {
        summary.failed += 1;
        continue;
      }

      if (!barsByProviderSymbol.has(providerSymbol)) {
        barsByProviderSymbol.set(providerSymbol, fetchFmpBars(providerSymbol, "15min"));
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
      } else {
        summary.expired += 1;
      }

      await markSetupStatus(token, userId, setup, evaluation.outcome === "unfilled" ? "expired" : "filled");
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

function evaluateSetupOutcome(setup: SetupForOutcome, bars: Bar[]) {
  const entry = Number(setup.limit_entry);
  const stopLoss = Number(setup.stop_loss);
  const takeProfit = Number(setup.take_profit);
  const createdAt = new Date(setup.created_at).getTime();
  const expiresAt = createdAt + 6 * 60 * 60 * 1000;
  const createdBars = bars.filter((bar) => bar.time >= createdAt);

  if (!Number.isFinite(entry) || !Number.isFinite(stopLoss) || !Number.isFinite(takeProfit)) {
    return { state: "pending" as const };
  }

  if (createdBars.length === 0) {
    if (Date.now() > expiresAt) {
      return {
        exitAt: new Date(expiresAt).toISOString(),
        feedback: {
          reason: "No post-recommendation bars were available before the six-hour setup window expired.",
          source: "price_path_review",
        },
        outcome: "unfilled" as const,
        state: "resolved" as const,
      };
    }
    return { state: "pending" as const };
  }

  let fillIndex = -1;
  for (let index = 0; index < createdBars.length; index += 1) {
    const bar = createdBars[index];
    const filled = setup.side === "buy" ? bar.low <= entry : bar.high >= entry;
    if (filled) {
      fillIndex = index;
      break;
    }
  }

  if (fillIndex < 0) {
    if (Date.now() > expiresAt) {
      return {
        exitAt: new Date(expiresAt).toISOString(),
        feedback: {
          reason: "Limit entry did not fill before the six-hour setup window expired.",
          source: "price_path_review",
        },
        outcome: "unfilled" as const,
        state: "resolved" as const,
      };
    }
    return { state: "pending" as const };
  }

  const filledAt = new Date(createdBars[fillIndex].time).toISOString();
  let maxFavorableMove = 0;
  let maxAdverseMove = 0;

  for (const bar of createdBars.slice(fillIndex)) {
    if (setup.side === "buy") {
      maxFavorableMove = Math.max(maxFavorableMove, bar.high - entry);
      maxAdverseMove = Math.max(maxAdverseMove, entry - bar.low);
      const targetHit = bar.high >= takeProfit;
      const stopHit = bar.low <= stopLoss;

      if (stopHit || targetHit) {
        const outcome = stopHit ? "stop_loss" : "take_profit";
        return {
          exitAt: new Date(bar.time).toISOString(),
          feedback: {
            maxAdverseMove: roundPrice(maxAdverseMove),
            maxFavorableMove: roundPrice(maxFavorableMove),
            source: "price_path_review",
          },
          filledAt,
          outcome,
          state: "resolved" as const,
        };
      }
    } else {
      maxFavorableMove = Math.max(maxFavorableMove, entry - bar.low);
      maxAdverseMove = Math.max(maxAdverseMove, bar.high - entry);
      const targetHit = bar.low <= takeProfit;
      const stopHit = bar.high >= stopLoss;

      if (stopHit || targetHit) {
        const outcome = stopHit ? "stop_loss" : "take_profit";
        return {
          exitAt: new Date(bar.time).toISOString(),
          feedback: {
            maxAdverseMove: roundPrice(maxAdverseMove),
            maxFavorableMove: roundPrice(maxFavorableMove),
            source: "price_path_review",
          },
          filledAt,
          outcome,
          state: "resolved" as const,
        };
      }
    }
  }

  return {
    feedback: {
      maxAdverseMove: roundPrice(maxAdverseMove),
      maxFavorableMove: roundPrice(maxFavorableMove),
      source: "price_path_review",
    },
    filledAt,
    state: "placed" as const,
  };
}

async function markSetupStatus(token: string, userId: string, setup: SetupForOutcome, status: "expired" | "filled" | "placed") {
  await updateRows(token, `trade_setups?id=eq.${encodeURIComponent(setup.id)}&user_id=eq.${encodeURIComponent(userId)}`, {
    status,
  });
  if (setup.pending_order_id) {
    await updateRows(token, `pending_orders?id=eq.${encodeURIComponent(setup.pending_order_id)}&user_id=eq.${encodeURIComponent(userId)}`, {
      status,
    });
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
    outcome: "pending" | "unfilled" | "take_profit" | "stop_loss";
    reviewedAt: string;
  },
) {
  await upsertRows(
    token,
    "trade_outcomes",
    {
      account_id: setup.account_id,
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

async function refreshStrategyWeights(token: string, userId: string) {
  const outcomes = await fetchRows<{ outcome: string; setup_id: string }>(
    token,
    `trade_outcomes?select=setup_id,outcome&user_id=eq.${encodeURIComponent(userId)}&outcome=in.(take_profit,stop_loss)&order=reviewed_at.desc&limit=500`,
  );
  const setupIds = Array.from(new Set(outcomes.map((outcome) => outcome.setup_id).filter(Boolean)));
  if (setupIds.length === 0) {
    return;
  }

  const rows = await fetchRows<{
    confluence: Record<string, unknown> | null;
    correlation_group: string | null;
    id: string;
    symbol: string;
  }>(
    token,
    `trade_setups?select=id,symbol,correlation_group,confluence&user_id=eq.${encodeURIComponent(userId)}&id=in.(${setupIds.map((id) => encodeURIComponent(id)).join(",")})`,
  );
  const setupsById = new Map(rows.map((row) => [row.id, row]));
  const grouped = new Map<string, { losses: number; total: number; wins: number }>();

  for (const outcomeRow of outcomes) {
    const row = setupsById.get(outcomeRow.setup_id);
    if (!row) {
      continue;
    }
    const outcome = outcomeRow.outcome;
    if (outcome !== "take_profit" && outcome !== "stop_loss") {
      continue;
    }
    const setupKey = extractSetupKey(row.confluence, row.correlation_group, row.symbol);
    const current = grouped.get(setupKey) ?? { losses: 0, total: 0, wins: 0 };
    current.total += 1;
    if (outcome === "take_profit") {
      current.wins += 1;
    } else {
      current.losses += 1;
    }
    grouped.set(setupKey, current);
  }

  const payloads = Array.from(grouped.entries()).map(([setupKey, stats]) => ({
    confidence_adjustment: roundPrice(Math.max(-10, Math.min(10, ((stats.wins / Math.max(stats.total, 1)) - 0.5) * 20))),
    last_reviewed_at: new Date().toISOString(),
    losses: stats.losses,
    setup_key: setupKey,
    total_setups: stats.total,
    user_id: userId,
    wins: stats.wins,
  }));

  if (payloads.length > 0) {
    await upsertRows(token, "strategy_weightings", payloads, "user_id,setup_key");
  }
}

function extractSetupKey(confluence: Record<string, unknown> | null, correlationGroup: string | null, symbol: string) {
  return typeof confluence?.setupKey === "string" && confluence.setupKey.trim() ? confluence.setupKey : correlationGroup || symbol;
}

async function fetchMarketContext(fmpSymbol: string): Promise<MarketContext> {
  const providerWarnings: string[] = [];
  const daily = await fetchFmpBars(fmpSymbol, "1day");
  const timeframes: Partial<Record<Timeframe, Bar[]>> = { "1day": daily };

  await Promise.all(
    intradayTimeframes.map(async (timeframe) => {
      try {
        const bars = await fetchFmpBars(fmpSymbol, timeframe);
        if (bars.length >= 40) {
          timeframes[timeframe] = bars;
        }
      } catch (error) {
        providerWarnings.push(`${timeframe}: ${error instanceof Error ? error.message : "FMP intraday request failed"}`);
      }
    }),
  );

  const availableTimeframes = (["1day", ...intradayTimeframes] as Timeframe[]).filter((timeframe) => (timeframes[timeframe]?.length ?? 0) > 0);
  const primaryTimeframe = pickPrimaryTimeframe(timeframes);
  const primary = timeframes[primaryTimeframe] ?? daily;

  return {
    availableTimeframes,
    daily,
    latest: primary.at(-1) ?? daily.at(-1)!,
    primary,
    primaryTimeframe,
    providerWarnings,
    timeframes,
  };
}

async function fetchFmpBars(fmpSymbol: string, timeframe: Timeframe) {
  const endpoint =
    timeframe === "1day"
      ? new URL(`${FMP_API_BASE_URL.replace(/\/$/, "")}/historical-price-eod/full`)
      : new URL(`${FMP_API_BASE_URL.replace(/\/$/, "")}/historical-chart/${timeframe}`);
  endpoint.searchParams.set("symbol", fmpSymbol);
  endpoint.searchParams.set("apikey", FMP_API_KEY ?? "");

  const response = await fetch(endpoint);
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`FMP ${timeframe} request failed (${response.status}): ${responseText.slice(0, 160)}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(`FMP ${timeframe} response was not JSON`);
  }

  if (!Array.isArray(payload)) {
    throw new Error(`FMP ${timeframe} response was not an array`);
  }

  return (payload as FmpBar[])
    .filter((point) => typeof point.date === "string" && typeof point.open === "number" && typeof point.high === "number" && typeof point.low === "number" && typeof point.close === "number")
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
}

function runStrategyCommittee(market: MarketContext, regime: Regime) {
  const votes: StrategyVote[] = [
    voteMultiTimeframeAlignment(market, regime),
    voteSmartMoneyConcepts(market),
    voteTrendPullback(market, regime),
    voteBreakoutFailure(market),
    voteRangeMeanReversion(market, regime),
    voteMomentumDivergence(market),
    voteVolatilityExpansion(market, regime),
    voteVolumeProfile(market),
  ];

  return votes.filter((vote) => vote.score > 0 || vote.direction === "block");
}

function scoreConsensus(votes: StrategyVote[], regime: Regime) {
  const buyScore = votes.filter((vote) => vote.direction === "buy").reduce((sum, vote) => sum + vote.score, 0);
  const sellScore = votes.filter((vote) => vote.direction === "sell").reduce((sum, vote) => sum + vote.score, 0);
  const blockScore = votes.filter((vote) => vote.direction === "block").reduce((sum, vote) => sum + vote.score, 0);
  const totalDirectional = buyScore + sellScore;

  if (blockScore >= 30 || totalDirectional < 42) {
    return { buyScore, sellScore, blockScore, score: 0, side: null as Side | null };
  }

  const side: Side = buyScore >= sellScore ? "buy" : "sell";
  const winningScore = Math.max(buyScore, sellScore);
  const opposingScore = Math.min(buyScore, sellScore);
  const agreementRatio = winningScore / Math.max(totalDirectional, 1);
  const regimeBonus = regime.bias === side ? 8 : regime.bias === "neutral" ? 2 : -8;
  const score = clampInteger(Math.round(30 + winningScore * 0.72 - opposingScore * 0.55 + agreementRatio * 18 + regimeBonus), 0, 100);

  return {
    agreementRatio: Number(agreementRatio.toFixed(3)),
    blockScore,
    buyScore,
    score,
    sellScore,
    side,
  };
}

function classifyRegime(market: MarketContext): Regime {
  const bars = market.daily;
  const latest = bars.at(-1)!;
  const closes = bars.map((bar) => bar.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const atr = averageTrueRange(bars, 14);
  const atrHistory = rollingAtr(bars, 14).slice(-80);
  const volatilityPercentile = percentileRank(atrHistory, atr);
  const trendStrength = Math.abs(ema20 - ema50) / Math.max(atr, 0.00001);
  const compression = volatilityPercentile < 0.28 && trendStrength < 0.9;
  const bias: Direction = latest.close > ema20 && ema20 > ema50 ? "buy" : latest.close < ema20 && ema20 < ema50 ? "sell" : "neutral";

  if (compression) {
    return {
      bias,
      name: "compression",
      rationale: "Volatility is compressed and directional trend strength is modest.",
      trendStrength: Number(trendStrength.toFixed(3)),
      volatilityPercentile: Number(volatilityPercentile.toFixed(3)),
    };
  }

  if (volatilityPercentile > 0.78 && trendStrength < 1.1) {
    return {
      bias: "neutral",
      name: "volatile_chop",
      rationale: "Volatility is elevated without clean trend separation.",
      trendStrength: Number(trendStrength.toFixed(3)),
      volatilityPercentile: Number(volatilityPercentile.toFixed(3)),
    };
  }

  if (trendStrength > 0.95 && bias !== "neutral") {
    return {
      bias,
      name: "trend",
      rationale: "Moving average separation and price location support a trend regime.",
      trendStrength: Number(trendStrength.toFixed(3)),
      volatilityPercentile: Number(volatilityPercentile.toFixed(3)),
    };
  }

  return {
    bias: "neutral",
    name: "range",
    rationale: "Trend separation is limited; range and failed-breakout behavior should carry more weight.",
    trendStrength: Number(trendStrength.toFixed(3)),
    volatilityPercentile: Number(volatilityPercentile.toFixed(3)),
  };
}

function voteMultiTimeframeAlignment(market: MarketContext, regime: Regime): StrategyVote {
  const timeframeBiases = market.availableTimeframes.map((timeframe) => ({
    direction: directionalBias(market.timeframes[timeframe] ?? []),
    timeframe,
  }));
  const buyCount = timeframeBiases.filter((bias) => bias.direction === "buy").length;
  const sellCount = timeframeBiases.filter((bias) => bias.direction === "sell").length;
  const direction: Direction = buyCount > sellCount ? "buy" : sellCount > buyCount ? "sell" : "neutral";
  const alignedWithRegime = regime.bias === direction;
  const agreement = Math.max(buyCount, sellCount) / Math.max(timeframeBiases.length, 1);

  return {
    confidence: Number(agreement.toFixed(2)),
    direction,
    name: "multi_timeframe_bias",
    rationale: `${Math.max(buyCount, sellCount)} of ${timeframeBiases.length} available timeframes align${alignedWithRegime ? " with the higher-timeframe regime" : ""}.`,
    score: direction === "neutral" ? 5 : Math.round(14 + agreement * 16 + Number(alignedWithRegime) * 6),
    timeframe: "multi",
  };
}

function voteSmartMoneyConcepts(market: MarketContext): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const swing = findStructureLevels(bars);
  const atr = averageTrueRange(bars, 14);
  const sweptLow = latest.low < swing.latestSwingLow && latest.close > previous.close;
  const sweptHigh = latest.high > swing.latestSwingHigh && latest.close < previous.close;
  const fairValueGap = Math.abs(previous.high - latest.low) > atr * 0.35 || Math.abs(latest.high - previous.low) > atr * 0.35;
  const changeOfCharacter = latest.close > swing.latestSwingHigh || latest.close < swing.latestSwingLow;
  const direction: Direction = sweptLow ? "buy" : sweptHigh ? "sell" : changeOfCharacter ? (latest.close > previous.close ? "buy" : "sell") : "neutral";
  const score = direction === "neutral" ? 8 : 18 + Number(sweptLow || sweptHigh) * 16 + Number(fairValueGap) * 8 + Number(changeOfCharacter) * 8;

  return {
    confidence: Number((score / 46).toFixed(2)),
    direction,
    name: "smart_money_liquidity",
    rationale: sweptLow ? "Liquidity sweep below structure with bullish recovery." : sweptHigh ? "Liquidity sweep above structure with bearish rejection." : "No clean liquidity sweep; structure still informs invalidation.",
    score,
    timeframe: market.primaryTimeframe,
  };
}

function voteTrendPullback(market: MarketContext, regime: Regime): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const closes = bars.map((bar) => bar.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const atr = averageTrueRange(bars, 14);
  const nearValue = Math.abs(latest.close - ema20) <= atr * 0.75 || Math.abs(latest.close - ema50) <= atr * 0.9;
  const upTrend = latest.close > ema50 && ema20 > ema50;
  const downTrend = latest.close < ema50 && ema20 < ema50;
  const direction: Direction = regime.name === "trend" && nearValue && upTrend ? "buy" : regime.name === "trend" && nearValue && downTrend ? "sell" : "neutral";

  return {
    confidence: direction === "neutral" ? 0.2 : 0.74,
    direction,
    name: "trend_pullback_to_value",
    rationale: direction === "neutral" ? "Trend pullback conditions are not clean enough." : "Trend regime is active and price is pulling back toward value.",
    score: direction === "neutral" ? 4 : 26,
    timeframe: market.primaryTimeframe,
  };
}

function voteBreakoutFailure(market: MarketContext): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const structure = findStructureLevels(bars);
  const brokeHigh = previous.close <= structure.latestSwingHigh && latest.close > structure.latestSwingHigh;
  const brokeLow = previous.close >= structure.latestSwingLow && latest.close < structure.latestSwingLow;
  const failedHigh = latest.high > structure.latestSwingHigh && latest.close < structure.latestSwingHigh;
  const failedLow = latest.low < structure.latestSwingLow && latest.close > structure.latestSwingLow;
  const direction: Direction = brokeHigh || failedLow ? "buy" : brokeLow || failedHigh ? "sell" : "neutral";
  const failure = failedHigh || failedLow;

  return {
    confidence: direction === "neutral" ? 0.15 : failure ? 0.76 : 0.68,
    direction,
    name: failure ? "failed_breakout_reversal" : "breakout_continuation",
    rationale: failure ? "A failed break outside structure signals reversal risk." : direction === "neutral" ? "No decisive structure break." : "Price closed beyond recent structure.",
    score: direction === "neutral" ? 5 : failure ? 24 : 21,
    timeframe: market.primaryTimeframe,
  };
}

function voteRangeMeanReversion(market: MarketContext, regime: Regime): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const range = findStructureLevels(bars);
  const width = Math.max(range.nextLiquidityHigh - range.nextLiquidityLow, 0.00001);
  const location = (latest.close - range.nextLiquidityLow) / width;
  const rsi = relativeStrengthIndex(bars, 14);
  const buy = regime.name === "range" && location < 0.22 && rsi < 42;
  const sell = regime.name === "range" && location > 0.78 && rsi > 58;
  const direction: Direction = buy ? "buy" : sell ? "sell" : "neutral";

  return {
    confidence: direction === "neutral" ? 0.15 : 0.7,
    direction,
    name: "range_mean_reversion",
    rationale: direction === "neutral" ? "Range edge and oscillator conditions are not aligned." : "Range regime with price extended at an edge and oscillator support.",
    score: direction === "neutral" ? 4 : 22,
    timeframe: market.primaryTimeframe,
  };
}

function voteMomentumDivergence(market: MarketContext): StrategyVote {
  const bars = market.primary;
  const recent = bars.slice(-24);
  const first = recent[0];
  const latest = recent.at(-1)!;
  const rsi = relativeStrengthIndex(bars, 14);
  const closes = bars.map((bar) => bar.close);
  const macdSlope = ema(closes, 12) - ema(closes, 26);
  const priceBias: Direction = latest.close >= first.close ? "buy" : "sell";
  const oscillatorBias: Direction = rsi > 55 || macdSlope > 0 ? "buy" : rsi < 45 || macdSlope < 0 ? "sell" : "neutral";
  const divergence = priceBias !== oscillatorBias && oscillatorBias !== "neutral";
  const direction = divergence ? oscillatorBias : oscillatorBias;

  return {
    confidence: oscillatorBias === "neutral" ? 0.2 : divergence ? 0.62 : 0.72,
    direction,
    name: divergence ? "momentum_divergence" : "momentum_confirmation",
    rationale: divergence ? "Price direction and oscillator direction diverge." : "RSI and MACD slope support directional momentum.",
    score: oscillatorBias === "neutral" ? 5 : divergence ? 18 : 24,
    timeframe: market.primaryTimeframe,
  };
}

function voteVolatilityExpansion(market: MarketContext, regime: Regime): StrategyVote {
  const bars = market.primary;
  const latest = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const atr = averageTrueRange(bars, 14);
  const body = Math.abs(latest.close - latest.open);
  const expanding = body > atr * 0.8 && Math.abs(latest.close - previous.close) > atr * 0.55;
  const direction: Direction = expanding ? (latest.close > latest.open ? "buy" : "sell") : "neutral";
  const compressionBonus = regime.name === "compression" ? 8 : 0;

  return {
    confidence: direction === "neutral" ? 0.1 : 0.7,
    direction,
    name: "volatility_expansion",
    rationale: direction === "neutral" ? "No clean expansion candle after compression." : "Range expansion suggests directional participation.",
    score: direction === "neutral" ? 3 : 18 + compressionBonus,
    timeframe: market.primaryTimeframe,
  };
}

function voteVolumeProfile(market: MarketContext): StrategyVote {
  const bars = market.primary.slice(-100);
  const latest = bars.at(-1)!;
  const totalVolume = bars.reduce((sum, bar) => sum + (bar.volume || 1), 0) || bars.length;
  const pointOfControl = bars.reduce((sum, bar) => sum + bar.close * (bar.volume || 1), 0) / totalVolume;
  const atr = averageTrueRange(bars, 14);
  const nearPoc = Math.abs(latest.close - pointOfControl) <= atr * 0.35;
  const stretchedAbove = latest.close > pointOfControl + atr * 1.1;
  const stretchedBelow = latest.close < pointOfControl - atr * 1.1;
  const direction: Direction = nearPoc ? directionalBias(bars) : stretchedBelow ? "buy" : stretchedAbove ? "sell" : "neutral";

  return {
    confidence: direction === "neutral" ? 0.18 : nearPoc ? 0.62 : 0.56,
    direction,
    name: nearPoc ? "volume_value_retest" : "volume_value_extension",
    rationale: nearPoc ? "Price is retesting volume-weighted value." : "Price is extended away from volume-weighted value.",
    score: direction === "neutral" ? 5 : nearPoc ? 18 : 14,
    timeframe: market.primaryTimeframe,
  };
}

function buildPricePlan(side: Side, market: MarketContext, regime: Regime) {
  const bars = market.primary;
  const daily = market.daily;
  const latest = bars.at(-1)!;
  const atr = averageTrueRange(bars, 14);
  const dailyAtr = averageTrueRange(daily, 14);
  const structure = findStructureLevels(bars);
  const dailyStructure = findStructureLevels(daily);
  const entryOffset = atr * (regime.name === "trend" ? 0.42 : 0.55);
  const entryPrice = side === "buy" ? latest.close - entryOffset : latest.close + entryOffset;
  const stopBuffer = Math.max(atr * 1.2, dailyAtr * 0.12);
  const stopLoss = side === "buy" ? Math.min(structure.latestSwingLow - stopBuffer, entryPrice - atr * 1.25) : Math.max(structure.latestSwingHigh + stopBuffer, entryPrice + atr * 1.25);
  const riskDistance = Math.abs(entryPrice - stopLoss);
  const minimumLimitDistance = Math.max(atr * 0.05, Math.abs(latest.close) * 0.00005, 0.00001);

  if (side === "buy" && roundPrice(entryPrice) >= roundPrice(latest.close - minimumLimitDistance)) {
    return null;
  }

  if (side === "sell" && roundPrice(entryPrice) <= roundPrice(latest.close + minimumLimitDistance)) {
    return null;
  }

  if (side === "buy" && roundPrice(stopLoss) >= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "sell" && roundPrice(stopLoss) <= roundPrice(entryPrice)) {
    return null;
  }

  const liquidityTarget = side === "buy" ? Math.max(structure.nextLiquidityHigh, dailyStructure.latestSwingHigh) : Math.min(structure.nextLiquidityLow, dailyStructure.latestSwingLow);
  const minimumTarget = side === "buy" ? entryPrice + riskDistance * 1.8 : entryPrice - riskDistance * 1.8;
  const volatilityTarget = side === "buy" ? entryPrice + Math.max(atr * 3.2, dailyAtr * 0.35) : entryPrice - Math.max(atr * 3.2, dailyAtr * 0.35);
  let takeProfit = side === "buy" ? Math.max(liquidityTarget, minimumTarget, volatilityTarget) : Math.min(liquidityTarget, minimumTarget, volatilityTarget);

  if (side === "buy" && takeProfit <= entryPrice) {
    takeProfit = entryPrice + riskDistance * 2;
  }
  if (side === "sell" && takeProfit >= entryPrice) {
    takeProfit = entryPrice - riskDistance * 2;
  }

  if (side === "buy" && roundPrice(takeProfit) <= roundPrice(entryPrice)) {
    return null;
  }

  if (side === "sell" && roundPrice(takeProfit) >= roundPrice(entryPrice)) {
    return null;
  }

  const rewardRisk = Math.abs(takeProfit - entryPrice) / Math.max(riskDistance, 0.00001);
  if (!Number.isFinite(rewardRisk) || riskDistance <= 0) {
    return null;
  }

  return {
    atr,
    entryPrice,
    rewardRisk,
    stopLogic: "Structure invalidation with ATR buffer and daily-volatility floor.",
    stopLoss,
    targetLogic: "Liquidity target, minimum reward-to-risk, and volatility projection.",
    takeProfit,
  };
}

async function fetchRelevantNews(token: string, symbol: SupportedSymbol) {
  const activeStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const activeEnd = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const upcomingEnd = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const rows = await fetchRows<NewsEvent>(
    token,
    `economic_events?select=provider,currency,event_name,impact,scheduled_at&impact=eq.high&scheduled_at=gte.${encodeURIComponent(activeStart)}&scheduled_at=lte.${encodeURIComponent(upcomingEnd)}`,
  );
  const relevant = rows.filter((event) => isNewsRelevant(symbol, event));

  return {
    active: relevant.filter((event) => typeof event.scheduled_at === "string" && event.scheduled_at >= activeStart && event.scheduled_at <= activeEnd),
    upcoming: relevant.filter((event) => typeof event.scheduled_at === "string" && event.scheduled_at > activeEnd),
  };
}

function isNewsRelevant(symbol: SupportedSymbol, event: NewsEvent) {
  if (event.provider === "fmp_earnings") {
    return equityCalendarSensitiveSymbols.has(symbol);
  }

  const currency = event.currency?.toUpperCase();
  if (!currency) {
    return true;
  }
  return symbolCurrencies[symbol]?.includes(currency) ?? currency === "USD";
}

function getSessionContext(): SessionContext {
  const now = new Date();
  const cest = getZonedParts(now, "Europe/Berlin");
  const minutes = cest.hour * 60 + cest.minute;
  const weekday = cest.weekday;
  const rolloverWindow = minutes >= 23 * 60 + 55 || minutes <= 15;
  const fridayClose = weekday === 5 && minutes >= 22 * 60;

  if (rolloverWindow) {
    return {
      block: false,
      label: "Market rollover window",
      penalty: 10,
      reason: "Market rollover conditions reduce setup quality.",
    };
  }

  if (fridayClose) {
    return {
      block: false,
      label: "Late Friday session",
      penalty: 10,
      reason: "Late Friday liquidity conditions reduce setup quality.",
    };
  }

  const utcHour = now.getUTCHours();
  const londonNyOverlap = utcHour >= 13 && utcHour < 17;
  const londonOpen = utcHour >= 7 && utcHour < 10;
  const lateSession = utcHour >= 20 && utcHour < 22;

  return {
    block: false,
    label: londonNyOverlap ? "London/New York overlap" : londonOpen ? "London open" : lateSession ? "Late-session risk" : "Normal session",
    penalty: lateSession ? 3 : 0,
  };
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "short",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    hour: Number(lookup.hour ?? 0),
    minute: Number(lookup.minute ?? 0),
    weekday: weekdayMap[lookup.weekday ?? "Mon"] ?? 1,
  };
}

function pickPrimaryTimeframe(timeframes: Partial<Record<Timeframe, Bar[]>>): Timeframe {
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

function directionalBias(bars: Bar[]): Direction {
  if (bars.length < 30) {
    return "neutral";
  }
  const latest = bars.at(-1)!;
  const closes = bars.map((bar) => bar.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  if (latest.close > ema20 && ema20 >= ema50) {
    return "buy";
  }
  if (latest.close < ema20 && ema20 <= ema50) {
    return "sell";
  }
  return "neutral";
}

function buildSetupKey(regime: Regime, side: Side, votes: StrategyVote[]) {
  const leaders = votes
    .filter((vote) => vote.direction === side)
    .sort((first, second) => second.score - first.score)
    .slice(0, 3)
    .map((vote) => vote.name)
    .join("+");
  return `${regime.name}_${side}_${leaders}`;
}

function findStructureLevels(bars: Bar[]) {
  const recent = bars.slice(-80);
  const structureSample = recent.slice(0, Math.max(1, recent.length - 5));
  return {
    latestSwingHigh: Math.max(...structureSample.map((bar) => bar.high)),
    latestSwingLow: Math.min(...structureSample.map((bar) => bar.low)),
    nextLiquidityHigh: Math.max(...recent.map((bar) => bar.high)),
    nextLiquidityLow: Math.min(...recent.map((bar) => bar.low)),
  };
}

function averageTrueRange(bars: Bar[], period: number) {
  if (bars.length < 2) {
    return 0;
  }
  const sample = bars.slice(-period - 1);
  const ranges = sample.slice(1).map((bar, index) => {
    const previousClose = sample[index].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
  return ranges.reduce((sum, range) => sum + range, 0) / Math.max(ranges.length, 1);
}

function rollingAtr(bars: Bar[], period: number) {
  const values: number[] = [];
  for (let index = period + 1; index <= bars.length; index += 1) {
    values.push(averageTrueRange(bars.slice(0, index), period));
  }
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

function relativeStrengthIndex(bars: Bar[], period: number) {
  const closes = bars.slice(-period - 1).map((bar) => bar.close);
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    gains += Math.max(delta, 0);
    losses += Math.max(-delta, 0);
  }

  if (losses === 0) {
    return 100;
  }

  const relativeStrength = gains / losses;
  return 100 - 100 / (1 + relativeStrength);
}

function ema(values: number[], period: number) {
  if (values.length === 0) {
    return 0;
  }
  const smoothing = 2 / (period + 1);
  return values.slice(-period * 3).reduce((currentEma, value) => value * smoothing + currentEma * (1 - smoothing), values[0]);
}

function percentileRank(values: number[], current: number) {
  if (values.length === 0) {
    return 0.5;
  }
  return values.filter((value) => value <= current).length / values.length;
}

function getCorrelationGroup(symbol: string) {
  return Object.entries(correlationGroups).find(([, symbols]) => symbols.includes(symbol))?.[0] ?? symbol;
}

async function fetchSingle<T>(token: string, path: string) {
  const rows = await fetchRows<T>(token, /(?:^|[?&])limit=/.test(path) ? path : `${path}${path.includes("?") ? "&" : "?"}limit=1`);
  return rows[0] ?? null;
}

async function fetchRows<T>(token: string, path: string): Promise<T[]> {
  const response = await supabaseFetch(token, path);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

async function insertSingle(token: string, table: string, payload: Record<string, unknown>) {
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

async function updateRows<T = unknown>(token: string, path: string, payload: Record<string, unknown>): Promise<T[]> {
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

async function upsertRows<T = unknown>(token: string, table: string, payload: Record<string, unknown> | Array<Record<string, unknown>>, onConflict: string): Promise<T[]> {
  const response = await supabaseFetch(token, `${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    body: JSON.stringify(payload),
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T[];
}

async function supabaseFetch(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY ?? "",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function getAuthenticatedUser(token: string | null) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    return null;
  }

  const user = await response.json();
  return typeof user?.id === "string" ? user : null;
}

function getBearerToken(req: Request) {
  return req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? null;
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function resolveProviderSymbols(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const config = symbolMap[normalized] as SymbolConfig | undefined;
  const sanitized = sanitizeFmpSymbol(symbol);
  const symbols = config ? [config.primary, config.fallback].filter(Boolean) : [sanitized].filter(Boolean);
  return Array.from(new Set(symbols)) as string[];
}

function sanitizeFmpSymbol(value: string) {
  const symbol = value.toUpperCase().replace(/[^A-Z0-9.^_-]/g, "").slice(0, 32);
  return symbol || null;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function toTimestamp(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "https://app.windwardline.com";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
