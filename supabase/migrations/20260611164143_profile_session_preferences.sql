alter table public.profiles
  add column if not exists preferred_session text not null default 'any';

update public.profiles
set default_timezone = 'America/New_York'
where default_timezone is not null
  and default_timezone not in (
    'America/New_York',
    'America/Detroit',
    'America/Kentucky/Louisville',
    'America/Kentucky/Monticello',
    'America/Indiana/Indianapolis',
    'America/Indiana/Vincennes',
    'America/Indiana/Winamac',
    'America/Indiana/Marengo',
    'America/Indiana/Petersburg',
    'America/Indiana/Vevay',
    'America/Chicago',
    'America/Indiana/Tell_City',
    'America/Indiana/Knox',
    'America/Menominee',
    'America/North_Dakota/Center',
    'America/North_Dakota/New_Salem',
    'America/North_Dakota/Beulah',
    'America/Denver',
    'America/Boise',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'America/Juneau',
    'America/Sitka',
    'America/Metlakatla',
    'America/Yakutat',
    'America/Nome',
    'America/Adak',
    'Pacific/Honolulu',
    'America/Puerto_Rico',
    'Pacific/Guam',
    'Pacific/Saipan',
    'Pacific/Pago_Pago'
  );

alter table public.profiles
  drop constraint if exists profiles_default_timezone_us_valid,
  add constraint profiles_default_timezone_us_valid
    check (
      default_timezone is null or default_timezone in (
        'America/New_York',
        'America/Detroit',
        'America/Kentucky/Louisville',
        'America/Kentucky/Monticello',
        'America/Indiana/Indianapolis',
        'America/Indiana/Vincennes',
        'America/Indiana/Winamac',
        'America/Indiana/Marengo',
        'America/Indiana/Petersburg',
        'America/Indiana/Vevay',
        'America/Chicago',
        'America/Indiana/Tell_City',
        'America/Indiana/Knox',
        'America/Menominee',
        'America/North_Dakota/Center',
        'America/North_Dakota/New_Salem',
        'America/North_Dakota/Beulah',
        'America/Denver',
        'America/Boise',
        'America/Phoenix',
        'America/Los_Angeles',
        'America/Anchorage',
        'America/Juneau',
        'America/Sitka',
        'America/Metlakatla',
        'America/Yakutat',
        'America/Nome',
        'America/Adak',
        'Pacific/Honolulu',
        'America/Puerto_Rico',
        'Pacific/Guam',
        'Pacific/Saipan',
        'Pacific/Pago_Pago'
      )
    );

alter table public.profiles
  drop constraint if exists profiles_preferred_session_valid,
  add constraint profiles_preferred_session_valid
    check (preferred_session in ('any', 'asia', 'europe', 'north_america', 'australia'));

create index if not exists trade_setups_user_active_symbol_idx
  on public.trade_setups (user_id, symbol, status, created_at desc)
  where status in ('generated', 'placed');

create index if not exists pending_orders_user_active_symbol_idx
  on public.pending_orders (user_id, symbol, status, created_at desc)
  where status in ('generated', 'placed');
