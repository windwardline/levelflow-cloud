import {
  instrumentPriceBridge,
  resolveBridge,
  usdPerQuoteBridge,
} from "./bridging";
import { findBrokerInstrument, leverageClassFor } from "./instruments";
import { allowedMarginFor, getProgramLine } from "./programs";
import {
  SIZE_STATE_WORDS,
  type BrokerInstrument,
  type ProgramLine,
  type SizeStateWord,
  type Stage,
  type Tradability,
  type Valued,
} from "./types";

// Spec §19c. One formula, four gates, one rounding rule. Every step either
// produces a number or produces a state word (§19e) — there is no third outcome
// and no default.
//
// Pure: the caller passes the setup it already has and the quotes it already
// holds. Nothing here fetches, and the trade-analyzer edge function does not read
// any of it — sizing is a client computation over data the client already holds.

/** Futures step is 1 contract, exact and confirmed (13004287's own worked example). */
export const FUTURES_STEP = 1;

/**
 * CFD step, verified, not assumed: the owner confirmed it on their live E8 Pro
 * Forex account in TradeLocker on 2026-08-02 — "On forex accounts, I can
 * confirm the smallest is 0.01." E8 still publishes no minimum lot increment on
 * any page, and it no longer needs to (§19c step 7, §20i ruling 2, Appendix A).
 *
 * The print record that forced the old assumption is kept for the reader: the
 * smallest lot E8 names in print is 0.1 (9453425, "even a 0.1-lot micro-trade
 * counts") and its worked examples use 0.3 and 5 lots (14722843), which
 * distinguished nothing — which is why the value came in unconfirmed before the
 * owner watched the platform. That 0.1 would have been wrong is corroboration,
 * not justification: a $5,000 account at 0.50% risk with a 30-pip EURUSD stop
 * sizes to 0.083 lots, which a 0.1 step floors to zero.
 *
 * The observation's scope is the ACCOUNT, not the instrument list. It was made
 * on a forex-line account, so the 28 pairs carry the verified step. XAUUSD keeps
 * 0.01 as its working step and sits first in Appendix A's queue.
 */
export const CFD_LOT_STEP: Valued<number> = {
  source: {
    article: null,
    method: null,
    observation: {
      date: "2026-08-02",
      note: "On forex accounts, I can confirm the smallest is 0.01.",
      platform: "TradeLocker",
      program: "E8 Pro Forex",
    },
    tag: "verified",
    url: null,
  },
  value: 0.01,
};

/** The unwrapped value, kept so `sizeInstrument`'s arithmetic is unchanged. */
export const CFD_STEP = CFD_LOT_STEP.value!;

export type SizeUnit = "lots" | "contracts";

/**
 * The unit in the row's label, which a blocked row needs as much as a priced one:
 * §20j allows `Size · lots` and `Size · contracts` and no bare `Size`, and the
 * program family answers it whether or not a number resolves.
 */
export function sizeUnitFor(programLine: ProgramLine): SizeUnit {
  return getProgramLine(programLine)?.family === "futures" ? "contracts" : "lots";
}

export type SizeResult =
  | { kind: "size"; units: number; step: number; unit: SizeUnit; caps: number[] }
  | { kind: "blocked"; word: SizeStateWord };

export type SizingContext = {
  accountSize: number;
  entryPrice: number;
  /** Levelflow's own in-roster quotes, keyed by Levelflow symbol. Nothing else. */
  quotes: Readonly<Record<string, number | null | undefined>>;
  riskPercent: number;
  stage: Stage;
  stopLoss: number;
};

export type SizeInput = SizingContext & {
  levelflowSymbol: string;
  programLine: ProgramLine;
};

/** §19e's table, as a function. Two words for the three states that carry no number. */
export function stateWordForTradability(
  tradability: Tradability,
): SizeStateWord | null {
  switch (tradability) {
    case "not_offered":
      return SIZE_STATE_WORDS.notOffered;
    case "not_published":
    case "unconfirmed":
      return SIZE_STATE_WORDS.notConfirmed;
    case "confirmed":
      return null;
  }
}

