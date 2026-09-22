import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
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
 * retaken. So is the read itself: its artifact, its printed record, the ledger line
 * whose fields make a repeat read refuse, and the freeze its artifact binds — every
 * sealed read in `docs/research/confirm-reads/`, found by the name
 * `ledgered-read-*.json`, is pinned with all four.
 *
 * Nothing checked this at run time. `verifyFrozenCandidates` hashes the freeze body
 * and never an input file, and the freeze records NO checksum for the class half or
 * for any stdout record. An owed regrade that overwrote any of them in place would
 * have severed the seal silently.
 *
 * NOTHING HERE IS READ FROM THE FILE IT GUARDS. The sealed read's and the freeze's
 * own file bytes, their content hashes, and the class and stdout checksums are
 * written down. Three kinds of test depend on code, and each says so in its name:
 * the rule-constants test through `verifyFrozenCandidates` (which also hashes with
 * `frozenHashOf`), the freeze's `frozenHashOf` test, and one `artifactHashOf` test per
 * sealed read. A hashing refactor fails those and nothing else. Every byte
 * test still shares one dependency, `sha256File`, a raw digest rather than a
 * canonicalising hash; a change to it would fail every byte test at once. The file-bytes tests are the
 * code-independent witnesses, so when one of those fails while the bytes tests
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
 * place. No sealed file may be condemned that way — input, twin, freeze or the read's
 * own record — because the stamp rewrites a burned read's provenance; on the freeze it
 * also breaks `frozenHash`. The stamp is JSON-only, so on a `.stdout.txt` it reads here
 * as tampering. Record the condemnation in
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
 * Every sealed read in the directory, by file, with the ledger that records it and
 * the artifactHash that ledger must carry. The README makes "each read's printed
 * record is sealed" a rule about a class, so the set of reads is derived from the
 * directory by the name `ledgered-read-*.json` and must equal this map: the next burned read lands as a named failure
 * until it is pinned — its bytes, its printed record, AND its ledger — not as a
 * silent omission.
 */
const SEALED_READS_BY_FILE: Record<
  string,
  // frozenHash is REQUIRED in the type, as a string or null: a read taken under a
  // freeze must pin the hash it bound, and a read taken outside one must say null.
  // Leaving it off is a type error, never a silent skip.
  { file: string; stdout: string; ledger: string; artifactHash: string; frozenHash: string | null }
> = {
  "ledgered-read-act3.json": {
    file: SEALED_READ_FILE_SHA256,
    stdout: SEALED_READ_STDOUT_SHA256,
    ledger: "confirm-log-f3b72ce8261a1d0a469f6f152950a9716703ea36a34612fe0187849459f4b062.jsonl",
    artifactHash: SEALED_READ_ARTIFACT_HASH,
    frozenHash: SEALED_FROZEN_HASH,
  },
};

/**
 * The sha256 of a value in sorted-key canonical JSON — the form production hashes
 * the confirm spans in to make `calendarHash` (grid-totalr.ts, `sha256Hex(
 * stableJson(confirmSpans))`). Written out here rather than importing `stableJson`,
 * so the binding depends on no repository code; verified 2026-09-16 to reproduce the
 * act-3 read's `calendarHash` exactly. It only ever needs to reproduce the HISTORICAL
 * form, because it is compared against a byte-pinned `calendarHash`: if `stableJson`
 * changes later, this copy diverging from it is harmless, since the sealed hash it
 * must match was written under the old form and can never move.
 */
