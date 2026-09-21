import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { noKeychainEnv } from "./support/noKeychain.ts";

/**
 * THE CACHE TOP-UP RUNS `origin/main`, NOT A SHARED WORKING TREE.
 *
 * Its launchd job named `scripts/ops/daily-cache-topup.sh` inside the shared
 * checkout, which concurrent sessions park on feature branches, so the 07:00
 * run executed whatever branch was out. #660 moved the minute bank onto
 * `wl-repo-script` for the same reason; this is the second FMP consumer.
 *
 * Moving it naively would have been the most expensive silent failure in the
 * repository. `DEFAULT_CACHE_DIR` is `.calibration-cache`, a RELATIVE path, and
 * the script `cd`s into its own tree — under `wl-repo-script` a temp tree with
 * no cache in it. `--warm-only --days max` against an empty cache warms the
 * roster from nothing: the scenario this script's own comment records as
 * having "spent a 150 GB allowance in days". The 2 GiB ceiling would stop it
 * — at 2 GiB, every night, into a directory deleted on exit, logged as
 * "top-up complete". And `replay-sweep.ts` carried the entry guard that never
 * matches under `/var/folders`, so the sweep might instead have done nothing
 * at all and exited 0. One defect spends, the other hides; both are closed.
 *
 * EVERY RUN HERE HAS THE KEYCHAIN OUT OF REACH (tests/support/noKeychain.ts).
 * On 2026-09-20 red runs and mutations of the bank's tests fetched six full
 * FMP rosters, two into the production store. The script refuses a missing or
 * temp-rooted cache BEFORE it asks for the key, so a test can only reach the
 * provider if both refusals and the stub fail at once.
 */

const REPO = resolve(".");
const DAILY = "scripts/ops/daily-cache-topup.sh";

function run(
  cmd: string,
  args: string[],
  env: Record<string, string | undefined> = {},
  cwd = REPO,
): { code: number; out: string } {
  const merged: Record<string, string> = {};
  // The suite's own tsx pin (TSX_TSCONFIG_PATH, relative) must not follow a
  // child into an extracted tree; launchd sets no such thing.
  for (const [k, v] of Object.entries({
    ...process.env,
    ...noKeychainEnv(),
    TSX_TSCONFIG_PATH: undefined,
    FMP_API_KEY: "",
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

/** The shape `wl-repo-script` produces: tracked code, no node_modules, no cache. */
function extractedTree(): string {
  const tree = mkdtempSync(join(tmpdir(), "topup-tree-"));
  for (const part of ["scripts", "src", "supabase", "package.json", "tsconfig.json"]) {
    if (existsSync(join(REPO, part))) {
      cpSync(join(REPO, part), join(tree, part), {
        recursive: true,
        // Tracked code only: a working tree can hold ignored data under these.
        filter: (src) => !src.includes(`${join(REPO, "supabase")}/.temp`),
      });
    }
  }
  return tree;
}

describe("the top-up never warms a cache it was not given", () => {
  it("refuses a cache directory that does not exist, before the keychain", () => {
    const missing = join(mkdtempSync(join(tmpdir(), "cacheparent-")), "no-cache");
    const r = run("bash", [DAILY], { LEVELFLOW_CACHE_DIR: missing });
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /refusing to warm a new cache/);
    assert.doesNotMatch(r.out, /keychain unavailable|top-up starting/);
    assert.equal(existsSync(missing), false, "the refused run created the cache anyway");
  });

  it("refuses to run at all when the pinned job names no checkout", () => {
    // The plist without LEVELFLOW_CHECKOUT: everything would default into the
    // extracted tree. The run must stop, and say why, before the keychain.
    const tree = extractedTree();
    const r = run("bash", [join(tree, DAILY)], {
      LEVELFLOW_CHECKOUT: undefined,
      LEVELFLOW_CACHE_DIR: undefined,
    });
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /refusing to warm a new cache/);
    assert.doesNotMatch(r.out, /keychain unavailable|top-up starting/);
    assert.equal(existsSync(join(tree, ".calibration-cache")), false);
  });

  it("refuses a cache under a temporary root, before the keychain", () => {
    // BARRIER 2 of 2, proven with barrier 1 in place: were it missing, the
    // stub would make the run skip with exit 0 and this would fail — without
    // a byte leaving the machine.
    const cache = mkdtempSync(join(tmpdir(), "tmp-cache-"));
    const r = run("bash", [DAILY], { LEVELFLOW_CACHE_DIR: cache });
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /under the temporary root/);
    assert.doesNotMatch(r.out, /keychain unavailable|top-up starting/);
  });
});

describe("a run from the extracted tree uses the checkout's toolchain", () => {
  it("links node_modules from the checkout", () => {
    // The temp-root refusal stops this run before the keychain; the link is
    // made before that point, which is what lets this assert it for free.
    const tree = extractedTree();
    const cache = mkdtempSync(join(tmpdir(), "tmp-cache-"));
    const r = run("bash", [join(tree, DAILY)], {
      LEVELFLOW_CHECKOUT: REPO,
      LEVELFLOW_CACHE_DIR: cache,
    });
    assert.match(r.out, /under the temporary root/, r.out);
    const link = join(tree, "node_modules");
    assert.ok(lstatSync(link).isSymbolicLink(), "node_modules is not a link to the checkout");
    assert.equal(readlinkSync(link), join(REPO, "node_modules"));
  });

  it("the sweep's main actually runs from a tree under /var/folders", () => {
    // `main` validates its arguments before the key and before any I/O, so a
    // malformed --anchor reaching its refusal proves the whole import graph
    // resolved AND the entry guard fired — at no provider cost. With the old
    // guard, the tree's path and Node's resolved module URL never match here,
    // and the process exits 0 having printed nothing.
    const tree = extractedTree();
    execFileSync("ln", ["-s", join(REPO, "node_modules"), join(tree, "node_modules")]);
    const r = run(
      join(tree, "node_modules", ".bin", "tsx"),
      [join(tree, "scripts/replay-sweep.ts"), "--anchor", "not-a-date"],
      { LEVELFLOW_CHECKOUT: REPO },
      tree,
    );
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /--anchor must be YYYY-MM-DD/, "main never ran");
    assert.doesNotMatch(r.out, /Cannot find (module|package)|ERR_MODULE_NOT_FOUND/);
  });
});

