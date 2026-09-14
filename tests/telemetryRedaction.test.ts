import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { redactProviderSecrets } from "../supabase/functions/trade-analyzer/redact.ts";

/**
 * On 2026-08-07 nine `quote_fetch` rows landed in `analyzer_events` carrying
 * the provider request URL — query string, `apikey=` and all — because the
 * loader records a transport error's message verbatim. The table is readable
 * only by the service role, but a credential in a table is a credential in
 * every backup of it. The scrub sits at the one place every message passes
 * (recordAnalyzerEvent), and the branch that used to swallow a payload with
 * no bid/ask now files a row, so a quote bank that never banks says why.
 */

describe("redactProviderSecrets", () => {
  it("replaces the value of apikey and its siblings, keeps the name, and leaves the rest of the message", () => {
    const denoStyle =
      "error sending request from 10.0.0.1:1 for https://financialmodelingprep.com/stable/quote?symbol=BNBUSD&apikey=Pf5lSECRET0 (52.54.20.167:443): client error (SendRequest): http2 error";
    const scrubbed = redactProviderSecrets(denoStyle);
    assert.doesNotMatch(scrubbed, /Pf5lSECRET0/);
    assert.match(scrubbed, /symbol=BNBUSD&apikey=REDACTED \(52\.54\.20\.167:443\)/);
    assert.equal(redactProviderSecrets("https://x/y?apikey=abc&symbol=EURUSD"), "https://x/y?apikey=REDACTED&symbol=EURUSD");
    assert.equal(redactProviderSecrets("GET /v3/fx?token=t0k3n&key=k3y done"), "GET /v3/fx?token=REDACTED&key=REDACTED done");
    // Deno's own fetch error shape: the URL sits inside parentheses.
    assert.equal(
      redactProviderSecrets("error sending request for url (https://fmp/stable/quote?symbol=EURUSD&apikey=K3Y): client error"),
      "error sending request for url (https://fmp/stable/quote?symbol=EURUSD&apikey=REDACTED): client error",
    );
    assert.equal(redactProviderSecrets("FMP quote request failed (429)"), "FMP quote request failed (429)");
    assert.equal(redactProviderSecrets("the keyword apikey appears with no value"), "the keyword apikey appears with no value");
  });
});

describe("every recorded message passes through the scrub — pinned at the choke point", () => {
  it("recordAnalyzerEvent files redactProviderSecrets(message), never the message itself", () => {
    const source = readFileSync("supabase/functions/trade-analyzer/telemetry.ts", "utf8");
    assert.match(
      source,
      /message: event\.message === undefined \|\| event\.message === null\n\s*\? null\n\s*: redactProviderSecrets\(event\.message\),/,
    );
    assert.doesNotMatch(source, /message: event\.message \?\? null,/, "the unscrubbed form is gone");
  });
});

describe("provider error text is scrubbed where it is born — pinned at the source", () => {
  // The same error.message reaches sinks the telemetry choke point never
  // sees: providerFailures → analyzer_events.metadata, the HTTP response and
  // trade_setups.confluence; providerWarnings → market_data_health (readable
  // by authenticated, on the realtime publication). The loader is Edge-only,
  // so the five sites are pinned by their source.
  it("scrubs providerFailures, providerWarnings, both recorded messages and the rethrow", () => {
    const loader = readFileSync("supabase/functions/trade-analyzer/marketLoader.ts", "utf8");
    assert.match(loader, /providerFailures\.push\(\n\s*`\$\{providerSymbol\}: \$\{\n\s*error instanceof Error \? redactProviderSecrets\(error\.message\) : "FMP request failed"/);
    assert.match(loader, /providerWarnings\.push\(\n\s*`\$\{timeframe\}: \$\{\n\s*error instanceof Error\n\s*\? redactProviderSecrets\(error\.message\)/);
    assert.match(loader, /message: error instanceof Error \? redactProviderSecrets\(error\.message\) : "FMP quote failed",/);
    assert.match(loader, /message: error instanceof Error \? redactProviderSecrets\(error\.message\) : "FMP request failed",/);
    assert.match(loader, /if \(error instanceof Error\) \{\n\s*error\.message = redactProviderSecrets\(error\.message\);\n\s*\}\n\s*throw error;/);
    assert.doesNotMatch(loader, /\? error\.message\b/, "no raw error.message survives in the loader");
  });

  it("news-calendar uses the one scrub, not a local twin", () => {
    const source = readFileSync("supabase/functions/news-calendar/index.ts", "utf8");
    assert.match(source, /import \{ redactProviderSecrets \} from "\.\.\/trade-analyzer\/redact\.ts";/);
    assert.match(source, /return redactProviderSecrets\(message\)\.slice\(0, 400\);/);
    assert.doesNotMatch(source, /\(apikey\|token\)=/, "the local regex is gone");
  });
});

describe("a quote payload with no bid/ask is a recorded error, not silence — pinned at the source", () => {
  // The loader is Edge-only (Deno globals), so the branch is pinned by its
  // source: parseFmpQuoteSnapshot's refusal of a payload without bid/ask is
  // behaviourally tested in tests/executionQuality.test.ts, and this pins
  // that the loader files a row when it gets one instead of returning null.
  it("records an error naming the cause before returning null", () => {
    const loader = readFileSync("supabase/functions/trade-analyzer/marketLoader.ts", "utf8");
    assert.match(
      loader,
      /const quote = parseFmpQuoteSnapshot\(payload\);\n\s*if \(!quote\) \{[\s\S]{0,900}?await recordEvent\(\{\n\s*action: "quote_fetch",\n\s*durationMs,\n\s*message: "FMP quote payload carries no usable bid\/ask",\n\s*metadata: \{[\s\S]{0,300}?\},\n\s*providerSymbol: fmpSymbol,\n\s*status: "error",\n\s*\}\);\n\s*return null;/,
    );
  });
});
