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
};

export type ResolvedOutcome =
  | "ambiguous"
  | "pending"
  | "stop_loss"
  | "take_profit"
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
  let maxFavorableMove = 0;
  let maxAdverseMove = 0;

  for (const bar of createdBars.slice(fillIndex)) {
    if (setup.side === "buy") {
      maxFavorableMove = Math.max(maxFavorableMove, bar.high - entry);
      maxAdverseMove = Math.max(maxAdverseMove, entry - bar.low);
      const targetHit = bar.high >= takeProfit;
      const stopHit = bar.low <= stopLoss;

      if (stopHit || targetHit) {
        return {
          exitAt: new Date(bar.time).toISOString(),
          feedback: {
            ambiguousSameBar: stopHit && targetHit,
            maxAdverseMove: roundPrice(maxAdverseMove),
            maxFavorableMove: roundPrice(maxFavorableMove),
            source: "price_path_review",
          },
          filledAt,
          outcome: stopHit && targetHit
            ? "ambiguous"
            : stopHit
            ? "stop_loss"
            : "take_profit",
          state: "resolved",
        };
      }
    } else {
      maxFavorableMove = Math.max(maxFavorableMove, entry - bar.low);
      maxAdverseMove = Math.max(maxAdverseMove, bar.high - entry);
      const targetHit = bar.low <= takeProfit;
      const stopHit = bar.high >= stopLoss;

      if (stopHit || targetHit) {
        return {
          exitAt: new Date(bar.time).toISOString(),
          feedback: {
            ambiguousSameBar: stopHit && targetHit,
            maxAdverseMove: roundPrice(maxAdverseMove),
            maxFavorableMove: roundPrice(maxFavorableMove),
            source: "price_path_review",
          },
          filledAt,
          outcome: stopHit && targetHit
            ? "ambiguous"
            : stopHit
            ? "stop_loss"
            : "take_profit",
          state: "resolved",
        };
      }
    }
  }

  if (now > expiresAt) {
    return {
      exitAt: new Date(expiresAt).toISOString(),
      feedback: {
        maxAdverseMove: roundPrice(maxAdverseMove),
        maxFavorableMove: roundPrice(maxFavorableMove),
        reason:
          "Entry filled, but neither target nor stop was reached before the setup review window ended.",
        source: "price_path_review",
      },
      filledAt,
      outcome: "ambiguous",
      state: "resolved",
    };
  }

  return {
    feedback: {
      maxAdverseMove: roundPrice(maxAdverseMove),
      maxFavorableMove: roundPrice(maxFavorableMove),
      source: "price_path_review",
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
  const closeHour = getAssetType(symbol) === "futures" ? 17 : 16;
  const closeMinute = getAssetType(symbol) === "futures" ? 0 : 59;
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
