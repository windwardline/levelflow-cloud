import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AVAILABLE_ASSET_SYMBOLS } from "../src/lib/symbolMap.ts";
import { visibleAssetSymbols } from "../src/lib/broker/visibility.ts";
import {
  findMasterListRow,
  findMasterListRowByBrokerName,
  isServedToday,
  isVisibleToday,
  MASTER_LIST_ROWS,
  reentryList,
  rowCountsByClassification,
  rowCountsByStatus,
  rowsForClassification,
  servedSymbols,
  SERVED_COMPATIBLE_STATUSES,
  sweepUniverse,
  visibleSymbols,
  type MasterListRow,
} from "../src/lib/broker/masterList.ts";

// Amendment 23 (owner, 2026-08-05, docs/superpowers/specs/
// 2026-08-02-owner-rulings-amendments.md) and its offset-ruling extension.
// §19f discipline throughout: every count and every symbol pair below is a
// literal expectation, so a mapping cannot change without a deliberate test
// edit citing a fresh source. The row-generation logic in masterList.ts is
// exercised by these pins, not trusted on inspection alone.

describe("row counts — total, per classification, per status", () => {
  it("carries exactly 126 rows", () => {
    // 120 -> 126 on 2026-08-06: the six remaining CME FX majors (6E 6A 6B 6N 6C
    // 6S) were on no row at all. Every one prints live on the F9 sighting, so
    // their absence was a gap against the standing order, not a judgement.
    assert.equal(MASTER_LIST_ROWS.length, 126);
  });

  it("splits 38 forex / 55 futures / 33 crypto", () => {
    assert.deepEqual(rowCountsByClassification(), {
      forex: 38,
      // 27 -> 42: nineteen onboarded, less the four cash proxies that moved
      // from mapped-not-yet-onboarded into the served set on the same day.
      // Group A wired 2026-08-06: seven contract-size variants (MES MNQ MYM QM QG XK XC) joined for SIZING only. Each reads its parent's series and holds no scan slot, so knowable grows while scannable and swept do not.
      // 49 -> 55: the six CME FX majors, added 2026-08-06. Mapped to their
      // spot mates and withheld from the scan pending a basis-aware level
      // transform, so knowable grows while scannable and swept do not.
      futures: 55,
      crypto: 33,
    });
  });

  it("pins the six-way status breakdown", () => {
    assert.deepEqual(rowCountsByStatus(), {
      // MGCUSD became a contract-size variant on 2026-08-05 (owner ruling, contractVariants.ts): micro gold sizes against GCUSD and holds no scan slot, so it moved from served-and-visible to served-but-not-scannable.
      // 46 -> 95: the 2026-08-06 standing order released 49 markets from
      // NO_TRADE_SYMBOLS, and this status is derived from that set.
      "served-and-visible": 95,
      "served-but-display-excluded": 1,
      // 9 -> 28: the nineteen futures onboarded 2026-08-05 land here, not in
      // served-and-visible, because the directive makes visibility conditional
      // on an analyzed and acceptable match and they have no sweep evidence yet.
      // 29 -> 54: the Crypto account's other 25 were onboarded 2026-08-06 and
      // land here, analyzed and withheld, exactly as the nineteen futures did.
      // 62 -> 13: what remains is the nine contract-size variants, BRENT's
      // display exclusion's sibling rows, and the three genuinely unservable
      // markets. Nothing here is withheld "pending evidence" any more.
      "served-but-not-scannable": 13,
      // 2026-08-05: five futures moved from excluded to mapped once the
      // authoritative `commodities-list` endpoint replaced the empty
      // `commodity-list` the first sweep queried. Total stays 98 — rows
      // changed category, none were added.
      // 30 -> 26 -> 1. The four cash proxies were onboarded 2026-08-05 and the
      // 25 crypto mates on 2026-08-06, which leaves FDXM alone: the same
      // ^GDAXI series as FDAX at a different contract size, held pending the
      // owner's micro/mini ruling.
      // 0 -> 6 on 2026-08-06. The previous note here read "every matched market
      // is onboarded ... nothing occupies it today", and that was FALSE: the six
      // CME FX majors were matched to their spot mates in the crossmap and had
      // no row on this list to occupy. The status was empty because rows were
      // missing, not because the work was done.
      "mapped-not-yet-onboarded": 6,
      "excluded-no-fmp-source": 7,
      "offered-but-unsizeable": 4,
    });
  });

  it("agrees with rowsForClassification's own per-classification counts", () => {
    assert.equal(rowsForClassification("forex").length, 38);
    assert.equal(rowsForClassification("futures").length, 55);
    assert.equal(rowsForClassification("crypto").length, 33);
  });
});

