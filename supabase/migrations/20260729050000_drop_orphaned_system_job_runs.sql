-- Drop the orphaned system_job_runs table.
--
-- It belonged to the retired pending-orders/execution architecture: its
-- writers (spread_protection_scan, outcome_review, daily_drawdown_reset,
-- signature_auto_closure, weekend_pending_clear) stopped 2026-06-16 when
-- that system was removed, and verification on 2026-07-29 found zero repo
-- references, zero foreign keys, zero views, and zero triggers touching
-- it. Today's scheduled jobs record to analyzer_events instead.

drop table if exists public.system_job_runs;
