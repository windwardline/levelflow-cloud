import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

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
 * Each must still be needed: an exemption no file uses is stale.
 */
const NAMES_WITHOUT_HOLDING = new Map<string, string>([
  ["AGENTS.md", "the operating contract: prose stating the laws scripts/ops obeys, which no process runs"],
  ["docs/", "runbooks and the archive register: prose and restore commands a person reads, which no process runs"],
  [
    "tests/",
    "the guards on scripts/ops: they pin its source, feed it fixtures and run it only behind " +
      "stub rclone and wl-secret on PATH, a premise tests/archiveOffbox.test.ts executes for " +
      "its own harness and this census does not",
  ],
]);

const namesCapability = (text: string): string[] =>
  CAPABILITY.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);

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

  it("no file git tracks or would commit names it outside scripts/ops, but the stated exemptions", () => {
    const population = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter((path) => path !== "" && existsSync(join(REPO, path)))
      .sort();
    // Non-vacuity: the population reaches the capability's home, the
    // workflows under a dot-directory, and the exemptions' roots.
    for (const expected of ["scripts/ops/push-archive-offbox.sh", ".github/workflows/ci.yml", "AGENTS.md", "package.json"]) {
      assert.ok(population.includes(expected), `${expected} is missing from git's population`);
    }
    const naming = population
      .map((path) => ({ names: namesCapability(readFileSync(join(REPO, path), "utf8")), path }))
      .filter(({ names }) => names.length > 0);
    assert.ok(
      naming.some(({ path }) => path === "scripts/ops/push-archive-offbox.sh"),
      "the census no longer sees the capability where it lives",
    );
    const exemptionOf = (path: string) => [...NAMES_WITHOUT_HOLDING.keys()].find((prefix) => path.startsWith(prefix));
    const outside = naming
      .filter(({ path }) => !path.startsWith(HOME) && exemptionOf(path) === undefined)
      .map(({ names, path }) => `${path} names ${names.join(", ")}`);
    assert.deepEqual(
      outside,
      [],
      "these reach R2, or name what does, outside scripts/ops/, where no guard reads " +
        "what they do to the permanent bucket: move the capability into scripts/ops/, " +
        "or name the path in NAMES_WITHOUT_HOLDING with its reason",
    );
    for (const prefix of NAMES_WITHOUT_HOLDING.keys()) {
      assert.ok(
        naming.some(({ path }) => path.startsWith(prefix)),
        `${prefix} no longer names the capability — drop its exemption`,
      );
    }
  });
});
