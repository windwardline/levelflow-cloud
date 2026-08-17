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
live cohort under `2026.08.11.declines` accrues from an empty table. (The
E2E account's rows reappear on every deploy — pipeline debris, not history;
group by user before trusting a raw `count(*)`.)

**Reopening is one flag plus its tests.** Flip `PARKING_GATE` to `false`, invert the two
gate tests in `tests/e2e/public-auth.spec.ts`, return the four sign-in tests from
`/?enter` to `/`, and update the pin in `tests/parkingGate.test.ts`. Nothing else.
Spec §17p records it.

**The trap, learned the hard way:** the gate is consulted inside App's `!session`
branch, so it turns away arrivals and does **not** end visits. A park without the logout
step leaves every signed-in operator working behind a closed door.

### FMP is dark, and the loss is permanent

The account's trailing-30-day bandwidth allowance was exhausted on 2026-08-13 by
the rebuild's **replay sweeps** — not by the minute bank, whose steady draw is
~2.2 GB against 150 GB. Every request since has returned `HTTP 429`, on both the
bank's key path and the MCP connector. The bank is frozen at **957,161 bars,
high-water mark 2026-08-13 15:26**.

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
| Engine | `2026.08.11.declines` — 72 derived per-market cells across three tranches PLUS a decline layer of 15 markets the engine refuses to build setups for. **Both rest on the invalidated corpus** (banner above); the declines stand only on the conservative reading that the clock defect inflates expectancy. Edge Functions deployed and verified |
| Public face | The parking page |
| Tests | 2,178 at this writing — the count drifts every PR, so `npm test` is the authority, not this cell; check · lint · check:migrations · test · build · check:bundle all green |
| Repo | `main` is the trunk; the 2026-08-10/11 programme landed as #307-#322. Check `gh pr list` before trusting any count here |

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
All 111, at the repaired evaluator (item 2), on the discovered spans (4a), in
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
   job, after M5 makes the knob real. Full record:
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
| **R0** | One clock — rebuild `.calibration-cache` under a single normalization, assert it in the manifest | **NEXT** |
| **R1** | One engine — close every sweep↔live divergence (E1 resolution anchor, E2 the 5-min sawtooth, E3 `market.latest`, E6 score terms, E4 correlation collapse, D2 realized R on non-expiry branches). D3 done (#333) | after R0 |
| **R2** | Repair the instrument — D4 (the gate has no absolute-expectancy term), M3 (confirm decides on a bare delta), M1 (audit double-counts), M5 (make the cost scale reach the resolver), D1 (learning from a win rate) | after R1 |
| **R3** | Re-sweep ONCE — item 2's law: one re-simulate after the instrument changes, never one per fix | after R2 |
| **R4** | The per-market program — every matched market individually, against its own shipped configuration, absolute expectancy as the criterion | after R3 |
| **R5** | The never-analyzed populations — 8 contract variants, dual-listed crypto per line, register gaps | after R4 |
| **R6** | Reader-facing claims — D7 (Record rows publish a frequency as a record), D8 (tier ordering the corpus inverts) | pre-reopen |

Full detail and the reasons the order is load-bearing:
`docs/research/remediation-program-2026-08-11.md`.

### ⛔ STOP — THE CORPUS IS INVALID (2026-08-11, evening)

*Session state at handoff: main clean, one branch, zero open PRs, deploy
green, 2,175 tests, 81 GB free. The 36 GB of invalid emit corpus was
deleted; its manifests, logs and symbol lists are kept as the evidence
of what was measured and how it failed. The desk is parked. Work resumes
Sunday in a fresh session — the kickoff prompt is §6a.*

**Read `docs/research/remediation-program-2026-08-11.md` before touching
calibration.** It supersedes the "next steps" of every 2026-08-10/11
document below, including item 4's own closure.

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

One further lens has never been run: **the product with 97 markets rather than 50.**
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
collapse, D2 realized R recorded only on expiries) -> Phase 2 repair the
instrument (D4 the gate has NO absolute-expectancy term, M3 the confirm
read decides on a bare delta with no error bar, M1 the audit
double-counts, M5 make the cost scale actually reach the resolver, D1
learning from a win rate) -> Phase 3 re-sweep ONCE (item 2's law: one
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
typecheck + lint + tests green before anything is called done, docs ride
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

```
Continue. Work docs/HANDOFF.md's sequence from wherever it now stands, and fold anything
your own work has surfaced since into its correct rank rather than appending it. When the
current item is genuinely done — gates green, deployed, verified in production, branches
cleaned — run another full cycle:

(1) FIND. Several adversarial agents, one lens each, each asked what is WRONG or MISSING
rather than what to improve. Lenses are chosen for the work at hand; the standing set is
look-ahead and statistical validity, fill realism, cost truth, coverage and population,
risk and prop-firm survival, product honesty, operations, and engine conformance (does the
shipped engine do what the corpus measured?). Each finding must carry file:line or command
output, the exact population it affects, and the procedural mechanism that let it through.

(2) REFUTE. A second, independent pass whose brief is to KILL each finding, not to agree
with it — inflated severity, already-remedied, wrong population, arithmetic that does not
hold. A finding survives only if the refuter personally verified it. Expect to kill a
fifth of them, and expect some to come back WORSE than filed.

(3) VERIFY YOURSELF. Before reporting, re-derive every load-bearing claim personally
rather than relaying an agent's word — especially any claim you are about to act on, and
any claim that flatters the work. Two specific traps, both paid for: a DELTA is not a
LEVEL (an improvement over a bad baseline is not a good result), and identical numbers
from two supposedly different runs are proof the knob did nothing, not agreement.

(4) FIX durably, not with patches. (5) RE-RANK the whole sequence rather than appending.
(6) TEST whether it now reaches best-possible positioning, and keep hunting if not, or
name the input boundary that stops you. (7) UPDATE docs/HANDOFF.md. (8) REPORT in chat
with the full sequence visible, and state plainly what was refuted and what you verified
yourself.

Do not stop at turn boundaries. Never claim green when it is not. If a round yields only
nulls and validations, say the diminished-returns point is reached rather than
manufacturing another.
```

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
