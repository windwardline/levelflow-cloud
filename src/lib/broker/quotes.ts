import type {
  AnalyzerSetup,
  MarketScanResponse,
} from "../tradeAnalyzer";

// Spec §19c's boundary, at the one place it touches live data: the bridge reads
// only Levelflow's own in-roster quotes, and only the ones the client already
// holds. Nothing here fetches, and §19d adds no scan — the Size row derives from
// the setup and the scan result already on screen.
//
// The analyzer already attaches each setup's own latest close under
// confluence.orderConstruction.latestClose, and a scan carries a full setup per
// qualifying market. So a scan over All markets leaves the six USD legs the
// derivation needs in hand; a narrower scope may not, and where a leg is absent
// the row renders `Rate unavailable` rather than reaching for a rate from
// anywhere else.
//
// E3 (2026-08-18) aged the field itself: latestClose is now the setup's
// completed decision-anchor close — staleness bounded by the primary span,
// a daily close on the loader's fallback — rather than a ≤1-minute print.
// Accepted for §19c's sizing tolerance and recorded as residue in
// docs/research/r1-divergence-map-2026-08-18.md; sourcing the bridge quote
// from the analyzer's live quote snapshot instead is a §19 governor change
// with its own review, not a rider on the engine.

function latestCloseOf(setup: AnalyzerSetup | null | undefined): number | null {
  if (!setup) {
    return null;
  }
  const orderConstruction = (setup.confluence as Record<string, unknown>)
    ?.orderConstruction as Record<string, unknown> | undefined;
  const latestClose = orderConstruction?.latestClose;
  return typeof latestClose === "number" && Number.isFinite(latestClose) &&
      latestClose > 0
    ? latestClose
    : null;
}

/**
 * Every quote the client currently holds, keyed by Levelflow symbol. The active
 * setup is written last so the market on the stage always carries its own freshest
 * price.
 */
export function collectBrokerQuotes({
  scan,
  setup,
}: {
  scan: MarketScanResponse | null;
  setup: AnalyzerSetup | null;
}): Record<string, number> {
  const quotes: Record<string, number> = {};
  for (const candidate of scan?.opportunities ?? []) {
    const price = latestCloseOf(candidate.setup);
    if (price !== null) {
      quotes[candidate.symbol] = price;
    }
  }
  const active = latestCloseOf(setup);
  if (setup && active !== null) {
    quotes[setup.symbol] = active;
  }
  return quotes;
}
