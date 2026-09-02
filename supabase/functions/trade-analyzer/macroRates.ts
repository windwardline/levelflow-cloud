// E6 (R1b): the environment-free half of the Treasury-rate context, split
// out of macroContext.ts the way bars.ts carries marketLoader's pure
// boundary — macroContext.ts reads Deno.env at module top, so the offline
// sweep (and the node:test harness behind it) could never import the
// adjustment arithmetic it needed to reconstruct macroAdjustment per
// decision instant. Everything here is deterministic in its inputs — the
// one module-level state is treasuryVisibleAtMs's memo of a
// deterministic map (bounded by distinct treasury dates, the same shape
// as bars.ts's formatter caches) — while the fetch, its response cache
// and its telemetry recorder stay in macroContext.ts.

import { newYorkWallClockToUtcMs } from "./bars.ts";
// No `getAssetType` import any more. It was the crypto branch's only use, and
// it returns "forex" for anything unlisted — a silent default that would have
// given an unknown market the currency rule. The role table names its
// population outright, so the macro path no longer depends on a classifier
// that cannot say "I do not know this".
import type { Side, SupportedSymbol } from "./types.ts";

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

/** One provider row, date carried as the label's UTC-midnight instant. */
export type DatedTreasuryRow = {
  dateMs: number;
  tenYear: number;
  twoYear: number;
};

/**
 * What the Treasury curve is allowed to say about a market.
 *
 * This replaces four hand-typed Sets and two regexes on the symbol NAME. All
 * six were exhaustive over the 59-symbol roster the day they were written
 * (2026-07-01) and stopped being exhaustive on 2026-08-06, when nineteen
 * futures were onboarded and this file was not touched. Nothing noticed for
 * five weeks, because nothing could: a Set states what it contains and never
 * what it omits.
 *
 * The regexes were the worse half. `getUsdStrengthSide` tested whether a
 * symbol LOOKED like a currency pair — `/^[A-Z]{3}USD$/` — and ran before
 * every Set, so it claimed 30 markets of which only SEVEN are currency
 * pairs, and it would claim any future ticker of that shape sight unseen. It
 * routed gold, bitcoin and the Russell by symbol length: MGCUSD is six
 * characters and took the regex, GCUSD is five and took the metals Set. The
 * same metal, one contract size apart, through two different branches.
 *
 * It never produced a wrong side, because "USD is the quote leg, so dollar
 * strength presses the pair" and "USD-priced asset falls as the discount rate
 * rises" happen to agree on this roster. `usd-quote` and `rate-inverse` are
 * kept DISTINCT here for exactly that reason: the agreement is a coincidence
 * of the current membership, recorded nowhere, and collapsing them would
 * remove the only place a future divergence could become visible.
 *
 * Keyed on `symbolMap` — the population the analysis door actually admits via
 * `isKnownSymbol` — and NOT on `defaultScanSymbols`, which subtracts
 * contract-size variants the door still accepts. MGCUSD is the difference, and
 * a table derived from the scan roster would have omitted a market that is
 * scored today. Deriving from the wrong population is the same defect one
 * level up.
 *
 * Every entry states a reason, and the `none` reasons are the point: an
 * omission that carries no reason is indistinguishable from an oversight,
 * which is the whole history of the Sets this replaces.
 */
export type MacroRateRole =
  /** USD is the base leg — rising rates lift the pair. */
  | "usd-base"
  /** USD is the quote leg — rising rates press the pair. */
  | "usd-quote"
  /** Priced inversely to the long rate — rising rates press it. */
  | "rate-inverse"
  /** No direction; a −1 penalty on a large move, and nothing otherwise. */
  | "energy-shock"
  /** No rate rule. `why` carries the decision, or the open question. */
  | "none";

export type MacroRateRoleEntry = { role: MacroRateRole; why: string };

