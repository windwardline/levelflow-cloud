const MASSIVE_API_BASE_URL = Deno.env.get("MASSIVE_API_BASE_URL") ?? "https://api.massive.com";
const MASSIVE_API_KEY = Deno.env.get("MASSIVE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "https://windwardline.github.io,http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const symbolMap = {
  EURUSD: "C:EURUSD",
  GBPUSD: "C:GBPUSD",
  USDJPY: "C:USDJPY",
  AUDUSD: "C:AUDUSD",
  USDCAD: "C:USDCAD",
  USDCHF: "C:USDCHF",
  NZDUSD: "C:NZDUSD",
  XAUUSD: "C:XAUUSD",
  XAGUSD: "C:XAGUSD",
  US30: "I:DJI",
  NAS100: "I:NDX",
  SPX500: "I:SPX",
} as const;

const correlationGroups: Record<string, string[]> = {
  eur_beta: ["EURUSD", "GBPUSD"],
  commodity_fx: ["AUDUSD", "NZDUSD", "USDCAD"],
  metals: ["XAUUSD", "XAGUSD"],
  us_indices: ["US30", "NAS100", "SPX500"],
};

type SupportedSymbol = keyof typeof symbolMap;
type Side = "buy" | "sell";

type AnalyzeRequest = {
  accountId?: string;
  days?: number;
  symbol?: string;
};

type AccountRow = {
  id: string;
  user_id: string;
  program_code: "e8_one" | "e8_signature" | "e8_pro";
  account_name: string;
  initial_balance: number | string;
  current_balance: number | string;
  current_equity: number | string;
  daily_drawdown_limit: number | string;
  daily_profit: number | string;
  status: string;
};

type Bar = {
  close: number;
  high: number;
  low: number;
  open: number;
  time: number;
  volume: number;
};

