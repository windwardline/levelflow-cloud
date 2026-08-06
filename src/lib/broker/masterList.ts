import type { BrokerClassification } from "../profile";
import {
  AVAILABLE_ASSET_SYMBOLS,
  NO_TRADE_SYMBOLS,
  SECURITY_OPTIONS,
  TEMPORARILY_HIDDEN_ASSET_SYMBOLS,
  type SecurityType,
} from "../symbolMap";
import { DISPLAY_EXCLUDED_SYMBOLS } from "./offsets";
import { visibleAssetSymbols } from "./visibility";

// Amendment 23 (owner, 2026-08-05 01:14, docs/superpowers/specs/
// 2026-08-02-owner-rulings-amendments.md) plus its same-day offset-ruling
// extension. Two questions, asked in order and never collapsed: what E8
// OFFERS decides what Levelflow SHOULD generate setups for (amendment 19);
// what FMP can actually supply decides what Levelflow CAN generate a setup
// from (amendment 20). This module is the reconciled answer to both,
// per instrument, saved durably as THE master list for E8's replay sweeps —
// regardless of display state (ruling A.2) — and built to be the model for
// every future broker (ruling A.1, clause 6).
//
// Sourced from the records, not re-derived. Three research documents supply
// every row this module did not already have a home for:
//   - docs/research/e8-crypto-source-resolution-2026-08-05.md — the 26
//     crypto mates (25 new + BNBUSD's re-verification; BNBUSD's own row is
//     generated from symbolMap.ts below since it already has one).
//   - docs/research/e8-futures-account-2026-08-03.md — the futures
//     account's own FMP sweep: matches, USX-suffixed roots, micro-variants
//     sharing their parents' sources, the twelve names the futures-account sweep found with no FMP
//     source, five of which were recovered on 2026-08-05 once the
//     authoritative `commodities-list` endpoint was used.
//   - docs/research/e8-feed-verification-2026-08-02.md — F12's 6J/6M spot
//     mates (inverted), and (via symbolMap.ts's own fmpSymbol field,
//     already resolved by the earlier F-series frames) the forex/CFD side.
// Everything already resolved keeps its existing home: symbolMap.ts's
// SECURITY_OPTIONS (the broker↔FMP pairing for every already-mapped
// instrument), offsets.ts (the offset ruling's three bases and BRENT's
// display exclusion), instruments.ts (E8's published sizing data). This
// module adds no second copy of any of that — it generates the rows that
// already have a source, and hand-carries only the rows that do not exist
// anywhere else in the codebase yet (the 25 unonboarded crypto mates, the
// twelve no-FMP-source futures names, and the two backend-only unsizeable
// futures instruments 6J/6M).
//
// Ruling B — display names always follow the broker; FMP's spelling is
// backend-only. `brokerName` is the field a future render would read;
// `fmpSymbol` is not (the same discipline languageGuard.test.ts already
// enforces for `brokerSymbol`/`brokerSymbolAlt` in instruments.ts — nothing
// in src/components reads this module at all, so there is no render path to
// guard, but the field split is deliberate and load-bearing anyway: a
// future onboarding change that wires one of these rows to a Levelflow
// symbol inherits the split, not a merged name).
//
// The reentry rule (owner, 2026-08-05): every row whose status is not the
// fully-served happy path is a standing reentry candidate, re-evaluated at
// every future replay sweep. No exclusion, no sizing gap, and no
// not-yet-onboarded row is permanent — `reentryCandidate` below is that
// rule as a field the sweep can read, not a note left only in prose.
//
// Bundle surface: this module is deliberately never imported from
// src/components or any other client-bundled file — the same shape
// instruments.ts (932 lines, ~500 generated rows, zero src/ importers
// outside itself) already has in this codebase. A replay-sweep script and
// this module's own test are the only intended importers. Vite's static
// ESM analysis excludes a module nothing in the entry graph reaches, so
// this carries zero bytes into dist/assets — verified in
// tests/brokerMasterList.test.ts and by inspecting the built bundle
// directly, not assumed from the import graph alone.

