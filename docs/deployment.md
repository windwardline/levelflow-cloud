# Deployment Notes

The current production-ready path is a static React frontend backed directly by Supabase Auth and Postgres RLS. This supports live login and account onboarding once Supabase is configured.

## Hosted Frontend

Set these environment variables in the host:

```bash
VITE_APP_URL=https://your-hosted-app.example
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_publishable_key
```

The app intentionally renders a setup-required state when Supabase is missing, instead of crashing.

## Supabase

Run `supabase/init.sql` in the Supabase SQL editor. The SQL creates:

- E8 program and account-size lookups.
- User-owned profile, account, metric, setup, pending-order, outcome, strategy-weighting, notice, and economic-event tables.
- RLS policies for authenticated users.
- Realtime publication membership with `REPLICA IDENTITY FULL` where cross-session dashboards need old/new row data.

Deploy the `market-data` Edge Function before exposing the live chart in production. The function requires a Supabase-authenticated user session and keeps Massive.com credentials off the static frontend.

```bash
npx supabase secrets set MASSIVE_API_KEY=your_massive_api_key --project-ref your-project-ref
npx supabase functions deploy market-data --project-ref your-project-ref
```

## Server Runtime

The browser app remains static. Provider-backed work now runs through Supabase Edge Functions and Supabase database cron jobs instead of exposing API keys to browser JavaScript.

Deployed functions:

- `market-data`: authenticated Massive.com market-data access.
- `trade-analyzer`: authenticated advisory limit-order setup generation.
- `news-calendar`: token-protected economic-calendar ingestion.

Database cron jobs:

- `levelflow-e8-due-jobs`: CE(S)T-aware E8 maintenance checks every minute.
- `levelflow-news-calendar-sync`: hourly economic-calendar sync.

The Express server scaffold remains useful for local experiments, but it is no longer the production launch path.

Required server-only env vars:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
MASSIVE_API_KEY=your_massive_api_key
NEWS_SYNC_TOKEN=your_generated_sync_token
FMP_API_KEY=your_financial_modeling_prep_key
FINNHUB_API_KEY=your_finnhub_key
```
