import { useCallback, useEffect, useState } from "react";
import { fetchTradeSetups, refreshTradeOutcomes, type TradeSetupRow } from "../lib/tradeAnalyzer";
import { supabase } from "../lib/supabase";

// Module scope on purpose: the Desk, Insights and the trades rail all mount and
// unmount this hook, and the throttle exists so re-navigation does not re-run a
// provider-heavy refresh. It therefore outlives any one session, which is why
// the auth listener below clears it on sign-out.
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
          // M6: stamped on success only. The stamp used to sit in a `finally`,
          // so a refresh that threw bought itself a full 60-second blackout —
          // the outcome that most needs a prompt retry got the longest wait.
          lastOutcomeRefreshAt = Date.now();
        } catch (error) {
          console.warn("[history] outcome refresh failed; history may lag", error);
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
        // M6: the throttle is module scope, so it outlives the session that set
        // it. Without this, signing out and back in — as the same person or
        // another — could leave the first load of the new session inside a
        // blackout the old one opened.
        lastOutcomeRefreshAt = 0;
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
