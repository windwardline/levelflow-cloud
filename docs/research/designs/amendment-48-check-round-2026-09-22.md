> **Status: evidence for a PARKED draft — not law.** Amendment 48 and the design record
> it adopts (`amendment-46-parameters-2026-09-21.md`, beside this file) live only on
> branch `docs/amendment-48`. This file distils the check round that parked them, and
> the second pass that re-read them the same evening. It is kept in the repository
> because the only other copies are session workflow journals.

# Amendment 48's check round, distilled (2026-09-22)

**Where it came from.** Amendment 48's first text compressed the record's two
sections headed "The rule as refuted". A refute round (35 findings) replaced the
compression with the sections themselves, enacted as written. Two read-only
checkers then read the revised amendment and the record's status header, one for
adoption and authority, one for facts: 16 findings, 4 major and 12 minor. The draft
was parked citing A1 (with the minor A4), A2 and A3; F1 was recorded nowhere durable
until this file. That evening a CONVERGE lens re-read the draft, re-verified the four
parking reasons HANDOFF names and filed eight more; independent refuters graded each.

Journals, outside the repository:
`~/.claude/projects/-Users-peacock-Projects-levelflow-cloud/899fcfeb-a1c1-46da-9a31-765c580eb0f8/workflows/`
— `wf_649acd65-123.json` (refute round), `wf_dbb69a78-2a3.json` (check round),
`wf_21166d51-34c.json` and its `journal.jsonl` (lens and refuters).

"Rule 1" is the record's family-count section and "rule 2" its filter section.
Citations are to sections and items, not lines: the record's lines moved when its
header was rewritten.

## The four majors

| # | Lens | Finding | Consequence |
|---|---|---|---|
| A1 | adoption | **The sections disagree on which lines a freeze opens.** Rule 1 opens a candidate only where the registration meets its hashed per-market readiness floor (items 2, 3; "a family below its floor defers to the next burn"). Rule 2 opens every line, family or filter, whose fit screen passed (item 4), and a filter's hash covers no floor (item 3). The amendment's "only where the registration's hashed readiness floor is met" defers to the record, so it corrects nothing. | Opening a below-floor line moves the other candidate from c = 1 to c = 2: z 2.054 → 2.326, power 0.77 → 0.68. |
| A2 | adoption | **Calibration programs have no rule.** The amendment registers them against the cap. "Calibration" appears only in the record's owner section, which the amendment does not adopt. Rule 1's spec is entry-shaped (side rule, clock, W, reference price, unit); rule 2 covers admission filters and population exclusions only. | Act 4, still due, has no route to confirm. |
| A3 | adoption | **The effect floor is in the wrong unit.** The amendment settles it as "the market's round-trip cost in R". The random-entry design measures uncensored MFE − MAE in ATR units, and a family with no stop has no R. Cost in ATR is cost in R × riskDistance ÷ ATR, which reaches 4 where `maxStopAtrMultiplier` is 4. The floor also dropped the ≥ 30 minimum that the screen design and FMP plan E5 carried. | A screen up to 4× too lenient or too strict, depending on the market's stop ceiling. |
| F1 | facts | **The review record is overstated.** The approval line claimed "one refute round on this amendment's own text". That round tested a compression against the sections. The sections themselves, as round 2's checkers rewrote them, took no refute round, and they carry three [unverified] tags into law (rule 1 items 3 and 4, rule 2 item 4). | The record's own condition for recording law — one more refute round on the final text — was not met. |

## The twelve minors

| # | Lens | Finding |
|---|---|---|
| A4 | adoption | Rule 2 clusters by B-day blocks, sets df from the thinner side's clusters, floors at 30 blocks and takes leg (b) against its parent unconditionally. Rule 1 clusters by UTC day, sets leg (b)'s df from every day either side traded, floors at 30 days and takes (b) only against a shipped cell. Rule 2 says it takes these "by reference, so the two items cannot state different standards". *(The evening lens graded this major; its refuter kept it at minor.)* |
| A5 | adoption | The authority paragraph is true and not sufficient. Amendment 46 is headed "owner ruling"; only the rulings record, which calls itself non-operative, says 43–46 were recorded under the standing approval. "A later recommendation that survives refutation may amend it the same way" states a scope for that approval that the repository never records. |
| A6, F2 | both | The opening says the filter question is one amendment 46 left open. 46 left open the effect floor, the reference price and the rising count; filters came from plan item E5. Registering them extends 46, as the amendment says two paragraphs later. |
| A7, F3 | both | The stale-citation warning named grid-totalr.ts and the confirm-reads README only. The record also cites HANDOFF.md by line, and #657, #668, #669, #671, #672 and #675 shifted all three. The files were edited, not moved. |
| A8 | adoption | The record body's own Status still said "Nothing here is law yet" and "no family can register until the random-entry screen is built". Registration waits on the registry; only an entry family's screen needs the random-entry screen. |
| F4 | facts | The header pointed at session-artifacts for evidence the record cites as `cf3/keep_share_rule.out`, `cf3/block_sim_refined.out` and `check/paired.py`. Those were scratchpad files and were reaped. |
| F5 | facts | "An unpaired interval ran 6.2 to 7.8 times the nested standard error" misstates the measurement. It was a ratio of standard errors, for one filter (costShare ≤ 0.15), on fit-fold baseline rows. The ratio depends on the filter's drop share f, roughly √(2(1 − f)/f). |
| F6 | facts | The brief's floor clause, applied to every registration, would let a filter (which hashes no floor) open nothing. Same root as A1. |
| F7 | facts | "One registration per program per market" appears only in the owner section. Same root as A2. |
| F8 | facts | The unbuilt list called "the paired daily test" unwritten, while grid-totalr's `pairedP` exists. `pairedP` is a sign-flip over shared days only; leg (b) needs every day either side traded, with 0 for the idle side. The list also omitted the label block-length rule and the confirm rule's registered text. |

