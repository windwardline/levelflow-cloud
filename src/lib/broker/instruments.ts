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

// The two margin-table-only symbols Levelflow already serves, as `ZBUSD` and
// `ZNUSD`. Absent from the fee table, the tick table, the canonical
// 45-instrument list and the live symbol browser: margin published, tick size
// and value NOT PUBLISHED, tradability unconfirmed. The other nine
// margin-table-only symbols (ZT, ZF, UB, TN, ZQ, GF, MNG, MHG and the
// blank-symbol "Micro Silver" row) have no Levelflow counterpart and are out of
// scope for §19 (§19h).
const MARGIN_ONLY_ROWS: SpecRow[] = [
  ["ZB", "30-Year Bond", null, null, 10_000, null],
  ["ZN", "10-Year Note", null, null, 10_000, null],
];

function toSpec(row: SpecRow, canonical: boolean): E8FuturesSpec {
  const [symbol, product, tickSize, valuePerTick, margin, altSymbol] = row;
  return {
    symbol,
    altSymbol,
    product,
    tickSize: valued(tickSize, TICK_SIZES),
    valuePerTick: valued(valuePerTick, TICK_SIZES),
    marginPerContract: valued(margin, MAX_CONTRACTS),
    canonical,
    tradability: canonical ? "confirmed" : "unconfirmed",
  };
}

