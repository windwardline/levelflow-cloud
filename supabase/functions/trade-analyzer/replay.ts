import { getAssetType, getCategoryCalibration } from "./calibration.ts";

export type ReplayBar = {
  close: number;
  high: number;
  low: number;
  open: number;
  time: number;
  volume?: number;
};

export type ReplaySetup = {
  created_at: string;
  limit_entry: number | string;
  side: "buy" | "sell";
  stop_loss: number | string;
  symbol: string;
  take_profit: number | string;
  take_profit_1?: number | string | null;
};

export type ResolvedOutcome =
  | "ambiguous"
  | "expired_at_loss"
  | "expired_in_profit"
  | "pending"
  | "stop_loss"
  | "take_profit"
  | "tp1_partial"
  | "unfilled";

// 2f (2026-08-09): a resolution is a sequence of executions. Legs carry the
// prices that could actually print — a bar that OPENS beyond a level
// executes at its open (worse than a stop gapped through, better than a
// limit gapped past), because the open is the first print an order could
// meet. The sweep's R accountant reads these instead of reconstructing
// exits from the plan's nominal levels, and outcome-sync persists them
// inside feedback for the learning tables.
export type RunnerProtection = "breakeven" | "hold" | "trail_tp1";

export type ResolutionLegKind =
  | "ambiguous"
  | "breakeven_stop"
  | "expiry"
  | "stop_loss"
  | "take_profit"
  | "tp1_lock";

export type ResolutionLeg = {
  kind?: ResolutionLegKind;
  leg: "entry" | "exit" | "tp1";
  price: number;
  time: number;
};

export type ReplayOutcome =
  | {
    state: "pending";
  }
  | {
    feedback: Record<string, unknown>;
    filledAt: string;
    state: "placed";
  }
  | {
    exitAt: string;
    feedback: Record<string, unknown>;
    filledAt?: string;
    legs: ResolutionLeg[];
    outcome: Exclude<ResolvedOutcome, "pending">;
    state: "resolved";
  };

