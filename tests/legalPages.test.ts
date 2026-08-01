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
    it(`${file} requests exactly one icon, and it resolves`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /windward-capital-mark-tight/);
      const links = source.match(/<link rel="icon"[^>]*>/g) ?? [];
      assert.equal(links.length, 1, `${file} should link one icon`);
      const href = links[0].match(/href="([^"]+)"/)?.[1] ?? "";
      assert.ok(href.startsWith("/"), `${file}: ${href} must be root-absolute`);
      // Root-absolute hrefs resolve against public/ in development and against
      // the built dist root in production, which is the same file either way —
      // and they resolve identically from /404.html and /legal/terms.html, which
      // the old relative "../brand/…" did not.
      assert.ok(
        existsSync(`public${href}`),
        `${file} requests ${href}, which is not in public/`,
      );
    });
  }

  it("leaves no page standing in the borrowed house mark", () => {
    // The Windward Line mark still ships as the house's own asset, but nothing in
    // this product draws it any more: it was nobody's favicon after §17h, and §17i
    // retired its last use — the small mark beside the auth screen's colophon —
    // when that screen took the shared framed footer, which names the house in the
    // line itself and puts Levelflow's own mark at the top of the page.
    assert.ok(existsSync("public/brand/windward-line-mark.svg"));
    assert.equal(existsSync("src/lib/assets.ts"), false);
    for (const file of STATIC_PAGES) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /windward-line-mark/, file);
    }
  });
});
