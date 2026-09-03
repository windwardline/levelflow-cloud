import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { sha256Hex, stableStringify } from "../scripts/sweepManifest.ts";
import {
  buildProvenance,
  DAY_MS,
  foldWindows,
  overlapDays,
  overlapMs,
  overrideDiffers,
  parseVariant,
  readVerifiedManifest,
  recutSpan,
  selectionAsWindow,
  TRANCHES,
  type ManifestLike,
  type MarketProvenance,
  type Span,
  type TrancheName,
  type TrancheRecord,
  type TrancheSummary,
  confirmationAsWindow,
} from "../scripts/shipped-cell-provenance.ts";

/**
 * R4 act 2, review rows D1 and D2(a): a confirm figure must be able to say
 * whether it is held back. The provenance reader derives that per market
 * from the record; these cases pin the arithmetic, the derivation rules,
 * the refusals, the flag law (executed), and the tracked artifact's
 * agreement with itself and with its inputs.
 */

const REPO = process.cwd();
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const READER = join(REPO, "scripts", "shipped-cell-provenance.ts");
const TRACKED = join(REPO, "docs", "research", "r4", "shipped-cell-provenance.json");

const HOUR = 3_600_000;
const FIT_START = Date.UTC(2010, 0, 1);
const SELECT_START = Date.UTC(2018, 0, 1);
const CONFIRM_START = Date.UTC(2022, 6, 1);
const END = Date.UTC(2026, 8, 1);
const TAIL = 5 * DAY_MS;
// The selection calendar's select fold closes twelve days before R3's confirm
// fold opens — the 8–12 day gap the design's lens measured on the real folds.
const SELECTION_GAP = 12 * DAY_MS;
// The pre-R0 clock stamped the selection calendar hours earlier than R3's.
const CLOCK_SHIFT = 4 * HOUR;

function fold(name: string, startMs: number, endMs: number) {
  return { name, startMs, endMs, decisionEndMs: endMs - TAIL };
}
const R3_FOLDS = [
  fold("fit", FIT_START, SELECT_START),
  fold("select", SELECT_START, CONFIRM_START),
  fold("confirm", CONFIRM_START, END),
];
const SELECTION_FOLDS = [
  fold("fit", FIT_START - CLOCK_SHIFT, SELECT_START - CLOCK_SHIFT),
  fold("select", SELECT_START - CLOCK_SHIFT, CONFIRM_START - SELECTION_GAP),
  fold("confirm", CONFIRM_START - SELECTION_GAP, END - 30 * DAY_MS),
];

const V3 =
  "confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=3";
const V1 =
  "confidenceThreshold=0,runnerProtection=trail_tp1,maxStopAtrMultiplier=4,sizingHoursFactor=1";
const O3 = {
  confidenceThreshold: 0,
  maxStopAtrMultiplier: 4,
  runnerProtection: "trail_tp1",
  sizingHoursFactor: 3,
};
const O1 = { ...O3, sizingHoursFactor: 1 };

type Fixture = {
  symbol: string;
  assetType: string;
  symbolOverride: Record<string, unknown>;
  span: Span;
};
const LONG_CRYPTO: Span = { firstTime: Date.UTC(2013, 10, 3), lastTime: Date.UTC(2026, 7, 1) };
const ROSTER: Fixture[] = [
  // Totality pick on a span whose re-cut select quarter reaches into R3's
  // confirm fold: NOT held back.
  { symbol: "AAVEUSD", assetType: "crypto", symbolOverride: O1, span: { firstTime: Date.UTC(2020, 10, 6), lastTime: Date.UTC(2026, 7, 1) } },
  // Confirmed positive in derived-4d but the R3 manifest carries no layer.
  { symbol: "ETHUSD", assetType: "crypto", symbolOverride: {}, span: LONG_CRYPTO },
  // The plain derived-4d and holdout-cycle cases: class folds, held back.
  { symbol: "EURUSD", assetType: "forex", symbolOverride: O3, span: { firstTime: FIT_START, lastTime: END } },
  { symbol: "GBPUSD", assetType: "forex", symbolOverride: O3, span: { firstTime: FIT_START, lastTime: END } },
  // Frozen in derived-4d, failed confirm, ships the class row.
  { symbol: "HOUSD", assetType: "forex", symbolOverride: {}, span: { firstTime: Date.UTC(2023, 8, 24), lastTime: END } },
  // Confirmed in totality as V3 but the manifest's layer says threshold 30.
  { symbol: "LTCUSD", assetType: "crypto", symbolOverride: { ...O3, confidenceThreshold: 30 }, span: LONG_CRYPTO },
  // Never picked anywhere.
  { symbol: "NIKKEI", assetType: "forex", symbolOverride: {}, span: { firstTime: Date.UTC(2023, 9, 2), lastTime: END } },
  // Confirmed in BOTH derived-4d and totality: the later tranche wins.
  { symbol: "XRPUSD", assetType: "crypto", symbolOverride: O3, span: LONG_CRYPTO },
  // Totality pick whose whole span predates R3's confirm fold: held back;
  // its layer also carries a legacy field the pick does not name.
  { symbol: "ZBUSD", assetType: "forex", symbolOverride: { tp1RiskShare: 0.6, ...O3 }, span: { firstTime: FIT_START, lastTime: Date.UTC(2020, 0, 1) } },
];

