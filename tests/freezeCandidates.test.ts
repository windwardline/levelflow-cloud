import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  chooseCandidate,
  FREEZE_RULE,
  freezeCandidates,
  loadGradingArtifact,
  parseClassArms,
  RETIREMENT_RULE,
  retirementOf,
  verifyFrozenCandidates,
} from "../scripts/freeze-candidates.ts";
import { sha256File } from "../scripts/ledgeredRead.ts";

/**
 * R4 act 3 — the freeze. Every arm is graded on the tuning folds and its
 * accepted variants are frozen, per market, into one hashed artifact BEFORE
 * the program's one read; the read consumes that file and nothing else. The
 * freeze binds each arm's grading artifact by its bytes, refuses a grading
 * that opened the confirm fold, and refuses arms that do not share the
 * anchor, engine, calendar and holdout the rule assumes.
 */

const CAL = "c".repeat(64);

type Variant = {
  accepted: boolean;
  fitTotalDelta: number | null;
  pairedP: number | null;
  reason: string;
  selectExpectancy: number | null;
  selectExpectancyDelta: number | null;
  selectTotalDelta: number | null;
};

function variant(accepted: boolean, fitTotalDelta: number, pairedP = 0.01): Variant & { select: { gross: null; net: { expectancy: number; lower: number; n: number; upper: number } } } {
  return {
    accepted,
    fitTotalDelta,
    pairedP,
    reason: accepted ? "accepted" : "fails",
    select: { gross: null, net: { expectancy: 0.01, lower: -0.02, n: 80, upper: 0.04 } },
    selectExpectancy: 0.01,
    selectExpectancyDelta: 0.005,
    selectTotalDelta: fitTotalDelta / 2,
  };
}
const SHIPPED_SELECT = { gross: null, net: { expectancy: -0.05, lower: -0.09, n: 100, upper: -0.01 } };

function grading(overrides: Record<string, unknown> = {}, markets?: Record<string, unknown>) {
  return {
    analyzerVersion: "2026.09.01.test",
    anchor: "2026-08-26",
    calendarHash: CAL,
    corpusNote: "confirm fold sealed — not read; every figure here is a fit/select figure",
    derivedAt: "2026-09-03T00:00:00.000Z",
    foldSource: "emitted",
    heldOut: ["CCC"],
    holdoutRule: "stratified-per-class-20pct",
    markets: markets ?? {
      AAA: { heldOut: false, shipped: { declineCandidate: false, select: SHIPPED_SELECT, variant: "baseline" }, variants: { "x=1": variant(true, 10), "x=2": variant(false, 40) } },
      BBB: { heldOut: false, shipped: { declineCandidate: false, select: SHIPPED_SELECT, variant: "baseline" }, variants: { "x=1": variant(false, 5) } },
      CCC: { heldOut: true, shipped: { declineCandidate: true, select: SHIPPED_SELECT, variant: "baseline" }, variants: { "x=1": variant(true, 3) } },
    },
    rules: { accept: "accepted iff beatsBaseline && earnsMoney", decline: "net AND gross" },
    shardHashes: ["a".repeat(64)],
    shards: ["docs/research/r4/arm.jsonl"],
    verdictUnit: "market",
    ...overrides,
  };
}

function write(dir: string, name: string, body: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(body, null, 2) + "\n");
  return path;
}

