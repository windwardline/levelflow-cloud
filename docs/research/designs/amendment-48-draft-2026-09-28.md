> **PARKED — not law.** Amendment 48's eighth pass, as closed after refute round 3. It applies the
> rulings of 2026-09-28 to the seventh pass: Q1 to Q7, OQ-1 to OQ-3 and the execution rule. The owner
> ruled them in his own message of 2026-09-28 by adopting the recommendations (For the owner; HANDOFF §2). It also folds in #702's depth advisory and the
> [2026-09-27 converge](/docs/research/converge-route-to-profit-2026-09-27.md)'s feed-check finding.
> The seventh pass closed
> [refute round 2](/docs/research/designs/amendment-48-refute-round-2-2026-09-24.md) on the fifth
> pass and the closure check on the sixth (same record).
> [Refute round 3](/docs/research/designs/amendment-48-refute-round-3-2026-09-28.md) attacked this
> pass as first written; every major it verified is closed here, and the minors it did not close are
> carried in Open. It replaces the section headed "Reconciled draft 2026-09-23" in
> [`amendment-46-parameters-2026-09-21.md`](/docs/research/designs/amendment-46-parameters-2026-09-21.md),
> which stays there unchanged as history. **This file is the whole draft**: no operative rule lives in
> the record it replaces. Every finding of rounds 1 to 3 and the closure check is closed or carried in
> Open, except two round-1 findings the record cannot recover. No registration is recorded, and no
> registry header is hashed, until the owner's confirmation lands with a citable source and a closure
> check on this text finds no surviving major.

# Amendment 48: registering, screening and confirming a new entry family (eighth pass, 2026-09-28)

## Authority

Amendment 46 is law. Every family is "registered and hashed before any fold is read, screened on the
fit fold against the random-entry null at a threshold fixed in advance, and charged against ONE
CAPPED TOTAL ALPHA", and 46 leaves open the effect floor, the reference price and whether a rising
family count raises the bar. The standing approval settles only what 46 does not state (Q1): the
screen's statistic and effect floor; that a rising count does not raise the screen's bar; the cap's
size (0.05 two-sided) and the draw split (its 0.8 is JUDGED and open, Open 1); clusters, degrees of
freedom, floors and arms. It recommends decision close as the reference price; each registration
hashes its own.

"Registered and hashed before any fold is read" is read as: before any of the family's own decisions
is computed on any fold, which is the screen design's "hashed into a registry before the read". Read
literally it would bar every family, since every fold has been read by some reader. A family designed
from a printed fit-fold result is screened on a fold its designer has seen, so its spec discloses what
was seen, and its pass weighs less.

Seven rules depart from 46, or reach past it. The owner ruled them on 2026-09-28 in his own message,
adopting in each case the recommendation that best fits the stated goal, an open desk earning net
realized R as soon as honestly possible. Q1 rules departures 2 to 6, Q2 the first and Q7 the seventh,
and none rests on the standing approval.

1. **The per-market cap** (Q2). 46 charges every family against "ONE CAPPED TOTAL ALPHA shared by
   every family"; here each market carries its own cap of 0.05 (rule 6).
2. **Charge at the freeze** (Q3). 46 charges every registered family.
3. **Filters, programs and removals register** (Q4). None takes 46's family terms: the pre-frontier
   rows of a filter's parent, a program's cell and a removal's cell are read before it registers, and
   none is screened against the random-entry null (a filter takes its own screen, rule 4).
4. **The span rule** (Q5). 46 rests its timing on confirm accruing at a quarter of the rate calendar
   accrues; rules 1 and 2 buy confirm at the full rate.
5. **Pre-law registration** (Q6, rule 12).
6. **Unregistered work.** Rules 8 and 9 bind every ledgered read and every folded sweep past a
   frontier, registered or not.
7. **Pooled confirm** (Q7). 46 takes a screened family's verdict at the per-market grain, applying
   amendment 45, and 45 ships a calibration change on a per-market verdict and refuses a class-grain
   verdict read with per-market signs. Here a family, including one that replaces a shipped cell's
   trades, confirms on one money test pooled across its named markets, and each market ships only on
   its own positive point estimates (rule 7). That departs from 46 and from 45 alike, as the converge
   that priced Q7 said. The screen stays per market. A filter, program or removal names one market,
   so 45 stands for them.

The rulings also cover the execution rule and OQ-1 to OQ-3 (Terms; rules 3 and 7). They reach
amendment 39's structural clause (OQ-1: a registered family may sit outside the payoff floors, and
39's manufacturing ban binds), the Guide's order types (amendment 34) and the shipped engine's grading
(Open 9), not 46.

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
  LEUSX. A symbol no span names takes 2026-08-26T10:45Z. Every fold and every seal keys on F°_s, so a
  claimed window stays sealed until its read.
- **Frontier F_s.** The later of F°_s and the end of any pending claim on s or its set. Eligibility,
  the pool and C_s key on F_s. A read's own F_s is its value just before its freeze lands, excluding
  its own claim, and the freeze line records it per market. Amendment 46's rule sentence, "a new
  entry family buys a confirm read only with dates no recorded read has seen", is read as: dates at or
  after F_s.
- **Landed.** When a pull request merged into `main`, as GitHub records its `mergedAt`, cross-checked
  against the first-parent commit on `main`. Git's author and committer dates are set by the client and
  are never used. A spec lands in a pull request of its own, one spec per pull request, and that
  first-parent commit is its **registration commit**. The registry's job (rule 2) then appends its
  registration line, recording the commit and the `costModelHash` computed at it, outside the
  specHash. Registration lines are appended in `mergedAt` order and the appender refuses while any
  earlier-merged spec lacks its line. Every date this rule keys on a registration's landing is its
  spec's `mergedAt`.
- **Confirm start C_s.** The first UTC midnight at or after the latest of three instants: F_s; T + 21
  days (JUDGED), where T is the timed registration's landing (for a rule-12 spec, the registry's own
  landing); and the freeze's scheduled date D + 7 days (rule 2). The freeze line declares C_s and must
  land before it; a later landing refuses, and the registration that set D lapses (rule 8). So the
  window's start is fixed by a landing the operator made and by dates the registry derives, not by
  when anyone files the freeze.
- **History start H_s.** The first bar of market s's pinned 5-minute series as the pre-frontier sweep
  loads it, at full depth (`--days max`, which the manifest records as `days`, equal to
  `MAX_DEPTH_DAYS` at the freeze's source revision: 7,000 at c00ebcb; rule 2 refuses any other) and
  the freeze's anchor, before it cuts any fold (amendment 33: per market, to each market's true data
  limit; the 5-minute series is the one the screen measures on, and it is shallower than the 15-minute
  one for most symbols). The sweep's manifest records it as that series' first time, the freeze line
  carries the manifest's hash and its `days` by value, and test (d) recomputes the folds from that
  record.
- **Registration.** One hypothesis, a canonical spec that has landed on `main` (rule 3).
  Registrations take ordinals in landing order, strictly increasing by one. The registry's other lines
  (screen, plan, manifest, digest, vintage, freeze, freeze-landed, confirm) take none; a burn or a
  lapse is derived from dates, not written.
- **Label.** What a registration decides at each decision slot: for a family, +1 long, −1 short and 0
  no decision; for a filter, 1 keep and 0 drop; for a program, its candidate cell's side, as a
  family's; for a removal, the side of the cell it removes.
- **Common span.** For an opened registration, the calendar within its fit and select folds on which
  every market it opens on has usable time under its month map. Its read's B, its density for L and
  its multiplier's calibration are all taken over it.
