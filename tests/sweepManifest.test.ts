import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  crossSeriesDensityFacts,
  seriesFacts,
  sha256Hex,
  stableStringify,
  type SweepConditions,
  TREASURY_FETCH_START_MS,
  treasuryChunkRefusal,
  treasuryCurveFacts,
  type TreasuryCurveFacts,
  treasuryGapTouching,
} from "../scripts/sweepManifest.ts";

// 2i (2026-08-09): the corpus describes itself. Nothing used to persist a
// sweep's conditions except stdout and an operator-pathed JSONL with NO
// record of the calibration that produced it — variant:"baseline" is
// byte-identical across engine edits, the exact hazard calibration.ts
// documents for NGUSD. The manifest carries the analyzer version, the
// resolved per-symbol calibration (hashed), the grid, warmup/split params,
// the anchor, per-(symbol, timeframe) bar facts including the largest gap,
// and the bar-rejection tally — and item 3's readers assert its hash before
// aggregating anything.

describe("seriesFacts — continuity as a recorded fact", () => {
  const bar = (time: number) => ({ time });

  it("reports count, ends, largest gap and span", () => {
    const hour = 3_600_000;
    const facts = seriesFacts([
      bar(0),
      bar(hour),
      bar(2 * hour),
      bar(50 * hour),
    ], "intraday");
    assert.equal(facts.count, 4);
    assert.equal(facts.firstTime, 0);
    assert.equal(facts.lastTime, 50 * hour);
    assert.equal(facts.largestGapMs, 48 * hour);
    assert.equal(facts.spanDays, 2.08);
  });

  it("reads an empty or single-bar series without inventing ends", () => {
    assert.deepEqual(seriesFacts([], "intraday"), {
      clock: { verdict: "indeterminate" },
      count: 0,
      firstTime: null,
      largestGapMs: 0,
      lastTime: null,
      spanDays: 0,
    });
    assert.deepEqual(seriesFacts([bar(5)], "intraday"), {
      clock: { verdict: "indeterminate" },
      count: 1,
      firstTime: 5,
      largestGapMs: 0,
      lastTime: 5,
      spanDays: 0,
    });
  });

  it("carries the series' clock witness (R0) — tiny fixtures stay indeterminate", () => {
    assert.equal(seriesFacts([bar(0)], "daily").clock.verdict, "indeterminate");
    assert.equal(seriesFacts([bar(0)], "intraday").clock.verdict, "indeterminate");
  });
});

describe("crossSeriesDensityFacts — the ratio's shared window (#364 round 10)", () => {
  const bar = (time: number) => ({ time });
  const DAY = 86_400_000;

  it("counts both series inside the intersection window only", () => {
    // 15-minute covers days 0..20, 5-minute only days 10..20: the
    // shared window is [10d, 20d], so the 15-minute bars at 0d and 5d
    // fall outside it and the 5-minute count is untouched.
    const facts = crossSeriesDensityFacts(
      [bar(10 * DAY), bar(12 * DAY), bar(15 * DAY), bar(20 * DAY)],
      [bar(0), bar(5 * DAY), bar(10 * DAY), bar(14 * DAY), bar(20 * DAY)],
    );
    assert.deepEqual(facts, {
      fifteenCount: 3,
      fiveCount: 4,
      spanDays: 10,
    });
  });

  it("is undefined when either series is empty or the windows never meet", () => {
    assert.equal(crossSeriesDensityFacts([], [bar(0)]), undefined);
    assert.equal(crossSeriesDensityFacts([bar(0)], []), undefined);
    assert.equal(
      crossSeriesDensityFacts(
        [bar(0), bar(DAY)],
        [bar(10 * DAY), bar(11 * DAY)],
      ),
      undefined,
    );
  });
});

describe("stableStringify — hashes cannot depend on key order", () => {
  it("serializes identical objects identically regardless of key order", () => {
    assert.equal(
      stableStringify({ b: 1, a: { d: 2, c: [3, 1] } }),
      stableStringify({ a: { c: [3, 1], d: 2 }, b: 1 }),
    );
  });

  it("keeps array order significant", () => {
    assert.notEqual(stableStringify([1, 2]), stableStringify([2, 1]));
  });
});

describe("buildSweepManifest — the NGUSD hazard closed", () => {
  const symbolInput = (calibration: Record<string, unknown>) => ({
    calibration,
    providerSymbol: "ESUSD",
    series: {
      "15min": seriesFacts([{ time: 0 }, { time: 900_000 }], "intraday"),
      "1day": seriesFacts([{ time: 0 }], "daily"),
      "5min": seriesFacts([], "intraday"),
    },
    symbol: "ESUSD",
  });

  const build = (overrides: {
    calibration?: Record<string, unknown>;
    clock?: { calendar: string; normalizer: string };
    conditions?: SweepConditions;
    generatedAt?: string;
    grid?: unknown[];
    treasuryCurve?: TreasuryCurveFacts;
  } = {}) =>
    buildSweepManifest({
      analyzerVersion: "2026.08.09.test",
      anchor: "2026-08-09",
      barRejections: { spike: 2 },
      clock: overrides.clock ??
        { calendar: "test-calendar-v1", normalizer: "test-clock-v1" },
      conditions: overrides.conditions ?? {
        macroAdjustment: "historical-treasury-curve",
        providerWarningCount: "zero-by-construction",
        weightAdjustment: "raw-engine-zero",
      },
      days: 365,
      generatedAt: overrides.generatedAt ?? "2026-08-09T22:00:00.000Z",
      grid: overrides.grid ?? [{}],
      stepBars: 16,
      symbols: [
        symbolInput(overrides.calibration ?? { tp1RiskShare: 0.8 }),
      ],
      trainShare: 0.6,
      treasuryCurve: overrides.treasuryCurve ?? {
        count: 3_000,
        firstTime: Date.UTC(2013, 0, 2),
        largestGapMs: 4 * 86_400_000,
        lastTime: Date.UTC(2027, 0, 1),
      },
      warmupBars: 240,
    });

  it("records what produced the corpus", () => {
    const manifest = build();
    assert.equal(manifest.analyzerVersion, "2026.08.09.test");
    assert.equal(manifest.anchor, "2026-08-09");
    assert.equal(manifest.clock.normalizer, "test-clock-v1");
    assert.equal(manifest.warmupBars, 240);
    assert.equal(manifest.trainShare, 0.6);
    assert.deepEqual(manifest.barRejections, { spike: 2 });
    assert.equal(manifest.symbols[0].symbol, "ESUSD");
    assert.equal(manifest.symbols[0].series["15min"].count, 2);
    assert.equal(manifest.symbols[0].series["5min"].count, 0);
    assert.equal(
      manifest.symbols[0].calibrationHash,
      sha256Hex(stableStringify({ tp1RiskShare: 0.8 })),
    );
  });

  it("moves its hash when the calibration moves — same label, different engine, different corpus", () => {
    const baseline = build();
    const edited = build({ calibration: { tp1RiskShare: 0.9 } });
    assert.notEqual(baseline.manifestHash, edited.manifestHash);
    assert.notEqual(
      baseline.symbols[0].calibrationHash,
      edited.symbols[0].calibrationHash,
    );
  });

  it("moves its hash when the grid moves", () => {
    assert.notEqual(
      build().manifestHash,
      build({ grid: [{ stopAtrMultiplier: 2 }] }).manifestHash,
    );
  });

  it("moves its hash when the clock moves — one corpus, one normalization (R0)", () => {
    assert.notEqual(
      build().manifestHash,
      build({
        clock: { calendar: "test-calendar-v1", normalizer: "other-clock" },
      }).manifestHash,
    );
  });

  it("hashes the Treasury-curve facts — the evidence behind the macro claim moves the hash (#364 round 2)", () => {
    assert.notEqual(
      build().manifestHash,
      build({
        treasuryCurve: {
          count: 3_000,
          firstTime: Date.UTC(2013, 0, 2),
          largestGapMs: 40 * 86_400_000,
          lastTime: Date.UTC(2027, 0, 1),
        },
      }).manifestHash,
    );
  });

  it("hashes the E6 conditions — stated terms are part of corpus identity (R1b)", () => {
    const baseline = build();
    assert.equal(baseline.conditions.macroAdjustment, "historical-treasury-curve");
    assert.notEqual(
      baseline.manifestHash,
      build({
        // Only these literals typecheck today; a future variant term joins
        // SweepConditions AND the reader door together. Casting simulates
        // that future corpus without widening the current contract.
        conditions: {
          macroAdjustment: "live-fetch",
        } as unknown as SweepConditions,
      }).manifestHash,
    );
  });

  it("does not move its hash for the write timestamp", () => {
    assert.equal(
      build().manifestHash,
      build({ generatedAt: "2027-01-01T00:00:00.000Z" }).manifestHash,
    );
  });
});

