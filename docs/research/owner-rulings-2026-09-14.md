# Four owed rulings, with recommendations that survived two rounds (2026-09-14)

The open-scope round (2026-09-13) left four questions as OWED RECOMMENDATIONS
rather than questions put to the owner: under the standing directive an owner
decision arrives only with a recommendation that has survived refutation. Item
1 of the round's program has now been read
([`arming-bound-2026-09-14.md`](/docs/research/arming-bound-2026-09-14.md)),
which is what three of the four were waiting on.

**How these were produced, because it bears on how much weight they carry.**
The driver wrote a recommendation for each. One adversarial refuter attacked
each, with its sources named. A second, independent agent then checked the
REFUTER — opening every citation it gave and recomputing every number it
produced — because a correction repeats the defect it is fixing more often
than anyone expects. **All four of the driver's original recommendations were
overturned, and all four of the refuters' replacements were then corrected.**
What follows is the third version in each case. Figures are marked
**[verified]** where the driver reproduced them from the source in this change
set, and *(round)* where they come from the refuter round and have not been
re-measured here.

---

## 1. The E8 bid/ask capture's priority

**Recommendation.** Keep the capture low priority, and do not run a
majors-only version of it: a majors capture would measure one of the six
held-out forex markets and say nothing about the other five. But do not record
it as "cannot matter" either — the argument this driver first gave for that was
wrong. What is owed now needs no owner and no capture at all: the forex
execution profile's spread and slippage constants are the one input to every
forex cost share that carries no derivation, and either deriving them or
marking them judged is a repo change available today.

**What the owner decides.** Whether to spend four weeks of an open TradeLocker
session on a capture whose best case lifts one held-out cell — **or to spend
two minutes instead**, because an investigation on 2026-09-14 found a per-pair
spread E8 already publishes and this repository has never captured: the live
trading-symbols tool carries a **Spread** and an **Avg. spread** field for
forex instruments (`e8-futures-dossier.md:312`, browser-verified; the Futures
tab carries no such field, which is how it came to be noticed). One screenshot
of that tool's Forex tab gives 28 per-pair spread levels. It answers the LEVEL
question, not the HOUR one — an average has no hour dimension — but the level
is what the judged constants actually lack, and the same visit is already owed
for the Softs and Stocks tabs.

**Why.**

- The first recommendation rested on a structural claim that is false. A quoted
  spread does not add to the modelled one, it **replaces** it
  (`executionQuality.ts`), so a measured E8 spread tighter than the model
  raises cells rather than lowering them **[verified]**. The sign is empirical.
