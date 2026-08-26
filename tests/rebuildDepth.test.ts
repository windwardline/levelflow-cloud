import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { compareDepth } from "../scripts/verify-rebuild-depth.ts";

/**
 * `scripts/verify-rebuild-depth.ts` makes one claim checkable: a rebuild is
 * reproducible in KIND, not in DEPTH. FMP's intraday window ages out, so a
 * refetch can return fewer bars than were once served — measured on the real
 * corpora as 24 stores and 10,850 rows the v4 rebuild did not recover from v3.
 *
 * These fixtures pin the three judgements the tool has to get right, each of
 * which it got WRONG in a draft:
 *   - loss is a SET difference, not a count difference
 *   - a clock bump is DISPLACEMENT, detected by signature rather than by label
 *   - a thin sample is a REFUSAL, not a pass
 */

type Bar = { close: number; high: number; low: number; open: number; time: number; volume: number };

const bar = (time: number): Bar => ({ close: 1, high: 1, low: 1, open: 1, time, volume: 1 });

function corpus(stores: Record<string, { clock: string; times: number[] }>): string {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-depth-"));
  for (const [name, { clock, times }] of Object.entries(stores)) {
    writeFileSync(
      join(dir, `${name}.rolling.json`),
      JSON.stringify({ clock, items: times.map(bar), pinned: {} }),
    );
  }
  return dir;
}

/** Writes an arbitrary store body, for the shapes `corpus` cannot express. */
function withStores(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), "rebuild-depth-"));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(body));
  }
  return dir;
}

const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => from + i * 300_000);

