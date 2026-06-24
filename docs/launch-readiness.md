# LevelFlow Launch Readiness

## Current Production Surface

- Frontend: GitHub Pages custom domain at `https://levelflow.windwardline.com/` with the legacy GitHub Pages URL retained as a fallback during DNS propagation.
- Auth and database: Supabase project `usrtpoftuvhpmyhlhqlg`.
- Market data: Supabase Edge Function `market-data`, backed by the FMP key configured in GitHub/Supabase secrets.
- Market analyzer: Supabase Edge Function `trade-analyzer`, using daily/intraday bars, scheduled-event records, session rules, correlation filtering, limit-only outputs, and RLS-owned inserts.
- News ingestion: Supabase Edge Function `news-calendar`, scheduled hourly through `pg_cron` and `pg_net`, targeting FMP's current stable economic-calendar endpoint.
- Outcome refresh: the analyzer refreshes pending setup outcomes when users load history or request a new setup.
- Deployment workflow: `.github/workflows/deploy.yml`.

## Private Beta Gate

- Real user email login: needs a real magic-link confirmation from the account owner.
- Profile persistence: real-user validation should confirm profile preference updates, theme selection, and history loading.
- Legal pages: `risk-disclaimer.html`, `privacy.html`, and `terms.html` are published under `/legal/`.
- CORS: Edge Functions restrict browser CORS to `https://levelflow.windwardline.com`, `https://windwardline.github.io`, and local development origins.
- Custom domain: `levelflow.windwardline.com` is the intended production URL. DNS, GitHub Pages, and Supabase Auth redirect settings must all include this host.
- Market access: only verified categories are visible in the app. Restricted or unverified categories remain hidden until data quality is confirmed.

## Full Launch Gate

- Economic calendar provider: FMP is selected through `ECONOMIC_CALENDAR_PROVIDER=fmp`; production should be re-tested whenever the FMP plan or key changes.
- Supabase should remain on a paid tier before external users depend on uptime, log retention, email branding, and sustained auth volume.
- Trade execution is outside the active product scope. LevelFlow remains a market-review product.
- Deployment secrets are configured for source build, Supabase function deploys, and Pages artifact publishing. If any token is revoked, update the matching GitHub Actions secret.
- Legacy local Supabase CLI token can be revoked after no more local CLI work is needed.
