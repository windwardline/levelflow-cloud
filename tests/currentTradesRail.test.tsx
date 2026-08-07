import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildRemainingLevels,
  buildTradeCards,
} from "../src/components/workspace/CurrentTradesRail";
import { HISTORY_LOAD_FAILED_COPY } from "../src/components/workspace/historyUtils";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer";
import type { TradeState } from "../src/lib/tradeState";

// No jsdom in this repo's unit-test stack, and this test runner's esbuild
// JSX transform (classic, no covering tsconfig for tests/) breaks on any
// real src/ component's own JSX body when actually rendered — confirmed
// empirically against AdvisorMetricRow.tsx (a "React is not defined"
// ReferenceError from inside the imported component, not this file), the
// same limitation tests/scopeMenu.test.tsx and tests/confidenceUnit.test.tsx
// already document and work around. So CurrentTradesRail is exercised
// through its exported pure functions below, and the handful of facts that
// only exist in JSX (the testid, the exact header copy, chip tones) are
// pinned against the real source text, the same technique those two files
// and tests/core.test.ts use.
const RAIL_SOURCE = readFileSync(
  "src/components/workspace/CurrentTradesRail.tsx",
  "utf8",
);

const NOW = new Date("2026-07-30T12:00:00.000Z");

function buildSetup(overrides: Partial<TradeSetupRow> = {}): TradeSetupRow {
  return {
    analyzer_version: "unversioned",
    breakeven_trigger_price: 1.0865,
    confidence_score: 78,
    confluence: {},
    correlation_group: null,
    created_at: "2026-07-30T09:00:00.000Z",
    id: "setup-1",
    limit_entry: 1.0865,
    risk_model: {},
    side: "buy",
    status: "generated",
    stop_loss: 1.083,
    symbol: "EURUSD",
    take_profit: 1.095,
    take_profit_1: 1.09,
    trade_outcomes: undefined,
    ...overrides,
  };
}

// An open (filled and live) row, since half of the rail's ordering is which
// state group a card belongs to.
function buildOpenSetup(overrides: Partial<TradeSetupRow> = {}): TradeSetupRow {
  return buildSetup({
    status: "placed",
    trade_outcomes: [
      {
        exit_at: null,
        feedback: { tp1Hit: false },
        filled_at: null,
        outcome: "pending",
        realized_pnl: null,
        reviewed_at: null,
      },
    ],
    ...overrides,
  });
}

describe("buildTradeCards", () => {
  it("pairs each surviving setup with its derived state", () => {
    const cards = buildTradeCards(
      [buildSetup({ id: "a", status: "generated" }), buildOpenSetup({ id: "b" })],
      NOW,
    );
    assert.deepEqual(
      cards.map((card) => [card.setup.id, card.state.status]),
      [["b", "open"], ["a", "pending"]],
    );
  });

  it("drops resolved/closed setups entirely — deriveTradeState's null contract", () => {
    const closed = buildSetup({ id: "closed", status: "filled" });
    assert.deepEqual(buildTradeCards([closed], NOW), []);
  });

  it("returns an empty list for no setups", () => {
    assert.deepEqual(buildTradeCards([], NOW), []);
  });

  // Amendment 23's offset ruling (owner, 2026-08-05), fix round 1: the
  // BEHAVIORAL half of the reopen gate. The source-text pins elsewhere prove
  // the two render branches exist; only this proves the flag that chooses
  // between them is computed from the display-exclusion predicate — an
  // inverted or unreachable `reopenable` passes every source pin and fails
  // right here.
  it("marks every card reopenable — nothing is display-excluded today", () => {
    const cards = buildTradeCards(
      [
        buildSetup({ id: "brent", symbol: "BRENT" }),
        buildSetup({ id: "silver", symbol: "XAGUSD" }),
        buildSetup({ id: "euro", symbol: "EURUSD" }),
      ],
      NOW,
    );
    const reopenableById = new Map(
      cards.map((card) => [card.setup.id, card.reopenable]),
    );
    // BRENT was the only display-excluded symbol, and amendment 30 released it:
    // a real match with a measurable offset is SHOWN with its basis line rather
    // than hidden. Its card is reopenable like any other.
    //
    // The mechanism is unchanged and still asserted below — a symbol in
    // DISPLAY_EXCLUDED_SYMBOLS builds a card whose reopen affordance is off,
    // which is the records-stay half of the ruling. Nothing occupies that set
    // today.
    assert.equal(reopenableById.get("brent"), true);
    assert.equal(cards.length, 3);
    // XAGUSD carries a basis of its own and stays fully reopenable: the basis
    // line and the display exclusion are separate rulings, and only the
    // exclusion closes the route back.
    assert.equal(reopenableById.get("silver"), true);
    assert.equal(reopenableById.get("euro"), true);
  });
});

