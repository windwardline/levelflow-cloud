/**
 * Live E8-to-FMP match verification (owner directive, 2026-08-05).
 *
 * Amendment 24 makes Levelflow's offering "exactly the markets E8 makes
 * visible on that account type", with two exceptions: no FMP counterpart, or
 * an owner exclusion grounded in data drift or replay performance. This
 * script settles the FIRST exception empirically rather than by assertion —
 * every `fmpSymbol` in the master list is probed against the live feed, and
 * anything that cannot produce usable history is a lapse.
 *
 * A "confirmed match" here means the feed answers with real, deep, current
 * bars. It does NOT mean the series is the right instrument — that is the
 * F-series price-level work (docs/research/e8-feed-verification-*.md), which
 * this script reports alongside so the two are never confused.
 *
 *   FMP_API_KEY=... npx tsx scripts/verify-fmp-matches.ts [--json out.json]
 *
 * Exit code is 1 when any served-or-visible row lapses — this is a gate, not
 * a report.
 */
import { MASTER_LIST_ROWS, type MasterListRow } from "../src/lib/broker/masterList.ts";

const FMP_API_BASE_URL = "https://financialmodelingprep.com/stable";
const API_KEY = process.env.FMP_API_KEY;

/** A year of daily bars is the floor the calibration work assumes. */
const MIN_DAILY_BARS = 250;
/** Weekends plus a holiday still land inside this window. */
const MAX_STALE_DAYS = 5;
/** Politeness: the feed is rate-limited per minute, not per second. */
const CONCURRENCY = 4;

type ProbeVerdict = "confirmed" | "lapse-no-data" | "lapse-shallow" | "lapse-stale";

type Probe = {
  row: MasterListRow;
  fmpSymbol: string;
  verdict: ProbeVerdict;
  dailyBars: number;
  intradayBars: number;
  firstDate: string | null;
  lastDate: string | null;
  lastClose: number | null;
  note: string;
};

async function fetchJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.json();
}

type EodBar = { date?: string; close?: number };
type IntradayBar = { date?: string };

