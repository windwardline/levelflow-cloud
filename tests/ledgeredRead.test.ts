import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ACCEPT_RULE,
  ADMISSIBILITY_RULE,
  artifactHashOf,
  DECLINE_RULE,
  DECLINE_RULE_HASH,
  declineCandidateOf,
  type Figure,
  type LedgeredReadArtifact,
  m3Of,
  readLedgeredArtifact,
  stableJson,
  deltaOutcomeOf,
  DELTA_RULE,
  DELTA_RULE_HASH,
} from "../scripts/ledgeredRead.ts";

/**
 * The ledgered-read artifact is the ONE place a confirm figure may be read
 * from by anything that is not the gate (R4 act 2). This pins the contract:
 * the pre-registered rules applied mechanically, and the consumer's door
 * refusing by name a condemned, foreign, tampered or re-ruled artifact.
 */

const figure = (n: number, expectancy: number, halfWidth: number): Figure => ({
  n,
  expectancy,
  lower: expectancy - halfWidth,
  upper: expectancy + halfWidth,
});

function artifact(overrides: Partial<LedgeredReadArtifact> = {}): LedgeredReadArtifact {
  const base: Omit<LedgeredReadArtifact, "artifactHash"> = {
    analyzerVersion: "2026.09.02.test",
    anchor: "2026-08-26",
    baselineVariant: "baseline",
    calendarHash: "c".repeat(64),
    corpusId: "d".repeat(64),
    emitSha256: { ["b".repeat(64)]: "e".repeat(64) },
    foldSource: "emitted",
    holdout: { rule: "stratified-per-class-20pct", markets: ["EURUSD"] },
    includeHoldout: true,
    ledgerPath: "docs/research/confirm-reads/confirm-log-test.jsonl",
    markets: {
      EURUSD: {
        accepted: [],
        heldOut: true,
        shipped: {
          confirm: { gross: figure(40, 0.05, 0.02), net: figure(40, 0.02, 0.02) },
          declineCandidate: false,
          m3: "indistinguishable",
          provenance: { derived: false, heldBack: true, known: true, overlapWithConfirmDays: 0, selectionWindow: null, tranche: null },
          select: { gross: figure(60, 0.03, 0.01), net: figure(60, 0.01, 0.01) },
          variant: "baseline",
        },
      },
    },
    readAt: "2026-09-02T22:00:00.000Z",
    readId: "read-1",
    rules: { accept: ACCEPT_RULE, admissibility: ADMISSIBILITY_RULE, decline: DECLINE_RULE, declineHash: DECLINE_RULE_HASH },
    shardHashes: ["a".repeat(64), "b".repeat(64)],
    symbolFilter: null,
    symbolsRead: ["EURUSD"],
    verdictUnit: "market",
    ...overrides,
  };
  return { ...base, artifactHash: artifactHashOf(base) } as LedgeredReadArtifact;
}

const dirs: string[] = [];
process.on("exit", () => {
  for (const dir of dirs) rmSync(dir, { force: true, recursive: true });
});
function written(value: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "ledgered-read-"));
  dirs.push(dir);
  const path = join(dir, "read.json");
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

describe("stable JSON and the artifact's own hash", () => {
  it("orders keys at every depth and drops undefined, so a hash is a hash of content", () => {
    assert.equal(stableJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } }), '{"a":{"d":[2,{"y":2,"z":1}]},"b":1}');
  });

  it("hashes the artifact with its own hash absent, and the hash survives a round trip", () => {
    const value = artifact();
    assert.equal(artifactHashOf(value), value.artifactHash);
    const reparsed = JSON.parse(JSON.stringify(value)) as LedgeredReadArtifact;
    assert.equal(artifactHashOf(reparsed), value.artifactHash);
  });
});