describe("agreement with the live master/visible sets (no re-derivation)", () => {
  it("the registry's served set equals AVAILABLE_ASSET_SYMBOLS (the master 107) exactly", () => {
    assert.deepEqual(servedSymbols().sort(), [...AVAILABLE_ASSET_SYMBOLS].sort());
    // FDXM joined 2026-08-06 as FDAX's contract-size variant: in the symbol map because that is what earns a BROKER_INSTRUMENTS sizing row, out of every scan because it reads FDAX's own ^GDAXI series (contractVariants.ts). AVAILABLE means knowable-and-sizeable; scannableSymbolsFor decides what is scanned and sweepUniverse what is swept — three lists, three questions.
    // 58 -> 107. AVAILABLE is derived through NO_TRADE_SYMBOLS, so releasing 49
    // markets grows it by 49.
    assert.equal(servedSymbols().length, 107);
  });

  it("the registry's visible set equals visibleAssetSymbols(null) (the 97) exactly", () => {
    assert.deepEqual(visibleSymbols().sort(), [...visibleAssetSymbols(null)].sort());
    // MGCUSD left the scannable set on 2026-08-05: it is micro gold, a contract-size variant of GCUSD, and the owner ruled one analyzed market per underlying per account type (contractVariants.ts). It keeps its sizing identity and loses its scan slot.
    // 48 -> 97, the same 49 markets.
    assert.equal(visibleSymbols().length, 97);
  });

  it("every currently-served symbol appears in the registry with a served-compatible status", () => {
    for (const symbol of AVAILABLE_ASSET_SYMBOLS) {
      const found = findMasterListRow(symbol);
      assert.ok(found, `${symbol} is served today but has no registry row`);
      assert.ok(
        SERVED_COMPATIBLE_STATUSES.includes(found!.status),
        `${symbol} is served today but carries status "${found!.status}", ` +
          `not one of ${SERVED_COMPATIBLE_STATUSES.join(", ")}`,
      );
    }
  });

  it("a row is never served-and-visible without also being served and visible by the live sets", () => {
    for (const entry of MASTER_LIST_ROWS) {
      if (entry.status === "served-and-visible") {
        assert.ok(isServedToday(entry), `${entry.brokerName} claims served-and-visible but isServedToday is false`);
        assert.ok(isVisibleToday(entry), `${entry.brokerName} claims served-and-visible but isVisibleToday is false`);
      }
    }
  });

  it("no unserved row (no Levelflow symbol) is ever reported served or visible", () => {
    for (const entry of MASTER_LIST_ROWS) {
      if (entry.levelflowSymbol === null) {
        assert.equal(isServedToday(entry), false);
        assert.equal(isVisibleToday(entry), false);
      }
    }
  });
});

describe("BRENT — display-excluded yet standing in the sweep universe", () => {
  it("carries served-but-display-excluded, not excluded from the master list", () => {
    const brent = findMasterListRow("BRENT");
    assert.ok(brent);
    assert.equal(brent!.status, "served-but-display-excluded");
    assert.equal(brent!.fmpSymbol, "BZUSD");
    assert.equal(isServedToday(brent!), true);
    assert.equal(isVisibleToday(brent!), false);
  });

  it("stays inside sweepUniverse() despite being withheld from display", () => {
    assert.ok(sweepUniverse().some((entry) => entry.levelflowSymbol === "BRENT"));
  });

  it("is absent from visibleSymbols() while present in servedSymbols()", () => {
    assert.ok(servedSymbols().includes("BRENT"));
    assert.ok(!visibleSymbols().includes("BRENT"));
  });
});

