import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// No jsdom in this repo's unit-test stack (see
// tests/currentTradesRail.test.tsx's header comment) — HistoryPanel.tsx's
// markup is pinned against its real source text the same way that file and
// tests/scopeMenu.test.tsx already do. The underlying logic HistoryPanel
// wires together (result labels, record-band math, filtering, period
// boundaries) is exercised directly and thoroughly in
// tests/historyUtils.test.ts and tests/outcomes.test.ts.
const PANEL_SOURCE = readFileSync(
  "src/components/workspace/HistoryPanel.tsx",
  "utf8",
);

// Spec §17c (owner live-QA, binding): the below-table blurb is DELETED —
// "the Guide teaches it and the page shows it", and "'taken or not' dies
// app-wide with it". The verbatim-presence guard this replaces is inverted
// rather than removed, so spec §10's sentence cannot return by anyone reading
// that older section as still current. Every fragment is pinned separately:
// the sentence must not come back whole, in halves, or reworded around the
// same two claims.
const DELETED_FOOTER_FRAGMENTS = [
  "Every setup Levelflow generates is saved here automatically",
  "taken or not",
  "Your record is tracked per broker",
  "E8 Markets",
];

describe("HistoryPanel markup (source-pinned — see header comment)", () => {
  it("titles the surface exactly Insights", () => {
    assert.match(PANEL_SOURCE, />\s*Insights\s*</);
  });

  it("renders no below-table blurb — §17c deleted it, fragment by fragment", () => {
    // Whitespace-collapsed for the same reason the old presence check was:
    // JSX line-wrapping must not be able to hide a fragment from the scan.
    const collapsedSource = PANEL_SOURCE.replace(/\s+/g, " ");
    for (const fragment of DELETED_FOOTER_FRAGMENTS) {
      assert.ok(
        !collapsedSource.includes(fragment),
        `HistoryPanel.tsx must not carry "${fragment}" (spec §17c)`,
      );
    }
  });

  it("names the broker nowhere — the chip in the masthead is where the broker lives", () => {
    assert.equal((PANEL_SOURCE.match(/E8 Markets/g) ?? []).length, 0);
  });

  it("renders the eight result-column headers in spec §10's exact order, with no Origin column", () => {
    const headings = Array.from(
      PANEL_SOURCE.matchAll(/<th[^>]*>\s*([^<{]+?)\s*<\/th>/g),
      (match) => match[1].trim(),
    );
    assert.deepEqual(headings, [
      "Market",
      "Side",
      "Confidence",
      "Entry",
      "Stop",
      "Target 1",
      "Target 2",
      "Result",
    ]);
  });

  it("labels the three filter controls exactly Market, Status, Period — no Origin filter", () => {
    const labels = Array.from(
      PANEL_SOURCE.matchAll(
        /<label[^>]*>\s*\n?\s*([A-Za-z ]+)\s*\n?\s*<select/g,
      ),
      (match) => match[1].trim(),
    );
    assert.deepEqual(labels, ["Market", "Status", "Period"]);
  });

  it("never renders the word Origin anywhere in the panel's visible copy", () => {
    assert.doesNotMatch(PANEL_SOURCE, />\s*Origin\s*</i);
    assert.doesNotMatch(PANEL_SOURCE, /"Origin"/i);
  });

  it("offers exactly All / Open / Pending / Closed as the Status filter options, in that order", () => {
    const optionsBlock = PANEL_SOURCE.match(
      /STATUS_FILTER_OPTIONS[\s\S]*?=\s*\[([\s\S]*?)\];/,
    )?.[1] ?? "";
    const labels = Array.from(
      optionsBlock.matchAll(/label:\s*"([^"]+)"/g),
      (match) => match[1],
    );
    assert.deepEqual(labels, ["All", "Open", "Pending", "Closed"]);
  });

  it("offers exactly Last 7/30/90 days as the Period filter options, in that order", () => {
    const optionsBlock = PANEL_SOURCE.match(
      /PERIOD_OPTIONS[\s\S]*?=\s*\[([\s\S]*?)\];/,
    )?.[1] ?? "";
    const labels = Array.from(
      optionsBlock.matchAll(/label:\s*"([^"]+)"/g),
      (match) => match[1],
    );
    assert.deepEqual(labels, ["Last 7 days", "Last 30 days", "Last 90 days"]);
  });

  // §17n compacted the three filters below lg — 13px type, 8px side padding, and
  // `.field`'s 48px brought down TO the kit's 44px floor rather than through it, so
  // every filter is still a real touch target. The kit class stays the base at both
  // widths; the compaction is variants on top of it.
  it("every select-based filter control uses the kit's field styling, at the 44px floor below lg", () => {
    const selectOpenTags = PANEL_SOURCE.match(/<select\b[^>]*>/g) ?? [];
    assert.ok(selectOpenTags.length >= 3);
    for (const tag of selectOpenTags) {
      assert.match(
        tag,
        /className="field max-lg:min-h-11 max-lg:px-2 max-lg:text-\[13px\]"/,
      );
    }
  });

  it("scrolls the wide table horizontally inside its own wrapper, not the page", () => {
    assert.match(PANEL_SOURCE, /overflow-x-auto/);
  });

  it("uses the shared formatNumber-backed price formatter for every price column, never a raw value", () => {
    assert.match(PANEL_SOURCE, /formatPriceValue\(setup\.limit_entry\)/);
    assert.match(PANEL_SOURCE, /formatPriceValue\(setup\.stop_loss\)/);
    assert.match(PANEL_SOURCE, /formatPriceValue\(setup\.take_profit_1\)/);
    assert.match(PANEL_SOURCE, /formatPriceValue\(setup\.take_profit\)/);
  });

  it("computes the Result column through formatInsightsResult, not an inline reimplementation", () => {
    assert.match(PANEL_SOURCE, /formatInsightsResult\(setup, now\)/);
  });

  it("computes the record band and the table's day groups through the shared historyUtils functions", () => {
    // The band reads the LIFETIME record, the table reads the filtered display
    // window (spec §10 as amended by §18's extension — owner 2026-08-02: "Yes.
    // I want fidelity across the board"). Both directions: a band fed the
    // window is the truncation the ruling closed.
    assert.match(PANEL_SOURCE, /buildRecordBand\(lifetimeSetups, now\)/);
    assert.doesNotMatch(PANEL_SOURCE, /buildRecordBand\(setups, now\)/);
    assert.doesNotMatch(PANEL_SOURCE, /buildRecordBand\(filteredSetups/);
    assert.match(PANEL_SOURCE, /buildInsightsGroups\(filteredSetups\)/);
    assert.match(PANEL_SOURCE, /filterInsightsSetups\(/);
  });

  it("never mentions resting or other banned quant jargon in a string literal (languageGuard already scans this file too)", () => {
    assert.doesNotMatch(PANEL_SOURCE, /\bresting\b/i);
  });

  // Fix round 1 (Important): Insights→Desk navigation restored. The Market
  // cell's symbol text is itself the affordance (no new column, no
  // separate "Open in Advisor" caption) — same useWorkspaceNav /
  // nav.openAdvisor consume-once flow ProfilePanel.tsx's per-market button
  // already uses. Render-testing a click can't reach this component (no
  // jsdom in this harness — see header comment), so wiring is pinned
  // against the source text instead, the same technique the rest of this
  // file already uses.
  it("imports and calls useWorkspaceNav inside the row component", () => {
    assert.match(
      PANEL_SOURCE,
      /import \{ useWorkspaceNav \} from "\.\/WorkspaceNav";/,
    );
    assert.match(PANEL_SOURCE, /const nav = useWorkspaceNav\(\);/);
  });

  // The owner's third finding, 2026-08-02: "Clicking on the trade in the
  // Insights tab loads the chart, but not the details below it. It should." The
  // cause was the argument — a bare symbol reselects the market and leaves the
  // stage's analysis state null, so the ladder, the why rows and the receipt
  // have nothing to draw. The row hands over its whole stored setup now, and the
  // stage restores it through the one adoption path scan rows use.
  it("wires the Market cell's button to nav.openAdvisor(setup) — the stored row, exactly one call site", () => {
    const calls = PANEL_SOURCE.match(/nav\.openAdvisor\([^)]*\)/g) ?? [];
    assert.deepEqual(calls, ["nav.openAdvisor(setup)"]);
    assert.doesNotMatch(PANEL_SOURCE, /nav\.openAdvisor\(setup\.symbol\)/);
  });

  it("the Market cell is a real, keyboard-focusable <button> (not a div/span with onClick), 44px touch target", () => {
    // Lazily spans from the opening "<button" through the onClick attribute
    // to the tag's own closing ">" — safe here since none of this button's
    // attribute values contain a literal ">".
    const openingTag = PANEL_SOURCE.match(
      /<button[\s\S]*?onClick=\{\(\) => nav\.openAdvisor\(setup\)\}[\s\S]*?>/,
    )?.[0];
    assert.ok(
      openingTag,
      "expected to locate the Market cell's <button> opening tag",
    );
    assert.match(openingTag ?? "", /type="button"/);
    assert.match(openingTag ?? "", /\bmin-h-11\b/);
  });

  it("gives the Market button an accessible name that states what it does, not just the bare symbol", () => {
    assert.match(
      PANEL_SOURCE,
      /aria-label=\{`Open \$\{setup\.symbol\} in Advisor`\}/,
    );
  });

  it("renders the symbol itself as the button's visible label — no separate caption, no new column", () => {
    assert.match(
      PANEL_SOURCE,
      /onClick=\{\(\) => nav\.openAdvisor\(setup\)\}\s*>\s*\{setup\.symbol\}\s*<\/button>/,
    );
  });
});

