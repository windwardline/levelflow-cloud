-- Raise the scheduled sync calls' HTTP timeout from pg_net's 5s default.
--
-- On 2026-07-29 15:07 UTC the news-calendar call exceeded 5 seconds while
-- the function completed its ingest successfully — pg_net recorded a
-- timeout, and the watchdog (correctly) alarmed for three hours over a
-- run that lost no data. The functions routinely take 3-4.5s, so a slow
-- provider response tips over the default. 15s keeps the watchdog's
-- signal meaningful: a recorded failure again means the work failed.

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in ('levelflow-news-calendar-sync', 'levelflow-outcome-sync')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule(
  'levelflow-news-calendar-sync',
  '7 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/news-calendar',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'news_sync_token')
      ),
      body := jsonb_build_object('source', 'pg_cron', 'time', now()),
      timeout_milliseconds := 15000
    ) as request_id;
  $$
);

select cron.schedule(
  'levelflow-outcome-sync',
  '23 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/outcome-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'news_sync_token')
      ),
      body := jsonb_build_object('source', 'pg_cron', 'time', now()),
      timeout_milliseconds := 15000
    ) as request_id;
  $$
);
