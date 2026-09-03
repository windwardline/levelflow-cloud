// R4 act 3 — the freeze.
//
// Every supplementary arm is graded on the tuning folds at the market unit
// (`grid-totalr --verdict-unit market --out <arm>-grading.json`). Before the
// program's one confirm read, the accepted variants are frozen, per market,
// into ONE hashed artifact; the read consumes that file and nothing else, so
// nothing decides on the held-back fold after seeing it.
//
// The freeze binds each arm's grading artifact by its bytes (sha256 of the
// file), carries the manifest hashes, the calendar hash, the anchor and the
// engine version, and refuses: a grading that opened the confirm fold, a
// grading that is not the market unit on emitted folds, a condemned
// artifact, and arms that disagree on the anchor, the engine, the calendar,
// the holdout, or a shipped cell's decline candidacy (a disagreement means
// the arms' baselines are not the same cell, and a cross-arm choice between
// them is meaningless). Its own hash and the rule's hash make a tampered or
// re-ruled file refuse when the read opens it.
//
//   npx tsx scripts/freeze-candidates.ts \
//     --arms "S=docs/research/r4/stop-cap-grading.json;W=docs/research/r4/review-window-grading.json" \
//     --out docs/research/r4/frozen-candidates.json

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { flagReader, OperatorInputError } from "./flagReader.ts";
import { sha256File, stableJson } from "./ledgeredRead.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";

export const FREEZE_RULE =
  "per market, among the variants the gate accepted in any arm, the one with the largest fit ΔR " +
  "(ties: the smaller paired p, then the arm name, then the variant name); none when no arm accepted one. " +
  "Frozen before the read; the read consumes this file and nothing else.";
export const FREEZE_RULE_HASH = createHash("sha256").update(FREEZE_RULE).digest("hex");

type GradingVariant = {
  accepted: boolean;
  fitTotalDelta: number | null;
  pairedP: number | null;
  reason: string;
  selectExpectancyDelta: number | null;
  selectTotalDelta: number | null;
  [key: string]: unknown;
};

type GradingMarket = {
  heldOut: boolean;
  shipped: { declineCandidate: boolean; variant: string; [key: string]: unknown };
  variants: Record<string, GradingVariant>;
};

export type GradingArtifact = {
  anchor: string;
  analyzerVersion: string;
  calendarHash: string;
  foldSource: string;
  heldOut: string[];
  holdoutRule: string;
  markets: Record<string, GradingMarket>;
  shardHashes: string[];
  shards: string[];
  verdictUnit: string;
  [key: string]: unknown;
};

export type FrozenCandidate = {
  arm: string;
  fitTotalDelta: number;
  pairedP: number | null;
  selectExpectancyDelta: number | null;
  selectTotalDelta: number | null;
  variant: string;
};

export type FrozenMarket = {
  acceptedCount: number;
  candidate: FrozenCandidate | null;
  declineCandidate: boolean;
  heldOut: boolean;
};

export type FrozenArm = {
  analyzerVersion: string;
  anchor: string;
  arm: string;
  artifactPath: string;
  artifactSha256: string;
  calendarHash: string;
  shardHashes: string[];
  shards: string[];
  verdictUnit: string;
};

export type FrozenCandidates = {
  INVALID?: string;
  analyzerVersion: string;
  anchor: string;
  arms: FrozenArm[];
  calendarHash: string;
  frozenAt: string;
  frozenHash: string;
  heldOut: string[];
  holdoutRule: string;
  markets: Record<string, FrozenMarket>;
  rule: string;
  ruleHash: string;
};

function refuse(message: string): never {
  throw new OperatorInputError(message);
}

