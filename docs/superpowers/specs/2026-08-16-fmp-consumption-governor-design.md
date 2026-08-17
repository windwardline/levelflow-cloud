# Levelflow — The FMP consumption governor (§21)

Owner-ordered 2026-08-16, during the FMP blackout that began 2026-08-13.
The instruction of record: *"I need to stop absorbing the headroom as soon
as it is available... And, I need to not have FMP limits breached on
back-end tasks. Ever."*

**Authority.** The measured figures below come from the live minute bank
(`.minute-bank`, 2026-08-16) and the FMP published plan table. Where a
figure is an estimate, it says so and gives its method. The account's plan
is Ultimate: **150 GB per trailing 30 days, 3,000 API calls per minute**
(owner, 2026-08-16).

The precedence rule of `fmp-bandwidth-allowance` binds and is restated as
§21c: the minute bank is the only FMP consumer whose loss is permanent and
dated, so it never yields.

**One consumer was removed rather than governed.** The Windward Capital
division site held an FMP key and served a live quotes wall whose cache
never hit, costing ~19.4 GB per 30 days for every open browser tab. On
2026-08-16 the owner retired the division: site, Vercel project, DNS
record, GitHub repository, and Koalendar booking page all deleted. It is
recorded here because it was the second-largest exposure in the first
draft of this spec, and because deleting a consumer outranks metering one.

---

## §21a. What FMP actually meters

FMP bills **bytes over a trailing 30-day window**. Not requests, not
calendar months. The published ceilings are Free 500 MB, Starter 20 GB,
Premium 50 GB, Build 100 GB, Ultimate 150 GB, Enterprise 1 TB+.

**The tier is not a budget artifact and is not up for reduction** (owner,
2026-08-16). Ultimate buys more data and faster data, not merely a larger
ceiling; the owner would raise it before lowering it. Steady-state
consumption near 2% of the allowance is therefore not a downgrade signal,
and no measurement in this design should be read as an argument for one.
The ledger exists to prevent an outage, never to justify a smaller plan.

**FMP exposes no usage endpoint.** Consumption is visible only on the web
dashboard. This single fact settles the architecture: nothing can be told
how much allowance remains, so anything that governs consumption must
measure it, and measuring means sitting in the data path and weighing the
responses. An advisory ledger that consumers update by hand cannot work,
because the consumer that skips it is invisible.

The 3,000-calls-per-minute ceiling is not a real constraint for any
Levelflow workload. The heaviest run in the system issues 97 requests. No
part of this design limits request rate.

## §21b. The consumers, weighed

Five consumers share one key across three runtimes. Bytes per 30 days:

| Consumer | Runtime | Bytes / 30d | Share |
|---|---|---|---|
| Replay sweeps | local Node, ad-hoc | exhausted the plan in days | ~100% |
| Minute bank | local Node, launchd | ~2.2 GB (est.) | 1.5% |
| news-calendar + outcome-sync | Supabase Edge, hourly | ~1.2 GB (est.) | 0.8% |
| trade-analyzer | Supabase Edge, user-facing | usage-dependent | — |
| E2E at deploy | GitHub Actions | bounded, small | — |

**Bank method.** Measured: 110 bytes/bar for BTCUSD, 102 for EURUSD as
stored JSONL. Wire JSON repeats field names, so ~150 bytes/bar. Each run
re-pulls every symbol's full ~3-day window regardless of what is new;
average window ~2,500 bars across 97 symbols is ~36 MB per run, twice
daily.

**The risk is not spread evenly, and it never was.** With Capital gone,
ad-hoc sweeps are essentially the entire remaining exposure. Every
scheduled back-end job in the system together is 0.8% of the plan. The
class that caused the outage is the class no review gates.

## §21c. Precedence

The minute bank never yields. FMP serves 1-minute bars about three days
deep, so a gap wider than that is unrecoverable at any price. Every other
consumer is re-runnable, and therefore subordinate.

Precedence is expressed as a **reservation**, not a queue. The bank's
share is subtracted from the plan before any other consumer sees a budget.
The bank does not compete for it and cannot be refused.

Reservation: **10 GB per 30 days**, against a measured need of ~2.2 GB.
The margin absorbs roster growth and re-pull churn without revisiting the
number.

## §21d. The chokepoint

A Cloudflare Worker holds the only copy of the real FMP key and exposes an
FMP-shaped surface. Per request: identify the caller, check its ceiling,
forward, **measure the response bytes**, append to the ledger, return.

