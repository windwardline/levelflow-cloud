# LevelFlow Security Hardening

## Cloudflare response headers

Apply these headers to `https://levelflow.windwardline.com/*` with a Cloudflare Response Header Transform Rule. The `levelflow.windwardline.com` DNS record must remain proxied through Cloudflare; DNS-only records bypass response-header transforms.

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cloudflareinsights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

This app is hosted from GitHub Pages behind Cloudflare, so checked-in `_headers` files are not sufficient. The Cloudflare zone rule is the enforcement point.

## Authenticated E2E tests

The `npm run test:e2e` suite uses a dedicated Supabase test user when these environment variables are present:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `LEVELFLOW_E2E_EMAIL`
- `LEVELFLOW_E2E_PASSWORD`

When the test-user variables are absent, Playwright starts the local app and reports the authenticated suite as skipped rather than failing. This keeps routine local and CI checks deterministic while still allowing full signed-in browser verification when credentials are configured.

The test user should be a normal authenticated user with no elevated privileges and no production-only personal data.
