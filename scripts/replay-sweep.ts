// Replay-sweep calibration harness.
//
// Regenerates historical setups with the live analyzer pipeline across a
// calibration grid, walk-forward split, and reports TP1 hit rate, stop rate,
// and expectancy per symbol and variant. No parameter should reach
// calibration.ts without a positive out-of-sample expectancy here.
//
// Usage:
//   FMP_API_KEY=... npx tsx scripts/replay-sweep.ts \
//     --symbols EURUSD,XAUUSD,SP --days 60 \
//     --grid tp1AtrMultiplier=0.5,0.7,0.9 [--step 16]

import type { CategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import { resolveProviderSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

const FMP_API_BASE_URL = "https://financialmodelingprep.com/stable";
const API_KEY = process.env.FMP_API_KEY;
const WARMUP_BARS = 240;
const TRAIN_SHARE = 0.6;

type SweepArgs = {
  days: number;
  grid: Array<Partial<CategoryCalibration>>;
  step: number;
  symbols: string[];
};

async function main() {
  if (!API_KEY) {
    console.error("FMP_API_KEY is required.");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  const rows: string[][] = [[
    "symbol",
    "variant",
    "split",
    "decisions",
    "setups",
    "unfilled",
    "tp1HitRate",
    "stopRate",
    "expectancyR",
  ]];

  for (const symbol of args.symbols) {
    const providerSymbol = resolveProviderSymbols(symbol)[0];
    if (!providerSymbol) {
      console.warn(`Skipping ${symbol}: no provider symbol.`);
      continue;
    }
    const [primaryBars, dailyBars] = await Promise.all([
      fetchIntradayBars(providerSymbol, args.days),
      fetchDailyBars(providerSymbol, args.days + 240),
    ]);
    if (primaryBars.length < WARMUP_BARS * 2) {
      console.warn(
        `Skipping ${symbol}: only ${primaryBars.length} intraday bars.`,
      );
      continue;
    }

    const splitIndex = Math.floor(primaryBars.length * TRAIN_SHARE);
    const splits = [
      { bars: primaryBars.slice(0, splitIndex), name: "train" },
      { bars: primaryBars.slice(splitIndex - WARMUP_BARS), name: "test" },
    ];

    for (const override of args.grid) {
      const variant = describeOverride(override);
      for (const split of splits) {
        const result = simulateSymbol({
          calibrationOverride: override,
          dailyBars,
          primaryBars: split.bars,
          stepBars: args.step,
          symbol,
          warmupBars: WARMUP_BARS,
        });
        rows.push([
          symbol,
          variant,
          split.name,
          String(result.decisionPoints),
          String(result.summary.total),
          String(result.summary.unfilled),
          formatRate(result.summary.tp1HitRate),
          formatRate(result.summary.stopRate),
          result.summary.expectancyR.toFixed(3),
        ]);
      }
    }
  }

  printTable(rows);
}

function parseArgs(argv: string[]): SweepArgs {
  const get = (flag: string) => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const symbols = (get("symbols") ?? "EURUSD").split(",").map((value) =>
    value.trim().toUpperCase()
  ).filter(Boolean);
  const days = Number(get("days") ?? 60);
  const step = Number(get("step") ?? 16);
  const gridSpec = get("grid");
  const grid: Array<Partial<CategoryCalibration>> = [{}];
  if (gridSpec) {
    const [key, values] = gridSpec.split("=");
    for (const value of (values ?? "").split(",")) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        grid.push(
          { [key.trim()]: numeric } as Partial<CategoryCalibration>,
        );
      }
    }
  }
  return { days, grid, step, symbols };
}

async function fetchIntradayBars(
  providerSymbol: string,
  days: number,
): Promise<Bar[]> {
  const bars: Bar[] = [];
  const chunkDays = 8;
  const now = Date.now();
  for (let offset = days; offset > 0; offset -= chunkDays) {
    const from = new Date(now - offset * 86_400_000);
    const to = new Date(
      now - Math.max(offset - chunkDays, 0) * 86_400_000,
    );
    const endpoint = new URL(`${FMP_API_BASE_URL}/historical-chart/15min`);
    endpoint.searchParams.set("symbol", providerSymbol);
    endpoint.searchParams.set("from", isoDate(from));
    endpoint.searchParams.set("to", isoDate(to));
    endpoint.searchParams.set("apikey", API_KEY!);
    bars.push(...await fetchBars(endpoint));
    await sleep(250);
  }
  return dedupeSort(bars);
}

async function fetchDailyBars(
  providerSymbol: string,
  days: number,
): Promise<Bar[]> {
  const endpoint = new URL(`${FMP_API_BASE_URL}/historical-price-eod/full`);
  endpoint.searchParams.set("symbol", providerSymbol);
  endpoint.searchParams.set("from", isoDate(new Date(Date.now() - days * 86_400_000)));
  endpoint.searchParams.set("to", isoDate(new Date()));
  endpoint.searchParams.set("apikey", API_KEY!);
  return dedupeSort(await fetchBars(endpoint));
}

async function fetchBars(endpoint: URL): Promise<Bar[]> {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(
      `FMP request failed (${response.status}) for ${endpoint.pathname}`,
    );
  }
  const payload = await response.json();
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { historical?: unknown[] }).historical)
    ? (payload as { historical: unknown[] }).historical
    : [];
  return (rows as Array<Record<string, unknown>>)
    .filter((row) =>
      typeof row.date === "string" && typeof row.open === "number" &&
      typeof row.high === "number" && typeof row.low === "number" &&
      typeof row.close === "number"
    )
    .map((row) => ({
      close: row.close as number,
      high: row.high as number,
      low: row.low as number,
      open: row.open as number,
      time: toTimestamp(row.date as string),
      volume: typeof row.volume === "number" ? row.volume : 0,
    }));
}

function toTimestamp(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : value.includes("T")
    ? value
    : `${value.replace(" ", "T")}Z`;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function dedupeSort(bars: Bar[]): Bar[] {
  const byTime = new Map<number, Bar>();
  for (const bar of bars) {
    byTime.set(bar.time, bar);
  }
  return Array.from(byTime.values()).sort((first, second) =>
    first.time - second.time
  );
}

function describeOverride(override: Partial<CategoryCalibration>) {
  const entries = Object.entries(override);
  return entries.length === 0
    ? "baseline"
    : entries.map(([key, value]) => `${key}=${value}`).join(",");
}

function formatRate(value: number) {
  return `${Math.round(value * 100)}%`;
}

function printTable(rows: string[][]) {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length))
  );
  for (const row of rows) {
    console.log(
      row.map((cell, column) => cell.padEnd(widths[column])).join("  "),
    );
  }
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
