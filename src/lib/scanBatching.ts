import { getCorrelationGroup, type SupportedSymbol } from "./symbolMap";
import type { MarketScanCandidate, MarketScanResponse } from "./tradeAnalyzer";

// How many markets one scan request may carry. The reason it is small is
// measured, not stylistic: on 2026-08-02 roughly half of the open-market
// all-markets scans died on Supabase's 2s CPU budget ("CPU Time exceeded" in
// the platform log), and PR #168's benchmark put a 50-market scan at ~1.84s of
// CPU after its allocation cuts — a 1.09x margin. Ten markets is a fifth of
// that work, so the request the server actually runs cannot reach the limit.
// The server enforces its own cap (MAX_SCAN_SYMBOLS, currently 15);
// tests/scanBatching.test.ts reads it out of the analyzer source and fails if
// this number ever rises above it.
export const SCAN_SYMBOLS_PER_REQUEST = 10;

// How many of those requests are in flight at once. Two, not five: the whole
// fan-out shares one rate-limit budget and one FMP account, and the point of
// splitting the scan was to stop asking the platform for everything at once.
export const SCAN_REQUEST_CONCURRENCY = 2;

/**
 * Splits a scan's markets into requests small enough for the server to run,
 * keeping every correlated cluster inside ONE request.
 *
 * The clustering is what makes a batched scan equal to a single scan. The
 * analyzer collapses correlated markets per request — one market per cluster is
 * shown, the rest come back blocked ("Showing X instead") — so a cluster split
 * across two requests wins its own collapse twice: two versions of the same
 * trade idea, both on the rail and both persisted. Naive ten-at-a-time chunking
 * splits clusters wider than a chunk and any cluster that straddles a boundary.
 *
 * The worked example that used to sit here — "today's 50-market universe
 * splits 6 of its 15 clusters, eur_crosses (7) and aud_crosses (5) among
 * them" — is gone rather than updated. The universe has more than doubled and
 * the cluster count moved with it, so the two clusters offered as evidence had
 * become counterexamples: both now fit. A motivating example that inverts is
 * worse than none, and the guarantee itself is machine-checked below.
 *
 * First-fit-decreasing over the clusters: the widest cluster is placed first,
 * and the ties keep their input order, so the partition is deterministic.
 */
export function chunkScanSymbols(
  symbols: SupportedSymbol[],
): SupportedSymbol[][] {
  const clusters = new Map<string, SupportedSymbol[]>();
  for (const symbol of symbols) {
    const cluster = getCorrelationGroup(symbol);
    clusters.set(cluster, [...(clusters.get(cluster) ?? []), symbol]);
  }

  const chunks: SupportedSymbol[][] = [];
  const widestFirst = [...clusters.values()].sort(
    (first, second) => second.length - first.length,
  );
  for (const cluster of widestFirst) {
    // One pass for every cluster that fits a request, which is all of them
    // today (the widest is 7 of 10, pinned in tests/scanBatching.test.ts). A
    // cluster ever widened past the request size splits here instead of being
    // sent over the cap and refused at the door — the collapse guarantee is
    // what degrades, not the scan.
    for (
      let index = 0;
      index < cluster.length;
      index += SCAN_SYMBOLS_PER_REQUEST
    ) {
      const part = cluster.slice(index, index + SCAN_SYMBOLS_PER_REQUEST);
      const home = chunks.find(
        (chunk) => chunk.length + part.length <= SCAN_SYMBOLS_PER_REQUEST,
      );
      if (home) {
        home.push(...part);
        continue;
      }
      chunks.push([...part]);
    }
  }

  return chunks;
}

type RankableCandidate = {
  confidenceScore?: number;
  rewardRisk?: number;
  symbol?: string;
};

function scoreScanCandidate(candidate: RankableCandidate) {
  const confidence = Number(candidate.confidenceScore);
  return Number.isFinite(confidence) ? confidence : 0;
}

// The symbol is the final tiebreak in both comparators. Without it, "equal on
// both keys" resolves to input order — and a merged list's input order is which
// request happened to hold the market, so one click's list would depend on how
// it was split. Compared by code unit, not localeCompare: this runs in a browser
// and its mirror runs in Deno, and locale collation is not guaranteed identical
// across the two.
function compareSymbols(first: RankableCandidate, second: RankableCandidate) {
  const firstSymbol = String(first.symbol ?? "");
  const secondSymbol = String(second.symbol ?? "");
  if (firstSymbol === secondSymbol) {
    return 0;
  }
  return firstSymbol < secondSymbol ? -1 : 1;
}

