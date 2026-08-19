# R1 "one engine" — the divergence map (2026-08-18)

Phase 1 of `docs/research/remediation-program-2026-08-11.md`: close every
sweep↔live divergence "so that what is measured is what trades." This map
pins each divergence to its exact code on both sides, records the
decision each one needs, and sequences the change set. It was read
against the live sources on 2026-08-18, one commit after R0's code half
(#358) and its round-6 hardening (#359).

The two engines today:

- **Live**: `trade-analyzer/index.ts` builds setups from
  `fetchFirstAvailableMarketContext` (marketLoader.ts) and grades them in
  two writers — the in-request `refreshUserOutcomes` (index.ts:1676) and
  the hourly `outcome-sync` (outcome-sync/index.ts) — both resolving with
  `evaluateSetupOutcome(setup, bars15min, now,
  fillOptionsFromRiskModel(risk_model))`.
- **Sweep**: `trade-analyzer/sweep.ts` `simulateSymbol` builds decision
  contexts from the calibration cache and resolves with the same
  `evaluateSetupOutcome`, but under FR-5 options (5-minute resolution)
  and with three score inputs hardwired to zero.

D3 (two live resolvers with different physics) closed 2026-08-11 (#333)
and stays closed — `tests/securityHardening.test.ts` pins both live call
sites on `fillOptionsFromRiskModel(setup.risk_model)`.

## E1 — resolution granularity: live 15-minute, corpus 5-minute — **CLOSED (R1a slice 2)**

**Live**: both writers fetch `fetchFmpBars(providerSymbol, "15min", …)`
(index.ts:1724, outcome-sync/index.ts:112) — a single 45-day-lookback
request (marketLoader.ts `defaultLookbackDays`), normalized and capped
at 3,000 rows — and resolve with `fillOptionsFromRiskModel`, which
hardcodes `barIntervalMs: 15 * 60 * 1000` (replay.ts).

**Sweep**: FR-5 resolves each decision on the 5-minute series from
`latest.time + 15min` forward (`resolutionIntervalMs = 5 * 60 * 1000`,
sweep.ts), so touch ordering, same-bar ambiguity and protection arming
are all measured at 3× finer granularity than live grading applies.

**The program's warning** ("do NOT simply move production to 5-minute,
which would import 1b's sawtooth") predates R0. The sawtooth was a
defect of the CACHE's chunked accumulation — the live path has always
been a single un-chunked request and never carried it. What the warning
still correctly points at is **depth arithmetic**: a live 5-minute
request at 24/7 density yields ~288 rows/day, and the measured single-
response evidence (2026-08-18) is only that ≥2,304 rows (8 days) arrive
complete. A setup must be graded from bars that reach back to its
creation; grading needs creation → expiry + the tail to `now`. With the
hourly sync, a row's grading life is its review window (category
`defaultReviewHours`) plus at most hours — comfortably inside 8 days in
the ordinary case, but not in every case (sync outages, weekend
expiries, a backlog past `MAX_SETUPS_PER_RUN`).

**Decision (proposed)**: live resolves on 5-minute bars — the measured
physics — with a **stated, recorded degradation**: when the fetched
5-minute series does not reach a setup's `created_at` (earliest bar >
created_at), that setup grades on the 15-minute series instead, and the
resolution timeframe is written into `feedback` (e.g.
`resolutionTimeframe: "5min" | "15min"`) so cohort reads can filter or
weight. This is not a new pattern — it is the sweep's OWN rule
(sweep.ts: 5-minute resolution stream when present,
`input.primaryBars.slice(index + 1)` at 15-minute interval otherwise),
so E1 closes to literally one shared tiering. The sweep's emit does not
currently record which tier graded a row either — R1b adds the same
field to the emit for symmetry. `fillOptionsFromRiskModel` grows the interval parameter;
`tests/securityHardening.test.ts`'s call-site pins evolve with it (they
currently pin the exact one-argument shape). Byte cost is flat (2,304
vs 3,000 rows per symbol per sync).

## E2 — "no bars in the review window" is not a plan rejection — **CLOSED (live half R1a slice 2; sweep half + door R1b, 2026-08-18)**

**Live**: `evaluateSetupOutcome` returns `outcome: "unfilled"` when
`createdBars.length === 0 && now > expiresAt` (replay.ts) — data absence
grades as not-filled.

**Sweep**: `simulateSymbol` counts every `evaluation.state !==
"resolved"` as `rejections.planRejected` (sweep.ts) — data absence
wears a plan verdict.

**Fix**: a distinct resolution state / counter for "no bars in the
review window" on both sides (live: a distinct feedback marker rather
than bare `unfilled`; sweep: its own rejection counter, never
`planRejected`), and — the density half — a **per-symbol 5-minute
density assertion** binding absolute rows/day and the shared-window
ratio, landed in TWO layers (#364 rounds 8–9, superseding the
corpus-door-only design stated here): the sweep driver's pre-flight,
refusing at the first violator before that symbol simulates (the
loop interleaves per symbol, so a late violator costs the roster
prefix already walked — round 31), and the read-time corpus door,
with the nightly `--warm-only` log the standing full-roster survey
(round 32: the survey runs the door itself in report mode —
would-refuse verdicts logged, never thrown). The verify-cache-clock ceiling's blind band
(~2,386–2,784 cap: only the 15-minute series clips, ≤~14%, ratio in
band) is narrowed by the assertion's clip-invariant max(15-minute,
5-minute/3) population to a stated residue of ≤~7.7%, with the
symmetric-clip case uncovered by any layer (rounds 10–11) — a
residue, never a closure.

## E3 — `market.latest`: 1-minute live, 15-minute decision bar in the sweep — **CLOSED (R1a slice 2)**

**Live**: `pickLatestTimeframe` prefers `1min` whenever present
(marketLoader.ts:415), so `market.latest` is the last 1-minute bar and
`buildPricePlan` places entries relative to a ≤1-minute-old close.
`confluence.orderConstruction.latestClose` records it.

**Sweep**: `buildDecisionMarketContext` sets `latest` to the 15-minute
decision bar — the only honest choice, because the corpus has no deep
1-minute history (FMP serves ~3 days; that is §21's minute-bank program,
not this cache).

**Decision (proposed)**: pin **the decision bar** as the one anchor for
setup construction on both sides — live's analyzer context sets `latest`
to the last completed 15-minute bar (the primary decision timeframe),
because that is the information set every measured number was derived
under. The 1-minute freshness advantage is real but UNMEASURED, and
cannot be measured until the minute bank matures into the corpus; when
it does, moving both sides together is one deliberate change. The chart
feed (`market-data`) is untouched — display freshness is not decision
input. The quote snapshot (`market.quote`) stays live-only for spread
banking (2j) and display; nothing in scoring reads it.

## E6 — three score inputs hardwired to zero in the sweep — **CLOSED (R1b, 2026-08-18)**

