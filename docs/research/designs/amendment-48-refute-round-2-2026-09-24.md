# Amendment 48, fifth pass: refute round 2 (2026-09-24)

**Verdict: the fifth pass does not stand. 21 majors survive their checkers, and they reduce to eleven
root causes, every one closed in the sixth pass
([`amendment-48-draft-2026-09-24.md`](/docs/research/designs/amendment-48-draft-2026-09-24.md)). The
draft stays PARKED for the owner's Q1–Q6, and the text as ruled takes one more refute round before it
is recorded as law.**

The subject was the fifth pass: `amendment-48-draft-2026-09-24.md` at commit 0f38ffd, 418 lines, sha256
`e6fee61d139fec061f819ff22428516b7327193c92d955440ccee4a0fb148a1d`. The sixth pass rewrote that file
in place, so the hash is the fifth pass's only anchor. Five refuters attacked it through one lens
each (internal consistency, arithmetic and code, authority, sealing and leakage, closure of round 1),
and an independent checker per refuter tried to overturn every finding by re-reading the cited lines
and re-running the computations. 77 findings: 21 majors survive, 7 more were scoped down to minor,
47 minors survive, and 2 findings were overturned. The refuters also recorded 64 claims they tried and
failed to break. The round's journal is kept outside the repository, in
`~/Library/Application Support/WindwardLineToolchain/levelflow/session-artifacts-2026-09-24/`
(`a48-refute-round-2-journal.jsonl`, sha256 prefix 03ad3d03ddebd47c; the extracted result and the
refuters' scratch computations beside it). That directory survives a session's deletion, which the
round 1 journal did not: its session was deleted on 2026-09-24 and every journal it held went with it.

## Majors, by root cause, and where each closed

| # | Root cause | Findings | Closed in the sixth pass |
|---|---|---|---|
| A | **Confirm started after the registration's merge, not after the freeze.** Every choice a read makes (its markets, L, the frozen grid members, the draws) was made at a freeze that could land after its window opened, with the window's prices in the minute bank. One charged draw bought a menu of windows, and a designer could register variants, watch their shared window and screen only the one that passed. The timed-registration rule was also circular: two self-consistent solutions exist when ordinal order differs from merge order (reproduced: R1 merged 2026-10-05, R2 2026-09-30). | consistency-confirm-starts-before-freeze, consistency-timed-registration-circular, arithmetic-code-4, sealing-1, sealing-2, closure-01 | Terms (C_s from the freeze's landing); rule 2; test (d) (freeze lands at or before C_s); the Why's first two points; Q3 states its premise. |
| B | **No rule said which markets a read names**, and L is the maximum of per-market minima, so the set moved L. | consistency-read-markets-undefined, closure-01, arithmetic-code-4 | Rule 2: a read covers one class; its pool is every roster symbol sharing F_s; it names exactly the pool markets where the timed registration has a candidate; test (d) recomputes. |
| C | **The 365-day cap contradicted every priced wait.** A read capped at one year has power 0.16 at c = 1 on forex's base, and a label with B ≥ 14 can never reach 30 blocks in 360 days. | consistency-year-cap-vs-priced-waits, arithmetic-code-2 | Rule 2: no cap; a market leaves only when its pre-frontier density is zero. The Why states the capped power. |
| D | **Density per calendar day applied to weekdays** discounted weekends twice: the rule gave L of 63–65 days where Q5 printed 45–47. | arithmetic-code-1 | Rule 2: traded clusters per weekday (per day for a seven-day class), applied to the weekdays of the interval. |
| E | **"A recorded lower bound can be judged against any later floor"** contradicted 46's "threshold fixed in advance", rule 4's pinned floor and "no recorded verdict moves". | consistency-later-floor, authority-1 | Rule 4's last sentence: a screen is judged only against the floor derived from its hashed inputs. |
| F | **A grid member can change the label**, so which member is screened, and whose B confirm uses, was undefined. | consistency-grid-label-B | Rule 3: a family's grid holds only label-invariant parameters; a filter's values are each screened as their own member. |
| G | **H_s was the class's start**, contrary to amendment 33's per-market span: 7 of 97 markets (XAGUSD, HBARUSD, THETAUSD, ARWUSD, BNBUSD, CAKEUSD, TRUMPUSD) start after their class's fit fold ends and would hold no fit row. | authority-5 | Terms (H_s per market); rule 1. |
| H | **Nothing bound the sweeps to the freeze**: fold spec, month map, anchor, engine revision and a named cell's parameters could be chosen when the confirm sweep ran. | sealing-3 | Rule 2: the freeze records the pre-frontier sweep's identity and the resolved calibration by value; the confirm sweep refuses a different engine, cost model, revision or `conditionsOf`. |
| I | **"Appends its manifest hash before it runs" cannot be built**: the manifest hash covers the run's outputs (`sweepManifest.ts`), and "abandoned" had no deadline. | sealing-4, closure-04 | Rule 9: a plan line lands before the run, the manifest binds to it after, and a plan unbound 14 days after its planned end burns its span; scoped to folded runs. |
| J | **Correlated members' frontiers were moved but never recorded**, and burns did not move them, so F_s had two definitions. | consistency-substitute-frontier-unrecorded, closure-02 | Terms (F_s over the set, claims and burns included); rule 8 (propagated spans recorded; a read refuses a span starting before F_s, not only an overlap). |
| K | **Rule 12 let a pre-law screen stand under a threshold the law had not fixed**, and its window passed before any tool could seal it. | authority-2, sealing-6 | Rule 12: the screen counts only if run under the screen text as enacted; C_s follows the freeze. Q6 priced both ways. |

## Minors, grouped

- **Definitions and consistency (closed):** a registration with a read or pending freeze cannot open
  again on that market; rule 12 names one window; the two-fold function is new, not
  `calendarFoldsExcluding`; the acknowledgement flag is gone from Open 3; the per-market grain is Q2's,
  not a settled mechanic; the cap is 0.05 in total, not per read; a pending freeze claims its span and
  burns 14 days after its end; correlated sets are derived as cross-class groups and pinned by test;
  (a) is readable where no cell ships; add or replace is per market; a combination registers as a
  filter only when it is one field and one op; `maxCostShare` waits on Q4; the Why's inputs line is
  restored; ordinals rise by one in landing order, and only registrations take them; "fit fold" has
  one meaning.
- **Arithmetic and code (closed):** `costModelHash` covers the transitive import closure and the
  registration commit is recorded; Q5 prices the loss from F to C_s for good, 36.25 days for the three
  livestock symbols; Open 1 gives t at df 29 (2.848, 3.482); the window exit, not only W, sits inside
  the embargo; the month map is named and hashed; rule 9 reads F_s as the Terms define it, default
  included; the `confirmLogDir` claim is scoped to directories the prior-read scan does not glob.
- **Authority (closed):** the reading of "before any fold is read" is stated, with a disclosure field
  for a designer who has seen fit results; Q2 prices the per-market reading at about 1.8 favourable
  false confirms across 91 markets; rules 8 and 9's reach over unregistered work is departure 5; each
  of Q1–Q6 carries a recommendation and a price; the screen's fit fold comes from a recorded fold spec;
  the stale "a family with no stop has no R" is replaced, and exit geometry is held to amendment 39.
- **Sealing (closed):** landing is the pull request's `mergedAt`, cross-checked against the
  first-parent commit; the refusal sits on `grid-totalr`'s `confirmLogDir` option, which `confirm-4d`
  also reaches; a registration with a pending freeze is ineligible.
- **Closure (closed):** test (d) recomputes the timed registration; the resolved calibration is hashed
  by value; a replacing candidate's cell side is projected; the checks the reconciled draft said
  "stand" are carried into tests (g) and the mutations; the screen refuses `modeledCostScale` ≠ 1;
  Printing names the arm; Q5 reads "at or after".
- **Not recoverable:** round 1's record reports 49 findings and names 47 IDs (closure-19). The two
  missing IDs were in the round 1 journal, which was deleted with its session on 2026-09-24. Nothing
  else records them.

## Overturned

- authority-8: the reference price is not an unrecorded degree of freedom. Each registration hashes
  its own before any read, and the draft carries 46's owed recommendation (decision close).
- closure-18: no contradiction between "no registration is recorded" and rule 12. "Recorded" means a
  registry entry; rule 12 separates a spec that has landed from one entered in the registry.

## Round 1's findings, as round 2 left them

Round 2's closure lens found round 1's majors 1, 2 and 4 closed only in part and major 5's fix
unbuildable; the root causes above carry them, and the sixth pass closes each. Majors 3, 6 and 7 and
every round-1 minor closed in the fifth pass, with the corrections listed under "Minors" above. The
closure table that sat at the end of the fifth pass is superseded by this record.
