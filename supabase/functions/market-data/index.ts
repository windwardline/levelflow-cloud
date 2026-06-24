const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ??
  "https://financialmodelingprep.com/stable";
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const ALLOWED_ORIGINS = (Deno.env.get("APP_ALLOWED_ORIGINS") ??
  "https://levelflow.windwardline.com,https://windwardline.github.io,http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const SUPABASE_FETCH_TIMEOUT_MS = 8_000;
const MARKET_DATA_FETCH_TIMEOUT_MS = 12_000;

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

const temporarilyUnavailableSymbols = new Set([
  "SP",
  "NSDQ",
  "NIKKEI",
  "DOW",
  "DAX",
  "ASX",
  "WTI",
  "BRENT",
]);

const intradayTimeframes = ["15min", "1hour", "4hour"] as const;

type SupportedSymbol = string;
type ChartTimeframe = "1day" | (typeof intradayTimeframes)[number];

type MarketDataRequest = {
  days?: number;
  from?: string;
  symbol?: string;
  timeframe?: string;
  to?: string;
};

type FmpBar = {
  close?: number;
  date?: string;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }

    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method not allowed" }, 405);
    }

    if (!FMP_API_KEY) {
      return jsonResponse(req, { error: "FMP API key is not configured" }, 500);
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return jsonResponse(req, {
        error: "Authenticated Supabase session required",
      }, 401);
    }

    let body: MarketDataRequest;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const requestedSymbol =
      typeof body.symbol === "string" && body.symbol.trim()
        ? body.symbol.trim()
        : "EURUSD";
    const uiSymbol = normalizeSymbol(requestedSymbol);
    if (temporarilyUnavailableSymbols.has(uiSymbol)) {
      return jsonResponse(
        req,
        {
          error:
            "This market is temporarily unavailable while LevelFlow verifies chart coverage.",
          symbol: uiSymbol,
        },
        400,
      );
    }

    const providerSymbols = resolveProviderSymbols(requestedSymbol);
    if (providerSymbols.length === 0) {
      return jsonResponse(
        req,
        { error: "Unsupported LevelFlow market symbol" },
        400,
      );
    }

    const timeframe = normalizeTimeframe(body.timeframe);
    const { from, to } = resolveDateWindow(body, timeframe);
    const failures: string[] = [];
    let payload: FmpBar[] = [];
    let ticker = providerSymbols[0];

    for (const providerSymbol of providerSymbols) {
      const result = await fetchFmpBars(providerSymbol, timeframe, from, to);
      if (result.ok && result.payload.length > 0) {
        payload = result.payload;
        ticker = providerSymbol;
        break;
      }
      failures.push(`${providerSymbol}: ${result.status}`);
    }

    if (payload.length === 0) {
      return jsonResponse(
        req,
        {
          error: "FMP market data request failed",
          providerStatus: failures.join(" | ") || "NO_DATA",
        },
        502,
      );
    }

    const points = payload
      .filter((point) =>
        typeof point.date === "string" && typeof point.close === "number"
      )
      .map((point) => ({
        close: point.close as number,
        high: typeof point.high === "number" ? point.high : null,
        low: typeof point.low === "number" ? point.low : null,
        open: typeof point.open === "number" ? point.open : null,
        time: timeframe === "1day"
          ? (point.date as string).slice(0, 10)
          : Math.trunc(toTimestamp(point.date as string) / 1000),
        value: point.close as number,
        volume: typeof point.volume === "number" ? point.volume : null,
      }))
      .sort((first, second) =>
        sortableTime(first.time) - sortableTime(second.time)
      )
      .slice(timeframe === "1day" ? -260 : -500);

    const latest = points.at(-1);

    return jsonResponse(req, {
      adjusted: true,
      asOf: new Date().toISOString(),
      from,
      latestClose: latest?.close ?? null,
      points,
      provider: "FMP",
      providerStatus: ticker === providerSymbols[0]
        ? "OK"
        : `OK_FALLBACK:${ticker}`,
      resultsCount: points.length,
      symbol: uiSymbol,
      timeframe,
      ticker,
      to,
    });
  } catch (error) {
    console.error("market-data request failed", error);
    return jsonResponse(req, {
      error: "Chart data could not load. Try again shortly.",
    }, 500);
  }
});

async function getAuthenticatedUser(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }

  const authorization = req.headers.get("Authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
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

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function sanitizeFmpSymbol(value: string) {
  const symbol = value.toUpperCase().replace(/[^A-Z0-9.^_-]/g, "").slice(0, 32);
  return symbol || null;
}

function resolveProviderSymbols(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const config = symbolMap[normalized] as SymbolConfig | undefined;
  const sanitized = sanitizeFmpSymbol(symbol);
  const symbols = config
    ? [config.primary, config.fallback].filter(Boolean)
    : [sanitized].filter(Boolean);
  return Array.from(new Set(symbols)) as string[];
}

async function fetchFmpBars(
  providerSymbol: string,
  timeframe: ChartTimeframe,
  from: string,
  to: string,
) {
  const endpoint = timeframe === "1day"
    ? new URL(
      `${FMP_API_BASE_URL.replace(/\/$/, "")}/historical-price-eod/full`,
    )
    : new URL(
      `${FMP_API_BASE_URL.replace(/\/$/, "")}/historical-chart/${timeframe}`,
    );
  endpoint.searchParams.set("symbol", providerSymbol);
  endpoint.searchParams.set("apikey", FMP_API_KEY ?? "");

  if (timeframe === "1day") {
    endpoint.searchParams.set("from", from);
    endpoint.searchParams.set("to", to);
  }

  const response = await fetchWithTimeout(
    endpoint,
    {},
    MARKET_DATA_FETCH_TIMEOUT_MS,
  );
  const responseText = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      payload: [] as FmpBar[],
      status: responseText.slice(0, 120) || response.statusText,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    return {
      ok: false,
      payload: [] as FmpBar[],
      status: "INVALID_JSON",
    };
  }

  if (!Array.isArray(payload)) {
    return {
      ok: false,
      payload: [] as FmpBar[],
      status: "UNEXPECTED_RESPONSE",
    };
  }

  return {
    ok: payload.length > 0,
    payload: payload as FmpBar[],
    status: payload.length > 0 ? "OK" : "NO_DATA",
  };
}

function normalizeTimeframe(value: unknown): ChartTimeframe {
  return typeof value === "string" &&
      [...intradayTimeframes, "1day"].includes(value as ChartTimeframe)
    ? (value as ChartTimeframe)
    : "1hour";
}

function resolveDateWindow(body: MarketDataRequest, timeframe: ChartTimeframe) {
  const to = isIsoDate(body.to) ? body.to : isoDate(new Date());
  const dayCount = clampInteger(
    body.days ?? (timeframe === "1day" ? 120 : 14),
    2,
    timeframe === "1day" ? 260 : 60,
  );
  const defaultFromDate = new Date(`${to}T00:00:00.000Z`);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - dayCount);
  const from = isIsoDate(body.from) ? body.from : isoDate(defaultFromDate);

  return { from, to };
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
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

function sortableTime(value: string | number) {
  return typeof value === "number" ? value : toTimestamp(value);
}

function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = MARKET_DATA_FETCH_TIMEOUT_MS,
) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
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
