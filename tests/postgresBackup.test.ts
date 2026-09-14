import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * LevelFlow's Postgres OFF-BOX backup and its restore proof.
 *
 * The minute-bank mirror does not cover this database. `public.analyzer_events`
 * holds 328,841 rows no provider can re-serve; `public.market_bars`, the part
 * the bank would overlap, holds 1,708. Supabase's seven daily backups live
 * inside the account a loss event takes, and PITR is a $100/month add-on that
 * is deliberately off. This was the only dataset in the stack with exactly one
 * custodian.
 *
 * NOTHING HERE TOUCHES R2 OR THE DATABASE. Every case reads the source or
 * exercises a REFUSAL path that returns before any network call — the same rule
 * minuteBankOffbox.test.ts sets, for the same reason.
 */

const BACKUP = "scripts/ops/backup-postgres-offbox.sh";
const VERIFY = "scripts/ops/verify-postgres-restore.sh";
const BACKUP_SRC = readFileSync(BACKUP, "utf8");
const VERIFY_SRC = readFileSync(VERIFY, "utf8");
const PLIST = readFileSync("scripts/ops/com.windwardline.levelflow-postgres-backup.plist", "utf8");

function run(script: string, args: string[], env: Record<string, string> = {}) {
  try {
    const stdout = execFileSync("bash", [script, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("postgres off-box backup", () => {
  it("refuses when wl-secret cannot be found, instead of running without credentials", () => {
    const r = run(BACKUP, [], { LEVELFLOW_WL_SECRET: "/nonexistent/wl-secret" });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /wl-secret is not executable/);
  });

  it("refuses a second re-exec rather than looping forever", () => {
    // The guard is an ARGUMENT because wl-secret execs through `env -i`: an
    // environment sentinel is scrubbed before the child could ever read it.
    const r = run(BACKUP, ["--secrets-delivered"], { PGPASSWORD: "", R2_TOKEN: "" });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /refusing to re-exec again/);
  });

  it("passes the re-exec guard on argv, not in the environment", () => {
    assert.match(BACKUP_SRC, /--secrets-delivered/);
    assert.match(BACKUP_SRC, /env -i/, "the reason the guard is argv must stay written down");
  });

  it("uses the session-mode pooler port, not the advertised transaction port", () => {
    // 6543 is transaction mode and cannot serve pg_dump, which needs one stable
    // session. It fails mid-dump rather than at connect.
    assert.match(BACKUP_SRC, /LEVELFLOW_PG_PORT:-5432/);
    assert.ok(!/LEVELFLOW_PG_PORT:-6543/.test(BACKUP_SRC));
  });

  it("derives the dump tool from the server's major rather than pinning a path", () => {
    assert.match(BACKUP_SRC, /server_version_num/);
    assert.match(BACKUP_SRC, /SERVER_MAJOR=\$\(\( SERVER_NUM \/ 10000 \)\)/);
    assert.match(BACKUP_SRC, /brew install postgresql@\$\{SERVER_MAJOR\}/);
  });

  it("refuses to certify a dump against an empty table list", () => {
    // An empty expectation makes every coverage check pass vacuously.
    assert.match(BACKUP_SRC, /refusing to certify a dump against an empty expectation/);
  });

  it("names its absent tables exactly, never by wildcard", () => {
    // A wildcard would hide the next table that goes missing.
    const absent = BACKUP_SRC.match(/LEVELFLOW_PG_EXPECTED_ABSENT:-([^}]*)\}/);
    assert.ok(absent, "the expected-absent list must be present");
    const names = absent[1].trim().split(/\s+/);
    assert.deepEqual(names.sort(), [
      "net._http_response",
      "net.http_request_queue",
      "realtime.messages",
    ]);
    for (const n of names) assert.ok(!n.includes("*"), `${n} must not be a wildcard`);
  });

  it("writes to the fleet's shared backup layout, not a second tree beside it", () => {
    assert.match(BACKUP_SRC, /levelflow-cloud\/postgres/);
    assert.match(BACKUP_SRC, /\$\{STAMP:0:4\}\/\$\{STAMP:4:2\}/);
  });

  it("verifies the remote object, not the upload's exit code", () => {
    assert.match(BACKUP_SRC, /rclone hashsum md5/);
    assert.match(BACKUP_SRC, /REMOTE_MD5 == "\$LOCAL_MD5"/);
  });

  it("holds no credential in the launchd plist", () => {
    assert.ok(!/PGPASSWORD|R2_TOKEN|password/i.test(PLIST));
    assert.match(PLIST, /backup-postgres-offbox\.sh/);
  });

  it("runs through wl-repo-script, not a working-tree path", () => {
    // ~/Projects checkouts are SHARED and concurrent agents move them onto
    // feature branches. A plist naming a working-tree path runs whatever branch
    // is out at 06:40. The dangerous shape is not the missing script (exit 127,
    // loud) but the STALE one: present on an old branch, superseded, exit 0.
    // This job hit exit 127 on first load for exactly that reason.
    assert.match(PLIST, /wl-repo-script/);
    assert.ok(
      !/<string>\/Users\/peacock\/Projects\/levelflow-cloud\/scripts\/ops\/backup-postgres-offbox\.sh<\/string>/.test(PLIST),
      "the plist must not invoke the working-tree path directly",
    );
  });
});