function blocked(word: SizeStateWord): SizeResult {
  return { kind: "blocked", word };
}

/**
 * Round DOWN to the broker's step. Always down, never nearest: rounding up spends
 * more than the risk budget authorizes.
 *
 * The epsilon defeats float representation error alone — 0.83 / 0.01 is
 * 82.99999999999999, and flooring that would give back a whole step on an exact
 * input. It can admit at most a relative 1e-9 over the raw value, which is why the
 * budget invariant is asserted at that tolerance rather than at zero.
 */
export function floorToStep(value: number, step: number): number {
  const steps = Math.floor(value / step + 1e-9);
  const decimals = step < 1 ? (String(step).split(".")[1]?.length ?? 0) : 0;
  return Number((steps * step).toFixed(decimals));
}

/**
 * §19c step 4. The stop distance crosses to the broker's quote axis before meeting
 * the per-unit value. On a reciprocal axis the exact distance is
 * `|1/entry - 1/stop|`, which is `stopDistance / referencePrice²` at the geometric
 * mean of the two prices — the `priceScaleFactor` form the spec states, evaluated
 * where it is exact rather than approximate.
 *
 * Built, property-tested, and unused by any confirmed row in wave 1: nothing sizes
 * an inverted instrument until a confirmed inverted row exists (§19a).
 */
export function invertedReferencePrice(entryPrice: number, stopLoss: number): number {
  return Math.sqrt(entryPrice * stopLoss);
}

export function invertedPriceScaleFactor(
  entryPrice: number,
  stopLoss: number,
): number {
  const reference = invertedReferencePrice(entryPrice, stopLoss);
  return 1 / (reference * reference);
}

export function invertedStopDistance(entryPrice: number, stopLoss: number): number {
  return Math.abs(1 / entryPrice - 1 / stopLoss);
}

/**
 * The dollar value of one 1.0 move on the row's own price axis, per 1.0 unit.
 *
 * **Known gap, by design not by oversight (Task 17b fix round 1 review,
 * 2026-08-05).** The `futures_tick` branch below has no independent
 * knowledge of `instruments.ts`'s `UNRECONCILED_TICK_AXIS`. `6J`'s and
 * `6M`'s own published tick/value ARE both non-null (0.0000001/$12.50 and
 * 0.00005/$5.00) but self-inconsistent against their 6E/6S siblings by
 * 1,000x — amendment 22's "self-consistent" clause excludes them from
 * sizing, but today that exclusion lives only in `instruments.ts`'s
 * `hasPublishedSizeInputs` (which nothing in this file calls). If a row
 * ever reaches this function with `brokerSymbol` `"6J"` or `"6M"` and
 * `tradability: "confirmed"`, this branch computes a real (wrong) number
 * from the unreconciled figures rather than blocking — it MUST NOT be
 * reached for either symbol. Unreachable today: no Levelflow symbol maps to
 * either E8 symbol (`FUTURES_MAPPINGS`/`INVERTED_FX` in `instruments.ts`),
 * so production code never hands this function such a row. The real
 * runtime gate belongs here (or in `sizeInstrument` above it) and lands
 * whenever a future futures-onboarding change first wires either symbol to
 * a Levelflow row — until then, this comment is the pointer, not the fix.
 */
