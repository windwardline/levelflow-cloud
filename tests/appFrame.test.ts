import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { MOBILE_FRAME_SCROLL } from "../src/components/mobileFrame";
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

  it("frames the pre-auth loading gate too, so nothing in the app is a min-height column (M5)", () => {
    // The one surface outside the frame, and the only reason a viewport-minimum
    // utility still shipped in the built CSS. It is footer-less and transient, so
    // nothing was ever unreachable — but a surface that opts out of the frame is
    // the shape §17i retired, and this one had no reason left to keep it.
    const gate = APP.match(
      /<main className="([^"]*items-center justify-center[^"]*)">/,
    )?.[1] ?? "";
    assert.ok(gate.length > 0, "expected the loading gate's own shell");
    assert.match(gate, /h-\[100dvh\]/);
    assert.match(gate, /(?:^|\s)overflow-hidden(?:\s|$)/);
    assert.doesNotMatch(APP, /min-h-screen|min-h-dvh/);
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
    // M2 (wave-8 review): that scroll margin is a ≥lg number and now says so. It
    // shipped un-prefixed, so deriving it from the ≥lg region's top padding moved
    // the MOBILE Guide's anchor landing by 92px as a side effect of a desktop
    // ruling. Below lg the scrollport is the surface's own region (§17g), and that
    // region carries no top padding at all — read from the frame string rather
    // than restated — so the mobile landing rests at zero.
    assert.equal(
      MOBILE_FRAME_SCROLL.match(/\bpt-\d+\b/),
      null,
      "the mobile scroll region has no top padding to reserve",
    );
    assert.match(guide, new RegExp(`\\blg:scroll-mt-${pageTopPadStep}\\b`));
    assert.doesNotMatch(
      guide,
      /(?<![-:\w])scroll-mt-/,
      "an un-prefixed scroll margin ships at both widths",
    );
    assert.doesNotMatch(guide, /scroll-mt-28/);
  });
});

