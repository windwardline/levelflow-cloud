// The construction soft gate (owner directive, 2026-07-30). While the
// engine-and-visual rebuild lands, signed-out visitors see the parking
// view instead of sign-in. Un-parking is flipping this flag to false —
// nothing else changes. The quiet entry path is a doormat, not a lock:
// it only reveals the sign-in screen, where magic-link auth remains the
// real gate.
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
