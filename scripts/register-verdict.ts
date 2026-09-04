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
  "The CONFIRMATION-FOLD TEST, applied to every market: the read's shipped-cell m3 is confirmed-negative " +
  "on at least 30 filled outcomes and BOTH the net and the gross 95% upper bounds are below zero. The " +
  "fold was sealed from this program's tuning, but the shipped cells were DERIVED over dates inside it — " +
  "the read records heldBack false for every market — so the figure is admissible only because it is " +
  "NEGATIVE: a cell selected on the rows it is then judged on is biased toward the positive, and the " +
  "contradiction is the direction that survives that bias (ADMISSIBILITY_RULE). Net " +
  "is the money (amendment 39); gross is amendment 36's precondition — a negative that rests on a " +
  "cost we model is a defect in the parameter, not in the market. ENTERING the register also " +
  "requires the read's own pre-registered nomination: the shipped cell was a decline candidate " +
  "under DECLINE_RULE on the select fold and no accepted variant retired it. STAYING in the " +
  "register requires the held-back test alone, because a standing decline is not a new hypothesis " +
  "being dredged from the confirm fold but an existing verdict being re-tested on valid data. A " +
  "market that fails the held-back test while declined is RESTORED, and so is one the read cannot " +
  "judge at all: a decline may not stand on evidence this program has invalidated. A market that " +
  "passes the held-back test without a nomination is neither declined nor cleared — it is named " +
  "for the next act.";

export const WITHDRAWAL_RULE_HASH = createHash("sha256").update(WITHDRAWAL_RULE).digest("hex");

export const WITHDRAWAL_MIN_FILLED = 30;

export type MarketVerdict = {
  disposition: "declined" | "restored" | "stays" | "retired" | "unnominated" | "cleared" | "unjudged";
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
    // The retirement record is an OBJECT, not a null — `retired` is the flag,
    // and reading the object's presence as "retired" silently nominated
    // nothing (first run: 0 new declines against a 16-market recommendation).
    const retirement = markets[symbol].retirement;
    // A CANDIDATE WITH NO RETIREMENT RECORD WAS NEVER REMOVAL-TESTED. The
    // nomination clause promises that no accepted variant rescued the market;
    // absent the record there is nothing to read, and treating that silence as
    // "not rescued" declines a market the rule may keep. Refuse by name.
    if (markets[symbol].shipped.declineCandidate === true && (retirement === null || retirement === undefined)) {
      throw new Error(
        `${symbol} is a decline candidate with no retirement record, so the rule cannot tell whether an accepted ` +
          `variant rescued it — refusing rather than declining a market the retirement rule may keep`,
      );
    }
    const retired = retirement !== null && retirement !== undefined &&
      (retirement as { retired?: boolean }).retired === true;
    const candidate = markets[symbol].shipped.declineCandidate === true;
    const nominated = candidate && !retired;
    const standing = alreadyDeclined.has(symbol);
    const declined = heldBackTest && (standing || nominated);
    const disposition: MarketVerdict["disposition"] = declined
      ? (standing ? "stays" : "declined")
      : standing
      ? "restored"
      : !heldBackTest
      ? "cleared"
      // RETIRED IS NOT UNNOMINATED, and filing it as such states the opposite
      // of the read: ADAUSD and XTZUSD WERE decline candidates on the select
      // fold and an accepted variant rescued them. The retirement rule is what
      // keeps them, not an absence of nomination.
      : retired
      ? "retired"
      : "unnominated";
    verdicts.push({
      disposition,
      filled: net.n,
      grossExpectancy: gross.expectancy,
      grossUpper: gross.upper,
      m3,
      measuredExpectancyR: net.expectancy,
      netUpper: net.upper,
      reason: disposition === "retired"
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
          `removing our own modelled spread and slippage`
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
const VALUE_FLAGS = new Set(["--manifest", "--out", "--prior", "--read"]);

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
  manifestHash: string;
  priorPath: string;
  readPath: string;
}): Record<string, unknown> {
  const artifact = readLedgeredArtifact(options.readPath, { manifestHash: options.manifestHash });
  const priorRegister = priorRegisterFrom(options.priorPath);
  const verdicts = withdrawalVerdicts(artifact, new Set(priorRegister));
  const of = (kind: MarketVerdict["disposition"]) => verdicts.filter((row) => row.disposition === kind);
  return {
    artifactHash: artifact.artifactHash,
    cleared: of("cleared"),
    declined: [...of("declined"), ...of("stays")].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    minFilled: WITHDRAWAL_MIN_FILLED,
    priorRegister,
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
  const body = withdrawalArtifact({ manifestHash, priorPath, readPath });
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
