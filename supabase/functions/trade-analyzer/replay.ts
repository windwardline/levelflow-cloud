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
    outcome: Exclude<ResolvedOutcome, "pending">;
    state: "resolved";
  };

export function evaluateSetupOutcome(
  setup: ReplaySetup,
  bars: ReplayBar[],
  now = Date.now(),
): ReplayOutcome {
  const entry = Number(setup.limit_entry);
  const stopLoss = Number(setup.stop_loss);
  const takeProfit = Number(setup.take_profit);
  const createdAt = new Date(setup.created_at).getTime();
  const expiresAt = getSetupExpiryTime(setup.symbol, createdAt);
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
          reason:
            "No post-recommendation bars were available before the setup review window expired.",
          source: "price_path_review",
        },
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
          reason:
            "Limit entry did not fill before the setup review window expired.",
          source: "price_path_review",
        },
        outcome: "unfilled",
        state: "resolved",
      };
    }
    return { state: "pending" };
  }

  const filledAt = new Date(createdBars[fillIndex].time).toISOString();
  const tp1Raw = Number(setup.take_profit_1);
  const takeProfit1 = Number.isFinite(tp1Raw) && tp1Raw > 0 ? tp1Raw : null;
  const riskDistance = Math.abs(entry - stopLoss);
  const isBuy = setup.side === "buy";
  const reachedFavorable = (level: number, bar: ReplayBar) =>
    isBuy ? bar.high >= level : bar.low <= level;
  const reachedAdverse = (level: number, bar: ReplayBar) =>
    isBuy ? bar.low <= level : bar.high >= level;
  let maxFavorableMove = 0;
  let maxAdverseMove = 0;
  let tp1Hit = false;
  let lastClose = entry;

  for (const bar of createdBars.slice(fillIndex)) {
    maxFavorableMove = Math.max(
      maxFavorableMove,
      isBuy ? bar.high - entry : entry - bar.low,
    );
    maxAdverseMove = Math.max(
      maxAdverseMove,
      isBuy ? entry - bar.low : bar.high - entry,
    );
    lastClose = bar.close;

    // Once TP1 is banked, the remaining runner is protected at breakeven.
    const effectiveStop = tp1Hit ? entry : stopLoss;
    const stopHit = reachedAdverse(effectiveStop, bar);
    const targetHit = reachedFavorable(takeProfit, bar);
    const tp1Touched = !tp1Hit && takeProfit1 !== null &&
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
      return {
        exitAt: new Date(bar.time).toISOString(),
        feedback: {
          ambiguousSameBar: stopHit && (targetHit || tp1Touched),
          maxAdverseMove: roundPrice(maxAdverseMove),
          maxFavorableMove: roundPrice(maxFavorableMove),
          source: "price_path_review",
          tp1Hit: tp1Hit || tp1Touched,
        },
        filledAt,
        outcome,
        state: "resolved",
      };
    }

    if (tp1Touched) {
      tp1Hit = true;
    }
  }

  if (now > expiresAt) {
    const realizedR = riskDistance > 0
      ? Number(
        (((isBuy ? 1 : -1) * (lastClose - entry)) / riskDistance).toFixed(4),
      )
      : 0;
    return {
      exitAt: new Date(expiresAt).toISOString(),
      feedback: {
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
      maxAdverseMove: roundPrice(maxAdverseMove),
      maxFavorableMove: roundPrice(maxFavorableMove),
      source: "price_path_review",
      tp1Hit,
    },
    filledAt,
    state: "placed",
  };
}

export function getSetupExpiryTime(symbol: string, createdAt: number) {
  const calibration = getCategoryCalibration(symbol);
  const defaultExpiry = createdAt +
    calibration.defaultReviewHours * 60 * 60 * 1000;
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

function getUpcomingWeeklyCloseTime(symbol: string, fromTimestamp: number) {
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