**Live** (`analyzeSetup`, index.ts:1198): `scoreSetupConfidence` receives
`macroAdjustment` (from `fetchMacroRateContext` — live Treasury curve),
`providerWarningCount: market.providerWarnings.length`, and
`weightAdjustment` (from `strategy_weightings_global`, version-scoped —
the learning loop).

**Sweep** (`simulateSymbol`): `macroAdjustment: 0`,
`providerWarningCount: 0`, `weightAdjustment: 0`.

**Per-term resolution** (the program: "give the sweep the inputs or
state that they must be zero"):

- `providerWarningCount` — **zero is correct by construction** in
  replay: warnings are live transport failures, and the corpus door
  refuses a cache that cannot prove completeness. State it in the sweep
  beside the option, assert it in the manifest conditions, done.
- `macroAdjustment` — **reconstructable**: the adjustment is a pure
  function of the 2Y/10Y curve at decision time
  (`calculateMacroRateAdjustment`), and daily Treasury series are deep
  and cheap. The sweep loads the historical curve (one more rolling
  store, clock-stamped like the calendar) and feeds the real value per
  decision instant.
- `weightAdjustment` — **cannot be replayed honestly without simulating
  the learning table's own evolution** (walk-forward learning), which is
  a program, not a patch. Decision: the corpus measures the RAW engine
  (`weightAdjustment: 0`) and says so in the manifest
  (`conditions.weightAdjustment: "raw-engine-zero"`), so no reader can
  mistake corpus expectancy for cohort-adjusted expectancy. D1 (Phase 2)
  re-derives the adjustment itself from mean realized R — its inputs
  come from production outcomes, not from the sweep — so nothing in
  Phase 2 is blocked by this.

## E4 — correlation collapse exists only in production

**Live**: two mechanisms — per-scan
`collapseRelatedMarketOpportunities` (index.ts:941; winner by
`compareScanCandidates`: confidence → rewardRisk → executionScore →
symbol) and the cross-scan 6-hour screen
`findStrongerActiveCorrelatedSetup` (index.ts:1055; RM-5 symbol-union).

**Sweep**: none — every candidate becomes a corpus row, so the corpus
overstates concurrent exposure and never measures the selection the
live engine actually performs.

**The program is explicit**: "measurable offline from the corpus (a
read, not a re-sweep)." So E4 is an **instrument, not a sweep change**:
a doored reader that replays the collapse over corpus rows — group
candidates by decision instant and correlation group (both already in
the emit), apply the same comparator, and report collapsed vs
uncollapsed expectancy and the suppression rate per group. The 6-hour
cross-scan screen needs candidate timestamps only — also present. If
the measured difference is material, whether the sweep should collapse
in-line becomes a Phase 3 decision made on evidence.

## E7 (discovered 2026-08-18) — the options bridge drops the runner-protection mode — **CLOSED (R1a slice 2)**

Not on the program's list; found while mapping E1. The resolver's
runner protection is a MODE (4c axis): `options?.runnerProtection ??
"breakeven"` (replay.ts:310). The sweep passes
`calibration.runnerProtection` (sweep.ts), and the shipped calibrations
set `trail_tp1` or `hold` for most categories. But
`fillOptionsFromRiskModel` never sets the field — the setup row does
not STORE the mode (neither `risk_model` nor
`confluence.categoryCalibration` carries it), so the batch-4 bridge
could not read it — and therefore **both live writers grade every row
with `"breakeven"`** while the corpus measured `trail_tp1`/`hold`
physics for those same categories. Every post-TP1 sequence (runner
stopped at entry vs locked at TP1 vs holding the original stop) can
grade differently live than measured.

`reviewHours` is the same class, smaller: live omits it, so
`getSetupExpiryTime` applies the calibration AT RESOLUTION TIME, while
the row stores its decision-time window
(`risk_model.reviewWindowExpiresAt`,
`confluence.categoryCalibration.reviewWindowHours`). A calibration
change between creation and grading silently re-times old rows' expiry.

**Fix (R1a)**: setup construction writes the mode into `risk_model`
(beside `stopLogic`); `fillOptionsFromRiskModel` reads mode and review
window from the row — decision-time facts, exactly the bridge's own
stated philosophy — with absent-field rows resolving as today
(`"breakeven"`, current calibration) so old-row grades do not silently
change shape; the `ANALYZER_VERSION` bump scopes the boundary. The
`tests/securityHardening.test.ts` call-site pins evolve with the bridge
signature if it grows a second argument for E1's resolution timeframe.

**Why the DURATION field, not the stored instant (the dedupe-restamp
clause, folded from #362 round 3 for the record here where E7 is
read)**: `risk_model.reviewWindowExpiresAt` already carries a fully
weekly-clamped expiry instant on every row, and it is deliberately NOT
the bridge's read. `upsertActiveSetup`'s same-side dedupe rewrites
`risk_model` wholesale on a re-scan while `created_at` is preserved —
so a deduped row's stamped instant describes the LATEST observation's
window and runs ahead of the resolver's `created_at + hours`. Reading
`reviewWindowHours` keeps one window law — creation plus decision-time
duration, weekly-clamped by `getSetupExpiryTime` at grading — for fresh
and deduped rows alike, and the client copy gate makes the same choice
for the same reason (slice-2 closure record, copy-gate residue).

## D2 — realized R exists only on the expiry branch — **CLOSED (R1a slice 1, 2026-08-18)**

**Was**: `realizedR`/`netRealizedR` were computed and written into
`feedback` ONLY in the expiry branch — the take-profit, stop-loss,
TP1-lock and same-bar-arming resolutions returned legs but no realized
R, so any R sum over `trade_outcomes` was a sum over expiries alone —
and even the expiry branch billed full size on a half-sized runner
after TP1 banked. The sweep computed `realizedRFromLegs` for every
resolved row, so the corpus had uniform R and the cohort did not.

**Closed by**: the 2g accountant moved into `replay.ts`; the resolver
writes gross `realizedR` and net `netRealizedR` from its own legs on
EVERY filled resolution (a TP1-banked expiry now scores the ladder;
unfilled rows carry neither field); the sweep imports the same
function; `extractRealizedR` prefers net so a stat labelled "Net R" is
net; `ANALYZER_VERSION` → `2026.08.18.realized-r` moves the cohort
boundary with the changed numbers. Producer pins in
`tests/replayHarness.test.ts`.

**Deferred, named**: the register remedy's third clause — back-deriving
R for rows resolved BEFORE the bump from their stored legs — rides with
Phase 2's D1 recompute (one data touch, not two). Until it lands,
pre-bump take-profit/stop-loss rows stay R-less and the frontend is not
cohort-scoped (`buildRecordBand` and `netRForSlice` read all rows), so
the Insights Net R band under-counts exactly those rows — E2E debris
only today, per the 2026-08-11 wipe. Carried on HANDOFF's small list.

## Slice 2 closure record (2026-08-18)

Shipped as one PR after slice 1, under `2026.08.18.one-physics`. The
PR's own review round (#362) found the E3 half-application and three
policy gaps before merge; the bullets below describe the amended state,
with the round's findings folded in rather than recorded as a separate
layer.

