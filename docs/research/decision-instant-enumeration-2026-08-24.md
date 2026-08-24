# The decision-instant enumeration — sweep↔live, 2026-08-24

> **Status.** The `latest.time` precondition set by `docs/HANDOFF.md`'s
> diminished-returns register is **SATISFIED**: fifteen consumers enumerated,
> each with live's counterpart at `file:line`. The SURFACE is **NOT closed** —
> the precondition named too narrow a population, and eleven further divergent
> consumers of the same instant never touch `latest.time` at all. See §5.


**Scope.** Every consumer of `latest.time` in `simulateSymbol` (`supabase/functions/trade-analyzer/sweep.ts`, declared line 323, file 818 lines), each with live's counterpart named at `file:line`. Derived population, re-derived at the top of this pass: `grep -n "latest\.time" supabase/functions/trade-analyzer/sweep.ts` returns **15** matches — 423, 429, 442, 449, 468, 483, 484, 502, 563, 631, 637, 646, 662, 689, 763. **All fifteen appear below. None is UNENUMERATED.** Read-only pass: no tests, no sweep, no FMP fetch, no `.calibration-cache` read.

**Notation, fixed once and used throughout.**

| symbol | meaning | proof |
|---|---|---|
| `B` | `latest.time` — the 15-minute decision bar's **OPEN** | sweep.ts:420-421 `history = primaryBars.slice(0, index+1); latest = history.at(-1)` |
| `S` | primary span = 15 min | marketLoader.ts:446-450 `pickPrimaryTimeframe` returns `"15min"` whenever ≥80 completed bars exist |
| `δ` | live's scan phase inside the anchor window, `δ ∈ [0, S)` | not observable offline |
| `L` | live's wall clock at the **same** decision `= B + S + δ ∈ [B+15min, B+30min)` | bars.ts:52 `completedIntradaySeries` keeps bar `B` only from `B+S`; marketLoader.ts:216 anchors `latest` on that trimmed tail. Bar `B` is live's anchor exactly while wall clock ∈ [B+S, B+2S) |

`L` is **never earlier than `B+15min`**. Every DIVERGE below is a consequence of the sweep evaluating at `B` where live evaluates at `L`.

**Standing rule that governs every recoverability call.** `rejections` in `simulateSymbol` (sweep.ts:374-390) is a **counter struct, not a ledger**. A decision that is rejected emits no row. Therefore: divergences where the sweep is **more permissive than live** leave rows that can be found and pruned from the emit — RECOVERABLE. Divergences where the sweep is **more restrictive than live** leave nothing but an incremented integer — LOST. Recoverability tracks direction, not effort.

---

## 1. THE TABLE

### 1a. The fifteen `latest.time` consumers, in line order

| # | line | expression | what it gates / computes / records | live's counterpart (file:line) and the instant live uses | verdict | recoverable |
|---|---|---|---|---|---|---|
| 1 | 423 | `latest.time >= input.decisionEndMs → break` | fold embargo: stop deciding 5 days before the fold closes | **no live counterpart found.** Live has no folds and no decision-end; it is unbounded above. `decisionEndMs` is produced only offline (sweepFolds.ts:57 `endMs - embargoMs`; `FOLD_EMBARGO_MS = 5*86_400_000`, replay-sweep.ts:140) | **N-A-OFFLINE-ONLY** | N/A |
| 2 | 429 | `dailySeries[dailyVisible].completeAtMs <= latest.time` | how many completed daily bars the decision reads → ATR, dailyAtr, EMAs, `classifyRegime`, volatilityPercentile, trendStrength, expected-window move | **index.ts:717** `completedDailyBars(normalizedSymbol, bars, Date.now())` → dailyCompletion.ts:126 `entry.completeAtMs <= asOfMs`. **Verified the only live call site** (`grep -rn completedDailyBars supabase scripts src` → index.ts:63 import, index.ts:717 call, dailyCompletion.ts:122 definition). Instant: **`L`** | **DIVERGE — sweep sees LESS** | **LOST** |
| 3 | 442 | `fiveMinuteBars[fiveMinVisible].time <= latest.time` | 5-minute committee frame (sweep.ts:304-306, 457-460); read by `voteMultiTimeframeAlignment` (strategies.ts:160-197) and counted into `availableTimeframeCount` (sweep.ts:578) | **marketLoader.ts:171-181** `completedIntradaySeries(fetchFmpBars(fmpSymbol,"5min",…), "5min")` with default `nowMs = Date.now()` (bars.ts:44-47, keeps `time + 5min <= now`). Instant: **`L`** | **DIVERGE — sweep sees LESS** | **LOST** |
| 4 | 449 | `treasuryVisibleAtMs(rates[treasuryVisible].dateMs) <= latest.time` | Treasury visibility → the two newest rows → `treasuryContextFromRows` → `calculateMacroRateAdjustment` → `macroAdjustment` (sweep.ts:565-576, 587) | **macroContext.ts:112-120** sorts the FMP response DESCENDING and takes `rows[0]`/`rows[1]` with **no visibility filter of any kind**; bounded only by the 7-day staleness refusal at macroContext.ts:135. Call site index.ts:782. Instant: **whatever FMP has published as of `Date.now()`**, softened by a 15-minute response cache (macroContext.ts:33, 61-67) | **DIVERGE — sweep sees LESS** (one narrow reverse case, §2.10) | **RECOVERABLE** |
| 5 | 468 | `getSessionContext(input.symbol, new Date(latest.time))` | hard session closures (`sessionContext.block` → `rejections.sessionBlocked`, sweep.ts:476), `sessionPenalty` into the score (sweep.ts:591 → scoring.ts:58), the `lowEdge` measurement escape (sweep.ts:470), emitted `sessionLabel`/`sessionPenalty` (sweep.ts:756-757) | **index.ts:650** `getSessionContext(normalizedSymbol)` — **no second argument**, so sessions.ts:17 `now = new Date()` supplies wall clock. **Verified the only live call site** (`grep -rn getSessionContext` → sessions.ts:15 def, sweep.ts:36/466, index.ts:37/650, tests). Structurally decisive: index.ts:650 fires **before** `fetchFirstAvailableMarketContext` at index.ts:709 — live has no bar in scope, so no bar instant was available to it. Instant: **`L`** | **DIVERGE — sweep sees a STALER session; net permissive** | RECOVERABLE (accepted rows) / **LOST** (block flips) |
| 6 | 483 | `windowStart = latest.time - NEWS_ACTIVE_BEFORE_MS` (10 min, newsRules.ts:11) | lower edge of the active-news window; also advances the monotone discard pointer (sweep.ts:485-490) | **index.ts:2117** `activeStart = new Date(now - NEWS_ACTIVE_BEFORE_MS)`, `now = Date.now()` at index.ts:2116, filter applied at index.ts:2129-2132. Fires before the market fetch too. Instant: **`L`** | **DIVERGE — sweep sees MORE events** | **LOST** |
| 7 | 484 | `upcomingEnd = latest.time + NEWS_UPCOMING_HORIZON_MS` (6 h, newsRules.ts:13) | far cutoff of the whole news scan (`break` at sweep.ts:495); everything inside that is not active becomes `upcomingNews` | **index.ts:2120** `upcomingEnd = new Date(now + NEWS_UPCOMING_HORIZON_MS)`; it is also the DB query bound at index.ts:2123-2125. Instant: **`L + 6h`** | **DIVERGE — sweep sees FEWER events** | **LOST** |
| 8 | 502 | `event.time <= latest.time + NEWS_ACTIVE_AFTER_MS` (20 min, newsRules.ts:12) | active/upcoming split — the line that decides whether a high-impact event **BLOCKS** (sweep.ts:508, `isBlockingNewsEvent`) or merely penalises | **index.ts:2118** `activeEnd = new Date(now + NEWS_ACTIVE_AFTER_MS)`, consumed at index.ts:2131 and 2139, blocking at index.ts:2133. Instant: **`L + 20min`** | **DIVERGE — sweep sees LESS news risk; under-blocks** | **RECOVERABLE** |
| 9 | 563 | `buildCotContext(input.cotReports ?? [], latest.time)` | CFTC publication-lag gate (cotContext.ts:143, `report.date + 4 days <= asOf`) → `cotPercentile`/`cotStance` | **no live counterpart found.** `grep -inc "cot" supabase/functions/trade-analyzer/index.ts` → **0**. `buildCotContext`/`cotScoreAdjustment` have exactly one production call site each (sweep.ts:561, 581) | **N-A-OFFLINE-ONLY** | RECOVERABLE |
| 10 | 631 | `resolutionSeriesFor({ createdAtMs: latest.time, … })` | resolution tier: 5-minute only if that series reaches back to the decision instant, else 15-minute | **index.ts:1772-1776** `resolutionSeriesFor({ createdAtMs: new Date(setup.created_at).getTime(), … })`. Instant: the **DB-stamped wall clock at insert** (index.ts:1631-1655 inserts no `created_at`; Postgres defaults it) ≥ `B+S` | **DIVERGE — sweep sees LESS** (fine tier admitted less often) | RECOVERABLE |
| 11 | 637 | `resolveFromMs = latest.time + 15 * 60 * 1000` | FR-5 stream start — first 5-minute bar the resolver may see | **no live option.** index.ts:1785-1792 passes `resolution.bars` whole; admission falls to replay.ts:279 `bar.time >= createdAt` against the wall-clock `created_at`. Instant: **`L`**, rounded up to the 5-minute grid | **DIVERGE — sweep sees MORE front-edge path** | RECOVERABLE |
| 12 | 646 | `horizonMs = latest.time + (defaultReviewHours + 24) h` | bounds the per-decision 5-minute slice copy | **no live counterpart found.** Live slices nothing; it hands the whole fetched series | **N-A-OFFLINE-ONLY** | N/A |
| 13 | 662 | `created_at: new Date(latest.time).toISOString()` | the resolver's `createdAt`: expiry base (replay.ts:268-272), `createdBars` lower bound (replay.ts:279), weekly-close clamp (replay.ts:683) | `trade_setups.created_at`, Postgres default at insert; read back index.ts:1714-1719, parsed replay.ts:266. Live's stored expiry: index.ts:1198 `getSetupExpiryTime(symbol, Date.now())`. Instant: **`L`** | **DIVERGE — sweep sees LESS price path at the back edge** | **LOST** (see §3, plan-price fields) |
| 14 | 689 | `streamStartsAtMs: latest.time + 15 * 60 * 1000` | scopes the `noBarsInReviewWindow` marker's could-a-completed-bar-exist test (replay.ts:317-324) | Live **deliberately omits the option** (replay.ts:310-316), so `earliestAdmissible` falls back to `createdAt`, which is exact for live because its stream reaches back past creation | **AGREE** (documented mirror, map:558-562) | N/A |
| 15 | 763 | `time: latest.time` | the emitted decision stamp — the join key for every corpus reader | `trade_setups.created_at`, stamped at insert wall clock; live-side bucketing e.g. `src/components/workspace/attribution.ts:320` `new Date(setup.created_at).getUTCHours()`. Instant: **`L`** | **DIVERGE — the record is stamped `S+δ` early** | **LOST** |

