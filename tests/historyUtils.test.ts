import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { MAX_PRICE_DECIMALS } from "../src/components/workspace/advisorFormat";
import {
  asNumber,
  asRecord,
  buildInsightsGroups,
  buildRecordBand,
  compareSetupsByConfidence,
  computeInsightsStatus,
  extractRealizedR,
  filterInsightsSetups,
  formatPriceValue,
  formatSignedR,
  isWithinPeriod,
  marketFilterValue,
  matchesMarketFilter,
  parseMarketFilterValue,
} from "../src/components/workspace/historyUtils";
import type { ScanScope } from "../src/components/workspace/ScopeMenu";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

// Same walker tests/deskComposition.test.ts and tests/tailwindVariantGuard.test.ts
// use, so a tree-wide guard here reads the same set of files they do.
function allSourceFiles(root: string): string[] {
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => join(root, file));
}

// Same builder shape as tests/tradeState.test.ts and
// tests/currentTradesRail.test.tsx — every field a real TradeSetupRow needs,
// overridable per test.
type OutcomeRow = NonNullable<TradeSetupRow["trade_outcomes"]>[number];

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

function formattedPrice(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: MAX_PRICE_DECIMALS,
  });
}

describe("formatSignedR", () => {
  it("signs a positive R with a leading plus, one decimal", () => {
    assert.equal(formatSignedR(0.84), "+0.8R");
  });

  it("signs a negative R with a typographic minus sign (U+2212), not a hyphen", () => {
    assert.equal(formatSignedR(-1), "−1.0R");
  });

  it("signs exactly zero as positive", () => {
    assert.equal(formatSignedR(0), "+0.0R");
  });

  it("rounds to one decimal place", () => {
    assert.equal(formatSignedR(2.14), "+2.1R");
    assert.equal(formatSignedR(-1.049), "−1.0R");
  });
});

describe("formatPriceValue", () => {
  it("renders a finite number through the shared formatNumber", () => {
    assert.equal(formatPriceValue(1.0865), formattedPrice(1.0865));
  });

  it('falls back to an em dash for null, never "0" — Number(null) is 0, not NaN', () => {
    assert.equal(formatPriceValue(null), "—");
  });

  it("falls back to an em dash for undefined (e.g. a non-laddered take_profit_1)", () => {
    assert.equal(formatPriceValue(undefined), "—");
  });

  it("falls back to an em dash for an empty string", () => {
    assert.equal(formatPriceValue(""), "—");
  });

  it("falls back to an em dash for a non-numeric string", () => {
    assert.equal(formatPriceValue("not-a-number"), "—");
  });
});

describe("isWithinPeriod", () => {
  it("includes a setup created exactly at the period boundary", () => {
    const setup = buildSetup({
      created_at: new Date(NOW.getTime() - 7 * DAY_MS).toISOString(),
    });
    assert.equal(isWithinPeriod(setup, 7, NOW), true);
  });

  it("excludes a setup created one millisecond past the period boundary", () => {
    const setup = buildSetup({
      created_at: new Date(NOW.getTime() - 7 * DAY_MS - 1).toISOString(),
    });
    assert.equal(isWithinPeriod(setup, 7, NOW), false);
  });

  it("includes a setup well within the period", () => {
    const setup = buildSetup({
      created_at: new Date(NOW.getTime() - DAY_MS).toISOString(),
    });
    assert.equal(isWithinPeriod(setup, 30, NOW), true);
  });

  it("excludes a setup well outside the period", () => {
    const setup = buildSetup({
      created_at: new Date(NOW.getTime() - 91 * DAY_MS).toISOString(),
    });
    assert.equal(isWithinPeriod(setup, 90, NOW), false);
  });

  it("excludes a setup with an unparseable created_at rather than throwing", () => {
    const setup = buildSetup({ created_at: "not-a-date" });
    assert.equal(isWithinPeriod(setup, 90, NOW), false);
  });
});

