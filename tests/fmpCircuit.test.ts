import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { noteRefusal } from "../scripts/fmpGovernor.ts";
import {
  classifyRefusal,
  closeCircuit,
  COOL_OFF_MS,
  isBandwidthRefusal,
  isCircuitRefusal,
  mayCall,
  openCircuit,
  readCircuit,
} from "../scripts/fmpCircuit.ts";

/**
 * One shared breaker, because six consumers were each finding the same wall.
 *
 * Measured 2026-08-31, with the account nine GB over a 250 GB ceiling: the
 * minute bank fired twice daily and spent 97 symbols x 5 retries; the cache
 * top-up fired twice daily and climbed a seven-step ladder totalling ~11
 * minutes; two hourly pg_cron jobs called Edge functions that call FMP; and
 * the deploy-time E2E ran on every merge, nineteen times that day.
 *
 * None of them could tell another. There is no usage endpoint — that is §21's
 * premise — so the only shared signal available without the parked proxy is a
 * marker one consumer writes and the rest read.
 */

const scratch = () => join(mkdtempSync(join(tmpdir(), "circuit-")), "c.json");

describe("the two 429s are not the same wall", () => {
  it("recognises the bandwidth ceiling by the provider's own words", () => {
    // The real body, copied from `function_logs` on 2026-08-31.
    assert.equal(
      isBandwidthRefusal(
        '{\n  "Error Message": "Bandwidth Limit Reach . Please upgrade your ' +
          'plan or visit our documentation for more details at ' +
          'https://site.financialmodelingprep.com/"\n}',
      ),
      true,
    );
  });

  it("does NOT treat a bare rate limit as the bandwidth wall", () => {
    // The 3,000/minute ceiling is what the backoff ladder was written for and
    // clears in seconds. Collapsing the two would retire a retry that works.
    assert.equal(isBandwidthRefusal("HTTP 429"), false);
    assert.equal(isBandwidthRefusal("Too Many Requests"), false);
    assert.equal(isBandwidthRefusal(""), false);
  });
});

describe("an open breaker stops the roster but never the probe", () => {
  it("allows everything while closed", () => {
    const path = scratch();
    const decision = mayCall(Date.parse("2026-08-31T13:00:00Z"), path);
    assert.equal(decision.allowed, true);
    assert.equal(decision.probe, false);
  });

  it("refuses inside the cool-off, and says how long is left", () => {
    const path = scratch();
    const at = Date.parse("2026-08-31T13:00:00Z");
    openCircuit("Bandwidth Limit Reach", at, path);
    const decision = mayCall(at + 60_000, path);
    assert.equal(decision.allowed, false);
    assert.match(decision.reason, /circuit open/);
    // A STABLE TOKEN at the head, for the shell consumers that classify a
    // driver's output by grep. On 2026-09-02 the nightly top-up read this
    // refusal — the breaker doing its job — as "no quota signal in the
    // output, so this is a real failure", because the only tokens it knew
    // were the provider's own ("(429)"), and the breaker refuses BEFORE the
    // provider is asked.
    assert.match(decision.reason, /^fmpCircuitOpen: /);
    assert.match(
      decision.reason,
      /drains by time only/,
      "the refusal does not say the wall cannot be hurried, so the next " +
        "reader will try to hurry it",
    );
  });

  it("lets exactly one probe through once the cool-off elapses", () => {
    const path = scratch();
    const at = Date.parse("2026-08-31T13:00:00Z");
    openCircuit("Bandwidth Limit Reach", at, path);
    const decision = mayCall(at + COOL_OFF_MS, path);
    assert.equal(decision.allowed, true);
    assert.equal(
      decision.probe,
      true,
      "a call allowed through an OPEN breaker must be marked as the probe, " +
        "or the caller spends a roster on it",
    );
  });

  it("keeps the FIRST opening instant across an outage", () => {
    // Refreshing it on every refusal would reset the cool-off each time and
    // defeat the breaker — the marker records when the wall appeared, not
    // when it was last bumped into.
    const path = scratch();
    const first = Date.parse("2026-08-31T13:00:00Z");
    openCircuit("Bandwidth Limit Reach", first, path);
    openCircuit("Bandwidth Limit Reach", first + 3_600_000, path);
    assert.equal(readCircuit(path).openedAt, first);
  });

  it("re-arms the cool-off when a probe is spent and still refused", () => {
    const path = scratch();
    const at = Date.parse("2026-08-31T13:00:00Z");
    openCircuit("Bandwidth Limit Reach", at, path);
    // Cool-off elapses, a probe goes out, and it fails: the consumer re-opens.
    assert.equal(mayCall(at + COOL_OFF_MS, path).probe, true);
    openCircuit("Bandwidth Limit Reach", at + COOL_OFF_MS, path);
    assert.equal(
      mayCall(at + COOL_OFF_MS + 60_000, path).allowed,
      false,
      "a spent probe did not re-arm the cool-off, so every subsequent caller " +
        "probes too and the breaker is a no-op",
    );
  });

  it("closes on success, so recovery is not waited out", () => {
    const path = scratch();
    const at = Date.parse("2026-08-31T13:00:00Z");
    openCircuit("Bandwidth Limit Reach", at, path);
    closeCircuit(path);
    assert.equal(mayCall(at + 1, path).allowed, true);
    assert.equal(readCircuit(path).openedAt, null);
  });

  it("FAILS CLOSED on an unreadable marker, never open", () => {
    // The wrong direction here is expensive and asymmetric: one unnecessary
    // request costs a request, while a false refusal costs the minute bank a
    // day it can never recover.
    const path = scratch();
    writeFileSync(path, "{ not json");
    assert.equal(mayCall(Date.now(), path).allowed, true);
    assert.equal(readCircuit(path).openedAt, null);
  });
});

