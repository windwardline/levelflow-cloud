import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The chart feed was the only FMP-reaching Edge function with no ceiling.
 *
 * Measured 2026-08-31 by an audit of every consumer: `trade-analyzer` claims a
 * budget unit per request; `market-data` checked only that the caller was
 * signed in. A 15-minute crypto chart is 45 days x 96 bars x ~150 B = ~648 KB,
 * so one authenticated tab at one request per second draws ~56 GB in a day —
 * the whole 30-day allowance in under five, from one browser, with nothing
 * able to refuse it.
 *
 * And `resolveDateWindow` clamped `days` while passing a caller-supplied
 * `from` through raw, which made the clamp decorative: only the DEFAULT path
 * was bounded.
 *
 * Both are source-asserted rather than executed, and the limit is stated: this
 * function needs a live Supabase session and a deployed limiter, which the
 * deploy-time E2E has and `npm test` does not. What is checked here is that
 * the guards EXIST and fail closed — the shape a unit test can hold.
 */

const SRC = readFileSync("supabase/functions/market-data/index.ts", "utf8");

describe("the chart feed claims a budget unit", () => {
  it("claims before it can reach the provider", () => {
    const claimAt = SRC.indexOf("claimMarketDataRequest(user.id)");
    const fetchAt = SRC.indexOf("historical-chart/");
    assert.ok(claimAt > 0, "the chart feed no longer claims a budget unit");
    assert.ok(
      fetchAt > 0 && claimAt < fetchAt,
      "the claim sits AFTER the provider fetch, which meters nothing",
    );
  });

  it("refuses with 429 rather than serving an unmetered request", () => {
    assert.match(SRC, /if \(!claim\.allowed\)/);
    assert.match(SRC, /\}, 429\);/);
  });

  it("treats an unanswerable limiter as a REFUSAL, both ways", () => {
    // The failure this exists for: a meter that cannot answer silently
    // becoming an unmetered path. Deliberately the opposite of the bar
    // store's outage fallback — a store that cannot be read costs a re-fetch,
    // while a meter that cannot be read is all that stands between one tab
    // and the allowance.
    const fn = SRC.slice(
      SRC.indexOf("async function claimMarketDataRequest"),
      SRC.indexOf("function normalizeSymbol"),
    );
    assert.ok(fn.length > 200, "the claim helper moved — re-anchor this");
    const refusals = [...fn.matchAll(/allowed: false/g)];
    assert.equal(
      refusals.length,
      2,
      "both the no-result and the throw paths must refuse; found " +
        `${refusals.length} refusal(s)`,
    );
    assert.doesNotMatch(
      fn,
      /allowed: true(?!.*Boolean)/,
      "a hardcoded allow would make the limiter a decoration",
    );
  });

  it("reuses the analyzer's limiter rather than minting a second one", () => {
    // One table, one atomic claim, one window — and the analyzer-abuse suite
    // already exercises it against the deployed function at deploy time.
    assert.match(SRC, /"claim_analyzer_request"/);
    assert.match(SRC, /p_action: "market_data"/);
  });

  it("the migration widens BOTH statements of the action set", () => {
    // They were already two statements of one fact. An action the function
    // accepts and the table refuses fails at INSERT, inside a transaction, on
    // a live request — so a change that moved one and not the other would
    // surface as a 500 in production rather than a failure at deploy.
    const migration = readFileSync(
      "supabase/migrations/20260901010000_market_data_claims_a_request.sql",
      "utf8",
    );
    const constraintAt = migration.indexOf("add constraint");
    const guardAt = migration.indexOf("if v_action not in");
    assert.ok(constraintAt > 0 && guardAt > 0);
    for (const section of [
      migration.slice(constraintAt, guardAt),
      migration.slice(guardAt),
    ]) {
      assert.match(section, /'market_data'/);
    }
  });
});

describe("the requested start is clamped, not just the day count", () => {
  it("floors `from` at the timeframe's own window", () => {
    const window = SRC.slice(
      SRC.indexOf("function resolveDateWindow"),
      SRC.indexOf("function resolveDateWindow") + 1800,
    );
    assert.match(window, /maxDayCount\(timeframe\)/);
    assert.match(
      window,
      /requested < earliestIso \? earliestIso : requested/,
      "a caller-supplied `from` reaches the provider unclamped again — the " +
        "`days` clamp one line above is then decorative",
    );
  });

  it("still honours a caller asking for LESS than the window", () => {
    // The clamp is a floor, not a rewrite: refusing to ask for more than the
    // timeframe allows must not widen a request that asked for less.
    const window = SRC.slice(
      SRC.indexOf("function resolveDateWindow"),
      SRC.indexOf("function resolveDateWindow") + 1800,
    );
    assert.doesNotMatch(
      window,
      /const from = earliestIso;/,
      "every request now starts at the window edge, which widens the ones " +
        "that deliberately asked for less",
    );
  });
});
