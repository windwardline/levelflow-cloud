-- Harden analyzer access and remove retired account-tracking surfaces.

create table if not exists public.analyzer_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('generate_setup', 'refresh_outcomes', 'scan_opportunities')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, action, window_start)
);

alter table public.analyzer_rate_limits enable row level security;
revoke all on public.analyzer_rate_limits from anon, authenticated;

create index if not exists analyzer_rate_limits_updated_idx
on public.analyzer_rate_limits (updated_at desc);

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

revoke all on function public.claim_analyzer_request(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_analyzer_request(uuid, text, integer, integer) to service_role;

do $$
declare
  job record;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    for job in
      select jobid
      from cron.job
      where jobname = 'levelflow-e8-due-jobs'
    loop
      perform cron.unschedule(job.jobid);
    end loop;
  end if;
end $$;

drop function if exists private.run_e8_due_jobs();
drop function if exists private.run_e8_job_once(text, text);
drop function if exists private.run_e8_maintenance(text);
drop function if exists private.insert_account_notices(uuid[], text, text, text, text, interval);
drop function if exists private.validate_user_account_config();

alter table if exists public.pending_orders
  drop column if exists account_id;

alter table if exists public.trade_setups
  drop column if exists account_id;

alter table if exists public.trade_outcomes
  drop column if exists account_id;

alter table if exists public.system_notices
  drop column if exists account_id;

drop table if exists public.account_day_metrics cascade;
drop table if exists public.user_accounts cascade;
drop table if exists public.e8_account_sizes cascade;
drop table if exists public.e8_programs cascade;
drop table if exists public.strategy_weightings cascade;

drop type if exists public.account_stage;
drop type if exists public.account_status;
drop type if exists public.drawdown_mode;
drop type if exists public.e8_program_code;
