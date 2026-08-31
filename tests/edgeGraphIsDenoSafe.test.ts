import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, normalize, join } from "node:path";
import { describe, it } from "node:test";

/**
 * The Edge functions deploy to DENO. Nothing in their import graph may reach a
 * Node built-in or the `scripts/` tree.
 *
 * THE NEAR-MISS THIS EXISTS FOR (2026-08-31). `learning.ts` needed the Student-t
 * table that D4 had just put in `scripts/sweepStats.ts`, and importing it from
 * there type-checked cleanly, linted cleanly, and passed all 3,067 tests —
 * while dragging `node:readline` and `node:fs` into the deployed analyzer.
 *
 * Every local gate is blind to it. `npm run check` type-checks both trees
 * together, so a cross-tree import is legal there; `npm run build` builds the
 * FRONTEND; and the tests run under tsx, which has Node built-ins. The failure
 * would have appeared at `supabase functions deploy`, on the live desk.
 *
 * The table now lives in `supabase/functions/trade-analyzer/confidence.ts` and
 * `sweepStats.ts` re-exports it — the direction it already used for
 * `BAR_CLOCK`.
 */

const ENTRYPOINTS = [
  "supabase/functions/trade-analyzer/index.ts",
  "supabase/functions/market-data/index.ts",
  "supabase/functions/outcome-sync/index.ts",
  "supabase/functions/news-calendar/index.ts",
];

/** Every relative-imported module reachable from `entry`, transitively. */
function graphFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      const target = match[1];
      if (target.startsWith(".")) {
        queue.push(normalize(join(dirname(file), target)));
      }
    }
  }
  return seen;
}

/** Bare-specifier and relative imports, with the file each came from. */
function importsOf(files: Iterable<string>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+"([^"]+)"/g)) {
      out.push([file, match[1]]);
    }
  }
  return out;
}

describe("the deployed Edge graph stays Deno-safe", () => {
  for (const entry of ENTRYPOINTS) {
    it(`${entry} reaches no Node built-in`, () => {
      const graph = graphFrom(entry);
      assert.ok(
        graph.size >= 2,
        `only ${graph.size} module(s) reachable from ${entry} — the walker ` +
          `stopped early and this assertion would pass vacuously`,
      );
      const offenders = importsOf(graph)
        .filter(([, target]) => target.startsWith("node:"));
      assert.deepEqual(
        offenders,
        [],
        `a Node built-in is reachable from a DEPLOYED Edge entrypoint. This ` +
          `type-checks, lints and tests green and fails at deploy time`,
      );
    });

    it(`${entry} never imports from the scripts/ tree`, () => {
      // The specific shape of the near-miss: `scripts/` is Node-only by
      // design (readline, fs, child_process), so ONE such edge is enough.
      const graph = graphFrom(entry);
      const offenders = [...graph].filter((file) => file.startsWith("scripts/"));
      assert.deepEqual(
        offenders,
        [],
        `${entry} pulls in scripts/ modules, which are Node-only by design`,
      );
    });
  }

  it("the t table lives on the engine side, with scripts re-exporting it", () => {
    // Two copies would be the divergence this correction removed. One copy on
    // the LOOSER side would be the deployment break it avoided.
    const table = readFileSync(
      "supabase/functions/trade-analyzer/confidence.ts",
      "utf8",
    );
    assert.match(table, /export function tMultiplier95/);
    const stats = readFileSync("scripts/sweepStats.ts", "utf8");
    assert.match(stats, /export \{ tMultiplier95 \};/);
    assert.doesNotMatch(
      stats,
      /^const T_95/m,
      "scripts/ grew its own copy of the table again",
    );
  });
});
