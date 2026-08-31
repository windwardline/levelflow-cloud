import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildLadderTargets,
  buildPricePlan,
} from "../supabase/functions/trade-analyzer/pricePlan.ts";
import {
  findSwingPivots,
  nearestLevelBeyond,
} from "../supabase/functions/trade-analyzer/indicators.ts";
import { applyFuturesTickRules } from "../supabase/functions/trade-analyzer/futures.ts";
import { getCategoryCalibration } from "../supabase/functions/trade-analyzer/calibration.ts";
import type {
  Bar,
  MarketContext,
  Regime,
} from "../supabase/functions/trade-analyzer/types.ts";

const ladderCalibration = {
  defaultReviewHours: 6,
  minimumTargetRewardRisk: 1.9,
  runnerWindowShare: 1,
  // 1 was what `?? 1` supplied these fixtures before the field became
  // required, so every expected value below is unchanged. The point of
  // requiring it is that the fixtures now SAY so.
  sizingHoursFactor: 1,
  tp1AtrMultiplier: 0.8,
  tp1RiskShare: 0.8,
};

describe("ladder targets", () => {
  it("places TP1 a window-scaled ATR multiple from entry and the runner at the nearest pivot", () => {
    // expectedWindowMove = dailyAtr 10 * sqrt(6h / 24h) = 5
    // tp1Distance = min(0.8 * atr 2, 0.6 * 5) = 1.6
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [98, 104, 108],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.takeProfit1, 101.6);
    assert.equal(ladder.runnerTarget, 104);
    assert.equal(ladder.expectedWindowMove, 5);
  });

  it("scales the sizing window by sizingHoursFactor without touching patience (4c, Q4's split)", () => {
    // The baseline proved the review window censors nothing (median exit
    // 0.5h) — its only operative role is sizing the geometry. The factor
    // moves ONLY expectedWindowMove: 10 * sqrt((6h * 4) / 24h) = 10.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: { ...ladderCalibration, sizingHoursFactor: 4 },
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [98, 104, 108],
      riskDistance: 2,
      side: "buy",
    });
    assert.ok(ladder);
    assert.equal(ladder.expectedWindowMove, 10);
    // Patience (expiry) still reads defaultReviewHours alone — the resolver
    // takes reviewHours from calibration untouched by the factor; pinned at
    // the sweep threading below rather than re-tested here.
  });

  it("caps TP1 at the expected move the review window can deliver", () => {
    // Raw ATR distance 0.8 * 6 = 4.8 exceeds 0.6 * expectedWindowMove 5 = 3.
    const ladder = buildLadderTargets({
      atr: 6,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104.5, 110],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.takeProfit1, 103);
  });

  it("falls back to the expected-move objective when no structural level qualifies", () => {
    // No pivot sits in the reachable band, so the runner is the window's own
    // expected-move objective: entry + runnerWindowShare * expectedWindowMove.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [90, 95, 99],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.runnerTarget, 105);
  });

  it("rejects the setup when the payoff floor is unreachable inside the window", () => {
    // minimumRunnerDistance = 1.9 * risk 3 = 5.7 exceeds the window's
    // reachable move of 5; the setup is rejected, not stretched.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104, 108, 120],
      riskDistance: 3,
      side: "buy",
    });

    assert.equal(ladder, null);
  });

  it("keeps the runner inside the reachable band even when structure sits farther", () => {
    // The only pivots beyond the floor are outside the reachable band, so the
    // runner caps at the expected-move objective instead of chasing them.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [108, 112],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.runnerTarget, 105);
  });

  it("banks a risk-scaled TP1 rather than a fixed ATR crumb", () => {
    // tp1 = max(risk 4 * 0.8 = 3.2, atr 2 * 0.8 = 1.6) capped by
    // 0.6 * expectedWindowMove 5 = 3.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: { ...ladderCalibration, minimumTargetRewardRisk: 1.2 },
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104.9],
      riskDistance: 4,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.takeProfit1, 103);
  });

  it("skips past too-close pivots to the nearest qualifying runner", () => {
    // Nearest pivot 102.5 is inside the 1.9 * risk 2 = 3.8 minimum distance;
    // the runner must advance to 104, the nearest level that qualifies.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [102.5, 104, 108],
      riskDistance: 2,
      side: "buy",
    });

    assert.ok(ladder);
    assert.equal(ladder.runnerTarget, 104);
  });

  it("rejects the setup when the runner cannot clear the minimum reward risk", () => {
    // Nearest pivot is 104 (4 away); 1.9 * risk 3 = 5.7 required.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104],
      riskDistance: 3,
      side: "buy",
    });

    assert.equal(ladder, null);
  });

  it("rejects the setup when TP1 would sit at or beyond the runner", () => {
    // tp1Distance = 1.6, but the only valid pivot is 101 (1 away).
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: { ...ladderCalibration, minimumTargetRewardRisk: 0.4 },
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [101],
      riskDistance: 2,
      side: "buy",
    });

    assert.equal(ladder, null);
  });

  it("mirrors the ladder for sells", () => {
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [104, 96, 92],
      riskDistance: 2,
      side: "sell",
    });

    assert.ok(ladder);
    assert.equal(ladder.takeProfit1, 98.4);
    assert.equal(ladder.runnerTarget, 96);
  });
});

