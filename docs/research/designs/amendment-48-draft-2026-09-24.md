> **PARKED — not law.** Amendment 48's sixth pass, written after
> [refute round 2](/docs/research/designs/amendment-48-refute-round-2-2026-09-24.md) on the fifth
> pass. It replaces the section headed "Reconciled draft 2026-09-23" in
> [`amendment-46-parameters-2026-09-21.md`](/docs/research/designs/amendment-46-parameters-2026-09-21.md),
> which stays there unchanged as history. **This file is the whole draft**: no operative rule lives
> in the record it replaces. Where each finding of rounds 1 and 2 closed is mapped in the round 2
> record. No registration is recorded, and no registry header is hashed, until the owner rules on
> Q1–Q6; the text as ruled then takes one more refute round before it is recorded as law.

# Amendment 48: registering, screening and confirming a new entry family (sixth pass, 2026-09-24)

## Authority

Amendment 46 is law. Every family is "registered and hashed before any fold is read, screened on
the fit fold against the random-entry null at a threshold fixed in advance, and charged against ONE
CAPPED TOTAL ALPHA", and 46 leaves open the effect floor, the reference price and whether a rising
family count raises the bar. Under the standing approval this draft settles only what 46 does not
state: the screen's statistic and effect floor; that a rising count does not raise the screen's
bar; the cap's size (0.05 two-sided; its grain is Q2's) and the draw split (its 0.8 is JUDGED and
open, Open 1; its charge point is Q3's); clusters, degrees of freedom, floors and arms. It recommends
decision close as the reference price; each registration hashes its own.

"Registered and hashed before any fold is read" is read as: before any of the family's own
decisions is computed on any fold, which is the screen design's "hashed into a registry before the
read". Read literally it would bar every family, since every fold has been read by some reader. A
family designed from a printed fit-fold result is screened on a fold its designer has seen, so its
spec discloses what was seen, and its pass weighs less.

Five rules depart from 46, or reach past it. They take effect only on the owner's ruling:

1. **Charge at the freeze** (Q3). 46 charges every registered family.
2. **Conditioning filters register** (Q4). A filter takes neither of 46's family terms: its parent's
   pre-frontier rows are read before it registers, and it is not screened against the random-entry
   null.
3. **The span rule** (Q5). 46 rests its timing on confirm accruing at a quarter of the rate calendar
   accrues; rules 1 and 2 buy confirm at the full rate.
4. **Pre-law registration** (Q6, rule 12).
5. **Unregistered work.** Rules 8 and 9 bind every ledgered read and every folded sweep past a
   frontier, which reaches calibration programs and amendment-36 removals that Q4 leaves open.

Whether the standing approval may make any of them is Q1.

## Terms

- **Correlated set.** A `correlationGroups` group (`supabase/functions/trade-analyzer/symbols.ts`)
  whose members span more than one asset class under `getAssetType`. The set is derived, not listed;
  today it is `gold`, `silver`, `crude_oil` and `us_equity_indices`, fourteen roster markets
  (MGCUSD is off the roster; WTI and CLUSD read one provider series). Brent (BZUSD) and the Russell
  (RTYUSD) share no other member's price path, so the rule moves their frontiers at a cost to their
  calendar (Open 6).
- **Frontier F_s.** The latest end of any span recorded, claimed by a pending freeze, or burned, on
  symbol s or on any member of s's correlated set (rules 8 and 9). Spans are half-open,
  [start, end), as `grid-totalr`'s overlap test reads them. The ledger holds one line today (act 3,
  read 2026-09-03T10:09:18Z): F_s is 2026-08-26T10:45Z for 94 symbols and 2026-08-25T18:00Z for
  GFUSX, HEUSX and LEUSX. A symbol no span names takes 2026-08-26T10:45Z. Amendment 46's rule
  sentence, "a new entry family buys a confirm read only with dates no recorded read has seen", is
  read as: dates at or after F_s.
- **Landed.** When a pull request merged into `main`, as GitHub records its `mergedAt`, cross-checked
  against the first-parent commit on `main`. Git's author and committer dates are set by the client
  and are never used.
