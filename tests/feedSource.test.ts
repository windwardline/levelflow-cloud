import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SECURITY_GROUPS } from "../src/lib/symbolMap";

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
      WTI: { fallback: "USO", fmp: "CLUSD" },
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
