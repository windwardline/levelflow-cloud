// Round-8 CO-1/CO-2/CO-3/CO-4 (converge ledger, 2026-08-10): the venue's
// published bill, per line. Every figure asserts the dossier arithmetic —
// docs/research/e8-futures-dossier.md §5.2 (three itemized per-contract RT
// fees ÷ tick value × tick size), e8-markets-dossier.md §12a ($5/lot RT on
// 100k forex), §12b (index $ /point multipliers, $6/$12 commission split),
// and the crypto account's sampled book (e8-crypto-account-2026-08-03.md)
// as per-symbol spread FLOORS. Where E8 publishes nothing, the module
// carries a named conservative proxy — never silence, never zero.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
    close(venueCommissionRoundTripPrice("ESUSD", 5500), 0.1152);
  });
  it("CL: 6.00/10.00 x 0.01", () => {
    close(venueCommissionRoundTripPrice("CLUSD", 79), 0.006);
  });
  it("corn pays the CBOT commodity rate: 7.20/12.50 x 0.25", () => {
    close(venueCommissionRoundTripPrice("ZCUSX", 449.75), 0.144);
  });
  it("is price-independent for contract-based classes", () => {
    assert.equal(
      venueCommissionRoundTripPrice("ESUSD", 1000),
      venueCommissionRoundTripPrice("ESUSD", 9000),
    );
  });
  it("Brent carries the crude sibling proxy (no published row)", () => {
    close(venueCommissionRoundTripPrice("BZUSD", 85), 0.006);
  });
  it("30-year bond carries the conservative family proxy: 7.20/31.25 x 0.03125", () => {
    close(venueCommissionRoundTripPrice("ZBUSD", 118), 0.0072);
  });
  it("feeder cattle proxies its CME Agro siblings: 7.20/12.50 x 0.025", () => {
    close(venueCommissionRoundTripPrice("GFUSX", 348.3), 0.0144);
  });
});

describe("venueCommissionRoundTripPrice — CFD lines", () => {
  it("forex: $5/lot RT on 100k is 0.5bp of price", () => {
    close(venueCommissionRoundTripPrice("EURUSD", 1.1), 0.000055);
    close(venueCommissionRoundTripPrice("USDJPY", 150), 0.0075);
  });
  it("SP pays $6 against its published $20/point", () => {
    close(venueCommissionRoundTripPrice("SP", 5500), 0.3);
  });
  it("DOW pays the $12 split against $5/point", () => {
    close(venueCommissionRoundTripPrice("DOW", 40000), 2.4);
  });
  it("DAX pays $6 against the conservative $5/point assumption", () => {
    close(venueCommissionRoundTripPrice("DAX", 18000), 1.2);
  });
  it("gold: $6 over the published 100oz lot", () => {
    close(venueCommissionRoundTripPrice("XAUUSD", 2400), 0.06);
  });
  it("silver: $6 over the standard 5000oz lot", () => {
    close(venueCommissionRoundTripPrice("XAGUSD", 28), 0.0012);
  });
  it("WTI: $6 over the conservative 100bbl assumption", () => {
    close(venueCommissionRoundTripPrice("WTI", 79), 0.06);
  });
  it("crypto: the dossier's conflicted units resolve to 0.035% per side", () => {
    close(venueCommissionRoundTripPrice("BTCUSD", 63840), 44.688, 1e-6);
  });
  it("refuses unknown symbols with null, never a guess", () => {
    assert.equal(venueCommissionRoundTripPrice("^GSPC", 5500), null);
    assert.equal(venueCommissionRoundTripPrice("NOPE", 1), null);
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
