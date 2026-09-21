import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * THE BANK AND ITS BACKUP MUST NOT RUN AT THE SAME TIME.
 *
 * Between 2026-09-17 and 2026-09-21 the off-box snapshot failed eight times
 * with `VERIFY FAILED: copied 100/3332370 against 100/3326559` — the copy
 * holding MORE bars than the reference count taken moments earlier. The newest
 * archive in R2 stopped advancing on 2026-09-19 while the bank kept growing,
 * so the one irreplaceable dataset in this repository was accumulating in a
 * single location again. That is the precise failure R0b was opened to close.
 *
 * It is NOT the harmless superset it looks like. `bank-minute-bars.ts` appends
 * to `<symbol>.jsonl` and then writes `<symbol>.state.json` as two separate,
 * non-atomic steps, so a `cp -R` running alongside it can capture a torn final
 * line, or a sidecar that disagrees with the data file beside it. Loosening the
 * verify to accept a larger copy would have shipped exactly that off-box, and
 * silently — the count check caught this by luck, not by design, because a copy
 * taken between the append and the sidecar write matches on bar count and is
 * still internally inconsistent.
 *
 * So the repair is mutual exclusion rather than a looser comparison, and the
 * strict verify stays exactly as it was: it still guards the short copy it was
 * written for.
 *
 * WHY NOT STAGGER THE SCHEDULE. Both plists carry `RunAtLoad`, both
 * deliberately and for the same reason — a machine asleep at 07:20 or 20:10 has
 * missed a window, and the bars it missed are the ones no money buys back. So
 * they co-fire on every login and reload, which is where six of the eight
 * failures came from. Moving a clock cannot fix two jobs that are both correct
 * to run at load, and it would not help the hand-run path at all: the
 * `levelflow-bank-minute-bars` scheduled task tells an agent to run the bank by
 * hand when it has stalled, which can land on top of the 20:10 backup. A lock
 * is the only guard that covers every way the two can meet.
 */

const HELPER = "scripts/ops/bank-lock.sh";

/** A sandbox bank with one symbol and one bar, plus its own lock path. */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "bank-lock-"));
  const bank = join(root, "bank");
  mkdirSync(bank);
  writeFileSync(join(bank, "EURUSD.jsonl"), '{"date":"2026-08-01"}\n');
  return { root, bank, lock: `${bank}.lock` };
}

