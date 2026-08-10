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

  // 1e (2026-08-09): agriculture — the grains — trades its OWN session, and
  // E8's hours table publishes it per row: 19:00-13:20 CT (20:00 ET open,
  // 14:20 ET close) for ZC/ZW/ZS/ZM/ZL, docs/research/e8-futures-dossier.md
  // §5.2. Before this branch existed, agriculture and livestock fell through
  // to the FX branch below and wore forex weekend hours — a corn setup could
  // open at 16:00 ET into a venue that closed at 14:20. ZO/ZR carry no
  // published row (watchlist-only) and adopt their grain siblings' session.
  if (assetType === "agriculture") {
    const eastern = getZonedParts(now, "America/New_York");
    const minutes = eastern.hour * 60 + eastern.minute;
    const open = 20 * 60;
    const close = 14 * 60 + 20;
    const closed = eastern.weekday === 6 ||
      (eastern.weekday === 5 && minutes >= close) ||
      (eastern.weekday === 7 && minutes < open) ||
      (eastern.weekday >= 1 && eastern.weekday <= 5 && minutes >= close &&
        minutes < open);
    if (closed) {
      return {
        block: true,
        label: "Grain session closure",
        marketKind: "agriculture",
        penalty: 100,
        reason: "This market is outside its published grain session.",
      };
    }
    return {
      block: false,
      label: "Grain session",
      marketKind: "agriculture",
      penalty: 0,
    };
  }

  if (
    assetType === "futures" || assetType === "metals" ||
    assetType === "energies" || assetType === "indices" ||
    assetType === "livestock"
  ) {
    const isMetals = assetType === "metals";
    const isEnergies = assetType === "energies";
    const isIndices = assetType === "indices";
    // 1e: livestock joins the complex branch E8's own hours table puts it on
    // (LE/HE rows, 17:00-16:00 CT) instead of falling through to FX hours.
    const isLivestock = assetType === "livestock";
    const marketKind = isMetals
      ? "metals"
      : isEnergies
      ? "energies"
      : isIndices
      ? "indices"
      : isLivestock
      ? "livestock"
      : "futures";
    const sessionLabel = isMetals
      ? "Spot metals session"
      : isEnergies
      ? "Energy session"
      : isIndices
      ? "Index session"
      : isLivestock
      ? "Livestock session"
      : "Primary futures session";
    const maintenanceLabel = isMetals
      ? "Spot metals maintenance window"
      : isEnergies
      ? "Energy maintenance window"
      : isIndices
      ? "Index maintenance window"
      : isLivestock
      ? "Livestock maintenance window"
      : "Futures maintenance window";
    const weekendLabel = isMetals
      ? "Spot metals weekend closure"
      : isEnergies
      ? "Energy weekend closure"
      : isIndices
      ? "Index weekend closure"
      : isLivestock
      ? "Livestock weekend closure"
      : "Futures weekend closure";
    const eastern = getZonedParts(now, "America/New_York");
    const minutes = eastern.hour * 60 + eastern.minute;
    const maintenanceBreak = eastern.weekday >= 1 && eastern.weekday <= 4 &&
      minutes >= 17 * 60 && minutes < 18 * 60;
    // 1e (2026-08-09): the hard close moved from 16:30 to 17:00 ET. E8's own
    // hours table closes the complex at 16:00 CT — 17:00 ET — and the 16:30
    // literal carried no recorded measurement; a half hour the venue trades
    // was being refused as if closed. The half hour keeps the thin-liquidity
    // PENALTY the FX branch's own late-Friday window earned, non-blocking.
    const fridayClose = eastern.weekday === 5 && minutes >= 17 * 60;
    const fridayThin = eastern.weekday === 5 && minutes >= 16 * 60 + 30 &&
      minutes < 17 * 60;
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

    if (fridayThin) {
      return {
        block: false,
        label: `Late Friday ${sessionLabel.toLowerCase()}`,
        marketKind,
        penalty: 10,
        reason: "Late Friday liquidity conditions reduce setup quality.",
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
  // The last half hour before the weekly close: thin, and measured as such, but
  // still tradeable — it keeps the penalty it earned.
  const fridayClose = eastern.weekday === 5 &&
    easternMinutes >= 16 * 60 + 30 && easternMinutes < 17 * 60;
  // I7: spot FX settles for the week at 17:00 ET Friday and reopens Sunday at
  // the same rollover minute the daily pause uses. Before this, `weekend` began
  // on Saturday, so Friday 17:00-24:00 ET generated setups on a closed market —
  // seven hours in which every other class hard-blocks from 16:30 ET, and in
  // which getSetupExpiryTime lands the review window inside the weekend, so
  // every one of those setups was deterministically unfilled. The client's
  // calendar has always closed forex here (src/lib/marketHours.ts); this is the
  // server agreeing with it.
  const weekend = eastern.weekday === 6 ||
    (eastern.weekday === 5 && easternMinutes >= 17 * 60) ||
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
