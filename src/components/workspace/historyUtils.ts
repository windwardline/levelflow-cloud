import {
  CONFIDENCE_TIERS,
  formatConfidenceTierRange,
} from "../../lib/confidenceTiers";
import {
  normalizeSetupOutcome,
  OUTCOME_COPY,
  type SetupOutcome,
} from "../../lib/outcomes";
import {
  compareAssetCategories,
  compareAssetSymbols,
  formatSecurityLabel,
  getSecurityOption,
  type SecurityType,
} from "../../lib/symbolMap";
import type { TradeSetupRow } from "../../lib/tradeAnalyzer";

export type HistoryGroupBy = "date" | "category" | "asset" | "status";
export type HistorySort = "newest" | "oldest" | "confidence" | "asset";
export type HistoryStatusFilter = "all" | SetupOutcome;

export type HistorySetupGroup = {
  items: TradeSetupRow[];
  key: string;
  label: string;
};

export const ALL_HISTORY_FILTER = "all";
export const HISTORY_STATUS_ORDER: SetupOutcome[] = [
  "still_tracking",
  "target_reached",
  "stopped_out",
  "unclear_path",
  "entry_not_filled",
];

export function sortHistorySetups(
  setups: TradeSetupRow[],
  sortBy: HistorySort,
) {
  return [...setups].sort((first, second) => {
    const firstDate = new Date(first.created_at).getTime();
    const secondDate = new Date(second.created_at).getTime();

    if (sortBy === "oldest") {
      return firstDate - secondDate;
    }
    if (sortBy === "confidence") {
      return (
        Number(second.confidence_score) - Number(first.confidence_score) ||
        secondDate - firstDate
      );
    }
    if (sortBy === "asset") {
      return (
        compareAssetSymbols(first.symbol, second.symbol) ||
        secondDate - firstDate
      );
    }
    return secondDate - firstDate;
  });
}

export function groupHistorySetups(
  setups: TradeSetupRow[],
  groupBy: HistoryGroupBy,
): HistorySetupGroup[] {
  const groups = new Map<string, HistorySetupGroup>();

  setups.forEach((setup) => {
    const group = getHistoryGroup(setup, groupBy);
    const existingGroup = groups.get(group.key);
    if (existingGroup) {
      existingGroup.items.push(setup);
      return;
    }
    groups.set(group.key, { ...group, items: [setup] });
  });

  const orderedGroups = Array.from(groups.values());
  if (groupBy === "asset") {
    return orderedGroups.sort((first, second) =>
      compareAssetSymbols(first.key, second.key)
    );
  }
  if (groupBy === "category") {
    return orderedGroups.sort((first, second) =>
      compareAssetCategories(
        first.key as SecurityType,
        second.key as SecurityType,
      )
    );
  }
  if (groupBy === "status") {
    return orderedGroups.sort(
      (first, second) =>
        HISTORY_STATUS_ORDER.indexOf(first.key as SetupOutcome) -
        HISTORY_STATUS_ORDER.indexOf(second.key as SetupOutcome),
    );
  }
  return orderedGroups;
}

export function buildConfidenceBands(setups: TradeSetupRow[]) {
  const bands = CONFIDENCE_TIERS.map((tier) => ({
    ambiguous: 0,
    count: 0,
    label: tier.label,
    losses: 0,
    max: tier.max,
    min: tier.min,
    range: formatConfidenceTierRange(tier),
    wins: 0,
  }));

  for (const setup of setups) {
    const score = Number(setup.confidence_score);
    const band = bands.find(
      (candidate) => score >= candidate.min && score <= candidate.max,
    );
    if (!band) {
      continue;
    }
    const outcome = getSetupOutcome(setup);
    band.count += 1;
    if (outcome === "target_reached") {
      band.wins += 1;
    } else if (outcome === "stopped_out") {
      band.losses += 1;
    } else if (outcome === "unclear_path") {
      band.ambiguous += 1;
    }
  }

  return bands.map((band) => {
    const resolved = band.wins + band.losses;
    return {
      ambiguous: band.ambiguous,
      count: band.count,
      label: band.label,
      range: band.range,
      resolved,
      winRate: resolved > 0 ? Math.round((band.wins / resolved) * 100) : null,
    };
  });
}

export function getSetupOutcome(setup: TradeSetupRow): SetupOutcome {
  return normalizeSetupOutcome(setup);
}

export function getOutcomeLabel(outcome: SetupOutcome) {
  return OUTCOME_COPY[outcome].label;
}

export function getOutcomeClassName(outcome: SetupOutcome) {
  if (outcome === "target_reached") {
    return "bg-bullish/10 text-bullish";
  }
  if (outcome === "stopped_out") {
    return "bg-danger/10 text-danger";
  }
  if (outcome === "entry_not_filled") {
    return "bg-warning/15 text-warning";
  }
  if (outcome === "unclear_path") {
    return "bg-slate/10 text-slate";
  }
  return "bg-navy/10 text-navy";
}

export function formatPriceValue(
  value: number | string | null | undefined,
) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? formatNumber(numericValue) : "Pending";
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatPayoff(value: number | null) {
  return value === null ? "Pending" : `${value.toFixed(2)}x payoff`;
}

export function formatHistoryDateGroup(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();

  if (dateStart === todayStart) {
    return "Today";
  }
  if (dateStart === todayStart - 86_400_000) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatDisplayName(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function getHistoryGroup(
  setup: TradeSetupRow,
  groupBy: HistoryGroupBy,
): Omit<HistorySetupGroup, "items"> {
  if (groupBy === "asset") {
    return { key: setup.symbol, label: formatSecurityLabel(setup.symbol) };
  }
  if (groupBy === "category") {
    const category = getSecurityOption(setup.symbol).assetType;
    return { key: category, label: category };
  }
  if (groupBy === "status") {
    const outcome = getSetupOutcome(setup);
    return { key: outcome, label: getOutcomeLabel(outcome) };
  }

  const date = new Date(setup.created_at);
  const key = Number.isNaN(date.getTime())
    ? "unknown-date"
    : date.toISOString().slice(0, 10);
  return { key, label: formatHistoryDateGroup(date) };
}

function formatNumber(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 5,
  });
}
