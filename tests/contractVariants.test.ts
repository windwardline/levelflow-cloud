import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTRACT_SIZE_VARIANTS,
  isContractSizeVariant,
  parentMarketOf,
  variantsOf,
} from "../src/lib/broker/contractVariants.ts";
import { MASTER_LIST_ROWS, sweepUniverse } from "../src/lib/broker/masterList.ts";
import { scannableSymbolsFor } from "../src/lib/broker/visibility.ts";
import { AVAILABLE_ASSET_SYMBOLS, SECURITY_OPTIONS } from "../src/lib/symbolMap.ts";
import { BROKER_INSTRUMENTS } from "../src/lib/broker/instruments.ts";

// Owner ruling (2026-08-05): one analyzed market per underlying, per account
// type; contract size is a sizing dimension, never a second scan row. These
// pins are the durable half of that ruling — the register alone would decay
// into a comment, and the failure it prevents is silent. Two rows for one gold
// opportunity does not throw; it just double-counts the opportunity in the
// ranked scan and counts one trade's outcome twice in the money-positive
// record every calibration decision reads.
describe("contract-size variants are sized, never scanned (owner ruling 2026-08-05)", () => {
  it("declares MGCUSD as micro gold against GCUSD", () => {
    assert.equal(parentMarketOf("MGCUSD"), "GCUSD");
    assert.equal(isContractSizeVariant("MGCUSD"), true);
    assert.deepEqual(variantsOf("GCUSD"), ["MGCUSD"]);
  });

  it("keeps every declared variant out of all three account types' scannable sets", () => {
    for (const variant of Object.keys(CONTRACT_SIZE_VARIANTS)) {
      for (const classification of ["forex", "crypto", "futures"] as const) {
        assert.ok(
          !scannableSymbolsFor(classification).includes(variant),
          `${variant} must not be scannable on a ${classification} account`,
        );
      }
      assert.ok(
        !scannableSymbolsFor(null).includes(variant),
        `${variant} must not be scannable in the account-agnostic union either`,
      );
    }
  });

  it("keeps every variant's parent scannable — a variant may never orphan its market", () => {
    // The failure this catches: excluding a variant while its parent is itself
    // withheld would silently remove the underlying market from Levelflow
    // altogether. Gold must not vanish because micro gold was demoted.
    for (const [variant, parent] of Object.entries(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(
        scannableSymbolsFor("futures").includes(parent) ||
          scannableSymbolsFor("forex").includes(parent) ||
          scannableSymbolsFor("crypto").includes(parent),
        `${variant}'s parent ${parent} is not scannable anywhere — the market would be lost`,
      );
    }
  });

  it("keeps every variant in the sizing layer — sizing is the whole reason it exists", () => {
    // MGC's tick value is a tenth of GC's, so a size computed for one is wrong
    // for the other. Demoting it from the scan must never cost it its sizing
    // identity, or the ruling would have broken what it set out to preserve.
    const sized = new Set(BROKER_INSTRUMENTS.map((row) => row.levelflowSymbol));
    for (const variant of Object.keys(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(sized.has(variant), `${variant} must remain in BROKER_INSTRUMENTS`);
    }
  });

  it("keeps every variant in the symbol map but out of the scannable master set", () => {
    const mapped = new Set(SECURITY_OPTIONS.map((option) => option.symbol));
    for (const variant of Object.keys(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(mapped.has(variant), `${variant} stays a known symbol`);
      assert.ok(
        !AVAILABLE_ASSET_SYMBOLS.includes(variant) ||
          !scannableSymbolsFor(null).includes(variant),
        `${variant} must not reach a user surface`,
      );
    }
  });

  it("drops every variant from the sweep universe — the same market twice teaches nothing", () => {
    const swept = new Set(sweepUniverse().map((entry) => entry.levelflowSymbol));
    for (const [variant, parent] of Object.entries(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(!swept.has(variant), `${variant} must not be swept separately`);
      assert.ok(swept.has(parent), `${parent} must still be swept`);
    }
  });

  it("never declares a variant whose parent is itself a variant", () => {
    // A chain (A sizes against B, B sizes against C) would make "the analyzed
    // market" ambiguous. One hop, always.
    for (const [variant, parent] of Object.entries(CONTRACT_SIZE_VARIANTS)) {
      assert.equal(
        isContractSizeVariant(parent),
        false,
        `${variant} points at ${parent}, which is itself a variant`,
      );
    }
  });

  it("declares a variant only for a symbol the registry actually knows", () => {
    const known = new Set(
      MASTER_LIST_ROWS.map((entry) => entry.levelflowSymbol).filter(
        (symbol): symbol is string => symbol !== null,
      ),
    );
    for (const [variant, parent] of Object.entries(CONTRACT_SIZE_VARIANTS)) {
      assert.ok(known.has(variant), `${variant} is not a registry row`);
      assert.ok(known.has(parent), `${parent} is not a registry row`);
    }
  });
});
