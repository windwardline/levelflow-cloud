import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { formatInsightsResult } from "../src/components/workspace/historyUtils.ts";
import {
  classifyWinLoss,
  normalizeSetupOutcome,
  OUTCOME_COPY,
  type SetupOutcome,
} from "../src/lib/outcomes.ts";
import type { TradeSetupRow } from "../src/lib/tradeAnalyzer.ts";

describe("outcome copy — plain target vocabulary", () => {
  // §17d re-derives every OUTCOME_COPY label from the canonical result words,
  // so this bucket now reads the same "Banked half" the ledger renders rather
  // than a second phrasing of it. The original point of this test stands: not
  // TP1, and not a first/second-target restatement of the ladder.
  it("labels the partial-target outcome as the banked half, not TP1 (§17d)", () => {
    assert.equal(OUTCOME_COPY.partial_target.label, "Banked half");
    assert.equal(OUTCOME_COPY.partial_target.filterLabel, "Banked half");
    assert.equal(OUTCOME_COPY.partial_target.shortLabel, "Banked half");
  });

  it("describes the partial-target outcome in first/second-target language", () => {
    assert.match(OUTCOME_COPY.partial_target.description, /first target/i);
    assert.match(OUTCOME_COPY.partial_target.description, /second target/i);
  });

  it("never mentions TP1 or runner in any outcome copy string", () => {
    for (const [outcome, copy] of Object.entries(OUTCOME_COPY)) {
      for (const [field, value] of Object.entries(copy)) {
        assert.doesNotMatch(value, /\bTP1\b/, `${outcome}.${field}: "${value}"`);
        assert.doesNotMatch(
          value,
          /\brunner\b/i,
          `${outcome}.${field}: "${value}"`,
        );
      }
    }
  });
});

