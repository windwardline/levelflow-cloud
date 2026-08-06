/**
 * Per-account-type performance report (owner directive, 2026-08-05).
 *
 * Amendment 24 decides inclusion and exclusion PER ACCOUNT TYPE: E8 treats
 * Forex, Futures, and Crypto as distinct products, and the same market may
 * earn inclusion on one and exclusion on another. So the report that informs
 * those decisions must be cut the same way — never one universe-wide table.
 *
 * Reads an instrumented sweep corpus and reports, for each E8 account
 * classification, performance broken out by market category, plus the
 * exclusion candidates and the ground for each.
 *
 * Metrics mirror summarizeSweepOutcomes: filled = outcome is not "unfilled";
 * a win is take_profit OR tp1_partial; expectancy is mean realizedR over
 * FILLED setups. Standard error assumes a per-trade R deviation supplied by
 * --r-sd (default 0.8, the TP1/stop ladder's rough spread) — it exists to
 * stop a thin sample from being read as a finding, which is exactly how the
 * six-index blanket exclusion got asserted.
 *
 *   npx tsx scripts/account-type-report.ts <emit.jsonl> [more.jsonl ...]
 *     [--r-sd 0.8] [--min-filled 300]
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  getAssetType,
  getCategoryCalibration,
  type RegimeName,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  MASTER_LIST_ROWS,
  type MasterListRow,
} from "../src/lib/broker/masterList.ts";
import { isContractSizeVariant } from "../src/lib/broker/contractVariants.ts";
import {
  FOREX_ACCOUNT_CRYPTO_CFDS,
  accountTypesOffering,
} from "../src/lib/broker/visibility.ts";
import type { BrokerClassification } from "../src/lib/profile.ts";

const CLASSIFICATIONS: BrokerClassification[] = ["forex", "futures", "crypto"];

type Row = {
  symbol: string;
  confidenceScore: number;
  outcome: string;
  realizedR: number | null;
  regime: string;
  rewardRisk: number;
  split: string;
  variant?: string;
};

type Stats = { n: number; filled: number; wins: number; stops: number; rSum: number };

function emptyStats(): Stats {
  return { n: 0, filled: 0, wins: 0, stops: 0, rSum: 0 };
}

function add(stats: Stats, row: Row): void {
  stats.n += 1;
  if (row.outcome === "unfilled") return;
  stats.filled += 1;
  stats.rSum += typeof row.realizedR === "number" && Number.isFinite(row.realizedR)
    ? row.realizedR
    : 0;
  if (row.outcome === "take_profit" || row.outcome === "tp1_partial") stats.wins += 1;
  if (row.outcome === "stop_loss") stats.stops += 1;
}

function expectancy(stats: Stats): number | null {
  return stats.filled === 0 ? null : stats.rSum / stats.filled;
}

function passesOtherGates(row: Row): boolean {
  const calibration = getCategoryCalibration(row.symbol);
  if (row.rewardRisk < calibration.minRewardRisk) return false;
  return !(calibration.blockedRegimes ?? []).includes(row.regime as RegimeName);
}

/**
 * Which Levelflow symbols each E8 account type can actually see.
 *
 * Derived from the registry's rows through `accountTypesOffering`, so the
 * report can never drift from the offering rule. A symbol appearing under two
 * account types is intentional and required: every crypto-classified market is
 * offered on Crypto AND Forex (amendment 19 clause 3), and amendment 24 judges
 * each account type separately, so each listing needs its own line.
 */
function symbolsByClassification(): Map<BrokerClassification, MasterListRow[]> {
  const map = new Map<BrokerClassification, MasterListRow[]>();
  for (const classification of CLASSIFICATIONS) {
    map.set(
      classification,
      // Keyed on which account types OFFER the row, not on the single
      // classification its evidence came from. Filtering by
      // `row.classification === classification` understated the offering: E8's
      // Forex accounts carry every crypto-classified market (amendment 19
      // clause 3), so all 33 crypto rows are dual-listed and this report showed
      // them under Crypto alone. BNBUSD is where that surfaced — the owner's
      // own order ticket priced it on the live Pro Forex account — but it was
      // never a fact about BNB.
      //
      // A dual-listed row appearing under both account types is the point, not
      // duplication: amendment 24 decides inclusion per account type, so the
      // same market can earn a place on one and an exclusion on the other, and
      // each needs its own line to be judged on.
      MASTER_LIST_ROWS.filter(
        (row) =>
          row.levelflowSymbol !== null &&
          accountTypesOffering(row.classification).includes(classification) &&
          // The Forex carve-out, or this table misreports the offering: a
          // Forex-line account carries only the eight crypto CFDs its own
          // screenshots ticket, not the Crypto account's thirty-three.
          // accountTypesOffering answers the coarse classification question and
          // cannot express "some of this classification" — the same limit that
          // made the blanket reading wrong in visibility.ts.
          (classification !== "forex" ||
            row.classification !== "crypto" ||
            FOREX_ACCOUNT_CRYPTO_CFDS.has(row.levelflowSymbol)) &&
          // Size variants are sized, never scanned, so they are not markets
          // this table should count or judge.
          !isContractSizeVariant(row.levelflowSymbol),
      ),
    );
  }
  return map;
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "—" : `${((part / whole) * 100).toFixed(0)}%`;
}