describe("the freeze binds every arm and chooses one candidate per market", () => {
  it("takes the largest fit ΔR across arms, carries the labels, and its hash verifies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const arm1 = write(dir, "s.json", grading({ shardHashes: ["1".repeat(64)] }));
    const arm2 = write(dir, "w.json", grading({ shardHashes: ["2".repeat(64)] }, {
      AAA: { heldOut: false, shipped: { declineCandidate: false, select: SHIPPED_SELECT, variant: "baseline" }, variants: { "y=3": variant(true, 25) } },
      CCC: { heldOut: true, shipped: { declineCandidate: true, select: SHIPPED_SELECT, variant: "baseline" }, variants: { "y=3": variant(false, 1) } },
      DDD: { heldOut: false, shipped: { declineCandidate: true, select: SHIPPED_SELECT, variant: "baseline" }, variants: { "y=3": variant(true, 7) } },
    }));
    const frozen = await freezeCandidates([{ arm: "S", path: arm1 }, { arm: "W", path: arm2 }], { now: new Date("2026-09-03T05:00:00Z") });
    assert.equal(frozen.rule, FREEZE_RULE);
    assert.deepEqual(frozen.arms.map((arm) => arm.arm), ["S", "W"]);
    assert.equal(frozen.arms[0].artifactSha256, await sha256File(arm1));
    assert.equal(frozen.arms[1].artifactSha256, await sha256File(arm2));
    assert.deepEqual(frozen.arms[1].shardHashes, ["2".repeat(64)]);
    assert.deepEqual(frozen.heldOut, ["CCC"]);
    assert.deepEqual(Object.keys(frozen.markets), ["AAA", "BBB", "CCC", "DDD"]);
    assert.deepEqual(frozen.markets.AAA, {
      acceptedCount: 2,
      candidate: { arm: "W", fitTotalDelta: 25, pairedP: 0.01, selectExpectancyDelta: 0.005, selectTotalDelta: 12.5, variant: "y=3" },
      cellsTested: 3,
      declineCandidate: false,
      heldOut: false,
      retirement: null,
    });
    // 3 (AAA) + 1 (BBB) + 2 (CCC) + 1 (DDD) cells across both arms, at the gate's own p.
    assert.equal(frozen.expectedFalseAccepts, 0.35);
    assert.equal(frozen.markets.BBB.candidate, null);
    assert.equal(frozen.markets.BBB.acceptedCount, 0);
    assert.equal(frozen.markets.CCC.heldOut, true);
    assert.equal(frozen.markets.CCC.candidate?.arm, "S");
    assert.equal(frozen.markets.DDD.declineCandidate, true);
    assert.equal(frozen.markets.DDD.candidate?.variant, "y=3");
    assert.match(frozen.frozenHash, /^[0-9a-f]{64}$/);
    const out = write(dir, "frozen.json", frozen);
    assert.equal(verifyFrozenCandidates(out).frozenHash, frozen.frozenHash);
  });

  it("breaks a fit ΔR tie by the smaller paired p, then the arm name", () => {
    assert.equal(chooseCandidate([
      { arm: "W", variant: "b", fitTotalDelta: 5, pairedP: 0.02, selectExpectancyDelta: 0, selectTotalDelta: 0 },
      { arm: "S", variant: "a", fitTotalDelta: 5, pairedP: 0.01, selectExpectancyDelta: 0, selectTotalDelta: 0 },
    ])?.variant, "a");
    assert.equal(chooseCandidate([
      { arm: "W", variant: "b", fitTotalDelta: 5, pairedP: 0.01, selectExpectancyDelta: 0, selectTotalDelta: 0 },
      { arm: "S", variant: "a", fitTotalDelta: 5, pairedP: 0.01, selectExpectancyDelta: 0, selectTotalDelta: 0 },
    ])?.arm, "S");
    assert.equal(chooseCandidate([]), null);
  });
});

