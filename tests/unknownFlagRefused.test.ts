import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
  flagsOnly,
  OperatorInputError,
  positionalArgs,
} from "../scripts/flagReader.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  ARGV_FLAG_OF_PARSER,
  parseByteBudgetArg,
  parseDailyCeilingArg,
} from "../scripts/fmpByteBudget.ts";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import { stratifiedHoldout } from "../scripts/sweepFolds.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
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

/**
 * Every spelling of an argv read (2026-09-22). `process.argv` alone let a
 * reader leave the law by writing `process["argv"]`, `const { argv } =
 * process` or `import { argv } from "node:process"`, and the population
 * floors sat one below the count, so a single reader leaving passed in
 * silence. The process module under another name, and node:util's
 * parseArgs, which reads process.argv when it is given no `args`, are
 * resolved in argvReads.
 */
const ARGV_SPELLINGS: readonly RegExp[] = [
  /\bprocess\s*\??\.\s*argv\b/,
  /\bprocess\s*\??\.?\s*\[\s*(["'`])argv\1\s*\]/,
  /\{[^{}]*\bargv\b[^{}]*\}\s*=\s*(?:globalThis\s*\.\s*)?process\b/,
  /\bimport\s*\{[^}]*\bargv\b[^}]*\}\s*from\s*(["'])(?:node:)?process\1/,
  /\bReflect\s*\.\s*get\s*\(\s*(?:globalThis\s*\.\s*)?process\s*,\s*(["'`])argv\1\s*\)/,
];

const allOf = (pattern: RegExp) => new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);

/** The local names node:util's parseArgs is bound to, and the util namespaces it is reached through. */
const parseArgsBindings = (code: string): { direct: string[]; namespaces: string[] } => {
  const direct: string[] = [];
  const namespaces: string[] = [];
  const UTIL = String.raw`\s*from\s*["'](?:node:)?util["']`;
  for (const [, names] of code.matchAll(new RegExp(String.raw`\bimport\s*(?:\w+\s*,\s*)?\{([^}]*)\}${UTIL}`, "g"))) {
    for (const [, local] of names.matchAll(/\bparseArgs\b(?:\s+as\s+(\w+))?/g)) direct.push(local ?? "parseArgs");
  }
  for (const [, name] of code.matchAll(new RegExp(String.raw`\bimport\s+(?:\*\s+as\s+)?(\w+)\s*(?:,\s*\{[^}]*\})?${UTIL}`, "g"))) {
    namespaces.push(name);
  }
  for (const namespace of namespaces) {
    for (
      const [, names] of code.matchAll(new RegExp(String.raw`\{([^{}]*)\}\s*=\s*${namespace}\b`, "g"))
    ) {
      for (const [, local] of names.matchAll(/\bparseArgs\b(?:\s*:\s*(\w+))?/g)) direct.push(local ?? "parseArgs");
    }
  }
  return { direct, namespaces };
};

/**
 * Every argv read in a source, comments excluded, as the text that reads it
 * and the subscript right after it (`process.argv[1]`). A parseArgs bound
 * from node:util counts from its import: given no `args`, it parses
 * process.argv whole, and nothing at the call says so.
 */
const argvReads = (source: string): string[] => {
  const code = withoutComments(source);
  const reads: string[] = [];
  const collect = (pattern: RegExp) => {
    for (const match of code.matchAll(allOf(pattern))) {
      const after = code.slice((match.index ?? 0) + match[0].length).match(/^\s*\[\s*\d+\s*\]/);
      reads.push(match[0].replace(/\s+/g, "") + (after ? after[0].replace(/\s+/g, "") : ""));
    }
  };
  ARGV_SPELLINGS.forEach(collect);
  // `import proc from "node:process"` or `import * as proc from …`: the same
  // reads, through the alias.
  for (
    const [, alias] of code.matchAll(
      /\bimport\s+(?:\*\s+as\s+)?(\w+)\s+from\s*["'](?:node:)?process["']/g,
    )
  ) {
    collect(
      new RegExp(
        `\\b${alias}\\s*\\??\\.\\s*argv\\b|\\b${alias}\\s*\\[\\s*["'\`]argv["'\`]\\s*\\]|` +
          `\\{[^{}]*\\bargv\\b[^{}]*\\}\\s*=\\s*${alias}\\b`,
      ),
    );
  }
  const { direct, namespaces } = parseArgsBindings(code);
  if (direct.length > 0) reads.push(...direct.map((name) => `parseArgs as ${name}`));
  for (const namespace of namespaces) {
    collect(new RegExp(`\\b${namespace}\\s*\\??\\.\\s*parseArgs\\b|\\b${namespace}\\s*\\[\\s*["'\`]parseArgs["'\`]\\s*\\]`));
  }
  return reads;
};

/** Whether a source reads argv in any spelling above, comments excluded. */
const readsArgv = (source: string): boolean => argvReads(source).length > 0;

/** Every script that reads what an operator typed. */
const ARGV_READERS = scriptFiles.filter((file) => readsArgv(sourceOf(file)));

/**
 * The capability, by its name rather than by a spelling (2026-09-22). A
 * script whose code names `argv` at all either reads it in a spelling above
 * or takes it as a parameter its caller fills, and the second kind is named
 * here with a premise that is checked: it never names the process object, so
 * the argv it sees is one a reader handed it. A spelling nobody listed — a
 * `const p = process; p.argv`, or a parseArgs taken from `await
 * import("node:util")` — names the capability and so lands here, red, by name.
 * What no static read can see is a property name computed at run time; the
 * recorded population below refuses an existing reader that moves to one.
 */
const ARGV_AS_PARAMETER = new Map<string, string>([
  ["scripts/flagReader.ts", "the shared walk: every reader passes it process.argv.slice(2)"],
  ["scripts/fmpByteBudget.ts", "the byte-budget flag parsers: replay-sweep passes them its argv"],
]);
// parseArgs too: node:util reached by a dynamic import, or a require, binds
// it where no spelling above looks, and it reads process.argv by default.
const namesArgv = (source: string) => /\bargv\b|\bparseArgs\b/.test(withoutComments(source));
const namesProcess = (source: string) =>
  /\bprocess\b|["'](?:node:)?process["']/.test(withoutComments(source));

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

/**
 * Readers whose unknown-flag refusal still prints the OperatorInputError with
 * its stack, by name. The one-line law below binds every other reader. Nine
 * entry points were brought under it on 2026-09-22; executing the law then
 * found thirteen more, outside that change's scope, and they are named here
 * rather than skipped (derive-4d has since left). Each premise is CHECKED: a reader that starts
 * refusing in one line fails until its entry is dropped. The set is also
 * pinned to STACK_ON_REFUSAL_RECORDED below, so it shrinks by editing both
 * and cannot grow by one line: a new reader that prints a stack is fixed,
 * not listed.
 */
const STACK_ON_REFUSAL = new Set([
  "scripts/account-type-report.ts",
  "scripts/ag-class-derivation.ts",
  "scripts/confidence-bands.ts",
  "scripts/data-limits.ts",
  "scripts/exclusion-suspects.ts",
  "scripts/feasibility-4d.ts",
  "scripts/geometry-evidence.ts",
  "scripts/grid-totalr.ts",
  "scripts/roster-expectancy-audit.ts",
  "scripts/starvation-audit.ts",
  "scripts/stop-provenance.ts",
  "scripts/threshold-rescue.ts",
]);

/** The twelve of 2026-09-22. Only ever edited to remove a reader that left. */
const STACK_ON_REFUSAL_RECORDED = [
  "scripts/account-type-report.ts",
  "scripts/ag-class-derivation.ts",
  "scripts/confidence-bands.ts",
  "scripts/data-limits.ts",
  "scripts/exclusion-suspects.ts",
  "scripts/feasibility-4d.ts",
  "scripts/geometry-evidence.ts",
  "scripts/grid-totalr.ts",
  "scripts/roster-expectancy-audit.ts",
  "scripts/starvation-audit.ts",
  "scripts/stop-provenance.ts",
  "scripts/threshold-rescue.ts",
];

/**
 * The populations as measured on 2026-09-22, which the derivations must
 * CONTAIN. A floor at the count let a reader leave while another arrived, and
 * named nobody when one left; a recorded path names the one that left. The
 * derivations may grow past these. A reader that legitimately leaves — deleted,
 * or no longer reading argv — leaves its line here in the same commit.
 */
const ARGV_READERS_RECORDED = [
  "scripts/account-type-report.ts",
  "scripts/ag-class-derivation.ts",
  "scripts/arming-bound-cells.ts",
  "scripts/bank-minute-bars.ts",
  "scripts/banked-fraction.ts",
  "scripts/confidence-bands.ts",
  "scripts/confirm-4d.ts",
  "scripts/contained-years.ts",
  "scripts/cost-sensitivity-verdict.ts",
  "scripts/data-limits.ts",
  "scripts/derive-4d.ts",
  "scripts/derive-baselines.ts",
  "scripts/derive-fold-spec.ts",
  "scripts/e4-collapse.ts",
  "scripts/exclusion-suspects.ts",
  "scripts/feasibility-4d.ts",
  "scripts/feed-character.ts",
  "scripts/fmpRunGate.ts",
  "scripts/forex-commission-admission.ts",
  "scripts/forex-commission-conversion.ts",
  "scripts/freeze-candidates.ts",
  "scripts/geometry-evidence.ts",
  "scripts/grid-totalr.ts",
  "scripts/holdout-set.ts",
  "scripts/isEntryPoint.ts",
  "scripts/market-dossier.ts",
  "scripts/payoff-decomposition.ts",
  "scripts/probe-minute-bars.ts",
  "scripts/q4-daily-structure-stop.ts",
  "scripts/recover-minute-bank.ts",
  "scripts/register-verdict.ts",
  "scripts/replay-sweep.ts",
  "scripts/roster-expectancy-audit.ts",
  "scripts/shipped-cell-provenance.ts",
  "scripts/starvation-audit.ts",
  "scripts/stop-provenance.ts",
  "scripts/sweep-analysis.ts",
  "scripts/threshold-rescue.ts",
  "scripts/tuning-folds-summary.ts",
  "scripts/two-arm-reconcile.ts",
  "scripts/verify-cache-clock.ts",
  "scripts/verify-fmp-matches.ts",
  "scripts/verify-rebuild-depth.ts",
];

const ADOPTERS_RECORDED = [
  "scripts/account-type-report.ts",
  "scripts/ag-class-derivation.ts",
  "scripts/bank-minute-bars.ts",
  "scripts/confidence-bands.ts",
  "scripts/confirm-4d.ts",
  "scripts/cost-sensitivity-verdict.ts",
  "scripts/data-limits.ts",
  "scripts/derive-4d.ts",
  "scripts/derive-baselines.ts",
  "scripts/derive-fold-spec.ts",
  "scripts/exclusion-suspects.ts",
  "scripts/feasibility-4d.ts",
  "scripts/fmpRunGate.ts",
  "scripts/geometry-evidence.ts",
  "scripts/grid-totalr.ts",
  "scripts/holdout-set.ts",
  "scripts/market-dossier.ts",
  "scripts/probe-minute-bars.ts",
  "scripts/recover-minute-bank.ts",
  "scripts/register-verdict.ts",
  "scripts/replay-sweep.ts",
  "scripts/roster-expectancy-audit.ts",
  "scripts/starvation-audit.ts",
  "scripts/stop-provenance.ts",
  "scripts/sweep-analysis.ts",
  "scripts/threshold-rescue.ts",
  "scripts/tuning-folds-summary.ts",
  "scripts/two-arm-reconcile.ts",
  "scripts/verify-cache-clock.ts",
  "scripts/verify-fmp-matches.ts",
  "scripts/verify-rebuild-depth.ts",
];

const FLAGS_ONLY_RECORDED = [
  "scripts/bank-minute-bars.ts",
  "scripts/cost-sensitivity-verdict.ts",
  "scripts/derive-baselines.ts",
  "scripts/derive-fold-spec.ts",
  "scripts/fmpRunGate.ts",
  "scripts/market-dossier.ts",
  "scripts/probe-minute-bars.ts",
  "scripts/recover-minute-bank.ts",
  "scripts/register-verdict.ts",
  "scripts/replay-sweep.ts",
  "scripts/sweep-analysis.ts",
  "scripts/two-arm-reconcile.ts",
  "scripts/verify-cache-clock.ts",
  "scripts/verify-fmp-matches.ts",
  "scripts/verify-rebuild-depth.ts",
];

/** A recorded path the derivation no longer finds, by name. */
const departed = (recorded: readonly string[], derived: readonly string[]) =>
  recorded.filter((path) => !derived.includes(path));

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
  // parseArgs declares by option: a `string` option owns the token after it,
  // a `boolean` one owns none.
  for (const [flag, type] of parseArgsOptions(source)) (type === "string" ? value : boolean).push(flag);
  return { boolean, value };
};

/**
 * The options a parseArgs reader declares, as flags with their type: every
 * `name: { … type: "string" | "boolean" … }` in a script that binds
 * node:util's parseArgs. Keyed on the option's own shape, so an options
 * object built apart from the call is read as well as one written inline.
 *
 * Residue, stated: the scan is the whole file, not the options object that
 * reaches the call, so a typed literal elsewhere declares a flag the parser
 * does not know. That is the one direction that could read green, and the
 * executed acceptance run below closes it: it passes every declared flag, and
 * a strict parser refuses the stray one as an "Unknown option", which that run
 * refuses as it does an unknown flag. An option whose type is not a literal is
 * not declared at all, and a read of it is then red as undeclared.
 */
const parseArgsOptions = (source: string): Array<[string, "boolean" | "string"]> => {
  const code = withoutComments(source);
  const { direct, namespaces } = parseArgsBindings(code);
  if (direct.length + namespaces.length === 0) return [];
  return [
    ...code.matchAll(/(["']?)([A-Za-z][\w-]*)\1\s*:\s*\{[^{}]*?\btype\s*:\s*(["'])(string|boolean)\3[^{}]*\}/g),
  ].map((m) => [`--${m[2]}`, m[4] as "boolean" | "string"]);
};

/**
 * The flags a reader READS: every string literal that is a flag and nothing
 * else — `argv.includes("--x")`, `str("--x")`, `soleFlagIndex(argv, "--x")`.
 * A flag named inside a longer message is not a whole literal, so the
 * operator-facing prose that mentions flags does not count. A parseArgs
 * reader reads its options by key off `values` (`values.out`,
 * `values["dry-run"]`), and each key read that way is a flag read.
 *
 * Residue, stated: in a parseArgs reader every `values.<member>` counts,
 * whatever `values` is bound to, so `values.length` or a local array's
 * `values.map` reads as a flag. Each such read is red as undeclared, never
 * green: the over-read fails closed.
 */
const readFlags = (source: string): string[] => {
  const code = withoutComments(source);
  const literal = [...code.matchAll(/(["'`])(--[a-z][\w-]*)\1/g)].map((m) => m[2]);
  const { direct, namespaces } = parseArgsBindings(code);
  const byKey = direct.length + namespaces.length === 0 ? [] : [
    ...parseArgsOptions(source).map(([flag]) => flag),
    ...[...code.matchAll(/\bvalues\s*\??\.\s*([A-Za-z_]\w*)|\bvalues\s*\[\s*(["'`])([\w-]+)\2\s*\]/g)]
      .map((m) => `--${m[1] ?? m[3]}`),
  ];
  return [...new Set([...literal, ...byKey])].sort();
};

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
 * FMP roster each. So the provider key is removed and `security` is
 * shadowed by the refusing stub; a reader that would spend then stops at its
 * own key check, whatever this file is proving. LEVELFLOW_CHECKOUT names the
 * subject's own empty working directory, so the FMP state — the byte
 * ledger, the breaker log, the run markers, which scripts/checkoutState.ts
 * otherwise anchors to this checkout — resolves there too, never to the
 * real ledger, and anything written to it shows in the listing runReader
 * returns.
 *
 * TSX_TSCONFIG_PATH is dropped too: `npm test` exports it RELATIVE, the
 * child resolves it against the temp cwd and dies inside tsx's loader
 * before the reader's first line. The subjects need no tsconfig to run.
 */
const subjectEnv = (checkout: string): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, ...noKeychainEnv() };
  delete env.TSX_TSCONFIG_PATH;
  delete env.FMP_API_KEY;
  env.LEVELFLOW_CHECKOUT = checkout;
  return env;
};

/**
 * Run a reader from an EMPTY temp cwd, returning what it did there.
 *
 * `wrote` is that directory's whole listing rather than a path someone
 * remembered to name, and it sees every default output but one. Most
 * defaults resolve against the cwd (`docs/research/baseline-2026-08-10/…`,
 * `.minute-bank`). Two are anchored to the checkout the script sits in:
 *
 * - the FMP state under `.fmp-state/`, resolved through
 *   scripts/checkoutState.ts. subjectEnv points LEVELFLOW_CHECKOUT at this
 *   same directory, so state a subject resolves lands where `wrote` sees it.
 * - grid-totalr's repository confirm ledger, under
 *   docs/research/confirm-reads. Only a RECORDED read writes it, and no
 *   refusal here reaches one; the confirm-4d cases below that do read
 *   redirect it with --confirm-log-dir.
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
      // resolve, not join: a synthetic reader outside the repo is named by
      // its absolute path.
      [resolve(repoRoot, reader), ...args],
      {
        cwd: elsewhere,
        encoding: "utf8",
        env: subjectEnv(elsewhere),
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
    // Each derivation must CONTAIN the paths it found on 2026-09-22, and a
    // recorded path it no longer finds fails by name. A glob that silently
    // matched nothing fails here too, rather than passing every law below
    // vacuously.
    const executedRecorded = ARGV_READERS_RECORDED.filter((file) => !NOT_OPERATOR_INPUT.has(file));
    for (
      const [name, recorded, derived] of [
        ["argv readers", ARGV_READERS_RECORDED, ARGV_READERS],
        ["executed readers", executedRecorded, EXECUTED],
        ["readers on the shared walk", ADOPTERS_RECORDED, ADOPTERS],
        ["flags-only readers", FLAGS_ONLY_RECORDED, FLAGS_ONLY],
      ] as const
    ) {
      assert.deepEqual(
        departed(recorded, derived),
        [],
        `these left the ${name} the derivation finds — a reader that moved to ` +
          `a spelling nobody reads is outside every law in this file. If one ` +
          `left legitimately, drop its recorded line in the same commit and say why`,
      );
    }
    for (const exempt of [...NOT_OPERATOR_INPUT.keys(), ...FAILS_TOWARD_RUNNING.keys(), ...STACK_ON_REFUSAL]) {
      assert.ok(
        ARGV_READERS.includes(exempt),
        `${exempt} is exempted but no longer reads argv — drop the exemption`,
      );
    }
    // STACK_ON_REFUSAL only shrinks. Growing it would let a new reader print a
    // stack under an operator's typo by adding one line beside the twelve.
    assert.deepEqual(
      [...STACK_ON_REFUSAL].sort(),
      [...STACK_ON_REFUSAL_RECORDED].sort(),
      "STACK_ON_REFUSAL changed. A reader that now refuses in one line leaves " +
        "both lists; a new reader that prints a stack is fixed, never listed",
    );
    // Each exemption's premise, over every key and every spelling of a read:
    // argv[1] and nothing else, and no flag named anywhere in the file.
    for (const [file, why] of NOT_OPERATOR_INPUT) {
      const reads = argvReads(sourceOf(file));
      assert.ok(reads.length > 0, `${file}: no argv read found, so the premise "${why}" checks nothing`);
      assert.deepEqual(
        reads.filter((read) => !/\[1\]$/.test(read)),
        [],
        `${file} reads argv beyond [1] — it now takes operator input and ` +
          `belongs under the law`,
      );
      assert.deepEqual(readFlags(sourceOf(file)), [], `${file} names a flag, so an operator can type one at it`);
    }
    // The capability by its name: a script that names argv reads it in a
    // spelling above, or takes it as a parameter and never names the process.
    const namingArgv = scriptFiles.filter((file) => namesArgv(sourceOf(file)));
    assert.deepEqual(
      namingArgv.filter((file) => !ARGV_READERS.includes(file) && !ARGV_AS_PARAMETER.has(file)),
      [],
      "these name argv or parseArgs in a spelling no reader law sees: add the spelling to " +
        "ARGV_SPELLINGS, or name the file in ARGV_AS_PARAMETER with its reason",
    );
    for (const [file, why] of ARGV_AS_PARAMETER) {
      assert.ok(namingArgv.includes(file), `${file} no longer names argv — drop it from ARGV_AS_PARAMETER`);
      assert.ok(!ARGV_READERS.includes(file), `${file} reads argv itself, so "${why}" no longer holds`);
      assert.ok(!namesProcess(sourceOf(file)), `${file} names the process object, so the argv it sees may be its own`);
    }
    // Pinned by NAME as well as derived: the script that burns the confirm
    // read, its sibling derivation, and the gate both grade through. A
    // reader leaving the shared walk stays in EXECUTED either way; these
    // three may not leave the walk at all.
    for (const reader of ["scripts/confirm-4d.ts", "scripts/derive-4d.ts", "scripts/grid-totalr.ts"]) {
      assert.ok(ADOPTERS.includes(reader), `${reader} must take the shared walk`);
    }
  });

  it("an argv spelling other than process.argv keeps a reader in the population", () => {
    const reads = [
      'const args = process.argv.slice(2);',
      'if (process?.argv[1]) main();',
      'const args = process["argv"].slice(2);',
      "const args = process['argv'].slice(2);",
      'const { argv } = process;',
      'const { argv: raw, env } = globalThis.process;',
      'import { argv } from "node:process";',
      "import { argv, env } from 'process';",
      'import proc from "node:process";\nconst args = proc.argv.slice(2);',
      'import * as proc from "node:process";\nconst { argv } = proc;',
      'const args = Reflect.get(process, "argv").slice(2);',
      // node:util's parseArgs reads process.argv itself when given no args.
      'import { parseArgs } from "node:util";\nconst { values } = parseArgs({ options: {} });',
      "import { inspect, parseArgs as parse } from 'util';\nparse({ options: {} });",
      'import * as util from "node:util";\nconst { values } = util.parseArgs({ options: {} });',
      'import * as util from "util";\nconst { parseArgs } = util;\nparseArgs({ options: {} });',
      'import util from "node:util";\nutil["parseArgs"]({ options: {} });',
    ];
    for (const source of reads) {
      assert.equal(readsArgv(source), true, `not seen as an argv read: ${source}`);
    }
    const notReads = [
      '// process.argv is read by the entry point',
      ' * const { argv } = process;',
      'function run(argv: string[]) { return argv.length; }',
      'import { env } from "node:process";',
      'import proc from "node:process";\nconst home = proc.env.HOME;',
      // A local function that happens to share the name is not node:util's.
      'function parseArgs(argv: string[]) { return argv; }\nparseArgs(["a"]);',
      'import { inspect } from "node:util";\ninspect({});',
      'import * as util from "node:util";\nutil.inspect({});',
    ];
    for (const source of notReads) {
      assert.equal(readsArgv(source), false, `seen as an argv read: ${source}`);
    }
    // parseArgs declares its flags by option and reads them by key.
    const parsed =
      'import { parseArgs } from "node:util";\n' +
      'const options = { out: { type: "string" }, "dry-run": { type: "boolean", short: "n" } } as const;\n' +
      'const { values } = parseArgs({ options });\n' +
      'console.log(values.out, values["dry-run"], values.seed);\n';
    assert.deepEqual(declaredFlags(parsed), { boolean: ["--dry-run"], value: ["--out"] });
    assert.deepEqual(readFlags(parsed), ["--dry-run", "--out", "--seed"]);
    // The same option shape outside a parseArgs reader declares nothing.
    assert.deepEqual(declaredFlags('const options = { out: { type: "string" } };'), { boolean: [], value: [] });
    // A spelling none of the above reads still names the capability, which
    // the population test holds against ARGV_AS_PARAMETER.
    for (
      const source of [
        "const p = process;\nconst args = p.argv.slice(2);",
        'const { parseArgs } = await import("node:util");\nparseArgs({ options: {} });',
      ]
    ) {
      assert.equal(readsArgv(source), false, `premise: no spelling reads ${source}`);
      assert.equal(namesArgv(source), true, `the capability census cannot see ${source}`);
    }
    // The premise check reads the subscript each spelling carries.
    assert.deepEqual(argvReads("if (process.argv[1]) main();"), ["process.argv[1]"]);
    assert.deepEqual(
      argvReads('const { argv } = process;\nconst self = process.argv[1];\nconst rest = process["argv"].slice(2);'),
      ["process.argv[1]", 'process["argv"]', "{argv}=process"],
    );
  });

  it("a parseArgs reader is in the population, and the law refuses it strict or not — executed", async () => {
    // What each parseArgs reader does with a flag it does not know, executed
    // through the same assertions every real reader answers to. strict:false
    // accepts it in silence, the 2026-09-21 fault; the strict default names
    // it as an "option", under a stack. Neither passes.
    for (const [strict, why] of [
      ["false", /accepted a flag it does not know/],
      ["true", /must refuse the token AS an unknown flag/],
    ] as const) {
      const source =
        'import { parseArgs } from "node:util";\n' +
        `const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string" } }, strict: ${strict} });\n` +
        "if (values.out !== undefined) console.error(`out ${String(values.out)}`);\n" +
        "if (positionals.length === 0) { console.error(\"no corpus\"); process.exit(1); }\n";
      assert.equal(readsArgv(source), true, `strict:${strict}: a parseArgs reader must be in the population`);
      assert.deepEqual(declaredFlags(source), { boolean: [], value: ["--out"] });
      const reader = join(scratchDir("parse-args-reader-"), "reader.ts");
      writeFileSync(reader, source);
      const run = await runReader(reader, ["--not-a-real-flag", missingCorpus()]);
      assertExecuted(reader, run);
      if (strict === "false") {
        assert.equal(run.exitCode, 0, "premise: strict:false accepts an unknown flag and runs");
      }
      assert.throws(() => assertRefusesUnknownFlag(reader, run), why, `strict:${strict}: the law let a parseArgs reader through`);
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
      assertRefusesUnknownFlag(reader, run);
    });
  }

  /** The unknown-flag law, as one reader answers it. */
  function assertRefusesUnknownFlag(reader: string, run: Run): void {
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
        `unknown flag — that directory stands in for the cwd its default ` +
        `outputs resolve against and the checkout its FMP state resolves ` +
        `in, so from the repository the same refusal writes into the ` +
        `working tree or the live FMP state`,
    );
    if (!failsTowardRunning) {
      assert.equal(
        run.stdout.trim(),
        "",
        `${reader} reported work it then refused to do`,
      );
    }
    // An operator's typo is ONE line, the refusal alone: a stack under it
    // dresses the typo up as a crash (2026-09-22).
    const refusal = (failsTowardRunning ? run.stdout : run.stderr).trim().split("\n");
    if (STACK_ON_REFUSAL.has(reader)) {
      assert.ok(
        refusal.length > 1,
        `${reader} now refuses an unknown flag in one line — drop it from STACK_ON_REFUSAL`,
      );
    } else {
      assert.equal(
        refusal.length,
        1,
        `${reader} refused an unknown flag in ${refusal.length} lines; an ` +
          `OperatorInputError prints its message alone:\n${refusal.join("\n")}`,
      );
    }
  }

  // The other direction, and the one a mutation that simply deletes the
  // refusal would leave green: every flag the reader USES must still be
  // accepted. Three checks, because each alone has a blind spot.
  //
  // Declared, read from the reader's code: every flag literal it reads must
  // be declared, or the walk refuses a flag the reader honours — dropping
  // `--acknowledge-prior-reads` from confirm-4d's set would reach the
  // operator at the burn. The check sees only a flag the code names, so a
  // boolean is read by name after the walk (`args.includes("--x")`), never
  // set by the walk's own membership test: set that way, a dropped
  // declaration took the reader's only literal with it (five readers until
  // 2026-09-22).
  //
  // Declared, read from a helper: a flag parsed in another module never
  // appears in the reader's code at all. fmpByteBudget exports the flag each
  // argv parser reads, and every caller must declare it.
  //
  // Accepted, executed from the declaration: every declared flag passes the
  // walk. The refusal is sought on stdout as well as stderr, because
  // fmpRunGate prints its refusals as a gateError line on stdout.
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

  it("every caller of fmpByteBudget's argv parsers declares the flag each one reads", () => {
    // The map is true of the parsers, EXECUTED: each one refuses its own
    // flag given twice, by that flag's name.
    for (const [parse, flag] of [
      [parseByteBudgetArg, ARGV_FLAG_OF_PARSER.parseByteBudgetArg],
      [parseDailyCeilingArg, ARGV_FLAG_OF_PARSER.parseDailyCeilingArg],
    ] as const) {
      assert.throws(
        () => parse([flag, "1mb", flag, "2mb"]),
        (error: unknown) => error instanceof Error && error.message.startsWith(`${flag} was given 2 times`),
      );
    }
    // The (parser, caller) pairs of 2026-09-22, which the derivation must
    // contain: a caller that stops being found is named, not counted.
    const recorded = [
      "parseByteBudgetArg scripts/replay-sweep.ts",
      "parseDailyCeilingArg scripts/replay-sweep.ts",
    ];
    const found: string[] = [];
    for (const [parser, flag] of Object.entries(ARGV_FLAG_OF_PARSER)) {
      const calls = new RegExp(`\\b${parser}\\s*\\(`);
      const readers = scriptFiles.filter((file) =>
        file !== "scripts/fmpByteBudget.ts" && calls.test(withoutComments(sourceOf(file)))
      );
      // replay-sweep calls both; a pattern that matched nothing would pass
      // the loop below vacuously.
      assert.ok(readers.includes("scripts/replay-sweep.ts"), `no caller of ${parser} found`);
      for (const reader of readers) {
        found.push(`${parser} ${reader}`);
        assert.ok(
          declaredFlags(sourceOf(reader)).value.includes(flag),
          `${reader} calls ${parser}, which reads ${flag} from argv, and does ` +
            `not declare ${flag} as a value flag — its walk refuses the flag ` +
            `the parser honours`,
        );
      }
    }
    assert.deepEqual(departed(recorded, found), [], "these callers are no longer found");
  });

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
      await assertAcceptsEveryDeclared(reader);
    });
  }

  /** The acceptance law, as one reader answers it. */
  async function assertAcceptsEveryDeclared(reader: string): Promise<void> {
    const declared = declaredFlags(sourceOf(reader));
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
    // node:util's parseArgs names a flag it does not know an "option".
    assert.doesNotMatch(
      run.stderr + run.stdout,
      /unknown ?(?:flag|option)/i,
      `${reader} refuses a flag it declares itself, out of ` +
        `${every.join(" ")} — a guard that refuses everything is not a guard`,
    );
  }

  it("a flag declared outside the parser's options is refused when executed, never read green", async () => {
    // declaredFlags scans the whole file of a parseArgs reader, so a typed
    // literal the parser never sees still counts as declared. Executed, the
    // strict parser refuses that flag as an "Unknown option", and the
    // acceptance law must refuse the reader for it. The control proves the
    // law accepts the same reader without the stray literal.
    const reader = (stray: boolean) => {
      const file = join(scratchDir("parse-args-declared-"), "reader.ts");
      writeFileSync(
        file,
        'import { parseArgs } from "node:util";\n' +
          (stray ? 'const LEGACY = { ghost: { type: "string" } };\nvoid LEGACY;\n' : "") +
          'const { values } = parseArgs({ options: { out: { type: "string" } } });\n' +
          "void values.out;\n",
      );
      return file;
    };
    const straying = reader(true);
    assert.deepEqual(declaredFlags(sourceOf(straying)).value.sort(), ["--ghost", "--out"], "premise: the stray literal reads as declared");
    await assert.rejects(assertAcceptsEveryDeclared(straying), /refuses a flag it declares itself/);
    await assertAcceptsEveryDeclared(reader(false));
  });

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

  it("a reader that declares no flag says so, rather than listing nothing", () => {
    // Five readers pass two empty sets; the list used to render as "the
    // flags this reader knows are ;".
    assert.throws(
      () => positionalArgs(["--nope", "a.jsonl"], new Set(), new Set(), "reader"),
      /the flags this reader knows are none; an unknown flag is refused/,
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

  /** One manifested shard over one market or several, in a directory of its own. */
  const shard = (
    markets: string | readonly string[],
    overrides: { days?: number; requestedSymbols?: string[] | null } = {},
  ): string => {
    const symbols = typeof markets === "string" ? [markets] : [...markets];
    const dir = scratchDir("confirm4d-shard-");
    const corpus = join(dir, "shard.jsonl");
    writeFileSync(corpus, symbols.flatMap(rowsFor).map((row) => JSON.stringify(row)).join("\n") + "\n");
    const requested = overrides.requestedSymbols === undefined
      ? symbols
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
          symbols: symbols.map((symbol) => ({
            calibration: {},
            providerSymbol: symbol,
            series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
            symbol,
          })),
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

  /**
   * An operator's typo is ONE line here as well: the refusal alone, never a
   * stack. The law above holds this only for an unknown flag, and the
   * refusals confirm-4d makes of its own inputs are typos too.
   */
  const assertOneLine = (run: Run, why: string) => {
    const lines = run.stderr.trim().split("\n");
    assert.equal(
      lines.length,
      1,
      `${why}: confirm-4d refused in ${lines.length} lines; an OperatorInputError prints its message alone:\n${lines.join("\n")}`,
    );
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
    // With --targets too: a market the shard carries is on the roster whether
    // or not the request was recorded, so the refusal is the roster door's,
    // never a claim that the target names no market.
    for (const targets of [[], ["--targets", "EURGBP"]]) {
      const researchDir = seededResearchDir();
      const ledgerDir = scratchDir("confirm4d-ledger-");
      const run = await confirm4d([shard("EURGBP", { requestedSymbols: null }), ...targets], researchDir, ledgerDir);
      assertRefusedWritingNothing(run, /carries no requestedSymbols/, researchDir, ledgerDir, `no requested roster ${targets.join(" ")}`);
    }
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
      [["--permutations", "abc"], /--permutations owns the token after it and cannot read "abc" as a number/],
      [["--baseline", ""], /--baseline owns the token after it and got an EMPTY token/],
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
      assertRefusedWritingNothing(run, refusal, researchDir, ledgerDir, JSON.stringify(dial));
      assertOneLine(run, JSON.stringify(dial));
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

  it("a --baseline naming no cell of the grid leaves no picks artifact and the ledger unchanged", async () => {
    // The cube's baseline-exists refusal needs rows, so it stood below the
    // freeze: `--baseline basline` froze the picks and only then refused.
    // The manifests name every cell the sweep ran, so the door can refuse
    // the name before the fold is opened.
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const refusal = /baseline variant "basline" names no cell of the shards' grid/;
    const fresh = await confirm4d([shard("EURGBP"), "--baseline", "basline"], researchDir, ledgerDir);
    assertRefusedWritingNothing(fresh, refusal, researchDir, ledgerDir, "a misspelt baseline");
    assertOneLine(fresh, "a misspelt baseline");

    // And after a burn, where the prior picks and the ledger both exist to
    // be overwritten: acknowledged, the misspelt re-read changes no byte.
    const corpus = shard("EURGBP");
    const first = await confirm4d([corpus], researchDir, ledgerDir);
    assertExecuted("scripts/confirm-4d.ts", first);
    assert.equal(first.exitCode, 0, `the first read must succeed:\n${first.stderr}`);
    const researchBefore = snapshot(researchDir);
    const ledgerBefore = snapshot(ledgerDir);
    const again = await confirm4d(
      [corpus, "--baseline", "basline", "--acknowledge-prior-reads"],
      researchDir,
      ledgerDir,
    );
    assertExecuted("scripts/confirm-4d.ts", again);
    assert.notEqual(again.exitCode, 0, "the misspelt baseline must refuse");
    assert.match(again.stderr, refusal);
    assertOneLine(again, "a misspelt baseline after a burn");
    assert.doesNotMatch(again.stdout, /frozen:/);
    assert.deepEqual(snapshot(researchDir), researchBefore, "the refused re-read rewrote an artifact");
    assert.deepEqual(snapshot(ledgerDir), ledgerBefore, "the refused re-read moved the ledger");
  });

  it("a --targets entry on no shard's roster refuses by name before the freeze, and burns nothing", async () => {
    // Review of c906f75: over a shard of EURGBP and GBPJPY, `--targets
    // EURGBP,GBPJYP` exited 0, froze the picks and appended a recorded read
    // with symbolFilter ["EURGBP","GBPJYP"] and symbolsRead ["EURGBP"]. The
    // corpus's one read went to a typo, and GBPJPY, the market meant, was
    // never read.
    const researchDir = seededResearchDir(["EURGBP", "GBPJPY"]);
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const ledgerBefore = snapshot(ledgerDir);
    const run = await confirm4d([shard(["EURGBP", "GBPJPY"]), "--targets", "EURGBP,GBPJYP"], researchDir, ledgerDir);
    const why = "a misspelt target";
    assertRefusedWritingNothing(run, /--targets names GBPJYP, on no shard's roster/, researchDir, ledgerDir, why);
    // In the script that burns the read, the refusal says what re-running costs.
    assert.match(run.stderr, /and a read over it would still spend the corpus's one confirm read/, `${why}: the refusal lost its consequence`);
    assert.equal(run.exitCode, 1, `${why}: the refusal must exit 1`);
    assert.doesNotMatch(run.stderr, /EURGBP/, `${why}: the refusal named a target that is on the roster`);
    assertOneLine(run, why);
    assert.deepEqual(snapshot(ledgerDir), ledgerBefore, `${why}: the ledger moved`);
  });

  it("a --targets that names no market after the split refuses before the freeze", async () => {
    // `--targets " , "` passes the blank-token guard and splits to nothing.
    // It used to reach the read as an EMPTY filter, freeze the picks, and
    // only then refuse, when the empty cube met the baseline check.
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const ledgerBefore = snapshot(ledgerDir);
    const run = await confirm4d([shard("EURGBP"), "--targets", " , "], researchDir, ledgerDir);
    const why = "an empty target list";
    assertRefusedWritingNothing(run, /--targets " , " names no market/, researchDir, ledgerDir, why);
    assert.equal(run.exitCode, 1, `${why}: the refusal must exit 1`);
    assertOneLine(run, why);
    assert.deepEqual(snapshot(ledgerDir), ledgerBefore, `${why}: the ledger moved`);
  });

  it("--targets reads any market of the roster, requested or swept, on any shard, in any case", async () => {
    // The other direction: a check that refused every target would pass both
    // cases above. The roster is the union over BOTH shards, so each shard
    // contributes a target. USDJPY was requested and never swept: it is on
    // the roster and reads nothing. Two targets are lower case, with spaces.
    const researchDir = seededResearchDir(["EURGBP", "GBPJPY"]);
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const shards = [
      shard("EURGBP", { requestedSymbols: ["EURGBP", "USDJPY"] }),
      shard("GBPJPY"),
    ];
    const run = await confirm4d([...shards, "--targets", " eurgbp , USDJPY,gbpjpy"], researchDir, ledgerDir);
    assertExecuted("scripts/confirm-4d.ts", run);
    assert.equal(run.exitCode, 0, `a target list on the roster must read:\n${run.stderr}`);
    const ledgerName = readdirSync(ledgerDir).find((name) => /^confirm-log-.*\.jsonl$/.test(name));
    assert.ok(ledgerName, "the read must be recorded in the redirected ledger");
    const [entry] = readFileSync(join(ledgerDir, ledgerName), "utf8").trim().split("\n")
      .map((line) => JSON.parse(line) as { symbolFilter: string[] | null; symbolsRead: string[] });
    assert.deepEqual(entry.symbolFilter, ["EURGBP", "GBPJPY", "USDJPY"]);
    assert.deepEqual(entry.symbolsRead, ["EURGBP", "GBPJPY"]);
  });

  it("a corrupt row after an acknowledged re-read's freeze restores the prior picks, byte for byte", async () => {
    // A row the stream cannot parse is found only by reading, so its refusal
    // lands after the freeze. Nothing was recorded, so the freeze is
    // withdrawn: the picks file returns to the bytes it held before the run.
    const corpus = shard("EURGBP");
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const first = await confirm4d([corpus], researchDir, ledgerDir);
    assertExecuted("scripts/confirm-4d.ts", first);
    assert.equal(first.exitCode, 0, `the first read must succeed:\n${first.stderr}`);
    const researchBefore = snapshot(researchDir);
    const ledgerBefore = snapshot(ledgerDir);

    appendFileSync(corpus, "{not a row\n");
    const again = await confirm4d([corpus, "--acknowledge-prior-reads"], researchDir, ledgerDir);
    assertExecuted("scripts/confirm-4d.ts", again);
    assert.notEqual(again.exitCode, 0, "a holed corpus must refuse");
    assert.match(again.stderr, /line \d+ failed to parse — a holed corpus is refused/);
    assert.deepEqual(snapshot(researchDir), researchBefore, "the picks were left re-frozen for a read nobody recorded");
    assert.deepEqual(snapshot(ledgerDir), ledgerBefore, "the failed re-read moved the ledger");
    assert.deepEqual(again.wrote, []);
    // The freeze DID happen before the fold was opened, and says so; the
    // withdrawal is what the operator reads next.
    assert.match(again.stdout, /frozen: 1 picks/);
    assert.match(again.stderr, /4d-final-picks\.json restored to the bytes it held before this run/);
    assert.match(again.stderr, /the read failed after the freeze and recorded nothing, so the freeze is withdrawn/);
  });

  it("a corrupt row on a first read leaves no picks artifact behind", async () => {
    const corpus = shard("EURGBP");
    appendFileSync(corpus, "{not a row\n");
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const run = await confirm4d([corpus], researchDir, ledgerDir);
    assertExecuted("scripts/confirm-4d.ts", run);
    assert.notEqual(run.exitCode, 0, "a holed corpus must refuse");
    assert.match(run.stderr, /line \d+ failed to parse — a holed corpus is refused/);
    assert.deepEqual(written(researchDir), [], "a first read that recorded nothing left picks on disk");
    assert.deepEqual(readdirSync(ledgerDir), [], "the ledger moved on a run that recorded nothing");
    assert.deepEqual(run.wrote, []);
    assert.match(run.stderr, /4d-final-picks\.json removed — there was none before this run/);
    assert.match(run.stderr, /the read failed after the freeze and recorded nothing, so the freeze is withdrawn/);
  });

  it("--holdout-cycle draws its held-out set over the UNION of every shard's roster, in either order", async () => {
    // Two forex rosters of two. A class under three members holds nothing
    // out by stated policy, so either roster alone draws an EMPTY set; their
    // union of four draws one market. A door that resolved the set from the
    // first shard alone would grade nothing, in either order.
    const first = ["EURGBP", "GBPJPY"];
    const second = ["EURUSD", "USDJPY"];
    assert.deepEqual([...stratifiedHoldout(first, getAssetType)], [], "premise: a two-market class holds nothing out");
    assert.deepEqual([...stratifiedHoldout(second, getAssetType)], [], "premise: a two-market class holds nothing out");
    const union = ["EURUSD"];
    assert.deepEqual([...stratifiedHoldout([...first, ...second], getAssetType)], union, "premise: the union holds one out");

    const shards = [shard(first), shard(second)];
    for (const order of [shards, [...shards].reverse()]) {
      const researchDir = seededResearchDir([...first, ...second]);
      const ledgerDir = scratchDir("confirm4d-ledger-");
      // The seeded inputs carry the plain prefix; --holdout-cycle would
      // otherwise read 4d-holdout-*.
      const run = await confirm4d([...order, "--holdout-cycle", "--prefix", "4d"], researchDir, ledgerDir);
      const label = order === shards ? "roster order" : "reversed order";
      assertExecuted("scripts/confirm-4d.ts", run);
      assert.equal(run.exitCode, 0, `${label}: the holdout read must succeed:\n${run.stderr}`);
      const ledgerName = readdirSync(ledgerDir).find((name) => /^confirm-log-.*\.jsonl$/.test(name));
      assert.ok(ledgerName, `${label}: the read must be recorded in the redirected ledger`);
      const [entry] = readFileSync(join(ledgerDir, ledgerName), "utf8").trim().split("\n")
        .map((line) => JSON.parse(line) as { symbolFilter: string[] | null });
      assert.deepEqual(entry.symbolFilter, union, `${label}: the read was filtered to another set`);
    }
  });

  it("--holdout-cycle beside --targets refuses before the freeze: two populations, one read", async () => {
    // Both used to be accepted and --targets won in silence, so the read took
    // the listed markets under the holdout prefix.
    const researchDir = seededResearchDir(["EURGBP", "GBPJPY"]);
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const run = await confirm4d(
      [shard(["EURGBP", "GBPJPY"]), "--holdout-cycle", "--targets", "EURGBP", "--prefix", "4d"],
      researchDir,
      ledgerDir,
    );
    const why = "--holdout-cycle with --targets";
    assertRefusedWritingNothing(run, /--holdout-cycle and --targets name two different populations/, researchDir, ledgerDir, why);
    assertOneLine(run, why);
  });

  it("a holdout draw that holds no market refuses before the freeze", async () => {
    // A two-market forex roster holds nothing out by stated policy. The empty
    // draw is known before any row is read; it used to freeze the picks and
    // refuse only when the empty cube reached the baseline check.
    const researchDir = seededResearchDir(["EURGBP", "GBPJPY"]);
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const run = await confirm4d([shard(["EURGBP", "GBPJPY"]), "--holdout-cycle", "--prefix", "4d"], researchDir, ledgerDir);
    const why = "an empty holdout draw";
    assertRefusedWritingNothing(run, /--holdout-cycle drew no held-out market/, researchDir, ledgerDir, why);
    assertOneLine(run, why);
  });

  for (const [why, args, refusal] of [
    ["the retired --per-market-folds", () => [shard("EURGBP"), "--per-market-folds"], /--per-market-folds was retired/],
    ["a run with no shard", () => [], /confirm-4d: no shard paths given/],
  ] as const) {
    it(`refuses ${why} in one line, before the freeze`, async () => {
      const researchDir = seededResearchDir();
      const ledgerDir = scratchDir("confirm4d-ledger-");
      const run = await confirm4d(args(), researchDir, ledgerDir);
      assertRefusedWritingNothing(run, refusal, researchDir, ledgerDir, why);
      assertOneLine(run, why);
    });
  }

  // A read-only file is writable to root, so the case built on one means nothing there.
  const readOnlyHolds = process.getuid?.() === 0 ? "root writes a read-only file" : false;

  it("a withdrawal that fails is reported beside the refusal, never in place of it", { skip: readOnlyHolds }, async () => {
    // A read-only picks file fails the freeze's own write and then the
    // withdrawal's; the operator is told both, and which file to fix by hand.
    const corpus = shard("EURGBP");
    const researchDir = seededResearchDir();
    const ledgerDir = scratchDir("confirm4d-ledger-");
    const first = await confirm4d([corpus], researchDir, ledgerDir);
    assertExecuted("scripts/confirm-4d.ts", first);
    assert.equal(first.exitCode, 0, `the first read must succeed:\n${first.stderr}`);
    const picks = join(researchDir, "4d-final-picks.json");
    const researchBefore = snapshot(researchDir);
    const ledgerBefore = snapshot(ledgerDir);
    chmodSync(picks, 0o444);
    try {
      const again = await confirm4d([corpus, "--acknowledge-prior-reads"], researchDir, ledgerDir);
      assertExecuted("scripts/confirm-4d.ts", again);
      assert.notEqual(again.exitCode, 0, "a freeze that cannot be written must refuse");
      assert.match(again.stderr, /EACCES|permission denied/i, "the refusal itself must reach the operator");
      assert.match(
        again.stderr,
        /the freeze's own write failed, and the freeze could NOT be withdrawn .*restore .*4d-final-picks\.json by hand/,
      );
      assert.deepEqual(snapshot(researchDir), researchBefore, "a byte of the prior picks moved");
      assert.deepEqual(snapshot(ledgerDir), ledgerBefore, "the ledger moved on a run that read nothing");
    } finally {
      chmodSync(picks, 0o644);
    }
  });

  describe("derive-4d resolves the same population", () => {
    const derive4d = (args: readonly string[], outDir: string) =>
      runReader("scripts/derive-4d.ts", [...args, "--out", join(outDir, "4d-candidates.json"), "--permutations", "200"]);

    for (const [why, args, refusal] of [
      ["a misspelt target", ["--targets", "EURGBP,GBPJYP"], /derive-4d: --targets names GBPJYP, on no shard's roster/],
      ["--holdout-cycle with --targets", ["--holdout-cycle", "--targets", "EURGBP"], /derive-4d: --holdout-cycle and --targets name two different populations/],
      ["an empty holdout draw", ["--holdout-cycle"], /derive-4d: --holdout-cycle drew no held-out market/],
    ] as const) {
      it(`refuses ${why} by name and writes no candidates`, async () => {
        const outDir = scratchDir("derive4d-out-");
        const run = await derive4d([shard(["EURGBP", "GBPJPY"]), ...args], outDir);
        assertExecuted("scripts/derive-4d.ts", run);
        assert.equal(run.exitCode, 1, `${why}: must exit 1:\n${run.stderr}`);
        assert.match(run.stderr, refusal);
        // derive-4d burns nothing, so its refusal names no confirm read.
        assert.doesNotMatch(run.stderr, /confirm read|undefined/, `${why}: a consequence that is not derive-4d's`);
        assert.equal(run.stderr.trim().split("\n").length, 1, `${why}: an operator's typo is one line:\n${run.stderr}`);
        assert.deepEqual(readdirSync(outDir), [], `${why}: candidates were written for a run that refused`);
      });
    }

    for (const [why, args] of [
      ["a value flag that swallows the next flag", ["--seed"]],
      ["the retired --per-market-folds", ["--per-market-folds"]],
    ] as const) {
      it(`refuses ${why} in one line`, async () => {
        const outDir = scratchDir("derive4d-out-");
        const run = await derive4d([shard("EURGBP"), ...args], outDir);
        assertExecuted("scripts/derive-4d.ts", run);
        assert.notEqual(run.exitCode, 0, `${why}: must refuse`);
        assert.equal(run.stderr.trim().split("\n").length, 1, `${why}: an operator's typo is one line:\n${run.stderr}`);
        assert.deepEqual(readdirSync(outDir), [], `${why}: candidates were written for a run that refused`);
      });
    }

    it("refuses a run with no shard in one line", async () => {
      const outDir = scratchDir("derive4d-out-");
      const run = await derive4d([], outDir);
      assertExecuted("scripts/derive-4d.ts", run);
      assert.match(run.stderr, /^derive-4d: no corpus shards given\s*$/);
    });

    it("grades a holdout draw over the union of the shards' rosters, and says which markets", async () => {
      // Either two-market roster alone holds nothing out; their union holds
      // out EURUSD. The log line is the only output that tells a holdout
      // derivation from a full one.
      const first = ["EURGBP", "GBPJPY"];
      const second = ["EURUSD", "USDJPY"];
      assert.deepEqual([...stratifiedHoldout([...first, ...second], getAssetType)], ["EURUSD"], "premise: the union holds one out");
      const outDir = scratchDir("derive4d-out-");
      const run = await derive4d([shard(first), shard(second), "--holdout-cycle"], outDir);
      assertExecuted("scripts/derive-4d.ts", run);
      assert.equal(run.exitCode, 0, `a holdout draw that holds a market must grade:\n${run.stderr}`);
      assert.match(run.stdout, /^holdout cycle: 1 held-out markets -> EURUSD$/m);
      // The population itself, not only its announcement: the candidates file
      // grades the held-out market and nothing else.
      const written = JSON.parse(readFileSync(join(outDir, "4d-candidates.json"), "utf8")) as {
        markets: Record<string, { heldOut: boolean }>;
      };
      assert.deepEqual(Object.keys(written.markets), ["EURUSD"]);
      assert.equal(written.markets.EURUSD!.heldOut, true);
    });

    it("reads a target list on the roster", async () => {
      const outDir = scratchDir("derive4d-out-");
      const run = await derive4d([shard(["EURGBP", "GBPJPY"]), "--targets", "gbpjpy"], outDir);
      assertExecuted("scripts/derive-4d.ts", run);
      assert.equal(run.exitCode, 0, `a target on the roster must grade:\n${run.stderr}`);
      assert.match(run.stdout, /targets: 1 markets/);
    });
  });
});
