import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.LEVELFLOW_E2E_EMAIL;
const testPassword = process.env.LEVELFLOW_E2E_PASSWORD;

test.skip(
  !supabaseUrl || !supabaseKey || !testEmail || !testPassword,
  "Set Levelflow E2E Supabase and dedicated test-user credentials to run analyzer abuse tests.",
);

// READ from the analyzer, never restated here. This constant was hardcoded at 40
// and the budget moved to 60 on 2026-08-07; the flood then fired 55 requests at a
// 60-request limit and asserted a trip that could not happen. Nothing local caught
// it, because this suite runs at deploy time and `npm test` never loads it — so the
// pin that guards the number (tests/securityHardening.test.ts) passed while the
// test that USES it shipped broken. Deriving it is the only version of this that
// cannot drift.
function scanRateLimit(): number {
  const source = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );
  const found = /scan_opportunities:\s*(\d+),/.exec(source);
  if (!found) {
    throw new Error(
      "could not read scan_opportunities out of the analyzer's RATE_LIMITS",
    );
  }
  return Number(found[1]);
}

const SCAN_RATE_LIMIT = scanRateLimit();

// One scan is a fan-out of chunked requests, and this suite's own peak window runs
// several back to back. The window is minute-aligned and tumbling
// (supabase/init.sql), so a burst can straddle a boundary and tripping needs
// LIMIT+1 requests to land inside ONE window. Sizing the flood at 4/3 of that
// keeps the trip near-certain: 75% of the burst on one side of the boundary, the
// same margin the previous 55-on-40 flood carried, now derived instead of
// recomputed by hand each time the budget moves.
const FLOOD_SIZE = Math.ceil((SCAN_RATE_LIMIT + 1) / 0.75);

// Order is a contract here, not a convenience: the door test asserts real 400s,
// so it has to run while the budget still has room — before the flood that
// deliberately exhausts it. Serial mode says so out loud rather than relying on
// Playwright's default of one worker per file.
test.describe.configure({ mode: "serial" });

async function signIn() {
  const client = createClient(supabaseUrl!, supabaseKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: testEmail!,
    password: testPassword!,
  });

  if (error || !data.session) {
    throw new Error(
      `Unable to authenticate Levelflow E2E user: ${error?.message ?? "No session returned"}`,
    );
  }
  return data.session.access_token;
}

