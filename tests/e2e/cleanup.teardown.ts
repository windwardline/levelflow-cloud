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

  // §19's specs select a broker program on this shared profile and undo it as
  // their own last step — but a mid-test failure would leave the selection
  // behind for the next run's opening assertions (and for visual-proof's
  // captures, which would gain a fifth ladder row). The run's state contract
  // lives here, not in the specs' happy paths: the profile leaves as it
  // arrived, program-less, every time.
  //
  // §19 retrofit (amendment 14) widens that contract: the run's state now
  // lives on saved broker_accounts rows too, not just these six legacy
  // columns, so active_broker_account_id is nulled in this same update —
  // before the row it points to is ever deleted, below — and the saved rows
  // themselves are swept in the next step. A mid-test failure between
  // addAndActivateAccount and removeAllAccounts is exactly the gap this
  // closes: left alone, the next run's authenticated-workspace.spec.ts:807
  // zero-accounts assertion (`getByLabel("E8 Markets")`) would inherit a
  // saved, active account instead.
  const { error: profileError } = await client
    .from("profiles")
    .update({
      active_broker_account_id: null,
      broker_account_size: null,
      broker_drawdown_tier: null,
      broker_id: null,
      broker_program_line: null,
      broker_risk_percent: null,
      broker_stage: null,
    })
    .eq("id", data.user.id);
  if (profileError) {
    throw new Error(
      `E2E cleanup could not reset the broker selection: ${profileError.message}`,
    );
  }
  console.log("[e2e cleanup] broker selection reset to none");

  // The pointer above is already null by the time this runs, so a saved
  // account is never deleted out from under an active pointer — the FK's own
  // on-delete-set-null (migration 20260803010000) would catch it regardless,
  // but nulling it explicitly first means this step never depends on that
  // cascade firing in any particular order relative to this delete.
  //
  // broker_accounts does not exist in the production DB until tonight's
  // deploy applies migration 20260803010000 — the deploy's own `db push` runs
  // before the browser matrix (recorded ruling), so there is no path where
  // this teardown executes against a pre-migration DB. Nothing here
  // special-cases a missing-table error the way the rest of this file
  // refuses to swallow a real one.
  const { count: accountsDeleted, error: accountsError } = await client
    .from("broker_accounts")
    .delete({ count: "exact" })
    .eq("user_id", data.user.id);
  if (accountsError) {
    throw new Error(
      `E2E cleanup could not delete its broker_accounts rows: ${accountsError.message}`,
    );
  }
  console.log(
    `[e2e cleanup] deleted ${accountsDeleted ?? 0} broker_accounts for the E2E user`,
  );
});
