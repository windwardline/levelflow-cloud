import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readRejectionLedger } from "../scripts/sweepStats.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * The rejection ledger, and the fact that it reaches disk at all.
 *
 * `simulateSymbol` has built `rejectionLedger` since 2026-08-24 — one entry per
 * DECLINED decision, with its instant and reason — and the driver never read
 * it. Every run assembled the account and threw it away: the same field-lost-
 * in-transit shape as #457, #471 and #484, one layer further down.
 *
 * It matters because seven of the eleven rejection reasons emit no outcome row
 * at all. A rejected decision was an incremented integer and nothing else, so
 * recoverability tracked DIRECTION rather than effort — a divergence where the
 * sweep is more PERMISSIVE than live leaves rows a reader can find and prune,
 * while one where it is more RESTRICTIVE leaves nothing. Four of the eleven
 * measured divergences are sweep-restrictive.
 *
 * `decisions[]` (#483) records the COUNTS. This records WHICH INSTANTS, which
 * is what makes those four measurable: a reader can join the declined instants
 * against live's behaviour at the same instants and count what live would have
 * admitted.
 */

// The same shapes tests/sweep.test.ts uses, and for the same reason: the
// decision loop refuses until the daily series is 40 deep at a real instant,
// so a series stamped from the epoch produces zero decision points and every
// assertion below would pass having measured nothing.
const startTime = Date.UTC(2024, 0, 2, 14, 30);

function dailyBars(count: number): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
    high: 103.2,
    low: 96.8,
    open: 100,
    time: startTime - count * 86_400_000 + index * 86_400_000,
    volume: 10_000,
  }));
}

function triangleBars(count: number, period = 20, amplitude = 4): Bar[] {
  return Array.from({ length: count }, (_, index) => {
    const position = index % period;
    const half = period / 2;
    const value = position < half
      ? 98 + (amplitude / half) * position
      : 98 + amplitude - (amplitude / half) * (position - half);
    return {
      close: value,
      high: value + 0.3,
      low: value - 0.3,
      open: value,
      time: startTime + index * 900_000,
      volume: 1_000,
    };
  });
}

const base = {
  calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
  dailyBars: dailyBars(80),
  primaryBars: triangleBars(600),
  stepBars: 16,
  symbol: "EURUSD" as const,
  warmupBars: 120,
};

describe("the engine records which decisions it declined, not just how many", () => {
  const result = simulateSymbol({
    ...base,
    calibrationOverride: { ...base.calibrationOverride, minRewardRisk: 50 },
  });
  const byReason: Record<string, number> = {};
  for (const entry of result.rejectionLedger) {
    byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
  }

  it("produces a fixture that actually rejects, on more than one ground", () => {
    // NON-VACUITY. Every assertion below is a comparison, and a fixture that
    // rejected nothing would satisfy all of them having measured nothing.
    assert.ok(
      result.decisionPoints > 0,
      "the decision loop never ran — the daily series is probably stamped " +
        "somewhere the completion gate will not admit",
    );
    assert.ok(
      Object.keys(byReason).length >= 3,
      `the ledger carries ${Object.keys(byReason).length} distinct reasons; ` +
        `one would not exercise the per-reason comparison`,
    );
  });

  it("matches the counters reason by reason", () => {
    for (const [reason, count] of Object.entries(byReason)) {
      assert.equal(
        result.rejections[reason as keyof typeof result.rejections],
        count,
        `${reason}: the counter and the ledger disagree, so one of them is ` +
          `not the account of what this run declined`,
      );
    }
  });

  it("carries an instant on every entry — the counters' whole shortfall", () => {
    for (const entry of result.rejectionLedger) {
      assert.ok(
        Number.isFinite(entry.time) && entry.time > 0,
        "an entry without its instant cannot be joined to live's behaviour " +
          "at that instant, which is the only reason the counters were not " +
          "enough",
      );
      assert.ok(
        Object.hasOwn(result.rejections, entry.reason),
        `${entry.reason} is not a counter — the reason type is derived from ` +
          `the struct precisely so the two cannot drift`,
      );
    }
  });

  it("keeps belowThreshold an AGGREGATE, and holds it to its own identity", () => {
    // The one counter with no ledger rows, deliberately: it counts the three
    // branches of the acceptance gate, so appending there would double-count
    // every rejection at that gate. Asserted rather than skipped — if a fourth
    // branch is added and left out of the aggregate, it under-counts silently,
    // and the exclusion below would hide that instead of catching it.
    assert.equal(
      byReason.belowThreshold,
      undefined,
      "belowThreshold gained ledger rows, which double-counts the gate",
    );
    assert.equal(
      result.rejections.belowThreshold,
      result.rejections.belowConfidence + result.rejections.belowPayoff +
        result.rejections.regimeGated,
      "the aggregate no longer equals the branches it aggregates",
    );
    assert.equal(
      result.rejectionLedger.length,
      Object.values(result.rejections).reduce((sum, count) => sum + count, 0) -
        result.rejections.belowThreshold,
      "the ledger and the counters differ by something other than the " +
        "documented aggregate",
    );
  });
});

