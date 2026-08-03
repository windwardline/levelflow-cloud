import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  type FetchedLifetimeSetupRow,
  LEDGER_WINDOW_ROWS,
  LIFETIME_MAX_PAGES,
  LIFETIME_PAGE_ROWS,
  paginateLifetimeSetups,
} from "../src/lib/tradeAnalyzer";

// Spec §18 (amendment 2, owner 2026-08-02: "Can we let it involve the engine?
// If so, do it. I want accuracy."): Attribution and the record band read the
// LIFETIME record, not the ledger's display window. The read that serves them
// walks every one of the caller's rows under existing RLS, through the one
// normalizer every trade_setups read already passes (PR #186), and it never
// returns a truncated set while claiming a lifetime.

const ANALYZER_SOURCE = readFileSync("src/lib/tradeAnalyzer.ts", "utf8");

function lifetimeRow(
  index: number,
  overrides: Partial<FetchedLifetimeSetupRow> = {},
): FetchedLifetimeSetupRow {
  return {
    confidence_score: 78,
    created_at: new Date(Date.UTC(2026, 7, 1, 12, 0, index)).toISOString(),
    id: `setup-${index}`,
    side: "buy",
    status: "closed",
    symbol: "EURUSD",
    trade_outcomes: null,
    ...overrides,
  };
}

function fullPage(startIndex: number): FetchedLifetimeSetupRow[] {
  return Array.from(
    { length: LIFETIME_PAGE_ROWS },
    (_, offset) => lifetimeRow(startIndex + offset),
  );
}

function lifetimeSelect(): string {
  return ANALYZER_SOURCE.match(/const LIFETIME_SELECT =\s*\n?\s*"([^"]*)"/)?.[1] ??
    "";
}

/** The setup columns the lifetime read asks for, in the order it asks for them. */
function selectedColumns(): string[] {
  return lifetimeSelect().split(", trade_outcomes")[0].split(", ").filter(Boolean);
}

/** The embed's own fields, same order. */
function selectedOutcomeFields(): string[] {
  return (lifetimeSelect().match(/trade_outcomes\(([^)]*)\)/)?.[1] ?? "")
    .split(", ")
    .filter(Boolean);
}

/**
 * The field names a `Pick<>`-based row type names, in declaration order — read
 * from source, because a type is not there to read at runtime. Sorted on both
 * sides of the comparison, so this pins the SET of fields rather than an order
 * neither the wire nor the type cares about.
 */
function pickedFields(typeName: string): string[] {
  const declaration = ANALYZER_SOURCE.match(
    new RegExp(`export type ${typeName} = Pick<[\\s\\S]*?>`),
  )?.[0] ?? "";
  return Array.from(
    declaration.matchAll(/"([a-z_]+)"/g),
    (match) => match[1],
  ).sort();
}

function recordingReader(pages: FetchedLifetimeSetupRow[][]) {
  const ranges: Array<[number, number]> = [];
  const read = (from: number, to: number) => {
    ranges.push([from, to]);
    return Promise.resolve(pages[ranges.length - 1] ?? []);
  };
  return { ranges, read };
}