// Triangle wave oscillating 98..102 so pivot highs sit near 102.3 and pivot
// lows near 97.7, with one early spike low to 90 that must NOT anchor the stop.
function syntheticMarket(): MarketContext {
  const primary: Bar[] = [];
  for (let index = 0; index < 120; index += 1) {
    const position = index % 20;
    const value = position < 10
      ? 98 + 0.4 * position
      : 102 - 0.4 * (position - 10);
    const spike = index === 60;
    primary.push({
      close: value,
      high: value + 0.3,
      low: spike ? 90 : value - 0.3,
      open: value,
      time: index * 900_000,
      volume: 1_000,
    });
  }
  // Daily range is ~10x the 15-minute ATR, matching real intraday-to-daily
  // volatility ratios, so window-feasibility math behaves like production.
  const daily: Bar[] = Array.from({ length: 80 }, (_, index) => ({
    close: 100 + (index % 2 === 0 ? 0.5 : -0.5),
    high: 103.2,
    low: 96.8,
    open: 100,
    time: index * 86_400_000,
    volume: 10_000,
  }));
  const latest = primary.at(-1)!;

  return {
    availableTimeframes: ["1day", "1hour", "15min"],
    daily,
    latest,
    latestTimeframe: "15min",
    primary,
    primaryTimeframe: "15min",
    providerWarnings: [],
    quote: null,
    timeframes: { "15min": primary, "1day": daily },
  };
}

const regime: Regime = {
  bias: "neutral",
  name: "range",
  rationale: "test",
  trendStrength: 0.5,
  volatilityPercentile: 0.5,
};

/**
 * `syntheticMarket` with every price multiplied, so a fixed tick grid stops
 * absorbing differences the test needs to see. Volumes and times are
 * untouched: only the price axis scales.
 */
function scaledMarket(scale: number): MarketContext {
  const base = syntheticMarket();
  const scaleBar = (bar: Bar): Bar => ({
    close: bar.close * scale,
    high: bar.high * scale,
    low: bar.low * scale,
    open: bar.open * scale,
    time: bar.time,
    volume: bar.volume,
  });
  const primary = base.primary.map(scaleBar);
  return {
    ...base,
    daily: base.daily.map(scaleBar),
    latest: primary.at(-1)!,
    primary,
  };
}