function r3Manifest(overrides: Partial<ManifestLike> = {}): ManifestLike {
  return {
    analyzerVersion: "2026.09.02.test",
    clock: { calendar: "test-calendar", normalizer: "test-normalizer" },
    manifestHash: "unverified-fixture",
    // Deliberately unsorted: the artifact sorts, so a roster order change
    // cannot move a market's row.
    requestedSymbols: ROSTER.map((entry) => entry.symbol).reverse(),
    holdoutSymbols: ["GBPUSD"],
    foldsByClass: { forex: R3_FOLDS, crypto: R3_FOLDS },
    symbols: ROSTER.map(({ symbol, assetType, symbolOverride }) => ({
      symbol,
      assetType,
      symbolOverride,
      series: { "15min": { firstTime: FIT_START, lastTime: END } },
    })),
    ...overrides,
  };
}

function selectionManifest(
  members: Fixture[],
  overrides: Partial<ManifestLike> = {},
): ManifestLike {
  return {
    analyzerVersion: "2026.08.11.engine-v2",
    manifestHash: "unverified-fixture",
    foldsByClass: { forex: SELECTION_FOLDS, crypto: SELECTION_FOLDS },
    symbols: members.map((entry) => ({
      symbol: entry.symbol,
      series: {
        "15min": { firstTime: entry.span.firstTime, lastTime: entry.span.lastTime },
      },
    })),
    ...overrides,
  };
}

function tranche(
  name: TrancheName,
  picks: Record<string, string>,
  deltas: Record<string, number | null>,
): TrancheRecord {
  const entry = TRANCHES.find((candidate) => candidate.tranche === name)!;
  return {
    tranche: name,
    selection: entry.selection,
    picks: {
      analyzerVersion: "2026.08.11.engine-v2",
      frozenAt: "2026-08-11T16:42:57.940Z",
      finalPicks: Object.fromEntries(
        Object.entries(picks).map(([symbol, variant]) => [symbol, { variant }]),
      ),
    },
    confirm: {
      readAt: "2026-08-11T16:44:30.892Z",
      confirmReport: Object.fromEntries(
        Object.entries(picks).map(([symbol, variant]) => [
          symbol,
          { variant, confirmTotalDelta: deltas[symbol] ?? null },
        ]),
      ),
    },
  };
}

function tranches(): TrancheRecord[] {
  return [
    tranche(
      "derived-4d",
      { EURUSD: V3, HOUSD: V3, XRPUSD: V3, ETHUSD: V3 },
      { EURUSD: 10, HOUSD: -3, XRPUSD: 5, ETHUSD: 2 },
    ),
    tranche("holdout-cycle", { GBPUSD: V3, AAVEUSD: V1 }, { GBPUSD: 4, AAVEUSD: 0 }),
    tranche(
      "totality",
      { AAVEUSD: V1, XRPUSD: V3, ZBUSD: V3, LTCUSD: V3 },
      { AAVEUSD: 1, XRPUSD: 3, ZBUSD: 2, LTCUSD: 1 },
    ),
  ];
}

type Body = {
  markets: MarketProvenance[];
  summary: {
    markets: number;
    derived: number;
    notDerived: number;
    tranches: Record<TrancheName, TrancheSummary>;
    shippedDerivedCells: number;
    heldBack: number;
    notHeldBack: number;
    undeterminable: number;
    undeterminableDerived: number;
    heldBackFromGlobal?: number;
    notHeldBackFromGlobal?: number;
    multiplyConfirmed: Record<string, TrancheName[]>;
    withinOneDayOfBoundary: string[];
    reasons: Record<string, string>;
  };
  inputs: { r3: { requestedSymbols: number }; selection: { path: string }[] };
  generatedAt: string;
};

function build(extra: Partial<Parameters<typeof buildProvenance>[0]> = {}): Body {
  return buildProvenance({
    r3: { path: "r3.manifest.json", manifest: r3Manifest() },
    tranches: tranches(),
    // Two selection manifests, so the span merge across shards is exercised.
    selection: [
      { path: "sel-a.manifest.json", manifest: selectionManifest(ROSTER.slice(0, 5)) },
      { path: "sel-b.manifest.json", manifest: selectionManifest(ROSTER.slice(5)) },
    ],
    ...extra,
  }) as unknown as Body;
}

function marketOf(body: Body, symbol: string): MarketProvenance {
  const market = body.markets.find((entry) => entry.symbol === symbol);
  assert.ok(market, `${symbol} must have a row`);
  return market;
}

describe("the per-market re-cut — grid-totalr's arithmetic, copied", () => {
  it("cuts a span at 50% and 75% by decision time", () => {
    // The re-cut's last quarter is the CONFIRMATION window (the totality
    // tranche confirmed its picks there), carried so held-back can clear it.
    assert.deepEqual(recutSpan({ firstTime: 0, lastTime: 1000 }), {
      confirmEndMs: 1000,
      confirmStartMs: 750,
      fitStartMs: 0,
      selectStartMs: 500,
      selectEndMs: 750,
    });
    // Structural, independent of the formula: fit is two quarters, select
    // one, and the confirm remainder equals the select quarter.
    const span = { firstTime: Date.UTC(2020, 10, 6), lastTime: Date.UTC(2026, 7, 1) };
    const cut = recutSpan(span);
    const quarter = cut.selectEndMs - cut.selectStartMs;
    assert.equal(cut.fitStartMs, span.firstTime);
    assert.equal(cut.selectStartMs - cut.fitStartMs, quarter * 2);
    assert.equal(span.lastTime - cut.selectEndMs, quarter);
    // Pinned against the retired flag's literal arithmetic.
    assert.equal(cut.selectStartMs, span.firstTime + (span.lastTime - span.firstTime) * 0.5);
    assert.equal(cut.selectEndMs, span.firstTime + (span.lastTime - span.firstTime) * 0.75);
  });
});

