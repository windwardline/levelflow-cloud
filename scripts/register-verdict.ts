// The engine-declined register, re-decided on the ledgered read (R4 act 3).
//
// The register in `calibration.ts` was generated from `4d-cost-sensitivity.json`
// — the corpus the 2026-08-11 clock defect invalidated. Its own header said the
// entries stood "on the conservative reading only… re-decided — kept or
// restored — the moment a valid corpus exists". R3's re-swept corpus is that
// corpus and R4 act 3's ledgered confirm read is its verdict on held-back data,
// so this reader re-derives the whole register from that ONE artifact rather
// than editing a curated list.
//
// It reads nothing else. No corpus is opened, no fold is cut, no figure is
// recomputed: every number below is the read's own, taken through
// `readLedgeredArtifact` — the one door, which refuses a condemned, foreign,
// tampered or re-ruled artifact.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { flagReader } from "./flagReader.ts";
import {
  type LedgeredReadArtifact,
  readLedgeredArtifact,
} from "./ledgeredRead.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";

/**
 * PRE-REGISTERED, and hashed into the artifact so a later run cannot quietly
 * decide under a different one.
 *
 * The gross clause is amendment 36 in force: "if it measures negative because
 * of a number WE chose — a window, a cap, a modeled spread, a sampled cost —
 * then the parameter is the defect and the market is not." The gross column is
 * the same decision re-resolved at the venue's published bill alone, so a
 * market whose gross interval still touches zero has not been shown to lose on
 * anything but our own cost model.
 *
 * The net clause is amendment 39: net realized R is the money the account
 * keeps, and it is what the operator trades.
 *
 * The fill floor is amendment 25's market unit. An interval already prices its
 * own n, but a market judged on a handful of fills is a starved verdict, and a
 * starved verdict is a verdict about the configuration.
 */
export const WITHDRAWAL_RULE =
  "TWO TESTS, both applied to every market, entering or staying. (1) THE CONFIRMATION-FOLD TEST: the " +
  "read's shipped-cell m3 is confirmed-negative on at least 30 filled outcomes and BOTH the net and the " +
  "gross 95% upper bounds are below zero. The fold was sealed from this program's tuning, but the shipped " +
  "cells were DERIVED over dates inside it — the read records heldBack false for every market — so the " +
  "figure is admissible only because it is NEGATIVE: a cell selected on the rows it is then judged on is " +
  "biased toward the positive, and the contradiction is the direction that survives that bias " +
  "(ADMISSIBILITY_RULE). Net is the money (amendment 39); gross is amendment 36's cost leg — a negative " +
  "that rests on a cost we model is a defect in the parameter, not in the market. (2) THE REMOVAL TEST, " +
  "amendment 36's window and cap legs, which say 'before ANY withdrawal' and so bind a standing decline " +
  "exactly as they bind a new one: over the removal arms alone (the cap arms and the window arms, never " +
  "an arm that ADDS an admission filter), a cell carrying at least 30 filled outcomes and at least half " +
  "the shipped cell's select fills RETIRES the withdrawal when its select net upper bound is at or above " +
  "zero AND its net point estimate is no worse than the shipped cell's. Retirement is a MONEY test: a " +
  "gross bound crossing zero while the money in that same cell stays negative is not a market that " +
  "stopped losing (amendment 39). A market with no qualifying removal cell is recorded as NEVER " +
  "REMOVAL-TESTED, and its reason says so rather than implying a test that did not run. ENTERING " +
  "additionally requires the read's own pre-registered nomination: the shipped cell was a decline " +
  "candidate under DECLINE_RULE on the select fold. A market that fails either test while declined is " +
  "RESTORED, and so is one the read cannot judge at all: a decline may not stand on evidence this " +
  "program has invalidated. A market that passes both tests without a nomination is neither declined nor " +
  "cleared — it is named for the next act.";

export const WITHDRAWAL_RULE_HASH = createHash("sha256").update(WITHDRAWAL_RULE).digest("hex");

