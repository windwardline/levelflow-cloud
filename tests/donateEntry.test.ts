import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { donateAsked, urlWithoutDonate } from "../src/lib/donateEntry";

// The satellite pages carry their own Donate link — `<a href="/?donate">` in
// public/legal/*.html's footer — and until now only the sign-in screen answered
// it. A signed-in reader who tapped it got the app's remembered tab instead: the
// Desk, or wherever they had last been. App.tsx has a "donate" AppTab and
// DonatePanel behind it; nothing read the ask.
//
// This module is that ask, in one place, read by both surfaces (AuthScreen's
// disclosure and App's opening tab) so they cannot drift on what asking looks
// like.
describe("what asking for the donation surface looks like", () => {
  it("is the query parameter, with or without a value", () => {
    assert.equal(donateAsked("?donate", ""), true);
    assert.equal(donateAsked("?donate=1", ""), true);
    // The sign-in screen's own entry (tests/e2e/public-auth.spec.ts) arrives
    // beside the quiet-entry parameter, and a magic link's parameters land on
    // this same URL.
    assert.equal(donateAsked("?enter&donate", ""), true);
    assert.equal(donateAsked("?code=abc&donate", ""), true);
  });

  it("is the hash form too, exactly", () => {
    assert.equal(donateAsked("", "#donate"), true);
    assert.equal(donateAsked("", "#donate-now"), false);
    assert.equal(donateAsked("", "#donations"), false);
  });

  it("is nothing else", () => {
    assert.equal(donateAsked("", ""), false);
    assert.equal(donateAsked("?enter", ""), false);
    // A parameter whose NAME merely contains the word is not the ask.
    assert.equal(donateAsked("?donations=1", ""), false);
    assert.equal(donateAsked("?nodonate", ""), false);
    // Nor is a value that happens to say it.
    assert.equal(donateAsked("?tab=donate", ""), false);
    assert.equal(donateAsked("", "#access_token=x"), false);
  });
});

// The adjudication, pinned so it cannot drift silently: the ask is consumed on
// arrival and taken back out of the URL. Left in, it would outlive the arrival
// and win every later load of that URL — including the reloads a phone performs
// on its own when it returns to a backgrounded tab — which would put a reader who
// had since moved to Insights back on Donate having asked for nothing. That is
// the second form of "donate never becomes the remembered tab": it must not
// override the remembered tab either.
describe("consuming the ask takes only the ask out of the URL", () => {
  it("leaves the app's own root", () => {
    assert.equal(urlWithoutDonate("https://levelflow.windwardline.com/?donate"), "/");
    assert.equal(urlWithoutDonate("https://levelflow.windwardline.com/?donate=1"), "/");
    assert.equal(urlWithoutDonate("https://levelflow.windwardline.com/#donate"), "/");
    assert.equal(
      urlWithoutDonate("https://levelflow.windwardline.com/?donate#donate"),
      "/",
    );
  });

  it("keeps every other parameter, the magic link's above all", () => {
    // useAuthSession reads the redirect's own parameters off this URL
    // (hasAuthRedirectParams), and auth-js reads them again for
    // detectSessionInUrl. A cleanup that took the whole query string would take
    // a reader's sign-in with it.
    assert.equal(
      urlWithoutDonate("https://levelflow.windwardline.com/?code=abc&donate"),
      "/?code=abc",
    );
    assert.equal(
      urlWithoutDonate("https://levelflow.windwardline.com/?donate&token_hash=xyz"),
      "/?token_hash=xyz",
    );
    assert.equal(
      urlWithoutDonate("https://levelflow.windwardline.com/#access_token=abc"),
      "/#access_token=abc",
    );
  });

  it("hands back a URL the app reads the same way, minus the ask", () => {
    // One interpreter for both halves: URLSearchParams decides what the ask IS
    // (donateAsked) and what comes out here, so a cleanup can neither miss the ask
    // nor take something the reader would not have called the ask — the drift this
    // module exists to prevent. The price is the one rewrite it makes to a
    // neighbour it keeps: a valueless parameter comes back carrying its "=".
    // `enter` is the parking-gate bypass, read with has() (src/lib/parkingGate.ts),
    // so its MEANING is what has to survive, and it does.
    assert.equal(
      urlWithoutDonate("https://levelflow.windwardline.com/?enter&donate"),
      "/?enter=",
    );
    const cleaned = new URL(
      urlWithoutDonate("https://levelflow.windwardline.com/?enter&donate"),
      "https://levelflow.windwardline.com",
    );
    assert.equal(cleaned.searchParams.has("enter"), true);
    assert.equal(donateAsked(cleaned.search, cleaned.hash), false);
    // A URL that never asked is never handed here at all: the caller returns
    // first (pinned below), so nothing rewrites a URL with nothing to clear.
    assert.equal(urlWithoutDonate("https://levelflow.windwardline.com/"), "/");
  });

  it("returns a same-origin path, never an absolute URL", () => {
    // What history.replaceState is handed. A path cannot carry the document
    // somewhere else by accident, and it is what the address bar should read.
    for (const href of [
      "https://levelflow.windwardline.com/?donate",
      "http://127.0.0.1:5175/?donate",
    ]) {
      assert.equal(urlWithoutDonate(href), "/");
    }
  });
});

