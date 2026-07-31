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
const TRADES_RAIL = "src/components/workspace/CurrentTradesRail.tsx";
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

  // Fix round 1: the stamp is a provenance claim, so only a real review may set
  // it. A setup lifted out of a scan result keeps null — that scan may have run
  // an hour before the row was clicked, and neither AnalyzerSetup nor
  // MarketScanCandidate carries a creation timestamp, so there is no honest
  // review time to print. This also keeps ConfidenceUnit's documented and
  // tested "drops the missing half" branch reachable in the app, which it was
  // not while every analysis state stamped Date.now().
  it("stamps the review time only where a review actually ran", () => {
    // Every write of the field, in source order: three inside analyze(), then
    // the scan-selection handler's synthetic state. The trailing comma is what
    // keeps the type declaration (`reviewedAt: number | null;`) out of the set.
    const writes = (stage.match(/reviewedAt: [^,;\n]+,/g) ?? [])
      .map((write) => write.replace(/,$/, ""));
    assert.deepEqual(writes, [
      "reviewedAt: Date.now()",
      "reviewedAt: Date.now()",
      "reviewedAt: Date.now()",
      "reviewedAt: null",
    ]);
    // The scan-selection state is the one that must not claim a review.
    const scanSelected = stage.match(
      /message: "Selected from Market Scan\.",[\s\S]{0,600}?reviewedAt: ([^,\n]+)/,
    );
    assert.ok(scanSelected, "expected the scan-selection analysis state");
    assert.equal(scanSelected[1], "null");
    // And the displayed value is gated on that field, not merely on a setup
    // being present — otherwise the null branch is unreachable again.
    assert.match(
      stage,
      /const reviewedAt = analysisState\?\.symbol === symbol && analysisState\.reviewedAt/,
    );
    // The old always-now field is gone entirely.
    assert.doesNotMatch(stage, /requestedAt/);
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

  it("says nothing on a successful load — the notice speaks only when there is something to say", () => {
    // Spec §2 rules out process narration, and the stage narrated every
    // successful fetch ("{N} 1 hour candles loaded.") long after the
    // remediation deleted every other status readout on this surface. The
    // paragraph is conditional now, so an empty notice leaves no margin
    // behind either.
    assert.doesNotMatch(stage, /candles loaded/);
    assert.match(stage, /setMarketNotice\(""\);/);
    assert.match(
      stage,
      /\{marketNotice\n\s*\? \(\n\s*<p className="mt-3 text-sm font-medium text-ink-muted">/,
    );
  });
});

describe("Desk stage composition — the kill list is absent (spec §16)", () => {
  it("deletes AdvisorStatusPanels.tsx and AdvisorMetricRow.tsx outright", () => {
    assert.equal(existsSync(DELETED_STATUS_PANELS), false);
    assert.equal(existsSync(DELETED_METRIC_ROW), false);
  });

  it("leaves no reference to DeskStatusStrip, MarketClockPanel or MetricRow anywhere in src", () => {
    // Names, not just imports: neither the deleted modules nor the components
    // they exported may be referred to by any surface, comments included.
    const offenders = allSourceFiles("src").filter((file) =>
      /AdvisorStatusPanels|AdvisorMetricRow|DeskStatusStrip|MarketClockPanel/
        .test(readFileSync(file, "utf8"))
    );
    assert.deepEqual(offenders, []);
  });

  it("carries no CHART VIEW / ADVISOR CHECKS / VALID UNTIL metric cards", () => {
    // Case-insensitive on purpose: the killed card titles rendered uppercase
    // via CSS, so a prose mention in either casing would be a live risk of the
    // string creeping back. The stage names none of them, comments included.
    assert.doesNotMatch(stage, /AdvisorReviewScope/i);
    assert.doesNotMatch(stage, /advisor checks/i);
    assert.doesNotMatch(stage, /advisorChartViewLabel/i);
    // "Valid until" survives only as the confidence meta line's own wording,
    // built inside ConfidenceUnit — never as a labeled card here. The stage
    // does legitimately pass a `validUntil` prop down to ConfidenceUnit, so
    // rather than forbidding the identifier (which the previous
    // /valid until/i-only guard let through purely because camelCase has no
    // space), forbid every label-shaped form in any casing or spacing.
    for (const source of [stage, panel]) {
      assert.doesNotMatch(source, /valid until/i);
      assert.doesNotMatch(source, /label[=:]\s*[{"']*\s*valid\s*until/i);
      assert.doesNotMatch(source, />\s*valid\s*until\s*</i);
    }
  });

  it("carries no standalone stage Refresh button — Review market is the one action", () => {
    assert.doesNotMatch(stage, /RefreshCw/);
    assert.doesNotMatch(stage, />\s*Refresh\s*</);
    // Exactly one action lives in the stagehead.
    assert.equal(stage.match(/className="primary-button"/g)?.length, 1);
    assert.doesNotMatch(stage, /secondary-button/);
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

// Completeness audit 2, Findings 1-2 (D2a): the chart was the least-attested
// piece of the stage — unchanged from origin/main except its root className,
// pinned by no test, named by no prior review. It drew three level lines where
// the mock draws four, titled the entry line "BUY LIMIT" where the mock writes
// "ENTRY", mixed Solid/Dashed/Dotted where the mock dashes all four, and
// carried a duplicate Entry/Stop/Target/Payoff strip inside its own frame that
// the mock does not draw and the ladder already owns.
describe("Desk chart level lines — the mock's four labeled lines (a-desk-v3.html:191-194)", () => {
  it("includes Target 1 in the chart's own setup type, so the chart can draw every level the ladder lists", () => {
    // The gap was at the type boundary: ChartSetup's Pick excluded
    // takeProfit1, so the ladder listed four levels and the chart beside it
    // drew three. `side` left with the metric strip below — the mock colors
    // these lines by role (target/entry/stop), never by direction.
    assert.match(
      chart,
      /type ChartSetup = Pick<\s*AnalyzerSetup,\s*"entryPrice" \| "stopLoss" \| "takeProfit" \| "takeProfit1",?\s*>;/,
    );
    assert.doesNotMatch(chart, /"side"/);
  });

  it("draws all four lines uniformly dashed at 2px, per the mock's border-top: 2px dashed", () => {
    // One createPriceLine call mapped over the level list, so the style is
    // uniform by construction rather than by four hand-copied literals
    // agreeing — which is exactly how Solid/Dashed/Dotted drifted apart.
    assert.equal((chart.match(/createPriceLine\(/g) ?? []).length, 1);
    assert.match(chart, /lineStyle: LineStyle\.Dashed/);
    assert.doesNotMatch(chart, /LineStyle\.(?:Solid|Dotted|SparseDotted|LargeDashed)/);
    assert.match(chart, /lineWidth: 2/);
  });

  it("labels every line the way the mock writes it — LABEL · price, at the price's own precision", () => {
    // formatNumber is the ladder's own formatter (advisorFormat.ts), so each
    // line's price reads byte-identical to the ladder row beside it. The
    // file's local formatChartPrice caps at 2 decimals over 100, which would
    // print a futures level the ladder never showed.
    assert.match(
      chart,
      /title: `\$\{level\.label\} · \$\{formatNumber\(level\.price\)\}`/,
    );
    assert.match(chart, /import \{ formatNumber \} from "\.\.\/workspace\/advisorFormat";/);
    for (
      const label of [
        'label: hasLadder ? "TARGET 2" : "TARGET"',
        'label: "TARGET 1"',
        'label: "ENTRY"',
        'label: "STOP"',
      ]
    ) {
      assert.ok(chart.includes(label), `the mock's level lines need ${label}`);
    }
  });

  it("titles the entry line ENTRY — the stagehead's own tag is what says Buy/Sell limit", () => {
    assert.doesNotMatch(chart, /LIMIT/);
    assert.doesNotMatch(chart, /side\.toUpperCase\(\)/);
  });

  it("colors the lines by role from the live tokens — two targets buy, entry accent, stop sell", () => {
    const levelList = chart.match(/const levels[\s\S]*?\n {4}\];/)?.[0] ?? "";
    assert.ok(levelList.length > 0, "expected to find the level list");
    assert.equal((levelList.match(/theme\.buy/g) ?? []).length, 2);
    assert.equal((levelList.match(/theme\.accent/g) ?? []).length, 1);
    assert.equal((levelList.match(/theme\.sell/g) ?? []).length, 1);
    // Token reactivity is the existing mechanism and must stay: the effect
    // re-reads readChartTheme() whenever the MutationObserver bumps
    // themeVersion, because a canvas cannot consume var(--color-*).
    assert.match(chart, /const theme = readChartTheme\(\);/);
    assert.match(chart, /\}, \[setup, themeVersion\]\);/);
  });

  it("gates Target 1 on the same condition the ladder gates its own row on", () => {
    const gate = /typeof setup\.takeProfit1 === "number" &&\s*setup\.takeProfit1 > 0/;
    assert.match(chart, gate);
    assert.match(panel, gate);
  });
});

describe("Desk chart composition — the kill list is absent (spec §16)", () => {
  it("draws no metric strip inside the chart frame — Entry/Stop/Target/Payoff belong to the ladder", () => {
    // a-desk-v3.html:195-197 draws nothing between the chart and the attached
    // setup sheet. Every value the strip printed is printed again immediately
    // below it: the levels by the ladder, the payoff by the ladder's eyebrow.
    assert.doesNotMatch(chart, /SetupZoneSummary/);
    assert.doesNotMatch(chart, /Payoff/);
    assert.doesNotMatch(chart, /sm:grid-cols-4/);
  });
});

describe("scan rail composition — the mock's elements are present (a-desk-v3.html:87-158)", () => {
  const rail = readFileSync(RAIL, "utf8");

  it('leads with the "Scan" eyebrow and a compact Scan now button on one row', () => {
    assert.match(rail, /uppercase tracking-normal text-ink-muted">\s*Scan\s*</);
    assert.match(rail, /Scan now/);
  });

  it("keeps the scope menu and the server-truth count line, mono and unboxed", () => {
    assert.match(rail, /<ScopeMenu\b[\s\S]{0,200}label="Scan scope"/);
    assert.match(rail, /className="mt-2 font-mono text-xs leading-5 text-ink-muted"/);
    assert.match(rail, /\{formatScopeCountLine\(scope, result, scanCompletedAt \?\? new Date\(\)\)\}/);
  });

  it("renders each row as market + one meta line + cost chip, nothing more", () => {
    // The ticker form, per mock :152 — the full descriptive label truncates
    // mid-description in a 264px rail. The scope menu's rows keep the full one.
    assert.match(rail, /\{formatSecurityDisplaySymbol\(candidate\.symbol\)\}/);
    assert.doesNotMatch(rail, /formatSecurityLabel/);
    assert.match(
      rail,
      /\{formatScanRowMeta\(candidate\.side, candidate\.confidenceScore\)\}/,
    );
    assert.match(rail, /\{candidate\.executionLabel \|\| "Checked"\}/);
  });

  it("marks the stage's market as the selected row: sheet fill plus a 3px inset accent edge", () => {
    assert.match(rail, /selected=\{candidate\.symbol === selectedSymbol\}/);
    // Scoped to the two branches of the row's own className, not the file at
    // large: a bare /bg-sheet/ match anywhere would pass while the selected
    // branch carried neither treatment.
    const branches = rail.match(
      /className=\{selected\n\s*\? "([^"]*)"\n\s*: "([^"]*)"\}/,
    );
    assert.ok(branches, "expected to find the row's selected/unselected classes");
    const [, selectedClasses, unselectedClasses] = branches;
    assert.match(selectedClasses, /\bbg-sheet\b/);
    assert.match(
      selectedClasses,
      /shadow-\[inset_3px_0_0_var\(--color-accent\)\]/,
    );
    assert.doesNotMatch(unselectedClasses, /\bbg-sheet\b/);
    assert.doesNotMatch(unselectedClasses, /shadow-\[inset/);
  });

  it("closes with the approved footnote, verbatim", () => {
    assert.ok(
      rail.includes(
        "Every setup Levelflow generates is saved to Insights automatically.",
      ),
    );
  });
});

describe("scan rail composition — the kill list is absent (spec §16)", () => {
  const rail = readFileSync(RAIL, "utf8");

  it("carries no panel title block — neither the eyebrow nor the heading under it", () => {
    // The eyebrow is matched as rendered element text rather than a bare
    // substring: "Market scan could not complete. Try again shortly." is the
    // failed-scan message and stays. The heading below it is matched outright,
    // comments included, so the string cannot creep back in any form.
    assert.doesNotMatch(rail, />\s*Market scan\s*</);
    assert.doesNotMatch(rail, /Best current markets/);
  });

  it("carries no legend box — no four-chip cost key, no boxed explanation", () => {
    assert.doesNotMatch(rail, /Acceptable/);
    assert.doesNotMatch(
      rail,
      /Scan shows the strongest qualifying setup among closely linked/,
    );
    assert.doesNotMatch(rail, /rounded-lg border border-hairline bg-paper/);
  });

  it("carries no empty-state illustration box — the empty state is one muted line", () => {
    assert.doesNotMatch(rail, /\bSearch\b/);
    assert.match(
      rail,
      /<p className="mt-2 text-sm leading-6 text-ink-muted">\s*\{status === "scanning" \? "Checking active markets\." : emptyMessage\}/,
    );
  });

  it("drops the per-row rank badge, metric grid, level preview and rationale bullets", () => {
    for (
      const retired of [
        "rank",
        "levelPreview",
        "rationale",
        "relatedMarkets",
        "formatPayoff",
        "formatAssetType",
      ]
    ) {
      assert.ok(
        !rail.includes(retired),
        `the mock's row carries no ${retired} — it must not survive here`,
      );
    }
  });

  it("is a plain column, not a terminal-panel", () => {
    assert.doesNotMatch(rail, /terminal-panel/);
  });
});

// Final review, Important 1: Current trades was the one Desk column the
// remediation never swept, so it kept the terminal-panel box-on-box the
// owner's rejection named by phrase — and the guards above had a hole exactly
// there (the stage's absence check is scoped to [stage, panel, receipt], the
// scan rail's to MarketScanPanel.tsx). Both mocks that draw this surface
// (a-desk-v3.html:216-232 railR, m-trades-v1.html:44-54) frame only the
// position cards; the column itself is the frame.
describe("Current trades rail composition — the mock's elements are present (a-desk-v3.html:216-232)", () => {
  const tradesRail = readFileSync(TRADES_RAIL, "utf8");

  it("leads with the mock's eyebrow and the freshness stamp on one row, same treatment as the scan rail", () => {
    assert.match(
      tradesRail,
      /<h3 className="text-xs font-semibold uppercase tracking-normal text-ink-muted">\s*Current trades\s*<\/h3>/,
    );
    // .rrhead (:217): one baseline-aligned row, heading opposite the stamp.
    assert.match(
      tradesRail,
      /className="flex flex-wrap items-baseline justify-between gap-2"[\s\S]{0,200}Current trades/,
    );
    assert.match(tradesRail, /as of \{formatAsOf\(lastRefreshedAt\)\} ·/);
  });

  it("keeps the position card as the one frame the mock draws: hairline border on sheet at .pos's 12/14 padding", () => {
    assert.match(
      tradesRail,
      /className="min-w-0 rounded-lg border border-hairline bg-sheet px-3\.5 py-3"/,
    );
  });

  it("renders the remaining levels as the mock's plain mono pairs, label over value", () => {
    // .lvls (:65): a flex row of mono spans, each label with its value in a
    // block <b> under it. The label vocabulary is the mock's own.
    assert.match(
      tradesRail,
      /className="mt-2 flex flex-wrap gap-x-3 gap-y-1\.5 font-mono text-xs"/,
    );
    assert.match(
      tradesRail,
      /<b className="block text-\[13px\] font-semibold tabular-nums text-ink">/,
    );
    // The mock's captions, not the ladder's long-form wording (spec §7 keeps
    // that in the setup sheet). T2 is written as the laddered branch of the
    // final target, so it is matched in that form rather than as a bare
    // literal a future rewrite could satisfy from a comment.
    assert.match(tradesRail, /levels\.push\(\{ label: "SL", value: formatLevel\(setup\.stop_loss\) \}\);/);
    assert.match(tradesRail, /label: "T1",/);
    assert.match(tradesRail, /label: hasLadder \? "T2" : "Target",/);
  });

  it("closes with the mock's All results → Insights link, wired through the existing workspace nav", () => {
    // :231. No new nav system: openInsights already exists on
    // WorkspaceNavContext (App.tsx supplies it), this is its first call site.
    assert.match(tradesRail, /import \{ useWorkspaceNav \} from "\.\/WorkspaceNav";/);
    assert.match(tradesRail, /const nav = useWorkspaceNav\(\);/);
    assert.match(
      tradesRail,
      /onClick=\{\(\) => nav\.openInsights\(\)\}[\s\S]{0,80}All results → Insights/,
    );
  });

  it("tints the railR column on the aside itself, per the mock (a-desk-v3.html:56)", () => {
    // The tint belongs to the column, not to a panel inside it — that is the
    // whole point of removing the wrapper. Custom-property names match
    // src/styles/index.css's @theme block (--color-sheet / --color-paper).
    assert.match(
      stage,
      /lg:bg-\[color-mix\(in_srgb,var\(--color-sheet\)_55%,var\(--color-paper\)\)\]/,
    );
  });
});

describe("Current trades rail composition — the kill list is absent (spec §16)", () => {
  const tradesRail = readFileSync(TRADES_RAIL, "utf8");

  it("is a plain column, not a terminal-panel — the aside is the frame now", () => {
    assert.doesNotMatch(tradesRail, /terminal-panel/);
  });

  it("carries no pill-boxed levels row and no second card inside the position card", () => {
    assert.doesNotMatch(tradesRail, /rounded-md bg-sheet/);
    assert.doesNotMatch(tradesRail, /rounded-lg border border-hairline bg-paper/);
    // Exactly one bordered frame in the file: the position card itself.
    assert.equal(
      (tradesRail.match(/border border-hairline/g) ?? []).length,
      1,
    );
  });

  it("drops the panel-title treatment the surface heading used to carry", () => {
    assert.doesNotMatch(tradesRail, /text-lg font-semibold/);
  });

  it("keeps the surface's copy rulings (spec §8)", () => {
    assert.doesNotMatch(tradesRail, /Your current trades/);
    assert.doesNotMatch(tradesRail, /\bresting\b/i);
    // Two statuses live here and no more.
    assert.match(tradesRail, /isPending \? "Pending" : "Open"/);
  });
});

describe("progressive disclosure survives the kill list", () => {
  it("keeps a cost-ratings How this works link now that the rail's legend box is gone", () => {
    // Either reference form counts — a JSX prop or a receipt item's own
    // `anchor:` field — the same two shapes tests/guideAnchors.test.ts scans.
    const linked = allSourceFiles("src/components").some((file) =>
      /anchor[=:]\s*"cost-ratings"/.test(readFileSync(file, "utf8"))
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
