/**
 * 1-minute bar availability probe (owner-requested, 2026-08-06).
 *
 * The gating question for everything downstream of the stop cap. 15-minute bars
 * cannot order intrabar events, which is why a measured ~60% gain at sub-1.0 stop
 * caps was declined in round 25 — at a 0.5 cap, 26% of setups end in neither a
 * target nor a stop, so the expectancy figure reports how the harness treats
 * ambiguity rather than how the market behaved.
 *
 * Bar resolution sits UPSTREAM of the stop cap the way the stop cap sits upstream
 * of the runner ceiling. Round 26 learned that lesson the expensive way: the
 * runner grid ran at the old caps and had to be re-run when they moved. Tuning
 * per-symbol geometry at 15-minute resolution before knowing whether 1-minute is
 * available would repeat it one level up.
 *
 * This answers only the availability question — coverage, depth, and recency per
 * market. What to DO about it is a separate decision that needs this evidence.
 *
 *   FMP_API_KEY=... npx tsx scripts/probe-minute-bars.ts [--json out.json]
 */
import { MASTER_LIST_ROWS } from "../src/lib/broker/masterList.ts";
import { flagReader } from "./flagReader.ts";

const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_API_KEY;
const CONCURRENCY = 4;

type Probe = {
  fmpSymbol: string;
  markets: string[];
  bars: number;
  firstDate: string | null;
  lastDate: string | null;
  spanDays: number | null;
  note: string;
};

async function probe(fmpSymbol: string, markets: string[]): Promise<Probe> {
  const base: Probe = {
    fmpSymbol,
    markets,
    bars: 0,
    firstDate: null,
    lastDate: null,
    spanDays: null,
    note: "",
  };
  try {
    const url = new URL(`${BASE}/historical-chart/1min`);
    url.searchParams.set("symbol", fmpSymbol);
    url.searchParams.set("apikey", KEY!);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return { ...base, note: `HTTP ${res.status}` };
    const payload = await res.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      return { ...base, note: "zero 1-minute bars" };
    }
    const dates = (payload as Array<{ date?: string }>)
      .map((b) => b.date ?? "")
      .filter(Boolean)
      .sort();
    const first = dates[0] ?? null;
    const last = dates.at(-1) ?? null;
    const span = first && last
      ? Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000)
      : null;
    return {
      ...base,
      bars: payload.length,
      firstDate: first,
      lastDate: last,
      spanDays: span,
      note: "ok",
    };
  } catch (error) {
    return { ...base, note: `failed: ${(error as Error).message}` };
  }
}

// The ONE declaration of which flags own the token after them (#364
// round 50, finding 2 — the scan now globs scripts/, so every reader with
// a value-taking flag is inside the law rather than on a curated list).
const VALUE_FLAGS = new Set(["--json"]);


async function main(): Promise<void> {
  if (!KEY) {
    console.error("FMP_API_KEY is required.");
    process.exit(1);
  }
  // Distinct FMP symbols only — WTI/CLUSD and BRENT/BZUSD each share one.
  const bySymbol = new Map<string, string[]>();
  for (const row of MASTER_LIST_ROWS) {
    if (!row.fmpSymbol || row.levelflowSymbol === null) continue;
    bySymbol.set(row.fmpSymbol, [
      ...(bySymbol.get(row.fmpSymbol) ?? []),
      row.levelflowSymbol,
    ]);
  }
  const entries = [...bySymbol.entries()];
  console.log(`probing ${entries.length} distinct FMP symbols for 1-minute bars\n`);

  const results: Probe[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < entries.length) {
      const [symbol, markets] = entries[cursor++];
      const result = await probe(symbol, markets);
      results.push(result);
      console.log(
        `${result.bars > 0 ? "ok  " : "NONE"} ${symbol.padEnd(10)} ` +
          `${String(result.bars).padStart(6)} bars  ` +
          `${result.spanDays === null ? "   -" : String(result.spanDays).padStart(4)}d  ` +
          `${result.firstDate ?? ""} -> ${result.lastDate ?? ""}  ${result.note}`,
      );
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const have = results.filter((r) => r.bars > 0);
  const none = results.filter((r) => r.bars === 0);
  const spans = have.map((r) => r.spanDays ?? 0).sort((a, b) => a - b);
  const median = spans.length ? spans[Math.floor(spans.length / 2)] : 0;

  console.log(`\n=== VERDICT ===`);
  console.log(`1-minute available: ${have.length} / ${results.length} distinct symbols`);
  console.log(`markets covered:    ${have.flatMap((r) => r.markets).length} Levelflow symbols`);
  console.log(`span days: min ${spans[0] ?? 0}  median ${median}  max ${spans.at(-1) ?? 0}`);
  console.log(`bars: min ${Math.min(...have.map((r) => r.bars))}  max ${Math.max(...have.map((r) => r.bars))}`);
  if (none.length) {
    console.log(`\nno 1-minute series (${none.length}):`);
    for (const r of none) console.log(`  ${r.fmpSymbol.padEnd(10)} ${r.note} — ${r.markets.join(" ")}`);
  }
  const { str } = flagReader(process.argv, VALUE_FLAGS);
  const jsonPath = str("--json");
  if (jsonPath !== undefined) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nwrote ${jsonPath}`);
  }
}

await main();
