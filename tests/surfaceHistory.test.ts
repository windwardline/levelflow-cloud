import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  encodeSurfaceState,
  readSurfaceState,
  sameSurface,
  type Surface,
} from "../src/lib/surfaceHistory";

// Spec §17o tier 1: "Each switch pushes a history entry, so Back walks the surface
// path backwards." The inventory finding that justified it: fourteen in-app
// destinations, not one of them with a history entry, so the browser's Back — the
// only navigation control an OS hands a phone — left Levelflow instead of walking
// back through it.
//
// The ruling's three conditions are the three describes below: the entry load
// pushes nothing, a control naming the surface already showing pushes nothing, and
// the URL is not the carrier.
const APP = readFileSync("src/App.tsx", "utf8");

const desk: Surface = { tab: "advisor", deskView: "scan", document: null };

describe("a surface is the three coordinates that decide what a reader sees", () => {
  it("compares all three, so the mobile sub-surfaces are surfaces too", () => {
    assert.equal(sameSurface(desk, { ...desk }), true);
    // Scan and Trades are two of the three destinations the mobile tab bar offers
    // (§17e) and both live inside the "advisor" tab, so a comparison that ignored
    // deskView would make Back skip the tab bar's own path.
    assert.equal(sameSurface(desk, { ...desk, deskView: "trades" }), false);
    assert.equal(sameSurface(desk, { ...desk, tab: "history" }), false);
    // And one document is not another.
    assert.equal(
      sameSurface(
        { tab: "legal", deskView: "scan", document: "privacy" },
        { tab: "legal", deskView: "scan", document: "terms" },
      ),
      false,
    );
  });
});

describe("the state a pushed entry carries", () => {
  it("round-trips every coordinate", () => {
    for (const surface of [
      desk,
      { tab: "history", deskView: "trades", document: null },
      { tab: "legal", deskView: "scan", document: "risk-disclaimer" },
    ] satisfies Surface[]) {
      assert.deepEqual(readSurfaceState(encodeSurfaceState(surface)), surface);
    }
  });

  it("reads the entry load's own state as no surface at all", () => {
    // The load that opened the app pushes nothing, so its state is whatever the
    // browser had — null in the ordinary case. Back onto it means "you are at the
    // entry", and the app restores the surface the reader entered on; a further
    // Back leaves Levelflow, because nothing is intercepted there.
    assert.equal(readSurfaceState(null), null);
    assert.equal(readSurfaceState(undefined), null);
  });

  it("never reads another writer's state as a surface", () => {
    // history.state is shared with anything else that writes it. A record that is
    // not ours is the entry state as far as this app is concerned.
    assert.equal(readSurfaceState({ scrollTop: 40 }), null);
    assert.equal(readSurfaceState("legal"), null);
    assert.equal(readSurfaceState({ levelflowSurface: { tab: "legal" } }), null);
    assert.equal(
      readSurfaceState({ levelflowSurface: { tab: 1, deskView: "scan", document: null } }),
      null,
    );
  });

  it("is keyed under one name nothing else would choose", () => {
    assert.deepEqual(Object.keys(encodeSurfaceState(desk)), ["levelflowSurface"]);
  });
});

describe("§17o tier 1 — App switches surfaces through one door, and it is the one that pushes", () => {
  it("has exactly one caller of each surface setter", () => {
    // The doctrine's structural claim: "in-app destinations … are reached through
    // the app's own navigation". Fourteen call sites each calling setActiveTab
    // themselves is fourteen chances for one of them to forget the history entry,
    // so the setters are private to the funnel and every destination calls that.
    assert.equal((APP.match(/setActiveTab\(/g) ?? []).length, 1);
    assert.equal((APP.match(/setDeskMobileView\(/g) ?? []).length, 1);
    assert.equal((APP.match(/setLegalDocument\(/g) ?? []).length, 1);
    assert.match(APP, /function goToSurface\(next: Surface\)/);
  });

  it("pushes for a real move and not for a restatement", () => {
    const funnel = APP.match(/function goToSurface\(next: Surface\)[\s\S]*?\n {2}\}/)?.[0] ?? "";
    assert.ok(funnel.length > 0, "expected goToSurface");
    // Ten taps on Insights leave one entry, not ten.
    assert.match(funnel, /if \(sameSurface\(next, currentSurface\)\) \{\s*return;/);
    assert.match(funnel, /pushSurface\(next\)/);
    // The push happens once, in here, and nowhere else in the app.
    assert.equal((APP.match(/pushSurface\(/g) ?? []).length, 1);
  });

  it("pushes nothing for the load that opened the app", () => {
    // The entry is the browser's own entry. Back onto it restores the surface the
    // reader entered on — remembered at mount, since that state carries no surface
    // of ours — and Back from there leaves normally.
    assert.doesNotMatch(APP, /replaceSurface|history\.pushState/);
    assert.match(APP, /const entrySurface = useRef/);
    assert.match(
      APP,
      /readSurfaceState\(event\.state\) \?\? entrySurface\.current/,
    );
  });

  it("subscribes to popstate for the lifetime of the app, and unsubscribes", () => {
    assert.match(APP, /window\.addEventListener\("popstate", /);
    assert.match(APP, /window\.removeEventListener\("popstate", /);
  });

  it("puts focus somewhere deterministic when history moves the surface", () => {
    // The problem this wave creates and has to answer: Back can retire the element
    // focus was on — a link inside the document the reader just left — and focus
    // falling to document.body strands a keyboard reader, the same failure
    // MobileAccountMenu's closeAndFocusTrigger exists to prevent. A click keeps the
    // app's existing behaviour (focus returns to the control that was clicked);
    // only a history-driven change moves it, and it moves to the region that now
    // holds the surface, which already carries that surface's accessible name.
    const popped = APP.match(/function applyPoppedSurface[\s\S]*?\n {2}\}/)?.[0] ?? "";
    assert.ok(popped.length > 0, "expected the popstate handler");
    // The handler raises a flag; an effect does the focusing after the commit. Not a
    // style choice — the region is keyed on the surface, so a surface change REPLACES
    // that element, and focusing it from the handler focuses the node React is about
    // to remove. Focus then lands on the body after all, which is the failure this
    // whole test exists to catch, and which the 375px browser leg caught.
    assert.match(popped, /restoreFocus\.current = true;/);
    const effect = APP.match(
      /useEffect\(\(\) => \{\s*if \(!restoreFocus\.current\)[\s\S]*?\n {2}\}\);/,
    )?.[0] ?? "";
    assert.ok(effect.length > 0, "expected the focus-after-commit effect");
    assert.match(effect, /restoreFocus\.current = false;/);
    assert.match(effect, /contentRegion\.current\?\.focus\(\)/);
    // Programmatic only: the region is a tab stop at ≥lg by §17i, and this must not
    // add a second one below lg where the surface's own region scrolls.
    assert.match(APP, /tabIndex=\{regionScrolls \? 0 : -1\}/);
  });

  it("leaves the URL exactly as the reader found it", () => {
    // "The URL is not the carrier. Surfaces have no addresses; the state does."
    // Which is what lets the consumed ?donate arrival compose: that arrival is
    // cleaned out of the URL by clearDonateRequest, and a model that pushed paths
    // or queries would put something back.
    const history = readFileSync("src/lib/surfaceHistory.ts", "utf8");
    assert.match(history, /window\.history\.pushState\(\s*encodeSurfaceState\(surface\),\s*"",\s*\)/);
    assert.doesNotMatch(history, /location\.pathname|location\.search|location\.href/);
  });
});
