# The gate called an unmeasured fold a measured loss, in three recorded verdicts (2026-09-14)

`grid-totalr`'s acceptance conjunction requires `fitTotalDelta > 0`. `totalOf`
returns 0 for an absent cell, so a market with **no fit-fold rows at all**
differences to 0 − 0 = 0, fails that conjunct, and — because no leg of the
no-verdict ladder tested for fold emptiness — fell through to the bare word
`fails`. A fold that was never measured was reported as a measured loss.

The confirm fold has carried exactly this guard since #364 round 43, and its
comment states the principle: *"a delta needs evidence on BOTH sides. Without
the filled guards this read 0 − 0 = 0."* The fit fold never got one.

## Who it bit

Derived from the corpus manifest's own per-symbol, per-fold emitted counts, not
inferred: **22 roster symbols carry no `fit` split at all**, because they were
listed after their class's fit fold ended. **Sixteen of them are among the 91
markets the gate grades**; the other six (ARWUSD, BNBUSD, CAKEUSD, THETAUSD,
TRUMPUSD, XAGUSD) have every row inside the confirm fold and never reach the
gate. For contrast, EURUSD carries 10,776 fit rows and BTCUSD 4,752.

The sixteen are eleven crypto — AAVEUSD, AVAXUSD, DOTUSD, DYDXUSD, EGLDUSD,
GRTUSD, HBARUSD, IMXUSD, NEARUSD, SOLUSD, UNIUSD — and five that are not:
**ASX, DAX, DOW, FILUSD and NIKKEI**. An earlier draft of this note said twelve
markets and named only the crypto. Twelve was the count whose IN-SPAN verdict
moved; sixteen is the count with no fit fold. They are different populations and
the first draft printed one number for both.

## What it changes, and what it does not

**The headline does not move.** An empty fold cannot produce an acceptance, so
no accept is created or destroyed. Re-run on all three reads, the accepted count
is 0 of 91 before and after, and the money-leg failures — the markets that beat
every comparison and still show no profit — are unchanged at 13, 11 and 20.

What moves is the composition, identically in all three:

| in-span rule, 91 markets | before | after |
|---|---:|---:|
| accepted | 0 | 0 |
| failed on a comparison | 67 / 69 / 60 | 56 / 58 / 49 |
| failed on the money leg | 13 / 11 / 20 | 13 / 11 / 20 |
| no verdict | 11 | 22 |
| **total failed** | **80** | **69** |

(The three columns are the 2026-09-12 read, then the net and bound columns of
2026-09-14.) Across every variant, not only the in-span rule, **79
(market, variant) pairs on 15 markets** moved out of `fails` into the
fold-emptiness reason, identically in all three artifacts.

## Why it matters even though the verdict stands

"80 judged and failed" told a reader that 80 markets were measured against the
hour rule and lost. Eleven of them had no fit fold to measure. The gate's own
vocabulary draws this distinction everywhere else — its underpowered message
ends *"too few fills to judge, which is not the same as a measured loss"* — and
the one place it did not draw it is the place a market can have no data at all.

## The change

One guard in `groupVerdicts`, which both grains share, so the class and market
units are fixed together:

```ts
const fitEvidenceAbsent = aggregate.variant.fit.filled === 0 ||
  aggregate.base.fit.filled === 0;
```

It enters in two places, and the second was missing from the first draft of this
fix until a review found it:

1. **The disposition**, as a leg of the no-verdict ladder — placed BELOW the
   pairing floor. A pair that would otherwise reach `fails` has already cleared
   that floor, so this still catches every mislabelled one, while a variant that
   changed nothing on a market keeps the message saying so, which is a fact
   about the rule rather than about the data. Placed above the floor, as the
   first draft had it, 29 pairs lost that more specific reason.
2. **The acceptance conjunction.** The guard fires when EITHER side is empty,
   but the delta is forced to zero only when BOTH are. With the variant's fit
   fold empty and the baseline's fit R negative, `0 − (−X)` is positive and the
   conjunct passed — so the gate could return `accepted` **and** `noVerdict`
   together, on a fold the variant never traded. Every other no-verdict leg is
   mutually exclusive with acceptance by construction; this one is not. The
   artifact carries no `noVerdict` field, so a consumer reading `accepted` would
   have seen an accept and could have burned the confirm fold on it. This note's
   first draft asserted the case was impossible without testing it.

The reason names which side is empty, because on the one-sided case "both sides"
and "0 − 0" are both false.

Tests: a one-sided empty fold, a both-sides empty fold (the case all 79 real
pairs carry), the market grain where the 30-fill floor could shadow the leg, a
market that fails pairing and keeps its own message, an empty fold whose absent
side flatters the delta and must still not be accepted, and a populated fold
that is still judged. Five mutations, each caught: requiring both sides empty
rather than either, dropping the guard from the disposition, dropping the reason
branch, dropping it from the acceptance conjunction, and moving the leg back
above the pairing floor.

