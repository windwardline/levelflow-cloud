import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Spec §17c (owner live-QA, binding): "Footer, one standard everywhere — a
// single footer component, identical composition, dimensions, and spacing on
// every scrolling page and view … Carries the §17 link row (legal trio + Help +
// Donate) and the colophon."
//
// Spec §17i settles the two clauses §17c left conditional. "Every scrolling page
// and view" is now every view, full stop — the Desk's footer-less exception is
// retired — and "at the true bottom of the viewport" is no longer something the
// footer arranges with mt-auto inside a min-height column: it is the last row of
// App.tsx's fixed frame, so it is at the bottom of the viewport by construction.
// tests/appFrame.test.ts owns the frame; this file owns what the footer is.
//
// Source-pinned, no jsdom (see tests/currentTradesRail.test.tsx's header for
// the established technique). These guards are deliberately structural rather
// than string-matching: what the ruling asks for is that there be exactly ONE
// footer in the app, so most of the work here is counting.
const FOOTER = "src/components/AppFooter.tsx";
const APP = "src/App.tsx";

const footer = readFileSync(FOOTER, "utf8");
const app = readFileSync(APP, "utf8");

describe("AppFooter — the one footer's composition (p-profile-v2.html:96-99)", () => {
  it("draws the mock's frame: hairline rule on top, colophon left, link row right, one baseline", () => {
    // One literal class string, no branches at all: §17i retired the ≥lg Desk
    // exception, which was the only thing the footer's composition ever varied by.
    assert.match(footer, /<footer className="w-full border-t border-hairline">/);
    assert.equal((footer.match(/<footer/g) ?? []).length, 1);
    assert.match(
      footer,
      /<div className="mx-auto flex w-full max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-4 py-\[18px\] sm:px-8">/,
    );
    assert.match(
      footer,
      // The line is a link since §17k (tests/colophon.test.ts owns its target and
      // its treatment); the element that carries it is unchanged.
      /<p className="colophon py-0">\s*<a\n[\s\S]*?>\s*A Windward Line production/,
    );
    // The retired prop is gone from both sides of the call, not merely unused.
    assert.doesNotMatch(footer, /hiddenOnDesktopDesk/);
    assert.doesNotMatch(app, /hiddenOnDesktopDesk/);
    assert.doesNotMatch(footer, /lg:hidden/);
  });

  it("no longer pins itself — the frame's last row is what puts it at the viewport bottom (§17i)", () => {
    // mt-auto needed a min-height flex column to push against. There is no such
    // column left: both shell branches are fixed frames, and the footer is a grid
    // row of the ≥lg one. A surviving mt-auto here would be a dead utility
    // claiming to do the thing the frame actually does.
    assert.doesNotMatch(footer, /mt-auto/);
    const shell = app.match(
      /function mainShellClassName\([\s\S]*?\n}\n/,
    )?.[0] ?? "";
    assert.ok(shell.length > 0, "expected to find mainShellClassName");
    const branches = shell.match(/"[^"]*bg-paper text-ink[^"]*"/g) ?? [];
    assert.equal(branches.length, 2, "expected the shell's two literal branches");
    for (const branch of branches) {
      assert.doesNotMatch(branch, /min-h-screen/, `shell branch ${branch}`);
      assert.match(branch, /h-\[100dvh\]/, `shell branch ${branch}`);
      assert.match(branch, /overflow-hidden/, `shell branch ${branch}`);
    }
  });

  it("carries the §17 link row: Help and Donate before the legal trio, in the mock's order", () => {
    assert.match(
      footer,
      /aria-label="Support"[\s\S]{0,400}href=\{supportMailto\}[\s\S]{0,80}Help[\s\S]{0,900}Donate[\s\S]{0,300}<LegalLinks \/>/,
    );
    // Three tertiary links for two controls: Help, and Donate in each of its two
    // element forms (§17i's satellite pages need a link where the app needs a
    // button). Both forms carry the identical class, which is what keeps the row's
    // look the same on every surface.
    assert.equal((footer.match(/className="tertiary-link"/g) ?? []).length, 3);
    const donateForms = footer.match(/className="tertiary-link"[\s\S]{0,200}?Donate/g) ??
      [];
    assert.equal(donateForms.length, 2);
    // Support is its own group, not filed inside <nav aria-label="Legal">.
    assert.doesNotMatch(footer, /aria-label="Legal"/);
  });

  // Spec §17i: "Satellite pages carry the same footer composition with links that
  // work in their context (static pages link Donate to the app root; Help stays
  // the mailto)." The target is the only thing that varies, and it varies by
  // ELEMENT — a link where a link is right, a button where the click reveals or
  // switches something — so the prop is a discriminated union rather than two
  // optional callbacks that could both be set or neither.
  it("takes Donate's target as a union, and lets it decide the element only", () => {
    assert.match(
      footer,
      /export type FooterDonate =\s*\|\s*\{ href: string \}\s*\|\s*\{ expanded\?: boolean; onSelect: \(\) => void \};/,
    );
    assert.match(footer, /\{"href" in donate/);
    assert.match(footer, /href=\{donate\.href\}/);
    assert.match(footer, /onClick=\{donate\.onSelect\}/);
    // aria-expanded rides the union member that can actually be a disclosure, and
    // is undefined (so absent from the DOM) for the app's own tab switch.
    assert.match(footer, /aria-expanded=\{donate\.expanded\}/);
    // Every caller, and which target each one gives: the app switches tabs, the
    // login screen reveals its own donation block, parking links to the app root.
    assert.match(app, /donate=\{\{ onSelect: \(\) => setActiveTab\("donate"\) \}\}/);
    assert.match(
      readFileSync("src/components/auth/ParkingScreen.tsx", "utf8"),
      /<AppFooter donate=\{\{ href: "\/\?donate" \}\} supportMailto=\{SUPPORT_MAILTO\} \/>/,
    );
    assert.match(
      readFileSync("src/components/auth/AuthScreen.tsx", "utf8"),
      /donate=\{\{\s*expanded: donationsOpen,\s*onSelect: \(\) => setDonationsOpen\(\(value\) => !value\),\s*\}\}/,
    );
  });

  it("drops the fixed tab bar's clearance — the footer never shares a viewport with the bar (§17g)", () => {
    // F4 (fix wave 2B) reserved pb-24 here because the MobileTabBar was fixed to
    // the viewport bottom underneath this row. §17g made the footer a ≥lg element
    // (App.tsx's presence gate) and the bar is lg:hidden, so the two can no longer
    // occupy one viewport and the reserve was padding for nothing. The row is the
    // mock's symmetrical 18px again — one padding utility, no breakpoint chain.
    assert.doesNotMatch(footer, /\bpb-24\b/);
    assert.doesNotMatch(footer, /\blg:pb-/);
    assert.match(footer, /\bpy-\[18px\]/);
    assert.doesNotMatch(footer, /lg:\$\{/);
  });
});

// M7 (wave-8 review): the mailto the footer takes was the same literal in three
// files, and the third had drifted into a different shape — inlining the address
// instead of building it from the const the other two used. The subject line is a
// mail rule on the other end of a shared inbox, so a change to it that reached two
// surfaces out of three would be a rule that silently stops working.
describe("the support inbox is one export (M7)", () => {
  function sourceFilesUnder(root: string): string[] {
    return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return sourceFilesUnder(path);
      }
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  const MODULE = "src/lib/support.ts";

  it("names the address and builds the mailto in exactly one place", () => {
    const module = readFileSync(MODULE, "utf8");
    assert.match(module, /export const SUPPORT_EMAIL = "help@windwardline\.com";/);
    assert.match(module, /export const SUPPORT_MAILTO = `mailto:\$\{SUPPORT_EMAIL\}\?subject=/);
    assert.match(module, /encodeURIComponent\("\[Levelflow\] Help"\)/);
    for (const file of sourceFilesUnder("src")) {
      if (file === MODULE) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /help@windwardline\.com/,
        `${file} spells the support address out instead of importing it`,
      );
      // And any surface that uses either name imports it rather than declaring
      // its own — a local const of the same name would read as the shared one.
      for (const name of ["SUPPORT_EMAIL", "SUPPORT_MAILTO"]) {
        if (!source.includes(name)) {
          continue;
        }
        assert.doesNotMatch(
          source,
          new RegExp(`const ${name} =`),
          `${file} declares its own ${name}`,
        );
        assert.match(
          source,
          new RegExp(`import \\{[^}]*${name}[^}]*\\} from "[^"]*lib/support";`),
          `${file} uses ${name} without importing it`,
        );
      }
    }
  });

  it("hands that one value to all three footers", () => {
    // The two React satellites and the app itself — the whole set of surfaces that
    // mount AppFooter (tests/appFrame.test.ts reads the static pages' own Help href
    // against the same export, since no build step reaches those).
    for (
      const file of [
        APP,
        "src/components/auth/AuthScreen.tsx",
        "src/components/auth/ParkingScreen.tsx",
      ]
    ) {
      assert.match(
        readFileSync(file, "utf8"),
        /supportMailto=\{SUPPORT_MAILTO\}/,
        file,
      );
    }
  });
});

