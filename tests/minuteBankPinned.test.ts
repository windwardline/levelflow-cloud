import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { noKeychainEnv } from "./support/noKeychain.ts";

/**
 * THE BANK RUNS FROM `origin/main`, NOT FROM A SHARED WORKING TREE.
 *
 * Its launchd job used to name a path inside `~/Projects/levelflow-cloud`,
 * and that checkout is shared: concurrent sessions park it on feature
 * branches routinely, so the 07:20 run executed whatever branch happened to
 * be out. The backups already run through `wl-repo-script`, which extracts
 * `origin/main` into a temporary tree and runs the script from there.
 *
 * Moving the bank there naively would have DISABLED THE FMP GOVERNOR.
 * `.fmp-usage.json` and `.fmp-circuit.json` are located from their module's
 * own path, so inside the extracted tree they resolve to a directory that
 * holds neither and is deleted on exit. Every run would have started from an
 * empty consumption ledger and a closed breaker, written its records into the
 * void, and reported success — with nothing between the bank and another
 * exhausted allowance. The bank directory had the same shape: the bank calls
 * `mkdir(dir, { recursive: true })`, so a defaulted path would have been
 * created fresh, banked into, and deleted.
 *
 * So the rule `wl-repo-script` states for data — code comes from origin, data
 * stays where it lives and is NAMED by the caller — now holds for every piece
 * of state the bank touches: `LEVELFLOW_CHECKOUT` names the checkout whose
 * ignored state is real, and nothing defaults into the extracted tree.
 */

const REPO = resolve(".");
const TSX = join(REPO, "node_modules", ".bin", "tsx");

function run(
  cmd: string,
  args: string[],
  env: Record<string, string | undefined> = {},
  cwd = REPO,
): { code: number; out: string } {
  const merged: Record<string, string> = {};
  // The suite runs under `tsx --tsconfig tsconfig.tests.json`, which reaches
  // children as TSX_TSCONFIG_PATH — a RELATIVE path that, resolved inside an
  // extracted tree, names a file that is not there. launchd sets no such
  // thing, so neither does a test standing in for it.
  // BARRIER 1 of 2: every run in this file has the keychain out of reach
  // (tests/support/noKeychain.ts). An explicit PATH in `env` still wins, but
  // nothing here passes one.
  for (const [k, v] of Object.entries({
    ...process.env,
    ...noKeychainEnv(),
    TSX_TSCONFIG_PATH: undefined,
    ...env,
  })) {
    if (v !== undefined) merged[k] = v;
  }
  try {
    const out = execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      env: merged,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (error) {
    const shell = error as { status?: number; stderr?: string; stdout?: string };
    return { code: shell.status ?? 1, out: `${shell.stdout ?? ""}${shell.stderr ?? ""}` };
  }
}

/**
 * Prints where the two state files resolve. A file rather than `--eval`,
 * because tsx compiles `--eval` as CommonJS and top-level `await` fails there
 * before a single path is printed.
 */
const PRINT_PATHS = (() => {
  const probe = join(mkdtempSync(join(tmpdir(), "state-probe-")), "probe.mts");
  writeFileSync(
    probe,
    `const g = await import(${JSON.stringify(join(REPO, "scripts/fmpGovernor.ts"))});
const c = await import(${JSON.stringify(join(REPO, "scripts/fmpCircuit.ts"))});
console.log("USAGE=" + g.FMP_USAGE_PATH);
console.log("CIRCUIT=" + c.FMP_CIRCUIT_PATH);
`,
  );
  return probe;
})();

/**
 * The shape `wl-repo-script` produces: tracked code, no `node_modules`, no
 * ignored data. Built from the working tree rather than `git archive HEAD` so
 * the test exercises the change under review, not the last commit.
 */
function extractedTree(): string {
  const tree = mkdtempSync(join(tmpdir(), "pinned-tree-"));
  for (const part of ["scripts", "src", "package.json", "tsconfig.json"]) {
    if (existsSync(join(REPO, part))) {
      cpSync(join(REPO, part), join(tree, part), { recursive: true });
    }
  }
  return tree;
}

describe("the governor's state is the checkout's, wherever the code runs", () => {
  it("follows LEVELFLOW_CHECKOUT for the ledger and the breaker", () => {
    const checkout = mkdtempSync(join(tmpdir(), "checkout-"));
    const r = run(TSX, [PRINT_PATHS], { LEVELFLOW_CHECKOUT: checkout });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`USAGE=${checkout}/\\.fmp-usage\\.json`));
    assert.match(r.out, new RegExp(`CIRCUIT=${checkout}/\\.fmp-circuit\\.json`));
  });

  it("keeps the module-anchored default when nothing is named", () => {
    // Every existing caller — sweeps, readers, the analyzer tooling — relies
    // on this, so the override must change nothing for them.
    const r = run(TSX, [PRINT_PATHS], { LEVELFLOW_CHECKOUT: undefined });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, new RegExp(`USAGE=${REPO}/\\.fmp-usage\\.json`));
    assert.match(r.out, new RegExp(`CIRCUIT=${REPO}/\\.fmp-circuit\\.json`));
  });

  it("refuses a named checkout that does not exist, rather than an empty ledger", () => {
    // A typo in a plist must not become a governor that believes nothing has
    // been spent this month.
    const missing = join(tmpdir(), "no-such-checkout-" + process.pid);
    const r = run(TSX, [PRINT_PATHS], { LEVELFLOW_CHECKOUT: missing });
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /LEVELFLOW_CHECKOUT/);
    assert.doesNotMatch(r.out, /USAGE=/);
  });
});