describe("the bank consults it, records to it, and clears it", () => {
  const SOURCE = readFileSync("scripts/bank-minute-bars.ts", "utf8");

  it("asks the breaker before spending anything", () => {
    const gateAt = SOURCE.indexOf("const gate = mayCall(Date.now());");
    const scoutAt = SOURCE.indexOf("const scout = targets[index++];");
    assert.ok(gateAt >= 0, "the bank no longer consults the shared breaker");
    assert.ok(
      gateAt < scoutAt,
      "the breaker is checked AFTER the first request, which is the one " +
        "thing it exists to avoid",
    );
  });

  it("tells the other consumers what it learned", () => {
    // Through the GOVERNOR since 2026-08-31: `noteRefusal` classifies on the
    // provider's words and opens the breaker, and routing every spender
    // through it is what took breaker coverage from one of four to four of
    // four. The claim is unchanged — a bandwidth refusal must become every
    // consumer's knowledge rather than this one's private discovery.
    assert.match(
      SOURCE,
      /if \(isCircuitRefusal\(result\.note\)\) \{\s*\n\s*noteRefusal\(/,
      "a refusal is not recorded, so the cache top-up and the " +
        "sweeps each spend a roster rediscovering it",
    );
  });

  it("carries the provider's words into the error, not just the status", () => {
    // `openCircuit` classifies on the body. Throwing a bare `HTTP 429` makes
    // the classifier permanently false — the wiring would look right and
    // never fire.
    assert.match(
      SOURCE,
      /const detail = await res\.text\(\)\.catch\(\(\) => ""\);/,
      "the bank throws a bare status again, so nothing downstream can tell " +
        "the bandwidth wall from a rate limit",
    );
    assert.match(SOURCE, /throw new Error\(`HTTP \$\{res\.status\}\$\{detail/);
  });

  it("stops its OWN ladder on a wall no retry clears", () => {
    // Widened from isBandwidthRefusal on 2026-09-07: the ladder must stop for
    // the entitlement gap too, which no number of attempts clears either.
    assert.match(
      SOURCE,
      /isCircuitRefusal\(error instanceof Error \? error\.message : ""\)/,
      "the bank still climbs five attempts against a wall that clears in days",
    );
  });

  it("closes the breaker when the provider answers", () => {
    assert.match(
      SOURCE,
      /closeCircuit\(\);/,
      "a recovered provider leaves the breaker open, so every consumer waits " +
        "out a cool-off that no longer applies",
    );
  });
});


/**
 * The 402 is a THIRD condition, and it was wearing the second one's clothes.
 *
 * `isBandwidthRefusal` matched `/upgrade your plan/i` because FMP's bandwidth
 * body ends with it. So does FMP's 402 Restricted Endpoint body — a plan that
 * does not cover an endpoint at all. On 2026-09-04 that collision opened the
 * BANDWIDTH breaker on an entitlement gap, and the minute bank spent four days
 * printing "the trailing-30-day window drains by time only" about a wall that
 * drains by nothing. The distinction the original docstring drew (words over
 * status code, because 429 covered two conditions) threw away the status
 * code's ability to separate a third.
 */
describe("an entitlement gap is not a bandwidth wall", () => {
  // The real body, copied from ~/Library/Logs/levelflow-minute-bank.log on
  // 2026-09-07, after four days of it.
  const RESTRICTED =
    "HTTP 402 Restricted Endpoint: This endpoint is not available under " +
    "your current subscription please visit our subscription page to " +
    "upgrade your plan at https://financialmodelingprep.com/";

  const BANDWIDTH =
    '{\n  "Error Message": "Bandwidth Limit Reach . Please upgrade your ' +
    "plan or visit our documentation for more details at " +
    'https://site.financialmodelingprep.com/"\n}';

  it("does NOT call a 402 restricted endpoint the bandwidth wall", () => {
    assert.equal(isBandwidthRefusal(RESTRICTED), false);
  });

  it("classifies each refusal by its own condition", () => {
    assert.equal(classifyRefusal(BANDWIDTH), "bandwidth");
    assert.equal(classifyRefusal(RESTRICTED), "entitlement");
    assert.equal(classifyRefusal("HTTP 429"), null);
    assert.equal(classifyRefusal("Too Many Requests"), null);
    assert.equal(classifyRefusal(""), null);
  });

  it("still stops the roster for BOTH, because neither clears by retrying", () => {
    // The breaker's value is unchanged: one probe per cool-off instead of 97
    // symbols x 5 retries. Only the diagnosis was wrong.
    assert.equal(isCircuitRefusal(BANDWIDTH), true);
    assert.equal(isCircuitRefusal(RESTRICTED), true);
    assert.equal(isCircuitRefusal("HTTP 429"), false);
  });

  it("does not tell a reader an entitlement gap drains by time", () => {
    const path = scratch();
    const opened = Date.parse("2026-09-04T20:38:00Z");
    openCircuit(RESTRICTED, opened, path);
    const decision = mayCall(opened + 60_000, path);
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.doesNotMatch(
      decision.reason,
      /drains by time/,
      "the entitlement message still claims the wall drains by time, which " +
        "is what made four days of failure read as normal waiting",
    );
    assert.match(
      decision.reason,
      /subscription/i,
      "the message must name the account as the lever, or nobody acts",
    );
    // The stable grep token shell consumers classify on must survive.
    assert.match(decision.reason, /^fmpCircuitOpen: /);
  });

  it("keeps the time-drains wording for an actual bandwidth wall", () => {
    const path = scratch();
    const opened = Date.parse("2026-08-31T13:00:00Z");
    openCircuit(BANDWIDTH, opened, path);
    const decision = mayCall(opened + 60_000, path);
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.match(decision.reason, /drains by time/);
  });

  it("probes an entitlement gap on the same cool-off, so payment self-heals", () => {
    // A plan change needs a human, but noticing it must not. One probe per
    // cool-off closes the breaker the first run after the fee is paid.
    const path = scratch();
    const opened = Date.parse("2026-09-04T20:38:00Z");
    openCircuit(RESTRICTED, opened, path);
    const decision = mayCall(opened + COOL_OFF_MS, path);
    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.equal(decision.probe, true);
  });
});

/**
 * The narrowing has a sharp edge: every call site that asked
 * "isBandwidthRefusal?" to decide whether to STOP must now ask
 * "isCircuitRefusal?", or the 402 stops tripping the breaker altogether and
 * the fix trades a false message for a silent 485-request roster run.
 */
describe("both walls still reach the shared breaker", () => {
  const BANK_SOURCE = readFileSync("scripts/bank-minute-bars.ts", "utf8");
  const RESTRICTED =
    "HTTP 402 Restricted Endpoint: This endpoint is not available under " +
    "your current subscription please visit our subscription page to " +
    "upgrade your plan at https://financialmodelingprep.com/";

  it("opens the breaker through the governor on an entitlement refusal", () => {
    const path = scratch();
    const at = Date.parse("2026-09-04T20:38:00Z");
    assert.equal(
      noteRefusal(RESTRICTED, at, path),
      true,
      "the governor ignored a 402, so every consumer will rediscover it",
    );
    assert.equal(readCircuit(path).openedAt, at);
  });

  it("still ignores a bare rate limit, whose ladder works", () => {
    const path = scratch();
    assert.equal(noteRefusal("HTTP 429", Date.now(), path), false);
    assert.equal(readCircuit(path).openedAt, null);
  });

  it("stops the bank's own ladder on EITHER wall", () => {
    // Source-level, because the ladder is inside a private retry helper. The
    // claim: the guard names the breaker's predicate, not the narrow one.
    assert.match(
      BANK_SOURCE,
      /isCircuitRefusal\(error instanceof Error \? error\.message : ""\)/,
      "the bank climbs five attempts against a wall that no retry clears",
    );
  });

  it("records EITHER wall for the other consumers", () => {
    assert.match(
      BANK_SOURCE,
      /if \(isCircuitRefusal\(result\.note\)\) \{\s*\n\s*noteRefusal\(/,
      "a 402 is not recorded, so the top-up and the sweeps each spend a " +
        "roster rediscovering it",
    );
  });

  it("derives the stand-down remedy from the refusal, not from a constant", () => {
    // The bandwidth sentence itself is still correct FOR BANDWIDTH, so its
    // presence in the source proves nothing. What matters is that the message
    // interpolates a decision instead of asserting one remedy for every wall.
    assert.match(
      BANK_SOURCE,
      /requests learning it again\. \$\{standDownRemedy\(result\.note\)\}/,
      "the stand-down still asserts one remedy for whatever it just hit, " +
        "which is the same false sentence one layer up",
    );
    assert.match(
      BANK_SOURCE,
      /case "entitlement":/,
      "standDownRemedy does not distinguish the entitlement gap",
    );
  });
});
