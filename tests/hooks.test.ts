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
    assert.match(source, /return \{\s*lifetimeSetups,\s*loadFailed,/);
    // The discarded string is gone rather than left beside its replacement.
    assert.doesNotMatch(source, /setError/);
    assert.doesNotMatch(source, /\berror,\s*\n\s*loading,/);
  });

  it("refreshes before it ever signs out — one 401 kills a token, not a session (1r)", () => {
    // #273's deploy taught this the hard way: 22 signed-in E2E navigations
    // failed because the first 401 signed the reader out. On a fresh page
    // load a read can race the refresh timer and carry a just-expired JWT —
    // PostgREST answers 401 PGRST301 for a session GoTrue can still renew.
    // So the verdict is two-step: ask GoTrue for a new access token, retry
    // the read once, and only a REFUSED refresh (or a 401 after a fresh
    // token) proves the session dead.
    assert.match(
      source,
      /requestError instanceof LedgerReadError && requestError\.authFailure/,
    );
    assert.match(source, /retriedAfterRefresh/);
    assert.match(
      source,
      /authFailure[\s\S]{0,400}refreshSession\(\)[\s\S]{0,600}signOut\(\{ scope: "local" \}\)/,
    );
    // The sign-out branch returns before the generic failure word — a dead
    // session is not a retryable load failure, and "Try again shortly."
    // would be the wrong sentence for it.
    assert.match(
      source,
      /authFailure[\s\S]{0,700}return;[\s\S]{0,600}setLoadFailed\(true\);/,
    );
  });

  it("reads the display window and the lifetime record together, under one failure (spec §18)", () => {
    // Amendment 2's data path. Two reads — plus the rail's hydration read
    // when the lifetime record holds an active row the window missed — one
    // refresh, one catch: a lifetime aggregate computed while the window
    // read failed, or a rail missing its beyond-window actives, would be two
    // accounts on one surface, and the failure word the reader sees stays
    // the one that already exists.
    assert.match(
      source,
      /const \[windowRows, lifetimeRows\] = await Promise\.all\(\[\s*fetchTradeSetups\(\),\s*fetchLifetimeSetups\(\),\s*\]\);/,
    );
    // Exactly one catch, so no read has a failure story of its own.
    assert.equal((source.match(/\} catch \(/g) ?? []).length, 2);
    const catchBlock =
      source.match(/\} catch \(requestError\) \{[\s\S]*?\n {4}\} finally \{/)?.[0] ??
        "";
    assert.doesNotMatch(catchBlock, /setLifetimeSetups/);
  });

  it("hydrates exactly the actives the window missed, and only when there are any (spec §8)", () => {
    // Classification happens here, client-side, with the rail's own predicate
    // — the id list is the only thing the server is asked for. The length
    // guard is the steady state's whole cost: every active inside the window
    // means no third request at all.
    assert.match(
      source,
      /const missingActiveIds = lifetimeRows\s*\n\s*\.filter\(\(row\) => isActiveSetup\(row\) && !windowIds\.has\(row\.id\)\)\s*\n\s*\.map\(\(row\) => row\.id\);/,
    );
    assert.match(
      source,
      /const hydratedActives = missingActiveIds\.length > 0\s*\n\s*\? await fetchSetupsByIds\(missingActiveIds\)\s*\n\s*: \[\];/,
    );
    // The rail's population: the window plus the hydrated actives — and the
    // window alone when nothing was missing, so the common path allocates no
    // second array.
    assert.match(
      source,
      /setRailSetups\(\s*hydratedActives\.length > 0\s*\? windowRows\.concat\(hydratedActives\)\s*: windowRows,\s*\);/,
    );
  });

  it("clears the lifetime record and the rail wherever it clears the rows — never one without the others", () => {
    // The header must never outlive the account it describes: wherever the rows
    // go, the lifetime record and the rail go with them.
    //
    // Asserted as a property rather than as a count of sites. There used to be
    // two — sign-out, and a getUser() pre-flight that emptied everything when it
    // saw no user. That second one was deleted: auth-js swallows every AuthError
    // and answers `{user: null}`, so a network blip rendered the rail as "No
    // current trades." with positions open. Counting sites made removing a
    // WRONG clear-site fail a test whose subject is the clears that remain.
    const clears = source.match(/setSetups\(\[\]\);/g) ?? [];
    assert.ok(clears.length >= 1, "expected at least the sign-out clear");
    assert.equal(
      (source.match(
        /setSetups\(\[\]\);\s*setLifetimeSetups\(\[\]\);\s*setRailSetups\(\[\]\);/g,
      ) ?? []).length,
      clears.length,
      "every setSetups([]) must clear the lifetime record and the rail in the same breath",
    );
    // And the deleted one stays deleted: no auth pre-flight may empty the
    // account before the read that would have reported the failure honestly.
    // Scoped to the read path — the realtime subscribe still calls getUser for a
    // channel filter, and a failure there costs live updates rather than
    // replacing honest rows with an empty account.
    const readPath =
      source.match(/const refreshSetups = useCallback\([\s\S]*?\n {2}\}, \[\]\);/)?.[0] ?? "";
    assert.ok(readPath.length > 0, "expected the refreshSetups body");
    assert.doesNotMatch(readPath, /auth\.getUser\(\)/);
  });

  it("clears the flag at the start of every attempt, so a recovery is visible", () => {
    assert.match(
      source,
      /if \(!options\?\.silent\) \{\s*setLoading\(true\);\s*\}\s*setLoadFailed\(false\);/,
    );
  });

  it("logs the real cause and leaves the last good rows in place", () => {
    const catchBlock =
      source.match(/\} catch \(requestError\) \{[\s\S]*?\n {6}\} finally \{/)?.[0] ?? "";
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
      /setSetups\(\[\]\);\s*setLifetimeSetups\(\[\]\);\s*setRailSetups\(\[\]\);[\s\S]{0,300}lastOutcomeRefreshAt = 0;/,
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
      /refreshSetups\(\{ refreshOutcomes: true, silent: true \}\);\s*\}, WAKE_READ_COALESCE_MS\);/,
    );
    // One reader, two callers — the force path stays App.tsx's, spec §8.
    assert.equal((source.match(/readAfterGap\(\)/g) ?? []).length, 2);
    assert.doesNotMatch(source, /forceOutcomeRefresh: true/);
  });

  it("takes one read per wake, and stands down when another read already covered it", () => {
    // The pair this closes, measured rather than supposed: production telemetry
    // for 2026-08-03 shows the wake read and §8's surface-show force refresh
    // landing within the same second of each other, in pairs, on one wake. The
    // chain is the returning tab's own: GoTrue refreshes the token, useAuthSession
    // hands App a new session object, App's tab-activation effect re-fires with
    // forceOutcomeRefresh — a full second read of trade_setups plus an outcome
    // refresh for a reader who changed nothing.
    //
    // The wake reader is the half that yields, because it is the lesser read: it
    // takes the table only, while §8's takes the table and the outcomes. So the
    // wake read waits a beat and then asks whether anything read in the meantime.
    assert.match(source, /const WAKE_READ_COALESCE_MS = 300;/);
    assert.match(
      source,
      /if \(pendingWakeRead\.current !== null\) \{\s*return;\s*\}/,
    );
    assert.match(
      source,
      /pendingWakeRead\.current = window\.setTimeout\(\(\) => \{\s*pendingWakeRead\.current = null;/,
    );
    assert.match(
      source,
      /if \(lastReadStartedAt\.current >= wokeAt\) \{\s*return;\s*\}/,
    );
    // Every read stamps the clock the wake reader consults, at the START of the
    // read rather than its end: a read in flight already covers this instant.
    const stamp = source.indexOf("lastReadStartedAt.current = Date.now();");
    const silentGate = source.indexOf("if (!options?.silent) {");
    assert.ok(stamp > -1, "expected the read clock");
    assert.ok(
      silentGate > stamp,
      "the read must stamp the clock before it starts working",
    );
    assert.equal(
      (source.match(/lastReadStartedAt\.current = Date\.now\(\);/g) ?? []).length,
      1,
      "one stamp, on the one path every read takes",
    );
    // A wake read still waiting when the hook goes away is a read for nobody.
    assert.match(source, /window\.clearTimeout\(pendingWakeRead\.current\);/);
  });

  it("leaves §8's force refresh exactly where it was, on all three of its call sites", () => {
    // The dedup is the wake reader's alone. §8 spends the provider-heavy refresh
    // deliberately, on a surface the reader just opened (App.tsx's two activation
    // effects) and on the rail's own manual control — none of which this wave may
    // quietly throttle.
    const app = readFileSync("src/App.tsx", "utf8");
    assert.equal(
      (app.match(/refreshSetups\(\{ forceOutcomeRefresh: true \}\)/g) ?? []).length,
      3,
    );
  });

  it("leaves the two postgres_changes handlers exactly as they were", () => {
    const handlers = source.match(/refreshSetups\(\{ silent: true \}\);/g) ?? [];
    assert.equal(handlers.length, 2);
    assert.equal((source.match(/"postgres_changes"/g) ?? []).length, 2);
  });
});