describe("the six CME FX majors — mapped-not-yet-onboarded (2026-08-06)", () => {
  /**
   * E8's futures account shows thirteen CME FX contracts. 6J and 6M were
   * already recorded; these six were on no row at all, and every one prints
   * live on the F9 sighting — so their absence was a gap against the standing
   * order that every visible, tradable E8 market appears on the master list.
   *
   * The pins below are the two facts that make them unshippable rather than
   * merely unshipped: the mate is a SPOT series (FMP publishes no
   * currency-futures series for these), and two of the six quote the foreign
   * currency as base, so a spot ladder would reverse the trade direction.
   */
  const DIRECT = { "6E": "EURUSD", "6A": "AUDUSD", "6B": "GBPUSD", "6N": "NZDUSD" };
  const INVERTED = { "6C": "USDCAD", "6S": "USDCHF" };

  it("maps each to its spot mate with no Levelflow symbol of its own", () => {
    for (const [broker, mate] of Object.entries({ ...DIRECT, ...INVERTED })) {
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, broker);
      assert.equal(entry!.fmpSymbol, mate, broker);
      assert.equal(entry!.levelflowSymbol, null, broker);
      assert.equal(entry!.status, "mapped-not-yet-onboarded", broker);
      assert.equal(entry!.classification, "futures", broker);
    }
  });

  it("keeps every one out of the served and visible sets", () => {
    // A row with no Levelflow symbol cannot be served, and the scan must not
    // reach it: spot-derived levels are 17 pips from the contract on 6E and
    // outright inverted on 6C/6S.
    for (const broker of Object.keys({ ...DIRECT, ...INVERTED })) {
      const entry = findMasterListRowByBrokerName(broker)!;
      assert.equal(isServedToday(entry), false, broker);
      assert.equal(isVisibleToday(entry), false, broker);
    }
  });

  it("states the direction reversal on the two foreign-currency-base contracts", () => {
    // The ground text is the only place this hazard is written down for a
    // future onboarding, so it is pinned rather than left to prose drift.
    for (const broker of Object.keys(INVERTED)) {
      const entry = findMasterListRowByBrokerName(broker)!;
      assert.match(entry.ground, /long 6[CS] is short USD(CAD|CHF)/);
    }
    for (const broker of Object.keys(DIRECT)) {
      const entry = findMasterListRowByBrokerName(broker)!;
      assert.doesNotMatch(entry.ground, /is short USD/);
    }
  });

  it("is exactly these six rows carrying the status, no more and no fewer", () => {
    const held = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "mapped-not-yet-onboarded")
      .map((entry) => entry.brokerName)
      .sort();
    assert.deepEqual(held, ["6A", "6B", "6C", "6E", "6N", "6S"]);
  });

  it("leaves every one a reentry candidate", () => {
    // Amendment 23: a row that is real but not yet serveable stays on the
    // books and is re-examined at every sweep.
    for (const broker of Object.keys({ ...DIRECT, ...INVERTED })) {
      assert.equal(findMasterListRowByBrokerName(broker)!.reentryCandidate, true, broker);
    }
  });
});

describe("the four amendment-22 unsizeable rows — offered-but-unsizeable", () => {
  it("marks ZBUSD and ZNUSD unsizeable while they stay served and visible", () => {
    for (const symbol of ["ZBUSD", "ZNUSD"]) {
      const entry = findMasterListRow(symbol);
      assert.ok(entry, symbol);
      assert.equal(entry!.status, "offered-but-unsizeable");
      assert.equal(isServedToday(entry!), true);
      assert.equal(isVisibleToday(entry!), true);
    }
  });

  it("marks 6J and 6M unsizeable with no Levelflow symbol and an inverted FMP mate", () => {
    const sixJ = findMasterListRowByBrokerName("6J");
    const sixM = findMasterListRowByBrokerName("6M");
    assert.ok(sixJ);
    assert.ok(sixM);
    assert.equal(sixJ!.levelflowSymbol, null);
    assert.equal(sixJ!.fmpSymbol, "USDJPY");
    assert.equal(sixM!.levelflowSymbol, null);
    assert.equal(sixM!.fmpSymbol, "USDMXN");
    assert.equal(sixJ!.status, "offered-but-unsizeable");
    assert.equal(sixM!.status, "offered-but-unsizeable");
  });

  it("is exactly these four rows, no more and no fewer", () => {
    const unsizeable = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "offered-but-unsizeable")
      .map((entry) => entry.brokerName)
      .sort();
    assert.deepEqual(unsizeable, ["6J", "6M", "ZBUSD", "ZNUSD"]);
  });
});