describe("the pre-registered rules apply mechanically", () => {
  it("names a decline candidate only when NET and GROSS select upper bounds are both negative at 30 filled", () => {
    assert.equal(declineCandidateOf({ gross: figure(30, -0.2, 0.1), net: figure(30, -0.3, 0.1) }), true);
    assert.equal(declineCandidateOf({ gross: figure(30, 0.02, 0.1), net: figure(30, -0.3, 0.1) }), false, "gross clears zero: a cost defect, not a market");
    assert.equal(declineCandidateOf({ gross: figure(29, -0.2, 0.1), net: figure(29, -0.3, 0.1) }), false, "under the floor");
    assert.equal(declineCandidateOf({ gross: null, net: figure(30, -0.3, 0.1) }), false);
  });

  it("reports M3's outcomes against the confirm figure; for a cell not held back only a negative is admissible", () => {
    assert.equal(m3Of(figure(40, -0.3, 0.1), true), "confirmed-negative");
    assert.equal(m3Of(figure(40, 0.3, 0.1), true), "confirmed-profitable");
    assert.equal(m3Of(figure(40, 0.05, 0.1), true), "indistinguishable");
    assert.equal(m3Of(figure(20, 0.3, 0.1), true), "unreadable");
    assert.equal(m3Of(null, true), "unreadable");
    // Not held back: a positive or indistinguishable figure is the winner's
    // curse and reads not-held-back; a negative contradicts the prior read.
    assert.equal(m3Of(figure(400, 0.3, 0.01), false), "not-held-back");
    assert.equal(m3Of(figure(400, 0.0, 0.05), false), "not-held-back");
    assert.equal(m3Of(figure(40, -0.3, 0.1), false), "confirmed-negative");
    assert.equal(m3Of(figure(20, -0.3, 0.1), false), "not-held-back", "under the floor nothing is admissible");
    assert.match(ADMISSIBILITY_RULE, /only a confirmed-negative confirm figure/);
  });

  it("the decline rule's hash is the hash of its text, so a rewording is a re-registration", () => {
    assert.equal(DECLINE_RULE_HASH.length, 64);
    assert.match(DECLINE_RULE, /GROSS expectancy 95% upper bound < 0/);
  });
});

describe("the consumer's door", () => {
  it("opens a sound artifact for the corpus it was read from", () => {
    const value = artifact();
    const opened = readLedgeredArtifact(written(value), { manifestHash: "b".repeat(64) });
    assert.equal(opened.markets.EURUSD.shipped.m3, "indistinguishable");
  });

  it("refuses a condemned artifact by its banner", () => {
    assert.throws(
      () => readLedgeredArtifact(written({ ...artifact(), INVALID: "clock defect" }), { manifestHash: "b".repeat(64) }),
      /condemned — "clock defect"/,
    );
  });

  it("refuses an artifact written from a different corpus", () => {
    assert.throws(
      () => readLedgeredArtifact(written(artifact()), { manifestHash: "f".repeat(64) }),
      /written from a different corpus/,
    );
  });

  it("refuses an artifact edited after the read", () => {
    const value = artifact();
    value.markets.EURUSD.shipped.m3 = "confirmed-profitable";
    assert.throws(() => readLedgeredArtifact(written(value), { manifestHash: "b".repeat(64) }), /does not match its content/);
  });

  it("refuses a read taken under another decline rule", () => {
    const value = artifact({ rules: { accept: ACCEPT_RULE, admissibility: ADMISSIBILITY_RULE, decline: "another rule", declineHash: "0".repeat(64) } });
    assert.throws(() => readLedgeredArtifact(written(value), { manifestHash: "b".repeat(64) }), /another rule|is not this program's figure/);
  });

  it("checks the consumer's emit bytes under the shard's manifest hash: a match opens, a mismatch refuses", () => {
    const opened = readLedgeredArtifact(written(artifact()), { emitSha256: "e".repeat(64), manifestHash: "b".repeat(64) });
    assert.equal(opened.readId, "read-1");
    assert.throws(
      () => readLedgeredArtifact(written(artifact()), { emitSha256: "9".repeat(64), manifestHash: "b".repeat(64) }),
      /not the same bytes/,
    );
  });

  it("refuses an artifact missing a labelling field", () => {
    const { calendarHash: _absent, ...rest } = artifact();
    assert.throws(() => readLedgeredArtifact(written(rest), { manifestHash: "b".repeat(64) }), /carries no calendarHash/);
  });
});

describe("DELTA_RULE (R4 act 3): the one figure a not-held-back candidate can earn", () => {
  it("reads both ends of the delta's interval at the 30-filled floor", () => {
    assert.equal(deltaOutcomeOf({ lower: 0.01, upper: 0.2 }, 40, 40), "confirmed");
    assert.equal(deltaOutcomeOf({ lower: -0.3, upper: -0.01 }, 40, 40), "contradicted");
    assert.equal(deltaOutcomeOf({ lower: -0.1, upper: 0.1 }, 40, 40), "indistinguishable");
    assert.equal(deltaOutcomeOf({ lower: 0.01, upper: 0.2 }, 29, 40), "unreadable", "the variant side is below the floor");
    assert.equal(deltaOutcomeOf({ lower: 0.01, upper: 0.2 }, 40, 29), "unreadable", "the baseline side is below the floor");
    assert.equal(deltaOutcomeOf(null, 40, 40), "unreadable");
    assert.equal(deltaOutcomeOf({ lower: 0, upper: 0.2 }, 40, 40), "indistinguishable", "a bound at zero is not above it");
  });
  it("is hashed, so a read under another rule refuses at the door", () => {
    assert.match(DELTA_RULE_HASH, /^[0-9a-f]{64}$/);
    assert.match(DELTA_RULE, /lower bound > 0/);
  });
});
