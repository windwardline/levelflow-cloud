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
npx supabase functions deploy market-data trade-analyzer news-calendar outcome-sync --project-ref your-project-ref
# Gate credentials (FMP_API_KEY, NEWS_SYNC_TOKEN + its Vault caller copy):
# Keychain → Supabase, the one conduit — AFTER the functions deploy, because
# it ends by proving the token against a live news-calendar (a 404 there
# means "deploy the functions first", and it says so). Defaults to the
# studio machine and the PRODUCTION project ref — override for any other
# target:
REPO=. PROJECT_REF=your-project-ref scripts/ops/sync-function-secrets.sh
```

**The gate credentials never travel any other way.** The fleet credential
law (`windwardline/ops`: the Keychain is the secret store;
`credentials.tsv` is the governed inventory) makes the studio Keychain
authoritative, and `scripts/ops/sync-function-secrets.sh` is the one
conduit to the copies production physically requires: the Supabase
function secrets (`FMP_API_KEY`, `NEWS_SYNC_TOKEN` — the gate half) and
the Vault secret `news_sync_token` (the caller half pg_cron reads),
which all persist across deploys. `deploy.yml` deliberately does not
hold, require, or push either credential (the 2026-08-17 rotations
stranded exactly such unlisted CI copies — deploy runs 373/374). Rotation
is: rotate in the Keychain, run the script, done; the script proves the
token end-to-end with one authenticated news-calendar call, and the
deploy-time E2E chart gate proves the FMP key. Never pass a value on
argv — the script moves them by 600-mode temp files so they cannot
surface in `ps`, and `tests/securityHardening.test.ts` pins this file and
every workflow against regressions.

**Not on the studio machine?** The script's Keychain reads are the studio
machine's (`security find-generic-password -a peacock -s …`). Elsewhere,
apply the same discipline by hand from your own secret store: write
`FMP_API_KEY=…` and `NEWS_SYNC_TOKEN=…` to a 600-mode file and
`npx supabase secrets set --project-ref your-project-ref --env-file` it
(never argv), then set Vault's `news_sync_token` to the same token value
via the dashboard SQL editor with the script's own upsert form —
`vault.secrets.name` is unique, so a bare `create_secret` errors on the
rotation case:

```sql
do $$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'news_sync_token';
  if sid is null then
    perform vault.create_secret('YOUR_TOKEN', 'news_sync_token');
  else
    perform vault.update_secret(sid, 'YOUR_TOKEN');
  end if;
end $$;
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
SUPABASE_URL=https://your-project-ref.supabase.co          # platform-provided
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key            # platform-provided
NEWS_SYNC_TOKEN=…       # via sync-function-secrets.sh, never CI (see above)
FMP_API_KEY=…           # via sync-function-secrets.sh, never CI (see above)
FMP_API_BASE_URL=https://financialmodelingprep.com/stable  # config, deploy.yml
FINNHUB_API_KEY=…       # dormant — joins the conduit if Finnhub is activated
```