**Why not a Supabase Edge Function, now that only one repo consumes FMP.**
The removal of the Capital site retired the cross-repo argument, and a
Supabase-native proxy would be materially simpler — existing platform,
existing deploy pipeline, a Postgres ledger. It fails on isolation.
Supabase function secrets are **project-scoped**, not per-function:
`deploy.yml:135` sets them with `supabase secrets set --project-ref`, so
every function in the project shares one environment. A proxy function and
`trade-analyzer` would both hold `FMP_API_KEY`, and the chokepoint would
choke nothing — bypass would remain one line of code away, enforceable
only by a CI pin on call sites. A Worker puts the key on a different
platform, where Supabase functions cannot read it at all.

That is the whole remaining justification for the extra platform, and it
is load-bearing. If Supabase ships per-function secrets, this decision
should be revisited.

Callers authenticate with per-consumer credentials. A credential carries a
class, and a class carries a ceiling:

| Class | Members | Ceiling / 30d |
|---|---|---|
| Interactive | trade-analyzer | 50 GB, borrows first (§21f) |
| Ad-hoc | sweeps, probes, verification scripts | **50 GB** |
| Machine-paced | news-calendar, outcome-sync | 10 GB |
| CI | E2E at deploy | 5 GB |
| Reserved | minute bank (§21g) | no ceiling — 10 GB reserved |

Ceilings plus the reservation commit 125 GB of 150 GB. The unallocated
25 GB is not slack to be spent; it is the buffer the interactive class
borrows from under §21f before any user is refused.

**The ad-hoc ceiling is the feature.** That class caused this outage, and
it is the one class no code review gates — someone types
`tsx scripts/replay-sweep.ts` and nothing between that command and FMP can
say no. Fifty gigabytes is a large research budget and a third of the plan.

## §21e. The ledger

An append-only D1 table: `(ts, consumer, class, endpoint, bytes, outcome)`.
Enforcement sums the trailing 30 days per class. At ~1,000 requests a day
the table holds ~30,000 rows per window, which sums in milliseconds.

Append-only, because the ledger is also the audit trail. When an allowance
is next exhausted, the question "what spent it" must have an answer that
does not depend on anyone having been watching.

## §21f. Refusal, and what a 429 means

When a class exceeds its ceiling the proxy refuses with a distinct status
and a body naming the class and its remaining budget. Refusals are
recorded with `outcome = 'refused'`, so a starved consumer is visible in
the same place as a spending one.

**Refusing the interactive class is a product outage, not a budget
saving.** It is therefore treated differently from every other class.
Interactive borrows the unallocated 25 GB of §21d before it is refused at
all, and it is the last class refused under any circumstance. When it is
finally refused, the desk degrades visibly — the analyzer says the data is
unavailable — rather than failing a request silently. A ceiling that
throttles the product without saying so would be the same silent failure
this spec exists to prevent.

**A quota 429 is not transient, and no consumer may retry it.**
`scripts/bank-minute-bars.ts` currently treats 429 as retryable
(`isRetryable`, five attempts across 30 seconds of backoff). Against a
per-second rate limit that is correct. Against a depleted 30-day
allowance it is five guaranteed failures, and during the 2026-08-13
blackout it produced roughly 970 futile requests a day. The distinction
the code cannot see is whether the resource replenishes in seconds or in
weeks; the proxy's refusal body states which, and consumers branch on it.

## §21g. The bank's exemption, and the duty that comes with it

The minute bank keeps the real key and does not call the proxy.

This is deliberate and it inverts the usual instinct. The bank is the
consumer being protected; routing it through a new service would add a
failure mode to the one path whose loss is permanent and unrecoverable. A
proxy outage must never be able to cost minute bars.

In exchange the bank **reports**: after each run it posts its measured
byte count to the ledger as `class = 'reserved'`. Accounting, never
enforcement. A failed report never blocks banking.

**A missing report is an error in its own right.** An absent row makes the
ledger undercount, which delays every threshold in §21h — a silent failure
that presents as calm. The reconciler therefore asserts that the bank has
reported within the last 36 hours, and fails when it has not. Absence of
data is not evidence of low consumption.

## §21h. Surfacing

