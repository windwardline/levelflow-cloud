import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildConfidenceMeta,
  buildConfidenceNote,
  clampConfidencePercent,
  formatConfidenceValue,
} from "../src/components/workspace/ConfidenceUnit";
import { formatCompactDateTime } from "../src/lib/marketHours";
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

// Spec §16 folds the killed VALID UNTIL metric card's datum into the
// confidence unit's own meta line. Both halves are optional: a scan-selected
// candidate has no review stamp until Review runs, and a setup without
// an expiry has no window to print.
describe("buildConfidenceMeta", () => {
  const REVIEWED = "2026-07-31T14:05:00.000Z";
  const EXPIRES = "2026-07-31T18:05:00.000Z";
  // The stamp's own formatter, imported rather than reconstructed: spec §17
  // requires this line to share its time grammar with the scope menu's OPENS
  // lines, and reading it from marketHours is what proves the two are one
  // implementation instead of two that happen to agree today.
  const shown = (value: string) => formatCompactDateTime(new Date(value));

  it("renders both stamps as one line, review first", () => {
    assert.equal(
      buildConfidenceMeta(REVIEWED, EXPIRES),
      `Reviewed ${shown(REVIEWED)} · valid until ${shown(EXPIRES)}`,
    );
  });

  // Spec §17, the grammar itself: `{MMM} {D} {h}:{mm}{A|P}` — three-letter
  // month in caps, 1-2 digit day, minutes always two digits, a single capital
  // meridiem letter with NO space before it ("Reviewed JUL 31 2:05P · valid
  // until JUL 31 10:05P"). Pinned as a regex over the whole assembled line so
  // a drift in any single piece — a padded day, a lowercase meridiem, a space
  // before it, a four-digit year creeping in — fails here.
  it("matches spec §17's stamp grammar exactly, both halves", () => {
    const STAMP = String.raw`[A-Z]{3} \d{1,2} \d{1,2}:\d{2}[AP]`;
    assert.match(
      buildConfidenceMeta(REVIEWED, EXPIRES),
      new RegExp(`^Reviewed ${STAMP} · valid until ${STAMP}$`),
    );
    assert.match(
      buildConfidenceMeta(REVIEWED, null),
      new RegExp(`^Reviewed ${STAMP}$`),
    );
    assert.match(
      buildConfidenceMeta(null, EXPIRES),
      new RegExp(`^Valid until ${STAMP}$`),
    );
  });

  it("drops the missing half instead of printing an empty or invented one", () => {
    assert.equal(
      buildConfidenceMeta(REVIEWED, null),
      `Reviewed ${shown(REVIEWED)}`,
    );
    assert.equal(
      buildConfidenceMeta(null, EXPIRES),
      `Valid until ${shown(EXPIRES)}`,
    );
  });

  it("returns an empty string when there is nothing to stamp, so no line renders at all", () => {
    assert.equal(buildConfidenceMeta(null, null), "");
  });

  // A stamp is a claim about a moment. An unparseable timestamp has no moment
  // to name, so the half drops out exactly like an absent one rather than
  // printing a placeholder ("Reviewed Awaiting refresh") where a real date
  // belongs — which is what the old formatTimestamp path did here.
  it("drops an unparseable timestamp instead of stamping a placeholder", () => {
    assert.equal(buildConfidenceMeta("not-a-date", EXPIRES), `Valid until ${shown(EXPIRES)}`);
    assert.equal(buildConfidenceMeta(REVIEWED, "not-a-date"), `Reviewed ${shown(REVIEWED)}`);
    assert.equal(buildConfidenceMeta("not-a-date", "not-a-date"), "");
  });

  it("shares one formatter with the scope menu's OPENS lines, never its own Intl call", () => {
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /import \{ formatCompactDateTime \} from "\.\.\/\.\.\/lib\/marketHours";/,
    );
    assert.doesNotMatch(CONFIDENCE_UNIT_SOURCE, /Intl\.DateTimeFormat/);
    assert.doesNotMatch(CONFIDENCE_UNIT_SOURCE, /formatTimestamp/);
  });
});

