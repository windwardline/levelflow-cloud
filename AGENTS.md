# Levelflow Cloud — operating contract

Operating contract for AI work in this repo; the global `~/AGENTS.md` still applies. Work here follows the CONVERGE cycle and delivery discipline in `FLEET.md` (windwardline/windwardline) — find → refute → verify yourself → fix → re-rank → test → update → report; enumerate the gates rather than counting them, stage explicit paths, validate before mutating, preserve standing claims, derive populations rather than curating them, and never let a harness failure read as the subject refusing. `FLEET.md` governs where it and this summary differ. Levelflow is disciplined market review and limit-order setup generation on Supabase — auth, RLS-owned tables, Edge Function analyzer. Live at levelflow.windwardline.com. It analyzes; it never places trades.

## The law of the specs

§-numbered specs are binding, amended through owner rulings: `docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md` (distilled operative text governs where prose is narrower, per its own preamble) over `2026-07-30-levelflow-desk-design.md` and `2026-08-02-broker-sizing-governor-design.md`. Most test files cite § sections — read the section before touching its tests. Engine state of record: `docs/trade-model.md` — **but every calibration figure in it is invalid** (the 2026-08-11 clock defect); read `docs/research/remediation-program-2026-08-11.md` before trusting or citing any expectancy, fill rate, or derived cell. Contrast rules: `docs/design/contrast.md`, enforced by `tests/contrast.test.ts`.

**Start here: `docs/HANDOFF.md`** — the total state of record. What is live, what is parked and how to unpark it, the approvals already given, the findings verified as non-problems, and the full ordered sequence. Read it before re-deriving anything. It is tracked in git deliberately: the previous handoff lived in a gitignored worktree and was destroyed when that worktree was removed.

## Stack — do not substitute without flagging

Vite 8 + React 19, Tailwind v4, @supabase/supabase-js, lightweight-charts. TypeScript 6, ESLint 10, tests on node:test via tsx (not vitest), Playwright for E2E. Node ≥24, ESM only.

## Commands

`npm run dev` · `npm test` (node:test via tsx) · `npm run check` (typecheck — there is no `typecheck` script) · `npm run lint` (zero warnings) · `npm run check:migrations` · `npm run check:bundle` · `npm run build` · `npm run test:e2e`

**Type-checking the Edge Functions needs Deno and one flag.** `tsconfig.tests.json`
lists those modules as an explicit file list, so `npm run check` covers them only as
far as that list reaches, and the Deno-global files sit outside it. The invocation
that works is `deno check --no-config <files>`; the bare `deno check` auto-discovers
`tsconfig.app.json`, whose `baseUrl` is deprecated under TypeScript 6, and dies on
TS5101 before it type-checks anything. A reviewer found the bare command failing on
2026-09-14 and the working form was recorded nowhere, so a green claim could not be
reproduced:

```bash
deno check --no-config supabase/functions/trade-analyzer/*.ts supabase/functions/news-calendar/*.ts supabase/functions/_shared/*.ts
```

It is deliberately NOT a declared gate: CI runs no Deno step, and a `gate:` line
that shells out to a binary CI does not have would block every session on a
machine without it rather than failing where the code lands. Run it by hand when
a change touches an Edge module, and say so when claiming it green.

## Gates — CI in order

Every workflow this repository runs is named here by filename: `ci.yml`, `deploy.yml`,
`security.yml`, `claude-review.yml`, `retry-infra-failures.yml`, and
`dependabot-auto-merge.yml`.

`ci.yml` runs `npm ci` → check → lint → check:migrations →
`npm run audit:high` → test → build → check:bundle on pushes and pull
requests against `main`, plus `workflow_dispatch`, in one 15-minute Node 24 job with
npm caching. Its job id `build` is the required-check name, and a new commit cancels
the run in flight. E2E runs only at deploy time in `deploy.yml`. That workflow also
polls production security headers and refuses `unsafe-inline`; its E2E coverage block
names every test that stood down and why, and refuses an unexplained stand-down or one
above the ceiling in `tests/e2e/coverageReporter.ts`.

`security.yml` runs on pull requests, pushes, `workflow_dispatch`, a weekly full
sweep, and a daily dependency-and-headers sweep. Semgrep and secret scanning run on
every non-daily trigger. The unguarded dependency scan runs on every trigger because
its advisory database can change without a commit. Headers live runs on every
non-pull-request trigger and asserts the seven production headers. The required
Secret scan check also carries the SHA-pinned fleet `verify-action-pins` action as a
step. Every third-party `uses:` in a GitHub Actions workflow is pinned to a full
commit SHA with a trailing comment naming an immutable full tag that SHA actually
carries — `# v7.0.1`, never a floating major such as `# v7`.