A daily GitHub Actions job reads the ledger and **fails the workflow**
when trailing-30-day consumption crosses 70% of the 150 GB plan, when any
class crosses 90% of its own ceiling, or when the bank's report is stale
per §21g. A red run notifies through GitHub.

**The job must prove it ran.** GitHub disables scheduled workflows after
60 days of repository inactivity, silently. A surfacing layer that can
stop without saying so is not a surfacing layer. The job therefore writes
a heartbeat on every run, and the check asserts the previous heartbeat is
recent — so a workflow that stopped firing fails the next thing that looks,
rather than reporting nothing forever.

This corrects a defect this work uncovered.
`levelflow-sync-watchdog` has written its errors into `analyzer_events`
since July, and **nothing reads that table** — no alert, no webhook, no
view. The watchdog exists because "cron fired on time, pg_net recorded
401s nobody read." It reproduced that bug one layer up. No part of this
design reports into a table as its only surfacing path.

The pre-existing `analyzer_events` surfacing gap is named here and left
open. Fixing it properly means deciding how Levelflow alerts in general,
which is not this spec.

## §21i. What this design does not build, and why

**No coupling between the parking gate and the scheduled crons.** Designed
in full on 2026-08-16 and rejected on measurement. It would pause
`levelflow-news-calendar-sync` and `levelflow-outcome-sync` while the desk
is parked, at a cost of a singleton table, a `SECURITY DEFINER` function,
deploy-time propagation with read-back verification, and a daily CI
reconciler — to protect 0.8% of the plan. §17j and §17p are untouched, and
`PARKING_GATE` stays the one line in git that §17p describes. The
starvation-yield of §21j Phase 1 covers the case that mattered, at a
fraction of the cost.

**No rate limiting.** 3,000 calls a minute against a 97-request run.

**No backfill or catch-up anywhere.** A consumer that was refused resumes
at its next natural run. Recovering skipped work would spend the very
budget the refusal protected.

## §21j. Sequence

The proxy cannot beat the current blackout, and the phasing says so
plainly rather than implying otherwise.

**Phase 1 — precedence during the starvation tail.**
1. **Starvation-yield.** The bank publishes its outcome; the scheduled
   consumers stand down while it is starved and resume when it succeeds.
   This is the one measure that matters *now*. At full allowance the
   scheduled jobs are 0.8% and beneath notice, but headroom returns as a
   trickle, and against a day's trickle their ~40 MB competes directly
   with the bank's ~73 MB. The denominator, not the consumer, is what
   changed.
2. `scripts/bank-minute-bars.ts`: stop treating a quota 429 as retryable,
   and preflight one cheap request before walking the roster.
3. Ad-hoc scripts declare an expected byte cost at their shared entry
   point and refuse to start without one.

Phase 1 needs no new infrastructure. **It does not deliver "ever."** Item 3
is a guard, not a gate: a script that bypasses the shared entry point
bypasses the declaration with it. Only §21d's chokepoint makes the ad-hoc
class genuinely unable to overspend, because only the chokepoint holds the
key.

**Phase 2 — the proxy.** Worker, ledger, ceilings, refusal semantics,
daily CI surfacing with heartbeat.

**Phase 3 — migration.** Move trade-analyzer, the two crons, the local
scripts, and CI onto proxy credentials. Rotate the real key. **Only at the
end of Phase 3 does the guarantee hold** — until then, any consumer still
holding the real key is invisible to the ledger, and the ceilings stop
summing to a real bound. Phases 1 and 2 are risk reduction. Phase 3 is the
promise.

## §21k. Costs and open questions

**A new always-on dependency in front of production analyzer traffic.** If
the Worker is down, the desk's analyzer degrades. The bank is exempt by
§21g; the desk is not. This is the price of enforceability.

**Enforcement is automatic; calibration is not.** The proxy refuses with
nobody present. Someone still sets the ceilings, reads the dashboard once
to validate them, and answers a red build. A budget nobody revisits is a
budget that is wrong.

**The byte estimates are estimates.** Every figure in §21b except the
per-bar measurements is derived, not observed. The FMP dashboard shows
true consumption and should be read once before the ceilings in §21d are
committed. If the real numbers differ materially, the ceilings change and
this section records that they did.

**Nothing here speeds up the current blackout.** The allowance drains by
time. The sweeps that exhausted it age out of the trailing window around
2026-09-12. Every consumer above is refused until then, and minute bars
from 2026-08-13 15:26 onward are already permanently lost.
