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
      /<p className="colophon py-0">A Windward Line production<\/p>/,
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
      /aria-label="Support"[\s\S]{0,400}href=\{supportMailto\}[\s\S]{0,80}Help[\s\S]{0,300}onClick=\{onOpenDonate\}[\s\S]{0,80}Donate[\s\S]{0,200}<LegalLinks align="left" \/>/,
    );
    // Both quiet, both the same furniture as the legal links beside them.
    assert.equal((footer.match(/className="tertiary-link"/g) ?? []).length, 2);
    // Support is its own group, not filed inside <nav aria-label="Legal">.
    assert.doesNotMatch(footer, /aria-label="Legal"/);
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

describe("AppFooter — one footer, everywhere, and nowhere twice (spec §17c)", () => {
  it("is the app's only <footer> outside the pre-auth screens", () => {
    function sourceFilesUnder(root: string): string[] {
      return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
          return sourceFilesUnder(path);
        }
        return entry.name.endsWith(".tsx") ? [path] : [];
      });
    }

    // AuthScreen and ParkingScreen are pre-auth surfaces with their own
    // approved composition and no tab shell to hang this component off (spec
    // §16 leaves them out of the mockups' scope); every authed surface goes
    // through AppFooter.
    const allowed = new Set([
      FOOTER,
      "src/components/auth/AuthScreen.tsx",
      "src/components/auth/ParkingScreen.tsx",
    ]);
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
      /<AppFooter\s+onOpenDonate=\{\(\) => setActiveTab\("donate"\)\}\s+supportMailto=\{SUPPORT_MAILTO\}\s*\/>/,
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
    assert.match(footer, /onClick=\{onOpenDonate\}/);
    assert.match(footer, /<LegalLinks align="left" \/>/);
    const legal = readFileSync("src/components/legal/LegalLinks.tsx", "utf8");
    assert.deepEqual(
      Array.from(legal.matchAll(/label: "([^"]+)"/g), (match) => match[1]),
      ["Risk disclaimer", "Privacy", "Terms"],
    );
    // Below lg: not hidden — absent. The component itself carries no max-lg:
    // treatment, because the decision is App.tsx's presence gate above.
    assert.doesNotMatch(footer, /max-lg:/);
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
    // rendered class rather than the word, since that file's comments name it.
    assert.equal((profile.match(/className="colophon"/g) ?? []).length, 1);
    assert.doesNotMatch(profile, /LegalLinks/);
    // App.tsx draws neither itself: the account menu's trio reads LegalLinks'
    // exported data, never renders the footer's own nav component.
    assert.doesNotMatch(app, /className="colophon/);
    assert.doesNotMatch(app, /<LegalLinks/);
  });
});