export const WITHDRAWAL_MIN_FILLED = 30;

/**
 * A cell must carry at least half the shipped cell's select fills before it may
 * retire a withdrawal, which is the freeze's own RETIREMENT_MIN_FILL_SHARE. A
 * variant that keeps a quarter of the volume and reports a wider interval has
 * not shown the market is fine; it has shown a smaller sample.
 */
export const WITHDRAWAL_MIN_FILL_SHARE = 0.5;

/**
 * THE REMOVAL ARMS, and only these. Amendment 36 asks whether REMOVING a number
 * we chose — "a window, a cap, a modeled spread, a sampled cost" — restores the
 * market. The stop-cap and review-window arms remove one. The admission arm
 * (payoff floor, cost-share cap) ADDS a filter that discards the losing subset,
 * which is a different question and, read as a rescue, is the shape amendment
 * 39's manufacturing clause exists to catch. The class-default arm swaps the
 * whole per-symbol layer rather than removing one choice.
 */
export const REMOVAL_ARMS = ["review-window", "review-window-96", "stop-cap", "stop-cap-8"] as const;

/**
 * WHY 30 AND NOT 300. Amendment 25's mechanised floor for a performance
 * EXCLUSION is 300 filled outcomes (MIN_FILLED_FOR_PERFORMANCE_EXCLUSION). This
 * register is a weaker action than an exclusion: the market stays in the
 * offering, stays scannable and stays in every coverage count, and the engine
 * declines to build a setup with the reason on screen and a reprobe beside it.
 * A floor of 30 is the market unit's own, and it is stated here rather than
 * inherited silently — two entries sit between the two floors, ATOMUSD (n=95)
 * and ASX (n=142), and a reader is owed that fact where the number lives.
 */
export const WITHDRAWAL_FLOOR_NOTE =
  "30 is the market unit's floor, not amendment 25's 300-fill exclusion floor: a declined market stays " +
  "visible, scannable and re-probed, which is a weaker action than an exclusion. ATOMUSD (95) and ASX (142) " +
  "sit between the two floors.";

export type RemovalCell = {
  arm: string;
  grossUpper: number | null;
  netExpectancy: number;
  netUpper: number;
  filled: number;
  variant: string;
};

export type RemovalOutcome = {
  cellsTested: number;
  retiringCells: RemovalCell[];
  tested: boolean;
};

type GradedMarket = {
  shipped?: { select?: { net?: { expectancy: number; n: number } | null } | null };
  variants?: Record<string, {
    select?: {
      gross?: { upper: number } | null;
      net?: { expectancy: number; n: number; upper: number } | null;
    } | null;
  }>;
};

/**
 * Amendment 36's window and cap legs, run over one market. Returns what was
 * tested as well as what retired, because "no retiring cell" and "no cell to
 * test" are different answers and only one of them is a passed test.
 */
export function removalOutcomeOf(
  symbol: string,
  gradings: Array<{ arm: string; markets: Record<string, GradedMarket> }>,
): RemovalOutcome {
  let shippedSelect: { expectancy: number; n: number } | null = null;
  for (const grading of gradings) {
    const found = grading.markets[symbol]?.shipped?.select?.net;
    if (found) { shippedSelect = found; break; }
  }
  if (shippedSelect === null) return { cellsTested: 0, retiringCells: [], tested: false };
  const floor = Math.max(WITHDRAWAL_MIN_FILLED, WITHDRAWAL_MIN_FILL_SHARE * shippedSelect.n);
  let cellsTested = 0;
  const retiringCells: RemovalCell[] = [];
  for (const grading of gradings) {
    const market = grading.markets[symbol];
    if (!market) continue;
    for (const [variant, cell] of Object.entries(market.variants ?? {})) {
      const net = cell.select?.net;
      if (!net || net.n < floor) continue;
      cellsTested += 1;
      // THE MONEY CLAUSE. A bound crossing zero while the money in that same
      // cell stays worse than the shipped cell's is not a market that stopped
      // losing — it is a wider interval. Both halves must hold.
      if (net.upper >= 0 && net.expectancy >= shippedSelect.expectancy) {
        retiringCells.push({
          arm: grading.arm,
          filled: net.n,
          grossUpper: cell.select?.gross?.upper ?? null,
          netExpectancy: net.expectancy,
          netUpper: net.upper,
          variant,
        });
      }
    }
  }
  return { cellsTested, retiringCells, tested: cellsTested > 0 };
}

