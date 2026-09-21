import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, it } from "node:test";

import {
  assertSpendPermit,
  decideFmpSpend,
  FMP_DAILY_CEILINGS,
  type FmpBudgetDeps,
  FmpSpendPermitError,
  fmpSpendRefusalBody,
  readAndRecord,
  recordFetch,
} from "../supabase/functions/trade-analyzer/fmpBudget.ts";

/**
 * The Edge functions share one allowance and could not see each other's
 * spending. `scripts/fmpGovernor.ts` solved that for the local tooling with a
 * file; ephemeral isolates cannot read a file, so this shares through the
 * database — the pattern `market_bars` proved.
 *
 * THE PRIORITY ORDER IS THE POINT. The standing rule: background work does not
 * touch the allowance unless the app needs it, the bulk of each 30-day window
 * stays unused, and of what IS spent the bulk should be live users generating
 * real trades. A single total cannot express "background yields first".
 *
 * AND IT BINDS NOW. Until 2026-09-16 `mayFetch` had no production caller and
 * failed open, so the ceilings were bookkeeping. Every Edge provider fetch now
 * requires a permit only `mayFetch` mints, one decision per request, failing
 * closed; the guards at the bottom of this file hold that at fetch-site grain.
 */

function deps(over: Partial<FmpBudgetDeps> = {}): FmpBudgetDeps & {
  claims: Array<[string, number]>;
  records: Array<[string, number]>;
} {
  const claims: Array<[string, number]> = [];
  const records: Array<[string, number]> = [];
  return {
    claims,
    records,
    claim: async (cls, limit) => {
      claims.push([cls, limit]);
      return [{
        allowed: true,
        limit_bytes: limit,
        spent_today: 0,
        trailing_30_bytes: 0,
      }];
    },
    record: async (cls, bytes) => {
      records.push([cls, bytes]);
    },
    ...over,
  };
}

async function permitFor(cls: "background" | "user") {
  const decision = await decideFmpSpend(deps(), cls, false);
  assert.equal(decision.allowed, true);
  if (!decision.allowed) throw new Error("unreachable");
  return decision.permit;
}

describe("the ceilings encode the rule, not a preference", () => {
  it("leaves the bulk of the plan unused", () => {
    // 150 GB per trailing 30 days is 5 GB/day at break-even — the rate that
    // consumes the allowance exactly and leaves nothing for growth. The rule
    // is that the BULK stays unused, so the ceilings sum to a fifth of that.
    const total = FMP_DAILY_CEILINGS.user + FMP_DAILY_CEILINGS.background;
    const breakEvenPerDay = (150 * 1024 * 1024 * 1024) / 30;
    assert.ok(
      total <= breakEvenPerDay * 0.25,
      `the ceilings sum to ${(total / 1e6).toFixed(0)} MB/day against a ` +
        `break-even of ${(breakEvenPerDay / 1e6).toFixed(0)} MB/day — that is ` +
        `not "the bulk stays unused"`,
    );
  });

  it("gives the user class the larger share", () => {
    // "Of what IS spent, the bulk should be live users generating real
    // trades." A background share at or above the user's would invert it.
    assert.ok(
      FMP_DAILY_CEILINGS.user > FMP_DAILY_CEILINGS.background * 3,
      "background's share is not decisively smaller, so it does not yield " +
        "first in any meaningful sense",
    );
  });

  it("still affords a real desk", () => {
    // A full 97-market scan is ~6 MB with the store warm. A ceiling that
    // cannot serve a working day is a bug wearing a policy's clothes.
    const fullScanBytes = 6 * 1024 * 1024;
    assert.ok(
      FMP_DAILY_CEILINGS.user / fullScanBytes >= 100,
      `the user ceiling affords only ` +
        `${(FMP_DAILY_CEILINGS.user / fullScanBytes).toFixed(0)} full scans a day`,
    );
  });
});

