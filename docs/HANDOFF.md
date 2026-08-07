# Levelflow handoff — 2026-08-07, 01:30 EDT

**This file is the total state of record.** It lives in `docs/` and is tracked in git,
which is a change from every previous version: the last one lived in a gitignored
worktree, and removing that worktree deleted it. It was recovered by replaying its own
write history out of the session transcript. That is not a recovery path anyone should
need twice, and it is why this file is here.

Rewritten, not appended. The shape of the work changed twice in the last day: the
coverage question closed, and the desk went dark on purpose.

---

## 1. Where things actually stand

### The desk is PARKED

`PARKING_GATE` is `true` (owner instruction, 2026-08-07). Signed-out visitors see the
§17j parking page; every session was invalidated — 3,570 sessions and 3,587 refresh
tokens to zero, accounts untouched at 13. Verified after: **zero sessions belonging to
any real user**; the only sessions that exist are the E2E account's, recreated by the
deploy pipeline itself.

Trade history was deliberately **not** wiped: **167 setups and 139 outcomes across
three real accounts**, unchanged. (Count totals with care — the E2E account's rows
appear and are swept on every deploy, so a raw `count(*)` reads differently depending
on when you take it. Group by user.)

**Reopening is one flag plus its tests.** Flip `PARKING_GATE` to `false`, invert the two
gate tests in `tests/e2e/public-auth.spec.ts`, return the four sign-in tests from
`/?enter` to `/`, and update the pin in `tests/parkingGate.test.ts`. Nothing else.
Spec §17p records it.

**The trap, learned the hard way:** the gate is consulted inside App's `!session`
branch, so it turns away arrivals and does **not** end visits. A park without the logout
step leaves every signed-in operator working behind a closed door.

### Live in production

| | |
| --- | --- |
| Markets | **111** — forex 46, crypto 33, futures 31, each account showing exactly its own E8 offering |
| Engine | Round 28 calibration, Edge Functions deployed and verified in the deploy log |
| Public face | The parking page |
| Tests | 1,907 passing; check · lint · check:migrations · test · build · check:bundle all green |
| Repo | `main` only. No open PRs, no worktrees, no stray branches, nothing uncommitted |

### Merged 2026-08-06 → 07

`#256` Pacific session in Attribution · `#257` every FMP-matched market live ·
`#258` round 28 · `#259` the re-park · `#260` the re-park's verified logout counts.
`#240` closed unmerged — stale, and would have reverted #256 and #257.

---

## 2. Owner rulings now binding — do not re-ask

- **Amendment 29** — Insights and Attribution are exempt from account segmentation.
- **Amendment 30** — a measurable offset is *stated*, never hidden. Three states only:
  matched-plain, matched-with-basis-line, unmatched-dormant.
- **Amendment 31** — **full matched coverage is the resting state.** A matched market
  leaves the offering only on a calibration verdict. Caution is not a reason; the
  52-symbol no-trade list in which every single symbol turned out to have a match is the
  precedent this exists to prevent. Guarded by
  `tests/brokerMasterList.test.ts` — every invisible row must sit in a named justified
  state, and the not-yet-onboarded register is pinned so it cannot grow in silence.
- **Amendment 32** — **a derivative is not its underlying.** No actual FMP match,
  no inclusion — dormant instead, every broker and every account type. Data
  integrity over coverage. Reconciles with 31: an unmatched market was never
  covered, so removing it is not a coverage reversal.
- **Amendment 33** — **the calibration mandate.** Per market, never per class; to
  each market's own discovered data limit; the geometry model reviewed before it
  is tuned. The standard is a tool that finds an overwhelmingly high number of
  money-positive setups, can justify how, and presents defensible information.
- Decisions A–F, amendment 26, and every item in the old sections 6 and 8 remain
  approved. Sections 5 and 8 also record findings **verified as non-problems** — do not
  re-investigate those.

---

## 3. Unmatched markets — the identity rule

Amendment 32, owner ruling 2026-08-07, **universal across brokers and account
types**: if there is no actual FMP match, the market is dormant and excluded.
Data integrity over coverage.

