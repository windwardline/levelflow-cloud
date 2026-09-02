// R0d: THE PER-SYMBOL BASELINE — what each market's data actually looks like,
// measured once and recorded, so a gate can judge a market against ITSELF
// instead of against a constant derived from its densest classmate.
//
// WHY THIS EXISTS. Every calibration defect this program has found is one
// shape: a threshold applied to a population it was not derived for. The
// crypto 5-minute floor is the clearest instance — 260 is 90.3% of a perfect
// 288 grid, set from two probes that both sat AT that ceiling and generalised
// to 33 symbols, while forex, metals, energies and indices all sit near 70% of
// their sparsest probe. DYDXUSD reads 249.4 rows/day and is honestly thin,
// adversarially verified four ways; it fails a floor no member of its class
// could have justified.
//
// Amendment 33 already required this and it was never built: "spans are
// measured first — per market, per timeframe — and recorded before anything
// consumes them."
//
// WHAT IT IS NOT. It carries measured DATA facts only: spans, densities,
// staleness, and whether a sample is too thin to support a figure. No trading
// parameter appears here. Those are per-symbol too (calibration.ts's
// SYMBOL_CALIBRATION_OVERRIDES) but they need R3's corpus, which exists since
// 2026-09-02 (docs/research/r3/, both arms) and is R4's to read; this is the
// prerequisite that lets R4 know each market's true data limits before
// deriving anything.
//
// KEYED ON THE PROVIDER SYMBOL, because that is the identity of the DATA. The
// engine's 97 markets resolve to 96 distinct FMP sources — WTI and CLUSD are
// two markets sharing one source, and eight more are renamed (ARWUSD -> ARUSD,
// the six indices, TRUMPUSD -> OTRUMPUSD). Keying on the engine name would
// derive one source's baseline twice and let the copies drift; it is also how
// nine markets ran under forex calibration in the 4c/4d corpus, because that
// universe carried provider spellings and getAssetType silently fell back.

export type TimeframeBaseline = {
  /** ISO date of the first bar in the reference era. */
  firstIso: string;
  /** ISO date of the last bar in the reference era. */
  lastIso: string;
  /** Bars in the reference era. */
  rows: number;
  /** Calendar days the era spans. */
  spanDays: number;
  /** Bars per calendar day over the era — the figure a gate compares against. */
  rowsPerDay: number;
  /**
   * Amendment 25: too thin to support a figure at all. A starved baseline is
   * recorded so a later derivation can tell "this market is thin" from "this
   * market was not measured" — the two look identical in an absent record and
   * demand different remedies.
   */
  starved: boolean;
};

export type MarketBaseline = {
  /** The FMP source. The identity of the data. */
  providerSymbol: string;
  /** Engine markets this source serves; more than one where they share it. */
  markets: string[];
  assetType: string;
  /**
   * THE ERA IS FIXED, AND THAT IS THE WHOLE POINT. A baseline recomputed over
   * a rolling window re-baselines itself: a feed that thins slowly lowers its
   * own reference every run and never trips. Re-derivation compares AGAINST
   * this era and does not move it; moving it is a deliberate act that shows in
   * the artifact's diff.
   */
  referenceEra: { fromIso: string; toIso: string };
  /**
   * The generation this record was cut in. Records from different generations
   * are comparable within themselves but not necessarily with each other, so a
   * consumer that mixes them must say so rather than assume.
   */
  derivedAt: string;
  timeframes: Record<string, TimeframeBaseline | null>;
};

export type BaselineArtifact = {
  /** Bumped when the SHAPE changes, so a stale artifact refuses rather than misreads. */
  version: number;
  derivedAt: string;
  /** The clock the underlying stores were normalised under. */
  barClock: string;
  baselines: MarketBaseline[];
};

export const BASELINE_ARTIFACT_VERSION = 1;

/**
 * How far a market's recent density may fall below its own baseline before the
 * feed is judged to have degraded.
 *
 * 0.70, and it is not a new number: it is the tolerance the four honestly
 * derived class floors already encode. Measured at the engine-symbol grain,
 * forex sits at 136% of its thinnest bound member, metals 139%, energies 139%,
 * indices 138% — i.e. each floor sits near 70% of the thinnest market it
 * binds. Crypto alone sits at 96%, which is the anomaly this baseline exists
 * to retire rather than a fifth data point.
 */
// NOT THE DOOR'S THRESHOLD, and it must not become one. R0d — the crypto
// floor this module was written to retire — was closed on 2026-08-30 by
// re-deriving the CLASS floor from the measured population
// (docs/research/five-minute-density-census-2026-08-30.json), not by adopting
// a per-symbol baseline. The per-symbol route needed three unmeasured
// constants and replaced the door's only non-ratio instrument with a second
// ratio computed from the store it judges.
//
// This constant is consumed only by `derive-baselines.ts`, which produces a
// reviewed artifact that does not yet exist. It has no consumer in the door
// and no test standing over it; anyone wiring it into `assertFiveMinuteDensity`
// is re-opening a question that was answered with measurement.
export const BASELINE_DEGRADATION_LIMIT = 0.7;

/**
 * Below this many bars in a timeframe's era, the baseline is STARVED and
 * carries no usable rate. Amendment 25: a market is never judged on a starved
 * sample, and the record must say which it is.
 */
export const BASELINE_MIN_ROWS = 500;

export function baselineFor(
  artifact: BaselineArtifact,
  providerSymbol: string,
): MarketBaseline | undefined {
  return artifact.baselines.find((b) => b.providerSymbol === providerSymbol);
}
