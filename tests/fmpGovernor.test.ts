import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";

import { OperatorInputError } from "../scripts/flagReader.ts";
import {
  ByteBudgetExceededError,
  createByteBudget,
  DailyCeilingExceededError,
  LedgerUnreadableError,
  LedgerWriteError,
  parseByteBudgetArg,
  ProbeLostError,
  readJsonWithBudget,
  SpendRefusedError,
  UngovernedSpendError,
} from "../scripts/fmpByteBudget.ts";
import { openCircuit, readBreaker } from "../scripts/fmpCircuit.ts";
import {
  BANK_RESERVE_BYTES_PER_DAY,
  BANK_RUN_BOUND_BYTES,
  BASE_PLAN_BYTES,
  bookkeepingRefusal,
  CLASS_DAILY_CEILING_BYTES,
  formatStandDown,
  governedBudget,
  headroomFor,
  maySpend,
  POOL,
  ProviderRefusalError,
  providerRefusal,
  readDay,
  recordUsage,
  rethrowIfFinal,
  spentTrailing30,
  standDownFor,
} from "../scripts/fmpGovernor.ts";
import { fetchFmpJsonWithRetry } from "../scripts/fmpRetry.ts";
import {
  appendRecord,
  bookkeepingFailureCount,
  defaultStatePaths,
  REPO_ROOT,
  reportBookkeepingFailure,
  utcDay,
} from "../scripts/fmpState.ts";
import { BODIES, INVALID_KEY_BODY_PREFIX, tempState } from "./fixtures/fmpTestState.ts";
import { noKeychainEnv } from "./support/noKeychain.ts";
import { scratchDir } from "./support/scratchDir.ts";

/**
 * The owner's rule, mechanised: background work does not touch the allowance
 * unless the app needs it, the bulk of each 30-day window stays unused, and a
 * spender nobody remembered cannot quietly exist.
 *
 * THE POPULATION IS DERIVED, NEVER LISTED. A fifth script written next month
 * is exactly the case a hand-maintained list cannot cover.
 *
 * Every test here runs against temporary state. The one test that names the
 * production path helper checks only what it resolves to, and a census below
 * fails if any other test file names it.
 */

const MIB = 1024 * 1024;
const DAY = 86_400_000;
const AT = Date.parse("2026-09-16T12:00:00Z");
const CAL = "/stable/economic-calendar";

function withoutComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

/** The body of the brace block that opens at or after `from`. */
function blockAt(source: string, from: number): { start: number; end: number; body: string } {
  const open = source.indexOf("{", from);
  let depth = 0;
  for (let at = open; at < source.length; at += 1) {
    if (source[at] === "{") depth += 1;
    if (source[at] === "}") {
      depth -= 1;
      if (depth === 0) return { body: source.slice(open, at + 1), end: at, start: open };
    }
  }
  throw new Error(`unbalanced block at ${from}`);
}

function filesUnder(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.set(path, readFileSync(path, "utf8"));
    }
  };
  walk(root);
  return out;
}

const spenders = readdirSync("scripts")
  .filter((name) => name.endsWith(".ts"))
  .map((name) => `scripts/${name}`)
  .filter((path) => /financialmodelingprep\.com/.test(readFileSync(path, "utf8")))
  .sort();

