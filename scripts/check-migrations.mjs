import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationsDir = path.resolve("supabase", "migrations");
const migrationNamePattern = /^\d{14}_[a-z0-9_]+\.sql$/;
// A SECURITY DEFINER function runs as its owner, so RLS does not constrain it —
// every entry here is a deliberate decision that the function scopes itself.
const reviewedSecurityDefinerMigrations = new Set([
  "20260603010000_launch_readiness.sql",
  // delete_own_trade_setups(). Reviewed 2026-08-07.
  //
  // Scoped by auth.uid() INSIDE the function, with no user_id parameter — a
  // function that takes one is a function someone can pass another user's id
  // to. It raises rather than deleting when the caller is unauthenticated, and
  // execute is revoked from public and anon.
  //
  // Why it exists: 20260807010000 revoked delete on trade_setups from
  // `authenticated`, because the learning aggregate reads that table with the
  // service role and no user predicate, so a client write grant let one account
  // fabricate the corpus. That reasoning is about writes that CREATE rows.
  // Deleting your own rows cannot insert a fabricated outcome and cannot reach
  // another account, and the E2E teardown needs it so CI rows never train the
  // model — the same corpus the revoke protects. CI holds no service-role key,
  // and putting one in a browser-test job to solve this would be a far wider
  // tool than the problem wants.
  "20260807030000_delete_own_setups.sql",
]);

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  fail("No Supabase migrations were found.");
}

let previousTimestamp = "";
const seenTimestamps = new Set();

for (const file of files) {
  if (!migrationNamePattern.test(file)) {
    fail(`Invalid migration filename: ${file}`);
  }

  const timestamp = file.slice(0, 14);
  if (seenTimestamps.has(timestamp)) {
    fail(`Duplicate migration timestamp: ${timestamp}`);
  }
  if (previousTimestamp && timestamp <= previousTimestamp) {
    fail(`Migration timestamps are not strictly increasing near ${file}.`);
  }
  previousTimestamp = timestamp;
  seenTimestamps.add(timestamp);

  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  if (!sql.trim()) {
    fail(`Migration is empty: ${file}`);
  }
  if (
    /\bsecurity\s+definer\b/i.test(sql) &&
    !reviewedSecurityDefinerMigrations.has(file)
  ) {
    fail(`Migration uses SECURITY DEFINER and needs explicit security review: ${file}`);
  }
  if (/\bauth\.role\s*\(/i.test(sql)) {
    fail(`Migration uses deprecated auth.role(): ${file}`);
  }
  if (/\bcreate\s+policy\b/i.test(sql) && !/\bto\s+(anon|authenticated|service_role|public)\b/i.test(sql)) {
    fail(`Migration creates a policy without an explicit TO clause: ${file}`);
  }
}

console.log(`Verified ${files.length} Supabase migration files.`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