describe("the daily bank never creates its store implicitly", () => {
  it("refuses a bank directory that does not exist, before the lock or the fetch", () => {
    const missing = join(mkdtempSync(join(tmpdir(), "bankparent-")), "no-bank");
    const r = run("bash", ["scripts/ops/bank-minute-bars-daily.sh"], {
      LEVELFLOW_BANK_DIR: missing,
      LEVELFLOW_BANK_LOCK_TIMEOUT: "1",
    });
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /refusing to create a new bank/);
    assert.doesNotMatch(r.out, /minute-bank run starting/);
    assert.equal(existsSync(missing), false, "the refused run created the bank anyway");
  });
});

describe("a run from the extracted tree uses the checkout's toolchain and state", () => {
  it("links node_modules from the checkout, and nothing else leaks in", () => {
    const tree = extractedTree();
    const bank = mkdtempSync(join(tmpdir(), "pinned-bank-"));
    // Hold the lock so the run stops before the keychain and the network:
    // everything this test asserts happens before that point.
    mkdirSync(`${bank}.lock`);
    writeFileSync(join(`${bank}.lock`, "pid"), `${process.pid}\n`);

    const r = run("bash", [join(tree, "scripts/ops/bank-minute-bars-daily.sh")], {
      LEVELFLOW_CHECKOUT: REPO,
      LEVELFLOW_BANK_DIR: bank,
      LEVELFLOW_BANK_LOCK_TIMEOUT: "1",
    });
    assert.match(r.out, /could not acquire the bank lock/, r.out);
    const link = join(tree, "node_modules");
    assert.ok(lstatSync(link).isSymbolicLink(), "node_modules is not a link to the checkout");
    assert.equal(readlinkSync(link), join(REPO, "node_modules"));
  });

  it("refuses to run at all when the pinned job names no checkout", () => {
    // The misconfiguration that matters: the plist without LEVELFLOW_CHECKOUT.
    // Everything would then default into the extracted tree — a bank created
    // there and deleted on exit, a ledger that reads as untouched. The run must
    // stop before any of that, and say why.
    const tree = extractedTree();
    const r = run("bash", [join(tree, "scripts/ops/bank-minute-bars-daily.sh")], {
      LEVELFLOW_CHECKOUT: undefined,
      LEVELFLOW_BANK_DIR: undefined,
      LEVELFLOW_BANK_LOCK_TIMEOUT: "1",
    });
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /refusing to create a new bank/);
    assert.equal(existsSync(join(tree, ".minute-bank")), false);
  });

  it("resolves the bank's whole import graph without the network", () => {
    // ESM resolves every import before `main` runs, and `main` refuses a
    // missing key before any I/O. Reaching that refusal therefore proves the
    // extracted tree can load the bank, at no provider cost. The absolute
    // path matters: the entry guard compares against `process.argv[1]`, and a
    // relative path would skip `main` and pass this vacuously.
    const tree = extractedTree();
    const bank = mkdtempSync(join(tmpdir(), "pinned-bank-"));
    execFileSync("ln", ["-s", join(REPO, "node_modules"), join(tree, "node_modules")]);
    const r = run(
      join(tree, "node_modules", ".bin", "tsx"),
      [join(tree, "scripts/bank-minute-bars.ts"), "--dir", bank],
      { FMP_API_KEY: "", LEVELFLOW_CHECKOUT: REPO },
      tree,
    );
    assert.match(r.out, /FMP_API_KEY is required\./, r.out);
    assert.doesNotMatch(r.out, /Cannot find (module|package)|ERR_MODULE_NOT_FOUND/);
  });
});