describe("every FMP spender goes through the governor", () => {
  it("finds the spenders at all", () => {
    // A discovery that returns nothing passes every assertion below.
    assert.ok(spenders.length >= 4, `only ${spenders.length} FMP spender(s) discovered`);
    assert.ok(spenders.includes("scripts/bank-minute-bars.ts"));
  });

  for (const path of spenders.filter((path) => !path.endsWith("bank-minute-bars.ts"))) {
    it(`${path} asks the governor, branches on the answer, and reports refusals`, () => {
      const source = withoutComments(readFileSync(path, "utf8"));
      assert.match(source, /maySpend\(\{/, `${path} never calls the governor`);
      assert.match(source, /!\w+\.allowed/, `${path} ignores the governor's answer`);
      assert.match(source, /providerRefusal\(/, `${path} never records a provider refusal`);
    });
  }

  it("exempts the minute bank from every door, and checks the premise", () => {
    // §21c: the bank "cannot be refused". Its first symbol is its probe, so
    // the most an outage costs is one request per run — and no other
    // consumer's claim, stale entry or race can darken the one store whose
    // loss is permanent.
    const source = withoutComments(readFileSync("scripts/bank-minute-bars.ts", "utf8"));
    assert.doesNotMatch(source, /maySpend\(/, "the bank has a door again");
    assert.doesNotMatch(source, /mayCall\(/, "the bank consults the breaker again");
    assert.match(source, /consumer: "bank"/);
    const notes = [...source.matchAll(/noteRefusal\(/g)];
    assert.equal(notes.length, 1, "the bank reports exactly one refusal: its scout's");
    const scoutAt = source.indexOf("const scout = targets[index++];");
    assert.ok(scoutAt >= 0);
    const failed = blockAt(source, source.indexOf("if (result.fetched === 0)", scoutAt));
    assert.ok(
      notes[0].index! > failed.start && notes[0].index! < failed.end,
      "the refusal is reported from inside the scout's stand-down",
    );
    assert.ok(source.indexOf("closeCircuit(", failed.end) > failed.end, "a successful scout closes the breaker");
    const pool = source.indexOf("Array.from({ length: Math.max(1, concurrency) }");
    assert.ok(pool >= 0, "the worker pool moved");
    const workers = blockAt(source, source.indexOf("async () => {", pool));
    assert.match(workers.body, /runBoundBytes/, "the per-run bound left the worker loop");
  });

  it("records a refusal at every non-ok provider answer, site by site", () => {
    let sites = 0;
    for (const path of spenders) {
      const source = withoutComments(readFileSync(path, "utf8"));
      for (const match of source.matchAll(/if \(!\w+\.ok\) \{/g)) {
        sites += 1;
        assert.match(
          blockAt(source, match.index!).body,
          /providerRefusal\(/,
          `${path}: a non-ok answer at offset ${match.index} is thrown without its body or bytes`,
        );
      }
    }
    assert.ok(sites >= 7, `only ${sites} non-ok sites found — the census broke`);
  });

  it("lets only the minute bank tag its bytes as the bank's", () => {
    const tagging = readdirSync("scripts")
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `scripts/${name}`)
      .filter((path) => readFileSync(path, "utf8").includes('consumer: "bank"'));
    assert.deepEqual(tagging, ["scripts/bank-minute-bars.ts"]);
  });

  it("creates each stand-down token in one place", () => {
    const owners: Record<string, string> = {
      "cacheStandDown:": "scripts/replay-sweep.ts",
      "fmpBookkeepingFailed:": "scripts/fmpState.ts",
      "fmpDeferredRefusal:": "scripts/replay-sweep.ts",
      "fmpStandDown:": "scripts/fmpGovernor.ts",
      "fmpStateUnreadable:": "scripts/fmpState.ts",
    };
    const scripts = readdirSync("scripts").filter((name) => name.endsWith(".ts"));
    for (const [token, owner] of Object.entries(owners)) {
      const found = scripts
        .map((name) => `scripts/${name}`)
        .filter((path) => readFileSync(path, "utf8").includes(token));
      assert.deepEqual(found, [owner], `${token} is created outside ${owner}`);
    }
  });

  it("keeps every test off this machine's live state", () => {
    const helper = ["default", "StatePaths"].join("");
    const naming: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && readFileSync(path, "utf8").includes(helper)) {
          naming.push(path);
        }
      }
    };
    walk("tests");
    assert.deepEqual(naming, ["tests/fmpGovernor.test.ts"]);
    const own = readFileSync("tests/fmpGovernor.test.ts", "utf8").split(helper).length - 1;
    assert.equal(own, 6, "this file names the helper only in its import and its two resolution tests");
  });
});

describe("the state resolves from the checkout, never the cwd", () => {
  // A scratch clone resolving the state against its own cwd reads a CLOSED
  // breaker and an EMPTY ledger, believing the allowance untouched at exactly
  // the moment that belief is most expensive. The pinned jobs run from
  // wl-repo-script's extracted tree, which holds no state at all, so the root
  // is the one scripts/checkoutState.ts names: LEVELFLOW_CHECKOUT when set,
  // refused when it names nothing, and otherwise its own module's tree.
  // Unnamed there, the run gate would find no clean run and re-run both jobs at
  // every login. tests/minuteBankPinned.test.ts runs the resolution in a child.
  it("names the machine's paths under the checkout root", () => {
    assert.deepEqual(defaultStatePaths("/r"), {
      breakerDir: "/r/.fmp-state/breaker",
      canonicalBankDir: "/r/.minute-bank",
      legacyCircuitPath: "/r/.fmp-circuit.json",
      legacyUsagePath: "/r/.fmp-usage.json",
      runsDir: "/r/.fmp-state/runs",
      usageDir: "/r/.fmp-state/usage",
    });
    const named = process.env.LEVELFLOW_CHECKOUT;
    try {
      delete process.env.LEVELFLOW_CHECKOUT;
      assert.equal(defaultStatePaths().usageDir, join(REPO_ROOT, ".fmp-state", "usage"));
      const checkout = scratchDir("fmp-checkout-");
      process.env.LEVELFLOW_CHECKOUT = checkout;
      assert.deepEqual(defaultStatePaths(), {
        breakerDir: join(checkout, ".fmp-state", "breaker"),
        canonicalBankDir: join(checkout, ".minute-bank"),
        legacyCircuitPath: join(checkout, ".fmp-circuit.json"),
        legacyUsagePath: join(checkout, ".fmp-usage.json"),
        runsDir: join(checkout, ".fmp-state", "runs"),
        usageDir: join(checkout, ".fmp-state", "usage"),
      });
      process.env.LEVELFLOW_CHECKOUT = join(checkout, "no-such-checkout");
      // The operator named the checkout, so the refusal is an operator-input
      // error: the entry points that discriminate print it as one line.
      assert.throws(
        () => defaultStatePaths(),
        (error: unknown) =>
          error instanceof OperatorInputError &&
          /LEVELFLOW_CHECKOUT names .*no-such-checkout, which does not exist/.test(error.message),
      );
    } finally {
      if (named === undefined) delete process.env.LEVELFLOW_CHECKOUT;
      else process.env.LEVELFLOW_CHECKOUT = named;
    }
  });

  it("keeps the cwd out of every piece of the resolution", () => {
    const state = readFileSync("scripts/fmpState.ts", "utf8");
    assert.match(state, /export function defaultStatePaths\(root = checkoutRoot\(\)\)/);
    assert.match(state, /fileURLToPath\(import\.meta\.url\)/);
    assert.doesNotMatch(state, /process\.cwd\(\)/);
    const anchor = readFileSync("scripts/checkoutState.ts", "utf8");
    assert.match(anchor, /fileURLToPath\(import\.meta\.url\)/);
    assert.doesNotMatch(anchor, /process\.cwd\(\)/);
    // No other module resolves a state file of its own.
    for (const path of ["scripts/fmpCircuit.ts", "scripts/fmpGovernor.ts", "scripts/fmpRunGate.ts", ...spenders]) {
      assert.doesNotMatch(withoutComments(readFileSync(path, "utf8")), /\.fmp-(usage|circuit)\.json|\.fmp-state/, path);
    }
  });

  // Each binary picks its state root where it calls the helper, and no
  // execution test can see that choice: the bank checks its key before it
  // touches any state, and the wrapper tests run a stub driver. With the bank's
  // root moved into its own code tree the whole suite stayed green, while in
  // production the bank would spend with no ledger, alarm on an empty day and
  // never write the marker the gate reads (2026-09-21, mutation E1). So the
  // call is pinned as source at every discovered spender and at the gate:
  // named once in the import, then only ever called with no root.
  it("lets every binary take its state root from the checkout and no root of its own", () => {
    const helper = ["default", "StatePaths"].join("");
    for (const path of [...spenders, "scripts/fmpRunGate.ts"]) {
      const source = withoutComments(readFileSync(path, "utf8"));
      const named = [...source.matchAll(new RegExp(`\\b${helper}\\b`, "g"))].length;
      const bare = [...source.matchAll(new RegExp(`\\b${helper}\\(\\)`, "g"))].length;
      assert.ok(bare >= 1, `${path} never resolves its state through the helper`);
      assert.equal(
        [...source.matchAll(new RegExp(`\\b${helper}\\s*\\(`, "g"))].length,
        bare,
        `${path} passes the helper a root of its own`,
      );
      assert.equal(named, bare + 1, `${path} names the helper outside its import and its bare calls`);
      assert.match(
        source,
        new RegExp(`import \\{[^}]*\\b${helper}\\b(?!\\s+as\\b)[^}]*\\} from "\\./fmpState\\.ts"`),
        `${path} imports the helper under another name or from another module`,
      );
    }
  });

  // Where the call sits matters as much as how it is made. A checkout that
  // names nothing makes the helper throw, and a call evaluated while the
  // module loads throws before any handler the binary installs. The verifier
  // resolved its state at module scope, and the bank and the probe in their
  // entry blocks, so all three died on a raw stack with no line of their own
  // (2026-09-21, review round 3). A call inside a function runs only when its
  // caller does, inside that caller's error handling. The population is every
  // module that names the helper, so a new caller is covered on arrival.
  it("resolves the state root inside a function, never while a module loads", () => {
    const helper = ["default", "StatePaths"].join("");
    const callers = readdirSync("scripts")
      .filter((name) => name.endsWith(".ts") && name !== "fmpState.ts")
      .map((name) => `scripts/${name}`)
      .filter((path) => new RegExp(`\\b${helper}\\b`).test(withoutComments(readFileSync(path, "utf8"))))
      .sort();
    for (const path of [...spenders, "scripts/fmpRunGate.ts"]) {
      assert.ok(callers.includes(path), `${path} was not discovered as a caller`);
    }
    for (const path of callers) {
      const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const loose: number[] = [];
      let calls = 0;
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === helper) {
          calls += 1;
          let scope: ts.Node | undefined = node.parent;
          while (scope !== undefined && !ts.isFunctionLike(scope)) scope = scope.parent;
          if (scope === undefined) loose.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
      assert.ok(calls >= 1, `${path} names the helper and never calls it`);
      assert.deepEqual(loose, [], `${path} resolves its state while the module loads, at line ${loose.join(", ")}`);
    }
  });
});

describe("every FMP binary refuses a checkout that names nothing in one line", () => {
  const TSX = join("node_modules", ".bin", "tsx");
  // BARRIER: every child here runs with FMP_API_KEY removed, the keychain
  // stubbed out, and fetch replaced before any module loads by a tripwire that
  // exits 97. A red run of these tests executes the binary as it is, so each
  // barrier holds alone.
  const NO_FETCH = (() => {
    const path = join(scratchDir("no-fetch-"), "no-fetch.mjs");
    writeFileSync(
      path,
      'globalThis.fetch = () => { console.error("noFetch: a binary reached fetch"); process.exit(97); };\n',
    );
    return path;
  })();
  const child = (script: string, env: Record<string, string> = {}) => {
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...process.env, ...noKeychainEnv(), ...env })) {
      if (value !== undefined && key !== "FMP_API_KEY") merged[key] = value;
    }
    const result = spawnSync(TSX, ["--import", NO_FETCH, script], { encoding: "utf8", env: merged });
    return { code: result.status, out: `${result.stdout}${result.stderr}` };
  };

  it("has a tripwire that fires", () => {
    const script = join(scratchDir("no-fetch-probe-"), "probe.mts");
    // Loopback's discard port: were the tripwire gone, nothing leaves the machine.
    writeFileSync(script, 'await fetch("http://127.0.0.1:9/");\n');
    const result = child(script);
    assert.equal(result.code, 97, result.out);
    assert.match(result.out, /^noFetch: a binary reached fetch$/m);
  });

  for (const path of spenders) {
    it(`${path} prints the refusal alone, before its key and with no stack`, () => {
      const missing = join(scratchDir("no-checkout-"), "no-such-checkout");
      const result = child(path, { LEVELFLOW_CHECKOUT: missing });
      assert.equal(result.code, 1, result.out);
      const lines = result.out.trim().split("\n");
      assert.equal(lines.length, 1, `more than the refusal was printed:\n${result.out}`);
      assert.match(
        lines[0],
        /^LEVELFLOW_CHECKOUT names .*no-such-checkout, which does not exist; refusing to read the FMP state from nowhere/,
      );
    });
  }
});

describe("the ledger is keyed by consumer and reads its history", () => {
  it("reads the legacy day total as unattributed and never writes it", () => {
    const legacy = { [utcDay(AT)]: 100 };
    const state = tempState({ legacyUsage: legacy });
    const before = readFileSync(state.legacyUsagePath, "utf8");
    recordUsage({ atMs: AT, bytes: 50, consumer: "adhoc", label: "test" }, state);
    maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state });
    const day = readDay(AT, state);
    assert.ok(day.ok);
    assert.equal(day.day.unattributed, 100);
    assert.equal(day.day.adhoc, 50);
    assert.equal(readFileSync(state.legacyUsagePath, "utf8"), before);
  });

  // A torn legacy ledger and a record the reader had to skip both read as zero
  // bytes. That is survivable, since the legacy file is history and one torn
  // line costs only itself, but it was computed and dropped, so nothing ever
  // said the day was counted short.
  it("names a torn legacy ledger and every skipped line, with their count, at the door", () => {
    const state = tempState({ legacyUsage: {} });
    writeFileSync(state.legacyUsagePath, '{"2026-09-16": 12');
    appendRecord(state.usageDir, AT, { consumer: "adhoc", label: "no bytes" });
    appendRecord(state.usageDir, AT, { bytes: -5, consumer: "adhoc" });
    const lines: string[] = [];
    const decision = maySpend({ atMs: AT, consumer: "adhoc", emit: (line) => lines.push(line), label: "test", requiredPaths: [], state });
    assert.equal(decision.allowed, true, "a torn history file is named, not refused");
    assert.ok(
      lines.some((line) => line.startsWith(`fmpStateUnreadable: legacy ledger ${state.legacyUsagePath}: `)),
      lines.join("\n"),
    );
    assert.ok(
      lines.some((line) =>
        line.startsWith(`fmpStateUnreadable: usage ledger ${join(state.usageDir, "2026-09-16.jsonl")}: 2 unreadable line(s)`)
      ),
      lines.join("\n"),
    );
  });

  it("names a torn legacy ledger once in a long run, not at every refresh", () => {
    const state = tempState({ legacyUsage: {} });
    writeFileSync(state.legacyUsagePath, "not json");
    const lines: string[] = [];
    let now = AT;
    const budget = governedBudget(createByteBudget(MIB), {
      consumer: "adhoc",
      emit: (line) => lines.push(line),
      label: "test",
      now: () => now,
      state,
    });
    budget.record(10);
    now = AT + 61_000;
    budget.record(10);
    assert.equal(lines.filter((line) => line.startsWith("fmpStateUnreadable: legacy ledger ")).length, 1, lines.join("\n"));
  });

  it("counts a consumer it does not recognise as unattributed", () => {
    const state = tempState();
    appendRecord(state.usageDir, AT, { at: new Date(AT).toISOString(), atMs: AT, bytes: 70, consumer: "sweep", v: 1 });
    const day = readDay(AT, state);
    assert.ok(day.ok);
    assert.equal(day.day.unattributed, 70);
  });

  it("answers the trailing 30 days FMP bills", () => {
    const state = tempState();
    for (let back = 0; back < 40; back += 1) {
      recordUsage({ atMs: AT - back * DAY, bytes: 1_000, consumer: "topup", label: "test" }, state);
    }
    assert.equal(spentTrailing30(AT, state), 30_000);
  });

  it("stores a pathname, never a query string", () => {
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 5, consumer: "topup", endpointPath: "/stable/quote", label: "test" }, state);
    const text = readFileSync(join(state.usageDir, `${utcDay(AT)}.jsonl`), "utf8");
    assert.match(text, /"path":"\/stable\/quote"/);
    assert.throws(() =>
      recordUsage({ atMs: AT, bytes: 5, consumer: "sweep" as never, label: "test" }, state)
    );
  });
});