export const MACRO_RATE_ROLE_BY_SYMBOL: Record<string, MacroRateRoleEntry> = {
  AAVEUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  ADAUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  ALGOUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  ARWUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  ASX: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  ATOMUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  AUDCAD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  AUDCHF: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  AUDJPY: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  AUDNZD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  AUDUSD: { role: "usd-quote", why: "USD is the quote leg, so dollar strength presses the pair." },
  AVAXUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  BCHUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  BNBUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  BTCUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  BZUSD: { role: "energy-shock", why: "Crude complex: no stated direction, a large-move penalty only." },
  CADCHF: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  CADJPY: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  CAKEUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  CHFJPY: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  CLUSD: { role: "energy-shock", why: "Crude complex: no stated direction, a large-move penalty only." },
  DASHUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  DAX: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  DOGEUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  DOTUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  DOW: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  DYDXUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  EGLDUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  ESUSD: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  ETCUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  ETHUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  EURAUD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  EURCAD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  EURCHF: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  EURGBP: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  EURJPY: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  EURNZD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  EURUSD: { role: "usd-quote", why: "USD is the quote leg, so dollar strength presses the pair." },
  FILUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  GBPAUD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  GBPCAD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  GBPCHF: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  GBPJPY: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  GBPNZD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  GBPUSD: { role: "usd-quote", why: "USD is the quote leg, so dollar strength presses the pair." },
  GCUSD: { role: "rate-inverse", why: "Monetary metal: a real-rate asset, which is what this set was named for." },
  GFUSX: { role: "none", why: "Livestock: herd cycle and feed driven, with no first-order claim from the US Treasury curve." },
  GRTUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  HBARUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  HEUSX: { role: "none", why: "Livestock: herd cycle and feed driven, with no first-order claim from the US Treasury curve." },
  HGUSD: { role: "none", why: "Copper is industrial, not monetary. Excluded deliberately: the metals set admitted every precious metal and left this one out, which is a decision written in the set's own composition — but never restated, so it is recorded here." },
  HOUSD: {
    role: "energy-shock",
    why:
      "Refined product (heating oil): its flat price is crude plus a crack spread, and the crack is the LESS macro-sensitive half — so a rate shock reaching crude reaches this near one-for-one. Onboarded 2026-08-06 in the same batch as the crude already carrying the penalty. NOTE: the −1 magnitude it now inherits has never been measured anywhere in this repo; this change corrects the population of an existing rule and is not a licence to retune it.",
  },
  IMXUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  LEUSX: { role: "none", why: "Livestock: herd cycle and feed driven, with no first-order claim from the US Treasury curve." },
  LINKUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  LTCUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  MGCUSD: { role: "rate-inverse", why: "Monetary metal: a real-rate asset, which is what this set was named for." },
  NEARUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  NGUSD: { role: "energy-shock", why: "Crude complex: no stated direction, a large-move penalty only." },
  NIKKEI: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  NQUSD: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  NSDQ: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  NZDCAD: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  NZDCHF: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  NZDJPY: { role: "none", why: "No USD leg, so a US-Treasury reading has no first-order claim on this cross. Derivable from symbolCurrencies, and stated here so the table stays exhaustive." },
  NZDUSD: { role: "usd-quote", why: "USD is the quote leg, so dollar strength presses the pair." },
  PAUSD: {
    role: "rate-inverse",
    why:
      "Monetary metal, ruled 2026-09-01 on the criterion the set had always applied without stating it: the metals admitted here move inverse to the ten-year and the one excluded by name moves with it. Measured, daily return on same-day ten-year change over 2013-2026: -0.018 %/bp (t -2.35, n~3410), against declared-industrial HGUSD at +0.017 (t +3.46). Significantly negative, so the monetary side. Magnitude runs near half the gold and silver betas and `role` has no dial for that, so membership is what this records and nothing more. docs/research/macro-role-rate-beta-2026-09-01.md.",
  },
  PLUSD: {
    role: "rate-inverse",
    why:
      "Monetary metal, ruled 2026-09-01 on the criterion the set had always applied without stating it: the metals admitted here move inverse to the ten-year and the one excluded by name moves with it. Measured, daily return on same-day ten-year change over 2013-2026: -0.026 %/bp (t -4.40, n~3410), against declared-industrial HGUSD at +0.017 (t +3.46). Significantly negative, so the monetary side. Magnitude runs near half the gold and silver betas and `role` has no dial for that, so membership is what this records and nothing more. docs/research/macro-role-rate-beta-2026-09-01.md.",
  },
  RBUSD: {
    role: "energy-shock",
    why:
      "Refined product (RBOB gasoline): its flat price is crude plus a crack spread, and the crack is the LESS macro-sensitive half — so a rate shock reaching crude reaches this near one-for-one. Onboarded 2026-08-06 in the same batch as the crude already carrying the penalty. NOTE: the −1 magnitude it now inherits has never been measured anywhere in this repo; this change corrects the population of an existing rule and is not a licence to retune it.",
  },
  RTYUSD: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  SIUSD: { role: "rate-inverse", why: "Monetary metal: a real-rate asset, which is what this set was named for." },
  SOLUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  SP: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  THETAUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  TRUMPUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  TRXUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  UNIUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  USDCAD: { role: "usd-base", why: "USD is the base leg, so dollar strength lifts the pair." },
  USDCHF: { role: "usd-base", why: "USD is the base leg, so dollar strength lifts the pair." },
  USDJPY: { role: "usd-base", why: "USD is the base leg, so dollar strength lifts the pair." },
  WTI: { role: "energy-shock", why: "Crude complex: no stated direction, a large-move penalty only." },
  XAGUSD: { role: "rate-inverse", why: "Monetary metal: a real-rate asset, which is what this set was named for." },
  XAUUSD: { role: "rate-inverse", why: "Monetary metal: a real-rate asset, which is what this set was named for." },
  XLMUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  XMRUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  XRPUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  XTZUSD: { role: "rate-inverse", why: "USD-priced risk asset, sensitive to the discount rate." },
  YMUSD: { role: "rate-inverse", why: "Equity index, discounted at the long rate." },
  ZBUSD: { role: "rate-inverse", why: "Treasury future: its price IS the yield, by the price-yield identity." },
  ZCUSX: { role: "none", why: "Grain: supply and weather driven, with no first-order claim from the US Treasury curve." },
  ZFUSD: {
    role: "rate-inverse",
    why:
      "Treasury future (5-year note): its price IS the yield, by the price-yield identity. correlationGroups.treasury_futures already named all four tenors one curve that moves \"together far more than they diverge\" while this table gave the rule to two of them; that split was roster drift from the 2026-08-06 onboarding, never a decision.",
  },
  ZLUSX: { role: "none", why: "Grain: supply and weather driven, with no first-order claim from the US Treasury curve." },
  ZMUSD: { role: "none", why: "Grain: supply and weather driven, with no first-order claim from the US Treasury curve." },
  ZNUSD: { role: "rate-inverse", why: "Treasury future: its price IS the yield, by the price-yield identity." },
  ZOUSX: { role: "none", why: "Grain: supply and weather driven, with no first-order claim from the US Treasury curve." },
  ZRUSD: { role: "none", why: "Grain: supply and weather driven, with no first-order claim from the US Treasury curve." },
  ZSUSX: { role: "none", why: "Grain: supply and weather driven, with no first-order claim from the US Treasury curve." },
  ZTUSD: {
    role: "rate-inverse",
    why:
      "Treasury future (2-year note): its price IS the yield, by the price-yield identity. correlationGroups.treasury_futures already named all four tenors one curve that moves \"together far more than they diverge\" while this table gave the rule to two of them; that split was roster drift from the 2026-08-06 onboarding, never a decision.",
  },
};

