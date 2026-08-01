import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

// This file began as fix wave 2B, FIX 1 (completeness-audit-2 Finding 4): all
// three legal pages requested `windward-capital-mark-tight.jpg`, a Windward
// Capital asset that has never existed in this repo, so every legal-page load
// 404'd its icon. That was stopped by pointing them at
// `public/brand/windward-line-mark.svg` — the only mark on disk at the time —
// with a note that the borrow was provisional, that Stage 4 owned the real set,
// and that public/404.html carried no icon link at all.
//
// Spec §17h closed both. Levelflow has its own mark now and the whole static
// family links it (tests/brandAssets.test.ts owns that claim and the mark's
// geometry). What remains here is the regression this file exists for: no static
// page may request an icon that is not on disk, whoever's mark it is.
const STATIC_PAGES = [
  "public/404.html",
  "public/construction.html",
  "public/legal/terms.html",
  "public/legal/privacy.html",
  "public/legal/risk-disclaimer.html",
];

describe("every static page requests an icon that exists on disk (F1, Finding 4)", () => {
  for (const file of STATIC_PAGES) {
    it(`${file} requests only icons that resolve`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /windward-capital-mark-tight/);
      // §17i replaced the single link with the full cross-browser set
      // (tests/brandAssets.test.ts pins its order and its two decisive
      // attributes). What this file has always owned is the regression it was
      // written for, and it now owns it for every href in the set rather than one:
      // a page must not request an icon that is not on disk, whoever's mark it is.
      const links = source.match(/<link rel="(?:icon|apple-touch-icon)"[^>]*>/g) ?? [];
      assert.equal(links.length, 6, `${file} should link the whole icon set`);
      for (const link of links) {
        const href = link.match(/href="([^"]+)"/)?.[1] ?? "";
        assert.ok(href.startsWith("/"), `${file}: ${href} must be root-absolute`);
        // Wave 9 item 7 versions the reference, not the file: the path still has
        // to resolve on disk, so the query is stripped before it is looked up
        // (tests/brandAssets.test.ts pins the version itself, on every head).
        const path = href.split("?")[0];
        // Root-absolute hrefs resolve against public/ in development and against
        // the built dist root in production, which is the same file either way —
        // and they resolve identically from /404.html and /legal/terms.html, which
        // the old relative "../brand/…" did not.
        assert.ok(
          existsSync(`public${path}`),
          `${file} requests ${href}, which is not in public/`,
        );
      }
      // The manifest is linked by the same set and names icons of its own, so it
      // has to resolve too — and so does everything it points at.
      const manifestHref = source.match(
        /<link rel="manifest" href="([^"]+)"/,
      )?.[1] ?? "";
      assert.ok(manifestHref.startsWith("/"), `${file}: ${manifestHref}`);
      const manifestPath = manifestHref.split("?")[0];
      assert.ok(existsSync(`public${manifestPath}`), `${file}: ${manifestHref}`);
      const manifest = JSON.parse(readFileSync(`public${manifestPath}`, "utf8"));
      for (const icon of manifest.icons as Array<{ src: string }>) {
        assert.ok(
          existsSync(`public${icon.src.split("?")[0]}`),
          `manifest icon ${icon.src}`,
        );
      }
    });
  }

  it("leaves no page standing in the borrowed house mark, and does not ship it", () => {
    // Nothing in this product draws the Windward Line mark any more: it was
    // nobody's favicon after §17h, and §17i retired its last use — the small mark
    // beside the auth screen's colophon — when that screen took the shared framed
    // footer, which names the house in the line itself and puts Levelflow's own
    // mark at the top of the page.
    //
    // So the file is gone, and this assertion is inverted rather than deleted: it
    // shipped to dist/brand/ and was publicly fetchable with zero consumers, which
    // is how a retired decision comes to read as the house mark's canonical home.
    // The house's mark belongs in the apex and portfolio repos. §17h's own mention
    // of the filename stays as history.
    assert.equal(existsSync("public/brand/windward-line-mark.svg"), false);
    assert.equal(existsSync("src/lib/assets.ts"), false);
    for (const file of STATIC_PAGES) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /windward-line-mark/, file);
    }
  });
});
