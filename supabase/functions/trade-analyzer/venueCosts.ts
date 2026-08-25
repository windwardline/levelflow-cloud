// The venue's published bill, per line — round-8 CO-1/CO-2/CO-3/CO-4.
//
// Until 2026-08-11 the cost model was spread + slippage only: the venue's
// COMMISSION never appeared anywhere, which understated forex round trips
// by roughly 75% of the modeled figure and futures micros by 30-50%. This
// module carries the commissions exactly as E8 publishes them, converted
// to PRICE DISTANCE in each instrument's own quote units so the existing
// R accountant can charge them without learning any new currency.
//
// Sources, per class (dossiers under docs/research/):
// - Futures program (Tradovate): three itemized per-contract RT fees —
//   Commission + Exchange&NFA + Clearing — from the §5.2 master table
//   [PRIMARY]. Price distance = fees ÷ tickValue x tickSize. Symbols E8
//   publishes no row for carry a NAMED sibling proxy on the conservative
//   side, never silence.
// - Forex CFDs: $5/lot RT on a 100,000-unit contract [PRIMARY] — 0.5bp of
//   price. Exact for USD-base pairs; mildly conservative for USD-quote
//   and crosses (the true figure is 0.4-0.5bp depending on the quote
//   currency's dollar rate; rounding up is deliberate).
// - Index CFDs: $6/lot (SP, NSDQ, DAX, NIKKEI) vs $12/lot (DOW, ASX)
//   [SECONDARY commission split] over the published $/point multipliers
//   (SP $20, NSDQ/DOW $5 [PRIMARY]); unpublished multipliers assume the
//   $5/point published LOW — a lower multiplier means a larger price
//   distance per dollar, so the assumption overcharges rather than
//   undercharges.
// - Metals: $6/lot [SECONDARY] over gold's published 100oz [PRIMARY] and
//   silver's standard 5,000oz [assumption, marked].
// - Energies: $6/lot [SECONDARY] over a conservative 100-barrel contract
//   [assumption — E8 publishes no energy contract size].
// - Crypto: the dossier's two irreconcilable published forms (flat
//   $30-35/lot with no published contract size vs 0.035% per trade)
//   resolve CONSERVATIVELY to the percentage form: 3.5bp per side, 7bp
//   round-trip of price.
import { getAssetType } from "./calibration.ts";
import { getFuturesContractSpec } from "./futures.ts";
import { isKnownSymbol } from "./symbols.ts";

type FuturesFeeRow = {
  // "published" cites the §5.2 row; "proxy" names the sibling whose rate
  // this symbol borrows because E8 publishes none for it.
  basis: string;
  feesRoundTripUsd: number;
  tickValueUsd: number;
};

