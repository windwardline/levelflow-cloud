import type { BrokerClassification } from "../profile";
import {
  AVAILABLE_ASSET_SYMBOLS,
  NO_TRADE_SYMBOLS,
  SECURITY_OPTIONS,
  TEMPORARILY_HIDDEN_ASSET_SYMBOLS,
  type SecurityType,
} from "../symbolMap";
import { isContractSizeVariant, parentMarketOf } from "./contractVariants";
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
  // A row in the master 50 may also be withheld from the scan outright — the
  // eight no-edge/unverified markets have always been, and 2026-08-05 added
  // contract-size variants (MGCUSD) and the nineteen onboarded futures. All
  // are served: present in symbolMap, sized, swept where a distinct series
  // exists. "Served" and "scannable" were conflated here; they are two facts.
  "served-but-not-scannable",
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

/**
 * The ground for a market onboarded under the owner's 2026-08-05 directive —
 * every market E8 actually trades, with a confirmed FMP match, is represented
 * and analyzed in Levelflow — but not yet promoted to a user surface.
 *
 * The directive's own condition is why: a market is visible "so long as there
 * is an analyzed and acceptable match from FMP". These carry a confirmed match
 * and no sweep evidence, so they are analyzed and withheld. The eight older
 * not-scannable rows keep their individual grounds in NOT_SCANNABLE_GROUND;
 * this covers the batch that shares one reason, rather than repeating one
 * sentence nineteen times.
 */
const ONBOARDED_PENDING_SWEEP_GROUND =
  "Onboarded 2026-08-05 from E8's live futures-account offering with a " +
  "confirmed FMP series carrying usable daily and 15-minute depth. In the " +
  "replay universe now; withheld from every user surface until a sweep " +
  "produces an acceptable, both-splits result. Promotion is a calibration " +
  "decision, and so is continued exclusion.";

