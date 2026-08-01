import { getAssetType } from "./calibration.ts";
import type { Side, SupportedSymbol } from "./types.ts";

const FMP_API_KEY = Deno.env.get("FMP_API_KEY");
const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ??
  "https://financialmodelingprep.com/stable";
const PROVIDER_FETCH_TIMEOUT_MS = 12_000;
const TREASURY_CONTEXT_CACHE_MS = 15 * 60 * 1000;

type Fetcher = (
  input: string | URL,
  init?: RequestInit,
  timeoutMs?: number,
) => Promise<Response>;

// I11: the same shape marketLoader.ts already takes, for the same reason. A
// persistent Treasury outage zeroes macroAdjustment for every setup in the
// system, and before this the only trace was a string buried in
// confluence.macroRateContext.unavailableReason — no log, no telemetry, nothing
// a watchdog or an operator could query. Optional so the offline replay sweep
// can call this without a telemetry dependency.
type MacroEventRecorder = (event: {
  action: string;
  message: string;
  status: "error";
}) => Promise<void>;

export type MacroRateContext = {
  curveSpreadBps: number | null;
  latestDate: string | null;
  previousDate: string | null;
  source: "fmp_treasury_rates" | "unavailable";
  tenYearChangeBps: number | null;
  tenYearYield: number | null;
  twoYearYield: number | null;
  unavailableReason?: string;
};

export type MacroRateAdjustment = {
  adjustment: number;
  detail: string;
  stance: "aligned" | "against" | "neutral" | "unavailable";
};

type TreasuryRow = {
  date: string;
  tenYear: number;
  twoYear: number;
};

const EQUITY_INDEX_SYMBOLS = new Set([
  "ASX",
  "DAX",
  "DOW",
  "ESUSD",
  "NIKKEI",
  "NQUSD",
  "NSDQ",
  "RTYUSD",
  "SP",
  "YMUSD",
]);
const RATE_SENSITIVE_METALS = new Set([
  "GCUSD",
  "MGCUSD",
  "SIUSD",
  "XAGUSD",
  "XAUUSD",
]);
const TREASURY_FUTURES = new Set(["ZBUSD", "ZNUSD"]);
const ENERGY_SYMBOLS = new Set(["BRENT", "BZUSD", "CLUSD", "NGUSD", "WTI"]);

let cachedTreasuryContext:
  | { context: MacroRateContext; fetchedAt: number }
  | null = null;

export async function fetchMacroRateContext(
  fetcher: Fetcher,
  recordEvent?: MacroEventRecorder,
): Promise<MacroRateContext> {
  const now = Date.now();
  if (
    cachedTreasuryContext &&
    now - cachedTreasuryContext.fetchedAt < TREASURY_CONTEXT_CACHE_MS
  ) {
    return cachedTreasuryContext.context;
  }

  const context = await requestMacroRateContext(fetcher);
  cachedTreasuryContext = { context, fetchedAt: now };
  // Recorded once per fetch rather than once per request: the context is cached
  // for fifteen minutes, and a repeat caller reading that cache has not
  // suffered a new outage. Every unavailable reason lands here — a missing key,
  // a non-200, a malformed body, an incomplete history, or a thrown request —
  // so one branch covers what five bare returns used to hide.
  if (context.source === "unavailable" && recordEvent) {
    await recordEvent({
      action: "macro_rate_context",
      message: context.unavailableReason ??
        "Treasury-rate context was unavailable.",
      status: "error",
    });
  }
  return context;
}

