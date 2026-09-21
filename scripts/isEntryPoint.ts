import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether the module at `metaUrl` is the file Node was asked to run.
 *
 * The inline guard this replaces, `import.meta.url === \`file://${process.argv[1]}\``,
 * compares a path Node has already resolved through symlinks against one it
 * has not. Run from anywhere under `/tmp` or `/var/folders` — both symlinks
 * into `/private` on macOS — the two strings differ, `main` is skipped, and
 * the process exits 0 having done nothing. `wl-repo-script` extracts into
 * `mktemp -d`, which is `/var/folders`, so under the pinned launcher the
 * minute bank would have banked nothing twice a day and logged a completed
 * run each time. Found by `tests/minuteBankPinned.test.ts` before it shipped.
 *
 * Only a missing path means "not the entry point" (`tsx --eval`, a REPL). Any
 * other error propagates: a permission fault that silently skipped `main`
 * would be the same failure by a different road.
 */
export function isEntryPoint(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(entry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
