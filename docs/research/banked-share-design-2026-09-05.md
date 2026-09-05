# The banked share — design for the refuter round (2026-09-05)

**Status: DESIGN, not decided, not built.** It goes to the refuter round when
the agent limit resets (2026-09-06 07:00 ET). Nothing here ships before a
round has attacked every section and the survivors are recorded. Amendment 39
governs: profit is the measure, win rate is a result, no ratio may be
manufactured. The figure this design is judged on is net realised R on the
tuning folds and one confirm read — never the payoff ratio it prints.

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
turns from −1,265 R at ½ to +259 R at 0.

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

None. The decision is the program's, by the pre-registered rule in §4; the
questions in §6 are the round's. If the round finds an owner decision that
data cannot settle, it will be recorded with a vetted recommendation.

## 8. Delivery, in order

1. Refuter round on this document (limit reset 2026-09-06 07:00 ET).
2. §3 as one behaviour-neutral PR (TDD, mutation-tested), byte-neutral proof.
3. The arm (§4), zero bytes, ~2 h; readers; the one read; the record.
4. Whatever confirms ships per class through the register machinery, with
   the desk copy, and the post-mortem note's §8b is closed with the result.
