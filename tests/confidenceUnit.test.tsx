import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildConfidenceNote,
  clampConfidencePercent,
  formatConfidenceValue,
} from "../src/components/workspace/ConfidenceUnit";
import { formatScanRowMeta } from "../src/components/workspace/marketScanFilters";
import { CONFIDENCE_THRESHOLD_BY_ASSET_TYPE } from "../src/lib/advisorReview";
import type { SecurityType } from "../src/lib/symbolMap";

// Same approach as tests/confidenceGauge.test.ts and tests/scopeMenu.test.tsx:
// no jsdom in this repo's unit-test stack, so ConfidenceUnit is exercised
// through its exported pure functions rather than rendered. ConfidenceUnit.tsx
// never touches `document` at module scope, so importing it for those
// functions loads cleanly under plain node:test. The handful of facts that
// only exist in JSX — the literal "Confidence" label, the meter deriving its
// fill/tick from computed percentages, and the threshold coming from the
// live-calibration mirror rather than a hardcoded number — are pinned by
// reading the real source text, the same technique tests/core.test.ts
// already uses for source it can't import and execute directly.
const CONFIDENCE_UNIT_SOURCE = readFileSync(
  "src/components/workspace/ConfidenceUnit.tsx",
  "utf8",
);

describe("formatConfidenceValue", () => {
  it('renders the canonical "N of 100" scale, never a bare number', () => {
    assert.equal(formatConfidenceValue(72), "72 of 100");
    assert.equal(formatConfidenceValue(0), "0 of 100");
    assert.equal(formatConfidenceValue(100), "100 of 100");
  });

  it("rounds to the nearest whole point", () => {
    assert.equal(formatConfidenceValue(82.6), "83 of 100");
    assert.equal(formatConfidenceValue(81.4), "81 of 100");
  });
});

describe("clampConfidencePercent", () => {
  it("keeps in-range values as-is", () => {
    assert.equal(clampConfidencePercent(40), 40);
    assert.equal(clampConfidencePercent(0), 0);
    assert.equal(clampConfidencePercent(100), 100);
  });

  it("clamps out-of-range and non-finite values instead of producing an invalid style", () => {
    assert.equal(clampConfidencePercent(-10), 0);
    assert.equal(clampConfidencePercent(150), 100);
    assert.equal(clampConfidencePercent(Number.NaN), 0);
  });
});

describe("buildConfidenceNote", () => {
  it("names the class and its live threshold, with room to spare when the margin is wide", () => {
    const threshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Forex;
    assert.equal(
      buildConfidenceNote("Forex", threshold + 20, threshold),
      `Forex setups must score ${threshold} to qualify — this one clears it with room to spare`,
    );
  });

  it("softens to a plain clear when the margin is thin (within 5 points of the bar)", () => {
    const threshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Metals;
    assert.equal(
      buildConfidenceNote("Metals", threshold + 2, threshold),
      `Metals setups must score ${threshold} to qualify — this one clears it`,
    );
  });

  it("treats a margin of exactly 5 as thin, and 6 as room to spare", () => {
    const threshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Crypto;
    assert.equal(
      buildConfidenceNote("Crypto", threshold + 5, threshold),
      `Crypto setups must score ${threshold} to qualify — this one clears it`,
    );
    assert.equal(
      buildConfidenceNote("Crypto", threshold + 6, threshold),
      `Crypto setups must score ${threshold} to qualify — this one clears it with room to spare`,
    );
  });

  it("clears exactly at the bar (zero margin) with the softened phrasing", () => {
    const threshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE.Indices;
    assert.equal(
      buildConfidenceNote("Indices", threshold, threshold),
      `Indices setups must score ${threshold} to qualify — this one clears it`,
    );
  });

  it("covers every asset class's own qualifying language, threshold sourced from the mirror", () => {
    for (
      const assetType of Object.keys(
        CONFIDENCE_THRESHOLD_BY_ASSET_TYPE,
      ) as SecurityType[]
    ) {
      const threshold = CONFIDENCE_THRESHOLD_BY_ASSET_TYPE[assetType];
      assert.equal(
        buildConfidenceNote(assetType, threshold + 20, threshold),
        `${assetType} setups must score ${threshold} to qualify — this one clears it with room to spare`,
      );
    }
  });
});

describe("ConfidenceUnit component shape (source-pinned — see header comment)", () => {
  it('labels the value "Confidence" and renders it through the value formatter, never a bare number', () => {
    assert.match(CONFIDENCE_UNIT_SOURCE, />\s*Confidence\s*</);
    assert.match(CONFIDENCE_UNIT_SOURCE, /\{formatConfidenceValue\(score\)\}/);
  });

  it("resolves its qualifying threshold from the live calibration mirror, not a literal", () => {
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /import\s*\{\s*CONFIDENCE_THRESHOLD_BY_ASSET_TYPE\s*\}\s*from\s*"\.\.\/\.\.\/lib\/advisorReview"/,
    );
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /CONFIDENCE_THRESHOLD_BY_ASSET_TYPE\[assetType\]/,
    );
  });

  it("positions the meter's fill and tick from computed percentages, not literals", () => {
    assert.match(CONFIDENCE_UNIT_SOURCE, /\$\{fillPercent\}%/);
    assert.match(CONFIDENCE_UNIT_SOURCE, /\$\{tickPercent\}%/);
  });

  it("renders its note through buildConfidenceNote", () => {
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /\{buildConfidenceNote\(assetType, score, threshold\)\}/,
    );
  });
});