An advisory Claude review runs through `claude-review.yml` on eligible same-repo PR
events when `github.event.pull_request.user.login` — the PR author, stable across
manual reruns — is not `dependabot[bot]` and `github.base_ref` equals
`github.event.repository.default_branch`. The caller deliberately uses the fleet
reusable at `@main`, so one merge updates every repo. Fork events and runs without
`CLAUDE_CODE_OAUTH_TOKEN` skip by security design. Reviews bill the owner's Claude
subscription, not Console credits.
`retry-infra-failures.yml` re-runs a workflow that died on GitHub's infrastructure,
capped at two attempts.

`dependabot-auto-merge.yml` merges nothing itself. On same-repository Dependabot PRs
against `main` under the `windwardline` owner, it first requires auto-merge to be
enabled and the base branch to carry at least one required status check; otherwise
`gh pr merge --auto` can degrade to an immediate merge. It then arms GitHub's native
auto-merge and leaves the ruleset as the only merge gate. It holds for a human — and
withdraws an auto-merge armed on an earlier push — on `no-automerge`, changed
maintainers, pre-1.0 packages, empty or unverifiable metadata, a major bump, or,
distinctly, an unrecognised update type. Major bumps receive `deferred-major` before
being held.

Dependabot groups npm production dependencies, npm development dependencies, and
GitHub Actions updates. `fetch-metadata` reports the highest semver change for the
entire grouped PR, so one held member holds the group; arming and holding operate on
the grouped PR, not an individual dependency. The lane mints a GitHub App token from
the `FLEET_AUTOMERGE_APP_ID` and `FLEET_AUTOMERGE_PRIVATE_KEY` **Dependabot** secrets
and degrades to `GITHUB_TOKEN` when they are absent. A Dependabot-triggered run cannot
read Actions secrets. The run summary names the credential used; a merge attributed
to the fallback token creates no push workflow run, so neither `deploy.yml` nor
`security.yml` fires. The job has no `name:`, so its check renders exactly
`dependabot-auto-merge`; it must never become required. The file is byte-identical in
every fleet repo that takes it and is fixed in the fleet, not here. Every required
workflow carries `workflow_dispatch`, because a check suite that was never created
cannot be re-run; `docs/ci-recovery.md` records the remedies.

## Laws