// The deploy gap, and the incident that named it (2026-08-03). A reader's
// overnight tab was running the pre-#174 bundle and sent the retired all-markets
// scan request all morning; the server refuses that request by design, and the
// old client's catch turns the refusal into "Market scan could not complete. Try
// again shortly." — a dead end no retry leaves. The tab had no way to learn that
// a deploy had happened under it. This hook is that way: what it compares and why
// is src/lib/deployedVersion.ts's docblock, and the parse of both sides is real
// tested behavior in tests/deployedVersion.test.ts. What is pinned here is the
// hook's own shape, which no harness in this repo can drive.
describe("useDeployedVersion checks twice and never loops (source-pinned — see header)", () => {
  const source = readFileSync("src/hooks/useDeployedVersion.ts", "utf8");

  it("checks on mount and on the became-visible wake, and nowhere else", () => {
    // The two moments a tab can have been left behind: the shell arriving, and a
    // tab coming back. Guarded to the transition IN, exactly as useTradeSetups'
    // listener is — 'hidden' fires the same event, and a tab on its way out has
    // nothing to be told.
    //
    // Two calls, counted, and the first one placed ahead of the wake handler that
    // holds the second. A bare match for `void check()` was satisfied by the wake
    // path's own call, so deleting the mount check left this suite green — proved by
    // mutation in the merge-gate review, which is why the count and the position are
    // both pinned, and why the position is measured against `const onVisible`
    // rather than against the listener line: the handler is declared first, so an
    // indentation-based or listener-based check would have kept passing too.
    assert.equal((source.match(/void check\(\);/g) ?? []).length, 2);
    const firstCall = source.indexOf("void check();");
    const wakeHandler = source.indexOf("const onVisible = ");
    assert.ok(firstCall > -1, "expected the mount check");
    assert.ok(
      wakeHandler > firstCall,
      "the mount check must come before the wake handler that holds the other call",
    );
    assert.match(
      source,
      /document\.addEventListener\("visibilitychange", onVisible\)/,
    );
    assert.match(
      source,
      /if \(document\.visibilityState === "visible"\) \{\s*void check\(\);/,
    );
    // No interval, no polling: the whole point is two fetches, not a heartbeat.
    assert.doesNotMatch(source, /setInterval|setTimeout/);
  });

  it("never fetches twice over, and stops for good once a deploy is found", () => {
    // Two refs, two failure modes. `checking` is the fetch in flight — a wake
    // during a slow read must not start a second one. `answered` is the mismatch
    // already found: the notice stands until the reader reloads, so every later
    // check could only confirm what is already on screen.
    assert.match(source, /const checking = useRef\(false\);/);
    assert.match(source, /const answered = useRef\(false\);/);
    assert.match(
      source,
      /if \(answered\.current \|\| checking\.current\) \{\s*return;\s*\}/,
    );
    assert.match(source, /answered\.current = true;\s*setDeployMoved\(true\);/);
    // And the in-flight flag is dropped with the effect that raised it. Without
    // this, React's dev StrictMode remount hands the second run a flag the first
    // run set — whose fetch is already cancelled — so the mount check is swallowed
    // and nothing is checked until a wake. `answered` deliberately does NOT reset:
    // it is the sticky answer, and a remount must not re-open a settled question.
    assert.match(source, /cancelled = true;[\s\S]{0,700}checking\.current = false;/);
    assert.equal((source.match(/answered\.current = false/g) ?? []).length, 0);
  });

  it("says nothing when the read says nothing", () => {
    // bundleChanged is the whole decision, and it answers false for an unknown on
    // either side (dev, or a failed read). There is no other path to the notice —
    // no truthy-response shortcut, no default-to-stale.
    assert.match(
      source,
      /if \(cancelled \|\| !bundleChanged\(runningBundleId\(\), deployed\)\) \{\s*return;\s*\}/,
    );
    // One setter call, on the far side of that one gate: no truthy-response
    // shortcut, no default-to-stale, no second path to the notice.
    assert.equal((source.match(/setDeployMoved\(/g) ?? []).length, 1);
  });

  it("is gated on the shell it belongs to, and unsubscribes", () => {
    // The adjudication: authed-shell only. A signed-out tab fetches nothing here,
    // because the sign-in screen is short-lived and a stale one still signs in.
    assert.match(
      source,
      /export function useDeployedVersion\(enabled: boolean\)/,
    );
    assert.match(source, /if \(!enabled \|\| typeof document === "undefined"\) \{\s*return;\s*\}/);
    assert.match(source, /\}, \[enabled\]\);/);
    assert.match(
      source,
      /document\.removeEventListener\("visibilitychange", onVisible\);/,
    );
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

  it("keeps a session only while THIS browser has a sign-in in flight", () => {
    // The marker cannot be set yet on the redirect that creates the session, so
    // something else has to license keeping it for that one load.
    assert.match(
      source,
      /function shouldKeepSession\(authRedirectInProgress: boolean\) \{\s*return authRedirectInProgress \|\| browserSessionActive\(\);/,
    );
    // It used to be four substring tests on the address bar. Far too wide —
    // `?promocode=` matches `code=`, as does the browser autocompleting to an
    // old magic-link URL — and answerable by anyone, because the URL is the one
    // piece of state a third party controls. On a shared machine that defeated
    // the whole posture: person B types "levelflow", Chrome completes person A's
    // old callback, and person B lands on person A's Desk.
    //
    // PKCE holds the honest answer. signInWithOtp writes a code verifier and
    // exchangeCodeForSession removes it, so its presence IS "this browser
    // started a sign-in and has not finished it". No URL creates one.
    // BOTH halves, and the second was learned the hard way. A verifier alone
    // outlives an abandoned sign-in, so it restored a stored session on a plain
    // "/" load — the next-person-at-the-machine case the posture exists to
    // close. The e2e suite caught it at deploy time.
    assert.match(
      source,
      /return authCallbackInUrl\(\) && authExchangePending\(\);/,
    );
    // The URL half may exist, but never alone: it is the one piece of state a
    // third party controls, so it can only ever narrow, never unlock.
    assert.match(source, /function authCallbackInUrl\(\)/);
    assert.doesNotMatch(
      source,
      /return authExchangePending\(\);\s*\}/,
      "the verifier alone restores a session an abandoned sign-in left behind",
    );
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
    // same was true of `loading` and of the returned refreshProfile. (The
    // original pin here banned the bare word "status"; 1r's dead-session
    // check reads the PostgREST response status, which is a value with a
    // reader, so the pin now names the dead state machine exactly.)
    assert.doesNotMatch(source, /setStatus/);
    assert.doesNotMatch(source, /setLoading/);
    // §19 retrofit: the return grew three real mutators — saveBrokerAccount,
    // removeBrokerAccount, activateBrokerAccount — the multi-account read/write
    // seam this wave's later tasks consume. 1r adds loadFailed, which
    // ProfilePanel reads the way the history surfaces read useTradeSetups'.
    assert.match(
      source,
      /return \{\s*activateBrokerAccount,\s*loadFailed,\s*profile,\s*removeBrokerAccount,\s*renameBrokerAccount,\s*saveBrokerAccount,\s*saveProfile,\s*\};/,
    );
  });

  it("applies the loaded profile's theme on every path that sets a profile (Q2-M5)", () => {
    // Two paths set a real profile — the unconfigured-client early return and
    // the success path — and both go through applyProfile, which pairs the
    // profile with its theme. The catch no longer sets one at all (1r below),
    // because the blank-account-with-default-theme it used to apply was the
    // defect: a failed read replaced a loaded profile with an empty one and
    // flipped the reader's theme to prove it.
    const refresh = source.match(
      /const refreshProfile = useCallback[\s\S]*?\n {2}\}, \[/,
    )?.[0] ?? "";
    assert.ok(refresh.length > 0, "expected refreshProfile");
    assert.equal((refresh.match(/applyProfile\(/g) ?? []).length, 2, refresh);
    assert.deepEqual(refresh.match(/setProfile\([^)]*\)/g), ["setProfile(null)"]);
    assert.match(
      source,
      /const applyProfile = useCallback\(\s*\n\s*\(next: UserProfile\) => \{\s*\n\s*setProfile\(next\);\s*\n\s*onThemeChange\(next\.themePreference\);/,
    );
    assert.match(
      refresh,
      /if \(!supabase\) \{\s*applyProfile\(fallback\);\s*return;/,
    );
  });

  it("keeps the last-loaded profile when a read fails, and ends a dead session (1r)", () => {
    const refresh = source.match(
      /const refreshProfile = useCallback[\s\S]*?\n {2}\}, \[/,
    )?.[0] ?? "";
    assert.ok(refresh.length > 0, "expected refreshProfile");
    // The useTradeSetups law, applied to the profile: a failed read keeps
    // whatever was last read successfully rather than replacing it with an
    // empty account — no applyProfile(fallback) in the catch, a loadFailed
    // flag instead, cleared on the next successful load.
    assert.doesNotMatch(refresh, /catch \(error\) \{[\s\S]{0,300}applyProfile\(/);
    assert.match(refresh, /setLoadFailed\(true\);/);
    assert.match(refresh, /setLoadFailed\(false\);/);
    // A 401 kills the token, not necessarily the session (#273's deploy: a
    // read racing the refresh timer on a fresh page load carries a
    // just-expired JWT). Both reads carry their response status into the
    // predicate; the verdict is refresh-then-decide: GoTrue renews → retry
    // the read once; GoTrue refuses → the visit ends locally, because the
    // server already refuses everything this session holds.
    assert.equal(
      (refresh.match(/isDeadSessionError\(/g) ?? []).length >= 2,
      true,
      refresh,
    );
    assert.match(refresh, /refreshSession\(\)/);
    assert.match(refresh, /attempt\(true\)/);
    assert.match(
      refresh,
      /refreshSession\(\)[\s\S]{0,700}signOut\(\{ scope: "local" \}\)/,
    );
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
    // railSetups, not setups: the badge counts the rail's own population —
    // the window plus any active rows hydrated from beyond it — so the two
    // can never disagree about how many trades are live (spec §3/§8).
    assert.match(
      app,
      /const tradeBadgeCount = useMemo\(\s*\n?\s*\(\) => currentTradeBadgeCount\(setupState\.railSetups, new Date\(\)\),\s*\n?\s*\[setupState\.railSetups\],\s*\n?\s*\);/,
    );
    assert.match(app, /tradeBadgeCount=\{tradeBadgeCount\}/);
  });

  it("feeds the Desk's rails the rail population and Insights the ledger window", () => {
    // Two consumers, two reads, deliberately (spec §8 vs §18): the rail must
    // never lose an active trade to the 80-row display window, while the
    // ledger IS that display window — reopening a row restores the stage from
    // its stored analysis, which only full window rows carry.
    const advisorCall = app.match(/<AdvisorWorkspace\n[\s\S]*?\/>/)?.[0] ?? "";
    assert.ok(advisorCall.length > 0, "expected the AdvisorWorkspace call site");
    assert.match(advisorCall, /setups=\{setupState\.railSetups\}/);
    const historyCall = app.match(/<HistoryPanel\n[\s\S]*?\/>/)?.[0] ?? "";
    assert.ok(historyCall.length > 0, "expected the HistoryPanel call site");
    assert.match(historyCall, /setups=\{setupState\.setups\}/);
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
