import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * 6b-1 item G: the minute bank's OFF-BOX copy.
 *
 * The bank and every local snapshot live on one disk, and FMP re-serves
 * 1-minute bars about three days deep — 100% of the bank is already past that
 * window. Local snapshots protect against a bad script; nothing protected
 * against losing the machine until 2026-09-01.
 *
 * NOTHING HERE TOUCHES R2. Every case below either reads the source or
 * exercises a REFUSAL path, which returns before any network call. A test that
 * needed the real bucket to prove itself would be the very defect this file
 * was written after.
 */

const SCRIPT = "scripts/ops/push-minute-bank-offbox.sh";
const SOURCE = readFileSync(SCRIPT, "utf8");
const CALLER = readFileSync("scripts/ops/backup-minute-bank.sh", "utf8");

function run(snapshot: string, env: Record<string, string> = {}) {
  try {
    const out = execFileSync("bash", [SCRIPT, snapshot], {
      encoding: "utf8",
      env: { ...process.env, R2_TOKEN: "", ...env },
    });
    return { code: 0, out };
  } catch (error) {
    const shell = error as { status?: number; stdout?: string; stderr?: string };
    return { code: shell.status ?? -1, out: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
  }
}

describe("the off-box push refuses before it can do harm", () => {
  it("refuses a snapshot under a temp directory, because that is a sandbox", () => {
    // The case that actually happened. On 2026-09-01 the backup tests ran the
    // real script against a sandbox bank whose snapshot carried the SAME
    // YYYYMMDD stamp as production, so the key collided exactly and a
    // 450-byte fixture replaced the real 17,461,396-byte archive. The env
    // flag added afterwards is barrier 1; this is barrier 2, and it is the one
    // that does not depend on a caller remembering anything.
    const root = mkdtempSync(join(tmpdir(), "offbox-"));
    const snap = join(root, "levelflow-minute-bank-snapshot-20260902");
    mkdirSync(snap);
    writeFileSync(join(snap, "AAA.jsonl"), "{}\n");

    const { code, out } = run(snap, { R2_TOKEN: "not-a-real-token" });
    assert.equal(code, 1);
    assert.match(out, /refusing to push a snapshot under a temp directory/);
    // And it refused BEFORE reading the token, so ordering is part of the guard.
    assert.doesNotMatch(out, /R2_TOKEN is unset/);
  });

  it("refuses a snapshot that does not exist", () => {
    const { code, out } = run(join(process.cwd(), "no-such-snapshot-20260902"));
    assert.equal(code, 1);
    assert.match(out, /snapshot directory does not exist/);
  });

  it("refuses when the token was not injected, naming how to invoke it", () => {
    // process.cwd(), not a hardcoded home directory. The first version of this
    // passed "/Users/peacock" and went green here and RED on CI, where the
    // path does not exist and the earlier existence guard fired instead — so
    // the test proved the wrong refusal and said nothing about the token. Any
    // real directory outside a temp root reaches the token check, because the
    // guards run existence, then sandbox, then token, in that order.
    // TMPDIR is pinned to a sentinel so the sandbox barrier cannot fire on a
    // runner whose temp root happens to prefix the checkout. Without this the
    // test would depend on the CI image's environment, which is the same class
    // of assumption that made the first version machine-specific.
    const { code, out } = run(process.cwd(), { TMPDIR: "/nonexistent-tmp-for-this-test" });
    assert.equal(code, 1);
    assert.match(out, /R2_TOKEN is unset/);
    assert.match(out, /wl-secret cloudflare-r2-backup=R2_TOKEN/);
  });

  it("orders its guards so each one can actually be reached", () => {
    // The ordering IS the contract: a non-existent path under a temp root must
    // report the missing directory, not the sandbox refusal, or the sandbox
    // barrier would be unreachable for any path that also fails to exist.
    const { out } = run(join(tmpdir(), "no-such-snapshot-20260902"));
    assert.match(out, /snapshot directory does not exist/);
    assert.doesNotMatch(out, /refusing to push a snapshot under a temp directory/);
  });
});

describe("the remote layout is a contract, not a convenience", () => {
  it("builds exactly <prefix>/<YYYY>/<MM>/minute-bank-<stamp>.tar.zst", () => {
    // The owner's requirement was a consistent hierarchy with durable
    // callbacks. Pinned here so a second dataset joins this tree rather than
    // inventing one beside it.
    assert.match(
      SOURCE,
      /KEY="\$PREFIX\/\$\{STAMP:0:4\}\/\$\{STAMP:4:2\}\/minute-bank-\$STAMP\.tar\.zst"/,
    );
    assert.match(SOURCE, /LEVELFLOW_R2_BUCKET:-windwardline-backups/);
    assert.match(SOURCE, /LEVELFLOW_R2_PREFIX:-levelflow-cloud\/minute-bank/);
  });

  it("lists with --files-only, or the prune deletes a directory first", () => {
    // Measured 2026-09-01: `lsf -R` emits the year and month directory entries
    // even under --include, and they sort BEFORE the archives beneath them. One
    // object listed as three, and the prune would have reached for `2026/`.
    assert.match(SOURCE, /rclone lsf -R --files-only/);
  });

  it("verifies the REMOTE copy rather than the upload's exit code", () => {
    assert.match(SOURCE, /rclone hashsum md5/);
    assert.match(SOURCE, /remote md5 \$REMOTE_MD5 != local \$LOCAL_MD5/);
    assert.match(SOURCE, /no object at R2:\$BUCKET\/\$KEY after upload/);
  });

  it("keeps the protected naive-era archive out of the remote prune", () => {
    assert.match(SOURCE, /PROTECTED="20260823"/);
    assert.match(SOURCE, /protected: the naive-era corpus, owner decision/);
  });
});

describe("the daily job cannot report success on a failed push", () => {
  it("exits non-zero when the push fails", () => {
    assert.match(CALLER, /FAIL off-box push did not complete/);
    // By absolute path since 2026-09-02: launchd's login shell never sees
    // ~/.local/bin, so the launcher is named, not looked up.
    assert.match(CALLER, /"\$WL_SECRET" cloudflare-r2-backup=R2_TOKEN -- "\$OFFBOX" "\$DEST" \|\| \{/);
  });

  it("has exactly one skip, and it announces itself", () => {
    assert.match(CALLER, /off-box SKIPPED by LEVELFLOW_SKIP_OFFBOX=1/);
    const skips = [...CALLER.matchAll(/LEVELFLOW_SKIP_OFFBOX/g)];
    assert.equal(skips.length, 2, "the skip flag is read in more than one place");
  });

  it("refuses to run at all when wl-secret is absent", () => {
    // Otherwise the token would have to come from somewhere that persists,
    // which is the thing the credential policy exists to prevent.
    assert.match(CALLER, /wl-secret is not executable at \$WL_SECRET; the R2 token cannot be read/);
    assert.match(CALLER, /WL_SECRET="\$\{LEVELFLOW_WL_SECRET:-\$HOME\/\.local\/bin\/wl-secret\}"/);
  });
});
