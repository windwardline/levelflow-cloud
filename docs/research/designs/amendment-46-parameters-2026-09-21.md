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

*Cost of the alternative:* One cap over 126 cells (the funded families, COT as one) to 235 (all six families, COT split) gives z 3.54-3.70, 2.45-2.63x the n and power 0.23-0.18 at the base n. It puts forex confirmation 52-58 y out on the round late-2030s base [verified: arithmetic].

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