describe("overlap between two windows", () => {
  const week = { startMs: 0, endMs: 7 * DAY_MS };
  it("touching windows share zero days, in either order", () => {
    const next = { startMs: 7 * DAY_MS, endMs: 14 * DAY_MS };
    assert.equal(overlapDays(week, next), 0);
    assert.equal(overlapDays(next, week), 0);
  });
  it("a nested window contributes its own length", () => {
    const inner = { startMs: 2 * DAY_MS, endMs: 5 * DAY_MS };
    assert.equal(overlapDays(week, inner), 3);
    assert.equal(overlapDays(inner, week), 3);
  });
  it("disjoint is zero, partial is the intersection, identical is the whole", () => {
    assert.equal(overlapDays(week, { startMs: 30 * DAY_MS, endMs: 31 * DAY_MS }), 0);
    assert.equal(overlapDays(week, { startMs: 5 * DAY_MS, endMs: 20 * DAY_MS }), 2);
    assert.equal(overlapDays(week, week), 7);
    assert.equal(overlapMs(week, { startMs: 3 * DAY_MS, endMs: 3 * DAY_MS }), 0);
    // Fractional days survive: heldBack must be read off zero, not a rounding.
    assert.equal(overlapDays(week, { startMs: 7 * DAY_MS - HOUR, endMs: 9 * DAY_MS }), 1 / 24);
  });
  it("a selection window is read from fit start to select end", () => {
    assert.deepEqual(
      selectionAsWindow({ confirmEndMs: 4, confirmStartMs: 3, fitStartMs: 1, selectStartMs: 2, selectEndMs: 3 }),
      { startMs: 1, endMs: 3 },
    );
  });
});

describe("a fold calendar is named and ordered or refused", () => {
  it("returns the three windows and a null decisionEndMs where absent", () => {
    const windows = foldWindows(
      [
        { name: "fit", startMs: 0, endMs: 10 },
        { name: "select", startMs: 10, endMs: 20 },
        { name: "confirm", startMs: 20, endMs: 30, decisionEndMs: 25 },
      ],
      "fixture",
    );
    assert.deepEqual(windows.fit, { startMs: 0, endMs: 10, decisionEndMs: null });
    assert.deepEqual(windows.confirm, { startMs: 20, endMs: 30, decisionEndMs: 25 });
  });
  it("refuses a missing fold, a repeated fold, and an unordered calendar", () => {
    assert.throws(
      () => foldWindows([{ name: "fit", startMs: 0, endMs: 1 }], "fixture"),
      /must name fit, select and confirm/,
    );
    assert.throws(
      () =>
        foldWindows(
          [
            { name: "fit", startMs: 0, endMs: 1 },
            { name: "fit", startMs: 1, endMs: 2 },
          ],
          "fixture",
        ),
      /appears twice/,
    );
    assert.throws(
      () =>
        foldWindows(
          [
            { name: "fit", startMs: 0, endMs: 10 },
            { name: "select", startMs: 5, endMs: 20 },
            { name: "confirm", startMs: 20, endMs: 30 },
          ],
          "fixture",
        ),
      /not ordered/,
    );
    assert.throws(() => foldWindows("nope", "fixture"), /not a list/);
  });
});

describe("a pick variant against the per-symbol layer", () => {
  it("parses k=v pairs and names the fields the layer does not carry", () => {
    assert.deepEqual(parseVariant("a=1,b=x"), { a: "1", b: "x" });
    assert.deepEqual(overrideDiffers(O3, V3), []);
    assert.deepEqual(overrideDiffers({ tp1RiskShare: 0.6, ...O3 }, V3), []);
    assert.deepEqual(overrideDiffers({ ...O3, confidenceThreshold: 30 }, V3), [
      "confidenceThreshold",
    ]);
    assert.deepEqual(overrideDiffers({}, V3), Object.keys(parseVariant(V3)));
    assert.throws(() => parseVariant("a=1,nonsense"), /without key=value/);
  });
});