// classifyWinLoss (fix round 1): single source of truth for the ladder's
// money-positive/negative split, previously duplicated independently in
// useTradeSetups.ts's buildStats and historyUtils.ts's buildRecordBand (and
// a third copy in historyUtils.ts's buildConfidenceBands) — a future
// outcome-taxonomy change could otherwise update one copy and silently
// leave the others behind.
describe("classifyWinLoss — single source of truth for the ladder's win/loss split", () => {
  const wins: SetupOutcome[] = [
    "target_reached",
    "partial_target",
    "expired_in_profit",
  ];
  const losses: SetupOutcome[] = ["stopped_out", "expired_in_loss"];
  const neither: SetupOutcome[] = [
    "still_tracking",
    "unclear_path",
    "entry_not_filled",
    // A manual close records where the position ended but not which level it
    // was heading for, so it belongs on neither side of a win/loss ratio.
    "closed_manually",
  ];

  for (const outcome of wins) {
    it(`classifies "${outcome}" as a win`, () => {
      assert.equal(classifyWinLoss(outcome), "win");
    });
  }
  for (const outcome of losses) {
    it(`classifies "${outcome}" as a loss`, () => {
      assert.equal(classifyWinLoss(outcome), "loss");
    });
  }
  for (const outcome of neither) {
    it(`classifies "${outcome}" as neither win nor loss`, () => {
      assert.equal(classifyWinLoss(outcome), "neither");
    });
  }

  it("covers every SetupOutcome value with no gaps, cross-checked against OUTCOME_COPY's own key set", () => {
    // OUTCOME_COPY is keyed by the full SetupOutcome union (TypeScript
    // enforces this via Record<SetupOutcome, ...>), so its key set is the
    // canonical list of every value classifyWinLoss must handle. A future
    // new outcome added to the union without a matching entry here would
    // fail this assertion instead of silently falling through to
    // "neither".
    assert.deepEqual(
      [...wins, ...losses, ...neither].sort(),
      Object.keys(OUTCOME_COPY).sort(),
    );
  });

  it("every known win/loss call site classifies through the shared helper, not a re-derived condition (drift guard)", () => {
    // Every file with a business reason to know "is this outcome a win or
    // a loss," and exactly how many independent classifyWinLoss call sites
    // each one currently has. A count per file, not a single assert.match,
    // so a future re-introduction of an inline copy in any one function
    // (without touching its sibling call sites in the same file) can't
    // hide behind the others still calling through — and so a *fifth*
    // stray copy anywhere, in a file not listed here at all, still fails
    // this test the moment someone adds this file to the map (the whole
    // point of the fix-round-1/2 history behind this test: three
    // independent copies were found here across two rounds already).
    const expectedCallSites: Record<string, number> = {
      // buildRecordBand, buildConfidenceBands, getOutcomeClassName.
      "src/components/workspace/historyUtils.ts": 3,
      // buildAttribution (spec §18). Added consciously, which is what this
      // map is for: Attribution needs the money-positive split for its
      // class/side/session slices, and one call is all it may have. That
      // single call is also its resolved gate — §18 counts resolved rows
      // only, and "neither" is exactly the unresolved set — so a second call
      // here would mean the resolved test and the win test had drifted
      // apart into two independent readings of the same taxonomy. Its
      // confidence slice adds no call of its own: it reuses
      // buildConfidenceBands, which is already counted above.
      "src/components/workspace/attribution.ts": 1,
      // profileInsights.ts (buildProfileReviewPattern) was the fourth call
      // site until it was deleted as a UI-unused orphan — ConfidenceGauge's
      // sibling orphan, both swept in the same final fix wave.
      // useTradeSetups.ts's buildStats was the other original call site
      // until the Desk recomposition (spec §16) deleted its last consumer
      // (the DATA/SESSION/ADVISOR/MARKET HISTORY tiles) and the whole
      // per-symbol stats machinery went with it, 2026-07-31.
    };

    for (const [file, expectedCount] of Object.entries(expectedCallSites)) {
      const source = readFileSync(file, "utf8");
      const actualCount = (source.match(/classifyWinLoss\(/g) ?? []).length;
      assert.equal(
        actualCount,
        expectedCount,
        `${file} must classify win/loss through the shared lib/outcomes.ts helper exactly ${expectedCount} time(s) — found ${actualCount}`,
      );
    }
  });
});

// Insights ledger result labels (spec §10). Same builder shape as
// tests/tradeState.test.ts and tests/currentTradesRail.test.tsx.
type OutcomeRow = NonNullable<TradeSetupRow["trade_outcomes"]>[number];

const NOW = new Date("2026-07-30T12:00:00.000Z");

function buildSetup(overrides: Partial<TradeSetupRow> = {}): TradeSetupRow {
  return {
    analyzer_version: "unversioned",
    breakeven_trigger_price: 1.0865,
    confidence_score: 78,
    confluence: {},
    correlation_group: null,
    created_at: "2026-07-30T09:00:00.000Z",
    id: "setup-1",
    limit_entry: 1.0865,
    origin: "review",
    risk_model: {},
    side: "buy",
    status: "generated",
    stop_loss: 1.083,
    symbol: "EURUSD",
    take_profit: 1.095,
    take_profit_1: 1.09,
    trade_outcomes: undefined,
    ...overrides,
  };
}

function buildOutcome(overrides: Partial<OutcomeRow> = {}): OutcomeRow {
  return {
    exit_at: null,
    feedback: {},
    filled_at: null,
    outcome: "pending",
    realized_pnl: null,
    reviewed_at: null,
    ...overrides,
  };
}

describe("formatInsightsResult — one label per outcome class (spec §10)", () => {
  it("an unfilled, freshly generated setup reads Pending, never with an R", () => {
    assert.equal(
      formatInsightsResult(buildSetup({ status: "generated" }), NOW),
      "Pending",
    );
  });

  it("a filled, unresolved setup with no realizedR yet reads bare Open", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ feedback: { tp1Hit: false } })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Open");
  });

  it("a filled, unresolved setup carries its realizedR when the engine has one", () => {
    const setup = buildSetup({
      status: "placed",
      trade_outcomes: [buildOutcome({ feedback: { realizedR: 0.8 } })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Open · +0.8R");
  });

  it("target_reached reads Banked full, bare when no realizedR is recorded (§17d)", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Banked full");
  });

  it("target_reached carries its realizedR (§17d: Banked full replaces the old result label)", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: 2.1 }, outcome: "take_profit" }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Banked full · +2.1R");
  });

  it("partial_target (tp1_partial) reads Banked half with its realizedR, exactly per spec's example", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: 0.4 }, outcome: "tp1_partial" }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Banked half · +0.4R");
  });

  it("stopped_out reads Stopped with a negative realizedR, exactly per spec's example (typographic minus)", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: -1 }, outcome: "stop_loss" }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Stopped · −1.0R");
  });

  it("stopped_out reads bare Stopped when no realizedR is recorded", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [buildOutcome({ outcome: "stop_loss" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Stopped");
  });

  it("expired_in_profit reads one-word Expired, the R saying where it stood (§17d)", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({
          feedback: { realizedR: 0.3 },
          outcome: "expired_in_profit",
        }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Expired · +0.3R");
  });

  it("expired_in_loss reads the same one-word Expired, the R saying where it stood (§17d)", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({
          feedback: { realizedR: -0.5 },
          outcome: "expired_at_loss",
        }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Expired · −0.5R");
  });

  // Controller ruling (wave-4 dispatch, disclose-at-re-present): "Needs review"
  // collided with the Review verb the stage's one action carries — a result that
  // reads like an instruction. One word, and it says exactly what the bucket
  // means: the chart cannot tell which level came first.
  it("unclear_path (ambiguous) reads Unclear — one word, no collision with the Review action", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [buildOutcome({ outcome: "ambiguous" })],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Unclear");
  });

  // Controller ruling, the two enum values §17d had no word for. Both are
  // unreachable today — the engine writes neither; they exist in
  // supabase/init.sql's enum — so this completes the table rather than changing
  // any rendered row.
  it("breakeven reads Banked half — a stop moved to entry is only ever post-TP1", () => {
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: 0.5 }, outcome: "breakeven" }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Banked half · +0.5R");
  });

  it("manual_close reads Closed, with its R when one was recorded", () => {
    const closedWithR = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: -0.2 }, outcome: "manual_close" }),
      ],
    });
    assert.equal(formatInsightsResult(closedWithR, NOW), "Closed · −0.2R");
    const closedWithoutR = buildSetup({
      status: "filled",
      trade_outcomes: [buildOutcome({ outcome: "manual_close" })],
    });
    assert.equal(formatInsightsResult(closedWithoutR, NOW), "Closed");
  });

  // Spec §17: "Insights result 'Not taken' is dead. entry_not_filled reads
  // 'Unfilled' for every origin — a market fact (price never reached the
  // entry inside the window), never a claim about what the user did. The
  // label logic reads no origin." The three-way loop is the whole ruling: one
  // word, whatever the row's provenance, including a row that carries none.
  it('entry_not_filled reads "Unfilled" for every origin (spec §17)', () => {
    for (const origin of ["scan", "review", undefined] as const) {
      const setup = buildSetup({
        origin,
        status: "expired",
        trade_outcomes: [buildOutcome({ outcome: "unfilled" })],
      });
      assert.equal(
        formatInsightsResult(setup, NOW),
        "Unfilled",
        `origin ${String(origin)} must not change the label`,
      );
    }
  });

  it("reads no origin at all when labelling a result (spec §17)", () => {
    // The absence direction, at the source: the ruling is not "both origins
    // happen to produce the same string today" but "the label logic reads no
    // origin". Since §17m made tradeState.ts origin-blind too, the column now has
    // no reader anywhere in src — it is selected and stored, and nothing branches
    // on it. This pins Insights' half of that.
    const source = readFileSync(
      "src/components/workspace/historyUtils.ts",
      "utf8",
    );
    const formatter = source.match(
      /export function formatInsightsResult[\s\S]*?\n}\n/,
    )?.[0] ?? "";
    assert.ok(formatter.length > 0, "expected to find formatInsightsResult");
    assert.doesNotMatch(formatter, /\borigin\b/);
    assert.doesNotMatch(source, /Not taken/);
  });

  it("never renders the raw origin value anywhere in the label (owner ruling: no origin in the UI)", () => {
    for (
      const origin of ["review", "scan"] as const
    ) {
      const setup = buildSetup({
        origin,
        status: "filled",
        trade_outcomes: [buildOutcome({ outcome: "take_profit" })],
      });
      assert.doesNotMatch(formatInsightsResult(setup, NOW), /review|scan/i);
    }
  });

  // §17b: an unresolved row reads the lifecycle word the state machine
  // actually reports, never "Still tracking". A row with no outcome row at all
  // has no fill evidence, so it reads Pending — the same word the trades rail
  // gives an order that is placed and waiting.
  it("labels an unresolved row with no outcome row Pending, not a tracking word (§17b)", () => {
    const setup = buildSetup({ status: "cancelled", trade_outcomes: undefined });
    assert.equal(formatInsightsResult(setup, NOW), "Pending");
  });

  it("labels an unresolved row whose entry has filled Open, with its R when measured (§17b)", () => {
    // status "filled" carrying the literal outcome "pending" is a data anomaly
    // (a resolved status with an unresolved outcome) — the honest word for it is
    // the state its fill evidence supports, not a tracking word. This case used
    // outcome "breakeven" until the controller gave that enum its own word;
    // "pending" is now the only outcome still reaching this branch.
    const setup = buildSetup({
      status: "filled",
      trade_outcomes: [
        buildOutcome({ feedback: { realizedR: 0.2 }, outcome: "pending" }),
      ],
    });
    assert.equal(formatInsightsResult(setup, NOW), "Open · +0.2R");
  });
});

