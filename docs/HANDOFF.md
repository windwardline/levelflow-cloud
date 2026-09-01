# Levelflow handoff — 2026-08-07, 01:30 EDT

> # ⛔ THE CALIBRATION CORPUS IS INVALID (2026-08-11)
>
> **Read `docs/research/remediation-program-2026-08-11.md` before this
> file, and before trusting any calibration figure anywhere in this
> repo.** The 4c/4d corpus resolved every setup 4–5 hours out of register
> with its own decision bar: the cached 15-minute and daily series carry
> naive New-York stamps read as UTC while the 5-minute series carries
> true UTC, so roughly half of each review window lies BEFORE the
> decision. Re-stamped and re-run, the flagship "measurably positive"
> markets collapse — EURUSD +0.213R → −0.008, BTCUSD +0.198 → −0.082,
> XAUUSD +0.247 → −0.031. **The measured edge is an artifact.**
>
> Everything below that reports a calibration RESULT — derived cells,
> confirmed counts, per-market verdicts, expectancy, fill rates — is
> superseded by that program. The engine's structure, the identity work
> and the product-truth fixes stand. `.calibration-cache` itself carries
> the defect and must be rebuilt (Phase 0) before anything is re-measured.


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

Trade history was preserved at the re-park, then **wiped on the owner's
clean-model order 2026-08-11** (amendment 35): setups, outcomes, sessions and
refresh tokens all to zero, verified; thirteen accounts untouched. The first
live cohort accrued (briefly, E2E debris only) under `2026.08.11.declines`;
R1a's first slice moved the boundary to `2026.08.18.realized-r` (D2 —
grading numbers changed, so the version moved with them). (The
E2E account's rows reappear on every deploy — pipeline debris, not history;
group by user before trusting a raw `count(*)`.)

**Reopening is one flag plus its tests.** Flip `PARKING_GATE` to `false`, invert the two
gate tests in `tests/e2e/public-auth.spec.ts`, return the four sign-in tests from
`/?enter` to `/`, and update the pin in `tests/parkingGate.test.ts`. Nothing else.
Spec §17p records it.

**The trap, learned the hard way:** the gate is consulted inside App's `!session`
branch, so it turns away arrivals and does **not** end visits. A park without the logout
step leaves every signed-in operator working behind a closed door.

### FMP is dark, and the loss is permanent — **ENDED EARLY 2026-08-18**

