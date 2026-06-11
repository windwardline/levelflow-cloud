-- LevelFlow Cloud Supabase bootstrap.
-- Run in a new Supabase project before using the app.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

do $$
begin
  create type public.e8_program_code as enum ('e8_one', 'e8_signature', 'e8_pro');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.drawdown_mode as enum ('dynamic_intraday', 'dynamic_eod', 'static');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.account_status as enum ('evaluation', 'funded', 'paused', 'breached', 'archived');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.account_stage as enum ('evaluation', 'phase_1', 'phase_2', 'funded', 'paused', 'breached');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.order_side as enum ('buy', 'sell');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.pending_order_status as enum ('generated', 'placed', 'filled', 'invalidated', 'cancelled', 'expired');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.trade_outcome_status as enum ('pending', 'unfilled', 'take_profit', 'stop_loss', 'breakeven', 'manual_close', 'expired');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  default_timezone text,
  market_focus text not null default 'multi_asset',
  experience_level text not null default 'intermediate',
  default_timeframe text not null default '1hour',
  theme_preference text not null default 'system',
  preferred_session text not null default 'any',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_default_timezone_us_valid check (
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
  ),
  constraint profiles_market_focus_valid check (market_focus in ('multi_asset', 'forex', 'metals', 'crypto', 'futures')),
  constraint profiles_experience_level_valid check (experience_level in ('newer', 'intermediate', 'advanced')),
  constraint profiles_default_timeframe_valid check (default_timeframe in ('15min', '1hour', '4hour', '1day')),
  constraint profiles_theme_preference_valid check (theme_preference in ('light', 'dark', 'system')),
  constraint profiles_preferred_session_valid check (preferred_session in ('any', 'asia', 'europe', 'north_america', 'australia'))
);

create table if not exists public.e8_programs (
  program_code public.e8_program_code primary key,
  display_name text not null,
  description text not null,
  provider text not null default 'E8 Markets',
  broker text not null default 'TradeLocker',
  leverage_ratio text not null default '1:30',
  raw_spreads_enabled boolean not null default true,
  no_commissions_enabled boolean not null default false,
  no_commissions_selectable boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.e8_account_sizes (
  id text primary key,
  program_code public.e8_program_code not null references public.e8_programs(program_code),
  display_name text not null,
  balance numeric(12,2) not null check (balance > 0),
  ruleset_code text not null,
  ruleset_label text not null,
  drawdown_mode public.drawdown_mode not null,
  dynamic_drawdown_pct numeric(5,2),
  static_drawdown_pct numeric(5,2),
  daily_drawdown_pct numeric(5,2) not null check (daily_drawdown_pct >= 0),
  daily_loss_auto_pause_pct numeric(5,2),
  daily_profit_cap_pct numeric(5,2),
  profit_target_pct numeric(5,2) not null check (profit_target_pct > 0),
  payout_options smallint[] not null,
  default_payout_pct smallint not null,
  phase_two_required boolean not null default false,
  news_blackout_enforced boolean not null default true,
  leverage_ratio text not null default '1:30',
  raw_spreads_enabled boolean not null default true,
  no_commissions_enabled boolean not null default false,
  no_commissions_selectable boolean not null default false,
  created_at timestamptz not null default now(),
  constraint e8_account_sizes_unique_config unique (program_code, balance, ruleset_code),
  constraint e8_account_sizes_payout_valid check (default_payout_pct = any(payout_options)),
  constraint e8_account_sizes_one_drawdown_type check (
    (drawdown_mode = 'static' and static_drawdown_pct is not null and dynamic_drawdown_pct is null)
    or (drawdown_mode in ('dynamic_intraday', 'dynamic_eod') and dynamic_drawdown_pct is not null and static_drawdown_pct is null)
  )
);

create table if not exists public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_size_id text not null references public.e8_account_sizes(id),
  program_code public.e8_program_code not null,
  account_name text not null,
  tradelocker_account_id text,
  payout_pct smallint not null,
  status public.account_status not null default 'evaluation',
  stage public.account_stage not null default 'evaluation',
  initial_balance numeric(12,2) not null check (initial_balance > 0),
  current_balance numeric(12,2) not null,
  current_equity numeric(12,2) not null,
  daily_drawdown_used numeric(12,2) not null default 0,
  daily_drawdown_limit numeric(12,2) not null default 0,
  max_drawdown_limit numeric(12,2) not null default 0,
  daily_profit numeric(12,2) not null default 0,
  raw_spreads_enabled boolean not null default true,
  no_commissions_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.account_day_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.user_accounts(id) on delete cascade,
  trading_day date not null,
  realized_pnl numeric(12,2) not null default 0,
  open_pnl numeric(12,2) not null default 0,
  daily_drawdown_used numeric(12,2) not null default 0,
  daily_profit_pct numeric(6,3) not null default 0,
  auto_pause_triggered boolean not null default false,
  rollover_protection_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_day_metrics_unique_day unique (account_id, trading_day)
);

