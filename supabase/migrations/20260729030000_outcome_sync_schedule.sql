-- Schedule LevelFlow outcome resolution.
--
-- Pending setups resolve hourly on a clock instead of on user traffic, so
-- the outcome cohort accumulates at full fidelity and no setup can sit
-- pending past the bar-fetch lookback. Uses the shared internal sync token
-- (same trust domain as the news-calendar job).

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname = 'levelflow-outcome-sync'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

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
      body := jsonb_build_object('source', 'pg_cron', 'time', now())
    ) as request_id;
  $$
);
