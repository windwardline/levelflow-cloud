> **Status (recorded 2026-09-16): designed, refuted twice, approved, NOT BUILT.**
> This is revision 2, written after a three-lens refutation left twenty-six standing
> defects, and then checked by an independent agent that recomputed its figures. The
> recommendation stands with **three corrections and one caution**, which govern where
> they differ from the text below:
>
> 1. **`--witness` is mandatory only for the 2026-09-12 read.** That read graded
>    `capture-all-classfolds.jsonl`, whose manifest carries `feedCharacter` on 0 of 97
>    symbols. The 2026-09-14 net and bound reads graded
>    `capture-all-classfolds-2026-09-14.jsonl`, which carries it on 97 of 97, so
>    `resolveYearMap` takes the manifest and a passed `--witness` is inert
>    (`scripts/feedYears.ts:120-125`). Two of the three re-reads therefore print
>    `year map: manifest feedCharacter (5min tier)`, not the witness path §7.2 shows.
>    The 207,272-flip warning applies only to re-reading the 2026-09-12 verdict on the
>    newer corpus. Nothing measured changes: the two manifests' 5-minute escape maps are
>    identical on all 97 symbols and `foldsByClass` is byte-identical.
> 2. **21 tracked files of 22 carry the header, not 22.**
>    `docs/research/r3/grid-totalr-fit-select-capture-all-classfolds-2026-09-05.rebuild.log`
>    is gitignored.
> 3. **Rebuild the two sample output blocks.** 2,141,527 is the SEALED confirm count —
>    rows that never reach the cube — so it cannot be the year-filter denominator. Use
>    the real total (6,634,732, of which 2,141,527 are sealed) or obvious placeholders.
>    The figures 1,573,004 and `3f2a9c1b04d7` exist nowhere.
>
> **Caution.** Keep §10's `calendarFoldsExcluding` sentence only with its inputs named
> (span source, embargo, exclusion set), or mark it unreproduced.
>
> **Why this file is in the repository.** It lived only in a session scratchpad under
> `/private/tmp`, which the operating system reaped between 2026-09-14 and 2026-09-16,
> taking revision 1 with it. Revision 2 was recovered from the workflow journal that
> produced it. A design that survived refutation is a record, not a working file.

# Design: a year filter on the market-grain gate — revision 2 (2026-09-14)

Revision of `design-gate-years.md` after a three-lens refutation. Twenty-six defects
stood after a second agent checked each one; every one is answered below, and the
defect map at the end says where. One defect from that round is already shipped and is
not re-proposed here: an empty fold now reads as NO VERDICT rather than a measured
loss, and the acceptance conjunction carries the same guard
(`fitEvidenceAbsent`, `scripts/grid-totalr.ts:999-1000`, `:1116`, `:1172-1184`;
`docs/research/empty-fold-verdicts-2026-09-14.md`).

---

## 1. What this delivers, and what it does not

**Delivers.** A read-time, YEAR-grain population filter on `scripts/grid-totalr.ts`,
using the same year map, the same two flags and the same words as the readers that
already stratify by feed character.

**Does not deliver the repair item 4 asks for.** The 2026-09-12 pre-registration reads:
"Per-market span exclusion applies (`scripts/feedMonths.ts`, `calendarFoldsExcluding`).
A calendar pre-registered without it is not pre-registered"
(`docs/research/hour-gate-verdict-2026-09-12.md:128-131`). Item 4 names two facilities:

- a MONTH-grain map (`scripts/feedMonths.ts`) — imported only by
  `tests/spanExclusion.test.ts:22`; no production caller;
- a usable-time fold allocator (`calendarFoldsExcluding`, `scripts/sweepFolds.ts:93`) —
  called only from `tests/spanExclusion.test.ts`; `scripts/replay-sweep.ts:892` and
  `:931` call the plain `calendarFolds` instead.

Neither has a production caller, and neither is called here. The boundary half — folds
cut on usable time with hidden months excluded — moves fold boundaries, and a fold
boundary is stamped at simulation time, per row, with its own warmup and
`decisionEndMs`. No reader can re-cut it. **That half needs a new sweep.** This change
set must say so in the code comment, in the artifact and in the record, or it will be
read as the repair.

A named consequence of the year grain, so nobody has to rediscover it: USDJPY's 5min
witness line names 2021 alone (`docs/research/r3/feed-character.txt:91`), while its
hidden months include 202201 and 202202 (`:107`). A year filter removes 2021 and
keeps those two months. That is the month-grain gap, stated rather than papered over.

---

## 2. What it is free to run, and on which corpus

- The gate never opens the confirm fold without `--confirm-final`: the door passes
  `confirm: "sealed"` (`scripts/grid-totalr.ts:1803`) and no ledger line is written
  outside the `--confirm-final` branch. Zero provider bytes.
