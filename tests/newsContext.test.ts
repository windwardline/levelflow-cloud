import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildNewsContext,
  type NewsEventRow,
} from "../supabase/functions/trade-analyzer/newsContext.ts";

/**
 * "The calendar is clear" and "the calendar is empty" were the same answer.
 *
 * `fetchRelevantNews` made one window query. Zero rows produced `blocking: []`
 * and `penaltyUnits: 0` — byte-identical to a genuinely quiet market — so a dead
 * ingest silently disabled the news refusal on every market and handed back a
 * full all-clear.
 *
 * NOT HYPOTHETICAL. Migration 20260729040000's own header records it: "the
 * economic-calendar job failed authentication silently for weeks: cron fired on
 * time, pg_net recorded 401s nobody read, and the analyzer quietly lost news
 * awareness once its event window ran dry."
 *
 * It survived because nothing executed the news path — index.ts is outside the
 * typecheck graph and its only coverage was a source-string match, which cannot
 * notice that two states return the same shape.
 *
 * COVERAGE IS JUDGED ON THE TABLE, not on this symbol's slice: a market with no
 * events of its own is an ordinary quiet market, and only a table with no future
 * events at all makes a zero-row window meaningless.
 */

const NOW = Date.UTC(2026, 7, 27, 12, 0, 0);
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

function event(overrides: Partial<NewsEventRow> = {}): NewsEventRow {
  return {
    currency: "USD",
    event_name: "CPI",
    event_type: "scheduled",
    impact: "high",
    provider: "fmp",
    scheduled_at: at(120),
    symbol: null,
    ...overrides,
  };
}

const build = (rows: NewsEventRow[] | null, hasFutureEvents: boolean) =>
  buildNewsContext({ hasFutureEvents, nowMs: NOW, rows, symbol: "EURUSD" });

describe("reading the economic calendar", () => {
  it("tells an empty table apart from a clear one", () => {
    // THE DEFECT. Both return no events and no penalty; only the provenance
    // separates them, and without it the second was reported as the first.
    const clear = build([], true);
    const empty = build([], false);

    assert.equal(clear.penaltyUnits, 0);
    assert.equal(empty.penaltyUnits, 0);
    assert.deepEqual(clear.blocking, []);
    assert.deepEqual(empty.blocking, []);

    assert.equal(clear.calendarSource, "read");
    assert.equal(empty.calendarSource, "stale");
    assert.equal(clear.unavailableReason, null);
    assert.ok(
      empty.unavailableReason && empty.unavailableReason.length > 0,
      "a stale calendar must say why it could not check",
    );
  });

  it("calls a quiet market read, not stale", () => {
    // The other half of the same distinction, and the one a naive fix breaks:
    // this symbol has no events, but the table is alive, so the review really
    // did check and really did find nothing.
    const quiet = build([event({ currency: "JPY", symbol: null })], true);
    assert.equal(quiet.calendarSource, "read");
    assert.equal(quiet.penaltyUnits, 0);
  });

  it("refuses when the read itself failed, which is not the same as empty", () => {
    const failed = build(null, false);
    assert.equal(failed.calendarSource, "unavailable");
    assert.equal(failed.penaltyUnits, 0);
    assert.deepEqual(failed.blocking, []);
    assert.match(failed.unavailableReason ?? "", /could not be read/);
  });

  it("still charges and blocks normally when the calendar is live", () => {
    // The provenance must not become a new way to lose the actual answer.
    const blocking = build([event({ scheduled_at: at(5) })], true);
    assert.equal(blocking.calendarSource, "read");
    assert.equal(blocking.blocking.length, 1, "a live high-impact event must block");
    assert.equal(blocking.active.length, 1);
  });

  it("charges an active medium event, which is the one the receipt used to miss", () => {
    const medium = build([event({ impact: "medium", scheduled_at: at(-5) })], true);
    assert.equal(medium.blocking.length, 0, "medium is not blocking");
    assert.equal(medium.active.length, 1);
    assert.equal(medium.penaltyUnits, 0.5);
  });

  it("counts headlines inside upcoming, never beside it", () => {
    const headline = build(
      [event({ event_type: "headline", impact: "high", scheduled_at: at(-30), symbol: "EURUSD" })],
      true,
    );
    assert.equal(headline.upcoming.length, 1);
    assert.equal(
      headline.headlineCount,
      1,
      "headlineCount is a subset of upcoming, so it can never exceed it",
    );
    assert.ok(headline.headlineCount <= headline.upcoming.length);
  });
});

describe("the analyzer asks the watchdog's own question", () => {
  const source = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  it("probes for a future event rather than a recent ingest", () => {
    // created_at is an INSERT default and the ingest upserts, so a healthy
    // calendar whose rows were all first seen days ago would read stale on a
    // max(created_at) probe and refuse every market. The watchdog counts
    // `scheduled_at > now()`; this must ask the same thing or the two drift on
    // what stale means.
    assert.match(
      source,
      /economic_events\?select=id&scheduled_at=gt\./,
      "the coverage probe is gone or no longer asks for a future event",
    );
    assert.doesNotMatch(
      source,
      /economic_events\?select=created_at|max\(created_at\)/,
      "the probe is reading ingest recency, which a healthy upserting calendar fails",
    );
  });

  it("treats a failed read as unavailable rather than as empty", () => {
    assert.match(
      source,
      /catch \(error\) \{\s*console\.error\("economic calendar read failed", error\);\s*rows = null;/,
      "a failed calendar read must become null, not an empty array — an empty " +
        "array is indistinguishable from a clear calendar",
    );
  });
});