/** The removal arms' gradings, read from the directory that holds them. */
export function readRemovalGradings(dir: string): Array<{ arm: string; markets: Record<string, GradedMarket> }> {
  const gradings: Array<{ arm: string; markets: Record<string, GradedMarket> }> = [];
  for (const arm of REMOVAL_ARMS) {
    const path = `${dir}/${arm}-grading.json`;
    let parsed: { markets?: Record<string, GradedMarket> };
    try {
      parsed = JSON.parse(readFileSync(path, "utf8")) as { markets?: Record<string, GradedMarket> };
    } catch (error) {
      throw new Error(
        `${path}: the removal arm's grading could not be read (${(error as Error).message}) — refusing rather ` +
          `than running amendment 36's removal test over fewer arms than it names`,
      );
    }
    if (!parsed.markets || Object.keys(parsed.markets).length === 0) {
      throw new Error(`${path}: carries no graded markets, so the removal test would examine nothing`);
    }
    gradings.push({ arm, markets: parsed.markets });
  }
  return gradings;
}

export type MarketVerdict = {
  disposition: "declined" | "restored" | "stays" | "retired" | "unnominated" | "cleared" | "unjudged";
  /** Amendment 36's window and cap legs for this market: what was tested, and what retired. */
  removal?: RemovalOutcome;
  /** What the FREEZE's bound-crossing rule said, carried as provenance — it decides nothing here. */
  frozenRetirement?: { retired: boolean } | null;
  grossExpectancy: number | null;
  grossUpper: number | null;
  m3: string;
  measuredExpectancyR: number | null;
  netUpper: number | null;
  filled: number | null;
  reason: string;
  symbol: string;
};

type ShippedConfirm = {
  expectancy: number;
  lower: number;
  n: number;
  upper: number;
} | null;

/**
 * The read's per-market figures, judged one market at a time under the rule
 * above. `declined` is the population the register must equal; the caller
 * passes the register as it stands so an existing entry is re-tested rather
 * than re-nominated.
 */
