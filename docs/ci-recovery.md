# Recovering CI when GitHub's infrastructure fails

Written from the 2026-08-06 Actions outage, which blocked three armed pull requests for
seven hours. Three different failures presented as one red PR, and each needed a
different remedy. Diagnose which one you have before reaching for a fix.

## Diagnose first

`gh pr checks` is not enough. It renders a `cancelled` conclusion as `fail`, and it says
nothing about a context that was never created. Ask three questions in order.

**Did the check suite exist?**

```bash
gh api repos/windwardline/levelflow-cloud/commits/<sha>/check-suites \
  -q '.check_suites[] | "\(.app.slug) \(.status) \(.conclusion) runs=\(.latest_check_runs_count)"'
```

A suite with `status=queued` and `runs=0` is a run record whose jobs were never created.
A missing `github-actions` suite means the webhook was dropped entirely.

**Which contexts does the ruleset actually require?**

```bash
gh api repos/windwardline/levelflow-cloud/rulesets/19863111 \
  -q '.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
```

**Are those contexts present and green on the head SHA?**

```bash
gh api "repos/windwardline/levelflow-cloud/commits/<sha>/check-runs?per_page=100" \
  -q '.check_runs[] | "\(.name) \(.conclusion)"'
```

## Remedies, by failure mode

| The run | The remedy |
|---|---|
| Ran and failed on infrastructure — `Failed to resolve action download info`, `Bad Gateway`, death at **Set up job** before checkout | `gh run rerun --failed`. `retry-infra-failures.yml` does this automatically, capped at two attempts |
| Started and was cancelled — *"The job was not acquired by Runner of type hosted even after multiple attempts"* | `gh run rerun`. The run exists; it lost its runner |
| Never created — no `github-actions` suite on the head SHA | `gh workflow run <file> --ref <branch>`. Dispatch bypasses the webhook path, which is what is broken |

Every required workflow therefore carries `workflow_dispatch`. `ci.yml` did not until this
outage, which made `build` the one required gate that could not be recovered by hand.

## What does not work

**Close and reopen the PR.** It re-fires `pull_request`, so it helps only when the event
was lost and webhook delivery has since recovered. During the throttle it produced nothing
on three attempts. It also clears auto-merge, which then has to be re-armed.

**A fresh push.** Same dependency on the same throttled path.

**`POST /check-suites/{id}/rerequest`.** Returns 404 for Actions-owned suites. The endpoint
serves third-party apps.

**`gh run cancel` on a stuck suite.** During the outage this answered *"Cannot cancel a
workflow run that is completed"* for a run the API simultaneously reported as `queued`.

## Deploy runs: severed never, skipped when superseded

Since 2026-08-09 the deploy concurrency group runs `cancel-in-progress: false` — a
deploy that has started finishes, because the cancel could land between `db push` and
`functions deploy`, leaving the database migrated and the functions on old code. Two
consequences for diagnosis:

- A deploy run that shows `cancelled` was replaced **while still queued** — GitHub keeps
  at most one pending run per group and never started it. Nothing was severed; the
  newest queued run deploys the tip.
- A deploy run that shows `skipped` was superseded **before it touched anything live**:
  a preflight job compares the run's commit to the branch tip and skips when a later
  commit owns the deploy. Skip, not fail — a superseded deploy is not an error.

The preflight also makes `gh run rerun` on an old deploy safe: it skips instead of
overwriting production with stale functions. To genuinely redeploy after an infra
failure, re-run the **latest** run or `gh workflow run deploy.yml --ref main` — a
dispatch runs on the tip, so preflight passes. `tests/securityHardening.test.ts` pins
`cancel-in-progress: false` here and `true` on the cheap workflows, in both directions.

## The pending-suite trap

A `queued` check suite with zero check runs blocks the merge even when every required
context is present and green on the head SHA — including contexts supplied by a later
`workflow_dispatch` run. The rollup reads `SUCCESS`, `mergeable` reads `MERGEABLE`, and
`mergeStateStatus` still reads `BLOCKED`.

The only reliable clear is a new head SHA, because suites attach to a commit. Force-push is
barred here, so that means an added commit. Prefer one that carries work the branch owes
anyway over an empty one.

## The standing lesson

The retry workflow catches runs that **failed**. It cannot catch runs that were never
**created** — nothing fires when nothing happened. `workflow_dispatch` on every required
workflow is the other half of the mechanism, and both belong in the fleet standard together.

## A commit message on `main` that is not true

`686d063` reads `docs: drop the retired third app from the magic-link audit` and states
`No behaviour change: this file is a dated research record`. It changed
`.github/workflows/deploy.yml`, `tests/e2e/coverageReporter.ts`, and two test files. The
docs change named in that message is a different commit, `49713ff`.

Two sessions worked one checkout. PR #542 was opened for the magic-link docs edit; the
same edit landed first through #544, and #542's branch was then reused for the deploy
E2E scope work. Nothing in the flow re-reads a PR's title against its final diff, so the
squash merge stamped the original title onto the new contents.

The commit message cannot be repaired — `main` is linear-history-enforced and force-push
is barred. PR #542's title and body now describe the real change and carry the
discrepancy explicitly. Reach the truth about `686d063` through the PR, not the log.

Two things follow. A squash title is written when a PR opens and read when it merges,
and the diff in between is unpinned — so re-read the title against the diff at merge
time, not at open time. And a branch is cheaper than it looks: reusing one for unrelated
work is what let a stale title outlive the change it described.
