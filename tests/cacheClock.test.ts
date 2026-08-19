import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";

// R0 "one clock" (remediation program 2026-08-11, Phase 0): the pins that
// keep the clock contract from regressing silently. The mixed-clock corpus
// happened because a normalizer fix could not reach bars the cache had
// already stored — these pins hold the machinery that makes that
// impossible to repeat without tripping a test. (The chunk plan's values
// and behaviour are pinned in tests/intradayChunks.test.ts; this file
// holds the contracts that live in un-importable or non-TS surfaces.)

describe("the clock identifiers are deliberate constants", () => {
  it("pins BAR_CLOCK — bump it only when toTimestamp's interpretation changes", () => {
    // If this assertion is failing, either the bump is deliberate (a
    // normalizer-semantics change: update this pin AND the rebuild
    // runbook, and plan the cache rebuild the bump forces) or the constant
    // was edited casually — which strands every stamped store.
    assert.equal(BAR_CLOCK, "ny-wall-utc-v2");
  });

  it("pins CALENDAR_CLOCK — the calendar's convention is not the bars'", () => {
    assert.equal(CALENDAR_CLOCK, "fmp-calendar-utc-v1");
    assert.notEqual(CALENDAR_CLOCK, BAR_CLOCK);
  });

  it("keeps BAR_CLOCK declared beside the normalizer it identifies", () => {
    const bars = readFileSync(
      "supabase/functions/trade-analyzer/bars.ts",
      "utf8",
    );
    assert.match(bars, /export const BAR_CLOCK = "ny-wall-utc-v2"/);
    // The contract lives in the docblock the constant cannot drift from.
    assert.match(bars, /MUST bump this\s+\* string/);
  });
});