describe("price plan integration", () => {

  it("construction is single-anchor: a divergent market.latest changes nothing (#362 review, finding 1)", () => {
    // Pre-fix, the viability gate read market.latest while the entry math
    // read primary.at(-1) — so once the anchor moved to the completed
    // bar, an intra-bar rally larger than the entry offset rejected every
    // buy the corpus would have kept (and an intra-bar fall, every sell).
    // One anchor: the same primary series builds the same plan no matter
    // what market.latest claims — here it claims a close 5 below the
    // decision bar, which the old gate read as "entry above market" and
    // rejected.
    const baseline = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );
    const divergent = syntheticMarket();
    divergent.latest = { ...divergent.latest, close: divergent.latest.close - 5 };
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      divergent,
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(baseline);
    assert.ok(plan, "the old cross-anchor gate would have rejected this buy");
    assert.equal(plan.entryPrice, baseline.entryPrice);
    assert.equal(plan.stopLoss, baseline.stopLoss);
    assert.equal(plan.takeProfit, baseline.takeProfit);
  });

  // R2b's keystone, made checkable rather than asserted. The claim that
  // justified collapsing twelve proposed emit fields into five is that
  // `latestClose` reconstructs the plan. If it does not, the corpus is short
  // seven fields and R3 is the last chance to add them — so this proves it on
  // the plan's own output rather than on reasoning about the code.
  it("exposes enough to RECONSTRUCT the entry — the keystone claim, executed", () => {
    const calibration = getCategoryCalibration("EURUSD");
    for (const side of ["buy", "sell"] as const) {
      const plan = buildPricePlan(
        side,
        "EURUSD",
        syntheticMarket(),
        regime,
        calibration,
      );
      assert.ok(plan, `${side} plan must build`);
      // Rebuild the entry from ONLY what a corpus row now carries:
      // latestClose, atr, and the emitted entryProvenance.
      const offset = plan.atr *
        (plan.entryProvenance === "trend_offset"
          ? calibration.entryOffsetTrend
          : calibration.entryOffsetDefault);
      const reconstructed = side === "buy"
        ? plan.latestClose - offset
        : plan.latestClose + offset;
      assert.equal(
        Number(reconstructed.toFixed(5)),
        Number(plan.entryPrice.toFixed(5)),
        `${side}: entry must reconstruct from latestClose, atr and entryProvenance`,
      );
    }
  });

  /**
   * R2b's one open gap, closed by execution rather than by a ninth emit field.
   *
   * `stopPivotDistance` was measured against `entryPrice` AFTER the tick step
   * rewrote it, while the pivot it describes was selected against the
   * unaligned entry and consumed against it by the whole stop chain. So the
   * field meant one thing on the 70 grid-free markets and another on the 27
   * futures-shaped ones — and the error is not sub-tick. Measured on this
   * fixture, ZCUSX buy emitted 0.050 where the true distance is 0.294: a 5.9x
   * error, because ZC's 0.25 grid is comparable to the pivot distance itself.
   *
   * The reconstruction is anchored on production's OWN pivot finder rather
   * than on arithmetic retyped from the stop chain. A test that reimplements
   * the subject inherits the subject's bug; this one asks the engine where its
   * pivots are and requires the emitted distance to land exactly on the one
   * the plan used.
   */
  it("the emitted pivot distance lands on the pivot the stop chain used", () => {
    // Both grid shapes and both sides. ZCUSX is the case the HANDOFF recorded
    // as unreconstructible (`tp1Provenance: risk_share` on a futures grid);
    // EURUSD is the grid-free control, which must be unaffected.
    const cases = [
      { symbol: "ZCUSX", grid: true },
      { symbol: "LEUSX", grid: true },
      { symbol: "EURUSD", grid: false },
    ] as const;
    let checked = 0;
    for (const { symbol, grid } of cases) {
      const calibration = getCategoryCalibration(symbol);
      for (const side of ["buy", "sell"] as const) {
        const market = syntheticMarket();
        const plan = buildPricePlan(side, symbol, market, regime, calibration);
        assert.ok(plan, `${symbol} ${side}: plan must build`);
        if (plan.stopPivotDistance === null) continue;

        // The planned entry, from ONLY what a corpus row carries.
        const offset = plan.atr *
          (plan.entryProvenance === "trend_offset"
            ? calibration.entryOffsetTrend
            : calibration.entryOffsetDefault);
        const plannedEntry = side === "buy"
          ? plan.latestClose - offset
          : plan.latestClose + offset;

        // The pivot the plan actually selected, from the engine's own finder
        // over the same bars — never retyped here.
        const pivots = findSwingPivots(market.primary, 3);
        const truePivot = nearestLevelBeyond(
          side === "buy" ? "sell" : "buy",
          plannedEntry,
          side === "buy" ? pivots.lows : pivots.highs,
        );
        assert.ok(
          truePivot !== null,
          `${symbol} ${side}: fixture must offer a pivot for this to mean anything`,
        );

        // The recovery: sign fixed by side, because nearestLevelBeyond
        // searches BELOW a buy entry and ABOVE a sell. Math.abs discards
        // nothing recoverable.
        const recovered = side === "buy"
          ? plannedEntry - plan.stopPivotDistance
          : plannedEntry + plan.stopPivotDistance;
        assert.ok(
          Math.abs(recovered - truePivot) < 1e-9,
          `${symbol} ${side} (${grid ? "grid" : "grid-free"}): recovered ` +
            `${recovered} is not the pivot the plan used (${truePivot}) — ` +
            `the emitted distance is anchored to the wrong entry`,
        );
        checked++;
      }
    }
    // NON-VACUITY: every `continue` above is a case that proved nothing, and a
    // fixture that stopped producing pivots would pass this loop silently.
    assert.ok(checked >= 5, `only ${checked} cases carried a pivot`);
  });

  it("recovers the PRE-ALIGNMENT risk, exactly, on the grid market that needs it", () => {
    // The specific claim the ninth emit field was proposed to buy: under
    // `risk_share` on a futures grid the ladder consumes the riskDistance from
    // BEFORE alignment while only the after value is emitted.
    //
    // THIS TEST WAS BLIND TO THE DEFECT IT NAMED. Its first version compared
    // the recovered risk to the emitted POST-alignment `riskDistance`, exact
    // on a grid-free market and inside a `tick * 2` tolerance on a grid one.
    // Both arms survived reverting the anchor: the exact arm ran only on
    // EURUSD, where there is no grid and so `plannedEntry === entryPrice` and
    // the defect cannot exist, and on ZCUSX the anchor error moves the
    // recovered risk by 0.040 — 0.16 ticks, far inside the tolerance. The
    // pivot test above was carrying the whole mutation result while this one
    // read as a second guard.
    //
    // The tolerance is gone rather than widened, and its stated derivation was
    // wrong anyway: "alignment moves entry and stop by under a tick each"
    // ignores the min-stop and min-target clamps in `applyFuturesTickRules`,
    // which rewrite the stop to `entry ∓ tickSize × minStopTicks` and can move
    // it by many ticks.
    //
    // What replaces it needs no tolerance at all. Push the RECOVERED planned
    // entry and stop back through production's own tick rules and they must
    // reproduce the plan's own aligned levels bit-for-bit; then the recovered
    // pre-alignment risk must drive TP1 to the plan's own `takeProfit1`. That
    // is an exact assertion, on the grid market the gap was recorded against,
    // and it dies when the anchor moves.
    // THE FIXTURE IS SCALED x5, and that is load-bearing rather than
    // incidental. At the unscaled price the anchor error is 0.244 against
    // ZC's 0.25 tick, so the grid and the min-stop clamp both round the two
    // recoveries into the SAME aligned levels — the arithmetic differs
    // (unaligned TP1 98.4756 vs 98.3780) and the assertion cannot see it.
    // Scaling the prices raises the ATR against a fixed tick until the
    // difference survives alignment, which is what makes this test die when
    // the anchor moves instead of merely passing beside the pivot test.
    const calibration = getCategoryCalibration("ZCUSX");
    const plan = buildPricePlan(
      "buy",
      "ZCUSX",
      scaledMarket(5),
      regime,
      calibration,
    );
    assert.ok(plan);
    assert.equal(
      plan.tp1Provenance,
      "risk_share",
      "fixture drifted off the branch this test exists for",
    );
    assert.ok(plan.stopPivotDistance !== null, "this case needs a pivot");
    assert.ok(plan.contractSpec, "ZCUSX must resolve a tick grid");

    // Recovery, from emitted fields and pinned calibration only.
    const offset = plan.atr *
      (plan.entryProvenance === "trend_offset"
        ? calibration.entryOffsetTrend
        : calibration.entryOffsetDefault);
    const plannedEntry = plan.latestClose - offset;
    const pivot = plannedEntry - plan.stopPivotDistance;
    const stopBuffer = Math.max(
      plan.atr * calibration.stopAtrMultiplier,
      plan.dailyAtr * calibration.dailyStopAtrMultiplier,
    );
    const structural = Math.min(
      pivot - stopBuffer,
      plannedEntry - plan.atr * 1.25,
    );
    const cap = plannedEntry - plan.atr * calibration.maxStopAtrMultiplier;
    const plannedStop = Math.max(structural, cap);
    const plannedRisk = Math.abs(plannedEntry - plannedStop);
    const tp1 = plannedEntry + plannedRisk * calibration.tp1RiskShare;

    // Production's own alignment, over the recovered levels. Reimplementing it
    // would inherit whatever it has wrong; calling it is what makes the
    // comparison meaningful.
    const realigned = applyFuturesTickRules({
      entryPrice: plannedEntry,
      side: "buy",
      stopLoss: plannedStop,
      symbol: "ZCUSX",
      takeProfit: plan.takeProfit,
      takeProfit1: tp1,
    });
    assert.ok(realigned, "the recovered levels must survive the tick rules");
    assert.equal(
      realigned.entryPrice,
      plan.entryPrice,
      "recovered entry does not realign onto the plan's own entry",
    );
    assert.equal(
      realigned.stopLoss,
      plan.stopLoss,
      "recovered stop does not realign onto the plan's own stop",
    );
    assert.equal(
      realigned.takeProfit1,
      plan.takeProfit1,
      "the recovered PRE-alignment risk does not reproduce TP1 — which is " +
        "the exact reconstruction the ninth emit field was proposed to buy",
    );
  });

  it("measures its two geometry distances against the SAME anchor", () => {
    // The emit carries three distances on two anchors, and the difference is
    // invisible in a column of numbers. `stopPivotDistance` and
    // `runnerNearestBeyondMinimum` are both geometry facts about where
    // structure sat when the plan was built, so both must be measured against
    // the PLANNED entry — the stop chain and the ladder both run before tick
    // alignment. `unfilledApproachDistance` is the odd one out by design: it
    // is an execution fact about the RESTING order.
    //
    // Asserted on a grid market, because on a grid-free one the two anchors
    // coincide and the test would pass over the defect it exists for.
    const calibration = getCategoryCalibration("ZCUSX");
    const market = scaledMarket(5);
    const plan = buildPricePlan("buy", "ZCUSX", market, regime, calibration);
    assert.ok(plan);
    assert.ok(plan.entryPrice !== plan.latestClose, "fixture must offset");
    assert.ok(
      plan.stopPivotDistance !== null && plan.runnerNearestBeyondMinimum !== null,
      "this fixture must produce both distances or it proves nothing",
    );

    const offset = plan.atr *
      (plan.entryProvenance === "trend_offset"
        ? calibration.entryOffsetTrend
        : calibration.entryOffsetDefault);
    const plannedEntry = plan.latestClose - offset;
    assert.notEqual(
      plannedEntry,
      plan.entryPrice,
      "alignment moved nothing on this fixture, so the two anchors coincide " +
        "and this test cannot discriminate",
    );

    // Both distances must land on a real pivot when applied to the PLANNED
    // entry — production's own finder, never retyped.
    const pivots = findSwingPivots(market.primary, 3);
    const levels = [...pivots.lows, ...pivots.highs];
    for (
      const [name, distance, direction] of [
        ["stopPivotDistance", plan.stopPivotDistance, -1],
        ["runnerNearestBeyondMinimum", plan.runnerNearestBeyondMinimum, 1],
      ] as const
    ) {
      const recovered = plannedEntry + direction * distance;
      assert.ok(
        levels.some((level) => Math.abs(level - recovered) < 1e-9),
        `${name} recovers ${recovered} from the planned entry, which is not ` +
          `one of this market's pivots — it is anchored somewhere else`,
      );
    }
  });

  it("exposes the second stop lever and the pivot distance the max() hid", () => {
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(plan);
    // dailyAtr is the other half of stopBuffer = max(atr x m1, dailyAtr x m2).
    // Without it, which lever bound is unrecoverable — the same defect
    // stopProvenance was created to end, one choice point over.
    assert.ok(Number.isFinite(plan.dailyAtr), "dailyAtr must be exposed");
    assert.ok(plan.dailyAtr > 0, "the fixture's daily series must yield an ATR");
    // stopPivotDistance separates "a pivot was chosen" from "a pivot existed
    // and lost to the cap" — null only when no pivot existed at all.
    assert.ok(
      plan.stopPivotDistance === null || plan.stopPivotDistance > 0,
      "stopPivotDistance is a distance or null, never zero or negative",
    );
    assert.equal(plan.latestClose, syntheticMarket().primary.at(-1)!.close);
  });

  it("refuses a limit the live market has already crossed — admission, not physics (#362 round 4, finding 1)", () => {
    const baseline = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(baseline);

    // The market fell through the buy limit since the anchor closed: the
    // ask sits below the entry, so the "limit" would fill instantly at
    // the touch — a market order wearing a limit costume, a shape the
    // zero-anchor-latency corpus contains none of. Refused at admission,
    // and the refusal names its own ground (#362 round 5, finding 1) —
    // 1b's rule: a distinct cause must not wear "no valid limit entry".
    const crossed = syntheticMarket();
    crossed.quote = {
      ask: baseline.entryPrice - 0.5,
      bid: baseline.entryPrice - 0.6,
      price: null,
      spread: 0.1,
      source: "fmp_quote",
    };
    const buyRefusal: { reason?: "quote_crossed" } = {};
    assert.equal(
      buildPricePlan(
        "buy",
        "EURUSD",
        crossed,
        regime,
        getCategoryCalibration("EURUSD"),
        buyRefusal,
      ),
      null,
    );
    assert.equal(buyRefusal.reason, "quote_crossed");

    // A quote that does not cross admits the plan and enters NO derived
    // price — construction stays single-anchor, and no refusal reason is
    // invented.
    const clear = syntheticMarket();
    clear.quote = {
      ask: baseline.entryPrice + 0.4,
      bid: baseline.entryPrice + 0.3,
      price: null,
      spread: 0.1,
      source: "fmp_quote",
    };
    const clearRefusal: { reason?: "quote_crossed" } = {};
    const admitted = buildPricePlan(
      "buy",
      "EURUSD",
      clear,
      regime,
      getCategoryCalibration("EURUSD"),
      clearRefusal,
    );
    assert.ok(admitted);
    assert.equal(clearRefusal.reason, undefined);
    assert.equal(admitted.entryPrice, baseline.entryPrice);
    assert.equal(admitted.stopLoss, baseline.stopLoss);
    assert.equal(admitted.takeProfit, baseline.takeProfit);

    // The sell branch is a separately sign-able comparison (#362 round
    // 5, finding 2): a transposed operator or a bid/ask swap would
    // refuse EVERY sell — a sell limit always rests above the bid — and
    // ship green with only the buy half executed.
    const sellBaseline = buildPricePlan(
      "sell",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(sellBaseline, "the fixture must produce a sell plan for the mirror cases");
    const sellCrossed = syntheticMarket();
    sellCrossed.quote = {
      ask: sellBaseline.entryPrice + 0.6,
      bid: sellBaseline.entryPrice + 0.5,
      price: null,
      spread: 0.1,
      source: "fmp_quote",
    };
    const sellRefusal: { reason?: "quote_crossed" } = {};
    assert.equal(
      buildPricePlan(
        "sell",
        "EURUSD",
        sellCrossed,
        regime,
        getCategoryCalibration("EURUSD"),
        sellRefusal,
      ),
      null,
    );
    assert.equal(sellRefusal.reason, "quote_crossed");
    const sellClear = syntheticMarket();
    sellClear.quote = {
      ask: sellBaseline.entryPrice - 0.3,
      bid: sellBaseline.entryPrice - 0.4,
      price: null,
      spread: 0.1,
      source: "fmp_quote",
    };
    const sellAdmitted = buildPricePlan(
      "sell",
      "EURUSD",
      sellClear,
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(sellAdmitted);
    assert.equal(sellAdmitted.entryPrice, sellBaseline.entryPrice);
    assert.equal(sellAdmitted.stopLoss, sellBaseline.stopLoss);
    assert.equal(sellAdmitted.takeProfit, sellBaseline.takeProfit);
  });

  it("emits a ladder with TP1 between entry and the runner target", () => {
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );

    assert.ok(plan);
    assert.ok(plan.takeProfit1 > plan.entryPrice);
    assert.ok(plan.takeProfit1 < plan.takeProfit);
  });

  it("anchors the stop to the nearest pivot low, not the window extreme", () => {
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );

    assert.ok(plan);
    // Old geometry: stop below the 90 spike minus a buffer. New geometry:
    // stop hangs off the nearest confirmed pivot low near 97.7.
    assert.ok(plan.stopLoss > 92);
    assert.ok(plan.stopLoss < plan.entryPrice);
  });

  it("keeps indices entry offsets shallow enough to fill in a cash session", () => {
    // Production data: 15 of 15 index setups expired unfilled with offsets
    // near 0.5 ATR. Index entries must sit close to the market.
    const calibration = getCategoryCalibration("SP");

    assert.ok(calibration.entryOffsetDefault <= 0.2);
    assert.ok(calibration.entryOffsetTrend <= 0.15);
  });

  it("defines a tp1 multiplier for every asset category", () => {
    for (
      const symbol of ["BTCUSD", "WTI", "EURUSD", "ESUSD", "SP", "XAUUSD"]
    ) {
      const calibration = getCategoryCalibration(symbol);
      assert.ok(
        calibration.tp1AtrMultiplier > 0 &&
          calibration.tp1AtrMultiplier <= 1.5,
        `tp1AtrMultiplier missing or out of range for ${symbol}`,
      );
    }
  });

// stopLogic was a constant asserting the stop sat "beyond the nearest confirmed
// swing pivot with a volatility buffer" on EVERY setup. It does not: structural
// candidates are floored at 1.25 ATR while the cap is maxStopAtrMultiplier ×
// ATR, so wherever the cap sits at or below 1.25 the cap binds by arithmetic
// and the pivot cannot win. The sentence was false wherever that held, while
// stopProvenance sat two lines away recording the truth.
//
// THE POPULATION HAS MOVED, and the old note here said "1.0 in seven of eight
// classes … the pivot never wins outside metals". Measured over the 97-market
// scan roster on 2026-08-25: maxStopAtrMultiplier is 1.0 on 26 markets, 2.5 on
// 6 and 4.0 on 65, so 71 markets sit ABOVE the structural floor and both
// levers are live on them. Those cells came from the 4c/4d corpus that
// trade-model.md's own banner declares invalid, so this states where the
// mechanism stands and settles nothing about whether the cells are right.
//
// It is now derived from that provenance, so the description cannot outlive the
// mechanism. These assert the pairing rather than any one wording.
describe("stopLogic describes what actually set the stop", () => {
  const cases: Array<[string, string]> = [
    ["cap", "volatility ceiling"],
    ["pivot", "swing pivot"],
    ["volatility_floor", "minimum volatility width"],
  ];

  it("says the ceiling bound it when the ceiling bound it", () => {
    const plan = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(plan);
    const expected = cases.find(([provenance]) =>
      provenance === plan.stopProvenance
    );
    assert.ok(expected, `unknown provenance ${plan.stopProvenance}`);
    assert.match(plan.stopLogic, new RegExp(expected![1]));
  });

  it("never claims a pivot anchored a stop the cap set", () => {
    // UNCONDITIONAL, and it was not. This assertion sat behind
    // `if (plan.stopProvenance !== "pivot")`, and EURUSD's provenance is
    // `pivot` — so the guard was false, the body never ran, and the test
    // reported green having examined nothing.
    //
    // Both branches are now driven deliberately: a cap-4.0 market where the
    // pivot can win, and a cap-1.0 market where the cap binds by arithmetic.
    // Whichever way a future calibration moves EURUSD, one of these still
    // exercises each branch.
    const capBound = buildPricePlan(
      "buy",
      "DOW",
      syntheticMarket(),
      regime,
      getCategoryCalibration("DOW"),
    );
    assert.ok(capBound, "the cap-bound fixture no longer produces a plan");
    assert.equal(getCategoryCalibration("DOW").maxStopAtrMultiplier, 1);
    assert.equal(capBound.stopProvenance, "cap");
    assert.doesNotMatch(
      capBound.stopLogic,
      /swing pivot/,
      "a stop the cap set must not be described as pivot-anchored",
    );

    const pivotBound = buildPricePlan(
      "buy",
      "EURUSD",
      syntheticMarket(),
      regime,
      getCategoryCalibration("EURUSD"),
    );
    assert.ok(pivotBound);
    assert.equal(getCategoryCalibration("EURUSD").maxStopAtrMultiplier, 4);
    assert.equal(pivotBound.stopProvenance, "pivot");
    assert.match(
      pivotBound.stopLogic,
      /swing pivot/,
      "a stop the pivot DID set must say so",
    );
  });
});
});


