import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { scratchDir } from "./support/scratchDir.ts";

/**
 * ONLY scripts/ops/ HOLDS THE OFF-BOX CAPABILITY (2026-09-22).
 *
 * tests/archiveOffbox.test.ts reads every file in scripts/ops as the shell
 * would and bounds what each rclone call may do to the permanent bucket. It
 * reads nothing else, so an R2 write from scripts/foo.sh, a workflow step or a
 * package script was under no rule at all. This census is keyed on the
 * capability rather than on one tool: the credential, the endpoint any S3
 * client would dial, both buckets, and the two command-line clients that reach
 * them. Any tracked file outside scripts/ops/ that names one of them fails by
 * name, unless it sits under an exemption stated below with its reason.
 *
 * The population is git's, not the working tree's. A directory walk read the
 * owner's `.claude/settings.local.json`, which names rclone and is ignored only
 * by the global excludes file, and would have walked the gitignored corpora.
 * Untracked files that git would commit are included, so a new script is under
 * the census before its first `git add`. That makes this file git-dependent;
 * tests/scratchClone.test.ts pins the set.
 */

const REPO = process.cwd();

/** Each name the capability goes by, what it names, and how it is matched (case-insensitive). */
const CAPABILITY: ReadonlyArray<readonly [string, RegExp, string]> = [
  ["rclone", /\brclone\b/i, "the client every off-box script drives"],
  ["RCLONE_CONFIG_", /\bRCLONE_CONFIG_/i, "an rclone remote configured through the environment"],
  ["cloudflare-r2-backup", /\bcloudflare-r2-backup\b/i, "the Keychain credential that writes to R2"],
  ["r2.cloudflarestorage.com", /\br2\.cloudflarestorage\.com\b/i, "the endpoint any S3 client would dial"],
  ["windwardline-archives", /\bwindwardline-archives\b/i, "the write-once, never-expiring bucket"],
  ["windwardline-backups", /\bwindwardline-backups\b/i, "the dailies' bucket"],
  ["wrangler r2", /\bwrangler\s+r2\b/i, "Cloudflare's own R2 client"],
];

/** Where the capability may be named, and nowhere else. */
const HOME = "scripts/ops/";

/**
 * Prefixes that name the capability without holding it, each with its reason.
 * A standing exemption must still be needed: one no file uses is stale. A
 * workspace exemption covers a path that exists only in some checkouts, so its
 * absence is not staleness; its premise is that this repository tracks nothing
 * there, which is checked instead.
 */
const NAMES_WITHOUT_HOLDING = new Map<string, { reason: string; standing: boolean }>([
  ["AGENTS.md", {
    reason: "the operating contract: prose stating the laws scripts/ops obeys, which no process runs",
    standing: true,
  }],
  ["docs/", {
    reason: "runbooks and the archive register: prose and restore commands a person reads, which no process runs",
    standing: true,
  }],
  ["tests/", {
    reason: "the guards on scripts/ops: they pin its source, feed it fixtures and run it only behind " +
      "stub rclone and wl-secret on PATH, a premise tests/archiveOffbox.test.ts executes for " +
      "its own harness and this census does not",
    standing: true,
  }],
  [".fleet-standard/", {
    reason: "the fleet standard's prose, which no process runs: the fleet review lane checks " +
      "FLEET.md out here, and a plain copy of it lists as files. A lane artifact this repository " +
      "must never track; the test proves it tracks nothing there",
    standing: false,
  }],
]);

const namesCapability = (text: string): string[] =>
  CAPABILITY.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);

// A key ending in "/" covers a directory; any other key covers that one file,
// so AGENTS.md does not also cover an AGENTS.md.bak. Every use of the map goes
// through this one rule.
const covers = (key: string, path: string) => (key.endsWith("/") ? path.startsWith(key) : path === key);
const exemptionOf = (path: string) => [...NAMES_WITHOUT_HOLDING.keys()].find((key) => covers(key, path));

