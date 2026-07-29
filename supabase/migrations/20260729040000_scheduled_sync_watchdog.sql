-- Watchdog for scheduled sync jobs.
--
-- The economic-calendar job failed authentication silently for weeks: cron
-- fired on time, pg_net recorded 401s nobody read, and the analyzer quietly
-- lost news awareness once its event window ran dry. Cron success is not
-- job success, so this records a queryable error whenever a scheduled call
-- fails or calendar coverage goes stale.

do $$
declare
  job record;
begin
  for job in
    select jobid from cron.job where jobname = 'levelflow-sync-watchdog'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'levelflow-sync-watchdog',
  '41 * * * *',
  $$
    insert into public.analyzer_events (action, status, message, metadata)
    select
      'sync_watchdog',
      'error',
      'Scheduled sync degraded: verify cron job authentication and provider ingestion.',
      jsonb_build_object(
        'recentHttpFailures', failures.count,
        'futureCalendarEvents', calendar.future_events,
        'latestCalendarIngestAt', calendar.latest_ingest
      )
    from
      (
        select count(*) as count
        from net._http_response
        where created > now() - interval '3 hours'
          and (status_code is null or status_code >= 300)
      ) as failures,
      (
        select
          count(*) filter (where scheduled_at > now()) as future_events,
          max(created_at) as latest_ingest
        from public.economic_events
      ) as calendar
    where failures.count > 0 or calendar.future_events = 0;
  $$
);
