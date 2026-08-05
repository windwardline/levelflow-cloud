import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SECURITY_GROUPS, SECURITY_OPTIONS } from "../src/lib/symbolMap";

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
// tests/core.test.ts), but its coverage there only exercises the three
// symbols someone happened to call resolveProviderSymbols on for another
// reason (NSDQ, WTI, ASX) — DAX's fallback has never been asserted through
// that door. Fix round 1 (2026-08-04): a source-text pin, the same idiom
// tests/mobileNav.test.ts's APP_SOURCE uses, covers both files identically
// and exhaustively, so neither gap survives a future edit that touches only
// one of them.
const EDGE_FUNCTION_SYMBOL_MAP_PATHS = [
  "supabase/functions/market-data/index.ts",
  "supabase/functions/trade-analyzer/symbols.ts",
];

// Every fallback-shaped entry ("SYMBOL: { primary: "...", fallback: "..."
// }") either file's own hardcoded symbolMap may carry today — byte-identical
// in both files (verified below, not assumed). Adding, changing, or
// reintroducing one — WTI/USO included — fails here even though neither
// file's literal text ever gets imported into this suite for that symbol.
const FROZEN_FALLBACK_ENTRIES = [
  'ASX: { primary: "^AXJO", fallback: "EWA" },',
  'DAX: { primary: "^GDAXI", fallback: "DAX" },',
  'NSDQ: { primary: "^NDX", fallback: "QQQ" },',
];

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
    // feed change and needs a fresh frame.
    const recordedDivergences: Record<
      string,
      { fallback?: string; fmp: string }
    > = {
      ASX: { fallback: "EWA", fmp: "^AXJO" },
      BRENT: { fmp: "BZUSD" },
      DAX: { fallback: "DAX", fmp: "^GDAXI" },
      DOW: { fmp: "^DJI" },
      NIKKEI: { fmp: "^N225" },
      NSDQ: { fallback: "QQQ", fmp: "^NDX" },
      SP: { fmp: "^GSPC" },
      WTI: { fmp: "CLUSD" },
    };

    const observedDivergences: Record<
      string,
      { fallback?: string; fmp: string }
    > = {};
    for (const group of SECURITY_GROUPS) {
      for (const option of group.options) {
        const diverges = option.fmpSymbol !== option.symbol ||
          option.fallbackFmpSymbol !== undefined;
        if (diverges) {
          assert.ok(
            group.label === "Indices" || group.label === "Energies",
            `${option.symbol} (${group.label}) diverges from its FMP symbol — pass-through was verified for ${group.label}`,
          );
          observedDivergences[option.symbol] = {
            ...(option.fallbackFmpSymbol
              ? { fallback: option.fallbackFmpSymbol }
              : {}),
            fmp: option.fmpSymbol,
          };
        }
      }
    }

    assert.deepEqual(observedDivergences, recordedDivergences);
  });

  it("WTI carries no fallback — F10 measured USO ~53% off CLUSD's scale (Task 16b)", () => {
    // Amendment 20's own words are "maximized and aligned precisely"; the
    // house law is no fallbacks that mask real problems. F10 measured USO
    // at +53.5% vs CLUSD (docs/research/e8-feed-verification-2026-08-02.md)
    // and a live re-check the same day (Task 16b) reconfirmed it: USO
    // $115.78 vs CLUSD $75.87, +52.6%. A fund share price is not a
    // per-barrel number, at any tolerance — the honest behavior when CLUSD
    // has no bars is the existing no-data path, not a silent, scale-broken
    // substitute that would corrupt every level, stop and target computed
    // from it while still looking like real data.
    const wti = SECURITY_OPTIONS.find((option) => option.symbol === "WTI");
    assert.ok(wti, "WTI must remain a known security option");
    assert.equal(wti?.fmpSymbol, "CLUSD");
    assert.equal(wti?.fallbackFmpSymbol, undefined);
  });

  it("no symbol may gain a fallback the same scale audit hasn't cleared (Task 16b)", () => {
    // The rule, not just the WTI instance: a fallback is legitimate only
    // when its series tracks the primary's PRICE LEVEL (not merely its
    // direction) closely enough that a silent substitution cannot corrupt a
    // computed level, stop or target. Every symbol below was live-audited
    // against that bar on 2026-08-04 (Task 16b, task-16b-report.md) and
    // EVERY ONE fails it, same as WTI's removed USO fallback did — none is
    // fixed here because none is reachable from a live setup today:
    //   - ASX -> EWA (iShares MSCI Australia ETF, ~304x off ^AXJO): blocked
    //     before any provider fetch in both edge functions
    //     (isTemporarilyUnavailableSymbol / temporarilyUnavailableSymbols).
    //   - NSDQ -> QQQ (Invesco QQQ Trust, ~41x off ^NDX) and
    //     DAX -> "DAX" (Global X - DAX Germany ETF, ~560x off ^GDAXI): both
    //     blocked in the analyzer (noTradeSymbols gates reviewCurrentMarket
    //     before resolveProviderSymbols runs), but NOT gated in
    //     supabase/functions/market-data/index.ts, whose own
    //     temporarilyUnavailableSymbols set names only ASX — a defense-in-
    //     depth gap flagged in the research doc's Open Items, not fixed by
    //     this task (Task 16b's brief scoped the code change to WTI, the
    //     one instrument F10 actually measured and ruled on).
    // docs/research/e8-fmp-crossmap.md:350 named the general shape of this
    // ("ETF fallbacks are a fourth price scale") back on 2026-08-02; this
    // assertion is what makes it a build failure, not just a comment, the
    // day any of these three either gains a live path or a fourth symbol
    // gains a fallback without going through the same audit.
    const symbolsWithFallback = SECURITY_OPTIONS
      .filter((option) => option.fallbackFmpSymbol !== undefined)
      .map((option) => option.symbol)
      .sort();
    assert.deepEqual(symbolsWithFallback, ["ASX", "DAX", "NSDQ"]);
  });

  for (const path of EDGE_FUNCTION_SYMBOL_MAP_PATHS) {
    it(`${path} carries no scale-broken fallback, and none it doesn't already (Task 16b, fix round 1)`, () => {
      const source = readFileSync(path, "utf8");
      // Scoped to the object-literal shape a price fallback actually takes
      // ("fallback: "USO""), not a bare "USO" substring: this same file
      // legitimately says "USO" elsewhere and would false-positive on a
      // blanket ban — market-data/index.ts's own explanatory comment above
      // the WTI entry, and trade-analyzer/symbols.ts's comment plus its
      // separate, out-of-scope headlineNewsSymbols news-ticker proxy list
      // (CLUSD/WTI -> ["USO", "CLUSD"], never a "fallback:" key) — none of
      // which is the price-substitution mechanism this pin guards.
      assert.ok(
        !source.includes('fallback: "USO"'),
        `${path} reintroduces a USO price fallback — F10 measured USO ~53% off CLUSD's scale (docs/research/e8-feed-verification-2026-08-02.md)`,
      );
      // Exhaustive, not just targeted: every fallback-shaped entry in the
      // file, matched on its real line, must be exactly the frozen three —
      // catching a silent addition (a fourth entry) exactly as it catches a
      // reintroduction or edit of one of the three.
      const fallbackEntries = source.match(
        /[A-Z0-9]+: \{ primary: "[^"]+", fallback: "[^"]+" \},/g,
      ) ?? [];
      assert.deepEqual(
        [...fallbackEntries].sort(),
        [...FROZEN_FALLBACK_ENTRIES].sort(),
        `${path}'s fallback entries drifted from the frozen, scale-adjudicated set — see docs/research/e8-feed-verification-2026-08-02.md Open Item 7 and task-16b-report.md before changing this pin`,
      );
    });
  }

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
