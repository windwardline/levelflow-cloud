> **PARKED — not law.** Amendment 48's seventh pass. It closes
> [refute round 2](/docs/research/designs/amendment-48-refute-round-2-2026-09-24.md) on the fifth
> pass and the closure check on the sixth (same record). It replaces the section headed
> "Reconciled draft 2026-09-23" in
> [`amendment-46-parameters-2026-09-21.md`](/docs/research/designs/amendment-46-parameters-2026-09-21.md),
> which stays there unchanged as history. **This file is the whole draft**: no operative rule lives in
> the record it replaces. Every finding of rounds 1 and 2 and the closure check is closed or carried in
> Open, except two round-1 findings the record cannot recover. No registration is recorded, and no
> registry header is hashed, until the owner rules on Q1–Q6; the text as ruled then takes one more
> refute round before it is recorded as law.

# Amendment 48: registering, screening and confirming a new entry family (seventh pass, 2026-09-24)

## Authority

Amendment 46 is law. Every family is "registered and hashed before any fold is read, screened on the
fit fold against the random-entry null at a threshold fixed in advance, and charged against ONE
CAPPED TOTAL ALPHA", and 46 leaves open the effect floor, the reference price and whether a rising
family count raises the bar. Under the standing approval this draft settles only what 46 does not
state: the screen's statistic and effect floor; that a rising count does not raise the screen's bar;
the cap's size (0.05 two-sided; its grain is Q2's) and the draw split (its 0.8 is JUDGED and open,
Open 1; its charge point is Q3's); clusters, degrees of freedom, floors and arms. It recommends
decision close as the reference price; each registration hashes its own.

"Registered and hashed before any fold is read" is read as: before any of the family's own decisions
is computed on any fold, which is the screen design's "hashed into a registry before the read". Read
literally it would bar every family, since every fold has been read by some reader. A family designed
from a printed fit-fold result is screened on a fold its designer has seen, so its spec discloses what
was seen, and its pass weighs less.

Five rules depart from 46, or reach past it. All take effect together, on the owner's ruling:

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
  whose members span more than one asset class under `getAssetType`. Derived, not listed; today
  `gold`, `silver`, `crude_oil` and `us_equity_indices`, fourteen roster markets (MGCUSD is off the
  roster; WTI and CLUSD read one provider series). Each claim records its set's members from the
  freeze's source revision, and a membership change never lowers any frontier: a symbol that was ever
  in a set keeps that set's recorded and claimed spans. Brent (BZUSD) and the Russell (RTYUSD) share no
  other member's price path, so the rule costs them calendar (Open 6).
- **Recorded frontier F°_s.** The latest end of any span recorded by a read, or burned (rules 8 and
  9), on symbol s or on any member of its correlated set. Spans are half-open, [start, end), as
  `grid-totalr`'s overlap test reads them. The ledger holds one line today (act 3, read
  2026-09-03T10:09:18Z): 2026-08-26T10:45Z for 94 symbols and 2026-08-25T18:00Z for GFUSX, HEUSX and
  LEUSX. A symbol no span names takes 2026-08-26T10:45Z. Every seal keys on F°_s, so a claimed window
  stays sealed until its read.
- **Frontier F_s.** The later of F°_s and the end of any pending claim on s or its set. Eligibility,
  the pool and C_s key on F_s. A read's own F_s is its value just before its freeze lands, excluding
  its own claim, and the freeze line records it per market. Amendment 46's rule sentence, "a new
  entry family buys a confirm read only with dates no recorded read has seen", is read as: dates at or
  after F_s.
- **Landed.** When a pull request merged into `main`, as GitHub records its `mergedAt`, cross-checked
  against the first-parent commit on `main`. Git's author and committer dates are set by the client and
  are never used. A spec's **registration commit** is that first-parent commit; the registry line
  records it, and the `costModelHash` computed at it, outside the specHash. One spec per pull request.
- **Confirm start C_s.** The first UTC midnight at or after the later of F_s and T + 21 days
  (JUDGED), where T is the timed registration's landing (for a rule-12 family, the registry's own
  landing). The freeze line declares C_s and must land before it; a later landing refuses, and the
  timed registration lapses on the pool (rule 8). So the window's start is fixed by a
  landing the operator made before any post-registration choice, not by when the freeze is filed.
- **History start H_s.** The first bar of market s's pinned 5-minute series as the pre-frontier sweep
  loads it, at full depth (`--days max`) and the freeze's anchor, before it cuts any fold (amendment 33:
  per market, to each market's true data limit; the 5-minute series is the one the screen measures on,
  and it is shallower than the 15-minute one for most symbols). The sweep's manifest records it as that
  series' first time, the freeze line carries the manifest's hash, and test (d) recomputes the folds from
  that record.