describe("the seven futures with no usable FMP source", () => {
  // Was twelve. Five left on 2026-08-05 — FDAX, FDXM, FESX, NKD, EMD — once
  // the earlier verdict was re-tested rather than inherited: it had queried
  // `commodity-list`, which returns zero entries, instead of
  // `commodities-list`, which returns forty. Their cash-index proxies are
  // owner-accepted and live in CASH_PROXY_FUTURES_ROWS.
  //
  // These seven are settled negatives, each for its own reason:
  //   UB, TN      — FMP carries ZB/ZN/ZF/ZT/ZQ and no Ultra contract at all.
  //   FGBM/S/X    — Bobl, Schatz, Buxl: no contract, and no cash proxy.
  //   FGBL        — the one case where FMP HAS the contract (its /quote
  //                 returns "Euro Bund Futures") but serves nothing finer
  //                 than 1-hour bars. The analyzer's primary timeframe is
  //                 15-minute, so there is nothing to feed it. Excluded on
  //                 granularity, and the row's ground says so — a future
  //                 sweep that finds 15-minute bars turns this exclusion.
  //   ZW          — Chicago wheat. FMP serves only KEUSX, labeled generically
  //                 "Wheat Futures" but a Kansas City HRW contract with its
  //                 own basis. Posed to the owner as a proxy match and
  //                 declined.
  const ORPHANS = [
    "FGBL",
    "FGBM",
    "FGBS",
    "FGBX",
    "UB",
    "TN",
    "ZW",
  ];

  it("is exactly these seven broker names, no more and no fewer", () => {
    const orphans = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "excluded-no-fmp-source")
      .map((entry) => entry.brokerName)
      .sort();
    assert.deepEqual(orphans, [...ORPHANS].sort());
  });

  it("every orphan carries no FMP symbol and a non-empty ground", () => {
    for (const broker of ORPHANS) {
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, broker);
      assert.equal(entry!.fmpSymbol, null, `${broker} must carry no FMP mate`);
      assert.equal(entry!.levelflowSymbol, null);
      assert.equal(entry!.classification, "futures");
      assert.ok(entry!.ground.length > 20, `${broker}'s ground is too thin`);
    }
  });

  it("excludes every orphan from the sweep universe (nothing to sweep against)", () => {
    const sweptBrokerNames = new Set(sweepUniverse().map((entry) => entry.brokerName));
    for (const broker of ORPHANS) {
      assert.ok(!sweptBrokerNames.has(broker), `${broker} must not appear in sweepUniverse()`);
    }
  });
});

