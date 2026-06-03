# Windward Capital LevelFlow Cloud

LevelFlow Cloud is scaffolded as an enterprise-grade, multi-tenant React/Vite and Node/Express platform for Windward Capital's E8 Markets and TradeLocker workflows. The foundation encodes the requested Supabase Auth model, strict user-owned data tables with RLS, E8 account matrices, CET/CEST automation hooks, and a frontend onboarding surface that keeps web and future native clients aligned around the same Supabase session and relational schema.

## Generated Foundation

- `public/brand/` contains optimized Windward Capital logo assets for the hosted app.
- `src/` contains the React application, Supabase client, E8 configuration matrix, passwordless/OAuth login, onboarding dashboard, E8 time hook, live Massive.com market feed, and confidence gauge.
- `server/` contains the Express API scaffold, Supabase service-role client, E8 cron routines, news provider adapter, and TradeAnalyzer foundation for local/server experiments.
- `supabase/` contains the SQL bootstrap, launch migrations, RLS policies, Realtime setup, Edge Functions, and scheduled CE(S)T automation.
- `.env.example` separates public browser keys from server-only service-role credentials.

## Local Commands

```bash
npm install
npm run dev
npm run server
npm run build
```

Run `supabase/init.sql` in the Supabase SQL editor or through your migration workflow before saving onboarding data from the frontend.

## Production Checklist

1. Create or select a Supabase project.
2. Run [supabase/init.sql](/supabase/init.sql) in the Supabase SQL editor.
3. In Supabase Auth, enable email OTP/magic links and configure Google/Apple OAuth providers.
4. Add the deployed site URL to Supabase Auth redirect URLs.
5. Deploy the Supabase Edge Functions and set Supabase function secrets:
   - `MASSIVE_API_KEY`
   - `NEWS_SYNC_TOKEN`
   - `FMP_API_KEY` or `FINNHUB_API_KEY` for macro news ingestion
   - `MASSIVE_API_BASE_URL` if Massive.com changes the default REST host
6. Apply the launch migrations in `supabase/migrations/`.
7. Set hosted frontend env vars:
   - `VITE_APP_URL`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
8. Keep these server-only values out of static hosting:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MASSIVE_API_KEY`
   - `NEWS_SYNC_TOKEN`
   - `FMP_API_KEY` or `FINNHUB_API_KEY`

Massive.com and economic-calendar keys must be used from a server runtime or edge function, not from browser JavaScript.
