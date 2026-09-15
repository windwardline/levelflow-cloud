import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classVerdicts, readGridCube } from "../scripts/grid-totalr.ts";
import type { SweepEmitRow } from "../scripts/sweepStats.ts";

/**
 * The gate's disposition, and the boundaries its acceptance rests on.
 *
 * `tests/acceptanceGate.test.ts` covers the ladder. This file covers what a
 * 2026-09-14 adversarial review found the ladder does NOT pin: two exact
 * inequality boundaries whose mutation the whole suite survived, and the
 * selective-share threshold whose own printed message would go false with it.
 *
 * The fixtures sit ON their boundaries rather than near them, because a fixture
 * near a boundary pins the direction and not the comparison. A tie is the only
 * input that tells `>` apart from `>=`, and the selective share needs BOTH a
 * tie (which separates `<` from `<=`) and a case above the line (which shows
 * the threshold's value binds at all).
 */

const DAY = 86_400_000;

function outcomeRow(variant: string, dayIndex: number, realizedR: number): SweepEmitRow {
  return {
    accepted: true,
    outcome: realizedR > 0 ? "take_profit" : "stop_loss",
    realizedR,
    split: "test",
    symbol: "EURUSD",
    time: Date.UTC(2025, 0, 6) + dayIndex * DAY + 12 * 3_600_000,
    variant,
  };
}

function trainRow(variant: string, dayIndex: number, realizedR: number): SweepEmitRow {
  return {
    ...outcomeRow(variant, dayIndex, realizedR),
    split: "train",
    time: Date.UTC(2024, 0, 8) + dayIndex * DAY + 12 * 3_600_000,
  };
}

const OPTS = {
  foldNames: { fit: "train", select: "test" },
  permutations: 200,
  seed: 9,
} as const;

const verdictFor = (rows: SweepEmitRow[], variant: string) =>
  classVerdicts(readGridCube(rows), OPTS).get("forex")!.get(variant)!;

describe("the fit-fold delta is a strict improvement, not a tie", () => {
  // A rule that binds only inside the select window leaves the fit fold
  // untouched, so `fitTotalDelta` is EXACTLY zero — not a measure-zero
  // coincidence but the natural shape of a whole class of variant. Under
  // `>= 0` that variant is accepted on a fold where it did nothing.
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < 40; day += 1) {
    const swing = day % 2 === 0 ? 0.4 : -0.2;
    rows.push(trainRow("baseline", day, swing));
    rows.push(trainRow("selectOnly", day, swing));
    rows.push(outcomeRow("baseline", day, swing));
    rows.push(outcomeRow("selectOnly", day, swing + 0.5));
  }

  it("builds the tie it means to test, so this is not a near-miss", () => {
    const verdict = verdictFor(rows, "selectOnly");
    assert.equal(verdict.fitTotalDelta, 0, `fit delta ${verdict.fitTotalDelta}, expected exactly 0`);
    assert.ok(verdict.selectTotalDelta > 0, `select delta ${verdict.selectTotalDelta} must be positive`);
  });

  it("REFUSES a variant that did nothing on the fit fold, however good the select fold looks", () => {
    const verdict = verdictFor(rows, "selectOnly");
    assert.equal(
      verdict.accepted,
      false,
      `a fit-fold tie was accepted: ${verdict.reason}`,
    );
  });
});

describe("the money leg is positive BEYOND its error, not merely non-negative", () => {
  // Every select outcome is exactly 0.0R, so dispersion is zero and the 95%
  // lower bound equals the mean equals zero. This is the only fixture shape
  // that separates `> 0` from `>= 0`: on it the first refuses and the second
  // accepts, and the gate's own note says the leg is "BEYOND ITS OWN ERROR,
  // not merely above zero".
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < 40; day += 1) {
    rows.push(trainRow("baseline", day, -0.5));
    rows.push(trainRow("flatZero", day, 0.5));
    rows.push(outcomeRow("baseline", day, -0.5));
    rows.push(outcomeRow("flatZero", day, 0));
  }

  it("builds the exact-zero lower bound it means to test", () => {
    const verdict = verdictFor(rows, "flatZero");
    assert.equal(verdict.selectExpectancy, 0, `expectancy ${verdict.selectExpectancy}, expected exactly 0`);
    assert.equal(
      verdict.selectExpectancyLower,
      0,
      `lower bound ${verdict.selectExpectancyLower}, expected exactly 0 — zero dispersion should collapse the interval`,
    );
    assert.ok(verdict.selectTotalDelta > 0, `select delta ${verdict.selectTotalDelta} must be positive`);
    assert.ok(verdict.fitTotalDelta > 0, `fit delta ${verdict.fitTotalDelta} must be positive`);
  });

  it("REFUSES a variant whose own expectancy is exactly zero", () => {
    const verdict = verdictFor(rows, "flatZero");
    assert.equal(
      verdict.accepted,
      false,
      `a variant earning exactly nothing was accepted: ${verdict.reason}`,
    );
  });
});

