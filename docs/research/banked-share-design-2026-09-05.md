# The banked share — design for the refuter round (2026-09-05)

**Status (round 1, 2026-09-06): MEASURED, NOT CONFIRMABLE ON THIS CORPUS —
nothing ships; the share stays ½ in the engine.** The verdict and the
corrections it forced are §0; the sections after it are the design as it went
to the round, amended in place where a finding was verified. Amendment 39
governs: profit is the measure, win rate is a result, no ratio may be
manufactured. The figure this design is judged on is net realised R on the
tuning folds and one confirm read — never the payoff ratio it prints.

## 0. Round 1 verdict (2026-09-06)

**Nothing ships. The share stays ½ in the engine. The lever is real, measured,
and not confirmable on this corpus.** The round's refuters (seven dimensions,
two independent refuters each, 283 raw findings) attacked every section; the
verify phase ran budget-bound (one lens per merged finding); every claim below
was also reproduced by hand against a tracked artifact before it was written
here. The design is judged by net realised R, never by the printed slope.

**What decided it (verified):**

1. **The forex slope is a clean-years property, and the clean-years cell is
   still a loss.** Stratified by the feed-character witness (#590,
   `banked-fraction --years`, tracked `…-classfolds-contained.txt` and
   `…-escaping.txt`): on select's contained years forex reads R(½) −1,321.1 R
   → R(0) −274.3 R over 55,419 fills (Δ +1,046.8 of the +1,100.2 R the class
   showed); on its escaping years R(½) +2,925.0 R → R(0) +2,978.3 R over
   23,513 fills (Δ +53.4, +0.002 R per fill). Every dollar forex makes at any
   share sits in the years the witness names as feed artifact, and on the
   years it does not name the share-0 cell is net negative — it fails D4's
   absolute term, so no forex share cell can be accepted (fit contained:
   −94.7 → +3,201.9 R, the slope intact; select is the fold the gate reads).
2. **The pre-registered confirm read is unavailable and uninformative.**
   §4's "ONE ledgered confirm read of this program" is a second read of act
   3's burned calendar (anchor 2026-08-26): the ledger refuses it without
   `--acknowledge-prior-reads` (`grid-totalr.ts`, LA-6), and the acknowledged
   path is reserved for act 4's late-listed markets. Were it read, ~60 % of
   the confirm fold's forex rows sit in escaping years, where the slope is
   +0.002 R per fill: the read would decide nothing.
3. **The slope is overstated by the stop leg's missing slippage.** Three
   verifiers reproduced it: the resolver prints a non-gapped stop exit at its
   level (`replay.ts:526-533`), so the half that share 0 moves from a limit
   print to the lock's stop print is charged no slippage. Charging the
   sweep's own `estimatedSlippage` on that half (a hybrid model, named as
   such — neither the resolver's gap-only rule nor the gate's every-side rule)
   bounds the correction at S/2: forex select +1,100.2 → +785.2 R (S = 629.9 R
   over 51,706 stop-print rows), forex fit +3,296.6 → +2,718.8, crypto select
   +493.2 → +287.7, pooled select +1,672.7 → +1,062.6; futures' "flat ±3 R"
   becomes best f = 1 on both folds, inside friction either way. Signs
   survive; magnitudes in §1 are upper bounds.
4. **At share 0 the whole position rides the same-bar convention.** 60 % of
   forex select's lock exits (31,654 of 52,800) and 19 % of its take_profit
   exits (372 of 1,962) resolve on the TP1 touch bar, priced at the lock with
   the stop assumed moved inside the bar (FR-3). The corpus carries no latency
   and cannot price a lock placed one bar late; the design's §5 never said how
   a live E8 account arms it. Exposure measured, sensitivity unpriceable —
   a stated dependency of any share below ½, not a figure.
