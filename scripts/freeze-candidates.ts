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
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import { sha256File, stableJson } from "./ledgeredRead.ts";
import { writeResearchArtifact } from "./researchArtifact.ts";

export const FREEZE_RULE =
  "per market, among the variants the gate accepted in any arm, the one with the largest fit ΔR " +
  "(ties: the smaller paired p, then the arm name, then the variant name); none when no arm accepted one. " +
  "Frozen before the read; the read consumes this file and nothing else.";
export const FREEZE_RULE_HASH = createHash("sha256").update(FREEZE_RULE).digest("hex");

/**
 * Amendment 36's removal test, pre-registered in the act-3 design (§5): a
 * decline candidate retires from candidacy iff some cell of a REMOVAL arm
 * (the cap arm, the window arm) with at least 30 filled and at least half
 * of the shipped cell's select fills fails DECLINE_RULE — its net upper
 * bound is at or above zero, OR its gross upper bound is. The retiring cell,
 * its n and both figures are recorded; retirement by one cell of k is
 * labelled fragile; a retired market ships unchanged and its M3 is still
 * reported. The multiplicity points toward retention, which is amendment
 * 31's asymmetry.
 */
export const RETIREMENT_RULE =
  "a decline candidate retires from candidacy iff some cell of a removal arm with >= 30 filled and >= 50% of the shipped cell's " +
  "select fills (the floor applies to the net column, and to the gross column when the gross clause fires) has a select net upper " +
  "bound >= 0 OR a select gross upper bound >= 0; the retiring cells are recorded; retirement resting on exactly one cell — " +
  "whether one of k tested or the only cell tested — is labelled fragile; a retired market ships unchanged and its M3 is still reported.";
export const RETIREMENT_RULE_HASH = createHash("sha256").update(RETIREMENT_RULE).digest("hex");
export const RETIREMENT_MIN_FILLED = 30;
export const RETIREMENT_MIN_FILL_SHARE = 0.5;

type FigureLike = { expectancy: number; lower: number; n: number; upper: number } | null;

export type RetiringCell = { arm: string; gross: FigureLike; net: FigureLike; variant: string };

export type Retirement = {
  fragile: boolean;
  retired: boolean;
  retiringCells: RetiringCell[];
  /** Cells of the removal arms that met the sample floor and were tested. */
  testedCells: number;
};

type GradingVariant = {
  accepted: boolean;
  fitTotalDelta: number | null;
  pairedP: number | null;
  reason: string;
  select?: { gross: FigureLike; net: FigureLike };
  selectExpectancyDelta: number | null;
  selectTotalDelta: number | null;
  [key: string]: unknown;
};

type GradingMarket = {
  heldOut: boolean;
  shipped: { declineCandidate: boolean; select?: { gross: FigureLike; net: FigureLike }; variant: string; [key: string]: unknown };
  variants: Record<string, GradingVariant>;
};

export type DerivedSpec = { field: string; op: string; parent: string; predicate: string; predicateHash: string; value: number };

export type GradingArtifact = {
  anchor: string;
  analyzerVersion: string;
  calendarHash: string;
  derived?: Record<string, DerivedSpec>;
  /** sha256 of each shard's emit, keyed by manifestHash — the bytes the arm was graded on. */
  emitSha256?: Record<string, string>;
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
  /** Variants graded against this market across every arm — the multiplicity the read must state. */
  cellsTested: number;
  declineCandidate: boolean;
  heldOut: boolean;
  /** RETIREMENT_RULE applied to a decline candidate over the removal arms; null for every other market. */
  retirement: Retirement | null;
};

export type FrozenArm = {
  analyzerVersion: string;
  anchor: string;
  arm: string;
  artifactPath: string;
  artifactSha256: string;
  calendarHash: string;
  /** The arm's derived variants (predicates graded from the parent corpus's rows), so the read can rebuild them without retyping. */
  derived: Record<string, DerivedSpec>;
  /** sha256 of each of the arm's emits, keyed by manifestHash; the read refuses a corpus whose bytes differ. */
  emitSha256: Record<string, string>;
  shardHashes: string[];
  shards: string[];
  verdictUnit: string;
};

