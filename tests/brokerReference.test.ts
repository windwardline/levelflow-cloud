import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AVAILABLE_ASSET_SYMBOLS, SECURITY_OPTIONS } from "../src/lib/symbolMap.ts";
import {
  ENUMERATED_BRIDGE_PAIRS,
  bridgeLegsFor,
  instrumentPriceBridge,
  usdPerQuoteBridge,
} from "../src/lib/broker/bridging.ts";
import {
  ALL_MAPPED_SYMBOLS,
  BROKER_INSTRUMENTS,
  CANONICAL_ROSTER_SIZE,
  E8_FUTURES_SPECS,
  INVERTED_FX,
  SIZEABLE_MARKETS_BY_LINE,
  findBrokerInstrument,
} from "../src/lib/broker/instruments.ts";
import {
  CANONICAL_LIST,
  CONTRACT_SIZES,
  CUSTOM_ACCOUNT,
  E8X_TRADING_SYMBOLS,
  INSTRUMENTS_ARTICLE,
  INSTRUMENT_ROSTER,
  LEVERAGE_ARTICLE,
  LOT_RESTRICTIONS,
  MAX_CONTRACTS,
  PROGRAM_LINES,
  RISK_PERCENT_DEFAULT,
  RISK_PERCENT_OPTIONS,
  STANDARD_FUTURES_MARGIN,
  TICK_SIZES,
  ZERO_PRODUCT,
  allowedMarginFor,
  formatAccountSize,
  formatDrawdownTier,
  formatRiskPercent,
} from "../src/lib/broker/programs.ts";
import type {
  BrokerInstrument,
  ProgramLine,
  Provenance,
  QuoteUnit,
  Stage,
  Valued,
} from "../src/lib/broker/types.ts";

// Spec §19f. The tests/calibrationState.test.ts precedent: a literal expectation
// table in the test file, so changing a broker number without changing a test is
// impossible. Every value is pinned against the E8 article that publishes it —
// 13004287 for tick and value, 10155917 for margin and allowances, 9453488 for
// contract sizes, 5514982 for leverage, 9453396 for ticket caps, 13001922 and
// 13390461 for the instrument roster, 8880316 for the ladders.

// ---------------------------------------------------------------------------
// 13004287 — tick size and profit per tick, and 10155917 — margin per contract
// ---------------------------------------------------------------------------

// [tickSize, valuePerTick, margin] — null is a row E8's own table omits.
const FUTURES_SPECS_OF_RECORD: Record<
  string,
  [number | null, number | null, number | null]
> = {
  EMD: [0.1, 10, null],
  ES: [0.25, 12.5, 10_000],
  MES: [0.25, 1.25, 1_000],
  NKD: [5, 25, 10_000],
  NQ: [0.25, 5, 10_000],
  MNQ: [0.25, 0.5, 1_000],
  RTY: [0.1, 5, 10_000],
  M2K: [0.1, 0.5, 1_000],
  MBT: [5, 0.5, 1_000],
  MET: [0.05, 0.5, 1_000],
  "6A": [0.0001, 10, 10_000],
  M6A: [0.0001, 1, 1_000],
  "6B": [0.0001, 6.25, 10_000],
  M6B: [0.0001, 0.63, 1_000],
  "6C": [0.0001, 10, 10_000],
  "6E": [0.0001, 12.5, 10_000],
  "7E": [0.0001, 6.25, null],
  M6E: [0.0001, 1.25, 1_000],
  MCD: [0.0001, 1, null],
  "6J": [0.0000001, 12.5, 10_000],
  "6S": [0.0001, 12.5, 10_000],
  "6M": [0.00005, 5, 10_000],
  "6N": [0.0001, 10, 10_000],
  LE: [0.025, 10, 10_000],
  HE: [0.025, 10, 10_000],
  CL: [0.01, 10, 10_000],
  MCL: [0.01, 1, 1_000],
  QM: [0.025, 12.5, 10_000],
  NG: [0.001, 10, 10_000],
  QG: [0.005, 12.5, 10_000],
  RB: [0.0001, 4.2, 10_000],
  HO: [0.0001, 4.2, 10_000],
  ZC: [0.25, 12.5, 10_000],
  ZW: [0.25, 12.5, 10_000],
  ZS: [0.25, 12.5, 10_000],
  ZM: [0.1, 10, 10_000],
  ZL: [0.01, 6, 10_000],
  YM: [1, 5, 10_000],
  MYM: [1, 0.5, 1_000],
  GC: [0.1, 10, 10_000],
  MGC: [0.1, 1, 1_000],
  SI: [0.005, 25, 2_000],
  HG: [0.0005, 12.5, 10_000],
  PL: [0.1, 10, 10_000],
  PA: [0.1, 10, null],
  // Margin-table-only: margin published, tick and value NOT PUBLISHED.
  ZB: [null, null, 10_000],
  ZN: [null, null, 10_000],
};

