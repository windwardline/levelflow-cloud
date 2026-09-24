> **PARKED — not law.** This is amendment 48's fifth pass. It replaces the section headed
> "Reconciled draft 2026-09-23" in
> [`amendment-46-parameters-2026-09-21.md`](/docs/research/designs/amendment-46-parameters-2026-09-21.md),
> which stays there unchanged as history. It closes the seven majors and the surviving
> minors of [refute round 1](/docs/research/designs/amendment-48-refute-round-2026-09-23.md);
> the last section maps each finding to the rule that closes it. **This file is the whole
> draft**: no operative rule lives in the record it replaces. No registration is recorded,
> and no registry header is hashed, until the owner rules on Q1–Q6.

# Amendment 48, fifth pass: registering, screening and confirming a new entry family (2026-09-24)

## Authority

Amendment 46 is law. It requires every family to be "registered and hashed before any fold
is read, screened on the fit fold against the random-entry null at a threshold fixed in
advance, and charged against ONE CAPPED TOTAL ALPHA", and it leaves open the effect floor,
the reference price and whether a rising family count raises the bar. Under the standing
approval this draft settles only mechanics 46 does not state: the screen's effect floor and
statistic, that a rising count does not raise the screen's bar, the cap's size (0.05 two-sided
per market) and draw formula, clusters, degrees of freedom and floors, and both arms.
It recommends decision close as the reference price and leaves each registration to state and
hash its own.

Four rules depart from 46, or change a premise 46 rests on. They are drafted for the owner and
take effect only on the owner's ruling:

1. **Charge at the freeze** (Q3). 46 charges every registered family. This draft charges a
   registration only when a freeze opens its candidate.
2. **Conditioning filters register** (Q4). 46 covers entry families. A filter here takes
   neither of 46's family terms: its parent's pre-frontier rows are read before it registers,
   and it is not screened against the random-entry null.
3. **The span rule** (Q5). 46 rests its timing on confirm accruing at a quarter of the rate
   calendar accrues. Rule 1's spans buy confirm at the full rate.
4. **Pre-law registration** (Q6). Rule 12 lets a family hashed and merged before this draft is
   law enter the registry at its merge time.

The per-market cap is this draft's reading of 46's "one capped total alpha" (Q2). Whether the
standing approval may make any departure is Q1.

## Terms

- **Frontier F_s.** The latest end of any span recorded on symbol s by a read, or burned on s by
  a freeze (rule 8). Spans are half-open, [start, end), as `grid-totalr`'s overlap test reads
  them. The ledger holds one line today (act 3, read 2026-09-03T10:09:18Z): F_s is
  2026-08-26T10:45Z for 94 symbols and 2026-08-25T18:00Z for GFUSX, HEUSX and LEUSX. A
  symbol no recorded span names takes 2026-08-26T10:45Z, the calendar 46 names. Amendment 46's
  rule sentence, "a new entry family buys a confirm read only with dates no recorded read has
  seen", is read as: dates at or after F_s.
- **Substitute set.** A `correlationGroups` group (`supabase/functions/trade-analyzer/symbols.ts`)
  whose members share a price path across classes: `gold`, `silver`, `crude_oil` and
  `us_equity_indices`. Fourteen roster markets belong to one; MGCUSD is not on the roster, and
  WTI and CLUSD read the same provider series. The four names are pinned by test.
- **Merge time.** When the commit that adds a registration lands on `main`, as `git` records it.
- **Confirm start C_s.** The first UTC midnight at or after the later of F_s and the merge time
  of the registration the freeze is timed for (rule 2).
- **Registration.** One hypothesis, a canonical spec, hashed and merged on `main` (rule 3).
- **Label.** What a registration decides at each decision slot: for a family, +1 long, −1 short,
  0 no decision; for a filter, 1 keep, 0 drop.
