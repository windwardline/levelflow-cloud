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

One file per corpus, named for the corpus's identity: a hash of the
conditions every shard of one measurement shares (`conditionsOf` — analyzer
version, clock, conditions block, fold spec, grid, step size, day-stable
curve facts) together with the sweep's anchor and day count. The identity
excludes `symbols` on purpose, so grading a SUBSET of the shards resolves to
the same file and still refuses; it includes anchor and days so a re-sweep
does not collide with the corpus it replaces.

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

Two retired locations are still searched on read, never written:
`<shard-dir>/confirm-log-<id>.jsonl` (round 44) and
`<shard-path>.confirm-log.jsonl` (the original). A ledger written by either
earlier version keeps refusing.

`--confirm-log-dir` redirects **where a read is written**, never where prior
reads are looked for: this directory is searched on every `--confirm-final`
run whatever the flag says, and a redirected run warns that it is filing
outside the record. The flag exists so the executed tests can drive the real
binaries without appending here; an operator grading a real corpus has no
reason to pass it, and it is not an escape from the discipline —
`--acknowledge-prior-reads` is the sanctioned one, and it still logs.
