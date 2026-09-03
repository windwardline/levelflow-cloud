import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertEmbargoCoversReview,
  calendarFolds,
  describeHeldOut,
  foldsByClass,
  foldSplits,
  heldOutSet,
  HOLDOUT_RULE,
  holdoutPinPath,
  isHoldoutSymbol,
  resolveHeldOut,
  rosterHashOf,
  stratifiedHoldout,
  verifyHeldOutSet,
} from "../scripts/sweepFolds.ts";
import { parseGridSpec } from "../scripts/sweepGrid.ts";
import { assertManifest } from "../scripts/sweepStats.ts";
import {
  getAssetType,
  hasKnownAssetType,
} from "../supabase/functions/trade-analyzer/calibration.ts";
import { simulateSymbol } from "../supabase/functions/trade-analyzer/sweep.ts";
import type { Bar } from "../supabase/functions/trade-analyzer/types.ts";

// 3c/3d/3e (2026-08-10): the split was five lines of per-symbol fractions —
// folds landed in different calendar years per symbol and grid-totalr
// summed "test R" across disjoint history; one fixed cut made selection
// and confirmation the same fold; and train-fold setups truncated at the
// boundary with no embargo, so a boundary decision's outcome either
// vanished or silently consumed the next fold's price action. Folds are
// now CALENDAR windows shared by every symbol (common origin), three of
// them (fit/select/confirm — selection and confirmation are different
// data), each with a decision end an embargo before its close so every
// fold's setups RESOLVE inside their own fold. The market holdout (3e) is
// a deterministic hash of the symbol — a property of the corpus, not an
// invocation flag.

const DAY = 86_400_000;

describe("calendarFolds — common-origin, three folds, embargoed decisions", () => {
  const start = Date.UTC(2022, 0, 1);
  const end = start + 400 * DAY;
  const folds = calendarFolds({
    corpusEndMs: end,
    corpusStartMs: start,
    embargoMs: 5 * DAY,
  });

  it("cuts fit/select/confirm at 50/25/25 of the calendar span, contiguously", () => {
    assert.deepEqual(folds.map((fold) => fold.name), [
      "fit",
      "select",
      "confirm",
    ]);
    assert.equal(folds[0].startMs, start);
    assert.equal(folds[0].endMs, start + 200 * DAY);
    assert.equal(folds[1].startMs, folds[0].endMs);
    assert.equal(folds[1].endMs, start + 300 * DAY);
    assert.equal(folds[2].startMs, folds[1].endMs);
    assert.equal(folds[2].endMs, end);
  });

  it("ends each fold's decisions an embargo before the fold closes", () => {
    for (const fold of folds) {
      assert.equal(fold.decisionEndMs, fold.endMs - 5 * DAY);
    }
  });

  it("refuses a span the embargo would consume", () => {
    assert.throws(
      () =>
        calendarFolds({
          corpusEndMs: start + 12 * DAY,
          corpusStartMs: start,
          embargoMs: 5 * DAY,
        }),
      /embargo/i,
    );
  });
});

describe("foldSplits — warm-up floors inside the fold (the relaunch crash)", () => {
  const start = Date.UTC(2022, 0, 1);
  const end = start + 400 * DAY;
  const folds = calendarFolds({
    corpusEndMs: end,
    corpusStartMs: start,
    embargoMs: 5 * DAY,
  });
  const bar = (time: number) => ({ time });
  const barsFrom = (fromMs: number, count: number) =>
    Array.from({ length: count }, (_, index) => bar(fromMs + index * 900_000));

  it("gives a mid-fold-starting symbol a full warm-up instead of deciding on a one-bar market", () => {
    // History begins INSIDE the fit fold: startIndex is 0, so the old
    // inline math produced warmupBars 0 — the committee then read
    // bars.at(-2) on a one-bar market and crashed the baseline relaunch.
    const splits = foldSplits(barsFrom(start + 30 * DAY, 5_000), folds, 240);
    const fit = splits.find((split) => split.name === "fit")!;
    assert.equal(fit.warmupBars, 240);
  });

  it("keeps exactly the warm-up overlap for folds with earlier history", () => {
    const splits = foldSplits(barsFrom(start, 30_000), folds, 240);
    const select = splits.find((split) => split.name === "select")!;
    assert.equal(select.warmupBars, 240);
    // The slice begins 240 bars before the fold boundary.
    const boundary = folds.find((fold) => fold.name === "select")!.startMs;
    assert.equal(
      select.bars.filter((entry) => entry.time < boundary).length,
      240,
    );
  });

  it("drops a fold too thin to hold one decision past its warm-up", () => {
    const splits = foldSplits(barsFrom(start, 100), folds, 240);
    assert.equal(splits.length, 0);
  });
});

