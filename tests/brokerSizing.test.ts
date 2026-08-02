import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AVAILABLE_ASSET_SYMBOLS } from "../src/lib/symbolMap.ts";
import {
  BROKER_INSTRUMENTS,
  E8_FUTURES_SPECS,
  SIZEABLE_MARKETS_BY_LINE,
  findBrokerInstrument,
} from "../src/lib/broker/instruments.ts";
import {
  CFD_STEP,
  FUTURES_STEP,
  floorToStep,
  invertedPriceScaleFactor,
  invertedStopDistance,
  sizeInstrument,
  sizeSetup,
  stateWordForTradability,
  type SizingContext,
} from "../src/lib/broker/sizing.ts";
import { PROGRAM_LINES, allowedMarginFor } from "../src/lib/broker/programs.ts";
import type {
  BrokerInstrument,
  ProgramLine,
  QuoteUnit,
  Stage,
} from "../src/lib/broker/types.ts";

// Spec §19f. Property tests over generated inputs, not example rows. The budget
// invariant is the one property that makes the whole feature safe: a rounded size
// whose worst-case loss exceeds the risk budget is a governor that authorizes more
// than it was told to.

// A deterministic generator, so a failure is a failure and not a flake. The suite
// has no property-testing dependency and this repo prefers its existing libraries
// to a new one.
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function between(random: () => number, low: number, high: number) {
  return low + random() * (high - low);
}

// Every quote a bridge can ask for, live and plausible, so the generated cases
// exercise arithmetic rather than the missing-quote branch.
const QUOTES: Record<string, number> = {
  AUDUSD: 0.664,
  EURUSD: 1.0842,
  GBPUSD: 1.2713,
  NZDUSD: 0.6031,
  USDCAD: 1.3644,
  USDCHF: 0.8792,
  USDJPY: 151.42,
  XAUUSD: 4_565.92,
  SP: 5_240.5,
  NSDQ: 18_310.25,
  DOW: 39_120,
};

function contextFor(
  symbol: string,
  random: () => number,
  overrides: Partial<SizingContext> = {},
): SizingContext {
  const price = QUOTES[symbol] ?? between(random, 20, 5_000);
  const stopDistance = price * between(random, 0.0008, 0.03);
  return {
    accountSize: 100_000,
    entryPrice: price,
    quotes: { ...QUOTES, [symbol]: price },
    riskPercent: 0.5,
    stage: "challenge",
    stopLoss: price - stopDistance,
    ...overrides,
  };
}

/** The dollar value of one 1.0 price-axis move per 1.0 unit, recomputed here. */
function perUnitFor(row: BrokerInstrument, context: SizingContext): number {
  switch (row.unit.kind) {
    case "futures_tick":
      return row.unit.valuePerTick.value! / row.unit.tickSize.value!;
    case "index_points":
      return row.unit.pointsPerLot.value!;
    case "forex_contract": {
      const quote = row.levelflowSymbol.slice(3, 6);
      const contractSize = row.unit.contractSize.value!;
      if (quote === "USD" || row.levelflowSymbol.length !== 6) {
        return contractSize;
      }
      const legs: Record<string, number> = {
        JPY: 1 / context.quotes.USDJPY!,
        CHF: 1 / context.quotes.USDCHF!,
        CAD: 1 / context.quotes.USDCAD!,
        AUD: context.quotes.AUDUSD!,
        EUR: context.quotes.EURUSD!,
        GBP: context.quotes.GBPUSD!,
        NZD: context.quotes.NZDUSD!,
      };
      return contractSize * legs[quote];
    }
  }
}

const SIZEABLE_CASES: { line: ProgramLine; symbols: string[] }[] = [
  { line: "one", symbols: SIZEABLE_MARKETS_BY_LINE.one },
  { line: "pro_forex", symbols: SIZEABLE_MARKETS_BY_LINE.pro_forex },
  { line: "zero", symbols: SIZEABLE_MARKETS_BY_LINE.zero },
  { line: "signature_futures", symbols: SIZEABLE_MARKETS_BY_LINE.signature_futures },
  {
    line: "zero_futures_starter",
    symbols: SIZEABLE_MARKETS_BY_LINE.zero_futures_starter,
  },
];

