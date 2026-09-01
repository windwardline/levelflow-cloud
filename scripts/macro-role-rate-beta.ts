/**
 * §6b-1 A: are PLUSD and PAUSD monetary metals or industrial ones?
 *
 * `macroRates.ts:165-166` holds both at `role: "none"` behind an OPEN marker,
 * and says the criterion separating a monetary metal from an industrial one is
 * something "nothing in this repo states." That is true of the prose. It is not
 * true of the table's behaviour: the four metals it admits are the four that
 * move inverse to the ten-year, and the one it excludes by name is the one that
 * does not. The criterion is already there, unstated, and it is measurable.
 *
 * ZERO PROVIDER BYTES, BY CONSTRUCTION. Every series is read straight out of
 * `.calibration-cache` with `readFileSync`. There is no fetcher in this file to
 * fall back to, so a missing store is a crash naming the market rather than a
 * quiet purchase — which matters while the account sits over its trailing-30
 * ceiling.
 *
 * WHY NOT R3. The macro role is not a grid axis: `GRID_OVERRIDE_KEYS` mirrors
 * `CategoryCalibration`'s numeric fields, and the role lives in a symbol-keyed
 * map in `macroRates.ts`, outside calibration entirely. R3 runs both markets at
 * `role: "none"` on every variant, so the arm that would answer this is never
 * run and cannot be. R3's 15-minute window is also the wrong instrument: PLUSD
 * and PAUSD 15-minute data begins 2023-10-01, and inside that window the
 * ten-year spans 3.63%-4.98% and the controls invert — run this script and read
 * the second table, which is printed for exactly that reason.
 *
 * WHAT IT MEASURES: the daily close-to-close return of each metal regressed on
 * the same day's change in the ten-year, in percent per basis point, over every
 * day both series are cached.
 *
 * WHAT IT DOES NOT MEASURE: realized R, and therefore not what admitting either
 * market to `rate-inverse` would earn. The role adds +/-1 or +/-2 to a 0-100
 * confidence score that feeds the acceptance gate, the scan's primary sort and
 * the correlated-sibling suppressor, so the accepted population would differ.
 * This says which side of the table these two belong on. It does not say what
 * that membership is worth, and nothing here should be read as if it did.
 *
 * THE INSTRUMENT VALIDATES BEFORE IT SPEAKS. The five markets the table has
 * already ruled on are the controls. Unless all four declared monetary metals
 * come back significantly negative AND declared-industrial copper comes back
 * significantly positive, the criterion has failed to reproduce the answers it
 * is supposed to encode, and this script refuses the open pair rather than
 * reporting a number it has not earned.
 */
import { existsSync, readFileSync } from "node:fs";
import { MACRO_RATE_ROLE_BY_SYMBOL } from "../supabase/functions/trade-analyzer/macroRates.ts";

const CACHE = ".calibration-cache";
const R3_WINDOW_START = Date.UTC(2023, 9, 1);

/**
 * The three groups are DERIVED from the role table's own stated reasons, never
 * listed here. A hand-listed population is what `tests/symbolPopulations.test.ts`
 * polices, and it would rot the moment the table moved: rule PLUSD tomorrow and
 * a literal list would keep testing it as an open question. These partitions
 * follow the table instead. `getAssetType` cannot do this job — it files GCUSD,
 * SIUSD, PLUSD, PAUSD and HGUSD under `futures` and leaves only XAUUSD and
 * XAGUSD in `metals`.
 */
const entries = Object.entries(MACRO_RATE_ROLE_BY_SYMBOL);
const where = (predicate: (why: string) => boolean) =>
  entries.filter(([, entry]) => predicate(entry.why)).map(([symbol]) => symbol).sort();

/** Declared monetary — the criterion must reproduce these as significantly negative. */
const MONETARY = where((why) => why.startsWith("Monetary metal:"));
/** Declared industrial — must reproduce as significantly POSITIVE, or the sign test is empty. */
const INDUSTRIAL = where((why) => why.includes("industrial, not monetary"));
/** The open question, §6b-1 A. */
const OPEN = where((why) => why.startsWith("OPEN"));

for (const [label, group] of [["monetary", MONETARY], ["industrial", INDUSTRIAL], ["open", OPEN]] as const) {
  if (group.length === 0) {
    throw new Error(
      `The ${label} group derived empty. macroRates.ts's wording changed and this ` +
        `script's predicates no longer match it — fix the predicate, do not list symbols.`,
    );
  }
}

const cached = (symbol: string) => existsSync(`${CACHE}/${symbol}-daily-7000.rolling.json`);
/** Stated, never silently dropped: a control with no cached series is named in the output. */
const UNCACHED = [...MONETARY, ...INDUSTRIAL, ...OPEN].filter((s) => !cached(s));

type Fit = {
  n: number;
  correlation: number;
  beta: number;
  low: number;
  high: number;
  t: number;
};

function readItems<T>(file: string): T[] {
  const raw = readFileSync(`${CACHE}/${file}`, "utf8");
  const items = (JSON.parse(raw) as { items?: T[] }).items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`${file} holds no items — refusing to report on an empty series.`);
  }
  return items;
}

/** UTC calendar day, so a bar and a Treasury row meet on the same key. */
const dayKey = (ms: number) => Math.floor(ms / 86_400_000);

