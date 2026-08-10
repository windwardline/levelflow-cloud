/**
 * Contract-size variants: the same market at a different notional.
 *
 * Owner ruling (2026-08-05): Levelflow analyzes ONE market per underlying, per
 * account type. Contract size is a SIZING dimension, never a second scan row.
 *
 * Why the scan cannot carry both. E8's futures program offers gold at two
 * sizes — GC and MGC — and FMP happens to publish a separate series for each.
 * Two scannable rows would present one gold opportunity twice: the ranked scan
 * would double-count it, and the money-positive statistics the whole
 * calibration arc rests on would count one trade's outcome as two. §17f's copy
 * law makes the same point from the other side — a row that restates what
 * another row already says carries nothing.
 *
 * Why sizing must still carry both. MGC's tick value is a tenth of GC's, so a
 * position size computed for one is simply wrong for the other. That is
 * exactly what §19's sizing governor is for, and `BROKER_INSTRUMENTS` is
 * already keyed `(broker, program line, Levelflow symbol)` — a separate axis
 * from the scan. Variants belong there, attached to the analyzed parent.
 *
 * Why this is DECLARED rather than detected. A same-FMP-series check would not
 * catch MGC at all: GCUSD and MGCUSD are different series that happen to track
 * the same metal. No structural property of the data says "these two tickers
 * are one market" — that is a fact about the contracts, so it is stated here
 * and enforced by test, not inferred.
 *
 * What is NOT a variant, and why the distinction is load-bearing:
 *   - WTI/CLUSD and BRENT/BZUSD read the SAME FMP series but sit on different
 *     account types (CFD vs futures). Amendment 24 gives each account type its
 *     own independent verdict, so both rows are correct and required.
 *   - FDAX/DAX and NKD/NIKKEI likewise — futures account vs CFD account.
 *   - RTYUSD is FMP's "Micro E-mini Russell 2000" and E8 offers no full-size
 *     Russell, so the micro IS the market's only representation. A variant
 *     needs a parent that is itself analyzed; this one has none.
 *   - ESUSD, NQUSD, YMUSD are E-mini/mini contracts by name but are the
 *     standard instrument for their index, not reductions of a larger row.
 */

/** variant Levelflow symbol -> the analyzed parent it sizes against. */
export const CONTRACT_SIZE_VARIANTS: Readonly<Record<string, string>> = {
  // Micro Gold, 10 oz against GC's 100 oz. Both are live on the F9
  // futures-account sighting (MGCQ6 4041.0 alongside GCQ6 4029.6), and both
  // carry published E8 sizing data — so this row keeps its sizing identity and
  // loses only its claim to a scan slot.
  MGCUSD: "GCUSD",
  // Eurex mini-DAX against FDAX's full-size contract. Both are live on the F9
  // futures-account sighting (FDXMU6 26154.0 alongside FDAXU6 26151.0) and both
  // read the SAME ^GDAXI series — so the price action is not merely similar, it
  // is identical. Nothing to analyze twice; everything to size differently.
  // FDXM left this table with amendment 32 (2026-08-09): its parent FDAX
  // is dormant, and a variant may never outlive the market it sizes
  // against. Its masterList row carries the dormancy.
  // Group A, wired 2026-08-06. Every one is a live, priced row on the F9
  // futures-account sighting whose contract differs from its parent only in
  // notional — CME's micro E-minis, NYMEX's e-mini energies, CBOT's mini
  // grains. Each reads its parent's own FMP series, so its price action is not
  // similar to the parent's, it IS the parent's.
  //
  // Three F9 rows are deliberately NOT here, because the evidence does not
  // identify them and a wrong parent produces plausible setups against the
  // wrong market: MC (2712.25 on the sighting, which rules out Russell — FMP's
  // RTYUSD was 3025.40 two days later), BIT (64180 beside BTC's 64070, both
  // bitcoin, parentage unestablished), and SIC (silver's active month per the
  // research doc, likely SI's front month rather than a separate instrument).
  // XW is excluded by inheritance: its parent is Chicago wheat, which has no
  // FMP source at all.
  MES: "ESUSD",
  MNQ: "NQUSD",
  MYM: "YMUSD",
  QM: "CLUSD",
  QG: "NGUSD",
  XK: "ZSUSX",
  XC: "ZCUSX",
};

/**
 * True when a symbol is a size variant of an analyzed parent, and so must not
 * appear in any account type's scannable set.
 */
export function isContractSizeVariant(symbol: string): boolean {
  return Object.hasOwn(CONTRACT_SIZE_VARIANTS, symbol);
}

/** The analyzed market a variant sizes against, or null when not a variant. */
export function parentMarketOf(symbol: string): string | null {
  return CONTRACT_SIZE_VARIANTS[symbol] ?? null;
}

/** Every variant declared for a given parent — the sizing layer's menu. */
export function variantsOf(parentSymbol: string): string[] {
  return Object.entries(CONTRACT_SIZE_VARIANTS)
    .filter(([, parent]) => parent === parentSymbol)
    .map(([variant]) => variant);
}