- What can be settled without the capture is the size of the prize. Gross minus
  net is the whole modelled spread-and-slippage charge: **+0.0157, +0.0187,
  +0.0203 and +0.0215 R per fill** across the four in-span cells **[verified,
  from the read's own table]**. Against that, select held-out in-span is short
  **0.0265 R** at its lower bound, so no non-negative spread lifts it. Fit
  held-out is short **0.0038 R**, which is about a fifth of its modelled charge
  — reachable in principle, except that a cheaper round trip re-admits rows the
  0.15 cost cap currently declines, so the cell that would be measured is not
  the cell measured today.
- A majors-only capture cannot reach the question. The held-out forex set is
  AUDCHF, AUDNZD, EURUSD, GBPCAD, NZDCHF and NZDJPY — **five crosses and one
  major** **[verified]**.
- The free work the capture is standing in front of: `EXECUTION_PROFILES.forex`
  carries `spreadBps: 0.35` and `slippageBps: 0.16` with no derivation at their
  definition, where agriculture's and livestock's carry worked tick-over-price
  derivations **[verified]**. **CORRECTED 2026-09-14 when amendment 43 was
  written: this bullet also said crypto carries a sampled book floor, which is
  a different facility — that sampling floors `venueCosts` and derives nothing
  in the execution profile. Six of the eight profiles carried no derivation and
  no marker, not one.** Those two
  constants set a large share of every forex cost share, which gates admission
  at `maxCostShare: 0.15` and is printed to the operator as a cost.
- The standing caveat on any relaxation: rows the cap declines today were
  removed under a ledgered confirm read, on a fold that cannot be read again
  *(round)*. Measured since: those removals are net-negative, about −0.069 R
  per row over 14,925 rows, so re-admitting them at the old cost basis is
  expected to LOSE money even as the cheaper round trip gains it **[verified
  from the read's own reconciliation]**.
- Why the constants are worth more than the capture's best case: the modelled
  spread does not merely gate. It is handed to the resolver as `halfSpread`,
  which sets the entry fill print, both trigger tests and the gap and expiry
  prints — so it moves realized R directly, where the commission moves only the
  accountant **[verified]**. Halving it would re-admit about 55 % of the rows
  the 0.15 cap declines and move roughly one accepted forex row in five up a
  cost band *(established by investigation, on a 3,799-row sample)*.

---

## 2. What a review hour means

**Recommendation.** Rule that `defaultReviewHours` means **wall-clock hours**.
The ruling records what the engine already does rather than changing anything:
the live path and the sweep resolve expiry through one function. File the
maintenance-break exposure beside it as a specification fact stated **per class
by magnitude, never as uniform** — the exposure runs from about 1 % of the
forex window to a sixth of the futures and energies window, and agriculture's
worst rows lose most of theirs *(round)*. Build nothing in either direction.

**What the owner decides.** Whether to accept wall-clock as the definition of
record, or to commission the open-market re-derivation — which would move every
calibration cell and, because R3's ledgered read was taken with all derived
cells inside the confirm fold, would ship every re-derived cell unconfirmed
*(round)*.

**Why.**

- Both halves of the engine already resolve expiry through the same function,
  so the wall-clock ruling is a record, not a change *(round)*.
- The lever is dead on money in the direction anyone would build: refusing
  break-crossing windows costs R *(round)*. The mirror direction — refusing
  the clear windows instead — is the hour gate wearing the opposite sign, and
  that gate accepts 0 of 91 markets at both arming conventions **[verified]**.
- **CORRECTED 2026-09-14, and the count was four, not two.** The "livestock
  loses 24 % of every window" line survived an earlier correction of the same
  figure at the top of its own file and now reads ≈4.2 %. The in-span-only
  citation now carries both conditioned deltas, and the second one matters:
  out of span the break delta is +0.0083 [+0.0012, +0.0154], which excludes
  zero, so "dead as a money lever" was a statement about one of two
  conditions. Two more were found and corrected with them: a superseded
  "20.3 % of exchange-traded decisions" carried in two documents after the
  driver's own table put it at 29.0 % (12,876 of 44,344), and a "203× the
  holiday exposure" ratio no figure supports — holiday-decided rows are 796 of
  that same 44,344, so the ratio is 16.2 **[all verified]**.
- The reason previously given for not re-deriving — that the provider key was
  down — is stale: the 2026-09-14 full-corpus re-simulate ran at zero provider
  bytes **[verified]**. The real blocker is the burned fold.

---

## 3. Amendment 33's market grain against the seven-year arithmetic

**Recommendation.** Keep the per-market grain as the shipping bar, with no
exception for the hour finding, and refuse the class-grain-plus-sign-concordance
path under amendment 39 as well as 33: twenty-two market signs are a count, on a
question where each market's realized R is knowable. Record that the market
grain is a **necessary floor and not a sufficient bar** — the gate's own note
expects about 4.5 false families over 91 markets — and close the hour finding
on the measured reason rather than on a calendar estimate.

**What the owner decides.** Whether the market grain is the shipping bar for an
admission rule as well as for a published rate, accepting that this closes the
hour finding on forex's own history.

**Why.**

- The gate accepts 0 of 91 markets under both arming conventions **[verified]**,
  and 20 of the 91 under the bound fail only on their own absolute expectancy
  **[verified]** — a leg that moves with per-fill cost, which is why ruling 1
  does not treat the refusal as cost-independent.
- The calendar arithmetic that produced "seven years" reproduces at the memo's
  own inputs *(round)*; at the bound figures +0.0121 and +0.0135 the requirement
  worsens about **five- to SIXfold** — 6.15x and 4.94x — rather than the
  ninefold the round projected from +0.01 **[verified: the requirement scales as
  the inverse square of the effect]**. **CORRECTED 2026-09-14, before amendment
  45 was written: this bullet read "five- to sevenfold", and the two figures are
  bound columns of two in-pool in-span cells rather than an effect size of the
  hour rule.**
- **A provenance defect in the gate, found by this round, confirmed by the
  driver, and then found to be deeper than first recorded.** `grid-totalr.ts`
  applies no per-market span exclusion, where six other readers import
  `feedYears` **[verified]**, while the 2026-09-12 verdict's own
  pre-registration requires it and says a calendar pre-registered without it is
  not pre-registered **[verified]**. Both of the 2026-09-14 reads inherit this,
  as the 2026-09-12 verdict did. **Neither facility item 4 names has a
  production caller at all**: the month-grain map and the usable-time fold
  allocator are both called only from one test file **[verified]**, the R3
  folds were cut by the plain proportional allocator **[verified
  arithmetically]**, and the fold label is stamped at simulation time — so the
  boundary half of the repair needs a new sweep and a read-time flag would be a
  partial, year-grain substitute. The round offered a figure for which way the
  verdict would move; the driver could not reproduce it as a like-for-like
  comparison and does not repeat it. **The honest statement is that the gate
  grades a calendar its own pre-registration excludes, and repairing the
  instrument is owed work.**

---

## 4. Whether a new entry family is a new program

**Recommendation.** A new entry family is **not** a new program: the ledger
burns calendars, not hypotheses, and the acknowledgement path is a driver flag
with nowhere to record an owner or a reason *(round)*. So a family buys a
confirm read only with dates no recorded read has seen. Until such a calendar
exists, every family is registered and hashed before any fold is read, screened
on the fit fold against the random-entry null at a threshold fixed in advance,
and charged against **one capped total alpha shared by every family that will
ever claim the post-2026-08-26 calendar**.

**What the owner decides.** Whether a screened family may take its confirm
verdict at the forex **class** grain under the per-market sign-concordance test
the repository already runs — the test behind the shipped `maxCostShare` 0.15 —
or must meet the per-market grain, which forex's own history closes until the
late 2030s *(round)*.

**Why.**

- The confirm fold is a fixed last quarter of the sweep's span, so new calendar
  buys confirm fold at a quarter of the rate it accrues *(round)*. This is the
  fact that makes "wait for new dates" a decade rather than a season, and it is
  the single most consequential number in this ruling.
- The multiplicity leak is real and is what the capped shared alpha closes: if
  each family were its own program with its own burn, N families would each
  burn the same new calendar *(round)*.
- Note the dependency: ruling 3 keeps the per-market grain as the shipping bar,
  and this ruling's owner decision asks whether a screened family may be
  excepted from it. **They should be decided together, and if ruling 3 is
  accepted as written, the class-grain option here is inconsistent with it.**
  That tension is stated rather than resolved: it is the owner's.

---

## Status: all four are law

Recorded 2026-09-14 as **amendments 43, 44, 45 and 46**, under the owner's
standing approval of recommendations that survived adversarial review. Two
things changed in the crossing, and the amendments rather than this record are
the operative text:

- Ruling 4's open question is closed by ruling 3. This record left the grain for
  a screened family to the owner and named the tension; with amendment 45
  admitting no exception, amendment 46 takes the per-market grain and states the
  consequence plainly — forex's own history closes confirmation on this calendar
  for years.
- Amendment 45 opens with "from this ruling forward" and carves out the cells
  already shipped on a class-grain verdict. Read without that clause, the rule
  sentence alone condemns the live forex `maxCostShare: 0.15`, which no one
  intended.

One figure in this record was recomputed before it became law. The inverse-square
scaling of the fill requirement is about five- to SIXfold at the two bound
figures cited (6.15x and 4.94x), not five- to sevenfold, and those two figures
are bound columns of two in-pool in-span cells rather than an effect size of the
hour rule.

## What this record does not do

It does not build anything. Rulings 1 and 3 each name owed repair work — the
forex cost constants, and the gate's missing span exclusion — and neither is
started here. The random-entry screen that ruling 4 depends on is designed and
refuted but not built; its design is
[`designs/random-entry-screen-2026-09-14.md`](/docs/research/designs/random-entry-screen-2026-09-14.md).

**Amended 2026-09-14, after five investigations established the facts behind
that owed work.** Ruling 2's stale figures are corrected in the same change set
as this amendment, and there were four of them rather than two. Ruling 1 gains
a far cheaper path than the capture it was about. Ruling 3's gate defect is
deeper than first recorded: neither facility its pre-registration names has a
production caller, and the boundary half of the repair cannot be done without a
new sweep. The forex constants are now marked JUDGED in the engine, with their
provenance, which is the one piece of that owed work this change set does.
