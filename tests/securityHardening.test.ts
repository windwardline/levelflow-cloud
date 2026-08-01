import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { cleanExternalUrl } from "../src/lib/urlSafety";

describe("security hardening", () => {
  it("keeps analyzer rate limits service-role only", () => {
    const initSql = readFileSync("supabase/init.sql", "utf8");
    const analyzerSource = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );

    assert.match(initSql, /alter table public\.analyzer_rate_limits enable row level security/);
    assert.match(initSql, /revoke all on public\.analyzer_rate_limits from anon, authenticated/);
    assert.match(
      initSql,
      /revoke all on function public\.claim_analyzer_request\(uuid, text, integer, integer\) from public, anon, authenticated/,
    );
    assert.match(
      initSql,
      /grant execute on function public\.claim_analyzer_request\(uuid, text, integer, integer\) to service_role/,
    );
    assert.match(analyzerSource, /scan_opportunities:\s*8/);
    assert.match(
      analyzerSource,
      /const rateLimit = await claimAnalyzerRequest\(user\.id, actionName\);[\s\S]*if \(!rateLimit\.allowed\)/,
    );
  });

  it("keeps scheduled sync endpoints token-gated and deployed", () => {
    const outcomeSync = readFileSync(
      "supabase/functions/outcome-sync/index.ts",
      "utf8",
    );
    const configToml = readFileSync("supabase/config.toml", "utf8");
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

    // The sync endpoint must refuse unauthenticated calls before any work.
    assert.match(outcomeSync, /if \(!isAuthorized\(req\)\)/);
    assert.match(
      outcomeSync,
      /NEWS_SYNC_TOKEN && token === NEWS_SYNC_TOKEN/,
    );
    // Platform JWT verification is off only for the token-gated jobs.
    assert.match(
      configToml,
      /\[functions\.outcome-sync\]\s*\nverify_jwt = false/,
    );
    // The function ships with every deploy.
    assert.match(
      workflow,
      /functions deploy market-data trade-analyzer news-calendar outcome-sync/,
    );
  });

  it("watches scheduled sync jobs for silent failure", () => {
    const watchdog = readFileSync(
      "supabase/migrations/20260729040000_scheduled_sync_watchdog.sql",
      "utf8",
    );

    // Cron firing is not proof of success: both the transport failures and
    // the data-freshness symptom must be surfaced.
    assert.match(watchdog, /levelflow-sync-watchdog/);
    assert.match(watchdog, /net\._http_response/);
    assert.match(watchdog, /status_code >= 300/);
    assert.match(watchdog, /future_events = 0/);
    assert.match(watchdog, /'sync_watchdog'/);
  });

  it("gives scheduled sync calls headroom beyond pg_net's 5s default", () => {
    const timeouts = readFileSync(
      "supabase/migrations/20260729190000_raise_sync_call_timeouts.sql",
      "utf8",
    );

    // A slow-but-successful function run must not register as a failure,
    // or the watchdog alarms on runs that lost no data.
    assert.match(timeouts, /levelflow-news-calendar-sync/);
    assert.match(timeouts, /levelflow-outcome-sync/);
    const timeoutCount =
      timeouts.match(/timeout_milliseconds := 15000/g)?.length ?? 0;
    assert.equal(timeoutCount, 2);
  });

  it("keeps cash indices out of every scan path", () => {
    const symbols = readFileSync(
      "supabase/functions/trade-analyzer/symbols.ts",
      "utf8",
    );
    const analyzer = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const symbolMap = readFileSync("src/lib/symbolMap.ts", "utf8");

    // The measured no-trade list (r15): server truth in noTradeSymbols,
    // scan exclusion aliased to it, UI mirror in NO_TRADE_SYMBOLS.
    for (const sym of ["SP", "NSDQ", "DOW", "NIKKEI", "DAX", "NGUSD", "HGUSD", "BNBUSD"]) {
      assert.match(symbols, new RegExp(`noTradeSymbols = new Set<string>\\(\\[[\\s\\S]*?"${sym}"[\\s\\S]*?\\]\\)`));
      assert.match(symbolMap, new RegExp(`NO_TRADE_SYMBOLS = new Set\\(\\[[\\s\\S]*?"${sym}"[\\s\\S]*?\\]\\)`));
    }
    assert.match(symbols, /noScanSymbols = noTradeSymbols/);
    // The server refuses setup generation on no-trade markets — the block is
    // not a UI courtesy.
    assert.match(analyzer, /noTradeSymbols\.has\(normalizedSymbol\)/);
    // The server filters requested scan symbols, not just the default list.
    assert.match(analyzer, /!noScanSymbols\.has\(symbol\)/);
  });

  it("keeps deploy-time security header verification in CI", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

    assert.match(workflow, /permissions:\s*\n\s*contents: read/);
    assert.match(workflow, /concurrency:\s*\n\s*group: deploy-\$\{\{ github\.ref \}\}/);
    assert.match(workflow, /timeout-minutes: 20/);
    assert.match(workflow, /Verify production security headers/);
    assert.match(workflow, /content-security-policy/);
    assert.match(workflow, /x-frame-options/);
    assert.match(workflow, /x-content-type-options/);
    assert.match(workflow, /permissions-policy/);
    assert.match(workflow, /cross-origin-opener-policy/);
  });

  it("documents the Cloudflare header contract", () => {
    const hardeningDoc = readFileSync("docs/security-hardening.md", "utf8");

    assert.match(hardeningDoc, /frame-ancestors 'none'/);
    assert.match(hardeningDoc, /object-src 'none'/);
    assert.match(hardeningDoc, /X-Frame-Options/);
    assert.match(hardeningDoc, /DENY/);
    assert.match(hardeningDoc, /Permissions-Policy/);
    assert.match(hardeningDoc, /Cross-Origin-Opener-Policy/);
  });

  it("allows only HTTPS payment links from deployment variables", () => {
    assert.equal(
      cleanExternalUrl(" https://buy.stripe.com/example "),
      "https://buy.stripe.com/example",
    );
    assert.equal(cleanExternalUrl("javascript:alert(1)"), "");
    assert.equal(cleanExternalUrl("http://example.com/donate"), "");
    assert.equal(cleanExternalUrl("mailto:support@windwardline.com"), "");
  });

  it("renames auth mail branding only with the full SMTP block", () => {
    const script = readFileSync("scripts/ops/update-auth-brand.sh", "utf8");
    for (const key of ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_admin_email", "smtp_sender_name", "smtp_max_frequency", "mailer_subjects_magic_link"]) {
      assert.match(script, new RegExp(key), key);
    }
    assert.match(script, /Your Levelflow sign-in link/);
    assert.match(script, /"smtp_sender_name":\s*"Levelflow"/);
    assert.match(script, /security find-generic-password/);
    assert.doesNotMatch(script, /re_[A-Za-z0-9]{10,}/); // no hardcoded Resend key
    assert.match(script, /--fail-with-body/);
    // Failure diagnostics must pass through the message filter, never a
    // raw body echo that could carry smtp_pass back to the terminal.
    assert.doesNotMatch(script, /echo "\$resp"/);
    assert.match(script, /PATCH failed/);
  });
});