create table if not exists public.pending_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.user_accounts(id) on delete cascade,
  symbol text not null,
  massive_symbol text not null,
  side public.order_side not null,
  order_type text not null default 'limit',
  entry_price numeric(18,8) not null check (entry_price > 0),
  stop_loss numeric(18,8) not null check (stop_loss > 0),
  take_profit numeric(18,8) not null check (take_profit > 0),
  lot_size numeric(18,4) not null check (lot_size > 0),
  confidence_score smallint not null check (confidence_score between 0 and 100),
  status public.pending_order_status not null default 'generated',
  invalidation_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pending_orders_limit_only check (order_type = 'limit')
);

create table if not exists public.trade_setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.user_accounts(id) on delete cascade,
  pending_order_id uuid references public.pending_orders(id) on delete set null,
  symbol text not null,
  massive_symbol text not null,
  side public.order_side not null,
  limit_entry numeric(18,8) not null check (limit_entry > 0),
  stop_loss numeric(18,8) not null check (stop_loss > 0),
  take_profit numeric(18,8) not null check (take_profit > 0),
  breakeven_trigger_price numeric(18,8) not null check (breakeven_trigger_price > 0),
  confidence_score smallint not null check (confidence_score between 0 and 100),
  confluence jsonb not null default '{}'::jsonb,
  risk_model jsonb not null default '{}'::jsonb,
  news_context jsonb not null default '{}'::jsonb,
  correlation_group text,
  status public.pending_order_status not null default 'generated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.user_accounts(id) on delete cascade,
  setup_id uuid not null references public.trade_setups(id) on delete cascade,
  reviewed_at timestamptz,
  filled_at timestamptz,
  exit_at timestamptz,
  outcome public.trade_outcome_status not null default 'pending',
  realized_pnl numeric(12,2),
  max_favorable_excursion numeric(12,2),
  max_adverse_excursion numeric(12,2),
  feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_outcomes_one_per_setup unique (setup_id)
);

create table if not exists public.strategy_weightings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  setup_key text not null,
  total_setups integer not null default 0 check (total_setups >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  confidence_adjustment numeric(6,3) not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint strategy_weightings_unique_user_setup unique (user_id, setup_key)
);

create table if not exists public.economic_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  country text,
  currency text not null,
  event_name text not null,
  impact text not null check (impact in ('low', 'medium', 'high')),
  scheduled_at timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint economic_events_unique_provider_event unique (provider, external_id)
);

create table if not exists public.system_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  account_id uuid references public.user_accounts(id) on delete cascade,
  notice_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text not null,
  active_from timestamptz not null default now(),
  active_until timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.e8_programs (
  program_code,
  display_name,
  description
) values
  ('e8_one', 'E8 One', 'Configurable dynamic drawdown, daily drawdown, profit target, and 80/90/100 payout selection.'),
  ('e8_signature', 'E8 Signature', 'Signature accounts with fixed 2% daily auto-pause, 80% payout, and EOD dynamic drawdown constraints.'),
  ('e8_pro', 'E8 Pro', 'One-step challenge with static drawdown, daily drawdown, daily profit cap, and direct funded transition.')