- **Cluster.** The UTC decision day, `Math.floor(time / DAY_MS)` of each row's decision time,
  over filled rows at confirm and over decisions at a family's screen. Where the label
  autocorrelates past a day, the cluster is a block of B UTC days counted from the Unix epoch. B
  is the shortest length on the ladder 1, 7, 14, 28, 56, 91, 182, 364, 728 days at which, and at
  every longer length leaving at least 10 blocks, the lag-one autocorrelation of the block mean
  of the label lies within max(0.2, 2/√blocks) (both JUDGED). A label with no variance takes
  B = 1. No qualifying length is NO VERDICT on that market. B is computed from the label alone
  at the screen, recorded, recomputed by test (c) and fixed for confirm. It cannot be hashed at
  registration, because 46 bars computing a family's decisions before then.
- **Arms.** The three R columns of `ARM_COLUMNS` in `scripts/sweepStats.ts`: net (zero-latency
  arming), arming-bound (protection arms one bar late, at net cost) and gross (E8's commission,
  no modelled spread or slippage).

## The rule

1. **Folds.** A registered read on symbol s uses three folds. Fit and select cut
   [H_s, F_s) two to one by usable time, through `calendarFoldsExcluding`, which reduces to
   calendar time where no month is excluded; H_s is the class's fold-spec start. Confirm is
   [C_s, C_s + L). The interval [F_s, C_s) belongs to no fold. Each fold's decisions end 5 days
   before it closes, and W + 24 h fits inside those 5 days, so every fit and select row resolves
   before F_s. Symbols in one read share F_s and C_s; a class whose symbols' frontiers differ is
   split into separate reads.

2. **L, fixed before any confirm row exists.** The pre-frontier sweep, fit and select only,
   runs first. From it:
   - The freeze is timed for one registration, chosen mechanically: the lowest registry ordinal
     among registrations that passed their screen on a market of the read, have a candidate
     there from the pre-frontier folds, merged at or before C_s, and have no read on that market.
   - L is the shortest whole number of days above 5 at which, on every market the read names,
     that registration's projected traded clusters over [C_s, C_s + L − 5 d) meet its readiness
     floor. The projection applies its traded clusters per calendar day in the pre-frontier
     folds to the weekdays, or all days for a seven-day class, of that interval (JUDGED).
   - A market whose projection cannot meet the floor within 365 days (JUDGED) leaves the read
     and draws nothing.
   - The freeze file records the markets, their hash, C_s, each market's density, the floor and
     L before the confirm sweep runs. The confirm sweep then covers [C_s, C_s + L) and nothing
     else, warmed on bars before C_s, which is decision-time history, not outcome.

3. **Registration.** A canonical spec, merged on `main` before its freeze and, for a family,
   before any of its decisions is computed on any fold. Its hash covers:
   - kind and roster;
   - for a family: side rule, clock, W (with W + 24 h inside the 5-day embargo), reference price
     (decision close recommended), the statistic's ATR (primary or daily, named), and the
     analyzerVersion and `costModelHash` whose cost model sets its screen floor, at
     `modeledCostScale` 1. `costModelHash` is the sha256 of `executionQuality.ts` and
     `venueCosts.ts` at the registration commit; #408 changed `estimatedRoundTripCost` without a
     version bump, so the version alone does not pin the cost;
   - for a family: its exit geometry (order type, entry, stop rule, TP1, runner protection and
     window exit) or, per market, the identity of the shipped cell whose geometry it trades; and
     whether it adds trades or replaces the shipped cell's;
   - for a filter: its parent, a shipped cell; a field from `DERIVED_FIELDS`; an op; and the
     gate's two formulas, `decisionHourDistance` and `costShare`. A filter on an unshipped family
     is barred: a rule that conditions a new family is part of that family's registration;
   - for both: the finite grid the freeze chooses from and a freeze rule that yields at most one
     candidate per market from fit and select; the fit fold it is screened on, wholly before
     every F_s it names; a readiness floor per market, the fewest confirm clusters it will be
     read on, at least 30; and the cluster rule.

   A filter may read its parent's pre-frontier rows before it registers.

