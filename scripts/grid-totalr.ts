/**
 * Reads a grid by TOTAL R across both splits, per class and per market.
 *
 * Total R = expectancy x setups. Amendment 25's companion lesson: our older bar
 * — "expectancy must improve on both splits" — optimizes per-trade quality, and
 * rejects a change that doubles the trade count to protect a hundredth of an R
 * per trade. That is the wrong quantity whenever a parameter gates VOLUME, which
 * every geometry ceiling and every threshold does. It rejected agriculture's
 * runner change, which was worth two thirds of the class's return.
 *
 * Thin variants are refused outright rather than ranked: a variant that "wins"
 * on 34 setups against a baseline's 271 is an artifact of its own tightness.
 */
import { readFileSync } from "node:fs";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";

type Cell = { e: number; n: number; planRej: number };
const rows = new Map<string, Map<string, Map<string, Cell>>>();

for (const path of process.argv.slice(2).filter((a) => !a.startsWith("--"))) {
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f.length < 16 || f[0] === "symbol" || !/^[A-Z^]/.test(f[0])) continue;
    const [sym, variant, split] = f;
    const e = Number(f[15]), n = Number(f[11]), pr = Number(f[8]);
    if (!Number.isFinite(e)) continue;
    if (!rows.has(sym)) rows.set(sym, new Map());
    const bySym = rows.get(sym)!;
    if (!bySym.has(variant)) bySym.set(variant, new Map());
    bySym.get(variant)!.set(split, { e, n, planRej: pr });
  }
}

const variants = [...new Set([...rows.values()].flatMap((m) => [...m.keys()]))]
  .sort((a, b) => (a === "baseline" ? -1 : b === "baseline" ? 1 : a.localeCompare(b)));
const classes = [...new Set([...rows.keys()].map((s) => getAssetType(s)))].sort();

for (const cls of classes) {
  const syms = [...rows.keys()].filter((s) => getAssetType(s) === cls);
  console.log(`\n=== ${cls.toUpperCase()} (${syms.length} markets) ===`);
  console.log(`${"variant".padEnd(30)}${"train R".padStart(9)}${"test R".padStart(8)}${"train n".padStart(9)}${"test n".padStart(8)}  verdict`);
  let base = { tr: 0, te: 0, n: 0 };
  for (const v of variants) {
    const t = { train: [0, 0], test: [0, 0] };
    for (const sym of syms) {
      for (const split of ["train", "test"] as const) {
        const c = rows.get(sym)!.get(v)?.get(split);
        if (c) { t[split][0] += c.e * c.n; t[split][1] += c.n; }
      }
    }
    if (v === "baseline") base = { tr: t.train[0], te: t.test[0], n: t.test[1] };
    let verdict = "";
    if (v !== "baseline") {
      if (t.test[1] < base.n * 0.5) verdict = `THIN (${t.test[1]} vs ${base.n}) — refuse`;
      else if (t.train[0] > base.tr && t.test[0] > base.te) verdict = "IMPROVES TOTAL R BOTH";
      else verdict = "fails";
    }
    console.log(
      `${v.padEnd(30)}${t.train[0].toFixed(1).padStart(9)}${t.test[0].toFixed(1).padStart(8)}` +
      `${String(t.train[1]).padStart(9)}${String(t.test[1]).padStart(8)}  ${verdict}`,
    );
  }
}
