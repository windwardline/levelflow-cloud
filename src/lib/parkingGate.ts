// The construction soft gate (owner directive, 2026-07-30; opened at
// launch, 2026-08-01 — "go."; RE-PARKED 2026-08-07 on the owner's word).
// While up, signed-out visitors see the §17j parking view instead of
// sign-in; opening it is flipping this flag — nothing else changes, and
// the page it hides stays in the repo as the saved standard, which is
// what made this re-park a one-line change. The quiet entry path below
// is a doormat, not a lock: with the gate open it is simply a no-op.
//
// The gate governs SIGNED-OUT visitors only — App consults it inside the
// `!session` branch, so a live session walks straight past it. Raising it
// closes the desk only in company with invalidating those sessions, which
// is why the re-park ran the launch runbook's logout step alongside this
// flag rather than after it.
export const PARKING_GATE = true;

const ENTER_KEY = "levelflow-enter";

// ?enter on any load unlocks sign-in for this browser session.
export function parkingBypassActive(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (new URLSearchParams(window.location.search).has("enter")) {
    window.sessionStorage.setItem(ENTER_KEY, "1");
    return true;
  }
  return window.sessionStorage.getItem(ENTER_KEY) === "1";
}