// The durable sort law (spec §4): "Menus are alphabetical for finding; results
// are sorted by confidence for deciding — that is the only sorting deviation."
// The rail is a results surface and rendered fetch order (created_at
// descending) until this wave — the owner's own first finding, 2026-08-02.
describe("the Current trades rail obeys the durable sort law", () => {
  it("orders by confidence descending, not the order the fetch delivered", () => {
    const cards = buildTradeCards(
      [
        buildOpenSetup({ confidence_score: 62, id: "weak", symbol: "EURUSD" }),
        buildOpenSetup({ confidence_score: 91, id: "strong", symbol: "XAUUSD" }),
        buildOpenSetup({ confidence_score: 74, id: "middle", symbol: "USDJPY" }),
      ],
      NOW,
    );
    assert.deepEqual(cards.map((card) => card.setup.id), [
      "strong",
      "middle",
      "weak",
    ]);
  });

  it("breaks a confidence tie exactly the way the Insights ledger does", () => {
    const tied = [
      buildOpenSetup({ confidence_score: 74, id: "e", symbol: "EURUSD" }),
      buildOpenSetup({ confidence_score: 74, id: "b", symbol: "BTCUSD" }),
      buildOpenSetup({ confidence_score: 74, id: "a", symbol: "ADAUSD" }),
    ];
    assert.deepEqual(
      buildTradeCards(tied, NOW).map((card) => card.setup.symbol),
      ["ADAUSD", "BTCUSD", "EURUSD"],
    );
  });

  it("groups Open above Pending — the trade with money at risk reads first", () => {
    // The adjudication, stated: spec §8 names the two statuses that live here
    // but rules nothing about their order, so the rail groups by state and
    // sorts by confidence inside each group — the same shape the Insights
    // ledger uses (day groups, the durable sort within one). A weak Open still
    // outranks a strong Pending, because a filled position is the one that can
    // move against the reader while they read.
    const cards = buildTradeCards(
      [
        buildSetup({ confidence_score: 99, id: "pending", status: "generated" }),
        buildOpenSetup({ confidence_score: 51, id: "open" }),
      ],
      NOW,
    );
    assert.deepEqual(cards.map((card) => card.setup.id), ["open", "pending"]);
  });

  it("sorts a copy — the caller's own array is never reordered underneath it", () => {
    const setups = [
      buildOpenSetup({ confidence_score: 62, id: "weak" }),
      buildOpenSetup({ confidence_score: 91, id: "strong" }),
    ];
    buildTradeCards(setups, NOW);
    assert.deepEqual(setups.map((setup) => setup.id), ["weak", "strong"]);
  });

  it("takes the ordering from the shared comparator rather than writing its own", () => {
    assert.match(
      RAIL_SOURCE,
      /import \{[\s\S]{0,140}compareSetupsByConfidence[\s\S]{0,140}\} from "\.\/historyUtils"/,
    );
  });
});

describe("buildRemainingLevels", () => {
  const pendingState: TradeState = {
    instruction: "Order pending at 1.0865 — nothing to do yet",
    progressR: null,
    status: "pending",
    tp1Banked: false,
  };
  const openPreT1State: TradeState = {
    instruction: "canonical",
    progressR: null,
    status: "open",
    tp1Banked: false,
  };
  const openT1HitState: TradeState = {
    instruction: "bank half",
    progressR: null,
    status: "open",
    tp1Banked: true,
  };

  it("shows Entry, SL, T1, and T2 while pending (nothing has happened yet)", () => {
    const levels = buildRemainingLevels(buildSetup(), pendingState);
    assert.deepEqual(
      levels.map((level) => level.label),
      ["Entry", "SL", "T1", "T2"],
    );
  });

  it("drops Entry once filled, keeping SL and both targets pre-T1", () => {
    const levels = buildRemainingLevels(
      buildSetup({ status: "placed" }),
      openPreT1State,
    );
    assert.deepEqual(
      levels.map((level) => level.label),
      ["SL", "T1", "T2"],
    );
  });

  it("drops T1 once it has already been banked (state.tp1Banked)", () => {
    const levels = buildRemainingLevels(
      buildSetup({ status: "placed" }),
      openT1HitState,
    );
    assert.deepEqual(
      levels.map((level) => level.label),
      ["SL", "T2"],
    );
  });

  it('labels the single target plainly ("Target") when the setup has no ladder', () => {
    const levels = buildRemainingLevels(
      buildSetup({ take_profit_1: null }),
      pendingState,
    );
    assert.deepEqual(
      levels.map((level) => level.label),
      ["Entry", "SL", "Target"],
    );
  });

  it("formats every level value through the shared price formatter, never raw", () => {
    const levels = buildRemainingLevels(
      buildSetup({ stop_loss: 1.083 }),
      pendingState,
    );
    const stop = levels.find((level) => level.label === "SL");
    assert.ok(stop);
    assert.equal(
      stop.value,
      (1.083).toLocaleString(undefined, { maximumFractionDigits: 8 }),
    );
  });

  it("falls back to an em dash instead of rendering a raw NaN for a malformed level", () => {
    const levels = buildRemainingLevels(
      buildSetup({ stop_loss: "not-a-number" }),
      pendingState,
    );
    const stop = levels.find((level) => level.label === "SL");
    assert.equal(stop?.value, "—");
  });
});

