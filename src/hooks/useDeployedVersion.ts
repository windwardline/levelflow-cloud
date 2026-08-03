import { useEffect, useRef, useState } from "react";
import {
  bundleChanged,
  readDeployedBundleId,
  runningBundleId,
} from "../lib/deployedVersion";

/**
 * Whether a deploy has landed under this tab.
 *
 * Two checks, and never a third: one when the shell arrives, and one for each
 * wake — the two moments a tab can have been left behind (src/lib/
 * deployedVersion.ts carries the mechanism and the 2026-08-03 incident that
 * asked for it). No interval and no polling: a tab that is looking at the app is
 * either current or one reload from current, and neither answer improves by being
 * asked again every minute.
 *
 * Sticky. Once a mismatch is found the answer stands until the reader reloads, so
 * `answered` closes the check for good — a later fetch could only confirm what is
 * already on screen, and a flicker on a slow network would be the notice
 * appearing and vanishing under the reader's finger.
 *
 * Gated rather than unconditional, which is the adjudication this hook records:
 * the notice belongs to the authed shell. The sign-in screen is short-lived and a
 * stale one still signs in — the session it creates is the new bundle's problem,
 * not its own — so while `enabled` is false this hook listens to nothing and
 * fetches nothing.
 */
export function useDeployedVersion(enabled: boolean): boolean {
  const [deployMoved, setDeployMoved] = useState(false);
  // Two ways to fetch more than twice, and one ref each. `checking` is a read in
  // flight: a wake during a slow read must not start a second one. `answered` is
  // the mismatch already found. Refs rather than state because neither is
  // rendered, and a re-render for either would be a re-render for nothing.
  const checking = useRef(false);
  const answered = useRef(false);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      return;
    }

    let cancelled = false;

    async function check() {
      if (answered.current || checking.current) {
        return;
      }
      checking.current = true;
      try {
        const deployed = await readDeployedBundleId();
        if (cancelled || !bundleChanged(runningBundleId(), deployed)) {
          return;
        }
        answered.current = true;
        setDeployMoved(true);
      } finally {
        checking.current = false;
      }
    }

    void check();

    // The wake path, guarded to the transition IN exactly as useTradeSetups'
    // listener is: 'hidden' fires the same event, and a tab on its way out has
    // nothing to be told.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void check();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return deployMoved;
}
