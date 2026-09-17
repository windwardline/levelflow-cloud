import { recordAnalyzerEvent } from "../trade-analyzer/telemetry.ts";
import { redactProviderSecrets } from "../trade-analyzer/redact.ts";
import {
  assertSpendPermit,
  type FmpSpendPermit,
  fmpSpendRefusalBody,
  mayFetch,
  recordFetch,
} from "../trade-analyzer/fmpBudget.ts";
import { fmpBudgetDeps } from "../trade-analyzer/fmpBudgetDb.ts";
import { DESK_PARKED } from "../_shared/deskParking.ts";
import { getAssetType } from "../trade-analyzer/calibration.ts";
import {
  defaultScanSymbols,
  getHeadlineNewsSymbols,
} from "../trade-analyzer/symbols.ts";
import { batchNewsSymbols } from "./newsBatching.ts";
import {
  keyFingerprint,
  routeNewsCalendarRequest,
  verifyBody,
} from "./gate.ts";
import {
  type EconomicEvent,
  parseEarningsEventTime,
  parseEventTime,
  toEventRow,
} from "./eventRows.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const NEWS_SYNC_TOKEN = Deno.env.get("NEWS_SYNC_TOKEN");
const ECONOMIC_CALENDAR_PROVIDER = Deno.env.get("ECONOMIC_CALENDAR_PROVIDER") ??
  "fmp";
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ??
  "https://financialmodelingprep.com/stable";
const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
const MARKET_MOVING_EARNINGS_SYMBOLS = new Set([
  "AAPL",
  "AMZN",
  "AVGO",
  "GOOGL",
  "GOOG",
  "META",
  "MSFT",
  "NVDA",
  "TSLA",
]);

const SUPABASE_FETCH_TIMEOUT_MS = 8_000;
const PROVIDER_FETCH_TIMEOUT_MS = 12_000;

// What this run could not do, carried out of the fetchers so the response and
// analyzer_events can both say it. Threaded rather than logged in place: a
// console line inside an edge function is not a signal anything reads, which is
// how the earnings and headline feeds could have been failing for weeks.
type IngestDiagnostics = {
  // Feeds whose fetch threw. The scheduled calendar is load-bearing and throws
  // out of the whole run; earnings and headlines are additive, so one failing
  // must not lose the other two — but it must not vanish either.
  failedFeeds: string[];
  // Rows the provider sent with a date this code could not read. Dropped, not
  // stamped with "now" (see parseEventTime).
  unparseableDates: number;
};

// A row whose time could not be read arrives here as null and is dropped by the
// request handler, which is also where the drops are counted.
type MaybeTimedEvent = Omit<EconomicEvent, "scheduled_at"> & {
  scheduled_at: string | null;
};

/**
 * Derived from the scan roster, not typed by hand.
 *
 * Both lists were exactly exhaustive over their classes when written and
 * CRYPTO_NEWS_SYMBOLS then stopped at 8 while crypto grew to 33 — so 25
 * markets could never receive a headline penalty worth up to 4 confidence
 * points, a standing one-directional advantage over the eight covered
 * majors. FOREX_NEWS_SYMBOLS still equals its class exactly, by luck; it is
 * derived here so the luck is not load-bearing.
 */
const FOREX_NEWS_SYMBOLS = getHeadlineNewsSymbols(
  defaultScanSymbols.filter((symbol) => getAssetType(symbol) === "forex"),
);
const CRYPTO_NEWS_SYMBOLS = getHeadlineNewsSymbols(
  defaultScanSymbols.filter((symbol) => getAssetType(symbol) === "crypto"),
);
const STOCK_NEWS_SYMBOLS = [
  "BNO",
  "CPER",
  "DIA",
  "EWG",
  "EWJ",
  "EWA",
  "GLD",
  "IEF",
  // The 3-7 and 1-3 year funds, added with ZFUSD's and ZTUSD's headline
  // proxies: a proxy nothing ingests matches nothing.
  "IEI",
  "SHY",
  "IWM",
  "QQQ",
  "SLV",
  "SPY",
  "TLT",
  "UNG",
  "USO",
];

