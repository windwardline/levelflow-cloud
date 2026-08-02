import { AVAILABLE_ASSET_SYMBOLS } from "../symbolMap";
import { CONTRACT_SIZES, LOT_RESTRICTIONS } from "./programs";
import type { Provenance } from "./types";

// Spec §19c. Two derivations, both of them E8's own method applied to Levelflow's
// own in-roster quotes, and nothing else.
//
// `usdPerQuote` turns a lot of quote currency into dollars. E8 publishes contract
// size and leverage and states plainly that "pip value must be derived" — it
// declines to publish a per-pip dollar figure anywhere. The derivation has exactly
// one arithmetic answer and E8 instructs the reader to perform it.
//
// `instrumentPrice` is the "Instrument price" term in E8's own max-position
// formula. 9453396 publishes four cases, which enumerate 13 of the 28 pairs; the
// method they state is one rule — bridge via the base currency's USD pair — and
// its own worked example performs it. Applying a published method to the pairs its
// table did not list is derivation, not invention (§20i ruling 1), so the 15 it
// did not enumerate carry `derived (method: 9453396)` and are never conflated with
// the 13 it did.
//
// THE BOUNDARY, STATED WHERE IT BITES: the method is E8's, and only Levelflow's
// own in-roster quotes feed it. No bridge price comes from anywhere else — not a
// third-party rate, not a cross-rate from a provider Levelflow does not already
// read for its own scanning. tests/brokerReference.test.ts asserts every leg is in
// AVAILABLE_ASSET_SYMBOLS, which is that boundary as CI.

/**
 * `one` is the literal 1 E8's rule prescribes for a USD-first pair, and the
 * definitional 1 for a USD-quoted pair's quote currency. `leg` names the Levelflow
 * market whose live quote supplies the rate.
 */
export type Bridge =
  | { kind: "one"; source: Provenance }
  | { kind: "leg"; leg: string; invert: boolean; source: Provenance };

const DERIVED_PIP_VALUE: Provenance = {
  article: null,
  tag: "derived",
  method: "9453488",
  url: CONTRACT_SIZES.url,
};

const DERIVED_BRIDGE: Provenance = {
  article: null,
  tag: "derived",
  method: "9453396",
  url: LOT_RESTRICTIONS.url,
};

/**
 * The 13 pairs 9453396's own bridging table enumerates: four USD-quoted, three
 * USD-first, three GBP-base and three NZD-base. Pinning the 13/15 split by name is
 * what stops a later edit from quietly promoting a derived bridge to published
 * (§19f).
 */
export const ENUMERATED_BRIDGE_PAIRS = [
  "AUDUSD",
  "EURUSD",
  "GBPUSD",
  "NZDUSD",
  "USDCAD",
  "USDCHF",
  "USDJPY",
  "GBPNZD",
  "GBPJPY",
  "GBPCHF",
  "NZDJPY",
  "NZDCAD",
  "NZDCHF",
];

/** The USD pair Levelflow carries for each non-USD currency, and whether to invert it. */
const USD_LEG: Record<string, { leg: string; invert: boolean }> = {
  // Quoted USD-first in both E8's roster and Levelflow's, so the USD value of one
  // unit is the reciprocal.
  JPY: { leg: "USDJPY", invert: true },
  CHF: { leg: "USDCHF", invert: true },
  CAD: { leg: "USDCAD", invert: true },
  // Quoted USD-second, so the price already is the USD value of one unit.
  AUD: { leg: "AUDUSD", invert: false },
  EUR: { leg: "EURUSD", invert: false },
  GBP: { leg: "GBPUSD", invert: false },
  NZD: { leg: "NZDUSD", invert: false },
};

function baseOf(pair: string) {
  return pair.slice(0, 3);
}

function quoteOf(pair: string) {
  return pair.slice(3, 6);
}

/**
 * 9453396 publishes four cases, and the first two are stated as rules rather than
 * as a list of pairs: a USD-quoted instrument uses its own price (its Metals
 * worked example performs exactly this on gold), and a USD-first pair uses 1. The
 * other two name six crosses outright. Among the 28 pairs that is 13 primary
 * bridges and 15 derived ones — the split ENUMERATED_BRIDGE_PAIRS pins by name.
 */
const TABLED_CROSSES = ["GBPNZD", "GBPJPY", "GBPCHF", "NZDJPY", "NZDCAD", "NZDCHF"];

function bridgeSource(instrument: string): Provenance {
  if (quoteOf(instrument) === "USD" || baseOf(instrument) === "USD") {
    return LOT_RESTRICTIONS;
  }
  return TABLED_CROSSES.includes(instrument) ? LOT_RESTRICTIONS : DERIVED_BRIDGE;
}

/**
 * The USD value of one unit of the pair's quote currency. 1 for the four
 * USD-quoted pairs, giving the textbook $100,000 per 1.0 price unit and $10 per
 * pip; a reciprocal or direct leg for the other 24.
 */
export function usdPerQuoteBridge(levelflowSymbol: string): Bridge | null {
  const quote = quoteOf(levelflowSymbol);
  if (quote === "USD") {
    return { kind: "one", source: DERIVED_PIP_VALUE };
  }
  const leg = USD_LEG[quote];
  if (!leg) {
    return null;
  }
  return { kind: "leg", leg: leg.leg, invert: leg.invert, source: DERIVED_PIP_VALUE };
}

/**
 * "Instrument price" for E8's max-position formula: a USD-quoted pair uses its own
 * price; a USD-first pair uses 1; every cross bridges via the base currency's USD
 * pair.
 */
export function instrumentPriceBridge(levelflowSymbol: string): Bridge | null {
  const base = baseOf(levelflowSymbol);
  const quote = quoteOf(levelflowSymbol);
  const source = bridgeSource(levelflowSymbol);
  if (quote === "USD") {
    return { kind: "leg", leg: levelflowSymbol, invert: false, source };
  }
  if (base === "USD") {
    return { kind: "one", source };
  }
  const leg = USD_LEG[base];
  if (!leg) {
    return null;
  }
  return { kind: "leg", leg: leg.leg, invert: leg.invert, source };
}

/** Every Levelflow market a bridge may read. The boundary, enumerable. */
export function bridgeLegsFor(levelflowSymbol: string): string[] {
  const legs = new Set<string>();
  for (const bridge of [
    usdPerQuoteBridge(levelflowSymbol),
    instrumentPriceBridge(levelflowSymbol),
  ]) {
    if (bridge && bridge.kind === "leg") {
      legs.add(bridge.leg);
    }
  }
  return [...legs];
}

export function isInRosterLeg(leg: string) {
  return AVAILABLE_ASSET_SYMBOLS.includes(leg);
}

/**
 * Resolves a bridge against the quotes the client already holds. A missing,
 * non-finite or non-positive quote resolves to null, and null renders
 * `Rate unavailable` — the derivation has a published method, but it still has no
 * answer without live data (§19e).
 */
export function resolveBridge(
  bridge: Bridge,
  quotes: Readonly<Record<string, number | null | undefined>>,
): number | null {
  if (bridge.kind === "one") {
    return 1;
  }
  const price = quotes[bridge.leg];
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return null;
  }
  return bridge.invert ? 1 / price : price;
}