describe("the decision", () => {
  it("asks with the class's own ceiling", async () => {
    const d = deps();
    await decideFmpSpend(d, "background", false);
    assert.deepEqual(d.claims, [["background", FMP_DAILY_CEILINGS.background]]);
  });

  it("refuses when the class has spent its day, and says what it knows", async () => {
    for (const allowed of [false, "true"] as unknown as boolean[]) {
      // The string "true" is not a yes. Only the boolean the RPC declares is.
      const d = deps({
        claim: async () => [{
          allowed,
          limit_bytes: FMP_DAILY_CEILINGS.background,
          spent_today: FMP_DAILY_CEILINGS.background,
          trailing_30_bytes: 4_000_000_000,
        }],
      });
      const decision = await decideFmpSpend(d, "background", false);
      assert.equal(decision.allowed, false, `allowed=${JSON.stringify(allowed)}`);
      if (decision.allowed) continue;
      assert.equal(decision.refusal, "ceiling");
      assert.equal("permit" in decision, false);
      assert.match(decision.reason, /background has spent its day/);
      assert.match(decision.reason, /Trailing 30 days/);
      assert.equal(decision.spentToday, FMP_DAILY_CEILINGS.background);
      assert.equal(decision.trailing30, 4_000_000_000);
    }
  });

  it("allows with a permit charged to the class that asked", async () => {
    for (const cls of ["background", "user"] as const) {
      const d = deps();
      const decision = await decideFmpSpend(d, cls, false);
      assert.equal(decision.allowed, true);
      if (!decision.allowed) continue;
      assert.equal(decision.permit.consumerClass, cls);
      assert.doesNotThrow(() => assertSpendPermit(decision.permit));
      assert.deepEqual(d.claims, [[cls, FMP_DAILY_CEILINGS[cls]]]);
    }
  });

  it("FAILS CLOSED when the ledger cannot answer, and says so", async (t) => {
    // It used to fail OPEN, on the argument that refusing the desk because the
    // ledger blinked takes the product down to protect a budget. That argument
    // held only while nothing called it. A ledger that cannot answer is now all
    // that stands between a session and the allowance — the same position
    // `claimMarketDataRequest` has always refused from — and the minute bank's
    // loss is permanent while a desk that cannot chart for an hour is not.
    // THE COST, stated: a ledger outage turns off charts, scans and grading.
    const logged = t.mock.method(console, "error", () => {});
    for (const broken of [
      { claim: async () => { throw new Error("ledger down"); } },
      { claim: async () => [] },
      { claim: async () => undefined },
    ]) {
      const d = deps(broken as unknown as Partial<FmpBudgetDeps>);
      const decision = await decideFmpSpend(d, "user", false);
      assert.equal(decision.allowed, false);
      if (decision.allowed) continue;
      assert.equal(decision.refusal, "ledger-unavailable");
      assert.equal("permit" in decision, false);
      assert.match(decision.reason, /ledger/);
      assert.equal(decision.spentToday, null);
      assert.equal(decision.trailing30, null);
    }
    assert.equal(logged.mock.callCount(), 3, "each ledger outage is logged exactly once");
  });

  it("keeps the ledger's own error, redacted, for the operator and not the client", async (t) => {
    // Fail-closed made the cause matter: an outage now turns the desk off, and
    // the fixed sentence cannot say whether it was a 401, a missing function or
    // the network. adminRpcRows throws the response text, and a transport error
    // can carry a URL, so the cause is redacted where it is born.
    const logged = t.mock.method(console, "error", () => {});
    const thrown = 'error sending request for url (https://ref.supabase.co/rest/v1/rpc/claim_fmp_bytes?apikey=S3CR3T): {"code":"PGRST202"}';
    for (const [broken, expected] of [
      [async () => { throw new Error(thrown); }, /PGRST202/],
      [async () => { throw "ledger down"; }, /^ledger down$/],
    ] as const) {
      logged.mock.resetCalls();
      const decision = await decideFmpSpend(deps({ claim: broken as FmpBudgetDeps["claim"] }), "user", false);
      assert.equal(decision.allowed, false);
      if (decision.allowed) continue;
      assert.equal(decision.refusal, "ledger-unavailable");
      assert.match(decision.cause ?? "", expected);
      assert.doesNotMatch(decision.cause ?? "", /S3CR3T/, "the refusal carries an unredacted secret");
      assert.equal(logged.mock.callCount(), 1);
      const line = logged.mock.calls[0].arguments.map(String).join(" ");
      assert.ok(decision.cause !== null && line.includes(decision.cause), `the log line does not carry the cause: ${line}`);
      assert.doesNotMatch(line, /S3CR3T/, "the log line carries an unredacted secret");
      assert.equal("cause" in fmpSpendRefusalBody(decision), false, "the HTTP body carries the ledger's internals");
    }
    const decision = await decideFmpSpend(deps({ claim: async () => { throw new Error(thrown); } }), "user", false);
    assert.ok(!decision.allowed && decision.cause?.includes("apikey=REDACTED"));
  });

  it("bounds the cause at 400 characters, in the refusal and in the log line", async (t) => {
    // An error body can be any length. The cause is cut after it is redacted,
    // and what is logged is the cut, not what the ledger threw.
    const logged = t.mock.method(console, "error", () => {});
    const thrown = `https://ref.supabase.co/rest/v1/rpc/claim_fmp_bytes?apikey=S3CR3T ${"y".repeat(1000)}`;
    const decision = await decideFmpSpend(deps({ claim: async () => { throw new Error(thrown); } }), "user", false);
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    const cause = decision.cause ?? "";
    assert.equal(cause.length, 400, `the cause is ${cause.length} characters, not bounded at 400`);
    assert.ok(cause.includes("?apikey=REDACTED y"), `the cause is not the redacted head of the error: ${cause.slice(0, 90)}`);
    assert.doesNotMatch(cause, /S3CR3T/);
    const kept = cause.length - cause.indexOf(" y") - 1;
    assert.equal(logged.mock.callCount(), 1);
    const line = logged.mock.calls[0].arguments.map(String).join(" ");
    assert.ok(line.includes(cause), "the log line does not carry the bounded cause");
    assert.equal(line.includes("y".repeat(kept + 1)), false, "the log line carries more of the error than the bounded cause");
  });

  it("carries no cause on a refusal nothing threw for", async (t) => {
    t.mock.method(console, "error", () => {});
    const parked = await decideFmpSpend(deps(), "user", true);
    const ceiling = await decideFmpSpend(
      deps({ claim: async () => [{ allowed: false, limit_bytes: 1, spent_today: 1, trailing_30_bytes: 1 }] }),
      "user",
      false,
    );
    const noRow = await decideFmpSpend(deps({ claim: async () => [] }), "user", false);
    for (const refused of [parked, ceiling, noRow]) {
      assert.equal(refused.allowed, false);
      if (refused.allowed) continue;
      assert.equal(refused.cause, null);
    }
  });

  it("refuses user spend while parked, without asking the ledger", async () => {
    const d = deps();
    const decision = await decideFmpSpend(d, "user", true);
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.refusal, "parked");
    assert.equal(decision.consumerClass, "user");
    assert.equal("permit" in decision, false);
    assert.deepEqual(d.claims, [], "a parked refusal consulted the ledger");
  });

  it("does not park background: it runs under its own ceiling (§21i: no coupling with the crons)", async () => {
    const d = deps();
    const decision = await decideFmpSpend(d, "background", true);
    assert.deepEqual(d.claims, [["background", FMP_DAILY_CEILINGS.background]]);
    assert.equal(decision.allowed, true);
  });
});

