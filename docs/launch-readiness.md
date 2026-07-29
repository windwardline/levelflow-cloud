# Levelflow Launch Readiness

## Current Production Surface

- Frontend: Vercel builds and deploys from this repo on push to `main`, serving `https://levelflow.windwardline.com/` through a DNS-only Cloudflare record.
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
- CORS: Edge Functions restrict browser CORS to `https://levelflow.windwardline.com` and local development origins.
- Custom domain: `levelflow.windwardline.com` is the intended production URL. Cloudflare DNS, the Vercel project domain, and Supabase Auth redirect settings must all include this host.
- Market access: only verified instruments are visible in the app. Indices and Energies are enabled after FMP Ultimate chart verification; futures symbols that returned empty FMP data remain hidden.

## Full Launch Gate

- Economic calendar provider: FMP is selected through `ECONOMIC_CALENDAR_PROVIDER=fmp`; production should be re-tested whenever the FMP plan or key changes.
- Supabase should remain on a paid tier before external users depend on uptime, log retention, email branding, and sustained auth volume.
- Trade execution is outside the active product scope. Levelflow remains a market-review product.
- Deployment secrets are configured for the deploy-workflow gate and Supabase function deploys; Vercel builds the frontend from this repo directly. If any token is revoked, update the matching GitHub Actions secret.
- Legacy local Supabase CLI token can be revoked after no more local CLI work is needed.
