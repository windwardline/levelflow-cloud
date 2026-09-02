# R4 act 1 — the confirm fold is sealed at the door (2026-09-02)

Record of the first act of R4, gated by the owner's approval of 2026-09-02
("Recommendations are approved… the fan out approach, adversarial passes,
mutation testing, and fresh eyes reviews of the converge cycle are
non-negotiable"). It closes 6b-0's reopened corpus-readers row and lifts the
gate on R4's per-market grading. Nothing here reads the confirm fold, moves a
calibration value, spends a provider byte, or touches the desk.

## 1. The defect

R3's audit (`r3-one-resweep-2026-09-02.md` §7) found twelve corpus readers
pooling or printing figures over the CONFIRM fold with no opt-in and no LA-6
ledger line; five of them re-cut the folds themselves at 50/75% of a market's
span and never read `row.split`. The design review of this act (§5) widened the
population to the nineteen scripts that open the corpus door, and found two
more exposures: `feasibility-4d` read confirm rows' fill status, and the
driver's own stdout table printed the confirm split's three outcome columns on
every run — 679 numeric rows per arm sat in four local logs.

A per-market grade read through any of these would have burned the one
confirmation read with no ledger line. R4 could not start until the door was
closed.

## 2. The design: one door, sealed by default

`scripts/sweepStats.ts` is the only place rows enter a reader. It now carries:

- `SEALED_FOLD = "confirm"` — named once, cited everywhere.
- `FoldGate = { confirm?: "read" | "sealed" }` — the door's one option. Any
  other value is refused (`confirm must be "sealed" or "read"`).
- `tuningFolds(manifest)` — the folds a reader may tune on, in the corpus's own
  vocabulary: `fit`/`select` on a folded manifest, `train`/`test` on a legacy
  one. No reader spells a fold name in code.
- Three doors, one law: `assertManifestedCorpusStreaming`,
  `assertManifestedCorpusSync` (new — the `readLinesSync` readers migrate
  onto it) and `assertManifestedCorpus` withhold `split === "confirm"` rows
  unless the caller passes `{ confirm: "read" }`, and return the manifest with
  `sealedRows`, the count withheld, so every reader can state its population.

Two callers may open the fold, each with a stated premise:

| Caller | Premise |
|---|---|
| `grid-totalr` | `{ confirm: options.confirmFinal ? "read" : "sealed" }` at its one streaming call — THE read, under `--confirm-final`, which writes the LA-6 ledger. `confirm-4d` reaches it the same way. |
| `feasibility-4d` | Reads the PLANNED entry price of every row for sizing; reads no outcome, R, fill, tp1 or exit field. Pinned in `tests/readersStateTheirAcceptance.test.ts` (premise and prohibition both asserted) and proven by execution in the guard. Until this act it read the entry LEG's price, which is empty on an unfilled row — a fill-conditioned read by construction. |

## 3. What each reader does now

| Reader | Before | Now |
|---|---|---|
| `sweep-analysis`, `account-type-report`, `geometry-evidence`, `e4-collapse` | streamed every row | door seals; each prints the withheld count beside its holdout line; "all splits" wording replaced by the tuning folds read; `geometry-evidence` refuses a corpus with zero readable baseline rows instead of printing empty tables at exit 0 |
| `stop-provenance`, `exclusion-suspects`, `confidence-bands`, `ag-class-derivation` | raw `createInterface` loops; `train`/`test` hardcoded | streaming door; `tuningFolds`; stop-provenance's held fold is the SELECT tuning fold (was "the last fold in the corpus", which had become confirm); a corpus whose readable rows number zero is a refusal naming the seal |
| `roster-expectancy-audit`, `market-dossier` | 50/75% re-cut from spans; confirm accumulators; verdict/ranking on corpus-derived confirm | sync door; rows classified by the EMITTED split against `tuningFolds`; unknown split refused by name; verdict and ranking on select; confirm figures only from the RECORDED `4d-*-confirm-read.json` reads; artifact keys renamed `select*` with `folds`/`rows` provenance |
| `cost-sensitivity-verdict`, `threshold-rescue` | 50/75% re-cut; withdrawal verdict on gross confirm E; rescue rule `selectE > 0 && confirmE > 0` | sync door; select interval, same thresholds and floors; rescue rule select-only (confirm confirms through the ledgered read; it never chooses) |
| `feasibility-4d` | entry LEG price + `outcome === "unfilled"` | `{ confirm: "read" }` with premise; planned `entryPrice`; no outcome field |
| `two-arm-reconcile` | printed values of differing fields | reads every row of both arms (row equality is its purpose) but a differing CONFIRM row is reported by field name only: `realizedR (values withheld: sealed fold)` |
| `tuning-folds-summary` | counted confirm rows it streamed | counts the door's `sealedRows` in its denominator line, which stays true against the manifest's row count |
| `data-limits`, `derive-4d`, `grid-totalr` | sealed by their own construction | unchanged in behaviour; `grid-totalr` states its option explicitly |
| `confirm-4d` | the burner | untouched; excluded from the guard by name |

The driver (`scripts/replay-sweep.ts`) prints `sealed` in the `unfilled`
column and the three outcome columns of confirm rows unless
`--print-confirm-table` is passed: a fill is the first outcome event, so the
fold's fill rate is sealed with its results. The tallies in those rows
(decisions, rejections, setups, data-absent) are decision-time and stay.
`starvation-audit` consumes only those columns; the four tracked R3 tables
were re-redacted to the four-cell seal and both tracked starvation audits
reproduce byte-identically from them. The four local raw logs that held the
unsealed cells were deleted. Residue: the tracked tables carried the confirm
fold's fill counts from 06:12Z to 16:20Z on 2026-09-02, in the repository's
history; its results never were.

The driver also now refuses a run whose fold embargo the longest review window
could cross: `assertEmbargoCoversReview(FOLD_EMBARGO_MS, hours)` in
`scripts/sweepFolds.ts`, called with every roster symbol's shipped
`defaultReviewHours` and every grid override. The resolver's horizon is
`reviewHours + 24h`; the 5-day embargo covers every shipped cell (largest 24h)
with room, and an arm asking for more than 96h is refused by name rather than
reading the next fold's bars. Nothing had asserted the constant against the
axis.

## 4. The guard — executed, population-derived, mutation-tested

`tests/confirmFoldSealed.test.ts`:

- **Population** — every `scripts/*.ts` whose CODE (comments stripped) opens
  a door (the same regex as `tests/emptyCorpusRefusals.test.ts`, widened to
  the sync door) or reads lines raw (`createInterface`, `readLinesSync`,
  `JSON.parse(line)`), so a reader that bypasses the door is still in the
  population. The argument table must cover it exactly: a reader without an
  entry fails, an entry without a reader fails. Nineteen readers plus
  `grid-totalr --per-market-folds` as a second shape; `confirm-4d` excluded
  by name with its reason.
- **Fixtures** — seven markets across five classes (two correlated pairs so
  the collapse instrument has groups), two grid cells, three folds,
  40 decisions per cell, every column a real emit carries. A: a realistic mix of
  outcomes; A′: byte-identical to A; B: every confirm row a +9R full win; C:
  every confirm row unfilled, so fill counts differ from A too. Data-absent rows
  and decision-time fields (accepted, prices, risk distance, confidence, stop
  provenance) are held constant and asserted so. Each fixture carries its own
  picks tree for the two readers bound to recorded 4d reads, so nothing depends
  on the tracked, invalidated artifacts.
- **Surfaces** — stdout, stderr and every file under the fixture directory
  that is not an input (the run's own artifact directory and anything written
  beside the corpus), after masking fixture paths, corpus hashes, byte sizes
  and ISO instants within a day of now (`derivedAt`). Nothing else is masked:
  a corpus instant printed as ISO, or any bare number, stays visible. Every
  run must exit 0 and print something: a harness failure cannot read as
  sealed. The repo's `docs/` tree — where every artifact writer's default
  path lives — must be unchanged after the runs (a filesystem snapshot, so
  the guard needs no `.git`).
- **Law** — the (surface, line) pairs that differ between A and B, or A and C,
  must be a subset of those that differ between A and A′.
- **Source law** — in code, comments stripped, either quote style: no reader
  outside the burner declares a flag naming the fold (`grid-totalr` keeps
  `--confirm-final` and `--confirm-log-dir`); the door's `confirm:` option
  may appear only as the explicit `"sealed"` — an aliased value (`confirm:
  MODE`) or a handled `FoldGate` type is refused by shape; the two callers
  that open the fold are pinned to their exact forms, and the sizing pass
  may read none of twelve outcome-bearing fields (outcome, gross outcome,
  net and gross R, tp1 hit, fill and exit instants, legs, excursions,
  forgone runner R, unfilled approach distance).

Runtime 3.3 s (76 process runs, four in parallel per reader).

**Mutation results**, each applied, run, reverted with a SHA-256 check:

| Mutation | Result |
|---|---|
| `sealsConfirm` returns false (the door never seals) | 12 of 22 runs fail: account-type-report, ag-class-derivation, confidence-bands, cost-sensitivity-verdict, e4-collapse, exclusion-suspects, geometry-evidence, market-dossier, roster-expectancy-audit, stop-provenance, sweep-analysis, threshold-rescue. The seven that stay identical are sealed by their own construction (data-limits reads no outcome; derive-4d and grid-totalr in both shapes gate the fold on `--confirm-final`; tuning-folds-summary refuses the fold by name) or read it by stated premise (feasibility-4d, two-arm-reconcile). The first version of this fixture left e4-collapse's run vacuous — correlated symbols carried identical outcomes, so its paired within-group statistic was zero whatever the rows held — which the mutation exposed; the fixture now carries two correlated pairs with per-symbol outcome offsets, and the instrument's permutation p moves with the fold when the door is open. |
| `stop-provenance` passes `{ confirm: "read" }` | 2 fail: the source law names the reader, and its executed run changes with the fold. |
| `stop-provenance` passes `{ confirm: MODE }` with `const MODE: "read" = "read"` (the review's evasion) | 2 fail: the shape law ("a confirm option that is not the explicit seal") and the executed run. |

Companion pins: `tests/sealedDoor.test.ts` (9: the three doors seal alike,
`sealedRows`, the option refusal, legacy no-op, the sync door's line-numbered
parse refusal); `tests/sweepAnchor.test.ts` (the driver's flag default and the
sealed cells); `tests/sweepFolds.test.ts` (the embargo assertion, including the
vacuous-empty refusal); `tests/twoArmReconcile.test.ts` (redaction);
per-reader tests rewritten to the sealed truth (`stopProvenanceReader`,
`marketDossier`, `costScaleReachesResolver`, `rosterExpectancyAudit`,
`geometryEvidence`, `e4Collapse`, `tuningFoldsSummary`).

## 5. Design review — what the two lenses killed and what changed

Two reviewers read the design before code (ops/engine lens; statistical and
look-ahead lens). Their kills, and the disposition of each:

| Kill | Disposition |
|---|---|
| "Twelve + two doors" is not the population; the door regex finds nineteen, and `feasibility-4d` read confirm fill status | Accepted. Population derived, not listed; feasibility premised and pinned; `two-arm-reconcile` keeps reading every row and redacts. |
| Item 5 of the design was false: `grid-totalr --per-market-folds` re-cut SELECT past the class confirm start for 56 of 97 R3 markets, so declared-confirm rows graded as select without `--confirm-final` | The reviewer read the pre-change code. The sealed door withholds label-confirm rows before the re-cut; the guard runs that shape and it passes. The residue — the ledger entry under `--confirm-final` records no per-market-folds term — is OPEN (§6). |
| Three readers' PURPOSES are confirm decisions the gate cannot serve today (roster audit's absolute confirm E per market; cost-sensitivity's withdrawal on gross confirm E; threshold-rescue's both-folds rule); re-pointing them at select makes them in-sample | Accepted as an OWNER item (§6). They are sealed now and say what they read; their held-back verdicts must come through the one ledgered read once it carries what they need. |
| Legacy train/test as "tuning" contradicts the seal: in the two-split design `test` was the confirmation fold | Residue stated (§6): no valid legacy corpus exists; the door seals nothing on one and `tuningFolds` names its folds honestly. |
| The differential guard leaks: count-only reads, flag-gated reads, side channels (stderr, `derivedAt`), a masked corpus hash | Fixtures hold counts constant and vary outcomes, fills and R sign; the source law scans flags; stderr and artifacts are surfaces; the mask is learned from A vs A′ and backed by a static instant/duration mask (two artifacts derived in the same millisecond had defeated the empirical one alone). |
| The embargo is an unasserted constant against a grid axis (`defaultReviewHours`); an arm above 96h reads confirm bars | Closed: `assertEmbargoCoversReview`, driver-called, tested. |
| R3's confirm fold was already printed unsealed in four local raw logs | Closed: deleted; the tracked redacted tables carry `sealed`. |

**A third lens — the shipped guard's soundness** (fresh eyes, after code):
count-only reads CLOSED by execution (a scratch reader counting confirm fills
was caught: 392 vs 448); the time-based re-cut CLOSED (the door withholds by
label before any re-cut); side channels CLOSED for the current readers;
legacy CLOSED as stated. Three PARTIALs, each closed in the same change:
the source law was evadable by an aliased option (`confirm: MODE`) and by a
single-quoted flag — now a shape law over code with comments stripped,
either quote style, with `FoldGate` refused outside the two callers; the
static mask erased any ISO instant and any integer before "s" (a scratch
reader printing the corpus's `max(exitAtMs)` as ISO passed) — now only
instants within a day of now are masked and no duration is; and one
outcome-conditioned column, `unfilledApproachDistance`, never varied
between fixtures — it now moves with the outcome and is on the sizing
pass's forbidden list. Two residues it named are also closed: the
population now includes raw line readers, and the artifact walk covers the
whole fixture directory rather than the run's own subdirectory. What it
left open is what §6 already carries: the ledger term for per-market folds,
and that the fixture's select fold lies before the 75% cut so the
per-market re-cut never re-labels a select row (structurally moot — the
door seals before the re-cut — and stated here so no one reads the passing
run as exercising it).

**A fourth lens — silent failures on the diff** (executed over four
fixture corpora: folded, legacy, confirm-only markets, an unknown split).
KILLED one claim: the three doors were not identical — the sync reader
decoded each 64 KB chunk on its own and split a multi-byte character at the
chunk edge into replacement characters where the streaming door read it
whole (exposure nil today: every string column is an ASCII enum; wrong all
the same). Closed with a `StringDecoder` and a parity test that places a
three-byte character at byte 65,535 and fails on the old reader. Its other
findings, each closed here: `confidence-bands` and `ag-class-derivation`
tallied an unknown split into totals and printed only fit and select (now
refused by name; `tests/unknownSplitRefused.test.ts` executes five
split-classifying readers against a `weird` split); the driver's embargo
check ran before the roster refusal, so an unknown symbol surfaced as "no
review windows" (reordered); `grid-totalr`'s sealed label carried no count
(it does now); the driver still printed the confirm fold's `unfilled` tally
(sealed, with the tracked tables re-redacted); and a `--per-market-folds`
read is blind to a market whose every row sits in the global-fold corpus's
confirm fold — the per-class corpus is the only instrument for those
markets, and HANDOFF said otherwise (corrected). Survived, with evidence:
no silent drops (unknown splits refuse by name in the four re-cutters and
stop-provenance; `sealedRows` sums per shard), no vacuous verdict (every
key of every verdict reachable through select; floors unchanged; renamed
artifact keys have no live consumer), legacy corpora read correctly, R3's
run cards pass the embargo assertion (largest shipped window 24h against
120h), and the guard writes nothing into the tree and leaves no fixture.
Not changed: two historical quotes of threshold-rescue's old "both-folds
positive" line (`tests/emptyCorpusRefusals.test.ts`, HANDOFF) describe what
the script printed in August and stay as history.

Survivals worth keeping: decisions are causal (history slice, daily by
`completeAtMs`, five-minute bars visible only up to the decision); the
starvation audit reads only tally columns; the gate's permutation null and
paired deltas are select-scoped and its CLI prints `SEALED (not derived)`.

## 6. Open items, ranked, each with a recommendation

1. **Owner item — three purpose-confirm readers.** `roster-expectancy-audit`
   (absolute confirm E per roster market, class threshold re-applied),
   `cost-sensitivity-verdict` (amendment 36's withdrawal standard on GROSS
   confirm E) and `threshold-rescue` (both-folds) need a held-back figure the
   gate does not emit: `gradeCorpus` writes confirm deltas for ACCEPTED variants
   against baseline only, and `confirm-4d`'s artifact carries no corpus
   identity. **Recommendation:** extend the ONE ledgered read to carry, per
   market and under the SHIPPED configuration, absolute net and gross confirm
   expectancy with the corpus hash and the LA-6 line, and make the three
   readers consume that artifact (refusing a banner or a hash mismatch). No
   second door; no reader-side ledger. This is R4 act 2's confirm-read design
   and must be vetted before the read is burned. Until then the three readers
   judge on select and say so.
2. **Ledger term for per-market folds.** Under `--confirm-final` with
   `--per-market-folds`, the ledger entry does not record that the folds were
   re-cut per market. Add the term to `conditionsOf` in the same change as the
   R4 confirm-read design.
3. **Holdout populations.** Readers exclude the STAMPED holdout flag (19
   markets, sha256 mod 5); the gate holds out the read-time STRATIFIED set (20).
   R4 must pick one and pin it before per-market grading.
4. **Roster audit's named baseline.** Its fall-through branch reads a NAMED
   4d-era baseline cell and refuses the EMPTY grid cell, which is what R3's
   corpora carry (197 bare `baseline` rows in the tracked tables). It will
   refuse R3 for the 18 non-derived markets until R4 names the cell those
   markets are read at. Instrument work, not seal work.
5. **Legacy corpora.** A manifest without `folds` has no sealed fold; its
   `test` fold was the legacy design's confirmation fold. Every legacy corpus is
   invalidated (the clock defect) and none is tracked; the door seals nothing on
   one and `tuningFolds` names `train`/`test`. Retire legacy support once the
   test fixtures that still use the shape are migrated.
6. **Cross-class calendars.** With `foldsByClass`, one class's tuning window
   can lie inside another's confirm window; pooling classes across a per-class
   spec is a calendar mismatch, not a confirm leak, and the gate already grades
   per class. Refuse cross-class pooling on a per-class spec in the readers that
   pool (e4-collapse, account-type-report) — R4 work.

## 7. Storage

No corpus was written. The two gated R3 emits released earlier today (33.5 GB,
derivable from the capture-all arms, proven before release) and the four raw
stdout logs (deleted here) leave `docs/research/r3/` holding the two capture-all
arms (33.5 GB) and their sidecars. Free space is unchanged by this act beyond
the logs.

## 8. Gates

`check` · `lint` · `check:migrations` · `npm audit --audit-level=high` ·
`test` · `build` · `check:bundle` — each run and green on the branch before
the pull request (the PR body carries the counts).
