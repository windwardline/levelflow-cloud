import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Spec §17c (owner live-QA, binding): "Footer, one standard everywhere — a
// single footer component, identical composition, dimensions, and spacing on
// every scrolling page and view, always at the true bottom of the viewport when
// content is short (flex column, footer pinned via mt-auto) and after content
// when long. Carries the §17 link row (legal trio + Help + Donate) and the
// colophon. The Desk's fixed desktop shell stays footer-less."
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
    assert.match(footer, /<footer\s*\n?\s*className=/);
    // Both branches of the presence gate carry the identical frame; the only
    // difference between them is the ≥lg Desk exception.
    const branches = footer.match(
      /className=\{hiddenOnDesktopDesk\n\s*\? "([^"]*)"\n\s*: "([^"]*)"\}/,
    );
    assert.ok(branches, "expected the footer's two literal class branches");
    const [, deskBranch, everywhereElse] = branches;
    assert.equal(everywhereElse, "mt-auto w-full border-t border-hairline");
    assert.equal(deskBranch, `${everywhereElse} lg:hidden`);
    // One inner frame, shared by both branches, so dimensions and spacing
    // cannot vary by surface.
    assert.match(
      footer,
      /<div className="mx-auto flex w-full max-w-7xl flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-4 pt-\[18px\] pb-24 sm:px-8 lg:pb-\[18px\]">/,
    );
    assert.match(
      footer,
      /<p className="colophon py-0">A Windward Line production<\/p>/,
    );
  });

  it("pins itself to the true viewport bottom — mt-auto lives in the footer, not in each caller", () => {
    assert.match(footer, /"mt-auto w-full border-t border-hairline/);
    // App.tsx's own half of the contract: a min-height flex column is what
    // gives mt-auto something to push against. Read from the shell helper that
    // now owns the three page shapes — every branch that renders a footer is a
    // min-height flex column, and the one branch that is a fixed viewport
    // (spec §17e's merged mobile Scan surface) renders none, which is the next
    // test's subject.
    const shell = app.match(
      /function mainShellClassName\([\s\S]*?\n}\n/,
    )?.[0] ?? "";
    assert.ok(shell.length > 0, "expected to find mainShellClassName");
    const branches = shell.match(/return[\s\S]*?"([^"]*bg-paper text-ink[^"]*)"/g) ??
      [];
    assert.ok(branches.length >= 2, "expected the shell's literal branches");
    for (const branch of shell.match(/"[^"]*bg-paper text-ink[^"]*"/g) ?? []) {
      const isFixedViewport = branch.includes("h-[100dvh]");
      assert.equal(
        /flex min-h-screen flex-col/.test(branch),
        !isFixedViewport,
        `shell branch ${branch}`,
      );
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

  it("keeps the fixed mobile tab bar's clearance, and closes it back at ≥lg", () => {
    // F4 (fix wave 2B) in its new home: below lg the MobileTabBar is fixed to
    // the viewport bottom, so the footer needs the same pb-24 reserve the
    // scrolling content wrapper carries. Literal tokens, never a variant
    // prefix assembled by interpolation (tests/tailwindVariantGuard.test.ts).
    assert.match(footer, /\bpb-24\b/);
    assert.match(footer, /\blg:pb-\[18px\]/);
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
      /<AppFooter\s+hiddenOnDesktopDesk=\{isDeskTab\}\s+onOpenDonate=\{\(\) => setActiveTab\("donate"\)\}\s+supportMailto=\{SUPPORT_MAILTO\}\s*\/>/,
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
  });

  // The coordinator's hard constraint for wave 6: §17g moves the mobile footer
  // and changes NOTHING at ≥lg. Both halves are one claim, so they are pinned as
  // one — the whole §17c composition still renders above lg, and nothing at all
  // renders below it.
  it("renders its full §17c composition at ≥lg and nothing below lg (§17g)", () => {
    // Above lg: the colophon and all five links, in the one component, with the
    // ≥lg Desk exception the ruling itself carved out.
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