// §17b (owner ruling, 2026-07-31) established one lifecycle vocabulary on
// every surface; §17d fixed the words themselves, owner-approved verbatim, and
// supersedes §17b's table: Pending / Open · ±R / Unfilled / Banked half · +R /
// Banked full · +R / Stopped · −R / Expired · ±R. The tracking phrase and its
// short form stay banned. This is the both-directions guard for the Result
// column: every reachable row produces a word from that set, and no
// combination of status and outcome can produce a banned one.
describe("§17d — the Insights Result column speaks one canonical vocabulary", () => {
  // The completed table: §17d's owner-approved seven, plus the two words the
  // controller ruled on in wave 4 to finish it (disclose-at-re-present).
  const LIFECYCLE_WORDS = [
    // §17d's canonical seven, owner-approved verbatim, in its own order.
    "Pending",
    "Open",
    "Unfilled",
    "Banked half",
    "Banked full",
    "Stopped",
    "Expired",
    // Eighth: unclear_path is the engine's own "the available chart cannot
    // confirm whether stop or target came first" bucket. None of the seven is
    // true of such a row, and the alternatives are to claim an outcome the data
    // does not support or to render an empty cell. It read "Needs review" until
    // wave 4 — a result phrased as an instruction, colliding with the stage's
    // own Review action — and is now one word for one fact.
    "Unclear",
    // Ninth, and unreachable: the engine writes no manual_close today, but the
    // enum has the value and a result column must have a word for every value
    // it can be handed. "Closed" claims nothing about direction; the R beside
    // it, when one was recorded, says where the position ended.
    "Closed",
  ];
  const STATUSES = [
    "generated",
    "placed",
    "filled",
    "invalidated",
    "cancelled",
    "expired",
  ];
  const OUTCOMES = [
    "pending",
    "unfilled",
    "take_profit",
    "stop_loss",
    "breakeven",
    "manual_close",
    "expired",
    "ambiguous",
    "tp1_partial",
    "expired_in_profit",
    "expired_at_loss",
  ];

  it("produces only lifecycle words across every status × outcome × origin combination", () => {
    for (const status of STATUSES) {
      for (const outcome of OUTCOMES) {
        for (const origin of ["review", "scan", undefined] as const) {
          for (const withRow of [true, false]) {
            const setup = buildSetup({
              origin,
              status,
              trade_outcomes: withRow
                ? [buildOutcome({ feedback: { realizedR: 1.5 }, outcome })]
                : undefined,
            });
            const label = formatInsightsResult(setup, NOW);
            const word = label.split(" · ")[0];
            assert.ok(
              LIFECYCLE_WORDS.includes(word),
              `${status}/${outcome}/${String(origin)} produced "${label}"`,
            );
            assert.doesNotMatch(label, /still tracking/i);
            assert.doesNotMatch(label, /\btracking\b/i);
            assert.doesNotMatch(label, /Not taken/);
          }
        }
      }
    }
  });

  it("keeps the banned words out of every OUTCOME_COPY field", () => {
    for (const [outcome, copy] of Object.entries(OUTCOME_COPY)) {
      for (const [field, value] of Object.entries(copy)) {
        assert.doesNotMatch(
          value,
          /still tracking/i,
          `${outcome}.${field}: "${value}"`,
        );
        assert.doesNotMatch(
          value,
          /^\s*Tracking\s*$/,
          `${outcome}.${field}: "${value}"`,
        );
      }
    }
  });

  it("reads the unresolved bucket's filter option as Pending & open — existing vocabulary only", () => {
    assert.equal(OUTCOME_COPY.still_tracking.filterLabel, "Pending & open");
    assert.equal(OUTCOME_COPY.still_tracking.label, "Pending & open");
    assert.equal(OUTCOME_COPY.still_tracking.shortLabel, "Pending & open");
    // The description prose may stay, aligned to the same two words.
    assert.match(OUTCOME_COPY.still_tracking.description, /still pending or open/);
  });

  // The completed table, in one place: every label, filter option and short form
  // is one of the nine words, and each bucket's three agree. This is what makes
  // the vocabulary a table rather than nine independent strings — and it is the
  // guard that catches a tenth word before anyone reads it in production.
  it("renders one of the nine words in every label field, and never the retired wording", () => {
    const allowed = new Set([...LIFECYCLE_WORDS, "Pending & open"]);
    for (const [outcome, copy] of Object.entries(OUTCOME_COPY)) {
      for (const field of ["filterLabel", "label", "shortLabel"] as const) {
        assert.ok(
          allowed.has(copy[field]),
          `${outcome}.${field} is "${copy[field]}", which is not in the table`,
        );
      }
      // A bucket's three label forms are one word wearing three hats; a short
      // form that abbreviates differently is how "Review" came to sit under
      // "Needs review" in the first place.
      assert.equal(copy.label, copy.filterLabel, outcome);
      assert.equal(copy.label, copy.shortLabel, outcome);
      for (const [field, value] of Object.entries(copy)) {
        assert.doesNotMatch(
          value,
          /needs review/i,
          `${outcome}.${field}: "${value}"`,
        );
      }
    }
  });

  it("gives every engine outcome enum value a word — none falls through to the unresolved bucket", () => {
    // The enum lives in supabase/init.sql and is mirrored in tradeState.ts's
    // RESOLVED_OUTCOMES. Every resolved value must normalize onto a resolved
    // bucket: before wave 4, `breakeven` and `manual_close` fell through to the
    // unresolved one, so a closed row would have read as still open.
    const resolved = OUTCOMES.filter((outcome) => outcome !== "pending");
    for (const outcome of resolved) {
      const setup = buildSetup({
        status: "filled",
        trade_outcomes: [buildOutcome({ outcome })],
      });
      const label = formatInsightsResult(setup, NOW);
      assert.notEqual(
        label,
        "Open",
        `${outcome} must not read as an open position`,
      );
      assert.notEqual(label, "Pending", `${outcome} must not read as pending`);
    }
  });
});

