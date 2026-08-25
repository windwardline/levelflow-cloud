import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AVAILABLE_ASSET_SYMBOLS } from "../src/lib/symbolMap.ts";
import { visibleAssetSymbols } from "../src/lib/broker/visibility.ts";
import {
  FUTURES_MAPPINGS,
  MARGIN_ONLY_E8_SYMBOLS,
} from "../src/lib/broker/instruments.ts";
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
      // 55 stays 55 (amendment 32): thirteen rows changed STATUS, none was
      // deleted — the register is where dormant rows live, and the reentry
      // machinery re-probes them every run.
      futures: 55,
      crypto: 33,
    });
  });

  it("pins the six-way status breakdown", () => {
    assert.deepEqual(rowCountsByStatus(), {
      // MGCUSD became a contract-size variant on 2026-08-05 (owner ruling, contractVariants.ts): micro gold sizes against GCUSD and holds no scan slot, so it moved from served-and-visible to served-but-not-scannable.
      // 100 -> 96 (amendment 32, 2026-08-09): FESX, FDAX, EMD and NKD leave
      // the served set — each was served on its underlying's CASH index
      // series, which was never a match. Their rows move to
      // excluded-no-fmp-source below; nothing is deleted.
      // 96 -> 95: BRENT dormant 2026-08-09, decided on the owner's live
      // frame — the time-varying gap that amendment 32 names.
      "served-and-visible": 92,
            // 9 -> 28: the nineteen futures onboarded 2026-08-05 land here, not in
      // served-and-visible, because the directive makes visibility conditional
      // on an analyzed and acceptable match and they have no sweep evidence yet.
      // 29 -> 54: the Crypto account's other 25 were onboarded 2026-08-06 and
      // 48 -> 100 and 62 -> 9 on 2026-08-07. The release emptied
      // NO_TRADE_SYMBOLS: a market E8 offers with an FMP match is visible and
      // usable, and the only ground for withholding is no verifiable data
      // source (owner ruling). Every market withheld on a calibration finding
      // moved from withheld to visible in one step.
      //
      // served-but-display-excluded is GONE as a status, not merely zero:
      // BRENT was its only holder and amendment 30 released it with its basis
      // line, so nothing derives the status any more.
      //
      // land here, analyzed and withheld, exactly as the nineteen futures did.
      // 9 -> 8: FDXM leaves with its parent FDAX (a variant may never
      // outlive the market it sizes against).
      "served-but-not-scannable": 8,
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
      // 6 -> 0 (amendment 32, 2026-08-09): the six CME FX majors' spot
      // "mates" were proxies, not matches — a currency future is not its
      // spot pair — so the mapped state itself was the overclaim. Emptied by
      // ruling, not by silence: all six sit in excluded-no-fmp-source with
      // their identity notes preserved in the grounds, and this key stays
      // because the status is still derivable for a genuinely matched,
      // not-yet-wired row.
      "mapped-not-yet-onboarded": 0,
      // 7 -> 20 (amendment 32, 2026-08-09): the original seven no-source
      // rows + the five index futures (EMD FDAX FDXM FESX NKD, formerly
      // served on cash series) + the eight CME currency futures (6E 6A 6B
      // 6N 6C 6S from mapped-not-yet-onboarded, 6J 6M from
      // offered-but-unsizeable). One status, one meaning: no actual FMP
      // series exists; re-probed each run.
      // 20 -> 21: BRENT joins the register — the CFD was written on a month
      // BZUSD does not serve, so the identity was never a match.
      "excluded-no-fmp-source": 21,
      // 4 -> 2: 6J and 6M reclassified — offered they remain (the F9
      // sightings stand), MATCHED they never were.
      "offered-but-unsizeable": 5,
      // Zero holders, and the key stays: the status is still derivable, so a
      // row earning it again must still be excluded on every account type that
      // would otherwise reach it (tests/brokerVisibility.test.ts asserts that
      // direction). BRENT was the only holder and amendment 30 released it.
      "served-but-display-excluded": 0,
    });
  });

  it("agrees with rowsForClassification's own per-classification counts", () => {
    assert.equal(rowsForClassification("forex").length, 38);
    assert.equal(rowsForClassification("futures").length, 55);
    assert.equal(rowsForClassification("crypto").length, 33);
  });
});