4. **Screen.**
   - *Entry family*, on its registered fit fold. For each decision, the uncensored MFE − MAE over
     (t, t + W] in the side's direction, from the reference price, over the pinned 5-minute
     series, in the registered ATR at t. The null takes the same symbol, side and UTC clock on a
     random fit-fold day in a month the feed witness calls contained, with |shift| > W and 20
     draws. Per market, the mean of candidate − null carries a 95 % interval clustered by the
     cluster rule, at `tMultiplier95(clusters − 1)`. It passes on m when the lower bound exceeds
     m's effect floor: the mean, over its screened decisions on m, of `estimatedRoundTripCost`
     as `estimateExecutionQuality` computes it at that decision under the registered
     analyzerVersion and `costModelHash`, divided by the same ATR. Fewer than 30 clusters is NO
     VERDICT. The bar does not move with the count.
   - *Filter*, on its parent's pre-frontier fit rows: (a) the kept rows' mean cluster R and (b)
     the mean paired cluster difference against the parent, which is minus the dropped rows' R
     in each parent-traded cluster, each with its lower bound above 0 at
     `tMultiplier95(clusters − 1)`, on the net and arming-bound arms, 30 clusters a side, and (b)
     on gross too under a JUDGED cost profile (amendment 43). A pass carries no weight; a refusal
     stands.
   - A screen refuses when its analyzerVersion or `costModelHash` differs from the registration's,
     or when any artifact holding the family's decisions (a decision emit's manifest, or the
     screen's own record where the screen computes them) does not postdate the registration's
     merge. The fit fold's corpus may predate it. Each market is screened once per registration.
   - The status line records analyzerVersion, `costModelHash`, manifestHash and, per market, the
     floor, clusters, B, multiplier, lower bound and verdict. A recorded lower bound can be judged
     against any later floor without a second read.

5. **Opening.** At a freeze, a registration opens a candidate on m only where its screen passed
   on m, its freeze rule yields a candidate there from the pre-frontier folds, the read's confirm
   span meets its readiness floor on m, and it merged at or before C_s. Every registration
   meeting all four opens; one that does not draws nothing and keeps its claim. A candidate
   whose read falls short of its readiness floor takes NO VERDICT, and its draw stays spent.

6. **Draws.** Each market has a two-sided cap of 0.05 over dates at or after its frontier (a
   per-market reading, Q2). At each freeze naming m, c_m is the number of candidates it opens on
   m, and each draws 0.8 × (0.05 − S_m) / c_m, where S_m sums the earlier draws on m. The 0.8 is
   JUDGED, and open (Open 1). c_m and every draw are fixed from the pre-frontier gradings and the
   freeze file before the confirm sweep runs. No recorded draw, multiplier or verdict moves.

7. **Confirm.** Realized R totalled per cluster, on the net and arming-bound arms both. A missing
   column is NO VERDICT.
   - (a) The mean over the candidate's traded clusters has its lower bound above 0, with
     df = those clusters − 1.
   - (b) Where the candidate filters or replaces a shipped cell's trades (a filter always does,
     against its parent): d = candidate cluster R − cell cluster R over every cluster either side
     traded, with 0 for an idle side. The mean of d has its lower bound above 0, with
     df = those clusters − 1. The sum of d is the money delta amendment 39 names. Under a JUDGED
     cost profile (amendment 43), (b) also holds on gross.
   - Each leg needs the candidate's readiness floor in traded clusters, on each side for (b),
     else NO VERDICT.
   - The multiplier is the t quantile at 1 − draw/2 for that df.
   - (a) is readable only where the shipped cell under the candidate is held back from this
     read's spans (`ADMISSIBILITY_RULE`, `scripts/ledgeredRead.ts`), with provenance computed
     against each read's own spans. A shipped cell was selected and confirmed before its read's
     frontier and this read's confirm span starts after F_s, so the condition holds once
     provenance is computed per read. Where it does not, the candidate cannot confirm on m, and
     (b) alone never confirms.
   - A family that adds trades is tested on (a) alone.
   - When two confirmed candidates filter or replace the same shipped cell, the earlier freeze
     ships; within one freeze, the lower registry ordinal. Their combination is a new
     registration.