describe("the five recovered cash-proxy futures, all onboarded", () => {
  // Recovered 2026-08-05 once the authoritative `commodities-list` endpoint
  // replaced the empty `commodity-list` the first sweep queried. All five are
  // served rows now: FESX, FDAX, EMD and NKD as analyzed markets withheld
  // pending their sweep, and FDXM as FDAX's contract-size variant — same
  // ^GDAXI series, different notional (contractVariants.ts).
  const ONBOARDED: ReadonlyArray<[string, string]> = [
    ["FESX", "^STOXX50E"],
    ["EMD", "^MID"],
    ["FDAX", "^GDAXI"],
    ["NKD", "^N225"],
    ["FDXM", "^GDAXI"],
  ];

  it("maps all five to their series, with E8's root as the Levelflow symbol", () => {
    for (const [broker, fmp] of ONBOARDED) {
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, `${broker} must have a row`);
      assert.equal(entry!.fmpSymbol, fmp, `${broker} must read ${fmp}`);
      assert.equal(entry!.levelflowSymbol, broker);
      assert.equal(entry!.classification, "futures");
      assert.equal(entry!.status, "served-but-not-scannable");
    }
  });

  it("sweeps the four analyzed markets and not the size variant", () => {
    const swept = new Set(sweepUniverse().map((entry) => entry.levelflowSymbol));
    for (const broker of ["FESX", "EMD", "FDAX", "NKD"]) {
      assert.ok(swept.has(broker), `${broker} must be swept`);
    }
    assert.ok(!swept.has("FDXM"), "FDXM is FDAX's market — sweeping it twice teaches nothing");
  });

  it("lets a futures row share a series with an already-served CFD row", () => {
    // FDAX/^GDAXI and NKD/^N225 duplicate the series Levelflow's DAX and NIKKEI
    // rows read. Amendment 24 makes the futures account a distinct product with
    // its own verdict, so this duplication is required, not accidental.
    assert.equal(findMasterListRowByBrokerName("FDAX")!.fmpSymbol, "^GDAXI");
    assert.equal(findMasterListRowByBrokerName("NKD")!.fmpSymbol, "^N225");
  });
});
describe("the 26 crypto mates by symbol pair (docs/research/e8-crypto-source-resolution-2026-08-05.md §4)", () => {
  // The doc's own 26-row table, literal. BNBUSD is the one row already
  // served (its own row is generated from symbolMap.ts, not hand-authored
  // here) — looked up the same way as the other 25 to prove one lookup path
  // covers both origins.
  const CRYPTO_MATES: Record<string, string> = {
    AAVEUSD: "AAVEUSD",
    ALGOUSD: "ALGOUSD",
    ARWUSD: "ARUSD",
    ATOMUSD: "ATOMUSD",
    AVAXUSD: "AVAXUSD",
    CAKEUSD: "CAKEUSD",
    DASHUSD: "DASHUSD",
    DOGEUSD: "DOGEUSD",
    DOTUSD: "DOTUSD",
    DYDXUSD: "DYDXUSD",
    EGLDUSD: "EGLDUSD",
    ETCUSD: "ETCUSD",
    FILUSD: "FILUSD",
    GRTUSD: "GRTUSD",
    HBARUSD: "HBARUSD",
    IMXUSD: "IMXUSD",
    LINKUSD: "LINKUSD",
    NEARUSD: "NEARUSD",
    THETAUSD: "THETAUSD",
    TRUMPUSD: "OTRUMPUSD",
    TRXUSD: "TRXUSD",
    UNIUSD: "UNIUSD",
    XLMUSD: "XLMUSD",
    XMRUSD: "XMRUSD",
    XTZUSD: "XTZUSD",
    BNBUSD: "BNBUSD",
  };

  it("resolves all 26 broker tickers to their pinned FMP mate", () => {
    for (const [broker, fmp] of Object.entries(CRYPTO_MATES)) {
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, broker);
      assert.equal(entry!.fmpSymbol, fmp, `${broker} -> ${fmp}`);
    }
  });

  it("the ARWUSD trap: broker spelling and FMP spelling genuinely differ", () => {
    const entry = findMasterListRowByBrokerName("ARWUSD");
    assert.ok(entry);
    assert.equal(entry!.brokerName, "ARWUSD");
    assert.equal(entry!.fmpSymbol, "ARUSD");
    assert.notEqual(entry!.brokerName, entry!.fmpSymbol);
    assert.equal(entry!.status, "served-but-not-scannable");
  });

  it("the TRUMPUSD trap: FMP's literal TRUMPUSD ticker is NOT the match", () => {
    const entry = findMasterListRowByBrokerName("TRUMPUSD");
    assert.ok(entry);
    assert.equal(entry!.brokerName, "TRUMPUSD");
    assert.equal(entry!.fmpSymbol, "OTRUMPUSD");
    assert.notEqual(entry!.fmpSymbol, "TRUMPUSD");
    assert.equal(entry!.status, "served-but-not-scannable");
  });

  it("marks all 25 new mates mapped-not-yet-onboarded, and BNBUSD separately as served-but-not-scannable", () => {
    for (const broker of Object.keys(CRYPTO_MATES)) {
      // Every one of the 26 is ONBOARDED as of 2026-08-06 — the owner's
      // standing order requires that a market E8 trades with a confirmed FMP
      // match be analyzed, and a row with no Levelflow symbol cannot be: the
      // replay resolves by Levelflow symbol. So each now carries E8's own name
      // as its symbol and sits withheld, not unmapped. BNBUSD was already in
      // this state and is no longer the exception.
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, `${broker} must have a registry row`);
      assert.equal(
        entry!.levelflowSymbol,
        broker,
        `${broker}'s Levelflow symbol is E8's own name, never FMP's`,
      );
      assert.equal(
        entry!.status,
        "served-but-not-scannable",
        `${broker} is analyzed and withheld until a sweep proves it`,
      );
    }
    const bnb = findMasterListRow("BNBUSD");
    assert.ok(bnb);
    assert.equal(bnb!.status, "served-but-not-scannable");
    assert.equal(bnb!.levelflowSymbol, "BNBUSD");
  });

  it("keeps both name traps pointing at the right FMP series", () => {
    // The two divergences the resolution work caught, and the reason the
    // Levelflow symbol must be E8's spelling rather than FMP's: FMP lists a
    // DIFFERENT TRUMPUSD, so matching on spelling would have wired the wrong
    // asset entirely. Pinned because the failure is silent — a wrong series
    // still produces plausible setups.
    assert.equal(findMasterListRowByBrokerName("ARWUSD")!.fmpSymbol, "ARUSD");
    assert.equal(findMasterListRowByBrokerName("TRUMPUSD")!.fmpSymbol, "OTRUMPUSD");
  });
});

