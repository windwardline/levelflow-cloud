// The construction soft gate (owner directive, 2026-07-30; opened at
// launch, 2026-08-01 — "go."). While up, signed-out visitors see the
// §17j parking view instead of sign-in; opening it is flipping this
// flag — nothing else changes, and the page it hides stays in the repo
// as the saved standard for the next pause. The quiet entry path below
// is a doormat, not a lock: with the gate open it is simply a no-op.
export const PARKING_GATE = false;

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