describe("the launchd job is the pinned one", () => {
  const PLIST = readFileSync("scripts/ops/com.windwardline.levelflow-minute-bank.plist", "utf8");

  it("runs through wl-repo-script and names the checkout", () => {
    // Source-pinned, deliberately: launchd is the one caller no test can be,
    // and the behaviour above is only true of production if the plist asks
    // for it. Installing the file is a separate step; this pins what it says.
    const args = PLIST.slice(PLIST.indexOf("<key>ProgramArguments</key>"));
    assert.match(args, /wl-repo-script \/Users\/peacock\/Projects\/levelflow-cloud scripts\/ops\/bank-minute-bars-daily\.sh/);
    assert.match(args, /LEVELFLOW_CHECKOUT=\/Users\/peacock\/Projects\/levelflow-cloud /);
    assert.doesNotMatch(
      args.slice(0, args.indexOf("</array>")),
      /<string>\/Users\/peacock\/Projects\/levelflow-cloud\/scripts\/ops\/bank-minute-bars-daily\.sh<\/string>/,
      "the job runs the shared working tree again",
    );
  });
});

describe("no test can spend FMP bandwidth", () => {
  it("keeps the keychain out of reach of every script this suite runs", () => {
    // A HARMLESS probe, deliberately. The first version asked for the key
    // itself with `-w`, which, had the stub ever failed, would have printed
    // the live FMP key into the test output. `security help` proves which
    // binary answers without asking the keychain for anything.
    const r = run("bash", ["-c", "command -v security; security help"]);
    assert.notEqual(r.code, 0, "the real security binary answered a test");
    assert.match(r.out, /no-keychain-/);
    assert.match(r.out, /unreachable from the test suite/);
  });

  it("the daily script asks for `security` by name, so the barrier applies", () => {
    // An absolute path would walk straight past the PATH stub.
    const daily = readFileSync("scripts/ops/bank-minute-bars-daily.sh", "utf8");
    assert.match(daily, /\$\(security find-generic-password/);
    assert.doesNotMatch(daily, /\/usr\/bin\/security/);
  });

  it("the script itself refuses to bank under a temporary directory", () => {
    // BARRIER 2 of 2, proven with barrier 1 still in place: were it missing,
    // the stub would make the run skip with exit 0, and this would fail
    // without a byte leaving the machine.
    const bank = mkdtempSync(join(tmpdir(), "tmp-bank-"));
    const r = run("bash", ["scripts/ops/bank-minute-bars-daily.sh"], {
      LEVELFLOW_BANK_DIR: bank,
      LEVELFLOW_BANK_LOCK_TIMEOUT: "5",
    });
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /under the temporary root/);
    assert.doesNotMatch(r.out, /keychain unavailable|minute-bank run starting/);
  });
});
