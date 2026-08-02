import { test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const testEmail = process.env.LEVELFLOW_E2E_EMAIL;
const testPassword = process.env.LEVELFLOW_E2E_PASSWORD;

test.skip(
  !supabaseUrl || !supabaseKey || !testEmail || !testPassword,
  "Set Levelflow E2E Supabase and dedicated test-user credentials to run the cleanup teardown.",
);

// I9: every setup the authenticated suite's scans create belongs to the E2E
// user in the LIVE project, and global learning reads trade_outcomes with the
// service role and no user filter — so before this cleanup, every push to main
// enrolled CI traffic in the production learning cohort and counted toward the
// Resumption Protocol's ~500-per-class trigger. Deploys cluster in the owner's
// working hours, which made it a time-of-day-biased subpopulation inside a
// model whose per-hour gates were the calibration arc's most contested finding.
//
// This lives in its own Playwright teardown project (paired to "workspace" in
// playwright.config.ts) rather than a test.afterAll inside the spec, for two
// reasons proven in review: an afterAll throw is attributed to the spec's last
// test and CANCELS the dependent visual-proof and analyzer-abuse projects —
// making cleanup a single point of cancellation for the proofs — and afterAll
// ran before visual-proof, so the composition captures were always taken
// against a freshly emptied Desk. A teardown project runs after every
// dependent project has finished, success or failure, and cannot cancel any
// of them.
//
// The delete is scoped to the E2E user and deliberately UNBOUNDED in time:
// deploy.yml's concurrency group forbids parallel runs, every scanning
// project has already finished when this executes, and sweeping the whole
// account also clears leftovers from any earlier interrupted run that died
// before its cleanup. It runs through the user's own JWT (the "delete own"
// RLS policy, supabase/init.sql), and trade_outcomes cascades on setup
// delete — no service-role key in CI, no reach into any other account.
test("the run's setups leave the learning cohort", async () => {
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
  if (error || !data.user) {
    // Loud, not swallowed: a cleanup that quietly failed would leave CI rows
    // training the model, which is the whole defect it exists to close.
    throw new Error(
      `E2E cleanup could not authenticate to delete its setups: ${
        error?.message ?? "no user returned"
      }`,
    );
  }
  const { count, error: deleteError } = await client
    .from("trade_setups")
    .delete({ count: "exact" })
    .eq("user_id", data.user.id);
  if (deleteError) {
    throw new Error(
      `E2E cleanup could not delete its setups: ${deleteError.message}`,
    );
  }
  console.log(`[e2e cleanup] deleted ${count ?? 0} trade_setups for the E2E user`);
});
