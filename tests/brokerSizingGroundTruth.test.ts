import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { usdPerCurrencyBridge } from "../src/lib/broker/bridging";
import {
  BROKER_INSTRUMENTS,
  findBrokerInstrument,
} from "../src/lib/broker/instruments";
import { perUnitValue, sizeSetup } from "../src/lib/broker/sizing";
import { PROGRAM_LINES } from "../src/lib/broker/programs";
import { SIZE_STATE_WORDS } from "../src/lib/broker/types";

/**
 * §19c — per-unit value, anchored OUTSIDE the code.
 *
 * WHY THIS FILE EXISTS. The §19c budget property in tests/brokerSizing.test.ts
 * recomputes per-unit value in its own helper. That helper was written by
 * copying production's shape, so it inherited production's bug: both read an
 * index's per-point multiplier as dollars when three of the six rows publish
 * theirs in euros, yen and Australian dollars. The property passed 26/26 on
 * commit b06a162 while the live desk sized DAX to 115.4% of its risk budget.
 * Two independent wrongs agreed, and independence bought nothing.
 *
 * A budget CEILING also cannot see the other two: over-pricing a point
 * UNDER-sizes, and `worstCaseLoss <= riskBudget` holds all the way down. ASX
 * was 29.6% small and NIKKEI 157x small, silently, for the whole period.
 *
 * So the oracle here is not another reimplementation. It is E8's own order
 * tickets: the dollar figure their checkout showed for 1.00 lot over 100 ticks,
 * and the FX rate that session was priced at. Production has to reproduce that
 * number. Nothing in src/ can move to satisfy it.
 */

/**
 * E8 Pro Forex checkout, 2026-08-02, batch 2 — one row per FX-denominated index.
 *
 * `legPrice` is STATED here, never derived from the row's own bridge. Deriving
 * it would cancel an inverted-bridge mutation out on both sides and leave this
 * file green over the exact error it exists to catch.
 *
 * `noteFigures` are asserted to still appear in the row's own provenance note,
 * which is what keeps this transcription and the prose from drifting apart.
 */
const TICKET_OBSERVATIONS = [
  {
    symbol: "ASX",
    currency: "AUD",
    pointsPerLot: 20,
    leg: "AUDUSD",
    legPrice: 0.704,
    usdPerPoint: 14.08,
    noteFigures: ["14.08", "AUD20/point"],
  },
  {
    symbol: "DAX",
    currency: "EUR",
    pointsPerLot: 5,
    leg: "EURUSD",
    legPrice: 1.1544,
    usdPerPoint: 5.77,
    noteFigures: ["5.77", "EUR5/point"],
  },
  {
    symbol: "NIKKEI",
    currency: "JPY",
    pointsPerLot: 500,
    // The note writes this rate as "USDJPY (0.00634)". 0.00634 is JPY->USD;
    // USDJPY is its reciprocal, ~157.73. The note's LABEL is wrong and its
    // ARITHMETIC is right, so the reciprocal assertion below pins both.
    leg: "USDJPY",
    legPrice: 157.7287,
    usdPerPoint: 3.17,
    noteFigures: ["3.17", "Y500/point"],
  },
] as const;

/** The three that publish a dollar multiplier outright. Bridge is definitionally 1. */
const USD_INDEX_SYMBOLS = ["SP", "NSDQ", "DOW"] as const;