/**
 * Six states. The first five sit inside Amendment 23's own union
 * (`served-and-visible` · `served-but-display-excluded` ·
 * `mapped-not-yet-onboarded` · `excluded-no-fmp-source` ·
 * `offered-but-unsizeable`); `served-but-not-scannable` is this module's one
 * addition, needed for full coverage of "every instrument E8 offers"
 * (requirement 1) without inventing a new exclusion mechanism — it names
 * exactly the nine rows symbolMap.ts's own `NO_TRADE_SYMBOLS` and
 * `TEMPORARILY_HIDDEN_ASSET_SYMBOLS` already withhold from the master 50,
 * for reasons (no measured edge; an unverified chart feed) that are neither
 * a broker↔FMP matching question nor a sizing question — a third, older,
 * already-tested axis this module did not invent and does not re-litigate.
 * Every one of the nine still carries its own specific ground below.
 */
export type MasterListStatus =
  | "served-and-visible"
  | "served-but-display-excluded"
  | "served-but-not-scannable"
  | "mapped-not-yet-onboarded"
  | "excluded-no-fmp-source"
  | "offered-but-unsizeable";

/**
 * The statuses a row in `AVAILABLE_ASSET_SYMBOLS` (the master 50) may
 * legitimately carry today. A row cannot simultaneously be part of the
 * served master list and carry `mapped-not-yet-onboarded` or
 * `excluded-no-fmp-source` — those two are definitionally rows with no
 * Levelflow symbol yet. tests/brokerMasterList.test.ts's consistency check
 * reads this list rather than hand-repeating it.
 */
export const SERVED_COMPATIBLE_STATUSES: readonly MasterListStatus[] = [
  "served-and-visible",
  "served-but-display-excluded",
  "offered-but-unsizeable",
];

/**
 * One row per E8 instrument this module resolves. Keyed for lookup by
 * `levelflowSymbol` where one exists and always by `brokerName` (never by
 * `fmpSymbol` alone — WTI/CLUSD and BRENT/BZUSD already share one FMP
 * symbol each with a Futures-classified row, the same crossmap precedent
 * offsets.ts's own header cites).
 */
export type MasterListRow = {
  /** symbolMap.ts's own symbol, or null when no Levelflow-facing row exists
   * yet (an unonboarded crypto mate, a futures orphan, or a backend-only
   * futures instrument like 6J/6M that no Levelflow symbol maps to). */
  levelflowSymbol: string | null;
  /** Which E8 account classification this instrument's offering/evidence
   * comes from (profile.ts's BrokerClassification) — not the per-account
   * VISIBILITY question amendment 13 already answers (visibility.ts), a
   * different axis this field does not restate. */
  classification: BrokerClassification;
  /** symbolMap.ts's SecurityType for an already-mapped row; null for a row
   * with no established Levelflow taxonomy entry yet. */
  securityType: SecurityType | null;
  /** Ruling B: the name a future render would show. Equal to
   * `levelflowSymbol` for every already-served row — Levelflow's own symbol
   * already IS the broker-aligned display identity users see today — and
   * E8's own observed ticker (from the cited research record) for a row
   * with no Levelflow symbol yet. */
  brokerName: string;
  /** FMP's mate, backend-only — never rendered. Null exactly when `status`
   * is `excluded-no-fmp-source` (nothing to sweep against). */
  fmpSymbol: string | null;
  status: MasterListStatus;
  /** Always populated: the short reason this row is limited, or the plain
   * statement that it is not. */
  ground: string;
  /** Amendment 23's reentry rule: true for every row whose status is not
   * `served-and-visible`. Re-evaluated at every future replay sweep — never
   * a final verdict. */
  reentryCandidate: boolean;
  /** Where this row's facts came from — a file or research-doc pointer, not
   * free narrative. */
  source: string;
};

function classificationOfType(assetType: SecurityType): BrokerClassification {
  switch (assetType) {
    case "Crypto":
      return "crypto";
    case "Futures":
      return "futures";
    default:
      return "forex";
  }
}

