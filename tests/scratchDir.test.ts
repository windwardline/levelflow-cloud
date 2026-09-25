import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

/**
 * TESTS REMOVE WHAT THEY CREATE.
 *
 * The suites written on 2026-09-20/21 for the minute bank and the cache top-up
 * copied source trees into mkdtemp directories on every run and never removed
 * them: one evening left 1,000+ directories and about 480 MB under $TMPDIR,
 * and this machine runs the suite at every session end. `scratchDir` records
 * each directory it makes and removes them all when the test process exits.
 *
 * Several of those trees hold a `node_modules` LINK to the real checkout, so
 * the removal must delete the link and never follow it. That is proven here
 * against a canary, in a child process, because the cleanup runs at exit.
 */

const HELPER = resolve("tests/support/scratchDir.ts");
const TSX = resolve("node_modules/.bin/tsx");

describe("scratchDir", () => {
  it("removes every directory it made when the process exits", () => {
    const out = execFileSync(
      TSX,
      [
        "--eval",
        `import("${HELPER}").then(({ scratchDir }) => {
           const a = scratchDir("scratch-probe-a-");
           const b = scratchDir("scratch-probe-b-");
           require("node:fs").writeFileSync(a + "/file", "x");
           console.log(a); console.log(b);
         });`,
      ],
      { encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "" } },
    );
    const made = out.trim().split("\n").filter((l) => l.startsWith("/"));
    assert.equal(made.length, 2, out);
    for (const dir of made) assert.equal(existsSync(dir), false, `${dir} outlived its process`);
  });

  it("deletes a symlink inside a scratch dir without following it", () => {
    // The canary stands in for the real node_modules the extracted trees link.
    const canary = mkdtempSync(join(tmpdir(), "scratch-canary-"));
    mkdirSync(join(canary, "pkg"));
    writeFileSync(join(canary, "pkg", "keep"), "must survive");
    try {
      const out = execFileSync(
        TSX,
        [
          "--eval",
          `import("${HELPER}").then(({ scratchDir }) => {
             const d = scratchDir("scratch-probe-link-");
             require("node:fs").symlinkSync("${canary}", d + "/node_modules");
             console.log(d);
           });`,
        ],
        { encoding: "utf8", env: { ...process.env, TSX_TSCONFIG_PATH: "" } },
      );
      const dir = out.trim().split("\n").filter((l) => l.startsWith("/"))[0];
      assert.ok(dir, out);
      assert.equal(existsSync(dir), false, "the scratch dir survived");
      assert.equal(existsSync(join(canary, "pkg", "keep")), true, "removal followed the link and destroyed its target");
    } finally {
      rmSync(canary, { recursive: true, force: true });
    }
  });
});

describe("the suites that leaked use it", () => {
  it("make no temp directory outside scratchDir", () => {
    // The four files that leaked 1,000+ directories in one evening, the two
    // minute-bank suites converted on 2026-09-21 (the parity suite had left 378
    // `parity-*` directories), and the FMP governor's suites, which joined the
    // same day after one run of their six files left 103 directories behind. A
    // static check, with its limit stated: it cannot see a sibling written
    // BESIDE a scratch dir — the `<bank>.lock` case, found only by counting
    // $TMPDIR before and after a run. scratchBank in minuteBankPinned closes that one.
    for (const file of [
      "tests/minuteBankBackup.test.ts",
      "tests/minuteBankLock.test.ts",
      "tests/minuteBankParity.test.ts",
      "tests/minuteBankPinned.test.ts",
      "tests/cacheTopupPinned.test.ts",
      "tests/support/noKeychain.ts",
      "tests/fixtures/fmpTestState.ts",
      "tests/fmpState.test.ts",
      "tests/fmpRunGate.test.ts",
      "tests/probeMinuteBars.test.ts",
      "tests/opsWrappers.test.ts",
    ]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /mkdtempSync\(/, `${file} makes a temp dir nobody removes`);
    }
  });
});

/**
 * The census the list above is not (2026-09-22). That list names eleven files
 * that must not call mkdtempSync, so a twelfth suite that leaks is under no
 * rule, and it keys on one idiom. This one keys on the capability: a file that
 * resolves the temp root itself — os.tmpdir(), a read of process.env.TMPDIR, a
 * literal temp-root path — writes where only the helper's exit hook cleans, so
 * it goes through the helper or it is named below with its reason. A
 * directory made under a scratchDir() parent resolves nothing and is removed
 * with its parent, so it is not in the census.
 *
 * The exceptions only shrink. Each is checked to still reach the temp root, so
 * a converted file must leave the list, and every key must be in the census
 * recorded on 2026-09-22, so a new file cannot join it by adding one line.
 * Residue, stated: a temp root reached through a name built at run time.
 */
const LEAKS = "makes directories under the temp root and never removes them: convert it to scratchDir";
const REMOVES_ITS_OWN =
  "makes directories under the temp root and removes them itself with rmSync, a premise this census does not execute";
