import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Task 3 of the spec §16 visual-fidelity remediation: Guide and Insights
// flattened to their approved mockups. Same shape and rationale as
// tests/deskComposition.test.ts (Task 2) — the 2026-07-31 ship failed
// because reviews checked new-element presence but never old-element
// absence, so every composition guard from here on pins BOTH directions
// against the mock: required elements present, and kill-list elements
// absent. Source-pinned (no jsdom in this repo's unit stack — see
// tests/confidenceUnit.test.tsx's header for the established technique).
const GUIDE = "src/components/workspace/GuidePanel.tsx";
const HISTORY = "src/components/workspace/HistoryPanel.tsx";

const guide = readFileSync(GUIDE, "utf8");
const history = readFileSync(HISTORY, "utf8");

// The one map both the index and the article read their numbers and titles from
// (M1). Extracted rather than matched file-wide so a count of ids or numbers
// means the deck's own ten and nothing else.
function guideSectionsBlock(): string {
  const block = guide.match(/const GUIDE_SECTIONS = \{[\s\S]*?\n\} satisfies /)
    ?.[0] ?? "";
  assert.ok(block.length > 0, "expected to find GUIDE_SECTIONS");
  return block;
}

describe("Guide composition — the mock's elements are present (g-guide-v1.html:12-21, :39-48)", () => {
  it("lays out the two-column article grid at the mock's exact measurements", () => {
    assert.match(
      guide,
      /className="mx-auto grid max-w-\[1020px\] gap-9 lg:grid-cols-\[230px_1fr\] lg:items-start"/,
    );
  });

  it("hides the TOC below lg and gives it the mock's sticky rail treatment", () => {
    assert.match(
      guide,
      /className="hidden lg:block sticky top-\[89px\] self-start border-r border-hairline pr-5"/,
    );
    assert.match(guide, />\s*Contents\s*</);
  });

  // Spec §17c: "the TOC must not jump when scrolling begins — its sticky offset
  // equals its natural resting offset so engagement is seamless." Measured in a
  // browser against the built CSS before the fix: the TOC rested at y=89 and
  // pinned at y=80, so it hopped 9px upward the instant the page moved.
  //
  // Every number below is DERIVED from the source that produces it rather than
  // restated, so a change to the masthead's padding, to the height of its
  // tallest control, or to the page's own top padding fails here instead of
  // quietly restoring the jump.
  it("pins the TOC exactly where it already rests — no jump when scrolling begins (§17c)", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const css = readFileSync("src/styles/index.css", "utf8");

    const headerPadStep = Number(
      app.match(/<div className="mx-auto max-w-7xl px-4 py-(\d+) sm:px-8">/)?.[1],
    );
    // The masthead's tallest element is its ghost Sign out, held at the kit's
    // 44px floor by index.css's own .secondary-button.min-h-10 override.
    const tallestControl = Number(
      css.match(/\.secondary-button\.min-h-10 \{\s*min-height: (\d+)px;/)?.[1],
    );
    const pageTopPadStep = Number(
      app.match(/space-y-5 px-4 py-4 pb-24 sm:px-8 sm:pt-(\d+)/)?.[1],
    );
    for (const value of [headerPadStep, tallestControl, pageTopPadStep]) {
      assert.ok(
        Number.isFinite(value),
        "expected every offset input to be readable from its own source",
      );
    }
    assert.match(
      app,
      /<header className="sticky top-0 z-20 border-b border-hairline/,
    );
    // Tailwind's spacing step is 0.25rem; the header's own bottom hairline is
    // the +1.
    const naturalOffset = headerPadStep * 4 * 2 + tallestControl + 1 +
      pageTopPadStep * 4;
    assert.equal(naturalOffset, 89, "the measured resting offset");
    assert.match(guide, new RegExp(`sticky top-\\[${naturalOffset}px\\]`));
  });

  // Spec §17c: "Guide TOC: entries carry the same two-digit numbers as their
  // sections (01-10)." The index and the article now read as one numbered
  // document — this inverts the earlier guard, which pinned the numbers OUT of
  // the index against g-guide-v1.html's unnumbered mock TOC.
  //
  // M1: the number and the title used to be declared twice — once in
  // GUIDE_SECTIONS for the index, once at each <GuideSection> call site for the
  // article — and nothing cross-checked the pairs. They agreed, but a probe
  // showed a drifted call-site number rendering "06 Costs" in the index over a
  // "09" heading with the suite green, because this test's own regex required
  // `number: ".."` and never saw JSX `number=".."`. Both literals now come from
  // the one map, which this pins in the only way that cannot rot: the numbers
  // are read from GUIDE_SECTIONS, and the article is required to carry no
  // number or title prop at all.
  it("numbers every TOC entry with its section's own number (§17c)", () => {
    const tocFunction = guide.match(/function GuideToc[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.match(tocFunction, /\{section\.number\}/);
    assert.match(tocFunction, /\{section\.title\}/);
    const numbers = Array.from(
      guideSectionsBlock().matchAll(/number: "(\d\d)"/g),
      (match) => match[1],
    );
    assert.deepEqual(
      numbers,
      ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
      "GUIDE_SECTIONS must carry 01-10 in order",
    );
    assert.match(guide, /<GuideToc sections=\{GUIDE_SECTIONS\} \/>/);
    // ONE source, structurally: every section call site names its id and
    // nothing else, and GuideSection reads the rest out of the map. A restored
    // literal on either prop fails here.
    assert.doesNotMatch(guide, /<GuideSection[^>]*\bnumber=/);
    assert.doesNotMatch(guide, /<GuideSection[^>]*\btitle=/);
    assert.match(guide, /const \{ number, title \} = GUIDE_SECTIONS\[id\];/);
    assert.equal(
      (guide.match(/<GuideSection id="[a-z-]+">/g) ?? []).length,
      10,
      "every deck section renders from the map with no restated meta",
    );
  });

  it("opens the article with the mock's ruled h1 — no icon, no eyebrow above it", () => {
    assert.match(
      guide,
      /<h1 className="border-b-2 border-ink pb-3\.5 text-3xl font-semibold tracking-normal text-ink">/,
    );
  });

  it("flows each section with a numbered eyebrow and a hairline rule, not a card", () => {
    assert.match(
      guide,
      /<section className="mt-6 scroll-mt-28 border-t border-hairline pt-6" id=\{id\}>/,
    );
    // The eyebrow is the bare number ("01") sitting directly above the <h2>
    // title, mirroring the eyebrow idiom the rest of the app already uses
    // (MarketScanPanel's "Scan", the old "Results"/"Guide" labels this task
    // retires elsewhere).
    assert.match(
      guide,
      /<p className="text-xs font-semibold uppercase tracking-normal text-ink-muted">\s*\{number\}\s*<\/p>\s*<h2/,
    );
  });

  it("caps section body copy at the mock's 62ch reading measure", () => {
    // Fix wave 2B, FIX 7 deleted the intro's own 62ch paragraph (the
    // unapproved subtitle — see the kill-list test below), so this no
    // longer also needs to prove the intro's copy independently from
    // every section's; the one exact match is now the whole claim.
    assert.match(
      guide,
      /className="mt-3 grid max-w-\[62ch\] gap-3 text-sm leading-6 text-ink-muted sm:text-base sm:leading-7"/,
    );
  });

  it("renders the canonical instruction as an accent-left-border callout, not a full box", () => {
    assert.match(
      guide,
      /<blockquote className="border-l-\[3px\] border-accent bg-accent\/5 py-3 pl-4 pr-4 text-base font-semibold leading-7 text-ink sm:text-lg">/,
    );
  });

  // Fix round 1: the controller ruled that spec §16's authority clause
  // ("where this spec's prose and a mockup's composition disagree, the
  // mockup governs composition") overrides the kill-list's narrower
  // "per-section" wording — g-guide-v1.html's dl/dt/dd and list styling
  // draw no boxes at any level, so §2/§3/§6's item-level cards and §10's
  // vocabulary term cards flatten too, not just the per-section wrappers.
  it("flattens §2/§6's unordered lists to native bullets, no item cards", () => {
    assert.equal(
      (guide.match(/<ul className="grid list-disc gap-2 ps-5">/g) ?? [])
        .length,
      2,
      "expected both §2 and §6 to use the same flat bulleted-list treatment",
    );
  });

  it("flattens §3's three ordered moments to a native numbered list, no numeral badges", () => {
    assert.match(guide, /<ol className="grid list-decimal gap-2 ps-5">/);
  });

  it("GuideBullet is a plain flowing list item now — no marker prop, no card", () => {
    const guideBulletFunction =
      guide.match(/function GuideBullet\([\s\S]*?\n}\n/)?.[0] ?? "";
    assert.ok(guideBulletFunction.length > 0, "expected to find GuideBullet");
    assert.match(guideBulletFunction, /return <li>\{children\}<\/li>;/);
    assert.doesNotMatch(guideBulletFunction, /marker/i);
  });

  it("flattens §10's vocabulary pairs to a plain dl flow, no per-term cards", () => {
    assert.match(
      guide,
      /<dl className="grid gap-3">\s*\{VOCABULARY\.map\(\(item\) => \(\s*<div key=\{item\.term\}>/,
    );
  });

  // Spec §17, placement (b): "the Guide article ends with a short Support
  // section (email + donate, tertiary links, no card chrome beyond the
  // article's own rhythm)." This is the one part of the Guide that is NOT deck
  // copy — §17 sanctions it by name, which is the citation this guard carries
  // for these exact strings. The guards above pin the deck's verbatim
  // rendering; this pins the sanctioned addition, so neither can be widened by
  // accident into a licence for un-approved Guide copy.
  //
  // §17c numbers the TOC 01-10, which forced a choice §17c/§17e do not rule on
  // (see the wave-4 report): a Support entry listed without a number would be
  // the one inconsistent line in a numbered index, and numbering it 11 would
  // put un-approved copy inside the deck's own numbering and index a service
  // block as a lesson. So it stays unnumbered and unindexed, and that is now
  // STRUCTURAL rather than a comment's promise: it renders after </article>, in
  // the same content column, as the page's closing block.
  it("closes the page with §17's Support block — after the article, two tertiary links, no card", () => {
    const support =
      guide.match(/<section[^>]*id="support"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
    assert.ok(support.length > 0, "expected the Support block");
    // The article's own rhythm — the same hairline rule, top spacing and h2
    // treatment every deck section carries — which is all §17 allows it.
    assert.match(
      support,
      /<section\n?\s*className="mt-6 scroll-mt-28 border-t border-hairline pt-6"\n?\s*data-testid="guide-support"\n?\s*id="support"\n?\s*>/,
    );
    assert.match(
      support,
      /<h2 className="text-xl font-semibold tracking-normal text-ink sm:text-2xl">\s*Support\s*</,
    );
    // Exactly two links, both tertiary, both wired to what already exists.
    assert.equal((support.match(/className="tertiary-link"/g) ?? []).length, 2);
    assert.match(support, /href=\{supportMailto\}[\s\S]{0,80}Email support/);
    assert.match(support, /onClick=\{onOpenDonate\}/);
    // No card chrome, and no numbered eyebrow.
    assert.doesNotMatch(support, /terminal-panel|rounded|bg-sheet|bg-paper/);
    assert.doesNotMatch(support, /uppercase/);
    // Outside the numbered document: after the closing </article>, and after
    // the deck's last section.
    assert.ok(
      guide.indexOf("</article>") < guide.lastIndexOf('id="support"'),
      "the Support block must render after the article, not inside it",
    );
    assert.ok(
      guide.lastIndexOf('id="support"') > guide.lastIndexOf('id="vocabulary"'),
      "the Support block must come after the deck's last section",
    );
    // And it is not in the index: the TOC renders GUIDE_SECTIONS, which is the
    // deck's ten numbered sections and nothing else.
    assert.doesNotMatch(guideSectionsBlock(), /"support"/);
    assert.equal(
      (guideSectionsBlock().match(/^\s*"[a-z-]+": \{/gm) ?? []).length,
      10,
      "GUIDE_SECTIONS must hold exactly the deck's ten sections",
    );
  });
});

describe("Guide composition — the kill list is absent (spec §16)", () => {
  it("carries no terminal-panel anywhere — the editorial article has no per-section or intro cards", () => {
    assert.doesNotMatch(guide, /terminal-panel/);
  });

  it("deleted the intro's icon square and eyebrow label, and the BookOpen import with it", () => {
    assert.doesNotMatch(guide, /BookOpen/);
    assert.doesNotMatch(guide, /h-12 w-12/);
    assert.doesNotMatch(guide, />\s*Guide\s*<\/p>/);
    assert.doesNotMatch(guide, /text-accent/);
  });

  // Fix wave 2B, FIX 7 (completeness-audit-1 A5-C1). This sentence sat
  // between the ruled h1 and the first section, and was the only Guide
  // sentence appearing in neither the owner-approved content deck nor the
  // desk-design spec: it narrated the page's own shape (the visible TOC
  // already shows "ten short sections") and hardcoded "Ten" against the
  // GUIDE_SECTIONS array length, so it would rot silently if a section
  // were ever added or removed. The deck's "same words your platform
  // already uses" premise is the deck's own front matter, not reader-facing
  // copy this page needs to restate.
  it("deletes the un-approved subtitle narrating the page's own shape (A5-C1) — no replacement copy added", () => {
    assert.doesNotMatch(guide, /Ten short sections/);
    assert.doesNotMatch(guide, /same words your platform already uses/);
  });

  it("deleted the per-section numeral badge square — sections carry a plain text eyebrow instead", () => {
    assert.doesNotMatch(guide, /h-9 w-9/);
  });

  it("the callout lost its full border box (border-2/bg-accent\\/10) — left-border accent only", () => {
    // bg-accent/10 alone isn't safe to forbid file-wide: the TOC's own hover
    // state legitimately reuses that tint (hover:bg-accent/10). border-2 has
    // no other legitimate use in this file, so it stays a blanket check; the
    // callout's own className is fully pinned (exact string, no extra
    // classes) by the present-direction test above, which is what actually
    // proves the old box classes are gone from *that* element specifically.
    assert.doesNotMatch(guide, /border-2/);
  });

  it("the TOC no longer scrolls horizontally as a mobile pill row — it simply doesn't render below lg", () => {
    assert.doesNotMatch(guide, /overflow-x-auto/);
    assert.doesNotMatch(guide, /whitespace-nowrap/);
  });

  // Fix round 1: item-level cards flattened per the controller's ruling
  // (see the matching "present" tests above). Both of this file's prior
  // legitimate uses of the card shape (GuideBullet, the vocabulary <dt>/
  // <dd> wrapper) are gone now, so — unlike round 1's original submission,
  // where this exact string still matched GuideBullet/Vocabulary on
  // purpose — a blanket file-wide absence check is now correct.
  it("carries no rounded-lg/border/bg-paper item card anywhere — not even the ones this task originally kept", () => {
    assert.doesNotMatch(guide, /rounded-lg border border-hairline bg-paper/);
  });

  it("deleted §3's numeral-badge circle — no bg-ink numbered badge, no marker prop", () => {
    assert.doesNotMatch(guide, /h-6 w-6/);
    assert.doesNotMatch(guide, /rounded-full bg-ink/);
    assert.doesNotMatch(guide, /\bmarker="/);
    assert.doesNotMatch(guide, /marker\?:/);
  });
});

describe("Insights composition — the mock's elements are present (i-insights-v1.html)", () => {
  it("caps the flat page at the mock's 1180px measure", () => {
    assert.match(
      history,
      /className="mx-auto grid w-full max-w-\[1180px\] gap-5"/,
    );
  });

  it("gives the phead (h1 + record band) the mock's 2px ink rule, no card", () => {
    assert.match(
      history,
      /className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-3\.5"/,
    );
  });

  it("renders the record band as flat value+label blocks, no pill/card chrome", () => {
    const statBlock = history.match(/function StatBlock[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.ok(statBlock.length > 0, "expected to find StatBlock");
    assert.doesNotMatch(statBlock, /rounded/);
    assert.doesNotMatch(statBlock, /border/);
    assert.doesNotMatch(statBlock, /bg-/);
  });

  it("lays the filter row out inline with a hairline rule underneath, not a bordered card", () => {
    assert.match(
      history,
      /className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline pb-4"/,
    );
  });

  it("keeps the Market/Status/Period aria-labels on real selects inside the inline row (preserved contract)", () => {
    // The row holds three <label>s and no nested <div>, so its own closing tag is
    // the first one after it — matched by shape rather than by indentation, which
    // §17g's two compositions moved (the row is a value both branches place).
    const filtersBlock = history.match(
      /className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline pb-4">[\s\S]*?<\/div>/,
    )?.[0] ?? "";
    for (const label of ["Market", "Status", "Period"]) {
      assert.match(filtersBlock, new RegExp(`aria-label="${label}"`));
    }
    assert.equal((filtersBlock.match(/<select\b/g) ?? []).length, 3);
  });

  it("wraps the table in exactly one bordered container — the mock's allowed single box", () => {
    assert.equal((history.match(/terminal-panel/g) ?? []).length, 1);
    assert.match(history, /<div className="terminal-panel p-3 sm:p-4">/);
  });
});

describe("Insights composition — the kill list is absent (spec §16)", () => {
  it("deleted the old boxed record-band pills (StatPill) and the eyebrow above the h1", () => {
    assert.doesNotMatch(history, /StatPill/);
    assert.doesNotMatch(history, /rounded-lg border border-hairline bg-sheet px-2 py-2/);
    assert.doesNotMatch(history, />\s*Results\s*</);
  });

  it("deleted the boxed filter-row card — Market/Status/Period no longer sit in a bordered panel", () => {
    assert.doesNotMatch(
      history,
      /rounded-lg border border-hairline bg-paper p-3 sm:grid-cols-3/,
    );
  });

  it("no terminal-panel wraps the phead or the filter row — each block's own className is exactly the flat one, nothing more", () => {
    // The count-is-1 assertion above is necessary but not sufficient: a
    // regression that wrapped phead+filters+table together in one outer
    // panel (the pre-Task-3 shape) would *still* show exactly one
    // terminal-panel in a naive count. This proves it independently by
    // extracting each block's own className attribute and checking it does
    // not contain the word — a real ancestor-panel regression would fail
    // this even though the whole-file count stayed at 1. (Confirmed to fail
    // against the pre-Task-3 source, where this attribute lookup finds
    // "terminal-panel p-5 sm:p-6" instead.)
    const pheadClassName = history.match(
      /<div className="([^"]*border-b-2 border-ink pb-3\.5[^"]*)"/,
    )?.[1];
    const filtersClassName = history.match(
      /<div className="([^"]*border-hairline pb-4[^"]*)"/,
    )?.[1];
    assert.ok(pheadClassName, "expected to find the phead block's className");
    assert.ok(filtersClassName, "expected to find the filters block's className");
    assert.doesNotMatch(pheadClassName ?? "", /terminal-panel/);
    assert.doesNotMatch(filtersClassName ?? "", /terminal-panel/);
  });

  // Fix wave 2B, FIX 5 (completeness-audit-2 beyond-checklist #7). The
  // "no setups match the current filters" notice was the one string inside
  // the single table frame still wearing the banned item-card shape
  // (rounded-lg border border-hairline bg-paper) — the same shape this
  // describe block already bans for the record band and the filter row.
  // Flattened to match its own sibling empty state exactly, two lines
  // above it in source ("No setups have been logged yet."), rather than
  // inventing a new treatment.
  it("flattens the empty-filter notice to the same plain muted line as its sibling empty state, no card", () => {
    assert.doesNotMatch(
      history,
      /rounded-lg border border-hairline bg-paper px-4 py-3/,
    );
    const noticeBlock = history.match(
      /<p className="([^"]*)">\s*No setups match the current filters\.\s*<\/p>/,
    )?.[1];
    assert.ok(noticeBlock, "expected to find the empty-filter notice");
    assert.equal(noticeBlock, "mt-4 text-sm leading-6 text-ink-muted");
  });
});