describe("paginateLifetimeSetups — the lifetime walk (spec §18)", () => {
  it("names its own page size and page ceiling, so the guard reads the numbers the code does", () => {
    assert.equal(LIFETIME_PAGE_ROWS, 500);
    assert.equal(LIFETIME_MAX_PAGES, 40);
  });

  it("asks for one page and stops when that page is short", async () => {
    const reader = recordingReader([[lifetimeRow(0), lifetimeRow(1)]]);

    const rows = await paginateLifetimeSetups(reader.read);

    assert.deepEqual(reader.ranges, [[0, LIFETIME_PAGE_ROWS - 1]]);
    assert.deepEqual(rows.map((row) => row.id), ["setup-0", "setup-1"]);
  });

  it("walks past the ledger's display window — the page is not the record", async () => {
    // The defect the ruling closes: 80 rows is what the ledger reads, and an
    // aggregate that stopped there would publish a lifetime claim about a page.
    const reader = recordingReader([fullPage(0), [lifetimeRow(500)]]);

    const rows = await paginateLifetimeSetups(reader.read);

    assert.ok(rows.length > LEDGER_WINDOW_ROWS);
    assert.equal(rows.length, LIFETIME_PAGE_ROWS + 1);
    assert.deepEqual(reader.ranges, [
      [0, LIFETIME_PAGE_ROWS - 1],
      [LIFETIME_PAGE_ROWS, LIFETIME_PAGE_ROWS * 2 - 1],
    ]);
  });

  it("stops on the first short page and asks for nothing after it", async () => {
    const reader = recordingReader([
      fullPage(0),
      [lifetimeRow(500), lifetimeRow(501)],
      [lifetimeRow(9000)],
    ]);

    const rows = await paginateLifetimeSetups(reader.read);

    assert.equal(reader.ranges.length, 2);
    assert.equal(rows.length, LIFETIME_PAGE_ROWS + 2);
    assert.equal(
      rows.some((row) => row.id === "setup-9000"),
      false,
    );
  });

  it("counts a row that shifts across a page boundary mid-walk exactly once", async () => {
    // Offset pages describe a moving table: a setup inserted while the walk is
    // in flight pushes every row down one place, so the last row of page 0
    // arrives again as the first row of page 1. Summed twice it would inflate
    // every figure it touches, which is why the walk keys rows by id.
    const firstPage = fullPage(0);
    const reader = recordingReader([
      firstPage,
      [firstPage[LIFETIME_PAGE_ROWS - 1], lifetimeRow(500), lifetimeRow(501)],
    ]);

    const rows = await paginateLifetimeSetups(reader.read);

    assert.equal(rows.length, LIFETIME_PAGE_ROWS + 2);
    assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  });

  it("keeps the read's own newest-first order across pages", async () => {
    const reader = recordingReader([[lifetimeRow(2), lifetimeRow(1), lifetimeRow(0)]]);

    const rows = await paginateLifetimeSetups(reader.read);

    assert.deepEqual(rows.map((row) => row.id), [
      "setup-2",
      "setup-1",
      "setup-0",
    ]);
  });

  it("normalizes an object-shaped embed, the way every other read of this table does (PR #186)", async () => {
    // PostgREST sends the one-to-one embed as an OBJECT, and every reader in
    // the app indexes trade_outcomes[0]. A second read that skipped the shared
    // normalizer would hand the aggregates resolved rows that read as open.
    const reader = recordingReader([[
      lifetimeRow(0, {
        trade_outcomes: {
          feedback: { realizedR: 1.5 },
          filled_at: "2026-08-01T12:00:00.000Z",
          outcome: "take_profit",
        },
      }),
    ]]);

    const rows = await paginateLifetimeSetups(reader.read);

    assert.deepEqual(rows[0].trade_outcomes?.map((outcome) => outcome.outcome), [
      "take_profit",
    ]);
  });

  it("leaves a row with no outcome row undefined rather than a one-null array", async () => {
    const reader = recordingReader([[lifetimeRow(0, { trade_outcomes: null })]]);

    const rows = await paginateLifetimeSetups(reader.read);

    assert.equal(rows[0].trade_outcomes, undefined);
  });

  it("refuses to return a truncated walk as a lifetime — it throws at the page ceiling", async () => {
    // No silent failure: an account too large for a client-side walk gets the
    // read's own error (the surface's existing load-failed line), never an
    // aggregate that claims lifetime over the first 20,000 rows.
    let pagesRead = 0;
    const readAlwaysFull = (from: number) => {
      pagesRead += 1;
      return Promise.resolve(fullPage(from));
    };

    await assert.rejects(
      () => paginateLifetimeSetups(readAlwaysFull),
      /history/i,
    );
    assert.equal(pagesRead, LIFETIME_MAX_PAGES);
  });
});