// 1b: the two fail-open gates. Gate 1 asked `assetType === "futures"`, so
// agriculture and livestock — exchange futures on real tick grids — never
// reached alignment; gate 2 silently kept an unaligned plan when the spec
// lookup missed. A missing contract spec now refuses, and the refusal
// happens at the analysis door with its own reason, not inside the plan.
describe("1b: futures-shaped classes align or refuse — nothing ships off-grid", () => {
  const INDEX_SOURCE = readFileSync(
    "supabase/functions/trade-analyzer/index.ts",
    "utf8",
  );

  it("aligns livestock to its grid — the class gate covers all three futures-shaped classes", () => {
    const plan = buildPricePlan(
      "buy",
      "LEUSX",
      syntheticMarket(),
      regime,
      getCategoryCalibration("LEUSX"),
    );

    assert.ok(plan, "livestock must build a plan once its spec exists");
    for (
      const [name, level] of [
        ["entryPrice", plan.entryPrice],
        ["stopLoss", plan.stopLoss],
        ["takeProfit", plan.takeProfit],
        ["takeProfit1", plan.takeProfit1],
      ] as const
    ) {
      const ticks = level / 0.025;
      assert.ok(
        Math.abs(ticks - Math.round(ticks)) < 1e-6,
        `${name} ${level} must sit on LE's 0.025 grid`,
      );
    }
  });

  it("keeps the belt: a spec-less futures-shaped symbol cannot ship a plan", () => {
    // Amendment 32 emptied the population this used to exercise with FESX —
    // every futures-shaped symbol left on the roster now HAS a verified
    // spec, which is 1b's completion, not a gap. The belt stays for the day
    // a new futures market onboards ahead of its spec, so it is pinned as
    // source: the gate consults the same predicate the door does, and a
    // null tick plan on a grid-needing symbol refuses the whole plan.
    const PLAN_SOURCE = readFileSync(
      "supabase/functions/trade-analyzer/pricePlan.ts",
      "utf8",
    );
    assert.match(PLAN_SOURCE, /const needsTickGrid = needsFuturesTickGrid\(symbol\);/);
    // The stamp between the guard and the return is R2b's refusal channel —
    // the branch still refuses, and now says which branch it was.
    assert.match(
      PLAN_SOURCE,
      /if \(needsTickGrid && !futuresTickPlan\) \{\s*\n\s*if \(refusal\) refusal\.reason = "no_contract_spec";\s*\n\s*return null;/,
    );
  });

  it("refuses at the analysis door, with the missing spec named — not a price-validation excuse", () => {
    // The door check runs before direction and scoring, so the reader sees
    // the true ground. Without it, the spec-less refusal would wear "A valid
    // limit entry was not available." — replacing one lie with another.
    assert.match(
      INDEX_SOURCE,
      /needsFuturesTickGrid\(normalizedSymbol\) &&\s*!getFuturesContractSpec\(normalizedSymbol\)/,
    );
    assert.match(
      INDEX_SOURCE,
      /reason:\s*"This market's price increments are not yet verified, so no setup is shown\.",/,
    );
  });

  it("emits all four provenances into the risk model — the corpus can audit what it stores", () => {
    // runnerProvenance, tp1Provenance and entryProvenance were computed and
    // dropped on the floor, which blocked calibration 4d's TP1 and runner
    // phases: nothing could ask which anchor actually placed a level.
    for (const field of ["stopProvenance", "runnerProvenance", "tp1Provenance", "entryProvenance"]) {
      assert.match(
        INDEX_SOURCE,
        new RegExp(`${field}: pricePlan\\.${field},`),
        field,
      );
    }
  });

  it("keeps ANALYZER_VERSION at its canonical home, and imports it", () => {
    // This used to pin the version LITERAL, a second copy of the one in
    // calibrationState.test.ts — which is precisely how the 2026.08.25 bump
    // shipped locally green and failed in CI: three pins were moved and this
    // fourth was not. A constant with two independent pins has two chances to
    // be forgotten and no mechanism that notices.
    //
    // So the literal now lives in exactly ONE test, where it is also
    // cross-checked against trade-model.md's stated version and its cohort
    // SQL. What belongs here is the structural claim this file actually
    // cares about: the constant sits in the one Deno-free module the Edge
    // function and the sweep manifest can both import, and index.ts imports
    // it rather than restating it.
    const calibrationSource = readFileSync(
      "supabase/functions/trade-analyzer/calibration.ts",
      "utf8",
    );
    assert.match(
      calibrationSource,
      /export const ANALYZER_VERSION = "\d{4}\.\d{2}\.\d{2}\.[a-z0-9-]+";/,
    );
    assert.match(INDEX_SOURCE, /ANALYZER_VERSION,\n/);
  });
});

// 1o's residue: stopLogic was repaired to derive from provenance (#248), and
// targetLogic — one field over in the same return — kept asserting "the
// runner is the nearest structural level" unconditionally, while
// runnerProvenance two lines above recorded window_ceiling for most of the
// corpus, and TP1's own provenance recorded that the "risk-scaled partial"
// is frequently the ATR floor or the window cap instead.
describe("targetLogic derives from what actually happened (1o residue)", () => {
  const PLAN_SOURCE = readFileSync(
    "supabase/functions/trade-analyzer/pricePlan.ts",
    "utf8",
  );

  it("keeps no unconditional target sentence", () => {
    assert.doesNotMatch(
      PLAN_SOURCE,
      /targetLogic:\s*\n?\s*"TP1 banks a risk-scaled partial; the runner is the nearest structural level/,
    );
    assert.match(PLAN_SOURCE, /TP1_LOGIC_BY_PROVENANCE/);
    assert.match(PLAN_SOURCE, /RUNNER_LOGIC_BY_PROVENANCE/);
    assert.match(
      PLAN_SOURCE,
      /targetLogic: `\$\{TP1_LOGIC_BY_PROVENANCE\[ladder\.tp1Provenance\]\} \$\{\s*RUNNER_LOGIC_BY_PROVENANCE\[ladder\.runnerProvenance\]\s*\}`,/,
    );
  });

  it("describes the ceiling as the ceiling when no structural level qualified", () => {
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: ladderCalibration,
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [],
      riskDistance: 2,
      side: "buy",
    });
    assert.ok(ladder);
    assert.equal(ladder.runnerProvenance, "window_ceiling");
  });
});