describe("CurrentTradesRail markup (source-pinned — see header comment)", () => {
  it('carries the container testid the Desk build verifies against, exactly "current-trades-rail"', () => {
    assert.match(RAIL_SOURCE, /data-testid="current-trades-rail"/);
  });

  it('titles the surface exactly "Current trades", no footnote (spec §8 copy discipline)', () => {
    assert.match(RAIL_SOURCE, />\s*Current trades\s*</);
  });

  it("closes with the mock's one cross-link and nothing else (a-desk-v3.html:231)", () => {
    assert.match(RAIL_SOURCE, />\s*All results → Insights\s*</);
  });

  it("colors the status chip by caution/buy tone, never sell or a literal hex", () => {
    assert.match(
      RAIL_SOURCE,
      /chip \$\{isPending \? "text-caution" : "text-buy"\}/,
    );
  });

  it("colors the side chip by buy/sell tone", () => {
    assert.match(RAIL_SOURCE, /chip \$\{isBuy \? "text-buy" : "text-sell"\}/);
  });

  it('renders the refresh control as a real button, styled as the kit\'s 44px tertiary link, labeled lowercase "refresh"', () => {
    assert.match(
      RAIL_SOURCE,
      /<button\s+className="tertiary-link"\s+type="button"\s+onClick=\{handleRefresh\}\s*>\s*refresh\s*<\/button>/,
    );
  });

  it('stamps freshness as "as of {time} · refresh", not a raw timestamp', () => {
    assert.match(RAIL_SOURCE, /as of \{formatClockTime\(lastRefreshedAt\)\} ·/);
  });

  it("never invents its own fetch machinery or nav — refresh defers to the onRefresh prop, every jump to WorkspaceNav", () => {
    // Exhaustive by design: the surface has exactly three controls, and none of
    // them may grow a fetch or a routing mechanism of its own.
    const onClickHandlers = RAIL_SOURCE.match(/onClick=\{[^}]*\}/g) ?? [];
    assert.deepEqual(onClickHandlers, [
      "onClick={handleRefresh}",
      "onClick={() => nav.openInsights()}",
      "onClick={() => nav.openAdvisor(setup)}",
    ]);
    assert.match(RAIL_SOURCE, /onRefresh\(\)/);
  });
});

