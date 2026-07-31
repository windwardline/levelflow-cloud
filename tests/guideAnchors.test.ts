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
//
// Task 9: GuidePanel now renders
// docs/superpowers/specs/2026-07-30-levelflow-guide-content.md verbatim —
// ten numbered sections replacing the old hand-written copy. The six
// GuideAnchor ids below are deliberately UNCHANGED (every existing
// HowThisWorksLink call site — MarketScanPanel, AdvisorRecommendationPanel,
// SetupQualityReceipt — needed zero edits); only which deck section each id
// now decorates has moved. The second describe block below pins that
// remapping plus the four deck sections with no external anchor.
const GUIDE = "src/components/workspace/GuidePanel.tsx";
const NAV = "src/components/workspace/WorkspaceNav.tsx";
const ROOTS = ["src/components/workspace", "src/components/donations"];

const guideSource = readFileSync(GUIDE, "utf8");

// The source wraps long deck sentences across multiple JSX text lines for
// readability; a raw substring check would fail on the resulting
// newline+indentation runs. Collapsing every whitespace run to a single
// space on both sides (the same fix tests/historyPanel.test.tsx already
// applies to its own multi-line footer sentence) makes the comparison
// immune to how a given sentence happens to be line-wrapped in the source.
function collapsedIncludes(haystack: string, needle: string): boolean {
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
  return collapse(haystack).includes(collapse(needle));
}

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

describe("the Guide renders the deck verbatim (Task 9)", () => {
  // All ten deck sections carry an id (spec: "§1–§10 of the deck become the
  // Guide's sections") — six of them double as GuideAnchor values (pinned
  // above), the other four exist only for the in-page table of contents.
  const NON_ANCHOR_SECTION_IDS = [
    "the-setup",
    "following-your-trades",
    "market-hours",
    "vocabulary",
  ];

  for (const id of NON_ANCHOR_SECTION_IDS) {
    it(`carries a section with id ${id} (no external anchor links here)`, () => {
      assert.match(guideSource, new RegExp(`id="${id}"`));
    });
  }

  it("remaps the six anchor ids onto their new deck sections, not the old teaching content", () => {
    // Spot-checks that each anchor's *closest enclosing* GuideSection title
    // is the new deck section, not a leftover from the pre-Task-9 copy
    // (e.g. "targets-and-stops" used to open on "Targets and stops" —
    // it now opens on deck §3, "Taking and managing the trade").
    const sectionTitleAfter = (anchorId: string) => {
      const marker = `id="${anchorId}"`;
      const from = guideSource.indexOf(marker);
      assert.ok(from >= 0, `${anchorId} not found in source`);
      const titleMatch = guideSource.slice(from, from + 400).match(
        /title="([^"]+)"/,
      );
      assert.ok(titleMatch, `no title= found after ${marker}`);
      return titleMatch[1];
    };

    assert.equal(sectionTitleAfter("how-review-works"), "What Levelflow does");
    assert.equal(
      sectionTitleAfter("targets-and-stops"),
      "Taking and managing the trade",
    );
    assert.equal(sectionTitleAfter("confidence-tiers"), "Confidence");
    assert.equal(sectionTitleAfter("cost-ratings"), "Costs");
    assert.equal(sectionTitleAfter("replay-record"), "The record");
    assert.equal(sectionTitleAfter("timeframes"), "Timeframes");
  });

  it("renders §1's opening line verbatim", () => {
    assert.ok(
      collapsedIncludes(
        guideSource,
        `Levelflow reviews a market and gives you one answer: the
         strongest current setup, or nothing.`,
      ),
    );
  });

  it("renders §7's weak-record threshold verbatim, including the 55% figure", () => {
    assert.ok(
      collapsedIncludes(
        guideSource,
        `Below 55% money-positive, Levelflow treats a market's record
         as weak: scans stop offering it, and if you review it
         directly, the setup says so plainly.`,
      ),
    );
  });

  it("renders §9's exact reopen-label example verbatim, quotes included", () => {
    assert.ok(
      collapsedIncludes(
        guideSource,
        `The label on the row tells you exactly when it opens next —
         "OPENS 5:00P SUN" — in your own local time.`,
      ),
    );
  });

  it("keeps the deleted teaching asides gone — no TP1/runner parentheticals", () => {
    // The deck's own front matter: "the two old teaching asides that named
    // outside jargon ('TP1', 'the runner') are deliberately gone." Unlike
    // the pre-Task-9 file, GuidePanel is no longer named in languageGuard's
    // TAUGHT_IN_THE_GUIDE carve-out (see tests/languageGuard.test.ts) — this
    // pins the actual content reason that carve-out could shrink to empty.
    assert.doesNotMatch(guideSource, /\bTP1\b/);
    assert.doesNotMatch(guideSource, /\brunner\b/i);
  });

  it("renders §10 as a real definition list (dl/dt/dd), not styled divs", () => {
    assert.match(guideSource, /<dl\b/);
    assert.match(guideSource, /<dt\b/);
    assert.match(guideSource, /<dd\b/);
  });

  it("§10's definition list carries all six vocabulary terms spec §11 names", () => {
    for (
      const term of [
        "Bank half",
        "Move your stop to your entry",
        "Pending",
        "Payoff",
        "Money-positive",
        "R",
      ]
    ) {
      assert.ok(
        guideSource.includes(`term: "${term}",`),
        `vocabulary is missing "${term}"`,
      );
    }
  });

  it("renders the canonical two-target instruction as the §3 callout, verbatim", () => {
    const CANONICAL_LADDER_INSTRUCTION =
      "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — profit locked either way.";
    assert.ok(guideSource.includes(CANONICAL_LADDER_INSTRUCTION));
    // It has to actually be the accent callout, not merely present
    // somewhere on the page — pin it inside a <blockquote>.
    assert.match(
      guideSource,
      /<blockquote[^>]*>\s*\{CANONICAL_LADDER_INSTRUCTION\}\s*<\/blockquote>/,
    );
  });
});