**A derivative is not its underlying.** An index future matched to a cash index is
not a match — the two are different instruments and the gap between them is the
difference, not an offset. Same for a currency future against spot. Amendment 31's
coverage floor never applied to these, so removing them reverses nothing.

**Thirteen rows go dormant, four of them currently served.** `EMD`, `FDAX`,
`FESX`, `NKD` (served on cash indices), `FDXM` (variant behind FDAX), and the eight
CME currency futures `6E 6A 6B 6N 6C 6S 6J 6M` (mapped to spot pairs). Item 1.5
carries the full spec and file list. **Futures 31 → 27.**

Dormant is not a verdict — `scripts/verify-fmp-matches.ts` re-probes every run, so
any of them returns automatically the moment FMP publishes a real series.

**The contrast that makes the rule coherent:** the six cash index CFDs — ASX, DAX,
DOW, NIKKEI, NSDQ, SP — are *cash* products on cash series and are real matches.
`^GDAXI` is correct for the DAX cash CFD and incorrect for the FDAX future. The
rule is about instrument identity, not about ticker strings.

**Open owner decision:** BRENT→`BZUSD` and WTI→`CLUSD`, oil CFDs on oil futures.
See item 1.5 — one frame against front-month and next-month settles it.

Everything else invisible is justified and asserted as such:

- **9 contract-size variants** (QM, MES, FDXM, MGCUSD, QG, MNQ, XC, XK, MYM) — the
  same underlying as a market already visible under its full-size name.
- **7 no-source** — including `METUSD`, which is Metronome at \$0.54 against E8's
  Micro Ether at \$1,871. Re-probed each run.

---

## 4. The sequence

Re-ranked. The organising principle is unchanged and still correct: **repairing the
harness precedes everything that consumes it**, because four independent defects push
the same numbers the same way and re-running the sweep after each would be wasted
compute.

### 0 — CI verification integrity — **FIRST, and it is half an hour of work**
`cancel-in-progress: true` on the deploy concurrency group severed four deploys
across two nights. Three of those were on 2026-08-06 alone, and the cost was not
theoretical: a real test fix went unverified through two cycles because each
successor merge killed the run that would have proven it.

It gets worse under load, and the calibration program below **is** load — many PRs,
many merges, every one of them wanting a trustworthy deploy. A verification
pipeline you cannot trust corrupts everything measured through it, which is the
same argument items 2 and 3 make about the evaluator, applied one level out.

The latent risk is worse than the wasted time: the cancel can land *between*
`Apply Supabase migrations` and `Deploy Supabase functions`, leaving the database
migrated and the functions on old code, with nothing raising an alarm.

*Fix, three parts:*
- `cancel-in-progress: false` on the deploy group. A deploy is never severed
  mid-flight. **Not** on the other workflows — cancelling a superseded lint run is
  correct and cheap; cancelling a superseded *deploy* is neither.
- A superseded-check at job start: compare `github.sha` against the ref's current
  tip and exit 0 early if it is no longer tip. That recovers the speed
  `cancel-in-progress` was buying — N rapid merges do one real deploy, not N —
  without ever killing a run that is already writing to production. Skip, do not
  fail: a superseded deploy is not an error.
- A test asserting `cancel-in-progress: false` for deploy.yml, so this cannot
  regress silently. Same discipline as the parking-gate pin: a literal, not an
  alternation.

*Do not do this while the desk is parked and unattended if it means an unverified
deploy config.* Land it, watch one full green run, then continue.

### RUNNING — bank 1-minute bars
Started 2026-08-06. Daily at 07:02. Not scheduled work; work to not break.
*Still owed:* the task fires only while the app is open. The provider window is three
days, so a four-day gap is unrecoverable. A launchd agent closes it — an owner call,
because it is a persistent local job. The bank also has no backup, the same gap the
6.0 GB corpus has.

### 0.5 — Close the write surface on the learning corpus — **DONE, verified against production 2026-08-07**

The finding was that `authenticated` could write `trade_setups` and `trade_outcomes`
while the learning aggregate reads them with the service role, unscoped by user — so one
account could set what every other operator is told to trade. It is closed:

