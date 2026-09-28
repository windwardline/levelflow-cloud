> **Finding A (LAW-01) closed after this round, 2026-09-28:** the owner's own message of 2026-09-28 is
> the citable source of the rulings: "Whichever is recommended as the best fit for my stated goals for Levelflow" (Q7), and, of Q1–Q6 and OQ-1 to OQ-3, "I am unsure what you are even asking me here? But, my answer for #2 stands here too." HANDOFF §2 quotes it.

# Amendment 48, eighth pass: refute round 3 (2026-09-28)

**Verdict: the eighth pass as first written does not stand. 18 majors survive their checkers, none
fatal, and they reduce to eleven root causes. All 18 are closed in the eighth pass as closed. Of the
38 minors that survive, 27 are closed there, 5 are closed in part, and 6 are carried in its Open
section. The text is not ready to record as law: the rulings it applies have no owner record, and the
closures add mechanics that no refuter has attacked.**

The subject was `amendment-48-eighth-pass.md` as first written: 671 lines, sha256
`7df6c2e6cb2f7f43ec564fbf4304b0c65bd24058c1fa70121ab502cd6c5aed6e`. The closing edit rewrote that
file in place, so a copy is kept beside it as `amendment-48-eighth-pass.as-refuted.md`. The pass as
closed is 958 lines, sha256 `5ae552caaad7793f3351a2cc283848b4d2d84c63961a66f93a115af7a83d5acb`.

Four refuters attacked the pass, one lens each:

- **Law.** Authority, and fidelity to the rulings and to amendments 33, 36, 39, 45 and 46.
- **Statistics.** Whether each test's size is what the ledger charges for it.
- **Mechanics.** Whether each rule can be built and recomputed against the code at `main` c00ebcb.
- **Gaming.** What an operator can still choose after seeing prices.

An independent checker per refuter tried to overturn every finding by re-reading the cited lines and
re-running the computations. The editor then closed the surviving majors, took the minors that closed
cheaply, and ran the measurements below where a fix needed a number.

The round's workflow journal (`wf_0f66a276-bf3`) is copied to `a48-refute-round-3-journal.jsonl`
(sha256 prefix 88a2a31f70297ab5) in the round's scratch directory, beside the as-refuted pass, the
refuters' scripts (`refute-stats/`), the checkers' (`checker-stats/`, `checker/`) and the editor's
(`editor-stats/`). All of it is preserved outside the repository in
`session-artifacts-2026-09-27/a48/`, with the workflow's final journal beside it as
`a48-journal.jsonl` (sha256 prefix d7307649356ac287).

## Counts

| Lens | Found: fatal / major / minor | Verified major | Verified minor | Overturned | Moved by the checker |
|---|---|---:|---:|---:|---|
| Law | 0 / 8 / 14 | 6 | 15 | 1 | LAW-02, LAW-08 major → minor |
| Statistics | 0 / 4 / 6 | 3 | 7 | 0 | STAT-3 major → minor |
| Mechanics | 0 / 7 / 8 | 5 | 10 | 0 | M5, M7 major → minor |
| Gaming | 0 / 7 / 3 | 4 | 6 | 0 | GL-2, GL-4, GL-6, GL-7 major → minor; GL-8 minor → major |
| **Total** | **0 / 26 / 31** | **18** | **38** | **1** | 9 down, 1 up |

Closed: 18 of 18 majors. Minors: 27 closed, 5 closed in part, 6 carried in Open.

## Majors, by root cause, and where each closed

