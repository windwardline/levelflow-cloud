import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// LEVELFLOW_MIGRATIONS_DIR exists for tests/migrationGrants.test.ts; nothing
// else sets it. An environment variable rather than argv, so this script stays
// outside the argv-reader population tests/unknownFlagRefused.test.ts derives.
const migrationsDir = process.env.LEVELFLOW_MIGRATIONS_DIR
  ? path.resolve(process.env.LEVELFLOW_MIGRATIONS_DIR)
  : path.resolve("supabase", "migrations");
// From 2026-10-30 Supabase stops granting Data API access to new tables in
// "public", and every schema rebuilt from migrations — preview branches, new
// projects, `supabase db reset` — gets no grants either. The grants here are
// security decisions (trade_setups/trade_outcomes: authenticated select only;
// market_bars, fmp_usage: service role only), so a migration from this date on
// that creates a public table must decide each API role for it, by GRANT or by
// REVOKE, in the same file. Earlier migrations are live with the grants they
// were given; the rule starts at the email that announced the change.
const explicitGrantsFrom = "20261020000000";
const apiRoles = ["anon", "authenticated", "service_role"];
// Literal patterns only: a table name is captured and compared as a string,
// never spliced into a RegExp. Line comments are stripped first, so a GRANT
// that was commented out does not count as a decision.
const createTablePattern =
  /\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:(?:"([a-z0-9_]+)"|([a-z0-9_]+))\s*\.\s*)?(?:"([a-z0-9_]+)"|([a-z0-9_]+))/gi;
const grantTargetPattern =
  /\bon\s+(?:table\s+)?(?:(?:"([a-z0-9_]+)"|([a-z0-9_]+))\s*\.\s*)?(?:"([a-z0-9_]+)"|([a-z0-9_]+))(?![a-z0-9_])/i;
const granteePattern = /\b(?:to|from)\s+([^;]*)$/i;
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
  if (timestamp >= explicitGrantsFrom) {
    for (const table of publicTablesCreated(sql)) {
      const undecided = apiRoles.filter((role) => !decidesRole(sql, table, role));
      if (undecided.length > 0) {
        fail(
          `Migration creates public.${table} without an explicit GRANT or REVOKE for ` +
            `${undecided.join(", ")}: ${file}. From 2026-10-30 Supabase grants new public ` +
            "tables nothing, so decide every API role in the migration that creates it.",
        );
      }
    }
  }
}

console.log(`Verified ${files.length} Supabase migration files.`);

function withoutLineComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

function publicTablesCreated(sql) {
  const tables = [];
  for (const match of withoutLineComments(sql).matchAll(createTablePattern)) {
    const schema = (match[1] ?? match[2] ?? "public").toLowerCase();
    const table = (match[3] ?? match[4]).toLowerCase();
    if (schema === "public") tables.push(table);
  }
  return tables;
}

function decidesRole(sql, table, role) {
  return withoutLineComments(sql).split(";").some((statement) => {
    if (!/^\s*(?:grant|revoke)\b/i.test(statement)) return false;
    const target = statement.match(grantTargetPattern);
    if (!target) return false;
    const schema = (target[1] ?? target[2] ?? "public").toLowerCase();
    if (schema !== "public" || (target[3] ?? target[4]).toLowerCase() !== table) return false;
    const grantees = statement.match(granteePattern);
    return Boolean(grantees) &&
      grantees[1].toLowerCase().split(/[\s,"]+/).includes(role);
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