// Keyed by Levelflow roster name. tickSize deliberately NOT duplicated
// here — it comes from getFuturesContractSpec, the grid's single source
// of truth, so the two tables cannot drift apart.
// SYMBOLS: external E8 fee schedule | 28 of 98 vs known
const FUTURES_VENUE_FEES: Record<string, FuturesFeeRow> = {
  // CME Equity
  ESUSD: { basis: "published ES", feesRoundTripUsd: 5.76, tickValueUsd: 12.5 },
  NQUSD: { basis: "published NQ", feesRoundTripUsd: 5.76, tickValueUsd: 5 },
  RTYUSD: { basis: "published RTY", feesRoundTripUsd: 5.76, tickValueUsd: 5 },
  YMUSD: { basis: "published YM", feesRoundTripUsd: 5.76, tickValueUsd: 5 },
  // NYMEX
  CLUSD: { basis: "published CL", feesRoundTripUsd: 6.0, tickValueUsd: 10 },
  BZUSD: {
    basis: "proxy: CL (crude sibling; E8 publishes no Brent row)",
    feesRoundTripUsd: 6.0,
    tickValueUsd: 10,
  },
  NGUSD: { basis: "published NG", feesRoundTripUsd: 6.2, tickValueUsd: 10 },
  RBUSD: { basis: "published RB", feesRoundTripUsd: 6.0, tickValueUsd: 4.2 },
  HOUSD: { basis: "published HO", feesRoundTripUsd: 7.2, tickValueUsd: 4.2 },
  // COMEX
  GCUSD: { basis: "published GC", feesRoundTripUsd: 6.2, tickValueUsd: 10 },
  MGCUSD: { basis: "published MGC", feesRoundTripUsd: 2.4, tickValueUsd: 1 },
  SIUSD: { basis: "published SI", feesRoundTripUsd: 6.2, tickValueUsd: 25 },
  HGUSD: { basis: "published HG", feesRoundTripUsd: 6.2, tickValueUsd: 12.5 },
  PLUSD: { basis: "published PL", feesRoundTripUsd: 6.2, tickValueUsd: 10 },
  PAUSD: { basis: "published PA", feesRoundTripUsd: 6.2, tickValueUsd: 10 },
  // CBOT financials — margin-table-only at E8, no fee row published for
  // any treasury. The proxy is the highest Exch+NFA family rate on the
  // published board (CBOT Commodity $7.20 RT): conservative by design.
  ZBUSD: {
    basis: "proxy: CBOT commodity rate (treasuries unpublished)",
    feesRoundTripUsd: 7.2,
    tickValueUsd: 31.25,
  },
  ZNUSD: {
    basis: "proxy: CBOT commodity rate (treasuries unpublished)",
    feesRoundTripUsd: 7.2,
    tickValueUsd: 15.625,
  },
  ZFUSD: {
    basis: "proxy: CBOT commodity rate (treasuries unpublished)",
    feesRoundTripUsd: 7.2,
    tickValueUsd: 7.8125,
  },
  ZTUSD: {
    basis: "proxy: CBOT commodity rate (treasuries unpublished)",
    feesRoundTripUsd: 7.2,
    tickValueUsd: 15.625,
  },
  // CBOT Commodity (grains)
  ZCUSX: { basis: "published ZC", feesRoundTripUsd: 7.2, tickValueUsd: 12.5 },
  ZSUSX: { basis: "published ZS", feesRoundTripUsd: 7.2, tickValueUsd: 12.5 },
  ZLUSX: { basis: "published ZL", feesRoundTripUsd: 7.2, tickValueUsd: 6 },
  ZMUSD: { basis: "published ZM", feesRoundTripUsd: 7.2, tickValueUsd: 10 },
  ZOUSX: {
    basis: "proxy: CBOT commodity rate (oats unpublished at E8)",
    feesRoundTripUsd: 7.2,
    tickValueUsd: 12.5,
  },
  ZRUSD: {
    basis: "proxy: CBOT commodity rate (rough rice unpublished at E8)",
    feesRoundTripUsd: 7.2,
    tickValueUsd: 10,
  },
  // CME Agro
  LEUSX: { basis: "published LE", feesRoundTripUsd: 7.2, tickValueUsd: 10 },
  HEUSX: { basis: "published HE", feesRoundTripUsd: 7.2, tickValueUsd: 10 },
  GFUSX: {
    basis: "proxy: CME Agro rate (feeder cattle margin-table-only)",
    feesRoundTripUsd: 7.2,
    tickValueUsd: 12.5,
  },
};

// $ commission RT and $/point multiplier per index CFD. SP/NSDQ/DOW
// multipliers are E8-published; DAX/NIKKEI/ASX assume the published $5
// low (conservative: smaller multiplier -> larger price distance).
// SYMBOLS: external E8 index commissions | 6 of 6 vs indices
const INDEX_VENUE_COMMISSIONS: Record<
  string,
  { basis: string; commissionUsd: number; dollarsPerPoint: number }
> = {
  SP: { basis: "published $20/pt", commissionUsd: 6, dollarsPerPoint: 20 },
  NSDQ: { basis: "published $5/pt", commissionUsd: 6, dollarsPerPoint: 5 },
  DOW: { basis: "published $5/pt, $12 split", commissionUsd: 12, dollarsPerPoint: 5 },
  DAX: { basis: "assumed $5/pt (unpublished)", commissionUsd: 6, dollarsPerPoint: 5 },
  NIKKEI: {
    basis: "assumed $5/pt (unpublished)",
    commissionUsd: 6,
    dollarsPerPoint: 5,
  },
  ASX: {
    basis: "assumed $5/pt (unpublished), $12 split",
    commissionUsd: 12,
    dollarsPerPoint: 5,
  },
};

// $ commission RT over contract units for the metal/energy CFD lines.
// SYMBOLS: external E8 lot commissions | 3 of 98 vs known
const LOT_VENUE_COMMISSIONS: Record<
  string,
  { basis: string; commissionUsd: number; unitsPerLot: number }
> = {
  XAUUSD: { basis: "published 100oz", commissionUsd: 6, unitsPerLot: 100 },
  XAGUSD: {
    basis: "standard 5000oz (E8 unpublished)",
    commissionUsd: 6,
    unitsPerLot: 5000,
  },
  WTI: {
    basis: "conservative 100bbl (E8 unpublished)",
    commissionUsd: 6,
    unitsPerLot: 100,
  },
  BRENT: {
    basis: "conservative 100bbl (E8 unpublished)",
    commissionUsd: 6,
    unitsPerLot: 100,
  },
};