- **Confirm start C_s.** The first UTC midnight at or after the later of F_s and the landing of the
  read's freeze file.
- **History start H_s.** Market s's own first bar, as the per-market data-limit table records it
  (amendment 33: per market, to each market's true data limit).
- **Registration.** One hypothesis, a canonical spec that has landed on `main` (rule 3).
  Registrations take ordinals in the order they land, strictly increasing by one. The registry's
  other lines (plan, manifest, screen, freeze, freeze-landed, confirm, burn) take none.
- **Label.** What a registration decides at each decision slot: for a family, +1 long, −1 short and
  0 no decision; for a filter, 1 keep and 0 drop.
- **Cluster.** The UTC decision day, `Math.floor(time / DAY_MS)` of each row's decision time: over a
  family's decisions at its screen, over a filter's parent rows at its screen, and over filled rows
  at confirm. Where the label autocorrelates past a day, the cluster is a block of B UTC days counted
  from the Unix epoch. B is the shortest length on the ladder 1, 7, 14, 28, 56, 91, 182, 364, 728
  days at which, and at every longer length leaving at least 10 blocks, the lag-one autocorrelation
  of the block mean of the label lies within max(0.2, 2/√blocks) (both JUDGED). A label with no
  variance takes B = 1. No qualifying length is NO VERDICT on that market. B is computed from the
  label alone at the screen, recorded, recomputed by test (c) and fixed for confirm.
- **Arms.** The three R columns of `ARM_COLUMNS` in `scripts/sweepStats.ts`: net (zero-latency
  arming), arming-bound (protection arms one bar late, at net cost) and gross (E8's commission, no
  modelled spread or slippage).

## The rule

1. **Folds.** A registered read on symbol s uses three folds. Fit and select cut [H_s, F_s) two to
   one by usable time, under the month map in force at the freeze, through a new two-fold function
   whose boundary matches `calendarFoldsExcluding`'s. Confirm is [C_s, C_s + L). The interval
   [F_s, C_s) belongs to no fold of that read and can never be confirm calendar again. Each fold's
   decisions end 5 days before it closes, and W + 24 h and the exit geometry's window exit + 24 h
   both fit inside those 5 days, so every fit and select row resolves before F_s.

2. **The read, and L.** A read covers one asset class. Its pool is every roster symbol of that class
   sharing F_s.
   - A pre-frontier sweep of the pool, fit and select only, runs first.
   - The freeze is timed for one registration: the lowest ordinal among registrations that passed
     their screen on a pool market, have a candidate there from the pre-frontier folds, landed
     before the freeze, and have neither a read nor a pending freeze on that market.
   - The read names exactly the pool markets on which the timed registration has a candidate.
   - L is the shortest whole number of days above 5 at which, on every named market, the timed
     registration's projected traded clusters over [C_s, C_s + L − 5 d) meet its readiness floor.
     The projection takes its traded clusters per weekday in the pre-frontier folds (per day for a
     seven-day class), counting only clusters on those days, and applies that density to the
     weekdays (all days) of the interval; for B > 1 the same in whole B-day blocks. For a candidate
     that replaces a shipped cell, the cell's side is projected the same way. A market with no
     pre-frontier traded cluster leaves the read. L has no cap: a floor sized for power reads years
     out (Why).
   - The freeze file records the pool, the named markets and their hash, the timed registration,
     each market's density, the floor, the pre-frontier sweep's manifestHash, source revision,
     fold-spec hash, month map and anchor, and, per market, the resolved calibration by value
     (`calibrationHash`) of every geometry a candidate trades. When it lands, a freeze-landed line
     records the landing, C_s and L, each derived mechanically from the freeze file.
   - The confirm sweep then covers [C_s, C_s + L) and nothing else, warmed on bars before C_s, which
     is decision-time history, not outcome. It refuses unless its analyzerVersion,
     `costModelHash`, source revision and `conditionsOf` (folds aside) equal the freeze's.

3. **Registration.** A canonical spec that lands on `main` before its freeze and, for a family,
   before any of its decisions is computed on any fold. Its hash covers:
   - kind and roster;
   - for a family: side rule, clock, W, reference price (decision close recommended) and the
     statistic's ATR (primary or daily, named);
   - for a family: the registration commit, the analyzerVersion, `modeledCostScale` 1, and
     `costModelHash`, the sha256 over the transitive runtime import closure of
     `estimateExecutionQuality` and `venueCommissionRoundTripPrice` at that commit, files in sorted
     path order, raw bytes (#408 changed `estimatedRoundTripCost` without a version bump, and the
     commission reads `futures.ts` and `symbols.ts`, so neither the version nor two files pin it);
   - for a family: the screen's month map (the feed witness table's sha256 and tier);
   - for a family: its exit geometry (order type, entry, stop rule, TP1, runner protection and window
     exit, each set from market structure and window feasibility under amendment 39) or, per market,
     the identity of the shipped cell whose geometry it trades; per market, the resolved calibration
     by value; and, per market, whether it adds trades or replaces the shipped cell's (replacing is
     barred where no cell ships);
   - for a filter: its parent, a shipped cell; a field from `DERIVED_FIELDS`; an op; and the gate's
     two formulas, `decisionHourDistance` and `costShare`. A filter on an unshipped family is barred:
     a rule that conditions a new family is part of that family's registration. A combination
     registers as a filter only when it is one field and one op;
   - for both: the finite grid the freeze chooses from. A family's grid may hold only parameters
     that leave its label unchanged. A filter's grid is its value grid, and each value is screened
     as its own member. A freeze rule yields at most one candidate per market from fit and select;
   - for both: the fit fold it is screened on, from a recorded fold spec the spec names, wholly
     before every F_s it names and ending at or before rule 1's fit/select boundary as of its
     landing; a readiness floor per market, the fewest confirm clusters it will be read on, at least
     30; the cluster rule; and a disclosure of every fit-fold result on its markets its designer has
     seen.

   A filter may read its parent's pre-frontier rows before it registers.