describe("§19f — E8's futures specs, pinned to the articles that publish them", () => {
  for (const [symbol, [tickSize, valuePerTick, margin]] of Object.entries(
    FUTURES_SPECS_OF_RECORD,
  )) {
    it(`pins ${symbol} at 13004287's tick and 10155917's margin`, () => {
      const spec = E8_FUTURES_SPECS[symbol];
      assert.ok(spec, `${symbol} missing from the roster`);
      assert.equal(spec.tickSize.value, tickSize);
      assert.equal(spec.valuePerTick.value, valuePerTick);
      assert.equal(spec.marginPerContract.value, margin);
      assert.equal(spec.tickSize.source.article, "13004287");
      assert.equal(spec.marginPerContract.source.article, "10155917");
    });
  }

  it("carries E8's canonical 45-instrument roster and nothing padded into it", () => {
    assert.equal(CANONICAL_ROSTER_SIZE, 45);
    const canonical = Object.values(E8_FUTURES_SPECS).filter((spec) => spec.canonical);
    assert.equal(canonical.length, 45);
  });

  it("keeps the four margin-omitted symbols null rather than filled", () => {
    // 10155917 has no margin row for these. An exchange specification would
    // resolve them and is ruled out by the boundary (§20i ruling 5).
    for (const symbol of ["PA", "7E", "MCD", "EMD"]) {
      assert.equal(E8_FUTURES_SPECS[symbol].marginPerContract.value, null);
    }
  });

  it("marks 6J and 6M unconfirmed despite the canonical list carrying both", () => {
    // Canonical-list membership is not enough when E8's own tick table cannot be
    // reconciled with itself: an exchange notional would settle it and is ruled out
    // by the boundary (§20i ruling 5).
    for (const symbol of ["6J", "6M"]) {
      assert.equal(E8_FUTURES_SPECS[symbol].canonical, true);
      assert.equal(E8_FUTURES_SPECS[symbol].tradability, "unconfirmed");
    }
    for (const symbol of ["6E", "6S", "6A", "6N"]) {
      assert.equal(E8_FUTURES_SPECS[symbol].tradability, "confirmed");
    }
  });

  it("marks ZB and ZN unconfirmed — margin only, absent from all three lists", () => {
    for (const symbol of ["ZB", "ZN"]) {
      const spec = E8_FUTURES_SPECS[symbol];
      assert.equal(spec.canonical, false);
      assert.equal(spec.tradability, "unconfirmed");
      assert.equal(spec.tickSize.value, null);
      assert.equal(spec.valuePerTick.value, null);
    }
    const marginOnly = Object.values(E8_FUTURES_SPECS).filter((s) => !s.canonical);
    assert.deepEqual(marginOnly.map((s) => s.symbol).sort(), ["ZB", "ZN"]);
  });

  it("records both observed spellings where E8 disagrees with itself", () => {
    // 7E on the fee table, the tick table and the live symbol tool; E7 on the
    // canonical instrument list. NG on the fee table and the canonical list; NQ on
    // the tick table, colliding with E-mini NASDAQ 100 in the same taxonomy.
    assert.equal(E8_FUTURES_SPECS["7E"].altSymbol, "E7");
    assert.equal(E8_FUTURES_SPECS.NG.altSymbol, "NQ");
    const withAlts = Object.values(E8_FUTURES_SPECS)
      .filter((spec) => spec.altSymbol !== null)
      .map((spec) => spec.symbol)
      .sort();
    assert.deepEqual(withAlts, ["7E", "NG"]);
  });

  it("derives a finite positive value per 1.0 price unit for every confirmed row", () => {
    for (const spec of Object.values(E8_FUTURES_SPECS)) {
      if (spec.tradability !== "confirmed") {
        continue;
      }
      const perUnit = spec.valuePerTick.value! / spec.tickSize.value!;
      assert.ok(Number.isFinite(perUnit) && perUnit > 0, spec.symbol);
    }
  });

  it("documents why 6J ships unconfirmed: 1,000x its 6E and 6S siblings", () => {
    const perUnit = (symbol: string) =>
      E8_FUTURES_SPECS[symbol].valuePerTick.value! /
      E8_FUTURES_SPECS[symbol].tickSize.value!;
    assert.equal(perUnit("6E"), 125_000);
    assert.equal(perUnit("6S"), 125_000);
    assert.equal(perUnit("6J"), 125_000_000);
    assert.equal(perUnit("6J") / perUnit("6E"), 1_000);
  });
});

// ---------------------------------------------------------------------------
// 8880316 — the ladders; 5514982 and 15655062 — leverage; 10155917 — allowances
// ---------------------------------------------------------------------------

const LADDERS_OF_RECORD: Record<ProgramLine, number[]> = {
  one: [5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 400_000, 500_000],
  one_crypto: [5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 400_000, 500_000],
  pro_forex: [
    5_000,
    10_000,
    25_000,
    50_000,
    100_000,
    150_000,
    200_000,
    400_000,
    500_000,
  ],
  pro_crypto: [
    5_000,
    10_000,
    25_000,
    50_000,
    100_000,
    150_000,
    200_000,
    400_000,
    500_000,
  ],
  signature_forex: [25_000, 50_000, 100_000, 150_000],
  signature_crypto: [25_000, 50_000, 100_000, 150_000],
  signature_futures: [25_000, 50_000, 100_000, 150_000],
  zero: [50_000, 100_000, 200_000],
  zero_futures_starter: [50_000, 100_000, 200_000],
  zero_futures_max: [50_000, 100_000, 200_000],
};

const LABELS_OF_RECORD: Record<ProgramLine, string> = {
  one: "E8 One",
  one_crypto: "E8 One Crypto",
  pro_forex: "E8 Pro Forex",
  pro_crypto: "E8 Pro Crypto",
  signature_forex: "E8 Signature Forex",
  signature_crypto: "E8 Signature Crypto",
  signature_futures: "E8 Signature Futures",
  zero: "E8 Zero",
  zero_futures_starter: "E8 Zero Futures Starter",
  zero_futures_max: "E8 Zero Futures Max",
};

