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
  it("carries exactly 113 rows", () => {
    assert.equal(MASTER_LIST_ROWS.length, 113);
  });

  it("splits 38 forex / 42 futures / 33 crypto", () => {
    assert.deepEqual(rowCountsByClassification(), {
      forex: 38,
      // 27 -> 42: nineteen onboarded, less the four cash proxies that moved
      // from mapped-not-yet-onboarded into the served set on the same day.
      futures: 42,
      crypto: 33,
    });
  });

  it("pins the six-way status breakdown", () => {
    assert.deepEqual(rowCountsByStatus(), {
      // MGCUSD became a contract-size variant on 2026-08-05 (owner ruling, contractVariants.ts): micro gold sizes against GCUSD and holds no scan slot, so it moved from served-and-visible to served-but-not-scannable.
      "served-and-visible": 46,
      "served-but-display-excluded": 1,
      // 9 -> 28: the nineteen futures onboarded 2026-08-05 land here, not in
      // served-and-visible, because the directive makes visibility conditional
      // on an analyzed and acceptable match and they have no sweep evidence yet.
      "served-but-not-scannable": 29,
      // 2026-08-05: five futures moved from excluded to mapped once the
      // authoritative `commodities-list` endpoint replaced the empty
      // `commodity-list` the first sweep queried. Total stays 98 — rows
      // changed category, none were added.
      // 30 -> 26: four of the five cash proxies (FESX, FDAX, EMD, NKD) were
      // onboarded the same day, leaving 25 crypto mates and FDXM.
      "mapped-not-yet-onboarded": 26,
      "excluded-no-fmp-source": 7,
      "offered-but-unsizeable": 4,
    });
  });

  it("agrees with rowsForClassification's own per-classification counts", () => {
    assert.equal(rowsForClassification("forex").length, 38);
    assert.equal(rowsForClassification("futures").length, 42);
    assert.equal(rowsForClassification("crypto").length, 33);
  });
});

