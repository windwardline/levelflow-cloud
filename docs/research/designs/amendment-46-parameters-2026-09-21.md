> **PARKED — not law (2026-09-23).** Nothing in this file is law, and it lives only on
> branch `docs/amendment-48`. On 2026-09-22 amendment 48 enacted the two sections
> headed "The rule as refuted" as written. It was parked the same day, before it
> reached main, when a check round found four majors:
>
> 1. **The adopted sections disagree.** A filter's registration hashes no readiness
>    floor, so the family rule ("opens only where it meets its floor") and the filter
>    rule ("every line whose fit screen passed opens") cannot both hold. The filter
>    rule's clusters, degrees of freedom and floor also differ from the family rule's,
>    although it says it takes them by reference.
> 2. **Calibration programs have no rule.** The amendment registers them against the
>    cap; neither adopted section says how.
> 3. **The settled effect floor is in the wrong unit.** It is "the market's round-trip
>    cost in R". The random-entry screen it gates measures in ATR units, and a family
>    with no stop has no R.
> 4. **The adopted sections never took a refute round of their own.** The 2026-09-22
>    round refuted a compressed text against them.
>
> The findings are distilled in `amendment-48-check-round-2026-09-22.md`, beside this
> file. The status block that stood here on 2026-09-22 called this file law under the
> standing approval, withdrew the body's holding that a standing approval cannot settle
> the three owner questions, and said the owner may reverse any reading. All three
> claims are withdrawn; the owner questions are open. Two facts from that block still
> hold. Line citations into `scripts/grid-totalr.ts`, `docs/research/confirm-reads/README.md`
> and `docs/HANDOFF.md` predate #657, #668, #669, #671, #672 and #675, which shifted
> lines in those files; re-derive each before building on it. The round journals stay
> outside the repository, in
> `~/Library/Application Support/WindwardLineToolchain/levelflow/session-artifacts-2026-09-16/`;
> the scratch files cited as `cf3/…` and `check/paired.py` were reaped with the session
> scratchpad, and their [verified] tags survive only as the round-2 journal quotes them.

# Amendment 46's open parameters — two recommendations and three owner readings (2026-09-21)

**Status.** Amendment 46 left open whether a rising family count raises the bar,
and plan item E5 added whether it reaches conditioning filters. Each question got
a proposal, two refuters and a checker (round 1, 2026-09-16), then two fresh
refuters and a checker on the revised text (round 2, 2026-09-21). **Both
recommendations survive.** Round 2 changed each materially: the split counts
candidates read rather than registrations, a filter's confirm leg is a paired
daily difference, and the screen bar is Student-t on day clusters instead of a
fixed 1.96. **Nothing here is law yet.** Three questions reinterpret the text of
amendment 46 itself, which a standing approval of recommendations cannot do, so
they go to the owner first. After the ruling, the final text takes one more
refute round, because round 2 moved the rule, and is then recorded as an
amendment. Nothing is blocked meanwhile: no family can register until the
random-entry screen is built.

The round records are kept outside the repository at
`~/Library/Application Support/WindwardLineToolchain/levelflow/session-artifacts-2026-09-16/`
(`a46-round1-journal.jsonl`, `a46-round2-journal.jsonl`), beside the FMP plan the
rules cite as `plan:` or `fmp-plan-2026-09-16.md` (`fmp-plan-2026-09-16.md` there).
Citations of the form `design:` and `scratchpad …` point into those records, not
into this repository.

## For the owner

Three readings, each with a recommendation and a priced alternative. The first two
come from the family-count item; the third is shared by both items.

**Is amendment 46's 'ONE CAPPED TOTAL ALPHA' (amendments.md:2453) one cap per market calendar, or one cap across the whole program?**

*Recommendation:* One cap per market calendar, 0.05 two-sided. It matches how the ledger burns spans per symbol (confirm-reads/README.md:139-147) and the gate's per-market FWER, where D4's absolute term is the cross-market brake (grid-totalr.ts:2867-2870). Leg (a) carries that brake to confirm. The header hash pins the answer, so the ruling must come before the first registration.

*Cost of the alternative:* One cap over 126 cells (the funded families, COT as one) to 235 (all six families, COT split) gives z 3.54-3.70, 2.45-2.63x the n and power 0.23-0.18 at the base n. It puts forex confirmation 52-57 y out on the round late-2030s base [verified: arithmetic] *(corrected 2026-09-23 from 52-58: 0.05/235 gives 57.48 y, which the round-2 checker printed as 57.5 and this line rounded again)*.

**Is a registration 'charged' against the cap (amendments.md:2451-2454) when it never reaches a read: refused at the screen or the gate, or below its readiness floor? Plan E5 asks the owner to confirm that it is (fmp-plan-2026-09-16.md:383).**

*Recommendation:* No. A registration draws only at a freeze that opens its candidate, and until then keeps its claim on the market. The cap still binds every family that reads: per market, the draws sum below 0.05 whatever the count.

*Cost of the alternative:* It prevents no false confirm, because a draw that is never read cannot produce one and each burn spends 0.8 of what remains either way. It dilutes the candidates that are read. At three registrations with one unread, the other two draw 0.0133 each instead of 0.02: z 2.475 against 2.326, 1.40x the n against 1.28x, power 0.63 against 0.68, and forex 22.7 y against 19.2 y. The unread family also loses the market, either for good under a once-per-market draw or until the next burn, at least 9.4 y later on forex [verified: arithmetic].

**Do calibration programs and conditioning filters on existing entries register
against the same cap as entry families?**

*Recommendation:* Yes: one registration per program per market, drawing under the
same split. A filter ships only through the same post-2026-08-26 confirm calendar, so an uncharged or separately capped filter reopens the leak 46 names (amendments.md:2461-2463). The sibling family-count item raised the same question and recommended yes.

*Cost of the alternative:* Sharing the cap costs a market's entry family more fills whenever a filter candidate shares its read. Under the family draft's split, one family plus one filter moves the family from x1.068 to x1.279 the base fills (+19.7%) [computed]. A separate cap avoids that, but doubles the favourable false-accept budget on that market at a first burn: 0.02 + 0.02 instead of one 0.02 split two ways [computed]. Leaving filters uncharged is worse still: each filter line reads the calendar at full alpha. A program outside the registry either cannot confirm at all, because the first registered read burns the market's spans (README:142-145), or it confirms through the acknowledgement boolean that amendment 46 says law cannot rest on (amendments.md:2464-2466). N such programs on one calendar allow up to N x 0.02 favourable false confirms per market per burn. That is the leak the capped alpha closes (amendments.md:2461-2463).

## Recommendation 1 — a rising family count raises the bar at the confirm read

Proposed law text:

**A registered family pays for multiplicity at its confirm read, and the bar rises with the candidates read on a market's calendar.** Each freeze whose read names a market spends 80 % (JUDGED) of its unspent two-sided alpha of 0.05, split among the candidates opened there, at most one per registration. A registration without a candidate there draws nothing and keeps its claim. Draws are fixed before the read and never move. A candidate confirms only if, at the Student-t quantile for its draw, its mean daily net realized R clears zero and, where it filters or replaces a shipped cell's trades, so does its paired daily difference against that cell: 30 traded days a side at least (JUDGED), on spans starting after 2026-08-26 and after every other recorded read. The screen's bar is the Student-t 95 % bound on day clusters, whatever the count.

**Why.** Money ships at confirm. A draw never read cannot produce a false confirm, so charging one protects nothing and can shut a family out of a calendar that reopens nine-plus years later on forex. Daily sums measure money; a per-fill figure rises when good trades grow rarer. An unpaired interval runs five to ten times too wide on a filter's nested trades.

**What it does not do.** The owner rules first on its two readings of amendment 46: one cap per market calendar, and no charge before a read. It does not decide whether filters register, and it reopens no shipped cell.

### The rule as refuted

ANSWER
Yes, a rising count raises the bar, but only at the confirm read. The charge scales with the number of candidates actually read on a market's calendar in one burn, not with the number of registrations. The screen's bar does not move with the count.

THE RULE
1. Screen. A family passes when the lower bound of its day-clustered 95% interval, taken at tMultiplier95(day clusters - 1) (confidence.ts:30-49), sits above the market's round-trip cost in R. The threshold is fixed in advance (amendments.md:2451-2452) and does not rise with the count. It replaces round 1's fixed 1.96, which learning.ts:71-84 retires and amendment 46 left open (:2473-2476). At 10 crowded days, the fewest any COT market holds (plan:306), a 1.96 cut is an 8.2% test, not a 5% one [verified: own t integration].

2. Registration. As in round 1, a registration is one hypothesis, hashed before any fold is read. It carries a canonical spec (side rule, clock, W, reference price, unit), a finite grid and a freeze rule that yields at most one candidate per market. New: the spec also states a readiness floor per market. That floor is the fewest confirm-fold traded days the registration will be read on. It is projected before the read from fit-fold density and the confirm span's dates, so no confirm row is opened.