- Item 1 of the pre-registration forbids re-searching the WINDOW. The predicate
  (`decisionHourDistance<=2.5`) and the acceptance rule (D4) are untouched. Only the
  population moves.

**`--witness` is mandatory on the corpus the verdict graded.**
`docs/research/r3/capture-all-classfolds.jsonl.manifest.json` carries 97 symbols and
`feedCharacter` on **0 of 97** (verified by reading the manifest's `symbols` array
field by field). `resolveYearMap` throws `no year map` on it
(`scripts/feedYears.ts:126-130`). So any filtered re-read of the three tracked gate
reads must pass `--witness docs/research/r3/feed-character.txt`.

The newer corpus `capture-all-classfolds-2026-09-14.jsonl.manifest.json` carries
`feedCharacter` on **97 of 97** and would need no witness — but it is different money:
`docs/research/arming-bound-2026-09-14.md:49` records 207,272 rows flipping `accepted`
true to false between the two on the forex cost cap, and its `analyzerVersion` is
`2026.09.13.forex-commission-usd-quote` against the graded corpus's
`2026.09.01.platinum-group-rate-inverse`. **A filtered restatement of a recorded verdict
runs on the corpus that verdict graded, with `--witness`.**

---

## 3. The flags

Two flags, the sibling names and the sibling words.

```
--years all|contained|escaping     (default: all)
--witness <feed-character table>   (path; required when --years is not all
                                    and the manifests carry no feedCharacter)
```

**Both are declared in `VALUE_FLAGS`** (`scripts/grid-totalr.ts:2644-2656`). This is not
housekeeping. The walker refuses an undeclared `--` token by name
(`:2676-2683`); declared as boolean, the walker would leave `escaping` or the witness
path in `paths` (`:2684`), where it surfaces as a missing-manifest refusal — the
wrong-diagnosis failure the comment at `:2668-2672` records for `--seed 7 --seed 8`.

`str("--years")` checks only for a flag-shaped or blank token
(`:2721-2739`), so the value is validated separately:

```ts
function assertYearsFilter(token: string | undefined): YearsFilter {
  if (token === undefined) return "all";
  if (token === "all" || (YEAR_BUCKETS as readonly string[]).includes(token)) {
    return token as YearsFilter;
  }
  throw new OperatorInputError(
    `--years ${token} is not a bucket this reader knows — pass all, ` +
      `${YEAR_BUCKETS.join(" or ")}; a misspelled bucket must never read as "all"`,
  );
}
```

`YEAR_BUCKETS` and `YearsFilter` come from `scripts/feedYears.ts:21-23`, so a third
bucket added there reaches this reader without an edit.

`gradeCorpus`'s options gain `years?: YearsFilter` and `witnessTablePath?: string`,
beside the existing `symbolFilter` and `includeHoldout`
(`scripts/grid-totalr.ts:1330-1347`).

---

## 4. The year map, and the roster it must place

```ts
const years: YearsFilter = options.years ?? "all";
const yearMap = years === "all"
  ? null
  : resolveYearMap({ manifests: shardManifests, witnessTablePath: options.witnessTablePath });
```

`shardManifests` (`scripts/grid-totalr.ts:1487-1499`) is structurally the `ManifestLike`
`resolveYearMap` takes: `SweepManifest.symbols[]` carries `symbol` and the optional
`feedCharacter` record (`scripts/sweepManifest.ts:935`, symbol at `:949`).

**The unplaceable guard covers the whole graded roster, with no holdout exemption.**
The two inline copies in the siblings exempt held-out markets before testing
(`scripts/banked-fraction.ts:417`, `scripts/payoff-decomposition.ts:436`) because those
readers drop the holdout from their pools. **This gate does not drop it.**
`excludesHeldOut` is false at the market unit (`scripts/grid-totalr.ts:1705`), `held` is
empty (`:1706`), and every held-out market is graded and LABELLED (`:2448`,
printed at `:2841` as "held out by the stratified rule: 20, labelled, never dropped").
A market the map cannot place is a market this gate will grade, so it is refused:

```ts
function assertPlaceableRoster(
  yearMap: YearMap, roster: string[],
): void {
  const unplaceable = roster.filter((symbol) => yearMap.bucketOf(symbol, 2000) === "unknown").sort();
  if (unplaceable.length === 0) return;
  throw new OperatorInputError(
    `the year map (${yearMap.source}) cannot place ${unplaceable.length} market(s) this gate ` +
      `would grade: ${unplaceable.join(", ")} — the gate LABELS held-out markets rather than ` +
      `dropping them, so no market is exempt from the map; an absent verdict is not a contained one`,
  );
}
```

`roster` is the manifests' symbol union narrowed by `options.symbolFilter` when one is
given — the holdout cycle's surgical read must not refuse because a market it will never
open is unplaceable. That narrowing is the ONLY exemption, and it is named in the message
when it applies. `symbolFilter` has no CLI flag: it reaches `gradeCorpus` only from
`scripts/confirm-4d.ts:271` and `scripts/derive-4d.ts` as a library option, so this case
is exercised by calling `gradeCorpus` directly rather than through argv.

