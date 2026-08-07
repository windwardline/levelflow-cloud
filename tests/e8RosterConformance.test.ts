import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";

// Would anything notice if E8 added an instrument tomorrow?
//
// Until this file, no. `verify-fmp-matches.ts` re-probes rows that already
// exist and cannot invent one; `reentryList()` iterates rows that already exist;
// and nothing compared either registry against E8's own offering. The gap was
// found the way FGBL was found — by a human reading a watchlist screenshot while
// looking for something else.
//
// The source is the owner's own frames, per amendment 19: nine screenshots taken
// 2026-08-03 minutes after purchasing a live E8 Signature Futures account, eight
// of them Tradovate watchlist tabs. `docs/research/e8-futures-account-2026-08-03.md`
// is their transcription of record, and this is that transcription as an
// assertion. NOT `E8_FUTURES_SPECS`, which is E8's published margin document —
// a different, smaller list that does not describe what the platform shows.
//
// Every live row below is a market the operator can actually see and trade on
// that account. Each must have a master-list row, or an entry in the register
// beneath saying why not. An instrument in neither is one nobody has looked at.

/**
 * E8 Signature Futures, every LIVE row, by watchlist tab. Contract-month codes
 * stripped (ESU6 -> ES): the month is the chain at capture time, not identity.
 *
 * Stale rows are deliberately excluded — Tradovate retains 2024-era months with
 * no data, and the transcription marks them. The Softs and Stocks tabs exist in
 * the chrome and were NOT captured, so this list is complete for eight tabs and
 * silent about two. That silence is itself a coverage gap and is recorded as one.
 */
const E8_FUTURES_WATCHLIST: Record<string, string[]> = {
  Indices: [
    "ES", "FESX", "NQ", "YM", "MES", "MNQ", "MYM", "MC", "FDAX", "EMD", "NKD", "FDXM",
  ],
  Crypto: ["BIT", "MBT", "MET", "BTC", "ETH"],
  Financials: ["ZN", "ZF", "FGBL", "FGBM", "FGBS", "FGBX", "ZT", "ZB", "UB", "TN"],
  Currencies: [
    "6E", "6J", "6A", "6B", "6C", "6M", "M6E", "6N", "6S", "E7", "M6A", "M6B",
    "J7", "MCD", "MSF",
  ],
  Energies: ["CL", "HO", "RB", "QM", "BZ", "QG"],
  Metals: ["GC", "HG", "SIC", "SI", "PL", "PA", "MGC"],
  Grains: ["ZC", "ZS", "ZW", "ZL", "ZM", "ZO", "XK", "XW", "XC", "ZR"],
  Meats: ["LE", "GF", "HE"],
};

/**
 * Every instrument on those frames with no master-list row, and the ground.
 *
 * An entry here is a decision someone made. An instrument in neither this list
 * nor the master list is an instrument nobody has looked at — which is exactly
 * what this file exists to make impossible.
 *
 * These thirteen were found by this test on the day it was written, so none of
 * them is a settled decision yet: each is a statement of what is known now, and
 * several are open questions rather than exclusions. They are listed so the
 * NEXT unnamed instrument is a gap in a known frontier rather than a surprise.
 */
const NO_MASTER_LIST_ROW: Record<string, string> = {
  MC: "unidentified — MCU6 printed 2712.25 on the Indices tab and no research frame resolves what it is",
  BIT: "unidentified CME crypto future — named in the §20i open list with SIC, no source resolved",
  MBT: "micro Bitcoin future — a contract-size variant of BTC, but never enumerated",
  MET: "micro Ether future — a contract-size variant of ETH, but never enumerated",
  SIC: "unidentified — SICU6 58.18 is silver's active month beside SIQ6 57.800; whether it is a distinct instrument is unresolved",
  M6E: "micro CME FX future — amendment 28 excludes the FX futures family on verified feed identity (6EU6 measured 17 pips off EURUSD spot)",
  E7: "half-size CME FX future — same ground as M6E",
  M6A: "micro CME FX future — same ground as M6E",
  M6B: "micro CME FX future — same ground as M6E",
  J7: "half-size CME yen future — same ground as M6E, with the inverted-quote hazard on top",
  MCD: "micro CME Canadian dollar future — same ground as M6E",
  MSF: "micro CME Swiss franc future — same ground as M6E",
  XW: "mini wheat — XK and XC are enumerated and this one was missed; no ground, this is an omission",
};

const SUFFIXES = ["", "USD", "USX"];

describe("E8's own frames and Levelflow's master list agree", () => {
  const masterNames = new Set(
    MASTER_LIST_ROWS.flatMap((row) =>
      [row.brokerName, row.levelflowSymbol].filter(
        (name): name is string => Boolean(name),
      )
    ),
  );
  const enumerated = (ticker: string) =>
    SUFFIXES.some((suffix) => masterNames.has(`${ticker}${suffix}`));
  const everyRow = Object.values(E8_FUTURES_WATCHLIST).flat();

  it("carries a row, or a stated ground, for every instrument on the frames", () => {
    const unaccounted = everyRow
      .filter((ticker) => !enumerated(ticker) && !(ticker in NO_MASTER_LIST_ROW))
      .sort();
    assert.deepEqual(
      unaccounted,
      [],
      "E8's platform shows these and Levelflow neither enumerates nor explains them — add a master-list row, or a NO_MASTER_LIST_ROW entry saying why not",
    );
  });

  it("keeps the register honest in the other direction", () => {
    // An instrument that has since been enumerated must leave the register,
    // otherwise the list slowly becomes a description of the past.
    for (const ticker of Object.keys(NO_MASTER_LIST_ROW)) {
      assert.ok(
        everyRow.includes(ticker),
        `${ticker} is not on E8's frames at all — remove it from the register`,
      );
      assert.equal(
        enumerated(ticker),
        false,
        `${ticker} has a master-list row now — remove it from NO_MASTER_LIST_ROW`,
      );
    }
  });

  it("states a ground for every absence, never a bare list", () => {
    for (const [ticker, ground] of Object.entries(NO_MASTER_LIST_ROW)) {
      assert.ok(
        ground.length > 30,
        `${ticker}'s absence needs a reason, not a placeholder`,
      );
    }
  });

  it("records how much of the offering is enumerated at all", () => {
    // Not a threshold to game — a number that has to move deliberately. If a
    // change reduces it, this fails and someone says why in the same PR.
    const covered = everyRow.filter(enumerated).length;
    assert.equal(
      covered,
      everyRow.length - Object.keys(NO_MASTER_LIST_ROW).length,
      "the register and the master list must together account for every row",
    );
    assert.equal(everyRow.length, 68, "the frames transcribe 68 live rows");
    assert.equal(covered, 55);
  });
});
