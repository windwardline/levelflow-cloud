# LevelFlow Launch Readiness

## Current Production Surface

- Frontend: GitHub Pages custom domain at `https://app.windwardline.com/` with the legacy GitHub Pages URL retained as a fallback during DNS propagation.
- Auth and database: Supabase project `usrtpoftuvhpmyhlhqlg`.
- Market data: Supabase Edge Function `market-data`, backed by Massive.com key label `LevelFlow2.0.0`.
- Advisory analyzer: Supabase Edge Function `trade-analyzer`, using FMP daily/intraday bars, a multi-strategy committee, E8 account rules, news blackout records, session guardrails, correlation filtering, limit-order-only outputs, and RLS-owned inserts.
- News ingestion: Supabase Edge Function `news-calendar`, scheduled hourly through `pg_cron` and `pg_net`, targeting FMP's current stable economic-calendar endpoint.
- E8 automation: database cron `levelflow-e8-due-jobs`, checking CE(S)T every minute and running due drawdown reset, Signature closure, weekend pending-order cleanup, spread protection, and outcome review jobs.
- Deployment automation: `.github/workflows/deploy.yml`.

## Private Beta Gate

- Real user email login: needs a real OTP or magic-link confirmation from the account owner.
- Onboarding persistence: temporary-user QA passed for account insert and load; real-user test still needs the email login step.
- Legal pages: `risk-disclaimer.html`, `privacy.html`, and `terms.html` are published under `/legal/`.
- CORS: Edge Functions restrict browser CORS to `https://app.windwardline.com`, `https://windwardline.github.io`, and local development origins.
- Custom domain: `app.windwardline.com` is the intended production URL. DNS, GitHub Pages, and Supabase Auth redirect settings must all include this host.
- Provider access: current FMP key allows some daily historical data but blocks intraday and economic-calendar endpoints until the subscription is upgraded. Current Massive key still limits configured index symbols for the separate chart feed.

## Full Launch Gate

- Economic calendar provider: FMP is selected through `ECONOMIC_CALENDAR_PROVIDER=fmp`; `FMP_API_KEY` is configured, but the current FMP subscription returns `402 Restricted Endpoint` for the economic-calendar API. Full launch needs an FMP plan that includes that endpoint.
- Supabase Free/Nano is acceptable for private beta load testing, but full launch should move to Pro before external users depend on uptime, log retention, and email branding.
- TradeLocker execution remains intentionally out of scope. LevelFlow is advisory-only until a separate execution integration and legal review are completed.
- Automated deployment secrets are configured for source build, Supabase function deploys, and Pages artifact publishing. If any token is revoked, update the matching GitHub Actions secret.
- Legacy local Supabase CLI token can be revoked after no more local CLI work is needed.
