import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildSweepManifest,
  seriesFacts,
  sha256Hex,
  stableStringify,
} from "../scripts/sweepManifest.ts";
import { BAR_CLOCK } from "../supabase/functions/trade-analyzer/bars.ts";
import { ECON_CALENDAR_CLOCK } from "../scripts/clockWitness.ts";
import { rosterHashOf } from "../scripts/sweepFolds.ts";
import {
  formatSummary,
  parseFolds,
  SEALED_FOLD,
  summarizeTuningFolds,
} from "../scripts/tuning-folds-summary.ts";

/**
 * The confirm fold is sealed and this reader cannot open it. Every case here
 * plants confirm rows that would move a figure if they were read, and asserts
 * they did not; the refusals are executed, not read off the source.
 */

const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const READER = join(process.cwd(), "scripts", "tuning-folds-summary.ts");
const HOUR = 3_600_000;
const FIT_START = Date.UTC(2024, 0, 1);
const SELECT_START = Date.UTC(2025, 0, 1);
const CONFIRM_START = Date.UTC(2026, 0, 1);
const END = Date.UTC(2026, 8, 1);

type Row = Record<string, unknown>;

function row(input: {
  accepted?: boolean;
  holdout?: boolean;
  index: number;
  realizedR: number;
  split: string;
  symbol: string;
  variant?: string;
}): Row {
  const base = input.split === "fit"
    ? FIT_START
    : input.split === "select"
    ? SELECT_START
    : CONFIRM_START;
  const outcome = input.realizedR > 0
    ? "take_profit"
    : input.realizedR === 0
    ? "unfilled"
    : "stop_loss";
  return {
    accepted: input.accepted ?? true,
    grossOutcome: outcome,
    // The gross arm charges less, so every filled row earns a little more.
    grossRealizedR: input.realizedR === 0 ? 0 : input.realizedR + 0.05,
    holdout: input.holdout ?? false,
    outcome,
    realizedR: input.realizedR,
    split: input.split,
    symbol: input.symbol,
    time: base + input.index * HOUR,
    variant: input.variant ?? "baseline",
  };
}

/**
 * EURUSD wins most and loses money; GBPUSD, NZDCHF and XAUUSD are plain.
 *
 * Two holdout populations, differing by construction (R4 act 2): the rows
 * and the manifest STAMP GBPUSD (the driver's sha256 mod 5), while the one
 * population — the stratified rule over the requested roster — holds NZDCHF
 * out of the three-market forex class (its sha256 rank is the lowest of the
 * three, below EURUSD's). A class of two would hold nothing out and make the
 * HELD OUT label vacuous, which is why forex has three.
 */
function fixtureRows(): Row[] {
  const rows: Row[] = [];
  let index = 0;
  for (const split of ["fit", "select"]) {
    for (let step = 0; step < 6; step += 1) {
      // Four small wins, two stops per fold: 4 x 0.2 - 2 x 1.0 = -1.2R
      rows.push(row({ index: index++, realizedR: step < 4 ? 0.2 : -1, split, symbol: "EURUSD" }));
      rows.push(row({ holdout: true, index: index++, realizedR: step % 2 === 0 ? 1 : -1, split, symbol: "GBPUSD" }));
      rows.push(row({ index: index++, realizedR: step % 2 === 0 ? 1 : -1, split, symbol: "NZDCHF" }));
      rows.push(row({ index: index++, realizedR: step % 3 === 0 ? -1 : 0.8, split, symbol: "XAUUSD" }));
    }
    rows.push(row({ index: index++, realizedR: 0, split, symbol: "XAUUSD" }));
    rows.push(row({ accepted: false, index: index++, realizedR: -1, split, symbol: "XAUUSD" }));
    rows.push(row({ index: index++, realizedR: 0.5, split, symbol: "EURUSD", variant: "runnerProtection=hold" }));
  }
  // Confirm rows that would flip every sign if they were read.
  for (let step = 0; step < 40; step += 1) {
    rows.push(row({ index: index++, realizedR: 5, split: SEALED_FOLD, symbol: "EURUSD" }));
    rows.push(row({ index: index++, realizedR: -5, split: SEALED_FOLD, symbol: "XAUUSD" }));
  }
  return rows;
}

