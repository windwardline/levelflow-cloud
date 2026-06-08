import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthSessionState = {
  session: Session | null;
  loading: boolean;
};

const SESSION_MARKER_KEY = "levelflow-active-browser-session";

export function useAuthSession(): AuthSessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const client = supabase;
    let mounted = true;
    const authRedirectInProgress = hasAuthRedirectParams();

    client.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      if (data.session && !shouldKeepSession(authRedirectInProgress)) {
        window.sessionStorage.removeItem(SESSION_MARKER_KEY);
        void client.auth.signOut();
        setSession(null);
      } else {
        markSession(data.session);
        setSession(data.session);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession && (event !== "INITIAL_SESSION" || shouldKeepSession(authRedirectInProgress))) {
        markSession(nextSession);
        setSession(nextSession);
      } else if (nextSession && event === "INITIAL_SESSION") {
        window.sessionStorage.removeItem(SESSION_MARKER_KEY);
        void client.auth.signOut();
        setSession(null);
      } else {
        window.sessionStorage.removeItem(SESSION_MARKER_KEY);
        setSession(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

function hasAuthRedirectParams() {
  const search = window.location.search;
  const hash = window.location.hash;
  return search.includes("code=") || search.includes("token_hash=") || hash.includes("access_token=") || hash.includes("refresh_token=");
}

function shouldKeepSession(authRedirectInProgress: boolean) {
  return authRedirectInProgress || window.sessionStorage.getItem(SESSION_MARKER_KEY) === "true";
}

function markSession(session: Session | null) {
  if (session) {
    window.sessionStorage.setItem(SESSION_MARKER_KEY, "true");
  } else {
    window.sessionStorage.removeItem(SESSION_MARKER_KEY);
  }
}