/**
 * MIRROR of supabase/functions/trade-analyzer/scanRanking.ts. Confidence is the
 * probability proxy and the primary sort, payoff breaks those ties, and the
 * symbol breaks what is left.
 *
 * It exists client-side because the server now ranks within a chunk, so the
 * merged list has to be re-ranked to read the way one request's list read.
 * tests/scanBatching.test.ts asserts the two comparators agree — including on
 * the property that matters: chunk-ranked-then-merged equals single-request
 * ranked, double ties included.
 */
export function rankScanCandidates<T extends RankableCandidate>(
  candidates: T[],
): T[] {
  return [...candidates].sort((first, second) =>
    scoreScanCandidate(second) - scoreScanCandidate(first) ||
    (second.rewardRisk ?? 0) - (first.rewardRisk ?? 0) ||
    compareSymbols(first, second)
  );
}

/**
 * One scan out of its chunk responses.
 *
 * Counts are sums and blocked lists concatenate, because that is what the
 * chunks are: disjoint halves of one scan over one universe. Every reader —
 * the count line, adoptScanVerdict, the e2e persistence spec — reads this
 * exactly as it read a single response.
 *
 * Only called once every chunk has returned 200 (a partially failed scan is a
 * failed scan), so there is no partial-merge path to get wrong.
 */
export function mergeScanResponses(
  responses: MarketScanResponse[],
): MarketScanResponse {
  if (responses.length === 0) {
    throw new Error("A market scan cannot be assembled from no responses.");
  }

  const opportunities: MarketScanCandidate[] = [];
  const blocked: MarketScanCandidate[] = [];
  let qualified = 0;
  let scanned = 0;
  for (const response of responses) {
    opportunities.push(...response.opportunities);
    blocked.push(...response.blocked);
    qualified += response.qualified;
    scanned += response.scanned;
  }

  // No learningRefresh: each chunk's describes the throttled global refresh on
  // whichever instance served it, several chunks means several of those, and no
  // single value is true of the scan. Nothing renders it, so the merged scan
  // carries none rather than one chunk's, picked.
  return {
    advisoryOnly: responses.every((response) => response.advisoryOnly),
    blocked,
    opportunities: rankScanCandidates(opportunities),
    persistence: mergeScanPersistence(responses),
    qualified,
    scanned,
  };
}

// The §17m.2 report, summed — or absent. A sum built from only the chunks that
// carried one would look like a complete account of the scan while describing
// part of it, which is the exact divergence between "shown" and "written" the
// report exists to expose.
function mergeScanPersistence(responses: MarketScanResponse[]) {
  if (!responses.every((response) => response.persistence)) {
    return undefined;
  }
  return responses.reduce(
    (total, response) => ({
      attempted: total.attempted + response.persistence!.attempted,
      failed: total.failed + response.persistence!.failed,
      persisted: total.persisted + response.persistence!.persisted,
      skipped: total.skipped + response.persistence!.skipped,
    }),
    { attempted: 0, failed: 0, persisted: 0, skipped: 0 },
  );
}

/**
 * Bounded-concurrency map: the dispatch loop
 * supabase/functions/trade-analyzer/concurrency.ts uses server-side, plus an
 * abort. Results come back in request order, and any worker throwing rejects the
 * whole map — which is how one failed chunk fails the whole scan instead of
 * rendering as a smaller one.
 *
 * The abort is why this is not just the server's copy. There, one item is local
 * work inside a request already paid for; here, one item IS a request — a
 * rate-limit claim, a provider fetch, and setups written to the reader's own
 * history. Once the scan is going to fail, sending more of those buys nothing
 * and widens the gap between what was written and what the reader is about to be
 * told. Items already in flight finish; none is newly sent.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let aborted = false;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        if (aborted) {
          return;
        }
        const currentIndex = nextIndex;
        nextIndex += 1;
        try {
          results[currentIndex] = await worker(items[currentIndex]);
        } catch (error) {
          aborted = true;
          throw error;
        }
      }
    }),
  );

  return results;
}
