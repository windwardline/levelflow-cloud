/**
 * VENUE TRUTH — the one place a market's exchange clock is recorded.
 *
 * FMP labels intraday bars in the VENUE'S OWN local wall time, not in New
 * York's. For the roster's US markets those coincide, which is why the
 * pre-2026-08-24 normalizer read every label as New York wall and 93 of 96
 * sources landed where they belong. Three did not: `^GDAXI`, `^N225` and
 * `^AXJO` stood displaced by exactly their venue's local-to-New-York
 * difference — +6h, +13h and +14h — for the whole history.
 *
 * Established four independent ways before this table was written:
 *
 *  1. The measured offsets equal each venue's local-to-New-York difference
 *     exactly, and stripping the conversion leaves raw labels of 10:00-16:00
 *     for ASX and 09:00-17:30 for XETRA — their actual local sessions.
 *  2. The modal label of each index's first daily bar is CONSTANT across all
 *     twelve months — ^AXJO 10:00, ^N225 09:00, ^GDAXI 09:00, ^GSPC 09:30 —
 *     which is what a venue-local label looks like and is not what a
 *     fixed-offset or New-York label would produce for a foreign exchange.
 *  3. Each index observes ITS OWN exchange holidays: ^AXJO absent on
 *     Australia Day and ANZAC Day and present on US Independence Day, ^N225
 *     absent through Golden Week and present on US Thanksgiving.
 *  4. Re-reading the recovered labels under these zones puts every session
 *     exactly where its exchange trades — ^N225 00:00-06:00 UTC, ^GDAXI
 *     07:00-15:30, ^GSPC 13:30-20:00, and ^AXJO on hours 23 and 00-05 with
 *     06 through 22 EXACTLY empty, the ASX session wrapping UTC midnight
 *     under AEDT.
 *
 * THE ENTRIES ARE VERIFIED, NOT TRUSTED. `sessionAnchorWitness` reads the
 * same `open` recorded here and condemns a store whose bars do not begin at
 * it; the sweep driver throws on a displaced store and the corpus door
 * refuses one. A wrong zone in this table is therefore a loud failure rather
 * than a silent mis-registration — which is the whole reason the venue's
 * session open lives beside its zone instead of in a separate list.
 *
 * THE POPULATION IS DERIVED. Every market `getAssetType` classifies as
 * `indices` must appear here; `tests/clockWitness.test.ts` walks
 * `ASSET_TYPE_BY_SYMBOL.indices` and fails if one is missing. Everything
 * absent defaults to New York, which is FMP's convention for US-listed
 * instruments and is independently corroborated by the CME session: livestock
 * runs 13:30-18:05 UTC, i.e. 09:30 ET, so the provider labels Chicago
 * products in New York time too.
 *
 * Keys are PROVIDER symbols, because that is what the fetch requests and what
 * the cache stores are keyed by. The engine name misses every index.
 */
export type VenueClock = {
  /** IANA zone the provider's bar labels are written in. */
  zone: string;
  /** The venue's session open, in that zone. */
  open: { hour: number; minute: number };
};

export const DEFAULT_LABEL_ZONE = "America/New_York";

export const VENUE_CLOCKS: Record<string, VenueClock> = {
  // NYSE / Nasdaq cash open.
  "^GSPC": { zone: "America/New_York", open: { hour: 9, minute: 30 } },
  "^DJI": { zone: "America/New_York", open: { hour: 9, minute: 30 } },
  "^NDX": { zone: "America/New_York", open: { hour: 9, minute: 30 } },
  // XETRA continuous trading.
  "^GDAXI": { zone: "Europe/Berlin", open: { hour: 9, minute: 0 } },
  // Tokyo's morning session. Its 11:30-12:30 lunch break is visible in the
  // bar histogram and is what identifies the feed as the TSE's own.
  "^N225": { zone: "Asia/Tokyo", open: { hour: 9, minute: 0 } },
  // ASX normal trading, after the opening auction.
  "^AXJO": { zone: "Australia/Sydney", open: { hour: 10, minute: 0 } },
};

/**
 * The zone a provider's bar labels for this symbol are written in. Defaults
 * to New York — see the note above on why that default is safe and how it is
 * corroborated.
 */
export function labelZoneFor(providerSymbol: string): string {
  return VENUE_CLOCKS[providerSymbol]?.zone ?? DEFAULT_LABEL_ZONE;
}
