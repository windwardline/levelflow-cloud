import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    // The four files that leaked 1,000+ directories in one evening. A static
    // check, with its limit stated: it cannot see a sibling written BESIDE a
    // scratch dir — the `<bank>.lock` case, found only by counting $TMPDIR
    // before and after a run. scratchBank in minuteBankPinned closes that one.
    for (const file of [
      "tests/minuteBankLock.test.ts",
      "tests/minuteBankPinned.test.ts",
      "tests/cacheTopupPinned.test.ts",
      "tests/support/noKeychain.ts",
    ]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /mkdtempSync\(/, `${file} makes a temp dir nobody removes`);
    }
  });
});