- **Cluster.** A block of B UTC days counted from the Unix epoch; at B = 1, the UTC decision day,
  `Math.floor(time / DAY_MS)` of each row's decision time. Clusters are taken over a family's
  decisions at its screen, over a filter's parent rows at its screen, and over filled rows at
  confirm. The **holding floor** is 1 day where the registration's longest hold as executed (the later
  of W and its window exit, each executed as the execution rule says) is at most 24 hours, and
  otherwise 2h days, h being that hold in days rounded up: decisions that share a price path are never
  counted as independent clusters.
  - *The label ladder.* B is the shortest length on the ladder 1, 2, 3, 4, 5, 6, 7, 8, 14, 28, 56, 91,
    182, 364, 728 days that is at least the holding floor and at which, and at every longer length
    leaving at least 10 blocks, the lag-one autocorrelation of the label's block means lies within
    max(0.2, 2/√blocks) (both JUDGED). A length at which the block means have no variance counts as
    within the bound, so a constant label takes the holding floor. At the screen B is computed this way
    on the label alone, per market; no qualifying length is NO VERDICT on that market.
  - *The read's B.* At the freeze each opened registration takes one B for its read, the larger of two
    lengths computed over its common span on the pooled pre-frontier per-cluster series of the markets
    it opens on (a program's for its frozen member): the label ladder on the summed label; and the
    shortest ladder length, at least the holding floor, at which, for summed R on each arm and for
    summed d where leg (b) reads, the variance of the block sums at every longer ladder length up to 28
    days is at most 1.25 times (JUDGED) what independent blocks at the shorter length predict, both
    measured within calendar years. A single-market read applies both to its own
    series. A market's own label B does not lengthen the read. With no qualifying length, the
    registration does not open.
  - *The interval.* Every clustered interval, at screen and at confirm, takes as its variance the
    cluster sums' sample variance plus twice their lag-one autocovariance over calendar-adjacent
    clusters where that is positive.
  - B is recorded, recomputed by tests (c) and (d), and fixed for confirm. The Label and Cluster
    definitions are hashed into the header's screen fields.
- **Execution.** Native orders only, on the platform the market's E8 program uses: TradeLocker and
  MatchTrader, which the ruling names, and Tradovate, E8's only futures platform, read here as the
  futures case of the same rule (For the owner). No automatic stop move at TP1 and no EA (ruling of
  2026-09-28). An order resting at the venue fills where it triggers. An action the desk instructs at
  an instant t, after an event or at a time, is graded as executed at the close of the first 5-minute
  bar that opens at or after t: five minutes after t in continuous data, and five minutes after the
  reopen when t falls in a halt, a holiday or a data gap. Latency counts elapsed time, never an array
  index. That covers the entry placed after its decision (t is the decision time, and the order rests
  from its execution), a timed close (OQ-3), the review-end close and the cancel of an unfilled entry
  at the review end on every arm, and the stop moved after TP1 on the arming-bound arm.
  - A close prints at the execution bar's close ∓ half the modelled spread ∓ the modelled exit
    slippage. A marketable limit (OQ-2) fills at the far side of the execution bar's close plus the
    modelled entry slippage, capped at its limit; where that far side is already beyond its limit, the
    order rests as a limit from there. These prints carry spread and slippage on the net and
    arming-bound arms; the gross arm carries E8's commission alone, as its definition says.
  - Every instructed close at a time, the review end and a family's timed exit alike, is clamped as the
    review expiry is today, to 5 minutes before the market's upcoming weekly close, so it executes at
    the week's last close.
  - The header records this text and its hash.
- **Arms.** The three R columns of `ARM_COLUMNS` in `scripts/sweepStats.ts`: net (zero-latency
  arming), arming-bound (protection arms one bar late, at net cost) and gross (E8's commission, no
  modelled spread or slippage). Every arm is graded at `modeledCostScale` 1 and `grossCostScale` 0
  (the gross arm's definition; `GROSS_COST_SCALE` in `executionQuality.ts`). The arming-bound arm is
  every registration's arm of record: it grades the stop the operator moves after TP1 as the execution
  rule does, and net grades a same-bar lock no native order places. A family whose money needs an
  automatic lock cannot register on the net arm. Every verdict here holds on net and arming-bound both,
  so net money alone never opens, confirms or ships anything.

## The rule

1. **Folds.** A registered read on symbol s uses three folds. Fit and select split the usable time of
   [H_s, F°_s) under the registration's hashed month map two to one, fit first, and select ends at the
   last usable instant at or before F°_s. Confirm is [C_s, C_s + L), one window for every named market
   (rule 2). The interval [F°_s, F_s), which pending claims hold, belongs to no fold of this read; the
   interval [F_s, C_s) belongs to no fold and can never be confirm calendar again. Each fold's
   decisions end 5 days before it closes, and rule 3 refuses a W or a window exit that does not fit, so
   every fit and select row resolves before F°_s.

2. **The read, its freeze, and L.** A read covers one asset class. Its pool is every roster symbol of
   that class sharing F_s.
   - **The schedule.** The registry's scheduled job, running from `origin/main`, lands every line a
     read depends on: screens, plans, the pre-frontier sweep, freezes, freeze-landed lines, digests,
     the vintage record and confirm reads. An operator lands specs and nothing else. The job lands each
     family's or filter's screen line at its registration's landing + 7 days. A registration is
     **ready** on a pool market m when its screen line has landed with a pass on m (a program or
     removal: from its landing), it has no read, burn, lapse or pending freeze on m, and no freeze has
     declined it on m, for any reason but its landing date, since m's F°_s last moved. The pool's freeze
     is scheduled for D, the latest of T_r + 14 days, F_s − 7 days and the day r's turn began (the later
     of its ready date and the day the pool's previous freeze landed or lapse fired), where r is the
     lowest-ordinal registration ready on some pool market (the offsets JUDGED). At D the job runs the
     pre-frontier sweep and lands the freeze line, which names no market when nothing opens.
   - **The pre-frontier sweep** covers the pool, fit and select only, at full depth (`--days max`) and
     `modeledCostScale` 1, under a plan line of its own (rule 9), and the freeze cites the one manifest
     bound to that plan. The sweep refuses any other depth. A freeze refuses a pre-frontier manifest
     whose `days` differs from `MAX_DEPTH_DAYS` at the freeze's source revision, or in which any named
     market's H_s lies within 7 days of the anchor minus `days`, since the ceiling would then bind short
     of that market's true limit (amendment 33). Its analyzerVersion is the header's execution version
     (the first in `PLACED_ENGINE_VERSIONS` whose engine implements the execution rule) or one placed
     after it, and it pins the read's engine: analyzerVersion, `costModelHash` and source revision.
   - **The timed registration** is the lowest ordinal among registrations that open on at least one
     pool market under every rule-5 condition decidable before the window, with an L at their own C_s
     within their maximum confirm length. Only lines that landed before the freeze count.
   - The read names exactly the pool markets on which the timed registration opens. A family whose
     roster spans classes is read once per class, each read its own pooled test and its own draw
     (Open 13).
   - **L** is the shortest whole number of days above 5 at which the timed registration's projected
     traded clusters over [C_s, C_s + L − 5 d) meet its readiness floor at its read's B, on every side a
     leg needs, within its hashed maximum confirm length. The projection is the traded share of the
     common span's blocks, applied to the interval's blocks, a partial block at either edge counting in
     proportion to its days; confirm counts every block that holds a trade. The candidate side counts
     a block where any opened market traded. On the cell side of a filter or replacement, and for a
     removal, whose own side trades nothing, the removed or replaced cells' traded blocks are projected
     the same way. A market with no pre-frontier traded cluster on a side its legs need leaves the read.
   - **The freeze line** is the whole freeze. It lists, once: the pool; the named markets and their
     hash; the timed registration; the scheduled date D; per market F_s, F°_s, H_s, S_m, c_m and the
     pre-frontier manifest's 5-minute feed baseline (`rangeRatio`, `barRangeRatio`) by value; the
     declared C_s and L; per opened registration its markets, each one's frozen member and fit and
     select point estimates on both arms and both populations, its common span, its B and each part
     of it, its projected density, readiness floor, draw and projected power at that draw (a print,
     not a condition); the pre-frontier plan line, manifestHash, source revision, analyzerVersion,
     `costModelHash`, fold-spec hash, month map and anchor, its `days` by value and its
     `modeledCostScale`; per market the resolved calibration by value (`calibrationHash`) of every
     geometry a candidate trades; each correlated set's members; and each ready registration it did
     not open, with its reason. Openings, c_m and the draws are computed against the declared C_s and
     L, so none depends on when the line lands. The freeze-landed line records the landing, checks it
     precedes C_s, and its pull request adds the read's anchor to `PROTECTED_ANCHORS`; the read's or the
     burn's removes it.
   - **The confirm sweep** covers [C_s, C_s + L) on each named market and nothing else, warmed on bars
     before C_s, which is decision-time history, not outcome. It reads the canonical cache at the
     anchor that is the first UTC day at or after C_s + L + 4 days, after the top-up's three-day
     overlap has settled, with no cache override and no refetch of the window. It refuses unless its
     analyzerVersion, `costModelHash`, source revision, `modeledCostScale` 1, `grossCostScale` 0 and
     `conditionsOf` equal the freeze's; `conditionsOf` is compared in frozen mode, which drops the grid
     (the pre-frontier sweep ran the grid, the confirm sweep runs frozen members), and carries `days`,
     so the confirm sweep too runs at full depth.
   - **The digest line** lands before any confirm row is computed. It holds, for every series the
     confirm sweep loads (each named market's 5-minute, 15-minute and daily stores, each forex cross's
     USD-leg daily store, `treasury-rates` and `econ-calendar`), the sha256 of exactly the items the
     sweep reads, with their count and first and last times, and each named market's feed check (rule
     7). The read refuses a series the digest does not hold or whose items differ from it.
   - **The vintage record.** From the freeze's landing until its read or burn, the job records each UTC
     day, per named market and per bar series the confirm sweep loads, the sha256 of that day's bars
     from the start of the sweep's warm-up, once they are older than the top-up's overlap
     (`TOP_UP_OVERLAP_MS`, three days). Each record is a write-once object in the locked archive
     bucket, uploaded by a job under `scripts/ops/`, and the bucket records its upload time. The read
     refuses any bar whose bytes differ from its first record, and any settled day whose record was
     uploaded more than 2 days (JUDGED) after the day settled. A rebuild or a refetch after the window
     therefore cannot choose its vintage. The calendar and the curve are bound by the digest alone.

3. **Registration.** A canonical spec that lands on `main` before its freeze and, for a family, before
   any of its decisions is computed on any fold. Its hash covers:
   - kind (family, filter, program or removal) and roster. A filter, program or removal names one
     market: one registration per program per market (Q4);
   - for a family: side rule, clock, W, reference price (decision close recommended; a reference dated
     before the decision refuses), and the statistic's ATR (primary or daily, named);
   - for every kind: `modeledCostScale` 1, `grossCostScale` 0, and the cost-model closure that the
     registry line's `costModelHash` pins: the transitive runtime import closure of `pricePlan.ts`,
     `estimateExecutionQuality` and `venueCommissionRoundTripPrice`, files in sorted path order, raw
     bytes (#408 changed `estimatedRoundTripCost` without a version bump, and the commission reads
     `futures.ts` and `symbols.ts`, so neither the version nor two files pin it). A registration pins
     no engine; the freeze does (rule 2);
   - for every kind: a month map (the feed witness table's sha256 and tier at the registration commit);
   - for a family: its exit geometry, or, per market, the identity of the shipped cell whose geometry
     it trades. Its own geometry is the ladder's (order type, entry, stop rule, TP1, runner protection
     and window exit) or one outside the ladder's payoff floors (`minRewardRisk`,
     `minimumTargetRewardRisk`, `window_cannot_carry_payoff`): a timed exit, a catastrophe stop, no
     target (OQ-1), entered by a resting or a marketable limit (OQ-2). Every level is set from market
     structure, window feasibility or the effect's own horizon, and amendment 39's ban binds: no level
     is set, widened or tightened to improve a printed ratio. Every action it needs after an event or at
     a time is instructed and graded under the execution rule. Per market, the resolved calibration by
     value governs its trades (a freeze refuses when the freeze-time values for a geometry it trades
     differ); and, per market, it states whether it adds trades or replaces the shipped cell's
     (replacing is barred where no cell ships);
   - for a filter: its parent, a shipped cell; a field from `DERIVED_FIELDS`; an op; and the gate's two
     formulas, `decisionHourDistance` and `costShare`. A filter on an unshipped family is barred: a
     rule that conditions a new family is part of that family's registration. A combination registers
     as a filter only when it is one field and one op;
   - for a program: the shipped cell it would replace and the parameters it changes, each set as
     amendments 33 and 39 require;
   - for a removal: the shipped cell it removes, under amendment 36, and the modelling alternatives it
     must survive: the cell without each cap or gate it applies (`maxCostShare` among them), at least
     one shorter and one longer review window each feasible under amendment 39, and the gross arm for
     the modelled costs. A removal whose list leaves out a cap or gate the cell applies refuses;
   - for every kind but a removal: the finite grid the freeze chooses from and its freeze rule, which
     yields at most one candidate per market from fit and select and, where it chooses on R, chooses on
     the arming-bound arm or on both, never on net alone. A family's grid may hold only parameters that
     leave its label unchanged; a filter's grid is its value grid, each value screened as its own
     member; a program's B is computed on its frozen member;
   - for a family or filter: the fit fold it is screened on, from `fold-spec-2026-08-26` or rule 1's
     spec at its F°_s, wholly before every F°_s it names and ending before rule 1's fit/select boundary
     under its month map;
   - for every kind: a readiness floor, the fewest pooled confirm clusters it will be read on, at least
     30; a maximum confirm length; the cluster rule, which must equal the header's; and a disclosure of
     every fit-fold result (for a filter, program or removal, every pre-frontier result) on its markets
     its designer has seen.

   A registration refuses unless W + 24 h and the window exit as executed + 24 h each fit inside the
   5-day embargo; the driver passes each registration's windows as executed (a family's W and exit, a
   program's changed review window) to `assertEmbargoCoversReview`. The 24-hour horizon absorbs a daily
   halt or a one-day closure; a sweep refuses, naming the row, any fit or select row whose executed
   close lands at or after its fold's end. A filter, program or removal may read its cell's
   pre-frontier rows before it registers.