/** Opens one arm's grading artifact and refuses everything the freeze must not consume. */
export function loadGradingArtifact(path: string): GradingArtifact {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (typeof parsed.INVALID === "string") refuse(`${path} is condemned (INVALID: ${parsed.INVALID}); the freeze does not consume it`);
  if ("read" in parsed || "confirmRead" in parsed) {
    refuse(`${path} carries a read (its top level has a "read" field) — the freeze consumes tuning-fold gradings only`);
  }
  for (const field of ["anchor", "analyzerVersion", "calendarHash", "foldSource", "holdoutRule", "verdictUnit"] as const) {
    if (typeof parsed[field] !== "string") refuse(`${path} has no ${field}; the freeze binds it and cannot proceed without it`);
  }
  if (parsed.verdictUnit !== "market") refuse(`${path} has verdictUnit ${String(parsed.verdictUnit)}; the freeze reads the market unit only`);
  if (parsed.foldSource !== "emitted") refuse(`${path} has foldSource ${String(parsed.foldSource)}; the freeze reads emitted folds only`);
  if (!Array.isArray(parsed.heldOut) || !Array.isArray(parsed.shardHashes) || !Array.isArray(parsed.shards)) {
    refuse(`${path} lacks heldOut, shardHashes or shards`);
  }
  const markets = parsed.markets;
  if (markets === null || typeof markets !== "object" || Array.isArray(markets)) refuse(`${path} has no markets map`);
  for (const [symbol, entry] of Object.entries(markets as Record<string, GradingMarket>)) {
    if (entry.shipped === undefined || typeof entry.shipped.declineCandidate !== "boolean" || typeof entry.heldOut !== "boolean") {
      refuse(`${path}: ${symbol} lacks a shipped cell with declineCandidate, or a heldOut label`);
    }
    if ("confirm" in entry.shipped) {
      refuse(`${path}: ${symbol}'s shipped cell carries a confirm figure — this grading opened the held-back fold and the freeze refuses it`);
    }
    for (const [name, verdict] of Object.entries(entry.variants ?? {})) {
      if ("confirmTotalDelta" in verdict && verdict.confirmTotalDelta !== null) {
        refuse(`${path}: ${symbol} ${name} carries a confirm delta — this grading opened the held-back fold and the freeze refuses it`);
      }
      if (typeof verdict.accepted !== "boolean") refuse(`${path}: ${symbol} ${name} has no accepted verdict`);
    }
  }
  return parsed as unknown as GradingArtifact;
}

/** FREEZE_RULE, mechanically. */
export function chooseCandidate(accepted: FrozenCandidate[]): FrozenCandidate | null {
  if (accepted.length === 0) return null;
  const sorted = [...accepted].sort((a, b) =>
    b.fitTotalDelta - a.fitTotalDelta ||
    (a.pairedP ?? 1) - (b.pairedP ?? 1) ||
    a.arm.localeCompare(b.arm) ||
    a.variant.localeCompare(b.variant)
  );
  return sorted[0];
}

export function frozenHashOf(body: Omit<FrozenCandidates, "frozenHash"> & { frozenHash?: string }): string {
  const { frozenHash: _omitted, ...rest } = body;
  void _omitted;
  return createHash("sha256").update(stableJson(rest)).digest("hex");
}