| # | Root cause | Findings and the checker's verdict | Closed in the eighth pass as closed |
|---|---|---|---|
| A | **The rulings have no owner record.** The pass called a delegated, relayed ruling the owner's explicit ruling on the departures, and by Q1's own logic each departure needs exactly that. The only source is a workflow brief. | LAW-01, holds, major. The checker notes that a delegation on named questions is narrower than a blanket approval; the core holds. | Banner, Authority and For the owner state that the rulings arrived relayed by delegation and wait for the owner's direct confirmation. "Explicit" is gone from the draft's own voice. One owner line asks for the confirmation, and no header is hashed until it lands with a citable source. |
| B | **Folds ended at F_s, so a pending claim froze the queue.** While a claim was pending on a market or its set, the next read's select fold ran into the sealed window, or no freeze could be built until the pending read recorded. Either way every waiting registration lapsed at the pending window's end, as a permanent burn and free of charge. Open 1's back-to-back cadence was unreachable. | M1 and GL-5, both hold, major. The checker adds that the lapse clause read literally breaks the other way: nothing ever lapses after any freeze on m. | Rule 1: fit and select end at F°_s, and the interval pending claims hold belongs to no fold of the new read, so a freeze may land while a claim is pending and its C_s sits at or after the pending end. Rule 8: lapses fire only on a missed job deadline, never while a registration waits. Test (d) and two mutations. Open 1 now states that back-to-back reads are reachable. |
| C | **The operator still chose when to freeze and who joined.** The 21-day lag protected only the timed registration; any other landed before the freeze opened in the window, days after its own landing. Lapses cost nothing and screen lines landed at will, so after up to 21 days of post-registration tape the operator decided whether a freeze landed and who joined it, and a near-duplicate restarted the option. | GL-1, holds, major; the checker notes its own fix is not sufficient without GL-8's. GL-8, upgraded from minor: it reopens the mechanism of the closure check's major 2, which the recorded toy model put at ×1.50 to 1.73 false passes. | Rule 2's schedule: the registry's job lands every screen (at landing + 7 days), pre-frontier sweep, freeze (at D) and read, and an operator lands specs only. Terms: C_s is at least 21 days after T and 7 after D. Rule 5: every opened registration landed at least 21 days before C_s. Rule 8: a lapse, a screen or freeze the job did not land by its date, is charged as a read. Tests (d) and (e); four mutations. The Why states the property for every opened registration. |
| D | **The feed check came from an artifact that exists only after the rows, against a baseline the window moves.** Rule 7 read the confirm manifest, which is finalized after every confirm row, while its own mutation forbade a check taken after one. The witness judged the window against the whole store's median, which the digest did not hold and which in a young store includes the window's own year. | LAW-07 and M2, both hold, major. The checker marks M2's "no span grain" sub-point weak, since Build lists one. | Rule 2: the freeze line pins each named market's 5-minute feed baseline by value from the pre-frontier manifest. Rule 7: the digest line records the check, computed from the window's own days against that baseline, before any confirm row exists, and the check fails closed on a month or span it cannot judge (GL-4 taken with it). Test (d) recomputes the check and requires the confirm manifest's month facts to agree for every whole window month; four mutations. |
| E | **The confirm inputs were unbound.** The digest held only window and warm-up bars and refused any other, while a full-depth sweep loads whole stores, USD-leg daily bars, the curve and the calendar: read literally every read refuses, read loosely the leg and calendar inputs go unpinned. And the vintage stayed choosable: a rebuild or refetch rewrites settled window bars before the digest lands, and later FMP history hits fewer stops by about forex's measured edge. | M3 and GL-3, both hold, major. The checker finds M3's `conditionsOf` point fair and GL-3's forking sub-point minor on its own. | Rule 2: the digest holds the sha256, count and span of every series the confirm sweep loads; `conditionsOf` is compared in frozen mode; the freeze-landed pull request protects the anchor (m1). The vintage record: a daily sha256 of each settled window bar, written once to the locked archive bucket, whose upload time the bucket records; the read refuses a bar that differs from its first record or a day recorded late. Rule 9: the pre-frontier sweep runs under a plan line, and the freeze cites its one manifest. Three mutations. |
| F | **Nothing bound the engine, and the execution version sat in two places.** Filters hashed no engine while rule 4 compared against the registration's; no rule tied the freeze's sweep to a registration's pin; a registration pinned to today's engine graded with zero entry latency. Build placed the execution version inside the amendment and Open 9 outside it. `ANALYZER_VERSION` changed nine times in three weeks, so a queued registration would usually meet another engine. | LAW-06 and M4, both hold, major. The checker notes the Build and Open 9 wording could be reconciled but was ambiguous, and that a family's hashed engine did bind its screen floor. | Rule 3: a registration pins no engine; it pins the cost scales and the cost-model closure, for every kind. Rule 2: the freeze pins the engine, at or after the header's execution version. Rule 4: a screen that grades R refuses before that version. Rule 5: where the freeze's cost code differs from the registration's, the screen must also clear the floor recomputed under the freeze's code. Build: the execution version comes first, for every plan any sweep grades and live alike, and nothing registers until it ships. Open 9 no longer calls it outside the amendment. |
| G | **The execution rule named no price and no bar.** "One 5-minute bar late" gave no print for an instructed close and no rule for a missing next bar; latency counted array indices; a timed exit had no weekly-close clamp, so a Friday exit crossed the weekend and could resolve after its fold closed. | M6, holds, major. | Terms, Execution: an instructed action executes at the close of the first 5-minute bar opening at or after its instant, by elapsed time; the close's print; the marketable limit's print, capped at its limit and resting where not marketable (GL-10); the arms each print carries; the weekly-close clamp on every instructed close at a time; the review-end cancel (LAW-12). Rule 3: the embargo check uses the executed exit, and a sweep refuses a row whose executed close lands after its fold. Fixtures for a holiday, a daily halt and a Friday timed exit; three mutations. |
| H | **Removals could not be read, and the pass narrowed amendment 36.** A removal trades nothing, so rule 2 projected no L and dropped every market, and the removal lapsed 21 days after landing unless something else was timed on its market. The pass also said the gross arm meets 36, which asks the negative to survive a window, a cap, a modelled spread and a sampled cost. | LAW-03 and LAW-04, both hold, major. | Rule 2: L and the no-traded-cluster exclusion read the removed cell's side, and L meets the floor on every side a leg needs. Rule 3: a removal lists the alternatives it must survive (the cell without each cap or gate, a shorter and a longer window, the gross arm) and refuses a list that leaves out a cap the cell applies. Rule 7: it confirms only where (b) holds on all three arms and under every alternative, inside its one draw, and requiring all of them keeps the size at the draw. Open 8 and an owner line carry whether that set is all 36 asks. Test (d); two mutations. |
| I | **Opening and draws escaped the named markets.** The seventh pass's "at each freeze naming m" was dropped, so a non-timed registration could open and draw on a pool market the confirm sweep never covers, against test (b). | LAW-05, holds, major; a regression. | Rule 5 opens a registration only on a named market; rule 6 restores "at each freeze naming m"; a mutation. |
| J | **The dependence correction was wrong twice.** The pooled read took the longest per-market label B, which is neither sufficient (summing multiplies a shared slow component) nor necessary (one long-B market vetoes the family everywhere). And a label-only B cannot see overlapping holds: a constant-long family with a 3-day timed exit took day clusters and confirmed a null about six times as often as its draw. | STAT-1 and STAT-2, both hold, major. The checker reproduced every figure and notes that select's 2.86 rests on four one-year windows. | Terms, Cluster: a holding floor of twice the longest executed hold in days, with lengths 2 to 8 added to the ladder; a length with no block-mean variance counts as within the bound (m4); the read's B fixed at the freeze from the pooled pre-frontier series over the common span, the larger of the label ladder on the summed label and a variance-ratio length on summed R and d; a market's own label B does not lengthen the read; every interval adds twice the positive lag-one autocovariance. Test (g) fixtures; four mutations. The Why states that summing fixes same-day correlation, not serial correlation. |
| K | **The t multiplier was liberal on ladder R.** Negative skew makes the mean and the SD move together, and at 30 clusters the plain t ran above its nominal size, worst at the small draws later reads carry. Every size claim in the draft rested on it. | STAT-4, holds, major. The checker scoped the evidence to the empirical distribution: 1.8, 3.3 and 7 times nominal on single-fill days at the first three draws. | Rule 7: the multiplier is the larger of the t quantile and a calibrated quantile, the largest over 250-cluster stretches of the pooled pre-frontier series, resampled 10^6 times from the specHash seed. Test (g) size fixture; a mutation. Open 7 states that the size arguments hold only for legs whose size is at most their draw's half. |