export function evaluateSetupOutcome(
  setup: ReplaySetup,
  bars: ReplayBar[],
  now = Date.now(),
  options?: { reviewHours?: number; runnerProtection?: RunnerProtection },
): ReplayOutcome {
  const entry = Number(setup.limit_entry);
  const stopLoss = Number(setup.stop_loss);
  const takeProfit = Number(setup.take_profit);
  const createdAt = new Date(setup.created_at).getTime();
  const expiresAt = getSetupExpiryTime(
    setup.symbol,
    createdAt,
    options?.reviewHours,
  );
  const createdBars = bars.filter((bar) =>
    bar.time >= createdAt && bar.time <= expiresAt
  );

  if (
    !Number.isFinite(entry) || !Number.isFinite(stopLoss) ||
    !Number.isFinite(takeProfit)
  ) {
    return { state: "pending" };
  }

  if (createdBars.length === 0) {
    if (now > expiresAt) {
      return {
        exitAt: new Date(expiresAt).toISOString(),
        feedback: {
          expiresAt: new Date(expiresAt).toISOString(),
          legs: [],
          reason:
            "No post-recommendation bars were available before the setup review window expired.",
          source: "price_path_review",
        },
        legs: [],
        outcome: "unfilled",
        state: "resolved",
      };
    }
    return { state: "pending" };
  }

  let fillIndex = -1;
  for (let index = 0; index < createdBars.length; index += 1) {
    const bar = createdBars[index];
    const filled = setup.side === "buy" ? bar.low <= entry : bar.high >= entry;
    if (filled) {
      fillIndex = index;
      break;
    }
  }

  if (fillIndex < 0) {
    if (now > expiresAt) {
      return {
        exitAt: new Date(expiresAt).toISOString(),
        feedback: {
          expiresAt: new Date(expiresAt).toISOString(),
          legs: [],
          reason:
            "Limit entry did not fill before the setup review window expired.",
          source: "price_path_review",
        },
        legs: [],
        outcome: "unfilled",
        state: "resolved",
      };
    }
    return { state: "pending" };
  }

  const fillBar = createdBars[fillIndex];
  const filledAt = new Date(fillBar.time).toISOString();
  const tp1Raw = Number(setup.take_profit_1);
  const takeProfit1 = Number.isFinite(tp1Raw) && tp1Raw > 0 ? tp1Raw : null;
  // The R unit stays the PLANNED risk — position size was computed on the
  // nominal entry-to-stop distance. Executions vary from the plan (legs
  // below); the yardstick does not.
  const riskDistance = Math.abs(entry - stopLoss);
  const isBuy = setup.side === "buy";
  const reachedFavorable = (level: number, bar: ReplayBar) =>
    isBuy ? bar.high >= level : bar.low <= level;
  const reachedAdverse = (level: number, bar: ReplayBar) =>
    isBuy ? bar.low <= level : bar.high >= level;
  // Gap-aware execution prints: a level order fills at the bar's open when
  // the bar opens beyond the level — worse for stops, better for limits.
  const adverseExitPrice = (level: number, bar: ReplayBar) =>
    isBuy ? Math.min(bar.open, level) : Math.max(bar.open, level);
  const favorableFillPrice = (level: number, bar: ReplayBar) =>
    isBuy ? Math.max(bar.open, level) : Math.min(bar.open, level);
  // The entry is itself a limit: a fill bar opening through it is a
  // price-improved fill at the open.
  const fillPrice = isBuy
    ? Math.min(fillBar.open, entry)
    : Math.max(fillBar.open, entry);
  const legs: ResolutionLeg[] = [
    { leg: "entry", price: roundPrice(fillPrice), time: fillBar.time },
  ];
  let maxFavorableMove = 0;
  let maxAdverseMove = 0;
  let tp1Hit = false;
  let lastClose = entry;

  for (let index = fillIndex; index < createdBars.length; index += 1) {
    const bar = createdBars[index];
    // 2c: on the fill bar, only ADVERSE facts are knowable. The fill is the
    // downward (buy) crossing of the entry, and any path to the stop passes
    // the entry first — so a stop-reach is certain. The bar's favorable
    // extreme may have printed before the fill ever happened, so target and
    // TP1 touches — and the favorable excursion statistic — begin on the
    // next bar. The old resolver credited fill-bar highs as post-fill,
    // printing take_profits on trades that were knowably never in profit.
    const isFillBar = index === fillIndex;
    if (!isFillBar) {
      maxFavorableMove = Math.max(
        maxFavorableMove,
        isBuy ? bar.high - entry : entry - bar.low,
      );
    }
    maxAdverseMove = Math.max(
      maxAdverseMove,
      isBuy ? entry - bar.low : bar.high - entry,
    );
    lastClose = bar.close;

    // Once TP1 is banked, the runner's protection is a MODE (4c axis):
    // breakeven jumps the stop to entry (the shipped default), hold leaves
    // the original stop, trail_tp1 locks the stop at TP1's own level.
    const protection = options?.runnerProtection ?? "breakeven";
    const effectiveStop = !tp1Hit
      ? stopLoss
      : protection === "hold"
      ? stopLoss
      : protection === "trail_tp1"
      ? takeProfit1!
      : entry;
    const stopHit = reachedAdverse(effectiveStop, bar);
    const targetHit = !isFillBar && reachedFavorable(takeProfit, bar);
    const tp1Touched = !isFillBar && !tp1Hit && takeProfit1 !== null &&
      reachedFavorable(takeProfit1, bar);

    if (stopHit || targetHit) {
      const outcome: Exclude<ResolvedOutcome, "pending"> =
        stopHit && targetHit
          ? "ambiguous"
          : targetHit
          ? "take_profit"
          : tp1Hit
          ? "tp1_partial"
          : tp1Touched
          ? "ambiguous"
          : "stop_loss";
      if (outcome === "take_profit") {
        // A path to the runner target crossed TP1 first (it sits between
        // entry and target), so the partial banked en route — certain even
        // inside one bar.
        if (tp1Touched && takeProfit1 !== null) {
          legs.push({
            leg: "tp1",
            price: roundPrice(favorableFillPrice(takeProfit1, bar)),
            time: bar.time,
          });
        }
        legs.push({
          kind: "take_profit",
          leg: "exit",
          price: roundPrice(favorableFillPrice(takeProfit, bar)),
          time: bar.time,
        });
      } else if (outcome === "ambiguous") {
        // Unknowable order resolves against the trade (2e): the exit is
        // priced at the stop side — the true stop before TP1, breakeven
        // after — and no TP1 leg is granted by a bar that might have
        // stopped first.
        legs.push({
          kind: "ambiguous",
          leg: "exit",
          price: roundPrice(adverseExitPrice(effectiveStop, bar)),
          time: bar.time,
        });
      } else {
        legs.push({
          kind: !tp1Hit
            ? "stop_loss"
            : protection === "hold"
            ? "stop_loss"
            : protection === "trail_tp1"
            ? "tp1_lock"
            : "breakeven_stop",
          leg: "exit",
          price: roundPrice(adverseExitPrice(effectiveStop, bar)),
          time: bar.time,
        });
      }
      return {
        exitAt: new Date(bar.time).toISOString(),
        feedback: {
          ambiguousSameBar: stopHit && (targetHit || tp1Touched),
          legs,
          maxAdverseMove: roundPrice(maxAdverseMove),
          maxFavorableMove: roundPrice(maxFavorableMove),
          source: "price_path_review",
          tp1Hit: tp1Hit || (tp1Touched && outcome === "take_profit"),
        },
        filledAt,
        legs,
        outcome,
        state: "resolved",
      };
    }

    if (tp1Touched && takeProfit1 !== null) {
      tp1Hit = true;
      legs.push({
        leg: "tp1",
        price: roundPrice(favorableFillPrice(takeProfit1, bar)),
        time: bar.time,
      });
    }
  }

  if (now > expiresAt) {
    // Realized from the ACTUAL fill print — a gap-improved entry earns its
    // improvement — against the planned risk unit.
    const realizedR = riskDistance > 0
      ? Number(
        (((isBuy ? 1 : -1) * (lastClose - fillPrice)) / riskDistance).toFixed(
          4,
        ),
      )
      : 0;
    legs.push({
      kind: "expiry",
      leg: "exit",
      price: roundPrice(lastClose),
      time: createdBars.at(-1)!.time,
    });
    return {
      exitAt: new Date(expiresAt).toISOString(),
      feedback: {
        legs,
        maxAdverseMove: roundPrice(maxAdverseMove),
        maxFavorableMove: roundPrice(maxFavorableMove),
        realizedR,
        reason: tp1Hit
          ? "TP1 was reached, but the runner target was not hit before the review window ended."
          : "Entry filled, but neither target nor stop was reached before the setup review window ended.",
        source: "price_path_review",
        tp1Hit,
      },
      filledAt,
      legs,
      outcome: tp1Hit
        ? "tp1_partial"
        : realizedR > 0
        ? "expired_in_profit"
        : "expired_at_loss",
      state: "resolved",
    };
  }

  return {
    feedback: {
      legs,
      maxAdverseMove: roundPrice(maxAdverseMove),
      maxFavorableMove: roundPrice(maxFavorableMove),
      source: "price_path_review",
      tp1Hit,
    },
    filledAt,
    state: "placed",
  };
}

