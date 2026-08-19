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
 * Metrics come from scripts/sweepStats.ts — the engine's vocabulary, once
 * (3a): filled = outcome is not "unfilled"; a win is take_profit OR
 * tp1_partial; expectancy is mean realizedR over FILLED setups. Standard
 * errors are MEASURED from the corpus (rSumSq travels with every cell),
 * never assumed from a flag: per-market SE is that market's own sample
 * deviation over sqrt(filled) — the guard that stops a thin sample being
 * read as a finding, which is exactly how the six-index blanket exclusion
 * got asserted — and the category rollup's SE is clustered by market,
 * because outcomes inside one market share regime, session and
 * calibration. Corpora enter through assertManifestedCorpusStreaming
 * (2i): an emit that cannot prove its conditions is refused, not
 * averaged — and streamed, because a full corpus runs to hundreds of MB
 * and R1b grows it further (#364 round 26, finding 1).
 *
 *   npx tsx scripts/account-type-report.ts <emit.jsonl> [more.jsonl ...]
 *     [--min-filled 300]
 */
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
import {
  addOutcome,
  assertManifestedCorpusStreaming,
  clusteredStandardError,
  emptyStats,
  expectancy,
  rStandardError,
  type SweepEmitRow,
  type SweepStats,
} from "./sweepStats.ts";

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
  const minFilled = num("--min-filled", 300);

  /** symbol -> stats, accumulated once; account views are projections of it. */
  const bySymbol = new Map<string, SweepStats>();
  let gated = 0;
  let kept = 0;
  // #364 round 27, finding 2: a held-out market WAS swept — dropping it
  // silently at the door left the member loop labelling it "NOT IN
  // CORPUS (never swept)" and counting it as a coverage gap, for ~1 in
  // 5 of the roster, in the report E8 inclusion decisions read.
  let holdoutRows = 0;
  const holdoutSymbols = new Set<string>();

  for (const file of files) {
    // Streamed through the manifest door (#364 round 26, finding 1): the
    // non-streaming read held every parsed row of the file at once — the
    // exact shape both sibling readers refuse, and R1b grows every emit
    // by the no-bars decisions that previously emitted nothing, in bulk
    // for the sparse floorless classes this report judges. This reader
    // accumulates per symbol in one pass, so it needs no rows array at
    // all; the hash verifies before the first row, same door as ever.
    await assertManifestedCorpusStreaming(file, (raw) => {
      const row = raw as unknown as Row;
      // Baseline-only, like every other figure this report prints — the
      // variant filter runs FIRST (#364 round 29, finding 2: the holdout
      // tally sat above it, so a grid corpus counted every variant's
      // holdout rows while kept/gated/dataAbsent stayed baseline-only —
      // two populations under one heading).
      if (row.variant && row.variant !== "baseline") return;
      // 3e: holdout markets are excluded from every tuning-adjacent read;
      // this report informs inclusion decisions, so it is one of them.
      // Counted, never silent (#364 round 27, finding 2).
      if (raw.holdout === true) {
        holdoutRows += 1;
        holdoutSymbols.add(row.symbol);
        return;
      }
      if (!passesOtherGates(row)) {
        gated += 1;
        return;
      }
      kept += 1;
      let stats = bySymbol.get(row.symbol);
      if (!stats) {
        stats = emptyStats();
        bySymbol.set(row.symbol, stats);
      }
      // The raw row rides through so the data-absence marker (and any
      // future per-row fact) reaches the vocabulary's partition (#364
      // round 5, finding 1); only realizedR is coerced.
      addOutcome(stats, {
        ...raw,
        realizedR: typeof row.realizedR === "number" ? row.realizedR : Number.NaN,
      } as SweepEmitRow);
    });
  }

  // The headline states its own denominator (#364 round 24, finding 3,
  // following sweep-analysis's round-7 pattern): kept counts every row
  // handed to the vocabulary, whose partition holds data-absence rows
  // OUT of n — so the number a ruling is quoted from subtracts them,
  // with the held-out volume on its own line.
  let dataAbsentTotal = 0;
  for (const stats of bySymbol.values()) dataAbsentTotal += stats.dataAbsent;
  console.log(
    `corpus: ${kept - dataAbsentTotal} market-evidence rows clearing ` +
      `payoff+regime (${gated} gated out)`,
  );
  // Each reader's held-out line names its OWN population (#364 round 26,
  // finding 2): the three readers' scopes differ, and one sentence over
  // three denominators is the unstated-denominator class itself.
  if (dataAbsentTotal > 0) {
    console.log(
      `(data-absence rows held out of every denominator: ${dataAbsentTotal}` +
        ` — baseline variant, all splits, rows clearing payoff+regime; ` +
        `holdout excluded by the emit's stamped flag)`,
    );
  }
  if (holdoutRows > 0) {
    console.log(
      `(holdout markets excluded: ${holdoutRows} rows — baseline variant, ` +
        `stamped flag)`,
    );
  }
  console.log(
    `precision: per-market s.e. measured from that market's own R deviation; ` +
      `rollup s.e. clustered by market; thin = under ${minFilled} filled\n`,
  );

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
      const memberStats: SweepStats[] = [];
      const lines: string[] = [];
      let missing = 0;
      let heldOut = 0;
      for (const member of members) {
        const stats = bySymbol.get(member.levelflowSymbol!);
        if (!stats) {
          // Held-out is policy, not a gap (#364 round 27, finding 2):
          // the market was swept and its rows are reserved for the 3e
          // confirmation read — the coverage-gap tally must not count
          // it, or a fifth of the roster reads as "never swept".
          if (holdoutSymbols.has(member.levelflowSymbol!)) {
            heldOut += 1;
            lines.push(
              `      ${member.brokerName.padEnd(10)} — HELD OUT (3e confirmation set)`,
            );
            continue;
          }
          missing += 1;
          lines.push(`      ${member.brokerName.padEnd(10)} — NOT IN CORPUS (never swept)`);
          continue;
        }
        memberStats.push(stats);
        rollup.ambiguous += stats.ambiguous;
        rollup.dataAbsent += stats.dataAbsent;
        rollup.n += stats.n;
        rollup.filled += stats.filled;
        rollup.wins += stats.wins;
        rollup.stops += stats.stops;
        rollup.rSum += stats.rSum;
        rollup.rSumSq += stats.rSumSq;
        // #364 round 25, finding 1: a market whose corpus rows are ALL
        // data-absence rows sits here with filled 0 — R1b emits those
        // rows (pre-R1b they landed in planRejected and the market hit
        // NOT IN CORPUS), and all-marked is the EXPECTED shape for the
        // sparse floorless classes this report's inclusion decisions
        // turn on. expectancy() is null there: no sigma claim and no
        // verdict can be made, so the line prints E "—" with its
        // dataAbs volume still visible — the non-null assertion that
        // stood here crashed the whole report on exactly that market.
        const value = expectancy(stats);
        // Measured, never assumed (3a): this market's own R deviation over
        // sqrt(filled). Below two filled outcomes no deviation exists, so no
        // sigma claim — and therefore no exclusion — can be made from it.
        const se = rStandardError(stats);
        const sigma = value !== null && se !== null && se > 0
          ? Math.abs(value) / se
          : null;
        const thin = stats.filled < minFilled ? " THIN" : "";
        const flag = value !== null && value < 0 && sigma !== null && sigma >= 2
          ? " <- EXCLUDE (negative, 2+ s.e.)"
          : value !== null && value < 0
            ? " <- negative but within noise"
            : "";
        lines.push(
          `      ${member.brokerName.padEnd(10)} ${String(stats.filled).padStart(6)} ` +
            `${pct(stats.wins, stats.filled).padStart(4)} ${pct(stats.stops, stats.filled).padStart(5)} ` +
            `${String(stats.dataAbsent).padStart(8)} ` +
            `${(value === null ? "—" : value.toFixed(3)).padStart(7)} ` +
            `±${se === null ? "—" : se.toFixed(3)}${thin}${flag}`,
        );
        if (value !== null && value < 0 && sigma !== null && sigma >= 2) {
          verdicts.push(
            `${classification}/${member.brokerName}: E=${value.toFixed(3)} ` +
              `±${se!.toFixed(3)} over ${stats.filled} filled — exclude`,
          );
        }
      }
      const rollupValue = expectancy(rollup);
      const rollupSe = clusteredStandardError(memberStats);
      // dataAbs beside filled at both grains (#364 round 24, finding 3):
      // a category heavy in provider absence must be distinguishable
      // from one whose markets never traded — those are the sparse
      // futures/agriculture markets an E8 inclusion decision turns on.
      console.log(
        `\n  ${category}  (${members.length} markets, ${rollup.filled} filled, ` +
          `${rollup.dataAbsent} dataAbs, ` +
          `E=${rollupValue === null ? "—" : rollupValue.toFixed(3)}` +
          `${rollupSe === null ? "" : ` ±${rollupSe.toFixed(3)} clustered`})`,
      );
      console.log(
        `      ${"market".padEnd(10)} ${"filled".padStart(6)} ${"win".padStart(4)} ` +
          `${"stop".padStart(5)} ${"dataAbs".padStart(8)} ${"E".padStart(7)}`,
      );
      for (const line of lines) console.log(line);
      if (missing > 0) {
        console.log(`      (${missing} market(s) absent from the corpus — coverage gap)`);
      }
      if (heldOut > 0) {
        console.log(
          `      (${heldOut} market(s) held out — 3e confirmation set, ` +
            `swept but excluded from every tuning read)`,
        );
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
