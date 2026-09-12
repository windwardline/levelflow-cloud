// Round 2 decided per-market span exclusion on 2026-09-07 and it stayed
// unbuilt: `sweepFolds.calendarFolds` cuts one continuous span into
// proportional shares, and forex's escaping feed years sit in the MIDDLE of
// that span. Shortening the span cannot reach them; a proportional cut hands a
// fold a calendar that is mostly refused.
//
// Two pieces, tested here. `feedMonths` states which months the witness will
// not vouch for, at the grain the decision needs — a year bucket either throws
// away five clean months to drop two dirty ones or keeps the dirty ones.
// `calendarFoldsExcluding` places fold boundaries by USABLE time, so a fold's
// share is measured on the months that survive.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAssetType } from "../supabase/functions/trade-analyzer/calibration.ts";
import {
  monthEndMs,
  monthMapOf,
  monthOf,
  monthStartMs,
  parseWitnessMonths,
  readWitnessMonths,
} from "../scripts/feedMonths.ts";
import {
  calendarFolds,
  calendarFoldsExcluding,
  usableMsInFold,
} from "../scripts/sweepFolds.ts";

const WITNESS = "docs/research/r3/feed-character.txt";
const DAY = 86_400_000;

describe("feedMonths — the witness at the grain the decision needs", () => {
  it("unions escaping years with the months hidden inside contained ones", () => {
    const parsed = parseWitnessMonths(
      [
        "EURUSD 5min ESCAPES: 2021, 2022",
        "  2021 days 257 range 1.019 bar 0.0818 escape 28.8% under 10.1% ESCAPES (bar-range-drift)",
        "    HIDDEN INSIDE A CONTAINED YEAR — months 202401, 202402: 202401 range 1.015 (x)",
        "    HIDDEN INSIDE A CONTAINED YEAR — months 202602: 202602 range 1.000 (x)",
      ].join("\n"),
    );
    const map = monthMapOf(parsed, "fixture");
    // 24 from the two whole years, plus the three hidden ones.
    assert.equal(map.excludedMonths("EURUSD").length, 27);
    assert.ok(map.excludedAt("EURUSD", Date.UTC(2021, 5, 15)));
    assert.ok(map.excludedAt("EURUSD", Date.UTC(2024, 0, 20)), "202401 hidden");
    assert.ok(!map.excludedAt("EURUSD", Date.UTC(2024, 5, 20)), "202406 clean");
  });

  it("keeps several hidden lines for one market rather than choosing between them", () => {
    const parsed = parseWitnessMonths(
      [
        "AUDNZD 5min contained",
        "    HIDDEN INSIDE A CONTAINED YEAR — months 202204: x",
        "    HIDDEN INSIDE A CONTAINED YEAR — months 202208, 202212: x",
      ].join("\n"),
    );
    assert.deepEqual(
      [...parsed.get("AUDNZD")!.hiddenMonths].sort(),
      [202204, 202208, 202212],
    );
  });

  it("skips another tier's hidden months instead of attributing them here", () => {
    const parsed = parseWitnessMonths(
      [
        "EURUSD 5min contained",
        "    HIDDEN INSIDE A CONTAINED YEAR — months 202401: x",
        "EURUSD 15min contained",
        "    HIDDEN INSIDE A CONTAINED YEAR — months 209912: x",
      ].join("\n"),
    );
    assert.deepEqual([...parsed.get("EURUSD")!.hiddenMonths], [202401], "the 15min month must not land on the 5min verdict");
  });

  it("refuses a market it never judged rather than calling it clean", () => {
    const map = monthMapOf(parseWitnessMonths("EURUSD 5min contained"), "fixture");
    assert.throws(
      () => map.excludedMonths("GBPUSD"),
      /has no 5min verdict/,
      "silence read as contained is how a dirty market enters a clean fold",
    );
  });

  it("refuses an UNJUDGEABLE market rather than reading it clean", () => {
    const map = monthMapOf(parseWitnessMonths("ZZZUSD 5min unjudgeable"), "fixture");
    assert.throws(
      () => map.excludedMonths("ZZZUSD"),
      /UNJUDGEABLE/,
      "the loudest statement of doubt must not produce the most permissive answer",
    );
  });

  it("refuses a HIDDEN line it cannot parse, on the tier it serves", () => {
    assert.throws(
      () =>
        parseWitnessMonths(
          "EURUSD 5min contained\n    HIDDEN INSIDE A CONTAINED YEAR (no month list)",
        ),
      /no parseable month list/,
      "a silently skipped hidden line drops months and reads them as clean",
    );
  });

  it("does NOT let another tier's malformed line block the tier it serves", () => {
    // A well-formed 15min hidden line is skipped, so a malformed one must be
    // too — otherwise one bad regeneration of a tier this reader ignores
    // blocks the tier it reads.
    const parsed = parseWitnessMonths(
      [
        "EURUSD 5min contained",
        "    HIDDEN INSIDE A CONTAINED YEAR — months 202401: x",
        "EURUSD 15min contained",
        "    HIDDEN INSIDE A CONTAINED YEAR (mangled, no month list)",
      ].join("\n"),
    );
    assert.deepEqual([...parsed.get("EURUSD")!.hiddenMonths], [202401]);
  });

  it("refuses an unindented HIDDEN line rather than dropping it silently", () => {
    assert.throws(
      () =>
        parseWitnessMonths(
          "EURUSD 5min contained\nHIDDEN INSIDE A CONTAINED YEAR — months 202401: x",
        ),
      /is not indented under a verdict block/,
      "indentation is formatting; the announcement is not",
    );
  });

  it("refuses a malformed month token rather than dropping it", () => {
    assert.throws(
      () =>
        parseWitnessMonths(
          "EURUSD 5min contained\n    HIDDEN INSIDE A CONTAINED YEAR — months 2024O1: x",
        ),
      /names a hidden month that is not one/,
    );
    assert.throws(
      () =>
        parseWitnessMonths(
          "EURUSD 5min contained\n    HIDDEN INSIDE A CONTAINED YEAR — months 202413: x",
        ),
      /whose month part is 13/,
    );
  });

  it("merges consecutive months into one run", () => {
    const map = monthMapOf(
      parseWitnessMonths(
        "X 5min contained\n    HIDDEN INSIDE A CONTAINED YEAR — months 202401, 202402, 202403, 202408: x",
      ),
      "fixture",
    );
    const runs = map.excludedIntervals("X", Date.UTC(2023, 0, 1), Date.UTC(2025, 0, 1));
    assert.equal(runs.length, 2, "Jan-Mar is one hole, August another");
    assert.equal(runs[0].startMs, monthStartMs(202401));
    assert.equal(runs[0].endMs, monthEndMs(202403));
  });

  // THE CONTROL. The record states 62 forex hidden-2024 months, all falling
  // January to July. An instrument that cannot reproduce a decided case has not
  // earned an open one.
  it("reproduces the record's 62 forex hidden-2024 months, all Jan-Jul", () => {
    const witness = readWitnessMonths(WITNESS);
    const hidden2024: number[] = [];
    for (const [symbol, entry] of witness) {
      // CLASS COMES FROM THE RESOLVER, never a ticker's shape. A first draft
      // of this test filtered on /^[A-Z]{6}$/ and swept in agriculture,
      // livestock, futures and crypto — the same six-letter mistake that
      // mis-stated this very witness's counts on 2026-09-07.
      if (getAssetType(symbol) !== "forex") continue;
      for (const month of entry.hiddenMonths) {
        if (Math.floor(month / 100) === 2024) hidden2024.push(month);
      }
    }
    assert.equal(hidden2024.length, 62, "the record states 62");
    assert.ok(
      hidden2024.every((month) => month % 100 <= 7),
      `every forex hidden-2024 month must fall January to July; got ${
        [...new Set(hidden2024.map((month) => month % 100))].sort((a, b) => a - b).join(", ")
      }`,
    );
  });

  it("states 360 hidden months over 172 store-years on the 5min map", () => {
    // The record's "651 months over 305 store-years" spans BOTH tiers; 5min is
    // 360 over 172 and 15min is 291 over 133. Exclusion runs on the 5min map,
    // so this is the number that governs it.
    const witness = readWitnessMonths(WITNESS);
    let months = 0;
    const storeYears = new Set<string>();
    for (const [symbol, entry] of witness) {
      months += entry.hiddenMonths.size;
      for (const month of entry.hiddenMonths) {
        storeYears.add(`${symbol}|${Math.floor(month / 100)}`);
      }
    }
    assert.equal(witness.size, 97, "one 5min verdict per roster market");
    assert.equal(months, 360);
    assert.equal(storeYears.size, 172);
  });
});

