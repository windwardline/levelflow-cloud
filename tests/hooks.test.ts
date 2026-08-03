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

  it("warns when the realtime subscription itself fails, with the cause intact", () => {
    // The hook's third failure path, and the quietest: a failed subscription is
    // not a failed read. The rows on screen stay correct, they just stop
    // changing, so an RLS policy change, an expired token or a channel-limit
    // rejection ends live updates with nothing said on either surface. This
    // console.warn is the operator's only signal, and it joins the same
    // "[history] ..." family as the two above — loud for the operator, silent
    // for the reader.
    assert.match(
      source,
      /if \(\s*status === REALTIME_SUBSCRIBE_STATES\.CHANNEL_ERROR \|\|\s*status === REALTIME_SUBSCRIBE_STATES\.TIMED_OUT\s*\) \{\s*console\.warn\(\s*"\[history\] realtime subscription failed; rows update only on wake or refresh",\s*status,\s*err,\s*\);\s*\}/,
    );
    assert.match(source, /\.subscribe\(\(status, err\) => \{/);
    // The whole error, never err.message: realtime-js builds it as
    // `new Error(message, { cause: error })`, so the structured reason lives in
    // `cause` — which is why its own subscribe() docblock says to log the full
    // err. The status rides along because TIMED_OUT arrives with no err at all.
    assert.doesNotMatch(source, /err\.message/);
    // CLOSED is not a failure: removeChannel in the effect's cleanup reports it
    // on every deliberate teardown, so warning on it would cry failure at a
    // clean shutdown. Naming the two real failures affirmatively is what keeps
    // it out, rather than a "not SUBSCRIBED" catch-all.
    assert.doesNotMatch(source, /REALTIME_SUBSCRIBE_STATES\.CLOSED/);
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

// The wake gap. Supabase's realtime reconnect re-subscribes but never replays:
// @supabase/phoenix's `rejoin()` calls `joinPush.resend()`, which re-sends the
// channel's original join payload — for postgres_changes only
// {event, schema, table, filter}, with no cursor and no `since` — and
// realtime-js accepts a `replay` option for broadcast on PRIVATE channels only
// (RealtimeChannel throws otherwise). So the server streams from the moment of
// the rejoin, every event that landed while the socket was down is gone, and
// nothing in the client reads the table again. A trade that stopped out
// overnight therefore keeps rendering as live until the reader reloads by hand.
describe("useTradeSetups re-reads on wake (source-pinned — see header)", () => {
  const source = readFileSync("src/hooks/useTradeSetups.ts", "utf8");

  it("re-reads the table when the tab comes back, and only on the way in", () => {
    // Guarded to the became-visible transition: 'hidden' fires the same event,
    // and re-reading on the way out serves nobody.
    assert.match(
      source,
      /document\.addEventListener\("visibilitychange", onVisible\)/,
    );
    assert.match(
      source,
      /if \(document\.visibilityState === "visible"\) \{\s*readAfterGap\(\);/,
    );
  });

  it("removes the visibility listener on unmount", () => {
    assert.match(
      source,
      /return \(\) =>\s*document\.removeEventListener\("visibilitychange", onVisible\);/,
    );
  });

  it("re-reads on a re-subscribe, never on the first one", () => {
    // The rejoin covers what visibility cannot: a foreground network change
    // reconnects with no visibilitychange to hear. The first SUBSCRIBED is not a
    // gap — it is the mount effect's own read, already in flight.
    assert.match(
      source,
      /if \(status !== REALTIME_SUBSCRIBE_STATES\.SUBSCRIBED\) \{\s*return;\s*\}\s*if \(resubscribed\) \{\s*readAfterGap\(\);\s*\}\s*resubscribed = true;/,
    );
    assert.match(source, /let resubscribed = false;/);
  });

  it("routes both wake paths through one reader that respects the outcome throttle", () => {
    // Silent so the rail and the ledger re-read under the reader rather than
    // flashing their loading state, and refreshOutcomes rather than
    // forceOutcomeRefresh so a reader flicking between tabs cannot drive the
    // provider-heavy refresh once per switch. The table read is what closes the
    // gap, and it runs either way.
    assert.match(
      source,
      /const readAfterGap = useCallback\(\(\) => \{\s*refreshSetups\(\{ refreshOutcomes: true, silent: true \}\);\s*\}, \[refreshSetups\]\);/,
    );
    // One reader, two callers — the force path stays App.tsx's, spec §8.
    assert.equal((source.match(/readAfterGap\(\)/g) ?? []).length, 2);
    assert.doesNotMatch(source, /forceOutcomeRefresh: true/);
  });

  it("leaves the two postgres_changes handlers exactly as they were", () => {
    const handlers = source.match(/refreshSetups\(\{ silent: true \}\);/g) ?? [];
    assert.equal(handlers.length, 2);
    assert.equal((source.match(/"postgres_changes"/g) ?? []).length, 2);
  });
});

// Security-adjacent: this is what makes a Levelflow session end with the browser
// session rather than persist in localStorage for the next person at the
// machine. WHERE the marker lives is the subject of tests/browserSession.test.ts
// — it was a per-tab sessionStorage key until the owner's 2026-08-02 navigation
// report, and per-tab is what made a second tab of the same browser look like a
// different person. What is pinned here is the hook's side of it.
describe("useAuthSession browser-session marker (source-pinned — see header)", () => {
  const source = readFileSync("src/hooks/useAuthSession.ts", "utf8");

  it("signs out a restored session that this browser session never marked", () => {
    assert.match(
      source,
      /if \(data\.session && !shouldKeepSession\(authRedirectInProgress\)\) \{\s*forgetStoredSession\(client\);\s*setSession\(null\);/,
    );
  });

  it("keeps that sweep local, so it cannot reach the reader's other devices", () => {
    // The report's "refreshing and going forward does not log you back in": the
    // default scope is "global", which revokes the refresh token at GoTrue, so
    // one unmarked tab signed the reader out everywhere and no reload could
    // recover it. "local" removes this browser's stored copy, which is the whole
    // of what the posture asks for. The app's own Sign out buttons are
    // deliberately untouched — a deliberate sign-out still ends every session.
    assert.match(
      source,
      /function forgetStoredSession\(client: AuthClient\) \{\s*clearBrowserSession\(\);\s*void client\.auth\.signOut\(\{ scope: "local" \}\);/,
    );
    const app = readFileSync("src/App.tsx", "utf8");
    assert.equal((app.match(/auth\.signOut\(\)/g) ?? []).length, 3);
  });

  it("keeps a session that arrived through a magic-link redirect, before any marker exists", () => {
    // The marker cannot be set yet on the redirect that creates the session, so
    // the redirect's own parameters are what license keeping it.
    assert.match(
      source,
      /function shouldKeepSession\(authRedirectInProgress: boolean\) \{\s*return authRedirectInProgress \|\| browserSessionActive\(\);/,
    );
    assert.match(source, /search\.includes\("code="\)/);
    assert.match(source, /search\.includes\("token_hash="\)/);
    assert.match(source, /hash\.includes\("access_token="\)/);
    assert.match(source, /hash\.includes\("refresh_token="\)/);
  });

  it("clears the marker on every path that ends with no session", () => {
    // Three: the two unmarked-session paths, both through forgetStoredSession,
    // and markSession's own null branch.
    const clears = source.match(/clearBrowserSession\(\)/g) ?? [];
    assert.equal(clears.length, 3);
    assert.equal((source.match(/forgetStoredSession\(client\)/g) ?? []).length, 2);
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
