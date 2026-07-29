// CFTC Commitment of Traders positioning context.
//
// Speculative (non-commercial) net positioning, expressed as a share of open
// interest and ranked against its own trailing history, is one of the
// longest-standing positioning measures in futures markets. Crowded
// positioning is conventionally read as contrarian: when speculators are
// historically long, the marginal buyer is scarce.
//
// Two correctness rules govern every use here:
//   1. Publication lag. CFTC surveys Tuesday and publishes the following
//      Friday afternoon. A report is only knowable after its publication
//      time, never on its survey date, or the replay inherits lookahead bias.
//   2. Percentile, not level. Absolute contract counts are not comparable
//      across markets or eras; the rank of net% within trailing history is.

export type CotReportRow = {
  // Survey (report) date in epoch milliseconds.
  date: number;
  netPct: number;
};

export type CotStance =
  | "crowded_long"
  | "crowded_short"
  | "neutral"
  | "unavailable";

export type CotContext = {
  netPct: number | null;
  percentile: number | null;
  reportDate: string | null;
  sampleSize: number;
  stance: CotStance;
};

export type CotContractMapping = {
  // Net positioning is inverted when the LevelFlow symbol quotes USD first
  // (a long JPY futures position is short USDJPY).
  invert: boolean;
  primary: string;
  // Cross rates net the two legs: EURGBP = EUR positioning minus GBP.
  secondary?: string;
};

// CFTC survey is Tuesday; publication is Friday 15:30 ET. Three days plus a
// conservative full-day buffer keeps every join strictly after publication.
const PUBLICATION_LAG_MS = 4 * 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_WEEKS = 156;
const CROWDED_HIGH_PERCENTILE = 0.85;
const CROWDED_LOW_PERCENTILE = 0.15;
const MINIMUM_SAMPLE = 40;

const CURRENCY_CONTRACTS: Record<string, string> = {
  AUD: "A6",
  CAD: "D6",
  CHF: "S6",
  EUR: "E6",
  GBP: "B6",
  JPY: "J6",
  NZD: "N6",
};

// Non-currency markets map straight onto their own contract.
const DIRECT_CONTRACTS: Record<string, string> = {
  BRENT: "BZ",
  BTCUSD: "BT",
  BZUSD: "BZ",
  CLUSD: "CL",
  DOW: "YM",
  ESUSD: "ES",
  GCUSD: "GC",
  HGUSD: "HG",
  MGCUSD: "GC",
  NGUSD: "NG",
  NQUSD: "NQ",
  NSDQ: "NQ",
  RTYUSD: "QR",
  SIUSD: "SI",
  SP: "ES",
  WTI: "CL",
  XAGUSD: "SI",
  XAUUSD: "GC",
  YMUSD: "YM",
  ZBUSD: "ZB",
  ZNUSD: "ZN",
};

export function getCotContractMapping(
  symbol: string,
): CotContractMapping | null {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const direct = DIRECT_CONTRACTS[normalized];
  if (direct) {
    return { invert: false, primary: direct };
  }

  if (!/^[A-Z]{6}$/.test(normalized)) {
    return null;
  }
  const base = normalized.slice(0, 3);
  const quote = normalized.slice(3);

  if (quote === "USD") {
    const primary = CURRENCY_CONTRACTS[base];
    return primary ? { invert: false, primary } : null;
  }
  if (base === "USD") {
    const primary = CURRENCY_CONTRACTS[quote];
    // Long CHF futures is short USDCHF.
    return primary ? { invert: true, primary } : null;
  }
  const primary = CURRENCY_CONTRACTS[base];
  const secondary = CURRENCY_CONTRACTS[quote];
  return primary && secondary ? { invert: false, primary, secondary } : null;
}

export function netPctFromReport(report: {
  noncommPositionsLongAll?: number | string;
  noncommPositionsShortAll?: number | string;
  openInterestAll?: number | string;
}): number | null {
  const long = Number(report.noncommPositionsLongAll);
  const short = Number(report.noncommPositionsShortAll);
  const openInterest = Number(report.openInterestAll);
  if (
    !Number.isFinite(long) || !Number.isFinite(short) ||
    !Number.isFinite(openInterest) || openInterest <= 0
  ) {
    return null;
  }
  return (long - short) / openInterest;
}

export function buildCotContext(
  reports: CotReportRow[],
  asOf: number,
  lookbackWeeks = DEFAULT_LOOKBACK_WEEKS,
): CotContext {
  // Only reports whose publication time has passed are visible.
  const visible = reports
    .filter((report) =>
      Number.isFinite(report.date) && Number.isFinite(report.netPct) &&
      report.date + PUBLICATION_LAG_MS <= asOf
    )
    .sort((first, second) => first.date - second.date)
    .slice(-lookbackWeeks);

  if (visible.length < MINIMUM_SAMPLE) {
    return {
      netPct: null,
      percentile: null,
      reportDate: null,
      sampleSize: visible.length,
      stance: "unavailable",
    };
  }

  const latest = visible[visible.length - 1];
  const atOrBelow =
    visible.filter((report) => report.netPct <= latest.netPct).length;
  const percentile = atOrBelow / visible.length;

  return {
    netPct: Number(latest.netPct.toFixed(6)),
    percentile: Number(percentile.toFixed(4)),
    reportDate: new Date(latest.date).toISOString().slice(0, 10),
    sampleSize: visible.length,
    stance: percentile >= CROWDED_HIGH_PERCENTILE
      ? "crowded_long"
      : percentile <= CROWDED_LOW_PERCENTILE
      ? "crowded_short"
      : "neutral",
  };
}

// Combines the legs of a cross and applies inversion, producing the series
// used for percentile ranking. Weeks present in only one leg are dropped so
// the differential always compares like with like.
export function combineCotSeries(
  primary: CotReportRow[],
  secondary: CotReportRow[] | undefined,
  invert: boolean,
): CotReportRow[] {
  const sign = invert ? -1 : 1;
  if (!secondary || secondary.length === 0) {
    return primary.map((row) => ({
      date: row.date,
      netPct: sign * row.netPct,
    }));
  }
  const secondaryByDate = new Map(
    secondary.map((row) => [row.date, row.netPct]),
  );
  const combined: CotReportRow[] = [];
  for (const row of primary) {
    const other = secondaryByDate.get(row.date);
    if (other === undefined) {
      continue;
    }
    combined.push({ date: row.date, netPct: sign * (row.netPct - other) });
  }
  return combined;
}

// Contrarian reading: a crowded book argues against joining that side. The
// magnitude comes from calibration, so an unvalidated adjustment is zero.
export function cotScoreAdjustment(
  context: CotContext,
  side: "buy" | "sell",
  magnitude: number,
): number {
  if (magnitude === 0 || context.stance === "unavailable") {
    return 0;
  }
  if (context.stance === "crowded_long") {
    return side === "buy" ? -magnitude : magnitude;
  }
  if (context.stance === "crowded_short") {
    return side === "sell" ? -magnitude : magnitude;
  }
  return 0;
}
