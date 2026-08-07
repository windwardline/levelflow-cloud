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
- Decisions A–F, amendment 26, and every item in the old sections 6 and 8 remain
  approved. Sections 5 and 8 also record findings **verified as non-problems** — do not
  re-investigate those.

---

## 3. The one open gap against amendment 31

Six CME currency futures are matched but not served: **6E, 6A, 6B, 6N, 6C, 6S**
(`mapped-not-yet-onboarded`). Each maps to a spot pair already visible on forex
accounts, so a futures-account operator cannot analyse Euro FX today.

**Why they are parked rather than shipped:** 6C and 6S invert. 6C is a CAD-base contract
against Levelflow's USD-base `USDCAD` — long 6C is *short* USDCAD. Serving them
unconverted hands a futures operator a backwards direction on a correct-looking setup.
The inversion work is real and unfinished; the mapping is not the hard part.

Everything else invisible is justified and asserted as such:

- **9 contract-size variants** (QM, MES, FDXM, MGCUSD, QG, MNQ, XC, XK, MYM) — the same
  underlying as a market already visible under its full-size name.
- **2 unsizeable** (6J, 6M) — no FMP currency-futures series exists; their mapping is a
  derivation (1/USDJPY), not a match.
- **7 no-source** — including `METUSD`, which is Metronome at \$0.54 against E8's Micro
  Ether at \$1,871. Re-probed each run by `scripts/verify-fmp-matches.ts`.

---

## 4. The sequence

Re-ranked. The organising principle is unchanged and still correct: **repairing the
harness precedes everything that consumes it**, because four independent defects push
the same numbers the same way and re-running the sweep after each would be wasted
compute.

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

### 4 — Re-sweep once, re-derive everything, re-judge every release
Confidence floors, class geometry, every exclusion. `ANALYZER_VERSION` bumps,
`tests/calibrationState.test.ts` re-pins.

**Round 28 is the argument for doing this jointly.** A 96-variant grid over four axes
moved indices' survival by one point and declared the status quo optimal, because the
axis that mattered was held fixed. `replay-sweep.ts` now takes crossed axes
(`--grid a=1,2;b=3,4`); use them. A lever downstream of risk cannot be derived at
another lever's old setting.

**This is also where amendment 31's only exit lives.** If a market fails here, it leaves
on the evidence — that is the mechanism, and nothing else is.

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

---

## 6. The kickoff prompt for the next session

Kept here so it cannot drift from the state it describes. Update both together.

```
Continue Levelflow. Read docs/HANDOFF.md first — it is tracked in the repo now, not in
a worktree. It is the total state of record: what is live, what is parked and how to
unpark it, the approvals already given, the reasoning behind decisions declined or
reversed, the measured evidence, and the full ordered sequence. Do not re-derive what it
records. Do not re-ask decisions A-F, amendments 26 and 29-31, or any item in sections 2
and 4 — all approved. Section 5 records findings VERIFIED as non-problems; do not
re-investigate those.

THE DESK IS PARKED. I closed it on 2026-08-07: PARKING_GATE is true, every session
invalidated, trade history deliberately intact. Section 1 has the exact reopening
procedure — one flag and its tests. Do not reopen it without my word, and tell me if
anything you are about to ship would be wrong to ship while it is closed.

Coverage is settled and is not open for reconsideration. Amendment 31: all 111
FMP-matched E8 markets are live, per account type, and that is the resting state. The
only path to removing a market is a calibration verdict from item 4 — never caution,
never a hunch about a feed.

Start with item 1, the live product defects. Nothing in it depends on the calibration
being right, and the release changed its urgency: defects that were harmless while
markets were withheld are live now that nothing is. Fold 1p into 1b. Then item 2, the
evaluator, AS ONE CHANGE SET — 2l must land with 2a or the re-sweep measures the wrong
committee. Then item 3, then item 4's single re-sweep.

Item 4 is the one that can invalidate everything upstream of it, and round 28 is the
warning: a 96-variant grid over four axes moved indices' survival by one point and
declared the status quo optimal, because the axis that mattered was held fixed. Use
replay-sweep's crossed axes (--grid a=1,2;b=3,4). A lever downstream of risk cannot be
derived at another lever's old setting. Tune per asset, not per class.

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
correlation coverage, session handling, all of which were measured on a universe less
than half this size.

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