describe("isHoldoutSymbol — the 3e partition is a property of the symbol", () => {
  it("is deterministic and case-stable", () => {
    assert.equal(isHoldoutSymbol("EURUSD"), isHoldoutSymbol("EURUSD"));
  });

  it("holds out roughly a fifth of the roster, never all or none", () => {
    const symbols = [
      "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "BTCUSD", "CADCHF",
      "CADJPY", "CHFJPY", "CLUSD", "ESUSD", "ETHUSD", "EURAUD", "EURCAD",
      "EURCHF", "EURGBP", "EURJPY", "EURNZD", "EURUSD", "GBPAUD", "GBPCAD",
      "GBPCHF", "GBPJPY", "GBPNZD", "GBPUSD", "GCUSD", "NGUSD", "NQUSD",
      "NZDCAD", "NZDCHF", "NZDJPY", "NZDUSD", "SIUSD", "SOLUSD", "USDCAD",
      "USDCHF", "USDJPY", "XAGUSD", "XAUUSD", "ZCUSX",
    ];
    const held = symbols.filter((symbol) => isHoldoutSymbol(symbol));
    assert.ok(
      held.length >= symbols.length * 0.1 &&
        held.length <= symbols.length * 0.35,
      `${held.length} of ${symbols.length} held out`,
    );
  });
});