describe("§19c — the budget invariant, over generated inputs", () => {
  it("never lets the rounded size risk more than the budget authorizes", () => {
    const random = lcg(20_260_803);
    let cases = 0;
    for (const { line, symbols } of SIZEABLE_CASES) {
      const program = PROGRAM_LINES.find((p) => p.line === line)!;
      for (const symbol of symbols) {
        for (let trial = 0; trial < 12; trial += 1) {
          const accountSize = program
            .accountSizes[Math.floor(random() * program.accountSizes.length)];
          const riskPercent = Number(between(random, 0.1, 1.5).toFixed(2));
          const stage: Stage = random() < 0.5 ? "challenge" : "performance";
          const context = contextFor(symbol, random, {
            accountSize,
            riskPercent,
            stage,
          });
          const result = sizeSetup({ ...context, levelflowSymbol: symbol, programLine: line });
          assert.equal(result.kind, "size", `${line}:${symbol}`);
          if (result.kind !== "size") {
            continue;
          }
          const row = findBrokerInstrument(line, symbol)!;
          const stopDistance = Math.abs(context.entryPrice - context.stopLoss);
          const worstCaseLoss = result.units * stopDistance * perUnitFor(row, context);
          const riskBudget = accountSize * (riskPercent / 100);
          // The epsilon is floorToStep's own representation tolerance, not slack.
          assert.ok(
            worstCaseLoss <= riskBudget * (1 + 1e-9),
            `${line}:${symbol} risked ${worstCaseLoss} of ${riskBudget}`,
          );
          for (const cap of result.caps) {
            assert.ok(
              result.units <= cap + 1e-9,
              `${line}:${symbol} exceeded cap ${cap} with ${result.units}`,
            );
          }
          assert.equal(result.step, line.includes("futures") ? FUTURES_STEP : CFD_STEP);
          cases += 1;
        }
      }
    }
    // All three unit kinds and both step sizes are covered by the roster above.
    assert.ok(cases > 500, `only ${cases} generated cases ran`);
  });

  it("is monotone: never larger as the stop widens, never smaller as risk rises", () => {
    const random = lcg(7);
    for (const symbol of ["EURUSD", "GBPJPY", "XAUUSD"]) {
      const base = contextFor(symbol, random);
      let previous = Infinity;
      for (const multiple of [0.5, 1, 2, 4, 8]) {
        const distance = Math.abs(base.entryPrice - base.stopLoss) * multiple;
        const result = sizeSetup({
          ...base,
          levelflowSymbol: symbol,
          programLine: "one",
          stopLoss: base.entryPrice - distance,
        });
        assert.equal(result.kind, "size");
        if (result.kind !== "size") {
          continue;
        }
        assert.ok(result.units <= previous, `${symbol} grew as the stop widened`);
        previous = result.units;
      }
      let smaller = 0;
      for (const riskPercent of [0.1, 0.25, 0.5, 1, 1.5]) {
        const result = sizeSetup({
          ...base,
          levelflowSymbol: symbol,
          programLine: "one",
          riskPercent,
        });
        assert.equal(result.kind, "size");
        if (result.kind !== "size") {
          continue;
        }
        assert.ok(result.units >= smaller, `${symbol} shrank as risk rose`);
        smaller = result.units;
      }
    }
  });

  it("rounds down at both steps — never up, never nearest", () => {
    assert.equal(floorToStep(0.839, 0.01), 0.83);
    assert.equal(floorToStep(0.8399999, 0.01), 0.83);
    assert.equal(floorToStep(0.83, 0.01), 0.83);
    assert.equal(floorToStep(2.999, 1), 2);
    assert.equal(floorToStep(3, 1), 3);
    assert.equal(floorToStep(0.0099, 0.01), 0);
    const random = lcg(99);
    for (let trial = 0; trial < 2_000; trial += 1) {
      const raw = between(random, 0, 60);
      for (const step of [CFD_STEP, FUTURES_STEP]) {
        const floored = floorToStep(raw, step);
        assert.ok(floored <= raw * (1 + 1e-9) + 1e-12, `${raw} rounded up to ${floored}`);
        assert.ok(raw - floored < step, `${raw} lost more than a step`);
      }
    }
  });

  it("bounds the size by the futures margin allowance, not by a contract count", () => {
    // MGC's $1,000 margin permits 20 contracts on a $25K Signature account, where
    // reading E8's published column as a count would cap it at 2.
    const allowance = allowedMarginFor("signature_futures", 25_000, "challenge")!;
    assert.equal(allowance, 20_000);
    const row = findBrokerInstrument("signature_futures", "MGCUSD")!;
    assert.equal(row.marginPerContract.value, 1_000);
    const result = sizeSetup({
      accountSize: 25_000,
      entryPrice: 4_565.9,
      levelflowSymbol: "MGCUSD",
      programLine: "signature_futures",
      quotes: QUOTES,
      // A 0.1-point stop on a $100-per-point micro leaves the cap binding.
      riskPercent: 1.5,
      stage: "challenge",
      stopLoss: 4_565.8,
    });
    assert.equal(result.kind, "size");
    if (result.kind === "size") {
      assert.deepEqual(result.caps, [20]);
      assert.equal(result.units, 20);
      assert.equal(result.unit, "contracts");
    }
  });

  it("clamps Zero Futures Performance to the starting allowance it can see", () => {
    // The allowance scales with locked profit Levelflow cannot see, so the
    // conservative floor is what it asserts.
    const starting = allowedMarginFor("zero_futures_starter", 200_000, "performance");
    assert.equal(starting, 40_000);
    const result = sizeSetup({
      accountSize: 200_000,
      entryPrice: 5_240,
      levelflowSymbol: "ESUSD",
      programLine: "zero_futures_starter",
      quotes: QUOTES,
      riskPercent: 1.5,
      stage: "performance",
      stopLoss: 5_239.75,
    });
    assert.equal(result.kind, "size");
    if (result.kind === "size") {
      assert.deepEqual(result.caps, [4]);
    }
  });
});

