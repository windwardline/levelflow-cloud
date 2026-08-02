// Row normalization for the economic_events bulk upsert. PostgREST rejects a
// bulk insert whose objects carry different key sets (PGRST102), and
// JSON.stringify drops undefined values, so scheduled events (no symbol/url)
// and headline events (both present) must be projected onto one explicit,
// null-filled column set before serialization.

export type EconomicEvent = {
  country?: string;
  currency: string;
  event_name: string;
  event_type: "scheduled" | "earnings" | "headline";
  external_id: string;
  impact: "low" | "medium" | "high";
  provider: string;
  raw_payload: Record<string, unknown>;
  scheduled_at: string;
  symbol?: string;
  url?: string;
};

// I2: null, never "now". This used to fall back to `new Date().toISOString()`,
// which turned an unreadable provider date into a high-impact event scheduled
// at the current moment — and since external_id is derived from the raw date,
// every hourly run re-upserted the same row forward, so isBlockingNewsEvent
// blocked every review for that currency permanently with nothing to diagnose
// it by. Callers drop a null-timed row and count the drop.
// Both providers send calendar times as strings, so this reads strings and
// nothing else. A bare number is dropped rather than guessed at: epoch seconds
// and epoch milliseconds are indistinguishable by inspection, and stamping the
// wrong one would be the same class of invented fact the "now" fallback was.
export function parseEventTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const raw = value.trim();
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

// An earnings row carries a date and a session hint ("bmo" / "amc") rather than
// a time. A full timestamp is taken as given; a date the provider sent in some
// other shape is dropped like any other unreadable time.
export function parseEarningsEventTime(
  dateValue: unknown,
  timeValue: unknown,
): string | null {
  const rawDate = String(dateValue ?? "").trim();
  if (!rawDate) {
    return null;
  }
  if (rawDate.includes("T")) {
    return parseEventTime(rawDate);
  }

  const time = String(timeValue ?? "").toLowerCase();
  const releaseTime = time.includes("bmo") || time.includes("before")
    ? "12:00:00Z"
    : time.includes("amc") || time.includes("after")
    ? "21:00:00Z"
    : "16:00:00Z";
  return parseEventTime(`${rawDate}T${releaseTime}`);
}

export function toEventRow(event: EconomicEvent) {
  return {
    country: event.country ?? null,
    currency: event.currency,
    event_name: event.event_name,
    event_type: event.event_type,
    external_id: event.external_id,
    impact: event.impact,
    provider: event.provider,
    raw_payload: event.raw_payload,
    scheduled_at: event.scheduled_at,
    symbol: event.symbol ?? null,
    url: event.url ?? null,
  };
}
