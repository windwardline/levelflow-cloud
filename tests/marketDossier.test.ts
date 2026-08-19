import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { collect } from "../scripts/market-dossier.ts";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";

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

function row(variant: string, dayIndex: number, score: number): SweepEmitRow {
  return {
    accepted: true,
    confidenceScore: score,
    outcome: "take_profit",
    realizedR: 0.5,
    split: "test",
    symbol: SYMBOL,
    time: Date.UTC(2025, 0, 6) + dayIndex * DAY + 12 * 3_600_000,
    variant,
  } as SweepEmitRow;
}

/**
 * A corpus carrying BOTH cells over the same decision points — which is
 * what the real 4c grid emits: entry 0 is `{}` and entry 1 is the pinned
 * threshold-0 override.
 */
function twoCellCorpus(days: number): string {
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < days; day += 1) {
    rows.push(row(BASELINE, day, 80));
    rows.push(row("baseline", day, 80));
  }
  const dir = mkdtempSync(join(tmpdir(), "dossier-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(
    emitPath,
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  writeFileSync(
    `${emitPath}.manifest.json`,
    JSON.stringify(
      buildSweepManifest({
        analyzerVersion: "2026.08.09.test",
        anchor: "2026-08-11",
        barRejections: {},
        clock: { calendar: CALENDAR_CLOCK, normalizer: BAR_CLOCK },
        conditions: {
          macroAdjustment: "historical-treasury-curve",
          providerWarningCount: "zero-by-construction",
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
      }),
      null,
      2,
    ) + "\n",
  );
  return emitPath;
}

const spansFor = (days: number) =>
  new Map([[SYMBOL, {
    first: Date.UTC(2025, 0, 6) + 12 * 3_600_000,
    last: Date.UTC(2025, 0, 6) + (days - 1) * DAY + 12 * 3_600_000,
  }]]);

describe("market-dossier — the shipped cell is ONE grid cell, not two summed", () => {
  // collect() accumulates only the select (50–75% of the span) and
  // confirm (>=75%) windows; the first half is the fit fold and is
  // dropped. So a corpus of N days contributes N/2 outcomes per cell,
  // and the doubled form contributed N.
  it("counts each decision point once when both baseline cells are present", () => {
    const days = 80;
    const cells = collect([twoCellCorpus(days)], spansFor(days), () => 40);
    const market = cells.get(SYMBOL)!;
    const shipped = market.get("SHIPPED (baseline at class threshold)")!;

    // Every row of the pinned cell clears the market's threshold, so the
    // pseudo-cell holds exactly that cell's graded rows — never those
    // rows plus the bare cell's identical copies.
    const total = shipped.confirm.n + shipped.select.n;
    assert.equal(
      total,
      days / 2,
      `the shipped cell must carry one outcome per graded decision point ` +
        `(${days / 2}); ${total} means the two baseline cells were summed`,
    );

    // …and the bare-baseline cell stands as its own row rather than
    // vanishing into the pseudo-cell.
    const bare = market.get("baseline");
    assert.ok(bare, "the bare-baseline cell must remain readable on its own");
    assert.equal(bare!.confirm.n + bare!.select.n, days / 2);
  });

  // The consequence that reached the published artifact: MIN_FILLED is
  // 30, so a market with 20 real graded outcomes must be suppressed —
  // and was published only because the sample was doubled to 40 first.
  it("keeps a sub-floor market suppressed rather than clearing the floor on doubled rows", () => {
    const days = 40;
    const cells = collect([twoCellCorpus(days)], spansFor(days), () => 40);
    const shipped = cells.get(SYMBOL)!.get(
      "SHIPPED (baseline at class threshold)",
    )!;
    const total = shipped.confirm.n + shipped.select.n;
    assert.equal(total, 20);
    assert.ok(
      total < 30,
      `${total} outcomes must stay under the MIN_FILLED floor of 30 — the ` +
        `doubled form reached 40 and published an expectancy over it`,
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
    const cells = collect([twoCellCorpus(days)], spansFor(days), () => 95);
    const market = cells.get(SYMBOL)!;
    assert.equal(market.get("SHIPPED (baseline at class threshold)"), undefined);
    assert.ok(market.get(BASELINE), "the pinned cell keeps its own name");
    assert.ok(market.get("baseline"), "the bare cell keeps its own name");
  });
});

// #364 round 49, finding 3: the re-gate undoes confidenceThreshold=0 and
// nothing else, while BASELINE also pins runnerProtection,
// maxStopAtrMultiplier and sizingHoursFactor. `metals` deliberately HOLDS
// maxStopAtrMultiplier at 1.6, so a metals market falling back to this
// cell would publish a 1.0-stop-cap reconstruction under the name of the
// 1.6 configuration it actually runs.
describe("market-dossier — the SHIPPED label is checked, not asserted", () => {
  it("does not build the shipped cell when the grid's pins differ from the market's calibration", () => {
    const days = 80;
    const corpus = twoCellCorpus(days);
    // Same corpus, same threshold — the only change is a market whose
    // stop cap diverges from the pin.
    const honest = collect([corpus], spansFor(days), () => 40, () => []);
    assert.ok(
      honest.get(SYMBOL)!.get("SHIPPED (baseline at class threshold)"),
      "with pins matching, the reconstruction is built",
    );

    const diverging = collect(
      [corpus],
      spansFor(days),
      () => 40,
      () => ["maxStopAtrMultiplier=1.6 (pin 1)"],
    );
    const market = diverging.get(SYMBOL)!;
    assert.equal(
      market.get("SHIPPED (baseline at class threshold)"),
      undefined,
      "a reconstruction the market does not run must not wear the SHIPPED name",
    );
    // The rows are not lost — the pinned cell keeps its own name, so the
    // evidence stays readable as what it actually is.
    assert.ok(market.get(BASELINE), "the pinned cell keeps its own name");
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
