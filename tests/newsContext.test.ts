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

describe("the analyzer asks about the rows it actually reads", () => {
  const source = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  it("probes for a future event rather than a recent ingest", () => {
    // RENAMED FROM "the watchdog's own question", which is what it used to be
    // and deliberately no longer is. The watchdog asks whether the TABLE is
    // fed; a review needs to know whether the rows IT READS are fed, and a
    // probe over the wider population can only ever be optimistic.
    // created_at is an INSERT default and the ingest upserts, so a healthy
    // calendar whose rows were all first seen days ago would read stale on a
    // max(created_at) probe and refuse every market. The watchdog counts
    // `scheduled_at > now()`; this must ask the same thing or the two drift on
    // what stale means.
    assert.match(
      source,
      /economic_events\?select=id&impact=in\.\(medium,high\)&scheduled_at=gt\./,
      "the coverage probe is gone, no longer asks for a future event, or has " +
        "widened past the population the news check reads",
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

describe("an unreadable calendar cannot clear the news block", () => {
  const source = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  /**
   * THE REGRESSION #456 SHIPPED, and the reason this case is separate.
   *
   * `blocking` is empty both when the calendar says there is no active
   * high-impact event AND when the calendar could not be read at all, and the
   * gate treats empty as permission to publish. Before the provenance work a
   * failed read THREW and the review died. #456 caught it and let the review
   * continue — silently converting a safety refusal into a pass, and
   * publishing a setup while blind to a possible high-impact event.
   *
   * macroContext's precedent does not extend here, and reading it as if it did
   * was the error: an unavailable rate curve costs a score ADJUSTMENT, an
   * unavailable calendar costs a BLOCK.
   */
  it("refuses the review before the block gate is reached", () => {
    const gate = source.indexOf('if (newsContext.blocking.length > 0)');
    const refusal = source.indexOf('newsContext.calendarSource === "unavailable"');
    assert.ok(refusal >= 0, "an unreadable calendar no longer refuses the review");
    assert.ok(
      refusal < gate,
      "the unavailable check must come BEFORE the block gate — after it, an " +
        "empty `blocking` has already been read as permission to publish",
    );
  });

  it("does not refuse on a merely stale calendar", () => {
    // The table answered and simply holds no future events, which is the same
    // evidence the pre-#456 engine acted on. Refusing every market on it would
    // be a new outage rather than a repair, so the refusal names `unavailable`
    // alone.
    const block = source.slice(
      source.indexOf('newsContext.calendarSource === "unavailable"'),
    );
    const body = block.slice(0, block.indexOf("\n  }") + 4);
    assert.doesNotMatch(
      body,
      /"stale"/,
      "a stale calendar must not be refused — it is read evidence, not absent evidence",
    );
  });
});

describe("the coverage probe costs one query, not one per market", () => {
  const source = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  it("memoises a fact about the table, not about the symbol", () => {
    // fetchRelevantNews runs once per market, so a 15-market scan asked this
    // identical whole-table question fifteen times — fifteen round trips
    // against the same row, on a function whose 2s CPU budget has already been
    // exceeded in production once (scanBatching.ts's header records it).
    assert.match(
      source,
      /async function calendarHasFutureEvents\(/,
      "the coverage probe is inline again, so it runs once per market",
    );
    assert.match(source, /CALENDAR_COVERAGE_TTL_MS/);
    assert.match(
      source,
      /hasFutureEvents = await calendarHasFutureEvents\(token, window\.now\)/,
      "fetchRelevantNews is not going through the memo",
    );
  });

  it("keeps the probe's predicate unchanged behind the memo", () => {
    // The memo must not become a place the question quietly changes. This is
    // the watchdog's predicate and it has to stay identical to it.
    const fn = source.slice(source.indexOf("async function calendarHasFutureEvents("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    assert.match(
      body,
      /economic_events\?select=id&impact=in\.\(medium,high\)&scheduled_at=gt\./,
    );
    assert.doesNotMatch(body, /created_at/);
  });
});

describe("the coverage probe certifies only what it looked at", () => {
  const source = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  /**
   * A PROBE OVER A WIDER POPULATION THAN THE THING IT CERTIFIES CAN ONLY BE
   * OPTIMISTIC.
   *
   * The window query reads `impact=in.(medium,high)`. The first version of the
   * probe read the whole table, so one future-dated LOW-impact row — an
   * earnings entry — answered "covered" while the economic-calendar feed
   * itself was dead. Any live sibling feed masked the one that had stopped,
   * which is the exact failure mode the provenance work exists to catch.
   *
   * This is where it departs from the watchdog on purpose. The watchdog asks
   * whether the TABLE is fed; a review needs to know whether the rows it reads
   * are fed. Calling those the same question was the error.
   */
  it("applies the same impact filter the window query applies", () => {
    const probe = source.slice(source.indexOf("async function calendarHasFutureEvents("));
    const body = probe.slice(0, probe.indexOf("\n}\n"));
    assert.match(
      body,
      /impact=in\.\(medium,high\)/,
      "the probe certifies coverage over rows the news check never reads",
    );
    assert.match(body, /scheduled_at=gt\./);
  });

  it("uses the same impact filter as the window query it makes interpretable", () => {
    // Derived rather than transcribed: both filters are read out of the source
    // and compared, so a change to one that is not made to the other fails
    // here instead of silently widening the probe again.
    const filters = source.match(/impact=in\.\([a-z,]+\)/g) ?? [];
    assert.ok(filters.length >= 2, `expected both queries to filter, found ${filters.length}`);
    assert.equal(
      new Set(filters).size,
      1,
      `the probe and the window query disagree on impact: ${[...new Set(filters)].join(" vs ")}`,
    );
  });
});