**A row the map can place but the gate cannot date is refused too.** `addRowToCube`
reads `Number(row.time ?? 0)` (`scripts/grid-totalr.ts:180`), which would place a
time-less row in 1970 and bucket it as contained. `SweepEmitRow` declares only
`outcome`/`realizedR`/`symbol` plus an index signature
(`scripts/sweepStats.ts:51-56`), so the field is not guaranteed by type.
`scripts/banked-fraction.ts:486-488` throws on exactly this case, and so does this:

```ts
const yearOfRow = (row: SweepEmitRow, path: string): number => {
  const time = row.time;
  if (typeof time !== "number" || !Number.isFinite(time)) {
    throw new Error(
      `${path}: a ${String(row.symbol)} row carries no finite time — --years cannot place it ` +
        `in a year, and a row placed at epoch 0 would read as a contained one`,
    );
  }
  return yearOf(time);
};
```

Defensive on this corpus: `time` is in the manifests' `emitColumns`. It stays because
the refusal, not the type, is what holds.

---

## 5. Where the filter sits, and what it must not change

The filter is a **cube-insertion** filter, not a door filter. That distinction is the
whole of defect S7 and it is load-bearing.

`derivedFieldOf` throws when a baseline row carries no usable value for a predicate's
field (`scripts/grid-totalr.ts:472-492`), and it runs inside the door callback at
`:1794`, BELOW the holdout, `symbolFilter` and frozen tests at `:1767-1783`. Drop a row
before it and a corpus whose field-less rows all sit outside the selected years would
grade where it previously refused. **The refusal would become conditional on the
calendar.** So:

> Every row still passes through every refusal the unfiltered read would raise. The
> year filter decides only whether the row enters the cube.

Concretely, in the door callback (`scripts/grid-totalr.ts:1765-1798`):

```ts
// after the holdout / symbolFilter / frozen tests, before addRowToCube
const dropped = yearMap !== null &&
  yearMap.bucketOf(row.symbol, yearOfRow(row, path)) !== years;
const seen = rowsBySymbol.get(row.symbol) ?? { dropped: 0, kept: 0 };
if (dropped) { seen.dropped += 1; yearDroppedRows += 1; } else { seen.kept += 1; }
rowsBySymbol.set(row.symbol, seen);

if (!dropped) addRowToCube(cube, row, { includeHoldout: true });
if (derivedFilters.length > 0) {
  const emitted = typeof row.variant === "string" ? row.variant : "baseline";
  emittedVariants.add(emitted);
  if (emitted === derivedParent) {
    for (const filter of derivedFilters) {
      if (frozen && !derivedWantedFor(row.symbol, filter.name)) continue;
      // DERIVED BEFORE DROPPED, deliberately: derivedFieldOf's refusal is a fact
      // about the corpus, and a refusal that depends on --years is a refusal
      // that a calendar can silence.
      const passes = derivedPasses(filter, derivedFieldOf(row, filter.field));
      if (dropped) continue;
      addRowToCube(cube, { ...row, accepted: row.accepted !== false && passes, variant: filter.name }, { includeHoldout: true });
    }
  }
}
```

Three things the placement deliberately does not touch:

- **`digestBaseline`** (`:1753-1761`, called at `:1777`) runs above the filter and is
  unchanged. A uniform filter moves every shard's digest together, so the cross-shard
  comparison at `:1807-1836` would pass either way — but the digest is the "one
  baseline, row for row" evidence, and it should be taken on the rows the corpus holds,
  not on the rows one calendar kept.
- **`sealedRows`** stays the door's own count (`:1805`). Sealed and year-dropped are
  different populations and are printed separately.
- **Fold labels.** The emitted split label is the fold (`:1786`). Nothing here re-cuts
  time, and the `fold source: emitted labels (no time re-cut)` header line stays exactly
  as it is — it is true, and it is about folds, not rows.

Note what `rowsBySymbol` counts: rows that reached the insertion point, i.e. rows that
already cleared the holdout, `symbolFilter` and frozen tests. It includes rows
`addRowToCube` will itself discard for `accepted === false` (`:155-157`). That is stated
in the census line below rather than silently assumed.

---

## 6. The vanishing-market rule

This is the defect with the largest blast radius, and the first draft did not see it.

**The mechanism.** `shipped` is built from `cube.keys()`
(`scripts/grid-totalr.ts:2320-2321`). A market with no surviving row is simply absent.
`shipped.size` on the header
(`:2841`) and the FWER denominator (`:2853-2857`) shrink with it, while
`heldOutSet.length` on the same header line does not — it comes from
`resolveHeldOut(shardManifests)` (`:1703`, `:2557`), which reads the manifests' roster
and never the cube. The header would print a shrinking numerator against a fixed
denominator and say nothing about why.