- **Profit is the measure; win rate is a result (amendment 39, 2026-08-27).** Success is net realized R. Nothing may publish, rank, gate, or learn on a frequency where the underlying money is knowable — where realized R exists it governs, and where it does not the surface refuses rather than substituting a count (§19e). A rate may sit BESIDE money, never instead of it, and never as a superlative. The ladder makes the two diverge: a banked partial is +0.20R to +0.40R against a −1.00R stop, so break-even is a range (0.46 to 0.83 by outcome mix, ~0.65 partial-heavy) and a market can win four in five while shrinking the account. Profit potential must exceed loss potential structurally and may NEVER be manufactured — stops and targets come from real structure and window feasibility, and widening a target or tightening a stop to improve a printed ratio is prohibited. Measured at the ruling: a full win pays 0.95R–1.20R against −1.00R, so a 1.6:1 gate ships as ~1:1 before costs. Closing that gap outranks any work that does not move it.
- `tsconfig.tests.json` lists Edge Function modules as an explicit file list to exclude Deno-global files. Never widen it to a glob — Vercel type-checks the whole graph, so a test type error fails production.
- Bundle budget: `dist/assets` ≤80 KB per `.css`, ≤230 KB per `.js` (`scripts/check-bundle-budget.mjs`); the manualChunks in `vite.config.ts` exist to hold it.
- Migrations match `^\d{14}_[a-z0-9_]+\.sql$`, unique and strictly increasing; SECURITY DEFINER additions need the reviewed allowlist in `scripts/check-migrations.mjs`.
- Playwright project order (workspace → visual-proof → analyzer-abuse) is serial and load-bearing: one shared E2E user against per-user analyzer rate limits. `public-auth` runs on dev and built preview.
- Env split: the browser sees only `VITE_*`; service-role and API keys are server/Edge-only. CSP `style-src` is `'self'` plus one sha256 — never `unsafe-inline`.
- `trade_setups` and `trade_outcomes` are **engine-written, client-read**. `authenticated` holds `select` only; every write runs on the service role. Global learning reads both tables unscoped by user and feeds `confidence_adjustment` into scoring for everyone, so a client write grant on either one lets any account set what every operator is told to trade. `tests/securityHardening.test.ts` pins the revoke and the admin call sites in both directions.
- Frontend that depends on a new migration lands one push after the migration — Vercel builds independently of `deploy.yml`.
- `vercel.json` carries an `ignoreCommand` running `scripts/vercel-ignore-build.sh`: exit 0 skips a deployment, exit 1 builds it. Vercel bills Build CPU Minutes per deployment and the charge is fixed per-deploy overhead rather than build duration — the build runs in 8-15s, yet each deploy billed roughly 8 CPU-minutes across Aug 3 - Sep 2. This repo is the fleet's heaviest deployer, so the lever is worth the most here. It skips only when EVERY changed path is `docs/`, `.github/`, `sweeps/`, `tests/`, `scripts/`, `supabase/` or `*.md`; a deployable path, an unreadable diff, a missing parent commit, a non-git checkout and an empty file list all build, because a wrong skip ships stale code invisibly while a wrong build costs a fraction of a cent. `tests/`, `scripts/` and `supabase/` moved to the skip side on 2026-09-14. Every tsconfig here sets `noEmit`, so the whole-graph type-check emits nothing and `dist` comes only from `vite build` resolving `index.html` through `src/`; nothing in `src/` imports from those three paths, so a commit confined to them deploys byte-identical output. It gives up a THIRD copy of the type-check — CI runs `npm run check` on every pull request and `deploy.yml` runs it again on push to main — and it removes one class of the line-81 hazard, since a tests-only type error can no longer fail a production deploy. A migration or Edge Function change that accompanies a shipped frontend change still builds: the predicate is all-or-nothing, and the test pins that with explicit mixed-commit cases. `vercel.json` stays deployable and must, because `deploy.yml` polls production for the headers it declares. `scripts/vercel-ignore-build-test.sh` runs twenty-five cases against real git repositories and proves two guards load-bearing by deleting each: the catch-all that marks an unknown path deployable, and the one that refuses to read an empty diff as nothing changed. Measured over the 96 commits on `main` since 2026-09-01: 32 skipped before, 83 after.
- **Postgres has an off-box copy, and it is proven by restoring it.** `public.analyzer_events` holds 328,841 rows of what this system DID — no provider re-serves that at any price — while `public.market_bars`, the only part the minute-bank mirror overlaps, holds 1,708. Supabase's seven daily physical backups live INSIDE the account a loss event takes, and PITR is a $100/month add-on deliberately off, so until 2026-09-14 the irreplaceable half of this database had exactly one custodian. `scripts/ops/backup-postgres-offbox.sh` runs daily at 06:40 through `~/.local/bin/wl-repo-script`, which resolves it from `origin/main` rather than the working tree — `~/Projects` checkouts are shared and a plist naming a working-tree path runs whatever branch is out at 06:40; the dangerous shape is not the missing script (exit 127, loud) but the stale one, which runs a superseded version and exits 0 (ten minutes after Supabase's own ~06:30Z snapshot) and writes `windwardline-backups/levelflow-cloud/postgres/<YYYY>/<MM>/postgres-<YYYYMMDD>.dump.zst` — the same layout contract as the minute bank, 145 MB dumped to 13.4 MB at zstd -19, 37 seconds end to end. It derives pg_dump's major from the live server rather than pinning a path, so a Supabase upgrade fails by name instead of silently; it requires every table the server lists to appear as TABLE DATA in the archive, with exactly three named exclusions (`net._http_response`, `net.http_request_queue`, `realtime.messages` — extension-owned transient queues); and it verifies the remote object's checksum, not the upload's exit code. **Structure is not recoverability.** `scripts/ops/verify-postgres-restore.sh` pulls the newest archive back out of R2, restores it into a throwaway cluster and counts rows against live — 21 populated tables recovered on 2026-09-14, plus `cron.job`, `cron.job_run_details` and `vault.secrets` asserted present in the archive but unrestorable into a bare cluster, because pg_cron needs `shared_preload_libraries` and supabase_vault is not distributed. Vault's ciphertext survives; the key is Supabase's, so treat those two rows as needing re-issue rather than restore. Run the proof on the weekly cadence, never only the daily.
- **Backups live in two buckets, and only one of them forgets.** Dailies go to `windwardline-backups`: each writer keeps 60, and the bucket's `expire-backups-after-365-days` rule deletes every object a year after upload whatever its name, so the minute bank's name-protection of `20260823` holds against this repo's prune and not against R2. What must outlive a year goes to `windwardline-archives` through `scripts/ops/push-archive-offbox.sh`: no expiry, write-once, an indefinite bucket lock once the first pushes verify, and pruned by no script — both pruners refuse it by name, and `tests/archiveOffbox.test.ts` derives that from every file in `scripts/ops/`. An archive exists only once the script has streamed the object back, matched its md5 and restored it with `diff -rq` empty against the source; `rclone hashsum` on a multipart object reads metadata rclone wrote. Local data roots name a directory, never the home folder itself — `tests/opsDataRoot.test.ts` fails any ops script whose default lands there and names each dated exception it still carries. The register, the lock's state and the restore commands are in `docs/offbox-archives.md`.
- **Sign-in mail can fail by succeeding, and this repo cannot see it at the request path.** Magic links leave through Supabase GoTrue over Resend SMTP (`smtp.resend.com:465`, user `resend`, sender `Levelflow <login@windwardline.com>`, subject `Your Levelflow sign-in link`, `mailer_otp_exp` 900). Resend **accepts** a send to a suppressed address, records it `suppressed`, delivers nothing and returns success — so GoTrue reports no error, `requestMagicLink` returns `kind: "sent"`, and the operator is told to check an inbox nothing will reach, permanently, until a human clears the list. Unlike pathfinder, which owns its own send and checks `GET /suppressions/:email` first (`apps/web/src/lib/suppression.ts`), the browser here calls GoTrue directly and there is no interception point. **Do not "fix" this by putting a Resend key in an Edge Function**: reading suppressions requires a `full_access` key, and the fleet rule is that a key leaving the machine is `sending_access` scoped to one `domain_id` — a full-access key in a third party's secret store is a worse defect than the one it would close. The mechanism for this repo is the account-wide sweep `ops/resend-health.py` on the weekly cadence, which fails on any suppression. If request-path parity is ever wanted, the shape that respects the key rule is a Resend webhook on `email.bounced`/`email.complained` writing to a table here, checked locally before the send — no credential leaves the machine. Any auth-config PATCH still carries the FULL SMTP block: partial updates clear siblings and GoTrue silently falls back to its built-in mailer (tell: `mail_from` in auth logs), and it caches config ~5 minutes, so a live-send verification before that wait proves nothing.
- **A pinned job names its checkout, and no test reaches the provider.** Jobs run through `wl-repo-script` get `origin/main`'s code and none of the checkout's ignored data, so anything touching FMP must set `LEVELFLOW_CHECKOUT`: the usage ledger and circuit marker resolve through `scripts/checkoutState.ts`, and unset they read as untouched from a directory deleted on exit. The minute bank and the calibration-cache top-up have run this way since 2026-09-20; `docs/minute-bank.md` lists what each piece of the bank's data would otherwise have done, and the top-up adds a fourth: the sweep's cache is the relative `.calibration-cache`, so an unnamed run warms the roster from nothing into a directory deleted on exit. Its script passes `--cache-dir` explicitly and refuses a missing one. A test that executes a script which reads the keychain runs with `tests/support/noKeychain.ts` in its environment. On 2026-09-20 six runs without it fetched a full FMP roster each, about 244 MB, two of them into the production bank: a red test executes the code before the guard it is written for exists.
- **Never copy this repo into scratch by hand.** Use `scripts/scratch-clone.sh <dest>` — the fleet helper, byte-identical across every repo and blob-verified by the conformance checker. A `cp -R` or a `git clone` of the working tree carries `.calibration-cache` with it: on 2026-08-25 a fan-out left 23 copies under `/private/tmp`, 148.8 GiB of a cache no test reads, alongside 20 copies of a live `.env.local`. The helper asks git what to exclude rather than keeping its own list, because a private list rots unnoticed until a copy is already gigabytes.
- **`--no-git` costs five test files.** `scripts/scratch-clone.sh` ships `.git` by default; `--no-git` opts out and is right for a copy that will not shell out to git. Five test files here do — `emptyCorpusRefusals`, `feedSource`, `securityHardening`, `scratchClone` itself and `researchLinks` (the citation guard asks git which files are tracked) — and without `.git` they fail with `Command failed: git status --porcelain` and `git ls-files -z`, 21 failures (19 measured on windwardline#84's four, plus the guard's two on 2026-09-14) that read as missing DATA rather than a missing directory. Those failures are why the fleet inverted the default (windwardline#84). `tests/scratchClone.test.ts` pins the set, so a sixth git-dependent test fails there and this line gets updated rather than the next agent rediscovering it. Measured: 8.2 GB working tree → 171 MB by default, 12 MB with `--no-git`, and the suite is 2734/0 from a copy holding no `.calibration-cache` at all.

## Declared gates

The machine-readable gate set. `scripts/fleet-conformance.sh` requires this block
and the workspace done-gate hook runs every `gate:` line before a session may
finish, so what runs is what is written here rather than what a hook guessed from
`package.json`. Each key states its own boundary: `gate:` runs at session end and
must be local and quick; `release:` runs before a pull request and may be slow;
`cadence:` is scheduled or needs the live machine and is run by neither.

```fleet-gates
gate: npm run check
gate: npm run lint
gate: npm run check:migrations
gate: npm run audit:high
gate: npm test
gate: npm run build
gate: npm run check:bundle
gate: bash scripts/vercel-ignore-build-test.sh
release: npm run test:e2e
```
