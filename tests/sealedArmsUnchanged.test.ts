import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { verifyFrozenCandidates } from "../scripts/freeze-candidates.ts";
import { artifactHashOf, type LedgeredReadArtifact, sha256File } from "../scripts/ledgeredRead.ts";

/**
 * Everything the act-3 freeze was built from is sealed with the burned read.
 *
 * `docs/research/confirm-reads/ledgered-read-act3.json` is a burned confirm read:
 * it cannot be repeated. It binds `frozenHash` of
 * `docs/research/r4/frozen-candidates.json`, and that hash covers the whole
 * freeze body — the seven MARKET arms' `artifactSha256` values, and the `classes`,
 * `classAxes`, `classCellsTested` and `expectedFalseAcceptsClasses` computed from
 * FIVE class-grain gradings. Twelve grading files are therefore the provenance of a
 * read that can never be re-taken.
 *
 * Nothing checked this at run time. `verifyFrozenCandidates` hashes the freeze body
 * and never an input file, and the freeze records NO checksum for the class half at
 * all — `classAxes` carries only `{arm, prefix}` — so that half could not be
 * verified from the freeze even in principle. An owed regrade that overwrote any of
 * the twelve in place would have severed the seal silently.
 *
 * Nothing here is read from the file it guards. The sealed hashes are written down,
 * and the sealed read's own content hash is recomputed, so rewriting the freeze, the
 * read and the ledger TOGETHER still fails. A regrade writes its output somewhere
 * new. If this fails, restore the files from git; never update a constant here.
 */

const FREEZE = "docs/research/r4/frozen-candidates.json";
const SEALED_READ = "docs/research/confirm-reads/ledgered-read-act3.json";
const LEDGER_DIR = "docs/research/confirm-reads";

/** Taken from the read on 2026-09-03 and from the confirm-log line recording it. */
const SEALED_FROZEN_HASH = "6b1e52e0e62be47df9237d8e57ba42797d415630c2907d4212d6b053454a5cf6";
const SEALED_READ_ARTIFACT_HASH = "3a17f23378f60d01e95c5233739069c3f364da0923feae869a7a4fc21be22283";

/** The market arms, as the freeze names them. Their checksums live in the freeze. */
const SEALED_MARKET_ARMS = {
  S: "docs/research/r4/stop-cap-grading.json",
  S8: "docs/research/r4/stop-cap-8-grading.json",
  W: "docs/research/r4/review-window-grading.json",
  W96: "docs/research/r4/review-window-96-grading.json",
  C1: "docs/research/r4/class-default-grading.json",
  C2: "docs/research/r4/class-default-gate-off-grading.json",
  F: "docs/research/r4/admission-derived-grading.json",
} as const;

/**
 * The class arms. The freeze records no checksum for these by construction, so the
 * sealed bytes are pinned here: each is the blob written by commit 7c55cd3 (#573),
 * the commit that also wrote the freeze and the read, and no later commit touched
 * any of them (verified 2026-09-16 with `git log` and `git show 7c55cd3:<path>`).
 */
const SEALED_CLASS_ARMS = {
  "docs/research/r4/review-window-grading-class.json": "68044acee5cf18e6d25c1770aac6af9c701c628c525d3f62ad1cdad9c180ea81",
  "docs/research/r4/review-window-96-grading-class.json": "ab302925fe5c31537152f9691ab810a47b8c8c38e8bcc8ac2eaaa94b28e0050c",
  "docs/research/r4/stop-cap-grading-class.json": "3e388b3a7262563df8b351d8ee1468fda2a26c15173cc421ebad252943eef5b6",
  "docs/research/r4/stop-cap-8-grading-class.json": "e37c9ef73a19c949bbe8687365a6329075d99ed18e89d17dcefc4982e9bb266b",
  "docs/research/r4/admission-derived-grading-class.json": "00d59bc05a3477764699d218bddd5770ac7985865fd6b9890b4f67b28a371080",
} as const;