describe("the SELECTIVE floor fires at half the baseline's fills, and its message says so", () => {
  // The floor's message reads "it trades under half the baseline's fills".
  // The predicate and that sentence carry the same 0.5 and must move together:
  // raise the threshold and a variant trading 60% of the baseline's days is
  // told it trades under half of them, which is a printed falsehood.
  const rows: SweepEmitRow[] = [];
  for (let day = 0; day < 40; day += 1) {
    const swing = day % 2 === 0 ? 0.5 : -0.1;
    rows.push(trainRow("baseline", day, swing));
    rows.push(trainRow("sixtyPercent", day, swing + 1));
    rows.push(outcomeRow("baseline", day, swing));
    if (day < 24) rows.push(outcomeRow("sixtyPercent", day, swing + 1));
  }

  it("builds a variant at 60% of the baseline's select fills, above the half-share line", () => {
    const cube = readGridCube(rows);
    const verdict = verdictFor(rows, "sixtyPercent");
    assert.ok(verdict, "the fixture must reach the ladder");
    assert.equal(cube.get("EURUSD")?.get("sixtyPercent")?.get("test")?.filled, 24);
    assert.equal(cube.get("EURUSD")?.get("baseline")?.get("test")?.filled, 40);
  });

  it("does NOT call a 60% variant selective, and does not print that it trades under half", () => {
    const verdict = verdictFor(rows, "sixtyPercent");
    // The FIELD, not the sentence. The gate forbids re-deriving a disposition
    // from a reason string, and the same argument applies to a test.
    assert.equal(verdict.selective, false, `24 of 40 is three fifths: ${verdict.reason}`);
    assert.doesNotMatch(
      verdict.reason,
      /under half the baseline's fills/,
      `24 of 40 is three fifths, and the gate said otherwise: ${verdict.reason}`,
    );
    assert.equal(verdict.noVerdict, false, `${verdict.reason}`);
  });

  // THE TIE. Exactly half is the only share that separates `<` from `<=`, and
  // the flip is not cosmetic: at `<=` a variant trading exactly half becomes
  // selective, falls through SELECTIVE_POWER_FLOOR into `underpowered`, and a
  // judged verdict turns into NO VERDICT — the disposition confusion this file
  // exists to prevent. The 60% fixture above cannot see it: `24 <= 20` is false
  // either way, and so is `24 < 40 * 0.6`.
  const tied: SweepEmitRow[] = [];
  for (let day = 0; day < 40; day += 1) {
    const swing = day % 2 === 0 ? 0.5 : -0.1;
    tied.push(trainRow("baseline", day, swing));
    tied.push(trainRow("exactlyHalf", day, swing + 1));
    tied.push(outcomeRow("baseline", day, swing));
    if (day < 20) tied.push(outcomeRow("exactlyHalf", day, swing + 1));
  }

  it("builds the exact half-share tie", () => {
    const cube = readGridCube(tied);
    assert.equal(cube.get("EURUSD")?.get("exactlyHalf")?.get("test")?.filled, 20);
    assert.equal(cube.get("EURUSD")?.get("baseline")?.get("test")?.filled, 40);
  });

  it("treats EXACTLY half as not selective, so the comparison is strict", () => {
    const verdict = verdictFor(tied, "exactlyHalf");
    assert.equal(
      verdict.selective,
      false,
      `20 of 40 is not UNDER half: ${verdict.reason}`,
    );
    assert.equal(
      verdict.noVerdict,
      false,
      `a variant trading exactly half was refused a verdict: ${verdict.reason}`,
    );
  });
});