describe("§19c — the SP500 scale trap", () => {
  it("sizes a 10-point stop at $20 per point, and never at a generic $1", () => {
    const row = findBrokerInstrument("one", "SP")!;
    assert.equal(row.unit.kind, "index_points");
    assert.equal(row.unit.kind === "index_points" ? row.unit.pointsPerLot.value : null, 20);

    const context: SizingContext = {
      accountSize: 50_000,
      entryPrice: 5_240,
      quotes: { ...QUOTES, SP: 5_240 },
      riskPercent: 0.5,
      stage: "challenge",
      stopLoss: 5_230,
    };
    const result = sizeInstrument(row, context);
    assert.equal(result.kind, "size");
    if (result.kind === "size") {
      assert.equal(result.units, 1.25);
      assert.equal(result.unit, "lots");
    }

    // The same setup against the $1/point most retail CFD desks quote would be 25
    // lots — twenty times the exposure. Unreachable: the multiplier comes from the
    // row, and no code path substitutes a default for it.
    const generic: BrokerInstrument = {
      ...row,
      unit: {
        kind: "index_points",
        pointsPerLot: { source: row.tradabilitySource, value: 1 },
      },
    };
    const wrong = sizeInstrument(generic, context);
    assert.equal(wrong.kind === "size" ? wrong.units : null, 25);
    assert.notEqual(
      wrong.kind === "size" ? wrong.units : null,
      result.kind === "size" ? result.units : null,
    );
  });

  it("charges the same S&P exposure differently on the two program families", () => {
    // $12.50 per 0.25 point as ES on a futures program; $20.00 per 1.0 point as the
    // SP500 CFD on a Markets program. One exposure, two numbers.
    const es = findBrokerInstrument("signature_futures", "ESUSD")!;
    assert.equal(es.unit.kind === "futures_tick" ? es.unit.valuePerTick.value : null, 12.5);
    assert.equal(es.unit.kind === "futures_tick" ? es.unit.tickSize.value : null, 0.25);
    const cfd = findBrokerInstrument("one", "SP")!;
    assert.equal(cfd.unit.kind === "index_points" ? cfd.unit.pointsPerLot.value : null, 20);
  });
});