4. **Screen.** A program or removal takes no screen (Q4): the random-entry screen reads no stop, TP1,
   ladder or window, so it cannot see one. The job computes and lands every screen (rule 2).
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
   - A screen refuses when its `costModelHash` differs from the registration's; when it grades R (a
     filter's) under an analyzerVersion before the execution version; when its `modeledCostScale` is
     not 1 or its `grossCostScale` not 0; when a series it reads was loaded at a `days` other than
     `MAX_DEPTH_DAYS`; or when any artifact holding the family's decisions (a decision emit's manifest,
     or the screen's own record where it computes them) does not postdate the registration's landing.
     The fit fold's corpus may predate it. Each registration, member and market is screened once.
   - The screen line records the screen's source revision, the analyzerVersion, `costModelHash`,
     `modeledCostScale`, `days`, the header's screen-field hash, the manifestHash, the month map's hash,
     per market the H_s it used and the fit fold's span, each screened decision's cost inputs (atr,
     dailyAtr, latestClose, entry, stop, target, quotedSpread, tickSize, usdPerQuote), and, per market
     and member, the floor, clusters, B, multiplier, lower bound and verdict. A screen is judged only
     against the floor this rule derives from its registration's hashed inputs, and no recorded verdict
     moves.

5. **Opening.** At a freeze a registration opens on a named market m only where all of these hold:
   - it landed at least 21 days before the declared C_s (a rule-12 spec: the registry did);
   - its screen passed on m (a filter: its frozen member's did; a program or removal takes none), and,
     where the freeze's `costModelHash` differs from the registration's, the screen's lower bound also
     clears the floor recomputed from its recorded cost inputs under the freeze's cost code;
   - its freeze rule yields a candidate there from the pre-frontier folds (a removal's candidate is the
     removal);
   - the candidate's summed R on m, and its sum of d against the cell where it filters or replaces
     one, is positive on fit and on select, on both arms, on the full population and on the one its
     month map calls contained (Q7's point floor, read where it can be read before the window; for a
     removal, its sum of d alone);
   - (a) is readable on m (rule 7), unless it is a removal;
   - its month map's hash equals the timed registration's; and
   - it has no read, burn, lapse or pending freeze on m.

   It opens on every such market together, and only if its read's B qualifies and the declared confirm
   span meets its readiness floor at that B on every side a leg needs, pooled over them, within its
   maximum confirm length. Every registration meeting all of them opens; one that does not draws
   nothing and keeps its claim. A registration whose read falls short of its readiness floor takes NO
   VERDICT on every market it opened, and its draw stays spent.

6. **Draws.** Each market has a two-sided cap of 0.05 over the calendar after 2026-08-26T10:45Z, in
   total (per market, Q2). At each freeze naming m, c_m is the number of registrations it opens on m.
   A registration opened on the markets M takes one draw, the least over m in M of
   0.8 × (0.05 − S_m) / c_m, where S_m sums the draws earlier freezes and lapses charged to m. Its one
   confirm test (rule 7) runs at that draw, and the draw is charged in full to every market in M, so
   the test's size never exceeds any named market's remaining share. That bounds a market's false
   ships only where the registration is null on every market it names (Why). A lapse is charged as
   rule 8 states. The 0.8 is JUDGED and open (Open 1). c_m, M and every draw are fixed in the freeze
   line against its declared C_s, before it lands. No recorded draw, multiplier or verdict moves. The
   draw is fixed before the window's prices exist, and a read left to burn keeps its draw spent on
   every market it named.

7. **Confirm.** One money test per opened registration, pooled across the markets it opened on (Q7):
   per cluster, realized R summed over those markets, on the net and arming-bound arms both, at
   `modeledCostScale` 1 and `grossCostScale` 0, at its read's B (Terms). A missing column is NO VERDICT.
   A filter, program or removal opens on one market, so its test is that market's.
   - (a) The mean of the summed candidate R over the pooled traded clusters (those in which any of its
     markets traded) has its lower bound above 0, with df = those clusters − 1.
   - (b) Over the markets where the candidate filters, replaces or removes a shipped cell's trades (a
     filter, program or removal always does, against its cell): per cluster, d = the candidate's R minus
     the cell's, summed over those markets, over every cluster either side traded, with 0 for an idle
     side. The mean of d has its lower bound above 0, with df = those clusters − 1. The sum of d is the
     money delta amendment 39 names. Under a JUDGED cost profile (amendment 43), (b) also holds on
     gross. Markets where a family adds trades enter (a) and not (b).
   - Each leg needs the registration's readiness floor in pooled traded clusters, on each side for (b)
     (for a removal, on the cell's side), else NO VERDICT.
   - **The multiplier** for a leg and arm (for a removal, and alternative) is the larger of the t
     quantile at 1 − draw/2 for that df and a calibrated quantile. Cut the common span's pooled
     per-cluster series of that leg and arm, in time order, into stretches of 250 clusters, the
     remainder joining the last (under 500 clusters, one stretch). For each stretch, demeaned to zero,
     take the 1 − draw/2 quantile of the mean of df + 1 clusters resampled with replacement,
     studentized as the read is (the lag-one term in resample order), over 10^6 resamples seeded from
     the specHash (JUDGED); the calibrated quantile is the largest over stretches. It reads
     pre-frontier outcomes only, which the freeze has already read. The t quantile alone runs above its
     draw on ladder-shaped R (Why).
   - A registration confirms when (a) holds and, where any market enters (b), (b) holds. (b) alone never
     confirms, except for a removal: it trades nothing, so it confirms on (b) alone against the cell it
     removes, on net, arming-bound and gross, and under every modelling alternative its spec lists (rule
     3), each at the one draw's multiplier. Requiring every one of them to hold keeps the test's size at
     its draw. That is how a removal meets amendment 36 here: the negative must survive the removal of
     our own modelling choices, the window and the caps as well as the modelled costs (Open 8).
   - **Ship.** A confirmed registration ships on m only where m's own money is positive on each of
     fit, select and confirm, on both arms and both populations (Q7): its summed R, and its sum of d
     where m enters (b); for a removal, its sum of d alone. It ships only once the desk instructs every
     action its grading assumes and the Guide describes it (amendments 34 and 42). A market that fails
     is read, and does not ship.
   - **The window's feed.** The digest line records each named market's feed check over
     [C_s, C_s + L), 5-minute tier, computed from the window's own days (no bar before C_s or at or
     after C_s + L) against that market's store baseline as the freeze line pinned it: the witness's
     three clauses (`dailyContainment`) judged on each window month holding at least 15 judged days,
     and on the window span whole. It fails closed. A window month whose unjudged share of the days
     carrying at least 20 intraday bars exceeds 20 % (JUDGED) escapes, and so does a window span with
     fewer than 15 judged days. The escaping months, or the whole window where its span escapes, are an
     exclusion under rule 10. The contained population drops each escaping market-month's rows from
     the per-cluster sums and keeps a cluster where any contained market traded. Every leg and every
     point estimate must hold on the full window and on the contained population. A population short
     of the readiness floor is NO VERDICT on every named market, its draw spent and its frontier moved.
     A market with no contained traded cluster cannot ship on this read.
   - (a) is readable on m where m has no shipped cell, or where its shipped cell is held back from this
     read's spans (`ADMISSIBILITY_RULE`, `scripts/ledgeredRead.ts`), with provenance computed against
     each read's own spans. Where it is not, only a removal opens on m (rule 5).
   - When two confirmed registrations filter, replace or remove the same shipped cell, the earlier
     freeze ships; within one freeze, the lower ordinal. Their combination registers as a filter when it
     is one field and one op, and otherwise as a program (rule 3).