- **Registration.** One hypothesis, a canonical spec that has landed on `main` (rule 3).
  Registrations take ordinals in landing order, strictly increasing by one. The registry's other lines
  (screen, plan, manifest, digest, freeze, freeze-landed, confirm) take none; a burn is derived from
  dates, not written.
- **Label.** What a registration decides at each decision slot: for a family, +1 long, −1 short and 0
  no decision; for a filter, 1 keep and 0 drop.
- **Cluster.** The UTC decision day, `Math.floor(time / DAY_MS)` of each row's decision time: over a
  family's decisions at its screen, over a filter's parent rows at its screen, and over filled rows at
  confirm. Where the label autocorrelates past a day, the cluster is a block of B UTC days counted
  from the Unix epoch. B is the shortest length on the ladder 1, 7, 14, 28, 56, 91, 182, 364, 728 days
  at which, and at every longer length leaving at least 10 blocks, the lag-one autocorrelation of the
  block mean of the label lies within max(0.2, 2/√blocks) (both JUDGED). A label with no variance
  takes B = 1. No qualifying length is NO VERDICT on that market. B is computed from the label alone at
  the screen, recorded, recomputed by test (c) and fixed for confirm. The Label and Cluster
  definitions are hashed into the header's screen fields.
- **Arms.** The three R columns of `ARM_COLUMNS` in `scripts/sweepStats.ts`: net (zero-latency
  arming), arming-bound (protection arms one bar late, at net cost) and gross (E8's commission, no
  modelled spread or slippage). Every arm is graded at `modeledCostScale` 1 and `grossCostScale` 0
  (the gross arm's definition; `GROSS_COST_SCALE` in `executionQuality.ts`).

## The rule

1. **Folds.** A registered read on symbol s uses three folds. Fit and select are the first two folds
   `calendarFoldsExcluding` places over [H_s, E), under the registration's hashed month map, where E
   extends F_s by a third of [H_s, F_s)'s usable time; its third fold is discarded. Confirm is
   [C_s, C_s + L_m) for each named market m. The interval [F_s, C_s) belongs to no fold of that read
   and can never be confirm calendar again. Each fold's decisions end 5 days before it closes, and
   rule 3 refuses a W or a window exit that does not fit, so every fit and select row resolves before
   F_s.

2. **The read, its freeze, and L.** A read covers one asset class. Its pool is every roster symbol of
   that class sharing F_s.
   - A pre-frontier sweep of the pool, fit and select only, at `modeledCostScale` 1, runs first.
   - The freeze is timed for one registration: the lowest ordinal among registrations whose screen
     landed before the freeze, whose pass on a pool market is rule 5's pass (for a filter, the member
     its freeze rule yields), which have a candidate there from the pre-frontier folds, and which have
     no read, burned freeze, lapse or pending freeze on that market. Only screen and registration lines that
     landed before the freeze count.
   - The read names exactly the pool markets on which the timed registration has a candidate.
   - For each named market m, L_m is the shortest whole number of days above 5 at which the timed
     registration's projected traded clusters over [C_s, C_s + L_m − 5 d) meet its readiness floor,
     and not beyond its hashed maximum confirm length. The projection takes its traded clusters per
     weekday in the pre-frontier folds (per day for a seven-day class), counting only clusters on
     those days, and applies that density to the weekdays (all days) of the interval; for B > 1 the
     same in whole B-day blocks from the epoch. For a candidate that replaces a shipped cell, the
     cell's side is projected the same way. A market with no pre-frontier traded cluster, or whose L_m
     would pass the maximum, leaves the read.
   - The freeze line is the whole freeze. It lists, once: the pool; the named markets and their hash;
     the timed registration; per market F_s, H_s, S_m, density, floor and L_m; the declared C_s; the
     pre-frontier sweep's manifestHash, source revision, fold-spec hash, month map and anchor, and its
     `modeledCostScale`; per market the resolved calibration by value (`calibrationHash`) of every
     geometry a candidate trades; each opened candidate's frozen member; c_m and each draw; each
     correlated set's members; and each registration without a candidate, with its reason. Openings,
     c_m and the draws are computed against the declared C_s and L_m, so none depends on when the line
     lands. The freeze-landed line records the landing and checks it precedes C_s.
   - The confirm sweep covers [C_s, C_s + L_m) on each named market m and nothing else, warmed on bars
     before C_s, which is decision-time history, not outcome. It reads the canonical cache at the
     anchor that is the first UTC day at or after C_s + L_m + 4 days, after the top-up's three-day
     overlap has settled, with no cache override and no refetch of the window. A digest line holding
     each symbol's window and warm-up bars lands before any confirm row is computed, and the read
     refuses any other bars. The sweep refuses unless its analyzerVersion, `costModelHash`, source
     revision, `modeledCostScale` 1, `grossCostScale` 0 and `conditionsOf` (folds and anchor aside) equal the
     freeze's.