## What is NOT fixed here

**Eight other tracked market-grain gradings carry the same defect, on 416
(market, variant) pairs**, and are not regraded in this change set:
`admission-derived-grading.json` (120), `stop-cap-grading.json` (88),
`per-market-grading-classfolds.json` (68), `review-window-grading.json` (45),
`stop-cap-8-grading.json` (32), `class-default-gate-off-grading.json` (25),
`class-default-grading.json` (23) and `review-window-96-grading.json` (15).
Their corpora are on disk, so regrading costs no provider bytes — but some of
them feed amendment 36's removal test through `register-verdict`, so a batch
re-run looked capable of moving a recorded register decision.

**That analysis has since been done, checked by a second agent that recomputed
every load-bearing figure, and the answer is: regrade the eight, no recorded
decision moves.** The reason is structural rather than empirical. The guard is a
NEGATED conjunct of `beatsBaseline`, so it can only remove an accept, never
create one. The exposure is therefore one-directional and confined to the
**29 accepted (market, variant) pairs across the eight gradings** — counted from
the artifacts, none of them on any of the sixteen empty-fold markets, and each
carrying more than ten thousand emitted fit rows on both sides. And `register-verdict` consumes these gradings only through
`removalOutcomeOf`, which branches on `net.n`, `net.upper` and `net.expectancy`
and never on `accepted`, `reason` or a disposition. Measured over the four
removal arms: 1,151 cells tested, 360 retiring, 53 of them carrying a NO VERDICT
reason — and all 53 are the `pairing 0 nonzero` case, cells identical to the
baseline whose absolute figure is genuinely measured. Zero `fitEvidenceAbsent`
cells reach the removal test at all.

Seven corrections belong in that change set, and the first is the one that
matters most:

1. **The composition moves in BOTH directions, not only #647's.** Under #616's
   `underpowered` split, 71 of the 144 THIN pairs carry 30 or more fills and
   move OUT of no verdict into the judged `fails` bucket — the opposite
   direction from this fix. The other 73 stay no-verdict with new wording.
2. **Ten** of the sixteen empty-fold markets are in `ENGINE_DECLINED_MARKETS`:
   ASX, AAVEUSD's siblings AVAXUSD, DOTUSD, DYDXUSD, EGLDUSD, GRTUSD, HBARUSD,
   NEARUSD, SOLUSD and UNIUSD. UNIUSD is the one an earlier count of this set
   missed, and its disposition is `stays`, resting on select-fold net figures
   the fix does not touch.
3. **At least 386 of the 416 pairs relabel, and 386 is a FLOOR rather than an
   exact figure.** Counted from the eight artifacts, the sixteen empty-fold
   markets carry 386 bare `fails` and 30 `THIN`, which is the 416 exactly. The
   386 is a floor because the population was derived from the manifests'
   `emitted` counts while the guard reads `.filled`: a fold with emitted rows
   that all came back unfilled trips the guard too, and no derived variant
   appears in a manifest at all. Measuring `filled` directly from the corpora
   would give the true figure.
4. Six of the 144 THIN pairs (ZTUSD in `per-market-grading-classfolds.json`)
   carry no `select` key at all — that artifact predates #571 — and are safe
   because 7 fills is below its own 30-filled floor, not because their money
   term was read.
5. The acceptance bar is every numeric field identical, `derivedAt` excluded
   since it is a fresh timestamp that moves every file's hash regardless, and
   `per-market-grading-classfolds.json` exempted from "no new fields": a re-run
   adds `select` and `derived` per variant and `derived` and `emitSha256` at the
   top level, because it predates #571.
6. Regenerate the `*-grading.stdout.txt` records with the artifacts they
   print. **Scoped by item 7 (2026-09-16):** a stdout record and its JSON are the
   same run's two outputs, so the stdout twin of every sealed input is sealed with
   it — and so are the burned read's own artifact file and its printed record. Regenerating a twin beside a sealed JSON would leave the pairs
   disagreeing with nothing cross-checking them. **The SEALED INPUTS are twelve
   gradings, not seven**: the freeze body also carries `classes`, `classAxes`,
   `classCellsTested` and `expectedFalseAcceptsClasses`, computed from five
   class-grain gradings (review-window, review-window-96, stop-cap, stop-cap-8 and
   admission-derived, each `-grading-class.json`), and it records NO checksum for
   them. All four class-grain gradings this note lists as stale are among those
   five. The twelve sealed inputs and the twelve STALE RECORDS listed further
   down are different sets that share eleven files: `per-market-grading-classfolds`
   is stale but not sealed, and `review-window-96-grading-class` is sealed but not
   stale. So of every stale record, only `per-market-grading-classfolds`
   regenerates in place; the other eleven, and the stdout twins of every sealed
   input, get their regraded output written somewhere new. A sealed input may not
   be condemned in place with an INVALID stamp either; a condemnation goes in
   `docs/research/confirm-reads/CONDEMNATIONS.md` — Markdown, never `.jsonl`,
   since that directory is globbed for ledgers on every confirm read.