/** One class-grain candidate: per class, per axis, the accepted variant with the largest fit ΔR among the axis's arms. */
export type FrozenClassCandidate = {
  arm: string;
  fitTotalDelta: number;
  /** The class's held-out members: read on the same cell as the out-of-sample check, never pooled. */
  heldOutMembers: string[];
  /** The pooled members the tuning folds graded the class on. */
  members: string[];
  pairedP: number | null;
  selectTotalDelta: number | null;
  variant: string;
};

export type FrozenClassAxis = { arms: Array<{ arm: string; prefix: string | null }>; axis: string };

export type FrozenCandidates = {
  INVALID?: string;
  analyzerVersion: string;
  anchor: string;
  arms: FrozenArm[];
  calendarHash: string;
  /** The class-grain axes the freeze read (R4 act 3) — absent when none were named. */
  classAxes?: FrozenClassAxis[];
  /** Per class, per axis: the frozen candidate or null. */
  classes?: Record<string, Record<string, FrozenClassCandidate | null>>;
  /** (class, cell) tests across the class arms — the class-grain multiplicity. */
  classCellsTested?: number;
  expectedFalseAcceptsClasses?: number;
  /** 0.05 × the cells tested across all markets: how many accepts the gate's own p would hand out by chance. */
  expectedFalseAccepts: number;
  frozenAt: string;
  frozenHash: string;
  heldOut: string[];
  holdoutRule: string;
  markets: Record<string, FrozenMarket>;
  /** The arms whose cells count as amendment 36 removals for the retirement rule. */
  removalArms: string[];
  retirementRule: string;
  retirementRuleHash: string;
  rule: string;
  ruleHash: string;
};

function refuse(message: string): never {
  throw new OperatorInputError(message);
}

