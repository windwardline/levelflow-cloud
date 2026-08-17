// The deploy gate stopped meaning anything on 2026-08-13. E2E asserts
// market-data returns 2xx; FMP's allowance was exhausted, so it returned 502,
// and every deploy since has been red for a reason that is not a regression.
//
// A red that is always red is not a signal. It cannot separate "the provider
// is out of budget" from "we broke the chart", so it trains you to merge past
// it. The fix is a NAMED condition, not a wider catch: market-data says
// explicitly that the provider refused on quota, and the E2E stands down for
// that one case only. Any other failure still fails.
//
// Matching on the provider's prose is deliberate and narrow. HTTP 429 alone is
// ambiguous — FMP serves it for the 3,000/min rate ceiling too, which IS
// transient and IS our problem. Only the bandwidth message means the 30-day
// allowance is gone.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyUpstreamFailure } from "../supabase/functions/market-data/upstreamStatus.ts";

// What FMP actually served during the blackout, verified 2026-08-16.
const FMP_BANDWIDTH_BODY =
  "Bandwidth Limit Reach . Please upgrade your plan or visit our documentation " +
  "for more details at https://site.financialmodelingprep.com/";

describe("classifyUpstreamFailure — quota exhaustion is not a regression", () => {
  it("names the provider's bandwidth refusal", () => {
    assert.equal(classifyUpstreamFailure(FMP_BANDWIDTH_BODY), "quota-exhausted");
  });

  // market-data tries every provider symbol for a market and joins the
  // failures with " | ". One exhausted provider in that string still means the
  // allowance is gone.
  it("finds the refusal inside a joined multi-symbol failure string", () => {
    assert.equal(
      classifyUpstreamFailure(`EURUSD: ${FMP_BANDWIDTH_BODY} | EUR/USD: NO_DATA`),
      "quota-exhausted",
    );
  });

  it("treats a plain rate-limit refusal as our problem, not the provider's budget", () => {
    assert.equal(classifyUpstreamFailure("429 Too Many Requests"), "other");
  });

  it("treats malformed and empty provider responses as real failures", () => {
    for (const status of ["INVALID_JSON", "UNEXPECTED_RESPONSE", "NO_DATA", ""]) {
      assert.equal(
        classifyUpstreamFailure(status),
        "other",
        `${status || "(empty)"} must not read as quota exhaustion`,
      );
    }
  });

  // A test that skips on any error is a test that examined nothing. The
  // classifier must never widen to a general "upstream sad" catch.
  it("does not treat a generic upstream error as quota exhaustion", () => {
    assert.equal(classifyUpstreamFailure("500 Internal Server Error"), "other");
    assert.equal(classifyUpstreamFailure("Service Unavailable"), "other");
  });
});
