import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  isMobileViewportWidth,
  MOBILE_BREAKPOINT_PX,
} from "../src/hooks/useMobileViewport";

// Q2-I8: src/hooks/ held 398 lines and not one unit test — including
// useTradeSetups, whose discarded error state was Q2-C2, and useAuthSession's
// session-marker sign-out, which is security-adjacent.
//
// What can be exercised directly is: useMobileViewport's pure half imports React
// and nothing else, so it runs here. The other three reach src/lib/supabase.ts,
// which reads Vite's import.meta.env and throws under plain `tsx --test` (the
// same limit CurrentTradesRail.tsx's header records for App.tsx), and driving a
// hook needs a renderer this stack has no jsdom for. So their contracts are
// pinned against source text, the established technique in this repo for
// behavior no unit harness here can reach — with the real event paths covered by
// the e2e suite, which runs a browser.
describe("useMobileViewport — the app's one viewport check", () => {
  it("is the lg breakpoint itself, in pixels", () => {
    assert.equal(MOBILE_BREAKPOINT_PX, 1024);
    const css = readFileSync("src/styles/index.css", "utf8");
    assert.match(css, /--breakpoint-lg:\s*1024px/);
  });

  it("treats the breakpoint as lg's own min-width boundary, not one pixel either side", () => {
    assert.equal(isMobileViewportWidth(1023), true);
    assert.equal(isMobileViewportWidth(1024), false);
    assert.equal(isMobileViewportWidth(1025), false);
  });

  it("is a sheet at phone widths and a desktop at laptop widths", () => {
    assert.equal(isMobileViewportWidth(375), true);
    assert.equal(isMobileViewportWidth(768), true);
    assert.equal(isMobileViewportWidth(1280), false);
    assert.equal(isMobileViewportWidth(1440), false);
  });

  it("subscribes to the same min-width query rather than a resize listener, and unsubscribes", () => {
    // A resize listener would fire on every intermediate pixel of a drag; the
    // media query fires once per real crossing, and it is the same query
    // Tailwind's own lg: rules compile to.
    const source = readFileSync("src/hooks/useMobileViewport.ts", "utf8");
    assert.match(
      source,
      /window\.matchMedia\(`\(min-width: \$\{MOBILE_BREAKPOINT_PX\}px\)`\)/,
    );
    assert.match(source, /query\.addEventListener\("change", onChange\)/);
    assert.match(source, /query\.removeEventListener\("change", onChange\)/);
    assert.doesNotMatch(source, /addEventListener\("resize"/);
  });
});

// Q2-C2's own guard at the hook level: the failure branch has to produce state a
// consumer can read, and it must not overwrite the rows with an empty list.
describe("useTradeSetups failure handling (source-pinned — see header)", () => {
  const source = readFileSync("src/hooks/useTradeSetups.ts", "utf8");

  it("reports the failure as a flag the hook returns, never a message nobody reads", () => {
    assert.match(source, /const \[loadFailed, setLoadFailed\] = useState\(false\);/);
    assert.match(source, /return \{\s*loadFailed,/);
    // The discarded string is gone rather than left beside its replacement.
    assert.doesNotMatch(source, /setError/);
    assert.doesNotMatch(source, /\berror,\s*\n\s*loading,/);
  });

  it("clears the flag at the start of every attempt, so a recovery is visible", () => {
    assert.match(
      source,
      /if \(!options\?\.silent\) \{\s*setLoading\(true\);\s*\}\s*setLoadFailed\(false\);/,
    );
  });

  it("logs the real cause and leaves the last good rows in place", () => {
    const catchBlock =
      source.match(/\} catch \(requestError\) \{[\s\S]*?\n {4}\} finally \{/)?.[0] ?? "";
    assert.ok(catchBlock.length > 0, "expected the request catch block");
    assert.match(catchBlock, /console\.warn\(/);
    assert.match(catchBlock, /setLoadFailed\(true\)/);
    // The defect this closes in the other direction: a failed read that calls
    // setSetups([]) is indistinguishable from an account with no setups.
    assert.doesNotMatch(catchBlock, /setSetups/);
  });

  it("stamps the outcome-refresh throttle on success only, and clears it on sign-out", () => {
    // M6, already fixed in wave 1 — pinned here so the hook's one piece of
    // module-scope state stays covered by a test rather than only by a comment.
    assert.match(
      source,
      /await refreshTradeOutcomes\(\);[\s\S]{0,400}lastOutcomeRefreshAt = Date\.now\(\);/,
    );
    assert.match(
      source,
      /setSetups\(\[\]\);[\s\S]{0,300}lastOutcomeRefreshAt = 0;/,
    );
  });
});

// Security-adjacent: this is what makes a Levelflow session end with the browser
// tab rather than persist in localStorage for the next person at the machine.
describe("useAuthSession browser-session marker (source-pinned — see header)", () => {
  const source = readFileSync("src/hooks/useAuthSession.ts", "utf8");

  it("signs out a restored session that this browser session never marked", () => {
    assert.match(
      source,
      /if \(data\.session && !shouldKeepSession\(authRedirectInProgress\)\) \{\s*window\.sessionStorage\.removeItem\(SESSION_MARKER_KEY\);\s*void client\.auth\.signOut\(\);\s*setSession\(null\);/,
    );
  });

  it("keeps a session that arrived through a magic-link redirect, before any marker exists", () => {
    // The marker cannot be set yet on the redirect that creates the session, so
    // the redirect's own parameters are what license keeping it.
    assert.match(
      source,
      /function shouldKeepSession\(authRedirectInProgress: boolean\) \{\s*return authRedirectInProgress \|\| window\.sessionStorage\.getItem\(SESSION_MARKER_KEY\) === "true";/,
    );
    assert.match(source, /search\.includes\("code="\)/);
    assert.match(source, /search\.includes\("token_hash="\)/);
    assert.match(source, /hash\.includes\("access_token="\)/);
    assert.match(source, /hash\.includes\("refresh_token="\)/);
  });

  it("clears the marker on every path that ends with no session", () => {
    const clears = source.match(
      /window\.sessionStorage\.removeItem\(SESSION_MARKER_KEY\)/g,
    ) ?? [];
    assert.equal(clears.length, 4);
    assert.match(source, /subscription\.unsubscribe\(\)/);
  });
});