5. **The class grain hides the mechanism.** Amendment 33 governs grain ("per
   market, never per class"), not amendments 25/31 as §4 cites. Crypto's flip
   is regime: fit escaping years read best f = 1 (Δ +447.7 R over 19,084
   fills) while select contained years read best f = 0 (Δ +444.1 R over
   33,134); futures' class cell averages opposite-signed protection modes.
   Any future share read is per market × protection mode × feed character.

**The verify phase, final state.** The workflow's verifiers ran budget-bound
and the session limit ended the phase twice; seven verifier votes landed,
every one confirming a finding recorded in this section — the stop-leg
slippage (four votes, reproduced from scratch to the decimal), the live
path absent from §3, FR-3's same-bar arming (the runner survives the touch
bar unless the bar closes back through the armed level; the post-touch low
is never consulted), and the §4 arm being an identity on the tuning folds
(no admission gate reads the share). The remaining merged findings stand
on the hand verification above; the phase is not resumed a third time.

**Corrections to the record (verified):**

- §1's "whole-roster select turns from −1,265 R at ½ to +259 R at 0" is the
  global-folds corpus's figure. On the corpus of record the whole roster
  reads −5,680.0 R at ½ → −3,524.2 R at 0 (`…-classfolds-include-holdout.txt`).
- "Spread and slippage ride in the leg prices" (note §8b, the reader's
  docstring) is true of spread only: slippage rides only in gapped prints
  (FR-7). Corrected in both places; the reader's printed sentence changes
  with the slippage column (follow-up 1).
- The payoff reader's win bucket is by label: on select it holds 1,327
  money-negative rows (−416.4 R, 1,231 of them crypto) that amendment 39
  does not call wins; no stop_loss row carries positive R
  (`win-sign-by-label-2026-09-06.log`). Follow-up 2 prints wins by money.
- Note §3d's "935,241 of 935,241 byte-identical" is the act-3 arm's baseline
  population, every row of which is in the corpus of record; the corpus
  itself holds 941,947 baseline rows (fit 379,224 · select 258,954 · confirm
  303,769, a count only) with zero duplicate (symbol, time) keys
  (`baseline-rows-vs-keys-2026-09-06.log`). The refuter's "6,706 duplicates"
  is refuted; the 6,706 are rows the arm never emitted.
- §2's "allocation, not a level" reaches the right conclusion on the wrong
  ground: amendment 39 names "the partial's size" as the sanctioned repair
  axis in its own text; that sentence, not the level/allocation distinction,
  is what admits the question.
- §4's "3.4 % take_profit share" is the whole-roster pooled figure; forex's
  own is 2.5–2.8 %. §5's "two rules bound a day" never bind the same E8
  account (the Daily Profit Cap is Pro's; Best-Day is the Challenge lines');
  the news-window rule prohibits SL/TP edits on E8 One Performance, and the
  share-0 lock is an SL edit. §5 is superseded by this verdict: with nothing
  shipping, the cap question is moot until a cell can pass the gate.
- §3 threads the share through the sweep emit only and never through the
  live path — no `risk_model` stamp at decision time, no read in
  `fillOptionsFromRiskModel`, nothing in outcome-sync — so a shipped share
  would re-grade live rows under a physics the operator never traded, the
  E7 divergence reopened (verified by the round's verifier). Any build of §3
  carries the live path or does not ship.
- §3 item 6 puts the ANALYZER_VERSION bump in the behaviour-neutral PR,
  against the repo's rule; the neutrality oracle as written (reproduce the
  recorded digest) cannot pass at any HEAD after #574, so it proves nothing.
  Both stand corrected for whenever §3 is built; it is not built now.

**Owner item (one, with the recommendation the refuters converged on):**

- The desk instructs breakeven physics ("move your stop to your entry") on
  every market while calibration grades 65–72 of 97 markets under
  `trail_tp1` — an amendment-34 breach already live, independent of the
  share, worth 3,244.6 R of divergence on forex select between the instructed
  and the graded path (baseline trail_tp1 +1,603.8 R against the corpus's own
  breakeven arm −1,640.8 R on the same 78,932 fills; fit 5,323.7 R;
  `protection-gap-2026-09-06.log`). The strings are owner-approved verbatim spec text
  (§7/§17b/§17d), so the fix is a spec amendment: render the stamped
  protection mode's instruction per market (hold / breakeven / trail_tp1),
  copy only, pins updated, ANALYZER_VERSION unchanged. Recommendation:
  approve; the desk is parked, so it lands before unpark.

