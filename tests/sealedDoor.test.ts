import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSweepManifest, seriesFacts } from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import {
  assertManifestedCorpus,
  assertManifestedCorpusStreaming,
  assertManifestedCorpusSync,
  SEALED_FOLD,
  tuningFolds,
} from "../scripts/sweepStats.ts";

/**
 * THE DOOR IS SEALED BY DEFAULT (R4 act 1, 2026-09-02).
 *
 * The confirm fold is the held-back fold whose ONE authorized read is
 * grid-totalr's gradeCorpus under confirmFinal, recorded in the LA-6 ledger.
 * On 2026-09-02 an audit found twelve readers pooling or printing figures
 * over that fold with no opt-in and no ledger line — each had walked through
 * the door and taken every row it was handed. So the door no longer hands
 * them out: a reader that wants confirm rows says so, and the only reader
 * that may say so is the one that writes the ledger.
 */

const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2025, 0, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 8, 1);
const HOUR = 3_600_000;

type Row = Record<string, unknown>;

function rowsFor(splits: string[]): Row[] {
  return splits.map((split, index) => ({
    accepted: true,
    outcome: index % 2 === 0 ? "take_profit" : "stop_loss",
    realizedR: index % 2 === 0 ? 0.8 : -1,
    split,
    symbol: "EURUSD",
    time: (split === "fit" ? FIT_START : split === "select" ? SELECT_START : CONFIRM_START) + index * HOUR,
    variant: "baseline",
  }));
}

// Every fixture directory is removed when the process exits: sixty of them
// were found lingering in the temp folder after the first runs (2026-09-02).
const fixtureDirs: string[] = [];
const removeFixtures = () => {
  for (const dir of fixtureDirs) rmSync(dir, { force: true, recursive: true });
};
process.on("exit", removeFixtures);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    removeFixtures();
    process.exit(signal === "SIGTERM" ? 143 : 130);
  });
}