/** Run a snippet with the helper sourced. Returns exit code and output. */
function withHelper(
  snippet: string,
  env: Record<string, string> = {},
): { code: number; out: string } {
  try {
    const out = execFileSync("bash", ["-c", `. ${HELPER}\n${snippet}`], {
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (error) {
    const shell = error as { status?: number; stderr?: string; stdout?: string };
    return {
      code: shell.status ?? 1,
      out: `${shell.stdout ?? ""}${shell.stderr ?? ""}`,
    };
  }
}

/**
 * Hold the lock for `seconds` in a background process, appending the whole
 * time. Resolves once the lock is demonstrably held, so the caller races
 * nothing.
 */
function holdLock(bank: string, seconds: number) {
  const child = spawn(
    "bash",
    [
      "-c",
      `. ${HELPER}
       acquire_bank_lock "${bank}"
       echo HELD
       for i in $(seq 1 ${Math.round(seconds / 0.05)}); do
         echo '{"date":"appended"}' >> "${bank}/EURUSD.jsonl"
         sleep 0.05
       done`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const held = new Promise<void>((resolve, reject) => {
    let seen = "";
    child.stdout.on("data", (chunk: Buffer) => {
      seen += chunk.toString();
      if (seen.includes("HELD")) resolve();
    });
    child.on("exit", () => reject(new Error(`holder exited early: ${seen}`)));
  });
  const done = new Promise<void>((resolve) => child.on("exit", () => resolve()));
  return { held, done, child };
}

describe("the bank lock serialises the writer and the copier", () => {
  it("hands the lock to one holder at a time", async () => {
    const { bank } = sandbox();
    const holder = holdLock(bank, 0.6);
    await holder.held;

    // A second acquirer with no patience must report contention rather than
    // barge in. `0` is "do not wait", which only a test ever wants.
    const second = withHelper(`acquire_bank_lock "${bank}" && echo GOT_IT`, {
      LEVELFLOW_BANK_LOCK_TIMEOUT: "0",
    });
    assert.notEqual(second.code, 0, `a second holder got in: ${second.out}`);
    assert.doesNotMatch(second.out, /GOT_IT/);

    await holder.done;
    // And once released it is available, or the lock is a one-shot brick.
    const third = withHelper(`acquire_bank_lock "${bank}" && echo GOT_IT`, {
      LEVELFLOW_BANK_LOCK_TIMEOUT: "0",
    });
    assert.equal(third.code, 0, third.out);
    assert.match(third.out, /GOT_IT/);
  });

  it("WAITS for the holder instead of failing, when given the time", async () => {
    // The backup's whole repair. Before this it counted a bank that was being
    // written underneath it and refused its own copy.
    const { bank } = sandbox();
    const holder = holdLock(bank, 0.6);
    await holder.held;

    const waiter = withHelper(
      `acquire_bank_lock "${bank}" && wc -l < "${bank}/EURUSD.jsonl"`,
      { LEVELFLOW_BANK_LOCK_TIMEOUT: "30" },
    );
    assert.equal(waiter.code, 0, waiter.out);
    await holder.done;

    // It waited for a QUIESCENT bank: the holder appended ~12 bars on top of
    // the one seeded, and a waiter that did not wait would have seen fewer.
    const seen = Number(waiter.out.trim().split("\n").pop());
    const final = readFileSync(join(bank, "EURUSD.jsonl"), "utf8").trim().split("\n").length;
    assert.equal(seen, final, "the waiter read a bank that was still moving");
  });

  it("breaks a lock whose holder is dead, and says so", async () => {
    // THE FAILURE THIS FIX COULD HAVE INTRODUCED. A process killed between
    // `mkdir` and its release leaves the directory behind, and a lock nobody
    // can break stops every backup from then on — silently, which is worse
    // than the bug being fixed here.
    const { bank, lock } = sandbox();
    mkdirSync(lock);

    // A REAL dead pid, from a process this test watched exit. The first
    // version of this wrote `0` and asserted it read as dead; it does not.
    // `kill -0 0` addresses the process group and SUCCEEDS, so pid 0 reads as
    // a live holder — the test was wrong about the mechanism it was pinning.
    const corpse = spawn("bash", ["-c", "exit 0"]);
    const deadPid = corpse.pid;
    await new Promise<void>((resolve) => corpse.on("exit", () => resolve()));
    writeFileSync(join(lock, "pid"), `${deadPid}\n`);

    const result = withHelper(`acquire_bank_lock "${bank}" && echo GOT_IT`, {
      LEVELFLOW_BANK_LOCK_TIMEOUT: "5",
    });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /GOT_IT/);
    assert.match(result.out, /stale bank lock \(dead holder/);
  });

  it("breaks a lock whose pid file cannot be read as a process", () => {
    // The trap the test above walked into, now pinned as behaviour: `0` must
    // never be handed to `kill -0`, because it addresses the process group and
    // would wedge every backup from then on behind a holder that does not
    // exist. Anything non-numeric fails the same way.
    for (const junk of ["0", "not-a-pid", "-1"]) {
      const { bank, lock } = sandbox();
      mkdirSync(lock);
      writeFileSync(join(lock, "pid"), `${junk}\n`);
      const result = withHelper(`acquire_bank_lock "${bank}" && echo GOT_IT`, {
        LEVELFLOW_BANK_LOCK_TIMEOUT: "2",
      });
      assert.equal(result.code, 0, `pid file "${junk}" wedged the lock: ${result.out}`);
      assert.match(result.out, /stale bank lock \(unreadable holder/);
    }
  });

  it("gives up LOUDLY and non-zero rather than skipping the work", async () => {
    // A lock that timed out quietly would render in launchd as a healthy
    // backup, which is the shape `ops/agent-exit-status.sh` reads. Exit
    // non-zero or the failure becomes invisible.
    const { bank } = sandbox();
    const holder = holdLock(bank, 1.5);
    await holder.held;

    const result = withHelper(`acquire_bank_lock "${bank}" && echo GOT_IT`, {
      LEVELFLOW_BANK_LOCK_TIMEOUT: "1",
    });
    assert.notEqual(result.code, 0, result.out);
    assert.doesNotMatch(result.out, /GOT_IT/);
    assert.match(result.out, /could not acquire the bank lock/);
    await holder.done;
  });

  it("times out on a lock it cannot break, rather than spinning forever", () => {
    // FOUND BY MUTATION, NOT BY REVIEW. Disabling the stale-break to check
    // that something failed hung the suite for seven minutes instead. A dead
    // holder that cannot be renamed away reports "stale" on every pass, and
    // the loop went straight back to the top — past the deadline check and
    // past the sleep. An unbreakable lock spun a core indefinitely and no
    // timeout ever fired, which is the silent hang this helper exists to
    // avoid.
    //
    // A read-only parent directory is the real-world shape of it: `mkdir`
    // cannot create, `mv` cannot break, and the only correct answer is to give
    // up loudly on schedule.
    const { bank, lock } = sandbox();
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), "0\n");
    const parent = join(lock, "..");
    execFileSync("chmod", ["500", parent]);
    try {
      const started = Date.now();
      const result = withHelper(`acquire_bank_lock "${bank}" && echo GOT_IT`, {
        LEVELFLOW_BANK_LOCK_TIMEOUT: "2",
      });
      const elapsed = Date.now() - started;
      assert.notEqual(result.code, 0, result.out);
      assert.doesNotMatch(result.out, /GOT_IT/);
      assert.match(result.out, /could not acquire the bank lock/);
      assert.ok(elapsed < 30_000, `it did not give up on schedule: ${elapsed}ms`);
    } finally {
      execFileSync("chmod", ["755", parent]);
    }
  });

  it("will not delete a lock that has stopped being ours", async () => {
    // ADDED BECAUSE THE MUTATION SURVIVED. Deleting the lock unconditionally on
    // the way out passed all ten of the other tests, so the ownership check in
    // `release_bank_lock` was decoration rather than a guard.
    //
    // It is reachable: a truncated pid file reads as unreadable, so a waiter
    // breaks the lock and takes it while the original holder is still running.
    // That holder must not then delete the NEW holder's lock on its way out —
    // which would put the bank and its backup back in the store together, the
    // exact state this file exists to prevent.
    const { bank, lock } = sandbox();
    const child = spawn("bash", [
      "-c",
      `. ${HELPER}
       acquire_bank_lock "${bank}"
       echo HELD
       sleep 1`,
    ]);
    await new Promise<void>((resolve, reject) => {
      let seen = "";
      child.stdout.on("data", (c: Buffer) => {
        seen += c.toString();
        if (seen.includes("HELD")) resolve();
      });
      child.on("exit", () => reject(new Error("holder exited early")));
    });

    // Someone else now owns it, as far as the filesystem is concerned.
    writeFileSync(join(lock, "pid"), "424242\n");
    await new Promise<void>((resolve) => child.on("exit", () => resolve()));

    const after = withHelper(`[[ -d "${lock}" ]] && echo STILL_THERE || echo GONE`);
    assert.match(
      after.out,
      /STILL_THERE/,
      "the departing holder deleted a lock it no longer owned",
    );
  });

  it("refuses to load outside bash, rather than locking nothing", () => {
    // FOUND BY THE PRODUCTION CHECK, AFTER #658 MERGED. The check held the lock
    // from an agent's shell — which is zsh — and the backup walked straight
    // through it. zsh fires an `EXIT` trap set inside a function when the
    // FUNCTION returns, so the helper's release backstop deleted the lock the
    // instant `acquire_bank_lock` succeeded. The caller was told it held a
    // lock it did not hold, which is worse than having no lock at all.
    //
    // Both launchd jobs run under bash via their shebangs, so production was
    // never exposed. Any other caller was: an agent sourcing this to hold the
    // bank still while it works is exactly the person who would do it.
    //
    // `unset BASH_VERSION` makes the guard's input absent on every platform,
    // including CI runners that ship no zsh.
    const { bank } = sandbox();
    const result = (() => {
      try {
        return {
          code: 0,
          out: execFileSync(
            "bash",
            ["-c", `unset BASH_VERSION; . ${HELPER} && acquire_bank_lock "${bank}" && echo GOT_IT`],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
          ),
        };
      } catch (error) {
        const shell = error as { status?: number; stderr?: string; stdout?: string };
        return { code: shell.status ?? 1, out: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
      }
    })();
    assert.notEqual(result.code, 0, `the helper loaded without bash: ${result.out}`);
    assert.doesNotMatch(result.out, /GOT_IT/);
    assert.match(result.out, /must be sourced from bash/);
  });

  it("refuses zsh specifically, the shell that actually broke it", (t) => {
    // The real trigger, where the machine has it. The test above pins the
    // guard everywhere; this one pins the behaviour that motivated it.
    try {
      execFileSync("zsh", ["-c", "true"]);
    } catch {
      t.skip("zsh is not installed here; the BASH_VERSION case above still runs");
      return;
    }
    const { bank, lock } = sandbox();
    const result = (() => {
      try {
        return {
          code: 0,
          out: execFileSync(
            "zsh",
            ["-c", `. ${HELPER} && acquire_bank_lock "${bank}" && echo GOT_IT`],
            { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
          ),
        };
      } catch (error) {
        const shell = error as { status?: number; stderr?: string; stdout?: string };
        return { code: shell.status ?? 1, out: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
      }
    })();
    assert.notEqual(result.code, 0, `zsh was handed a lock: ${result.out}`);
    assert.doesNotMatch(result.out, /GOT_IT/);
    const leftover = withHelper(`[[ -d "${lock}" ]] && echo PRESENT || echo ABSENT`);
    assert.match(leftover.out, /ABSENT/, "a refused load still created the lock");
  });

  it("does not leave the lock behind when the holder exits", () => {
    const { bank, lock } = sandbox();
    const first = withHelper(`acquire_bank_lock "${bank}"`, {
      LEVELFLOW_BANK_LOCK_TIMEOUT: "0",
    });
    assert.equal(first.code, 0, first.out);
    const after = withHelper(`[[ -d "${lock}" ]] && echo STILL_THERE || echo GONE`);
    assert.match(after.out, /GONE/, "the lock outlived its holder");
  });
});

describe("both sides of the race take the lock", () => {
  const DAILY = readFileSync("scripts/ops/bank-minute-bars-daily.sh", "utf8");
  const BACKUP = readFileSync("scripts/ops/backup-minute-bank.sh", "utf8");

  it("the bank run refuses to start while the backup holds the lock", () => {
    // EXERCISED, not matched. The daily script reaches the keychain and the
    // network, so the assertion is that it stops at the lock BEFORE either —
    // no fetch, no `npx`, and a non-zero exit launchd can see.
    const { bank } = sandbox();
    const lock = `${bank}.lock`;
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), `${process.pid}\n`);

    const result = (() => {
      try {
        return {
          code: 0,
          out: execFileSync("bash", ["scripts/ops/bank-minute-bars-daily.sh"], {
            encoding: "utf8",
            env: {
              ...process.env,
              LEVELFLOW_BANK_DIR: bank,
              LEVELFLOW_BANK_LOCK_TIMEOUT: "1",
            },
          }),
        };
      } catch (error) {
        const shell = error as { status?: number; stderr?: string; stdout?: string };
        return {
          code: shell.status ?? 1,
          out: `${shell.stdout ?? ""}${shell.stderr ?? ""}`,
        };
      }
    })();

    assert.notEqual(result.code, 0, `the bank ran under a held lock: ${result.out}`);
    assert.match(result.out, /could not acquire the bank lock/);
    assert.doesNotMatch(
      result.out,
      /minute-bank run starting/,
      "the bank announced a run it could not take the lock for",
    );
  });

  it("the backup waits out a bank run and snapshots a STILL bank", async () => {
    // THE EIGHT FAILURES, REPRODUCED AND CLOSED. This is the production path:
    // the real backup script, against a bank that is being appended to while
    // it wants to copy. Before the lock it counted, copied a bank that had
    // moved underneath it, and refused its own snapshot — eight times, with
    // nothing reaching R2 after 2026-09-19.
    const { bank } = sandbox();
    const dest = mkdtempSync(join(tmpdir(), "bank-lock-dest-"));
    const holder = holdLock(bank, 0.8);
    await holder.held;

    const result = (() => {
      try {
        return {
          code: 0,
          out: execFileSync("bash", ["scripts/ops/backup-minute-bank.sh"], {
            encoding: "utf8",
            env: {
              ...process.env,
              LEVELFLOW_BANK_DIR: bank,
              LEVELFLOW_BACKUP_ROOT: dest,
              LEVELFLOW_SKIP_OFFBOX: "1",
              LEVELFLOW_BANK_LOCK_TIMEOUT: "30",
            },
          }),
        };
      } catch (error) {
        const shell = error as { status?: number; stderr?: string; stdout?: string };
        return {
          code: shell.status ?? 1,
          out: `${shell.stdout ?? ""}${shell.stderr ?? ""}`,
        };
      }
    })();
    await holder.done;

    assert.equal(result.code, 0, result.out);
    assert.doesNotMatch(result.out, /VERIFY FAILED/, "the copy raced the writer again");
    assert.match(result.out, /snapshot verified and placed/);

    // The snapshot is not merely present — it holds every bar the writer
    // finished with. A backup that ran first and won the race would be short.
    const placed = readdirSync(dest).filter((n) => n.startsWith("levelflow-minute-bank-snapshot-"));
    assert.equal(placed.length, 1, result.out);
    const snapped = readFileSync(join(dest, placed[0], "EURUSD.jsonl"), "utf8").trim().split("\n").length;
    const live = readFileSync(join(bank, "EURUSD.jsonl"), "utf8").trim().split("\n").length;
    assert.equal(snapped, live, "the snapshot is not the bank the writer left behind");
    assert.ok(live > 1, "the writer never appended, so this proved nothing");
  });

  it("the bank script resolves its own checkout, not one machine's path", () => {
    // The literal `/Users/peacock/...` that stood here passed every local run
    // and failed in CI the moment a test EXECUTED the script — `cd: No such
    // file or directory`. Nothing had ever run it off this machine before.
    assert.doesNotMatch(
      DAILY,
      /REPO="\/Users\//,
      "the repo path is hardcoded again; it resolves on exactly one machine",
    );
    assert.match(DAILY, /REPO="\$\{LEVELFLOW_REPO:-\$\(cd "\$\(dirname/);
  });

  it("neither script can drop its lock without this test noticing", () => {
    // The source pin exists because the two call sites are what make the
    // exercised behaviour above true of PRODUCTION rather than of a sandbox.
    for (const [name, source] of [
      ["bank-minute-bars-daily.sh", DAILY],
      ["backup-minute-bank.sh", BACKUP],
    ] as const) {
      assert.match(source, /\. .*bank-lock\.sh/, `${name} no longer sources the lock helper`);
      assert.match(source, /acquire_bank_lock/, `${name} no longer acquires the lock`);
    }
    // The backup must take it BEFORE it counts, or it counts a moving bank —
    // the exact ordering the eight failures came from.
    assert.ok(
      BACKUP.indexOf("acquire_bank_lock") < BACKUP.indexOf("read -r SRC_FILES"),
      "the backup counts the bank before it takes the lock",
    );
  });
});