describe("the permit", () => {
  it("cannot be forged by shape", () => {
    for (const forged of [
      { consumerClass: "user" },
      Object.freeze({ consumerClass: "user" }),
      {},
      undefined,
      null,
    ]) {
      assert.throws(
        () => assertSpendPermit(forged),
        FmpSpendPermitError,
        `a permit mayFetch never minted passed: ${JSON.stringify(forged)}`,
      );
    }
  });

  it("is minted frozen, so a permit for one class cannot be relabelled", async () => {
    const permit = await permitFor("background");
    assert.ok(Object.isFrozen(permit));
    assert.throws(() => {
      (permit as unknown as { consumerClass: string }).consumerClass = "user";
    });
  });

  it("is never minted on a refusal", async () => {
    const decision = await decideFmpSpend(deps(), "user", true);
    assert.equal(decision.allowed, false);
    assert.equal((decision as { permit?: unknown }).permit, undefined);
  });
});

describe("the accounting", () => {
  it("charges the class the permit was minted for", async () => {
    for (const cls of ["background", "user"] as const) {
      const d = deps();
      await recordFetch(d, await permitFor(cls), 4096);
      assert.deepEqual(d.records, [[cls, 4096]]);
    }
  });

  it("ignores a non-cost rather than writing a zero row", async () => {
    const d = deps();
    const permit = await permitFor("user");
    for (const bytes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await recordFetch(d, permit, bytes);
    }
    assert.deepEqual(d.records, []);
  });

  it("never throws on a failed write", async () => {
    // These bytes were spent before they could be counted. Failing the
    // request that already paid for them turns one accounting outage into a
    // user-visible error on a response the desk already holds.
    const d = deps({ record: async () => { throw new Error("down"); } });
    await recordFetch(d, await permitFor("user"), 1024);
  });

  it("measures the body once, for the caller and the ledger", async () => {
    const d = deps();
    const body = await readAndRecord(d, { text: async () => "hello" }, await permitFor("user"));
    assert.equal(body, "hello");
    assert.deepEqual(d.records, [["user", 5]]);
  });

  it("builds the refusal body from the decision, naming the refusal and the budget (§21f)", async () => {
    const ceiling = await decideFmpSpend(
      deps({
        claim: async () => [{ allowed: false, limit_bytes: 10, spent_today: 12, trailing_30_bytes: 99 }],
      }),
      "user",
      false,
    );
    assert.equal(ceiling.allowed, false);
    if (ceiling.allowed) return;
    assert.deepEqual(fmpSpendRefusalBody(ceiling), {
      consumerClass: "user",
      error: "user has spent its day: 0.0 MB of 0.0 MB.",
      fmpSpendRefused: "ceiling",
      limitBytes: 10,
      spentToday: 12,
    });
    // The account-wide figure stays server-side: fmp_usage is readable by no
    // client role, so the body a signed-in caller can fetch must not restate it.
    assert.match(ceiling.reason, /Trailing 30 days/, "the operator's log keeps the trailing figure");
    const wire = JSON.stringify(fmpSpendRefusalBody(ceiling));
    assert.doesNotMatch(wire, /trailing|Trailing/, "no account-wide figure on the wire");
    const big = await decideFmpSpend(
      deps({
        claim: async () => [{ allowed: false, limit_bytes: 800e6, spent_today: 801e6, trailing_30_bytes: 123_456_789_012 }],
      }),
      "user",
      false,
    );
    if (big.allowed) return assert.fail("expected a ceiling refusal");
    assert.doesNotMatch(JSON.stringify(fmpSpendRefusalBody(big)), /123|0\.12|123\.46/, "the trailing total must not leak in any form");
    const parked = await decideFmpSpend(deps(), "user", true);
    assert.equal(parked.allowed, false);
    if (parked.allowed) return;
    assert.equal(fmpSpendRefusalBody(parked).fmpSpendRefused, "parked");
  });
});

// ---------------------------------------------------------------------------
// FETCH-SITE GRAIN. The guards below replace two per-FILE checks that could not
// see a single site: `recordFetch\(` matched anywhere in a file, so deleting
// marketLoader's quote record left the file green on the bars record beside it
// (mutation-proven 2026-09-16). Every guard here reads the Edge tree directly
// (readdirSync, never git) and derives its population; none is a count someone
// edits. The population is only as good as its anchor, so `providerAnchors`
// says what makes a function a site.
// ---------------------------------------------------------------------------

const EDGE_ROOT = "supabase/functions";
const BUDGET_FILE = "supabase/functions/trade-analyzer/fmpBudget.ts";

function edgeFiles(dir = EDGE_ROOT): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) out.push(...edgeFiles(path));
    else if (name.endsWith(".ts")) out.push(path);
  }
  return out;
}

/** Comment lines blanked to spaces, so indexes still line up with the source. */
function codeOf(source: string): string {
  const lines = source.split("\n");
  let inBlock = false;
  return lines.map((line) => {
    const trimmed = line.trimStart();
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
      return " ".repeat(line.length);
    }
    if (trimmed.startsWith("/*")) {
      inBlock = !trimmed.includes("*/", 2);
      return " ".repeat(line.length);
    }
    if (trimmed.startsWith("//")) return " ".repeat(line.length);
    return line;
  }).join("\n");
}