describe("the sweep driver feeds every store its clock (read as text — main() runs on import)", () => {
  const sweep = readFileSync("scripts/replay-sweep.ts", "utf8");

  it("passes BAR_CLOCK to every bar store and CALENDAR_CLOCK to the calendar store", () => {
    assert.equal((sweep.match(/clock: BAR_CLOCK/g) ?? []).length, 4);
    assert.match(sweep, /clock: CALENDAR_CLOCK/);
    // The legacy date-keyed migration imported pre-clock-stamp data and is
    // gone; nothing may reintroduce it.
    assert.doesNotMatch(sweep, /legacyPrefix/);
  });

  it("takes its chunk plan from intradayChunks, with NO per-chunk clip detector", () => {
    // The 1b fix is pinned by behaviour in tests/intradayChunks.test.ts.
    // Per-chunk clip detection is deliberately absent — three candidate
    // detectors died in review as dead or false-positive (#358 rounds
    // 1/4/4b; intradayChunks.ts header has the record) — so nothing here
    // may quietly reintroduce one that cannot work.
    assert.match(sweep, /from "\.\/intradayChunks\.ts"/);
    assert.match(sweep, /intradayChunkWindows\(\{/);
    assert.doesNotMatch(sweep, /INTRADAY_ROW_CAP_TRIPWIRE/);
    assert.doesNotMatch(sweep, /chunkRowTally|chunkRowCounts/);
  });

  it("witnesses every loaded series BEFORE the thin-symbol skip — a dropped market must still stop a poisoned run (round 6)", () => {
    // The corpus-global invariant: a symbol under the depth floor is
    // excluded from the measurement, but its stores are already stamped
    // and cached, and a later, deeper run will read them. The witnesses
    // return indeterminate below their own sample floors, so witnessing
    // first cannot false-condemn a series that is merely thin.
    assert.ok(
      sweep.lastIndexOf("cacheClockWitnessRefused") <
        sweep.indexOf("WARMUP_BARS * 2"),
      "the witness refusals must precede the WARMUP_BARS * 2 depth skip",
    );
  });

  it("splits the refusal tokens: witness refusals are actionable and must not wear the stand-down's name", () => {
    // cacheClockMismatch = the pre-rebuild store stamp, the nightly
    // top-up's one named stand-down. A condemned witness on a STAMPED
    // store is a fresh regression and stays red (#358 finding 5).
    assert.match(sweep, /cacheClockWitnessRefused: \$\{symbol\} \$\{timeframe\}/);
    assert.doesNotMatch(sweep, /cacheClockMismatch: \$\{symbol\}/);
    assert.match(sweep, /docs\/cache-rebuild-r0\.md/);
  });
});

describe("the store guard's refusals are loud and the ops jobs know their names", () => {
  it("calibrationCache refuses a wrong stamp, refuses a corrupt store, writes atomically, never seeds from legacy files", () => {
    const cache = readFileSync("scripts/calibrationCache.ts", "utf8");
    assert.match(cache, /cacheClockMismatch/);
    assert.match(cache, /cacheStoreUnreadable/);
    assert.match(cache, /docs\/cache-rebuild-r0\.md/);
    // #364 round 25, finding 3: the remedy follows the store's own
    // clock — the nightly stand-down defers to this raise site for it,
    // and the single bar-rebuild remedy cannot clear a stamp on a
    // calendar-clock store (treasury-rates, econ-calendar).
    assert.match(cache, /clock === CALENDAR_CLOCK/);
    assert.match(cache, /delete this one rolling store and re-run/);
    // Atomic replace: a torn multi-MB writeFile is the corrupt shape the
    // guard refuses; rename either completes or leaves the old store.
    assert.match(cache, /await rename\(tmpPath, path\)/);
    assert.doesNotMatch(cache, /seedFromLegacy|legacyPrefix/);
  });

  it("the nightly top-up stands down ONLY for the store-stamp refusal, via herestrings", () => {
    const topup = readFileSync("scripts/ops/daily-cache-topup.sh", "utf8");
    // Same discipline as the 429 branch (#356): one named, proven
    // condition; everything else stays red. Herestrings because a piped
    // grep -q can SIGPIPE the writer under pipefail and flip a legitimate
    // stand-down red.
    assert.match(topup, /grep -q 'cacheClockMismatch' <<<"\$out"/);
    assert.match(topup, /grep -qE '\\\(429\\\)\|providerQuotaExhausted\|Too Many Requests' <<<"\$out"/);
    assert.match(topup, /rebuild per docs\/cache-rebuild-r0\.md/);
    // The actionable refusals must NOT be swallowed by a stand-down.
    // #364 round 23 turned this from absence into a positive shape: the
    // driver now DEFERS treasury integrity refusals past the bar
    // survey, so a blackout-era roster 429 can share $out with one of
    // these tokens — grepped after the 429 branch, the refusal would be
    // downgraded to a quota stand-down (exit 0) forever. So the tokens
    // are grepped FIRST, into a branch that exits 1 and never 0 (the
    // order relative to both stand-downs is pinned beside the driver's
    // deferral pins in tests/sweepManifest.test.ts).
    const redGuard = topup.indexOf(
      "grep -qE 'cacheStoreUnreadable|cacheClockWitnessRefused|treasuryCoverageRefused|treasuryChunkHole'",
    );
    assert.ok(redGuard >= 0, "the must-stay-red guard must exist");
    const guardBlock = topup.slice(redGuard, topup.indexOf("\nfi", redGuard));
    assert.match(guardBlock, /exit 1/);
    assert.doesNotMatch(guardBlock, /exit 0/);
  });

  it("the rebuild runbook stops the agent first, archives OUTSIDE the repo, and re-arms what it stopped", () => {
    const runbook = readFileSync("docs/cache-rebuild-r0.md", "utf8");
    assert.match(runbook, /--byte-budget/);
    assert.match(runbook, /verify-cache-clock/);
    // The 07:00 agent (plus RunAtLoad) would write into a mid-rebuild
    // cache — boot it out before touching the store (#358 finding 3).
    assert.match(runbook, /launchctl bootout/);
    // The archive must live where `git clean -dfx` cannot reach it
    // (#358 finding 7).
    assert.match(runbook, /~\/levelflow-cache-condemned/);
    // A rebuilt cache that silently stops updating is the same failure
    // inverted — the runbook re-arms the agent it stopped.
    assert.match(runbook, /levelflow-cache-topup/);
  });
});
