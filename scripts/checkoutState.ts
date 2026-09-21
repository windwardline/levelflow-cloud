import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where a piece of the checkout's IGNORED state lives: the FMP usage ledger,
 * the circuit breaker's marker.
 *
 * Anchored to this module by default, so every existing caller reads exactly
 * the file it always read. `LEVELFLOW_CHECKOUT` overrides it, and exists
 * because the minute bank runs through `wl-repo-script`, which extracts
 * `origin/main` into a temporary tree that carries code and no ignored data.
 * Module-anchored there, the ledger and the breaker resolve to a directory
 * holding neither and deleted on exit: every run starts from an empty ledger
 * and a closed breaker, records its spend into the void, and reports success.
 * That is the governor switched off with nothing to say so.
 *
 * A named checkout that does not exist is REFUSED rather than read as empty,
 * because an empty ledger is not a neutral default — it is a claim that
 * nothing has been spent this month.
 */
const MODULE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function checkoutStatePath(file: string): string {
  const named = process.env.LEVELFLOW_CHECKOUT;
  if (named) {
    if (!existsSync(named)) {
      throw new Error(
        `LEVELFLOW_CHECKOUT names ${named}, which does not exist; refusing to ` +
          `read ${file} from nowhere, because an empty FMP ledger or a closed ` +
          `breaker is not a safe default`,
      );
    }
    return join(named, file);
  }
  return join(MODULE_ROOT, file);
}
