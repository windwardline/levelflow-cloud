# Deployment Notes

The current production-ready path is a static React frontend backed directly by Supabase Auth, Edge Functions, and Postgres RLS. This supports live login, profile preferences, market review, advisory setup generation, and user-owned recommendation history once Supabase is configured.

## Hosted Frontend

Set these environment variables in the host:

```bash
VITE_APP_URL=https://app.windwardline.com/
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_publishable_key
```

The app intentionally renders a setup-required state when Supabase is missing, instead of crashing.

## Supabase

Run `supabase/init.sql` in the Supabase SQL editor for a fresh project. The SQL creates:

- User-owned profile, setup, pending-order, outcome, strategy-weighting, notice, and economic-event tables.
- RLS policies for authenticated users.
- Realtime publication membership with `REPLICA IDENTITY FULL` where cross-session dashboards need old/new row data.

Deploy the `market-data` and `trade-analyzer` Edge Functions before exposing live charting and advisory setup generation in production. The functions require a Supabase-authenticated user session, allow the production origin `https://app.windwardline.com`, and keep provider credentials off the static frontend.

```bash
npx supabase secrets set FMP_API_KEY=your_financial_modeling_prep_key --project-ref your-project-ref
npx supabase functions deploy market-data trade-analyzer --project-ref your-project-ref
```

## Server Runtime

The browser app remains static. Market-data and analyzer work runs through Supabase Edge Functions and database jobs instead of exposing API keys to browser JavaScript.

Deployed functions:

- `market-data`: authenticated FMP market-data access.
- `trade-analyzer`: authenticated FMP-backed, multi-timeframe advisory limit-order setup generation.
- `news-calendar`: token-protected economic-calendar ingestion.

Database cron jobs:

- `levelflow-news-calendar-sync`: hourly economic-calendar sync.

The production backend runs through Supabase Edge Functions. Local experiments should target those functions rather than a separate Express server path.

Required server-only env vars:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEWS_SYNC_TOKEN=your_generated_sync_token
FMP_API_KEY=your_financial_modeling_prep_key
FMP_API_BASE_URL=https://financialmodelingprep.com/stable
FINNHUB_API_KEY=your_finnhub_key
```