function writeCorpus(
  rows: Row[],
  overrides: Record<string, unknown> = {},
  name = "shard",
): string {
  const dir = mkdtempSync(join(tmpdir(), "tuning-folds-"));
  const emitPath = join(dir, `${name}.jsonl`);
  writeFileSync(emitPath, rows.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const symbols = [...new Set(rows.map((entry) => String(entry.symbol)))];
  const manifest = buildSweepManifest({
    acceptance: { captureAll: true, ignoreLowEdge: false },
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
    emitColumns: Object.keys(rows[0]).sort(),
    folds: [
      { decisionEndMs: SELECT_START - 5 * 86_400_000, endMs: SELECT_START, name: "fit", startMs: FIT_START },
      { decisionEndMs: CONFIRM_START - 5 * 86_400_000, endMs: CONFIRM_START, name: "select", startMs: SELECT_START },
      { decisionEndMs: END - 5 * 86_400_000, endMs: END, name: SEALED_FOLD, startMs: CONFIRM_START },
    ],
    generatedAt: "2026-09-02T10:00:00.000Z",
    grid: [{}, { runnerProtection: "hold" }],
    grossCostScale: 0,
    holdoutSymbols: ["GBPUSD"],
    modeledCostScale: 1,
    requestedSymbols: symbols,
    source: { dirty: false, revision: "e51e742c6ed50ef7a1a026760af61f39b0f9570f" },
    stepBars: 16,
    symbols: symbols.map((symbol) => ({
      calibration: {},
      providerSymbol: symbol,
      series: {
        "15min": seriesFacts(
          rows.filter((entry) => entry.symbol === symbol).map((entry) => ({ time: Number(entry.time) })),
          "intraday",
        ),
      },
      symbol,
    })),
    trainShare: 0.6,
    treasuryCurve: {
      count: 3_000,
      firstTime: Date.UTC(2013, 0, 2),
      largestGapMs: 4 * 86_400_000,
      lastTime: Date.UTC(2027, 0, 1),
    },
    warmupBars: 240,
    ...overrides,
  } as Parameters<typeof buildSweepManifest>[0]);
  writeFileSync(`${emitPath}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  return emitPath;
}

/**
 * A pin directory holding no pin, so every summary below resolves its set
 * "unpinned" — the tracked docs/research/r4/ is this repo's, and a fixture
 * roster at R3's anchor must not be read against R3's pin.
 */
const NO_PIN_DIR = join(mkdtempSync(join(tmpdir(), "tuning-folds-pins-")), "none");

function summarize(
  input: Parameters<typeof summarizeTuningFolds>[0],
): ReturnType<typeof summarizeTuningFolds> {
  return summarizeTuningFolds({ holdoutPinDir: NO_PIN_DIR, ...input });
}

/** Rewrite a manifest field the way an older driver would have left it. */
function rewriteManifest(emitPath: string, mutate: (manifest: Record<string, unknown>) => void): void {
  const path = `${emitPath}.manifest.json`;
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  mutate(manifest);
  const { generatedAt: _generatedAt, manifestHash: _hash, ...payload } = manifest;
  manifest.manifestHash = sha256Hex(stableStringify(payload));
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}

describe("the confirm fold is sealed", () => {
  it("refuses the fold by name before touching a corpus", () => {
    assert.throws(() => parseFolds("fit,confirm"), /the held-back fold/);
    assert.throws(() => parseFolds("confirm"), /grid-totalr --confirm-final/);
    assert.throws(() => parseFolds(""), /names no fold/);
    assert.deepEqual(parseFolds("fit, select, fit"), ["fit", "select"]);
  });

  it("never lets confirm rows reach a figure, even though the corpus carries them", async () => {
    const summary = await summarize({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    // 80 confirm rows sit in the file; none is read.
    assert.equal(summary.rows.otherFolds, 80);
    // 52 rows in the folds read are accepted: three forex and one metal, six
    // each per fold (48), plus per fold one accepted-but-unfilled XAUUSD row
    // and one hold-variant EURUSD row. The two not-accepted rows are not here.
    assert.equal(summary.rows.accepted, 4 * 12 + 2 + 2);
    const eurusd = summary.bySymbolVariant.get("forex|EURUSD|baseline")!;
    // 12 filled, all in fit + select: 8 x 0.2 - 4 x 1.0 = -2.4R. Had a single
    // +5R confirm row been read the sign would flip.
    assert.equal(eurusd.net.filled, 12);
    assert.equal(Number(eurusd.net.rSum.toFixed(6)), -2.4);
    assert.ok(eurusd.net.rSum < 0);
  });

  it("refuses a fold the manifest never declared", async () => {
    await assert.rejects(
      summarize({ folds: ["fit", "nonesuch"], minFilled: 3, paths: [writeCorpus(fixtureRows())] }),
      /no "nonesuch"/,
    );
  });

  it("refuses a legacy two-split corpus rather than guessing its folds", async () => {
    const path = writeCorpus(fixtureRows());
    rewriteManifest(path, (manifest) => {
      delete manifest.folds;
    });
    await assert.rejects(
      summarize({ folds: ["fit", "select"], minFilled: 3, paths: [path] }),
      /legacy two-split corpus/,
    );
  });
});

describe("what it counts, and what it keeps apart", () => {
  // The mutation case for one holdout population (R4 act 2): the stamped set
  // and the stratified set differ — GBPUSD is stamped, NZDCHF is stratified —
  // and the class pool must exclude the stratified market and NOT the
  // stamped-only one. Before act 2 this test read the stamp: the forex pool
  // was EURUSD alone and GBPUSD wore the label.
  it("excludes the STRATIFIED held-out market from the class rollup, pools the stamped-only one, and labels per market", async () => {
    const summary = await summarize({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    assert.deepEqual(summary.holdout.markets, ["NZDCHF"]);
    assert.deepEqual(summary.holdout.stamped, ["GBPUSD"]);
    assert.equal(summary.holdout.rule, "stratified-per-class-20pct");
    assert.equal(summary.holdout.basis, "requestedSymbols");
    assert.equal(summary.holdout.pinned, false);
    const forexBaseline = summary.byClassVariant.get("forex|baseline")!;
    // EURUSD and GBPUSD: NZDCHF is held out and contributes to no class cell;
    // GBPUSD's stamp excludes nothing.
    assert.equal(forexBaseline.net.filled, 24);
    assert.equal(Number(forexBaseline.net.rSum.toFixed(6)), -2.4);
    assert.equal(summary.rows.heldOut, 12);
    assert.equal(summary.rows.stamped, 12);
    const nzdchf = summary.bySymbolVariant.get("forex|NZDCHF|baseline")!;
    assert.equal(nzdchf.holdout, true);
    assert.equal(nzdchf.net.filled, 12);
    const gbpusd = summary.bySymbolVariant.get("forex|GBPUSD|baseline")!;
    assert.equal(gbpusd.holdout, false);
    assert.equal(gbpusd.net.filled, 12);
    const text = formatSummary(summary);
    assert.match(text, /\| forex \| NZDCHF \| baseline \| HELD OUT \|/);
    assert.match(text, /\| forex \| GBPUSD \| baseline \|  \|/);
    // The header states the rule, the count, the pin state and the stamp.
    assert.match(
      text,
      /^holdout: stratified-per-class-20pct — 1 markets excluded from every class pool, labelled HELD OUT per market \(unpinned — no .*holdout-2026-08-26\.json, computed from requestedSymbols\); stamped flag: 1 markets, provenance only$/m,
    );
    assert.match(text, /12 on held-out markets \(per-market lines only\) · 12 carrying the driver's stamp \(provenance only\)/);
  });

  it("verifies against the anchor's pin when one stands, and refuses a pin that names another set — executed", async () => {
    const pinDir = mkdtempSync(join(tmpdir(), "tuning-folds-pin-"));
    const pinPath = join(pinDir, "holdout-2026-08-26.json");
    // A pin is specific to the REQUESTED roster: this fixture's four markets.
    const rosterHash = rosterHashOf(["EURUSD", "GBPUSD", "NZDCHF", "XAUUSD"]);
    writeFileSync(
      pinPath,
      JSON.stringify({ manifestHashes: ["0".repeat(64)], markets: ["NZDCHF"], rosterHash, rule: "stratified-per-class-20pct" }) + "\n",
    );
    const summary = await summarize({
      folds: ["fit", "select"],
      holdoutPinDir: pinDir,
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    assert.equal(summary.holdout.pinned, true);
    assert.equal(summary.holdout.pinPath, pinPath);
    assert.match(formatSummary(summary), /\(pinned .*holdout-2026-08-26\.json\); stamped flag: 1 markets/);
    // The stamp as a pin — the exact drift the one population replaces.
    writeFileSync(
      pinPath,
      JSON.stringify({ manifestHashes: ["0".repeat(64)], markets: ["GBPUSD"], rosterHash, rule: "stratified-per-class-20pct" }) + "\n",
    );
    await assert.rejects(
      summarize({ folds: ["fit", "select"], holdoutPinDir: pinDir, minFilled: 3, paths: [writeCorpus(fixtureRows())] }),
      /heldOutSetDrift: .*pinned but not computed: GBPUSD; computed but not pinned: NZDCHF/,
    );
    // A pin of ANOTHER requested roster at the same anchor says nothing about
    // this one: unpinned for this roster, computed, never drift.
    writeFileSync(
      pinPath,
      JSON.stringify({
        manifestHashes: ["0".repeat(64)],
        markets: ["GBPUSD"],
        rosterHash: rosterHashOf(["EURUSD", "GBPUSD"]),
        rule: "stratified-per-class-20pct",
      }) + "\n",
    );
    const other = await summarize({ folds: ["fit", "select"], holdoutPinDir: pinDir, minFilled: 3, paths: [writeCorpus(fixtureRows())] });
    assert.equal(other.holdout.pinState, "other-roster");
    assert.deepEqual(other.holdout.markets, ["NZDCHF"]);
    assert.match(
      formatSummary(other),
      /\(unpinned for this roster — .*holdout-2026-08-26\.json pins another requested roster; computed from requestedSymbols \(roster [0-9a-f]{12}\)\)/,
    );
  });

  it("computes over the symbols read when a manifest carries no requested roster, says so, and treats a standing pin as unpinnable rather than drift", async () => {
    const path = writeCorpus(fixtureRows());
    rewriteManifest(path, (manifest) => {
      delete manifest.requestedSymbols;
    });
    // A pin naming a DIFFERENT set stands for the anchor: a symbols-read set
    // cannot be compared to it, so the pin is reported as not consulted, and
    // no drift is claimed.
    const pinDir = mkdtempSync(join(tmpdir(), "tuning-folds-legacy-pin-"));
    const pinPath = join(pinDir, "holdout-2026-08-26.json");
    writeFileSync(
      pinPath,
      JSON.stringify({
        manifestHashes: ["0".repeat(64)],
        markets: ["GBPUSD"],
        rosterHash: rosterHashOf(["EURUSD", "GBPUSD", "NZDCHF", "XAUUSD"]),
        rule: "stratified-per-class-20pct",
      }) + "\n",
    );
    const summary = await summarize({ folds: ["fit", "select"], holdoutPinDir: pinDir, minFilled: 3, paths: [path] });
    assert.equal(summary.holdout.basis, "symbols-read");
    assert.deepEqual(summary.holdout.markets, ["NZDCHF"]);
    assert.equal(summary.holdout.pinned, false);
    assert.equal(summary.holdout.pinStands, true);
    assert.equal(summary.holdout.pinState, "symbols-read");
    assert.match(
      formatSummary(summary),
      /\(computed over the symbols read — no requested roster in the manifest — so unpinnable; .*holdout-2026-08-26\.json not consulted\)/,
    );
  });

  it("skips rows the sweep did not accept and says how many", async () => {
    const summary = await summarize({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    assert.equal(summary.rows.notAccepted, 2);
    const xauusd = summary.bySymbolVariant.get("metals|XAUUSD|baseline")!;
    // 12 accepted decisions per two folds plus one unfilled each: n 14, filled 12.
    assert.equal(xauusd.net.n, 14);
    assert.equal(xauusd.net.filled, 12);
  });

  it("carries the gross arm beside the net one, and the gross arm earns more", async () => {
    const summary = await summarize({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    for (const entry of summary.bySymbolVariant.values()) {
      assert.ok(entry.gross.rSum > entry.net.rSum, entry.symbol);
      assert.equal(entry.gross.filled, entry.net.filled);
    }
  });

  it("puts the rate beside the money and names the markets that win most while losing", async () => {
    const summary = await summarize({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    const text = formatSummary(summary);
    // EURUSD wins 8 of 12 and loses 2.4R: the amendment-39 divergence, named.
    assert.match(text, /winning at least half their filled setups while losing money: 1 \(EURUSD\)/);
    assert.match(text, /\| forex \| EURUSD \| baseline \|  \| 12 \| 12 \| 0 \| 66\.7% \| 33\.3% \| -0\.200 \|/);
  });

  it("marks a cell THIN below the floor and never prints an expectancy over zero filled", async () => {
    const summary = await summarize({
      folds: ["fit", "select"],
      minFilled: 30,
      paths: [writeCorpus(fixtureRows())],
    });
    const text = formatSummary(summary);
    // 24: the forex pool is EURUSD and GBPUSD (R4 act 2 — the stamp no
    // longer excludes GBPUSD; NZDCHF, the stratified market, is out).
    assert.match(text, /\| forex \| baseline \| 24 \| 24 \| 0 \|.*\| THIN \|/);
    assert.match(text, /markets above the thin floor at baseline: 0/);
  });

  it("splits the per-fold table so select stands apart from fit", async () => {
    const summary = await summarize({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [writeCorpus(fixtureRows())],
    });
    const fit = summary.byClassVariantFold.get("forex|baseline|fit")!;
    const select = summary.byClassVariantFold.get("forex|baseline|select")!;
    // Six EURUSD and six GBPUSD per fold (R4 act 2 pools the stamped-only
    // market); the held-out NZDCHF's six are in neither.
    assert.equal(fit.net.filled, 12);
    assert.equal(select.net.filled, 12);
    assert.equal(summary.byClassVariantFold.has("forex|baseline|confirm"), false);
  });

  it("refuses two shards that are two measurements", async () => {
    const first = writeCorpus(fixtureRows());
    const second = writeCorpus(fixtureRows(), { anchor: "2026-08-25" }, "other");
    await assert.rejects(
      summarize({ folds: ["fit", "select"], minFilled: 3, paths: [first, second] }),
      /two measurements cannot be summarised as one/,
    );
  });

  it("pools two shards of one measurement", async () => {
    const first = writeCorpus(fixtureRows());
    const second = writeCorpus(fixtureRows(), {}, "other");
    const summary = await summarize({
      folds: ["fit", "select"],
      minFilled: 3,
      paths: [first, second],
    });
    assert.equal(summary.manifestHashes.length, 2);
    assert.equal(summary.bySymbolVariant.get("forex|EURUSD|baseline")!.net.filled, 24);
  });
});

describe("as a binary", () => {
  function run(args: string[]): { code: number; stderr: string; stdout: string } {
    const env = { ...process.env };
    delete env.TSX_TSCONFIG_PATH;
    try {
      const stdout = execFileSync(TSX, [READER, ...args], {
        cwd: mkdtempSync(join(tmpdir(), "tuning-folds-run-")),
        encoding: "utf8",
        env,
        stdio: "pipe",
      });
      return { code: 0, stderr: "", stdout };
    } catch (error) {
      const failed = error as { status?: number; stderr?: string; stdout?: string };
      const stderr = String(failed.stderr ?? "");
      assert.doesNotMatch(
        stderr,
        /npm error|npx canceled|command not found|Cannot find module 'tsx'|tsx\/dist\/register/,
        `the reader was never executed — a harness failure must never read as the subject refusing: ${stderr.slice(0, 300)}`,
      );
      return { code: failed.status ?? -1, stderr, stdout: String(failed.stdout ?? "") };
    }
  }

  it("refuses with no corpus named, and says what to pass", () => {
    const result = run([]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /no corpus paths given — pass one or more emit\.jsonl shards/);
  });

  it("refuses --folds confirm at the command line", () => {
    const result = run([writeCorpus(fixtureRows()), "--folds", "fit,confirm"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /the held-back fold/);
  });

  it("prints the summary and exits 0 on a good corpus", () => {
    const result = run([writeCorpus(fixtureRows()), "--min-filled", "3"]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /confirm: SEALED, not read/);
    assert.match(result.stdout, /## Per market × variant/);
    // The binary looks for the pin in the tracked directory, relative to its
    // cwd — a temp directory here, so the fixture's anchor is unpinned and
    // the header says so rather than reading R3's pin against a fixture.
    assert.match(
      result.stdout,
      /holdout: stratified-per-class-20pct — 1 markets excluded from every class pool, labelled HELD OUT per market \(unpinned — no docs\/research\/r4\/holdout-2026-08-26\.json/,
    );
  });
});