export const E8_FUTURES_SPECS: Record<string, E8FuturesSpec> = Object.fromEntries(
  [
    ...CANONICAL_ROWS.map((row) => toSpec(row, true)),
    ...MARGIN_ONLY_ROWS.map((row) => toSpec(row, false)),
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
  // identical terms: contract size 100,000 units.
  const display = `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
  return {
    brokerSymbol: display,
    brokerSymbolAlt: null,
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
  brokerSymbol: string,
  pointsPerLot: number,
  brokerSymbolAlt: string | null = null,
): CfdMapping {
  return {
    brokerSymbol,
    brokerSymbolAlt,
    brokerSymbolSource: CONTRACT_SIZES,
    tradability: "confirmed",
    tradabilitySource: CONTRACT_SIZES,
    unit: { kind: "index_points", pointsPerLot: valued(pointsPerLot, CONTRACT_SIZES) },
    maxTicketLots: TICKET_CAP_DEFAULT,
    relatedExposure: null,
  };
}

/**
 * A market E8's own lists do not reach. Not `not_offered`: the crossmap reserves
 * that for E8 Futures, whose 45-instrument roster was cross-checked against three
 * independent listings. Everywhere else E8's list is itself incomplete or
 * inaccessible, so absence proves nothing — and "not tradable on this broker
 * program" is a claim E8 does not support (§19e).
 */
function unpublishedCfd(
  source: Provenance,
  unit: QuoteUnit,
  relatedExposure: string | null = null,
): CfdMapping {
  return {
    brokerSymbol: null,
    brokerSymbolAlt: null,
    brokerSymbolSource: null,
    tradability: "not_published",
    tradabilitySource: source,
    unit,
    maxTicketLots: TICKET_CAP_DEFAULT,
    relatedExposure,
  };
}

const nullContractSize = (source: Provenance): QuoteUnit => ({
  kind: "forex_contract",
  contractSize: valued<number>(null, source),
});

const nullPointsPerLot = (source: Provenance): QuoteUnit => ({
  kind: "index_points",
  pointsPerLot: valued<number>(null, source),
});

const CFD_MAPPINGS: Record<string, CfdMapping> = {
  // Metals. Gold is the only metal with a published spec: contract size 100 oz
  // per 1.0 lot, and a ticket cap of 20 lots rather than 50 — a shared
  // max-ticket value would over-permit gold by 2.5x.
  XAUUSD: {
    brokerSymbol: "XAUUSD",
    brokerSymbolAlt: null,
    brokerSymbolSource: CONTRACT_SIZES,
    tradability: "confirmed",
    tradabilitySource: CONTRACT_SIZES,
    unit: { kind: "forex_contract", contractSize: valued(100, CONTRACT_SIZES) },
    maxTicketLots: TICKET_CAP_GOLD,
    relatedExposure: null,
  },
  // "Metals" is a confirmed class but the contract-size article renders only
  // four rows and silver is not among them. E8's silence about silver is a
  // documentation gap, not a refusal.
  XAGUSD: unpublishedCfd(CONTRACT_SIZES, nullContractSize(CONTRACT_SIZES)),

  // Energies. E8 confirms the class and publishes no symbol list, no contract
  // size and no energies-specific leverage figure anywhere accessible.
  WTI: unpublishedCfd(INSTRUMENTS_ARTICLE, nullContractSize(INSTRUMENTS_ARTICLE)),
  BRENT: unpublishedCfd(INSTRUMENTS_ARTICLE, nullContractSize(INSTRUMENTS_ARTICLE)),

  // Indices. Three rows are published (9453488); the rest are named in secondary
  // sources and in the primary article's CATEGORY list only, so their symbols
  // never reach `confirmed` (§19a rule 1). E8's own two-spelling strings are
  // recorded where the dossier reproduces them.
  SP: indexCfd("SP500", 20),
  NSDQ: indexCfd("NAS100", 5),
  DOW: indexCfd("US30", 5),
  NIKKEI: unpublishedCfd(INSTRUMENTS_ARTICLE, nullPointsPerLot(INSTRUMENTS_ARTICLE)),
  DAX: unpublishedCfd(INSTRUMENTS_ARTICLE, nullPointsPerLot(INSTRUMENTS_ARTICLE)),
  ASX: unpublishedCfd(INSTRUMENTS_ARTICLE, nullPointsPerLot(INSTRUMENTS_ARTICLE)),
};

/**
 * The same-exposure CFD for a Levelflow futures row, at a different contract
 * size and a different P&L per point. Recorded, never substituted (§19a).
 */
const CFD_RELATED_EXPOSURE: Record<string, string> = {
  ESUSD: "SP500",
  NQUSD: "NAS100",
  YMUSD: "US30",
  GCUSD: "XAUUSD",
  MGCUSD: "XAUUSD",
};

/** The E8 futures instrument that reaches a spot row's exposure (crossmap §2.2). */
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

/** Levelflow's Futures rows to E8's futures instruments. */
const FUTURES_MAPPINGS: Record<string, string> = {
  CLUSD: "CL",
  ESUSD: "ES",
  GCUSD: "GC",
  HGUSD: "HG",
  MGCUSD: "MGC",
  NGUSD: "NG",
  NQUSD: "NQ",
  RTYUSD: "RTY",
  SIUSD: "SI",
  YMUSD: "YM",
  ZBUSD: "ZB",
  ZNUSD: "ZN",
};

/** GCUSD and MGCUSD are one exposure through two instruments on one line. */
const FUTURES_SIBLING: Record<string, string> = {
  GCUSD: "MGC",
  MGCUSD: "GC",
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
    // BZUSD. Brent is absent from the 45-instrument canonical roster; E8's crude
    // is WTI only. A firm NOT OFFERED, cross-checked against three listings.
    return { ...notOffered, tradabilitySource: CANONICAL_LIST };
  }

  const spec = E8_FUTURES_SPECS[e8Symbol];
  return {
    tradability: spec.tradability,
    tradabilitySource: spec.canonical ? CANONICAL_LIST : MAX_CONTRACTS,
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
      source: { article: null, tag: "derived", method: "13004287", url: TICK_SIZES.url },
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
 */
export function hasPublishedSizeInputs(row: BrokerInstrument): boolean {
  const program = PROGRAM_LINES.find((line) => line.line === row.programLine);
  if (!program || row.tradability !== "confirmed") {
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