type MassiveAgg = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  t?: number;
  v?: number;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method not allowed" }, 405);
    }

    if (!MASSIVE_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
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

  if (!body.accountId) {
    return jsonResponse(req, { error: "A saved account is required before analysis" }, 400);
  }

  const uiSymbol = normalizeSymbol(body.symbol ?? "EURUSD");
  const ticker = symbolMap[uiSymbol as SupportedSymbol];
  if (!ticker) {
    return jsonResponse(req, { error: "Unsupported LevelFlow market symbol" }, 400);
  }

  const account = await fetchSingle<AccountRow>(
    token,
    `user_accounts?select=id,user_id,program_code,account_name,initial_balance,current_balance,current_equity,daily_drawdown_limit,daily_profit,status&id=eq.${encodeURIComponent(body.accountId)}`,
  );

  if (!account || account.user_id !== user.id) {
    return jsonResponse(req, { error: "Account not found for this user" }, 404);
  }

  if (!["evaluation", "funded", "paused"].includes(account.status)) {
    return jsonResponse(req, { blocked: true, reason: "Account is not in an analyzable status." });
  }

  const newsEvents = await fetchHighImpactNews(token);
  const newsBlocked = account.program_code !== "e8_signature" && newsEvents.length > 0;
  if (newsBlocked) {
    return jsonResponse(req, {
      blocked: true,
      reason: "High-impact news blackout is active for this program.",
      newsEvents,
    });
  }

  const balance = Number(account.current_balance || account.initial_balance);
  const dailyProfit = Number(account.daily_profit || 0);
  if (account.program_code === "e8_pro" && dailyProfit / Math.max(balance, 1) >= 0.0185) {
    return jsonResponse(req, {
      blocked: true,
      reason: "E8 Pro daily profit is near the hard 2% cap.",
    });
  }

  const bars = await fetchMassiveBars(ticker, body.days ?? 160);
  if (bars.length < 80) {
    return jsonResponse(req, { blocked: true, reason: "Not enough Massive.com bars returned for analyzer confidence." });
  }

  const group = getCorrelationGroup(uiSymbol);
  const setup = await analyzeSetup(token, uiSymbol as SupportedSymbol, ticker, group, bars, account, newsEvents);
  if (!setup) {
    return jsonResponse(req, { blocked: true, reason: "No setup met the LevelFlow confluence threshold." });
  }

  const activeCorrelated = await fetchRows<{ id: string; symbol: string; confidence_score: number }>(
    token,
    `trade_setups?select=id,symbol,confidence_score&correlation_group=eq.${encodeURIComponent(group)}&status=in.(generated,placed)&created_at=gte.${encodeURIComponent(
      new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    )}`,
  );

  const strongerExisting = activeCorrelated.find((row) => row.confidence_score >= setup.confidenceScore);
  if (strongerExisting) {
    return jsonResponse(req, {
      blocked: true,
      reason: `Correlation filter kept existing ${strongerExisting.symbol} setup with equal or higher confidence.`,
      correlationGroup: group,
    });
  }

  const pendingOrder = await insertSingle(token, "pending_orders", {
    user_id: user.id,
    account_id: account.id,
    symbol: uiSymbol,
    massive_symbol: ticker,
    side: setup.side,
    order_type: "limit",
    entry_price: setup.entryPrice,
    stop_loss: setup.stopLoss,
    take_profit: setup.takeProfit,
    lot_size: setup.lotSize,
    confidence_score: setup.confidenceScore,
    status: "generated",
    expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });

  const tradeSetup = await insertSingle(token, "trade_setups", {
    user_id: user.id,
    account_id: account.id,
    pending_order_id: pendingOrder.id,
    symbol: uiSymbol,
    massive_symbol: ticker,
    side: setup.side,
    limit_entry: setup.entryPrice,
    stop_loss: setup.stopLoss,
    take_profit: setup.takeProfit,
    breakeven_trigger_price: setup.breakevenTriggerPrice,
    confidence_score: setup.confidenceScore,
    confluence: setup.confluence,
    risk_model: setup.riskModel,
    news_context: { events: newsEvents, signatureBypass: account.program_code === "e8_signature" },
    correlation_group: group,
    status: "generated",
  });

    return jsonResponse(req, {
      advisoryOnly: true,
      message: "Generated advisory limit-order setup. LevelFlow does not execute trades.",
      pendingOrderId: pendingOrder.id,
      setupId: tradeSetup.id,
      setup,
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

async function analyzeSetup(
  token: string,
  symbol: SupportedSymbol,
  ticker: string,
  correlationGroup: string,
  bars: Bar[],
  account: AccountRow,
  newsEvents: unknown[],
) {
  const smc = detectSmartMoneyConcepts(bars);
  const volumeProfile = detectVolumeProfileImbalance(bars);
  const momentum = detectMomentumDivergence(bars);
  const atr = averageTrueRange(bars, 14);
  const structure = findStructureLevels(bars);
  const latest = bars.at(-1)!;
  const side: Side = smc.bias === "bullish" && momentum.bias !== "bearish" ? "buy" : "sell";
  const setupKey = `${smc.bias}_${volumeProfile.pocRetest ? "poc_retest" : "imbalance"}_${momentum.bias}`;
  const weight = await fetchSingle<{ confidence_adjustment: number | string }>(
    token,
    `strategy_weightings?select=confidence_adjustment&setup_key=eq.${encodeURIComponent(setupKey)}&limit=1`,
  );
  const weightAdjustment = Number(weight?.confidence_adjustment ?? 0);

  let entryPrice = smc.limitLevel;
  if (side === "buy" && entryPrice >= latest.close) {
    entryPrice = latest.close - atr * 0.5;
  }
  if (side === "sell" && entryPrice <= latest.close) {
    entryPrice = latest.close + atr * 0.5;
  }

  const stopLoss = side === "buy" ? Math.max(0.00001, structure.latestSwingLow - atr * 1.5) : structure.latestSwingHigh + atr * 1.5;
  let takeProfit = side === "buy" ? structure.nextLiquidityHigh : structure.nextLiquidityLow;
  if (side === "buy" && takeProfit <= entryPrice) {
    takeProfit = entryPrice + atr * 3;
  }
  if (side === "sell" && takeProfit >= entryPrice) {
    takeProfit = Math.max(0.00001, entryPrice - atr * 3);
  }

  const riskDistance = Math.abs(entryPrice - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entryPrice);
  const rewardRisk = rewardDistance / Math.max(riskDistance, 0.00001);
  const confidenceScore = Math.max(
    0,
    Math.min(100, Math.round(smc.score + volumeProfile.score + momentum.score + Math.min(15, rewardRisk * 4) + weightAdjustment)),
  );

  if (confidenceScore < 62 || rewardRisk < 1.2) {
    return null;
  }

  const balance = Number(account.current_balance || account.initial_balance);
  const dailyDrawdownLimit = Number(account.daily_drawdown_limit || balance * 0.02);
  const maxLoss = Math.min(dailyDrawdownLimit * 0.75, balance * 0.005);
  const lotSize = Number(Math.max(0.01, maxLoss / Math.max(riskDistance, 0.00001)).toFixed(2));
  const breakevenTriggerPrice = side === "buy" ? entryPrice + rewardDistance * 0.5 : entryPrice - rewardDistance * 0.5;

  return {
    symbol,
    massiveSymbol: ticker,
    side,
    orderType: "limit" as const,
    entryPrice: roundPrice(entryPrice),
    stopLoss: roundPrice(stopLoss),
    takeProfit: roundPrice(takeProfit),
    breakevenTriggerPrice: roundPrice(breakevenTriggerPrice),
    lotSize,
    confidenceScore,
    correlationGroup,
    confluence: {
      setupKey,
      smartMoneyConcepts: smc,
      volumeProfile,
      momentum,
      rewardRisk: Number(rewardRisk.toFixed(2)),
      strategyWeightAdjustment: weightAdjustment,
    },
    riskModel: {
      atr,
      maxLoss,
      dailyDrawdownLimit,
      newsEventsTracked: newsEvents.length,
    },
  };
}

async function fetchMassiveBars(ticker: string, days: number) {
  const to = isoDate(new Date());
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - clampInteger(days, 90, 220));
  const endpoint = new URL(`/v2/aggs/ticker/${ticker}/range/1/day/${isoDate(fromDate)}/${to}`, MASSIVE_API_BASE_URL);
  endpoint.searchParams.set("adjusted", "true");
  endpoint.searchParams.set("sort", "asc");
  endpoint.searchParams.set("limit", "500");

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${MASSIVE_API_KEY}`,
    },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.status ?? response.statusText);
  }

  return ((payload.results ?? []) as MassiveAgg[])
    .filter((point) => typeof point.t === "number" && typeof point.o === "number" && typeof point.h === "number" && typeof point.l === "number" && typeof point.c === "number")
    .map((point) => ({
      close: point.c as number,
      high: point.h as number,
      low: point.l as number,
      open: point.o as number,
      time: point.t as number,
      volume: point.v ?? 0,
    }));
}

async function fetchHighImpactNews(token: string) {
  const windowStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const windowEnd = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return fetchRows(token, `economic_events?select=currency,event_name,impact,scheduled_at&impact=eq.high&scheduled_at=gte.${encodeURIComponent(windowStart)}&scheduled_at=lte.${encodeURIComponent(windowEnd)}`);
}

function detectSmartMoneyConcepts(bars: Bar[]) {
  const latest = bars.at(-1)!;
  const previous = bars.at(-2)!;
  const swing = findStructureLevels(bars);
  const atr = averageTrueRange(bars, 14);
  const sweptLow = latest.low < swing.latestSwingLow && latest.close > previous.close;
  const sweptHigh = latest.high > swing.latestSwingHigh && latest.close < previous.close;
  const fairValueGap = Math.abs(previous.high - latest.low) > atr * 0.35 || Math.abs(latest.high - previous.low) > atr * 0.35;
  const changeOfCharacter = latest.close > swing.latestSwingHigh || latest.close < swing.latestSwingLow;
  const bias = sweptLow ? "bullish" : sweptHigh ? "bearish" : latest.close > previous.close ? "bullish" : "bearish";
  const limitLevel = bias === "bullish" ? Math.min(previous.open, previous.close) : Math.max(previous.open, previous.close);

  return {
    bias,
    changeOfCharacter,
    fairValueGap,
    limitLevel,
    liquiditySweep: sweptLow || sweptHigh,
    score: 18 + Number(sweptLow || sweptHigh) * 15 + Number(fairValueGap) * 10 + Number(changeOfCharacter) * 10,
  };
}

function detectVolumeProfileImbalance(bars: Bar[]) {
  const recent = bars.slice(-80);
  const totalVolume = recent.reduce((sum, bar) => sum + bar.volume, 0) || recent.length;
  const pointOfControl = recent.reduce((sum, bar) => sum + bar.close * (bar.volume || 1), 0) / totalVolume;
  const latest = bars.at(-1)!;
  const distance = Math.abs(latest.close - pointOfControl) / latest.close;

  return {
    imbalancePct: Number((distance * 100).toFixed(4)),
    pocRetest: distance < 0.0015,
    pointOfControl,
    score: distance < 0.0015 ? 24 : distance < 0.004 ? 14 : 6,
  };
}

function detectMomentumDivergence(bars: Bar[]) {
  const recent = bars.slice(-24);
  const first = recent[0];
  const latest = recent.at(-1)!;
  const rsi = relativeStrengthIndex(bars, 14);
  const closes = bars.map((bar) => bar.close);
  const macdSlope = ema(closes, 12) - ema(closes, 26);
  const priceBias = latest.close >= first.close ? "bullish" : "bearish";
  const oscillatorBias = rsi > 55 || macdSlope > 0 ? "bullish" : rsi < 45 || macdSlope < 0 ? "bearish" : "neutral";

  return {
    bias: oscillatorBias,
    divergence: priceBias !== oscillatorBias && oscillatorBias !== "neutral",
    macdSlope,
    rsi,
    score: oscillatorBias === "neutral" ? 5 : priceBias === oscillatorBias ? 24 : 14,
  };
}

function findStructureLevels(bars: Bar[]) {
  const recent = bars.slice(-80);
  const structureSample = recent.slice(0, -5);
  return {
    latestSwingHigh: Math.max(...structureSample.map((bar) => bar.high)),
    latestSwingLow: Math.min(...structureSample.map((bar) => bar.low)),
    nextLiquidityHigh: Math.max(...recent.map((bar) => bar.high)),
    nextLiquidityLow: Math.min(...recent.map((bar) => bar.low)),
  };
}

function averageTrueRange(bars: Bar[], period: number) {
  const sample = bars.slice(-period - 1);
  const ranges = sample.slice(1).map((bar, index) => {
    const previousClose = sample[index].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
  return ranges.reduce((sum, range) => sum + range, 0) / Math.max(ranges.length, 1);
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
  const smoothing = 2 / (period + 1);
  return values.slice(-period * 3).reduce((currentEma, value) => value * smoothing + currentEma * (1 - smoothing), values[0]);
}

function getCorrelationGroup(symbol: string) {
  return Object.entries(correlationGroups).find(([, symbols]) => symbols.includes(symbol))?.[0] ?? symbol;
}

async function fetchSingle<T>(token: string, path: string) {
  const rows = await fetchRows<T>(token, `${path}${path.includes("?") ? "&" : "?"}limit=1`);
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

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] ?? "https://windwardline.github.io";

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
