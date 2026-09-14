// Round-8 CO-1/CO-2/CO-3/CO-4 (converge ledger, 2026-08-10): the venue's
// published bill, per line. Every figure asserts the dossier arithmetic —
// docs/research/e8-futures-dossier.md §5.2 (three itemized per-contract RT
// fees ÷ tick value × tick size), e8-markets-dossier.md §12a ($5/lot RT on
// 100k forex), §12b (index $ /point multipliers, $6/$12 commission split),
// and the crypto account's sampled book (e8-crypto-account-2026-08-03.md)
// as per-symbol spread FLOORS. Where E8 publishes nothing, the module
// carries a named conservative proxy — never silence, never zero.
//
// EXCEPT the forex cross pin (2026-09-13): it asserts the CODE's arithmetic
// and labels it an approximation — see its own comment. The dossier figure
// is $5/lot on 100k BASE units, i.e. 5e-5 USD per base unit; in quote units
// that is exact where USD is the quote (the constant) or the base (price ×
// 5e-5), and off by USD-per-BASE on the 21 crosses.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  knownSymbols,
  quoteCurrencyUsdLeg,
  symbolCurrencyPair,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  cryptoSpreadFloorPrice,
  venueCommissionRoundTripPrice,
} from "../supabase/functions/trade-analyzer/venueCosts.ts";

const close = (actual: number | null, expected: number, tolerance = 1e-9) => {
  assert.notEqual(actual, null);
  assert.ok(
    Math.abs((actual as number) - expected) <= tolerance,
    `expected ${expected}, got ${actual}`,
  );
};

describe("venueCommissionRoundTripPrice — futures program (three fees, primary)", () => {
  it("ES: (2.58+2.80+0.38)/12.50 ticks x 0.25", () => {
    close(venueCommissionRoundTripPrice("ESUSD", 5500, null), 0.1152);
  });
  it("CL: 6.00/10.00 x 0.01", () => {
    close(venueCommissionRoundTripPrice("CLUSD", 79, null), 0.006);
  });
  it("corn pays the CBOT commodity rate: 7.20/12.50 x 0.25", () => {
    close(venueCommissionRoundTripPrice("ZCUSX", 449.75, null), 0.144);
  });
  it("is price-independent for contract-based classes", () => {
    assert.equal(
      venueCommissionRoundTripPrice("ESUSD", 1000, null),
      venueCommissionRoundTripPrice("ESUSD", 9000, null),
    );
  });
  it("Brent carries the crude sibling proxy (no published row)", () => {
    close(venueCommissionRoundTripPrice("BZUSD", 85, null), 0.006);
  });
  it("30-year bond carries the conservative family proxy: 7.20/31.25 x 0.03125", () => {
    close(venueCommissionRoundTripPrice("ZBUSD", 118, null), 0.0072);
  });
  it("feeder cattle proxies its CME Agro siblings: 7.20/12.50 x 0.025", () => {
    close(venueCommissionRoundTripPrice("GFUSX", 348.3, null), 0.0144);
  });
});

