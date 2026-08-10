import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// AdvisorRecommendationPanel.tsx is a real src/ interactive component
// (handleCopy is a click handler) — the same category CurrentTradesRail.tsx
// and ScopeMenu.tsx are, and this repo's own test files for those document
// why they don't render it: no jsdom in this unit-test stack, and this
// runner's esbuild JSX transform breaks with "React is not defined" on any
// real src/ component's own JSX body when actually rendered. So this suite
// pins the basis line the same way tests/currentTradesRail.test.ts and
// tests/scopeMenu.test.tsx pin JSX-only facts: against the real source text.
// The arithmetic itself (adjustedEntryFor) is a pure function and gets real
// unit tests in tests/brokerOffsets.test.ts.
const PANEL_PATH = "src/components/workspace/AdvisorRecommendationPanel.tsx";
const source = readFileSync(PANEL_PATH, "utf8");

// Depth-counted, not a `[^)]*` regex: every real call site here wraps a
// nested call (`handleCopy("entry", formatCopyValue(setup.entryPrice))`), so
// a regex that stops at the first `)` would truncate mid-argument-list and
// silently miss anything appended after the nested call's own close-paren —
// which is exactly the shape a real copy-payload leak would take.
function callArguments(source: string, calleeName: string): string[] {
  const argLists: string[] = [];
  const opener = new RegExp(`\\b${calleeName}\\(`, "g");
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
      i++;
    }
    argLists.push(source.slice(start, i - 1));
  }
  return argLists;
}