describe("buildProvenance on a synthetic record", () => {
  it("attributes each shipped cell to its tranche and states whether it is held back", () => {
    const body = build();
    assert.deepEqual(
      body.markets.map((market) => market.symbol),
      ["AAVEUSD", "ETHUSD", "EURUSD", "GBPUSD", "HOUSD", "LTCUSD", "NIKKEI", "XRPUSD", "ZBUSD"],
      "rows are sorted by symbol regardless of the roster's order",
    );

    const eurusd = marketOf(body, "EURUSD");
    assert.equal(eurusd.derived, true);
    assert.equal(eurusd.tranche, "derived-4d");
    assert.equal(eurusd.pickVariant, V3);
    assert.equal(eurusd.shippedVariant, "baseline");
    assert.deepEqual(
      {
        fitStartMs: eurusd.selectionWindow!.fitStartMs,
        selectStartMs: eurusd.selectionWindow!.selectStartMs,
        selectEndMs: eurusd.selectionWindow!.selectEndMs,
      },
      {
        fitStartMs: FIT_START - CLOCK_SHIFT,
        selectStartMs: SELECT_START - CLOCK_SHIFT,
        selectEndMs: CONFIRM_START - SELECTION_GAP,
      },
    );
    assert.equal(eurusd.overlapWithR3ConfirmDays, 0, "its SELECTION window clears R3's confirm fold");
    // …but its CONFIRMATION window — the tranche's confirm fold, where the
    // cell read positive and was shipped — overlaps R3's confirm fold, so the
    // cell is NOT held back: a positive figure for it here is survivor
    // selection (act 2's refuter, item 5).
    assert.ok(eurusd.selectionWindow!.confirmStartMs < eurusd.selectionWindow!.confirmEndMs);
    assert.ok(eurusd.overlapWithR3ConfirmDaysFromConfirmation! > 0);
    assert.equal(eurusd.heldBack, false);
    assert.equal(eurusd.marginToR3ConfirmDays, 12);
    assert.equal(
      eurusd.overlapWithR3SelectDays,
      (CONFIRM_START - SELECTION_GAP - SELECT_START) / DAY_MS,
    );
    assert.deepEqual(eurusd.r3ConfirmWindow, {
      startMs: CONFIRM_START,
      endMs: END,
      decisionEndMs: END - TAIL,
    });
    assert.equal(eurusd.reason, undefined);

    const gbpusd = marketOf(body, "GBPUSD");
    assert.equal(gbpusd.tranche, "holdout-cycle");
    assert.equal(gbpusd.heldBack, false, "confirmed on dates inside R3's confirm fold");

    // Totality: the re-cut select quarter reaches into R3's confirm fold.
    const aave = marketOf(body, "AAVEUSD");
    assert.equal(aave.tranche, "totality");
    assert.equal(aave.pickVariant, V1);
    assert.deepEqual(aave.selectionWindow, recutSpan(ROSTER[0].span));
    assert.deepEqual(aave.selectionSpan, ROSTER[0].span);
    assert.ok(aave.overlapWithR3ConfirmDays! > 0);
    assert.equal(aave.heldBack, false);
    assert.ok(aave.marginToR3ConfirmDays! < 0);
    // Its earlier, unconfirmed holdout pick is recorded beside it with the
    // class-fold window that tranche selected on.
    assert.deepEqual(
      aave.picks.map((pick) => [pick.tranche, pick.confirmed, pick.overlapWithR3ConfirmDays]),
      [["holdout-cycle", false, 0], ["totality", true, aave.overlapWithR3ConfirmDays]],
    );

    // Totality on a span that ends before R3's confirm fold: held back, and
    // the legacy field the pick never named rides along in the layer.
    const zb = marketOf(body, "ZBUSD");
    assert.equal(zb.tranche, "totality");
    assert.equal(zb.overlapWithR3ConfirmDays, 0, "its selection window clears the fold");
    // Its re-cut confirmation quarter ends with its span, before R3's fold
    // opens: clear of both windows, so held back — the one cell in this
    // fixture that is.
    assert.equal(zb.overlapWithR3ConfirmDaysFromConfirmation, 0);
    assert.equal(zb.heldBack, true);
    assert.equal(zb.symbolOverride.tp1RiskShare, 0.6);
    assert.ok(zb.marginToR3ConfirmDays! > 0);

    // Confirmed twice: the later tranche's cell is the shipped one.
    const xrp = marketOf(body, "XRPUSD");
    assert.equal(xrp.tranche, "totality");
    assert.equal(xrp.heldBack, false);
    assert.deepEqual(body.summary.multiplyConfirmed, { XRPUSD: ["derived-4d", "totality"] });
  });

  it("never guesses: a market whose provenance the record cannot state gets tranche null and a reason", () => {
    const body = build();
    const nikkei = marketOf(body, "NIKKEI");
    assert.equal(nikkei.derived, false);
    assert.equal(nikkei.tranche, null);
    assert.equal(nikkei.pickVariant, null);
    assert.deepEqual(nikkei.picks, []);
    assert.equal(nikkei.selectionWindow, null);
    assert.equal(nikkei.overlapWithR3ConfirmDays, null);
    assert.equal(nikkei.heldBack, null);
    assert.match(nikkei.reason!, /no per-symbol layer: the shipped cell is the class row/);

    const housd = marketOf(body, "HOUSD");
    assert.equal(housd.derived, false);
    assert.equal(housd.tranche, null);
    assert.equal(housd.picks[0].confirmed, false);
    assert.equal(housd.heldBack, null);

    const eth = marketOf(body, "ETHUSD");
    assert.equal(eth.derived, false);
    assert.equal(eth.tranche, null);
    assert.equal(eth.picks[0].confirmed, true);
    assert.match(eth.reason!, /confirmed positive in derived-4d but the R3 manifest carries no per-symbol layer/);

    const ltc = marketOf(body, "LTCUSD");
    assert.equal(ltc.derived, true);
    assert.equal(ltc.tranche, null);
    assert.equal(ltc.heldBack, null);
    assert.equal(ltc.selectionWindow, null);
    assert.match(ltc.reason!, /confirmed in totality as .* differs on confidenceThreshold/);
  });

  it("counts per tranche over picks and over shipped cells, and the totals agree with the rows", () => {
    const body = build();
    const expect = (
      picksFrozen: number,
      picksConfirmed: number,
      picksOverlappingR3Confirm: number,
      shipped: number,
      shippedHeldBack: number,
      shippedNotHeldBack: number,
    ): TrancheSummary => ({
      picksFrozen,
      picksConfirmed,
      picksOverlappingR3Confirm,
      shipped,
      shippedHeldBack,
      shippedNotHeldBack,
      shippedUndeterminable: 0,
    });
    // Under the confirmation-window rule no shipped derived cell is held
    // back: each was confirmed on dates R3's confirm fold covers.
    assert.deepEqual(body.summary.tranches["derived-4d"], expect(4, 3, 0, 1, 0, 1));
    assert.deepEqual(body.summary.tranches["holdout-cycle"], expect(2, 1, 0, 1, 0, 1));
    assert.deepEqual(body.summary.tranches.totality, expect(4, 4, 3, 3, 1, 2));
    assert.equal(body.summary.markets, 9);
    assert.equal(body.summary.derived, 6);
    assert.equal(body.summary.notDerived, 3);
    assert.equal(body.summary.shippedDerivedCells, 5);
    assert.equal(body.summary.heldBack, 1);
    assert.equal(body.summary.notHeldBack, 4);
    assert.equal(body.summary.undeterminable, 4);
    assert.equal(body.summary.undeterminableDerived, 1);
    assert.deepEqual(body.summary.withinOneDayOfBoundary, []);
    assert.deepEqual(Object.keys(body.summary.reasons).sort(), ["ETHUSD", "HOUSD", "LTCUSD", "NIKKEI"]);
    assert.equal(body.summary.heldBackFromGlobal, undefined, "no global manifest, no global count");
  });

  it("flags a margin under one day, where the two clocks could disagree", () => {
    // Close the selection gap to four hours: still held back as stamped,
    // and listed for the reader, because the clock note says the stamps
    // can differ by hours.
    const folds = [
      SELECTION_FOLDS[0],
      fold("select", SELECT_START - CLOCK_SHIFT, CONFIRM_START - CLOCK_SHIFT),
      fold("confirm", CONFIRM_START - CLOCK_SHIFT, END - 30 * DAY_MS),
    ];
    const body = build({
      selection: [
        {
          path: "sel.manifest.json",
          manifest: selectionManifest(ROSTER, { foldsByClass: { forex: folds, crypto: folds } }),
        },
      ],
    });
    // Not held back under the confirmation-window rule; the margin is still
    // listed for the reader, because the clock note says stamps can differ.
    assert.equal(marketOf(body, "EURUSD").heldBack, false);
    assert.deepEqual(body.summary.withinOneDayOfBoundary, ["EURUSD", "GBPUSD"]);
  });

  it("with the global manifest, states each market against the global confirm fold too", () => {
    const body = build({
      r3Global: {
        path: "r3-global.manifest.json",
        manifest: r3Manifest({ folds: R3_FOLDS, foldsByClass: undefined }),
      },
    });
    for (const market of body.markets) {
      assert.deepEqual(market.r3GlobalConfirmWindow, market.r3ConfirmWindow);
      assert.equal(market.heldBackFromGlobal, market.heldBack);
      assert.equal(market.overlapWithGlobalConfirmDays, market.overlapWithR3ConfirmDays);
    }
    assert.equal(body.summary.heldBackFromGlobal, 1);
    assert.equal(body.summary.notHeldBackFromGlobal, 4);
  });

  it("refuses a record that disagrees with itself or a calendar it cannot name", () => {
    assert.throws(
      () =>
        build({
          selection: [
            { path: "sel-a.manifest.json", manifest: selectionManifest(ROSTER.slice(0, 5)) },
            {
              path: "sel-b.manifest.json",
              manifest: selectionManifest(ROSTER.slice(5), {
                foldsByClass: { forex: R3_FOLDS, crypto: R3_FOLDS },
              }),
            },
          ],
        }),
      /two calendars cannot both be the selection calendar/,
    );
    assert.throws(
      () => build({ selection: [] }),
      /no selection manifest given/,
    );
    assert.throws(
      () =>
        build({
          selection: [{ path: "sel.manifest.json", manifest: selectionManifest(ROSTER, { foldsByClass: undefined }) }],
        }),
      /selection manifest carries no foldsByClass/,
    );
    assert.throws(
      () =>
        build({
          r3: { path: "r3.manifest.json", manifest: r3Manifest({ folds: R3_FOLDS, foldsByClass: undefined }) },
        }),
      /carries no foldsByClass/,
    );
    assert.throws(
      () =>
        build({
          r3Global: { path: "g.manifest.json", manifest: r3Manifest() },
        }),
      /wrong way round/,
    );
    const drifted = r3Manifest({ folds: R3_FOLDS, foldsByClass: undefined });
    drifted.symbols![2] = { ...drifted.symbols![2], symbolOverride: { ...O3, maxStopAtrMultiplier: 2 } };
    assert.throws(
      () => build({ r3Global: { path: "g.manifest.json", manifest: drifted } }),
      /per-symbol layer differs/,
    );
    // Picks and confirm reads must name the same cells.
    const orphanPick = tranches();
    orphanPick[0].picks.finalPicks.NIKKEI = { variant: V3 };
    assert.throws(() => build({ tranches: orphanPick }), /frozen but has no confirm-read row/);
    const orphanRead = tranches();
    orphanRead[0].confirm.confirmReport.NIKKEI = { variant: V3, confirmTotalDelta: 1 };
    assert.throws(() => build({ tranches: orphanRead }), /confirm-read row but was never frozen/);
    const disagreeing = tranches();
    disagreeing[0].confirm.confirmReport.EURUSD.variant = V1;
    assert.throws(() => build({ tranches: disagreeing }), /frozen as .* but read as/);
    // The roster must be fully described.
    assert.throws(
      () => build({ r3: { path: "r3.manifest.json", manifest: r3Manifest({ symbols: r3Manifest().symbols!.slice(1) }) } }),
      /has no symbols\[\] entry/,
    );
    const unstamped = r3Manifest();
    const { symbolOverride: _dropped, ...bare } = unstamped.symbols![0];
    unstamped.symbols![0] = bare;
    assert.throws(
      () => build({ r3: { path: "r3.manifest.json", manifest: unstamped } }),
      /carries no symbolOverride key/,
    );
    assert.throws(
      () => build({ r3: { path: "r3.manifest.json", manifest: r3Manifest({ requestedSymbols: [] }) } }),
      /requestedSymbols is missing or empty/,
    );
  });
});