describe("treasuryCurveFacts — the curve's own continuity record", () => {
  const day = 86_400_000;

  it("records count, ends, the largest inter-row gap, and week-plus gap POSITIONS", () => {
    // #364 round 14, finding 2: largestGapMs alone is positionless, so
    // the door could only refuse a holed curve absolutely. Week-plus
    // gaps carry their positions for the corpus-relative refusal.
    const facts = treasuryCurveFacts([
      { dateMs: 0 },
      { dateMs: 3 * day },
      { dateMs: 4 * day },
      { dateMs: 40 * day },
    ]);
    assert.deepEqual(facts, {
      count: 4,
      firstTime: 0,
      gapsOverWeekMs: [{ endMs: 40 * day, startMs: 4 * day }],
      largestGapMs: 36 * day,
      lastTime: 40 * day,
    });
    // A healthy curve hashes exactly as it did before the field existed.
    assert.deepEqual(
      treasuryCurveFacts([{ dateMs: 0 }, { dateMs: 3 * day }]),
      { count: 2, firstTime: 0, largestGapMs: 3 * day, lastTime: 3 * day },
    );
  });

  it("states an empty curve as zero rows, never a fabricated span", () => {
    assert.deepEqual(treasuryCurveFacts([]), {
      count: 0,
      firstTime: null,
      largestGapMs: 0,
      lastTime: null,
    });
  });

  it("treasuryGapTouching sees the hole that STRADDLES a span's edge — the shape filtering rows could not (#364 round 15, finding 1)", () => {
    // Rows end at day 100 and resume at day 150; a span starting at day
    // 133 (the --days-60-plus-lead shape) is touched by that gap even
    // though the gap's left anchor sits outside the span — filtering
    // rows to the span first deleted that anchor and measured ~nothing.
    const gaps = [{ endMs: 150 * day, startMs: 100 * day }];
    assert.deepEqual(
      treasuryGapTouching(gaps, 133 * day, 200 * day),
      gaps[0],
    );
    // A span the gap never reaches stays untouched, and no gaps at all
    // is never a touch.
    assert.equal(treasuryGapTouching(gaps, 160 * day, 200 * day), undefined);
    assert.equal(treasuryGapTouching(undefined, 0, 200 * day), undefined);
  });

  // #364 round 20, finding 1: the zero-row chunk law splits by POSITION.
  // Round 19 put the "provider coverage is shallower than the constant"
  // remedy on the store-head pre-flight — a branch guarded by a store
  // that LOADED, which the deepening runbook's own delete-store step
  // guarantees never runs: with the store gone, the refetch's first
  // chunk throws before a single row is stored. So the chunk refusal
  // itself distinguishes the requested start (coverage — name the
  // constant and the re-probe remedy; deleting the store cannot clear
  // it) from an interior chunk (a genuine hole), and both branches
  // execute here rather than riding as source pins.
  it("treasuryChunkRefusal names coverage at the requested start, a hole in the interior, and stays silent on healthy or sub-week chunks (#364 round 20, finding 1)", () => {
    const year = 365 * day;
    const interior = treasuryChunkRefusal({
      chunkRows: 0,
      fromMs: TREASURY_FETCH_START_MS + 2 * year,
      parserRefusals: 0,
      windowToMs: TREASURY_FETCH_START_MS + 3 * year,
    });
    assert.ok(interior, "an interior zero-row year must refuse");
    assert.match(interior, /a holed curve is refused, never merged and pinned/);
    assert.doesNotMatch(interior, /TREASURY_FETCH_START_MS/);
    // #364 round 21, finding 1: each branch carries its must-stay-red
    // token — the driver's --warm-only tolerance re-throws on both, so
    // a deterministic refusal can never ride the transport warn path.
    assert.match(interior, /^treasuryChunkHole: /);
    assert.doesNotMatch(interior, /treasuryCoverageRefused/);
    const atStart = treasuryChunkRefusal({
      chunkRows: 0,
      fromMs: TREASURY_FETCH_START_MS,
      parserRefusals: 0,
      windowToMs: TREASURY_FETCH_START_MS + year,
    });
    assert.ok(atStart, "a zero-row chunk at the requested start must refuse");
    assert.match(atStart, /^treasuryCoverageRefused: /);
    assert.doesNotMatch(atStart, /treasuryChunkHole/);
    assert.match(atStart, /starts at the requested fetch start/);
    assert.match(atStart, /coverage, not a hole/);
    assert.match(
      atStart,
      /re-probe the endpoint's earliest served date and move TREASURY_FETCH_START_MS with the recorded evidence/,
    );
    assert.doesNotMatch(atStart, /holed curve/);
    // Rows present, or a sub-week window (top-ups, the truncated final
    // chunk — legitimately empty over a weekend): no refusal.
    assert.equal(
      treasuryChunkRefusal({
        chunkRows: 1,
        fromMs: TREASURY_FETCH_START_MS,
        parserRefusals: 0,
        windowToMs: TREASURY_FETCH_START_MS + year,
      }),
      null,
    );
    assert.equal(
      treasuryChunkRefusal({
        chunkRows: 0,
        fromMs: TREASURY_FETCH_START_MS + 2 * year,
        parserRefusals: 0,
        windowToMs: TREASURY_FETCH_START_MS + 2 * year + 3 * day,
      }),
      null,
    );
  });

  it("treasuryChunkRefusal carries the chunk's parser-refusal count on both branches (#364 round 14, finding 2)", () => {
    // Refused rows are deterministic on refetch — without the count,
    // "the provider serves nothing" is unverifiable from the message
    // alone, and the coverage branch would steer an operator into
    // moving the constant on false evidence.
    const year = 365 * day;
    for (const fromMs of [
      TREASURY_FETCH_START_MS,
      TREASURY_FETCH_START_MS + 2 * year,
    ]) {
      const refusal = treasuryChunkRefusal({
        chunkRows: 0,
        fromMs,
        parserRefusals: 3,
        windowToMs: fromMs + year,
      });
      assert.ok(refusal);
      assert.match(
        refusal,
        /3 provider rows in this chunk were refused by the parser/,
      );
    }
  });
});

