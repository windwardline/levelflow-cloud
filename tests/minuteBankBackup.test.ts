import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

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
  const root = mkdtempSync(join(tmpdir(), "bank-backup-"));
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
    const empty = mkdtempSync(join(tmpdir(), "empty-bank-"));
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
});

describe("the naive-era archive survives the prune", () => {
  it("keeps it even when it is oldest and the window is full", () => {
    // THE MISTAKE THIS EXISTS FOR. Pruning oldest-first deletes
    // `...-20260823` FIRST, and that one is not an ordinary daily: it is the
    // only real naive-era corpus in existence, it validated the clock-witness
    // redesign against real data rather than fixtures, and whether it is ever
    // deleted is an explicit owner decision. A retention COUNT cannot protect
    // it — the whole point of oldest-first is that the oldest goes first.
    const { bank, dest } = sandbox(["EURUSD"]);
    for (const day of ["20260823", "20260824", "20260825"]) {
      const dir = join(dest, `levelflow-minute-bank-snapshot-${day}`);
      mkdirSync(dir);
      writeFileSync(join(dir, "EURUSD.jsonl"), '{"date":"old"}\n');
    }
    const result = run(bank, dest, { LEVELFLOW_BACKUP_KEEP: "1" });
    assert.equal(result.code, 0, result.out);
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
    const { bank, dest } = sandbox(["EURUSD"]);
    for (const day of ["20260824", "20260825", "20260826"]) {
      mkdirSync(join(dest, `levelflow-minute-bank-snapshot-${day}`));
    }
    const result = run(bank, dest, { LEVELFLOW_BACKUP_KEEP: "1" });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /pruning /);
    assert.ok(
      snapshots(dest).length < 4,
      `nothing was pruned: ${snapshots(dest).join(", ")}`,
    );
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
