import { useCallback, useEffect, useMemo, useState } from "react";
import { getSecurityOption } from "../lib/symbolMap";
import { normalizeSetupOutcome } from "../lib/outcomes";
import { fetchTradeSetups, refreshTradeOutcomes, type TradeSetupRow } from "../lib/tradeAnalyzer";
import { supabase } from "../lib/supabase";

export type SecurityStat = {
  ambiguous: number;
  averageConfidence: number;
  category: string;
  count: number;
  losses: number;
  pending: number;
  resolved: number;
  symbol: string;
  unfilled: number;
  winRate: number | null;
  wins: number;
};

export type CategoryStat = Omit<SecurityStat, "symbol"> & {
  category: string;
};

export type OutcomeSummary = {
  ambiguous: number;
  losses: number;
  pending: number;
  resolved: number;
  total: number;
  unfilled: number;
  winRate: number | null;
  wins: number;
};

let lastOutcomeRefreshAt = 0;
const OUTCOME_REFRESH_INTERVAL_MS = 60_000;
type RefreshSetupsOptions = {
  forceOutcomeRefresh?: boolean;
  refreshOutcomes?: boolean;
  silent?: boolean;
};

export function useTradeSetups() {
  const [setups, setSetups] = useState<TradeSetupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshSetups = useCallback(async (options?: RefreshSetupsOptions) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError("");

    try {
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setSetups([]);
          return;
        }
      }

      const shouldRefreshOutcomes =
        options?.forceOutcomeRefresh === true || (options?.refreshOutcomes === true && Date.now() - lastOutcomeRefreshAt > OUTCOME_REFRESH_INTERVAL_MS);
      if (shouldRefreshOutcomes) {
        try {
          await refreshTradeOutcomes();
        } catch (error) {
          console.warn("[history] outcome refresh failed; history may lag", error);
        } finally {
          lastOutcomeRefreshAt = Date.now();
        }
      }
      setSetups(await fetchTradeSetups());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Trade setup history could not be loaded.");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refreshSetups({ refreshOutcomes: true });
  }, [refreshSetups]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        refreshSetups({ refreshOutcomes: true });
      } else {
        setSetups([]);
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshSetups]);

  useEffect(() => {
    if (!supabase) {
      return;
    }
    const client = supabase;

    let channel: ReturnType<typeof client.channel> | null = null;
    let cancelled = false;

    async function subscribe() {
      const {
        data: { user },
      } = await client.auth.getUser();

      if (!user || cancelled) {
        return;
      }

      channel = client
        .channel(`level-flow-setups-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", filter: `user_id=eq.${user.id}`, schema: "public", table: "trade_setups" },
          () => {
            refreshSetups({ silent: true });
          },
        )
        .on(
          "postgres_changes",
          { event: "*", filter: `user_id=eq.${user.id}`, schema: "public", table: "trade_outcomes" },
          () => {
            refreshSetups({ silent: true });
          },
        )
        .subscribe();
    }

    subscribe();

    return () => {
      cancelled = true;
      if (channel) {
        client.removeChannel(channel);
      }
    };
  }, [refreshSetups]);

  const stats = useMemo(() => buildStats(setups), [setups]);

  return {
    categoryStats: stats.categoryStats,
    error,
    loading,
    outcomeSummary: stats.summary,
    refreshSetups,
    setups,
    stats: stats.securityStats,
  };
}

function buildStats(setups: TradeSetupRow[]) {
  const bySymbol = new Map<string, SecurityStat>();
  const byCategory = new Map<string, CategoryStat>();
  const summary: OutcomeSummary = {
    ambiguous: 0,
    losses: 0,
    pending: 0,
    resolved: 0,
    total: 0,
    unfilled: 0,
    winRate: null,
    wins: 0,
  };

  for (const setup of setups) {
    const category = getSecurityOption(setup.symbol).assetType;
    const current =
      bySymbol.get(setup.symbol) ??
      ({
        averageConfidence: 0,
        ambiguous: 0,
        category,
        count: 0,
        losses: 0,
        pending: 0,
        resolved: 0,
        symbol: setup.symbol,
        unfilled: 0,
        winRate: null,
        wins: 0,
      } satisfies SecurityStat);
    const categoryStat =
      byCategory.get(category) ??
      ({
        averageConfidence: 0,
        ambiguous: 0,
        category,
        count: 0,
        losses: 0,
        pending: 0,
        resolved: 0,
        unfilled: 0,
        winRate: null,
        wins: 0,
      } satisfies CategoryStat);
    const outcome = normalizeSetupOutcome(setup);

    current.count += 1;
    current.averageConfidence += Number(setup.confidence_score);
    categoryStat.count += 1;
    categoryStat.averageConfidence += Number(setup.confidence_score);
    summary.total += 1;

    // Ladder accounting: a win is any money-positive resolution (full
    // target, banked TP1, or profitable expiry); a loss is any
    // money-negative one. Anything else would misreport the ladder model.
    if (
      outcome === "target_reached" || outcome === "partial_target" ||
      outcome === "expired_in_profit"
    ) {
      current.wins += 1;
      categoryStat.wins += 1;
      summary.wins += 1;
    } else if (outcome === "stopped_out" || outcome === "expired_in_loss") {
      current.losses += 1;
      categoryStat.losses += 1;
      summary.losses += 1;
    } else if (outcome === "entry_not_filled") {
      current.unfilled += 1;
      categoryStat.unfilled += 1;
      summary.unfilled += 1;
    } else if (outcome === "unclear_path") {
      current.ambiguous += 1;
      categoryStat.ambiguous += 1;
      summary.ambiguous += 1;
    } else {
      current.pending += 1;
      categoryStat.pending += 1;
      summary.pending += 1;
    }

    bySymbol.set(setup.symbol, current);
    byCategory.set(category, categoryStat);
  }

  const securityStats = Array.from(bySymbol.values()).map(finalizeStat).sort(sortStats);
  const categoryStats = Array.from(byCategory.values()).map(finalizeStat).sort(sortStats);
  summary.resolved = summary.wins + summary.losses;
  summary.winRate = summary.resolved > 0 ? Math.round((summary.wins / summary.resolved) * 100) : null;

  return {
    categoryStats,
    securityStats,
    summary,
  };
}

function finalizeStat<T extends SecurityStat | CategoryStat>(stat: T): T {
  const resolved = stat.wins + stat.losses;
  return {
    ...stat,
    averageConfidence: stat.count > 0 ? Math.round(stat.averageConfidence / stat.count) : 0,
    resolved,
    winRate: resolved > 0 ? Math.round((stat.wins / resolved) * 100) : null,
  };
}

function sortStats(first: SecurityStat | CategoryStat, second: SecurityStat | CategoryStat) {
  return second.count - first.count || second.averageConfidence - first.averageConfidence;
}
