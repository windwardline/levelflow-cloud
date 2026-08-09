import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeAuthEmailError, isDeadSessionError } from "../src/lib/authErrors";
import { LedgerReadError } from "../src/lib/tradeAnalyzer";

describe("auth email error messaging", () => {
  it("tells rate-limited users that waiting helps", () => {
    const byCode = describeAuthEmailError({
      code: "over_email_send_rate_limit",
      status: 429,
    });
    assert.match(byCode, /wait/i);
    assert.equal(describeAuthEmailError({ status: 429 }), byCode);
  });

  it("tells users a server failure will not be fixed by retrying", () => {
    const message = describeAuthEmailError({
      code: "unexpected_failure",
      status: 500,
    });
    assert.match(message, /on our side/i);
    assert.match(message, /ref: unexpected_failure/);
  });

  it("marks bare 5xx failures as server-side without a reference code", () => {
    const message = describeAuthEmailError({ status: 503 });
    assert.match(message, /on our side/i);
    assert.doesNotMatch(message, /ref:/);
  });

  it("falls back to the generic retry message for anything else", () => {
    const generic = "The sign-in link could not be sent. Try again shortly.";
    assert.equal(
      describeAuthEmailError({ status: 400, code: "validation_failed" }),
      generic,
    );
    assert.equal(describeAuthEmailError(undefined), generic);
    assert.equal(describeAuthEmailError(null), generic);
  });
});

// 1r: the dead-session predicate. A 401 on an RLS read — or PostgREST's own
// JWT refusal code — means the session is dead server-side while auth-js still
// holds its local object. Everything else is a retryable failure and must not
// end a visit: signing a reader out over a timeout would trade one lie for a
// worse remedy.
describe("isDeadSessionError", () => {
  it("recognizes a rejected token by status or by PostgREST code", () => {
    assert.equal(isDeadSessionError({}, 401), true);
    assert.equal(isDeadSessionError({ code: "PGRST301" }, undefined), true);
    assert.equal(isDeadSessionError({ code: "PGRST301" }, 400), true);
  });

  it("refuses to call a retryable failure a dead session", () => {
    assert.equal(isDeadSessionError({ code: "PGRST116" }, 406), false);
    assert.equal(isDeadSessionError({}, 500), false);
    assert.equal(isDeadSessionError({}, undefined), false);
    assert.equal(isDeadSessionError(new Error("History timed out."), undefined), false);
    assert.equal(isDeadSessionError(null, undefined), false);
    assert.equal(isDeadSessionError(undefined, undefined), false);
  });
});

// The ledger boundary used to throw new Error(error.message), discarding the
// PostgrestError's code and the response status — so even a caller who wanted
// to branch on auth could not. LedgerReadError carries the one verdict the
// hooks need.
describe("LedgerReadError", () => {
  it("carries the auth verdict across the boundary", () => {
    const dead = new LedgerReadError("JWT expired", { code: "PGRST301", status: 401 });
    assert.equal(dead.authFailure, true);
    assert.equal(dead.message, "JWT expired");
    assert.equal(dead instanceof Error, true);

    const transient = new LedgerReadError("upstream timeout", { code: null, status: 500 });
    assert.equal(transient.authFailure, false);
  });
});