// M6: the 60-second outcome-refresh throttle is module scope, and it was
// stamped in a `finally` — so a refresh that THREW bought itself a full
// blackout, and the stamp survived sign-out to gate the next account's first
// load. Both are one-line repairs and neither was documented either way. Read
// as source: this hook needs a React renderer, and this repo's unit stack has
// no jsdom (see tests/confidenceUnit.test.tsx's header for the technique).
describe("the outcome-refresh throttle earns its blackout", () => {
  const hook = readFileSync("src/hooks/useTradeSetups.ts", "utf8");

  it("stamps the throttle only after a refresh that actually succeeded", () => {
    assert.doesNotMatch(hook, /finally \{\s*lastOutcomeRefreshAt = Date\.now\(\);/);
    assert.match(
      hook,
      /await refreshTradeOutcomes\(\);[\s\S]{0,400}lastOutcomeRefreshAt = Date\.now\(\);\s*\} catch/,
    );
  });

  it("clears the throttle on sign-out, since it outlives the session", () => {
    // The span allows for the lifetime record being emptied on the same branch
    // (spec §18): sign-out clears both row sets and then the throttle.
    assert.match(
      hook,
      /\} else \{\s*setSetups\(\[\]\);\s*setLifetimeSetups\(\[\]\);[\s\S]{0,300}lastOutcomeRefreshAt = 0;/,
    );
  });
});

