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

`--confirm-log-dir` redirects **where a read is written**, never where prior
reads are looked for: this directory is searched on every `--confirm-final`
run whatever the flag says, and a redirected run warns that it is filing
outside the record. The flag exists so the executed tests can drive the real
binaries without appending here; an operator grading a real corpus has no
reason to pass it, and it is not an escape from the discipline —
`--acknowledge-prior-reads` is the sanctioned one, and it still logs.