describe("the driver writes the manifest beside the emit", () => {
  it("builds and writes <emit>.manifest.json with the rejection tally", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(script, /buildSweepManifest\(/);
    assert.match(script, /\.manifest\.json/);
    assert.match(script, /barRejections: barRejectionTally/);
  });

  // E6 (R1b) driver wiring — replay-sweep runs main() on import, so its
  // half of the macro reconstruction is pinned at source the way the
  // manifest write above is; the arithmetic itself is executed in
  // tests/sweep.test.ts and tests/macroRates.test.ts.
  it("loads the Treasury rolling store, hands it to every simulation, and states the conditions it measured under", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(
      script,
      /key: "treasury-rates",/,
      "the curve must live in the same rolling-store discipline as bars and the calendar",
    );
    assert.match(script, /treasuryRates,\s*\n\s*warmupBars: split\.warmupBars,/);
    assert.match(script, /conditions,\s*\n\s*days: args\.days,/);
    assert.match(
      script,
      /macroAdjustment: "historical-treasury-curve",/,
    );
    // I3's lesson holds for the curve exactly as for the calendar: a
    // warned-and-continued hole would be pinned as the anchor day's truth
    // and never refetched.
    assert.match(script, /Treasury-rate fetch failed \(\$\{response\.status\}\)/);
    // Scoped to the FETCH body (#364 round 13): the no-warn-continue law
    // is about the join — a warned-over chunk would pin a hole as the
    // anchor day's truth. The load SITE's warm-only tolerance is a
    // different law (the survey must not die on this endpoint), pinned
    // separately below.
    const fetchStart = script.indexOf("async function fetchTreasuryRates");
    const fetchEnd = script.indexOf("async function", fetchStart + 1);
    assert.ok(fetchStart >= 0 && fetchEnd > fetchStart);
    assert.doesNotMatch(
      script.slice(fetchStart, fetchEnd),
      /console\.warn/,
      "a failed Treasury chunk must stop the run, never hole the join",
    );
    // #364 round 2, finding 1 (split round 20, finding 1): the claim
    // carries evidence. A 200 with an empty or unparseable body over a
    // week-or-wider window throws via the shared chunk predicate —
    // whose interior-hole and coverage-at-the-requested-start branches
    // are EXECUTED in the treasuryCurveFacts suite; this pin holds the
    // driver's side: every chunk runs the law, wired with the chunk's
    // OWN parser-refusal count so "the provider served nothing" stays
    // distinguishable from "we refused what it served". The driver
    // refuses an empty or stale-tailed curve before simulating; and the
    // manifest carries the curve's facts for the door to assert.
    assert.match(
      script.slice(fetchStart, fetchEnd),
      /const refusal = treasuryChunkRefusal\(\{\s*\n\s*chunkRows,\s*\n\s*fromMs: from,\s*\n\s*parserRefusals: treasuryParserRefusals - parserRefusalsBefore,/,
      "the fetch must run the shared zero-row chunk law on every chunk",
    );
    assert.match(script, /Treasury curve is empty/);
    assert.match(script, /more than 7 days stale/);
    // #364 round 17, finding 2: the manifest records the fetch start
    // this corpus was REQUESTED under, so the door's leading-edge check
    // judges archived corpora by their own request, not the current
    // build's constant.
    assert.match(
      script,
      /treasuryCurve: \{\s*\n\s*\.\.\.treasuryCurveFacts\(treasuryRates\),\s*\n\s*requestedStartMs: TREASURY_FETCH_START_MS,/,
    );
    // #364 round 13, finding 1 (scoped rounds 14-15): the STORED
    // curve's continuity is asserted at pre-flight from its facts —
    // the chunk guard fires only on the run that fetches and only on
    // zero rows, and the rolling store never revisits a pinned
    // interior — via the SAME overlap predicate as the door, over
    // whole-store gap positions (filtering rows first deletes the left
    // anchor of a hole straddling the window's edge), against the
    // requested --days window.
    assert.match(
      script,
      /\) touching the requested \$\{args\.days\}-day window/,
    );
    assert.match(
      script,
      /const holeTouching = treasuryGapTouching\(\s*\n?\s*treasuryCurveFacts\(treasuryRates\)\.gapsOverWeekMs,/,
      "the driver measures gaps over the WHOLE store and tests overlap",
    );
    assert.match(
      readFileSync("scripts/sweepStats.ts", "utf8"),
      /treasuryGapTouching\(/,
      "the door runs the same predicate — one mechanism for one law",
    );
    // #364 round 13, finding 3: fetchFull requests from the SHARED
    // constant the door's leading-edge tolerance derives from.
    assert.match(
      script,
      /fetchTreasuryRates\(TREASURY_FETCH_START_MS\)/,
      "the driver and the door must share one requested start",
    );
    // #364 round 13, smaller + round 14, finding 1; rescoped rounds
    // 21-23: the survey path tolerates a Treasury provider TRANSPORT
    // failure (warn-and-continue), while EVERY integrity refusal —
    // the per-file store tokens (the treasury store rides the
    // calendar clock, so neither condemns a bar store) and the
    // deterministic chunk tokens — exits red DEFERRED past the bar
    // survey: the top-up script's must-stay-red grep runs on the
    // nonzero exit while the roster keeps its warm, instead of dying
    // at zero of 97 symbols for conditions the bar stores don't have.
    assert.match(
      script,
      /\/cacheStoreUnreadable\|cacheClockMismatch\|treasuryCoverageRefused\|treasuryChunkHole\/\s*\n?\s*\.test\(message\)/,
      "every treasury integrity refusal must be matched by token under --warm-only",
    );
    assert.match(
      script,
      /deferredTreasuryRefusal = error as Error;/,
      "integrity refusals defer rather than abort the survey",
    );
    const deferredThrow = script.indexOf("throw deferredTreasuryRefusal;");
    const tablePrint = script.indexOf("printTable(rows);");
    assert.ok(
      tablePrint >= 0 && deferredThrow > tablePrint,
      "the deferred refusal exits red AFTER the survey table prints",
    );
    assert.match(
      script,
      /bar survey continues without it/,
      "--warm-only must survive a Treasury provider TRANSPORT outage",
    );
    // #364 round 24, finding 1: the tolerated transport warn CONTINUES
    // the run, so it must not re-print the "(NNN)" signature the top-up
    // script's quota stand-down greps over the whole captured output —
    // or any later, unrelated failure is reported as a quota stand-down
    // at exit 0. Re-shaped to "status NNN", the COT site's
    // unparenthesized convention, so a stand-down still requires a 429
    // the run actually died on.
    assert.ok(
      script.includes(String.raw`message.replace(/\((\d{3})\)/g, "status $1")`),
      "the tolerated warn must strip the parenthesized-status stand-down signature",
    );
    // #364 round 14, finding 2: the fetch counts parser-refused rows so
    // a hole refusal can distinguish "provider served nothing" from
    // "we refused what it served".
    assert.match(script, /treasuryParserRefusals \+= 1;/);
    // #364 round 18, finding 2: an existing store never deepens on its
    // own, so the pre-flight refuses a store head later than this
    // build's requested start — which is also what keeps the manifested
    // requestedStartMs an honest term rather than a build artifact.
    assert.match(
      script,
      /headRow\.dateMs > TREASURY_FETCH_START_MS \+ 7 \* 86_400_000/,
      "the store-head refusal keeps requestedStartMs true by construction",
    );
  });

  // #364 round 23, finding 1: the top-up script evaluates its branches
  // in order on ONE captured $out, and the round-22 deferral means a
  // deferred integrity token shares that output with whatever the
  // roster walk threw — under the documented 429 blackout, a terminal
  // roster 429 is the NORMAL companion, not a corner. Grepped after
  // the 429 stand-down, a deterministic refusal would be downgraded
  // to a quota stand-down (exit 0) forever; the must-stay-red grep
  // therefore runs first, and this pin holds the order (the guard's
  // own exit-1-never-0 shape is pinned in tests/cacheClock.test.ts).
  it("the top-up script greps must-stay-red tokens before any stand-down", () => {
    const sh = readFileSync("scripts/ops/daily-cache-topup.sh", "utf8");
    const redGuard = sh.indexOf(
      "grep -qE 'cacheStoreUnreadable|cacheClockWitnessRefused|treasuryCoverageRefused|treasuryChunkHole'",
    );
    const quotaStandDown = sh.indexOf("providerQuotaExhausted");
    const clockStandDown = sh.indexOf("grep -q 'cacheClockMismatch'");
    assert.ok(redGuard >= 0, "the must-stay-red guard must exist");
    assert.ok(
      quotaStandDown >= 0 && redGuard < quotaStandDown,
      "must-stay-red tokens are checked before the 429 stand-down",
    );
    assert.ok(
      clockStandDown >= 0 && redGuard < clockStandDown,
      "must-stay-red tokens are checked before the clock stand-down",
    );
  });

  // #364 round 9, finding 1: the density pre-flight binds only the
  // corpus path. Its PLACEMENT is the law — above the thin-symbol skip
  // or outside the warm-only guard it kills the nightly launchd top-up
  // and the R0 rebuild mid-roster, on floors those runs' outputs are
  // never measured against — so the order and the guard are pinned as
  // source shapes, like the rest of this driver's wiring.
  it("asserts density only for manifested symbols on sweep runs — never under --warm-only, never on thin symbols", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    const thinSkip = script.indexOf("primaryBars.length < WARMUP_BARS * 2");
    const densityCall = script.indexOf("assertFiveMinuteDensity(`preflight:");
    assert.ok(thinSkip >= 0, "the thin-symbol skip must exist");
    assert.ok(
      densityCall > thinSkip,
      "density asserts BELOW the thin-symbol skip — a symbol that never " +
        "reaches the manifest is never judged by the door's floors",
    );
    assert.match(
      script,
      /if \(!args\.warmOnly\) \{\s*\n\s*try \{\s*\n\s*assertFiveMinuteDensity\(`preflight:/,
      "the assertion sits inside the !warmOnly guard — the top-up and " +
        "the rebuild produce no corpus and must survey, not die",
    );
    assert.match(
      script,
      /Full-roster density survey/,
      "a sweep refusal names the survey instrument",
    );
    assert.match(
      script,
      /would-refuse verdict, asserts nothing/,
      "the refusal describes the survey as it now behaves — reporting, " +
        "not merely printing",
    );
    // #364 round 32, finding 1: the survey RUNS the door in report
    // mode — same intersection facts, verdict logged, never thrown —
    // so a survey with no WOULD-REFUSE line is the door's own green,
    // not an operator's eyeball of raw rows/day against floors stated
    // in another file. The else arm must sit on the sweep pre-flight's
    // guard (behind only comments), and its catch must log without
    // re-throwing: round 9's law — no mid-roster red under --warm-only
    // — holds.
    assert.match(
      script,
      /\} else \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*try \{\s*\n\s*assertFiveMinuteDensity\(`survey:\$\{symbol\}`/,
      "the warm-only arm runs the door under the survey: label",
    );
    const surveyIdx = script.indexOf("assertFiveMinuteDensity(`survey:");
    const surveyBranch = script.slice(
      surveyIdx,
      script.indexOf("\n    }\n", surveyIdx),
    );
    assert.match(
      surveyBranch,
      /catch \(error\) \{\s*\n\s*console\.log\(/,
      "the survey branch LOGS the door's verdict",
    );
    assert.match(
      surveyBranch,
      /density WOULD REFUSE at this depth/,
      "the survey names its verdict as the door's would-refuse",
    );
    assert.doesNotMatch(
      surveyBranch,
      /throw/,
      "the survey branch never throws — a violator cannot kill the " +
        "top-up or the rebuild mid-roster",
    );
    // #364 round 10: the survey line prints for EVERY symbol — an empty
    // 5-minute store prints "0 rows" (the survey is the only layer that
    // can surface a total feed loss), and the shared-window counts are
    // computed from the raw arrays and carried to both the pre-flight
    // assertion and the manifest.
    assert.match(
      script,
      /`density 5min \$\{series\["5min"\]\.count\} rows`/,
      "an empty 5-minute store still prints its survey line",
    );
    // #364 round 11, finding 3: the print's POSITION is load-bearing
    // too — the thin-symbol exemption is justified by "its store still
    // shows in the survey line above", and both docs promise the
    // nightly log is a full-roster survey, so the print must stay
    // ABOVE the thin-symbol skip.
    const printIdx = script.indexOf("density 5min");
    assert.ok(
      printIdx >= 0 && printIdx < thinSkip,
      "the survey line prints ABOVE the thin-symbol skip — thin " +
        "symbols belong to the full-roster survey even though the " +
        "floors never judge them",
    );
    assert.match(
      script,
      /const crossSeriesDensity = crossSeriesDensityFacts\(\s*\n?\s*fiveMinuteBars,\s*\n?\s*primaryBars,?\s*\n?\s*\)/,
      "the shared-window counts come from the raw arrays the driver holds",
    );
    assert.match(
      script,
      /crossSeriesDensity,\s*\n\s*series,\s*\n\s*symbol,/,
      "the pre-flight assertion receives the shared-window fact",
    );
    assert.match(
      script,
      /crossSeriesClock: registration,\s*\n\s*crossSeriesDensity,/,
      "the manifest symbol entry carries the shared-window fact",
    );
  });

  // #364 round 1, finding 1: starvation-audit read the driver's stdout
  // table by POSITION and had already drifted once silently (notWarm's
  // insertion left geometryKill summing noConsensus + belowConf — the
  // amendment-25 gate deciding starvation from the wrong columns);
  // R1b's unresolv column would have drifted it again. The audit now
  // resolves columns by name from the header and refuses a table
  // missing a required name; this pin holds the two sources together —
  // every name the audit consumes must exist in the driver's header —
  // so a future column insert breaks HERE, never silently there. Both
  // files run main() on import, hence source pins.
  it("the starvation audit's required columns all exist in the driver's header, resolved by name", () => {
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    const audit = readFileSync("scripts/starvation-audit.ts", "utf8");
    const headerBlock = driver.match(
      /const rows: string\[\]\[\] = \[\[([\s\S]*?)\]\];/,
    );
    assert.ok(headerBlock, "driver must declare its stdout header literally");
    const headerNames = [...headerBlock![1].matchAll(/"(\w+)"/g)]
      .map((m) => m[1]);
    const auditNames = (label: string) => {
      const block = audit.match(
        new RegExp(`const ${label} = \\[([\\s\\S]*?)\\] as const;`),
      );
      assert.ok(block, `audit must declare ${label} literally`);
      return [...block![1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
    };
    for (const name of [
      ...auditNames("NEED_COLUMNS"),
      ...auditNames("OPTIONAL_COLUMNS"),
    ]) {
      assert.ok(
        headerNames.includes(name),
        `audit consumes column "${name}" which the driver's header does not carry`,
      );
    }
    // The positional accessor shape is gone for good.
    assert.doesNotMatch(audit, /const n = \(i: number\)/);
    assert.match(audit, /index\.has\(name\)/);
  });

  // #364 rounds 14 and 18: unresolv (the resolver's defect bucket) and
  // dataAbsent (R1b's no-bars data fact — pre-R1b these decisions
  // landed in planRejected) BOTH leave both sides of the survival
  // arithmetic — counting either as a survivor biases survival up and
  // the amendment-25 gate under-flags. Executed against a synthetic
  // table, since source pins cannot run arithmetic — and against TWO
  // split rows (#364 round 20, finding 3): a real table carries one
  // row per (symbol, split), so this fixture takes the cross-split
  // rollup branch, which summed a hand-maintained key list nothing
  // executed (single-row fixtures never entered the merge) until it
  // was rewritten to iterate the parsed row's own keys. Totals:
  // decisions 100, pre-geometry blocks 30, unresolv 8, dataAbsent 12
  // → reached 50; kills 45 → survival 10% and STARVED. Every column
  // the survival arithmetic or the printout consumes carries a
  // NONZERO second-split value, so freezing it at the first split's
  // value moves the printed totals and fails the match; belowConf and
  // setups are the two no printed figure consumes (#364 round 21,
  // smaller — their freeze is unobservable to this regex and made
  // impossible by the own-keys mechanism instead).
  it("the audit's survival excludes unresolv AND dataAbsent from both sides, summed across splits — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-"));
    const log = join(dir, "sweep.log");
    writeFileSync(
      log,
      [
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        // Each split row is a table a real run could emit: setups =
        // decisions − Σ rejections and dataAbsent ⊆ setups (#364
        // round 19, smaller) hold per row (train 50−43=7 with 6 ⊆ 7,
        // test 50−44=6 with 6 ⊆ 6).
        "EURUSD baseline train 50 5 3 1 2 4 22 3 1 2 6 7",
        "EURUSD baseline test 50 3 4 3 3 2 18 5 3 3 6 6",
        // #364 round 31, finding 1: an all-data-absent market — no
        // geometry kill, every emitted setup marked (setups 20 ==
        // dataAbsent 20) — has a ZERO geometry denominator and must
        // read NO VERDICT, never survival 0% → STARVED.
        "GBPUSD baseline test 20 0 0 0 0 0 0 0 0 0 20 20",
        // #364 round 32, finding 3: a THIN geometry denominator — two
        // decisions reached geometry and both died — prints survival
        // 0% but withholds the flag below --min-reached (default 30):
        // 0-of-2 is not evidence of starvation. Row identity holds:
        // setups = 20 − 14 = 6 with dataAbsent 6 ⊆ 6, and reached =
        // planRejected 1 + belowConf 0 + belowPayoff 1 + (6 − 6) = 2.
        "XCUSD baseline test 20 3 3 0 2 2 1 2 0 1 6 6",
        // #364 round 36, finding 3: the second no-verdict SHAPE —
        // every decision dying at the pre-geometry gates (setups 0,
        // dataAbsent 0; identity: 20 − (10+5+0+3+2) = 0) — so the
        // passing summary must name both no-verdict causes apart,
        // beside a judged market.
        "NZDUSD baseline test 20 10 5 0 3 2 0 0 0 0 0 0",
        "",
      ].join("\n"),
    );
    // --no-install fails fast instead of reaching the network if the
    // local tsx bin is missing; the timeout turns a resolution stall
    // into a failure rather than a suite hang (#364 round 15, smaller).
    const out = execFileSync(
      "npx",
      ["--no-install", "tsx", "scripts/starvation-audit.ts", log, "--report"],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    assert.match(out, /EURUSD\s+100\s+50\s+40\s+5\s+10%\s+STARVED/);
    // The zero-denominator market prints "—" and a named cause, sorts
    // last, and stays out of the flagged tally (#364 round 31).
    assert.match(
      out,
      /GBPUSD\s+20\s+0\s+0\s+0\s+—\s+no verdict — geometry killed 0; all 20 emitted setups carry the data-absence marker/,
    );
    // The thin-denominator market prints its ratio with the flag
    // withheld (#364 round 32, finding 3)…
    assert.match(
      out,
      /XCUSD\s+20\s+2\s+1\s+1\s+0%\s+thin sample — 2 reached geometry \(< 30\); flag withheld/,
    );
    // …and the summary's denominator holds only judged markets, with
    // every exclusion named by cause (#364 round 32, finding 2) — the
    // two no-verdict shapes named apart on the PASSING line (#364
    // round 36, finding 3).
    assert.match(
      out,
      /NZDUSD\s+20\s+0\s+0\s+0\s+—\s+no verdict — nothing reached the geometry stage/,
    );
    assert.match(
      out,
      /1 of 1 markets flagged \(1 thin sample below 30 reached; 1 no verdict — all emitted setups data-absent; 1 no verdict — nothing reached the geometry stage\)/,
    );
    // Same table under --min-reached 1: the floor is an argv value the
    // path filter must NOT read as a log path (readFileSync("1") would
    // fail the run), and beneath it XCUSD's 0-of-2 is judged — STARVED
    // joins the tally and the thin-sample partition empties.
    const floored = execFileSync(
      "npx",
      [
        "--no-install",
        "tsx",
        "scripts/starvation-audit.ts",
        log,
        "--min-reached",
        "1",
        "--report",
      ],
      { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
    );
    assert.match(floored, /XCUSD\s+20\s+2\s+1\s+1\s+0%\s+STARVED/);
    assert.match(
      floored,
      /2 of 2 markets flagged \(1 no verdict — all emitted setups data-absent; 1 no verdict — nothing reached the geometry stage\)/,
    );
    // The floor in effect prints on EVERY run (#364 round 33, smaller):
    // the floored run has zero thin-sample rows, so this line is the
    // unconditional echo, not the flag text — a clean run and a
    // --min-reached override are reconcilable from the log alone.
    assert.match(
      out,
      /flag floor: survival flags withheld below 30 reached geometry \(--min-reached\)/,
    );
    assert.match(
      floored,
      /flag floor: survival flags withheld below 1 reached geometry/,
    );
    // #364 round 33, smaller: the flag's value is OWNED by the flag, not
    // pattern-matched — "1e2" is a number to Number() but was not a
    // number to the old bare-number regex, so it reached readFileSync as
    // a log path and the gate failed for the wrong reason. Under floor
    // 100 every market here is excluded (EURUSD reached 50 and XCUSD 2
    // are thin, GBPUSD has no verdict), which must also take the
    // round-33 all-excluded REFUSAL, not print "0 of 0 markets flagged"
    // — and --report cannot suppress it (finding 1).
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/starvation-audit.ts",
            log,
            "--min-reached",
            "1e2",
            "--report",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) => {
        const failed = error as { stderr?: string; stdout?: string };
        const stderr = String(failed.stderr ?? "");
        return (
          /every market fell outside the judged denominator/.test(stderr) &&
          /2 thin sample below 100 reached; 1 no verdict — all emitted setups data-absent; 1 no verdict — nothing reached the geometry stage/
            .test(stderr) &&
          // #364 rounds 34–35: all three causes are present here, so
          // all three routed remedies print — the dial for the thin
          // share, the feed for the all-marked share, the gates for
          // the nothing-reached share.
          /lower --min-reached with the per-row evidence in hand/
            .test(stderr) &&
          /no --min-reached value recovers a zero geometry denominator/
            .test(stderr) &&
          /review windows were never consulted/.test(stderr) &&
          !/no such file/i.test(stderr) &&
          !/markets flagged/.test(String(failed.stdout ?? ""))
        );
      },
      "floor 100 excludes every market — the gate must refuse, with the " +
        "flag value consumed as a value rather than opened as a path",
    );
    // #364 round 35, finding 1: the walker gives --min-reached
    // ownership of the next token unconditionally, so num() must
    // REFUSE a token it cannot parse. The silent fallback that stood
    // for one round used the default floor AND dropped the eaten log
    // from the path list — "--min-reached shard-a.log shard-b.log"
    // judged shard-b alone, with none of the per-file refusals able to
    // fire on the vanished shard (the pattern-match the walker
    // replaced could not eat a filename, so the hole was the walker's
    // own).
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/starvation-audit.ts",
            "--min-reached",
            log,
            log,
            "--report",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /--min-reached owns the token after it and cannot read ".*sweep\.log" as a number/
          .test(String((error as { stderr?: string }).stderr ?? "")),
      "a flag typed without its number must refuse, never eat a log path",
    );
  });

  // #364 round 34, finding 1: the refusal's remedies route by CAUSE. On
  // an ALL-no-verdict roster — the dominant shape, since a bounded pilot
  // over sparse floorless classes emits every setup marked — the floor
  // dial is INERT (the null-survival branch fires before the floor is
  // consulted; --min-reached 0 changes nothing), so offering it sent the
  // operator to a dial that cannot clear the condition. The refusal must
  // name only the data remedy here.
  it("the all-no-verdict refusal offers the data remedy, never the inert floor dial — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-nov-"));
    const log = join(dir, "sweep.log");
    writeFileSync(
      log,
      [
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        "GBPUSD baseline test 20 0 0 0 0 0 0 0 0 0 20 20",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          ["--no-install", "tsx", "scripts/starvation-audit.ts", log, "--report"],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) => {
        const stderr = String((error as { stderr?: string }).stderr ?? "");
        return (
          /every market fell outside the judged denominator \(1 no verdict — all emitted setups data-absent\)/
            .test(stderr) &&
          /no --min-reached value recovers a zero geometry denominator/
            .test(stderr) &&
          // #364 round 35, finding 3: this roster is the ALL-MARKED
          // shape, so the feed remedy prints and the pre-geometry
          // remedy (like the dial) does not.
          /data-absence marker: deepen the sweep window or restore the feed's gradeable-bar coverage/
            .test(stderr) &&
          !/review windows were never consulted/.test(stderr) &&
          !/lower --min-reached/.test(stderr)
        );
      },
      "an all-no-verdict roster must not be offered the floor dial",
    );
  });

  // #364 round 35, finding 3: the no-verdict bucket is two shapes with
  // opposite remedies, and the per-row flag already discriminates them.
  // Every decision here dies at the pre-geometry gates (session 10,
  // news 5, regime 3, consensus 2 of 20 decisions; zero setups, zero
  // dataAbsent), so the review windows were never consulted and the
  // feed-coverage advice is inert — the refusal must name the gates and
  // the window placement instead, and still never the floor dial.
  it("the all-pre-geometry refusal names the gates, never the feed or the dial — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-pregeo-"));
    const log = join(dir, "sweep.log");
    writeFileSync(
      log,
      [
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        // Identity holds: setups = 20 − (10+5+0+3+2+0+0+0) = 0, and
        // reached = 20−10−5−0−3−2−0−0 = 0 with dataAbsent 0.
        "NZDUSD baseline test 20 10 5 0 3 2 0 0 0 0 0 0",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          ["--no-install", "tsx", "scripts/starvation-audit.ts", log, "--report"],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) => {
        const failed = error as { stderr?: string; stdout?: string };
        const stderr = String(failed.stderr ?? "");
        return (
          /every market fell outside the judged denominator \(1 no verdict — nothing reached the geometry stage\)/
            .test(stderr) &&
          /nothing reached the geometry stage: the review windows were never consulted/
            .test(stderr) &&
          /pre-geometry gates \(session, news, warm-up, regime, consensus\) or the window placement/
            .test(stderr) &&
          !/gradeable-bar coverage/.test(stderr) &&
          !/lower --min-reached/.test(stderr) &&
          /no verdict — nothing reached the geometry stage/
            .test(String(failed.stdout ?? ""))
        );
      },
      "a pre-geometry no-verdict roster must be routed to the gates, " +
        "not the feed",
    );
  });

  // #364 round 34, finding 2: "which flags take a value" must be written
  // down ONCE. num() refuses a flag outside VALUE_FLAGS at runtime (every
  // executed run above exercises it at module load); this scan holds the
  // same law at source, the round-28 vocabulary-scan shape, across every
  // dialed reader — the three path-walker files (starvation-audit,
  // account-type-report, grid-totalr, all on the same sequential walker
  // since #364 round 38) and sweep-analysis, whose VALUE_FLAGS feeds the
  // refusals alone since it collects no positional paths. A guarded call
  // site added without joining VALUE_FLAGS fails here even if the
  // runtime guard is ever removed.
  it("every num() flag is declared in VALUE_FLAGS, and num() refuses undeclared flags — every reader with a numeric dial", () => {
    // #364 round 36 widened the law past the two walker files: any
    // reader with a numeric dial declares its value-taking flags ONCE
    // and refuses both an undeclared flag and an unparseable token —
    // sweep-analysis's bare Number() had made a mistyped --min-n into
    // NaN and silently disabled every thin marker (x < NaN is false),
    // and grid-totalr kept the name list and the accessors as two
    // places for one fact.
    for (
      const file of [
        "scripts/starvation-audit.ts",
        "scripts/account-type-report.ts",
        "scripts/sweep-analysis.ts",
        "scripts/grid-totalr.ts",
        // #364 round 44, smaller: the two 4d scripts carried an
        // INVERTED walker — a list of the flags taking no value, with
        // every other --flag consuming the next token — so a typo'd or
        // newly-added boolean flag ate the shard path after it and the
        // run graded (and under confirm-4d, BURNED) a corpus one shard
        // short. They now carry the same positive declaration, inside
        // the same bidirectional law.
        "scripts/confirm-4d.ts",
        "scripts/derive-4d.ts",
      ]
    ) {
      const source = readFileSync(file, "utf8");
      const declared = source.match(/const VALUE_FLAGS = new Set\(\[([^\]]*)\]\)/);
      assert.ok(declared, `${file} must declare VALUE_FLAGS literally`);
      const flags = [...declared![1].matchAll(/"(--[\w-]+)"/g)].map((m) => m[1]);
      const reads = [...source.matchAll(/(?:num|str)\("(--[\w-]+)"/g)]
        .map((m) => m[1]);
      assert.ok(reads.length > 0, `${file} must read at least one guarded flag`);
      for (const flag of reads) {
        assert.ok(
          flags.includes(flag),
          `${file}: a guarded accessor reads "${flag}" which VALUE_FLAGS does ` +
            `not declare — its value would be walked into the path list`,
        );
      }
      // #364 round 37, finding 2: the law is BIDIRECTIONAL — every
      // declared value flag must be read through a guarded accessor
      // (num() or str()), or it sits in the Set eating tokens with
      // neither refusal, which was exactly --baseline's gap.
      for (const flag of flags) {
        assert.ok(
          new RegExp(`(?:num|str)\\("${flag}"`).test(source),
          `${file}: VALUE_FLAGS declares ${flag} with no guarded accessor ` +
            `reading it`,
        );
      }
      assert.match(
        source,
        /if \(!VALUE_FLAGS\.has\(arg\)\) \{\s*\n\s*throw new Error\(/,
        `${file}: num() must refuse a flag outside VALUE_FLAGS`,
      );
      // #364 round 35, finding 1 (widened round 36): a present but
      // unparseable token refuses — never a silent fallback.
      assert.match(
        source,
        /if \(!Number\.isFinite\(parsed\)\) \{\s*\n\s*throw new Error\(/,
        `${file}: num() must refuse a token it cannot parse`,
      );
    }
  });

  // #364 round 36, finding 1 + smaller: the token refusal executed in
  // the two readers rounds 33–35 never reached. Neither run needs a
  // corpus — both files read the dial BEFORE their usage checks, so
  // the specific refusal wins, and grid-totalr's shard path is never
  // opened.
  it("sweep-analysis and grid-totalr refuse a dial typed without its number — executed", () => {
    assert.throws(
      () =>
        execFileSync(
          "npx",
          ["--no-install", "tsx", "scripts/sweep-analysis.ts", "--min-n"],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /--min-n owns the token after it and cannot read a missing value as a number/
          .test(String((error as { stderr?: string }).stderr ?? "")),
      "sweep-analysis must refuse — NaN would disable every thin marker",
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/grid-totalr.ts",
            "never-opened.jsonl",
            "--permutations",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /--permutations owns the token after it and cannot read a missing value as a number/
          .test(String((error as { stderr?: string }).stderr ?? "")),
      "grid-totalr must refuse — a NaN dial silently refuses every variant",
    );
  });

  // #364 round 33, finding 1: a table that PARSES cleanly but leaves
  // the judged denominator at zero — every market thin-sample or
  // no-verdict at the DEFAULT floor — must refuse rather than print
  // "0 of 0 markets flagged" and exit 0, the exact false green the
  // zero-row rule closed for unparsable tables (round 20). This is the
  // bounded-pilot shape over sparse floorless classes: the run whose
  // green matters most.
  it("the audit refuses a roster whose every market is thin or no-verdict — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-allex-"));
    const log = join(dir, "sweep.log");
    writeFileSync(
      log,
      [
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        // No verdict: every emitted setup carries the marker, geometry
        // killed nothing (reached 0).
        "GBPUSD baseline test 20 0 0 0 0 0 0 0 0 0 20 20",
        // Thin at the default floor: reached 2 (< 30), both killed.
        "XCUSD baseline test 20 3 3 0 2 2 1 2 0 1 6 6",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          ["--no-install", "tsx", "scripts/starvation-audit.ts", log, "--report"],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) => {
        const failed = error as { stderr?: string; stdout?: string };
        const stdout = String(failed.stdout ?? "");
        return (
          /every market fell outside the judged denominator \(1 thin sample below 30 reached; 1 no verdict — all emitted setups data-absent\)/
            .test(String(failed.stderr ?? "")) &&
          // The per-market table still prints — the causes are the
          // evidence — but the false-green summary never does.
          /XCUSD\s+20\s+2\s+1\s+1\s+0%\s+thin sample/.test(stdout) &&
          !/markets flagged/.test(stdout)
        );
      },
      "a gate that judged nothing must refuse even under --report",
    );
  });

  // #364 round 19, finding 1: the capture-all refusal is a GUARD, not
  // advice — the driver stamps "# capture-all" above such a table
  // (acceptance gates untallied, belowConf/belowPayoff print 0, so
  // survival computed from it is a false green on a gate that exits 1)
  // and the audit refuses the marker like a missing required column.
  it("the audit refuses a capture-all table by its stamped marker — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-ca-"));
    const log = join(dir, "sweep.log");
    writeFileSync(
      log,
      [
        "# capture-all — acceptance gates untallied; starvation-audit " +
        "refuses this table",
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        "EURUSD baseline test 100 10 10 0 5 5 40 10 0 0 10 20",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/starvation-audit.ts",
            log,
            "--report",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /--capture-all table/.test(String((error as { stderr?: string }).stderr ?? "")),
    );
    // The driver's stamp exists at source, so the marker the audit
    // trusts is one the sweep actually writes.
    assert.match(
      readFileSync("scripts/replay-sweep.ts", "utf8"),
      /# capture-all — acceptance gates untallied/,
    );
  });

  // #364 round 20, finding 2: parse() returning zero rows used to fall
  // through to "0 of 0 markets flagged" and exit 0 — the amendment-25
  // gate reporting a clean pass having measured nothing. Both reachable
  // shapes execute here: a survey log (--warm-only and --discover print
  // the driver's full header and no data rows — the nightly launchd
  // log's exact shape) and a --grid table with no baseline variant
  // (parse keeps baseline rows only). --report is passed to prove this
  // is a refusal, not a verdict: it cannot be acknowledged away.
  it("the audit refuses a table it parsed zero rows from — executed (header-only and grid-only)", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-zero-"));
    const header =
      "symbol variant split decisions sessionBlk newsBlk notWarm " +
      "regimeBlk noConsensus planRejected unresolv belowConf " +
      "belowPayoff dataAbsent setups";
    const headerOnly = join(dir, "warm-only.log");
    writeFileSync(headerOnly, [header, ""].join("\n"));
    const gridOnly = join(dir, "grid.log");
    writeFileSync(
      gridOnly,
      [
        header,
        "EURUSD tp1AtrMultiplier=0.5 test 100 10 10 0 5 5 40 10 0 5 10 15",
        "",
      ].join("\n"),
    );
    for (const log of [headerOnly, gridOnly]) {
      assert.throws(
        () =>
          execFileSync(
            "npx",
            [
              "--no-install",
              "tsx",
              "scripts/starvation-audit.ts",
              log,
              "--report",
            ],
            { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
          ),
        (error: unknown) =>
          /parsed zero baseline rows/.test(
            String((error as { stderr?: string }).stderr ?? ""),
          ),
        `${log} must refuse rather than report 0 of 0 markets flagged`,
      );
    }
    // #364 round 21, finding 2: the refusal is per FILE, not per
    // invocation — a zero-row shard log refuses BY NAME even when a
    // healthy table rides beside it (the dead-shard shape: checked on
    // the flattened result, its markets simply vanished from the
    // roster and the gate returned a verdict over a partial roster).
    const realTable = join(dir, "real.log");
    writeFileSync(
      realTable,
      [
        header,
        "EURUSD baseline test 100 10 10 0 5 5 40 10 0 5 10 15",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/starvation-audit.ts",
            realTable,
            headerOnly,
            "--report",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /warm-only\.log: parsed zero baseline rows/.test(
          String((error as { stderr?: string }).stderr ?? ""),
        ),
      "a zero-row file must refuse even beside a healthy table",
    );
  });

  // #364 round 21, smaller: an absent optional column reads 0, which
  // means "unknown", not "none" — summing a pre-R1b table (no
  // notWarm/unresolv/dataAbsent columns) with a post-R1b one
  // subtracts less than the runs produced and biases survival UP, the
  // round-18 direction. Headers that disagree on an optional name
  // refuse rather than blend.
  it("the audit refuses to blend tables whose headers disagree on optional columns — executed", () => {
    const dir = mkdtempSync(join(tmpdir(), "starv-mixed-"));
    const oldLog = join(dir, "pre-r1b.log");
    writeFileSync(
      oldLog,
      [
        "symbol variant split decisions sessionBlk newsBlk regimeBlk " +
        "noConsensus planRejected belowConf belowPayoff setups",
        "EURUSD baseline test 100 10 10 5 5 40 0 5 25",
        "",
      ].join("\n"),
    );
    const newLog = join(dir, "post-r1b.log");
    writeFileSync(
      newLog,
      [
        "symbol variant split decisions sessionBlk newsBlk notWarm " +
        "regimeBlk noConsensus planRejected unresolv belowConf " +
        "belowPayoff dataAbsent setups",
        "EURUSD baseline test 100 10 10 0 5 5 40 10 0 5 10 15",
        "",
      ].join("\n"),
    );
    assert.throws(
      () =>
        execFileSync(
          "npx",
          [
            "--no-install",
            "tsx",
            "scripts/starvation-audit.ts",
            oldLog,
            newLog,
            "--report",
          ],
          { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 },
        ),
      (error: unknown) =>
        /audited separately, never blended/.test(
          String((error as { stderr?: string }).stderr ?? ""),
        ),
    );
  });

  // #364 round 3, finding 4: by-name reading is only as safe as the
  // header being in the DATA ROW's order — insert a header column
  // without its row expression (or the reverse) and every by-name
  // lookup past the insertion reads the neighbour. This holds the two
  // literals together position by position; a new column must be added
  // to the header, the push, AND this mapping in the same change.
  it("the driver's data row is in its own header's order, field by field", () => {
    const driver = readFileSync("scripts/replay-sweep.ts", "utf8");
    const headerNames = [
      ...driver.match(
        /const rows: string\[\]\[\] = \[\[([\s\S]*?)\]\];/,
      )![1].matchAll(/"(\w+)"/g),
    ].map((m) => m[1]);
    const pushBlock = driver.match(/rows\.push\(\[\s*\n([\s\S]*?)\]\);/);
    assert.ok(pushBlock, "driver must push its data row as one literal");
    const fields = pushBlock![1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));
    const rowExpression: Record<string, RegExp> = {
      belowConf: /belowConfidence/,
      belowPayoff: /belowPayoff/,
      dataAbsent: /summary\.dataAbsent/,
      decisions: /decisionPoints/,
      expectancyR: /expectancyR/,
      newsBlk: /newsBlocked/,
      noConsensus: /noConsensus/,
      notWarm: /notWarm/,
      planRejected: /planRejected/,
      regimeBlk: /regimeBlocked \+ result\.rejections\.regimeGated/,
      sessionBlk: /sessionBlocked/,
      setups: /summary\.total/,
      split: /split\.name/,
      stopRate: /stopRate/,
      symbol: /^symbol,$/,
      tp1HitRate: /tp1HitRate/,
      unfilled: /summary\.unfilled/,
      unresolv: /unresolvable/,
      variant: /^variant,$/,
    };
    assert.equal(
      fields.length,
      headerNames.length,
      "header and data row must carry the same number of columns",
    );
    headerNames.forEach((name, position) => {
      const pattern = rowExpression[name];
      assert.ok(
        pattern,
        `header column "${name}" has no row-expression mapping — extend this pin with the new column`,
      );
      assert.match(
        fields[position],
        pattern,
        `row position ${position} must carry ${name}`,
      );
    });
  });
});