describe("§19c — per-unit value against E8's own order tickets", () => {
  for (const ticket of TICKET_OBSERVATIONS) {
    it(`${ticket.symbol}: reproduces the ticket's own dollar figure`, () => {
      const row = findBrokerInstrument("one", ticket.symbol);
      assert.ok(row, `${ticket.symbol} has no row on line one`);
      assert.equal(row.unit.kind, "index_points");
      if (row.unit.kind !== "index_points") return;

      // The row still says what the ticket said.
      assert.equal(row.unit.pointsCurrency, ticket.currency);
      assert.equal(row.unit.pointsPerLot.value, ticket.pointsPerLot);
      const note = row.unit.pointsPerLot.source.observation?.note ?? "";
      for (const figure of ticket.noteFigures) {
        assert.ok(
          note.includes(figure),
          `${ticket.symbol} note no longer states ${figure}: ${note}`,
        );
      }

      // THE ORACLE. At the rate that session was priced at, one point is worth
      // the dollars E8's checkout showed. A flat read gives pointsPerLot; an
      // inverted bridge gives pointsPerLot/rate; only the correct bridge lands.
      const { value, word } = perUnitValue(row, { [ticket.leg]: ticket.legPrice });
      assert.equal(word, null, `${ticket.symbol} refused: ${word}`);
      assert.ok(value !== null);
      assert.ok(
        Math.abs(value - ticket.usdPerPoint) / ticket.usdPerPoint < 0.005,
        `${ticket.symbol} per-unit ${value} is not the ticket's $${ticket.usdPerPoint} ` +
          `(flat would be ${ticket.pointsPerLot}, inverted ` +
          `${ticket.pointsPerLot / (ticket.usdPerPoint / ticket.pointsPerLot)})`,
      );
    });
  }

  it("NIKKEI's note states the reciprocal of its leg, mislabelled as USDJPY", () => {
    // Pins the trap rather than leaving it to be 'corrected' into a real defect:
    // someone reading "USDJPY (0.00634)" may replace 0.00634 with a true USDJPY
    // quote, which would price a yen point 24,865x too high.
    const nikkei = TICKET_OBSERVATIONS.find((t) => t.symbol === "NIKKEI")!;
    assert.ok(
      Math.abs(1 / nikkei.legPrice - 0.00634) < 1e-5,
      `1/${nikkei.legPrice} should be the note's 0.00634`,
    );
  });

  for (const symbol of USD_INDEX_SYMBOLS) {
    it(`${symbol}: a dollar multiplier passes through untouched`, () => {
      const row = findBrokerInstrument("one", symbol);
      assert.ok(row);
      assert.equal(row.unit.kind, "index_points");
      if (row.unit.kind !== "index_points") return;
      assert.equal(row.unit.pointsCurrency, "USD");
      // The control: no FX quote supplied at all, and it still resolves. If a
      // USD row ever needed a leg, this fails rather than silently refusing.
      const { value, word } = perUnitValue(row, {});
      assert.equal(word, null);
      assert.equal(value, row.unit.pointsPerLot.value);
    });
  }

  it("every index row on every CFD line is covered by this file", () => {
    // DERIVED, not curated. A seventh index row, or a currency change on an
    // existing one, fails here rather than shipping unanchored.
    const covered = new Set<string>([
      ...TICKET_OBSERVATIONS.map((t) => t.symbol),
      ...USD_INDEX_SYMBOLS,
    ]);
    const seen = new Set<string>();
    let rows = 0;
    for (const row of BROKER_INSTRUMENTS) {
      if (row.unit.kind !== "index_points") continue;
      rows += 1;
      seen.add(row.levelflowSymbol);
      assert.ok(
        covered.has(row.levelflowSymbol),
        `${row.levelflowSymbol} is an index_points row with no ground-truth anchor`,
      );
      // Every row's currency resolves to a leg Levelflow already scans. The
      // currency is authored once per symbol but rides many rows, so this
      // asserts over the rows rather than the symbols.
      assert.ok(
        usdPerCurrencyBridge(row.unit.pointsCurrency),
        `${row.programLine}:${row.levelflowSymbol} currency ` +
          `${row.unit.pointsCurrency} has no USD leg`,
      );
    }
    assert.deepEqual(
      [...seen].sort(),
      [...covered].sort(),
      "the anchored set and the real index rows have diverged",
    );
    assert.ok(rows > seen.size, `${rows} index rows across lines, expected several per symbol`);
  });
});

/**
 * The same three tickets' MARGIN column, and the price each was quoted at
 * (docs/research/e8-observations-2026-08-02.md:47-50). This anchors the OTHER
 * half of the arithmetic: E8's max-position formula divides by
 * `instrumentPrice * contractSize`, and for an index that product is the
 * per-lot notional. If the contract size is left in its own currency the
 * denominator is euros or yen while the numerator is account dollars.
 *
 * The identity used below is leverage-free by construction:
 *   marginCap        = leverage * accountSize / (price * contractSizeUsd)
 *   marginPerLot     = price * contractSizeUsd / leverage
 *   marginCap * marginPerLot = accountSize
 * so the test never restates E8's formula — it asserts that a cap and the
 * margin E8 actually charged multiply back to the account.
 *
 * Reproduced at these figures: bridged lands within 0.06% of every observed
 * margin; unbridged misses by 13.3% (DAX), 42.0% (ASX) and 15,665% (NIKKEI).
 */