describe("the retirement rule (amendment 36's removals), pre-registered and mechanical", () => {
  const fig = (expectancy: number, lower: number, upper: number, n: number) => ({ expectancy, lower, n, upper });
  const shippedN = 100;

  it("retires a candidate when a removal-arm cell with the sample floor lifts the net OR the gross upper bound to zero", () => {
    const retired = retirementOf(shippedN, [
      { arm: "S", variant: "cap=8", select: { gross: fig(-0.02, -0.05, 0.01, 80), net: fig(-0.05, -0.09, -0.01, 80) } },
      { arm: "S", variant: "cap=4", select: { gross: fig(-0.05, -0.09, -0.01, 80), net: fig(-0.06, -0.10, -0.02, 80) } },
      { arm: "W", variant: "w=96", select: { gross: fig(-0.05, -0.09, -0.01, 90), net: fig(-0.02, -0.05, 0.02, 90) } },
    ]);
    assert.equal(retired.retired, true);
    assert.equal(retired.testedCells, 3);
    assert.deepEqual(retired.retiringCells.map((cell) => cell.variant), ["cap=8", "w=96"]);
    assert.equal(retired.fragile, false);
  });

  it("does not count a cell below 30 filled or below half the shipped cell's fills, and labels one-of-k fragile", () => {
    const result = retirementOf(shippedN, [
      { arm: "S", variant: "starved", select: { gross: fig(0.5, 0.1, 0.9, 20), net: fig(0.5, 0.1, 0.9, 20) } },
      { arm: "S", variant: "thin", select: { gross: fig(0.5, 0.1, 0.9, 40), net: fig(0.5, 0.1, 0.9, 40) } },
      { arm: "S", variant: "cap=8", select: { gross: fig(-0.02, -0.05, 0.01, 80), net: fig(-0.05, -0.09, -0.01, 80) } },
      { arm: "W", variant: "w=48", select: { gross: fig(-0.05, -0.09, -0.01, 80), net: fig(-0.06, -0.10, -0.02, 80) } },
      { arm: "W", variant: "none", select: undefined },
    ]);
    assert.equal(result.testedCells, 2, "the starved, thin and figureless cells are not tests");
    assert.equal(result.retired, true);
    assert.equal(result.fragile, true, "one retiring cell of two tested");
    const held = retirementOf(shippedN, [
      { arm: "S", variant: "cap=8", select: { gross: fig(-0.05, -0.09, -0.01, 80), net: fig(-0.06, -0.10, -0.02, 80) } },
    ]);
    assert.equal(held.retired, false);
    assert.equal(held.fragile, false);
  });

  it("applies the rule only to decline candidates over the named removal arms, and refuses a removal arm it was not given", async () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const s = grading({ shardHashes: ["1".repeat(64)] }, {
      AAA: { heldOut: false, shipped: { declineCandidate: true, select: { gross: fig(-0.1, -0.2, -0.05, 100), net: fig(-0.1, -0.2, -0.05, 100) }, variant: "baseline" }, variants: { "cap=8": { ...variant(false, -3), select: { gross: fig(-0.02, -0.05, 0.01, 80), net: fig(-0.05, -0.09, -0.01, 80) } } } },
      BBB: { heldOut: false, shipped: { declineCandidate: false, select: { gross: null, net: fig(0.1, 0.05, 0.15, 100) }, variant: "baseline" }, variants: { "cap=8": { ...variant(false, -3), select: { gross: fig(0.1, 0.05, 0.15, 80), net: fig(0.1, 0.05, 0.15, 80) } } } },
    });
    const f = grading({ shardHashes: ["2".repeat(64)] }, {
      AAA: { heldOut: false, shipped: { declineCandidate: true, select: { gross: fig(-0.1, -0.2, -0.05, 100), net: fig(-0.1, -0.2, -0.05, 100) }, variant: "baseline" }, variants: { "floor=1.5": { ...variant(false, -3), select: { gross: fig(0.2, 0.1, 0.3, 80), net: fig(0.2, 0.1, 0.3, 80) } } } },
    });
    const frozen = await freezeCandidates([{ arm: "S", path: write(dir, "s.json", s) }, { arm: "F", path: write(dir, "f.json", f) }], { removalArms: ["S"] });
    assert.deepEqual(frozen.removalArms, ["S"]);
    assert.equal(frozen.retirementRule, RETIREMENT_RULE);
    assert.equal(frozen.markets.AAA.retirement!.retired, true, "the cap cell's gross upper bound reaches zero");
    assert.deepEqual(frozen.markets.AAA.retirement!.retiringCells.map((cell) => `${cell.arm}:${cell.variant}`), ["S:cap=8"], "the admission arm is not a removal arm, so its positive cell does not retire");
    assert.equal(frozen.markets.BBB.retirement, null, "not a decline candidate");
    await assert.rejects(freezeCandidates([{ arm: "S", path: write(dir, "s2.json", s) }], { removalArms: ["W"] }), /removal arm W/);
    const out = write(dir, "frozen.json", frozen);
    assert.equal(verifyFrozenCandidates(out).markets.AAA.retirement!.retired, true);
    const reruled = JSON.parse(JSON.stringify(frozen)) as typeof frozen;
    reruled.retirementRule = "net only";
    assert.throws(() => verifyFrozenCandidates(write(dir, "r2.json", reruled)), /retirement rule/);
  });
});

