import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  decodeSignInDraft,
  encodeSignInDraft,
  SIGN_IN_DRAFT_KEY,
  sentMessage,
  type SignInDraft,
} from "../src/lib/signInDraft";

// §17o tier 2 sends a signed-out reader's legal link through the SAME tab, which is
// the doctrine's choice and the right one. The consequence the owner delegated: a
// reader partway through sign-in — an address typed, or the "check your email" state
// showing — lost that screen by reading Terms, and Back returned a blank form.
//
// Same tab means the same sessionStorage, so the screen keeps its own draft there and
// picks it up on the way back. That is what sessionStorage is for: per-tab form
// state, gone when the tab is. The one field is an email address the reader typed
// into a visible input — no credential material, nothing the marker in
// src/lib/browserSession.ts had to be a cookie to avoid.
const AUTH = readFileSync("src/components/auth/AuthScreen.tsx", "utf8");

describe("the sign-in screen's draft survives a trip to a document", () => {
  it("carries the address and whether the link was already sent", () => {
    const draft: SignInDraft = { email: "reader@example.com", sent: true };
    assert.deepEqual(decodeSignInDraft(encodeSignInDraft(draft)), draft);
    assert.deepEqual(
      decodeSignInDraft(encodeSignInDraft({ email: "a@b.co", sent: false })),
      { email: "a@b.co", sent: false },
    );
  });

  it("carries nothing else, ever", () => {
    // The whole payload, pinned: a draft that grows a third field grows it here
    // first, in front of whoever reviews what this tab now remembers.
    assert.deepEqual(
      Object.keys(JSON.parse(encodeSignInDraft({ email: "a@b.co", sent: false }))).sort(),
      ["email", "sent"],
    );
  });

  it("reads nothing out of a value it did not write", () => {
    assert.equal(decodeSignInDraft(null), null);
    assert.equal(decodeSignInDraft(""), null);
    assert.equal(decodeSignInDraft("not json"), null);
    assert.equal(decodeSignInDraft("[]"), null);
    assert.equal(decodeSignInDraft('{"sent":true}'), null);
    assert.equal(decodeSignInDraft('{"email":42,"sent":true}'), null);
    // A non-boolean `sent` is not a maybe.
    assert.equal(decodeSignInDraft('{"email":"a@b.co","sent":"yes"}'), null);
  });

  it("keys itself where nothing else writes", () => {
    assert.equal(SIGN_IN_DRAFT_KEY, "levelflow-sign-in-draft");
  });

  it("rebuilds the sent line from the address, from one definition", () => {
    // §17f: no new copy. This is the sentence the send path already wrote, moved to
    // where both paths can say it — the restore would otherwise have needed its own
    // copy of it, which is how two surfaces come to word one fact differently.
    assert.equal(sentMessage("reader@example.com"), "Magic link sent to reader@example.com.");
    assert.match(AUTH, /setMessage\(sentMessage\(normalizedEmail\)\)/);
    assert.doesNotMatch(AUTH, /Magic link sent to/);
  });
});

describe("the screen saves it, restores it, and gives it up on sign-in", () => {
  it("opens from the draft rather than from blank", () => {
    assert.match(AUTH, /const draft = loadSignInDraft\(\);/);
    assert.match(AUTH, /useState\(draft\?\.email \?\? ""\)/);
    // The sent state and its line come back together, or the reader is looking at a
    // screen that says nothing happened while their inbox says otherwise.
    assert.match(AUTH, /useState<AuthStatus>\(draft\?\.sent \? "sent" : "idle"\)/);
    assert.match(AUTH, /draft\?\.sent\s*\? sentMessage\(draft\.email\)/);
  });

  it("saves on every change the reader can make to it", () => {
    // Typing, and the send that turns the screen into "check your email".
    assert.match(AUTH, /saveSignInDraft\(\{ email: value, sent: false \}\)/);
    assert.match(AUTH, /saveSignInDraft\(\{ email: normalizedEmail, sent: true \}\)/);
  });

  it("is given up the moment a session exists", () => {
    // Not on unmount — the screen unmounts for reasons other than success — but on
    // the event that makes the draft pointless. useAuthSession already has the one
    // place that runs for every session it accepts.
    const hook = readFileSync("src/hooks/useAuthSession.ts", "utf8");
    assert.match(
      hook,
      /function markSession\(session: Session \| null\) \{\s*if \(session\) \{\s*markBrowserSession\(\);[\s\S]{0,300}?clearSignInDraft\(\);/,
    );
  });
});
