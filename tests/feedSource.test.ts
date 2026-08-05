import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SECURITY_GROUPS, SECURITY_OPTIONS } from "../src/lib/symbolMap";
import { isKnownSymbol } from "../supabase/functions/trade-analyzer/symbols.ts";

// §20i ruling 8: the FMP feed was verified against E8's live platform
// (E8 Pro Forex, TradeLocker, 2026-08-02 — docs/research/
// e8-feed-verification-2026-08-02.md) and locked. Every pin below restates a
// fact that verification observed. A red here means the wiring no longer
// matches what was verified: re-verify against a live E8 frame per that
// document's protocol BEFORE updating any pin — never the other way around.

const PRICE_PATHS = [
  "supabase/functions/market-data/index.ts",
  "supabase/functions/trade-analyzer/marketLoader.ts",
];

// Both edge functions hardcode their OWN independent symbol map — Deno Edge
// Functions are self-contained modules, so neither imports from the other or
// from src/lib/symbolMap.ts. market-data/index.ts can never join the
// resolveProviderSymbols-based pins below: it's a Deno-global file, excluded
// from tsconfig.tests.json by AGENTS.md's own law ("never widen it to a
// glob"). trade-analyzer/symbols.ts CAN be imported (it already is, see
// tests/core.test.ts). Fix round 1 (2026-08-04) added a source-text pin, the
// same idiom tests/mobileNav.test.ts's APP_SOURCE uses, covering both files
// identically and exhaustively. Task 16c (2026-08-04) retired the mechanism
// itself — ASX/DAX/NSDQ's fallbacks failed the identical scale bar WTI's USO
// fallback failed in Task 16b — so the exhaustive matcher below now asserts
// ZERO fallback-shaped entries survive in either file, forever, not just the
// frozen three. `SymbolConfig`'s `fallback` field and both files'
// normalization-object mechanism were removed alongside the last entries,
// per this file's own "a mechanism with zero entries is not kept" rule.
const EDGE_FUNCTION_SYMBOL_MAP_PATHS = [
  "supabase/functions/market-data/index.ts",
  "supabase/functions/trade-analyzer/symbols.ts",
];

// Every fallback-shaped entry ("SYMBOL: { primary: "...", fallback: "..."
// }") either file's own hardcoded symbolMap may carry — frozen at empty by
// Task 16c. Reintroducing even one — WTI/USO or any of ASX/DAX/NSDQ's ETF
// stand-ins — fails here even though neither file's literal text ever gets
// imported into this suite for that symbol.
const FROZEN_FALLBACK_ENTRIES: string[] = [];

// Every code file allowed to reference the provider. The two price paths
// carry the verified correspondence; macroContext (Treasury), news-calendar
// (economic calendar), and replay-sweep (offline research) are FMP consumers
// outside the price-identity claim but inside the single-provider rule.
const FMP_FILE_ALLOWLIST = [
  "scripts/replay-sweep.ts",
  "supabase/functions/market-data/index.ts",
  "supabase/functions/news-calendar/index.ts",
  "supabase/functions/trade-analyzer/macroContext.ts",
  "supabase/functions/trade-analyzer/marketLoader.ts",
];

// Any of these appearing in source outside its recorded allowance means a
// second market-data provider entered the codebase without a fresh feed
// verification. Finnhub is the one recorded exception: the economic
// calendar's env-gated alternate provider (news events, never prices),
// confined to news-calendar and pinned to its calendar endpoint below.
const RIVAL_PROVIDER_HOSTS = [
  "alpaca.markets",
  "alphavantage",
  "eodhistoricaldata",
  "finnhub",
  "iexcloud",
  "marketstack",
  "polygon.io",
  "quandl",
  "tiingo",
  "twelvedata",
];

const NON_PRICE_PROVIDER_ALLOWANCES: Record<string, string[]> = {
  finnhub: ["supabase/functions/news-calendar/index.ts"],
};

