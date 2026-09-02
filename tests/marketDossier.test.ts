import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  collect,
  type Collected,
  pinDivergence,
  RECONSTRUCTED,
} from "../scripts/market-dossier.ts";
import { getClassCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import { SEALED_FOLD, type SweepEmitRow } from "../scripts/sweepStats.ts";

// The dossier's re-gated pseudo-cell had folded TWO distinct grid cells
// into one accumulator (audit of the unaudited 4c/4d consumers,
// 2026-08-19): the PINNED threshold-0 cell, and the bare-baseline cell
// `{}`. `{}` applies no override, so the engine already gated it at the
// market's shipped threshold — the same decision points the branch
// reconstructs from the threshold-0 cell — and every outcome was counted
// twice. stats() then computed n, expectancy, se and the 95% interval
// over the duplicated sample, so se ran a factor of √2 low and markets
// under the MIN_FILLED floor cleared it on a doubled n.
//
// This file is also the first behavioural coverage this script has ever
// had. Its only prior test asserted the source text matched a regex,
// which is what let a sample-doubling join survive in a shipped reader.
//
// R4 act 1 (2026-09-02): the reader no longer re-cuts folds at 50/75% of
// the span. It reads the corpus through the sealed door and classifies
// each row by its EMITTED split, so the fixtures here carry split labels
// and the counts below are row counts, not halves of a span.
const BASELINE =
  "confidenceThreshold=0,runnerProtection=breakeven,maxStopAtrMultiplier=1,sizingHoursFactor=1";

const TEST_TREASURY_CURVE: TreasuryCurveFacts = {
  count: 3_000,
  firstTime: Date.UTC(2013, 0, 2),
  largestGapMs: 4 * 86_400_000,
  lastTime: Date.UTC(2027, 0, 1),
};

const DAY = 86_400_000;
const SYMBOL = "EURUSD";

// One calendar per fold, so a row's TIME says where the retired 50/75
// re-cut would have binned it and its LABEL says where the sweep did.
const FOLD_START: Record<string, number> = {
  [SEALED_FOLD]: Date.UTC(2025, 6, 1),
  fit: Date.UTC(2025, 0, 1),
  select: Date.UTC(2025, 3, 1),
  test: Date.UTC(2025, 3, 1),
  train: Date.UTC(2025, 0, 1),
};
const END = Date.UTC(2025, 9, 1);

function row(
  variant: string,
  dayIndex: number,
  score: number,
  split: string,
  realizedR = 0.5,
): SweepEmitRow {
  return {
    accepted: true,
    confidenceScore: score,
    outcome: realizedR < 0 ? "stop_loss" : "take_profit",
    realizedR,
    split,
    symbol: SYMBOL,
    time: (FOLD_START[split] ?? FOLD_START.select) + dayIndex * DAY +
      12 * 3_600_000,
    variant,
  } as SweepEmitRow;
}

/**
 * A corpus carrying BOTH cells over the same decision points — which is
 * what the real 4c grid emits: entry 0 is `{}` and entry 1 is the pinned
 * threshold-0 override.
 */
function twoCellRows(days: number, split: string, realizedR = 0.5): SweepEmitRow[] {
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < days; day += 1) {
    rows.push(row(BASELINE, day, 80, split, realizedR));
    rows.push(row("baseline", day, 80, split, realizedR));
  }
  return rows;
}