3. **Registration.** A canonical spec that lands on `main` before its freeze and, for a family, before
   any of its decisions is computed on any fold. Its hash covers:
   - kind and roster;
   - for a family: side rule, clock, W, reference price (decision close recommended), and the
     statistic's ATR (primary or daily, named);
   - for a family: the analyzerVersion, `modeledCostScale` 1, `grossCostScale` 0, and the cost-model closure that the
     registry line's `costModelHash` pins: the transitive runtime import closure of `pricePlan.ts`,
     `estimateExecutionQuality` and `venueCommissionRoundTripPrice`, files in sorted path order, raw
     bytes (#408 changed `estimatedRoundTripCost` without a version bump, and the commission reads
     `futures.ts` and `symbols.ts`, so neither the version nor two files pin it);
   - for both kinds: a month map (the feed witness table's sha256 and tier at the registration commit);
   - for a family: its exit geometry (order type, entry, stop rule, TP1, runner protection and window
     exit, each set from market structure and window feasibility under amendment 39) or, per market,
     the identity of the shipped cell whose geometry it trades; per market, the resolved calibration by
     value, which governs its trades (a freeze refuses when the freeze-time values for a geometry it
     trades differ); and, per market, whether it adds trades or replaces the shipped cell's (replacing
     is barred where no cell ships);
   - for a filter: its parent, a shipped cell; a field from `DERIVED_FIELDS`; an op; and the gate's two
     formulas, `decisionHourDistance` and `costShare`. A filter on an unshipped family is barred: a
     rule that conditions a new family is part of that family's registration. A combination registers
     as a filter only when it is one field and one op;
   - for both: the finite grid the freeze chooses from and its freeze rule, which yields at most one
     candidate per market from fit and select. A family's grid may hold only parameters that leave its
     label unchanged; a filter's grid is its value grid, each value screened as its own member;
   - for both: the fit fold it is screened on, from `fold-spec-2026-08-26` or rule 1's spec at its
     F_s, wholly before every F_s it names and ending before rule 1's fit/select boundary under its
     month map; a readiness floor per market, the fewest confirm clusters it will be read on, at least
     30; a maximum confirm length per market; the cluster rule, which must equal the header's; and a
     disclosure of every fit-fold result on its markets its designer has seen.

   A registration refuses unless W + 24 h and the window exit + 24 h each fit inside the 5-day
   embargo; the driver passes the family's window to `assertEmbargoCoversReview`. A filter may read
   its parent's pre-frontier rows before it registers.

4. **Screen.**
   - *Entry family*, over the family's decisions on its registered fit fold. For each decision, the
     uncensored MFE − MAE over (t, t + W] in the side's direction, from the reference price, over the
     pinned 5-minute series, in the registered ATR at t. The null takes the same symbol, side and UTC
     clock on a random fit-fold day in a month the registered map calls contained, with |shift| > W
     and 20 draws, seeded from the specHash. Per market, the mean of each decision's statistic minus
     its null carries a 95 % interval clustered by the cluster rule, at `tMultiplier95(clusters − 1)`.
     It passes on m when the lower bound exceeds m's effect floor: the mean, over its screened
     decisions on m, of `estimatedRoundTripCost` as `estimateExecutionQuality` computes it at that
     decision, from the registration commit's cost code at `modeledCostScale` 1, divided by the same
     ATR. Fewer than 30 clusters is NO VERDICT. The bar does not move with the count.
   - *Filter*, per grid member, on its parent's pre-frontier fit rows: (a) the kept rows' mean cluster
     R and (b) the mean paired cluster difference against the parent, which is minus the dropped rows'
     R in each parent-traded cluster, each with its lower bound above 0 at
     `tMultiplier95(clusters − 1)`, on the net and arming-bound arms, 30 clusters a side, and (b) on
     gross too under a JUDGED cost profile (amendment 43). A pass carries no weight; a refusal stands.
   - A screen refuses when its analyzerVersion or `costModelHash` differs from the registration's, when
     its `modeledCostScale` is not 1 or its `grossCostScale` not 0, or when any artifact holding the family's decisions (a decision
     emit's manifest, or the screen's own record where it computes them) does not postdate the
     registration's landing. The fit fold's corpus may predate it. Each registration, member and market
     is screened once.
   - The screen line records the screen's source revision, the analyzerVersion, `costModelHash`,
     `modeledCostScale`, the header's screen-field hash, the manifestHash, each screened decision's cost
     inputs (atr, dailyAtr, latestClose, entry, stop, target, quotedSpread, tickSize, usdPerQuote), and,
     per market and member, the floor, clusters, B, multiplier, lower bound and verdict. A screen is
     judged only against the floor this rule derives from its registration's hashed inputs, and no
     recorded verdict moves.

