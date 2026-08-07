# Levelflow Cloud — operating contract

Operating contract for AI work in this repo; the global `~/AGENTS.md` still applies. Levelflow is disciplined market review and limit-order setup generation on Supabase — auth, RLS-owned tables, Edge Function analyzer. Live at levelflow.windwardline.com. It analyzes; it never places trades.

## The law of the specs

§-numbered specs are binding, amended through owner rulings: `docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md` (distilled operative text governs where prose is narrower, per its own preamble) over `2026-07-30-levelflow-desk-design.md` and `2026-08-02-broker-sizing-governor-design.md`. Most test files cite § sections — read the section before touching its tests. Engine state of record: `docs/trade-model.md`. Contrast rules: `docs/design/contrast.md`, enforced by `tests/contrast.test.ts`.

**Start here: `docs/HANDOFF.md`** — the total state of record. What is live, what is parked and how to unpark it, the approvals already given, the findings verified as non-problems, and the full ordered sequence. Read it before re-deriving anything. It is tracked in git deliberately: the previous handoff lived in a gitignored worktree and was destroyed when that worktree was removed.

## Stack — do not substitute without flagging

Vite 8 + React 19, Tailwind v4, @supabase/supabase-js, lightweight-charts. TypeScript 6, ESLint 10, tests on node:test via tsx (not vitest), Playwright for E2E. Node ≥24, ESM only.

## Commands

`npm run dev` · `npm test` (node:test via tsx) · `npm run check` (typecheck — there is no `typecheck` script) · `npm run lint` (zero warnings) · `npm run check:migrations` · `npm run check:bundle` · `npm run build` · `npm run test:e2e`

## Gates — CI in order

`npm ci` → check → lint → check:migrations → `npm audit --audit-level=high` → test → build → check:bundle. E2E runs at deploy time only (`deploy.yml`), which also polls production security headers and fails on any `unsafe-inline`. A parallel `security.yml` (PRs, pushes, weekly cron; a daily cron runs only the Headers live probe) gates Semgrep, secret scan, and dependency scan; the Headers live job asserts the seven production headers on push and daily, complementing `deploy.yml`'s deploy-time poll. An advisory Claude review runs on every same-repo PR via `claude-review.yml`, which deliberately calls the fleet reusable at `@main` — one merge updates every repo. It activates only when the `ANTHROPIC_API_KEY` secret is present; fork PRs never receive secrets, so they skip it by security design. `retry-infra-failures.yml` re-runs a workflow that died on GitHub's infrastructure, capped at two attempts. Every required workflow carries `workflow_dispatch`, because a check suite that was never created cannot be re-run — `docs/ci-recovery.md` holds the diagnosis and the remedy for each failure mode.

## Laws

- `tsconfig.tests.json` lists Edge Function modules as an explicit file list to exclude Deno-global files. Never widen it to a glob — Vercel type-checks the whole graph, so a test type error fails production.
- Bundle budget: `dist/assets` ≤80 KB per `.css`, ≤230 KB per `.js` (`scripts/check-bundle-budget.mjs`); the manualChunks in `vite.config.ts` exist to hold it.
- Migrations match `^\d{14}_[a-z0-9_]+\.sql$`, unique and strictly increasing; SECURITY DEFINER additions need the reviewed allowlist in `scripts/check-migrations.mjs`.
- Playwright project order (workspace → visual-proof → analyzer-abuse) is serial and load-bearing: one shared E2E user against per-user analyzer rate limits. `public-auth` runs on dev and built preview.
- Env split: the browser sees only `VITE_*`; service-role and API keys are server/Edge-only. CSP `style-src` is `'self'` plus one sha256 — never `unsafe-inline`.
- `trade_setups` and `trade_outcomes` are **engine-written, client-read**. `authenticated` holds `select` only; every write runs on the service role. Global learning reads both tables unscoped by user and feeds `confidence_adjustment` into scoring for everyone, so a client write grant on either one lets any account set what every operator is told to trade. `tests/securityHardening.test.ts` pins the revoke and the admin call sites in both directions.
- Frontend that depends on a new migration lands one push after the migration — Vercel builds independently of `deploy.yml`.
