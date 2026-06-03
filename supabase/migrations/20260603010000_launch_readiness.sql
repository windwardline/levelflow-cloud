-- LevelFlow launch-readiness automation.

create extension if not exists pg_cron with schema extensions;

create table if not exists public.system_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  dedupe_key text unique,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  error text
);

alter table public.system_job_runs enable row level security;

create index if not exists system_job_runs_job_started_idx
on public.system_job_runs (job_name, started_at desc);

drop function if exists private.run_e8_due_jobs();
drop function if exists private.run_e8_job_once(text, text);
drop function if exists private.run_e8_maintenance(text);
drop function if exists private.insert_account_notices(uuid[], text, text, text, text, interval);

create or replace function private.insert_account_notices(
  account_ids uuid[],
  p_notice_type text,
  p_severity text,
  p_title text,
  p_body text,
  p_active_for interval default interval '45 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
begin
  if coalesce(array_length(account_ids, 1), 0) = 0 then
    return 0;
  end if;

  insert into public.system_notices (
    user_id,
    account_id,
    notice_type,
    severity,
    title,
    body,
    active_from,
    active_until
  )
  select
    account.user_id,
    account.id,
    p_notice_type,
    p_severity,
    p_title,
    p_body,
    now(),
    now() + p_active_for
  from public.user_accounts account
  where account.id = any(account_ids)
    and not exists (
      select 1
      from public.system_notices existing
      where existing.account_id = account.id
        and existing.notice_type = p_notice_type
        and coalesce(existing.active_until, now() + interval '1 minute') > now()
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function private.run_e8_maintenance(p_job_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trading_day date := (now() at time zone 'Europe/Prague')::date;
  v_local_time time := (now() at time zone 'Europe/Prague')::time;
  affected_accounts uuid[] := array[]::uuid[];
  changed_count integer := 0;
  notice_count integer := 0;
  spread_active boolean;
begin
  if p_job_name = 'daily_drawdown_reset' then
    insert into public.account_day_metrics (
      user_id,
      account_id,
      trading_day,
      realized_pnl,
      open_pnl,
      daily_drawdown_used,
      daily_profit_pct,
      auto_pause_triggered,
      rollover_protection_active
    )
    select
      account.user_id,
      account.id,
      v_trading_day,
      0,
      0,
      0,
      0,
      false,
      false
    from public.user_accounts account
    where account.status in ('evaluation', 'funded', 'paused')
    on conflict (account_id, trading_day) do update set
      open_pnl = 0,
      daily_drawdown_used = 0,
      daily_profit_pct = 0,
      auto_pause_triggered = false,
      rollover_protection_active = false,
      updated_at = now();

    get diagnostics changed_count = row_count;
    return jsonb_build_object('metrics_reset', changed_count, 'trading_day', v_trading_day);
  end if;

  if p_job_name = 'signature_auto_closure' then
    with updated as (
      update public.pending_orders order_row
      set
        status = 'invalidated',
        invalidation_reason = 'E8 Signature pending orders are invalidated at 22:45 CE(S)T.',
        updated_at = now()
      from public.user_accounts account
      where order_row.account_id = account.id
        and account.program_code = 'e8_signature'
        and account.status in ('evaluation', 'funded', 'paused')
        and order_row.status in ('generated', 'placed')
      returning order_row.account_id
    )
    select coalesce(array_agg(distinct account_id), array[]::uuid[]), count(*)
    into affected_accounts, changed_count
    from updated;

    notice_count := private.insert_account_notices(
      affected_accounts,
      'signature_auto_closure',
      'critical',
      'Signature closure window',
      'Pending limit orders were invalidated. Close manual positions before the 23:00 CE(S)T forced liquidation window.',
      interval '90 minutes'
    );

    return jsonb_build_object('orders_invalidated', changed_count, 'notices_created', notice_count);
  end if;

  if p_job_name = 'weekend_pending_clear' then
    with updated as (
      update public.pending_orders
      set
        status = 'invalidated',
        invalidation_reason = 'Weekend protection invalidated pending limit orders at Friday 22:00 CE(S)T.',
        updated_at = now()
      where status in ('generated', 'placed')
      returning account_id
    )
    select coalesce(array_agg(distinct account_id), array[]::uuid[]), count(*)
    into affected_accounts, changed_count
    from updated;

    notice_count := private.insert_account_notices(
      affected_accounts,
      'weekend_protection',
      'critical',
      'Weekend protection',
      'All pending limit orders were invalidated at the Friday 22:00 CE(S)T protection window.',
      interval '72 hours'
    );

    return jsonb_build_object('orders_invalidated', changed_count, 'notices_created', notice_count);
  end if;

  if p_job_name = 'spread_protection_scan' then
    spread_active := v_local_time >= time '23:55' or v_local_time <= time '00:15';

    insert into public.account_day_metrics (
      user_id,
      account_id,
      trading_day,
      rollover_protection_active
    )
    select
      account.user_id,
      account.id,
      v_trading_day,
      spread_active
    from public.user_accounts account
    where account.status in ('evaluation', 'funded', 'paused')
    on conflict (account_id, trading_day) do update set
      rollover_protection_active = excluded.rollover_protection_active,
      updated_at = now();

    get diagnostics changed_count = row_count;

    if spread_active then
      select coalesce(array_agg(id), array[]::uuid[])
      into affected_accounts
      from public.user_accounts
      where status in ('evaluation', 'funded', 'paused');

      notice_count := private.insert_account_notices(
        affected_accounts,
        'spread_protection',
        'warning',
        'Rollover spread protection',
        'New setup generation is halted between 23:55 and 00:15 CE(S)T. Cancel pending orders exposed to rollover spread widening.',
        interval '30 minutes'
      );
    end if;

    return jsonb_build_object('spread_active', spread_active, 'metrics_touched', changed_count, 'notices_created', notice_count);
  end if;

  if p_job_name = 'outcome_review' then
    insert into public.trade_outcomes (
      user_id,
      account_id,
      setup_id,
      reviewed_at,
      outcome,
      feedback
    )
    select
      setup.user_id,
      setup.account_id,
      setup.id,
      now(),
      'pending',
      jsonb_build_object(
        'source', 'scheduled_24h_review',
        'confidenceScore', setup.confidence_score,
        'confluence', setup.confluence
      )
    from public.trade_setups setup
    where setup.created_at < now() - interval '24 hours'
      and setup.status = 'generated'
    on conflict (setup_id) do update set
      reviewed_at = excluded.reviewed_at,
      feedback = public.trade_outcomes.feedback || excluded.feedback,
      updated_at = now();

    get diagnostics changed_count = row_count;

    with grouped as (
      select
        outcome.user_id,
        coalesce(setup.confluence ->> 'setupKey', setup.correlation_group, setup.symbol) as setup_key,
        count(*) filter (where outcome.outcome in ('take_profit', 'stop_loss')) as total_setups,
        count(*) filter (where outcome.outcome = 'take_profit') as wins,
        count(*) filter (where outcome.outcome = 'stop_loss') as losses
      from public.trade_outcomes outcome
      join public.trade_setups setup on setup.id = outcome.setup_id
      where outcome.outcome in ('take_profit', 'stop_loss')
      group by outcome.user_id, coalesce(setup.confluence ->> 'setupKey', setup.correlation_group, setup.symbol)
    )
    insert into public.strategy_weightings (
      user_id,
      setup_key,
      total_setups,
      wins,
      losses,
      confidence_adjustment,
      last_reviewed_at
    )
    select
      user_id,
      setup_key,
      total_setups,
      wins,
      losses,
      greatest(-10, least(10, round((((wins::numeric / nullif(total_setups, 0)) - 0.5) * 20), 3))),
      now()
    from grouped
    where total_setups > 0
    on conflict (user_id, setup_key) do update set
      total_setups = excluded.total_setups,
      wins = excluded.wins,
      losses = excluded.losses,
      confidence_adjustment = excluded.confidence_adjustment,
      last_reviewed_at = excluded.last_reviewed_at,
      updated_at = now();

    return jsonb_build_object('outcomes_reviewed', changed_count);
  end if;

  raise exception 'Unknown E8 maintenance job: %', p_job_name;
end;
$$;

create or replace function private.run_e8_job_once(p_job_name text, p_dedupe_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  run_id uuid;
  job_details jsonb;
begin
  insert into public.system_job_runs (job_name, dedupe_key, status)
  values (p_job_name, p_dedupe_key, 'running')
  on conflict (dedupe_key) do nothing
  returning id into run_id;

  if run_id is null then
    return;
  end if;

  begin
    job_details := private.run_e8_maintenance(p_job_name);

    update public.system_job_runs
    set
      status = 'succeeded',
      finished_at = now(),
      details = job_details
    where id = run_id;
  exception when others then
    update public.system_job_runs
    set
      status = 'failed',
      finished_at = now(),
      error = sqlerrm
    where id = run_id;
  end;
end;
$$;

create or replace function private.run_e8_due_jobs()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  local_ts timestamp := now() at time zone 'Europe/Prague';
  local_hour integer := extract(hour from local_ts)::integer;
  local_minute integer := extract(minute from local_ts)::integer;
  local_isodow integer := extract(isodow from local_ts)::integer;
  minute_key text := to_char(local_ts, 'YYYY-MM-DD-HH24-MI');
begin
  if local_minute % 5 = 0 then
    perform private.run_e8_job_once('spread_protection_scan', 'spread-protection-' || minute_key);
  end if;

  if local_hour = 0 and local_minute = 0 then
    perform private.run_e8_job_once('daily_drawdown_reset', 'daily-reset-' || to_char(local_ts, 'YYYY-MM-DD'));
  end if;

  if local_hour = 22 and local_minute = 45 then
    perform private.run_e8_job_once('signature_auto_closure', 'signature-auto-closure-' || to_char(local_ts, 'YYYY-MM-DD'));
  end if;

  if local_isodow = 5 and local_hour = 22 and local_minute = 0 then
    perform private.run_e8_job_once('weekend_pending_clear', 'weekend-pending-clear-' || to_char(local_ts, 'YYYY-MM-DD'));
  end if;

  if local_minute = 0 then
    perform private.run_e8_job_once('outcome_review', 'outcome-review-' || to_char(local_ts, 'YYYY-MM-DD-HH24'));
  end if;
end;
$$;

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname = 'levelflow-e8-due-jobs'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'levelflow-e8-due-jobs',
  '* * * * *',
  $$select private.run_e8_due_jobs();$$
);