5. **Opening.** At a freeze a registration opens a candidate on m only where all of these hold: its
   screen passed on m (for a filter, the frozen member's did); its freeze rule yields a candidate there
   from the pre-frontier folds; the declared confirm span meets its readiness floor on m within its
   maximum confirm length, and on the shipped cell's side for a candidate that replaces it; it landed
   before the freeze; and it has no read, burned freeze, lapse or pending freeze on m. Every registration
   meeting all of them opens; one that does not draws nothing and keeps its claim. A candidate whose
   read falls short of its readiness floor takes NO VERDICT, and its draw stays spent.

6. **Draws.** Each market has a two-sided cap of 0.05 over the calendar after 2026-08-26T10:45Z, in
   total (a per-market reading, Q2). At each freeze naming m, c_m is the number of candidates it opens
   on m, and each draws 0.8 × (0.05 − S_m) / c_m, where S_m sums the earlier draws on m. The 0.8 is
   JUDGED and open (Open 1). c_m and every draw are fixed in the freeze line against its declared C_s,
   before it lands. No recorded draw, multiplier or verdict moves. The draw is fixed before the
   window's prices exist, and a read left to burn keeps its draw spent.

7. **Confirm.** Realized R totalled per cluster, on the net and arming-bound arms both, at
   `modeledCostScale` 1 and `grossCostScale` 0. A missing column is NO VERDICT.
   - (a) The mean over the candidate's traded clusters has its lower bound above 0, with
     df = those clusters − 1.
   - (b) Where the candidate filters or replaces a shipped cell's trades (a filter always does, against
     its parent): d = candidate cluster R − cell cluster R over every cluster either side traded, with 0
     for an idle side. The mean of d has its lower bound above 0, with df = those clusters − 1. The sum
     of d is the money delta amendment 39 names. Under a JUDGED cost profile (amendment 43), (b) also
     holds on gross.
   - Each leg needs the candidate's readiness floor in traded clusters, on each side for (b), else NO
     VERDICT.
   - The multiplier is the t quantile at 1 − draw/2 for that df.
   - (a) is readable on m where m has no shipped cell, or where its shipped cell is held back from this
     read's spans (`ADMISSIBILITY_RULE`, `scripts/ledgeredRead.ts`), with provenance computed against
     each read's own spans. Where neither holds, the candidate cannot confirm on m, and (b) alone never
     confirms.
   - A family that adds trades on m is tested on (a) alone there.
   - When two confirmed candidates filter or replace the same shipped cell, the earlier freeze ships;
     within one freeze, the lower ordinal. Their combination may register only as rule 3 allows;
     otherwise it waits on Q4.