describe("the classes share a pool that reserves the bank's day", () => {
  it("pins the owner's constants", () => {
    assert.equal(BANK_RESERVE_BYTES_PER_DAY, 333_333_333);
    assert.equal(BANK_RUN_BOUND_BYTES, 536_870_912);
    assert.deepEqual(CLASS_DAILY_CEILING_BYTES, { adhoc: 268_435_456, topup: 268_435_456 });
    assert.equal(POOL, 870_204_245);
    assert.equal(BASE_PLAN_BYTES, 150 * 1024 * 1024 * 1024);
  });

  it("refuses a top-up that spent its own class while the ad-hoc class still has room", () => {
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 256 * MIB, consumer: "topup", label: "test" }, state);
    const topup = maySpend({ atMs: AT, consumer: "topup", label: "test", requiredPaths: [], state });
    assert.equal(topup.allowed, false);
    if (!topup.allowed) assert.equal(topup.kind, "dailyCeiling");
    assert.equal(maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state }).allowed, true);
  });

  it("reserves the bank's share even on a day the bank has not run", () => {
    // 870,204,245 − 629,145,600 − 333,333,333 < 0.
    const state = tempState({ legacyUsage: { [utcDay(AT)]: 600 * MIB } });
    const adhoc = maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(adhoc.allowed, false);
    // The top-up's own class is untouched, so only its pool term can refuse
    // it, and that term must count the legacy bytes no consumer owns.
    const topup = maySpend({ atMs: AT, consumer: "topup", label: "test", requiredPaths: [], state });
    assert.equal(topup.allowed, false);
    if (!topup.allowed) assert.equal(topup.kind, "dailyCeiling");
  });

  it("charges the pool for bank spend above its reserve", () => {
    // 870,204,245 − (268,435,456 + 209,715,200 + 400,000,000) = −7,946,411.
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 400_000_000, consumer: "bank", label: "test" }, state);
    recordUsage({ atMs: AT, bytes: 256 * MIB, consumer: "topup", label: "test" }, state);
    recordUsage({ atMs: AT, bytes: 200 * MIB, consumer: "adhoc", label: "test" }, state);
    const adhoc = maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(adhoc.allowed, false);
    if (!adhoc.allowed) assert.match(adhoc.reason, /Trailing 30 days/);
  });

  it("does not let an approved ad-hoc raise starve the top-up", () => {
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 5 * 1024 * MIB, consumer: "adhoc", label: "raised" }, state);
    assert.equal(maySpend({ atMs: AT, consumer: "topup", label: "test", requiredPaths: [], state }).allowed, true);
  });

  // The only approved route for a larger run (the documented rebuild passes
  // `--byte-budget 30gb --daily-ceiling 30gb`). With the default ceiling in
  // the pool term in place of the raise, that run passed its door and halted
  // after about 500 MB, and every test stayed green (2026-09-16).
  it("lifts the ad-hoc pool by an owner-approved raise, and leaves the top-up its whole share", () => {
    const state = tempState();
    const GIB = 1024 * MIB;
    recordUsage({ atMs: AT, bytes: 600 * MIB, consumer: "adhoc", label: "raised run" }, state);
    const unraised = maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(unraised.allowed, false, "without the raise the class is spent");
    const raised = maySpend({ atMs: AT, consumer: "adhoc", dailyCeilingBytes: GIB, label: "test", requiredPaths: [], state });
    assert.equal(raised.allowed, true);
    const budget = governedBudget(createByteBudget(GIB), {
      consumer: "adhoc",
      dailyCeilingBytes: GIB,
      label: "test",
      now: () => AT,
      state,
    });
    assert.doesNotThrow(() => budget.record(100 * MIB));
    const day = readDay(AT, state);
    assert.ok(day.ok);
    assert.equal(day.day.adhoc, 700 * MIB);
    assert.equal(headroomFor("topup", day.day), CLASS_DAILY_CEILING_BYTES.topup);
    assert.equal(maySpend({ atMs: AT, consumer: "topup", label: "test", requiredPaths: [], state }).allowed, true);
  });

  it("accepts a raise for the ad-hoc class alone, and only a positive one", () => {
    const state = tempState();
    assert.throws(() =>
      maySpend({ atMs: AT, consumer: "topup", dailyCeilingBytes: 1024 * MIB, label: "test", requiredPaths: [], state })
    );
    assert.throws(() =>
      maySpend({ atMs: AT, consumer: "adhoc", dailyCeilingBytes: 0, label: "test", requiredPaths: [], state })
    );
    assert.throws(() =>
      maySpend({ atMs: AT, consumer: "bank" as never, label: "test", requiredPaths: [], state })
    );
  });
});