describe("agreement with the live master/visible sets (no re-derivation)", () => {
  it("the registry's served set equals AVAILABLE_ASSET_SYMBOLS (the master 50) exactly", () => {
    assert.deepEqual(servedSymbols().sort(), [...AVAILABLE_ASSET_SYMBOLS].sort());
    assert.equal(servedSymbols().length, 50);
  });

  it("the registry's visible set equals visibleAssetSymbols(null) (the 48) exactly", () => {
    assert.deepEqual(visibleSymbols().sort(), [...visibleAssetSymbols(null)].sort());
    // MGCUSD left the scannable set on 2026-08-05: it is micro gold, a contract-size variant of GCUSD, and the owner ruled one analyzed market per underlying per account type (contractVariants.ts). It keeps its sizing identity and loses its scan slot.
    assert.equal(visibleSymbols().length, 48);
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

describe("the cash-index proxy futures (owner-accepted 2026-08-05)", () => {
  // Amendment 23's situational-offset protocol: each of these was posed to
  // the owner individually, with the instrument, the candidate series, its
  // depth, and a suggested verdict — then accepted. The basis here is
  // categorically different from the three constants in offsets.ts. Those are
  // stable, measured, and safe to add to a price. A futures-vs-cash basis is
  // carry: it varies and decays to expiry, which is exactly why these rows
  // record only the FMP identity and never a basis number.
  // All five were accepted. Four were onboarded into symbolMap.ts the same
  // day under the owner's represent-and-analyze directive, so they are served
  // rows now (gated no-trade until swept) and are pinned as such below.
  // FDXM alone remains unonboarded: it reads the same ^GDAXI series as FDAX
  // and differs only in contract size, which is the open micro/mini-variant
  // question the owner has not ruled on.
  const PROXIES: ReadonlyArray<[string, string]> = [
    ["FDXM", "^GDAXI"],
  ];
  const ONBOARDED: ReadonlyArray<[string, string]> = [
    ["FESX", "^STOXX50E"],
    ["EMD", "^MID"],
    ["FDAX", "^GDAXI"],
    ["NKD", "^N225"],
  ];

  it("keeps the four onboarded proxies served, mapped, and withheld", () => {
    for (const [broker, fmp] of ONBOARDED) {
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, `${broker} must have a row`);
      assert.equal(entry!.fmpSymbol, fmp, `${broker} must read ${fmp}`);
      assert.equal(entry!.levelflowSymbol, broker, "the Levelflow symbol is E8's own root");
      assert.equal(
        entry!.status,
        "served-but-not-scannable",
        `${broker} is analyzed and withheld until a sweep proves it`,
      );
    }
  });

  it("maps the unonboarded proxy to its series", () => {
    for (const [broker, fmp] of PROXIES) {
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, `${broker} must have a row`);
      assert.equal(entry!.fmpSymbol, fmp, `${broker} must read ${fmp}`);
      assert.equal(entry!.status, "mapped-not-yet-onboarded");
      assert.equal(entry!.classification, "futures");
      assert.equal(
        entry!.levelflowSymbol,
        null,
        `${broker} is mapped, not onboarded — no Levelflow symbol may exist yet`,
      );
    }
  });

  it("keeps FDAX and FDXM on one series — size is a sizing fact, not a data one", () => {
    assert.equal(findMasterListRowByBrokerName("FDAX")!.fmpSymbol, "^GDAXI");
    assert.equal(findMasterListRowByBrokerName("FDXM")!.fmpSymbol, "^GDAXI");
  });

  it("lets a futures row share a series with an already-served CFD row", () => {
    // FDAX/^GDAXI and NKD/^N225 duplicate the series Levelflow's DAX and
    // NIKKEI rows already read. Under amendment 24 the futures account is a
    // distinct product, so one market can be included on one account type and
    // excluded on another — which requires exactly this duplication. A test
    // that forbade it would forbid the amendment.
    const served = new Set(
      MASTER_LIST_ROWS
        .filter((entry) => entry.levelflowSymbol !== null && entry.fmpSymbol !== null)
        .map((entry) => entry.fmpSymbol!),
    );
    assert.ok(served.has("^GDAXI"), "the CFD DAX row should already read ^GDAXI");
    assert.ok(served.has("^N225"), "the CFD NIKKEI row should already read ^N225");
    assert.equal(findMasterListRowByBrokerName("FDAX")!.fmpSymbol, "^GDAXI");
    assert.equal(findMasterListRowByBrokerName("NKD")!.fmpSymbol, "^N225");
  });

  it("carries every proxy into the sweep universe — a match is always swept", () => {
    // Amendment 23 ruling A.2: the sweep runs against every mapped row
    // regardless of display state, and amendment 24 makes each one a standing
    // candidate both directions at every sweep.
    const swept = new Set(sweepUniverse().map((entry) => entry.brokerName));
    for (const [broker] of PROXIES) {
      assert.ok(swept.has(broker), `${broker} must appear in sweepUniverse()`);
    }
  });

  it("makes every proxy a reentry candidate — none is a settled verdict", () => {
    for (const [broker] of PROXIES) {
      assert.equal(findMasterListRowByBrokerName(broker)!.reentryCandidate, true);
    }
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
    assert.equal(entry!.status, "mapped-not-yet-onboarded");
  });

  it("the TRUMPUSD trap: FMP's literal TRUMPUSD ticker is NOT the match", () => {
    const entry = findMasterListRowByBrokerName("TRUMPUSD");
    assert.ok(entry);
    assert.equal(entry!.brokerName, "TRUMPUSD");
    assert.equal(entry!.fmpSymbol, "OTRUMPUSD");
    assert.notEqual(entry!.fmpSymbol, "TRUMPUSD");
    assert.equal(entry!.status, "mapped-not-yet-onboarded");
  });

  it("marks all 25 new mates mapped-not-yet-onboarded, and BNBUSD separately as served-but-not-scannable", () => {
    for (const broker of Object.keys(CRYPTO_MATES)) {
      if (broker === "BNBUSD") {
        continue;
      }
      const entry = findMasterListRowByBrokerName(broker);
      assert.equal(entry!.levelflowSymbol, null, `${broker} must have no Levelflow symbol yet`);
      assert.equal(entry!.status, "mapped-not-yet-onboarded");
    }
    const bnb = findMasterListRow("BNBUSD");
    assert.ok(bnb);
    assert.equal(bnb!.status, "served-but-not-scannable");
    assert.equal(bnb!.levelflowSymbol, "BNBUSD");
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

  it("reentryList() returns exactly the 67 non-happy-path rows", () => {
    assert.equal(reentryList().length, 67);
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