describe("a short ledger refuses rather than reading as a quieter sweep", () => {
  const write = (rows: unknown[]) => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-"));
    const emitPath = join(dir, "run.jsonl");
    writeFileSync(emitPath, "");
    writeFileSync(
      `${emitPath}.rejections.jsonl`,
      rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""),
    );
    return emitPath;
  };
  const row = (time: number) => ({
    holdout: false,
    reason: "sessionBlocked",
    split: "fit",
    symbol: "EURUSD",
    time,
    variant: "baseline",
  });

  it("reads a ledger whose count matches the manifest", () => {
    const emitPath = write([row(1), row(2)]);
    const { rows, unverifiable } = readRejectionLedger(emitPath, {
      rejectionLedgerRows: 2,
    });
    assert.equal(unverifiable, false);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].reason, "sessionBlocked");
  });

  it("refuses a TRUNCATED ledger", () => {
    // The direction a reader will not question: fewer declined decisions looks
    // like a sweep that declined less, which is the answer they were hoping
    // for. It has to be an error rather than a smaller number.
    const emitPath = write([row(1)]);
    assert.throws(
      () => readRejectionLedger(emitPath, { rejectionLedgerRows: 2 }),
      /holds 1 rows and the manifest records 2/,
    );
  });

  it("refuses a MISSING ledger the manifest claims", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-none-"));
    const emitPath = join(dir, "run.jsonl");
    writeFileSync(emitPath, "");
    assert.throws(
      () => readRejectionLedger(emitPath, { rejectionLedgerRows: 5 }),
      /does not exist/,
    );
  });

  it("does NOT refuse a corpus that never claimed one", () => {
    // Every corpus written before the ledger genuinely has no sidecar.
    // Refusing those would retire the deliberate historical reads for a
    // capability check, so the caller is told it could not verify.
    const dir = mkdtempSync(join(tmpdir(), "ledger-legacy-"));
    const emitPath = join(dir, "run.jsonl");
    writeFileSync(emitPath, "");
    const { rows, unverifiable } = readRejectionLedger(emitPath, {});
    assert.equal(unverifiable, true);
    assert.deepEqual(rows, []);
  });

  it("counts zero as a claim, not as an absence", () => {
    // A run that declined nothing is a real corpus and an interesting one.
    // A falsy check in the manifest would have made it indistinguishable from
    // a run predating the ledger.
    const manifest = readFileSync("scripts/sweepManifest.ts", "utf8");
    assert.match(
      manifest,
      /input\.rejectionLedgerRows !== undefined &&/,
      "a zero-rejection run would be recorded as having no ledger at all",
    );
    const emitPath = write([]);
    const { rows, unverifiable } = readRejectionLedger(emitPath, {
      rejectionLedgerRows: 0,
    });
    assert.equal(unverifiable, false);
    assert.deepEqual(rows, []);
  });
});