**Follow-ups, mechanised, in order by money:** (1) DONE (change set after
#592) — `banked-fraction` prints a second table per fold: stop prints, S,
R_adj(f) at every fraction, best f under the hybrid model and Δ_adj, and the
same-bar shares of lock and take_profit exits; on the corpus of record it
reproduces the verifiers' figures exactly (forex select S 629.9 R over 51,706
stop prints, Δ_adj +785.2; fit +2,718.8; 60.0 % / 19.0 % same-bar) and the
main tables are byte-unchanged. (2) DONE (same change set) —
`payoff-decomposition` prints a by-money table per fold: money-positive and
money-negative rows with their means, flat rows, the two label-vs-money cross
buckets, payoff and break-even by money. (3) a share read uses a paired
per-row interval, never `rDeltaInterval95`'s unpaired one; (4) DONE for the digest (change set after #593) — the emit's sha256, byte count and row count are written into every manifest's hashed payload and both doors refuse a corpus whose bytes are not the manifest's; the neutrality oracle as a strip-and-hash against a HEAD rebuild stays with §3, which is not built; (5) DONE (change
set after #594) — `banked-fraction --grain market` prints every market's own
slope, raw and slippage-priced, and per class and fold whether a class value
is admissible — this reader's summary of amendment 33's per-market rule
("a class value survives only where that market's own data supports it"):
every market with a slope reading the same sign of R_adj(0) − R_adj(½),
a market with no tp1 rows counted as flat, neither voting nor vetoing. On
the corpus of record
(`banked-fraction-capture-all-classfolds-market.txt`): forex is admissible on
BOTH folds — all 22 in-pool markets read share 0 over ½, slippage-priced —
so what fails forex is D4's absolute term on clean years (item 1 above), not
the grain; crypto (fit 5 of 13 for 0, select 15 of 24), futures (8 of 14;
7 of 14) and agriculture (2 of 5; 3 of 5) are NOT admissible, which is the
mechanism items 5 named; energies, indices (fit), livestock and metals agree
on one or two markets. None of these follow-ups moves money; each sharpens
the instrument for the next calendar, which needs FMP's intraday plan
restored.

**Cache-design questions (note §6), verdicts:** Q1 "top-ups honour pins" is
killed as written — every nightly top-up pins its own day, so it forbids the
repair the overlap exists for; the protected slice is already past its one
exposure window. Q2 adopt as the emit digest in the manifest, not per-series
hashes as a drift oracle. Q3 adopt: one archive per cache state on the bank's
R2 layout, because the cache is now an unrecoverable dataset (402 since
2026-09-04). Q4 as applied failed the note's own rule (an untracked launcher
that already pointed at a removed worktree): derive the launch from the
tracked manifest and record argv in it.

## 1. The money map (verified on the intact corpus, 2026-09-05)

