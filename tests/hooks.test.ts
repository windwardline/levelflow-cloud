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

// Q2-I9 and Q2-M5: the profile hook carried a state machine with no reader and
// applied the theme on one of the three paths that set a profile.
describe("useUserProfile state and theme paths (source-pinned — see header)", () => {
  const source = readFileSync("src/hooks/useUserProfile.ts", "utf8");

  it("keeps no state and returns no value that nothing reads", () => {
    // Q2-I9: setStatus fired three times per save, re-rendering the whole App
    // tree for a value App.tsx never destructured — and tests/mobileNav.test.ts
    // already pins that ProfilePanel "no longer" takes a saveStatus prop. The
    // same was true of `loading` and of the returned refreshProfile.
    assert.doesNotMatch(source, /setStatus/);
    assert.doesNotMatch(source, /\bstatus\b/);
    assert.doesNotMatch(source, /setLoading/);
    assert.match(source, /return \{\s*profile,\s*saveProfile,\s*\};/);
  });

  it("applies the loaded profile's theme on every path that sets a profile (Q2-M5)", () => {
    // Three paths set a profile: the unconfigured-client early return, the
    // success path, and the catch. Only the middle one called onThemeChange, so a
    // reader whose profile load failed — or who ran without a configured client —
    // kept whatever theme the previous render had, silently disagreeing with the
    // profile the surface was showing.
    const refresh = source.match(
      /const refreshProfile = useCallback[\s\S]*?\n {2}\}, \[/,
    )?.[0] ?? "";
    assert.ok(refresh.length > 0, "expected refreshProfile");
    // Three paths set a real profile, and all three go through applyProfile,
    // which is the pair. The one bare setProfile left is setProfile(null) on the
    // no-user path, which has no theme to apply.
    assert.equal((refresh.match(/applyProfile\(/g) ?? []).length, 3, refresh);
    assert.deepEqual(refresh.match(/setProfile\([^)]*\)/g), ["setProfile(null)"]);
    assert.match(
      source,
      /const applyProfile = useCallback\(\s*\n\s*\(next: UserProfile\) => \{\s*\n\s*setProfile\(next\);\s*\n\s*onThemeChange\(next\.themePreference\);/,
    );
    assert.match(
      refresh,
      /if \(!supabase\) \{\s*applyProfile\(fallback\);\s*return;/,
    );
    assert.match(refresh, /\} catch \(error\) \{[\s\S]{0,200}applyProfile\(fallback\);/);
  });
});

// Q2-M7 and Q1-#31: two props built from values that do not belong to the
// surface reading them.
describe("App and the trades rail pass only what the surface owns", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  const stage = readFileSync(
    "src/components/workspace/AdvisorWorkspace.tsx",
    "utf8",
  );

  it("builds the Trades badge's clock once per setups change, not once per render (Q2-M7)", () => {
    assert.match(
      app,
      /const tradeBadgeCount = useMemo\(\s*\n?\s*\(\) => currentTradeBadgeCount\(setupState\.setups, new Date\(\)\),\s*\n?\s*\[setupState\.setups\],\s*\n?\s*\);/,
    );
    assert.match(app, /tradeBadgeCount=\{tradeBadgeCount\}/);
  });

  it("never hands the ≥lg rail a mobile sub-view state (Q1-#31)", () => {
    // isActiveOnMobile exists to re-stamp the rail's "as of" the moment the
    // MOBILE Trades surface is shown; its own docblock calls it irrelevant at
    // ≥lg. Passing the live mobileView there let a mobile-only transition
    // re-stamp the desktop rail's freshness line.
    const desktopCall = stage.match(
      /<CurrentTradesRail\n(?![\s\S]{0,40}fixedFrame)[\s\S]*?\/>/,
    )?.[0] ?? "";
    assert.ok(desktopCall.length > 0, "expected the ≥lg rail call site");
    assert.match(desktopCall, /isActiveOnMobile=\{false\}/);
  });

  it("derives the chart view from the profile default rather than writing it in an effect (Q1-#33)", () => {
    assert.doesNotMatch(stage, /timeframeTouched/);
    assert.match(
      stage,
      /const timeframe = pickedTimeframe \?\? profile\.defaultTimeframe;/,
    );
  });
});
