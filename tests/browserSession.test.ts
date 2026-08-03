import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  browserSessionMarked,
  BROWSER_SESSION_MARKER,
  clearedMarkerCookie,
  markerCookie,
  markerName,
} from "../src/lib/browserSession";

// The owner's report of 2026-08-02: signed in on a phone, tap Privacy or Terms,
// then come back with the page's own "Back to Levelflow" link — and the app is
// the login screen, with a refresh and a browser Forward no help either.
//
// The mechanism, reproduced in Chromium at 390x844, 375x812 AND 1280x800:
// every legal link in the app opens a new tab (LegalLinks.tsx and the mobile
// account menu both carry target="_blank" rel="noopener noreferrer"), a
// noopener tab gets an EMPTY sessionStorage shed, and the marker that says
// "this browser signed in" lived only in sessionStorage. So the moment that tab
// navigated to the app root — which is exactly what /legal/*.html's "Back to
// Levelflow" (href="/") and "Donate" (href="/?donate") links do —
// useAuthSession found a stored session with no marker beside it and called
// signOut(): localStorage emptied, the refresh token revoked at GoTrue, and
// every other tab told SIGNED_OUT. Opening the app itself in a second tab did
// the same thing.
//
// So the marker's storage is the defect, not the links. This module holds the
// signal, and these are its two halves: it must be shared by every tab of the
// running browser, and it must still be gone once that browser session ends —
// the posture tests/hooks.test.ts has always described, "a Levelflow session
// ends with the browser session rather than persisting in localStorage for the
// next person at the machine".
describe("the browser-session marker is shared by every tab, and dies with the browser", () => {
  it("is a session cookie — no Expires, no Max-Age", () => {
    const cookie = markerCookie(true);
    assert.match(cookie, new RegExp(`^${markerName(true)}=true;`));
    // The whole fix in one assertion. An Expires or a Max-Age would make this a
    // persistent cookie that outlives the browser and defeats the posture; no
    // lifetime attribute at all is what makes the browser drop it at the end of
    // the session while every tab in that session still shares it.
    assert.doesNotMatch(cookie, /expires=/i);
    assert.doesNotMatch(cookie, /max-age=/i);
  });

  // These four are not style: they are the exact conditions a browser checks
  // before accepting a __Host- cookie, and a cookie it rejects is a marker that
  // silently never exists — on the https origin the app actually ships to, which
  // is the one origin no local run and no CI run visits. So the rule that keeps
  // production working is pinned here, where a later edit trips over it.
  it("takes the __Host- name on a secure origin, on the terms that name demands", () => {
    const cookie = markerCookie(true);
    assert.match(cookie, /^__Host-levelflow-active-browser-session=/);
    assert.match(cookie, /; Secure$/);
    assert.match(cookie, /; path=\//);
    assert.doesNotMatch(cookie, /Domain=/i);
  });

  it("keeps the bare name, and no Secure, on a plain-http origin", () => {
    // `npm run dev` binds 0.0.0.0 precisely so a phone on the LAN can load
    // http://<host>:5173 — and there a browser accepts neither a Secure cookie
    // nor a __Host- one, so the reader would be signed out on every single load.
    assert.equal(markerName(false), BROWSER_SESSION_MARKER);
    assert.match(markerCookie(false), /^levelflow-active-browser-session=true;/);
    assert.doesNotMatch(markerCookie(false), /Secure/);
    assert.match(markerCookie(false), /; path=\//);
  });

  it("is scoped to the whole origin, so the legal pages and the app read one marker", () => {
    // The app is at "/" and the documents are at "/legal/*.html". A cookie
    // written without path=/ belongs to the writing document's directory, so a
    // marker written from one of those paths would go missing on the other —
    // which is the exact navigation this bug is about.
    assert.match(markerCookie(true), /; path=\//);
    assert.match(markerCookie(true), /; SameSite=Lax/);
  });

  it("clears by expiring the same cookie rather than writing a new one", () => {
    const cleared = clearedMarkerCookie(true);
    assert.match(cleared, new RegExp(`^${markerName(true)}=;`));
    assert.match(cleared, /; Max-Age=0/);
    // Same name, same path, same flags: a deletion that differs in any of them
    // deletes nothing.
    assert.match(cleared, /; path=\//);
    assert.match(cleared, /; Secure$/);
    assert.match(clearedMarkerCookie(false), /^levelflow-active-browser-session=;/);
    assert.doesNotMatch(clearedMarkerCookie(false), /Secure/);
  });
});

describe("reading the marker", () => {
  it("finds it among the other cookies of the jar", () => {
    assert.equal(
      browserSessionMarked(`theme=dark; ${markerName(true)}=true; x=1`, null, true),
      true,
    );
    assert.equal(browserSessionMarked(`${markerName(true)}=true`, null, true), true);
    assert.equal(
      browserSessionMarked(`${BROWSER_SESSION_MARKER}=true`, null, false),
      true,
    );
  });

  it("reads only the name this origin can itself write", () => {
    // The sibling-subdomain case, which is the whole reason for the prefix: a
    // parent domain can set `levelflow-active-browser-session` for every host
    // under windwardline.com, and it must not be able to vouch for a browser
    // session here. The reverse pairing is the same rule in the other direction.
    assert.equal(
      browserSessionMarked(`${BROWSER_SESSION_MARKER}=true`, null, true),
      false,
    );
    assert.equal(
      browserSessionMarked(`${markerName(true)}=true`, null, false),
      false,
    );
  });

  it("does not mistake a longer cookie name that ends with this one", () => {
    // document.cookie is one flat string, so a substring test would accept
    // "not-levelflow-active-browser-session=true" — a cookie any other page on
    // the origin could set — as a licence to keep a stored session.
    assert.equal(
      browserSessionMarked(`not-${BROWSER_SESSION_MARKER}=true`, null, false),
      false,
    );
    assert.equal(
      browserSessionMarked(`x-${markerName(true)}=true`, null, true),
      false,
    );
    assert.equal(
      browserSessionMarked(`${BROWSER_SESSION_MARKER}=false`, null, false),
      false,
    );
    assert.equal(browserSessionMarked("", null, true), false);
  });

  it("still accepts the per-tab marker, for a browser that refuses cookies", () => {
    // Safari's "Block all cookies" and its equivalents make the cookie
    // unwritable. Falling back to sessionStorage there degrades this fix to the
    // old per-tab behaviour rather than to an app nobody can stay signed in to.
    assert.equal(browserSessionMarked("", "true", true), true);
    assert.equal(browserSessionMarked("", "1", true), false);
  });
});

describe("useAuthSession spends the marker through this module only", () => {
  const hook = readFileSync("src/hooks/useAuthSession.ts", "utf8");

  it("keeps no sessionStorage key of its own", () => {
    // The regression this closes: two writers of one marker, one of them
    // per-tab, is how the tab-scoped half survives a fix aimed at the other.
    assert.doesNotMatch(hook, /sessionStorage/);
    assert.doesNotMatch(hook, /SESSION_MARKER_KEY/);
    assert.match(hook, /from "\.\.\/lib\/browserSession"/);
  });
});