- **E1**: `resolutionSeriesFor` in `replay.ts` is the ONE tiering rule —
  5-minute when it reaches the setup's creation, else 15-minute — used by
  both live writers (each now fetches both series per symbol), and the
  resolver stamps `feedback.resolutionIntervalMs` on every resolution so
  degraded rows are visible. Failure policy (#362 review, finding 3): a
  thrown 15-minute fetch fails the setup for that run — nothing to grade
  on — while a thrown 5-MINUTE fetch degrades to the 15-minute tier,
  visibly via the stamp; the caught promise is what the per-symbol cache
  holds, so one 5-minute failure cannot poison the symbol's remaining
  setups. Round 2 then found the THIRD caller: the sweep's own inline
  admission took the 5-minute tier whenever the corpus array was
  non-empty, never testing reach-back to the decision instant — so a
  decision predating the 5-minute corpus graded a truncated window (or
  resolved through the no-bars branch, E2's own defect reproduced by the
  tiering) while live degraded honestly to 15-minute physics. The sweep
  now decides its tier through `resolutionSeriesFor` as well — three
  callers, one rule; its FR-5 start offset and horizon slice are
  unchanged. Round 3 then held the closure to the PR's own thesis: the
  sweep-side pin is EXECUTED, not source-matched — `tests/sweep.test.ts`
  drives `simulateSymbol` with a 5-minute corpus that begins after every
  decision (grades identically to having none) and one that reaches back
  (governs grading), so a reformatted reintroduction of the old
  non-empty admission fails regardless of spelling. The sweep's emit
  symmetry — recording the tier per corpus row — landed in R1b
  (`SweepOutcomeRecord.resolutionIntervalMs`, executed in
  `tests/sweep.test.ts`).
- **E2 (live half)**: the true no-bars expiry carries
  `feedback.noBarsInReviewWindow: true`; a bars-but-no-fill expiry does
  not. The sweep's half and the corpus door landed in R1b (closure
  record below), which also refined the marker itself: #362 round 7
  caught the containment set standing in for the wrong question, and
  the marker now gates on whether a completed bar COULD have existed
  in the window (scoped to the resolution stream — the R1b record
  below carries the full rule per caller) — a window clamped under one
  bar span (creation inside the final bar before the weekly close)
  resolves unfilled UNMARKED with its own sentence, a grading-law fact
  rather than a data fact.
- **E3**: the completed-bar law applies to the SERIES, not just the
  anchor pointer (#362 review, finding 1 — moving `market.latest` alone
  left entry math, ATR, pivots and the committee on the forming bar and
  turned `buildPricePlan`'s viability gate into a live-only directional
  filter): `completedIntradaySeries` (bars.ts, executed by the harness)
  trims every intraday series to closed spans before the sufficiency
  check, `market.latest === market.primary.at(-1)` by construction, the
  forming-bar fallback is deleted (finding 4), and `buildPricePlan`
  derives every price from its own series tail — the sweep's exact
  single-anchor shape. The 1-minute-preferring picker is deleted, and
  with it the 1-minute FETCH (#362 round 2, finding 2): nothing decided
  on that series any more — the alignment vote filters it, the primary
  picker never selects it — so the analyzer stops paying a provider call
  and up to 1,800 decoded bars per symbol per scan for a display chip,
  and `availableTimeframes` (and the "< 3" sufficiency gate reading it)
  now counts exactly what the sweep's does. Chart feed and quote
  snapshot untouched — `market-data` has its own timeframe list.
- **E7**: construction writes `runnerProtection` and `reviewWindowHours`
  into `risk_model`; the bridge reads them with strict validation, and
  pre-slice rows keep today's exact behavior, version-scoped. The reads
  sit ABOVE the cost gate (#362 round 4, finding 2): mode and window are
  decision-time facts orthogonal to the cost triple, so a malformed cost
  stamp fails only the cost fields — it no longer sends a validly
  stamped row back to the breakeven fallback. The same
  rule now governs the CLIENT's copy-gate window (#362 review, finding
  5): `storedSetup.ts` prefers the row's stamped `reviewWindowHours`
  over the calibration mirror, same validation as the bridge, mirror
  fallback for pre-E7 rows — the one frontend touch in R1a.
- Pins: behavioral in `tests/replayHarness.test.ts` (tiering, interval
  stamp, no-bars marker, bridge reads, trail_tp1-through-the-bridge),
  `tests/barDecode.test.ts` (the trim, executed), `tests/pricePlan.test.ts`
  (single-anchor construction), `tests/storedSetup.test.ts` (row-stamped
  copy window); source-level in `tests/securityHardening.test.ts` for
  the Deno-side halves. The pre-pin suite ran green with zero failures
  on the physics change — the same producer-never-tested pattern as
  D2's register entry, now closed for these paths too (#362 finding 2
  closed the loader instance of it).