function canonicalSha256(value: unknown): string {
  const canonical = (v: unknown): string =>
    v === null || typeof v !== "object"
      ? JSON.stringify(v)
      : Array.isArray(v)
      ? `[${v.map(canonical).join(",")}]`
      : `{${Object.keys(v as Record<string, unknown>).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort()
        .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/**
 * What a sealed file is sealed AS, so a failure gives advice that fits it: a sealed
 * INPUT is regraded beside itself, the FREEZE is never re-run, and a sealed read's
 * own record cannot be retaken.
 */
type SealedAs = { kind: "input" | "freeze" | "read"; read: string };
const ACT3_INPUT: SealedAs = { kind: "input", read: "the burned act-3 read" };
const ACT3_FREEZE: SealedAs = { kind: "freeze", read: "the burned act-3 read" };

function describeSeal(sealedAs: SealedAs): { what: string; restore: string } {
  switch (sealedAs.kind) {
    case "input":
      return { what: `a sealed input of ${sealedAs.read}`, restore: "restore it from git, and write any regrade beside it, never over it" };
    case "freeze":
      return { what: `the freeze ${sealedAs.read} binds`, restore: "restore it from git, and never re-run the freeze" };
    case "read":
      return { what: `sealed read ${sealedAs.read}'s own record`, restore: "restore it from git; a burned read cannot be retaken" };
  }
}

/** Says whether a changed sealed file was condemned in place or otherwise altered. Called only on failure. */
function whatHappened(path: string, sealedAs: SealedAs): string {
  let condemned = false;
  try {
    condemned = typeof (JSON.parse(readFileSync(path, "utf8")) as { INVALID?: unknown }).INVALID === "string";
  } catch {
    // Unparseable, or not JSON at all: "altered" covers it.
  }
  const { what, restore } = describeSeal(sealedAs);
  return condemned
    ? `${path} was CONDEMNED IN PLACE with an INVALID stamp. It is ${what} and ` +
      `may not be stamped: revert the stamp and record the condemnation in ${LEDGER_DIR}/CONDEMNATIONS.md.`
    : `${path} was altered after it was sealed. It is ${what}: ${restore}.`;
}