describe("agreement with the live master/visible sets (no re-derivation)", () => {
  it("the registry's served set equals AVAILABLE_ASSET_SYMBOLS (the master 111) exactly", () => {
    assert.deepEqual(servedSymbols().sort(), [...AVAILABLE_ASSET_SYMBOLS].sort());
    // 58 -> 111 on 2026-08-07: the released markets are served identities now,
    // not withheld ones. The equality is the assertion; the count is the record
    // of where it stands.
    // FDXM joined 2026-08-06 as FDAX's contract-size variant: in the symbol map because that is what earns a BROKER_INSTRUMENTS sizing row, out of every scan because it reads FDAX's own ^GDAXI series (contractVariants.ts). AVAILABLE means knowable-and-sizeable; scannableSymbolsFor decides what is scanned and sweepUniverse what is swept — three lists, three questions.
    // 111 -> 106 (amendment 32, 2026-08-09): the five index futures leave
    // the served identity — futures 31 -> 27 visible, and FDXM's sizing-only
    // slot goes with its parent. The equality above is still the assertion;
    // this count is the record of where it stands.
    // 106 -> 105: BRENT out (amendment 32, the owner's 2026-08-09 frame).
    assert.equal(servedSymbols().length, 105);
  });

  it("the registry's visible set equals visibleAssetSymbols(null) (the 102) exactly", () => {
    assert.deepEqual(visibleSymbols().sort(), [...visibleAssetSymbols(null)].sort());
    // MGCUSD left the scannable set on 2026-08-05: it is micro gold, a contract-size variant of GCUSD, and the owner ruled one analyzed market per underlying per account type (contractVariants.ts). It keeps its sizing identity and loses its scan slot.
    // 102 -> 98 (amendment 32): FESX, FDAX, EMD, NKD out of view.
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

describe("BRENT — dormant on the owner's frame (amendment 32, 2026-08-09)", () => {
  // The arc, kept because every turn was a decision: amendment 23 hid it on
  // the size of its basis; amendment 30 released it with the basis line on
  // the stability premise; the 2026-08-09 frame killed the premise — +1.10
  // against +1.61/+1.675 a week earlier, nine spreads wide, mid-month and
  // post-roll. A basis that moves half a dollar in a week is a contract-
  // month spread, and a CFD on another month is not matched to BZUSD.
  it("is a register row with no match and the evidence chain in its ground", () => {
    const brent = findMasterListRowByBrokerName("BRENT");
    assert.ok(brent);
    assert.equal(brent!.status, "excluded-no-fmp-source");
    assert.equal(brent!.fmpSymbol, null);
    assert.equal(brent!.levelflowSymbol, null);
    assert.match(brent!.ground, /\+1\.10/);
    assert.match(brent!.ground, /\+1\.61/);
    assert.equal(brent!.reentryCandidate, true);
  });

  it("leaves WTI serving — +0.10 in the same frame, inside its own spread", () => {
    const wti = findMasterListRow("WTI");
    assert.ok(wti);
    assert.equal(wti!.status, "served-and-visible");
    assert.equal(wti!.fmpSymbol, "CLUSD");
  });

  it("leaves the futures-line BZUSD row untouched — its identity is sound", () => {
    const bz = findMasterListRow("BZUSD");
    assert.ok(bz);
    assert.equal(bz!.fmpSymbol, "BZUSD");
  });
});

describe("the six CME FX majors — dormant under amendment 32 (2026-08-09)", () => {
  /**
   * These six were mapped-not-yet-onboarded to their SPOT pairs from
   * 2026-08-06. Amendment 32 ruled the mapping itself the overclaim: a
   * currency future is not its spot pair, FMP publishes no currency-futures
   * series for any of them, and a proxy identity recorded in the match field
   * reads as a match. The match field is null now; the identity work —
   * direction, scale, the 17 pips of measured carry on 6E — is preserved in
   * the grounds, because it is exactly what a real onboarding needs and
   * exactly what a match field must not claim.
   */
  const DIRECT = ["6A", "6B", "6E", "6N"];
  const INVERTED = ["6C", "6S"];

  it("carries no FMP match and no Levelflow symbol — dormant, with the identity in the ground", () => {
    for (const broker of [...DIRECT, ...INVERTED]) {
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, broker);
      assert.equal(entry!.fmpSymbol, null, broker);
      assert.equal(entry!.levelflowSymbol, null, broker);
      assert.equal(entry!.status, "excluded-no-fmp-source", broker);
      assert.equal(entry!.classification, "futures", broker);
      assert.match(entry!.ground, /Amendment 32/, broker);
    }
  });

  it("keeps every one out of the served and visible sets", () => {
    // A row with no Levelflow symbol cannot be served, and the scan must not
    // reach it: spot-derived levels are 17 pips from the contract on 6E and
    // outright inverted on 6C/6S.
    for (const broker of [...DIRECT, ...INVERTED]) {
      const entry = findMasterListRowByBrokerName(broker)!;
      assert.equal(isServedToday(entry), false, broker);
      assert.equal(isVisibleToday(entry), false, broker);
    }
  });

  it("states the direction reversal on the two foreign-currency-base contracts", () => {
    // The ground text is the only place this hazard is written down for a
    // future onboarding, so it is pinned rather than left to prose drift.
    for (const broker of INVERTED) {
      const entry = findMasterListRowByBrokerName(broker)!;
      assert.match(entry.ground, /long 6[CS] is short USD(CAD|CHF)/);
    }
    for (const broker of DIRECT) {
      const entry = findMasterListRowByBrokerName(broker)!;
      assert.doesNotMatch(entry.ground, /is short USD/);
    }
  });

  it("leaves mapped-not-yet-onboarded empty — by ruling, not by silence", () => {
    // Amendment 31 pinned this register so it could not GROW in silence; it
    // emptied the other way, by amendment 32's ruling. The key survives for
    // a genuinely matched, not-yet-wired row.
    const held = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "mapped-not-yet-onboarded")
      .map((entry) => entry.brokerName)
      .sort();
    assert.deepEqual(held, []);
  });

  it("leaves every one a reentry candidate", () => {
    // Amendment 23: a row that is real but not yet serveable stays on the
    // books and is re-examined at every sweep.
    for (const broker of [...DIRECT, ...INVERTED]) {
      assert.equal(findMasterListRowByBrokerName(broker)!.reentryCandidate, true, broker);
    }
  });
});

/** E8's margin-only roots, in Levelflow's own symbols. */
const MARGIN_ONLY_LEVELFLOW_SYMBOLS = Object.entries(FUTURES_MAPPINGS)
  .filter(([, e8Symbol]) => MARGIN_ONLY_E8_SYMBOLS.includes(e8Symbol))
  .map(([symbol]) => symbol);

describe("the amendment-22 unsizeable rows — offered-but-unsizeable", () => {
  it("marks every margin-only row unsizeable while it stays served and visible", () => {
    // DERIVED from E8's margin-only table, not listed. The literal list is
    // exactly why this drifted: the set in masterList.ts read ZBUSD and
    // ZNUSD, was correct when written, and stayed at two after ZF, ZT and GF
    // joined the table — so three rows were recorded as carrying no
    // exclusion or limitation while each carries one. A pin that restates
    // the code cannot notice the code going stale.
    for (const symbol of MARGIN_ONLY_LEVELFLOW_SYMBOLS) {
      const entry = findMasterListRow(symbol);
      assert.ok(entry, symbol);
      assert.equal(entry!.status, "offered-but-unsizeable");
      assert.equal(isServedToday(entry!), true);
      assert.equal(isVisibleToday(entry!), true);
    }
  });

  it("6J and 6M left this status with amendment 32 — offered still, matched never", () => {
    // The F9 sightings stand (offered); the inverted spot mates were
    // proxies, and a proxy in the match field is what amendment 32 ended.
    // Both now sit in excluded-no-fmp-source with the identities preserved
    // in their grounds.
    for (const broker of ["6J", "6M"]) {
      const entry = findMasterListRowByBrokerName(broker)!;
      assert.equal(entry.fmpSymbol, null, broker);
      assert.equal(entry.status, "excluded-no-fmp-source", broker);
      assert.match(entry.ground, /amendment 19/i, broker);
    }
  });

  it("is exactly the margin-only table, no more and no fewer", () => {
    const unsizeable = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "offered-but-unsizeable")
      .map((entry) => entry.brokerName)
      .sort();
    assert.deepEqual(unsizeable, [...MARGIN_ONLY_LEVELFLOW_SYMBOLS].sort());
  });
});

describe("the twenty futures with no usable FMP source", () => {
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

  // Amendment 32 (2026-08-09) grew this status from seven to twenty, in
  // three named families — one status, one meaning: no actual FMP series.
  const AMENDMENT_32_INDEX_FUTURES = ["EMD", "FDAX", "FDXM", "FESX", "NKD"];
  const AMENDMENT_32_CURRENCY_FUTURES = [
    "6A", "6B", "6C", "6E", "6J", "6M", "6N", "6S",
  ];

  it("is exactly these twenty-one broker names, in four named families", () => {
    const orphans = MASTER_LIST_ROWS
      .filter((entry) => entry.status === "excluded-no-fmp-source")
      .map((entry) => entry.brokerName)
      .sort();
    assert.deepEqual(
      orphans,
      [
        ...ORPHANS,
        ...AMENDMENT_32_INDEX_FUTURES,
        ...AMENDMENT_32_CURRENCY_FUTURES,
        "BRENT",
      ].sort(),
    );
  });

  it("every orphan carries no FMP symbol and a non-empty ground", () => {
    for (
      const broker of [
        ...ORPHANS,
        ...AMENDMENT_32_INDEX_FUTURES,
        ...AMENDMENT_32_CURRENCY_FUTURES,
      ]
    ) {
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
    for (
      const broker of [
        ...ORPHANS,
        ...AMENDMENT_32_INDEX_FUTURES,
        ...AMENDMENT_32_CURRENCY_FUTURES,
      ]
    ) {
      assert.ok(!sweptBrokerNames.has(broker), `${broker} must not appear in sweepUniverse()`);
    }
  });
});

describe("the five index futures — dormant under amendment 32 (2026-08-09)", () => {
  // Their arc, kept because each turn was a real decision: recovered from
  // the no-source list 2026-08-05 (the first sweep had queried the wrong
  // endpoint), onboarded as cash-proxy rows the same day, served 2026-08-07
  // with the release — and then amendment 32 ruled the proxy itself the
  // defect: a future written on X is not X, and the futures-vs-cash gap is
  // carry, not an offset. All five are register rows now, matches emptied,
  // grounds carrying the ruling and the re-probe path.
  const DORMANT = ["EMD", "FDAX", "FDXM", "FESX", "NKD"];

  it("carries all five dormant with no match and no Levelflow symbol", () => {
    for (const broker of DORMANT) {
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, `${broker} must keep a row — dormant, never deleted`);
      assert.equal(entry!.fmpSymbol, null, broker);
      assert.equal(entry!.levelflowSymbol, null, broker);
      assert.equal(entry!.status, "excluded-no-fmp-source", broker);
      assert.match(entry!.ground, /Amendment 32/, broker);
    }
  });

  it("sweeps none of them — there is nothing true to sweep against", () => {
    const swept = new Set(sweepUniverse().map((entry) => entry.brokerName));
    for (const broker of DORMANT) {
      assert.ok(!swept.has(broker), `${broker} must not be swept`);
    }
  });

  it("keeps the six cash index CFDs serving — cash on cash is a real match", () => {
    // The contrast that makes the rule coherent: the SAME ^GDAXI series is
    // right for the DAX cash CFD and was wrong for the FDAX future. Removing
    // the futures must not touch the CFDs.
    for (const symbol of ["ASX", "DAX", "DOW", "NIKKEI", "NSDQ", "SP"]) {
      const entry = findMasterListRow(symbol);
      assert.ok(entry, symbol);
      assert.equal(entry!.status, "served-and-visible", symbol);
    }
    assert.equal(findMasterListRow("DAX")!.fmpSymbol, "^GDAXI");
    assert.equal(findMasterListRow("NIKKEI")!.fmpSymbol, "^N225");
  });

  it("leaves every one a reentry candidate — dormant is not a verdict", () => {
    for (const broker of DORMANT) {
      assert.equal(
        findMasterListRowByBrokerName(broker)!.reentryCandidate,
        true,
        broker,
      );
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
    assert.equal(entry!.status, "served-and-visible");
  });

  it("the TRUMPUSD trap: FMP's literal TRUMPUSD ticker is NOT the match", () => {
    const entry = findMasterListRowByBrokerName("TRUMPUSD");
    assert.ok(entry);
    assert.equal(entry!.brokerName, "TRUMPUSD");
    assert.equal(entry!.fmpSymbol, "OTRUMPUSD");
    assert.notEqual(entry!.fmpSymbol, "TRUMPUSD");
    assert.equal(entry!.status, "served-and-visible");
  });

  it("serves all 26 crypto mates, BNBUSD included — every one FMP-matched", () => {
    for (const broker of Object.keys(CRYPTO_MATES)) {
      // Onboarded 2026-08-06 and WITHHELD pending a sweep; released 2026-08-07.
      // All 26 carry a measured FMP match (docs/research/
      // e8-crypto-source-resolution-2026-08-05.md, zero exclusions), and an FMP
      // match is the only test the owner's ruling admits. Each carries E8's own
      // name as its Levelflow symbol, never FMP's — which is what the two name
      // traps make load-bearing.
      const entry = findMasterListRowByBrokerName(broker);
      assert.ok(entry, `${broker} must have a registry row`);
      assert.equal(
        entry!.levelflowSymbol,
        broker,
        `${broker}'s Levelflow symbol is E8's own name, never FMP's`,
      );
      assert.equal(
        entry!.status,
        "served-and-visible",
        `${broker} is matched, so it is served`,
      );
    }
    const bnb = findMasterListRow("BNBUSD");
    assert.ok(bnb);
    assert.equal(bnb!.status, "served-and-visible");
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

  it("reentryList() returns exactly the 34 non-happy-path rows", () => {
    // 80 -> 26 on 2026-08-07. The release moved every market withheld on a
    // calibration finding into served-and-visible, so it left the reentry
    // population — which is the list working, not shrinking: a reentry
    // candidate is a row that is NOT served-and-visible, and re-entry is
    // exactly what happened to fifty-four of them at once.
    //
    // What remains is the population the owner's ruling actually describes:
    // rows with no verifiable data source, rows E8 offers that FMP does not
    // carry, and contract-size variants. Every one is still re-examined at
    // every sweep, and amendment 26's rule that no exclusion is permanent is
    // what this list mechanises.
    // 26 -> 30 (amendment 32, 2026-08-09): the four index futures that had
    // been served-and-visible rejoined the reentry population as dormant
    // register rows — the list working again, in the other direction.
    // (FDXM, 6E/6A/6B/6N/6C/6S and 6J/6M were already in it under their
    // previous non-happy states, so only the four served rows add.)
    // 30 -> 31: BRENT rejoins the reentry population as a dormant row.
    // 31 -> 34 (2026-08-25): ZFUSD, ZTUSD and GFUSX join. They were always
    // margin-only rows in E8's own table and were always unsizeable; what
    // changed is that masterList now DERIVES that set from the table instead
    // of carrying a two-member copy written when the table had two members.
    // The list working a third time, and the three rows had been recorded as
    // carrying no exclusion or limitation while each carries one.
    assert.equal(reentryList().length, 34);
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

// Amendment 31 (owner, 2026-08-07): "all matching tradable markets are live on
// Levelflow... This is where we need to stay, unless the calibration later
// determines we add matched markets to the exclusion list."
//
// Full matched coverage is the RESTING STATE, and the only path off it is a
// calibration verdict. Literal per-account counts cannot enforce that — 46 and
// 45 are both just numbers, and an edit that lowers one lowers the pin beside
// it. This does the enforcing instead: it derives the invisible set and demands
// that every member of it sit in a NAMED justified state.
describe("amendment 31 — matched coverage cannot shrink quietly", () => {
  // The only reasons a row may be invisible. Each is a category, not a market:
  //   excluded-no-fmp-source   no data at all, or a same-ticker impostor
  //                            (METUSD is Metronome, not Micro Ether)
  //   served-but-not-scannable a contract-size variant of a market already
  //                            visible under its full-size name
  //   offered-but-unsizeable   E8 offers it; no FMP series exists and the
  //                            mapping is a derivation, not a match
  //   mapped-not-yet-onboarded a real match, real remaining work — the one
  //                            state that is a TODO rather than a verdict
  const JUSTIFIED_INVISIBLE = new Set([
    "excluded-no-fmp-source",
    "served-but-not-scannable",
    "offered-but-unsizeable",
    "mapped-not-yet-onboarded",
  ]);

  it("every invisible row sits in a named justified state", () => {
    for (const row of MASTER_LIST_ROWS) {
      if (isVisibleToday(row)) continue;
      assert.ok(
        JUSTIFIED_INVISIBLE.has(row.status),
        `${row.levelflowSymbol ?? row.brokerName} is invisible with status "${row.status}", which amendment 31 does not justify`,
      );
    }
  });

  it("pins the not-yet-onboarded register so it cannot grow in silence", () => {
    // Empty since amendment 32 (2026-08-09), and empty for the right reason
    // this time: the six currency futures that occupied it were mapped to
    // spot PROXIES, not matches, and the ruling moved them to
    // excluded-no-fmp-source with the identity work preserved in their
    // grounds. The pin stays because the state is still derivable — a NEW
    // entry here means a genuinely matched market was parked instead of
    // served, and that stays a decision someone must make in a test diff.
    const pending = MASTER_LIST_ROWS
      .filter((row) => row.status === "mapped-not-yet-onboarded")
      .map((row) => row.levelflowSymbol ?? row.brokerName)
      .sort();
    assert.deepEqual(pending, []);
  });

  it("keeps every contract-size variant pointing at a market that IS visible", () => {
    // A variant is invisible for a reason that only holds while its full-size
    // sibling is served. If ESUSD ever went dark, MES would silently become a
    // market withheld for no stated reason at all — invisible, and with its
    // stated justification quietly false.
    //
    // Checked against the sibling the GROUND names, not against fmpSymbol.
    // Those are not the same thing and MGCUSD is why: FMP carries a distinct
    // series for micro gold, so MGCUSD's fmpSymbol is itself while the market
    // it duplicates is GCUSD. Keying on fmpSymbol would have asserted that
    // MGCUSD is a variant of MGCUSD, which is true of nothing.
    const visible = new Set(
      MASTER_LIST_ROWS.filter(isVisibleToday).map((row) => row.levelflowSymbol),
    );
    let checked = 0;
    for (const row of MASTER_LIST_ROWS) {
      if (row.status !== "served-but-not-scannable") continue;
      const named = /Contract-size variant of ([A-Z0-9^]+)/.exec(row.ground);
      assert.ok(
        named,
        `${row.levelflowSymbol ?? row.brokerName} is held back as not-scannable without naming what it is a variant of`,
      );
      assert.ok(
        visible.has(named![1]),
        `${row.levelflowSymbol ?? row.brokerName} is held back as a variant of ${named![1]}, which is no longer visible`,
      );
      checked += 1;
    }
    // The loop must actually run. A status rename would otherwise turn this
    // into a test that passes by checking nothing. 9 -> 8: FDXM left with
    // its parent FDAX under amendment 32 — exactly the sibling-goes-dark
    // case this test was written to catch, resolved by the variant leaving
    // WITH the market instead of outliving it.
    assert.equal(checked, 8);
  });
});