**The size, measured not estimated.** Recomputed from
`docs/research/r3/capture-all-classfolds.jsonl.manifest.json`'s `foldsByClass` spans and
`docs/research/r3/feed-character.txt`'s 5min verdict lines, over the 91 markets the gate
grades (`docs/research/r4/hour-gate-market-net-2026-09-14.json` `markets`):

| filter | graded-roster markets with no year of that bucket anywhere in fit or select |
|---|---:|
| `--years escaping` | **38 of 91** — futures 16, crypto 8, agriculture 6, indices 5, metals 1, livestock 1, energies 1 |
| `--years contained` | **0 of 91** |

Over the full 97-symbol manifest the same computation gives 44, matching the refutation's
corrected figure class for class (agriculture 6/6, crypto 13/33, energies 1/1, futures
16/18, indices 5/6, livestock 1/3, metals 2/2, forex 0/28). A further **33 markets have
an empty FIT fold and a populated select fold** under `--years escaping` — 27 forex, ASX,
and ALGOUSD/DOTUSD/DYDXUSD/EGLDUSD/NEARUSD. Those 33 are exactly the case #647 now
catches; they return NO VERDICT with the fold named, not `fails`.

These counts are year-span overlap, so they are a LOWER bound on vanishing: a market
with an in-span escaping year may still have no accepted filled row in it. The exact set
is a row-level fact, which is why the counter below exists rather than a table.

**The rule.** An emptied market does not vanish and is not seeded into the cube.
Seeding would reach `baselineAbsentInGroup` (declared at `:902`, reason at `:1164-1167`) and print a reason about the
baseline — a reason the filter falsifies. Instead:

1. `emptied = [...rowsBySymbol].filter(([, seen]) => seen.kept === 0).map(([symbol]) => symbol).sort()`
   — exact, single pass, no second read of the corpus.
2. The market-grain header states three numbers rather than one:

```
shipped cell per market (53 of 91 in the graded roster; 38 emptied by --years escaping;
  held out by the stratified rule: 20, labelled, never dropped;
  decline rule = 3f2a9c1b04d7)
markets emptied by --years escaping (38; no row survived the filter, so each carries no
  family and no verdict): AGUSX, ALIUSX, ...
```

3. The FWER line names the population its denominator came from:

```
accepted (market, variant) pairs: 0 · expected false families at FWER 0.05 over 53 markets
  with a family ≈ 2.7 (53 of 91 in the graded roster; 38 emptied by --years escaping;
  per-market families; D4's absolute term is the cross-market brake)
```

4. **Under `--years all` these lines are not merely equal — they do not execute.**
   `yearMap` is null, `rowsBySymbol` is never written, `emptied` is never computed, and
   the two header lines print their existing literals unchanged. That is what makes
   "the default path is today's read" a testable claim rather than a hope.

5. **If the filter empties the ENTIRE roster, refuse — naming the filter.** With an empty
   cube, `groupVerdicts` reaches its baseline-exists refusal
   (`scripts/grid-totalr.ts:870-876`) and blames the baseline variant for a calendar's
   doing. That misattribution is caught first:

```
--years escaping kept no row on any of the 91 markets the gate would grade (2,141,527 rows
read, 2,141,527 dropped by the filter) — nothing can be graded, and a read that grades
nothing must say the calendar emptied it rather than refuse the baseline by name
```

The class unit gets the same treatment through the same counters: a class whose members
all empty leaves `verdicts`, and §7's fix to the silent-class line names the cause.

---

## 7. The denominators, and the header

### 7.1 The dropped-row census

The repository's own rule sits in this file: "The graded population states its own
denominator" (`scripts/grid-totalr.ts:2991`). The gate prints two row-population
counts today — `sealedRows` at `:2975` and `dataAbsentRows` at `:3002-3019`, rendered in
`docs/research/r4/hour-gate-market-net-2026-09-14.stdout.txt`. A filtered read that
printed neither a dropped count nor an emptied roster could not be told apart from a thin
one, which is what makes the vanishing-market defect invisible in the first place.

Four sibling readers census dropped rows as `otherYears` — and they are exactly the four
that drop rows: `scripts/banked-fraction.ts:637`, `scripts/payoff-decomposition.ts:554`,
`scripts/arming-bound-cells.ts:289`, `scripts/forex-commission-conversion.ts:380`. The
other two importers of `feedYears.ts` do not drop: `contained-years.ts` reports both
buckets side by side, and `forex-commission-admission.ts` uses `bucketOf` only to label a
period (`:235`). Stated that way, the precedent is a rule about dropping, and it binds
here.

Printed only when a filter is in force, beside the existing denominators:

```
(rows dropped by --years escaping: 1,573,004 of 2,141,527 that reached the cube's door —
 all variants, graded folds only, holdout labelled not dropped, before addRowToCube's own
 accepted-row test; 38 of 91 graded-roster markets kept none)
```

### 7.2 The header line: two branches, and no line under `all`

`describeYearMap(null)` throws outright (`scripts/feedYears.ts:148-149`), so a literal
reading of the first draft's item 4 was unbuildable on the default path. The siblings
avoid it with a two-branch line: `scripts/banked-fraction.ts:640-642` and
`scripts/payoff-decomposition.ts:557-559` print
`years: all (no feed-character stratification)` under `all` and
`years: <bucket> · <describeYearMap(...)>` otherwise;
`scripts/arming-bound-cells.ts:267-268` appends the map fragment only `(yearMap ? ...)`.

**This reader deviates on one point, deliberately: it prints NO years line under `all`.**

The reason is cost, and it is specific. Twenty-two tracked files under `docs/` carry the
`fold source: emitted labels (no time re-cut)` header — every one of them a `git ls-files`
hit, across `docs/research/r3`, `docs/research/r4` and `docs/research/confirm-reads`. An
unconditional line makes all 22 stale, and regenerating the eight market-grain gradings
among them would sweep in #647's disposition change on 416 (market, variant) pairs — the
batch that note explicitly deferred, because `register-verdict` reads only
`parsed.markets` and would consume a changed disposition with no signal
(`docs/research/empty-fold-verdicts-2026-09-14.md`, "What is NOT fixed here"). A header
line is not worth forcing that batch. Under a filter, the line prints in the sibling
shape:

```
years: escaping · year map: witness table docs/research/r3/feed-character.txt (5min tier)
```

The existing header assertion is a regex (`tests/acceptanceGate.test.ts:4034`) and would
not have caught an addition either way, which is why the default path gets its own
assertion in §9.

**"Byte for byte" is dropped from the design's own vocabulary.** Two things move on the
default path regardless: the usage string names every flag the walker knows
(`scripts/grid-totalr.ts:2779-2786`), so it gains `[--years ...] [--witness ...]`; and
the `--out` artifact has never been byte-stable, because it writes
`derivedAt: new Date().toISOString()` (`:2913`). The claim this design makes instead is
narrower and testable: **no `--years` token ⟹ no year map, no counter, no line, and no
change to any figure.**

### 7.3 The silent-class line

`scripts/grid-totalr.ts:2925-2938` is guarded by `if (verdictUnit === "class")` and
hardcodes its cause: "classes requested but with no row in any tuning fold (every
decision in the sealed fold)". Under a filter that cause is false. The literal becomes
two branches — the existing one under `all`, and under a filter:

```
classes requested but with no row in any tuning fold under --years escaping: agriculture, energies
```

No claim about the sealed fold, because the filter is a sufficient explanation and the
sealed fold is no longer a necessary one.

---

## 8. The artifact, and binding it downstream

### 8.1 The field

The `--out` grading artifact (`scripts/grid-totalr.ts:2902-2922`, `derivedAt` at `:2913`) gains one field,
written **unconditionally**, including `"all"`:

```ts
years,            // "all" | "contained" | "escaping"
yearMap: yearMap ? { source: yearMap.source, witnessTablePath: options.witnessTablePath ?? null } : null,
```

Unconditional matters: absence must mean exactly one thing — an artifact written before
this change set, when no filter could exist. All four tracked removal gradings and every
arm of `docs/research/r4/frozen-candidates.json` carry no such field today, verified by
reading them, so "absent ⟹ full calendar" is true by construction and stays true.

### 8.2 Making it bind

The first draft's field would have bound nothing. Verified:

- `loadGradingArtifact` requires `["anchor", "analyzerVersion", "calendarHash",
  "foldSource", "holdoutRule", "verdictUnit"]` (`scripts/freeze-candidates.ts:195`).
- The cross-arm agreement loops compare `["anchor", "analyzerVersion", "calendarHash",
  "holdoutRule"]` (`:312`, `:397`) plus `heldOut`. None moves under a row filter —
  `calendarHash` is `sha256Hex(stableJson(confirmSpans))` over manifest fold spans.
- The shipped-cell select identity test (`:335-339`) fires only when two arms disagree,
  and a market absent from an arm is skipped in silence by `if (entry === undefined)
  continue;` (`:331`). A set of arms all run under one `--years` freezes cleanly.
- `register-verdict.readRemovalGradings` (`scripts/register-verdict.ts:172-190`) opens
  each of the four `REMOVAL_ARMS` gradings and keeps only `parsed.markets` — no
  `verdictUnit`, no `foldSource`, no `calendarHash`, no INVALID check. Amendment 36's
  removal test would consume a filtered grading with no signal.