describe("§19c step 4 — the inversion machinery, with zero confirmed inverted rows", () => {
  // 6J's real published numbers on a synthetic confirmed row. No such row ships:
  // every inverted mapping is a spot pair on a futures program, where E8 offers
  // nothing at all (§19a).
  const sixJ = E8_FUTURES_SPECS["6J"];
  const invertedRow: BrokerInstrument = {
    ...findBrokerInstrument("signature_futures", "USDJPY")!,
    tradability: "confirmed",
    brokerSymbol: "6J",
    inverted: true,
    unit: {
      kind: "futures_tick",
      tickSize: sixJ.tickSize,
      valuePerTick: sixJ.valuePerTick,
    },
    marginPerContract: sixJ.marginPerContract,
  };
  const brokerAxisRow: BrokerInstrument = { ...invertedRow, inverted: false };

  it("agrees with sizing on the broker axis directly, to within one step", () => {
    const random = lcg(613);
    for (let trial = 0; trial < 200; trial += 1) {
      const entryPrice = between(random, 90, 165);
      // Tight enough, on the largest Signature tier, that both sides land well
      // above one contract. A case that floors to zero on both axes would agree
      // vacuously and would not notice the transform being skipped — which is
      // exactly what a mutation of step 4 proved before this bound was added.
      const stopLoss = entryPrice - between(random, 0.02, 0.09);
      const context: SizingContext = {
        accountSize: 150_000,
        entryPrice,
        quotes: QUOTES,
        riskPercent: 1.5,
        stage: "challenge",
        stopLoss,
      };
      const viaTransform = sizeInstrument(invertedRow, context);
      // The same trade expressed on E8's own axis: JPY per USD becomes USD per JPY.
      const onBrokerAxis = sizeInstrument(brokerAxisRow, {
        ...context,
        entryPrice: 1 / entryPrice,
        stopLoss: 1 / stopLoss,
      });
      assert.equal(viaTransform.kind, "size");
      assert.equal(onBrokerAxis.kind, "size");
      if (viaTransform.kind !== "size" || onBrokerAxis.kind !== "size") {
        continue;
      }
      assert.ok(viaTransform.units >= 1, `transform gave ${viaTransform.units}`);
      assert.ok(onBrokerAxis.units >= 1, `broker axis gave ${onBrokerAxis.units}`);
      assert.ok(
        Math.abs(viaTransform.units - onBrokerAxis.units) <= viaTransform.step,
        `${entryPrice}/${stopLoss}: ${viaTransform.units} vs ${onBrokerAxis.units}`,
      );
    }
  });

  it("states the transform as the spec does: stopDistance / referencePrice²", () => {
    const random = lcg(31);
    for (let trial = 0; trial < 200; trial += 1) {
      const entryPrice = between(random, 90, 165);
      const stopLoss = entryPrice - between(random, 0.05, 2.5);
      const stopDistance = Math.abs(entryPrice - stopLoss);
      const scaled = stopDistance * invertedPriceScaleFactor(entryPrice, stopLoss);
      assert.ok(
        Math.abs(scaled - invertedStopDistance(entryPrice, stopLoss)) < 1e-15,
        `${entryPrice}/${stopLoss}`,
      );
    }
  });

  it("blocks the real 6J row with Not confirmed, and ships no confirmed inverted row", () => {
    assert.equal(E8_FUTURES_SPECS["6J"].tradability, "unconfirmed");
    assert.equal(stateWordForTradability("unconfirmed"), "Not confirmed");
    const result = sizeSetup({
      accountSize: 100_000,
      entryPrice: 151.42,
      levelflowSymbol: "USDJPY",
      programLine: "signature_futures",
      quotes: QUOTES,
      riskPercent: 0.5,
      stage: "challenge",
      stopLoss: 150.9,
    });
    // On a futures program E8 offers no spot pair at all, which is the stronger
    // claim its own cross-checked roster supports.
    assert.deepEqual(result, { kind: "blocked", word: "Not offered" });
    assert.equal(
      BROKER_INSTRUMENTS.filter(
        (row) => row.inverted && row.tradability === "confirmed",
      ).length,
      0,
    );
  });
});