const CODE_ROOTS = ["src", "supabase/functions", "scripts"];

function walkCodeFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = join(root, entry);
    if (statSync(fullPath).isDirectory()) {
      return walkCodeFiles(fullPath);
    }
    return /\.(ts|tsx|mjs)$/.test(entry) ? [fullPath] : [];
  });
}

const codeFiles = CODE_ROOTS.flatMap((root) => walkCodeFiles(root));

// Final review (2026-08-04): extracts the literal SYMBOL: "value" entries out
// of a hardcoded symbolMap's own object-literal block, as an ordered array of
// [key, value] pairs — the same readFileSync-as-text idiom every other pin in
// this file uses, applied to the whole map instead of just its fallback-shaped
// entries. Returns an array (not a Record) so assert.deepEqual also catches an
// order difference, not just a membership or value one.
function extractSymbolMapEntries(path: string): Array<[string, string]> {
  const source = readFileSync(path, "utf8");
  const block = source.match(
    /const symbolMap: Record<string, string> = \{([\s\S]*?)\n\};/,
  );
  assert.ok(block, `${path} is missing the expected symbolMap declaration shape`);
  return [...block[1].matchAll(/^\s*([A-Z0-9]+): "([^"]+)",$/gm)].map(
    ([, key, value]) => [key, value] as [string, string],
  );
}

