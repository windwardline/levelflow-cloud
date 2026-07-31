import { useCallback, useEffect, useState } from "react";
import { fetchTradeSetups, refreshTradeOutcomes, type TradeSetupRow } from "../lib/tradeAnalyzer";
import { supabase } from "../lib/supabase";

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

  return {
    error,
    loading,
    refreshSetups,
    setups,
  };
}
