import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Spec §4: "Eyebrow labels: small uppercase, letterspaced." The mock kit gives
// that a value — docs/design/mockups/tokens.css:15, .eyebrow at 0.14em — and the
// app shipped twenty eyebrows with `tracking-normal`, which is letter-spacing 0.
// Twenty copies of one string is also why the defect was uniform and why the fix
// is a kit class rather than twenty edits.
//
// Both directions, per §16: the class present and correct, and the hand-written
// idiom it replaced gone for good — including the shape of the defect itself, so
// no new uppercase label can ship un-letterspaced by writing the same pair again.
const CSS = readFileSync("src/styles/index.css", "utf8");
const TOKENS = readFileSync("docs/design/mockups/tokens.css", "utf8");

function sourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

describe("the eyebrow is one kit class", () => {
  it("carries the mock kit's own letterspacing, casing, weight and colour", () => {
    const rule = CSS.match(/\n  \.eyebrow \{[^}]*\}/)?.[0];
    assert.ok(rule, "expected .eyebrow in the kit");
    assert.match(rule, /letter-spacing: 0\.14em;/);
    assert.match(rule, /text-transform: uppercase;/);
    assert.match(rule, /font-weight: 600;/);
    assert.match(rule, /color: var\(--color-ink-muted\);/);
    // 12px/16px: what every eyebrow in the app already measured, kept so the
    // ≥lg baseline rhythm §17c pinned does not move under a typography fix.
    assert.match(rule, /font-size: 0\.75rem;/);
    assert.match(rule, /line-height: 1rem;/);
  });

  it("reads its letterspacing from the same number the mock kit draws", () => {
    // Not restated: if tokens.css ever re-values .eyebrow, this fails rather
        // than letting the app and the mock kit drift apart silently.
    const mockSpacing = TOKENS.match(/\.eyebrow \{[^}]*letter-spacing: ([\d.]+em)/)
      ?.[1];
    assert.equal(mockSpacing, "0.14em");
    assert.ok(
      CSS.includes(`letter-spacing: ${mockSpacing};`),
      "the kit's .eyebrow uses the mock kit's own value",
    );
  });
});

describe("no eyebrow is written out at a call site any more", () => {
  it("pairs `uppercase` with `tracking-normal` nowhere in src — that pair IS the defect", () => {
    for (const file of sourceFiles("src")) {
      const source = readFileSync(file, "utf8");
      for (const literal of source.match(/"[^"\n]*"/g) ?? []) {
        assert.ok(
          !(literal.includes("uppercase") && literal.includes("tracking-normal")),
          `${file}: ${literal}\n` +
            "An uppercase label with tracking-normal is an eyebrow with its " +
            "letterspacing switched off (spec §4). Use the kit's .eyebrow.",
        );
      }
    }
  });

  it("re-declares no part of the idiom inline on the surfaces that took the class", () => {
    // The sites, by file. Listed rather than discovered so that deleting an
    // eyebrow is a visible edit here too, and so this can assert the class
    // arrived where the string left.
    const migrated: Record<string, number> = {
      "src/components/auth/AuthScreen.tsx": 1,
      "src/components/donations/DonatePanel.tsx": 2,
      // Four, not five, since §17m.1: the deleted AnalysisProgress carried an
      // "Analyzing {symbol}" eyebrow over a step list that never advanced.
      "src/components/workspace/AdvisorRecommendationPanel.tsx": 4,
      "src/components/workspace/ConfidenceUnit.tsx": 1,
      "src/components/workspace/CurrentTradesRail.tsx": 1,
      "src/components/workspace/GuidePanel.tsx": 2,
      // Four since §18: the ledger's column head, its day-group head, the
      // record band's stat label, and Attribution's slice-group label — which
      // takes the kit class rather than inventing a fourth small-label
      // treatment on the same surface.
      "src/components/workspace/HistoryPanel.tsx": 4,
      "src/components/workspace/MarketScanPanel.tsx": 1,
      // One, not two, since §17m.5: the availability line stopped being an
      // eyebrow. At the kit's 12px/0.14em it spent a third of a 248px popup on
      // one line, so it carries its own smaller mono type now
      // (tests/scopeMenu.test.tsx pins the sizes and the width budget). The
      // trigger's caption is the eyebrow that remains.
      "src/components/workspace/ScopeMenu.tsx": 1,
      "src/components/workspace/SetupQualityReceipt.tsx": 2,
    };
    for (const [file, count] of Object.entries(migrated)) {
      const source = readFileSync(file, "utf8");
      // The class as the first token of a className literal, never the word:
      // these files' comments name the eyebrow while explaining what they draw,
      // and prose is not a call site.
      assert.equal(
        (source.match(/"eyebrow(?=[ "])/g) ?? []).length,
        count,
        `${file} should carry ${count} eyebrow(s)`,
      );
      assert.doesNotMatch(
        source,
        /text-xs font-semibold uppercase tracking-normal text-ink-muted/,
        `${file}: the hand-written idiom is back`,
      );
    }
  });

  it("leaves the pre-auth screens' own 0.18em eyebrows alone — §16 puts them outside the mockups' scope", () => {
    // Not an oversight and not the defect: these two carry a real letterspacing,
    // chosen for the pre-auth composition in Stage 2, on surfaces §16 names as
    // out of the mocks' scope by name. Pinned so the divergence stays a decision
    // rather than becoming drift.
    for (const file of [
      "src/components/auth/AuthScreen.tsx",
      "src/components/auth/ParkingScreen.tsx",
    ]) {
      assert.match(
        readFileSync(file, "utf8"),
        /uppercase tracking-\[0\.18em\] text-ink-muted/,
        file,
      );
    }
  });

  it("keeps the two per-mock overrides that are not the eyebrow's own value", () => {
    // The kit class is one source; these are the two places a mock draws
    // something else, and they stay as utilities on top of it rather than as
    // second copies of the whole treatment.
    const ladder = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    // m-scan-v3.html:35 — .copy .k, 10px at .07em on the merged mobile surface.
    assert.match(ladder, /className="eyebrow min-w-0 max-lg:text-\[10px\] max-lg:tracking-\[0\.07em\]"/);
    // m-trades-v1.html:11-12 — below lg the rail's first line is a 19px display
    // title, not an eyebrow at all.
    assert.match(
      readFileSync("src/components/workspace/CurrentTradesRail.tsx", "utf8"),
      /className="eyebrow max-lg:font-display max-lg:text-\[19px\] max-lg:font-bold max-lg:normal-case/,
    );
  });
});
