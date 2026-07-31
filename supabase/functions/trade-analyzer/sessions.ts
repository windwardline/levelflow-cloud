import { getAssetType } from "./calibration.ts";

export type SessionContext = {
  block: boolean;
  label: string;
  // Marks measurement-only gates (hours blocked on replay evidence, not
  // market closures). The sweep's --ignore-low-edge flag sees through
  // these to re-measure the hours; hard closures are never bypassed.
  lowEdge?: boolean;
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
    // 12:00-18:00 UTC: r4 (1,200d) measured these hours negative; r22 at
    // full depth measured them positive but dilutive — ungating adds +33%
    // volume at train +0.002 / test -0.008, failing the both-splits bar.
    // The gate stays as a net-quality filter.
    if (isLowEdgeUtcWindow(now)) {
      return {
        block: true,
        label: "Crypto low-edge window",
        lowEdge: true,
        marketKind: "crypto",
        penalty: 100,
        reason:
          "Measured results for crypto setups opened between 12:00 and 18:00 UTC run well below every other hour across the full replay history, so Levelflow does not open new crypto setups in this window.",
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

    // Energies: six UTC hours measured negative on both walk-forward splits
    // at full history (r15 per-hour curves; excluding them lifts both
    // splits from ~0.04R to ~0.08R per accepted setup).
    if (
      marketKind === "energies" &&
      ENERGIES_LOW_EDGE_UTC_HOURS.has(now.getUTCHours())
    ) {
      return {
        block: true,
        label: "Energy low-edge hour",
        lowEdge: true,
        marketKind,
        penalty: 100,
        reason:
          "Measured results for energy setups opened in this hour were negative across every replay split, so Levelflow does not open new setups here right now.",
      };
    }

    // Futures and cash indices: 12:00-18:00 UTC is the weakest stretch of
    // the day (indices: full history, round 12; futures: r22 full-depth
    // re-measurement — removing the gate costs -0.022 train / -0.027 test,
    // with hours 16-17 negative on the test split).
    if (
      (marketKind === "futures" || marketKind === "indices") &&
      isLowEdgeUtcWindow(now)
    ) {
      const kindLabel = marketKind === "futures" ? "Futures" : "Index";
      return {
        block: true,
        label: `${kindLabel} low-edge window`,
        lowEdge: true,
        marketKind,
        penalty: 100,
        reason:
          `Measured results for ${marketKind === "futures" ? "futures" : "index"} setups opened between 12:00 and 18:00 UTC are the weakest stretch of the day across the full replay history, so Levelflow does not open new setups here in this window.`,
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

// r15 per-hour curves, full history: the energy hours negative on both
// walk-forward splits. Scattered rather than one window — the arbiter was
// the split agreement, not shape.
const ENERGIES_LOW_EDGE_UTC_HOURS = new Set([3, 4, 12, 15, 19, 21]);

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
