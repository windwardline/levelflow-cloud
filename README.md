# Windward Line LevelFlow Cloud

LevelFlow Cloud is a React/Vite and Supabase platform for disciplined market review, chart analysis, and advisory limit-order setup generation. The app uses Supabase Auth, strict user-owned data tables with RLS, server-side market data, an Edge Function analyzer, and a focused web workspace for logged-in users.

## Architecture

- `public/brand/` contains optimized Windward Capital logo assets for the hosted app.
- `src/` contains the React application, Supabase client, passwordless/OAuth login, advisor workspace, profile preferences, history, donation options, legal links, and charting components.
- `supabase/functions/` contains the production backend: authenticated market data, trade analysis, and calendar ingestion Edge Functions.
- `supabase/` contains the SQL bootstrap, launch migrations, RLS policies, Realtime setup, and Edge Functions.
- `.env.example` separates public browser keys from server-only service-role credentials.

## Local Commands

```bash
npm install
npm run dev
npm run server
npm test
npm run build
```

Run `supabase/init.sql` in the Supabase SQL editor or through your migration workflow before using a fresh project.

## Production Checklist

1. Create or select a Supabase project.
2. Run [supabase/init.sql](/supabase/init.sql) in the Supabase SQL editor.
3. In Supabase Auth, enable email OTP/magic links and configure Google/Apple OAuth providers.
4. Add `https://app.windwardline.com/` and any fallback/local development URLs to Supabase Auth redirect URLs.
5. Deploy the Supabase Edge Functions and set Supabase function secrets:
   - `NEWS_SYNC_TOKEN`
   - `FMP_API_KEY` for the advisory analyzer and macro news ingestion
   - `FINNHUB_API_KEY` only if macro news ingestion is switched away from FMP
   - `FMP_API_BASE_URL` only if FMP changes the default stable REST host
6. Apply the launch migrations in `supabase/migrations/`.
7. Set hosted frontend env vars:
   - `VITE_APP_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
8. Keep these server-only values out of static hosting:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEWS_SYNC_TOKEN`
   - `FMP_API_KEY`
   - `FINNHUB_API_KEY`

Market-data and economic-calendar keys must be used from a server runtime or edge function, not from browser JavaScript. LevelFlow is advisory-only; trade execution is outside the active product scope.
