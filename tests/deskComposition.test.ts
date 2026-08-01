import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { focusTrapTarget } from "../src/components/charts/ExpandedChartOverlay";

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
  // Spec §17m.1: "the stage is a pure display of the Scan column's selection."
  // Both directions in one test — the market name renders as a heading, and the
  // picker that used to be that heading is gone from the file entirely (with
  // the props it needed: tests/scopeMenu.test.tsx pins their absence too).
  it("leads with the market name as a text display heading, not a picker", () => {
    assert.match(
      stage,
      /<h2 className="shrink-0 whitespace-nowrap font-display text-2xl font-bold text-ink">\s*\{formatSecurityDisplaySymbol\(symbol\)\}\s*<\/h2>/,
    );
    // Exactly one ScopeMenu in this file, and it is the merged mobile surface's
    // scan scope — the stage has none.
    const scopeMenus = stage.match(/<ScopeMenu\b/g) ?? [];
    assert.equal(scopeMenus.length, 1);
    assert.match(stage, /<ScopeMenu\b[\s\S]{0,200}label="Scan scope"/);
    assert.doesNotMatch(stage, /variant="heading"/);
    assert.doesNotMatch(stage, /symbolOnly/);
    assert.doesNotMatch(stage, /label="Market"/);
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
    // Every write of the field, in source order: the scan verdict the stage
    // adopts the moment a scan finishes (§17m.1 — the scan IS the review of the
    // market on screen, and it just ran against live data), twice; then three
    // inside analyze() (the mobile single-market path); then the scan-ROW
    // handler's synthetic state, which claims nothing. The trailing comma is
    // what keeps the type declaration (`reviewedAt: number | null;`) out of the
    // set.
    const writes = (stage.match(/reviewedAt: [^,;\n]+,/g) ?? [])
      .map((write) => write.replace(/,$/, ""));
    assert.deepEqual(writes, [
      "reviewedAt: Date.now()",
      "reviewedAt: Date.now()",
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

  // Spec §17m.1: "All trades originate from the Scan column — no other path."
  // The stage's Review button and its generation path are DELETED, so the only
  // control left in the stagehead is the display-only timeframe select, whose
  // aria-label is the e2e contract for it.
  it("carries no action at all — the chart-view select is the stagehead's one control", () => {
    assert.match(stage, /aria-label="Chart view"/);
    // No Review button, in any wording, anywhere in the file — comments
    // included, since e2e locators are pinned to accessible names and a stale
    // one costs a live deploy run.
    assert.doesNotMatch(stage, />\s*Review\s*</);
    assert.doesNotMatch(stage, /\n\s*Review\n/);
    assert.doesNotMatch(stage, /Review market/);
    // The stage cannot generate: the desktop composition holds no primary
    // button at all, and the one that remains in this file is the merged mobile
    // surface's single Scan control (§17e's own door).
    const primaryButtons = stage.match(/className="primary-button[^"]*"/g) ?? [];
    assert.deepEqual(primaryButtons, [
      'className="primary-button shrink-0 px-4 py-2 text-[13px]"',
    ]);
    assert.doesNotMatch(stage, /secondary-button/);
  });

  // Spec §17: "The stagehead must never truncate the market name." The
  // chart-view select and the action button both shrank in this same wave, so
  // the head row has more room than it ever had — but room is not a
  // guarantee. The guarantee is structural: the heading trigger does not
  // shrink below its own content, and its value is nowrap rather than
  // `truncate`, so the flex-wrap ancestors move the controls to a second row
  // instead of clipping the name to an ellipsis.
  it("gives the stagehead's market name room rather than an ellipsis (spec §17)", () => {
    const heading = stage.match(/<h2 className="([^"]*font-display text-2xl[^"]*)"/)
      ?.[1] ?? "";
    assert.ok(heading.length > 0, "expected the stagehead heading classes");
    // Structural, not a hope about available room: the heading does not shrink
    // below its own content and does not wrap it either, so a long name pushes
    // the chart-view control to a second row instead of clipping.
    assert.match(heading, /\bshrink-0\b/);
    assert.match(heading, /\bwhitespace-nowrap\b/);
    assert.doesNotMatch(heading, /\bmin-w-0\b/);
    assert.doesNotMatch(heading, /\btruncate\b/);
    // The rail's own scope field still truncates — the 264px column genuinely
    // has to clip the full descriptive label.
    const scopeMenu = readFileSync(
      "src/components/workspace/ScopeMenu.tsx",
      "utf8",
    );
    assert.match(
      scopeMenu,
      /id=\{`\$\{baseId\}-value`\} className="truncate"/,
    );
    // And the row the heading sits in still wraps, which is what absorbs the
    // extra width when the name is long.
    assert.match(stage, /className="flex min-w-0 flex-wrap items-center gap-x-3\.5 gap-y-1"/);
    assert.match(
      stage,
      /className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-3"/,
    );
  });

  // Spec §17: every surface that names a timeframe uses the compact code, and
  // the select gets its labels from the one shared list (pinned exactly in
  // tests/core.test.ts) rather than a second hand-written set.
  it("renders the chart-view options from the shared timeframe list (spec §17)", () => {
    assert.match(stage, /import \{ TIMEFRAMES \} from "\.\/advisorFormat";/);
    assert.match(
      stage,
      /\{TIMEFRAMES\.map\(\(option\) => \(\s*<option key=\{option\.value\} value=\{option\.value\}>\s*\{option\.label\}/,
    );
    for (const prose of ["1 hour", "4 hours", "15 minutes", "5 minutes", "Daily"]) {
      assert.ok(
        !stage.includes(prose),
        `the stage must not name a timeframe in prose ("${prose}")`,
      );
    }
  });

  it("attaches the setup sheet hairline-flush under the chart sheet — one frame each, no gap", () => {
    // The chart draws its own square-cornered sheet so the setup sheet's
    // border-t-0 lands on it; a rounded chart frame would leave a visible
    // corner gap and read as two stacked cards again. Spec §17's overlay
    // variant appends its own height to that same string, so the sheet is now a
    // named constant rather than an inline attribute — pinned here in the form
    // it actually takes, and with both branches of its one use proved so the
    // overlay cannot quietly acquire a second frame.
    assert.match(
      chart,
      /const CHART_SHEET =\s*"relative min-w-0 overflow-hidden border border-hairline bg-sheet";/,
    );
    assert.match(
      chart,
      /className=\{fill \? `\$\{CHART_SHEET\} h-full` : CHART_SHEET\}/,
    );
    // §17m.3 made this sheet the budget's remainder and its own scroll region;
    // the frame itself — one hairline border, border-t-0 onto the chart sheet,
    // on sheet — is unchanged.
    assert.match(
      stage,
      /className="scrolly min-w-0 border border-hairline border-t-0 bg-sheet lg:min-h-0 lg:flex-1 lg:overflow-y-auto"[\s\S]{0,200}<RecommendationPanel/,
    );
  });

  // Spec §17m.3: "chart ≈1/3 of the region's height, why ≤1/3, the setup ladder
  // gets the majority; the whole stage should fit the region without scrolling
  // where viewport allows." Pinned as the structure that makes it true at any
  // height rather than a pixel height that happens to fit one: the stage is a
  // flex column exactly the region tall, the chart takes a SHARE of it, and the
  // sheet takes the remainder. tests/e2e measures the result in a real browser.
  it("divides the region: stagehead, chart at ~1/3, the sheet taking the rest (§17m.3)", () => {
    assert.match(
      stage,
      /<section className="min-w-0 shrink-0 lg:flex lg:h-full lg:min-h-0 lg:flex-col">/,
    );
    // The chart's share: grow-0/shrink-0 on an explicit basis, so it is exactly
    // its third and neither steals the ladder's space nor gives up its own.
    assert.match(
      stage,
      /<div className="min-h-0 shrink-0 grow-0 basis-\[30%\]">\s*<MarketChart/,
    );
    // …which only works because the chart takes its height from that wrapper.
    assert.match(stage, /<MarketChart\n\s*data=\{marketData\?\.points \?\? \[\]\}\n\s*fill\n\s*loading=\{marketLoading\}\n\s*onExpand=/);
    // The fixed ≥lg chart height that used to be most of a 1280x800 region is
    // gone from the stage: MarketChart keeps it only for a caller that owns no
    // height, and the stage is no longer one.
    assert.doesNotMatch(stage, /h-\[500px\]|h-\[560px\]/);
    // Every other direct child of the section is pinned, so the two sized
    // children are the only ones that divide the space.
    assert.match(
      stage,
      /className="mb-4 flex shrink-0 flex-wrap items-end/,
    );
    assert.match(stage, /className="mt-3 shrink-0 text-sm font-medium text-ink-muted"/);
  });

  it("splits the setup sheet into the ladder and Why this setup, hairline-divided", () => {
    assert.match(panel, /className="grid min-w-0 lg:grid-cols-\[1\.1fr_0\.9fr\]"/);
    assert.match(panel, /lg:border-b-0 lg:border-r/);
    assert.match(panel, /<SetupQualityReceipt\b/);
  });

  // Completeness audit 2, A5: the ladder's caption fell back to "Current setup
  // ready for review." whenever the notice was empty — a sentence telling the
  // reader that the ladder they are looking at is ready. Same discipline as the
  // stage's marketNotice below: the element exists only when there is
  // something to say, so nothing is captioned and no empty paragraph leaves
  // its margin behind.
  it("captions the ladder only when there is a notice to carry (A5)", () => {
    assert.doesNotMatch(panel, /Current setup ready for review/);
    assert.match(panel, /\{notice\n\s*\? \(\n\s*<p\n/);
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

  it("carries no standalone stage Refresh button — the stage acts at all", () => {
    assert.doesNotMatch(stage, /RefreshCw/);
    assert.doesNotMatch(stage, />\s*Refresh\s*</);
    // Nothing in the ≥lg stage generates or re-fetches on demand: the scan
    // refreshes the chart for the market it lands on, and the trades rail keeps
    // its own refresh link (spec §16, §17m.1).
    assert.doesNotMatch(stage, /className="primary-button"/);
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
    }
    // The hairline card on sheet: banned outright in the two files that render
    // INSIDE the sheet, and in the stage allowed only where it is a form
    // control — the merged mobile surface's chart-view field (m-scan-v3.html:15
    // `.tf`), which tests/boxDiscipline.test.ts carries with its reason.
    // Enumerated rather than merely permitted, so a second one cannot arrive
    // under cover of the first.
    for (const source of [panel, receipt]) {
      assert.doesNotMatch(source, /rounded-lg border border-hairline bg-sheet/);
    }
    assert.deepEqual(
      stage.match(/[^"]*rounded-lg border border-hairline bg-sheet[^"]*/g) ?? [],
      [
        "min-h-11 shrink-0 rounded-lg border border-hairline bg-sheet px-2.5 text-[12.5px] font-bold text-ink",
      ],
    );
  });

  // Fix wave 2C, re-aimed at m-scan-v3: the mobile mock DOES draw one bordered
  // affordance inside the setup sheet's content — the ladder's per-value Copy
  // button (m-scan-v3.html:37 `.cbtn`) — so this pins the other half of that
  // exemption. Neither sheet-filler nor radius may apply un-prefixed in the two
  // files that render INSIDE the sheet; both exist only as `max-lg:` tokens
  // there. (AdvisorWorkspace is excluded on purpose: it draws the sheet itself,
  // which is the one frame the ≥lg mock wants.)
  it("keeps the mobile copy control's border mobile-only — no fill or radius reaches ≥lg", () => {
    for (const source of [panel, receipt]) {
      for (const utility of ["bg-sheet", "bg-paper", "rounded-lg", "rounded-md"]) {
        const unprefixed = source.match(
          new RegExp(`(?:^|[\\s"'])${utility}(?=[\\s"'])`, "g"),
        ) ?? [];
        assert.deepEqual(
          unprefixed,
          [],
          `${utility} must never apply un-prefixed inside the setup sheet — ` +
            "the mock's only bordered affordance here is the mobile copy " +
            "control, which rides max-lg:",
        );
      }
    }
    assert.match(
      panel,
      /max-lg:rounded-md max-lg:border max-lg:border-hairline max-lg:bg-sheet/,
    );
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

// Completeness audit 2, Finding 2b (D2): the why panel rendered nine to ten
// rows plus a "Strongest checks" sub-block where the mock draws five quiet
// ones, and had no Location row at all — roughly twice the mock's height. The
// five categories are a recomposition of content the receipt already receives,
// not new copy: depth beyond them lives behind "How this works".
describe("Why this setup — the mock's five rows (a-desk-v3.html:205-212)", () => {
  it("renders exactly the mock's five labels, in the mock's order", () => {
    const labels = Array.from(
      receipt.matchAll(/label: "([^"]+)"/g),
      (match) => match[1],
    );
    assert.deepEqual(labels, [
      "Market",
      "Location",
      "Timing",
      "Costs",
      "Record",
    ]);
  });

  it("keeps the eyebrow heading and the one How this works link the mock draws beside it", () => {
    assert.match(receipt, /Why this setup/);
    assert.match(receipt, /<HowThisWorksLink anchor="how-review-works" \/>/);
  });

  it("says one sentence per row — no value/detail split to stack a second line", () => {
    assert.match(receipt, /sentence: string;/);
    assert.doesNotMatch(receipt, /\bdetail:/);
  });

  it("renders an em dash where a category has no honest datum, never filler prose", () => {
    assert.match(receipt, /const ABSENT = "—";/);
    // The fallbacks the rows used to carry were process narration, which spec
    // §2 rules out: an absent datum now shows as absent.
    assert.doesNotMatch(receipt, /was included in the review/);
    assert.doesNotMatch(receipt, /Entry is built as a limit order/);
  });

  it("drops the rows and the sub-block the mock does not draw", () => {
    for (
      const retired of [
        "Strongest checks",
        "Market condition",
        "Direction",
        "Order type",
        "Past results",
        "Trading costs",
        "Replay record",
        "strategyVotes",
        "formatPayoff",
        "buildExecutionDetail",
        "macroRateContext",
      ]
    ) {
      assert.ok(
        !receipt.includes(retired),
        `the mock's why panel has no ${retired} — it must not survive here`,
      );
    }
  });

  it("colors only the Costs row, in the mock's own buy/sell tokens", () => {
    // a-desk-v3.html:210 is the one colored row: buy when costs leave the
    // payoff intact, sell when they eat into it. Every other row is plain.
    assert.match(receipt, /return "font-semibold text-buy";/);
    assert.match(receipt, /return "font-semibold text-sell";/);
    assert.doesNotMatch(receipt, /text-accent/);
    assert.equal((receipt.match(/tone:/g) ?? []).length, 2);
  });

  it("keeps both Guide links this surface owns — Costs and Record", () => {
    assert.match(receipt, /anchor: "cost-ratings"/);
    assert.match(receipt, /anchor: "replay-record"/);
  });

  it("renders the rows at the mock's .wrow treatment, compressed to §17m.3's third", () => {
    // The label column and the gap are the mock's (74px / 10px); the type and
    // the padding are §17m.3's compression — the five rows stay, they take ~30%
    // less height, and 12.5px/17px is still above the kit's own metadata floor.
    assert.match(
      receipt,
      /className="flex min-w-0 flex-wrap items-baseline gap-x-2\.5 py-1 text-\[12\.5px\] leading-\[17px\] lg:py-0\.5"/,
    );
    assert.match(
      receipt,
      /className="eyebrow min-w-\[74px\] shrink-0"/,
    );
  });

  it("still surfaces chart-feed warnings — the five-row shape must not swallow them", () => {
    assert.match(receipt, /receipt\.blockers\.length > 0/);
    assert.match(receipt, /text-caution/);
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

// Spec §17: "Expand chart ships on mobile (owner: 'I do not want to skip
// features just because we can'): an 'Expand chart' affordance opens the same
// MarketChart full-viewport (100dvw/100dvh overlay) with its level lines and
// theme reactivity; 44px close target, Escape and focus trap, aria-modal,
// functional labels only. With it, the inline mobile chart may take the mock's
// compact height." The mock draws the affordance inside the chart's own
// bottom-right corner (m-mobile-v3.html:16,:56) at the compact 170px height
// (:13). Source-pinned like the rest of this file — the accessibility contract
// is exactly the kind of thing that regresses silently, so every attribute the
// ruling names is pinned individually.
describe("Expand chart on mobile — the overlay contract (spec §17)", () => {
  const overlay = readFileSync(
    "src/components/charts/ExpandedChartOverlay.tsx",
    "utf8",
  );

  it("draws the trigger inside the chart at every width, functionally labelled", () => {
    // Rendered only when a caller supplies onExpand, so the overlay's own
    // second instance of the chart cannot offer to expand itself again.
    assert.match(chart, /onExpand\?: \(\) => void;/);
    assert.match(chart, /\{onExpand\s*\n?\s*\?/);
    // The visible text IS the accessible name — functional, no aria-label
    // paraphrasing it, and no decorative glyph riding along (the mock's ↗ is
    // decoration, m-mobile-v3.html:56).
    assert.match(chart, />\s*Expand chart\s*</);
    assert.doesNotMatch(chart, /↗/);
    // §17m.3: "Expand chart works on desktop too — the small inline chart is
    // the frame; the overlay is how you see a big one." The lg:hidden gate is
    // gone, and at ≥lg the chip steps below the tool cluster (one 40px row from
    // top-3) instead of fighting it for the same corner.
    const trigger = chart.match(
      /<button\n\s*className="([^"]*)"\n\s*type="button"\n\s*onClick=\{onExpand\}/,
    )?.[1] ?? "";
    assert.ok(trigger.length > 0, "expected the expand trigger's classes");
    assert.doesNotMatch(trigger, /\blg:hidden\b/);
    assert.match(trigger, /\blg:right-3\b/);
    assert.match(trigger, /\blg:top-14\b/);
    // The kit's 44px tap floor, at the mock's own corner placement — the
    // TOP-right corner since the wave-6 rider: live inspection found the
    // affordance crowding the date axis at the bottom, and m-scan-v3.html:32
    // draws it at right:6px/top:6px. The 44px target grows downward from the
    // top edge (items-start + the mock's 6px top pad), the mirror of the
    // bottom-anchored version it replaces, so the label itself sits on the
    // mock's own inset rather than 44px below it.
    assert.match(trigger, /\bmin-h-11\b/);
    assert.match(trigger, /absolute right-0 top-0/);
    assert.match(trigger, /\bitems-start\b/);
    assert.match(trigger, /\bpt-1\.5\b/);
    assert.doesNotMatch(trigger, /bottom-0/);
    assert.doesNotMatch(trigger, /items-end/);
  });

  // The rider's own consequence, which is the half worth pinning: the top-right
  // corner was already occupied. MarketChart's six-button tool cluster sits at
  // right-3/top-3 and is ~232px wide, so on a 343px-wide mobile chart it and the
  // Expand chip cannot both be there. m-scan-v3.html draws exactly one control on
  // that chart — the Expand chip — so below lg the INLINE chart drops the
  // cluster, and the overlay the chip opens keeps it: the tools are one tap away
  // at a size they can actually be used at, and pinch/pan on the inline chart is
  // untouched (handleScale/handleScroll).
  it("clears the corner below lg by hiding the inline chart's tool cluster, never the overlay's", () => {
    // One class string for the cluster, with the mobile branch a suffix on it, so
    // the two instances cannot drift into two clusters.
    assert.match(
      chart,
      /const CHART_TOOLS =\s*\n?\s*"absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1\.5 rounded-lg border border-hairline bg-sheet p-1 shadow-xs";/,
    );
    assert.match(
      chart,
      /className=\{fill \? CHART_TOOLS : `\$\{CHART_TOOLS\} max-lg:hidden`\}/,
    );
    // A real max-lg: token, so the ≥lg cascade is untouched by construction (the
    // same discipline every other mobile treatment in this branch rides).
    assert.doesNotMatch(chart, /max-lg:\$\{/);
    // `fill` means "the container owns the height": the overlay (which is the
    // viewport) and, since §17m.3, the ≥lg stage (whose wrapper hands the chart
    // its third of the region). The instance that DROPS the cluster is the
    // mobile one — no fill, 168px of mock height, and the Expand chip alone in
    // that corner.
    assert.match(overlay, /children/);
    const fillInstances = stage.match(/<MarketChart\n\s*data=\{marketData\?\.points \?\? \[\]\}\n\s*fill\n/g) ?? [];
    assert.equal(fillInstances.length, 2);
  });

  it("mounts a second MarketChart with the same data, setup and view key", () => {
    // "the same MarketChart … with its level lines and theme reactivity": a
    // second instance of the same component with the same props, never an
    // attempt to move the mounted one into the overlay.
    const expanded = stage.match(
      /<ExpandedChartOverlay[\s\S]*?<\/ExpandedChartOverlay>/,
    )?.[0] ?? "";
    assert.ok(expanded.length > 0, "expected the overlay call site");
    assert.match(expanded, /data=\{marketData\?\.points \?\? \[\]\}/);
    assert.match(expanded, /loading=\{marketLoading\}/);
    assert.match(expanded, /setup=\{setup\}/);
    assert.match(expanded, /viewKey=\{`\$\{symbol\}:\$\{timeframe\}`\}/);
    assert.match(expanded, /\bfill\b/);
    // Both instances read one prop set: the inline chart's own props are the
    // same four expressions, so the two can never show different data.
    const inline = stage.match(/<MarketChart\n[\s\S]*?\/>/)?.[0] ?? "";
    for (
      const prop of [
        "data={marketData?.points ?? []}",
        "loading={marketLoading}",
        "setup={setup}",
        "viewKey={`${symbol}:${timeframe}`}",
      ]
    ) {
      assert.ok(inline.includes(prop), `inline chart is missing ${prop}`);
    }
  });

  it("is a real modal dialog: full-viewport on paper, aria-modal, named by the market", () => {
    assert.match(overlay, /role="dialog"/);
    assert.match(overlay, /aria-modal="true"/);
    assert.match(overlay, /aria-labelledby=\{titleId\}/);
    assert.match(overlay, /h-\[100dvh\] w-\[100dvw\]/);
    assert.match(overlay, /\bbg-paper\b/);
    // The market name is the visible title the label resolves to.
    assert.match(overlay, /id=\{titleId\}[\s\S]{0,160}\{marketName\}/);
    assert.match(stage, /marketName=\{formatSecurityDisplaySymbol\(symbol\)\}/);
  });

  it("closes on Escape and on a close control at the kit's 44px floor", () => {
    assert.match(overlay, /aria-label="Close"/);
    assert.match(overlay, /min-h-11 min-w-11/);
    assert.match(overlay, /event\.key === "Escape"/);
    assert.match(overlay, /onClose\(\)/);
  });

  it("moves focus in on open, traps Tab inside, and restores it on close", () => {
    // Focus goes to the close control on open (not merely to the container),
    // Tab and Shift+Tab cycle within the dialog rather than escaping to the
    // page behind it, and whatever had focus before gets it back on close.
    assert.match(overlay, /closeRef\.current\?\.focus\(\)/);
    assert.match(overlay, /"Tab"/);
    assert.match(overlay, /shiftKey/);
    // Both wrap directions exist, which is what makes it a cycle rather than a
    // one-way stop. WHICH direction goes where is the next test's subject —
    // these two substrings are equally happy when the pair is swapped, which is
    // exactly the gap M2 recorded.
    assert.match(overlay, /last\.focus\(\)/);
    assert.match(overlay, /first\.focus\(\)/);
    assert.match(overlay, /previouslyFocusedRef/);
    assert.match(overlay, /restore[\s\S]{0,200}\.focus\(\)/);
    // The direction lives in one exported decision, and the handler does what it
    // says — so the test below is testing the real thing, not a parallel copy.
    assert.match(overlay, /const target = focusTrapTarget\(\{/);
    assert.match(overlay, /if \(target === "first"\) \{\s*first\.focus\(\);/);
  });

  // M2: the trap's direction, tested rather than source-matched. The handler
  // reads the DOM (document.activeElement, the live focusable list), which this
  // repo's jsdom-less unit stack cannot build — so the decision is an exported
  // pure function and the DOM facts are its arguments, the same split
  // ScopeMenu's keyboard reducer already uses. Inverting the two focus calls in
  // the component now fails here instead of leaving the file green at 70/70.
  it("wraps Tab off the last control to the first, and Shift+Tab off the first to the last", () => {
    // Tab, forwards: only the last control wraps; every other position is the
    // browser's own business.
    assert.equal(
      focusTrapTarget({
        activeIsFirst: false,
        activeIsInside: true,
        activeIsLast: true,
        shiftKey: false,
      }),
      "first",
    );
    assert.equal(
      focusTrapTarget({
        activeIsFirst: true,
        activeIsInside: true,
        activeIsLast: false,
        shiftKey: false,
      }),
      null,
    );
    assert.equal(
      focusTrapTarget({
        activeIsFirst: false,
        activeIsInside: true,
        activeIsLast: false,
        shiftKey: false,
      }),
      null,
    );

    // Shift+Tab, backwards: the first control wraps to the last.
    assert.equal(
      focusTrapTarget({
        activeIsFirst: true,
        activeIsInside: true,
        activeIsLast: false,
        shiftKey: true,
      }),
      "last",
    );
    assert.equal(
      focusTrapTarget({
        activeIsFirst: false,
        activeIsInside: true,
        activeIsLast: true,
        shiftKey: true,
      }),
      null,
    );

    // Focus that is no longer in the dialog at all — a click on the page behind
    // it, or a control the chart's own overlays just unmounted — is pulled back
    // in on the next Shift+Tab rather than continuing out into the page.
    assert.equal(
      focusTrapTarget({
        activeIsFirst: false,
        activeIsInside: false,
        activeIsLast: false,
        shiftKey: true,
      }),
      "last",
    );

    // A single-control dialog is both ends at once, and still cycles both ways.
    assert.equal(
      focusTrapTarget({
        activeIsFirst: true,
        activeIsInside: true,
        activeIsLast: true,
        shiftKey: false,
      }),
      "first",
    );
    assert.equal(
      focusTrapTarget({
        activeIsFirst: true,
        activeIsInside: true,
        activeIsLast: true,
        shiftKey: true,
      }),
      "last",
    );
  });

  it("locks body scroll while open and restores the prior value, not a hardcoded one", () => {
    assert.match(overlay, /document\.body\.style\.overflow = "hidden"/);
    assert.match(overlay, /previousOverflow/);
  });

  it("takes the mock's compact inline height below lg and leaves ≥lg exactly as it rendered", () => {
    // m-scan-v3.html:28 — 168px, the height the merged mobile surface pins this
    // chart at inside its fixed viewport (m-mobile-v3's 170px is superseded).
    // The ≥lg values are the same two the sm:/xl: pair produced before (500px at
    // lg, 560px at xl), now expressed as lg:/xl: so the max-lg rule owns
    // everything below the breakpoint outright rather than depending on which of
    // two equal-specificity media queries wins.
    assert.match(chart, /max-lg:h-\[168px\]/);
    assert.doesNotMatch(chart, /h-\[170px\]/);
    assert.match(chart, /lg:h-\[500px\]/);
    assert.match(chart, /xl:h-\[560px\]/);
    assert.doesNotMatch(chart, /sm:h-\[500px\]/);
    assert.doesNotMatch(chart, /h-\[390px\]/);
    // The overlay's instance fills its own container instead.
    assert.match(chart, /fill\s*\n?\s*\? "h-full w-full"/);
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
    // The eyebrow is unchanged and un-prefixed again: spec §17e made this rail
    // the ≥lg composition alone, so the `max-lg:sr-only` that hid it on the old
    // mobile Scan tab described a rendering that no longer happens. Its absence
    // is asserted alongside, so a mobile treatment cannot drift back into a
    // desktop-only component.
    assert.match(
      rail,
      /className="eyebrow">\s*Scan\s*</,
    );
    assert.match(rail, /Scan now/);
    assert.doesNotMatch(rail, /max-lg:sr-only/);
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
    // Un-prefixed, so it holds at ≥lg. Fix wave 2C gave every card a sheet
    // fill below lg (m-scan-v1.html:17 `.mkt`), so the absence check on the
    // unselected branch is anchored to the un-prefixed token specifically —
    // a bare /bg-sheet/ would now also catch that mobile-only `max-lg:`
    // utility and pass or fail for the wrong reason.
    assert.match(selectedClasses, /(?:^|\s)bg-sheet(?:\s|$)/);
    assert.match(
      selectedClasses,
      /shadow-\[inset_3px_0_0_var\(--color-accent\)\]/,
    );
    assert.doesNotMatch(unselectedClasses, /(?:^|\s)bg-sheet(?:\s|$)/);
    assert.doesNotMatch(unselectedClasses, /shadow-\[inset/);
  });

  // Spec §17c (owner live-QA, binding): the mock's closing footnote is
  // SUPERSEDED — "the two narration lines are DELETED. The empty rail is the
  // controls, quietly stark." The presence guard this replaces is inverted
  // rather than deleted, so the sentence cannot return by anyone re-reading
  // a-desk-v3.html:158 as still authoritative.
  it("closes with no footnote at all — §17c deleted the mock's closing line", () => {
    assert.doesNotMatch(
      rail,
      /Every setup Levelflow generates is saved to Insights automatically\./,
    );
    assert.doesNotMatch(rail, /RAIL_FOOTNOTE/);
  });
});

// Spec §17e's merged mobile Scan surface fires the same scan from its own
// control row and reads the same scope to decide what that click means, so the
// scope, its symbol list, and the result rows all have to be one thing shared
// by two compositions rather than two of each. These guards pin the ownership,
// not the markup: a second copy of any of them is how the desktop rail and the
// mobile surface would start disagreeing about what "Crypto" currently scans.
describe("scan scope ownership — one state, one derivation, two surfaces (§17e)", () => {
  const rail = readFileSync(RAIL, "utf8");

  it("keeps the scope in AdvisorWorkspace, and leaves the rail with no state of its own", () => {
    assert.match(
      stage,
      /const \[scope, setScope\] = useState<ScanScope>\(\{ kind: "all" \}\);/,
    );
    assert.doesNotMatch(rail, /useState/);
  });

  it("derives the availability-filtered scan list exactly once in src/, in the stage that owns the scope", () => {
    // Call sites, not the declaration — marketScanFilters.ts is where the
    // helper lives, and the claim here is about who invokes it.
    const derivations = allSourceFiles("src").filter((file) =>
      /(?<!function )filterSymbolsByAvailability\(/.test(
        readFileSync(file, "utf8"),
      )
    );
    assert.deepEqual(derivations, [STAGE]);
    // …and the rail scans whatever that one derivation produced.
    assert.match(rail, /openScanSymbols: SupportedSymbol\[\];/);
    assert.match(rail, /onClick=\{\(\) => onScan\(openScanSymbols\)\}/);
    assert.match(stage, /openScanSymbols=\{openScanSymbols\}/);
  });

  it("routes every scope change through the stage's one handler, which resets the stale result and follows a single market", () => {
    assert.match(rail, /<ScopeMenu\b[\s\S]{0,200}onSelect=\{onSelectScope\}/);
    assert.match(stage, /onSelectScope=\{selectScope\}/);
    assert.match(
      stage,
      /function selectScope\(nextScope: ScanScope\) \{\s*setScope\(nextScope\);\s*setScanResult\(null\);\s*setScanCompletedAt\(null\);\s*if \(nextScope\.kind === "symbol"\) \{\s*selectSymbolForReview\(nextScope\.symbol\);/,
    );
  });

  it("exports the count line + result rows as one component both surfaces render", () => {
    assert.match(rail, /export function MarketScanResults\(\{/);
    assert.match(rail, /<MarketScanResults\n/);
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

  it("carries no empty-state illustration box, and no empty-state sentence either (§17c)", () => {
    assert.doesNotMatch(rail, /\bSearch\b/);
    // §17c deletes the narration line the un-scanned rail used to carry, so
    // the muted paragraph now renders only when there is something real to
    // report — a failed scan, a filtered-out result set, or a scan in flight.
    // `emptyMessage` is null before the first scan, and the render is gated on
    // it, so nothing at all is drawn there.
    assert.doesNotMatch(
      rail,
      /Scan every active market to find the strongest current limit setups\./,
    );
    assert.match(
      rail,
      /<p className="mt-2 text-sm leading-6 text-ink-muted">\s*\{emptyMessage\}/,
    );
    assert.match(rail, /: emptyMessage\s*\?/);
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
    // The eyebrow's own ≥lg treatment is unchanged; fix wave 2C appended the
    // mobile mock's 19px display head behind `max-lg:` (m-trades-v1.html:12),
    // since below lg this rail is the Trades tab's whole page rather than a
    // column beside two others.
    assert.match(
      tradesRail,
      /<h3 className="eyebrow max-lg:[^"]*">\s*Current trades\s*<\/h3>/,
    );
    // .rrhead (:217): one baseline-aligned row, heading opposite the stamp.
    // The window is 400 rather than 200 only because the heading's own class
    // list grew with its `max-lg:` half above — the fact asserted here (the
    // heading text sits inside that row container) is unchanged.
    assert.match(
      tradesRail,
      /className="flex flex-wrap items-baseline justify-between gap-2 lg:min-h-11 lg:items-center"[\s\S]{0,400}Current trades/,
    );
    assert.match(tradesRail, /as of \{formatAsOf\(lastRefreshedAt\)\} ·/);
  });

  // Spec §17c (owner live-QA, binding): "the rail's first line must share the
  // same top offset/baseline rhythm as the SCAN eyebrow and the stagehead — no
  // thin unfinished margin, and no added busy-ness: alignment, not
  // decoration."
  //
  // Measured on the built CSS at 1440x900 before the fix: the header is 69px
  // tall, the page wrapper adds sm:pt-5, so all three Desk columns begin at
  // y=89. The scan rail's first line is 44px tall because .primary-button
  // carries the kit's 44px floor, which put its SCAN eyebrow's 16px line at
  // y=103; the trades rail's first line was 16px tall, putting CURRENT TRADES
  // at y=89 — 14px above both neighbours, hard against the tinted column's top
  // edge. Giving this row the same 44px and centring its content lands the
  // eyebrow at y=103 exactly, and its cards then start within 2px of where the
  // scan rail's scope select does.
  //
  // Both halves are pinned because either alone is inert: the min-height with
  // baseline alignment leaves the eyebrow at the top of the taller row, and
  // centring inside a 16px row centres nothing.
  it("shares the scan rail's 44px first-line rhythm at ≥lg — the two eyebrows sit on one baseline (§17c)", () => {
    const head = tradesRail.match(
      /<div className="(flex flex-wrap items-baseline[^"]*)">/,
    )?.[1] ?? "";
    assert.ok(head.length > 0, "expected to find the trades rail's head row");
    assert.match(head, /\blg:min-h-11\b/);
    assert.match(head, /\blg:items-center\b/);
    // The number is shared, not copied: the scan rail's own first line is 44px
    // because .primary-button sits in it. If that button ever leaves that row,
    // this pairing stops describing anything and the guard says so.
    assert.match(
      readFileSync(RAIL, "utf8"),
      /className="flex flex-wrap items-baseline justify-between gap-2[^"]*"[\s\S]{0,1800}className="primary-button/,
    );
    // Alignment only: no fill, no border, no rule joins the row.
    assert.doesNotMatch(head, /\bborder\b|\bbg-|\bshadow-|\brounded/);
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