describe("the driver writes it beside the emit, and says how many", () => {
  const DRIVER = readFileSync("scripts/replay-sweep.ts", "utf8");

  it("opens the sidecar only when the emit is open", () => {
    assert.match(
      DRIVER,
      /const rejectionStream = args\.emit\s*\n?\s*\? createWriteStream\(`\$\{args\.emit\}\.rejections\.jsonl`\)/,
      "the ledger is written somewhere other than beside its corpus",
    );
  });

  it("writes every ledger entry the engine produced", () => {
    assert.match(
      DRIVER,
      /for \(const entry of result\.rejectionLedger\) \{/,
      "the driver stopped reading the ledger — it was built and discarded for " +
        "a week before anyone noticed the first time",
    );
    // The join keys, without which the instants cannot be tied to a market.
    const at = DRIVER.indexOf("for (const entry of result.rejectionLedger) {");
    const body = DRIVER.slice(at, at + 500);
    for (const key of ["holdout", "reason", "split", "symbol", "time", "variant"]) {
      assert.match(
        body,
        new RegExp(`\\b${key}[,:]`),
        `the ledger row drops ${key}, so its instants cannot be joined`,
      );
    }
  });

  it("records the count in the manifest and closes the stream", () => {
    assert.match(DRIVER, /rejectionLedgerRows: rejectionRows,/);
    assert.match(
      DRIVER,
      /rejectionStream\.end\(/,
      "an unclosed stream can lose its tail, which is the truncation the " +
        "reader refuses — better not to write it",
    );
  });
});

/**
 * What each decision could SEE, recorded on the row that decided.
 *
 * Every sweep-live divergence in the enumeration is ultimately a visibility
 * question — which bars had completed, which events were in scope, which curve
 * row was published — and the corpus recorded the ANSWER without the inputs.
 * So a reader could not ask whether live's clock would have admitted one more
 * daily bar; it had to be re-derived by hand across fifteen consumers.
 *
 * Asserted by EXECUTION against a real simulation, because the whole class of
 * defect here is a field that exists on the type and is never populated — a
 * column of undefined reads exactly like a column of data.
 */
describe("the row says what the decision could see", () => {
  const result = simulateSymbol(base);

  it("produces rows at all", () => {
    assert.ok(
      result.outcomes.length > 0,
      "no rows — every assertion below would hold over an empty list",
    );
  });

  it("records each frame's own tail, for every frame it admitted", () => {
    for (const row of result.outcomes) {
      const frames = Object.keys(row.frameTailMs);
      assert.equal(
        frames.length,
        row.availableTimeframeCount,
        "the frame tails and the frame count disagree, so one of them is not " +
          "describing the context the decision read",
      );
      assert.ok(
        row.availableTimeframeCount >= 4,
        `${row.availableTimeframeCount} frames — the manifest states a floor ` +
          `of four by construction, and this row contradicts it`,
      );
      for (const [frame, tail] of Object.entries(row.frameTailMs)) {
        assert.ok(
          Number.isFinite(tail) && tail > 0,
          `${frame} carries no tail instant, which is the one thing the ` +
            `enumeration says it had to derive by hand`,
        );
        assert.ok(
          tail <= row.time,
          `${frame}'s tail (${tail}) is AFTER the decision instant ` +
            `(${row.time}) — the decision read a bar that had not completed`,
        );
      }
    }
  });

  it("records the daily window it was allowed to read", () => {
    for (const row of result.outcomes) {
      assert.ok(
        row.dailyVisibleCount >= 40,
        `${row.dailyVisibleCount} daily bars — below the loop's own floor, so ` +
          `this row should not exist`,
      );
      assert.ok(
        row.dailyTailCompleteAtMs <= row.time,
        "the newest daily bar completed AFTER the decision that read it, " +
          "which is the look-ahead 2a exists to prevent",
      );
    }
  });

  it("records the ABSENCE of news and curve as null, not zero", () => {
    for (const row of result.outcomes) {
      // EXACTLY zero, not merely an integer. `Number.isInteger` is satisfied
      // by a fabricated constant, and this fixture supplies no calendar at
      // all, so zero is the only honest answer.
      assert.equal(row.newsActiveCount, 0);
      assert.equal(row.newsUpcomingCount, 0);
      // NULL is a fact, not a gap: this fixture supplies no calendar and no
      // curve, and a reader must be able to tell "none visible" from "not
      // recorded". Zero would say the wrong one — it is a real instant.
      assert.equal(row.nextHighImpactMs, null);
      assert.equal(row.treasuryLabelMs, null);
    }
  });

  it("records the next high-impact INSTANT when a calendar is supplied", () => {
    // The absence test above cannot exercise the assignment at all — a
    // fixture with no events never enters that branch, so a mutation zeroing
    // the instant survived it. This supplies the calendar the branch needs.
    // Anchored to a REAL decision instant from the baseline run, not to a
    // fraction of the span. Decisions are sparse — ten rows across 150 hours
    // at `stepBars: 16` — so a proportional placement lands between them and
    // no row ever sees the event, which is how the first draft of this test
    // proved nothing while looking thorough.
    assert.ok(result.outcomes.length >= 3, "need a middle row to anchor to");
    const eventAt = result.outcomes[2].time + 2 * 60 * 60 * 1000;
    const withNews = simulateSymbol({
      ...base,
      newsEvents: [
        { currency: "EUR", impact: "high", name: "ECB Rate Decision", time: eventAt },
      ],
    });
    const sawIt = withNews.outcomes.filter((row) =>
      row.nextHighImpactMs !== null
    );
    assert.ok(
      sawIt.length > 0,
      "no row saw the event — it sits outside every decision's upcoming " +
        "horizon, so this fixture proves nothing about the instant",
    );
    for (const row of sawIt) {
      assert.equal(
        row.nextHighImpactMs,
        eventAt,
        "the row records something other than the event's own instant, which " +
          "is the only thing 483/484/502 can be measured against",
      );
      assert.ok(
        row.nextHighImpactMs! > row.time,
        "an UPCOMING event must sit ahead of the decision that saw it",
      );
      // The COUNT beside the instant. `Number.isInteger` in the absence test
      // is satisfied by zero, so nothing there could catch a hardcoded count —
      // this is the only place a real one exists to compare against.
      assert.ok(
        row.newsUpcomingCount >= 1,
        `the row records ${row.newsUpcomingCount} upcoming events while ` +
          `carrying the instant of one, so the count is not the population`,
      );
    }
  });

  it("names the columns in the emit so a reader can refuse a corpus short one", () => {
    // Ties this set to #479's capability check: the fields are only useful if
    // a reader can tell a corpus that lacks them from one where nothing was
    // visible.
    const columns = Object.keys(result.outcomes[0]);
    for (
      const field of [
        "frameTailMs",
        "availableTimeframeCount",
        "dailyVisibleCount",
        "dailyTailCompleteAtMs",
        "newsActiveCount",
        "newsUpcomingCount",
        "nextHighImpactMs",
        "treasuryLabelMs",
      ]
    ) {
      assert.ok(
        columns.includes(field),
        `${field} is on the type and not on the row — a column of undefined ` +
          `reads exactly like a column of data`,
      );
    }
  });
});
