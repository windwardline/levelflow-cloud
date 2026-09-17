import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The E2E suites spend nothing they do not mean to.
 *
 * `public-auth` signs in as the E2E user, and a signed-in browser with no
 * remembered tab lands on the Desk, which asks market-data for a chart and
 * forces refresh_outcomes. Its comments said it never signed in and touched no
 * market data; on 2026-09-15 the chart feed recorded 51,246,247 user-class
 * bytes on a deploy whose FMP-spending projects had stood down. The spec now
 * stubs both calls in the browser and fails on any other function call.
 *
 * These are SOURCE guards. The executed half — every signed-in test's afterEach
 * and the externals test's poll for a stubbed chart request — runs only at
 * deploy time, with the E2E credentials this suite does not hold.
 */

const PUBLIC_AUTH = readFileSync("tests/e2e/public-auth.spec.ts", "utf8");
const WORKSPACE = readFileSync("tests/e2e/authenticated-workspace.spec.ts", "utf8");
const CONFIG = readFileSync("playwright.config.ts", "utf8");
const DEPLOY = readFileSync(".github/workflows/deploy.yml", "utf8");

function functionBody(source: string, header: string): string {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `\`${header}\` is gone — re-anchor this guard`);
  return source.slice(start, source.indexOf("\n}\n", start));
}

describe("public-auth stubs the Edge before it can reach it", () => {
  it("signs in only through seedStoredSession, which installs the stub first", () => {
    const calls = [...PUBLIC_AUTH.matchAll(/\bfreshSession\(/g)].length;
    assert.equal(calls, 2, "freshSession is declared once and called once, from seedStoredSession");
    const seed = functionBody(PUBLIC_AUTH, "async function seedStoredSession(");
    const stubAt = seed.indexOf("await stubEdgeFunctions(page.context());");
    const signInAt = seed.indexOf("await freshSession()");
    assert.ok(stubAt > 0 && signInAt > stubAt, "the session is created before the stub is installed");
  });

  it("routes the whole context, answers the two calls and aborts the rest", () => {
    const stub = functionBody(PUBLIC_AUTH, "async function stubEdgeFunctions(");
    assert.match(stub, /context\.route\(FUNCTION_URL,/);
    assert.match(PUBLIC_AUTH, /const FUNCTION_URL = \/\\\/functions\\\/v1\\\/\(\[\^\/\?#\]\+\)\/;/);
    assert.match(stub, /name === "market-data"/);
    assert.match(stub, /analyzerAction\(request\) === "refresh_outcomes"/);
    assert.match(stub, /registry\.unexpected\.push\([\s\S]*await route\.abort\(\);/);
    assert.match(PUBLIC_AUTH, /satisfies MarketDataResponse/);
  });

  it("never lets a function request through to the network", () => {
    for (const escape of ["route.continue(", "route.fallback(", "unrouteAll"]) {
      assert.equal(PUBLIC_AUTH.includes(escape), false, `public-auth.spec.ts contains \`${escape}\``);
    }
    assert.equal(PUBLIC_AUTH.includes("functions.invoke"), false, "public-auth.spec.ts calls a function directly");
  });

  it("fails a test whose function request escaped or was unknown", () => {
    const after = PUBLIC_AUTH.slice(PUBLIC_AUTH.indexOf("test.afterEach("));
    assert.ok(PUBLIC_AUTH.includes("test.afterEach("), "the stub has no afterEach check");
    const block = after.slice(0, after.indexOf("\n});\n"));
    assert.match(block, /registry\.pending === 0/);
    assert.match(block, /registry\.seen\.length === registry\.stubbed\.length \+ registry\.unexpected\.length/);
    assert.match(block, /registry\.unexpected/);
    assert.match(block, /\.toEqual\(\[\]\)/);
  });

  it("proves the matcher reaches the real invoke URL", () => {
    const externals = PUBLIC_AUTH.slice(PUBLIC_AUTH.indexOf("§17o tier 3 — the externals still leave"));
    assert.match(externals, /stubbed\.includes\("market-data"\)/);
  });
});

describe("the comments no longer claim what the code does not do", () => {
  it("playwright.config.ts and deploy.yml describe a signed-in, stubbed public-auth", () => {
    assert.equal(CONFIG.includes("never signs in as this user"), false);
    assert.equal(CONFIG.includes("the token they seed is invented"), false);
    assert.equal(DEPLOY.includes("touch no market data"), false);
    assert.match(DEPLOY, /market-data and refresh_outcomes are stubbed in the browser/);
  });
});

describe("the workspace stands down only for the Edge's daily ceiling", () => {
  it("names `ceiling` as the one Edge refusal that stands a test down", () => {
    const predicate = functionBody(WORKSPACE, "function isDailyCeilingRefusal(");
    assert.match(predicate, /status === 503 && body\?\.fmpSpendRefused === "ceiling"/);
    assert.doesNotMatch(predicate, /ledger-unavailable|parked|429/);
    assert.equal(
      (WORKSPACE.match(/fmpSpendRefused === "/g) ?? []).length,
      1,
      "a second refusal kind is compared somewhere — only the ceiling may stand a test down",
    );
  });

  it("both live-spend tests consult it", () => {
    const chart = WORKSPACE.slice(WORKSPACE.indexOf('test("advisor loads Ultimate one-minute chart data"'));
    assert.match(chart.slice(0, 3000), /isDailyCeilingRefusal\(refusal\.status, refusal\.body\)/);
    const scan = WORKSPACE.slice(WORKSPACE.indexOf("expected ${expectedChunks} scan chunk request(s)"));
    assert.match(scan.slice(0, 2500), /refusedChunks\.every\(\(response, index\) =>\s*isDailyCeilingRefusal\(/);
  });
});

describe("a local E2E run stands the FMP projects down while the Edge is parked", () => {
  it("imports DESK_PARKED and keys the stand-down on an unset scope variable", () => {
    assert.match(CONFIG, /import \{ DESK_PARKED \} from "\.\/supabase\/functions\/_shared\/deskParking\.ts";/);
    assert.match(
      CONFIG,
      /DESK_PARKED && process\.env\.LEVELFLOW_E2E_FMP_PROJECTS === undefined/,
      "the local stand-down must never fire when deploy.yml has decided the scope",
    );
    assert.match(CONFIG, /PUBLIC_AUTH_PROJECTS = new Set\(\["public-auth", "public-auth-built"\]\)/);
  });
});