describe("calendarFoldsExcluding — shares measured on the months that survive", () => {
  const START = Date.UTC(2010, 0, 1);
  const END = Date.UTC(2026, 0, 1);

  // THE CONTROL, again: with no holes it must be the function it replaces.
  it("reduces exactly to calendarFolds when nothing is excluded", () => {
    const plain = calendarFolds({ corpusEndMs: END, corpusStartMs: START, embargoMs: DAY });
    const holed = calendarFoldsExcluding({
      corpusEndMs: END,
      corpusStartMs: START,
      embargoMs: DAY,
      excluded: [],
    });
    assert.deepEqual(holed, plain);
  });

  // The review of #618 found the equality held only for spans divisible by 4,
  // because calendarFolds rounds each boundary and this did not. A span chosen
  // to divide evenly proved nothing.
  it("reduces to calendarFolds on a span that does NOT divide evenly", () => {
    const oddEnd = END + 7; // seven milliseconds past a clean boundary
    assert.notEqual((oddEnd - START) % 4, 0, "the fixture must be awkward");
    assert.deepEqual(
      calendarFoldsExcluding({
        corpusEndMs: oddEnd,
        corpusStartMs: START,
        embargoMs: DAY,
        excluded: [],
      }),
      calendarFolds({ corpusEndMs: oddEnd, corpusStartMs: START, embargoMs: DAY }),
    );
  });

  // THE NEAR-LIMIT GUARD. Both no-hole tests exercise a one-line delegation, so
  // after #619 neither could catch a regression in the accumulate-and-round
  // path that the #618 review actually found — the guard was routed around
  // rather than repaired. One millisecond of hole is enough to force the real
  // arithmetic to run while the answer stays comparable to the function it
  // replaces. The bound is a few milliseconds, not zero: the two round
  // differently by design, and this pins HOW differently.
  it("stays within a millisecond of calendarFolds when a hole is one millisecond wide", () => {
    const oddEnd = END + 7;
    const plain = calendarFolds({ corpusEndMs: oddEnd, corpusStartMs: START, embargoMs: DAY });
    const pinhole = START + 1_000 * DAY;
    const holed = calendarFoldsExcluding({
      corpusEndMs: oddEnd,
      corpusStartMs: START,
      embargoMs: DAY,
      excluded: [{ endMs: pinhole + 1, startMs: pinhole }],
    });
    // The hole guarantees the exclusion arithmetic ran — delegation happens
    // only when there are no holes at all. Whether the two schemes then AGREE
    // is incidental and must not be asserted either way: on this fixture they
    // land on the same millisecond, and a future span may split them. The
    // bound is the claim.
    for (const [index, fold] of holed.entries()) {
      assert.equal(fold.name, plain[index].name);
      assert.ok(
        Math.abs(fold.endMs - plain[index].endMs) <= 2,
        `${fold.name} boundary drifted ${fold.endMs - plain[index].endMs}ms from calendarFolds; ` +
          `the two rounding schemes may differ by a millisecond per boundary, not more`,
      );
      assert.ok(
        Math.abs(fold.decisionEndMs - plain[index].decisionEndMs) <= 2,
        `${fold.name} decision close drifted ${fold.decisionEndMs - plain[index].decisionEndMs}ms`,
      );
    }
  });

  it("measures the embargo in usable time, not wall clock", () => {
    // THE INVARIANT, stated directly: whatever the holes, the usable time
    // between a fold's decision close and its end must BE the embargo. In wall
    // clock a hole sitting against a boundary absorbs the window and holds
    // back nothing.
    const embargoMs = 45 * DAY;
    // The last hole ends exactly at the span end, which is ALWAYS confirm's
    // boundary. A wall-clock subtraction lands inside it and holds back no
    // usable time at all; that is the case a hole elsewhere cannot expose,
    // and an earlier draft of this test used holes that sat nowhere near a
    // boundary, so the wall-clock mutation survived it.
    const excluded = [
      { endMs: Date.UTC(2014, 6, 1), startMs: Date.UTC(2013, 0, 1) },
      { endMs: END, startMs: END - 300 * DAY },
    ];
    const folds = calendarFoldsExcluding({
      corpusEndMs: END,
      corpusStartMs: START,
      embargoMs,
      excluded,
    });
    for (const fold of folds) {
      const window = {
        decisionEndMs: fold.decisionEndMs,
        endMs: fold.endMs,
        name: fold.name,
        startMs: fold.decisionEndMs,
      };
      assert.ok(
        Math.abs(usableMsInFold(window, excluded) - embargoMs) < 1000,
        `${fold.name}: the usable gap between decision close and fold end is ` +
          `${usableMsInFold(window, excluded)}ms, not the ${embargoMs}ms embargo`,
      );
    }
  });

  it("counts a fold's usable time the way the allocator does, overlaps merged", () => {
    const fold = { decisionEndMs: END, endMs: END, name: "fit" as const, startMs: START };
    const a = { endMs: Date.UTC(2015, 0, 1), startMs: Date.UTC(2013, 0, 1) };
    const b = { endMs: Date.UTC(2016, 0, 1), startMs: Date.UTC(2014, 0, 1) };
    const merged = { endMs: b.endMs, startMs: a.startMs };
    assert.equal(
      usableMsInFold(fold, [a, b]),
      usableMsInFold(fold, [merged]),
      "raw overlaps double-counted would report the fold shallower than it is",
    );
  });

  it("places boundaries by usable time, not by wall clock", () => {
    // Refuse the whole first half. Fit's 50% of USABLE time must then land in
    // the second half — a wall-clock cut would hand fit a fold with nothing in
    // it at all.
    const midpoint = START + (END - START) / 2;
    const folds = calendarFoldsExcluding({
      corpusEndMs: END,
      corpusStartMs: START,
      embargoMs: DAY,
      excluded: [{ endMs: midpoint, startMs: START }],
    });
    const fit = folds.find((fold) => fold.name === "fit")!;
    assert.ok(
      fit.endMs > midpoint,
      "fit must reach past the hole to hold half the usable calendar",
    );
    const excluded = [{ endMs: midpoint, startMs: START }];
    const usable = folds.map((fold) => usableMsInFold(fold, excluded));
    const total = usable.reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(usable[0] / total - 0.5) < 0.001, `fit holds ${usable[0] / total} of usable time`);
    assert.ok(Math.abs(usable[1] / total - 0.25) < 0.001);
    assert.ok(Math.abs(usable[2] / total - 0.25) < 0.001);
  });

  it("merges overlapping holes rather than double-counting them", () => {
    const a = { endMs: Date.UTC(2015, 0, 1), startMs: Date.UTC(2013, 0, 1) };
    const b = { endMs: Date.UTC(2016, 0, 1), startMs: Date.UTC(2014, 0, 1) };
    const once = calendarFoldsExcluding({
      corpusEndMs: END,
      corpusStartMs: START,
      embargoMs: DAY,
      excluded: [{ endMs: b.endMs, startMs: a.startMs }],
    });
    const twice = calendarFoldsExcluding({
      corpusEndMs: END,
      corpusStartMs: START,
      embargoMs: DAY,
      excluded: [a, b],
    });
    assert.deepEqual(twice, once, "an overlap counted twice moves every boundary");
  });

  it("refuses a span with no calendar left", () => {
    assert.throws(
      () =>
        calendarFoldsExcluding({
          corpusEndMs: END,
          corpusStartMs: START,
          embargoMs: DAY,
          excluded: [{ endMs: END, startMs: START }],
        }),
      /there is no calendar left to fold/,
    );
  });

  it("measures the embargo against USABLE depth, and says how much is gone", () => {
    // Nine tenths refused: the span looks long enough and is not.
    const nineTenths = START + (END - START) * 0.9;
    assert.throws(
      () =>
        calendarFoldsExcluding({
          corpusEndMs: END,
          corpusStartMs: START,
          embargoMs: (END - START) * 0.05,
          excluded: [{ endMs: nineTenths, startMs: START }],
        }),
      /USABLE fold — 90% of this span is excluded/,
    );
  });

  it("folds EURUSD's real hole without shortening its history", () => {
    const map = monthMapOf(readWitnessMonths(WITNESS), WITNESS);
    const excluded = map.excludedIntervals("EURUSD", START, END);
    const folds = calendarFoldsExcluding({
      corpusEndMs: END,
      corpusStartMs: START,
      embargoMs: DAY,
      excluded,
    });
    assert.equal(folds[0].startMs, START, "the corpus still starts where it started");
    assert.equal(folds.at(-1)!.endMs, END);
    const usable = folds.map((fold) => usableMsInFold(fold, excluded));
    const total = usable.reduce((sum, value) => sum + value, 0);
    assert.ok(total < END - START, "EURUSD's 2021-2024 hole is real");
    assert.ok(Math.abs(usable[0] / total - 0.5) < 0.005, `fit holds ${usable[0] / total}`);
    // The whole reason a continuous cut could not express this: EURUSD's hole
    // is INTERIOR to the corpus span, so no shortening of either end reaches
    // it. (It lands in select/confirm here, since fit takes the first half of
    // usable time and that is spent well before 2021.)
    assert.ok(
      excluded.every((hole) => hole.startMs > START && hole.endMs < END),
      "every EURUSD hole must sit strictly inside the span, reachable by neither end",
    );
    const spanningFold = folds.find((fold) =>
      excluded.some((hole) => hole.startMs >= fold.startMs && hole.startMs < fold.endMs)
    );
    assert.ok(spanningFold, "some fold must contain the hole");
    assert.ok(
      usableMsInFold(spanningFold!, excluded) < spanningFold!.endMs - spanningFold!.startMs,
      "the fold holding the hole must report less usable time than its width",
    );
  });
});

describe("monthOf — the key the witness emits", () => {
  it("reads a UTC instant to its YYYYMM", () => {
    assert.equal(monthOf(Date.UTC(2024, 0, 31, 23, 59)), 202401);
    assert.equal(monthOf(Date.UTC(2024, 11, 1)), 202412);
  });
});