describe("AppFooter — one footer, everywhere, and nowhere twice (spec §17c)", () => {
  it("is the app's only <footer>, the pre-auth screens included since §17i", () => {
    function sourceFilesUnder(root: string): string[] {
      return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
          return sourceFilesUnder(path);
        }
        return entry.name.endsWith(".tsx") ? [path] : [];
      });
    }

    // One file, with no exceptions left. AuthScreen and ParkingScreen used to draw
    // footers of their own — pre-auth surfaces §16 puts outside the mockups' scope
    // — and §17i's "every single page" retired that: both take this component in
    // their frame's bottom row now, so there is exactly one <footer> in src/.
    const allowed = new Set([FOOTER]);
    for (const file of sourceFilesUnder("src")) {
      if (allowed.has(file)) {
        continue;
      }
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /<footer/,
        `${file} must render the shared AppFooter, not a footer of its own`,
      );
    }
  });

  it("is mounted once in App.tsx, outside every tab branch, so no surface can miss it", () => {
    assert.equal((app.match(/<AppFooter/g) ?? []).length, 1);
    assert.match(
      app,
      /<AppFooter\s+donate=\{\{ onSelect: \(\) => setActiveTab\("donate"\) \}\}\s+supportMailto=\{SUPPORT_MAILTO\}\s*\/>/,
    );
    // Spec §17g narrows §17c's "every scrolling page and view" to ≥lg: below lg
    // no view scrolls as a page at all, so the footer is a ≥lg component and
    // leaves the tree outright rather than going invisible inside a fixed frame.
    // Pinned as the exact gate rather than "some condition", and the old
    // `activeTab !== "profile"` skip is still gone.
    assert.match(app, /\{isMobileViewport \? null : \(\s*<AppFooter/);
    assert.doesNotMatch(app, /activeTab !== "profile"/);
    // §17e's Desk-only gate is retired with it — one condition, not two.
    assert.doesNotMatch(app, /isFixedMobileDesk/);
    // And §17i's own retirement: the ≥lg Desk no longer opts out either, so the
    // mount is gated on the viewport and on nothing else.
    assert.doesNotMatch(app, /isDeskTab\}\s*\n?\s*onOpenDonate/);
  });

  // The coordinator's hard constraint for wave 6: §17g moves the mobile footer
  // and changes NOTHING at ≥lg. Both halves are one claim, so they are pinned as
  // one — the whole §17c composition still renders above lg, and nothing at all
  // renders below it.
  it("renders its full §17c composition at ≥lg and nothing below lg (§17g)", () => {
    // Above lg: the colophon and all five links, in the one component, on every
    // surface — §17i took away the ≥lg Desk exception §17c had carved out.
    assert.match(footer, /A Windward Line production/);
    assert.match(footer, /href=\{supportMailto\}/);
    assert.match(footer, /onClick=\{donate\.onSelect\}/);
    assert.match(footer, /<LegalLinks \/>/);
    const legal = readFileSync("src/components/legal/LegalLinks.tsx", "utf8");
    assert.deepEqual(
      Array.from(legal.matchAll(/label: "([^"]+)"/g), (match) => match[1]),
      ["Risk disclaimer", "Privacy", "Terms"],
    );
    // Below lg: not hidden — absent. The component itself carries no max-lg:
    // treatment, because the decision is App.tsx's presence gate above.
    assert.doesNotMatch(footer, /max-lg:/);
  });

  // Q1-I6: the footer's own link row honoured the kit's 44px floor three times
  // and broke it three times. Help and Donate are .tertiary-link, which is 44px
  // by construction; the legal trio beside them was a bare `text-xs` inline box
  // — a ~16px tall target, on the same row, in the same footer. §17g ("44px
  // targets still bind") and §17k ("44px per the kit floor") both apply to it.
  //
  // The floor arrives the way .colophon-link's already does, and for the same
  // measured reason: this trio sits in a flex row, where a flex item's outer
  // height IS the row height, so .tertiary-link's min-height-plus-negative-margin
  // would move the footer's geometry. An absolutely positioned ::after is outside
  // layout entirely — reach without a pixel of drift.
  it("gives the legal trio the same 44px floor its row-mates already have", () => {
    const legal = readFileSync("src/components/legal/LegalLinks.tsx", "utf8");
    assert.match(legal, /className="legal-link transition hover:text-ink"/);
    const css = readFileSync("src/styles/index.css", "utf8");
    assert.match(
      css,
      /\.legal-link \{\s*position: relative;\s*\}/,
    );
    assert.match(
      css,
      /\.legal-link::after \{[\s\S]{0,200}inset-block: -14px;/,
    );
    // The static twin carries the same floor, for the reason .colophon itself is
    // named in both sheets: one footer, two implementations, no drift. Its
    // support row is the same 12px inline box, so it takes the overlay too —
    // fixing one row of that footer and not the other would only move Q1-I6's
    // half-honoured floor onto the legal pages.
    const staticCss = readFileSync("public/legal/legal.css", "utf8");
    assert.match(
      staticCss,
      /\.legal-links a::after,\s*\n\.support-links a::after \{[\s\S]{0,200}inset-block: -14px;/,
    );
    for (const selector of [".legal-links a", ".support-links a"]) {
      const rule = staticCss.match(
        new RegExp(`\\${selector.replace(" ", " ")} \\{[^}]*\\}`),
      )?.[0] ?? "";
      assert.match(rule, /position: relative;/, `${selector} needs a containing block`);
    }
  });

  it("leaves no second colophon or legal row on any authed surface", () => {
    const profile = readFileSync(
      "src/components/workspace/ProfilePanel.tsx",
      "utf8",
    );
    // §17g: "The footer exists on mobile ONLY inside the Profile view, reduced
    // to the colophon." That is one colophon, in Profile's <lg branch only
    // (tests/mobileNav.test.ts pins which branch and where in it), and still no
    // legal row anywhere but the footer and the account menu. Counted by the
    // rendered class rather than the word, since that file's comments name it —
    // and by the whole attribute, since §17n rides a top-pad utility on the same
    // string ("colophon max-lg:pt-5"). What this counts is that there is exactly
    // ONE colophon here, whatever utilities travel with it.
    assert.equal((profile.match(/className="colophon(?: [^"]*)?"/g) ?? []).length, 1);
    assert.doesNotMatch(profile, /LegalLinks/);
    // App.tsx draws neither itself: the account menu's trio reads LegalLinks'
    // exported data, never renders the footer's own nav component.
    assert.doesNotMatch(app, /className="colophon/);
    assert.doesNotMatch(app, /<LegalLinks/);
  });
});