function perUnitValue(
  row: BrokerInstrument,
  quotes: SizingContext["quotes"],
): { value: number | null; word: SizeStateWord | null } {
  switch (row.unit.kind) {
    case "futures_tick": {
      const tickSize = row.unit.tickSize.value;
      const valuePerTick = row.unit.valuePerTick.value;
      if (tickSize === null || valuePerTick === null || tickSize <= 0) {
        return { value: null, word: SIZE_STATE_WORDS.notPublished };
      }
      return { value: valuePerTick / tickSize, word: null };
    }
    case "index_points": {
      const pointsPerLot = row.unit.pointsPerLot.value;
      if (pointsPerLot === null) {
        return { value: null, word: SIZE_STATE_WORDS.notPublished };
      }
      return { value: pointsPerLot, word: null };
    }
    case "forex_contract": {
      const contractSize = row.unit.contractSize.value;
      if (contractSize === null) {
        return { value: null, word: SIZE_STATE_WORDS.notPublished };
      }
      const bridge = usdPerQuoteBridge(row.levelflowSymbol);
      if (!bridge) {
        return { value: null, word: SIZE_STATE_WORDS.notPublished };
      }
      const usdPerQuote = resolveBridge(bridge, quotes);
      if (usdPerQuote === null) {
        return { value: null, word: SIZE_STATE_WORDS.rateUnavailable };
      }
      return { value: contractSize * usdPerQuote, word: null };
    }
  }
}

/** The contract size E8's max-position formula divides by, per unit kind. */
function marginContractSize(row: BrokerInstrument): number | null {
  switch (row.unit.kind) {
    case "forex_contract":
      return row.unit.contractSize.value;
    case "index_points":
      return row.unit.pointsPerLot.value;
    case "futures_tick":
      return null;
  }
}

/**
 * §19c step 6. Every cap that applies must be computable, or there is no number.
 *
 * On a CFD line there are two: the flat ticket cap, and E8's own max-position
 * formula — which is also, algebraically, the margin-feasibility test, because E8's
 * only enforced margin line is the stop-out at Margin Level <= 100% and Margin
 * Level >= 100% at entry is exactly usedMargin <= equity. The cap and the
 * feasibility check are one computation, not two. E8's coaching bands are
 * explicitly advisory and produce no clamp.
 *
 * On a futures line there is one, and it is not a contract count: 10155917
 * publishes "Allowed margin / Margin per contract = size of the position".
 */
function capsFor(
  row: BrokerInstrument,
  input: SizingContext,
): { caps: number[] | null; word: SizeStateWord | null } {
  const program = getProgramLine(row.programLine)!;

  if (program.family === "futures") {
    const marginPerContract = row.marginPerContract.value;
    const allowedMargin = allowedMarginFor(
      row.programLine,
      input.accountSize,
      input.stage,
    );
    if (
      marginPerContract === null || marginPerContract <= 0 || allowedMargin === null
    ) {
      return { caps: null, word: SIZE_STATE_WORDS.notPublished };
    }
    return { caps: [Math.floor(allowedMargin / marginPerContract)], word: null };
  }

  const ticketCap = row.maxTicketLots.value;
  const leverageClass = leverageClassFor(row.levelflowSymbol, program.family);
  const leverage = leverageClass ? program.leverage[leverageClass]?.value ?? null : null;
  const contractSize = marginContractSize(row);
  const bridge = instrumentPriceBridge(row.levelflowSymbol);
  if (
    ticketCap === null || leverage === null || contractSize === null ||
    contractSize <= 0 || !bridge
  ) {
    return { caps: null, word: SIZE_STATE_WORDS.notPublished };
  }
  const instrumentPrice = resolveBridge(bridge, input.quotes);
  if (instrumentPrice === null) {
    return { caps: null, word: SIZE_STATE_WORDS.rateUnavailable };
  }
  const marginCap = (leverage * input.accountSize) / (instrumentPrice * contractSize);
  return { caps: [ticketCap, marginCap], word: null };
}

/**
 * The Size row's one entry point. Returns a number or one of §19e's four words.
 */
export function sizeSetup(input: SizeInput): SizeResult {
  const row = findBrokerInstrument(input.programLine, input.levelflowSymbol);
  if (!row) {
    // A market this broker has no row for at all. E8's own lists are what the rows
    // are generated from, so this is Levelflow's silence rather than E8's.
    return blocked(SIZE_STATE_WORDS.notConfirmed);
  }
  return sizeInstrument(row, input);
}

/**
 * The same computation against a row supplied directly, which is how the property
 * tests reach a nulled or synthetic row without one shipping in the data.
 */