describe("verify-rebuild-depth", () => {
  it("reports a store the rebuild did not recover", () => {
    const reference = corpus({ A: { clock: "v4", times: range(0, 100) } });
    const candidate = corpus({ A: { clock: "v4", times: range(0, 90) } });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.compared, 1);
      assert.equal(report.losses.length, 1);
      assert.equal(report.losses[0]?.missing, 10);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("catches loss when the ROW COUNTS are identical", () => {
    // THE CASE A COUNT COMPARISON CANNOT SEE, and the reason this tool
    // differences sets. The reference keeps two old bars the rolling cap has
    // since dropped; the candidate gained two newer ones. Same length, real
    // loss. On the live corpora this is ZNUSD-daily: 4996 -> 4996, one row
    // gone. An earlier count-based comparison found 18 affected stores where
    // the set difference found 60.
    const reference = corpus({ A: { clock: "v4", times: range(0, 100) } });
    const candidate = corpus({ A: { clock: "v4", times: range(600_000, 100) } });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.compared, 1);
      assert.equal(report.losses.length, 1, "identical counts hid a real loss");
      assert.equal(report.losses[0]?.missing, 2);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("calls a wholesale timestamp shift DISPLACEMENT, not loss", () => {
    // A clock bump moves every bar. Reporting that as loss manufactures
    // 202,039 missing rows out of the v2-vs-v3 comparison, 122,468 of them
    // three foreign indices displaced by 6, 13 and 14 hours. Detected by
    // SIGNATURE — the share of rows that moved — because the clock LABEL
    // differs on all 290 stores across a bump that changed only three.
    const reference = corpus({ A: { clock: "v3", times: range(0, 100) } });
    const candidate = corpus({ A: { clock: "v4", times: range(50_400_000, 100) } });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.incomparable, 1, "a full shift should read as displaced");
      assert.equal(report.losses.length, 0, "displacement must not be reported as loss");
      assert.equal(report.compared, 0);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("still measures depth when only SOME stores were displaced", () => {
    // The v3 -> v4 bump: the clock string differs on every store, but only the
    // three foreign daily stores actually moved. Judging on the label skipped
    // 289 of 290 and declared the rebuild depth-complete on a sample of one.
    const reference = corpus({
      moved: { clock: "v3", times: range(0, 100) },
      steady: { clock: "v3", times: range(0, 100) },
    });
    const candidate = corpus({
      moved: { clock: "v4", times: range(50_400_000, 100) },
      steady: { clock: "v4", times: range(0, 95) },
    });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.incomparable, 1, "the moved store is displaced");
      assert.equal(report.compared, 1, "the steady store is still measurable");
      assert.equal(report.losses.length, 1);
      assert.equal(report.losses[0]?.missing, 5);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("reports a store the candidate does not have at all", () => {
    const reference = corpus({
      A: { clock: "v4", times: range(0, 10) },
      B: { clock: "v4", times: range(0, 7) },
    });
    const candidate = corpus({ A: { clock: "v4", times: range(0, 10) } });
    try {
      const report = compareDepth(reference, candidate);
      const absent = report.losses.find((loss) => loss.kind === "absent");
      assert.ok(absent, "a store present only in the reference must be reported");
      assert.equal(absent.missing, 7);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("compares nothing when every store moved, so the caller can refuse", () => {
    // The tool's own non-vacuity floor lives in main(); this pins the input it
    // keys on. compared === 0 with incomparable > 0 is the shape of "these two
    // corpora are on different clocks", which is not a pass.
    const reference = corpus({ A: { clock: "v2", times: range(0, 100) } });
    const candidate = corpus({ A: { clock: "v4", times: range(50_400_000, 100) } });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.compared, 0);
      assert.ok(report.incomparable > 0);
      assert.equal(report.losses.length, 0);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });
});

describe("verify-rebuild-depth — store shapes it must not skip", () => {
  it("refuses a store it has rows for but cannot key", () => {
    // THE GENERAL FORM OF THE treasury-rates GAP. A store whose rows carry no
    // recognisable key yields empty sets on both sides, so missing is 0 and
    // share is 0 and it lands in `compared` having examined nothing. Before
    // this guard, a 3,412-row store gutted to one row passed depth-complete.
    const reference = withStores({ "odd.rolling.json": { clock: "v4", items: [{ nope: 1 }, { nope: 2 }] } });
    const candidate = withStores({ "odd.rolling.json": { clock: "v4", items: [] } });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.compared, 0, "an unkeyable store must not count as compared");
      assert.equal(report.losses.length, 1);
      assert.equal(report.losses[0]?.kind, "unkeyed");
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("keys treasury-rates by dateMs", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ dateMs: i * 86_400_000, tenYear: 4, twoYear: 4 }));
    const reference = withStores({ "treasury-rates.rolling.json": { clock: "v4", items: rows(10) } });
    const candidate = withStores({ "treasury-rates.rolling.json": { clock: "v4", items: rows(8) } });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.compared, 1, "treasury-rates must be measurable, not skipped");
      assert.equal(report.losses[0]?.missing, 2);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("enumerates cot-*.json, which is a bare array keyed by a numeric date", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ date: i * 604_800_000, netPct: 0.1 }));
    const reference = withStores({ "cot-ES.json": rows(20) });
    const candidate = withStores({ "cot-ES.json": rows(17) });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.compared, 1, "cot-*.json was never enumerated at all before this");
      assert.equal(report.losses[0]?.missing, 3);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("separates calendar events that share one instant", () => {
    // The opposite failure from the others: keying on time alone COLLAPSES
    // two releases at the same instant into one, under-reporting loss. That
    // collapse is the defect #426/#430 repaired in the live store, so a
    // checker that reproduces it cannot see the repair.
    const at = 1_700_000_000_000;
    // Sized like a real store, not like a minimal case: with only two rows,
    // dropping one is exactly 50% missing and 50% retained, which trips the
    // displacement thresholds. The fixture, not the logic, was wrong.
    const filler = Array.from({ length: 40 }, (_, i) => ({
      currency: "USD", impact: "Low", name: `Filler ${i}`, time: at + (i + 1) * 3_600_000,
    }));
    const shared = [
      { currency: "EUR", impact: "High", name: "CPI", time: at },
      { currency: "GBP", impact: "High", name: "GDP", time: at },
    ];
    const reference = withStores({
      "econ-calendar.rolling.json": { clock: "v2", items: [...shared, ...filler] },
    });
    const candidate = withStores({
      "econ-calendar.rolling.json": { clock: "v2", items: [shared[0], ...filler] },
    });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.losses.length, 1, "the dropped GBP event must be seen");
      assert.equal(report.losses[0]?.missing, 1);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });

  it("calls a gutted store LOSS, not displacement", () => {
    // Displacement means the rows MOVED, so they still exist. A store gutted
    // to one row also shows ~100% of keys missing; excusing that as a clock
    // shift would explain away a total loss. A shift preserves row count.
    const reference = corpus({ A: { clock: "v3", times: range(0, 500) } });
    const candidate = corpus({ A: { clock: "v4", times: range(0, 1) } });
    try {
      const report = compareDepth(reference, candidate);
      assert.equal(report.incomparable, 0, "a gutted store is not displaced");
      assert.equal(report.losses[0]?.kind, "shallower");
      assert.equal(report.losses[0]?.missing, 499);
    } finally {
      rmSync(reference, { force: true, recursive: true });
      rmSync(candidate, { force: true, recursive: true });
    }
  });
});
