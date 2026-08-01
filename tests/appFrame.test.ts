import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  SATELLITE_FRAME,
  SATELLITE_FRAME_SCROLL,
} from "../src/components/satelliteFrame";

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

// Spec §17i as amended: the frame is "EVERY page — no exceptions ('Every single
// page.')", the seldom-used set included. Those pages have no masthead, so their
// frame is the other two rows — content, then footer — and everything else about
// it is the app's: same unit, same overflow, same minmax floor, same footer
// composition, with only Donate's target differing by context.
//
// At every width rather than ≥lg only. §17g's "no footer below lg" is a ruling
// about the authed app, where a fixed tab bar already owns the bottom of the
// viewport and the account menu carries the link set; a satellite page has
// neither, so dropping its footer below lg would leave a phone reader no route to
// Help, Donate or the legal trio at all.
describe("§17i — the frame reaches the React satellites", () => {
  const SATELLITES = [
    "src/components/auth/AuthScreen.tsx",
    "src/components/auth/ParkingScreen.tsx",
  ];

  it("shares one frame idiom, two rows, no masthead", () => {
    assert.equal(
      SATELLITE_FRAME,
      "grid h-[100dvh] grid-rows-[minmax(0,1fr)_auto] overflow-hidden bg-paper text-ink",
    );
    assert.equal(
      SATELLITE_FRAME_SCROLL,
      "scrolly flex min-h-0 flex-col overflow-y-auto",
    );
    // The same floor App.tsx's shell needs, for the same reason: a bare 1fr row
    // stops shrinking at its own min-content height, and a long privacy notice or
    // an opened donation block is exactly what would then push the footer out of
    // the frame.
    assert.match(SATELLITE_FRAME, /minmax\(0,1fr\)/);
    // Flat by construction — §17c's box-on-box rule governs scroll regions (§17g).
    for (const idiom of [/\bborder/, /\bring/, /\boutline/, /rounded/, /shadow/]) {
      assert.doesNotMatch(SATELLITE_FRAME_SCROLL, idiom);
    }
    assert.match(SATELLITE_FRAME_SCROLL, /\bscrolly\b/);
  });

  it("puts both pre-auth screens in it, with the shared footer as the second row", () => {
    for (const file of SATELLITES) {
      const source = readFileSync(file, "utf8");
      const importBlock =
        source.match(/import \{[^}]*\} from "[^"]*satelliteFrame";/)?.[0] ?? "";
      assert.ok(
        importBlock.length > 0,
        `${file} must import the shared frame strings, not write its own`,
      );
      for (const name of ["SATELLITE_FRAME", "SATELLITE_FRAME_SCROLL"]) {
        assert.ok(importBlock.includes(name), `${file} imports no ${name}`);
        assert.ok(
          source.includes(name),
          `${file} imports ${name} without using it`,
        );
      }
      // The footer is the row, and it is the shared component rather than a
      // second footer of the same shape (tests/appFooter.test.ts counts them).
      assert.match(source, /<AppFooter/, file);
      assert.doesNotMatch(source, /<footer/, file);
      // Nothing left that sizes itself to the viewport instead of the region: a
      // min-h-screen inside a shorter region is a scrollbar with nothing under it.
      assert.doesNotMatch(source, /min-h-screen|min-h-dvh/, file);
      // Exactly one scroller per page.
      assert.equal(
        (source.match(/className=\{SATELLITE_FRAME_SCROLL\}/g) ?? []).length,
        1,
        `${file} must scroll exactly one region`,
      );
      assert.doesNotMatch(source, /\boverflow-y-auto\b/, file);
    }
    // The login screen's two columns centre against the region that holds them.
    assert.match(
      readFileSync("src/components/auth/AuthScreen.tsx", "utf8"),
      /grid min-h-full w-full max-w-7xl items-center/,
    );
    // The parking group centres on auto margins, which collapse rather than clip
    // when the content is taller than the region.
    assert.match(
      readFileSync("src/components/auth/ParkingScreen.tsx", "utf8"),
      /className="m-auto max-w-xl px-6 py-8 text-center"/,
    );
  });
});

