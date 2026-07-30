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
//     [--cache-dir path]   pin bars to disk so later runs reuse identical data
//     [--capture-all]      evaluate below-threshold setups too (calibration)
//     [--emit path.jsonl]  write one JSON line per evaluated setup
//     [--days max]         discover each symbol's full history (rolling from
//                          the run date) instead of a fixed lookback
//     [--discover]         report discovered depth per symbol and exit

import type { CategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  combineCotSeries,
  type CotReportRow,
  getCotContractMapping,
  netPctFromReport,
} from "../supabase/functions/trade-analyzer/cotContext.ts";
import type { SweepNewsEvent } from "../supabase/functions/trade-analyzer/sweep.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import { resolveProviderSymbols } from "../supabase/functions/trade-analyzer/symbols.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

const FMP_API_BASE_URL = "https://financialmodelingprep.com/stable";
const API_KEY = process.env.FMP_API_KEY;
const WARMUP_BARS = 240;
const TRAIN_SHARE = 0.6;

type SweepArgs = {
  cacheDir: string | undefined;
  captureAll: boolean;
  days: number;
  discover: boolean;
  emit: string | undefined;
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
    "sessionBlk",
    "newsBlk",
    "regimeBlk",
    "noConsensus",
    "planRejected",
    "belowConf",
    "belowPayoff",
    "setups",
    "unfilled",
    "tp1HitRate",
    "stopRate",
    "expectancyR",
  ]];

  const emitLines: string[] = [];
  const newsEvents = args.discover
    ? []
    : await loadEconomicCalendar(args.cacheDir);
  for (const symbol of args.symbols) {
    const providerSymbol = resolveProviderSymbols(symbol)[0];
    if (!providerSymbol) {
      console.warn(`Skipping ${symbol}: no provider symbol.`);
      continue;
    }
    // Cache keys carry the run-day anchor: the replay window is always
    // relative to now, so a later day's run refetches the rolled-forward
    // window while same-day runs stay pinned for drift-free A/B.
    const anchor = isoDate(new Date());
    const [primaryBars, dailyBars] = await Promise.all([
      cachedBars(
        args.cacheDir,
        `${providerSymbol}-15min-${args.days}-${anchor}`,
        () => fetchIntradayBars(providerSymbol, args.days),
      ),
      cachedBars(
        args.cacheDir,
        `${providerSymbol}-daily-${args.days}-${anchor}`,
        () => fetchDailyBars(providerSymbol, args.days + 240),
      ),
    ]);
    if (args.discover) {
      const first = primaryBars[0];
      const last = primaryBars.at(-1);
      const span = first && last
        ? Math.round((last.time - first.time) / 86_400_000)
        : 0;
      console.log(
        `${symbol}\t${providerSymbol}\t${primaryBars.length}\t${
          first ? isoDate(new Date(first.time)) : "-"
        }\t${span}`,
      );
      continue;
    }

    if (primaryBars.length < WARMUP_BARS * 2) {
      console.warn(
        `Skipping ${symbol}: only ${primaryBars.length} intraday bars.`,
      );
      continue;
    }

    const cotReports = await loadCotReports(args.cacheDir, symbol);

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
          captureAll: args.captureAll,
          cotReports,
          dailyBars,
          newsEvents,
          primaryBars: split.bars,
          stepBars: args.step,
          symbol,
          warmupBars: WARMUP_BARS,
        });
        if (args.emit) {
          for (const record of result.outcomes) {
            emitLines.push(JSON.stringify({
              split: split.name,
              symbol,
              variant,
              ...record,
            }));
          }
        }
        rows.push([
          symbol,
          variant,
          split.name,
          String(result.decisionPoints),
          String(result.rejections.sessionBlocked),
          String(result.rejections.newsBlocked),
          String(result.rejections.regimeBlocked + result.rejections.regimeGated),
          String(result.rejections.noConsensus),
          String(result.rejections.planRejected),
          String(result.rejections.belowConfidence),
          String(result.rejections.belowPayoff),
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
  if (args.emit) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(args.emit, emitLines.join("\n") + "\n");
    console.log(`Emitted ${emitLines.length} setup records to ${args.emit}`);
  }
}