- The analyzer's writes are on the admin client (`adminInsertSingle`, `index.ts:1486`).
- `20260807010000_engine_owns_setups_and_outcomes.sql` revoked client writes;
  `20260807030000_delete_own_setups.sql` added the `auth.uid()`-scoped RPC the E2E
  teardown needs in their place.
- **Verified live, not inferred:** `authenticated` holds only
  `REFERENCES, SELECT, TRIGGER, TRUNCATE` on all three tables. No INSERT, UPDATE or
  DELETE.

**One inert wart remains, and it is honestly inert.** `anon` still carries
`INSERT, UPDATE, DELETE` grants on all three tables. It is not exploitable: RLS is
enabled on each, and all twelve policies are scoped to `{authenticated}` — with no
matching policy, RLS denies `anon` by default whatever the grant says. So this is
defense-in-depth, not an open door: the grant is the only thing standing between "one
policy authored carelessly" and a write to the learning corpus. Revoke it and pin the
reduced grant. **Low urgency, genuinely — do not let it displace item 1.**

### 1 — Live product defects
Nothing here depends on the calibration being right. **The precondition logic has
changed: every market is now live, so the defects that were harmless-while-withheld are
live too.** 1b, 1c and 1e were preconditions for release; the release happened.

Outstanding: **1b** futures tick alignment (a missing contract spec must refuse, not
skip) · **1c** sizing coverage (a lookup miss must fail the build) · **1e** per-symbol
session calendars enforced server-side — `marketHours.ts` lives only in `src/lib`, so
the analyzer applies no session check · **1f** indices display honesty ·
**1g** Record row keyed to its own population · **1h** delete the false curation claim ·
**1i** Guide §3 gains the losing path · **1j** no replay figure without its bound ·
**1l** an expired setup loses its copy affordances · **1m** a transient feed failure
stops claiming the market is uncovered · **1o** `stopLogic` is false for seven of eight
classes · **1p** TP1 never tick-aligned for futures (98.9% off-grid — fold into 1b) ·
**1q** printed payoff not derivable from printed prices (80.1% differ by >10%) ·
**1r** a dead session renders as an empty account.

Done: 1a, 1d, 1k, 1n, 1s.

### 1.5 — Unmatched markets go dormant (amendment 32) — **spec'd, ready to run**
Owner ruling: *"If we do not have an actual match on FMP, it needs to be on the
dormant list and excluded for the user of Levelflow. Data integrity is critical to
maintain."* Universal — every broker, every account type.

**A future written on X is not X.** The cash index and the future on it are two
different instruments; the gap between them is not a venue offset to be measured
off, it *is* the difference between the instruments. So these were never matched,
amendment 31's coverage floor never applied to them, and removing them is not a
coverage reversal.

*This supersedes a design I proposed earlier in the same session* — a carry model
computing the basis from rate differential and days to expiry, so these markets
could keep being served. Wrong answer to a right observation: manufacturing a
series we do not have is not the same as having one. The correct fix is removal,
which is also far simpler.

**The audit is done. Thirteen rows, four of them currently served.**

| Rows | State today | Action |
| --- | --- | --- |
| `EMD`→`^MID`, `FDAX`→`^GDAXI`, `FESX`→`^STOXX50E`, `NKD`→`^N225` | served-and-visible | remove from view, scan and analysis |
| `FDXM`→`^GDAXI` | variant behind FDAX | remove with it |
| `6E 6A 6B 6N 6C 6S` → spot pairs | mapped-not-yet-onboarded | reclassify `excluded-no-fmp-source` |
| `6J`→`USDJPY`, `6M`→`USDMXN` | offered-but-unsizeable | reclassify `excluded-no-fmp-source` |

Set `levelflowSymbol: null` and `fmpSymbol: null` on all thirteen, matching how
the existing seven no-source rows (`FGBL`, `FGBM`, `FGBS`, `FGBX`, `UB`, `TN`,
`ZW`) are already shaped. **Futures 31 → 27.** Every count pin moves with it.