function row(fields: Omit<MasterListRow, "reentryCandidate">): MasterListRow {
  return { ...fields, reentryCandidate: fields.status !== "served-and-visible" };
}

// ---------------------------------------------------------------------------
// Generated from SECURITY_OPTIONS — the 59 already-mapped instruments. No
// data duplicated: symbol, classification and fmpSymbol are read straight
// from symbolMap.ts; the only new fact this section adds per row is status
// and ground, computed against the three existing withholding mechanisms
// (NO_TRADE_SYMBOLS / TEMPORARILY_HIDDEN_ASSET_SYMBOLS, DISPLAY_EXCLUDED_
// SYMBOLS, and the two amendment-22 unsizeable master-50 members).
// ---------------------------------------------------------------------------

const SERVED_GROUND =
  "none — fully served and visible, no exclusion or limitation on record.";

/**
 * The nine addendum symbols (symbolMap.ts's own NO_TRADE_SYMBOLS union
 * TEMPORARILY_HIDDEN_ASSET_SYMBOLS) and the specific, already-recorded
 * reason each one carries. Cited rather than re-derived: the calibration
 * rounds and the commit come straight from symbolMap.ts's own header
 * comment and this repo's git history.
 */
const NOT_SCANNABLE_GROUND: Record<string, string> = {
  SP: "No accepted setups across the full calibration history (round 12) — a calibration finding, not a broker or FMP fact (src/lib/symbolMap.ts's NO_TRADE_SYMBOLS).",
  NSDQ: "No accepted setups across the full calibration history (round 12) — a calibration finding, not a broker or FMP fact (src/lib/symbolMap.ts's NO_TRADE_SYMBOLS).",
  DOW: "No accepted setups across the full calibration history (round 12) — a calibration finding, not a broker or FMP fact (src/lib/symbolMap.ts's NO_TRADE_SYMBOLS).",
  NIKKEI: "No accepted setups across the full calibration history (round 12) — a calibration finding, not a broker or FMP fact (src/lib/symbolMap.ts's NO_TRADE_SYMBOLS). Levelflow's own NIKKEI row reads a cash index (^N225); the CME NKD future is a separate, unrelated row below (excluded-no-fmp-source).",
  DAX: "No accepted setups across the full calibration history (round 12) — a calibration finding, not a broker or FMP fact (src/lib/symbolMap.ts's NO_TRADE_SYMBOLS).",
  NGUSD: "Zero accepted setups across the full calibration history (round 14) — a calibration finding, not a broker or FMP fact (src/lib/symbolMap.ts's NO_TRADE_SYMBOLS).",
  HGUSD: "Zero accepted setups across the full calibration history (round 14) — a calibration finding, not a broker or FMP fact (src/lib/symbolMap.ts's NO_TRADE_SYMBOLS).",
  BNBUSD: "Mixed calibration record (train -0.030 / test +0.099) missed the provable bar (commit ad86422) — a calibration finding, not a broker or FMP fact (src/lib/symbolMap.ts's NO_TRADE_SYMBOLS). Its FMP identity is independently re-verified a third time in docs/research/e8-crypto-source-resolution-2026-08-05.md §6, feeding a separate future onboarding question this row's status does not answer.",
  ASX: "Chart feed not yet verified against the matching traded CFD — a feed-verification gap, not a broker or FMP fact (src/lib/symbolMap.ts's TEMPORARILY_HIDDEN_ASSET_SYMBOLS).",
};

const BRENT_GROUND =
  "Amendment 23's offset ruling: E8 quotes ~1.67 (~2%, ~196 bp) above this feed, past the significance bar for display. The match and the basis both stay recorded — here and in offsets.ts — for backend broker-matching and every future replay sweep (docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md, Amendment 23).";

/** The two amendment-22 master-50 members: fully served and visible, Size withheld. */
const UNSIZEABLE_MASTER_SYMBOLS = new Set(["ZBUSD", "ZNUSD"]);