- **Residue, named not smuggled** (rides with R1b unless marked):
  - The GRADING series (both writers' `fetchFmpBars` results) still
    carries its forming tail bar. Highs and lows of a forming bar are
    realized prices, so touch grading is honest; the divergence is the
    expiry branch pricing its exit off a non-final close — small, real,
    and the corpus never does it. Deliberate decision pending (trim vs.
    wait-one-span).
  - `confluence.orderConstruction.latestClose` — the client's §19c
    sizing rate — aged with the anchor (#362 round 2, finding 3): a
    completed-bar close bounded by the primary span (daily on the
    loader's fallback) instead of a ≤1-minute print. Accepted for
    sizing tolerance; sourcing the bridge quote from `market.quote` is
    a §19 governor change with its own review, not an engine rider.
  - The copy gate matches the resolver on hours but not on the weekly
    close (#362 round 2, finding 4 — pre-existing): `getSetupExpiryTime`
    clamps every non-crypto window to the weekly cutoff and
    `storedSetup.ts` computes flat hours, so a Friday-afternoon forex
    setup stays copyable past the instant the resolver expires it.
    Round 3 corrected WHY this stands: `risk_model.reviewWindowExpiresAt`
    already carries the fully clamped instant on every row — but
    `upsertActiveSetup`'s same-side dedupe rewrites `risk_model` on a
    re-scan while `created_at` is preserved, so a re-scanned row's
    stamped instant runs AHEAD of the resolver's `created_at + hours`;
    hours-from-created_at is the read that cannot drift. The client's
    fallback for pre-E7 rows now reads
    `confluence.categoryCalibration.reviewWindowHours` (the same
    decision-time value those rows already carry) before the mirror.
    Closing the clamp itself means mirroring the weekly-close rule
    alone client-side, or making the dedupe restamp coherently — its
    own considered change.
  - `market_data_health.latest_bar_at` aged with the anchor (#362 round
    3, finding 2): it now stamps the completed decision anchor's time —
    the decision basis' age, up to one primary span behind the clock, a
    daily stamp on the loader's fallback — not a provider freshness
    probe (`last_checked_at` carries that). The "limited" status
    threshold moved with the fallen ceiling (< 4 of six → < 3 of five),
    status-preserving for every symbol whose 1min series qualified and
    deliberately LOOSER for the ones it never qualified on (#362 round
    4, finding 3): a 3-of-5 thin symbol was "limited" only because a
    series the engine no longer consumes counted as missing, and
    absence of decision-irrelevant data is not a coverage defect.
  - **Anchor latency** (#362 round 4, finding 1 — the residue this
    slice itself created): the corpus's decision instant IS its anchor
    bar (the sweep stamps `created_at: latest.time`), so corpus anchor
    latency is zero; live decides at wall clock against an anchor that
    is on average half a primary span old (up to 4h on the `4hour`
    fallback). The through-market case is CLOSED at admission —
    `buildPricePlan` refuses a buy limit at/above the live ask and a
    sell at/below the live bid, the out-of-population "market order in
    a limit costume" nothing else would have caught after round 1's
    cross-anchor gate was removed; the quote never enters a derived
    price, and a null quote (fetch failure; every sweep context) admits
    as before. The refusal carries its own diagnostic sentence ("The
    live market has already crossed the computed limit entry…" — 1b's
    rule, #362 round 5), and because `analyzer_events` carries
    `analysisDiagnostics` verbatim, its frequency is the ONE measurable
    read on the through-market rate that exists before the minute bank —
    the instrument this bullet used to say nobody had; a run of them on
    one symbol is also the bad-quote signal (quotes get none of the
    bars' de-spiking). **Population, stated** (#362 round 6):
    `explainNoSetup` narrates every scanned symbol whose committee
    produced a side — including the 15 decline-layer markets and
    blocked-regime scans, where `analyzeSetup` never builds a plan — so
    the raw count is an UPPER BOUND on setups lost to latency, not that
    rate. The same diagnostics array carries the decline and
    blocked-regime sentences, so a query scopes the population by
    excluding events that also carry those markers. One display note:
    in the declined-plus-blocked shape the crossed-quote sentence lands
    fourth and `NoSetupPanel`'s three-reason cap drops it from the UI —
    the event record, which is what the instrument reads, keeps it. What REMAINS residue is the symmetric fill-rate
    smear: the market moves both ways inside the latency window,
    spreading the live fill distribution around the corpus's
    zero-latency measurement — and its second half, decision→first
    gradeable bar: `evaluateSetupOutcome` admits bars from `created_at`
    forward, so live loses the partial bar the creation instant falls
    inside (≤5 minutes on an admitted 5-minute row, ≤15 on a degraded
    one — tier-dependent inside one cohort) while the corpus's decision
    sits exactly on a bar boundary and loses nothing. Unmeasurable
    until the minute bank matures (§21); named here so no cohort read
    mistakes it for closed.
  - `completedIntradaySeries` span-tests the session's FINAL `1hour`/
    `4hour` bar too (#362 round 2, smaller item): FMP's truncated
    session-close bars (an equity 15:30 hourly covers 30 minutes) read
    as forming until the full span elapses, so a genuinely completed
    bar is briefly dropped and the ≥40/≥80 counts drop with it. Error
    is conservative-direction and bites only when `1hour`/`4hour` is
    primary; the sweep resamples those series from 15-minute history
    and never span-tests them.

## R1b closure record (2026-08-18) — the sweep tells the truth about its inputs

- **E2, sweep half + marker refinement**: the resolver's no-bars branch
  gates the marker on **whether a completed bar COULD have existed in
  the stream handed to it** — a fact about the window and the bar grid
  (bars sit on epoch multiples of their span; the first slot at/after
  `max(createdAt, streamStartsAtMs)` either fits inside
  `[createdAt, expiresAt)` or nothing ever could). The sweep passes
  `streamStartsAtMs = decision bar open + 15min` because FR-5 starts
  its stream one decision bar after creation on both tiers (#364 round
  4, finding 1 — computing from `createdAt` alone let the decision
  bar's own slot, never in the stream, pretend to fit, false-marking
  every weekly-clamped window between one and two bar spans: one
  artifact row per clamped symbol per week); live omits the option,
  since its stream reaches back past creation and `createdAt` is exact.
  **The partition reaches the aggregators** (#364 rounds 4–5): the one
  stats vocabulary (`sweepStats.ts`) holds marked rows out of `n` in a
  `dataAbsent` counter, so every published fill rate (`filled/n`)
  states its own denominator — market evidence only; the driver's
  long-standing `unfilled` column changed meaning to
  `total − filled − dataAbsent` (market-evidence unfilled, with
  `dataAbsent` its own column beside it); readers either hand the
  vocabulary the RAW emit row (account-type-report) or project through
  the vocabulary's own `vocabularyRow` helper (sweep-analysis — its
  505 MB-corpus narrowing stays, and the helper carries the partition
  keys by construction; #364 round 6 caught the first "raw row" fix
  spreading a row that was itself a closed rebuild one layer up), the
  projection-to-partition path is executed in tests, and the
  field-by-field rollups carry every `SweepStats` key by a
  self-updating pin. **The readers also STATE the partition** (#364
  rounds 24–27): the three AGGREGATING corpus readers print their
  held-out data-absence volumes beside their headlines, and each line
  names its OWN population and its OWN holdout definition, because
  the populations differ on both axes — `sweep-analysis` covers all
  variants and splits and `account-type-report` the baseline variant
  clearing payoff+regime, both excluding the emit's STAMPED holdout
  flag (the driver's class-blind 1-in-5 draw), while `grid-totalr`
  covers accepted rows in the GRADED folds only (confirm excluded
  without `--confirm-final`; `gradeCorpus` returns the figure) and
  excludes a READ-TIME stratified holdout recomputed per class that
  ignores the stamped flag entirely and holds nothing out of a class
  under three members — two holdout definitions by design (round-8
  batch 1 made the gate's recomputable), so the same corpus yields
  different populations, and each printed line says which; a caller
  of `gradeCorpus` with a symbolFilter or per-market folds narrows
  the figure further and states its own terms. `account-type-report`
  additionally prints `dataAbs` per market and per category rollup,
  survives a market whose rows are ALL data-absence rows (null
  expectancy prints "—" with no fabricated verdict — round 25's
  crash fix, executed), labels held-out markets HELD OUT with their
  row volume stated instead of "NOT IN CORPUS (never swept)" (round
  27 — policy is not a coverage gap), and reads through the
  streaming door (round 26). The FOURTH reader, `geometry-evidence`
  (4b), streams through the same door with a projection DERIVED from
  `EVIDENCE_ROW_KEYS` (rounds 27–28 — round 26's "one reader left"
  count missed it, and the first hand-enumerated projection dropped
  two declared fields); its five questions filter to filled rows
  before any denominator, so no table moves with a marked row — and
  its HEADLINE states market-evidence rows with the held-out volume
  on its own scoped line (round 28: the headline is a corpus-size
  figure R1b inflates, and safe denominators did not exempt it). A
  FIFTH manifest reader, `data-limits` (the table 4c per-market
  sweeps read their limits from), names its holdout list as the
  manifest's STAMPED flag with the gate's read-time stratified set
  called out (round 30); the E8 report also labels fully-gated
  markets ALL ROWS GATED under the CURRENT calibration rather than
  "NOT IN CORPUS" (round 30 — thresholds may postdate the sweep) and
  WITHHOLDS its EXCLUDE verdict below `--min-filled` (round 34: the
  σ≥2 test's only intrinsic floor was rStdDev's two filled outcomes,
  so three low-dispersion losses cleared it into the candidates
  block — the row now prints with the withhold named, making true the
  behaviour rounds 32–33 recorded for that floor when they built the
  starvation gate's withhold on it; round 35 carried the withhold to
  where rulings are read — the candidates block names its floor,
  prints the withheld share with its markets, and the "none" line
  states the terms it judged at — and closed the reassuring half too:
  a thin negative market below the floor reads "no verdict either
  way", never "within noise", because an untrustworthy σ is
  untrustworthy in both directions);
  and the amendment-25 starvation gate reads a zero geometry
  denominator as NO VERDICT, never maximal starvation — by the
  driver's row identity it means the geometry killed nothing, every
  emitted setup carrying the marker or every decision dying
  pre-geometry (round 31) — withholds the flag, and with it the
  exit-1, below a `--min-reached` floor of geometry-stage decisions
  (default 30 — the binomial basis is recorded at the constant: 30 is
  the smallest denominator holding both boundary misreads, false
  STARVED from a true 1/3 and false thin from a true 0.5, at ≈2% or
  below), echoes the floor in effect on every run, and partitions its
  "N of M flagged" summary by cause so M holds only judged markets
  (round 32); when the thin-sample and no-verdict exclusions swallow
  the whole roster it REFUSES — a throw `--report` cannot suppress —
  rather than printing "0 of 0 markets flagged" and exiting 0, the
  zero-row clause's false green reopened by a cleanly-parsing second
  route (round 33), with the refusal's remedies routed by cause: the
  floor dial only for the thin-sample share, because the
  null-survival branch fires before the floor is consulted and no
  `--min-reached` value recovers a zero geometry denominator (round
  34; "which flags take a value" is likewise declared once — num()
  refuses a flag outside VALUE_FLAGS, and a source scan pins both
  walker files). Round 35 went one level further on both: the
  no-verdict remedy routes on the per-row discriminator — the
  all-marked shape names the feed's gradeable-bar coverage, the
  nothing-reached shape names the pre-geometry gates or the window
  placement, because review windows that were never consulted say
  nothing about the feed — and a value flag REFUSES a token it cannot
  parse instead of falling back over a file the walker just consumed
  (`--min-reached shard-a.log shard-b.log` had silently judged
  shard-b alone at the default floor, beyond the reach of the
  per-file refusals). Round 36 pushed both laws to the readers they
  had not reached: sweep-analysis's `--min-n` refuses an unparseable
  token (a bare Number() had made a mistyped dial NaN, and x < NaN is
  false — every `!` thin marker vanished in the reader whose header
  says a thin cell can never read as a finding), grid-totalr's value
  flags consolidated into the same single declaration, its numeric
  dials carrying both refusals (a NaN dial had silently refused every
  variant), the
  E8 report's per-category rollup — amendment 24's own decision
  grain — carries the THIN floor and states a missing clustered s.e.
  (a single-filled-market category printed a bare unqualified E), and
  the gate's PASSING summary names the two no-verdict shapes apart,
  not only the refusal's remedies. Round 37 closed the 4c gate's own
  degenerate seam: `familyPairedP` had returned the MINIMUM attainable
  p — 1/(permutations+1), exactly, since a no-pairs variant
  contributes nothing to the permutation null — for a variant with
  zero shared days, and `accepted` never read the `sharedDays` it
  recorded, so a typo'd `--baseline` (unvalidated, and the one
  VALUE_FLAGS entry with neither refusal) made every class degenerate
  and ACCEPTED every profitable variant. Now a no-pairs variant
  floors at p = 1, acceptance requires a nonzero pairing,
  `--baseline` reads through a guarded string accessor, a baseline
  carrying no cell refuses naming the variants present, and the
  cross-file scan is bidirectional (every declared flag must be read
  guarded). The E8 rollup's clustered s.e. states its own sample — k
  filled markets, since roster membership is not the cluster count —
  the precision line states that one `--min-filled` floor applies at
  both grains, and bank-minute-bars' `--concurrency` gained
  `--limit`'s guard (a NaN worker pool fetched nothing and blamed the
  provider window). Round 38: the pairing floor rose from nonzero to
  the statistic's own resolution — MIN_SHARED_DAYS 5, basis at the
  constant: for same-signed deltas the minimum attainable p is ~2⁻ⁿ,
  so 0.05 is unreachable below five shared days and only estimator
  noise could dip under it at four — with the shared-vs-whole-fold
  mismatch stated at the accepted site (the p certifies the pairing,
  not the composition; compositionR stays the descriptive record);
  the per-market σ's independence assumption is STATED at the
  precision line and the σ site (an understated s.e. in the adverse
  exclusion direction — day-clustering it is recorded as R2
  instrument work in HANDOFF); grid-totalr adopted the same
  sequential walker as the other two path readers (the indexOf Set
  covered only a flag's first occurrence, so a duplicated dial walked
  its second value into the shard paths); and bank-minute-bars'
  `--dir` gained its guard — the phantom-store shape: mkdir created
  the mistyped directory, the full provider window refetched into it,
  and the run exited 0 while the real store stopped growing inside
  the 3-day window. One denominator note beside the unfilled
  redefinition: the driver's `setups` column is `SweepSummary.total` =
  `filled + unfilled + dataAbsent` (every emitted row), while a corpus
  reader's `n` is market evidence only — the two differ by exactly
  `dataAbsent` for the same run, by design. A cohort author reading
  this map should assume any pre-R1b published fill or unfilled figure
  blended data absence into its denominator. An uncontainable
  window (#362 round 7's sub-bar-span weekly clamp, and any window no
  grid slot fits) resolves unfilled UNMARKED with its own sentence — a
  grading-law fact; a containable window whose resolution stream held
  nothing gradeable carries the marker. The claim is **scoped to the
  resolution stream** (#364 round 1 finding 2): live hands the whole
  fetched series, so there the marker reads as provider absence up to
  the fetch depth; the sweep's stream begins after the decision bar
  completes (FR-5), so a marked corpus row claims absence of GRADEABLE
  bars. (#364 round 3, finding 1 corrected the intermediate form: a
  bare was-any-bar-present test would have let the bar straddling
  creation — always served live, since the stream reaches back past
  creation by construction — suppress the marker on a full-window
  provider outage, killing E2's founding signal; that form never
  deployed.) In the sweep, that case emits (the resolver's
  far-future clock resolves every no-bars window), so the corpus row
  carries the marker and the counter question reshaped: `planRejected`
  means only "buildPricePlan refused", and the surviving non-resolved
  path (non-finite plan numbers — a defect, not a data fact) gets its
  own `unresolvable` bucket. **Weighed and parked**: construction-side
  refusal of sub-bar-span clamped windows. It is live-reachable —
  futures-style sessions only PENALIZE the final pre-close Friday bar,
  they do not block it — but refusing there changes live setup
  production and deserves its own measurement and version bump; the
  honest immediate state is the unmarked-unfilled row.
- **E2, corpus door**: `verifyManifest` gained the per-symbol 5-minute
  density assertion, constants MEASURED (FMP probe 2026-08-11..17,
  rows per calendar day): tight 5/15 rows-per-day ratio [2.7, 3.25]
  gated on the CLIP-INVARIANT population filter max(15-minute,
  5-minute/3) ≥60 rows/day (rounds 11–12 — originally the 15-minute
  count alone, which a clip moved together with the ratio's
  denominator; the near-24h markets, exactly the chunk shapes that
  approach provider caps; under max() the densest excluded symbol is
  ZCUSX, MEASURED at 52.4 15-minute rows/calendar day — probed
  2026-08-19 over the same 2026-08-11..17 week, 367 rows across 7 days
  — a 12.7% margin (round 17 replaced round 16's derived 146.7/3 =
  48.9, which assumed the ratio the gate tests; ^GDAXI's 24.5 before
  it was the retired filter's boundary). ZCUSX is agriculture, a
  no-floor class, so today it is judged by nothing: the one named
  exception to the liquid-members clause. Its measured same-week ratio
  is 2.80 — in band — so proportional depth lifts admit AND pass it;
  only a tier divergence reaches the certain-refusal wedge, and the
  survey would flag that divergence itself), plus absolute 5-minute
  floors for the structurally deterministic classes: crypto 260
  (BTCUSD 288.0, THETAUSD 287.9), forex 150 (EURUSD 205.6), metals 140
  (XAUUSD 197.1), energies 140 (measured directly: the class's only
  sweepable member is WTI — BRENT is dormant under amendment 32 — and
  WTI's provider series IS CLUSD, symbols.ts's no-fallback mapping, so
  CLUSD's 197.7 probe is a measurement of the exact bytes this floor
  binds. Round 11's "attribution correction" here got that backwards
  and round 12 corrected it; the roster name CLUSD is itself
  futures-class and ratio-judged, so the one series answers to two laws
  under its two roster names, WTI refusing first if it ever degrades
  below 140), indices 34 (four of SIX members probed — DOW and NSDQ
  carry the floor on their classmates' evidence; ^N225 48.6 …
  ^GDAXI 73.6). futures/agriculture/livestock carry NO absolute floor:
  the probe found ZRUSD ~36 rows/day with intra-session holes, XC ~8.6
  (prints only where trades occurred) and QG serving no 5-minute data
  at all — trade-sparse series are honest provider data whose 3:1
  arithmetic legitimately degenerates, so any shared floor would
  false-condemn them or defend nothing; their liquid members (ESUSD
  197.7, PAUSD 198.7 — slot-dense despite thin volume) are exactly the
  ratio gate's population, with the one named ZCUSX exception recorded
  in the boundary note above. The carried blind band closes to a residue:
  a 15-minute clip ≤~7.7% (ratio 3.0→3.25) on gated symbols can still
  pass — down from ≤14.3% — and any cap low enough to touch 5-minute
  chunks drags the ratio out the bottom. Absent 5-minute series and
  sub-week spans stay silent, deliberately (degradation is per-row via
  the emit tier; a 2-day span cannot separate holiday from hole).
  Amended #364 round 18: the driver pre-flight also refuses a store
  whose HEAD sits later than the build's requested start — an existing
  rolling store never re-fetches its head (fetchFull runs only on an
  empty store), so deepening `TREASURY_FETCH_START_MS` without
  deleting the store would otherwise stamp `requestedStartMs` as a
  term the corpus was never fetched under; the refusal names the real
  remedy and keeps the manifested term true by construction, and the
  door states that the term is driver-declared and self-certifying,
  trusted on exactly that discipline. The starvation audit excludes
  `dataAbsent` from both sides of survival by the round-14 rule (a
  data fact, not a parameter verdict — pre-R1b these decisions landed
  in planRejected and over-flagged; counting them as survivors would
  under-flag).
  Amended #364 round 17: the leading-edge check judges each corpus by
  its own RECORDED fetch request — the manifest carries
  `requestedStartMs`, so deepening `TREASURY_FETCH_START_MS` later
  never retroactively condemns an archived corpus that was as deep as
  it was asked to be ("we now fetch deeper" is a term of the current
  build, not poison in the recorded data; the build-constant fallback
  is exact for manifests predating the field, all requested at
  2013-01-01). And the boundary provenance above is measured, not
  derived: the ZCUSX 15-minute probe replaced the five/3 assumption.
  Amended #364 round 16: the curve-evidence checks are gated on
  EVIDENCE PRESENCE, not read mode — a manifest that CARRIES
  treasuryCurve facts has their integrity (count, corpus-touching
  holes, stale tail, shallow leading edge) asserted on every read
  path, the superseded-clock override included, because present
  evidence of a holed or stale-tailed curve is data poison with the
  density door's standing (it scored non-zero stale macro adjustments
  no per-row field can reveal), and the pre-round-16 read-mode gate
  would have gone blind to it the day a BAR_CLOCK bump made every
  post-R1b corpus a historical read. Only the conditions LITERALS and
  the absence of evidence blocks a pre-R1b manifest never carried
  remain override-exempt terms.
  Amended #364 round 14: the warm-only Treasury tolerance is scoped by
  CAUSE — store-integrity refusals (`cacheStoreUnreadable`,
  `cacheClockMismatch`) re-throw so the top-up script's red stays
  honest, and only provider transport warns-and-continues. The hole
  refusal is corpus-relative like its neighbours: `treasuryCurveFacts`
  manifests week-plus gap POSITIONS (largestGapMs alone is
  positionless; positions ride outside conditionsOf identity), the
  door refuses only gaps touching the corpus span (absolute fallback
  for manifests predating the fact), the driver pre-flight scopes to
  the requested `--days` window plus a week of visibility lead —
  round 15: via the SAME shared overlap predicate as the door
  (`treasuryGapTouching`), over whole-store gap positions, because
  filtering rows to the window first deleted the left anchor of
  exactly the hole that straddles the window's edge — and
  both remedies distinguish the hole a refetch cannot clear — the
  fetch counts parser-refused provider rows, which are deterministic
  on refetch, and names the count beside any hole refusal. The
  starvation audit excludes `unresolv` from BOTH sides of survival
  (defect bucket, not a parameter verdict — counting them as survivors
  under-flagged the amendment-25 gate).
  Amended #364 round 13, the curve side: the driver pre-flight now
  also refuses an interior hole >7 days in the STORED curve
  (`treasuryCurveFacts` on load — the fetch's per-chunk guard fires
  only on the run that fetches and only on a zero-row chunk, and the
  rolling store never revisits a pinned interior, so read-time was the
  only prior reader of stored continuity); the leading-edge check
  stays door-only because it needs the corpus start. The door's
  leading-edge tolerance now derives from the shared
  `TREASURY_FETCH_START_MS` (driver and door cannot drift), and that
  constant carries a 2026-08-19 endpoint probe: FMP /treasury-rates
  serves continuously across the 2013-01 boundary and reaches at least
  2005-01-03, so the requested start is a driver choice ~8 years
  inside provider depth — measured, not assumed. And `--warm-only`
  tolerates a Treasury load failure (warn-and-continue; the bar survey
  must not die on the corpus path's second endpoint), while sweep runs
  keep the throw.
  Amended #364 rounds 8–12: the floor table's provenance is stated
  where the constants live (round 12): each class floor generalises
  from one or two probed members on a homogeneity assumption the
  nightly survey tests at depth, and the forex floor binds only
  shape-verified currency pairs over the roster's eight currencies —
  getAssetType's forex FALLBACK would otherwise hand the 150 floor to
  any symbol onboarded into symbolMap before its class list, aborting
  the pre-flight with exactly the wrong diagnosis. Rounds 8–11: the
  assertion runs in TWO places — the
  read-time door, and the driver pre-flight on SWEEP runs only, beside
  the clock witnesses, refusing at the first violator before THAT
  symbol simulates — the loop interleaves per symbol, so a late
  violator costs the roster prefix already walked (round 31 corrected
  the spends-nothing claim; the refusal names the survey mode, which
  reads the whole roster for free). `--warm-only`
  (the nightly top-up and the R0 rebuild) never asserts — it produces
  no corpus, and a mid-roster refusal would stop topping up every later
  symbol — but prints every symbol's line unconditionally, an empty
  5-minute store included (`5min 0 rows` — the survey is the only
  layer that can surface a total feed loss, since the door is
  deliberately silent on absence), making the nightly log the standing
  full-roster density survey; symbols too thin to enter the manifest
  are exempt the same way. Round 32 upgraded the survey from raw
  print to the door's own verdict in report mode: each
  manifest-eligible symbol also gets `density WOULD REFUSE at this
  depth: …` logged — never thrown — when the assertion would fail,
  retiring round 31's claim that the un-asserting survey already
  guaranteed a violator-free launch (it printed own-span rows/day
  while the door judges the intersection ratio). And the RATIO is a same-window statistic —
  the probe measured both series over one shared week, while at depth
  the 5-minute store is shallower than the 15-minute for most symbols,
  and era-density differences in the non-shared depth would masquerade
  as clipping — so the driver manifests `crossSeriesDensity`, the two
  counts inside the stores' intersection window, and the ratio judges
  those on every symbol at any depth. That is what keeps the no-floor
  classes' liquid members judged and the clipped-primary blind band
  closed on a `--days max` corpus; the own-span computation survives
  only as the fallback for manifests predating the fact — which are
  exactly the HISTORICAL-READ population (round 11): on the current
  path a manifest whose symbol carries both series but no
  crossSeriesDensity refuses as a claim without its evidence, the same
  law as the curve facts — gated on near-identical windows (shared
  span ≥90% of both) so it never compares across eras. The ratio's
  population filter is CLIP-INVARIANT (round 11): max(15-minute,
  5-minute/3) ≥60 rows/day, so a clip on either single series cannot
  move a symbol out of the gate that detects clipping — filtering on
  the 15-minute count alone had metals leaving above an 8.7% clip and
  floorless ES-class futures above 9.0%, judged by nothing — and two
  mature stores sharing NO time window refuse outright on every read
  path (shape poison, the clock witnesses' standing). The absolute
  floors still bind each series over its own span, and the first deep
  survey is what tells whether the one-week floors hold at depth
  (carried: density-ceiling tightening).
- **E6, per term as designed**: `macroAdjustment` is RECONSTRUCTED —
  `macroRates.ts` (new, Deno-free; macroContext.ts keeps fetch/cache/
  recorder and composes the same pieces, pinned) carries the pure
  arithmetic plus `treasuryContextFromRows` and the visibility rule
  `treasuryVisibleAtMs`: a row is decision-time information from the
  New York midnight AFTER its label date — conservative by a few
  evening hours, never early, DST-pinned in tests. The driver loads
  the curve as one rolling store (`treasury-rates`, CALENDAR_CLOCK,
  year-sized chunks, I3's throw-on-failure), and the sweep's moving
  pointer feeds the two most recent visible rows to
  `calculateMacroRateAdjustment` per decision instant — executed
  end-to-end in `tests/sweep.test.ts` across a mid-corpus visibility
  flip. `providerWarningCount` stays 0 zero-by-construction, stated at
  the score site. `weightAdjustment` stays 0 as the raw-engine
  decision. All three are STATED in the manifest's hashed `conditions`
  block, and `verifyManifest` refuses a manifest without it or with
  other literals — no escape hatch of its own. Provenance stated
  honestly (#364 round 7): R1b bumps neither clock, so a corpus swept
  in the R0→R1b window would be current-clock and legitimately
  condition-less — none exists because the R0 rebuild has not produced
  its first corpus (the one re-sweep is R3's), a scheduling fact; if
  one ever surfaces the refusal stands and the remedy is the R3
  re-sweep. Pre-R1b archived corpora are superseded-clock and admitted
  solely through that loud explicit override (whose deliberate
  historical reads skip the conditions demand — and for exactly that
  path, the 4c shard-identity comparison in `gradeCorpus` carries
  `conditions` and `treasuryCurve` as measurement axes, so a
  hardwired-zero-macro shard can never pool with a reconstructed one). **The claim carries evidence** (#364 round 2,
  finding 1): the manifest records the curve's own facts (count, ends,
  largest inter-row gap — hashed), the driver refuses an empty or
  >7-day-stale curve before simulating and throws on any week-or-wider
  chunk returning zero parseable rows (a 200-with-empty-body would
  otherwise hole the store permanently — the visibility pointer stalls
  inside a hole and scores months-old rows as fresh, worse than the
  zero the claim abolished; the diagnosis splits by position since
  round 20: a zero-row chunk STARTING at the requested fetch start is
  coverage rather than a hole — the constant asks deeper than the
  provider serves, the deepening runbook has already deleted the store
  when it fires, and the refusal names the re-probe-and-move remedy —
  while interior chunks keep the hole wording; both branches carry the
  chunk's parser-refusal count, the shared predicate lives in
  `sweepManifest.ts` with both branches executed, and rounds 21–23
  gave both branches must-stay-red tokens — `treasuryCoverageRefused`
  / `treasuryChunkHole` — on which the driver's `--warm-only` path
  exits red, deferred past the bar survey so the roster still warms:
  both causes are deterministic, and warned over they would leave the
  nightly log green over a store that never warms — the false green
  is the cost, the refetch a request or two by the first-chunk
  throw; round 23 widened the deferral to the treasury store's own
  cache refusals, which are per-file and calendar-clock and so
  condemn no bar store, and ordered the nightly script's
  must-stay-red grep above its 429 stand-down, since a blackout-era
  roster 429 in the same output would otherwise downgrade a deferred
  token to a stand-down), and the door refuses missing facts,
  week-plus interior holes where they TOUCH the corpus span (rounds
  14–15: gap positions are manifested, and one shared overlap
  predicate serves the door and the driver pre-flight), a curve ending
  more than 7 days before the corpus does, and — rounds 3 and 13 — a
  LEADING edge short of the corpus: a curve whose first row is after
  both `TREASURY_FETCH_START_MS + 7d` and the corpus start is a
  shallow rebuild and refuses (an earlier revision of this bullet
  called the leading edge "deliberately unasserted"; that was the
  pre-round-3 design and stood here stale through round 15).
  Decisions before a floor-deep curve's first row still score stance
  "unavailable" — the honest live-outage semantics survives for the
  admissible shapes. The density door, by contrast, binds deliberate
  historical reads too (round 1 finding 5, executed round 2): the
  override accepts superseded measurement terms, never poisoned data.
- **Emit symmetry**: every corpus row carries `resolutionIntervalMs`
  (behavioral tier pin now executed: 15-minute physics stamps 900000 on
  every row, an admitted 5-minute stream stamps 300000), plus
  `macroAdjustment` and, on no-bars rows, the marker.
- Pins: behavioral in `tests/sweep.test.ts` (tier symmetry, macro
  end-to-end, no-bars emit), `tests/replayHarness.test.ts` (presence
  vs. containment both ways), `tests/macroRates.test.ts` (construction,
  visibility incl. DST, provider field names, one-construction source
  pin), `tests/sweepStats.test.ts` (conditions + density door, all
  refusal and admission shapes), `tests/sweepManifest.test.ts`
  (conditions hashed; driver wiring). No `ANALYZER_VERSION` bump: no
  live scored number moves — the marker refinement is metadata, and the
  corpus-identity boundary for the sweep changes is the conditions
  block itself. **The one version-boundary nuance, written down (#364
  round 1, finding 3; population updated round 3)**:
  `trade_outcomes.analyzer_version` is stamped at DECISION time, so
  rows created under `2026.08.18.one-physics` and resolved before this
  deploy carry containment-semantics markers while rows resolved after
  carry the could-a-completed-bar-exist semantics, indistinguishably.
  Accepted, for three stacked reasons: the final rule is a strict
  NARROWING of the deployed one (marked now = containment-empty AND
  containable window ⊆ containment-empty = marked before), so a
  pre-deploy row can only be over-marked — a filter that drops marked
  rows drops at most a few honest ones, never keeps a false one; the
  divergent population is exactly the uncontainable-window rows (the
  sub-bar-span weekly clamp), whose first live occurrence cannot
  predate Friday 2026-08-21 while one-physics deployed Tuesday the
  18th — empty until then; and D1's reader reads the map. A future
  marker change that is NOT a strict narrowing takes the version bump.
  Same boundary, second rider (#364 round 3, smaller): the live
  Treasury parser tightened with the macroRates.ts extraction — a date
  not beginning `YYYY-MM-DD` is now refused (raising the I11 outage
  event, never passing silently) and `latestDate`/`previousDate`
  normalize to bare ISO; identical on FMP's actual shape, recorded here
  because it rides the same unbumped version. Third rider on the same
  clause (#364 round 8, finding 3): the parser no longer coerces an
  absent-shaped tenor — `Number(null)` and `Number("")` are both 0, so
  a provider row with a null field minted a 0.0% yield that passed
  every continuity guard and swung the adjustment through its ±4/±8
  thresholds in both directions — and it bounds parsed tenors to the
  open interval (0, 25)% (2013-floor yields sit in (0, ~6]; the 1981
  all-time peak was 15.8%). Live inherits both through the shared
  module: a refused row raises the I11 outage path rather than scoring,
  identical on every well-formed FMP row, so it rides unbumped too.

## Sequencing — three PRs, engine first

1. **R1a — one physics** (engine + writers), landing in two slices:
   **slice 1 (shipped first): D2** uniform realized R from legs on every
   filled resolution, the `extractRealizedR` net repoint, and the
   `ANALYZER_VERSION` bump to `2026.08.18.realized-r` that moves the
   cohort boundary with the changed numbers. **Slice 2:** E1 5-minute
   resolution with recorded degradation; E3 decision-bar `latest`; E7
   the bridge carries the row's stored runner-protection mode and review
   window; the E2 live-side distinct no-bars marker — these all touch
   `fillOptionsFromRiskModel`/writer options together, which D2 does
   not, so slicing there keeps each PR one concern.
2. **R1b — the sweep tells the truth about its inputs** — **SHIPPED
   2026-08-18 (closure record above)**: E2 sweep half + `assertManifest`
   per-symbol density assertion; E6 macro reconstruction + the two
   stated-zero terms in the manifest conditions. (Manifest `conditions`
   is new and hashed → old corpora refuse at the door exactly as
   designed; the re-sweep is Phase 3's one re-simulate, after Phase 2.)
3. **R1c — the E4 instrument**: the collapse reader + its report,
   doored and population-pinned like every other reader.

Frontend is untouched in all three except R1a's two client touches
(#362): `storedSetup.ts` prefers the row's stamped review window
(finding 5; the stamped-confluence and mirror fallbacks cover every
pre-E7 row, so no ordering hazard with the Edge deploy), and
`reviewCopy.ts` translates the crossed-quote refusal sentence distinctly
(round 5 — load-bearing for the operator half of that fix); no
migration is required (feedback is jsonb). Live-path changes (R1a)
deploy through the ordinary gate and
change grading physics from that deploy forward — the cohort boundary
is `ANALYZER_VERSION`, which R1a must bump, exactly as the learning
read/write version predicates assume.

## Carried facts this map depends on

- Measured caps (2026-08-18): 15-min single response complete at
  **≥4,266 rows** — probed the same day as this map with the live path's
  own shape, a 45-day BTCUSD window (2026-07-04..2026-08-18), which
  returned all 45 dates complete (this supersedes the morning's ≥2,880
  floor; the runbook's chunk sizing stays as measured-conservative).
  5-min ≥2,304; `to` inclusive. So the live 45-day 15-minute request is
  NOT provider-clipped today; the only truncation in the live path is
  our own `maxBarsForTimeframe` 3,000 (newest-kept), i.e. ~31 days for a
  24/7 symbol — ample for hourly-sync grading lives, and R1a's 5-minute
  lookback arithmetic starts from the measured 2,304-row (8-day) floor.
- The verify-cache-clock ceiling's blind band (~2,386–2,784) is carried
  by R1b's density assertion — that assertion must bind absolute
  5-minute rows/day, not only the ratio. **Landed (R1b closure record):
  absolute class floors + the [2.7, 3.25] gated ratio; residue is a
  ≤~7.7% primary clip on gated symbols.**