/**
 * The role for a symbol, normalized the way the rest of the analyzer
 * normalizes.
 *
 * An unlisted symbol returns `none` rather than throwing. A live scan on an
 * ad-hoc symbol must not crash, and `none` is exactly what the four Sets did
 * with an unknown market anyway. The refusal belongs in CI, where
 * tests/macroRates.test.ts derives the key space from symbolMap and fails on
 * the next onboarding batch — not five weeks later.
 */
export function getMacroRateRole(symbol: string): MacroRateRoleEntry {
  return MACRO_RATE_ROLE_BY_SYMBOL[normalizeSymbol(symbol)] ??
    { role: "none", why: "Not in symbolMap; no role is stated for it." };
}

export function calculateMacroRateAdjustment(
  symbol: SupportedSymbol,
  side: Side,
  context: MacroRateContext,
): MacroRateAdjustment {
  if (
    context.source === "unavailable" ||
    context.tenYearChangeBps === null ||
    // 4 bp: UNDERIVED. Nothing in this repo measured it, and it is the dead
    // band that decides whether the macro term participates at all. It is also
    // the number most exposed to rate LEVEL — a large daily move at a 0.5%
    // ten-year and routine at 4.3% — and nothing ties it to level or to
    // realised volatility. `tenYearYield` now rides on every emitted row so a
    // valid corpus can say which regime each decision sat in; no fix shape is
    // pre-registered here, because pre-registering one is how an unmeasured
    // mechanism becomes a finding (amendment 39).
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
    // 8 bp: UNDERIVED, and the same line appears again below. The -1 beside it
    // is NOT a fifth undocumented number — it already carries #415's treatment
    // twice in this file, in the HOUSD and RBUSD role entries above, each of
    // which says in terms that the magnitude was never measured here. Quoting
    // that sentence a third time would make it look like a third market.
    const shockPenalty =
      getMacroRateRole(normalizedSymbol).role === "energy-shock" &&
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

  // 8 bp AND the 2:1 pair: both UNDERIVED, and the pair was the one this file's
  // own register entry never named while calling the surface handled. It is
  // also the source of the "plus or minus 2" bound that entry leans on — and
  // that bound is misleading as a low-stakes argument: this addend feeds the
  // acceptance gate, the scan's primary sort and the correlated-sibling
  // suppressor, so within two points of a class threshold it is publish-or-
  // refuse rather than a nudge. Class thresholds run 20 to 85.
  const magnitude = Math.abs(context.tenYearChangeBps) >= 8 ? 2 : 1;
  const aligned = side === preferredSide;
  return {
    adjustment: aligned ? magnitude : -magnitude,
    detail: buildRateDetail(context, preferredSide, aligned),
    stance: aligned ? "aligned" : "against",
  };
}

/**
 * The one context construction, shared by the live fetch (macroContext.ts,
 * most-recent two rows of the response) and the sweep (E6: most-recent two
 * VISIBLE rows at each decision instant). The two arguments are (latest,
 * previous) — note the callers hold OPPOSITE array orders (#364 round 6,
 * smaller): the live fetch sorts its response DESCENDING and passes
 * rows[0]/rows[1], while the sweep's rolling store is ASCENDING (the
 * visibility pointer requires it) and passes [pointer−1]/[pointer−2].
 * This function sees only the pair; each caller owns its ordering, and
 * the sweep's is executed end-to-end in tests/sweep.test.ts.
 */
/**
 * How old the newest Treasury label may be before the curve stops being
 * decision-time information.
 *
 * SEVEN DAYS, and the number is a publication-calendar fact rather than a
 * tolerance: Treasury publishes on business days, so the curve legitimately
 * gaps three calendar days across a weekend and four across a midweek
 * holiday. A predicate asking whether the two rows are ADJACENT would
 * false-positive every Monday — and under amendment 31 an unjustified refusal
 * is a coverage loss, not a safe default. Seven clears the longest lawful gap
 * and catches a feed that has stopped.
 *
 * The sweep already refuses on exactly this bound, twice, inline. This is the
 * same bound as ONE definition so the live path cannot drift from it — a
 * second copy in macroContext would be a third number to keep in step.
 */
export const TREASURY_MAX_STALE_MS = 7 * 86_400_000;

/**
 * Whether the newest Treasury label is too old to score against, measured
 * from its LABEL DATE — not from when it became visible.
 *
 * The clock matters and is stated because the two differ by up to a day:
 * `treasuryVisibleAtMs` moves a label to the New York midnight AFTER it, so a
 * bound taken there would run a day tighter than this one. The label date is
 * the right basis for staleness because what has stopped, when a feed stops,
 * is the labelling — and both callers can name a label date while only the
 * sweep has a visibility instant.
 *
 * A 200 is not freshness. `fetchMacroRateContext` records a provider outage
 * for a missing key, a non-200, a non-array, a short history and a throw —
 * and never for a successful response carrying a stale tail, which keeps
 * `source: "fmp_treasury_rates"` and scores every setup off a pair that may
 * straddle a large move. The identical lesson was mechanised for the calendar
 * job in migration 20260729040000_scheduled_sync_watchdog.sql, whose own
 * comment reads "Cron success is not job success", and was never carried to
 * the Treasury curve beside it.
 */
export function treasuryCurveStaleMs(
  latestLabelMs: number,
  asOfMs: number,
): number {
  return asOfMs - latestLabelMs;
}

export function treasuryCurveIsStale(
  latestLabelMs: number,
  asOfMs: number,
): boolean {
  return treasuryCurveStaleMs(latestLabelMs, asOfMs) > TREASURY_MAX_STALE_MS;
}

export function treasuryContextFromRows(
  latest: DatedTreasuryRow,
  previous: DatedTreasuryRow,
): MacroRateContext {
  return {
    curveSpreadBps: roundBps((latest.tenYear - latest.twoYear) * 100),
    latestDate: isoDateFromMs(latest.dateMs),
    previousDate: isoDateFromMs(previous.dateMs),
    source: "fmp_treasury_rates",
    tenYearChangeBps: roundBps((latest.tenYear - previous.tenYear) * 100),
    tenYearYield: latest.tenYear,
    twoYearYield: latest.twoYear,
  };
}

// E6: when a Treasury row becomes DECISION-TIME information. The daily
// mark exists at the New York close and providers publish it that
// evening, but the exact publication minute is not reconstructible
// historically — so the sweep admits a row only from New York midnight
// after its label date. That is deliberately conservative: for most of
// each trading day the live analyzer's "latest" row is also yesterday's
// (the fetch sees today's row only after publication), so the offline
// join errs a few evening hours later than live, never earlier. The
// completed-daily-bar gate (2a) draws its visibility line by the same
// principle.
const visibleAtCache = new Map<number, number>();

export function treasuryVisibleAtMs(dateMs: number): number {
  const cached = visibleAtCache.get(dateMs);
  if (cached !== undefined) {
    return cached;
  }
  // dateMs is the label's UTC midnight; +24h lands on the FOLLOWING
  // label's UTC midnight, whose UTC calendar parts name the day whose New
  // York midnight (04:00-05:00 UTC, DST-aware via bars.ts) we want.
  const next = new Date(dateMs + 86_400_000);
  const visibleAt = newYorkWallClockToUtcMs(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
  );
  visibleAtCache.set(dateMs, visibleAt);
  return visibleAt;
}

/** Parse one provider treasury row; null when a required field is absent. */
export function parseTreasuryRow(value: unknown): DatedTreasuryRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  // dateMs is CONTRACTUALLY the label's UTC midnight — treasuryVisibleAtMs
  // adds 24h and reads UTC calendar parts, so an off-midnight instant
  // could name the wrong day. Date.parse alone cannot guarantee that
  // (#364 round 1, finding 6): V8 parses "2026-08-11 00:00:00" — space
  // separator — as LOCAL time, making the offline join TZ-dependent. So
  // the label is taken as exactly its leading YYYY-MM-DD (a bare ISO
  // date parses as UTC by spec), and a row whose date does not start
  // with one is refused rather than guessed at.
  const label = String(row.date ?? row.calendarDate ?? "").slice(0, 10);
  const dateMs = /^\d{4}-\d{2}-\d{2}$/.test(label)
    ? Date.parse(label)
    : Number.NaN;
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

  if (!Number.isFinite(dateMs) || tenYear === null || twoYear === null) {
    return null;
  }
  // Plausibility, not just shape (#364 round 8, finding 3): US Treasury
  // tenor yields since the 2013 floor sit in (0, ~6]; the 1981 all-time
  // peak was 15.8%. A value at or below 0 (the null-coercion signature)
  // or at 25+ is provider corruption, and a refused row raises the I11
  // outage path live rather than minting a signal.
  if (tenYear <= 0 || tenYear >= 25 || twoYear <= 0 || twoYear >= 25) {
    return null;
  }
  return { dateMs, tenYear, twoYear };
}

export function unavailableContext(reason: string): MacroRateContext {
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

function getRateAlignedSide(
  symbol: string,
  tenYearChangeBps: number,
): Side | null {
  const rising = tenYearChangeBps > 0;
  // One lookup, no branch ORDER. The order was itself a defect: the regex ran
  // first and shadowed every Set membership it happened to match, so three
  // entries were unreachable and nothing said so.
  switch (getMacroRateRole(symbol).role) {
    case "usd-base":
      return rising ? "buy" : "sell";
    case "usd-quote":
    case "rate-inverse":
      return rising ? "sell" : "buy";
    case "energy-shock":
    case "none":
      return null;
  }
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
    const raw = row[key];
    // #364 round 8, finding 3: Number(null) and Number("") are both 0 —
    // a null tenor would otherwise parse as a 0.0% yield, and one such
    // row swings tenYearChangeBps by hundreds of bps in both directions
    // while passing every continuity check (the chunk guard, the
    // driver's pre-flight, the curve-evidence door) and being pinned
    // into the rolling store permanently. Absent-shaped values are
    // skipped, never coerced.
    if (raw === null || raw === undefined || raw === "") {
      continue;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export function isoDateFromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function roundBps(value: number) {
  return Number(value.toFixed(2));
}
