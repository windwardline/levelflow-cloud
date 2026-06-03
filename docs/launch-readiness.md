# LevelFlow Launch Readiness

## Current Production Surface

- Frontend: GitHub Pages at `https://windwardline.github.io/levelflow-cloud-app/`.
- Auth and database: Supabase project `usrtpoftuvhpmyhlhqlg`.
- Market data: Supabase Edge Function `market-data`, backed by Massive.com key label `LevelFlow2.0.0`.
- Advisory analyzer: Supabase Edge Function `trade-analyzer`, using Massive.com daily bars, E8 account rules, news blackout records, correlation filtering, limit-order-only outputs, and RLS-owned inserts.
- News ingestion: Supabase Edge Function `news-calendar`, scheduled hourly through `pg_cron` and `pg_net`.
- E8 automation: database cron `levelflow-e8-due-jobs`, checking CE(S)T every minute and running due drawdown reset, Signature closure, weekend pending-order cleanup, spread protection, and outcome review jobs.
- Deployment automation: `.github/workflows/deploy.yml`.

## Private Beta Gate

- Real user email login: needs a real OTP or magic-link confirmation from the account owner.
- Onboarding persistence: temporary-user QA passed for account insert and load; real-user test still needs the email login step.
- Legal pages: `risk-disclaimer.html`, `privacy.html`, and `terms.html` are published under `/legal/`.
- CORS: Edge Functions restrict browser CORS to `https://windwardline.github.io` and local development origins.
- Custom domain: not configured. If desired, choose a domain such as `app.windwardline.com`, configure DNS, then add it in GitHub Pages and Supabase Auth redirect URLs.
- Massive plan: current key returns delayed data and does not authorize every configured index symbol. Visible launch options are limited to currently authorized symbols.

## Full Launch Gate

- Economic calendar provider key is still required. Add either `FMP_API_KEY` or `FINNHUB_API_KEY` as a Supabase secret and GitHub Actions secret.
- Supabase Free/Nano is acceptable for private beta load testing, but full launch should move to Pro before external users depend on uptime, log retention, and email branding.
- TradeLocker execution remains intentionally out of scope. LevelFlow is advisory-only until a separate execution integration and legal review are completed.
- Automated deployment secrets are configured for source build, Supabase function deploys, and Pages artifact publishing. If any token is revoked, update the matching GitHub Actions secret.
- Legacy local Supabase CLI token can be revoked after no more local CLI work is needed.