export function sizeInstrument(
  row: BrokerInstrument,
  input: SizingContext,
): SizeResult {
  const tradabilityWord = stateWordForTradability(row.tradability);
  if (tradabilityWord) {
    return blocked(tradabilityWord);
  }

  const program = getProgramLine(row.programLine)!;
  const unit = sizeUnitFor(row.programLine);
  const step = program.family === "futures" ? FUTURES_STEP : CFD_STEP;

  // Step 1 — the risk budget, on the profile's tier. Every drawdown basis E8
  // publishes is the initial balance, so the tier is the right denominator rather
  // than a stale guess at an equity Levelflow cannot see.
  if (
    !Number.isFinite(input.accountSize) || input.accountSize <= 0 ||
    !Number.isFinite(input.riskPercent) || input.riskPercent <= 0
  ) {
    return blocked(SIZE_STATE_WORDS.notPublished);
  }
  const riskBudget = input.accountSize * (input.riskPercent / 100);

  // Step 2 — the stop distance, on the Levelflow price axis. The setup's own prices
  // are live quotes, so an unusable one is the fourth word rather than the third.
  if (
    !Number.isFinite(input.entryPrice) || input.entryPrice <= 0 ||
    !Number.isFinite(input.stopLoss) || input.stopLoss <= 0
  ) {
    return blocked(SIZE_STATE_WORDS.rateUnavailable);
  }

  // Step 3 — the value of one price unit, at the correct scale.
  const perUnit = perUnitValue(row, input.quotes);
  if (perUnit.value === null || perUnit.value <= 0) {
    return blocked(perUnit.word ?? SIZE_STATE_WORDS.notPublished);
  }

  // Step 4 — inversion, where a long broker instrument is a short Levelflow row.
  const stopDistance = row.inverted
    ? invertedStopDistance(input.entryPrice, input.stopLoss)
    : Math.abs(input.entryPrice - input.stopLoss);

  // Step 6 — the caps, all of them, as a minimum. Resolved before the raw size so a
  // published gap is reported as one even where the risk budget would bind first.
  const caps = capsFor(row, input);
  if (caps.caps === null) {
    return blocked(caps.word ?? SIZE_STATE_WORDS.notPublished);
  }

  // Step 5 — the raw size. A stop that is not a stop leaves the risk budget
  // unbinding, so Math.min falls through to the MARGIN cap: the largest position
  // the account can carry, sitting exactly on E8's stop-out line. EURUSD at a zero
  // stop distance sized to 26.08 lots — €2.6M notional on a $100,000 account, one
  // tick from a margin call. This was previously called the arithmetic answer
  // rather than a special case; the arithmetic answer to a degenerate price is a
  // state word, and step 2 already treats an unusable price that way.
  if (!(stopDistance > 0)) {
    return blocked(SIZE_STATE_WORDS.rateUnavailable);
  }
  const rawUnits = riskBudget / (stopDistance * perUnit.value);

  // Step 7 — round DOWN to the broker's step.
  const units = floorToStep(Math.min(rawUnits, ...caps.caps), step);

  // Step 8 — below one step is no size at all. Rounding down is correct and it
  // bottoms out at zero, which §19e's table has no room for: "0" renders as a
  // number beside a live copy button and tells the operator nothing about why the
  // setup is not takeable. It is not rare — on a $25,000 Signature Futures account
  // at the 0.50% default, every mapped market lands here, because one gold
  // contract risks $1,354 against a $125 budget and one E-mini $256. An operator
  // who reads 0 on a tradeable instrument buys one anyway, and one contract is
  // 135% of that account's entire drawdown allowance.
  //
  // The word names no unit. "Size · contracts" is already on the row's label, so
  // the value only has to carry the comparison the label cannot.
  if (units < step) {
    return blocked(SIZE_STATE_WORDS.belowOne);
  }
  return { kind: "size", units, step, unit, caps: caps.caps };
}
