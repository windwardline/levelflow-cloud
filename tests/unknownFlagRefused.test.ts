import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
  flagsOnly,
  OperatorInputError,
  positionalArgs,
} from "../scripts/flagReader.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { noKeychainEnv } from "./support/noKeychain.ts";
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
// The populations are DERIVED, never listed: a curated list is how
// market-dossier sat outside the flag law for 49 rounds, and how the
// empty-corpus law shipped over a hand-picked five. The first version of
// this file derived its executed population from the fix's own call site,
// so a reader that left the shared walk left the law with it, and a reader
// with no walker at all — sweep-analysis, replay-sweep, derive-baselines
// and fourteen more — was never in it. The population is now every script
// that reads process.argv.

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const repoRoot = process.cwd();
const execFileAsync = promisify(execFile);

/** Source with comment lines removed, so prose about a shape is not the shape. */
const withoutComments = (source: string) =>
  source.split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") &&
        !trimmed.startsWith("/*");
    })
    .join("\n");

const scriptFiles = (readdirSync("scripts", { recursive: true }) as string[])
  .filter((name) => name.endsWith(".ts"))
  .map((name) => `scripts/${name}`)
  .sort();
const sourceOf = (file: string) => readFileSync(file, "utf8");

/** Every script that reads what an operator typed. */
const ARGV_READERS = scriptFiles.filter((file) =>
  /\bprocess\.argv\b/.test(withoutComments(sourceOf(file)))
);

/**
 * Argv readers that take no operator argument at all, by name, with the
 * reason. Each premise is CHECKED below rather than trusted, so the
 * exemption cannot outlive the fact it rests on.
 */
const NOT_OPERATOR_INPUT = new Map<string, string>([
  [
    "scripts/isEntryPoint.ts",
    "reads process.argv[1] — the path of the file Node was asked to run — " +
    "and nothing an operator types",
  ],
]);

/** The readers this law EXECUTES: every argv reader but the exemptions. */
const EXECUTED = ARGV_READERS.filter((file) => !NOT_OPERATOR_INPUT.has(file));

/**
 * Readers whose CONTRACT is to fail toward running, by name, with the
 * reason. Such a reader still refuses an unknown flag BY NAME; what differs
 * is the exit status, and that is executed below rather than trusted: the
 * refusal must arrive as its gateError line, at exit 0.
 */
const FAILS_TOWARD_RUNNING = new Map<string, string>([
  [
    "scripts/fmpRunGate.ts",
    "the scheduled jobs' run gate. The minute bank cannot be refused " +
    "(§21c), so anything the gate cannot read — a checkout, a marker, a " +
    "flag — prints `reason=gateError` and exits 0, and the job runs; " +
    "bank-minute-bars-daily.sh skips only on exit 75 WITH the skip line. " +
    "A refusal that exited non-zero here would be the one outcome that " +
    "could cost minute bars",
  ],
]);

