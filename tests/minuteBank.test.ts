import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bankableSymbols, usableBar } from "../scripts/bank-minute-bars.ts";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";

// The bank is append-only against a provider window three days wide, so a bar
// banked wrong is banked wrong forever and a bar missed is missed forever.
// These pin the two properties that make it recoverable: the provider's own
// date string survives untouched, and a malformed bar is dropped rather than
// repaired.

describe("minute bank — what gets banked", () => {
  it("covers every master-list row that has an FMP mate, and nothing else", () => {
    const banked = new Set(bankableSymbols().map((entry) => entry.fmpSymbol));
    const expected = new Set(
      MASTER_LIST_ROWS.map((row) => row.fmpSymbol).filter(
        (symbol): symbol is string => Boolean(symbol),
      ),
    );
    assert.deepEqual([...banked].sort(), [...expected].sort());
  });

  it("banks one entry per provider symbol, carrying every market it serves", () => {
    // WTI/CLUSD and BRENT/BZUSD already share one FMP series across two
    // account types, so a per-market bank would fetch the same series twice
    // and a per-market key would collide on merge.
    const entries = bankableSymbols();
    const symbols = entries.map((entry) => entry.fmpSymbol);
    assert.equal(new Set(symbols).size, symbols.length);
    const shared = entries.filter((entry) => entry.markets.length > 1);
    assert.ok(
      shared.length > 0,
      "at least one FMP series is expected to serve more than one market",
    );
  });
});

describe("minute bank — a bar is banked only if it is whole", () => {
  const whole = {
    date: "2026-08-06 09:30:00",
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume: 10,
  };

  it("accepts a whole bar", () => {
    assert.equal(usableBar(whole), true);
  });

  it("rejects a bar with no date rather than stamping it with the run time", () => {
    // bars.ts's toTimestamp falls back to Date.now() on an unparseable date.
    // That is survivable in a rolling cache that refetches; in an append-only
    // bank it writes a fabricated timestamp that can never be distinguished
    // from a real one.
    assert.equal(usableBar({ ...whole, date: undefined }), false);
    assert.equal(usableBar({ ...whole, date: "" }), false);
  });

  it("rejects a bar with a missing or non-finite price", () => {
    for (const field of ["open", "high", "low", "close"] as const) {
      assert.equal(usableBar({ ...whole, [field]: undefined }), false, field);
      assert.equal(usableBar({ ...whole, [field]: Number.NaN }), false, field);
    }
  });

  it("accepts a bar with no volume, because indices report none", () => {
    // ^GSPC and its siblings return volume 0 or omit it; that is not a defect.
    assert.equal(usableBar({ ...whole, volume: undefined }), true);
  });
});
