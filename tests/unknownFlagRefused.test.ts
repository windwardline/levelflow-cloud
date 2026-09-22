import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { OperatorInputError, positionalArgs } from "../scripts/flagReader.ts";
import { scratchDir } from "./support/scratchDir.ts";

// 2026-09-21. `confirm-4d --not-a-real-flag /tmp/nope.jsonl` reported only
// the corpus door's refusal and never named the flag — in the one script
// whose run BURNS the LA-6 confirm read, where a dial that was ignored
// reads as a read that honoured it and the read cannot be taken again.
// The same run also printed "frozen: 41 picks, 11 capacity-gated" and left
// the TRACKED docs/research/baseline-2026-08-10/4d-final-picks.json
// rewritten (456 insertions, 456 deletions, a fresh `frozenAt`) before
// dying at the manifest door, so it had to be restored with git checkout.
//
// Two laws, both EXECUTED rather than source-matched, because what a
// process does with a flag it does not know — and what it leaves on disk
// when it refuses — are facts about the process.
//
// The populations are DERIVED by globbing scripts/, never listed: a
// curated list is how market-dossier sat outside the flag law for 49
// rounds, and how the empty-corpus law shipped over a hand-picked five.

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const repoRoot = process.cwd();

/**
 * The silent walk, in both shapes it took.
 *
 * The dialed form — `if (t.startsWith("--")) { if (FLAGS.has(t)) i += 1;
 * continue; }` — consumes the token after a declared value flag and drops
 * every other `--x` on the floor. Nine readers carried it on 2026-09-21;
 * grid-totalr had closed it inline in R4 act 1 and the fix reached
 * whichever file someone happened to open, which is the argument for one
 * implementation.
 *
 * The flag-free form — `argv.filter((a) => !a.startsWith("--"))` — is the
 * same silence in a reader that declares no flags, and it is worse as a
 * starting point: it is the line a first flag gets added on top of. Three
 * readers carried it (`data-limits`, `confidence-bands`,
 * `geometry-evidence`) and take the shared walk with empty sets, so they
 * refuse a flag by name rather than dropping it.
 */
const SILENT_WALKS = [
  /startsWith\("--"\)\)\s*\{\s*\n\s*if \(\w+\.has\([^)]*\)\) \w+ \+= 1;\s*\n\s*continue;/,
  /\.filter\(\([\w]+\) => ![\w]+\.startsWith\("--"\)\)/,
];

/** Source with comment lines removed, so prose about a shape is not the shape. */
const withoutComments = (source: string) =>
  source.split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*");
    })
    .join("\n");

const scriptFiles = readdirSync("scripts")
  .filter((name) => name.endsWith(".ts"))
  .map((name) => `scripts/${name}`)
  .sort();

/** Every flag literal inside a `new Set([...])` declaration of that name. */
const declaredFlags = (source: string, name: string): string[] => {
  const declared = source.match(
    new RegExp(`const ${name} = new Set(?:<string>)?\\(\\[([^\\]]*)\\]\\)`),
  );
  if (!declared) return [];
  return [...declared[1].matchAll(/"(--[\w-]+)"/g)].map((m) => m[1]);
};

/**
 * Run a reader from an EMPTY temp cwd, returning what it did there.
 *
 * The cwd is the proof, and it is a better one than `git status` because
 * it holds on any checkout: every default output path in these readers is
 * repo-relative (`docs/research/baseline-2026-08-10/…`), so a refusal that
 * wrote anything leaves it here, and `wrote` is the whole directory
 * listing rather than a path someone remembered to name.
 *
 * It is also why this file shells out to no git: `tests/scratchClone.test.ts`
 * pins the set of tests a `--no-git` scratch copy breaks, and a sixth
 * member would be bought for an assertion `tests/emptyCorpusRefusals.test.ts`
 * already executes over every reader.
 */
