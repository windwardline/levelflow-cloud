import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Spec §16, "Review discipline (new, standing)": every review of composition
// work must verify BOTH directions against the mock — required elements
// present AND kill-list elements absent. The 2026-07-31 ship failed because
// reviews only ever checked the first direction, so the legacy stage furniture
// survived inside the new grid ("still the box-on-box formatting").
//
// This file is that discipline as CI enforcement, same shape as
// tests/overviewPanelRemoved.test.ts: the composition authority is
// docs/design/mockups/a-desk-v3.html (stage :161-213, scan rail :87-158), and
// the assertions below read source text because this repo's unit stack has no
// jsdom (see tests/confidenceUnit.test.tsx's header for the established
// technique). The e2e spec covers what only a real browser can.
const STAGE = "src/components/workspace/AdvisorWorkspace.tsx";
const PANEL = "src/components/workspace/AdvisorRecommendationPanel.tsx";
const RECEIPT = "src/components/workspace/SetupQualityReceipt.tsx";
const RAIL = "src/components/workspace/MarketScanPanel.tsx";
const CHART = "src/components/charts/MarketChart.tsx";
const DELETED_STATUS_PANELS = "src/components/workspace/AdvisorStatusPanels.tsx";
const DELETED_METRIC_ROW = "src/components/workspace/AdvisorMetricRow.tsx";

const stage = readFileSync(STAGE, "utf8");
const panel = readFileSync(PANEL, "utf8");
const receipt = readFileSync(RECEIPT, "utf8");
const chart = readFileSync(CHART, "utf8");

function allSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

