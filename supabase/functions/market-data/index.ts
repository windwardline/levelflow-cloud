const MASSIVE_API_BASE_URL = Deno.env.get("MASSIVE_API_BASE_URL") ?? "https://api.massive.com";
const MASSIVE_API_KEY = Deno.env.get("MASSIVE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

type SupportedSymbol = keyof typeof symbolMap;

type MarketDataRequest = {
  days?: number;
  from?: string;
  symbol?: string;
  to?: string;
};

type MassiveAgg = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  t?: number;
  v?: number;
};

type MassiveAggResponse = {
  adjusted?: boolean;
  results?: MassiveAgg[];
  resultsCount?: number;
  status?: string;
  ticker?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!MASSIVE_API_KEY) {
    return jsonResponse({ error: "Massive.com API key is not configured" }, 500);
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    return jsonResponse({ error: "Authenticated Supabase session required" }, 401);
  }

  let body: MarketDataRequest;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const uiSymbol = normalizeSymbol(body.symbol ?? "EURUSD");
  const ticker = symbolMap[uiSymbol as SupportedSymbol];
  if (!ticker) {
    return jsonResponse({ error: "Unsupported LevelFlow market symbol" }, 400);
  }

  const { from, to } = resolveDateWindow(body);
  const endpoint = new URL(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`, MASSIVE_API_BASE_URL);
  endpoint.searchParams.set("adjusted", "true");
  endpoint.searchParams.set("sort", "asc");
  endpoint.searchParams.set("limit", "120");

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${MASSIVE_API_KEY}`,
    },
  });

  let payload: MassiveAggResponse;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    return jsonResponse(
      {
        error: "Massive.com market data request failed",
        providerStatus: payload.status ?? response.statusText,
      },
      response.status,
    );
  }

  const points = (payload.results ?? [])
    .filter((point) => typeof point.t === "number" && typeof point.c === "number")
    .map((point) => ({
      close: point.c as number,
      high: point.h ?? null,
      low: point.l ?? null,
      open: point.o ?? null,
      time: new Date(point.t as number).toISOString().slice(0, 10),
      value: point.c as number,
      volume: point.v ?? null,
    }));

  const latest = points.at(-1);

  return jsonResponse({
    adjusted: payload.adjusted ?? true,
    asOf: new Date().toISOString(),
    from,
    latestClose: latest?.close ?? null,
    points,
    provider: "Massive.com",
    providerStatus: payload.status ?? "OK",
    resultsCount: payload.resultsCount ?? points.length,
    symbol: uiSymbol,
    ticker: payload.ticker ?? ticker,
    to,
  });
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

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function resolveDateWindow(body: MarketDataRequest) {
  const to = isIsoDate(body.to) ? body.to : isoDate(new Date());
  const dayCount = clampInteger(body.days ?? 45, 7, 120);
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}