function sameList(a: string[], b: string[]): boolean {
  const left = [...a].sort();
  const right = [...b].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export async function freezeCandidates(
  arms: ReadonlyArray<{ arm: string; path: string }>,
  options: { baseDir?: string; now?: Date } = {},
): Promise<FrozenCandidates> {
  if (arms.length === 0) refuse("no arm named; pass --arm <name>=<grading.json> at least once");
  const seen = new Set<string>();
  for (const { arm } of arms) {
    if (seen.has(arm)) refuse(`arm ${arm} is named twice`);
    seen.add(arm);
  }
  const baseDir = options.baseDir ?? process.cwd();
  const loaded: Array<{ arm: string; path: string; artifact: GradingArtifact; sha256: string }> = [];
  for (const { arm, path } of arms) {
    loaded.push({ arm, path, artifact: loadGradingArtifact(path), sha256: await sha256File(path) });
  }
  const first = loaded[0].artifact;
  for (const { arm, artifact } of loaded.slice(1)) {
    for (const field of ["anchor", "analyzerVersion", "calendarHash", "holdoutRule"] as const) {
      if (artifact[field] !== first[field]) {
        refuse(`arm ${arm} has ${field} ${String(artifact[field])} but arm ${loaded[0].arm} has ${String(first[field])}; the freeze takes one ${field}`);
      }
    }
    if (!sameList(artifact.heldOut, first.heldOut)) refuse(`arm ${arm}'s heldOut set differs from arm ${loaded[0].arm}'s; one holdout population per program`);
  }
  const symbols = [...new Set(loaded.flatMap(({ artifact }) => Object.keys(artifact.markets)))].sort();
  const markets: Record<string, FrozenMarket> = {};
  for (const symbol of symbols) {
    const accepted: FrozenCandidate[] = [];
    let declineCandidate: boolean | null = null;
    let heldOut: boolean | null = null;
    for (const { arm, artifact } of loaded) {
      const entry = artifact.markets[symbol];
      if (entry === undefined) continue;
      if (declineCandidate === null) declineCandidate = entry.shipped.declineCandidate;
      else if (declineCandidate !== entry.shipped.declineCandidate) {
        refuse(`${symbol}: arm ${arm} reads the shipped cell's declineCandidate as ${entry.shipped.declineCandidate} where another arm read ${declineCandidate}; the arms' baselines are not the same cell`);
      }
      if (heldOut === null) heldOut = entry.heldOut;
      else if (heldOut !== entry.heldOut) refuse(`${symbol}: arm ${arm} labels heldOut ${entry.heldOut} where another arm labelled ${heldOut}`);
      for (const [variant, verdict] of Object.entries(entry.variants)) {
        if (!verdict.accepted) continue;
        if (typeof verdict.fitTotalDelta !== "number") refuse(`${symbol}: arm ${arm} accepted ${variant} without a fit ΔR`);
        accepted.push({
          arm,
          fitTotalDelta: verdict.fitTotalDelta,
          pairedP: verdict.pairedP,
          selectExpectancyDelta: verdict.selectExpectancyDelta,
          selectTotalDelta: verdict.selectTotalDelta,
          variant,
        });
      }
    }
    markets[symbol] = {
      acceptedCount: accepted.length,
      candidate: chooseCandidate(accepted),
      declineCandidate: declineCandidate ?? false,
      heldOut: heldOut ?? false,
    };
  }
  const body: Omit<FrozenCandidates, "frozenHash"> = {
    analyzerVersion: first.analyzerVersion,
    anchor: first.anchor,
    arms: loaded.map(({ arm, path, artifact, sha256 }) => ({
      analyzerVersion: artifact.analyzerVersion,
      anchor: artifact.anchor,
      arm,
      artifactPath: relative(baseDir, resolve(path)),
      artifactSha256: sha256,
      calendarHash: artifact.calendarHash,
      shardHashes: [...artifact.shardHashes],
      shards: [...artifact.shards],
      verdictUnit: artifact.verdictUnit,
    })),
    calendarHash: first.calendarHash,
    frozenAt: (options.now ?? new Date()).toISOString(),
    heldOut: [...first.heldOut].sort(),
    holdoutRule: first.holdoutRule,
    markets,
    rule: FREEZE_RULE,
    ruleHash: FREEZE_RULE_HASH,
  };
  return { ...body, frozenHash: frozenHashOf(body) };
}

/** The door the read opens the frozen file through: condemned, tampered or re-ruled files refuse. */
export function verifyFrozenCandidates(path: string): FrozenCandidates {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as FrozenCandidates;
  if (typeof parsed.INVALID === "string") refuse(`${path} is condemned (INVALID: ${parsed.INVALID})`);
  if (parsed.rule !== FREEZE_RULE || parsed.ruleHash !== FREEZE_RULE_HASH) {
    refuse(`${path} was frozen under a different rule (ruleHash ${String(parsed.ruleHash)}); the read consumes candidates frozen under FREEZE_RULE only`);
  }
  if (typeof parsed.frozenHash !== "string" || frozenHashOf(parsed) !== parsed.frozenHash) {
    refuse(`${path}: frozenHash does not match its content; the file was altered after it was frozen`);
  }
  return parsed;
}

const VALUE_FLAGS = new Set(["--arms", "--out"]);

function parseArgs(argv: readonly string[]): { arms: Array<{ arm: string; path: string }>; out: string } {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) refuse(`unexpected argument ${token}; this command takes --arms "<name>=<grading.json>;…" and --out <path> only`);
    if (!VALUE_FLAGS.has(token)) refuse(`unknown flag ${token}; this command takes --arms and --out only`);
    index += 1;
  }
  const { str } = flagReader(argv, VALUE_FLAGS);
  const armsSpec = str("--arms");
  if (armsSpec === undefined) refuse("--arms is required: name every arm as <name>=<grading.json>, separated by ;");
  const arms = armsSpec.split(";").filter((entry) => entry.length > 0).map((entry) => {
    const at = entry.indexOf("=");
    if (at <= 0 || at === entry.length - 1) refuse(`--arms takes <name>=<grading.json> entries, got ${entry}`);
    return { arm: entry.slice(0, at).trim(), path: entry.slice(at + 1).trim() };
  });
  const out = str("--out");
  if (out === undefined) refuse("--out is required: the frozen file is the read's only input and must be written somewhere named");
  return { arms, out };
}

async function main(): Promise<void> {
  const { arms, out } = parseArgs(process.argv.slice(2));
  const frozen = await freezeCandidates(arms);
  writeResearchArtifact(out, frozen as unknown as Record<string, unknown>);
  const symbols = Object.keys(frozen.markets);
  const candidates = symbols.filter((symbol) => frozen.markets[symbol].candidate !== null).length;
  const declines = symbols.filter((symbol) => frozen.markets[symbol].declineCandidate).length;
  console.log(
    `frozen: ${frozen.arms.length} arm${frozen.arms.length === 1 ? "" : "s"}, ${symbols.length} markets, ` +
      `${candidates} candidate${candidates === 1 ? "" : "s"}, ${declines} decline candidate${declines === 1 ? "" : "s"} ` +
      `-> ${out} (frozenHash ${frozen.frozenHash.slice(0, 12)})`,
  );
}

if (process.argv[1] !== undefined && /freeze-candidates\.ts$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
