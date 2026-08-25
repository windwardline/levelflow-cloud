// The Deno half of the Treasury-rate context: the provider fetch, its
// fifteen-minute cache, and the I11 outage recorder. The adjustment
// arithmetic, the row parser and the context construction live in
// macroRates.ts (E6, R1b) so the offline sweep and the node test harness
// can import them — this module reads Deno.env at top level and can never
// enter that graph. The re-exports below keep this file the one import
// for the live analyzer.

import {
  calculateMacroRateAdjustment,
  type DatedTreasuryRow,
  type MacroRateAdjustment,
  type MacroRateContext,
  isoDateFromMs,
  parseTreasuryRow,
  treasuryContextFromRows,
  TREASURY_MAX_STALE_MS,
  treasuryCurveIsStale,
  treasuryCurveStaleMs,
  unavailableContext,
} from "./macroRates.ts";

export {
  calculateMacroRateAdjustment,
  type MacroRateAdjustment,
  type MacroRateContext,
};

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
      .filter((row): row is DatedTreasuryRow => row !== null)
      .sort((first, second) => second.dateMs - first.dateMs);
    const latest = rows[0];
    const previous = rows[1];
    if (!latest || !previous) {
      return unavailableContext("FMP Treasury-rate history was incomplete.");
    }

    // A 200 IS NOT FRESHNESS. Every outage this function records above is a
    // transport failure — a missing key, a non-200, a non-array, a short
    // history, a throw. A successful response carrying a stale tail passed all
    // of them, kept source "fmp_treasury_rates", and scored every setup off a
    // pair that may straddle a large move: the +/-4bps and +/-8bps thresholds
    // in calculateMacroRateAdjustment are ONE-DAY-CHANGE thresholds, and
    // the energy-shock role additionally takes a -1 penalty at
    // |change| >= 8bps, so a stale pair penalises every market carrying that
    // role as well as the rate-aligned side.
    //
    // Named by ROLE, not by list. This read "BRENT, BZUSD, CLUSD, NGUSD and
    // WTI" and was wrong in both directions: BRENT left symbolMap and is no
    // longer analyzable at all, while HOUSD and RBUSD joined the role. The
    // population lives in MACRO_RATE_ROLE_BY_SYMBOL, where a test holds it to
    // the roster; a copy here could only ever drift away from it.
    //
    // The sweep has refused exactly this since R1b, twice and explicitly, on
    // the same seven-day bound; the predicate is shared rather than copied so
    // the two cannot drift.
    if (treasuryCurveIsStale(latest.dateMs, Date.now())) {
      return unavailableContext(
        `FMP Treasury-rate curve is stale — newest label ${
          isoDateFromMs(latest.dateMs)
        } is ${
          Math.round(treasuryCurveStaleMs(latest.dateMs, Date.now()) / 86_400_000)
        } days old, past the ${
          Math.round(TREASURY_MAX_STALE_MS / 86_400_000)
        }-day publication bound.`,
      );
    }
    // One construction for live and sweep alike (macroRates.ts): live reads
    // the response's two most recent rows; the sweep reads the two most
    // recent VISIBLE rows at each decision instant.
    return treasuryContextFromRows(latest, previous);
  } catch (error) {
    console.error("FMP Treasury-rate request failed", error);
    return unavailableContext("FMP Treasury-rate context could not be loaded.");
  }
}