### Where the closure departs from the finding's own fix

- **STAT-1.** The finding proposed the label ladder's lag-one rule on the pooled series. Measured on the
  shipped ladder (below), that rule passes day clusters within calendar years although the pooled
  28-day variance runs 1.46 to 1.61 times what day clusters predict, and over the whole span it gives B
  = 364 because year-to-year shifts in the mean read as dependence. The rule takes a variance-ratio
  criterion within calendar years for R and d, and keeps the lag-one ladder for the label.
- **STAT-2.** The finding's minimum was B at least the hold. Measured, that alone runs 0.039 to 0.043
  at nominal 0.02. The rule takes twice the hold with the lag-one term, which measured 0.021.
- **GL-3.** The finding proposed a daily append-only log on `origin/main`. A daily pull request through
  CI is heavier, and its merge time is the operator's to delay. The locked archive bucket's write-once
  objects and server-side upload times cannot be set by anyone.
- **GL-8.** The checker asked for a near-duplicate rule besides the schedule. The closure prices the
  option instead: every registration that is timed is read or charged, so no variant buys a free
  window. "Near-duplicate" has no definition that is not itself a new choice.
- **M1.** The finding proposed keying C_s to the earlier claim's burn deadline and refusing a freeze
  while a claim pends. The closure takes GL-5's fix, folds ending at F°_s, which lets a freeze land
  while a claim pends and makes back-to-back reads reachable.