// Scheduled macro calendar for the replay news join. FMP coverage begins in
// 2013; earlier decision points simply see no events, matching the live
// system's behavior when no events exist. Cached per run day like bars.
async function loadEconomicCalendar(
  cacheDir: string | undefined,
): Promise<SweepNewsEvent[]> {
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const anchor = isoDate(new Date());
  const path = cacheDir ? `${cacheDir}/econ-calendar-${anchor}.json` : null;
  if (path) {
    try {
      const cached = JSON.parse(await readFile(path, "utf8"));
      if (Array.isArray(cached) && cached.length > 0) {
        return cached as SweepNewsEvent[];
      }
    } catch {
      // Cache miss: fetch below.
    }
  }

  const events: SweepNewsEvent[] = [];
  const start = Date.parse("2013-01-01T00:00:00Z");
  const chunkMs = 90 * 86_400_000;
  for (let from = start; from < Date.now(); from += chunkMs) {
    const endpoint = new URL(`${FMP_API_BASE_URL}/economic-calendar`);
    endpoint.searchParams.set("from", isoDate(new Date(from)));
    endpoint.searchParams.set(
      "to",
      isoDate(new Date(Math.min(from + chunkMs, Date.now()))),
    );
    endpoint.searchParams.set("apikey", API_KEY!);
    const response = await fetch(endpoint);
    if (!response.ok) {
      console.warn(`Calendar fetch failed (${response.status}); continuing.`);
      continue;
    }
    const payload = await response.json();
    if (Array.isArray(payload)) {
      for (const raw of payload as Array<Record<string, unknown>>) {
        const impact = String(raw.impact ?? "").toLowerCase();
        if (impact !== "high" && impact !== "medium") {
          continue;
        }
        const time = Date.parse(
          String(raw.date ?? "").replace(" ", "T") + "Z",
        );
        const currency = String(raw.currency ?? "").toUpperCase();
        if (Number.isFinite(time) && currency) {
          events.push({ currency, impact, time });
        }
      }
    }
    await sleep(150);
  }
  events.sort((first, second) => first.time - second.time);
  console.log(`Loaded ${events.length} medium/high scheduled events.`);
  if (path && events.length > 0) {
    await mkdir(cacheDir!, { recursive: true });
    await writeFile(path, JSON.stringify(events));
  }
  return events;
}

// Positioning history is weekly and slow-moving, so it caches by contract
// (not by run day) and is shared across every symbol that maps to it.
async function loadCotReports(
  cacheDir: string | undefined,
  symbol: string,
): Promise<CotReportRow[]> {
  const mapping = getCotContractMapping(symbol);
  if (!mapping) {
    return [];
  }
  const [primary, secondary] = await Promise.all([
    fetchCotContract(cacheDir, mapping.primary),
    mapping.secondary
      ? fetchCotContract(cacheDir, mapping.secondary)
      : Promise.resolve([]),
  ]);
  if (primary.length === 0) {
    return [];
  }
  return combineCotSeries(
    primary,
    mapping.secondary ? secondary : undefined,
    mapping.invert,
  );
}

async function fetchCotContract(
  cacheDir: string | undefined,
  contract: string,
): Promise<CotReportRow[]> {
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const path = cacheDir ? `${cacheDir}/cot-${contract}.json` : null;
  if (path) {
    try {
      const cached = JSON.parse(await readFile(path, "utf8")) as CotReportRow[];
      if (Array.isArray(cached)) {
        return cached;
      }
    } catch {
      // Cache miss: fetch below.
    }
  }

  const endpoint = new URL(`${FMP_API_BASE_URL}/commitment-of-traders-report`);
  endpoint.searchParams.set("symbol", contract);
  endpoint.searchParams.set("from", "2009-01-01");
  endpoint.searchParams.set("to", isoDate(new Date()));
  endpoint.searchParams.set("apikey", API_KEY!);
  const response = await fetch(endpoint);
  if (!response.ok) {
    console.warn(`COT fetch failed for ${contract}: ${response.status}`);
    return [];
  }
  const payload = await response.json();
  const rows: CotReportRow[] = [];
  if (Array.isArray(payload)) {
    for (const raw of payload as Array<Record<string, unknown>>) {
      const netPct = netPctFromReport(raw);
      const date = Date.parse(String(raw.date ?? "").replace(" ", "T") + "Z");
      if (netPct !== null && Number.isFinite(date)) {
        rows.push({ date, netPct });
      }
    }
  }
  rows.sort((first, second) => first.date - second.date);
  if (path && rows.length > 0) {
    await mkdir(cacheDir!, { recursive: true });
    await writeFile(path, JSON.stringify(rows));
  }
  await sleep(250);
  return rows;
}