### 1b. Consumers of the same decision instant that do **not** read `latest.time`

These were added by the completeness slice. They matter because the register's precondition named the wrong population: "consumers of `latest.time`" is a strict subset of "places the sweep and live disagree about the decision instant."

| line | expression | what it gates | live's counterpart (file:line) and instant | verdict | recoverable |
|---|---|---|---|---|---|
| sweep.ts:296-297 | `resampleBars(history.slice(-960), 60)` / `(-3840), 240` | the 1hour and 4hour committee frames; the trailing **partial** bucket is preserved by design (sweep.ts:248-249) | bars.ts:44-58 `completedIntradaySeries` trims every unclosed trailing bar, per timeframe at marketLoader.ts:171. Live's 1h/4h tail is the last **completed** bucket, up to 1h / 4h stale | **DIVERGE — sweep sees MORE** | RECOVERABLE (partial) |
| sweep.ts:304 + 457-460 | 5-minute frame seated at `>= 40` bars over a cached store | frame seating and `availableTimeframeCount` | marketLoader.ts:180 same 40-bar floor, but over a rolling 10-day fetch (marketLoader.ts:469-471) | **DIVERGE — sweep sees LESS** | **LOST** |
| sweep.ts:308-309 + 578 | `availableTimeframes = filter(len > 0)` | `timeframePenalty` (scoring.ts:46-48, fires at count < 3) and executionQuality's `< 3` branch | marketLoader.ts:180 admits an intraday frame only at **40+ completed** bars | **DIVERGE — sweep sees MORE frames**; those two penalties can never fire offline | **LOST** |
| sweep.ts:318 | `quote: null` on every sweep context | suppresses two live-only consumers | pricePlan.ts:239-258 (quote-crossed admission refusal) and pricePlan.ts:357 → executionQuality.ts:203-207 (`quotedSpread === null ? modeled : quoted`) | **N-A-OFFLINE-ONLY** (live consumer, no offline arm) | **LOST, permanently** |
| sweep.ts:372-373 → 671 | `resolutionTime = primaryBars.at(-1).time + 14 days` | the resolver's `now`: forces every setup past expiry, so nothing stays pending | index.ts:1788 `evaluateSetupOutcome(setup, resolution.bars, Date.now(), …)`; parameter replay.ts:261 `now = Date.now()`, gating replay.ts:291 | **DIVERGE — sweep sees LESS** (truncated window still gets a verdict) | RECOVERABLE (partial) |
| sweep.ts:433 | `if (dailyVisible < 40) continue` | daily-history sufficiency floor | marketLoader.ts:88 / index.ts:757 — live refuses the **symbol** below **80** completed daily bars | **DIVERGE — sweep decides on LESS history**; dormant under the current driver | RECOVERABLE |
| sweep.ts:52-56 + replay-sweep.ts:1021-1023 | `SweepNewsEvent = {currency, impact, time}` | the corpus's entire news population — one family, currency-keyed | index.ts:2152-2165 `isNewsRelevant` routes **three** families: scheduled, `fmp_earnings`, and symbol-tagged headlines (backward window `[now-6h, now]`, index.ts:2138-2140); a null-currency row is relevant to **every** symbol (index.ts:2161-2163) | **DIVERGE — sweep sees FEWER events** | **LOST** |
| sweep.ts:565-576 | `treasuryVisible >= 2 ? … : unavailableContext(…)` | Treasury context guarded by a **count** and nothing else | macroContext.ts:135 `treasuryCurveIsStale(latest.dateMs, Date.now())` → `unavailableContext` past 7 days. sweep.ts:21-27 imports `treasuryContextFromRows`/`treasuryVisibleAtMs`/`unavailableContext` and deliberately **not** `treasuryCurveIsStale` | **DIVERGE — sweep sees MORE** (scores where live refuses) | RECOVERABLE |
| replay.ts:252 (from sweep.ts:630-634) | `fiveMinute[0].time <= createdAtMs` | tier admission tests the **corpus's first bar**, not local coverage around this decision | index.ts:1772-1776 over a freshly fetched ~8-day window, dense by construction (replay.ts:240-245) | **DIVERGE — sweep sees LESS** at fine physics | RECOVERABLE |
| marketLoader.ts:446-458 | `pickPrimaryTimeframe` promotes 1hour / 4hour / 1day | live can move `latest`, the ATR unit and the entry-offset base to a higher frame | sweep.ts:314-315 pins `latestTimeframe`/`primaryTimeframe` to `"15min"` unconditionally | **N-A — live-only path** | N/A |
| sweep.ts:441-442 vs 420 | pointer vs `history` slice | **cross-frame coherence** of one context | bars.ts:52 trims every intraday frame against **one** `nowMs`, so live's frames all stand at one instant | **DIVERGE — the offline context is internally incoherent** | RECOVERABLE (partial) |

