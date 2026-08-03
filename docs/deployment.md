# Deployment Notes

The current production-ready path is a static React frontend backed directly by Supabase Auth, Edge Functions, and Postgres RLS. This supports live login, profile preferences, market review, limit-setup generation, and user-owned recommendation history once Supabase is configured.

## Hosted Frontend

Set these environment variables in the host:

```bash
VITE_APP_URL=https://levelflow.windwardline.com/
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_publishable_key
```

The app intentionally renders a setup-required state when Supabase is missing, instead of crashing.

### Tabs that were open when a deploy landed

A signed-in tab checks whether the origin still serves the bundle it is running: once when the
signed-in shell arrives, and once each time the tab is shown again. The running bundle is the
entry module's own URL (`import.meta.url` in `src/main.tsx`); the deployed one is the
`<script type="module">` in the document served at `/`, read with `cache: "no-store"`. When the
two differ, the masthead carries one line — "Levelflow has updated. Reload to continue." — and
the line is the reload control. Unknown on either side is never a mismatch, so the dev server
(whose entry is `/src/main.tsx`) and a failed read both show nothing;
`src/lib/deployedVersion.ts` holds the mechanism and the incident that asked for it.

The trigger is any deploy that renames the entry chunk, which includes a stylesheet-only one: the
chunk's hash covers its CSS dependency (measured — one added rule renames it with byte-identical
JavaScript). The notice claims the app has updated, not that its JavaScript changed, so that is
the intended reach.

Every analyzer request carries the running bundle's filename as `buildStamp`, and the server
echoes it into `analyzer_events.metadata` beside the scan trace. That is the fleet view: which
bundles are still asking, and how much of the fleet a breaking change has yet to reach. It is a
label on the record — validated for shape, dropped if malformed, never a reason to refuse a
request.

A breaking backend change is still a two-push sequence, and this notice is what makes the gap
survivable rather than what closes it: deploy the tolerant server first, then the client.

## Supabase

Run `supabase/init.sql` in the Supabase SQL editor for a fresh project, then apply the migrations in `supabase/migrations`. The bootstrap SQL creates the current product surface only:

- User-owned profile, setup, outcome, notice, and economic-event tables.
- A service-role-only analyzer rate-limit table and RPC function.
- RLS policies for authenticated users.
- Realtime publication membership with `REPLICA IDENTITY FULL` where cross-session dashboards need old/new row data.

Apply migrations before deploying Edge Functions that depend on new database objects. The functions require a Supabase-authenticated user session, allow the production origin `https://levelflow.windwardline.com`, and keep provider credentials off the static frontend.

```bash
npx supabase db push --linked
npx supabase secrets set FMP_API_KEY=your_financial_modeling_prep_key --project-ref your-project-ref
npx supabase functions deploy market-data trade-analyzer news-calendar outcome-sync --project-ref your-project-ref
```

## Server Runtime

The browser app remains static. Market-data and analyzer work runs through Supabase Edge Functions and database jobs instead of exposing API keys to browser JavaScript.

Deployed functions:

- `market-data`: authenticated FMP market-data access.
- `trade-analyzer`: authenticated FMP-backed, multi-timeframe limit-setup generation.
- `news-calendar`: token-protected economic-calendar ingestion.
- `outcome-sync`: token-protected scheduled outcome resolution across users.

Database cron jobs:

- `levelflow-news-calendar-sync`: hourly economic-calendar sync (:07).
- `levelflow-outcome-sync`: hourly pending-setup outcome resolution (:23).
- `levelflow-sync-watchdog`: hourly health check (:41) — writes analyzer_events
  errors when either sync stops running or the future calendar goes empty.

The production backend runs through Supabase Edge Functions. Local experiments should target those functions directly.

Required server-only env vars:

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEWS_SYNC_TOKEN=your_generated_sync_token
FMP_API_KEY=your_financial_modeling_prep_key
FMP_API_BASE_URL=https://financialmodelingprep.com/stable
FINNHUB_API_KEY=your_finnhub_key
```