Deno.serve(async (req) => {
  try {
    // The door first (gate.ts). POST with the token syncs; GET with the token
    // VERIFIES and spends nothing: scripts/ops/sync-function-secrets.sh proves
    // the token and the FMP_API_KEY this function holds without buying a feed.
    // It returns before any spend decision and before any provider call.
    const route = routeNewsCalendarRequest(req.method, isAuthorized(req));
    if (route === "method-not-allowed") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }
    if (route === "unauthorized") {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    if (route === "verify") {
      return jsonResponse(
        verifyBody({
          fingerprint: await keyFingerprint(FMP_API_KEY),
          parked: DESK_PARKED,
        }),
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({
        error: "Supabase service configuration is incomplete",
      }, 500);
    }

    const windowStart = new Date();
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
    const windowEnd = new Date();
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

    const diagnostics: IngestDiagnostics = {
      failedFeeds: [],
      unparseableDates: 0,
    };
    let fetched: MaybeTimedEvent[];
    if (ECONOMIC_CALENDAR_PROVIDER === "finnhub") {
      fetched = await fetchFinnhubEvents(windowStart, windowEnd);
    } else {
      // ONE SPEND DECISION PER SYNC, charged `background`: nobody is waiting on
      // the calendar, so it yields first when the day is contested. Not parked
      // with the desk (§21i: no coupling between the parking gate and the
      // crons); it fails closed on a ledger outage. A refusal is recorded where
      // every scheduled job reports and answers 503, which the sync watchdog
      // reads as a failed call.
      const spend = await mayFetch(fmpBudgetDeps(), "background");
      if (!spend.allowed) {
        await recordAnalyzerEvent({
          action: "news_calendar_sync",
          message: spend.reason,
          metadata: { fmpSpendRefused: spend.refusal },
          status: "blocked",
        });
        return jsonResponse(fmpSpendRefusalBody(spend), 503);
      }
      fetched = await fetchFmpEvents(
        windowStart,
        windowEnd,
        diagnostics,
        spend.permit,
      );
    }
    // One filter, one count. A row the provider dated in a shape this code
    // cannot read is dropped here rather than carried in with scheduled_at set
    // to the current moment (I2).
    const timed = fetched.filter((event): event is EconomicEvent =>
      event.scheduled_at !== null
    );
    diagnostics.unparseableDates = fetched.length - timed.length;
    const events = dedupeEvents(timed);
    // Cron firing is not the job succeeding: a run that lost a feed or dropped
    // rows is an error even when it also inserted thousands of good ones, and
    // it says so where every other scheduled job reports (analyzer_events).
    const degraded = diagnostics.failedFeeds.length > 0 ||
      diagnostics.unparseableDates > 0;

    if (events.length === 0) {
      await recordAnalyzerEvent({
        action: "news_calendar_sync",
        message: describeIngest(diagnostics) ??
          "No calendar events were returned.",
        metadata: { ...diagnostics, inserted: 0 },
        status: degraded ? "error" : "success",
      });
      return jsonResponse({
        configured: Boolean(FMP_API_KEY || FINNHUB_API_KEY),
        ...diagnostics,
        inserted: 0,
        provider: ECONOMIC_CALENDAR_PROVIDER,
      });
    }

    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/economic_events?on_conflict=provider,external_id`,
      {
        body: JSON.stringify(events.map(toEventRow)),
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        method: "POST",
      },
      SUPABASE_FETCH_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    await recordAnalyzerEvent({
      action: "news_calendar_sync",
      message: describeIngest(diagnostics),
      metadata: { ...diagnostics, inserted: events.length },
      status: degraded ? "error" : "success",
    });

    return jsonResponse({
      configured: true,
      ...diagnostics,
      inserted: events.length,
      provider: ECONOMIC_CALENDAR_PROVIDER,
      windowEnd: windowEnd.toISOString(),
      windowStart: windowStart.toISOString(),
    });
  } catch (error) {
    const detail = describeError(error);
    console.error("news-calendar sync failed", detail);
    await recordAnalyzerEvent({
      action: "news_calendar_sync",
      message: `news-calendar sync failed: ${detail}`,
      status: "error",
    });
    return jsonResponse({ detail, error: "News calendar sync failed." }, 500);
  }
});

// Null when the run was clean — recordAnalyzerEvent stores a null message, and
// a success row with nothing to say should say nothing.
function describeIngest(diagnostics: IngestDiagnostics) {
  const notes: string[] = [];
  if (diagnostics.failedFeeds.length > 0) {
    notes.push(`feeds unavailable: ${diagnostics.failedFeeds.join(", ")}`);
  }
  if (diagnostics.unparseableDates > 0) {
    notes.push(`${diagnostics.unparseableDates} events had unreadable dates`);
  }
  return notes.length > 0 ? notes.join("; ") : null;
}

// Network-level fetch errors embed the full request URL — including the
// provider apikey — so credentials must be stripped before the message is
// logged or returned to the (token-authenticated) caller.
function describeError(error: unknown) {
  const message = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
  // One scrub for every function (trade-analyzer/redact.ts), not a local twin.
  return redactProviderSecrets(message).slice(0, 400);
}

function isAuthorized(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(NEWS_SYNC_TOKEN && token === NEWS_SYNC_TOKEN);
}

async function fetchFmpEvents(
  windowStart: Date,
  windowEnd: Date,
  diagnostics: IngestDiagnostics,
  permit: FmpSpendPermit,
): Promise<MaybeTimedEvent[]> {
  // The scheduled calendar is load-bearing — it is what isBlockingNewsEvent
  // reads — so its failure throws out of the whole run. Earnings and headlines
  // are additive: losing one must not lose the other two, but it must not
  // vanish either, so each records the feed it lost by name.
  const economicEvents = await fetchFmpEconomicEvents(
    windowStart,
    windowEnd,
    permit,
  );
  let earningsEvents: MaybeTimedEvent[] = [];
  let headlineEvents: MaybeTimedEvent[] = [];

  try {
    earningsEvents = await fetchFmpEarningsEvents(windowStart, windowEnd, permit);
  } catch (error) {
    diagnostics.failedFeeds.push("earnings");
    console.error("news-calendar earnings feed failed", describeError(error));
  }

  try {
    headlineEvents = await fetchFmpHeadlineEvents(windowStart, windowEnd, permit);
  } catch (error) {
    diagnostics.failedFeeds.push("headlines");
    console.error("news-calendar headline feed failed", describeError(error));
  }

  return [...economicEvents, ...earningsEvents, ...headlineEvents];
}

async function fetchFmpEconomicEvents(
  windowStart: Date,
  windowEnd: Date,
  permit: FmpSpendPermit,
): Promise<MaybeTimedEvent[]> {
  assertSpendPermit(permit);
  if (!FMP_API_KEY) {
    return [];
  }

  const url = new URL(
    `${FMP_API_BASE_URL.replace(/\/$/, "")}/economic-calendar`,
  );
  url.searchParams.set("from", isoDate(windowStart));
  url.searchParams.set("to", isoDate(windowEnd));
  url.searchParams.set("apikey", FMP_API_KEY);

  const response = await fetchWithTimeout(url, {}, PROVIDER_FETCH_TIMEOUT_MS);
  const responseText = await response.text();
  // BACKGROUND, and that word is the whole design — the permit carries it.
  // Nobody is waiting on the calendar sync: it runs on a schedule to keep the
  // event table warm. Under the standing rule it therefore hits its ceiling
  // first when the day is contested, so a live operator's scan is still served
  // when the background work has already been refused.
  void recordFetch(
    fmpBudgetDeps(),
    permit,
    new TextEncoder().encode(responseText).length,
  );
  if (!response.ok) {
    throw new Error(
      `FMP economic calendar request failed (${response.status}): ${
        responseText.slice(0, 180)
      }`,
    );
  }

  const payload = JSON.parse(responseText);
  if (!Array.isArray(payload)) {
    throw new Error("FMP economic calendar response was not an array");
  }

  return payload.map((rawEvent) => {
    const event = rawEvent as Record<string, unknown>;
    const scheduledAt = parseEventTime(event.date);
    return {
      country: optionalString(event.country),
      currency: String(event.currency ?? "USD"),
      event_type: "scheduled",
      event_name: String(event.event ?? event.name ?? "Economic Event"),
      external_id: stableExternalId(
        "fmp",
        event.event ?? event.name,
        event.date,
        event.currency,
      ),
      impact: normalizeImpact(event.impact),
      provider: "fmp",
      raw_payload: event,
      scheduled_at: scheduledAt,
    };
  });
}

async function fetchFmpEarningsEvents(
  windowStart: Date,
  windowEnd: Date,
  permit: FmpSpendPermit,
): Promise<MaybeTimedEvent[]> {
  assertSpendPermit(permit);
  if (!FMP_API_KEY) {
    return [];
  }

  const url = new URL(
    `${FMP_API_BASE_URL.replace(/\/$/, "")}/earnings-calendar`,
  );
  url.searchParams.set("from", isoDate(windowStart));
  url.searchParams.set("to", isoDate(windowEnd));
  url.searchParams.set("apikey", FMP_API_KEY);

  const response = await fetchWithTimeout(url, {}, PROVIDER_FETCH_TIMEOUT_MS);
  const responseText = await response.text();
  // Same ledger, same permit, same reason as the economic calendar above: this
  // is background work, so it yields first when the day is contested. Recorded
  // BEFORE the ok check, because a refused response still spent the bytes.
  void recordFetch(
    fmpBudgetDeps(),
    permit,
    new TextEncoder().encode(responseText).length,
  );
  if (!response.ok) {
    throw new Error(
      `FMP earnings calendar request failed (${response.status}): ${
        responseText.slice(0, 180)
      }`,
    );
  }

  const payload = JSON.parse(responseText);
  if (!Array.isArray(payload)) {
    throw new Error("FMP earnings calendar response was not an array");
  }

  return payload.flatMap((rawEvent) => {
    const event = rawEvent as Record<string, unknown>;
    const symbol = optionalString(event.symbol)?.toUpperCase();
    const date = optionalString(event.date);
    if (!symbol || !date || !MARKET_MOVING_EARNINGS_SYMBOLS.has(symbol)) {
      return [];
    }

    return [
      {
        country: "US",
        currency: "USD",
        event_type: "earnings" as const,
        event_name: `${symbol} earnings`,
        external_id: stableExternalId("fmp_earnings", symbol, date, event.time),
        impact: "high" as const,
        provider: "fmp_earnings",
        raw_payload: event,
        scheduled_at: parseEarningsEventTime(date, event.time),
      },
    ];
  });
}

async function fetchFmpHeadlineEvents(
  windowStart: Date,
  windowEnd: Date,
  permit: FmpSpendPermit,
): Promise<MaybeTimedEvent[]> {
  if (!FMP_API_KEY) {
    return [];
  }

  const [forexNews, cryptoNews, stockNews] = await Promise.all([
    fetchFmpNewsEndpoint("forex", FOREX_NEWS_SYMBOLS, windowStart, windowEnd, permit),
    fetchFmpNewsEndpoint("crypto", CRYPTO_NEWS_SYMBOLS, windowStart, windowEnd, permit),
    fetchFmpNewsEndpoint("stock", STOCK_NEWS_SYMBOLS, windowStart, windowEnd, permit),
  ]);

  return [...forexNews, ...cryptoNews, ...stockNews];
}

async function fetchFmpNewsEndpoint(
  category: "crypto" | "forex" | "stock",
  symbols: string[],
  windowStart: Date,
  windowEnd: Date,
  permit: FmpSpendPermit,
): Promise<MaybeTimedEvent[]> {
  // One request per batch. A single request carrying the whole list looks
  // like it worked — HTTP 200, a full 100 articles — while everything past
  // the 25th symbol is missing from it, which is why this went unnoticed.
  const batched = await Promise.all(
    batchNewsSymbols(symbols).map((batch) =>
      fetchFmpNewsBatch(category, batch, windowStart, windowEnd, permit)
    ),
  );
  return batched.flat();
}

async function fetchFmpNewsBatch(
  category: "crypto" | "forex" | "stock",
  symbols: string[],
  windowStart: Date,
  windowEnd: Date,
  permit: FmpSpendPermit,
): Promise<MaybeTimedEvent[]> {
  assertSpendPermit(permit);
  const url = new URL(
    `${FMP_API_BASE_URL.replace(/\/$/, "")}/news/${category}`,
  );
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("page", "0");
  url.searchParams.set("limit", "100");
  url.searchParams.set("apikey", FMP_API_KEY ?? "");

  const response = await fetchWithTimeout(url, {}, PROVIDER_FETCH_TIMEOUT_MS);
  const responseText = await response.text();
  // Same ledger, same permit, same reason as the economic calendar above: this
  // is background work, so it yields first when the day is contested. Recorded
  // BEFORE the ok check, because a refused response still spent the bytes.
  void recordFetch(
    fmpBudgetDeps(),
    permit,
    new TextEncoder().encode(responseText).length,
  );
  if (!response.ok) {
    throw new Error(
      `FMP ${category} news request failed (${response.status}): ${
        responseText.slice(0, 180)
      }`,
    );
  }

  const payload = JSON.parse(responseText);
  if (!Array.isArray(payload)) {
    throw new Error(`FMP ${category} news response was not an array`);
  }

  return payload.flatMap((rawItem) => {
    const item = rawItem as Record<string, unknown>;
    const publishedAt = parseEventTime(
      item.publishedDate ?? item.date ?? item.created_at,
    );
    // A headline with no readable publication time has no window to fall in and
    // no stable external_id either, so it is dropped here rather than counted
    // against the run: unlike a scheduled event, nothing is lost by it.
    if (publishedAt === null) {
      return [];
    }
    const publishedTime = new Date(publishedAt).getTime();
    if (
      publishedTime < windowStart.getTime() ||
      publishedTime > windowEnd.getTime()
    ) {
      return [];
    }

    const symbolsFromItem = extractNewsSymbols(item)
      .filter((symbol) => symbols.includes(symbol));
    if (symbolsFromItem.length === 0) {
      return [];
    }

    const title = String(
      item.title ?? item.headline ?? item.site ?? "Market headline",
    );
    const text = String(item.text ?? item.content ?? item.summary ?? "");
    const url = optionalString(item.url ?? item.link);

    return symbolsFromItem.slice(0, 4).map((symbol) => ({
      country: category === "stock" ? "US" : undefined,
      currency: currencyForHeadlineSymbol(symbol),
      event_name: title,
      event_type: "headline" as const,
      external_id: stableExternalId(
        "fmp_news",
        category,
        symbol,
        publishedAt,
        url ?? title,
      ),
      impact: classifyHeadlineImpact(`${title} ${text}`),
      provider: "fmp_news",
      raw_payload: {
        ...item,
        newsCategory: category,
      },
      scheduled_at: publishedAt,
      symbol,
      url,
    }));
  });
}

async function fetchFinnhubEvents(
  windowStart: Date,
  windowEnd: Date,
): Promise<MaybeTimedEvent[]> {
  if (!FINNHUB_API_KEY) {
    return [];
  }

  const url = new URL("https://finnhub.io/api/v1/calendar/economic");
  url.searchParams.set("from", isoDate(windowStart));
  url.searchParams.set("to", isoDate(windowEnd));
  url.searchParams.set("token", FINNHUB_API_KEY);

  const response = await fetchWithTimeout(url, {}, PROVIDER_FETCH_TIMEOUT_MS);
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Finnhub economic calendar request failed (${response.status}): ${
        responseText.slice(0, 180)
      }`,
    );
  }

  const payload = JSON.parse(responseText) as Record<string, unknown>;
  const events = Array.isArray(payload.economicCalendar)
    ? payload.economicCalendar
    : [];

  return events.map((rawEvent) => {
    const event = rawEvent as Record<string, unknown>;
    return {
      country: optionalString(event.country),
      currency: String(event.currency ?? "USD"),
      event_type: "scheduled",
      event_name: String(event.event ?? "Economic Event"),
      external_id: stableExternalId(
        "finnhub",
        event.id ?? event.event,
        event.time,
        event.currency,
      ),
      impact: normalizeImpact(event.impact),
      provider: "finnhub",
      raw_payload: event,
      scheduled_at: parseEventTime(event.time),
    };
  });
}

function stableExternalId(provider: string, ...parts: unknown[]) {
  return `${provider}:${parts.map((part) => String(part ?? "")).join(":")}`;
}

function dedupeEvents(events: EconomicEvent[]) {
  return Array.from(
    new Map(
      events.map((event) => [`${event.provider}:${event.external_id}`, event]),
    ).values(),
  );
}

function optionalString(value: unknown) {
  return value ? String(value) : undefined;
}

function extractNewsSymbols(item: Record<string, unknown>) {
  const rawSymbols = [
    item.symbol,
    item.ticker,
    item.tickers,
    item.symbols,
  ].filter(Boolean);
  const symbols = rawSymbols.flatMap((value) => {
    if (Array.isArray(value)) {
      return value;
    }
    return String(value).split(",");
  });

  return Array.from(
    new Set(
      symbols
        .map((symbol) => normalizeSymbol(String(symbol)))
        .filter((symbol) => symbol.length > 0),
    ),
  );
}

function currencyForHeadlineSymbol(symbol: string) {
  if (/^[A-Z]{6}$/.test(symbol)) {
    return symbol.slice(-3);
  }
  return "USD";
}

function classifyHeadlineImpact(value: string): "low" | "medium" | "high" {
  const normalized = value.toLowerCase();
  const highImpactPatterns = [
    /\brate\b/,
    /\binflation\b/,
    /\bcpi\b/,
    /\bpce\b/,
    /\bnfp\b/,
    /\bpayrolls?\b/,
    /\bfed\b/,
    /\becb\b/,
    /\bopec\b/,
    /\binventory\b/,
    /\bwar\b/,
    /\bsanction/,
    /\btariff/,
    /\bdefault\b/,
    /\bbankruptcy\b/,
    /\bhack(ed|ing)?\b/,
    /\betf\b/,
  ];
  const mediumImpactPatterns = [
    /\bcentral bank\b/,
    /\btreasury\b/,
    /\byield\b/,
    /\bgdp\b/,
    /\bpmi\b/,
    /\bjobs?\b/,
    /\bcrude\b/,
    /\boil\b/,
    /\bgold\b/,
    /\bsilver\b/,
    /\bcrypto\b/,
    /\bbitcoin\b/,
    /\bethereum\b/,
    /\bregulat/,
    /\bearnings?\b/,
  ];

  if (highImpactPatterns.some((pattern) => pattern.test(normalized))) {
    return "high";
  }
  if (mediumImpactPatterns.some((pattern) => pattern.test(normalized))) {
    return "medium";
  }
  return "low";
}

function normalizeImpact(value: unknown): "low" | "medium" | "high" {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("high") || normalized === "3") {
    return "high";
  }
  if (normalized.includes("medium") || normalized === "2") {
    return "medium";
  }
  return "low";
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = PROVIDER_FETCH_TIMEOUT_MS,
) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    status,
  });
}
