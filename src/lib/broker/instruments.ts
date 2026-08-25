import {
  AVAILABLE_ASSET_SYMBOLS,
  SECURITY_OPTIONS,
  type SecurityType,
} from "../symbolMap";
import {
  CANONICAL_LIST,
  CONTRACT_SIZES,
  E8X_TRADING_SYMBOLS,
  INSTRUMENTS_ARTICLE,
  INSTRUMENT_ROSTER,
  LOT_RESTRICTIONS,
  MAX_CONTRACTS,
  PROGRAM_LINES,
  TICK_SIZES,
} from "./programs";
import type {
  BrokerInstrument,
  LeverageClass,
  ProgramFamily,
  ProgramLine,
  Provenance,
  QuoteUnit,
  Tradability,
  Valued,
} from "./types";

// Spec §19a. Every one of the 50 scannable markets gets a row on every shipped
// program line — 500 rows, generated from the crossmap's per-market tables, not
// hand-typed. The nine code-present non-scannable markets (crossmap §1.6) get
// rows too: they stay in the symbol map and the replay universe, and the governor
// must be able to answer "is this tradable on this program" for them if the
// evidence ever flips. They are never sizeable while they are no-trade or hidden,
// which is enforced here by SIZEABLE_MARKETS_BY_LINE intersecting the scannable
// roster rather than by a second copy of the no-trade list.

function valued<T>(value: T | null, source: Provenance): Valued<T> {
  return { source, value };
}

// ---------------------------------------------------------------------------
// E8 Futures — the instrument roster and its three published specs
// ---------------------------------------------------------------------------

export type E8FuturesSpec = {
  symbol: string;
  /** The second observed spelling where E8's own pages disagree (§19a rule 4). */
  altSymbol: string | null;
  product: string;
  tickSize: Valued<number>;
  valuePerTick: Valued<number>;
  marginPerContract: Valued<number>;
  /**
   * Present on E8's canonical 45-instrument list (13390461), which is
   * cross-checked against the fee table and the tick table. A margin-table-only
   * symbol is absent from all three and its tradability is unconfirmed —
   * "treat as NOT reliably tradable pending direct confirmation from E8 support."
   */
  canonical: boolean;
  tradability: Extract<Tradability, "confirmed" | "unconfirmed">;
  /**
   * Amendment 19 (owner ruling, 2026-08-05): a live-platform sighting can
   * establish tradability the same way the canonical list does. `ZB`, `ZN`,
   * `6J` and `6M` carry the F9 futures-account sighting here rather than
   * `CANONICAL_LIST`/`MAX_CONTRACTS` — the honest source of the OFFERED fact,
   * distinct from the SIZING fact `tickSize`/`valuePerTick` carry.
   */
  tradabilitySource: Provenance;
};

// [symbol, product, tickSize, valuePerTick, margin, altSymbol]
// Tick size and value per tick: 13004287, cell for cell. Margin: 10155917, cell
// for cell. A null is a row E8's own table omits — NOT PUBLISHED, recorded as
// null rather than filled from an exchange specification, which would fail the
// boundary (§20i ruling 5).
type SpecRow = [string, string, number | null, number | null, number | null, string | null];

const CANONICAL_ROWS: SpecRow[] = [
  // CME Equity Futures. EMD is absent from the margin table.
  ["EMD", "E-mini S&P MidCap 400", 0.1, 10, null, null],
  ["ES", "E-mini S&P 500", 0.25, 12.5, 10_000, null],
  ["MES", "Micro E-mini S&P", 0.25, 1.25, 1_000, null],
  ["NKD", "Nikkei", 5, 25, 10_000, null],
  ["NQ", "E-mini NASDAQ 100", 0.25, 5, 10_000, null],
  ["MNQ", "Micro E-mini NASDAQ 100", 0.25, 0.5, 1_000, null],
  ["RTY", "E-mini Russell 2000", 0.1, 5, 10_000, null],
  ["M2K", "Micro E-mini Russell 2000", 0.1, 0.5, 1_000, null],
  ["MBT", "Micro E-mini Bitcoin", 5, 0.5, 1_000, null],
  ["MET", "Micro E-mini Ether", 0.05, 0.5, 1_000, null],
  // CME Foreign Exchange Futures. 7E and MCD are absent from the margin table.
  ["6A", "Australian $", 0.0001, 10, 10_000, null],
  ["M6A", "Micro AUD/USD", 0.0001, 1, 1_000, null],
  ["6B", "British Pound", 0.0001, 6.25, 10_000, null],
  ["M6B", "Micro British Pound", 0.0001, 0.63, 1_000, null],
  ["6C", "Canadian $", 0.0001, 10, 10_000, null],
  ["6E", "Euro FX", 0.0001, 12.5, 10_000, null],
  // `7E` on the fee table, the tick table and the live symbol tool; `E7` on the
  // canonical instrument list. The canonical field takes the 2-of-3 spelling.
  ["7E", "E-mini Euro FX", 0.0001, 6.25, null, "E7"],
  ["M6E", "Micro Euro", 0.0001, 1.25, 1_000, null],
  ["MCD", "Micro CAD/USD", 0.0001, 1, null, null],
  // 0.0000001 against $12.50 — one thousand times its 6E/6S siblings' value per
  // 1.0 price unit, on the reciprocal axis. See INVERTED_FX below.
  ["6J", "Japanese Yen", 0.0000001, 12.5, 10_000, null],
  ["6S", "Swiss Franc", 0.0001, 12.5, 10_000, null],
  ["6M", "Mexican Peso", 0.00005, 5, 10_000, null],
  ["6N", "New Zealand $", 0.0001, 10, 10_000, null],
  // CME Agricultural Futures.
  ["LE", "Live Cattle", 0.025, 10, 10_000, null],
  ["HE", "Lean Hogs", 0.025, 10, 10_000, null],
  // NYMEX Futures. E8's tick table prints Natural Gas under symbol `NQ`,
  // colliding with E-mini NASDAQ 100 in the same taxonomy; the fee table and the
  // canonical list both use `NG`, so `NG` is canonical and `NQ` is the alt.
  ["CL", "Crude Oil", 0.01, 10, 10_000, null],
  ["MCL", "Micro Crude Oil", 0.01, 1, 1_000, null],
  ["QM", "E-mini Crude Oil", 0.025, 12.5, 10_000, null],
  ["NG", "Natural Gas", 0.001, 10, 10_000, "NQ"],
  ["QG", "E-mini Natural Gas", 0.005, 12.5, 10_000, null],
  ["RB", "RBOB Gasoline", 0.0001, 4.2, 10_000, null],
  ["HO", "Heating Oil", 0.0001, 4.2, 10_000, null],
  // CBOT Commodity Futures.
  ["ZC", "Corn", 0.25, 12.5, 10_000, null],
  ["ZW", "Wheat", 0.25, 12.5, 10_000, null],
  ["ZS", "Soybeans", 0.25, 12.5, 10_000, null],
  ["ZM", "Soybean Meal", 0.1, 10, 10_000, null],
  ["ZL", "Soybean Oil", 0.01, 6, 10_000, null],
  // CBOT Equity Futures.
  ["YM", "Mini-DOW", 1, 5, 10_000, null],
  ["MYM", "Micro Mini-DOW", 1, 0.5, 1_000, null],
  // COMEX Futures. SI's $2,000 is the one documented exception to the
  // $10,000-standard / $1,000-micro pattern. PA is absent from the margin table.
  ["GC", "Gold", 0.1, 10, 10_000, null],
  ["MGC", "Micro Gold", 0.1, 1, 1_000, null],
  ["SI", "Silver", 0.005, 25, 2_000, null],
  ["HG", "Copper", 0.0005, 12.5, 10_000, null],
  ["PL", "Platinum", 0.1, 10, 10_000, null],
  ["PA", "Palladium", 0.1, 10, null, null],
];

