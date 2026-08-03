import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildTradeCards,
  currentTradeBadgeCount,
} from "../src/components/workspace/CurrentTradesRail";
import {
  fetchSetupsByIds,
  type LifetimeSetupRow,
  type TradeSetupRow,
} from "../src/lib/tradeAnalyzer";
import { isActiveSetup } from "../src/lib/tradeState";

// The defect this file exists to pin (owner-dispatched, 2026-08-03, out of
// #208's scope): the rail and the Trades badge read the ledger's 80-row
// display window, so a filled trade older than the window's newest 80 rows
// vanished from both while still live at the broker — the exact "reliable
// reference" §8 forbids losing. The fix reads the lifetime record for
// ACTIVE rows the window missed and hydrates exactly those by id; these
// tests hold the predicate, the fetch's shape, and the consumers' behavior
// over a merged population. The hook's own wiring is pinned in
// tests/hooks.test.ts beside its other source pins.
const TRADE_STATE_SOURCE = readFileSync("src/lib/tradeState.ts", "utf8");
const ANALYZER_SOURCE = readFileSync("src/lib/tradeAnalyzer.ts", "utf8");

const NOW = new Date("2026-08-03T12:00:00.000Z");

function buildSetup(overrides: Partial<TradeSetupRow> = {}): TradeSetupRow {
  return {
    analyzer_version: "unversioned",
    breakeven_trigger_price: 1.0865,
    confidence_score: 78,
    confluence: {},
    correlation_group: null,
    created_at: "2026-08-03T09:00:00.000Z",
    id: "setup-window-1",
    limit_entry: 1.0865,
    risk_model: {},
    side: "buy",
    status: "generated",
    stop_loss: 1.081,
    symbol: "EURUSD",
    take_profit: 1.097,
    take_profit_1: 1.0917,
    origin: "scan",
    trade_outcomes: [],
    ...overrides,
  } as TradeSetupRow;
}

function narrowRow(
  overrides: Partial<LifetimeSetupRow> = {},
): LifetimeSetupRow {
  return {
    confidence_score: 70,
    created_at: "2026-08-01T09:00:00.000Z",
    id: "setup-lifetime-1",
    side: "buy",
    status: "generated",
    symbol: "XAUUSD",
    trade_outcomes: [],
    ...overrides,
  };
}

describe("isActiveSetup (spec §8 — the one active/closed predicate)", () => {
  it("counts a waiting order and a live position as active", () => {
    assert.equal(isActiveSetup(narrowRow({ status: "generated" })), true);
    assert.equal(
      isActiveSetup(narrowRow({
        status: "placed",
        trade_outcomes: [{
          feedback: { realizedR: 0.4 },
          filled_at: "2026-08-01T10:00:00.000Z",
          outcome: "pending",
        }],
      })),
      true,
    );
  });

  it("counts every closed status and every resolved outcome as inactive", () => {
    for (const status of ["filled", "invalidated", "cancelled", "expired"]) {
      assert.equal(isActiveSetup(narrowRow({ status })), false);
    }
    // The defensive pair deriveTradeState documents (Q2-I6): a resolved
    // outcome on a still-generated row is a finished trade, not an order.
    assert.equal(
      isActiveSetup(narrowRow({
        status: "generated",
        trade_outcomes: [{
          feedback: {},
          filled_at: null,
          outcome: "stop_loss",
        }],
      })),
      false,
    );
  });

  it("is the predicate deriveTradeState itself gates on — no second copy", () => {
    assert.match(
      TRADE_STATE_SOURCE,
      /if \(!isActiveSetup\(setup\)\) \{\n\s*return null;\n\s*\}/,
    );
    // Both status sets are consulted exactly once, inside the predicate —
    // a second `.has(` reader would be the second copy of the taxonomy
    // this extraction exists to prevent.
    assert.equal(
      TRADE_STATE_SOURCE.match(/CLOSED_SETUP_STATUSES\.has\(/g)?.length,
      1,
    );
    assert.equal(
      TRADE_STATE_SOURCE.match(/RESOLVED_OUTCOMES\.has\(/g)?.length,
      1,
    );
  });
});

describe("fetchSetupsByIds (the hydration read)", () => {
  it("answers an empty id list with no request at all", async () => {
    // Supabase is unconfigured under this harness, so any code path that
    // reached the client would throw "Supabase is not configured." — the
    // empty answer proves the short-circuit sits ahead of the client.
    assert.deepEqual(await fetchSetupsByIds([]), []);
  });

  it("reaches for the client only once there are ids to fetch", async () => {
    await assert.rejects(
      fetchSetupsByIds(["some-id"]),
      /Supabase is not configured\./,
    );
  });

  it("shares the ledger's own select and addresses rows by id — never by state", () => {
    // One literal, two readers: the window read and the hydration read must
    // return identically-shaped rows, so the select lives in one constant.
    assert.equal(ANALYZER_SOURCE.match(/const LEDGER_SELECT =/g)?.length, 1);
    assert.equal(
      ANALYZER_SOURCE.match(/\.select\(LEDGER_SELECT\)/g)?.length,
      2,
    );
    assert.match(ANALYZER_SOURCE, /\.in\("id", \[\.\.\.ids\]\)/);
    // The forbidden shape (§18: the server pages/addresses rows; the client
    // classifies them): no status/outcome predicate anywhere in src reads.
    assert.doesNotMatch(ANALYZER_SOURCE, /\.in\("status"/);
    assert.doesNotMatch(ANALYZER_SOURCE, /\.eq\("status"/);
  });
});

describe("the rail and badge over a merged population", () => {
  it("counts and renders an active row the window never carried", () => {
    const windowRows = [
      buildSetup({ id: "w1", status: "filled", symbol: "EURUSD" }),
      buildSetup({ id: "w2", status: "expired", symbol: "GBPUSD" }),
    ];
    const hydrated = buildSetup({
      created_at: "2026-08-01T09:00:00.000Z",
      id: "beyond-window-open",
      status: "placed",
      symbol: "XAUUSD",
      trade_outcomes: [{
        feedback: { realizedR: 0.6 },
        filled_at: "2026-08-01T10:00:00.000Z",
        outcome: "pending",
        realized_pnl: null,
        reviewed_at: null,
        exit_at: null,
      }],
    });

    const merged = windowRows.concat(hydrated);
    assert.equal(currentTradeBadgeCount(windowRows, NOW), 0);
    assert.equal(currentTradeBadgeCount(merged, NOW), 1);
    const cards = buildTradeCards(merged, NOW);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].setup.id, "beyond-window-open");
    assert.equal(cards[0].state.status, "open");
  });
});
