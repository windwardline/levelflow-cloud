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
  it("does not claim 'no penalty' when the engine charged one", () => {
    // THE DEFECT, as its own case. A medium print inside the active window:
    // nothing upcoming, no headlines, and 0.5 units already off the score.
    const sentence = buildTimingSentence(LONDON, 1, 0.5);
    assert.doesNotMatch(sentence, /no event or headline penalty/);
    assert.equal(
      sentence,
      "London session with 1 event or headline factor affecting timing.",
    );
  });

  it("says no penalty only when there is no penalty", () => {
    assert.equal(
      buildTimingSentence(LONDON, 0, 0),
      "London session with no event or headline penalty.",
    );
  });

  it("counts a headline once", () => {
    // One upcoming headline. Under the retired expression this was
    // upcoming(1) + headlineSubset(1) = 2.
    assert.equal(
      buildTimingSentence(LONDON, 1, 0.25),
      "London session with 1 event or headline factor affecting timing.",
    );
  });

  it("pluralises on the real count", () => {
    assert.equal(
      buildTimingSentence(LONDON, 3, 1.5),
      "London session with 3 event or headline factors affecting timing.",
    );
  });

  it("never prints a zero count beside a real charge", () => {
    // The verdict comes from the penalty and the number from the count, so the
    // two can in principle disagree. When they do, the sentence drops the
    // number rather than announcing "0 factors" — a refusal to state a figure
    // it cannot stand behind, not a silent fallback to the all-clear.
    const sentence = buildTimingSentence(LONDON, 0, 0.5);
    assert.doesNotMatch(sentence, /\b0\b/);
    assert.doesNotMatch(sentence, /no event or headline penalty/);
    assert.equal(
      sentence,
      "London session with an event or headline factor affecting timing.",
    );
  });

  it("withholds the whole row without a session label", () => {
    assert.equal(buildTimingSentence({}, 2, 1), "—");
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
      /buildTimingSentence\(\s*sessionContext,\s*activeNewsEvents \+ upcomingNewsEvents,\s*newsPenaltyUnits,\s*\)/,
      "the Timing row is not reading active events and the penalty",
    );
    assert.doesNotMatch(
      source,
      /upcomingNewsEvents \+ headlineNewsEvents/,
      "headlines are being added to upcoming again, which double-counts them",
    );
  });

  it("takes activeEvents and penaltyUnits off the wire the engine writes", () => {
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
    for (const field of ["activeEvents", "penaltyUnits"]) {
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
