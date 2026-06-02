import { z } from "zod";

const economicEventSchema = z.object({
  provider: z.string(),
  externalId: z.string(),
  currency: z.string(),
  country: z.string().optional(),
  eventName: z.string(),
  impact: z.enum(["low", "medium", "high"]),
  scheduledAt: z.string(),
  rawPayload: z.unknown(),
});

export type EconomicEvent = z.infer<typeof economicEventSchema>;

export type NewsProvider = "fmp" | "finnhub";
type ProviderPayload = Record<string, unknown>;

export class NewsCalendarService {
  private readonly provider: NewsProvider;

  constructor(provider = process.env.ECONOMIC_CALENDAR_PROVIDER as NewsProvider | undefined) {
    this.provider = provider ?? "fmp";
  }

  async getHighImpactEvents(windowStart: Date, windowEnd: Date): Promise<EconomicEvent[]> {
    const events = await this.fetchEvents(windowStart, windowEnd);
    return events.filter((event) => event.impact === "high");
  }

  private async fetchEvents(windowStart: Date, windowEnd: Date): Promise<EconomicEvent[]> {
    if (this.provider === "finnhub") {
      return this.fetchFinnhubEvents(windowStart, windowEnd);
    }

    return this.fetchFmpEvents(windowStart, windowEnd);
  }

  private async fetchFmpEvents(windowStart: Date, windowEnd: Date): Promise<EconomicEvent[]> {
    const apiKey = process.env.FMP_API_KEY;

    if (!apiKey) {
      return [];
    }

    const url = new URL("https://financialmodelingprep.com/api/v3/economic_calendar");
    url.searchParams.set("from", windowStart.toISOString().slice(0, 10));
    url.searchParams.set("to", windowEnd.toISOString().slice(0, 10));
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url);
    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      return [];
    }

    const events: EconomicEvent[] = [];

    for (const rawEvent of payload) {
      const event = rawEvent as ProviderPayload;
      const parsed = economicEventSchema.safeParse({
        provider: "fmp",
        externalId: String(event.event ?? event.name ?? event.date),
        currency: String(event.currency ?? "USD"),
        country: event.country ? String(event.country) : undefined,
        eventName: String(event.event ?? event.name ?? "Economic Event"),
        impact: normalizeImpact(event.impact),
        scheduledAt: new Date(String(event.date)).toISOString(),
        rawPayload: event,
      });

      if (parsed.success) {
        events.push(parsed.data);
      }
    }

    return events;
  }

  private async fetchFinnhubEvents(windowStart: Date, windowEnd: Date): Promise<EconomicEvent[]> {
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return [];
    }

    const url = new URL("https://finnhub.io/api/v1/calendar/economic");
    url.searchParams.set("from", windowStart.toISOString().slice(0, 10));
    url.searchParams.set("to", windowEnd.toISOString().slice(0, 10));
    url.searchParams.set("token", apiKey);

    const response = await fetch(url);
    const payload = (await response.json()) as ProviderPayload;
    const events = Array.isArray(payload.economicCalendar) ? payload.economicCalendar : [];

    const parsedEvents: EconomicEvent[] = [];

    for (const rawEvent of events) {
      const event = rawEvent as ProviderPayload;
      const parsed = economicEventSchema.safeParse({
        provider: "finnhub",
        externalId: String(event.id ?? `${event.event}-${event.time}`),
        currency: String(event.currency ?? "USD"),
        country: event.country ? String(event.country) : undefined,
        eventName: String(event.event ?? "Economic Event"),
        impact: normalizeImpact(event.impact),
        scheduledAt: new Date(String(event.time)).toISOString(),
        rawPayload: event,
      });

      if (parsed.success) {
        parsedEvents.push(parsed.data);
      }
    }

    return parsedEvents;
  }
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