8. **Reads and frontiers.**
   - A registered read's confirm sweep requests exactly the markets its freeze opened candidates
     on. The read grades both arms, records them, and records each requested market's span
     [C_s, C_s + L); the end becomes F_s.
   - For each substitute set the read names, that end also becomes F for every member it does
     not name, unless the member's frontier is already later.
   - A calendar or shard overlap with any recorded span refuses, with no override. A match on
     corpus identity alone, against a line that records spans, is logged and proceeds.
   - A freeze whose read is refused or never runs has burned its span: its markets' frontiers
     move to C_s + L, its draws stay spent, and its candidates may freeze again only on a later
     span.

9. **Sweeps past a frontier.**
   - Any sweep whose span reaches past a recorded frontier of one of its symbols appends its
     manifest hash to the registry before it runs. An abandoned one burns its confirm span as
     rule 8 does.
   - The sweep driver refuses a folded run, anything but `--warm-only` or `--discover`, that
     places a fit or select decision at or after the earliest recorded F_s of its symbols.
   - `grid-totalr --confirm-log-dir` and `replay-sweep --print-confirm-table` refuse any corpus
     whose confirm span reaches past a recorded frontier.
   - Until Q4 is ruled, a ledgered read that is not registered records the post-frontier spans of
     every fold it opens, not its confirm spans alone.

10. **Population.** Every read passes on the full population and on every exclusion map in force
    from registration to read; an exclusion refuses and never admits. A population exclusion
    never registers, ships or draws. This binds reads; a screen reads the months the feed witness
    calls contained and prints its population. A filter that shrinks a loss while its kept rows
    stay unprofitable is refused, and the market goes to amendment 36's removal test. Act 3 is
    charged nothing. `maxCostShare` 0.15 stays; changing it is a new registration.

11. **Printing.** Each market prints "draws S_m of 0.05 · c_m · draw". The program prints the
    sum of draws, and the confirmed candidates' summed confirm R, beside the confirmed count,
    never as a pass.

12. **Pre-law registration (pending Q6).** A family whose canonical spec carries every field
    rule 3 requires, and was hashed and merged on `main` before any of its decisions was computed
    on any fold, enters the registry at its merge time once the registry exists, provided its
    screen ran under its registered analyzerVersion and `costModelHash`. Until the owner has
    ruled Q1–Q6 it draws nothing and opens nothing.

## Facts the rule rests on (code at `main` d919615)

- `calendarFolds` (`scripts/sweepFolds.ts`) cuts one span 50/25/25 into fit, select and confirm,
  each fold's decisions ending an embargo before it closes. `calendarFoldsExcluding` places the
  same boundaries by usable time and has no production caller. Neither can leave a gap between
  select and confirm, so rule 1 needs a new fold function.
- `assertEmbargoCoversReview` holds the longest review window plus a 24-hour resolution horizon
  inside the 5-day embargo.
- `replay-sweep` takes a span from `--fold-start`/`--fold-end`, from `--fold-spec` (one span per
  class) or from the union of the symbols' cached history; `--days` defaults to 60, anchored at
  the run date. No amendment pins a span's start.
- The door seals rows labelled confirm (`SEALED_FOLD`) and nothing else. The ledger records confirm
  spans only, per symbol. So today a fit or select row dated after F_s is readable by every
  reader, unledgered, and a 60-day sweep run on 2026-09-23 places decisions after F in select.
- `grid-totalr --confirm-log-dir` files a confirm read outside the repository, where the next
  default read's prior-read scan never looks. `replay-sweep --print-confirm-table` prints
  confirm outcomes to stdout. Both are deliberate and documented; history-start spans keep them
  latent until 2027, and spans starting at a frontier would make them usable within weeks.

## Registry, status lines and tests

`docs/research/family-registry/registry.json`, tracked, append-only and prevHash-chained, never
under `docs/research/confirm-reads/`. Header, pinned by hash: capPerMarket 0.05 (reading pending
Q2); the charge rule (pending Q3); burnFraction 0.8, JUDGED and open; screen multiplier
`tMultiplier95(clusters − 1)`; minClusters 30, JUDGED; the frontier and substitute-set rule; the
fold and L rule (pending Q5); the confirm rule's text and its hash. No cluster unit and no anchor
date sit in the header. Entries: ordinal, id, merge commit and time, spec as stable JSON, specHash,
roster, prevHash.