describe("the freeze refuses a grading it cannot reconcile or retire on", () => {
  it("refuses two arms bound to one corpus, a shipped cell without select figures, and a removal-arm cell without them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const same = write(dir, "same.json", grading({ shardHashes: ["9".repeat(64)] }));
    await assert.rejects(freezeCandidates([{ arm: "A", path: same }, { arm: "B", path: write(dir, "same2.json", grading({ shardHashes: ["9".repeat(64)] })) }]), /both bound to corpus/);
    const bare = grading();
    delete (bare.markets as Record<string, { shipped: Record<string, unknown> }>).AAA.shipped.select;
    await assert.rejects(freezeCandidates([{ arm: "S", path: write(dir, "bare.json", bare) }]), /no shipped-cell select figures/);
    const noFigures = grading();
    delete (noFigures.markets as Record<string, { variants: Record<string, Record<string, unknown>> }>).AAA.variants["x=1"].select;
    await assert.rejects(freezeCandidates([{ arm: "S", path: write(dir, "nofig.json", noFigures) }], { removalArms: ["S"] }), /carries no select figures/);
    const notRemoval = await freezeCandidates([{ arm: "F", path: write(dir, "nofig2.json", noFigures) }]);
    assert.equal(notRemoval.markets.AAA.acceptedCount, 1, "a non-removal arm's cell without figures is still a candidate");
  });

  it("carries each arm's emit digests so the read can bind the bytes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const digest = "e".repeat(64);
    const frozen = await freezeCandidates([{ arm: "S", path: write(dir, "s.json", grading({ emitSha256: { ["a".repeat(64)]: digest } })) }]);
    assert.deepEqual(frozen.arms[0].emitSha256, { ["a".repeat(64)]: digest });
  });
});

describe("the retirement rule's floors and labels, at their boundaries", () => {
  const fig = (upper: number, n: number) => ({ expectancy: upper - 0.05, lower: upper - 0.1, n, upper });
  it("counts a cell at exactly 30 filled and exactly half the shipped fills, not one below", () => {
    const at = retirementOf(60, [{ arm: "S", variant: "a", select: { gross: null, net: fig(0.01, 30) } }]);
    assert.equal(at.testedCells, 1); assert.equal(at.retired, true);
    const below30 = retirementOf(40, [{ arm: "S", variant: "a", select: { gross: null, net: fig(0.01, 29) } }]);
    assert.equal(below30.testedCells, 0); assert.equal(below30.retired, false);
    const belowHalf = retirementOf(100, [{ arm: "S", variant: "a", select: { gross: null, net: fig(0.01, 49) } }]);
    assert.equal(belowHalf.testedCells, 0);
    const half = retirementOf(100, [{ arm: "S", variant: "a", select: { gross: null, net: fig(0.01, 50) } }]);
    assert.equal(half.testedCells, 1);
  });
  it("labels a retirement resting on one cell fragile, whether one of k or the only cell tested", () => {
    const only = retirementOf(60, [{ arm: "S", variant: "a", select: { gross: null, net: fig(0.01, 40) } }]);
    assert.equal(only.retired, true); assert.equal(only.fragile, true);
    const two = retirementOf(60, [
      { arm: "S", variant: "a", select: { gross: null, net: fig(0.01, 40) } },
      { arm: "W", variant: "b", select: { gross: null, net: fig(0.02, 40) } },
    ]);
    assert.equal(two.retiringCells.length, 2); assert.equal(two.fragile, false);
  });
  it("applies the sample floor to the gross column when the gross clause fires", () => {
    const thinGross = retirementOf(60, [{ arm: "S", variant: "a", select: { gross: fig(0.05, 20), net: fig(-0.01, 40) } }]);
    assert.equal(thinGross.testedCells, 1); assert.equal(thinGross.retired, false, "a gross interval over 20 rows cannot retire");
    const fullGross = retirementOf(60, [{ arm: "S", variant: "a", select: { gross: fig(0.05, 40), net: fig(-0.01, 40) } }]);
    assert.equal(fullGross.retired, true);
  });
});