// reviewHoursOverride exists for the sweep: grid variants of the review
// window must govern resolution too, not just setup construction. Live
// callers omit it and get the shipped calibration.
export function getSetupExpiryTime(
  symbol: string,
  createdAt: number,
  reviewHoursOverride?: number,
) {
  const calibration = getCategoryCalibration(symbol);
  const reviewHours = Number.isFinite(reviewHoursOverride)
    ? reviewHoursOverride as number
    : calibration.defaultReviewHours;
  const defaultExpiry = createdAt + reviewHours * 60 * 60 * 1000;
  const weeklyClose = getUpcomingWeeklyCloseTime(symbol, createdAt);
  if (!weeklyClose) {
    return defaultExpiry;
  }
  const weeklyCutoff = weeklyClose - 5 * 60 * 1000;
  return Math.min(
    defaultExpiry,
    weeklyCutoff > createdAt ? weeklyCutoff : weeklyClose,
  );
}

export function getUpcomingWeeklyCloseTime(symbol: string, fromTimestamp: number) {
  if (getAssetType(symbol) === "crypto") {
    return null;
  }

  const marketTimeZone = "America/New_York";
  const assetType = getAssetType(symbol);
  const usesFuturesStyleClose = assetType === "futures" ||
    assetType === "indices" || assetType === "energies" ||
    assetType === "metals";
  const closeHour = usesFuturesStyleClose ? 17 : 16;
  const closeMinute = usesFuturesStyleClose ? 0 : 59;
  const from = new Date(fromTimestamp);

  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const candidateUtc = getZonedTargetUtc(
      from,
      marketTimeZone,
      dayOffset,
      5,
      closeHour,
      closeMinute,
    );
    if (candidateUtc > fromTimestamp) {
      return candidateUtc;
    }
  }

  return null;
}

function getZonedTargetUtc(
  from: Date,
  timeZone: string,
  dayOffset: number,
  targetWeekday: number,
  hour: number,
  minute: number,
) {
  const base = new Date(from.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const noonUtc = Date.UTC(
    base.getUTCFullYear(),
    base.getUTCMonth(),
    base.getUTCDate(),
    12,
    0,
    0,
  );
  const parts = getZonedDateParts(new Date(noonUtc), timeZone);
  if (parts.weekday !== targetWeekday) {
    return 0;
  }
  const naiveUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    0,
  );
  const offset = getTimeZoneOffsetMs(new Date(naiveUtc), timeZone);
  return naiveUtc - offset;
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour12: false,
    month: "2-digit",
    timeZone,
    weekday: "short",
    year: "numeric",
  }).formatToParts(date);
  const lookup = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const weekdayMap: Record<string, number> = {
    Fri: 5,
    Mon: 1,
    Sat: 6,
    Sun: 7,
    Thu: 4,
    Tue: 2,
    Wed: 3,
  };
  return {
    day: Number(lookup.day ?? 1),
    month: Number(lookup.month ?? 1),
    weekday: weekdayMap[lookup.weekday ?? "Mon"] ?? 1,
    year: Number(lookup.year ?? 1970),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const lookup = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(lookup.year ?? 1970),
    Number(lookup.month ?? 1) - 1,
    Number(lookup.day ?? 1),
    Number(lookup.hour ?? 0),
    Number(lookup.minute ?? 0),
    Number(lookup.second ?? 0),
  );
  return asUtc - date.getTime();
}

function roundPrice(value: number) {
  return Number(value.toFixed(8));
}
