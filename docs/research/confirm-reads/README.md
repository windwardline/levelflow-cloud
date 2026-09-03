# LA-6 confirm-read ledger

Every read of a sweep corpus's held-back **confirm** fold is recorded here,
permanently, as one JSONL line. `gradeCorpus` (`scripts/grid-totalr.ts`)
appends it after the verdicts exist, and only when a confirm figure was
actually produced — a run that accepts nothing, or whose accepted variants
carry no filled outcomes on both sides of the fold, reads nothing and writes
nothing. A corpus whose ledger already holds a read refuses to open the fold
again without `--acknowledge-prior-reads`, and the refusal names what it
found: where, when, which key matched, and how the read's shard population
compares to the recorded one.

One file per corpus, named `confirm-log-<identity>.jsonl` — the prefix
is load-bearing, since the prior-read scan globs whole directories and an
operator may point `--confirm-log-dir` at the sweeps directory, where an
unprefixed glob would admit every corpus emit as a candidate ledger. The
identity is a hash of the conditions every shard of one measurement
shares — `conditionsOf`, which is
analyzer version, clock, conditions block, **sweep depth in days**, fold
spec, grid, step size, and the day-stable curve facts. It is exactly the
predicate the shard loop refuses a mismatched shard over, which is what
makes an identity derived from it invariant to shard order and to subsets:
grading a SUBSET resolves to the same file and still refuses.

Two exclusions, both deliberate, and each with a residue worth stating
because neither is free:

- **`symbols`.** The union differs between a full read and a subset, so
  including it would let a subset read the fold unrecorded — the failure
  this whole design exists to prevent. The residue: two sweeps over
  *different symbol populations* that share every other term resolve to one
  identity and one ledger file, so reading the first refuses the second's
  first read. That is a false refusal costing one logged acknowledgement,
  taken over a missed one.
- **`anchor`.** It is `isoDate(new Date())` stamped per invocation, and
  shards are separate invocations, so a sweep crossing midnight or a
  re-run dead shard would give the set a population-dependent identity and
  a later subset read would find nothing. An earlier version included it
  and had exactly that defect.

A consequence of both, stated plainly: a re-sweep at the same version,
clock, grid, folds, conditions and depth **does** collide with the corpus it
replaces, and its first confirm read will demand `acknowledgePriorReads`.
That is intended — a second confirm read of the same measurement re-run is
precisely what this discipline exists to make expensive.

The directory itself is resolved from `grid-totalr.ts`'s own location, never
from the working directory, so the record does not move when the operator
does.

**These files are tracked in git deliberately**, for the reason
`docs/HANDOFF.md` is: a discipline whose record lives only on the machine
that ran it is no discipline at all. Round 44 keyed the ledger on the corpus
and left it filed beside the shards, which meant copying a corpus elsewhere
to grade left the record behind and the copy could be read forever while the
original's count never moved.

Commit any line that appears here — and the burn says so itself, printing the
exact `git add` for the file it just wrote. That reminder lives at the read
rather than in CI on purpose: CI runs on a clean checkout, so an uncommitted
ledger line exists only on the machine that did the reading and is precisely
what CI cannot see.

THREE retired forms are still searched on read, never written:
`<corpusId>.jsonl` in this directory (before the ledger's name carried a
prefix), `<shard-dir>/confirm-log-<id>.jsonl`, and
`<shard-path>.confirm-log.jsonl` (the original). A ledger written by any
earlier version keeps refusing — which is why this directory is globbed
UNPREFIXED while the operator-controlled ones are not: adding the prefix
would otherwise have orphaned the form written immediately before it.
Scope, stated: that unprefixed form is honoured HERE only. A directory
named by `--confirm-log-dir` is globbed with the prefix, because it may
be the sweeps directory and an open glob there would admit corpus emits
— so a pre-prefix ledger written under a redirect is not found. The
redirect is the test hatch and already warns that it files outside the
record, so nothing an operator did on the default path is affected.

The search is widened across **identities** as well as locations, which
matters because `conditionsOf` grows: it has been amended several times, and
each amendment changes every corpus id. Since the id is both the filename
and the entry key, a read recorded under a previous definition would
otherwise go unreachable on both halves at once. So every `*.jsonl`
in this directory is read rather than the one name today's identity computes,
the retired per-directory form is globbed rather than named, and an entry
matches if it shares **any shard hash** with the read being attempted —
a fact about the shard files themselves, which no amendment can move. Each
entry also records the identity's payload, not just its hash, so a later
reader can see which definition a read was filed under.