/** A manifest as the sweep writes it: hash over everything but the stamp. */
function stamped(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    generatedAt: "2026-09-02T00:00:00.000Z",
    manifestHash: sha256Hex(stableStringify(payload)),
  };
}

describe("a manifest is read only when its hash recomputes", () => {
  it("accepts an intact manifest and refuses a hand-edited calendar", () => {
    const dir = mkdtempSync(join(tmpdir(), "provenance-hash-"));
    const { manifestHash: _unverified, ...payload } = r3Manifest();
    const intact = join(dir, "intact.manifest.json");
    writeFileSync(intact, JSON.stringify(stamped(payload)) + "\n");
    assert.equal(readVerifiedManifest(intact).analyzerVersion, "2026.09.02.test");

    const edited = stamped(payload) as { foldsByClass: Record<string, unknown[]> };
    edited.foldsByClass = { ...edited.foldsByClass, forex: SELECTION_FOLDS };
    const tampered = join(dir, "tampered.manifest.json");
    writeFileSync(tampered, JSON.stringify(edited) + "\n");
    assert.throws(() => readVerifiedManifest(tampered), /manifest hash mismatch/);
    assert.throws(() => readVerifiedManifest(join(dir, "absent.json")), /cannot read this manifest/);
  });
});

type Run = { code: number; stdout: string; stderr: string };