### 1c. One claim raised during the pass and KILLED — recorded so it is not re-minted

**`sweep.ts:561`/`:581` — "the corpus scores a COT term live has no wiring for."** Every citation is correct: `grep -inc "cot" index.ts` → 0; live's two `scoreSetupConfidence` calls (index.ts:1175-1187, 1395-1409) omit `cotAdjustment`. **But the difference normalises to nothing.** No calibration table assigns `cotScoreAdjustment` (calibration.ts:51, optional, comment "Zero until calibration validates it"; none of the nine class tables nor `SYMBOL_CALIBRATION_OVERRIDES` sets it), so sweep.ts:584's `?? 0` makes the call return 0 — and cotContext.ts:211-213 short-circuits to 0 anyway. Live normalises identically at scoring.ts:57 `(input.cotAdjustment ?? 0)`. Both contribute exactly 0. **Not a divergence.** `docs/trade-model.md:562-571` records COT as implemented, tested, and rejected as a gate (fading crowded longs +0.147, fading crowded shorts −0.021), shipping at zero by design. The one real residue — `scripts/sweepGrid.ts:13` exposes `cotScoreAdjustment` as a live grid axis production cannot execute — is already a named standing boundary at `docs/research/converge-round-8-2026-08-10.md:157` ("COT timing (LA-17) inert until a `cotScoreAdjustment` ships").

---

## 2. THE DIVERGENCES, RANKED BY MEASURED IMPACT

Ranked by frequency × per-decision magnitude. Where the material does not support a number, it says so.

### 2.1 — sweep.ts:296-297 + 442: the committee's frame set disagrees with live's on essentially every decision. **MEASURED: 100% of decisions.**

The two intraday-frame divergences compound in **opposite directions**, and together they make the offline committee's frame agreement structurally different from live's.

- **1hour / 4hour (296-297).** The sweep preserves the trailing partial bucket. That bucket's close **is the decision bar's close**, so the 1h and 4h frames agree with the primary frame mechanically. Live's `completedIntradaySeries` (bars.ts:44-58) trims them, so live's 1h tail is up to 1h stale and its 4h tail up to 4h stale. Frequency, derived from the grid: the hourly bucket is partial unless the decision bar is the `:45` bar — **3 of 4 decisions**; the 4-hour bucket unless it is the last of sixteen — **15 of 16 decisions**. sweep.ts:248-249 asserts the opposite in its own comment ("a trailing partial bucket survives — exactly the shape a live fetch of the higher timeframe has"). That comment is false against bars.ts as it stands.
- **5-minute (442).** The parent/child grid is proven in-repo, not assumed: `scripts/clockWitness.ts` `gridRegistration` (line 634) tests children at exactly +0/+5/+10 minutes and measured a worst healthy violation rate of **0.00301%** across all 97 markets on the R0 cache (clockWitness.ts:619-630). So decision bar `T` has children `T`, `T+5`, `T+10`, all closed by `T+15`. The sweep's `<=` admits exactly **one** (`T`, which closed at `T+5` — ten minutes before the decision bar's own close). Live's tail inside the anchor window is `T+10` / `T+15` / `T+20` as `δ` runs 0→15. **Count at the same decision: sweep 1 admitted child, live 3 to 5.** Constant deficit of 2, plus 0-2 conditional on `δ`.

Sole consumer of both: `voteMultiTimeframeAlignment` (strategies.ts:167-169) → `directionalBias` (indicators.ts:3-24), which reads `bars.at(-1).close`. Vote score is `14 + agreement*16 + aligned*6`. So offline, 1h and 4h agree with the primary by construction while 5min votes on a close 10 minutes older; live has the mirror arrangement. **Depth is not part of this** — I checked: the sweep caps at 240 (sweep.ts:305, 457-459) and live at 2,400 (marketLoader.ts:181), but `ema()` reads only `period*3` values (indicators.ts:182 — 60 for EMA20, 150 for EMA50), so both read the same tail depth. The divergence is purely **where the window ends**.

There is **no reading in which line 442 is correct**: under the nominal clock `B`, bar `T` has not closed, so `<=` is a 5-minute look-ahead; under the honest clock `B+15min`, it is a 10-minute shortfall. Nothing pins it — `tests/sweepDecisionContext.test.ts:337-413` pins the 40-bar floor and the timeframe list, `:429-455` pins that a real 5-minute series is handed over. **No test asserts the visibility instant of any frame.**

*Magnitude in score points: NOT MEASURED. The material supports the frequency exactly and the mechanism exactly; the resulting `consensus.score` delta needs a recompute against the cache.*

### 2.2 — sweep.ts:468: session context. **MEASURED: 10.4% of energy decisions per day; 2.1% of crypto and futures/indices decisions per day; ~5 FX bars/week and ~3 futures bars/week deterministically.**

Highest per-event magnitude in the set: a session divergence flips a **100-penalty block**, which decides whether the row exists at all.