- **LAW-06 and M4.** The closure takes M4's second option (the freeze pins the engine) with LAW-06's
  sequencing (the execution version first, inside Build). A registration no longer re-registers when
  the engine moves.
- **M6.** The finding's example executed at the close of the first bar opening at or after the instant
  plus 5 minutes, two bars late in continuous data. The closure executes at the close of the first bar
  opening at or after the instant, five minutes after it, which is what "one 5-minute bar late" says;
  the existing clamp at 5 minutes before the weekly close then executes at the week's last close.
- **LAW-04.** The closure takes the finding's first option (the alternatives inside one draw). The
  alternative set is this pass's reading of amendment 36 and goes to the owner.

## The editor's measurements

Every script is in `editor-stats/`, in pure Python with a fixed seed.

1. **Overlapping holds** (`overlap_floor.py`, `overlap_nw.py`). One decision a day, constant long, a
   zero-drift path, 250 days, nominal one-sided 0.02, 8,000 repetitions (Monte Carlo SE about
   0.0016). Blocks as long as the hold, without the lag-one term: 0.039 to 0.043. Twice the hold:
   0.025 to 0.028. The label ladder's 0.2 rule on top, blocks at least the hold: 0.032 to 0.035. Twice
   the hold with the lag-one term: 0.021 at holds of 2, 3 and 4 days. As long as the hold, with the
   term: 0.021 to 0.024.
2. **The multiplier** (`boot_t.py`, `boot_t_years.py`, `boot_t_stretch.py`,
   `boot_t_stretch_market.py`). The converge refuter's per-day R for the 15 forex crosses
   (`session-artifacts-2026-09-27/converge/refute-forex-crosses/days.json`), both arms, 30 clusters,
   nominal 0.02, 0.004 and 0.0008, 400,000 size repetitions, calibrated on one tuning fold and sized
   on the other. One bootstrap quantile over the whole fit fold, sized on select: 0.023 to 0.025,
   0.0049 to 0.0057 and 0.0010 to 0.0016, still above nominal because select's shape differs from
   fit's. The largest quantile over calendar years: 0.019 to 0.022, 0.0041 to 0.0046 and 0.0007 to
   0.0010. The rule as written, 250-cluster stretches, in both directions, per market-day and pooled
   per day: at most 0.0184, 0.0035 and 0.0007, where the plain t ran 0.016 to 0.041, 0.0024 to 0.016
   and 0.0004 to 0.0072. The price: multipliers of 2.2 to 4.7 on all traded days against t's 2.150,
   2.848 and 3.482 at df 29, and up to 27 where one stretch of single-fill select days holds few
   stops.