describe("the class grain (R4 act 3): one candidate per class per axis over the class gradings", () => {
  // The fixture symbols resolve to forex through getAssetType's fallback, so one class.
  const classGrading = (variants: Record<string, Variant>, overrides: Record<string, unknown> = {}) =>
    grading({ verdictUnit: "class", ...overrides }, {
      AAA: { heldOut: false, shipped: { declineCandidate: false, select: SHIPPED_SELECT, variant: "baseline" }, variants },
      BBB: { heldOut: false, shipped: { declineCandidate: false, select: SHIPPED_SELECT, variant: "baseline" }, variants },
    });

  it("parses axis:ARM=path[|prefix] lists and refuses malformed entries", () => {
    assert.deepEqual(parseClassArms("window:W=a.json,W96=b.json;admission:F=c.json|payoffFloor="), [
      { arm: "W", axis: "window", path: "a.json", prefix: null },
      { arm: "W96", axis: "window", path: "b.json", prefix: null },
      { arm: "F", axis: "admission", path: "c.json", prefix: "payoffFloor=" },
    ]);
    assert.throws(() => parseClassArms("W=a.json"), /axis entry needs a name/);
    assert.throws(() => parseClassArms("window:W"), /not <arm>=<class-grading.json>/);
    assert.throws(() => parseClassArms("window:W=a.json|"), /empty prefix/);
  });

  it("freezes the largest accepted fit ΔR per class per axis, filtered by prefix, with the pooled and held-out members", async () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const marketS = write(dir, "s.json", grading({ shardHashes: ["1".repeat(64)] }));
    const marketF = write(dir, "f.json", grading({ shardHashes: ["2".repeat(64)] }));
    const classS = write(dir, "s-class.json", classGrading({ "w=1": variant(true, 5), "w=2": variant(false, 40) }, { shardHashes: ["1".repeat(64)] }));
    const classF = write(dir, "f-class.json", classGrading({ "payoffFloor=1.5": variant(true, 3), "payoffFloor=1.6": variant(true, 2), "costShareMax=0.15": variant(true, 9), "costShareMax=0.2": variant(false, 12) }, { shardHashes: ["2".repeat(64)] }));
    const frozen = await freezeCandidates([{ arm: "S", path: marketS }, { arm: "F", path: marketF }], {
      classArms: [
        { arm: "S", axis: "window", path: classS, prefix: null },
        { arm: "F", axis: "payoffFloor", path: classF, prefix: "payoffFloor=" },
        { arm: "F", axis: "costShare", path: classF, prefix: "costShareMax=" },
      ],
    });
    assert.deepEqual(frozen.classAxes, [
      { arms: [{ arm: "S", prefix: null }], axis: "window" },
      { arms: [{ arm: "F", prefix: "payoffFloor=" }], axis: "payoffFloor" },
      { arms: [{ arm: "F", prefix: "costShareMax=" }], axis: "costShare" },
    ]);
    const forex = frozen.classes!.forex;
    assert.equal(forex.window!.variant, "w=1");
    assert.equal(forex.payoffFloor!.variant, "payoffFloor=1.5", "the prefix keeps the admission instruments apart");
    assert.equal(forex.costShare!.variant, "costShareMax=0.15");
    assert.deepEqual(forex.window!.members, ["AAA", "BBB"]);
    assert.deepEqual(forex.window!.heldOutMembers, ["CCC"], "the class's held-out member rides the same cell as the out-of-sample check");
    assert.equal(frozen.classCellsTested, 2 + 2 + 2);
    assert.equal(frozen.expectedFalseAcceptsClasses, 0.3);
    const out = write(dir, "frozen.json", frozen);
    assert.equal(verifyFrozenCandidates(out).classes!.forex.window!.variant, "w=1");
  });

  it("refuses a class arm that is not a market arm, one graded on another corpus, a market-unit grading named as class, and members whose blocks differ", async () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const marketS = write(dir, "s.json", grading({ shardHashes: ["1".repeat(64)] }));
    const classS = write(dir, "s-class.json", classGrading({ "w=1": variant(true, 5) }, { shardHashes: ["1".repeat(64)] }));
    await assert.rejects(freezeCandidates([{ arm: "S", path: marketS }], { classArms: [{ arm: "W", axis: "window", path: classS, prefix: null }] }), /not among the market arms/);
    const otherCorpus = write(dir, "s-class2.json", classGrading({ "w=1": variant(true, 5) }, { shardHashes: ["7".repeat(64)] }));
    await assert.rejects(freezeCandidates([{ arm: "S", path: marketS }], { classArms: [{ arm: "S", axis: "window", path: otherCorpus, prefix: null }] }), /one arm is one corpus/);
    await assert.rejects(freezeCandidates([{ arm: "S", path: marketS }], { classArms: [{ arm: "S", axis: "window", path: marketS, prefix: null }] }), /named as a class-unit grading/);
    const uneven = classGrading({ "w=1": variant(true, 5) }, { shardHashes: ["1".repeat(64)] });
    (uneven.markets as Record<string, { variants: Record<string, Variant> }>).BBB.variants = { "w=1": variant(false, 5) };
    await assert.rejects(freezeCandidates([{ arm: "S", path: marketS }], { classArms: [{ arm: "S", axis: "window", path: write(dir, "uneven.json", uneven), prefix: null }] }), /differs from its class's/);
  });

  it("names the class candidates in the command's summary", () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const marketS = write(dir, "s.json", grading({ shardHashes: ["1".repeat(64)] }));
    const classS = write(dir, "s-class.json", classGrading({ "w=1": variant(true, 5) }, { shardHashes: ["1".repeat(64)] }));
    const result = spawnSync(process.execPath, ["./node_modules/.bin/tsx", "scripts/freeze-candidates.ts", "--arms", `S=${marketS}`, "--class-arms", `window:S=${classS}`, "--out", join(dir, "frozen.json")], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 class candidates over 1 axes/);
  });
});

