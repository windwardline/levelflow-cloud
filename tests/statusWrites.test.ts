import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// C1: every status write in this system reads a row, decides something, and
// writes back one round trip later. Two writers run concurrently by design —
// a user's scan through trade-analyzer, and the hourly outcome-sync (service
// role, up to 300 setups, every user) — so an unconditional `PATCH ...?id=eq.X`
// lets one clobber what the other just decided:
//
//   1. outcome-sync reads setup S (generated), replays it, resolves stop_loss
//   2. a scan reads S (still generated), builds new levels
//   3. outcome-sync writes status='filled' and upserts the outcome
//   4. the scan writes new entry/stop/targets and status='generated'
//
// The trade_outcomes row now holds a verdict computed from levels the setup no
// longer carries, S is back in the sync's queue, and `resolution=merge-
// duplicates` on setup_id means the re-evaluation of the NEW geometry
// overwrites the first verdict. Reverse steps 3 and 4 and the wrong verdict is
// permanent. This is the cohort the Resumption Protocol reads to decide whether
// the engine generalizes, and nothing anywhere recorded that it happened.
//
// The fix is one URL fragment per write — the status the writer read — which
// turns each PATCH into a compare-and-set. These are Deno-only modules with no
// harness reaching their DB round trip, so this pins the real source the way
// tests/scanPersistence.test.ts and tests/core.test.ts already do for the same
// files.
const ANALYZER = readFileSync(
  "supabase/functions/trade-analyzer/index.ts",
  "utf8",
);
const OUTCOME_SYNC = readFileSync(
  "supabase/functions/outcome-sync/index.ts",
  "utf8",
);

function body(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `expected to find ${start}`);
  assert.notEqual(to, -1, `expected to find ${end} after ${start}`);
  return source.slice(from, to);
}

describe("status writes are compare-and-sets, not last-writer-wins (C1)", () => {
  it("filters the analyzer's dedupe update on the status it read", () => {
    const upsert = body(
      ANALYZER,
      "async function upsertActiveSetup",
      "async function invalidateActiveSetupsForSymbol",
    );
    assert.match(
      upsert,
      /&status=eq\.\$\{encodeURIComponent\(activeSetup\.status\)\}/,
    );
    // And a write that matches nothing is a reported failure, never a silent
    // success: the representation is read, not discarded.
    assert.match(upsert, /if \(updatedRows\.length === 0\) \{\s*throw new Error/);
  });

  it("reports how many rows superseding a symbol actually moved", () => {
    const invalidate = body(
      ANALYZER,
      "async function invalidateActiveSetupsForSymbol",
      "async function refreshUserOutcomes",
    );
    // The status filter is the guard — a resolved row is no longer
    // generated/placed, so this cannot un-resolve one.
    assert.match(invalidate, /&status=in\.\(generated,placed\)/);
    assert.match(invalidate, /Promise<number>/);
    assert.match(invalidate, /return invalidatedRows\.length;/);
    const upsert = body(
      ANALYZER,
      "async function upsertActiveSetup",
      "async function invalidateActiveSetupsForSymbol",
    );
    assert.match(upsert, /if \(invalidated === 0\) \{\s*throw new Error/);
  });

  it("filters the analyzer's outcome status flip on the status it read", () => {
    const mark = body(
      ANALYZER,
      "async function markSetupStatus",
      "async function upsertOutcome",
    );
    assert.match(mark, /&status=eq\.\$\{encodeURIComponent\(setup\.status\)\}/);
    assert.match(mark, /if \(updatedRows\.length === 0\) \{\s*throw new Error/);
  });

  it("filters outcome-sync's status flip on the status it read", () => {
    const mark = body(OUTCOME_SYNC, "async function markStatus", "async function writeOutcome");
    assert.match(mark, /&status=eq\.\$\{encodeURIComponent\(setup\.status\)\}/);
    assert.match(mark, /throw new Error/);
    // The row it reads carries a status to compare against.
    assert.match(OUTCOME_SYNC, /trade_setups\?select=[^`]*\bstatus\b/);
  });

  it("calls a run with failures a failure, however many rows it did resolve", () => {
    // The run status was `failed > 0 && resolved === 0 ? "error" : "success"`,
    // so 299 failures and one resolution recorded success. This is the job that
    // feeds the entire learning cohort, and it runs on a clock with nobody
    // watching; the scan path has said `failed > 0` alone is a failure since
    // §17m.2, and this is the same sentence for the same reason.
    assert.match(
      OUTCOME_SYNC,
      /status: summary\.failed > 0 \? "error" : "success",/,
    );
    assert.doesNotMatch(OUTCOME_SYNC, /summary\.resolved === 0/);
    // Saturation is stated rather than inferred from `reviewed === 300`: a run
    // that hit its own ceiling has a backlog behind it.
    assert.match(
      OUTCOME_SYNC,
      /const saturated = setups\.length >= MAX_SETUPS_PER_RUN;/,
    );
    assert.match(OUTCOME_SYNC, /metadata: \{ \.\.\.summary, saturated \},/);
  });

  it("counts a lost race as a failure rather than losing it silently", () => {
    // Both writers already wrap each setup in try/catch and count `failed`, so
    // throwing is what makes the race visible: the analyzer's per-symbol
    // persistence report records it (spec §17m.2) and outcome-sync's run
    // summary carries it into analyzer_events.
    assert.match(
      ANALYZER,
      /console\.error\("outcome refresh setup failed", setup\.id, error\);\s*summary\.failed \+= 1;/,
    );
    assert.match(
      OUTCOME_SYNC,
      /console\.error\("outcome sync setup failed", setup\.id, error\);\s*summary\.failed \+= 1;/,
    );
  });
});