Status lines: *screen* as rule 4; *freeze*: frozenHash, the markets and their hash, C_s, L and its
inputs, and per market F_s, S_m, the candidates opened, c_m, the draw, and each registration
without a candidate with its reason; *confirm*: readId, and per candidate, market and arm the
clusters on each side, the multiplier, the (a) and (b) lower bounds, the sum of d and the verdict.

Tests:

- (a) Per market, the draws sum to 0.05 or less, and each equals 0.8(0.05 − S_m)/c_m with c_m
  recomputed from the gradings and the freeze file.
- (b) A registration draws on m only at a freeze that names m and opens its candidate there.
- (c) Each screen multiplier equals `tMultiplier95(clusters − 1)`. Each family floor is recomputed
  from the recorded decisions' cost and ATR under the recorded analyzerVersion, `costModelHash`
  and manifestHash. Each B is recomputed from the label.
- (d) Each confirm multiplier equals the t quantile at 1 − draw/2 at the one df rule. Verdicts are
  recomputed from the recorded cluster series on both arms, and on gross for (b) where the
  profile is JUDGED. readAt > frozenAt > the timed registration's merge time, and C_s is the
  first UTC midnight at or after max(F_s, that merge time). L recomputes from its recorded
  inputs. For every symbol a read names, select ends at F_s, confirm starts at C_s, and no
  confirm span overlaps a recorded one.
- (e) The chain is intact, ordinals have no gaps, specHash matches, exact duplicates are refused,
  and every artifact holding a family's decisions postdates its registration's merge.
- (f) Earlier draws and verdicts are pinned by value. The substitute sets are pinned by name.

Mutations the tests must catch: a floor in R instead of the registered ATR; a thinner-side df;
day clusters where the recorded B is longer; the net arm alone; a select fold ending after F_s; a
confirm start before the timed registration's merge; an L that does not recompute; a read that
leaves a substitute's frontier behind; a filter opening with its floor unmet; a screen under
another `costModelHash`.

## Build, none of it written

