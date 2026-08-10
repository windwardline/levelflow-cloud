import { type FmpBar, normalizeFmpBars } from "./bars.ts";
import { parseFmpQuoteSnapshot, type QuoteSnapshot } from "./quotes.ts";
import {
  type Bar,
  intradayTimeframes,
  type MarketContext,
  type Timeframe,
} from "./types.ts";

const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ??
  "https://financialmodelingprep.com/stable";
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const MARKET_DATA_FETCH_TIMEOUT_MS = 12_000;
const QUOTE_FETCH_TIMEOUT_MS = 6_000;
const CANDLE_CACHE_TTL_MS: Record<Timeframe, number> = {
  "1min": 20_000,
  "5min": 30_000,
  "15min": 45_000,
  "1hour": 90_000,
  "4hour": 180_000,
  "1day": 10 * 60_000,
};
const SLOW_PROVIDER_CALL_MS = 2_500;
const candleCache = new Map<string, { bars: Bar[]; expiresAt: number }>();

type MarketDataEventPayload = {
  action: string;
  cacheHit?: boolean | null;
  durationMs?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
  providerSymbol?: string | null;
  status: "cache_hit" | "error" | "slow_provider";
};

type MarketDataEventRecorder = (
  event: MarketDataEventPayload,
) => Promise<void>;

type FetchWithTimeout = (
  input: string | URL,
  init?: RequestInit,
  timeoutMs?: number,
) => Promise<Response>;

export type ProviderContextResult = {
  /** 1m: true when any provider attempt threw (network, timeout, non-2xx) —
   * as opposed to answering with thin history. The blocked reason keys on
   * this so a transient failure never reads as a coverage verdict. */
  fetchFailed: boolean;
  fmpSymbol: string | null;
  marketContext: MarketContext | null;
  providerFailures: string[];
};

export async function fetchFirstAvailableMarketContext(
  providerSymbols: string[],
  recordEvent: MarketDataEventRecorder,
  fetchWithTimeout: FetchWithTimeout,
  // 2a (2026-08-09): the daily completion gate, built by the caller around
  // the ROSTER symbol (provider fallbacks may not classify) — drops the
  // genuinely-partial current row and weekend transients before any
  // indicator reads the series. Required, not defaulted: an ungated path
  // would silently fork what live indicators see from what the replay
  // corpus admits (dailyCompletion.ts holds the shared rule and evidence).
  completeDaily: (bars: Bar[]) => Bar[],
): Promise<ProviderContextResult> {
  const providerFailures: string[] = [];
  // 1m: the two failure arms below are different facts — a thrown fetch is a
  // transient the reader should retry, thin history is a durable statement
  // about the instrument — and the blocked reason downstream must not
  // collapse them into the durable one.
  let sawFetchFailure = false;

  for (const [index, providerSymbol] of providerSymbols.entries()) {
    try {
      const marketContext = await fetchMarketContext(
        providerSymbol,
        recordEvent,
        fetchWithTimeout,
        completeDaily,
      );
      if (marketContext.daily.length >= 80) {
        if (index > 0) {
          marketContext.providerWarnings.unshift(
            `Using FMP fallback symbol ${providerSymbol}; primary ${
              providerSymbols[0]
            } was unavailable.`,
          );
        }
        return {
          fetchFailed: sawFetchFailure,
          fmpSymbol: providerSymbol,
          marketContext,
          providerFailures,
        };
      }

      providerFailures.push(
        `${providerSymbol}: insufficient daily history (${marketContext.daily.length} bars)`,
      );
    } catch (error) {
      sawFetchFailure = true;
      providerFailures.push(
        `${providerSymbol}: ${
          error instanceof Error ? error.message : "FMP request failed"
        }`,
      );
    }
  }

  return {
    fetchFailed: sawFetchFailure,
    fmpSymbol: null,
    marketContext: null,
    providerFailures,
  };
}

