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

  // Spec §17: the stage's action is "Review", not "Review market" — the
  // stagehead already names the market immediately beside it, so the second
  // word was restating the heading. The `>` before it is what makes this an
  // element-text assertion rather than a substring a comment could satisfy.
  it("keeps Review as the stage's one action, beside the chart-view control", () => {
    assert.match(stage, /className="primary-button"[\s\S]{0,600}\n\s*Review\n/);
    assert.match(stage, /aria-label="Chart view"/);
    // The old wording is gone everywhere in this file, comments included —
    // e2e locators are pinned to the button's accessible name, and a stale
    // one costs a live deploy run.
    assert.doesNotMatch(stage, /Review market/);
  });

  // Spec §17: "The stagehead must never truncate the market name." The
  // chart-view select and the action button both shrank in this same wave, so
  // the head row has more room than it ever had — but room is not a
  // guarantee. The guarantee is structural: the heading trigger does not
  // shrink below its own content, and its value is nowrap rather than
  // `truncate`, so the flex-wrap ancestors move the controls to a second row
  // instead of clipping the name to an ellipsis.
  it("gives the stagehead's market name room rather than an ellipsis (spec §17)", () => {
    const scopeMenu = readFileSync(
      "src/components/workspace/ScopeMenu.tsx",
      "utf8",
    );
    const headingTrigger = scopeMenu.match(
      /variant === "heading"\n\s*\? "(-?[^"]*font-display[^"]*)"/,
    )?.[1] ?? "";
    assert.ok(headingTrigger.length > 0, "expected the heading trigger classes");
    assert.match(headingTrigger, /\bshrink-0\b/);
    assert.doesNotMatch(headingTrigger, /\bmin-w-0\b/);
    // The value span: nowrap for the heading, still truncating in the 264px
    // scan rail where the full descriptive label genuinely has to be clipped.
    assert.match(
      scopeMenu,
      /id=\{`\$\{baseId\}-value`\}\n\s*className=\{variant === "heading"\n\s*\? "whitespace-nowrap"\n\s*: "truncate"\}/,
    );
    // And the row the trigger sits in still wraps, which is what absorbs the
    // extra width when the name is long.
    assert.match(stage, /className="flex min-w-0 flex-wrap items-center gap-x-3\.5 gap-y-1"/);
    assert.match(
      stage,
      /className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3"/,
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

  it("carries no standalone stage Refresh button — Review is the one action", () => {
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

  // Fix wave 2C: the mobile mock DOES draw a card inside the setup sheet — the
  // ladder's copy rows (m-mobile-v3.html:25 `.copy`) — so this pins the other
  // half of that exemption. Neither sheet-filler nor radius may apply
  // un-prefixed in the two files that render INSIDE the sheet; both exist only
  // as `max-lg:` tokens there. (AdvisorWorkspace is excluded on purpose: it
  // draws the sheet itself, which is the one frame the ≥lg mock wants.)
  it("keeps the mobile ladder card mobile-only — no fill or radius reaches ≥lg", () => {
    for (const source of [panel, receipt]) {
      for (const utility of ["bg-sheet", "bg-paper", "rounded-lg", "rounded-md"]) {
        const unprefixed = source.match(
          new RegExp(`(?:^|[\\s"'])${utility}(?=[\\s"'])`, "g"),
        ) ?? [];
        assert.deepEqual(
          unprefixed,
          [],
          `${utility} must never apply un-prefixed inside the setup sheet — ` +
            "the mock's only card here is the mobile copy row, which rides " +
            "max-lg:",
        );
      }
    }
    assert.match(panel, /max-lg:rounded-lg max-lg:border max-lg:bg-sheet/);
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

  it("renders the rows at the mock's .wrow treatment — 74px label column, 10px gap, 13px text", () => {
    assert.match(
      receipt,
      /className="flex min-w-0 flex-wrap items-baseline gap-x-2\.5 py-1\.5 text-\[13px\] leading-5"/,
    );
    assert.match(
      receipt,
      /className="min-w-\[74px\] shrink-0 text-xs font-semibold uppercase tracking-normal text-ink-muted"/,
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

  it("draws the trigger inside the chart, mobile-only, functionally labelled", () => {
    // Rendered only when a caller supplies onExpand, so the overlay's own
    // second instance of the chart cannot offer to expand itself again.
    assert.match(chart, /onExpand\?: \(\) => void;/);
    assert.match(chart, /\{onExpand\s*\n?\s*\?/);
    // The visible text IS the accessible name — functional, no aria-label
    // paraphrasing it, and no decorative glyph riding along (the mock's ↗ is
    // decoration, m-mobile-v3.html:56).
    assert.match(chart, />\s*Expand chart\s*</);
    assert.doesNotMatch(chart, /↗/);
    // Mobile-only, as a literal class Tailwind's build-time scanner can see,
    // on the button itself rather than a wrapper.
    const trigger = chart.match(
      /<button\n\s*className="([^"]*)"\n\s*type="button"\n\s*onClick=\{onExpand\}/,
    )?.[1] ?? "";
    assert.ok(trigger.length > 0, "expected the expand trigger's classes");
    assert.match(trigger, /\blg:hidden\b/);
    // The kit's 44px tap floor, at the mock's own corner placement.
    assert.match(trigger, /\bmin-h-11\b/);
    assert.match(trigger, /absolute bottom-0 right-0/);
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
    assert.match(stage, /marketName=\{scopeTriggerLabel\(/);
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
    // Both wrap directions, which is what makes it a cycle rather than a
    // one-way stop: Shift+Tab off the first control lands on the last, and Tab
    // off the last lands on the first.
    assert.match(overlay, /last\.focus\(\)/);
    assert.match(overlay, /first\.focus\(\)/);
    assert.match(overlay, /previouslyFocusedRef/);
    assert.match(overlay, /restore[\s\S]{0,200}\.focus\(\)/);
  });

  it("locks body scroll while open and restores the prior value, not a hardcoded one", () => {
    assert.match(overlay, /document\.body\.style\.overflow = "hidden"/);
    assert.match(overlay, /previousOverflow/);
  });

  it("takes the mock's compact inline height below lg and leaves ≥lg exactly as it rendered", () => {
    // m-mobile-v3.html:13 — 170px. The ≥lg values are the same two the sm:/xl:
    // pair produced before (500px at lg, 560px at xl), now expressed as lg:/xl:
    // so the max-lg rule owns everything below the breakpoint outright rather
    // than depending on which of two equal-specificity media queries wins.
    assert.match(chart, /max-lg:h-\[170px\]/);
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
    // The eyebrow's own ≥lg treatment is unchanged; fix wave 2C appended
    // `max-lg:sr-only` because m-scan-v1.html draws no eyebrow on the mobile
    // tab (the bottom tab bar already names that surface) — clipped, not
    // removed, so the heading survives in the accessibility tree there.
    assert.match(
      rail,
      /uppercase tracking-normal text-ink-muted max-lg:sr-only">\s*Scan\s*</,
    );
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
    // The eyebrow's own ≥lg treatment is unchanged; fix wave 2C appended the
    // mobile mock's 19px display head behind `max-lg:` (m-trades-v1.html:12),
    // since below lg this rail is the Trades tab's whole page rather than a
    // column beside two others.
    assert.match(
      tradesRail,
      /<h3 className="text-xs font-semibold uppercase tracking-normal text-ink-muted max-lg:[^"]*">\s*Current trades\s*<\/h3>/,
    );
    // .rrhead (:217): one baseline-aligned row, heading opposite the stamp.
    // The window is 400 rather than 200 only because the heading's own class
    // list grew with its `max-lg:` half above — the fact asserted here (the
    // heading text sits inside that row container) is unchanged.
    assert.match(
      tradesRail,
      /className="flex flex-wrap items-baseline justify-between gap-2"[\s\S]{0,400}Current trades/,
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
