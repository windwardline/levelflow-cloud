-- agriculture and livestock have been silently unwritable since they were
-- onboarded on 2026-08-06.
--
-- 20260702012017 fixed these same two constraints to the six asset types the
-- engine had then. calibration.ts's AssetType union has carried EIGHT since the
-- agriculture and livestock classes were derived, and nothing connected the two
-- lists — so every telemetry write for those classes failed the CHECK.
--
-- Observed in production on 2026-08-27, in the analyzer's own logs:
--   new row for relation "market_data_health" violates check constraint
--     "market_data_health_asset_type_valid"  (LEUSX, livestock, ...)
--   new row for relation "analyzer_events" violates check constraint
--     "analyzer_events_asset_type_valid"     (ZSUSX, agriculture, ...)
--
-- It was SILENT because recordMarketDataHealth and recordAnalyzerEvent catch
-- and log rather than fail the scan — correct, since telemetry must never take
-- a review down, and exactly why nothing surfaced for three weeks. The cost is
-- that analyzer_events, which index.ts calls the one measurable read on the
-- through-market rate, has been missing two of eight classes entirely, and
-- market_data_health has no coverage record for either.
--
-- The lists are now pinned to calibration.ts's union by
-- tests/assetTypeConstraints.test.ts, which DERIVES the members from the type
-- rather than restating them — so the next class to be onboarded fails a test
-- here instead of failing a database write in production.
alter table public.market_data_health
  drop constraint if exists market_data_health_asset_type_check,
  drop constraint if exists market_data_health_asset_type_valid,
  add constraint market_data_health_asset_type_valid
    check (asset_type in ('agriculture', 'crypto', 'energies', 'forex', 'futures', 'indices', 'livestock', 'metals'));

alter table public.analyzer_events
  drop constraint if exists analyzer_events_asset_type_check,
  drop constraint if exists analyzer_events_asset_type_valid,
  add constraint analyzer_events_asset_type_valid
    check (asset_type is null or asset_type in ('agriculture', 'crypto', 'energies', 'forex', 'futures', 'indices', 'livestock', 'metals'));

-- profiles.market_focus carries the same six-value list from the same 2026-07-02
-- migration, plus its own 'multi_asset'. Widened in the same change set because
-- it is the same defect on the same population: a focus a reader could not pick
-- today, but one that fails the moment the Profile surface offers every class
-- the engine analyses.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'market_focus'
  ) then
    alter table public.profiles
      drop constraint if exists profiles_market_focus_valid,
      add constraint profiles_market_focus_valid
        check (market_focus in ('multi_asset', 'agriculture', 'crypto', 'energies', 'forex', 'futures', 'indices', 'livestock', 'metals'));
  end if;
end $$;
