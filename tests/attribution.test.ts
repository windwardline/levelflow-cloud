import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ATTRIBUTION_LEARNING_MIN_RESOLVED,
  buildAttribution,
  netRForSlice,
  type SliceTally,
} from "../src/components/workspace/attribution";
import {
  buildConfidenceBands,
  filterInsightsSetups,
  formatSignedR,
} from "../src/components/workspace/historyUtils";
import { LEDGER_WINDOW_ROWS, type TradeSetupRow } from "../src/lib/tradeAnalyzer";

// Same builder shape as tests/historyUtils.test.ts and
// tests/outcomes.test.ts — every field a real TradeSetupRow needs,
// overridable per test.
type OutcomeRow = NonNullable<TradeSetupRow["trade_outcomes"]>[number];

const NOW = new Date("2026-07-30T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

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
    origin: "review",
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

function buildOutcome(overrides: Partial<OutcomeRow> = {}): OutcomeRow {
  return {
    exit_at: null,
    feedback: {},
    filled_at: null,
    outcome: "pending",
    realized_pnl: null,
    reviewed_at: null,
    ...overrides,
  };
}

// A money-positive resolution (classifyWinLoss "win"), optionally carrying the
// realizedR figure the net-R rule depends on.
function won(
  overrides: Partial<TradeSetupRow> = {},
  realizedR: number | null = null,
): TradeSetupRow {
  return buildSetup({
    status: "closed",
    trade_outcomes: [
      buildOutcome({
        feedback: realizedR === null ? {} : { realizedR },
        outcome: "take_profit",
      }),
    ],
    ...overrides,
  });
}

// A money-negative resolution (classifyWinLoss "loss").
function lost(
  overrides: Partial<TradeSetupRow> = {},
  realizedR: number | null = null,
): TradeSetupRow {
  return buildSetup({
    status: "closed",
    trade_outcomes: [
      buildOutcome({
        feedback: realizedR === null ? {} : { realizedR },
        outcome: "stop_loss",
      }),
    ],
    ...overrides,
  });
}

function group(setups: TradeSetupRow[], key: string) {
  const found = buildAttribution(setups).find(
    (candidate) => candidate.key === key,
  );
  assert.ok(found, `expected an attribution group keyed "${key}"`);
  return found;
}

function row(setups: TradeSetupRow[], groupKey: string, rowLabel: string) {
  const found = group(setups, groupKey).rows.find(
    (candidate) => candidate.label === rowLabel,
  );
  assert.ok(found, `expected a "${rowLabel}" row in the ${groupKey} group`);
  return found;
}

describe("buildAttribution — the four slice groups (spec §18)", () => {
  it("returns exactly four groups, in the spec's own order", () => {
    assert.deepEqual(
      buildAttribution([]).map((slice) => slice.key),
      ["class", "side", "confidence", "session"],
    );
  });

  it("labels each group with one word of the surface's own vocabulary", () => {
    assert.deepEqual(
      buildAttribution([]).map((slice) => slice.label),
      ["Asset class", "Side", "Confidence", "Session"],
    );
  });

  it("renders every row of every group on empty history — nothing hides", () => {
    const attribution = buildAttribution([]);
    assert.deepEqual(
      attribution.map((slice) => slice.rows.length),
      [6, 2, 3, 3],
    );
    for (const slice of attribution) {
      for (const sliceRow of slice.rows) {
        assert.equal(sliceRow.resolved, 0);
        // Below the gate, so BOTH figures are withheld and both read
        // "Learning" (§18, amendment 3: one gate, both numbers).
        assert.equal(sliceRow.learning, true);
        assert.equal(sliceRow.moneyPositivePercent, null);
        assert.equal(sliceRow.netR, null);
      }
    }
  });

  it("carries the six asset classes in the app's canonical category order", () => {
    assert.deepEqual(
      group([], "class").rows.map((sliceRow) => sliceRow.label),
      ["Crypto", "Energies", "Forex", "Futures", "Indices", "Metals"],
    );
  });

  it("carries both sides, named the way the ledger's own chip names them", () => {
    assert.deepEqual(
      group([], "side").rows.map((sliceRow) => sliceRow.label),
      ["Buy", "Sell"],
    );
  });

  it("carries the three confidence tiers, in the builder's own order, keyed by the band ids it joins on", () => {
    // The confidence rows are built FROM the shared builder's bands — the
    // join reads each band's own `id`, not a position in a parallel array —
    // so the keys here are the band ids and the order is the builder's
    // (CONFIDENCE_TIERS' order, which the builder itself maps).
    assert.deepEqual(
      group([], "confidence").rows.map((sliceRow) => ({
        key: sliceRow.key,
        label: sliceRow.label,
      })),
      [
        { key: "qualified", label: "Qualified" },
        { key: "strong", label: "Strong" },
        { key: "best", label: "Best" },
      ],
    );
  });

  it("carries the three session blocks, named as spec §18 names them", () => {
    assert.deepEqual(
      group([], "session").rows.map((sliceRow) => sliceRow.label),
      ["Asia", "Europe", "US"],
    );
  });
});

describe("buildAttribution — slice math", () => {
  it("counts a symbol's resolutions into its own asset class, and no other", () => {
    const setups = [
      won({ id: "a", symbol: "EURUSD" }),
      lost({ id: "b", symbol: "EURUSD" }),
      won({ id: "c", symbol: "BTCUSD" }),
    ];

    assert.equal(row(setups, "class", "Forex").resolved, 2);
    assert.equal(row(setups, "class", "Crypto").resolved, 1);
    assert.equal(row(setups, "class", "Metals").resolved, 0);
  });

  it("splits Buy from Sell on the row's own side", () => {
    const setups = [
      won({ id: "a", side: "buy" }),
      won({ id: "b", side: "buy" }),
      lost({ id: "c", side: "sell" }),
    ];

    assert.equal(row(setups, "side", "Buy").resolved, 2);
    assert.equal(row(setups, "side", "Sell").resolved, 1);
  });

  it("rounds the money-positive percentage the way the record band rounds it", () => {
    // 2 of 3 = 66.66…% -> 67%, matching buildRecordBand's Math.round.
    const setups = [
      won({ id: "a" }),
      won({ id: "b" }),
      lost({ id: "c" }),
    ];

    assert.equal(row(setups, "side", "Buy").moneyPositivePercent, 67);
  });

  it("counts only resolved rows — a pending, unfilled, or unclear row is neither", () => {
    const setups = [
      won({ id: "a" }),
      won({ id: "b" }),
      won({ id: "c" }),
      // classifyWinLoss "neither", all three of them.
      buildSetup({ id: "pending" }),
      buildSetup({
        id: "unfilled",
        status: "expired",
        trade_outcomes: [buildOutcome({ outcome: "unfilled" })],
      }),
      buildSetup({
        id: "unclear",
        status: "closed",
        trade_outcomes: [buildOutcome({ outcome: "ambiguous" })],
      }),
    ];

    const buy = row(setups, "side", "Buy");
    assert.equal(buy.resolved, 3);
    assert.equal(buy.moneyPositivePercent, 100);
  });
});

describe("buildAttribution — one gate, both numbers (spec §18: below 3 resolved)", () => {
  it("states the threshold as the spec states it", () => {
    assert.equal(ATTRIBUTION_LEARNING_MIN_RESOLVED, 3);
  });

  it("withholds both figures at 2 resolved, even with an R on every row", () => {
    // Amendment 3 (owner, 2026-08-02: "Yes. I want fidelity across the
    // board."): net R sits BEHIND the gate now, not beside it. Two settled
    // rows that both recorded an R still publish nothing — three resolved is
    // the bar for both cells.
    const setups = [won({ id: "a" }, 1.5), lost({ id: "b" }, -1)];
    const buy = row(setups, "side", "Buy");

    assert.equal(buy.resolved, 2);
    assert.equal(buy.learning, true);
    assert.equal(buy.moneyPositivePercent, null);
    assert.equal(buy.netR, null);
  });

  it("publishes both figures at exactly 3 resolved", () => {
    const setups = [
      won({ id: "a" }, 1),
      lost({ id: "b" }, -1),
      lost({ id: "c" }, -1),
    ];
    const buy = row(setups, "side", "Buy");

    assert.equal(buy.resolved, 3);
    assert.equal(buy.learning, false);
    assert.equal(buy.moneyPositivePercent, 33);
    assert.equal(buy.netR, -1);
  });

  it("keeps the two withholdings apart: Learning is too little history, the em dash is a missing R", () => {
    // §18 states them as different facts. Above the gate with one row lacking
    // an R, the slice is not learning — it has settled evidence and no total.
    const setups = [
      won({ id: "a" }, 1.5),
      lost({ id: "b" }, -1),
      won({ id: "c" }, null),
    ];
    const buy = row(setups, "side", "Buy");

    assert.equal(buy.learning, false);
    assert.equal(buy.moneyPositivePercent, 67);
    assert.equal(buy.netR, null);
  });

  it("gates on resolved rows, never on rows loaded — an unresolved row cannot open the gate", () => {
    const setups = [
      won({ id: "a" }, 1),
      lost({ id: "b" }, -1),
      buildSetup({ id: "pending" }),
      buildSetup({ id: "pending-2" }),
    ];
    const buy = row(setups, "side", "Buy");

    assert.equal(buy.resolved, 2);
    assert.equal(buy.learning, true);
  });

  it("withholds nothing but the figures — the resolved count is always published", () => {
    // The count is what makes "Learning" legible: two of three is visible
    // progress toward the bar, not a hidden state.
    const setups = [won({ id: "a" }), lost({ id: "b" })];

    assert.equal(row(setups, "side", "Buy").resolved, 2);
    assert.equal(row(setups, "class", "Forex").resolved, 2);
  });

  it("applies the same gate to the confidence slice, which buildConfidenceBands does not itself apply", () => {
    const setups = [
      won({ confidence_score: 78, id: "a" }, 1.5),
      lost({ confidence_score: 80, id: "b" }, -1),
    ];

    // The reused slice reports a rate at 2 resolved; §18's gate is what
    // withholds it here, so the two are genuinely different numbers and this
    // is a real assertion rather than a restatement.
    const band = buildConfidenceBands(setups).bands.find(
      (candidate) => candidate.label === "Strong",
    );
    assert.equal(band?.resolved, 2);
    assert.equal(band?.winRate, 50);

    const strong = row(setups, "confidence", "Strong");
    assert.equal(strong.learning, true);
    assert.equal(strong.moneyPositivePercent, null);
    // Amendment 3's last line: the confidence row's two cells are gated on one
    // resolved count, so net R cannot publish while the rate beside it withholds.
    assert.equal(strong.netR, null);
  });

  it("opens the confidence gate on the same count both cells read", () => {
    const setups = [
      won({ confidence_score: 78, id: "a" }, 1.5),
      lost({ confidence_score: 80, id: "b" }, -1),
      won({ confidence_score: 84, id: "c" }, 0.5),
    ];

    const band = buildConfidenceBands(setups).bands.find(
      (candidate) => candidate.label === "Strong",
    );
    const strong = row(setups, "confidence", "Strong");
    assert.equal(strong.resolved, band?.resolved);
    assert.equal(strong.learning, false);
    assert.equal(strong.moneyPositivePercent, band?.winRate);
    assert.equal(strong.netR, 1);
  });
});

describe("buildAttribution — net R is all-or-nothing (spec §18)", () => {
  it("sums realizedR when every resolved row in the slice recorded one", () => {
    const setups = [
      won({ id: "a" }, 1.5),
      lost({ id: "b" }, -1),
      won({ id: "c" }, 0.5),
    ];

    assert.equal(row(setups, "side", "Buy").netR, 1);
  });

  it("withholds net R when even one resolved row in the slice lacks a figure", () => {
    const setups = [
      won({ id: "a" }, 1.5),
      lost({ id: "b" }, -1),
      won({ id: "c" }, null),
    ];

    assert.equal(row(setups, "side", "Buy").netR, null);
  });

  it("ignores an unresolved row's realizedR entirely — neither summed nor counted against the rule", () => {
    const setups = [
      won({ id: "a" }, 1.5),
      lost({ id: "b" }, -0.5),
      won({ id: "c" }, 1),
      // Open, with a running R the ledger legitimately shows. §18 sums
      // resolved rows only, so this figure must not reach the total.
      buildSetup({
        id: "open",
        trade_outcomes: [
          buildOutcome({
            feedback: { realizedR: 9 },
            filled_at: "2026-07-30T10:00:00.000Z",
          }),
        ],
      }),
    ];

    assert.equal(row(setups, "side", "Buy").netR, 2);
  });

  it("withholds net R on a slice with no resolved rows at all", () => {
    assert.equal(row([buildSetup()], "side", "Sell").netR, null);
  });

  it("sums a slice whose figures cancel to zero as zero, not as absent", () => {
    // Stated at the gate's own floor (amendment 3): below three resolved this
    // slice would read "Learning" and the case would stop testing the thing it
    // was written for — that zero is a real total, not a missing one.
    const setups = [
      won({ id: "a" }, 1.5),
      lost({ id: "b" }, -1),
      lost({ id: "c" }, -0.5),
    ];

    const buy = row(setups, "side", "Buy");
    assert.equal(buy.resolved, 3);
    assert.equal(buy.netR, 0);
  });
});

describe("netRForSlice — the sum answers for the count beside it (spec §18)", () => {
  // The confidence slice publishes buildConfidenceBands' resolved count and sums
  // net R from this module's own tally. They agree by construction today —
  // identical tier bounds, identical resolved definition — so buildAttribution
  // cannot reach a mismatch from any input, which is exactly why the guard is
  // driven directly here rather than left as a comment nobody can exercise.
  function tally(overrides: Partial<SliceTally> = {}): SliceTally {
    return {
      realizedRSum: 3,
      resolved: 3,
      resolvedWithRealizedR: 3,
      wins: 2,
      ...overrides,
    };
  }

  it("sums when the tally accounts for exactly the rows the row publishes", () => {
    assert.equal(netRForSlice(tally(), 3), 3);
  });

  it("withholds when the tally holds FEWER rows than the count published", () => {
    // The real defect this stops: a total summed over 2 rows printed beside a
    // resolved count of 3 reads as the settled result of all three.
    assert.equal(
      netRForSlice(
        tally({ realizedRSum: 2, resolved: 2, resolvedWithRealizedR: 2 }),
        3,
      ),
      null,
    );
  });

  it("withholds when the tally holds MORE rows than the count published", () => {
    assert.equal(
      netRForSlice(
        tally({ realizedRSum: 4, resolved: 4, resolvedWithRealizedR: 4 }),
        3,
      ),
      null,
    );
  });

  it("withholds when one accounted row carried no R", () => {
    assert.equal(netRForSlice(tally({ resolvedWithRealizedR: 2 }), 3), null);
  });

  it("withholds when there is no tally at all", () => {
    assert.equal(netRForSlice(undefined, 3), null);
    assert.equal(netRForSlice(undefined, 0), null);
  });

  it("sums a zero total as zero, not as absent", () => {
    assert.equal(netRForSlice(tally({ realizedRSum: 0 }), 3), 0);
  });
});

describe("buildAttribution — session blocks by created_at UTC hour (spec §18)", () => {
  function sessionOf(hourUtc: string) {
    const setups = [won({ created_at: `2026-07-30T${hourUtc}:00.000Z` })];
    const filled = group(setups, "session").rows.filter(
      (sliceRow) => sliceRow.resolved === 1,
    );
    assert.equal(
      filled.length,
      1,
      `expected exactly one session block to claim ${hourUtc} UTC`,
    );
    return filled[0].label;
  }

  // The three boundaries are stated as law in §18, and each belongs to the
  // block that STARTS there — half-open [start, end) — which is the only
  // reading that partitions all 24 hours with no gap and no overlap.
  it("gives 07:00 exactly to Europe, not to Asia", () => {
    assert.equal(sessionOf("07:00"), "Europe");
  });

  it("gives 13:00 exactly to US, not to Europe", () => {
    assert.equal(sessionOf("13:00"), "US");
  });

  it("gives 22:00 exactly to Asia, not to US", () => {
    assert.equal(sessionOf("22:00"), "Asia");
  });

  it("gives the last minute before each boundary to the block that owns it", () => {
    assert.equal(sessionOf("06:59"), "Asia");
    assert.equal(sessionOf("12:59"), "Europe");
    assert.equal(sessionOf("21:59"), "US");
  });

  it("wraps Asia across midnight UTC — 23:00 and 00:00 are the same block", () => {
    assert.equal(sessionOf("23:00"), "Asia");
    assert.equal(sessionOf("00:00"), "Asia");
  });

  it("reads the hour in UTC, never in the runtime's local zone", () => {
    // 03:00 in Tokyo on the 31st is 18:00 UTC on the 30th: US, not Asia.
    assert.equal(sessionOf("18:00"), "US");
  });

  it("claims all 24 hours across the three blocks, once each", () => {
    const setups = Array.from({ length: 24 }, (_, hour) =>
      won({
        created_at: `2026-07-30T${String(hour).padStart(2, "0")}:30:00.000Z`,
        id: `hour-${hour}`,
      }));
    const sessions = group(setups, "session");

    assert.equal(
      sessions.rows.reduce((total, sliceRow) => total + sliceRow.resolved, 0),
      24,
    );
    assert.deepEqual(
      sessions.rows.map((sliceRow) => [sliceRow.label, sliceRow.resolved]),
      [["Asia", 9], ["Europe", 6], ["US", 9]],
    );
  });

  it("puts a row with an unreadable created_at in no session block, while its other slices still count it", () => {
    // No silent bucketing: an unparseable timestamp has no session, and
    // guessing one would be a fabricated fact. Every other slice knows the
    // row perfectly well, so it stays counted there.
    const setups = [won({ created_at: "not-a-date" })];

    assert.equal(
      group(setups, "session").rows.reduce(
        (total, sliceRow) => total + sliceRow.resolved,
        0,
      ),
      0,
    );
    assert.equal(row(setups, "side", "Buy").resolved, 1);
    assert.equal(row(setups, "class", "Forex").resolved, 1);
  });
});

describe("buildAttribution — the confidence slice reuses buildConfidenceBands", () => {
  it("reports the same resolved counts the shared band builder reports", () => {
    const setups = [
      won({ confidence_score: 70, id: "a" }),
      lost({ confidence_score: 74, id: "b" }),
      won({ confidence_score: 80, id: "c" }),
      won({ confidence_score: 92, id: "d" }),
      lost({ confidence_score: 100, id: "e" }),
    ];

    const { bands } = buildConfidenceBands(setups);
    assert.deepEqual(
      group(setups, "confidence").rows.map((sliceRow) => ({
        label: sliceRow.label,
        resolved: sliceRow.resolved,
      })),
      bands.map((band) => ({ label: band.label, resolved: band.resolved })),
    );
  });

  it("counts a row that cleared its own class's bar into Qualified, even below the fixed 66 floor", () => {
    // CONFIDENCE_TIERS start at 66; a Forex setup qualifies at 40. The ledger
    // already prints these rows "Qualified 50%" (formatConfidenceWithTier's
    // threshold rule), and the slice now counts them where that word puts
    // them — the banding half of the same law. Before this wave they were
    // silently dropped from the confidence slice while every other slice
    // counted them (§18's parked observation, closed).
    const setups = [
      won({ confidence_score: 50, id: "a" }, 1),
      won({ confidence_score: 50, id: "b" }, 1),
      lost({ confidence_score: 50, id: "c" }, -1),
    ];

    assert.equal(row(setups, "class", "Forex").resolved, 3);
    const qualified = row(setups, "confidence", "Qualified");
    assert.equal(qualified.resolved, 3);
    assert.equal(qualified.learning, false);
    assert.equal(qualified.moneyPositivePercent, 67);
    // The net R tally reads the same threshold-aware membership the count
    // does — one taxonomy, so the all-or-nothing sum publishes rather than
    // tripping netRForSlice's mismatch guard.
    assert.equal(qualified.netR, 1);
  });

  it("keeps a row that cleared no bar out of every band — class-relative in both directions", () => {
    // The same 52 that lands in Qualified for Forex (bar 40) belongs to no
    // band for Crypto (bar 82). Only legacy rows can sit here — the engine
    // refuses generation below the bar — and they are counted by the builder
    // (tests/core.test.ts pins the exhaustiveness invariant), just never
    // labeled with a word they did not earn.
    const setups = [
      won({ confidence_score: 52, id: "a", symbol: "BTCUSD" }),
      won({ confidence_score: 52, id: "b", symbol: "BTCUSD" }),
      won({ confidence_score: 52, id: "c", symbol: "BTCUSD" }),
    ];

    assert.equal(row(setups, "class", "Crypto").resolved, 3);
    assert.equal(
      group(setups, "confidence").rows.reduce(
        (total, sliceRow) => total + sliceRow.resolved,
        0,
      ),
      0,
    );
    assert.equal(buildConfidenceBands(setups).unbanded, 3);
  });

  it("sums net R per band on the same all-or-nothing rule as every other slice", () => {
    // Three resolved in each band, so both are through the gate and the only
    // thing separating them is the all-or-nothing rule itself.
    const setups = [
      won({ confidence_score: 78, id: "a" }, 1.5),
      lost({ confidence_score: 82, id: "b" }, -1),
      won({ confidence_score: 75, id: "c" }, 0.5),
      won({ confidence_score: 90, id: "d" }, 2),
      lost({ confidence_score: 95, id: "e" }, -1),
      won({ confidence_score: 100, id: "f" }, null),
    ];

    assert.equal(row(setups, "confidence", "Strong").netR, 1);
    assert.equal(row(setups, "confidence", "Best").netR, null);
    assert.equal(row(setups, "confidence", "Best").learning, false);
  });
});

describe("buildAttribution — net R is the raw sum; the ledger's formatter rounds it", () => {
  it("returns the unrounded total, which the surface renders through formatSignedR", () => {
    // 1.2 - 0.5 - 0.5 is 0.19999999999999996 in binary floating point (three
    // rows, so the slice is through the gate). Rounding inside the aggregator
    // would decide the display precision here instead of at the one place that
    // owns it, so the sum stays raw and the ledger's own one-decimal formatter
    // is what the reader sees.
    const setups = [
      won({ id: "a" }, 1.2),
      lost({ id: "b" }, -0.5),
      lost({ id: "c" }, -0.5),
    ];
    const netR = row(setups, "side", "Buy").netR;

    assert.ok(netR !== null);
    assert.notEqual(netR, 0.2);
    assert.equal(formatSignedR(netR), "+0.2R");
  });
});

describe("buildAttribution — neither the filters nor the page apply (spec §18)", () => {
  it("takes no filter argument at all — there is nothing to wire in", () => {
    // The signature is the guard: one parameter, the lifetime row set. A
    // period, a status, a market scope, or even `now` would all have to be
    // added before Attribution could narrow, and adding one fails this.
    assert.equal(buildAttribution.length, 1);
  });

  it("counts every resolved row past the ledger's display window (amendment 2)", () => {
    // The truncation the ruling closes: 80 rows is what the ledger reads, so a
    // section fed the ledger's array published a lifetime claim about a page.
    // Rows beyond the window here are the only Metals in the record, and their
    // figures are what the window could not have produced.
    const setups = [
      ...Array.from({ length: LEDGER_WINDOW_ROWS }, (_, index) =>
        won({ id: `window-${index}`, symbol: "EURUSD" })),
      ...Array.from({ length: 4 }, (_, index) =>
        won({ id: `beyond-${index}`, symbol: "XAUUSD" }, 1)),
      lost({ id: "beyond-loss", symbol: "XAUUSD" }, -1),
    ];

    const displayWindow = setups.slice(0, LEDGER_WINDOW_ROWS);
    assert.equal(row(displayWindow, "class", "Metals").resolved, 0);

    const metals = row(setups, "class", "Metals");
    assert.equal(metals.resolved, 5);
    assert.equal(metals.moneyPositivePercent, 80);
    assert.equal(metals.netR, 3);
  });

  it("counts rows the panel's own default filters exclude", () => {
    const setups = [
      // Older than every Period option, so the ledger below never shows it.
      won({
        created_at: new Date(NOW.getTime() - 200 * DAY_MS).toISOString(),
        id: "ancient",
        symbol: "XAUUSD",
      }),
      won({ id: "recent", symbol: "EURUSD" }),
      lost({ id: "recent-2", symbol: "EURUSD" }),
    ];

    const visible = filterInsightsSetups(
      setups,
      { market: { kind: "all" }, periodDays: 90, status: "all" },
      NOW,
    );
    assert.equal(visible.length, 2, "expected the old row to be filtered out");

    // The section answers "what works", not "what am I looking at": the
    // filtered view and the full history disagree, and Attribution follows
    // the full history.
    assert.equal(row(setups, "class", "Metals").resolved, 1);
    assert.equal(row(visible, "class", "Metals").resolved, 0);
    assert.notDeepEqual(buildAttribution(setups), buildAttribution(visible));
  });
});