describe("what production runs is the pinned, named shape", () => {
  const SH = readFileSync(DAILY, "utf8");

  it("hands the sweep the checkout's cache by name", () => {
    // PINNED IN SOURCE, with the limit stated: exercising the sweep call means
    // getting past the keychain, which is exactly what no test may do. The
    // refusals above prove the cache is checked; this proves it is the one
    // the sweep is given.
    const call = SH.slice(SH.indexOf("replay-sweep.ts"));
    assert.match(call.slice(0, 200), /--cache-dir "\$CACHE"/);
    assert.doesNotMatch(SH, /npx tsx/, "npx can fetch a toolchain; the run must use the linked one");
  });

  it("asks for `security` by name, so the test barrier applies", () => {
    assert.match(SH, /\$\(security find-generic-password/);
    assert.doesNotMatch(SH, /\/usr\/bin\/security/);
  });

  it("resolves its own checkout rather than one machine's path", () => {
    assert.doesNotMatch(SH, /REPO="\/Users\//);
  });

  it("the launchd job runs through wl-repo-script and names the checkout", () => {
    const plist = readFileSync("scripts/ops/com.windwardline.levelflow-cache-topup.plist", "utf8");
    const args = plist.slice(plist.indexOf("<key>ProgramArguments</key>"));
    const array = args.slice(0, args.indexOf("</array>"));
    assert.match(
      array,
      /LEVELFLOW_CHECKOUT=\/Users\/peacock\/Projects\/levelflow-cloud \/Users\/peacock\/\.local\/bin\/wl-repo-script \/Users\/peacock\/Projects\/levelflow-cloud scripts\/ops\/daily-cache-topup\.sh/,
    );
    assert.doesNotMatch(
      array,
      /<string>\/Users\/peacock\/Projects\/levelflow-cloud\/scripts\/ops\/daily-cache-topup\.sh<\/string>/,
      "the job runs the shared working tree again",
    );
  });
});

describe("replay-sweep uses the shared entry guard", () => {
  it("does not carry the symlink-blind comparison", () => {
    const sweep = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(sweep, /if \(isEntryPoint\(import\.meta\.url\)\)/);
    assert.doesNotMatch(sweep, /fileURLToPath\(import\.meta\.url\) === process\.argv\[1\]/);
  });
});