const OBSERVED_MARGIN = [
  { symbol: "NIKKEI", price: 63_173.22, marginPerLot: 13_357.17, leg: "USDJPY", legPrice: 157.7287 },
  { symbol: "ASX", price: 8_942.57, marginPerLot: 8_396.58, leg: "AUDUSD", legPrice: 0.704 },
  { symbol: "DAX", price: 25_810.06, marginPerLot: 9_926.07, leg: "EURUSD", legPrice: 1.1544 },
] as const;

/** The leverage E8's observed margins were charged at. Pinned, not assumed. */
const OBSERVED_LEVERAGE = 15;

describe("§19c step 6 — the margin cap against E8's own charged margin", () => {
  for (const observed of OBSERVED_MARGIN) {
    it(`${observed.symbol}: cap x E8's margin returns the account`, () => {
      const program = PROGRAM_LINES.find((line) => line.line === "pro_forex")!;
      const leverage = program.leverage.indices?.value ?? null;
      assert.equal(
        leverage,
        OBSERVED_LEVERAGE,
        "index leverage moved; re-derive the observed margins before trusting this",
      );

      const accountSize = 100_000;
      const result = sizeSetup({
        accountSize,
        entryPrice: observed.price,
        // A stop wide enough that the risk budget never binds before the cap.
        stopLoss: observed.price * 0.5,
        quotes: { [observed.symbol]: observed.price, [observed.leg]: observed.legPrice },
        riskPercent: 1.5,
        stage: "challenge",
        levelflowSymbol: observed.symbol,
        programLine: "pro_forex",
      });
      assert.equal(result.kind, "size", `${observed.symbol}: ${JSON.stringify(result)}`);
      if (result.kind !== "size") return;

      const expected = accountSize / observed.marginPerLot;
      const found = result.caps.find(
        (cap) => Math.abs(cap - expected) / expected < 0.01,
      );
      assert.ok(
        found !== undefined,
        `${observed.symbol}: no cap near ${expected.toFixed(4)} in ${JSON.stringify(result.caps)} ` +
          `— an unbridged denominator would give ${(expected * (observed.symbol === "NIKKEI" ? 157.73 : observed.symbol === "ASX" ? 1.4205 : 0.8663)).toFixed(4)}`,
      );
    });
  }
});

describe("§19e — an index with no FX leg refuses rather than guessing", () => {
  for (const ticket of TICKET_OBSERVATIONS) {
    it(`${ticket.symbol}: blocks with Rate unavailable when its leg is absent`, () => {
      // The desk's ordinary analyze-one-market path holds only the scanned
      // symbol's quote, so this is the common case rather than an edge one.
      const result = sizeSetup({
        accountSize: 100_000,
        entryPrice: 20_000,
        stopLoss: 19_900,
        quotes: { [ticket.symbol]: 20_000 },
        riskPercent: 0.5,
        stage: "challenge",
        levelflowSymbol: ticket.symbol,
        programLine: "one",
      });
      assert.equal(result.kind, "blocked", `${ticket.symbol} sized without its FX leg`);
      if (result.kind !== "blocked") return;
      assert.equal(result.word, SIZE_STATE_WORDS.rateUnavailable);
    });
  }

  for (const ticket of TICKET_OBSERVATIONS) {
    it(`${ticket.symbol}: perUnitValue itself refuses, not just the caps path`, () => {
      // sizeSetup blocks even with this arm broken, because the margin-cap arm
      // refuses too. Asserting only the blocked outcome therefore cannot tell
      // the two apart, and a per-unit fallback would ride through unseen.
      const row = findBrokerInstrument("one", ticket.symbol)!;
      const { value, word } = perUnitValue(row, {});
      assert.equal(value, null, `${ticket.symbol} produced a per-unit value with no leg`);
      assert.equal(word, SIZE_STATE_WORDS.rateUnavailable);
    });
  }

  for (const symbol of USD_INDEX_SYMBOLS) {
    it(`${symbol}: still sizes with no FX leg at all`, () => {
      const result = sizeSetup({
        accountSize: 100_000,
        entryPrice: 20_000,
        stopLoss: 19_900,
        quotes: { [symbol]: 20_000 },
        riskPercent: 0.5,
        stage: "challenge",
        levelflowSymbol: symbol,
        programLine: "one",
      });
      assert.equal(result.kind, "size", `${symbol}: ${JSON.stringify(result)}`);
    });
  }
});
