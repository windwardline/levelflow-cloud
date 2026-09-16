import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { type FrozenCandidates, frozenHashOf, verifyFrozenCandidates } from "../scripts/freeze-candidates.ts";
import { artifactHashOf, type LedgeredReadArtifact, sha256File } from "../scripts/ledgeredRead.ts";

/**
 * Everything the act-3 freeze was built from is sealed with the burned read.
 *
 * `docs/research/confirm-reads/ledgered-read-act3.json` is a burned confirm read:
 * it cannot be repeated. It binds `frozenHash` of
 * `docs/research/r4/frozen-candidates.json`, which covers the whole freeze body —
 * the seven MARKET arms' `artifactSha256` values, and the `classes`, `classAxes`,
 * `classCellsTested` and `expectedFalseAcceptsClasses` computed from FIVE
 * class-grain gradings. Those twelve gradings, and the twelve stdout records that
 * are the same runs' other outputs, are the provenance of a read that can never be
 * retaken.
 *
 * Nothing checked this at run time. `verifyFrozenCandidates` hashes the freeze body
 * and never an input file, and the freeze records NO checksum for the class half or
 * for any stdout record. An owed regrade that overwrote any of them in place would
 * have severed the seal silently.
 *
 * NOTHING HERE IS READ FROM THE FILE IT GUARDS. The sealed read's and the freeze's
 * own file bytes, their content hashes, and the class and stdout checksums are
 * written down. Three tests depend on code, and each says so in its name: one on
 * the amendable rule constants through `verifyFrozenCandidates` (which also hashes
 * with `frozenHashOf`), and two on the hash functions (`artifactHashOf`,
 * `frozenHashOf`). A hashing refactor fails all three and nothing else. Every byte
 * test still shares one dependency, `sha256File`, a raw digest rather than a
 * canonicalising hash; a change to it would fail every byte test at once. The file-bytes tests are the
 * code-independent witnesses, so when one of those three fails while the bytes tests
 * pass, the CODE changed — a re-ruling or a hashing refactor — not the seal. Every
 * other test reads the freeze with a plain parse. The class and stdout
 * checksums are held to a weaker standard than the market arms and say so: they
 * were read off disk on 2026-09-16 and are justified by commit 7c55cd3 (#573) having
 * written them — the commit that also wrote the freeze and the read — with no later
 * commit touching any of them (`git log`, `git show 7c55cd3:<path>`). Re-running
 * `freezeCandidates` would prove the class half from the freeze alone, but it binds
 * the seal to current code, which pinned bytes do not.
 *
 * CONDEMNATION. This repository condemns an artifact by stamping `INVALID` into it in
 * place. A sealed input may not be condemned that way; the stamp rewrites a burned
 * read's provenance. Record the condemnation in
 * `docs/research/confirm-reads/CONDEMNATIONS.md` — Markdown, never `.jsonl`, because
 * that directory is globbed for ledgers on every confirm read.
 */

const FREEZE = "docs/research/r4/frozen-candidates.json";
const SEALED_READ = "docs/research/confirm-reads/ledgered-read-act3.json";
const LEDGER_DIR = "docs/research/confirm-reads";

/** The freeze's and the read's own file bytes: witnesses no code change can move. */
const SEALED_FREEZE_FILE_SHA256 = "cb4350693d18ba2a8f8fc3b4e15fad82b1860ddfdd8843b4a04ba06a6b05f0ca";
const SEALED_READ_FILE_SHA256 = "f56cea5f816be6bb163d84f8b76b9e653d2fcfec3e6fba2167a9713aed5b088e";
/**
 * The burned read's own printed record, written by the same `--confirm-final` run.
 * Of every stdout record here it is the one whose run is not merely owed-not-to-be-
 * repeated but impossible to repeat.
 */
const SEALED_READ_STDOUT = "docs/research/confirm-reads/ledgered-read-act3.stdout.txt";
const SEALED_READ_STDOUT_SHA256 = "d3da3825ad627513f3bcf4872b8d9c7c9e5a0ef2f27dd548bbc4b325d08ef9c3";
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
 * The class arms, by the letter `classAxes` gives them. Seven `*-grading-class.json`
 * files exist; `class-default-grading-class.json` and
 * `class-default-gate-off-grading-class.json` are deliberately NOT class arms, and
 * this literal plus the tie test below is what records that.
 */