describe("§19e — null blocks, exhaustively, and each null names its own fact", () => {
  const base = findBrokerInstrument("one", "EURUSD")!;
  const context = contextFor("EURUSD", lcg(5));

  function withUnit(unit: QuoteUnit): BrokerInstrument {
    return { ...base, unit };
  }

  it("renders Not published when a published value the size needs is null", () => {
    const nulled: [string, BrokerInstrument][] = [
      [
        "contract size",
        withUnit({
          kind: "forex_contract",
          contractSize: { source: base.tradabilitySource, value: null },
        }),
      ],
      [
        "points per lot",
        withUnit({
          kind: "index_points",
          pointsPerLot: { source: base.tradabilitySource, value: null },
        }),
      ],
      [
        "tick size",
        withUnit({
          kind: "futures_tick",
          tickSize: { source: base.tradabilitySource, value: null },
          valuePerTick: { source: base.tradabilitySource, value: 12.5 },
        }),
      ],
      [
        "value per tick",
        withUnit({
          kind: "futures_tick",
          tickSize: { source: base.tradabilitySource, value: 0.25 },
          valuePerTick: { source: base.tradabilitySource, value: null },
        }),
      ],
      [
        "ticket cap",
        { ...base, maxTicketLots: { source: base.maxTicketLots.source, value: null } },
      ],
    ];
    for (const [what, row] of nulled) {
      assert.deepEqual(
        sizeInstrument(row, context),
        { kind: "blocked", word: "Not published" },
        `a null ${what} must render Not published`,
      );
    }
  });

  it("renders Not published when margin per contract is null on a futures line", () => {
    const row = findBrokerInstrument("signature_futures", "ESUSD")!;
    assert.deepEqual(
      sizeInstrument(
        { ...row, marginPerContract: { source: row.marginPerContract.source, value: null } },
        { ...contextFor("ESUSD", lcg(11)), accountSize: 100_000 },
      ),
      { kind: "blocked", word: "Not published" },
    );
  });

  it("renders Not published when leverage is missing for the row's own class", () => {
    // E8 Zero publishes no energies leverage. A confirmed energies row there would
    // have no computable margin cap, so it could carry no number either.
    const row: BrokerInstrument = {
      ...findBrokerInstrument("zero", "WTI")!,
      tradability: "confirmed",
      unit: {
        kind: "forex_contract",
        contractSize: { source: base.tradabilitySource, value: 1_000 },
      },
    };
    assert.deepEqual(
      sizeInstrument(row, contextFor("WTI", lcg(13))),
      { kind: "blocked", word: "Not published" },
    );
  });

  it("renders Rate unavailable when a bridge quote is missing or stale", () => {
    // GBPJPY needs 1/USDJPY for its per-unit value and GBPUSD for its margin cap.
    for (const missing of ["USDJPY", "GBPUSD"]) {
      const quotes: Record<string, number | null> = { ...QUOTES };
      quotes[missing] = null;
      assert.deepEqual(
        sizeSetup({
          ...contextFor("GBPJPY", lcg(17)),
          levelflowSymbol: "GBPJPY",
          programLine: "one",
          quotes,
        }),
        { kind: "blocked", word: "Rate unavailable" },
        `a missing ${missing} must render Rate unavailable`,
      );
    }
    // And an unusable own price, which is the same fact about a live number.
    assert.deepEqual(
      sizeSetup({
        ...contextFor("EURUSD", lcg(19)),
        entryPrice: Number.NaN,
        levelflowSymbol: "EURUSD",
        programLine: "one",
      }),
      { kind: "blocked", word: "Rate unavailable" },
    );
  });

  it("keeps the two words apart — a published gap and a stale quote differ", () => {
    assert.notEqual("Not published", "Rate unavailable");
    const bothMissing: BrokerInstrument = {
      ...base,
      unit: {
        kind: "forex_contract",
        contractSize: { source: base.tradabilitySource, value: null },
      },
    };
    // A published gap is reported first: E8's silence is the larger fact, and a
    // quote cannot rescue a number E8 never printed.
    assert.deepEqual(
      sizeInstrument(bothMissing, { ...context, quotes: {} }),
      { kind: "blocked", word: "Not published" },
    );
  });

  it("maps every tradability state to its own word, and confirmed to none", () => {
    assert.equal(stateWordForTradability("not_offered"), "Not offered");
    assert.equal(stateWordForTradability("not_published"), "Not confirmed");
    assert.equal(stateWordForTradability("unconfirmed"), "Not confirmed");
    assert.equal(stateWordForTradability("confirmed"), null);
  });

  it("blocks every non-sizeable market on every line, with a word and no number", () => {
    for (const program of PROGRAM_LINES) {
      const sizeable = new Set(SIZEABLE_MARKETS_BY_LINE[program.line]);
      // The 50 scannable markets: the nine addendum rows have no setup to size and
      // are excluded from SIZEABLE_MARKETS_BY_LINE by construction, which is where
      // §19a's "never sizeable while they are no-trade or hidden" is enforced.
      for (const row of BROKER_INSTRUMENTS) {
        if (
          row.programLine !== program.line || sizeable.has(row.levelflowSymbol) ||
          !AVAILABLE_ASSET_SYMBOLS.includes(row.levelflowSymbol)
        ) {
          continue;
        }
        const result = sizeSetup({
          ...contextFor(row.levelflowSymbol, lcg(23)),
          levelflowSymbol: row.levelflowSymbol,
          programLine: program.line,
        });
        assert.equal(
          result.kind,
          "blocked",
          `${program.line}:${row.levelflowSymbol} produced a number`,
        );
        if (result.kind === "blocked") {
          assert.ok(
            ["Not offered", "Not confirmed", "Not published", "Rate unavailable"]
              .includes(result.word),
            result.word,
          );
        }
      }
    }
  });
});