- `cost-sensitivity-verdict.ts:274-285` returns a ten-field whitelist and drops
  everything else. `grep -n 'symbolFilter\|includeHoldout'` over
  `cost-sensitivity-verdict.ts`, `roster-expectancy-audit.ts` and `register-verdict.ts`
  exits 1 — **no consumer reads the ledgered read's existing population field either.**

So, two edits, and the second is a strict improvement independent of this change:

1. **`loadGradingArtifact` refuses a filtered grading**
   (`scripts/freeze-candidates.ts:189`, required fields at `:195`):

```ts
if ("years" in parsed && parsed.years !== "all") {
  refuse(
    `${path} was graded with --years ${String(parsed.years)} — a population filtered by ` +
      `feed-character year is not the calendar this program freezes on; grade the arm ` +
      `without --years, or freeze a program whose every arm names the same filter`,
  );
}
```

   No cross-arm comparison of `years` is needed once every consumed arm must be `"all"`.

2. **`readRemovalGradings` routes through `loadGradingArtifact(path, "market")`**
   instead of a bare `JSON.parse`, inheriting the INVALID check, the `foldSource` and
   `verdictUnit` checks, the no-confirm-figure check, and the refusal above. Verified
   safe against the four tracked arms: `review-window`, `review-window-96`, `stop-cap`
   and `stop-cap-8` each carry `verdictUnit: "market"`, `foldSource: "emitted"`, all six
   required string fields, `heldOut`/`shardHashes`/`shards` arrays, and a shipped cell
   with `declineCandidate` and `heldOut` on every market, with no `confirm` key and no
   `years` key. `tests/calibrationState.test.ts:721` already calls `readRemovalGradings`
   over `docs/research/r4`, so the suite proves it.

### 8.3 The ledgered read

The first draft refused `--years` with `--confirm-final` and gave a factually wrong
reason. The ledgered-read artifact DOES carry a population filter: `symbolFilter` is
declared at `scripts/ledgeredRead.ts:148`, honoured at `scripts/grid-totalr.ts:1768`,
written into the artifact at `:2480` and into the ledger line at `:2511`. "No field" and
"unattributable" were both false.

**The refusal stands; its reason is replaced by the precedent.** `symbolFilter` is
recorded and read by nobody, so a `years` field on the ledger would be recorded and
unread in exactly the same way — and the confirm fold is the one population that cannot
be re-read if a consumer later turns out to have needed it. The refusals:

```
--years escaping cannot be combined with --confirm-final: the recorded read burns the
confirm fold once, and the ledger's existing population field (symbolFilter) is read by
no consumer — cost-sensitivity-verdict keeps a ten-field whitelist and register-verdict
keeps only parsed.markets — so a filtered burn would be unreadable to every consumer it
was recorded for. Rehearse it with --rehearse, or read the tuning folds without --years.
```

```
--years escaping cannot be combined with --frozen: the freeze registered each candidate's
tuning-fold figures on the full calendar, and a frozen read re-derives them and refuses
by name when they move (scripts/grid-totalr.ts:2216-2220). Refused here so the operator
reads the calendar in the message rather than a market's name in an identity failure.
```

The second refusal subsumes `--rehearse`, which the first draft's item 6 left reachable:
`--frozen` requires `--confirm-final` or `--rehearse` (`scripts/grid-totalr.ts:1509-1510`),
so refusing `--years` with `--frozen` closes both, and `--years --frozen --rehearse` is
no longer a combination anyone has to reason about. Design question 3 has a mechanical
answer and it is recorded here: a year filter could never have silently redefined
`--frozen` — the market-grain identity check at `:2216-2220`, the class-grain one at
`:2264-2268`, and the no-rows throw at `:2207-2210` all sit inside `if (frozen)` and are
unconditional on `confirmFinal`/`rehearse`. The refusal buys a message, not safety.

---

## 9. Guards

### 9.1 The sealed-fold census needs an entry

`tests/confirmFoldSealed.test.ts` asserts coverage by reader NAME (`:591`, `:802`), and
`grid-totalr` is already in `READERS` (`:575`) with two `EXTRA_RUNS` shapes — `--r-arm
bound` (`:601`) and `--derive-filters` (`:626-630`). So adding `--years` would fail
nothing and cover nothing. One entry, in the same change set, in the shape the four
sibling `--years` entries use (`:597-600`):

```ts
{
  args: ["F", "--permutations", "20", "--years", "contained", "--witness", "W"],
  label: "grid-totalr --years contained",
  reader: "grid-totalr",
},
```

`contained` and not `escaping`, for a stated reason: the fixture's witness writes every
market as `5min contained` (`tests/confirmFoldSealed.test.ts:475`), so `--years escaping`
empties the whole fixture roster and hits §6's whole-roster refusal — a non-zero exit,
which is a refusal test, not a sealing test. That refusal gets a unit test instead.

### 9.2 Tests

New file `tests/gateYearFilter.test.ts`, driving the real binary the way
`tests/acceptanceGate.test.ts` does, over a fixture corpus with two markets, an escaping
year in one fold and not the other, and a written witness table.

