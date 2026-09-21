import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, it } from "node:test";
import { scratchDir } from "./support/scratchDir.ts";

/**
 * R0b: the minute bank's RECURRING backup.
 *
 * `.minute-bank/` holds 2,067,013 one-minute bars across 100 symbols, and FMP
 * re-serves 1-minute bars only about three days deep — measured 2026-08-31,
 * 100% of the bank is already past that. It is unrecoverable at any price,
 * which is the one property nothing else in this repository has.
 *
 * The deliverable was always "a recurring mechanism, not that copy", and the
 * record shows why: two manual snapshots two days apart, then six days of
 * nothing while 121,669 irreplaceable bars accumulated in a single location.
 *
 * EXERCISED, NOT READ. The script takes its paths from the environment so
 * these run it for real — the verify branch and the protected-name branch are
 * the two that matter and neither is provable from a source match.
 */

const SCRIPT = "scripts/ops/backup-minute-bank.sh";
const SOURCE = readFileSync(SCRIPT, "utf8");

/** A sandbox bank with `symbols` files and one bar each, plus a dest root. */
function sandbox(symbols: string[]) {
  const root = scratchDir("bank-backup-");
  const bank = join(root, "bank");
  const dest = join(root, "dest");
  mkdirSync(bank);
  mkdirSync(dest);
  for (const symbol of symbols) {
    writeFileSync(join(bank, `${symbol}.jsonl`), '{"date":"2026-08-01"}\n');
  }
  return { bank, dest, root };
}

