import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  // The 1-minute bar bank (docs/minute-bank.md): appends FMP's rolling 3-day
  // 1-minute window to a durable store so intrabar order becomes answerable
  // later. Read-only against the feed and never a price path into the
  // product — it writes to disk, and nothing in the product reads it yet.
  "scripts/bank-minute-bars.ts",
  // The 1-minute availability probe (round 28): reports coverage, depth and
  // recency per market so the resolution question can be answered before any
  // per-symbol geometry is tuned at 15-minute bars. Same standing as the bank
  // above — reads the feed, writes a report, and is not a price path.
  "scripts/probe-minute-bars.ts",
  "scripts/replay-sweep.ts",
  // The match-confirmation gate (owner directive, 2026-08-05): probes every
  // master-list row's FMP mate for real, deep, current bars and exits
  // non-zero when a SERVED market's feed lapses. It reads the feed to prove
  // the mapping, and writes nothing to it — an offline verifier, never a
  // second price path into the product.
  "scripts/verify-fmp-matches.ts",
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

// THE SURFACE IS DERIVED, NOT CURATED. `codeFiles` below walks three roots
// filtered to .ts/.tsx/.mjs, which is the right population for the wiring
// pins — but it is the wrong population for the LOCK, and the gap is
// load-bearing. All four Edge callers resolve
// `Deno.env.get("FMP_API_BASE_URL") ?? <verified literal>`, so the deployed
// value is whatever `.github/workflows/deploy.yml` writes into Supabase's
// function secrets — a YAML file outside CODE_ROOTS and outside the
// extension filter, on both axes. Every literal pin stayed green while
// production read an override the lock could not see.
//
// Adding ".github/workflows" to CODE_ROOTS would be the same mistake with a
// longer list: the real scan finds the provider named in tracked files no
// hand-picked root would have reached. So the lock walks `git ls-files` and
// deepEquals the result against a recorded allowlist. A new file naming the
// provider fails until it is recorded, wherever in the repository it lives.
const trackedTextFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
})
  .split("\0")
  .filter(Boolean)
  // Binary artefacts cannot name a provider in readable text and would only
  // add decode noise.
  .filter((path) => !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip)$/i.test(path));

// The lock's question is narrow: what can put a provider host into a RUNNING
// system? Two exclusions, each with a premise anyone can check rather than a
// list anyone must maintain.
//
//   *.md    — prose. It cannot issue a request and cannot configure a deploy.
//   tests/  — asserts ABOUT the wiring and is never shipped; the suite has to
//             name the provider in order to pin it.
//
// Everything else is in, whatever directory it sits in. That is the whole
// point: deploy.yml was invisible because the old walk chose three roots and
// three extensions, and the file that sets the deployed base URL matched
// neither.
function canReachProduction(path: string): boolean {
  return !path.endsWith(".md") && !path.startsWith("tests/");
}

