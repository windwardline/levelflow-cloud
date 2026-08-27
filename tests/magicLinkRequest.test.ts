import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  type MagicLinkSender,
  normalizeSignInEmail,
  requestMagicLink,
  UNCONFIGURED_MESSAGE,
} from "../src/lib/magicLinkRequest.ts";

/**
 * The production sign-in path, finally executed by a test.
 *
 * WHY IT WAS NOT. Magic link is the only way a real operator signs in, and
 * every Playwright spec authenticates with signInWithPassword — a path no
 * production user takes. The E2E suite asserts the "Send magic link" button is
 * VISIBLE in six places and clicks it in none, because clicking it sends real
 * mail through Resend. So the button had presence coverage and the handler
 * behind it had none.
 *
 * Its two halves were each covered — describeAuthEmailError in
 * tests/authErrors.test.ts, sentMessage in tests/signInDraft.test.ts — and the
 * join between them by nothing. Two tested parts with an untested join reads as
 * coverage and is not.
 *
 * A stand-in sender means the real logic runs and no mail is ever sent.
 */

/** Records what the provider was actually handed, which is half of what matters here. */
function recordingSender(
  error: { code?: string; message?: string; status?: number } | null = null,
) {
  const calls: { email: string; options?: { emailRedirectTo?: string } }[] = [];
  const sender: MagicLinkSender = {
    auth: {
      signInWithOtp(credentials) {
        calls.push(credentials);
        return Promise.resolve({ error });
      },
    },
  };
  return { calls, sender };
}

const APP_URL = "https://levelflow.windwardline.com/";

describe("requesting a magic link", () => {
  it("hands the provider a normalised address, not what was typed", async () => {
    // THE CASE NOTHING COULD SEE BEFORE. Normalisation happened inside the
    // component, so whether the provider received the trimmed lowercase form
    // was unobservable. An operator typing "  Me@Example.COM " must not create
    // a second identity at the provider from the one they read back.
    const { calls, sender } = recordingSender();
    const result = await requestMagicLink(sender, "  Me@Example.COM ", APP_URL);

    assert.equal(calls.length, 1, "the provider was not called exactly once");
    assert.equal(calls[0].email, "me@example.com");
    assert.equal(result.kind, "sent");
    assert.equal(result.kind === "sent" && result.email, "me@example.com");
  });

  it("tells the reader back the same address it sent to", async () => {
    // The send and the confirmation drew on separate expressions before this,
    // which is exactly how a confirmation comes to name an address the provider
    // never saw.
    const { calls, sender } = recordingSender();
    const result = await requestMagicLink(sender, "Operator@Windwardline.com", APP_URL);
    assert.ok(result.kind === "sent");
    assert.ok(
      result.message.includes(calls[0].email),
      `the confirmation names ${result.message}, the provider got ${calls[0].email}`,
    );
  });

  it("carries the redirect the caller configured", async () => {
    const { calls, sender } = recordingSender();
    await requestMagicLink(sender, "a@b.com", APP_URL);
    assert.equal(calls[0].options?.emailRedirectTo, APP_URL);
  });

  it("maps a rate limit to the retryable sentence", async () => {
    const { sender } = recordingSender({ code: "over_email_send_rate_limit" });
    const result = await requestMagicLink(sender, "a@b.com", APP_URL);
    assert.equal(result.kind, "failed");
    assert.match(result.message, /Wait a moment/);
  });

  it("maps a server failure to the sentence that says retrying will not help", async () => {
    // The distinction the copy exists to make: a 429 is worth retrying and a
    // 500 is not, and collapsing them teaches the operator to hammer a dead
    // endpoint. Pinned in both directions so a future edit cannot merge them.
    const { sender } = recordingSender({ status: 503 });
    const result = await requestMagicLink(sender, "a@b.com", APP_URL);
    assert.equal(result.kind, "failed");
    assert.match(result.message, /Retrying won't help/);
    assert.doesNotMatch(result.message, /Wait a moment/);
  });

  it("calls a missing client unconfigured, not a failed send", async () => {
    // These are different facts and different instructions. A failed send is
    // worth retrying; an unconfigured client never will be.
    const result = await requestMagicLink(null, "a@b.com", APP_URL);
    assert.equal(result.kind, "unconfigured");
    assert.equal(result.message, UNCONFIGURED_MESSAGE);
  });

  it("never contacts the provider when there is no client", async () => {
    const { calls } = recordingSender();
    await requestMagicLink(null, "a@b.com", APP_URL);
    assert.equal(calls.length, 0);
  });

  it("normalises idempotently", () => {
    const once = normalizeSignInEmail("  A@B.com ");
    assert.equal(normalizeSignInEmail(once), once);
  });
});

describe("the screen delegates rather than reimplementing", () => {
  it("AuthScreen sends through requestMagicLink and holds no signInWithOtp of its own", () => {
    // THE ANCHOR. Everything above tests a pure function, and none of it proves
    // the screen calls it. Without this the function could be correct while
    // AuthScreen kept its own inline send, and the whole file would pass over a
    // live defect — the shadow-test failure, one layer up.
    const source = readFileSync(
      join(new URL("..", import.meta.url).pathname, "src/components/auth/AuthScreen.tsx"),
      "utf8",
    );
    assert.match(
      source,
      /await requestMagicLink\(supabase, email, appConfig\.appUrl\)/,
      "AuthScreen no longer delegates to the tested function",
    );
    assert.doesNotMatch(
      source,
      /auth\.signInWithOtp/,
      "AuthScreen calls signInWithOtp directly again — the tested function is bypassed",
    );
    // The unconfigured sentence exists twice by design (the screen short-circuits
    // before the async call). Both must read from the constant, or they drift.
    assert.doesNotMatch(
      source,
      /"Cloud connection is not configured\."/,
      "AuthScreen re-literalised the unconfigured sentence instead of sharing it",
    );
  });
});
