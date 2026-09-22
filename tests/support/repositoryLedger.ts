import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The repository's own LA-6 ledger directory, and a census proving a test
 * file left it exactly as it found it.
 *
 * Derived the way the binary derives it: from this module's location, never
 * from process.cwd(). No test may write, append or remove anything there.
 * The directory's own mtime leads the listing because it moves on every
 * create and every remove, so a fixture written and deleted inside one test
 * still changes it; each entry's size and mtime catch an append.
 *
 * The listing is taken when this module loads — before the importing file's
 * own body runs, because imports are evaluated first — and compared by a
 * test declared LAST in that file. A writer therefore fails in its own file
 * on every run, rather than racing a guard in another file:
 * tests/confirmFoldSealed.test.ts snapshots all of docs/ at collection and
 * again in after(), and a fixture alive at one snapshot and not the other
 * failed the suite with `fail 0` on 2026-09-21.
 *
 * Declared through a function rather than exported constants so that a file
 * which drives gradeCorpus takes the whole census in one line and cannot
 * import half of it.
 */
const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export const REPOSITORY_LEDGER_DIR = join(REPO_ROOT, "docs/research/confirm-reads");

export function repositoryLedgerListing(): string {
  return [
    `(directory) ${statSync(REPOSITORY_LEDGER_DIR).mtimeMs}`,
    ...readdirSync(REPOSITORY_LEDGER_DIR).sort().map((name) => {
      const stat = statSync(join(REPOSITORY_LEDGER_DIR, name));
      return `${name} ${stat.size} ${stat.mtimeMs}`;
    }),
  ].join("\n");
}

const AT_LOAD = repositoryLedgerListing();

/**
 * Declare the census. Call it at the END of a test file that drives
 * gradeCorpus, so node:test — which runs a file's top-level tests in
 * declaration order — runs it after every other test in that file.
 */
export function declareRepositoryLedgerCensus(): void {
  describe("this file never touches the repository's confirm ledger", () => {
    it("docs/research/confirm-reads lists the same at the end of the file as at its start", () => {
      assert.equal(
        repositoryLedgerListing(),
        AT_LOAD,
        `something wrote into ${REPOSITORY_LEDGER_DIR} while this file ran. A test ` +
          `drives the ledger through gradeCorpus's repositoryLedgerDir (a scratch ` +
          `directory), never the tracked record.`,
      );
    });
  });
}