/** Day-over-day change, skipping any gap wider than a week. */
function changes(
  points: Array<{ key: number; value: number }>,
  scale: number,
): Map<number, number> {
  const sorted = [...points].sort((a, b) => a.key - b.key);
  const out = new Map<number, number>();
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const here = sorted[i];
    if (here.key - prev.key > 7 || prev.value === 0) continue;
    out.set(here.key, (here.value / prev.value - 1) * scale);
  }
  return out;
}

function tenYearChangeBps(): Map<number, number> {
  const rows = readItems<{ dateMs: number; tenYear: number | null }>(
    "treasury-rates.rolling.json",
  ).filter((r) => typeof r.tenYear === "number");
  const sorted = rows.sort((a, b) => a.dateMs - b.dateMs);
  const out = new Map<number, number>();
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const here = sorted[i];
    if (dayKey(here.dateMs) - dayKey(prev.dateMs) > 7) continue;
    out.set(dayKey(here.dateMs), ((here.tenYear as number) - (prev.tenYear as number)) * 100);
  }
  return out;
}

function dailyReturnsPct(symbol: string): Map<number, number> {
  const bars = readItems<{ time: number; close: number | null }>(
    `${symbol}-daily-7000.rolling.json`,
  ).filter((b) => typeof b.close === "number" && b.close > 0);
  return changes(
    bars.map((b) => ({ key: dayKey(b.time), value: b.close as number })),
    100,
  );
}

/** OLS of return on rate change, with a 95% interval on the slope. */
function fit(symbol: string, since = 0): Fit {
  const rates = tenYearChangeBps();
  const returns = dailyReturnsPct(symbol);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [key, ret] of returns) {
    const rate = rates.get(key);
    if (rate === undefined || key < dayKey(since)) continue;
    xs.push(rate);
    ys.push(ret);
  }
  const n = xs.length;
  if (n < 30) throw new Error(`${symbol}: only ${n} paired days — too few to report.`);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const beta = sxy / sxx;
  let resid = 0;
  for (let i = 0; i < n; i += 1) resid += (ys[i] - my - beta * (xs[i] - mx)) ** 2;
  const se = Math.sqrt(resid / (n - 2) / sxx);
  return {
    n,
    correlation: sxy / Math.sqrt(sxx * syy),
    beta,
    low: beta - 1.96 * se,
    high: beta + 1.96 * se,
    t: beta / se,
  };
}

const row = (symbol: string, f: Fit) =>
  `  ${symbol.padEnd(8)}${String(f.n).padStart(6)}  ${f.correlation.toFixed(3).padStart(7)}` +
  `  ${f.beta.toFixed(4).padStart(9)}  ${f.t.toFixed(2).padStart(7)}` +
  `   [${f.low.toFixed(4)}, ${f.high.toFixed(4)}]`;

function table(label: string, since: number) {
  console.log(`\n=== ${label} ===`);
  console.log(`  ${"symbol".padEnd(8)}${"n".padStart(6)}  ${"corr".padStart(7)}  ${"%/bp".padStart(9)}  ${"t".padStart(7)}   95% CI`);
  for (const [label, group] of [
    ["declared monetary (rate-inverse)", MONETARY],
    ["declared industrial (none)", INDUSTRIAL],
    ["OPEN, §6b-1 A", OPEN],
  ] as const) {
    console.log(`  -- ${label}`);
    for (const s of group.filter(cached)) console.log(row(s, fit(s, since)));
  }
}

function main() {
  table("Full cached history", 0);
  if (UNCACHED.length > 0) {
    console.log(`\n  No cached daily series, omitted from every table: ${UNCACHED.join(", ")}.`);
  }

  const failed = [
    ...MONETARY.filter(cached)
      .map((s) => ({ symbol: s, ...fit(s, 0) }))
      .filter((m) => m.high >= 0)
      .map((m) => `${m.symbol} is not significantly negative`),
    ...INDUSTRIAL.filter(cached)
      .map((s) => ({ symbol: s, ...fit(s, 0) }))
      .filter((m) => m.low <= 0)
      .map((m) => `${m.symbol} is not significantly positive`),
  ];

  table("R3's 15-minute window (2023-10-01 on) — why the sweep cannot answer this", R3_WINDOW_START);
  console.log(
    "\n  The second table is the control check, not the answer. Inside R3's window\n" +
    "  the criterion stops reproducing its own decided cases, which is why this\n" +
    "  question is settled on full history or left open, and not deferred to R3.",
  );

  console.log("\n=== Verdict ===");
  if (failed.length > 0) {
    console.log("  REFUSED. The criterion did not reproduce the table's decided cases:");
    for (const f of failed) console.log(`    - ${f}`);
    console.log("  No reading is offered for PLUSD or PAUSD.");
    process.exitCode = 1;
    return;
  }
  console.log("  Controls reproduce: every declared monetary metal is significantly");
  console.log(`  negative and ${INDUSTRIAL.join(", ")} significantly positive, on full history.`);
  for (const s of OPEN.filter(cached)) {
    const f = fit(s, 0);
    const side = f.high < 0 ? "monetary side" : f.low > 0 ? "industrial side" : "NEITHER side";
    console.log(
      `  ${s}: ${f.beta.toFixed(4)} %/bp [${f.low.toFixed(4)}, ${f.high.toFixed(4)}] — ${side}.`,
    );
  }
  console.log("\n  Which side, not what it is worth. The magnitude question is separate:");
  console.log("  both sit near half the monetary betas, and the role table has no dial");
  console.log("  for that. Reporting a side is a repair; adding a tier is a model change.");
}

main();
