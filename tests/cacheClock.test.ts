import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";

// R0 "one clock" (remediation program 2026-08-11, Phase 0): the pins that
// keep the clock contract from regressing silently. The mixed-clock corpus
// happened because a normalizer fix could not reach bars the cache had
// already stored — these pins hold the machinery that makes that
// impossible to repeat without tripping a test.

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

  it("sizes intraday chunks per timeframe — the 1b sawtooth fix", () => {
    // 5-minute chunks clipped at ~2,000 rows under the 15-minute-sized
    // 30-day window, holing two thirds of the series. 6 days is 1,728 rows
    // worst case (24/7), under the observed clip with margin.
    assert.match(
      sweep,
      /INTRADAY_CHUNK_DAYS: Record<"15min" \| "5min", number> = \{\s*"15min": 30,\s*"5min": 6,\s*\}/,
    );
    // And the cap assumption is self-verifying: a chunk at cap size fails
    // the run instead of caching a holed series.
    assert.match(sweep, /INTRADAY_ROW_CAP_TRIPWIRE/);
    assert.match(sweep, /at the provider's response cap/);
  });

  it("refuses a condemned witness corpus-globally, naming the runbook", () => {
    assert.match(sweep, /cacheClockMismatch: \$\{symbol\} \$\{timeframe\}/);
    assert.match(sweep, /docs\/cache-rebuild-r0\.md/);
  });
});

describe("the store guard's refusal is loud and the ops jobs know its one name", () => {
  it("calibrationCache throws cacheClockMismatch and never seeds from legacy files", () => {
    const cache = readFileSync("scripts/calibrationCache.ts", "utf8");
    assert.match(cache, /cacheClockMismatch/);
    assert.match(cache, /docs\/cache-rebuild-r0\.md/);
    assert.doesNotMatch(cache, /seedFromLegacy|legacyPrefix/);
  });

  it("the nightly top-up stands down for the clock refusal by name, and for nothing broader", () => {
    const topup = readFileSync("scripts/ops/daily-cache-topup.sh", "utf8");
    // Same discipline as the 429 branch (#356): one named, proven
    // condition; everything else stays red.
    assert.match(topup, /grep -q 'cacheClockMismatch'/);
    assert.match(topup, /rebuild per docs\/cache-rebuild-r0\.md/);
  });

  it("the rebuild runbook exists and restarts what the rebuild must restart", () => {
    const runbook = readFileSync("docs/cache-rebuild-r0.md", "utf8");
    assert.match(runbook, /--byte-budget/);
    assert.match(runbook, /verify-cache-clock/);
    // The top-up agent was stopped when the store was condemned; a rebuilt
    // cache that silently stops updating is the same failure inverted.
    assert.match(runbook, /levelflow-cache-topup/);
  });
});