describe("runnerNearestBeyondMinimum — what window_ceiling could not say", () => {
  // `runnerProvenance: "window_ceiling"` collapses two opposite causes: no
  // structure at these distances, or structure the review window cannot
  // reach. Different findings with different remedies, and a corpus full of
  // the word could not tell them apart.
  //
  // Constructed here rather than in the sweep because the sweep's fixture
  // yields no qualifying pivots at all — an assertion there cannot separate a
  // real value from a hardcoded one.

  it("reports the distance when structure exists BEYOND the window's reach", () => {
    // runnerWindowShare 0.2 pulls the cap in below the pivot, so the level
    // clears the minimum payoff and is excluded only by the window.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: { ...ladderCalibration, runnerWindowShare: 0.5 },
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [140],
      riskDistance: 1,
      side: "buy",
    });
    assert.ok(ladder, "the fixture produced no ladder");
    assert.equal(ladder.runnerProvenance, "window_ceiling");
    assert.equal(
      ladder.runnerNearestBeyondMinimum,
      40,
      "the structure is 40 away and the row must say so",
    );
  });

  it("reports null when no structure clears the minimum at all", () => {
    // The other cause of the same word: a pivot far too close to be a runner.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: { ...ladderCalibration, runnerWindowShare: 0.5 },
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [100.01],
      riskDistance: 1,
      side: "buy",
    });
    assert.ok(ladder);
    assert.equal(ladder.runnerProvenance, "window_ceiling");
    assert.equal(ladder.runnerNearestBeyondMinimum, null);
  });

  it("is measured without the cap, so it can exceed the runner itself", () => {
    // THE MUTATION THIS CATCHES: re-applying the window cap to this search
    // makes it agree with the runner on every row, which is exactly the
    // collapse it exists to undo.
    const ladder = buildLadderTargets({
      atr: 2,
      calibration: { ...ladderCalibration, runnerWindowShare: 0.5 },
      dailyAtr: 10,
      entryPrice: 100,
      pivotLevels: [140],
      riskDistance: 1,
      side: "buy",
    });
    assert.ok(ladder);
    const runnerDistance = Math.abs(ladder.runnerTarget - 100);
    assert.ok(
      ladder.runnerNearestBeyondMinimum! > runnerDistance,
      `structure at ${ladder.runnerNearestBeyondMinimum} must sit beyond the runner at ${runnerDistance}`,
    );
  });
});
