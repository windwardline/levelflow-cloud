import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * LOCAL/OFF-BOX PARITY.
 *
 * The off-box push verifies the object it just wrote. Nothing verified that
 * the two SIDES agree, so drift had no way to announce itself: an archive
 * deleted out-of-band, a prune that ran on one side only, or — the case that
 * actually happened on 2026-09-02T05:36Z — a push that failed while the local
 * snapshot was placed anyway, leaving a local stamp with no archive behind it
 * and the next day's successful run reporting nothing wrong.
 *
 * The invariant is deliberately one-directional. Local retention is 14 and
 * remote is 60, so the steady state is local ⊆ remote: every local snapshot
 * must have an off-box archive, and remote archives with no local snapshot are
 * expected rather than drift.
 *
 * NOTHING HERE TOUCHES R2. The checker reads the remote listing from stdin
 * precisely so the comparison can be EXERCISED rather than read — the caller
 * supplies the listing, the network lives in the caller, and every case below
 * runs the real script against real directories.
 */

const SCRIPT = "scripts/ops/check-minute-bank-parity.sh";

/** A snapshot root holding one directory per stamp, as the backup writes them. */
function rootWith(stamps: string[], extras: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "parity-"));
  for (const stamp of stamps) {
    const snap = join(root, `levelflow-minute-bank-snapshot-${stamp}`);
    mkdirSync(snap);
    writeFileSync(join(snap, "AAA.jsonl"), "{}\n");
  }
  for (const name of extras) mkdirSync(join(root, name));
  return root;
}

/** The remote listing as `rclone lsf -R --files-only` emits it. */
function listing(stamps: string[]) {
  return stamps.map((s) => `levelflow-cloud/minute-bank/${s.slice(0, 4)}/${s.slice(4, 6)}/minute-bank-${s}.tar.zst\n`).join("");
}

function check(root: string, remote: string) {
  try {
    const out = execFileSync("bash", [SCRIPT, root], { encoding: "utf8", input: remote });
    return { code: 0, out };
  } catch (error) {
    const shell = error as { status?: number; stdout?: string; stderr?: string };
    return { code: shell.status ?? -1, out: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
  }
}

describe("local/off-box parity", () => {
  it("passes when every local snapshot has an off-box archive", () => {
    const root = rootWith(["20260831", "20260902"]);
    const { code, out } = check(root, listing(["20260831", "20260902"]));
    assert.equal(code, 0);
    assert.match(out, /parity ok: 2 local snapshot\(s\), all present off-box/);
  });

  it("fails and NAMES the stamp when a local snapshot has no off-box archive", () => {
    // The 2026-09-02T05:36Z shape: the snapshot was placed, the push failed.
    const root = rootWith(["20260831", "20260902"]);
    const { code, out } = check(root, listing(["20260902"]));
    assert.equal(code, 1);
    assert.match(out, /PARITY FAILED/);
    assert.match(out, /20260831/);
    // Naming it is the whole point — a count alone cannot be acted on.
    assert.doesNotMatch(out, /parity ok/);
  });

  it("accepts remote archives with no local snapshot, because retention differs by design", () => {
    // Local keeps 14, remote keeps 60. Depth off-box is the point of off-box.
    const root = rootWith(["20260902"]);
    const { code, out } = check(root, listing(["20260823", "20260825", "20260902"]));
    assert.equal(code, 0);
    assert.match(out, /parity ok: 1 local snapshot\(s\)/);
  });

  it("refuses to report a pass when it examined nothing", () => {
    // An empty root means the glob found no snapshots, which is never a
    // healthy state on a machine that just wrote one — and a checker that
    // reports success over zero comparisons is the silent failure this whole
    // file exists to prevent.
    const root = rootWith([]);
    const { code, out } = check(root, listing(["20260902"]));
    assert.equal(code, 1);
    assert.match(out, /no local snapshots/);
  });

  it("ignores directories that are not snapshots", () => {
    const root = rootWith(["20260902"], ["levelflow-minute-bank-snapshot-partial", "unrelated"]);
    const { code } = check(root, listing(["20260902"]));
    assert.equal(code, 0);
  });

  it("ignores an interrupted copy, which carries a real stamp plus a suffix", () => {
    // `backup-minute-bank.sh` copies to `<dest>.partial` and moves it into
    // place, so a run killed mid-copy leaves exactly this name behind. Read
    // loosely it parses as stamp 20260903 and would report a phantom missing
    // archive for a snapshot that was never placed.
    const root = rootWith(["20260902"], ["levelflow-minute-bank-snapshot-20260903.partial"]);
    const { code, out } = check(root, listing(["20260902"]));
    assert.equal(code, 0);
    assert.doesNotMatch(out, /20260903/);
  });

  it("refuses a snapshot root that does not exist, rather than passing vacuously", () => {
    const { code, out } = check(join(tmpdir(), "no-such-parity-root"), listing([]));
    assert.equal(code, 1);
    assert.match(out, /snapshot root does not exist/);
  });
});

describe("the off-box push runs the parity check", () => {
  const PUSH = readFileSync("scripts/ops/push-minute-bank-offbox.sh", "utf8");

  it("checks parity AFTER the prune, or it would compare against a stale listing", () => {
    const prune = PUSH.indexOf("pruning remote");
    const parity = PUSH.indexOf("check-minute-bank-parity.sh");
    assert.ok(prune > 0, "the prune should still be there");
    assert.ok(parity > prune, "parity must be checked after the prune, not before");
  });

  it("lets a parity failure fail the job, so the daily exit status carries it", () => {
    // ops/agent-exit-status.sh reads the launchd exit code; a parity failure
    // that exited 0 would render as a healthy backup. Assert the invocation
    // EXISTS before asserting it is not neutered — a `doesNotMatch` alone is
    // vacuously true on a script that never calls the checker at all.
    assert.match(PUSH, /check-minute-bank-parity\.sh/);
    assert.match(PUSH, /set -euo pipefail/);
    assert.doesNotMatch(PUSH, /check-minute-bank-parity\.sh[^\n]*\|\|\s*true/);
  });
});