describe("market filter value round-trip", () => {
  it("round-trips the all scope", () => {
    const scope: ScanScope = { kind: "all" };
    assert.deepEqual(parseMarketFilterValue(marketFilterValue(scope)), scope);
  });

  it("round-trips a group scope", () => {
    const scope: ScanScope = { assetType: "Forex", kind: "group" };
    assert.deepEqual(parseMarketFilterValue(marketFilterValue(scope)), scope);
  });

  it("round-trips a symbol scope", () => {
    const scope: ScanScope = { kind: "symbol", symbol: "EURUSD" };
    assert.deepEqual(parseMarketFilterValue(marketFilterValue(scope)), scope);
  });
});

describe("matchesMarketFilter", () => {
  const eurusd = buildSetup({ symbol: "EURUSD" });
  const btcusd = buildSetup({ symbol: "BTCUSD" });

  it('the "all" scope matches every market', () => {
    assert.equal(matchesMarketFilter(eurusd, { kind: "all" }), true);
    assert.equal(matchesMarketFilter(btcusd, { kind: "all" }), true);
  });

  it("a group scope matches only setups in that category", () => {
    const scope: ScanScope = { assetType: "Forex", kind: "group" };
    assert.equal(matchesMarketFilter(eurusd, scope), true);
    assert.equal(matchesMarketFilter(btcusd, scope), false);
  });

  it("a symbol scope matches only that exact symbol", () => {
    const scope: ScanScope = { kind: "symbol", symbol: "EURUSD" };
    assert.equal(matchesMarketFilter(eurusd, scope), true);
    assert.equal(matchesMarketFilter(btcusd, scope), false);
  });
});

describe("computeInsightsStatus (deriveTradeState semantics, spec §10)", () => {
  it("an unfilled, freshly generated setup is pending", () => {
    assert.equal(
      computeInsightsStatus(buildSetup({ status: "generated" }), NOW),
      "pending",
    );
  });

  it("a filled setup with an unresolved outcome is open", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ outcome: "pending" })],
    });
    assert.equal(computeInsightsStatus(setup, NOW), "open");
  });

  it("a filled setup with a resolved outcome is closed", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
    });
    assert.equal(computeInsightsStatus(setup, NOW), "closed");
  });

  it("a cancelled setup with no outcome row at all is closed, not open", () => {
    assert.equal(
      computeInsightsStatus(buildSetup({ status: "cancelled" }), NOW),
      "closed",
    );
  });
});

describe("extractRealizedR", () => {
  it("reads a present, finite realizedR from feedback jsonb", () => {
    const setup = buildSetup({
      trade_outcomes: [buildOutcome({ feedback: { realizedR: 0.4 } })],
    });
    assert.equal(extractRealizedR(setup), 0.4);
  });

  it("returns null when feedback has no realizedR", () => {
    const setup = buildSetup({
      trade_outcomes: [buildOutcome({ feedback: { tp1Hit: true } })],
    });
    assert.equal(extractRealizedR(setup), null);
  });

  it("returns null when there is no outcome row at all, without throwing", () => {
    assert.equal(extractRealizedR(buildSetup({ trade_outcomes: undefined })), null);
  });

  it("returns null for a non-numeric realizedR rather than NaN", () => {
    const setup = buildSetup({
      trade_outcomes: [buildOutcome({ feedback: { realizedR: "bad" } })],
    });
    assert.equal(extractRealizedR(setup), null);
  });
});