// The owner's second finding, 2026-08-02: "The whole point of the Current
// Trades section is to serve as a reliable reference for the trades we
// generate, so we need to be able to come back to the expanded detail view if
// we click on it." The card is the affordance, so the card is a button — the
// same shape MarketScanRow already is, spans inside rather than block elements
// a <button> may not legally contain.
describe("each position card is the affordance that reopens its own setup", () => {
  // The card element itself, start to end — located from its own handler
  // outward rather than by a `<button` regex, which would otherwise start at
  // the rail's refresh control higher up the file.
  const CARD_HANDLER = "onClick={() => nav.openAdvisor(setup)}";
  const card = RAIL_SOURCE.slice(
    RAIL_SOURCE.lastIndexOf("<button", RAIL_SOURCE.indexOf(CARD_HANDLER)),
    RAIL_SOURCE.lastIndexOf("</button>") + "</button>".length,
  );

  it("is a real <button>, keyboard-reachable and typed", () => {
    assert.ok(card.includes(CARD_HANDLER), "expected to locate the card's <button>");
    assert.match(card, /type="button"/);
  });

  it("hands the whole stored row to the one cross-link, never a bare symbol", () => {
    // §17m.1 killed symbol-only stage entry: a symbol alone reloads the chart
    // and leaves the ladder, the why rows and the receipt empty, which is
    // exactly the third finding of this wave on the Insights side.
    assert.doesNotMatch(RAIL_SOURCE, /nav\.openAdvisor\(setup\.symbol\)/);
    assert.match(RAIL_SOURCE, /nav\.openAdvisor\(setup\)/);
  });

  it("reflects the stage's own selection with the scan rail's treatment and aria-current", () => {
    // a-desk-v3.html:153's `.mkt.sel`, the app's existing selected row: the
    // sheet fill it already has plus the 3px inset accent edge, and no new
    // border (§17c box discipline). Nothing textual is added — the edge and
    // aria-current say it, so §17f writes no string.
    assert.match(card, /aria-current=\{selected\}/);
    assert.match(card, /shadow-\[inset_3px_0_0_var\(--color-accent\)\]/);
    // Exactly two bordered frames in the file, not one (fix round 1,
    // amendment 23's offset ruling, 2026-08-05): the reopenable card above
    // and the non-interactive record TradeStateCard's !reopenable branch
    // renders for a display-excluded symbol's stored row — same visual
    // treatment, same "one box" discipline, just two possible wrapper tags
    // for it now. Not a third, gratuitous box: box-discipline's own
    // full-repo scan (tests/boxDiscipline.test.ts) still covers this file.
    assert.equal((RAIL_SOURCE.match(/border border-hairline/g) ?? []).length, 2);
  });

  it("holds phrasing content only — no article, heading, paragraph or div inside a button", () => {
    assert.doesNotMatch(card, /<article/);
    assert.doesNotMatch(card, /<h\d/);
    assert.doesNotMatch(card, /<p\b/);
    assert.doesNotMatch(card, /<div/);
    // And the type scale the block elements carried is intact on the spans that
    // replaced them.
    assert.match(card, /<span className="truncate text-base font-semibold text-ink">/);
    assert.match(card, /<span className="mt-2 block text-sm leading-5 text-ink-muted">/);
  });

  it("adds no label of its own — the card's own content is the accessible name (§17f)", () => {
    // MarketScanRow's precedent: a result row's name comes from what it shows.
    // An aria-label here would REPLACE the symbol, side, status, instruction and
    // levels with one sentence — less reference, not more.
    assert.doesNotMatch(card, /aria-label/);
  });
});

// I2: the rail never remounts when mobile switches which Desk column is
// showing, so its own mount-time lastRefreshedAt baseline can't re-stamp
// itself for that transition on its own — this re-stamps it whenever the
// rail becomes the active mobile view, pairing with App.tsx's own
// force-refresh effect (mobileNav.test.ts) that does the real re-fetch.
describe("CurrentTradesRail mobile freshness re-stamp (source-pinned, I2)", () => {
  it("re-stamps lastRefreshedAt when isActiveOnMobile becomes true, guarded so leaving sets nothing", () => {
    assert.match(
      RAIL_SOURCE,
      /useEffect\(\(\) => \{\s*if \(isActiveOnMobile\) \{\s*setLastRefreshedAt\(new Date\(\)\);\s*\}\s*\}, \[isActiveOnMobile\]\);/,
    );
  });
});

// Q2-C2: useTradeSetups computed an error string no consumer read, so a failed
// history fetch — a PostgREST timeout, an RLS error, a dropped connection —
// arrived here as `setups: []` and printed "No current trades.": a factual claim
// about the account, made by a surface that had just failed to learn anything
// about it. The repo already codified the opposite rule for the scan path
// (tradeAnalyzer.ts's MarketScanResponse.failed: "a failed scan must never
// render like a scan that genuinely found nothing"); the history path, feeding
// both this rail and Insights, was the exception.
describe("CurrentTradesRail says the fetch failed rather than claiming no trades (Q2-C2)", () => {
  it("routes the empty state through the load-failure flag, one shared sentence", () => {
    assert.match(RAIL_SOURCE, /loadFailed: boolean;/);
    assert.match(
      RAIL_SOURCE,
      /cards\.length === 0[\s\S]{0,200}\{loadFailed \? HISTORY_LOAD_FAILED_COPY : "No current trades\."\}/,
    );
    // One source for the sentence, shared with Insights — not a second copy
    // that can drift from it.
    assert.match(
      RAIL_SOURCE,
      /import \{[\s\S]{0,80}HISTORY_LOAD_FAILED_COPY[\s\S]{0,80}\} from "\.\/historyUtils"/,
    );
  });

  it("keeps the failure sentence to the register the scan rail already set", () => {
    assert.equal(
      HISTORY_LOAD_FAILED_COPY,
      "Trade history could not load. Try again shortly.",
    );
    assert.doesNotMatch(HISTORY_LOAD_FAILED_COPY, /!/);
  });
});
