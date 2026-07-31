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
      /className="hidden lg:block sticky top-20 self-start border-r border-hairline pr-5"/,
    );
    assert.match(guide, />\s*Contents\s*</);
  });

  it("TOC links carry only the section title — the numbered eyebrow lives in the article, not the index", () => {
    const tocFunction = guide.match(/function GuideToc[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.match(tocFunction, /\{section\.title\}/);
    assert.doesNotMatch(tocFunction, /\{section\.number\}/);
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

  it("caps body copy at the mock's 62ch reading measure, both the intro and every section", () => {
    assert.match(guide, /max-w-\[62ch\].*text-ink-muted sm:text-base sm:leading-7"/);
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
    const filtersBlock = history.match(
      /className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-hairline pb-4">[\s\S]*?\n {6}<\/div>/,
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
});