const SEALED_CLASS_ARM_LETTERS = ["F", "S", "S8", "W", "W96"] as const;
const SEALED_CLASS_ARMS = {
  "docs/research/r4/review-window-grading-class.json": "68044acee5cf18e6d25c1770aac6af9c701c628c525d3f62ad1cdad9c180ea81",
  "docs/research/r4/review-window-96-grading-class.json": "ab302925fe5c31537152f9691ab810a47b8c8c38e8bcc8ac2eaaa94b28e0050c",
  "docs/research/r4/stop-cap-grading-class.json": "3e388b3a7262563df8b351d8ee1468fda2a26c15173cc421ebad252943eef5b6",
  "docs/research/r4/stop-cap-8-grading-class.json": "e37c9ef73a19c949bbe8687365a6329075d99ed18e89d17dcefc4982e9bb266b",
  "docs/research/r4/admission-derived-grading-class.json": "00d59bc05a3477764699d218bddd5770ac7985865fd6b9890b4f67b28a371080",
} as const;

/**
 * The stdout twin of every sealed input: the same run's other output, so sealed
 * with it. `per-market-grading-classfolds.stdout.txt` is deliberately absent — it is
 * not an input of the freeze and is the one record a regrade may overwrite.
 */
const SEALED_STDOUT_TWINS = {
  "docs/research/r4/stop-cap-grading.stdout.txt": "acb67c752d7279ce9029337ebe88f63b3fb180516ae04e602b1e8428c14c9c19",
  "docs/research/r4/stop-cap-8-grading.stdout.txt": "bdbe11054d1edd5d109911b24adbc9121d243a6b8d3f258f8798d39a606aeab7",
  "docs/research/r4/review-window-grading.stdout.txt": "64dc6044676c942725804b30e6f32fdd75671ae1e8a62e3daf5b93d0feec2ac5",
  "docs/research/r4/review-window-96-grading.stdout.txt": "5ab3feee068f6fc18ff6b361251650eb9c3485ac542435a8714d958b6c191bd4",
  "docs/research/r4/class-default-grading.stdout.txt": "c22efbe722535d3daad314113b51e67cb237c7b502b51ec589b48e496efab8de",
  "docs/research/r4/class-default-gate-off-grading.stdout.txt": "d18c8c34d0d2cbec5c5180689c9b0135e41c7bdcdc84588d9aba371128d396bc",
  "docs/research/r4/admission-derived-grading.stdout.txt": "d0c730a11813b2a4acccf2420dfc3664e2a63ce28e4cb2a64e8a46d4b1d45a26",
  "docs/research/r4/review-window-grading-class.stdout.txt": "708c09f592d9053dad88dfd143422e6d5206a348c487e2a06bac01aa0d1eda05",
  "docs/research/r4/review-window-96-grading-class.stdout.txt": "aae90c044a75b8facecb5a76c40530922ad6cf90c96eabaa967c8dcf8ae3847d",
  "docs/research/r4/stop-cap-grading-class.stdout.txt": "170d9142849a1b80f73ccde5a3fe3fae4581f68fa0d2ee3bb3ed22e17a1392f1",
  "docs/research/r4/stop-cap-8-grading-class.stdout.txt": "f90bb8f39a29666076a18345e356c699701ff4e46cbe84f3e795032a76484db3",
  "docs/research/r4/admission-derived-grading-class.stdout.txt": "51274146e681ee680ff6a7f16312072e8ede17189ff78b0538bf7648ecd8fc64",
} as const;

/**
 * Every sealed read in the directory, by file. The README makes "each read's printed
 * record is sealed" a rule about a class, so the set of reads is derived from the
 * directory and must equal this map: the next burned read lands as a named failure
 * until it is pinned, not as a silent omission.
 */
const SEALED_READS_BY_FILE = {
  "ledgered-read-act3.json": { file: SEALED_READ_FILE_SHA256, stdout: SEALED_READ_STDOUT_SHA256 },
} as const;