describe("§19b — the ten program lines", () => {
  it("ships exactly ten, and neither E8 Classic nor E8 Track among them", () => {
    assert.equal(PROGRAM_LINES.length, 10);
    const labels = PROGRAM_LINES.map((program) => program.label);
    for (const rejected of ["E8 Classic", "E8 Track", "E8 Track 1:1"]) {
      assert.ok(!labels.includes(rejected), `${rejected} must not appear`);
    }
    assert.deepEqual(
      PROGRAM_LINES.map((program) => program.line).sort(),
      Object.keys(LADDERS_OF_RECORD).sort(),
    );
  });

  for (const program of PROGRAM_LINES) {
    it(`pins ${program.line}'s label and ladder to 8880316`, () => {
      assert.equal(program.label, LABELS_OF_RECORD[program.line]);
      assert.deepEqual(program.accountSizes, LADDERS_OF_RECORD[program.line]);
      assert.equal(program.accountSizeSource.article, "8880316");
    });
  }

  it("keeps Pro's $150,000 tier off E8 One's ladder — the ladders are not shared", () => {
    const one = LADDERS_OF_RECORD.one;
    const pro = LADDERS_OF_RECORD.pro_forex;
    assert.ok(pro.includes(150_000));
    assert.ok(!one.includes(150_000));
    assert.equal(pro.length, one.length + 1);
  });

  it("carries the drawdown tier domain on the four customizable lines only", () => {
    const tiers = Object.fromEntries(
      PROGRAM_LINES.map((program) => [program.line, program.drawdownTiers]),
    );
    assert.deepEqual(tiers.one, ["3-4", "4-6", "5.3-8", "6.6-10", "9.2-14"]);
    assert.deepEqual(tiers.one_crypto, ["3-4", "4-6", "5.3-8", "6.6-10", "9.2-14"]);
    assert.deepEqual(tiers.pro_forex, ["2.5-6", "2.5-8", "2.5-10"]);
    assert.deepEqual(tiers.pro_crypto, ["2.5-6", "2.5-8", "2.5-10"]);
    for (const preset of [
      "signature_forex",
      "signature_crypto",
      "signature_futures",
      "zero",
      "zero_futures_starter",
      "zero_futures_max",
    ]) {
      assert.equal(tiers[preset], null, `${preset} must have no tier column`);
    }
  });

  it("renders E8's own tiers verbatim from the paired token", () => {
    assert.equal(formatDrawdownTier("3-4"), "3% daily · 4% max");
    assert.equal(formatDrawdownTier("5.3-8"), "5.3% daily · 8% max");
    assert.equal(formatDrawdownTier("9.2-14"), "9.2% daily · 14% max");
    assert.equal(formatDrawdownTier("2.5-10"), "2.5% daily · 10% max");
  });

  it("amendment 21 — a listed percentage carries its dollar amount when the account size is known", () => {
    // The owner's shape, verbatim: X%/$XXX. Exact money — cents render only
    // when the math produces them, and .00 never renders.
    assert.equal(formatRiskPercent(0.5, 25_000), "0.50%/$125");
    assert.equal(formatRiskPercent(0.25, 25_000), "0.25%/$62.50");
    assert.equal(formatRiskPercent(1, 100_000), "1.00%/$1,000");
    assert.equal(
      formatDrawdownTier("3-4", 25_000),
      "3%/$750 daily · 4%/$1,000 max",
    );
    assert.equal(
      formatDrawdownTier("2.5-8", 100_000),
      "2.5%/$2,500 daily · 8%/$8,000 max",
    );
  });

  it("amendment 21 — without a size, both formatters keep their original shape", () => {
    assert.equal(formatRiskPercent(0.5), "0.50%");
    assert.equal(formatDrawdownTier("3-4"), "3% daily · 4% max");
  });

  it("pins leverage to 5514982, per product and per class, never per stage", () => {
    for (const line of ["one", "pro_forex", "signature_forex"] as ProgramLine[]) {
      const leverage = PROGRAM_LINES.find((p) => p.line === line)!.leverage;
      assert.equal(leverage.forex?.value, 30);
      assert.equal(leverage.indices?.value, 15);
      assert.equal(leverage.metals?.value, 15);
      assert.equal(leverage.energies?.value, 15);
      assert.equal(leverage.crypto?.value, 1);
      assert.equal(leverage.forex?.source.article, "5514982");
    }
    for (const line of [
      "one_crypto",
      "pro_crypto",
      "signature_crypto",
    ] as ProgramLine[]) {
      const leverage = PROGRAM_LINES.find((p) => p.line === line)!.leverage;
      assert.equal(leverage.bitcoin?.value, 5);
      assert.equal(leverage.ethereum?.value, 5);
      assert.equal(leverage.other_crypto?.value, 2);
      assert.equal(leverage.bitcoin?.source.article, "5514982");
    }
  });

  it("sources E8 Zero's leverage from its product page, not the leverage article", () => {
    // 5514982 does not name E8 Zero anywhere. Its own product page publishes the
    // same figures, and no energies row at all.
    const zero = PROGRAM_LINES.find((program) => program.line === "zero")!;
    assert.equal(zero.leverage.forex?.value, 30);
    assert.equal(zero.leverage.forex?.source.article, "15655062");
    assert.equal(zero.leverage.energies, undefined);
  });

  it("pins 10155917's allowed-margin table, per size and per stage", () => {
    const expected: Record<string, Record<Stage, Record<number, number | null>>> = {
      signature_futures: {
        challenge: { 25_000: 20_000, 50_000: 40_000, 100_000: 80_000, 150_000: 120_000 },
        performance: {
          25_000: 20_000,
          50_000: 40_000,
          100_000: 80_000,
          150_000: 120_000,
        },
      },
      zero_futures_starter: {
        challenge: { 50_000: 40_000, 100_000: 80_000, 200_000: 100_000 },
        performance: { 50_000: 20_000, 100_000: 30_000, 200_000: 40_000 },
      },
      zero_futures_max: {
        challenge: { 50_000: 40_000, 100_000: 80_000, 200_000: 100_000 },
        performance: { 50_000: 20_000, 100_000: 30_000, 200_000: 40_000 },
      },
    };
    for (const [line, byStage] of Object.entries(expected)) {
      for (const [stage, bySize] of Object.entries(byStage)) {
        for (const [size, allowance] of Object.entries(bySize)) {
          assert.equal(
            allowedMarginFor(line as ProgramLine, Number(size), stage as Stage),
            allowance,
            `${line} ${stage} ${size}`,
          );
        }
      }
    }
  });

  it("publishes no allowance on a CFD line — the cap there is leverage, not margin", () => {
    for (const line of [
      "one",
      "one_crypto",
      "pro_forex",
      "pro_crypto",
      "signature_forex",
      "signature_crypto",
      "zero",
    ] as ProgramLine[]) {
      assert.equal(allowedMarginFor(line, 100_000, "challenge"), null);
    }
  });

  it("reproduces E8's own Maximum Contract Size column from the allowance", () => {
    // The published column is the allowance evaluated at the $10,000 standard
    // margin. Reading it as a contract count instead of a margin allowance would
    // cap MGC at 2 on a $25K Signature account when its $1,000 margin permits 20.
    const published: [ProgramLine, Stage, number, number][] = [
      ["signature_futures", "challenge", 25_000, 2],
      ["signature_futures", "challenge", 50_000, 4],
      ["signature_futures", "challenge", 100_000, 8],
      ["signature_futures", "challenge", 150_000, 12],
      ["zero_futures_starter", "challenge", 50_000, 4],
      ["zero_futures_starter", "challenge", 100_000, 8],
      ["zero_futures_starter", "challenge", 200_000, 10],
      ["zero_futures_starter", "performance", 50_000, 2],
      ["zero_futures_starter", "performance", 100_000, 3],
      ["zero_futures_starter", "performance", 200_000, 4],
    ];
    assert.equal(published.length, 10);
    for (const [line, stage, size, contracts] of published) {
      const allowance = allowedMarginFor(line, size, stage)!;
      assert.equal(
        Math.floor(allowance / STANDARD_FUTURES_MARGIN),
        contracts,
        `${line} ${stage} ${size}`,
      );
    }
  });

  it("offers risk per trade from 0.10% to 1.50% in 0.05% steps, default 0.50%", () => {
    assert.equal(RISK_PERCENT_OPTIONS[0], 0.1);
    assert.equal(RISK_PERCENT_OPTIONS.at(-1), 1.5);
    assert.equal(RISK_PERCENT_OPTIONS.length, 29);
    assert.ok(RISK_PERCENT_OPTIONS.includes(RISK_PERCENT_DEFAULT));
    assert.equal(RISK_PERCENT_DEFAULT, 0.5);
    assert.equal(formatRiskPercent(0.5), "0.50%");
    assert.equal(formatRiskPercent(1.5), "1.50%");
  });

  it("formats an account size comma-grouped with no cents", () => {
    assert.equal(formatAccountSize(100_000), "$100,000");
    assert.equal(formatAccountSize(5_000), "$5,000");
    assert.equal(formatAccountSize(500_000), "$500,000");
  });
});