// Q2-M3: this module's header reasons carefully about the two unreachable enum
// values it re-routes (manual_close, breakeven) and skipped the third. A bare
// "expired" outcome fell into entry_not_filled → "Unfilled", which asserts a
// market fact — price never reached the entry inside the window — that the enum
// value does not support: a FILLED row carrying it would have read "Unfilled".
// Legacy-only (the engine's ResolvedOutcome union omits it), which is why nothing
// caught it. Routed by fill evidence now, and where the fill says the position
// was live, "Unclear" is the honest word: the row ended, and nothing recorded
// says where.
describe("a bare legacy \"expired\" outcome is routed by fill evidence (Q2-M3)", () => {
  const base = {
    analyzer_version: "test",
    confidence_score: 70,
    confluence: null,
    correlation_group: "EURUSD",
    created_at: "2026-06-16T12:00:00.000Z",
    id: "x",
    limit_entry: 1.1,
    risk_model: null,
    side: "buy" as const,
    stop_loss: 1,
    symbol: "EURUSD",
    take_profit: 1.3,
  };

  it("still reads Unfilled when the entry never filled", () => {
    assert.equal(
      normalizeSetupOutcome({
        ...base,
        status: "generated",
        trade_outcomes: [{ outcome: "expired" }],
      }),
      "entry_not_filled",
    );
  });

  it("never claims Unfilled for a row whose entry did fill", () => {
    for (const filled of [
      { status: "filled", trade_outcomes: [{ outcome: "expired" }] },
      { status: "placed", trade_outcomes: [{ outcome: "expired" }] },
      {
        status: "generated",
        trade_outcomes: [
          { filled_at: "2026-06-16T13:00:00.000Z", outcome: "expired" },
        ],
      },
    ]) {
      const outcome = normalizeSetupOutcome({ ...base, ...filled });
      assert.equal(outcome, "unclear_path", JSON.stringify(filled));
      // And the record cannot score it as a win or a loss on no evidence.
      assert.equal(classifyWinLoss(outcome), "neither");
    }
  });

  it("leaves the expired STATUS alone — an expired order that never filled is Unfilled", () => {
    assert.equal(
      normalizeSetupOutcome({ ...base, status: "expired", trade_outcomes: [] }),
      "entry_not_filled",
    );
  });
});
