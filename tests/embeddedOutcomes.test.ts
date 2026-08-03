import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { formatInsightsResult } from "../src/components/workspace/historyUtils.ts";
import {
  type FetchedTradeSetupRow,
  normalizeEmbeddedOutcomes,
  type TradeOutcomeRow,
  type TradeSetupRow,
} from "../src/lib/tradeAnalyzer.ts";
import { deriveTradeState } from "../src/lib/tradeState.ts";

// The 2026-08-02 incident: four trades resolved overnight — three stopped out,
// one banked its first target — and every one of them read "Open" in the
// Insights ledger. The database was right (status 'filled', the matching
// trade_outcomes row, correct feedback) and so was every formatter. What was
// wrong was the SHAPE the rows arrived in.
//
// trade_outcomes.setup_id carries `unique (setup_id)` (supabase/init.sql), which
// is exactly what PostgREST detects as the "to-one" end of a one-to-one
// relationship: "One-to-one relationships are detected when the foreign key is
// also a primary key, or when the foreign key has a unique constraint", and the
// embedded resource then comes back as a JSON OBJECT, not an array
// (docs.postgrest.org, Resource Embedding). Every reader in the app takes the
// first element of an array — tradeState.ts's deriveTradeState and
// entryHasFilled, lib/outcomes.ts's normalizeSetupOutcome, historyUtils.ts's
// extractRealizedR — so `trade_outcomes[0]` was undefined on every row that had
// an outcome, and a resolved trade reached the ledger indistinguishable from one
// the engine had never reviewed. The ledger's own honest answer for a filled row
// with no outcome row is "Open" (§17b), which is the word the owner saw.
//
// So the fix is at the one seam where the wire meets the app's row type, and
// these are its tests: the shape in both directions, the four rows that reported
// it, and the schema fact the normalizer's premise rests on.

const NOW = new Date("2026-08-02T12:00:00.000Z");