export function withdrawalVerdicts(
  artifact: LedgeredReadArtifact,
  alreadyDeclined: ReadonlySet<string>,
  removalGradings: Array<{ arm: string; markets: Record<string, GradedMarket> }> = [],
): MarketVerdict[] {
  const markets = artifact.markets as unknown as Record<string, {
    retirement?: { retired?: boolean } | null;
    shipped: {
      confirm?: { gross: ShippedConfirm; net: ShippedConfirm };
      declineCandidate?: boolean;
      m3: string;
    };
  }>;
  const verdicts: MarketVerdict[] = [];
  // A READ CARRYING NO RETIREMENT RECORDS CANNOT BE JUDGED HERE. The nomination
  // clause turns on `retirement.retired`, so a read without them would silently
  // nominate every candidate — the ones an accepted variant rescued included.
  if (!Object.values(markets).some((market) => market.retirement !== null && market.retirement !== undefined)) {
    throw new Error(
      "this read carries no retirement records, so the nomination clause cannot tell a rescued candidate from a " +
        "standing one — refusing rather than declining markets the retirement rule keeps",
    );
  }
  for (const symbol of Object.keys(markets).sort()) {
    const shipped = markets[symbol].shipped;
    const net = shipped.confirm?.net ?? null;
    const gross = shipped.confirm?.gross ?? null;
    const m3 = shipped.m3;
    if (m3 !== "confirmed-negative" || net === null || gross === null) {
      // A STANDING DECLINE THE READ CANNOT JUDGE IS RESTORED, not quietly
      // carried: its evidence is the 4d corpus this program invalidated, and
      // an unjudgeable entry left in the register is a withdrawal resting on
      // nothing. Dropping it from the output without saying so was the first
      // version's defect.
      const standingUnjudged = alreadyDeclined.has(symbol);
      verdicts.push({
        disposition: standingUnjudged ? "restored" : "unjudged",
        filled: net?.n ?? null,
        grossExpectancy: gross?.expectancy ?? null,
        grossUpper: gross?.upper ?? null,
        m3,
        measuredExpectancyR: net?.expectancy ?? null,
        netUpper: net?.upper ?? null,
        reason: standingUnjudged
          ? `the read returns no admissible held-back figure (m3 ${m3}), so this decline rests on the corpus the ` +
            `2026-08-11 clock defect invalidated and on nothing else — restored until a fold that can judge it exists`
          : `the read returns no admissible held-back figure (m3 ${m3})`,
        symbol,
      });
      continue;
    }
    const heldBackTest = net.upper < 0 && gross.upper < 0 && net.n >= WITHDRAWAL_MIN_FILLED;
    // AMENDMENT 36 SAYS "BEFORE ANY WITHDRAWAL", so the removal test runs for a
    // standing decline exactly as it runs for a new one. The earlier rule put
    // it in the nomination clause alone, which every incumbent bypassed: 13 of
    // 23 entries had never been removal-tested on a window or a cap at all.
    const removal = removalOutcomeOf(symbol, removalGradings);
    const removalPasses = removal.retiringCells.length === 0;
    // The retirement record is an OBJECT, not a null — `retired` is the flag,
    // and reading the object's presence as "retired" silently nominated
    // nothing (first run: 0 new declines against a 16-market recommendation).
    const retirement = markets[symbol].retirement;
    // THE FROZEN RETIREMENT RECORD IS PROVENANCE NOW. It decided nothing here
    // once retirement became a money test computed from the removal arms, so
    // its absence is no longer a reason to refuse — the removal test says for
    // itself whether it could run, and a market it could not test is recorded
    // as never removal-tested rather than assumed clean.
    const frozenRetirement = retirement === null || retirement === undefined
      ? null
      : { retired: (retirement as { retired?: boolean }).retired === true };
    const candidate = markets[symbol].shipped.declineCandidate === true;
    const standing = alreadyDeclined.has(symbol);
    const declined = heldBackTest && removalPasses && (standing || candidate);
    // RETIREMENT IS DECIDED HERE, ON MONEY, not read from the frozen record.
    // The freeze's rule retires a candidacy when a select GROSS bound crosses
    // zero, and two markets are being served today on exactly that — ADAUSD
    // and XTZUSD, both confidently negative on BOTH columns of the
    // confirmation fold, together −655R over 3,042 filled setups. A gross
    // bound crossing zero while the money in that same cell stays worse than
    // the shipped cell's is not a market that stopped losing (amendment 39).
    // The frozen record is still carried as provenance; it is no longer the
    // decision.
    const disposition: MarketVerdict["disposition"] = declined
      ? (standing ? "stays" : "declined")
      : standing
      ? "restored"
      : !heldBackTest
      ? "cleared"
      : !removalPasses
      ? "retired"
      : "unnominated";
    verdicts.push({
      disposition,
      frozenRetirement,
      removal,
      filled: net.n,
      grossExpectancy: gross.expectancy,
      grossUpper: gross.upper,
      m3,
      measuredExpectancyR: net.expectancy,
      netUpper: net.upper,
      reason: heldBackTest && !removalPasses
        ? `measured ${net.expectancy.toFixed(3)}R per filled setup (95% upper ${net.upper.toFixed(3)}, n=${net.n}) on ` +
          `the confirmation fold — but ${removal.retiringCells.length} of ${removal.cellsTested} removal cells retire the ` +
          `withdrawal (${removal.retiringCells[0].arm} ${removal.retiringCells[0].variant}: net ${removal.retiringCells[0].netExpectancy.toFixed(3)} ` +
          `upper ${removal.retiringCells[0].netUpper.toFixed(3)} over ${removal.retiringCells[0].filled} fills), so the negative does not ` +
          `survive removing a window or a cap we chose (amendment 36)`
        : disposition === "retired"
        ? `measured ${net.expectancy.toFixed(3)}R per filled setup (95% upper ${net.upper.toFixed(3)}, n=${net.n}) on the ` +
          `confirmation fold, and the select fold DID nominate it — but an accepted variant retired the candidacy, and ` +
          `the retirement rule keeps the market`
        : heldBackTest && !declined
        ? `measured ${net.expectancy.toFixed(3)}R per filled setup (95% upper ${net.upper.toFixed(3)}, n=${net.n}) on the ` +
          `confirmation fold, and ${gross.expectancy.toFixed(3)}R at the published commission alone — but the read's ` +
          `select fold never nominated it, so declining it now would be a hypothesis dredged from the confirm fold`
        : declined
        // "HELD BACK FROM EVERY TUNING STEP" WOULD BE FALSE. The confirmation
        // fold was never READ while the cells were tuned, but the shipped cells
        // were DERIVED over dates inside it — act 2's provenance found 0 of 72
        // derived cells held back once the confirmation window counts. That is
        // exactly why only a confirmed-NEGATIVE figure is admissible for them,
        // the fold contradicting a prior positive read, and the sentence has to
        // name the fold rather than claim an innocence the provenance denies.
        ? `measured ${net.expectancy.toFixed(3)}R per filled setup (95% upper ${net.upper.toFixed(3)}, n=${net.n}) ` +
          `on the confirmation fold the ledgered read opened once, and ${gross.expectancy.toFixed(3)}R ` +
          `(95% upper ${gross.upper.toFixed(3)}) at the venue's published commission alone — the negative survives ` +
          `removing our own modelled spread and slippage` +
          (removal.tested
            ? `, and it survives all ${removal.cellsTested} removal cells that could test a window or a cap`
            : `; NEVER REMOVAL-TESTED — this calendar leaves it no select-fold rows a removal arm could grade, so the ` +
              `window and cap legs of amendment 36 are undischarged and the next act's calendar must reach it first`)
        : net.n < WITHDRAWAL_MIN_FILLED
        ? `judged on ${net.n} filled outcomes, below the ${WITHDRAWAL_MIN_FILLED}-fill floor — a starved verdict`
        : `net upper ${net.upper.toFixed(3)} but gross upper ${gross.upper.toFixed(3)} — the negative does not survive ` +
          `removing our own modelled costs (amendment 36), so the parameter is the defect and the market is not`,
      symbol,
    });
  }
  return verdicts;
}