Bar opens sit on the quarter hour (bars.ts:194 `BAR_CLOCK = "venue-wall-utc-v4"`; `toTimestamp` at bars.ts:218 converts a venue wall label to a true instant, and every venue in the roster is at a whole-hour UTC offset). Any half-open 15-minute interval contains exactly one grid point, so **every boundary in sessions.ts has exactly one decision bar whose open lies in `[T-15min, T)` and which therefore diverges deterministically**, plus a second at `[T-30min, T-15min)` that diverges whenever `δ` pushes live past `T`.

Enumerated deterministic divergent bars, all verified against source this pass:

**(a) FX default branch, ET** (sessions.ts:216-270)
- `15:45` Mon-Fri at the 16:00 `lateSession` edge — sweep penalty **0**, live **3**.
- `16:15` Fri at the 16:30 `fridayClose` edge — sweep **3**, live **10**.
- `16:45` Mon-Thu at the 16:59 `dailyRollover` edge — sweep = lateSession 3 and **ALLOWED**; live at 17:00-17:04 **BLOCKS**, at 17:05-17:14 scores **0**. This bar diverges in **both directions** depending on `δ`.
- `17:00` Mon-Thu — sweep **BLOCKED** (17:00 is the only grid point inside `[16:59, 17:05)`); live at `[17:15, 17:30)` is Normal. Sweep sees **more** closure here.
- `16:45` Fri — sweep = fridayClose 10, allowed; live is **FX weekend BLOCK** (sessions.ts:243-245). sessions.ts's own I7 comment says these setups land their review window inside the weekend and resolve deterministically unfilled.

**(b) Futures / metals / energies / indices / livestock, ET** (sessions.ts:126-158)
- `16:45` Mon-Thu at the 17:00 maintenance edge — sweep allowed, live **BLOCKED**.
- `16:15` Fri at the 16:30 `fridayThin` edge — sweep **0**, live **10**. Largest pure-penalty divergence in the file.
- `16:45` Fri at the 17:00 `fridayClose` edge — sweep penalty 10 allowed, live **BLOCKED**.

**(c) Energies low-edge hours `{3,4,12,15,19,21}` UTC** (sessions.ts:163-166, 290). Five runs → five ON and five OFF boundaries → **10 deterministic divergent bars per day out of 96 = 10.4%**: the `:45` bars at 02:45, 04:45, 11:45, 12:45, 14:45, 15:45, 18:45, 19:45, 20:45, 21:45 UTC.

**(d) Crypto and futures/indices, 12:00-18:00 UTC** (sessions.ts:26, 182-185, 282-285). The 11:45 UTC bar (sweep allows, live blocks) and the 17:45 UTC bar (sweep blocks, live allows) = **2/96 = 2.1% per day**. For crypto both bars always exist.

**(e) Agriculture** (sessions.ts:53-61). The 14:15 ET bar at the 14:20 grain close — sweep `minutes 855 < 860` so OPEN; live at `[14:30, 14:45)` CLOSED.

Two qualifiers. `--ignore-low-edge` (sweep.ts:470-475) neutralises classes (c) and (d) entirely, so a low-edge measurement run is clean of those while hard closures still diverge. And DST moves the set: 16:30 ET is 20:30 UTC under EDT but 21:30 UTC under EST, so an energy symbol's Friday-thin bar sits outside the low-edge hour set half the year and inside it (hour 21) the other half.

**Net direction is permissive.** Every hard closure in sessions.ts turns ON at the end of a trading window, so a stale reading systematically lets the sweep decide on the last bar of a session live has already shut. The mirror (re-opening) bars mostly do not exist in the series — bars.ts:198-201 records the measurement: banked EURUSD dies at Friday 17:00 wall and reopens Sunday 17:05; banked ES is missing exactly the 17:00-18:00 wall maintenance hour. So closure divergences populate and re-opening divergences largely do not.

**The standing claim that let this survive ~57 reviews:** sweep.ts:463-465 says "Session context is evaluated at the bar's own time, mirroring the live analyzer." That is **false as written**. Live evaluates at wall clock, at index.ts:650, **before it has a bar at all**.

### 2.3 — sweep.ts:502: the news active/upcoming split under-blocks. **Per high-impact event: one decision bar out of three flips between BLOCK and ALLOW. Corpus-wide population NOT MEASURED.**

Sweep active window: `[B-10, B+20]`. Live's: `[L-10, L+20] = [B+5+δ, B+35+δ]`. Events in `(B+20min, B+35min+δ]` are **upcoming** for the sweep (non-blocking, 1 penalty unit on a high impact) and **active** for live (blocking, index.ts:2133).

The pre-print bar is exactly where this bites. For a US 08:30 ET release, the 08:00 decision bar is upcoming/allowed for the sweep; live decides that same bar at 08:15 with `activeEnd = 08:35` and **blocks**. **So the corpus holds a population of setups opened into the last half hour before a scheduled high-impact print — the single slot the news gate exists to remove — and their outcomes sit inside the measured expectancy.**

The flip changes the decision only for **high** impact: newsRules.ts:28-33 charges active-non-blocking-high and upcoming-high identically at 1 unit, and medium at 0.5 either side. What changes is `isBlockingNewsEvent` (newsRules.ts:15-17), applied to `active` only.

This one is **RECOVERABLE**: the sweep is the permissive side, so the rows exist and can be identified from `time` plus the cached calendar and pruned.

### 2.4 — sweep.ts:483: the active window's lower edge. **Per event: the sweep and live agree on 1 decision bar of 3, for every event in the calendar.**

The offset (`S+δ` = 15-30 min) is comparable to the entire 30-minute active window. At `δ=0` sweep-active `[B-10, B+20]` and live-active `[B+5, B+35]` overlap in `[B+5, B+20]` — half. At `δ→15` they touch at a point.

On the quarter-hour grid, for a scheduled event at instant `E`: sweep-active decision bars are `{E-15, E}`; live-active at `δ=0` are `{E-30, E-15}`. **Agreement on one bar, disagreement on two.**

Direction is the reverse of 2.3: events in `[B-10min, B+5min+δ)` are active for the sweep but land in **neither** of live's sets — live's `active` filter requires `scheduled_at >= activeStart` (index.ts:2131) and its non-headline `upcoming` filter requires `scheduled_at > activeEnd` (index.ts:2139). A scheduled event that fired more than 10 minutes before live's clock contributes **nothing at all** to live. On a high-impact event, that band is the difference between the sweep refusing the decision and live scoring it with no news term whatsoever.

`tests/sweep.test.ts:351-365` encodes the sweep side of exactly this: it places a high-impact USD event at `firstDecisionTime` — the decision bar's own open — and asserts `rejections.newsBlocked >= 1`. Under live semantics that event sits at `L - 15min`, outside both live sets. **The test pins the bar-open convention as correct behaviour.** LOST: this is the restrictive direction, so the affected decisions are only a counter.

### 2.5 — sweep.ts:484: the 6-hour horizon's far edge. **MEASURED: 4.2%-8.3% of the horizon is systematically unseen.**

A fixed 15-30 minute band at the far edge of a 360-minute horizon. Every event in `(B+6h, B+6h+S+δ]` is upcoming for live and invisible to the sweep. **One-directional** — the sweep's horizon can only fall short, never overreach — so nothing compensates it.