**Files: 14.** `symbolMap.ts`, `masterList.ts`, `instruments.ts`,
`contractVariants.ts`, `sizing.ts`, the analyzer's `symbols.ts`,
`market-data/index.ts`, `calibration.ts`'s `ASSET_TYPE_BY_SYMBOL`, and the pins in
`brokerMasterList`, `brokerReference`, `brokerVisibility`, `contractVariants`,
`e8RosterConformance`, `feedSource`, `marketScanFilters`.

**What must NOT be touched, and the contrast is the point.** The six cash index
CFDs — ASX, DAX, DOW, NIKKEI, NSDQ, SP — are *cash* products on cash series and
stay. The same `^GDAXI` series is a correct match for the DAX cash CFD and an
incorrect one for the `FDAX` future. Also unaffected: `ARWUSD`→`ARUSD` and
`TRUMPUSD`→`OTRUMPUSD`, which are spelling, not proxying.

**One open owner decision, do not decide it yourself: BRENT→`BZUSD` and
WTI→`CLUSD`.** Oil CFDs mapped to oil futures. Broker oil CFDs are conventionally
written on the front month, which would make them real matches — and amendment 30
ruled on them that way earlier the same day. But WTI's +0.24 is ~30bp
(spread-shaped) while BRENT's +1.67 is ~196bp (contract-month-shaped). One frame
settles it: compare E8's live BRENT and WTI against FMP's front-month *and*
next-month. Recommendation is to keep both serving until that frame exists.

**Why this is item 1.5 and not an emergency.** It was briefly ranked as a live
honesty defect. It is not, while the desk is parked — no user can see any of these
markets with the gate up. Fix it before the desk reopens and before 4c sweeps,
because sweeping a market on the wrong instrument calibrates the wrong instrument;
there is no reason to rush it tonight.

### 2 — Repair the evaluator, as ONE change set, then re-sweep once
**2a** look-ahead — admit a daily bar only once its own day closed ·
**2b** timestamps normalised at the provider boundary, timezone probed not assumed ·
**2c** no favourable level credited on the fill bar; the evaluator consumes a *path* ·
**2d** cost charged per leg, carried on the outcome record ·
**2e** `ambiguous` scored −1 by default ·
**2f** every leg resolves to a price, gap-aware ·
**2g** one R accountant ·
**2h** bad-tick sanitisation (MGCUSD 135,533% single-bar move) ·
**2i** corpus manifest with the calibration hash ·
**2j** per-symbol spreads (class constants are 16× wrong for NQ) ·
**2k** bar continuity ·
**2l** committee parity — four timeframes in replay, five in production; score changes
on 63.9% of decisions, side flips on 1.6%. **Must land with 2a** ·
**2m** `ema()` seeds on a raw first value and never abstains ·
**2n** RSI returns 100 on a frozen series.

### 3 — Repair the acceptance procedure, then re-derive
**3a** delete the ±0.005 constant; print standard errors clustered by market ·
**3b** permutation null over the grid · **3c** common-origin rolling validation with
embargo · **3d** fit/select/confirm split · **3e** market holdout outside all tuning ·
**3f** a release gate stated in standard errors · **3g** accept on total R *and*
per-trade expectancy delta.

### 4 — THE CALIBRATION PROGRAM (amendment 33)
**This is the point of the whole retrofit, and it is not one item.** Everything
above exists so this can be done once, honestly. The owner's standing goal, in
their framing:

> Levelflow operating like a finely tuned, highly sophisticated tool which can
> identify an overwhelmingly high number of money-positive trade setups, can
> justify how it did it, and can present reliable, defensible information to the
> user.

Three obligations, and the middle one is the one that gets dropped: **find the
setups, justify the method, defend the presentation.** A calibration that lifts
expectancy but cannot explain itself fails this as surely as one that lifts
nothing.

Five phases, in order. Do not collapse them.

#### 4a — Discover the data limits. Do not assume them.
Per market **and per timeframe**, find the true earliest usable bar and the true
*continuous* span — depth varies by market, and item 2k exists because nothing
currently counts holes. A sweep that assumes a common span silently truncates the
markets with more history and manufactures confidence about the markets with
less.

Output a committed manifest: per market, per timeframe, first bar, last bar, bar
count, largest gap, usable span. That manifest is what "to the limit of our data"
*means* for each market, and every later phase reads it rather than guessing.
Cheap, and it gates everything.