// The margin-table-only symbols Levelflow serves. Absent from the fee table,
// the tick table, the canonical 45-instrument list and the live symbol
// browser: margin published, tick size and value NOT PUBLISHED — still true,
// and still why sizing stays withheld (amendment 22). Tradability is a
// different question: every one of these printed live on the owner's F9
// futures-account watchlist sighting (amendment 19; see
// FUTURES_ACCOUNT_SIGHTINGS below), which OFFERS them the same way a
// canonical-list listing would.
//
// 1c (2026-08-09): ZT, ZF and GF joined ZB/ZN here — the old note called
// them "no Levelflow counterpart", which stopped being true when the
// nineteen onboarded on 2026-08-05 brought ZFUSD, ZTUSD and GFUSX into the
// roster; their rows then fell through the unmapped branch and rendered
// "Not offered" for contracts the same F9 frames show live. The remaining
// margin-table-only symbols (UB, TN, ZQ, MNG, MHG, blank "Micro Silver")
// still have no Levelflow counterpart and stay out of scope (§19h).
const MARGIN_ONLY_ROWS: SpecRow[] = [
  ["GF", "Feeder Cattle", null, null, 10_000, null],
  ["ZB", "30-Year Bond", null, null, 10_000, null],
  ["ZF", "5-Year Note", null, null, 10_000, null],
  ["ZN", "10-Year Note", null, null, 10_000, null],
  ["ZT", "2-Year Note", null, null, 10_000, null],
];

// Watchlist-only rows: live-priced on the same F9 frames (amendment 19 —
// offered), while E8 publishes NOTHING about them — no fee row, no tick row,
// no margin row. Every spec field is null, so sizing withholds with the
// honest word while the market stays analyzed and offered (amendment 22).
const WATCHLIST_ONLY_ROWS: SpecRow[] = [
  ["BZ", "Brent Crude Oil", null, null, null, null],
  ["XC", "Mini Corn", null, null, null, null],
  ["XK", "Mini Soybeans", null, null, null, null],
  ["ZO", "Oats", null, null, null, null],
  ["ZR", "Rough Rice", null, null, null, null],
];

/**
 * `6J` and `6M` are OFFERED (owner ruling, 2026-08-05, confirming both appear
 * with live prices on the 2026-08-03 F9 futures-account screenshots —
 * amendment 19's checkout/platform record) but stay UNSIZEABLE, because E8's
 * own tick table cannot be reconciled with itself on these two. 6E and 6S
 * publish tick 0.0001 at $12.50, so their value per 1.0 price unit is
 * $125,000; 6J publishes tick 0.0000001 at the same $12.50, which is
 * $125,000,000 — one thousand times its siblings', on the reciprocal axis. 6M
 * (0.00005/$5.00) carries the same defect at a smaller factor and has no
 * Levelflow counterpart in any class.
 *
 * An exchange contract notional would resolve both arithmetically, and it is
 * ruled out: neither E8-published nor derivable by an E8-published method, so
 * it fails the boundary (§20i ruling 5). Amendment 22 (owner ruling,
 * 2026-08-05) is now the durable, universal ground for withholding sizing
 * here: sizing requires RELIABLE — published, verified, self-consistent —
 * broker inputs, and withholds only the Size layer when that bar is not met;
 * the market itself is still analyzed and offered. `hasPublishedSizeInputs`
 * below consults this list directly so a future Levelflow-symbol mapping to
 * 6J or 6M cannot start sizing off the unreconciled numbers just because both
 * happen to be non-null. They stay unsizeable until E8 publishes a
 * reconcilable pair, and the inversion machinery waits for data rather than
 * the data being manufactured to fit the machinery.
 */
const UNRECONCILED_TICK_AXIS = ["6J", "6M"];

/**
 * The owner's live E8 Signature Futures account, Tradovate watchlists,
 * 2026-08-03, 15:08:59-15:09:49 EDT
 * (docs/research/e8-futures-account-2026-08-03.md §2). Amendment 19: the
 * checkout/platform record is the single source of truth for what E8
 * offers, so a live-priced watchlist row establishes tradability the same
 * way an E8-published list would (amendment 4's third route — "a verified
 * observation may establish tradability itself"). Amendment 22 keeps the
 * route narrow: it establishes OFFERED, nothing about SIZING — E8's own
 * tick/value tables still gate that separately (UNRECONCILED_TICK_AXIS
 * above, and the null tick/value on ZB/ZN's own MARGIN_ONLY_ROWS entry).
 */