const UNSIZEABLE_MASTER_GROUND =
  "E8's margin-only table has never published a tick size or a value per tick for this row. OFFERED per the 2026-08-03 F9 futures-account sighting (amendment 19); Size stays withheld per amendment 22's reliable-data bar (docs/research/e8-futures-account-2026-08-03.md).";

const SERVED_ROWS: MasterListRow[] = SECURITY_OPTIONS.map((option) => {
  const symbol = option.symbol;
  const shared = {
    levelflowSymbol: symbol,
    classification: classificationOfType(option.assetType),
    securityType: option.assetType,
    brokerName: symbol,
    fmpSymbol: option.fmpSymbol,
  } as const;

  if (NO_TRADE_SYMBOLS.has(symbol) || TEMPORARILY_HIDDEN_ASSET_SYMBOLS.has(symbol)) {
    return row({
      ...shared,
      status: "served-but-not-scannable",
      ground: NOT_SCANNABLE_GROUND[symbol],
      source: "src/lib/symbolMap.ts",
    });
  }
  if (DISPLAY_EXCLUDED_SYMBOLS.has(symbol)) {
    return row({
      ...shared,
      status: "served-but-display-excluded",
      ground: BRENT_GROUND,
      source: "src/lib/broker/offsets.ts",
    });
  }
  if (UNSIZEABLE_MASTER_SYMBOLS.has(symbol)) {
    return row({
      ...shared,
      status: "offered-but-unsizeable",
      ground: UNSIZEABLE_MASTER_GROUND,
      source:
        "src/lib/broker/instruments.ts; docs/research/e8-futures-account-2026-08-03.md",
    });
  }
  return row({
    ...shared,
    status: "served-and-visible",
    ground: SERVED_GROUND,
    source: "src/lib/symbolMap.ts",
  });
});

// ---------------------------------------------------------------------------
// New: 25 crypto mates beyond Levelflow's existing 8-symbol crypto universe
// (docs/research/e8-crypto-source-resolution-2026-08-05.md §4's 26-row
// table, minus BNBUSD, which is already generated above). Two of the 25 are
// name-spelling traps, called out individually in newCryptoGround.
// ---------------------------------------------------------------------------

const CRYPTO_SOURCE = "docs/research/e8-crypto-source-resolution-2026-08-05.md";

const NEW_CRYPTO_MATES: ReadonlyArray<readonly [broker: string, fmp: string]> = [
  ["AAVEUSD", "AAVEUSD"],
  ["ALGOUSD", "ALGOUSD"],
  ["ARWUSD", "ARUSD"],
  ["ATOMUSD", "ATOMUSD"],
  ["AVAXUSD", "AVAXUSD"],
  ["CAKEUSD", "CAKEUSD"],
  ["DASHUSD", "DASHUSD"],
  ["DOGEUSD", "DOGEUSD"],
  ["DOTUSD", "DOTUSD"],
  ["DYDXUSD", "DYDXUSD"],
  ["EGLDUSD", "EGLDUSD"],
  ["ETCUSD", "ETCUSD"],
  ["FILUSD", "FILUSD"],
  ["GRTUSD", "GRTUSD"],
  ["HBARUSD", "HBARUSD"],
  ["IMXUSD", "IMXUSD"],
  ["LINKUSD", "LINKUSD"],
  ["NEARUSD", "NEARUSD"],
  ["THETAUSD", "THETAUSD"],
  ["TRUMPUSD", "OTRUMPUSD"],
  ["TRXUSD", "TRXUSD"],
  ["UNIUSD", "UNIUSD"],
  ["XLMUSD", "XLMUSD"],
  ["XMRUSD", "XMRUSD"],
  ["XTZUSD", "XTZUSD"],
];

