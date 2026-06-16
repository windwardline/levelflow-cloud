do $$
begin
  alter type public.trade_outcome_status add value if not exists 'ambiguous';
exception when undefined_object then
  create type public.trade_outcome_status as enum ('pending', 'unfilled', 'take_profit', 'stop_loss', 'breakeven', 'manual_close', 'expired', 'ambiguous');
end $$;

alter table public.trade_setups
  add column if not exists analyzer_version text;

update public.trade_setups
set analyzer_version = 'legacy.pre-2026-06-16'
where analyzer_version is null;

alter table public.trade_setups
  alter column analyzer_version set default '2026.06.16.global-learning',
  alter column analyzer_version set not null;

alter table public.trade_outcomes
  add column if not exists analyzer_version text;

update public.trade_outcomes
set analyzer_version = 'legacy.pre-2026-06-16'
where analyzer_version is null;

alter table public.trade_outcomes
  alter column analyzer_version set default '2026.06.16.global-learning',
  alter column analyzer_version set not null;

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

alter table public.strategy_weightings_global enable row level security;

grant select on public.strategy_weightings_global to authenticated;

drop policy if exists "global strategy weightings readable by authenticated users" on public.strategy_weightings_global;
create policy "global strategy weightings readable by authenticated users"
on public.strategy_weightings_global
for select
to authenticated
using (true);

drop trigger if exists set_strategy_weightings_global_updated_at on public.strategy_weightings_global;
create trigger set_strategy_weightings_global_updated_at
  before update on public.strategy_weightings_global
  for each row execute function private.set_updated_at();

create index if not exists trade_setups_analyzer_version_idx on public.trade_setups (analyzer_version, created_at desc);
create index if not exists trade_outcomes_analyzer_version_idx on public.trade_outcomes (analyzer_version, reviewed_at desc);
create index if not exists strategy_weightings_global_version_idx on public.strategy_weightings_global (analyzer_version, total_setups desc);