function signatureFuturesSighting(note: string): Provenance {
  return {
    article: null,
    method: null,
    observation: {
      date: "2026-08-03",
      note,
      platform: "Tradovate",
      program: "E8 Signature Futures",
    },
    tag: "verified",
    url: null,
  };
}

/**
 * ZB, ZN, 6J and 6M all appeared with live prices on the F9 futures-account
 * screenshots (2026-08-03) — the owner ruled (2026-08-05 00:49) that all four
 * are OFFERED, none joins an exclusion. Keyed on the E8 symbol so `toSpec`
 * can attach the sighting as `tradabilitySource` regardless of whether the
 * row is canonical (6J, 6M) or margin-only (ZB, ZN) — narrow by construction:
 * this says OFFERED and nothing about SIZING.
 */
const FUTURES_ACCOUNT_SIGHTINGS: Record<string, string> = {
  "6J": "6JU6 0.0063985 live on the Currencies watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  "6M": "6MQ6 0.057600 live on the Currencies watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  BZ: "BZV6 84.05 live on the Energies watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  GF: "GFQ6 348.300 live on the Meats watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  XC: "XCU6 450'3 live on the Grains watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  XK: "XKQ6 1181'3 live on the Grains watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  ZB: "ZBU6 109'02 (109.0625) live on the Financials watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  ZF: "ZFU6 106'070 (106.21875) live on the Financials watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  ZN: "ZNU6 108'125 (108.390625) live on the Financials watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  ZO: "ZOU6 316'3 live on the Grains watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
  ZR: "ZRU6 14.205 live on the Grains watchlist, 2026-08-03 15:08:59-15:09:49 EDT (matches FMP ZRUSD within 21 bp)",
  ZT: "ZTU6 102'278 live on the Financials watchlist, 2026-08-03 15:08:59-15:09:49 EDT",
};

function toSpec(row: SpecRow, canonical: boolean): E8FuturesSpec {
  const [symbol, product, tickSize, valuePerTick, margin, altSymbol] = row;
  const sighting = FUTURES_ACCOUNT_SIGHTINGS[symbol];
  return {
    symbol,
    altSymbol,
    product,
    tickSize: valued(tickSize, TICK_SIZES),
    valuePerTick: valued(valuePerTick, TICK_SIZES),
    marginPerContract: valued(margin, MAX_CONTRACTS),
    canonical,
    tradability: canonical || sighting !== undefined ? "confirmed" : "unconfirmed",
    tradabilitySource: sighting
      ? signatureFuturesSighting(sighting)
      : canonical
      ? CANONICAL_LIST
      : MAX_CONTRACTS,
  };
}

export const E8_FUTURES_SPECS: Record<string, E8FuturesSpec> = Object.fromEntries(
  [
    ...CANONICAL_ROWS.map((row) => toSpec(row, true)),
    ...MARGIN_ONLY_ROWS.map((row) => toSpec(row, false)),
    ...WATCHLIST_ONLY_ROWS.map((row) => toSpec(row, false)),
  ].map((spec) => [spec.symbol, spec]),
);

export const CANONICAL_ROSTER_SIZE = CANONICAL_ROWS.length;

/**
 * The CME FX contracts E8 quotes foreign-currency-base against Levelflow's
 * USD-base rows. A row that maps `USDJPY → 6J` without the flag places the trade
 * backwards while passing every arithmetic check (§19a).
 *
 * All of them ship on rows E8 does not offer at all — spot FX is not on a futures
 * program — so wave 1 has zero confirmed inverted rows, and the inversion
 * transform is built and property-tested against a synthetic row (§19c step 4,
 * §19f). `6J` additionally cannot be reconciled against anything E8 publishes:
 * 6E and 6S publish tick 0.0001 at $12.50, so their value per 1.0 price unit is
 * $125,000, while 6J publishes tick 0.0000001 at the same $12.50 — $125,000,000
 * per 1.0 unit. An exchange contract notional would resolve it and is ruled out
 * by the boundary (§20i ruling 5).
 */
// SYMBOLS: external E8 inverted quotes | 3 of 28 vs forex
export const INVERTED_FX: Record<string, string> = {
  USDCAD: "6C",
  USDCHF: "6S",
  USDJPY: "6J",
};

// ---------------------------------------------------------------------------
// E8 Markets (CFD side) — the published specs, per Levelflow symbol
// ---------------------------------------------------------------------------

/** 9453396: 50 lots most symbols, 20 for XAUUSD/gold. Per row, never shared. */
const TICKET_CAP_DEFAULT = 50;
const TICKET_CAP_GOLD = 20;

type CfdMapping = {
  brokerSymbol: string | null;
  brokerSymbolAlt: string | null;
  brokerSymbolSource: Provenance | null;
  tradability: Tradability;
  tradabilitySource: Provenance;
  unit: QuoteUnit;
  maxTicketLots: number | null;
  relatedExposure: string | null;
};