#### 4b — Review the geometry MODEL before tuning it
Owner-directed, and the most valuable phase if it finds anything. Round 28 is the
cheap version of this lesson: a 96-variant grid declared the status quo optimal
because the axis that mattered was not in the grid. **Tuning parameters inside a
wrong model is the most expensive way to learn nothing.**

Questions this phase must actually answer, with evidence, not opinion:
- Is **TP1 + runner** the right shape? Does a third leg, a trailing stop after
  TP1, or a time-stop earn more than the partial does?
- Is the stop right as **static-at-entry**? `breakeven_trigger_price` exists —
  is moving to breakeven the best use of it, or is it giving away runners?
- Is **confidence-as-a-scalar** the right ranking device at all? r12 said it does
  not rank outcomes, and round 28 proved that verdict was drawn on a sample a
  geometry defect had cut to a third. Re-ask it on a repaired sample, and if it
  still does not rank, replace it rather than keeping a number that decorates.
- Is a **fixed review window** the right expiry device, or should it be
  volatility-conditional? Livestock and oats both needed 24h for reasons that
  were about the book, not the clock.
- Is **entry-as-limit-offset** right for every market, or do some want
  market-on-touch or breakout entries?
- Are there **regime-conditional structures** we simply do not have?

Adversarial, several lenses, one each. Output is a recommendation with its
evidence; the owner decides before the sweep runs. Anything adopted here changes
what 4c must measure, which is exactly why it cannot come after.

#### 4c — Sweep every matched market to its own limit
All 111, at the repaired evaluator (item 2), on the discovered spans (4a), in
whatever model 4b settled. **Crossed axes** — `replay-sweep.ts` takes
`--grid a=1,2;b=3,4` now, and a lever downstream of risk cannot be derived at
another lever's old setting. Corpus manifest per 2i, so no analysis can silently
read a corpus built under different calibration.

#### 4d — Derive per market, not per class
Every parameter family, per market, gated by item 3's acceptance procedure —
nothing ships that does not clear its own out-of-sample bar corrected for the
family it was selected from:

- **stop** — cap, ATR multiple, structural floor, pivot search. Note 8a: the
  floor currently makes the cap bind unconditionally in seven of eight classes,
  so both levers are dead. Fix before deriving, or this measures nothing again.
- **TP1** — distance, risk share, and whether it should fire *at all* for a given
  market.
- **TP2 / runner** — ceiling, window share, exit policy. Blocked on 2f: today
  `tp1_partial` returns the same 0.25R whether the runner expired at breakeven or
  one tick short, and it is 63–68% of all fills.
- **entry** — offset default and trend, and the offset *model*, not just its two
  constants.
- **window and timing** — review hours, session gates, day-of-week.
- **confidence** — floor, and banding or its replacement per 4b.
- **tick and pip** — alignment thresholds and minimum viable distance. 1b and 1p
  must already be in.
- **starvation** — refusal accounting per market, so a starved market is *known*
  starved rather than silently thin. This is what caught indices and oats, and it
  is the difference between "no edge" and "never measured."

A class value survives only where a market's own data says it should. Broadly
applied standards have been measured wrong too many times to keep by default:
indices at `tp1RiskShare` 1.2, oats at a 6-hour window, livestock unmeasurable at
6h, execution cost off by 1.79–2.69× on copper and gas.

`ANALYZER_VERSION` bumps. `tests/calibrationState.test.ts` re-pins every derived
value.

#### 4e — Iterate until the returns diminish, then say so
Rounds continue while they yield. When a round returns only nulls and
validations, declare the diminished-returns point out loud rather than
manufacturing another. The stopping rule stands and this does not license change
for its own sake.

**Amendment 31's only exit lives in 4d.** If a market leaves the offering, it
leaves on this evidence. Nothing else removes one.

### 5 — Prop-firm survival
Median 9 open positions, p90 25, max 43 — 4.5% / 12.5% / 21.5% of the account at the
0.50% default, against E8 daily limits of 2.5–3%. A portfolio governor between scan and
Desk that *truncates* against remaining budget. Signed factor exposure replacing
base-currency correlation groups. E8's forced-flatten clocks (15:10 CT, 23:00) exist in
the spec and nowhere in code. 33% of simulated runs breach the 40% Best Day cap.