4. **Screen.**
   - *Entry family*, over the family's decisions on its registered fit fold. For each decision, the
     uncensored MFE − MAE over (t, t + W] in the side's direction, from the reference price, over the
     pinned 5-minute series, in the registered ATR at t. The null takes the same symbol, side and UTC
     clock on a random fit-fold day in a month the registered map calls contained, with |shift| > W
     and 20 draws. Per market, the mean of candidate − null carries a 95 % interval clustered by the
     cluster rule, at `tMultiplier95(clusters − 1)`. It passes on m when the lower bound exceeds m's
     effect floor: the mean, over its screened decisions on m, of `estimatedRoundTripCost` as
     `estimateExecutionQuality` computes it at that decision, from the registration commit's cost
     code at `modeledCostScale` 1, divided by the same ATR. Fewer than 30 clusters is NO VERDICT.
     The bar does not move with the count.
   - *Filter*, per grid member, on its parent's pre-frontier fit rows: (a) the kept rows' mean
     cluster R and (b) the mean paired cluster difference against the parent, which is minus the
     dropped rows' R in each parent-traded cluster, each with its lower bound above 0 at
     `tMultiplier95(clusters − 1)`, on the net and arming-bound arms, 30 clusters a side, and (b) on
     gross too under a JUDGED cost profile (amendment 43). A pass carries no weight; a refusal
     stands.
   - A screen refuses when its analyzerVersion or `costModelHash` differs from the registration's,
     when its `modeledCostScale` is not 1, or when any artifact holding the family's decisions (a
     decision emit's manifest, or the screen's own record where it computes them) does not postdate
     the registration's landing. The fit fold's corpus may predate it. Each registration, member and
     market is screened once.
   - The status line records the analyzerVersion, `costModelHash`, `modeledCostScale`, the hash of
     rule 4's text and the header's screen fields, the manifestHash, and, per market and member, the
     floor, clusters, B, multiplier, lower bound and verdict. A screen is judged only against the
     floor this rule derives from its registration's hashed inputs, and no recorded verdict moves.

