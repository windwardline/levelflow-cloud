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
| Markets | **106** — forex 45, crypto 33, futures 27 (amendment 32 executed 2026-08-09 in two acts: thirteen derivative rows dormant, then BRENT on the owner's F13 frame — its "stable" basis measured +1.10 against the recorded +1.67, a contract-month spread no line can honestly state) |
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
  is tuned. The standard: identify money-positive setups at a high rate, account
  for how each was derived, present figures the operator can defend.
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
Started 2026-08-06. Daily at 07:02. Not scheduled work; work to not break.
*Corrected 2026-08-09:* the launchd agents exist and are loaded —
`com.windwardline.levelflow-minute-bank` and `levelflow-cache-topup`, last exit 0,
bank verified healthy 2026-08-09 (39k bars/100 symbols, recovered from the
2026-08-08 outage). *Still owed:* the bank has no backup, the same gap the 6.0 GB
corpus has.

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
the payoff figure" — the arithmetic closes on screen). *The formula half is
item 2's:* `effectiveRewardRisk` charges cost in the numerator AND the
denominator, a double penalty ≈2×cost/risk — filed under 2d, where cost
accounting is re-derived whole · plus 1o's residue: `targetLogic` is the same defect one field over
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
no-route market closed. BRENT/WTI remains the ONE open owner item: one E8
screenshot with the platform clock settles it.

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
no Edge Function rollback, and functions deploy *before* E2E · ~~cancel-in-progress
on deploy~~ fixed 2026-08-09, see item 0 · the Supabase CLI that migrates production is unpinned and scanned by
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

The standard for done is amendment 33: the engine identifies money-positive setups at a
high rate, can account for how each one was derived, and presents figures I can rely on
and defend to someone else. Find, justify, defend — all three, and the second is the one
that gets dropped.

Round 28 is the standing warning: a 96-variant grid over four axes moved indices'
survival by one point and declared the status quo optimal, because the axis that
mattered was held fixed. A lever downstream of risk cannot be derived at another lever's
old setting. Use replay-sweep's crossed axes (--grid a=1,2;b=3,4).

BEFORE any hedge-mind work advances, and repeatedly as the work proceeds, run the
CONVERGE cycle below. When I type CONVERGE — on its own or in a sentence — that is what
I am asking for, in full, without further explanation from me. Treat it as a standing
command for the rest of this rebuild.

CONVERGE means: (1) record the prior round's recommendations as approved; (2) run a genuinely
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

CONVERGE runs until the sequence reaches best-possible positioning for the data and
constraints we have, or until every remaining limit is an input boundary you can name.
That is the bar for closing this part of the rebuild and moving to the hedge mind — not
a number of rounds, and not my patience. If a round yields only nulls and validations,
say the diminished-returns point is reached rather than manufacturing another.

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

### 6b. CONVERGE — the one-word trigger, and its long form

`CONVERGE` is defined inside the kickoff prompt as a standing command, so once a
session has read it the single word is enough. The paste below is its long form:
use it when the agent has lost context, when a session did not open with 6a, or
any time the full loop should be restated rather than invoked.

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
