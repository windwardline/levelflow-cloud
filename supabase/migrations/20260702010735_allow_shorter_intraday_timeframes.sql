alter table public.profiles
  drop constraint if exists profiles_default_timeframe_valid;

alter table public.profiles
  add constraint profiles_default_timeframe_valid
  check (default_timeframe in ('1min', '5min', '15min', '1hour', '4hour', '1day'));
