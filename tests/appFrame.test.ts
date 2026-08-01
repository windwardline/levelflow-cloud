import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Spec §17i (owner ruling, binding, as amended 2026-08-01): "Desktop is an
// app-shell frame on EVERY page — no exceptions ('Every single page.'): the
// authed tabs (Desk, Insights, Guide, Profile, Donate) AND the seldom-used set
// (parking, login, the legal trio, 404). Top chrome pinned (the masthead where
// one exists; the page's own head region otherwise), THE footer pinned bottom and
// always visible, the content region scrolling between them (100dvh frame, the
// §17g pattern lifted to ≥lg with the footer inside). The Desk's three columns
// keep scrolling internally above it."
//
// The frame is three facts and they are only a frame together: the shell is
// exactly the viewport tall, the chrome rows do not scroll, and precisely one
// thing between them does. Any two of the three without the last is either a
// footer nobody can reach or a document with two scrollbars, which is why they
// are pinned as one set here rather than scattered across the files that own each
// surface's composition. Source-pinned, no jsdom (see
// tests/currentTradesRail.test.tsx's header); the live 1280/1440 measurement is
// the authed e2e spec's.
const APP = readFileSync("src/App.tsx", "utf8");

function shellBranches(): string[] {
  const shell = APP.match(/function mainShellClassName\([\s\S]*?\n}\n/)?.[0] ?? "";
  assert.ok(shell.length > 0, "expected to find mainShellClassName");
  const branches = shell.match(/"[^"]*bg-paper text-ink[^"]*"/g) ?? [];
  assert.equal(branches.length, 2, "expected one shell branch per platform");
  return branches.map((branch) => branch.slice(1, -1));
}

// The content region's two ≥lg branches, in source order: the Desk's (which
// scrolls its own columns) and every other tab's (which scrolls itself).
function desktopContentBranches(): { desk: string; page: string } {
  const desk = APP.match(
    /: isDeskTab\n\s*\? "([^"]*)"\n\s*: "([^"]*)"\}/,
  );
  assert.ok(desk, "expected the content region's two ≥lg class branches");
  return { desk: desk[1], page: desk[2] };
}

describe("§17i — the shell is a frame on both platforms", () => {
  it("sizes both shells to the viewport and lets neither scroll as a document", () => {
    for (const branch of shellBranches()) {
      assert.match(branch, /(?:^|\s)grid(?:\s|$)/, branch);
      assert.match(branch, /h-\[100dvh\]/, branch);
      assert.match(branch, /(?:^|\s)overflow-hidden(?:\s|$)/, branch);
      // The min-height column both shapes used to be is what let a long page
      // push the footer past the fold. Neither is one now.
      assert.doesNotMatch(branch, /min-h-screen|min-h-dvh/, branch);
    }
  });

  it("gives the ≥lg shell a third row for the footer, and the <lg shell two (§17g)", () => {
    const [mobile, desktop] = shellBranches();
    assert.match(mobile, /grid-rows-\[auto_1fr\]/);
    assert.match(desktop, /grid-rows-\[auto_minmax\(0,1fr\)_auto\]/);
    // minmax(0,1fr), not a bare 1fr: a 1fr row floors at its own min-content
    // height, so the Guide's article or the Insights ledger would push the footer
    // row off the bottom of the frame the moment it outgrew the viewport. Proved
    // as the exact track list rather than "contains minmax", since the floor only
    // helps on the row the content actually lives in.
    assert.doesNotMatch(desktop, /grid-rows-\[auto_1fr_auto\]/);
    // Chosen by viewport and nothing else — the Desk tab no longer changes the
    // shell's shape, because the footer is in the frame on every surface.
    assert.match(APP, /function mainShellClassName\(isMobileViewport: boolean\)/);
    assert.match(APP, /className=\{mainShellClassName\(isMobileViewport\)\}/);
  });

  it("pins the masthead as the frame's first row", () => {
    assert.match(
      APP,
      /<header className="sticky top-0 z-20 border-b border-hairline bg-paper\/90 backdrop-blur">/,
    );
    // One header element, one footer mount, one content region: the frame's three
    // rows are three elements, not a composition each tab assembles for itself.
    assert.equal((APP.match(/<header/g) ?? []).length, 1);
    assert.equal((APP.match(/<AppFooter/g) ?? []).length, 1);
  });
});