5. **Opening.** At a freeze a registration opens a candidate on m only where all of these hold: its
   screen passed on m (for a filter, the frozen member's did); its freeze rule yields a candidate
   there from the pre-frontier folds; the read's confirm span meets its readiness floor on m, and on
   the shipped cell's side for a candidate that replaces it; it landed before the freeze; and it has
   neither a read nor a pending freeze on m. Every registration meeting all of them opens; one that
   does not draws nothing and keeps its claim. A candidate whose read falls short of its readiness
   floor takes NO VERDICT, and its draw stays spent.

6. **Draws.** Each market has a two-sided cap of 0.05 over the calendar after 2026-08-26T10:45Z, in
   total (a per-market reading, Q2). At each freeze naming m, c_m is the number of candidates it
   opens on m, and each draws 0.8 × (0.05 − S_m) / c_m, where S_m sums the earlier draws on m. The
   0.8 is JUDGED and open (Open 1). c_m and every draw are fixed in the freeze file, before it lands.
   No recorded draw, multiplier or verdict moves. Charging at the freeze (Q3) is sound only because
   every freeze lands before every date of its window.

7. **Confirm.** Realized R totalled per cluster, on the net and arming-bound arms both. A missing
   column is NO VERDICT.
   - (a) The mean over the candidate's traded clusters has its lower bound above 0, with
     df = those clusters − 1.
   - (b) Where the candidate filters or replaces a shipped cell's trades (a filter always does,
     against its parent): d = candidate cluster R − cell cluster R over every cluster either side
     traded, with 0 for an idle side. The mean of d has its lower bound above 0, with
     df = those clusters − 1. The sum of d is the money delta amendment 39 names. Under a JUDGED
     cost profile (amendment 43), (b) also holds on gross.
   - Each leg needs the candidate's readiness floor in traded clusters, on each side for (b), else
     NO VERDICT.
   - The multiplier is the t quantile at 1 − draw/2 for that df.
   - (a) is readable on m where m has no shipped cell, or where its shipped cell is held back from
     this read's spans (`ADMISSIBILITY_RULE`, `scripts/ledgeredRead.ts`), with provenance computed
     against each read's own spans. Where neither holds, the candidate cannot confirm on m, and (b)
     alone never confirms.
   - A family that adds trades on m is tested on (a) alone there.
   - When two confirmed candidates filter or replace the same shipped cell, the earlier freeze
     ships; within one freeze, the lower ordinal. Their combination is a new registration.

8. **Freezes, reads and frontiers.**
   - A freeze claims [C_s, C_s + L) on its named markets when it lands. A registration with a
     pending freeze on m is ineligible on m until that freeze is read or burned.
   - The confirm sweep requests exactly the named markets. The read grades both arms and records
     them, and records [C_s, C_s + L) on every named market and, flagged as propagated, on every
     member of each correlated set it names.
   - A read refuses when its span starts before any of its symbols' F_s as it stood when the freeze
     landed, when it overlaps any recorded span, or when its freeze or plan (rule 9) is not on
     `origin/main`. Nothing overrides a refusal. A match on corpus identity alone, against a line
     that records spans, is logged and proceeds; against a line that records none, it refuses. These
     refusals bind every ledgered read, registered or not.
   - A freeze whose read has not run 14 days (JUDGED) after C_s + L is burned on that date: its span
     is recorded as burned on its named markets and, propagated, on their correlated sets; its draws
     stay spent; its candidates may freeze again only on a later span.

9. **Folded sweeps past a frontier.** A folded run is any replay-sweep run but `--warm-only` and
   `--discover`, which fold nothing.
   - Before a folded run whose span reaches the F_s (as the Terms define it) of any of its symbols,
     a plan line lands on the registry on `origin/main`: source revision, argv hash, symbols, fold
     spans, grid, analyzerVersion and `costModelHash`. The driver refuses without it. After the run,
     its manifestHash is appended, bound to the plan. A plan with no bound manifest 14 days (JUDGED)
     after its planned end is abandoned and burns the confirm span it planned, as rule 8 burns.
   - The driver refuses a folded run that places a fit or select decision at or after the earliest
     F_s of its symbols.
   - The `confirmLogDir` option inside `grid-totalr` (which `confirm-4d` also reaches) and
     `replay-sweep --print-confirm-table` refuse any corpus whose confirm span reaches past F_s.
   - Until Q4 is ruled, a ledgered read that is not registered records the post-frontier spans of
     every fold it opens, not its confirm spans alone.

