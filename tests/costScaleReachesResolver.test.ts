import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  type TreasuryCurveFacts,
} from "../scripts/sweepManifest.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  MODELED_COST_SCALE_REACHES_RESOLVER,
  resolverCostOptions,
} from "../supabase/functions/trade-analyzer/executionQuality.ts";
import { fillOptionsFromRiskModel } from "../supabase/functions/trade-analyzer/replay.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

/**
 * M5: the modelled cost scale reaches the RESOLVER, not just the payoff gate.
 *
 * Between 2026-08-09 and 2026-08-31 it did not, and the way that defect
 * survived is the reason this file leads with an END-TO-END measurement
 * rather than a source assertion. `LEVELFLOW_MODELED_COST_SCALE` moved
 * `estimatedRoundTripCost` alone; the resolver was handed the raw spread,
 * slippage and commission by two separate hand-written call sites. A gross
 * arm at scale 0 therefore charged the net arm's costs and merely loosened
 * the gate, admitting MORE setups. Eleven of twenty rows came back
 * bit-identical, and that no-op was read as agreement between the arms.
 *
 * Every source-shape assertion in this file would have PASSED throughout that
 * window. Only a test that runs the engine twice and compares the money can
 * tell a routed scale from an inert one, so that is the first test here and
 * the rest are guards on top of it.
 */

// Mid-week anchor so weekly-close expiry logic stays out of the way.
const startTime = Date.parse("2026-06-15T00:00:00.000Z");

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

const BASE = {
  calibrationOverride: {
    blockedRegimes: [],
    runnerWindowShare: 1,
    tp1RiskShare: 0.8,
  },
  dailyBars: dailyBars(80),
  primaryBars: triangleBars(600),
  stepBars: 16,
  symbol: "EURUSD",
  warmupBars: 120,
};

/**
 * Run the engine under one scale and restore the environment afterwards.
 *
 * The scale is read from the process environment by design — a sweep sets it
 * once for a whole run and no production path can pass it by accident — so
 * exercising it means setting it. `finally` restores rather than deleting
 * unconditionally, because a leaked variable here would silently re-grade
 * every test that runs after this file.
 */
function runAtScale(scale: string | null) {
  const prior = process.env.LEVELFLOW_MODELED_COST_SCALE;
  if (scale === null) delete process.env.LEVELFLOW_MODELED_COST_SCALE;
  else process.env.LEVELFLOW_MODELED_COST_SCALE = scale;
  try {
    return simulateSymbol({ ...BASE });
  } finally {
    if (prior === undefined) delete process.env.LEVELFLOW_MODELED_COST_SCALE;
    else process.env.LEVELFLOW_MODELED_COST_SCALE = prior;
  }
}

function filled(result: ReturnType<typeof simulateSymbol>) {
  return result.outcomes.filter((row) => row.outcome !== "unfilled");
}

function totalR(result: ReturnType<typeof simulateSymbol>) {
  return filled(result).reduce((sum, row) => sum + (row.realizedR ?? 0), 0);
}

