import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildRemainingLevels,
  buildTradeCards,
  formatAsOf,
  formatProgressR,
} from "../src/components/workspace/CurrentTradesRail";
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

describe("formatProgressR", () => {
  it('shows "—" for no progress, never 0 or blank', () => {
    assert.equal(formatProgressR(null), "—");
  });

  it("signs a positive R explicitly and rounds to one decimal", () => {
    assert.equal(formatProgressR(0.84), "+0.8R");
  });

  it("keeps the native minus sign for a negative R", () => {
    assert.equal(formatProgressR(-1), "-1.0R");
  });

  it("signs exactly zero as positive, matching >= 0", () => {
    assert.equal(formatProgressR(0), "+0.0R");
  });
});

describe("formatAsOf", () => {
  it("renders the same local hour:minute Intl.DateTimeFormat produces, regardless of machine locale", () => {
    const date = new Date("2026-07-30T15:34:00.000Z");
    const expected = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
    assert.equal(formatAsOf(date), expected);
  });
});

describe("buildTradeCards", () => {
  it("keeps pending and open setups, in their given order, paired with their derived state", () => {
    const pending = buildSetup({ id: "a", status: "generated" });
    const open = buildSetup({
      id: "b",
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
    });

    const cards = buildTradeCards([pending, open], NOW);
    assert.deepEqual(cards.map((card) => card.setup.id), ["a", "b"]);
    assert.equal(cards[0]?.state.status, "pending");
    assert.equal(cards[1]?.state.status, "open");
  });

  it("drops resolved/closed setups entirely — deriveTradeState's null contract", () => {
    const closed = buildSetup({ id: "closed", status: "filled" });
    assert.deepEqual(buildTradeCards([closed], NOW), []);
  });

  it("returns an empty list for no setups", () => {
    assert.deepEqual(buildTradeCards([], NOW), []);
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
    assert.match(RAIL_SOURCE, /as of \{formatAsOf\(lastRefreshedAt\)\} ·/);
  });

  it("never invents its own fetch machinery or nav — refresh defers to the onRefresh prop, the cross-link to WorkspaceNav", () => {
    // Exhaustive by design: the surface has exactly two controls, and neither
    // may grow a fetch or a routing mechanism of its own.
    const onClickHandlers = RAIL_SOURCE.match(/onClick=\{[^}]*\}/g) ?? [];
    assert.deepEqual(onClickHandlers, [
      "onClick={handleRefresh}",
      "onClick={() => nav.openInsights()}",
    ]);
    assert.match(RAIL_SOURCE, /onRefresh\(\)/);
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