function corpus(rows: Row[], shape: "folded" | "legacy"): string {
  const dir = mkdtempSync(join(tmpdir(), "sealed-door-"));
  fixtureDirs.push(dir);
  const emitPath = join(dir, "shard.jsonl");
  writeFileSync(emitPath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const manifest = buildSweepManifest({
    acceptance: { captureAll: false, ignoreLowEdge: false },
    analyzerVersion: "2026.09.02.test",
    anchor: "2026-08-26",
    barRejections: {},
    clock: { calendar: ECON_CALENDAR_CLOCK, normalizer: BAR_CLOCK },
    conditions: {
      availableTimeframeCount: "min-four-by-construction",
      macroAdjustment: "historical-treasury-curve",
      providerWarningCount: "zero-by-construction",
      spreadSource: "modeled-by-construction",
      weightAdjustment: "raw-engine-zero",
    },
    days: 7000,
    ...(shape === "folded" && {
      folds: [
        { decisionEndMs: SELECT_START - 5 * 86_400_000, endMs: SELECT_START, name: "fit", startMs: FIT_START },
        { decisionEndMs: CONFIRM_START - 5 * 86_400_000, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
        { decisionEndMs: END - 5 * 86_400_000, endMs: END, name: SEALED_FOLD, startMs: CONFIRM_START },
      ],
    }),
    generatedAt: "2026-09-02T20:00:00.000Z",
    grid: [{}],
    stepBars: 16,
    symbols: [{
      calibration: {},
      providerSymbol: "EURUSD",
      series: { "15min": seriesFacts(rows.map((row) => ({ time: Number(row.time) })), "intraday") },
      symbol: "EURUSD",
    }],
    trainShare: 0.6,
    treasuryCurve: { count: 3_000, firstTime: Date.UTC(2013, 0, 2), largestGapMs: 4 * 86_400_000, lastTime: Date.UTC(2027, 0, 1) },
    warmupBars: 240,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return emitPath;
}

describe("tuningFolds names the folds a reader may tune on", () => {
  it("is fit and select on a folded corpus, and never confirm", () => {
    const { manifest } = assertManifestedCorpus(corpus(rowsFor(["fit"]), "folded"));
    assert.deepEqual(tuningFolds(manifest), { fit: "fit", select: "select" });
  });

  it("is train and test on a legacy two-split corpus — one law for both shapes", () => {
    const { manifest } = assertManifestedCorpus(corpus(rowsFor(["train"]), "legacy"));
    assert.deepEqual(tuningFolds(manifest), { fit: "train", select: "test" });
  });

  it("names the sealed fold once, where every reader can cite it", () => {
    assert.equal(SEALED_FOLD, "confirm");
  });
});

describe("the streaming door seals the confirm fold by default", () => {
  const rows = rowsFor(["fit", "select", "confirm", "confirm", "select"]);

  it("hands a reader fit and select rows only, and says how many it withheld", async () => {
    const seen: string[] = [];
    const path = corpus(rows, "folded");
    const manifest = await assertManifestedCorpusStreaming(path, (row) => seen.push(String(row.split)));
    assert.deepEqual(seen, ["fit", "select", "select"]);
    assert.equal(manifest.sealedRows, 2);
  });

  it("hands every row to the one reader that says it may read confirm", async () => {
    const seen: string[] = [];
    const manifest = await assertManifestedCorpusStreaming(corpus(rows, "folded"), (row) => seen.push(String(row.split)), { confirm: "read" });
    assert.deepEqual(seen, ["fit", "select", "confirm", "confirm", "select"]);
    assert.equal(manifest.sealedRows, 0);
  });

  it("refuses an option that is neither sealed nor read", async () => {
    await assert.rejects(
      assertManifestedCorpusStreaming(corpus(rows, "folded"), () => {}, { confirm: "peek" as never }),
      /confirm must be "sealed" or "read"/,
    );
  });

  it("seals nothing on a legacy corpus, which has no confirm fold to seal", async () => {
    const seen: string[] = [];
    const legacy = rowsFor(["train", "test", "test"]);
    const manifest = await assertManifestedCorpusStreaming(corpus(legacy, "legacy"), (row) => seen.push(String(row.split)));
    assert.deepEqual(seen, ["train", "test", "test"]);
    assert.equal(manifest.sealedRows, 0);
  });
});

describe("the array and sync doors seal the same way", () => {
  const rows = rowsFor(["fit", "confirm", "select"]);

  it("assertManifestedCorpus withholds confirm rows unless told to read them", () => {
    const sealed = assertManifestedCorpus(corpus(rows, "folded"));
    assert.deepEqual(sealed.rows.map((row) => row.split), ["fit", "select"]);
    assert.equal(sealed.manifest.sealedRows, 1);
    const open = assertManifestedCorpus(corpus(rows, "folded"), { confirm: "read" });
    assert.equal(open.rows.length, 3);
  });

  it("assertManifestedCorpusSync streams synchronously through the same seal", () => {
    const seen: string[] = [];
    const manifest = assertManifestedCorpusSync(corpus(rows, "folded"), (row) => seen.push(String(row.split)));
    assert.deepEqual(seen, ["fit", "select"]);
    assert.equal(manifest.sealedRows, 1);
    // A holed line refuses the whole corpus, in the sync form as in the
    // streaming one: the same sentence, the same line number.
    const holed = corpus(rows, "folded");
    writeFileSync(holed, readFileSync(holed, "utf8") + "{not json\n");
    assert.throws(
      () => assertManifestedCorpusSync(holed, () => {}),
      /line 4 failed to parse — a holed corpus is refused, not shrunk/,
    );
  });
});

describe("the three doors read the same rows across a 64 KB chunk edge", () => {
  // The sync reader decodes 65,536-byte chunks; a multi-byte character
  // straddling a chunk edge must not be split into replacement characters
  // (a review found the sync and streaming doors disagreeing there,
  // 2026-09-02). String columns are ASCII enums today, so the exposure was
  // nil — and a door that is wrong at one byte offset is wrong.
  it("delivers a three-byte character whole when it straddles byte 65,536", async () => {
    const rowWith = (note: string): Row => ({
      accepted: true,
      note,
      outcome: "take_profit",
      realizedR: 0.8,
      split: "fit",
      symbol: "EURUSD",
      time: FIT_START,
      variant: "baseline",
    });
    // The em dash (3 bytes) must START at byte offset 65,535 of the line, so
    // the 65,536-byte chunk cut falls inside it — measured on the serialized
    // row, not guessed from the key order.
    const prefixBytes = Buffer.byteLength(JSON.stringify(rowWith("")).split('"note":"')[0] + '"note":"');
    const note = "a".repeat(65_535 - prefixBytes) + "\u2014bb";
    const rows: Row[] = [rowWith(note), ...rowsFor(["fit", "select"])];
    assert.equal(Buffer.from(JSON.stringify(rows[0])).indexOf(Buffer.from("\u2014")), 65_535, "the dash must straddle the cut");
    const path = corpus(rows, "folded");
    const streamed: string[] = [];
    await assertManifestedCorpusStreaming(path, (row) => streamed.push(String(row.note ?? "")));
    const synced: string[] = [];
    assertManifestedCorpusSync(path, (row) => synced.push(String(row.note ?? "")));
    assert.match(streamed[0], /\u2014bb$/);
    assert.deepEqual(synced, streamed);
    assert.deepEqual(assertManifestedCorpus(path).rows.map((row) => String(row.note ?? "")), streamed);
  });
});
