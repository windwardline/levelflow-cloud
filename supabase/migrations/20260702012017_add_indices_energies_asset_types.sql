alter table public.market_data_health
  drop constraint if exists market_data_health_asset_type_check,
  drop constraint if exists market_data_health_asset_type_valid,
  add constraint market_data_health_asset_type_valid
    check (asset_type in ('crypto', 'energies', 'forex', 'futures', 'indices', 'metals'));

alter table public.analyzer_events
  drop constraint if exists analyzer_events_asset_type_check,
  drop constraint if exists analyzer_events_asset_type_valid,
  add constraint analyzer_events_asset_type_valid
    check (asset_type is null or asset_type in ('crypto', 'energies', 'forex', 'futures', 'indices', 'metals'));

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
        check (market_focus in ('multi_asset', 'crypto', 'energies', 'forex', 'futures', 'indices', 'metals'));
  end if;
end $$;
