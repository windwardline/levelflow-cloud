import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CHART_TIMEFRAME_OPTIONS } from "../src/lib/marketData";

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
const GUIDE_DECK =
  "docs/superpowers/specs/2026-07-30-levelflow-guide-content.md";
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
    // Spot-checks that each anchor's section title is the new deck section, not
    // a leftover from the pre-Task-9 copy (e.g. "targets-and-stops" used to
    // open on "Targets and stops" — it now opens on deck §3, "Taking and
    // managing the trade").
    //
    // Read from GUIDE_SECTIONS, which since the M1 fix is where the title lives
    // for both the index and the article: <GuideSection> names only its id now,
    // so the title no longer exists at the call site to read from there.
    const sectionTitleAfter = (anchorId: string) => {
      const marker = `"${anchorId}": {`;
      const from = guideSource.indexOf(marker);
      assert.ok(from >= 0, `${anchorId} is not a key in GUIDE_SECTIONS`);
      const titleMatch = guideSource.slice(from, from + 200).match(
        /title: "([^"]+)"/,
      );
      assert.ok(titleMatch, `no title found for ${marker}`);
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

  // Spec §17d, the one sanctioned addition to the deck's own copy: the owner
  // approved these definition lines verbatim for §10, now titled "Glossary
  // here" ("the Guide's Glossary section — owner-retitled 2026-08-03 — teaches these exact
  // definitions … replacing/adding entries as needed"), so the Guide teaches
  // exactly the words the ledger renders. Pinned as term/body pairs rather than
  // loose substrings — a definition attached to the wrong term would still pass
  // a presence-only check. The deck's existing "Pending" entry is canonical and
  // stays (asserted in the six-term test above), and "Bank half" stays the
  // instruction it always was.
  //
  // "Open · ±R" and "Stopped · −R" carry §17d's own R suffix in the term, which
  // is how §17d writes them and how the ledger prints them. Unclear and Closed
  // have no §17d definition line — they are the two words the controller's
  // wave-4 rulings added to complete the table — so theirs are the descriptions
  // those rulings settled (lib/outcomes.ts), cut to this list's register.
  it("teaches §17d's result vocabulary with the owner-approved definition lines, verbatim", () => {
    const taught: Array<[string, string]> = [
      [
        "Open · ±R",
        "Filled and live inside the window (R only when the engine has one).",
      ],
      ["Unfilled", "Window closed, never triggered."],
      [
        "Banked half",
        "First target hit, half banked, window ended before Target 2.",
      ],
      ["Banked full", "Target 2 reached."],
      ["Stopped · −R", "Stop hit."],
      ["Expired", "Filled, window ended, neither level hit."],
      [
        "Unclear",
        "Filled, but the price history cannot say whether stop or target came first.",
      ],
      ["Closed", "Closed by hand before the stop or either target was reached."],
    ];
    for (const [term, body] of taught) {
      assert.ok(
        collapsedIncludes(guideSource, `body: "${body}",\n    term: "${term}",`),
        `§10 must teach "${term}" with its own approved definition line`,
      );
    }
    // The result words the deck now teaches must be the ones the ledger
    // actually renders — no entry for a label that no longer exists.
    for (const retired of ["Reached target", "Hit stop", "Entry not filled"]) {
      assert.ok(
        !guideSource.includes(`term: "${retired}"`),
        `${retired} is not a result label any more`,
      );
    }
  });

  // The completeness half of §17d, and the reason I1 was possible at all: the
  // test above pins the words it lists, so a word nobody listed was taught by
  // nobody and caught by nothing. This derives the set from the ledger's single
  // render site instead of restating it — every display word
  // formatInsightsResult can return has to appear as its own §10 term, with or
  // without §17d's R suffix. A tenth result word fails here until the Guide
  // teaches it.
  it("teaches every word the ledger can render — read from the formatter, not restated", () => {
    const formatter = readFileSync(
      "src/components/workspace/historyUtils.ts",
      "utf8",
    ).match(/export function formatInsightsResult[\s\S]*?\n\}\n/)?.[0] ?? "";
    assert.ok(formatter.length > 0, "expected to find formatInsightsResult");
    // Display words are capitalized; the outcome enum values it compares
    // against are snake_case, which is what separates the two.
    const rendered = [
      ...new Set(
        Array.from(formatter.matchAll(/"([A-Z][^"]*)"/g), (match) => match[1]),
      ),
    ].sort();
    assert.deepEqual(
      rendered,
      [
        "Banked full",
        "Banked half",
        "Closed",
        "Expired",
        "Open",
        "Pending",
        "Stopped",
        "Unclear",
        "Unfilled",
      ],
      "the ledger's result vocabulary changed — teach the new word in §10",
    );

    const vocabulary = guideSource.match(/const VOCABULARY[\s\S]*?\n\];\n/)?.[0] ??
      "";
    assert.ok(vocabulary.length > 0, "expected to find VOCABULARY");
    const terms = Array.from(
      vocabulary.matchAll(/term: "([^"]+)",/g),
      (match) => match[1],
    );
    for (const word of rendered) {
      assert.ok(
        terms.some((term) => term === word || term.startsWith(`${word} · `)),
        `§10 teaches no entry for "${word}", which the ledger renders`,
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

// Q1-#27: §8's chart-view list is a claim about a control, so it has to match the
// control. The deck named four of the six views the select offers and described
// 1M/5M as engine-only validation intervals — which they are, and they are also
// pickable views, so a reader who picked one found the Guide describing a menu the
// app does not have. Pinned against CHART_TIMEFRAME_OPTIONS itself, in both the
// deck and the rendered panel, so the three can only move together.
describe("the Guide's chart-view list matches the chart-view control (§8)", () => {
  const PROSE_BY_CODE: Record<string, string> = {
    "1M": "1 minute",
    "5M": "5 minutes",
    "15M": "15 minutes",
    "1H": "1 hour",
    "4H": "4 hours",
    "1D": "1 day",
  };

  it("names every option the select offers, in the select's own order", () => {
    const expected = CHART_TIMEFRAME_OPTIONS.map((option) => {
      const prose = PROSE_BY_CODE[option.label];
      assert.ok(prose, `no prose form recorded for "${option.label}"`);
      return prose;
    });
    for (const [name, text] of [
      ["the deck", readFileSync(GUIDE_DECK, "utf8")],
      ["the panel", guideSource],
    ] as const) {
      // Whitespace-collapsed: both wrap this sentence mid-list.
      const collapsed = text.replace(/\s+/g, " ");
      const listed = expected.filter((prose) =>
        collapsed.includes(`${prose},`) || collapsed.includes(`${prose} —`)
      );
      assert.deepEqual(listed, expected, `${name} must name every chart view`);
    }
  });
});
