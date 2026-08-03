import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { rankOpportunities } from "../supabase/functions/trade-analyzer/scanRanking.ts";
import { getCorrelationGroup as getAnalyzerCorrelationGroup } from "../supabase/functions/trade-analyzer/symbols.ts";
import {
  AVAILABLE_ASSET_SYMBOLS,
  getCorrelationGroup,
} from "../src/lib/symbolMap";
import {
  chunkScanSymbols,
  mapWithConcurrency,
  mergeScanResponses,
  rankScanCandidates,
  SCAN_REQUEST_CONCURRENCY,
  SCAN_SYMBOLS_PER_REQUEST,
} from "../src/lib/scanBatching";
import type { MarketScanResponse } from "../src/lib/tradeAnalyzer";

const analyzerSource = readFileSync(
  "supabase/functions/trade-analyzer/index.ts",
  "utf8",
);

function readServerNumber(pattern: RegExp, label: string) {
  const match = analyzerSource.match(pattern);
  assert.ok(match, `${label} is not declared in the analyzer source`);
  return Number(match![1]);
}

// The server's own numbers, read from the analyzer rather than copied: the
// chunk size is only safe because it is below the cap the server enforces, and
// a cap that moved without this file moving would be a silent widening.
const serverSymbolCap = readServerNumber(
  /const MAX_SCAN_SYMBOLS = (\d+);/,
  "MAX_SCAN_SYMBOLS",
);
const serverScanRateLimit = readServerNumber(
  /scan_opportunities: (\d+),/,
  "the scan_opportunities rate limit",
);

describe("market scan batching", () => {
  it("never builds a request the server would refuse", () => {
    // The whole point of the split (2026-08-02's CPU-limit 546s): no single
    // request may carry enough markets to exceed the 2s CPU budget. The server
    // refuses more than MAX_SCAN_SYMBOLS; the client must never send more.
    assert.ok(
      SCAN_SYMBOLS_PER_REQUEST <= serverSymbolCap,
      `chunk size ${SCAN_SYMBOLS_PER_REQUEST} exceeds the server cap ${serverSymbolCap}`,
    );
    for (const chunk of chunkScanSymbols(AVAILABLE_ASSET_SYMBOLS)) {
      assert.ok(
        chunk.length > 0 && chunk.length <= SCAN_SYMBOLS_PER_REQUEST,
        `chunk of ${chunk.length} markets: ${chunk.join(",")}`,
      );
    }
  });

  it("keeps one full scan inside its own rate-limit window", () => {
    // A scan that trips the limiter it shares with itself would fail half of
    // its own chunks — and by rule 3 below, that is a failed scan. The budget
    // has to cover a whole fan-out with room to repeat it.
    const chunks = chunkScanSymbols(AVAILABLE_ASSET_SYMBOLS).length;
    assert.ok(
      chunks * 2 <= serverScanRateLimit,
      `a ${chunks}-chunk scan against a limit of ${serverScanRateLimit} per minute leaves no room to rescan`,
    );
    assert.ok(SCAN_REQUEST_CONCURRENCY >= 2 && SCAN_REQUEST_CONCURRENCY <= 3);
  });

  it("scans every named market exactly once", () => {
    const chunks = chunkScanSymbols(AVAILABLE_ASSET_SYMBOLS);
    const flattened = chunks.flat();
    assert.equal(flattened.length, AVAILABLE_ASSET_SYMBOLS.length);
    assert.deepEqual(
      [...flattened].sort(),
      [...AVAILABLE_ASSET_SYMBOLS].sort(),
    );
  });

  it("sends every correlated market in the same request", () => {
    // supabase/functions/trade-analyzer/index.ts's
    // collapseRelatedMarketOpportunities shows ONE market per correlated
    // cluster and blocks the rest — per request. Split a cluster across two
    // requests and each half wins its own collapse: two versions of the same
    // trade idea, both shown AND both persisted. Grouping the fan-out by
    // cluster is what keeps the batched scan's result identical to the single
    // scan's. (Naive 10-at-a-time chunking of this universe splits 6 of its 15
    // clusters, eur_crosses and aud_crosses included.)
    for (const symbols of [AVAILABLE_ASSET_SYMBOLS, [...AVAILABLE_ASSET_SYMBOLS].reverse()]) {
      const chunkOfCluster = new Map<string, Set<number>>();
      chunkScanSymbols(symbols).forEach((chunk, index) => {
        for (const symbol of chunk) {
          const cluster = getAnalyzerCorrelationGroup(symbol);
          chunkOfCluster.set(
            cluster,
            (chunkOfCluster.get(cluster) ?? new Set()).add(index),
          );
        }
      });
      for (const [cluster, indexes] of chunkOfCluster) {
        assert.equal(
          indexes.size,
          1,
          `${cluster} was split across requests ${[...indexes].join(",")}`,
        );
      }
    }
  });

  it("agrees with the analyzer on every visible market's cluster", () => {
    // The grouping above is only as good as the client's mirror of the
    // server's correlation table (src/lib/symbolMap.ts's CORRELATION_GROUPS).
    // Pinned per symbol in both directions rather than by spot check, because
    // one drifted membership silently re-splits a cluster.
    for (const symbol of AVAILABLE_ASSET_SYMBOLS) {
      assert.equal(
        getCorrelationGroup(symbol),
        getAnalyzerCorrelationGroup(symbol),
        symbol,
      );
    }
  });

  it("keeps every cluster narrow enough to fit one request", () => {
    // What makes "one cluster, one request" achievable at all. A cluster wider
    // than a request would have to be split, and the split half would win its
    // own collapse — so widening one past this line is a decision, not an edit,
    // and it fails the build until the chunk size moves with it.
    const width = new Map<string, number>();
    for (const symbol of AVAILABLE_ASSET_SYMBOLS) {
      const cluster = getCorrelationGroup(symbol);
      width.set(cluster, (width.get(cluster) ?? 0) + 1);
    }
    for (const [cluster, members] of width) {
      assert.ok(
        members <= SCAN_SYMBOLS_PER_REQUEST,
        `${cluster} has ${members} markets, more than one ${SCAN_SYMBOLS_PER_REQUEST}-market request holds`,
      );
    }
  });

  it("packs unrelated markets up to the cap and never past it", () => {
    // Markets with no cluster of their own (each is its own) are the case where
    // packing is pure arithmetic: 13 of them fill one request and start a
    // second, and neither exceeds the cap.
    const unrelated = Array.from(
      { length: SCAN_SYMBOLS_PER_REQUEST + 3 },
      (_, index) => `EURUSD${index}`,
    );
    const chunks = chunkScanSymbols(unrelated);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, SCAN_SYMBOLS_PER_REQUEST);
    assert.equal(chunks[1].length, 3);
    assert.deepEqual([...chunks.flat()].sort(), [...unrelated].sort());
  });

  it("scopes down to a single request for a single market", () => {
    assert.deepEqual(chunkScanSymbols(["EURUSD"]), [["EURUSD"]]);
    assert.deepEqual(chunkScanSymbols([]), []);
  });
});

