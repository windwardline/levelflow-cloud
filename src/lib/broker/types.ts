// Spec §19a. Broker reference data ships as TypeScript data modules, not
// database rows: versioned, reviewable, diffable, and pinned by test in the same
// change set that edits it — the property tests/calibrationState.test.ts already
// buys for the calibration constants. A table would move the numbers out of code
// review and out of CI.
//
// The boundary at the head of the design document governs every value in this
// directory: a number enters by exactly three routes — E8 publishes it,
// Levelflow derives it by a method E8 publishes from data Levelflow already
// holds, or the owner observes it directly on the broker's live platform and
// it is recorded dated and attributed (owner ruling, 2026-08-02). There is no
// fourth. Where the three run out, the row carries null and the surface
// renders a word (§19e) — the refusal is the feature working.

/**
 * Where a value came from. Travels with the value, never with the table, so a
 * later reviewer can re-verify one number without re-deriving the whole map
 * (crossmap §5.3).
 *
 * `article` is the E8 help-centre article ID that publishes the value, or null
 * when the source is a non-article E8 page (the e8x trading-symbols dashboard),
 * a verified observation, or the dossier alone.
 *
 * `derived` is the fourth tag and the second this feature adds to the
 * dossiers' three (§19a rule 1). It marks a value E8 does not print but
 * instructs the reader to compute. It is never a synonym for `primary`: it
 * carries the article publishing the METHOD, its inputs are Levelflow's own
 * in-roster quotes, and CI keeps the two tags distinguishable. A `derived` value
 * may support a `confirmed` row; a `secondary` or `dossier` value may not.
 *
 * `verified` is the fifth tag and the third admissible one (amendment 4, owner
 * ruling 2026-08-02). It marks a value the owner observed directly on the
 * broker's live platform: it carries no article and no url, and it carries a
 * non-null `observation` naming the date, the platform, and the live program
 * the observation was made under. It is never a synonym for `primary` either —
 * CI keeps the two distinguishable so a later reviewer can see at a glance
 * which numbers E8 wrote down and which the owner watched the platform do. A
 * `verified` value may support a `confirmed` row, and a `verified` observation
 * may establish tradability itself: the owner seeing an instrument tradable on
 * the live account is the same class of fact as E8 publishing that it is.
 * `secondary` and `dossier` remain inadmissible for either.
 */
export type Observation = {
  /** ISO date the owner made the observation. */
  date: string;
  /** Where it was seen: "TradeLocker" | "E8X dashboard" | "E8 purchase screen". */
  platform: string;
  /** The live account it was made on, e.g. "E8 Pro Forex". */
  program: string;
  /** What was seen, in the owner's own terms. */
  note: string | null;
};

export type Provenance = {
  article: string | null;
  tag: "primary" | "derived" | "verified" | "secondary" | "dossier";
  method: string | null;
  url: string | null; // null only when tag is "verified"
  observation: Observation | null; // required when tag is "verified", null otherwise
};

/** Null blocks. Null never defaults (§19a rule 2). */
export type Valued<T> = { source: Provenance; value: T | null };

/**
 * The unit is tagged because it is genuinely polymorphic (§19a rule 3). Forex
 * publishes a contract size in units; index CFDs publish a per-point
 * multiplier; futures publish tick size plus dollars per tick. SP500's `20` and
 * MGC's `$1.00` are not the same kind of number and one numeric column cannot
 * hold both.
 */
export type QuoteUnit =
  | { contractSize: Valued<number>; kind: "forex_contract" }
  | { kind: "index_points"; pointsPerLot: Valued<number> }
  | { kind: "futures_tick"; tickSize: Valued<number>; valuePerTick: Valued<number> };

export type Tradability = "confirmed" | "not_offered" | "not_published" | "unconfirmed";

export type ProgramLine =
  | "one"
  | "one_crypto"
  | "pro_forex"
  | "pro_crypto"
  | "signature_forex"
  | "signature_crypto"
  | "signature_futures"
  | "zero"
  | "zero_futures_starter"
  | "zero_futures_max";