function run(args: string[], cwd: string): Run {
  // The repo's own tsx by absolute path, with tsx's relative tsconfig export
  // dropped — the two traps tests/emptyCorpusRefusals.test.ts records.
  const env = { ...process.env };
  delete env.TSX_TSCONFIG_PATH;
  try {
    const stdout = execFileSync(TSX, [READER, ...args], {
      cwd,
      encoding: "utf8",
      env,
      stdio: "pipe",
      timeout: 120_000,
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const failed = error as { status?: number; stderr?: string; stdout?: string };
    const stderr = String(failed.stderr ?? "");
    assert.doesNotMatch(stderr, /npm (?:ERR|error|warn)|npx canceled|ENOENT/, `the runner itself failed:\n${stderr}`);
    return { code: failed.status ?? -1, stdout: String(failed.stdout ?? ""), stderr };
  }
}

/** The synthetic record on disk, hashed, for the executed cases. */
function fixtureOnDisk(): { dir: string; args: string[]; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "provenance-cli-"));
  const write = (name: string, body: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(body, null, 2) + "\n");
    return path;
  };
  const { manifestHash: _r3, ...r3Payload } = r3Manifest();
  const { manifestHash: _global, ...globalPayload } = r3Manifest({ folds: R3_FOLDS, foldsByClass: undefined });
  const { manifestHash: _selA, ...selAPayload } = selectionManifest(ROSTER.slice(0, 5));
  const { manifestHash: _selB, ...selBPayload } = selectionManifest(ROSTER.slice(5));
  const r3 = write("r3.manifest.json", stamped(r3Payload));
  const global = write("r3-global.manifest.json", stamped(globalPayload));
  const selA = write("sel-a.manifest.json", stamped(selAPayload));
  const selB = write("sel-b.manifest.json", stamped(selBPayload));
  const picksDir = join(dir, "picks");
  mkdirSync(picksDir);
  for (const record of tranches()) {
    const entry = TRANCHES.find((candidate) => candidate.tranche === record.tranche)!;
    write(join("picks", entry.picks), record.picks);
    write(join("picks", entry.confirm), record.confirm);
  }
  const out = join(dir, "out", "shipped-cell-provenance.json");
  return {
    dir,
    out,
    args: [
      "--r3", r3,
      "--r3-global", global,
      "--picks-dir", picksDir,
      "--selection-manifest", `${selA},${selB}`,
      "--out", out,
    ],
  };
}

