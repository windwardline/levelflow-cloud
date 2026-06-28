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
