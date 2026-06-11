const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const NEWS_SYNC_TOKEN = Deno.env.get("NEWS_SYNC_TOKEN");
const ECONOMIC_CALENDAR_PROVIDER = Deno.env.get("ECONOMIC_CALENDAR_PROVIDER") ?? "fmp";
const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ?? "https://financialmodelingprep.com/stable";
const FINNHUB_API_KEY = Deno.env.get("FINNHUB_API_KEY");
const MARKET_MOVING_EARNINGS_SYMBOLS = new Set(["AAPL", "AMZN", "AVGO", "GOOGL", "GOOG", "META", "MSFT", "NVDA", "TSLA"]);

type EconomicEvent = {
  country?: string;
  currency: string;
  event_name: string;
  external_id: string;
  impact: "low" | "medium" | "high";
  provider: string;
  raw_payload: Record<string, unknown>;
  scheduled_at: string;
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!isAuthorized(req)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Supabase service configuration is incomplete" }, 500);
    }

    const windowStart = new Date();
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
    const windowEnd = new Date();
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);

    const events = dedupeEvents(await fetchProviderEvents(windowStart, windowEnd));
    if (events.length === 0) {
      return jsonResponse({
        configured: Boolean(FMP_API_KEY || FINNHUB_API_KEY),
        inserted: 0,
        provider: ECONOMIC_CALENDAR_PROVIDER,
      });
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/economic_events?on_conflict=provider,external_id`, {
      body: JSON.stringify(events),
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return jsonResponse({
      configured: true,
      inserted: events.length,
      provider: ECONOMIC_CALENDAR_PROVIDER,
      windowEnd: windowEnd.toISOString(),
      windowStart: windowStart.toISOString(),
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "News calendar sync failed" }, 500);
  }
});

function isAuthorized(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(NEWS_SYNC_TOKEN && token === NEWS_SYNC_TOKEN);
}

async function fetchProviderEvents(windowStart: Date, windowEnd: Date) {
  if (ECONOMIC_CALENDAR_PROVIDER === "finnhub") {
    return fetchFinnhubEvents(windowStart, windowEnd);
  }

  return fetchFmpEvents(windowStart, windowEnd);
}

async function fetchFmpEvents(windowStart: Date, windowEnd: Date): Promise<EconomicEvent[]> {
  const economicEvents = await fetchFmpEconomicEvents(windowStart, windowEnd);
  let earningsEvents: EconomicEvent[] = [];

  try {
    earningsEvents = await fetchFmpEarningsEvents(windowStart, windowEnd);
  } catch {
    earningsEvents = [];
  }

  return [...economicEvents, ...earningsEvents];
}

async function fetchFmpEconomicEvents(windowStart: Date, windowEnd: Date): Promise<EconomicEvent[]> {
  if (!FMP_API_KEY) {
    return [];
  }

  const url = new URL(`${FMP_API_BASE_URL.replace(/\/$/, "")}/economic-calendar`);
  url.searchParams.set("from", isoDate(windowStart));
  url.searchParams.set("to", isoDate(windowEnd));
  url.searchParams.set("apikey", FMP_API_KEY);

  const response = await fetch(url);
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`FMP economic calendar request failed (${response.status}): ${responseText.slice(0, 180)}`);
  }

  const payload = JSON.parse(responseText);
  if (!Array.isArray(payload)) {
    throw new Error("FMP economic calendar response was not an array");
  }

  return payload.map((rawEvent) => {
    const event = rawEvent as Record<string, unknown>;
    const scheduledAt = parseDate(event.date);
    return {
      country: optionalString(event.country),
      currency: String(event.currency ?? "USD"),
      event_name: String(event.event ?? event.name ?? "Economic Event"),
      external_id: stableExternalId("fmp", event.event ?? event.name, event.date, event.currency),
      impact: normalizeImpact(event.impact),
      provider: "fmp",
      raw_payload: event,
      scheduled_at: scheduledAt,
    };
  });
}

async function fetchFmpEarningsEvents(windowStart: Date, windowEnd: Date): Promise<EconomicEvent[]> {
  if (!FMP_API_KEY) {
    return [];
  }

  const url = new URL(`${FMP_API_BASE_URL.replace(/\/$/, "")}/earnings-calendar`);
  url.searchParams.set("from", isoDate(windowStart));
  url.searchParams.set("to", isoDate(windowEnd));
  url.searchParams.set("apikey", FMP_API_KEY);

  const response = await fetch(url);
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`FMP earnings calendar request failed (${response.status}): ${responseText.slice(0, 180)}`);
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
        event_name: `${symbol} earnings`,
        external_id: stableExternalId("fmp_earnings", symbol, date, event.time),
        impact: "high" as const,
        provider: "fmp_earnings",
        raw_payload: event,
        scheduled_at: parseEarningsDate(date, event.time),
      },
    ];
  });
}

async function fetchFinnhubEvents(windowStart: Date, windowEnd: Date): Promise<EconomicEvent[]> {
  if (!FINNHUB_API_KEY) {
    return [];
  }

  const url = new URL("https://finnhub.io/api/v1/calendar/economic");
  url.searchParams.set("from", isoDate(windowStart));
  url.searchParams.set("to", isoDate(windowEnd));
  url.searchParams.set("token", FINNHUB_API_KEY);

  const response = await fetch(url);
  const payload = (await response.json()) as Record<string, unknown>;
  const events = Array.isArray(payload.economicCalendar) ? payload.economicCalendar : [];

  return events.map((rawEvent) => {
    const event = rawEvent as Record<string, unknown>;
    return {
      country: optionalString(event.country),
      currency: String(event.currency ?? "USD"),
      event_name: String(event.event ?? "Economic Event"),
      external_id: stableExternalId("finnhub", event.id ?? event.event, event.time, event.currency),
      impact: normalizeImpact(event.impact),
      provider: "finnhub",
      raw_payload: event,
      scheduled_at: parseDate(event.time),
    };
  });
}

function stableExternalId(provider: string, ...parts: unknown[]) {
  return `${provider}:${parts.map((part) => String(part ?? "")).join(":")}`;
}

function dedupeEvents(events: EconomicEvent[]) {
  return Array.from(new Map(events.map((event) => [`${event.provider}:${event.external_id}`, event])).values());
}

function parseDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

function parseEarningsDate(dateValue: unknown, timeValue: unknown) {
  const rawDate = String(dateValue ?? "");
  if (rawDate.includes("T")) {
    return parseDate(rawDate);
  }

  const time = String(timeValue ?? "").toLowerCase();
  const releaseTime = time.includes("bmo") || time.includes("before") ? "12:00:00Z" : time.includes("amc") || time.includes("after") ? "21:00:00Z" : "16:00:00Z";
  return parseDate(`${rawDate}T${releaseTime}`);
}

function optionalString(value: unknown) {
  return value ? String(value) : undefined;
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    status,
  });
}
