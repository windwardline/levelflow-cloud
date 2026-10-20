import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { scratchDir } from "./support/scratchDir.ts";

/**
 * From 2026-10-30 Supabase stops granting Data API access to new tables in
 * "public" by default, and that includes every schema rebuilt from migrations:
 * preview branches, new projects and local `supabase db reset`. A table created
 * without grants answers "permission denied" to supabase-js.
 *
 * The grants here are security decisions, not boilerplate. `trade_setups` and
 * `trade_outcomes` give `authenticated` select only; `market_bars` and
 * `fmp_usage` are service-role only. Supabase's suggested grants hand `anon`
 * select, so copying them would open a table. The gate therefore demands that
 * the creating migration states, for each API role, a GRANT or a REVOKE naming
 * the table — the decision made, not a default inherited.
 */

const CHECK = new URL("../scripts/check-migrations.mjs", import.meta.url).pathname;

function run(files: Record<string, string>) {
  const dir = join(scratchDir("migration-grants-"), "migrations");
  mkdirSync(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return spawnSync(process.execPath, [CHECK], {
    encoding: "utf8",
    env: { ...process.env, LEVELFLOW_MIGRATIONS_DIR: dir },
  });
}

const CREATE = "create table public.widgets (id bigint primary key);\nalter table public.widgets enable row level security;\n";
const ALL_ROLES =
  "revoke all on public.widgets from anon;\n" +
  "grant select on public.widgets to authenticated;\n" +
  "grant select, insert, update, delete on public.widgets to service_role;\n";

describe("migration grants (Supabase Data API change, 2026-10-30)", () => {
  it("refuses a new public table whose migration states no grants", () => {
    const result = run({ "20261021000000_widgets.sql": CREATE });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /public\.widgets.*anon.*authenticated.*service_role/s);
  });

  it("refuses when one API role is left to the default", () => {
    const sql = CREATE +
      "grant select on public.widgets to authenticated;\n" +
      "grant select, insert, update, delete on public.widgets to service_role;\n";
    const result = run({ "20261021000000_widgets.sql": sql });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /public\.widgets/);
    assert.match(result.stderr, /anon/);
    assert.doesNotMatch(result.stderr, /authenticated|service_role/);
  });

  it("accepts a new table whose migration decides every API role, revokes included", () => {
    const result = run({ "20261021000000_widgets.sql": CREATE + ALL_ROLES });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it("reads quoted names, IF NOT EXISTS, an unqualified table and a multi-role grant", () => {
    const sql =
      'create table if not exists "gadgets" (id bigint primary key);\n' +
      'grant select on table "public"."gadgets" to anon, authenticated;\n' +
      "grant all on gadgets to service_role;\n";
    const result = run({ "20261021000000_gadgets.sql": sql });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it("does not let a grant on another table satisfy this one", () => {
    const sql = CREATE + ALL_ROLES.replaceAll("public.widgets", "public.other");
    const result = run({ "20261021000000_widgets.sql": sql });
    assert.equal(result.status, 1, result.stdout + result.stderr);
  });

  it("does not count a grant that was commented out", () => {
    const sql = CREATE + ALL_ROLES.replace("revoke all on public.widgets from anon;", "-- revoke all on public.widgets from anon;");
    const result = run({ "20261021000000_widgets.sql": sql });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /anon/);
  });

  it("ignores tables outside public and migrations before the rule began", () => {
    const result = run({
      "20260901000000_legacy.sql": CREATE,
      "20261021000000_private.sql": "create table private.audit (id bigint);\n",
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});