const TEMP_ROOT_EXCEPTIONS = new Map<string, string>([
  ["tests/archiveOffbox.test.ts", "names /tmp only as a target string the rclone detector must read; it creates nothing there"],
  ["tests/armingBoundGraders.test.ts", LEAKS],
  ["tests/auditHigh.test.ts", REMOVES_ITS_OWN],
  ["tests/bankedFraction.test.ts", LEAKS],
  [
    "tests/calibrationCache.test.ts",
    "removes what its tempDir() helper makes after each test, and leaks the four it makes directly: convert those to scratchDir",
  ],
  [
    "tests/confirmFoldSealed.test.ts",
    "removes its four fixtures at exit and on SIGTERM/SIGINT, and keeps them on purpose under SEALED_GUARD_KEEP=1",
  ],
  ["tests/containedYears.test.ts", LEAKS],
  ["tests/costScaleReachesResolver.test.ts", LEAKS],
  ["tests/deriveFoldSpec.test.ts", LEAKS],
  ["tests/e4Collapse.test.ts", LEAKS],
  ["tests/emptyCorpusRefusals.test.ts", LEAKS],
  ["tests/feedYears.test.ts", LEAKS],
  ["tests/forexCommissionReaders.test.ts", LEAKS],
  ["tests/freezeCandidates.test.ts", LEAKS],
  ["tests/geometryEvidence.test.ts", LEAKS],
  ["tests/ledgeredRead.test.ts", REMOVES_ITS_OWN],
  ["tests/ledgeredReadConsumers.test.ts", LEAKS],
  ["tests/marketDossier.test.ts", LEAKS],
  ["tests/minuteBank.test.ts", REMOVES_ITS_OWN],
  [
    "tests/minuteBankOffbox.test.ts",
    "makes its one directory under a home-directory cache root and removes it; it names the temp roots as paths the push must refuse",
  ],
  ["tests/minuteBankPinned.test.ts", "names tmpdir() for a checkout path that must not exist; it creates nothing there"],
  ["tests/payoffDecomposition.test.ts", LEAKS],
  ["tests/q4CrossLeg.test.ts", LEAKS],
  ["tests/q4Reader.test.ts", LEAKS],
  ["tests/rebuildDepth.test.ts", REMOVES_ITS_OWN],
  ["tests/rejectionLedger.test.ts", LEAKS],
  ["tests/researchArtifacts.test.ts", LEAKS],
  ["tests/rosterExpectancyAudit.test.ts", LEAKS],
  ["tests/scratchClone.test.ts", REMOVES_ITS_OWN],
  [
    "tests/scratchDir.test.ts",
    "its canary must outlive the helper's own cleanup, so it is made outside it and removed in a finally; " +
      "its census samples name the temp root as strings",
  ],
  ["tests/sealedDoor.test.ts", REMOVES_ITS_OWN],
  ["tests/shippedCellProvenance.test.ts", LEAKS],
  ["tests/stopProvenanceReader.test.ts", LEAKS],
  ["tests/sweepFolds.test.ts", LEAKS],
  ["tests/sweepManifest.test.ts", LEAKS],
  ["tests/tuningFoldsSummary.test.ts", LEAKS],
  ["tests/unknownSplitRefused.test.ts", REMOVES_ITS_OWN],
  ["tests/verifyCacheClock.test.ts", REMOVES_ITS_OWN],
]);

/** The census of 2026-09-22. Only ever edited to remove a file that no longer reaches the temp root. */
const TEMP_ROOT_EXCEPTIONS_RECORDED = [
  "tests/archiveOffbox.test.ts",
  "tests/armingBoundGraders.test.ts",
  "tests/auditHigh.test.ts",
  "tests/bankedFraction.test.ts",
  "tests/calibrationCache.test.ts",
  "tests/confirmFoldSealed.test.ts",
  "tests/containedYears.test.ts",
  "tests/costScaleReachesResolver.test.ts",
  "tests/deriveFoldSpec.test.ts",
  "tests/e4Collapse.test.ts",
  "tests/emptyCorpusRefusals.test.ts",
  "tests/feedYears.test.ts",
  "tests/forexCommissionReaders.test.ts",
  "tests/freezeCandidates.test.ts",
  "tests/geometryEvidence.test.ts",
  "tests/ledgeredRead.test.ts",
  "tests/ledgeredReadConsumers.test.ts",
  "tests/marketDossier.test.ts",
  "tests/minuteBank.test.ts",
  "tests/minuteBankOffbox.test.ts",
  "tests/minuteBankPinned.test.ts",
  "tests/payoffDecomposition.test.ts",
  "tests/q4CrossLeg.test.ts",
  "tests/q4Reader.test.ts",
  "tests/rebuildDepth.test.ts",
  "tests/rejectionLedger.test.ts",
  "tests/researchArtifacts.test.ts",
  "tests/rosterExpectancyAudit.test.ts",
  "tests/scratchClone.test.ts",
  "tests/scratchDir.test.ts",
  "tests/sealedDoor.test.ts",
  "tests/shippedCellProvenance.test.ts",
  "tests/stopProvenanceReader.test.ts",
  "tests/sweepFolds.test.ts",
  "tests/sweepManifest.test.ts",
  "tests/tuningFoldsSummary.test.ts",
  "tests/unknownSplitRefused.test.ts",
  "tests/verifyCacheClock.test.ts",
];