describe("market scan ranking mirror", () => {
  const candidates = [
    { confidenceScore: 74, rewardRisk: 2.1, symbol: "A" },
    { confidenceScore: 91, rewardRisk: 1.2, symbol: "B" },
    { confidenceScore: 74, rewardRisk: 3.4, symbol: "C" },
    { confidenceScore: undefined, rewardRisk: 9.9, symbol: "D" },
    { confidenceScore: 91, rewardRisk: 1.2, symbol: "E" },
    { confidenceScore: 66, rewardRisk: undefined, symbol: "F" },
    { confidenceScore: 0, rewardRisk: 0, symbol: "G" },
    { confidenceScore: Number.NaN, rewardRisk: 4.2, symbol: "H" },
  ];

  it("orders candidates exactly as the analyzer does", () => {
    // src/lib/scanBatching.ts's comparator is a mirror of
    // supabase/functions/trade-analyzer/scanRanking.ts. This asserts the two
    // agree rather than trusting that they were written the same day.
    assert.deepEqual(
      rankScanCandidates(candidates).map((candidate) => candidate.symbol),
      rankOpportunities(candidates).map((candidate) => candidate.symbol),
    );
    for (let size = 0; size <= candidates.length; size += 1) {
      const slice = candidates.slice(0, size);
      assert.deepEqual(
        rankScanCandidates(slice).map((candidate) => candidate.symbol),
        rankOpportunities(slice).map((candidate) => candidate.symbol),
        `first ${size} candidates`,
      );
    }
  });

  it("ranks a chunked scan the way one request would have ranked it", () => {
    // The property that matters: the server ranks WITHIN a chunk, so the
    // merged list is only as good as the client's re-rank. Chunk the
    // candidates, rank each chunk server-side, merge, re-rank client-side —
    // and the order must equal the single-request ranking of the whole set.
    const chunkSize = 3;
    const perChunk = [];
    for (let index = 0; index < candidates.length; index += chunkSize) {
      perChunk.push(rankOpportunities(candidates.slice(index, index + chunkSize)));
    }
    assert.deepEqual(
      rankScanCandidates(perChunk.flat()).map((candidate) => candidate.symbol),
      rankOpportunities(candidates).map((candidate) => candidate.symbol),
    );
  });

  it("leaves the caller's array untouched", () => {
    const input = [...candidates];
    rankScanCandidates(input);
    assert.deepEqual(input, candidates);
  });
});

