import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// The whole progressive-disclosure pattern rests on this contract: every
// HowThisWorksLink in the app names a GuideAnchor, and the Guide has to carry
// a section with that id or the button lands the user on an unrelated
// paragraph. This test reads sources the way designTokens/contrast/
// languageGuard do — the unit stack has no jsdom, so the scroll behavior
// itself is pinned by the authed e2e spec instead.
const GUIDE = "src/components/workspace/GuidePanel.tsx";
const NAV = "src/components/workspace/WorkspaceNav.tsx";
const ROOTS = ["src/components/workspace", "src/components/donations"];

const guideSource = readFileSync(GUIDE, "utf8");

function declaredAnchors(): string[] {
  const union = readFileSync(NAV, "utf8").match(
    /export type GuideAnchor =([\s\S]*?);/,
  );
  assert.ok(union, `${NAV} must declare the GuideAnchor union`);
  return Array.from(union[1].matchAll(/"([a-z-]+)"/g), (match) => match[1]);
}

function referencedAnchors(): Array<{ anchor: string; file: string }> {
  return ROOTS.flatMap((root) =>
    readdirSync(root)
      .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
      .map((file) => join(root, file))
      .flatMap((file) =>
        Array.from(
          readFileSync(file, "utf8").matchAll(/anchor[=:]\s*"([a-z-]+)"/g),
          (match) => ({ anchor: match[1], file }),
        )
      )
  );
}

describe("the Guide answers every How this works link", () => {
  const anchors = declaredAnchors();

  it("declares the six-anchor set the spec pins", () => {
    assert.deepEqual(anchors, [
      "how-review-works",
      "targets-and-stops",
      "confidence-tiers",
      "replay-record",
      "cost-ratings",
      "timeframes",
    ]);
  });

  for (const anchor of anchors) {
    it(`carries a section with id ${anchor}`, () => {
      assert.match(guideSource, new RegExp(`id="${anchor}"`));
    });
  }

  it("is the single h1 owner for its surface", () => {
    assert.equal(guideSource.match(/<h1[\s>]/g)?.length, 1);
  });

  it("has a section for every anchor the app links to", () => {
    for (const { anchor, file } of referencedAnchors()) {
      assert.ok(
        anchors.includes(anchor),
        `${file} links anchor "${anchor}", which is not a GuideAnchor`,
      );
    }
  });
});