A line this scan cannot read **refuses the run, by name** — the ledger path,
the line number, and the remedy — rather than being skipped. Three shapes
refuse: a line that is not JSON, a line that parses to something other than
an object, and an object carrying no `corpusHash` string. The reason to
refuse rather than skip is the discipline itself: an unreadable line's
contents are unknowable, so skipping one means possibly opening the
held-back fold a second time while believing no prior read exists. A false
refusal costs an operator one repair — from git history, since these files
are tracked — and a missed one costs the measurement. Note the blast radius
this cuts both ways: because this directory is globbed whole on every
confirm read, one bad line blocks every corpus, not just its own, which is
why the message says so and names the file. A `.jsonl` that is not a ledger
does not belong here; move it rather than leaving it to be read as one.

`--confirm-log-dir` redirects **where a read is written**, never where prior
reads are looked for: this directory is searched on every `--confirm-final`
run whatever the flag says, and a redirected run warns that it is filing
outside the record. The flag exists so the executed tests can drive the real
binaries without appending here; an operator grading a real corpus has no
reason to pass it, and it is not an escape from the discipline —
`--acknowledge-prior-reads` is the sanctioned one, and it still logs.


## The read since R4 act 2 (2026-09-02)

The read covers **every market's shipped cell** as well as the accepted
variants: per market, the shipped cell's absolute confirm expectancy NET and
GROSS with a 95% interval and n, M3's outcome against the pre-registered
decline rule (`scripts/ledgeredRead.ts`, `DECLINE_RULE`, hashed into the
artifact), and `heldBack` — whether the cell was selected on rows inside this
corpus's confirm window, from `docs/research/r4/shipped-cell-provenance.json`.
A market with no provenance is recorded as NOT held back, and no consumer may
print a figure that is not held back. Consequently a `--confirm-final` run over
a corpus holding confirm rows is a read whether or not any variant was
accepted: **one burn for the whole program, taken once**, after every
supplementary arm has been graded on select and frozen.

The read writes two files: the ledger line, and the read's own artifact
(`--read-out`, or `ledgered-read-<corpus>-<readId>.json` beside the ledger),
whose `artifactHash` the line records. The line now carries `baselineVariant`,
`verdictUnit`, `includeHoldout`, `symbolFilter`, `symbolsRead`, the holdout
rule and set, `emitSha256` per shard (the bytes, which no manifest hash binds),
`calendarHash` and `artifactHash`. Consumers open the artifact only through
`readLedgeredArtifact(path, { manifestHash })`, which refuses a condemned,
foreign, tampered or re-ruled artifact.

**The held-back calendar.** LA-6 keyed the prior-read refusal on corpus
identity, and a supplementary arm at the same anchor is a new identity — the
same held-back fold could have been read twice under two grids. The ledger
line records `confirmSpans`: per requested symbol (and every symbol the shards
carry), the confirm window in DATES ONLY — no analyzer version, clock or fold
shape enters it, because none of those makes the bars different bars. The
prior-read scan refuses a read whose windows OVERLAP a recorded read's on any
shared symbol, with the same acknowledgement escape; a recorded read on a
manifest without `requestedSymbols`, or carrying a symbol its request did not
name, is refused before the fold opens. `calendarHash` is only the hash of the
spans, for the eye. A read at any verdict unit burns the calendar: the fold
read is the same fold.

**No per-market fold re-cut.** The 2026-08-11 totality mode re-cut each
market's span from row instants; under the sealed door it demoted emitted
select rows into a local fit, and under `--confirm-final` it relabelled a
median 329 days of the held-back fold into select. It is retired; the emitted
per-class labels are the only fold source, and `--verdict-unit market` is the
per-market grain.


## The read since R4 act 3

The read is freeze-driven. `scripts/freeze-candidates.ts` binds every arm's
tuning-fold grading by its bytes and freezes one candidate per market under a
hashed rule (with the retirement rule's verdicts for the decline candidates);
`grid-totalr --confirm-final --verdict-unit market --frozen <frozen-candidates.json> <every arm's corpus>`
then opens the one baseline (from the first corpus, verified row-for-row
against every other corpus's, confirm fold included) and each market's frozen
candidate from its own arm, under ONE ledger line whose `frozenHash` names the
file, and one calendar key over the requested roster. Every corpus is bound to
the emit digest its arm's grading recorded. The same burn carries the class
grain: per class per axis, the frozen class-unit candidate over the class's
pooled members and, apart, its held-out members. Candidates are judged by
DELTA_RULE on their confirm delta; the read verifies each candidate's
tuning-fold figures against the frozen file before it opens the fold, and
`--rehearse` runs every one of its checks with the fold withheld, so the
refusals are found before the burn, never inside it. Nothing decides on the held-back fold
after seeing it: the candidates were frozen before the command ran, and the
door refuses a file altered or re-ruled since.