8. **Claims, reads, burns, lapses and frontiers.**
   - A freeze claims [C_s, C_s + L) on each named market and its correlated set's members when it
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
   - **Lapses.** A registration lapses where the job's line did not land by its date: a screen line
     not landed by its registration's landing + 14 days (JUDGED) lapses it on every market its roster
     names; a freeze not landed by its C_s (where no freeze line declared one, the C_s computed with
     T_r for T) lapses the registration r that set its date D on every pool market it was ready on. A
     lapse is recorded as a burn of that registration on those markets, derived from the registry's
     lines and the dates alone, and charged as a read: the draw it would have taken alone, the least
     over those markets of 0.8 × (0.05 − S_m), charged to each. A freeze that does not land therefore
     buys nothing, and no pool waits on it. A registration waiting on a market does not lapse there.
   - A freeze with no recorded read by C_s + L + 14 days (JUDGED) is burned on every market it names on
     that date, whether its read never ran or ran and refused, and any later read of it refuses. The
     burn is recorded on those markets and their correlated sets. Its draws stay spent on every market
     they were charged to. For eligibility a burn counts as a read: its registrations never freeze on
     those markets again.

9. **Folded sweeps and the door.** A folded run is any replay-sweep run but `--warm-only` and
   `--discover`, which fold nothing.
   - The door withholds every fit or select row dated at or after F°_s from every reader, as it
     withholds every confirm row.
   - Before a folded run whose span ends after the F°_s of any of its symbols, and before every
     pre-frontier sweep, a plan line lands on the registry on `origin/main`: source revision, argv hash,
     symbols, fold spans (none ending in the future), grid, analyzerVersion, `costModelHash`, and a
     planned completion no later than 14 days (JUDGED) after the plan lands. The driver refuses without
     it. After the run its manifestHash is appended, bound to the plan. A plan with no bound manifest by
     its planned completion is abandoned and burns the confirm span it planned, as rule 8 burns.
   - The driver refuses a folded run that places a fit or select decision at or after the earliest F°_s
     of its symbols.
   - The `confirmLogDir` option inside `grid-totalr` (which `confirm-4d` also reaches) and
     `replay-sweep --print-confirm-table` refuse any corpus whose confirm span reaches past F°_s.
   - A ledgered read that is not registered ships nothing (Q4: a filter, a calibration program and a
     removal register), and records the post-frontier spans of every fold it opens, not its confirm
     spans alone.

10. **Population.** Every read passes on the full population and on every exclusion map in force from
    registration to read; an exclusion refuses and never admits, and a map added later never admits. A
    population exclusion never registers, ships or draws. This binds reads; a screen reads the months
    its registered map calls contained and prints its population, and a confirm read's own feed check
    (rule 7) is an exclusion in force. A freeze refuses when its month map, or its H_s, leaves any part
    of a registration's screen fold outside fit. A filter that shrinks a loss while its kept rows stay
    unprofitable is refused, and the market goes to amendment 36's removal test, which registers as a
    removal (rule 3). Act 3 is charged nothing. `maxCostShare` 0.15 stays; changing it is a program
    (rule 3).

11. **Printing.** Each market prints "draws S_m of 0.05 · c_m · draw", the draw its registration's one
    draw, with lapses in S_m. Beside the confirmed count the program prints the sum of the
    registrations' draws and the confirmed registrations' confirm R, pooled and per shipped market,
    never as a pass: arming-bound R, the arm of record, where they add trades and Σd where leg (b)
    reads, each arm named. A market shipped on a pooled confirm prints "shipped on the family's pooled
    confirm" beside its own confirm R. A market a confirmed registration named and did not ship prints
    beside it with its reason: a point estimate, or its window's feed.