const runReader = (
  reader: string,
  args: readonly string[],
): {
  exitCode: number | undefined;
  stderr: string;
  stdout: string;
  wrote: string[];
} => {
  // The repo's OWN tsx by absolute path, never `npx --no-install tsx`,
  // which resolves from the cwd's node_modules and so cannot be paired
  // with a spawn that runs elsewhere — on a CI runner it prints "npx
  // canceled due to missing packages" and exits 1, which satisfies every
  // "it refused" assertion while running nothing (#364 round 55).
  //
  // TSX_TSCONFIG_PATH is dropped for the same reason: `npm test` exports
  // it RELATIVE, the child resolves it against the temp cwd and dies
  // inside tsx's loader before the reader's first line. The subjects need
  // no tsconfig to run.
  const env = { ...process.env };
  delete env.TSX_TSCONFIG_PATH;
  const elsewhere = scratchDir("unknown-flag-");
  try {
    const stdout = execFileSync(TSX, [join(repoRoot, reader), ...args], {
      cwd: elsewhere,
      encoding: "utf8",
      env,
      stdio: "pipe",
      timeout: 120_000,
    });
    return { exitCode: 0, stderr: "", stdout, wrote: readdirSync(elsewhere) };
  } catch (error) {
    const failed = error as {
      status?: number;
      stderr?: string;
      stdout?: string;
    };
    return {
      exitCode: failed.status,
      stderr: String(failed.stderr ?? ""),
      stdout: String(failed.stdout ?? ""),
      wrote: readdirSync(elsewhere),
    };
  }
};

