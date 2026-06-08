# Windward Line LevelFlow Cloud

LevelFlow Cloud is an enterprise-style React/Vite and Supabase platform for market analysis, chart review, and advisory trade setup generation. The app uses Supabase Auth, strict user-owned data tables with RLS, FMP-backed market data, an Edge Function analyzer, and a frontend workspace that keeps web and future native clients aligned around the same Supabase session and relational schema.

## Generated Foundation

- `public/brand/` contains optimized Windward Capital logo assets for the hosted app.
- `src/` contains the React application, Supabase client, passwordless/OAuth login, advisor workspace, FMP-backed market feed, FMP-backed advisory analyzer, profile preferences, history, and confidence gauge.
- `server/` contains the Express API scaffold, Supabase service-role client, news provider adapter, and TradeAnalyzer foundation for local/server experiments.
- `supabase/` contains the SQL bootstrap, launch migrations, RLS policies, Realtime setup, and Edge Functions.
- `.env.example` separates public browser keys from server-only service-role credentials.

## Local Commands

```bash
npm install
npm run dev
npm run server
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

FMP and economic-calendar keys must be used from a server runtime or edge function, not from browser JavaScript.
