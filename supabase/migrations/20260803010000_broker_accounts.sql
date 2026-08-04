-- §19 retrofit, amendment 14. Confirmed accounts are SAVED, so a user holding
-- several can select among them without re-entry; one account is active at a
-- time. The single selection that shipped in 20260803000000 becomes the user's
-- first saved account.
--
-- Nothing is deleted. The six profiles.broker_* columns keep their data and
-- their constraints: this migration reads them to seed, and a later change set
-- retires them on the owner's word, not this one.
--
-- Tier membership and the account size's membership in the selected program's
-- ladder stay enforced by src/lib/broker/ and the write path, not by SQL —
-- duplicating the ladders in check constraints would let them drift from the
-- modules CI pins (§19g).

create table if not exists public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_id text not null,
  classification text not null,
  platform text not null,
  program_line text not null,
  account_size numeric(14,2) not null,
  stage text not null,
  risk_percent numeric(4,2) not null,
  drawdown_tier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_accounts_broker_id_valid
    check (broker_id in ('e8')),
  constraint broker_accounts_classification_valid
    check (classification in ('forex', 'crypto', 'futures')),
  constraint broker_accounts_platform_valid
    check (platform in ('tradelocker', 'matchtrader', 'tradovate')),
  constraint broker_accounts_program_line_valid
    check (program_line in (
      'one', 'one_crypto', 'pro_forex', 'pro_crypto',
      'signature_forex', 'signature_crypto', 'signature_futures',
      'zero', 'zero_futures_starter', 'zero_futures_max')),
  constraint broker_accounts_stage_valid
    check (stage in ('challenge', 'performance')),
  constraint broker_accounts_account_size_positive
    check (account_size > 0),
  constraint broker_accounts_risk_percent_range
    check (risk_percent >= 0.10 and risk_percent <= 1.50)
);

create index if not exists broker_accounts_user_id_idx
  on public.broker_accounts (user_id);

alter table public.profiles
  add column if not exists active_broker_account_id uuid;

alter table public.profiles
  drop constraint if exists profiles_active_broker_account_fk;

alter table public.profiles
  add constraint profiles_active_broker_account_fk
    foreign key (active_broker_account_id)
    references public.broker_accounts (id)
    on delete set null;

-- The seed. Every profile carrying a complete selection gets exactly one saved
-- account, and that account becomes active. Classification and platform are
-- derived from the program line by the catalog record
-- (docs/research/e8-purchase-screen-2026-08-02.md): the futures lines run on
-- Tradovate, every CFD line on TradeLocker. MatchTrader is never seeded — it is
-- unverified and ships greyed (amendment 12).
insert into public.broker_accounts (
  user_id, broker_id, classification, platform, program_line,
  account_size, stage, risk_percent, drawdown_tier
)
select
  p.id,
  p.broker_id,
  case
    when p.broker_program_line in ('one_crypto', 'pro_crypto', 'signature_crypto')
      then 'crypto'
    when p.broker_program_line in (
      'signature_futures', 'zero_futures_starter', 'zero_futures_max')
      then 'futures'
    else 'forex'
  end,
  case
    when p.broker_program_line in (
      'signature_futures', 'zero_futures_starter', 'zero_futures_max')
      then 'tradovate'
    else 'tradelocker'
  end,
  p.broker_program_line,
  p.broker_account_size,
  p.broker_stage,
  p.broker_risk_percent,
  p.broker_drawdown_tier
from public.profiles p
where p.broker_id is not null
  and p.broker_program_line is not null
  and p.broker_account_size is not null
  and p.broker_stage is not null
  and p.broker_risk_percent is not null
  and not exists (
    select 1 from public.broker_accounts a where a.user_id = p.id
  );

update public.profiles p
set active_broker_account_id = a.id
from public.broker_accounts a
where a.user_id = p.id
  and p.active_broker_account_id is null;

grant select, insert, update, delete on public.broker_accounts to authenticated;

alter table public.broker_accounts enable row level security;

drop policy if exists "broker accounts select own" on public.broker_accounts;
create policy "broker accounts select own"
on public.broker_accounts
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "broker accounts insert own" on public.broker_accounts;
create policy "broker accounts insert own"
on public.broker_accounts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "broker accounts update own" on public.broker_accounts;
create policy "broker accounts update own"
on public.broker_accounts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "broker accounts delete own" on public.broker_accounts;
create policy "broker accounts delete own"
on public.broker_accounts
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists set_broker_accounts_updated_at on public.broker_accounts;
create trigger set_broker_accounts_updated_at
  before update on public.broker_accounts
  for each row execute function private.set_updated_at();