/** Opens one arm's grading artifact and refuses everything the freeze must not consume. */
export function loadGradingArtifact(path: string, unit: "market" | "class" = "market"): GradingArtifact {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (typeof parsed.INVALID === "string") refuse(`${path} is condemned (INVALID: ${parsed.INVALID}); the freeze does not consume it`);
  if ("read" in parsed || "confirmRead" in parsed) {
    refuse(`${path} carries a read (its top level has a "read" field) — the freeze consumes tuning-fold gradings only`);
  }
  for (const field of ["anchor", "analyzerVersion", "calendarHash", "foldSource", "holdoutRule", "verdictUnit"] as const) {
    if (typeof parsed[field] !== "string") refuse(`${path} has no ${field}; the freeze binds it and cannot proceed without it`);
  }
  if (parsed.verdictUnit !== unit) refuse(`${path} has verdictUnit ${String(parsed.verdictUnit)}; this arm was named as a ${unit}-unit grading`);
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

/** RETIREMENT_RULE, mechanically, over one market's removal-arm cells. */
export function retirementOf(
  shippedSelectFilled: number,
  cells: Array<{ arm: string; variant: string; select: { gross: FigureLike; net: FigureLike } | undefined }>,
): Retirement {
  const meetsFloor = (figure: FigureLike | undefined): figure is { expectancy: number; lower: number; n: number; upper: number } =>
    figure !== null && figure !== undefined && figure.n >= RETIREMENT_MIN_FILLED && figure.n >= shippedSelectFilled * RETIREMENT_MIN_FILL_SHARE;
  const tested = cells.filter(({ select }) => meetsFloor(select?.net));
  const retiring = tested
    .filter(({ select }) => select!.net!.upper >= 0 || (meetsFloor(select!.gross) && select!.gross!.upper >= 0))
    .map(({ arm, variant, select }) => ({ arm, gross: select!.gross ?? null, net: select!.net ?? null, variant }));
  return { fragile: retiring.length === 1, retired: retiring.length > 0, retiringCells: retiring, testedCells: tested.length };
}

export type ClassArmSpec = { arm: string; axis: string; path: string; prefix: string | null };

/** `axis:ARM=path[|prefix],ARM=path;axis:…` */
export function parseClassArms(spec: string): ClassArmSpec[] {
  const out: ClassArmSpec[] = [];
  for (const axisEntry of spec.split(";").map((part) => part.trim()).filter((part) => part.length > 0)) {
    const colon = axisEntry.indexOf(":");
    if (colon <= 0) refuse(`--class-arms: an axis entry needs a name before the colon, got ${JSON.stringify(axisEntry)}`);
    const axis = axisEntry.slice(0, colon).trim();
    for (const armEntry of axisEntry.slice(colon + 1).split(",").map((part) => part.trim()).filter((part) => part.length > 0)) {
      const eq = armEntry.indexOf("=");
      if (eq <= 0 || eq === armEntry.length - 1) refuse(`--class-arms: ${JSON.stringify(armEntry)} is not <arm>=<class-grading.json>[|prefix]`);
      const arm = armEntry.slice(0, eq).trim();
      const rest = armEntry.slice(eq + 1);
      const bar = rest.indexOf("|");
      const path = (bar < 0 ? rest : rest.slice(0, bar)).trim();
      const prefix = bar < 0 ? null : rest.slice(bar + 1).trim();
      if (prefix !== null && prefix.length === 0) refuse(`--class-arms: ${JSON.stringify(armEntry)} names an empty prefix`);
      out.push({ arm, axis, path, prefix });
    }
  }
  return out;
}

export async function freezeCandidates(
  arms: ReadonlyArray<{ arm: string; path: string }>,
  options: { baseDir?: string; classArms?: ClassArmSpec[]; now?: Date; removalArms?: string[] } = {},
): Promise<FrozenCandidates> {
  if (arms.length === 0) refuse("no arm named; pass --arm <name>=<grading.json> at least once");
  const removalArms = [...(options.removalArms ?? [])].sort();
  for (const arm of removalArms) {
    if (!arms.some((named) => named.arm === arm)) refuse(`removal arm ${arm} is not among the arms named; the retirement rule cannot read a corpus that was not frozen`);
  }
  const seen = new Set<string>();
  for (const { arm } of arms) {
    if (seen.has(arm)) refuse(`arm ${arm} is named twice`);
    seen.add(arm);
  }
  const corpusOwner = new Map<string, string>();
  const baseDir = options.baseDir ?? process.cwd();
  const loaded: Array<{ arm: string; path: string; artifact: GradingArtifact; sha256: string }> = [];
  for (const { arm, path } of arms) {
    const artifact = loadGradingArtifact(path);
    for (const hash of artifact.shardHashes) {
      const owner = corpusOwner.get(hash);
      if (owner !== undefined) refuse(`arms ${owner} and ${arm} are both bound to corpus ${hash.slice(0, 12)}; one corpus is one arm, or the read cannot tell whose candidate it opens`);
      corpusOwner.set(hash, arm);
    }
    loaded.push({ arm, path, artifact, sha256: await sha256File(path) });
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
    let shippedSelect: string | null = null;
    let cellsTested = 0;
    let shippedSelectFilled = 0;
    const removalCells: Array<{ arm: string; variant: string; select: { gross: FigureLike; net: FigureLike } | undefined }> = [];
    for (const { arm, artifact } of loaded) {
      const entry = artifact.markets[symbol];
      if (entry === undefined) continue;
      // One baseline per program: every arm's shipped cell must be the same
      // rows, or a cross-arm "largest fit ΔR" compares against two baselines.
      if (entry.shipped.select === undefined) refuse(`${symbol}: arm ${arm}'s grading carries no shipped-cell select figures, so its baseline cannot be reconciled; grade it with a gate that writes them`);
      const selectKey = stableJson(entry.shipped.select);
      if (shippedSelect === null) shippedSelect = selectKey;
      else if (shippedSelect !== selectKey) {
        refuse(`${symbol}: arm ${arm}'s shipped-cell select figures differ from another arm's; the arms' baselines are not the same rows and cannot be frozen together`);
      }
      cellsTested += Object.keys(entry.variants ?? {}).length;
      shippedSelectFilled = entry.shipped.select?.net?.n ?? 0;
      if (removalArms.includes(arm)) {
        for (const [variant, verdict] of Object.entries(entry.variants ?? {})) {
          if (verdict.select === undefined) refuse(`${symbol}: removal arm ${arm}'s cell ${variant} carries no select figures; the retirement rule cannot read it — grade the arm with a gate that writes per-variant figures`);
          removalCells.push({ arm, select: verdict.select, variant });
        }
      }
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
      cellsTested,
      declineCandidate: declineCandidate ?? false,
      heldOut: heldOut ?? false,
      retirement: declineCandidate === true && removalArms.length > 0 ? retirementOf(shippedSelectFilled, removalCells) : null,
    };
  }
  // The class grain (R4 act 3): the knobs that could close amendment 39's gap
  // ship per class, so the read carries one candidate per class per axis,
  // chosen on the class gradings the tuning folds produced.
  const classArms = options.classArms ?? [];
  const classAxes: FrozenClassAxis[] = [];
  const classes: Record<string, Record<string, FrozenClassCandidate | null>> = {};
  let classCellsTested = 0;
  if (classArms.length > 0) {
    const heldOutByClass = new Map<string, string[]>();
    for (const symbol of first.heldOut) {
      const cls = getAssetType(symbol);
      heldOutByClass.set(cls, [...(heldOutByClass.get(cls) ?? []), symbol].sort());
    }
    const perAxisArms = new Map<string, Array<{ arm: string; prefix: string | null; artifact: GradingArtifact }>>();
    for (const spec of classArms) {
      const marketArm = loaded.find((entry) => entry.arm === spec.arm);
      if (marketArm === undefined) refuse(`class arm ${spec.arm} (axis ${spec.axis}) is not among the market arms; the read binds a corpus by its arm name`);
      const artifact = loadGradingArtifact(spec.path, "class");
      if (stableJson([...artifact.shardHashes].sort()) !== stableJson([...marketArm.artifact.shardHashes].sort())) {
        refuse(`class arm ${spec.arm} (axis ${spec.axis}) was graded on corpus ${artifact.shardHashes[0]?.slice(0, 12)} but the market arm ${spec.arm} on ${marketArm.artifact.shardHashes[0]?.slice(0, 12)}; one arm is one corpus`);
      }
      for (const field of ["anchor", "analyzerVersion", "calendarHash", "holdoutRule"] as const) {
        if (artifact[field] !== first[field]) refuse(`class arm ${spec.arm} (axis ${spec.axis}) has ${field} ${String(artifact[field])} but the program has ${String(first[field])}`);
      }
      if (!sameList(artifact.heldOut, first.heldOut)) refuse(`class arm ${spec.arm} (axis ${spec.axis})'s heldOut set differs from the program's`);
      perAxisArms.set(spec.axis, [...(perAxisArms.get(spec.axis) ?? []), { arm: spec.arm, artifact, prefix: spec.prefix }]);
    }
    for (const [axis, axisArms] of perAxisArms) {
      classAxes.push({ arms: axisArms.map(({ arm, prefix }) => ({ arm, prefix })), axis });
      for (const { arm, artifact, prefix } of axisArms) {
        const membersByClass = new Map<string, string[]>();
        const blockByClass = new Map<string, string>();
        for (const [symbol, entry] of Object.entries(artifact.markets)) {
          const cls = getAssetType(symbol);
          membersByClass.set(cls, [...(membersByClass.get(cls) ?? []), symbol]);
          const block = stableJson(entry.variants ?? {});
          const seenBlock = blockByClass.get(cls);
          if (seenBlock !== undefined && seenBlock !== block) refuse(`class arm ${arm}: ${symbol} carries a verdict block that differs from its class's; a class-unit grading gives every member the same block`);
          blockByClass.set(cls, block);
        }
        for (const [cls, members] of membersByClass) {
          const sample = artifact.markets[members[0]];
          const block = Object.entries(sample.variants ?? {}).filter(([name]) => prefix === null || name.startsWith(prefix));
          classCellsTested += block.length;
          const classEntry = classes[cls] ?? (classes[cls] = {});
          for (const [variant, verdict] of block) {
            const current = classEntry[axis] ?? null;
            if (!verdict.accepted) continue;
            if (typeof verdict.fitTotalDelta !== "number") refuse(`class arm ${arm}: ${cls} ${variant} accepted without a fit ΔR`);
            const candidate: FrozenClassCandidate = {
              arm,
              fitTotalDelta: verdict.fitTotalDelta,
              heldOutMembers: heldOutByClass.get(cls) ?? [],
              members: [...members].sort(),
              pairedP: verdict.pairedP,
              selectTotalDelta: verdict.selectTotalDelta,
              variant,
            };
            const better = current === null ||
              candidate.fitTotalDelta > current.fitTotalDelta ||
              (candidate.fitTotalDelta === current.fitTotalDelta && ((candidate.pairedP ?? 1) < (current.pairedP ?? 1) ||
                ((candidate.pairedP ?? 1) === (current.pairedP ?? 1) && (candidate.arm < current.arm || (candidate.arm === current.arm && candidate.variant < current.variant)))));
            if (better) classEntry[axis] = candidate;
          }
          if (!(axis in classEntry)) classEntry[axis] = null;
        }
      }
    }
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
      derived: artifact.derived ?? {},
      emitSha256: { ...(artifact.emitSha256 ?? {}) },
      shardHashes: [...artifact.shardHashes],
      shards: [...artifact.shards],
      verdictUnit: artifact.verdictUnit,
    })),
    calendarHash: first.calendarHash,
    ...(classArms.length > 0 ? { classAxes, classCellsTested, classes, expectedFalseAcceptsClasses: Number((0.05 * classCellsTested).toFixed(2)) } : {}),
    expectedFalseAccepts: Number((0.05 * Object.values(markets).reduce((sum, market) => sum + market.cellsTested, 0)).toFixed(2)),
    frozenAt: (options.now ?? new Date()).toISOString(),
    heldOut: [...first.heldOut].sort(),
    holdoutRule: first.holdoutRule,
    markets,
    removalArms,
    retirementRule: RETIREMENT_RULE,
    retirementRuleHash: RETIREMENT_RULE_HASH,
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
  if (parsed.retirementRule !== RETIREMENT_RULE || parsed.retirementRuleHash !== RETIREMENT_RULE_HASH) {
    refuse(`${path} applied a different retirement rule (retirementRuleHash ${String(parsed.retirementRuleHash)}); the read consumes RETIREMENT_RULE only`);
  }
  if (typeof parsed.frozenHash !== "string" || frozenHashOf(parsed) !== parsed.frozenHash) {
    refuse(`${path}: frozenHash does not match its content; the file was altered after it was frozen`);
  }
  return parsed;
}