/**
 * What a program line trades, and therefore which caps and which unit apply.
 * `cfd_forex` and `cfd_crypto` are both CFD families — they differ in universe
 * (5514977: the crypto lines are "Crypto only") and in leverage table
 * (5514982's second table has no forex/indices/metals/energies columns).
 */
export type ProgramFamily = "cfd_forex" | "cfd_crypto" | "futures";

/** E8's own words are "SimFi™ Challenge" and "SimFi™ Performance" (§19b). */
export type Stage = "challenge" | "performance";

/** The leverage classes E8's own tables use (5514982, both tables). */
export type LeverageClass =
  | "forex"
  | "indices"
  | "metals"
  | "energies"
  | "crypto"
  | "bitcoin"
  | "ethereum"
  | "other_crypto";

/**
 * The row, keyed on `(broker, program_line, levelflow_symbol)` — never on the
 * FMP symbol (`WTI`/`CLUSD` and `BRENT`/`BZUSD` share one FMP symbol each, so it
 * is not unique across the roster), and never on broker alone (the same
 * Levelflow symbol is tradable on E8 Signature Futures and untradable on E8 One,
 * and `GCUSD`/`MGCUSD`/`XAUUSD` reach one exposure through three instruments at
 * three contract sizes depending on the program bought — crossmap §5.1).
 */
export type BrokerInstrument = {
  broker: "e8";
  programLine: ProgramLine;
  levelflowSymbol: string;

  tradability: Tradability;
  tradabilitySource: Provenance;

  /**
   * Nothing renders this in wave 1 (§19a). The in-platform order-entry ticker
   * string is NOT PUBLISHED for every asset class — the slash format is the E8X
   * dashboard's display convention — and futures roots are [PRIMARY] but
   * Levelflow carries no contract month, so a rendered root would be an
   * incomplete order-entry symbol. The field exists for provenance and for the
   * join; tests/languageGuard.test.ts asserts no JSX reads it.
   */
  brokerSymbol: string | null;
  /** The second observed spelling, where E8's own pages disagree: E7, NQ-for-NG. */
  brokerSymbolAlt: string | null;
  brokerSymbolSource: Provenance | null;

  unit: QuoteUnit;
  /** A long broker instrument is a short Levelflow row (§19a: 6C, 6S, 6J). */
  inverted: boolean;
  /** FMP price axis -> broker quote axis. Null on a reciprocal axis (§19a's 6J). */
  priceScaleFactor: Valued<number>;

  /** Futures only; null blocks the cap and therefore the number. */
  marginPerContract: Valued<number>;
  /** CFD only; 50, or 20 for gold (9453396). */
  maxTicketLots: Valued<number>;
  /** The instrument that reaches this exposure elsewhere. Never substituted. */
  relatedExposure: string | null;
};

/**
 * §19e's rendered vocabulary, verbatim and complete. Four words, each naming a
 * different fact, and no two of them can be true at once.
 *
 * `not_published` and `unconfirmed` share one word deliberately: the states
 * differ in the data — one is E8's silence, the other is E8 contradicting
 * itself — but from the user's seat both are the identical fact, E8 has not
 * said. Four tradability states in the schema, two words for the three that
 * carry no number.
 */
export const SIZE_STATE_WORDS = {
  notOffered: "Not offered",
  notConfirmed: "Not confirmed",
  notPublished: "Not published",
  rateUnavailable: "Rate unavailable",
  // §19e's law is "a number or a state word, there is no third outcome", and a
  // size that rounds to zero was a third outcome wearing a number's clothes: it
  // renders "0" beside a live copy button and says nothing about why. The unit
  // is already on the label, so these two only have to carry "less than one".
  belowOneContract: "Below one contract",
  belowOneLot: "Below one lot",
} as const;

export type SizeStateWord = (typeof SIZE_STATE_WORDS)[keyof typeof SIZE_STATE_WORDS];