8. **Claims, reads, burns and frontiers.**
   - A freeze claims [C_s, C_s + L_m) on each named market and its correlated set's members when it
     lands. A claimed window stays sealed: every seal keys on F°_s.
   - The confirm sweep requests exactly the named markets. The read grades both arms, records them, and
     records each market's span on it and, flagged as propagated, on every member of its correlated set
     as the freeze line lists them.
   - A read refuses when its span starts before any named symbol's F_s as the freeze line recorded it;
     when it overlaps any recorded, claimed or burned span, or a live plan's fold spans, other than its
     own claim; or when its freeze, digest line or plan is not on `origin/main`. Nothing overrides a
     refusal. A match on corpus identity alone, against a line that records spans, is logged and
     proceeds; against a line that records none, it refuses. These refusals bind every ledgered read,
     registered or not; for an unregistered read, its freeze means its rule-9 plan, and F_s is taken as
     it stood when that plan landed.
   - A registration whose screen passed on m lapses there at the first UTC midnight at or after the
     later of F_m and its own landing plus 21 days (for a rule-12 family, the registry's landing), if no
     freeze naming m has landed before then. A freeze that lands moves F_m, and with it every other
     registration's lapse date on m. A lapse is recorded as a burn of that registration on m, derived
     from the registry's lines and the dates alone, so no pool waits on a registration nobody freezes.
   - A freeze with no recorded read by C_s + L_m + 14 days (JUDGED) on a market is burned there on that
     date, whether its read never ran or ran and refused, and any later read of it refuses. The burn is
     recorded on the market and its correlated set. Its draws stay spent. For eligibility a burn counts
     as a read: its registrations never freeze on that market again.

9. **Folded sweeps and the door.** A folded run is any replay-sweep run but `--warm-only` and
   `--discover`, which fold nothing.
   - The door withholds every fit or select row dated at or after F°_s from every reader, as it
     withholds every confirm row.
   - Before a folded run whose span ends after the F°_s of any of its symbols, a plan line lands on
     the registry on `origin/main`: source revision, argv hash, symbols, fold spans (none ending in the
     future), grid, analyzerVersion, `costModelHash`, and a planned completion no later than 14 days
     (JUDGED) after the plan lands. The driver refuses without it. After the run its manifestHash is
     appended, bound to the plan. A plan with no bound manifest by its planned completion is abandoned
     and burns the confirm span it planned, as rule 8 burns.
   - The driver refuses a folded run that places a fit or select decision at or after the earliest F°_s
     of its symbols.
   - The `confirmLogDir` option inside `grid-totalr` (which `confirm-4d` also reaches) and
     `replay-sweep --print-confirm-table` refuse any corpus whose confirm span reaches past F°_s.
   - A ledgered read that is not registered records the post-frontier spans of every fold it opens, not
     its confirm spans alone, until Q4 decides how such work registers.

10. **Population.** Every read passes on the full population and on every exclusion map in force from
    registration to read; an exclusion refuses and never admits, and a map added later never admits. A
    population exclusion never registers, ships or draws. This binds reads; a screen reads the months
    its registered map calls contained and prints its population. A freeze refuses when its month map
    leaves any part of a registration's screen fold outside fit. A filter that shrinks a loss while its
    kept rows stay unprofitable is refused, and the market goes to amendment 36's removal test. Act 3 is
    charged nothing. `maxCostShare` 0.15 stays; changing it waits on Q4.

11. **Printing.** Each market prints "draws S_m of 0.05 · c_m · draw". Beside the confirmed count the
    program prints the sum of draws and the confirmed candidates' summed confirm R, never as a pass:
    arming-bound R for candidates that add trades and Σd for leg-(b) candidates, each arm named.

12. **Pre-law registration (pending Q6).** Every spec that lands before the registry exists enters it
    when it is built, at its landing time and in landing order. For one that landed before the owner's
    ruling, carrying every field rule 3 requires, a screen run before the registry exists counts only if
    its screen line landed on `main` before any verdict was used, and recorded hashes of rule 4's text,
    the header's screen fields and the Label and Cluster definitions that equal the enacted ones;
    otherwise it cannot register, because its fit fold has been read. Its T for C_s is the registry's
    landing. Until the owner has ruled Q1–Q6 it draws nothing and opens nothing.

## Facts the rule rests on (code at `main` fea0a1d)

- `calendarFolds` (`scripts/sweepFolds.ts`) cuts one span 50/25/25 into fit, select and confirm, each
  fold's decisions ending an embargo before it closes. `calendarFoldsExcluding` places the same three
  shares by usable time and has no production caller; rule 1 uses its first two folds over an extended
  span.
- `assertEmbargoCoversReview` holds the longest review window plus a 24-hour resolution horizon inside
  the 5-day embargo.
- `replay-sweep` takes a span from `--fold-start`/`--fold-end`, from `--fold-spec` (one span per class)
  or from the union of the symbols' cached history; `--days` defaults to 60, anchored at the run date.
  No amendment pins a span's start, and no fold today takes a per-market span.
- The door seals rows labelled confirm (`SEALED_FOLD`) and nothing else. The ledger records confirm
  spans only, per symbol. So today a fit or select row dated after the frontier is readable by every
  reader, unledgered, and a 60-day sweep run on 2026-09-23 places decisions after it in select.
- A sweep's manifestHash covers its outputs (the emit digest, the rejections, the per-symbol
  decisions; `scripts/sweepManifest.ts`), so no manifest hash exists before a run.
- `conditionsOf` (`scripts/grid-totalr.ts`) includes `modeledCostScale` and `grossCostScale` and treats
  every value as legitimate; no reader refuses a scale other than 1 or 0. `GROSS_COST_SCALE` is a
  constant 0 in `executionQuality.ts`, so the gross scale moves only with the code, which the confirm
  sweep's source-revision equality binds.
- `grid-totalr`'s `confirmLogDir` files a confirm read in any directory, and one filed anywhere but the
  ledger directory or the next read's shard directories is invisible to that read's prior-read scan.
  `replay-sweep --print-confirm-table` prints confirm outcomes to stdout. Both are deliberate and
  documented; history-start spans keep them latent until 2027, and spans starting at a frontier would
  make them usable within weeks.

## Registry, lines and tests

