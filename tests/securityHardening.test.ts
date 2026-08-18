import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
    // 60, not 40, and not 8. A scan is a fan-out of ≤10-market requests since
    // the 2026-08-02 CPU failures, and the 2026-08-07 release took the universe
    // from 50 markets to 111 — so a full scan is 12 chunks, and 40 would have
    // rate-limited a scan against its own second half.
    // tests/scanBatching.test.ts holds the arithmetic (chunks × 5 ≤ limit);
    // this holds the number.
    //
    // The old note here argued safety from FMP's budget — "40 × ~70 is 2,800
    // against 3,000". That argument no longer holds and is not repaired by a
    // bigger number: a 111-market scan costs ~780 provider calls, so five full
    // scans is ~3,900 against 3,000, and chunk size cannot help because a
    // scan's provider cost is markets × 7 however they are grouped. Roughly
    // four full scans a minute is the physical ceiling, FMP enforces it rather
    // than this limiter, and the source comment beside the limit says so.
    assert.match(analyzerSource, /scan_opportunities: 60,/);

    // And the deploy-time flood must DERIVE this number rather than restate it.
    // On 2026-08-07 the budget moved 40 -> 60 and this pin was updated while
    // tests/e2e/analyzer-abuse.spec.ts kept its own `const SCAN_RATE_LIMIT = 40`
    // — so it fired 55 requests at a 60 limit and asserted a trip that could not
    // happen. `npm test` never loads Playwright, so every local gate was green and
    // the failure surfaced only in the deploy. A pin that guards a number while
    // the test USING it holds a stale copy is worse than no pin: it reports
    // safety it is not measuring.
    const abuseSource = readFileSync("tests/e2e/analyzer-abuse.spec.ts", "utf8");
    // A plain substring, not a regex-matching-a-regex. The first version of this
    // assertion was the latter and passed only through a double-escaping
    // coincidence — unreadable, and the wrong shape for a guard whose whole
    // purpose is being obviously right.
    assert.ok(
      abuseSource.includes(
        'readFileSync(\n    "supabase/functions/trade-analyzer/index.ts",',
      ),
      "the abuse flood must read the analyzer source to learn the limit",
    );
    assert.doesNotMatch(
      abuseSource,
      /const SCAN_RATE_LIMIT = \d+/,
      "the abuse flood must not hardcode the scan rate limit",
    );
    assert.match(
      analyzerSource,
      /const rateLimit = await claimAnalyzerRequest\(user\.id, actionName\);[\s\S]*if \(!rateLimit\.allowed\)/,
    );
  });

  it("makes a budget-exceeding scan request structurally impossible", () => {
    const analyzerSource = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );

    // The durable fix for the production 546s ("CPU Time exceeded"): the
    // request that could exceed the 2s CPU budget cannot be made. A cap the
    // server enforces, refused rather than truncated, and no empty-list form
    // that means "every market" any more.
    assert.match(analyzerSource, /const MAX_SCAN_SYMBOLS = 15;/);
    assert.match(
      analyzerSource,
      /if \(!Array\.isArray\(requested\) \|\| requested\.length === 0\) \{\s*return \{ reason: "A market scan must name the markets to scan\." \};/,
    );
    assert.match(
      analyzerSource,
      /if \(requested\.length > MAX_SCAN_SYMBOLS\) \{\s*return \{\s*reason:/,
    );
    // Refused before any engine work: no learning refresh, no provider fetch,
    // no telemetry insert a refused caller could force.
    const scanRefusal = analyzerSource.indexOf(
      "const scanRequest = readScanRequestSymbols(body.symbols);",
    );
    const learningRefresh = analyzerSource.indexOf(
      "const learningRefresh = await refreshGlobalStrategyWeightsThrottled();\n    const scan = await scanOpportunities(",
    );
    assert.ok(scanRefusal > -1 && learningRefresh > scanRefusal);
    // And the retired fallback is gone from the scan itself, not merely
    // unreachable from the door: normalization has no universe to fall back to.
    assert.equal(analyzerSource.includes(": defaultScanSymbols)"), false);
  });

  it("validates the scan trace instead of copying it into telemetry", () => {
    const analyzerSource = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );

    // The client names each scan so an operator can re-associate one click's
    // chunk rows. `analyzer_events.metadata` is the one column that takes free
    // JSON, and this is caller-supplied — so it is shape-checked, never spread
    // raw: a UUID-shaped string and two small integers, or nothing.
    const traceStart = analyzerSource.indexOf("function readScanTrace(");
    const traceEnd = analyzerSource.indexOf("type ScanTrace =");
    const traceSource = analyzerSource.slice(traceStart, traceEnd);
    assert.ok(traceStart > -1 && traceEnd > traceStart);
    assert.match(traceSource, /Number\.isInteger\(value\)/);
    assert.match(traceSource, /value >= 0 &&\s*value <= 99/);
    assert.match(traceSource, /\[0-9a-f\]\{8\}-/);
    assert.match(traceSource, /typeof body\.scanId === "string"/);
    // Nothing branches on it: a trace is a label on the record, never an input.
    assert.equal(analyzerSource.includes("if (trace."), false);
    assert.equal(analyzerSource.includes("scanTrace.scanId ?"), false);
  });

  it("validates the caller's build stamp the same way, and refuses nothing over it", () => {
    const analyzerSource = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );

    // The stamp is the client's own bundle filename, and it lands in the same free
    // JSON column the trace does — so it is read the same way: a bounded string
    // over a closed character set, or nothing at all. Sixty-four characters is
    // four times the length Vite's `index-<hash>.js` actually needs, and the set
    // admits no path separator, no whitespace, and no quote.
    const stampStart = analyzerSource.indexOf("function readBuildStamp(");
    const stampEnd = analyzerSource.indexOf("type ScanTrace =");
    const stampSource = analyzerSource.slice(stampStart, stampEnd);
    assert.ok(stampStart > -1 && stampEnd > stampStart);
    assert.match(stampSource, /typeof body\.buildStamp === "string"/);
    assert.match(stampSource, /\^\[A-Za-z0-9\._-\]\{1,64\}\$/);
    // Dropped silently, never refused: a malformed label on an otherwise valid
    // request must not cost the reader their scan. The refusals this file's other
    // tests pin are about the WORK a request asks for; this is about its name.
    assert.match(stampSource, /: undefined;/);
    assert.equal(
      analyzerSource.includes('error: "Invalid build stamp"'),
      false,
    );
    const stampReturns = stampSource.match(/return /g) ?? [];
    assert.equal(stampReturns.length, 1, "one expression, two outcomes");
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

  it("keeps the no-trade enforcement wired, whatever the list contains", () => {
    const symbols = readFileSync(
      "supabase/functions/trade-analyzer/symbols.ts",
      "utf8",
    );
    const analyzer = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const symbolMap = readFileSync("src/lib/symbolMap.ts", "utf8");

    // This used to name the eight cash-index and calibration exclusions as a
    // literal, which made it a pin on the LIST rather than on the enforcement.
    // The 2026-08-07 release emptied the list — a market E8 offers with an FMP
    // match is scanned, and the only ground for withholding is no verifiable
    // data source — and a literal pin would simply have had to be deleted.
    //
    // The enforcement is the thing worth guarding, so that is what is asserted:
    // the two declarations exist, the scan exclusion is aliased to the trade
    // one rather than maintained separately, and the server refuses both at
    // generation and at scan-symbol filtering. Whatever the list contains, it
    // is enforced in every path.
    assert.match(symbols, /noTradeSymbols = new Set<string>\(\[/);
    assert.match(symbolMap, /NO_TRADE_SYMBOLS = new Set<string>\(\[/);
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

  it("holds no gate credential in CI — the Keychain is the secret store (fleet credential law)", () => {
    // The 2026-08-17 rotations (fmp-api-key AND levelflow-newssync-token)
    // propagated to every Keychain-reading consumer with no edit and
    // missed the GitHub copies: the stale FMP key then overwrote
    // Supabase's good value on every deploy (runs 373/374 — "Invalid API
    // KEY"), and the news token's gate/caller copies were left behind.
    // Both gate credentials — and the Vault caller copy pg_cron reads —
    // are set only by scripts/ops/sync-function-secrets.sh from the
    // studio Keychain; CI never holds them again, and a convenience edit
    // re-adding one is a red build, not a quiet regression.
    // Every workflow, not just deploy.yml (fleet round 3): the incident
    // was a consumer nobody had listed, and a future convenience re-add
    // would land in a NEW workflow (HANDOFF discusses automating the
    // studio cron FMP readers) — the pin's scope is the law's scope: CI.
    for (const workflow of readdirSync(".github/workflows")) {
      if (!/\.ya?ml$/.test(workflow)) {
        continue;
      }
      const source = readFileSync(join(".github/workflows", workflow), "utf8");
      for (const credential of ["FMP_API_KEY", "NEWS_SYNC_TOKEN", "FINNHUB_API_KEY"]) {
        assert.equal(
          source.includes(`secrets.${credential}`),
          false,
          `${workflow} must not hold ${credential} — CI never carries gate credentials`,
        );
      }
    }

    const sync = readFileSync("scripts/ops/sync-function-secrets.sh", "utf8");
    assert.match(
      sync,
      /security find-generic-password -a peacock -s "\$1" -w/,
    );
    assert.match(sync, /keychain_read fmp-api-key/);
    assert.match(sync, /keychain_read levelflow-newssync-token/);
    assert.match(sync, /keychain_read supabase-db-levelflow/);
    assert.match(sync, /supabase secrets set --project-ref/);
    // The preflight resolves psql and a working database endpoint BEFORE
    // the first write — a run that rotates the gate half and dies on the
    // Vault half would CAUSE the split-token 401s (#361 finding 1).
    assert.match(sync, /command -v psql/);
    assert.ok(
      sync.indexOf("preflight ok") < sync.indexOf("supabase secrets set"),
      "the database preflight must precede the first write",
    );
    // The caller half moves with the gate half, or every hourly sync 401s:
    // the cron jobs read vault.news_sync_token at call time.
    assert.match(sync, /vault\.secrets where name = 'news_sync_token'/);
    assert.match(sync, /vault\.update_secret|vault\.create_secret/);
    // And the sync proves itself: one authenticated call must clear the
    // gate before the script reports success.
    assert.match(sync, /functions\/v1\/news-calendar/);
    assert.match(sync, /VERIFY FAILED/);
    // Values travel by 600-mode temp files, never argv — they must not
    // be readable in `ps` on the studio machine.
    assert.match(sync, /chmod 600/);
    assert.doesNotMatch(sync, /secrets set[^\n]*FMP_API_KEY=/);
    assert.doesNotMatch(sync, /secrets set[^\n]*NEWS_SYNC_TOKEN=/);

    // The conduit is recorded where operators actually read (fleet
    // re-review on #360): the deployment procedure and the README
    // checklist both name the script, and neither may drift back to an
    // argv-form `supabase secrets set FMP_API_KEY=…` — the second,
    // ungoverned path for exactly the key whose unlisted copy caused
    // the 2026-08-18 outage.
    const deployment = readFileSync("docs/deployment.md", "utf8");
    assert.match(deployment, /sync-function-secrets\.sh/);
    assert.doesNotMatch(
      deployment,
      /supabase secrets set[^\n]*FMP_API_KEY=/,
    );
    const readme = readFileSync("README.md", "utf8");
    assert.match(readme, /sync-function-secrets\.sh/);
    assert.doesNotMatch(readme, /supabase secrets set[^\n]*FMP_API_KEY=/);
  });

  it("never severs a deploy mid-flight", () => {
    const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");

    // Three deploys in one night were cancelled mid-run by successor merges,
    // and the cancel can land between `db push` and `functions deploy` —
    // database migrated, functions on old code, nothing raising an alarm.
    // A deploy that has started finishes. A literal, not an alternation,
    // same discipline as the parking-gate pin.
    assert.match(deploy, /cancel-in-progress: false/);
    assert.equal(deploy.includes("cancel-in-progress: true"), false);

    // The speed the cancel was buying comes back as a skip: a run whose
    // commit is no longer the branch tip exits before touching anything
    // live. Skip, not fail — a superseded deploy is not an error — and the
    // deploy job must actually consume the verdict or the check decorates.
    assert.match(deploy, /git\/ref\/heads/);
    assert.match(deploy, /needs\.preflight\.outputs\.superseded != 'true'/);

    // The cheap cancels stay where they belong: a superseded lint run
    // should die early, a superseded deploy must not. Pin the asymmetry in
    // both directions so a blanket edit in either cannot pass silently.
    for (const name of ["ci.yml", "security.yml", "claude-review.yml"]) {
      const workflow = readFileSync(`.github/workflows/${name}`, "utf8");
      assert.match(workflow, /cancel-in-progress: true/, name);
    }
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
    for (const key of ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_admin_email", "smtp_sender_name", "smtp_max_frequency", "mailer_subjects_magic_link", "mailer_templates_magic_link_content"]) {
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

  // Sender name, subject, and body are three separate auth-config fields, and
  // the body is the one a rename forgets. On 2026-07-30 two magic-link emails
  // went out addressed from "Levelflow" with a body that still said "LevelFlow"
  // and painted the retired navy button — the delivered HTML is recorded in
  // docs/research/magic-link-audit-2026-08-02.md. The subject and sender name
  // were already pinned above; the body was not, which is why it drifted alone.
  // Every line of the standing Windward Line template is pinned here, so the
  // next palette move fails CI instead of shipping a half-branded email.
  it("carries the whole magic-link body — Levelflow casing, current accent, standard copy", () => {
    const script = readFileSync("scripts/ops/update-auth-brand.sh", "utf8");
    // Assert against the template literal alone. Asserting over the whole file
    // would read the verifier's own `'LevelFlow' not in t` as the old casing.
    const template = /template = """([\s\S]*?)"""/.exec(script)?.[1];
    assert.ok(template, "the script must define the body template");
    assert.match(template, /<h2[^>]*>Sign in to Levelflow<\/h2>/);
    assert.match(
      template,
      /Click the button below to sign in\. This link expires in 15 minutes\./,
    );
    assert.match(template, /background-color:#2244FF;color:#ffffff/);
    assert.match(template, />Sign in<\/a>/);
    assert.match(template, /If you didn&#39;t request this, you can ignore it\./);
    // The retired pre-overhaul palette, navy included, must not come back —
    // tests/brandAssets.test.ts guards the icons against the same three.
    assert.doesNotMatch(template, /#111c38|#F7F8F4|#5B8266/i);
    assert.doesNotMatch(template, /LevelFlow/);
    // Dark-mode hardening (standard, 2026-08-02): GoTrue owns the document, so
    // the fragment itself declares its scheme, backs the wrapper and button
    // with bgcolor attributes, and names every text color — dark-mode clients
    // recolored the unhardened template, whose #667 footer fell to ~3.1:1.
    assert.match(template, /color-scheme:light/);
    assert.match(template, /bgcolor="#ffffff"/);
    assert.match(template, /bgcolor="#2244FF"/);
    assert.match(template, /color:#555555/);
    assert.doesNotMatch(template, /#667[^0-9a-f]/i);
    // And the script's own verifier has to read the body, not just the two
    // header fields — that asymmetry is what let the body drift alone.
    assert.match(script, /'Sign in to Levelflow' in t/);
    assert.match(script, /'#2244FF' in t/);
    assert.match(script, /'color-scheme:light' in t/);
    assert.match(script, /'#667' not in t/);
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
      "script-src 'self'",
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

  // The includes() checks above are one-directional: "script-src 'self'" is
  // satisfied by "script-src 'self' https://analytics.example" too. These two
  // directives are where a third-party origin would ride back in, so they are
  // pinned to their exact full text — the style-src regex above already does
  // this for the only directive that legitimately carries more than 'self'.
  it("script-src and connect-src are exact, both directions", () => {
    const directives = CSP.split(";").map((part) => part.trim());
    assert.equal(
      directives.find((part) => part.startsWith("script-src")),
      "script-src 'self'",
    );
    assert.equal(
      directives.find((part) => part.startsWith("connect-src")),
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    );
  });
});

// The engine is the only legitimate author of a setup or an outcome.
//
// `authenticated` used to hold insert/update/delete on both tables. RLS scoped
// those to the caller's own rows, which was the whole problem: own rows are all
// an attacker needs. `refreshGlobalStrategyWeights` reads `trade_outcomes` with
// the SERVICE ROLE and no user_id predicate, ordered by a user-writable
// `reviewed_at`, limit 2500; `setup_key` comes off a user-writable jsonb column;
// and the resulting `confidence_adjustment` is applied to scoring for EVERY
// user. One account could fabricate the entire learning input and set any
// setup_key to ±10 platform-wide.
//
// These pins are the mechanism, not a description of it. A future edit that
// restores the grant, or moves a write back onto the caller's token, fails here.
describe("the learning corpus is engine-written only", () => {
  const initSql = readFileSync("supabase/init.sql", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260807010000_engine_owns_setups_and_outcomes.sql",
    "utf8",
  );
  const analyzer = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  it("revokes every client write on the two tables the aggregate reads", () => {
    for (const table of ["trade_setups", "trade_outcomes"]) {
      assert.match(
        migration,
        new RegExp(`revoke insert, update, delete on public\\.${table} from authenticated`),
        `${table} must carry no client write grant — the aggregate reads it unscoped`,
      );
    }
    // init.sql still grants them, because it is the pre-migration baseline and
    // is applied before the migrations run. The revoke is what stands; this pin
    // exists so that when init.sql is folded into a baseline migration (a known
    // §7 item 6 gap) the grant is not silently carried forward.
    assert.match(initSql, /grant select, insert, update, delete on/);
  });

  it("writes every setup and outcome through the service role, never the caller's token", () => {
    // The five writes that used to run on the caller's token. Each already
    // passed an explicit user_id — RLS was defence in depth over a filter the
    // code applies itself — so moving them costs no scoping.
    assert.match(analyzer, /await adminInsertSingle\("trade_setups"/);
    assert.match(analyzer, /await adminUpsertRows\(\s*"trade_outcomes"/);
    assert.equal(
      (analyzer.match(/await adminUpdateRows\(/g) ?? []).length,
      3,
      "the supersede PATCH, the invalidate sweep and the status flip all run as admin",
    );
    // No token-authenticated write may return to this file.
    for (const helper of ["insertSingle", "upsertRows", "updateRows"]) {
      assert.doesNotMatch(
        analyzer,
        new RegExp(`[^n]\\b${helper}\\(`),
        `${helper} writes on the caller's token — the engine must write as admin`,
      );
    }
  });

  it("restores deleting your own rows as a function that cannot widen", () => {
    const rpc = readFileSync(
      "supabase/migrations/20260807030000_delete_own_setups.sql",
      "utf8",
    );
    // Scoped INSIDE the function, and by identity rather than by argument — a
    // function taking a user_id is a function someone can pass another user's
    // id to. Deleting your own rows is not the attack the revoke closed: it
    // cannot insert a fabricated outcome and cannot reach another account.
    assert.match(rpc, /create or replace function public\.delete_own_trade_setups\(\)/);
    assert.doesNotMatch(
      rpc,
      /delete_own_trade_setups\(\s*[a-z_]+\s+uuid/,
      "the function must take no user_id — identity is the filter",
    );
    assert.match(rpc, /where user_id = \(select auth\.uid\(\)\)/);
    assert.match(rpc, /if auth\.uid\(\) is null then\s*raise exception/);
    assert.match(rpc, /set search_path = public, pg_temp/);
    assert.match(
      rpc,
      /revoke all on function public\.delete_own_trade_setups\(\) from public, anon/,
    );
    // And the table grant stays gone — the RPC is the only door.
    assert.match(migration, /revoke insert, update, delete on public\.trade_setups/);
  });

  it("reads global learning scoped to the running analyzer version", () => {
    // The WRITE has always filtered on ANALYZER_VERSION. The reads did not, so a
    // version bump left production applying the previous engine's adjustments
    // indefinitely while reporting `updated: 0`. Every calibration round that
    // bumps the version depends on this.
    const reads = analyzer.match(/strategy_weightings_global\?select=[^`]*/g) ?? [];
    assert.equal(reads.length, 2, "expected exactly the two scoring read sites");
    for (const read of reads) {
      assert.match(
        read,
        /analyzer_version=eq\.\$\{encodeURIComponent\(ANALYZER_VERSION\)\}/,
        `a learning read without the version predicate applies a stale engine's adjustments: ${read}`,
      );
    }
  });
});

describe("the engine tables hold nothing for anon (item 0.5's residual, 2026-08-11)", () => {
  it("revokes every anon grant on the engine-owned tables", () => {
    const migration = readFileSync(
      "supabase/migrations/20260811190000_revoke_anon_on_engine_tables.sql",
      "utf8",
    );
    for (const table of ["trade_setups", "trade_outcomes"]) {
      assert.match(
        migration,
        new RegExp(`revoke insert, update, delete on public\\.${table} from anon`),
        `${table} must revoke anon's write grants`,
      );
      assert.match(
        migration,
        new RegExp(`revoke select on public\\.${table} from anon`),
        `${table} must revoke anon's read grant`,
      );
    }
    // The law it enforces, so a future grant cannot quietly reopen it.
    const initSql = readFileSync("supabase/init.sql", "utf8");
    assert.doesNotMatch(
      initSql,
      /grant[^;]*\bon\b[^;]*public\.trade_(setups|outcomes)[^;]*\bto\b[^;]*\banon\b/,
      "init.sql must never grant anon anything on the engine tables",
    );
  });
});

describe("one resolver, one physics (the 2026-08-11 correctness fork)", () => {
  it("every evaluateSetupOutcome call site passes the row's own fill options", () => {
    // Two live resolvers graded the same setups with different physics:
    // the in-request refresh ran the cost-free v1 touch-fill model while
    // outcome-sync ran the venue's fills, and whichever reached a row
    // first owned its verdict permanently. A bare two-argument call is
    // the shape of that bug.
    for (
      const file of [
        "supabase/functions/trade-analyzer/index.ts",
        "supabase/functions/outcome-sync/index.ts",
      ]
    ) {
      const source = readFileSync(file, "utf8");
      const bare = source.match(/evaluateSetupOutcome\(\s*setup,\s*bars\s*\)/g);
      assert.equal(
        bare,
        null,
        `${file} calls evaluateSetupOutcome without fill options — the two-resolver fork`,
      );
      if (source.includes("evaluateSetupOutcome(")) {
        assert.match(
          source,
          /fillOptionsFromRiskModel\(setup\.risk_model\)/,
          `${file} must grade with the row's own stored costs`,
        );
      }
    }
  });
});

// R1a slice 2 — one physics, the Deno-side halves (source pins: these
// modules carry Deno globals and cannot enter the test graph, the same
// discipline the D3 call-site scan above uses).
describe("R1a slice 2 — live grading and construction share the sweep's physics", () => {
  const writers = [
    "supabase/functions/trade-analyzer/index.ts",
    "supabase/functions/outcome-sync/index.ts",
  ];

  it("E1: both live writers resolve through the shared tiering rule, interval override after the bridge spread", () => {
    for (const file of writers) {
      const source = readFileSync(file, "utf8");
      assert.match(
        source,
        /resolutionSeriesFor\(\{/,
        `${file} must pick its resolution series through the one rule`,
      );
      assert.match(
        source,
        /\.\.\.fillOptionsFromRiskModel\(setup\.risk_model\),\s*\n\s*barIntervalMs: resolution\.barIntervalMs,/,
        `${file} must override the interval AFTER the bridge spread so the chosen tier governs`,
      );
      // Finding 3 (#362 review): the 5-minute fetch — and only the
      // 5-minute fetch — degrades to the coarser tier on failure, and the
      // CAUGHT promise is what the per-symbol cache holds, so one failure
      // cannot poison the symbol's remaining setups this run. The
      // 15-minute fetch stays fatal: without it there is nothing to
      // grade on. (The old formatting-keyed doesNotMatch that stood here
      // pinned nothing — the round-1 verdict's own minor — and these two
      // subsume it: a single-series fetch cannot satisfy both.)
      assert.match(
        source,
        /"5min",\s*\n\s*recordAnalyzerEvent,\s*\n\s*fetchWithTimeout,\s*\n\s*\)\.catch\(\(\) => \[\]\)/,
        `${file} must degrade a failed 5-minute fetch to the 15-minute tier`,
      );
      assert.doesNotMatch(
        source,
        /"15min",\s*\n\s*recordAnalyzerEvent,\s*\n\s*fetchWithTimeout,\s*\n\s*\)\.catch/,
        `${file} must keep a failed 15-minute fetch fatal for the setup`,
      );
      // Format-independent half of the pair (#362 round 2, smaller item):
      // exactly ONE degrade-catch inside the dual-fetch block. With the
      // positive match above binding it to the 5-minute fetch, a
      // reformatted 15-minute .catch cannot hide — it would make this
      // count two. Scoped to the block (round 3, smaller item) so an
      // unrelated future .catch elsewhere in the file cannot fail a pin
      // whose message points at the 5-minute fetch.
      const fetchRegionStart = source.indexOf("const fifteenKey");
      const fetchRegionEnd = source.indexOf("resolutionSeriesFor(");
      assert.ok(
        fetchRegionStart >= 0 && fetchRegionEnd > fetchRegionStart,
        `${file} must fetch both series before deciding the tier`,
      );
      assert.equal(
        (source.slice(fetchRegionStart, fetchRegionEnd)
          .match(/\)\.catch\(\(\) => \[\]\)/g) ?? []).length,
        1,
        `${file} must carry exactly one degrade-catch, on the 5-minute fetch`,
      );
    }
  });

  it("E1: the sweep decides its tier through the same rule — three callers, one physics (#362 round 2, finding 1)", () => {
    const sweep = readFileSync(
      "supabase/functions/trade-analyzer/sweep.ts",
      "utf8",
    );
    assert.match(
      sweep,
      /resolutionSeriesFor\(\{\s*\n\s*createdAtMs: latest\.time,/,
      "the sweep's tier must come from the shared admission rule at the decision instant",
    );
    // The behavioral half is EXECUTED in tests/sweep.test.ts (#362 round
    // 3, finding 1): a 5-minute corpus starting after the decision
    // instants grades identically to having none, and an admitted one
    // governs grading — a reformatted reintroduction of the old
    // non-empty admission fails that test regardless of spelling, which
    // is why no formatting-keyed doesNotMatch stands here.
  });

  it("E3: the crossed-quote refusal carries its own ground and marker (#362 round 5, finding 1)", () => {
    // 1b's rule: a distinct cause must not wear "no valid limit entry".
    // The distinct sentence is also the anchor-latency instrument —
    // analyzer_events carries analysisDiagnostics verbatim, so its
    // frequency is the one measurable through-market read before §21's
    // minute bank. The refusal channel is behaviorally executed in
    // tests/pricePlan.test.ts (both sides); these pins hold the
    // narrator's wiring in the Deno-side analyzer.
    const plan = readFileSync(
      "supabase/functions/trade-analyzer/pricePlan.ts",
      "utf8",
    );
    const analyzer = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    assert.match(plan, /refusal\.reason = "quote_crossed"/);
    assert.match(analyzer, /planRefusal\.reason === "quote_crossed"/);
    assert.match(analyzer, /crossed the computed limit entry/);
  });

  it("E3: setup construction anchors on the last COMPLETED primary bar, never the freshest 1-minute print", () => {
    const loader = readFileSync(
      "supabase/functions/trade-analyzer/marketLoader.ts",
      "utf8",
    );
    // Finding 1 (#362 review): the completed-bar law applies to the
    // SERIES, before the sufficiency check — moving only the `latest`
    // pointer left the entry math, the ATR, the pivots and the committee
    // on the forming bar and turned the viability gate into a live-only
    // directional filter. The trim itself is EXECUTED in
    // tests/barDecode.test.ts and the single-anchor consequence in
    // tests/pricePlan.test.ts; these pins hold the loader wiring.
    assert.match(loader, /completedIntradaySeries\(\s*await fetchFmpBars\(/);
    assert.match(loader, /const latest = primary\.at\(-1\) \?\? daily\.at\(-1\)!/);
    assert.match(loader, /latestTimeframe: primaryTimeframe/);
    // The 1-minute-preferring picker is gone; the sweep's decision
    // context (sweep.ts) anchors at 15min, and live now matches it. The
    // forming-bar fallback (finding 4) went with it.
    assert.doesNotMatch(loader, /pickLatestTimeframe/);
    assert.doesNotMatch(loader, /lastCompletedBar/);
    // #362 round 2, finding 2: the 1-minute series has no decision
    // consumer, so the analyzer must not pay a provider call and up to
    // 1,800 decoded bars per symbol for a display chip — and its absence
    // aligns availableTimeframes with the sweep's, which never counted
    // 1min. The chart's own feed (market-data) is a different function.
    assert.match(loader, /\(timeframe\) => timeframe !== "1min"/);
  });

  it("E7: construction writes the protection mode and review window into the row the bridge reads", () => {
    const analyzer = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    assert.match(
      analyzer,
      /runnerProtection: calibration\.runnerProtection \?\? "breakeven",/,
    );
    assert.match(
      analyzer,
      /reviewWindowHours: calibration\.defaultReviewHours,/,
    );
  });
});