describe("the freeze refuses what it must not consume", () => {
  it("refuses a grading that carries a confirm figure, by name", () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const path = write(dir, "read.json", grading({}, {
      AAA: { heldOut: false, shipped: { confirm: { gross: null, net: { expectancy: 0.1, lower: 0, n: 40, upper: 0.2 } }, declineCandidate: false, variant: "baseline" }, variants: {} },
    }));
    assert.throws(() => loadGradingArtifact(path), /confirm/);
    const withRead = write(dir, "read2.json", grading({ read: { readId: "x" } }));
    assert.throws(() => loadGradingArtifact(withRead), /read/);
  });

  it("refuses a grading that is not the market unit on emitted folds, or is condemned", () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    assert.throws(() => loadGradingArtifact(write(dir, "c.json", grading({ verdictUnit: "class" }))), /verdictUnit/);
    assert.throws(() => loadGradingArtifact(write(dir, "f.json", grading({ foldSource: "recut" }))), /foldSource/);
    assert.throws(() => loadGradingArtifact(write(dir, "i.json", grading({ INVALID: "superseded" }))), /INVALID/);
  });

  it("refuses arms that disagree on the calendar, the anchor, the holdout, or a shipped cell's candidacy", async () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const base = write(dir, "a.json", grading());
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "W", path: write(dir, "b.json", grading({ calendarHash: "d".repeat(64), shardHashes: ["2".repeat(64)] })) }]), /calendarHash/);
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "W", path: write(dir, "c.json", grading({ anchor: "2026-08-27", shardHashes: ["2".repeat(64)] })) }]), /anchor/);
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "W", path: write(dir, "d.json", grading({ heldOut: ["AAA"], shardHashes: ["2".repeat(64)] })) }]), /heldOut/);
    const flipped = grading({ shardHashes: ["2".repeat(64)] });
    (flipped.markets as Record<string, { shipped: { declineCandidate: boolean } }>).AAA.shipped.declineCandidate = true;
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "W", path: write(dir, "e.json", flipped) }]), /declineCandidate/);
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "S", path: base }]), /twice/);
    const otherBaseline = grading({ shardHashes: ["3".repeat(64)] });
    (otherBaseline.markets as Record<string, { shipped: Record<string, unknown> }>).AAA.shipped.select = { net: { expectancy: 0.5, lower: 0.1, n: 99, upper: 0.9 }, gross: null };
    const withSelect = grading({ shardHashes: ["4".repeat(64)] });
    (withSelect.markets as Record<string, { shipped: Record<string, unknown> }>).AAA.shipped.select = { net: { expectancy: -0.5, lower: -0.9, n: 99, upper: -0.1 }, gross: null };
    await assert.rejects(freezeCandidates([{ arm: "S", path: write(dir, "s1.json", withSelect) }, { arm: "W", path: write(dir, "s2.json", otherBaseline) }]), /baselines are not the same rows/);
    await assert.rejects(freezeCandidates([]), /no arm/);
  });

  it("refuses a frozen file that was tampered with or re-ruled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const frozen = await freezeCandidates([{ arm: "S", path: write(dir, "a.json", grading()) }]);
    const tampered = JSON.parse(JSON.stringify(frozen)) as typeof frozen;
    tampered.markets.BBB.candidate = tampered.markets.AAA.candidate;
    assert.throws(() => verifyFrozenCandidates(write(dir, "t.json", tampered)), /frozenHash/);
    const reruled = JSON.parse(JSON.stringify(frozen)) as typeof frozen;
    reruled.rule = "the largest select ΔR";
    reruled.ruleHash = "0".repeat(64);
    assert.throws(() => verifyFrozenCandidates(write(dir, "r.json", reruled)), /rule/);
  });
});

