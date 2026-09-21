import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A temporary directory that is removed when the test process exits.
 *
 * The suites written on 2026-09-20/21 made mkdtemp directories on every run
 * and never removed them — one evening left 1,000+ of them, about 480 MB,
 * under $TMPDIR, on a machine that runs the suite at every session end.
 * node:test runs each file in its own process, so cleaning up at exit covers
 * every test in the file without an `after` hook in each one.
 *
 * `rmSync` with `recursive` removes a symlink itself and never its target.
 * That matters: the extracted trees here link `node_modules` to the real
 * checkout. tests/scratchDir.test.ts proves it against a canary.
 *
 * A directory that cannot be removed is reported, not thrown: an exception
 * in an exit handler would replace the suite's own result with a stack trace
 * from housekeeping. The report names the path, so nothing fails silently.
 */
const made: string[] = [];

export function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

process.on("exit", () => {
  for (const dir of made.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch (error) {
      console.error(`scratchDir: could not remove ${dir}: ${(error as Error).message}`);
    }
  }
});