describe("reentry candidates — no exclusion or limitation is permanent", () => {
  it("every non-served-and-visible row is a reentry candidate", () => {
    for (const entry of MASTER_LIST_ROWS) {
      if (entry.status === "served-and-visible") {
        assert.equal(entry.reentryCandidate, false, entry.brokerName);
      } else {
        assert.equal(entry.reentryCandidate, true, entry.brokerName);
      }
    }
  });

  it("reentryList() returns exactly the 31 non-happy-path rows", () => {
    // 80 -> 31: 49 rows became served-and-visible on the standing order, and a
    // served-and-visible row is by definition not a reentry candidate.
    assert.equal(reentryList().length, 31);
    assert.ok(reentryList().every((entry: MasterListRow) => entry.reentryCandidate));
  });

  it("reentryList() is the complement of the served-and-visible rows", () => {
    const reentryNames = new Set(reentryList().map((entry) => entry.brokerName));
    for (const entry of MASTER_LIST_ROWS) {
      assert.equal(
        reentryNames.has(entry.brokerName),
        entry.status !== "served-and-visible",
        entry.brokerName,
      );
    }
  });
});

describe("lookup helpers", () => {
  it("findMasterListRow returns null for a symbol with no row", () => {
    assert.equal(findMasterListRow("NOT-A-REAL-SYMBOL"), null);
  });

  it("findMasterListRowByBrokerName returns null for a name with no row", () => {
    assert.equal(findMasterListRowByBrokerName("NOT-A-REAL-BROKER-NAME"), null);
  });

  it("every row is reachable by its own brokerName", () => {
    for (const entry of MASTER_LIST_ROWS) {
      assert.equal(findMasterListRowByBrokerName(entry.brokerName), entry);
    }
  });

  it("every row with a Levelflow symbol is reachable by that symbol", () => {
    for (const entry of MASTER_LIST_ROWS) {
      if (entry.levelflowSymbol !== null) {
        assert.equal(findMasterListRow(entry.levelflowSymbol), entry);
      }
    }
  });
});

describe("row shape — every row is a complete, honest record", () => {
  it("every row carries a non-empty ground string", () => {
    for (const entry of MASTER_LIST_ROWS) {
      assert.equal(typeof entry.ground, "string", entry.brokerName);
      assert.ok(entry.ground.length > 0, `${entry.brokerName} has an empty ground`);
    }
  });

  it("every row carries a non-empty source citation", () => {
    for (const entry of MASTER_LIST_ROWS) {
      assert.equal(typeof entry.source, "string", entry.brokerName);
      assert.ok(entry.source.length > 0, `${entry.brokerName} has an empty source`);
    }
  });

  it("fmpSymbol is null if and only if status is excluded-no-fmp-source", () => {
    for (const entry of MASTER_LIST_ROWS) {
      if (entry.fmpSymbol === null) {
        assert.equal(entry.status, "excluded-no-fmp-source", entry.brokerName);
      } else {
        assert.notEqual(entry.status, "excluded-no-fmp-source", entry.brokerName);
      }
    }
  });

  it("every row's classification is one of the three account classifications", () => {
    for (const entry of MASTER_LIST_ROWS) {
      assert.ok(["forex", "futures", "crypto"].includes(entry.classification), entry.brokerName);
    }
  });
});