3. **The read's B** (`pooled_B.py`, `pooled_B_within.py`, `pooled_vr.py`). The same data, fit and
   select together. The lag-one ladder on the pooled R series over the whole span gives B = 364 on
   both arms, and 91 to 364 for 14 of the 15 single markets. Within calendar years the lag-one rule passes day
   clusters, while the pooled 28-day blocks vary 1.61 (net) and 1.46 (bound) times what day clusters
   predict, against per-market means of 1.18 and 1.12. The variance-ratio rule within calendar years
   (every longer length up to 28 days within 1.25 times) gives the pooled series B = 14 on both arms,
   and single markets B = 1 on 11 (net) and 13 (bound) of the 15.

## Minors

### Closed

- **LAW-02** (holds, scoped down). Departure 7 names 45 as well as 46, as the converge priced Q7; 45
  stands for filters, programs and removals.
- **LAW-10** (holds). Paragraph 1 keeps only the cap's size and the 0.8 split under the standing
  approval; Q2 and Q3 are departures 1 and 2.
- **LAW-11** (holds). The reach line names amendment 39's structural clause, the Guide (34) and the
  shipped engine.
- **LAW-12** (holds; closed in part). The weekly-close clamp, the review-end cancel and the arms each
  print carries are in the Execution term. Tradovate is read as the futures case of "native platform"
  and goes to the owner.
- **LAW-13** (holds). A market ships only once the desk instructs, and the Guide describes, every action
  its grading assumes; Build carries the copy.
- **LAW-14** (holds). Rule 5 hooks the read's B; a program's B is computed on its frozen member; the
  embargo check takes each kind's windows.
- **LAW-15** (holds). Cost pins cover every kind, the engine is pinned at the freeze, and a screen that
  grades R refuses before the execution version.
- **LAW-16** (holds; closed in part). The Q7 line reads "summed net R, read as net of cost on both arms".
  Rule 12's reach past the ruling date is Open 21, with an owner line.
- **LAW-17** (holds). The freeze line records `days` by value, equal to `MAX_DEPTH_DAYS` at its source
  revision; a freeze refuses an H_s at the ceiling; test (d) compares to the constant, not to 7,000.
- **LAW-18** (holds). The density for L is taken over the common span.
- **LAW-19** (holds). "Reached only at breakeven on the arm of record."
- **LAW-20** (holds). Open 10 lists all 50 bar-range-drift months, NQUSD's among them.
- **LAW-21** (holds). Rule 9's gloss names the three kinds Q4 ruled.
- **LAW-22** (holds). Both populations appear in rule 5, the ship bullet, the freeze line and the
  confirm line.
- **STAT-3** (holds, scoped down; closed in part). Rule 6 states its size claim as a claim about the
  test and names where it bounds false ships; rule 11 prints a pooled ship as one. The per-market
  confirm floor is Open 14. The checker found the leak real (0.30 per named null member in the
  simulated mixed case) but mostly disclosed, and the per-market exposure mainly to markets whose edge
  decayed after select.
- **STAT-5** (holds; closed in part). The freeze line prints projected power. Power as a condition is
  Open 23. The checker notes the floor always permitted underpowered reads.
- **STAT-6** (holds). The Why scopes the pooling gain to day clusters and the shipped ladder, and gives
  the dilution formula and the 28-day select gain of about 3.
- **STAT-9** (holds). The contained population drops market-months from the per-cluster sums; a short
  population is NO VERDICT; a fixture.
- **M5** (holds, scoped down). E is gone. Fit and select split [H_s, F°_s) two to one by usable time,
  and select ends at the last usable instant. The checker measured the two readings of E two months
  apart on BNBUSD and HOUSD, with no leak.
- **M7** (holds, scoped down). A spec lands in its own pull request; the job appends its line in
  `mergedAt` order and refuses while an earlier-merged spec lacks one; every landing date is the spec's
  `mergedAt`.
- **m1** (holds). The freeze-landed pull request adds the anchor to `PROTECTED_ANCHORS`, and the digest
  binds the inputs.