// The frame's fourth fact, and the one wave 8 lost: whatever scrolls has to be
// reachable without a mouse. §17i took the document's scroll away on every page,
// so the only thing that can move is a box in the middle of the frame — and a
// scroll box no element can focus is a scroll box no keyboard can move. Measured
// in Chromium against the built app before this fix: from the focus every page
// load starts with, Space / ArrowDown / PageDown / End moved the Guide's region
// 0px of 4147, and the legal trio's 0px of 462 at 375. That is WCAG 2.1.1 on the
// three pages where readability is a compliance matter.
//
// What restores it is a tab stop on the scroller itself, with a name so the stop
// announces as something. Pinned here for all three families at once — the app's
// region, the React satellites' region, and the static pages' <main> — because
// the failure was one ruling's side effect, not three unrelated omissions. The
// live proof (one Tab lands on the region, and the keys move it from there) is
// tests/e2e/public-auth.spec.ts's and the authed spec's.
describe("§17i — every region the frame scrolls is keyboard-reachable (WCAG 2.1.1)", () => {
  it("makes the app's content region a named tab stop wherever it is the scroller", () => {
    // All three attributes ride one gate, and it is the gate that says whether
    // this box can move at all: below lg each surface scrolls its own inner
    // region (src/components/mobileFrame.ts), and on the Desk the three columns
    // do. A stop on a box that cannot scroll is a stop that does nothing.
    assert.match(
      APP,
      /const regionScrolls = !isMobileViewport && !isDeskTab;/,
    );
    assert.match(APP, /aria-label=\{regionScrolls \? REGION_LABELS\[activeTab\] : undefined\}/);
    assert.match(APP, /role=\{regionScrolls \? "region" : undefined\}/);
    assert.match(APP, /tabIndex=\{regionScrolls \? 0 : undefined\}/);
    // On the element that carries the region's own class branches and testid,
    // not on some wrapper near it.
    const region = APP.match(
      /<div\n\s*key=\{activeTab\}[\s\S]*?data-testid="content-region"[\s\S]*?>/,
    )?.[0] ?? "";
    assert.ok(region.length > 0, "expected the content region's opening tag");
    for (const attribute of ["aria-label=", "role=", "tabIndex="]) {
      assert.ok(region.includes(attribute), `the region carries no ${attribute}`);
    }
  });

  it("names that stop after the surface inside it, for every tab the app has", () => {
    const labels = APP.match(/const REGION_LABELS: Record<AppTab, string> = \{([\s\S]*?)\};/)
      ?.[1] ?? "";
    assert.ok(labels.length > 0, "expected REGION_LABELS");
    const named = Object.fromEntries(
      Array.from(labels.matchAll(/(\w+): "([^"]+)",/g), (match) => [match[1], match[2]]),
    );
    const tabs = Array.from(
      APP.match(/const TABS: Array<\{ label: string; value: AppTab \}> = \[([\s\S]*?)\];/)?.[1]
        ?.matchAll(/\{ label: "([^"]+)", value: "(\w+)" \}/g) ?? [],
      (match) => ({ label: match[1], value: match[2] }),
    );
    assert.equal(tabs.length, 4, "expected the masthead's four tabs");
    // Derived rather than restated: every tab the masthead lists is named here
    // with the masthead's own word, and Donate — which has no tab, only the
    // footer's control — is named too, so no surface can reach the region
    // unnamed.
    for (const tab of tabs) {
      assert.equal(named[tab.value], tab.label, `${tab.value} is named twice over`);
    }
    const union = APP.match(/type AppTab =([^;]*);/)?.[1] ?? "";
    const members = Array.from(union.matchAll(/"(\w+)"/g), (match) => match[1]);
    assert.deepEqual(Object.keys(named).sort(), members.sort());
  });

  it("makes both React satellites' region a named tab stop", () => {
    const NAMES: Record<string, string> = {
      "src/components/auth/AuthScreen.tsx": "Sign in",
      "src/components/auth/ParkingScreen.tsx": "Under construction",
    };
    for (const [file, name] of Object.entries(NAMES)) {
      const source = readFileSync(file, "utf8");
      const region = source.match(
        /<div\n\s*aria-label="[^"]*"\n\s*className=\{SATELLITE_FRAME_SCROLL\}\n\s*role="region"\n\s*tabIndex=\{0\}\n\s*>/,
      )?.[0] ?? "";
      assert.ok(region.length > 0, `${file}'s scroll region is not a named tab stop`);
      assert.ok(region.includes(`aria-label="${name}"`), `${file} names it something else`);
    }
  });

  it("gives the region its focus ring inside its own edge, in both stylesheets", () => {
    // The frame is overflow-hidden, so the kit's own +2px offset would draw the
    // ring where nothing can see it. Same outline, other side of the border —
    // and unlayered in the app's sheet, or the utilities layer's own
    // :focus-visible would outrank it.
    const kit = readFileSync("src/styles/index.css", "utf8");
    assert.match(kit, /\n\.scrolly:focus-visible \{\n  outline-offset: -2px;\n\}/);
    const legal = readFileSync("public/legal/legal.css", "utf8");
    assert.match(
      legal,
      /\nmain:focus-visible \{\n  outline: 2px solid var\(--color-accent\);\n  outline-offset: -2px;\n\}/,
    );
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

// M6 (wave-8 review): the footer's Donate is a link to /?donate on every satellite
// (pinned below and in tests/appFooter.test.ts), and what makes that a route rather
// than a page load with no visible result is the login screen reading it — and then
// bringing the block it opens into view, because the control that opens it is the
// frame's bottom row and the block can be most of a scroll region away. Nothing
// guarded either half.
describe("§17i — the satellites' Donate opens something, and it can be seen (M6)", () => {
  const AUTH = readFileSync("src/components/auth/AuthScreen.tsx", "utf8");

  it("opens the block from the query and from the hash, on load", () => {
    const initial = AUTH.match(
      /useState\(\(\) => \{\s*const params = new URLSearchParams\(window\.location\.search\);\s*return ([^;]*);/,
    )?.[1] ?? "";
    assert.ok(initial.length > 0, "expected donationsOpen's initial state");
    assert.match(initial, /params\.has\("donate"\)/);
    assert.match(initial, /window\.location\.hash === "#donate"/);
  });

  it("scrolls it into view when it opens, in an effect keyed on that state", () => {
    // An effect, not a scroll inside the click handler: the block mounts on this
    // state change, so there is nothing to scroll to until React has committed it.
    // The same effect is what covers the ?donate / #donate entry above.
    const effect = AUTH.match(/useEffect\(\(\) => \{\s*if \(donationsOpen\)[\s\S]*?\}, \[donationsOpen\]\);/)
      ?.[0] ?? "";
    assert.ok(effect.length > 0, "expected the scroll-into-view effect");
    assert.match(effect, /donationsRef\.current\?\.scrollIntoView\(\{ block: "center" \}\)/);
    // The ref is on the block itself, and the footer's control is what flips the
    // state — the disclosure form of the union, so aria-expanded exists there and
    // nowhere else (tests/appFooter.test.ts owns that half).
    assert.match(AUTH, /<div\s*\n?\s*ref=\{donationsRef\}/);
    assert.match(AUTH, /expanded: donationsOpen,/);
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

  // I1 (wave-8 review): §17i's "the page's own head region otherwise" was
  // unimplemented — the frame was two rows on every satellite, so on the legal
  // trio the mark, the eyebrow and "Levelflow" scrolled out of view (413 / 363 /
  // 462px of region scroll at 375). The trio pins its head now. The 404 and the
  // parking page do not, and that is the deviation this pins in both directions
  // rather than leaving it to a comment: both are one centred block, nothing on
  // either scrolls, and a head split off it would sit in the corner of a page
  // composed around its middle.
  describe("the head region is the first row where there is a head to pin (I1)", () => {
    const PINNED = [
      "public/legal/privacy.html",
      "public/legal/risk-disclaimer.html",
      "public/legal/terms.html",
    ];
    const CENTRED = ["public/404.html", "public/construction.html"];

    it("pins mark, eyebrow and wordmark above the region on the legal trio", () => {
      for (const page of PINNED) {
        const source = readFileSync(page, "utf8");
        const head = source.match(/<header>[\s\S]*?<\/header>/)?.[0] ?? "";
        assert.ok(head.length > 0, `${page} pins no head`);
        // The whole head, in the order §17i fixes, on the reading column's own
        // measure rather than a second one.
        assert.match(head, /<div class="page-block">/, page);
        assert.ok(
          head.indexOf('class="page-mark"') < head.indexOf('class="page-eyebrow"'),
          `${page}: the mark must stay above the eyebrow`,
        );
        assert.ok(
          head.indexOf('class="page-eyebrow"') < head.indexOf("<h1>"),
          `${page}: the eyebrow must stay above the wordmark`,
        );
        assert.match(head, /<h1>Levelflow<\/h1>/, page);
        // …and out of the region below, so the scroll cannot take it away.
        const region = source.match(/<main[\s\S]*?<\/main>/)?.[0] ?? "";
        for (const inHead of ['class="page-mark"', 'class="page-eyebrow"', "<h1>"]) {
          assert.ok(!region.includes(inHead), `${page}: ${inHead} is still inside <main>`);
        }
        assert.equal((source.match(/<header>/g) ?? []).length, 1, page);
      }
    });

    it("makes that row chrome, not content — it does not scroll, and it rules off", () => {
      const head = rule("header");
      assert.match(head, /flex: 0 0 auto;/);
      assert.match(head, /border-bottom: 1px solid var\(--color-hairline\);/);
      // The app's masthead, in the same two facts (border-b + a row that is not
      // the scroller), and the frame's one inset.
      assert.match(
        readFileSync("src/App.tsx", "utf8"),
        /<header className="sticky top-0 z-20 border-b border-hairline/,
      );
      assert.match(head, /padding: 32px var\(--page-inset\) 24px;/);
      assert.match(rule("header h1"), /margin-bottom: 0;/);
      // The gap under the rule is the gap the h1's own margin used to be.
      assert.match(rule("header + main"), /padding-top: 32px;/);
    });

    it("leaves the two centred pages a single block, and says so", () => {
      for (const page of CENTRED) {
        const source = readFileSync(page, "utf8");
        assert.doesNotMatch(source, /<header/, `${page} must stay one centred block`);
        // Which is only sound because their block still holds the whole head.
        const region = source.match(/<main[\s\S]*?<\/main>/)?.[0] ?? "";
        assert.match(region, /class="page-mark"/, page);
        assert.match(region, /class="page-eyebrow"/, page);
        assert.match(region, /<h1>Levelflow<\/h1>/, page);
      }
      // The deviation is disclosed where the frame is defined, rather than left to
      // a reader to notice — the review's own complaint about the first attempt,
      // which asserted "no masthead, so the frame is the other two rows" and left
      // the clause unmentioned.
      const frame = readFileSync("src/components/satelliteFrame.ts", "utf8");
      assert.match(frame, /head region otherwise" is a real clause/);
      assert.match(frame, /the legal trio pins mark \+ eyebrow \+ wordmark/);
    });
  });

  it("makes each page's own <main> a named tab stop, so the notice can be read by keyboard", () => {
    for (const page of PAGES) {
      const source = readFileSync(page, "utf8");
      const main = source.match(/<main[^>]*>/)?.[0] ?? "";
      assert.ok(main.length > 0, `${page} has no <main>`);
      assert.match(main, /\btabindex="0"/, page);
      // Named after the page, read from the page: the eyebrow is what the
      // document calls itself, and a landmark named something else is a landmark
      // that disagrees with the words above it. The main role itself stays —
      // role="region" here would trade a named main landmark for a generic one.
      const eyebrow = source.match(/<p class="page-eyebrow">([^<]+)<\/p>/)?.[1] ?? "";
      assert.ok(eyebrow.length > 0, `${page} has no eyebrow to name it after`);
      assert.ok(
        main.includes(`aria-label="${eyebrow}"`),
        `${page}: <main> is named ${main} rather than its own "${eyebrow}"`,
      );
      assert.doesNotMatch(main, /role=/, page);
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
    // The app footer's own measure and symmetrical padding, read from the
    // component rather than restated: max-w-7xl is 80rem, py-[18px] is the 18px.
    const appFooter = readFileSync("src/components/AppFooter.tsx", "utf8");
    assert.match(appFooter, /\bmax-w-7xl\b/);
    assert.match(appFooter, /\bpy-\[18px\]/);
    assert.match(row, /max-width: 80rem;/);
  });

  // I2 (wave-8 review): the horizontal half of "the same footer composition" was
  // never read from anywhere. AppFooter insets its row 16/32px and .footer-row
  // insets 20px, so the colophon and the link row shifted 12px the moment a
  // reader crossed from the app to /legal/terms.html — measured at 1280 and 1440.
  // The comment above claimed the padding was "read from the component rather
  // than restated" while the number sat hardcoded beside it, which is why nothing
  // failed. Now both halves are read, and one custom property is what the static
  // pages inset every row from.
  it("insets that row from one padding source, and it is the app's own (I2)", () => {
    const appFooter = readFileSync("src/components/AppFooter.tsx", "utf8");
    const appRow = appFooter.match(/<div className="([^"]*py-\[18px\][^"]*)">/)?.[1] ?? "";
    assert.ok(appRow.length > 0, "expected AppFooter's own row class list");
    // Tailwind's spacing step is 0.25rem, so px-4 is 16px and sm:px-8 is 32px.
    const narrow = Number(appRow.match(/(?:^|\s)px-(\d+)(?:\s|$)/)?.[1]) * 4;
    const wide = Number(appRow.match(/\bsm:px-(\d+)\b/)?.[1]) * 4;
    assert.equal(narrow, 16);
    assert.equal(wide, 32);
    // And sm: is the kit's own breakpoint token, not a number guessed here.
    const sm = Number(
      readFileSync("src/styles/index.css", "utf8").match(/--breakpoint-sm: (\d+)px;/)?.[1],
    );
    assert.equal(sm, 640);

    assert.match(CSS, new RegExp(`:root \\{\\n  --page-inset: ${narrow}px;\\n\\}`));
    assert.match(
      CSS,
      new RegExp(
        `@media \\(min-width: ${sm / 16}rem\\) \\{\\n  :root \\{\\n    --page-inset: ${wide}px;\\n  \\}\\n\\}`,
      ),
    );
    // Every row of the static frame reads it — the footer row and the region
    // above it. A footer inset 32px above a reading column inset 20px would be
    // two systems on one page.
    assert.match(rule(".footer-row"), /padding: 18px var\(--page-inset\);/);
    assert.match(rule("main"), /padding: 48px var\(--page-inset\);/);
    // Nothing insets itself with the old number any more.
    assert.doesNotMatch(CSS, /padding: (?:18|48)px 20px;/);
  });

  it("gives every page that footer, with the links that work in its context", () => {
    for (const page of PAGES) {
      const source = readFileSync(page, "utf8");
      const footer = source.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? "";
      assert.ok(footer.length > 0, `${page} has no footer`);
      assert.match(footer, /<div class="footer-row">/, page);
      assert.match(
        footer,
        /<p class="colophon"><a [^>]*>A Windward Line production<\/a><\/p>/,
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
