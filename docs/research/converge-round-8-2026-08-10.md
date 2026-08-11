# CONVERGE round 8 — 2026-08-10, seven lenses, 73 findings

Owner invoked CONVERGE 23:20 EDT. Prior round's recommendations recorded as
approved (the 4b decision sheet; the fold-architecture repairs made under
it). Seven adversarial agents, one lens each, briefed to treat this
weekend's own fixes as targets: look-ahead & statistical validity (LA-1..17),
fill realism (FR-1..12), cost truth (CO-1..9), coverage (CV-1..11),
risk/prop-firm survival (RM-1..10), product honesty (PH-1..14), operations
at full roster (OP-1..10). Full agent reports are in this session's record;
this file is the triaged ledger and the dispositions of record.

## The synthesis

**The corpus is honest; four layers above it are not.**

1. **The verdict layer is not yet a gate** (LA-3 critical: permutation p
   printed but NOT in the acceptance rule — a committed ACCEPT stands at
   p=0.146; LA-4: paired days pooled as independent; LA-5: iid σ with no
   pairing covariance, clusteredStandardError never called by the gate;
   LA-6 critical: the confirm fold prints unconditionally — burned for the
   first grid; LA-7: the 4b review pooled all three folds before choosing
   the axes; LA-16/CV-8: shard-0's manifest printed as the corpus's).
   All READ-TIME: repairable without resweeping.
2. **The cost model is not the venue's bill** (CO-3 critical: forex's
   published $5/lot round-turn commission absent — ≈75% of the modeled RT,
   killing the three "surviving" crosses; CO-1: futures' three per-contract
   fees dropped by the tick-floor fix — micros +30–50% understated; CO-2:
   crypto 3.5bps vs venue book median 8–11bps; CO-4/5: CFD commissions and
   the dead indices/energies profiles; FR-1 high: every event triggers on
   MID while the venue executes on bid/ask — entry/TP over-credited,
   stops under-triggered by ~spread/2, an event-selection bias additive
   cost can't repair). ENGINE changes → next analyzer rev + one warm
   re-simulate.
3. **The identity seam** (CV-1 critical/FR-2/LA-11/CO-5): FMP spellings fed
   getAssetType's silent forex fallback — six indices, ARUSD, OTRUMPUSD,
   WTI mis-classed in the baseline corpus (ARUSD/OTRUMPUSD took a real
   2–3h daily-completion look-ahead). CAUGHT mid-round; the roster-name
   fleet relaunched 23:36 with eight classes. Residual: harden the
   fallback, correct the roster arithmetic (105, not 106 — CV-9/OP-10).
4. **The product still tells the pre-repair story** (PH-1 critical: five of
   six Record rows print the invalidated record unsuperseded under the
   file's own defined flag; PH-3/4/2: the Guide asserts score-separation,
   pivot stops, and a dead replay description; PH-7: ambiguous counted as
   no-loss in THREE places against 2e — including learning.ts feeding
   everyone's confidence_adjustment; PH-13: the resumption protocol's SQL
   counts a dead cohort forever). Desk parked = no reader today; all must
   land before any reopen.
5. **Survival and ops are unmeasured constraints, not footnotes** (RM-5
   critical: correlation groups leak the quote currency and omit 25/33
   crypto + the new futures — one scan can emit 14% correlated risk against
   a 3% daily line; RM-3/4/6/7/8: daily-line arithmetic vs measured stop
   tails, hold's same-day drawdown, E8 One's close-ratchet, corpus density
   vs the 2% pause — none measured or gated anywhere; RM-1: 4×ATR stops
   make most futures unsizeable at 1-contract steps. OP-1: analyzer_events
   grows forever, zero retention paths in the schema; OP-4: outcome-sync
   outruns its own 15s cron timeout at 106 markets — hourly false alarms;
   OP-6: one FMP key, fleet+scan arithmetic exceeds 3,000/min, neither side
   retries a 429 — the probable killer of the first fleet's silent shard
   deaths; OP-8: the weekend's Intl-per-call CPU class survives in
   replay.ts's expiry path ×300 per cron run; OP-5: 2.8GB dead cache
   legacy + ~8GB/round with no lifecycle).

**Dispositions (fix batches, ranked; every item below carries its finding
IDs so nothing is silently dropped):**

