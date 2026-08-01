import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Every colophon in the repo, in one place. The line itself is spec §2's ruling
// — "Windward Line appears as a quiet colophon line ('A Windward Line
// production') at the bottom of surfaces, never above the product" — and its
// placement is settled by §17c (one footer on every scrolling page and view; the
// Desk's fixed desktop shell footer-less) and §17g (below lg it exists inside the
// Profile view only, reduced to the line).
//
// Those claims were each pinned where they were made — appFooter.test.ts,
// mobileNav.test.ts, the public e2e — and the static pages' four colophons were
// pinned nowhere at all, which is how one of them came to carry a class that
// styled nothing. This is the sweep: nine occurrences, one wording, one class,
// nothing renders two.
const LINE = "A Windward Line production";

const APP_SURFACES = [
  "src/components/AppFooter.tsx",
  "src/components/auth/AuthScreen.tsx",
  "src/components/auth/ParkingScreen.tsx",
  "src/components/workspace/ProfilePanel.tsx",
];
const STATIC_PAGES = [
  "public/404.html",
  "public/construction.html",
  "public/legal/privacy.html",
  "public/legal/risk-disclaimer.html",
  "public/legal/terms.html",
];

function tsxFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

describe("one wording, one treatment, everywhere", () => {
  it("renders the line exactly once per surface that carries it, and on no other", () => {
    const carriers = new Set(APP_SURFACES);
    for (const file of tsxFiles("src")) {
      const occurrences = (readFileSync(file, "utf8").split(LINE).length) - 1;
      assert.equal(
        occurrences,
        carriers.has(file) ? 1 : 0,
        `${file} renders the colophon ${occurrences} time(s)`,
      );
    }
    for (const page of STATIC_PAGES) {
      assert.equal(
        readFileSync(page, "utf8").split(LINE).length - 1,
        1,
        `${page} renders the colophon once`,
      );
    }
  });

  it("gives every one of the nine the .colophon class, on the element that carries the line", () => {
    // The class on that element, not merely present in the file: a colophon
    // styled by an element selector (`footer p`, as four of the static pages
    // relied on) restyles itself the day someone adds a second paragraph beside
    // it. Exact shapes rather than a window, so "near the line" cannot pass for
    // "on it".
    for (const page of STATIC_PAGES) {
      assert.match(
        readFileSync(page, "utf8"),
        /<p class="colophon">A Windward Line production<\/p>/,
        page,
      );
    }
    for (const file of [
      "src/components/AppFooter.tsx",
      "src/components/auth/ParkingScreen.tsx",
      "src/components/workspace/ProfilePanel.tsx",
    ]) {
      assert.match(
        readFileSync(file, "utf8"),
        /<p className="colophon[^"]*">A Windward Line production<\/p>/,
        file,
      );
    }
    // The one that differs, and the only one permitted to: spec §2 allows the
    // house mark small beside the line ("never above the wordmark"), and the
    // pre-auth front page is where it sits. Still one .colophon element, still
    // the same words.
    assert.match(
      readFileSync("src/components/auth/AuthScreen.tsx", "utf8"),
      /<footer className="colophon">\s*<img src=\{brandAssets\.mark\}[^>]*\/>\s*<span>A Windward Line production<\/span>\s*<\/footer>/,
    );
  });

  it("defines that class in both stylesheets, so neither surface family inherits its treatment by accident", () => {
    assert.match(readFileSync("src/styles/index.css", "utf8"), /\n  \.colophon \{/);
    assert.match(readFileSync("public/legal/legal.css", "utf8"), /\n\.colophon \{/);
  });

  it("uses the production-house wording, never the retired product one", () => {
    // Spec §2's rename: the old UI led with "A WINDWARD LINE PRODUCT" above the
    // product name. Only the house mark's own SVG comment records that history.
    for (const file of [...tsxFiles("src"), ...STATIC_PAGES]) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /Windward Line product(?!ion)/i,
        `${file}: "A Windward Line product" is the retired pre-overhaul line`,
      );
    }
  });
});

describe("placement — §17c above lg, §17g below it", () => {
  it("puts it in the one shared footer at ≥lg and nowhere else in the shell", () => {
    // App.tsx renders no colophon of its own: the footer component owns it, which
    // is what makes "identical on every scrolling view" structural.
    assert.doesNotMatch(readFileSync("src/App.tsx", "utf8"), new RegExp(LINE));
    const footer = readFileSync("src/components/AppFooter.tsx", "utf8");
    // py-0 because .colophon's own 2rem top pad is for the standalone pre-auth
    // use; here the footer's padding is the spacing.
    assert.match(footer, /<p className="colophon py-0">A Windward Line production<\/p>/);
    assert.match(footer, /className=\{hiddenOnDesktopDesk[\s\S]{0,120}lg:hidden/);
  });

  it("keeps it inside Profile's own <lg branch below lg, once, and never pins it to the frame", () => {
    const profile = readFileSync(
      "src/components/workspace/ProfilePanel.tsx",
      "utf8",
    );
    assert.equal((profile.match(/className="colophon"/g) ?? []).length, 1);
    // Inside the scroll region: §17g kept the line, not a footer.
    assert.match(
      profile,
      /data-testid="mobile-profile-scroll"[\s\S]*?className="colophon"/,
    );
  });

  it("ends every static page's footer with it", () => {
    for (const page of STATIC_PAGES) {
      const source = readFileSync(page, "utf8");
      const footer = source.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "";
      assert.ok(footer.includes(LINE), `${page}: the line is outside <footer>`);
    }
  });
});