async function fetchMarketContext(
  fmpSymbol: string,
  recordEvent: MarketDataEventRecorder,
  fetchWithTimeout: FetchWithTimeout,
  completeDaily: (bars: Bar[]) => Bar[],
): Promise<MarketContext> {
  const providerWarnings: string[] = [];
  const [fetchedDaily, quote] = await Promise.all([
    fetchFmpBars(fmpSymbol, "1day", recordEvent, fetchWithTimeout),
    fetchFmpQuoteSnapshot(fmpSymbol, recordEvent, fetchWithTimeout),
  ]);
  // Gate before anything reads the series: sufficiency (the >=80 check
  // upstream), timeframes["1day"], and the latest-bar fallback must all see
  // completed days only. The chart feed (market-data) deliberately stays
  // ungated — a forming candle on screen is truth; in an indicator it is a
  // leak.
  const daily = completeDaily(fetchedDaily);
  const timeframes: Partial<Record<Timeframe, Bar[]>> = { "1day": daily };

  await Promise.all(
    intradayTimeframes.map(async (timeframe) => {
      try {
        const bars = await fetchFmpBars(
          fmpSymbol,
          timeframe,
          recordEvent,
          fetchWithTimeout,
        );
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
  const latestTimeframe = pickLatestTimeframe(timeframes);
  const latestSource = timeframes[latestTimeframe] ?? primary;

  return {
    availableTimeframes,
    daily,
    latest: latestSource.at(-1) ?? primary.at(-1) ?? daily.at(-1)!,
    latestTimeframe,
    primary,
    primaryTimeframe,
    providerWarnings,
    quote,
    timeframes,
  };
}

async function fetchFmpQuoteSnapshot(
  fmpSymbol: string,
  recordEvent: MarketDataEventRecorder,
  fetchWithTimeout: FetchWithTimeout,
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
      await recordEvent({
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
      await recordEvent({
        action: "quote_fetch",
        durationMs,
        providerSymbol: fmpSymbol,
        status: "slow_provider",
      });
    }

    return quote;
  } catch (error) {
    await recordEvent({
      action: "quote_fetch",
      durationMs: Math.round(performance.now() - startedAt),
      message: error instanceof Error ? error.message : "FMP quote failed",
      providerSymbol: fmpSymbol,
      status: "error",
    });
    return null;
  }
}

export async function fetchFmpBars(
  fmpSymbol: string,
  timeframe: Timeframe,
  recordEvent: MarketDataEventRecorder,
  fetchWithTimeout: FetchWithTimeout,
) {
  const cacheKey = `${fmpSymbol}:${timeframe}`;
  const cached = candleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    await recordEvent({
      action: "market_data_fetch",
      cacheHit: true,
      providerSymbol: fmpSymbol,
      status: "cache_hit",
      metadata: {
        bars: cached.bars.length,
        timeframe,
      },
    });
    return cached.bars;
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
  const window = defaultDateWindow(timeframe);
  endpoint.searchParams.set("from", window.from);
  endpoint.searchParams.set("to", window.to);

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
    await recordEvent({
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
    await recordEvent({
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
    await recordEvent({
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
    await recordEvent({
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
    await recordEvent({
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

  const bars = normalizeFmpBars(
    payload as FmpBar[],
    maxBarsForTimeframe(timeframe),
  );

  candleCache.set(cacheKey, {
    bars,
    expiresAt: Date.now() + CANDLE_CACHE_TTL_MS[timeframe],
  });

  // Shared with the cache rather than copied: every consumer reads bars and
  // builds its own arrays, and tests/barDecode.test.ts keeps it that way.
  return bars;
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

function pickLatestTimeframe(
  timeframes: Partial<Record<Timeframe, Bar[]>>,
): Timeframe {
  if ((timeframes["1min"]?.length ?? 0) > 0) {
    return "1min";
  }
  if ((timeframes["5min"]?.length ?? 0) > 0) {
    return "5min";
  }
  if ((timeframes["15min"]?.length ?? 0) > 0) {
    return "15min";
  }
  if ((timeframes["1hour"]?.length ?? 0) > 0) {
    return "1hour";
  }
  if ((timeframes["4hour"]?.length ?? 0) > 0) {
    return "4hour";
  }
  return "1day";
}

function defaultDateWindow(timeframe: Timeframe) {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - defaultLookbackDays(timeframe));
  return {
    from: fromDate.toISOString().slice(0, 10),
    to: toDate.toISOString().slice(0, 10),
  };
}

function defaultLookbackDays(timeframe: Timeframe) {
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
      return 1_500;
  }
}

function maxBarsForTimeframe(timeframe: Timeframe) {
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