- **Batch 1 — the gate becomes a gate (read-time; grades tonight's corpus
  honestly).** Paired day-delta sign-flip permutation per class over SHARED
  days (LA-4); p enforced in `accepted` with max-T family-wise control
  across the grid (LA-3); σ demoted to descriptive or replaced by the
  permutation CI (LA-5); confirm-fold discipline by mechanism — computed
  only under an explicit flag that appends to a burned-log keyed by corpus
  hash (LA-6); per-cell deterministic seeds (LA-16); holdout recomputed
  READ-TIME with per-class stratification (CV-4/5 — the stamped field
  stays as provenance; no resweep needed); union holdout + correct counts
  printed (CV-8/LA-16); per-cell expiry-share and censoring readout so
  sizing-factor cells carry their own license (LA-10); per-symbol
  fold-participation report naming starved markets (CV-3); day-cluster /
  daily-line survival table per variant per E8 line joins the gate output
  (RM-3/4/6/8 as measurement).
- **Batch 2 — identity hardening + record arithmetic.** Strict classifier
  in the sweep path (unknown symbol → refusal, not forex — CV-10/LA-11);
  roster numbers corrected to 105 everywhere (CV-9/OP-10/PH-13's SQL
  cohort too); the misclassified baseline evidence docs annotated, not
  rewritten (FR-2).
- **Batch 3 — engine v2: the venue's bill and the venue's fills.**
  Commissions per line (forex $5/lot RT, indices $6/$12, crypto per the
  dossier's conflicted units resolved conservatively, futures' three fees
  — CO-1/3/4, FR-11); bid/ask event adjustment (±spread/2 on trigger
  levels — FR-1); 5min RESOLUTION where the series exists (kills most of
  the 2.5–4.7% ambiguous bucket honestly — FR-5); expiry-boundary bar clip
  (LA-2); BE-arming same-bar option and TP1 manual-exit haircut as
  parameters (FR-3/4); one-bar placement latency option (FR-6); touch-fill
  penetration option (LA-13); reopen-slippage class for gap exits (FR-7);
  Intl hoists in replay.ts/sessions.ts (OP-8); expired-label vs net-R
  coherence (FR-8). ANALYZER_VERSION bump; one warm re-simulate becomes
  4d's corpus.
- **Batch 4 — live-product truth (parked, pre-reopen bar).** superseded
  flags on all six Record rows (PH-1); ambiguous-as-loss coherence in
  classifyWinLoss + learning.ts (PH-7); payoff-refusal reason split
  (PH-9); per-broker record claims (PH-6); stale pre-repair payoff on
  stored rows labeled (PH-11); correlation-group completion — quote-
  currency groups, 25 crypto, new futures (RM-5) — plus concurrent-
  exposure surfacing (RM-5/6).
- **Batch 5 — ops hygiene.** analyzer_events retention migration + prune
  cron split by action lifecycle (OP-1/3's awaited-insert demotion);
  outcome-sync time budget + pagination + its Intl fix (OP-4/8); FMP 429
  retry with backoff in BOTH fetchers + fleet pacing flag (OP-6);
  disk lifecycle script (legacy cache purge, finished-round archival,
  minute-bank rotation — OP-5); topup script roster-derived (OP-9);
  scan progress numerals + capacity comments to 105 (OP-2/10).
- **Batch 6 — owner-gated copy.** One review doc: every Guide line PH-2/
  3/4/5/8/10/14 with its measured contradiction and a proposed replacement,
  for owner ruling in a single pass (§17 discipline).
- **Named boundaries (disclosed, not fixable retroactively):** every
  shipped calibration constant predates the holdout (LA-8) and ZOUSX's
  override was derived on its own data (CV-11) — confirm reads under 4d
  strip per-symbol overrides or re-derive in-fold; the completion
  conventions rest on single-instrument probes per class (LA-12) — holiday
  semantics probed before any class where it becomes material; COT timing
  (LA-17) inert until a cotScoreAdjustment ships; the 4b axis choice
  consumed pooled folds (LA-7) — the axes stand as owner-approved
  directions, and engine-v2's fresh fit/select adjudication under the
  repaired gate is what earns acceptance, with tonight's grid demoted to
  directional evidence.

**Clean after adversarial inspection (for the record):** the 2c fill-bar
geometry (three lenses independently), the 2g leg accountant's arithmetic,
resampling's trailing bucket, corpus-end embargo censoring, the 2b
timezone repair, legs-in-feedback UI leakage (no renderer, null-guarded),
membership of universe↔sweepUniverse (exact), and the parking page's own
sentence.