### 6 — Operations
Global learning's 414 at ~200 setups blocks item 8's cohort work · `outcome-sync`'s
non-atomic write and its 300/run starvation · `init.sql` applied by hand and unscanned ·
no Edge Function rollback, and functions deploy *before* E2E · `cancel-in-progress: true`
severed a live deploy on 2026-08-06 — **and did so three more times that night**,
cancelling #258's, #259's and #261's deploy runs as each successor merged. Harmless
each time and provably so, but it meant a real test fix went unverified through two
cycles, and the cancel can land *between* migrate and functions-deploy.
`cancel-in-progress: false` on deploy specifically · the Supabase CLI that migrates production is unpinned and scanned by
nothing · `engines.node: ">=24"` lets Vercel build on a Node major CI never ran ·
CSP `connect-src` trusts every Supabase tenant on the internet · CI verifies an artifact
Vercel does not build · the CSP style hash is hand-copied with nothing binding it to the
bundle · `@types/node` two majors ahead of the runtime.

### 7 — Scan capacity
`scan_opportunities` is 60 and `SCAN_SYMBOLS_PER_REQUEST` stays 10 — the 10 → 15 change
from #240 was **declined**, because chunk size cannot move the ceiling that binds. A
111-market scan costs ~780 FMP calls, so ~4 full scans/minute is the physical limit and
FMP enforces it, not the limiter. Re-benchmark CPU *and resident memory* before
revisiting. Also: render cost at 111 rows, and the scan at 375px against the
mobile-density standard.

### 8 — Round 29 proper
**8a** the stop geometry has one live lever, not three — `structuralStop` is floored at
1.25 ATR inside a 1.0 ATR cap, so the cap binds unconditionally and every grid over
those axes measured nothing · **8b** TP1 collapses to a per-class constant in R ·
**8c** the momentum voter cannot vote sell on mixed evidence (12.7% of decision points,
zero resolved sell). Then per-symbol geometry, payoff band, per-symbol floors, session
gating per class, runner exit policy, committee weights, structure's value.

**Per-asset, not per-class** (owner directive). Round 28 already proved the value: oats
went from unusable to +12.9 test R on a symbol override its class could not express.

### 9 — Coverage
The four index futures reading cash series with an unmeasured, time-varying basis —
the test that excluded the six FX majors, never applied to the markets that most need
it. **45 of 111 markets belong to no correlation group**, which item 5's crowding rule
needs before it can refuse anything. Economic-calendar and news maps never extended past
the original 50. Account-type rules enforced in the browser only.

### 10 — Fleet
Fix the retry mechanism before standardising it: it decides on annotation text an
outside contributor can author, and the fleet reusable `curl`s a mutable `FLEET.md` and
treats it as review instructions inside a job holding `pull-requests: write` and the API
key. Sequenced after item 6's `init.sql` work.

### 11 — Then hedge mind
§20, then pillar 4.

### Carried, small
- `exclusions.ts` header still says BNBUSD waits on an owner ruling — stale.
- `masterList.ts`'s `ONBOARDED_PENDING_SWEEP_GROUND` calls swept-and-failed markets
  "pending sweep."
- Entry-offset grid never derived at the new geometry.
- The indices row in `replayReliability.ts` (.51/952) is the **pre-round-28** record.
  It is left as measured rather than restated; re-measuring it is item 4's first act.

---

## 5. Does the sequence reach best-possible positioning?

**For the inputs we have, yes.** The remaining limits are input boundaries, nameable
rather than choices:

- **Intrabar truth needs minute history we do not own.** Banking started 2026-08-06;
  2c's adverse-first ordering is explicitly a placeholder for it.
- **Real net expectancy needs realized fills, and we have none.** The live cohort was
  believed to be that and is not — it runs the same evaluator on the same bars. Either
  operator-entered fill prices get captured, or Levelflow has no measurement of a real
  fill and should say so.