describe("ConfidenceUnit component shape (source-pinned — see header comment)", () => {
  it('labels the value "Confidence" and renders it through the value formatter, never a bare number', () => {
    assert.match(CONFIDENCE_UNIT_SOURCE, />\s*Confidence\s*</);
    assert.match(CONFIDENCE_UNIT_SOURCE, /\{formatConfidenceValue\(score\)\}/);
  });

  // Spec §16: the unit sits on the stagehead's bare paper, not in a card —
  // the bordered/filled wrapper it used to draw was part of the box-on-box
  // the owner rejected. The meter's own hairline track and accent fill stay
  // (pinned below); what must not come back is a frame around the whole unit.
  it("draws no card of its own — no border, no paper fill around the unit", () => {
    const root = CONFIDENCE_UNIT_SOURCE.match(
      /return \(\n\s*<div className="([^"]*)"/,
    )?.[1] ?? "";
    assert.ok(root.length > 0, "expected to find the component's root div");
    assert.doesNotMatch(root, /\bborder\b/);
    assert.doesNotMatch(root, /\bbg-paper\b/);
    assert.doesNotMatch(root, /\brounded/);
  });

  it("renders the meta line only when there is something to stamp", () => {
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /\{meta\s*\n?\s*\?[\s\S]{0,200}\{meta\}/,
    );
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /const meta = buildConfidenceMeta\(reviewedAt, validUntil\);/,
    );
  });

  it("resolves its qualifying threshold from the live calibration mirror, not a literal", () => {
    // 1g tightened the same intent this pin always held: the mirror is the
    // symbol-first resolver now, because the class table alone showed corn
    // a Futures bar the engine never applied to it.
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /import\s*\{\s*confidenceThresholdForAssetOrSymbol\s*\}\s*from\s*"\.\.\/\.\.\/lib\/advisorReview"/,
    );
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /confidenceThresholdForAssetOrSymbol\(symbol, assetType\)/,
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
    // The defensive sideless fallback is the app-wide absent-value dash —
    // never a retired verb (§17m.4 review fix).
    assert.equal(formatScanRowMeta(undefined, 82), "\u2014");
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

  // m2: spec §2's universal scrollbar treatment applies to every scrollable
  // column, the scan rail's own results list included. Spec §16 recomposed
  // that list — hairline-separated rows instead of gapped cards, capped at the
  // mock's own 404px menu height (a-desk-v3.html:21) — but the .scrolly
  // treatment and the overflow that makes it visible both stay. Fix wave 2C
  // appended the mobile mock's own arrangement (m-scan-v1.html:45-51: cards
  // stacked down a scrolling page rather than a nested scroller) behind
  // `max-lg:`, which leaves this ≥lg contract exactly where it was.
  it("gives the results list the .scrolly thin-scrollbar treatment (m2)", () => {
    const source = readFileSync(
      "src/components/workspace/MarketScanPanel.tsx",
      "utf8",
    );
    assert.match(
      source,
      /className="scrolly mt-2 max-h-\[404px\] overflow-y-auto max-lg:/,
    );
  });

  // m3: spec §5's rail has no band filter, and letting one hide rows made
  // the visible list disagree with the server-truth scanned/qualified count
  // line — the legacy Quality filter (and its confidence-banding state) is
  // fully retired, not just hidden.
  it("no longer offers a Quality band filter (m3)", () => {
    const source = readFileSync(
      "src/components/workspace/MarketScanPanel.tsx",
      "utf8",
    );
    assert.doesNotMatch(source, /\bQuality\b/);
    assert.doesNotMatch(source, /CONFIDENCE_BANDS/);
    assert.doesNotMatch(source, /confidenceBand/i);
  });
});

