-- The chart feed had no request budget of any kind.
--
-- Measured 2026-08-31 by an audit of every FMP consumer: `market-data` was the
-- ONLY Edge function reaching the provider whose sole check was that the caller
-- was authenticated. `trade-analyzer` claims a budget unit per request through
-- `claim_analyzer_request`; the chart feed claimed nothing, so a single signed-in
-- browser tab requesting a 15-minute crypto chart once per second draws roughly
-- 648 KB x 86,400 = ~56 GB in a day. The 30-day allowance in under five days,
-- from one tab, with nothing able to refuse it.
--
-- That is the wrong shape for the owner's rule (2026-08-31): the bulk of each
-- 30-day window must stay UNUSED so the desk can scale into it, and of what is
-- spent the bulk should be live users generating real trades. A user-facing
-- path with NO ceiling is not "prioritised" — it is the one path that can
-- exhaust the window before anything else gets a share.
--
-- REUSING THE PROVEN LIMITER rather than minting a second one. The table, the
-- window arithmetic, the atomic claim and the cleanup already exist and are
-- exercised at deploy time by the analyzer-abuse suite. Only the accepted
-- action set has to widen, and it widens in BOTH places it is written: the
-- table's check constraint and the function's own guard. They were already two
-- statements of one fact, and a change that moved one would have failed at
-- runtime with a constraint violation rather than at deploy.
alter table public.analyzer_rate_limits
  drop constraint if exists analyzer_rate_limits_action_check;

alter table public.analyzer_rate_limits
  add constraint analyzer_rate_limits_action_check
  check (
    action in (
      'generate_setup',
      'refresh_outcomes',
      'scan_opportunities',
      -- The chart feed. Named for the function rather than for a verb because
      -- it has exactly one action, and a name that describes the caller keeps
      -- the budget legible in `analyzer_rate_limits` without a lookup.
      'market_data'
    )
  );

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
  -- Kept in step with the table's constraint above BY HAND, and that is why
  -- both live in one migration: an action the function accepts and the table
  -- refuses fails at INSERT, inside a transaction, on a live request.
  if v_action not in (
    'generate_setup', 'refresh_outcomes', 'scan_opportunities', 'market_data'
  ) then
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

revoke all on function public.claim_analyzer_request(uuid, text, integer, integer)
  from public, anon, authenticated;
