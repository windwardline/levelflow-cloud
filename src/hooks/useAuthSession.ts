import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  browserSessionActive,
  clearBrowserSession,
  markBrowserSession,
} from "../lib/browserSession";

type AuthSessionState = {
  session: Session | null;
  loading: boolean;
};

type AuthClient = NonNullable<typeof supabase>;

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
        forgetStoredSession(client);
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
        forgetStoredSession(client);
        setSession(null);
      } else {
        clearBrowserSession();
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
  return authRedirectInProgress || browserSessionActive();
}

function markSession(session: Session | null) {
  if (session) {
    markBrowserSession();
  } else {
    clearBrowserSession();
  }
}

// A stored session with no live browser session behind it: the next person at the
// machine. It goes — and "local" is the scope that says so. The default "global"
// revokes the refresh token at GoTrue, which is how one unmarked tab used to sign
// the reader out of every tab AND every other device, with no reload able to
// recover it. Removing this browser's own copy is the whole of what the posture
// asks for. The app's Sign out buttons keep the default deliberately: a
// deliberate sign-out is meant to end every session the reader has.
function forgetStoredSession(client: AuthClient) {
  clearBrowserSession();
  void client.auth.signOut({ scope: "local" });
}