async function probe(row: MasterListRow): Promise<Probe> {
  const fmpSymbol = row.fmpSymbol!;
  const base: Omit<Probe, "verdict" | "note"> = {
    row,
    fmpSymbol,
    dailyBars: 0,
    intradayBars: 0,
    firstDate: null,
    lastDate: null,
    lastClose: null,
  };

  let daily: EodBar[] = [];
  let intraday: IntradayBar[] = [];
  try {
    const eod = new URL(`${FMP_API_BASE_URL}/historical-price-eod/full`);
    eod.searchParams.set("symbol", fmpSymbol);
    eod.searchParams.set("apikey", API_KEY!);
    const payload = await fetchJson(eod);
    daily = Array.isArray(payload) ? (payload as EodBar[]) : [];
  } catch (error) {
    return {
      ...base,
      verdict: "lapse-no-data",
      note: `EOD probe failed: ${(error as Error).message}`,
    };
  }

  try {
    const chart = new URL(`${FMP_API_BASE_URL}/historical-chart/15min`);
    chart.searchParams.set("symbol", fmpSymbol);
    chart.searchParams.set("apikey", API_KEY!);
    const payload = await fetchJson(chart);
    intraday = Array.isArray(payload) ? (payload as IntradayBar[]) : [];
  } catch {
    // Intraday depth is reported, never a lapse on its own: the analyzer
    // resamples from whatever the primary timeframe returns.
    intraday = [];
  }

  if (daily.length === 0) {
    return { ...base, verdict: "lapse-no-data", note: "EOD returned zero bars" };
  }

  // FMP returns EOD newest-first.
  const sorted = [...daily].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const firstDate = sorted[0]?.date ?? null;
  const lastDate = sorted.at(-1)?.date ?? null;
  const lastClose = sorted.at(-1)?.close ?? null;
  const measured = {
    ...base,
    dailyBars: daily.length,
    intradayBars: intraday.length,
    firstDate,
    lastDate,
    lastClose,
  };

  const ageDays = lastDate
    ? Math.floor((Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${lastDate}T00:00:00Z`)) / 86_400_000)
    : Number.POSITIVE_INFINITY;

  if (daily.length < MIN_DAILY_BARS) {
    return {
      ...measured,
      verdict: "lapse-shallow",
      note: `${daily.length} daily bars < ${MIN_DAILY_BARS} floor`,
    };
  }
  if (ageDays > MAX_STALE_DAYS) {
    return {
      ...measured,
      verdict: "lapse-stale",
      note: `last bar ${lastDate} is ${ageDays}d old`,
    };
  }
  return { ...measured, verdict: "confirmed", note: `${daily.length} daily bars through ${lastDate}` };
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error("FMP_API_KEY is required.");
    process.exit(1);
  }
  const mapped = MASTER_LIST_ROWS.filter((row) => row.fmpSymbol !== null);
  const unmapped = MASTER_LIST_ROWS.filter((row) => row.fmpSymbol === null);

  // Distinct FMP symbols only — WTI/CLUSD and BRENT/BZUSD each share one.
  const bySymbol = new Map<string, MasterListRow[]>();
  for (const row of mapped) {
    const list = bySymbol.get(row.fmpSymbol!) ?? [];
    list.push(row);
    bySymbol.set(row.fmpSymbol!, list);
  }
  console.log(
    `Probing ${bySymbol.size} distinct FMP symbols across ${mapped.length} mapped rows ` +
      `(${unmapped.length} rows carry no FMP symbol by record).\n`,
  );

  const representatives = [...bySymbol.values()].map((rows) => rows[0]);
  const results: Probe[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < representatives.length) {
      const row = representatives[cursor++];
      const result = await probe(row);
      results.push(result);
      const mark = result.verdict === "confirmed" ? "ok  " : "LAPSE";
      console.log(
        `${mark} ${result.fmpSymbol.padEnd(10)} ${String(result.dailyBars).padStart(5)}d ` +
          `${String(result.intradayBars).padStart(5)}i  ${result.note}`,
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  results.sort((a, b) => a.fmpSymbol.localeCompare(b.fmpSymbol));
  const lapses = results.filter((entry) => entry.verdict !== "confirmed");

  console.log(`\n=== VERDICT ===`);
  console.log(`confirmed: ${results.length - lapses.length} / ${results.length} distinct FMP symbols`);
  for (const lapse of lapses) {
    const rows = bySymbol.get(lapse.fmpSymbol)!;
    const names = rows.map((row) => `${row.brokerName} (${row.classification})`).join(", ");
    console.log(`  LAPSE ${lapse.fmpSymbol}: ${lapse.note} — affects ${names}`);
  }

  const jsonIndex = process.argv.indexOf("--json");
  if (jsonIndex !== -1 && process.argv[jsonIndex + 1]) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      process.argv[jsonIndex + 1],
      JSON.stringify(
        results.map((entry) => ({
          fmpSymbol: entry.fmpSymbol,
          verdict: entry.verdict,
          dailyBars: entry.dailyBars,
          intradayBars: entry.intradayBars,
          firstDate: entry.firstDate,
          lastDate: entry.lastDate,
          lastClose: entry.lastClose,
          note: entry.note,
          rows: bySymbol.get(entry.fmpSymbol)!.map((row) => ({
            brokerName: row.brokerName,
            levelflowSymbol: row.levelflowSymbol,
            classification: row.classification,
            status: row.status,
          })),
        })),
        null,
        2,
      ),
    );
    console.log(`\nwrote ${process.argv[jsonIndex + 1]}`);
  }

  // Served rows lapsing is a hard failure; an unonboarded mate lapsing is
  // information for the reentry decision, not a gate.
  const servedLapse = lapses.some((entry) =>
    bySymbol.get(entry.fmpSymbol)!.some((row) => row.levelflowSymbol !== null),
  );
  process.exit(servedLapse ? 1 : 0);
}

await main();
