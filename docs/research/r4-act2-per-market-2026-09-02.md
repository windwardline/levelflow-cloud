# R4 act 2 — the per-market program on the tuning folds (2026-09-02)

Record of act 2. Design and its two adversarial reviews:
`r4-act2-design-2026-09-02.md`. Act 1 (the seal):
`r4-act1-seal-readers-2026-09-02.md`. Nothing here reads the confirm fold,
moves a calibration value, spends a provider byte, or touches the desk.

## 1. What act 2 built

- **The per-market grain on the emitted folds.** `grid-totalr --verdict-unit
  market` grades every market on its own rows (singleton groups, the gate's
  paired day-block statistics, family-wise max-T within a market's six
  variants, D4's absolute term, 30-filled floor), labels the stratified
  held-out set and drops nothing. The 2026-08-11 per-market TIME re-cut is
  retired: under the sealed door it never made a market-local confirm cell but
  silently demoted emitted select rows into a local fit, and under the confirm
  flag it relabelled a median 329 days of the held-back fold into select,
  where acceptance is decided. Its flag is refused by name in `derive-4d` and
  `confirm-4d`; the gate refuses any unknown flag by name (the guard's
  "second shape" in act 1 had been a no-op for exactly that reason).
- **The shipped cell, graded absolutely.** Per market, the shipped cell's
  select-fold expectancy NET and GROSS with a 95% interval and n, and the
  PRE-REGISTERED decline rule applied mechanically (net AND gross upper bounds
  below zero at 30 filled — amendment 36's cost clause). A shipped derived
  cell's positive select grade is in-sample (it was picked on a window within
  8–12 days of R3's select fold), which the provenance beside it states; only
  a failing grade is evidence.
- **The one ledgered read, extended.** Under `--confirm-final` the read covers
  every market's shipped cell — absolute net and gross confirm expectancy with
  interval and n, `heldBack` from provenance, M3 against the pre-registered
  rule — beside the accepted variants' deltas. So a confirm-final run over a
  corpus holding confirm rows is a read whether or not anything was accepted:
  **one burn for the whole program**, taken once after every supplementary arm
  is graded on select and frozen. The read writes its own artifact
  (`scripts/ledgeredRead.ts` is the contract; consumers open it only through
  `readLedgeredArtifact`, which refuses a condemned, foreign, tampered or
  re-ruled artifact) and a ledger line carrying baselineVariant, verdictUnit,
  includeHoldout, symbolFilter, symbolsRead, the holdout rule and set, the
  emit bytes' sha256 per shard, the artifact's hash and the **calendar key**.
- **The held-back calendar.** LA-6 keyed the prior-read refusal on corpus
  identity, and a supplementary arm at the same anchor is a new identity: the
  same held-back fold could have been read twice under two grids. The first
  version hashed the analyzer version, the clock and the confirm spans, and
  the diff refuter evaded it four ways (a version-string bump, a by-class
  versus global fold shape over identical dates, a one-day shift, a manifest
  without a requested roster). The scan now records, per requested symbol,
  the confirm window in DATES ONLY and refuses a read whose windows OVERLAP a
  recorded read's over any shared symbol — R3's two arms are one calendar —
  and a recorded read on a manifest without `requestedSymbols` is refused
  before the fold opens. Mutation: disabling the match fails its test.
- **Provenance of every shipped cell.** `scripts/shipped-cell-provenance.ts`
  attributes all 72 per-symbol layers to their 2026-08-11 tranche (derived-4d
  39, holdout-cycle 11, totality 22; zero mismatches against the manifests'
  `symbolOverride`), reconstructs each selection window (the class-fold
  tranches on 4c's per-class folds; the totality tranche on the 50/75% re-cut
  of the market's own span) AND each cell's CONFIRMATION window — the
  tranche's confirm fold, where the cell read positive and was shipped — and
  computes overlap with R3's per-class confirm fold. The diff refuter killed
  the first version, which looked at the selection window alone and called 55
  cells held back: every shipped derived cell was confirmed positive on dates
  R3's confirm fold covers (the 4c confirm windows span 94–99% of it), so a
  positive figure for any of them is the winner's curse. Under the rule as it
  stands: **0 shipped cells held back, 72 not** (every derived cell), 25
  non-derived markets undeterminable (the class rows' derivation windows are
  not in the artifacts; the gate reads undeterminable as NOT held back). The
  design's "21 of 27 totality picks overlap" is reproduced. Consequence, made
  mechanical in the gate and the contract: for a cell not held back only a
  confirmed-negative confirm figure is admissible; a positive or
  indistinguishable figure is withheld from the read's artifact (the
  ADMISSIBILITY rule, pre-registered). `docs/research/r4/shipped-cell-provenance.json`.
- **One holdout population.** The stratified set over the requested roster,
  computed by one helper, pinned in `docs/research/r4/holdout-2026-08-26.json`
  and verified by every reader; the stamp demoted to provenance; the class
  gate excludes it, per-market readers label it. (Lens 3: the stamp names no
  untainted market — the gate tuned on 14 of its 19 since 2026-08-11 — and
  the two sets share five markets.)
- **The roster audit's baseline cell** reads the manifest's grid: the empty
  cell is every market's shipped configuration when the named 4d-era cell is
  absent; both present refuses; the derived map is annotation, never a row
  filter (it had returned silently empty for 79 markets on R3's corpus).
- **The two consumers** of the ledgered read (roster-expectancy-audit,
  cost-sensitivity-verdict) print the artifact's figures verbatim through the
  contract's door, or say "select only" without it. threshold-rescue consumes
  nothing from confirm: its per-threshold curve is a selection on the fold and
  its proposals become a supplementary grid arm.
- **Gross beside net everywhere.** `SweepStats` carries the gross column
  through every merge.

## 2. The grading run — sealed, zero bytes

`grid-totalr docs/research/r3/capture-all-classfolds.jsonl --verdict-unit
market --provenance docs/research/r4/shipped-cell-provenance.json --out
docs/research/r4/per-market-grading-classfolds.json` (50 s; 2,141,527
confirm rows withheld at the door; stdout tracked as
`per-market-grading-classfolds.stdout.txt`, which carries no confirm figure).

| Measured | Count |
|---|---|
| Markets requested | 97 |
| Markets graded (rows in the tuning folds) | 91 |
| Held out by the stratified rule (labelled, graded) | 20 |
| Grid variants accepted against a market's shipped cell (beats baseline AND earns money on select) | **0** |
| Shipped cells whose select net upper bound is below zero | 44 |
| Shipped cells whose select net lower bound is above zero (in-sample for derived cells) | 15 |
| Decline candidates under the pre-registered rule (net AND gross upper bounds < 0, ≥ 30 filled) | **22** |

The 22 decline candidates: ADAUSD, ALGOUSD, ASX, ATOMUSD, AVAXUSD, BCHUSD,
DASHUSD, DOTUSD, DYDXUSD, EGLDUSD, HBARUSD, HOUSD, NEARUSD, NGUSD, SOLUSD,
TRXUSD, UNIUSD, WTI, XLMUSD, XMRUSD, XTZUSD, ZSUSX — by tranche: 11 class-row
markets, 7 totality, 3 derived-4d, 1 holdout-cycle; four are held-out markets
(DASHUSD, NGUSD, XLMUSD, XMRUSD). Sixteen are crypto. They are CANDIDATES:
the rule satisfies amendment 36's cost clause (the loss survives removing
modelled spread and slippage) and nothing else — the window, cap and calendar
removals are act 3's arms, and withdrawal is never permanent.

Six requested markets have no row in any tuning fold: ARWUSD, BNBUSD, CAKEUSD,
THETAUSD (listed 2023-09/10, inside crypto's confirm fold from 2023-06-13),
TRUMPUSD (listed 2025-01) and XAGUSD (its 15-minute feed begins 2023-08-30,
inside metals' confirm fold from 2023-05-16). Every decision they carry sits in
the sealed fold. They are unmeasurable at tuning grain on this corpus; the
remedy is an emit-time per-MARKET fold spec for late-listed markets in a
supplementary arm at the protected anchor (zero bytes), never a read-time
re-cut.

**What this says about the program, in net R.** At market grain, no variant of
runner protection or stop structure beats any market's shipped configuration
while earning money on select — the class-grain finding of R3 holds market by
market. The shipped configurations themselves lose on select in 44 of 91
markets beyond their interval; the 15 that earn are mostly derived cells whose
grade is in-sample. The lever is therefore not among the two axes swept so
far; act 3's arms (the class-default arm that removes the invalidated derived
layer, the review window, the TP1 family, the stop family, the threshold
proposals) are where a market-grain improvement in net realized R can still
be found on this corpus, and the confirm read waits for them.

## 3. Adversarial review

Design v2 was reviewed by two lenses before code; every kill is in the design's
review table with its disposition (retire the re-cut; one burn per program
with a calendar key; provenance on every shipped-cell figure; pre-registered
rules; the fuller ledger line; the stratified population computed over the
requested roster; the audit's grid-naming rule). Mutation results on the code:

| Mutation | Result |
|---|---|
| Calendar match disabled in the prior-read scan | its test fails |
| Burn rule ignores the shipped cells | 7 pins fail |
| Decline rule drops the gross clause | 2 tests fail |
| Provenance `heldBack === 0` becomes `>= 0` (instrument) | 5 tests fail |
| Holdout helper and readers, audit and consumers | see the diff refuters' verdicts (§5) |

## 4. Open items, ranked

1. **Act 3 — the supplementary arms at the protected anchor, zero bytes.** A
   `symbolOverride=none` arm (each market on its class default; the only way
   to grade the invalidated derived layer against its absence), the review
   window, the TP1 and stop families, the threshold proposals with their own
   acceptance rule, and an emit-time per-market fold spec for the six
   late-listed markets. Each arm's inputs named in its design; a class's axis
   choices from that class's own tuning folds only.
2. **The one confirm read** — after act 3, once every arm is graded on select
   and frozen; the package for the owner carries the pre-registered rules, the
   frozen candidates and the provenance, and the read itself is one command.
3. **Decline candidates** — 22 named above; a decision only after act 3's
   removals and the read, per amendment 36.

## 5. Diff refuters

Two refuters read the uncommitted diff — a statistical, ledger and look-ahead
lens on the gate, and a silent-failures lens on the readers, holdout, audit
and consumers. Every kill was accepted and closed before the commit:

| Kill | Closure |
|---|---|
| The calendar key was an exact hash of analyzer version, clock and spans: evaded by a version-string bump, a by-class versus global fold shape over identical dates, a one-day shift, and a manifest without a requested roster; R3's own two arms had different keys over byte-identical forex spans | The ledger line records, per requested symbol, the confirm window in dates only; the scan refuses a read whose windows overlap a recorded read's on any shared symbol; a recorded read on a manifest without `requestedSymbols` is refused before the fold opens. Mutation: disabling the match fails its test. |
| Provenance looked only at the selection window; every shipped derived cell was confirmed positive on its tranche's confirm fold, which covers 94–99% of R3's, so the 55 "held back" cells were survivor-selected | `heldBack` requires clearance of the confirmation window too: 0 of 72 derived cells are held back on R3. The ADMISSIBILITY rule is pre-registered and mechanical: for a cell not held back only a confirmed-negative figure is kept; the gate withholds the rest, and no consumer can print them. |
| The emit bytes were bound by nothing a consumer checks; `emitSha256` was keyed by basename; the sealed `--out` artifact carried M3 and absolute shard paths; the ledger's holdout was drawn over the symbols read | `emitSha256` keyed by manifest hash; `--out` carries no confirm-derived field, real manifest hashes and relative paths; the gate, `derive-4d` and `confirm-4d` resolve the holdout through the one helper over the requested roster; the artifact and line record basis and pin state. |
| The stamp still excluded rows in the cube's array path; `describeHeldOut` claimed pools and labels for readers that had neither; the pin could be dodged by editing its roster hash, and accepted duplicates or an empty roster | The stamp is inert everywhere; the description states each reader's real behaviour; the pin refuses duplicates, an empty roster, and a claimed manifest under another roster. |
| Both consumers printed not-held-back figures as if evidence | Closed at the source: the gate withholds them, so there is nothing to print. |
| The audit's UNMEASURABLE verdict named the wrong cause for the six confirm-only markets; the account report called a requested market "never swept" | Both name the sealed fold as the cause. |
| Tracked R3 class figures were pooled under the stamped exclusion (19 markets) and quoted as current | The four regenerable outputs were re-run under the one population and re-tracked (§6); the record and HANDOFF quote the corrected figures and say why they moved. |
| Multiplicity was per market by design but the expected false-family count was not printed | Printed beside the accepted count at the market unit. |
| The 4d scripts graded held-out markets without a label | Both label `heldOut` per market. |

Survivals, with the evidence the refuters filed: the shipped-cell figures
reproduce from the corpus to 1e-9 (EURUSD, ASX, WTI); decline candidacy is
computed on select only; M3 is only reported; the retired re-cut has no
remaining path; the six readers drop no market on the stamp; the pin is the
computation over the tracked manifests (20/20, roster hash and manifest
hashes equal); the audit reads one cell per market; the sealed guard still
bites (24/24) and a holdout regression is pinned by the readers' own tests.

## 6. Gates

`check` · `lint` · `check:migrations` · `npm audit --audit-level=high` ·
`test` · `build` · `check:bundle` — each run and green on the branch before
the pull request (the PR body carries the counts).