describe("feed source lock (§20i ruling 8)", () => {
  for (const path of PRICE_PATHS) {
    it(`${path} pins the verified FMP base and endpoints`, () => {
      const source = readFileSync(path, "utf8");
      assert.ok(
        source.includes('"https://financialmodelingprep.com/stable"'),
        `${path} lost the verified FMP base URL`,
      );
      assert.ok(
        source.includes("/historical-chart/${timeframe}"),
        `${path} lost the verified intraday endpoint`,
      );
      assert.ok(
        source.includes("/historical-price-eod/full"),
        `${path} lost the verified daily endpoint`,
      );
      assert.ok(
        source.includes('endpoint.searchParams.set("symbol"'),
        `${path} no longer passes the symbol as a query parameter (the /stable API shape)`,
      );
    });
  }

  it("the symbol map passes scannable markets to FMP verbatim, with only the recorded divergences", () => {
    // The complete divergence set as verified: cash-index sources for the
    // six non-scannable indices, and the two energy CFDs charting from
    // front-month futures (their basis check is the verification doc's open
    // item 2). Anything else diverging — or any of these changing — is a
    // feed change and needs a fresh frame. Task 16c retired the last three
    // fallbacks (ASX/DAX/NSDQ), so this pin no longer tracks a `fallback`
    // side-channel at all — divergence is fmpSymbol-vs-symbol only now.
    const recordedDivergences: Record<string, string> = {
      ASX: "^AXJO",
      BRENT: "BZUSD",
      DAX: "^GDAXI",
      DOW: "^DJI",
      NIKKEI: "^N225",
      NSDQ: "^NDX",
      SP: "^GSPC",
      WTI: "CLUSD",
    };

    const observedDivergences: Record<string, string> = {};
    for (const group of SECURITY_GROUPS) {
      for (const option of group.options) {
        if (option.fmpSymbol !== option.symbol) {
          assert.ok(
            group.label === "Indices" || group.label === "Energies",
            `${option.symbol} (${group.label}) diverges from its FMP symbol — pass-through was verified for ${group.label}`,
          );
          observedDivergences[option.symbol] = option.fmpSymbol;
        }
      }
    }

    assert.deepEqual(observedDivergences, recordedDivergences);
  });

  it("no security option carries a fallback source — every remaining one failed the scale bar (Task 16c)", () => {
    // Amendment 20's own words are "maximized and aligned precisely"; the
    // house law is no fallbacks that mask real problems. Task 16b removed
    // WTI's USO fallback (F10 measured +53.5% off CLUSD's scale;
    // docs/research/e8-feed-verification-2026-08-02.md) and audited the
    // three that were left. Task 16c acted on that audit: ASX -> EWA
    // (~304x off ^AXJO), NSDQ -> QQQ (~41x off ^NDX), and DAX -> "DAX"
    // (Global X - DAX Germany ETF, ~560x off ^GDAXI) all failed the
    // identical "tracks the primary's price level" bar (task-16b-report.md's
    // adjudication table), so all three are gone too — and with zero entries
    // left to hold, `fallbackFmpSymbol` is no longer a field `SecurityOption`
    // has at all. Checked via `in` rather than a direct property read: the
    // field's total absence from the type is the point, so reading it
    // directly would be a compile error, not a passing assertion.
    const symbolsWithFallback = SECURITY_OPTIONS
      .filter((option) => "fallbackFmpSymbol" in option)
      .map((option) => option.symbol)
      .sort();
    assert.deepEqual(symbolsWithFallback, []);

    const wti = SECURITY_OPTIONS.find((option) => option.symbol === "WTI");
    assert.ok(wti, "WTI must remain a known security option");
    assert.equal(wti?.fmpSymbol, "CLUSD");
  });

  for (const path of EDGE_FUNCTION_SYMBOL_MAP_PATHS) {
    it(`${path} carries no fallback of any kind (Task 16c)`, () => {
      const source = readFileSync(path, "utf8");
      // Broader than the exhaustive regex below: catches a fallback-shaped
      // entry even if it drifts from the exact spacing/quoting the regex
      // requires. This was scoped to a USO-specific substring in Task 16b's
      // fix round 1 (when ASX/DAX/NSDQ still legitimately carried a
      // fallback); Task 16c retired the mechanism entirely, so an
      // unconditional ban on the key shape is now correct — nothing left in
      // either file's symbol map should ever say "fallback: " again.
      assert.ok(
        !source.includes('fallback: "'),
        `${path} carries a fallback-shaped entry — Task 16c retired the mechanism entirely (docs/research/e8-feed-verification-2026-08-02.md Open Item 7)`,
      );
      // Exhaustive, not just targeted: every fallback-shaped entry in the
      // file, matched on its real line, must now be none at all — catching a
      // silent addition exactly as it would catch a reintroduction of WTI's
      // USO or any of ASX/DAX/NSDQ's removed ETF stand-ins.
      const fallbackEntries = source.match(
        /[A-Z0-9]+: \{ primary: "[^"]+", fallback: "[^"]+" \},/g,
      ) ?? [];
      assert.deepEqual(
        [...fallbackEntries].sort(),
        [...FROZEN_FALLBACK_ENTRIES].sort(),
        `${path}'s fallback entries drifted from the frozen, now-empty set — see docs/research/e8-feed-verification-2026-08-02.md Open Item 7 and task-16b-report.md/task-16c-report.md before changing this pin`,
      );
    });
  }

  it("both edge functions' own hardcoded symbolMaps carry identical keys, order, and values (final review)", () => {
    // Final review, Importance 2: a later pin's own comment claims
    // trade-analyzer/symbols.ts's isKnownSymbol "symbolMap keys are pinned
    // byte-identical to market-data/index.ts's own by the source-text pins
    // above" — true of the two maps TODAY, but until this pin existed, no
    // source-text check actually compared the two maps to each other; the
    // pins above only ever checked each file's fallback-shaped entries
    // (now zero) in isolation. This pin is what makes that claim
    // machine-true: the two files' independently hardcoded symbolMaps
    // (Deno Edge Functions are self-contained, so neither imports the
    // other) must carry exactly the same entries, in the same order.
    const marketDataEntries = extractSymbolMapEntries(
      EDGE_FUNCTION_SYMBOL_MAP_PATHS[0],
    );
    const analyzerEntries = extractSymbolMapEntries(
      EDGE_FUNCTION_SYMBOL_MAP_PATHS[1],
    );

    // Guards against the comparison being vacuously true if the extraction
    // regex ever stopped matching anything in either file.
    assert.ok(
      marketDataEntries.length >= 50,
      `${EDGE_FUNCTION_SYMBOL_MAP_PATHS[0]}'s symbolMap extraction found too few entries (${marketDataEntries.length}) — the extraction regex may have stopped matching`,
    );

    assert.deepEqual(
      marketDataEntries,
      analyzerEntries,
      `${EDGE_FUNCTION_SYMBOL_MAP_PATHS[0]} and ${
        EDGE_FUNCTION_SYMBOL_MAP_PATHS[1]
      } must carry the identical symbolMap — same keys, same order, same values`,
    );
  });

  it("market-data/index.ts refuses no-trade symbols before any provider fetch (Task 16c)", () => {
    // Task 16c: market-data gains the same no-trade gate trade-analyzer
    // already enforces (supabase/functions/trade-analyzer/index.ts's
    // reviewCurrentMarket, pinned independently by
    // tests/securityHardening.test.ts's "keeps cash indices out of every
    // scan path"). The SET is the analyzer's law, copied verbatim, never
    // edited here — this pin uses the identical regex idiom that one does,
    // against market-data/index.ts's own independent copy.
    const source = readFileSync(
      "supabase/functions/market-data/index.ts",
      "utf8",
    );

    for (
      const sym of [
        "SP",
        "NSDQ",
        "DOW",
        "NIKKEI",
        "DAX",
        "NGUSD",
        "HGUSD",
        "BNBUSD",
      ]
    ) {
      assert.match(
        source,
        new RegExp(
          `noTradeSymbols = new Set<string>\\(\\[[\\s\\S]*?"${sym}"[\\s\\S]*?\\]\\)`,
        ),
        `market-data/index.ts's noTradeSymbols is missing ${sym} — it must mirror trade-analyzer/symbols.ts's set exactly`,
      );
    }

    // Fix round 1: checking the request symbol string against noTradeSymbols
    // alone isn't enough — normalizeSymbol("^NDX") is "NDX", not "NSDQ", so an
    // FMP alias (or the pre-existing ASX variant, "^AXJO") normalized past
    // the gate to a real provider fetch. The fix resolves IDENTITY first:
    // isKnownSymbol, the same function name and shape
    // trade-analyzer/symbols.ts exports, and the same precondition
    // trade-analyzer's own scanOpportunities applies to every requested
    // symbol before any of it (including reviewCurrentMarket's own
    // noTradeSymbols check) ever runs. Refusing anything that isn't a
    // canonical symbolMap key closes the alias hole and the ASX variant in
    // the same gate — neither ever reaches resolveProviderSymbols.
    assert.match(
      source,
      /function isKnownSymbol\(symbol: string\) \{\s*return normalizeSymbol\(symbol\) in symbolMap;\s*\}/,
      "market-data/index.ts must resolve identity via its own isKnownSymbol, mirroring trade-analyzer/symbols.ts's function of the same name",
    );

    // Refused before resolveProviderSymbols ever runs, and before either the
    // no-trade or temporarily-unavailable gate — "before any provider fetch"
    // is the brief's own bar, checked structurally rather than by running
    // the handler (Deno-global file, cannot be imported here).
    const isKnownIndex = source.indexOf("if (!isKnownSymbol(uiSymbol))");
    const gateIndex = source.indexOf("noTradeSymbols.has(uiSymbol)");
    const unavailableIndex = source.indexOf(
      "temporarilyUnavailableSymbols.has(uiSymbol)",
    );
    const resolveIndex = source.indexOf(
      "resolveProviderSymbols(requestedSymbol)",
    );
    assert.ok(
      isKnownIndex > -1 && gateIndex > -1 && unavailableIndex > -1 &&
        resolveIndex > -1 &&
        isKnownIndex < gateIndex && isKnownIndex < unavailableIndex &&
        gateIndex < resolveIndex,
      "market-data/index.ts must resolve identity (isKnownSymbol) before the no-trade gate, the temporarily-unavailable gate, and resolveProviderSymbols",
    );

    // The refusal shape mirrors trade-analyzer's own no-trade block exactly
    // (supabase/functions/trade-analyzer/index.ts's reviewCurrentMarket) —
    // no new copy invented, per the Task 16c brief.
    assert.match(
      source,
      /if \(noTradeSymbols\.has\(uiSymbol\)\) \{[\s\S]{0,200}?blocked: true,[\s\S]{0,200}?reason:\s*\n\s*"Levelflow's measured record says this market does not earn setups, so reviews are off for it\. It stays under analysis and returns if the data changes\."/,
      "market-data/index.ts's no-trade refusal must match trade-analyzer's blocked/reason copy verbatim",
    );

    // Unknown-symbol refusal reuses the existing "Unsupported Levelflow
    // market symbol" copy (the same string resolveProviderSymbols's own
    // empty-result branch already used) rather than inventing new copy.
    assert.match(
      source,
      /if \(!isKnownSymbol\(uiSymbol\)\) \{[\s\S]{0,120}?"Unsupported Levelflow market symbol"[\s\S]{0,40}?400,/,
      "market-data/index.ts's unknown-symbol refusal must reuse the existing 'Unsupported Levelflow market symbol' copy at 400",
    );
  });

  it("no no-trade or hidden index's own FMP alias is itself a known Levelflow symbol (Task 16c, fix round 1)", () => {
    // The data-level property the isKnownSymbol gate depends on, proved by
    // execution rather than inspection: trade-analyzer/symbols.ts's real
    // isKnownSymbol (its symbolMap keys are pinned byte-identical to
    // market-data/index.ts's own by the source-text pins above) says none of
    // these six Indices' cash-ticker FMP aliases collides with a canonical
    // Levelflow symbol name. That is exactly what makes "isKnownSymbol(alias)
    // is false" the correct, general refusal condition — an FMP alias is
    // never accidentally indistinguishable from a real Levelflow symbol.
    const indexSymbols = ["SP", "NSDQ", "DOW", "NIKKEI", "DAX", "ASX"];
    const indexOptions = SECURITY_OPTIONS.filter((option) =>
      indexSymbols.includes(option.symbol)
    );
    assert.equal(indexOptions.length, indexSymbols.length);
    for (const option of indexOptions) {
      assert.equal(
        isKnownSymbol(option.fmpSymbol),
        false,
        `${option.symbol}'s own FMP alias (${option.fmpSymbol}) must not itself resolve as a known Levelflow symbol`,
      );
    }
  });

  it("financialmodelingprep appears only in the recorded wiring files", () => {
    const referencingFiles = codeFiles
      .filter((path) => readFileSync(path, "utf8").includes("financialmodelingprep"))
      .sort();
    assert.deepEqual(referencingFiles, FMP_FILE_ALLOWLIST);
  });

  it("no rival market-data provider host exists outside its recorded allowance", () => {
    for (const host of RIVAL_PROVIDER_HOSTS) {
      const referencingFiles = codeFiles
        .filter((path) => readFileSync(path, "utf8").toLowerCase().includes(host))
        .sort();
      assert.deepEqual(
        referencingFiles,
        NON_PRICE_PROVIDER_ALLOWANCES[host] ?? [],
        `${host} appears outside its recorded allowance — a second market-data provider requires a fresh feed verification (docs/research/e8-feed-verification-2026-08-02.md)`,
      );
    }
  });

  it("the finnhub allowance covers the calendar endpoint only, never prices", () => {
    const source = readFileSync(
      "supabase/functions/news-calendar/index.ts",
      "utf8",
    );
    const finnhubUrls = source.match(/https:\/\/finnhub\.io[^"']*/g) ?? [];
    assert.deepEqual(finnhubUrls, ["https://finnhub.io/api/v1/calendar/economic"]);
  });
});
