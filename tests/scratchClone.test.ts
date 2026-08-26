import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
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
 * need `.git`, and therefore what `--no-git` costs. That set is invisible until someone runs the suite from a copy
 * made without it, and then it presents as 19 failures reading
 * `Command failed: git status --porcelain` — which looks like a broken test, not
 * a missing directory. Pinning it means a FIFTH git-dependent test fails here,
 * where the message says what to do, rather than in a scratch copy an hour later.
 */

const REPO = new URL("..", import.meta.url).pathname;

/**
 * Test files that shell out to git, and therefore break under `--no-git`.
 *
 * DERIVED below and compared against this list, rather than trusted as a count.
 * Verified 2026-08-25: a copy made WITHOUT .git failed exactly the first three
 * of these, 19 assertions; the same copy made with it passed 2734/0 while
 * holding no `.calibration-cache`. This file joined the set by existing.
 *
 * Those 19 failures are why the fleet INVERTED the default (windwardline#84):
 * .git now ships unless `--no-git` is passed, because a default whose failure
 * mode reads as missing DATA is worse than a copy 159 MB larger.
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

  it("names every test that --no-git would break, derived not counted", () => {
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
        "scripts/scratch-clone.sh with --no-git will now fail differently than " +
        "AGENTS.md says. Update both this list and the AGENTS.md law together.",
    );
  });

  it("excludes what git ignores, asked as a RULE not as a listing", () => {
    // `git status --ignored` only reports ignored paths that EXIST, so on a
    // fresh checkout — CI, or any clone that has never run a sweep — it says
    // nothing about .calibration-cache and a check built on it passes having
    // examined nothing. That is exactly how this test first failed in CI while
    // passing locally, where the directory happens to be present.
    //
    // `git check-ignore` asks whether the path WOULD be ignored, which is the
    // property the helper actually depends on and is true of an empty clone.
    const wouldIgnore = (rel: string) => {
      const result = spawnSync("git", ["-C", REPO, "check-ignore", "-q", rel]);
      return result.status === 0;
    };

    // Probed WITH A TRAILING SLASH. The rules are `.calibration-cache/` and
    // `.minute-bank/` — directory-only — and git cannot match a directory
    // pattern against a bare path that does not exist on disk. That is the
    // second version of this bug: the first used `git status --ignored`, which
    // only lists ignored paths that EXIST, and passed locally while failing in
    // CI. A trailing slash states the directory-ness the filesystem would
    // otherwise have to supply.
    //
    // node_modules is deliberately NOT asserted. A scratch copy normally
    // symlinks it to the source, and check-ignore refuses to traverse a symlink
    // ("beyond a symbolic link"), so the probe would report a difference that is
    // an artifact of the copy's shape rather than of the ignore rules. It is
    // also not what the 148 GiB incident was about.
    for (const heavy of [".calibration-cache/", ".minute-bank/", ".env.local"]) {
      assert.ok(wouldIgnore(heavy), `${heavy} is not ignored by git, so scratch-clone.sh would copy it`);
    }
    assert.equal(wouldIgnore("src/"), false, "check-ignore reports src as ignored — the probe is broken");
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