`docs/research/family-registry/registry.json`, tracked, append-only and prevHash-chained, never under
`docs/research/confirm-reads/`. Header, pinned by hash, with Q1–Q6 all marked pending: the cap, 0.05;
the charge rule; burnFraction 0.8, JUDGED and open; the screen fields (multiplier
`tMultiplier95(clusters − 1)`, minClusters 30 JUDGED, the hashes of rule 4's text and of the Label and
Cluster definitions); the frontier and correlated-set rule; the fold, C_s and L rule, with the 21-day
T lag, JUDGED; the pre-law rule; the confirm rule's text and its hash; the two 14-day deadlines,
JUDGED. Lines: *registration* (ordinal, landing, registration commit, `costModelHash`, spec as stable
JSON, specHash, roster, prevHash); *screen* (rule 4); *plan* and *manifest* (rule 9); *freeze* (rule
2); *freeze-landed*; *digest* (rule 2); *confirm* (readId, and per candidate, market and arm the
clusters on each side, the multiplier, the (a) and (b) lower bounds, the sum of d and the verdict).

Tests:

- (a) Per market, the draws sum to 0.05 or less, and each equals 0.8(0.05 − S_m)/c_m, with c_m
  recomputed from the gradings, the freeze line and its declared C_s.
- (b) A registration draws on m only at a freeze that names m and opens its candidate there, and never
  while it has a read, a burned freeze, a lapse or a pending freeze on m.
- (c) Each screen multiplier equals `tMultiplier95(clusters − 1)`. The null draws, the lower bound and
  the verdict recompute from the specHash seed and the recorded decisions; each family floor recomputes
  from the recorded cost inputs under the registration commit's cost code; each B recomputes from the
  label under the header's cluster rule. Every registration's W and window exit fit the embargo.