const VALUE_FLAGS = new Set(["--arms", "--class-arms", "--out", "--removal-arms"]);

function parseArgs(argv: readonly string[]): { arms: Array<{ arm: string; path: string }>; classArms: ClassArmSpec[]; out: string; removalArms: string[] } {
  for (let index = 0; index < argv.length; index += 1) {
    // The walker consumes the following token only for a flag VALUE_FLAGS
    // declares; any other flag, and any positional token, is refused by name.
    if (VALUE_FLAGS.has(argv[index])) {
      index += 1;
      continue;
    }
    if (argv[index].startsWith("--")) refuse(`unknown flag ${argv[index]}; this command takes --arms, --class-arms, --removal-arms and --out only`);
    refuse(`unexpected argument ${argv[index]}; this command takes --arms "<name>=<grading.json>;…" and --out <path> only`);
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
  const removalArms = (str("--removal-arms") ?? "").split(",").map((name) => name.trim()).filter((name) => name.length > 0);
  const classSpec = str("--class-arms");
  const classArms = classSpec === undefined ? [] : parseClassArms(classSpec);
  return { arms, classArms, out, removalArms };
}

async function main(): Promise<void> {
  const { arms, classArms, out, removalArms } = parseArgs(process.argv.slice(2));
  const frozen = await freezeCandidates(arms, { classArms, removalArms });
  writeResearchArtifact(out, frozen as unknown as Record<string, unknown>);
  const symbols = Object.keys(frozen.markets);
  const candidates = symbols.filter((symbol) => frozen.markets[symbol].candidate !== null).length;
  const declines = symbols.filter((symbol) => frozen.markets[symbol].declineCandidate).length;
  const retired = symbols.filter((symbol) => frozen.markets[symbol].retirement?.retired).length;
  console.log(
    `frozen: ${frozen.arms.length} arm${frozen.arms.length === 1 ? "" : "s"}, ${symbols.length} markets, ` +
      `${candidates} candidate${candidates === 1 ? "" : "s"}, ${declines} decline candidate${declines === 1 ? "" : "s"}` +
      (removalArms.length > 0 ? ` (${retired} retired by ${removalArms.join("+")}), ` : ", ") +
      (frozen.classes ? `${Object.values(frozen.classes).reduce((n, byAxis) => n + Object.values(byAxis).filter((c) => c !== null).length, 0)} class candidates over ${frozen.classAxes!.length} axes (${frozen.classCellsTested} class cells, ${frozen.expectedFalseAcceptsClasses} expected by chance), ` : "") +
      `${frozen.expectedFalseAccepts} expected false accepts at p 0.05 ` +
      `-> ${out} (frozenHash ${frozen.frozenHash.slice(0, 12)})`,
  );
}

if (process.argv[1] !== undefined && /freeze-candidates\.ts$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