describe("filterInsightsSetups", () => {
  const eurusdOpen = buildSetup({
    created_at: NOW.toISOString(),
    id: "eurusd-open",
    status: "placed",
    symbol: "EURUSD",
    trade_outcomes: [buildOutcome({ outcome: "pending" })],
  });
  const btcusdClosedOld = buildSetup({
    created_at: new Date(NOW.getTime() - 60 * DAY_MS).toISOString(),
    id: "btcusd-closed-old",
    status: "filled",
    symbol: "BTCUSD",
    trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
  });
  const eurusdPending = buildSetup({
    created_at: NOW.toISOString(),
    id: "eurusd-pending",
    status: "generated",
    symbol: "EURUSD",
  });
  const all = [eurusdOpen, btcusdClosedOld, eurusdPending];

  it("passes every setup through with the all/all/widest-period defaults", () => {
    const result = filterInsightsSetups(
      all,
      { market: { kind: "all" }, periodDays: 90, status: "all" },
      NOW,
    );
    assert.deepEqual(result.map((setup) => setup.id), [
      "eurusd-open",
      "btcusd-closed-old",
      "eurusd-pending",
    ]);
  });

  it("applies the market filter", () => {
    const result = filterInsightsSetups(
      all,
      { market: { kind: "symbol", symbol: "EURUSD" }, periodDays: 90, status: "all" },
      NOW,
    );
    assert.deepEqual(result.map((setup) => setup.id), [
      "eurusd-open",
      "eurusd-pending",
    ]);
  });

  it("applies the status filter", () => {
    const result = filterInsightsSetups(
      all,
      { market: { kind: "all" }, periodDays: 90, status: "closed" },
      NOW,
    );
    assert.deepEqual(result.map((setup) => setup.id), ["btcusd-closed-old"]);
  });

  it("applies the period filter", () => {
    const result = filterInsightsSetups(
      all,
      { market: { kind: "all" }, periodDays: 7, status: "all" },
      NOW,
    );
    assert.deepEqual(result.map((setup) => setup.id), [
      "eurusd-open",
      "eurusd-pending",
    ]);
  });

  it("combines all three filters with AND semantics", () => {
    const result = filterInsightsSetups(
      all,
      {
        market: { assetType: "Crypto", kind: "group" },
        periodDays: 90,
        status: "closed",
      },
      NOW,
    );
    assert.deepEqual(result.map((setup) => setup.id), ["btcusd-closed-old"]);
  });
});

describe("buildInsightsGroups", () => {
  it("groups by day, newest day first, newest setup first within a day", () => {
    const groups = buildInsightsGroups([
      buildSetup({ created_at: "2026-07-28T09:00:00.000Z", id: "a" }),
      buildSetup({ created_at: "2026-07-29T09:00:00.000Z", id: "b" }),
      buildSetup({ created_at: "2026-07-29T15:00:00.000Z", id: "c" }),
    ]);

    assert.deepEqual(
      groups.map((group) => group.items.map((item) => item.id)),
      [["c", "b"], ["a"]],
    );
  });

  // Q1-#20 collapsed sortHistorySetups and groupHistorySetups to the one mode
  // each that was ever reachable, so the day label and the group ORDER are now
  // this function's whole contract — no re-sort of the groups, because rows
  // arrive newest-first and first appearance is the order.
  it("labels each group with its own day, and never merges two days into one", () => {
    const groups = buildInsightsGroups([
      buildSetup({ created_at: "2026-07-29T15:00:00.000Z", id: "c" }),
      buildSetup({ created_at: "2026-07-28T09:00:00.000Z", id: "a" }),
      buildSetup({ created_at: "2026-07-29T09:00:00.000Z", id: "b" }),
    ]);
    assert.equal(groups.length, 2);
    assert.notEqual(groups[0].label, groups[1].label);
    for (const group of groups) {
      assert.equal(group.key, group.label);
      assert.ok(group.label.length > 0);
    }
  });
});