3. Formula. Each market has a two-sided cap of 0.05 over its post-2026-08-26 calendar.
- At each freeze whose read names m, c_m is the number of candidates the freeze opens on m. There is one per registration that has a candidate there and meets its floor.
- Each candidate draws 0.8 x (0.05 - S_m) / c_m, where S_m is the sum of earlier draws on m.
- The 0.8 is JUDGED. The second burn comes at least (E1 - S)/3 later: 9.42 y on forex after a late-2030s read [verified: arithmetic, sweepFolds.ts:33-37].
- A registration with no candidate on m draws nothing and keeps its claim for m's next freeze. That covers a registration refused at the screen or the gate, and one below its floor (owner item 2).
- c_m and every draw are fixed by the fit and select gradings and the freeze file before the fold opens. The union bound therefore holds whatever c_m turns out to be [unverified: standard result; rests on round 1's embargo premise].
- The multiplier is the Student-t quantile at 1 - draw/2.

4. Confirm pass. Both legs are measured on daily totals of net realized R. A day is the cube's UTC decision day (grid-totalr.ts:180-181).
(a) Absolute: the lower bound of the candidate's mean daily net R is above 0, with df = its traded days - 1. This has the same sign as its total R. It is the cross-market brake from round 1's R1-3 repair.
(b) Where the candidate filters or replaces a shipped cell's trades: take every day either side traded, and set d = candidate day R - cell day R, counting 0 for a side that did not trade. The lower bound of the mean of d must be above 0, with df = those days - 1. The sum of d is the confirm total-R delta, the money that amendment 39 names (amendments.md:2114, :2185-2187). Pairing prices the trades the two sides share.
- Floor: at least 30 traded days for (a), and on each side for (b). The 30 is JUDGED and counted in days. DELTA_MIN_FILLED counts fills and is not what it mirrors.
- (a) is readable only where the shipped cell under the candidate is held back from THIS read's spans (ADMISSIBILITY_RULE, ledgeredRead.ts:243-246, applied to the new fold). Otherwise the candidate cannot confirm on that market.
- The conjunction of (a) and (b) keeps size at or below the draw [unverified: intersection-union result, recalled].
- If two confirmed candidates filter or replace the same shipped cell's trades, the one earlier in freeze order ships. Their combination is a new registration.

5. Later reads.
- Later registrations draw from what earlier freezes left.
- Earlier draws, multipliers and verdicts never move.
- Every confirm span on symbol s starts at or after the later of 2026-08-26 and the end of every other recorded read's span on s.

6. Printing. Each market prints 'draws S_m of 0.05 · c_m · draw'. The program prints the sum of draws beside the confirmed count, never as a pass.

WHY THE CHANGES
- Counting unread registrations buys no size. A draw that is never read cannot produce a false confirm, and each burn spends 0.8 of what remains whatever the count. Take three registrations with one unread: the two that are read draw 0.0133 each instead of 0.02. That is z 2.475 against 2.326, 1.40x the n against 1.28x, power 0.63 against 0.68, and forex 22.7 y against 19.2 y [verified: arithmetic].
- The code's one-candidate freeze (freeze-candidates.ts:31-34) is the case c_m = 1, and the rule is identical whenever one registration has a candidate on m. Act 3's freeze named 9 market candidates [verified: python]. Where two candidates exist, the one-candidate freeze defers the second to m's next burn, at least 9.4 y later on forex. Reading both costs each one 0.77 to 0.68 power at the base n. Round 1's charge of 0.04/k on a single read bought nothing.
- A per-fill (b) misstates money in both directions. A cell of 4,000 fills at +0.05 R, filtered of 2,000 fills at +0.02 R, reads +0.03 R per fill and loses 40 R. Both of round 1's legs pass it. Four of act 3's nine market candidates added +21.7 to +70.4 R on confirm while their per-fill delta was negative [verified: python].
- The unpaired interval (sweepStats.ts:253-283) is wrong for a nested filter. On fit-fold capture-all rows, it runs 6.2-7.8x the nested SE on EURUSD, GBPUSD and USDJPY. The paired day test of total R reads z 1.49/0.92/2.71 where the unpaired per-fill test reads 0.13/0.07/0.33. Day clustering moves the base SE only 1.01-1.05x [verified: check/paired.py, fit fold only].

MONEY
- FALSE ACCEPT: at most 0.025 per market on the favourable tail over all time, unchanged. If every funded registration were null and each market read one candidate, expected false confirms at the first burns are 2.56 two-sided and 1.28 favourable, before the brake [verified: arithmetic].
- FALSE REFUSE by c_m, in the normal limit with 80% power at the base n [verified: arithmetic]:
  - c = 1: z 2.054, 1.07x the n, power 0.77
  - c = 2: z 2.326, 1.28x, power 0.68
  - c = 3: z 2.475, 1.40x, power 0.63
  - c = 4: z 2.576, 1.49x, power 0.59
  - Ten equal slots: z 2.807, 1.70x, power 0.50
  - These figures price one leg. The conjunction's power is no higher than its weaker leg's.
- WITHDRAWN: 'the one confirmation on record fails under any charge.' It was a class pool read on the unpaired SE, and the rule uses neither.
- SCREEN: the t multiplier refuses a few more noise passes on thin markets. That costs sweeps, not R.

CALENDAR
The wait is set per family, not from one base.
- Forex on the round late-2030s base: 11.35 y uncharged; 13.3 y at c = 1; 19.2 y at c = 2; 22.7 y at c = 3; 25.1 y at c = 4 [verified: arithmetic; base unverified]. These hold only for a family whose own n sets that base.
- A sparse family read at a dense family's burn gets only its density's share of the n. Event-timed gets power 0.22 at c = 1 and 0.11 at c = 3. COT gets 0.38 and 0.23 [verified: arithmetic; equal per-day effect assumed].
- So batch nothing by default. Each freeze names the family it is timed for. A family below its floor defers to the next burn.
- A confirm fold not tied to the span's last quarter is the bigger lever, and it is outside this question.

REGISTRY
docs/research/family-registry/registry.json: tracked, append-only, prevHash-chained. It never lives under confirm-reads (README:90-102).
- Header, pinned by hash: capPerMarket 0.05; burnFraction 0.8, JUDGED, with its reason; screenMultiplier tMultiplier95(dayClusters - 1); anchor 2026-08-26; minTradedDays 30, JUDGED; the confirm rule text and its hash.
- Entry: ordinal, id, registeredAt, spec as stableJson (ledgeredRead.ts:173-183) including the per-market floors, specHash, roster, prevHash.
- Status lines:
  - screen: artifactHash, multiplier, clusters, verdicts;
  - freeze: frozenHash, and per market S_m, the candidates opened, c_m, the draw, and each registration without a candidate with its reason;
  - confirm: readId, and per candidate and market the traded days on each side, the multiplier, the (a) lower bound, the (b) lower bound, the sum of d and the verdict.

TESTS
(a) Per market, the draws sum to 0.05 or less. Each draw equals 0.8(0.05 - S_m)/c_m, with c_m recomputed from the gradings and the freeze file.
(b) A registration draws on m only at a freeze that names m and opens its candidate there.
(c) Each screen multiplier equals tMultiplier95(clusters - 1), recomputed.
(d) Each confirm multiplier equals the t quantile at 1 - draw/2, recomputed from the recorded traded days. Verdicts are recomputed from the recorded day series. readAt > frozenAt > registeredAt. Every span on s starts at or after max(anchor, the latest other recorded end on s).
(e) The chain is intact, ordinals have no gaps, specHash matches, and exact duplicates are refused.
(f) Earlier draws and verdicts are pinned by value.

MUTATIONS THE TESTS MUST CATCH
- Ignoring S_m: (a) fails.
- Counting a registration without a candidate in c_m, or dropping an eligible candidate: (a) fails.
- Spending a draw where no candidate was opened: (b) fails.
- A normal z where t is wider: (c) or (d) fails.
- An unpaired SE or a per-fill delta: (d) fails.
- A span ending 2022-06-03, which the strict overlap test at grid-totalr.ts:1632 passes: (d) fails.
- A spec edited in place: (e) fails.
- A changed burnFraction: the header hash fails.

BUILD
- A general t inverse, tested against every 95% anchor.
- The paired daily test, built from dayR, which every cell already carries (grid-totalr.ts:130, :181).
- A multi-candidate freeze and read. Today there is one candidate per market (freeze-candidates.ts:31-34; grid-totalr.ts:2200, :2283-2287).
- Provenance recomputed against each read's own spans. Today it covers R3's fold only, and absent provenance withholds (a) (grid-totalr.ts:2333, :2410).
- The new confirm rule, registered as new text and never edited in place (ledgeredRead.ts:191-195).

## Recommendation 2 — a conditioning filter is a family

Proposed law text:

**A conditioning filter claiming dates after 2026-08-26T10:45Z is a family: registered, drawn and confirmed as an entry family is, plus the terms below.** Earlier dates are free. A merged registration opens at most one candidate per market, only where its fit screen passes, and draws nothing elsewhere. The kept rows' mean daily R and the paired daily difference against the parent must clear zero at Student-t 95% on screen and at the draw's quantile on confirm, 30 clusters a side (JUDGED), on the net and arming-bound arms. On a JUDGED cost profile the dropped rows must also lose on gross. A cluster is a day, or the shortest block past which the label's keep share stops autocorrelating above 0.2 (JUDGED). Every read passes on the full population and every exclusion in force. Post-frontier rows stay sealed until a ledgered read. A read opens every candidate registered for its markets, burns only those, and cannot override an overlap.

**Why.** Uncharged, a filter reopens amendment 46's leak where hypotheses are cheapest: it needs no sweep but ships through the same calendar. The hour window passed both legs in its discovery pool, yet its dropped rows in held-out fit markets netted +107.1 R. Modelled cost sits inside rewardRisk and both scores, so no field list fences it.

**What it does not do.** It does not charge act 3, reopen maxCostShare 0.15, or set its own alpha arithmetic. Slow labels such as COT get no verdict until 30 of their blocks accrue.

### The rule as refuted

SCOPE (unchanged). Amendment 46 is written for entry families (amendments.md:2447-2454). This rule EXTENDS it to conditioning filters, and says so, under the standing approval (amendments.md:2377-2378; owner-rulings-2026-09-14.md:216-217) [verified: read]. Filters take the family-count law's draw arithmetic, cluster floor and confirm legs BY REFERENCE, so the two items cannot state different standards.

RULE
1. Kinds (unchanged).
- An ADMISSION FILTER is a predicate on a parent family's rows over DERIVED_FIELDS, 21 fields (grid-totalr.ts:382-392) [verified: counted].
- A POPULATION EXCLUSION (year, feed character, span) is never a family, never ships and is never charged.

2. Frontier and exploration.
- The frontier is 2026-08-26T10:45Z, the act-3 read's latest span end. That ledger line was read at 2026-09-03T10:09:18Z and covers 97 symbols, with span ends 2026-08-25T18:00Z and 2026-08-26T10:45Z [verified: jq]. A symbol's frontier later moves to its latest ledgered span end.
- Every date on or before the frontier is presumed read by every predicate. Reading one needs no registration and earns nothing. No prior-read list is kept.
- Folds are 50/25/25 fractions of each sweep's own span (sweepFolds.ts:34-36), so a shallow or later-anchored sweep can put post-frontier dates in fit or select. Three mechanisms close that route:
  - (a) The sealed door withholds every row dated past its symbol's frontier, whatever its fold, until a ledgered read has read that date.
  - (b) Each ledgered read records the post-frontier spans of EVERY fold it opens. Today it records confirm spans only (grid-totalr.ts:1619-1626).
  - (c) No later confirm span may overlap a recorded span.
- Raw reads that bypass the door remain unpoliceable, as today.

3. Registration.
- A registration names a field, an op, a finite value grid and a freeze rule that picks at most one value per market from fit. Recommended: the largest fit paired daily difference among the values that pass the screen.
- Its hash covers those, the parent's identity, the pass-rule hash and the gate's two formulas: decisionHourDistance's 18.5 UTC centre and integer hour (grid-totalr.ts:441-445), and costShare = cost/riskDistance (:480-486).
- It does NOT cover ANALYZER_VERSION or the population legs. Ten commits have changed the version since 2026-08-26 [verified: git log]. Both are recorded at each read. The other 19 fields are what the engine emits at the read.
- The registration is merged on main before the freeze. The ledger line records the registry blob and main commit, and the confirm shards postdate that commit (manifest generatedAt; emitSha256).

4. Candidates, draws, reads.
- A filter is drawn exactly as the family law draws, and this rule adds no alpha arithmetic of its own.
- At a freeze, every line registered for a market, family or filter, whose fit screen PASSED there opens as a candidate. A refusal or NO VERDICT opens none and draws nothing [family-law draft; unverified until ruled].
- Each read that opens a line is a new draw from that market's unspent cap, so re-reads are bounded.
- One read per market window opens all its candidates. A line merged after the freeze waits for the next window.
- A registered read's shards carry only markets with a candidate, so it burns only those.
- Overlap refusals on a registered read:
  - A calendar or shard overlap refuses, with no override.
  - A match on corpus identity alone, against a line that records spans, is logged and does not refuse. These are the ledger's documented false refusals (README:28-34, :41-45).
  - An identity match against a line without spans refuses.

5. Legs, the same at the screen and at confirm.
- (a) The kept rows' mean daily R has its lower bound above 0.
- (b) The paired daily difference against the parent (minus the dropped rows' R on each parent-traded day) has its lower bound above 0.
- The screen reads pre-frontier fit rows at Student-t 97.5% on clusters - 1. Confirm uses the t quantile at 1 - draw/2 on the thinner side's clusters - 1.
- Each side needs 30 clusters (JUDGED, as the family law), else NO VERDICT.
- Both legs hold on the net and arming-bound arms (sweepStats.ts:123-127). A missing column means NO VERDICT.
- Money is total R (amendment 39). A per-fill delta rises when a filter drops profitable rows that sit below the mean, and (b) refuses that case.
- A screen PASS carries no weight, and a refusal stands.

6. Clusters. They replace the placebo.
- B is computed from the label alone at the screen and fixed for confirm. It is the shortest length on the ladder 1, 7, 14, 28, 56, 91, 182, 364, 728 days that meets this condition: at that length and at every longer length that leaves >= 10 blocks (JUDGED), the lag-one autocorrelation of the label's block-aggregated keep share lies within max(0.2 JUDGED, 2/sqrt(blocks)). If no length qualifies, NO VERDICT.
- Aggregation stops periodic labels from reading as persistent. The every-longer clause catches slow drift that daily noise hides.
- EURUSD fit, labels only [verified: cf3/keep_share_rule.out]:
  - Gradable: sessionPenalty<=0 at 14d (218/83 blocks); decisionHourDistance<=2.5 at 14d (217/218); a synthetic Monday-only label at 7d (377/410); volatilityPercentile and trendStrength at their medians at 56d (48/52 and 48/45).
  - NO VERDICT: rewardRisk>=1.5 at 182d (17/11), cotPercentile at 182d (14/14), atr with no qualifying length.

7. Cost.
- On a JUDGED profile (amendments.md:2343-2347), leg (b) must also hold on gross for EVERY filter, whatever its field.
- Modelled cost sits inside rewardRisk, ladderRewardRisk, executionScore and confidenceScore, and it correlates with any field tied to costShare.
- On EURUSD fit, payoffFloor=1.5's 135 dropped rows net -7.3 R and -3.5 R gross, so the gross leg is a live test [verified].
- This extends amendment 36's precondition to rows inside a market.

8. Exclusions refuse and never admit.
- Every read passes on the full population and on every map in force from registration to read.
- A new map changes no hash and no charge.
- At the forex screen the contained leg equals the full leg (contained-years:16). BNBUSD, HOUSD, RBUSD and CAKEUSD take NO VERDICT on 2026 dates.
- The --years clauses stand as in round 1.

9. Trimmed losers. A filter that shrinks a loss while its kept rows stay unprofitable is refused. The market goes to amendment 36's removal test, which binds standing declines since 2026.09.04 (HANDOFF.md:284, :1012, :1385).

10. Act 3: unchanged, and charged nothing. maxCostShare 0.15 stays. Changing it is a new registration.

CHECKS
- A registered read with a calendar or shard overlap refuses, and no flag overrides it. A match on identity alone proceeds and is logged.
- The door withholds post-frontier fit and select rows. Mutation that must fail: sealing by label only.
- The confirm read refuses on overlap with any recorded span of any fold.
- Registry ancestry holds, and shards postdate the registry commit.
- A market with no screen pass gets no candidate and no draw.
- The gross leg fires for rewardRisk and executionScore. Mutation that must fail: keying it on the five cost names.
- Block fixtures: session and weekday labels get short blocks, slow drift gets a long block, and a COT-like label with a slow outcome regime gets NO VERDICT.
- A normal z where t is wider fails. A side with 29 clusters is NO VERDICT.
- A dropped side that is profitable but below the mean is refused.
- A later map never admits.
- The act-3 checks stand.

MONEY
Fewer losers ship:
- t at 30 clusters replaces 1.96 on about 8 clusters, where the one-sided size is 0.0454 against 0.025.
- The gross leg applies to every filter.
- The regime-coincidence pass falls from 3.75% to 0 in simulation [verified: cf3/block_sim_refined.out].
- The door closes unledgered tuning.
- There is no overlap override.
More money-makers are refused:
- COT and ATR regimes, and payoff floors with a drifting drop share, get NO VERDICT. 30 blocks of 182d is 14.9 years of new dates.
- Simulated vol-like power falls from 0.75 to 0.58, and genuine COT-like power from 0.66 to 0.
- A filter beside one family raises that family's fills from x1.068 to x1.279 (+19.7%) [computed; the split is the family draft].
- Thin-fit markets carry no filter [unverified: count].
Unchanged:
- Filters add candidates, not burns.
- Zero provider bytes.
- The desk is parked (HANDOFF.md:70-71).
Build: about 400-550 lines plus tests [unverified].

---

## Reconciled draft 2026-09-23

> **PARKED — not law.** This section reconciles the two sections headed "The rule as
> refuted" with each other, with amendments 33, 36, 39 and 43–46, and with the code at
> main 9b8d96f. The text above stays as it was; where the two differ, this section is
> the draft and the text above is its history. Its drafter refuted it against those
> sources before committing it. **Its first independent refute round (2026-09-23) left
> seven majors standing**
> ([`amendment-48-refute-round-2026-09-23.md`](/docs/research/designs/amendment-48-refute-round-2026-09-23.md)):
> L is a free parameter the seal cannot see, a family registration hashes no trade, the span
> rule changes 46's premise without the owner, the frontier is per symbol while the price
> path is not, two routes open a confirm fold with no record, the interim sweep ban has no
> mechanism, and the section's extent is undefined. A fifth pass is owed before any of this
> is recorded as law. **No registration opens until the owner rules on the cap's scope (Q2),
> on when a registration is charged (Q3), and on the span rule (Q5).**

### Authority

Under the standing approval this draft settles only what amendment 46 leaves open: the
screen's effect floor, whether a rising family count raises the bar, and the screen and
confirm mechanics 46 does not state (clusters, degrees of freedom, floors, arms, span
start). The reference price stays open, stated and hashed by each registration. Two
rules depart from 46. They are drafted for the owner and take effect only on his ruling:

1. **Charge at the freeze.** 46 charges every registered family. This draft charges a
   registration only when a freeze opens its candidate (Q3).
2. **Conditioning filters register.** 46 covers entry families. This draft writes a
   filter's obligations as a list of its own and does not call a filter a family (Q4).
   A filter takes neither of 46's family terms: its parent's pre-frontier rows are read
   before it registers, and it is not screened against the random-entry null.

The per-market cap is a reading of 46's "one capped total alpha", and it is the owner's
as well (Q2). Whether the standing approval can make either departure is Q1. Calibration
programs and amendment-36 removals get no rule here (Q4). If this is ever recorded, the
amendment should adopt this section by reference and restate none of it: a summary set
beside the rule is how amendment 48's brief came to disagree with its own record.

### Terms

- **Frontier F_s.** The latest end of any recorded read's span on symbol s. Spans are
  half-open, as grid-totalr's overlap test reads them. The ledger holds one line today
  (act 3, read 2026-09-03T10:09:18Z): F_s is 2026-08-26T10:45Z for 94 symbols and
  2026-08-25T18:00Z for GFUSX, HEUSX and LEUSX. 46's "post-2026-08-26 calendar" is
  read through 46's first sentence, "dates no recorded read has seen": the dates after
  F_s. A single global frontier would leave those three symbols 16.75 hours that no
  read has seen and yet count as read.
- **Registration.** One hypothesis, hashed and appended to the registry. An entry
  family registers before any of its decisions is computed on any fold (46). A filter
  registers before its freeze; its parent's pre-frontier rows are free to read.
- **Label.** What a registration decides from the market at each decision: an entry
  family's side call, a filter's keep predicate.
- **Cluster.** The UTC decision day: `Math.floor(time / DAY_MS)` of each row's decision
  time, over filled rows (grid-totalr's day key) or, at a family's screen, over
  decisions. Where a registration's label autocorrelates past a day, the
  cluster is a block of B UTC days counted from the Unix epoch. B is rule 2 item 6's
  test: the shortest length on the ladder 1, 7, 14, 28, 56, 91, 182, 364, 728 days at
  which, and at every longer length leaving at least 10 blocks, the lag-one
  autocorrelation of the block-aggregated label share lies within max(0.2, 2/√blocks)
  (both JUDGED). No qualifying length is NO VERDICT on that market. The registration
  hashes this rule. The B it yields on each market is computed from the label alone at
  the screen, recorded, recomputed by test (c) and fixed for confirm; it cannot be
  hashed at registration, because 46 bars computing a family's decisions before then.
- **Arms.** The three R columns of `ARM_COLUMNS` in `scripts/sweepStats.ts`: net
  (zero-latency arming), arming-bound (protection arms one bar late, at net cost) and
  gross (E8's commission, no modelled spread or slippage).

### The rule

1. **Span start.** Every sweep a registered read consumes puts each symbol's
   select-to-confirm boundary at F_s exactly. Its span is [F_s − 3L, F_s + L). L is not
   chosen: per fold group it is the shortest whole number of days, longer than the
   5-day embargo, at which the traded confirm clusters projected from pre-frontier
   density meet the floor of the registration the freeze is timed for on every market the group
   names. It is fixed before the sweep runs. Symbols in one fold group share F_s; a
   class whose symbols' frontiers differ is split into separate reads. No fit or select
   date lies after F_s, and every confirm date does. The mechanism and its sealing
   conditions follow the rule.

2. **Registration.** A canonical spec, merged on main before its freeze, carrying:
   - kind and roster;
   - for a family: side rule, clock, W (inside the embargo), reference price, the
     statistic's ATR (primary or daily, named), and the analyzerVersion whose cost
     model sets its screen floor;
   - for a filter: its parent, which is a shipped cell (a filter on an unshipped
     family is a new family registration), a field from `DERIVED_FIELDS`, an op, a
     finite value grid, and the gate's two formulas (decisionHourDistance, costShare);
   - for both: the fit fold it is screened on, wholly before every F_s it names; a
     freeze rule yielding at most one candidate per market; a readiness floor per
     market, the fewest confirm clusters it will be read on, at least 30; and the
     cluster rule. Whether a span meets the floor is projected from pre-frontier
     density and the span's dates, so no confirm row is opened.

   The cluster unit belongs to each registration, not to the registry header.
   ANALYZER_VERSION is pinned only for a family's screen and recorded at every screen,
   freeze and read.

3. **Screen.**
   - *Entry family.* Items (1)–(3) and (5) of the random-entry design's smallest
     defensible design, on the registered fit fold: uncensored MFE − MAE over
     (t, t + W] in the registered ATR, against a null with the same symbol, side and
     clock on a random fit-fold day. It passes on m when the lower bound of the
     candidate-minus-null difference's clustered 95 % interval, at
     tMultiplier95(clusters − 1), exceeds m's **effect floor**: the mean, over its
     screened decisions on m, of the engine's modelled round trip
     (`estimatedRoundTripCost` as `estimateExecutionQuality` computes it at that
     decision) ÷ the same ATR at that decision, under the registered analyzerVersion's
     cost model. This replaces that design's item (4). Fewer than 30 clusters is NO
     VERDICT. The bar does not move with the count. A decision emit stamped with
     another analyzerVersion is refused, and a registration screens each market once.
   - *Filter.* Legs (a) and (b) of item 6 on the parent's pre-frontier fit rows, at
     tMultiplier95(clusters − 1), with item 6's arms and floors. A pass carries no
     weight; a refusal stands.
   - The status line records analyzerVersion, manifestHash, and per market the floor
     (families), clusters, B, multiplier and verdict.

4. **Opening.** One rule for both kinds. At a freeze a registration opens a candidate on
   m only where its screen passed on m, its freeze rule yields a candidate there from the
   confirm sweep's fit and select folds, and the freeze's confirm span meets its
   readiness floor on m. Each freeze is timed for one registration, whose floor sets L.
   Every other registration meeting all three conditions on m opens there too; one that
   does not draws nothing and keeps its claim. A candidate whose read falls short of 30
   clusters after all takes NO VERDICT, and its draw stays spent. This replaces rule 2
   item 4's "every line … whose fit screen PASSED there opens" and "one read per market
   window opens all its candidates".

5. **Draws.** As rule 1 item 3: each candidate on m draws 0.8 × (0.05 − S_m) / c_m.
   c_m and every draw are fixed from the gradings and the freeze file before the fold
   opens. No recorded draw, multiplier or verdict moves.

6. **Confirm.** Realized R totalled per cluster, on the net and arming-bound arms both.
   A missing column is NO VERDICT.
   - (a) The mean over the candidate's traded clusters has its lower bound above 0.
     df = those clusters − 1.
   - (b) Where the candidate filters or replaces a shipped cell's trades (a filter
     always does, against its parent): d = candidate cluster R − cell cluster R over
     every cluster either side traded, with 0 for an idle side. The lower bound of the
     mean of d is above 0. df = those clusters − 1. The sum of d is the money delta
     amendment 39 names. On a JUDGED cost profile (amendment 43), (b) also holds on
     gross.
   - At least 30 traded clusters for (a), and on each side for (b), else NO VERDICT.
   - The multiplier is the t quantile at 1 − draw/2 for that df.
   - (a) is readable only where the shipped cell under the candidate is held back from
     this read's spans (ADMISSIBILITY_RULE). Otherwise the candidate cannot confirm on
     m, and (b) alone never confirms. On a frontier-anchored span no shipped cell was
     selected or confirmed inside the confirm fold, so (a) is readable once provenance
     is computed against each read's own spans.
   - For a family that adds trades, (a) is the whole test.
   - If two confirmed candidates filter or replace the same shipped cell, the earlier
     in freeze order ships.

7. **Reads.** A registered read grades both arms and records them. A
   calendar or shard overlap with any recorded span refuses, with no override. An
   identity-only match against a line that records spans is logged and proceeds. The
   read records each symbol's span, and its end becomes that symbol's F_s.

8. **Population.** Every read passes on the full population and on every exclusion map
   in force from registration to read; an exclusion refuses and never admits. A
   population exclusion never registers, ships or draws. A filter that shrinks a loss
   while its kept rows stay unprofitable is refused, and the market goes to amendment
   36's removal test. Act 3 is charged nothing. `maxCostShare` 0.15 stays; changing it
   is a new registration.

9. **Printing.** Each market prints "draws S_m of 0.05 · c_m · draw". The program prints
   the sum of draws beside the confirmed count, never as a pass.

### The span-start mechanism, as built

- `calendarFolds` in `scripts/sweepFolds.ts` cuts [start, end) into fit 50 %, select
  25 % and confirm 25 %, each fold's decisions ending a 5-day embargo before it closes.
  `assertEmbargoCoversReview` holds the longest review window plus a 24-hour resolution
  horizon inside that embargo, so every select row resolves before select closes.
- `scripts/replay-sweep.ts` takes the span from `--fold-start`/`--fold-end` (one
  calendar for every symbol), from `--fold-spec` (one span per class, through
  `foldsByClass`), or from the union of the symbols' cached history. No amendment pins
  a span's start. `calendarFoldsExcluding` has no production caller.
- The door seals rows labelled confirm (`SEALED_FOLD`) and nothing else. The ledger
  records confirm spans only, per symbol.
- So today a fit or select row dated after F_s is readable by every reader, unledgered.

**The frontier-anchored span.** Run through the real `calendarFolds` on 2026-09-23,
[F − 3L, F + L) puts select's end and confirm's start at F exactly for L of 6, 30, 90
and 365 days and 7.55 years, on EURUSD's frontier and on LEUSX's, with no overlap of
act 3's recorded spans. When L exceeds a third of the class's pre-frontier history the
nominal start falls before the data, and fit and select hold all of it. The span is
honest on four conditions:

1. No fit or select date lies after F_s. This holds by construction and is checked at
   the read, by a refusal still to be built.
2. The confirm rows stay sealed by the door until the ledgered read.
3. L follows from a hashed floor and pre-frontier density and is fixed before the
   sweep runs, so nothing about the span is chosen after a look at a post-frontier
   row.
4. The read records [F_s, F_s + L), and its end becomes the next F_s.

The first confirm decisions warm up on bars before F_s. That is decision-time history,
not an outcome.

**The history-start span** (today's fold spec) has a post-frontier confirm fold only
when its end reaches start + 4(F_s − start)/3: 2032-04-16 on forex, 2031-01-09 metals,
2030-12-02 crypto, 2028-10-26 indices, 2027-08-14 to 2027-08-16 energies, livestock,
futures and agriculture. Before that end its confirm overlaps act 3, and the ledger
refuses it unless the acknowledgement flag is passed. At that end it is the
frontier-anchored span with L = (F_s − start)/3. Past it, its select fold holds post-frontier dates the door does not seal: 22.5 days
of them thirty days later. **Until a door withholds every fit and select row dated
after its symbol's frontier (rule 2 item 2(a), unbuilt), no sweep of any kind may
place a fit or select date after F_s**, registered or not. The late-listed classes'
history-start sweeps cross that line from 2027-08-14.

**The cost.** With L below a third of the pre-frontier history, fit and select hold
3L, not the whole history, which amendment 33's "to each market's true data limit"
does not favour. A fold rule that cuts [history start, F_s) 2 : 1 into fit and select
and makes [F_s, F_s + L) the confirm fold would keep the whole history at any L under
the same four conditions. It needs a new fold function and is not built.

**What it changes.** Amendment 46 calls the quarter rate "the most consequential
number" in its ruling: new calendar buys confirm fold at a quarter of the rate it
accrues. That rate belongs to history-start spans. A frontier-anchored span's confirm
fold is still the last quarter of the sweep's span, as 46 describes it, yet it buys
confirm fold at the full rate (table under "Why").

### Registry and tests

Header, pinned by hash: capPerMarket 0.05 (reading pending Q2); the charge rule
(pending Q3); burnFraction 0.8, JUDGED, with its reason; screen multiplier
tMultiplier95(clusters − 1); minClusters 30, JUDGED; the frontier rule; the span rule;
the confirm rule's text and its hash. No cluster unit and no anchor date in the header.

Status lines: *screen* as item 3; *freeze*: frozenHash, and per market F_m, L, S_m,
the candidates opened, c_m, the draw, and each registration without a candidate with
its reason; *confirm*: readId, and per candidate, market and arm the clusters on each
side, the multiplier, the (a) and (b) lower bounds, the sum of d and the verdict.

Tests are rule 1's, with two changed; rule 2's checks stand where this section does
not replace them:

- (c) Each screen multiplier equals tMultiplier95(clusters − 1). Each family floor is
  recomputed from the recorded decisions' cost and ATR under the recorded
  analyzerVersion and manifestHash. Each B is recomputed from the label.
- (d) Each confirm multiplier equals the t quantile at 1 − draw/2 at the one df rule.
  Verdicts are recomputed from the recorded cluster series on both arms, and on gross
  for (b) where the profile is JUDGED. readAt > frozenAt > registeredAt. For every
  symbol a read names, select's end equals confirm's start equals F_s at the freeze.

Mutations the tests must also catch: a floor in R instead of the registered ATR; a
thinner-side df; day clusters where the recorded B is longer; the net arm alone; a
select fold ending after F_s; a filter opening with its floor unmet.

### Build, none of it written

The registry; a general t inverse; the paired cluster bound over every cluster either
side traded (grid-totalr's `pairedP` is a sign-flip over shared days only and is not
it); the label block-length rule; a multi-candidate freeze and read; provenance
against each read's own spans; one ledgered read grading net and bound together
(grid-totalr refuses `--r-arm` with `--confirm-final` today, because the ledger records
no arm); the span-start refusal; the door for post-frontier fit and select rows; an
overlap refusal with no override (the acknowledgement flag lets one through today);
the confirm rule's registered text; the screen's status fields. Nothing registers until
the registry is built, and no entry family is screened until the random-entry screen
is built.

### Why

- **Money ships at confirm, so multiplicity is paid there.** A draw that is never read
  cannot produce a false confirm. At three registrations with one unread, the two that
  are read draw 0.0133 each instead of 0.02: z 2.475 against 2.326, ×1.40 the n
  against ×1.28, power 0.63 against 0.68.
- **The floor in the statistic's unit.** A family with no stop has no R. Cost in ATR is
  cost in R × riskDistance ÷ ATR, and 65 of the 80 `maxStopAtrMultiplier` values in
  `calibration.ts` allow a stop of 4 ATR, so mixing the units can err fourfold.
- **Both arms.** Net arming credits same-bar exits at the lock level. The one-bar
  bound costs 0.0225–0.0261 R per fill in all eight forex cells
  (`docs/research/arming-bound-2026-09-14.md` §3), and 65 of the 72 `runnerProtection`
  stamps are trail_tp1. A family confirmed on net alone can ship lock value an operator
  does not bank.
- **One cluster rule.** Cluster sums measure money; a per-fill figure rises when good
  trades grow rarer. For a costShare ≤ 0.15 filter on EURUSD, GBPUSD and USDJPY's
  fit-fold baseline rows, the unpaired standard error ran 6.2 to 7.8 times the nested
  one [verified: fit fold, round-2 journal]. A label that persists for weeks makes day
  clusters overstate independence; its B keeps the interval honest.
- **The per-market reading, priced.** At c = 1 each market read draws 0.04, a
  favourable false-confirm rate of 0.02 per market at a first burn. For a family that
  adds trades nothing lowers that. It is reached only at net breakeven: at a true mean
  0.5 SE below zero the confirm probability is 0.0053. One program-wide cap over 126 to
  235 cells at the same 0.8 burn gives z 3.60–3.76, ×2.51–2.70 the n and power
  0.21–0.17.

Forex, on the round late-2030s base [verified: arithmetic; base unverified; a family's
own n sets its wait]:

| | history-start span | frontier-anchored span |
|---|---:|---:|
| uncharged | 11.35 y | 7.07 y |
| c = 1 | 13.27 y | 7.55 y |
| c = 2 | 19.23 y | 9.04 y |
| c = 3 | 22.69 y | 9.90 y |
| program-wide, 0.05/N over 126–235 cells | 52.3–57.5 y | 17.3–18.6 y |
| program-wide, 0.04/N, like-for-like | 54.2–59.3 y | 17.8–19.1 y |

Inputs: forex's fold-spec start 2009-09-25, F 2026-08-26T10:45Z, base end 2038-01-01,
365.25-day years, 80 % power at 1.96. History-start waits are max(D/3, k(D + W) − D);
frontier-anchored waits are k(D + W)/4, with D = F − start, W the uncharged history-start
wait and k the n multiplier.

### Corrections to the text above

- "For the owner", first question: "52-58 y" is 52-57 y, corrected in place.
- Rule 1 item 3, "the second burn comes at least (E1 − S)/3 later", rule 1's CALENDAR
  figures and the owner section's "at least 9.4 y later on forex" hold on
  history-start spans only.
- "D4's absolute term is the cross-market brake" is withdrawn as the reason for the
  per-market reading, in the owner section, rule 1 and amendment 48. The pricing above
  replaces it.
- Amendment 48's "the owner … may reverse any; a draw fixed before a reversal stands"
  is withdrawn. After one freeze names two markets, a program-wide cap can no longer be
  honoured over spans already read: a c = 1 freeze on nine markets spends 0.36. So the
  ruling comes first.
- Amendment 48's "a conditioning filter … is a family" is withdrawn.
- Rule 1 item 5's "the later of 2026-08-26 and the end of every other recorded read's
  span" and rule 2 item 2's single frontier become the per-symbol F_s.
- The registry header's anchor, `minTradedDays` and `tMultiplier95(dayClusters − 1)`
  become the header above.
- The body's Status, the 6.2–7.8 wording, the unbuilt list and the stale citations
  stand corrected as check-round findings A8, F5, F8 and A7 give them.

### Contradictions, and how each was resolved

| # | Contradiction | Resolution |
|---|---|---|
| 1 | Rule 1 opens a line only where its readiness floor is met; rule 2 opens every line whose screen passed, and a filter hashes no floor. | One opening rule (item 4); a filter hashes a floor. |
| 2 | Rule 1 times each freeze for one family; rule 2 opens every candidate at one read. | A freeze is timed for one registration; any other meeting all three conditions opens with it. |
| 3 | Day clusters (rule 1 and the screen design) against B-day blocks (rule 2); a header that holds day clusters only. | Day, or B where the label autocorrelates past a day, for both kinds: a family whose side call persists for weeks, as a COT family's would, carries the same regime-coincidence exposure as a slow filter label. The unit sits in each registration. |
| 4 | Leg (b)'s df: every cluster either side traded (rule 1) against the thinner side (rule 2). | The paired series length − 1: rule 2's own by-reference clause points at rule 1. |
| 5 | 30 days (rule 1) against 30 blocks (rule 2); no minimum on rule 1's screen; "≥ 30 fills" in the screen design. | 30 clusters everywhere, the screen included. |
| 6 | Leg (b) only against a shipped cell (rule 1) against always against the parent (rule 2). | The same rule once a filter's parent is read as the shipped cell it filters. |
| 7 | Families confirm on net only; filters on net and arming-bound. | Both arms for every candidate. Gross for every (b) under a JUDGED profile, because a replacing family can win on the judged spread exactly as a filter can. |
| 8 | Effect floor in R; the screen measures in ATR. | cost ÷ ATR at each decision, the ATR named in the registration. |
| 9 | "A threshold fixed in advance" (46) against a floor read from an unpinned cost model. | The registration pins the analyzerVersion for its screen; the status line records it with manifestHash and the floor; test (c) recomputes the floor. |
| 10 | Rule 2 pins no ANALYZER_VERSION; the family floor needs one. | Pinned for a family's screen only; recorded everywhere else. |
| 11 | "A filter is a family" against 46's "registered before any fold is read" and "screened against the random-entry null". | A filter is not a family; its obligations are listed; the extension is named as departure 2. |
| 12 | 46 charges every family; rule 1 charges at the freeze. | Named as departure 1, pending Q3. |
| 13 | The per-market reading rests on "the cross-market brake", which is absent for a family that adds trades. | Rationale withdrawn; priced; Q2. |
| 14 | "May reverse any" against a program-wide cap that cannot be restored after a multi-market freeze. | No registration opens before the ruling. |
| 15 | Amendment 48 amends 46 under the standing approval; 46 is headed "owner ruling"; the record held that a standing approval cannot do that. | Authority limited to what 46 leaves open; Q1. |
| 16 | Amendment 48 registers calibration programs; no section gives them a rule; the random-entry screen cannot see one. | Out of this draft; Q4. |
| 17 | One global frontier (rule 2), a per-symbol frontier (amendment 48), 46's "post-2026-08-26", and rule 1 item 5's date anchor. | Per-symbol F_s, read through 46's first sentence. |
| 18 | The record's calendar and 46's Why assume confirm accrues at a quarter rate; `calendarFolds` on a frontier-anchored span buys it at the full rate. | Span-start rule; figures relabelled; the premise goes to the owner as Q5. |
| 19 | Rule 2 item 2 assumes a door for post-frontier fit and select rows; the door seals by label only. | No sweep may place fit or select after F_s until that door exists. |
| 20 | `pairedP` exists; leg (b) is a different statistic. | Named in the build list. |
| 21 | Both arms at confirm; grid-totalr refuses a non-net arm under `--confirm-final`. | Named in the build list. |
| 22 | "52-58 y" in the record; "52 to 57" in amendment 48. | 52-57; 57.48 y verified. |
| 23 | Rule 2 item 8 (full population and every exclusion map) binds filters; rule 1 says nothing for families. | Item 8 binds every read. |
| 24 | L hashed at registration needs the family's density, and 46 bars computing its decisions before registration. | The floor is hashed; L follows from it and pre-frontier density after the screen, before the sweep. |
| 25 | Rule 2 item 2(b) records every fold's post-frontier spans. | Not needed: no registered read opens a post-frontier fit or select date. |

### Open

1. **The burn fraction.** 0.8 was judged where burns fall at least 9.42 years apart on
   forex. On frontier-anchored spans a market can burn as often as floors allow; a
   second read on a market then draws 0.008 at c = 1 (z 2.652) and a third 0.0016
   (z 3.156). It stays at 0.8, JUDGED, until a refute round weighs a schedule that
   spends less on the first read.
2. **Amendment 46's premise** (Q5).
3. **Amendment 33 and short spans.** A registration whose floor yields an L below a
   third of the pre-frontier history freezes on 3L of it. It can buy the whole history
   only by hashing a higher floor, which delays its read. The unbuilt fold rule above
   removes the trade-off.
4. **Calibration programs and amendment-36 removals** (Q4). Until ruled, a calibration
   confirm read on m moves F_m and takes those dates from every registration on m, and
   nothing stops it but the overlap refusal and the acknowledgement flag.
5. **Authority** (Q1).
6. **Raw post-frontier reads stay unpoliceable.** The minute bank and the cache
   top-ups hold post-frontier prices and are read routinely: restore proofs, recoveries,
   probes. Once the desk reopens, its live record will also show every operator the
   shipped cells' post-frontier outcomes. The door cannot see a family or a filter
   designed after looking at either, and leg (b) against a cell whose confirm-span
   results its designer has watched is the case most exposed.
7. **Three results stay unverified**: the union bound on draws fixed before the read
   (rule 1 item 3), the intersection-union size of (a) and (b) together (rule 1 item
   4), and rule 2 item 4's "family-law draft; unverified until ruled".

### For the owner

- **Q1.** Can the standing approval amend law headed "owner ruling", or only settle
  what that law leaves open?
- **Q2.** Is the cap per market calendar or program-wide? Per market, each market read
  carries up to 0.02 favourable false confirms at a first burn, with no second leg for a
  family that adds trades. Program-wide at the same 0.8 burn puts forex at 54–59 years
  on history-start spans, or 17.8–19.1 years on frontier-anchored spans against 7.6 at
  c = 1. The answer is needed before the first registration.
- **Q3.** Is a family charged at registration, as 46 reads, or only when a freeze opens
  its candidate?
- **Q4.** Do conditioning filters, calibration programs and amendment-36 removals claim
  the same cap? If calibration programs register, what screens them? The random-entry
  screen reads no stop, TP1, ladder or window, so it cannot see one.
- **Q5.** Amendment 46 rests its timing on confirm accruing at a quarter rate, which is
  true of history-start spans only. Is the frontier-anchored span, with every fit and
  select date before the frontier and every confirm date after it, an honest way to buy
  a confirm read, and does its full-rate accrual change anything 46 decided?