const SERVED_ROWS: MasterListRow[] = SECURITY_OPTIONS.map((option) => {
  const symbol = option.symbol;
  const shared = {
    levelflowSymbol: symbol,
    classification: classificationOfType(option.assetType),
    securityType: option.assetType,
    brokerName: symbol,
    fmpSymbol: option.fmpSymbol,
  } as const;

  // A contract-size variant is served and sized but never scannable (owner
  // ruling 2026-08-05). It reuses `served-but-not-scannable` rather than
  // earning a seventh status for one row: that status already means exactly
  // "in the symbol map, withheld from the scan", and the ground below carries
  // the reason, which is what distinguishes this from a no-edge withholding.
  if (isContractSizeVariant(symbol)) {
    return row({
      ...shared,
      status: "served-but-not-scannable",
      ground:
        `Contract-size variant of ${parentMarketOf(symbol)} — the same market at a ` +
        `different notional. Levelflow analyzes one market per underlying per ` +
        `account type, so this row keeps its E8 sizing identity (its tick value ` +
        `differs, which is the only thing about it that does) and holds no scan ` +
        `slot: two rows would count one opportunity twice in the ranked scan and ` +
        `one outcome twice in the money-positive record.`,
      source: "src/lib/broker/contractVariants.ts",
    });
  }
  if (NO_TRADE_SYMBOLS.has(symbol) || TEMPORARILY_HIDDEN_ASSET_SYMBOLS.has(symbol)) {
    return row({
      ...shared,
      status: "served-but-not-scannable",
      ground: NOT_SCANNABLE_GROUND[symbol] ?? ONBOARDED_PENDING_SWEEP_GROUND,
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
// The 25 unonboarded crypto mates lived here until 2026-08-06, when the
// owner's standing order — every market E8 trades with a confirmed FMP match
// is represented AND analyzed — put every one of them into symbolMap.ts. They
// are served rows now, generated by SERVED_ROWS above and gated no-trade
// until a sweep proves them, so the hand-carried block is gone rather than
// left standing empty (this module's own rule: a mechanism with zero entries
// is not kept). Their FMP mates, including the two name traps ARWUSD->ARUSD
// and TRUMPUSD->OTRUMPUSD, now live in symbolMap.ts's crypto table where
// every other served pairing does.

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
// Amendment 32 (owner ruling, 2026-08-07; executed 2026-08-09): the five
// index futures leave the served roster. A derivative is not its underlying —
// each was served on its underlying's CASH index series, and the gap between
// a future and its cash index is the difference between two instruments, not
// a venue offset. Amendment 31's coverage floor never applied to an unmatched
// market, so this removes nothing it protected. The six cash index CFDs stay:
// cash on cash is a real match — the same ^GDAXI is right for DAX and was
// wrong for FDAX, and that contrast is the rule. verify-fmp-matches.ts
// re-probes each run; a real futures series appearing re-admits any of them.
// ---------------------------------------------------------------------------

const AMENDMENT_32_SOURCE =
  "docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md (amendment 32)";

const AMENDMENT_32_INDEX_FUTURES: ReadonlyArray<{
  broker: string;
  cashSeries: string;
  product: string;
}> = [
  { broker: "EMD", cashSeries: "^MID", product: "E-mini S&P MidCap 400" },
  { broker: "FDAX", cashSeries: "^GDAXI", product: "DAX Futures" },
  { broker: "FDXM", cashSeries: "^GDAXI", product: "Mini-DAX Futures" },
  { broker: "FESX", cashSeries: "^STOXX50E", product: "Euro Stoxx 50 Futures" },
  { broker: "NKD", cashSeries: "^N225", product: "Nikkei 225 Futures" },
];

/**
 * BRENT, dormant 2026-08-09 — the frame the handoff said would settle it,
 * settled it. The owner's live platform frame (Energies.c, 21:44:53-21:45:00
 * ET, DEMO login mirroring the live feed): WTI.C mid 79.152 vs CLUSD's
 * exact-minute bar 79.02-79.07 — +0.10, inside E8's own 0.120 spread, a
 * real match. BRENT.C mid 85.8205 vs BZUSD's exact-minute bar ~84.72 —
 * +1.10, nine spreads wide, against +1.61/+1.675 measured twice on
 * 2026-08-02. Mid-month, post-roll: a gap that moves half a dollar in a
 * week is a contract-month basis decaying, not a venue offset — E8's
 * BRENT.C is not written on the series BZUSD serves, and amendment 30's
 * basis line cannot honestly state a number that was false within days of
 * being measured. Amendment 32's third state applies. The futures-line
 * BZUSD row is untouched; verify-fmp-matches re-probes each run.
 */
const BRENT_DORMANT_ROW: MasterListRow = row({
  levelflowSymbol: null,
  classification: "forex",
  securityType: "Energies",
  brokerName: "BRENT",
  fmpSymbol: null,
  status: "excluded-no-fmp-source",
  ground:
    "Amendment 32 (2026-08-09, decided on the owner's live frame): E8's BRENT CFD priced +1.10 above BZUSD's exact-minute bar at 21:45 ET after measuring +1.61/+1.675 on 2026-08-02 — a time-varying, contract-month-shaped gap, nine spreads wide, mid-month and post-roll. A basis that moves half a dollar in a week is not a stateable offset, and a CFD written on another month is not matched to the front-month series. WTI measured +0.10 in the same frame, inside its own spread, and stays. Re-probed each run; a BRENT-identified series matching E8's book re-admits it.",
  source:
    "Owner platform frame 2026-08-09 21:44-45 ET + FMP BZUSD/CLUSD exact-minute bars; docs/research/e8-feed-verification-2026-08-02.md F4/F6 for the 2026-08-02 measurements",
});

const AMENDMENT_32_INDEX_FUTURES_ROWS: MasterListRow[] =
  AMENDMENT_32_INDEX_FUTURES.map(({ broker, cashSeries, product }) =>
    row({
      levelflowSymbol: null,
      classification: "futures",
      securityType: "Futures",
      brokerName: broker,
      fmpSymbol: null,
      status: "excluded-no-fmp-source",
      ground:
        `Amendment 32 (2026-08-09): ${product}, served 2026-08-05..09 on ${cashSeries} — the underlying CASH index, which was never a match. A future written on X is not X; the futures-vs-cash gap is carry, time-varying and decaying to expiry, not a recordable offset. Dormant with the FMP identity emptied; the cash series remains correctly matched to its own CFD row where one exists. Re-probed each run (${AMENDMENT_32_SOURCE}).`,
      source: AMENDMENT_32_SOURCE,
    })
  );

// ---------------------------------------------------------------------------
// Futures contracts recovered from the no-FMP-source list on 2026-08-05.
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

// Of the five recovered, four (FESX, FDAX, EMD, NKD) were onboarded into
// symbolMap.ts the same day under the owner's rule that every E8-traded market
// with a confirmed FMP match must be represented and analyzed — so SERVED_ROWS
// generates them now and they are gated no-trade until a sweep proves them.
// FDXM alone stays here: it reads the same ^GDAXI series as FDAX and differs
// only in contract size, which is the open micro/mini-variant question (one row
// per contract size, or one row per underlying with size handled at the
// ladder?) the owner has not yet ruled on.
// All five recovered cash-proxy futures are onboarded now — FESX, FDAX, EMD
// and NKD on 2026-08-05, and FDXM on 2026-08-06 once the contract-size ruling
// settled what it is: FDAX's mini sibling on the identical ^GDAXI series, so a
// sizing variant rather than a market of its own (contractVariants.ts).
// SERVED_ROWS generates all five; the hand-carried block is gone rather than
// left standing empty.

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
  fmp: string | null;
  ground: string;
}> = [
  {
    broker: "6J",
    fmp: null,
    ground:
      `Amendment 32 (2026-08-09): a currency future is not its spot pair. The earlier row recorded USDJPY (inverted) as the mate; that identity is a proxy, not a match — no FMP currency-futures series exists for this CME contract (${F12_SOURCE}) — so the match field empties and the spot relationship lives here in the ground only. Still OFFERED per the 2026-08-03 F9 sighting (amendment 19), still unsizeable on E8's own unreconciled tick axis (amendment 22). Re-probed each run; a real 6J series appearing is what re-admits it.`,
  },
  {
    broker: "6M",
    fmp: null,
    ground:
      `Amendment 32 (2026-08-09): a currency future is not its spot pair. The earlier row recorded USDMXN (inverted) as the mate; the identity is a proxy, not a match (${F12_SOURCE}), so the match field empties and the spot relationship lives here only. Same tick-axis defect as 6J (amendment 22); OFFERED per the F9 sighting (amendment 19). Re-probed each run.`,
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
      // Amendment 32 (2026-08-09): reclassified from offered-but-unsizeable.
      // Offered they remain (the sightings stand); MATCHED they never were.
      status: "excluded-no-fmp-source",
      ground,
      source: F12_SOURCE,
    }),
);

// ---------------------------------------------------------------------------
// New 2026-08-06: the six remaining CME FX majors. E8's futures account shows
// thirteen CME FX contracts (crossmap §2.2); 6J and 6M are recorded above, and
// these six were on no row at all — a real gap against the standing order that
// every visible, tradable E8 market appears on this list, matched or trimmed
// with its reason.
//
// TRADABILITY is settled: the F9 sighting's own words are that "every
// Financials and Currencies row above prints live", owner-confirmed on a second
// pass through the frames (amendment 19). None is a blank-valued row.
//
// IDENTITY is settled the same way 6J and 6M were: FMP publishes no
// currency-futures series for these CME contracts, so the mate is the spot
// pair. Four are direct — E8 names them for the foreign currency but quotes
// them USD-per-unit, matching the pair. Two are inverted, and that distinction
// is the whole reason they are not simply switched on.
//
// WHY NONE IS SCANNABLE. Each one's mate is a series Levelflow already sweeps
// on the Forex account, so the (series, class) pair carries a verdict already
// and no new sweep is owed. What is missing is a price transform:
//
//   - Basis. The F9 sighting caught 6EU6 at 1.15330 against EURUSD spot
//     1.15135 — 17 pips of carry. A ladder computed on spot would hand the
//     operator an entry, a stop and two targets that are all 17 pips from the
//     contract they can actually place. TP1 sits around half an ATR out, so
//     this is a material share of the trade, not a rounding difference.
//   - Direction and scale, for 6C and 6S. E8 names these "Canadian $" and
//     "Swiss Franc" — foreign-currency-base contracts. A long 6C is a short
//     USDCAD, and 6C prices near 0.73 where USDCAD prints near 1.37. Passing
//     spot levels through unchanged would invert the trade AND misprice it.
//
// So they are recorded, matched, and withheld from the scan — the treatment
// amendment 23 already defines for a row that is real but not yet serveable,
// and they stay reentry candidates re-examined at every sweep. Onboarding them
// needs a basis-aware level transform, plus inversion and rescaling for the two
// CAD/CHF contracts. That is a build, not a flag.
//
// The FX MICROS (M6A, M6B, M6E, 7E, MCD) are deliberately absent rather than
// overlooked. Each is a contract-size variant, and contractVariants.ts's rule
// is that a variant sizes against an ANALYZED parent. These parents are not
// analyzed, so there is nothing for them to hang from; they join the list when
// their parent does.
// ---------------------------------------------------------------------------

const CROSSMAP_SOURCE = "docs/research/e8-fmp-crossmap.md (§2.2)";
const F9_SOURCE = "docs/research/e8-futures-account-2026-08-03.md";

const CME_FX_MAJORS: ReadonlyArray<{
  broker: string;
  product: string;
  fmp: string;
  inverted: boolean;
}> = [
  { broker: "6E", product: "Euro FX", fmp: "EURUSD", inverted: false },
  { broker: "6A", product: "Australian $", fmp: "AUDUSD", inverted: false },
  { broker: "6B", product: "British Pound", fmp: "GBPUSD", inverted: false },
  { broker: "6N", product: "New Zealand $", fmp: "NZDUSD", inverted: false },
  { broker: "6C", product: "Canadian $", fmp: "USDCAD", inverted: true },
  { broker: "6S", product: "Swiss Franc", fmp: "USDCHF", inverted: true },
];

const CME_FX_MAJOR_ROWS: MasterListRow[] = CME_FX_MAJORS.map(
  ({ broker, product, fmp, inverted }) =>
    row({
      levelflowSymbol: null,
      classification: "futures",
      securityType: "Futures",
      brokerName: broker,
      // Amendment 32 (2026-08-09): the spot pair was the recorded MATE; a
      // currency future is not its spot pair, so the match field empties.
      // The identity work is preserved in the ground — direction, scale and
      // the measured carry — because it is exactly what a real onboarding
      // would need; it is a description, never a match.
      fmpSymbol: null,
      status: "excluded-no-fmp-source",
      ground: inverted
        ? `Amendment 32 (2026-08-09): no FMP currency-futures series exists for this CME contract, so it is dormant — a future is not its underlying, and the earlier mapped-not-yet-onboarded state recorded ${fmp} as a mate it never was. Identity notes preserved: E8 "${product}" is a ${fmp.slice(3)}-base contract against USD-base ${fmp} — long ${broker} is short ${fmp}, quoting near 1/${fmp} (${CROSSMAP_SOURCE}). OFFERED and live-priced per the F9 sighting (amendment 19). Re-probed each run; a real series re-admits it.`
        : `Amendment 32 (2026-08-09): no FMP currency-futures series exists for this CME contract, so it is dormant — a future is not its underlying, and the earlier mapped-not-yet-onboarded state recorded ${fmp} as a mate it never was. Identity notes preserved: E8 "${product}" quotes USD-per-unit, directionally aligned with ${fmp}; the F9 sighting measured 17 pips of carry on 6E (${CROSSMAP_SOURCE}). OFFERED and live-priced per the sighting (amendment 19). Re-probed each run; a real series re-admits it.`,
      source: `${CROSSMAP_SOURCE}; ${F9_SOURCE}`,
    }),
);

// ---------------------------------------------------------------------------
// The master list, and its derivations.
// ---------------------------------------------------------------------------

export const MASTER_LIST_ROWS: readonly MasterListRow[] = [
  ...SERVED_ROWS,
  ...NO_FMP_SOURCE_FUTURES_ROWS,
  BRENT_DORMANT_ROW,
  ...AMENDMENT_32_INDEX_FUTURES_ROWS,
  ...UNSIZEABLE_BACKEND_ROWS,
  ...CME_FX_MAJOR_ROWS,
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
  return MASTER_LIST_ROWS.filter((entry) =>
    entry.fmpSymbol !== null &&
    // Amendment 23 ruling A.2 sweeps every mapped row regardless of display
    // state, and that still holds: what is filtered here is not an EXCLUDED
    // market but the SAME market at a second contract size (owner ruling
    // 2026-08-05, contractVariants.ts). Sweeping MGC alongside GC would add no
    // information — identical metal, near-identical series — while duplicating
    // gold's setups in the corpus and inflating the futures class's own
    // statistics with one market counted twice. The variant loses its sweep
    // slot for the same reason it loses its scan slot; it keeps its sizing
    // identity, which is the only thing that differs about it.
    !(entry.levelflowSymbol !== null && isContractSizeVariant(entry.levelflowSymbol))
  );
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