| # | Test | What it pins |
|---|---|---|
| T1 | default run prints no `years:` line, no dropped-row line, no emptied line, and the header's shipped-cell and FWER literals are the pre-change strings | §7.2's narrow claim |
| T2 | `--years contained --witness W` prints the two-branch years line with the witness path | sibling convention |
| T3 | a market whose every row is escaping is absent from the cube, named in the emptied line, counted in the shipped-cell and FWER denominators | §6 |
| T4 | `heldOutSet.length` on the header is unchanged while `shipped.size` shrinks, and the line says so | the mismatch the defect names |
| T5 | dropped-row census prints the exact dropped count and the emptied-market count | §7.1 |
| T6 | a filter that empties every market refuses naming `--years`, not the baseline variant | §6.5 |
| T7 | a market the witness does not name refuses, including when that market is held out | §4, no holdout exemption |
| T8 | `gradeCorpus({ symbolFilter, years })` called directly does not refuse for an unplaceable market outside the filter | the one exemption |
| T9 | a row with no finite `time` refuses under a filter and is accepted (as today) without one | §4 |
| T10 | `--derive-filters` on a corpus missing the derived field refuses identically with and without `--years` | S7 / §5 |
| T11 | `--years escaping --confirm-final` refuses; `--years escaping --frozen --rehearse` refuses | §8.3 |
| T12 | `--years sideways` refuses by name; `--years` with no value refuses as flag-shaped | §3 |
| T13 | `--out` artifact carries `years` on both the default and filtered paths | §8.1 |
| T14 | `loadGradingArtifact` refuses a grading with `years: "escaping"` and accepts one with `years: "all"` and one with no field | §8.2 |
| T15 | `readRemovalGradings` refuses a filtered arm and still reads the four tracked ones | §8.2 |
| T16 | class unit: the silent-class line names the filter, not the sealed fold | §7.3 |

### 9.3 Mutations

Each must be APPLIED, the harness must produce a verdict, and the revert must be a
reverse replace against the mutation's own pre-hash — never `git checkout -- file`.

| Mutation | Caught by |
|---|---|
| move the year test above `derivedFieldOf` | T10 |
| make the years header line unconditional | T1 |
| drop the emptied-market line | T3 |
| leave the FWER denominator unannotated | T4 |
| count dropped rows but not per symbol (so `emptied` is always empty) | T3, T5 |
| exempt held-out markets from `assertPlaceableRoster` | T7 |
| let `--years sideways` fall through to `"all"` | T12 |
| remove `--years` from `VALUE_FLAGS` | T12 (token lands in `paths`, refusal names a missing manifest) |
| drop the whole-roster refusal | T6 (message names the baseline variant) |
| `bucketOf(symbol, yearOf(row.time ?? 0))` instead of the refusing reader | T9 |
| drop the `loadGradingArtifact` refusal | T14 |
| leave `readRemovalGradings` on `JSON.parse` | T15 |
| write `years` only when filtered | T13 |

### 9.4 Gates

`gate: npm run check`, `npm run lint`, `npm run check:migrations`, `npm run audit:high`,
`npm test`, `npm run build`, `npm run check:bundle`,
`bash scripts/vercel-ignore-build-test.sh` — enumerated, each run, none counted.
`ANALYZER_VERSION` does not move: no analyzer behaviour changes.

Operational note: every reader log this change set produces lands in the scratchpad.
A harness log written under `docs/` reads as a reader writing into `docs/` against the
sealed-fold census's own snapshot.

---

## 10. What it costs to be wrong

Three tracked gate reads would be re-run and their stdout and JSON restated:
`docs/research/r4/hour-gate-market-2026-09-12.*`,
`hour-gate-market-net-2026-09-14.*`, `hour-gate-market-bound-2026-09-14.*`. All three
regrade from corpora already on disk, at zero provider bytes.

What a filtered restatement will say, before it is run, so it cannot be discovered
afterwards:

- **`--years contained` empties no graded market** (0 of 91) and removes roughly 30% of
  forex select volume: 23,513 escaping of 78,932 in-pool select fills
  (`docs/research/r3/contained-years-capture-all-classfolds.txt:33-34`), a 1.194×
  widening of the interval at the same dispersion. It removes 0 forex FIT fills in-pool
  — there is no forex escaping row in the FIT table (`:12-24`, forex at `:16`) — so the
  fit and select folds are cut asymmetrically and the select side loses power while the
  fit side does not.
- The direction is knowable and it runs against acceptance. Forex select contained is
  −1,321.1 R at E −0.0238; escaping is +2,925.0 R at E +0.1244 (`:33-34`). USDJPY, the
  near miss, carries `inSpan` select net n 815, E +0.037677, lower −0.002148
  (`docs/research/r4/hour-gate-market-2026-09-12.json`, `markets.USDJPY.variants.inSpan.select.net`); losing 2021 alone takes n to
  roughly 622 and the lower bound to roughly −0.008 at the same dispersion. **Further
  from acceptance, not closer.** The point-estimate half of that is inference and is
  labelled as such; the interval half is arithmetic.
