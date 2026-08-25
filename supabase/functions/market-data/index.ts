import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { classifyUpstreamFailure } from "./upstreamStatus.ts";

const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ??
  "https://financialmodelingprep.com/stable";
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_FETCH_TIMEOUT_MS = 8_000;
const MARKET_DATA_FETCH_TIMEOUT_MS = 15_000;

// SYMBOLS: external the market-data function's own mirror | 98 of 98 vs known
const symbolMap: Record<string, string> = {
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
  BZUSD: "BZUSD",
  CLUSD: "CLUSD",
  ESUSD: "ESUSD",
  GCUSD: "GCUSD",
  HGUSD: "HGUSD",
  MGCUSD: "MGCUSD",
  NGUSD: "NGUSD",
  NQUSD: "NQUSD",
  RTYUSD: "RTYUSD",
  SIUSD: "SIUSD",
  YMUSD: "YMUSD",
  ZBUSD: "ZBUSD",
  ZNUSD: "ZNUSD",
  SP: "^GSPC",
  // Task 16c: ASX/DAX/NSDQ's ETF fallbacks measured 41x-560x off their index
  // primaries — ASX/EWA ~304x, NSDQ/QQQ ~41x, DAX/"DAX" ~560x
  // (docs/research/e8-feed-verification-2026-08-02.md, Open Item 7) — the
  // same "tracks the primary at scale" failure WTI's USO fallback failed
  // below, so no symbol keeps a stand-in source anymore. noTradeSymbols below
  // additionally refuses these three, and the rest of the measured no-trade
  // list, before any provider fetch.
  NSDQ: "^NDX",
  NIKKEI: "^N225",
  DOW: "^DJI",
  DAX: "^GDAXI",
  ASX: "^AXJO",
  // Task 16b: USO measured ~53% off CLUSD's scale (F10, docs/research/
  // e8-feed-verification-2026-08-02.md) — a fund share price is not a
  // per-barrel number, so no fallback stands in here. When CLUSD has no
  // bars, the honest behavior is the existing no-data path.
  WTI: "CLUSD",
  // BRENT left 2026-08-09 (amendment 32) — no chart series to serve.
  XRPUSD: "XRPUSD",
  SOLUSD: "SOLUSD",
  LTCUSD: "LTCUSD",
  ETHUSD: "ETHUSD",
  BTCUSD: "BTCUSD",
  BNBUSD: "BNBUSD",
  BCHUSD: "BCHUSD",
  ADAUSD: "ADAUSD",
  ZFUSD: "ZFUSD",
  ZTUSD: "ZTUSD",
  HOUSD: "HOUSD",
  RBUSD: "RBUSD",
  PLUSD: "PLUSD",
  PAUSD: "PAUSD",
  ZCUSX: "ZCUSX",
  ZSUSX: "ZSUSX",
  ZLUSX: "ZLUSX",
  ZMUSD: "ZMUSD",
  ZOUSX: "ZOUSX",
  ZRUSD: "ZRUSD",
  LEUSX: "LEUSX",
  GFUSX: "GFUSX",
  HEUSX: "HEUSX",
  // Amendment 32 (2026-08-09): FESX/FDAX/EMD/NKD/FDXM left this map — each
  // was served on its underlying's CASH index series, which was never a
  // match. Their masterList rows carry the dormancy and the re-probe path.
  AAVEUSD: "AAVEUSD",
  ALGOUSD: "ALGOUSD",
  ARWUSD: "ARUSD",
  ATOMUSD: "ATOMUSD",
  AVAXUSD: "AVAXUSD",
  CAKEUSD: "CAKEUSD",
  DASHUSD: "DASHUSD",
  DOGEUSD: "DOGEUSD",
  DOTUSD: "DOTUSD",
  DYDXUSD: "DYDXUSD",
  EGLDUSD: "EGLDUSD",
  ETCUSD: "ETCUSD",
  FILUSD: "FILUSD",
  GRTUSD: "GRTUSD",
  HBARUSD: "HBARUSD",
  IMXUSD: "IMXUSD",
  LINKUSD: "LINKUSD",
  NEARUSD: "NEARUSD",
  THETAUSD: "THETAUSD",
  TRUMPUSD: "OTRUMPUSD",
  TRXUSD: "TRXUSD",
  UNIUSD: "UNIUSD",
  XLMUSD: "XLMUSD",
  XMRUSD: "XMRUSD",
  XTZUSD: "XTZUSD",
};

// Hidden until the chart feed is verified against the matching traded CFD.
//
// Empty since 2026-08-07. ASX was the last entry and its own condition is met:
// F2 measured ^AXJO against E8's AUS200 book at -5.7 (0.06%) during Sydney's
// cash session — "TRACKS (cash hours)", the same verdict NIKKEI and DAX carry.
// Mirrors src/lib/symbolMap.ts's TEMPORARILY_HIDDEN_ASSET_SYMBOLS.
const temporarilyUnavailableSymbols = new Set<string>([]);

// The measured no-trade list — mirrors trade-analyzer/symbols.ts's
// noTradeSymbols byte-for-byte (tests/feedSource.test.ts pins it). That set
// is the analyzer's own law (owner directive, r15); this file never edits
// its membership, only copies its enforcement, the same way the analyzer
// already refuses these symbols before any engine work (Task 16c: this
// function previously had no equivalent of its own, a defense-in-depth gap
// reachable only by a direct authenticated call, never the shipped client).
const noTradeSymbols = new Set<string>([
  // Mirrors trade-analyzer/symbols.ts across the Deno boundary, which neither
  // file can cross by import. Empty since the 2026-08-07 release: every market
  // E8 offers with an FMP match is served, and the only ground for withholding
  // is no verifiable data source. tests/feedSource.test.ts derives both sets
  // from source and asserts equality in both directions.
]);

