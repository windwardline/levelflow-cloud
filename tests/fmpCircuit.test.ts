import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  closeCircuit,
  COOL_OFF_MS,
  isBandwidthRefusal,
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
      /if \(isBandwidthRefusal\(result\.note\)\) \{\s*\n\s*noteRefusal\(/,
      "a bandwidth refusal is not recorded, so the cache top-up and the " +
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

  it("stops its OWN ladder on a bandwidth refusal", () => {
    assert.match(
      SOURCE,
      /isBandwidthRefusal\(error instanceof Error \? error\.message : ""\)/,
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