> **UPDATE 2026-08-18: the owner purchased a 100 GB plan upgrade and the
> allowance recovered immediately** — probed the same day (quote 200, two
> 5-minute history windows served complete; see
> `docs/cache-rebuild-r0.md` §0 for the measured results, including the
> settled `to`-inclusivity and the ≥2,304-row 5-minute cap).
>
> **✅ CLOSED 2026-08-18 (two acts): the 2026-08-17 key rotations had
> stranded every non-Keychain copy.** The fleet credential law
> (windwardline/ops: "Keychain is the secret store"; `credentials.tsv`
> is the governed inventory) rotated `fmp-api-key` AND
> `levelflow-newssync-token` on **2026-08-17**. Rotation propagates to
> Keychain-reading consumers with no edit — but the GitHub Actions
> copies were consumers the inventory never listed. **Act 1 (FMP):**
> every deploy overwrote Supabase's function secret with the dead key;
> the quota blackout masked it; runs 373/374 went red the moment the
> allowance recovered, and #359's printed refusal named it ("Invalid
> API KEY"). Fixed in #360: `deploy.yml` holds no FMP key, ever;
> `scripts/ops/sync-function-secrets.sh` is the one Keychain→Supabase
> conduit; the owner synced; **deploy run 378 green end-to-end** —
> first fully green deploy-time E2E since the 08-13 blackout. The stale
> GitHub secret is deleted; `credentials.tsv` lists the conduit (ops
> #61). **Act 2 (news token):** the same rotation left
> `NEWS_SYNC_TOKEN`'s gate copy (GitHub→Supabase) and caller copy
> (Vault `news_sync_token`, which pg_cron reads at call time) behind.
> Same remedy, same conduit: the sync script now converges BOTH halves
> from the Keychain and proves the token with one authenticated
> news-calendar call; `deploy.yml` no longer holds or pushes it; every
> workflow is test-pinned against carrying any gate credential. The
> phantom `FINNHUB_API_KEY` reference (a GitHub secret that never
> existed, blanking Supabase's Finnhub value on every deploy) is
> removed. Rotation from now on, for both credentials: rotate in the
> Keychain, run the script, done.
>
> **The argv law and its scope** (#363, nine rounds; reflowed after the
> post-merge round said this paragraph read as a changelog, not a law):
> no credential value ever rides argv in ANY tracked shell script — not
> as a bearer or generic header, not in a request body, not in a URL
> query string (a credential inside a URL is still argv; the
> cache-rebuild runbook's probe uses `curl -K` for exactly that reason).
> Values travel by 600-mode temp files. The law's scope is the STUDIO
> machine, where argv is world-readable in a multi-process session; the
> invoking user can always inspect their own processes, so the claim is
> "no OTHER user or watcher", never "invisible to ps".
>
> **The law's two stated boundaries.** Fenced commands in `.md`
> runbooks are law-by-REVIEW, not law-by-test — the sweep reads tracked
> `.sh` files only, and round 6's own violation lived in a runbook
> fence. And CI argv is deliberately outside the scope: `deploy.yml`
> passes `--password` to the Supabase CLI on a GitHub-hosted runner —
> ephemeral, single-tenant — and dropping the flag to lean on the CLI's
> env fallback is unverifiable short of a live production deploy (#363
> round 2, weighed and declined; recorded at the step).
>
> **How the law stays true.** By test, not by claim: the sweep runs
> over every TRACKED `.sh` wherever it lives (`git ls-files`, so
> `.github` cannot be silently skipped and gitignored scratch cannot
> join), with the five ops scripts (today the repo's whole shell
> surface) asserted present by path, and four class regexes — bearer,
> header family (any `-H`/`--header` whose quoted value carries an
> interpolation anywhere, escape-traversing; round 9's post-merge
> finding closed the begins-with-$ gap), request body, and URL query
> (`$VAR`/`${VAR}`/`"$VAR"`/`$(…)` forms alike). `curl -u` and
> userinfo-in-URL spellings stay with the review loop per round 2's
> standing disposition.
>
> **The conduit's failure modes, operator-visible.** A transport
> failure at the sync script's verify step reports **the token halves
> ARE synced** instead of dying silently, and a preflight abort prints
> every probe's psql stderr under host/user markers — "password
> authentication failed" there means the `supabase-db-levelflow`
> Keychain item is stale, not the network.
>
> The paragraphs below are kept as the record of the blackout. What remains
> true: the 1-minute bars not banked between 2026-08-13 and the bank's
> first post-upgrade run are permanently gone (~3-day serving window);
> everything else refetches. The minute bank resumes on its own schedule
> now that 429s have stopped — kickstart it early to save the
> recoverable tail. The R0 cache rebuild is UNBLOCKED and waits only on
> the studio machine's operator.

**THE CEILING IS 250 GB, NOT 150 — and usage stood at 259 on 2026-08-31
(owner).** Ultimate plus a purchased 100 GB block. Every budget in the §21
governor design is a share of 150 and is understated by a third; the
reservations and the precedence order are unaffected, since both are about who
yields to whom. The next block is another 100 GB, not a tier change.

**THE PRODUCTION BLEED WAS THE BARS, AND IT IS FIXED (#495, #496).** Every scan
re-bought the entire window from FMP — 11,470 bars per market across the five
decision frames, ~1.72 MB, **~167 MB for a full 97-market scan** — and the bars
are immutable, so the account re-bought the same four years of daily history
every time. `market_bars` holds RAW provider rows and `fetchFmpBars` buys only
the date window the store lacks: **~6 MB per full scan, a 96% reduction**,
shared by the analyzer, the chart feed, outcome-sync and the deploy-time E2E.
Cost now scales with TIME instead of USAGE, which is the property production
needs whatever ceiling is bought.

**The remainder was measured and is not a bleeder**, so nothing else was built:
the quote is 47 KB per full scan (0.03% of the old bar cost) and is a live
price that cannot be cached; the economic calendar is 507 events x 482 bytes =
239 KB per fetch, **176 MB / 30 days, 0.12% of the base plan**, over a window
whose contents genuinely change inside it. Building stores for those would
optimise a tenth of a percent and add a second invalidation story.

**WHAT WAS ACTUALLY BLEEDING, measured 2026-08-31.** Six consumers, none able
to tell another, because there is no usage endpoint — §21's whole premise:

| consumer | cadence | state |
| --- | --- | --- |
| minute bank | launchd, TWICE daily (07:20 and 19:20) | 97 symbols x 5 retries per run against the refusal. **Fixed #492** (scout) and **#493** (breaker) |
| cache top-up | launchd, twice daily | seven-step ladder, ~11 minutes per run. **Fixed #493** at the shared retry |
| `levelflow-news-calendar-sync` | pg_cron, hourly | 24 FMP-touching calls/day for a PARKED desk. **PAUSED 2026-08-31** |
| `levelflow-outcome-sync` | pg_cron, hourly | 24 FMP-touching calls/day resolving setups nobody is creating. **PAUSED 2026-08-31** |
| `levelflow-sync-watchdog` | pg_cron, hourly | no FMP call — writes `analyzer_events`. LEFT ACTIVE deliberately, so the pause above is recorded rather than silent |
| deploy-time E2E | every merge | **the unbounded one.** 19 deploys on 2026-08-31, each running Playwright against production: ~100 `trade-analyzer` + ~90 `market-data` calls per deploy, every one of them an FMP fetch. The governor sizes this as "bounded, small" — true per run, false per day |

**UNPARK REQUIREMENT — the two paused jobs must be re-enabled**, or the desk
comes back with a stale calendar and unresolved outcomes:

```sql
select cron.alter_job(jobid, active := true) from cron.job
where jobname in ('levelflow-news-calendar-sync', 'levelflow-outcome-sync');
```

Re-enable them AFTER the minute bank has had one clean run, never before:
§21c says the bank is the only consumer whose loss is permanent and dated, so
it takes the door first when the window drains. This is the §17p shape again —
a park is two steps, and the second one is the one that gets forgotten.

The account's trailing-30-day bandwidth allowance was exhausted on 2026-08-13 by
the rebuild's **replay sweeps** — not by the minute bank, whose steady draw is
~2.2 GB against 150 GB. Every request since has returned `HTTP 429`, on both the
bank's key path and the MCP connector. ~~The bank is frozen at **957,161 bars,
high-water mark 2026-08-13 15:26**.~~ **STALE BY 1.11 MILLION BARS — remeasured
2026-08-31: 2,067,013 bars across 100 files, high-water 2026-08-26 19:19.** The bank ran
through the 2026-08-18 upgrade and re-froze on the 2026-08-27 exhaustion, so the old figure
misdates the loss boundary by thirteen days — and this is the number every loss estimate and
the "kickstart the bank FIRST" ordering reads. It is still 429-locked: tonight's run at
2026-08-31T23:20:05Z fetched nothing and stood down on the first symbol.

FMP serves 1-minute bars about three days deep, so **every day dark is a day of
unrecoverable history across 97 symbols.** The window drains by time only; the
sweep spend ages out around **2026-09-12**. Nothing can shorten it and nothing
can buy the bars back.

**Do not re-run the bank into a 429** — a re-run cannot succeed against an
exhausted allowance, and one whole-roster attempt burns ~485 requests. Recovery
needs no catch-up: any single successful run re-pulls each symbol's full window
and dedupes.

**The tier is never to be reduced** (owner, 2026-08-16). Ultimate buys more data
and faster data, not merely a bigger ceiling. Steady-state use near 2% is not
slack and is not a downgrade signal.

### The consumption governor (§21)

`docs/superpowers/specs/2026-08-16-fmp-consumption-governor-design.md` is the
design of record. Read it before proposing anything about FMP spend.

The finding that decides the architecture: FMP meters **bytes**, and publishes
**no usage endpoint**. Nothing can be told what remains, so anything that governs
consumption has to sit in the data path and weigh responses — which is why a
cooperative ledger was rejected and a proxy is required.

**Phase 1 shipped 2026-08-16.** `replay-sweep.ts` now **requires `--byte-budget`
and will not start without it** (#347) — see §4's 4c note. `market-data` returns
`providerQuotaExhausted`, and the advisor-chart E2E stands down for that one
named condition, which repaired a deploy gate that had been red since 2026-08-13
for a non-regression. The E2E run also prints every stood-down test and its
reason, and refuses an unexplained skip (#348).

**Phases 2–3 are parked deliberately** until FMP recovers: a byte-metering proxy
cannot be validated with no bytes flowing. Until Phase 3 completes the guarantee
does not hold — anything still holding the real key is invisible to the ledger.

**Open and named, not fixed:** 13 of 14 E2E stand-downs during the outage
attribute it to local symptoms ("No qualifying setup right now", "No Crypto
market qualified") — each locally true, collectively one root cause reported
thirteen ways; fix it when FMP is live and both paths can be exercised. And
`analyzer_events` still has no reader, which is why §21h surfaces through CI
rather than into that table.

### Live in production

| | |
| --- | --- |
| Markets | **97 distinct** — the offering is 97 markets, presented per account type as forex 45 · crypto 33 · futures 27. Those three sum to 105 because the eight crypto CFDs (`FOREX_ACCOUNT_CRYPTO_CFDS`) are visible on BOTH the forex and crypto accounts and are counted twice; 105 is the sum of account-scoped VIEWS, never the roster. (A stale 106 stood here until round 8's CV-9; the 105 that replaced it was this same double-count, caught by the 2026-08-11 audit.) `defaultScanSymbols` is the roster and has always been 97 (amendment 32 executed 2026-08-09 in two acts: thirteen derivative rows dormant, then BRENT on the owner's F13 frame — its "stable" basis measured +1.10 against the recorded +1.67, a contract-month spread no line can honestly state) |
| Engine | `2026.08.18.one-physics` (R1a complete: D2's one R accountant on every filled resolution; live grading on the sweep's resolution tiering with the row's stored runner-protection mode and review window; the decision anchor on the last completed primary bar; no-bars expiries marked; calibration cells unchanged from `2026.08.11.declines`) — 72 derived per-market cells across three tranches PLUS a decline layer of 15 markets the engine refuses to build setups for. **Both rest on the invalidated corpus** (banner above); the declines stand only on the conservative reading that the clock defect inflates expectancy. Deployed and verified in production 2026-08-18: deploy run 380 (#362's merge) green end-to-end including the E2E chart gate, run 381 (#363's ops/docs merge) green after it |
| Public face | The parking page |
| Gates | The seven `ci.yml` runs, named rather than counted: `check` · `lint` · `check:migrations` · `npm audit --audit-level=high` · `test` · `build` · `check:bundle`. This cell listed SIX and omitted `npm audit` — the same undercount the resume block was written to correct, reproduced in the cell a cold reader reaches first. No test count is given here: `npm test` is the authority, and two cells of this file disagreed by ~300 for days while both carried a disclaimer saying so |
| Repo | `main` is the trunk; the 2026-08-10/11 programme landed as #307-#322. Check `gh pr list` before trusting any count here |

### Merged 2026-08-06 → 07

`#256` Pacific session in Attribution · `#257` every FMP-matched market live ·
`#258` round 28 · `#259` the re-park · `#260` the re-park's verified logout counts.
`#240` closed unmerged — stale, and would have reverted #256 and #257.

---

## 2. Owner rulings now binding — do not re-ask

- **Amendment 39 (2026-08-27)** — **profit is the measure; win rate is a result.**
  Nothing publishes, ranks, gates or learns on a frequency where the money is
  knowable. Profit potential must exceed loss potential structurally and may
  never be manufactured.

  **The pre-registered candidates for when R3 can measure are the RUNNER LEG's
  placement/protection and the COST WEIGHT per trade** — the two axes 4b named.
  Runner protection is recorded on every resolution (`runnerProtection` beside
  `forgoneRunnerR`) and, **since #477, on every corpus row too**. Until then
  neither field reached the sweep, so this paragraph's claim that the modes are
  comparable was false where it mattered most: R3 is the one re-simulate, and
  it would have produced a corpus that could answer NEITHER pre-registered
  axis. The give-back is not reconstructible — `forgoneRunnerR` rebases the
  excursion onto the fill and the planned entry is not a column, so a reader
  would mix the two baselines, which is the defect #462 shipped and fixed.
  With both emitted, the three modes are comparable the moment
  outcomes accrue. Cost is the higher-confidence of the two: the venue bill
  tables are E8-published facts and `remediation-program-2026-08-11.md` lists
  them under "What stands", so its inputs are trustworthy today while the
  corpus is not.

  **REJECTED, 2026-08-30, and recorded so it is not re-proposed:** raising
  `tp1RiskShare` to lift the blended payoff. It is a pure risk multiple rather
  than a structural level, so moving it because the printed figure improves is
  the manufacturing clause exactly — and it converts small wins into whole
  losses, because part of the population that banks at TP1 today would never
  reach a TP1 twice as far and would take −1.00R instead of about +0.19R. The
  amendment carries the full worked example; an agent proposed this while
  holding the pen on the rule that forbids it.

  Measured today, and the reason any of this matters: a full win pays 0.95R
  (indices) to 1.20R (energies) against a −1.00R loss. **Indices is below 1:1.**
  Nothing is tuned until a valid corpus exists — the calibration stopping rule
  has not moved.

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
- **Amendment 34** — **the Guide tells the measured truth.** The six
  guide-copy rulings approved and landed 2026-08-11; reader-facing engine
  claims carry only what the current instrument has measured, and copy moves
  in the same change set as the engine or the divergence is a defect.
- **Amendment 35** — **the clean model, and where the docs duty reaches.**
  All users logged out and all trade history wiped 2026-08-11 (verified
  zeros, 13 accounts kept); docs-ride-along explicitly covers legal/risk/
  privacy pages, the Guide, Profile surfaces, READMEs and this file.
- **Amendment 33** — **the calibration mandate.** Per market, never per class; to
  each market's own discovered data limit; the geometry model reviewed before it
  is tuned. The standard: identify money-positive setups at a high rate, account
  for how each was derived, present figures the operator can defend.
- **Amendments 29–38** in the spec are the live standing approvals; read them
  there rather than re-asking. Earlier approvals that this file once recorded
  only by letter (*Decisions A–F*, *amendment 26*, *old sections 6 and 8*) are
  **gone** — they lived in the gitignored worktree handoff that was destroyed,
  they exist nowhere in this repository's history, and the spec's headings jump
  from amendment 25 to 29. Do not hunt for them; if one of those questions comes
  up again, re-ask it.

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

**BRENT/WTI: SETTLED 2026-08-09 on the owner's F13 frame** (docs/research/
e8-feed-verification-2026-08-02.md §F13). WTI +0.10, inside its own spread —
match confirmed, stays served. BRENT +1.10 against +1.61/+1.675 a week
earlier, mid-month post-roll — a time-varying contract-month gap, dormant
under amendment 32. Decided under the owner's simple-rules directive; the
frame, the exact-minute bars and the arithmetic are all in F13. *Follow-up
flagged:* WTI's printed +0.24 basis constant also measured +0.10 in F13 —
identity-safe, but the constant wants a multi-session re-measurement before
the line's number moves.

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

### 0 — CI verification integrity — **DONE, landed 2026-08-09**
`cancel-in-progress: false` on the deploy group; the other workflows keep `true`
deliberately (a superseded lint run should die, a superseded deploy must not). A
`preflight` job compares the run's commit to the branch tip and the deploy job
skips when a later commit owns the deploy — N rapid merges do one real deploy,
nothing started is ever severed, and a re-run of a stale deploy skips instead of
overwriting production with old functions. Fail-open with a visible warning if
the tip cannot be read. `tests/securityHardening.test.ts` pins the literal in
both directions; `docs/ci-recovery.md` carries the diagnosis notes (`cancelled`
= replaced while queued, `skipped` = superseded before touching anything live).
The landing PR's own deploy run was the watched green run.

### RUNNING — bank 1-minute bars
Started 2026-08-06. Twice daily at 07:20 and 19:20 local. Not scheduled work;
work to not break.
*Corrected 2026-08-09:* the launchd agents exist and are loaded —
`com.windwardline.levelflow-minute-bank` and `levelflow-cache-topup`, last exit 0,
recovered from the 2026-08-08 outage.
*Corrected 2026-08-12:* the roster is 97, not 100. Amendment 32 (#284) retired
`^MID`, `^STOXX50E` and `USDMXN` on 2026-08-09; their series end 08-07, 08-07 and
08-09 and cannot be backfilled — the amendment's correct outcome, not a loss. The
health note above was a count of symbols returning bars, taken that same day, and
a count cannot see a symbol that stopped being attempted: its sidecar keeps a
non-zero `fetched` forever. The run now names departures (#342); the watchdog
reads run recency. Store: 903,744 bars, 100 sidecars, 97 live.
*Still owed:* the bank has no backup, the same gap the 6.0 GB corpus has.

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

**ITEM 1 IS CLOSED — all thirteen letters, 2026-08-09.** The per-letter record:

Outstanding: *(none)* · the ledger below records how each closed. **1b** futures tick alignment (a missing contract spec must refuse, not
skip — measured 2026-08-09: 19 of 31 futures ship every price off-grid; 10 have no
spec, 9 are agriculture/livestock the futures-only gate never reaches; the fix set
skips EMD/NKD/FESX/FDAX, which item 1.5 makes dormant) · **1c** sizing coverage (a
lookup miss must fail the build — worse than recorded: `FUTURES_MAPPINGS` has 12
entries against 40 Futures-classified symbols, so 28 markets E8 demonstrably offers
render "Not offered"; amendment 22 constrains the fix to build/test failure, never
runtime withholding) · **1e — done 2026-08-09** (the two calendars reconciled on E8's own published
hours: agriculture gains its 19:00–13:20 CT grain session both sides — a corn
setup can no longer open into a venue that closed at 14:20 ET; livestock joins
the complex branch instead of FX fall-through; metals carry the maintenance
break on the client too; forex mirrors the 17:05 open and nightly rollover
pause; the complex's Friday hard close moves 16:30 → 17:00 per E8's table,
with the half hour kept as a NON-blocking thin-liquidity penalty — note: this
OPENS thirty Friday minutes the analyzer previously refused, flagged for 4d's
measurement rather than assumed good. `tests/sessionCalendarParity.test.ts`
pins every hard closure across the Deno boundary for every roster symbol;
low-edge gates stay the deliberate, stated asymmetry. 1f-c folds in: the
indices calendar comment's stale no-trade premise corrected, the complex
hours kept on their merits. ANALYZER_VERSION `2026.08.09.sessions-reconciled`) ·
**1f** indices display honesty — *1f-a done 2026-08-09* (the Indices row carries
`superseded: true` and its sentence says "under a configuration the engine has since
moved past"; re-measuring stays item 4's first act); *1f-b done 2026-08-09* (§5 in
both homes admits the held third state — a held bar never reads as derived) ·
**1g — done 2026-08-09** (the record gates on `MEASURED_POPULATION_BY_ASSET_TYPE`,
the rosters extracted from the replay commit `d947245` itself, so markets the
measurement predates render no record; ConfidenceUnit resolves symbol-first through
`confidenceThresholdForAssetOrSymbol`, so corn's meter ticks at agriculture's 30,
not Futures' 68) · **1h** delete the false curation claim — *1h-b done 2026-08-09*
(the "measured-edge curation" run-condition claim deleted from replayReliability's
docblock with its reasoning); *1h-a + 1h-c done 2026-08-09* ("All
markets" carries its earned Scan N — the curated-universe rationale was dead both
halves; trade-model.md's curation note now records amendment 31's second
supersession) · **1i — done 2026-08-09** (deck §3 amended
to the shipped four moments with §7's note form; guideAnchors pins both homes to
each other) · **1j — done 2026-08-09** (1j-a landed with the
record sentence's derived ±SE; 1j-b gates the Insights band's rate at the
attribution threshold and prints the denominator — "67% of 3", "Learning" below) ·
**1l — done for the live window, 2026-08-09** (all five copy affordances — four
prices and Size — gate on `expiresAt` against the stage's ticking clock; absent,
never inert, the Size-row precedent). *Residual resolved 2026-08-09 under the
owner's simple-rules directive:* the two rules were compatible — §17f governs
printed claims, §17c governs controls — so stored reopens now gate their copy
affordances through a derived `copyWindowEndsAt` that is consulted by the gate
and printed nowhere; the stamp still reads expiresAt alone, pinned both ways · **1q — display half done 2026-08-09** (the eyebrow reads "payoff after costs",
naming the basis; the Costs row prints the estimated round trip "already inside
the payoff figure" — the arithmetic closes on screen). *The formula half was
item 2's and is **CLOSED**:* `effectiveRewardRisk` charged cost in the numerator
AND the denominator, a double penalty ≈2×cost/risk, filed under 2d — and 2d
shipped in #288 on 2026-08-09. `executionQuality.ts` now divides by
`riskDistance` alone and its comment names the retired form ("one round trip,
charged once — against the payoff"). Verified 2026-08-23 by `git log -S`;
corrected in place because this entry read as open for two weeks after its fix
landed · plus 1o's residue: `targetLogic` is the same defect one field over
(unconditional constant), and `runnerProvenance`/`tp1Provenance`/`entryProvenance`
are computed and dropped, which blocks 4d's TP1 and runner phases.

Done: 1a, 1d, 1k, 1n, 1s · **1m + 1r 2026-08-09** (dead session ends the visit via
local sign-out on 401/PGRST301; profile keeps last-known on failed reads with a
loadFailed line in ProfilePanel; chart overlay stays silent on failure while the
notice speaks; analyzer splits thrown-fetch from thin-history in the blocked reason;
`hasVerifiedMarketDataSource` answers from the roster instead of vacuously true —
hardened twice post-deploy: refresh-before-sign-out because one 401 kills a token
not a session, and the public-auth E2E fixtures now seed REAL sessions, because the
fabricated session they were built on was itself the 1r defect state) ·
**1p fixed by #251** (2026-08-06, spec-present path) ·
**1o's `stopLogic` fixed by #248** (2026-08-06) ·
**1b + 1c + 1o-residue 2026-08-09**: fifteen new contract specs (ten from E8's
tick table, five CME-official under the ZB/ZN precedent — ZO/ZR grids confirmed
empirically as the price-delta gcd of the banked minute series, ZF/ZT by the
dossier's own 1/128 conversions); the alignment gate covers agriculture and
livestock; a spec-less futures-shaped market refuses at the analysis door with its
own reason (EMD/FDAX/FESX/NKD/FDXM refuse pending 1.5's dormancy — no specs were
added for markets leaving the view); `targetLogic` derives from tp1/runner
provenance and all four provenances now persist into `risk_model` (unblocks 4d's
TP1/runner phases); FUTURES_MAPPINGS 12→27 with a throwing absence register, so
28 markets E8 demonstrably trades stopped rendering "Not offered" — futures-line
tallies now 34 confirmed / 5 unconfirmed / 72 not-offered, sizeable 10→24
(PA/ZF/ZT/GF/ZO/ZR correctly withheld, amendment 22). ANALYZER_VERSION
`2026.08.09.futures-grid`.

**Two flags from the 1b/1c work, for the owner alongside the BRENT/WTI question:**
- The F9 futures-account frames show a live BZ row on the Energies watchlist —
  amendment 19 would call Brent OFFERED on the futures line, contradicting the
  three-listing cross-check the current `not_offered` rests on. Left as-is,
  recorded in the absence register's ground; decide with BRENT/WTI.
- ZO and ZR carry CME-official alignment ticks (0.25 / 0.005) — a provenance
  choice: exchange contract specs where E8 publishes none, the precedent ZB/ZN
  set. §20i ruling 5 untouched: nothing exchange-sourced entered the SIZING table.

**Measured while grounding the ticks, for item 2's file:** several FMP minute
series carry finer-than-exchange-grid prices — ZCUSX shows 0.01 deltas on a
0.25-tick contract, ZF/ZT decimalize to ~1e-5 — so minute bars are not raw
trades. Bears on 2h's bad-tick sanitisation and any intrabar path model.

### 1.5 — Unmatched markets go dormant (amendment 32) — **DONE, executed 2026-08-09**

Thirteen rows dormant exactly as audited: EMD/FDAX/FESX/NKD left the served
roster (futures 31 → 27, knowable 111 → 106, visible 102 → 98), FDXM left with
its parent (a variant may never outlive its market), and the eight CME currency
futures' spot mates were emptied from the match field with the identity work
preserved in the grounds. masterList's excluded-no-fmp-source register holds
all twenty no-source rows in three named families; mapped-not-yet-onboarded is
empty BY RULING and its pin survives; every dormant row is a reentry candidate
re-probed each run. The six cash index CFDs verified untouched — the contrast
is pinned ("the same ^GDAXI is right for DAX and was wrong for FDAX").

**BZ decided under the owner's simple-rules directive (2026-08-09):** amendment
19 applied to the F9 Energies sighting (BZV6 84.05 live) — BZUSD is OFFERED on
the futures lines, unsizeable (amendment 22), the ZB/ZN pattern; the last
no-route market closed. ~~BRENT/WTI remains the ONE open owner item: one E8
screenshot with the platform clock settles it.~~ **STALE — corrected 2026-08-31.**
That screenshot exists and settled it the same day the sentence was written: F13
(`e8-feed-verification-2026-08-02.md` §F13, owner capture 2026-08-09 21:44 EDT with the
platform clock visible) measured WTI.C against CLUSD at **+0.10, inside E8's own 0.120 spread
— MATCHED** and BRENT.C against BZUSD at **+1.10, nine spreads — NOT the same series**. BRENT
went dormant under amendment 32 (`masterList.ts:511-521`, `fmpSymbol: null`), and BZ's
`not_offered` was retired under amendment 19 on the F9 sighting (`instruments.ts:704-711`);
the futures absence register is now empty. **Nothing here is open.** This sentence, left
standing between the two acts of amendment 32, is what made a closed ruling look live — it
generated a 2026-08-31 recommendation to reopen it and restore a dormant row. Corrected rather
than deleted, because the record of a sentence that misled is worth more than its absence.

No ANALYZER_VERSION bump: roster membership changed, scoring did not — the
per-symbol learning cohorts of surviving markets are unaffected.

*The original spec, for the record:*
Owner ruling: any market without a genuine FMP match is dormant and excluded from
the user's view. Data integrity outranks coverage. Universal — every broker, every
account type.

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
**COMPLETE 2026-08-10.** The engine change set shipped and deploy-verified
(#288 + CPU fixes #289/#290 — two 546 postmortems, both Intl-construction
costs, regression-pinned); cohort `2026.08.09.evaluator-repair` live. The
one re-sweep ran to completion on the third attempt (attempt 1 OOM'd on
the driver holding every symbol's bars for the manifest — fixed #296;
attempt 2 crashed on fold slicing giving mid-fold-starting symbols zero
warm-up — fixed #298): **corpus `3b108f43d4c2`, 1,017,734 records,
1.2GB, manifested, folded (fit 2009–2018 / select 2018–2022 / confirm
2022–2026), 18 holdout markets, evidence-enriched** (legs, excursions,
exit clock, risk unit per record — #292/#293). Reports:
`docs/research/baseline-2026-08-10/`. **The corpus door reads at corpus
scale** (#299 — Node's max string length forced a chunked reader).

**THE MEASURED RESULT (read before anything else):** on the honest
instrument the accepted stream is NEGATIVE in every class — forex
−0.057 ±0.009 clustered, crypto −0.122, metals −0.225, futures −0.279,
agriculture −0.367, livestock −0.161. The pre-repair +.89/.90/.83
resting-state record was measurement error, not edge. The decomposition
(4b evidence): TP1 banking genuinely positive everywhere; the runner
half loses it back; cost ≈ half of banked R in the best class; 44% of
forex fills touch TP1 (+0.92R median MFE) then scratch at breakeven; the
stop cap binds on ~100% of setups; gap tails run 13–32% beyond −1.1R;
confidence ρ ≤ 0.06 (does not rank); the review window censors nothing
(p50 exit 0.5h) and only sizes geometry. NOT an incident: the desk is
parked, no live reader sees these numbers, and no roster action follows
(the per-market 2σ exclusions are symptoms of the systemic model failure
— amendment 31 stands).

### 3 — Repair the acceptance procedure, then re-derive
**COMPLETE 2026-08-10 on `item3/acceptance-procedure`** (six commits, 3a–3g
all landed). `scripts/sweepStats.ts` is the one vocabulary every reader
uses (engine definitions; rSumSq so deviation is measured, never assumed;
`assertManifestedCorpus` — no unverified corpus aggregates).
`scripts/grid-totalr.ts` is the acceptance gate: emit-driven (the e×n
table mismatch is dead), **3f** deltas in standard errors with select ≥1σ,
**3g** total R AND per-trade expectancy jointly, **3b** a seeded
day-block permutation null pricing every claim. **3a**
account-type-report measures per-market SEs from the corpus and clusters
the rollup SE by market (the ±0.005 prose constant and `--r-sd 0.8` are
gone). **3c/3d/3e** `scripts/sweepFolds.ts`: common-origin calendar folds
fit/select/confirm (50/25/25) over the corpus's measured span, decisions
embargoed 5d before each fold closes (simulateSymbol gained
`decisionEndMs` — decisions stop, resolution keeps reading), and a
deterministic market holdout (sha256 mod 5) written into emit + manifest,
excluded from every tuning aggregate. Legacy two-split corpora map
train→fit/test→select from their own manifest — the item-2 baseline
corpus reads fine. Re-derivation (the "then re-derive" half) is item 4's
program, which now has its instrument.

### 4 — THE CALIBRATION PROGRAM (amendment 33)

> ⛔ **EVERY RESULT IN THIS SECTION IS INVALID.** The corpus beneath it
> resolved setups 4–5 hours out of register with their own decision bar.
> No count of confirmed cells, no expectancy, no fill rate below this
> line is evidence of anything. The section is kept as the record of
> what was measured and how it failed. The live plan is §4's **R0–R6**
> table; the diagnosis is
> `docs/research/remediation-program-2026-08-11.md`.

**CONVERGE ROUND 8 RAN 2026-08-10 23:20 (owner-invoked)** — seven
adversarial lenses, 73 findings, ledger + dispositions of record:
`docs/research/converge-round-8-2026-08-10.md`. Synthesis **as written
then**: the corpus is honest; the verdict layer, cost model, identity
seam and product story are not. The first clause was **overturned on
2026-08-11** — the corpus was not honest, and that is the whole reason
this section is quarantined. The 4c grid's ACCEPTs are demoted to DIRECTIONAL evidence (the
permutation p was printed but not enforced — one committed ACCEPT at
p=0.146; the confirm fold was burned by unconditional printing; the 4b
axis choice consumed pooled folds). The batches below are ranked INTO
this item's remaining path — the gate becomes a gate before anything is
accepted, the venue's real bill enters the engine before 4d derives.

**Ranked path from here (updated 2026-08-11):** (i) **Batch 1 SHIPPED**
(#308): gate v2 — paired day-delta sign-flip permutation with
family-wise max-T, p ENFORCED, confirm-fold discipline by mechanism
(burned-log), read-time stratified holdout, censoring + survival
readouts. (ii) **Batch 2 SHIPPED** (#309): strict roster-only
classifier in both measurement paths, 105 arithmetic, live-cohort SQL,
identity annotations on all five baseline evidence docs. (iii) **Batch
3 SHIPPED** (engine v2, `2026.08.11.engine-v2`): venue commissions per
line + crypto-book spread floors (CO-2 joined per the no-silent-drops
rule), bid/ask trigger space with gap prints and reopen slippage, 5min
resolution, expiry-boundary clip, net-of-cost expired labels, same-bar
protection arming, latency/haircut/touch parameters, Intl hoists.
Named boundary: live outcome-sync stays v1 until the spread columns
land (batch 4, pre-reopen) — desk parked, so the cohort stays coherent.
(iv) **4c COMPLETE 2026-08-11** — the v2 fleet ran to 8/8 manifests
(corpus 3c47e2036e1b, ~21M records, 8-class fold calendars) and gate v2
graded it with confirm SEALED. Verdicts of record:
`baseline-2026-08-10/4c-grid-verdicts-v2-2026-08-11.md` (raw gate
output beside it). The synthesis: the stop cap is THE axis — the
shipped 1.0×ATR fails its own baseline in every class, ΔE(select)
rises monotonically to cap 4 (forex +0.286R/decision, metals +0.369,
energies +0.442, all p=0.001 family-wise) and worst-day totals SHRINK
as the cap loosens; runner protection ranks trail_tp1 > hold >
breakeven everywhere that accepts (the 44% breakeven tax, confirmed by
intervention); the sizing-hours hat is inert; livestock accepts
NOTHING and stays measure-only (the gate refusing thin evidence is the
system working); energies' accepted cells carry a stated 42-43% expiry
share for 4d to re-examine.
(v) **4d DERIVATION COMPLETE 2026-08-11** — every market graded on its
own rows (marketVerdicts: singleton groups, same statistics, 30-filled
floor), RM-1 feasibility joined from published venue arithmetic only,
choice FROZEN, then the confirm fold's first and only read (burned
log): **41 picks frozen, 39 CONFIRMED POSITIVE on never-touched data,
2 reverted (HOUSD/RBUSD — the fold doing its job)**; 11 capacity-gated
(treasuries, PA, ZO/ZR, six sub-dollar coins — RM-1's exact class), 7
measure-only incl. livestock, 18 starved, ~20 held out as the next
cycle's unseen validation. Record:
`baseline-2026-08-10/4d-derivation-2026-08-11.md` + four JSON
artifacts. **SHIPPED
2026-08-11 (`2026.08.11.derived-4d`)**: the 39 confirmed cells live in
SYMBOL_CALIBRATION_OVERRIDES verbatim to the frozen picks
(artifact-pinned both directions in tests/calibrationState.test.ts),
CLUSD's cell layered over its measured-active legacy fields, the UI
derived-floor mirror under the exhaustive parity sweep, class pins
moved to getClassCalibration. Then the **HOLDOUT CYCLE
RAN SAME-DAY on the owner's word** (they were unclear why it should
wait; it should not have): the twenty never-tuned markets through the
same pipeline on their own untouched rows — **11/11 frozen picks
confirmed, a perfect sweep, EURUSD among them** — shipped as
`2026.08.11.holdout-cycle` (50 derived cells total, artifact-pinned);
4 capacity-gated, 1 measure-only, 4 starved. Then the **TOTALITY
CYCLE (owner mandate: data limits may never be ambiguous)** — the
starvation autopsy proved the per-CLASS fold calendar was the limit for
22 markets carrying years of real history; folds re-cut per MARKET over
each market's own span with exact per-row leak containment; all 45
underived markets rerun: **22 more confirmed (silver, DAX, both
treasuries, oats, Brent, eleven coins), 5 confirm-refused, 18
measure-only on full spans, ZERO starved** — 72 derived cells total
under `2026.08.11.totality`, capacity now per-line DISCLOSURE (the §19
governor refuses per account at runtime). The defense table in the 4d
derivation doc backs every non-derived market with a measurement;
ZTUSD's 32% ladder-refusal is the one NAMED parameter suspect (tick
minimum), its probe requiring an engine change and its own cycle.
(vi) **4e DECLARED CLOSED** per the stopping rule: tuning folds
consumed, confirm burned three times (every read logged), the next
unseen validation is live accrual itself under the derived cohort. The
remaining reopeners: new data, or ZTUSD's named tick-minimum probe. Parallel lanes before any reopen: **Batch 4
COMPLETE 2026-08-11** — #313 (ambiguous counts against the trade in
learning/classify/attribution; all six Record rows state supersession),
#314 (live outcome-sync replays each row's stored decision-time costs —
the engine-v2 named boundary closed), #315 (the correlation gate
screens the whole complex: symbol-union query, jpy/alts/products union
groups, curve/grains/livestock/PGM primaries), PH-9 (the payoff refusal
names its cause: cost-driven vs geometry), PH-6/PH-11 moot-by-wipe per
the ledger. **Batch 5
COMPLETE 2026-08-11** (one PR: 429 retry module behind the driver's
three fetch sites + pacing knob, outcome-sync 12s budget under the 15s
invoker + 60-day counted analyzer_events retention with README amended,
top-up roster-derived, cache lifecycle script — 2.8GB legacy era
reclaimed on first --apply; OP-2 unlocatable post-compaction, recorded), **Batch 6**
owner-gated Guide copy review — **DOC READY, AWAITS THE OWNER'S ONE
PASS**: `docs/research/guide-copy-review-2026-08-11.md` (six rulings:
the score-separation story, the stop story, the dead replay
description, the breakeven promise incl. the languageGuard-pinned law
sentence, the missing commission in §6, the Banked-half glossary line;
plus the checked-and-stands list). Named boundaries
disclosed in the ledger (pre-holdout constants, single-instrument
completion probes, COT timing, 4b's pooled read).

**4a COMPLETE 2026-08-10** — per-market, per-timeframe measured limits in
`docs/research/baseline-2026-08-10/4a-data-limits.md` (from the manifest:
spans, first/last, counts, largest gaps; grains 1,050d, XAUUSD 4,774d
with a 33.9d hole flagged; holdout 18 listed). **4b MEASURED, DECISION
SHEET AWAITS THE OWNER** — `docs/research/4b-geometry-model-review-2026-08-10.md`
carries the five questions answered from the corpus and a recommended
verdict per line (runner-protection axis, real stop-cap axis, retire the
threshold gate for 4c, split the window's two hats, no regime axis,
cost-aware acceptance). **4c runs only after the owner rules.**

**This is the point of the whole retrofit, and it is not one item.** Everything
above exists so this can be done once, honestly.

The standard, per amendment 33: the engine identifies money-positive setups at a
high rate, can account for how each was derived, and presents figures the operator
can rely on and defend to someone else. **Find, justify, defend** — three
obligations, and the second is the one most often dropped. A calibration that
lifts expectancy while remaining unable to explain itself fails this as completely
as one that lifts nothing.

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
All ~~111~~ **97** (the 111 is a superseded universe — see the items 5–11 note
above; the conclusion does not depend on it), at the repaired evaluator (item 2),
on the discovered spans (4a), in
whatever model 4b settled. **Crossed axes** — `replay-sweep.ts` takes
`--grid a=1,2;b=3,4` now, and a lever downstream of risk cannot be derived at
another lever's old setting. Corpus manifest per 2i, so no analysis can silently
read a corpus built under different calibration.

**`--byte-budget` is now required and the sweep will not start without it**
(§21j Phase 1, after the 2026-08-13 blackout). Declare a ceiling in bytes or
with a `gb` suffix — `--byte-budget 20gb` — and the run halts the moment its
measured payload crosses it. FMP bills bytes over a trailing 30 days; the
sweeps spent a 150 GB allowance in days, and every day the minute bank stayed
dark after that was a day of permanently unrecoverable 1-minute history. Size
the ceiling deliberately before a long sweep. Raising it is a decision; there
is no way to turn it off.

#### 4d — Derive per market, not per class
Every parameter family, per market, gated by item 3's acceptance procedure —
nothing ships that does not clear its own out-of-sample bar corrected for the
family it was selected from:

- **stop** — cap, ATR multiple, structural floor, pivot search. Note 8a,
  **corrected 2026-08-25**: this said the floor makes the cap bind
  unconditionally in seven of eight classes, so "both levers are dead. Fix
  before deriving." That is false, and it is an instruction, so an agent
  obeying AGENTS.md's order to read this file first would either skip stop
  derivation as pointless or repair geometry that is not broken. Measured over
  the 97-market scan roster: `maxStopAtrMultiplier` is 1.0 on **26** markets,
  2.5 on 6 and 4.0 on 65 — so the cap binds by arithmetic on 26 and **71 have
  both levers live**. The class-level reading predates the per-market cells.
  Those cells come from the 4c/4d corpus the banner above declares invalid, so
  this states where the mechanism stands and settles nothing about whether the
  cells are right.
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

### 4.5 — What the 2026-08-11 audit found (read before item 5)

A six-domain adversarial audit of this file's own claims ran after item
4 closed. Three of its overturns are load-bearing:

1. **The gate measured improvement, not positivity.** 50 of the 72
   shipped cells are money-positive on the held-back fold; **20 are
   not** — they lose less than the baseline, which is what "confirmed"
   meant. A threshold rescue across every threshold their own scores
   admit FAILED. **RULED 2026-08-11 (amendment 36):** they may be
   withdrawn, but only on evidence that survives the removal of our own
   modelling choices, and they stay reentry candidates forever. **That
   test ran, and it was a no-op.** `LEVELFLOW_MODELED_COST_SCALE=0` never
   reached the replay resolver (defect 1c), so the "gross" arm charged
   the same costs as the net one — 11 of 20 rows came back bit-identical,
   which is proof the switch did nothing, not agreement. **Amendment 36's
   standard was therefore never met for the 15 declines.** They stand
   only on the conservative reading that the clock defect *inflates*
   expectancy, so a market measured negative under it is very unlikely to
   be positive under a correct measurement. Re-deciding them is Phase 4's
   job. **The knob is real since M5 (2026-08-31)** — what the re-decision
   now waits on is a gross corpus, and section 5 item 5 is the constraint
   on producing one. Full record:
   `docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md`,
   "Absolute-expectancy addendum".
2. **The roster headline was a sum of account views, not the offering.**
   97 distinct markets; 45/33/27 per account type sum to 105 only by
   double-counting eight dual-listed crypto CFDs. Corrected here and in
   trade-model, pinned in `tests/calibrationState.test.ts`.
3. **Item 0.5's residual is closed** — `anon`'s grants on the engine
   tables are revoked and pinned (they were inert behind RLS, which is
   why it was worth closing before a future policy made them live).

### THE SEQUENCE NOW — the rebuild is items R0–R6, and it outranks everything below

CONVERGE re-ranks *this* list. The old items 0–4 are CLOSED but their
results are invalidated; items 5–10 belong to the next CONVERGE
(amendment 37) and are sized against a superseded 111-market universe —
the live roster is 97 distinct markets.

| rank | item | state |
|---|---|---|
| **R0** | One clock — rebuild `.calibration-cache` under a single normalization, assert it in the manifest | **code half DONE 2026-08-18** (see below); **rebuild UNBLOCKED same day** by the owner's 100 GB upgrade (probes green, `to`-inclusivity settled) — one budgeted studio-machine run per `docs/cache-rebuild-r0.md`, minute bank kickstart FIRST. **DATA HALF: STEP 2 COMPLETE 2026-08-24 02:07 UTC — 97 of 97 markets warmed**, cache 7.6 GB, 2.10 GiB of the 30 GiB budget spent, no 429 and no quota event. It took three runs: the first stopped at 81 on DYDXUSD and the second at 82 on ALGOUSD, both FALSE clock-witness refusals, fixed in #383 and #384 — the third ran clean end to end. **STEP 3 RE-RUN 2026-08-31: 590 ok, 66 RED — and every one of the 66 is a
SOURCE FAILURE. Zero clock failures.** The clock question this step exists to answer is
GREEN, including the Treasury curve (3,414 rows, 2013-01-02..2026-08-26, largest gap 4d).
The 66 span 33 markets, **all 33 crypto and none forex** — an earlier line here said
"31 crypto, 2 forex", which was a PROVIDER-ALIAS error: the store filenames carry `ARUSD` and
`OTRUMPUSD`, the provider symbols for ARWUSD and TRUMPUSD, and `getAssetType` classifies those
two aliases as forex. Each is "silent for ~1.0 days against a recent
baseline of ~0.0". Crypto is the only 24/7 class, so it is the only one whose baseline makes a
one-day silence anomalous; the non-crypto roster passes because its weekends and overnights are
already in its baseline. The CAUSE is that the cache top-up has been deliberately stopped for
the exhausted FMP allowance: the whole cache is 108.4h stale. The script's closing line
nonetheless reads "Rebuild per docs/cache-rebuild-r0.md; do not sweep or top up against this
cache" — advising a ~14-hour metered rebuild for a cache whose clock is provably clean. Recorded
as a MEASUREMENT here; the instrument question it raises is ranked separately.
**The earlier run's verdict, for the record: RED, 480 ok, 5 failed.** Two are R0c exactly as predicted (Treasury head 275 days short; interior gap 278 days). The other three are NOT data defects and are R0e below. **Steps 4 and 5 stay owed** and must not run until step 3 is green.

**STEP 3 IS GREEN — 2026-08-25 15:20Z. THE V4 REBUILD IS ACCEPTED.** 97 of 97
markets, all three series each, 7.65 GB, verified independently of the run log
by deriving the roster and resolving each provider symbol. `verify-cache-clock`
exits 0: "All stores stamped and witnessed on one clock", and now prints the
corpus's own as-of beside it.

Getting there took five build attempts and cost five defects, every one of
them in the instruments rather than the data:
(1) the wrapper reported success on an empty exit status;
(2) its replacement used `status=$?`, which is read-only in zsh, so it could
    never report success either;
(3) `fetchFmpWithRetry` branched on HTTP status, so a socket THROW bypassed
    the retry entirely (#412);
(4) 40 seconds of ladder could not span a minutes-long outage (#414);
(5) the retry covered getting a response and not READING one — the body is
    the large, slow part, and it streamed outside every guard (#417).
Then the finished cache failed its own gate twice more: a 16.4-hour ragged
edge, because `store.pinned[anchor]` froze each market at whatever moment it
was fetched (fixed by `--repin`), and a staleness bound that judged against
the wall clock and ignored the bar in flight (#420) |
| **R0b** | **Back up the MINUTE BANK first, then the cache** — re-ranked 2026-08-23 after measurement. `.minute-bank/` is 182 MB, 1,687,458 bars across 100 symbols, spanning 2026-08-04 to 2026-08-23, and FMP re-serves 1-minute bars only ~3 days deep — so **roughly 84% of it is unrecoverable if lost today**. `.calibration-cache` is expensive (~14 hours, metered bytes) and reproducible in KIND but NOT IN DEPTH — see the rebuild-depth rule below, which corrects this sentence. The original ranking gated the cheap irreplaceable half behind the expensive reproducible one. A dated local snapshot was taken 2026-08-23 (`~/levelflow-minute-bank-snapshot-20260823`, verified equal on symbol and bar counts) as a STOPGAP — a point-in-time copy starts going stale immediately, so the deliverable is still a recurring mechanism, not that copy | **THE RECURRING MECHANISM LANDED 2026-09-01.** `scripts/ops/backup-minute-bank.sh` on a launchd agent (`com.windwardline.levelflow-minute-bank-backup`, daily 20:10, `RunAtLoad`), verified registered and firing. It counts the bank, copies through a `.partial` path, RE-COUNTS the copy and refuses a mismatch, refuses an empty bank rather than overwriting a good snapshot, and prunes to a fortnight. On APFS the copy is a clone: 219 MB in about a second, so retention costs a fraction of its nominal size. **It touches no provider**, which matters because the bank is frozen precisely when the allowance is exhausted. **The 2026-08-23 naive-era corpus is protected BY NAME** — pruning oldest-first would have deleted it first, and a retention count cannot protect the oldest thing; `tests/minuteBankBackup.test.ts` proves that by execution. Re-measured at the mechanism's first run: 100 symbols, 2,067,013 bars. The cache half stays after R0 step 3, before step 5 deletes the archive. **RAISE BEFORE STEP 5 RUNS (2026-08-24)**: that archive is the ONLY real naive-era corpus in existence, and it was used on 2026-08-24 to validate the #384 clock-witness redesign against real data rather than synthetic fixtures — old and new witnesses condemn the identical 64 stores in it, 8 on transition evidence alone. Deleting it means no future clock instrument can ever be checked against anything but fixtures. Owner call** |
| **R0c** | **CLOSED — verified 2026-08-31.** The chunking fix landed in #379 (`chunkMs = 60`, under the endpoint's 90-day window clamp) and the store has since been refetched. Measured on the store as it stands: **3,414 rows from 2013-01-02 to 2026-08-26, 95.9% of business days, zero gaps over 14 days** — against the 853 rows / 25.4% with 275–278 day gaps this entry was opened for. No probe and no further fetch is owed | **CLOSED — the entry outlived the fix** |
| **R0d** | **CLOSED 2026-08-30 (#475) — by re-deriving the class floor, not by adopting a per-symbol baseline.** `assertFiveMinuteDensity` refused the whole corpus when a symbol's recent-90 5-minute density fell under its class floor, and `crypto: 260` was refusing DYDXUSD at 249.6. **The census settles it** (`docs/research/five-minute-density-census-2026-08-30.json`, measured off the warm stores): forex floor 150 / ceiling 204.7 = 0.733; metals 140 / 196.5 = 0.712; crypto 260 / 288.0 = 0.903. Crypto's floor sat ABOVE the thinnest market it bound (ratio 1.042) — a floor above its own population can only refuse a healthy member. Re-derived as forex's ratio (the tightest any sibling carries) applied to crypto's own measured ceiling: 0.733 x 288.0 = 211, shipped as **210**. Anchored on the CEILING, so the disputed market is nowhere in its own threshold. **THE PRIOR ENTRY'S PREMISE WAS BACKWARDS**: it called crypto "the only class whose homogeneity is empirically false". 28 of the 31 measured crypto markets sit at exactly 288.0 and the class CV is 2.5%, making it one of the MOST homogeneous on the roster — the defect was under-sampling (two probes, both at the ceiling), not heterogeneity. That is why no per-symbol baseline, no new manifest fact and **no R2b dependency** were needed. Cost, stated: the depth floor is the only instrument that sees a clip applied symmetrically to both resolutions, and its blind band widens from a 10% clip to a 27% one — which is exactly where forex (27%) and metals (29%) have always sat, so this makes crypto consistent with the fleet rather than more permissive. Both clip fixtures in `tests/sweepStats.test.ts` (144 and 200 rows/day) still refuse. `tests/densityFloorDerivation.test.ts` pins the RELATIONSHIP rather than the constant — no floor above its class minimum, all floors inside one band, nothing in the measured population refused, and a half-clipped feed still caught. | **CLOSED — was never an owner call once the population was measured** |
| **R0e** | **`verify-cache-clock` never received two refinements the corpus door already has** — NEW 2026-08-24, found by running R0 step 3. Three of its five REDs are instrument drift, not data: `DYDXUSD 2.17`, `ZOUSX 1.78`, `ZRUSD 2.37` on the 5min/15min ratio. The corpus door (`sweepStats.ts`) judges that ratio on the RECENT-90 intersection window and only for SLOT-DENSE markets (`DENSITY_RATIO_PRIMARY_FLOOR = 60` 15-minute-equivalent rows/day). `verify-cache-clock.ts` counts the WHOLE overlap span and self-selects nothing — it contains zero references to the slot-dense floor. The consequences are exact: ZOUSX runs 22.5 and ZRUSD 16.2 fifteen-minute rows/day, so the door never judges them at all, and both are agricultural trade-sparse series this codebase already documents as honest ("ZRUSD ~36 prints with intra-session holes"); DYDXUSD clears the door at 2.83 on the recent window and fails the verifier at 2.17 on the whole span, because its early thin era is where a 15-minute parent holding one print yields one 5-minute child — the parent-child degeneracy the source comment names. **This is the FOURTH instance tonight of one shape**: a threshold applied to a population it was not derived for. #382 (whole-span window vs recent), #384 (a resolution-dependent band), R0d (a class floor set from the densest members), and now an instrument that never got its sibling's fixes. Unlike R0d this needs NO new mechanism and NO manifest fact — both refinements exist, are documented, and are in production in the door; they simply were not propagated | **before R0 steps 4-5, and it blocks them** — step 3 must be green before the top-up agent is re-armed and before step 5 deletes the archive. Lower risk than R0d: this is making two instruments agree where one is already known-correct, not choosing a new threshold. **Check any new instrument against DYDXUSD before merging it** — the roster's thinnest crypto has now tripped three separate doors calibrated on dense members (clock witness #383/#384, the density floor R0d, this ratio) |
| **R0f** | **CLOSED — verified 2026-08-31.** `BAR_CLOCK` is now `venue-wall-utc-v4` and all 288 rolling stores in the cache carry it, so the normalizer fix landed AND the stores were rebuilt under it. Verified from the stamps rather than the version string: modal intraday UTC hours are now venue-correct — ^N225 01–05Z (Tokyo 00:00–06:00Z), ^GDAXI 12–13Z (Frankfurt 08:00–16:30Z), ^AXJO 02–03Z (Sydney 00:00–06:00Z), against ^GSPC 18–19Z. Under the +13h/+6h/+14h displacement this entry describes, all three would have sat in New York hours. They do not | **CLOSED** |
| **R0e** | **DONE 2026-08-24, amended by the converge that ranked it.** `verify-cache-clock` never received two refinements the corpus door has. Porting BOTH — the obvious fix — would have deleted coverage while reading as convergence: at the door the slot-dense filter has a fallback (an absolute class floor), here it has none, so porting it takes ZOUSX and ZRUSD from RED to unjudged and ZCUSX, ZSUSX, ZLUSX, ZMUSD, LEUSX, GFUSX and HEUSX from passing to unjudged. **So only the window was ported.** The recent-90 judgment is a real measurement correction — DYDXUSD 2.17 → 2.83 — and moves the nine thinnest markets by less than 0.07. In place of the slot-dense filter the population SPLITS: slot-dense markets keep the band; markets below it are judged CONSTRUCTIVELY with no constant, every 15-minute parent holding at least one 5-minute child in `[t, t+15m)`. That is the 1b sawtooth's actual signature — it ran 0.6–1.0 children per parent, so parents stood EMPTY — while honest sparseness thins a parent without emptying it. Verified on the R0 cache before building: **zero empty parents of 25,157** across the nine (the converge reported 30,157; its own per-symbol figures sum to 25,157). Five mutations run; two survived the first round and are why two more fixtures exist — a child in the `:10` slot, and a thin early era against a healthy recent one. The `:10` fixture found a real defect in the implementation: the LAST parent's third child sits past `overlapEnd`, so an uncontained parent read empty and would have condemned every healthy store for one bar it could never cover | **CLOSED.** Step 3 now REDs only `^AXJO`, `^GDAXI`, `^N225` — three markets on two timeframes, all R0f. Every false positive is gone and 15 markets that fell between the two instruments are judged for the first time |
| **R0g** | **The weekly-open witness could not fail, and it was the sole source of the clock verdict for most of the cache — FIXED 2026-08-24.** It proved "utc" when the EST modal week-open hour sat exactly one after the EDT one. That property is imposed BY THE NORMALIZER: every stamp passes through `newYorkWallClockToUtcMs`, so the New York DST signature appears whatever the provider's label meant. Its positive verdict was the store's own construction restated as evidence about the store. Reproduced against the real transform before changing anything — a series opening at a fixed LOCAL hour read as New York wall gives Tokyo 09:00 → `{edtHour 13, estHour 14}`, Frankfurt 09:00 → `{13,14}`, Sydney 10:00 → `{14,15}`, and NYSE 09:30 → `{13,14}`: **Tokyo's block is byte-identical to the NYSE block**. In the live cache `^GSPC` and `^N225` carry the same pair while their venue anchors read `anchored` and `displaced, 13 hours out of register`. **The weekly block is now EVIDENCE, not a verdict** — the modal hours are a real observation and stay recorded; what is gone is the claim they prove anything. `SeriesClockWitness` also gained `verdictFrom`, because the two sub-verdicts were collapsed into one field so no reader could tell a constructive verdict from a circular one. Census after the fix: **96 daily `utc from=daily`, 62 intraday `utc from=transition`, 130 intraday `indeterminate from=none`** — 130 of 192 intraday stores now say honestly that nothing witnessed them, where they previously carried a blessing. A dead `??` was removed in the same pass: `transitionWitness` always returns a verdict, so the fallback was unreachable, and the first mutation written against this change was inert because of it | **DONE.** The cache is not newly refused — `assertManifestedCorpus` condemns `naive`/`mixed`, never `indeterminate` — so step 3 still REDs only the three displaced indices. The honest abstention is the POINT: those 130 stores have no absolute instrument, which is what C3 (common-bar-grid registration) exists to give them. Until C3 lands, `sessionAnchorWitness` covers the six indices and nothing else |
| **R0h** | **The relative registration test issues a CLEAN BILL against a real displacement, for the markets that have nothing else — FIXED 2026-08-24 (converge C3).** `crossSeriesClock` buckets day extremes on the UTC calendar day, so a one-sided shift is visible only when it moves a day's high or low across UTC midnight. For a market whose session sits INSIDE the UTC day a four-hour mis-registration moves no extreme, so the instrument does not abstain — it reports `aligned` at `matchRateAtZero` **1.000**. Verified against the actual 2026-08-11 naive transform on GFUSX, HEUSX and LEUSX, whose sessions occupy UTC 13–19 only. Those are the same nine markets the density gate abstains for (R0d/C4), so they had NO instrument at all. **`gridRegistration` is the replacement, and it has no calendar in it**: a 15-minute parent must BRACKET whatever 5-minute children it holds, because those children are the same trades. Containment is a property of the aggregation, not of a timezone — a shift breaks it and sparseness cannot, since a parent holding one child still brackets that child. Measured across all 97 markets on the R0 cache: **worst healthy violation 0.00301%** (THETAUSD, 3 of ~100k), **weakest detection under a shift 57.9%** (over ±1, 4, 5, 6, 13, 14h), **separation 19,271×**. The healthy violations are provider inconsistencies where a parent equals only its first child — one bar in ~400,000 on EURUSD and BTCUSD. `judged === 0` is a REFUSAL, not a pass: two series sharing no common grid is a defect. Wired in all four layers the anchor has — the verifier, the driver's fail-fast, the manifest, and the corpus door. **Two implementation defects were found by the mutation round, not by review**: the window was bounded by `min(lastPrimary, lastFive)` when a parent's children legitimately extend past its own timestamp, dropping the last parent even when all three children exist; and in the density law the parent loop and the child SET were bounded differently, so the boundary parent was checked against a set its own child had been excluded from | **DONE.** The nine session-interior markets have an absolute instrument for the first time. The 130 intraday stores reading `indeterminate from=none` after R0g now carry one too |
| **R0i** | **THE LEDGER REACHES DISK — CLOSED 2026-08-31 (#486).** `rejectionLedger` has been built in `simulateSymbol` since 2026-08-24 and RETURNED, and the driver never read it — every run assembled a per-decision account of what the engine declined and threw it away. The same field-lost-in-transit shape as #457, #471 and #484, one layer below. It now writes to `${emit}.rejections.jsonl` with the join keys (`holdout`, `split`, `symbol`, `variant`) beside the reason and the instant. **A SIDECAR, not extra lines in the emit**: every reader does `JSON.parse(line) as Row` and would take a rejection line as an outcome with undefined fields — a silent wrong answer across a dozen scripts, to buy nothing the join key does not already give. The manifest records `rejectionLedgerRows`, so `readRejectionLedger` refuses a truncated or missing sidecar rather than reporting a sweep that declined less — the direction a reader will not question. Absence is not a refusal when the manifest never claimed one, so the deliberate historical reads survive. **Found while testing**: the ledger and the counters legitimately differ by `belowThreshold`, which is an AGGREGATE of the acceptance gate's three branches and takes the counter without a ledger row to avoid double-counting. The guard asserts that identity rather than skipping the field, so a fourth branch added to that gate and left out of the aggregate fails instead of under-counting silently. Six mutations, each verified applied. **Item 2 of the same enumeration also landed (#487)**: the plan prices `entryPrice`/`stopLoss`/`takeProfit`/`takeProfit1` are now columns. `legs` carries FILL prices and is empty on an unfilled row, so the corpus recorded no price the order ever rested at, and §2.6's back-edge shift could not be re-resolved offline. They are the ALIGNED levels — what the operator would have placed — and #472 established that recovering those means running production's own `applyFuturesTickRules`, which is the reimplementation hazard. The same PR states, once, WHICH ANCHOR each of the emit's three distances uses: `stopPivotDistance` and `runnerNearestBeyondMinimum` against the PLANNED entry (geometry facts — the stop chain and the ladder both run before alignment), `unfilledApproachDistance` against the RESTING order (an execution fact). Both correct, not interchangeable, and mixing them is the defect #462 shipped. **The visibility set landed too (#488)**: `frameTailMs` per frame, `availableTimeframeCount` (which VARIES 4–5 — the manifest's floor is not a value), `dailyVisibleCount` + `dailyTailCompleteAtMs` (429/433, and the completion instant is what lets a reader test whether live's wall clock would have admitted one more), `newsActiveCount` / `newsUpcomingCount` / `nextHighImpactMs` (483/484/502 — the loop shaped every event down to type and impact and discarded the instants), and `treasuryLabelMs`. `spreadSource: "modeled-by-construction"` landed as a CONDITION, since the sweep passes `quote: null` on every decision — it does not close §2.11, which is unrecoverable at any price, but it records which side of it the corpus sits on. **Three fields were deliberately NOT emitted, each exactly derivable**: `symbolTailMs` (the manifest's `series[].lastTime` already carries it; per row it would be a constant column — the enumeration invited this check), `resolutionStreamStartMs` (`time + 15min` by FR-5), and `expiresAtMs` (`time` plus the review hours of the calibration the row's `variant` names). **R0i's per-row work is now complete.** | **the ledger, the largest single gap, is closed; the remaining per-row fields are not** |
| **R1** | One engine — close every sweep↔live divergence (E1 resolution anchor, E2 the 5-min sawtooth, E3 `market.latest`, E6 score terms, E4 correlation collapse, D2 realized R on non-expiry branches, **plus discovered E7**: the options bridge drops the runner-protection mode, so live grades every row "breakeven" while the calibration ships trail_tp1/hold). D3 done (#333); E2's fetch half (chunk sizing) landed with R0. **The map**: `docs/research/r1-divergence-map-2026-08-18.md` pins every divergence to code on both sides and sequences the PRs. **R1a DONE 2026-08-18 in two slices**: slice 1 (#360) D2 — realized R from legs on every filled resolution; slice 2 E1 (the sweep's own resolution tiering in both live writers, recorded per row), E3 (decision anchor = last completed primary bar), E7 (the bridge reads the row's stored runner-protection mode and review window), E2's live no-bars marker — engine now at `2026.08.18.one-physics`. **R1b DONE 2026-08-18** (the sweep tells the truth about its inputs. E2: the no-bars marker gates on whether a completed bar COULD have existed in the resolution stream — the first slot at/after `max(createdAt, streamStartsAtMs)`, the sweep passing decision-bar-open + 15min — never on presence or containment (#364 rounds 3–4; the intermediate presence form never deployed), plus the `unresolvable` counter and the measured per-symbol density door; the aggregator partitions with it — `SweepStats.dataAbsent` holds marked rows out of `n` so fill rates state their denominator, and the driver's `unfilled` column is now `total − filled − dataAbsent`. The FIVE corpus readers STATE the partition (#364 rounds 24–55): three scoped held-out lines each naming their own population and holdout definition (the emit's stamped flag for sweep-analysis and the E8 report vs `gradeCorpus`'s read-time stratified set, whose excluded count the 4c report prints from the read, never the stamp), and `data-limits` — the table 4c per-market sweeps read their limits from — names its list as the stamped flag with the gate's own set called out; the E8 report prints `dataAbs` per market and rollup, labels held-out markets HELD OUT and fully-gated markets ALL ROWS GATED (current calibration — thresholds may postdate the sweep) rather than "NOT IN CORPUS", survives an all-marked market, and withholds its EXCLUDE verdict below `--min-filled` (#364 round 34 — the σ≥2 test's only intrinsic floor was two filled outcomes; round 35 carried the withheld share into the candidates block itself, which now names its floor and states the terms its "none" judged at, and thin negatives below the floor read no-verdict-either-way, never the reassuring "within noise"; round 36 floored the per-category rollup — amendment 24's decision grain — with the same THIN marker, stating the missing clustered s.e. when a category has fewer than two filled markets; round 37 printed the clustered s.e.'s own sample beside it — k filled markets, since roster membership is not the cluster count and k bounds the estimate — and the precision line states that the one `--min-filled` floor applies at both grains); `geometry-evidence` streams with a derived projection and a market-evidence headline; the 4c gate itself floors a zero-shared-days variant at p = 1 — `familyPairedP` had returned the minimum attainable p, exactly, from zero pairs — requires a pairing the statistic can resolve (MIN_EFFECTIVE_PAIRS 5 — the SUPPORT, nonzero shared-day deltas, since a zero delta cannot flip the sign statistic and bit-identical days are the grid's common case; basis at the constant: min attainable p is ~2⁻ᵏ, so 0.05 is unreachable below five effective pairs; both counts print as a pairs column beside pairedP, a floor refusal reads NO VERDICT with the pairing named rather than bare "fails", the boundary is pinned from both sides — accept at exactly five at 2,000 permutations with the p asserted against its derived value, refuse at four sparse and dense — and the family-wise null spans only hypotheses under test: a sub-floor sibling neither joins the maxT family nor receives a p, so it cannot block an accept-eligible variant (#364 round 40) — and the max ITSELF is now pinned by a fixture with three floor-clearing variants on disjoint day blocks, where a variant that accepts alone is refused beside its siblings on an identical observed statistic, since until round 46 every non-singleton fixture had a sub-floor sibling and the family maximum was never actually taken over two competing hypotheses; the non-shared portion's two halves are both named, compositionR the variant-only days and droppedR the baseline R a tightening dial forwent, with the exact accounting identity stated on the verdict type; the shared-vs-whole-fold mismatch is stated at the accepted site; the support predicate is declared once and consumed by the null, the p-floor and the verdict (round 41); the confirm-fold burn lands only after a confirm read actually happened — never on a throw, never on a legacy corpus with no confirm fold (round 41), and never on a run that accepted nothing, since the figure is computed for accepted variants only (round 42), and never on a confirm delta with no evidence behind it — the delta is null unless BOTH sides carry filled confirm-fold outcomes, and states both denominators where it prints (round 43); a group whose baseline carries no select-fold days is diagnosed by name at the market grain (round 41); the row's disposition rides a `noVerdict` field rather than a prefix match on the reason's wording, pinned at source (round 42), with `reason` required so no causeless label can print (round 43); and the folds line claims a read only when the ledger recorded one — naming which of its two causes applies — with `main()` itself now under executed coverage (rounds 43–44); the ledger is keyed on the CORPUS identity (`conditionsOf` — invariant across shard order and subsets, since `symbols` deliberately stays out; round 45 also hashed each shard's run-day `anchor` in, and round 47 removed it: `anchor` is `isoDate(new Date())` per INVOCATION and shards are separate invocations, so a cross-midnight or re-run shard set got a population-dependent id and a later subset read found no prior and opened the held-back fold unrecorded — round 44's finding restored on a new axis, a MISSED refusal traded for a false one. What survives of round 45's widening is `days`, and it survives by joining `conditionsOf` itself: two sweeps of different depth are two measurements, the shard loop now refuses the mixture, and that refusal is what makes the identity subset-invariant by construction rather than by assumption about how shards are run) rather than shard 0's `manifestHash`, so a reorder or a subset can no longer read the held-back fold unrecorded (round 44) — and it is FILED under that identity in one canonical tracked directory, `docs/research/confirm-reads/`, rather than beside the shards, since round 44 fixed the key and left the location derived from the corpus's path: copying the shards elsewhere to grade left the record behind and the copy could be read forever while the original's count never moved. One file also makes the append atomic again, where the per-directory fan-out could record a read the caller never learned about. Both retired forms stay honoured on READ so older ledgers keep refusing, and the refusal now names its evidence — ledger path, prior `readAt`, which key matched, and how this read's shard population compares to the recorded one (round 45). `confirm-4d` consumes `confirmRead` rather than stamping `readAt` unconditionally (round 44), and its `unreadable` count splits into FIVE causes, not three: `thin` and `noVerdict` verdicts both carry `accepted === false`, so both had been reported as having lost the gate when the gate could not judge them at all — refused-by-gate, gate-could-not-judge, thin, accepted-but-unevidenced, missing-verdict, each with a per-pick `gateDisposition` and the gate's own `gateReason`, under executed end-to-end coverage of the script that BURNS (round 45)), and refuses a baseline carrying no cell, closing the route where a typo'd `--baseline` (the one VALUE_FLAGS entry with neither refusal, now read through a guarded string accessor under a bidirectional scan, with all three path readers on one sequential walker) made every class degenerate and accepted every profitable variant (#364 rounds 37–55); and the amendment-25 starvation gate reads a zero geometry denominator as NO VERDICT rather than maximal starvation, withholds the flag below a `--min-reached` floor (default 30, binomial basis recorded at the constant), partitions its summary by cause so the flagged denominator holds only judged markets, and refuses outright — `--report` powerless, remedies routed by cause down to the no-verdict shapes, which the passing summary also names apart, since the floor dial cannot recover a zero denominator and the feed is no lever for windows never consulted — when the exclusions swallow the whole roster (#364 rounds 31–36) — the map's reader clause is the authority. E6: macro reconstruction from the historical Treasury curve at New-York-midnight visibility with curve-evidence facts hashed into the manifest, and providerWarningCount/weightAdjustment stated in the hashed `conditions` block the readers now require; emit rows carry tier, macro adjustment + stance, and marker — closure record in the map is the authority; corpora without conditions refuse at the door, and the one re-sweep stays R3's). **R1c DONE 2026-08-23** (the E4 collapse instrument): `scripts/e4-collapse.ts` replays the per-scan collapse by importing `scanCollapse.ts` — the comparator was extracted from `index.ts` so the live path and the reader call ONE implementation rather than the reader transcribing a Deno-global file it cannot import (#373). The map's feasibility claim did not hold: `executionScore`, the comparator's THIRD tier, was absent from the emit entirely, and it is now emitted — R3 is the one re-sweep, so a field missing then cannot be backfilled without a second one. Live also quantizes tier 2 to two decimals while the emit carries full precision, which is what makes tier 3 bind often rather than rarely. The reader (#375) requires `--bucket-minutes` and `--variant` with no defaults, reads every shard as one population because the sharding SPLITS correlation clusters, holds data-absent rows out of `n`, withholds below `--min-groups` rather than reading thin as reassurance, and states its suppression as a LOWER BOUND because the cross-scan 6-hour screen is not a pure read. Its estimand is paired per (bucket, group) against a null of uniform within-group selection. **It cannot produce a reading until R3** — no corpus exists that its own door accepts. **R1b MERGED 2026-08-19 as `19706e8` (#364, squashed)** after roughly fifty-six advisory fleet-review rounds over its life (this session drove the last twelve, 45–56) — merged on green CI without waiting for a tail-flat round, on the owner's call, the review being advisory per AGENTS.md rather than a required gate. The rounds are not noise: they have found a live regression, a NaN dial, a silent 60→365 depth drift, a write-before-validate on a tracked artifact, and a test that executed nothing in CI for a full round. | **R1a/R1b/R1c ALL MERGED · R1 CLOSED 2026-08-23** |
| **R2** | Repair the instrument — ~~D4 (the gate has no absolute-expectancy term)~~ **DONE 2026-08-31**, ~~M3 (confirm decides on a bare delta)~~ **DONE 2026-08-31**, ~~M1 (audit double-counts)~~ **CLOSED 2026-08-31 — the item named the wrong file**, ~~M5 (make the cost scale reach the resolver)~~ **DONE 2026-08-31**, ~~D1 (learning from a win rate)~~ **DONE 2026-08-31** | **NEXT — R1 is closed. All five lettered items are done.** M1 named `roster-expectancy-audit.ts`, which never carried the `|| variant === "baseline"` alternative — `git log -S` over that path's full history returns nothing. It lived in `market-dossier.ts` (#330 in, #364 out), and both files are now mutation-verified guarded. M1's "re-run and commit the artifact" half is BLOCKED and belongs to R3/R4: the 4c emits are not in the working tree, and that corpus is the invalidated one, so a fresh run would replace quarantined figures with equally invalid ones. **What remains under R2 is the pre-R3 emit and manifest work's LAST open row — section 5 item 5, the two-arm corpus.** **D4 changes what R3 must do:** the 4d picks now fail on TWO independent grounds — the corpus was invalid (clock defect) AND the criterion was wrong — so the re-sweep must run under the repaired gate, not merely on repaired data. Does not wait on R0's data half, which gates R3 onward. Whether every item is offline is NOT asserted here — M5 names the resolver and D1 names learning, both live surfaces; scope each against the map before assuming a reader-only change. **R2 also owns the PRE-R3 EMIT AND MANIFEST WORK, added 2026-08-23** — see the block below the rank table. R1c proved this class exists when `executionScore` turned out to be missing and had to land before the one re-sweep; the converge found five more of the same shape |
| **R2b** | ~~**The geometry model's own fresh-eyes round**~~ **RAN 2026-08-31 — `docs/research/r2b-geometry-fresh-eyes-2026-08-31.md`; its one-entry field list LANDED the same day (#507).** The row below is the original statement of the item.
| **R2b (original)** | **The geometry model's own fresh-eyes round** — the old item 4b, re-ranked here 2026-08-19 rather than left in §5's prose. Several lenses, each asked what the MODEL is missing rather than how to tune it; the one surface the adversarial protocol has never been pointed at. **Its rank is load-bearing and was never stated:** its output changes what the sweep should measure, and R3 is `re-sweep ONCE` under item 2's law — one re-simulate after the instrument changes, never one per fix. Run after R3 and the choice is a second full re-sweep or shipping a geometry nobody probed. It must clear before R3 opens. | after R2, **before R3** |
| **R3** | Re-sweep ONCE — item 2's law: one re-simulate after the instrument changes, never one per fix | **after R2b**, not merely after R2 — R2b changes what should be measured and there is only one re-sweep. **ANCHOR THE RUN AT 2026-08-26 AND R3 COSTS ZERO FMP BYTES — see the block below. This is perishable.** |
| **R4** | The per-market program — every matched market individually, against its own shipped configuration, absolute expectancy as the criterion | after R3 |
| **R5** | The never-analyzed populations — 8 contract variants, dual-listed crypto per line, register gaps | after R4 |
| **R6** | Reader-facing claims — D7 (Record rows publish a frequency as a record), D8 (tier ordering the corpus inverts) | pre-reopen |

### R2b — the geometry model's fresh-eyes round, RUN 2026-08-23. THE EMIT HALF IS DONE; the manifest half is what still awaits sign-off

Five lenses, five independent refuters, every load-bearing claim re-derived here
before being written down. **The deliverable is the list below, not this
prose** — R2b's exit criterion was restated as "the emit and manifest carry this
named field list", and this is that list.

**STATUS, corrected 2026-08-30.** This block read "Nothing here is implemented"
for five days after it had been. All NINE emit fields are on
`SweepOutcomeRecord` and populated — seven in #382, the last three in #427 —
and the two remaining questions it framed are closed: the ninth `riskDistance`
field is NOT needed (#472 corrected `stopPivotDistance`'s anchor, which was the
real defect and recovers the pre-alignment risk without a new column), and
`ladderRewardRisk` LANDED in #473 — it was absent from the emit while being the
figure amendment 39 makes the measure, so R4 would have graded all 97 markets
against `rewardRisk`, a promise the ladder never makes, and read the shortfall
as markets underdelivering rather than as the wrong yardstick.
`tests/corpusCarriesTheMeasure.test.ts` now derives the coupling from the Desk
itself: whichever field the panel prefers for the payoff must be an emitted
column, so moving the Desk's figure again fails until the corpus follows.

**#474 found the same omission one field over.** `estimatedRoundTripCost` LOOKS
recoverable as `(grossRewardRisk − rewardRisk) × riskDistance`, since
`rewardRisk` IS `effectiveRewardRisk` — but that is
`max(0, rewardDistance − roundTrip) / riskDistance`, and the clamp bites
exactly when the round trip exceeds the reward, which is where cost is the
dominant fact. Measured on a crypto unit-risk plan with a 0.155 round trip: a
0.20 reward recovers it exactly, 0.10 recovers 0.100 (35% understated), 0.05
recovers 0.050 (68%). The clamped value does not announce itself — it reads as
a smaller, plausible cost — and under `captureAll` those rows are exactly what
the corpus keeps. Cost total plus its three components now emitted; the
components carry different remedies (spread → size down, slippage → the window,
commission → the venue) and the venue tables are what STANDS from the
remediation.
**What awaits the owner is the MANIFEST half below, none of which is
implemented.** Reading this section as an open proposal is what produced a
recommendation to "accept all eight fields" that described `main`.

#### The keystone, and it came from a refuter rather than a finder

**The corpus contains no price level.** `SweepOutcomeRecord` carries
`riskDistance` — a distance — and `legs`, which are EMPTY on an unfilled row.
So an unfilled setup records no price at all, and a filled one records only what
the resolver printed. Verified: a grep of the record for any price-space field
returns nothing but comments.

Seven separately-proposed fields turned out to be consequences of that one
absence. Emit **`latestClose`** — the decision bar's close, already the exact
argument `buildPricePlan` receives — and the plan reconstructs: entry from
`latestClose ∓ atr × entryOffset` with the provenance already emitted, then
the stop buffer, the structural and cap stops, the ladder, and **last** the
tick alignment, which rewrites entry, stop, both targets and `riskDistance`
together. Spread, slippage and commission follow, being pure functions of
`(symbol, latestClose, atr, tickSize)` over tables pinned by the manifest's
`analyzerVersion`.

The order is load-bearing and this passage previously had it wrong, placing
the tick alignment second. Every level above it is computed from the
**unaligned** entry; a reconstruction that snapped to the grid first would
derive its stop from the aligned entry and land on a different number, on the
27 futures-shaped markets where a grid applies.

One level did not reconstruct exactly: TP1, on a futures-grid market whose
`tp1Provenance` is `risk_share`. **CLOSED 2026-08-30 (#472), and not with the
ninth field.** The cause was not a missing number — `stopPivotDistance` was
measured against the entry AFTER tick alignment, while the pivot it describes
is selected against the unaligned entry and consumed against it by the entire
stop chain. So the field meant one thing on the 70 grid-free markets and
another on the 27 futures-shaped ones, and the error is not sub-tick: measured
on the fixture, ZCUSX buy emitted 0.050 where the true distance is 0.294, a
5.9x error, because ZC's 0.25 grid is comparable to the pivot distance itself.
Re-anchored, the pivot recovers exactly, and with it the pre-alignment stop and
risk. Proven by execution in `tests/pricePlan.test.ts`: the emitted distance
lands exactly on the pivot the stop chain selected, and the recovered planned
entry and stop, pushed back through production's own tick rules, reproduce the
plan's entry, stop and TP1 bit-for-bit on a grid market.

**The evidence claim was corrected in #476.** As first shipped, only the pivot
test died when the anchor was reverted; the risk test passed with the defect
restored, because its exact arm ran on grid-free EURUSD — where alignment never
runs, so the defect cannot exist — and its grid arm used a `tick × 2` tolerance
that the 0.16-tick error sat inside. That tolerance's stated derivation was also
wrong: `applyFuturesTickRules` can move a stop by `minStopTicks`, measured at up
to 9.2 ticks across the spec'd symbols. The tolerance is deleted rather than
widened, the grid assertion is now exact, and the fixture is scaled ×5 so the
tick grid stops absorbing the very difference the test exists to see. Both tests
now fail under the anchor revert, which is what "mutation-verified both ways"
had claimed of a pair where only one did. The proposed ninth field would have fixed TP1 only, spent a
permanent column on the one corpus R3 gets to write, and left the wrong anchor
in place for R4 to read.

Five fields doing the work of twelve, on a corpus where per-row width is the
cost. That is the shape a field list should have.

#### PROPOSED — emit (`SweepOutcomeRecord`)

| field | type | what it recovers | needed by |
| --- | --- | --- | --- |
| `latestClose` | number | **The keystone.** Every price level and every cost term, by reconstruction rather than storage | R4, R2b's own remaining questions |
| `atr` | number | The volatility unit the entire geometry is scaled in. Without it nothing is comparable across markets | R4 |
| `dailyAtr` | number | The second stop lever. `stopBuffer = max(atr × stopAtrMultiplier, dailyAtr × dailyStopAtrMultiplier)` and nothing records which bound | R4 |
| `stopPivotDistance` | number \| null | Separates "a pivot was chosen" from "a pivot existed and lost to the cap" | R4, R2b |
| `grossRewardRisk` | number | Payoff BEFORE cost. Only the net figure is emitted, so the cost charge is currently unmeasurable | R2's M5, R4 |
| `volatilityPercentile`, `trendStrength` | number, number | The regime's own evidence, computed at every decision and discarded. Makes the fixed-vs-conditional review-window question answerable from ONE corpus instead of a second sweep | R4 |
| `runnerNearestBeyondMinimum` | number \| null | Whether structure existed beyond the runner limit, which `window_ceiling` alone cannot say | R4 |
| `unfilledApproachDistance` | number \| null | How close an unfilled setup came. Today an unfilled row carries no price information whatsoever | R4 |

#### What the eight fields COST — the number the sign-off needs

Measured, not estimated: the eight fields serialise to **245 bytes per JSONL
row** (236 when the three nullable ones are null). The row count is derived from
the rebuild's own warm lines — 69 symbols warmed carrying 15.8M intraday bars,
and the density lines put the 5min:15min ratio at ~3.0, so the 15-minute
decision series is a quarter of that. Projected to the full 97-market roster at
`--step 16`:

| grid | decision points | upper bound (capture-all, every decision emits) | at a 10% accept rate |
| --- | --- | --- | --- |
| 1 cell | ~348,000 | **+0.09 GB** | +0.01 GB |
| 25 cells | ~8.7M | **+2.13 GB** | +0.21 GB |

So the width cost is small against the ~10–14 GB the cache rebuild itself spends
and the 36 GB the condemned emit corpus reached. **It does not constrain the
field decision at either grid size**, which is worth stating plainly because the
proposal's own framing is "a corpus where per-row width is the cost" — that
framing is what justified collapsing twelve proposals into five, and it should
not be read as a reason to trim the five.

#### LANDED 2026-08-31 (#479) — the manifest declares its own columns

Not one of the five proposed fields; it is the check that would have caught
three of this week's omissions and did not exist. `ladderRewardRisk` (#473),
the cost decomposition (#474) and `forgoneRunnerR` (#477) were each found by a
person looking, and none of them moved `ANALYZER_VERSION` — correctly, since
none changed what the engine decides. Which is the problem: two corpora
stamped with the same version can differ in which columns exist, and nothing
in either file said which. A reader finding no `forgoneRunnerR` cannot tell a
corpus that predates the column from one where every runner gave back nothing,
so it grades the give-back as zero and reports a result.

`emitColumns` is derived from the first row the driver actually writes — never
a list kept beside the type, which would have been stale three times already —
and `assertEmitColumns` refuses a read whose column the corpus lacks, naming
every missing one. An ABSENT list is not a refusal: every corpus written
before the field genuinely lacks it, and refusing those would retire the
deliberate historical reads for a capability check. The caller is told it
could not verify rather than told it did. Deliberately OUTSIDE `conditionsOf`:
capability is not measurement identity, and putting it there would let a
reader's column check split a legitimate shard set.

#### PROPOSED — manifest

| field | what it recovers |
| --- | --- |
| **`decisions[]` — LANDED 2026-08-31 (#483)** | Per (symbol, variant, split): `decisionPoints`, `emitted`, and the engine's rejection struct passed WHOLE (derived from the counters, never a chosen subset — hand-listing is how that struct froze once already). Every denominator behind a market's row count, bound to `manifestHash` instead of stdout scrollback: seven rejection reasons emit no row at all, so four of the eleven measured sweep-restrictive divergences had populations recoverable only from the console table. **`emitted` is `result.outcomes.length`, NOT `result.summary.total`** — the summary is computed over `outcomes.filter(accepted)` while the emit writes every row, so under `--capture-all` the obvious wiring ships a denominator smaller than its own numerator. Proven by execution: a gate the fixture cannot clear gives 12 emitted against 0 accepted. **EXCLUDED from `conditionsOf`**, unlike `acceptance` and `modeledCostScale` — each shard holds only its own markets, so including it would throw on every multi-shard read and make the corpus id population-dependent (round 45's mistake, undone by round 47). Pinned in the POSITIVE direction: two shards carrying different `decisions[]` must still POOL, and the mutation that adds it to the identity fails that test. Sorted at the hash boundary so shard order cannot re-hash an unchanged corpus. No door refusal on absence — one would kill the deliberate historical reads |
| ~~`conditions.timeframePenalty`~~ → **`conditions.availableTimeframeCount: "min-four-by-construction"` — LANDED 2026-08-31 (#480)** | The fourth hardwired score term, **renamed to its INPUT**. `timeframePenalty` is one of TWO effects the count drives — `scoring.ts`'s penalty and `executionQuality.ts`'s coverage penalty — and naming one let the other hide behind it. Verified by execution, which nothing did before: `buildDecisionMarketContext` builds `15min`/`1day`/`1hour`/`4hour` unconditionally and admits each on `length > 0`, so the count is ≥4 on the thinnest inputs the decision loop will decide on (daily 40, history 240). Only `5min` carries a floor, which is why the floor is four and not five. **Landed before R3 because `verifyManifest` refuses on a term's ABSENCE** — `expectedConditions` is a hardcoded literal compared with `!==` — so adding it after the one re-sweep makes that corpus unreadable on every path, and it cannot be re-swept. Cost of landing it now: none. Every tracked manifest carries `conditions: null` and is already refused |
| **`acceptance: { captureAll, ignoreLowEdge }` — LANDED 2026-08-31 (#481)** | The corpus's acceptance mode. **Verified by construction**: neither flag reached `buildSweepManifest` at all, so two corpora with entirely different accepted populations hashed byte-identically and pooled. `ignoreLowEdge` is the one that moves the ACCEPTED population — `sweep.ts` rewrites a blocked session to `{ block: false, penalty: 0 }` one line before the branch that would have rejected it, so that arm grades hours the live desk refuses outright. `captureAll` never sets `accepted: true`; it keeps rows that FAILED a gate, changing the denominator. **Top level, never in `conditions`** — those are compared to a hardcoded literal and both values here are legitimate by design, so any literal refuses one arm on every path. **Joins `conditionsOf`**, like `days`: a CLI parameter constant across a legitimate shard set, so it separates two measurements without making the corpus id population-dependent. Recorded UNCONDITIONALLY, both flags, so an absent block means "predates the field" and a `false` means "this run was gated" — two different facts the door distinguishes. `confidence-bands.ts` and `threshold-rescue.ts` both OPENED by stating a capture-all premise in a header comment and checking nothing; both now assert it, because a gated sweep emits only rows that passed the confidence gate, so a band curve built from one reads every band as perfect and a rescue finds nothing to rescue — neither fails, both report |
| **`engineDeclined` — LANDED 2026-08-31 (#485), top level and SYMBOLS ONLY** | The decline state the corpus was produced under, pinned rather than re-read from a register R4 rewrites by design. **Top level, not `symbols[].engineDecline`**, for the `requestedSymbols` reason: a declined market may produce no row, and a row-less market has nowhere to carry a per-symbol flag — R5 is exactly that population. **Symbols only, deliberately**: the proposed shape carried each market's `measuredExpectancyR`, and every figure in that register comes from the corpus the 2026-08-11 clock defect invalidated. SC-5 withholds the magnitude from the operator for that reason and #471 removed the last place it leaked; writing it into a manifest would put an invalid number where provenance goes. `source.revision` recovers the figures with their caveats attached. **Outside `conditions`** — R4 rewrites the register, so a register-derived term compared to a build literal would make the R3 corpus refuse itself the moment R4 lands. **Outside `conditionsOf`** — `sweep.ts` imports `getCategoryCalibration` and nothing else from `calibration.ts`, so the register has ZERO causal influence on the rows and cannot be what separates two measurements; pinned in the POSITIVE direction, two shards with different registers must still POOL. Recorded despite `source.revision` usually recovering it, because "usually" is load-bearing: the revision recovers the register only when `source.dirty` is false, and a sweep run from a dirty tree pins a commit whose register is not the one that ran |

**`modeledCostScale` — LANDED 2026-08-31 (#482), outside `conditions`.** The
flag was right: `verifyManifest` compares each `conditions` term to a hardcoded
literal, and two scales are simultaneously legitimate by design (amendment 36
wants a gross arm and a net arm), so any literal would make one unreadable on
every path rather than merely unaggregatable. It sits top level and joins
`conditionsOf`, so a gross arm and a net arm cannot pool.

**The arm was refused until M5, and M5 LANDED 2026-08-31.** The defect, for
the record: the scale multiplied `estimatedRoundTripCost` only, while the
resolver was handed `gapExitSlippage: estimatedSlippage`,
`halfSpread: estimatedSpread / 2` and `roundTripCost: estimatedCommission` —
none of them scaled, by two separate hand-written call sites. A gross arm
therefore did not measure gross R; it measured net R under a LOOSENED GATE,
admitting more setups and changing nothing about what they earned. Eleven of
twenty rows came back bit-identical and were read as agreement.

`resolverCostOptions` is now the one mapping both sites use, so the scale
cannot reach one and miss the other. It scales the MODELLED half and charges
the published commission in full — amendment 36's standard as arithmetic,
since the commission is not a parameter of our own making. The live bridge
passes 1 explicitly rather than inheriting the environment, so a stray
variable on a production deployment cannot re-grade the corpus global learning
reads. `MODELED_COST_SCALE_REACHES_RESOLVER` is true and the driver's refusal
is now dead code kept as the guard that fires if the wiring regresses; the
matching door at the other end is `cost-sensitivity-verdict.ts`, which names
an identical pair INERT and refuses a run where every readable market came
back that way. Proved by running the engine at two scales and comparing
realized R, not by matching source — every source assertion available would
have passed throughout the three weeks the defect was live.

**Section 5's item 5 is UNCHANGED and is now the binding constraint on
amendment 36's re-decision.** The scale is a per-process environment read, so
`--grid` still cannot produce both arms in one run: M5 made the knob real
without making it cheap. See that row for the recommendation.

#### IMPLEMENTED 2026-08-23 under owner authorisation — two of the three

**The emit fields — ALL NINE LANDED.** #382 carried seven: `latestClose`,
`atr`, `dailyAtr`, `stopPivotDistance`, `grossRewardRisk`,
`volatilityPercentile`, `trendStrength`. #427 carried the last three
(`cotSampleSize`, `unfilledApproachDistance`, `runnerNearestBeyondMinimum`),
two of which sat in the pre-R3 register with no recorded decision to drop them.
This paragraph said "Seven landed" for five days after that, which is how a
closed decision came back as an open one. `PricePlan` exposes the three it already computed. The
keystone claim is proven by execution rather than asserted —
`tests/pricePlan.test.ts` rebuilds the entry from only `latestClose`, `atr` and
the emitted `entryProvenance` and asserts it equals the plan's own
`entryPrice`, both sides, mutation-verified. Live behaviour unchanged and
`ANALYZER_VERSION` did not move: the plan additions are exposures of values
already computed and nothing reads them for a decision, and `sweep.ts` is not
imported by `index.ts`.

**The density gates (#382).** Both predicates judged a whole span against
floors calibrated on a recent week, and were forecasting refusals for the
deepest markets. Now judged on the last 90 days, carried as new facts on
`SeriesFacts` and `CrossSeriesDensity`. Proven both ways against the rebuilt
stores: LTCUSD, BTCUSD, ETHUSD, PAUSD and EURUSD all accepted, while a 5-minute
feed clipped 50% in the recent window still refuses at 144.0 rows/day, clipped
80% at 57.6, and a clipped 15-minute primary still refuses on the ratio at 6.00.

A second defect surfaced while fixing the first, pointing the other way: the
ratio's population filter was whole-span too, so a deep series' low whole-span
rate dropped it OUT of the population and the ratio never judged it. False
silence, not false refusal — which is why LTCUSD and BTCUSD tripped the absolute
floor while the ratio stayed quiet on them. The filter judges the same window
now, so the deep markets are visible to the gate rather than exempt from it.

**What these gates do NOT judge, stated because a first draft claimed a backstop
that does not exist.** That draft said holes "remain `largestGapMs`'s job over
the whole span". `largestGapMs` is read only for the Treasury curve; nothing has
ever read it for a bar series. The early era is not gated and cannot be by a gap
threshold — measured across the 79 five-minute stores written by 2026-08-23, 25
carry a largest gap of 14 days or more, twelve exceed 30, and NZDUSD reaches 72,
all on healthy shipping markets. Any threshold low enough to catch a real early
hole refuses a third of the roster, which is amendment 31's forbidden trade. So
the early era is STATED — `count` and `spanDays` stay on every `SeriesFacts`, so
whole-span density is derivable per symbol — and a reader conditions on it.

**NOT implemented, deliberately: the ATR-cap constants.** On 26 markets the cap
binds on every setup, which is a per-market calibration derivation and therefore
R4's mandate — "per market, never per class". Acting on it now would be the
piecemeal answer the owner has ruled against. It goes to R4 as input, with the
measurement already recorded below.

#### MODEL findings, which are not field proposals

- **On 26 of the 97 markets the ATR cap binds on EVERY setup, by arithmetic.**
  Executed against the live calibration: effective `maxStopAtrMultiplier` is
  26 × 1.0, 6 × 2.5, 65 × 4, and the structural stop is bounded by
  `entry − 1.25 × atr` by construction — so any multiplier under 1.25 makes the
  cap bind identically. On those 26, `stopProvenance` is the constant `"cap"`,
  the stop is a pure formula with no structure in it, and the field records a
  choice that never happens. **The model's claim to be structural does not hold
  on a quarter of the roster**, and that is a calibration constant deciding
  geometry before a price is read.
- **The payoff gate measures a full-size reward the ladder can never realize.**
  `rewardRisk` frames payoff as if the whole position rides to the runner, while
  TP1 takes part of it off. The acceptance gate therefore tests a number the
  geometry does not produce.
- **The crypto 5-minute density floor is depth-blind** — found in flight during
  the R0 rebuild, not by a lens. LTCUSD (216.6 rows/day over 4,675 days) and
  BTCUSD (235.9 over 4,676) both trip the crypto floor of 260, which is stated
  as "probed margin under the measured week" — a seven-day window. 260 of 288
  theoretical bars/day demands ~90% coverage, which no series reaching back to
  2013 will average. **The floor penalises depth**, so at R3's max depth the
  markets with the most history are the ones most likely to be refused — and
  amendment 31 says a matched market leaves the offering only on a calibration
  verdict, never on caution. A THIRD symbol trips a different gate: PAUSD at a
  5min/15min ratio of **2.68** against a band of [2.7, 3.25] — two hundredths
  below the edge. So two distinct door predicates are forecasting refusals at
  max depth, and both were calibrated on short recent windows. **Collect every
  `WOULD REFUSE` line from the rebuild log before R3 and decide the population
  deliberately**, rather than discovering it when the sweep pre-flight refuses.

#### Corrections this round produced

- **The `effectiveRewardRisk` double-charge is CLOSED and this file still lists
  it as open.** Item 1q says the formula "charges cost in the numerator AND the
  denominator… filed under 2d". 2d shipped in #288 on 2026-08-09:
  `executionQuality.ts` now divides by `riskDistance` alone, with a comment
  naming the old form. Verified by `git log -S`. The register entry is stale.
- Futures-shaped roster symbols are **27**, not 30.

### The pre-R3 register — what must reach the emit or the manifest before the one re-sweep

**Added 2026-08-23 by the converge after R1c.** R1c proved this class the
expensive way: `executionScore` was absent from the emit, the divergence map had
asserted the fields were "both already in the emit", and it had to land before
R3 or be unrecoverable without a second full re-sweep. The converge then swept
for siblings and found five. Each is **owned by R2** and each is cheap now and
impossible later.

| # | What the corpus will not carry | Consequence if R3 runs without it |
| --- | --- | --- |
| 1 | **Six geometry fields the plan already holds are dropped from the emit** | Three geometry quantities are unrecoverable in R — and R2b's whole question is what the geometry model is missing |
| 2 | **The manifest records only SURVIVING symbols, never the requested population** (verified: `buildSweepManifest`'s `symbols` array has no requested-population field) | A market that dropped out is indistinguishable from one never asked for. R4 grades every matched market individually and R5 is *defined* as the never-analyzed populations — both need to know what was asked and produced nothing |
| 3 | **Per-symbol decision arithmetic — `decisionPoints` and all ten rejection buckets — exists only in the printed stdout table** | A stdout table cannot be tied to a corpus identity, so R3's starvation reading would be unverifiable the same way 4c's was |
| 4 | **Two of Phase 4's five axes cannot be expressed as grid overrides** (AXES-3 pivot depth, AXES-9 oscillatorBias) | R3's one re-sweep cannot produce the corpus R4 is defined to read |
| 5 | ~~**Amendment 36's re-decision needs a gross corpus AND a net corpus**, and `LEVELFLOW_MODELED_COST_SCALE` is a per-process env read, so `--grid` cannot produce both arms in one run~~ | **CLOSED 2026-08-31.** Every emitted row now carries `grossRealizedR` and `grossOutcome` beside its net figures — the same decision re-resolved at `GROSS_COST_SCALE` (0: E8's published commission, none of our modelled spread or slippage). One extra resolution per emitted row, **zero additional FMP bytes**, against a second full sweep's worth. `grossCostScale` states it in the manifest and joins `conditionsOf`, because two corpora whose gross arms charged differently have IDENTICAL net rows and nothing else would tell them apart. `cost-sensitivity-verdict.ts --paired` reads one corpus; `--net`/`--gross` stay for the historical artifacts, whose emits are gone and whose corpus is the invalidated one. **PAIRED IS THE BETTER INSTRUMENT, not merely the cheaper one** — two runs also move the payoff GATE, so their accepted populations differ and the comparison confounds cost with selection, systematically, since a looser gate admits MARGINAL setups and drags the gross arm down. Both arms resolve or the decision is rejected: a row graded on one and fabricated on the other is not a paired comparison |

**R2b's exit criterion follows from this table and should be restated.** As
written its deliverable is a review — "several lenses, each asked what the MODEL
is missing". An item whose exit criterion is "a review ran" produces findings; an
item whose exit criterion is "the emit and manifest carry this named field list"
produces a corpus R4, R5 and R6 can read. The real order is
**R2 → R2b → R2's implementation pass → R3**.

**R2b RAN 2026-08-31 and met the restated criterion** —
`docs/research/r2b-geometry-fresh-eyes-2026-08-31.md`. Six lenses, 24 findings,
9 survivors, each then re-derived by hand on the real per-market population.

**The field list is one entry, and it LANDED 2026-08-31** — R2's
implementation pass is done for it. Widen the rejection ledger's `reason` from
`planRejected` to the specific geometry cause. `buildPricePlan` already offers
the `refusal` out-channel (`pricePlan.ts:161-166`) and `sweep.ts:847-853` does
not pass it, so 13 `return null` paths collapse into one word. Its absence has
a measured price twice over — indices went 37% to 96% survival when the real
axis was finally found, after a 96-variant grid over four other axes moved it
37% to 38%.

**Three dead instruments, measured on all 98 markets.** `window_cap` is
unreachable on every one; `tp1Provenance` is constant per market and carries
zero per-row information; and 27 markets can never be structure-stopped
because `maxStopAtrMultiplier <= 1.25` sits at or below the structural floor
of 1.25 ATR — all three livestock, twelve crypto, seven futures. On those,
`stopPivotDistance` describes a level that never influenced the stop.

**Four model questions are recorded for the owner and were NOT actioned** —
the banked fraction is a literal `0.5` with no calibration field, a plan
without a partial cannot be built though the resolver can price one, TP1 never
consults structure, and the stop consults intraday pivots while targets consult
daily ones.

**Two of the four are now MEASURABLE from R3's corpus, and that landed
2026-09-01 because R3 is the last chance to add a column.** The questions stay
the owner's; what changed is that answering them no longer needs a sweep that
does not exist.

- **The banked fraction (question 1).** Net R at any allocation was already
  exact arithmetic on the emitted `legs`. The GROSS arm's legs were computed in
  `simulateSymbol` and thrown away, so `grossEntryPrice`, `grossTp1Price` and
  `grossExitPrice` now ride beside `grossRealizedR`, which is blended at 0.5
  and cannot be un-blended. They are not copies: a different half-spread fills
  the limit elsewhere and can land a different outcome, which is why
  `grossOutcome` was already its own column. What no column can give is the
  fraction's effect on the runner's EXIT PATH — banking a different size does
  not move the protection trigger in an emitted resolution.
- **TP1's band (question 3).** `nearestStructureDistance` is the runner's own
  structural search with NO floor and NO cap, anchored to the planned entry
  like the two distances beside it. Every distance the corpus carried was
  floored at `minimumRunnerDistance`, so the band the partial sits in had no
  level in it at all. Unfloored rather than clipped to the band deliberately: a
  clipped field is null on most rows and cannot separate "no structure at these
  distances" from "structure just outside the band" — the conflation
  `runnerNearestBeyondMinimum` exists to end, reintroduced one field over.

Neither column costs a provider byte; both values were already computed and
discarded. **A packet figure was wrong and is corrected in place**: question 3
read "0.80 against a floor of 1.50, at least 1.875x", which crosses two cells
belonging to different markets. The real per-market minimum
`minimumTargetRewardRisk / tp1RiskShare` is **2.00** (WTI, the roster's only
1.6/0.8 cell), and it bounds the risk-share branch alone — the ATR floor is a
multiple of ATR, not of risk, so no ratio of calibration cells bounds it.
`tests/preR3Fields.test.ts` re-derives that 2.00 over `defaultScanSymbols` and
fails naming the market if a calibration edit takes it below 2.

**And the round's own error is recorded** (section 5): the first derivation ran
against class calibration, which governs ~18 markets while 79 carry derived
cells with 4x stops. Two findings survived re-derivation unchanged; the third
changed completely. `roster-expectancy-audit.ts` states that population rule in
terms and it was read the same day — a stated rule does not protect the next
derivation.

#### R3's anchor day is the whole bandwidth question — measured 2026-08-31

**R3 anchored at 2026-08-26 fetches NOTHING.** `calibrationCache.ts:216-218` returns straight
from the store when `store.pinned[anchor]` exists, with zero requests. Measured across all 290
rolling stores in `.calibration-cache`:

| anchor day | stores carrying the pin |
| --- | --- |
| 2026-08-24 | 79 |
| 2026-08-25 | **290 — all of them** |
| 2026-08-26 | **290 — all of them** |
| 2026-08-27 | 13 |

So the one re-sweep can run against an exhausted allowance for free, at either 08-25 or 08-26.
Anchored at 08-27 instead, 277 stores fetch. **Nothing in the record said this**, and every
prior estimate of "R3's real draw" was unanchored guesswork.

**PROTECTED IN CODE 2026-09-01.** `PROTECTED_ANCHORS` in
`scripts/calibrationCache.ts` holds 2026-08-26 out of the prune entirely — not
merely early in it, because counting a protected day against `PINS_KEPT` lets a
run of ordinary top-ups push it out of the keep-window and evict it anyway. It
is a repository constant rather than an environment variable, because the agent
that would evict it runs from a launchd plist with its own environment and a
guard that depends on a shell being right is not a guard against that agent.
`tests/protectedAnchor.test.ts` proves it by execution over ten later anchors,
requires every entry to state when it stops being needed, and reads the live
cache to confirm the pin is still there. **Remove the entry once R3 has run** —
a protected anchor that outlives its sweep is a store that never prunes.

**AND THE FREE RIDE IS PERISHABLE.** `PINS_KEPT = 5` (`calibrationCache.ts:37`) and pins are
pruned OLDEST-FIRST on every write (`:236-238`). 210 stores currently hold two pins, 68 hold
three, 12 hold four. Enough further anchor-day writes and 08-26 is evicted — converting R3 from
free to metered, silently. **Any top-up, warm run or repin between now and R3 spends R3's free
ride**, and the nightly `com.windwardline.levelflow-cache-topup` agent is currently LOADED.

**AND UNTIL 2026-09-01 THE DRIVER COULD NOT BE ANCHORED AT ALL.** The block above,
`PROTECTED_ANCHORS`, the pin census, the argument against a third grid axis — all
of it rested on a capability `replay-sweep.ts` did not have. The anchor was
`isoDate(new Date())` at five separate call sites (the warm loop, the simulate
loop, the economic calendar, the Treasury curve, and the manifest), so the driver
could only ever read the run day. The spend gate's own comment stated the
capability in terms — "R3 is the reason this matters now: anchored at a pinned day
the sweep fetches nothing" — describing something nothing implemented. Re-measured
the same day over all 290 stores: 08-25 and 08-26 pinned in every store, 08-27 in
13, **the current day in none**. R3 launched as written would have refetched the
entire roster against an exhausted allowance and reported success.

`--anchor YYYY-MM-DD` closes it, defaulting to today so every existing invocation
is unchanged. It refuses a malformed token (an unmatched pin is a full refetch,
not a typo the run absorbs), refuses a future day, and refuses `--repin` with a
past anchor — those two are opposites, and together they spend exactly the
bandwidth the anchor was chosen to avoid while rolling the tail past the day the
run names. The manifest records the anchor the run USED, since a corpus is a
measurement of the bars visible at one instant. `tests/sweepAnchor.test.ts` also
fails if any call site reverts to the run day: five sites agreeing with each other
and with nothing else was the defect, and ONE missed site is the most expensive
shape, because the run still looks anchored.

**AND THE SPEND GATE REFUSED THE FREE RUN — closed the same day.** With
`--anchor` landed, the run still could not start: `maySpend` sits on the RUN, the
shared breaker is OPEN on the bandwidth wall, and that wall drains by time over
days while re-arming every six hours as probes fail. A guard on bytes was
blocking a run that spends none — the free ride unreachable for as long as the
wall stands.

The exemption is **earned, never asserted**. An anchored run still fetches any
series whose store lacks that pin, so a blanket exemption would spend the roster
behind an open breaker while claiming to be free. A past anchor now runs a
pre-flight over the artifacts the run will actually read — three frames per
symbol, `econ-calendar`, `treasury-rates`, and every COT contract the roster's
own mapping produces (COT caches by contract, carries no pins, and fetches on a
miss, so a census of rolling stores alone would miss the one artifact that could
still reach the provider). All present and the run cannot fetch, so the gate is
not consulted; one absent and it refuses, naming the artifact and the pins that
store does hold. `readPinnedDays` reads the last 64 KB rather than parsing 16 GB
— 3 ms for five stores, one of them 121 MB — and PROVES the key order rather
than assuming it, falling back to a full parse otherwise.

This mechanizes point 2 below rather than restating it: an instruction to
remember something is not a guard against forgetting it.

**Verified end to end 2026-09-01**, behind the open breaker:

```
anchored at 2026-08-26: 313 cache artifacts all carry the pin, so this run
cannot reach the provider — the shared spend gate is not consulted
EURUSD  warm  411599 intraday bars through 2026-08-26  spent 0.00GiB of 0.00GiB
```

**AND THE TREASURY STALENESS BOUND REFUSED IT TOO — closed the same day, and
this one had a deadline nobody knew about.** With the anchor landed and the
spend gate earned, the first non-`--warm-only` run still died:

```
Treasury curve ends 2026-08-25T00:00:00.000Z — more than 7 days stale;
decisions past its end would score against stale rows as if fresh;
refusing to sweep
```

The guard protects a real thing — a decision past the curve's end scores against
stale rows as if fresh — but "past the curve's end" is a question about the
DECISIONS, and an anchored run's decisions end at its anchor, because every
pinned series is truncated there. Judged against `Date.now()` the same corpus
grows staler every day it is not run: the 08-26 anchor's curve ends 08-25, so
the free sweep became unusable on 2026-09-01 and **was already refused when this
was found**. R0c's refetch had made the curve 95.9% complete and it made no
difference — the store was fine; the clock the guard read was not.

Same shape the rebuild already shipped once — "a staleness bound that judged
against the wall clock and ignored the bar in flight" (#420) — but the anchor
makes it structural rather than incidental. The driver now judges at
`staleAsOf(args.anchor, Date.now())`, a `min` so today's anchor keeps the wall
clock exactly as before and a past anchor is the only case that changes.

**VERIFIED: the anchored sweep runs end to end at zero bytes**, folds, density,
Treasury, simulation and summary:

```
anchored at 2026-08-26: 6 cache artifacts all carry the pin ...
fit: 2009-09-25 .. 2018-03-11 (decisions to 2018-03-06)
select: 2018-03-11 .. 2022-06-03 (decisions to 2022-05-29)
confirm: 2022-06-03 .. 2026-08-26 (decisions to 2026-08-21)
EURUSD  baseline  fit  513 decisions ... 378 setups ... expectancyR -0.066
```

Three blockers, all found by trying to run it rather than by reading it, and each
one invisible to the gate before it.

#### R3's run card — PROVEN END TO END 2026-09-01, at zero provider bytes

Not a proposal. This exact shape was run on two markets with the grid, behind an
open breaker, and produced a manifested corpus:

```bash
npx tsx scripts/replay-sweep.ts \
  --anchor 2026-08-26 --days 7000 --symbols roster \
  --grid "runnerProtection=breakeven,hold,trail_tp1;stopStructureSource=intraday,intraday_and_daily" \
  --byte-budget 1MB --emit docs/research/r3/emit.jsonl
```

Every term is load-bearing and each was established by a failure:

| term | why it is there |
| --- | --- |
| `--anchor 2026-08-26` | the only two days pinned in all 290 stores are 08-25 and 08-26; today is pinned in none. Without it the run refetches the roster |
| `--days 7000` | the cache's actual depth. At the default 60 the pre-flight refuses all 291 bar stores, correctly — `EURUSD-15min-60` does not exist |
| `--grid runnerProtection=...` | the axis overrides each market's own cell. Run at rest, `hold` is measured on 7 markets in 3 classes and cannot answer for the arm amendment 39 cares most about |
| `--byte-budget 1MB` | the driver refuses to start without one. An anchored run spends nothing, so the ceiling is a formality — and a formality that would catch a pre-flight bug |

**The dry run's evidence, two markets, four variants:**

```
anchored at 2026-08-26: 10 cache artifacts all carry the pin ...
BTCUSD  runnerProtection=breakeven  fit  ... expectancyR 0.030
BTCUSD  runnerProtection=hold       fit  ... expectancyR 0.159
BTCUSD  runnerProtection=trail_tp1  fit  ... expectancyR 0.110
Emitted 4836 setup records (manifest 4808405fb89a)
```

The three arms genuinely differ, and `baseline` matches `trail_tp1` exactly on
BTCUSD because that is the market's resting cell — the axis is live, not inert.
The emit carries all 68 columns including `nearestStructureDistance`, the three
gross leg prices, `anchor: 2026-08-26` in the manifest, and a 3,108-row
rejection sidecar the manifest's `rejectionLedgerRows` agrees with.

**One sequencing consequence, and it is not optional either.** R2b's question 4
asks whether the stop should consult daily structure. That is NOT expressible as
a grid axis — the grid overrides calibration numbers, never the pivot set — so a
decision to change it lands the same way R2b did: before the one re-sweep, not
after. The decision is the owner's; R3 waits on it.

**THE EVIDENCE IS IN — measured 2026-09-01, 97 markets, 1,908,189 planned
decisions, zero provider bytes.** Full reading:
`docs/research/q4-daily-structure-2026-09-01.md`; artifact
`docs/research/q4-daily-structure-anchor-2026-08-26.json`.

Daily structure sits in the stop's own direction on **96.6%-100%** of decisions
in every class, and across the 71 markets that can be structure-stopped it would
move the shipped stop on **32.0%** of them — median tightening ~0.6 ATR, p90
above 2 ATR. On 2.6%-4.7% the intraday search found no pivot at all while a
daily one existed, so the stop fell to the volatility floor with structure
available. Adding levels to a nearest-beyond search can only find a nearer
level, so the stop always tightens and never widens.

**Livestock reads 0.0% and that is the instrument checking itself.** The reader
predicted before the run that a market whose cap sits at or under the 1.25-ATR
structural floor can never be structure-stopped: 26 markets carry
`maxStopAtrMultiplier <= 1.25` and not one moved on a single decision. Zero of
1,908,189 plans failed the reproduction anchor against production's own
`stopPivotDistance`.

**No R consequence is derivable from it** and none is claimed: a moved stop
moves `riskDistance`, which moves TP1, the payoff gate and admission, so the
accepted population would differ. That is a grid arm, not an arithmetic.

**SO IT IS A GRID ARM NOW.** `stopStructureSource` (`intraday` |
`intraday_and_daily`) is a validated string axis beside `runnerProtection`, and
`undefined` — every shipped cell — is bit-identical to what has always shipped.
R3 prices both arms on all 97 markets in one run at zero additional bytes, and
the geometry is decided on realized R rather than on placement. Adopting it on
the placement table would have been manufacturing a ratio: a tighter stop
mechanically improves every printed reward-to-risk with no structural reason to
believe the money improves, which amendment 39 names by name.

**Measured on three markets, full history, all splits, zero bytes:** the arms
are bit-identical at `baseline` vs `intraday` (44,006 rows, −1396.0R both);
`intraday_and_daily` admits 638 more decisions and loses none; same-bar
ambiguity rises only 0.21% → 0.22% of filled rows, so the resolution limit does
not bind; and the daily arm returns **less** money (−1438.1R total, −0.0389R per
filled row against −0.0382R). Three markets are not a verdict, but the sign is
opposite to what the placement table alone suggests — which is exactly why
placement was never allowed to decide it.

**R3's run card therefore crosses two axes:**
`--grid "runnerProtection=breakeven,hold,trail_tp1;stopStructureSource=intraday,intraday_and_daily"`
— six variants plus the baseline, still zero provider bytes, CPU only.

Two things follow, and neither is optional:
1. **R3's run-card names the anchor AND the depth** — `--anchor 2026-08-26
   --days 7000`, alongside the `--byte-budget` the driver refuses to start
   without (`replay-sweep.ts`). The depth is not optional and was found by
   running it: `--days` defaults to 60, the cache holds 7000, and at the default
   the pre-flight refuses all 291 bar stores as unpinned — correctly, since
   `EURUSD-15min-60` does not exist and the run would have bought it.
2. **The pin population is re-measured immediately before the sweep**, not assumed from this
   table. This block is a measurement dated 2026-08-31, not a guarantee.

**And a third, added 2026-09-01: R3's run card must carry the `runnerProtection`
AXIS, not the roster at rest.** The axis overrides each market's own cell
(`sweepGrid.ts` `GRID_STRING_KEYS`), so `runnerProtection=breakeven,hold,trail_tp1`
measures all three modes on every market. Run at rest instead, R3 measures
whatever each cell already says — and that is not a comparison, it is three
unequal samples. Derived over `defaultScanSymbols`, the resting distribution is
**trail_tp1 65, breakeven 25 (all of them via the unset cell's resolver
fallback), hold 7**. The 7 are SP, BNBUSD, ZOUSX, CAKEUSD, IMXUSD, LINKUSD and
XLMUSD, in three classes.

`hold` is the arm with no protection at all — the full runner — and amendment 39
makes the runner's give-back the standing priority, so it is precisely the arm a
seven-market sample cannot answer for. `tests/runnerProtectionCoverage.test.ts`
pins the RELATIONSHIP rather than these counts: it fails if the axis and the
roster ever disagree about which modes exist, and it fails if a calibration edit
ever balances the roster — which would dissolve this instruction's premise and
should send someone back here rather than leave a stale "must run the axis"
standing.

**What R3 can answer for free, both of amendment 39's pre-registered axes.** `runnerProtection`
is already a validated string grid axis (breakeven/hold/trail_tp1); and the cost-weight question
no longer needs a second run at all, because every emitted row now carries `grossRealizedR` and
`grossOutcome` beside its net figures at zero additional bytes (register item 5, closed
2026-08-31). That is the strongest argument for protecting the 08-26 pin and against adding a
third axis.

#### The Treasury curve is ~25% covered, and the paths that build it never look — measured 2026-08-23

Found by the converge and re-derived here against the store the R0 rebuild
wrote at 14:50 EDT. **The uniformity is the proof**, because no market data
series looks like this:

| year | rows | | year | rows |
| --- | --- | --- | --- | --- |
| 2013 | 60 | | 2020 | 61 |
| 2014 | 60 | | 2021 | 61 |
| 2015 | 60 | | 2022 | 61 |
| 2016 | 61 | | 2023 | 62 |
| 2017 | 62 | | 2024 | 61 |
| 2018 | 60 | | 2025 | 61 |
| 2019 | 61 | | 2026 | 62 |

853 rows spanning 2013-10-03 → 2026-08-21, against roughly **3,361 business
days — 25.4% coverage**, with 13 gaps over a week and a largest gap of **278
days**. The head also sits nine months later than `TREASURY_FETCH_START_MS`
(2013-01-01).

**The mechanism, verified in code.** The fetch chunks at **365 days**
(`replay-sweep.ts`, `const chunkMs = 365 * 86_400_000`) and the provider returns
about 61 rows per chunk. The only chunk-level guard is
`treasuryChunkRefusal`, whose predicate is `input.chunkRows > 0` — it refuses a
**zero**-row chunk and passes a chunk truncated by three quarters. Sixty-one
rows per year for fourteen consecutive years is a per-request row cap, and the
guard was built for a different failure.

**Which guards catch it, and which do not — one code fact read both ways.** On
a SWEEP run the head guard (`replay-sweep.ts:340`) throws on exactly this store:
the head is 2013-10-03 and the constant plus seven days is 2013-01-08. The
interior-hole guard (`:376`) follows on thirteen week-plus gaps. Both run
pre-symbols, and that refusal is documented as what "keeps the manifested term
TRUE by construction". So **R3 does not produce a poisoned corpus — R3 refuses
to start.**

What passes the store is everything that BUILDS it: the fetch-time chunk guard,
whose predicate is `chunkRows > 0`; and the whole `--warm-only` path, where
nothing consumes the curve at all (`replay-sweep.ts:246` says so in as many
words — "nothing under `--warm-only` CONSUMES `treasuryRates`").

**So the cost is a hard stop at the most expensive moment**, not a silent
poisoning: R0 spends ~14 hours, step 3 agrees the rebuild took, and R3 then
refuses on a store the whole R0 path was blind to. That is a reason to fix it
early, and a different reason than the one an earlier draft of this section
gave. E6 scores this curve into `confidenceScore` — the acceptance gate's
primary term and tier 1 of the collapse comparator R1c just shipped — which is
what makes the store worth getting right rather than merely getting past.

**What is NOT yet established**, and must be before anything is changed: whether
the cap is per-request rows or a provider-side window, and what chunk width
returns complete coverage. That needs one cheap probe against the endpoint —
which should NOT be run while the rebuild is drawing on the same allowance. The
fix follows the probe, not the other way round; the runbook already carries that
discipline for `TREASURY_FETCH_START_MS`.

**Note for whoever reads the R0 run's exit — corrected, and the correction is
the whole point.** An earlier version of this paragraph said the rebuild "may
well end RED on the Treasury store, and that is the guards working". **That is
backwards.** Two guards do target this store — a head guard (the store must
start within 7 days of the requested start, which a 2013-10-03 head against a
2013-01-01 constant violates) and an interior-hole guard (any week-plus gap
touching the window, of which this store has thirteen). Both sit inside
`if (!args.discover && !args.warmOnly) {` at `replay-sweep.ts:312`, at lines 340
and 376. **The rebuild runs `--warm-only`. Neither guard executes.**

So **this rebuild will end GREEN over a three-quarters-empty curve**, and step 3
will agree with it, because step 3 checks the clock and the presence and says
nothing about coverage. Nothing in the R0 path refuses this store. It is caught
only at the first run that is NOT `--warm-only` — which is R3, the one
re-sweep — and by then the corpus has been paid for.

The corroboration the code supplies against itself: `replay-sweep.ts:1000`, two
lines above the chunk loop, reads **`// ~250 rows per year-sized chunk`**. The
written expectation is ~250 and the store got 61, every year, for fourteen
years. That is a falsified in-code assumption and it is the natural floor for
the rows-per-chunk guard that does not exist.

The remedy is still cheap — delete `treasury-rates.rolling.json` and refetch,
the bar stores are untouched — but **do not refetch before fixing the
chunking**, or it reproduces the same 25%.

### Pre-reopen work, and where it is owned — scoped 2026-08-23

Deliberately not counted. Ownership varies and is stated per bullet rather than
claimed for the section: R6 owns the first; the provenance-stamp clause inside
it is pre-R3-register class; and the last two — the live magic-link delivery and
the flag-flip ordering — are owned by NOTHING yet, which is the fact worth
carrying. An earlier heading read "Two gaps that no ranked item owns" above four
bullets, one of which named its owner in its own title — the same defect this
session travelled to `docs/launch-readiness.md` to fix, reproduced in the diff
that fixed it.

- **There is no reopen gate, and R6 is what it would have to clear.** SCOPED
  2026-08-23; every figure below re-derived personally. `PARKING_GATE` is a
  single boolean (`src/lib/parkingGate.ts`) whose only guard asserts the
  literal `true` (`tests/parkingGate.test.ts`) — a tripwire a reopen edits away
  as its first act, after which nothing in the repo has an opinion about
  whether any measurement is valid. What ships the moment it moves:

  - **72 of the 97 markets have `confidenceThreshold === 0`** (executed against
    `getCategoryCalibration` over `defaultScanSymbols`: 72 zero, 25 nonzero).
    So at reopen most of the roster has no score gate at all, while the Guide
    tells the reader "each market type must clear its own qualifying bar before
    a setup is shown at all". Those zeros were derived from the corpus the
    2026-08-11 programme condemned.
  - **The Desk's Record row publishes the condemned money-positive rates** as
    measured fact, behind a caveat that reads as an improvement notice rather
    than an invalidation.
  - **The decline sentence — CLOSED 2026-08-30 (#471), record corrected
    (#476).** `analysisDiagnostics` reaches NO CLIENT: the scan payload is
    `{blocked, opportunities, persistence, qualified, scanned}`, and none of
    the four `setAnalysisState` calls sets the field, so the panel's read of it
    is dead against every path. It reaches `analyzer_events` and stops. That
    one fact resolves what the bullets above used to claim in two directions at
    once. **The only symptom a reader ever saw** was all fifteen declined
    markets answered "No current limit setup met the review threshold." — a
    transient sentence inviting a rescan that can never succeed against an
    exhausted FMP quota. The dead `reviewCopy.ts` rewrite had no reader-facing
    effect either, because nothing it rewrote ever arrived; the earlier claim
    that "the raw engine sentence reaches the reader" was wrong on the same
    fact. The sentence's `after the venue's published costs` clause was ALSO
    false — `remediation-program-2026-08-11.md` records that the cost scale
    never reached the resolver and "the sentence shipped on all fifteen was
    false" — and the register's internal `reason` was corrected on 2026-08-11
    while the operator-facing sentence was not. Now one
    `engineDeclineSentence` beside the register, carried on `reason`, the
    channel that survives both rebuilds (`scanOpportunity` and
    `AdvisorWorkspace` each rebuild field-by-field, which is why widening the
    server type alone would have shipped and done nothing — #457 one surface
    over). `tests/engineDecline.test.ts` reads the fields each rebuild actually
    carries rather than counting engine sites.
    **The heading was still contradicting it — CLOSED 2026-08-31 (#478).** With
    the sentence corrected, `NoSetupPanel` still headed a declined market
    "Nothing passed review" and bodied it "did not find a CURRENT limit setup
    strong enough to show", directly above the permanent verdict: two of the
    three elements invited a retry the third had ruled out. The decline now
    carries a TYPED `declined: true` across both rebuilds — the standing
    `withheldFor` got in #457, and for the same stated reason, since a branch
    reading the sentence breaks every time the sentence improves. The near-miss
    body does not render on a decline at all (§17f: the Primary reason already
    carries the measurement and the way back in, and restating it is what made
    this element a contradiction).
  - **The CAUSE now reaches the reader on every no-setup market — CLOSED
    2026-08-31 (#484).** `analysisDiagnostics` and `providerWarnings` were
    computed on the server, written to `analyzer_events`, and dropped by BOTH
    candidate rebuilds — so `NoSetupPanel`'s supporting-reason section could
    never render, and every no-setup market (the engine's own figure is 45 of
    50 on a live open-market scan) was answered with one flat sentence while
    the analyzer had already worked out which gate failed and by how much.
    Both fields now cross both boundaries. The guard is the GENERALISED form
    of the #457 lesson: it derives from `NoSetupPanel`'s own reason expression
    which response fields the panel reads, and requires each to survive both
    rebuilds — so a fifth source added to that list fails until it is carried.
    Bounded: diagnostics are capped at 5 and provider warnings at one per
    intraday timeframe, and the panel renders at most three supporting lines.
  - **The score sentence — CLOSED 2026-08-30, and it was a TELEMETRY defect.**
    The decline branch had no `return`, so "scored 47; Levelflow requires 0 or
    higher" followed the decline into `analyzer_events` — a contradiction in
    the record, not on a screen. It is now gated on `confidenceThreshold > 0`.
    **The census, corrected:** 72 of the 98 markets in the symbol map resolve
    to a zero threshold through `getCategoryCalibration`; 26 carry a positive
    one (25:18, 30:2, 40:3, 68:3). The earlier "72 of 81 calibration entries"
    counted table lines (there are 80; the 81st match was the type
    declaration) — a per-entry census answering a per-market question, and the
    two coincided at 72 only because every zero is a per-symbol override. The
    early return also silently narrowed the through-market instrument from 97
    markets to 82; the plan-refusal reading is now kept before returning.
  - **Guide §5's own amendment-34 remedy is sourced from the condemned
    corpus** — the ρ ≤ 0.06 finding measured on the repaired corpus that the
    programme invalidated. The fix deleted an unearned claim and replaced it
    with another measured one.

  **Three clauses, and only the first is mechanizable today.** (a) Invert the
  guard's shape: instead of pinning `true`, assert that IF `PARKING_GATE` is
  false THEN no condemned figure and no measured-record sentence remains — the
  test already reads source as strings, so this needs no new machinery. (b)
  Give every derived calibration constant a provenance stamp naming the corpus
  it came from, so "is this figure from the condemned corpus?" becomes
  answerable by code; that is **pre-R3-register class — cheap now, impossible
  after the one re-sweep**. (c) The rest is an owner ruling recorded as a dated
  literal beside the flag, the way §17p records the park. Anyone claiming the
  gate can be fully mechanized is claiming (c) away.

- **A reopen has a second step, and it is not the park's mirror.** The park's
  second step was a database mutation the flag could not perform. The reopen's
  is a live verification the flag cannot perform: `signInWithOtp`
  (`src/components/auth/AuthScreen.tsx`) is the ONLY door a real user has, and
  every E2E authenticated path uses `signInWithPassword` instead — so CI has
  never exercised it. No real user has requested a magic link since
  2026-08-07, across a fleet credential rotation whose fallout already stranded
  two other non-Keychain copies, and the auth SMTP credential is written by a
  separate manual script rather than by `sync-function-secrets.sh`, the conduit
  #360 built for exactly that class. **A reopen is not complete until one live
  magic-link email is delivered with the correct sender, subject and accent** —
  after the ~5-minute GoTrue cache, per the house standard.

- **The reopen has an ordering hazard the park wrote down and the reopen did
  not.** §17p ordered the park so the logout ran after the gate was live.
  Vercel builds on push while `deploy.yml` runs separately — AGENTS.md already
  states that law for migration-dependent frontend — so flipping the flag in a
  change set alongside anything else can open the public door while the Edge
  deploy, the deploy-time E2E suite and the header poll are still running or
  have failed. **Land the flag flip alone, one push AFTER a green
  `deploy.yml`.**
- **The real-fill measurement, in both its branches.** §5 states the boundary —
  either operator-entered fill prices get captured, or Levelflow has no
  measurement of a real fill and should say so — and neither branch appears in
  R0-R6 or in items 5-11. The disclosure branch is an amendment-34 obligation
  and belongs beside R6; the capture branch can wait, but say which is deferred
  rather than leaving both unranked.

### ▶ RESUME HERE — 2026-08-23 20:00 UTC

**This session ran ON THE STUDIO MACHINE, and R0's data half is RUNNING.**
That is the single fact a resuming session needs first. Below the next two
blocks is the 2026-08-20 record. It is kept, but it is NOT blanket-endorsed:
where it and this block disagree, this block governs, and the lines it
supersedes are corrected in place and dated rather than deleted. An earlier
draft of this sentence said everything below was "still true", which told a
resuming session not to check — while three retained lines still called R1c the
next item.

#### What "the studio machine" is — the register item, closed

The term was load-bearing and undefined: it gated the top-ranked item and
nothing said what it was or how a session could tell. It is **the machine
that holds `.calibration-cache` and the loaded launchd agents** — in
practice the owner's own Mac at `~/Projects/levelflow-cloud`, not a
container. The test is derivable, so no session has to be told:

```sh
launchctl list | grep levelflow      # the two agents
ls -d .calibration-cache             # the store the rebuild rebuilds
```

Both present → R0's budgeted run is available to you. Neither → R0 is
blocked and only the offline items can move. Recent sessions ran in
ephemeral containers where neither existed, and the file was written as
if they never would.

#### R0's data half — STARTED 2026-08-23 ~18:50 UTC

Preconditions re-derived rather than assumed. Of the runbook's own §0 four,
three were re-checked and held and the fourth was taken as stamped: FMP
answered a live probe **HTTP 200 with real rows** (no 429); the minute
bank was **already current** — its own agent had run at 18:37 UTC that
day, banking 27,552 bars across 97 symbols — so no kickstart was owed and
nothing was expiring; the R0 change set was present
(`scripts/intradayChunks.ts`). The `to`-inclusivity and cap measurements
were NOT re-derived — §0 records them SETTLED and re-measuring them is not
owed. Disk headroom (173 GB free) was checked too; it is §2's budget
arithmetic rather than a §0 precondition, and is named here so this list
cannot be read as the runbook's four.

Executed so far, per `docs/cache-rebuild-r0.md`:

- **Step 1 DONE.** `com.windwardline.levelflow-cache-topup` booted out
  (the minute-bank agent deliberately left loaded and running — it is a
  different store and the runbook says so). The condemned 3.9 GB store
  moved to `~/levelflow-cache-condemned-2026-08-11`, outside the repo,
  with its `INVALID-READ-ME.txt` and the `cot-*.json` files.
- **Step 2 RUNNING**, `--symbols roster --days max --warm-only
  --byte-budget 30gb`, under `caffeinate` so the machine cannot idle-sleep
  through it, with the key delivered by `wl-secret` at exec and never on
  argv. The economic calendar (75,206 events) and the Treasury curve (853
  rows) both loaded — the two instant-death hazards the runbook names —
  with no tolerated-transport warning. ***Amended 2026-08-23: those 853
  Treasury rows are the 25.4%-covered store. "Loaded" is all this line
  ever claimed and all it can claim — see R0c and the coverage paragraph
  below.***
- **Is step 2 still running? Derive it, do not assume.** The log is
  `~/levelflow-rebuild-20260823.log` (the runbook writes
  `~/levelflow-rebuild-$(date +%Y%m%d).log`, stamped the day the run
  STARTED — a session resuming after midnight must look for the start
  date, not today's).

  ```sh
  pgrep -fl replay-sweep                       # alive?
  tail -3 ~/levelflow-rebuild-20260823.log     # where it got to
  grep -c '	warm	' ~/levelflow-rebuild-20260823.log   # symbols warmed, of 97
  ```

  A run that is gone with fewer than 97 warm lines died or was killed.
  It is **resumable** — completed symbols persist and a re-run tops up
  cheaply — so the remedy is to re-run step 2, not to start over.

- **Step 2 has its own completion gate, before step 3.** From
  `docs/cache-rebuild-r0.md` §2: grep the log for `treasury top-up
  failed` before calling step 2 done, because a rebuild can finish green
  with the treasury store un-warmed. Also grep for `WOULD REFUSE`, which
  is the corpus door reporting in advance which symbols would fail a
  sweep pre-flight at this depth.

  ```sh
  grep -nE 'treasury top-up failed|WOULD REFUSE|429' ~/levelflow-rebuild-20260823.log
  ```

  The density observation above is early-run evidence, not this grep.

  **This grep is necessary and NOT sufficient, and R0c is why.** None of its
  three tokens can fire for a Treasury curve that is merely truncated — the
  25.4%-covered store produced zero of them. A clean grep here means the run
  did not hit the failures the grep names; it is not evidence the stores are
  sound. Step 3 is what checks the curve, and only since **#379's** coverage
  gates — named rather than left as "since the gates landed", because that was
  written while they were still unmerged and was therefore false of the tree a
  reader would have got. Before them step 3 printed
  `ok treasury-rates: 853 curve rows` over exactly this store and reported no
  failure of any kind.

- **Steps 3, 4 and 5 are OWED and are the first thing to do after that.**
  `npx tsx scripts/verify-cache-clock.ts` must be green before anything
  sweeps; **step 4 re-arms the top-up agent** and skipping it silently
  stops the nightly warm; step 5 deletes the archive, and only after one
  green nightly log.

**Early evidence the rebuild is repairing what it was built to repair.**
Every forex major warmed so far reports 5-minute density ~197–200 rows/day
against 15-minute ~66/day — a ratio of **3.00**, mid-band on the
verifier's [2.5, 3.5]. The 1b sawtooth read **0.6–1.0**. Zero
`WOULD REFUSE` lines, zero 429s, zero treasury failures.

**But read that last clause against R0c before taking comfort from it.** "Zero
treasury failures" is what this run's completion gate can SAY, not evidence the
curve is sound — the gate greps three tokens and R0c is a defect none of them
can produce. The 853 Treasury rows that "loaded" above are the 25.4%-covered
store. The rebuild ends green over it by design, because every consumer of the
curve sits behind `!args.warmOnly`. **Do not read this paragraph as covering the
Treasury store; R0c is the item that does.** This is an
in-flight observation, not step 3's verdict; it does not substitute for
running the verifier.

**Do not run `npm test` or any sweep on this machine while step 2 runs.**
CI's seven-gate `build` job is the authority for anything merged
meanwhile — that is how the three PRs below were gated.

**The rebuild itself did not move on 2026-08-20.** The session spent that
time on the fleet-wide CONVERGE standard instead — see "The fleet standard,
2026-08-20" below. R1c was the next rebuild item and nothing was started on it
*(superseded 2026-08-23: R1c is merged and R2 is next)*. The day's work in THIS repo is **docs-only — `AGENTS.md` and this file**
— across a sequence of squash-merged PRs beginning with #366; run
`git log --oneline origin/main` to see which. Deliberately not enumerated: two
earlier versions of this sentence named a closed set ("the only change is
`AGENTS.md`", then "`AGENTS.md` and this file, merged in #366") and each was
falsified by the very next commit that recorded it. This is the sentence a cold
session reads to learn the blast radius, so it states the SHAPE of the change —
which files, what kind — and leaves the count to git.

- **main carries R1b (#364), the CONVERGE citation, and this record** — in
  that order, each squash-merged. **Run `git rev-parse --short origin/main`
  for the current SHA; it is deliberately not written here.** This block
  lives ON main, so any SHA it records for main is invalidated by the very
  commit that records it — which is exactly what happened when an earlier
  version pinned `73000d6` and then merged, making main `998dcff`. The
  dead-SHA rule in the statistical-core fingerprint bullet below — the one
  about `d0b9907` — applies to live pointers too: do not record a pointer whose
  own recording moves it. Named rather than counted ("four bullets down" was
  wrong by two when written), because an ordinal is itself a pointer that moves
  the moment a bullet is inserted. `19706e8` (R1b) stays cited because
  it is a merge commit on main and will resolve for as long as the history
  does. Working branch `claude/rebuild-handoff-continuation-zlecqj` is reset
  onto main after each merge, per the merged-PR rule. Tree clean.
- **2,474 tests, and all SEVEN gates green** — `check`, `lint`, `check:migrations`, `npm audit --audit-level=high`, `test`, `build`, `check:bundle`, in that order after `npm ci`. Named rather than counted because a count is not a checklist: this session ran six of them across every round it drove and reported
  "six gates green", which was an accurate count of what it ran and an under-count of what AGENTS.md requires. The omitted one was `npm audit`, and it passes clean.
- **The statistical core's fingerprint is
  `e9ea8ecf2331d31109b5022054b515e00c75a287b138ba62577d167439ce42d8`** —
  sha256 over `familyPairedP`, `permutationPValue`, `mulberry32`,
  `supportOf`, the `MIN_EFFECTIVE_PAIRS` lines and the
  `accepted`/`thin` expressions, extracted from `scripts/grid-totalr.ts`
  in that order and joined by newlines. **Re-verify it on every change
  to that file.** Recorded as a HASH rather than as "byte-identical to
  `d0b9907`", which is how this check read until #365's second round
  pointed out that `d0b9907` is a pre-squash commit on the #364 branch —
  merged and deleted, so unreferenced on the remote and GC-eligible. A
  standing instruction may not rest on a commit nothing references. The
  core as it stands shipped in `19706e8`.
- **R1c SHIPPED 2026-08-23 — the next item is R2.** Three PRs, each one
  concern, each merged on a green seven-gate CI `build`: **#373** extracted the
  collapse comparator out of `index.ts` into `scanCollapse.ts` and added
  `executionScore` to the sweep emit; **#374** fixed a load-bearing test that
  was asserting nothing (below); **#375** is the reader,
  `scripts/e4-collapse.ts`. Its scope was and remains
  `docs/research/r1-divergence-map-2026-08-18.md`, which now also records what
  its own E4 section got wrong and what the reader deliberately does not do.
  **R2 does not wait on R0's data half**, which gates R3 onward. Whether every
  R2 item is offline is deliberately NOT claimed — the rank table's R2 row is
  the careful statement and this bullet defers to it: M5 names the resolver and
  D1 names learning, both live surfaces, so scope each against the map before
  assuming a reader-only change.
  **Both were scoped and both landed 2026-08-31, and the caution was right.**
  M5 turned out to be mostly research-side with one live touch — the outcome-
  sync bridge, which now passes cost scale 1 explicitly so no environment
  variable can re-grade the corpus. D1 was fully live: an analyzer behaviour
  change, a migration, and an `ANALYZER_VERSION` bump.
  **Measured against production while scoping D1 (2026-08-31), because it
  changes what a reader should expect to find:** `trade_setups` and
  `trade_outcomes` both hold ZERO rows, so global learning has nothing to learn
  from yet and D1 is entirely forward-looking — there is no backfill question
  and no corpus to re-grade. `strategy_weightings_global` holds 100 rows across
  eight RETIRED analyzer versions, two of them carrying a non-zero
  `confidence_adjustment` (0.5 and 2.0). None can reach live scoring: the read
  filters on the current `ANALYZER_VERSION` and no row matches it. The version
  boundary is doing exactly the job it was built for, which is why the
  migration deliberately leaves those rows alone rather than rewriting history
  to a measure that never produced them.

- **A guard that enforced nothing, for every reader, in CI as well as here
  (#374).** `tests/emptyCorpusRefusals.test.ts` spawns each corpus reader with
  no corpus and asserts it refuses. It was passing without any reader ever
  running. `npm test` runs under `tsx --tsconfig tsconfig.tests.json`, and tsx
  exports that as `TSX_TSCONFIG_PATH` — **relative**. The scan spawns readers
  from a temp cwd, deliberately, so the child resolved that path against the
  temp directory and died inside tsx's own loader before the reader's first
  line. The crash satisfied every assertion: exit 1, long non-empty stderr, no
  npm/npx marker, no ENOENT — and the minified bundle it dumps contains the
  substring `emit`, so it even passed the check that the refusal must NAME the
  corpus. This is #364 round 55's defect on a new axis, inside the test written
  to enforce that a run examining nothing must not report success, and it
  survived round 55's own remedy because the crash text happened to contain the
  word that remedy looks for. Fixed by dropping the variable from the child
  environment; `tsx/dist/register` now joins the harness-failure pattern.
  Verified both ways — `data-limits.ts` went from a loader dump to
  `usage: data-limits.ts <emit.jsonl>`, and every reader's spawn moved from a
  uniform ~90ms crash to 150–450ms of real execution. **Every reader the glob
  finds does refuse correctly once executed** — sixteen at #374, and the
  population is derived rather than counted precisely so this sentence does not
  go stale when the next doored reader joins it — so the law held; it was
  simply never tested. The generalisable half: an assertion that a process SAID
  something is satisfied by any process that says enough, and a substring
  common in minified JavaScript is not evidence of anything.

- **What R0 does and does not block — and it held exactly as written.** This
  paragraph was the tail of the old "Next item is R1c" bullet and was left
  dangling on the bullet above when that one was replaced; it is its own bullet
  now. R1c did not wait on R0 *to be built* — it is offline, and R0 gates R3
  onward — but the map scopes it as "doored and population-pinned like every
  other reader", and corpora without a hashed `conditions` block refuse at the
  door. The only corpus, `3b108f43d4c2`, predates that block and is condemned
  by the ⛔ STOP section. So the instrument was **written** without R0, and it
  **cannot produce a reading** until R3's re-sweep yields a corpus its own door
  accepts. That is now a shipped fact rather than a forecast, and it is the
  whole point of this file: the 2026-08-11 clock defect is the case of a number
  produced from a corpus that should have refused.
- **R2b is new and its rank is load-bearing** — it must clear before R3
  opens, because R3 is the ONE re-sweep and R2b changes what should be
  measured.
- **R0's data half is still the critical path for everything from R3 on.**
  It needs one budgeted studio-machine run per `docs/cache-rebuild-r0.md`,
  minute-bank kickstart first. No corpus exists until it runs.

#### Fleet contract — local state

This repository now carries its complete fleet contract in `AGENTS.md`: the
`FLEET.md` citation and ordered eight-step CONVERGE cycle; every workflow named
by filename; Levelflow's actual daily dependency-and-headers schedule; the
eligible review predicate; the action-pin gate and immutable-tag rule; and the
Dependabot hold and grouped-PR semantics. `security.yml`'s schedule comments
describe the jobs that actually run. The daily population is repository-specific:
Levelflow's dependency scan is intentionally unguarded, while another repo may
carry an owner-approved hold. Do not turn this local fact into a blanket edit.

The canonical standard, checker, current rollout state, and fleet continuation
belong to `windwardline/windwardline`; do not copy their transient branch or PR
state into this file. Levelflow's rebuild state and ranked sequence remain here.
This contract maintenance did not move them. (*Superseded 2026-08-23: R1c is
DONE and R2 is next; R0's data half is running. Kept for the 08-20 record.*)
As of 2026-08-20 R1c was still next, and R0's data
half still gates R3 onward. Section 6b's executable long form is a governed home
of the method and is structurally checked against `FLEET.md`; preserve it with
the standard whenever either changes.

**A note on cost, for whoever resumes.** The advisory fleet review
(`claude-review.yml`) bills the OWNER'S Claude subscription, not Console
credits — so every push to a PR spends the same weekly budget the session
itself draws on. Roughly FIFTY-SIX rounds ran on #364 over its life — this session drove
the last twelve (45–56), which is the window its reports described and
not the total. The correction matters because this note is an arithmetic
argument about a weekly budget: the first version understated the spend
by about 4.7x. The gate bullet above no longer carries a round count at
all: two halves of one block had disagreed, and the fix is to keep the
arithmetic in one place rather than to make a second copy agree with it. They earned
their cost (they
caught a shipped regression, a NaN dial, a silent depth drift, a
write-before-validate on a tracked artifact, and a test that executed
nothing in CI for a round) but the arithmetic is worth knowing before
opening a long-lived PR under a constrained limit. #364 was merged on
green CI without waiting for a tail-flat round, deliberately, on the
owner's call: the review is advisory per AGENTS.md, and twelve rounds had
never produced a flat one.

#### Unresolved, recorded here so it is not lost — audited 2026-08-20

An adversarial read of this file was run on 2026-08-20 with the single brief
"find what it FAILS to carry." Each entry survived my own re-derivation and
names the check that reproduces it. **Entries are as of the commit that wrote
them.** Some are marked CLOSED or PARTLY CLOSED because the same commit that
wrote them closed them — count the markers in the register rather than
trusting a number here, which is the rule this file applies to its own test
counts. A register that records "X is missing" and then supplies X in the same
diff is this file's own self-invalidating class one level up, so it is
labelled rather than quietly rewritten, and the wrong version is kept visible
so it cannot come back. Nothing below blocked building R1c, and R1c is now
built; all of it is still owed before this file can be called accurate.

- **FIVE commits cited in §6b-i are unreferenced. The sixth, `d947245`, is
  live — the headline said otherwise for two rounds and was wrong.** The
  reproducible check is `git cat-file -t <sha>` **in a FULL clone**: a shallow
  checkout — which is what CI and the fleet review run in
  (`git rev-parse --is-shallow-repository` → `true`) — fails for every SHA
  including live ones, so it can prove nothing either way. Run
  `git fetch --unshallow` first, or the test is not the test. In a full clone
  the five that fail are `36905a7`, `59cc4d9`, `6beac15`, `d0b9907` and
  `28bcd7b`; `d947245` returns `commit`. **The dangling-versus-absent split below is an
  observation from one clone, not a re-derivable fact**, and it is recorded that
  way deliberately: `git for-each-ref --contains <sha>` returns `refs=0` for the
  first five only on a machine that once held the #364 branch, and on any other
  clone it errors with `malformed object name` rather than returning the empty
  output an earlier version of this bullet claimed. In the clone that has them,
  the first five are dangling objects. **`d947245` is NOT dead and never was —
  corrected 2026-08-23 on the studio machine.** `git cat-file -t d947245`
  returns `commit`, and `git merge-base --is-ancestor d947245 main` succeeds:
  it is the squash-merge of #133, reachable from `main`, so EVERY full clone
  has it and no re-anchoring is owed for it. The "absent outright" reading was
  an artifact of the shallow container clones those sessions ran in, which is
  the same container/real-machine split this resume block now opens with. The
  live population of genuinely dead pointers is therefore **five, not six**. The
  consequence is specific: §6b-i's blast-radius audit — the one record proving
  an unattended agent did not corrupt the max-T null — states the statistical
  core is "byte-identical" to `d0b9907`, and **no cold session can re-run that
  comparison.** The fingerprint bullet in the resume block states the rule that
  retires such a pointer; the rule was applied to one instance and the
  population was never swept. **The discovery half is now done and the item is
  cheaper than it reads:** every backticked 7-hex token in this file is one of
  nine. **The split, re-derived on a full clone 2026-08-23, is FOUR live —
  `19706e8`, `73000d6`, `998dcff` and `d947245` — against five dead**, not
  three against six; `d947245` is an ancestor of `main` and resolves in any
  full clone, per the correction above. Only the re-anchoring remains — each of
  the five dead pointers either re-anchored to a commit reachable from `main`
  or replaced by a content hash.
- **The statistical-core fingerprint is not reproducible from its own recipe.**
  The hash appears exactly once in the tree (this file) and nothing computes
  it — no hit in `scripts/`, `tests/`, `.github/`. The recipe does not
  determine its inputs: in `scripts/grid-totalr.ts`, `accepted`/`thin` appear
  both as type-field declarations and as expressions, and `MIN_EFFECTIVE_PAIRS`
  appears eight times with no statement of which lines are in scope. "Re-verify
  it on every change to that file" is therefore an unexecutable instruction,
  and no gate fails if it is ignored. The fix is a script that emits the hash,
  wired into `npm test` — a fingerprint no tool can recompute is a conclusion,
  not a check.
- **Bare test counts, still open — and this entry's own anchors moved.** It
  used to name the "Live in production" **Tests** cell and its 2,178 against
  the resume block's 2,474. That cell is gone: it is now a **Gates** cell
  naming all seven and carrying no count. What survives is the same defect in
  two other places — the resume block's **2,474** and the launch record's
  **2,175**, both bare and unstamped, and both now predating #373–#378. The
  rule the file states about itself applies: `npm test` is the authority, so
  either delete each figure or stamp it with the commit it was measured at.
  Recorded this way rather than silently re-pointed, because an entry that
  quietly follows its subject around cannot show that the fix was partial.
- **CLOSED 2026-08-23 — the ordering is now in the rank table itself.** #376
  put it there: R2 reads "does not wait on R0's data half, which gates R3
  onward", R2b reads "after R2, **before R3**", R3 reads "**after R2b**, not
  merely after R2". The residue this entry described is gone. Original text:
  **PARTLY CLOSED — the ordering is in the resume block, not in the rank
  table.** "Next item is R1c" and "R0's data half is still the critical path"
  appeared as peers, with nothing saying whether R1c could proceed while R0 was
  unrun. The resume block now states it, with the door qualification that
  separates building the instrument from reading anything with it. **The
  residue: the rank table still does not carry the ordering**, and the rank
  table is what a session re-ranks against.
- **CLOSED — R1c's scope pointer.** An earlier version of this bullet claimed
  the file never names `docs/research/r1-divergence-map-2026-08-18.md`. False:
  the R1 rank-table row names it. The narrowed residue — that the resume
  block's "Next item is R1c" bullet did not carry it — was closed by the same
  commit that wrote the narrowing. Kept as a closed entry because the claim
  took two rounds to state correctly.
- **Spec § numbers resolve across three files and this file names one.**
  §17c/§17f/§17j/§17p are in `2026-07-30-levelflow-desk-design.md`;
  §19/§19h/§20/§20i are in `2026-08-02-broker-sizing-governor-design.md`;
  §21a–§21k are in `2026-08-16-fmp-consumption-governor-design.md` (named).
  §17p is the reopening procedure for the parked desk — the single most
  consequential pointer in the document — and a cold reader has six spec files
  to guess among. Amendments 29–38 are framed as "the live standing approvals"
  while amendments 19, 22, 24 and 25 are treated as binding in the body;
  whether pre-29 amendments still bind is never stated.
- **CLOSED — "Deployed" as a precondition for items with no production
  surface.** §6b now carries the rule, in prose beside the fenced prompt rather
  than inside it, since the fence is structurally checked against `FLEET.md`:
  where an item has no production surface, saying so IS the verification.
- **CLOSED 2026-08-23 — "the studio machine" is now defined, derivably.** The
  resume block carries the two-command test (`launchctl list | grep levelflow`
  and `ls -d .calibration-cache`) rather than a description a session would
  have to match itself against. It was the precondition of the top-ranked
  blocked item and it is no longer undefined.
- **CLOSED, and its own statement of the risk was wrong — R0's physical
  cleanup obligation.** `docs/cache-rebuild-r0.md` §4 (re-arm the nightly
  top-up) and §5 (delete the archive) are now carried explicitly by the resume
  block, which is where a session executing R0 will actually look.

  **The correction matters more than the closure.** This entry said an
  un-re-armed top-up "silently stops banking minute bars against a ~3-day
  irrecoverable window". It does not. There are TWO launchd agents and they are
  not interchangeable:

  | agent | script | store | R0's instruction |
  | --- | --- | --- | --- |
  | `levelflow-minute-bank` | `bank-minute-bars-daily.sh` | `.minute-bank/` | **leave running** — different store, own clock probes, never carried the defect |
  | `levelflow-cache-topup` | `daily-cache-topup.sh` | `.calibration-cache/` | boot out at §1, re-arm at §4 |

  The ~3-day irrecoverable window belongs to the **minute bank**, which R0 does
  not touch — `docs/cache-rebuild-r0.md` §0 says so in as many words. The
  top-up warms the calibration cache, and **everything in it is refetchable**,
  so an un-re-armed top-up is a stale cache, not lost history. Re-arming still
  matters; it is simply not a race against an expiring window, and conflating
  the two sends a session to re-arm the wrong agent believing it has protected
  something irrecoverable. An unmerged draft (#370) carried the same
  conflation and was closed rather than merged.
- **This section is a summary, not the authority, for anything fleet-wide.**
  `CONTINUATION.md` in `windwardline/windwardline` owns fleet state; where the
  two differ, it governs. The fleet work is **NOT** finished — its own §6
  records that "every new repo automatically held to the standard" is
  aspiration, not fact. Do not read the paragraph above as a completion notice.

#### The rebuild sequence itself — full detail

Full detail on the R-ranked sequence above and the reasons its order is
load-bearing: `docs/research/remediation-program-2026-08-11.md`. It documents
the sequence and nothing else — in particular it holds none of the register
entries above, which is why this line now carries its own heading rather than
trailing them.

#### R0's code half — landed 2026-08-18, hardened same day by the adversarial round

What could be done without bytes is done; what needs bytes has a runbook
and a date. The change set went through the amendment-38 loop before
merging: two independent finder passes plus the fleet review produced
~20 findings; the surviving ones were verified personally and fixed in
the same PR (#358) — including three that would have burned the rebuild
itself (chunk windows one day wider than their sizing under an inclusive
`to`; the cap tripwire counting post-rejection rows; a single outage
Sunday condemning a healthy store run-globally).

- **The constructive guarantee** — every rolling store records the clock
  that wrote it (`BAR_CLOCK` `venue-wall-utc-v3` beside the normalizer it
  identifies in `bars.ts`, with a bump contract; `CALENDAR_CLOCK` for
  the calendar store). `loadRollingSeries` refuses an unstamped or
  mismatched store loudly (`cacheClockMismatch`), refuses a corrupt or
  truncated one too (`cacheStoreUnreadable` — a malformed store used to
  fall through to a silent full refetch), and writes atomically
  (temp+rename), so no crash can manufacture the corrupt shape. The
  condemned 3.9 GB store cannot be read, topped up, or silently
  refetched by anything at this commit or later. The r17 legacy-file
  migration is gone. Token discipline: the nightly top-up stands down
  ONLY for `cacheClockMismatch` (the pre-rebuild store; the one
  non-actionable condition) — a witness refusal on a STAMPED store
  (`cacheClockWitnessRefused`) and a corrupt store both stay red.
- **The witnesses, per year, with measured limits stated**
  (`scripts/clockWitness.ts`). Everything judges per year because the
  defect shape is era-mixing, and aggregate shares certify minority
  contamination (measured: a 30%-naive weekly histogram, a
  5-of-16-naive-year transition mean, and a half-poisoned primary at 51%
  zero-shift match all read clean under aggregates). Daily NY-midnight
  stamps condemn universally — one naive year is "mixed"; the
  weekly-open DST shift PROVES utc but never condemns (the Nikkei pin);
  spring-transition evidence condemns 24/7 markets BY LOCATION rather
  than by size — `naiveYears` counts springs whose UTC hour 02 stood
  empty against an otherwise intact day, the one hour a New York wall
  stamp cannot produce; two such springs condemn, one is a coincidental
  outage, and a day ragged across many hours abstains (`sparseSkipped`)
  instead of testifying. The ratio band this replaced on 2026-08-24 was
  resolution-dependent where the defect is not — the SAME two-hour
  outage read 0.9306 at 5min (inside its [0.93, 0.975]) and 0.9167 at
  15min (outside) — and it condemned two healthy stores in one rebuild;
  15min↔5min
  registration condemns any year that registers at ±4/5 — both
  polarities pinned, −4 being the real 2026-08-11 signature, and only
  years with their own zero-shift evidence may condemn. The fleet
  re-review tightened three edges same-day: an affirmative transition
  "utc" needs 3 clean springs (the old floor of 8 was unreachable for
  2020-2023 crypto listings), while CONDEMNING needs only 2 — the
  asymmetry is deliberate, since a naive store certified healthy is what
  invalidated the corpus and a healthy store refused only stops a
  rebuild — the daily witness has no
  dead band (any year with ≥5% of both midnights is mixed; ~12 days/year
  is the stated blind floor), and shard aggregation refuses shards whose
  manifests disagree on the clock (`conditionsOf` now hashes it). THE
  STATED LIMITS, measured not conjectured: a sessioned pair whose both
  series share the wrong clock is invisible to every relative
  instrument, and a provider convention flip (everything shifts
  together) defeats even the transition witness via exact count
  conservation. Those two cases are carried by the store stamp and by
  the **reference session anchor**: ^GSPC's 09:30-ET open asserted in
  both DST regimes — venue-anchored by design, which is exactly why the
  Tokyo trap does not apply to it.
  Witnesses ride in the manifest under the hash; the driver refuses a
  condemned series corpus-globally; `verifyManifest` refuses any corpus
  with no clock block or a condemned verdict — killing every pre-R0
  corpus at the aggregation doors, and every bare emit reader passes
  through `assertManifest` too. Nine of them, found by sweeping the
  population after round 3 caught round 1's list being examples, not
  the population (market-dossier, roster-expectancy-audit,
  threshold-rescue, cost-sensitivity-verdict, feasibility-4d,
  confidence-bands, ag-class-derivation, exclusion-suspects,
  stop-provenance) — and the POPULATION is pinned by a sweep-style test
  in `tests/sweepStats.test.ts` over the known line-reading idioms —
  wider than any enumeration, honest about being a pattern match rather
  than a proof.
- **The 1b fetch defect fixed at the source** (`scripts/intradayChunks.ts`,
  extracted pure and pinned by behaviour): chunks sized per timeframe —
  5min 5d, 15min 29d — so the worst case under the MEASURED-INCLUSIVE
  `to` (chunkDays+1 dates, plus the fall-back day's extra hour) fits the
  MEASURED caps (15min ≥ 2,880 and 5min ≥ 2,304, both probed complete
  2026-08-18 — and the 15-minute floor SUPERSEDED the same afternoon by
  a 45-day probe in the live path's own shape returning **4,266 rows,
  all 45 dates complete**, recorded in
  `docs/research/r1-divergence-map-2026-08-18.md`; the chunk sizing
  stays at the conservative morning values); and the empty-window
  walk-back expressed in days (90).
  Per-chunk clip detection was measured infeasible without run-killing
  false positives — three candidate detectors died in review (#358
  rounds 1/4/4b: dead row tripwire, holiday-false-positive coverage
  check, unreadable merged tally) — so the clip guard is the measured
  caps, the verifier's density floor AND ceiling (a clipped 15-minute
  primary INFLATES the 5min/15min ratio), and R1b's E2 density
  assertion, which runs in TWO places (#364 rounds 8–11): the sweep
  driver's pre-flight, refusing at the first violator before THAT
  symbol simulates (the loop interleaves per symbol — a late violator
  costs the roster prefix already walked, #364 round 31), and the
  corpus door as backstop — while
  the nightly `--warm-only` log, the standing full-roster density
  survey, prints every symbol's rows/day and since #364 round 32 runs
  the door itself in report mode, logging `density WOULD REFUSE at
  this depth` per symbol without asserting. E2's other half
  — the distinct no-bars resolution state — stays in R1. A `BAR_CLOCK` bump now also forces the RE-SWEEP,
  not just the cache rebuild: the corpus door refuses a superseded-clock
  manifest, with `LEVELFLOW_ALLOW_SUPERSEDED_CLOCK=1` as the explicit,
  loudly-warning historical-read act. The override excuses TERMS only
  (#364 rounds 16–17): the conditions literals, evidence blocks a
  pre-R1b manifest never carried, and each corpus's own recorded fetch
  request. Every data-integrity law still binds under it — clock
  witnesses, density floors and ratio, disjoint stores, and any curve
  evidence that IS present (a manifest whose facts show a holed or
  stale-tailed curve refuses under the override exactly as on the
  current path).
- **`scripts/verify-cache-clock.ts` is the acceptance instrument**, now
  an importable audit pinned by its own test suite against synthetic
  healthy / unstamped / naive-data / shifted / sawtooth / corrupt /
  incomplete caches. Green requires: stamps, witnesses, zero-shift
  registration (a large-overlap pair that cannot register FAILS —
  uncertainty resolves toward failing at this gate), density inside the
  [2.5, 3.5] band (the ceiling catches a provider cap below ~2,386; the
  ~2,386-2,784 blind band — up to ~14% 15-minute clip reading green
  here — is narrowed by R1b's E2 door to a stated RESIDUE, not closed:
  ≤~7.7% on the door's clip-invariant ratio population, plus the
  symmetric both-series clip no ratio can see; #364 rounds 10–12), the
  ^GSPC anchor, a daily store per symbol, and — the round-6 completeness
  gates — every roster symbol's THREE stores present (an empty store
  counts as absent; a daily-only symbol previously passed every
  presence check), the reference anchor having actually RUN (without its
  intraday store the one absolute check went dark silently), the
  calendar store present, and — added 2026-08-23 — **the Treasury curve
  store present, stamped `CALENDAR_CLOCK`, and carrying rows**, an empty
  curve counting as absent on the same rule the bar stores follow. That
  last one is new because `storeKindForKey` did not recognise
  `treasury-rates` at all, so a HEALTHY curve earned `unknown store
  kind` and every rebuild reaching step 3 would have gone red on it.
  **What the gate still does not check is COVERAGE** — see R0c: the
  store measured 25.4% covered with a 278-day hole, and step 3 passes
  it. A rebuild abandoned at 40 of 97 symbols, or one that left a symbol
  daily-only, is incomplete, not green.
- **What remains is operational and UNBLOCKED (2026-08-18, the owner's
  100 GB upgrade):** `docs/cache-rebuild-r0.md` — preconditions already
  probed green (200s; `to` measured INCLUSIVE at 1,728 rows/6 dates;
  5-minute cap measured ≥2,304 — the audit-era clip not currently
  binding), kickstart the minute bank FIRST (the ~3-day 1-minute window
  is the only clock running), BOOT OUT the top-up agent (the 07:00 slot
  plus RunAtLoad would write into a mid-rebuild cache), archive the
  condemned store OUTSIDE the repo (`git clean -dfx` reaches ignored and
  untracked alike), one budgeted direct `--warm-only` roster run
  (~10–14 GB expected under a 30 gb ceiling, 8–12 h, resumable, streamed
  to a log), verify green, re-arm the agent, one green nightly, then
  delete the archive.

### ⛔ STOP — THE CORPUS IS INVALID (2026-08-11, evening)

*Session state at handoff: main clean, one branch, zero open PRs, deploy
green, 2,175 tests, 81 GB free. The 36 GB of invalid emit corpus was
deleted; its manifests, logs and symbol lists are kept as the evidence
of what was measured and how it failed. The desk is parked. Work resumes
Sunday in a fresh session — the kickoff prompt is §6a.*

**Read `docs/research/remediation-program-2026-08-11.md` before touching
calibration.** It supersedes the "next steps" of every 2026-08-10/11
document below, including item 4's own closure.

**A SECOND, INDEPENDENT invalidation of the per-market dossiers (found
2026-08-19, #364 round 48's audit of the unaudited 4c/4d consumers).**
`docs/research/market-review-2026-08-11/dossiers-net.json` is wrong for
a reason that has nothing to do with the clock defect, and would have
stayed wrong through a corrected re-sweep. `market-dossier.ts` relabelled
BOTH the pinned threshold-0 grid cell and the bare-baseline cell `{}`
into one accumulator named "SHIPPED (baseline at class threshold)". `{}`
applies no override, so the engine had already gated those rows at the
market's own threshold — they are the same decision points the branch
reconstructs from the threshold-0 cell — and **every outcome was counted
twice**. `n`, expectancy, `se` and the 95% interval were then computed
over the duplicated sample: `se` low by a factor of √2, so every
published interval is about 29% narrower than the data supports, and
markets below the `MIN_FILLED` floor of 30 cleared it on a doubled `n`
and published an expectancy they should have withheld. The signature in
the shipped artifact is conclusive — all 48 non-zero `n` on that
pseudo-cell are EVEN, against 82 even / 62 odd across every other
variant. Fixed at the join, with the script's first behavioural coverage
(`tests/marketDossier.test.ts`) and `main()` moved behind the
run-as-binary guard so it can be imported at all. Nothing programmatic
consumed the artifact — the only reference in the repo is its own
producer — so no shipped calibration carries the doubling; what it
corrupted was the human per-market review the owner mandated, which the
re-sweep has to redo anyway.

**Rounds 49–54 closed the rest of that audit's population** — and round
54 corrected how that population was chosen. Round 53 named it by hand as
"five consumers", of which `threshold-rescue`, `cost-sensitivity-verdict`
and `feasibility-4d` carried **no empty-corpus door at all** while
`roster-expectancy-audit` and `market-dossier` each carried one. The real
population is **sixteen corpus readers** — every script that opens the
one-clock door — and three more of them had no door either:
`exclusion-suspects` and `stop-provenance` printed their column header
ALONE at exit 0, and `ag-class-derivation` printed "no rows" per cohort
under a success code, each indistinguishable from a real corpus holding
nothing that qualified. The population is now DERIVED and the law
EXECUTED: `tests/emptyCorpusRefusals.test.ts` globs `scripts/` for the
door, exempts only the module that DEFINES it (an exemption that verifies
its own premise), and runs each of the other fifteen with no corpus
named, requiring a non-zero exit and a refusal that says what was
missing. That is the same correction the flag law had already forced one
round earlier — a hand-maintained list is why `market-dossier` sat
outside that law for 49 rounds — arriving one round late here.

**That scan immediately found a defect nobody had reported**, which is
the argument for deriving a population rather than naming one.
`confirm-4d` wrote `4d-final-picks.json` — the TRACKED artifact naming
which variant each market ships — from the candidates and feasibility
files ALONE, and only then called `gradeCorpus`, which refused with "no
corpus paths given" and exited 1. So a run that refused still rewrote the
picks on disk with a fresh `frozenAt`, while the operator saw exit 1 and
reasonably assumed nothing had happened; the first execution of the new
scan did exactly that to the working tree. Every sibling that writes an
artifact validates first — `derive-4d`, `feasibility-4d`,
`threshold-rescue`, `cost-sensitivity-verdict`, `market-dossier`,
`roster-expectancy-audit` — this one alone worked first and validated
second, in the script that BURNS the confirm read. Two fixes: the corpus
check moved ahead of every write, and the writer now CARRIES FORWARD an
`INVALID` banner already on the artifact instead of dropping it — the
shipped file carries one for the 2026-08-11 clock defect and this writer
emits no such key, so every re-run had been silently removing the notice
saying those numbers must not be used to withdraw, defend or ship a
market. A banner is retired by hand by whoever revalidates the corpus,
never as a side effect of running the script again. The scan now also
runs each reader from a temp directory and asserts the tracked tree is
unchanged, so "a run that names no corpus writes NOTHING" is a law rather
than an observation. Run with
no corpus, the three round-53 consumers wrote an artifact that looked
like a finished run:
"0 of 0 markets have a both-folds-positive threshold", `verdicts {}` with
an all-zero summary, "feasibility for 0 markets". The third is the one
that mattered — its consumers read an absent line as *the venue cannot
size this cell*, so an empty join reads as INFEASIBLE EVERYWHERE, a false
negative on every candidate, under an exit code saying the run finished.
Each now refuses on every axis that can empty it: its shard paths, its
cell list (`--markets`/`--cells` carry no default and an empty one matches
nothing), and the corpus-level case only the corpus can see — named cells
that matched no row, accepted candidates whose rows carry no usable
geometry. Executed coverage in `tests/emptyCorpusRefusals.test.ts`, since
what a process does with no rows is exactly what a source scan cannot see.
The same rounds made flag RESOLUTION one implementation across the whole
`scripts/` directory (`soleFlagIndex`), which closed a live
first-occurrence hole in the acceptance gate, the script that BURNS the
confirm read, both 4d derivations, both audits that exit non-zero, and the
§21j byte-budget dial; brought `sweep-analysis`'s `--emit` — the corpus
path every calibration table is computed over, and the last unguarded read
in that file — under a guarded accessor; and made the LA-6 ledger scan
refuse an unreadable line BY NAME rather than skipping it or dying on a
bare `SyntaxError`. That last one is a discipline decision worth stating:
the canonical directory is globbed whole on every confirm read, so one
truncated append blocked every corpus at once — and skipping the line
instead would risk opening the held-back fold a second time while
believing no prior read exists, which is the one outcome LA-6 exists to
make impossible. Round 54 closed the last hole in the flag law itself:
every numeric dial refused via `Number.isFinite`, and `Number("")`,
`Number(" ")` and `Number("\t")` are all **0** — finite — while `""` is
neither `undefined` nor `--`-prefixed, so a blank token walked through
BOTH guards and the dial read zero in silence. That is the ordinary shell
shape (`--min-n "$MIN_N"` with the variable unset), not a typo, and a
zero floor reopens each defect its floor was added for — no thin marker
prints, the starvation gate flags a two-row market and exits 1, EXCLUDE
verdicts resume at two filled outcomes — while `--step ""` gives the
sweep driver `stepBars: 0`, where `index += input.stepBars` never
advances and `simulateSymbol` loops forever, in a driver whose runs are
measured in hours. Which tokens are faulty is now one implementation
(`tokenFault`), shared by all seven readers exactly as resolution is,
with the two message frames kept apart because executed tests assert both
wordings. The repo had already ruled on this coercion in round 8, where
`numberFromKeys` was made to SKIP an absent-shaped raw rather than coerce
it; the flag law was built afterwards and did not inherit the ruling.
Round 55 separated the token's SHAPE from the dial's DOMAIN — `--step 0`
is finite, so it cleared round 54's guard and still hung the driver — so
`num()` now takes an optional domain with a REQUIRED basis, checked
against the default as well as the typed value. The banner rule is
derived too: all eight research-artifact writers go through
`scripts/researchArtifact.ts`, because round 54's hand-placed fix split
`confirm-4d` itself, preserving the banner on `-final-picks.json` and
stripping it from `-confirm-read.json`. Both strengthenings paid at once
— the derived empty-corpus scan found `confirm-4d`'s write-before-
validate, and requiring the refusal to NAME the corpus found
`feasibility-4d`'s round-53 door sitting below its own candidates read,
where a corpus-less run died on `ENOENT: 4d-candidates.json` and told the
operator to find a file rather than to pass their shards.

**And the scan itself had been running nothing in CI.** Round 54 paired
the temp working directory with `npx --no-install tsx`, which resolves
from the CWD's `node_modules` — so on any machine without tsx already in
the npx cache, which is every CI runner, it printed "npx canceled due to
missing packages" and exited 1. Round 54's assertions were `exitCode !==
0` and a non-empty stderr, and an npm error satisfies both. So the law
that a run examining nothing must not report success was, in CI, broken
by the test written to enforce it — green for a whole round while
executing zero readers. It passed locally only because that machine had
tsx cached. The runner is now the repo's own `node_modules/.bin/tsx` by
absolute path, and a separate assertion requires that the runner actually
STARTED, so a harness failure can never again be read as the subject
refusing. Round 55's own finding 3 — "said something" is not "said what
was missing" — is what exposed it.

The 4c/4d corpus resolved every setup against a price stream 4–5 hours
out of register with the bar that decided it — the cached 15-minute and
daily series carry naive New-York stamps read as UTC while the 5-minute
series carries true UTC. Roughly half of each review window therefore
lies BEFORE its own decision. Re-stamped and re-run, the three flagship
"measurably positive" markets go +0.213R → −0.008 (EURUSD), +0.198 →
−0.082 (BTCUSD), +0.247 → −0.031 (XAUUSD). **The measured edge is an
artifact.** Two further defects compound it: the 5-minute series holds a
third of its bars (64.7% of confirm-fold decisions are phantoms), and
the cost-sensitivity switch that authorized the 15 declines never
reached the resolver.

**Do not trust**: the 49 positive verdicts, any fill/unfilled/TP1 rate,
the declines' stated justification, or any "N confirmed cells" claim.
**Still sound**: engine v2's published cost tables, the identity work,
the product-truth fixes, gate v2's statistical machinery (its criterion
is wrong, not its statistics).

The program is Phase 0 (one clock) → 1 (one engine) → 2 (repair the
instrument) → 3 (re-sweep once) → 4 (the per-market program, = R4) →
5 (the never-analyzed populations) → 6 (reader claims). The order is
load-bearing.

### Items 5–11 — what the 2026-08-23 converge verified, so it is not re-derived

These were sized against a superseded 111-market universe. Checked individually
rather than voided wholesale, because voiding by class would have discarded live
work:

- **Item 9 is CURRENT, not stale.** Its own re-derivation command was run: the
  roster is 97 and exactly five markets have no correlation peer — HGUSD, NGUSD,
  NIKKEI, DAX, ASX. That is what item 9 says.
- **Item 7's constants are current; only its arithmetic is void.**
  `SCAN_SYMBOLS_PER_REQUEST = 10` and `scan_opportunities: 60` are unchanged. Its
  conclusion — chunk size cannot move the ceiling that binds — never depended on
  the universe size, so only the "111-market scan / 111 rows" figures need
  rescaling to 97.
- **Item 5 splits, and only half is void.** Its five statistics are all
  corpus-derived and fall with the corpus. Its two STRUCTURAL claims are code
  facts and were verified: there is no portfolio governor between scan and Desk,
  and E8's forced-flatten clocks exist nowhere in the tree. The structural half
  is prop-firm survival and belongs pre-reopen regardless of what any corpus
  says. Worth stating so it is not treated as lost: the statistics re-derive
  from R3's emit with **no new fields** — concurrent open positions reconstruct
  from `time` and `exitAtMs` across symbols within one variant and split.
- **Item 6 is not one block.** Six of its ten clauses were checked. Still live:
  `npx supabase` is unpinned and deploys production migrations; Edge Functions
  deploy BEFORE E2E runs; `engines.node` says `>=24` while this machine runs
  v26.7.0 and `@types/node` is ^26; CSP `connect-src` trusts every Supabase
  tenant; `init.sql` is referenced by no workflow. Already CLOSED: the CSP style
  hash is now derived from the installed bundle by a test. The remaining four
  clauses were NOT checked and are unverified, said so rather than asserted.

### Items 5–10: the ranking is the next converge's question (amendment 37)

The owner ruled 2026-08-11 that items 5 through 10 are an **explicit part
of the next CONVERGE**, which runs after the current work closes. Their
order against item 11 is re-decided there, not read off this numbering.
Item 5 in particular is largely §20's governor by another name, so the
two may merge. Until that converge runs, nothing below is treated as
either a blocker or a skip.

### 5 — Prop-firm survival
Median 9 open positions, p90 25, max 43 — 4.5% / 12.5% / 21.5% of the account at the
0.50% default, against E8 daily limits of 2.5–3%. A portfolio governor between scan and
Desk that *truncates* against remaining budget. Signed factor exposure replacing
base-currency correlation groups. E8's forced-flatten clocks (15:10 CT, 23:00) exist in
the spec and nowhere in code. 33% of simulated runs breach the 40% Best Day cap.

### 6 — Operations
Global learning's 414 at ~200 setups blocks item 8's cohort work · `outcome-sync`'s
non-atomic write and its 300/run starvation · `init.sql` applied by hand and unscanned ·
no Edge Function rollback, and functions deploy *before* E2E · ~~cancel-in-progress
on deploy~~ fixed 2026-08-09, see item 0 · the Supabase CLI that migrates production is unpinned and scanned by
nothing · `engines.node: ">=24"` lets Vercel build on a Node major CI never ran ·
CSP `connect-src` trusts every Supabase tenant on the internet · CI verifies an artifact
Vercel does not build · ~~the CSP style hash is hand-copied with nothing binding it to the
bundle~~ **(CLOSED — `tests/securityHardening.test.ts` now derives the sha256 from the
installed `lightweight-charts` bundle and fails on a version bump)** · `@types/node` two
majors ahead of the runtime.

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

### 9 — Coverage — **widened 2026-08-19 to own the 97-market product lens**
§5 recorded that "one further lens has never been run: the product with 97
markets rather than 50", and that nothing in the sequence owned it. It is
owned here, because two thirds of it already sat in this item and the
split was arbitrary: every measurement of render cost, scan latency,
correlation coverage and session handling predates a universe that more
than doubled. This is a question about the PRODUCT, not the engine, so it
does not block R0–R6 and must not be allowed to — but it is no longer
homeless, and its rank against items 5–11 is the next CONVERGE's to set.

The four index futures reading cash series with an unmeasured, time-varying basis —
the test that excluded the six FX majors, never applied to the markets that most need
it. **5 of 97 markets have no correlation peer** — HGUSD, NGUSD, NIKKEI, DAX, ASX —
which item 5's crowding rule needs before it can refuse anything. (The "45 of 111"
figure this line used to carry predates both amendment 32 and the correlation
completion; re-derive rather than quote it:
`npx tsx -e 'import {defaultScanSymbols,getCorrelatedSymbols} from "./supabase/functions/trade-analyzer/symbols.ts"; console.log(defaultScanSymbols.filter(s=>((getCorrelatedSymbols(s)??[]).filter(p=>p!==s)).length===0))'`
Note `getCorrelationGroup` falls back to the symbol itself, so counting by group
membership reports zero ungrouped and means nothing.) Economic-calendar and news maps never extended past
the original 50. Account-type rules enforced in the browser only.

### 10 — Fleet
Fix the retry mechanism before standardising it: it decides on annotation text an
outside contributor can author, and the fleet reusable `curl`s a mutable `FLEET.md` and
treats it as review instructions inside a job holding `pull-requests: write` and the API
key. Sequenced after item 6's `init.sql` work.

### 11 — Then hedge mind
§20, then pillar 4.

### The two cache archives, and why v2 was released (2026-08-26)

`~/levelflow-cache-v3-preDateFix-20260824` is **KEPT**. Its own retention condition is
measured and unmet: `verify-rebuild-depth --reference` against it reports **24 stores /
10,850 rows** master did not recover.

`~/levelflow-cache-v2-preR0f-20260824` was **RELEASED**, on evidence from a 65-agent
adversarial pass (38 refuted / 23 survived). Its full residue against the retained set is
**94 rows across 63 stores**, enumerated in
`docs/research/v2-preR0f-residue-2026-08-26.json`:

- **73 back-edge daily bars (2006–2013)** — the strongest keep argument, since `mergeByTime`
  never prunes and top-ups only fetch forward, so no routine path regains them. **All 73 are
  in the retained condemned corpus, OHLC-identical.** A first pass reported 56 as missing;
  that was a displacement artifact — condemned anchors daily bars at `T00:00Z` where v2 uses
  `T04:00Z`, so a timestamp match reports absent what a date match finds present.
- **9 Saturday bars** dated 2026-08-22 on a closed FX spot market, restating the preceding
  Friday to within ticks.
- **1 BTCUSD bad tick**, `o=h=l=c=4000` between bars closing 296.87 and opening 314.68.
- **1 DYDXUSD bar** inside a truncated, degraded tail — v2 ends 00:30 showing volume 0 where
  v3 and master show 15,919 and 5,784.
- **~9 calendar rows** from a `time`-only merge key, superseded by master's
  `time+currency+impact+name` with 31,446 more events — an artifact of the collapse #426/#430
  repaired.
- **201,945 further rows** in the three mis-registered foreign indices, which **reconstruct
  byte-exact from master** via the zone transform `venues.ts` records. Displacement, not data.

**Zero rows carried information a retained corpus cannot produce.** Both archives' own
`READ-ME.txt` texts are preserved verbatim below, because deleting an archive otherwise
destroys the document explaining why it mattered.

#### v2-preR0f READ-ME.txt (verbatim)

```
Snapshot of .calibration-cache under BAR_CLOCK "ny-wall-utc-v2",
taken 2026-08-24 immediately before the R0f rebuild under
"venue-wall-utc-v3".

WHY IT EXISTS. Not because v2 is correct -- ^GDAXI, ^N225 and ^AXJO are
mis-registered in it by 6, 13 and 14 hours (that is what v3 fixes). It
exists because FMP's INTRADAY DEPTH AGES OUT: refetching history can
return FEWER bars than were previously served. Measured 2026-08-23 on
DYDXUSD, where 2026-08-10 came back 238 -> 212 rows and 2026-08-11
250 -> 169 on a refetch ten days later.

So this is the deepest copy of the 93 correctly-registered sources at
the moment of the bump. If the v3 rebuild returns a shallower store for
any symbol, compare against this before accepting the loss.

The three foreign indices in here are WRONG and must not be measured
from. Everything else is correct but was normalised under v2's identity
and will not load under v3.
```

#### v3-preDateFix READ-ME.txt (verbatim)

```
Snapshot of .calibration-cache under BAR_CLOCK "venue-wall-utc-v3",
taken 2026-08-24 before the date-only anchoring fix and the v4 bump.

WHAT IS RIGHT IN IT. All 97 markets, intraday normalised per venue --
this is the deepest CORRECT intraday data we hold. Measured against the
v2 snapshot: 227 stores deeper, 23 identical, 40 shallower by exactly
one daily bar (the 5000-row rolling cap sliding, not loss).

WHAT IS WRONG IN IT. Exactly three files: the DAILY stores of ^GDAXI,
^N225 and ^AXJO. toTimestamp passed the venue zone to date-only labels
as well as intraday ones, so their daily bars anchored at the VENUE's
midnight (15Z Tokyo, 22-23Z Berlin, 13-14Z Sydney) instead of New
York's 04-05Z. computeCompletionMs recovers a daily bar's date with
newYorkClockParts, so those bars completed a full day early -- a
look-ahead. The daily-stamp witness caught it and RED'd all three.

Keep this until the v4 rebuild is verified deeper or equal. FMP's
intraday depth ages out, so a refetch can return less than it once did.
```

### A rebuild is not lossless — run the depth check before trusting one

**Corrects R0b's "fully reproducible".** FMP's intraday window ages out: a refetch can
return FEWER bars than were once served. Measured 2026-08-23 on DYDXUSD — 2026-08-10 came
back 238 → 212 rows and 2026-08-11 250 → 169 on a refetch ten days later.

**It has already happened here.** The v4 rebuild did not recover **24 stores / 10,850 rows**
that the v3 snapshot holds, worst three: USDJPY-15min −5,554, USDCAD-5min −2,581,
USDJPY-5min −1,997. Nothing refused and nothing logged; the corpus was simply shallower
afterwards, and calibration then measures against it. Those rows survive only because
someone kept the pre-rebuild snapshot.

**The rule.** Snapshot before any rebuild. Afterwards run

```
npx tsx --max-old-space-size=8192 scripts/verify-rebuild-depth.ts --reference <pre-rebuild-snapshot>
```

and keep the snapshot until it exits 0. A shallower store is a FINDING, not an acceptable
outcome — the missing rows exist nowhere else once the reference is deleted.

Three things the tool gets right that a hand-rolled check does not, each learned by getting
it wrong first: it differences timestamp SETS, not row counts (ZNUSD-daily reads 4996 → 4996
with a row missing); it identifies a clock bump by SIGNATURE rather than by the clock label
(judging on the label skipped 289 of 290 stores and declared a rebuild depth-complete on a
sample of one); and it REFUSES a thin sample rather than passing it. `tests/rebuildDepth.test.ts`
pins all three.

**This rule exists in the repo because it previously existed only in a README inside
`~/levelflow-cache-v3-preDateFix-20260824` — an archive that has itself been a deletion
candidate.** A premise whose only record sits inside the thing it protects is one cleanup away
from being lost.

### Carried, small
- `exclusions.ts` header still says BNBUSD waits on an owner ruling — stale.
- ~~`masterList.ts`'s `ONBOARDED_PENDING_SWEEP_GROUND` calls swept-and-failed markets
  "pending sweep."~~ **CLOSED 2026-08-25 (#432).** The constant was removed rather than
  reworded: it was read only as the `??` fallback beside `NOT_SCANNABLE_GROUND`, inside a
  branch that went unreachable when #257 emptied both source sets. `NOT_SCANNABLE_GROUND`
  itself still listed nine symbols as withheld while all nine were scannable; its
  population is now derived from `NO_TRADE_SYMBOLS` union
  `TEMPORARILY_HIDDEN_ASSET_SYMBOLS` and guarded in both directions.
- Entry-offset grid never derived at the new geometry.
- The indices row in `replayReliability.ts` (.51/952) is the **pre-round-28** record.
  It is left as measured rather than restated; re-measuring it is item 4's first act.
- **COT files never top up** — `fetchCotContract` serves an existing
  `cot-*.json` forever (clock-safe, but a weekly positioning series frozen
  at its fetch date goes stale silently). Surfaced by the R0 review; the
  rebuild refreshes them once, the staleness mechanism remains.
- **The daily EOD endpoint has no row-cap tripwire** (single un-chunked
  request; no cap ever measured). The rebuild runbook has the operator
  eyeball each daily store's first date; a real fix wants a measured cap
  first.
- **`starvation-audit.ts` reads the sweep's printed stdout table**, an
  artifact that cannot carry a manifest — per-gate rejection tallies
  live only in stdout, so starvation analysis has no manifested source
  at all. Exempted by name in the reader-population pin; the real fix
  (rejection tallies into the emit/manifest) belongs with R2's
  instrument work. **#364 round 1 found its positional column map had
  already drifted once** (notWarm's insertion — geometryKill silently
  summed noConsensus + belowConf) and R1b's `unresolv` column would
  have drifted it twice: it now resolves columns by NAME from the
  table's own header, refuses a table missing a required name, and a
  test pins the driver's header against the names the audit consumes.
  Any starvation reading taken from the drifted map between notWarm's
  landing and this fix is suspect; amendment 25's original 2026-08-06
  run predates notWarm and stands. R1b's two new buckets both leave
  BOTH sides of the survival arithmetic (#364 rounds 14 and 18):
  `unresolv` is a resolver defect and `dataAbsent` a data fact — the
  no-bars decisions that pre-R1b landed in planRejected and
  over-flagged sparse markets; counting either as a survivor would
  under-flag instead. It refuses a `--capture-all` table by the
  driver's stamped `# capture-all` marker (#364 round 19 — acceptance
  gates are untallied there, so survival computed from one is a false
  green; pre-marker archives are indistinguishable, so for those the
  advice stands: normal tables only), refuses any FILE it parsed zero
  rows from — per file, not per invocation, so a dead shard's log
  cannot hide beside a healthy table (#364 rounds 20–21 — survey logs
  print the full header with no data rows, and a `--grid` table may
  carry no baseline variant; "0 of 0 markets flagged" on exit 0 was a
  clean pass with nothing measured), and refuses a path set whose
  headers disagree on an optional column (#364 round 21 — an absent
  optional reads 0 meaning "unknown", and summing it with a real
  tally biases survival up); `--report` suppresses none of these. Its
  cross-split rollup sums over each parsed row's own keys rather than
  a hand-maintained list (#364 round 20). A ZERO geometry denominator
  is NO VERDICT, never survival 0% → STARVED (#364 round 31 — by the
  driver's row identity it means the geometry killed nothing, the
  expected shape for sparse floorless classes; the row prints "—"
  with the cause named, sorts last, and joins neither the tally nor
  the exit-1), a denominator below `--min-reached` (default 30 — the
  binomial basis is recorded at the constant: the smallest floor
  holding both boundary misreads at ≈2% or below, #364 round 33)
  prints its ratio with the flag withheld (#364 round 32 — 0-of-2 is
  not evidence of starvation), the floor in effect echoes above the
  table on every run, and the summary's "N of M flagged"
  denominator holds only judged markets, naming every thin-sample and
  no-verdict exclusion by cause. When those exclusions swallow the
  whole roster the gate REFUSES — a throw `--report` cannot suppress
  — rather than printing "0 of 0 markets flagged" on exit 0, the
  zero-row false green reopened by a cleanly-parsing second route
  (#364 round 33; the bounded-pilot shape over sparse floorless
  classes), and the refusal's remedies route by CAUSE (#364 round 34
  — the floor dial is inert for a zero geometry denominator, since
  the null-survival branch never consults the floor, so it is offered
  only for the thin-sample share), one level deep on the no-verdict
  side (#364 round 35 — the all-marked shape names the window or the
  feed's gradeable-bar coverage, while the nothing-reached shape
  names the pre-geometry gates or the window placement: review
  windows never consulted say nothing about the feed). Its argv path
  filter gives value-taking flags ownership
  of the following token rather than pattern-matching bare numbers
  (round 33 — `--min-reached 1e2` had parsed as floor 100 while
  handing "1e2" to readFileSync as a path; round 34 declared "which
  flags take a value" ONCE — num() refuses a flag outside VALUE_FLAGS
  and a source scan pins every dialed reader — and rode the same walker
  into account-type-report; round 35 made num() REFUSE a token it
  cannot parse, because the walker had already eaten it out of the
  path list and the silent fallback judged a partial roster at the
  default floor; round 36 spread the law to the last two dialed
  readers — sweep-analysis, whose bare Number() had let a mistyped
  `--min-n` disable every thin marker via x < NaN, and grid-totalr,
  whose name list and accessors were two places for one fact and
  whose NaN dial silently refused every variant — with the source
  scan and executed refusals covering all four). The passing
  summary names the two no-verdict shapes apart, not only the
  refusal's remedies (#364 round 36, finding 3). Executed
  against synthetic
  tables: two-split rollup, capture-all refusal, per-file zero-row
  refusals beside a healthy table, mixed-generation refusal,
  no-verdict and thin-sample rows with the partitioned summary and
  unconditional floor echo under both the default and an explicit
  `--min-reached` floor, the all-excluded refusal at the default
  floor and via a floor that excludes everything, the
  all-no-verdict refusal proving the dial is never offered where it
  cannot act, the all-pre-geometry refusal proving the feed is never
  named where it was never consulted, and the eaten-token refusal
  for a flag typed without its number.
- **`confidence-bands.ts` still carries a private `add()`/`Stats`**
  outside the one vocabulary (#364 round 5 noted it in passing —
  pre-existing item-3 drift, not R1b's): its `n` counts every row
  unconditionally, so the R1b data-absence partition cannot reach it,
  and it lacks the dispersion term. Fold it into `sweepStats.ts` with
  R2's instrument work, alongside the rejection-tallies-into-manifest
  item above.
- **`account-type-report.ts` reads several emit files in one pass with
  no cross-file identity check** (#364 round 7 noted it in passing —
  pre-existing): each file passes the corpus door individually, but
  nothing compares their measurement identity the way `gradeCorpus`'s
  `conditionsOf` does for shards — and R1b's `conditions`/curve facts
  are a new axis files can differ on. Give it the same shard-identity
  comparison with R2's instrument work. (Its argv path filter no
  longer waits with it: round 33 deferred the walker form "until the
  file is next touched"; round 34's finding 3 touched the file, so
  the value-flag-owns-the-next-token walker rode along then, with
  num() refusing flags outside the one VALUE_FLAGS declaration.) Same
  R2 destination for its per-market s.e. (#364 round 38, finding 3):
  `rStandardError` assumes within-market independence — the exact
  overconfidence `clusteredStandardError`'s docstring rejects at the
  rollup — so the σ≥2 EXCLUDE test fires more readily than the data
  supports (adverse direction; `--min-filled` bounds the sample size,
  not the correlation). Stated at the precision line and the σ site
  since round 38; the fix is day-clustering the per-market s.e. the
  way grid-totalr blocks by day.
- **`fmpRetry.ts` paced on the wall clock from its birth until #364**
  (round-9 CI caught it): `Date.now()` steps under NTP, so a forward
  step under-waited the pace — a burst through FMP's 3,000/min ceiling,
  the silent-shard-death class OP-6 built the module to kill — and a
  backward step would have stalled every consumer by the step size.
  The defect was LATENT, never live (#364 round 10, smaller):
  `FMP_PACE_MS` defaults to 0, `paceMs ?? 0` short-circuits the whole
  pacing block, and nothing in the tree sets the variable — the nightly
  top-up included — so no run was ever paced unless an operator
  exported the flag by hand, and no past run needs suspecting. Fixed in
  #364: pacing runs on `performance.now()` with a strict re-check loop
  (concurrent callers now serialize one pace apart — intended), the
  test asserts the full pace with no cushion, and a source pin refuses
  `Date.now()` in the module.
- **`loadEconomicCalendar` still binds `--warm-only` un-tolerated**
  (#364 round 13, smaller — pre-existing on main): a calendar-endpoint
  outage aborts the nightly top-up before the first symbol, the same
  shape the Treasury load was given warn-and-continue for in R1b. Give
  it the identical warm-only tolerance with R2's instrument work; the
  sweep-path throw is correct and stays. The Treasury tolerance's own
  flip side (#364 round 14; scope tightened round 21): a provider
  TRANSPORT failure there leaves a warm-only run green with the
  treasury store un-warmed, signalled by one `treasury top-up failed`
  warn line — the rebuild runbook's step 2 tells the operator to grep
  for it — while integrity refusals re-throw so the top-up script's
  red stays honest: every INTEGRITY refusal — store
  (`cacheStoreUnreadable`/`cacheClockMismatch`) and chunk
  (`treasuryCoverageRefused`/`treasuryChunkHole`) — exits red
  DEFERRED past the bar survey, so the roster still warms: none of
  the four condemns a bar store, because the store guard is per-file
  and the treasury store rides `CALENDAR_CLOCK` against the bars'
  `BAR_CLOCK` (#364 round 23 replaced round 22's same-discipline
  rationale, which the two-clock split refuted). The top-up script
  greps three of the four BEFORE its 429 stand-down —
  `cacheClockMismatch` keeps its own named stand-down, which defers
  to the raise site's log line for the remedy: since #364 round 25
  that line routes by the store's own clock (bar store → the rebuild
  runbook; calendar-clock store — treasury-rates, econ-calendar —
  delete that one rolling store and re-run) — because
  with the deferral a terminal roster 429 shares the output under
  the documented blackout and would otherwise downgrade a
  deterministic refusal to a stand-down at exit 0 (#364 round 23);
  and the tolerated transport warn re-shapes parenthesized statuses,
  so a tolerated treasury 429 cannot feed that stand-down either
  (#364 round 24). Warned over
  instead, `top-up complete` would print nightly over a store that
  never warms — that false green is the whole cost: the guard throws
  on the first zero-row chunk, so the wasted refetch is a request or
  two, never a quota problem (#364 round 22 corrected the round-21
  quota-burn rationale).
- **Watch `outcome-sync`'s `skippedForBudget` after the one-physics
  deploy** (#362 round-1 throughput note): E1's dual-series fetch means
  each NEW symbol in a run costs two provider calls inside
  `RUN_BUDGET_MS = 12s` / `MAX_SETUPS_PER_RUN = 300`, so a rising
  skipped count is the first symptom if the hourly window stops keeping
  up. No change shipped — the budget machinery is the designed backstop;
  this is an observation point, not a defect.
- **Pre-bump resolved rows carry no realized R** (D2's deferred third
  clause): rows graded before `2026.08.18.realized-r` on the
  take-profit/stop-loss branches have legs in feedback but no
  `realizedR`/`netRealizedR`, and the frontend is NOT cohort-scoped
  (`buildRecordBand`/`netRForSlice` read all rows), so the Insights Net
  R band under-counts exactly those rows — E2E debris only today, per
  the 2026-08-11 wipe. Unpark: back-derive from the stored legs with
  the same accountant, riding Phase 2's D1 recompute (one data touch).
- **Remaining credential-inventory gap in the deploy pipeline**: the
  Supabase-family GitHub secrets (`SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`) are Keychain-governed but their GitHub copies
  are not listed as consumers in `windwardline/ops` `credentials.tsv`,
  so a rotation would strand them exactly as it stranded FMP and the
  news token. They legitimately stay in GitHub (the pipeline's own
  working credentials); the fix is inventory rows, not code. (Two
  earlier siblings are CLOSED: `FINNHUB_API_KEY` turned out to be a
  PHANTOM — the workflow referenced a GitHub secret that never existed,
  blanking any Supabase Finnhub value on every deploy; the reference is
  removed and pinned against return. `NEWS_SYNC_TOKEN` moved into the
  Keychain conduit — see the incident record above.)

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

Both of the lenses this section used to leave homeless now carry a rank
(re-ranked 2026-08-19, per CONVERGE step 5 — the sequence is re-ranked,
never appended to):

- **The product with 97 markets rather than 50** — render cost, scan
  latency, correlation coverage, session handling, all measured against a
  universe less than half the size. Now owned by **item 9**, which
  already held two thirds of it.
- **The geometry model's own fresh-eyes round** (the old item 4b) — now
  **R2b**, and the re-rank surfaced an ordering constraint nobody had
  stated: its output changes what the sweep should measure, and R3 is the
  ONE re-sweep, so it must clear before R3 opens or the choice becomes a
  second re-sweep or an unprobed geometry.

---


## 6. Two prompts

Kept here so they cannot drift from the state they describe. Update together.

### 6a. The kickoff prompt — opens a fresh session

**Model and effort for the Sunday lift — CONFIRMED: Opus 5 in
Ultracode.** Adversarial fan-out caught every error that mattered on
2026-08-11 and first-pass depth produced several of them, so the
capability goes to independent checks rather than to one deeper thread.
Reasoning in §6c; the method itself is amendment 38.

```
Continue Levelflow. THE CALIBRATION CORPUS IS INVALID — read
docs/research/remediation-program-2026-08-11.md BEFORE docs/HANDOFF.md,
and before you trust any calibration figure anywhere in this repo. An
audit on 2026-08-11 found the cached 15-minute and daily series carry
naive New-York stamps read as UTC while the 5-minute series carries true
UTC, so every setup in the 4c/4d corpus was resolved 4-5 hours out of
register with its own decision bar. Half of each review window lies
BEFORE the decision. Re-stamped and re-run, the flagship "measurably
positive" markets collapse: EURUSD +0.213R to -0.008, BTCUSD +0.198 to
-0.082, XAUUSD +0.247 to -0.031. The measured edge is an artifact.

Then read docs/HANDOFF.md — the total state of record. Do not re-derive
what it records. Do not re-ask any amendment recorded in
docs/superpowers/specs/2026-08-02-owner-rulings-amendments.md
(29 through 38 are the live ones) or any decision section 2 lists as
approved — all standing. Approvals this file once carried only
as letters (Decisions A-F, amendment 26) no longer exist anywhere; if one
of those questions comes up, ask me rather than hunting for it.

THE DESK IS PARKED and stays parked through this work. PARKING_GATE is
true; section 1 has the exact reopening procedure. Do not reopen without
my word, and tell me if anything you are about to ship would be wrong to
ship while it is closed.

THE WORK is HANDOFF's sequence items R0-R6, which now outrank everything
else in that file. The order is load-bearing:
Phase 0 one clock (rebuild .calibration-cache under a single
normalization; nothing downstream of a mixed-clock cache is worth
computing) -> Phase 1 one engine (close every sweep-vs-live divergence:
E1 resolution anchor, E2 the 5-minute sawtooth and its phantom
unfilleds, E3 market.latest, E6 the score terms, E4 correlation
collapse, D2 realized R recorded only on expiries — R1a and R1b are MERGED,
R1c the E4 instrument MERGED 2026-08-23, so Phase 1 is closed) -> Phase 2 repair the
instrument (D4 the gate has NO absolute-expectancy term — DONE
2026-08-31, M3 the confirm read decides on a bare delta with no error
bar — DONE 2026-08-31, M1 the audit double-counts — CLOSED 2026-08-31, M5 make the cost scale actually reach the resolver — DONE
2026-08-31, D1 learning from a win rate — DONE 2026-08-31) -> R2b the geometry model's own fresh-eyes
round, which must clear BEFORE the re-sweep since it changes what should
be measured -> Phase 3 re-sweep ONCE (item 2's law: one
re-simulate after the instrument changes, never one per fix) -> Phase 4
the per-market program -> Phase 5 the never-analyzed populations ->
Phase 6 the reader-facing claims.

PHASE 4 IS THE MANDATE, in my words: every single tradable market E8
offers across all three account types that we have an FMP match for,
reviewed thoroughly and INDIVIDUALLY — the positive ones, the negative
ones, and the so-far-unmeasurable ones. Not by class. I am not satisfied
with piecemeal answers; they have repeatedly left money on the table and
contributed to losses. Each market gets its own verdict, graded against
ITS OWN shipped configuration rather than a grid reference cell, with
ABSOLUTE expectancy as the criterion rather than a delta, and every
calibration field either derived for that market or carrying a stated
reason for inheriting.

THE METHOD — this is how we work now, not a technique reserved for hard
problems (amendment 38). Every claim that changed a decision on
2026-08-11 survived only because something independent tried to KILL it,
and two of the finders' own claims were overturned in turn. So: FIND
with several adversarial agents, one lens each, each asked what is WRONG
rather than what to improve; then REFUTE with an independent pass whose
brief is to kill each finding; then VERIFY the load-bearing claims
YOURSELF rather than relaying an agent's word — especially any claim
that flatters the work. Two traps already paid for: a DELTA is not a
LEVEL, and identical numbers from two supposedly different runs are
proof the knob did nothing, not agreement. Section 6b has the full loop.

Protocols: branch off main, never commit to main, Conventional Commits,
all SEVEN gates green before anything is called done — check, lint,
check:migrations, npm audit --audit-level=high, test, build, check:bundle,
named rather than counted because this session ran six of them for
round after round while reporting "six gates green" — docs ride
along in the same change set, `gh pr merge --squash --auto
--delete-branch`, verify production after deploy, clean up branches.
Report failures honestly with the output. Run to completion; do not stop
at turn boundaries to ask whether to continue. npm test does NOT run
Playwright — derive across that boundary. NEVER run the full test suite
while a sweep fleet is running; it jetsams the workers on this 16GB
machine.

CONVERGE is a standing command for the rest of this rebuild — section 6b
defines it. Items 5-10 of the sequence are an explicit part of the next
one (amendment 37).
```

### 6b. CONVERGE — the one-word trigger, and its long form

**Precedence and enforcement.** `FLEET.md` in `windwardline/windwardline` is the
fleet standard and governs where it and any local copy differ — including this
section. This fenced prompt is the executable long form. The paired fleet checker
derives the cycle and delivery labels from `FLEET.md`, then requires the prompt to
carry every item in order. A change to either side lands with the other.

`CONVERGE` is defined inside the kickoff prompt as a standing command, so once a
session has read it the single word is enough. The paste below is its long form:
use it when the agent has lost context, when a session did not open with 6a, or
any time the full loop should be restated rather than invoked.

**Revised 2026-08-11 (owner ruling): the adversarial half is now two halves.**
The original loop asked several one-lens agents what was wrong. That found
things — but on 2026-08-11 every claim that actually changed a decision survived
only because a SECOND pass tried to kill it. The cost-scale no-op, the corpus
clock artifact, and the improvement-versus-positivity conflation were all caught
by refutation, never by the pass that produced them; and two of the finders'
own claims were themselves overturned. Finding and refuting are different jobs
and CONVERGE now names both.

**"Deployed, verified in production" is a precondition that some items cannot
satisfy, and that is not a failure to hunt down.** The cycle's done-condition and
its step 8 both name deployment, because the items it was written against had
production surfaces. Several do not: an offline research reader (R1c) has none, a
review round (R2b) has none, and R0's data half runs on the studio machine rather
than production. Where an item has no production surface, **say so explicitly in
the report** — that is the verification — rather than leaving a resuming session
to look for evidence that could not exist. Where an item DOES touch the live
path, the precondition binds exactly as written. The fenced text below is a
governed home of the method and is structurally checked against `FLEET.md`, so
this clarification sits outside it rather than editing it.

```
Continue. Work docs/HANDOFF.md's sequence from wherever it now stands, and fold anything
your own work has surfaced since into its correct rank rather than appending it. When the
current item is genuinely done — gates green, deployed, verified in production, branches
cleaned — run another full cycle:

(1) **FIND.** Use several adversarial agents, one lens each, asking what is wrong or missing rather than what to improve. Choose lenses for the work at hand; the standing set is look-ahead and statistical validity, fill realism, cost truth, coverage and population, risk and prop-firm survival, product honesty, operations, and engine conformance. Each finding carries file:line or command output, the exact population it affects, and the procedural mechanism that let it through.
(2) **REFUTE.** Run a second, independent pass whose brief is to kill each finding, not agree with it: inflated severity, already remedied, wrong population, or arithmetic that does not hold. A finding survives only if the refuter personally verified it. Expect to kill some and to have others return worse than filed.
(3) **VERIFY YOURSELF.** Re-derive every load-bearing claim personally before acting or reporting, especially claims that flatter the work. A delta is not a level, and identical numbers from supposedly different runs show that the knob did nothing rather than proving agreement.
(4) **FIX.** Fix surviving findings durably at the layer that owns them. Close the mechanism that admitted the defect, not only the observed instance.
(5) **RE-RANK.** Re-rank the whole sequence from current evidence rather than appending new work to the end.
(6) **TEST.** Test whether the result reaches best-possible positioning. Keep hunting if it does not, or name the input boundary that stops further progress.
(7) **UPDATE.** Update docs/HANDOFF.md and every other source-of-truth document whose intended purpose the work touched.
(8) **REPORT.** Report the ranked sequence, surviving findings, refutations, personal verification, changed files and systems, test and gate results, deployment or production verification, blocked work, and what the agent got wrong.

- **Enumerate the gates; never count them.** Name every required command or check and report each result; a count can stay accurate while omitting a gate.
- **Stage explicit paths. Never git add -A.** Keep background work out of the staged tree, stage only authored paths, and review the staged diff before committing.
- **Validate before mutating.** Resolve identity, scope, authority, and preconditions before the first write; do not discover them after a partial change.
- **Preserve standing claims.** Re-derive adjacent assertions and update them with the change so a new truth does not leave an old contradiction behind.
- **Derive populations; do not curate them.** Build complete sets from authoritative state and state the predicate; never maintain a list that cannot detect its own stale premise.
- **A harness failure must never read as the subject refusing.** Prove the runner started and the intended subject executed before accepting any refusal or non-zero exit as evidence.

Do not stop at turn boundaries. Never claim green when it is not. If a round yields only
nulls and validations, say the diminished-returns point is reached rather than
manufacturing another.
```

### 6b-1. Owner decisions owed — raised by the 2026-08-25 converge

**THIS LIST WAS CURATED, NOT DERIVED — found 2026-09-01, and it is the register's
own defect rather than a defect in any entry.** It holds what one converge
surfaced, not every question the record flags for the owner. A sweep of the
repository on 2026-09-01 found four more, each verified against live code, and
the reason none of them was here is that nothing derives this population. The
count below is therefore a floor, and the next pass should build the derivation
rather than append to the list again.

Four questions that need a ruling rather than a repair. Each is stated with
its options and what each option implies; none was decided, because deciding
them from inside the code would be inventing a criterion and calling it a
finding.

**A. PLUSD and PAUSD — monetary metals or industrial?** Open since #415 for
the macro-rate role, where they sit at `none` with an OPEN marker rather than
a settled reason. The old `RATE_SENSITIVE_METALS` set admitted every precious
metal and excluded copper, which is a decision written into its composition
but never stated as a criterion. Admitting the platinum group means stating
that criterion. *The same two symbols are also 2 of the 15 unmapped COT
markets*, so one ruling closes two layers. Options: rule once and apply to
both in one change set, or leave both open and accept that two parts of the
engine wait on one question.

**B. The COT contract table before R3 — fill it, or declare it partial?**
`DIRECT_CONTRACTS` maps 20 of 98 symbols; `getCotContractMapping` returns null
for 50, and at least 15 of those are CFTC-reported instruments as domain
fact — including ZFUSD and ZTUSD while their curve siblings ZBUSD and ZNUSD
are mapped. Live blast radius today is ZERO: COT is absent from the live
analyzer and `cotScoreAdjustment` is 0 on every class. The reason to raise it
now is timing — R3 is the one re-sweep, and a column missing then cannot be
backfilled without a second one. Options: (i) map the 15 before R3, which
needs FMP contract codes verified and bandwidth that is currently spent;
(ii) declare the table deliberately partial and split `stance: "unavailable"`
into "no contract mapped" versus "insufficient reports", so the corpus records
WHY; (iii) do nothing, and accept that futures becomes the one class with a
within-class mapping differential. *Note*: #418's census marker on this
declaration was corrected on 2026-08-25 for exactly this reason — as first
written it would have attested that the CFTC does not report the other 78.

**C. `strategyProfiles` — were the six silent weight blocks hand-authored?**
Agriculture and livestock carry explicit "carried from futures — NOT derived"
notes. Crypto, energies, forex, futures, indices and metals carry nothing, and
those two markers establish the house convention, which makes the other six an
omission rather than a style. The weights multiply both score and confidence
of every strategy vote. Only the author can answer; inferring "NOT derived"
from an absence of evidence is itself an unfounded provenance claim.
*Second half*: crypto and forex carry ten entries where the other six carry
eleven — both omit `trend_pullback_to_value`, whose voter runs
unconditionally, and `getStrategyProfileWeight` ends in
`?? DEFAULT_PROFILE_WEIGHT`, so a renamed strategy would silently neutralise
its weight in all eight classes with no error and no failing test. A
completeness guard is ~~written~~ **SPECIFIED BUT NOT WRITTEN — corrected
2026-09-01.** No such guard exists anywhere: `git log --all -S
"trend_pullback_to_value" -- tests/` is empty, no branch or stash carries it,
and `tests/strategyProfiles.test.ts` holds four pairwise weight comparisons and
nothing else. The sentence was read as fact by a 2026-09-01 pass, which
proposed clearing a red test that was never red. It is additive when written,
and it cannot land until this is answered because it would fail on those two
classes.

**And the obvious remedy is a provenance claim, not a restatement — recorded so
it is not proposed again.** Writing an explicit `trend_pullback_to_value: 1`
into crypto and forex is bit-identical (`DEFAULT_PROFILE_WEIGHT = 1`, verified
by fingerprinting four markets' emitted rows before and after) and therefore
looks free. It is not. The commit that created the table gave forex four
explicit `1`s while omitting this one, in the same commit that gave futures
`1.08` — so silence in this table has never meant 1, and the author had the
notation and did not use it. Every stated value sits at 1.04–1.08, so a written
`1.00` would make crypto and forex the only sub-band cells and read to the next
reader as measured de-emphasis. That is exactly what the agriculture and
livestock notes exist to prevent.

**D. macroRates' 4bp band, 8bp line and −1 energy penalty — mark them
underived now, or wait for R3?** ~~Three distinct decisions, none documented~~
**FOUR, and one of the three is already documented — corrected 2026-09-01.**
The −1 already carries #415's treatment twice in this same file
(`macroRates.ts:149` HOUSD, `:170` RBUSD, both reading that the magnitude "has
never been measured anywhere in this repo"), so "extend #415's treatment to it"
restates what is there. Meanwhile `const magnitude = ... >= 8 ? 2 : 1` (`:265`)
carries an underived **2:1 pair** that this entry never named — and that pair is
the source of the "±2" bound the entry leans on. Marking three of five and
calling the surface handled is the curated-population failure. The −1 itself is
at `:254`, not `:255`.

In a file that derives `TREASURY_MAX_STALE_MS` over sixteen lines and gives all
98 role entries a `why`. #415 already shipped HOUSD and RBUSD with an in-code
note that the −1 "has never been measured anywhere in this repo". Effect is
bounded at ±2 on a 0–100 score. Not the staleness shape — these are absolute
basis-point thresholds that no roster drift can move — but they can rot on
rate LEVEL: 4bp is a large daily move at a 0.5% ten-year and routine at 4.3%,
and nothing ties the band to level or realised volatility. Options: extend
#415's treatment to the other two numbers now, or leave all three until a
valid corpus can measure them.

**E. ZO and ZR's CME-official alignment ticks — the second of the two flags
raised at the BRENT/WTI header, and it never reached this list.** It shipped on
the ZB/ZN precedent with the boundary preserved (`futures.ts:225-234`: "§20i
ruling 5 still bars exchange values from the SIZING table; alignment is a
price-grid fact, not a money fact"), grounded as the price-delta gcd of the
banked minute series and pinned at `tests/futuresRules.test.ts:208,229`. Its
companion flag closed the same day it was raised. This one did not, and the
header that carries it routes the owner to a question settled three weeks ago —
so the one live item in it has been invisible ever since. Options: ratify the
exchange-spec precedent for alignment as a standing rule, or re-derive both
ticks from the banked series alone and drop the exchange source.

**F. The E8 captures nobody can take from inside the repo.** The standing ruling
of 2026-08-07 is that every E8 tradable market with an FMP data match must be
visible and usable on Levelflow — "nonnegotiable". Three gaps stand against it
and each needs the owner at the platform: the **Softs and Stocks watchlist tabs
were never captured** (eight captured tabs produced 20 instruments E8 documents
nowhere, so these plausibly hold more — two frames closes it); **MC, BIT and
SIC** appear on the frames and no E8 source identifies them, so they are
unmatchable by construction; and **live order tickets for ZB, ZN and 6J** carry
tick sizes and values no published source has. `tests/e8RosterConformance.test.ts`
records the first as a coverage gap in terms. Blocks R5, not R3.

**G. The minute bank's only copies are on one disk — NEW 2026-09-01, and it was
recorded nowhere.** `scripts/ops/backup-minute-bank.sh` runs daily and verifies
its own snapshots, and R0b is closed on that. But bank and snapshots both live on
`/dev/disk3s5`: measured 219 MB, 2,067,013 bars across 100 symbols, and FMP
re-serves 1-minute bars only ~3 days deep, so roughly 84% is unrecoverable. The
mechanism protects against corruption and accidental deletion; it does not
protect against losing the machine. Options: send the daily snapshot off-box, or
record the acceptance of a single point of failure as a decision rather than as
an omission. Blocks nothing.

**H. R3's acceptance mode — and this one is the only entry that touches R3.**
The run card carries no `--capture-all`, and the flag is not free in either
direction. Without it `sweep.ts:984` drops every gate-failing decision, so the
below-threshold population is absent forever and `confidence-bands.ts:234` and
`threshold-rescue.ts:95` refuse the corpus outright — they call
`assertAcceptanceMode(..., { captureAll: true })`, and nothing requires the
opposite. With it, four rejection counters read zero **in the manifest's
`decisions[]`**, not merely in stdout — measured on BTCUSD: `regimeBlocked
431 → 0`, `belowPayoff 28 → 0`, `belowThreshold 28 → 0` — which partially
re-opens the hole pre-R3 register item 3 closed. And the loss is not recoverable
from the capture-all corpus alone: a decision that would have been
`regimeBlocked` walks on and dies at `noConsensus`, which emits no row, and the
ledger records `{reason, time}` with no regime.

**Recommended: run R3 twice at the 2026-08-26 anchor, gated and capture-all.**
Both cost zero provider bytes — pins do not deplete, verified across six
anchored sweeps on 2026-09-01 with the census unchanged at 290 stores — so the
cost is CPU and roughly 29 GB of disk against 265 GB free. The accepted subset
is bit-identical between the arms (measured: same decision keys, zero rows
differing field for field), so the two corpora reconcile exactly, and
`acceptance.captureAll` in the manifest plus `assertAcceptanceMode` keeps a
reader from mixing them.

### 6b-0. The diminished-returns register — what is closed, and what re-opens it

**Rounds run is NOT evidence of exhaustion.** The counter-example is in this
repo and it is one day old: R1 — the sweep↔live divergence surface — was
declared CLOSED on 2026-08-23 after roughly fifty-six advisory review rounds.
The 2026-08-24 converge reopened it with **C1**, five divergent gates, and the
FIFTH was found during the ranking pass after four lenses and eight skeptics
had already crossed the same file. Fifty-six rounds bought a closure that was
one finding early.

**The discriminator is ENUMERATED versus SAMPLED, not how many times a surface
was hit.** A surface may be declared closed only when its members were
enumerated and the enumeration yielded nothing. A surface that was sampled —
however many times, however thoroughly — is not closed; it is unmeasured. The
converge's own words for R1: *"that is not a sign the surface is exhausted; it
is a sign the surface was never enumerated."*

**Every closure states its reopener.** The repo already has this idiom in two
places — `ENGINE_DECLINED_MARKETS` carries `reprobe`, and amendment 31 gives a
matched market exactly one path off the list. A closed surface with no reopener
is a permanent blind spot wearing the costume of a decision. Closure is a
statement about measured yield, never about fatigue with the subject.

**The register.** Yield is read as `filed → survived refutation`.

| surface | rounds | last yield | enumerated? | status | REOPENER |
|---|---|---|---|---|---|
| **News join** (live event families vs the corpus) | 2 (2026-08-11 E5, 2026-08-24) | 1 → 0 | yes — the arms are enumerable from `eventRows.ts` | **CLOSED** | a new event family reaching the live gate; or the null-currency asymmetry becoming measurable once R3's corpus exists (`remediation-program-2026-08-11.md:58`) |
| **Corpus readers / manifest reporting** | ~57 (R1b's life + 2026-08-24) | 1 → 0, killed on the code's own comments | yes — the partition is derivable from the manifest in 30 lines | **CLOSED** | any new corpus reader; any manifest field added at R3; a change to the door's population rules |
| **Security & secret handling** | several + 2026-08-24 | 2 → 2, both config-surface gaps with no live wrongness | partly — `src/` is pinned both ways; the config surface was NOT walked | **CLOSED after the C7/C8 PR merges** | a new external host; a new configuration surface that can set a provider base URL; any change to `CODE_ROOTS` or the allowlists |
| **Clock & registration instruments** | 3 (#358, #384, 2026-08-24) | 3 → 3, incl. C2, the deepest defect since the 2026-08-11 clock defect | **no** | **RISING — keep lensing** | — |
| **Sweep↔live convention** | ~58 (R1's life + two 2026-08-24 rounds) | 15 `latest.time` consumers enumerated — **11 diverge**, 3 offline-only, 1 agrees — PLUS 11 more divergent consumers that never touch `latest.time` | **the `latest.time` grep: YES. The SURFACE: no** | **RISING — the precondition itself was too narrow** | `docs/research/decision-instant-enumeration-2026-08-24.md` is the record. **The old precondition is satisfied and was WRONG**: "every consumer of `latest.time`" is a strict subset of "every place the two disagree about the decision instant", and a grep-derived population is a curated population wearing a derivation's clothes. **The corrected precondition**: every construction of a `MarketContext` field, every gate that admits or refuses a decision, and every argument handed to the resolver — each stated against its live counterpart. Plus one resolvable blocker (the FX Sunday-open bar stamp, needs the cache) and **three permanent residues no re-sweep can close** — live's scan phase δ, the historical quoted spread, and FMP's Treasury publication minute — which must be carried as STATED BOUNDS, never as closures |

**How to use it.** Read this before choosing lenses. Do not point a lens at a
CLOSED surface unless its reopener has fired — and say which one fired. Do not
retire a RISING surface because it has been visited; retire it only by
enumerating it. When a round produces only nulls and validations in an area,
add the row rather than leaving the judgment in one report's prose, because a
judgment that lives only in a transcript is re-litigated every session.

### 6b-i. Staging discipline when background agents are running — learned the hard way, #364 round 46

**Never run a write-capable background agent against the working tree a
commit is staged from, and never stage with `git add -A`.** Stage
explicit paths, and diff what is staged against what you actually
authored before committing.

The incident: two background review workflows were launched against the
repository working directory while the converge loop kept editing and
committing from it. One of them changed `familyPairedP` in
`scripts/grid-totalr.ts` — replacing the family-wise max-T null with a
per-variant one, which removes the crossed grid's multiplicity
correction entirely — and `git add -A` swept that edit into the round-45
commit, which was pushed and went green through CI. It was caught by the
next fleet review round, not by the gates, because no fixture in the
suite put two floor-clearing variants in one class, so the max across
the family was never actually taken. Both halves are now closed: the
change is reverted (`familyPairedP` is byte-identical to its round-44
state) and a three-variant disjoint-block fixture pins the correction,
verified to fail under the regressed form.

**The blast radius was audited, not assumed.** The workflows ran from
13:45 and 14:24 UTC, so three commits sat inside the exposure window:
`36905a7` (round 43), `59cc4d9` (round 44) and `6beac15` (round 45).
`d0b9907` predates it by one minute and `28bcd7b` was staged after both
were stopped, with the staged diff read hunk by hunk. Each exposed
commit's file set matches its disposition exactly — no unexpected file
appears in any of them — and every hunk sits in a function within that
round's stated scope. The statistical core was then compared directly
against `d0b9907` rather than reasoned about: `familyPairedP`,
`MIN_EFFECTIVE_PAIRS` with `supportOf`, `permutationPValue`,
`mulberry32`, and the `accepted` and `thin` expressions in
`groupVerdicts` are all **byte-identical** to their pre-exposure state.
The max-T replacement was the only semantic contamination, and it is
reverted.

The generalisable part is not "that agent misbehaved". It is that a
commit's contents must be something you assert, not something you
collect — and a green suite is only evidence about the properties some
test exercises.

### 6b-ii. A harness failure must never read as the subject refusing — #364 round 55

**An executed test asserts that the RUNNER STARTED before it asserts
anything about what the subject said.** Round 54 built a derived law —
every corpus reader, run with no corpus, must exit non-zero and say what
was missing — and paired a temp working directory (so a reader's default
output path could not resolve into the repository) with `npx --no-install
tsx`. npx resolves tsx from the CWD's `node_modules`, so from a temp
directory it works only where tsx already sits in the npx cache. That is
true of the machine it was written on and false of every CI runner.

On CI it printed `npx canceled due to missing packages` and exited 1 —
and the assertions were `exitCode !== 0` and a non-empty stderr, both of
which an npm error satisfies. **The law that a run examining nothing must
not report success spent a full round reporting success while examining
nothing.** It was caught only because the next round's review demanded
the refusal NAME the corpus, at which point the npm error stopped
matching.

Three rules follow, and they generalise past this test:

- Spawn the repository's own binary by ABSOLUTE path
  (`node_modules/.bin/tsx`), never `npx`, whenever the spawn runs
  anywhere but the repository root.
- Assert the runner started — `npm error`, `npx canceled`, `command not
  found`, `Cannot find module` in stderr is a HARNESS failure and must
  fail the test, never satisfy it.
- A green that depends on the developer machine's caches is not a green.
  Any executed test whose subject is "the process refuses" should be run
  once against a cold cache (`npm_config_cache=$(mktemp -d)`) before it
  is trusted.

### 6c. Model and effort — CONFIRMED (owner, 2026-08-11)

**Opus 5 in Ultracode.** The two available options are Opus 5 with
workflow orchestration or Fable 5 at max effort; they cannot be
combined. The choice is settled by the evidence rather than by taste.

Everything that went wrong on 2026-08-11 was caught by adversarial
refutation, and nothing was caught by depth of first-pass reasoning —
which in fact produced several of the errors. Reading eleven
bit-identical rows as agreement rather than as proof a switch did
nothing; treating a gate's improvement delta as a level; calling a
corpus sound without checking that its series shared a clock. Each was
found by an independent agent whose only job was to overturn the claim,
and two of the finders' own claims were then overturned in turn.

So the capability is worth more spent on **many independent checks than
on one deeper thread**. Fable 5 at max effort buys a stronger single
pass at exactly the thing that was not the bottleneck; Opus 5 in
Ultracode buys the fan-out and the refutation that were.

Phase shape, for reference: Phases 0–2 (clock, divergences, instrument)
are subtle and correctness-critical, and benefit most from the refute
pass being real rather than ceremonial. Phase 3 is compute-bound and
model-irrelevant. Phases 4–5 are breadth across 97 distinct markets (105
only if the eight dual-listed crypto CFDs are counted twice), where the
number of independent checks is the whole game.

**Adversarial fan-out is now the standing method, not a technique for
hard problems** — amendment 38.