describe("venueCommissionRoundTripPrice — CFD lines", () => {
  // RELABELLED 2026-09-13. This test used to be titled "$5/lot RT on 100k is
  // 0.5bp of price", and pinned EURUSD at 1.1 -> 0.000055 as if that were the
  // right number. It is the number the code produces; it is not the right
  // number. $5 per 100,000 BASE units is a fixed 5e-5 USD per base unit, and
  // the accountant needs it in QUOTE units: 5e-5 / (USD per quote). The code
  // returned referencePrice × 5e-5 for every pair, which equals that only
  // when USD is the base; since the 2026-09-13 USD-quote version the four
  // USD-quote pairs pay the constant. See
  // docs/research/forex-commission-conversion-2026-09-13.md.
  //
  // E8's forex commission is $5 round-turn per 100,000 BASE units — 5e-5 USD
  // per base unit. The accountant needs it as a distance in QUOTE units, so
  // the exact figure is 5e-5 × (quote per USD). Record and measurements:
  // docs/research/forex-commission-conversion-2026-09-13.md.
  it("forex, USD quote: the round trip is the constant 5e-5 at any price", () => {
    close(venueCommissionRoundTripPrice("EURUSD", 1.1, null), 0.00005);
    close(venueCommissionRoundTripPrice("GBPUSD", 1.27, null), 0.00005);
    close(venueCommissionRoundTripPrice("GBPUSD", 1.6, null), 0.00005);
    close(venueCommissionRoundTripPrice("AUDUSD", 0.66, null), 0.00005);
    close(venueCommissionRoundTripPrice("NZDUSD", 0.61, null), 0.00005);
  });
  it("forex, USD quote: exactly four roster symbols, derived from the currency table", () => {
    const forex = knownSymbols.filter(
      (symbol) => getAssetType(symbol) === "forex",
    );
    assert.equal(forex.length, 28);
    for (const symbol of forex) {
      // A forex symbol without a table entry would fall to the cross formula
      // silently — the review's one seam (2026-09-13). Every pair is named.
      assert.notEqual(symbolCurrencyPair(symbol), null, `${symbol} has no currency pair`);
    }
    const usdQuote = forex.filter(
      (symbol) => symbolCurrencyPair(symbol)?.[1] === "USD",
    );
    assert.deepEqual([...usdQuote].sort(), [
      "AUDUSD",
      "EURUSD",
      "GBPUSD",
      "NZDUSD",
    ]);
    for (const symbol of usdQuote) {
      assert.equal(
        venueCommissionRoundTripPrice(symbol, 0.5, null),
        venueCommissionRoundTripPrice(symbol, 2, null),
        `${symbol} must not scale with price`,
      );
    }
  });
  it("quoteCurrencyUsdLeg: the 21 crosses name their USD leg from the table; the seven USD pairs need none", () => {
    // Derived from the currency table, never from a ticker's shape: the leg
    // is the roster pair that quotes the cross's quote currency in USD
    // (direct) or is based in USD (inverted — the price is units per USD).
    assert.deepEqual(quoteCurrencyUsdLeg("EURJPY"), { currency: "JPY", kind: "leg", leg: "USDJPY", usdIsBase: true });
    assert.deepEqual(quoteCurrencyUsdLeg("EURGBP"), { currency: "GBP", kind: "leg", leg: "GBPUSD", usdIsBase: false });
    assert.deepEqual(quoteCurrencyUsdLeg("AUDNZD"), { currency: "NZD", kind: "leg", leg: "NZDUSD", usdIsBase: false });
    assert.deepEqual(quoteCurrencyUsdLeg("CADCHF"), { currency: "CHF", kind: "leg", leg: "USDCHF", usdIsBase: true });
    for (const symbol of ["EURUSD", "GBPUSD", "AUDUSD", "NZDUSD", "USDJPY", "USDCAD", "USDCHF"]) {
      assert.deepEqual(quoteCurrencyUsdLeg(symbol), { kind: "none" }, `${symbol} needs no rate`);
    }
    assert.deepEqual(quoteCurrencyUsdLeg("XAUUSD"), { kind: "none" });
    assert.deepEqual(quoteCurrencyUsdLeg("ESUSD"), { kind: "none" });
    assert.deepEqual(quoteCurrencyUsdLeg("NOPE"), { kind: "none" });
    const crosses = knownSymbols.filter((symbol) => quoteCurrencyUsdLeg(symbol).kind === "leg");
    assert.equal(crosses.length, 21, "exactly the 21 crosses carry a leg");
    const legs = new Map<string, string[]>();
    for (const symbol of crosses) {
      const rate = quoteCurrencyUsdLeg(symbol);
      if (rate.kind !== "leg") continue;
      assert.ok(knownSymbols.includes(rate.leg), `${symbol}'s leg ${rate.leg} must be on the roster`);
      legs.set(rate.leg, [...(legs.get(rate.leg) ?? []), symbol].sort());
    }
    assert.deepEqual(
      [...legs].sort().map(([leg, symbols]) => `${leg}:${symbols.length}`),
      ["AUDUSD:2", "GBPUSD:1", "NZDUSD:3", "USDCAD:4", "USDCHF:5", "USDJPY:6"],
    );
  });
  it("symbolCurrencyPair answers a pair or null — never a half-filled pair", () => {
    // M5 (2026-09-13) survived without this: dropping the length guard leaks
    // ["USD", undefined] for single-currency entries. Not a forex symbol, so
    // no commission moved — but the helper's contract is what the branch
    // above relies on, and a contract nobody pins is not one.
    assert.deepEqual(symbolCurrencyPair("EURUSD"), ["EUR", "USD"]);
    assert.deepEqual(symbolCurrencyPair("USDJPY"), ["USD", "JPY"]);
    assert.equal(symbolCurrencyPair("XAUUSD"), null);
    assert.equal(symbolCurrencyPair("ESUSD"), null);
    assert.equal(symbolCurrencyPair("NOPE"), null);
  });
  it("forex, USD base: price × 5e-5 is exact (the price IS quote per USD)", () => {
    close(venueCommissionRoundTripPrice("USDJPY", 150, null), 0.0075);
    close(venueCommissionRoundTripPrice("USDCAD", 1.36, null), 0.000068);
  });
  it("forex crosses: 5e-5 over USD-per-quote, exact, and NEVER the price-scaled figure (2026-09-14)", () => {
    // Until the 2026-09-14 cross-rate version the code returned
    // referencePrice × 5e-5 here — the true distance multiplied by
    // USD-per-BASE, two-sided (record: forex-commission-conversion-2026-09-13.md).
    // GBPJPY at 190 charged 0.0095 JPY per unit; the true figure is $5 per
    // 100,000 GBP expressed in JPY: 5e-5 × USDJPY = 0.0075 at USDJPY 150,
    // i.e. 5e-5 / (1/150). EURGBP: $5 per 100,000 EUR in GBP = 5e-5 / GBPUSD
    // = 3.7037e-5 at GBPUSD 1.35 — the code used to say 4.25e-5 at 0.85.
    close(venueCommissionRoundTripPrice("GBPJPY", 190, 1 / 150), 0.0075);
    close(venueCommissionRoundTripPrice("EURGBP", 0.85, 1.35), 0.00005 / 1.35);
    close(venueCommissionRoundTripPrice("EURJPY", 165, 1 / 153.5), 0.007675);
    // The price of the cross itself never enters the figure.
    assert.equal(
      venueCommissionRoundTripPrice("GBPJPY", 190, 1 / 150),
      venueCommissionRoundTripPrice("GBPJPY", 210, 1 / 150),
    );
  });
  it("forex crosses: without a rate the answer is null, never a guess and never zero", () => {
    // A cross priced without its quote currency's USD rate has no honest
    // figure: the caller refuses the setup (§19e). The price-scaled
    // approximation is gone from this module entirely.
    assert.equal(venueCommissionRoundTripPrice("GBPJPY", 190, null), null);
    assert.equal(venueCommissionRoundTripPrice("EURGBP", 0.85, 0), null);
    assert.equal(venueCommissionRoundTripPrice("EURGBP", 0.85, Number.NaN), null);
    assert.equal(venueCommissionRoundTripPrice("EURGBP", 0.85, -1.3), null);
  });
  it("USD-quote and USD-base pairs ignore the rate: their figure needs none", () => {
    close(venueCommissionRoundTripPrice("EURUSD", 1.1, null), 0.00005);
    close(venueCommissionRoundTripPrice("EURUSD", 1.1, 7), 0.00005);
    close(venueCommissionRoundTripPrice("USDJPY", 150, null), 0.0075);
    close(venueCommissionRoundTripPrice("USDJPY", 150, 0.42), 0.0075);
  });
  it("SP pays $6 against its published $20/point", () => {
    close(venueCommissionRoundTripPrice("SP", 5500, null), 0.3);
  });
  it("DOW pays the $12 split against $5/point", () => {
    close(venueCommissionRoundTripPrice("DOW", 40000, null), 2.4);
  });
  it("DAX pays $6 against the conservative $5/point assumption", () => {
    close(venueCommissionRoundTripPrice("DAX", 18000, null), 1.2);
  });
  it("gold: $6 over the published 100oz lot", () => {
    close(venueCommissionRoundTripPrice("XAUUSD", 2400, null), 0.06);
  });
  it("silver: $6 over the standard 5000oz lot", () => {
    close(venueCommissionRoundTripPrice("XAGUSD", 28, null), 0.0012);
  });
  it("WTI: $6 over the conservative 100bbl assumption", () => {
    close(venueCommissionRoundTripPrice("WTI", 79, null), 0.06);
  });
  it("crypto: the dossier's conflicted units resolve to 0.035% per side", () => {
    close(venueCommissionRoundTripPrice("BTCUSD", 63840, null), 44.688, 1e-6);
  });
  it("refuses unknown symbols with null, never a guess", () => {
    assert.equal(venueCommissionRoundTripPrice("^GSPC", 5500, null), null);
    assert.equal(venueCommissionRoundTripPrice("NOPE", 1, null), null);
  });
});

describe("cryptoSpreadFloorPrice — the sampled book as a floor (CO-2)", () => {
  it("ADA floors at its sampled 11.3bp", () => {
    close(cryptoSpreadFloorPrice("ADAUSD", 0.1941), 0.1941 * 11.3e-4, 1e-9);
  });
  it("ATOM floors at its sampled 96.6bp", () => {
    close(cryptoSpreadFloorPrice("ATOMUSD", 1.3455), 1.3455 * 96.6e-4, 1e-9);
  });
  it("BTC's own book is BELOW the class model — floor stays tiny", () => {
    close(cryptoSpreadFloorPrice("BTCUSD", 63840), 63840 * 0.35e-4, 1e-6);
  });
  it("TRUMP's zero-width display sample yields no floor", () => {
    assert.equal(cryptoSpreadFloorPrice("TRUMPUSD", 1.5), null);
  });
  it("non-crypto symbols have no crypto floor", () => {
    assert.equal(cryptoSpreadFloorPrice("EURUSD", 1.1), null);
  });
});
