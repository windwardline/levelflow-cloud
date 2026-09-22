import { defineConfig, devices, type Project } from "@playwright/test";
import { DESK_PARKED } from "./supabase/functions/_shared/deskParking.ts";

// A LOCAL `npm run test:e2e` WHILE THE EDGE IS PARKED runs only the two
// public-auth projects. The other three drive live charts and scans, which the
// Edge refuses while DESK_PARKED is true (supabase/functions/_shared/
// deskParking.ts), so locally they could only spend a sign-in and go red.
// deploy.yml always sets LEVELFLOW_E2E_FMP_PROJECTS from its own scope
// decision, so CI never reaches this branch; setting the variable here lets the
// coverage reporter say what stood down, if its process sees it.
const localParkedStandDown =
  DESK_PARKED && process.env.LEVELFLOW_E2E_FMP_PROJECTS === undefined;
if (localParkedStandDown) {
  process.env.LEVELFLOW_E2E_FMP_PROJECTS = "stood-down-parked";
}
const PUBLIC_AUTH_PROJECTS = new Set(["public-auth", "public-auth-built"]);

const projects: Project[] = [
  {
    name: "public-auth",
    testMatch: /public-auth\.spec\.ts$/,
    use: { ...devices["Desktop Chrome"] },
  },
  // Q4-I1: same spec, same assertions, against the built artifact instead
  // of dev — see the webServer comment below. Independent of every other
  // project (no shared rate limit — its function calls are stubbed), so it
  // runs in parallel with all of them.
  {
    name: "public-auth-built",
    testMatch: /public-auth\.spec\.ts$/,
    use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4173" },
  },
  {
    name: "workspace",
    testMatch: /authenticated-workspace\.spec\.ts$/,
    // Paired teardown, not an afterAll in the spec: it runs once every
    // project depending on workspace (visual-proof, then analyzer-abuse)
    // has finished — success or failure — so the cleanup can neither
    // cancel those proofs nor empty the Desk before they capture it.
    teardown: "cleanup",
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "visual-proof",
    testMatch: /visual-proof\.spec\.ts$/,
    dependencies: ["workspace"],
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "analyzer-abuse",
    testMatch: /analyzer-abuse\.spec\.ts$/,
    dependencies: ["visual-proof"],
    use: { ...devices["Desktop Chrome"] },
  },
  {
    name: "cleanup",
    testMatch: /cleanup\.teardown\.ts$/,
    use: { ...devices["Desktop Chrome"] },
  },
];

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  // Q4-I3: with no guard here, a committed test.only would silently narrow
  // the whole deploy gate to one test and still exit 0.
  forbidOnly: !!process.env.CI,
  // Playwright's own default reporter, plus one that makes the run state what
  // it did NOT verify. A count of skips cannot distinguish a healthy run from
  // one where a whole class of coverage has gone dark, and for four days in
  // August 2026 that difference went unsaid on every green.
  reporter: [
    [process.env.CI ? "dot" : "list"],
    ["./tests/e2e/coverageReporter.ts"],
  ],
  use: {
    baseURL: "http://127.0.0.1:5175",
    // m1 made the ladder's copy ✓ success-conditional on the real
    // navigator.clipboard.writeText promise resolving, so the "each ladder
    // value copies independently" e2e test now genuinely exercises the
    // write — headless Chromium doesn't reliably grant this without an
    // explicit permission.
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "retain-on-failure",
  },
  // Q4-I1: the dev server is the only artifact any browser test ever loads —
  // the production CSS cascade and the Tailwind purge are unexercised
  // (App.tsx:403-412 documents a Tailwind ordering bug that only showed up
  // "measured in the built CSS"). The CSP is NOT covered here either way: it
  // is a vercel.json response header that `vite preview` does not send;
  // deploy.yml's header poll owns that proof. public-auth.spec.ts needs no
  // live credentials and asserts computed styles directly
  // (theme colors, viewport overflow), so it also runs against a real
  // `vite build` served by `vite preview` — the "built" project below. Its
  // session-navigation tests want that build most of all: the defect they cover
  // shipped from it.
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5175",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: "http://127.0.0.1:5175",
    },
    {
      command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: "http://127.0.0.1:4173",
    },
  ],
  // Q4-C1: every authed spec signs in as the same dedicated E2E user, and two
  // of its analyzer actions are rate-limited per user
  // (trade-analyzer/index.ts: scan_opportunities 40/60s, refresh_outcomes
  // 12/60s).
  //
  // A Scan click is no longer one request. Since the 2026-08-02 CPU failures the
  // client splits a scan into ≤10-market requests (src/lib/scanBatching.ts), and
  // each one claims the scan budget — so this project's spend is counted in
  // chunks, not clicks.
  //
  // NO TOTALS HERE, deliberately. This ledger used to carry a per-spec
  // breakdown summing to 33 against "40/60s". Three of those numbers were
  // wrong: the limit is 60, an all-markets scan is more than 6 chunks, and the
  // chunk count is not even stable — chunkScanSymbols receives an
  // availability-filtered list, so a weekday and a weekend scan differ. A
  // ledger nobody can recompute is a ledger nobody can check, and rewriting it
  // with today's figures would just reset the clock on the same defect.
  //
  // The relation instead: this project spends one claim per chunk, once per
  // scan, across a runtime of minutes, against a minute-aligned tumbling
  // window. tests/scanBatching.test.ts holds the safety margin — it reads both
  // the chunk count and the server limit from their live sources and asserts
  // five full scans fit. This is a ledger that assumes retries: 0
  // (unset here; pinned in tests/scanBatching.test.ts). visual-proof scans
  // nothing (it captures surfaces) but its ten Desk/Insights surface visits
  // are a heavy consumer of the refresh budget — as, more modestly, are the
  // rail-reference specs, which each cross the Desk/Insights boundary two or
  // three times and so claim the 12/60s refresh_outcomes budget on every
  // crossing (App.tsx's tab-activation effect); analyzer-abuse then spends 2
  // refusals + a 55-request flood, deliberately over the limit, which is the
  // 429 it exists to prove.
  //
  // Playwright's default is to run spec files concurrently across workers, so
  // either one
  // running alongside authenticated-workspace.spec.ts could 429 a scan or
  // refresh that spec depends on — and a rate-limited scan there reads as a
  // skipped test today (the app can't tell a 429 apart from a quiet market),
  // not a failure, which is exactly the silent-green path C1 exists to close.
  //
  // Project dependencies force a strict run order instead — workspace, then
  // visual-proof, then analyzer-abuse — so none of the three ever runs
  // concurrently with another. (The limiter's tumbling wall-clock window can
  // still span a project boundary; what makes that safe is the order, not
  // isolation — the scan-heavy abuse storm runs last, after every scan
  // assertion that matters.) public-auth.spec.ts signs in as this user, but its
  // Edge function calls are stubbed in the browser (market-data and
  // refresh_outcomes answered with empty bodies, anything else aborted and
  // failed), so it spends neither provider bytes nor the analyzer budget. It
  // keeps its own project with no dependency and runs in parallel with
  // whichever of the three is currently active, keeping total wall-clock down.
  projects: localParkedStandDown
    ? projects.filter((project) => PUBLIC_AUTH_PROJECTS.has(project.name ?? ""))
    : projects,
});
