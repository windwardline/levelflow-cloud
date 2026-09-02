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
 * got asserted. The SE alone is NOT that guard at tiny n (#364 round 34,
 * finding 3): its only intrinsic floor is rStdDev's two filled outcomes,
 * and at n=3 a low-dispersion losing streak yields sigma in the double
 * digits precisely because the sample never saw the tails — so the
 * EXCLUDE verdict is additionally withheld below --min-filled (the row
 * still prints, THIN still labels it, the flag names the withhold), which
 * makes true the behaviour #364 rounds 32–33 recorded for this floor when
 * they built starvation-audit's --min-reached on it — and the category
 * rollup's SE is clustered by market,
 * because outcomes inside one market share regime, session and
 * calibration. Corpora enter through assertManifestedCorpusStreaming
 * (2i): an emit that cannot prove its conditions is refused, not
 * averaged — and streamed, because a full corpus runs to hundreds of MB
 * and R1b grows it further (#364 round 26, finding 1). The confirm fold
 * is sealed at that door (R4 act 1): its rows are withheld before this
 * report sees them, the count is printed beside the holdout line, and
 * every figure here is over the tuning folds only.
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
  tuningFolds,
} from "./sweepStats.ts";
import {
  describeNumericToken,
  assertInDomain,
  soleFlagIndex,
  tokenFault,
  type NumericDomain,
} from "./flagReader.ts";

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

/**
 * The acceptance gates, re-applied at READ time by the CURRENT calibration.
 *
 * THE CONFIDENCE GATE WAS MISSING, and `confidenceScore` sat on the `Row` type
 * unread — declared for this and never used. On a gated corpus the omission is
 * invisible, because the sweep already dropped every below-threshold decision
 * before the emit. On a `--capture-all` corpus those rows are present and
 * flagged, and without this line every one of them entered `bySymbol` and drove
 * per-market expectancy, the clustered category rollup and the amendment-24
 * EXCLUDE verdicts. Below-threshold setups are the weakest by construction, so
 * the bias had a known direction: toward excluding markets.
 *
 * Judged by the current calibration rather than by the row's `accepted` flag,
 * deliberately and for the reason the call site already states — a threshold
 * that moved between the sweep and this read must bind here. The flag records
 * what the sweep decided; this asks what the engine would decide today.
 */
