alter table if exists public.economic_events
  add column if not exists symbol text,
  add column if not exists event_type text not null default 'scheduled',
  add column if not exists url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'economic_events_event_type_check'
      and conrelid = 'public.economic_events'::regclass
  ) then
    alter table public.economic_events
      add constraint economic_events_event_type_check
      check (event_type in ('scheduled', 'earnings', 'headline'));
  end if;
end $$;

create index if not exists economic_events_symbol_scheduled_idx
  on public.economic_events (symbol, scheduled_at desc, impact);