function buildOutcome(
  overrides: Partial<TradeOutcomeRow> = {},
): TradeOutcomeRow {
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

function buildFetchedRow(
  overrides: Partial<FetchedTradeSetupRow> = {},
): FetchedTradeSetupRow {
  return {
    analyzer_version: "2026.08.01.window-feasible",
    breakeven_trigger_price: 1,
    confidence_score: 78,
    confluence: {},
    correlation_group: "crypto",
    created_at: "2026-08-01T18:05:00.000Z",
    id: "setup-1",
    limit_entry: 1.5,
    origin: "scan",
    risk_model: {},
    side: "sell",
    status: "filled",
    stop_loss: 1.6,
    symbol: "SOLUSD",
    take_profit: 1.3,
    take_profit_1: 1.4,
    trade_outcomes: null,
    ...overrides,
  };
}

describe("normalizeEmbeddedOutcomes — the embed shape PostgREST actually delivers", () => {
  it("wraps the single embedded object in the one-element array every reader indexes", () => {
    const outcome = buildOutcome({ outcome: "stop_loss" });

    const [row] = normalizeEmbeddedOutcomes([
      buildFetchedRow({ trade_outcomes: outcome }),
    ]);

    assert.deepEqual(row.trade_outcomes, [outcome]);
  });

  it("passes an array embed through untouched", () => {
    // The shape PostgREST sends for a to-many end. Nothing in the schema
    // produces it today, and if the one-per-setup constraint were ever dropped
    // it is what would arrive — so the normalizer reads the wire rather than
    // assuming one shape and inverting the defect.
    const outcomes = [buildOutcome({ outcome: "take_profit" })];

    const [row] = normalizeEmbeddedOutcomes([
      buildFetchedRow({ trade_outcomes: outcomes }),
    ]);

    assert.deepEqual(row.trade_outcomes, outcomes);
  });

  it("reads an absent embed as no outcome row at all", () => {
    // A setup the engine has not reviewed yet embeds as null (PostgREST) or is
    // missing entirely; both mean the same thing to every reader, and neither
    // may become a phantom row.
    for (const embed of [null, undefined]) {
      const [row] = normalizeEmbeddedOutcomes([
        buildFetchedRow({ trade_outcomes: embed }),
      ]);

      assert.equal(row.trade_outcomes?.[0], undefined);
    }
  });

  it("leaves every other column of the fetched row alone", () => {
    const fetched = buildFetchedRow({
      symbol: "ETHUSD",
      trade_outcomes: buildOutcome({ outcome: "stop_loss" }),
    });

    const [row] = normalizeEmbeddedOutcomes([fetched]);

    assert.deepEqual(
      { ...row, trade_outcomes: undefined },
      { ...fetched, trade_outcomes: undefined },
    );
  });
});

// The incident's own rows: the owner's four setups from 2026-08-01, with the
// statuses, outcomes and feedback production holds, arriving in the shape the
// browser actually receives them in.
const OWNER_ROWS: Array<{ result: string; row: FetchedTradeSetupRow }> = [
  {
    result: "Stopped · −1.0R",
    row: buildFetchedRow({
      id: "solusd-1",
      side: "sell",
      symbol: "SOLUSD",
      trade_outcomes: buildOutcome({
        exit_at: "2026-08-01T19:45:00.000Z",
        feedback: { realizedR: -1 },
        filled_at: "2026-08-01T18:30:00.000Z",
        outcome: "stop_loss",
        reviewed_at: "2026-08-01T20:00:00.000Z",
      }),
    }),
  },
  {
    result: "Stopped · −1.0R",
    row: buildFetchedRow({
      id: "xrpusd-1",
      side: "sell",
      symbol: "XRPUSD",
      trade_outcomes: buildOutcome({
        exit_at: "2026-08-01T20:30:00.000Z",
        feedback: { realizedR: -1 },
        filled_at: "2026-08-01T19:00:00.000Z",
        outcome: "stop_loss",
        reviewed_at: "2026-08-01T21:00:00.000Z",
      }),
    }),
  },
  {
    result: "Stopped · −1.0R",
    row: buildFetchedRow({
      id: "ethusd-1",
      side: "sell",
      symbol: "ETHUSD",
      trade_outcomes: buildOutcome({
        exit_at: "2026-08-01T21:00:00.000Z",
        feedback: { realizedR: -1 },
        filled_at: "2026-08-01T19:20:00.000Z",
        outcome: "stop_loss",
        reviewed_at: "2026-08-01T21:15:00.000Z",
      }),
    }),
  },
  {
    result: "Banked half · +0.4R",
    row: buildFetchedRow({
      id: "adausd-1",
      side: "buy",
      symbol: "ADAUSD",
      trade_outcomes: buildOutcome({
        exit_at: "2026-08-02T07:00:00.000Z",
        feedback: { realizedR: 0.4, tp1Hit: true },
        filled_at: "2026-08-01T22:10:00.000Z",
        outcome: "tp1_partial",
        reviewed_at: "2026-08-02T07:05:00.000Z",
      }),
    }),
  },
];

describe("the four trades that reported this (owner, 2026-08-02)", () => {
  it("prints the resolution each one actually had, never Open", () => {
    for (const { result, row } of OWNER_ROWS) {
      const [normalized] = normalizeEmbeddedOutcomes([row]);

      assert.equal(
        formatInsightsResult(normalized, NOW),
        result,
        `${row.symbol} read the wrong result`,
      );
    }
  });

  it("keeps all four off the Current trades rail, before and after", () => {
    // The rail was never the surface that lied: status 'filled' returns null
    // from deriveTradeState whatever the embed looks like, so these four have
    // been correctly absent from it throughout. Pinned so the fix is not read as
    // having moved them there.
    for (const { row } of OWNER_ROWS) {
      const [normalized] = normalizeEmbeddedOutcomes([row]);

      // The wire row itself, cast the way the fetch used to hand it over.
      assert.equal(
        deriveTradeState(row as unknown as TradeSetupRow, NOW),
        null,
      );
      assert.equal(deriveTradeState(normalized, NOW), null);
    }
  });
});

describe("the live Target 1 state the same shape silenced", () => {
  it("reaches the rail's bank-half instruction and its R once the embed is normalized", () => {
    // The other reader of feedback the object shape hid. This one never reached
    // Insights — it is an open position, so it lives on the rail — and it read
    // as a trade that had not banked anything yet.
    const [row] = normalizeEmbeddedOutcomes([
      buildFetchedRow({
        limit_entry: 1.5,
        status: "placed",
        trade_outcomes: buildOutcome({
          feedback: { realizedR: 0.5, tp1Hit: true },
          filled_at: "2026-08-01T22:10:00.000Z",
        }),
      }),
    ]);

    const state = deriveTradeState(row, NOW);

    assert.equal(state?.progressR, 0.5);
    assert.equal(state?.tp1Banked, true);
    assert.match(state?.instruction ?? "", /^Target 1 hit — bank half/);
  });
});

describe("both directions — the schema fact the normalizer follows from", () => {
  it("keeps one outcome row per setup, the constraint that makes the embed a to-one end", () => {
    // Not decoration: this constraint is the whole reason PostgREST sends an
    // object. If it is ever dropped, the embed becomes an array and the comment
    // at normalizeEmbeddedOutcomes stops being true of this schema — so the
    // premise is pinned where the fix can see it.
    assert.match(
      readFileSync("supabase/init.sql", "utf8"),
      /constraint trade_outcomes_one_per_setup unique \(setup_id\)/,
    );
  });

  it("keeps both outcome writers upserting on that same key", () => {
    // The independent proof the constraint is live in production, not just in
    // init.sql: PostgREST rejects on_conflict against a column with no unique
    // index, and these two upserts are what write every resolution.
    for (
      const file of [
        "supabase/functions/outcome-sync/index.ts",
        "supabase/functions/trade-analyzer/index.ts",
      ]
    ) {
      const source = readFileSync(file, "utf8");
      const upsert = source.match(
        /"trade_outcomes",[\s\S]*?\n {4}"setup_id",\n/,
      );
      assert.ok(upsert, `${file} must upsert trade_outcomes on setup_id`);
    }
  });

  it("routes every trade_setups read through the normalizer", () => {
    // One seam, so a second fetch path cannot quietly reintroduce wire-shaped
    // rows. The normalizer is only a fix while every row the app renders has
    // passed through it — and spec §18's lifetime read is the second reader of
    // this embed, which is exactly the case this guard was written for.
    const source = readFileSync("src/lib/tradeAnalyzer.ts", "utf8");
    const selectors = sourceFiles("src").filter((file) =>
      readFileSync(file, "utf8").includes('from("trade_setups")')
    );

    assert.deepEqual(selectors, ["src/lib/tradeAnalyzer.ts"]);
    assert.match(
      source.match(/export async function fetchTradeSetups[\s\S]*?\n}\n/)?.[0] ??
        "",
      /normalizeEmbeddedOutcomes\(/,
    );
    // The lifetime read normalizes in its walk, so the pin follows it there —
    // and the walk is where every page lands, first or fortieth.
    assert.match(
      source.match(/export async function fetchLifetimeSetups[\s\S]*?\n}\n/)
        ?.[0] ?? "",
      /paginateLifetimeSetups\(/,
    );
    assert.match(
      source.match(
        /export async function paginateLifetimeSetups[\s\S]*?\n}\n/,
      )?.[0] ?? "",
      /normalizeEmbeddedOutcome\(row\.trade_outcomes\)/,
    );
    // One shape rule, not two. The two reads select different outcome fields, so
    // each keeps its own row type — but object-versus-array is decided once, in
    // normalizeEmbeddedOutcome, and that is the whole of PR #186's fix.
    assert.equal(
      (source.match(/export function normalizeEmbeddedOutcome\b/g) ?? []).length,
      1,
    );
    assert.equal((source.match(/Array\.isArray\(/g) ?? []).length, 1);
  });
});

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