describe("the flag law, executed", () => {
  it("refuses an undeclared flag by name and writes nothing", () => {
    const fixture = fixtureOnDisk();
    const result = run(["--bogus", "1", ...fixture.args], fixture.dir);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /unknown flag\(s\) --bogus/);
    assert.match(result.stderr, /--picks-dir, --r3, --r3-global, --selection-manifest/);
    assert.equal(existsSync(fixture.out), false, "a refusal that has written is not a refusal");
  });

  it("refuses a stray positional, a missing input, and a flag-shaped value", () => {
    const fixture = fixtureOnDisk();
    const stray = run([...fixture.args, "extra.json"], fixture.dir);
    assert.equal(stray.code, 1);
    assert.match(stray.stderr, /unexpected argument\(s\) extra\.json/);

    const withoutPicks = fixture.args.filter((token, index, all) =>
      token !== "--picks-dir" && all[index - 1] !== "--picks-dir"
    );
    const missing = run(withoutPicks, fixture.dir);
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /--picks-dir is required/);

    const flagShaped = run(["--r3", "--picks-dir", fixture.dir, "--out", fixture.out], fixture.dir);
    assert.equal(flagShaped.code, 1);
    assert.match(flagShaped.stderr, /--r3 owns the token after it and got "--picks-dir"/);

    const repeated = run([...fixture.args, "--out", fixture.out], fixture.dir);
    assert.equal(repeated.code, 1);
    assert.match(repeated.stderr, /--out was given 2 times/);

    assert.equal(existsSync(fixture.out), false);
    // A refusal is one line about the operator's input, never a stack.
    assert.doesNotMatch(stray.stderr, /at .*shipped-cell-provenance/);
  });

  it("writes the artifact, prints the table, and carries a standing banner forward", () => {
    const fixture = fixtureOnDisk();
    const first = run(fixture.args, fixture.dir);
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /EURUSD\s+forex\s+derived-4d .* NO/);
    assert.match(first.stdout, /AAVEUSD\s+crypto\s+totality .* NO/);
    assert.match(first.stdout, /held back 1 · not held back 4 · undeterminable 4 \(1 of them derived\)/);
    assert.match(first.stdout, /against the global confirm fold: held back 1 · not held back 4/);
    const written = JSON.parse(readFileSync(fixture.out, "utf8")) as Body & { INVALID?: string };
    assert.equal(Object.keys(written)[0], "generatedAt", "no banner is invented");
    assert.equal(written.summary.heldBack, 1);
    assert.equal(written.inputs.r3.requestedSymbols, 9);
    assert.deepEqual(marketOf(written, "XRPUSD").picks.map((pick) => pick.tranche), ["derived-4d", "totality"]);

    // The writer law: an INVALID banner standing on the output survives a
    // rerun and leads the object.
    writeFileSync(fixture.out, JSON.stringify({ INVALID: "planted banner", markets: [] }) + "\n");
    const second = run(fixture.args, fixture.dir);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /INVALID banner carried forward/);
    const rewritten = JSON.parse(readFileSync(fixture.out, "utf8")) as Body & { INVALID?: string };
    assert.equal(Object.keys(rewritten)[0], "INVALID");
    assert.equal(rewritten.INVALID, "planted banner");
    assert.equal(rewritten.summary.heldBack, 1);
  });
});