/** Declared, because the reader refuses a flag it was not told owns its token. */
const VALUE_FLAGS = new Set(["--arms", "--manifest", "--out", "--prior", "--read"]);

/**
 * The register as it stood before this re-decision, taken from the artifact the
 * outgoing register was pinned to. Its DATA-NEGATIVE population IS that
 * register — the pin asserted set equality in both directions — so this reads
 * the same population the code used to carry, without trusting the code that
 * this run rewrites.
 */
export function priorRegisterFrom(path: string): string[] {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    verdicts?: Record<string, { verdict?: string }>;
  };
  const verdicts = parsed.verdicts;
  if (verdicts === undefined || Object.keys(verdicts).length === 0) {
    throw new Error(`${path}: carries no verdicts, so the prior register cannot be derived from it`);
  }
  const prior = Object.entries(verdicts)
    .filter(([, row]) => typeof row.verdict === "string" && row.verdict.startsWith("DATA-NEGATIVE"))
    .map(([symbol]) => symbol)
    .sort();
  if (prior.length === 0) {
    throw new Error(`${path}: names no DATA-NEGATIVE market — an empty prior register would nominate nothing`);
  }
  return prior;
}

/**
 * The artifact's body, built from paths alone — so the thing the tracked file
 * is supposed to be can be constructed in a test rather than only by running
 * the CLI. main() was the only place the prior register was resolved, which
 * meant a mutation replacing it with an empty set changed nothing any test
 * could see.
 */