const intradayTimeframes = ["1min", "5min", "15min", "1hour", "4hour"] as const;

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
    if (!isKnownSymbol(uiSymbol)) {
      return jsonResponse(
        req,
        { error: "Unsupported Levelflow market symbol" },
        400,
      );
    }

    if (noTradeSymbols.has(uiSymbol)) {
      return jsonResponse(
        req,
        {
          blocked: true,
          reason:
            "Levelflow's measured record says this market does not earn setups, so reviews are off for it. It stays under analysis and returns if the data changes.",
          symbol: uiSymbol,
        },
        400,
      );
    }

    if (temporarilyUnavailableSymbols.has(uiSymbol)) {
      return jsonResponse(
        req,
        {
          error:
            "This market is temporarily unavailable while Levelflow verifies chart coverage.",
          symbol: uiSymbol,
        },
        400,
      );
    }

    const providerSymbols = resolveProviderSymbols(requestedSymbol);
    if (providerSymbols.length === 0) {
      return jsonResponse(
        req,
        { error: "Unsupported Levelflow market symbol" },
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
      const providerStatus = failures.join(" | ") || "NO_DATA";
      return jsonResponse(
        req,
        {
          error: "FMP market data request failed",
          providerStatus,
          // A machine-readable name for "the provider's 30-day allowance is
          // spent", so callers can tell that apart from a regression without
          // pattern-matching a vendor's prose themselves. The deploy gate
          // reads this: it stands down for exhaustion and still fails for
          // everything else (§21j Phase 1).
          providerQuotaExhausted:
            classifyUpstreamFailure(providerStatus) === "quota-exhausted",
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
      .slice(-maxPointsForTimeframe(timeframe));

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

// Fix round 1 (Task 16c): checking a request's symbol against noTradeSymbols
// (or temporarilyUnavailableSymbols) by string membership alone isn't
// enough — an FMP alias like "^NDX" normalizes to "NDX", not NSDQ's own
// canonical key, so it read as an unrecognized-but-fine symbol and reached a
// real provider fetch (the same pre-existing gap ASX's "^AXJO" always had).
// Mirrors trade-analyzer/symbols.ts's own isKnownSymbol exactly — the same
// precondition trade-analyzer's scanOpportunities applies to every requested
// symbol before any of it, including reviewCurrentMarket's own no-trade
// check, ever runs. Resolving identity first closes the alias hole and the
// ASX variant in one gate: neither shape is a canonical symbolMap key, so
// neither ever reaches resolveProviderSymbols.
function isKnownSymbol(symbol: string) {
  return normalizeSymbol(symbol) in symbolMap;
}

function sanitizeFmpSymbol(value: string) {
  const symbol = value.toUpperCase().replace(/[^A-Z0-9.^_-]/g, "").slice(0, 32);
  return symbol || null;
}

function resolveProviderSymbols(symbol: string) {
  const normalized = normalizeSymbol(symbol);
  const provider = symbolMap[normalized];
  if (provider) {
    return [provider];
  }
  const sanitized = sanitizeFmpSymbol(symbol);
  return sanitized ? [sanitized] : [];
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
  endpoint.searchParams.set("from", from);
  endpoint.searchParams.set("to", to);

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
    body.days ?? defaultDayCount(timeframe),
    2,
    maxDayCount(timeframe),
  );
  const defaultFromDate = new Date(`${to}T00:00:00.000Z`);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - dayCount);
  const from = isIsoDate(body.from) ? body.from : isoDate(defaultFromDate);

  return { from, to };
}

function defaultDayCount(timeframe: ChartTimeframe) {
  switch (timeframe) {
    case "1min":
      return 3;
    case "5min":
      return 10;
    case "15min":
      return 45;
    case "1hour":
      return 90;
    case "4hour":
      return 180;
    case "1day":
      return 520;
  }
}

function maxDayCount(timeframe: ChartTimeframe) {
  switch (timeframe) {
    case "1min":
      return 7;
    case "5min":
      return 30;
    case "15min":
      return 90;
    case "1hour":
      return 180;
    case "4hour":
      return 365;
    case "1day":
      return 1_500;
  }
}

function maxPointsForTimeframe(timeframe: ChartTimeframe) {
  switch (timeframe) {
    case "1min":
      return 1_800;
    case "5min":
      return 2_400;
    case "15min":
      return 3_000;
    case "1hour":
      return 2_000;
    case "4hour":
      return 1_200;
    case "1day":
      return 1_000;
  }
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

// 2b (2026-08-09): FMP stamps bars in America/New_York wall time, and this
// function used to read them as UTC — every chart timestamp the client drew
// was 4-5 DST-variable hours off. Duplicated from trade-analyzer/bars.ts
// rather than imported (Edge Functions are self-contained modules); the two
// copies are pinned to each other by tests/barDecode.test.ts across the
// boundary, the same discipline every duplicated fact here follows. NaN for
// garbage — the Date.now() fallback stamped corrupt input as the present.
function toTimestamp(value: string): number {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    return Number.NaN;
  }
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const read = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: "America/New_York",
      year: "numeric",
    }).formatToParts(new Date(instant));
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const readHour = Number(lookup.hour ?? "0");
    return Date.UTC(
      Number(lookup.year ?? year),
      Number(lookup.month ?? month) - 1,
      Number(lookup.day ?? day),
      readHour === 24 ? 0 : readHour,
      Number(lookup.minute ?? minute),
      Number(lookup.second ?? second),
    );
  };
  const corrected = utcGuess - (read(utcGuess) - utcGuess);
  return corrected - (read(corrected) - utcGuess);
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