function run(
  bank: string,
  dest: string,
  extra: Record<string, string> = {},
): { code: number; out: string } {
  try {
    const out = execFileSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: {
        ...process.env,
        LEVELFLOW_BACKUP_ROOT: dest,
        LEVELFLOW_BANK_DIR: bank,
        // BARRIER 1 of 2. These tests run the REAL script, and on 2026-09-01
        // that meant they pushed a 450-byte sandbox bank over the production
        // archive in R2 — the sandbox stamp is today's, so the key collided
        // exactly. The push script also refuses any snapshot under a temp
        // directory, because a flag the caller must remember is not a guard.
        LEVELFLOW_SKIP_OFFBOX: "1",
        ...extra,
      },
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

const snapshots = (dest: string) =>
  readdirSync(dest).filter((name) => name.startsWith("levelflow-minute-bank-snapshot-")).sort();

// launchd hands its agents this PATH: neither ~/.local/bin nor /opt/homebrew/bin.
const LAUNCHD_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

/**
 * A HOME whose ~/.local/bin holds a recording wl-secret stub, or nothing.
 *
 * The stub records its argv and exits 0 WITHOUT running the command it was
 * handed, so the push script, rclone and R2 are never reached. That is what
 * lets a case run the real prune, which the script now reaches only after a
 * push that succeeded.
 */
function homeWith(root: string, stub: boolean) {
  const home = join(root, "home");
  const bin = join(home, ".local", "bin");
  mkdirSync(bin, { recursive: true });
  const calls = join(root, "wl-secret.calls");
  if (stub) {
    writeFileSync(
      join(bin, "wl-secret"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\nexit 0\n`,
      { mode: 0o755 },
    );
  }
  return { calls, home };
}

function runUnderLaunchd(
  bank: string,
  dest: string,
  home: string,
  extra: Record<string, string> = {},
): { code: number; out: string } {
  try {
    const out = execFileSync("bash", [SCRIPT], {
      encoding: "utf8",
      // NOT `...process.env`: the point is the environment launchd hands the
      // agent, and no inherited override can stand in for the one under test.
      env: {
        HOME: home,
        LEVELFLOW_BACKUP_ROOT: dest,
        LEVELFLOW_BANK_DIR: bank,
        PATH: LAUNCHD_PATH,
        ...extra,
      },
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

describe("the backup copies and then PROVES it copied", () => {
  it("places a snapshot whose counts match the bank", () => {
    const { bank, dest } = sandbox(["EURUSD", "BTCUSD", "XAUUSD"]);
    const result = run(bank, dest);
    assert.equal(result.code, 0, result.out);
    const made = snapshots(dest);
    assert.equal(made.length, 1, result.out);
    assert.equal(
      readdirSync(join(dest, made[0])).filter((n) => n.endsWith(".jsonl")).length,
      3,
    );
    assert.match(result.out, /snapshot verified and placed/);
  });

  it("REFUSES an empty bank rather than overwriting a good snapshot", () => {
    // The worst failure available to a backup: replacing yesterday's real copy
    // with today's empty one, and exiting 0.
    const { bank, dest } = sandbox(["EURUSD"]);
    assert.equal(run(bank, dest).code, 0);
    // Inside a scratch root, not beside one: the lock is taken at
    // `<bank>.lock`, a sibling of the bank.
    const empty = join(scratchDir("empty-bank-"), "bank");
    mkdirSync(empty);
    const second = run(empty, dest);
    assert.notEqual(second.code, 0, "an empty bank exited zero");
    assert.match(second.out, /refusing to write an empty snapshot/);
    assert.equal(
      readdirSync(join(dest, snapshots(dest)[0])).filter((n) => n.endsWith(".jsonl")).length,
      1,
      "the good snapshot was destroyed by the refused run",
    );
  });

  it("compares the copy against the source and refuses a mismatch", () => {
    // PINNED IN SOURCE, deliberately and with the limit stated. `cp -R`
    // succeeds in a sandbox, so the verify branch is unreachable by execution
    // here — the failure it guards is a full disk or a partial copy, neither
    // of which a test can induce without faking the filesystem. A mutation
    // deleting the whole comparison passed every behavioural assertion in this
    // file, which is exactly why this one is here.
    const verifyAt = SOURCE.indexOf('read -r DST_FILES DST_BARS');
    assert.ok(verifyAt > 0, "the verify step moved — re-anchor this");
    const verify = SOURCE.slice(verifyAt, verifyAt + 500);
    assert.match(
      verify,
      /\[ "\$DST_FILES" != "\$SRC_FILES" \] \|\| \[ "\$DST_BARS" != "\$SRC_BARS" \]/,
      "the copy is no longer compared against the source — an unverified " +
        "copy is a directory that looks like a backup",
    );
    assert.match(verify, /VERIFY FAILED/);
    assert.match(
      verify,
      /rm -rf "\$TMP"\s*\n\s*exit 1/,
      "a failed verify must discard the partial copy AND exit non-zero, or " +
        "launchd records a success over a backup that did not happen",
    );
  });

  it("writes through a partial path, so an interrupted copy replaces nothing", () => {
    assert.match(SOURCE, /TMP="\$DEST\.partial"/);
    assert.match(SOURCE, /mv "\$TMP" "\$DEST"/);
  });

  it("refuses a named root that does not exist, rather than creating a fresh one", () => {
    // Only the default root is created. A mistyped LEVELFLOW_BACKUP_ROOT that
    // was created silently would hold one snapshot, pass parity over it, and
    // leave the real root abandoned with nothing to say so.
    const { bank, root } = sandbox(["EURUSD"]);
    const missing = join(root, "no-such-root");
    const result = run(bank, missing);
    assert.equal(result.code, 1, result.out);
    assert.match(result.out, /FAIL the snapshot root does not exist: \S+no-such-root/);
    assert.equal(existsSync(missing), false, "a named root was created");
  });
});

describe("the naive-era archive survives the prune", () => {
  // The prune runs only behind a push that succeeded, so these cases hand the
  // script a wl-secret stub that exits 0 without running the push.
  function pushed(root: string) {
    return homeWith(root, true).home;
  }

  it("keeps it even when it is oldest and the window is full", () => {
    // THE MISTAKE THIS EXISTS FOR. Pruning oldest-first deletes
    // `...-20260823` FIRST, and that one is not an ordinary daily: it is the
    // only real naive-era corpus in existence, it validated the clock-witness
    // redesign against real data rather than fixtures, and whether it is ever
    // deleted is an explicit owner decision. A retention COUNT cannot protect
    // it — the whole point of oldest-first is that the oldest goes first.
    const { bank, dest, root } = sandbox(["EURUSD"]);
    for (const day of ["20260823", "20260824", "20260825"]) {
      const dir = join(dest, `levelflow-minute-bank-snapshot-${day}`);
      mkdirSync(dir);
      writeFileSync(join(dir, "EURUSD.jsonl"), '{"date":"old"}\n');
    }
    const result = runUnderLaunchd(bank, dest, pushed(root), { LEVELFLOW_BACKUP_KEEP: "1" });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /pruning /, "the prune never ran, so this proved nothing");
    const left = snapshots(dest);
    assert.ok(
      left.includes("levelflow-minute-bank-snapshot-20260823"),
      `the naive-era corpus was pruned. Left: ${left.join(", ")}`,
    );
    assert.match(result.out, /protected: the naive-era corpus/);
  });

  it("still prunes ordinary snapshots once over the window", () => {
    // Protection that quietly stopped pruning would trade one unbounded thing
    // for another.
    const { bank, dest, root } = sandbox(["EURUSD"]);
    for (const day of ["20260824", "20260825", "20260826"]) {
      mkdirSync(join(dest, `levelflow-minute-bank-snapshot-${day}`));
    }
    const result = runUnderLaunchd(bank, dest, pushed(root), { LEVELFLOW_BACKUP_KEEP: "1" });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /pruning /);
    assert.ok(
      snapshots(dest).length < 4,
      `nothing was pruned: ${snapshots(dest).join(", ")}`,
    );
  });

  it("prunes nothing when the off-box push is skipped", () => {
    // The skip is the test harness's switch, and it used to fall through to
    // the prune. With one daily kept, one skipped run would delete every
    // daily but the newest — including one whose push failed the day before,
    // which exists nowhere off-box.
    const { bank, dest } = sandbox(["EURUSD"]);
    const seeded = ["20260824", "20260825", "20260826"];
    for (const day of seeded) {
      mkdirSync(join(dest, `levelflow-minute-bank-snapshot-${day}`));
    }
    const result = run(bank, dest, { LEVELFLOW_BACKUP_KEEP: "1" });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /prune SKIPPED with the off-box push/);
    assert.doesNotMatch(result.out, /pruning /);
    for (const day of seeded) {
      assert.ok(
        snapshots(dest).includes(`levelflow-minute-bank-snapshot-${day}`),
        `${day} was pruned behind a skipped push: ${snapshots(dest).join(", ")}`,
      );
    }
  });

  it("names the protected snapshot rather than trusting arithmetic", () => {
    assert.match(SOURCE, /PROTECTED="20260823"/);
    assert.match(SOURCE, /A retention count cannot protect it/);
  });
});

describe("it spends no provider bandwidth, by construction", () => {
  it("reaches the network nowhere", () => {
    // The bank is frozen precisely BECAUSE the allowance is exhausted, so a
    // backup that needed the provider could never run when it matters most.
    //
    // COMMENTS STRIPPED FIRST. The first version scanned the whole file and
    // failed on a comment that mentioned `curl` while explaining a different
    // guard — the same flaw, in the same change, as the sweep that comment was
    // about. The claim is that the CODE reaches no network; prose describing
    // the network is not a network call.
    const code = SOURCE.split("\n")
      .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
      .join("\n");
    assert.doesNotMatch(code, /financialmodelingprep|\bcurl\b|\bwget\b|FMP_API_KEY/);
    // Non-vacuity: a stripper that ate everything would pass having read
    // nothing.
    assert.ok(
      code.includes("cp -R") && code.includes("VERIFY FAILED"),
      "comment stripping removed the script's own code",
    );
  });
});

describe("the schedule exists and points at the script", () => {
  const PLIST = "scripts/ops/com.windwardline.levelflow-minute-bank-backup.plist";

  it("is a valid plist naming this script", () => {
    assert.ok(existsSync(PLIST));
    const plist = readFileSync(PLIST, "utf8");
    assert.match(plist, /backup-minute-bank\.sh/);
    assert.match(plist, /StartCalendarInterval/);
    // RunAtLoad matters more here than usual: a machine asleep at the
    // scheduled minute has missed bars no money buys back, and the copy is an
    // APFS clone costing about a second.
    assert.match(plist, /<key>RunAtLoad<\/key>\s*\n\s*<true\/>/);
  });

  it("is registered on this machine, or says why not", (t) => {
    let loaded = "";
    try {
      loaded = execFileSync("launchctl", ["list"], { encoding: "utf8" });
    } catch {
      t.skip("launchctl is unavailable here, so registration cannot be checked");
      return;
    }
    assert.match(
      loaded,
      /com\.windwardline\.levelflow-minute-bank-backup/,
      "the agent is not loaded — the mechanism exists and is not running, " +
        "which is the state R0b was opened for",
    );
  });
});

describe("the off-box step under launchd's environment", () => {
  // THE FAILURE THAT HAPPENED. At 2026-09-02T05:36:29Z the agent ran at load,
  // placed the local snapshot, and then logged `FAIL wl-secret is not on PATH;
  // the R2 token cannot be read` and exited 1. The plist runs `/bin/zsh -lc`,
  // a login shell that never sources ~/.zshrc — and ~/.zshrc is where
  // ~/.local/bin joins PATH. So the resolution worked from every interactive
  // shell it was ever tried in and failed in the one environment the schedule
  // actually runs from. The fix is to stop trusting an inherited PATH for the
  // secret launcher at all.

  it("reaches the off-box push with no ~/.local/bin on PATH", () => {
    const { bank, dest, root } = sandbox(["AAA", "BBB"]);
    const { calls, home } = homeWith(root, true);
    const { code, out } = runUnderLaunchd(bank, dest, home);
    assert.equal(code, 0, out);
    assert.doesNotMatch(out, /not on PATH/);
    // The launcher was invoked by absolute path, with the token binding and
    // the push script as its command — the stub records its argv verbatim.
    const recorded = readFileSync(calls, "utf8");
    assert.match(
      recorded,
      /^cloudflare-r2-backup=R2_TOKEN -- \S+\/scripts\/ops\/push-minute-bank-offbox\.sh \S+levelflow-minute-bank-snapshot-\d{8}\n$/,
    );
  });

  it("names the absolute path it looked at when the launcher is missing", () => {
    const { bank, dest, root } = sandbox(["AAA"]);
    const { home } = homeWith(root, false);
    const { code, out } = runUnderLaunchd(bank, dest, home);
    assert.equal(code, 1);
    // The local snapshot still lands — the copy is the irreplaceable half.
    assert.equal(snapshots(dest).length, 1);
    assert.match(out, /FAIL wl-secret is not executable at \S+\/home\/\.local\/bin\/wl-secret/);
  });

  it("finds its own repository from its own location, so the off-box branch exists on every checkout", () => {
    // CI's first run of the launchd cases failed on a literal
    // /Users/peacock/... repo root: the push script "did not exist" there and
    // the script died before the launcher check it was testing.
    assert.match(SOURCE, /REPO="\$\{LEVELFLOW_REPO:-\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\.\/\.\." && pwd\)\}"/);
    assert.doesNotMatch(SOURCE, /REPO="\/Users\//);
  });

  it("never resolves the secret launcher from an inherited PATH", () => {
    // A source pin beside the executed cases, so the shape cannot come back
    // quietly in a refactor that keeps the tests' stub on PATH.
    assert.doesNotMatch(SOURCE, /command -v wl-secret/);
    assert.match(SOURCE, /\$\{LEVELFLOW_WL_SECRET:-\$HOME\/\.local\/bin\/wl-secret\}/);
  });
});

describe("the snapshots live under ~/.local/share and one daily is kept", () => {
  // THE COMPLAINT (owner, 2026-09-21): dated `levelflow-minute-bank-snapshot-*`
  // directories kept appearing in the home folder. The default root WAS the
  // home folder, and the default retention kept fourteen of them there, beside
  // the owner's own files, while R2 already held a verified archive of each.
  //
  // Every case here leaves LEVELFLOW_BACKUP_ROOT and LEVELFLOW_BACKUP_KEEP
  // unset, because the defaults are the claim. They run under a sandbox HOME
  // with a recording wl-secret stub and launchd's PATH, and they build the
  // environment from nothing rather than from `process.env`, so no inherited
  // override can stand in for the default being tested.
  const DEFAULT_ROOT = [".local", "share", "levelflow-cloud", "minute-bank-snapshots"];

  /**
   * THE BARRIER, and it runs before a single line of the script does.
   *
   * These cases execute the script at its DEFAULT root, and until 2026-09-21
   * that default was the real home folder — where a run places a snapshot and
   * then PRUNES. The red run of this block against that script would have
   * deleted real snapshots from the owner's home. So the default is read out
   * of the source and resolved against the sandbox HOME first, and the script
   * runs only when it lands inside the sandbox. A red test runs the code it is
   * written against; this is what makes that safe.
   */
  function defaultRootInside(home: string): string {
    const code = SOURCE.split("\n")
      .map((line) => line.replace(/(^|\s)#.*$/, "$1"))
      .join("\n");
    assert.doesNotMatch(
      code,
      /\/Users\//,
      "the script names a literal /Users/ path — refusing to run it, because its default could reach the real home folder",
    );
    const assignments = code.match(/^\s*DEST_ROOT=/gm) ?? [];
    assert.equal(assignments.length, 1, "DEST_ROOT is assigned more than once — re-anchor this barrier before running anything");
    const match = code.match(/^DEST_ROOT="\$\{LEVELFLOW_BACKUP_ROOT:-([^}]*)\}"\s*$/m);
    assert.ok(match, "DEST_ROOT's default moved — re-anchor this barrier before running anything");
    const expr = match[1];
    assert.ok(
      expr.startsWith("$HOME/"),
      `the default snapshot root is ${expr}, not a path under $HOME — refusing to run the script`,
    );
    const rest = expr.slice("$HOME/".length);
    assert.doesNotMatch(rest, /[$`]|(^|\/)\.\.(\/|$)/, `the default root escapes $HOME: ${expr}`);
    const resolved = resolve(home, rest);
    assert.ok(resolved.startsWith(home + sep), `the default root resolves outside the sandbox: ${resolved}`);
    return resolved;
  }

  /** A sandbox HOME whose wl-secret stub records its argv and exits `pushCode`. */
  function sandboxHome(pushCode = 0) {
    const { bank, root } = sandbox(["EURUSD", "BTCUSD"]);
    const home = join(root, "home");
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    const calls = join(root, "wl-secret.calls");
    writeFileSync(
      join(home, ".local", "bin", "wl-secret"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\nexit ${pushCode}\n`,
      { mode: 0o755 },
    );
    return { bank, calls, home, snapRoot: join(home, ...DEFAULT_ROOT) };
  }

  /** Seed the default root with pre-existing snapshots, as earlier runs leave it. */
  function seed(snapRoot: string, stamps: string[]) {
    for (const stamp of stamps) {
      const dir = join(snapRoot, `levelflow-minute-bank-snapshot-${stamp}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "EURUSD.jsonl"), '{"date":"old"}\n');
    }
  }

  function runAtDefault(bank: string, home: string): { code: number; out: string } {
    defaultRootInside(home);
    try {
      const out = execFileSync("bash", [SCRIPT], {
        encoding: "utf8",
        env: { HOME: home, LEVELFLOW_BANK_DIR: bank, PATH: LAUNCHD_PATH },
      });
      return { code: 0, out };
    } catch (error) {
      const shell = error as { status?: number; stderr?: string; stdout?: string };
      return { code: shell.status ?? 1, out: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
    }
  }

  /** The stamp this run placed: the one snapshot that was not seeded. */
  function placedStamp(snapRoot: string, seeded: string[]): string {
    const fresh = snapshots(snapRoot)
      .map((name) => name.slice("levelflow-minute-bank-snapshot-".length))
      .filter((stamp) => !seeded.includes(stamp));
    assert.equal(fresh.length, 1, `expected exactly one new snapshot, found: ${fresh.join(", ")}`);
    return fresh[0];
  }

  it("places the snapshot under ~/.local/share/levelflow-cloud/minute-bank-snapshots, creating the root", () => {
    // A fresh HOME has no ~/.local/share at all, so this also proves the
    // script creates its root rather than assuming one.
    const { bank, calls, home, snapRoot } = sandboxHome();
    assert.ok(!existsSync(join(home, ".local", "share")), "the sandbox already had the root");
    const { code, out } = runAtDefault(bank, home);
    assert.equal(code, 0, out);
    const made = snapshots(snapRoot);
    assert.equal(made.length, 1, out);
    assert.equal(
      readdirSync(join(snapRoot, made[0])).filter((n) => n.endsWith(".jsonl")).length,
      2,
    );
    // Nothing lands in the home folder itself: `.local` is the only entry,
    // and it was there before the run.
    assert.deepEqual(readdirSync(home), [".local"]);
    // The push was handed the snapshot at its new path.
    const prefix = join(snapRoot, "levelflow-minute-bank-snapshot-").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      readFileSync(calls, "utf8"),
      new RegExp(`-- \\S+/scripts/ops/push-minute-bank-offbox\\.sh ${prefix}\\d{8}\\n$`),
    );
  });

  it("creates nothing at all when there is no bank to back up", () => {
    // A machine without a bank is not a machine that needs a snapshot root.
    // The root is created only once there is something to put in it.
    const { home, snapRoot } = sandboxHome();
    const missingBank = join(home, "..", "no-such-bank");
    const { code, out } = runAtDefault(missingBank, home);
    assert.equal(code, 0, out);
    assert.match(out, /nothing to back up/);
    assert.equal(existsSync(join(home, ".local", "share")), false, `created ${snapRoot} with no bank`);
    assert.equal(existsSync(`${missingBank}.lock`), false, "took a lock on a bank that does not exist");
  });

  it("keeps one daily by default, and the protected corpus besides it", () => {
    const seeded = ["20260823", "20260824", "20260825", "20260826"];
    const { bank, home, snapRoot } = sandboxHome();
    seed(snapRoot, seeded);
    const { code, out } = runAtDefault(bank, home);
    assert.equal(code, 0, out);
    const today = placedStamp(snapRoot, seeded);
    assert.deepEqual(snapshots(snapRoot), [
      "levelflow-minute-bank-snapshot-20260823",
      `levelflow-minute-bank-snapshot-${today}`,
    ]);
    assert.match(out, /protected: the naive-era corpus/);
    assert.match(out, /keeping 1$/m);
  });

  it("prunes nothing when the push fails", () => {
    // Place, push, prune — in that order. With one daily kept, a prune that
    // ran after a failed push would leave only a snapshot nothing off-box has.
    const seeded = ["20260824"];
    const { bank, home, snapRoot } = sandboxHome(1);
    seed(snapRoot, seeded);
    const { code, out } = runAtDefault(bank, home);
    assert.equal(code, 1, out);
    assert.match(out, /FAIL off-box push did not complete/);
    assert.doesNotMatch(out, /pruning /);
    placedStamp(snapRoot, seeded);
    assert.ok(
      snapshots(snapRoot).includes("levelflow-minute-bank-snapshot-20260824"),
      `yesterday's pushed snapshot was pruned behind a failed push: ${snapshots(snapRoot).join(", ")}`,
    );
  });

  it("never prunes the snapshot it just pushed, even when a later-named one exists", () => {
    // Oldest-first keeps the newest NAME. A directory stamped after today —
    // a skewed clock, a hand copy — would otherwise make today's the one
    // deleted.
    const seeded = ["29991231"];
    const { bank, home, snapRoot } = sandboxHome();
    seed(snapRoot, seeded);
    const { code, out } = runAtDefault(bank, home);
    assert.equal(code, 0, out);
    const today = placedStamp(snapRoot, seeded);
    assert.match(out, new RegExp(`keeping \\S+-${today} \\(placed and pushed by this run\\)`));
  });

  it("leaves a root that is parity-clean against a remote holding the protected archive", () => {
    // What the push's own parity check sees on the NEXT run: the protected
    // corpus and one daily. local ⊆ remote holds because R2 keeps 60 and
    // protects 20260823 by name in its own prune.
    const seeded = ["20260823", "20260824", "20260825"];
    const { bank, home, snapRoot } = sandboxHome();
    seed(snapRoot, seeded);
    assert.equal(runAtDefault(bank, home).code, 0);
    const today = placedStamp(snapRoot, seeded);
    const listing = (stamps: string[]) =>
      stamps
        .map((s) => `levelflow-cloud/minute-bank/${s.slice(0, 4)}/${s.slice(4, 6)}/minute-bank-${s}.tar.zst\n`)
        .join("");
    const parity = (remote: string) => {
      try {
        const out = execFileSync("bash", ["scripts/ops/check-minute-bank-parity.sh", snapRoot], {
          encoding: "utf8",
          input: remote,
        });
        return { code: 0, out };
      } catch (error) {
        const shell = error as { status?: number; stderr?: string; stdout?: string };
        return { code: shell.status ?? 1, out: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
      }
    };

    const clean = parity(listing(["20260823", "20260824", "20260825", today]));
    assert.equal(clean.code, 0, clean.out);
    assert.match(clean.out, /parity ok: 2 local snapshot\(s\), all present off-box/);

    // The dependency, stated by execution: were the remote prune ever to stop
    // protecting 20260823, the local copy of it would fail parity by name.
    const unprotected = parity(listing(["20260824", "20260825", today]));
    assert.equal(unprotected.code, 1, unprotected.out);
    assert.match(unprotected.out, /PARITY FAILED: .*20260823/);
  });
});