function newCryptoGround(broker: string, fmp: string): string {
  if (broker === "ARWUSD") {
    return `Name-matched, not ticker-matched: FMP carries no symbol literally spelled ${broker}; ${fmp} ("Arweave USD") is the confirmed candidate by name and by price against the account's own anchor window (${CRYPTO_SOURCE} §3).`;
  }
  if (broker === "TRUMPUSD") {
    return `FMP's own literally-spelled ${broker} ticker names a different, inactive 2024 coin; ${fmp} ("Trump Official USD") is the price-and-name-confirmed match against the account's own anchor window (${CRYPTO_SOURCE} §3).`;
  }
  return `Matched by name and price against FMP's 14:59 ET anchor bar (${CRYPTO_SOURCE} §4). Onboarding — a symbol-map entry, a replay sweep, and an inclusion verdict — is a separate future change set (${CRYPTO_SOURCE} §7).`;
}

const NEW_CRYPTO_ROWS: MasterListRow[] = NEW_CRYPTO_MATES.map(([broker, fmp]) =>
  row({
    levelflowSymbol: null,
    classification: "crypto",
    securityType: "Crypto",
    brokerName: broker,
    fmpSymbol: fmp,
    status: "mapped-not-yet-onboarded",
    ground: newCryptoGround(broker, fmp),
    source: CRYPTO_SOURCE,
  })
);

// ---------------------------------------------------------------------------
// New: the twelve E8-offered futures names with no FMP source at all
// (docs/research/e8-futures-account-2026-08-03.md §3's FMP sweep). Offered
// (should) without a usable FMP feed (cannot) — the should/can split's
// clean negative case: nothing here is a Levelflow symbol today, and per
// amendment 20 none can become one until a source is found.
// ---------------------------------------------------------------------------

const FUTURES_ACCOUNT_SOURCE = "docs/research/e8-futures-account-2026-08-03.md";

const NO_FMP_SOURCE_FUTURES_GROUND: Record<string, string> = {
  FGBL: `Eurex-listed rates future, live on the F9 sighting. FMP DOES carry it — /quote returns name "Euro Bund Futures" at 125.27, yearHigh 130.57, yearLow 123.72, with 1091 daily bars — so the earlier "absent from every FMP list" verdict was wrong (that sweep queried \`commodity-list\`, which returns zero entries; the real endpoint is \`commodities-list\`). Excluded on GRANULARITY instead: the finest bars FMP serves are 1-hour (164 of them) and 4-hour (307). The analyzer's primary timeframe is 15-minute and it resamples upward, so there is nothing to feed it. Re-probe the intraday endpoints at any future sweep — this exclusion turns the moment 15-minute bars appear (verified 2026-08-05).`,
  FGBM: `Eurex-listed rates future, live on the F9 sighting; absent from every FMP list checked (${FUTURES_ACCOUNT_SOURCE} §3).`,
  FGBS: `Eurex-listed rates future, live on the F9 sighting; absent from every FMP list checked (${FUTURES_ACCOUNT_SOURCE} §3).`,
  FGBX: `Eurex-listed rates future, live on the F9 sighting; absent from every FMP list checked (${FUTURES_ACCOUNT_SOURCE} §3).`,
  UB: `CME Ultra Treasury Bond future, live-priced on the F9 sighting; no Levelflow row exists and no FMP source was found in the sweep (${FUTURES_ACCOUNT_SOURCE} §2-3).`,
  TN: `CME Ultra 10-Year Treasury Note future, live-priced on the F9 sighting; no Levelflow row exists and no FMP source was found in the sweep (${FUTURES_ACCOUNT_SOURCE} §2-3).`,
  ZW: `CME Chicago wheat future — E8-canonical, confirmed OFFERED with full published sizing data (src/lib/broker/instruments.ts's E8_FUTURES_SPECS.ZW) — but only Kansas/KC wheat (FMP's KEUSX) appears on FMP, not Chicago wheat. The should/can split's clean negative case: E8 offers a fully-priced instrument FMP cannot supply (${FUTURES_ACCOUNT_SOURCE} §3). Re-confirmed 2026-08-05 against the authoritative \`commodities-list\` (40 entries): KEUSX is the only wheat FMP serves, and although FMP labels it the generic "Wheat Futures", the KE ticker is Kansas City hard red winter — a different contract with its own basis. Posed to the owner as a proxy-match judgment call under amendment 23's situational-offset protocol and DECLINED: a differently-specified contract wearing a generic label is not a match.`,
};

