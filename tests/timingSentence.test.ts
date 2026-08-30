import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildTimingSentence } from "../src/components/workspace/SetupQualityReceipt.tsx";

/**
 * The Timing row told operators there was no news penalty on setups the engine
 * had already penalised.
 *
 * TWO DEFECTS, both in one expression — `upcomingNewsEvents + headlineNewsEvents`:
 *
 *   ACTIVE EVENTS WERE MISSING. calculateNewsPenaltyUnits (newsRules.ts) bills
 *   every NON-BLOCKING active event, and `isBlockingNewsEvent` is high-impact
 *   non-headlines only — so a medium release five minutes old is charged 0.5
 *   and appears in `active`, which the sum never read. Upcoming empty,
 *   headlines zero, count zero, and the row printed "no event or headline
 *   penalty" over a real charge.
 *
 *   HEADLINES WERE COUNTED TWICE. `headlineCount` is
 *   `upcoming.filter(headline).length` (index.ts) — a SUBSET of upcoming, not a
 *   sibling. One headline read as two factors.
 *
 * The two errors point opposite ways, so a setup with one upcoming headline and
 * one active medium event scored 2 factors when the honest answer is also 2 —
 * agreeing by accident, on different rows, which is why nothing caught it.
 *
 * Fixtures STATE their expected output. They do not recompute it from the
 * function's own expression, or the test would agree with whatever the code
 * does next.
 */

const LONDON = { label: "London session" };

describe("the Timing row", () => {
  // Every case below passes "read" explicitly: they are claims about a calendar
  // that ANSWERED, and the withholding branch is its own describe block. Left
  // implicit, they would silently become claims about provenance instead.
  it("does not claim 'no penalty' when the engine charged one", () => {
    // THE DEFECT, as its own case. A medium print inside the active window:
    // nothing upcoming, no headlines, and 0.5 units already off the score.
    const sentence = buildTimingSentence(LONDON, 1, 0.5, "read");
    assert.doesNotMatch(sentence, /no event or headline penalty/);
    assert.equal(
      sentence,
      "London session with 1 event or headline factor affecting timing.",
    );
  });

  it("says no penalty only when there is no penalty", () => {
    assert.equal(
      buildTimingSentence(LONDON, 0, 0, "read"),
      "London session with no event or headline penalty.",
    );
  });

  it("counts a headline once", () => {
    // One upcoming headline. Under the retired expression this was
    // upcoming(1) + headlineSubset(1) = 2.
    assert.equal(
      buildTimingSentence(LONDON, 1, 0.25, "read"),
      "London session with 1 event or headline factor affecting timing.",
    );
  });

  it("pluralises on the real count", () => {
    assert.equal(
      buildTimingSentence(LONDON, 3, 1.5, "read"),
      "London session with 3 event or headline factors affecting timing.",
    );
  });

  it("never prints a zero count beside a real charge", () => {
    // The verdict comes from the penalty and the number from the count, so the
    // two can in principle disagree. When they do, the sentence drops the
    // number rather than announcing "0 factors" — a refusal to state a figure
    // it cannot stand behind, not a silent fallback to the all-clear.
    const sentence = buildTimingSentence(LONDON, 0, 0.5, "read");
    assert.doesNotMatch(sentence, /\b0\b/);
    assert.doesNotMatch(sentence, /no event or headline penalty/);
    assert.equal(
      sentence,
      "London session with an event or headline factor affecting timing.",
    );
  });

  it("withholds the whole row without a session label", () => {
    assert.equal(buildTimingSentence({}, 2, 1, "read"), "—");
  });
});

