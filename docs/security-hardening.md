# Levelflow Security Hardening

## Production response headers

These headers are enforced by the checked-in `vercel.json` at the repo root; Vercel builds and deploys the frontend directly from this repo. `levelflow.windwardline.com` is a DNS-only Cloudflare record pointing at Vercel, so Cloudflare transform rules do not apply — `vercel.json` is the enforcement point.

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'sha256-3pRED1tOXas1FXFoPb9TGCjmYe9XQsmO9OV23khV2nY='; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

The CI deploy workflow verifies these headers against the live site after every deploy (`Verify production security headers` step), so a regression in `vercel.json` fails the pipeline.

### The one `style-src` hash

`style-src` is `'self'` plus a single content hash and nothing else. `lightweight-charts` renders on canvas and sets every other style through CSSOM, which CSP does not police, but its TradingView attribution widget builds a real `<style>` element and assigns its text — the one `document.createElement("style")` in the whole bundle. Under `style-src 'self'` that element landed in the DOM with no stylesheet attached, which cost the attribution link both its `position: absolute` and its fill (the SVG's `--fill`/`--stroke` are declared in that same blocked rule): it rendered as an invisible 35×16 box inside the chart's layout, and logged a violation on every authenticated page.

The library's licence asks for the attribution notice and a link to `tradingview.com` on a page available to users, and that widget is what satisfies it, so the fix admits the stylesheet rather than disabling the widget. A hash is an allowlist of one: it permits that byte-identical stylesheet and nothing more. `'unsafe-inline'` is still absent, and `'unsafe-hashes'` is deliberately absent too — inline style *attributes* stay refused exactly as before.

`tests/securityHardening.test.ts` recomputes the hash from the installed `lightweight-charts` and fails if `vercel.json` disagrees, so a version bump that re-values the stylesheet is a red build rather than the same silent violation returning. The deploy gate additionally asserts that production serves `style-src 'self' 'sha256-…'` and no `unsafe-inline`.

## Authenticated E2E tests

The `npm run test:e2e` suite uses a dedicated Supabase test user when these environment variables are present:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `LEVELFLOW_E2E_EMAIL`
- `LEVELFLOW_E2E_PASSWORD`

When the test-user variables are absent, Playwright starts the local app and reports the authenticated suite as skipped rather than failing. This keeps routine local and CI checks deterministic while still allowing full signed-in browser verification when credentials are configured.

The test user should be a normal authenticated user with no elevated privileges and no production-only personal data.