function readTracked(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

// Files allowed to NAME the provider without CALLING it: they configure the
// base URL rather than fetch from it. deploy.yml is the one that matters —
// it sets FMP_API_BASE_URL in Supabase's function secrets, which every Edge
// caller prefers over its own pinned literal.
const FMP_CONFIG_ALLOWLIST = [
  ".env.example",
  ".github/workflows/deploy.yml",
];

// The verified base, as §20i ruling 8 observed it. deploy.yml must set this
// exact value: a host change there repoints every live price, quote,
// calendar, news and Treasury fetch, and no literal pin in any .ts file
// would move.
const VERIFIED_FMP_BASE = "https://financialmodelingprep.com/stable";

// Every external host the production-reaching surface names. Recorded rather
// than remembered: the denylist below can only catch a vendor someone thought
// of, while this fails on any host that is not here.
const EXTERNAL_HOST_ALLOWLIST: string[] = [
  // DEAD CONFIG, DELIBERATELY VISIBLE. Massive is this codebase's own legacy
  // market-data provider — migration 20260624044950_rename_provider_symbol.sql
  // renamed massive_symbol to provider_symbol. `MASSIVE_API_BASE_URL` and
  // `MASSIVE_API_KEY` survive in .env.example and NOTHING reads them: a
  // whole-repo search for MASSIVE_API returns that file alone. It sat outside
  // RIVAL_PROVIDER_HOSTS (nobody remembered it) AND outside the old scanned
  // surface (a dotfile, not .ts under three roots), so both halves of the
  // guard missed a second market-data provider named in the repository. It is
  // recorded here rather than deleted so that its becoming live would be an
  // edit to this line, reviewed like any other.
  "api.massive.com",
  "api.supabase.com",
  // The verified feed (§20i ruling 8).
  "financialmodelingprep.com",
  // The economic calendar's env-gated alternate — news events, never prices,
  // confined to news-calendar and pinned to its calendar endpoint below.
  "finnhub.io",
  // The broker whose platform the feed was verified against; documentation
  // and support links, no data path.
  "e8x.e8markets.com",
  "help.e8markets.com",
  "helpfutures.e8markets.com",
  // First-party.
  "levelflow.windwardline.com",
  "windwardline.com",
  // Toolchain and standards: linter docs, schema namespaces, registries,
  // funding links, Apple's touch-icon namespace, Vercel's OpenAPI spec, and
  // Supabase's placeholder project host in the example env.
  "eslint.org",
  "github.com",
  "openapi.vercel.sh",
  "opencollective.com",
  "registry.npmjs.org",
  "tidelift.com",
  "www.apple.com",
  "www.w3.org",
  "your-project-ref.supabase.co",
].sort();

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
        DAX: "^GDAXI",
      DOW: "^DJI",
      NIKKEI: "^N225",
      NSDQ: "^NDX",
      SP: "^GSPC",
      WTI: "CLUSD",
      // The four index futures onboarded 2026-08-05 on owner-accepted
      // cash-index proxies. FMP carries no Eurex or CME index-futures
      // contract, so each reads its underlying cash index — a deliberate,
      // owner-ruled divergence under amendment 23's situational-offset
      // protocol, and the reason the basis here is never written as a
      // constant: futures-vs-cash is carry, which decays to expiry.
      // FDAX and NKD intentionally duplicate DAX's and NIKKEI's series;
      // amendment 24 decides each account type separately, which requires it.
      // E8's own crypto spellings, onboarded 2026-08-06. Both traps: FMP calls
      // Arweave ARUSD, and FMP's literal TRUMPUSD is a DIFFERENT asset — the
      // match is OTRUMPUSD, so following the identical spelling would have
      // wired the wrong series while looking perfectly correct.
      ARWUSD: "ARUSD",
      TRUMPUSD: "OTRUMPUSD",
            // Group A's seven size variants, wired 2026-08-06. Each reads its
      // PARENT's series by construction — that is what makes it the same market
      // at a different notional rather than a market of its own — so the
      // divergence is the whole point, not a feed change to re-verify.
      MES: "ESUSD",
      MNQ: "NQUSD",
      MYM: "YMUSD",
      QM: "CLUSD",
      QG: "NGUSD",
      XK: "ZSUSX",
      XC: "ZCUSX",
        };

    const observedDivergences: Record<string, string> = {};
    for (const group of SECURITY_GROUPS) {
      for (const option of group.options) {
        if (option.fmpSymbol !== option.symbol) {
          assert.ok(
            group.label === "Indices" || group.label === "Energies" ||
              group.label === "Futures" || group.label === "Crypto",
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

  it("names the provider only in recorded files, across the WHOLE repository", () => {
    // The pin above walks three code roots filtered to .ts/.tsx/.mjs. This one
    // walks every tracked file, which is what caught deploy.yml — the file
    // that actually sets the deployed base URL.
    const naming = trackedTextFiles
      .filter(canReachProduction)
      .filter((path) => readTracked(path).includes("financialmodelingprep"))
      .sort();
    assert.deepEqual(
      naming,
      [...FMP_FILE_ALLOWLIST, ...FMP_CONFIG_ALLOWLIST].sort(),
      "a file naming the provider must be recorded, wherever it lives — " +
        "adding another hand-picked root instead is how deploy.yml stayed " +
        "invisible while production read its value",
    );
  });

  it("pins the base URL deploy.yml actually ships, not just the code's fallback", () => {
    // Every Edge caller resolves Deno.env.get("FMP_API_BASE_URL") ?? <literal>,
    // so the literal is only the fallback. The deployed value is this line.
    const deploy = readTracked(".github/workflows/deploy.yml");
    assert.ok(deploy.length > 0, "deploy.yml must exist to be pinned");
    assert.match(
      deploy,
      new RegExp(`FMP_API_BASE_URL=${VERIFIED_FMP_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"),
      "deploy.yml must set the VERIFIED base — a one-line edit here " +
        "repoints every live fetch and no .ts pin would move",
    );
    // And it must be inline, not a secrets lookup: the secrets.FMP_API_BASE_URL
    // it once read never existed, so the expression rendered empty and only the
    // || default saved it (#361 round 2).
    assert.doesNotMatch(
      deploy,
      /FMP_API_BASE_URL=\$\{\{\s*secrets\./,
      "a dead secrets reference renders empty — the shape that blanked " +
        "FINNHUB_API_KEY",
    );
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

  it("declares every external host it reaches, not just the rivals it remembers", () => {
    // RIVAL_PROVIDER_HOSTS is a DENYLIST of ten remembered vendor names
    // guarding an unbounded population — "any provider". It stays, because it
    // substring-matches raw text and so catches a vendor carrying no URL at
    // all: an SDK import, a base URL assembled from parts, or a bare env-var
    // name. A host regex catches none of those.
    //
    // This is its inverse, and the inverse is the one with a bounded
    // population: extract every external host the tracked, production-reaching
    // surface actually names, and deepEqual it against a recorded set. A new
    // vendor fails here whether or not anyone remembered to deny it.
    const hosts = new Set<string>();
    for (const path of trackedTextFiles.filter(canReachProduction)) {
      for (const match of readTracked(path).matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
        const host = match[1].toLowerCase();
        if (host === "localhost" || /^127\.|^0\.0\.0\.0/.test(host)) continue;
        hosts.add(host);
      }
    }
    assert.deepEqual([...hosts].sort(), EXTERNAL_HOST_ALLOWLIST);
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