describe("§17i — exactly one thing scrolls between the pinned rows", () => {
  it("scrolls the page inside the content region at ≥lg, never the document", () => {
    const { page } = desktopContentBranches();
    assert.match(page, /\blg:overflow-y-auto\b/);
    assert.match(page, /\blg:min-h-0\b/);
    // The kit's thin scrollbar, the same one the Desk's columns and every mobile
    // scroll region already take — not a per-surface invention.
    assert.match(page, /^scrolly\b/);
    assert.match(
      readFileSync("src/styles/index.css", "utf8"),
      /\.scrolly \{\s*scrollbar-width: thin;/,
    );
  });

  it("leaves the Desk's own region unscrolled, so its three columns stay the scrollers", () => {
    const { desk } = desktopContentBranches();
    assert.match(desk, /\blg:overflow-hidden\b/);
    assert.doesNotMatch(desk, /overflow-y-auto/);
    // The columns' heights derive from the region, not from the viewport: each is
    // h-full of a grid row the frame sized, which is why nothing in this chain
    // names the masthead's height.
    const stage = readFileSync(
      "src/components/workspace/AdvisorWorkspace.tsx",
      "utf8",
    );
    assert.match(desk, /\blg:h-full\b/);
    assert.match(desk, /\blg:min-h-0\b/);
    assert.equal(
      (stage.match(/lg:h-full lg:min-h-0 lg:overflow-y-auto/g) ?? []).length,
      3,
      "all three Desk columns scroll themselves inside the region",
    );
    for (const source of [stage, APP]) {
      assert.doesNotMatch(
        source,
        /100dvh_-|100vh_-|calc\(100/,
        "no surface may subtract the masthead's height by hand",
      );
    }
  });

  it("re-measures every sticky and anchor offset against the region, not the viewport", () => {
    // The Guide's TOC is the app's one sticky element inside the region, and both
    // of its offsets were viewport-relative before this ruling: it pinned at 89px
    // to clear a sticky masthead, and its sections reserved 112px of scroll margin
    // for the same reason. Nothing overlaps the region, so both numbers re-base
    // onto it — and they re-base DIFFERENTLY, which is the trap this pins.
    //
    // Measured in Chromium against the built CSS at 1280 and 1440: a sticky offset
    // applies inside the region's CONTENT box (the region's own 20px top padding
    // is already outside the rect), so the rail's resting offset there is zero and
    // any positive offset is a gap — at top-5 the rail measured y=109 against an h1
    // at y=89. A scroll landing, by contrast, aligns to the region's PADDING box,
    // so a section needs exactly that 20px back to arrive where the article rests
    // (measured: section top y=89, the h1's own resting y).
    //
    // So the pairing is what is pinned, not two independent numbers: a zero sticky
    // offset beside a region that carries the padding, and a scroll margin read
    // from that same padding.
    const guide = readFileSync("src/components/workspace/GuidePanel.tsx", "utf8");
    const { page } = desktopContentBranches();
    const pageTopPadStep = Number(page.match(/\bsm:pt-(\d+)\b/)?.[1]);
    assert.ok(Number.isFinite(pageTopPadStep), "expected the region's top pad");
    // Tailwind's spacing step is 0.25rem, and 20px is what the region rests at.
    assert.equal(pageTopPadStep * 4, 20);
    assert.match(guide, /sticky top-0\b/);
    assert.doesNotMatch(guide, /sticky top-\[89px\]/);
    assert.match(guide, new RegExp(`scroll-mt-${pageTopPadStep}\\b`));
    assert.doesNotMatch(guide, /scroll-mt-28/);
  });
});
