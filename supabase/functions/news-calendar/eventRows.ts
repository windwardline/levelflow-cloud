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
