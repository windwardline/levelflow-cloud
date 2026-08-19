import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";

// WIF-4 (readiness audit, 2026-08-11), applied to the three 4c/4d
// consumers that never carried it (#364 round 53, finding 2). Run with no
// corpus, each of these read zero rows and wrote an artifact that looked
// like a finished run:
//
//   threshold-rescue          "0 of 0 markets have a both-folds-positive
//                              threshold" — indistinguishable from a real
//                              corpus in which no threshold rescued
//                              anything, on the script that exists to
//                              answer whether a negative cell is rescuable
//   cost-sensitivity-verdict  verdicts {}, summary all zeros
//   feasibility-4d            "feasibility for 0 markets" — and its
//                              consumers read an absent line as "the venue
//                              cannot size this cell", so the empty join
//                              reads as INFEASIBLE EVERYWHERE
//
// roster-expectancy-audit and market-dossier had one door each; these had
// none. Executed rather than source-matched, because the thing under test
// is what the process DOES with no rows — which is exactly what a source
// scan cannot see.
const DAY = 86_400_000;
const SYMBOL = "EURUSD";

const TEST_TREASURY_CURVE: TreasuryCurveFacts = {
  count: 3_000,
  firstTime: Date.UTC(2013, 0, 2),
  largestGapMs: 4 * 86_400_000,
  lastTime: Date.UTC(2027, 0, 1),
};

function shardWithRows(days: number): string {
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < days; day += 1) {
    rows.push(
      {
        accepted: true,
        confidenceScore: 80,
        outcome: "take_profit",
        realizedR: 0.5,
        split: "test",
        symbol: SYMBOL,
        time: Date.UTC(2025, 0, 6) + day * DAY + 12 * 3_600_000,
        variant: "baseline",
      } as SweepEmitRow,
    );
  }
  const dir = mkdtempSync(join(tmpdir(), "empty-refusal-"));
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(emitPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
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
        grid: [{}],
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

function refuses(script: string, args: string[], pattern: RegExp, why: string) {
  assert.throws(
    () =>
      execFileSync("npx", ["--no-install", "tsx", script, ...args], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
        timeout: 120_000,
      }),
    (error: unknown) => {
      assert.match(String((error as { stderr?: string }).stderr ?? ""), pattern);
      return true;
    },
    why,
  );
}

describe("the 4c/4d consumers refuse a run that examined nothing", () => {
  it("threshold-rescue refuses no shards, no cells, and cells that matched no row", () => {
    refuses(
      "scripts/threshold-rescue.ts",
      ["--markets", "EURUSD|baseline"],
      /no shard paths given/,
      "a rescue read over zero shards is not a rescue verdict",
    );
    // The shard is never opened: the --markets door stands before the
    // corpus loop, so a nonexistent path proves the ORDER as well as the
    // refusal.
    refuses(
      "scripts/threshold-rescue.ts",
      ["never-opened.jsonl"],
      /--markets named no \(symbol\|variant\) cell/,
      "an empty --markets filters every row out and reports on nothing",
    );
    const shard = shardWithRows(40);
    refuses(
      "scripts/threshold-rescue.ts",
      [shard, "--markets", "EURUSD|no-such-variant"],
      /none of the 1 named cell\(s\) matched a row across 1 shard\(s\)/,
      "a named cell absent from the corpus must not read as no-rescue",
    );
  });

  it("cost-sensitivity-verdict refuses a missing arm and an empty cell list", () => {
    refuses(
      "scripts/cost-sensitivity-verdict.ts",
      ["--gross", "g.jsonl", "--cells", "EURUSD|baseline"],
      /--net named no shard/,
      "one arm of a two-corpus comparison cannot stand for both",
    );
    refuses(
      "scripts/cost-sensitivity-verdict.ts",
      ["--net", "n.jsonl", "--cells", "EURUSD|baseline"],
      /--gross named no shard/,
      "the gross arm is the one the comparison exists for",
    );
    refuses(
      "scripts/cost-sensitivity-verdict.ts",
      ["--net", "n.jsonl", "--gross", "g.jsonl"],
      /--cells named no \(symbol\|variant\) cell/,
      "the verdict loop walks the cell map — an empty one judges nothing",
    );
  });

  it("feasibility-4d refuses no shards, a candidate file with no accepts, and a corpus with no geometry", () => {
    const dir = mkdtempSync(join(tmpdir(), "feas-refusal-"));
    const noAccepts = join(dir, "no-accepts.json");
    writeFileSync(
      noAccepts,
      JSON.stringify({
        analyzerVersion: "2026.08.09.test",
        baselineVariant: "baseline",
        markets: {
          EURUSD: { accepted: [], measureOnly: false, starved: false },
        },
      }) + "\n",
    );
    refuses(
      "scripts/feasibility-4d.ts",
      ["--candidates", noAccepts],
      /no shard paths given/,
      "an empty join reads as infeasible everywhere, not as missing",
    );
    refuses(
      "scripts/feasibility-4d.ts",
      ["never-opened.jsonl", "--candidates", noAccepts],
      /names no accepted candidate on any market/,
      "a candidate file with no accepts poses no feasibility question",
    );
    // Rows exist under the named cell, and carry no entry leg or
    // riskDistance — the geometry pass collects nothing. Only the corpus
    // can show this, which is why it is a third door rather than a
    // stricter reading of the first two.
    const shard = shardWithRows(40);
    const accepts = join(dir, "accepts.json");
    writeFileSync(
      accepts,
      JSON.stringify({
        analyzerVersion: "2026.08.09.test",
        baselineVariant: "baseline",
        markets: {
          EURUSD: {
            accepted: [{
              pairedP: 0.01,
              selectExpectancyDelta: 0.2,
              selectExpiryShare: null,
              selectFilled: 40,
              variant: "baseline",
              worstDayR: null,
            }],
            measureOnly: false,
            starved: false,
          },
        },
      }) + "\n",
    );
    refuses(
      "scripts/feasibility-4d.ts",
      [shard, "--candidates", accepts],
      /found a filled row with an entry price and a positive riskDistance/,
      "a join that collected no geometry must not be written as a result",
    );
  });
});
