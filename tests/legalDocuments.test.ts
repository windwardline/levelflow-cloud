import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { LEGAL_SLUGS, legalDocument } from "../src/lib/legalDocuments";

// Spec §17o tier 2: "Risk disclaimer, Privacy and Terms are Levelflow's own
// writing, so reading them is not leaving." Inside the app they open as a
// surface; the files under public/legal/ stay the published documents. Two
// presentations, and the ruling's condition on that: "never a second copy of
// them: one module owns the prose, the surface renders it, and a guard holds the
// static files to it in both directions, so neither can drift."
//
// This is that guard. It is the whole reason the adjudication went to a module
// rather than to a runtime fetch of the static HTML: a fetch would put a request,
// a parse, and an injection of markup this app did not build between a reader and
// a legal notice — while the property that actually matters, that the words are
// the same words, is checkable here, in CI, for free.
const DOCUMENT_SURFACE = "src/components/legal/LegalDocumentPanel.tsx";
const LEGAL_LINKS = "src/components/legal/LegalLinks.tsx";

function staticParagraphs(slug: string): string[] {
  const source = readFileSync(`public/legal/${slug}.html`, "utf8");
  const section = source.match(/<section>([\s\S]*?)<\/section>/)?.[1] ?? "";
  assert.ok(section.length > 0, `${slug}.html: expected the document's section`);
  return [...section.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => match[1].trim());
}

describe("§17o tier 2 — the surface and the published file are one document", () => {
  it("carries the three documents in the footer's own order", () => {
    assert.deepEqual(LEGAL_SLUGS, ["risk-disclaimer", "privacy", "terms"]);
  });

  it("keeps the labels the footer already used, so no surface invents a name", () => {
    // §17f: these three strings exist in the product today (LegalLinks' own
    // array), and they are what the reader clicked. In-app the label IS the
    // surface's title — the app's masthead already carries the wordmark, so a
    // second "Levelflow" as the document's heading would name the app twice and
    // the document not at all.
    assert.deepEqual(
      LEGAL_SLUGS.map((slug) => legalDocument(slug).title),
      ["Risk disclaimer", "Privacy", "Terms"],
    );
  });

  for (const slug of ["risk-disclaimer", "privacy", "terms"] as const) {
    it(`holds ${slug}'s prose verbatim, in both directions`, () => {
      // deepEqual, not "contains": same paragraphs, same order, same count. A
      // paragraph added to either side and not the other fails here, which is the
      // no-drift property stated as an assertion.
      assert.deepEqual(legalDocument(slug).paragraphs, staticParagraphs(slug));
      assert.equal(legalDocument(slug).paragraphs.length, 5);
    });

    it(`agrees with ${slug}.html about what the document is called`, () => {
      const source = readFileSync(`public/legal/${slug}.html`, "utf8");
      const document = legalDocument(slug);
      // The word the static page prints above the wordmark, and the name its own
      // scroll region announces with. The static page keeps both — this pins that
      // the module knows the same word rather than a second one.
      assert.match(
        source,
        new RegExp(`<p class="page-eyebrow">${document.eyebrow}</p>`),
        slug,
      );
      assert.match(source, new RegExp(`<main aria-label="${document.eyebrow}"`), slug);
      assert.equal(document.file, `legal/${slug}.html`);
    });
  }

  it("is the only list of the documents — LegalLinks reads it", () => {
    const links = readFileSync(LEGAL_LINKS, "utf8");
    assert.match(links, /from "\.\.\/\.\.\/lib\/legalDocuments"/);
    // No second array of labels or hrefs anywhere in the component.
    assert.doesNotMatch(links, /Risk disclaimer/);
    assert.doesNotMatch(links, /"Privacy"/);
    assert.doesNotMatch(links, /legal\/privacy\.html/);
  });
});

describe("§17o tier 2 — the document surface is the app's own page composition", () => {
  const panel = readFileSync(DOCUMENT_SURFACE, "utf8");

  it("renders the prose from the module and holds none of its own", () => {
    assert.match(panel, /from "\.\.\/\.\.\/lib\/legalDocuments"/);
    assert.match(panel, /doc\.paragraphs\.map/);
    // Not one sentence of the documents lives in the component.
    for (const opening of [
      "Levelflow collects the information",
      "Levelflow is provided by Windward Line",
      "Levelflow is software for market review",
    ]) {
      assert.doesNotMatch(panel, new RegExp(opening), opening);
    }
  });

  it("takes Profile's 880px editorial column at ≥lg — claimed, not merely capped", () => {
    // §17o names the width, and it is not a new number: ProfilePanel's own sheet
    // (p-profile-v2.html's composition authority). The CLASS differs from Profile's
    // on purpose, and the difference is the whole content of this guard: the ≥lg
    // content region is mx-auto inside a grid row, so its used width is fit-content.
    // Profile's rows widen it to 880 by themselves; this surface's widest child is a
    // 62ch paragraph block, so a capped `max-w-[880px]` measured 626px in the browser
    // — an 880 that was never 880. A definite width is what a fit-content parent can
    // size to, and max-w-full is what keeps it inside the region at 1024.
    assert.match(panel, /mx-auto w-\[880px\] max-w-full/);
    assert.match(
      readFileSync("src/components/workspace/ProfilePanel.tsx", "utf8"),
      /max-w-\[880px\]/,
    );
    // And it is not two numbers pretending to be one.
    const widths = new Set(
      Array.from(panel.matchAll(/\[(\d+)px\]/g), (match) => match[1]),
    );
    assert.deepEqual([...widths].sort(), ["19", "880"]);
  });

  it("takes the §17g fixed frame below lg, from the shared strings", () => {
    assert.match(panel, /from "\.\.\/mobileFrame"/);
    for (const frame of ["MOBILE_FRAME", "MOBILE_FRAME_PINNED", "MOBILE_FRAME_SCROLL"]) {
      assert.match(panel, new RegExp(`\\{${frame}\\}`), frame);
    }
  });

  it("opens with the same ruled page head the four titled surfaces carry", () => {
    // Literal and identical to DonatePanel's and ProfilePanel's (C1: Tailwind
    // reads source text, so the string has to exist whole — which also means a
    // page head cannot be "nearly" the same as the others).
    const head =
      /className="border-b-2 border-ink pb-3\.5 text-2xl font-semibold tracking-normal text-ink max-lg:pb-2 max-lg:text-\[19px\] max-lg:leading-6"/;
    assert.match(panel, head);
    assert.match(readFileSync("src/components/donations/DonatePanel.tsx", "utf8"), head);
    // One h1 on the surface, and it is that head: the document's name.
    assert.equal((panel.match(/<h1/g) ?? []).length, 1);
    assert.match(panel, /<h1[\s\S]{0,300}\{doc\.title\}/);
  });

  it("sets the prose on the app's own reading measure, not a second one", () => {
    // Byte-identical to GuidePanel's own multi-paragraph body block — the app's
    // existing prose treatment, not a second one that merely resembles it.
    const bodyType =
      /grid max-w-\[62ch\] gap-3 text-sm leading-6 text-ink-muted sm:text-base sm:leading-7/;
    assert.match(panel, bodyType);
    assert.match(readFileSync("src/components/workspace/GuidePanel.tsx", "utf8"), bodyType);
  });

  it("draws no box — the surface is the page (§17c)", () => {
    assert.doesNotMatch(panel, /terminal-panel|rounded-lg border|bg-sheet/);
  });
});