Cost per missed event: 0.5 units (medium) or 1 unit (high) at newsRules.ts:32, converted by scoring.ts:41-45 at `newsPenaltyPerEvent` — **3 points** for most classes (calibration.ts:261, 322, 466, 510, 630), 1 for one class (calibration.ts:376) and 4 for another (calibration.ts:570), capped by `maxNewsPenalty` 4-9. Against confidence thresholds of 20-85 (calibration.ts:237, 300, 354, 395, 441, 485, 531, 614). This edge never blocks — its entire effect is to **inflate the score**, pushing marginal setups over the confidence gate that live would have scored below it.

### 2.6 — sweep.ts:662: the review window's back edge. **MEASURED: every accepted row loses `S+δ` = 15-30 min of price path, out of a review window of 6, 8, 12 or 24 hours — 1.0% to 8.3% of the graded window, on 100% of rows.**

Offline expiry is `barOpen + RH`; live's is `wallClock + RH >= barOpen + 15min + RH` (replay.ts:682, index.ts:1198). The **front** edge is neutralised by 637/689; the back edge is not. `RH` per class: calibration.ts:242, 303, 357, 398, 447, 491, 538, 617, 697.

Second effect: `getUpcomingWeeklyCloseTime` (replay.ts:683, 694) is evaluated from the earlier instant, which bites for decisions in the last half hour before a Friday close.

Marked **LOST** rather than recoverable, and this is the one recoverability call that changed under scrutiny: `time` and `exitAtMs` are emitted, so the instants are recomputable — but **re-resolving the window under a corrected back edge requires the plan's absolute price levels, and the emit does not carry them.** Verified against the emit block (sweep.ts:711-771): it carries `riskDistance`, `rewardRisk`, `grossRewardRisk`, `latestClose`, `atr`, `stopPivotDistance`, and the four provenance fields — but **no `limit_entry`, `stop_loss`, `take_profit`, or `take_profit_1`**. For a filled row the entry can be read back out of `legs`; for an unfilled row nothing recovers it. See §3, field 2.

### 2.7 — sweep.ts:429: daily visibility. **MEASURED: at most one decision per symbol per calendar day (~1% of a 24h market's decisions), but that decision's ENTIRE daily context is a day stale. Unbounded where live's anchor is stale.**

Predicate and boundary are **identical** to live's — same module, same rule table, `completeAtMs <=` on both sides. Only the instant on the right differs. Divergence fires exactly when a completion instant `c` falls in `(B, L]`, and there is one completion per daily bar.

Completion instants (dailyCompletion.ts:71-97, verified): **17:00 New York** for the complex and FX (line 97), **UTC midnight** for crypto (line 78), **14:20 New York** for agriculture (lines 83-91). 17:00 ET and 00:00 UTC sit **on** the 15-minute grid, so the `<=` equality case fires daily for those two rules and is what admits the day at the 17:00/00:00 bar rather than one bar later. 14:20 ET is **off** grid, so agriculture never hits the equality — a fact that matters for §4.

What the affected decision loses: `atr`, `dailyAtr`, the EMAs, `classifyRegime`, `volatilityPercentile`, `trendStrength`, and the expected-window move — the whole daily half of the context, one day stale.

**LOST.** Which rows are affected IS derivable (`time` + symbol → `dailyBarCompletionMs`), but the corrected context is not: the derived values are emitted as computed under the sweep's view, and recomputing them under live's is a re-simulation. Worse, a divergence that flips `notWarm`, `regimeGated` or `noConsensus` leaves no row at all.

### 2.8 — sweep.ts:763: the record's own semantics. **MEASURED: 25% of rows sit in the wrong UTC-hour bucket; 1.04% sit in the wrong UTC-day bucket.**

The corpus's `time` is a bar **open**; live's `created_at` is a wall clock at `B+S+δ`. Derived exactly from the grid: for `B` on the `:45` mark, live's clock is in `[:00, :15)` of the **next hour** for every `δ ∈ [0,15)`. For `B` on `:30`, live's clock is in `[:45, :00)` — same hour. So **exactly one decision bar in four crosses the hour boundary**, and `B = 23:45 UTC` (1 of 96 bars = **1.04%**) crosses the calendar day.

Downstream readers that inherit the shift, derived by grep over `scripts/` and verified at the line:
- `scripts/ag-class-derivation.ts:82` — `new Date(r.time).getUTCHours()`, raw UTC-hour cohort curves.
- `scripts/grid-totalr.ts:144` — `Math.floor(Number(row.time) / DAY_MS)`, per-day R buckets; and grid-totalr.ts:1050-1065, per-market refold.
- `scripts/e4-collapse.ts:388` — `Math.floor(row.time / bucketMs)`, scan bucket; and e4-collapse.ts:429, earliest-in-bucket tie-break.
- `scripts/cost-sensitivity-verdict.ts:108`, `market-dossier.ts:177`, `roster-expectancy-audit.ts:183`, `threshold-rescue.ts:105/149-152` — fit/select/confirm placement by fraction of the market's span.
- `scripts/sweep-analysis.ts:275` parses it and never reads it.

**LOST.** `time + 15min` is a **lower bound only**: live's `created_at` carries `δ` plus insert latency, which the corpus never observes. Every read that joins corpus rows to live rows "at the same decision instant" is silently comparing a bar open to a wall clock.

### 2.9 — sweep.ts:637: the resolution stream's front edge. **MEASURED: the sweep sees 0-20 minutes more front-edge price path than live, on 100% of 5-minute-tier rows.**

This is the **one reference in the file that already carries the correction the gates omit**. It moves the stream start to the decision bar's close — where live's clock already sits — twelve lines below gates that do not. The converge's observation, verified.

The residual is `δ`: live's first admitted 5-minute bar opens at `ceil(L / 5min) * 5min` with `L ∈ [B+15, B+30)`, so live's stream starts 0-20 minutes later than the sweep's. **The sweep therefore sees more front-edge price path, which biases the offline fill rate UP** — and fill rate is precisely the quantity the remediation program is repairing, so this ranks above its size. RECOVERABLE: `filledAtMs` (sweep.ts:718) lets a reader test whether any given fill landed inside the disputed front window.

### 2.10 — sweep.ts:449 + 565-576: Treasury. **Frequency: the publication-evening window, daily, for any 24-hour market. Magnitude bounded by the ±4bps/±8bps thresholds.**

Two differences stacked.