describe("the scale moves the MONEY, not only the gate", () => {
  const net = runAtScale("1");
  const gross = runAtScale("0");

  it("the fixture fills, or everything below is vacuous", () => {
    // The 2026-08-11 reading failed on exactly this: a comparison over rows
    // that could not differ, reported as agreement. Stated first so a fixture
    // that stops producing fills fails HERE, with its own message, rather
    // than making the real assertion pass for the wrong reason.
    assert.ok(
      filled(net).length >= 10,
      `net arm produced ${filled(net).length} filled rows; the scale ` +
        `comparison below cannot discriminate on that`,
    );
  });

  it("charging only the published bill changes realized R", () => {
    // THE TEST THE DEFECT WOULD HAVE FAILED. At scale 0 the modelled spread
    // and slippage are gone from the resolver's own arithmetic: fills land at
    // the limit instead of a half-spread away, gapped exits print without
    // slippage. Before M5 this comparison returned bit-identical totals.
    assert.notEqual(
      totalR(gross),
      totalR(net),
      "gross and net arms produced identical realized R — the cost scale is " +
        "not reaching the resolver, which is defect 1c exactly as it was on " +
        "2026-08-11: the payoff gate moved and the money did not",
    );
  });

  it("the gross arm is the CHEAPER one, never merely a looser gate", () => {
    // Direction matters and is the half the old wiring got wrong. Removing
    // cost must make the same trades earn MORE. If it only admitted more
    // setups, total R could move in either direction while per-trade
    // economics stayed put — which is what "loosens the gate" means.
    const netRows = new Map(filled(net).map((row) => [row.time, row]));
    const shared = filled(gross).filter((row) => netRows.has(row.time));
    assert.ok(
      shared.length >= 10,
      `only ${shared.length} decisions are common to both arms; a per-trade ` +
        `comparison needs a shared population`,
    );
    const grossSum = shared.reduce((sum, row) => sum + (row.realizedR ?? 0), 0);
    const netSum = shared.reduce(
      (sum, row) => sum + (netRows.get(row.time)!.realizedR ?? 0),
      0,
    );
    assert.ok(
      grossSum > netSum,
      `over ${shared.length} decisions taken in BOTH arms, gross earned ` +
        `${grossSum.toFixed(4)}R against net's ${netSum.toFixed(4)}R. ` +
        `Removing cost did not make the same trades pay more, so the scale ` +
        `is moving admission rather than economics`,
    );
  });

  it("leaves the engine bit-identical when the scale is absent", () => {
    // Production never sets the variable, so M5 must be a no-op there. `x * 1`
    // is exact in IEEE 754 and this is what says so about the whole engine
    // rather than about one multiplication.
    assert.deepEqual(runAtScale(null).outcomes, net.outcomes);
  });
});

describe("what the scale multiplies, and what it must never touch", () => {
  const quality = {
    estimatedCommission: 0.00007,
    estimatedSlippage: 0.00004,
    estimatedSpread: 0.00012,
  };

  it("scales the MODELLED half and charges commission in full", () => {
    // Amendment 36's standard is the whole reason for the asymmetry: no
    // withdrawal on a flawed parameter of OUR OWN making. Spread and slippage
    // are ours — for crypto they rest on a single Monday-afternoon book
    // sample `venueCosts` itself warns "is not a cost model". The commission
    // is E8's published bill, so it survives every scale intact.
    assert.deepEqual(resolverCostOptions(quality, 0), {
      gapExitSlippage: 0,
      halfSpread: 0,
      roundTripCost: 0.00007,
    });
  });

  it("is bit-identical to the hand-written form at scale 1", () => {
    assert.deepEqual(resolverCostOptions(quality, 1), {
      gapExitSlippage: quality.estimatedSlippage,
      halfSpread: quality.estimatedSpread / 2,
      roundTripCost: quality.estimatedCommission,
    });
  });

  it("interpolates rather than switching", () => {
    const half = resolverCostOptions(quality, 0.5);
    assert.equal(half.gapExitSlippage, 0.00002);
    assert.equal(half.halfSpread, 0.00003);
    assert.equal(half.roundTripCost, 0.00007);
  });
});

