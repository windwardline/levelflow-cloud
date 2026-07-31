import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Fix wave 2B, FIX 1 (completeness-audit-2 Finding 4). All three legal pages
// requested a favicon that doesn't exist on disk — `windward-capital-mark-tight.jpg`
// is a Windward Capital asset, not Levelflow/Windward Line, and `public/brand/`
// has never contained it (only `windward-line-mark.svg`, the same mark
// src/lib/assets.ts already points the app's own chrome at). Every legal-page
// load 404'd its icon request. This is a stop-the-404 fix only — Stage 4 owns
// the real favicon set (public/404.html deliberately carries no favicon link
// at all yet, a separate, already-tracked gap; not touched here).
const LEGAL_FILES = [
  "public/legal/terms.html",
  "public/legal/privacy.html",
  "public/legal/risk-disclaimer.html",
];

describe("legal pages reference a favicon that actually exists (F1, Finding 4)", () => {
  for (const file of LEGAL_FILES) {
    it(`${file} no longer points its icon at the deleted windward-capital-mark-tight.jpg`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /windward-capital-mark-tight/);
    });

    it(`${file} points its icon at the real, existing Windward Line mark with a matching type`, () => {
      const source = readFileSync(file, "utf8");
      assert.match(
        source,
        /<link rel="icon" href="\.\.\/brand\/windward-line-mark\.svg" type="image\/svg\+xml" \/>/,
      );
    });
  }

  it("the referenced asset actually exists on disk (the whole point of the fix)", () => {
    assert.ok(
      existsSync("public/brand/windward-line-mark.svg"),
      "public/brand/windward-line-mark.svg must exist for the legal pages' favicon link to resolve",
    );
  });
});