describe("the tracked artifact — docs/research/r4/shipped-cell-provenance.json", () => {
  const tracked = JSON.parse(readFileSync(TRACKED, "utf8")) as Body & {
    windows: { r3ByClass: Record<string, { confirm: { startMs: number; endMs: number } }> };
  };

  it("agrees with itself: every heldBack flag follows from its own windows, and the summary from the rows", () => {
    assert.equal(tracked.markets.length, tracked.inputs.r3.requestedSymbols);
    assert.deepEqual(
      tracked.markets.map((market) => market.symbol),
      [...new Set(tracked.markets.map((market) => market.symbol))].sort(),
      "one row per market, sorted",
    );
    const counts: Record<TrancheName, TrancheSummary> = {
      "derived-4d": emptyCounts(),
      "holdout-cycle": emptyCounts(),
      totality: emptyCounts(),
    };
    let heldBack = 0;
    let notHeldBack = 0;
    let undeterminable = 0;
    let undeterminableDerived = 0;
    let derived = 0;
    for (const market of tracked.markets) {
      assert.equal(market.shippedVariant, "baseline");
      assert.equal(market.derived, Object.keys(market.symbolOverride).length > 0, market.symbol);
      if (market.derived) derived += 1;
      // The class calendar the row cites is the class calendar the artifact
      // records once.
      assert.deepEqual(
        { startMs: market.r3ConfirmWindow.startMs, endMs: market.r3ConfirmWindow.endMs },
        {
          startMs: tracked.windows.r3ByClass[market.assetType].confirm.startMs,
          endMs: tracked.windows.r3ByClass[market.assetType].confirm.endMs,
        },
        `${market.symbol} cites its class's confirm fold`,
      );
      for (const pick of market.picks) {
        counts[pick.tranche].picksFrozen += 1;
        if (pick.confirmed) counts[pick.tranche].picksConfirmed += 1;
        if (pick.selectionWindow) {
          const recomputed = overlapDays(selectionAsWindow(pick.selectionWindow), market.r3ConfirmWindow);
          assert.equal(pick.overlapWithR3ConfirmDays, recomputed, `${market.symbol} ${pick.tranche} pick overlap`);
          if (recomputed > 0) counts[pick.tranche].picksOverlappingR3Confirm += 1;
        }
      }
      if (market.tranche === null) {
        assert.equal(market.pickVariant, null, market.symbol);
        assert.equal(market.selectionWindow, null, market.symbol);
        assert.equal(market.heldBack, null, market.symbol);
        assert.equal(typeof market.reason, "string", `${market.symbol} states why`);
        undeterminable += 1;
        if (market.derived) undeterminableDerived += 1;
        continue;
      }
      assert.equal(market.derived, true, `${market.symbol} is attributed, so it carries a layer`);
      assert.deepEqual(overrideDiffers(market.symbolOverride, market.pickVariant!), [], market.symbol);
      const shipped = market.picks.filter((pick) => pick.confirmed).at(-1)!;
      assert.equal(shipped.tranche, market.tranche, `${market.symbol}: the last confirmed tranche ships`);
      assert.equal(shipped.variant, market.pickVariant);
      const window = market.selectionWindow!;
      const recomputed = overlapMs(selectionAsWindow(window), market.r3ConfirmWindow);
      assert.equal(market.overlapWithR3ConfirmDays, recomputed / DAY_MS, market.symbol);
      // Held back = clear of the selection window AND the confirmation window.
      const recomputedConfirmation = overlapMs(confirmationAsWindow(window), market.r3ConfirmWindow);
      assert.equal(market.overlapWithR3ConfirmDaysFromConfirmation, recomputedConfirmation / DAY_MS, market.symbol);
      assert.equal(
        market.heldBack,
        recomputed === 0 && recomputedConfirmation === 0,
        `${market.symbol} heldBack follows its windows`,
      );
      assert.equal(
        market.overlapWithR3SelectDays,
        overlapDays(selectionAsWindow(window), market.r3SelectWindow),
        market.symbol,
      );
      assert.equal(
        market.marginToR3ConfirmDays,
        (market.r3ConfirmWindow.startMs - window.selectEndMs) / DAY_MS,
        market.symbol,
      );
      if (market.tranche === "totality") {
        assert.deepEqual(window, recutSpan(market.selectionSpan!), `${market.symbol} totality window is the re-cut`);
      }
      counts[market.tranche].shipped += 1;
      if (market.heldBack) {
        counts[market.tranche].shippedHeldBack += 1;
        heldBack += 1;
      } else {
        counts[market.tranche].shippedNotHeldBack += 1;
        notHeldBack += 1;
      }
    }
    assert.deepEqual(tracked.summary.tranches, counts);
    assert.equal(tracked.summary.derived, derived);
    assert.equal(tracked.summary.heldBack, heldBack);
    assert.equal(tracked.summary.notHeldBack, notHeldBack);
    assert.equal(tracked.summary.undeterminable, undeterminable);
    assert.equal(tracked.summary.undeterminableDerived, undeterminableDerived);
    assert.equal(tracked.summary.shippedDerivedCells, heldBack + notHeldBack);
  });

  it("states the record's known shape: 97 markets, 72 derived cells, the design's 21 of 27", () => {
    // The 2026-08-11 record: 39 + 11 + 22 = 72 derived cells
    // (tests/calibrationState.test.ts), and the design review's lens put
    // 21 of the 27 totality picks inside R3's confirm window (row D2(a)).
    assert.equal(tracked.summary.markets, 97);
    assert.equal(tracked.summary.derived, 72);
    assert.equal(tracked.summary.shippedDerivedCells, 72, "every derived cell is attributed — no tranche: null among them");
    assert.equal(tracked.summary.undeterminableDerived, 0);
    assert.equal(tracked.summary.tranches["derived-4d"].shipped, 39);
    assert.equal(tracked.summary.tranches["holdout-cycle"].shipped, 11);
    assert.equal(tracked.summary.tranches.totality.shipped, 22);
    assert.equal(tracked.summary.tranches.totality.picksFrozen, 27);
    assert.equal(tracked.summary.tranches.totality.picksOverlappingR3Confirm, 21);
    assert.deepEqual(tracked.summary.withinOneDayOfBoundary, []);
  });

  it("is reproduced from the inputs it names — derived, not curated", () => {
    // Run the reader on the tracked inputs the artifact itself lists, into a
    // temp path, and require the same body modulo the timestamp.
    const dir = mkdtempSync(join(tmpdir(), "provenance-repro-"));
    const out = join(dir, "shipped-cell-provenance.json");
    const inputs = tracked.inputs as Body["inputs"] & {
      r3: { path: string };
      r3Global: { path: string } | null;
    };
    const args = [
      "--r3", inputs.r3.path,
      ...(inputs.r3Global ? ["--r3-global", inputs.r3Global.path] : []),
      "--picks-dir", "docs/research/baseline-2026-08-10",
      "--selection-manifest", inputs.selection.map((entry) => entry.path).join(","),
      "--out", out,
    ];
    const result = run(args, REPO);
    assert.equal(result.code, 0, result.stderr);
    const { generatedAt: _fresh, ...fresh } = JSON.parse(readFileSync(out, "utf8")) as Body;
    const { generatedAt: _tracked, ...committed } = tracked;
    assert.deepEqual(fresh, committed);
  });
});

function emptyCounts(): TrancheSummary {
  return {
    picksFrozen: 0,
    picksConfirmed: 0,
    picksOverlappingR3Confirm: 0,
    shipped: 0,
    shippedHeldBack: 0,
    shippedNotHeldBack: 0,
    shippedUndeterminable: 0,
  };
}

describe("which laws the reader sits under — checks a reader can rerun", () => {
  const source = readFileSync(READER, "utf8");
  it("opens no corpus, so it is outside the one-clock door population", () => {
    // The same predicates tests/emptyCorpusRefusals.test.ts and
    // tests/sweepStats.test.ts derive their populations with.
    assert.doesNotMatch(source, /assertManifest(?:edCorpus(?:Sync|Streaming)?)?\(/);
    assert.doesNotMatch(
      source,
      /createInterface\(|readLinesSync\(|split\("\\n"\)|split\(\/\\r\?\\n\/\)|split\('\\n'\)/,
    );
  });
  it("writes its artifact through the shared writer, under the banner law", () => {
    assert.match(source, /from "\.\/researchArtifact\.ts"/);
    assert.match(source, /writeResearchArtifact\(/);
    assert.doesNotMatch(source, /writeFileSync\(/);
  });
  it("declares its five value flags and reads each by name", () => {
    const declared = source.match(/const VALUE_FLAGS = new Set\(\[([^\]]*)\]\)/);
    assert.ok(declared, "VALUE_FLAGS is declared literally");
    const flags = [...declared![1].matchAll(/"(--[\w-]+)"/g)].map((match) => match[1]).sort();
    assert.deepEqual(flags, ["--out", "--picks-dir", "--r3", "--r3-global", "--selection-manifest"]);
    for (const flag of flags) {
      assert.match(source, new RegExp(`str\\("${flag}"\\)`), `${flag} is read by its literal name`);
    }
  });
});