12. **Pre-law registration** (Q6, ruled yes on these conditions). Every spec that lands before the
    registry exists enters it when it is built, at its landing time and in landing order. For one
    carrying every field rule 3 requires, a screen run before the registry exists counts only if its
    screen line landed on `main` before any other commit on `main` cited its manifestHash or verdict,
    and recorded hashes of rule 4's text, the header's screen fields and the Label and Cluster
    definitions that equal the enacted ones (each hash as the header defines it); a pre-law screen that
    grades R counts only at or after the execution version. Otherwise it cannot register, because its
    fit fold has been read. A pre-law spec with no screen run is screened by the job at the registry's
    landing + 7 days. Its T for C_s is the registry's landing. Until this text is law it draws nothing
    and opens nothing. The rule reaches specs landing after the rulings of 2026-09-28 and before the
    registry exists (Open 21).

## Facts the rule rests on (code at `main` c00ebcb)

The seventh pass verified the first seven at fea0a1d. Of the files they cite, only `replay-sweep.ts`
has changed since, in its usage comment and its preflight.

- `calendarFolds` (`scripts/sweepFolds.ts`) cuts one span 50/25/25 into fit, select and confirm, each
  fold's decisions ending an embargo before it closes. `calendarFoldsExcluding` places the same three
  shares by usable time and has no production caller; rule 1 splits by the same usable-time measure,
  two to one, over [H_s, F°_s).
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
  every value as legitimate; no reader refuses a scale other than 1 or 0. It drops the grid only in
  frozen mode. `GROSS_COST_SCALE` is a constant 0 in `executionQuality.ts`, so the gross scale moves
  only with the code, which the confirm sweep's source-revision equality binds.
- `grid-totalr`'s `confirmLogDir` files a confirm read in any directory, and one filed anywhere but the
  ledger directory or the next read's shard directories is invisible to that read's prior-read scan.
  `replay-sweep --print-confirm-table` prints confirm outcomes to stdout. Both are deliberate and
  documented; history-start spans keep them latent until 2027, and spans starting at a frontier would
  make them usable within weeks.
- `--days max` resolves to `MAX_DEPTH_DAYS`, 7,000 days (`intradayChunks.ts`, where it is a safety
  ceiling that "must never be the binding constraint"), the depth the cache's stores are keyed at
  (`feed-character.ts` reads `<symbol>-<tier>-7000`); any other value keys the sweep's stores by that
  value (`<symbol>-5min-<days>`). `days` sits in the manifest's hashed payload and in `conditionsOf`, so
  the shard loop refuses a mixture of depths, but no reader refuses a value: a 60-day pre-frontier
  sweep hashes and agrees end to end, with H_s about 60 days before F_s.
- Every sweep's manifest records `feedCharacter` per symbol: the witness (`dailyContainment`,
  `scripts/feedCharacter.ts`) on both intraday tiers against the daily series the sweep loaded, per
  year and per month. A day is judged only with a daily bar of positive range and at least 20 intraday
  bars; a month names itself only at 15 judged days. The verdict runs against the store's own baseline,
  the median of the per-year medians over the whole loaded series, which the manifest records as
  `baseline`. The sweep refuses nothing on it. The 2026-09-24 corpus's manifest flags 123 market-months
  on 35 markets from 2025-01, 50 of them on bar-range drift alone. Of its 24 forex pair-months, two
  break daily containment, NZDCHF 2025-05 at a median range ratio of 1.048 and AUDCHF 2025-03 at 1.032;
  the other 22 sit at 1.0017 or below.
- At `days` 7,000 a sweep loads each store whole up to its pin (`loadRollingSeries`), and also each
  forex cross's USD-leg daily store, `treasury-rates` and `econ-calendar`. A fresher fetch replaces a
  stored bar (`mergeByTime`); a pin fixes a cutoff, not bar values; a store keeps five pins
  (`PINS_KEPT`) unless its anchor is in `PROTECTED_ANCHORS`; a top-up refetches a three-day overlap
  (`TOP_UP_OVERLAP_MS`).
- `sweep.ts` creates each plan at its decision bar's open and resolves from that bar's close, and
  `replay.ts` starts the entry scan `entryLatencyBars` bars in (FR-6), counted by array index, which no
  caller sets, so an instructed entry can fill in the first 5-minute bar after its decision. The
  review-end close prints the last in-window close ∓ half the spread ∓ `expiryExitSlippage`, and
  review expiry is clamped to 5 minutes before the weekly close (`getSetupExpiryTime`; crypto has
  none). A limit prints at `min(open + halfSpread, entry)` with no slippage. Only the arming-bound arm
  carries a latency, on protection. `replay.ts` resolves a non-finite take-profit as `pending`, so the
  engine grades neither a plan with no target nor an absolute timed exit.
- `ANALYZER_VERSION` changed nine times between 2026-08-31 and 2026-09-22.

## Registry, lines and tests

`docs/research/family-registry/registry.json`, tracked, append-only and prevHash-chained, never under
`docs/research/confirm-reads/`. Header, pinned by hash, recording the rulings of 2026-09-28 once the
owner confirms them: the cap, 0.05 per market; the charge rule (at the freeze; one draw per opened
registration, charged to every market it opens on; a lapse charged as a read); burnFraction 0.8,
JUDGED and open; the screen fields (multiplier `tMultiplier95(clusters − 1)`, minClusters 30 JUDGED,
the hashes of rule 4's text and of the Label and Cluster definitions, the holding floor and the lag-one
term among them); the frontier and correlated-set rule; the fold, C_s and L rule, with the schedule's
offsets (screen at landing + 7 days, D, C_s at least 21 days after every opened registration's landing
and 7 after D; JUDGED) and the pre-frontier depth rule, `MAX_DEPTH_DAYS` at each freeze's source
revision; the execution rule's text and hash, and the execution version; the confirm multiplier's
calibration (stretches of 250 clusters, 10^6 resamples, JUDGED); the feed check's text and the hash of
`feedCharacter.ts`; the vintage rule; the pre-law rule; the confirm rule's text (pooled, with the ship
rule and the feed check) and its hash; the two 14-day deadlines, JUDGED. Each hashed text is the
sha256 of the text as the enacted amendment prints it, UTF-8, LF line endings, trailing whitespace
removed.

Lines: *registration* (ordinal, landing, registration commit, `costModelHash`, kind, spec as stable
JSON, specHash, roster, prevHash); *screen* (rule 4); *plan* and *manifest* (rule 9); *freeze* (rule
2); *freeze-landed*; *digest* (rule 2); *vintage* (each daily record's key, sha256 and upload time,
appended at the read or burn); *confirm* (readId; per registration, population and arm the pooled
clusters on each side, B, the multiplier and both its parts, the (a) and (b) lower bounds, the sum of
d and the verdict; per market its feed check, its point estimates on each fold, arm and population,
and whether it ships).

Tests:

- (a) Per market, the draws charged, lapses included, sum to 0.05 or less. Each opened registration's
  draw equals the least, over the markets it opens on, of 0.8(0.05 − S_m)/c_m, and is charged to every
  one of them, with c_m recomputed from the gradings, the freeze line and its declared C_s. Each
  lapse's charge recomputes from the dates.
- (b) A registration draws on m only at a freeze that names m and opens it there, or at its lapse on
  m, and never while it has a read, a burn, a lapse or a pending freeze on m.
- (c) Each screen multiplier equals `tMultiplier95(clusters − 1)`, over the interval's variance with
  its lag-one term. The null draws, the lower bound and the verdict recompute from the specHash seed,
  the recorded decisions and the recorded H_s and fit span; each family floor recomputes from the
  recorded cost inputs under the registration commit's cost code; each B recomputes from the label
  under the header's cluster rule and holding floor. Every registration's W and window exit, as
  executed, fit the embargo.
