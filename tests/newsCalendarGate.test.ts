import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FINGERPRINT_HEX_CHARS,
  keyFingerprint,
  routeNewsCalendarRequest,
  VERIFY_MARKER,
  verifyBody,
} from "../supabase/functions/news-calendar/gate.ts";

/**
 * The sync script used to prove the token by POSTing to news-calendar, and a
 * POST with the token runs every FMP feed: a full calendar, earnings and news
 * sync, bought to answer "is the token right". The verify is now a token-gated
 * GET that returns before any spend decision, and says which FMP_API_KEY the
 * running function holds by a short SHA-256 prefix the script compares with the
 * Keychain's own. It proves the token and the key the function reads. It does
 * NOT prove FMP accepts that key — only a fetch that runs can.
 */

const SCRIPT = readFileSync("scripts/ops/sync-function-secrets.sh", "utf8");
const INDEX = readFileSync("supabase/functions/news-calendar/index.ts", "utf8");

describe("the route table", () => {
  it("routes by method and token, and refuses everything else", () => {
    assert.equal(routeNewsCalendarRequest("GET", true), "verify");
    assert.equal(routeNewsCalendarRequest("POST", true), "sync");
    assert.equal(routeNewsCalendarRequest("GET", false), "unauthorized");
    assert.equal(routeNewsCalendarRequest("POST", false), "unauthorized");
    for (const method of ["PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"]) {
      assert.equal(routeNewsCalendarRequest(method, true), "method-not-allowed", method);
      assert.equal(routeNewsCalendarRequest(method, false), "method-not-allowed", method);
    }
  });
});

describe("the key fingerprint", () => {
  it("is the leading hex of SHA-256, checked against the FIPS 180-2 'abc' vector", async () => {
    // SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    assert.equal(await keyFingerprint("abc"), "ba7816bf8f01cfea");
    assert.equal(FINGERPRINT_HEX_CHARS, 16);
  });

  it("says a function with no key has none, rather than hashing the empty string", async () => {
    assert.equal(await keyFingerprint(""), null);
    assert.equal(await keyFingerprint(undefined), null);
  });

  it("is the same width the sync script cuts its local fingerprint to", () => {
    assert.match(SCRIPT, /shasum -a 256 \| cut -c1-(\d+)/);
    const width = Number(SCRIPT.match(/shasum -a 256 \| cut -c1-(\d+)/)![1]);
    assert.equal(
      width,
      FINGERPRINT_HEX_CHARS,
      "the script and the function would compare fingerprints of different widths and never match",
    );
  });
});

describe("the verify body", () => {
  it("states it fetched nothing, the parking state and the fingerprint", () => {
    assert.deepEqual(verifyBody({ parked: true, fingerprint: "ba7816bf8f01cfea" }), {
      fetched: false,
      fmpKeyFingerprint: "ba7816bf8f01cfea",
      gate: "accepted",
      parked: true,
    });
  });

  it("carries the marker the script greps for, spelled as it is on the wire", () => {
    assert.equal(VERIFY_MARKER, '"gate":"accepted"');
    assert.ok(
      JSON.stringify(verifyBody({ parked: false, fingerprint: null })).includes(VERIFY_MARKER),
    );
    // In the grep itself, not anywhere in the file: the script's own comment
    // quotes the marker, and a whole-file search passed with the grep broken
    // (mutation-proven 2026-09-16).
    assert.ok(
      SCRIPT.includes(`grep -qF '${VERIFY_MARKER}' <<<"$BODY"`),
      "the sync script looks for a marker the function does not send, so every verify reads INCONCLUSIVE",
    );
  });
});

describe("the verify spends nothing", () => {
  it("returns before any spend decision or provider call", () => {
    const verify = INDEX.indexOf('route === "verify"');
    assert.ok(verify > 0, "news-calendar no longer has a verify route");
    const verifyReturn = INDEX.indexOf("return jsonResponse(", verify);
    const firstDecision = INDEX.indexOf("mayFetch(");
    const firstFetch = INDEX.indexOf("fetchFmpEvents(");
    assert.ok(firstDecision > 0 && firstFetch > 0, "the sync route moved — re-anchor");
    assert.ok(
      verifyReturn > verify && verifyReturn < firstDecision && verifyReturn < firstFetch,
      "the verify route reaches a spend decision or a provider call before it returns",
    );
  });
});