export function withdrawalArtifact(options: {
  armsDir: string;
  manifestHash: string;
  priorPath: string;
  readPath: string;
}): Record<string, unknown> {
  const artifact = readLedgeredArtifact(options.readPath, { manifestHash: options.manifestHash });
  const priorRegister = priorRegisterFrom(options.priorPath);
  const removalGradings = readRemovalGradings(options.armsDir);
  const verdicts = withdrawalVerdicts(artifact, new Set(priorRegister), removalGradings);
  const of = (kind: MarketVerdict["disposition"]) => verdicts.filter((row) => row.disposition === kind);
  return {
    artifactHash: artifact.artifactHash,
    cleared: of("cleared"),
    declined: [...of("declined"), ...of("stays")].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    floorNote: WITHDRAWAL_FLOOR_NOTE,
    minFilled: WITHDRAWAL_MIN_FILLED,
    minFillShare: WITHDRAWAL_MIN_FILL_SHARE,
    priorRegister,
    removalArms: [...REMOVAL_ARMS],
    readAt: artifact.readAt,
    readId: artifact.readId,
    restored: of("restored"),
    retired: of("retired"),
    rule: WITHDRAWAL_RULE,
    ruleHash: WITHDRAWAL_RULE_HASH,
    unjudged: of("unjudged"),
    unnominated: of("unnominated"),
  };
}

function main(): void {
  const flags = flagReader(process.argv.slice(2), VALUE_FLAGS);
  const readPath = flags.str("--read");
  const manifestHash = flags.str("--manifest");
  if (readPath === undefined || manifestHash === undefined) {
    throw new Error(
      "usage: npx tsx scripts/register-verdict.ts --read <artifact.json> --manifest <hash> [--out <path>] " +
        "— the manifest binds the read to the corpus it was read from, and the door refuses any other",
    );
  }
  const outPath = flags.str("--out") ?? "docs/research/r4/withdrawal-verdict-2026-09-03.json";
  const priorPath = flags.str("--prior") ?? "docs/research/baseline-2026-08-10/4d-cost-sensitivity.json";
  const armsDir = flags.str("--arms") ?? "docs/research/r4";
  const body = withdrawalArtifact({ armsDir, manifestHash, priorPath, readPath });
  const rows = (key: string) => body[key] as MarketVerdict[];
  const declined = rows("declined");
  const unnominated = rows("unnominated");
  writeResearchArtifact(outPath, body);
  const lost = (entries: MarketVerdict[]) =>
    entries.reduce((sum, row) => sum + (row.measuredExpectancyR ?? 0) * (row.filled ?? 0), 0);
  console.log(`${declined.length + rows("restored").length + rows("retired").length + rows("unnominated").length + rows("cleared").length + rows("unjudged").length} markets judged under rule ${WITHDRAWAL_RULE_HASH.slice(0, 12)}`);
  console.log(
    `declined ${declined.length} (${declined.filter((row) => row.disposition === "declined").length} new, ` +
      `${declined.filter((row) => row.disposition === "stays").length} re-based) · restored ${rows("restored").length} · ` +
      `retired ${rows("retired").length} · unnominated ${unnominated.length} · cleared ${rows("cleared").length} · ` +
      `unjudged ${rows("unjudged").length}`,
  );
  console.log(`the unnominated set lost ${lost(unnominated).toFixed(0)}R over ${unnominated.reduce((sum, row) => sum + (row.filled ?? 0), 0)} confirmation-fold fills — the next act's population, not this one's`);
  console.log(`the declined set lost ${lost(declined).toFixed(0)}R over ${declined.reduce((sum, row) => sum + (row.filled ?? 0), 0)} confirmation-fold fills`);
  console.log(`wrote ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
