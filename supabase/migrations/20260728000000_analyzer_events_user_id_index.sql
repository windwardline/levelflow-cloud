-- Cover the analyzer_events.user_id foreign key (Supabase advisor
-- unindexed_foreign_keys): auth.users deletions trigger a SET NULL
-- pass over telemetry rows, which scans without this index.
create index if not exists analyzer_events_user_id_idx
  on public.analyzer_events (user_id);