**(1) The rule differs, deliberately and asymmetrically.** The sweep admits a row only from **New York midnight after its label date** (macroRates.ts:187-213, verified: `treasuryVisibleAtMs` takes `dateMs + 86_400_000` and converts that day's NY midnight). Live admits it the moment FMP publishes — the same evening. macroRates.ts:190-195 states the intent in its own words; the divergence map records it as a standing claim at map:1393-1394 ("conservative by a few evening hours, never early"). I verified the **live** half rather than repeating it: macroContext.ts:112-120 has no filter of any kind, only the descending sort and `rows[0]`/`rows[1]`. So for every decision between publication and NY midnight the sweep scores against a one-row-stale curve. That direction rests on FMP publishing label `D` before NY midnight of `D+1` — an assumption stated in the code, not independently verified here.

**(2) On top of the rule, the clock is 15 minutes early.** NY midnight is on the 15-minute grid, so the `<=` equality fires: the 00:00 bar admits the row, and `<` would delay it one more bar. For a 24-hour market that equality is a daily event.

**Reverse-direction case, worth naming.** The sweep applies **no per-decision staleness check** — sweep.ts:21-27 imports `treasuryContextFromRows`, `treasuryVisibleAtMs` and `unavailableContext`, and deliberately not `treasuryCurveIsStale`. The offline equivalent lives one level up as a corpus-level pre-flight against `Date.now()` (replay-sweep.ts:333 tail staleness; :381-390 interior gaps via sweepManifest.ts:433). So the predicate is **per-corpus offline and per-decision live**, and any caller of `simulateSymbol` other than that driver — a test, a future harness — has none at all. Under those guards a decision's newest visible label can be a ≤7-day gap plus the ≤1-day visibility lag ≈ 8 days old, which live would have refused as unavailable. Narrow, and the premise is already red: HANDOFF R0 step 3 records the Treasury store 275 days short at the head with a 278-day interior gap (R0c).

**RECOVERABLE, uniquely without a re-sweep.** The emit carries `time`, `side`, `macroAdjustment`, `macroStance` and `confidenceScore`; `treasuryVisibleAtMs` is deterministic; the table is a few thousand rows; `calculateMacroRateAdjustment` is pure in `(symbol, side, two rows)`. Divergent rows can be flagged, re-scored and re-run through the acceptance gate offline. Not recoverable: live's true instant depends on FMP's publication minute, which macroRates.ts:189-190 states is not reconstructible historically.

### 2.11 — sweep.ts:318 `quote: null`: the modeled-spread half. **Frequency 100% of rows. Magnitude UNMEASURABLE, now and permanently.**

The divergence map names the **admission** half under anchor latency (map:506-534, the `buildPricePlan` quote-crossed refusal). It does not name the **spread** half, which is load-bearing: with `quote` null on every corpus row, `estimatedSpread` is **modeled always** (executionQuality.ts:203-207), so every emitted `executionScore`, the net `rewardRisk` (pricePlan.ts:378), and the commission charged into `realizedR` (sweep.ts:744-753) are modeled-spread numbers, while live banks the quoted spread whenever the snapshot arrives. **The historical live quoted spread at each decision instant does not exist anywhere.** R3 cannot close this. Only the live minute bank can.

### 2.12 — sweep.ts:52-56: the corpus's news population is one family of three. **Direction LESS. Frequency NOT MEASURED.**

`SweepNewsEvent = {currency, impact: medium|high, time}`; the loader (replay-sweep.ts:962-1023) keeps a row only `if (Number.isFinite(time) && currency)`; relevance is `isCurrencyRelevantForSymbol` alone (sweep.ts:498). Live's `isNewsRelevant` (index.ts:2152-2165) additionally routes symbol-tagged **headlines** (a *backward*-looking `[now-6h, now]` window with no corpus analogue in either the events or the window, index.ts:2138-2140, weighted 0.25/0.5 at newsRules.ts:29-31) and `provider === "fmp_earnings"` rows, and a **null-currency row is relevant to every symbol** — which the offline loader drops on replay-sweep.ts:1023.

`docs/HANDOFF.md:2480` records the event-**family** enumeration as closed (yield 1→0) with the null-currency asymmetry as its stated reopener. The headline arm's **instant** half is not covered by that entry, and `grep -ic news docs/research/r1-divergence-map-2026-08-18.md` returns **0** over all 1,568 lines. Headlines are unscheduled, so this is not reconstructible from a scheduled calendar.

Units are at least commensurable: bars.ts:197-203 records that FMP stamps bars in venue wall time and the economic calendar in true UTC, and both sides parse them that way (`BAR_CLOCK` vs `CALENDAR_CLOCK`, replay-sweep.ts:969-971).

### 2.13 — sweep.ts:372-373: the resolver's far-future clock. **Population NOT MEASURED; no per-symbol guard exists.**

Live leaves a setup **pending** until wall clock passes expiry. The sweep never returns pending, so every decision inside the corpus gets a verdict — including ones whose review window runs past the last bar the **symbol** has. The guard is the 5-day fold embargo, but it is computed from the **global** corpus span (`spanEnd = max over symbols of bars.at(-1).time`, replay-sweep.ts:466/483/491; `sweepFolds.ts:57 decisionEndMs = endMs - embargoMs`), and nothing checks that a given symbol's own tail reaches its fold's `decisionEnd` plus its review window. Grepped: no per-symbol tail-coverage assertion exists; the only per-symbol floors are depth (replay-sweep.ts:703) and 5-minute density. A lagging symbol decides to its own second-to-last bar (sweep.ts:417). A **fully** empty window is marked `noBarsInReviewWindow`; a **partially** covered one is not, and resolves as unfilled or expired-at-loss.

### 2.14 — sweep.ts:308-309 + 578: `availableTimeframeCount` is MAX by construction. **Two live penalties can never fire offline.**

The sweep admits any resampled frame at `length > 0` and applies a 40-bar floor only to the 5-minute frame. With `WARMUP_BARS = 240` (replay-sweep.ts:945) the first decision of every fold has ~61 hourly buckets and ~16 four-hour buckets, while live would drop the 4-hour frame until ~640 15-minute bars exist. Consequence: `timeframePenalty` (scoring.ts:46-48) and executionQuality's `< 3` branch can never fire in the corpus. E6 named `providerWarningCount` as "zero by construction" and never named this sibling, which is **max** by construction. Two opposing sub-effects, both unmeasured: an unwarm 4-hour frame votes neutral (indicators.ts:13-15) and dilutes agreement, while its mere presence removes a penalty live can take.

### 2.15 — Lower-ranked, named for completeness

- **replay.ts:252 (from sweep.ts:630-634)** — tier admission tests the corpus's **first** bar, not local coverage. A decision inside an interior 5-minute hole still takes the 5-minute tier and grades a sparse window — E2's own defect reproduced one level up. Mitigated by the E2 density assertion, with a **stated residue of ~7.7%** (map:70-98). sweep.ts:616-627's comment says the rule admits the fine tier "only when that series reaches back to the decision instant"; the predicate is weaker than the sentence.
- **sweep.ts:631** — the earlier `createdAtMs` makes the reach-back test strictly harder offline. Materially near zero: the offline store spans the whole replay window while live's is one ~8-day response (replay.ts:240-245). `resolutionIntervalMs` is emitted (sweep.ts:735), so the tier each row got is on the record.
- **sweep.ts:433** — `dailyVisible < 40` against live's `>= 80` (marketLoader.ts:88, index.ts:757). **Dormant under the current driver**, not merely small: replay-sweep.ts:543-548 fetches `args.days + 240` calendar days of daily bars while the 15-minute corpus spans `args.days`, so ~170 completed daily rows precede the window. Reachable only from a fixture or a driver without the cushion. Rows at 40-49 additionally cannot warm `classifyRegime`'s ema50 and land in `notWarm`; 50-79 are real corpus rows live would never have produced.
- **sweep.ts:304 + replay-sweep.ts:550-553** — the 5-minute 40-bar floor. Same numeric threshold on both sides, different populations behind it: the driver's comment states the degradation as intended parity ("the same degradation a thin live fetch produces"), but a live fetch is thin only for an instrument FMP barely covers, whereas the sweep's hole is wherever the cached 5-minute store is shallower than the 15-minute one — which that same comment says is most symbols.
- **marketLoader.ts:446-458** — live can promote 1hour/4hour/1day to primary, moving `latest`, the ATR unit and the entry-offset base. The sweep pins `"15min"` unconditionally. Rare (the 45-day fetch makes <80 completed 15-minute bars unusual), but when it bites, **the corpus contains no row of that shape at all**. Named because it is the last un-enumerated way live and the sweep can disagree about *which bar the decision bar is*.
- **sweep.ts:441-442 vs 420 — cross-frame coherence.** Offline, the 5-minute frame stops at the bar stamped `B` (covering `[B, B+5)`) while primary, 1hour, 4hour and daily all carry data through `B+15`. **Within one context the 5-minute frame stands at `B+5` and every other frame at `B+15`.** Live has no analogue: bars.ts:52 trims every intraday frame against one `nowMs`, and live's 5-minute frame is fresher than or equal to its 15-minute frame. This finding cannot be produced by a per-reference lens — it requires comparing two references against each other, which is exactly what four lenses and eight skeptics reading line-by-line did not do.

---

## 3. WHAT R3 MUST RECORD

R3 is **one** re-sweep. FMP bandwidth is a rolling 30-day allowance already exhausted once by replay sweeps (project memory: `fmp-bandwidth-allowance`), so "add the field in R4" is not a real option. **Cheap-now / impossible-later is the operative distinction, not nice-to-have / essential.**

### Must be in the emit or the divergence can never be measured

| # | field | closes | cost |
|---|---|---|---|
| 1 | **A per-decision rejection ledger** — one record per decision point: `{time, rejectionReason}`, replacing (or accompanying) the `rejections` counter struct at sweep.ts:374-390 | **Every sweep-restrictive divergence: 429, 442, 468 block flips, 483.** Today these are integers. This is the single largest gap in the corpus | **cheap now / IMPOSSIBLE LATER** |
| 2 | **`limitEntry`, `stopLoss`, `takeProfit`, `takeProfit1`** per row | **662** — makes the back-edge shift re-resolvable offline against the cache without a re-sweep. Verified absent from sweep.ts:711-771; `legs` recovers entry only for filled rows | **cheap now / IMPOSSIBLE LATER** |
| 3 | **Per-frame tail instants**: `frameTailMs: {"5min", "15min", "1hour", "4hour", "1day"}` plus `availableTimeframeCount` | **442, 296-297, 308-309, and the cross-frame coherence finding.** A reader can then see, per row, exactly which instant each frame stood at — the thing this whole enumeration had to derive by hand | **cheap now / IMPOSSIBLE LATER** |
| 4 | **`decisionAtMs`** — the instant the gates actually used, recorded alongside `time` | Makes the convention a property of the row rather than of the code version. Without it, no future reader can tell a pre-fix corpus row from a post-fix one | **cheap now / IMPOSSIBLE LATER** |
| 5 | **`dailyVisibleCount`** and **`dailyTailCompleteAtMs`** (completion instant of the newest admitted daily bar) | **429, 433.** Lets a reader test whether live's clock would have admitted one more, per row | **cheap now / IMPOSSIBLE LATER** |
| 6 | **News in scope**: `newsActiveCount`, `newsUpcomingCount`, and the event instants considered (`newsActiveMs[]`, `newsUpcomingMs[]`) — at minimum `nextHighImpactMs` | **483, 484, 502** for the scheduled family. Partly reconstructible from the cached calendar, but only for the one family the corpus carries; recording the realized set removes the ambiguity | **cheap now** |
| 7 | **`symbolTailMs`** — the symbol's own last bar, per row or per symbol in the manifest | **372-373.** Identifies rows graded on a window the symbol's series could not cover. Verify first whether the manifest's per-symbol series facts already carry it; keep it either way | **cheap now** |

### Cheap, and it prevents a future misreading

| # | field | closes | cost |
|---|---|---|---|
| 8 | **`treasuryLabelMs`** — the newest visible label date | **449, 565-576.** Lets the 7-day staleness predicate be applied after the fact, per decision | cheap now |
| 9 | **`spreadSource: "modeled"`** written explicitly | **318.** Stops a future live↔corpus join from silently comparing modeled spread to quoted spread | cheap now |
| 10 | **`resolutionStreamStartMs`** and **`expiresAtMs`** | **637, 662.** Makes the arithmetic explicit instead of reconstructed | cheap now |
| 11 | **`foldName` / `split`** | **423.** Already written by the driver (replay-sweep.ts:846-852) — keep it, do not regress it | already present |

### What R3 **cannot** record, and must not be claimed as closed

- **Live's scan phase `δ`.** Not observable offline at any price. Every magnitude in §2 carries a 0-15 minute uncertainty because of it. Only the live minute bank measures it.
- **The live quoted spread at a historical decision instant.** It exists nowhere. §2.11 is bounded by R3, never closed by it.
- **FMP's Treasury publication minute.** macroRates.ts:189-190 states it is not reconstructible historically.
- **Live's realized news penalty**, because the headline family is unscheduled. §2.12's headline arm needs a live recording, not a replay.

---

## 4. THE CORRECTNESS FIX, AND WHAT IT MUST NOT BE

### The fix

Introduce **one** explicit decision instant in `simulateSymbol`:

```
decisionAtMs = latest.time + primarySpanMs      // the instant the decision bar's data is complete
```

and route **every visibility gate and every context construction** through it: 429, 442, 449, 468, 483, 484, 502, 563. Replace — do not add to — the two hardcoded `+ 15 * 60 * 1000` literals at 637 and 689 with the same value.

`decisionAtMs = B + S` is the **δ=0 corner** of live's distribution, not its mean. **Say so.** It collapses the systematic 15-minute error and leaves a bounded, one-directional 0-15 minute residue whose sign is known per gate. That is the honest claim, and it is the claim the manifest's `conditions` block must carry.

### What it must NOT be

**1. It must not be a blanket `latest.time + 15*60*1000` validated on grid-aligned classes and shipped roster-wide.** That is the archetype, and this surface has already produced it once. `15 * 60 * 1000` is a literal; the primary span is a property of the series. Derive it, or assert it.

**2. It must not assume the boundaries move by exactly one bar.** They do for boundaries **on** the quarter-hour grid — daily completion at 17:00 ET and 00:00 UTC (dailyCompletion.ts:78, 97), Treasury NY midnight (macroRates.ts:199-213), the low-edge UTC hour edges (sessions.ts:163-166, 282-285), the futures 16:30/17:00 ET edges (sessions.ts:128-137), the FX 16:00/16:30/17:00 ET edges (sessions.ts:229-244). They do **not** for these, all verified this pass:

- **FX daily rollover, `[16:59, 17:05) ET`** (sessions.ts:222-223). A 6-minute window shorter than a bar span, **neither edge on the grid**. Exactly one bar falls inside it either way, but *which* bar changes, and the 17:05 reopening edge means a shift can hand the sweep a Sunday-open bar it currently blocks — or take one away.
- **FX weekend reopen, Sunday 17:05 ET** (sessions.ts:244). Same 5-minute offset.
- **Grain session close, 14:20 ET** (sessions.ts:56-61). Under `B` the last open bar is 14:15. Under `B+S` it is **14:00**, because 14:15+15 = 14:30 > 14:20. **The fix removes a decision bar for agriculture that no grid-aligned class loses.** Predict that loss before running anything, then assert it.
- **Agriculture daily completion, 14:20 ET** (dailyCompletion.ts:83-91). Off grid, so it never hits the `<=` equality that the 17:00/00:00 rules lean on. The shift changes which bar first sees the completed daily bar with no equality to anchor it.
- **DST.** 16:30 ET is 20:30 UTC under EDT and 21:30 UTC under EST, so the energy low-edge hour set `{3,4,12,15,19,21}` intersects the ET session boundaries differently by season. **A validation run inside one DST regime does not validate the other.**

**3. The validation population is a cross product, and it must be enumerated, not sampled.** Every boundary in this fix is a *constant* in source. Enumerate them programmatically — every wall-clock instant named in `sessions.ts`, `dailyCompletion.ts` and `macroRates.ts` — and for each boundary `T`, each asset-class branch, and each DST regime, compute the set of decision bars whose verdict changes under `B → B+S`. **That set is finite arithmetic on the bar grid. It requires no sweep, no FMP call, and no cache.** Pin it as a table in a test: `(class, boundary, DST regime, bar that changes, old verdict, new verdict)`. That converts the fix's blast radius from a measurement into an enumeration — which is the same correction this document is.

**4. It must not change `time`.** `time` is the corpus's identity and the join key for `ag-class-derivation.ts:82`, `grid-totalr.ts:144` and `:1050-1065`, `e4-collapse.ts:388` and `:429`, `cost-sensitivity-verdict.ts:108`, `market-dossier.ts:177`, `roster-expectancy-audit.ts:183`, `threshold-rescue.ts:105/149-152`. Keep `time` = bar open, **add** `decisionAtMs`, and let the gates read the new field.

**5. It must not silently change 423.** `decisionEndMs` is a fold boundary derived from the corpus span. Shifting the instant compared against it changes fold membership at the margin. Either keep that comparison on the bar open — fold membership is bookkeeping, not market visibility — and state it in the comment, or shift it and re-derive the fold calendar in the same change set. Pick one, state it, pin it.

**6. It must not double-count the resolution code.** 637 and 689 already carry `+15min`. A blanket shift applied on top moves the stream start to `B+30min`. Replace, do not add.

**7. It must not ship without a test per gate that pins the instant.** Today nothing does: `tests/sweepDecisionContext.test.ts:337-413` pins the 40-bar floor and the timeframe list; `:429-455` pins that a real 5-minute series is handed over. **No test in the repo asserts the visibility instant of any gate.** That absence is why a wrong comment at sweep.ts:463-465 survived ~57 reviews.

**8. It must not be accepted on acceptance-rate parity.** Moving every gate one bar will move every aggregate by a few percent, and "the numbers moved a little" is not evidence of correctness. The acceptance evidence is per gate: the instant used equals live's counterpart instant at δ=0, plus the enumerated boundary cross-product from (3).

**9. It must not be reported as a live-behaviour change.** `sweep.ts` is the offline engine; live is untouched, so no `ANALYZER_VERSION` bump is implied. But the change **invalidates cross-corpus comparability**, and the manifest's hashed `conditions` block — which `verifyManifest` already refuses to omit (map:1400-1405) — must state the convention the corpus was swept under.

**10. It must not fix the gates and leave §1b.** Six of the eleven adjacent consumers are the same defect wearing a different variable name — 296-297, 372-373, 433, 308-309, replay.ts:252, 565-576. A fix that lands only on the fifteen `latest.time` sites will report success while the committee's 1h/4h frames still carry the decision bar's close and live's do not.

---

## 5. IS THE SURFACE ENUMERATED?

**`latest.time` in `simulateSymbol`: YES. Fifteen of fifteen, each with a live counterpart stated at `file:line` or an explicit "no live counterpart found." None dropped, none sampled.** Three are genuinely offline-only (423, 646, 563 — and 563's live absence was verified case-insensitively at zero occurrences, not inferred). One agrees (689). Eleven diverge.

**The surface — "sweep↔live decision-instant convention" — is NOT closed.** Two reasons, and both belong in the register.

**Reason one: the register named the wrong population.** "Every consumer of `latest.time`" is a strict subset of "every place the sweep and live disagree about the decision instant." This pass found **eleven** consumers of the same instant that never touch `latest.time` (§1b), including `resampleBars`' preserved partial bucket — which hits 3 of 4 decisions on the hourly frame, contradicts its own comment, and is invisible to any `latest.time` grep. The correct precondition for a future closure is the **derived** population, not the grep: *every construction of a `MarketContext` field, every gate that admits or refuses a decision, and every argument handed to the resolver — each stated against its live counterpart.* A grep-derived population is a curated population wearing a derivation's clothes.

**Reason two: four items could not be resolved, three of them permanently.**

| item | status |
|---|---|
| **FX Sunday-open bar stamp** — whether FMP stamps the first Sunday 15-minute bar at 17:00 or 17:05 ET. At 17:00 the sweep blocks a bar live trades; at 17:05 both agree. bars.ts:200 says the banked series "reopens Sunday 17:05," but resolving the grid there needs `.calibration-cache` | **UNRESOLVED — resolvable, blocked this pass** (cache mid-rebuild, off-limits by the resource rule). Resolve before any fix touches sessions.ts |
| **Live's scan phase `δ`** | **UNRESOLVABLE OFFLINE.** Bounds every magnitude in §2 by 0-15 minutes. Needs the live minute bank |
| **The live quoted spread at a historical instant** (§2.11) | **UNRESOLVABLE, PERMANENTLY.** No such record exists. R3 cannot close it |
| **FMP's Treasury publication minute** (§2.10) | **UNRESOLVABLE, PERMANENTLY.** Stated as such at macroRates.ts:189-190 |

**Register entry, as it should now read:** the `latest.time` precondition is **satisfied** — fifteen consumers enumerated, eleven divergent, one killed claim recorded, per-consumer live counterparts stated. The surface stays **OPEN** on a corrected population ("every consumer of the decision instant"), with one resolvable blocker (FX Sunday stamp) and three permanent residues that no re-sweep can close. Closure requires the fix from §4 plus the R3 fields from §3 — and the three permanent residues must be carried as *stated bounds*, never as closures.