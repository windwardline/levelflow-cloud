alter table public.pending_orders
  alter column account_id drop not null;

alter table public.trade_setups
  alter column account_id drop not null;

alter table public.trade_outcomes
  alter column account_id drop not null;

alter table public.profiles
  add column if not exists market_focus text not null default 'multi_asset',
  add column if not exists experience_level text not null default 'intermediate',
  add column if not exists default_timeframe text not null default '1hour',
  add column if not exists theme_preference text not null default 'system';

alter table public.profiles
  drop constraint if exists profiles_market_focus_valid,
  add constraint profiles_market_focus_valid
    check (market_focus in ('multi_asset', 'forex', 'metals', 'crypto', 'futures'));

alter table public.profiles
  drop constraint if exists profiles_experience_level_valid,
  add constraint profiles_experience_level_valid
    check (experience_level in ('newer', 'intermediate', 'advanced'));

alter table public.profiles
  drop constraint if exists profiles_default_timeframe_valid,
  add constraint profiles_default_timeframe_valid
    check (default_timeframe in ('15min', '1hour', '4hour', '1day'));

alter table public.profiles
  drop constraint if exists profiles_theme_preference_valid,
  add constraint profiles_theme_preference_valid
    check (theme_preference in ('light', 'dark', 'system'));

create index if not exists trade_setups_user_symbol_created_idx
  on public.trade_setups (user_id, symbol, created_at desc);

create index if not exists pending_orders_user_symbol_created_idx
  on public.pending_orders (user_id, symbol, created_at desc);