/** A shard beside its manifest: folded (fit/select/confirm) or legacy (train/test). */
function writeCorpus(rows: SweepEmitRow[], shape: "folded" | "legacy"): string {
  const dir = mkdtempSync(join(tmpdir(), "dossier-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(
    emitPath,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  const input: Parameters<typeof buildSweepManifest>[0] = {
    acceptance: { captureAll: false, ignoreLowEdge: false },
    analyzerVersion: "2026.08.09.test",
    anchor: "2026-08-11",
    barRejections: {},
    clock: { calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK },
    conditions: {
      availableTimeframeCount: "min-four-by-construction",
      macroAdjustment: "historical-treasury-curve",
      providerWarningCount: "zero-by-construction",
      spreadSource: "modeled-by-construction",
      weightAdjustment: "raw-engine-zero",
    },
    days: 365,
    generatedAt: "2026-08-11T05:00:00.000Z",
    grid: [{}, { confidenceThreshold: 0 }],
    stepBars: 16,
    symbols: [{
      calibration: {},
      providerSymbol: SYMBOL,
      series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
      symbol: SYMBOL,
    }],
    trainShare: 0.6,
    treasuryCurve: TEST_TREASURY_CURVE,
    warmupBars: 240,
  };
  if (shape === "folded") {
    input.folds = [
      {
        decisionEndMs: FOLD_START.select - 5 * DAY,
        endMs: FOLD_START.select,
        name: "fit",
        startMs: FOLD_START.fit,
      },
      {
        decisionEndMs: FOLD_START[SEALED_FOLD] - 5 * DAY,
        endMs: FOLD_START[SEALED_FOLD],
        name: "select",
        startMs: FOLD_START.select,
      },
      {
        decisionEndMs: END - 5 * DAY,
        endMs: END,
        name: SEALED_FOLD,
        startMs: FOLD_START[SEALED_FOLD],
      },
    ];
  }
  writeFileSync(
    `${emitPath}.manifest.json`,
    JSON.stringify(buildSweepManifest(input), null, 2) + "\n",
  );
  return emitPath;
}

const twoCellCorpus = (days: number) =>
  writeCorpus(twoCellRows(days, "test"), "legacy");

/** Everything collect() returns, in a form two runs can be compared byte for byte. */
function serialize(collected: Collected): string {
  return JSON.stringify({
    byMarket: [...collected.byMarket].map(([symbol, cells]) => [symbol, [...cells]]),
    folds: collected.folds,
    rows: collected.rows,
  });
}

describe("market-dossier — the shipped cell is ONE grid cell, not two summed", () => {
  // collect() keeps the SELECT fold by its emitted label — on this legacy
  // corpus, "test" — so a corpus of N select-labelled days contributes N
  // outcomes per cell, and the doubled form contributed 2N. Until R4 act 1
  // the reader re-cut the span at 50/75% and this same fixture yielded N/2;
  // the re-cut is gone, so the count is the row count.
  it("counts each decision point once when both baseline cells are present", () => {
    const days = 80;
    const { byMarket } = collect([twoCellCorpus(days)], () => 40);
    const market = byMarket.get(SYMBOL)!;
    const shipped = market.get(RECONSTRUCTED)!;

    // Every row of the pinned cell clears the market's threshold, so the
    // pseudo-cell holds exactly that cell's graded rows — never those
    // rows plus the bare cell's identical copies.
    assert.equal(
      shipped.select.n,
      days,
      `the shipped cell must carry one outcome per graded decision point ` +
        `(${days}); ${shipped.select.n} means the two baseline cells were summed`,
    );

    // …and the bare-baseline cell stands as its own row rather than
    // vanishing into the pseudo-cell.
    const bare = market.get("baseline");
    assert.ok(bare, "the bare-baseline cell must remain readable on its own");
    assert.equal(bare!.select.n, days);
  });

  // The consequence that reached the published artifact: MIN_FILLED is
  // 30, so a market with 20 real graded outcomes must be suppressed —
  // and was published only because the sample was doubled to 40 first.
  it("keeps a sub-floor market suppressed rather than clearing the floor on doubled rows", () => {
    const days = 20;
    const { byMarket } = collect([twoCellCorpus(days)], () => 40);
    const shipped = byMarket.get(SYMBOL)!.get(RECONSTRUCTED)!;
    assert.equal(shipped.select.n, 20);
    assert.ok(
      shipped.select.n < 30,
      `${shipped.select.n} outcomes must stay under the MIN_FILLED floor of ` +
        `30 — the doubled form reached 40 and published an expectancy over it`,
    );
  });

  // Only the PINNED cell may be re-gated. The bare cell was already gated
  // by the engine at the market's own threshold, so re-gating it is not
  // merely redundant — it is what made the two cells collide.
  it("re-gates only the pinned threshold-0 cell", () => {
    const days = 40;
    // A market whose shipped threshold is above every row's score: the
    // pinned cell fails the re-gate and stays under its own variant name,
    // and nothing lands in the pseudo-cell at all.
    const { byMarket } = collect([twoCellCorpus(days)], () => 95);
    const market = byMarket.get(SYMBOL)!;
    assert.equal(market.get(RECONSTRUCTED), undefined);
    assert.ok(market.get(BASELINE), "the pinned cell keeps its own name");
    assert.ok(market.get("baseline"), "the bare cell keeps its own name");
  });
});

// R4 act 1 (2026-09-02): the 2026-09-02 audit found this reader re-cutting
// folds at 50/75% of each market's span and accumulating a "confirm" cell
// from rows past the 75% mark — an unrecorded read of the held-back fold,
// ignoring the split the sweep had already stamped on every row. The door
// now withholds confirm rows, and the reader classifies what arrives by
// label. Each fold below carries a distinct R, so the sum over what
// collect() kept is a signature of WHICH rows it kept.
describe("market-dossier — the confirm fold is sealed at the door (R4 act 1)", () => {
  const perFold = 40;
  const foldedRows = (confirmR: number, selectR = 0.5): SweepEmitRow[] => [
    ...twoCellRows(perFold, "fit", -1),
    ...twoCellRows(perFold, "select", selectR),
    ...twoCellRows(perFold, SEALED_FOLD, confirmR),
  ];

  it("keeps select rows by their emitted label, drops fit, and never sees confirm", () => {
    const { byMarket, folds, rows } = collect(
      [writeCorpus(foldedRows(-3), "folded")],
      () => 40,
    );
    assert.deepEqual(folds, { fit: "fit", select: "select" });
    const shipped = byMarket.get(SYMBOL)!.get(RECONSTRUCTED)!.select;
    assert.equal(shipped.n, perFold, "one outcome per select decision point");
    // +0.5 × 40 exactly: a −1 (fit) or −3 (confirm) row pulling the sum
    // down is a row that crossed a fold boundary it must not cross.
    assert.equal(shipped.sum, perFold * 0.5);
    // Two cells per decision point: the door handed over 80 fit and 80
    // select rows and withheld 80 confirm rows — counted, never read.
    assert.deepEqual(rows, {
      fit: 2 * perFold,
      sealed: 2 * perFold,
      select: 2 * perFold,
    });
  });

  // The executed differential HANDOFF names for every sealed reader: two
  // corpora identical but for the confirm fold's R must produce byte-
  // identical output. A reader that can tell them apart has read the fold.
  it("is byte-identical across two corpora that differ only in the confirm fold's R", () => {
    const losing = collect([writeCorpus(foldedRows(-3), "folded")], () => 40);
    const winning = collect([writeCorpus(foldedRows(3), "folded")], () => 40);
    assert.equal(serialize(losing), serialize(winning));
    // NON-VACUITY: the same change on the select fold moves the output, so
    // the equality above is the seal and not a reader that reads nothing.
    const moved = collect([writeCorpus(foldedRows(-3, 0.6), "folded")], () => 40);
    assert.notEqual(serialize(losing), serialize(moved));
  });

  it("maps a legacy corpus's test split to select and drops train", () => {
    const { byMarket, folds, rows } = collect(
      [writeCorpus(
        [...twoCellRows(30, "train", -1), ...twoCellRows(30, "test", 0.5)],
        "legacy",
      )],
      () => 40,
    );
    assert.deepEqual(folds, { fit: "train", select: "test" });
    const shipped = byMarket.get(SYMBOL)!.get(RECONSTRUCTED)!.select;
    assert.equal(shipped.n, 30);
    assert.equal(shipped.sum, 15, "no train row (−1) may reach the select cell");
    assert.deepEqual(rows, { fit: 60, sealed: 0, select: 60 });
  });

  it("refuses a split it cannot name rather than skipping it", () => {
    const rows = [...twoCellRows(10, "select"), ...twoCellRows(1, "holdout")];
    assert.throws(
      () => collect([writeCorpus(rows, "folded")], () => 40),
      /split "holdout", which this reader does not know/,
    );
  });

  it("refuses to pool a folded shard with a legacy one as one measurement", () => {
    assert.throws(
      () =>
        collect(
          [
            writeCorpus(twoCellRows(5, "select"), "folded"),
            writeCorpus(twoCellRows(5, "test"), "legacy"),
          ],
          () => 40,
        ),
      /two measurements and cannot be pooled as one/,
    );
  });

  it("refuses to collect from no shard at all", () => {
    assert.throws(() => collect([], () => 40), /given no shard/);
  });
});

// #364 round 49, finding 3: the re-gate undoes confidenceThreshold=0 and
// nothing else, while BASELINE also pins runnerProtection,
// maxStopAtrMultiplier and sizingHoursFactor. `metals` deliberately HOLDS
// maxStopAtrMultiplier at 1.6, so a metals market falling back to this
// cell would publish a 1.0-stop-cap reconstruction under the name of the
// 1.6 configuration it actually runs.
// #364 round 50, finding 3: round 49 suppressed the re-gated cell when
// the market's CURRENT calibration diverged from the grid's pin. Running
// the real closure showed that blanks essentially the whole roster once
// 4d picks ship — EURUSD diverges as readily as XAUUSD — and the
// sweep-time calibration cannot be recovered from the manifest, which
// records only a hash. The defect was the LABEL claiming the cell is
// what the market runs; the cell itself is fine once it is named for
// what it is.
describe("market-dossier — the re-gated cell is named for what it is", () => {
  it("names the reconstruction rather than claiming it is the shipped configuration", () => {
    assert.match(RECONSTRUCTED, /^PINNED BASELINE re-gated/);
    assert.doesNotMatch(
      RECONSTRUCTED,
      /SHIPPED/,
      "the cell must not claim to be the configuration the market runs",
    );
    const days = 80;
    const { byMarket } = collect([twoCellCorpus(days)], () => 40);
    assert.ok(
      byMarket.get(SYMBOL)!.get(RECONSTRUCTED),
      "the reconstruction is still built — suppressing it blanked every market",
    );
  });
});

// #364 round 49, finding 2: the seventh reader had a bare argv.indexOf
// with no refusal in either direction, so a mistyped --out silently wrote
// to the default path and a missing --net produced a complete-looking
// 97-market artifact with every measurement null, exiting 0.
describe("market-dossier — refuses rather than measuring nothing", () => {
  const run = (args: string[]): { status: number; stderr: string } => {
    try {
      execFileSync("npx", ["--no-install", "tsx", "scripts/market-dossier.ts", ...args], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
        timeout: 120_000,
      });
      return { status: 0, stderr: "" };
    } catch (error) {
      const e = error as { status?: number; stderr?: string };
      return { status: e.status ?? 1, stderr: String(e.stderr ?? "") };
    }
  };

  it("refuses an empty --net rather than emitting an all-null dossier", () => {
    const { status, stderr } = run([]);
    assert.notEqual(status, 0, "a run that measures nothing must not exit 0");
    assert.match(stderr, /--net names the corpus this review rests on/);
  });

  it("refuses a value flag typed without its value instead of falling back", () => {
    const { status, stderr } = run(["--out", "--net", "x.jsonl"]);
    assert.notEqual(status, 0);
    assert.match(stderr, /--out owns the token after it and got "--net"/);
  });
});

// #364 round 50 smaller / round-50-verdict smaller: the predicate takes
// a CALIBRATION now, not a symbol, so the empty result is demonstrable
// rather than asserted. The previous version of this test asserted
// `Array.isArray(...)` — true of every possible return — under a title
// and comment claiming it showed the empty case reachable. That is the
// claim-vs-evidence class, in the test written to close it.
describe("market-dossier — the pin comparison, executed", () => {
  const PIN = {
    maxStopAtrMultiplier: 1,
    runnerProtection: "breakeven",
    sizingHoursFactor: 1,
  };

  it("reports nothing for a calibration that matches the pin exactly", () => {
    assert.deepEqual(pinDivergence(PIN), []);
    // …and the defaults stand in for absent fields, so an inherited
    // calibration that omits them is not reported as diverging.
    assert.deepEqual(pinDivergence({}), []);
  });

  it("names each parameter that differs, with its value and the pin", () => {
    assert.deepEqual(
      pinDivergence({ ...PIN, maxStopAtrMultiplier: 1.6 }),
      ["maxStopAtrMultiplier=1.6 (pin 1)"],
    );
    assert.deepEqual(
      pinDivergence({
        maxStopAtrMultiplier: 4,
        runnerProtection: "trail_tp1",
        sizingHoursFactor: 3,
      }),
      [
        "maxStopAtrMultiplier=4 (pin 1)",
        "runnerProtection=trail_tp1 (pin breakeven)",
        "sizingHoursFactor=3 (pin 1)",
      ],
    );
  });

  // The motivating case, against the engine's own numbers rather than a
  // fixture: metals HOLDS a wider stop, so a metals market falling back
  // to the reconstruction is measuring a configuration it does not run.
  it("names metals' held stop cap from the real class calibration", () => {
    assert.ok(
      pinDivergence(getClassCalibration("metals")).some((entry) =>
        entry.startsWith("maxStopAtrMultiplier=1.6")
      ),
      `metals holds maxStopAtrMultiplier at 1.6; got ${
        JSON.stringify(pinDivergence(getClassCalibration("metals")))
      }`,
    );
  });
});