describe("fetchLifetimeSetups — the read itself (source-pinned)", () => {
  const fetchSource =
    ANALYZER_SOURCE.match(/export async function fetchLifetimeSetups[\s\S]*?\n}\n/)
      ?.[0] ?? "";

  it("exists and pages the table with range, the only pagination this client has", () => {
    assert.ok(fetchSource.length > 0, "expected fetchLifetimeSetups");
    assert.match(fetchSource, /\.range\(from, to\)/);
    assert.match(fetchSource, /paginateLifetimeSetups\(/);
  });

  it("orders on a total order, so an offset page cannot reshuffle under the walk", () => {
    // created_at alone is not unique: rows written inside one transaction share
    // it exactly, and equal keys make offset paging non-deterministic. The id
    // tie-break is what makes page k+1 continue where page k stopped.
    assert.match(fetchSource, /\.order\("created_at", \{ ascending: false \}\)/);
    assert.match(fetchSource, /\.order\("id", \{ ascending: false \}\)/);
  });

  it("selects only the fields the two aggregates read — no analysis payload", () => {
    // ~5.6KB of confluence + risk_model per row is what the ledger's own read
    // carries for the Advisor handoff. The lifetime read carries none of it:
    // measured 2026-08-03, that is the difference between ~0.3KB and ~5.9KB a
    // row on a read whose row count only grows.
    assert.ok(selectedColumns().length > 0, "expected the lifetime select list");
    assert.match(fetchSource, /\.select\(LIFETIME_SELECT\)/);
    const select = lifetimeSelect();
    assert.doesNotMatch(select, /confluence/);
    assert.doesNotMatch(select, /risk_model/);
    assert.doesNotMatch(select, /limit_entry|stop_loss|take_profit/);
    assert.deepEqual(
      selectedColumns(),
      ["id", "symbol", "side", "confidence_score", "status", "created_at"],
    );
    // The outcome embed carries exactly what resolution and realizedR need, and
    // nothing more: reviewed_at has no reader anywhere in src, and a selected
    // column with no reader is a payload with no purpose.
    assert.deepEqual(selectedOutcomeFields(), [
      "outcome",
      "filled_at",
      "feedback",
    ]);
    assert.doesNotMatch(select, /reviewed_at/);
  });

  it("promises in the row type exactly what the select fetches, both directions", () => {
    // The shape-lie class one step removed from PR #186: a row type that carries
    // the whole TradeOutcomeRow while the query fetches three of its fields hands
    // the next reader `realized_pnl: number | string | null` where the runtime has
    // undefined, with the compiler agreeing. The types are Pick-ed down to the
    // select, and these two comparisons are what keep the pair honest — adding a
    // field to either side alone fails here.
    assert.deepEqual(
      pickedFields("LifetimeOutcomeRow"),
      [...selectedOutcomeFields()].sort(),
    );
    assert.deepEqual(
      pickedFields("LifetimeSetupRow"),
      [...selectedColumns()].sort(),
    );
  });

  it("keeps the ledger's own read at its named display window", () => {
    // §18: "The ledger's 80-row read is a display window; Attribution is not
    // inside it." The window stays — it now has a name, so nothing reads 80 as
    // the record.
    assert.equal(LEDGER_WINDOW_ROWS, 80);
    assert.match(
      ANALYZER_SOURCE.match(/export async function fetchTradeSetups[\s\S]*?\n}\n/)
        ?.[0] ?? "",
      /\.limit\(LEDGER_WINDOW_ROWS\)/,
    );
    assert.doesNotMatch(ANALYZER_SOURCE, /\.limit\(80\)/);
  });

  it("reads the table from exactly three places, all through the one embed reader", () => {
    // The window read, the lifetime walk, and the rail's by-id hydration read
    // (spec §8's beyond-window actives) — no fourth reader may appear without
    // facing this count and the shape rule below.
    assert.equal(
      (ANALYZER_SOURCE.match(/\.from\("trade_setups"\)/g) ?? []).length,
      3,
    );
    assert.match(
      ANALYZER_SOURCE.match(
        /export async function paginateLifetimeSetups[\s\S]*?\n}\n/,
      )?.[0] ?? "",
      /normalizeEmbeddedOutcome\(row\.trade_outcomes\)/,
    );
    // One shape rule in the whole module, whichever read arrives at it: PR #186's
    // fix is only a fix while object-versus-array is decided in one place.
    assert.equal((ANALYZER_SOURCE.match(/Array\.isArray\(/g) ?? []).length, 1);
  });
});