10. **Population.** Every read passes on the full population and on every exclusion map in force
    from registration to read; an exclusion refuses and never admits, and a map added later never
    admits. A population exclusion never registers, ships or draws. This binds reads; a screen reads
    the months its registered map calls contained and prints its population. A filter that shrinks a
    loss while its kept rows stay unprofitable is refused, and the market goes to amendment 36's
    removal test. Act 3 is charged nothing. `maxCostShare` 0.15 stays; changing it waits on Q4.

11. **Printing.** Each market prints "draws S_m of 0.05 · c_m · draw". Beside the confirmed count the
    program prints the sum of draws and the confirmed candidates' summed confirm R, never as a pass:
    arming-bound R for candidates that add trades and Σd for leg-(b) candidates, each arm named.

12. **Pre-law registration (pending Q6).** A spec that landed before the owner's ruling, carrying
    every field rule 3 requires, is a registration not yet recorded. When the registry exists it
    enters with its landing time and takes its ordinal in landing order. Its screen counts only if it
    ran under rule 4's text and the header's screen fields as enacted, whose hash its status line
    records; otherwise it cannot register, because its fit fold has been read. Its C_s comes from its
    freeze, as any other's does. Until the owner has ruled Q1–Q6 it draws nothing and opens nothing.

## Facts the rule rests on (code at `main` fea0a1d)

- `calendarFolds` (`scripts/sweepFolds.ts`) cuts one span 50/25/25 into fit, select and confirm,
  each fold's decisions ending an embargo before it closes. `calendarFoldsExcluding` places the same
  three shares by usable time and has no production caller. Neither makes a two-fold cut or leaves a
  gap, so rule 1 needs a new function.
- `assertEmbargoCoversReview` holds the longest review window plus a 24-hour resolution horizon
  inside the 5-day embargo.
- `replay-sweep` takes a span from `--fold-start`/`--fold-end`, from `--fold-spec` (one span per
  class) or from the union of the symbols' cached history; `--days` defaults to 60, anchored at the
  run date. No amendment pins a span's start.
- The door seals rows labelled confirm (`SEALED_FOLD`) and nothing else. The ledger records confirm
  spans only, per symbol. So today a fit or select row dated after F_s is readable by every reader,
  unledgered, and a 60-day sweep run on 2026-09-23 places decisions after F in select.
- A sweep's manifestHash covers its outputs (the emit digest, the rejections, the per-symbol
  decisions; `scripts/sweepManifest.ts`), so no manifest hash exists before a run.
- `grid-totalr`'s `confirmLogDir` files a confirm read in any directory, and one filed anywhere but
  the ledger directory or the next read's shard directories is invisible to that read's prior-read
  scan. `replay-sweep --print-confirm-table` prints confirm outcomes to stdout. Both are deliberate
  and documented; history-start spans keep them latent until 2027, and spans starting at a frontier
  would make them usable within weeks.

## Registry, lines and tests

`docs/research/family-registry/registry.json`, tracked, append-only and prevHash-chained, never under
`docs/research/confirm-reads/`. Header, pinned by hash: capPerMarket 0.05 (grain pending Q2); the
charge rule (pending Q3); burnFraction 0.8, JUDGED and open; screen multiplier
`tMultiplier95(clusters − 1)`; minClusters 30, JUDGED; the hash of rule 4's text and these screen
fields; the frontier and correlated-set rule; the fold and L rule (pending Q5); the pre-law rule
(pending Q6); the confirm rule's text and its hash; the two 14-day deadlines, JUDGED. Lines:
*registration* (ordinal, landing, spec as stable JSON, specHash, roster, prevHash); *plan* and
*manifest* (rule 9); *screen* (rule 4); *freeze* (rule 2, with per market F_s, S_m, the candidates
opened, c_m, the draw, and each registration without a candidate with its reason); *freeze-landed*
(landing, C_s, L); *confirm* (readId, and per candidate, market and arm the clusters on each side,
the multiplier, the (a) and (b) lower bounds, the sum of d and the verdict); *burn*.