- (d) The screen, D and C_s dates recompute from the registry and the dates. The timed registration
  (from lines landed before the freeze), the pool, the named markets, each H_s (the pre-frontier
  manifest's 5-minute first time), the pre-frontier manifest's `days` (equal to `MAX_DEPTH_DAYS` at the
  recorded source revision, with no H_s within 7 days of the anchor minus `days`), its analyzerVersion
  (the execution version or later), each market's fit and select point estimates on both arms and
  both populations, each opened registration's landing (at least 21 days before C_s), common span, B
  and both its parts, density and draw, and L recompute from the registry, the class map, the
  pre-frontier manifest and the gradings. The freeze landed before C_s. Each confirm multiplier
  recomputes, t and calibrated parts, from the one df rule and the recorded pre-frontier series, and
  verdicts recompute from the recorded pooled cluster series on both arms and both populations at scale
  1, and on gross for (b) where the profile is JUDGED and for every removal under each of its
  alternatives. Each market's feed check recomputes from the digest's window bars and the freeze line's
  pinned baseline and equals the digest line's; for every month wholly inside the window, the confirm
  manifest's month facts (judged days and median ratios) equal the digest's; and the contained
  population drops exactly the market-months the check names. Every series the confirm sweep loaded
  hashes to its digest entry, and every window bar matches its first vintage record, uploaded in time.
  A market ships only where its point estimates are positive on fit, select and confirm, on both arms
  and both populations. C_s < readAt. For every named symbol, select ends at the last usable instant at
  or before F°_s, confirm starts at C_s, and no confirm span starts before F_s or overlaps a recorded,
  claimed or burned span. Burns and lapses derive from the dates alone.
- (e) The chain is intact; registration lines are appended in `mergedAt` order and ordinals rise by one
  in that order; specHash matches; exact duplicates are refused; each landing time is the spec pull
  request's `mergedAt` and matches the first-parent commit; every artifact holding a family's decisions
  postdates its registration's landing; every screen, plan, freeze, digest and confirm line was landed
  by the job (a rule-12 screen aside); and the confirm shards postdate the registry commit.
- (f) Earlier draws and verdicts are pinned by value. The correlated sets are derived from
  `correlationGroups` and `getAssetType`, and the derivation's output is pinned.
- (g) The door withholds fit and select rows dated at or after F°_s, and every confirm row. A confirm
  read refuses on overlap with any recorded, claimed or burned span of any fold. A claimed window's rows
  stay sealed until its read. A market with no screen pass gets no candidate and no draw, except under
  a program or removal, which takes no screen. The gross leg fires for `rewardRisk` and
  `executionScore`. Block fixtures: session and weekday labels get short blocks, a weekday label whose
  block means have no variance counts as within the bound, slow drift gets a long block, a COT-like
  label with a slow outcome regime gets NO VERDICT, and a pooled series whose day blocks understate its
  28-day variance by more than a quarter gets a longer B. Size fixtures: a constant-long family with a
  72-hour hold on a zero-drift path holds its size at nominal within Monte Carlo error; ladder-shaped
  zero-mean R at 30 clusters rejects at or below nominal within Monte Carlo error at draws 0.04, 0.008
  and 0.0016. A side with 29 clusters is NO VERDICT. A dropped side that is profitable but below the
  mean is refused. A later map never admits. Execution fixtures: an instructed entry cannot fill in the
  first 5-minute bar after its decision; a timed close prints at the close of the first bar opening at
  or after its time, across a holiday, a daily halt and a Friday timed exit clamped at the weekly
  close; a marketable limit pays the full modelled spread and slippage, and rests where the far side is
  beyond its limit; net and arming-bound coincide for a geometry with no protection move. Pooled
  fixtures: a market negative on confirm does not ship from a pooled pass; a window with an escaping
  month is graded on both populations; one market's escaping month empties some clusters and not
  others; a contained population short of the floor is NO VERDICT; a window month missing its daily
  bars escapes; a window whose last month is too short to name itself is judged by its span. Act 3's
  checks stand.

Where they run: tests (a), (b), (e), (f) and (g), and every mutation, run in CI on committed registry
lines and fixtures. The recomputes in tests (c) and (d) read bars, gradings and emits that only the
machine holding the cache and corpora has. They run there as a registry audit, which the read job
runs before the confirm line lands and which is declared a `cadence:` gate; it refuses, and never
passes, when an input it needs is absent.

Mutations the tests must catch: a floor in R instead of the registered ATR; a thinner-side df; day
clusters where the recorded B is longer; day clusters under overlapping holds; an interval without its
lag-one term; a read's B taken from per-market labels; a read's B below the variance-ratio length of its
pooled pre-frontier R; a normal z where t is wider; the plain t where the calibrated quantile is wider;
an unpaired SE or a per-fill delta; the net arm alone; a select fold ending after F°_s; a pre-frontier
sweep placing select decisions inside a pending claim; a freeze landing after its declared C_s; a C_s
taken from the freeze's landing instead of T and D; a screen or freeze line landed by hand, or late,
counted; a lapse left uncharged; a lapse fired while a registration waits; a timed registration that is
not the lowest eligible ordinal, or whose L passes its maximum; a non-timed candidate that landed after
its freeze; a co-opened registration whose own landing + 21 days passes the declared C_s; a
registration opened, or charged, on a pool market the read does not name; an L that does not recompute;
a removal's L projected from its own zero trades; ignoring S_m; counting a registration without a
candidate in c_m; spending a draw where none opened; a pooled draw charged to fewer than every market it
opens on, or above the least any of them has left; one L per market on a pooled read; a market named
with a fit or select point estimate that is not positive on both arms and both populations, or shipped
on a confirm one; a burn that leaves a registration eligible; a read or burn that leaves a correlated
member's frontier behind; a member read after its set's recorded read; a seal keyed on F_s instead of
F°_s; a filter opening with its floor unmet; a program or removal sent to the random-entry screen; a
program confirmed on (a) alone; a removal confirmed without gross or without one of its listed
alternatives; a screen, sweep or read at `modeledCostScale` ≠ 1 or `grossCostScale` ≠ 0; a screen,
sweep or read at an analyzerVersion before the execution version; a pre-frontier sweep below full depth
(`days` other than `MAX_DEPTH_DAYS`); a freeze whose H_s sits at the depth ceiling; a screen under
another `costModelHash`; a window exit that passes 96 h as executed; an instructed entry that fills in
the first 5-minute bar after its decision; an instructed close printed at its instant, or latency
counted by array index; a timed exit not clamped at the weekly close; a marketable limit without the
full spread and slippage, or filled beyond its limit; a freeze rule choosing on net alone; confirm bars
that differ from the digest; a series the confirm sweep loads that the digest does not hold;
`conditionsOf` compared with the grid; a window bar rewritten after its daily record landed; a freeze
citing a second pre-frontier run; a feed check taken after a confirm row exists; a feed baseline
recomputed at the confirm anchor; a feed check reading bars outside the window; an escaping or
unjudged month graded as contained; a window's short last month left unjudged; sealing by label only;
the gross leg keyed on the five cost names; a spec edited in place; a changed burnFraction.

## Build, none of it written

First, the execution rule in the engine, under a new `ANALYZER_VERSION` placed in
`PLACED_ENGINE_VERSIONS`, for every plan any sweep grades (pre-frontier and confirm) and live alike:
execution at the close of the first 5-minute bar opening at or after the instructed instant, by
elapsed time; the entry resting from its execution; a timed close, the review-end close and the
review-end cancel one bar late; the weekly-close clamp on every instructed close at a time; a plan with
no target; an absolute timed exit; a marketable limit's print. Its record measures what it moves in
every shipped cell's figures (Open 9). Nothing registers until it ships.

Then the registry and its lines; the registry's scheduled job (screens, plans, the pre-frontier sweep,
freezes, freeze-landed lines with their protected anchors, digests, the vintage record through a writer
under `scripts/ops/` that `tests/offboxCapability.test.ts` and `tests/archiveOffbox.test.ts` must admit,
reads, lapses) and the registration-line appender; a general t inverse and the
calibrated multiplier; the paired cluster bound over every cluster either side traded (`grid-totalr`'s
`pairedP` is a sign-flip over shared days only and is not it); the label block rule, the holding floor,
the read's variance-ratio B and the lag-one term; a multi-candidate freeze and read; the pooled read:
cluster sums across a registration's markets at its read's B, one L, one draw charged to every market
it opens on, and the point estimates at the freeze and at ship on both populations; provenance against
each read's own spans; one ledgered read grading net and bound together (`grid-totalr` refuses
`--r-arm` with `--confirm-final` today, because the ledger records no arm); per-market fold spans, the
two-to-one usable-time split, the pre-frontier sweep and its depth refusals, the confirm sweep at its
fixed anchor with its digest over every loaded series and its refusals; the window's feed check over
window days against a pinned baseline, failing closed; the two frontiers and the correlated-set claims;
rule 9's door, plan and manifest lines and refusals; an overlap refusal with no override (the
acknowledgement flag lets one through today), the logged identity-only proceed and the
identity-without-spans refusal; the date-derived burns and charged lapses; scale-1 and execution-version
refusals in every reader; the confirm rule's registered text; the screen's family input, its seeded
null and its line; the program and removal kinds, a removal's alternatives among them; and, before any
market ships, the desk's instruction and the Guide's copy for every action its grading assumes (a timed
close, a marketable limit, a plan with no target; amendments 34 and 42). Rule 12 covers specs that land
before the registry.

