import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { accessSync, constants, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * The scratch-copy contract.
 *
 * WHY THIS EXISTS. On 2026-08-25 a fan-out left 23 whole copies of this repo
 * under /private/tmp — 148.8 GiB of a `.calibration-cache` that no test reads,
 * plus 20 copies of a live `.env.local`. The cause was not the copies; it was
 * copying a DIRECTORY instead of choosing what to copy. `scripts/scratch-clone.sh`
 * is the fleet's answer and AGENTS.md makes it the only supported path.
 *
 * WHAT THIS FILE PINS is the half a helper cannot pin about itself: which tests
 * need `.git`. That set is invisible until someone runs the suite from a copy
 * made without it, and then it presents as 19 failures reading
 * `Command failed: git status --porcelain` — which looks like a broken test, not
 * a missing directory. Pinning it means a FIFTH git-dependent test fails here,
 * where the message says what to do, rather than in a scratch copy an hour later.
 */

const REPO = new URL("..", import.meta.url).pathname;

/**
 * Test files that shell out to git, and therefore need `--with-git`.
 *
 * DERIVED below and compared against this list, rather than trusted as a count.
 * Verified 2026-08-25: a copy made without `--with-git` failed exactly the
 * first three of these, 19 assertions; the same copy made with it passed 2734/0
 * while holding no `.calibration-cache`. This file joined the set by existing.
 */
const GIT_DEPENDENT_TESTS = [
  "emptyCorpusRefusals.test.ts",
  "feedSource.test.ts",
  // This file. It asks git what is ignored and what is tracked, so it is itself
  // git-dependent — which the derivation below caught on its first run, against
  // a list its own author had just written from an empirical failure set of
  // three. The detector was right and the hand-written list was wrong, which is
  // the entire argument for deriving rather than transcribing.
  "scratchClone.test.ts",
  "securityHardening.test.ts",
];

/**
 * Matches a shell-out whose command word is git, in any of node's three forms.
 *
 * KNOWN BLIND SPOT, stated rather than left to be discovered: it matches the
 * IMPORTED NAME, so `import { execFileSync as g }` then `g("git", ...)` evades
 * it. Mutation-tested both ways — the realistic form (`execSync("git rev-parse
 * HEAD")` added to another test file) is caught with the right message; the
 * aliased form is not. Nobody aliases child_process to hide a git call, so the
 * gap is accepted rather than closed with a parser.
 */
const GIT_SHELLOUT =
  /(?:execSync|execFileSync|spawnSync)\(\s*[`"']git(?:[`"']|\s)/;

function testFilesShellingOutToGit(): string[] {
  const dir = join(REPO, "tests");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".test.ts"))
    .filter((name) => GIT_SHELLOUT.test(readFileSync(join(dir, name), "utf8")))
    .sort();
}

describe("the scratch-copy contract", () => {
  it("ships the fleet helper, executable", () => {
    const path = join(REPO, "scripts/scratch-clone.sh");
    accessSync(path, constants.X_OK);
    assert.ok(statSync(path).size > 0, "scratch-clone.sh is empty");
  });

  it("names every test that needs --with-git, derived not counted", () => {
    const found = testFilesShellingOutToGit();
    // NON-VACUITY. A regex that matched nothing would make this pass having
    // compared nothing, which is the exact failure this repo has spent a day
    // removing. Zero matches means the pattern broke, not that the dependency
    // went away.
    assert.ok(
      found.length > 0,
      "no test appears to shell out to git — the detector broke, it did not come up clean",
    );
    assert.deepEqual(
      found,
      GIT_DEPENDENT_TESTS,
      "the set of git-dependent tests changed. A copy made by " +
        "scripts/scratch-clone.sh WITHOUT --with-git will now fail differently than " +
        "AGENTS.md says. Update both this list and the AGENTS.md law together.",
    );
  });

  it("excludes what git ignores, asked of git rather than guessed", () => {
    // The helper's own filter is `git ls-files --exclude-standard`. This asserts
    // the premise that makes it correct: the heavyweight paths ARE ignored, so
    // git's answer and the right answer coincide. If .calibration-cache were
    // ever committed, the helper would faithfully copy 7.7 GB and be right to.
    const ignored = execFileSync(
      "git",
      ["-C", REPO, "status", "--ignored=matching", "--porcelain"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    )
      .split("\n")
      .filter((line) => line.startsWith("!! "))
      .map((line) => line.slice(3));

    assert.ok(ignored.length > 0, "git reports nothing ignored — the premise is vacuous");
    for (const heavy of [".calibration-cache/", ".minute-bank/", "node_modules/"]) {
      assert.ok(
        ignored.some((path) => path === heavy || path.startsWith(heavy)),
        `${heavy} is not ignored by git, so scratch-clone.sh would copy it`,
      );
    }
  });

  it("keeps .env.local out and .env.example in", () => {
    // Named apart because they differ by one character and the wrong call is
    // silent in both directions: excluding .env.example breaks a fresh copy,
    // and including .env.local is the 20-location exposure again.
    const tracked = execFileSync("git", ["-C", REPO, "ls-files"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).split("\n");
    assert.ok(tracked.includes(".env.example"), ".env.example must be tracked, so a copy keeps it");
    assert.ok(!tracked.includes(".env.local"), ".env.local must never be tracked");
  });
});
