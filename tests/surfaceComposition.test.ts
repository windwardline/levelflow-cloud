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
      /className="hidden lg:block sticky top-0 self-start border-r border-hairline pr-5"/,
    );
    assert.match(guide, />\s*Contents\s*</);
  });

  // Spec §17c: "the TOC must not jump when scrolling begins — its sticky offset
  // equals its natural resting offset so engagement is seamless." Measured in a
  // browser against the built CSS when that ruling landed: the TOC rested at y=89
  // and pinned at y=80, so it hopped 9px upward the instant the page moved.
  //
  // Spec §17i re-based the offset without touching the ruling. The document no
  // longer scrolls — App.tsx's content region does — and a sticky offset applies
  // inside that region's content box, which starts below the masthead row AND
  // below the region's own top padding. So the masthead's height, its tallest
  // control and the page's top pad all drop out of the arithmetic (which is why
  // they are no longer read here) and the rail's resting offset inside that rect
  // is zero. Measured in Chromium against the built CSS at 1280 and 1440: at
  // top-0 the rail sits at y=89 both at rest and scrolled to the end, on the h1's
  // own baseline; at top-5 it measured y=109, a 20px unfinished margin above it.
  //
  // The pairing is the guard, because either half alone is a defect: a zero offset
  // only lands right while the REGION carries the air above the rail.
  it("pins the TOC exactly where it already rests — no jump when scrolling begins (§17c, §17i)", () => {
    const app = readFileSync("src/App.tsx", "utf8");

    const pageTopPadStep = Number(
      app.match(/space-y-5 px-4 py-4 pb-24 sm:px-8 sm:pt-(\d+)/)?.[1],
    );
    assert.ok(
      Number.isFinite(pageTopPadStep),
      "expected the content region's top padding to be readable from its source",
    );
    // The region is the scrollport, and it is the only scroller between the
    // frame's two pinned rows (tests/appFrame.test.ts owns that claim).
    assert.match(app, /\blg:overflow-y-auto\b/);
    // Tailwind's spacing step is 0.25rem: 20px of air, contributed by the region.
    assert.equal(pageTopPadStep * 4, 20);
    assert.match(guide, /sticky top-0\b/);
    // The viewport-relative number the sticky masthead used to require, and the
    // offset that would double the region's padding.
    assert.doesNotMatch(guide, /sticky top-\[89px\]/);
    assert.doesNotMatch(guide, new RegExp(`sticky top-${pageTopPadStep}\\b`));
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
      // The scroll margin sits behind lg: since M2 — it reserves the ≥lg region's
      // own top padding, and the mobile region has none (tests/appFrame.test.ts
      // derives both halves).
      /<section className="mt-6 border-t border-hairline pt-6 lg:scroll-mt-5" id=\{id\}>/,
    );
    // The eyebrow is the bare number ("01") sitting directly above the <h2>
    // title, mirroring the eyebrow idiom the rest of the app already uses
    // (MarketScanPanel's "Scan", the old "Results"/"Guide" labels this task
    // retires elsewhere).
    assert.match(
      guide,
      /<p className="eyebrow">\s*\{number\}\s*<\/p>\s*<h2/,
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

  // Spec §17i (owner ruling): "Each link lives in exactly one home per platform.
  // Desktop: the footer (Help · Donate · Risk disclaimer · Privacy · Terms) — so
  // the Guide's Support section and Profile's Support row are DELETED."
  //
  // This inverts §17 placement (b) rather than deleting its guard, so the block
  // cannot return by anyone re-reading that placement as still authoritative — the
  // same discipline §17c's own inversions used. The footer now sits in the frame
  // twenty pixels below the article on every ≥lg surface, so a closing email-and-
  // donate block was a second home for links already on screen; below lg the
  // account menu is the one home, as §17g had already ruled.
  it("closes the page with the article and nothing after it — §17i deleted the Support block", () => {
    assert.doesNotMatch(guide, /id="support"/);
    assert.doesNotMatch(guide, /guide-support/);
    assert.doesNotMatch(guide, /GuideSupport/);
    // The strings, not merely the component: "Support" as a rendered heading and
    // "Email support" as a link label both leave the Guide entirely.
    assert.doesNotMatch(guide, />\s*Support\s*<\/h2>/);
    assert.doesNotMatch(guide, /Email support/);
    // And the plumbing goes with it — a prop nothing renders is the shape this
    // deletion is most likely to leave behind.
    assert.doesNotMatch(guide, /supportMailto/);
    assert.doesNotMatch(guide, /onOpenDonate/);
    assert.doesNotMatch(guide, /tertiary-link/);
    assert.match(
      guide,
      /export function GuidePanel\(\{ anchor, onAnchorHandled \}: GuidePanelProps\)/,
    );
    // The index was always the deck's ten numbered sections and nothing else, and
    // now the page is too: the article is the last thing in the content column.
    assert.doesNotMatch(guideSectionsBlock(), /"support"/);
    assert.equal(
      (guideSectionsBlock().match(/^\s*"[a-z-]+": \{/gm) ?? []).length,
      10,
      "GUIDE_SECTIONS must hold exactly the deck's ten sections",
    );
    const desktopColumn = guide.match(
      /<div className="min-w-0">\s*<article className="min-w-0">[\s\S]*?<\/div>/,
    )?.[0] ?? "";
    assert.ok(desktopColumn.length > 0, "expected the ≥lg content column");
    assert.match(desktopColumn, /<\/article>\s*<\/div>/);
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

// Spec §18: "flat rows under an 'Attribution' h2 below the ledger — hairlines
// only (box discipline), the ledger's mono numerals, no narration (§17f: every
// string is a label)." Both directions, as every composition guard here does:
// the section is present and placed in both compositions, and it draws none of
// the shapes §16/§17c swept off this surface.
function attributionBlock(): string {
  const block = history.match(
    /<section className="[^"]*" data-testid="attribution">[\s\S]*?<\/section>/,
  )?.[0] ?? "";
  assert.ok(block.length > 0, "expected to find the Attribution section");
  return block;
}

describe("Attribution composition — the section is present (spec §18)", () => {
  it("titles the section with an h2 in the surface's own heading treatment, one step under its h1", () => {
    assert.match(
      history,
      /<h2 className="text-xl font-semibold tracking-normal text-ink">\s*Attribution\s*<\/h2>/,
    );
    // The h1 above it keeps the larger step, so the hierarchy is real rather
    // than two headings at one size.
    assert.match(
      history,
      /<h1 className="text-2xl font-semibold tracking-normal text-ink">/,
    );
  });

  it("renders every slice group the aggregator returns, label and rows alike", () => {
    const block = attributionBlock();
    assert.match(block, /\{attributionGroups\.map\(\(group\) => \(/);
    assert.match(block, /\{group\.label\}/);
    assert.match(block, /\{group\.rows\.map\(\(row\) => \(/);
    assert.match(block, /\{row\.label\}/);
  });

  it("renders each row's three figures in the ledger's mono numerals", () => {
    const block = attributionBlock();
    assert.match(block, /font-mono text-sm tabular-nums text-ink/);
    assert.match(block, /\{row\.resolved\}/);
    // The record band's own honesty pattern for too little evidence, and the
    // em dash every absent figure on this surface already renders.
    assert.match(
      block,
      /\{row\.moneyPositivePercent === null\s*\? "Learning"\s*: `\$\{row\.moneyPositivePercent\}%`\}/,
    );
    assert.match(
      block,
      /\{row\.netR === null \? "—" : formatSignedR\(row\.netR\)\}/,
    );
  });

  it("reads the full row set, never the filtered view (spec §18, stated so nobody wires the filters in later)", () => {
    assert.match(history, /const attributionGroups = buildAttribution\(setups\);/);
    assert.doesNotMatch(history, /buildAttribution\(filteredSetups\)/);
    assert.doesNotMatch(history, /buildAttribution\(groupedSetups\)/);
  });

  it("places the one section in both compositions — §17g parity, not a second copy", () => {
    // Built once as a value, so the two branches place the same element.
    assert.equal(
      (history.match(/const attributionSection = \(/g) ?? []).length,
      1,
    );
    assert.equal((history.match(/\{attributionSection\}/g) ?? []).length, 2);
    // Below lg: inside the Insights frame's scroll region, after the ledger.
    assert.match(
      history,
      /data-testid="mobile-insights-scroll"\s*>\s*\{ledger\}\s*\{attributionSection\}/,
    );
    // At ≥lg: inside the one surviving table frame, after the ledger.
    assert.match(
      history,
      /<div className="terminal-panel p-3 sm:p-4">\s*\{ledger\}\s*\{attributionSection\}/,
    );
  });
});

describe("Attribution composition — the section draws no box and says nothing (spec §18, §17f)", () => {
  it("adds no bordered sheet of its own — the frame it sits in is the only one on the surface", () => {
    const block = attributionBlock();
    // Hairlines only: single-edge rules separate, a perimeter groups, and §17c
    // allows exactly one perimeter here (the table frame, which already
    // exists). tests/boxDiscipline.test.ts enforces the same rule app-wide;
    // this pins it on the block itself so a regression names this section.
    assert.doesNotMatch(block, /terminal-panel/);
    assert.doesNotMatch(block, /\brounded/);
    assert.doesNotMatch(block, /(?:^|\s)(?:[a-z-]+:)*border(?:-\[[^\]]+\]|-\d+)?(?=\s|")/);
    assert.doesNotMatch(block, /(?:^|\s)(?:[a-z-]+:)*(?:ring|outline)(?:-\d+)?(?=\s|")/);
    assert.doesNotMatch(block, /\bshadow-/);
    // No fill either — a tinted panel is the same passive grouping by another
    // means, and the ledger's own day-group heading is the only bg- on this
    // surface.
    assert.doesNotMatch(block, /\bbg-/);
    // And the file-wide count is unchanged by this section landing.
    assert.equal((history.match(/terminal-panel/g) ?? []).length, 1);
  });

  it("carries no copy but its own title — no caption, no note, no column headers", () => {
    const block = attributionBlock();
    // Every string the section renders, with class lists, keys and the testid
    // stripped first: the two value words the figures fall back to, and
    // nothing else. A caption or a column header would land in this list.
    const withoutAttributes = block.replace(
      /\s(?:className|data-testid|key)=(?:"[^"]*"|\{[^{}]*\})/g,
      "",
    );
    assert.deepEqual(
      Array.from(withoutAttributes.matchAll(/"([^"]*)"/g), (match) => match[1]),
      ["Learning", "—"],
    );
    // And the one piece of JSX text in the whole section is its own heading:
    // every other word on screen is a label the aggregator supplies.
    assert.deepEqual(
      Array.from(
        withoutAttributes.matchAll(/>\s*([A-Za-z][^<>{}]*?)\s*</g),
        (match) => match[1],
      ),
      ["Attribution"],
    );
    // The muted prose treatment this surface uses for its two empty-state
    // sentences appears nowhere in the section — there is no sentence in it.
    assert.doesNotMatch(block, /text-ink-muted/);
    // No table, so no column headers to caption in the first place: the
    // ledger's own eight headers stay the only ones on the surface
    // (tests/historyPanel.test.tsx pins that list).
    assert.doesNotMatch(block, /<t[hdr]\b/);
  });
});
