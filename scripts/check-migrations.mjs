import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationsDir = path.resolve("supabase", "migrations");
const migrationNamePattern = /^\d{14}_[a-z0-9_]+\.sql$/;
const reviewedSecurityDefinerMigrations = new Set([
  "20260603010000_launch_readiness.sql",
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
