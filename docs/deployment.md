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

## Server Runtime

The Express server scaffold is not safe to publish as a static site because it uses service-role and provider API keys. Deploy it separately to a secure Node runtime if cron jobs and provider-backed trade analysis are needed.

Required server-only env vars:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
MASSIVE_API_KEY=your_massive_api_key
FMP_API_KEY=your_financial_modeling_prep_key
FINNHUB_API_KEY=your_finnhub_key
```