## The evening lens, as its refuters left it

Each finding was filed against the parked draft and handed to an independent
refuter. "Killed" here means already recorded or not a defect in force; the
refuter's residue is what the redesign owes.

| Finding | Filed | Refuter | Residue the redesign owes |
|---|---|---|---|
| readiness-floor conflict | major | killed (already HANDOFF's) | Rule 1's per-family freeze timing ("each freeze names the family it is timed for") against rule 2's "one read per market window opens all its candidates"; the amendment never says which paragraphs are its "corrections below". |
| cluster and df conflict | major | minor | Four axes (cluster unit, df, floor unit, leg-(b) condition) plus a registry header that can express day clusters only. Rule 2 is stricter on each, so the practical divergence is rule 1 confirming where rule 2 returns NO VERDICT. |
| calibration has no rule | major | killed (already HANDOFF's) | Say plainly that the random-entry screen cannot see a calibration program: it reads no stop, TP1, ladder or realized R, so it would score the parent's entries, which read about zero. Name what gates one instead. |
| arms asymmetry | major | minor | Rule 1 confirms families on the net arm only; rule 2 holds filters to net and arming-bound. The one-bar latency costs 0.0225–0.0261 R per fill in all eight forex cells (`docs/research/arming-bound-2026-09-14.md` §3), and 65 of the 72 `runnerProtection` stamps in `calibration.ts` are trail_tp1. A bound-arm confirm needs the ledger to record the arm: grid-totalr refuses `--r-arm` with `--confirm-final` today. |
| effect-floor unit | major | killed (already HANDOFF's) | State the floor in the statistic's own unit with the ATR named; align the family screen's cluster minimum with the filters' 30. |
| floor not fixed in advance | major | minor | The floor depends on the execution-cost model, which no hash pins and which moved twice for forex (#631, #641). The screen status line records neither the engine version nor the floor, and test (c) recomputes the multiplier only. Record manifestHash, analyzerVersion and each market's floor at the screen; recompute the floor in test (c). |
| cross-market brake premise | major | killed | For a family that adds trades, leg (a) is the whole confirm test, and 0.02 favourable false confirms per market read at c = 1 is its worst case, reached only at net breakeven. Say so in one line; drop "D4's absolute term is the cross-market brake" as the reason for the per-market reading. |
| filter departs from 46 undisclosed | major | minor | "A conditioning filter is a family" conflicts with 46's "registered and hashed before any fold is read" and "screened against the random-entry null", neither of which rule 2 applies to filters. Drop the label or name both departures. |
| reversal overspend | major | minor | "The owner may reverse any" cannot be kept for cap scope once a freeze names two or more markets: at c = 1 each market draws 0.04, so a nine-market freeze spends 0.36 against a program-wide 0.05. The record's condition — the ruling comes before the first registration — was dropped from the amendment. |
| record not durable | major | minor | Pushed as b99d07b but labelled law in both files; the check round's findings were durable nowhere; HANDOFF names neither the branch nor the worktree. |
| authority heading | minor | minor | As A5. Ask the owner the approval's scope; do not treat every "owner ruling" heading as unamendable, since 42's and 43's own bodies say they were approved under the standing approval. |
| alternative priced off basis | minor | info | The record's "52-58 y" double-rounds 57.48; the amendment's "52 to 57" is right on the 0.05/N basis. Like-for-like at 0.04/N it is 54.15–59.33 y. |

A related profit-path finding was killed the same evening, and its refuter's measurement
belongs here: 50/25/25 folds do not force a years-long wait. A sweep spanning
[frontier − 3L, frontier + L) gives, through the existing `--fold-start`/`--fold-end` or
fold-spec inputs, a confirm fold starting exactly at 2026-08-26T10:45Z for L of 30, 90
or 365 days. It does not overlap act 3's confirm spans under grid-totalr's half-open
test. No amendment pins a span's start.
