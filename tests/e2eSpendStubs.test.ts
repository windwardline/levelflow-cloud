import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { DESK_PARKED } from "../supabase/functions/_shared/deskParking.ts";
import { noKeychainEnv } from "./support/noKeychain.ts";

/**
 * The E2E suites spend nothing they do not mean to.
 *
 * `public-auth` signs in as the E2E user, and a signed-in browser with no
 * remembered tab lands on the Desk, which asks market-data for a chart and
 * forces refresh_outcomes. Its comments said it never signed in and touched no
 * market data; on 2026-09-15 the chart feed recorded 51,246,247 user-class
 * bytes over a day of 12 deploys whose FMP-spending projects had stood down
 * (the ledger keeps one row per day and class, so attributing that total to
 * public-auth is inferred). The spec now stubs both calls in the browser and
 * fails on any other function call.
 *
 * Most of these are SOURCE guards. The executed half — every signed-in test's
 * afterEach and the externals test's poll for a stubbed chart request — runs
 * only at deploy time, with the E2E credentials this suite does not hold. The
 * config's local stand-down is executed here.
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

const ALL_PROJECTS = ["analyzer-abuse", "cleanup", "public-auth", "public-auth-built", "visual-proof", "workspace"];

/**
 * The config as it evaluates, in a child that owns its environment: importing
 * it here would set LEVELFLOW_E2E_FMP_PROJECTS for this whole process, and a
 * second import would return the first one's cached projects. `--tsconfig` is
 * deliberately absent — with it, tsx's `--eval` printed nothing and exited 0.
 */
function evaluatedConfig(scope: string | undefined): { projects: string[]; scope: string | null } {
  const env: NodeJS.ProcessEnv = { ...process.env, ...noKeychainEnv() };
  delete env.LEVELFLOW_E2E_FMP_PROJECTS;
  if (scope !== undefined) env.LEVELFLOW_E2E_FMP_PROJECTS = scope;
  const probe =
    'import("./playwright.config.ts").then(({ default: config }) => { process.stdout.write(JSON.stringify({ ' +
    "projects: (config.projects ?? []).map((project) => project.name).sort(), " +
    "scope: process.env.LEVELFLOW_E2E_FMP_PROJECTS ?? null })); })";
  const run = spawnSync(process.execPath, ["./node_modules/.bin/tsx", "--eval", probe], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });
  assert.equal(run.status, 0, `playwright.config.ts did not evaluate: ${run.stderr}`);
  assert.ok(run.stdout.trim().length > 0, "the config probe printed nothing, which is no verdict");
  return JSON.parse(run.stdout) as { projects: string[]; scope: string | null };
}

describe("a local E2E run stands the FMP projects down while the Edge is parked", () => {
  it("runs only public-auth when the scope is unset and DESK_PARKED is true, and says so", () => {
    // EXECUTED, because a source pin on the predicate held while the filter it
    // feeds was gone: review mutation R15 replaced the ternary with `projects,`
    // and the suite stayed green. While the Edge is not yet parked, this filter
    // is all that keeps a local `npm run test:e2e` off the provider.
    const unset = evaluatedConfig(undefined);
    if (DESK_PARKED) {
      assert.deepEqual(unset.projects, ["public-auth", "public-auth-built"]);
      assert.equal(unset.scope, "stood-down-parked", "the coverage reporter would not say what stood down");
    } else {
      assert.deepEqual(unset.projects, ALL_PROJECTS);
      assert.equal(unset.scope, null);
    }
  });

  it("lists only public-auth.spec.ts tests, in the two public-auth projects, when the scope is unset", () => {
    // The project NAMES are not what runs. Review mutation N5 (2026-09-21)
    // widened public-auth's testMatch to take authenticated-workspace.spec.ts
    // too; the names held, the test above stayed green, and a local run would
    // have run 38 authenticated-workspace tests under a project called
    // public-auth. So Playwright itself lists what it would run: `--list` loads
    // the config and the specs, and starts no browser and no web server.
    const env: NodeJS.ProcessEnv = { ...process.env, ...noKeychainEnv() };
    delete env.LEVELFLOW_E2E_FMP_PROJECTS;
    const run = spawnSync(
      process.execPath,
      ["./node_modules/@playwright/test/cli.js", "test", "--list", "--reporter=json"],
      { cwd: process.cwd(), encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 },
    );
    assert.equal(run.status, 0, `playwright test --list failed: ${run.stderr}`);
    assert.ok(run.stdout.trim().length > 0, "playwright test --list printed nothing, which is no verdict");
    type Suite = { specs?: Array<{ file: string; tests: Array<{ projectName: string }> }>; suites?: Suite[] };
    const listed = JSON.parse(run.stdout) as { errors: unknown[]; suites: Suite[] };
    assert.deepEqual(listed.errors, [], "the config or a spec failed to load, so the list is not what would run");
    const tests: Array<{ file: string; project: string }> = [];
    const walk = (suite: Suite) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) tests.push({ file: spec.file, project: test.projectName });
      }
      for (const child of suite.suites ?? []) walk(child);
    };
    listed.suites.forEach(walk);
    assert.ok(tests.length >= 10, `only ${tests.length} tests listed — the walk broke, which reads exactly like a clean list`);
    const files = [...new Set(tests.map((test) => test.file))].sort();
    const projects = [...new Set(tests.map((test) => test.project))].sort();
    if (DESK_PARKED) {
      assert.deepEqual(files, ["public-auth.spec.ts"], "a parked local run would execute these spec files");
      assert.deepEqual(projects, ["public-auth", "public-auth-built"]);
    } else {
      assert.ok(files.includes("authenticated-workspace.spec.ts"), "an unparked local run lost the workspace suite");
      assert.deepEqual(projects, ALL_PROJECTS);
    }
  });

  it("runs every project when deploy.yml has decided the scope", () => {
    for (const scope of ["ran", "stood-down", "stood-down-parked"]) {
      const decided = evaluatedConfig(scope);
      assert.deepEqual(decided.projects, ALL_PROJECTS, `scope=${scope} narrowed the projects`);
      assert.equal(decided.scope, scope, `the config overwrote deploy.yml's scope=${scope}`);
    }
  });

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