/** Says whether a changed sealed file was condemned in place or otherwise altered. Called only on failure. */
function whatHappened(path: string): string {
  let condemned = false;
  try {
    condemned = typeof (JSON.parse(readFileSync(path, "utf8")) as { INVALID?: unknown }).INVALID === "string";
  } catch {
    // Unparseable, or not JSON at all: "altered" covers it.
  }
  return condemned
    ? `${path} was CONDEMNED IN PLACE with an INVALID stamp. A sealed input of the burned act-3 read ` +
      `may not be stamped: revert the stamp and record the condemnation in ${LEDGER_DIR}/CONDEMNATIONS.md.`
    : `${path} was altered after it was sealed. It belongs to the burned act-3 read: restore it from ` +
      `git, and write any regrade beside it, never over it.`;
}

async function assertSealedBytes(path: string, expected: string, label = ""): Promise<void> {
  let actual: string;
  try {
    actual = await sha256File(path);
  } catch {
    assert.fail(`${label}${path} is MISSING. It belongs to the burned act-3 read: restore it from git; a regrade writes beside a sealed file, never moves it.`);
  }
  if (actual !== expected) assert.fail(`${label}${whatHappened(path)} (sha256 ${actual.slice(0, 12)}, sealed ${expected.slice(0, 12)})`);
}

// Loaded INSIDE each test, never at collection time: a throw while the suite is
// collected reported zero tests and zero failures. A plain parse, so no test but
// the one about rules depends on the rule constants in code.
const parseFreeze = () => JSON.parse(readFileSync(FREEZE, "utf8")) as FrozenCandidates;
const parseSealed = () => JSON.parse(readFileSync(SEALED_READ, "utf8")) as LedgeredReadArtifact & {
  artifactHash: string;
  frozen?: { frozenHash?: string; arms?: unknown[] };
};