const NO_FMP_SOURCE_FUTURES: readonly string[] = [
  "FGBL",
  "FGBM",
  "FGBS",
  "FGBX",
  "UB",
  "TN",
  "ZW",
];

const NO_FMP_SOURCE_FUTURES_ROWS: MasterListRow[] = NO_FMP_SOURCE_FUTURES.map(
  (broker) =>
    row({
      levelflowSymbol: null,
      classification: "futures",
      securityType: "Futures",
      brokerName: broker,
      fmpSymbol: null,
      status: "excluded-no-fmp-source",
      ground: NO_FMP_SOURCE_FUTURES_GROUND[broker],
      source: FUTURES_ACCOUNT_SOURCE,
    }),
);

// ---------------------------------------------------------------------------
// Five futures contracts recovered from the no-FMP-source list on 2026-08-05.
// The earlier sweep's negative rested on a wrong endpoint name — it queried
// `commodity-list` (zero entries) rather than `commodities-list` (40) — so
// each of these was re-investigated against the authoritative lists and the
// live feed rather than inherited.
//
// None of the five futures CONTRACTS is on FMP. What exists is each one's
// underlying CASH index, with real depth. That makes them proxy matches, and
// the basis is materially different in kind from the three constant bases
// offsets.ts records: a futures-vs-cash basis is carry, so it is
// TIME-VARYING and decays to expiry. Posed to the owner as such under
// amendment 23's situational-offset protocol, with details and a suggested
// verdict per instrument, and ACCEPTED (2026-08-05).
//
// Status is `mapped-not-yet-onboarded` for all five, which is the honest
// state: the FMP identity is now recorded, and no Levelflow symbol is wired
// to any of them. FESX and EMD carry the owner's "display-excluded until
// replay proves it" condition in their grounds — there is no display state to
// exclude yet, so recording the condition on the row is what keeps it from
// being lost at onboarding time. FDAX, FDXM and NKD map onto series Levelflow
// ALREADY reads for its CFD-account index rows (DAX -> ^GDAXI, NIKKEI ->
// ^N225); the duplication is deliberate and per amendment 24 correct, because
// the futures account is a distinct product whose verdict on the same market
// is decided separately.
// ---------------------------------------------------------------------------

const CASH_PROXY_FUTURES: ReadonlyArray<{
  broker: string;
  fmp: string;
  ground: string;
}> = [
  {
    broker: "FESX",
    fmp: "^STOXX50E",
    ground:
      `Eurex Euro Stoxx 50 future, live on the F9 sighting. The contract is not on FMP; its cash index is — ^STOXX50E, 1275 daily bars through 2026-08-05, 1495 fifteen-minute bars. Proxy match on a TIME-VARYING futures-vs-cash basis (carry, decaying to expiry), never a constant like the three in offsets.ts. Owner-accepted 2026-08-05 as matched but display-excluded until a replay sweep proves it.`,
  },
  {
    broker: "EMD",
    fmp: "^MID",
    ground:
      `CME E-mini S&P MidCap 400 future — E8-canonical, confirmed OFFERED (src/lib/broker/instruments.ts's E8_FUTURES_SPECS.EMD). The contract is absent from \`commodities-list\`; the cash index is present — ^MID, 1254 daily bars through 2026-08-05, 1170 fifteen-minute bars. Same time-varying carry basis as FESX. Owner-accepted 2026-08-05 as matched but display-excluded until a replay sweep proves it.`,
  },
  {
    broker: "FDAX",
    fmp: "^GDAXI",
    ground:
      `Eurex DAX future, live on the F9 sighting. The contract is not on FMP; the cash index is — ^GDAXI, 1274 daily bars, 24447 cached fifteen-minute bars. This is the same series Levelflow's CFD-account DAX row reads; under amendment 24 the futures account is a distinct product, so the shared series carries an independently decided verdict. Owner-accepted 2026-08-05 as matched on the futures account.`,
  },
  {
    broker: "FDXM",
    fmp: "^GDAXI",
    ground:
      `Eurex mini-DAX future, the mini-sized sibling of FDAX, live on the F9 sighting. Reads the same cash index (^GDAXI) as FDAX — the contracts differ only in notional size, which is a SIZING fact instruments.ts carries, never a data-identity difference. Owner-accepted 2026-08-05 as matched on the futures account.`,
  },
  {
    broker: "NKD",
    fmp: "^N225",
    ground:
      `CME Nikkei future — E8-canonical, confirmed OFFERED (src/lib/broker/instruments.ts's E8_FUTURES_SPECS.NKD). The contract is not on FMP; the cash index is — ^N225, 1222 daily bars, 15511 cached fifteen-minute bars, the same series Levelflow's CFD-account NIKKEI row reads. Omitted from the batch first posed to the owner and raised separately as structurally identical to FDAX; approved 2026-08-05.`,
  },
];