describe("the row reads the fields that carry the charge", () => {
  const source = readFileSync(
    "src/components/workspace/SetupQualityReceipt.tsx",
    "utf8",
  );

  it("passes active + upcoming, and the penalty, never the headline subset", () => {
    assert.match(
      source,
      /buildTimingSentence\(\s*sessionContext,\s*activeNewsEvents \+ upcomingNewsEvents,\s*newsPenaltyUnits,\s*calendarSource,\s*\)/,
      "the Timing row is not reading active events, the penalty and the " +
        "calendar's provenance",
    );
    assert.doesNotMatch(
      source,
      /upcomingNewsEvents \+ headlineNewsEvents/,
      "headlines are being added to upcoming again, which double-counts them",
    );
  });

  it("takes activeEvents, penaltyUnits and calendarSource off the wire", () => {
    // index.ts writes confluence.newsContext as
    // { activeEvents, headlineEvents, penaltyUnits, upcomingEvents }. Reading a
    // name the engine does not write yields undefined, coerces to 0, and
    // reinstates the all-clear silently — so the names are pinned to the
    // engine's own.
    const engine = readFileSync(
      "supabase/functions/trade-analyzer/index.ts",
      "utf8",
    );
    const block = engine.slice(engine.indexOf("newsContext: {"));
    const body = block.slice(0, block.indexOf("},"));
    for (const field of ["activeEvents", "calendarSource", "penaltyUnits"]) {
      assert.ok(
        body.includes(`${field}:`),
        `the engine no longer writes newsContext.${field}`,
      );
      assert.match(
        source,
        new RegExp(`newsContext\\.${field}`),
        `the receipt no longer reads newsContext.${field}`,
      );
    }
  });
});

describe("the Timing row when the calendar was not read", () => {
  // C8. One window query returning zero rows is byte-identical whether the
  // calendar is clear or the ingest is dead, and the dead case has happened in
  // production (migration 20260729040000's header). A zero penalty from an
  // empty table is not an all-clear — nothing was checked — so the row
  // WITHHOLDS rather than hedging, which is the same call #441 made for the
  // replay record.
  it("withholds the all-clear on a stale calendar", () => {
    const sentence = buildTimingSentence(LONDON, 0, 0, "stale");
    assert.doesNotMatch(sentence, /no event or headline penalty/);
    assert.equal(
      sentence,
      "London session. Upcoming events could not be checked for this review.",
    );
  });

  it("separates a stale calendar from an unreadable one", () => {
    // TWO DIFFERENT ABSENCES, and the first version printed one sentence over
    // both. `unavailable` means the read failed and nothing is known. `stale`
    // means the table ANSWERED — past headlines really were read — and only
    // forward coverage is missing. They are not interchangeable.
    assert.notEqual(
      buildTimingSentence(LONDON, 0, 0, "stale"),
      buildTimingSentence(LONDON, 0, 0, "unavailable"),
    );
  });

  it("reports a real charge on a stale calendar instead of denying it", () => {
    // THE FALSE STATEMENT IN THE OTHER DIRECTION. A stale calendar still read
    // the past half of its window, so a charge from it is real. Printing
    // "News could not be checked" over a setup the news check demonstrably
    // penalised is as wrong as the all-clear this branch was added to prevent
    // — and the earlier version did exactly that.
    const sentence = buildTimingSentence(LONDON, 2, 1.0, "stale");
    assert.match(sentence, /2 event or headline factors affecting timing/);
    assert.match(sentence, /Upcoming events could not be checked/);
    assert.doesNotMatch(sentence, /News could not be checked/);
  });

  it("withholds it when the read failed outright", () => {
    assert.equal(
      buildTimingSentence(LONDON, 0, 0, "unavailable"),
      "London session. News could not be checked for this review.",
    );
  });

  it("keeps the session label, which the venue clock earns either way", () => {
    // sessions.ts derives the label from the venue calendar, not from the news
    // table, so it stays honest when the calendar does not. Withholding the
    // whole row would throw away a true statement to avoid a false one.
    assert.match(buildTimingSentence(LONDON, 0, 0, "stale"), /^London session/);
  });

  it("still refuses everything when the read itself failed", () => {
    // CORRECTED. This asserted that provenance outranks the number for BOTH
    // absences, which was right for `unavailable` and wrong for `stale`: a
    // stale calendar did read its past window, so denying a charge it really
    // made was a false statement in the opposite direction. `unavailable` is
    // where nothing is known and nothing may be reported.
    assert.equal(
      buildTimingSentence(LONDON, 2, 1.0, "unavailable"),
      "London session. News could not be checked for this review.",
    );
  });
});