/** Each file that names the capability outside its home and every exemption, with what it names. */
const outsideOf = (naming: ReadonlyArray<{ names: string[]; path: string }>): string[] =>
  naming
    .filter(({ path }) => !path.startsWith(HOME) && exemptionOf(path) === undefined)
    .map(({ names, path }) => `${path} names ${names.join(", ")}`);

type Census = {
  /** Every path git listed, as it listed it. */
  listed: string[];
  /** Each entry that names the capability, with the names it uses. */
  naming: Array<{ names: string[]; path: string }>;
  /** Untracked directories holding a repository of their own: their files are that repository's, not this one's. */
  nestedRepos: string[];
  /** What this repository already tracks. */
  tracked: Set<string>;
};

const gitList = (root: string, ...args: string[]) =>
  execFileSync("git", ["ls-files", "-z", ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter((path) => path !== "")
    .sort();

/**
 * What git tracks or would commit under `root`, each entry read as git would
 * store it. A regular file is its bytes. A symlink is committed as the path it
 * names, so that text is what is read; following it could read a directory,
 * or leave the tree. git lists a directory only at a repository boundary — an
 * untracked clone as one `dir/` entry, or a submodule, checked out or not —
 * and a commit records that repository, never its files, so it is named
 * rather than read. A tracked file deleted from the working tree has nothing
 * left to read. Anything else fails closed: an entry the census cannot read
 * must never read as a clean one. git lists no socket or fifo, so that last
 * branch is defensive and no case reaches it.
 */
function censusOf(root: string): Census {
  const listed = gitList(root, "--cached", "--others", "--exclude-standard");
  const naming: Census["naming"] = [];
  const nestedRepos: string[] = [];
  for (const path of listed) {
    const full = join(root, path);
    const entry = lstatSync(full, { throwIfNoEntry: false });
    if (entry === undefined) continue;
    let text: string;
    if (entry.isFile()) text = readFileSync(full, "utf8");
    else if (entry.isSymbolicLink()) text = readlinkSync(full);
    else if (entry.isDirectory()) {
      nestedRepos.push(path);
      continue;
    } else {
      throw new Error(`${path}: git listed an entry that is no file, symlink or nested repository, so the census cannot read it`);
    }
    const names = namesCapability(text);
    if (names.length > 0) naming.push({ names, path });
  }
  return { listed, naming, nestedRepos, tracked: new Set(gitList(root, "--cached")) };
}

/** A throwaway repository under the temp root, removed at exit. */
function scratchRepo(): string {
  const root = scratchDir("offbox-census-");
  execFileSync("git", ["init", "-q", root]);
  mkdirSync(join(root, "scripts", "ops"), { recursive: true });
  writeFileSync(join(root, "scripts", "ops", "push.sh"), 'rclone copyto "$A" "R2:$BUCKET/$KEY"\n');
  writeFileSync(join(root, "scripts", "foo.sh"), 'rclone lsf "R2:windwardline-backups/"\n');
  return root;
}

describe("only scripts/ops holds the off-box capability", () => {
  it("each name of the capability is seen however it is cased or placed", () => {
    for (
      const text of [
        'rclone copyto "$A" "R2:x/y"',
        "RCLONE_CONFIG_R2_TYPE=s3",
        "export RCLONE_CONFIG_BACKUP_ENDPOINT=x",
        "wl-secret cloudflare-r2-backup=R2_TOKEN -- sh",
        "endpoint = https://acct.r2.cloudflarestorage.com",
        '"archive": "Rclone lsf R2:windwardline-archives"',
        "BUCKET=windwardline-backups",
        "npx wrangler r2 object put b/k --file f",
      ]
    ) {
      assert.notDeepEqual(namesCapability(text), [], text);
    }
    for (const text of ["cloudflare", "r2 bucket", "windwardline-labs", "wrangler deploy", "R2_TOKEN"]) {
      assert.deepEqual(namesCapability(text), [], text);
    }
  });

  it("exempts a directory key by prefix and a file key only by its own name", () => {
    assert.equal(exemptionOf("tests/archiveOffbox.test.ts"), "tests/");
    assert.equal(exemptionOf("AGENTS.md"), "AGENTS.md");
    assert.equal(exemptionOf("AGENTS.md.bak"), undefined);
    assert.equal(exemptionOf("testsuite/x.sh"), undefined);
    assert.equal(covers("AGENTS.md", "AGENTS.md.bak"), false, "a file key reaches past its own name");
    assert.equal(covers(".fleet-standard/", ".fleet-standard/FLEET.md"), true);
  });

  it("names a nested repository without reading it, and still names the violation beside it — executed", () => {
    // The fleet review lane clones the standard into its workspace, and git
    // lists that clone as one `dir/` entry. Read as a file it threw EISDIR in a
    // declared gate. A symlink to a directory is the same shape by another road.
    const root = scratchRepo();
    const clone = join(root, "vendor-standard");
    mkdirSync(clone);
    execFileSync("git", ["init", "-q", clone]);
    writeFileSync(join(clone, "FLEET.md"), "rclone into windwardline-archives\n");
    symlinkSync("scripts", join(root, "scripts-link"));
    // A submodule that was never checked out: tracked, and an empty directory.
    execFileSync("git", ["-C", root, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},vendored`]);
    mkdirSync(join(root, "vendored"));
    const census = censusOf(root);
    assert.ok(census.listed.includes("vendor-standard/"), "premise: git lists the clone as one directory entry");
    assert.ok(census.listed.includes("scripts-link"), "premise: git lists the symlink itself");
    assert.ok(census.listed.includes("vendored"), "premise: git lists the submodule");
    assert.deepEqual(census.nestedRepos, ["vendor-standard/", "vendored"]);
    // Non-vacuity: the files beside it were read, the home and the violation alike.
    assert.ok(census.naming.some(({ path }) => path === "scripts/ops/push.sh"), "the census read nothing beside the clone");
    assert.deepEqual(outsideOf(census.naming), ["scripts/foo.sh names rclone, windwardline-backups"]);
  });

  it("exempts a plain .fleet-standard/ copy of the fleet standard by name — executed", () => {
    const root = scratchRepo();
    mkdirSync(join(root, ".fleet-standard"));
    writeFileSync(join(root, ".fleet-standard", "FLEET.md"), "rclone, windwardline-archives and windwardline-backups\n");
    const census = censusOf(root);
    assert.ok(
      census.naming.some(({ path }) => path === ".fleet-standard/FLEET.md"),
      "premise: a plain copy lists as a file that names the capability",
    );
    assert.deepEqual(outsideOf(census.naming), ["scripts/foo.sh names rclone, windwardline-backups"]);
  });

  it("no file git tracks or would commit names it outside scripts/ops, but the stated exemptions", () => {
    const census = censusOf(REPO);
    // Non-vacuity: the population reaches the capability's home, the
    // workflows under a dot-directory, and the exemptions' roots.
    for (const expected of ["scripts/ops/push-archive-offbox.sh", ".github/workflows/ci.yml", "AGENTS.md", "package.json"]) {
      assert.ok(census.listed.includes(expected), `${expected} is missing from git's population`);
    }
    assert.ok(
      census.naming.some(({ path }) => path === "scripts/ops/push-archive-offbox.sh"),
      "the census no longer sees the capability where it lives",
    );
    assert.deepEqual(
      outsideOf(census.naming),
      [],
      "these reach R2, or name what does, outside scripts/ops/, where no guard reads " +
        "what they do to the permanent bucket: move the capability into scripts/ops/, " +
        "or name the path in NAMES_WITHOUT_HOLDING with its reason",
    );
    for (const [prefix, { standing }] of NAMES_WITHOUT_HOLDING) {
      if (standing) {
        assert.ok(
          census.naming.some(({ path }) => covers(prefix, path)),
          `${prefix} no longer names the capability — drop its exemption`,
        );
      } else {
        assert.deepEqual(
          [...census.tracked].filter((path) => covers(prefix, path)),
          [],
          `${prefix} is exempt because this repository never tracks it, and it now does`,
        );
      }
    }
  });
});