Tests:

- (a) Per market, the draws sum to 0.05 or less, and each equals 0.8(0.05 − S_m)/c_m with c_m
  recomputed from the gradings and the freeze file.
- (b) A registration draws on m only at a freeze that names m and opens its candidate there, and
  never while it has a read or a pending freeze on m.
- (c) Each screen multiplier equals `tMultiplier95(clusters − 1)`. Each family floor is recomputed
  from the recorded decisions under the registration commit's cost code at the recorded
  analyzerVersion, `costModelHash` and `modeledCostScale`. Each B is recomputed from the label.
- (d) The timed registration, the pool, the named markets, each density and L recompute from the
  registry, the class map and the gradings. Each confirm multiplier equals the t quantile at
  1 − draw/2 at the one df rule, and verdicts recompute from the recorded cluster series on both
  arms, and on gross for (b) where the profile is JUDGED. Every opened registration landed before
  its freeze, the freeze landed at or before C_s, and C_s < readAt. For every named symbol, select
  ends at F_s, confirm starts at C_s, and no confirm span starts before F_s or overlaps a recorded
  span.
- (e) The chain is intact; ordinals rise by one in landing order; specHash matches; exact duplicates
  are refused; each landing time is the pull request's `mergedAt` and matches the first-parent
  commit; every artifact holding a family's decisions postdates its registration's landing; and the
  confirm shards postdate the registry commit.
- (f) Earlier draws and verdicts are pinned by value. The correlated sets are derived from
  `correlationGroups` and `getAssetType`, and the derivation's output is pinned.
- (g) The door withholds fit and select rows dated at or after F_s, and a confirm read refuses on
  overlap with any recorded span of any fold. A market with no screen pass gets no candidate and no
  draw. The gross leg fires for `rewardRisk` and `executionScore`. Block fixtures: session and
  weekday labels get short blocks, slow drift gets a long block, and a COT-like label with a slow
  outcome regime gets NO VERDICT. A side with 29 clusters is NO VERDICT. A dropped side that is
  profitable but below the mean is refused. A later map never admits. Act 3's checks stand.

Mutations the tests must catch: a floor in R instead of the registered ATR; a thinner-side df; day
clusters where the recorded B is longer; a normal z where t is wider; an unpaired SE or a per-fill
delta; the net arm alone; a select fold ending after F_s; a freeze landing after C_s; a timed
registration that is not the lowest eligible ordinal; an L that does not recompute; a read that
leaves a correlated member's frontier behind; a member read after its set's recorded read; a filter
opening with its floor unmet; a screen under another `costModelHash` or at `modeledCostScale` ≠ 1;
sealing by label only; the gross leg keyed on the five cost names; a spec edited in place; a changed
burnFraction.

## Build, none of it written