/** Each way a file resolves the temp root itself. */
const RESOLVES_TEMP_ROOT: readonly RegExp[] = [
  /\btmpdir\b/,
  /\bprocess\s*\.\s*env\s*(?:\.\s*TMPDIR\b|\[\s*["'`]TMPDIR["'`]\s*\])/,
  /["'`](?:\/private)?\/tmp\/|["'`]\/var\/folders\//,
];

/** Comments removed, so a file that explains the temp root is not reaching it. */
const codeOf = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n");

const resolvesTempRoot = (source: string) => RESOLVES_TEMP_ROOT.some((pattern) => pattern.test(codeOf(source)));

describe("no test reaches the temp root around the helper", () => {
  it("sees each way a file resolves the temp root, and nothing that only mentions it", () => {
    for (
      const source of [
        'const dir = mkdtempSync(join(tmpdir(), "x-"));',
        'import os from "node:os";\nconst dir = mkdtempSync(os.tmpdir() + "/x-");',
        "const root = process.env.TMPDIR ?? '/tmp';",
        'const root = process.env["TMPDIR"];',
        'mkdirSync("/private/tmp/x", { recursive: true });',
      ]
    ) {
      assert.equal(resolvesTempRoot(source), true, source);
    }
    for (
      const source of [
        'const dir = scratchDir("x-");',
        'const nested = mkdtempSync(join(scratchDir("x-"), "y-"));',
        "// written under tmpdir() by the helper",
        "env: { TMPDIR: sb.tmp }",
      ]
    ) {
      assert.equal(resolvesTempRoot(source), false, source);
    }
  });

  it("every test file that resolves it goes through scratchDir or is named with its reason", () => {
    const population = (readdirSync("tests", { recursive: true }) as string[])
      .filter((name) => /\.[cm]?[jt]sx?$/.test(name))
      .map((name) => join("tests", name))
      .filter((file) => file !== join("tests", "support", "scratchDir.ts"))
      .sort();
    assert.ok(population.includes(join("tests", "scratchDir.test.ts")), "the census walked no test files");
    const reaching = population.filter((file) => resolvesTempRoot(readFileSync(file, "utf8")));
    assert.deepEqual(
      reaching.filter((file) => !TEMP_ROOT_EXCEPTIONS.has(file)),
      [],
      "these resolve the temp root themselves, so what they make there outlives the run: " +
        "take the directory from scratchDir() in tests/support/scratchDir.ts",
    );
    assert.deepEqual(
      [...TEMP_ROOT_EXCEPTIONS.keys()].filter((file) => !reaching.includes(file)),
      [],
      "these no longer reach the temp root — drop them from TEMP_ROOT_EXCEPTIONS",
    );
    assert.deepEqual(
      [...TEMP_ROOT_EXCEPTIONS.keys()].filter((file) => !TEMP_ROOT_EXCEPTIONS_RECORDED.includes(file)),
      [],
      "TEMP_ROOT_EXCEPTIONS only shrinks: a new file takes scratchDir() rather than an exception",
    );
    // The four the converge named as the worst leakers go through the helper now.
    for (const file of ["feedCharacter", "acceptanceGate", "sweepStats", "twoArmReconcile"]) {
      assert.ok(!reaching.includes(join("tests", `${file}.test.ts`)), `${file} reaches the temp root again`);
    }
  });
});

describe("the durable scratch dir stays behind two stubs", () => {
  it("is called only by a suite whose driver and Keychain are both stubs", () => {
    // durableScratchDir sits outside every temporary root, so the wrappers'
    // refusal of a temp-rooted store (barrier 2 of tests/support/noKeychain.ts)
    // does not stop a run that uses it. Its docstring limits it to a test whose
    // tsx and security are stubs; this makes that limit a census. A directory
    // walk, not `git ls-files`: this file is not one of the git-dependent six.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
      );
    const callers = walk("tests")
      .filter((file) => /\.tsx?$/.test(file) && file !== join("tests", "support", "scratchDir.ts"))
      .filter((file) => /\bdurableScratchDir\(/.test(readFileSync(file, "utf8")))
      .sort();
    assert.deepEqual(callers, ["tests/opsWrappers.test.ts"]);
    const suite = readFileSync("tests/opsWrappers.test.ts", "utf8");
    assert.match(suite, /writeFileSync\(tsx, TSX_STUB\);/, "the wrappers' tsx is no longer a stub");
    assert.match(suite, /writeFileSync\(join\(bin, "security"\), SECURITY_STUB\);/, "security is no longer a stub");
    assert.match(suite, /\$\{noKeychainBin\(\)\}/, "the refusing Keychain stub no longer sits behind it on PATH");
  });
});