describe("the act-3 freeze and everything it was built from stay sealed with the burned read", () => {
  it("pins every sealed read the directory holds, and its printed record, and nothing else", () => {
    const reads = readdirSync(LEDGER_DIR).filter((name) => /^ledgered-read-.*\.json$/.test(name)).sort();
    assert.deepEqual(
      reads,
      Object.keys(SEALED_READS_BY_FILE).sort(),
      `${LEDGER_DIR} holds a sealed read this test does not pin; pin its file bytes and printed record`,
    );
    for (const name of reads) {
      const stdout = name.replace(/\.json$/, ".stdout.txt");
      assert.ok(readdirSync(LEDGER_DIR).includes(stdout), `${LEDGER_DIR}/${name} has no printed record ${stdout}`);
    }
  });

  it("keeps the sealed read's file bytes and its printed record, as written down", async () => {
    await assertSealedBytes(SEALED_READ, SEALED_READ_FILE_SHA256);
    await assertSealedBytes(SEALED_READ_STDOUT, SEALED_READ_STDOUT_SHA256);
  });

  it("keeps the sealed read's own content hash, as written down (depends on artifactHashOf)", () => {
    const sealed = parseSealed();
    assert.equal(
      artifactHashOf(sealed),
      sealed.artifactHash,
      `${SEALED_READ} no longer hashes to its artifactHash. If the file-bytes test passes, artifactHashOf changed, not the read.`,
    );
    assert.equal(sealed.artifactHash, SEALED_READ_ARTIFACT_HASH, `${SEALED_READ} is not the read taken on 2026-09-03`);
  });

  it("keeps exactly one ledger line recording the sealed read, agreeing with it", () => {
    // Every .jsonl here, as production globs it (grid-totalr.ts, jsonlIn(dir, "")):
    // the retired unprefixed ledger form is still honoured in this directory.
    const ledgers = readdirSync(LEDGER_DIR).filter((name) => name.endsWith(".jsonl")).sort();
    const entries: Array<{ artifactPath?: string; artifactHash?: string; frozenHash?: string }> = [];
    for (const name of ledgers) {
      readFileSync(`${LEDGER_DIR}/${name}`, "utf8").split("\n").filter(Boolean).forEach((line, index) => {
        // Production refuses three shapes (grid-totalr.ts, the prior-read scan):
        // not JSON, not a plain object, and no corpusHash string. Each one blocks
        // every confirm read for every corpus, so each fails here by name.
        const where = `${LEDGER_DIR}/${name} line ${index + 1}`;
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch {
          assert.fail(`${where} is not JSON; it would refuse every confirm read`);
        }
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          assert.fail(`${where} is not a ledger object; it would refuse every confirm read`);
        }
        if (typeof (value as { corpusHash?: unknown }).corpusHash !== "string") {
          assert.fail(`${where} carries no corpusHash; it would refuse every confirm read`);
        }
        entries.push(value as { artifactPath?: string; artifactHash?: string; frozenHash?: string });
      });
    }
    const matching = entries.filter((line) => line.artifactPath === SEALED_READ);
    assert.equal(matching.length, 1, `${matching.length} ledger lines record ${SEALED_READ}; expected exactly one`);
    assert.equal(matching[0].artifactHash, SEALED_READ_ARTIFACT_HASH, "the ledger's artifactHash moved");
    assert.equal(matching[0].frozenHash, SEALED_FROZEN_HASH, "the ledger's frozenHash moved");
  });

  it("keeps the freeze file's bytes, as written down", async () => {
    await assertSealedBytes(FREEZE, SEALED_FREEZE_FILE_SHA256);
  });

  it("keeps the freeze's body hash, bound by the sealed read (depends on frozenHashOf)", () => {
    const freeze = parseFreeze();
    assert.equal(freeze.frozenHash, SEALED_FROZEN_HASH, `${FREEZE} was re-frozen; restore it from git`);
    assert.equal(
      frozenHashOf(freeze),
      SEALED_FROZEN_HASH,
      `${FREEZE}'s body no longer hashes to its frozenHash. If the file-bytes test passes, frozenHashOf changed, not the freeze.`,
    );
    assert.equal(parseSealed().frozen?.frozenHash, SEALED_FROZEN_HASH, `${SEALED_READ} no longer binds the sealed freeze`);
  });

  it("still opens through the read's door under the rules in code (depends on the rule constants and frozenHashOf)", () => {
    // If the bytes test above passes and this fails, nothing sealed moved: a rule
    // constant was amended. Re-rule deliberately; do not touch the freeze.
    assert.doesNotThrow(() => verifyFrozenCandidates(FREEZE), "verifyFrozenCandidates refused the sealed freeze");
  });

  it("names exactly the seven market arms it was frozen from", () => {
    const named = Object.fromEntries(parseFreeze().arms.map((arm) => [arm.arm, arm.artifactPath]));
    assert.deepEqual(named, SEALED_MARKET_ARMS, "the freeze's market arm set changed");
    assert.equal(parseSealed().frozen?.arms?.length, 7, "the sealed read bound seven market arms");
  });

  for (const [arm, path] of Object.entries(SEALED_MARKET_ARMS)) {
    it(`leaves market arm ${arm} byte-identical to what was frozen (${path})`, async () => {
      const recorded = parseFreeze().arms.find((entry) => entry.arm === arm);
      assert.ok(recorded, `the freeze carries no arm ${arm}`);
      await assertSealedBytes(path, recorded.artifactSha256, `arm ${arm}: `);
    });
  }

  it("ties each class arm to its market arm, so the pinned files are the class arms and not lookalikes", () => {
    const freeze = parseFreeze();
    assert.ok(freeze.classAxes, `${FREEZE} carries no classAxes; the sealed freeze had five class arms`);
    const letters = [...new Set(freeze.classAxes.flatMap((axis) => axis.arms.map((arm) => arm.arm)))].sort();
    assert.deepEqual(letters, [...SEALED_CLASS_ARM_LETTERS], "the freeze's class arm set changed");
    const derived = letters.map((letter) => {
      const market = freeze.arms.find((arm) => arm.arm === letter);
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
      await assertSealedBytes(path, sha);
    });
  }

  it("pins the stdout twin of every sealed input, and of nothing else", () => {
    const expected = [...Object.values(SEALED_MARKET_ARMS), ...Object.keys(SEALED_CLASS_ARMS)]
      .map((path) => path.replace(/\.json$/, ".stdout.txt"))
      .sort();
    assert.deepEqual(Object.keys(SEALED_STDOUT_TWINS).sort(), expected, "the twin set no longer mirrors the sealed inputs");
  });

  for (const [path, sha] of Object.entries(SEALED_STDOUT_TWINS)) {
    it(`leaves stdout twin ${path} byte-identical to what its run wrote`, async () => {
      await assertSealedBytes(path, sha);
    });
  }
});