on conflict (program_code) do update set
  display_name = excluded.display_name,
  description = excluded.description;

update public.e8_programs
set
  raw_spreads_enabled = true,
  no_commissions_enabled = true,
  no_commissions_selectable = true;

insert into public.e8_account_sizes (
  id,
  program_code,
  display_name,
  balance,
  ruleset_code,
  ruleset_label,
  drawdown_mode,
  dynamic_drawdown_pct,
  static_drawdown_pct,
  daily_drawdown_pct,
  daily_loss_auto_pause_pct,
  daily_profit_cap_pct,
  profit_target_pct,
  payout_options,
  default_payout_pct,
  phase_two_required,
  news_blackout_enforced
)
select
  'e8-one-' || (b.balance::integer)::text || '-' || r.ruleset_code,
  'e8_one'::public.e8_program_code,
  '$' || trim(to_char(b.balance, 'FM999G999G999')) || ' - ' || r.ruleset_label,
  b.balance,
  r.ruleset_code,
  r.ruleset_label,
  'dynamic_intraday'::public.drawdown_mode,
  r.dynamic_drawdown_pct,
  null,
  r.daily_drawdown_pct,
  null,
  null,
  r.profit_target_pct,
  array[80, 90, 100]::smallint[],
  80,
  false,
  true
from (
  values
    (5000::numeric),
    (10000::numeric),
    (25000::numeric),
    (50000::numeric),
    (100000::numeric),
    (200000::numeric),
    (400000::numeric),
    (500000::numeric)
) as b(balance)
cross join (
  values
    ('dd4-daily3-target6', '4% Dynamic DD / 3% Daily DD / 6% Target', 4::numeric, 3::numeric, 6::numeric),
    ('dd6-daily4-target9', '6% Dynamic DD / 4% Daily DD / 9% Target', 6::numeric, 4::numeric, 9::numeric),
    ('dd8-daily53-target12', '8% Dynamic DD / 5.3% Daily DD / 12% Target', 8::numeric, 5.3::numeric, 12::numeric),
    ('dd10-daily66-target16', '10% Dynamic DD / 6.6% Daily DD / 16% Target', 10::numeric, 6.6::numeric, 16::numeric),
    ('dd14-daily92-target21', '14% Dynamic DD / 9.2% Daily DD / 21% Target', 14::numeric, 9.2::numeric, 21::numeric)
) as r(ruleset_code, ruleset_label, dynamic_drawdown_pct, daily_drawdown_pct, profit_target_pct)
on conflict (id) do update set
  display_name = excluded.display_name,
  dynamic_drawdown_pct = excluded.dynamic_drawdown_pct,
  daily_drawdown_pct = excluded.daily_drawdown_pct,
  profit_target_pct = excluded.profit_target_pct,
  payout_options = excluded.payout_options,
  default_payout_pct = excluded.default_payout_pct;

update public.e8_account_sizes
set
  raw_spreads_enabled = true,
  no_commissions_enabled = true,
  no_commissions_selectable = true,
  phase_two_required = false;