export function calculateMacroRateAdjustment(
  symbol: SupportedSymbol,
  side: Side,
  context: MacroRateContext,
): MacroRateAdjustment {
  if (
    context.source === "unavailable" ||
    context.tenYearChangeBps === null ||
    Math.abs(context.tenYearChangeBps) < 4
  ) {
    return {
      adjustment: 0,
      detail: context.source === "unavailable"
        ? "Treasury-rate context was unavailable, so it did not affect this review."
        : "Treasury rates were steady enough to avoid changing the setup score.",
      stance: context.source === "unavailable" ? "unavailable" : "neutral",
    };
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  const preferredSide = getRateAlignedSide(
    normalizedSymbol,
    context.tenYearChangeBps,
  );
  if (!preferredSide) {
    const shockPenalty = ENERGY_SYMBOLS.has(normalizedSymbol) &&
        Math.abs(context.tenYearChangeBps) >= 8
      ? -1
      : 0;
    return {
      adjustment: shockPenalty,
      detail: shockPenalty
        ? "A large Treasury-rate move added macro noise for this energy market."
        : "Treasury rates were reviewed but did not directly affect this market.",
      stance: "neutral",
    };
  }

  const magnitude = Math.abs(context.tenYearChangeBps) >= 8 ? 2 : 1;
  const aligned = side === preferredSide;
  return {
    adjustment: aligned ? magnitude : -magnitude,
    detail: buildRateDetail(context, preferredSide, aligned),
    stance: aligned ? "aligned" : "against",
  };
}

async function requestMacroRateContext(
  fetcher: Fetcher,
): Promise<MacroRateContext> {
  if (!FMP_API_KEY) {
    return unavailableContext("FMP API key is not configured.");
  }

  try {
    const url = new URL(
      `${FMP_API_BASE_URL.replace(/\/$/, "")}/treasury-rates`,
    );
    url.searchParams.set("apikey", FMP_API_KEY);
    const response = await fetcher(url, {}, PROVIDER_FETCH_TIMEOUT_MS);
    const responseText = await response.text();
    if (!response.ok) {
      return unavailableContext(
        `FMP Treasury-rate request failed (${response.status}).`,
      );
    }

    const payload = JSON.parse(responseText);
    if (!Array.isArray(payload)) {
      return unavailableContext("FMP Treasury-rate response was not an array.");
    }

    const rows = payload
      .map(parseTreasuryRow)
      .filter((row): row is TreasuryRow => row !== null)
      .sort((first, second) =>
        new Date(second.date).getTime() - new Date(first.date).getTime()
      );
    const latest = rows[0];
    const previous = rows[1];
    if (!latest || !previous) {
      return unavailableContext("FMP Treasury-rate history was incomplete.");
    }

    return {
      curveSpreadBps: roundBps((latest.tenYear - latest.twoYear) * 100),
      latestDate: latest.date,
      previousDate: previous.date,
      source: "fmp_treasury_rates",
      tenYearChangeBps: roundBps((latest.tenYear - previous.tenYear) * 100),
      tenYearYield: latest.tenYear,
      twoYearYield: latest.twoYear,
    };
  } catch (error) {
    console.error("FMP Treasury-rate request failed", error);
    return unavailableContext("FMP Treasury-rate context could not be loaded.");
  }
}

function parseTreasuryRow(value: unknown): TreasuryRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const date = String(row.date ?? row.calendarDate ?? "");
  const tenYear = numberFromKeys(row, [
    "year10",
    "tenYear",
    "tenYearYield",
    "10Y",
    "10y",
    "year_10",
  ]);
  const twoYear = numberFromKeys(row, [
    "year2",
    "twoYear",
    "twoYearYield",
    "2Y",
    "2y",
    "year_2",
  ]);

  if (!date || tenYear === null || twoYear === null) {
    return null;
  }
  return { date, tenYear, twoYear };
}

function getRateAlignedSide(
  symbol: string,
  tenYearChangeBps: number,
): Side | null {
  const rateDirection = tenYearChangeBps > 0 ? "rising" : "falling";
  const usdStrengthSide = getUsdStrengthSide(symbol);
  if (usdStrengthSide) {
    return rateDirection === "rising"
      ? usdStrengthSide
      : inverseSide(usdStrengthSide);
  }

  if (
    EQUITY_INDEX_SYMBOLS.has(symbol) ||
    RATE_SENSITIVE_METALS.has(symbol) ||
    TREASURY_FUTURES.has(symbol) ||
    getAssetType(symbol) === "crypto"
  ) {
    return rateDirection === "rising" ? "sell" : "buy";
  }

  return null;
}

function getUsdStrengthSide(symbol: string): Side | null {
  if (/^USD[A-Z]{3}$/.test(symbol)) {
    return "buy";
  }
  if (/^[A-Z]{3}USD$/.test(symbol)) {
    return "sell";
  }
  return null;
}

function inverseSide(side: Side): Side {
  return side === "buy" ? "sell" : "buy";
}

function buildRateDetail(
  context: MacroRateContext,
  preferredSide: Side,
  aligned: boolean,
) {
  const move = context.tenYearChangeBps ?? 0;
  const direction = move > 0 ? "higher" : "lower";
  const absMove = Math.abs(move).toFixed(1);
  return `The U.S. 10-year yield moved ${direction} by ${absMove} bps; that ${
    aligned ? "supports" : "works against"
  } this ${preferredSide} view.`;
}

function numberFromKeys(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function unavailableContext(reason: string): MacroRateContext {
  return {
    curveSpreadBps: null,
    latestDate: null,
    previousDate: null,
    source: "unavailable",
    tenYearChangeBps: null,
    tenYearYield: null,
    twoYearYield: null,
    unavailableReason: reason,
  };
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function roundBps(value: number) {
  return Number(value.toFixed(2));
}
