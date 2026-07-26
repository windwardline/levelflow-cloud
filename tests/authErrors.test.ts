import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeAuthEmailError } from "../src/lib/authErrors";

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