describe("formatScanRowMeta (scan rail row meta, spec §5)", () => {
  it('formats a buy candidate as "Buy · confidence N"', () => {
    assert.equal(formatScanRowMeta("buy", 82.4), "Buy · confidence 82");
  });

  it('formats a sell candidate as "Sell · confidence N", rounding the score', () => {
    assert.equal(formatScanRowMeta("sell", 69.6), "Sell · confidence 70");
  });

  it("degrades gracefully when side or score is missing, without fabricating either", () => {
    assert.equal(formatScanRowMeta(undefined, 82), "Review");
    assert.equal(formatScanRowMeta("buy", undefined), "Buy");
  });
});

describe("MarketScanPanel row wiring (source-pinned — see header comment)", () => {
  it('builds the row meta from formatScanRowMeta, not the old "{side} limit" text', () => {
    const source = readFileSync(
      "src/components/workspace/MarketScanPanel.tsx",
      "utf8",
    );
    assert.match(source, /formatScanRowMeta\(/);
    assert.doesNotMatch(source, /\$\{candidate\.side\}\s*limit/);
  });
});

describe("AdvisorRecommendationPanel wiring (source-pinned — see header comment)", () => {
  it("wires ConfidenceUnit into the stage in place of the old bare-number cell and gauge", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    assert.match(source, /<ConfidenceUnit\b/);
    assert.doesNotMatch(source, /<ConfidenceGauge\b/);
    assert.doesNotMatch(source, /\{Math\.round\(setup\.confidenceScore\)\}%/);
  });

  // Spec §7: the bundled "Copy levels" button and its levelSummary
  // clipboard plumbing are gone — per-value copy replaces both.
  it('removes the bundled "Copy levels" button and its levelSummary plumbing', () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    assert.doesNotMatch(source, /Copy levels/);
    assert.doesNotMatch(source, /levelSummary/);
    // The lucide Clipboard icon powered only that button; navigator's own
    // lowercase `clipboard` API is unrelated and stays.
    assert.doesNotMatch(source, /\bClipboard\b/);
  });

  it('labels the ladder rows exactly "Target 1 · bank half" and "Target 2 · take-profit" (spec §7)', () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    assert.match(source, /label="Target 1 · bank half"/);
    assert.match(
      source,
      /label=\{hasLadder \? "Target 2 · take-profit" : "Target"\}/,
    );
    // The retired labels don't linger anywhere in the file.
    assert.doesNotMatch(source, /First target/);
    assert.doesNotMatch(source, /Second target/);
  });

  // Spec §7: each ladder value copies on its own, writing exactly the raw
  // value string — no label, side, or symbol stitched on the way the old
  // "Copy levels" summary line did. No jsdom in this repo's unit-test
  // stack (see the file header comment above), so there's no live
  // navigator.clipboard to mock and no click to dispatch; instead this
  // pins the one writeText call site to a bare `value` argument, and pins
  // each row's onCopy to hand it the exact same formatNumber(...) string
  // that row renders as its value prop — what you see is what you copy.
  it("copies exactly the raw formatted value per row, through a single writeText(value) call site", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    const writeTextCalls =
      source.match(/navigator\.clipboard\?\.writeText\([^)]*\)/g) ?? [];
    assert.deepEqual(
      writeTextCalls,
      ["navigator.clipboard?.writeText(value)"],
      "expected exactly one clipboard write site, taking the bare handler parameter",
    );
    assert.match(
      source,
      /onCopy=\{\(\) => handleCopy\("entry", formatNumber\(setup\.entryPrice\)\)\}/,
    );
    assert.match(
      source,
      /onCopy=\{\(\) => handleCopy\("stop", formatNumber\(setup\.stopLoss\)\)\}/,
    );
    assert.match(
      source,
      /onCopy=\{\(\) => handleCopy\("target1", formatNumber\(setup\.takeProfit1!\)\)\}/,
    );
    assert.match(
      source,
      /onCopy=\{\(\) => handleCopy\("target2", formatNumber\(setup\.takeProfit\)\)\}/,
    );
  });

  it("flips each copy affordance to a checkmark for a bounded window, keyed per row", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    // Real button semantics (spec §7: keyboard accessible), not a div.
    assert.match(source, /<button\b[^>]*\bclassName="cpv-copy"/);
    // The ✓ state is transient (~2s) and keyed by field via copiedField,
    // not a single flag — copying one row never shows a false ✓ on
    // another, and the icon swap reads straight off that same state.
    assert.match(
      source,
      /window\.setTimeout\(\(\) => setCopiedField\(null\), 2000\)/,
    );
    assert.match(
      source,
      /\? <Check aria-hidden="true" className="h-4 w-4 text-buy" \/>/,
    );
    assert.match(
      source,
      /: <Copy aria-hidden="true" className="h-4 w-4" \/>/,
    );
  });
});