const CASH_PROXY_FUTURES_ROWS: MasterListRow[] = CASH_PROXY_FUTURES.map(
  (entry) =>
    row({
      levelflowSymbol: null,
      classification: "futures",
      securityType: "Futures",
      brokerName: entry.broker,
      fmpSymbol: entry.fmp,
      status: "mapped-not-yet-onboarded",
      ground: entry.ground,
      source: FUTURES_ACCOUNT_SOURCE,
    }),
);

// ---------------------------------------------------------------------------
// New: 6J and 6M, offered per amendment 19 but unsizeable per amendment 22,
// with no Levelflow symbol mapped to either — the F12 spot mates, inverted
// (docs/research/e8-feed-verification-2026-08-02.md). Their basis is an
// interest-rate-carry snapshot, explicitly not a stable constant the way
// BRENT/XAGUSD/WTI's are (F12's own text) — this module records only the
// FMP identity match, never a basis number, so it cannot be misread as one.
// ---------------------------------------------------------------------------

const F12_SOURCE = "docs/research/e8-feed-verification-2026-08-02.md (F12)";

const UNSIZEABLE_BACKEND_FUTURES: ReadonlyArray<{
  broker: string;
  fmp: string;
  ground: string;
}> = [
  {
    broker: "6J",
    fmp: "USDJPY",
    ground:
      `Inverted spot mate (1/USDJPY) — no FMP currency-futures symbol exists for this CME contract (${F12_SOURCE}). E8's own tick table cannot reconcile 6J's published tick and value against its 6E/6S siblings, so Size stays withheld (amendment 22); OFFERED per the 2026-08-03 F9 futures-account sighting (amendment 19). No Levelflow symbol maps to 6J today.`,
  },
  {
    broker: "6M",
    fmp: "USDMXN",
    ground:
      `Inverted spot mate (1/USDMXN) — no FMP currency-futures symbol exists for this CME contract (${F12_SOURCE}). Carries the same tick-axis defect as 6J relative to its own siblings, so Size stays withheld (amendment 22); OFFERED per the 2026-08-03 F9 futures-account sighting (amendment 19). No Levelflow symbol maps to 6M today.`,
  },
];

const UNSIZEABLE_BACKEND_ROWS: MasterListRow[] = UNSIZEABLE_BACKEND_FUTURES.map(
  ({ broker, fmp, ground }) =>
    row({
      levelflowSymbol: null,
      classification: "futures",
      securityType: "Futures",
      brokerName: broker,
      fmpSymbol: fmp,
      status: "offered-but-unsizeable",
      ground,
      source: F12_SOURCE,
    }),
);

// ---------------------------------------------------------------------------
// The master list, and its derivations.
// ---------------------------------------------------------------------------

export const MASTER_LIST_ROWS: readonly MasterListRow[] = [
  ...SERVED_ROWS,
  ...NEW_CRYPTO_ROWS,
  ...NO_FMP_SOURCE_FUTURES_ROWS,
  ...CASH_PROXY_FUTURES_ROWS,
  ...UNSIZEABLE_BACKEND_ROWS,
];