## Why

- **Money ships at confirm, so multiplicity is paid there.** A draw that is never read cannot produce
  a false confirm. At three registrations with one unread, the two that are read draw 0.0133 each
  instead of 0.02: z 2.475 against 2.326, ×1.40 the n against ×1.28, power 0.63 against 0.68. This
  holds only because the draw is fixed before the window's prices exist.
- **Nobody chooses when to read.** C_s follows every opened registration's landing by at least 21 days
  and the scheduled freeze by at least 7, and the freeze declares every choice it makes: the pool, the
  named markets, L, the frozen members and the draws. The job lands every screen, sweep, freeze and read
  on dates the registry derives, so no one decides whether a freeze lands or who joins it. A lapse is
  charged as a read and a burn counts as one, so letting a read fail to land buys nothing, and
  registering a variant again buys no free window: each one that is timed is read or charged. Folds
  end at F°_s, so a market can be frozen again while its last window is pending, and its next window
  can follow it directly.
- **The window's bars are the first ones.** A later FMP history hits fewer stops, and on forex the
  difference is about the size of the edge being tested (vintage bound, 2026-09-24). The vintage record
  fixes each window bar as it settles, before anyone knows how the window ends.
- **The floor in the statistic's unit.** The statistic is in ATR. Cost in ATR is cost in R ×
  riskDistance ÷ ATR, and 65 of the 80 `maxStopAtrMultiplier` values in `calibration.ts` allow a stop
  of 4 ATR, so mixing the units can err fourfold.
- **Both arms, at full cost, under native execution.** No native order moves a stop at the TP1 fill,
  and the ruling rules out an EA, so the operator moves it and the arming-bound arm grades that. Net
  arming credits same-bar exits at the lock level. The one-bar bound costs 0.0225–0.0261 R per fill in
  all eight forex cells (`docs/research/arming-bound-2026-09-14.md` §3), and 65 of the 72
  `runnerProtection` stamps are trail_tp1. The 16–21 UTC forex window, the one class-grain positive on
  record, needs about 1.3 years of pooled calendar for 80 % power on net and about 19 on the arm of
  record (converge, §7), both at day clusters and for a window found by reading both folds.
  Net stays required so that no verdict rests on the one-bar convention itself. A scale below 1 would
  credit part of the modelled spread and slippage, worth +0.0157 to +0.0215 R per fill in full
  (amendment 43).
- **One cluster rule, and what summing does not fix.** Cluster sums measure money; a per-fill figure
  rises when good trades grow rarer. A label that persists for weeks makes day clusters overstate
  independence, and so does a hold that outlasts a day: at one decision a day on a zero-drift path, day
  clusters under a 3-day hold confirm a null about six times as often as the draw states; blocks of
  twice the hold with the lag-one term hold the size at nominal (round 3). Summing co-moving markets
  into one cluster fixes their same-day correlation, not the serial correlation they share. On the 15
  crosses' shipped ladder, fit and select together, the pooled series' 28-day blocks vary 1.46 to 1.61
  times what independent day clusters predict within calendar years, against 1.12 to 1.18 for one
  market, and a lag-one test within calendar years passes day clusters there. The variance-ratio part
  gives that pooled series B = 14 on both arms; one market takes B = 1 on 11 and 13 of the 15.
- **The multiplier.** Ladder R is skewed to the left, and a window with few stops prints a large t.
  Resampling the 15 crosses' real per-day R at 30 clusters (all traded days, and single-fill days as the
  most skewed case), the plain t rejects a true null at 0.026 to 0.041 where 0.02 is nominal, 0.0066 to
  0.016 at 0.004 and 0.0017 to 0.0072 at 0.0008 for one market, and at 0.016 to 0.035, 0.0024 to 0.010
  and 0.0004 to 0.0032 pooled across the crosses. Calibrated as rule 7 says on one tuning fold and sized
  on the other, in both directions, the multiplier holds 0.0019 to 0.0184, at most 0.0035 and at most
  0.0007 (round 3). It costs power where a stretch is heavily skewed: that is the price of a size the
  ledger can rely on.
- **The per-market cap, under a pooled test.** A pooled read's one draw is charged in full to every
  market it names, so a family null on every named market still ships a false market with probability
  at most the draw's favourable half: at c = 1, 0.02 per market at a first burn, reached only at
  breakeven on the arm of record. A null family read on every market expects at most about 1.8
  favourable false ships across the gate's 91 markets (1.9 across the 97-market roster), against the
  gate's 4.5. The bound does not reach a family that is real on some of its markets: there a member
  with no edge of its own ships whenever the pooled test passes and its own point estimates are
  positive. That is Q7's price (Open 14); the point floor limits it and does not prevent it. The draw is
  the least any named market has left, so a market with little cap left lowers the draw of every
  registration that names it; S_m is public when a roster is hashed.
- **The feed is checked where it is read, before it is graded.** A registered month map is fixed at
  registration and cannot see a window that opens 21 days or more later. The check reads the window's
  own bars against a baseline fixed at the freeze, so the window cannot move its own yardstick, and it
  lands before any confirm row exists. It fails closed on a month it cannot judge, and under rule 10 it
  can refuse and never admit.

Forex waits for one market's read, on the round late-2030s base [verified in round 1: arithmetic; base
unverified; a family's own n sets its wait]. The rulings take the right-hand column (Q5) at c = 1 to 3
(Q2, Q3); the history-start column and the program-wide rows price the readings Q5 and Q2 declined.
The right-hand column counts from F; a read whose window starts later adds the gap. A pooled read (Q7)
divides the mean ÷ SD each market-day must carry by the square root of its pooling gain. On the
shipped ladder's 15 forex crosses that gain measures 6.5 to 11 at day clusters, so a one-year read
needs about 0.06 to 0.08 against about 0.20 for one market (converge), assuming equal means across
markets. At 28-day blocks the select gain falls to about 3, and with an effect on k of N markets the
pooled mean ÷ SD is k/√(N(1 + (N − 1)ρ)) of one market's: 0.65 for 3 of 15 at ρ 0.03. Each freeze line
prints the family's own projected power.

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
own maximum confirm length instead of the rule capping it. The table is at day clusters and the t
quantile; a longer B or a wider calibrated multiplier lengthens every wait in it.

## Open

1. **The burn fraction.** 0.8 was judged where burns fall at least 9.42 years apart on forex. With
   confirm starting after the frontier and folds ending at F°_s, a market can read back to back, a new
   window starting as the last one ends: every 45 to 47 days at the minimum floor and B = 1 (35 for a
   seven-day class), longer at a larger B. A second read then draws 0.008 at c = 1 (z 2.652; t 2.848
   at df 29) and a third 0.0016 (z 3.156; t 3.482 at df 29), and the calibrated multiplier can only
   widen those. It stays at 0.8, JUDGED, until a refute round weighs a schedule that spends less on the
   first read.
2. **Amendment 46's premise.** Closed: Q5 ruled that the span rule stands.
3. **Calibration programs and amendment-36 removals.** Closed: Q4 registers both and charges them the
   cap (rules 3 to 7). How a removal confirms is item 8.
4. **Authority.** Closed in substance: Q1 ruled that the standing approval settles only what 46 leaves
   open, and the rulings cover the departures. The rulings themselves wait for the owner's direct
   confirmation (For the owner).
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
   family-count draft. Both size arguments hold only where each leg's size is at most its draw's half.
   The calibrated multiplier held that on the crosses' real R (Why); no general proof exists.