describe("a tree with no ledger is refused, not read as untouched", () => {
  it("refuses when neither the sentinel nor the legacy ledger exists", () => {
    const state = tempState({ sentinel: false });
    const decision = maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.kind, "ledgerMissing");
    assert.ok(decision.reason.includes(state.usageDir), "the refusal names the path it looked for");
  });

  it("adopts the legacy ledger by writing the sentinel", () => {
    const state = tempState({ legacyUsage: {}, sentinel: false });
    assert.equal(maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state }).allowed, true);
    assert.equal(existsSync(join(state.usageDir, "ledger.json")), true);
  });

  it("never lets the bank's own records create the sentinel", () => {
    const state = tempState({ sentinel: false });
    recordUsage({ atMs: AT, bytes: 10, consumer: "bank", label: "bank-minute-bars" }, state);
    assert.equal(existsSync(join(state.usageDir, "ledger.json")), false);
  });

  it("refuses when a day file cannot be read", () => {
    const state = tempState();
    mkdirSync(join(state.usageDir, `${utcDay(AT)}.jsonl`));
    const decision = maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(decision.allowed, false);
    if (!decision.allowed) assert.equal(decision.kind, "ledgerUnreadable");
  });

  it("never writes, even with a breaker past its cool-off", () => {
    const state = tempState({ legacyUsage: { [utcDay(AT)]: 10 } });
    recordUsage({ atMs: AT, bytes: 20, consumer: "topup", label: "test" }, state);
    openCircuit({ atMs: AT - 7 * 3_600_000, consumer: "bank", endpointPath: "/stable/historical-chart/1min", kind: "bandwidth", reason: BODIES.bandwidth }, state);
    const root = dirname(dirname(state.usageDir));
    const before = filesUnder(root);
    const decision = maySpend({ atMs: AT, consumer: "adhoc", label: "test", requiredPaths: [], state });
    assert.equal(decision.allowed && decision.probe, true);
    assert.deepEqual(filesUnder(root), before);
  });
});