describe("market scan merge", () => {
  function response(
    overrides: Partial<MarketScanResponse> = {},
  ): MarketScanResponse {
    return {
      advisoryOnly: true,
      blocked: [],
      opportunities: [],
      persistence: { attempted: 0, failed: 0, persisted: 0, skipped: 0 },
      qualified: 0,
      scanned: 0,
      ...overrides,
    };
  }

  it("sums what the chunks reported", () => {
    const merged = mergeScanResponses([
      response({
        blocked: [{ assetType: "Forex", blocked: true, symbol: "AUDCAD" }],
        opportunities: [
          { assetType: "Forex", confidenceScore: 70, rewardRisk: 2, symbol: "EURUSD" },
        ],
        persistence: { attempted: 1, failed: 0, persisted: 1, skipped: 0 },
        qualified: 1,
        scanned: 10,
      }),
      response({
        blocked: [{ assetType: "Metals", blocked: true, symbol: "XAGUSD" }],
        opportunities: [
          { assetType: "Metals", confidenceScore: 88, rewardRisk: 1.5, symbol: "XAUUSD" },
        ],
        persistence: { attempted: 1, failed: 0, persisted: 0, skipped: 1 },
        qualified: 1,
        scanned: 9,
      }),
    ]);

    assert.equal(merged.scanned, 19);
    assert.equal(merged.qualified, 2);
    assert.deepEqual(merged.persistence, {
      attempted: 2,
      failed: 0,
      persisted: 1,
      skipped: 1,
    });
    // Blocked lists concatenate in chunk order; opportunities are re-ranked.
    assert.deepEqual(merged.blocked.map((candidate) => candidate.symbol), [
      "AUDCAD",
      "XAGUSD",
    ]);
    assert.deepEqual(merged.opportunities.map((candidate) => candidate.symbol), [
      "XAUUSD",
      "EURUSD",
    ]);
    // The §17m.2 identity survives the merge: attempted === qualified, and
    // persisted + skipped + failed === attempted.
    assert.equal(merged.persistence!.attempted, merged.qualified);
    assert.equal(merged.opportunities.length, merged.qualified);
    assert.equal(merged.failed, undefined);
  });

  it("carries no persistence report when a chunk carried none", () => {
    // A partial sum that looks complete is the §17m.2 failure mode itself: the
    // report is either every chunk's or absent.
    const merged = mergeScanResponses([
      response({ persistence: { attempted: 0, failed: 0, persisted: 0, skipped: 0 } }),
      response({ persistence: undefined }),
    ]);
    assert.equal(merged.persistence, undefined);
  });

  it("refuses to assemble a scan out of no responses", () => {
    assert.throws(() => mergeScanResponses([]), /no responses/);
  });

  it("stays advisory only while every chunk says so", () => {
    assert.equal(mergeScanResponses([response()]).advisoryOnly, true);
    assert.equal(
      mergeScanResponses([response(), response({ advisoryOnly: false })])
        .advisoryOnly,
      false,
    );
  });
});

describe("market scan fan-out", () => {
  it("fails the whole scan when any chunk fails", async () => {
    // Rule 3: a partially failed scan IS a failed scan. The fan-out rejects,
    // so nothing downstream ever sees a partial result to render.
    await assert.rejects(
      mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
        if (item === 3) {
          throw new Error("chunk 3 failed");
        }
        return item;
      }),
      /chunk 3 failed/,
    );
  });

  it("returns results in request order, not completion order", async () => {
    const results = await mapWithConcurrency([30, 10, 20], 2, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });
    assert.deepEqual(results, [30, 10, 20]);
  });

  it("never runs more requests at once than the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 9 }, (_, index) => index),
      SCAN_REQUEST_CONCURRENCY,
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    );
    assert.equal(peak, SCAN_REQUEST_CONCURRENCY);
  });
});

describe("the scan client sends chunks and merges only whole results", () => {
  const clientSource = readFileSync("src/lib/tradeAnalyzer.ts", "utf8");

  it("names its symbols in every request", () => {
    const scanStart = clientSource.indexOf(
      "export async function scanMarketOpportunities",
    );
    const scanEnd = clientSource.indexOf("export async function refreshTradeOutcomes");
    const scanSource = clientSource.slice(scanStart, scanEnd);

    assert.ok(scanStart > -1 && scanEnd > scanStart);
    assert.match(scanSource, /chunkScanSymbols\(symbols\)/);
    assert.match(scanSource, /symbols: chunk,/);
    // Every chunk resolved before anything is merged, and any chunk's failure
    // is thrown rather than absorbed — no allSettled, no per-chunk catch.
    assert.match(scanSource, /await mapWithConcurrency\(/);
    assert.match(scanSource, /return mergeScanResponses\(responses\);/);
    assert.equal(scanSource.includes("allSettled"), false);
    assert.equal(scanSource.includes("catch"), false);
    assert.match(scanSource, /if \(error\) \{\s*throw new Error\(error\.message\);/);
  });
});
