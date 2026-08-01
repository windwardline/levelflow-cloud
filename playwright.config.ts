import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  // Q4-I3: with no guard here, a committed test.only would silently narrow
  // the whole deploy gate to one test and still exit 0.
  forbidOnly: !!process.env.CI,
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
  // production CSS cascade, the real CSP, and the Tailwind purge are all
  // unexercised (App.tsx:403-412 documents a Tailwind ordering bug that only
  // showed up "measured in the built CSS"). public-auth.spec.ts needs no
  // live credentials and asserts computed styles directly
  // (theme colors, viewport overflow), so it also runs against a real
  // `vite build` served by `vite preview` — the "built" project below.
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
  // (trade-analyzer/index.ts: scan_opportunities 8/60s, refresh_outcomes
  // 12/60s). analyzer-abuse.spec.ts deliberately exhausts the scan budget to
  // prove the 429 path, and visual-proof.spec.ts's ten Desk/Insights surface
  // visits are a second heavy consumer of the refresh budget. Playwright's
  // default is to run spec files concurrently across workers, so either one
  // running alongside authenticated-workspace.spec.ts could 429 a scan or
  // refresh that spec depends on — and a rate-limited scan there reads as a
  // skipped test today (the app can't tell a 429 apart from a quiet market),
  // not a failure, which is exactly the silent-green path C1 exists to close.
  //
  // Project dependencies force a strict run order instead — workspace, then
  // visual-proof, then analyzer-abuse — so none of the three ever shares a
  // rate-limit window with another. public-auth.spec.ts never signs in and
  // touches none of this, so it keeps its own project with no dependency and
  // runs in parallel with whichever of the three is currently active,
  // keeping total wall-clock down.
  projects: [
    {
      name: "public-auth",
      testMatch: /public-auth\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Q4-I1: same spec, same assertions, against the built artifact instead
    // of dev — see the webServer comment above. Independent of every other
    // project (no sign-in, no shared rate limit), so it runs in parallel
    // with all of them.
    {
      name: "public-auth-built",
      testMatch: /public-auth\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4173" },
    },
    {
      name: "workspace",
      testMatch: /authenticated-workspace\.spec\.ts$/,
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
  ],
});