describe("a governed budget writes every byte first and refuses mid-run", () => {
  it("throws the class ceiling with the crossing bytes already in the ledger", () => {
    const state = tempState();
    const budget = governedBudget(createByteBudget(10 * 1024 * MIB), { consumer: "topup", label: "test", now: () => AT, state });
    budget.record(200 * MIB);
    assert.throws(
      () => budget.record(100 * MIB),
      (error: unknown) => error instanceof DailyCeilingExceededError && error instanceof SpendRefusedError,
    );
    const day = readDay(AT, state);
    assert.ok(day.ok);
    assert.equal(day.day.topup, 300 * MIB);
  });

  it("records the bytes before the run budget refuses them", () => {
    const state = tempState();
    const budget = governedBudget(createByteBudget(100), { consumer: "adhoc", label: "test", now: () => AT, state });
    assert.throws(() => budget.record(150), ByteBudgetExceededError);
    const day = readDay(AT, state);
    assert.ok(day.ok);
    assert.equal(day.day.adhoc, 150);
  });

  it("picks up another process's spend within a minute", () => {
    const state = tempState();
    let now = AT;
    const budget = governedBudget(createByteBudget(10 * 1024 * MIB), { consumer: "adhoc", label: "test", now: () => now, state });
    budget.record(MIB);
    recordUsage({ atMs: AT, bytes: 300 * MIB, consumer: "adhoc", label: "another process" }, state);
    now = AT + 1_000;
    assert.doesNotThrow(() => budget.record(MIB), "the snapshot is not re-read on every record");
    now = AT + 61_000;
    assert.throws(() => budget.record(MIB), DailyCeilingExceededError);
  });

  it("counts this run's own spend between ledger snapshots", () => {
    // 250 MiB spent earlier leaves the top-up 6 MiB. The first record takes a
    // snapshot (251 MiB, 5 MiB left); the next two stay under the 16 MiB
    // refresh step, so only the run's own count can see the crossing.
    const state = tempState();
    recordUsage({ atMs: AT, bytes: 250 * MIB, consumer: "topup", label: "earlier run" }, state);
    const budget = governedBudget(createByteBudget(1024 * MIB), { consumer: "topup", label: "test", now: () => AT, state });
    budget.record(MIB);
    assert.doesNotThrow(() => budget.record(3 * MIB));
    assert.throws(() => budget.record(3 * MIB), DailyCeilingExceededError);
  });

  it("starts the new UTC day from zero mid-run", () => {
    const state = tempState();
    let now = Date.parse("2026-09-16T23:59:59Z");
    const budget = governedBudget(createByteBudget(1024 * MIB), { consumer: "topup", label: "test", now: () => now, state });
    budget.record(250 * MIB);
    now = Date.parse("2026-09-17T00:00:01Z");
    assert.doesNotThrow(() => budget.record(10 * MIB), "yesterday's spend was carried into today");
    const today = readDay(now, state);
    assert.ok(today.ok);
    assert.equal(today.day.topup, 10 * MIB);
  });

  it("refuses an append failure as final, so the ladder issues one request", async () => {
    const state = tempState({ sentinel: false });
    mkdirSync(dirname(state.usageDir), { recursive: true });
    writeFileSync(state.usageDir, "a file where the ledger directory belongs");
    const budget = governedBudget(createByteBudget(MIB), { consumer: "adhoc", label: "test", now: () => AT, state });
    let calls = 0;
    const lines: string[] = [];
    const real = console.error;
    console.error = (...parts: unknown[]) => {
      lines.push(parts.map(String).join(" "));
    };
    try {
      await assert.rejects(
        fetchFmpJsonWithRetry(
          () => {
            calls += 1;
            return Promise.resolve(new Response("[1]"));
          },
          (response) => readJsonWithBudget(response, budget, "/stable/quote"),
          { delaysMs: [1, 1, 1], isRetryableError: (error) => !(error instanceof SpendRefusedError) },
        ),
        LedgerWriteError,
      );
    } finally {
      console.error = real;
    }
    assert.equal(calls, 1);
    assert.ok(lines.some((line) => line.startsWith("fmpBookkeepingFailed: ")), lines.join("\n"));
  });

  it("closes the breaker once per endpoint on the answer's own instant", () => {
    const state = tempState();
    const budget = governedBudget(createByteBudget(MIB), { consumer: "topup", label: "test", now: () => AT, state });
    budget.record(10, { answeredAtMs: AT - 500, endpointPath: CAL });
    budget.record(10, { answeredAtMs: AT - 400, endpointPath: CAL });
    const text = readFileSync(join(state.breakerDir, `${utcDay(AT)}.jsonl`), "utf8");
    const answered = text.split("\n").filter((line) => line.includes('"answered"'));
    assert.equal(answered.length, 1);
    assert.match(answered[0], new RegExp(`"at":${AT - 500}`));
  });
});