insert into public.e8_account_sizes (
  id,
  program_code,
  display_name,
  balance,
  ruleset_code,
  ruleset_label,
  drawdown_mode,
  dynamic_drawdown_pct,
  static_drawdown_pct,
  daily_drawdown_pct,
  daily_loss_auto_pause_pct,
  daily_profit_cap_pct,
  profit_target_pct,
  payout_options,
  default_payout_pct,
  phase_two_required,
  news_blackout_enforced
) values
  ('e8-signature-25000', 'e8_signature', '$25,000 - 4% EOD Dynamic DD / 6% Target', 25000, 'signature-dd4-target6', '4% EOD Dynamic DD / 2% Auto-Pause / 6% Target', 'dynamic_eod', 4, null, 2, 2, null, 6, array[80]::smallint[], 80, false, false),
  ('e8-signature-50000', 'e8_signature', '$50,000 - 4% EOD Dynamic DD / 6% Target', 50000, 'signature-dd4-target6', '4% EOD Dynamic DD / 2% Auto-Pause / 6% Target', 'dynamic_eod', 4, null, 2, 2, null, 6, array[80]::smallint[], 80, false, false),
  ('e8-signature-100000', 'e8_signature', '$100,000 - 3% EOD Dynamic DD / 6% Target', 100000, 'signature-dd3-target6', '3% EOD Dynamic DD / 2% Auto-Pause / 6% Target', 'dynamic_eod', 3, null, 2, 2, null, 6, array[80]::smallint[], 80, false, false),
  ('e8-signature-150000', 'e8_signature', '$150,000 - 3% EOD Dynamic DD / 6% Target', 150000, 'signature-dd3-target6', '3% EOD Dynamic DD / 2% Auto-Pause / 6% Target', 'dynamic_eod', 3, null, 2, 2, null, 6, array[80]::smallint[], 80, false, false)
on conflict (id) do update set
  display_name = excluded.display_name,
  dynamic_drawdown_pct = excluded.dynamic_drawdown_pct,
  daily_drawdown_pct = excluded.daily_drawdown_pct,
  daily_loss_auto_pause_pct = excluded.daily_loss_auto_pause_pct,
  profit_target_pct = excluded.profit_target_pct,
  payout_options = excluded.payout_options,
  default_payout_pct = excluded.default_payout_pct;

insert into public.e8_account_sizes (
  id,
  program_code,
  display_name,
  balance,
  ruleset_code,
  ruleset_label,
  drawdown_mode,
  dynamic_drawdown_pct,
  static_drawdown_pct,
  daily_drawdown_pct,
  daily_loss_auto_pause_pct,
  daily_profit_cap_pct,
  profit_target_pct,
  payout_options,
  default_payout_pct,
  phase_two_required,
  news_blackout_enforced
)
select
  'e8-pro-' || (balance::integer)::text,
  'e8_pro'::public.e8_program_code,
  '$' || trim(to_char(balance, 'FM999G999G999')) || ' - 8% Static DD / 8% Target',
  balance,
  'pro-static8-daily25-cap2-target8',
  '8% Static DD / 2.5% Daily DD / 2% Daily Profit Cap / 8% Target',
  'static'::public.drawdown_mode,
  null,
  8,
  2.5,
  null,
  2,
  8,
  array[80]::smallint[],
  80,
  false,
  true
from (
  values
    (5000::numeric),
    (10000::numeric),
    (25000::numeric),
    (50000::numeric),
    (100000::numeric),
    (200000::numeric)
) as p(balance)
on conflict (id) do update set
  display_name = excluded.display_name,
  static_drawdown_pct = excluded.static_drawdown_pct,
  daily_drawdown_pct = excluded.daily_drawdown_pct,
  daily_profit_cap_pct = excluded.daily_profit_cap_pct,
  profit_target_pct = excluded.profit_target_pct,
  payout_options = excluded.payout_options,
  default_payout_pct = excluded.default_payout_pct;

update public.e8_account_sizes
set
  raw_spreads_enabled = true,
  no_commissions_enabled = true,
  no_commissions_selectable = true,
  phase_two_required = false;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    updated_at = now();

  return new;
end;
$$;