describe("the walk refuses an unknown flag by name", () => {
  it("the silent walk is extinct across scripts/", () => {
    const silent = scriptFiles.filter((file) => {
      // Comments are stripped first, the way the sibling positional-only
      // exemption does it. These files legitimately DISCUSS the shapes in
      // prose — flagReader's own header quotes the filter form to say why
      // it is worse — and quoting a defect is not committing one. The
      // first version of this scan matched flagReader's header and called
      // the law's own implementation a silent walker.
      const source = withoutComments(readFileSync(file, "utf8"));
      return SILENT_WALKS.some((shape) => shape.test(source));
    });
    assert.deepEqual(
      silent,
      [],
      `these readers walk past an unknown flag in silence — a typo, a ` +
        `retired dial and a sibling's flag all read as nothing at all, so ` +
        `the run measures the default while the shell history says ` +
        `otherwise. Take the walk from scripts/flagReader.ts`,
    );
  });

  // Derived from the adopters themselves: a reader that takes the shared
  // walk joins this law without anyone adding it, and one that leaves has
  // to leave the source scan above satisfied some other way.
  const adopters = scriptFiles.filter((file) =>
    /positionalArgs\(/.test(readFileSync(file, "utf8")) &&
    file !== "scripts/flagReader.ts"
  );

  it("the adopters are the readers that collect positional paths", () => {
    // One below the count at the change that installed the law, the same
    // rule the sibling scans state in words: a refactor that legitimately
    // shrinks the population lowers this floor in the same commit and
    // says which readers left and why.
    assert.ok(
      adopters.length >= 12,
      `the glob must find the readers on the shared walk, got ` +
        `${adopters.length}: ${adopters.join(", ")}`,
    );
    assert.ok(
      adopters.includes("scripts/confirm-4d.ts"),
      "the script that BURNS the confirm read is the reason this law exists",
    );
  });

  for (const reader of adopters) {
    it(`${reader} names an unknown flag and writes nothing — executed`, () => {
      // A corpus path rides beside the flag, so the refusal cannot be the
      // no-corpus door standing in for the one under test. That is the
      // exact shape of the 2026-09-21 run.
      const { exitCode, stderr, stdout, wrote } = runReader(reader, [
        "--not-a-real-flag",
        "/tmp/nope.jsonl",
      ]);
      assert.doesNotMatch(
        stderr,
        /npm error|npx canceled|command not found|Cannot find module 'tsx'/,
        `${reader} was never executed — a harness failure must never read ` +
          `as the subject refusing`,
      );
      assert.notEqual(
        exitCode,
        0,
        `${reader} accepted a flag it does not know — an ignored dial ` +
          `reads as a run that honoured it`,
      );
      assert.match(
        stderr,
        /unknown flag --not-a-real-flag/,
        `${reader} must name the flag it refused, so the operator learns ` +
          `which token was wrong rather than which file broke`,
      );
      assert.match(
        stderr,
        /refused rather than ignored/,
        `${reader}'s refusal must say WHY an unknown flag is fatal`,
      );
      // The refusal stands above every write, so nothing reached disk —
      // not the tracked tree, and not stdout's "frozen:" line, which is
      // what an operator reads as the pick having been taken.
      assert.deepEqual(
        wrote,
        [],
        `${reader} wrote into its working directory while refusing an ` +
          `unknown flag — every default output path here is repo-relative, ` +
          `so in the repository this is a tracked file`,
      );
      assert.equal(
        stdout.trim(),
        "",
        `${reader} reported work it then refused to do`,
      );
    });
  }

  // The other direction, and the one a mutation that simply deletes the
  // refusal would leave green: every flag the reader DECLARES must still
  // be accepted. A guard that refuses everything is not a guard.
  for (const reader of adopters) {
    it(`${reader} accepts every flag it declares`, () => {
      const source = readFileSync(reader, "utf8");
      const valueFlags = declaredFlags(source, "VALUE_FLAGS");
      const booleanFlags = declaredFlags(source, "BOOLEAN_FLAGS");
      if (valueFlags.length + booleanFlags.length === 0) {
        // A reader that takes no flag has nothing to accept, and that is
        // a real state rather than a gap: three readers call the walk
        // with empty sets so that a `--x` is refused by name instead of
        // filtered away. The premise is CHECKED, not trusted — a reader
        // that grew a flag and forgot to declare it would otherwise slip
        // through this branch silently.
        assert.doesNotMatch(
          withoutComments(source),
          /positionalArgs\([\s\S]{0,200}?new Set\(\[\s*"--/,
          `${reader} passes flags to the walk without declaring them in a ` +
            `named Set this scan can read`,
        );
        return;
      }
      // Every declared flag in ONE invocation. The walk throws on the
      // FIRST token it does not know, so passing them together still
      // names whichever one fell out of the declaration — and it is one
      // spawn per reader instead of one per flag, on a gate that has to
      // stay quick.
      //
      // Each value flag gets a plausible token, never asserted to be
      // VALID for the dial: the claim under test is that the WALK knows
      // the flag. A domain refusal below it is a different guard with
      // its own tests, and `--per-market-folds` reaching its own
      // retirement message is the same case.
      const every = [
        ...booleanFlags,
        ...valueFlags.flatMap((flag) => [flag, "1"]),
      ];
      const { stderr } = runReader(reader, every);
      assert.doesNotMatch(
        stderr,
        /unknown flag/,
        `${reader} refuses a flag it declares itself, out of ` +
          `${every.join(" ")} — a guard that refuses everything is not a ` +
          `guard`,
      );
    });
  }

  it("the retired --per-market-folds keeps its own refusal in both 4d readers", () => {
    // Declared KNOWN so the generic message cannot displace the one that
    // says what the re-cut did: it relabelled a median 329 days of the
    // held-back fold into select, where acceptance is decided.
    for (const reader of ["scripts/derive-4d.ts", "scripts/confirm-4d.ts"]) {
      const { exitCode, stderr } = runReader(reader, ["--per-market-folds"]);
      assert.notEqual(exitCode, 0, `${reader} must refuse the retired flag`);
      assert.match(stderr, /--per-market-folds was retired on 2026-09-02/);
      assert.doesNotMatch(
        stderr,
        /unknown flag/,
        `${reader} answered the retired flag with the generic refusal — ` +
          `the specific one names what the re-cut cost`,
      );
    }
  });

  it("the walk itself refuses by name, in process", () => {
    assert.deepEqual(
      positionalArgs(
        ["a.jsonl", "--seed", "7", "--rehearse", "b.jsonl"],
        new Set(["--seed"]),
        new Set(["--rehearse"]),
        "reader",
      ),
      ["a.jsonl", "b.jsonl"],
      "a declared value flag consumes one token and a boolean consumes none",
    );
    assert.throws(
      () =>
        positionalArgs(
          ["--nope", "a.jsonl"],
          new Set(["--seed"]),
          new Set(),
          "reader",
        ),
      (error: unknown) => {
        assert.ok(error instanceof OperatorInputError);
        assert.match(error.message, /^reader: unknown flag --nope/);
        // The known flags are LISTED, so the operator sees the correction
        // rather than only the mistake.
        assert.match(error.message, /the flags this reader knows are --seed/);
        return true;
      },
    );
  });
});

// The second law: confirm-4d validates EVERY named corpus path before it
// writes ANY artifact. Round 54 closed the zero-paths case; this is the
// one a real operator hits, and it is the case that dirtied the tracked
// picks file on 2026-09-21.
describe("confirm-4d freezes no pick for a corpus it cannot read", () => {
  /** A research dir holding only the two inputs the freeze reads. */
  const seededResearchDir = (): string => {
    const dir = scratchDir("confirm4d-order-");
    writeFileSync(
      join(dir, "4d-candidates.json"),
      JSON.stringify({
        analyzerVersion: "2026.08.09.test",
        markets: {
          EURUSD: {
            accepted: [{
              pairedP: 0.01,
              selectExpectancyDelta: 0.2,
              selectExpiryShare: null,
              selectFilled: 40,
              variant: "good",
              worstDayR: null,
            }],
            measureOnly: false,
            starved: false,
          },
        },
      }) + "\n",
    );
    writeFileSync(
      join(dir, "4d-feasibility.json"),
      JSON.stringify({
        feasibility: {
          EURUSD: { good: { feasibleLines: ["standard"], medianRiskDistance: 1 } },
        },
      }) + "\n",
    );
    return dir;
  };

  /** The artifacts the freeze and the read would leave behind. */
  const written = (dir: string) =>
    readdirSync(dir)
      .filter((name) =>
        name !== "4d-candidates.json" && name !== "4d-feasibility.json"
      )
      .sort();

  it("a named but undescribed shard leaves no picks artifact", () => {
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const { exitCode, stderr, stdout, wrote } = runReader("scripts/confirm-4d.ts", [
      "/tmp/definitely-not-a-corpus.jsonl",
      "--research-dir",
      researchDir,
      "--confirm-log-dir",
      ledgerDir,
    ]);
    assert.notEqual(exitCode, 0, "an unreadable corpus cannot freeze a pick");
    assert.match(
      stderr,
      /no manifest beside the emit/,
      "the refusal must be the corpus door, naming the shard",
    );
    // THE FINDING. Before the reorder this run printed "frozen: 41 picks,
    // 11 capacity-gated" and left the tracked artifact rewritten with a
    // fresh frozenAt, under exit 1.
    assert.deepEqual(
      written(researchDir),
      [],
      "confirm-4d wrote an artifact for a corpus it never read — the " +
        "corpus door stands above every write, because an operator who " +
        "sees exit 1 reasonably assumes nothing happened",
    );
    assert.doesNotMatch(
      stdout,
      /frozen:/,
      "a freeze was reported for a corpus that was never opened",
    );
    assert.deepEqual(
      wrote,
      [],
      "confirm-4d wrote into its working directory while refusing — with " +
        "no --research-dir that directory is the repository, and the " +
        "artifact is tracked",
    );
  });

  it("an unknown flag leaves no picks artifact either", () => {
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const { exitCode, stderr } = runReader("scripts/confirm-4d.ts", [
      "--not-a-real-flag",
      "/tmp/definitely-not-a-corpus.jsonl",
      "--research-dir",
      researchDir,
      "--confirm-log-dir",
      ledgerDir,
    ]);
    assert.notEqual(exitCode, 0);
    assert.match(stderr, /unknown flag --not-a-real-flag/);
    assert.deepEqual(
      written(researchDir),
      [],
      "the flag refusal must stand above the freeze as well",
    );
  });

  it("the ledger is untouched by either refusal", () => {
    // Neither refusal reaches a confirm read, so LA-6's record must not
    // move. A burned read cannot be un-burned.
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    runReader("scripts/confirm-4d.ts", [
      "/tmp/definitely-not-a-corpus.jsonl",
      "--research-dir",
      researchDir,
      "--confirm-log-dir",
      ledgerDir,
    ]);
    assert.deepEqual(readdirSync(ledgerDir), []);
  });
});