describe("AdvisorRecommendationPanel wiring (source-pinned — see header comment)", () => {
  // Spec §16 moved the confidence unit out of this panel and up into the
  // stagehead, directly under the market heading (a-desk-v3.html:168-173) —
  // so the "wired in, never a bare number" contract now belongs to
  // AdvisorWorkspace, and this panel must no longer render one of its own
  // (two confidence units on one stage is exactly the duplication the
  // recomposition removes).
  it("wires ConfidenceUnit into the stagehead, never a bare number, and never a second copy in the panel", () => {
    const stage = readFileSync(
      "src/components/workspace/AdvisorWorkspace.tsx",
      "utf8",
    );
    const panel = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    assert.match(stage, /<ConfidenceUnit\b/);
    assert.match(stage, /score=\{setup\.confidenceScore\}/);
    assert.doesNotMatch(panel, /<ConfidenceUnit\b/);
    for (const source of [stage, panel]) {
      assert.doesNotMatch(source, /<ConfidenceGauge\b/);
      assert.doesNotMatch(source, /\{Math\.round\(setup\.confidenceScore\)\}%/);
    }
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

  // m1: the ✓ must be success-conditional, not a synchronous UI flip
  // independent of whether the clipboard write actually resolved.
  it("only flips a field's copy state on a resolved navigator.clipboard.writeText, never unconditionally (m1)", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    const handleCopyBlock = source.match(
      /async function handleCopy\([\s\S]*?\n  \}/,
    )?.[0] ?? "";
    assert.match(handleCopyBlock, /await navigator\.clipboard\.writeText\(value\);/);
    assert.doesNotMatch(source, /void navigator\.clipboard\?\.writeText/);
    // m1 asserted `catch { return; }`, which proved the tick never appears on a
    // rejection — and let the PREVIOUS row's tick stand through one. Silence
    // after a tap reads as success, so a failure must settle the state rather
    // than leave it. Both failure paths therefore call settle(false), and the
    // stronger property is that neither returns without settling first.
    assert.match(handleCopyBlock, /if \(!navigator\.clipboard\) \{\s*settle\(false\);/);
    assert.match(handleCopyBlock, /catch \{\s*settle\(false\);/);
    assert.match(handleCopyBlock, /settle\(true\);/);
    assert.doesNotMatch(handleCopyBlock, /catch \{\s*return;\s*\}/);
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

  // Spec §7: each ladder value copies on its own — but NOT the displayed
  // string. formatNumber's `toLocaleString(undefined, ...)` defers to the
  // runtime locale: any value >= 1000 gains a thousands separator
  // ("117,240"), and under de-DE the decimal itself swaps to a comma —
  // either way the payload corrupts on paste into a broker's price field,
  // the entire point of this feature (fix round 1). Every row must route
  // its clipboard payload through formatCopyValue instead — deterministic,
  // en-US, ungrouped — while `value` (what's rendered) stays on
  // formatNumber for a readable on-screen number. No jsdom in this repo's
  // unit-test stack (see the file header comment above), so there's no
  // live navigator.clipboard to mock and no click to dispatch; this pins
  // the one writeText call site to a bare `value` argument, pins each
  // row's onCopy to formatCopyValue specifically, and confirms
  // formatNumber never leaks into a handleCopy(...) call. m1 dropped the
  // optional-chained `navigator.clipboard?.writeText` for an explicit
  // `if (!navigator.clipboard) return;` guard ahead of an awaited call, so
  // the ✓ can be made conditional on the write's own resolution.
  it("copies each value through formatCopyValue, never formatNumber, via a single writeText(value) call site", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    // formatTimestamp left this file with the "Valid until" ladder row, which
    // spec §16 folds into the stagehead's confidence meta line instead.
    assert.match(
      source,
      /import \{ formatCopyValue, formatNumber \} from "\.\/advisorFormat";/,
    );
    const writeTextCalls =
      source.match(/navigator\.clipboard\.writeText\([^)]*\)/g) ?? [];
    assert.deepEqual(
      writeTextCalls,
      ["navigator.clipboard.writeText(value)"],
      "expected exactly one clipboard write site, taking the bare handler parameter",
    );
    assert.match(
      source,
      /onCopy=\{\(\) => handleCopy\("entry", "Limit entry", formatCopyValue\(setup\.entryPrice\)\)\}/,
    );
    assert.match(
      source,
      /onCopy=\{\(\) => handleCopy\("stop", "Stop loss", formatCopyValue\(setup\.stopLoss\)\)\}/,
    );
    assert.match(
      source,
      /onCopy=\{\(\) => handleCopy\("target1", "Target 1", formatCopyValue\(setup\.takeProfit1!\)\)\}/,
    );
    assert.match(
      source,
      /onCopy=\{\(\) => handleCopy\("target2", hasLadder \? "Target 2" : "Target", formatCopyValue\(setup\.takeProfit\)\)\}/,
    );
    // Belt and suspenders: no handleCopy(...) call anywhere reaches for
    // formatNumber, the locale-dependent display formatter, by name.
    assert.doesNotMatch(source, /handleCopy\([^)]*formatNumber/);
    // formatNumber is still very much in the file — for `value=` display
    // props — exactly five times since §19d: the four price rows and the Size
    // row, which keeps the same display/payload split every other row has.
    const displayFormatNumberCalls =
      source.match(/value=\{formatNumber\(/g) ?? [];
    assert.equal(displayFormatNumberCalls.length, 5);
    assert.match(source, /const payload = formatCopyValue\(size\.units\);[\s\S]*?onCopy=\{\(\) => onCopy\(payload\)\}/);
  });

  it("flips each copy affordance to a checkmark for a bounded window, keyed per row", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorRecommendationPanel.tsx",
      "utf8",
    );
    // Real button semantics (spec §7: keyboard accessible), not a div. Fix
    // wave 2C grew the mobile mock's bordered "⧉ Copy" button
    // (m-mobile-v3.html:28) out of this same control, so the className is now
    // a copied/idle pair — both branches keep .cpv-copy as their base, which
    // is what leaves the ≥lg icon affordance (44px target, negative margin,
    // muted tone) exactly as it was.
    const copyButtonTag = source.match(/<button\b[^>]*\bonClick=\{onCopy\}/)?.[0] ??
      "";
    assert.ok(copyButtonTag.length > 0, "expected the ladder's copy button");
    assert.equal((copyButtonTag.match(/\bcpv-copy\b/g) ?? []).length, 1);
    // The ✓ state is transient (~2s) and keyed by VALUE, not by field name.
    // Keyed by name it outlived what it described: a scan-row tap swaps the
    // setup on this same instance, so the ladder became another market's while
    // the Entry row still read "Copied" beside the previous market's number in
    // the clipboard. The token carries symbol and value, so a tick can only
    // survive while the exact number it described is still on screen.
    assert.match(
      source,
      /const tokenFor = \(field: string, value: string\) =>\s*`\$\{symbol\}:\$\{field\}:\$\{value\}`/,
    );
    assert.doesNotMatch(source, /copiedField/);
    assert.match(source, /setCopiedToken\(null\);\s*setFailedToken\(null\);\s*\}, 2000\)/);
    assert.match(
      source,
      /\? <Check aria-hidden="true" className="h-4 w-4 text-buy" \/>/,
    );
    assert.match(
      source,
      /: <Copy aria-hidden="true" className="h-4 w-4" \/>/,
    );
    // The third state. A rejected write must not look like an untouched row.
    assert.match(
      source,
      /<XCircle aria-hidden="true" className="h-4 w-4 text-sell" \/>/,
    );
    assert.match(source, /\{copied \? "Copied" : failed \? "Not copied" : "Copy"\}/);
    // The only non-visual channel: one polite region for the whole panel, so
    // sequential copies read in order instead of racing one name change.
    assert.match(source, /aria-live="polite" className="sr-only" role="status"/);
  });
});

// 1g's second instance: the meter's tick and the ≥lg note drew the threshold
// from the DISPLAY-type table, while the engine gated the same setup through
// the symbol-first resolver — so a corn setup drew its tick at Futures' 68
// and read "Futures setups must score 68 to qualify" while the engine
// accepted it at agriculture's 30. historyUtils already routes symbol-first
// (its :138); the stage's own meter now does the same.
describe("the meter's threshold is the engine's, resolved symbol-first", () => {
  it("resolves through confidenceThresholdForAssetOrSymbol, never the class table directly", () => {
    assert.match(
      CONFIDENCE_UNIT_SOURCE,
      /confidenceThresholdForAssetOrSymbol\(symbol, assetType\)/,
    );
    assert.doesNotMatch(
      CONFIDENCE_UNIT_SOURCE,
      /CONFIDENCE_THRESHOLD_BY_ASSET_TYPE\[assetType\]/,
    );
    assert.match(CONFIDENCE_UNIT_SOURCE, /symbol: string;/);
  });

  it("is fed the symbol at both stage mounts", () => {
    const stage = readFileSync(
      "src/components/workspace/AdvisorWorkspace.tsx",
      "utf8",
    );
    const mounts = stage.match(/<ConfidenceUnit\b[\s\S]{0,300}?\/>/g) ?? [];
    assert.equal(mounts.length, 2);
    for (const mount of mounts) {
      assert.match(mount, /symbol=\{selectedAsset\.symbol\}/, mount);
    }
  });
});