describe("a provider refusal is recorded, classified and redacted", () => {
  it("bills the refusal body and opens the breaker on its endpoint when asked", async () => {
    const state = tempState();
    const error = await providerRefusal(new Response(BODIES.restricted, { status: 402 }), {
      atMs: AT,
      consumer: "topup",
      endpointPath: CAL,
      label: "replay-sweep",
      note: true,
      state,
    });
    assert.ok(error instanceof ProviderRefusalError);
    assert.equal(error.status, 402);
    assert.equal(error.kind, "entitlement");
    const day = readDay(AT, state);
    assert.ok(day.ok);
    assert.equal(day.day.topup, new TextEncoder().encode(BODIES.restricted).length);
    const read = readBreaker(AT + 1, state);
    assert.ok(read.ok);
    assert.deepEqual(read.entries.map((entry) => [entry.key, entry.kind, entry.open]), [[CAL, "entitlement", true]]);
    assert.match(error.message, /^FMP request failed \(402\) for \/stable\/economic-calendar: /);
  });

  it("leaves the breaker alone when not asked, and for a rejected key", async () => {
    const state = tempState();
    await providerRefusal(new Response(BODIES.restricted, { status: 402 }), {
      atMs: AT, consumer: "bank", endpointPath: CAL, label: "bank-minute-bars", note: false, state,
    });
    const keyed = await providerRefusal(new Response(INVALID_KEY_BODY_PREFIX, { status: 401 }), {
      atMs: AT, consumer: "adhoc", endpointPath: CAL, label: "test", note: true, state,
    });
    assert.equal(keyed.kind, "invalidKey");
    assert.equal(existsSync(state.breakerDir), false);
  });

  it("redacts a key the provider echoes back", async () => {
    const state = tempState();
    const error = await providerRefusal(
      new Response('{"Error Message": "bad request /stable/quote?symbol=EURUSD&apikey=SECRET123"}', { status: 400 }),
      { atMs: AT, consumer: "adhoc", endpointPath: "/stable/quote", label: "test", note: true, state },
    );
    assert.doesNotMatch(error.message, /SECRET123/);
    assert.doesNotMatch(error.body, /SECRET123/);
    assert.match(error.message, /apikey=REDACTED/);
  });
});