describe("postgres restore proof", () => {
  it("refuses without credentials rather than reporting an unproven archive", () => {
    const r = run(VERIFY, [], { PGPASSWORD: "", R2_TOKEN: "" });
    assert.notEqual(r.code, 0);
    assert.match(r.out, /PGPASSWORD is unset/);
  });

  it("sets an explicit locale before anything starts a server", () => {
    // A bare pg_ctl start on macOS dies with "postmaster became multithreaded
    // during startup" when the locale is unset — the scheduled-task locale trap.
    // Match the INVOCATION, not the word: the comment that explains this trap
    // necessarily mentions pg_ctl before the fix that prevents it, so a bare
    // indexOf("pg_ctl") tests the prose and fails on a correct script.
    const localeAt = VERIFY_SRC.indexOf("export LC_ALL=C");
    const startAt = VERIFY_SRC.indexOf('"$BIN/pg_ctl"');
    assert.ok(localeAt > -1, "LC_ALL must be set explicitly");
    assert.ok(startAt > -1, "the pg_ctl invocation must be findable");
    assert.ok(localeAt < startAt, "the locale must be set before any pg_ctl start");
  });

  it("guards the count query against errexit killing the run", () => {
    // Without `|| got=""` an absent table makes psql exit non-zero and `set -e`
    // kills the script AT that line — before the branch that names the failure.
    // Measured: a run died silently at cron.job having checked 8 of 25 tables.
    assert.match(VERIFY_SRC, /select count\(\*\) from \$\{table\}" 2>\/dev\/null \| tr -d '\[:space:\]'\)" \|\| got=""/);
  });

  it("does not assert restored <= live, because live is a planner estimate", () => {
    assert.match(VERIFY_SRC, /PLANNER ESTIMATE/);
  });

  it("checks extension-owned tables for archive presence rather than skipping them", () => {
    // cron.* and vault.secrets cannot land in a bare cluster — pg_cron needs
    // shared_preload_libraries and supabase_vault is not distributed. Skipping
    // them would let the data silently stop being dumped.
    assert.match(VERIFY_SRC, /LEVELFLOW_PG_EXTENSION_OWNED:-cron\.job cron\.job_run_details vault\.secrets/);
    assert.match(VERIFY_SRC, /the archive does not carry it at all/);
  });

  it("records that Vault ciphertext is not readable secrets", () => {
    assert.match(VERIFY_SRC, /ciphertext/);
  });

  it("treats an empty bucket as a finding, not a pass", () => {
    assert.match(VERIFY_SRC, /nothing to restore, which is itself the finding/);
  });

  it("separates data-section errors from the role errors a bare cluster always has", () => {
    assert.match(VERIFY_SRC, /DATA_ERRORS/);
    assert.match(VERIFY_SRC, /TABLE DATA\|COPY/);
  });
});