create or replace function private.validate_user_account_config()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cfg public.e8_account_sizes%rowtype;
begin
  select *
  into cfg
  from public.e8_account_sizes
  where id = new.account_size_id;

  if not found then
    raise exception 'Unknown E8 account_size_id: %', new.account_size_id;
  end if;

  if new.program_code is null then
    new.program_code = cfg.program_code;
  end if;

  if new.program_code <> cfg.program_code then
    raise exception 'Program code % does not match account size %', new.program_code, new.account_size_id;
  end if;

  if new.initial_balance is null then
    new.initial_balance = cfg.balance;
  end if;

  if new.initial_balance <> cfg.balance then
    raise exception 'Initial balance % does not match configured account balance %', new.initial_balance, cfg.balance;
  end if;

  if new.current_balance is null then
    new.current_balance = new.initial_balance;
  end if;

  if new.current_equity is null then
    new.current_equity = new.current_balance;
  end if;

  if new.payout_pct is null then
    new.payout_pct = cfg.default_payout_pct;
  end if;

  if not (new.payout_pct = any(cfg.payout_options)) then
    raise exception 'Payout % is not available for account size %', new.payout_pct, new.account_size_id;
  end if;

  if new.current_balance <= 0 or new.current_equity <= 0 then
    raise exception 'Current balance and current equity must be greater than zero';
  end if;

  new.no_commissions_enabled = coalesce(new.no_commissions_enabled, false);
  if new.no_commissions_enabled and not cfg.no_commissions_selectable then
    raise exception 'No Commissions is not available for account size %', new.account_size_id;
  end if;

  new.raw_spreads_enabled = not new.no_commissions_enabled;

  if new.stage in ('phase_1'::public.account_stage, 'phase_2'::public.account_stage) then
    new.stage = 'evaluation'::public.account_stage;
  end if;

  new.daily_drawdown_limit = round(new.initial_balance * (cfg.daily_drawdown_pct / 100), 2);
  new.max_drawdown_limit = round(new.initial_balance * (coalesce(cfg.static_drawdown_pct, cfg.dynamic_drawdown_pct) / 100), 2);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

drop trigger if exists validate_user_account_config on public.user_accounts;
create trigger validate_user_account_config
  before insert or update on public.user_accounts
  for each row execute function private.validate_user_account_config();

drop trigger if exists set_user_accounts_updated_at on public.user_accounts;
create trigger set_user_accounts_updated_at
  before update on public.user_accounts
  for each row execute function private.set_updated_at();

drop trigger if exists set_account_day_metrics_updated_at on public.account_day_metrics;
create trigger set_account_day_metrics_updated_at
  before update on public.account_day_metrics
  for each row execute function private.set_updated_at();

drop trigger if exists set_pending_orders_updated_at on public.pending_orders;
create trigger set_pending_orders_updated_at
  before update on public.pending_orders
  for each row execute function private.set_updated_at();

drop trigger if exists set_trade_setups_updated_at on public.trade_setups;
create trigger set_trade_setups_updated_at
  before update on public.trade_setups
  for each row execute function private.set_updated_at();

drop trigger if exists set_trade_outcomes_updated_at on public.trade_outcomes;
create trigger set_trade_outcomes_updated_at
  before update on public.trade_outcomes
  for each row execute function private.set_updated_at();

drop trigger if exists set_strategy_weightings_updated_at on public.strategy_weightings;
create trigger set_strategy_weightings_updated_at
  before update on public.strategy_weightings
  for each row execute function private.set_updated_at();

drop trigger if exists set_economic_events_updated_at on public.economic_events;
create trigger set_economic_events_updated_at
  before update on public.economic_events
  for each row execute function private.set_updated_at();

drop trigger if exists set_system_notices_updated_at on public.system_notices;
create trigger set_system_notices_updated_at
  before update on public.system_notices
  for each row execute function private.set_updated_at();

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists e8_account_sizes_program_idx on public.e8_account_sizes (program_code);
create index if not exists user_accounts_user_id_idx on public.user_accounts (user_id);
create index if not exists account_day_metrics_user_id_idx on public.account_day_metrics (user_id);
create index if not exists account_day_metrics_account_day_idx on public.account_day_metrics (account_id, trading_day desc);
create index if not exists pending_orders_user_status_idx on public.pending_orders (user_id, status);
create index if not exists trade_setups_user_created_idx on public.trade_setups (user_id, created_at desc);
create index if not exists trade_setups_user_symbol_created_idx on public.trade_setups (user_id, symbol, created_at desc);
create index if not exists pending_orders_user_symbol_created_idx on public.pending_orders (user_id, symbol, created_at desc);
create index if not exists trade_setups_user_active_symbol_idx
  on public.trade_setups (user_id, symbol, status, created_at desc)
  where status in ('generated', 'placed');
