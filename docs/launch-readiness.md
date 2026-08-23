# Levelflow Launch Readiness

## Current Production Surface

- Frontend: Vercel builds and deploys from this repo on push to `main`, serving `https://levelflow.windwardline.com/` through a DNS-only Cloudflare record.
- Auth and database: Supabase project `usrtpoftuvhpmyhlhqlg`.
- Market data: Supabase Edge Function `market-data`, backed by the FMP key configured in GitHub/Supabase secrets.
- Market analyzer: Supabase Edge Function `trade-analyzer`, using daily/intraday bars, scheduled-event records, session rules, correlation filtering, limit-only outputs, and RLS-owned inserts.
- News ingestion: Supabase Edge Function `news-calendar`, scheduled hourly through `pg_cron` and `pg_net`, targeting FMP's current stable economic-calendar endpoint.
- Outcome refresh: the analyzer force-refreshes pending setup outcomes every time a user shows the Desk or Insights surface (mount and re-navigation alike), not only on history load or a new setup (spec §8).
- Deployment workflow: `.github/workflows/deploy.yml`.

## Private Beta Gate

- Parking soft gate: `src/lib/parkingGate.ts`'s `PARKING_GATE` flag. **CLOSED
  since the re-park of 2026-08-07 (`PARKING_GATE = true`, spec §17p)** — this
  file said "opened 2026-08-01" for sixteen days after that, which is the
  failure the reopen gate exists to prevent, in a document whose job is to say
  what gates launch. Corrected 2026-08-23.
  While closed, signed-out visitors get the React `ParkingScreen` component,
  never `public/construction.html`; that static twin is preserved as the
  reusable layout for a future pause, but nothing in `vercel.json` ever serves
  it directly. Open it by flipping `PARKING_GATE` to false — at which point the
  `/?enter` session-scoped bypass becomes a no-op.
  **Reopening is NOT just the flag.** `docs/HANDOFF.md` ranks R6 as pre-reopen
  and records what a reopen still owes: reader-facing figures still sourced
  from the corpus the 2026-08-11 programme condemned, a live magic-link
  delivery that no test exercises, and the ordering hazard that Vercel builds
  on push while `deploy.yml` runs separately. Read that before flipping this.
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
