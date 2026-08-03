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

// Two since §17i: the pre-auth screens carry the shared footer in their frame
// now, so the line reaches them through AppFooter rather than through a bespoke
// footer of their own. What is left is the one component and the one <lg surface
// §17g keeps the line on.
const APP_SURFACES = [
  "src/components/AppFooter.tsx",
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
    // Since §17k the line is a link inside that element (pinned below); the
    // element that carries it is still the classed <p>.
    for (const page of STATIC_PAGES) {
      assert.match(
        readFileSync(page, "utf8"),
        /<p class="colophon"><a [^>]*>A Windward Line production<\/a><\/p>/,
        page,
      );
    }
    for (const file of APP_SURFACES) {
      assert.match(
        readFileSync(file, "utf8"),
        /<p className="colophon[^"]*">\s*<a\n[\s\S]*?>\s*A Windward Line production\s*<\/a>\s*<\/p>/,
        file,
      );
    }
    // One treatment, with no exception left. §2 allowed the house mark small
    // beside the line on the pre-auth front page, and that was the one surface
    // that differed; §17i gave that screen the shared footer instead, so the mark
    // beside the line retires with the bespoke footer that held it. The house is
    // still named — by the line itself, which is all §2 asks for — and §17i puts
    // Levelflow's own mark at the top of that screen, above the eyebrow.
    const auth = readFileSync("src/components/auth/AuthScreen.tsx", "utf8");
    assert.doesNotMatch(auth, /brandAssets/);
    assert.doesNotMatch(auth, /<footer/);
    assert.match(auth, /<AppFooter\n/);
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
    assert.match(
      footer,
      /<p className="colophon py-0">\s*<a\n[\s\S]*?>\s*A Windward Line production\s*<\/a>\s*<\/p>/,
    );
    // §17i: on every ≥lg surface, with no Desk exception left to branch on — so
    // the line rides one class string rather than one of two.
    assert.match(footer, /<footer className="w-full border-t border-hairline">/);
    assert.doesNotMatch(footer, /hiddenOnDesktopDesk/);
  });

  it("keeps it inside Profile's own <lg branch below lg, once, and never pins it to the frame", () => {
    const profile = readFileSync(
      "src/components/workspace/ProfilePanel.tsx",
      "utf8",
    );
    // The whole attribute, not the bare class: §17n tightened the line's own top
    // pad below lg ("colophon max-lg:pt-5"), and the 44px reach it must keep comes
    // from .colophon-link's ::after overlay, which no padding change can touch.
    assert.equal(
      (profile.match(/className="colophon(?: [^"]*)?"/g) ?? []).length,
      1,
    );
    // Inside the scroll region: §17g kept the line, not a footer.
    assert.match(
      profile,
      /data-testid="mobile-profile-scroll"[\s\S]*?className="colophon/,
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

// Spec §17k (owner-approved, 2026-08-01): "'A Windward Line production' is a link
// to https://windwardline.com — provenance you can follow, everywhere the
// colophon appears (the desktop footer on every framed page, the mobile Profile
// colophon, the four static pages), with ONE treatment: muted text exactly as at
// rest today, no underline until hover/focus, target="_blank" +
// rel="noopener noreferrer" so it never navigates the workspace away, 44px hit
// target per the kit floor. A guard pins the target URL, the new-tab behavior, and
// the at-rest quietness on every occurrence."
//
// Every occurrence: the two components above and all five colophon-bearing static
// pages (the ruling's "four" predates construction.html carrying the line; the
// clause that governs is "everywhere the colophon appears"). The set is derived
// from the same two lists the rest of this file sweeps, so a sixth colophon cannot
// arrive unlinked.
describe("§17k — the line links home, and stays quiet doing it", () => {
  const HOUSE = "https://windwardline.com";

  it("wraps every occurrence in the same link, to the same URL, in a new tab", () => {
    for (const page of STATIC_PAGES) {
      const source = readFileSync(page, "utf8");
      const link = source.match(
        /<p class="colophon">(<a [^>]*>)A Windward Line production<\/a><\/p>/,
      )?.[1] ?? "";
      assert.ok(link.length > 0, `${page}: the line is not a link`);
      assert.ok(link.includes(`href="${HOUSE}"`), `${page}: ${link}`);
      assert.ok(link.includes('target="_blank"'), `${page}: ${link}`);
      assert.ok(link.includes('rel="noopener noreferrer"'), `${page}: ${link}`);
      assert.ok(link.includes('class="colophon-link"'), `${page}: ${link}`);
    }
    for (const file of APP_SURFACES) {
      const source = readFileSync(file, "utf8");
      const link = source.match(
        /<a\n([\s\S]*?)>\s*A Windward Line production/,
      )?.[1] ?? "";
      assert.ok(link.length > 0, `${file}: the line is not a link`);
      assert.match(link, /className="colophon-link"/, file);
      assert.match(link, new RegExp(`href="${HOUSE}"`), file);
      assert.match(link, /target="_blank"/, file);
      assert.match(link, /rel="noopener noreferrer"/, file);
    }
    // One URL, and no second spelling of it anywhere the line renders.
    for (const file of [...tsxFiles("src"), ...STATIC_PAGES]) {
      const source = readFileSync(file, "utf8");
      const houses = source.match(/https?:\/\/(?:www\.)?windwardline\.com[^"']*/g) ?? [];
      for (const found of houses) {
        assert.equal(found, HOUSE, `${file} links the house as ${found}`);
      }
    }
  });

  it("is muted and unadorned at rest in both stylesheets, and underlines only on hover or focus", () => {
    for (
      const path of ["src/styles/index.css", "public/legal/legal.css"]
    ) {
      const sheet = readFileSync(path, "utf8");
      // Every rule this class appears in, split into the at-rest ones and the two
      // states §17k allows an underline in — read that way rather than as one
      // fixed block, because the static sheet has to state its colors against the
      // generic `a` rules and the app's does not.
      const rules = Array.from(
        sheet.matchAll(/([^{}]*\.colophon-link[^{}]*)\{([^}]*)\}/g),
        (match) => ({ body: match[2], selector: match[1] }),
      );
      assert.ok(rules.length > 0, `${path} styles no .colophon-link`);
      // Split on :focus-visible rather than on :hover: the static sheet states its
      // color for :visited and :hover in one grouped rule, and that rule is part of
      // how the line stays muted, not part of what hover adds.
      const atRest = rules.filter((rule) => !rule.selector.includes(":focus-visible"));
      const onHover = rules.filter((rule) => rule.selector.includes(":focus-visible"));
      const restText = atRest.map((rule) => rule.body).join("");
      // Muted exactly as the line reads: it takes the colophon's own color rather
      // than restating a token, and nothing is underlined yet.
      assert.match(restText, /color: inherit;/, path);
      assert.match(restText, /text-decoration-line: none;/, path);
      assert.doesNotMatch(restText, /text-decoration-line: underline;/, path);
      // The kit's 44px floor, reached by an overlay that costs the row no height:
      // .colophon is a flex row, so a flex item's own outer height is that row's
      // height — the min-height + negative-margin trick .tertiary-link uses
      // measured 53.3px against the footer's own 56.5px. 14px of reach above and
      // below the line's 16px inline box is 44px exactly on the static pages and
      // 47.5px in the app — measured with elementFromPoint, not assumed.
      assert.match(restText, /position: relative;/, path);
      const overlay = sheet.match(/\.colophon-link::after \{([^}]*)\}/)?.[1] ?? "";
      assert.ok(overlay.length > 0, `${path}: the 44px target has no overlay`);
      assert.match(overlay, /content: "";/, path);
      assert.match(overlay, /position: absolute;/, path);
      assert.match(overlay, /inset-block: -14px;/, path);
      assert.match(overlay, /inset-inline: 0;/, path);
      assert.doesNotMatch(restText, /min-height:/, path);
      // The underline exists, and only in those two states — both of them.
      assert.equal(onHover.length, 1, `${path}: expected one hover/focus rule`);
      assert.match(onHover[0].selector, /\.colophon-link:hover/, path);
      assert.match(onHover[0].body, /text-decoration-line: underline;/, path);
      assert.equal(
        rules.filter((rule) => rule.body.includes("text-decoration-line: underline;"))
          .length,
        1,
        `${path}: the underline may only come from the hover/focus rule`,
      );
    }
    // The static sheet's generic `a` rules are for prose and the back link, so the
    // colophon has to say it keeps its own color through :visited and :hover too —
    // without that it would go accent the first time a reader followed it.
    const legal = readFileSync("public/legal/legal.css", "utf8");
    assert.match(
      legal,
      /\.colophon-link,\n\.colophon-link:visited,\n\.colophon-link:hover \{\n  color: inherit;\n\}/,
    );
  });
});