function passesOtherGates(row: Row): boolean {
  const calibration = getCategoryCalibration(row.symbol);
  if (row.confidenceScore < calibration.confidenceThreshold) return false;
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

// The ONE declaration of which flags own the token after them — the form
// #364 round 33 installed in starvation-audit, ridden along here by round
// 34 (the bare-number pattern-match that stood here was positional-blind:
// "--min-filled 1e2" parsed as 100 while handing "1e2" to the streaming
// door as a corpus path). The walker in main() consumes it to keep values
// out of the file list, and num() refuses a flag outside it, so a future
// dial forgotten here fails every run at first read instead of shipping.
const VALUE_FLAGS = new Set(["--min-filled"]);

function num(
  arg: string,
  fallback: number,
  domain?: NumericDomain,
): number {
  if (!VALUE_FLAGS.has(arg)) {
    throw new Error(
      `num("${arg}") reads a value the path walker does not know owns ` +
        `the next token — add it to VALUE_FLAGS, or its value becomes a ` +
        `corpus path`,
    );
  }
  const index = soleFlagIndex(process.argv, arg);
  if (index === -1) {
    // The DEFAULT is checked too — a default outside its own
    // dial's domain is a defect no operator would ever see.
    if (domain !== undefined) assertInDomain(arg, fallback, domain);
    return fallback;
  }
  const token = process.argv[index + 1];
  const parsed = Number(token);
  const fault = tokenFault(token);
  // A flag that OWNS a token must refuse one it cannot parse (#364
  // round 35, finding 1): the walker in main() has already kept that
  // token out of the file list, so falling back here would silently
  // use the default floor AND silently drop a corpus file —
  // "--min-filled a.jsonl b.jsonl" reported over b.jsonl alone at the
  // default 300. A missing value is a refusal, never a zero.
  if (fault !== null || !Number.isFinite(parsed)) {
    throw new Error(
      `${arg} owns the token after it and cannot read ${
        describeNumericToken(token)
      } as a number — the walker already kept that token out of the ` +
        `corpus paths, so falling back would report over a partial ` +
        `corpus; pass ${arg} <number>`,
    );
  }
  if (domain !== undefined) assertInDomain(arg, parsed, domain);
  return parsed;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const files: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      if (VALUE_FLAGS.has(argv[i])) i += 1;
      continue;
    }
    files.push(argv[i]);
  }
  // Flags are read BEFORE the empty-file-list check (#364 round 35,
  // finding 1): "--min-filled <emit.jsonl>" eats the corpus path as the
  // flag's value, and the specific refusal — naming the flag and the
  // eaten token — must win over the generic usage error it causes.
  const minFilled = num("--min-filled", 300, {
    basis:
      "the EXCLUDE verdict is withheld below this many filled outcomes, and a floor of zero is not 'no floor' — it silently readmits " +
      "the thin cells the floor exists to withhold",
    integer: true,
    min: 1,
  });
  if (files.length === 0) {
    console.error("usage: account-type-report.ts <emit.jsonl> [more.jsonl ...]");
    process.exit(1);
  }

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
  const gatedRowsBySymbol = new Map<string, number>();
  // What the door withheld, summed over every file, and the folds it did
  // hand over by each corpus's own vocabulary — a set, because nothing
  // above refuses a legacy shard pooled with a folded one.
  let sealedRows = 0;
  const foldsRead = new Set<string>();

  for (const file of files) {
    // Streamed through the manifest door (#364 round 26, finding 1): the
    // non-streaming read held every parsed row of the file at once — the
    // exact shape both sibling readers refuse, and R1b grows every emit
    // by the no-bars decisions that previously emitted nothing, in bulk
    // for the sparse floorless classes this report judges. This reader
    // accumulates per symbol in one pass, so it needs no rows array at
    // all; the hash verifies before the first row, same door as ever.
    const manifest = await assertManifestedCorpusStreaming(file, (raw) => {
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
        // Per symbol too (#364 round 30, finding 2): a market EVERY one
        // of whose rows fails these gates never enters bySymbol, and
        // without this map it printed "NOT IN CORPUS (never swept)" in
        // the coverage-gap tally — false on both halves, and reachable
        // whenever a threshold moves between the sweep and the read
        // (passesOtherGates judges by the CURRENT calibration).
        gatedRowsBySymbol.set(
          row.symbol,
          (gatedRowsBySymbol.get(row.symbol) ?? 0) + 1,
        );
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
    sealedRows += manifest.sealedRows;
    const folds = tuningFolds(manifest);
    foldsRead.add(`${folds.fit}+${folds.select}`);
  }
  const foldsLabel = `${[...foldsRead].join(", ")} folds`;

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
        ` — baseline variant, ${foldsLabel}, rows clearing payoff+regime; ` +
        `holdout excluded by the emit's stamped flag)`,
    );
  }
  if (holdoutRows > 0) {
    console.log(
      `(holdout markets excluded: ${holdoutRows} rows — baseline variant, ` +
        `stamped flag)`,
    );
  }
  // Stated whether or not anything was withheld: zero on a legacy corpus
  // means there was no confirm fold to seal, which is not an unsealed read.
  console.log(
    `(confirm fold sealed at the door: ${sealedRows} rows withheld — every ` +
      `figure reads the ${foldsLabel} only)`,
  );
  console.log(
    `precision: per-market s.e. measured from that market's own R deviation ` +
      `ASSUMING within-market independence — outcomes in one market share ` +
      `regime, session and calibration, so that s.e. is understated and ` +
      `its sigma an UPPER bound on confidence (day-clustering it is R2 ` +
      `instrument work, recorded in HANDOFF); rollup s.e. clustered by ` +
      `market (its sample is the category's ` +
      `FILLED markets, printed per rollup line); thin = under ` +
      `${minFilled} filled — one floor applied at BOTH grains, so a ` +
      `category can clear it on pooled outcomes while every member ` +
      `is thin\n`,
  );

  const views = symbolsByClassification();
  const verdicts: string[] = [];
  // The withheld share travels to the decision block too (#364 round
  // 35, finding 2): a per-row suffix in a category table far above the
  // EXCLUSION CANDIDATES block is not where a ruling is read from.
  const withheldVerdicts: string[] = [];

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
      let allGated = 0;
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
          // Fully gated is the reader's own doing, never a coverage gap
          // (#364 round 30, finding 2): the market was swept, and every
          // row fell to payoff+regime under the CURRENT calibration —
          // which may postdate the sweep.
          const gatedRows = gatedRowsBySymbol.get(member.levelflowSymbol!) ?? 0;
          if (gatedRows > 0) {
            allGated += 1;
            lines.push(
              `      ${member.brokerName.padEnd(10)} — ALL ROWS GATED ` +
                `(${gatedRows} rows below payoff or in blocked regimes, ` +
                `current calibration)`,
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
        // STATED (#364 round 38, finding 3): this form assumes
        // within-market independence, the exact overconfidence
        // clusteredStandardError's docstring rejects at the rollup —
        // outcomes in one market share regime, session and calibration
        // — so this s.e. is understated and the sigma>=2 exclusion
        // test fires MORE readily than the data supports. --min-filled
        // bounds the sample size, not the correlation; day-clustering
        // this s.e. (the way grid-totalr blocks by day) is R2
        // instrument work, recorded in HANDOFF beside this file's
        // other instrument items.
        const se = rStandardError(stats);
        const sigma = value !== null && se !== null && se > 0
          ? Math.abs(value) / se
          : null;
        const thin = stats.filled < minFilled ? " THIN" : "";
        // #364 round 34, finding 3: the sigma>=2 test's only intrinsic
        // floor is rStdDev's TWO filled outcomes — at n=3 a
        // low-dispersion losing streak clears it with sigma in the
        // double digits precisely because the sample never saw the
        // distribution's tails, the thin-sample-read-as-a-finding
        // hazard this file exists to stop. Below --min-filled the
        // EXCLUDE verdict is therefore WITHHELD, the round-25 shape:
        // the row prints, THIN labels it, the flag names the withhold,
        // and nothing joins the EXCLUSION CANDIDATES block the E8
        // decisions read. (Rounds 32–33 built starvation-audit's
        // --min-reached withhold on the recorded understanding that
        // this floor already behaved this way; as of this round it
        // does.) An untrustworthy sigma is untrustworthy in BOTH
        // directions (#364 round 35, smaller): "negative but within
        // noise" — the label an operator reads as "this market is
        // fine" — is reserved for sigma < 2 AT the floor; a thin
        // negative market below it gets no verdict either way, never
        // the reassuring half of a test the sample cannot support.
        const excludeEligible = value !== null && value < 0 &&
          sigma !== null && sigma >= 2;
        const flag = excludeEligible
          ? (stats.filled >= minFilled
            ? " <- EXCLUDE (negative, 2+ s.e.)"
            : " <- exclude withheld (thin sample below --min-filled)")
          : value !== null && value < 0
            ? (stats.filled >= minFilled
              ? " <- negative but within noise"
              : " <- negative on a thin sample — no verdict either way")
            : "";
        lines.push(
          `      ${member.brokerName.padEnd(10)} ${String(stats.filled).padStart(6)} ` +
            `${pct(stats.wins, stats.filled).padStart(4)} ${pct(stats.stops, stats.filled).padStart(5)} ` +
            `${String(stats.dataAbsent).padStart(8)} ` +
            `${(value === null ? "—" : value.toFixed(3)).padStart(7)} ` +
            `±${se === null ? "—" : se.toFixed(3)}${thin}${flag}`,
        );
        if (excludeEligible) {
          if (stats.filled >= minFilled) {
            verdicts.push(
              `${classification}/${member.brokerName}: E=${value!.toFixed(3)} ` +
                `±${se!.toFixed(3)} over ${stats.filled} filled — exclude`,
            );
          } else {
            withheldVerdicts.push(
              `${classification}/${member.brokerName}: E=${value!.toFixed(3)} ` +
                `±${se!.toFixed(3)} over ${stats.filled} filled ` +
                `(< ${minFilled}) — withheld`,
            );
          }
        }
      }
      const rollupValue = expectancy(rollup);
      const rollupSe = clusteredStandardError(memberStats);
      // dataAbs beside filled at both grains (#364 round 24, finding 3):
      // a category heavy in provider absence must be distinguishable
      // from one whose markets never traded — those are the sparse
      // futures/agriculture markets an E8 inclusion decision turns on.
      // #364 round 36, finding 2: the rollup is amendment 24's own
      // decision grain — the report cuts inclusion/exclusion per
      // account type BY CATEGORY — so the floor that marks and
      // withholds per market marks the category line too, and a
      // missing clustered s.e. is STATED (fewer than two filled
      // markets; energies has a single sweepable member, so the shape
      // is structural, not hypothetical) rather than silently
      // omitted. Without both, a bounded pilot printed an unqualified
      // category expectancy above market rows every one of which was
      // stamped THIN. The clustered s.e. also states its OWN sample
      // (#364 round 37, finding 3): the leading markets count is
      // roster membership, while held-out, all-gated, absent and
      // all-marked markets never reach the estimator — k, not the
      // outcome count, bounds the estimate (one degree of freedom at
      // k=2), so k prints beside the term instead of leaving the
      // reader to guess it from a roster figure.
      const filledClusterCount =
        memberStats.filter((s) => s.filled > 0).length;
      console.log(
        `\n  ${category}  (${members.length} markets, ${rollup.filled} filled, ` +
          `${rollup.dataAbsent} dataAbs, ` +
          `E=${rollupValue === null ? "—" : rollupValue.toFixed(3)}` +
          `${
            rollupSe !== null
              ? ` ±${rollupSe.toFixed(3)} clustered over ` +
                `${filledClusterCount} filled markets`
              : rollupValue !== null
              ? " ±— (fewer than two filled markets — no clustered s.e.)"
              : ""
          }` +
          `${
            rollupValue !== null && rollup.filled < minFilled
              ? ` THIN (${rollup.filled} < ${minFilled} filled)`
              : ""
          })`,
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
      if (allGated > 0) {
        console.log(
          `      (${allGated} market(s) fully gated by payoff+regime under ` +
            `the CURRENT calibration — swept, not a coverage gap; the ` +
            `thresholds may postdate the sweep)`,
        );
      }
    }
  }

  console.log(`\n${"=".repeat(78)}`);
  // The block states its OWN terms (#364 round 35, finding 2): since
  // round 34 the rule is negative at 2+ s.e. AND at least --min-filled
  // filled, and with the default floor at 300 a bounded or early
  // corpus withholds every negative market — so the unqualified "none
  // — no market is negative beyond noise" that stood here was false
  // exactly on the pilot corpora this report exists for. The withheld
  // share prints here, beside the verdicts a ruling is read from.
  console.log(
    `EXCLUSION CANDIDATES (negative expectancy at 2+ s.e. over at ` +
      `least ${minFilled} filled — --min-filled)`,
  );
  console.log(`${"=".repeat(78)}`);
  if (verdicts.length === 0) {
    console.log(
      `  none — no market is negative at 2+ s.e. with ${minFilled}+ filled`,
    );
  } else {
    for (const verdict of verdicts) console.log(`  ${verdict}`);
  }
  if (withheldVerdicts.length > 0) {
    console.log(
      `  withheld below --min-filled (${withheldVerdicts.length} negative ` +
        `at 2+ s.e. on thin samples — no verdict either way):`,
    );
    for (const line of withheldVerdicts) console.log(`    ${line}`);
  }
}

await main();
