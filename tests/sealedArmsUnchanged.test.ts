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
 * and never an input file, and the freeze records NO checksum for the class half —
 * `classAxes` carries only `{arm, prefix}`. An owed regrade that overwrote any of
 * the twelve in place would have severed the seal silently.
 *
 * The class half is held to a weaker standard than the market half, and says so.
 * Its checksums were read off disk on 2026-09-16 and are justified by commit
 * 7c55cd3 having written them, not by anything the freeze records. The freeze's
 * class figures ARE a deterministic function of those five files, so re-running
 * `freezeCandidates` and comparing `frozenHash` would prove all twelve at once — but
 * that binds the seal to CURRENT code (`getAssetType`, the rules), so a legitimate
 * later change to class membership would fail here as a severed seal. Pinned bytes
 * do not have that failure mode, which is why they are used instead.
 *
 * CONDEMNATION. This repository condemns an artifact by stamping `INVALID` into it in
 * place. A sealed input may not be condemned that way: the stamp rewrites the
 * provenance of a read that cannot be retaken. If one of these files must be
 * condemned, record it in a note beside the sealed read in
 * `docs/research/confirm-reads/` and leave the file's bytes alone. The failure
 * messages below say which of the two happened.
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
 * The class arms, by the letter `classAxes` gives them, and the bytes each was frozen
 * from. Seven `*-grading-class.json` files exist; `class-default-grading-class.json`
 * and `class-default-gate-off-grading-class.json` are deliberately NOT class arms,
 * and this literal together with the tie test below is what records that. Each
 * checksum is the blob commit 7c55cd3 (#573) wrote — the commit that also wrote the
 * freeze and the read — and no later commit touched any of them (verified
 * 2026-09-16 with `git log` and `git show 7c55cd3:<path>`).
 */
const SEALED_CLASS_ARM_LETTERS = ["F", "S", "S8", "W", "W96"] as const;
const SEALED_CLASS_ARMS = {
  "docs/research/r4/review-window-grading-class.json": "68044acee5cf18e6d25c1770aac6af9c701c628c525d3f62ad1cdad9c180ea81",
  "docs/research/r4/review-window-96-grading-class.json": "ab302925fe5c31537152f9691ab810a47b8c8c38e8bcc8ac2eaaa94b28e0050c",
  "docs/research/r4/stop-cap-grading-class.json": "3e388b3a7262563df8b351d8ee1468fda2a26c15173cc421ebad252943eef5b6",
  "docs/research/r4/stop-cap-8-grading-class.json": "e37c9ef73a19c949bbe8687365a6329075d99ed18e89d17dcefc4982e9bb266b",
  "docs/research/r4/admission-derived-grading-class.json": "00d59bc05a3477764699d218bddd5770ac7985865fd6b9890b4f67b28a371080",
} as const;

/** Says whether a changed sealed file was condemned in place or otherwise altered. */
function whatHappened(path: string): string {
  let condemned = false;
  try {
    condemned = typeof (JSON.parse(readFileSync(path, "utf8")) as { INVALID?: unknown }).INVALID === "string";
  } catch {
    // Unparseable is plainly "altered"; the message below covers it.
  }
  return condemned
    ? `${path} was CONDEMNED IN PLACE with an INVALID stamp. A sealed input of the burned act-3 read ` +
      `may not be stamped: revert the stamp and record the condemnation in a note beside the sealed ` +
      `read in docs/research/confirm-reads/.`
    : `${path} was altered after it was sealed. It is an input of the burned act-3 read: restore it ` +
      `from git, and write any regrade beside it, never over it.`;
}

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
    const ledgers = readdirSync(LEDGER_DIR).filter((name) => /^confirm-log-.*\.jsonl$/.test(name)).sort();
    const entries: Array<{ artifactPath?: string; artifactHash?: string; frozenHash?: string }> = [];
    for (const name of ledgers) {
      const lines = readFileSync(`${LEDGER_DIR}/${name}`, "utf8").split("\n").filter(Boolean);
      lines.forEach((line, index) => {
        try {
          entries.push(JSON.parse(line));
        } catch {
          assert.fail(`${LEDGER_DIR}/${name} line ${index + 1} is not JSON; a ledger line is evidence`);
        }
      });
    }
    const matching = entries.filter((line) => line.artifactPath === SEALED_READ);
    assert.equal(matching.length, 1, `${matching.length} confirm-log lines record ${SEALED_READ}; expected exactly one`);
    const [entry] = matching;
    assert.equal(entry.artifactHash, SEALED_READ_ARTIFACT_HASH, "the ledger's artifactHash moved");
    assert.equal(entry.frozenHash, SEALED_FROZEN_HASH, "the ledger's frozenHash moved");
  });

  it("keeps the freeze's own content hash intact", () => {
    assert.doesNotThrow(loadFrozen, `${whatHappened(FREEZE)} (or it was re-ruled)`);
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
      assert.equal(await sha256File(path), recorded.artifactSha256, `arm ${arm}: ${whatHappened(path)}`);
    });
  }

  it("ties each class arm to its market arm, so the pinned files are the class arms and not lookalikes", () => {
    const frozen = loadFrozen();
    assert.ok(frozen.classAxes, `${FREEZE} carries no classAxes; the sealed freeze had five class arms`);
    const letters = [...new Set(frozen.classAxes.flatMap((axis) => axis.arms.map((arm) => arm.arm)))].sort();
    assert.deepEqual(letters, [...SEALED_CLASS_ARM_LETTERS], "the freeze's class arm set changed");
    const derived = letters.map((letter) => {
      const market = frozen.arms.find((arm) => arm.arm === letter);
      assert.ok(market, `class arm ${letter} has no market arm in the freeze`);
      return { letter, market, path: market.artifactPath.replace(/-grading\.json$/, "-grading-class.json") };
    });
    assert.deepEqual(derived.map((entry) => entry.path).sort(), Object.keys(SEALED_CLASS_ARMS).sort());
    for (const { letter, market, path } of derived) {
      const grading = JSON.parse(readFileSync(path, "utf8")) as { verdictUnit?: string; shardHashes?: string[] };
      assert.equal(grading.verdictUnit, "class", `${path} (class arm ${letter}) is not a class-grain grading`);
      assert.deepEqual(grading.shardHashes, market.shardHashes, `${path} was not graded from arm ${letter}'s corpus`);
    }
  });

  for (const [path, sha] of Object.entries(SEALED_CLASS_ARMS)) {
    it(`leaves class arm ${path} byte-identical to the blob the freeze was built from`, async () => {
      assert.equal(await sha256File(path), sha, whatHappened(path));
    });
  }
});