const BY_LEVELFLOW_SYMBOL = new Map<string, MasterListRow>();
const BY_BROKER_NAME = new Map<string, MasterListRow>();
for (const entry of MASTER_LIST_ROWS) {
  if (entry.levelflowSymbol !== null) {
    BY_LEVELFLOW_SYMBOL.set(entry.levelflowSymbol, entry);
  }
  BY_BROKER_NAME.set(entry.brokerName, entry);
}

export function findMasterListRow(levelflowSymbol: string): MasterListRow | null {
  return BY_LEVELFLOW_SYMBOL.get(levelflowSymbol) ?? null;
}

export function findMasterListRowByBrokerName(
  brokerName: string,
): MasterListRow | null {
  return BY_BROKER_NAME.get(brokerName) ?? null;
}

export function rowsForClassification(
  classification: BrokerClassification,
): MasterListRow[] {
  return MASTER_LIST_ROWS.filter((entry) => entry.classification === classification);
}

/**
 * Amendment 23 ruling A.2: every E8 replay sweep runs against every mapped
 * row, regardless of display state — never a live re-derivation, never only
 * the subset currently shown to a user. "Mapped" means an FMP mate is on
 * record (`fmpSymbol !== null`); the twelve no-FMP-source rows are the only
 * ones with nothing for a sweep to fetch, so they are the only rows this
 * excludes.
 */
export function sweepUniverse(): MasterListRow[] {
  return MASTER_LIST_ROWS.filter((entry) => entry.fmpSymbol !== null);
}

/**
 * The reentry rule (owner, 2026-08-05): every row whose status is not the
 * fully-served happy path, re-evaluated at every future sweep. No exclusion,
 * sizing gap, or not-yet-onboarded row is permanent.
 */
export function reentryList(): MasterListRow[] {
  return MASTER_LIST_ROWS.filter((entry) => entry.reentryCandidate);
}

const MASTER_SYMBOLS = new Set(AVAILABLE_ASSET_SYMBOLS);
const VISIBLE_SYMBOLS = new Set(visibleAssetSymbols(null));

/** True iff this row's Levelflow symbol is in today's master 50
 * (`AVAILABLE_ASSET_SYMBOLS`) — computed live against that export, never a
 * hand-copied boolean that could drift out of sync with it. */
export function isServedToday(entry: MasterListRow): boolean {
  return entry.levelflowSymbol !== null && MASTER_SYMBOLS.has(entry.levelflowSymbol);
}

/** True iff this row's Levelflow symbol is in today's visible universe
 * (`visibleAssetSymbols(null)`, offsets.ts's display-exclusion filter
 * applied, no account-classification filter) — computed live, same
 * discipline as `isServedToday`. */
export function isVisibleToday(entry: MasterListRow): boolean {
  return entry.levelflowSymbol !== null && VISIBLE_SYMBOLS.has(entry.levelflowSymbol);
}

export function servedSymbols(): string[] {
  return MASTER_LIST_ROWS.filter(isServedToday).map(
    (entry) => entry.levelflowSymbol as string,
  );
}

export function visibleSymbols(): string[] {
  return MASTER_LIST_ROWS.filter(isVisibleToday).map(
    (entry) => entry.levelflowSymbol as string,
  );
}

export function rowCountsByClassification(): Record<BrokerClassification, number> {
  const counts: Record<BrokerClassification, number> = {
    forex: 0,
    futures: 0,
    crypto: 0,
  };
  for (const entry of MASTER_LIST_ROWS) {
    counts[entry.classification] += 1;
  }
  return counts;
}

export function rowCountsByStatus(): Record<MasterListStatus, number> {
  const counts: Record<MasterListStatus, number> = {
    "served-and-visible": 0,
    "served-but-display-excluded": 0,
    "served-but-not-scannable": 0,
    "mapped-not-yet-onboarded": 0,
    "excluded-no-fmp-source": 0,
    "offered-but-unsizeable": 0,
  };
  for (const entry of MASTER_LIST_ROWS) {
    counts[entry.status] += 1;
  }
  return counts;
}
