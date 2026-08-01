import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type EconomicEvent,
  parseEarningsEventTime,
  parseEventTime,
  toEventRow,
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

// I2: parseDate used to return `new Date().toISOString()` for anything it could
// not read. A malformed high-impact scheduled event therefore landed with
// scheduled_at = now — and because external_id is derived from the RAW date,
// every hourly run re-upserted the same row forward to the new "now", so
// isBlockingNewsEvent (newsRules.ts) blocked every review for that currency
// permanently, with no diagnostic anywhere. A fallback masking a real problem.
// Null means "this row has no usable time"; the caller drops it and counts it.
describe("news-calendar event times", () => {
  it("reads the provider's own formats", () => {
    assert.equal(
      parseEventTime("2026-07-29 12:30:00"),
      new Date("2026-07-29 12:30:00").toISOString(),
    );
    assert.equal(
      parseEventTime("2026-07-29T12:30:00.000Z"),
      "2026-07-29T12:30:00.000Z",
    );
    // Both providers send strings. A bare number is not silently reinterpreted
    // as epoch seconds or milliseconds — it is dropped and counted.
    assert.equal(parseEventTime(1_784_000_000), null);
  });

  it("returns null rather than now for anything it cannot read", () => {
    for (const value of [undefined, null, "", "   ", "not a date", {}, NaN, 0]) {
      assert.equal(parseEventTime(value), null, `expected null for ${String(value)}`);
    }
  });

  it("places an earnings release by its session hint, and drops an unreadable date", () => {
    assert.equal(
      parseEarningsEventTime("2026-07-29", "bmo"),
      "2026-07-29T12:00:00.000Z",
    );
    assert.equal(
      parseEarningsEventTime("2026-07-29", "amc"),
      "2026-07-29T21:00:00.000Z",
    );
    assert.equal(
      parseEarningsEventTime("2026-07-29", ""),
      "2026-07-29T16:00:00.000Z",
    );
    // A full timestamp is taken as given, session hint ignored.
    assert.equal(
      parseEarningsEventTime("2026-07-29T18:45:00.000Z", "bmo"),
      "2026-07-29T18:45:00.000Z",
    );
    assert.equal(parseEarningsEventTime("sometime", "bmo"), null);
    assert.equal(parseEarningsEventTime(undefined, undefined), null);
  });
});