describe("derive-4d publishes the gate's disposition, not a row count", () => {
  // The fourth consumer of the same distinction, one file further out.
  // `measureOnly` is `accepted.length === 0`, which is true both of a market
  // whose variants were MEASURED and refused and of one the gate declined to
  // judge on every variant. Those have opposite next moves. The `starved` flag
  // beside it is derived from `fitFilled < 30`, so it sees part of the
  // empty-fit leg and none of underpowered, sub-floor pairing or absent
  // baseline — and being a row count rather than the ladder's own word, it can
  // disagree with the verdicts it sits next to.
  const SOURCE = readFileSync("scripts/derive-4d.ts", "utf8");

  it("carries a field derived from the verdict's own noVerdict", () => {
    // That the field REACHES the artifact is tested behaviourally, by running
    // derive-4d and reading it back out (`acceptanceGate.test.ts`). What is
    // pinned here is the one thing a behavioural test cannot show: which field
    // the flag is computed FROM. A source pin that tried to assert placement
    // instead spanned the closing brace and asserted only that the word
    // appeared somewhere later in the file.
    assert.match(
      SOURCE,
      /const unjudged = rows\.length > 0 &&\s*rows\.every\(\(\[, verdict\]\) => verdict\.noVerdict\)/,
      "the unjudged flag must read the gate's disposition, not a fill count",
    );
  });

  it("does not let `starved` stand in for it, and says so where the field is declared", () => {
    // starved is still published — it answers a different question, and a
    // market can be both. What it may not do is be the only thing published.
    assert.match(SOURCE, /starved: boolean;/);
    assert.match(SOURCE, /unjudged: boolean;/);
    assert.match(
      SOURCE,
      /EVERY variant reached NO VERDICT/,
      "the declaration states what distinguishes the two",
    );
  });

  it("prints the two apart in the summary a reader actually sees", () => {
    assert.match(SOURCE, /measured and refused/);
    assert.match(SOURCE, /\$\{unjudged\} unjudged/);
    assert.doesNotMatch(
      SOURCE,
      /\$\{measureOnly\} measure-only/,
      "the old summary collapsed the two into one count",
    );
    // And the row count may not suppress the disposition: a thin corpus is
    // exactly when the gate judges nothing, so `0 unjudged` must not be
    // printable for a run in which nothing was judged.
    assert.match(
      SOURCE,
      /const unjudged = Object\.values\(markets\)\.filter\(\(m\) => m\.unjudged\)\.length;/,
      "the unjudged count is unconditional; the categories overlap by design",
    );
  });
});

describe("the sealed artifact's disposition ladder, pinned at the source", () => {
  // The sealed ledgered read is written once and can never be rewritten, so
  // its disposition matters more than anywhere else — and a behavioural test
  // reaches only one of the four causes of NO VERDICT (the fixture that drives
  // a frozen candidate is underpowered). Three mutations of this ladder
  // survived the entire suite when it was written: keying on `underpowered`
  // instead of `noVerdict`, sending an ABSENT verdict to "rejected", and
  // collapsing the judged refusal into "no-verdict".
  //
  // The repository already pins the printed label's shape this way, for the
  // same reason: what must not change is which FIELD the branch reads.
  const SOURCE = readFileSync("scripts/grid-totalr.ts", "utf8");

  it("sends an ABSENT verdict to no-verdict, never to a rejection", () => {
    assert.match(
      SOURCE,
      /const disposition = !verdict\s*\n\s*\?\s*"no-verdict" as const/,
      "a candidate the gate produced no verdict for has not been rejected",
    );
  });

  it("keys the second branch on the gate's own noVerdict, not on one of its causes", () => {
    assert.match(
      SOURCE,
      /\?\s*"no-verdict" as const\s*\n\s*:\s*verdict\.noVerdict\s*\n\s*\?\s*"no-verdict" as const/,
      "underpowered, absent baseline, sub-floor pairing and an empty fit fold " +
        "are all no verdict; the ladder must read the disposition, not one leg",
    );
  });

  it("keeps a judged refusal distinct from a refusal to judge", () => {
    assert.match(
      SOURCE,
      /:\s*verdict\.accepted\s*\n\s*\?\s*"accepted" as const\s*\n\s*:\s*"rejected" as const/,
      "the final branch is the only one that may say rejected",
    );
  });

  it("keeps the selective note on the printed label", () => {
    // The note names the share a selective variant trades. Dropping it from
    // the label left the suite green, and it sits on a line this change set
    // edits, so it is pinned here rather than left to the next reader.
    assert.match(
      SOURCE,
      /:\s*verdict\.reason\) \+ selectiveNote;/,
      "a judged verdict prints its reason AND the selective note",
    );
  });
});