/** Readers on the shared walk, which carry its wording as well as its refusal. */
const ADOPTERS = EXECUTED.filter((file) =>
  /\b(?:positionalArgs|flagsOnly)\(/.test(withoutComments(sourceOf(file)))
);

/** Readers that take flags only, and so refuse a stray argument too. */
const FLAGS_ONLY = EXECUTED.filter((file) =>
  /\bflagsOnly\(/.test(withoutComments(sourceOf(file)))
);

/**
 * The flags a reader DECLARES, from every `const *_FLAGS = new Set([...])`.
 * A set whose name says VALUE owns the token after each member; one whose
 * name says BOOLEAN owns none.
 */
const declaredFlags = (source: string): { boolean: string[]; value: string[] } => {
  const value: string[] = [];
  const boolean: string[] = [];
  for (
    const declared of withoutComments(source).matchAll(
      /const (\w*FLAGS) = new Set(?:<string>)?\(\[([^\]]*)\]\)/g,
    )
  ) {
    const flags = [...declared[2].matchAll(/"(--[\w-]+)"/g)].map((m) => m[1]);
    if (declared[1].includes("BOOLEAN")) boolean.push(...flags);
    else if (declared[1].includes("VALUE")) value.push(...flags);
  }
  return { boolean, value };
};

/**
 * The flags a reader READS: every string literal that is a flag and nothing
 * else — `argv.includes("--x")`, `str("--x")`, `soleFlagIndex(argv, "--x")`.
 * A flag named inside a longer message is not a whole literal, so the
 * operator-facing prose that mentions flags does not count.
 */
const readFlags = (source: string): string[] =>
  [
    ...new Set(
      [...withoutComments(source).matchAll(/(["'`])(--[a-z][\w-]*)\1/g)].map((m) => m[2]),
    ),
  ].sort();

type Run = {
  exitCode: number | null;
  signal: string | null;
  stderr: string;
  stdout: string;
  wrote: string[];
};

/**
 * The environment every subject runs in, and the reason it is not the
 * suite's own. A red run of this file executes each reader AS IT IS, before
 * the guard under test exists — on 2026-09-20 six such runs fetched a full
 * FMP roster each. So the provider key is removed, `security` is shadowed by
 * the refusing stub, and a pinned-checkout variable cannot point a subject
 * at the real ledger. A reader that would spend then stops at its own key
 * check, whatever this file is proving.
 *
 * TSX_TSCONFIG_PATH is dropped too: `npm test` exports it RELATIVE, the
 * child resolves it against the temp cwd and dies inside tsx's loader
 * before the reader's first line. The subjects need no tsconfig to run.
 */
const subjectEnv = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, ...noKeychainEnv() };
  delete env.TSX_TSCONFIG_PATH;
  delete env.FMP_API_KEY;
  delete env.LEVELFLOW_CHECKOUT;
  return env;
};

/**
 * Run a reader from an EMPTY temp cwd, returning what it did there.
 *
 * The cwd is the proof for every cwd-relative output — and every DEFAULT
 * output path of these readers is cwd-relative
 * (`docs/research/baseline-2026-08-10/…`, `.minute-bank`), so a refusal
 * that wrote anything leaves it here, and `wrote` is the whole directory
 * listing rather than a path someone remembered to name. The one
 * module-relative output, grid-totalr's repository confirm ledger, is
 * written only by a RECORDED read; no refusal here reaches one, and the
 * confirm-4d cases below that do read redirect it with --confirm-log-dir.
 *
 * It is also why this file shells out to no git: `tests/scratchClone.test.ts`
 * pins the set of tests a `--no-git` scratch copy breaks, and a sixth
 * member would be bought for an assertion `tests/emptyCorpusRefusals.test.ts`
 * already executes over every reader.
 */
const runReader = async (
  reader: string,
  args: readonly string[],
): Promise<Run> => {
  // The repo's OWN tsx by absolute path, never `npx --no-install tsx`,
  // which resolves from the cwd's node_modules and so cannot be paired
  // with a spawn that runs elsewhere — on a CI runner it prints "npx
  // canceled due to missing packages" and exits 1, which satisfies every
  // "it refused" assertion while running nothing (#364 round 55).
  const elsewhere = scratchDir("unknown-flag-");
  try {
    const { stderr, stdout } = await execFileAsync(
      TSX,
      [join(repoRoot, reader), ...args],
      {
        cwd: elsewhere,
        encoding: "utf8",
        env: subjectEnv(),
        maxBuffer: 16 * 1024 * 1024,
        timeout: 120_000,
      },
    );
    return { exitCode: 0, signal: null, stderr, stdout, wrote: readdirSync(elsewhere) };
  } catch (error) {
    const failed = error as {
      code?: number | string;
      signal?: string | null;
      stderr?: string;
      stdout?: string;
    };
    return {
      exitCode: typeof failed.code === "number" ? failed.code : null,
      signal: failed.signal ?? null,
      stderr: String(failed.stderr ?? ""),
      stdout: String(failed.stdout ?? ""),
      wrote: readdirSync(elsewhere),
    };
  }
};

/** A harness failure must never read as the subject refusing. */
const assertExecuted = (reader: string, run: Run) => {
  assert.equal(
    run.signal,
    null,
    `${reader} was killed (${run.signal}) — a timeout is not a refusal`,
  );
  assert.notEqual(
    run.exitCode,
    null,
    `${reader} produced no exit status — the spawn itself failed`,
  );
  assert.doesNotMatch(
    run.stderr,
    /npm error|npx canceled|command not found|Cannot find module '[^']*tsx/,
    `${reader} was never executed`,
  );
};

/** A corpus path no reader can open, inside a directory this file owns. */
const missingCorpus = () => join(scratchDir("unknown-flag-corpus-"), "nope.jsonl");

// Spawns run four at a time: the suite already runs files in parallel,
// and a gate that must stay quick cannot spend a minute in one file.
const CONCURRENCY = 4;

describe("every argv reader refuses an unknown flag by name", { concurrency: CONCURRENCY }, () => {
  it("the population is derived, its exemptions hold, and the named readers are in it", () => {
    // Floors one below the counts on 2026-09-21 (42 argv readers, 41
    // executed, 30 on the shared walk, 14 of them flags-only). A glob that
    // silently matched nothing would otherwise pass every law below
    // vacuously; a refactor that legitimately shrinks a population lowers
    // its floor in the same commit and says which readers left and why.
    assert.ok(ARGV_READERS.length >= 41, `argv readers: ${ARGV_READERS.length}`);
    assert.ok(EXECUTED.length >= 40, `executed: ${EXECUTED.length}`);
    assert.ok(ADOPTERS.length >= 29, `adopters: ${ADOPTERS.length}`);
    assert.ok(FLAGS_ONLY.length >= 13, `flags-only: ${FLAGS_ONLY.length}`);
    for (const exempt of [...NOT_OPERATOR_INPUT.keys(), ...FAILS_TOWARD_RUNNING.keys()]) {
      assert.ok(
        ARGV_READERS.includes(exempt),
        `${exempt} is exempted but no longer reads argv — drop the exemption`,
      );
    }
    // The exemption's premise: argv[1] and nothing else.
    const entry = withoutComments(sourceOf("scripts/isEntryPoint.ts"));
    assert.deepEqual(
      [...entry.matchAll(/\bprocess\.argv\b(\[\d+\])?/g)].map((m) => m[0]),
      ["process.argv[1]"],
      "scripts/isEntryPoint.ts reads another argv index — it now takes " +
        "operator input and belongs under the law",
    );
    // Pinned by NAME as well as derived: the script that burns the confirm
    // read, its sibling derivation, and the gate both grade through. A
    // reader leaving the shared walk stays in EXECUTED either way; these
    // three may not leave the walk at all.
    for (const reader of ["scripts/confirm-4d.ts", "scripts/derive-4d.ts", "scripts/grid-totalr.ts"]) {
      assert.ok(ADOPTERS.includes(reader), `${reader} must take the shared walk`);
    }
  });

  it("the silent walk is extinct across scripts/", () => {
    // The two shapes the silence took, as a source backstop to the
    // executed law below — the dialed form (`if (FLAGS.has(t)) i += 1;
    // continue;`) and the flag-free filter (`argv.filter((a) =>
    // !a.startsWith("--"))`). Comments are stripped first: flagReader's own
    // header quotes the filter form to say why it is worse, and quoting a
    // defect is not committing one.
    const SILENT_WALKS = [
      /startsWith\("--"\)\)\s*\{\s*\n\s*if \(\w+\.has\([^)]*\)\) \w+ \+= 1;\s*\n\s*continue;/,
      /\.filter\(\(?[\w]+(?:, \w+)?\)? => ![\w]+\.startsWith\("--"\)/,
    ];
    const silent = scriptFiles.filter((file) =>
      SILENT_WALKS.some((shape) => shape.test(withoutComments(sourceOf(file))))
    );
    assert.deepEqual(silent, [], "take the walk from scripts/flagReader.ts");
  });

  for (const reader of EXECUTED) {
    it(`${reader} names an unknown flag and writes nothing — executed`, async () => {
      // A corpus path rides beside the flag, so the refusal cannot be the
      // no-corpus door standing in for the one under test. That is the
      // exact shape of the 2026-09-21 run.
      const run = await runReader(reader, ["--not-a-real-flag", missingCorpus()]);
      assertExecuted(reader, run);
      const failsTowardRunning = FAILS_TOWARD_RUNNING.has(reader);
      if (failsTowardRunning) {
        assert.equal(run.exitCode, 0, `${reader} must keep its fail-toward-running contract`);
        assert.match(run.stdout, /reason=gateError: /, `${reader} must report the refusal as a gateError`);
      } else {
        assert.notEqual(
          run.exitCode,
          0,
          `${reader} accepted a flag it does not know — an ignored dial reads ` +
            `as a run that honoured it`,
        );
      }
      // Named AS a flag. A reader that opened "--not-a-real-flag" as a file
      // names the token too — and sends the operator to the wrong fault.
      const said = run.stderr + run.stdout;
      assert.match(
        said,
        /unknown ?flag(?:\(s\))?:? --not-a-real-flag/i,
        `${reader} must refuse the token AS an unknown flag, so the ` +
          `operator learns which token was wrong rather than which file broke`,
      );
      if (ADOPTERS.includes(reader)) {
        assert.match(
          said,
          /refused rather than ignored/,
          `${reader} is on the shared walk, whose refusal says WHY an ` +
            `unknown flag is fatal`,
        );
      }
      assert.deepEqual(
        run.wrote,
        [],
        `${reader} wrote into its working directory while refusing an ` +
          `unknown flag — every default output path here is cwd-relative, ` +
          `so in the repository this is a tracked file`,
      );
      if (!failsTowardRunning) {
        assert.equal(
          run.stdout.trim(),
          "",
          `${reader} reported work it then refused to do`,
        );
      }
    });
  }

  // The other direction, and the one a mutation that simply deletes the
  // refusal would leave green: every flag the reader USES must still be
  // accepted. Two halves, because each alone has a blind spot. Reading the
  // flags from the declaration cannot see a flag the code reads but the
  // declaration dropped — removing `--acknowledge-prior-reads` from
  // confirm-4d's set passed the whole suite, and the operator would have
  // met it at the burn. Reading them from the code cannot see a flag
  // resolved by a helper in another module.
  for (const reader of EXECUTED) {
    it(`${reader} declares every flag it reads`, () => {
      const source = sourceOf(reader);
      const declared = declaredFlags(source);
      const known = new Set([...declared.value, ...declared.boolean]);
      const undeclared = readFlags(source).filter((flag) => !known.has(flag));
      assert.deepEqual(
        undeclared,
        [],
        `${reader} reads these flags without declaring them, so the walk ` +
          `refuses a flag the reader honours`,
      );
    });
  }

  for (const reader of EXECUTED) {
    it(`${reader} accepts every flag it declares — executed`, async (t) => {
      const declared = declaredFlags(sourceOf(reader));
      if (declared.value.length + declared.boolean.length === 0) {
        // A reader that takes no flag has nothing to accept, and that is a
        // real state rather than a gap: it refuses a `--x` by name instead
        // of filtering it away. The premise is CHECKED — the reader must
        // read no flag either, which the test above holds.
        assert.deepEqual(readFlags(sourceOf(reader)), []);
        t.diagnostic(`${reader} declares no flag`);
        return;
      }
      // Every declared flag in ONE invocation. The walk throws on the FIRST
      // token it does not know, so passing them together still names
      // whichever one fell out of the declaration. Each value flag gets a
      // plausible token, never asserted to be VALID for the dial: the claim
      // under test is that the WALK knows the flag. A domain refusal below
      // it is a different guard with its own tests.
      const every = [
        ...declared.boolean,
        ...declared.value.flatMap((flag) => [flag, "1"]),
      ];
      const run = await runReader(reader, every);
      assertExecuted(reader, run);
      assert.doesNotMatch(
        run.stderr,
        /unknown ?flag/i,
        `${reader} refuses a flag it declares itself, out of ` +
          `${every.join(" ")} — a guard that refuses everything is not a guard`,
      );
    });
  }

  for (const reader of FLAGS_ONLY) {
    it(`${reader} refuses a stray argument by name — executed`, async () => {
      // A reader that takes flags only IGNORED any bare token: `sweep-analysis
      // --emit a.jsonl b.jsonl` reported over a.jsonl without a word. The
      // silence is the unknown flag's, one character over.
      const run = await runReader(reader, ["stray-token"]);
      assertExecuted(reader, run);
      if (FAILS_TOWARD_RUNNING.has(reader)) {
        assert.equal(run.exitCode, 0, `${reader} must keep its fail-toward-running contract`);
      } else {
        assert.notEqual(run.exitCode, 0, `${reader} accepted a stray argument`);
      }
      const said = run.stderr + run.stdout;
      assert.match(said, /stray argument "stray-token"/);
      assert.match(said, /refused rather than ignored/);
      assert.deepEqual(run.wrote, []);
    });
  }

  it("the retired --per-market-folds keeps its own refusal in both 4d readers", async () => {
    // Declared KNOWN so the generic message cannot displace the one that
    // says what the re-cut did: it relabelled a median 329 days of the
    // held-back fold into select, where acceptance is decided.
    for (const reader of ["scripts/derive-4d.ts", "scripts/confirm-4d.ts"]) {
      const run = await runReader(reader, ["--per-market-folds"]);
      assertExecuted(reader, run);
      assert.notEqual(run.exitCode, 0, `${reader} must refuse the retired flag`);
      assert.match(run.stderr, /--per-market-folds was retired on 2026-09-02/);
      assert.doesNotMatch(
        run.stderr,
        /unknown flag/,
        `${reader} answered the retired flag with the generic refusal — ` +
          `the specific one names what the re-cut cost`,
      );
    }
  });
});

describe("the walk itself, in process", () => {
  it("a declared value flag consumes one token and a boolean none", () => {
    assert.deepEqual(
      positionalArgs(
        ["a.jsonl", "--seed", "7", "--rehearse", "b.jsonl"],
        new Set(["--seed"]),
        new Set(["--rehearse"]),
        "reader",
      ),
      ["a.jsonl", "b.jsonl"],
    );
  });

  it("an unknown flag is refused by name, listing the known ones", () => {
    assert.throws(
      () => positionalArgs(["--nope", "a.jsonl"], new Set(["--seed"]), new Set(), "reader"),
      (error: unknown) => {
        assert.ok(error instanceof OperatorInputError);
        assert.match(error.message, /^reader: unknown flag --nope/);
        // The known flags are LISTED, so the operator sees the correction
        // rather than only the mistake.
        assert.match(error.message, /the flags this reader knows are --seed/);
        assert.match(error.message, /refused rather than ignored/);
        return true;
      },
    );
  });

  it("a single-dash token is a flag, and a negative number or a bare dash is not", () => {
    // `-x` read as a shard path was refused as "no manifest beside the
    // emit" — the wrong diagnosis, the class round 38 fixed for a repeated
    // --seed. e4-collapse already refused it as a flag (e4Collapse.test.ts).
    assert.throws(
      () => positionalArgs(["-x", "a.jsonl"], new Set(), new Set(), "reader"),
      /reader: unknown flag -x/,
    );
    assert.deepEqual(
      positionalArgs(["-", "-1", "a.jsonl"], new Set(), new Set(), "reader"),
      ["-", "-1", "a.jsonl"],
      "a bare dash and a negative number are values, never flags",
    );
  });

  it("a value flag never swallows the flag after it", () => {
    // `--out --net x.jsonl`: --out owns nothing, --net owns x.jsonl, and
    // the accessor refuses --out's missing value by name. Swallowing
    // --net would call x.jsonl a stray argument instead.
    assert.deepEqual(
      positionalArgs(
        ["--out", "--net", "x.jsonl", "a.jsonl"],
        new Set(["--out", "--net"]),
        new Set(),
        "reader",
      ),
      ["a.jsonl"],
    );
    assert.doesNotThrow(() =>
      flagsOnly(["--out", "--net", "x.jsonl"], new Set(["--out", "--net"]), new Set(), "reader")
    );
    // A trailing value flag owns nothing, and a single-dash token after
    // one is a flag, so it is refused as one.
    assert.deepEqual(
      positionalArgs(["a.jsonl", "--seed"], new Set(["--seed"]), new Set(), "reader"),
      ["a.jsonl"],
    );
    assert.throws(
      () => positionalArgs(["--seed", "-x"], new Set(["--seed"]), new Set(), "reader"),
      /reader: unknown flag -x/,
    );
    // A value that is not flag-shaped IS owned, blank or not: the accessor
    // judges it (an unset shell variable is the blank case).
    assert.deepEqual(
      positionalArgs(["--seed", "", "a.jsonl"], new Set(["--seed"]), new Set(), "reader"),
      ["a.jsonl"],
    );
  });

  it("flagsOnly refuses a stray argument by name, after the unknown-flag check", () => {
    assert.doesNotThrow(() =>
      flagsOnly(["--emit", "a.jsonl", "--quiet"], new Set(["--emit"]), new Set(["--quiet"]), "reader")
    );
    assert.throws(
      () => flagsOnly(["--emit", "a.jsonl", "b.jsonl"], new Set(["--emit"]), new Set(), "reader"),
      (error: unknown) => {
        assert.ok(error instanceof OperatorInputError);
        assert.match(error.message, /^reader: stray argument "b\.jsonl"/);
        assert.match(error.message, /refused rather than ignored/);
        return true;
      },
    );
    assert.throws(
      () => flagsOnly(["--nope", "b.jsonl"], new Set(), new Set(), "reader"),
      /unknown flag --nope/,
      "the unknown flag is named before the stray argument after it",
    );
  });
});

// The second law: confirm-4d validates EVERY named corpus path — and every
// dial — before it writes ANY artifact, and the write it does make lands
// before the confirm fold's first row is read. Round 54 closed the
// zero-paths case; the 2026-09-21 run was the one-bad-path case; the
// review of the first fix found the rest of the corpus door (shard
// agreement, the requested roster, the prior-read refusal) and three dials
// still standing BELOW the freeze.
describe("confirm-4d freezes no pick for a run that refuses", { concurrency: CONCURRENCY }, () => {
  // A fixture corpus identity nothing else in the suite computes: its own
  // analyzer version and its own fold instants. The prior-read scan reads
  // the repository ledger on every confirm read, and a fixture sharing
  // another file's identity or held-back calendar would find that file's
  // entries and refuse for a reason this file is not testing.
  const TEST_TREASURY_CURVE: TreasuryCurveFacts = {
    count: 3_000,
    firstTime: Date.UTC(2013, 0, 2),
    largestGapMs: 4 * 86_400_000,
    lastTime: Date.UTC(2027, 0, 1),
  };
  const DAY = 86_400_000;
  const DAYS = 40;

  /** Rows on which the "good" variant clears the market grain's gate. */
  const rowsFor = (symbol: string): SweepEmitRow[] => {
    const rows: SweepEmitRow[] = [];
    for (let day = 0; day < DAYS; day += 1) {
      for (const [split, offset] of [["fit", 0], ["select", 100], ["confirm", 200]] as const) {
        for (const [variant, realizedR] of [["baseline", 0.1], ["good", 0.4]] as const) {
          rows.push({
            accepted: true,
            outcome: "take_profit",
            realizedR,
            split,
            symbol,
            time: Date.UTC(2025, 0, 6) + (day + offset) * DAY + 12 * 3_600_000,
            variant,
          });
        }
      }
    }
    return rows;
  };

  /** One manifested shard, in a directory of its own. */
  const shard = (
    symbol: string,
    overrides: { days?: number; requestedSymbols?: string[] | null } = {},
  ): string => {
    const dir = scratchDir("confirm4d-shard-");
    const corpus = join(dir, "shard.jsonl");
    writeFileSync(corpus, rowsFor(symbol).map((row) => JSON.stringify(row)).join("\n") + "\n");
    const requested = overrides.requestedSymbols === undefined
      ? [symbol]
      : overrides.requestedSymbols;
    writeFileSync(
      `${corpus}.manifest.json`,
      JSON.stringify(
        buildSweepManifest({
          acceptance: { captureAll: false, ignoreLowEdge: false },
          ...(requested === null ? {} : { requestedSymbols: requested }),
          analyzerVersion: "2026.09.21.unknown-flag-test",
          anchor: "2026-09-21",
          barRejections: {},
          clock: { calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK },
          conditions: {
            availableTimeframeCount: "min-four-by-construction",
            macroAdjustment: "historical-treasury-curve",
            providerWarningCount: "zero-by-construction",
            spreadSource: "modeled-by-construction",
            weightAdjustment: "raw-engine-zero",
          },
          days: overrides.days ?? 365,
          folds: [
            { decisionEndMs: 21_004, endMs: 21_005, name: "fit", startMs: 21_000 },
            { decisionEndMs: 21_008, endMs: 21_009, name: "select", startMs: 21_005 },
            { decisionEndMs: 21_012, endMs: 21_013, name: "confirm", startMs: 21_009 },
          ],
          generatedAt: "2026-09-21T05:00:00.000Z",
          grid: [{}, { good: true }],
          stepBars: 16,
          symbols: [{
            calibration: {},
            providerSymbol: symbol,
            series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
            symbol,
          }],
          trainShare: 0.6,
          treasuryCurve: TEST_TREASURY_CURVE,
          warmupBars: 240,
        }),
        null,
        2,
      ) + "\n",
    );
    return corpus;
  };

  const SEEDED = ["4d-candidates.json", "4d-feasibility.json"];

  /** A research dir holding only the two inputs the freeze reads. */
  const seededResearchDir = (symbols: readonly string[] = ["EURGBP"]): string => {
    const dir = scratchDir("confirm4d-research-");
    writeFileSync(
      join(dir, "4d-candidates.json"),
      JSON.stringify({
        analyzerVersion: "2026.09.21.unknown-flag-test",
        markets: Object.fromEntries(symbols.map((symbol) => [symbol, {
          accepted: [{
            pairedP: 0.01,
            selectExpectancyDelta: 0.3,
            selectExpiryShare: 0,
            selectFilled: DAYS,
            variant: "good",
            worstDayR: -0.5,
          }],
          measureOnly: false,
          starved: false,
        }])),
      }) + "\n",
    );
    writeFileSync(
      join(dir, "4d-feasibility.json"),
      JSON.stringify({
        feasibility: Object.fromEntries(symbols.map((symbol) => [symbol, {
          good: { feasibleLines: ["standard"], medianRiskDistance: 1 },
        }])),
      }) + "\n",
    );
    return dir;
  };

  /** The artifacts the freeze and the read would leave behind. */
  const written = (dir: string) =>
    readdirSync(dir).filter((name) => !SEEDED.includes(name)).sort();

  /** Every file in a directory with its sha256, to prove a byte-level no-op. */
  const snapshot = (dir: string) =>
    Object.fromEntries(
      readdirSync(dir).sort().map((name) => [
        name,
        createHash("sha256").update(readFileSync(join(dir, name))).digest("hex"),
      ]),
    );

  const confirm4d = (
    args: readonly string[],
    researchDir: string,
    ledgerDir: string,
  ) =>
    runReader("scripts/confirm-4d.ts", [
      ...args,
      "--research-dir",
      researchDir,
      "--confirm-log-dir",
      ledgerDir,
      "--permutations",
      "200",
    ]);

  /** A refused run: non-zero, the named refusal, and nothing on disk. */
  const assertRefusedWritingNothing = (
    run: Run,
    refusal: RegExp,
    researchDir: string,
    ledgerDir: string,
    why: string,
  ) => {
    assertExecuted("scripts/confirm-4d.ts", run);
    assert.notEqual(run.exitCode, 0, `${why}: the run must refuse`);
    assert.match(run.stderr, refusal, `${why}: the refusal must be the one under test`);
    // THE FINDING. Before the reorder each of these printed "frozen: N
    // picks" and left the picks artifact rewritten with a fresh frozenAt,
    // under exit 1 — an operator who sees exit 1 reasonably assumes
    // nothing happened, and on the default --research-dir it is a tracked
    // file.
    assert.deepEqual(written(researchDir), [], `${why}: an artifact was written for a run that refused`);
    assert.doesNotMatch(run.stdout, /frozen:/, `${why}: a freeze was reported for a run that refused`);
    assert.deepEqual(readdirSync(ledgerDir), [], `${why}: the ledger moved on a run that read nothing`);
    assert.deepEqual(run.wrote, [], `${why}: the run wrote into its working directory`);
  };

  it("a named but undescribed shard leaves no picks artifact", async () => {
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const run = await confirm4d([missingCorpus()], researchDir, ledgerDir);
    assertRefusedWritingNothing(run, /no manifest beside the emit/, researchDir, ledgerDir, "one undescribed shard");
  });

  it("an undescribed shard in SECOND position leaves no picks artifact either", async () => {
    // Every earlier case named one bad path, and a door that checked only
    // the first shard passed them all.
    const good = shard("EURGBP");
    const bad = missingCorpus();
    for (const order of [[good, bad], [bad, good]]) {
      const researchDir = seededResearchDir();
      const ledgerDir = scratchDir("confirm4d-ledger-");
      const run = await confirm4d(order, researchDir, ledgerDir);
      assertRefusedWritingNothing(
        run,
        new RegExp(`${bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: no manifest beside the emit`),
        researchDir,
        ledgerDir,
        `shards ${order.map((path) => path === bad ? "undescribed" : "described").join(", ")}`,
      );
    }
  });

  it("shards that are not one measurement leave no picks artifact", async () => {
    // Depth is measurement identity: 365 days and 364 days are two sweeps.
    const researchDir = seededResearchDir(["EURGBP", "GBPJPY"]);
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const run = await confirm4d(
      [shard("EURGBP", { days: 365 }), shard("GBPJPY", { days: 364 })],
      researchDir,
      ledgerDir,
    );
    assertRefusedWritingNothing(run, /shard conditions differ/, researchDir, ledgerDir, "shard depth differs");
  });

  it("a shard with no requested roster leaves no picks artifact", async () => {
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const run = await confirm4d([shard("EURGBP", { requestedSymbols: null })], researchDir, ledgerDir);
    assertRefusedWritingNothing(run, /carries no requestedSymbols/, researchDir, ledgerDir, "no requested roster");
  });

  it("a refused dial leaves no picks artifact", async () => {
    // Three dials were read INSIDE gradeCorpus's argument list, below the
    // freeze: a typo'd --seed or a zero --permutations froze the picks and
    // only then refused.
    const cases: Array<[readonly string[], RegExp]> = [
      [["--permutations", "0"], /--permutations must be at least 1/],
      [["--seed", "7", "--seed", "8"], /--seed was given 2 times/],
      [["--seed", "--bogus"], /unknown flag --bogus/],
      [["--confirm-log-dir", "elsewhere"], /--confirm-log-dir was given 2 times/],
      [["--seed"], /--seed owns the token after it and cannot read a missing value/],
    ];
    for (const [dial, refusal] of cases) {
      const researchDir = seededResearchDir();
      const ledgerDir = scratchDir("confirm4d-ledger-");
      // The dial rides AFTER the harness's own flags so a trailing --seed
      // is trailing, and --permutations 0 is the second occurrence only
      // when a repeat is the case under test.
      const args = [
        shard("EURGBP"),
        "--research-dir",
        researchDir,
        "--confirm-log-dir",
        ledgerDir,
        ...(dial[0] === "--permutations" ? [] : ["--permutations", "200"]),
        ...dial,
      ];
      const run = await runReader("scripts/confirm-4d.ts", args);
      assertRefusedWritingNothing(run, refusal, researchDir, ledgerDir, dial.join(" "));
    }
  });

  it("an unknown flag leaves no picks artifact", async () => {
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const run = await confirm4d(["--not-a-real-flag", shard("EURGBP")], researchDir, ledgerDir);
    assertRefusedWritingNothing(run, /unknown flag --not-a-real-flag/, researchDir, ledgerDir, "unknown flag");
  });

  it("a second read refused as already read rewrites nothing — and the first froze before it read", async () => {
    const corpus = shard("EURGBP");
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");

    const first = await confirm4d([corpus], researchDir, ledgerDir);
    assertExecuted("scripts/confirm-4d.ts", first);
    assert.equal(first.exitCode, 0, `the first read must succeed:\n${first.stderr}`);
    assert.match(first.stdout, /frozen: 1 picks, 0 capacity-gated/);
    assert.deepEqual(written(researchDir), ["4d-confirm-read.json", "4d-final-picks.json"]);
    const ledgerName = readdirSync(ledgerDir).find((name) => /^confirm-log-.*\.jsonl$/.test(name));
    assert.ok(ledgerName, "the first read must be recorded in the redirected ledger");
    // FROZEN BEFORE OPENED, from the evidence on disk: the picks record
    // must predate the ledger's record of the read. A freeze stamped after
    // the fold was opened is not evidence the held-back rows could not
    // have influenced it.
    const frozenAt = Date.parse(
      (JSON.parse(readFileSync(join(researchDir, "4d-final-picks.json"), "utf8")) as { frozenAt: string }).frozenAt,
    );
    const [entry] = readFileSync(join(ledgerDir, ledgerName), "utf8").trim().split("\n")
      .map((line) => JSON.parse(line) as { readAt: string });
    assert.ok(
      frozenAt <= Date.parse(entry.readAt),
      `the picks were frozen at ${new Date(frozenAt).toISOString()}, after the read at ${entry.readAt}`,
    );

    // The refused re-run. Before the fix it rewrote 4d-final-picks.json
    // with a frozenAt LATER than the recorded read — overwriting the only
    // evidence that the picks were frozen before the fold was opened —
    // and only then refused.
    rmSync(join(researchDir, "4d-final-picks.json"));
    rmSync(join(researchDir, "4d-confirm-read.json"));
    const ledgerBefore = snapshot(ledgerDir);
    const second = await confirm4d([corpus], researchDir, ledgerDir);
    assertExecuted("scripts/confirm-4d.ts", second);
    assert.notEqual(second.exitCode, 0, "a second read without acknowledgement must refuse");
    assert.match(second.stderr, /has already been read 1 time\(s\)/);
    assert.deepEqual(written(researchDir), [], "the refused re-read wrote an artifact");
    assert.doesNotMatch(second.stdout, /frozen:/);
    assert.deepEqual(snapshot(ledgerDir), ledgerBefore, "the refused re-read moved the ledger");
  });
});
