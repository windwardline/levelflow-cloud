# The arming-bound read: two in-pool cells survive a one-bar latency, the held-out cells do not, and the hour gate is still 0 of 91 (2026-09-14)

Item 1 of the open-scope round's program
([`open-scope-round-2026-09-13.md`](/docs/research/open-scope-round-2026-09-13.md) §4):
FR-3 arms the runner's protection with zero latency, and 89–97 % of the
trail_tp1 lock's value over hold sat on runners that exited at exactly the lock
level inside the TP1 touch bar (§3, `r3/lock-same-bar-2026-09-14.txt`). Under
the infinite-latency bound — those rows priced at the hold arm — only one of
the four forex in-span cells cleared zero. The program asked for the other end
of the interval: the arming latency as a stated resolver parameter, re-resolved
from the pinned cache as a paired third R column on identical fills (#634), and
the eight cells and the hour gate re-graded under it (#635). This is that read.

## 1. The corpus that carries the column

`r3/capture-all-classfolds-2026-09-14.jsonl` — the record's own recipe
(`successor-corpus.sh`, 2026-09-05) launched as `armed-corpus.sh` at main
`5228332` (clean tree, `source.untracked: 0`), anchor 2026-08-26, from the
pinned cache: "313 cache artifacts all carry the pin, so this run cannot reach
the provider". 19:39:30Z → 22:00:03Z. 6,634,732 rows (the record's count),
17,584,744,472 bytes, sha256 `80ed741c0759…`, manifest `2bd117256d48…`, 75
emit columns (the record's 71 plus `armingBoundRealizedR`,
`armingBoundOutcome`, `armingBoundExitPrice`, `armingBoundExitAtMs`); the
rejection ledger 2,523,837 rows, its sidecar byte-identical to the record's
(414,103,070 bytes). Engine `2026.09.13.forex-commission-usd-quote`.

**The handoff's premise — every pre-existing column reproduces the record
row for row — was stale, and the difference is attributed exactly.** FOUR
`ANALYZER_VERSION` bumps shipped between the record's revision (886fdf1,
engine 2026.09.01) and the main this ran at: `2026.09.03.forex-cost-share-cap`
(#574), `2026.09.03.register-redecision` (#577),
`2026.09.04.removal-test-uniform` (#580) and
`2026.09.13.forex-commission-usd-quote` (#631). **Two of them move an emitted
row**, and they are the two this section accounts for: the forex class row's
`maxCostShare: 0.15` and the four USD-quote pairs' commission. The register
re-decision is visible in the manifest — `engineDeclined` reads 21 markets
against the record's 15, twelve in and six out — and moves no row, because the
sweep does not consult the register: `replay-sweep.ts:1508` imports
`ENGINE_DECLINED_MARKETS` only to STAMP the manifest, and nothing in
`sweep.ts` reads it. That is why the row counts are identical. Main has since
advanced past this corpus again — #641 bumped the version to
`2026.09.14.forex-commission-cross-rate` at 22:07Z, seven minutes after this
run finished — so the corpus carries the price-scaled commission on the 21
forex crosses, exactly as that change's own record states.
`r3/re-simulate-attribution-2026-09-14.txt` walks both files in lockstep:

- 5,852,777 rows are byte-identical once the four arming columns are
  stripped; 781,955 differ.
- 207,272 rows flip `accepted` true → false: every one a forex row whose cost
  share exceeds 0.15, on all 28 pairs (EURCHF 42,539, USDCAD 18,559, EURGBP
  18,493, AUDNZD 16,148, USDJPY 13,055 the largest); no flip in the other
  direction, none off forex, no other field on any of them. The cause is the
  CAP, not the commission: on 24 of the 28 pairs — the three largest among
  them — the commission is byte-identical to the record's, so the share the
  cap gates is the one the record already emitted, and the engine now declines
  it.
- 597,633 rows of EURUSD, GBPUSD, AUDUSD and NZDUSD differ beyond `accepted`,
  in the commission and the seven fields downstream of it. The record charged
  `price × 5e-5` on those pairs — a per-row figure, not a class one, spanning
  roughly 4.8e-5 to 8.6e-5 across their prices — and every new row charges
  exactly the constant 5e-5. The eight do not all move on all 597,633 rows:
  `estimatedCommission`, `estimatedRoundTripCost` and `ladderRewardRisk` do;
  `rewardRisk` moves on 597,553, `grossRealizedR` on 515,852, `realizedR` on
  512,619, `executionScore` on 246,328 and `confidenceScore` on 246,317 (the
  per-field census is in the attribution and in the verification file).
  Beside them, 330 `outcome` and 206 `grossOutcome` labels flip between
  expired-at-loss and expired-in-profit with the sign of the row's own
  repriced R.
- Nothing else differs on any row. A byte comparison with exactly that mask —
  the arming columns stripped, those ten fields masked on the four pairs, and
  `accepted` masked — is recorded in `r3/capture-all-classfolds-2026-09-14.verify.txt`.

So the re-simulate is the record under the shipped engine's admission, not a
copy of the record: its `accepted` carries the cap the record's readers apply
post hoc. The graders therefore read a smaller accepted population than the
2026-09-07 eight-cell table did, and the shift is arithmetic, not drift.

## 2. The control, re-derived and reconciled

Run with `--control <tracked eight-cell table>`, the grader
`arming-bound-cells.ts` refuses to print its other two columns unless the net
column reproduces every cell of that table; without the flag it prints all
three and says no control was named. This read passed the flag. Against `r3/hour-mechanism-2026-09-07.txt`
it refuses on every cell, as it must (that table is the record's population).
The record's own producer (`hour-mechanism.py`, a session copy pointed at the
new corpus) re-derived the table as `r3/hour-mechanism-2026-09-14.txt`; the
grader reproduces all eight of its cells. Every cell of the new table equals
the 2026-09-07 cell minus the rows the cap removed (with the record's R) plus
the four pairs' repricing on rows accepted in both — exactly in n, and to
within 0.1 R in net R:

| fold | pool | span | record n | cap removed | new n | record net R | removed R | repricing | new net R |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| fit | in-pool | in | 39,065 | 1,477 | 37,588 | +1,412.1 | −7.7 | −3.4 | +1,416.4 |
| fit | in-pool | out | 135,438 | 5,782 | 129,656 | −1,506.8 | −529.1 | +1.4 | −976.3 |
| fit | held-out | in | 10,457 | 227 | 10,230 | +335.7 | +2.9 | +10.5 | +343.2 |
| fit | held-out | out | 35,713 | 808 | 34,905 | +107.1 | −36.2 | +41.4 | +184.6 |
| select | in-pool | in | 12,471 | 1,097 | 11,374 | +403.5 | −24.3 | −12.4 | +415.4 |
| select | in-pool | out | 42,948 | 4,383 | 38,565 | −1,724.7 | −343.9 | −39.4 | −1,420.2 |
| select | held-out | in | 3,624 | 227 | 3,397 | +49.8 | −11.7 | +2.6 | +64.1 |
| select | held-out | out | 11,661 | 924 | 10,737 | −296.6 | −86.5 | +8.9 | −201.2 |

Six of the eight cells close on the printed tenth. On fit held-out in-span and
fit held-out out-of-span the three rounded summands sum to +343.3 and +184.7
against printed values of +343.2 and +184.6: the identity closes at full
precision and it is the printed components that round, so a reader doing the
arithmetic above should expect ±0.1 R, not an exact match.

The cap's removals are net-negative in seven cells of eight (−1,036.5 R over
14,925 rows), which is what a cost cap should remove.

## 3. The eight cells under three conventions (`r3/arming-bound-cells-2026-09-14.txt`)

Forex, contained years, accepted baseline fills of the tuning folds; net = as
emitted (FR-3 zero-latency arming), gross = E8's commission with none of the
modelled spread or slippage, bound = the same decision at the net cost with
the protection arming one 5-minute bar late.

| fold | pool | span | fills | E net [lo95] | E gross [lo95] | E bound [lo95] | ΔE bound − net |
|---|---|---|---:|---|---|---|---:|
| fit | in-pool | in | 37,588 | +0.0377 [+0.0319] | +0.0534 [+0.0477] | **+0.0135 [+0.0078]** | −0.0242 |
| fit | held-out | in | 10,230 | +0.0336 [+0.0221] | +0.0523 [+0.0410] | +0.0074 [−0.0038] | −0.0261 |
| select | in-pool | in | 11,374 | +0.0365 [+0.0261] | +0.0568 [+0.0466] | **+0.0121 [+0.0019]** | −0.0244 |
| select | held-out | in | 3,397 | +0.0189 [−0.0009] | +0.0404 [+0.0210] | −0.0071 [−0.0265] | −0.0260 |
| fit | in-pool | out | 129,656 | −0.0075 [−0.0111] | +0.0113 [+0.0078] | −0.0319 [−0.0354] | −0.0243 |
| fit | held-out | out | 34,905 | +0.0053 [−0.0015] | +0.0231 [+0.0164] | −0.0203 [−0.0269] | −0.0256 |
| select | in-pool | out | 38,565 | −0.0368 [−0.0434] | −0.0129 [−0.0193] | −0.0595 [−0.0660] | −0.0227 |
| select | held-out | out | 10,737 | −0.0187 [−0.0310] | +0.0037 [−0.0084] | −0.0413 [−0.0534] | −0.0225 |

In-span cells clearing zero at the lower 95 % bound: **net 3 of 4 · gross 4 of
4 · bound 2 of 4.** (The delta column is the grader's, computed at full
precision; three of the eight do not reproduce exactly from the table's own
printed expectancies, which carry four decimals.) The one-bar latency costs 0.023–0.026 R per fill in every
cell, in and out of span — the same-bar credit is not a span property, as §3
of the round's record said. What survives it is the two IN-POOL in-span cells,
at +0.012 to +0.014 R per fill with lower bounds of +0.002 and +0.008; the two
held-out cells do not (fit held-out +0.0074 with a lower bound of −0.0038;
select held-out −0.0071). Under the hold-priced, infinite-latency bound only
fit in-pool cleared (+0.0102 [+0.0040]). The truth between the columns is
therefore: the in-sample in-span money outlives a one-bar arming latency; the
out-of-sample money existed only under FR-3's zero latency.

## 4. The hour gate on the bound column (`r4/hour-gate-market-bound-2026-09-14.*`)

`grid-totalr --derive-filters "inSpan:decisionHourDistance<=2.5" --verdict-unit
market --r-arm bound`, and the same read on the net column of the new corpus
(`r4/hour-gate-market-net-2026-09-14.*`) for comparison with the 2026-09-12
verdict. The in-span rule accepts on **0 of 91 markets under the bound** (80
judged and failed, 11 no verdict — the three whose every decision already
falls in the span among them), **0 of 91 on the net column of this corpus**,
and 0 of 91 in the 2026-09-12 record. The market grain refuses at either
convention.

One (market, variant) pair does accept under the bound: AUDCHF, a held-out
market, on the emitted arm `runnerProtection=hold,stopStructureSource=intraday_and_daily`
(ΔR fit +24.1, select +92.5, paired p 0.015, ΔE select +0.023, E select
+0.063 with a lower bound of +0.040). That is what removing the lock's
same-bar credit from the baseline does to a hold arm's comparison — the
counterfactual column pricing the baseline's convention away — on one market
of 91 against an expected false-family count of about 4.5 at FWER 0.05. It is
not a candidate: the bound is a pricing bound, not a shipping convention.

**What the 80 failures fail on, and one caveat on the population.** The gate's
acceptance is a conjunction: beat the baseline on every delta AND carry a
positive 95 % lower bound on the variant's own select expectancy. Under the
bound, **20 of the 91 markets fail on the second leg alone** — recorded as
"beat the baseline on every delta, but its own select-fold expectancy is not
positive beyond its error" (11 on the net column, 13 in the 2026-09-12
record). That leg is an absolute expectancy, so it moves one-for-one with
per-fill cost. The refusal is therefore not cost-independent, and §5 does not
treat it as such.

**The caveat, which is the corpus's and not this read's** (widened
2026-09-14 after an investigation established how deep it goes):
`grid-totalr.ts` applies no per-market span exclusion — it imports neither
`feedYears` nor `feedMonths`, where six other readers import `feedYears` — so
it grades on the full calendar, while the 2026-09-12 verdict's own
pre-registration (item 4) requires the exclusion and says "a calendar
pre-registered without it is not pre-registered". Both of today's reads inherit
that, as the 2026-09-12 verdict did.

**And the repair is not a flag.** Item 4 names two facilities, and NEITHER has
a production caller anywhere in this repository: `feedMonths.ts` — the
month-grain map — is imported only by `tests/spanExclusion.test.ts`, and
`calendarFoldsExcluding` — the only allocator that places fold boundaries by
USABLE rather than wall-clock time — is called only from that same test file.
The R3 folds were cut by the plain proportional allocator, which is verifiable
arithmetically: forex's fit fold ends exactly at its span start plus half the
span. And the fold label is stamped at simulation time, each fold simulated on
its own bar slice with its own warmup and decision cutoff, so no reader can
re-cut it. Therefore a `--years contained` flag on the gate — the exclusion the
six other readers perform — would drop escaping rows from folds whose
proportions were still measured on wall clock. That is a partial, year-grain
repair, and it is exactly the failure `calendarFoldsExcluding`'s own docstring
was written against. The month-grain exclusion item 4 actually names is
unimplemented in production, and the boundary half of it cannot be done without
a new sweep.

This read does not claim to know which way the verdict would move under the
excluded calendar, only that the calendar it graded is not the one the
pre-registration names.

## 5. What the program does with the answer

The program's rule was: if no in-span cell clears zero under the one-bar
column, file the hour finding as convention-dependent and the cost table is
moot. Two cells clear, so the trigger did not fire and the finding is not
filed as convention-dependent. But both survivors are IN-POOL: no
out-of-sample in-span cell clears zero at its lower bound once the arming
latency is one bar (fit held-out's bound expectancy is positive at +0.0074
with a lower bound of −0.0038; select held-out's is negative at −0.0071). And
the market-grain gate accepts nothing at either convention.

**The cost table is not structurally moot, and an earlier draft of this
section said it was.** A quoted spread does not add to the modelled one — it
REPLACES it (`executionQuality.ts`, `estimatedSpread = quotedSpread === null ?
modeledSpread : …`, and the entitlements record says the same) — so a measured
E8 spread tighter than the model RAISES cells, and the sign is empirical, not
structural. What can be settled here is the size of the prize, from this
read's own table: gross minus net is the whole modelled spread-and-slippage
charge, worth **+0.0157 (fit in-pool), +0.0187 (fit held-out), +0.0203 (select
in-pool) and +0.0215 (select held-out) R per fill** in the four in-span cells.
Against that:

- **Select held-out in-span cannot be lifted by any non-negative spread.** Its
  bound lower bound is −0.0265, and removing the ENTIRE modelled charge is
  worth +0.0215. The cell is short by 0.005 R per fill with the cost already
  at zero.
- **Fit held-out in-span could be lifted in principle**: it needs +0.0038
  against +0.0187 available, about a fifth of the modelled charge. But the
  population is not fixed while the cost moves — admission gates on
  `costShare` against the 0.15 cap, so a cheaper round trip re-admits rows the
  cap currently declines, and the cell that would be measured is not the cell
  measured here.
- **The gate is a cost question in part**: 20 of 91 markets under the bound
  fail only on their own absolute select expectancy (§4), which moves with
  per-fill cost.

So the capture is not incapable of mattering; it is capable of mattering on
one held-out cell and on some of the twenty, and incapable on the other
held-out cell at any price. FMP carries no usable forex bid/ask on any
endpoint (probed 2026-09-14, `docs/fmp-entitlements.md`), so an owner-run E8
TradeLocker capture is the only source of that table. **The recommendation that came out of
the refuter round is narrower than "defer it"**
([`owner-rulings-2026-09-14.md`](/docs/research/owner-rulings-2026-09-14.md),
ruling 1): keep it low priority, refuse a majors-only version — five of the six
held-out forex markets are crosses — and do the free work it stands in front
of, which is deriving the forex spread and slippage constants that carry none.

The grain arithmetic the round's item 7 raised is worse under the bound, as
its author expected — though by less than the round's estimate. Required fills
scale as the inverse square of the effect, so against the class-grain +0.03 the
measured +0.0121 to +0.0135 worsens the requirement about five- to sevenfold,
not the ninefold the round projected from +0.01.

## 6. Provenance

Zero provider bytes for the re-simulate and for every reader below; the day's
shared usage ledger is not zero, because the FMP bid/ask probes §5 cites were
run the same morning. The re-simulate: `armed-corpus.sh`
(`~/Library/Application Support/WindwardLineToolchain/levelflow/`), whose
status log is untracked by design (`*.log`), so its two lines are quoted in
the tracked verification file instead. Verification: the session instruments
`post-run.sh`, `attribute-v2.py` and the masked `cmp` (scratchpad), their
outputs in `r3/re-simulate-attribution-2026-09-14.txt` and
`r3/capture-all-classfolds-2026-09-14.verify.txt`. The control:
`hour-mechanism.py` (session copy, corpus path as an argument) →
`r3/hour-mechanism-2026-09-14.txt`. The graders, census-registered readers:

```
npx tsx scripts/arming-bound-cells.ts docs/research/r3/capture-all-classfolds-2026-09-14.jsonl \
  --years contained --witness docs/research/r3/feed-character.txt \
  --control docs/research/r3/hour-mechanism-2026-09-14.txt
npx tsx scripts/grid-totalr.ts docs/research/r3/capture-all-classfolds-2026-09-14.jsonl \
  --derive-filters "inSpan:decisionHourDistance<=2.5" --verdict-unit market --r-arm bound \
  --out docs/research/r4/hour-gate-market-bound-2026-09-14.json
```

The confirm fold was not read BY ANY READER: every census-registered grader
seals it at the door and says so in its output (2,141,527 rows withheld). The
two verification instruments are the deliberate exception — the attribution
and the masked comparison walk all 6,634,732 rows, confirm included, because
their subject is the corpus's bytes and not its money. So the pooled counts in
§1 (the 207,272 flips, the per-field census) span the whole file, while every
figure in §2, §3 and §4 is a tuning-fold figure. The corpus of record is untouched; the re-simulate sits beside
it and is not promoted over it — it carries the shipped admission and the
four pairs' repricing, which the record does not, and the readers that cite
the record keep citing it.