- **Spread will never be a distribution**, so cost is a sensitivity. 2d charging
  modelled cost is a strictly separate obligation from measuring the real one.
- **The corpus cannot answer whether the edge survives these fixes.** The bracket on
  EURUSD spans +0.247 to −0.049. Only item 4's re-sweep closes it, and it may close at
  "there is no edge at this geometry." The sequence has to survive that outcome.

### What the next fresh-eyes round should probe
Not another pass over the same surfaces. Round 6 invalidated the list's premise; round 7
swept four unswept lenses. **Round 8 should probe what the round-6 and round-7 fixes
themselves assume** — particularly 2c's adverse-first ordering and 2b's probed timezone,
both of which are assumptions being installed as defaults, and 8a's claim that the
minimum-width floor is the only thing making the cap bind.

One further lens has never been run: **the product with 111 markets rather than 50.**
Every measurement of render cost, scan latency, correlation coverage and session
handling predates a universe that more than doubled. That is a coverage question about
the *product*, not the engine, and nothing in the current sequence owns it.

And item 4b is itself a fresh-eyes round pointed at the geometry model rather than at
the codebase — the one place the protocol has never been aimed. It belongs to the
sequence rather than to a review cycle because its output changes what 4c measures, but
it should be run with the same adversarial discipline: several lenses, each asked what
the model is missing rather than how to tune it.

---


## 6. Two prompts

Kept here so they cannot drift from the state they describe. Update together.

### 6a. The kickoff prompt — opens a fresh session

