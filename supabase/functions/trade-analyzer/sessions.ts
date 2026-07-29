import { getAssetType } from "./calibration.ts";

export type SessionContext = {
  block: boolean;
  label: string;
  marketKind: string;
  penalty: number;
  reason?: string;
};

export function getSessionContext(
  symbol: string,
  now = new Date(),
): SessionContext {
  const assetType = getAssetType(symbol);

  if (assetType === "crypto") {
    // 12:00-18:00 UTC measured negative on both walk-forward splits across
    // 3+ years (US-session momentum flows work against pullback entries).
    if (isLowEdgeUtcWindow(now)) {
      return {
        block: true,
        label: "Crypto low-edge window",
        marketKind: "crypto",
        penalty: 100,
        reason:
          "Measured results for crypto setups opened between 12:00 and 18:00 UTC were negative across 3+ years of replay, so LevelFlow does not open new crypto setups in this window.",
      };
    }
    return {
      block: false,
      label: "Continuous digital asset session",
      marketKind: "crypto",
      penalty: 0,
    };
  }

  if (
    assetType === "futures" || assetType === "metals" ||
    assetType === "energies" || assetType === "indices"
  ) {
    const isMetals = assetType === "metals";
    const isEnergies = assetType === "energies";
    const isIndices = assetType === "indices";
    const marketKind = isMetals
      ? "metals"
      : isEnergies
      ? "energies"
      : isIndices
      ? "indices"
      : "futures";
    const sessionLabel = isMetals
      ? "Spot metals session"
      : isEnergies
      ? "Energy session"
      : isIndices
      ? "Index session"
      : "Primary futures session";
    const maintenanceLabel = isMetals
      ? "Spot metals maintenance window"
      : isEnergies
      ? "Energy maintenance window"
      : isIndices
      ? "Index maintenance window"
      : "Futures maintenance window";
    const weekendLabel = isMetals
      ? "Spot metals weekend closure"
      : isEnergies
      ? "Energy weekend closure"
      : isIndices
      ? "Index weekend closure"
      : "Futures weekend closure";
    const eastern = getZonedParts(now, "America/New_York");
    const minutes = eastern.hour * 60 + eastern.minute;
    const maintenanceBreak = eastern.weekday >= 1 && eastern.weekday <= 4 &&
      minutes >= 17 * 60 && minutes < 18 * 60;
    const fridayClose = eastern.weekday === 5 && minutes >= 16 * 60 + 30;
    const sundayPreopen = eastern.weekday === 7 && minutes < 18 * 60;

    if (maintenanceBreak) {
      return {
        block: true,
        label: maintenanceLabel,
        marketKind,
        penalty: 100,
        reason: "This market is in its daily maintenance window.",
      };
    }

    if (fridayClose || sundayPreopen || eastern.weekday === 6) {
      return {
        block: true,
        label: weekendLabel,
        marketKind,
        penalty: 100,
        reason: "This market is outside its active weekly session.",
      };
    }

    // Futures only (not metals/energies/indices): 12:00-18:00 UTC measured
    // negative on both walk-forward splits across 3+ years.
    if (marketKind === "futures" && isLowEdgeUtcWindow(now)) {
      return {
        block: true,
        label: "Futures low-edge window",
        marketKind,
        penalty: 100,
        reason:
          "Measured results for futures setups opened between 12:00 and 18:00 UTC were negative across 3+ years of replay, so LevelFlow does not open new futures setups in this window.",
      };
    }

    return {
      block: false,
      label: sessionLabel,
      marketKind,
      penalty: 0,
    };
  }

  const eastern = getZonedParts(now, "America/New_York");
  const london = getZonedParts(now, "Europe/London");
  const easternMinutes = eastern.hour * 60 + eastern.minute;
  const londonMinutes = london.hour * 60 + london.minute;
  const easternWeekday = eastern.weekday >= 1 && eastern.weekday <= 5;
  const londonWeekday = london.weekday >= 1 && london.weekday <= 5;
  const dailyRollover = eastern.weekday >= 1 && eastern.weekday <= 4 &&
    easternMinutes >= 16 * 60 + 59 && easternMinutes < 17 * 60 + 5;
  const londonNyOverlap = easternWeekday && londonWeekday &&
    easternMinutes >= 8 * 60 && easternMinutes < 12 * 60 &&
    londonMinutes >= 13 * 60 && londonMinutes < 17 * 60;
  const londonOpen = londonWeekday && londonMinutes >= 8 * 60 &&
    londonMinutes < 10 * 60;
  const lateSession = easternWeekday && easternMinutes >= 16 * 60 &&
    easternMinutes < 17 * 60;
  const fridayClose = eastern.weekday === 5 &&
    easternMinutes >= 16 * 60 + 30;
  const weekend = eastern.weekday === 6 ||
    (eastern.weekday === 7 && easternMinutes < 17 * 60 + 5);

  return {
    block: weekend || dailyRollover,
    label: weekend
      ? "FX weekend closure"
      : dailyRollover
      ? "FX rollover pause"
      : fridayClose
      ? "Late Friday FX session"
      : londonNyOverlap
      ? "London/New York overlap"
      : londonOpen
      ? "London open"
      : lateSession
      ? "Late-session risk"
      : "Normal session",
    marketKind: "forex",
    penalty: weekend || dailyRollover
      ? 100
      : fridayClose
      ? 10
      : lateSession
      ? 3
      : 0,
    reason: weekend
      ? "The FX market is outside its active weekly session."
      : dailyRollover
      ? "The FX market is in its daily rollover pause."
      : fridayClose
      ? "Late Friday liquidity conditions reduce setup quality."
      : lateSession
      ? "Late-session liquidity can reduce follow-through."
      : undefined,
  };
}

function isLowEdgeUtcWindow(now: Date) {
  const hour = now.getUTCHours();
  return hour >= 12 && hour < 18;
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "short",
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
    hour: Number(lookup.hour ?? 0),
    minute: Number(lookup.minute ?? 0),
    weekday: weekdayMap[lookup.weekday ?? "Mon"] ?? 1,
  };
}