The registry and its lines; a general t inverse; the paired cluster bound over every cluster either
side traded (`grid-totalr`'s `pairedP` is a sign-flip over shared days only and is not it); the label
block rule; a multi-candidate freeze and read; provenance against each read's own spans; one ledgered
read grading net and bound together (`grid-totalr` refuses `--r-arm` with `--confirm-final` today,
because the ledger records no arm); the per-market two-fold function, the pre-frontier sweep and the
confirm sweep of rules 1 and 2, and the confirm sweep's refusal; the correlated-set frontier; rule 9's
plan and manifest lines and its refusals; the door for fit and select rows past F_s; an overlap
refusal with no override (the acknowledgement flag lets one through today), the logged identity-only
proceed and the identity-without-spans refusal; the burn deadlines; the confirm rule's registered
text; the screen's family input and status fields. Nothing registers until the registry is built,
except under rule 12.

## Why

- **Money ships at confirm, so multiplicity is paid there.** A draw that is never read cannot produce
  a false confirm. At three registrations with one unread, the two that are read draw 0.0133 each
  instead of 0.02: z 2.475 against 2.326, ×1.40 the n against ×1.28, power 0.63 against 0.68. This
  holds only because every freeze lands before its window: the decision to read is fixed before the
  window's prices exist.
- **Confirm starts after the freeze lands.** Every choice a read makes, the pool, the named markets,
  L, the frozen grid members and the draws, is on `main` before any date of its window exists. An
  anchor at the registration's merge left those choices to be made after the window opened.
- **The floor in the statistic's unit.** The statistic is in ATR. Cost in ATR is cost in R ×
  riskDistance ÷ ATR, and 65 of the 80 `maxStopAtrMultiplier` values in `calibration.ts` allow a stop
  of 4 ATR, so mixing the units can err fourfold.
- **Both arms.** Net arming credits same-bar exits at the lock level. The one-bar bound costs
  0.0225–0.0261 R per fill in all eight forex cells (`docs/research/arming-bound-2026-09-14.md` §3),
  and 65 of the 72 `runnerProtection` stamps are trail_tp1.
- **One cluster rule.** Cluster sums measure money; a per-fill figure rises when good trades grow
  rarer. A label that persists for weeks makes day clusters overstate independence; its B keeps the
  interval honest, and a read with long blocks needs many of them.
- **The per-market reading, priced.** At c = 1 each market read draws 0.04: at most 0.02 favourable
  false confirms per market at a first burn, reached only at net breakeven. A null family read on all
  91 markets expects about 1.8 of them at its first burns, against the gate's 4.5.

Forex waits, on the round late-2030s base [verified in round 1: arithmetic; base unverified; a
family's own n sets its wait]. The right-hand column counts from F; a read whose freeze lands later
adds the gap.

| | history-start span | confirm from the frontier |
|---|---:|---:|
| uncharged | 11.35 y | 7.07 y |
| c = 1 | 13.27 y | 7.55 y |
| c = 2 | 19.23 y | 9.04 y |
| c = 3 | 22.69 y | 9.90 y |
| program-wide, 0.05/N over 126–235 cells | 52.3–57.5 y | 17.3–18.6 y |
| program-wide, 0.04/N, like-for-like | 54.2–59.3 y | 17.8–19.1 y |

Inputs: forex's fold-spec start 2009-09-25, F 2026-08-26T10:45Z, base end 2038-01-01, 365.25-day
years, 80 % power at 1.96. History-start waits are max(D/3, k(D + W) − D); confirm-from-frontier
waits are k(D + W)/4, with D = F − start, W the uncharged history-start wait and k the n
multiplier. A read capped at one year would have power 0.16 at c = 1 on this base, which is why L has
no cap.

## Open

1. **The burn fraction.** 0.8 was judged where burns fall at least 9.42 years apart on forex. With
   confirm starting after the frontier, a market can burn every 45 to 47 days at the minimum floor
   (35 for a seven-day class). A second read then draws 0.008 at c = 1 (z 2.652; t 2.848 at df 29)
   and a third 0.0016 (z 3.156; t 3.482 at df 29). It stays at 0.8, JUDGED, until a refute round
   weighs a schedule that spends less on the first read.
2. **Amendment 46's premise** (Q5).
3. **Calibration programs and amendment-36 removals** (Q4). Until ruled, a calibration confirm read on
   m moves F_m and takes those dates from every registration on m, and nothing stops it but the
   overlap refusal.
4. **Authority** (Q1).
5. **Raw post-frontier reads stay unpoliceable.** The minute bank and the cache top-ups hold
   post-frontier prices and are read routinely: restore proofs, recoveries, probes. Once the desk
   reopens its live record shows every operator the shipped cells' post-frontier outcomes. Rules 1
   and 2 keep every read's choices ahead of its window; they cannot remove a filter designer's view
   of a shipped cell's live results, and leg (b) against that cell is the case most exposed.
6. **Other shared paths.** Forex crosses share legs with the majors, and the four Treasury tenors sit
   on one curve. Whether a read on one moves the frontier of the others is JUDGED and open. Inside
   the correlated sets, Brent and the Russell move with their sets although they share no member's
   price path.
7. **Three results stay unverified:** the union bound on draws fixed before the read, the
   intersection-union size of legs (a) and (b) together, and the draw arithmetic's provenance in the
   family-count draft.

## For the owner

Each question carries a recommendation that survived both rounds and its price.

- **Q1. Authority, by provenance.** Amendment 46 is headed "owner ruling"; the rulings record says
  amendments 43–46 were recorded under the standing approval, and 42's and 43's own bodies say so.
  May the standing approval amend 46, or only settle what it leaves open? *Recommendation:* only
  settle what it leaves open, which is what this draft assumes; every departure is put to you.
- **Q2. Is the cap per market or program-wide?** Amendment 45 calls the per-market grain a floor, not
  a bar, and expects about 4.5 false families across 91 markets at the gate. *Recommendation:* per
  market. Price: each market read carries up to 0.02 favourable false confirms at a first burn, about
  1.8 across 91 markets for a null family. Program-wide and charged at the freeze, a freeze opening k
  candidates draws 0.04/k each: at k = 9, the size of act 3's freeze, z 2.845, ×1.73 the n and power
  0.48 at the base n. Program-wide and charged at registration over 126–235 cells, forex waits 54–59
  years on history-start spans, or 17.8–19.1 years with confirm from the frontier, against 7.55 at
  c = 1.
- **Q3. When is a family charged?** At registration, as 46 reads, or only when a freeze opens its
  candidate? *Recommendation:* at the freeze. Charging an unread registration prevents no false
  confirm and dilutes the ones read (Why, first point). It is sound only because a freeze lands
  before its window.
- **Q4. What else claims the cap?** Do conditioning filters, calibration programs and amendment-36
  removals? A filter departs from 46's family terms twice: its parent's pre-frontier rows are read
  before it registers, and it is not screened against the random-entry null. *Recommendation:* all
  three register and claim the same cap, one registration per program per market. A calibration
  program is not screened (the random-entry screen reads no stop, TP1, ladder or window, so it cannot
  see one) and confirms through leg (b) against the cell it would replace. Price: a filter or program
  sharing a market with a family raises that family's fills from ×1.068 to ×1.279 the base (+19.7 %).
  Until you rule, rules 8 and 9 already bind their reads and sweeps, and an abandoned sweep burns the
  confirm span it planned on every symbol it names.
- **Q5. The span rule.** Fit and select take each market's whole history before its frontier;
  confirm starts at the first UTC midnight at or after the later of the frontier and the freeze's
  landing. Is that an honest way to buy a confirm read, and does its full-rate accrual change
  anything 46 decided? *Recommendation:* yes, honest: every choice a read makes lands before any date
  of its window, and the full rate changes 46's timing, not its multiplicity rule. Price: the minimum
  read on a weekday market at a 30-cluster floor ends 45 to 47 days after C_s (35 for a seven-day
  market), drawing 0.04 of the market's 0.05 at c = 1, where 0.8 was judged on burns 9.42 years
  apart (Open 1). The calendar from the frontier to C_s is lost as confirm calendar on those markets
  for good and can enter only fit or select: 35.55 days (36.25 for GFUSX, HEUSX and LEUSX) for a
  freeze landing on 2026-09-30, and a day more for each day the first freeze waits.
- **Q6. Pre-law registration.** May a family whose spec landed before your ruling, and was screened
  only after that landing, enter the registry at its landing (rule 12)? *Recommendation:* yes, on
  rule 12's condition that its screen ran under the screen text as enacted. Price, yes: a
  registration's screen verdict exists before the law fixes its threshold, and if the enacted text
  differs the family cannot enter at all. Price, no: every family screened before the ruling can never
  register, because its fit fold has been read. Confirm calendar is not at stake either way: C_s
  follows the freeze.
