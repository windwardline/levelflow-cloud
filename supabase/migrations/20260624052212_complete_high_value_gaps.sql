-- Complete the high-value backend gaps:
-- - persist market-data health snapshots for every reviewed symbol
-- - capture structured analyzer/provider events for operations review
-- - consolidate legacy pending order persistence into trade_setups

do $$
begin
  create type public.setup_status as enum ('generated', 'placed', 'filled', 'invalidated', 'cancelled', 'expired');
exception when duplicate_object then null;
end $$;

create table if not exists public.market_data_health (
  symbol text primary key,
  asset_type text not null check (asset_type in ('crypto', 'forex', 'futures', 'metals')),
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
  asset_type text check (asset_type is null or asset_type in ('crypto', 'forex', 'futures', 'metals')),
  provider_symbol text,
  cache_hit boolean not null default false,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists set_market_data_health_updated_at on public.market_data_health;
create trigger set_market_data_health_updated_at
  before update on public.market_data_health
  for each row execute function private.set_updated_at();

create index if not exists market_data_health_status_idx
  on public.market_data_health (status, last_checked_at desc);
create index if not exists analyzer_events_action_status_idx
  on public.analyzer_events (action, status, created_at desc);
create index if not exists analyzer_events_symbol_idx
  on public.analyzer_events (symbol, created_at desc);

alter table public.market_data_health enable row level security;
alter table public.analyzer_events enable row level security;

revoke all on public.analyzer_events from anon, authenticated;
revoke all on public.market_data_health from anon;
grant select on public.market_data_health to authenticated;
grant select, insert, update, delete on public.analyzer_events, public.market_data_health to service_role;

drop policy if exists "market data health readable by authenticated users" on public.market_data_health;
create policy "market data health readable by authenticated users"
on public.market_data_health
for select
to authenticated
using (true);

do $$
begin
  if to_regclass('public.trade_setups') is not null then
    alter table public.trade_setups
      drop constraint if exists trade_setups_pending_order_id_fkey;

    alter table public.trade_setups
      drop column if exists pending_order_id;
  end if;
end $$;

drop table if exists public.pending_orders cascade;

do $$
begin
  if to_regclass('public.trade_setups') is not null then
    drop index if exists public.trade_setups_user_active_symbol_idx;

    alter table public.trade_setups
      alter column status drop default;

    alter table public.trade_setups
      alter column status type public.setup_status
      using status::text::public.setup_status;

    alter table public.trade_setups
      alter column status set default 'generated'::public.setup_status;
  end if;
end $$;

create index if not exists trade_setups_user_active_symbol_idx
  on public.trade_setups (user_id, symbol, status, created_at desc)
  where status in ('generated', 'placed');

drop type if exists public.pending_order_status;

alter table public.market_data_health replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'market_data_health'
    ) then
      alter publication supabase_realtime add table public.market_data_health;
    end if;
  end if;
end $$;