/** Index of the bracket closing the one at `open`, skipping quoted text. */
function closing(code: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  let quote: string | null = null;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

type Block = { end: number; name: string; params: string; start: number; async: boolean };

/** Top-level functions and the Deno.serve handler, each to its closing line. */
function blocksOf(code: string): Block[] {
  const blocks: Block[] = [];
  for (const match of code.matchAll(/^(?:export\s+)?(async\s+)?function\s+(\w+)\s*\(|^Deno\.serve\(/gm)) {
    const start = match.index;
    const name = match[2] ?? "Deno.serve";
    const open = start + match[0].length - 1;
    const close = closing(code, open);
    const params = name === "Deno.serve" ? "" : code.slice(open + 1, close);
    const terminator = name === "Deno.serve" ? "\n});\n" : "\n}\n";
    const found = code.indexOf(terminator, start);
    blocks.push({
      async: Boolean(match[1]),
      end: found === -1 ? code.length : found + terminator.length,
      name,
      params,
      start,
    });
  }
  return blocks;
}

const squash = (text: string) => text.replace(/\s+/g, "");

type AnchorKind = "apikey parameter" | "base URL" | "key value";
/** `at` is relative to the site's body. */
type Site = { anchors: Array<{ at: number; kind: AnchorKind }>; body: string; file: string; name: string; params: string };

/**
 * Where code names the provider. Anchored on the identifiers and the key
 * parameter, never on how a URL is spelled: the first census anchored on the
 * template `${FMP_API_BASE_URL`, so a fetch built by concatenation
 * (`FMP_API_BASE_URL + "/profile"`) was not a site, no guard below applied to
 * it, and it bought bytes without a permit (review mutation R3, 2026-09-21: it
 * survived the whole suite). Three anchors now:
 * - every `FMP_API_BASE_URL` except its one permitted declaration, which (i)
 *   pins to the provider default;
 * - every `apikey` query parameter, set, appended or spelled into a URL;
 * - every use of `FMP_API_KEY`'s VALUE except its declaration. A presence test
 *   (`!FMP_API_KEY`, `Boolean(FMP_API_KEY`) or the verify route's hash
 *   (`keyFingerprint(FMP_API_KEY)`) cannot carry the key onto the wire, so it
 *   may sit anywhere; a value passed on, in a header or anywhere else, is a
 *   site.
 *
 * AND EACH ANCHOR HAS ONE SHAPE. Finding a site is not enough if the site can
 * hand the identifiers to a helper that holds none: review mutation N3
 * (2026-09-21) passed `FMP_API_BASE_URL` and `FMP_API_KEY` to a permit-less
 * `probeProfile(base, key, fetcher)`, which the census could not see. So the
 * base appears only as `${FMP_API_BASE_URL.replace(/\/$/, "")}` inside a URL
 * template, and the key only as the value of
 * `.searchParams.set("apikey", FMP_API_KEY`. Neither shape can be passed on.
 */
const ANCHOR_SHAPE: Record<AnchorKind, (code: string, at: number) => boolean> = {
  "apikey parameter": (code, at) => code.startsWith('.searchParams.set("apikey", FMP_API_KEY', at),
  "base URL": (code, at) => code.slice(at - 2, at) === "${" && code.startsWith('FMP_API_BASE_URL.replace(/\\/$/, "")}', at),
  "key value": (code, at) => code.slice(0, at).endsWith('.searchParams.set("apikey", '),
};
const BASE_DECLARATION =
  /const\s+FMP_API_BASE_URL\s*=\s*Deno\.env\.get\("FMP_API_BASE_URL"\)\s*\?\?\s*"https:\/\/financialmodelingprep\.com\/stable";/g;
const KEY_DECLARATION = /const\s+FMP_API_KEY\s*=\s*Deno\.env\.get\("FMP_API_KEY"\);/g;
const KEY_PRESENCE = ["!", "Boolean(", "keyFingerprint("];

function providerAnchors(code: string): Array<{ at: number; kind: AnchorKind }> {
  const blank = (text: string) => " ".repeat(text.length);
  const scan = code.replace(BASE_DECLARATION, blank).replace(KEY_DECLARATION, blank);
  const anchors: Array<{ at: number; kind: AnchorKind }> = [];
  for (const match of scan.matchAll(/\bFMP_API_BASE_URL\b/g)) {
    anchors.push({ at: match.index, kind: "base URL" });
  }
  for (const match of scan.matchAll(/\.searchParams\s*\.\s*(?:set|append)\(\s*["'`]apikey["'`]|[?&]apikey=/g)) {
    anchors.push({ at: match.index, kind: "apikey parameter" });
  }
  for (const match of scan.matchAll(/\bFMP_API_KEY\b/g)) {
    const before = scan.slice(Math.max(0, match.index - 20), match.index).trimEnd();
    if (KEY_PRESENCE.some((shape) => before.endsWith(shape))) continue;
    anchors.push({ at: match.index, kind: "key value" });
  }
  return anchors;
}

function censusSites() {
  const sites: Site[] = [];
  const unattributed: string[] = [];
  const misshapen: string[] = [];
  const anchorCounts: Record<AnchorKind, number> = { "apikey parameter": 0, "base URL": 0, "key value": 0 };
  for (const file of edgeFiles()) {
    const code = codeOf(readFileSync(file, "utf8"));
    const blocks = blocksOf(code);
    const byName = new Map<string, Site>();
    for (const anchor of providerAnchors(code)) {
      anchorCounts[anchor.kind] += 1;
      const line = code.slice(0, anchor.at).split("\n").length;
      if (!ANCHOR_SHAPE[anchor.kind](code, anchor.at)) {
        misshapen.push(`${file}:${line} (${anchor.kind}): ${squash(code.slice(Math.max(0, anchor.at - 30), anchor.at + 40))}`);
      }
      const block = blocks.find((b) => b.async && b.name !== "Deno.serve" && b.start <= anchor.at && anchor.at < b.end);
      if (!block) {
        unattributed.push(`${file}:${line} (${anchor.kind})`);
        continue;
      }
      let site = byName.get(block.name);
      if (!site) {
        site = { anchors: [], body: code.slice(block.start, block.end), file, name: block.name, params: block.params };
        byName.set(block.name, site);
        sites.push(site);
      }
      site.anchors.push({ at: anchor.at - block.start, kind: anchor.kind });
    }
  }
  return { anchorCounts, misshapen, sites, unattributed };
}

/** The innermost `{…}` holding `at`, as [open, close] indexes, or null at the top. */
function enclosingBlock(code: string, at: number): [number, number] | null {
  for (let open = code.lastIndexOf("{", at); open >= 0; open = code.lastIndexOf("{", open - 1)) {
    const close = closing(code, open);
    if (close > at) return [open, close];
  }
  return null;
}

/**
 * The one request a site makes, and every use of the URL it sends.
 *
 * A site builds one URL in one declaration, sets its parameters, and hands it
 * to one fetch. Anything else a site does with that URL is how a second
 * request gets made with the key already on it: review mutation N1 re-used
 * `endpoint.toString()` for a second fetch, and a helper handed `endpoint`
 * needs no anchor of its own to spend it.
 */
function siteRequest(site: Site) {
  const calls = [...site.body.matchAll(/\b(?:fetch|fetchWithTimeout|fetcher)\s*\(/g)];
  if (calls.length !== 1) return { calls: calls.length, problems: [] as string[], request: null };
  const open = calls[0].index + calls[0][0].length - 1;
  const argsText = site.body.slice(open + 1, closing(site.body, open));
  const request = argsText.split(",")[0].trim();
  const requestAt = open + 1 + argsText.indexOf(request);
  const problems: string[] = [];
  if (!/^[A-Za-z_$][\w$]*$/.test(request)) {
    return { calls: 1, problems: [`its fetch is sent \`${squash(request).slice(0, 60)}\`, not the URL variable it built`], request };
  }
  const declarations = [...site.body.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)].filter((m) => m[1] === request);
  if (declarations.length === 0 || declarations[0].index > requestAt) {
    return { calls: 1, problems: [`\`${request}\` is not declared in the site before it is sent`], request };
  }
  const declStart = declarations[0].index;
  const declEnd = site.body.indexOf(";", declStart);
  const nameAt = declStart + declarations[0][0].indexOf(request, declarations[0][0].search(/\s/));
  for (const anchor of site.anchors.filter((a) => a.kind === "base URL")) {
    if (anchor.at < declStart || anchor.at > declEnd) problems.push("builds a provider URL outside the declaration of the URL it fetches");
  }
  // A later `const <same name>` in a nested block is a different variable —
  // fetchFmpNewsBatch names each article's link `url` inside its payload map —
  // so that block's tokens are not uses of the request. It must not hold the
  // fetch, or the shadow is the request.
  const shadowed: Array<[number, number]> = [];
  for (const redeclared of declarations.slice(1)) {
    const block = enclosingBlock(site.body, redeclared.index);
    if (!block || (block[0] < requestAt && requestAt < block[1])) {
      problems.push(`redeclares \`${request}\` in the scope it fetches from`);
      continue;
    }
    shadowed.push(block);
  }
  const keyed = site.anchors.filter((a) => a.kind === "apikey parameter");
  if (keyed.length !== 1 || !site.body.startsWith(`${request}.searchParams.set("apikey", FMP_API_KEY`, keyed[0].at - request.length)) {
    problems.push(`sets the key ${keyed.length} times, or on something other than \`${request}\``);
  }
  for (const token of site.body.matchAll(/[A-Za-z_$][\w$]*/g)) {
    if (token[0] !== request || site.body[token.index - 1] === ".") continue;
    if (token.index === nameAt || token.index === requestAt) continue;
    if (shadowed.some(([open, close]) => open < token.index && token.index < close)) continue;
    if (site.body.startsWith(".searchParams.set(", token.index + request.length)) continue;
    const line = site.body.slice(0, token.index).split("\n").length;
    problems.push(`uses \`${request}\` at body line ${line} other than to set a parameter or send it: ${squash(site.body.slice(token.index, token.index + 50))}`);
  }
  return { calls: 1, problems, request };
}

describe("every Edge provider fetch is a governed site", () => {
  it("(i) attributes every provider anchor to one function, in its one shape, in every file that names the provider", (t) => {
    const { anchorCounts, misshapen, sites, unattributed } = censusSites();
    t.diagnostic(`${sites.length} provider fetch sites: ${sites.map((s) => `${s.file.split("/").slice(-2).join("/")}:${s.name}`).join(", ")}`);
    t.diagnostic(`anchors: ${Object.entries(anchorCounts).map(([kind, n]) => `${n} ${kind}`).join(", ")}`);
    assert.deepEqual(
      unattributed,
      [],
      "the provider is named outside any async function this guard can read — at module scope, in a sync helper, " +
        "in an arrow function or in the Deno.serve handler — so no site guard applies to what it builds",
    );
    assert.deepEqual(
      misshapen,
      [],
      'the base appears only as `${FMP_API_BASE_URL.replace(/\\/$/, "")}` and the key only in ' +
        '`.searchParams.set("apikey", FMP_API_KEY`: any other shape can be handed to a helper that holds no anchor',
    );
    for (const [kind, n] of Object.entries(anchorCounts)) {
      assert.ok(n > 0, `no ${kind} anchor found anywhere — that detector broke, and a broken detector reads as a clean tree`);
    }
    assert.ok(sites.length >= 7, `only ${sites.length} sites found — the detector broke, which reads exactly like a clean tree`);

    const siteFiles = new Set(sites.map((s) => s.file));
    const defaultLine = squash('const FMP_API_BASE_URL = Deno.env.get("FMP_API_BASE_URL") ?? "https://financialmodelingprep.com/stable";');
    for (const file of edgeFiles()) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("financialmodelingprep")) continue;
      assert.ok(siteFiles.has(file), `${file} names the provider and holds no governed fetch site`);
      const squashed = squash(source);
      assert.equal(
        squashed.split("financialmodelingprep").length - 1,
        1,
        `${file} names the provider host more than once — a literal URL fetch bypasses the site guards`,
      );
      assert.ok(
        squashed.includes(defaultLine),
        `${file}'s only provider host is not the FMP_API_BASE_URL default`,
      );
    }
  });

  it("(ii) each site takes a permit, asserts it first, makes one fetch of the one URL it built and records it with that permit before the ok check", () => {
    const { sites } = censusSites();
    assert.ok(sites.length >= 7);
    for (const site of sites) {
      const label = `${site.file}:${site.name}`;
      const body = squash(site.body);
      assert.match(squash(site.params), /permit:FmpSpendPermit/, `${label} takes no permit`);
      const opening = site.body.indexOf("{", site.body.indexOf(site.params) + site.params.length);
      assert.ok(
        squash(site.body.slice(opening + 1)).startsWith("assertSpendPermit(permit);"),
        `${label} does not assert its permit as its first statement, outside any try — a byte can be bought, or a refusal cached, before it is checked`,
      );
      assert.equal(body.split("recordFetch(").length - 1, 1, `${label} must record exactly once`);
      const request = siteRequest(site);
      assert.equal(
        request.calls,
        1,
        `${label} makes ${request.calls} calls to fetch, fetchWithTimeout or fetcher — a site makes exactly one provider request, and the ledger sees only one`,
      );
      assert.deepEqual(request.problems, [], `${label}: a second request can leave with the key on it`);
      assert.ok(
        body.includes("recordFetch(fmpBudgetDeps(),permit,"),
        `${label} records with something other than its own permit, so the bytes land on a class nobody decided`,
      );
      const okCheck = body.indexOf("if(!response.ok)");
      assert.ok(
        okCheck < 0 || body.indexOf("recordFetch(") < okCheck,
        `${label} records AFTER the ok check, so a refused response spends bytes the ledger never sees`,
      );
    }
  });

  it("(iii) every call to a permit-taking function passes a permit", (t) => {
    const takers = new Set<string>();
    const codes = new Map<string, string>();
    for (const file of edgeFiles()) {
      const code = codeOf(readFileSync(file, "utf8"));
      codes.set(file, code);
      for (const block of blocksOf(code)) {
        if (squash(block.params).includes("permit:FmpSpendPermit")) takers.add(block.name);
      }
    }
    const missing: string[] = [];
    let calls = 0;
    for (const [file, code] of codes) {
      for (const name of takers) {
        for (const match of code.matchAll(new RegExp(`(^|[^\\w.])${name}\\s*\\(`, "g"))) {
          const before = code.slice(Math.max(0, match.index - 12), match.index + match[1].length);
          if (/function\s*$/.test(before)) continue;
          const open = match.index + match[0].length - 1;
          const args = code.slice(open + 1, closing(code, open));
          calls += 1;
          if (!/\bpermit\b/.test(args)) missing.push(`${file}: ${name}(${squash(args).slice(0, 80)})`);
        }
      }
    }
    t.diagnostic(`${takers.size} permit-taking functions, ${calls} calls`);
    assert.ok(takers.size >= 10 && calls >= 10, `only ${takers.size} takers and ${calls} calls — the detector broke`);
    assert.deepEqual(missing, [], "these calls pass no permit");
  });
});

type Decision = { branch: string; cls: string; file: string; index: number; name: string; statement: string };

/**
 * Index of the `!` in the first `!<name>.allowed` at or after `from`, or -1.
 * A string search rather than a RegExp built from `name`, which semgrep's
 * non-literal-regexp rule refuses in CI.
 */
function refusalGuardAt(scope: string, name: string, from: number): number {
  const needle = `${name}.allowed`;
  for (let at = scope.indexOf(needle, from); at >= 0; at = scope.indexOf(needle, at + 1)) {
    if (/[\w$.]/.test(scope[at - 1] ?? "")) continue;
    let before = at - 1;
    while (before >= 0 && /\s/.test(scope[before])) before--;
    if (scope[before] === "!") return before;
  }
  return -1;
}

/**
 * A decision is one of two statements, and nothing else: the request asks the
 * ledger, or it asks only when there is work and holds null otherwise. The
 * pattern used to accept any right-hand side containing the call, so review
 * mutation N4 (2026-09-21) cached the first allowed decision in a module-scope
 * `let` and re-used it — `lastSpend?.allowed ? lastSpend : (lastSpend = await
 * mayFetch(…))` — and a warm isolate would have skipped the ledger and its
 * ceiling on every later request. It passed every guard.
 */
const DECISION =
  /const\s+(\w+)\s*=\s*(?:await\s+mayFetch\(fmpBudgetDeps\(\),\s*"(user|background)"\)|[\w.]+\.length\s*>\s*0\s*\?\s*await\s+mayFetch\(fmpBudgetDeps\(\),\s*"(user|background)"\)\s*:\s*null)\s*;/g;

function decisionsIn(file: string, code: string): { decisions: Decision[]; stray: number } {
  const decisions: Decision[] = [];
  for (const match of code.matchAll(DECISION)) {
    const name = match[1];
    const block = blocksOf(code).find((b) => b.start <= match.index && match.index < b.end);
    const scope = block ? code.slice(0, block.end) : code;
    const guardAt = refusalGuardAt(scope, name, match.index);
    let branch = "";
    if (guardAt >= 0) {
      const ifAt = scope.lastIndexOf("if (", guardAt);
      const condClose = closing(scope, ifAt + 3);
      let after = condClose + 1;
      while (/\s/.test(scope[after])) after++;
      branch = scope[after] === "{"
        ? scope.slice(after, closing(scope, after) + 1)
        : scope.slice(after, scope.indexOf(";", after) + 1);
    }
    const permitAt = scope.indexOf(`${name}.permit`, match.index);
    decisions.push({
      branch: guardAt >= 0 && (permitAt < 0 || guardAt < permitAt) ? branch : "",
      cls: match[2] ?? match[3],
      file,
      index: match.index,
      name,
      statement: match[0],
    });
  }
  const calls = (code.match(/\bmayFetch\(/g) ?? []).length;
  return { decisions, stray: calls - decisions.length };
}

const ENTRY_DECISIONS: Record<string, string[]> = {
  "market-data": ["user"],
  "news-calendar": ["background"],
  "outcome-sync": ["background"],
  "trade-analyzer": ["user", "user"],
};

function reaches(entry: string, targets: Set<string>): boolean {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    if (targets.has(file)) return true;
    for (const match of readFileSync(file, "utf8").matchAll(/from\s+"(\.[^"]+)"/g)) {
      queue.push(normalize(join(dirname(file), match[1])));
    }
  }
  return false;
}

describe("every provider spend is decided per request, and a refusal returns", () => {
  const all = edgeFiles()
    .filter((file) => file !== BUDGET_FILE)
    .map((file) => ({ file, ...decisionsIn(file, codeOf(readFileSync(file, "utf8"))) }));
  const decisions = all.flatMap((entry) => entry.decisions);

  it("(iv) every mayFetch is a named decision, in an entry file, refused and returned before its permit is used", (t) => {
    t.diagnostic(`${decisions.length} decisions: ${decisions.map((d) => `${d.file.split("/")[2]}:${d.cls}`).join(", ")}`);
    assert.ok(decisions.length >= 5, `only ${decisions.length} decisions found — the detector broke`);
    for (const entry of all) {
      assert.equal(
        entry.stray,
        0,
        `${entry.file} calls mayFetch outside the two decision shapes, \`const X = await mayFetch(fmpBudgetDeps(), "<class>");\` ` +
          `and \`const X = <list>.length > 0 ? await mayFetch(fmpBudgetDeps(), "<class>") : null;\` — any other right-hand side can hold a decision across requests`,
      );
    }
    for (const decision of decisions) {
      assert.match(decision.file, /^supabase\/functions\/[\w-]+\/index\.ts$/, `${decision.file} decides spend outside an entry file`);
      assert.ok(
        /\breturn\b/.test(decision.branch),
        `${decision.file}: \`${decision.name}\` reaches its permit without a refusal branch that returns`,
      );
    }
  });

  it("(v) every entry that reaches a provider site decides, with the classes the table names — both directions", () => {
    const siteFiles = new Set(censusSites().sites.map((s) => s.file));
    const entries = readdirSync(EDGE_ROOT)
      .filter((name) => existsSync(`${EDGE_ROOT}/${name}/index.ts`))
      .filter((name) => reaches(`${EDGE_ROOT}/${name}/index.ts`, siteFiles))
      .sort();
    assert.ok(entries.length >= 4, `only ${entries.length} spending entries derived`);
    assert.deepEqual(Object.keys(ENTRY_DECISIONS).sort(), entries, "the decision table and the spending entries disagree");
    for (const entry of entries) {
      const classes = decisions
        .filter((d) => d.file === `${EDGE_ROOT}/${entry}/index.ts`)
        .map((d) => d.cls)
        .sort();
      assert.deepEqual(classes, ENTRY_DECISIONS[entry], `${entry} decides ${JSON.stringify(classes)}`);
    }
  });

  it("(vi) each decision sits where it spends nothing it need not, and every refusal is a 503", () => {
    const analyzer = codeOf(readFileSync(`${EDGE_ROOT}/trade-analyzer/index.ts`, "utf8"));
    const [scan, refresh] = decisions
      .filter((d) => d.file.endsWith("trade-analyzer/index.ts"))
      .sort((a, b) => a.index - b.index);
    const scanFn = blocksOf(analyzer).find((b) => b.name === "scanOpportunities")!;
    const refreshFn = blocksOf(analyzer).find((b) => b.name === "refreshUserOutcomes")!;
    assert.ok(scanFn.start < scan.index && scan.index < scanFn.end, "the scan decision left scanOpportunities");
    assert.ok(
      analyzer.indexOf("const normalizedSymbols", scanFn.start) < scan.index &&
        scan.statement.includes("normalizedSymbols.length > 0"),
      "the scan decision reads the ledger before normalization, or for an empty scan — the analyzer-abuse flood would 503 instead of 429",
    );
    const setupsRead = analyzer.indexOf("const setups = await fetchRows", refreshFn.start);
    const emptyReturn = analyzer.indexOf("if (setups.length === 0) return", refreshFn.start);
    assert.ok(
      refreshFn.start < refresh.index && refresh.index < refreshFn.end &&
        setupsRead > 0 && setupsRead < emptyReturn && emptyReturn < refresh.index,
      "the refresh decision reads the ledger before knowing there is anything to grade",
    );
    for (const branch of ["if (scan.refused)", "if (outcomeRefresh.refused)"]) {
      const at = analyzer.indexOf(branch);
      assert.ok(at > 0, `the handler has no \`${branch}\` branch`);
      const open = analyzer.indexOf("{", at + branch.length - 1);
      assert.match(analyzer.slice(open, closing(analyzer, open)), /\b503\b/, `${branch} does not return 503`);
      assert.match(analyzer.slice(open, closing(analyzer, open)), /fmpSpendRefusalBody\(/, `${branch} builds its own 503 body`);
    }

    for (const decision of decisions.filter((d) => !d.file.endsWith("trade-analyzer/index.ts"))) {
      assert.match(decision.branch, /\b503\b/, `${decision.file}'s refusal is not a 503`);
      assert.match(decision.branch, /fmpSpendRefusalBody\(/, `${decision.file}'s refusal builds its own 503 body`);
    }

    // The helper is the only door to the wire. `reason` carries the account-wide
    // trailing-30 figure for the operator's log and the body deliberately does
    // not, so an entry that composed its own 503 body from the refusal would put
    // the figure `fmp_usage`'s revoke withholds back in front of any signed-in
    // caller. Every 503 each entry answers is therefore built by the helper.
    for (const file of [...new Set(decisions.map((d) => d.file))]) {
      const source = readFileSync(file, "utf8");
      const answers = [...source.matchAll(/jsonResponse\(([^;]*?),\s*503\s*\)/g)];
      assert.ok(answers.length > 0, `${file} answers no 503, so this census examined nothing there`);
      for (const [call] of answers) {
        assert.match(call, /fmpSpendRefusalBody\(/, `${file} answers a 503 not built by fmpSpendRefusalBody: ${call}`);
      }
    }
    const outcome = decisions.find((d) => d.file.endsWith("outcome-sync/index.ts"))!;
    const pruneAt = outcome.branch.indexOf("pruneAnalyzerEvents()");
    assert.ok(
      pruneAt >= 0 && pruneAt < outcome.branch.indexOf("return"),
      "outcome-sync's refusal returns before pruning — retention must not depend on the provider budget",
    );
    const news = codeOf(readFileSync(`${EDGE_ROOT}/news-calendar/index.ts`, "utf8"));
    const verify = news.indexOf('route === "verify"');
    assert.ok(
      verify > 0 && news.indexOf("return", verify) < news.indexOf("mayFetch("),
      "news-calendar's verify reaches the spend decision before it returns",
    );
  });

  it("(vii) no permit is forged, cached or cast outside fmpBudget.ts, and mayFetch is one fresh decision that reads the parking line", () => {
    for (const file of edgeFiles().filter((f) => f !== BUDGET_FILE)) {
      const code = codeOf(readFileSync(file, "utf8"));
      for (const forbidden of ["as FmpSpendPermit", "<FmpSpendPermit>", "decideFmpSpend(", "minted"]) {
        assert.equal(code.includes(forbidden), false, `${file} contains \`${forbidden}\``);
      }
      for (const match of code.matchAll(/permit/gi)) {
        const window = code.slice(Math.max(0, match.index - 40), match.index + 6 + 40);
        assert.doesNotMatch(window, /\bas (never|any|unknown as)\b/, `${file} casts near a permit: ${squash(window)}`);
      }
      assert.doesNotMatch(
        code,
        /^(?:export\s+)?(?:const|let|var)\s+[^=\n]*(?:permit|mayFetch|FmpSpend)/im,
        `${file} holds a permit or a spend decision at module scope, where it outlives the request`,
      );
    }
    const budget = readFileSync(BUDGET_FILE, "utf8");
    assert.match(budget, /import \{ DESK_PARKED \} from "\.\.\/_shared\/deskParking\.ts";/);
    const mayFetchFn = blocksOf(codeOf(budget)).find((b) => b.name === "mayFetch")!;
    const mayFetchBody = squash(budget.slice(mayFetchFn.start, mayFetchFn.end));
    assert.equal(
      mayFetchBody,
      "exportfunctionmayFetch(deps:FmpBudgetDeps,consumerClass:FmpConsumerClass,):Promise<FmpSpendDecision>{" +
        "returndecideFmpSpend(deps,consumerClass,DESK_PARKED);}",
      "mayFetch must be one fresh decision passing the parking line, and nothing that could remember one",
    );
  });
});

describe("the Edge graph type-checks against its REAL runtime", () => {
  // THE GAP THIS CLOSES, found 2026-09-01 while wiring the budget: the Edge
  // modules are excluded from `tsconfig.tests.json` because they use Deno
  // globals, so `npm run check` never sees them — and ESLint does not flag an
  // undefined identifier in them either. A missing import in `marketLoader.ts`
  // therefore passes typecheck, lint and every test, and fails at runtime in
  // the deployed analyzer. It happened twice inside one change.
  //
  // ZERO, since 2026-09-01. This shipped as a BASELINE of 14 — the errors the
  // graph carried when nothing had ever checked it — deliberately, because
  // fixing fourteen type errors on the money path inside the change set that
  // added a budget is how a careful change becomes a risky one.
  //
  // They were then fixed on their own, and two were live defects rather than
  // type noise: a `pricePlan` dereference reachable whenever geometry refused
  // on a market the engine had not declined, and a daily-chart comparator
  // calling `toTimestamp` without the timezone it requires. A third, the
  // `store_unavailable` telemetry status, was rejected by the table's own
  // check constraint — so the event built to make a silent fallback visible
  // could not be written.
  //
  // The gate is zero now. A baseline that never returns to zero is a number
  // people stop reading.
  const BASELINE: Record<string, number> = {
    "market-data": 0,
    "news-calendar": 0,
    "outcome-sync": 0,
    "trade-analyzer": 0,
  };

  const hasDeno = (() => {
    try {
      execFileSync("deno", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  for (const [fn, allowed] of Object.entries(BASELINE)) {
    it(`${fn} adds no new type error`, (t) => {
      if (!hasDeno) {
        // Stated, never silent: this suite's own law is that a stand-down
        // says why.
        t.skip("deno is not installed here, so the real runtime's type-checker cannot run");
        return;
      }
      const entry = `supabase/functions/${fn}/index.ts`;
      assert.ok(existsSync(entry), `${entry} is gone — re-anchor this gate`);
      let output = "";
      try {
        // The documented form (AGENTS.md): --no-config keeps a future Deno from
        // reading tsconfig.app.json. On Deno 2.9.7 the bare form also checks
        // (a planted TS2322 fails both, 2026-09-21), so this pins the form, not a fix.
        execFileSync("deno", ["check", "--no-config", entry], { encoding: "utf8", stdio: "pipe" });
      } catch (error) {
        const shell = error as { stderr?: string; stdout?: string };
        output = `${shell.stdout ?? ""}${shell.stderr ?? ""}`;
      }
      const count = (output.match(/TS\d{4}/g) ?? []).length;
      assert.ok(
        count <= allowed,
        `${entry} now has ${count} type error(s) against a baseline of ` +
          `${allowed}. Nothing else in this repo checks these files: ` +
          `npm run check excludes them and lint does not see an undefined ` +
          `identifier in them.\n${output.slice(0, 1200)}`,
      );
    });
  }
});
