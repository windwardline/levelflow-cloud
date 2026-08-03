import { useCallback, useEffect, useState } from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import {
  fetchLifetimeSetups,
  fetchTradeSetups,
  type LifetimeSetupRow,
  refreshTradeOutcomes,
  type TradeSetupRow,
} from "../lib/tradeAnalyzer";
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
  // The lifetime record (spec §18, amendment 2), read beside the ledger's
  // display window rather than derived from it: the window carries full rows
  // because reopening one restores the Advisor stage, and the lifetime read
  // carries only the fields the record band and Attribution aggregate over.
  // Both are set from one refresh, so the header can never describe a different
  // account than the table under it.
  const [lifetimeSetups, setLifetimeSetups] = useState<LifetimeSetupRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Q2-C2: one bit, not the provider's message. This used to be an `error` string
  // no consumer read, so a failed fetch reached Insights and the trades rail as
  // `setups: []` and printed "No setups have been logged yet." / "No current
  // trades." — a claim about the account from surfaces that had just failed to
  // read it. What they need is whether the read succeeded; the words are
  // HISTORY_LOAD_FAILED_COPY's job, the same split MarketScanResponse.failed
  // already makes for the scan path.
  const [loadFailed, setLoadFailed] = useState(false);

  const refreshSetups = useCallback(async (options?: RefreshSetupsOptions) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setLoadFailed(false);

    try {
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setSetups([]);
          setLifetimeSetups([]);
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
      // Both reads or neither: a lifetime aggregate computed while the window
      // read failed — or a window rendered beside a stale lifetime header — is
      // two accounts on one surface. Either failure lands in the one catch
      // below, which is also why there is no second failure word to write.
      const [windowRows, lifetimeRows] = await Promise.all([
        fetchTradeSetups(),
        fetchLifetimeSetups(),
      ]);
      setSetups(windowRows);
      setLifetimeSetups(lifetimeRows);
    } catch (requestError) {
      // Loud where it is useful, quiet where it is not: the operator gets the
      // real cause, the reader gets one sentence. The rows are deliberately left
      // untouched here — a failed read keeps whatever was last read successfully
      // rather than replacing it with an empty account.
      console.warn("[history] trade setups could not be loaded", requestError);
      setLoadFailed(true);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refreshSetups({ refreshOutcomes: true });
  }, [refreshSetups]);

  // The realtime subscription below is the only thing that notices a row change
  // after mount, and it delivers nothing that happened while its socket was
  // down. Supabase's reconnect re-subscribes but does not replay: @supabase/
  // phoenix's `rejoin()` calls `joinPush.resend()`, which re-sends the channel's
  // original join payload — for postgres_changes just {event, schema, table,
  // filter}, with no cursor and no `since` — so the server starts streaming from
  // the moment of the rejoin. (realtime-js does have a `replay: { since }`
  // option, but only for broadcast on private channels; RealtimeChannel throws
  // if a public channel asks for it.) A laptop closed overnight therefore comes
  // back to a rail still rendering a trade that stopped out hours ago, because
  // the resubscribe never re-read the table. Only a read closes that gap, which
  // is what the two wake paths below do.
  //
  // Silent, so the rail and the ledger re-read under the reader instead of
  // flashing their loading state over rows that are already on screen. And
  // refreshOutcomes rather than forceOutcomeRefresh: the table read is the part
  // that closes the gap and it runs either way, while the provider-heavy outcome
  // refresh stays behind OUTCOME_REFRESH_INTERVAL_MS so returning to the tab
  // cannot drive it once per trip. The force path stays App.tsx's, where spec §8
  // spends it deliberately on a tab the reader just opened.
  const readAfterGap = useCallback(() => {
    refreshSetups({ refreshOutcomes: true, silent: true });
  }, [refreshSetups]);

  // Wake path one, and the one that matters to the reader: the tab coming back
  // is both the moment a gap may have closed behind us and the moment stale rows
  // become visible. It fires immediately, long before the socket itself notices
  // it died — the heartbeat interval is 25s and the reconnect ladder adds
  // 1s–10s on top — so leaving this to the rejoin would leave a resolved trade
  // reading as live for the first half-minute the reader is looking at it.
  // Guarded to the became-visible transition: 'hidden' fires the same event, and
  // reading on the way out serves nobody.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        readAfterGap();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [readAfterGap]);

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
        setLifetimeSetups([]);
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
    let resubscribed = false;

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
        // Wake path two, covering what visibility cannot: a network change while
        // the tab is in the foreground reconnects with no visibilitychange to
        // hear, and even after a real wake the read above is taken while the
        // socket is still down, so anything landing between it and a live
        // subscription would be missed as well. This read is the first one taken
        // with the subscription actually up. Only a RE-subscribe implies a gap —
        // the first SUBSCRIBED is the mount effect's own read, already in
        // flight — and phoenix keeps its `receive` hooks across a rejoin
        // (Push.reset clears the ref and the response, not recHooks), which is
        // what makes this fire again at all.
        .subscribe((status, err) => {
          // The quietest failure this hook has: a subscription that fails is not
          // a read that fails. The rows on screen stay correct, they just stop
          // changing — an RLS policy change, an expired token, a channel-limit
          // rejection — and neither the rail nor the ledger has anything to say
          // about it, so without this the operator's first clue is a reader
          // asking why a resolved trade still looks live. The wake paths above
          // and the manual refresh still read the table, which is why this is a
          // warning about degradation rather than an error about breakage.
          //
          // `err` goes in whole, never flattened to its message string:
          // realtime-js builds it as `new Error(message, { cause: error })`, so
          // the reason the server actually gave lives in `cause` — its own
          // subscribe() docblock says to log the full error for exactly this
          // reason. The status rides along because TIMED_OUT arrives with no
          // `err` at all.
          //
          // Named affirmatively rather than as "not SUBSCRIBED" so that CLOSED
          // stays out: removeChannel in this effect's cleanup reports CLOSED on
          // every deliberate teardown, and a warning there would cry failure at
          // a clean shutdown.
          if (
            status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
            status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
          ) {
            console.warn(
              "[history] realtime subscription failed; rows update only on wake or refresh",
              status,
              err,
            );
          }
          if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            return;
          }
          if (resubscribed) {
            readAfterGap();
          }
          resubscribed = true;
        });
    }

    subscribe();

    return () => {
      cancelled = true;
      if (channel) {
        client.removeChannel(channel);
      }
    };
  }, [readAfterGap, refreshSetups]);

  return {
    lifetimeSetups,
    loadFailed,
    loading,
    refreshSetups,
    setups,
  };
}