// The static half of the same ruling, in the only place it can live: these four
// pages share one stylesheet and no build step, so the frame is CSS and the guard
// reads CSS. Same three facts as the app's: exactly the viewport tall, chrome that
// does not scroll, and one region between that does.
describe("§17i — the frame reaches the static pages", () => {
  const CSS = readFileSync("public/legal/legal.css", "utf8");
  const PAGES = [
    "public/404.html",
    "public/construction.html",
    "public/legal/privacy.html",
    "public/legal/risk-disclaimer.html",
    "public/legal/terms.html",
  ];

  function rule(selector: string): string {
    const found = CSS.match(
      new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{[^}]*\\}`),
    )?.[0] ?? "";
    assert.ok(found.length > 0, `expected a rule for ${selector}`);
    return found;
  }

  it("makes the body the frame — the viewport's height, and no document scroll", () => {
    const body = rule("body");
    assert.match(body, /height: 100dvh;/);
    assert.match(body, /overflow: hidden;/);
    assert.match(body, /display: flex;/);
    assert.match(body, /flex-direction: column;/);
    // The min-height column these pages used to be is what let a long notice
    // scroll the footer away below the fold.
    assert.doesNotMatch(body, /min-height: 100vh;/);
  });

  it("scrolls the content region and nothing else, at the kit's thin scrollbar", () => {
    const main = rule("main");
    assert.match(main, /flex: 1;/);
    assert.match(main, /min-height: 0;/);
    assert.match(main, /overflow-y: auto;/);
    assert.match(main, /scrollbar-width: thin;/);
    // The reading measure moved inside it, so the scrollbar sits at the viewport
    // edge rather than at the right edge of a centred 44rem column.
    assert.doesNotMatch(main, /max-width:/);
    assert.match(rule(".page-block"), /max-width: 44rem;/);
    // The two centred pages centre their block on auto margins rather than on the
    // body, which would have centred the footer along with it.
    for (const selector of ["body.not-found .page-block", "body.parking .page-block"]) {
      assert.match(rule(selector), /margin: auto;/);
    }
    for (const selector of ["body.not-found", "body.parking"]) {
      assert.doesNotMatch(rule(selector), /justify-content: center;/);
    }
  });

  it("pins the footer as the second row, in the app's own §17c composition", () => {
    const footer = rule("footer");
    assert.match(footer, /flex: 0 0 auto;/);
    assert.match(footer, /border-top: 1px solid var\(--color-hairline\);/);
    // No margin trick: the region's flex:1 is what puts this at the bottom.
    assert.doesNotMatch(footer, /margin-top: auto;/);
    const row = rule(".footer-row");
    assert.match(row, /align-items: baseline;/);
    assert.match(row, /justify-content: space-between;/);
    assert.match(row, /padding: 18px 20px;/);
    // The app footer's own measure and symmetrical padding, read from the
    // component rather than restated: max-w-7xl is 80rem, py-[18px] is the 18px.
    const appFooter = readFileSync("src/components/AppFooter.tsx", "utf8");
    assert.match(appFooter, /\bmax-w-7xl\b/);
    assert.match(appFooter, /\bpy-\[18px\]/);
    assert.match(row, /max-width: 80rem;/);
  });

  it("gives every page that footer, with the links that work in its context", () => {
    for (const page of PAGES) {
      const source = readFileSync(page, "utf8");
      const footer = source.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? "";
      assert.ok(footer.length > 0, `${page} has no footer`);
      assert.match(footer, /<div class="footer-row">/, page);
      assert.match(
        footer,
        /<p class="colophon">A Windward Line production<\/p>/,
        page,
      );
      // Help stays the mailto, and names the app so the shared inbox can route it
      // — the same subject App.tsx and the two React screens build.
      assert.match(
        footer,
        /href="mailto:help@windwardline\.com\?subject=%5BLevelflow%5D%20Help">Help<\/a>/,
        page,
      );
      // Donate links to the app root, per the ruling, with the app's own donate
      // entry point on it (AuthScreen reads ?donate on load).
      assert.match(footer, /<a href="\/\?donate">Donate<\/a>/, page);
      for (const document of ["risk-disclaimer", "privacy", "terms"]) {
        assert.match(footer, new RegExp(`href="/legal/${document}\\.html"`), page);
      }
      // Root-absolute, so every href resolves the same from /404.html and from
      // /legal/terms.html.
      assert.doesNotMatch(footer, /href="\.\.?\//, page);
      // One region, one footer: the content lives in the measure column inside
      // <main>, which is the only thing that scrolls.
      assert.match(source, /<div class="page-block">/, page);
      assert.equal((source.match(/<footer>/g) ?? []).length, 1, page);
    }
  });
});
