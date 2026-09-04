# Levelflow Cloud — operating contract

Operating contract for AI work in this repo; the global `~/AGENTS.md` still applies. Work here follows the CONVERGE cycle and delivery discipline in `FLEET.md` (windwardline/windwardline) — find → refute → verify yourself → fix → re-rank → test → update → report; enumerate the gates rather than counting them, stage explicit paths, validate before mutating, preserve standing claims, derive populations rather than curating them, and never let a harness failure read as the subject refusing. `FLEET.md` governs where it and this summary differ. Levelflow is disciplined market review and limit-order setup generation on Supabase — auth, RLS-owned tables, Edge Function analyzer. Live at levelflow.windwardline.com. It analyzes; it never places trades.

## The law of the specs

§-numbered specs are binding, amended through owner rulings: `docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md` (distilled operative text governs where prose is narrower, per its own preamble) over `2026-07-30-levelflow-desk-design.md` and `2026-08-02-broker-sizing-governor-design.md`. Most test files cite § sections — read the section before touching its tests. Engine state of record: `docs/trade-model.md` — **but every calibration figure in it is invalid** (the 2026-08-11 clock defect); read `docs/research/remediation-program-2026-08-11.md` before trusting or citing any expectancy, fill rate, or derived cell. Contrast rules: `docs/design/contrast.md`, enforced by `tests/contrast.test.ts`.

**Start here: `docs/HANDOFF.md`** — the total state of record. What is live, what is parked and how to unpark it, the approvals already given, the findings verified as non-problems, and the full ordered sequence. Read it before re-deriving anything. It is tracked in git deliberately: the previous handoff lived in a gitignored worktree and was destroyed when that worktree was removed.

## Stack — do not substitute without flagging

Vite 8 + React 19, Tailwind v4, @supabase/supabase-js, lightweight-charts. TypeScript 6, ESLint 10, tests on node:test via tsx (not vitest), Playwright for E2E. Node ≥24, ESM only.

## Commands

`npm run dev` · `npm test` (node:test via tsx) · `npm run check` (typecheck — there is no `typecheck` script) · `npm run lint` (zero warnings) · `npm run check:migrations` · `npm run check:bundle` · `npm run build` · `npm run test:e2e`

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
- `vercel.json` carries an `ignoreCommand` running `scripts/vercel-ignore-build.sh`: exit 0 skips a deployment, exit 1 builds it. Vercel bills Build CPU Minutes per deployment and the charge is fixed per-deploy overhead rather than build duration — the build runs in 8-15s, yet each deploy billed roughly 8 CPU-minutes across Aug 3 - Sep 2. This repo is the fleet's heaviest deployer, so the lever is worth the most here. It skips only when EVERY changed path is `docs/`, `.github/`, `sweeps/` or `*.md`; a deployable path, an unreadable diff, a missing parent commit, a non-git checkout and an empty file list all build, because a wrong skip ships stale code invisibly while a wrong build costs a fraction of a cent. `tests/`, `supabase/` and `scripts/` build by design — the whole-graph type-check note above is exactly why. `scripts/vercel-ignore-build-test.sh` runs thirteen cases against real git repositories and proves the catch-all is load-bearing by deleting it.
- **Never copy this repo into scratch by hand.** Use `scripts/scratch-clone.sh <dest>` — the fleet helper, byte-identical across every repo and blob-verified by the conformance checker. A `cp -R` or a `git clone` of the working tree carries `.calibration-cache` with it: on 2026-08-25 a fan-out left 23 copies under `/private/tmp`, 148.8 GiB of a cache no test reads, alongside 20 copies of a live `.env.local`. The helper asks git what to exclude rather than keeping its own list, because a private list rots unnoticed until a copy is already gigabytes.
- **`--no-git` costs four test files.** `scripts/scratch-clone.sh` ships `.git` by default; `--no-git` opts out and is right for a copy that will not shell out to git. Four test files here do — `emptyCorpusRefusals`, `feedSource`, `securityHardening` and `scratchClone` itself — and without `.git` they fail with `Command failed: git status --porcelain` and `git ls-files -z`, 19 failures that read as missing DATA rather than a missing directory. Those 19 are why the fleet inverted the default (windwardline#84). `tests/scratchClone.test.ts` pins the set, so a fifth git-dependent test fails there and this line gets updated rather than the next agent rediscovering it. Measured: 8.2 GB working tree → 171 MB by default, 12 MB with `--no-git`, and the suite is 2734/0 from a copy holding no `.calibration-cache` at all.

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