describe("simulateSymbol honours a decision end — the embargo's engine half", () => {
  it("stops deciding at decisionEndMs while still resolving from later bars", () => {
    const start = Date.UTC(2026, 5, 15);
    const bars: Bar[] = Array.from({ length: 400 }, (_, index) => {
      const position = index % 20;
      const value = position < 10
        ? 98 + 0.4 * position
        : 98 + 4 - 0.4 * (position - 10);
      return {
        close: value,
        high: value + 0.3,
        low: value - 0.3,
        open: value,
        time: start + index * 900_000,
        volume: 1_000,
      };
    });
    const daily: Bar[] = [];
    let day = Date.UTC(2026, 0, 5, 4);
    while (daily.length < 60) {
      const weekday = new Date(day).getUTCDay();
      if (weekday !== 0 && weekday !== 6) {
        daily.push({
          close: 100.5,
          high: 103.2,
          low: 96.8,
          open: 100,
          time: day,
          volume: 10_000,
        });
      }
      day += 86_400_000;
    }
    const decisionEndMs = start + 200 * 900_000;
    const capped = simulateSymbol({
      calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
      dailyBars: daily,
      decisionEndMs,
      primaryBars: bars,
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    const uncapped = simulateSymbol({
      calibrationOverride: { blockedRegimes: [], runnerWindowShare: 1, tp1RiskShare: 0.8 },
      dailyBars: daily,
      primaryBars: bars,
      stepBars: 16,
      symbol: "EURUSD",
      warmupBars: 120,
    });
    assert.ok(capped.decisionPoints > 0);
    assert.ok(capped.decisionPoints < uncapped.decisionPoints);
    for (const record of capped.outcomes) {
      assert.ok(record.time < decisionEndMs);
    }
  });
});

describe("parseGridSpec — the crossed axes, strings validated like keys (4c)", () => {
  it("crosses numeric and string axes into the full product", () => {
    const grid = parseGridSpec(
      "maxStopAtrMultiplier=1,2.5;runnerProtection=breakeven,hold",
    );
    assert.equal(grid.length, 4);
    assert.deepEqual(grid[0], {
      maxStopAtrMultiplier: 1,
      runnerProtection: "breakeven",
    });
    assert.deepEqual(grid[3], {
      maxStopAtrMultiplier: 2.5,
      runnerProtection: "hold",
    });
  });

  it("refuses a typo'd protection value the way it refuses a typo'd key", () => {
    assert.throws(
      () => parseGridSpec("runnerProtection=breakevn"),
      /runnerProtection/,
    );
  });

  it("keeps refusing unknown keys", () => {
    assert.throws(() => parseGridSpec("tp1Sharee=0.5"), /not a/);
  });
});

describe("the driver pins a shard fleet's fold span (3c across shards)", () => {
  it("accepts --fold-start/--fold-end and skips the span pre-pass", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(script, /fold-start/);
    assert.match(script, /fold-end/);
    assert.match(script, /folds pinned:/);
  });
});

describe("foldsByClass — every class walks forward on its own span (4c repair)", () => {
  it("folds each class independently on its stated span", () => {
    const spec = {
      forex: { endMs: Date.UTC(2026, 7, 10), startMs: Date.UTC(2009, 8, 24) },
      futures: { endMs: Date.UTC(2026, 7, 10), startMs: Date.UTC(2023, 8, 25) },
    };
    const byClass = foldsByClass(spec, 5 * DAY);
    assert.equal(byClass.forex.length, 3);
    assert.equal(byClass.futures.length, 3);
    assert.equal(byClass.forex[0].startMs, spec.forex.startMs);
    assert.equal(byClass.futures[0].startMs, spec.futures.startMs);
    // The futures select fold begins mid-2025 — inside its own history,
    // not inside a decade it never traded.
    assert.ok(byClass.futures[1].startMs > Date.UTC(2025, 0, 1));
  });

  it("threads through the driver and manifest as the fleet's calendar", () => {
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(script, /fold-spec/);
    assert.match(script, /foldsByClass/);
    assert.match(script, /classFolds\[getAssetType\(symbol\)\]/);
  });
});

describe("measurement paths refuse unknown symbols (round-8 CV-1/CV-10)", () => {
  it("exposes the strict classifier and the driver asserts with it", () => {
    assert.equal(hasKnownAssetType("EURUSD"), true);
    assert.equal(hasKnownAssetType("SP"), true);
    assert.equal(hasKnownAssetType("^GSPC"), false);
    assert.equal(hasKnownAssetType("OTRUMPUSD"), false);
    const script = readFileSync("scripts/replay-sweep.ts", "utf8");
    assert.match(script, /hasKnownAssetType\(symbol\)/);
    assert.match(script, /missing from the fold/);
  });
});

describe("stratifiedHoldout — read-time, per class, never zero where a class can afford one (CV-4)", () => {
  it("holds ~20% per class with a floor of one for classes of three or more", () => {
    const classOf = (symbol: string) =>
      symbol.startsWith("F") ? "forex" : symbol.startsWith("M") ? "metals" : "crypto";
    const symbols = [
      "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10",
      "M1", "M2",
      "C1", "C2", "C3", "C4", "C5",
    ];
    const held = stratifiedHoldout(symbols, classOf);
    const byClass = { crypto: 0, forex: 0, metals: 0 };
    for (const symbol of held) byClass[classOf(symbol) as keyof typeof byClass] += 1;
    assert.equal(byClass.forex, 2);
    assert.equal(byClass.crypto, 1);
    // A two-market class holds nothing out — by policy, stated, so the
    // class keeps both markets for tuning and has no unseen-market read.
    assert.equal(byClass.metals, 0);
  });

  it("is deterministic and order-independent", () => {
    const classOf = () => "forex";
    const symbols = ["A", "B", "C", "D", "E"];
    const first = [...stratifiedHoldout(symbols, classOf)].sort();
    const second = [...stratifiedHoldout([...symbols].reverse(), classOf)].sort();
    assert.deepEqual(first, second);
  });
});

describe("the embargo covers the longest review window any arm can carry", () => {
  // Look-ahead by construction: a fold's decisions stop an embargo before it
  // closes so every resolution lands inside the fold. The resolver's horizon
  // is reviewHours + 24h (sweep.ts), and `defaultReviewHours` is a grid axis
  // — so an arm with a long enough window would read the NEXT fold's bars
  // from inside this one, and nothing asserted the constant against the
  // axis until 2026-09-02 (the seal's design review found it).
  const DAY = 86_400_000;

  it("passes when the embargo exceeds the longest window plus the resolver's day", () => {
    assert.doesNotThrow(() => assertEmbargoCoversReview(5 * DAY, [6, 12, 24, 96]));
  });

  it("refuses an embargo the longest window could cross, naming the hours", () => {
    assert.throws(
      () => assertEmbargoCoversReview(5 * DAY, [6, 97]),
      /reviewHours 97 \+ 24h resolution horizon = 121h exceeds the 120h fold embargo/,
    );
  });

  it("refuses an empty window list rather than passing vacuously", () => {
    assert.throws(() => assertEmbargoCoversReview(5 * DAY, []), /no review windows/);
  });
});

// R4 act 2, deliverable 4: ONE holdout population. The driver's stamp (sha256
// mod 5, 19 of R3's 97) and the gate's read-time stratified set (20 of 97)
// shared five markets and disagreed in every class, and the gate had tuned
// on 14 of the 19 stamped markets — so the stamp named nothing untainted.
// `heldOutSet` is the stratified rule over the REQUESTED roster, `verify` is
// how a reader refuses to drift from the tracked pin, and the stamp is
// provenance a reader may print and never exclude on.
describe("heldOutSet — one holdout population over the REQUESTED roster (R4 act 2)", () => {
  const FOREX = [
    "AUDCAD", "AUDUSD", "EURGBP", "EURJPY", "EURUSD",
    "GBPJPY", "GBPUSD", "NZDUSD", "USDCAD", "USDCHF",
  ];
  const CRYPTO = ["BTCUSD", "ETHUSD", "XLMUSD"];
  const METALS = ["XAGUSD", "XAUUSD"];
  const manifest = (
    requestedSymbols: string[] | undefined,
    extra: { anchor?: string; holdoutSymbols?: string[] } = {},
  ) => ({
    anchor: extra.anchor ?? "2026-08-26",
    manifestHash: "f".repeat(64),
    ...(extra.holdoutSymbols && { holdoutSymbols: extra.holdoutSymbols }),
    ...(requestedSymbols && { requestedSymbols }),
  });

  it("draws the stratified rule over the UNION of every manifest's requestedSymbols, sorted", () => {
    const set = heldOutSet([manifest(FOREX), manifest([...CRYPTO, ...METALS])]);
    assert.equal(set.rule, HOLDOUT_RULE);
    assert.equal(set.basis, "requestedSymbols");
    // The roster's identity is order- and duplicate-insensitive: a pin is
    // specific to a REQUESTED roster, not to the shard that carried it.
    assert.equal(set.rosterHash, rosterHashOf([...METALS, ...CRYPTO, ...FOREX, "EURUSD"]));
    assert.notEqual(set.rosterHash, rosterHashOf(FOREX));
    assert.deepEqual(
      set.markets,
      [...stratifiedHoldout([...FOREX, ...CRYPTO, ...METALS], getAssetType)].sort(),
    );
    // Ten forex hold two out, three crypto hold one, two metals hold none.
    const byClass = (cls: string) => set.markets.filter((m) => getAssetType(m) === cls).length;
    assert.equal(byClass("forex"), 2);
    assert.equal(byClass("crypto"), 1);
    assert.equal(byClass("metals"), 0);
    assert.equal(set.markets.length, 3);
  });

  it("holds nothing out of a class under three markets — stated policy, so the set is empty and says so", () => {
    assert.deepEqual(heldOutSet([manifest(["EURUSD", "GBPUSD", "XAUUSD"])]).markets, []);
  });

  it("a subset read does NOT move membership: the set is drawn over what was requested, not what survived", () => {
    const full = heldOutSet([manifest(FOREX)]);
    // A shard that requested the whole roster but carries three survivors.
    // The read-union rule the gate's inline copies apply would re-draw the
    // set over those three and hold a DIFFERENT market out (66 of 97 single
    // removals move another market's membership on R3's roster).
    const survivors = FOREX.filter((symbol) => !full.markets.includes(symbol)).slice(0, 3);
    const subset = { ...manifest(FOREX), symbols: survivors.map((symbol) => ({ symbol })) };
    assert.deepEqual(heldOutSet([subset]).markets, full.markets);
    const overSurvivors = [...stratifiedHoldout(survivors, getAssetType)].sort();
    assert.equal(overSurvivors.length, 1);
    assert.equal(
      full.markets.includes(overSurvivors[0]),
      false,
      "the fixture must make the two rules disagree, or this proves nothing",
    );
  });

  it("falls back to the symbols READ for a manifest with no request, and says so in the basis", () => {
    // A legacy corpus or fixture: no requestedSymbols, only the survivors.
    const legacy = { ...manifest(undefined), symbols: FOREX.map((symbol) => ({ symbol })) };
    const set = heldOutSet([legacy]);
    assert.equal(set.basis, "symbols-read");
    assert.deepEqual(set.markets, [...stratifiedHoldout(FOREX, getAssetType)].sort());
    // The weakest basis names the whole computation when shards are mixed.
    const mixed = heldOutSet([manifest(CRYPTO), legacy]);
    assert.equal(mixed.basis, "symbols-read");
    assert.deepEqual(
      mixed.markets,
      [...stratifiedHoldout([...CRYPTO, ...FOREX], getAssetType)].sort(),
    );
    // Neither a request nor a survivor list is a refusal, by name.
    assert.throws(
      () => heldOutSet([manifest(FOREX), manifest(undefined)]),
      /manifest ffffffffffff \(anchor 2026-08-26\) carries neither requestedSymbols nor symbols/,
    );
    assert.throws(() => heldOutSet([]), /no manifests given/);
  });

  describe("verifyHeldOutSet / resolveHeldOut — the pinned set, or a refusal by name", () => {
    const dir = mkdtempSync(join(tmpdir(), "holdout-pin-"));
    const pin = (name: string, body: unknown): string => {
      const path = join(dir, name);
      writeFileSync(path, JSON.stringify(body) + "\n");
      return path;
    };
    const manifests = [manifest(FOREX), manifest(CRYPTO)];
    const computed = heldOutSet(manifests);

    it("returns the set verified when the pin names exactly it, in any order", () => {
      const path = pin("exact.json", {
        anchor: "2026-08-26",
        manifestHashes: manifests.map((entry) => entry.manifestHash),
        markets: [...computed.markets].reverse(),
        rosterHash: computed.rosterHash,
        rule: HOLDOUT_RULE,
      });
      assert.deepEqual(verifyHeldOutSet(manifests, path), { ...computed, pinState: "verified" });
    });

    it("a pin of ANOTHER requested roster is unpinned for this one, never drift", () => {
      // Same anchor, different request: the guard's seven-market fixture
      // beside R3's 97, or a focused arm — the pin says nothing about it.
      const path = pin("other-roster.json", {
        manifestHashes: ["0".repeat(64)],
        markets: ["XLMUSD"],
        rosterHash: rosterHashOf(["EURUSD", "GBPUSD"]),
        rule: HOLDOUT_RULE,
      });
      const result = verifyHeldOutSet(manifests, path);
      assert.equal(result.pinState, "other-roster");
      assert.deepEqual(result.markets, computed.markets);
      const pinDir = join(dir, "other-roster-pins");
      mkdirSync(pinDir);
      writeFileSync(holdoutPinPath("2026-08-26", pinDir), readFileSync(path));
      const resolved = resolveHeldOut(manifests, pinDir);
      assert.equal(resolved.pinStands, true);
      assert.equal(resolved.pinned, false);
      assert.equal(
        describeHeldOut(resolved),
        `holdout: stratified-per-class-20pct — ${computed.markets.length} markets excluded from ` +
          `every class pool, labelled HELD OUT per market (unpinned for this roster — ${
            resolved.pinPath
          } pins another requested roster; computed from requestedSymbols (roster ${
            computed.rosterHash.slice(0, 12)
          })); stamped flag: 0 markets, provenance only`,
      );
    });

    it("a symbols-read set is unpinnable, never drift: the pin is validated, not compared", () => {
      const legacy = [{ ...manifest(undefined), symbols: FOREX.map((symbol) => ({ symbol })) }];
      const drifted = pin("legacy-drift.json", {
        manifestHashes: ["0".repeat(64)],
        markets: ["XLMUSD"],
        rosterHash: rosterHashOf(FOREX),
        rule: HOLDOUT_RULE,
      });
      const result = verifyHeldOutSet(legacy, drifted);
      assert.equal(result.pinState, "symbols-read");
      assert.equal(result.basis, "symbols-read");
      assert.deepEqual(result.markets, [...stratifiedHoldout(FOREX, getAssetType)].sort());
      // …while a malformed pin is still refused for what it is.
      assert.throws(
        () => verifyHeldOutSet(legacy, pin("legacy-rule.json", { markets: [], rule: "other" })),
        /pins rule "other"/,
      );
      const pinDir = join(dir, "legacy-pins");
      mkdirSync(pinDir);
      writeFileSync(holdoutPinPath("2026-08-26", pinDir), readFileSync(drifted));
      const resolved = resolveHeldOut(legacy, pinDir);
      assert.equal(resolved.pinStands, true);
      assert.equal(resolved.pinState, "symbols-read");
      assert.equal(resolved.pinned, false);
      assert.match(
        describeHeldOut(resolved),
        /\(computed over the symbols read — no requested roster in the manifest — so unpinnable; .*legacy-pins\/holdout-2026-08-26\.json not consulted\); stamped flag: 0 markets, provenance only$/,
      );
      // With no file standing the same set is still unpinnable, and says so
      // without claiming a requested roster it never had.
      const bare = resolveHeldOut(legacy, join(dir, "nowhere-legacy"));
      assert.equal(bare.pinStands, false);
      assert.equal(bare.pinState, "symbols-read");
      assert.match(
        describeHeldOut(bare),
        /\(computed over the symbols read — no requested roster in the manifest — so unpinnable\); stamped flag/,
      );
    });

    it("refuses a drifted pin — same roster, another set — naming both directions of the difference", () => {
      const [first, ...rest] = computed.markets;
      const path = pin("drifted.json", {
        manifestHashes: manifests.map((entry) => entry.manifestHash),
        markets: [...rest, "USDJPY"],
        rosterHash: computed.rosterHash,
        rule: HOLDOUT_RULE,
      });
      assert.throws(
        () => verifyHeldOutSet(manifests, path),
        new RegExp(
          `heldOutSetDrift: .*for the same requested roster .*pinned but not computed: USDJPY; computed but not pinned: ${first}`,
        ),
      );
    });

    it("refuses another rule, a pin with no market list or roster hash, an INVALID banner, and an unreadable pin", () => {
      assert.throws(
        () => verifyHeldOutSet(manifests, pin("rule.json", { markets: computed.markets, rule: "sha256-mod-5" })),
        /pins rule "sha256-mod-5", not stratified-per-class-20pct/,
      );
      assert.throws(
        () => verifyHeldOutSet(manifests, pin("nolist.json", { rule: HOLDOUT_RULE })),
        /pins no list of markets/,
      );
      assert.throws(
        () => verifyHeldOutSet(manifests, pin("nohash.json", { markets: computed.markets, rule: HOLDOUT_RULE })),
        /pins no rosterHash/,
      );
      assert.throws(
        () =>
          verifyHeldOutSet(
            manifests,
            pin("banner.json", { INVALID: "clock defect", markets: computed.markets, rule: HOLDOUT_RULE }),
          ),
        /carries an INVALID banner — clock defect/,
      );
      assert.throws(
        () => verifyHeldOutSet(manifests, join(dir, "absent.json")),
        /could not be read as JSON/,
      );
    });

    it("resolves against the anchor's pin when one stands, computes and says unpinned when none does, and never lets the stamp move the set", () => {
      const nowhere = join(dir, "nowhere");
      const unpinned = resolveHeldOut(manifests, nowhere);
      assert.equal(unpinned.pinned, false);
      assert.equal(unpinned.pinStands, false);
      assert.equal(unpinned.pinState, "absent");
      assert.equal(unpinned.basis, "requestedSymbols");
      assert.equal(unpinned.pinPath, holdoutPinPath("2026-08-26", nowhere));
      assert.deepEqual(unpinned.markets, computed.markets);
      assert.deepEqual([...unpinned.held].sort(), computed.markets);
      assert.deepEqual(unpinned.stamped, []);
      assert.equal(
        describeHeldOut(unpinned),
        `holdout: stratified-per-class-20pct — ${computed.markets.length} markets excluded from ` +
          `every class pool, labelled HELD OUT per market (unpinned — no ${unpinned.pinPath}, ` +
          `computed from requestedSymbols); stamped flag: 0 markets, provenance only`,
      );

      const pinDir = join(dir, "pins");
      mkdirSync(pinDir);
      const pinPath = holdoutPinPath("2026-08-26", pinDir);
      writeFileSync(
        pinPath,
        JSON.stringify({
          manifestHashes: manifests.map((entry) => entry.manifestHash),
          markets: computed.markets,
          rosterHash: computed.rosterHash,
          rule: HOLDOUT_RULE,
        }) + "\n",
      );
      // The stamp rides as provenance — printed, never drawn on: manifests
      // stamping two markets the rule does not hold out resolve to the same set.
      const stamped = manifests.map((entry) => ({ ...entry, holdoutSymbols: ["GBPJPY", "EURGBP"] }));
      const pinned = resolveHeldOut(stamped, pinDir);
      assert.equal(pinned.pinned, true);
      assert.deepEqual(pinned.markets, computed.markets);
      assert.deepEqual(pinned.stamped, ["EURGBP", "GBPJPY"]);
      assert.match(
        describeHeldOut(pinned),
        /\(pinned .*holdout-2026-08-26\.json\); stamped flag: 2 markets, provenance only$/,
      );

      // A pin that names another set for the same roster refuses through
      // resolve as well.
      writeFileSync(
        pinPath,
        JSON.stringify({
          manifestHashes: manifests.map((entry) => entry.manifestHash),
          markets: [],
          rosterHash: computed.rosterHash,
          rule: HOLDOUT_RULE,
        }) + "\n",
      );
      assert.throws(() => resolveHeldOut(manifests, pinDir), /heldOutSetDrift/);
    });

    it("computes over shards of two anchors as one measurement, and reports the set unpinned", () => {
      // The ledger's identity excludes the anchor on purpose (a sweep
      // crossing midnight is one measurement); the set depends only on the
      // roster, and only the PIN is per anchor.
      const resolved = resolveHeldOut([manifest(FOREX), manifest(CRYPTO, { anchor: "2026-08-25" })], dir);
      assert.equal(resolved.anchor, "2026-08-25+2026-08-26");
      assert.equal(resolved.pinState, "absent");
      assert.equal(resolved.pinned, false);
      assert.deepEqual(resolved.markets, heldOutSet([manifest(FOREX), manifest(CRYPTO)]).markets);
    });

    it("refuses a pin that names no manifests — deleting the claim is not a way past the claimed-manifest check", () => {
      const unclaimed = pin("unclaimed.json", {
        markets: computed.markets,
        rosterHash: computed.rosterHash,
        rule: HOLDOUT_RULE,
      });
      assert.throws(() => verifyHeldOutSet(manifests, unclaimed), /names no manifestHashes/);
    });

    it("looks for the pin in the tracked directory by default", () => {
      assert.equal(holdoutPinPath("2026-08-26"), "docs/research/r4/holdout-2026-08-26.json");
    });
  });
});

describe("the tracked pin IS the computation over the tracked R3 manifests", () => {
  // docs/research/r4/holdout-2026-08-26.json was written by
  // scripts/holdout-set.ts over the two capture-all manifests; all four R3
  // arms requested the same 97 markets, so one pin serves them all. A change
  // here is a roster change to be re-pinned deliberately, never a refactor.
  it("verifies against every R3 arm's manifest, and names the 20 the design's lens computed", () => {
    const arms = ["capture-all", "capture-all-classfolds", "gated", "gated-classfolds"]
      .map((arm) => assertManifest(`docs/research/r3/${arm}.jsonl`));
    const verified = verifyHeldOutSet(arms, "docs/research/r4/holdout-2026-08-26.json");
    assert.equal(verified.pinState, "verified");
    assert.equal(verified.basis, "requestedSymbols");
    assert.equal(verified.rosterHash, rosterHashOf(arms[0].requestedSymbols!));
    assert.deepEqual(verified.markets, [
      "AAVEUSD", "ARWUSD", "AUDCHF", "AUDNZD", "BNBUSD", "BZUSD", "DASHUSD",
      "EURUSD", "GBPCAD", "HEUSX", "NGUSD", "NSDQ", "NZDCHF", "NZDJPY",
      "RTYUSD", "THETAUSD", "XLMUSD", "XMRUSD", "YMUSD", "ZMUSD",
    ]);
    // The stamp and the set disagree — the fact that made one population
    // necessary: 19 stamped, 20 stratified, five shared.
    const stamped = new Set(arms[0].holdoutSymbols);
    assert.equal(stamped.size, 19);
    assert.equal(verified.markets.filter((market) => stamped.has(market)).length, 5);
  });
});