- **m2** (holds). The screen line records H_s, `days`, the fit span and the map's hash; a screen refuses
  another depth; rule 10 refuses a freeze whose H_s moves the screen fold out of fit.
- **m3** (holds). Each hashed text has a stated byte form. Rule 12's condition is that no other commit on
  `main` cited the screen's manifestHash or verdict first.
- **m4** (holds). A length with no block-mean variance counts as within the bound; a fixture.
- **m5** (holds). Edge blocks count in proportion in the projection, and confirm counts every block with
  a trade.
- **m6** (holds). A registration opens only where its month map's hash equals the timed registration's.
- **m7** (holds). A contained population short of the floor is NO VERDICT.
- **m8** (holds). CI runs tests (a), (b), (e), (f) and (g) and every mutation; the recomputes in (c) and
  (d) run as a machine-side audit, declared a `cadence:` gate, which refuses on a missing input.
- **GL-4** (holds, scoped down). The feed check runs on window days only and fails closed on a month or
  span it cannot judge; fixtures. The checker notes a missed escape falls back to the status quo and
  never admits.
- **GL-6** (holds, scoped down). Both populations bind at the freeze and at ship, and the header hashes
  `feedCharacter.ts`. The checker overturned the claim that a registrant picks its month map.
- **GL-9** (holds; closed in part). A reference price dated before the decision refuses. Measuring the
  screen from the first executable price is Open 19.
- **GL-10** (holds). The marketable limit's price, cap and resting case are in the Execution term, with
  a fixture and a mutation.

### Carried in Open

- **LAW-08** (holds, scoped down). A family whose roster spans classes takes one test and one draw per
  class. Open 13, with an owner line.
- **STAT-7** (holds). One price path draws two first-read shares through a correlated set. Open 15,
  with an owner line; charging per set departs from Q2's grain.
- **STAT-8** (holds). The pooled sum counts trades the live desk collapses across correlated markets.
  Open 16.
- **STAT-10** (holds). The equal split leaves cap unspent at a freeze. Open 17.
- **GL-2** (holds, scoped down). Q7's price per market. The checker overturned the headline that about
  half the null members ship, because the per-market screen names few of them; a missing per-market
  confirm floor and an in-sample select floor survive. Open 14, with an owner line.
- **GL-7** (holds, scoped down). The registrant places the window at day grain with the event calendar
  known. Open 18.
- The open parts of LAW-12 (Tradovate), LAW-16 (rule 12's reach), STAT-3 (the per-market confirm
  floor), STAT-5 (power as a condition) and GL-9 (the first executable price).

## Overturned

- **LAW-09.** A registration that opens on no market projects zero clusters, so no L meets a floor of
  30 and it cannot be timed. Rule 2 now words the timed registration as one that opens on at least one
  pool market under every rule-5 condition decidable before the window, which is the finding's
  suggested wording.

## What blocks recording the eighth pass as law

1. **The owner's confirmation.** The rulings reached the draft by delegation through a workflow brief,
   and no owner record cites them (root cause A). The owner confirms them with a citable source, or the
   departures do not take effect.
2. **A closure check.** The closures add mechanics that no refuter has attacked: the registry's
   scheduled job and its dates, charged lapses, the vintage record in the locked archive bucket, the
   calibrated multiplier, the variance-ratio B, the holding floor and lag-one term, the fail-closed feed
   check, and a removal's alternatives. Round 2's closure check found seven new majors in the mechanics
   the sixth pass added. The draft also grew from 671 lines to 958, and the check should look for what
   can be cut.
3. **Seven readings the owner has not ruled.** Tradovate; cross-class families; the alternatives a
   removal must survive; Q7's per-market floor; caps per symbol rather than per set; rule 12's reach;
   and a lapse charged when the job, not a person, failed. Each is written one way in the draft and
   listed under For the owner. None makes the text incoherent, and any of them can change a rule.

Not blocking the text, but blocking any registration: the execution version must ship with its
measured move of every shipped cell (Open 9), and the registry's job must exist and pass its own
tests.