describe("the stand-down token is derived from what refused", () => {
  const refusal = (body: string, status: number) =>
    new ProviderRefusalError({
      body,
      bookkeepingFailed: false,
      bytes: body.length,
      endpointPath: "/stable/x",
      kind: null,
      status,
    });

  it("maps each refusal to its kind and source", async () => {
    const state = tempState();
    const from = (body: string, status: number) =>
      providerRefusal(new Response(body, { status }), {
        atMs: AT, consumer: "adhoc", endpointPath: "/stable/x", label: "test", note: false, state,
      });
    assert.equal(standDownFor(await from(BODIES.bandwidth, 429)), "fmpStandDown: kind=bandwidth source=provider");
    assert.equal(standDownFor(await from(BODIES.restricted, 402)), "fmpStandDown: kind=entitlement source=provider");
    assert.equal(standDownFor(await from(BODIES.suspended, 403)), "fmpStandDown: kind=suspended source=provider");
    assert.equal(standDownFor(await from(INVALID_KEY_BODY_PREFIX, 401)), "fmpStandDown: kind=invalidKey source=provider");
    assert.equal(standDownFor(refusal("", 429)), "fmpStandDown: kind=unclassified source=provider");
    assert.equal(standDownFor(new DailyCeilingExceededError("spent")), "fmpStandDown: kind=dailyCeiling source=governor");
    assert.equal(standDownFor(new LedgerWriteError("no")), "fmpStandDown: kind=ledgerWriteFailed source=governor");
    assert.equal(standDownFor(new LedgerUnreadableError("no")), "fmpStandDown: kind=ledgerUnreadable source=governor");
    assert.equal(standDownFor(new ByteBudgetExceededError(1, 2)), "fmpStandDown: kind=runBudget source=governor");
    assert.equal(standDownFor(new ProbeLostError("entitlement", "lost")), "fmpStandDown: kind=entitlement source=breaker");
    assert.equal(standDownFor(new TypeError("fetch failed")), null);
    assert.equal(standDownFor(new OperatorInputError("typo")), null);
    assert.equal(formatStandDown("bandwidth", "provider"), "fmpStandDown: kind=bandwidth source=provider");
  });

  it("rethrows only what no later request can clear", async () => {
    const state = tempState();
    const from = (body: string, status: number) =>
      providerRefusal(new Response(body, { status }), {
        atMs: AT, consumer: "adhoc", endpointPath: "/stable/x", label: "test", note: false, state,
      });
    assert.throws(() => rethrowIfFinal(new DailyCeilingExceededError("spent")), DailyCeilingExceededError);
    for (const [body, status] of [[BODIES.bandwidth, 429], [BODIES.suspended, 403], [INVALID_KEY_BODY_PREFIX, 401]] as const) {
      const error = await from(body, status);
      assert.throws(() => rethrowIfFinal(error), ProviderRefusalError);
    }
    // An entitlement gap is per endpoint: the verifier's other probes still answer.
    assert.doesNotThrow(() => rethrowIfFinal(refusal(BODIES.restricted, 402)));
    assert.doesNotThrow(() => rethrowIfFinal(new TypeError("fetch failed")));
  });

  it("starts the verifier's budget, fetch and state unset, so nothing reaches the provider ungoverned", () => {
    // They used to default to an unledgered budget and the raw fetch, replaced
    // in main(); any path to the provider before that would have spent outside
    // the ledger and the probe gate.
    const source = withoutComments(readFileSync("scripts/verify-fmp-matches.ts", "utf8"));
    for (const name of ["budget", "providerFetch", "state"]) {
      assert.match(source, new RegExp(`^let ${name}: \\w+ \\| undefined;$`, "m"), `${name} is not declared unset`);
    }
    // main() is the one place they are assigned: exactly once each, there.
    const main = blockAt(source, source.indexOf("async function main("));
    for (const name of ["budget", "providerFetch", "state"]) {
      assert.equal([...main.body.matchAll(new RegExp(`^\\s*${name} = `, "gm"))].length, 1, `main() does not govern ${name} once`);
    }
    // Everywhere else the bare names never appear: every use goes through the
    // refusing accessor.
    const rest = (source.slice(0, main.start) + source.slice(main.end + 1))
      .replace(/function governed\(\)[\s\S]*?\n\}/, "")
      .replace(/^let (budget|providerFetch|state)\b.*$/gm, "");
    assert.doesNotMatch(rest, /(?<![.\w])(budget|providerFetch|state)(?![\w:])/, "a use bypasses the refusing accessor");
    // And the accessor's refusal is final, so the probes' catches rethrow it.
    // The body's brace, not the return type's.
    const governed = blockAt(source, source.indexOf(" {\n", source.indexOf("function governed(")));
    assert.match(governed.body, /throw new UngovernedSpendError\(/);
  });

  it("reads an ungoverned spend as final, with a stand-down token", () => {
    const refusal = new UngovernedSpendError("no governed budget");
    assert.throws(() => rethrowIfFinal(refusal), UngovernedSpendError);
    assert.equal(standDownFor(refusal), "fmpStandDown: kind=ungoverned source=governor");
  });

  it("gives no FMP script a module-scope budget or fetch that is not governed, bar the named exception", () => {
    // Derived over every script, not one path. replay-sweep keeps the plain
    // fetch as its default for a stated reason: an anchored run that proved it
    // cannot reach the provider (scripts/replay-sweep.ts, above the let).
    const EXCEPTIONS = new Map([["scripts/replay-sweep.ts", "an anchored run proved offline keeps the plain fetch"]]);
    const offenders: string[] = [];
    for (const name of readdirSync("scripts", { recursive: true }).map(String).filter((file) => file.endsWith(".ts"))) {
      const file = join("scripts", name);
      const code = withoutComments(readFileSync(file, "utf8"));
      if (!code.includes("financialmodelingprep.com")) continue;
      if (/^let \w*(?:[Bb]udget|[Ff]etch)\w*\b[^;]*=\s*(?:fetch\b|createByteBudget\()/m.test(code) && !EXCEPTIONS.has(file)) {
        offenders.push(file);
      }
    }
    assert.deepEqual(offenders, []);
    for (const file of EXCEPTIONS.keys()) {
      assert.match(withoutComments(readFileSync(file, "utf8")), /^let providerFetch: FetchLike = fetch;$/m, `${file} is excepted but no longer holds the default`);
    }
  });

  it("starts every verifier catch by rethrowing a final refusal", () => {
    const source = readFileSync("scripts/verify-fmp-matches.ts", "utf8");
    const catches = [...source.matchAll(/\bcatch \((\w+)\) \{/g)];
    assert.equal(catches.length, 4);
    for (const match of catches) {
      const body = blockAt(source, match.index!).body;
      assert.match(body, new RegExp(`^\\{\\s*rethrowIfFinal\\(${match[1]}\\);`), body.slice(0, 120));
    }
  });
});

describe("a bookkeeping failure on a path that keeps going still ends the run red", () => {
  // The COT site returns [] and the Treasury warn route continues after
  // providerRefusal prints the token, so a run with no later throw exited 0
  // over spend the ledger never recorded (reproduced 2026-09-16 through the
  // real top-up wrapper).
  it("counts every reported failure in this process", () => {
    const before = bookkeepingFailureCount();
    const lines: string[] = [];
    reportBookkeepingFailure("test usage record", new Error("ENOSPC"), (line) => lines.push(line));
    assert.equal(bookkeepingFailureCount(), before + 1);
    assert.deepEqual(lines, ["fmpBookkeepingFailed: test usage record: ENOSPC"]);
  });

  it("refuses at the end of a run with any failure, and prints the ledger-write token", () => {
    assert.equal(bookkeepingRefusal("replay-sweep", 0), null);
    const refusal = bookkeepingRefusal("replay-sweep", 2);
    assert.ok(refusal instanceof LedgerWriteError);
    assert.match(refusal.message, /^replay-sweep: 2 FMP bookkeeping write\(s\) failed this run/);
    assert.equal(standDownFor(refusal), "fmpStandDown: kind=ledgerWriteFailed source=governor");
  });

  it("reads the count as the last step of the sweep's main and before the verifier's exit", () => {
    const sweep = withoutComments(readFileSync("scripts/replay-sweep.ts", "utf8"));
    const main = blockAt(sweep, sweep.indexOf("async function main()"));
    const body = main.body.trimEnd();
    assert.match(
      body,
      /const bookkeeping = bookkeepingRefusal\("replay-sweep"\);\s*if \(bookkeeping\) \{\s*throw bookkeeping;\s*\}\s*\}$/,
      "the sweep no longer ends main by refusing a run that failed its bookkeeping",
    );
    const verifier = withoutComments(readFileSync("scripts/verify-fmp-matches.ts", "utf8"));
    const refusalAt = verifier.indexOf("const bookkeeping = bookkeepingRefusal(LABEL);\n  if (bookkeeping) throw bookkeeping;");
    const exitAt = verifier.indexOf("process.exit(servedLapse ? 1 : 0);");
    assert.ok(refusalAt >= 0 && exitAt > refusalAt, "the verifier exits before reading its bookkeeping count");
  });
});

describe("the scheduled ceilings sit at or below the approved values", () => {
  it("leaves no 8 GiB day ceiling in the sweep", () => {
    const sweep = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.doesNotMatch(sweep, /dailyLimitBytes/);
    assert.doesNotMatch(sweep, /8 \* 1024 \* 1024 \* 1024/);
  });

  it("runs the nightly top-up as the top-up class under its class ceiling", () => {
    const topup = readFileSync("scripts/ops/daily-cache-topup.sh", "utf8");
    // A backslash-continued command is one command.
    const driver = topup.replace(/\\\n\s*/g, " ").split("\n").find((line) => line.includes("scripts/replay-sweep.ts"));
    assert.ok(driver, "the top-up no longer runs the sweep driver");
    assert.match(driver!, /--spend-class topup/);
    const tokens = driver!.replace(/\$\(|\)|2>&1/g, " ").trim().split(/\s+/);
    assert.ok(parseByteBudgetArg(tokens) <= CLASS_DAILY_CEILING_BYTES.topup);
  });

  it("carries no override or kickstart advertisement in either wrapper", () => {
    for (const path of ["scripts/ops/daily-cache-topup.sh", "scripts/ops/bank-minute-bars-daily.sh"]) {
      const source = readFileSync(path, "utf8");
      assert.doesNotMatch(source, /TOPUP_BYTE_BUDGET/, path);
      assert.doesNotMatch(source, /kickstart/, path);
    }
  });
});
