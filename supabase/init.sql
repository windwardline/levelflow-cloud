-- Levelflow Cloud Supabase bootstrap.
-- Run this in a new Supabase project, then apply the migrations in
-- supabase/migrations before deploying Edge Functions.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

do $$
begin
  create type public.order_side as enum ('buy', 'sell');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.setup_status as enum ('generated', 'placed', 'filled', 'invalidated', 'cancelled', 'expired');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.trade_outcome_status as enum ('pending', 'unfilled', 'take_profit', 'tp1_partial', 'stop_loss', 'breakeven', 'manual_close', 'expired', 'expired_in_profit', 'expired_at_loss', 'ambiguous');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  default_timezone text,
  default_timeframe text not null default '1hour',
  theme_preference text not null default 'system',
  preferred_session text not null default 'any',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_default_timezone_us_valid check (
    default_timezone is null or default_timezone in (
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Phoenix',
      'America/Los_Angeles',
      'America/Anchorage',
      'America/Adak',
      'Pacific/Honolulu',
      'America/Puerto_Rico',
      'Pacific/Pago_Pago',
      'Pacific/Guam'
    )
  ),
  constraint profiles_default_timeframe_valid check (default_timeframe in ('1min', '5min', '15min', '1hour', '4hour', '1day')),
  constraint profiles_theme_preference_valid check (theme_preference in ('light', 'dark', 'system')),
  constraint profiles_preferred_session_valid check (preferred_session in ('any', 'asia', 'europe', 'north_america', 'australia'))
);

create table if not exists public.trade_setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  provider_symbol text not null,
  side public.order_side not null,
  limit_entry numeric(18,8) not null check (limit_entry > 0),
  stop_loss numeric(18,8) not null check (stop_loss > 0),
  take_profit numeric(18,8) not null check (take_profit > 0),
  take_profit_1 numeric(18,8) check (take_profit_1 is null or take_profit_1 > 0),
  breakeven_trigger_price numeric(18,8) not null check (breakeven_trigger_price > 0),
  confidence_score smallint not null check (confidence_score between 0 and 100),
  analyzer_version text not null default '2026.06.16.global-learning',
  confluence jsonb not null default '{}'::jsonb,
  risk_model jsonb not null default '{}'::jsonb,
  news_context jsonb not null default '{}'::jsonb,
  correlation_group text,
  status public.setup_status not null default 'generated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  setup_id uuid not null references public.trade_setups(id) on delete cascade,
  analyzer_version text not null default '2026.06.16.global-learning',
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

create table if not exists public.strategy_weightings_global (
  setup_key text primary key,
  analyzer_version text not null default '2026.06.16.global-learning',
  total_setups integer not null default 0 check (total_setups >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  ambiguous integer not null default 0 check (ambiguous >= 0),
  confidence_adjustment numeric(6,3) not null default 0,
  sample_weight numeric(6,3) not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.economic_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_id text not null,
  country text,
  currency text not null,
  symbol text,
  event_type text not null default 'scheduled' check (event_type in ('scheduled', 'earnings', 'headline')),
  event_name text not null,
  impact text not null check (impact in ('low', 'medium', 'high')),
  scheduled_at timestamptz not null,
  url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint economic_events_unique_provider_event unique (provider, external_id)
);

create table if not exists public.system_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
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

create table if not exists public.analyzer_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('generate_setup', 'refresh_outcomes', 'scan_opportunities')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action, window_start)
);

create table if not exists public.market_data_health (
  symbol text primary key,
  asset_type text not null check (asset_type in ('crypto', 'energies', 'forex', 'futures', 'indices', 'metals')),
  provider_symbol text,
  status text not null check (status in ('ready', 'limited', 'unavailable')),
  latest_bar_at timestamptz,
  daily_bars integer not null default 0 check (daily_bars >= 0),
  intraday_bars integer not null default 0 check (intraday_bars >= 0),
  available_timeframes text[] not null default '{}'::text[],
  provider_warnings jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analyzer_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  status text not null check (status in ('blocked', 'cache_hit', 'error', 'scan_failure', 'slow_provider', 'success')),
  symbol text,
  asset_type text check (asset_type is null or asset_type in ('crypto', 'energies', 'forex', 'futures', 'indices', 'metals')),
  provider_symbol text,
  cache_hit boolean not null default false,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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

create or replace function public.claim_analyzer_request(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  request_count integer,
  limit_count integer,
  reset_at timestamptz
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_action text := coalesce(nullif(p_action, ''), 'generate_setup');
  v_limit integer := greatest(coalesce(p_limit, 1), 1);
  v_window_seconds integer := greatest(coalesce(p_window_seconds, 60), 10);
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(coalesce(p_window_seconds, 60), 10)) * greatest(coalesce(p_window_seconds, 60), 10));
  v_request_count integer;