async function assertSealedBytes(path: string, expected: string, sealedAs: SealedAs, label = ""): Promise<void> {
  let actual: string;
  try {
    actual = await sha256File(path);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
    const { what, restore } = describeSeal(sealedAs);
    assert.fail(`${label}${path} is MISSING. It is ${what}: ${restore}. Nothing sealed is ever moved.`);
  }
  if (actual !== expected) assert.fail(`${label}${whatHappened(path, sealedAs)} (sha256 ${actual.slice(0, 12)}, sealed ${expected.slice(0, 12)})`);
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
    const listing = readdirSync(LEDGER_DIR);
    const reads = listing.filter((name) => /^ledgered-read-.*\.json$/.test(name)).sort();
    const pinned = Object.keys(SEALED_READS_BY_FILE).sort();
    const unpinned = reads.filter((name) => !pinned.includes(name));
    const vanished = pinned.filter((name) => !reads.includes(name));
    assert.deepEqual(unpinned, [], `${LEDGER_DIR} holds sealed reads this test does not pin: ${unpinned.join(", ")}`);
    assert.deepEqual(vanished, [], `pinned sealed reads are missing from ${LEDGER_DIR}: ${vanished.join(", ")}`);
    for (const name of reads) {
      const stdout = name.replace(/\.json$/, ".stdout.txt");
      assert.ok(listing.includes(stdout), `${LEDGER_DIR}/${name} has no printed record ${stdout}`);
    }
    const orphans = listing
      .filter((name) => /^ledgered-read-.*\.stdout\.txt$/.test(name))
      .filter((name) => !listing.includes(name.replace(/\.stdout\.txt$/, ".json")));
    assert.deepEqual(orphans, [], `printed records with no sealed read beside them: ${orphans.join(", ")}`);
  });

  for (const [name, sealed] of Object.entries(SEALED_READS_BY_FILE)) {
    it(`keeps sealed read ${name} and its printed record byte-identical, as written down`, async () => {
      await assertSealedBytes(`${LEDGER_DIR}/${name}`, sealed.file, { kind: "read", read: name });
      await assertSealedBytes(`${LEDGER_DIR}/${name.replace(/\.json$/, ".stdout.txt")}`, sealed.stdout, { kind: "read", read: name });
    });
  }

  for (const [name, read] of Object.entries(SEALED_READS_BY_FILE)) {
    it(`keeps sealed read ${name}'s own content hash, as pinned (depends on artifactHashOf)`, () => {
      const path = `${LEDGER_DIR}/${name}`;
      const sealed = JSON.parse(readFileSync(path, "utf8")) as LedgeredReadArtifact & { artifactHash: string };
      assert.equal(
        artifactHashOf(sealed),
        sealed.artifactHash,
        `${path} no longer hashes to its artifactHash. If the file-bytes test passes, artifactHashOf changed, not the read.`,
      );
      // Ties the artifact to the map, and so to the ledger line checked below: a
      // constant transcribed from the wrong place fails here.
      assert.equal(sealed.artifactHash, read.artifactHash, `${path}'s artifactHash is not the one pinned for it`);
      // And the freeze it bound, the same way: a read under a freeze names the
      // pinned hash; a read outside one binds no freeze.
      const bound = (sealed as { frozen?: { frozenHash?: string } | null }).frozen?.frozenHash ?? null;
      assert.equal(bound, read.frozenHash, `${path} binds freeze ${bound}, not the one pinned for it`);
    });
  }

  it("keeps each sealed read recorded as exactly one read in its ledger, with every burn field agreeing", () => {
    // Every .jsonl here, as production globs it (grid-totalr.ts, jsonlIn(dir, "")):
    // the retired unprefixed ledger form is still honoured in this directory.
    //
    // Every one is held to production's three refusal shapes, whatever its name:
    // production refuses a malformed line in ANY ledger here, and one such line
    // blocks every confirm read for every corpus. Until 2026-09-21 an unpinned
    // ledger-named file was tolerated, and skipped if it vanished, because
    // tests/acceptanceGate.test.ts wrote fixture ledgers into this directory while
    // node:test ran files in parallel. It now drives them through an injected
    // scratch directory and checks this one is untouched across its run, so a
    // file here is never a concurrent fixture and nothing is exempt.
    const ledgers = readdirSync(LEDGER_DIR).filter((name) => name.endsWith(".jsonl")).sort();
    // Each sealed artifact parsed once; its bytes are pinned by the test above.
    const artifacts = Object.fromEntries(
      Object.keys(SEALED_READS_BY_FILE).map((name) => [
        name,
        JSON.parse(readFileSync(`${LEDGER_DIR}/${name}`, "utf8")) as {
          readId?: string; corpusId?: string; shardHashes?: string[]; calendarHash?: string; symbolsRead?: string[]; ledgerPath?: string;
        },
      ]),
    );
    for (const [name, read] of Object.entries(SEALED_READS_BY_FILE)) {
      assert.ok(ledgers.includes(read.ledger), `${LEDGER_DIR}/${read.ledger}, the ledger recording ${name}, is missing`);
      // By basename, and deliberately: a sealed artifact's ledgerPath is an absolute
      // path on the machine that took the read, into a worktree that no longer
      // exists, and those bytes can never be corrected.
      const recorded = artifacts[name].ledgerPath;
      assert.equal(recorded?.split("/").pop(), read.ledger, `${name} names a different ledger (${recorded})`);
    }
    type LedgerLine = {
      artifactPath?: string; artifactHash?: string; frozenHash?: string | null; corpusHash?: string; readId?: string;
      shardHashes?: string[]; calendarHash?: string; symbolsRead?: string[];
      confirmSpans?: Record<string, { startMs?: number; endMs?: number }>;
    };
    const entries: LedgerLine[] = [];
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
        entries.push(value as LedgerLine);
      });
    }
    for (const [name, read] of Object.entries(SEALED_READS_BY_FILE)) {
      const path = `${LEDGER_DIR}/${name}`;
      const artifact = artifacts[name];
      // By basename within this directory, as ledgerPath is: a read burned without
      // --read-out records an ABSOLUTE artifactPath, and an exact compare would match
      // nothing and silently run every burn-field check below zero times.
      const matching = entries.filter((line) => {
        const recordedPath = line.artifactPath ?? "";
        return recordedPath.split("/").pop() === name && dirname(recordedPath).endsWith(LEDGER_DIR);
      });
      assert.ok(
        matching.length > 0,
        `no ledger line records ${path} by basename within ${LEDGER_DIR}; a sealed read must be written into this directory (see its README), and a bare or relative --read-out records a path this check cannot place`,
      );
      assert.equal(artifact.corpusId, read.ledger.replace(/^confirm-log-/, "").replace(/\.jsonl$/, ""), `${name}'s corpusId no longer matches the ledger it names`);
      // Production counts a read once per readId: the retired per-directory forms may
      // legitimately carry the same record twice (grid-totalr.ts, seenReadIds).
      const readIds = [...new Set(matching.map((line) => line.readId))];
      assert.deepEqual(readIds, [artifact.readId], `ledger lines recording ${path} name reads ${JSON.stringify(readIds)}; expected exactly ${artifact.readId}`);
      for (const line of matching) {
        assert.equal(line.artifactHash, read.artifactHash, `the ledger's artifactHash for ${name} moved`);
        // THE FIELDS THAT MAKE THE READ BURNED. Production refuses a repeat read on
        // any of four matches — corpusHash identity, shard overlap, the retired key,
        // or calendar overlap. Each is bound here to state already pinned by bytes:
        // the ledger's own name carries the corpus id, and the sealed artifact
        // carries the shard hashes, calendar hash and symbols. Editing any of them
        // in the ledger would reopen a fold that must never be read again.
        const corpusId = read.ledger.replace(/^confirm-log-/, "").replace(/\.jsonl$/, "");
        assert.equal(line.corpusHash, corpusId, `the ledger's corpusHash for ${name} no longer names its corpus`);
        assert.deepEqual(line.shardHashes, artifact.shardHashes, `the ledger's shardHashes for ${name} no longer match the sealed read`);
        // No coalescing: production always writes the key (null outside a freeze),
        // so an ABSENT frozenHash is a tampered line, and must not read as null.
        assert.ok(Object.hasOwn(line, "frozenHash"), `the ledger line for ${name} has no frozenHash key; production always writes one`);
        assert.equal(line.frozenHash, read.frozenHash, `the ledger's frozenHash for ${name} moved`);
        assert.equal(line.calendarHash, artifact.calendarHash, `the ledger's calendarHash for ${name} no longer matches the sealed read`);
        assert.deepEqual(line.symbolsRead, artifact.symbolsRead, `the ledger's symbolsRead for ${name} no longer match the sealed read`);
        // `calendarHash` IS the digest of the confirm spans, so the spans are bound
        // by value to the byte-pinned artifact, and this also proves the ledger's
        // calendarHash is the hash of the spans it sits beside. Production's
        // calendar refusal reads the spans (overlapsCalendar) and the hash; both are
        // now witnessed by pinned bytes.
        assert.ok(
          line.confirmSpans && typeof line.confirmSpans === "object",
          `the ledger line for ${name} carries no confirmSpans; the calendar refusal would go dark`,
        );
        assert.equal(
          canonicalSha256(line.confirmSpans),
          artifact.calendarHash,
          `the ledger's confirm spans for ${name} no longer hash to the sealed read's calendarHash; the calendar refusal would change`,
        );
      }
    }
  });

  it("keeps the freeze file's bytes, as written down", async () => {
    await assertSealedBytes(FREEZE, SEALED_FREEZE_FILE_SHA256, ACT3_FREEZE);
  });

  it("keeps the freeze's body hash, bound by the sealed read (depends on frozenHashOf)", () => {
    const freeze = parseFreeze();
    assert.equal(freeze.frozenHash, SEALED_FROZEN_HASH, `${FREEZE} was re-frozen. It is ${describeSeal(ACT3_FREEZE).what}: ${describeSeal(ACT3_FREEZE).restore}.`);
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
      await assertSealedBytes(path, recorded.artifactSha256, ACT3_INPUT, `arm ${arm}: `);
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
      await assertSealedBytes(path, sha, ACT3_INPUT);
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
      await assertSealedBytes(path, sha, ACT3_INPUT);
    });
  }
});