describe("the live bridge is scale-free by construction", () => {
  it("grades production at full cost even with the variable set", () => {
    // NOT "because nobody sets it". `fillOptionsFromRiskModel` is what
    // outcome-sync and the analyzer's own resolver grade real setups through,
    // and the corpus they write is what global learning reads for every
    // operator. A stray environment variable on a production deployment must
    // not be able to re-grade it, which is why `resolverCostOptions` takes
    // the scale as a parameter instead of reading the environment itself.
    const prior = process.env.LEVELFLOW_MODELED_COST_SCALE;
    process.env.LEVELFLOW_MODELED_COST_SCALE = "0";
    try {
      const options = fillOptionsFromRiskModel({
        executionQuality: {
          estimatedCommission: 0.00006,
          estimatedSlippage: 0.00004,
          estimatedSpread: 0.0001,
        },
      });
      assert.equal(options.halfSpread, 0.00005);
      assert.equal(options.gapExitSlippage, 0.00004);
      assert.equal(options.roundTripCost, 0.00006);
    } finally {
      if (prior === undefined) delete process.env.LEVELFLOW_MODELED_COST_SCALE;
      else process.env.LEVELFLOW_MODELED_COST_SCALE = prior;
    }
  });
});

describe("both call sites share ONE mapping", () => {
  const SWEEP = readFileSync(
    "supabase/functions/trade-analyzer/sweep.ts",
    "utf8",
  );
  const REPLAY = readFileSync(
    "supabase/functions/trade-analyzer/replay.ts",
    "utf8",
  );

  it("the constant states the wiring the two scripts branch on", () => {
    assert.equal(MODELED_COST_SCALE_REACHES_RESOLVER, true);
  });

  it("neither site writes the cost triple by hand any more", () => {
    // The duplication IS the defect's mechanism: with the mapping written out
    // twice there was no single place where routing the scale in would have
    // fixed both, and the sweep's copy is the one everybody read.
    for (const [name, source] of [["sweep", SWEEP], ["replay", REPLAY]]) {
      assert.match(
        source,
        /resolverCostOptions\(/,
        `${name}.ts no longer derives the resolver's costs from the shared ` +
          `mapping, so the scale can reach one call site and miss the other`,
      );
      assert.doesNotMatch(
        source,
        /halfSpread: [^,\n]*estimatedSpread/,
        `${name}.ts is building halfSpread from the raw spread again`,
      );
    }
  });

  it("the sweep reads the scale once per symbol, not per decision", () => {
    const at = SWEEP.indexOf("const modeledCostScale = modeledCostScaleFromEnv();");
    const resolveAt = SWEEP.indexOf("...resolverCostOptions(plan.executionQuality");
    assert.ok(at > 0 && resolveAt > at, "the sweep stopped declaring the scale ahead of its resolve loop");
  });
});

/**
 * The other half of M5, and the half that outlives the wiring.
 *
 * Routing the scale into the resolver fixes today's defect. The INERT door
 * catches its RETURN: two arms that produce identical statistics have not been
 * compared, and the 2026-08-11 artifact is what a verdict computed over that
 * looks like — a full-looking file of confident labels standing on a switch
 * that did nothing. A source assertion cannot see this; only running the
 * script over two identical corpora can.
 */
describe("a comparison of two identical arms is refused, not scored", () => {
  const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
  const DAY = 86_400_000;
  const SYMBOL = "EURUSD";
  const CURVE: TreasuryCurveFacts = {
    count: 3_000,
    firstTime: Date.UTC(2013, 0, 2),
    largestGapMs: 4 * 86_400_000,
    lastTime: Date.UTC(2027, 0, 1),
  };

  /** One arm's corpus: `days` filled rows, each earning `r`. */
  function arm(days: number, r: (day: number) => number): string {
    const rows = Array.from({ length: days }, (_, day) => ({
      accepted: true,
      confidenceScore: 80,
      outcome: "take_profit",
      realizedR: r(day),
      split: "test",
      symbol: SYMBOL,
      time: Date.UTC(2025, 0, 6) + day * DAY + 12 * 3_600_000,
      variant: "baseline",
    })) as SweepEmitRow[];
    const dir = mkdtempSync(join(tmpdir(), "cost-scale-arm-"));
    const emitPath = join(dir, "shard.jsonl");
    writeFileSync(emitPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    writeFileSync(
      `${emitPath}.manifest.json`,
      JSON.stringify(buildSweepManifest({
        acceptance: { captureAll: false, ignoreLowEdge: false },
        analyzerVersion: "2026.08.31.test",
        anchor: "2026-08-31",
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
        generatedAt: "2026-08-31T05:00:00.000Z",
        grid: [{}],
        stepBars: 16,
        symbols: [{
          calibration: {},
          providerSymbol: SYMBOL,
          series: { "15min": seriesFacts([{ time: 0 }], "intraday") },
          symbol: SYMBOL,
        }],
        trainShare: 0.6,
        treasuryCurve: CURVE,
        warmupBars: 240,
      }), null, 2) + "\n",
    );
    return emitPath;
  }

  /** Always an explicit --out: the default is a TRACKED research artifact. */
  function run(net: string, gross: string) {
    const out = join(mkdtempSync(join(tmpdir(), "cost-scale-out-")), "v.json");
    const args = [
      "scripts/cost-sensitivity-verdict.ts",
      "--net", net,
      "--gross", gross,
      "--cells", `${SYMBOL}|baseline`,
      "--out", out,
    ];
    try {
      const stdout = execFileSync(TSX, args, {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: "pipe",
        timeout: 120_000,
      });
      return { out, stderr: "", stdout, threw: false };
    } catch (error) {
      const shell = error as { stderr?: string; stdout?: string };
      return {
        out,
        stderr: String(shell.stderr ?? ""),
        stdout: String(shell.stdout ?? ""),
        threw: true,
      };
    }
  }

  it("names the market INERT and refuses the run when every arm agrees", () => {
    const rows = (day: number) => (day % 3 === 0 ? -1 : 0.5);
    const result = run(arm(40, rows), arm(40, rows));
    assert.ok(
      result.threw,
      "two identical corpora produced a VERDICT — this is the 2026-08-11 " +
        "failure exactly: a switch that did nothing, scored as agreement",
    );
    assert.match(result.stderr, /all 1 readable markets came back\s+INERT/);
    // The artifact is the evidence OF the failure and must survive it.
    const artifact = JSON.parse(readFileSync(result.out, "utf8")) as {
      summary: { inert: number };
      verdicts: Record<string, { verdict: string }>;
    };
    assert.equal(artifact.summary.inert, 1);
    assert.match(artifact.verdicts[SYMBOL].verdict, /^COST MODEL INERT/);
  });

  it("scores normally the moment the two arms genuinely differ", () => {
    // The shape the comparison exists to find: a market that loses under our
    // modelled spread and slippage and pays at the venue's published bill
    // alone. Amendment 36 forbids withdrawing on that, which is the verdict
    // the door must not swallow.
    const net = arm(40, (day) => (day % 3 === 0 ? -1 : 0.5));
    const gross = arm(40, () => 0.5);
    const result = run(net, gross);
    assert.ok(
      !result.threw,
      `a genuine difference was refused as inert: ${result.stderr}`,
    );
    const artifact = JSON.parse(readFileSync(result.out, "utf8")) as {
      summary: { inert: number };
      verdicts: Record<string, { verdict: string }>;
    };
    assert.equal(artifact.summary.inert, 0);
    assert.match(artifact.verdicts[SYMBOL].verdict, /COST-DEPENDENT/);
  });

  it("reports NO SAMPLE as unreadable, never as an inert cost model", () => {
    // Two empty accumulators are trivially identical. Calling that an inert
    // cost model would blame the instrument for what is simply no data, and
    // would fire the refusal on every thin corpus.
    const thin = () => arm(5, () => 0.5);
    const result = run(thin(), thin());
    assert.ok(!result.threw, `a no-sample run was refused as inert: ${result.stderr}`);
    const artifact = JSON.parse(readFileSync(result.out, "utf8")) as {
      summary: { inert: number; unreadable: number };
    };
    assert.equal(artifact.summary.unreadable, 1);
    assert.equal(artifact.summary.inert, 0);
  });
});