describe("Desk stage composition — the mock's elements are present (a-desk-v3.html:161-213)", () => {
  it("leads with the market picker as the stagehead's display heading, no visible field caption", () => {
    assert.match(stage, /<ScopeMenu\b[\s\S]{0,400}variant="heading"/);
    assert.match(stage, /<ScopeMenu\b[\s\S]{0,400}showLabel=\{false\}/);
    assert.match(stage, /<ScopeMenu\b[\s\S]{0,400}symbolOnly/);
  });

  it("tags the side beside the heading, only while a setup is showing", () => {
    assert.match(
      stage,
      /\{setup\s*\n?\s*\?[\s\S]{0,400}\{setup\.side === "buy" \? "Buy" : "Sell"\} limit/,
    );
  });

  it("renders the confidence unit under the heading with both stamps folded into its meta line", () => {
    assert.match(stage, /reviewedAt=\{reviewedAt\}/);
    assert.match(stage, /validUntil=\{setup\.expiresAt \?\? null\}/);
  });

  it("keeps Review market as the stage's one action, beside the chart-view control", () => {
    assert.match(stage, /className="primary-button"[\s\S]{0,600}Review market/);
    assert.match(stage, /aria-label="Chart view"/);
  });

  it("attaches the setup sheet hairline-flush under the chart sheet — one frame each, no gap", () => {
    // The chart draws its own square-cornered sheet so the setup sheet's
    // border-t-0 lands on it; a rounded chart frame would leave a visible
    // corner gap and read as two stacked cards again.
    assert.match(
      chart,
      /className="relative min-w-0 overflow-hidden border border-hairline bg-sheet"/,
    );
    assert.match(
      stage,
      /className="min-w-0 border border-hairline border-t-0 bg-sheet"[\s\S]{0,200}<RecommendationPanel/,
    );
  });

  it("splits the setup sheet into the ladder and Why this setup, hairline-divided", () => {
    assert.match(panel, /className="grid min-w-0 lg:grid-cols-\[1\.1fr_0\.9fr\]"/);
    assert.match(panel, /lg:border-b-0 lg:border-r/);
    assert.match(panel, /<SetupQualityReceipt\b/);
  });

  it("keeps the closed-market reopen notice on the stage, unchanged (spec §10b)", () => {
    assert.match(stage, /\{marketNotice\}/);
    assert.match(stage, /Closed · opens \$\{/);
  });
});

describe("Desk stage composition — the kill list is absent (spec §16)", () => {
  it("deletes AdvisorStatusPanels.tsx and AdvisorMetricRow.tsx outright", () => {
    assert.equal(existsSync(DELETED_STATUS_PANELS), false);
    assert.equal(existsSync(DELETED_METRIC_ROW), false);
  });

  it("leaves no import of DeskStatusStrip, MarketClockPanel or MetricRow anywhere in src", () => {
    // Prose in comments may still explain what was retired and why; what must
    // never come back is a real reference that renders one.
    const offenders = allSourceFiles("src").filter((file) => {
      const source = readFileSync(file, "utf8");
      return /from "\.\/AdvisorStatusPanels"|from "\.\/AdvisorMetricRow"/.test(
        source,
      ) ||
        /<DeskStatusStrip\b|<MarketClockPanel\b|<MetricRow\b/.test(source);
    });
    assert.deepEqual(offenders, []);
  });

  it("keeps market-session clocks out of every rendered component (GLOBAL FX SESSION cards are gone)", () => {
    // marketSessions.ts stays for the engine-facing unit tests that pin its
    // calendars (tests/core.test.ts); nothing on a surface may render it.
    const offenders = allSourceFiles("src/components").filter((file) =>
      readFileSync(file, "utf8").includes('from "../../lib/marketSessions"')
    );
    assert.deepEqual(offenders, []);
  });

  it("carries no CHART VIEW / ADVISOR CHECKS / VALID UNTIL metric cards", () => {
    assert.doesNotMatch(stage, /AdvisorReviewScope/);
    assert.doesNotMatch(stage, /Advisor checks/);
    assert.doesNotMatch(stage, /advisorChartViewLabel/);
    // "Valid until" survives only as the confidence meta line's own wording,
    // built inside ConfidenceUnit — never as a labeled card on the stage.
    assert.doesNotMatch(stage, /Valid until/);
    assert.doesNotMatch(panel, /label="Valid until"/);
  });

  it("carries no standalone stage Refresh button — Review market is the one action", () => {
    assert.doesNotMatch(stage, /RefreshCw/);
    assert.doesNotMatch(stage, />\s*Refresh\s*</);
  });

  it("carries no Latest close metric box and no duplicated market heading", () => {
    assert.doesNotMatch(stage, /Latest close/);
    assert.doesNotMatch(stage, /formatPrice\(/);
    assert.doesNotMatch(stage, /<h3\b/);
  });

  it("boxes nothing on the stage — no terminal-panel, no card frames inside the sheets", () => {
    for (const source of [stage, panel, receipt]) {
      assert.doesNotMatch(source, /terminal-panel/);
      assert.doesNotMatch(source, /rounded-lg border border-hairline bg-paper/);
      assert.doesNotMatch(source, /rounded-lg border border-hairline bg-sheet/);
    }
  });

  it("keeps the stage's own status tiles gone (DATA / SESSION / ADVISOR / MARKET HISTORY)", () => {
    for (const label of ["Market history", "Fresh review", "Local clock", "Awaiting price"]) {
      assert.ok(
        !stage.includes(label),
        `the retired status strip's "${label}" tile must not reappear on the stage`,
      );
    }
    // Its data source went with it: the stage no longer takes per-symbol stats.
    assert.doesNotMatch(stage, /setupStats/);
    assert.doesNotMatch(readFileSync("src/App.tsx", "utf8"), /setupStats/);
  });
});

describe("progressive disclosure survives the kill list", () => {
  it("keeps a cost-ratings How this works link now that the rail's legend box is gone", () => {
    const linked = allSourceFiles("src/components").some((file) =>
      /anchor="cost-ratings"/.test(readFileSync(file, "utf8"))
    );
    assert.ok(
      linked,
      "deleting the scan rail's legend must not orphan the Guide's Costs section",
    );
    assert.match(receipt, /anchor: "cost-ratings"/);
  });

  it("keeps a confidence-tiers link beside the confidence unit it explains", () => {
    assert.match(
      readFileSync("src/components/workspace/ConfidenceUnit.tsx", "utf8"),
      /<HowThisWorksLink anchor="confidence-tiers" \/>/,
    );
  });

  it("keeps the scan rail's own row-level cost explanation reachable on hover", () => {
    assert.match(readFileSync(RAIL, "utf8"), /describeExecutionLabel\(/);
  });
});