async function cachedBars(
  cacheDir: string | undefined,
  key: string,
  fetcher: () => Promise<Bar[]>,
): Promise<Bar[]> {
  if (!cacheDir) {
    return fetcher();
  }
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const path = `${cacheDir}/${key}.json`;
  try {
    const cached = JSON.parse(await readFile(path, "utf8")) as Bar[];
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
  } catch {
    // Cache miss: fall through to a live fetch and pin it.
  }
  const bars = await fetcher();
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path, JSON.stringify(bars));
  return bars;
}

function parseArgs(argv: string[]): SweepArgs {
  const get = (flag: string) => {
    const index = argv.indexOf(`--${flag}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const symbols = (get("symbols") ?? "EURUSD").split(",").map((value) =>
    value.trim().toUpperCase()
  ).filter(Boolean);
  const daysArg = get("days") ?? "60";
  // "max" discovers each symbol's full available history from the run date.
  const days = daysArg === "max" ? MAX_DEPTH_DAYS : Number(daysArg);
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
  return {
    cacheDir: get("cache-dir"),
    captureAll: argv.includes("--capture-all"),
    days,
    discover: argv.includes("--discover"),
    emit: get("emit"),
    grid,
    step,
    symbols,
  };
}

// FMP caps a single intraday response near 3,000 rows. A 30-day window stays
// complete for every supported market (~2,040 forex bars) and cuts request
// count ~4x versus 8-day chunks, which is what makes multi-year depth
// practical.
const INTRADAY_CHUNK_DAYS = 30;
// Walking back stops after this many consecutive empty windows, which is how
// the end of a symbol's history is detected rather than assumed. Three
// windows (90 days) clears any plausible holiday or provider gap.
const EMPTY_WINDOW_STREAK_LIMIT = 3;
// Safety ceiling only — it must never be the binding constraint, so it sits
// above every confirmed provider floor. Measured 2026-07-29 by walking back
// until history ended: forex begins 2010-01 (~6,050 days), XAUUSD 2013-07
// (~4,760), ^GSPC 2020-02 (~2,350), ^NDX 2020-08 (~2,175), crypto and XAGUSD
// ~1,060-1,200, and CME futures 2023-09/10 (~1,031-1,038). Depth is
// discovered per symbol at run time, never assumed.
const MAX_DEPTH_DAYS = 7_000;

// Walks backward from now until history genuinely ends, so every symbol
// contributes its full available depth and the window rolls forward with the
// run date. Depth is discovered per symbol, never hardcoded.
async function fetchIntradayBars(
  providerSymbol: string,
  days: number,
): Promise<Bar[]> {
  const bars: Bar[] = [];
  const ceiling = days >= MAX_DEPTH_DAYS ? MAX_DEPTH_DAYS : days;
  const now = Date.now();
  let emptyStreak = 0;

  for (
    let offset = INTRADAY_CHUNK_DAYS;
    offset <= ceiling + INTRADAY_CHUNK_DAYS;
    offset += INTRADAY_CHUNK_DAYS
  ) {
    const from = new Date(now - offset * 86_400_000);
    const to = new Date(now - (offset - INTRADAY_CHUNK_DAYS) * 86_400_000);
    const endpoint = new URL(`${FMP_API_BASE_URL}/historical-chart/15min`);
    endpoint.searchParams.set("symbol", providerSymbol);
    endpoint.searchParams.set("from", isoDate(from));
    endpoint.searchParams.set("to", isoDate(to));
    endpoint.searchParams.set("apikey", API_KEY!);
    const chunk = await fetchBars(endpoint);
    if (chunk.length === 0) {
      emptyStreak += 1;
      if (emptyStreak >= EMPTY_WINDOW_STREAK_LIMIT) {
        break;
      }
    } else {
      emptyStreak = 0;
      bars.push(...chunk);
    }
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