7. ~~Re-run `freeze-candidates` or re-record the seven `artifactSha256` values in
   `r4/frozen-candidates.json`.~~ **WITHDRAWN 2026-09-16 — DO NOT DO THIS.** Seven of
   the eight gradings are the freeze's arms, the inputs of the sealed act-3 read,
   and `frozenHash` is computed over the whole freeze body INCLUDING those seven
   checksums (`scripts/freeze-candidates.ts`, `frozenHashOf`). The burned read
   `docs/research/confirm-reads/ledgered-read-act3.json` binds that `frozenHash`.
   Re-running the freeze or re-recording a checksum changes it and severs a read
   that can never be repeated; overwriting an arm in place without doing so
   leaves the freeze naming a file whose hash no longer matches — and SILENTLY,
   because nothing re-verifies the arm checksums at run time.
   `verifyFrozenCandidates` checks the rule hashes and `frozenHash` over the body
   and never re-hashes an arm file on disk; the only comparison of
   `artifactSha256` against a real file is `tests/freezeCandidates.test.ts`,
   against that test's own fixture. **Enforced since 2026-09-16** by
   `tests/sealedArmsUnchanged.test.ts`, which re-hashes the seven market arms
   against the freeze, pins the five class arms to the blobs commit 7c55cd3 wrote
   (the freeze records no checksum for them), recomputes the sealed read's own
   content hash, checks the confirm-log ledger agrees, and holds the freeze and
   read hashes as written-down constants. It fails by name on an overwritten
   market or class arm, a tampered freeze, a consistent re-freeze, and the freeze,
   read and ledger rewritten together. It also pins the freeze file's own bytes, the sealed read's own file bytes and
   printed record, and the stdout twin of every sealed
   input, and only one of its tests depends on the rule constants in code, so a
   deliberate re-ruling fails that test alone. The premise that
   drove this correction is right — a regrade in place does falsify the binding —
   and the conclusion was the wrong way round: the arms must stay byte-identical.
   How to regrade without touching them is being designed and refuted before
   anything is built.

One thing remains unestablished and is stated as such: that a regrade reproduces
the numeric fields bit for bit. The only behavioural changes on the net-arm path
since those artifacts were written are #616's underpowered split, #617's reason
wording and #647's guard — but that is code reading, not execution.

The seven class-grain gradings beside them are NOT the same defect: their rows
repeat one class verdict per member market, so an empty per-market fold is not
what was graded there. **That exemption is about THIS defect only.** The printer
repair recorded further down is grain-agnostic and does reach four of them.

## Where the disposition leaked afterwards

The ladder draws the distinction correctly. Three places downstream then threw
it away, all found by adversarial review after the fix landed and all repaired
in the same change set as this paragraph.

**The sealed ledgered read wrote a refusal to judge as a rejection.** The frozen
candidate's `disposition` was `verdict?.accepted ? "accepted" : "rejected"`, so
an underpowered or unmeasured candidate was recorded as judged and refused — in
the one artifact that is burned once and can never be rewritten. An ABSENT
verdict took the same branch, with `reason` reading "no verdict" beside a field
saying "rejected". No recorded read is affected: all nine candidates in
`ledgered-read-act3.json` were accepted. But the repository's own test suite
pinned the binary, and its fixture comment described the case as the read being
unable to judge while asserting the word "rejected" — so the defect was not
merely latent, it was written down as correct. The union now carries
`"no-verdict"`.

**The grading artifact had no field for it.** The gate forbids re-deriving a
disposition from the reason string, and then wrote `accepted` and `reason` and
nothing else — so a consumer obeying the ban had no field that answered the
question, and `accepted: false` covered both a measured loss and a refusal to
measure. The record now carries `noVerdict`.

**The printed table rendered a judged refusal as the bare word.** The D4 money
leg writes "LOSES MONEY — beat the baseline on every delta, but its own
select-fold expectancy is not positive beyond its error", with a comment saying
it is named so it can never again be read as an ordinary failure. The printer
rendered it as `fails`. Only a verdict whose reason IS "fails" prints the bare
word now.

