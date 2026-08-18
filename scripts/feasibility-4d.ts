// 4d stage B — the RM-1 feasibility join. A derived cell is only real if
// the venue can SIZE it: a stop so wide that one step of the instrument
// costs more than the line's published daily-loss budget (3% default
// tier) at its smallest account is not a candidate for that line,
// whatever its expectancy delta. The rule uses only E8-published
// numbers: the line's account ladder, its 3% default daily drawdown,
// the instrument's own step and unit values via the §19 sizing engine.
//
//   npx tsx scripts/feasibility-4d.ts sweeps/4c/shard-{0..7}.jsonl \
//     --candidates docs/research/baseline-2026-08-10/4d-candidates.json
//
// One extra corpus pass collects median entry and stop distance per
// (market, accepted-candidate) — the sizing engine then answers per
// program line. Nothing here reads the confirm fold's aggregates; the
// pass collects execution geometry only.
import { readFileSync, writeFileSync } from "node:fs";
import { findBrokerInstrument } from "../src/lib/broker/instruments.ts";
import { PROGRAM_LINES } from "../src/lib/broker/programs.ts";
import { sizeSetup } from "../src/lib/broker/sizing.ts";
import type { ProgramLine } from "../src/lib/broker/types.ts";
import { assertManifest, readLinesSync } from "./sweepStats.ts";

type Candidate = {
  selectExpectancyDelta: number;
  pairedP: number;
  selectFilled: number;
  selectExpiryShare: number | null;
  variant: string;
  worstDayR: number | null;
};

type CandidateFile = {
  analyzerVersion: string;
  baselineVariant: string;
  markets: Record<
    string,
    { accepted: Candidate[]; measureOnly: boolean; starved: boolean }
  >;
};

const DAILY_LOSS_DEFAULT_PERCENT = 3;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const argv = process.argv.slice(2);
  const paths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      index += 1;
      continue;
    }
    paths.push(argv[index]);
  }
  const flagValue = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const candidatesPath = flagValue("candidates") ??
    "docs/research/baseline-2026-08-10/4d-candidates.json";
  const outPath = flagValue("out") ??
    "docs/research/baseline-2026-08-10/4d-feasibility.json";
  const candidateFile = JSON.parse(
    readFileSync(candidatesPath, "utf8"),
  ) as CandidateFile;

  // The (symbol, variant) pairs whose geometry the pass must collect —
  // every accepted candidate, every market.
  const wanted = new Map<string, Set<string>>();
  for (const [symbol, market] of Object.entries(candidateFile.markets)) {
    if (market.accepted.length === 0) continue;
    wanted.set(
      symbol,
      new Set(market.accepted.map((candidate) => candidate.variant)),
    );
  }

  type Geometry = { entries: number[]; risks: number[] };
  const geometry = new Map<string, Map<string, Geometry>>();
  // Median CLOSE per symbol regardless of variant, for the quotes map the
  // sizing engine converts non-USD denominations with.
  const closes = new Map<string, number[]>();

  for (const path of paths) {
    // R0: the one-clock door — a corpus that cannot state its clock (or
    // whose witnesses condemn it) is refused here too, not only in the
    // aggregation readers. These five scripts produced the invalidated
    // 4d-era figures by reading emits bare.
    assertManifest(path);
    readLinesSync(path, (line) => {
      if (!line) return;
      const row = JSON.parse(line) as {
        legs?: Array<{ leg?: string; price?: number }>;
        outcome?: string;
        riskDistance?: number;
        symbol?: string;
        variant?: string;
      };
      const symbol = row.symbol;
      if (!symbol) return;
      // The fill print is the entry leg's price — rows carry executions,
      // not the plan's nominal fields.
      const entryLeg = row.legs?.find((leg) => leg.leg === "entry");
      const entryPrice = typeof entryLeg?.price === "number" &&
          Number.isFinite(entryLeg.price) && entryLeg.price > 0
        ? entryLeg.price
        : null;
      if (entryPrice !== null) {
        if (!closes.has(symbol)) closes.set(symbol, []);
        const sample = closes.get(symbol)!;
        // A bounded reservoir keeps memory flat across 21M rows; medians
        // over 4k spread samples are stable far past what sizing needs.
        if (sample.length < 4_000) sample.push(entryPrice);
      }
      const variants = wanted.get(symbol);
      const variant = row.variant ?? "baseline";
      if (!variants || !variants.has(variant)) return;
      if (row.outcome === "unfilled") return;
      if (
        typeof row.riskDistance !== "number" ||
        !Number.isFinite(row.riskDistance) || row.riskDistance <= 0 ||
        entryPrice === null
      ) return;
      if (!geometry.has(symbol)) geometry.set(symbol, new Map());
      const byVariant = geometry.get(symbol)!;
      if (!byVariant.has(variant)) {
        byVariant.set(variant, { entries: [], risks: [] });
      }
      const cell = byVariant.get(variant)!;
      if (cell.entries.length < 4_000) {
        cell.entries.push(entryPrice);
        cell.risks.push(row.riskDistance);
      }
    });
  }

  const quotes: Record<string, number> = {};
  for (const [symbol, sample] of closes) {
    const value = median(sample);
    if (value !== null) quotes[symbol] = value;
  }

  const feasibility: Record<
    string,
    Record<
      string,
      {
        feasibleLines: ProgramLine[];
        infeasibleLines: ProgramLine[];
        medianEntry: number | null;
        medianRiskDistance: number | null;
      }
    >
  > = {};

  for (const [symbol, byVariant] of geometry) {
    feasibility[symbol] = {};
    for (const [variant, cell] of byVariant) {
      const entry = median(cell.entries);
      const risk = median(cell.risks);
      const feasibleLines: ProgramLine[] = [];
      const infeasibleLines: ProgramLine[] = [];
      if (entry !== null && risk !== null) {
        for (const program of PROGRAM_LINES) {
          if (!findBrokerInstrument(program.line, symbol)) continue;
          const smallest = program.accountSizes[0];
          if (!Number.isFinite(smallest)) continue;
          const result = sizeSetup({
            accountSize: smallest,
            entryPrice: entry,
            levelflowSymbol: symbol,
            programLine: program.line,
            quotes,
            riskPercent: DAILY_LOSS_DEFAULT_PERCENT,
            stage: "challenge",
            stopLoss: entry - risk,
          });
          if (result.kind === "size" && result.units > 0) {
            feasibleLines.push(program.line);
          } else {
            infeasibleLines.push(program.line);
          }
        }
      }
      feasibility[symbol][variant] = {
        feasibleLines,
        infeasibleLines,
        medianEntry: entry,
        medianRiskDistance: risk,
      };
    }
  }

  writeFileSync(
    outPath,
    JSON.stringify(
      {
        dailyLossDefaultPercent: DAILY_LOSS_DEFAULT_PERCENT,
        derivedAt: new Date().toISOString(),
        feasibility,
        note:
          "feasible = the §19 engine sizes at least one step at the line's " +
          "smallest account within the published 3% default daily line, at " +
          "the candidate's median stop geometry.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `feasibility for ${Object.keys(feasibility).length} markets -> ${outPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