`scripts/banked-fraction.ts` (#586) prices the share of the position banked
at TP1 — the literal `0.5` in `realizedRFromLegs` — as exact arithmetic on the
emitted legs, `R(f) = f·tp1R + (1−f)·exitR − commission/risk`, with a control
on every row (at ½ it reproduced `realizedR` on 308,111 of 308,111 rows). Its
tracked output is `docs/research/r3/banked-fraction-capture-all.txt`
(verdict form: 20 markets held out, confirm sealed, baseline variant).

| fold | class | filled | R(0) | R(¼) | **R(½) shipped** | R(¾) | R(1) | best f | Δ best vs ½ |
|---|---|---|---|---|---|---|---|---|---|
| fit | forex | 174,503 | +3,201.9 | +1,553.6 | **−94.7** | −1,743.0 | −3,391.4 | 0 | +3,296.6 |
| fit | crypto | 7,052 | +414.5 | +546.2 | **+677.9** | +809.5 | +941.2 | 1 | +263.4 |
| fit | metals | 3,995 | −257.1 | −299.7 | **−342.3** | −384.9 | −427.5 | 0 | +85.2 |
| select | forex | 78,932 | +2,704.0 | +2,153.9 | **+1,603.8** | +1,053.7 | +503.6 | 0 | +1,100.2 |
| select | crypto | 40,220 | −3,593.2 | −3,646.2 | **−3,699.1** | −3,752.1 | −3,805.0 | 0 | +105.9 |
| select | metals | 3,227 | −164.7 | −188.4 | **−212.1** | −235.8 | −259.5 | 0 | +47.4 |
| select | pooled | 122,561 | −1,066.2 | −1,693.8 | **−2,321.4** | −2,949.0 | −3,576.6 | 0 | +1,255.2 |

On the restored per-class-fold corpus (all eight classes,
`banked-fraction-capture-all-classfolds.txt`, control 346,226 of 346,226):
six classes read f = 0 on both tuning folds — forex (+1,100.2 R on select),
metals (+35.5), agriculture (+22.2), indices (+8.3), energies (+5.1),
livestock (+11.0); crypto flips (fit best 1, select best 0, +493.2) and
futures is flat (±3 R). Pooled select: −5,680.1 R at ½ → −4,007.3 R at 0.

R is linear in f, so the slope's sign is the whole story. In forex it is the
same sign on both tuning folds and the magnitude is the largest seen on a
valid instrument: +1,100 R on the select fold is +0.014 R per fill on a class
whose shipped select expectancy is +0.020 R per fill. Whole-roster select
turns from −1,265 R at ½ to +259 R at 0 — *on the global-folds corpus; on the
corpus of record the whole roster reads −5,680.0 R at ½ → −3,524.2 R at 0,
and the slope itself is an upper bound (§0 items 1 and 3).*

**The mechanism, on the same rows.** After TP1 is touched, `trail_tp1` sets
the runner's effective stop to the TP1 price itself (`replay.ts`: "trail_tp1
locks the stop at TP1's own level"). Bucketing every partial's runner exit
against its TP1 price:

| outcome | protection | rows | exit at TP1 | below | above | mean (exit − TP1) R |
|---|---|---|---|---|---|---|
| tp1_partial | trail_tp1 | 249,117 | 227,358 (91.3%) | 19,473 | 2,286 | −0.007 |
| tp1_partial | hold | 3,490 | — | 2,625 | 865 | −0.689 |
| tp1_partial | breakeven | 2,102 | — | 2,081 | 21 | −0.567 |
| take_profit | trail_tp1 | 9,928 | 192 | — | 9,736 | +1.325 |
| take_profit | hold / breakeven | 2,000 | 21 | — | 1,979 | +1.52 / +1.61 |

Under `trail_tp1` — 97.8% of partial rows — the banked half and the runner
half pay the same on a pullback, to within 0.007 R (the residue is gaps
through the lock). The partial protects nothing there; its only effect is to
sell half of every target reached. Under `hold` and `breakeven` (2.2% of
partial rows, concentrated in crypto's overrides) the partial does protect
about 0.6 R per such row, which is why crypto reads best at f = 1 on fit and
f = 0 on select while forex reads f = 0 on both.

**A correction to the record.** The 4b geometry review (baseline-2026-08-10,
on the corpus the clock defect invalidated) said "the TP1 half banks positive
R everywhere — forex +62,646 R — while the runner half loses 51,696 R of it
back". On the valid instrument the runner half out-earns the banked half in
forex on both folds (fit +27,383 vs +24,086; select +12,408 vs +11,308). The
old direction was an artefact of the invalid corpus, as the remediation
program said its magnitudes might be.

## 2. What this is not, and the rule that says so

- **Not the 2026-08-30 rejection's subject.** That rejection (HANDOFF) was
  raising `tp1RiskShare` — a LEVEL, moved because a printed figure improved —
  and its worked example was that a farther TP1 turns small wins into whole
  losses. The share moves no level: TP1 stays where it is, the stop stays
  where it is, the target stays where it is. Under `trail_tp1` a trade that
  touches TP1 and falls back pays `tp1R` at every share (the lock is at
  TP1), so the "small wins into whole losses" mechanism does not exist there.
  Where it can exist — `hold`/`breakeven` — the class grain sees it.
- **Not a manufactured ratio.** The design's acceptance figure is net
  realised R on fit and select, then one confirm read; the payoff ratio and
  win rate are printed beside it and never decide anything.
- **Not a per-market tune.** Class grain only (amendments 25 and 31 floors).

## 3. What must be built before it can be swept (behaviour-neutral first)

The share is a literal, not a field, and R2b §4.2 recorded that the builder
cannot even express a plan without a partial. A sweep needs:

1. `CategoryCalibration.tp1BankedShare` (name for the round to attack),
   class defaults `0.5` — no behaviour changes until a value ships.
   `GRID_OVERRIDE_KEYS` gains it (the numeric-axis path already exists).
2. `replay.ts`: `realizedRFromLegs` and `forgoneRunnerR` read the share
   (`bankedR = share·tp1R`, `exitR = (1−share)·…`, `RUNNER_FRACTION = 1−share`).
   The TP1 TOUCH still arms the protection at every share, including 0 — the
   resolver's `tp1Hit` is a touch, not a fill — so the emitted path is the
   one the reader priced. The emitted row carries `tp1BankedShare` so a
   reader's control can reproduce R on a corpus whose share is not ½;
   `banked-fraction` reads it when present (today it assumes ½).
3. `pricePlan.ts`: `ladderRewardRisk` uses the share
   (`share·|tp1−entry| + (1−share)·|target−entry|`); `takeProfit1` stays a
   level at share 0 because the lock needs it.
4. `sweep.ts`: the gross twin follows.
5. Desk copy: "Bank half" (`GuidePanel.tsx`, `AdvisorRecommendationPanel.tsx`,
   the guide spec) becomes share-dependent under copy law §17f; at share 0 the
   instruction is "when price reaches Target 1, move your stop to Target 1".
6. `ANALYZER_VERSION` bump (it scopes global learning); `tests/ladderPayoff.test.ts`
   and `tests/calibrationState.test.ts` pins follow; the sealed census gains
   nothing (no new reader).

All under TDD, every guard mutation-tested, and shipped BEFORE the arm as a
behaviour-neutral change. The neutrality oracle is exact and already in
hand: the act-3 corpus rebuilt on 2026-09-05 to the recorded digest
`23ee6b98…` (note §5), so a corpus built at the new revision with share ½
must reproduce that digest with the new column stripped — or the change is
not neutral, and the digest says so before a refuter has to.

## 4. The arm and the read (pre-registered)

- One captureAll run at the protected anchor 2026-08-26, per-class folds,
  `--grid "tp1BankedShare=0,0.25,0.5,0.75,1"` at the class grain, zero
  provider bytes (313 artifacts pin the anchor). Baseline and arms from ONE
  run so a single cache is proven by construction; the manifests' series
  facts are compared to the successor's before anything is read (§3b of the
  post-mortem note is what happens otherwise).
- Acceptance: the standing gate, unchanged — fit ΔR > 0 and select ΔR > 0
  at the class grain, holdout stratified, D4's absolute term, retirement by
  money — then the ONE ledgered confirm read of this program. Confirmed only
  if the confirm CI excludes zero. Declined otherwise, and recorded.
  *Round 1: that read is a second burn of act 3's calendar, refused without
  acknowledgement, and ~60 % of the fold's forex rows are escaping years
  where the slope is +0.002 R per fill (§0 item 2). The interval named here
  is `rDeltaInterval95`'s unpaired one, ~8× too wide for a per-row
  deterministic delta (follow-up 3). The arm is not run.*
- Expected by the arithmetic: forex confirms at share 0 or ¼ unless the
  confirm fold's take_profit share is far below the tuning folds' 3.4%; crypto
  does not confirm any cell (its folds disagree); metals is thin.
- What ships if confirmed: the class value, through the register machinery
  and calibration, with the desk copy — never a per-market value.

## 5. Execution reality — the question that can kill it, answered from the record

Can a funded E8 account run a full-size position with its stop moved to TP1
after the touch, instead of closing half?

- **Stop-loss rule** (`e8-markets-dossier.md` §Stop-Loss Rule, PRIMARY,
  help.e8markets.com/en/articles/9453409): *"We don't require using a stop
  loss or Take profit. It is only on you and on your strategy."* No distance
  or placement rules exist because none is required. Moving a stop to TP1 is
  an ordinary SL modification; the only cap is 2,000 server requests per day
  (SL/TP modifications included), which the desk's volume cannot approach.
- **Partial closes** are what the design REMOVES, not adds. The Best-Day
  anti-circumvention clause (`e8-futures-articles.md`) forbids "splitting a
  large winning position through hedging or partial closures" to bypass the
  consistency rule; a single full-size exit splits nothing.
- **Consistency and daily caps** are where the round must look: a full-size
  target hit pays the target's ratio (the 1.6×–1.7× floor and up) instead of
  the ladder's ~1.0×, so best days get larger. Two rules bound a day. The
  Best-Day consistency rule (35% or 40% of total profit, product-dependent,
  `e8-futures-articles.md`) is a ratio over the whole evaluation and a single
  larger day moves it slowly. The **Daily Profit Cap** (E8 Pro Forex/Crypto:
  **2% of balance per day**, `e8-markets-dossier.md` item 13, PRIMARY) is not:
  profit above it is clawed back automatically between 00:00 and 01:00 server
  time, exceeding it is explicitly not a violation, and three anti-gaming
  patterns — partial closes spread across days among them — consolidate a
  position's profit into one day. At the §19 governor's risk per trade
  (0.10%–1.50% of balance in 0.05% steps) a 1.7 R full-size win is 0.17%–2.55%
  of balance: below the cap at every step up to 1.15%, at the cap by 1.20%,
  and two such wins in a day cross it from 0.60%. The ladder's ~1.0 R win
  crosses it at 2.00% or two wins from 1.00%. So the share does not create
  the cap problem, it moves the risk step at which a day hits it — and the
  clawback costs the excess, not the account. The refuters must price that
  against the corpus's same-day win clustering per class, with the governor's
  actual defaults. That is the one place this can die, and it dies by money,
  not by prohibition.
- **News windows** (5 minutes around speeches, forex/crypto) restrict opening
  and closing; a resting stop is neither, and the resolver already exits by
  stop today.

## 6. Review tables for the round

**6a. Money and law.** (1) Is R(f) exact under the emitted path at f = 0 —
does anything in the resolver besides the `0.5` literals depend on size?
(2) Is the class grain right, or does crypto's `hold` population need its own
cell? (3) Does amendment 36's withdrawal standard apply to the shipped ½ once
a cell confirms — it is our own parameter — or does the register route it?
(4) Is "the share moves no level" airtight against the 2026-08-30 rejection?
(5) Does the F-arm cost cap (0.15) interact — fewer fills, same slope?

**6b. Run mechanics.** (1) Byte-neutrality proof for the field at ½.
(2) The control's tolerance on a share≠½ corpus. (3) Single-cache proof from
manifests before the read. (4) Disk: five cells at ~2.4 GB each. (5) The
top-up job must not run mid-build — moot under the 402, still to be stated.

**6c. Execution reality.** §5's daily-cap question with the dossier's
numbers; the desk copy under §17f; the live outcome writer (`outcome-sync`)
persisting legs with a zero-size TP1; §19 sizing unchanged.

## 7. Owner items

One, recorded in §0: the desk's protection copy (an amendment-34 breach
independent of the share), with the recommendation the refuters converged
on. The share decision itself needed no owner: the data settled it (§0).

## 8. Delivery, in order

1. Refuter round on this document — RAN 2026-09-06; verdict in §0.
2. ~~§3 as one behaviour-neutral PR~~ — not built: nothing can confirm on
   this corpus (§0 items 1–2).
3. ~~The arm (§4)~~ — not run, for the same reason.
4. The follow-ups in §0, then a new calendar when FMP's intraday plan is
   restored; the share is re-read there per market × protection mode × feed
   character, with the slippage-priced reader.