// Loaded INSIDE each test, never at collection time. `verifyFrozenCandidates`
// throws on a tampered freeze, and a throw while the suite is being collected
// reported zero tests and zero failures — a tampered seal read as a pass that
// examined nothing. Inside a test it is a named failure.
const loadFrozen = () => verifyFrozenCandidates(FREEZE);
const loadSealed = () => JSON.parse(readFileSync(SEALED_READ, "utf8")) as LedgeredReadArtifact & {
  artifactHash: string;
  frozen?: { frozenHash?: string; arms?: unknown[] };
};

describe("the act-3 freeze and every grading it was built from stay sealed with the burned read", () => {
  it("keeps the sealed read's own content hash, as written down", () => {
    const sealed = loadSealed();
    assert.equal(
      artifactHashOf(sealed),
      sealed.artifactHash,
      `${SEALED_READ} no longer hashes to the artifactHash it carries: it was edited after the read`,
    );
    assert.equal(sealed.artifactHash, SEALED_READ_ARTIFACT_HASH, `${SEALED_READ} is not the read taken on 2026-09-03`);
  });

  it("keeps the confirm-log ledger agreeing with the sealed read", () => {
    const ledgers = readdirSync(LEDGER_DIR).filter((name) => /^confirm-log-.*\.jsonl$/.test(name));
    const entries = ledgers.flatMap((name) =>
      readFileSync(`${LEDGER_DIR}/${name}`, "utf8").split("\n").filter(Boolean).map((line) =>
        JSON.parse(line) as { artifactPath?: string; artifactHash?: string; frozenHash?: string }
      )
    );
    const entry = entries.find((line) => line.artifactPath === SEALED_READ);
    assert.ok(entry, `no confirm-log line records ${SEALED_READ}`);
    assert.equal(entry.artifactHash, SEALED_READ_ARTIFACT_HASH, "the ledger's artifactHash moved");
    assert.equal(entry.frozenHash, SEALED_FROZEN_HASH, "the ledger's frozenHash moved");
  });

  it("keeps the freeze's own content hash intact", () => {
    assert.doesNotThrow(
      loadFrozen,
      `${FREEZE} no longer verifies: it was altered after it was frozen, or re-ruled. ` +
        `It is the provenance of a burned read; restore it from git.`,
    );
  });

  it("keeps the freeze bound by the sealed read, at the hash written down", () => {
    const frozen = loadFrozen();
    const sealed = loadSealed();
    assert.equal(frozen.frozenHash, SEALED_FROZEN_HASH, `${FREEZE} was re-frozen; restore it from git`);
    assert.equal(sealed.frozen?.frozenHash, SEALED_FROZEN_HASH, `${SEALED_READ} no longer binds the sealed freeze`);
  });

  it("names exactly the seven market arms it was frozen from", () => {
    const frozen = loadFrozen();
    const sealed = loadSealed();
    const named = Object.fromEntries(frozen.arms.map((arm) => [arm.arm, arm.artifactPath]));
    assert.deepEqual(named, SEALED_MARKET_ARMS, "the freeze's market arm set changed");
    assert.equal(sealed.frozen?.arms?.length, 7, "the sealed read bound seven market arms");
  });

  for (const [arm, path] of Object.entries(SEALED_MARKET_ARMS)) {
    it(`leaves market arm ${arm} byte-identical to what was frozen (${path})`, async () => {
      const frozen = loadFrozen();
      const recorded = frozen.arms.find((entry) => entry.arm === arm);
      assert.ok(recorded, `the freeze carries no arm ${arm}`);
      assert.equal(
        await sha256File(path),
        recorded.artifactSha256,
        `${path} no longer matches the checksum frozen into ${FREEZE} (arm ${arm}). It is an input ` +
          `of the sealed act-3 read. Restore it from git; write any regrade beside it, never over it.`,
      );
    });
  }

  for (const [path, sha] of Object.entries(SEALED_CLASS_ARMS)) {
    it(`leaves class arm ${path} byte-identical to the blob the freeze was built from`, async () => {
      assert.equal(
        await sha256File(path),
        sha,
        `${path} changed. The freeze's class half was computed from it and records no checksum, so ` +
          `this constant is the only witness. Restore it from git at 7c55cd3; write any regrade beside it.`,
      );
    });
  }
});
