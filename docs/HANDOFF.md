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
| Engine | `2026.08.18.one-physics` (R1a complete: D2's one R accountant on every filled resolution; live grading on the sweep's resolution tiering with the row's stored runner-protection mode and review window; the decision anchor on the last completed primary bar; no-bars expiries marked; calibration cells unchanged from `2026.08.11.declines`) — 72 derived per-market cells across three tranches PLUS a decline layer of 15 markets the engine refuses to build setups for. **Both rest on the invalidated corpus** (banner above); the declines stand only on the conservative reading that the clock defect inflates expectancy. Deployed and verified in production 2026-08-18: deploy run 380 (#362's merge) green end-to-end including the E2E chart gate, run 381 (#363's ops/docs merge) green after it |
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
| **R0** | One clock — rebuild `.calibration-cache` under a single normalization, assert it in the manifest | **code half DONE 2026-08-18** (see below); **rebuild UNBLOCKED same day** by the owner's 100 GB upgrade (probes green, `to`-inclusivity settled) — one budgeted studio-machine run per `docs/cache-rebuild-r0.md`, minute bank kickstart FIRST |
| **R1** | One engine — close every sweep↔live divergence (E1 resolution anchor, E2 the 5-min sawtooth, E3 `market.latest`, E6 score terms, E4 correlation collapse, D2 realized R on non-expiry branches, **plus discovered E7**: the options bridge drops the runner-protection mode, so live grades every row "breakeven" while the calibration ships trail_tp1/hold). D3 done (#333); E2's fetch half (chunk sizing) landed with R0. **The map**: `docs/research/r1-divergence-map-2026-08-18.md` pins every divergence to code on both sides and sequences the PRs. **R1a DONE 2026-08-18 in two slices**: slice 1 (#360) D2 — realized R from legs on every filled resolution; slice 2 E1 (the sweep's own resolution tiering in both live writers, recorded per row), E3 (decision anchor = last completed primary bar), E7 (the bridge reads the row's stored runner-protection mode and review window), E2's live no-bars marker — engine now at `2026.08.18.one-physics`. **R1b DONE 2026-08-18** (the sweep tells the truth about its inputs. E2: the no-bars marker gates on whether a completed bar COULD have existed in the resolution stream — the first slot at/after `max(createdAt, streamStartsAtMs)`, the sweep passing decision-bar-open + 15min — never on presence or containment (#364 rounds 3–4; the intermediate presence form never deployed), plus the `unresolvable` counter and the measured per-symbol density door; the aggregator partitions with it — `SweepStats.dataAbsent` holds marked rows out of `n` so fill rates state their denominator, and the driver's `unfilled` column is now `total − filled − dataAbsent`. The FIVE corpus readers STATE the partition (#364 rounds 24–55): three scoped held-out lines each naming their own population and holdout definition (the emit's stamped flag for sweep-analysis and the E8 report vs `gradeCorpus`'s read-time stratified set, whose excluded count the 4c report prints from the read, never the stamp), and `data-limits` — the table 4c per-market sweeps read their limits from — names its list as the stamped flag with the gate's own set called out; the E8 report prints `dataAbs` per market and rollup, labels held-out markets HELD OUT and fully-gated markets ALL ROWS GATED (current calibration — thresholds may postdate the sweep) rather than "NOT IN CORPUS", survives an all-marked market, and withholds its EXCLUDE verdict below `--min-filled` (#364 round 34 — the σ≥2 test's only intrinsic floor was two filled outcomes; round 35 carried the withheld share into the candidates block itself, which now names its floor and states the terms its "none" judged at, and thin negatives below the floor read no-verdict-either-way, never the reassuring "within noise"; round 36 floored the per-category rollup — amendment 24's decision grain — with the same THIN marker, stating the missing clustered s.e. when a category has fewer than two filled markets; round 37 printed the clustered s.e.'s own sample beside it — k filled markets, since roster membership is not the cluster count and k bounds the estimate — and the precision line states that the one `--min-filled` floor applies at both grains); `geometry-evidence` streams with a derived projection and a market-evidence headline; the 4c gate itself floors a zero-shared-days variant at p = 1 — `familyPairedP` had returned the minimum attainable p, exactly, from zero pairs — requires a pairing the statistic can resolve (MIN_EFFECTIVE_PAIRS 5 — the SUPPORT, nonzero shared-day deltas, since a zero delta cannot flip the sign statistic and bit-identical days are the grid's common case; basis at the constant: min attainable p is ~2⁻ᵏ, so 0.05 is unreachable below five effective pairs; both counts print as a pairs column beside pairedP, a floor refusal reads NO VERDICT with the pairing named rather than bare "fails", the boundary is pinned from both sides — accept at exactly five at 2,000 permutations with the p asserted against its derived value, refuse at four sparse and dense — and the family-wise null spans only hypotheses under test: a sub-floor sibling neither joins the maxT family nor receives a p, so it cannot block an accept-eligible variant (#364 round 40) — and the max ITSELF is now pinned by a fixture with three floor-clearing variants on disjoint day blocks, where a variant that accepts alone is refused beside its siblings on an identical observed statistic, since until round 46 every non-singleton fixture had a sub-floor sibling and the family maximum was never actually taken over two competing hypotheses; the non-shared portion's two halves are both named, compositionR the variant-only days and droppedR the baseline R a tightening dial forwent, with the exact accounting identity stated on the verdict type; the shared-vs-whole-fold mismatch is stated at the accepted site; the support predicate is declared once and consumed by the null, the p-floor and the verdict (round 41); the confirm-fold burn lands only after a confirm read actually happened — never on a throw, never on a legacy corpus with no confirm fold (round 41), and never on a run that accepted nothing, since the figure is computed for accepted variants only (round 42), and never on a confirm delta with no evidence behind it — the delta is null unless BOTH sides carry filled confirm-fold outcomes, and states both denominators where it prints (round 43); a group whose baseline carries no select-fold days is diagnosed by name at the market grain (round 41); the row's disposition rides a `noVerdict` field rather than a prefix match on the reason's wording, pinned at source (round 42), with `reason` required so no causeless label can print (round 43); and the folds line claims a read only when the ledger recorded one — naming which of its two causes applies — with `main()` itself now under executed coverage (rounds 43–44); the ledger is keyed on the CORPUS identity (`conditionsOf` — invariant across shard order and subsets, since `symbols` deliberately stays out; round 45 also hashed each shard's run-day `anchor` in, and round 47 removed it: `anchor` is `isoDate(new Date())` per INVOCATION and shards are separate invocations, so a cross-midnight or re-run shard set got a population-dependent id and a later subset read found no prior and opened the held-back fold unrecorded — round 44's finding restored on a new axis, a MISSED refusal traded for a false one. What survives of round 45's widening is `days`, and it survives by joining `conditionsOf` itself: two sweeps of different depth are two measurements, the shard loop now refuses the mixture, and that refusal is what makes the identity subset-invariant by construction rather than by assumption about how shards are run) rather than shard 0's `manifestHash`, so a reorder or a subset can no longer read the held-back fold unrecorded (round 44) — and it is FILED under that identity in one canonical tracked directory, `docs/research/confirm-reads/`, rather than beside the shards, since round 44 fixed the key and left the location derived from the corpus's path: copying the shards elsewhere to grade left the record behind and the copy could be read forever while the original's count never moved. One file also makes the append atomic again, where the per-directory fan-out could record a read the caller never learned about. Both retired forms stay honoured on READ so older ledgers keep refusing, and the refusal now names its evidence — ledger path, prior `readAt`, which key matched, and how this read's shard population compares to the recorded one (round 45). `confirm-4d` consumes `confirmRead` rather than stamping `readAt` unconditionally (round 44), and its `unreadable` count splits into FIVE causes, not three: `thin` and `noVerdict` verdicts both carry `accepted === false`, so both had been reported as having lost the gate when the gate could not judge them at all — refused-by-gate, gate-could-not-judge, thin, accepted-but-unevidenced, missing-verdict, each with a per-pick `gateDisposition` and the gate's own `gateReason`, under executed end-to-end coverage of the script that BURNS (round 45)), and refuses a baseline carrying no cell, closing the route where a typo'd `--baseline` (the one VALUE_FLAGS entry with neither refusal, now read through a guarded string accessor under a bidirectional scan, with all three path readers on one sequential walker) made every class degenerate and accepted every profitable variant (#364 rounds 37–55); and the amendment-25 starvation gate reads a zero geometry denominator as NO VERDICT rather than maximal starvation, withholds the flag below a `--min-reached` floor (default 30, binomial basis recorded at the constant), partitions its summary by cause so the flagged denominator holds only judged markets, and refuses outright — `--report` powerless, remedies routed by cause down to the no-verdict shapes, which the passing summary also names apart, since the floor dial cannot recover a zero denominator and the feed is no lever for windows never consulted — when the exclusions swallow the whole roster (#364 rounds 31–36) — the map's reader clause is the authority. E6: macro reconstruction from the historical Treasury curve at New-York-midnight visibility with curve-evidence facts hashed into the manifest, and providerWarningCount/weightAdjustment stated in the hashed `conditions` block the readers now require; emit rows carry tier, macro adjustment + stance, and marker — closure record in the map is the authority; corpora without conditions refuse at the door, and the one re-sweep stays R3's). **Remaining: R1c** (the E4 collapse instrument). **R1b MERGED 2026-08-19 as `19706e8` (#364, squashed)** after roughly fifty-six advisory fleet-review rounds over its life (this session drove the last twelve, 45–56) — merged on green CI without waiting for a tail-flat round, on the owner's call, the review being advisory per AGENTS.md rather than a required gate. The rounds are not noise: they have found a live regression, a NaN dial, a silent 60→365 depth drift, a write-before-validate on a tracked artifact, and a test that executed nothing in CI for a full round. | **R1b MERGED 2026-08-19 · R1c NEXT** |
| **R2** | Repair the instrument — D4 (the gate has no absolute-expectancy term), M3 (confirm decides on a bare delta), M1 (audit double-counts), M5 (make the cost scale reach the resolver), D1 (learning from a win rate) | after R1 |
| **R2b** | **The geometry model's own fresh-eyes round** — the old item 4b, re-ranked here 2026-08-19 rather than left in §5's prose. Several lenses, each asked what the MODEL is missing rather than how to tune it; the one surface the adversarial protocol has never been pointed at. **Its rank is load-bearing and was never stated:** its output changes what the sweep should measure, and R3 is `re-sweep ONCE` under item 2's law — one re-simulate after the instrument changes, never one per fix. Run after R3 and the choice is a second full re-sweep or shipping a geometry nobody probed. It must clear before R3 opens. | after R2, **before R3** |
| **R3** | Re-sweep ONCE — item 2's law: one re-simulate after the instrument changes, never one per fix | **after R2b**, not merely after R2 — R2b changes what should be measured and there is only one re-sweep |
| **R4** | The per-market program — every matched market individually, against its own shipped configuration, absolute expectancy as the criterion | after R3 |
| **R5** | The never-analyzed populations — 8 contract variants, dual-listed crypto per line, register gaps | after R4 |
| **R6** | Reader-facing claims — D7 (Record rows publish a frequency as a record), D8 (tier ordering the corpus inverts) | pre-reopen |

### ▶ RESUME HERE — 2026-08-20 02:15 UTC

**Paused on the weekly usage limit, not on a blocker.** It resets
**Sunday 2026-08-23 11:00 UTC (07:00 EDT)**. Everything below is a clean
state, not an interrupted one.

**The rebuild itself did not move on 2026-08-20.** The session spent that
time on the fleet-wide CONVERGE standard instead — see "The fleet standard,
2026-08-20" below. R1c is still the next rebuild item and nothing is started
on it. The day's work in THIS repo is **docs-only — `AGENTS.md` and this file**
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
- **Next item is R1c**, the E4 correlation-collapse offline instrument. Its
  scope is in `docs/research/r1-divergence-map-2026-08-18.md`, the same map the
  R1 rank-table row cites. Nothing is started on it; no scaffolding to inherit.
  **What R0 does and does not block, stated because nothing said it before:**
  R1c does not wait on R0 *to be built* — it is offline and R0 gates R3 onward
  — but the map scopes it as "the collapse reader and its report, **doored and
  population-pinned like every other reader**", and the R1 row above records
  that corpora without a hashed `conditions` block refuse at the door. The only
  corpus, `3b108f43d4c2`, predates that block and is condemned by the ⛔ STOP
  section. So the instrument can be **written** today, independently of R0, and
  it cannot **produce a reading** until R3's re-sweep yields a corpus its own
  door accepts. The distinction is the whole point of this file: the 2026-08-11
  clock defect is the case of a number produced from a corpus that should have
  refused.
- **R2b is new and its rank is load-bearing** — it must clear before R3
  opens, because R3 is the ONE re-sweep and R2b changes what should be
  measured.
- **R0's data half is still the critical path for everything from R3 on.**
  It needs one budgeted studio-machine run per `docs/cache-rebuild-r0.md`,
  minute-bank kickstart first. No corpus exists until it runs.

#### The fleet standard, 2026-08-20 — where it stands

This repo's `AGENTS.md` now cites the fleet CONVERGE standard, and that
citation became **deterministically enforced** the same night. The full
continuation brief lives at **`CONTINUATION.md` in `windwardline/windwardline`**
— read it before touching any fleet-wide document. **It is not on that repo's
`main` yet**: it rides PR #76 on branch `claude/converge-enforcement`, because
that PR must land AFTER the citation PRs (the checker reads `main`, so landing
it first makes every repo report `converge-citation:absent` until its own
citation merges). Until #76 merges, read it at
`https://github.com/windwardline/windwardline/blob/claude/converge-enforcement/CONTINUATION.md`.
Stated exactly rather than as a bare filename, because a pointer that does not
resolve is the defect this session corrected in three repos. What matters here:

- **PR #366 is MERGED as `73000d6`.** It carried three changes, not the one
  its body first described: the citation, the inlined delivery rules, and the
  workflow enumeration. The body was corrected before the merge, so `73000d6`'s
  message describes all three. **No PR number is recorded for the working
  branch anywhere in this file** — it is reset onto `main` after each merge
  and picks up a new number every time, so any number written here keeps
  resolving and stops being true. `gh pr list --head
  claude/rebuild-handoff-continuation-zlecqj` is the authority.

  Their individual commit SHAs are deliberately **not** recorded here. #366 was
  squash-merged and its branch deleted, so those commits are unreferenced on the
  remote and GC-eligible — the same defect this file records in the
  statistical-core fingerprint bullet, about `d0b9907`, and a `git show` on any of them fails for a cold session. An
  earlier version of this bullet cited all three; they were live when written and
  dead by the time it was read, which is the whole argument against citing them.
- **`windwardline#76`** adds the enforcement: `scripts/fleet-conformance.sh`
  now requires the citation and checks the cycle against a chain **derived
  from `FLEET.md` at run time**, never a literal in the script. Proven by
  inserting a ninth step into a temp copy of the standard — every repo went
  red with no repo edited, green again when removed.
- **Merge order is load-bearing.** Citation PRs first, then `windwardline#76`.
  The checker reads `main`, so landing #76 first makes every repo report
  `converge-citation:absent` until its own citation merges.
- **Four defects in THIS repo's contract are recorded and unfixed.** All are
  in `AGENTS.md`, all verified against the workflow files:
  1. "a daily cron runs only the Headers live probe" is **false** —
     `dependency-scan` carries no schedule guard, deliberately, because it
     reads the advisory database, which changes with no commit.
  2. "An advisory Claude review runs on every same-repo PR" is **false** —
     `claude-review.yml` gates on `github.actor != 'dependabot[bot]'`.
  3. The `dependabot-auto-merge.yml` hold enumeration omits the
     `unrecognised update type` branch (`:184-186`), distinct from the
     empty-metadata hold.
  4. `verify-action-pins` runs as a STEP inside `security.yml`'s secret-scan
     job and can fail that required check; the contract does not name it.
- **Also unfixed, not in this repo:** `security.yml:9`'s comment describes the
  weekly cron as "Semgrep, CodeQL, Secret scan, License policy". This repo has
  no CodeQL and no license-policy job. `AGENTS.md` is right; the comment is wrong.
- **A standing trap.** Do NOT "fix" the daily-cron claim fleet-wide. It is
  false in exactly five repos and **true** in `craft`, whose dependency-scan
  is still weekly-guarded under a documented owner hold, and in every repo
  with no dependency-scan job at all. A blanket edit breaks accurate contracts.
  This population was derived wrong twice before being derived right.

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
them.** Two are marked CLOSED or PARTLY CLOSED because the same commit that
wrote them closed them — a register that records "X is missing" and then
supplies X in the same diff is this file's own self-invalidating class one
level up, so it is labelled rather than quietly rewritten, and the wrong
version is kept visible so it cannot come back. Nothing below blocks building
R1c; all of it is owed before this file can be called accurate.

- **Five commits cited in §6b-i are unreferenced, and one cited at item 1g
  does not exist at all.** The reproducible check, and the only one a cold
  session can run, is `git cat-file -t <sha>`: on a fresh clone it fails
  identically for all six — `36905a7`, `59cc4d9`, `6beac15`, `d0b9907`,
  `28bcd7b` and `d947245`. **The dangling-versus-absent split below is an
  observation from one clone, not a re-derivable fact**, and it is recorded that
  way deliberately: `git for-each-ref --contains <sha>` returns `refs=0` for the
  first five only on a machine that once held the #364 branch, and on any other
  clone it errors with `malformed object name` rather than returning the empty
  output an earlier version of this bullet claimed. In the clone that has them,
  the first five are dangling objects and `d947245` (item 1g, the provenance of
  `MEASURED_POPULATION_BY_ASSET_TYPE`) is absent outright. The
  consequence is specific: §6b-i's blast-radius audit — the one record proving
  an unattended agent did not corrupt the max-T null — states the statistical
  core is "byte-identical" to `d0b9907`, and **no cold session can re-run that
  comparison.** The fingerprint bullet in the resume block states the rule that
  retires such a pointer; the rule was applied to one instance and the
  population was never swept. **The discovery half is now done and the item is
  cheaper than it reads:** every backticked 7-hex token in this file is one of
  nine, and the split is exactly three live (`19706e8`, `73000d6`, `998dcff`)
  against the six above, with nothing missed. Only the re-anchoring remains —
  each dead pointer either re-anchored to a commit reachable from `main` or
  replaced by a content hash.
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
- **"2,474 tests" is a bare conclusion, and it disagrees with this file's own
  other count.** The Tests cell in the "Live in production" table — named
  rather than given as a line number, since an ordinal into an 1,800-line file
  breaks on any insertion above it, which is the class the resume block sweeps
  — says the count drifts every PR and that `npm test` is the authority. It
  also says **2,178**, against the resume block's 2,474: a ~300 gap between two
  cells of one file, which is the concrete demonstration the disclaimer needs
  and neither cell makes. Treat `npm test` as the authority and delete both
  figures, or stamp each with the commit it was measured at.
- **PARTLY CLOSED — the ordering is in the resume block, not in the rank
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
- **"Deployed" is a CONVERGE precondition with no meaning for the next three
  items.** R1c is an offline instrument, R2b is a review round, and R0's data
  half runs on the studio machine, not production. None has a production
  surface. Say so in §6b rather than leaving a resuming session to hunt for a
  verification that cannot exist.
- **"The studio machine" is never defined** — not what it is, who has access,
  nor how a session tells whether it is on one. It is the precondition of the
  top-ranked blocked item.
- **R0 carries a physical cleanup obligation that is not in the resume block.**
  `docs/cache-rebuild-r0.md` §4 (re-arm the nightly top-up) and §5 (delete the
  archive). An un-re-armed top-up silently stops banking minute bars against a
  ~3-day irrecoverable window, and the condemned ~3.9 GB store sits as orphaned
  state outside the repo. Highest-consequence "cleaned up" in the program,
  connected to the phrase nowhere.
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
  that wrote it (`BAR_CLOCK` `ny-wall-utc-v2` beside the normalizer it
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
  spring-transition counts condemn 24/7 markets on NAIVE-SHAPED evidence
  only — `lowYears` counts years whose ratio sits in the [0.93, 0.975]
  band that losing exactly one wall hour produces (~0.958), so outage
  dents read as gaps, a naive-shaped median condemns, and two
  naive-shaped years are "mixed"; 15min↔5min
  registration condemns any year that registers at ±4/5 — both
  polarities pinned, −4 being the real 2026-08-11 signature, and only
  years with their own zero-shift evidence may condemn. The fleet
  re-review tightened three edges same-day: the transition floor is 3
  springs (the per-year median makes it safe; the old floor of 8 was
  unreachable for 2020-2023 crypto listings), the daily witness has no
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
  intraday store the one absolute check went dark silently), and the
  calendar store present. A rebuild abandoned at 40 of 97 symbols, or
  one that left a symbol daily-only, is incomplete, not green.
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

### Carried, small
- `exclusions.ts` header still says BNBUSD waits on an owner ruling — stale.
- `masterList.ts`'s `ONBOARDED_PENDING_SWEEP_GROUND` calls swept-and-failed markets
  "pending sweep."
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
R1c the E4 instrument is what remains) -> Phase 2 repair the
instrument (D4 the gate has NO absolute-expectancy term, M3 the confirm
read decides on a bare delta with no error bar, M1 the audit
double-counts, M5 make the cost scale actually reach the resolver, D1
learning from a win rate) -> R2b the geometry model's own fresh-eyes
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

**Precedence, and what is NOT checked.** `FLEET.md` in `windwardline/windwardline`
is the fleet standard and governs where it and any local copy differ — including
this section. `scripts/fleet-conformance.sh` enforces that mechanically, but only
against the one-line citation in `AGENTS.md`: it derives the cycle from `FLEET.md`
at run time and requires each repo's contract to carry those steps in order.

**It does not check the long form below.** So once that enforcement lands, the
one-sentence summary is pinned to the standard and the eight-step prompt an agent
actually executes is the only unpinned copy — a worse position than before
enforcement existed, not a better one. Until that is closed, whoever edits the
cycle in `FLEET.md` must edit this block in the same change set, by hand, and
whoever edits this block must check it against `FLEET.md` first. Recorded rather
than left implicit, because an unchecked copy that nobody knows is unchecked is
the failure this whole effort exists to prevent.

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