function num(arg: string, fallback: number): number {
  const index = process.argv.indexOf(arg);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main(): Promise<void> {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--") &&
    !/^[\d.]+$/.test(arg));
  if (files.length === 0) {
    console.error("usage: account-type-report.ts <emit.jsonl> [more.jsonl ...]");
    process.exit(1);
  }
  const rSd = num("--r-sd", 0.8);
  const minFilled = num("--min-filled", 300);

  /** symbol -> stats, accumulated once; account views are projections of it. */
  const bySymbol = new Map<string, Stats>();
  let gated = 0;
  let kept = 0;

  for (const file of files) {
    const stream = createInterface({
      crlfDelay: Number.POSITIVE_INFINITY,
      input: createReadStream(file),
    });
    for await (const line of stream) {
      if (!line) continue;
      let row: Row;
      try {
        row = JSON.parse(line) as Row;
      } catch {
        continue;
      }
      if (row.variant && row.variant !== "baseline") continue;
      if (!passesOtherGates(row)) {
        gated += 1;
        continue;
      }
      kept += 1;
      let stats = bySymbol.get(row.symbol);
      if (!stats) {
        stats = emptyStats();
        bySymbol.set(row.symbol, stats);
      }
      add(stats, row);
    }
  }

  console.log(`corpus: ${kept} rows clearing payoff+regime (${gated} gated out)`);
  console.log(`precision: 1 s.e. = ${rSd}/sqrt(filled); thin = under ${minFilled} filled\n`);

  const views = symbolsByClassification();
  const verdicts: string[] = [];

  for (const classification of CLASSIFICATIONS) {
    const rows = views.get(classification)!;
    console.log(`${"=".repeat(78)}`);
    console.log(`E8 ${classification.toUpperCase()} ACCOUNT — ${rows.length} visible markets`);
    console.log(`${"=".repeat(78)}`);

    // Market category = the engine's own asset type, which is what the
    // calibration keys off; the account classification is a separate axis.
    const byCategory = new Map<string, MasterListRow[]>();
    for (const row of rows) {
      const category = getAssetType(row.levelflowSymbol!);
      const list = byCategory.get(category) ?? [];
      list.push(row);
      byCategory.set(category, list);
    }

    for (const category of [...byCategory.keys()].sort()) {
      const members = byCategory.get(category)!;
      const rollup = emptyStats();
      const lines: string[] = [];
      let missing = 0;
      for (const member of members) {
        const stats = bySymbol.get(member.levelflowSymbol!);
        if (!stats) {
          missing += 1;
          lines.push(`      ${member.brokerName.padEnd(10)} — NOT IN CORPUS (never swept)`);
          continue;
        }
        rollup.n += stats.n;
        rollup.filled += stats.filled;
        rollup.wins += stats.wins;
        rollup.stops += stats.stops;
        rollup.rSum += stats.rSum;
        const value = expectancy(stats)!;
        const se = rSd / Math.sqrt(stats.filled);
        const sigma = Math.abs(value) / se;
        const thin = stats.filled < minFilled ? " THIN" : "";
        const flag = value < 0 && sigma >= 2
          ? " <- EXCLUDE (negative, 2+ s.e.)"
          : value < 0
            ? " <- negative but within noise"
            : "";
        lines.push(
          `      ${member.brokerName.padEnd(10)} ${String(stats.filled).padStart(6)} ` +
            `${pct(stats.wins, stats.filled).padStart(4)} ${pct(stats.stops, stats.filled).padStart(5)} ` +
            `${value.toFixed(3).padStart(7)} ±${se.toFixed(3)}${thin}${flag}`,
        );
        if (value < 0 && sigma >= 2) {
          verdicts.push(
            `${classification}/${member.brokerName}: E=${value.toFixed(3)} ` +
              `±${se.toFixed(3)} over ${stats.filled} filled — exclude`,
          );
        }
      }
      const rollupValue = expectancy(rollup);
      console.log(
        `\n  ${category}  (${members.length} markets, ${rollup.filled} filled, ` +
          `E=${rollupValue === null ? "—" : rollupValue.toFixed(3)})`,
      );
      console.log(
        `      ${"market".padEnd(10)} ${"filled".padStart(6)} ${"win".padStart(4)} ` +
          `${"stop".padStart(5)} ${"E".padStart(7)}`,
      );
      for (const line of lines) console.log(line);
      if (missing > 0) {
        console.log(`      (${missing} market(s) absent from the corpus — coverage gap)`);
      }
    }
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`EXCLUSION CANDIDATES (negative expectancy at 2+ s.e.)`);
  console.log(`${"=".repeat(78)}`);
  if (verdicts.length === 0) {
    console.log("  none — no market is negative beyond noise");
  } else {
    for (const verdict of verdicts) console.log(`  ${verdict}`);
  }
}

await main();