describe("the basis line (owner ruling, amendment 23's offset extension, 2026-08-05)", () => {
  it("computes the line from offsets.ts's own functions, not a re-derived constant", () => {
    assert.match(
      source,
      /import\s*\{[^}]*adjustedEntryFor[^}]*\}\s*from\s*"..\/..\/lib\/broker\/offsets"/,
    );
    assert.match(source, /adjustedEntryFor\(/);
    assert.match(source, /getBrokerOffset\(/);
    // The setup on stage is what feeds the computation — not a hardcoded
    // symbol or a re-derived entry from somewhere else.
    assert.match(source, /formatBasisLine\(setup\.symbol, setup\.entryPrice\)/);
  });

  it("renders the owner-approved template words, verbatim", () => {
    // Template: "E8 quotes ~+0.17 above this feed — entry there ≈ 57.97" —
    // the two numbers are live-computed data; these words are the copy.
    assert.match(source, /E8 quotes ~\+/);
    assert.match(source, /above this feed — entry there ≈/);
  });

  it("is staged from the setup on the surface, after the ladder instruction and before the correlation note", () => {
    const setupGuardIndex = source.indexOf("if (setup) {");
    const computationIndex = source.indexOf(
      "formatBasisLine(setup.symbol, setup.entryPrice)",
    );
    // The render position (not the hoisted `const basisLine = ...`
    // computation, which necessarily sits earlier alongside the ladder's
    // other precomputed values like `hasLadder`/`rewardRisk`): the JSX
    // block that actually places the line in the ladder's register.
    const renderBlockIndex = source.indexOf("{basisLine\n");
    const ladderInstructionBlockIndex = source.indexOf(
      "{LADDER_TARGET_INSTRUCTION}",
    );
    const correlationBlockIndex = source.indexOf("setup.correlationGroup");
    for (
      const [label, index] of [
        ["the setup guard", setupGuardIndex],
        ["the ladder instruction", ladderInstructionBlockIndex],
        ["the basis line's own computation", computationIndex],
        ["the basis line's render block", renderBlockIndex],
        ["the correlation-group note", correlationBlockIndex],
      ] as const
    ) {
      assert.notEqual(index, -1, `expected to find ${label} in the source`);
    }
    assert.ok(
      setupGuardIndex < computationIndex,
      "the basis line must be computed inside the staged-setup branch",
    );
    assert.ok(
      ladderInstructionBlockIndex < renderBlockIndex &&
        renderBlockIndex < correlationBlockIndex,
      "the basis line must render after the ladder instruction and before the correlation note",
    );
  });

  it("renders in the ladder's muted register, both widths, no box", () => {
    const basisParagraphMatch = source.match(
      /<p className="([^"]*text-ink-muted[^"]*)">\s*\{basisLine\}/,
    );
    assert.ok(
      basisParagraphMatch,
      "expected a muted <p> rendering the {basisLine} variable",
    );
    const [, className] = basisParagraphMatch!;
    assert.match(className, /text-ink-muted/, "must be the muted register");
    assert.match(className, /\blg:/, "must carry a desktop-width class");
    assert.doesNotMatch(
      className,
      /\bborder(?:-[a-z0-9-]+)?\b|\bring(?:-[a-z0-9-]+)?\b|\boutline(?:-[a-z0-9-]+)?\b|\bshadow-\[/,
      "the basis line must render with no box (§17c box-on-box sweep)",
    );
  });

  it("never enters the copy action's payload", () => {
    // A naive `/callee\(([^)]*)\)/` regex stops at the FIRST close-paren, so
    // it silently truncates at formatCopyValue's own closing paren and never
    // sees anything concatenated after it inside the same handleCopy call —
    // exactly the shape a real violation would take
    // (`formatCopyValue(setup.entryPrice) + basisLine`). Depth-counted
    // extraction is what actually proves the whole argument list is clean.
    for (const callee of ["handleCopy", "formatCopyValue"]) {
      const argLists = callArguments(source, callee);
      assert.ok(argLists.length > 0, `expected ${callee} call sites to check`);
      for (const args of argLists) {
        assert.doesNotMatch(args, /basisLine|adjustedEntry/);
      }
    }
  });

  it("never renders through a copyable row (no onCopy wiring anywhere near it)", () => {
    // The basis line is a bare muted <p>, never a CopyableMetricRow — so
    // there is no copy affordance on it to begin with, structurally.
    const basisBlockMatch = source.match(
      /\{basisLine\s*\n?\s*\?\s*\(([\s\S]*?)\)\s*\n?\s*:\s*null\}/,
    );
    assert.ok(basisBlockMatch, "expected the basisLine conditional block");
    assert.doesNotMatch(basisBlockMatch![1], /onCopy|CopyableMetricRow/);
  });
});

describe("the basis line never reaches the chart (owner ruling item 1, second prohibition)", () => {
  const chartFiles = [
    "src/components/charts/MarketChart.tsx",
    "src/components/charts/ExpandedChartOverlay.tsx",
  ];

  for (const file of chartFiles) {
    it(`${file} carries no reference to the offsets module or the adjusted entry`, () => {
      const chartSource = readFileSync(file, "utf8");
      assert.doesNotMatch(chartSource, /broker\/offsets/);
      assert.doesNotMatch(chartSource, /adjustedEntryFor|getBrokerOffset|basisLine/);
    });
  }
});

// 1l + 1q (2026-08-09): the ladder's honesty at the edges of its validity.
describe("expired setups lose their copy affordances; the payoff names its basis", () => {
  const SOURCE = readFileSync(
    "src/components/workspace/AdvisorRecommendationPanel.tsx",
    "utf8",
  );

  it("gates every copy affordance on the review window (§17c: absent, never inert)", () => {
    assert.match(SOURCE, /now: Date;/);
    // Widened 2026-08-09 (the owner's simple-rules directive): stored
    // reopens gate through copyWindowEndsAt, derived for the gate and
    // printed nowhere — §17f keeps the stamp, §17c gets the control.
    assert.match(
      SOURCE,
      /const copyWindowEnd = setup\.expiresAt \?\? setup\.copyWindowEndsAt;/,
    );
    assert.match(
      SOURCE,
      /const copyExpired = typeof copyWindowEnd === "string" &&\s*\n\s*new Date\(copyWindowEnd\)\.getTime\(\) <= now\.getTime\(\);/,
    );
    // All five rows — four prices and Size — consult the same bit; a sixth
    // copyable row added without the gate fails the count.
    const gated = SOURCE.match(/onCopy=\{copyExpired \? undefined :/g) ?? [];
    assert.equal(gated.length, 5);
    // The stage feeds the ticking clock at both mounts.
    const stage = readFileSync(
      "src/components/workspace/AdvisorWorkspace.tsx",
      "utf8",
    );
    const mounts = stage.match(/<RecommendationPanel\b[\s\S]{0,400}?\/>/g) ?? [];
    assert.equal(mounts.length, 2);
    for (const mount of mounts) {
      assert.match(mount, /now=\{clockNow\}/, mount);
    }
  });

  it("names the payoff's basis in the eyebrow, and the receipt carries the reconciling number", () => {
    assert.match(SOURCE, /The setup · payoff after costs\{" "\}/);
    const receipt = readFileSync(
      "src/components/workspace/SetupQualityReceipt.tsx",
      "utf8",
    );
    assert.match(receipt, /estimatedRoundTripCost/);
    assert.match(receipt, /already inside the payoff figure\./);
  });
});
