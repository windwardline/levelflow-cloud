import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTradeSetups, type TradeSetupRow } from "../lib/tradeAnalyzer";
import { supabase } from "../lib/supabase";

export type SecurityStat = {
  averageConfidence: number;
  count: number;
  losses: number;
  pending: number;
  symbol: string;
  wins: number;
};

export function useTradeSetups() {
  const [setups, setSetups] = useState<TradeSetupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshSetups = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setSetups(await fetchTradeSetups());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Trade setup history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSetups();
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
            refreshSetups();
          },
        )
        .on(
          "postgres_changes",
          { event: "*", filter: `user_id=eq.${user.id}`, schema: "public", table: "trade_outcomes" },
          () => {
            refreshSetups();
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
    error,
    loading,
    refreshSetups,
    setups,
    stats,
  };
}

function buildStats(setups: TradeSetupRow[]): SecurityStat[] {
  const bySymbol = new Map<string, SecurityStat>();

  for (const setup of setups) {
    const current =
      bySymbol.get(setup.symbol) ??
      ({
        averageConfidence: 0,
        count: 0,
        losses: 0,
        pending: 0,
        symbol: setup.symbol,
        wins: 0,
      } satisfies SecurityStat);
    const outcome = setup.trade_outcomes?.[0]?.outcome ?? "pending";

    current.count += 1;
    current.averageConfidence += Number(setup.confidence_score);

    if (outcome === "take_profit") {
      current.wins += 1;
    } else if (outcome === "stop_loss") {
      current.losses += 1;
    } else {
      current.pending += 1;
    }

    bySymbol.set(setup.symbol, current);
  }

  return Array.from(bySymbol.values())
    .map((stat) => ({
      ...stat,
      averageConfidence: stat.count > 0 ? Math.round(stat.averageConfidence / stat.count) : 0,
    }))
    .sort((first, second) => second.count - first.count || second.averageConfidence - first.averageConfidence);
}