describe("both surfaces read one ask, and the app consumes it once", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const auth = readFileSync("src/components/auth/AuthScreen.tsx", "utf8");
  const entry = readFileSync("src/lib/donateEntry.ts", "utf8");

  it("opens on Donate when the URL asks, ahead of the remembered tab", () => {
    assert.match(
      app,
      /function getInitialAppTab\(\): AppTab \{[\s\S]*?if \(donateRequested\(\)\) \{\s*return "donate";/,
    );
    // Ahead of the stored read, not after it: a request made now outranks a
    // memory of where the reader last was.
    const initial = app.match(/function getInitialAppTab\(\): AppTab \{[\s\S]*?\n\}/)?.[0] ?? "";
    assert.ok(initial.length > 0, "expected getInitialAppTab");
    assert.ok(
      initial.indexOf("donateRequested()") < initial.indexOf("LAST_TAB_STORAGE_KEY"),
      initial,
    );
  });

  it("never lets that arrival become the remembered tab", () => {
    // Both halves of the rule. The tab is absent from the persisted set, so the
    // effect that writes the memory skips it...
    assert.match(
      app,
      /const PERSISTED_TABS = new Set<AppTab>\(\[\s*"advisor",\s*"history",\s*"guide",\s*"profile",\s*\]\);/,
    );
    assert.match(
      app,
      /if \(typeof window === "undefined" \|\| !PERSISTED_TABS\.has\(activeTab\)\) \{\s*return;/,
    );
    // ...and the ask is consumed, so it cannot override that memory on the next
    // load either. history.replaceState: no navigation, and no new history entry,
    // so Back still returns to the page the reader came from.
    assert.match(app, /if \(session\) \{\s*clearDonateRequest\(\);/);
    assert.match(entry, /window\.history\.replaceState\(/);
    // Reading location.href is how the current URL is obtained; ASSIGNING to it —
    // or pushState — is what would turn a cleanup into a navigation or into a
    // history entry that swallows the reader's Back.
    assert.doesNotMatch(entry, /pushState/);
    assert.doesNotMatch(entry, /location\.href\s*=/);
    assert.doesNotMatch(entry, /location\.(assign|replace)\(/);
    // And it is only ever a rewrite of a URL that asked.
    assert.match(
      entry,
      /export function clearDonateRequest\(\): void \{\s*if \(!donateRequested\(\)\) \{\s*return;/,
    );
  });

  it("keeps the sign-in screen's own reading of it, through the same predicate", () => {
    // The signed-out path is deliberately unchanged in behaviour — it opens the
    // disclosure and keeps the parameter, since that screen is one surface with
    // nothing to displace — but it must not carry a second definition of the ask.
    // Handed to useState as the initializer itself, so it is read once, lazily,
    // exactly as the inline version was.
    assert.match(auth, /useState\(donateRequested\)/);
    assert.doesNotMatch(auth, /URLSearchParams/);
    assert.doesNotMatch(auth, /location\.hash/);
    // And the consume is the authed shell's alone.
    assert.doesNotMatch(auth, /clearDonateRequest/);
  });
});
