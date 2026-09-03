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

function variant(accepted: boolean, fitTotalDelta: number, pairedP = 0.01): Variant {
  return {
    accepted,
    fitTotalDelta,
    pairedP,
    reason: accepted ? "accepted" : "fails",
    selectExpectancy: 0.01,
    selectExpectancyDelta: 0.005,
    selectTotalDelta: fitTotalDelta / 2,
  };
}

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
      AAA: { heldOut: false, shipped: { declineCandidate: false, variant: "baseline" }, variants: { "x=1": variant(true, 10), "x=2": variant(false, 40) } },
      BBB: { heldOut: false, shipped: { declineCandidate: false, variant: "baseline" }, variants: { "x=1": variant(false, 5) } },
      CCC: { heldOut: true, shipped: { declineCandidate: true, variant: "baseline" }, variants: { "x=1": variant(true, 3) } },
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
      AAA: { heldOut: false, shipped: { declineCandidate: false, variant: "baseline" }, variants: { "y=3": variant(true, 25) } },
      CCC: { heldOut: true, shipped: { declineCandidate: true, variant: "baseline" }, variants: { "y=3": variant(false, 1) } },
      DDD: { heldOut: false, shipped: { declineCandidate: true, variant: "baseline" }, variants: { "y=3": variant(true, 7) } },
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
      declineCandidate: false,
      heldOut: false,
    });
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
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "W", path: write(dir, "b.json", grading({ calendarHash: "d".repeat(64) })) }]), /calendarHash/);
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "W", path: write(dir, "c.json", grading({ anchor: "2026-08-27" })) }]), /anchor/);
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "W", path: write(dir, "d.json", grading({ heldOut: ["AAA"] })) }]), /heldOut/);
    const flipped = grading();
    (flipped.markets as Record<string, { shipped: { declineCandidate: boolean } }>).AAA.shipped.declineCandidate = true;
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "W", path: write(dir, "e.json", flipped) }]), /declineCandidate/);
    await assert.rejects(freezeCandidates([{ arm: "S", path: base }, { arm: "S", path: base }]), /twice/);
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
    assert.match(result.stdout, /1 arm.*3 markets.*2 candidates.*1 decline candidate/s);
    const body = JSON.parse(readFileSync(out, "utf8")) as { frozenHash: string };
    assert.equal(verifyFrozenCandidates(out).frozenHash, body.frozenHash);
  });
});