- **`--years escaping` empties at least 38 of the 91 graded markets** and leaves 33 with
  an empty fit fold and a populated select fold. Those 33 now return NO VERDICT with the
  fold named (#647), not `fails`. It is a diagnostic shape, not a verdict shape, and the
  design says so rather than letting a reader infer it from a shrunken table.
- **Two absolute floors move markets into no-verdict as the filter thins them.**
  `SELECTIVE_POWER_FLOOR = 30` (`scripts/grid-totalr.ts:380`) and `marketVerdicts`'
  `minFilled: 30` (`:841`) are counts, not shares, so a filter that removes 30% of forex
  select volume pushes markets across them. Before any filter, the 2026-09-12 read stands
  at 22 no verdict and 69 judged (`docs/research/hour-gate-verdict-2026-09-12.md:30-31`,
  `:51-52`), with seven markets already under the market grain's 30-fill floor (`:89`).
  A filtered read's no-verdict count will rise again, and the reason strings
  name which floor bound, so the restatement must not read that rise as a change in the
  hours.
- `--years contained` returns the hour candidate to the population it was DISCOVERED on:
  `docs/research/alpha-review-2026-09-07.md:12-14` records both passes reproducing the
  tracked contained-years control. That is not a new population; it is the old one.

A control is worth naming when the read is done —
`docs/research/r3/hour-mechanism-2026-09-07.txt:8` (select in-pool in-span, n 12,471,
E +0.0324, lo95 +0.0222) and `docs/research/r3/hour-mechanism-2026-09-14.txt:8`
(n 11,374, E +0.0365, lo95 +0.0261). It is not a rule any reader enforces:
`scripts/arming-bound-cells.ts:273-276` prints "control: none named" rather than
refusing, and its own header says so at `:19`. So: name a control, do not build a
refusal for one.

One fact to record rather than fix, because this change does not cause it. Recomputing
`calendarFoldsExcluding` over the 28 forex markets puts 27 select-fold ends in 2019 and
one — USDJPY — at 2022-09-17, later than the graded 2022-06-03. So the emitted calendar's
select fold reaches into time a span-excluded calendar would have called confirm, for 27
markets. The 2026-09-12 gate already read that whole unfiltered fold. `--years contained`
removes rows and adds none, so the marginal independence spend of this change is **zero**.
It is a property of the emitted-fold calendar, and it is one more reason item 4's
boundary half needs its own sweep rather than a flag.

---

## 11. Defect map

Twenty-six standing defects, and where each is answered.

| Lens | Defect | Answered in |
|---|---|---|
| statistics 1 | empty fit fold prints `fails` | shipped as #647; §1 |
| statistics 2 | silent-class line / vanishing markets / FWER | §6, §7.3 |
| statistics 3 | no dropped-row denominator | §7.1 |
| statistics 4 | `describeYearMap(null)` throws; `all` not byte-identical | §7.2 |
| statistics 5 | `VALUE_FLAGS` declaration | §3 |
| statistics 6 | artifact `years` binds nothing | §8.1, §8.2 |
| statistics 7 | `derivedFieldOf` below the filter; `--frozen` | §5, §8.3 |
| contract 1 | item 6's reason factually wrong (`symbolFilter` exists) | §8.3 |
| contract 2 | items 1 and 4 contradict | §7.2 |
| contract 3 | freeze does not compare `years` | §8.2 |
| contract 4 | `register-verdict` keeps only `parsed.markets` | §8.2 |
| contract 5 | unplaceable guard must cover the whole roster | §4 |
| contract 6 | census entry missing | §9.1 |
| contract 7 | `--frozen` mechanically safe; `--rehearse` reachable | §8.3 |
| contract 8 | dropped rows unreported (`accepted` filter exists at `:155-157`) | §5, §7.1 |
| population 1 | fold asymmetry, 29.79% select loss, 1.194× widening | §10 |
| population 2 | `--years escaping` cannot grade the candidate | §6, §10 |
| population 3 | item 4 contradicts item 1 | §7.2 |
| population 4 | freeze passes a filtered grading | §8.2 |
| population 5 | corpus never named; `--witness` mandatory | §2 |
| population 6 | no control (worth-stating, not a rule) | §10 |
| population 7 | select fold reads future confirm time (marginal spend zero) | §10 |
| population 8 | refusal misses the gate's population; unplaceable rows | §4 |
| population 9 | headline denominator changes (30-fill floor is absolute) | §6, §10 |
| population 10 | expected direction partly knowable | §10 |
| population 11 | census would not govern the flag | §9.1 |