function callAnalyzer(token: string, body: Record<string, unknown>) {
  return fetch(`${supabaseUrl}/functions/v1/trade-analyzer`, {
    body: JSON.stringify(body),
    headers: {
      apikey: supabaseKey!,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

// Eight at a time, not eighty-two. Each flood request is a fast refusal — the
// symbol normalizes away, so no provider call and no row write — so the whole
// burst still lands in about two seconds, far inside the sixty-second window,
// while never asking the edge runtime for eighty-two cold isolates at once.
const FLOOD_CONCURRENCY = 8;

// The window is minute-aligned and tumbling, so a burst that straddles a
// boundary splits its requests across two budgets and may trip neither. The
// old comment priced that risk into FLOOD_SIZE's 4/3 margin; waiting removes
// it instead of paying for it. Only ever waits when genuinely near a boundary,
// so the common case costs nothing.
const WINDOW_EDGE_GUARD_MS = 10_000;

async function startOfNextWindowIfNear() {
  const msIntoWindow = Date.now() % 60_000;
  const msLeft = 60_000 - msIntoWindow;
  if (msLeft < WINDOW_EDGE_GUARD_MS) {
    await new Promise((resolve) => setTimeout(resolve, msLeft + 250));
  }
}

async function flood(token: string, count: number, concurrency: number) {
  const statuses: number[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let i = next++; i < count; i = next++) {
        const response = await callAnalyzer(token, {
          action: "scan_opportunities",
          symbols: ["RATE_LIMIT_TEST"],
        });
        statuses.push(response.status);
      }
    }),
  );
  return statuses;
}

test("the analyzer refuses a scan that could exceed its CPU budget", async () => {
  const token = await signIn();

  // The durable fix for the production 546s ("CPU Time exceeded", roughly half
  // of 2026-08-02's open-market scans): the request big enough to spend the 2s
  // CPU budget cannot be made. Asserted at the door itself, against the live
  // deployed function — the source-level pins live in
  // tests/securityHardening.test.ts.
  //
  // Neither refusal reaches the engine, so neither fetches provider data or
  // writes a row: nothing here for cleanup.teardown.ts to sweep.
  const overCap = await callAnalyzer(token, {
    action: "scan_opportunities",
    // 16 markets, one over MAX_SCAN_SYMBOLS. Real tickers, so the cap is the
    // only thing that can be refusing it.
    symbols: [
      "EURUSD",
      "EURJPY",
      "EURGBP",
      "EURCHF",
      "EURCAD",
      "EURAUD",
      "EURNZD",
      "GBPUSD",
      "GBPJPY",
      "GBPCHF",
      "GBPCAD",
      "GBPAUD",
      "GBPNZD",
      "USDJPY",
      "USDCHF",
      "USDCAD",
    ],
  });
  expect(
    overCap.status,
    "a 16-market scan must be refused, not run",
  ).toBe(400);
  expect(await overCap.json()).toMatchObject({
    error: expect.stringContaining("at most 15 markets"),
  });

  // The retired all-markets form: no symbols at all, which used to mean "the
  // server's own curated universe" — the exact request that failed in
  // production. A tab left open across the deploy still posts it, and this is
  // the contract it meets: an honest 400, never a 50-market scan.
  const allMarkets = await callAnalyzer(token, {
    action: "scan_opportunities",
  });
  expect(
    allMarkets.status,
    "the empty-list scan must be refused, not run",
  ).toBe(400);
  expect(await allMarkets.json()).toMatchObject({
    error: expect.stringContaining("must name the markets to scan"),
  });
});

test("trade analyzer caps repeated market scans without server errors", async () => {
  const token = await signIn();

  // Every request names exactly one market, and that market is deliberately not
  // one: "RATE_LIMIT_TEST" normalizes to RATELIMITTEST, which fails
  // isKnownSymbol and is dropped during normalization, so the scan attempts no
  // market, fetches no provider data and writes no row. That is what makes it
  // safe to fire this many — the flood exercises the meter, not the engine, and
  // leaves nothing behind for cleanup.teardown.ts to sweep. It is NOT the
  // retired empty-list form: naming a symbol is what keeps it a scan request
  // rather than the 400 the test above asserts.
  //
  // Start on a fresh window, and fire with bounded concurrency. Both exist to
  // remove causes of failure this test was never trying to measure.
  //
  // The contract under test is the METER: that the request after the budget is
  // refused with a 429. Firing all 82 simultaneously additionally tested
  // Supabase's isolate admission, and that is what kept failing — eight Deploy
  // runs between 2026-08-17 and 2026-08-24, every one of them on this
  // assertion, every one of them a 502. A 502 is not something this function
  // can emit: its own failure path returns 500 from the top-level catch in
  // supabase/functions/trade-analyzer/index.ts. The 502 came from the edge
  // gateway shedding load before the analyzer ever ran, so no assertion here
  // was reading the analyzer's behaviour at all.
  //
  // Retrying was the wrong answer and this repo already says why:
  // retry-infra-failures.yml is deliberately narrow because "flaky-until-green
  // is how a real defect reaches main". So the cause goes instead of the
  // symptom, and the no-5xx assertion below stays exactly as strict as it was.
  await startOfNextWindowIfNear();
  const statuses = await flood(token, FLOOD_SIZE, FLOOD_CONCURRENCY);

  expect(
    statuses.filter((status) => status === 429).length,
    `${FLOOD_SIZE} scan requests in one window must trip the ${SCAN_RATE_LIMIT}-per-minute limit`,
  ).toBeGreaterThanOrEqual(1);
  expect(
    statuses.filter((status) => status === 200).length,
    "the limiter must pass the budget through before it starts refusing",
  ).toBeGreaterThanOrEqual(1);
  expect(
    statuses.filter((status) => status >= 500),
    "a rate-limited analyzer must refuse, never fail",
  ).toEqual([]);
  expect(statuses.every((status) => status === 200 || status === 429)).toBe(
    true,
  );
});
