import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { verifyFrozenCandidates } from "../scripts/freeze-candidates.ts";
import { sha256File } from "../scripts/ledgeredRead.ts";

/**
 * The seven gradings the act-3 freeze was built from are sealed with the read.
 *
 * `docs/research/confirm-reads/ledgered-read-act3.json` is a burned confirm read:
 * it cannot be repeated. It binds `frozenHash` of
 * `docs/research/r4/frozen-candidates.json`, and that hash covers each arm's
 * `artifactSha256`. So the freeze, and the seven grading files it names, are the
 * provenance of a read that can never be re-taken.
 *
 * Nothing checked this at run time. `verifyFrozenCandidates` hashes the freeze
 * body and never re-hashes an arm file on disk, so an owed regrade that
 * overwrote an arm in place would have severed the seal silently — and the
 * recorded plan for that regrade said, until 2026-09-16, to re-record the
 * checksums, which would have changed `frozenHash` itself. Prose said not to.
 * This makes it a named failure instead.
 *
 * A regrade writes its output somewhere new. If this test fails, the fix is to
 * restore the sealed file from git, not to update a checksum.
 */

const FREEZE = "docs/research/r4/frozen-candidates.json";
const SEALED_READ = "docs/research/confirm-reads/ledgered-read-act3.json";

/**
 * Written down rather than derived from the freeze under test: a population read
 * from the same file it guards holds for any file, including one whose arms were
 * quietly removed.
 */
const SEALED_ARMS = {
  S: "docs/research/r4/stop-cap-grading.json",
  S8: "docs/research/r4/stop-cap-8-grading.json",
  W: "docs/research/r4/review-window-grading.json",
  W96: "docs/research/r4/review-window-96-grading.json",
  C1: "docs/research/r4/class-default-grading.json",
  C2: "docs/research/r4/class-default-gate-off-grading.json",
  F: "docs/research/r4/admission-derived-grading.json",
} as const;

// Loaded INSIDE each test, never at collection time. `verifyFrozenCandidates`
// throws on a tampered freeze, and a throw while the suite is being collected
// reported zero tests and zero failures — a tampered seal read as a pass that
// examined nothing. Inside a test it is a named failure.
const loadFrozen = () => verifyFrozenCandidates(FREEZE);
const loadSealed = () =>
  JSON.parse(readFileSync(SEALED_READ, "utf8")) as {
    frozen?: { frozenHash?: string; arms?: unknown[] };
  };

describe("the act-3 freeze and its seven arms stay sealed with the burned read", () => {
  it("keeps the freeze's own content hash intact", () => {
    assert.doesNotThrow(
      loadFrozen,
      `${FREEZE} no longer verifies: it was altered after it was frozen, or re-ruled. ` +
        `It is the provenance of a burned read; restore it from git.`,
    );
  });

  it("keeps the freeze's hash bound by the sealed read", () => {
    const frozen = loadFrozen();
    const sealed = loadSealed();
    assert.ok(sealed.frozen?.frozenHash, `${SEALED_READ} no longer names a frozen file`);
    assert.equal(
      sealed.frozen.frozenHash,
      frozen.frozenHash,
      `${SEALED_READ} binds frozenHash ${sealed.frozen.frozenHash}, but ${FREEZE} now hashes to ` +
        `${frozen.frozenHash}. The freeze was rewritten after the read was taken; restore it ` +
        `from git rather than re-freezing.`,
    );
  });

  it("names exactly the seven arms it was frozen from", () => {
    const frozen = loadFrozen();
    const sealed = loadSealed();
    const named = Object.fromEntries(frozen.arms.map((arm) => [arm.arm, arm.artifactPath]));
    assert.deepEqual(named, SEALED_ARMS, "the freeze's arm set changed");
    assert.equal(sealed.frozen?.arms?.length, 7, "the sealed read bound seven arms");
  });

  for (const [arm, path] of Object.entries(SEALED_ARMS)) {
    it(`leaves arm ${arm} byte-identical to what was frozen (${path})`, async () => {
      const frozen = loadFrozen();
      const recorded = frozen.arms.find((entry) => entry.arm === arm);
      assert.ok(recorded, `the freeze carries no arm ${arm}`);
      const onDisk = await sha256File(path);
      assert.equal(
        onDisk,
        recorded.artifactSha256,
        `${path} no longer matches the checksum frozen into ${FREEZE} (arm ${arm}). It is an ` +
          `input of the sealed act-3 read. Restore it from git; write any regrade beside it, ` +
          `never over it, and never re-record the checksum.`,
      );
    });
  }
});