8. **How a removal confirms.** Q4 registers removals and names no confirm rule for them. This pass
   confirms one on leg (b) alone against the cell it removes, on all three arms and under every
   modelling alternative its spec lists, inside one draw. It reads amendment 36's "removal of our own
   modelling choices" as the cell without each cap or gate, a shorter and a longer review window, and
   the gross arm. Whether that set is all 36 asks is the owner's to confirm.
9. **The execution rule reaches the shipped engine.** Today an entry can fill in the first 5-minute bar
   after its decision and the review-end close prints at the review end (Facts), in the sweep and live
   alike, so every shipped figure on record carries neither latency. The execution version is built
   first under this amendment and applies to every plan, live included. It regrades both sides of leg
   (b) alike, and it moves every shipped cell's own figures; its record measures that move before the
   registry is built. The size of the move is unmeasured.
10. **The feed check's strictness.** It excludes on any of the witness's three clauses, as every
    contained-year figure on record does. Of the 123 market-months flagged since 2025-01, 50 escape on
    bar-range drift alone: 22 forex months at a median range ratio of 1.0017 or below, BNBUSD's 14
    since 2025-07, and 14 more on 12 markets (NQUSD, ZNUSD, CLUSD, WTI, ASX, ZLUSX, HEUSX, CAKEUSD,
    EGLDUSD and TRUMPUSD one each; BZUSD and XAGUSD two each). Whether bar-range drift inside a
    contained range is the feed or the market is unmeasured; until it is, the check costs clusters and
    admits nothing.
11. **The screen stays per market while confirm pools.** Q7 reached the confirm and the ship. A family
    whose effect is real but too small per market for its fit fold opens nothing there. Pooling the
    screen would depart from 46's screen as well, and is for the next round.
12. **Q7's point floor, as read here.** "Its own positive point estimate across fit, select and
    confirm" is read as positive on each fold separately, on both arms and both populations, with fit
    and select applied at the freeze so a market that cannot ship never enters the pooled sum. One
    estimate over the three folds together would ship a market that loses on confirm.
13. **Cross-class families.** Q7 rules one money test across a family's named markets; rule 2 reads a
    family whose roster spans classes once per class, each read its own test and draw, because pools
    and folds are per class. The us_equity_indices set spans index CFDs and CME futures, so a family
    naming both takes two reads. Whether one read may span classes is the owner's to rule.
14. **Q7's price per market.** A member with no edge of its own ships whenever the pooled test passes
    and its own point estimates are positive. With one confirm trade a market can ship, and under the
    ladder's skew a thin null sum is positive more often than not. The fit and select floors are partly
    in-sample, since the freeze rule may choose its member on select. Two narrowings are consistent
    with Q7's "ships only on": a per-market floor of its own confirm clusters, and a freeze rule that
    chooses on fit alone so select's floor is held out. Neither is adopted without the owner.
15. **One price path, two caps.** Every correlated set spans classes, and caps are per symbol, so one
    hypothesis read on XAUUSD and then on GCUSD takes two first-read draws on one underlying: 0.08
    against the 0.048 one symbol would carry. WTI and CLUSD read one provider series. Charging each draw
    to every member of the named markets' sets would close it and departs from Q2's grain.
16. **The live desk collapses correlated setups.** The sweep simulates each symbol alone; live keeps
    one candidate per primary correlation group per scan and withholds a setup when a stronger
    correlated one was active within 6 hours. The 15 crosses fall in five primary groups, so the pooled
    sum counts concurrent trades the desk would not take. The per-market grain carried this too; Q7
    makes the cross-market sum the verdict. A registration could hash its concurrency rule, or a pooled
    read could name one market per group.
17. **Draw allocation.** Dividing each market's share by c_m leaves cap unspent where a co-opened
    registration is throttled by a more depleted market elsewhere. Nothing is double-charged, and the
    unspent part stays for later reads. A water-filling allocation would spend it now.
18. **Calendar placement.** C_s is set at day grain from a landing, with the event calendar known, and
    a read at the floor lasts weeks. A calendar-concentrated family could be placed on a window that
    over-weights its good days. The screen on the whole fit fold and the point floors on years of fit
    and select limit it. A freeze-line disclosure of the window's scheduled events against the fit
    fold's rate would show it.
19. **The screen's reference and latency.** A reference dated before the decision now refuses. The
    recommended decision close still credits the first 5-minute bar, which no instructed entry can
    capture under the execution rule. A screen measured from the first executable price would match
    what confirm grades.
20. **The read's B costs calendar.** Where a pooled series needs long blocks, 30 of them take months or
    years: at B = 14, about 420 days. The readiness floor counts blocks, so every priced wait at day
    clusters lengthens.
21. **Rule 12's reach.** Q6 was asked about a spec landing before the ruling. Rule 12 as written takes
    every spec that lands before the registry exists, so it also reaches specs landing after the ruling
    and before the registry.
22. **A charged lapse prices a harness failure.** Charging a lapse removes the option of letting a read
    fail to land, and it also charges cap when the job fails for reasons nobody chose. The 7-day slack
    before each deadline is the mitigation. The trade was made deliberately.
23. **L at the floor can be underpowered.** L is the shortest length that reaches the readiness floor.
    A 15-market pooled read reaches 30 day clusters in about seven weeks, and at a pooled effect of 0.07
    mean ÷ SD per market-day and a gain of 8 its power is about 0.14, while the draw is charged to every
    named market. The freeze line prints projected power. Making power a condition would need each
    registration to hash a target effect; the registrant sets the floor and the maximum today.

## For the owner

**The rulings' source.** The owner's own message of 2026-09-28, answering the questions as numbered in
that session: "Whichever is recommended as the best fit for my stated goals for Levelflow" (Q7), and, of Q1–Q6 and OQ-1 to OQ-3, "I am unsure what you are even asking me here? But, my answer for #2 stands here too." The questions were explained to him in plain terms in the same
session, after that answer, and he may override any ruling. The rulings are the recommendations:

- **Q1. Authority.** The standing approval settles only what 46 leaves open; this ruling is the
  owner's ruling on departures 2 to 6.
- **Q2. The cap's grain.** Per market (departure 1, reaching past 46's one capped total alpha).
- **Q3. When a family is charged.** At the freeze.
- **Q4. What else claims the cap.** Filters, calibration programs and amendment-36 removals register
  and claim the same cap, one registration per program per market: a program kind (rule 3), no screen
  (rules 2, 4 and 5, test (g)), and confirm through legs (a) and (b) against the cell it would replace
  (rule 7).
- **Q5. The span rule.** It stands: fit and select take each market's whole pre-frontier history, and
  confirm starts at C_s.
- **Q6. Pre-law registration.** Yes, on rule 12's conditions.
- **Q7. The grain of confirm.** Pooled: one money test on summed net R per cluster across a family's
  named markets, read as net of cost on both arms, and each market ships only on its own positive point
  estimates across fit, select and confirm. It departs from 45 and 46 (departure 7).
- **OQ-1.** A registered family may carry its own exit geometry (timed exit, catastrophe stop, no
  target) outside the ladder's payoff floors; amendment 39's ban on a manufactured ratio binds.
- **OQ-2.** The desk may instruct a marketable limit that crosses the book, graded with full spread and
  slippage.
- **OQ-3.** A timed close is allowed, graded as executed one 5-minute bar late.
- **Execution.** Native orders only (TradeLocker, MatchTrader): no automatic stop move at TP1, no EA.
  Any action the desk instructs after an event or at a time is graded one 5-minute bar late, and a
  family whose money needs an automatic lock cannot register on the net arm.

Questions refute round 3 raised, each a reading this draft takes until you rule:

- **Tradovate.** E8's futures trade on Tradovate alone; the execution rule is read as "the market's
  native platform", Tradovate included.
- **Cross-class families** (Open 13). One pooled test and one draw per class.
- **Removals and amendment 36** (Open 8). The alternatives a removal must survive: the cell without
  each cap or gate, a shorter and a longer window, and the gross arm.
- **Q7's price per market** (Open 14). No per-market confirm floor, and select may inform the freeze
  rule's choice.
- **One price path** (Open 15). Caps stay per symbol, not per correlated set.
- **Rule 12's reach** (Open 21). Specs landing after the ruling and before the registry register under
  rule 12.
- **Charged lapses** (Open 22). A lapse costs its draw even when the job, not a person, failed.
