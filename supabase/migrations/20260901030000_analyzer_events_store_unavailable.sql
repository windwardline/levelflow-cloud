-- The event that exists to make a silent fallback visible could not be written.
--
-- `marketLoader.ts` has emitted `status: "store_unavailable"` since the bar
-- store landed (#495, 2026-08-31). Its whole purpose is stated in
-- `barStore.ts`: a store failure falls back to a full provider fetch, and
-- "a silent fallback is a cost regression that looks exactly like working
-- software", so the outage rides out with the result and the caller records it.
--
-- The recorder's type never gained the value and neither did this constraint,
-- so every one of those inserts was rejected. The signal built to prevent a
-- silent regression was itself silently failing.
--
-- Nothing caught it. The Edge modules are excluded from `tsconfig.tests.json`
-- because they use Deno globals, so `npm run check` never sees them, and
-- ESLint does not flag an undefined identifier or a bad union member in them
-- either. `deno check` had been reporting it as TS2322 all along, and nothing
-- read that output until `tests/fmpBudgetByClass.test.ts` made it a gate.
alter table public.analyzer_events
  drop constraint if exists analyzer_events_status_check;

alter table public.analyzer_events
  add constraint analyzer_events_status_check
  check (
    status in (
      'blocked',
      'cache_hit',
      'error',
      'scan_failure',
      'slow_provider',
      -- The bar store could not be reached and the fetch ran unassisted.
      'store_unavailable',
      'success'
    )
  );