function forexCfd(symbol: string): CfdMapping {
  // The slash format is the E8X dashboard's display convention, generated from
  // the pair rather than transcribed 28 times. Every one of the 28 pairs carries
  // identical terms: contract size 100,000 units. Appendix A batches 3-4 (F5)
  // put every pair's own order ticket on screen too, which is what the .C alt
  // below is sourced from -- the slash format's article never printed it.
  const display = `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  return {
    brokerSymbol: display,
    brokerSymbolAlt: ticketAlt(symbol),
    brokerSymbolSource: E8X_TRADING_SYMBOLS,
    tradability: "confirmed",
    tradabilitySource: E8X_TRADING_SYMBOLS,
    unit: {
      kind: "forex_contract",
      contractSize: valued(100_000, E8X_TRADING_SYMBOLS),
    },
    maxTicketLots: TICKET_CAP_DEFAULT,
    relatedExposure: null,
  };
}

function indexCfd(
  levelflowSymbol: string,
  brokerSymbol: string,
  pointsPerLot: number,
): CfdMapping {
  return {
    brokerSymbol,
    brokerSymbolAlt: ticketAlt(levelflowSymbol),
    brokerSymbolSource: CONTRACT_SIZES,
    tradability: "confirmed",
    tradabilitySource: CONTRACT_SIZES,
    unit: { kind: "index_points", pointsPerLot: valued(pointsPerLot, CONTRACT_SIZES) },
    maxTicketLots: TICKET_CAP_DEFAULT,
    relatedExposure: null,
  };
}

const nullContractSize = (source: Provenance): QuoteUnit => ({
  kind: "forex_contract",
  contractSize: valued<number>(null, source),
});

// ---------------------------------------------------------------------------
// Appendix A — the owner's 46 live-platform observations, E8 Pro Forex on
// TradeLocker, 2026-08-02 (docs/research/e8-observations-2026-08-02.md,
// batches 1-4; F6/F7 in docs/research/e8-feed-verification-2026-08-02.md
// corroborate the energies and metals order tickets to the cent). Amendment
// 12 makes the evidence classification-wide: every E8 account of the FOREX
// classification -- `one`, `pro_forex`, `signature_forex`, `zero` -- and no
// other. The Crypto and Futures classifications wait for their own accounts
// (amendment 15's sequence; the 2026-08-03 Crypto and Futures account
// records are those accounts' own evidence, not a source for these rows).
// ---------------------------------------------------------------------------

/**
 * The owner's live-platform tickets, E8 Pro Forex on TradeLocker, 2026-08-02:
 * 46 instruments across four batches, every value read from the platform's own
 * order ticket at 1.00 lot (docs/research/e8-observations-2026-08-02.md).
 * Amendment 12 makes the evidence classification-wide: it applies to every E8
 * account of the FOREX classification, and to no other.
 */
export function proForexTicket(note: string): Provenance {
  return {
    article: null,
    method: null,
    observation: {
      date: "2026-08-02",
      note,
      platform: "TradeLocker",
      program: "E8 Pro Forex",
    },
    tag: "verified",
    url: null,
  };
}

/**
 * Every order ticket on the account names its instrument `{E8 name}.C` --
 * indices and energies under a short root, everything else under its own
 * Levelflow symbol -- and every one of the 46 observed tickets carries it
 * (docs/research/e8-observations-2026-08-02.md, "The in-platform ticker
 * format"). Recorded uniformly because it was observed uniformly.
 */
function ticketAlt(levelflowSymbol: string): string {
  return `${levelflowSymbol}.C`;
}

// Appendix A item 4's queue, closed in one session: every crypto symbol,
// silver on the Markets side, and the whole energies class. Each note is the
// promoted row's own ticket arithmetic (Amendment 4: narrow by construction,
// nothing borrowed from a sibling instrument's ticket).
// SYMBOLS: external E8 checkout observations | 10 of 98 vs known
const FOREX_CONTRACT_OBSERVATIONS: Record<string, { contractSize: number; note: string }> = {
  XAGUSD: {
    contractSize: 5_000,
    note: "tick 0.001 = $5/lot -> contract 5,000 oz; margin 58.419 x 5,000 / 15 (batch 2)",
  },
  WTI: {
    contractSize: 1_000,
    note: "tick 0.001 = $1/lot -> contract 1,000 bbl; margin 80.984 x 1,000 / 15 = $5,398.39 (batch 1), corroborated at entry 80.223 = $5,347.67 (F6)",
  },
  BRENT: {
    contractSize: 1_000,
    note: "tick 0.001 = $1/lot -> contract 1,000 bbl; margin 85.885 x 1,000 / 15 = $5,725.09 (batch 2), corroborated at entry 85.345 = $5,689.10 (F6) -- the E8 route the crossmap's no-route verdict missed",
  },
  BTCUSD: {
    contractSize: 2,
    note: "tick 0.01 = $0.02/lot -> contract 2; margin 63,432.98 x 2 = $126,865.96, full notional (1:1) against E8's published 1:5 (batch 2)",
  },
  ETHUSD: {
    contractSize: 20,
    note: "$0.20/tick -> contract 20; margin on the 1,876.89 sell ticket = $37,537.80, full notional (1:1) against E8's published 1:5 (batch 2)",
  },
  BCHUSD: {
    contractSize: 200,
    note: "$2/tick -> contract 200; margin 212.95 x 200 = $42,590.00, full notional (1:1) against E8's published 1:2 (batch 2)",
  },
  BNBUSD: {
    contractSize: 200,
    note: "$2/tick -> contract 200; margin 587.47 x 200 = $117,494.00, full notional (1:1) against E8's published 1:2 (batch 2); a non-scannable roster row",
  },
  LTCUSD: {
    contractSize: 500,
    note: "$5/tick -> contract 500; margin 44.78 x 500 = $22,390.00, full notional (1:1) against E8's published 1:2 (batch 2)",
  },
  SOLUSD: {
    contractSize: 500,
    note: "tick 0.01 = $5/lot (a 200-tick stop prices at $1,000) -> contract 500; margin 73.69 x 500 = $36,845.00, full notional (1:1) against E8's published 1:2 (batch 1)",
  },
  XRPUSD: {
    contractSize: 100_000,
    note: "tick 0.00001 = $1/lot -> contract 100,000; margin on the 1.08404 sell ticket = $108,404.00, full notional (1:1) against E8's published 1:2 (batch 2)",
  },
  ADAUSD: {
    contractSize: 100_000,
    note: "tick 0.00001 = $1/lot -> contract 100,000; margin 0.18976 x 100,000 = $18,976.00, full notional (1:1) against E8's published 1:2 (batch 2)",
  },
};

// batch 2's per-lot index values. Half of six are foreign-currency
// denominated: the stored value is the ticket's own local-currency multiplier
// (yen, euro, or Australian-dollar per point), not yet bridged to USD --
// sizing.ts's index_points arm reads pointsPerLot as a flat dollar figure the
// way DOW/NSDQ/SP already publish theirs, and these three stay outside wave
// 1's scannable roster (they are among the nine addendum markets) so nothing
// sizes against the unbridged figure today.
// SYMBOLS: external E8 checkout observations | 3 of 6 vs indices
const INDEX_POINT_OBSERVATIONS: Record<string, { note: string; pointsPerLot: number }> = {
  NIKKEI: {
    pointsPerLot: 500,
    note: "100 ticks = $3.17 at USDJPY (0.00634) -> Y500/point (batch 2, blocked by closed-market validation; the ticket's own arithmetic still prices it)",
  },
  DAX: {
    pointsPerLot: 5,
    note: "100 ticks = $5.77 at EURUSD 1.1544 -> EUR5/point (batch 2, blocked by closed-market validation; the ticket's own arithmetic still prices it)",
  },
  ASX: {
    pointsPerLot: 20,
    note: "100 ticks = $14.08 at AUDUSD (~0.704) -> AUD20/point (batch 2, blocked by closed-market validation; the ticket's own arithmetic still prices it)",
  },
};

/** A promoted forex_contract row: Appendix A's ticket is every source it needs. */
function promotedContractCfd(symbol: string): CfdMapping {
  const { contractSize, note } = FOREX_CONTRACT_OBSERVATIONS[symbol];
  const source = proForexTicket(note);
  return {
    brokerSymbol: null,
    brokerSymbolAlt: ticketAlt(symbol),
    brokerSymbolSource: source,
    tradability: "confirmed",
    tradabilitySource: source,
    unit: { kind: "forex_contract", contractSize: valued(contractSize, source) },
    maxTicketLots: TICKET_CAP_DEFAULT,
    relatedExposure: null,
  };
}

/** A promoted index_points row: same shape, the ticket's per-point multiplier. */
function promotedIndexCfd(symbol: string): CfdMapping {
  const { pointsPerLot, note } = INDEX_POINT_OBSERVATIONS[symbol];
  const source = proForexTicket(note);
  return {
    brokerSymbol: null,
    brokerSymbolAlt: ticketAlt(symbol),
    brokerSymbolSource: source,
    tradability: "confirmed",
    tradabilitySource: source,
    unit: { kind: "index_points", pointsPerLot: valued(pointsPerLot, source) },
    maxTicketLots: TICKET_CAP_DEFAULT,
    relatedExposure: null,
  };
}

// SYMBOLS: external E8 CFD book | 9 of 98 vs known
const CFD_MAPPINGS: Record<string, CfdMapping> = {
  // Metals. Gold is the only metal with a published spec: contract size 100 oz
  // per 1.0 lot, and a ticket cap of 20 lots rather than 50 — a shared
  // max-ticket value would over-permit gold by 2.5x.
  XAUUSD: {
    brokerSymbol: "XAUUSD",
    brokerSymbolAlt: ticketAlt("XAUUSD"),
    brokerSymbolSource: CONTRACT_SIZES,
    tradability: "confirmed",
    tradabilitySource: CONTRACT_SIZES,
    unit: { kind: "forex_contract", contractSize: valued(100, CONTRACT_SIZES) },
    maxTicketLots: TICKET_CAP_GOLD,
    relatedExposure: null,
  },
  // "Metals" is a confirmed class but the contract-size article renders only
  // four rows and silver was not among them -- E8's silence about silver was a
  // documentation gap, not a refusal, and Appendix A batch 2 closed it: the
  // owner's own order ticket prices silver at 5,000 oz per lot.
  XAGUSD: promotedContractCfd("XAGUSD"),

  // Energies. E8 confirms the class and publishes no symbol list, no contract
  // size and no energies-specific leverage figure anywhere accessible --
  // Appendix A batches 1-2 (corroborated by F6) close both rows directly.
  WTI: promotedContractCfd("WTI"),
  BRENT: promotedContractCfd("BRENT"),

  // Indices. Three rows are published (9453488); the rest were named only in
  // secondary sources and in the primary article's CATEGORY list, so their
  // symbols never reached `confirmed` on a published tag alone (§19a rule 1).
  // Appendix A batch 2 observed all six directly, three of them (NIKKEI, DAX,
  // ASX) at a foreign-currency per-point multiplier the ticket itself showed.
  SP: indexCfd("SP", "SP500", 20),
  NSDQ: indexCfd("NSDQ", "NAS100", 5),
  DOW: indexCfd("DOW", "US30", 5),
  NIKKEI: promotedIndexCfd("NIKKEI"),
  DAX: promotedIndexCfd("DAX"),
  ASX: promotedIndexCfd("ASX"),
};

/**
 * The same-exposure CFD for a Levelflow futures row, at a different contract
 * size and a different P&L per point. Recorded, never substituted (§19a).
 * `BZUSD` joins by direct observation (Appendix A batch 2, corroborated by
 * F6): BRENT is where E8 actually carries this exposure, correcting the
 * crossmap's "no E8 route on any program" verdict for the pair.
 */
// SYMBOLS: external E8 CFD exposure groups | 6 of 98 vs known
const CFD_RELATED_EXPOSURE: Record<string, string> = {
  ESUSD: "SP500",
  NQUSD: "NAS100",
  YMUSD: "US30",
  GCUSD: "XAUUSD",
  MGCUSD: "XAUUSD",
  // BZUSD -> BRENT related-exposure link removed 2026-08-09: BRENT is
  // dormant (amendment 32) and a link to a market with no row is stale.
};

/** The E8 futures instrument that reaches a spot row's exposure (crossmap §2.2). */
// SYMBOLS: external E8 futures exposure groups | 16 of 98 vs known
const FUTURES_RELATED_EXPOSURE: Record<string, string> = {
  AUDUSD: "6A",
  EURUSD: "6E",
  GBPUSD: "6B",
  NZDUSD: "6N",
  USDCAD: "6C",
  USDCHF: "6S",
  USDJPY: "6J",
  XAUUSD: "GC",
  XAGUSD: "SI",
  WTI: "CL",
  BTCUSD: "MBT",
  ETHUSD: "MET",
  SP: "ES",
  NSDQ: "NQ",
  DOW: "YM",
  NIKKEI: "NKD",
};

/**
 * Levelflow's Futures rows to E8's futures instruments.
 *
 * 1c (2026-08-09): this held 12 entries against 40 Futures-classified
 * symbols, so 28 markets E8 demonstrably trades fell into the unmapped
 * branch below and rendered "Not offered" — a firm claim verified only for
 * BZUSD. Every symbol E8's own tables or the F9 watchlist sighting cover is
 * now mapped; what remains unmapped must sit in FUTURES_ABSENCE_REGISTER
 * with a stated ground, or row generation throws.
 */
// SYMBOLS: external E8 futures book | 28 of 98 vs known
export const FUTURES_MAPPINGS: Record<string, string> = {
  BZUSD: "BZ",
  CLUSD: "CL",
  ESUSD: "ES",
  GCUSD: "GC",
  GFUSX: "GF",
  HEUSX: "HE",
  HGUSD: "HG",
  HOUSD: "HO",
  LEUSX: "LE",
  MES: "MES",
  MGCUSD: "MGC",
  MNQ: "MNQ",
  MYM: "MYM",
  NGUSD: "NG",
  NQUSD: "NQ",
  PAUSD: "PA",
  PLUSD: "PL",
  QG: "QG",
  QM: "QM",
  RBUSD: "RB",
  XC: "XC",
  XK: "XK",
  RTYUSD: "RTY",
  SIUSD: "SI",
  YMUSD: "YM",
  ZBUSD: "ZB",
  ZCUSX: "ZC",
  ZFUSD: "ZF",
  ZLUSX: "ZL",
  ZMUSD: "ZM",
  ZNUSD: "ZN",
  ZOUSX: "ZO",
  ZRUSD: "ZR",
  ZSUSX: "ZS",
  ZTUSD: "ZT",
};

/** GCUSD and MGCUSD are one exposure through two instruments on one line. */
// SYMBOLS: external E8 sibling contracts | 2 of 98 vs known
const FUTURES_SIBLING: Record<string, string> = {
  GCUSD: "MGC",
  MGCUSD: "GC",
};

/**
 * Every Futures-classified symbol with no E8 mapping, and the ground. An
 * entry here is a decision someone made; a symbol in neither this register
 * nor FUTURES_MAPPINGS throws at row generation, so the next unaccounted
 * instrument is a build failure rather than a silent "Not offered".
 */
// 2026-08-09, twice: the five amendment-32 index futures left this register
// with their SECURITY_OPTIONS rows (no row generated, nothing to ground), and
// BZUSD left it the other way — the owner's simple-rules directive applied
// amendment 19 to the F9 Energies sighting (BZV6 84.05 live), which beats the
// older three-listing cross-check the not_offered rested on. BZ now sits in
// WATCHLIST_ONLY_ROWS below: OFFERED, unsizeable (amendment 22), the ZB/ZN
// pattern exactly.
const FUTURES_ABSENCE_REGISTER: Record<
  string,
  { ground: string; source: Provenance; tradability: Tradability }
> = {
};

// ---------------------------------------------------------------------------
// Row generation
// ---------------------------------------------------------------------------

const ASSET_TYPE_BY_SYMBOL: Record<string, SecurityType> = Object.fromEntries(
  SECURITY_OPTIONS.map((option) => [option.symbol, option.assetType]),
);

export const ALL_MAPPED_SYMBOLS: string[] = SECURITY_OPTIONS.map(
  (option) => option.symbol,
);

/**
 * A futures program carries CME futures on Tradovate and nothing else, so every
 * spot and cash-index row is not tradable on it. This is the one claim E8's own
 * cross-checked roster supports, which is why `not_offered` is used here and
 * nowhere the evidence is silence (§19e).
 */
function futuresLineRow(symbol: string, assetType: SecurityType): Omit<
  BrokerInstrument,
  "broker" | "programLine" | "levelflowSymbol"
> {
  const inverted = symbol in INVERTED_FX;
  const notOffered = {
    tradability: "not_offered" as Tradability,
    tradabilitySource: INSTRUMENT_ROSTER,
    brokerSymbol: null,
    brokerSymbolAlt: null,
    brokerSymbolSource: null,
    unit: {
      kind: "futures_tick" as const,
      tickSize: valued<number>(null, INSTRUMENT_ROSTER),
      valuePerTick: valued<number>(null, INSTRUMENT_ROSTER),
    },
    inverted,
    // A reciprocal axis has no static scale factor, and E8 publishes no
    // reconcilable pair for the inverted contracts (§19a's 6J reasoning).
    priceScaleFactor: valued<number>(inverted ? null : 1, INSTRUMENT_ROSTER),
    marginPerContract: valued<number>(null, MAX_CONTRACTS),
    maxTicketLots: valued<number>(null, LOT_RESTRICTIONS),
    relatedExposure: FUTURES_RELATED_EXPOSURE[symbol] ?? null,
  };

  if (assetType !== "Futures") {
    return notOffered;
  }

  const e8Symbol = FUTURES_MAPPINGS[symbol];
  if (!e8Symbol) {
    // 1c: an unmapped Futures row must name its ground or fail the build.
    // The old branch returned a firm "Not offered" with a BZUSD-specific
    // comment for EVERY unmapped symbol — 28 markets E8 demonstrably trades
    // wore a claim verified only for Brent. The throw is the point: a
    // Futures-classified symbol nobody has looked at is exactly what this
    // register exists to make impossible (the e8RosterConformance idiom).
    const absence = FUTURES_ABSENCE_REGISTER[symbol];
    if (!absence) {
      throw new Error(
        `${symbol}: Futures-classified with no E8 mapping and no registered ground`,
      );
    }
    return {
      ...notOffered,
      tradability: absence.tradability,
      tradabilitySource: absence.source,
    };
  }

  const spec = E8_FUTURES_SPECS[e8Symbol];
  return {
    tradability: spec.tradability,
    tradabilitySource: spec.tradabilitySource,
    brokerSymbol: spec.symbol,
    brokerSymbolAlt: spec.altSymbol,
    brokerSymbolSource: spec.altSymbol ? INSTRUMENT_ROSTER : CANONICAL_LIST,
    unit: {
      kind: "futures_tick",
      tickSize: spec.tickSize,
      valuePerTick: spec.valuePerTick,
    },
    inverted: false,
    // Levelflow's own tick grid reconciles exactly with E8's published tick size
    // for every mapped row (crossmap §1.7), which is what establishes that the
    // two price axes are the same axis. Derived from the comparison, not printed
    // by E8 as a scale factor.
    priceScaleFactor: {
      value: spec.tickSize.value === null ? null : 1,
      source: {
        article: null,
        tag: "derived",
        method: "13004287",
        url: TICK_SIZES.url,
        observation: null,
      },
    },
    marginPerContract: spec.marginPerContract,
    maxTicketLots: valued<number>(null, LOT_RESTRICTIONS),
    relatedExposure: FUTURES_SIBLING[symbol] ?? null,
  };
}

function cfdLineRow(
  symbol: string,
  assetType: SecurityType,
  family: Extract<ProgramFamily, "cfd_forex" | "cfd_crypto">,
): Omit<BrokerInstrument, "broker" | "programLine" | "levelflowSymbol"> {
  const cryptoOnly = family === "cfd_crypto";
  const isCrypto = assetType === "Crypto";

  const base = {
    inverted: false,
    priceScaleFactor: valued<number>(1, CONTRACT_SIZES),
    marginPerContract: valued<number>(null, MAX_CONTRACTS),
  };

  if (assetType === "Futures") {
    // The futures roster lives exclusively on the futures program lines, and E8
    // publishes that scope. Five of the eleven rows have a same-exposure CFD at a
    // different contract size — recorded, never substituted.
    return {
      ...base,
      tradability: "not_offered",
      tradabilitySource: INSTRUMENTS_ARTICLE,
      brokerSymbol: null,
      brokerSymbolAlt: null,
      brokerSymbolSource: null,
      unit: nullContractSize(INSTRUMENTS_ARTICLE),
      maxTicketLots: valued<number>(null, LOT_RESTRICTIONS),
      relatedExposure: CFD_RELATED_EXPOSURE[symbol] ?? null,
    };
  }

  if (cryptoOnly && !isCrypto) {
    // 5514977, verbatim: E8 One Crypto / E8 Pro Crypto / E8 Signature Crypto are
    // "Crypto only", and 5514982's second table has no forex, indices, metals or
    // energies column at all.
    return {
      ...base,
      tradability: "not_offered",
      tradabilitySource: INSTRUMENTS_ARTICLE,
      brokerSymbol: null,
      brokerSymbolAlt: null,
      brokerSymbolSource: null,
      unit: nullContractSize(INSTRUMENTS_ARTICLE),
      maxTicketLots: valued<number>(null, LOT_RESTRICTIONS),
      relatedExposure: null,
    };
  }

  if (isCrypto) {
    const observation = family === "cfd_forex" ? FOREX_CONTRACT_OBSERVATIONS[symbol] : undefined;
    if (observation) {
      // Appendix A batches 1-2: the Forex-classification account's own order
      // tickets fill every crypto contract size in one session. Amendment 12
      // scopes this to the Forex classification alone -- the Crypto-
      // classification lines wait for their own account (amendment 15), whose
      // 2026-08-03 record is that account's own evidence, not a source here.
      const source = proForexTicket(observation.note);
      return {
        ...base,
        tradability: "confirmed",
        tradabilitySource: source,
        brokerSymbol: null,
        brokerSymbolAlt: ticketAlt(symbol),
        brokerSymbolSource: source,
        unit: {
          kind: "forex_contract",
          contractSize: valued(observation.contractSize, source),
        },
        maxTicketLots: valued<number>(TICKET_CAP_DEFAULT, LOT_RESTRICTIONS),
        relatedExposure: FUTURES_RELATED_EXPOSURE[symbol] ?? null,
      };
    }
    // Leverage is the only PRIMARY crypto fact. Contract size is NOT PUBLISHED
    // for every crypto symbol, the exhaustive symbol list is NOT PUBLISHED, and
    // only BTC/ETH/SOL are named at all — [SECONDARY], which cannot support a
    // confirmed row (§19a rule 1).
    return {
      ...base,
      tradability: "not_published",
      tradabilitySource: INSTRUMENTS_ARTICLE,
      brokerSymbol: null,
      brokerSymbolAlt: null,
      brokerSymbolSource: null,
      unit: nullContractSize(INSTRUMENTS_ARTICLE),
      maxTicketLots: valued<number>(TICKET_CAP_DEFAULT, LOT_RESTRICTIONS),
      relatedExposure: FUTURES_RELATED_EXPOSURE[symbol] ?? null,
    };
  }

  const mapping = assetType === "Forex" ? forexCfd(symbol) : CFD_MAPPINGS[symbol];
  return {
    ...base,
    tradability: mapping.tradability,
    tradabilitySource: mapping.tradabilitySource,
    brokerSymbol: mapping.brokerSymbol,
    brokerSymbolAlt: mapping.brokerSymbolAlt,
    brokerSymbolSource: mapping.brokerSymbolSource,
    unit: mapping.unit,
    maxTicketLots: valued<number>(mapping.maxTicketLots, LOT_RESTRICTIONS),
    relatedExposure: mapping.relatedExposure ?? FUTURES_RELATED_EXPOSURE[symbol] ??
      null,
  };
}

function buildRows(): BrokerInstrument[] {
  const rows: BrokerInstrument[] = [];
  for (const program of PROGRAM_LINES) {
    for (const symbol of ALL_MAPPED_SYMBOLS) {
      const assetType = ASSET_TYPE_BY_SYMBOL[symbol];
      const row = program.family === "futures"
        ? futuresLineRow(symbol, assetType)
        : cfdLineRow(symbol, assetType, program.family);
      rows.push({
        broker: "e8",
        programLine: program.line,
        levelflowSymbol: symbol,
        ...row,
      });
    }
  }
  return rows;
}

export const BROKER_INSTRUMENTS: BrokerInstrument[] = buildRows();

const ROW_INDEX = new Map<string, BrokerInstrument>(
  BROKER_INSTRUMENTS.map((row) => [`${row.programLine}:${row.levelflowSymbol}`, row]),
);

export function findBrokerInstrument(
  programLine: ProgramLine,
  levelflowSymbol: string,
): BrokerInstrument | null {
  return ROW_INDEX.get(`${programLine}:${levelflowSymbol}`) ?? null;
}

export function assetTypeOf(levelflowSymbol: string): SecurityType | null {
  return ASSET_TYPE_BY_SYMBOL[levelflowSymbol] ?? null;
}

/**
 * The leverage column E8's own tables use for this market on this family of
 * program. 5514982's first table has forex/indices/metals/energies/crypto columns
 * for the CFD forex lines; its second has bitcoin/ethereum/other-crypto columns for
 * the crypto lines, and no others.
 */
export function leverageClassFor(
  levelflowSymbol: string,
  family: ProgramFamily,
): LeverageClass | null {
  const assetType = ASSET_TYPE_BY_SYMBOL[levelflowSymbol];
  if (family === "futures") {
    return null;
  }
  if (family === "cfd_crypto") {
    if (assetType !== "Crypto") {
      return null;
    }
    if (levelflowSymbol === "BTCUSD") {
      return "bitcoin";
    }
    if (levelflowSymbol === "ETHUSD") {
      return "ethereum";
    }
    return "other_crypto";
  }
  switch (assetType) {
    case "Forex":
      return "forex";
    case "Metals":
      return "metals";
    case "Indices":
      return "indices";
    case "Energies":
      return "energies";
    case "Crypto":
      return "crypto";
    default:
      return null;
  }
}

function unitValues(unit: QuoteUnit): Valued<number>[] {
  switch (unit.kind) {
    case "forex_contract":
      return [unit.contractSize];
    case "index_points":
      return [unit.pointsPerLot];
    case "futures_tick":
      return [unit.tickSize, unit.valuePerTick];
  }
}

/**
 * Whether every published value this row's size needs is present. Live-quote
 * availability is a separate question, answered at render time by the bridge
 * (`Rate unavailable`, §19e) — this is the published half.
 *
 * Amendment 22 (owner ruling, 2026-08-05): sizing is a durable, universal
 * gate on RELIABLE — published, verified, self-consistent — broker inputs,
 * and a sizing-data gap withholds only the Size layer, never the market
 * itself. `6J` and `6M` are the encoded case: both carry non-null,
 * `primary`-tagged tick and value (and a non-null margin), every field this
 * function otherwise checks — yet E8's own tick table cannot reconcile the
 * two numbers with their 6E/6S siblings (a 1,000x-mismatched value per 1.0
 * price unit; `UNRECONCILED_TICK_AXIS` above). That is not missing data, it
 * is self-inconsistent data, and amendment 22's "self-consistent" clause
 * excludes it from sizing exactly as if it were null — checked explicitly
 * here so a future Levelflow-symbol mapping to `6J` or `6M` cannot silently
 * start sizing off the unresolved anomaly just because both fields happen to
 * be non-null.
 *
 * **This is a pinned derivation, not a runtime gate (Task 17b fix round 1
 * review, 2026-08-05).** `SIZEABLE_MARKETS_BY_LINE` below, the thing this
 * function drives, has zero consumers in `src/` outside this file today —
 * nothing in the app actually reads it to decide what to size. The real
 * runtime sizing path is `sizing.ts`'s `sizeInstrument`/`perUnitValue`,
 * which has no independent knowledge of `UNRECONCILED_TICK_AXIS` and would
 * compute a real (wrong) number for `6J`/`6M` if a row carrying either
 * `brokerSymbol` ever reached it confirmed — see `perUnitValue`'s own
 * docblock for that pointer. This function and the property test in
 * `tests/brokerReference.test.ts` that exercises it are what is actually
 * built; treat them as documentation of the intended rule, not as
 * protection a future onboarding change can lean on without also wiring
 * the gate into `sizing.ts`.
 */
export function hasPublishedSizeInputs(row: BrokerInstrument): boolean {
  const program = PROGRAM_LINES.find((line) => line.line === row.programLine);
  if (!program || row.tradability !== "confirmed") {
    return false;
  }
  if (row.brokerSymbol && UNRECONCILED_TICK_AXIS.includes(row.brokerSymbol)) {
    return false;
  }
  if (unitValues(row.unit).some((value) => value.value === null)) {
    return false;
  }
  if (program.family === "futures") {
    return row.marginPerContract.value !== null;
  }
  const leverageClass = leverageClassFor(row.levelflowSymbol, program.family);
  const leverage = leverageClass ? program.leverage[leverageClass] : undefined;
  return row.maxTicketLots.value !== null && (leverage?.value ?? null) !== null;
}

/**
 * What each program line can actually size in wave 1: a confirmed row with every
 * published input present, on a market Levelflow scans. The scannable
 * intersection is what makes §19a's "never sizeable while they are no-trade or
 * hidden" true in CI rather than in prose — a market with no setup has nothing to
 * size, and the nine addendum rows exist for the governor's universe question
 * alone.
 */
export const SIZEABLE_MARKETS_BY_LINE: Record<ProgramLine, string[]> =
  Object.fromEntries(
    PROGRAM_LINES.map((program) => [
      program.line,
      AVAILABLE_ASSET_SYMBOLS.filter((symbol) => {
        const row = findBrokerInstrument(program.line, symbol);
        return row ? hasPublishedSizeInputs(row) : false;
      }),
    ]),
  ) as Record<ProgramLine, string[]>;