describe("buildRecordBand", () => {
  it("counts setups created within the last 7 days as this week's, from the loaded rows regardless of the panel's own filters", () => {
    const band = buildRecordBand(
      [
        buildSetup({ created_at: NOW.toISOString(), id: "a" }),
        buildSetup({
          created_at: new Date(NOW.getTime() - 6 * DAY_MS).toISOString(),
          id: "b",
        }),
        buildSetup({
          created_at: new Date(NOW.getTime() - 8 * DAY_MS).toISOString(),
          id: "c",
        }),
      ],
      NOW,
    );
    assert.equal(band.setupsThisWeek, 2);
  });

  it('reports null money-positive % ("Learning") when nothing has resolved yet', () => {
    const band = buildRecordBand(
      [buildSetup({ status: "generated" })],
      NOW,
    );
    assert.equal(band.moneyPositivePercent, null);
  });

  it("computes money-positive % as wins over wins+losses, matching the ladder win definition", () => {
    const band = buildRecordBand(
      [
        buildSetup({
          id: "win-1",
          status: "filled",
          trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
        }),
        buildSetup({
          id: "win-2",
          status: "filled",
          trade_outcomes: [buildOutcome({ outcome: "tp1_partial" })],
        }),
        buildSetup({
          id: "loss-1",
          status: "filled",
          trade_outcomes: [buildOutcome({ outcome: "stop_loss" })],
        }),
        // Neither a win nor a loss — must not dilute the denominator.
        buildSetup({
          id: "unfilled-1",
          status: "expired",
          trade_outcomes: [buildOutcome({ outcome: "unfilled" })],
        }),
      ],
      NOW,
    );
    assert.equal(band.moneyPositivePercent, 67);
  });

  it('reports null net R ("—") when no row has a realizedR yet', () => {
    const band = buildRecordBand(
      [
        buildSetup({
          status: "filled",
          trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
        }),
      ],
      NOW,
    );
    assert.equal(band.netR, null);
  });

  it("sums every present realizedR into net R", () => {
    const band = buildRecordBand(
      [
        buildSetup({
          id: "a",
          trade_outcomes: [buildOutcome({ feedback: { realizedR: 0.4 } })],
        }),
        buildSetup({
          id: "b",
          trade_outcomes: [buildOutcome({ feedback: { realizedR: -1 } })],
        }),
        // No realizedR at all — must be skipped, not treated as 0.
        buildSetup({ id: "c", trade_outcomes: [buildOutcome({})] }),
      ],
      NOW,
    );
    assert.ok(band.netR !== null);
    assert.equal(Math.round((band.netR ?? 0) * 10) / 10, -0.6);
  });

  it('reports null best market ("Learning") when nothing has resolved yet', () => {
    const band = buildRecordBand([buildSetup({ status: "generated" })], NOW);
    assert.equal(band.bestMarket, null);
  });

  it("picks the symbol with the highest money-positive rate as best market", () => {
    const band = buildRecordBand(
      [
        buildSetup({
          symbol: "EURUSD",
          trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
        }),
        buildSetup({
          symbol: "GBPUSD",
          trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
        }),
        buildSetup({
          symbol: "GBPUSD",
          trade_outcomes: [buildOutcome({ outcome: "stop_loss" })],
        }),
      ],
      NOW,
    );
    // EURUSD: 1/1 = 100%. GBPUSD: 1/2 = 50%.
    assert.equal(band.bestMarket, "EURUSD");
  });

  it("breaks a tied win rate by resolved-count, then breaks a full tie alphabetically", () => {
    const band = buildRecordBand(
      [
        // Both symbols are 100% at 1 resolved trade each — alphabetical
        // tiebreak should pick BTCUSD over ETHUSD.
        buildSetup({
          symbol: "ETHUSD",
          trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
        }),
        buildSetup({
          symbol: "BTCUSD",
          trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
        }),
      ],
      NOW,
    );
    assert.equal(band.bestMarket, "BTCUSD");
  });
});

// Q1-I8: asRecord and asNumber existed twice, byte-identical in behaviour — once
// exported here and once private in SetupQualityReceipt.tsx — in a repo whose
// drift-guard culture treats duplication as a defect in its own right.
describe("the JSON coercion helpers have one home (Q1-I8)", () => {
  it("is the only definition of either, and the receipt reads it", () => {
    const receipt = readFileSync(
      "src/components/workspace/SetupQualityReceipt.tsx",
      "utf8",
    );
    assert.doesNotMatch(receipt, /function asRecord/);
    assert.doesNotMatch(receipt, /function asNumber/);
    assert.match(
      receipt,
      /import \{ asNumber, asRecord \} from "\.\/historyUtils";/,
    );
  });

  it("coerces the way both call sites need", () => {
    assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
    assert.deepEqual(asRecord([1, 2]), {});
    assert.deepEqual(asRecord(null), {});
    assert.deepEqual(asRecord("x"), {});
    assert.equal(asNumber("2.5"), 2.5);
    assert.equal(asNumber(""), 0);
    assert.equal(asNumber("nope"), null);
    assert.equal(asNumber(null), 0);
    assert.equal(asNumber(undefined), null);
  });
});

