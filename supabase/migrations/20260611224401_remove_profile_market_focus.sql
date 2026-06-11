alter table public.profiles
  drop constraint if exists profiles_market_focus_valid,
  drop column if exists market_focus;
