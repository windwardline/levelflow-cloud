import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { describe, it } from "node:test";

import { PARKING_GATE } from "../src/lib/parkingGate.ts";
import { DESK_PARKED } from "../supabase/functions/_shared/deskParking.ts";
import {
  type FmpBudgetDeps,
  mayFetch,
} from "../supabase/functions/trade-analyzer/fmpBudget.ts";

/**
 * The server's own parking line.
 *
 * `PARKING_GATE` turns away SIGNED-OUT arrivals in the browser, and it cannot do
 * more: a live session walks past it, and `?enter` is a doormat. So a parked
 * desk still bought provider bytes for any signed-in session — the chart feed
 * checked only a session and a 120/min rate limit. `DESK_PARKED` is the Edge
 * half: while it is true, every provider request of class `user` is refused
 * before a byte is bought.
 *
 * THE ORDER IS THE CONTRACT. `DESK_PARKED` implies `PARKING_GATE`, so:
 *   - park:   raise PARKING_GATE first (or both in one commit), then §17p's
 *             logout. Never DESK_PARKED first.
 *   - unpark: lower DESK_PARKED alone, let deploy.yml run the full E2E against
 *             the live Edge, and lower PARKING_GATE only after that run is green.
 * The reverse state — Edge open, door closed — is permitted: it is the second
 * push's starting point, and user spend is then bounded by its fail-closed
 * ceiling.
 */

const DESK_SOURCE = "supabase/functions/_shared/deskParking.ts";
const GATE_SOURCE = "src/lib/parkingGate.ts";

function deps(): FmpBudgetDeps & { claims: Array<[string, number]> } {
  const claims: Array<[string, number]> = [];
  return {
    claims,
    claim: async (cls, limit) => {
      claims.push([cls, limit]);
      return [{ allowed: true, limit_bytes: limit, spent_today: 0, trailing_30_bytes: 0 }];
    },
    record: async () => {},
  };
}

describe("the Edge parking line", () => {
  it("never leaves the Edge parked with the door open", () => {
    assert.ok(
      !DESK_PARKED || PARKING_GATE,
      "DESK_PARKED is true while PARKING_GATE is false: signed-out visitors " +
        "reach sign-in and every chart and scan they open is refused. Park by " +
        "raising PARKING_GATE first (or both together); unpark by lowering " +
        "DESK_PARKED first.",
    );
  });

  it("both lines are plain boolean literals, so the scope script and this test can read them", () => {
    assert.match(readFileSync(DESK_SOURCE, "utf8"), /export const DESK_PARKED = (true|false);/);
    assert.match(readFileSync(GATE_SOURCE, "utf8"), /export const PARKING_GATE = (true|false);/);
  });

  it("the Edge is parked", (t) => {
    t.diagnostic(
      `regime: DESK_PARKED=${DESK_PARKED} PARKING_GATE=${PARKING_GATE} — ` +
        (DESK_PARKED
          ? "user-class provider spend is refused at the Edge"
          : "user-class provider spend runs under the fail-closed ceiling"),
    );
    assert.match(
      readFileSync(DESK_SOURCE, "utf8"),
      /export const DESK_PARKED = true;/,
      "DESK_PARKED moved. UNPARKING IS TWO PUSHES: lower DESK_PARKED alone " +
        "(with this pin), let deploy.yml deploy the functions and run the full " +
        "E2E against the live Edge, and lower PARKING_GATE only after that run " +
        "is green. PARKING IS THE REVERSE: raise PARKING_GATE first or both " +
        "together, then run §17p's logout. Confirm the order before updating " +
        "this pin.",
    );
  });

  it("refuses user spend without asking the ledger while parked, and asks it otherwise", async () => {
    const d = deps();
    const decision = await mayFetch(d, "user");
    if (DESK_PARKED) {
      assert.equal(decision.allowed, false);
      assert.equal(decision.allowed === false && decision.refusal, "parked");
      assert.deepEqual(d.claims, [], "a parked refusal must not consult the ledger");
    } else {
      assert.equal(decision.allowed, true);
      assert.equal(d.claims.length, 1);
    }
  });
});

/**
 * The browser bundle must never reach into supabase/. Vercel builds from src/,
 * and the Edge tree reads Deno globals; the only allowed direction is the
 * reverse (playwright.config.ts and tests read DESK_PARKED).
 */
const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])([^"']+)\1/g;

function relativeImportsLandingIn(
  file: string,
  source: string,
  forbiddenRoot: string,
): string[] {
  const hits: string[] = [];
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const specifier = match[2];
    if (!specifier.startsWith(".")) continue;
    const resolved = normalize(join(dirname(file), specifier));
    const rel = relative(".", resolved).split(sep).join("/");
    if (rel === forbiddenRoot || rel.startsWith(`${forbiddenRoot}/`)) {
      hits.push(`${file} -> ${specifier}`);
    }
  }
  return hits;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

describe("src never imports from supabase/", () => {
  it("the resolver flags a relative import into supabase/ and ignores a package name", () => {
    assert.deepEqual(
      relativeImportsLandingIn(
        "src/lib/x.ts",
        `import { DESK_PARKED } from '../../supabase/functions/_shared/deskParking.ts';`,
        "supabase",
      ),
      ["src/lib/x.ts -> ../../supabase/functions/_shared/deskParking.ts"],
    );
    assert.deepEqual(
      relativeImportsLandingIn(
        "src/lib/x.ts",
        `import { createClient } from "@supabase/supabase-js";\nconst m = import("./supabase.ts");`,
        "supabase",
      ),
      [],
    );
    assert.deepEqual(
      relativeImportsLandingIn("src/lib/x.ts", `const m = await import("../../supabase/x.ts");`, "supabase"),
      ["src/lib/x.ts -> ../../supabase/x.ts"],
    );
  });

  it("no file under src/ resolves an import into supabase/", () => {
    const files = walk("src");
    assert.ok(files.length > 50, `only ${files.length} src files found — the walk broke`);
    const offenders = files.flatMap((file) =>
      relativeImportsLandingIn(file, readFileSync(file, "utf8"), "supabase")
    );
    assert.deepEqual(
      offenders,
      [],
      "the browser bundle imports from the Edge tree. Vercel builds src/ and " +
        "the Edge tree reads Deno globals; the parking line crosses in the " +
        "other direction only.",
    );
  });
});
