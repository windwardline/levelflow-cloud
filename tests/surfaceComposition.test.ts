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

const guide = readFileSync(GUIDE, "utf8");

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
});