// ---------------------------------------------------------------------------
// §19a — the rows, their four states, and the population of record
// ---------------------------------------------------------------------------

const SCANNABLE = new Set(AVAILABLE_ASSET_SYMBOLS);
const ADDENDUM = ALL_MAPPED_SYMBOLS.filter((symbol) => !SCANNABLE.has(symbol));

function scannableRowsFor(line: ProgramLine) {
  return BROKER_INSTRUMENTS.filter(
    (row) => row.programLine === line && SCANNABLE.has(row.levelflowSymbol),
  );
}

function tallyFor(line: ProgramLine) {
  const tally: Record<string, number> = {
    confirmed: 0,
    not_offered: 0,
    not_published: 0,
    unconfirmed: 0,
  };
  for (const row of scannableRowsFor(line)) {
    tally[row.tradability] += 1;
  }
  return tally;
}

describe("§19a — the row and its states", () => {
  it("keys every row on (broker, program line, Levelflow symbol)", () => {
    const keys = new Set(
      BROKER_INSTRUMENTS.map(
        (row) => `${row.broker}:${row.programLine}:${row.levelflowSymbol}`,
      ),
    );
    assert.equal(keys.size, BROKER_INSTRUMENTS.length);
    // 59 code-present markets on each of the ten shipped lines: the 50 scannable
    // ones plus the nine that stay in the symbol map and the replay universe.
    assert.equal(ALL_MAPPED_SYMBOLS.length, 59);
    assert.equal(SCANNABLE.size, 50);
    assert.equal(ADDENDUM.length, 9);
    assert.equal(BROKER_INSTRUMENTS.length, 590);
    assert.equal(scannableRowsFor("one").length, 50);
  });

  it("never keys a row on the FMP symbol — WTI/CLUSD and BRENT/BZUSD prove it cannot", () => {
    const fmpByLevelflow = new Map(
      SECURITY_OPTIONS.map((option) => [option.symbol, option.fmpSymbol]),
    );
    assert.equal(fmpByLevelflow.get("WTI"), fmpByLevelflow.get("CLUSD"));
    assert.equal(fmpByLevelflow.get("BRENT"), fmpByLevelflow.get("BZUSD"));
    // Same FMP symbol, different rows, different states on a CFD line.
    assert.notEqual(
      findBrokerInstrument("one", "WTI")!.tradability,
      findBrokerInstrument("one", "CLUSD")!.tradability,
    );
  });

  // Amendment 4 (owner ruling, 2026-08-02) widened the boundary from two
  // admissible tags to three: `confirmed` tradability used to require
  // `primary` alone, and a required unit value used to require `primary` or
  // `derived` alone. Both now also admit `verified` — the owner watching the
  // broker's live platform confirm a fact is the same class of evidence as
  // E8 publishing it (types.ts's `Provenance` docblock). The old, narrower
  // equality/OR-chain retired here because it hard-coded the pre-amendment
  // two-tag world: it would fail the instant any real `confirmed` row or
  // required unit value actually carried a `verified` source (Task 11's
  // `CFD_LOT_STEP`, Task 13's 46 folded observations) — the exact landmine
  // this rewrite exists to defuse before that data lands. `secondary` and
  // `dossier` stay inadmissible in both positions: the widening admits
  // exactly one new tag, nothing more.
  it("admits primary or verified tradability into confirmed, and primary, derived or verified unit values (amendment 4)", () => {
    for (const row of BROKER_INSTRUMENTS) {
      if (row.tradability !== "confirmed") {
        continue;
      }
      assert.ok(
        ["primary", "verified"].includes(row.tradabilitySource.tag),
        `${row.programLine}:${row.levelflowSymbol} tradability`,
      );
      const unitValues = row.unit.kind === "forex_contract"
        ? [row.unit.contractSize]
        : row.unit.kind === "index_points"
        ? [row.unit.pointsPerLot]
        : [row.unit.tickSize, row.unit.valuePerTick];
      for (const value of unitValues) {
        if (value.value === null) {
          continue;
        }
        assert.ok(
          ["primary", "derived", "verified"].includes(value.source.tag),
          `${row.programLine}:${row.levelflowSymbol} unit tag ${value.source.tag}`,
        );
      }
    }
  });

  it("keeps every derived value distinguishable from a published one", () => {
    for (const row of BROKER_INSTRUMENTS) {
      for (const source of [
        row.tradabilitySource,
        row.brokerSymbolSource,
        row.priceScaleFactor.source,
        row.marginPerContract.source,
        row.maxTicketLots.source,
      ]) {
        if (!source) {
          continue;
        }
        if (source.tag === "derived") {
          assert.ok(source.method, "a derived value must name the method's article");
          assert.equal(source.article, null, "derived is never also primary");
        }
        if (source.url === null) {
          assert.equal(source.tag, "verified", "only a verified source has a null url");
        } else {
          assert.ok(source.url.startsWith("https://"), source.url);
        }
      }
    }
  });

  it("tallies the futures lines exactly as §19a records them", () => {
    for (const line of [
      "signature_futures",
      "zero_futures_starter",
      "zero_futures_max",
    ] as ProgramLine[]) {
      const rows = scannableRowsFor(line);
      const nonFutures = rows.filter(
        (row) => !["BZUSD", "CLUSD", "ESUSD", "GCUSD", "MGCUSD", "NQUSD", "RTYUSD", "SIUSD", "YMUSD", "ZBUSD", "ZNUSD"].includes(row.levelflowSymbol),
      );
      // Every Forex (28), Metals (2), Energies (2) and Crypto (7) row.
      assert.equal(nonFutures.length, 39);
      assert.ok(nonFutures.every((row) => row.tradability === "not_offered"), line);

      const tally = tallyFor(line);
      assert.equal(tally.confirmed, 8, `${line} confirmed`);
      assert.equal(tally.unconfirmed, 2, `${line} unconfirmed`);
      assert.equal(tally.not_offered, 40, `${line} not offered`);
      assert.equal(tally.not_published, 0, `${line} not published`);

      const confirmed = scannableRowsFor(line)
        .filter((row) => row.tradability === "confirmed")
        .map((row) => row.brokerSymbol)
        .sort();
      assert.deepEqual(confirmed, ["CL", "ES", "GC", "MGC", "NQ", "RTY", "SI", "YM"]);
      assert.equal(findBrokerInstrument(line, "BZUSD")!.tradability, "not_offered");
      assert.equal(findBrokerInstrument(line, "ZBUSD")!.tradability, "unconfirmed");
      assert.equal(findBrokerInstrument(line, "ZNUSD")!.tradability, "unconfirmed");
    }
  });

  it("tallies the CFD lines exactly as §19a records them", () => {
    for (const line of [
      "one",
      "pro_forex",
      "signature_forex",
      "zero",
    ] as ProgramLine[]) {
      const tally = tallyFor(line);
      // 28 forex pairs plus XAUUSD.
      assert.equal(tally.confirmed, 29, `${line} confirmed`);
      // The eleven Levelflow Futures rows: E8's futures roster lives exclusively
      // on the futures program lines, and E8 publishes that scope.
      assert.equal(tally.not_offered, 11, `${line} not offered`);
      // XAGUSD, both energies rows, and all seven crypto rows.
      assert.equal(tally.not_published, 10, `${line} not published`);
      assert.equal(tally.unconfirmed, 0, `${line} unconfirmed`);
      assert.equal(findBrokerInstrument(line, "XAGUSD")!.tradability, "not_published");
      assert.equal(findBrokerInstrument(line, "XAUUSD")!.tradability, "confirmed");
    }
    for (const line of [
      "one_crypto",
      "pro_crypto",
      "signature_crypto",
    ] as ProgramLine[]) {
      const tally = tallyFor(line);
      // 5514977, verbatim: "Crypto only".
      assert.equal(tally.not_offered, 43, `${line} not offered`);
      assert.equal(tally.not_published, 7, `${line} not published`);
      assert.equal(tally.confirmed, 0, `${line} confirmed`);
    }
  });

  it("records the same-exposure CFD without ever substituting it", () => {
    const related = Object.fromEntries(
      ["ESUSD", "NQUSD", "YMUSD", "GCUSD", "MGCUSD"].map((symbol) => [
        symbol,
        findBrokerInstrument("one", symbol)!.relatedExposure,
      ]),
    );
    assert.deepEqual(related, {
      ESUSD: "SP500",
      NQUSD: "NAS100",
      YMUSD: "US30",
      GCUSD: "XAUUSD",
      MGCUSD: "XAUUSD",
    });
    for (const symbol of ["ESUSD", "NQUSD", "YMUSD", "GCUSD", "MGCUSD"]) {
      assert.equal(findBrokerInstrument("one", symbol)!.tradability, "not_offered");
    }
  });

  it("keeps the eight no-route markets unconfirmed on every program line", () => {
    // Crossmap §3.5's finding of record: Brent is a firm NOT OFFERED on futures
    // plus NOT PUBLISHED on the CFD side; the two Treasury rows are UNCONFIRMED on
    // futures and rates are not a Markets class; the four altcoins are NOT
    // PUBLISHED on both sides. §20c is what renders the fact — §19 does not,
    // because on one program line the honest word is the same either way — so this
    // pins the property the rows must have, not a derivation of the list.
    const noRoute = [
      "ADAUSD",
      "BCHUSD",
      "BRENT",
      "BZUSD",
      "LTCUSD",
      "XRPUSD",
      "ZBUSD",
      "ZNUSD",
    ];
    assert.equal(noRoute.length, 8);
    for (const symbol of noRoute) {
      assert.ok(AVAILABLE_ASSET_SYMBOLS.includes(symbol), symbol);
      for (const program of PROGRAM_LINES) {
        assert.notEqual(
          findBrokerInstrument(program.line, symbol)!.tradability,
          "confirmed",
          `${program.line}:${symbol}`,
        );
      }
    }
  });

  it("caps gold's ticket at 20 lots and everything else at 50", () => {
    assert.equal(findBrokerInstrument("one", "XAUUSD")!.maxTicketLots.value, 20);
    assert.equal(findBrokerInstrument("one", "EURUSD")!.maxTicketLots.value, 50);
    assert.equal(
      findBrokerInstrument("one", "EURUSD")!.maxTicketLots.source.article,
      "9453396",
    );
    // A futures line has no ticket cap at all; its one cap is the margin allowance.
    assert.equal(
      findBrokerInstrument("signature_futures", "ESUSD")!.maxTicketLots.value,
      null,
    );
  });

  it("pins the three published contract-size rows and the forex 100,000", () => {
    const gold = findBrokerInstrument("one", "XAUUSD")!;
    assert.equal(gold.unit.kind, "forex_contract");
    assert.equal(
      gold.unit.kind === "forex_contract" ? gold.unit.contractSize.value : null,
      100,
    );
    assert.equal(gold.tradabilitySource.article, "9453488");
    for (const [symbol, points] of [["SP", 20], ["NSDQ", 5], ["DOW", 5]] as const) {
      const row = findBrokerInstrument("one", symbol)!;
      assert.equal(row.unit.kind, "index_points");
      assert.equal(
        row.unit.kind === "index_points" ? row.unit.pointsPerLot.value : null,
        points,
      );
    }
    const pair = findBrokerInstrument("one", "EURUSD")!;
    assert.equal(
      pair.unit.kind === "forex_contract" ? pair.unit.contractSize.value : null,
      100_000,
    );
    assert.equal(pair.unit.kind === "forex_contract" ? pair.unit.contractSize.source.url : "", "https://e8x.e8markets.com/trading-symbols");
  });

  it("flags the three inverted FX mappings and leaves none of them confirmed", () => {
    assert.deepEqual(Object.keys(INVERTED_FX).sort(), ["USDCAD", "USDCHF", "USDJPY"]);
    const inverted = BROKER_INSTRUMENTS.filter((row) => row.inverted);
    // One row per inverted pair per futures line: spot FX is not on a futures
    // program, so all nine are not_offered and wave 1 has zero confirmed
    // inverted rows.
    assert.equal(inverted.length, 9);
    for (const row of inverted) {
      assert.notEqual(row.tradability, "confirmed");
      assert.equal(row.priceScaleFactor.value, null, "a reciprocal axis has no factor");
    }
    // The CFD side of the same pairs is same-direction and carries a factor of 1.
    for (const symbol of Object.keys(INVERTED_FX)) {
      const cfd = findBrokerInstrument("one", symbol)!;
      assert.equal(cfd.inverted, false);
      assert.equal(cfd.priceScaleFactor.value, 1);
    }
  });

  it("keeps the nine non-scannable markets present and never sizeable", () => {
    assert.deepEqual(ADDENDUM.sort(), [
      "ASX",
      "BNBUSD",
      "DAX",
      "DOW",
      "HGUSD",
      "NGUSD",
      "NIKKEI",
      "NSDQ",
      "SP",
    ]);
    for (const program of PROGRAM_LINES) {
      for (const symbol of ADDENDUM) {
        assert.ok(findBrokerInstrument(program.line, symbol), `${program.line}:${symbol}`);
        assert.ok(
          !SIZEABLE_MARKETS_BY_LINE[program.line].includes(symbol),
          `${symbol} must never be sizeable while it is no-trade or hidden`,
        );
      }
    }
  });

  it("counts what is sizeable in wave 1: 29 on a CFD line, 8 on a futures line, 0 on a crypto line", () => {
    for (const line of ["one", "pro_forex", "signature_forex", "zero"] as ProgramLine[]) {
      assert.equal(SIZEABLE_MARKETS_BY_LINE[line].length, 29, line);
    }
    for (
      const line of [
        "signature_futures",
        "zero_futures_starter",
        "zero_futures_max",
      ] as ProgramLine[]
    ) {
      assert.deepEqual(SIZEABLE_MARKETS_BY_LINE[line].sort(), [
        "CLUSD",
        "ESUSD",
        "GCUSD",
        "MGCUSD",
        "NQUSD",
        "RTYUSD",
        "SIUSD",
        "YMUSD",
      ]);
    }
    for (const line of ["one_crypto", "pro_crypto", "signature_crypto"] as ProgramLine[]) {
      assert.deepEqual(SIZEABLE_MARKETS_BY_LINE[line], [], line);
    }
  });
});

