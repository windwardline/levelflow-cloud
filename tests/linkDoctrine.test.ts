import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DONATION_REQUEST_MAILTO, SUPPORT_MAILTO } from "../src/lib/support";

// Spec §17o (owner ruling, 2026-08-02): "I like your recommended 3 tier approach
// for links. Get it done. Test thoroughly for all views and links and pages and
// states." The law in one line is the section's own: a new tab means you left
// Levelflow.
//
// This file owns tier 3 — which links may spawn a tab — plus the two folds the
// wave carries with it. Tier 1's history semantics are
// tests/surfaceHistory.test.ts; tier 2's in-frame documents and their no-drift
// property are tests/legalDocuments.test.ts.
//
// Directory-derived, never a list of the files that spawn a tab today: an
// allowlist is only an allowlist if it can see the file added next week (the
// shape tests/donateComposition.test.ts uses for the same reason, and
// tests/languageGuard.test.ts before it).
function filesUnder(root: string, ...extensions: string[]): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .map((file) => join(root, file));
}

const SOURCES = [
  ...filesUnder("src", ".ts", ".tsx"),
  ...filesUnder("public", ".html"),
];

// A JSX attribute and an HTML attribute, since the sweep reads both trees.
const NEW_TAB = /target=(?:"|\{")_blank/g;
const REL = /rel=(?:"|\{")noopener noreferrer/g;

function occurrences(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length;
}

describe("§17o tier 3 — a new tab is for leaving, and this is the whole list", () => {
  // Every link that spawns a tab, and its count, in one table. Both directions:
  // these may, and — because the table is compared for equality against a sweep
  // of every source file — nothing else can.
  const ALLOWED: Record<string, number> = {
    // The colophon, twice: the ≥lg footer on every framed page, and the mobile
    // Profile's own copy. §17k rules both, and §17o leaves that ruling standing —
    // windwardline.com is another house, so following it IS leaving.
    "src/components/AppFooter.tsx": 1,
    "src/components/workspace/ProfilePanel.tsx": 1,
    // The donation providers. Stripe, Venmo, Cash App and PayPal are not ours.
    "src/components/donations/DonationOptions.tsx": 1,
    // The same colophon on each static page.
    "public/404.html": 1,
    "public/construction.html": 1,
    "public/legal/privacy.html": 1,
    "public/legal/risk-disclaimer.html": 1,
    "public/legal/terms.html": 1,
  };

  it("spawns a tab in exactly these places", () => {
    const found: Record<string, number> = {};
    for (const file of SOURCES) {
      const count = occurrences(readFileSync(file, "utf8"), NEW_TAB);
      if (count > 0) {
        found[file] = count;
      }
    }
    assert.deepEqual(found, ALLOWED);
  });

  it("names the two the doctrine took the new tab away from", () => {
    // The headline of tier 2, stated where a failure points at the ruling rather
    // than at a table diff: the legal trio in the ≥lg footer, and the same trio in
    // the mobile account menu. Both used to open a document in a new tab; both
    // now present it in the frame (authed) or navigate in place (signed out).
    assert.doesNotMatch(readFileSync("src/components/legal/LegalLinks.tsx", "utf8"), /_blank/);
    assert.doesNotMatch(readFileSync("src/App.tsx", "utf8"), /_blank/);
  });

  it("pairs every new tab with rel noopener noreferrer, and never the rel alone", () => {
    // Finding 2 of the inventory: this was already right everywhere, so the sweep
    // pins it rather than fixes it. Equality both ways — a rel on a link that
    // opens in place is a rel doing nothing, which is how the next reader learns
    // the wrong rule from the code.
    for (const file of SOURCES) {
      const source = readFileSync(file, "utf8");
      assert.equal(
        occurrences(source, REL),
        occurrences(source, NEW_TAB),
        `${file}: rel="noopener noreferrer" and target="_blank" must appear together`,
      );
    }
  });
});

describe("§17o — one definition of every mailto the product sends", () => {
  it("keeps the address and its subject in one module, app-wide", () => {
    // The static pages cannot import it, and tests/appFrame.test.ts already holds
    // all five of them to SUPPORT_MAILTO's exact value — which is the honest
    // static-file form of single-sourcing and needed no change here. What was NOT
    // covered is the app side growing a second spelling.
    for (const file of filesUnder("src", ".ts", ".tsx")) {
      if (file === join("src", "lib", "support.ts")) {
        continue;
      }
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /mailto:/,
        `${file}: build mailto links from src/lib/support.ts`,
      );
    }
  });

  it("has one donation-request mailto, not one per surface", () => {
    // It was built twice, byte-identical, from two different sources for the same
    // address: DonatePanel from a prop, AuthScreen from the constant. Same defect
    // src/lib/support.ts's own header describes — "a subject-line change would
    // have missed a surface, and nothing would have failed".
    assert.match(DONATION_REQUEST_MAILTO, /^mailto:help@windwardline\.com\?subject=/);
    assert.match(DONATION_REQUEST_MAILTO, /Development%20support/);
    assert.match(SUPPORT_MAILTO, /^mailto:help@windwardline\.com\?subject=/);
    for (const file of [
      "src/components/donations/DonatePanel.tsx",
      "src/components/auth/AuthScreen.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.match(source, /DONATION_REQUEST_MAILTO/, file);
      assert.doesNotMatch(source, /Development support/, file);
    }
    // And the prop that existed only to build it is gone, the way Guide's own
    // supportEmail prop went (tests/mobileNav.test.ts:276).
    assert.doesNotMatch(
      readFileSync("src/App.tsx", "utf8"),
      /<DonatePanel[^/]*supportEmail/,
    );
  });
});

describe("§17o — a document's footer says which document you are in", () => {
  const DOCUMENTS = ["privacy", "risk-disclaimer", "terms"];

  it("marks the self-link as the current page, and only the self-link", () => {
    // The inventory's finding 3, adjudicated: the row keeps all three documents
    // (§17c makes it identical on every page) and marks the one you are reading.
    // Dropping the self-link instead would make it three different rows.
    for (const document of DOCUMENTS) {
      const source = readFileSync(`public/legal/${document}.html`, "utf8");
      const nav = source.match(/<nav class="legal-links"[\s\S]*?<\/nav>/)?.[0] ?? "";
      assert.ok(nav.length > 0, `${document}: expected the legal link row`);
      for (const other of DOCUMENTS) {
        const link = nav.match(
          new RegExp(`<a[^>]*href="/legal/${other}\\.html"[^>]*>`),
        )?.[0] ?? "";
        assert.ok(link.length > 0, `${document}: no link to ${other}`);
        assert.equal(
          /aria-current="page"/.test(link),
          other === document,
          `${document}: ${other} link's aria-current is wrong: ${link}`,
        );
      }
    }
  });

  it("marks nothing on the pages that are not one of the documents", () => {
    for (const page of ["public/404.html", "public/construction.html"]) {
      assert.doesNotMatch(readFileSync(page, "utf8"), /aria-current/, page);
    }
  });
});
