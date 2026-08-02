import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// I1/I11: two scheduled ingestion paths swallowed provider failures whole.
//
// news-calendar had no telemetry call anywhere, and two bare `catch {}` around
// the earnings and headline fetches. Both could fail on every hourly run
// forever while the response reported `{configured: true, inserted: N}` — the
// precise failure mode 20260729040000_scheduled_sync_watchdog.sql was written
// about ("cron success is not job success"), and the watchdog only checks
// `future_events = 0`, which the scheduled feed alone satisfies. So a permanent
// earnings/headline outage never alarmed and left nothing to diagnose.
//
// macroContext's bare catch returned `unavailableContext(...)` with no log, no
// telemetry and no recorder parameter — unlike marketLoader.ts, which records
// every provider failure. A persistent Treasury outage silently zeroes
// macroAdjustment for every setup in the system, visible only as a string
// buried inside confluence.
//
// These are Deno-only modules with no harness reaching their network calls, so
// this pins the real source the way tests/statusWrites.test.ts does.
const NEWS_CALENDAR = readFileSync(
  "supabase/functions/news-calendar/index.ts",
  "utf8",
);
const MACRO_CONTEXT = readFileSync(
  "supabase/functions/trade-analyzer/macroContext.ts",
  "utf8",
);
const MARKET_LOADER = readFileSync(
  "supabase/functions/trade-analyzer/marketLoader.ts",
  "utf8",
);

describe("a provider failure is recorded, never swallowed", () => {
  it("leaves no bare catch in the news-calendar ingest path", () => {
    assert.doesNotMatch(NEWS_CALENDAR, /catch \{/);
    // Every catch carries the error into describeError, which strips the
    // provider apikey out of network-level messages before anything logs it.
    const catches = NEWS_CALENDAR.match(/catch \(error\)/g) ?? [];
    assert.equal(catches.length >= 3, true);
  });

  it("records every news-calendar run, degraded or clean", () => {
    assert.match(
      NEWS_CALENDAR,
      /import \{ recordAnalyzerEvent \} from "\.\.\/trade-analyzer\/telemetry\.ts";/,
    );
    // A partial ingest is an error even though the run returns rows: the
    // scheduled feed alone keeps the watchdog quiet.
    assert.match(NEWS_CALENDAR, /action: "news_calendar_sync"/);
    assert.match(NEWS_CALENDAR, /status: degraded \? "error" : "success"/);
    // And a run that failed outright says so in the same place.
    assert.match(
      NEWS_CALENDAR,
      /message: `news-calendar sync failed: \$\{detail\}`,\s*status: "error",/,
    );
  });

  it("drops an unreadable provider date instead of stamping it now, and counts the drops", () => {
    assert.doesNotMatch(NEWS_CALENDAR, /new Date\(\)\.toISOString\(\)/);
    assert.match(
      NEWS_CALENDAR,
      /parseEarningsEventTime,\s*parseEventTime,/,
    );
    // One filter, one count: the fetchers return rows that may be null-timed
    // and the request handler is where they are dropped and tallied.
    assert.match(NEWS_CALENDAR, /unparseableDates/);
    assert.match(NEWS_CALENDAR, /const degraded = /);
  });

  it("hands macroContext the same recorder marketLoader already takes", () => {
    assert.match(MARKET_LOADER, /recordEvent: MarketDataEventRecorder,/);
    assert.doesNotMatch(MACRO_CONTEXT, /\} catch \{/);
    assert.match(MACRO_CONTEXT, /recordEvent\?: MacroEventRecorder/);
    // Recorded once per fetch, not per request: the context is cached for 15
    // minutes, so a repeat caller reads the cache and must not re-alarm.
    assert.match(
      MACRO_CONTEXT,
      /context\.source === "unavailable"[\s\S]{0,400}await recordEvent\(/,
    );
    assert.match(MACRO_CONTEXT, /action: "macro_rate_context"/);
  });

  it("wires the analyzer's own recorder into that parameter", () => {
    const analyzer = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    assert.match(
      analyzer,
      /fetchMacroRateContext\(\s*fetchWithTimeout,\s*recordAnalyzerEvent,\s*\)/,
    );
  });
});