```
Continue Levelflow. Read docs/HANDOFF.md first — it is tracked in the repo now, not in
a worktree. It is the total state of record: what is live, what is parked and how to
unpark it, the approvals already given, the reasoning behind decisions declined or
reversed, the measured evidence, and the full ordered sequence. Do not re-derive what it
records. Do not re-ask decisions A-F, amendments 26 and 29-33, or any item in sections 2
and 4 — all approved. Section 5 records findings VERIFIED as non-problems; do not
re-investigate those.

THE DESK IS PARKED. I closed it on 2026-08-07: PARKING_GATE is true, every session
invalidated, trade history deliberately intact. Section 1 has the exact reopening
procedure — one flag and its tests. Do not reopen it without my word, and tell me if
anything you are about to ship would be wrong to ship while it is closed.

Coverage is settled and is not open for reconsideration. Amendment 31: all 111
FMP-matched E8 markets are live, per account type, and that is the resting state. The
only path to removing a market is a calibration verdict from item 4d — never caution,
never a hunch about a feed.

Work the sequence in order.

Item 0 first: CI verification integrity. Half an hour, and it protects every
verification after it. Three deploys were severed mid-flight in one night by
cancel-in-progress, and one real test fix went unverified through two cycles as a
result. The calibration program is many merges; do not run it through a pipeline that
kills its own evidence.

Then item 1, the live product defects — nothing in it depends on the calibration being
right, and the release changed its urgency: defects that were harmless while markets
were withheld are live now that nothing is. Fold 1p into 1b.

Item 1.5 is amendment 32 — unmatched markets go dormant. A derivative is not its
underlying: four index futures are served today on CASH index series, which was never a
match, and eight currency futures are mapped to spot pairs. Thirteen rows go dormant,
futures 31 -> 27, and the audit and file list are already in the handoff so it is
execution rather than investigation. Do NOT touch the six cash index CFDs — cash on cash
is a real match, and the same ^GDAXI series is right for DAX and wrong for FDAX. Bring
me the BRENT/WTI question rather than deciding it; the handoff says what settles it.
Land this before 4c, because sweeping a market on the wrong instrument calibrates the
wrong instrument.

Then item 2, the evaluator, AS ONE CHANGE SET — 2l must land with 2a or the re-sweep
measures the wrong committee. Then item 3, the acceptance procedure.

THEN ITEM 4, THE CALIBRATION PROGRAM. This is the point of the whole retrofit and it is
five phases; do not collapse them. 4a discovers each market's true data limit per
timeframe — measure it, never assume it, it varies. 4b reviews the geometry MODEL before
tuning it, and is the highest-value phase if it finds anything: is TP1+runner the right
shape, is the stop right as static-at-entry, does confidence rank outcomes at all on a
repaired sample or should it be replaced, is a fixed review window right, are there
regime-conditional structures we do not have. Adversarial, several lenses, evidence not
opinion, and I decide before the sweep runs. 4c sweeps all 111 markets to their own
discovered limits with crossed axes. 4d derives PER MARKET, not per class — stops, TP1,
runner, entries, windows and timing, confidence bands or their replacement, tick and pip
thresholds, starvation accounting — each gated by item 3's acceptance bar. 4e iterates
until the returns diminish, then says so out loud.

The standard for done, in my words, is amendment 33: Levelflow operating like a finely
tuned, highly sophisticated tool which can identify an overwhelmingly high number of
money-positive trade setups, can justify how it did it, and can present reliable,
defensible information to the user. Find the setups, justify the method, defend the
presentation — all three.

Round 28 is the standing warning: a 96-variant grid over four axes moved indices'
survival by one point and declared the status quo optimal, because the axis that
mattered was held fixed. A lever downstream of risk cannot be derived at another lever's
old setting. Use replay-sweep's crossed axes (--grid a=1,2;b=3,4).

BEFORE any hedge-mind work advances, and repeatedly as the work proceeds, run this
cycle: (1) record the prior round's recommendations as approved; (2) run a genuinely
new fresh-eyes review for remaining gaps, probing areas not yet swept rather than
re-listing known ones; (3) design durable fixes, not patches; (4) place each at its
correct rank in the sequence, never appended, with an explicit pointer to where it
belongs; (5) test whether the sequence now reaches best-possible positioning for the
data and constraints available, and if not keep hunting until it does or until the
remaining limits are input boundaries you can name; (6) update docs/HANDOFF.md; (7)
report to me in chat with the full sequence visible. Use adversarial agents for the
review — several, one lens each (look-ahead and statistical validity, fill realism,
cost, coverage, risk management and prop-firm survival, product honesty, operations),
each asked what is wrong or missing rather than what to improve. Round 8 should probe
what the round-6 and round-7 fixes THEMSELVES assume, and must include one lens nothing
has yet owned: the product at 111 markets rather than 50 — render cost, scan latency,
correlation coverage, session handling, all measured on a universe less than half this
size.

You have full autonomy and my authorization to use agents freely and in parallel.
Approve your own tool use. Make routine judgment calls yourself; bring me only decisions
that genuinely change the work, with a recommendation and its justification.

Follow our protocols: branch off main, never commit to main, Conventional Commits,
typecheck + lint + tests green before anything is called done, docs ride along in the
same change set, `gh pr merge --squash --auto --delete-branch`, verify production after
deploy, clean up branches and orphans. Note that `npm test` does NOT run Playwright — a
constant duplicated into an e2e spec is invisible to every local gate, which is how a
broken rate-limit test shipped on 2026-08-06. Derive across that boundary; never restate.
Report failures honestly with the output; never claim green when it is not.

Run to completion. Do not stop at turn boundaries to check in, do not narrate options
you will not take, and do not end a turn with work you could still advance — if compute
is running, monitor it and keep working. Keep docs/HANDOFF.md the truth as state
changes, and tell me when a stopping point is genuinely reached.
```

### 6b. The continuation prompt — paste any time to keep it moving

Short on purpose. It is the whole loop in one paste, and it works even if the agent
has lost its earlier context, because it names the file that holds everything.

```
Continue. Work docs/HANDOFF.md's sequence from wherever it now stands, and fold anything
your own work has surfaced since into its correct rank rather than appending it. When the
current item is genuinely done — gates green, deployed, verified in production, branches
cleaned — run another full cycle of the fresh-eyes gap analysis: several adversarial
agents, one lens each, each asked what is wrong or missing rather than what to improve;
durable fixes, not patches; re-rank the whole sequence rather than appending to it; test
whether it now reaches best-possible positioning and keep hunting if not, or name the
input boundary that stops you. Then update docs/HANDOFF.md and report to me in chat with
the full sequence visible. Do not stop at turn boundaries. Never claim green when it is
not.
```
