# Windward Line Levelflow Cloud

Levelflow Cloud is a React/Vite and Supabase platform for disciplined market review, chart analysis, and limit-order setup generation. The app uses Supabase Auth, strict user-owned data tables with RLS, server-side market data, an Edge Function analyzer, and a focused web workspace for logged-in users.

## Architecture

- `public/brand/` contains the Levelflow mark in both themes; the favicon set, manifest, and og-image live at the `public/` root. Run `node scripts/render-brand-assets.mjs` to regenerate all of them from the app's colour tokens.
- `src/` contains the React application, Supabase client, passwordless/OAuth login, advisor workspace, profile preferences, history, donation options, legal links, and charting components.
- `supabase/functions/` contains the production backend: authenticated market data, trade analysis, calendar ingestion, and scheduled outcome-resolution Edge Functions.
- `supabase/` contains the SQL bootstrap, launch migrations, RLS policies, Realtime setup, and Edge Functions.
- `.env.example` separates public browser keys from server-only service-role credentials.

## Local Commands

```bash
npm install
npm run dev
npm run lint
npm test
npm run test:e2e
npm run build
```

Run `supabase/init.sql` in the Supabase SQL editor or through your migration workflow before using a fresh project.

## Continuous Integration and Deployment

`ci.yml` runs typechecks (app, node, and the tests/scripts graph), lint, unit
tests, `npm audit`, the migrations check, the build, and the bundle budget on
every push and pull request to `main`.

`deploy.yml` runs on a push to `main`: the frontend build gate first, then
Supabase migrations, Edge Function deploys, and browser tests. Vercel builds
and deploys the frontend directly from this repo on the same push
(`vercel.json` sets the framework, build command, and security headers; the
build command type-checks the whole graph, tests and scripts included, so a
test type error fails the production build too) and serves it at
[levelflow.windwardline.com](https://levelflow.windwardline.com). The Vercel
build runs independently of `deploy.yml`, so a frontend that depends on a new
migration should land one push after the migration.

## Production Checklist

1. Create or select a Supabase project.
2. Run [supabase/init.sql](/supabase/init.sql) in the Supabase SQL editor.
3. In Supabase Auth, enable email OTP/magic links and configure Google/Apple OAuth providers.
4. Add `https://levelflow.windwardline.com/` and any fallback/local development URLs to Supabase Auth redirect URLs.
5. Apply the launch migrations in `supabase/migrations/`.
6. Deploy the Supabase Edge Functions and set Supabase function secrets:
   - `NEWS_SYNC_TOKEN`
   - `FMP_API_KEY` for the analyzer and macro news ingestion
   - `FINNHUB_API_KEY` only if macro news ingestion is switched away from FMP
   - `FMP_API_BASE_URL` only if FMP changes the default stable REST host
7. Set hosted frontend env vars:
   - `VITE_APP_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
8. Keep these server-only values out of static hosting:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEWS_SYNC_TOKEN`
   - `FMP_API_KEY`
   - `FINNHUB_API_KEY`

Market-data and economic-calendar keys must be used from a server runtime or edge function, not from browser JavaScript. Levelflow does not place trades; trade execution is outside the active product scope.

See [docs/trade-model.md](/docs/trade-model.md) for the current engine state of record — per-class calibration derived across a completed 23-round arc at full available history under a walk-forward both-splits gate, the measured per-class records the UI mirrors, and the resumption protocol for when live cohort data warrants reopening the work.
See [docs/design/contrast.md](/docs/design/contrast.md) for every text pair's measured WCAG ratio in both themes, enforced by `tests/contrast.test.ts`.
See [docs/security-hardening.md](/docs/security-hardening.md) for the Cloudflare response-header policy and authenticated E2E test-user setup.
See [docs/gap-analysis.md](/docs/gap-analysis.md) for the current improvement backlog across trade logic, frontend, backend, security, and reliability.
