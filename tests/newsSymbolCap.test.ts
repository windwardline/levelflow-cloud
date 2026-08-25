import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  batchNewsSymbols,
  FMP_NEWS_SYMBOL_CAP,
  NEWS_SYMBOL_BATCH,
} from "../supabase/functions/news-calendar/newsBatching.ts";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  defaultScanSymbols,
  getHeadlineNewsSymbols,
} from "../supabase/functions/trade-analyzer/symbols.ts";
import type { SupportedSymbol } from "../supabase/functions/trade-analyzer/types.ts";

// FMP's news endpoints honour roughly the first 25 symbols of the `symbols`
// parameter and silently discard the rest — HTTP 200, a full hundred
// articles, nothing missing that a caller could see. Measured 2026-08-25:
// BTCUSD returns 74 articles at position 25 and ZERO at position 26.
//
// It was live. FOREX_NEWS_SYMBOLS carried 28 symbols alphabetically, so
// USDCHF and USDJPY sat past the cap and received no headlines at all, while
// each returns 100 articles queried alone.

const NEWS_CALENDAR = readFileSync(
  "supabase/functions/news-calendar/index.ts",
  "utf8",
);

const classSymbols = (assetType: string) =>
  getHeadlineNewsSymbols(
    defaultScanSymbols.filter((symbol) =>
      getAssetType(symbol) === assetType
    ) as SupportedSymbol[],
  );

describe("news symbol batching — the cap that fails silently", () => {
  it("keeps the batch below the measured cap, with margin", () => {
    // Below, not at. The cap is an undocumented provider behaviour that can
    // tighten without notice, and the price of margin is one extra request
    // an hour.
    assert.ok(
      NEWS_SYMBOL_BATCH < FMP_NEWS_SYMBOL_CAP,
      `batch ${NEWS_SYMBOL_BATCH} leaves no margin under cap ${FMP_NEWS_SYMBOL_CAP}`,
    );
  });

  it("never emits a batch over the cap, for any list this repo sends", () => {
    // DERIVED from the real lists rather than a fixture, so growing a class
    // cannot outrun the guarantee. Every roster class is checked, not the two
    // that happen to be sent today — a class that becomes newsworthy later
    // inherits the protection instead of rediscovering the defect.
    for (const assetType of new Set(defaultScanSymbols.map(getAssetType))) {
      const symbols = classSymbols(assetType);
      for (const batch of batchNewsSymbols(symbols)) {
        assert.ok(
          batch.length <= FMP_NEWS_SYMBOL_CAP,
          `${assetType}: a batch of ${batch.length} exceeds the cap`,
        );
      }
    }
  });

  it("loses no symbol and invents none", () => {
    // The batching is only safe if it is a partition. A chunker that dropped
    // a remainder would reproduce the very defect, quietly.
    for (const assetType of new Set(defaultScanSymbols.map(getAssetType))) {
      const symbols = classSymbols(assetType);
      assert.deepEqual(batchNewsSymbols(symbols).flat(), symbols, assetType);
    }
    assert.deepEqual(batchNewsSymbols([]), []);
    assert.deepEqual(batchNewsSymbols(["A", "B", "C"], 2), [["A", "B"], ["C"]]);
    assert.throws(() => batchNewsSymbols(["A"], 0), /size must be >= 1/);
  });

  it("covers all 33 crypto markets, not the 8 it was frozen at", () => {
    // The rank-1 finding: 25 of 33 crypto markets could never receive a
    // headline penalty — up to 4 confidence points under crypto's
    // newsPenaltyPerEvent 1 / maxNewsPenalty 4 — a standing one-directional
    // advantage over the eight covered majors.
    const crypto = classSymbols("crypto");
    assert.equal(
      defaultScanSymbols.filter((symbol) => getAssetType(symbol) === "crypto")
        .length,
      33,
    );
    for (const symbol of ["XRPUSD", "DOGEUSD", "LINKUSD", "TRUMPUSD"]) {
      assert.ok(crypto.includes(symbol), `${symbol} has no news coverage`);
    }
  });

  it("covers the two majors the cap was silently dropping", () => {
    // USDCHF and USDJPY. Not a fixture: the assertion is that they are in
    // the derived list AND that the list is batched, because being in the
    // list was never the problem — being 26th in it was.
    const forex = classSymbols("forex");
    assert.ok(forex.includes("USDJPY") && forex.includes("USDCHF"));
    const batches = batchNewsSymbols(forex);
    const usdjpy = batches.findIndex((batch) => batch.includes("USDJPY"));
    assert.ok(usdjpy >= 0);
    assert.ok(
      batches[usdjpy].indexOf("USDJPY") < FMP_NEWS_SYMBOL_CAP,
      "USDJPY still sits past the cap inside its own batch",
    );
  });

  it("sends every request through the batcher — derived from the source", () => {
    // A second call site building its own URL would reintroduce the defect
    // in a place these unit tests cannot see. The batcher must be the only
    // path to a news URL.
    const urlBuilds = NEWS_CALENDAR.match(/\/news\/\$\{category\}/g) ?? [];
    assert.equal(urlBuilds.length, 1, "a second news URL is built somewhere");
    assert.match(
      NEWS_CALENDAR,
      /batchNewsSymbols\(symbols\)\.map\(/,
      "the news fetch no longer routes through the batcher",
    );
  });

  it("derives its symbol lists instead of typing them", () => {
    // CRYPTO_NEWS_SYMBOLS was frozen at 8 while crypto grew to 33.
    // FOREX_NEWS_SYMBOLS still equalled its class exactly — by luck — and is
    // derived so the luck is not load-bearing.
    for (const name of ["FOREX_NEWS_SYMBOLS", "CRYPTO_NEWS_SYMBOLS"]) {
      assert.match(
        NEWS_CALENDAR,
        new RegExp(`const ${name} = getHeadlineNewsSymbols\\(`),
        `${name} is hand-typed again`,
      );
    }
  });
});