describe("the freeze command", () => {
  const run = (args: string[]) =>
    spawnSync(process.execPath, ["./node_modules/.bin/tsx", "scripts/freeze-candidates.ts", ...args], { cwd: process.cwd(), encoding: "utf8" });

  it("refuses an unknown flag by name and a missing --out", () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const path = write(dir, "a.json", grading());
    const unknown = run(["--arms", `S=${path}`, "--out", join(dir, "f.json"), "--confirm-final"]);
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /--confirm-final/);
    const noOut = run(["--arms", `S=${path}`]);
    assert.notEqual(noOut.status, 0);
    assert.match(noOut.stderr, /--out/);
  });

  it("writes the frozen file and says what it froze", () => {
    const dir = mkdtempSync(join(tmpdir(), "freeze-"));
    const path = write(dir, "a.json", grading());
    const out = join(dir, "frozen.json");
    const result = run(["--arms", `S=${path}`, "--out", out]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 arm.*3 markets.*2 candidates.*1 decline candidate.*expected false accepts/s);
    const withRemoval = run(["--arms", `S=${path}`, "--removal-arms", "S", "--out", join(dir, "frozen2.json")]);
    assert.equal(withRemoval.status, 0, withRemoval.stderr);
    assert.match(withRemoval.stdout, /retired by S/);
    const body = JSON.parse(readFileSync(out, "utf8")) as { frozenHash: string };
    assert.equal(verifyFrozenCandidates(out).frozenHash, body.frozenHash);
  });
});