// ---------------------------------------------------------------------------
// §19c — the bridging derivation, and the boundary as CI
// ---------------------------------------------------------------------------

const FOREX_PAIRS = SECURITY_OPTIONS.filter((option) => option.assetType === "Forex")
  .map((option) => option.symbol);

describe("§19c — E8's bridging method, and only Levelflow's own quotes feeding it", () => {
  it("resolves both bridges for all 28 pairs", () => {
    assert.equal(FOREX_PAIRS.length, 28);
    for (const pair of FOREX_PAIRS) {
      assert.ok(usdPerQuoteBridge(pair), `${pair} usdPerQuote`);
      assert.ok(instrumentPriceBridge(pair), `${pair} instrument price`);
    }
  });

  it("reads no market Levelflow does not already scan — the boundary as CI", () => {
    const legs = new Set<string>();
    for (const pair of [...FOREX_PAIRS, "XAUUSD"]) {
      for (const leg of bridgeLegsFor(pair)) {
        legs.add(leg);
      }
    }
    for (const leg of legs) {
      assert.ok(
        AVAILABLE_ASSET_SYMBOLS.includes(leg),
        `${leg} is not in Levelflow's scannable roster`,
      );
    }
    // The six USD pairs §19c names, plus each USD-quoted instrument's own price.
    for (const required of [
      "USDJPY",
      "USDCHF",
      "USDCAD",
      "AUDUSD",
      "EURUSD",
      "GBPUSD",
      "NZDUSD",
    ]) {
      assert.ok(legs.has(required), `${required} must be a bridge leg`);
    }
  });

  it("splits the 13 pairs E8 enumerates from the 15 it does not, by name", () => {
    const published = FOREX_PAIRS.filter(
      (pair) => instrumentPriceBridge(pair)!.source.tag === "primary",
    ).sort();
    const derived = FOREX_PAIRS.filter(
      (pair) => instrumentPriceBridge(pair)!.source.tag === "derived",
    ).sort();
    assert.deepEqual(published, [...ENUMERATED_BRIDGE_PAIRS].sort());
    assert.equal(published.length, 13);
    assert.deepEqual(derived, [
      "AUDCAD",
      "AUDCHF",
      "AUDJPY",
      "AUDNZD",
      "CADCHF",
      "CADJPY",
      "CHFJPY",
      "EURAUD",
      "EURCAD",
      "EURCHF",
      "EURGBP",
      "EURJPY",
      "EURNZD",
      "GBPAUD",
      "GBPCAD",
    ]);
    assert.equal(derived.length, 15);
    for (const pair of derived) {
      assert.equal(instrumentPriceBridge(pair)!.source.method, "9453396");
    }
  });

  it("follows E8's four published cases exactly where it publishes them", () => {
    // A USD-quoted pair uses its own price.
    assert.deepEqual(instrumentPriceBridge("EURUSD"), {
      kind: "leg",
      leg: "EURUSD",
      invert: false,
      source: instrumentPriceBridge("EURUSD")!.source,
    });
    // A USD-first pair uses 1.
    assert.equal(instrumentPriceBridge("USDCHF")!.kind, "one");
    // GBP/NZD, GBP/JPY, GBP/CHF bridge via GBP/USD.
    for (const pair of ["GBPNZD", "GBPJPY", "GBPCHF"]) {
      const bridge = instrumentPriceBridge(pair)!;
      assert.equal(bridge.kind === "leg" ? bridge.leg : null, "GBPUSD");
      assert.equal(bridge.source.tag, "primary");
    }
    // NZD/JPY, NZD/CAD, NZD/CHF bridge via NZD/USD.
    for (const pair of ["NZDJPY", "NZDCAD", "NZDCHF"]) {
      const bridge = instrumentPriceBridge(pair)!;
      assert.equal(bridge.kind === "leg" ? bridge.leg : null, "NZDUSD");
      assert.equal(bridge.source.tag, "primary");
    }
    // The CAD-base and CHF-base crosses invert their USD-first leg.
    for (const [pair, leg] of [["CADJPY", "USDCAD"], ["CHFJPY", "USDCHF"]] as const) {
      const bridge = instrumentPriceBridge(pair)!;
      assert.equal(bridge.kind === "leg" ? bridge.leg : null, leg);
      assert.equal(bridge.kind === "leg" ? bridge.invert : null, true);
    }
  });

  it("derives usdPerQuote as 1 for the four USD-quoted pairs and a leg for the other 24", () => {
    for (const pair of ["AUDUSD", "EURUSD", "GBPUSD", "NZDUSD"]) {
      assert.equal(usdPerQuoteBridge(pair)!.kind, "one");
    }
    const legFor = (pair: string) => {
      const bridge = usdPerQuoteBridge(pair)!;
      return bridge.kind === "leg" ? `${bridge.invert ? "1/" : ""}${bridge.leg}` : "1";
    };
    assert.equal(legFor("EURJPY"), "1/USDJPY");
    assert.equal(legFor("USDJPY"), "1/USDJPY");
    assert.equal(legFor("CADCHF"), "1/USDCHF");
    assert.equal(legFor("NZDCAD"), "1/USDCAD");
    assert.equal(legFor("AUDNZD"), "NZDUSD");
    assert.equal(legFor("EURAUD"), "AUDUSD");
    assert.equal(legFor("EURGBP"), "GBPUSD");
    for (const pair of FOREX_PAIRS) {
      assert.equal(usdPerQuoteBridge(pair)!.source.method, "9453488");
      assert.equal(usdPerQuoteBridge(pair)!.source.tag, "derived");
    }
  });
});