// The production style-src carries exactly one hash, for exactly one stylesheet:
// lightweight-charts' attribution widget builds a `<style>` element and assigns
// its text, and `style-src 'self'` blocked it — the element landed with no sheet,
// so the attribution link lost its positioning AND its fill (its --fill/--stroke
// live in that rule) and rendered as an invisible box inside the chart's layout.
// The comment above MarketChart carries the reproduction.
//
// The hash is derived here from the library actually installed rather than
// restated, because that is the only thing that makes it maintainable: a version
// bump that re-values the stylesheet becomes a failing build instead of the same
// silent violation quietly returning.
describe("the chart library's one inline stylesheet is allowed by content hash, and nothing else is", () => {
  const CSP = (() => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const header = vercel.headers
      .flatMap((entry) => entry.headers)
      .find((entry) => entry.key === "Content-Security-Policy");
    assert.ok(header, "expected a Content-Security-Policy header");
    return header.value;
  })();
  const styleSrc = CSP.split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("style-src")) ?? "";

  it("hashes the stylesheet the installed lightweight-charts actually injects", async () => {
    const { createHash } = await import("node:crypto");
    const bundle = readFileSync(
      "node_modules/lightweight-charts/dist/lightweight-charts.production.mjs",
      "utf8",
    );
    // The widget's own literal, read out of the bundle: the a#tv-attr-logo rules
    // as assigned to the style element's text.
    const injected = bundle.match(
      /innerText\s*=\s*"(a#tv-attr-logo\{[^"]*\})"/,
    )?.[1];
    assert.ok(
      injected,
      "lightweight-charts no longer injects a stylesheet by this shape — " +
        "re-derive the hash, or drop it if the injection is gone",
    );
    const hash = createHash("sha256").update(injected, "utf8").digest("base64");
    assert.ok(
      styleSrc.includes(`'sha256-${hash}'`),
      `style-src must carry 'sha256-${hash}' for the chart library's ` +
        `attribution stylesheet; it reads: ${styleSrc}`,
    );
  });

  it("keeps style-src otherwise strict — a hash is an allowlist of one, not a loosening", () => {
    assert.match(styleSrc, /^style-src 'self' 'sha256-[A-Za-z0-9+/=]+'$/);
    assert.doesNotMatch(CSP, /unsafe-inline/);
    assert.doesNotMatch(CSP, /unsafe-eval/);
    // 'unsafe-hashes' is what would extend hashing to inline style ATTRIBUTES.
    // It stays out: those are still refused, exactly as before this hash.
    assert.doesNotMatch(CSP, /unsafe-hashes/);
  });

  it("leaves the rest of the policy exactly as hardened", () => {
    for (const directive of [
      "default-src 'self'",
      "script-src 'self' https://static.cloudflareinsights.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]) {
      assert.ok(CSP.includes(directive), directive);
    }
  });
});