// Q1-I12: one R quantity, two minus signs — the ledger printed U+2212 and the
// rail an ASCII hyphen, for the same figure in the same lifecycle vocabulary.
// The typographic minus is what §10's own examples use and what
// lib/outcomes.ts's "Expired −" labels already carry, so it is the one that
// stands; with the sign settled the two functions were identical, so there is
// one of them.
describe("signed R has one formatter and one minus sign (Q1-I12)", () => {
  it("renders the rail's own cases too, so the rail needs no second function", () => {
    // Carried over from the retired formatProgressR suite, minus-sign apart.
    assert.equal(formatSignedR(null), "—");
    assert.equal(formatSignedR(0.84), "+0.8R");
    assert.equal(formatSignedR(-1), "−1.0R");
    assert.equal(formatSignedR(0), "+0.0R");
  });

  it("is the only signed-R formatter in src", () => {
    const rail = readFileSync(
      "src/components/workspace/CurrentTradesRail.tsx",
      "utf8",
    );
    assert.doesNotMatch(rail, /function formatProgressR/);
    assert.match(rail, /\{formatSignedR\(state\.progressR\)\}/);
  });
});

// The durable sort law's one comparator (spec §4: "results are sorted by
// confidence for deciding — that is the only sorting deviation"). It was born
// inline in sortHistorySetups as the ledger's tie-break tiers (PR #150,
// owner-observed 2026-08-01); the Current trades rail needs exactly the same
// chain as its PRIMARY order, so the chain is extracted here and both surfaces
// call it. One function, not a mirror — the rail already imports from this
// module, so there is no layering reason for a second copy to exist.
describe("compareSetupsByConfidence — one comparator, two surfaces", () => {
  it("puts the stronger setup first", () => {
    assert.ok(
      compareSetupsByConfidence(
        buildSetup({ confidence_score: 62 }),
        buildSetup({ confidence_score: 88 }),
      ) > 0,
    );
    assert.ok(
      compareSetupsByConfidence(
        buildSetup({ confidence_score: 88 }),
        buildSetup({ confidence_score: 62 }),
      ) < 0,
    );
  });

  it("breaks a confidence tie with the universal symbol comparator, never input order", () => {
    const tied = [
      buildSetup({ confidence_score: 74, id: "e", symbol: "EURUSD" }),
      buildSetup({ confidence_score: 74, id: "b", symbol: "BTCUSD" }),
      buildSetup({ confidence_score: 74, id: "a", symbol: "ADAUSD" }),
    ];
    assert.deepEqual(
      [...tied].sort(compareSetupsByConfidence).map((setup) => setup.symbol),
      // compareAssetSymbols orders by category first (Crypto before Forex),
      // then base/quote — the same chain the scope menu and Insights use.
      ["ADAUSD", "BTCUSD", "EURUSD"],
    );
  });

  it("reads a string confidence the way the database returns one", () => {
    // numeric(…) arrives over PostgREST as a string; the ledger has always
    // coerced, and the extracted comparator must not quietly stop.
    assert.ok(
      compareSetupsByConfidence(
        buildSetup({ confidence_score: "62" }),
        buildSetup({ confidence_score: "88" }),
      ) > 0,
    );
  });

  it("is the ledger's own tie-break tier rather than a second copy of it", () => {
    const source = readFileSync(
      "src/components/workspace/historyUtils.ts",
      "utf8",
    );
    assert.match(
      source,
      /return secondDate - firstDate \|\| compareSetupsByConfidence\(first, second\);/,
    );
  });

  it("is the only confidence ordering anywhere in src", () => {
    // A second comparator would drift the moment either surface's tie-break
    // moved. The precedent for a sanctioned mirror is
    // tests/scanBatching.test.ts's — a client/Deno boundary that genuinely
    // cannot import across itself. This one has no such boundary, so the guard
    // is absence rather than byte-equality.
    //
    // The whole tree, and BOTH shapes the subtraction can take: the coerced
    // `Number(b.confidence_score) - Number(a.confidence_score)` this comparator
    // uses, and the bare `b.confidence_score - a.confidence_score` a twin would
    // more likely be written as. A guard that saw only the wrapped form, in only
    // the two files it happened to name, would have missed both.
    const hits = allSourceFiles("src").filter((file) =>
      /confidence_score\s*\)?\s*-(?!-)/.test(readFileSync(file, "utf8"))
    );
    assert.deepEqual(hits, ["src/components/workspace/historyUtils.ts"]);
    // And in that one file it appears exactly once — sortHistorySetups delegates
    // its tie-break tiers instead of spelling them out again.
    assert.equal(
      (readFileSync(hits[0], "utf8")
        .match(/confidence_score\s*\)?\s*-(?!-)/g) ?? []).length,
      1,
    );
  });
});