import {
  CLASSIFICATIONS,
  classificationOf,
  isPlatformVerified,
  isProgramLineVerified,
  PLATFORM_LABELS,
  platformsFor,
  programLinesFor,
} from "../src/lib/broker/catalog";

describe("§20i ruling 7 — the catalog walk transcribes the purchase screen", () => {
  // docs/research/e8-purchase-screen-2026-08-02.md, three market walks.
  it("renders three markets, in E8's own words", () => {
    assert.deepEqual(CLASSIFICATIONS.map((c) => c.label), ["Forex", "Crypto", "Futures"]);
    assert.deepEqual(
      CLASSIFICATIONS.map((c) => c.value),
      ["forex", "crypto", "futures"],
    );
  });

  it("places every sold line on the market that sells it — `zero` is unsold and absent", () => {
    assert.deepEqual(
      programLinesFor("forex").map((p) => p.line),
      ["one", "pro_forex", "signature_forex"],
    );
    assert.deepEqual(
      programLinesFor("crypto").map((p) => p.line),
      ["one_crypto", "pro_crypto", "signature_crypto"],
    );
    assert.deepEqual(
      programLinesFor("futures").map((p) => p.line),
      ["signature_futures", "zero_futures_starter", "zero_futures_max"],
    );
    // Amendment 19: the checkout record rules, and `zero` is on no walk, so
    // no walk places it. Every sold line appears exactly where sold.
    for (const program of PROGRAM_LINES.filter((p) => p.line !== "zero")) {
      assert.ok(
        programLinesFor(classificationOf(program.line)).some(
          (candidate) => candidate.line === program.line,
        ),
      );
    }
  });

  // The Forex walk: "E8 One offers MatchTrader AND TradeLocker; E8 Pro and
  // E8 Signature offer TradeLocker only." Crypto: "TradeLocker only on every
  // line, E8 One included." Futures: "Tradovate only."
  it("offers each line only the platforms the checkout offers it", () => {
    assert.deepEqual(platformsFor("one"), ["tradelocker", "matchtrader"]);
    assert.deepEqual(platformsFor("pro_forex"), ["tradelocker"]);
    assert.deepEqual(platformsFor("signature_forex"), ["tradelocker"]);
    assert.deepEqual(platformsFor("one_crypto"), ["tradelocker"]);
    assert.deepEqual(platformsFor("pro_crypto"), ["tradelocker"]);
    assert.deepEqual(platformsFor("signature_crypto"), ["tradelocker"]);
    assert.deepEqual(platformsFor("signature_futures"), ["tradovate"]);
    assert.deepEqual(platformsFor("zero_futures_starter"), ["tradovate"]);
    assert.deepEqual(platformsFor("zero_futures_max"), ["tradovate"]);
  });

  it("names the platforms as the checkout names them", () => {
    assert.deepEqual(PLATFORM_LABELS, {
      matchtrader: "MatchTrader",
      tradelocker: "TradeLocker",
      tradovate: "Tradovate",
    });
  });

  // Amendment 12: MatchTrader present but disabled until verified. Amendment
  // 19: `zero` is unsold and never walked (pinned above); its verified flag
  // stays false as defense in depth should an edit ever re-add it to a walk.
  it("greys exactly MatchTrader; every walked line is verified", () => {
    assert.equal(isPlatformVerified("tradelocker"), true);
    assert.equal(isPlatformVerified("tradovate"), true);
    assert.equal(isPlatformVerified("matchtrader"), false);
    assert.equal(isProgramLineVerified("zero"), false);
    for (const program of PROGRAM_LINES.filter((p) => p.line !== "zero")) {
      assert.equal(isProgramLineVerified(program.line), true);
    }
  });

  it("offers no free-form entry — every option set is a finite enumeration", () => {
    const source = readFileSync("src/lib/broker/catalog.ts", "utf8");
    assert.doesNotMatch(source, /type="number"|parseFloat|parseInt|Number\(/);
  });
});

// ---------------------------------------------------------------------------
// Amendment 4 — the `verified` tag and the `Observation` shape
// ---------------------------------------------------------------------------

function unitValuesOf(unit: QuoteUnit): Valued<number>[] {
  switch (unit.kind) {
    case "forex_contract":
      return [unit.contractSize];
    case "index_points":
      return [unit.pointsPerLot];
    case "futures_tick":
      return [unit.tickSize, unit.valuePerTick];
  }
}

// The Provenance constants programs.ts exports at module scope — every one of
// them is already reachable transitively through BROKER_INSTRUMENTS or
// PROGRAM_LINES below, but naming them here too means a future constant that
// is not yet wired into either structure still gets checked rather than
// silently skipped.
const MODULE_LEVEL_PROVENANCES: Provenance[] = [
  CANONICAL_LIST,
  CONTRACT_SIZES,
  CUSTOM_ACCOUNT,
  E8X_TRADING_SYMBOLS,
  INSTRUMENTS_ARTICLE,
  INSTRUMENT_ROSTER,
  LEVERAGE_ARTICLE,
  LOT_RESTRICTIONS,
  MAX_CONTRACTS,
  TICK_SIZES,
  ZERO_PRODUCT,
];

/** Every `Provenance` reachable from the roster, the program lines, and the module's own source constants. */
function allProvenances(): Provenance[] {
  const sources: Provenance[] = [...MODULE_LEVEL_PROVENANCES];
  for (const row of BROKER_INSTRUMENTS) {
    sources.push(row.tradabilitySource);
    if (row.brokerSymbolSource) {
      sources.push(row.brokerSymbolSource);
    }
    for (const value of unitValuesOf(row.unit)) {
      sources.push(value.source);
    }
    sources.push(row.priceScaleFactor.source);
    sources.push(row.marginPerContract.source);
    sources.push(row.maxTicketLots.source);
  }
  for (const program of PROGRAM_LINES) {
    sources.push(program.accountSizeSource);
    for (const leverageValue of Object.values(program.leverage)) {
      if (leverageValue) {
        sources.push(leverageValue.source);
      }
    }
  }
  return sources;
}

/**
 * The non-null `Valued<>` members a confirmed row's own family actually needs:
 * the unit's own values, plus priceScaleFactor, marginPerContract and
 * maxTicketLots wherever the row's family populates them (the other family's
 * field is always null by construction, so filtering on non-null value is
 * the family filter).
 */
function requiredUnitValues(row: BrokerInstrument): Valued<number>[] {
  return [
    ...unitValuesOf(row.unit),
    row.priceScaleFactor,
    row.marginPerContract,
    row.maxTicketLots,
  ].filter((value) => value.value !== null);
}

describe("§19a — `verified` is the fifth tag and the third admissible one", () => {
  const TYPES_SOURCE = readFileSync("src/lib/broker/types.ts", "utf8");

  it("retires the two-route boundary from the header comment", () => {
    assert.ok(
      !TYPES_SOURCE.includes("There is no third source"),
      "the preamble's third route is law since 2026-08-02",
    );
    assert.match(TYPES_SOURCE, /the owner observes it directly on the broker's live platform/);
  });

  it("declares the Observation shape and the widened Provenance", () => {
    assert.match(TYPES_SOURCE, /export type Observation = \{/);
    assert.match(TYPES_SOURCE, /tag: "primary" \| "derived" \| "verified" \| "secondary" \| "dossier";/);
    assert.match(TYPES_SOURCE, /url: string \| null;/);
    assert.match(TYPES_SOURCE, /observation: Observation \| null;/);
  });

  it("every verified value carries a dated, platformed observation and is never also primary", () => {
    for (const source of allProvenances()) {
      if (source.tag !== "verified") {
        assert.equal(source.observation, null, "only verified carries an observation");
        continue;
      }
      assert.equal(source.article, null);
      assert.equal(source.url, null);
      assert.ok(source.observation, "a verified value carries its observation");
      assert.match(source.observation.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(source.observation.platform.length > 0);
      assert.ok(source.observation.program.length > 0);
    }
  });

  it("widens the confirmed implication to admit verified", () => {
    for (const row of BROKER_INSTRUMENTS.filter((r) => r.tradability === "confirmed")) {
      assert.ok(
        ["primary", "verified"].includes(row.tradabilitySource.tag),
        `${row.programLine}/${row.levelflowSymbol} tradability tag`,
      );
      for (const value of requiredUnitValues(row)) {
        assert.ok(
          ["primary", "derived", "verified"].includes(value.source.tag),
          `${row.programLine}/${row.levelflowSymbol} unit value tag`,
        );
      }
    }
  });
});
