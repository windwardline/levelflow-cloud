import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  toEventRow,
  type EconomicEvent,
} from "../supabase/functions/news-calendar/eventRows";

const scheduledEvent: EconomicEvent = {
  currency: "USD",
  event_name: "CPI (YoY)",
  event_type: "scheduled",
  external_id: "fmp:CPI (YoY):2026-07-29 12:30:00:USD",
  impact: "high",
  provider: "fmp",
  raw_payload: { event: "CPI (YoY)" },
  scheduled_at: "2026-07-29T12:30:00.000Z",
};

const headlineEvent: EconomicEvent = {
  currency: "USD",
  event_name: "Fed holds rates steady",
  event_type: "headline",
  external_id: "fmp_news:stock:SPY:2026-07-29T13:00:00.000Z:https://example.com",
  impact: "high",
  provider: "fmp_news",
  raw_payload: { title: "Fed holds rates steady" },
  scheduled_at: "2026-07-29T13:00:00.000Z",
  symbol: "SPY",
  url: "https://example.com",
};

describe("news-calendar event rows", () => {
  it("gives every row an identical key set for the PostgREST bulk upsert", () => {
    // PGRST102 rejects bulk inserts whose objects carry different keys, and
    // JSON.stringify silently drops undefined values, so mixed scheduled and
    // headline events must serialize to the same shape.
    const rows = [scheduledEvent, headlineEvent].map(toEventRow);
    const keySets = rows.map((row) =>
      Object.keys(JSON.parse(JSON.stringify(row))).sort().join(",")
    );

    assert.equal(keySets[0], keySets[1]);
  });

  it("null-fills the optional columns instead of omitting them", () => {
    const row = toEventRow(scheduledEvent);

    assert.equal(row.country, null);
    assert.equal(row.symbol, null);
    assert.equal(row.url, null);
    assert.equal(row.currency, "USD");
    assert.equal(row.event_type, "scheduled");
  });

  it("keeps optional values when they are present", () => {
    const row = toEventRow(headlineEvent);

    assert.equal(row.symbol, "SPY");
    assert.equal(row.url, "https://example.com");
  });

  it("serializes to exactly the insertable economic_events columns", () => {
    const row = JSON.parse(JSON.stringify(toEventRow(headlineEvent)));

    assert.deepEqual(Object.keys(row).sort(), [
      "country",
      "currency",
      "event_name",
      "event_type",
      "external_id",
      "impact",
      "provider",
      "raw_payload",
      "scheduled_at",
      "symbol",
      "url",
    ]);
  });
});