begin
  if v_action not in ('generate_setup', 'refresh_outcomes', 'scan_opportunities') then
    raise exception 'Unsupported analyzer action: %', v_action;
  end if;

  delete from public.analyzer_rate_limits
  where updated_at < now() - interval '1 day';

  insert into public.analyzer_rate_limits (user_id, action, window_start, request_count, updated_at)
  values (p_user_id, v_action, v_window_start, 1, now())
  on conflict (user_id, action, window_start)
  do update set
    request_count = public.analyzer_rate_limits.request_count + 1,
    updated_at = now()
  returning public.analyzer_rate_limits.request_count
  into v_request_count;

  return query
  select
    v_request_count <= v_limit,
    v_request_count,
    v_limit,
    v_window_start + make_interval(secs => v_window_seconds);
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

drop trigger if exists set_trade_setups_updated_at on public.trade_setups;
create trigger set_trade_setups_updated_at
  before update on public.trade_setups
  for each row execute function private.set_updated_at();

drop trigger if exists set_trade_outcomes_updated_at on public.trade_outcomes;
create trigger set_trade_outcomes_updated_at
  before update on public.trade_outcomes
  for each row execute function private.set_updated_at();

drop trigger if exists set_strategy_weightings_global_updated_at on public.strategy_weightings_global;
create trigger set_strategy_weightings_global_updated_at
  before update on public.strategy_weightings_global
  for each row execute function private.set_updated_at();

drop trigger if exists set_economic_events_updated_at on public.economic_events;
create trigger set_economic_events_updated_at
  before update on public.economic_events
  for each row execute function private.set_updated_at();

drop trigger if exists set_system_notices_updated_at on public.system_notices;
create trigger set_system_notices_updated_at
  before update on public.system_notices
  for each row execute function private.set_updated_at();

drop trigger if exists set_market_data_health_updated_at on public.market_data_health;
create trigger set_market_data_health_updated_at
  before update on public.market_data_health
  for each row execute function private.set_updated_at();

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists trade_setups_user_created_idx on public.trade_setups (user_id, created_at desc);
create index if not exists trade_setups_user_symbol_created_idx on public.trade_setups (user_id, symbol, created_at desc);
create index if not exists trade_setups_user_active_symbol_idx
  on public.trade_setups (user_id, symbol, status, created_at desc)
  where status in ('generated', 'placed');
create index if not exists trade_setups_analyzer_version_idx on public.trade_setups (analyzer_version, created_at desc);
create index if not exists trade_outcomes_user_outcome_idx on public.trade_outcomes (user_id, outcome);
create index if not exists trade_outcomes_analyzer_version_idx on public.trade_outcomes (analyzer_version, reviewed_at desc);
create index if not exists strategy_weightings_global_version_idx on public.strategy_weightings_global (analyzer_version, total_setups desc);
create index if not exists economic_events_scheduled_impact_idx on public.economic_events (scheduled_at, impact);
create index if not exists economic_events_symbol_scheduled_idx on public.economic_events (symbol, scheduled_at desc, impact);
create index if not exists analyzer_rate_limits_updated_idx on public.analyzer_rate_limits (updated_at desc);
create index if not exists system_notices_user_active_idx on public.system_notices (user_id, active_from, active_until);
create index if not exists market_data_health_status_idx on public.market_data_health (status, last_checked_at desc);
create index if not exists analyzer_events_action_status_idx on public.analyzer_events (action, status, created_at desc);
create index if not exists analyzer_events_symbol_idx on public.analyzer_events (symbol, created_at desc);
create index if not exists analyzer_events_user_id_idx on public.analyzer_events (user_id);

alter table public.profiles enable row level security;
alter table public.trade_setups enable row level security;
alter table public.trade_outcomes enable row level security;
alter table public.strategy_weightings_global enable row level security;
alter table public.economic_events enable row level security;
alter table public.system_notices enable row level security;
alter table public.analyzer_rate_limits enable row level security;
alter table public.market_data_health enable row level security;
alter table public.analyzer_events enable row level security;

revoke all on public.analyzer_rate_limits from anon, authenticated;
revoke all on public.analyzer_events from anon, authenticated;
revoke all on function public.claim_analyzer_request(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_analyzer_request(uuid, text, integer, integer) to service_role;

grant usage on schema public to anon, authenticated;
grant select on public.economic_events, public.market_data_health, public.strategy_weightings_global to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.trade_setups,
  public.trade_outcomes,
  public.system_notices
to authenticated;
grant select, insert, update, delete on public.analyzer_events, public.market_data_health to service_role;

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

drop policy if exists "global strategy weightings readable by authenticated users" on public.strategy_weightings_global;
create policy "global strategy weightings readable by authenticated users"
on public.strategy_weightings_global
for select
to authenticated
using (true);

drop policy if exists "market data health readable by authenticated users" on public.market_data_health;
create policy "market data health readable by authenticated users"
on public.market_data_health
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
    'trade_setups',
    'trade_outcomes'
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

alter table public.trade_setups replica identity full;
alter table public.trade_outcomes replica identity full;
alter table public.system_notices replica identity full;
alter table public.market_data_health replica identity full;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'trade_setups',
      'trade_outcomes',
      'market_data_health',
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
