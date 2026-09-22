// The Edge half of parking the desk (2026-09-16).
//
// `src/lib/parkingGate.ts`'s PARKING_GATE turns away SIGNED-OUT arrivals in
// the browser and cannot do more: a live session walks past it, and `?enter`
// is a doormat. While this is true, every Edge request of consumer class
// `user` — a chart, a scan, an outcome refresh — is refused before a provider
// byte is bought (trade-analyzer/fmpBudget.ts). Background work (the calendar
// sync, outcome-sync) is NOT parked here: §21i binds no coupling between the
// parking gate and the scheduled crons, and it runs under its own fail-closed
// ceiling.
//
// INVARIANT: DESK_PARKED implies PARKING_GATE (tests/deskParking.test.ts).
//   Park:   raise PARKING_GATE first, or both in one commit, then §17p's
//           logout. Never this line first.
//   Unpark: lower THIS line alone; deploy.yml deploys the functions and runs
//           the full E2E against the live Edge; lower PARKING_GATE only after
//           that run is green.
//
// Pure and import-free: the Edge functions, the tests and the deploy's scope
// script all read it.
export const DESK_PARKED = true;
