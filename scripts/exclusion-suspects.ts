/**
 * Which exclusions are our own stop cap rather than the market?
 *
 * Owner-agreed principle (2026-08-06): a "this market has no edge" verdict is
 * suspect until its geometry has been tuned. Two verdicts have already fallen to
 * it tonight — oil was penalized by an energies TP1 share twice the healthy
 * value, and indices' class-level negative turned out to be a profitable
 * structural subset averaged with a badly negative cap-clipped one.
 *
 * This tests every excluded or negative market for that same signature: the cap
 * setting most of its stops, AND its structural subset outperforming its
 * cap-clipped subset by a real margin. A market with both is a prime candidate
 * for reinstatement once its stop cap is tuned. A market that is negative with
 * structure ALSO negative is negative for its own reasons.
 *
 * Association, not proof — provenance is not randomly assigned, since the cap
 * binds exactly when structure wanted more room. This ranks suspects for the
 * grid to adjudicate; it does not reinstate anything on its own.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { assertManifest } from "./sweepStats.ts";

const SUSPECTS = new Set([
  "SP", "NSDQ", "DOW", "NIKKEI", "DAX", "ASX",
  "NGUSD", "HGUSD", "BNBUSD",
  "ZOUSX", "DYDXUSD",
  "BRENT", "WTI",
]);

type Row = {
  symbol: string; outcome: string; realizedR: number | null;
  split: string; stopProvenance?: string; variant?: string;
};
type S = { filled: number; rSum: number; wins: number };

async function main(): Promise<void> {
  const acc = new Map<string, S>();
  const k = (s: string, p: string) => `${s}|${p}`;
  for (const file of process.argv.slice(2)) {
    // R0: the one-clock door (#358 round 3).
    assertManifest(file);
    const stream = createInterface({ crlfDelay: Infinity, input: createReadStream(file) });
    for await (const line of stream) {
      if (!line) continue;
      let row: Row;
      try { row = JSON.parse(line) as Row; } catch { continue; }
      if (row.variant && row.variant !== "baseline") continue;
      if (!SUSPECTS.has(row.symbol) || !row.stopProvenance) continue;
      if (row.outcome === "unfilled") continue;
      for (const key of [k(row.symbol, row.stopProvenance), k(row.symbol, "ALL")]) {
        let s = acc.get(key);
        if (!s) { s = { filled: 0, rSum: 0, wins: 0 }; acc.set(key, s); }
        s.filled += 1;
        s.rSum += typeof row.realizedR === "number" && Number.isFinite(row.realizedR)
          ? row.realizedR : 0;
        if (row.outcome === "take_profit" || row.outcome === "tp1_partial") s.wins += 1;
      }
    }
  }
  const E = (s?: S) => (s && s.filled ? s.rSum / s.filled : null);
  const f3 = (v: number | null) => v === null ? "  —" : (v >= 0 ? "+" : "") + v.toFixed(3);
  console.log(
    `${"market".padEnd(9)}${"overall".padStart(8)}${"structure".padStart(11)}` +
    `${"cap".padStart(9)}${"cap%".padStart(7)}${"filled".padStart(8)}  reading`,
  );
  for (const sym of [...SUSPECTS].sort()) {
    const all = acc.get(k(sym, "ALL"));
    if (!all) continue;
    const piv = acc.get(k(sym, "pivot"));
    const cap = acc.get(k(sym, "cap"));
    const capShare = cap ? cap.filled / all.filled : 0;
    const ep = E(piv), ec = E(cap), ea = E(all);
    const thin = (piv?.filled ?? 0) < 60;
    const suspect = capShare > 0.5 && ep !== null && ec !== null && ep - ec > 0.05;
    console.log(
      `${sym.padEnd(9)}${f3(ea).padStart(8)}${f3(ep).padStart(11)}${f3(ec).padStart(9)}` +
      `${(capShare * 100).toFixed(0).padStart(6)}%${String(all.filled).padStart(8)}  ` +
      (suspect
        ? `CAP-SUSPECT (structure +${(ep! - ec!).toFixed(3)} better)${thin ? ", thin structural sample" : ""}`
        : ea !== null && ea < 0
          ? "negative on its own terms"
          : "positive"),
    );
  }
}

await main();
