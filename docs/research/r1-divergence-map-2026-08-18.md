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

## E1 — resolution granularity: live 15-minute, corpus 5-minute

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

## E2 — "no bars in the review window" is not a plan rejection

**Live**: `evaluateSetupOutcome` returns `outcome: "unfilled"` when
`createdBars.length === 0 && now > expiresAt` (replay.ts) — data absence
grades as not-filled.

**Sweep**: `simulateSymbol` counts every `evaluation.state !==
"resolved"` as `rejections.planRejected` (sweep.ts) — data absence
wears a plan verdict.

**Fix**: a distinct resolution state / counter for "no bars in the
review window" on both sides (live: a distinct feedback marker rather
than bare `unfilled`; sweep: its own rejection counter, never
`planRejected`), and — the corpus-door half — `assertManifest` gains a
**per-symbol 5-minute density assertion** over the sweep span. This is
the door that carries the verify-cache-clock ceiling's stated blind
band (~2,386–2,784 cap: only the 15-minute series clips, ≤~14%, ratio
in band), so the assertion must bind on absolute 5-minute rows/day, not
only on the 5/15 ratio.

## E3 — `market.latest`: 1-minute live, 15-minute decision bar in the sweep

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

## E6 — three score inputs hardwired to zero in the sweep

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

## E7 (discovered 2026-08-18) — the options bridge drops the runner-protection mode

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

## D2 — realized R exists only on the expiry branch

**Engine** (replay.ts): `realizedR`/`netRealizedR` are computed and
written into `feedback` ONLY in the `now > expiresAt` branch (:442-468).
The take-profit, stop-loss, TP1-lock and same-bar-arming resolutions
return legs but no realized R; both live writers store the feedback
as-is (and `realized_pnl` stays null everywhere — R is the unit, PnL is
sizing). Any R sum over `trade_outcomes` is therefore a sum over
expiries alone.

**Sweep**: computes `realizedRFromLegs` for every resolved row
(sweep.ts), so the corpus has uniform R and the cohort does not.

**Fix**: one leg-accounting function in replay.ts — the resolver
computes net realized R from its own legs on EVERY resolved branch and
writes `realizedR`/`netRealizedR` into feedback uniformly; the sweep
imports the same function instead of carrying its own
(`realizedRFromLegs` retires or delegates). D1 (Phase 2) then has its
input on every row, not one branch.

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
2. **R1b — the sweep tells the truth about its inputs**: E2 sweep
   counter + `assertManifest` per-symbol density assertion; E6 macro
   reconstruction + the two stated-zero terms in the manifest
   conditions. (Manifest `conditions` hash changes → old corpora refuse
   at the door exactly as designed; the re-sweep is Phase 3's one
   re-simulate, after Phase 2.)
3. **R1c — the E4 instrument**: the collapse reader + its report,
   doored and population-pinned like every other reader.

Frontend is untouched in all three; no migration is required (feedback
is jsonb). Live-path changes (R1a) deploy through the ordinary gate and
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
  5-minute rows/day, not only the ratio.
