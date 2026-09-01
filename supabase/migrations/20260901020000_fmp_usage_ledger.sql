-- The Edge functions could not see each other's spending.
--
-- `scripts/fmpGovernor.ts` gave the local tooling one chokepoint: a shared
-- breaker, and a byte ledger per UTC DAY rather than per process. The Edge
-- functions cannot read that file — they are ephemeral isolates on someone
-- else's machine — so the analyzer, the chart feed and the calendar each spent
-- against the same allowance with no idea what the others had used.
--
-- This is the same ledger, in the one place all three can reach. It is the
-- pattern `market_bars` already proved on 2026-08-31: when Edge functions must
-- share state, the database is the only place they can.
--
-- THE OWNER'S RULE, AS A TABLE (2026-08-31): background work does not touch
-- the allowance unless the app needs it; the bulk of each 30-day window stays
-- UNUSED so the desk can scale into it; and of what IS spent, the bulk should
-- be live users generating real trades. That is a PRIORITY ORDER, and an order
-- needs classes — a single total cannot express "background yields first".
create table public.fmp_usage (
  -- UTC, because the provider's trailing window is and because a local day
  -- would make the same run land on two dates depending on who ran it.
  usage_day date not null,
  -- WHO spent it, and the whole point of the split:
  --   'user'       a live operator's request — a chart, a scan they asked for
  --   'background' scheduled or automated work nobody is waiting on
  -- The classes are checked rather than free text so a typo becomes a refusal
  -- at INSERT instead of a third class nobody budgeted for.
  consumer_class text not null check (consumer_class in ('user', 'background')),
  bytes bigint not null default 0 check (bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_day, consumer_class)
);

-- NOTHING FOR ANY CLIENT ROLE. The same reasoning that closed `market_bars`:
-- a client write here would let any account exhaust the day's budget for every
-- operator, or hide its own spending by rewriting the row. Both roles are
-- named in one statement so neither can be missed.
alter table public.fmp_usage enable row level security;
revoke all on public.fmp_usage from anon, authenticated;

comment on table public.fmp_usage is
  'Bytes bought from the market-data provider, per UTC day and consumer class. '
  'Engine-written through claim_fmp_bytes and record_fmp_usage; readable by no '
  'client role. The trailing 30-day sum is what the provider actually bills.';

-- May this class spend, and what has it spent today?
--
-- ASKED BEFORE THE FETCH, because the cost is only knowable after the body is
-- read: the provider publishes no usage endpoint and Content-Length is absent
-- on chunked responses. So the pattern is ask-then-record, and the ceiling
-- stops the NEXT fetch rather than the one in flight — the same law
-- `createByteBudget` carries.
create or replace function public.claim_fmp_bytes(
  p_consumer_class text,
  p_daily_limit_bytes bigint
)
returns table (
  allowed boolean,
  spent_today bigint,
  limit_bytes bigint,
  trailing_30_bytes bigint
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_today bigint;
  v_trailing bigint;
begin
  if p_consumer_class not in ('user', 'background') then
    raise exception 'Unsupported FMP consumer class: %', p_consumer_class;
  end if;
  -- A ceiling that reads as nothing must REFUSE rather than quietly mean
  -- unlimited. The minute bank's law (#344), and the reason a missing limit
  -- is the most dangerous input this function takes.
  if p_daily_limit_bytes is null or p_daily_limit_bytes <= 0 then
    raise exception 'Refusing an FMP daily ceiling that reads as nothing: %',
      coalesce(p_daily_limit_bytes::text, 'null');
  end if;

  select coalesce(sum(u.bytes), 0) into v_today
  from public.fmp_usage u
  where u.usage_day = (now() at time zone 'utc')::date
    and u.consumer_class = p_consumer_class;

  select coalesce(sum(u.bytes), 0) into v_trailing
  from public.fmp_usage u
  where u.usage_day > (now() at time zone 'utc')::date - 30;

  return query select v_today < p_daily_limit_bytes, v_today,
    p_daily_limit_bytes, v_trailing;
end;
$$;

-- Credit bytes that were already served.
--
-- Separate from the claim deliberately. Merging them would mean charging
-- before the size is known, and the only honest moment to measure is after the
-- body is read — so a run that dies mid-response still records what it cost.
create or replace function public.record_fmp_usage(
  p_consumer_class text,
  p_bytes bigint
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if p_consumer_class not in ('user', 'background') then
    raise exception 'Unsupported FMP consumer class: %', p_consumer_class;
  end if;
  if p_bytes is null or p_bytes <= 0 then
    return;
  end if;

  -- Older than the provider's own trailing window is no longer billable and
  -- no longer interesting. Pruned here rather than on a schedule, because a
  -- cleanup nobody runs is a table that grows forever.
  delete from public.fmp_usage
  where usage_day < (now() at time zone 'utc')::date - 45;

  insert into public.fmp_usage as u (usage_day, consumer_class, bytes, updated_at)
  values ((now() at time zone 'utc')::date, p_consumer_class, p_bytes, now())
  on conflict (usage_day, consumer_class)
  do update set bytes = u.bytes + p_bytes, updated_at = now();
end;
$$;

revoke all on function public.claim_fmp_bytes(text, bigint) from public, anon, authenticated;
revoke all on function public.record_fmp_usage(text, bigint) from public, anon, authenticated;