create index if not exists pending_orders_user_active_symbol_idx
  on public.pending_orders (user_id, symbol, status, created_at desc)
  where status in ('generated', 'placed');
create index if not exists trade_outcomes_user_outcome_idx on public.trade_outcomes (user_id, outcome);
create index if not exists strategy_weightings_user_idx on public.strategy_weightings (user_id);
create index if not exists economic_events_scheduled_impact_idx on public.economic_events (scheduled_at, impact);
create index if not exists system_notices_user_active_idx on public.system_notices (user_id, active_from, active_until);

alter table public.profiles enable row level security;
alter table public.e8_programs enable row level security;
alter table public.e8_account_sizes enable row level security;
alter table public.user_accounts enable row level security;
alter table public.account_day_metrics enable row level security;
alter table public.pending_orders enable row level security;
alter table public.trade_setups enable row level security;
alter table public.trade_outcomes enable row level security;
alter table public.strategy_weightings enable row level security;
alter table public.economic_events enable row level security;
alter table public.system_notices enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.e8_programs, public.e8_account_sizes to anon, authenticated;
grant select on public.economic_events to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.user_accounts,
  public.account_day_metrics,
  public.pending_orders,
  public.trade_setups,
  public.trade_outcomes,
  public.strategy_weightings,
  public.system_notices
to authenticated;

drop policy if exists "e8 programs are readable" on public.e8_programs;
create policy "e8 programs are readable"
on public.e8_programs
for select
to anon, authenticated
using (true);

drop policy if exists "e8 account sizes are readable" on public.e8_account_sizes;
create policy "e8 account sizes are readable"
on public.e8_account_sizes
for select
to anon, authenticated
using (true);

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "profiles delete own" on public.profiles;
create policy "profiles delete own"
on public.profiles
for delete
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "economic events readable by authenticated users" on public.economic_events;
create policy "economic events readable by authenticated users"
on public.economic_events
for select
to authenticated
using (true);

drop policy if exists "system notices select own or global" on public.system_notices;
create policy "system notices select own or global"
on public.system_notices
for select
to authenticated
using (user_id is null or (select auth.uid()) = user_id);

drop policy if exists "system notices insert own" on public.system_notices;
create policy "system notices insert own"
on public.system_notices
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "system notices update own" on public.system_notices;
create policy "system notices update own"
on public.system_notices
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "system notices delete own" on public.system_notices;
create policy "system notices delete own"
on public.system_notices
for delete
to authenticated
using ((select auth.uid()) = user_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_accounts',
    'account_day_metrics',
    'pending_orders',
    'trade_setups',
    'trade_outcomes',
    'strategy_weightings'
  ]
  loop
    execute format('drop policy if exists "%s select own" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s select own" on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s insert own" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s insert own" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s update own" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s update own" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );

    execute format('drop policy if exists "%s delete own" on public.%I', table_name, table_name);
    execute format(
      'create policy "%s delete own" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      table_name,
      table_name
    );
  end loop;
end $$;

alter table public.user_accounts replica identity full;
alter table public.account_day_metrics replica identity full;
alter table public.pending_orders replica identity full;
alter table public.trade_setups replica identity full;
alter table public.trade_outcomes replica identity full;
alter table public.strategy_weightings replica identity full;
alter table public.system_notices replica identity full;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'user_accounts',
      'account_day_metrics',
      'pending_orders',
      'trade_setups',
      'trade_outcomes',
      'strategy_weightings',
      'system_notices'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