- (d) The timed registration (from lines landed before the freeze), the pool, the named markets, each
  H_s (the pre-frontier manifest's 5-minute first time), density and L_m, and the declared C_s
  recompute from the registry, the class map, the pre-frontier manifest and the gradings. The freeze landed before C_s. Each confirm multiplier equals
  the t quantile at 1 − draw/2 at the one df rule, and verdicts recompute from the recorded cluster
  series on both arms at scale 1, and on gross for (b) where the profile is JUDGED. Every opened
  registration landed before its freeze, and C_s < readAt. For every named symbol, select ends at F_s,
  confirm starts at C_s, and no confirm span starts before F_s or overlaps a recorded, claimed or burned
  span. The confirm bars equal the digest line. Burns and lapses derive from the dates alone.
- (e) The chain is intact; ordinals rise by one in landing order; specHash matches; exact duplicates
  are refused; each landing time is the pull request's `mergedAt` and matches the first-parent commit;
  every artifact holding a family's decisions postdates its registration's landing; and the confirm
  shards postdate the registry commit.
- (f) Earlier draws and verdicts are pinned by value. The correlated sets are derived from
  `correlationGroups` and `getAssetType`, and the derivation's output is pinned.
- (g) The door withholds fit and select rows dated at or after F°_s, and every confirm row. A confirm
  read refuses on overlap with any recorded, claimed or burned span of any fold. A claimed window's rows
  stay sealed until its read. A market with no screen pass gets no candidate and no draw. The gross leg
  fires for `rewardRisk` and `executionScore`. Block fixtures: session and weekday labels get short
  blocks, slow drift gets a long block, and a COT-like label with a slow outcome regime gets NO
  VERDICT. A side with 29 clusters is NO VERDICT. A dropped side that is profitable but below the mean
  is refused. A later map never admits. Act 3's checks stand.

Mutations the tests must catch: a floor in R instead of the registered ATR; a thinner-side df; day
clusters where the recorded B is longer; a normal z where t is wider; an unpaired SE or a per-fill
delta; the net arm alone; a select fold ending after F_s; a freeze landing after its declared C_s; a
C_s taken from the freeze's landing instead of T; a timed registration that is not the lowest eligible
ordinal; a non-timed candidate that landed after its freeze; an L that does not recompute; ignoring
S_m; counting a registration without a candidate in c_m; spending a draw where none opened; a burn
that leaves a registration eligible; a registration left eligible after its lapse date; a read or burn that leaves a correlated member's frontier behind;
a member read after its set's recorded read; a seal keyed on F_s instead of F°_s; a filter opening with
its floor unmet; a screen, sweep or read at `modeledCostScale` ≠ 1 or `grossCostScale` ≠ 0; a screen under another
`costModelHash`; a window exit above 96 h; confirm bars that differ from the digest; sealing by label
only; the gross leg keyed on the five cost names; a spec edited in place; a changed burnFraction.

## Build, none of it written

The registry and its lines; a general t inverse; the paired cluster bound over every cluster either
side traded (`grid-totalr`'s `pairedP` is a sign-flip over shared days only and is not it); the label
block rule; a multi-candidate freeze and read; provenance against each read's own spans; one ledgered
read grading net and bound together (`grid-totalr` refuses `--r-arm` with `--confirm-final` today,
because the ledger records no arm); per-market fold spans, the pre-frontier sweep, the confirm sweep at
its fixed anchor with its digest line and refusals; the two frontiers and the correlated-set claims;
rule 9's door, plan and manifest lines and refusals; an overlap refusal with no override (the
acknowledgement flag lets one through today), the logged identity-only proceed and the
identity-without-spans refusal; the date-derived burns; scale-1 refusals in every reader; the confirm
rule's registered text; the screen's family input, its seeded null and its line. Nothing registers
until the registry is built; rule 12 covers specs that land before it.

## Why

- **Money ships at confirm, so multiplicity is paid there.** A draw that is never read cannot produce
  a false confirm. At three registrations with one unread, the two that are read draw 0.0133 each
  instead of 0.02: z 2.475 against 2.326, ×1.40 the n against ×1.28, power 0.63 against 0.68. This
  holds only because the draw is fixed before the window's prices exist.
- **The window's start is fixed early.** C_s follows the timed registration's landing by a fixed lag,
  and the freeze must land before it, declaring every choice it makes: the pool, the named markets, L,
  the frozen members and the draws. The operator cannot choose the window after seeing its prices, or
  time it by holding the freeze. A burn counts as a read, so letting a failing read burn buys nothing.
- **The floor in the statistic's unit.** The statistic is in ATR. Cost in ATR is cost in R ×
  riskDistance ÷ ATR, and 65 of the 80 `maxStopAtrMultiplier` values in `calibration.ts` allow a stop
  of 4 ATR, so mixing the units can err fourfold.
- **Both arms, at full cost.** Net arming credits same-bar exits at the lock level. The one-bar bound
  costs 0.0225–0.0261 R per fill in all eight forex cells (`docs/research/arming-bound-2026-09-14.md`
  §3), and 65 of the 72 `runnerProtection` stamps are trail_tp1. A scale below 1 would credit part of
  the modelled spread and slippage, worth +0.0157 to +0.0215 R per fill in full (amendment 43).
- **One cluster rule.** Cluster sums measure money; a per-fill figure rises when good trades grow
  rarer. A label that persists for weeks makes day clusters overstate independence; its B keeps the
  interval honest, and a read with long blocks needs many of them.
- **The per-market reading, priced.** At c = 1 each market read draws 0.04: at most 0.02 favourable
  false confirms per market at a first burn, reached only at net breakeven. A null family read on every
  market expects at most about 1.8 across the gate's 91 markets (1.9 across the 97-market roster),
  against the gate's 4.5.

Forex waits, on the round late-2030s base [verified in round 1: arithmetic; base unverified; a family's
own n sets its wait]. The right-hand column counts from F; a read whose window starts later adds the
gap.

| | history-start span | confirm from the frontier |
|---|---:|---:|
| uncharged | 11.35 y | 7.07 y |
| c = 1 | 13.27 y | 7.55 y |
| c = 2 | 19.23 y | 9.04 y |
| c = 3 | 22.69 y | 9.90 y |
| program-wide, 0.05/N over 126–235 cells | 52.3–57.5 y | 17.3–18.6 y |
| program-wide, 0.04/N, like-for-like | 54.2–59.3 y | 17.8–19.1 y |

Inputs: forex's fold-spec start 2009-09-25, F 2026-08-26T10:45Z, base end 2038-01-01, 365.25-day
years, 80 % power at 1.96. History-start waits are max(D/3, k(D + W) − D); confirm-from-frontier waits
are k(D + W)/4, with D = F − start, W the uncharged history-start wait and k the n multiplier. A read
capped at one year would have power 0.16 at c = 1 on this base, which is why a registration sets its
own maximum confirm length instead of the rule capping it.

## Open

1. **The burn fraction.** 0.8 was judged where burns fall at least 9.42 years apart on forex. With
   confirm starting after the frontier, a market can burn every 45 to 47 days at the minimum floor (35
   for a seven-day class). A second read then draws 0.008 at c = 1 (z 2.652; t 2.848 at df 29) and a
   third 0.0016 (z 3.156; t 3.482 at df 29). It stays at 0.8, JUDGED, until a refute round weighs a
   schedule that spends less on the first read.
2. **Amendment 46's premise** (Q5).
3. **Calibration programs and amendment-36 removals** (Q4). Until ruled, a calibration confirm read on
   m moves F_m and takes those dates from every registration on m; the frontier-start refusal, the
   overlap refusal and the plan requirement are what stop an unrecorded one.
4. **Authority** (Q1).
5. **Raw post-frontier reads stay unpoliceable.** The minute bank and the cache top-ups hold
   post-frontier prices and are read routinely: restore proofs, recoveries, probes. Once the desk
   reopens its live record shows every operator the shipped cells' post-frontier outcomes. Rules 1, 2
   and 8 keep every read's choices ahead of its window; they cannot stop a designer timing a
   registration's landing on what the recent tape shows, or remove a filter designer's view of a
   shipped cell's live results, and leg (b) against that cell is the case most exposed.
6. **Other shared paths.** Forex crosses share legs with the majors, and the four Treasury tenors sit
   on one curve. Whether a read on one moves the frontier of the others is JUDGED and open. Inside the
   correlated sets, Brent and the Russell move with their sets although they share no member's price
   path.
7. **Three results stay unverified:** the union bound on draws fixed before the read, the
   intersection-union size of legs (a) and (b) together, and the draw arithmetic's provenance in the
   family-count draft.

## For the owner

Each question carries a recommendation and its price. The recommendations to Q4–Q6 were written after
round 2, and the next refute round tests them with the rest.

- **Q1. Authority, by provenance.** Amendment 46 is headed "owner ruling"; the rulings record says
  amendments 43–46 were recorded under the standing approval, and 42's and 43's own bodies say so. May
  the standing approval amend 46, or only settle what it leaves open? *Recommendation:* only settle
  what it leaves open, which this draft assumes. Price: each of the five departures waits for your
  explicit ruling; no money moves either way.
- **Q2. Is the cap per market or program-wide?** Amendment 45 calls the per-market grain a floor, not a
  bar, and expects about 4.5 false families across 91 markets at the gate. *Recommendation:* per
  market. Price: a null family read on all 91 markets expects about 1.8 favourable false confirms at
  its first burns, against 4.5 at the gate and 0.02 under one cap. Program-wide and charged at the
  freeze, a freeze opening k candidates draws 0.04/k each (at k = 9, the size of act 3's freeze, z
  2.845, ×1.73 the n and power 0.48 at the base n), and every freeze after the first draws from 0.008:
  z 2.652 at k = 1, 3.324 at k = 9. Program-wide and charged at registration over 126–235 cells, forex
  waits 54–59 years on history-start spans, or 17.8–19.1 years with confirm from the frontier, against
  7.55 at c = 1.
- **Q3. When is a family charged?** At registration, as 46 reads, or only when a freeze opens its
  candidate? *Recommendation:* at the freeze. Price: charging at registration prevents no false confirm
  and dilutes the ones read; at three registrations with one unread, the two read draw 0.0133 each
  instead of 0.02 (z 2.475 against 2.326, power 0.63 against 0.68).
- **Q4. What else claims the cap?** Do conditioning filters, calibration programs and amendment-36
  removals? A filter departs from 46's family terms twice: its parent's pre-frontier rows are read
  before it registers, and it is not screened against the random-entry null. *Recommendation:* all
  three register and claim the same cap, one registration per program per market. A yes for programs
  needs three rule changes: a program kind in rule 3, a screen exemption for programs in rules 2 and 5
  and test (g) (the random-entry screen reads no stop, TP1, ladder or window, so it cannot see one),
  and confirm through legs (a) and (b) both against the cell it would replace. Price: a filter or
  program sharing a market with a family raises that family's fills from ×1.068 to ×1.279 the base
  (+19.7 %) when they open at one freeze, and to ×1.555 (+45.6 %) when the other reads the market
  first. Rules 8 and 9 bind their reads and sweeps from enactment.
- **Q5. The span rule.** Fit and select take each market's whole history before its frontier; confirm
  starts at the first UTC midnight at or after the later of the frontier and 21 days after the timed
  registration lands, and the freeze must land before that. Is that an honest way to buy a confirm
  read, and does its full-rate accrual change anything 46 decided? *Recommendation:* yes, honest: every
  choice a read makes lands before its window starts, and the full rate changes 46's timing, not its
  multiplicity rule. Price: the minimum read on a weekday market at a 30-cluster floor ends 45 to 47
  days after C_s (35 for a seven-day market), drawing 0.04 of the market's 0.05 at c = 1, where 0.8 was
  judged on burns 9.42 years apart (Open 1). The calendar from the frontier to C_s is lost as confirm
  calendar on those markets for good and can enter only fit or select: 35.55 days (36.25 for GFUSX,
  HEUSX and LEUSX) for a window starting 2026-10-01, and a day more for each day the first registration
  waits.
- **Q6. Pre-law registration.** May a family whose spec lands before your ruling, and whose screen runs
  only after that landing, enter the registry at its landing (rule 12)? *Recommendation:* yes, on rule
  12's conditions: its screen line landed on `main` before any verdict was used, under the screen texts
  you then enact unchanged. Price, yes: a screen verdict exists before the law fixes its threshold, and
  if you enact different screen text the family cannot enter at all. Price, no: every family screened
  before the ruling can never register, because its fit fold has been read. Confirm calendar is not at
  stake either way: C_s follows the registry's landing.