The registry; a general t inverse; the paired cluster bound over every cluster either side traded
(`grid-totalr`'s `pairedP` is a sign-flip over shared days only and is not it); the label block
rule; a multi-candidate freeze and read; provenance against each read's own spans; one ledgered
read grading net and bound together (`grid-totalr` refuses `--r-arm` with `--confirm-final`
today, because the ledger records no arm); the gapped fold function and the two-sweep freeze of
rules 1 and 2; the substitute-set frontier; rule 9's manifest append and three refusals; an
overlap refusal with no override (the acknowledgement flag lets one through today) and the logged
identity-only proceed; the confirm rule's registered text; the screen's status fields and its
family input. Nothing registers until the registry is built, except under rule 12.

## Why

- **Money ships at confirm, so multiplicity is paid there.** A draw that is never read cannot
  produce a false confirm. At three registrations with one unread, the two that are read draw
  0.0133 each instead of 0.02: z 2.475 against 2.326, ×1.40 the n against ×1.28, power 0.63
  against 0.68.
- **Confirm starts after the merge.** Otherwise L is a free parameter: every whole-day L from 6 to
  4000 gives select end = confirm start = F (refute round 1, major 1), so a designer who watched
  [F, now) in the cache or the minute bank could register late and pick a confirm window already
  seen. Dates after the merge were unseen when the spec was fixed.
- **The floor in the statistic's unit.** A family with no stop has no R. Cost in ATR is cost in
  R × riskDistance ÷ ATR, and 65 of the 80 `maxStopAtrMultiplier` values in `calibration.ts`
  allow a stop of 4 ATR, so mixing the units can err fourfold.
- **Both arms.** Net arming credits same-bar exits at the lock level. The one-bar bound costs
  0.0225–0.0261 R per fill in all eight forex cells (`docs/research/arming-bound-2026-09-14.md`
  §3), and 65 of the 72 `runnerProtection` stamps are trail_tp1.
- **One cluster rule.** Cluster sums measure money; a per-fill figure rises when good trades grow
  rarer. A label that persists for weeks makes day clusters overstate independence; its B keeps
  the interval honest.
- **The per-market reading, priced.** At c = 1 each market read draws 0.04: at most 0.02
  favourable false confirms per market at a first burn, reached only at net breakeven. For a
  family that adds trades nothing else lowers it.

Forex, on the round late-2030s base [verified in round 1: arithmetic; base unverified; a family's
own n sets its wait]. The right-hand column counts from F; a registration merged later adds the
gap.

| | history-start span | confirm from the frontier |
|---|---:|---:|
| uncharged | 11.35 y | 7.07 y |
| c = 1 | 13.27 y | 7.55 y |
| c = 2 | 19.23 y | 9.04 y |
| c = 3 | 22.69 y | 9.90 y |
| program-wide, 0.05/N over 126–235 cells | 52.3–57.5 y | 17.3–18.6 y |
| program-wide, 0.04/N, like-for-like | 54.2–59.3 y | 17.8–19.1 y |

## Open

1. **The burn fraction.** 0.8 was judged where burns fall at least 9.42 years apart on forex. With
   confirm starting after the frontier a market can burn every 45 to 47 days at the minimum floor;
   a second read then draws 0.008 at c = 1 (z 2.652) and a third 0.0016 (z 3.156). It stays at
   0.8, JUDGED, until a refute round weighs a schedule that spends less on the first read.
2. **Amendment 46's premise** (Q5).
3. **Calibration programs and amendment-36 removals** (Q4). Until ruled, a calibration confirm read
   on m moves F_m and takes those dates from every registration on m, and nothing stops it but the
   overlap refusal and the acknowledgement flag.
4. **Authority** (Q1).
5. **Raw post-frontier reads stay unpoliceable.** The minute bank and the cache top-ups hold
   post-frontier prices and are read routinely: restore proofs, recoveries, probes. Once the desk
   reopens its live record shows every operator the shipped cells' post-frontier outcomes. Rule 1
   removes the confirm window's exposure to what a designer watched before the merge; it cannot
   remove a filter designer's view of a shipped cell's live results, and leg (b) against that cell
   is the case most exposed.
6. **Other shared paths.** Forex crosses share legs with the majors, and the four Treasury tenors
   sit on one curve. Whether a read on one moves the frontier of the others is JUDGED and open;
   rule 8 moves it only within the four substitute sets.
7. **Three results stay unverified:** the union bound on draws fixed before the read, the
   intersection-union size of legs (a) and (b) together, and the draw arithmetic's family-law
   provenance.

## For the owner

- **Q1. Authority, by provenance.** Amendment 46 is headed "owner ruling". The rulings record says
  amendments 43–46 were recorded under the standing approval, and 42's and 43's own bodies say so.
  May the standing approval amend 46, or only settle what it leaves open? This draft assumes the
  second and puts all four departures to you.
- **Q2. Is the cap per market or program-wide?** Amendment 45 calls the per-market grain a floor,
  not a bar, and expects about 4.5 false families across 91 markets at the gate. Per market, each
  market read carries up to 0.02 favourable false confirms at a first burn. Program-wide and
  charged at the freeze, a freeze opening k candidates across the program draws 0.04/k each: at
  k = 9, the size of act 3's freeze, z 2.845, ×1.73 the n and power 0.48 at the base n.
  Program-wide and charged at registration over 126–235 cells, forex waits 54–59 years on
  history-start spans, or 17.8–19.1 years with confirm from the frontier, against 7.55 at c = 1.
- **Q3. When is a family charged?** At registration, as 46 reads, or only when a freeze opens its
  candidate? Charging an unread registration prevents no false confirm and dilutes the ones read
  (Why, first point).
- **Q4. What else claims the cap?** Do conditioning filters, calibration programs and
  amendment-36 removals claim it? A filter departs from 46's family terms twice: its parent's
  pre-frontier rows are read before it registers, and it is not screened against the random-entry
  null. If calibration programs register, what screens them? The random-entry screen reads no
  stop, TP1, ladder or window, so it cannot see one.
- **Q5. The span rule.** Fit and select take the whole history before the frontier; confirm starts
  at the first UTC midnight after both the frontier and the timed registration's merge. Is that an
  honest way to buy a confirm read, and does its full-rate accrual change anything 46 decided? The
  minimum case: a weekday market at a 30-cluster floor reads 45 to 47 days after C_s, and a
  seven-day market 35, drawing 0.04 of the market's 0.05 at c = 1, where 0.8 was judged on burns
  9.42 years apart (Open 1). The price: the calendar between the frontier and the merge is lost
  to that read, 35.55 days for a registration merged on 2026-09-30.
- **Q6. Pre-law registration.** May a family hashed and merged on `main` before this draft is
  law, and screened only after that merge, enter the registry at its merge time (rule 12)? Each
  day a registration waits is a day of confirm calendar it gives up. If not, a family screened
  before the ruling can never register.

## Where refute round 1's findings closed

| Finding | Closed by |
|---|---|
| Major 1, L a free parameter | Confirm starts at C_s, after the timed registration's merge (Terms; rules 1, 2, 5); the timed registration is chosen mechanically, the markets are hashed, L and its inputs are recorded before the confirm sweep and recompute by test (d). |
| Major 2, no trade hashed | Rule 3: exit geometry or the shipped cell's identity per market, the freeze grid, and add or replace. |
| Major 3, the span rule without the owner | Authority lists it as departure 3; Q5 prices the minimum case and the lost calendar; the registry header marks it pending Q5. |
| Major 4, per-symbol frontier | Substitute sets (Terms; rule 8); forex crosses and Treasury tenors stay open (Open 6). |
| Major 5, two unrecorded routes | Rule 9, first and third items; Build. |
| Major 6, the interim ban | Rule 9, second item, in the driver; the fourth item keeps the filter rule's 2(b) until Q4. |
| Major 7, the extent | This file is the whole draft; rule 8 records every market the confirm sweep requested, and the sweep requests only markets with a candidate. |
| m1 | Rule 7, last item. |
| m2, AC6 | Rule 3 (`costModelHash`, `modeledCostScale` 1); rule 4 refuses a mismatch. |
| m4 | Rule 3: a filter on an unshipped family is barred. |
| m5 | Rule 10 binds reads, not screens. |
| m6 | Terms, frontier: a never-read symbol takes 2026-08-26T10:45Z. |
| m9 | Rule 5: short of its readiness floor is NO VERDICT; rule 7 uses the floor. |
| m10, AC2 | Rule 1: fit and select hold the whole pre-frontier history, so neither is empty where the class has any. |
| m11 | Terms, label and cluster: a family's block mean of +1, −1 and 0; no variance takes B = 1. |
| m12 | Rule 3: W + 24 h inside the embargo. |
| m13 | Rule 8, last item. |
| m15 | Rule 11. |
| m17 | Header. |
| m18, AC3 | Terms and rule 1: at or after, half-open throughout. |
| m19 | Rule 6 and Open 1. |
| m20 | Carried: the record's owner section was corrected in place on 2026-09-23 (52–58 y to 52–57 y). |
| AC1 | Q2: 7.55. |
| AC4 | Rule 2: projected over [C_s, C_s + L − 5 d). |
| AC5 | Rule 8 and Build. |
| AUTH-3 | Authority: the cap's size and the draw formula are mechanics taken. |
| AUTH-4, AUTH-9, m14 | Q2 cites 45's floor-not-bar clause and prices program-wide under charge at the freeze. |
| AUTH-5 | Rule 4 and test (e), scoped to the artifacts that hold a family's decisions: the fit fold's corpus may predate the registration. |
| AUTH-6 | Terms: 46's rule sentence. |
| AUTH-8 | Authority and rule 3: decision close recommended. |
| AUTH-11, AUTH-12, m3 | Q4 names both of a filter's exemptions. |
| AUTH-13 | Q1 asks by provenance. |
| SS-5 | Rule 1: fit and select are cut by usable time through `calendarFoldsExcluding`, the allocation amendment 45 names. |