describe("§19c — E8's own worked examples reproduce exactly", () => {
  it("gets 3.28 max lots on gold, the way 9453396 computes it", () => {
    // 15 (leverage) x 100,000 / (4,565.92 x 100) = 3.28 lots.
    const row = findBrokerInstrument("one", "XAUUSD")!;
    const result = sizeInstrument(row, {
      accountSize: 100_000,
      entryPrice: 4_565.92,
      quotes: QUOTES,
      // A stop tight enough that the margin cap is what binds.
      riskPercent: 1.5,
      stage: "challenge",
      stopLoss: 4_565.82,
    });
    assert.equal(result.kind, "size");
    if (result.kind === "size") {
      // 1,500,000 / 456,592 is 3.285…, which is the 3.28 E8 prints once it is
      // floored to the lot step — never the 3.29 rounding to nearest would give.
      assert.equal(floorToStep(result.caps[1], CFD_STEP), 3.28);
      assert.equal(result.units, 3.28);
    }
  });

  it("gets 22.2 max lots on GBP/NZD, bridged via GBP/USD as the article does", () => {
    // 30 x 100,000 / (1.351 x 100,000) = 22.2 lots.
    const row = findBrokerInstrument("one", "GBPNZD")!;
    const result = sizeInstrument(row, {
      accountSize: 100_000,
      entryPrice: 2.1,
      quotes: { ...QUOTES, GBPUSD: 1.351, NZDUSD: 0.6031 },
      riskPercent: 1.5,
      stage: "challenge",
      stopLoss: 2.0999,
    });
    assert.equal(result.kind, "size");
    if (result.kind === "size") {
      assert.equal(floorToStep(result.caps[1], 0.1), 22.2);
    }
  });

  it("gives the textbook $10 per pip on a USD-quoted pair", () => {
    // contract size 100,000 x usdPerQuote 1 = $100,000 per 1.0 price unit, so a
    // 0.0001 pip is $10 — the figure E8 declines to print and instructs be derived.
    const row = findBrokerInstrument("one", "EURUSD")!;
    const result = sizeInstrument(row, {
      accountSize: 10_000,
      entryPrice: 1.0842,
      quotes: QUOTES,
      // $100 of budget against a 10-pip stop is exactly 1.00 lot at $10 a pip.
      riskPercent: 1,
      stage: "challenge",
      stopLoss: 1.0832,
    });
    assert.equal(result.kind === "size" ? result.units : null, 1);
  });
});
