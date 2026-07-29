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
});
