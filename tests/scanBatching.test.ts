import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intradayTimeframes } from "../supabase/functions/trade-analyzer/types.ts";
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

  it("keeps a window's worth of full scans inside the rate limit", () => {
    // A scan that trips the limiter it shares with itself would fail half of its
    // own chunks — and by rule 3 below, that is a failed scan. One fan-out
    // fitting is not the bar: the e2e suite's own peak window runs several
    // all-markets scans back to back (four in authenticated-workspace.spec.ts,
    // plus the scoped ones), and a CI run that rate-limits itself reads as a
    // quiet market. Five full scans per window is that peak with headroom.
    const chunks = chunkScanSymbols(AVAILABLE_ASSET_SYMBOLS).length;
    assert.ok(
      chunks * 5 <= serverScanRateLimit,
      `${chunks} chunks per scan against a limit of ${serverScanRateLimit} per minute cannot carry the suite's peak of five`,
    );
    assert.ok(SCAN_REQUEST_CONCURRENCY >= 2 && SCAN_REQUEST_CONCURRENCY <= 3);
  });

  it("pins the per-market provider cost to the timeframe list that sets it", () => {
    // A scan's provider cost is markets x (1 daily + 1 quote + one call per
    // DECISION timeframe), and nothing anywhere asserted that. The analyzer's
    // own comment carried "markets x 7" for four months after #362 deleted the
    // minute fetch on 2026-08-18 and made it 6 — a safety argument resting on
    // a number that had quietly changed by a seventh.
    //
    // Derived from the same expression marketLoader.ts uses, so adding or
    // removing a timeframe fails HERE, on the commit that does it, rather than
    // leaving a comment to rot. The number is not the point; the coupling is.
    const decisionTimeframes = intradayTimeframes.filter(
      (timeframe) => timeframe !== "1min",
    );
    const perMarketProviderCalls = 2 + decisionTimeframes.length;
    assert.equal(
      perMarketProviderCalls,
      6,
      `the decision-timeframe list changed: a market now costs ${perMarketProviderCalls} provider calls, not 6 — re-argue the scan ceiling before updating this number`,
    );
    // And the loader must still derive it the same way, or the coupling above
    // is asserting a coincidence.
    assert.match(
      readFileSync(
        "supabase/functions/trade-analyzer/marketLoader.ts",
        "utf8",
      ),
      /intradayTimeframes\.filter\(\s*\n?\s*\(timeframe\) => timeframe !== "1min",/,
      "marketLoader no longer derives its decision timeframes this way",
    );
  });

  it("the e2e claim ledger's arithmetic rests on zero retries", () => {
    // playwright.config.ts's ledger counts each spec once. A retries setting
    // would multiply a failing spec's claims, so the margin must be re-argued
    // before retries are ever enabled.
    //
    // The old comment carried "29 claims ≤ 40/60s" and a worst case of 53.
    // Both were stale — the limit is 60 — and restating them here would put a
    // fourth copy of the same arithmetic in a fourth file. The relation is
    // what matters: retries multiply claims, and nothing else in this suite
    // notices.
    const playwrightConfig = readFileSync("playwright.config.ts", "utf8");
    assert.ok(
      !/^\s*retries\s*:/m.test(playwrightConfig),
      "playwright.config.ts sets retries — the claim ledger assumed 0",
    );
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

  it("orders a double tie the same way however the fan-out split it", () => {
    // Confidence ties break on payoff, and payoff ties used to break on
    // nothing — which inside one request meant input order, and across requests
    // meant whichever chunk happened to hold a market first. The real chunker
    // groups by cluster, so it genuinely reorders: ADAUSD leads the universe
    // list and lands in the last request, BCHUSD follows it and lands in the
    // first. Two markets tied on both keys would swap on how the scan was
    // split. The symbol is the final tiebreak, in both comparators, so they
    // cannot.
    const tied = AVAILABLE_ASSET_SYMBOLS.map((symbol) => ({
      confidenceScore: 71,
      rewardRisk: 1.8,
      symbol,
    }));
    const perChunk = chunkScanSymbols(AVAILABLE_ASSET_SYMBOLS).flatMap((chunk) =>
      rankOpportunities(
        tied.filter((candidate) => chunk.includes(candidate.symbol)),
      )
    );
    assert.deepEqual(
      rankScanCandidates(perChunk).map((candidate) => candidate.symbol),
      rankOpportunities(tied).map((candidate) => candidate.symbol),
    );
    // And that shared order is the symbol's own, not an accident of either path.
    assert.deepEqual(
      rankScanCandidates(perChunk).map((candidate) => candidate.symbol),
      [...AVAILABLE_ASSET_SYMBOLS].sort(),
    );
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

  it("sends no further chunk once one has failed", async () => {
    // A failed scan must not go on spending rate-limit claims — and every chunk
    // it sends after the failure is one more setup written for a scan the reader
    // is about to be told did not complete. In flight is unavoidable; newly sent
    // is not.
    const started: number[] = [];
    await assert.rejects(
      mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (item) => {
        started.push(item);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (item === 2) {
          throw new Error("chunk 2 failed");
        }
        return item;
      }),
      /chunk 2 failed/,
    );
    // Settle first: Promise.all rejects the moment one worker throws, while the
    // other is still mid-item. Asserting immediately would pass against a
    // fan-out that goes on sending — the straggler simply had not sent yet.
    await new Promise((resolve) => setTimeout(resolve, 60));
    // Items 0-3 may all have been dispatched before the failure surfaced (two
    // workers, one wave each); nothing beyond that may have been.
    assert.deepEqual(
      started.filter((item) => item > 3),
      [],
      `dispatched after the failure: ${started.join(",")}`,
    );

    // One worker makes it exact: the first item fails and nothing else is sent.
    const solo: number[] = [];
    await assert.rejects(
      mapWithConcurrency([0, 1, 2], 1, async (item) => {
        solo.push(item);
        throw new Error("first chunk failed");
      }),
      /first chunk failed/,
    );
    assert.deepEqual(solo, [0]);
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

  it("gives one click's requests one name", () => {
    const scanStart = clientSource.indexOf(
      "export async function scanMarketOpportunities",
    );
    const scanEnd = clientSource.indexOf("export async function refreshTradeOutcomes");
    const scanSource = clientSource.slice(scanStart, scanEnd);

    // Splitting the scan split its record in analyzer_events into six unrelated
    // rows. Every chunk carries the click's own id and its place in the fan-out,
    // so an operator can put them back together (the server validates and echoes
    // them — tests/securityHardening.test.ts).
    assert.match(scanSource, /const scanId = typeof crypto\?\.randomUUID/);
    assert.match(scanSource, /chunkCount: chunks\.length,/);
    assert.match(scanSource, /chunkIndex,/);
    assert.match(scanSource, /scanId,/);
  });

  it("says which bundle sent it, on every analyzer request", () => {
    // The build stamp, and the incident that asked for it (2026-08-03): a reader's
    // overnight tab kept sending the retired all-markets request, and the fleet
    // had no way to see that two bundles were live at once — the refusals reached
    // function_edge_logs as bare 400s, and analyzer_events never heard about them
    // at all. Every request now names the bundle that sent it, so a stale tab is
    // legible in the record the requests DO write.
    //
    // Passthrough, exactly as the scan trace is: the client sends it, the server
    // validates the shape and echoes it into telemetry, and nothing anywhere
    // branches on it.
    assert.match(
      clientSource,
      /import \{ runningBundleId \} from "\.\/deployedVersion";/,
    );
    const scanStart = clientSource.indexOf(
      "export async function scanMarketOpportunities",
    );
    const scanEnd = clientSource.indexOf("export async function refreshTradeOutcomes");
    const scanSource = clientSource.slice(scanStart, scanEnd);
    const refreshSource = clientSource.slice(
      scanEnd,
      clientSource.indexOf("export function normalizeEmbeddedOutcomes"),
    );
    assert.ok(refreshSource.length > 0, "expected the outcome-refresh request");

    // Both actions: a reader who never scans is still a tab in the fleet, and a
    // stale one still asks for outcomes on every surface show.
    for (const body of [scanSource, refreshSource]) {
      assert.match(body, /buildStamp: runningBundleId\(\) \?\? undefined,/);
    }
    assert.equal(
      (clientSource.match(/buildStamp: runningBundleId\(\) \?\? undefined,/g) ?? [])
        .length,
      2,
    );
    // Absent rather than faked where there is no built bundle to name (the dev
    // server's entry is `/src/main.tsx`), which is the same choice scanId makes
    // where crypto.randomUUID is missing.
    assert.doesNotMatch(clientSource, /buildStamp: runningBundleId\(\) \?\? "/);
    // Nothing client-side reads it back: it is a label on the request, never an
    // input to it.
    assert.equal((clientSource.match(/runningBundleId\(\)/g) ?? []).length, 2);
  });
});

describe("a failed scan still shows what it wrote", () => {
  it("refreshes the history on the scan's failure path too", () => {
    const source = readFileSync(
      "src/components/workspace/AdvisorWorkspace.tsx",
      "utf8",
    );
    const scanStart = source.indexOf("async function scanMarkets(");
    const scanEnd = source.indexOf("const scanDisabled =");
    const scanSource = source.slice(scanStart, scanEnd);
    assert.ok(scanStart > -1 && scanEnd > scanStart);

    // §17m.2, reached through the error path: chunks that completed before the
    // failure have already persisted their setups, so the reader must see the
    // failure line AND those setups — not the failure line above a history that
    // silently disagrees with the database. Both paths refresh; the catch is the
    // one that used to not.
    const failurePath = scanSource.slice(scanSource.indexOf("} catch {"));
    assert.match(failurePath, /failed: true,/);
    assert.match(failurePath, /onSetupsChanged\(\);/);
    assert.equal(
      (scanSource.match(/onSetupsChanged\(\);/g) ?? []).length,
      2,
      "both the success and failure paths must refresh the history",
    );
  });
});