const FOREX_COMMISSION_PRICE_FRACTION = 5 / 100_000; // $5/lot RT on 100k
const CRYPTO_COMMISSION_PRICE_FRACTION = 2 * 0.00035; // 0.035% per side

// The crypto account's sampled book (2026-08-03, one Monday-afternoon
// snapshot), as mid-relative basis points. A POINT-IN-TIME sample is not
// a cost model — which is exactly why these are FLOORS under max() with
// the class model, never replacements: live spreads can be wider, and a
// quoted spread still outranks the whole modeled branch. TRUMP's
// two-decimal display hid its width entirely; it carries no floor.
// SYMBOLS: external measured crypto spread floors | 32 of 33 vs crypto
const CRYPTO_SPREAD_FLOOR_BPS: Record<string, number> = {
  AAVEUSD: 1.1,
  ADAUSD: 11.3,
  ALGOUSD: 32.4,
  ARWUSD: 10.9,
  ATOMUSD: 96.6,
  AVAXUSD: 30.4,
  BCHUSD: 28.6,
  BNBUSD: 0.5,
  BTCUSD: 0.35,
  CAKEUSD: 4.2,
  DASHUSD: 3.8,
  DOGEUSD: 5.7,
  DOTUSD: 48.1,
  DYDXUSD: 88.9,
  EGLDUSD: 36.7,
  ETCUSD: 7.6,
  ETHUSD: 3.1,
  FILUSD: 275.5,
  GRTUSD: 6.8,
  HBARUSD: 4.3,
  IMXUSD: 9.0,
  LINKUSD: 2.4,
  LTCUSD: 33.9,
  NEARUSD: 40.1,
  SOLUSD: 4.1,
  THETAUSD: 78.4,
  TRXUSD: 23.7,
  UNIUSD: 2.6,
  XLMUSD: 1.8,
  XMRUSD: 0.55,
  XRPUSD: 1.1,
  XTZUSD: 97.1,
};

/**
 * The venue's round-trip commission for one unit of the instrument,
 * expressed as a distance in the instrument's own price units — or null
 * when the symbol is not a roster name this module can bill. Null is a
 * refusal, not a zero: a caller treating it as "free" re-creates the
 * silent understatement this module exists to end.
 */
export function venueCommissionRoundTripPrice(
  symbol: string,
  referencePrice: number,
): number | null {
  const futuresRow = FUTURES_VENUE_FEES[symbol];
  if (futuresRow) {
    const spec = getFuturesContractSpec(symbol);
    if (!spec) return null;
    return (futuresRow.feesRoundTripUsd / futuresRow.tickValueUsd) *
      spec.tickSize;
  }
  const indexRow = INDEX_VENUE_COMMISSIONS[symbol];
  if (indexRow) {
    return indexRow.commissionUsd / indexRow.dollarsPerPoint;
  }
  const lotRow = LOT_VENUE_COMMISSIONS[symbol];
  if (lotRow) {
    return lotRow.commissionUsd / lotRow.unitsPerLot;
  }
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    return null;
  }
  // getAssetType falls back to "forex" for ANY unknown spelling — the
  // exact seam round 8 caught (CV-1). A commission must never legitimize
  // that fallback, so both remaining branches demand roster membership.
  if (!isKnownSymbol(symbol)) {
    return null;
  }
  const assetType = getAssetType(symbol);
  if (assetType === "forex") {
    return referencePrice * FOREX_COMMISSION_PRICE_FRACTION;
  }
  if (assetType === "crypto") {
    return referencePrice * CRYPTO_COMMISSION_PRICE_FRACTION;
  }
  return null;
}

/**
 * The sampled-book spread floor for a crypto symbol at a price, or null
 * where no floor exists (unsampled symbol, zero-width display sample,
 * non-crypto). Consumed as max(classModel, floor) — see the sampling
 * caveat on the table.
 */
export function cryptoSpreadFloorPrice(
  symbol: string,
  referencePrice: number,
): number | null {
  const bps = CRYPTO_SPREAD_FLOOR_BPS[symbol];
  if (
    bps === undefined || bps <= 0 || !Number.isFinite(referencePrice) ||
    referencePrice <= 0
  ) {
    return null;
  }
  return referencePrice * (bps / 10_000);
}