**Still open, parked with the regrade.** The same absent-reads-as-zero
construction publishes `selectTotalDelta` and `selectExpectancyDelta` as
flattering positives on an empty SELECT fold: +20 and +0.50 with zero select
fills on the suite's own fixture, both written into every grading artifact.
Nothing is accepted on them — `earnsMoney` and the pairing floor block it — but
they are printed and published, now beside a `noVerdict` field saying the
verdict is sound. The fix is to make both null when the fold is absent on either
side, as `confirmTotalDelta` already does. It changes published numbers rather
than adding a field, so it rides with the regrade of the eight market-grain
gradings where the before-and-after comparison can account for it.

**A fourth consumer, one file further out.** `derive-4d.ts` published
`measureOnly: accepted.length === 0`, which is true both of a market whose
variants were measured and refused and of one the gate declined to judge on
every variant — opposite next moves under one flag. The `starved` flag beside it
is derived from `fitFilled < 30`, so it covers part of the empty-fit leg and
none of underpowered, sub-floor pairing or absent baseline, and being a row
count rather than the ladder's own word it can disagree with the verdicts it
sits next to. The artifact and the printed summary now carry `unjudged`, read
from the verdict's own `noVerdict`.

**The three published reads were regenerated.** Fixing a writer does not fix the
records it already wrote, and all three tracked hour-gate artifacts carried both
defects: 73 money-leg reasons in the JSON and none of them in the printed table
beside it, and no disposition field anywhere. Re-run from their own recorded
commands at zero provider bytes, the acceptance bar holds exactly — **not one
numeric or boolean field moved, not one reason string changed, the only added
key is `noVerdict`, the top level is identical apart from `derivedAt`, and the
accepted counts are unchanged at 0, 1 and 0.** What changed is that 212 variants
per read now say they were never judged, and the 26, 23 and 24 money-leg
refusals now appear in the tables that had rendered them as the bare word.

Three acceptance boundaries were also unpinned — the whole suite survived
mutating each. A fit-fold delta of exactly zero (`> 0` to `>= 0`), a select
expectancy whose lower bound is exactly zero (the same change to the money
leg), and the selective share threshold (0.5 to 0.9, which would have had the
gate tell a variant trading three fifths of the baseline's fills that it trades
under half). Each now has a fixture sitting ON the boundary, because a fixture
near one pins the direction and not the comparison.

## The artifacts

The three tracked hour-gate artifacts are regenerated in place by re-running
their own recorded commands against their own corpora, at zero provider bytes,
so the command in each record reproduces the file beside it. Git history holds
what they said before, and the table above is the difference. Note that the
2026-09-12 note's command block omits `--out`, and its stdout now carries an
`R column: net arm` header line that the `--r-arm` flag introduced two days
after that read; the default is `net`, so no figure moved.

**That reproducibility claim covers these three and no others.** The printer
repair changes the label on every judged refusal, and it is GRAIN-AGNOSTIC — the
exemption two paragraphs above, that the seven class-grain gradings are not the
same defect, is true of the empty-fold defect and false of this one. Twelve
tracked records — the TWELVE STALE RECORDS, not the twelve sealed inputs named
under item 6, though eleven files are in both — now print a word their own JSON
contradicts:

| grain | records | reason occurrences | printed rows that change |
|---|---:|---:|---:|
| market | 8 gradings | 105 | 105 |
| class | 4 gradings | 314 | ~27 |

The two denominators are not the same, and mixing them would overstate the
class-grain remediation tenfold. At the market grain there is one verdict per
(market, variant), so occurrences and rows coincide — which is why 24 money-leg
reasons in the regenerated `hour-gate-market-net` read produced exactly 24
changed table lines. At the class grain the rows repeat one class verdict per
member market, so what changes is the DISTINCT verdict count: 18, 5, 3 and 1 for
`admission-derived-grading-class`, `stop-cap-8-grading-class`,
`stop-cap-grading-class` and `review-window-grading-class` against occurrence
counts of 249, 49, 15 and 1.

The worked case: `review-window-grading-class.json` records `LOSES MONEY — …
expectancy -0.1821R … (95% lower -0.2896R over 208 filled)`, and the row for
that same verdict in the table beside it reads `fails`. Same fit ΔR, same
paired p, same bounds.

All twelve stale records are owed with the regrade already recorded as owed, and until that
lands the command in each of them does NOT reproduce the file beside it. Saying
so is the point: a record that quietly stopped reproducing is worse than one
that says it stopped.

**Three more records predate a field rather than a label.** `derive-4d` now
publishes `unjudged`, read from the gate's own disposition. The artifacts it
wrote before this change set carry only `measureOnly`, and between them publish
**48 markets** a reader still cannot tell apart as measured-and-refused versus
never judged: `4d-candidates.json` 25, `4d-totality-candidates.json` 18,
`4d-holdout-candidates.json` 5, all under `baseline-2026-08-10/`. Nothing
branches on the flag — `confirm-4d` computes its own `gate-could-not-judge` from
the in-memory verdict — so the harm is to a reader, which is the consumer this
file exists for.