// Q2-C2: with the hook's error string unread, a failed history fetch reached this
// panel as `setups: []` and printed "No setups have been logged yet." — a claim
// about the account made by a surface that had just failed to read it. Same
// sentence as the trades rail, from the same constant: the two surfaces share one
// fetch, so they say one thing about its failure.
describe("Insights says the fetch failed rather than claiming an empty ledger (Q2-C2)", () => {
  it("routes the no-setups state through the load-failure flag", () => {
    assert.match(PANEL_SOURCE, /loadFailed: boolean;/);
    assert.match(
      PANEL_SOURCE,
      /!loading && setups\.length === 0[\s\S]{0,240}\{loadFailed \? HISTORY_LOAD_FAILED_COPY : "No setups have been logged yet\."\}/,
    );
    assert.match(PANEL_SOURCE, /\bHISTORY_LOAD_FAILED_COPY,/);
  });

  it("leaves the filtered-empty notice alone — filters matching nothing is not a failure", () => {
    assert.match(
      PANEL_SOURCE,
      /setups\.length > 0 && filteredSetups\.length === 0[\s\S]{0,240}No setups match the current filters\./,
    );
  });
});

// §19 retrofit, Task 8 (amendment 13): the Market filter is "structured after
// the scan scope menu's universal contract" (historyUtils.ts's own words) —
// this closes the other half of that parallel, so the two surfaces cannot
// silently drift apart on which account governs what's offered.
// Source-pinned for the same reason every other interactive check in this
// file is (see header comment): no jsdom, so the select's real DOM options
// cannot be read back out.
describe("Insights is exempt from account segmentation (amendment 29, owner 2026-08-07)", () => {
  it("cannot consult the account at all — the exemption is structural", () => {
    // Amendment 13 made availability follow the classification, and §19
    // retrofit Task 8 applied it here. Amendment 29 narrows that to surfaces
    // that GENERATE: the Desk is segmented because offering a futures market to
    // a forex account produces a limit price the operator cannot place.
    // Insights produces no price. It is the record of what was already traded
    // on every account the operator holds, and a record that hides part of
    // itself depending on today's selection is not a record.
    //
    // Pinned as an ABSENCE rather than a rule, because a rule can be forgotten:
    // the panel takes no profile prop, so there is nothing to segment by.
    // The dependency, not the word: the prose above explains what was removed
    // and naming it in a comment is not a use of it.
    assert.doesNotMatch(PANEL_SOURCE, /from "\.\.\/\.\.\/lib\/broker\/visibility"/);
    assert.doesNotMatch(PANEL_SOURCE, /from "\.\.\/\.\.\/lib\/profile"/);
    assert.doesNotMatch(PANEL_SOURCE, /visibleAssetGroups\(/);
    assert.doesNotMatch(PANEL_SOURCE, /activeAccountOf\(/);
    assert.doesNotMatch(PANEL_SOURCE, /profile: UserProfile;/);
    assert.doesNotMatch(PANEL_SOURCE, /AVAILABLE_ASSET_GROUPS/);
  });

  it("offers exactly the markets this operator has actually traded", () => {
    // Not the whole roster either: a filter option for a market with no rows
    // behind it is noise, and on a 100+ market universe it is a lot of noise.
    // Derived from the ledger, so it is self-maintaining as both the universe
    // and the operator's history grow.
    assert.match(PANEL_SOURCE, /groupsForTradedSymbols\(setups\)/);
    assert.match(PANEL_SOURCE, /\{tradedGroups\.map\(\(group\) => \(/);
  });

  it("resets a filter only when the LEDGER stops carrying it, never on an account switch", () => {
    assert.match(PANEL_SOURCE, /tradedGroups\.some\(\(group\) =>/);
    assert.match(PANEL_SOURCE, /\}, \[tradedGroups, marketScope\]\);/);
    assert.match(PANEL_SOURCE, /setMarketScope\(\{ kind: "all" \}\)/);
  });
});
