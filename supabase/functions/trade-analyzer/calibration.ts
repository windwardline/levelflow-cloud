// Scopes every learning cohort and every corpus emit: bumped in every
// behavior-changing analyzer change set (roster membership alone does not
// bump). Lives here — the one Deno-free module both the Edge function and
// the sweep driver's manifest can import — so a corpus can never be
// aggregated without knowing which engine produced it.
import { isKnownSymbol } from "./symbols.ts";
// 2026.08.18.one-physics (R1a slice 2 — E1/E3/E7/E2): live grading
// resolves on the sweep's own tiering (5-minute when it reaches the
// setup's creation, else 15-minute, recorded per row); the options
// bridge carries the row's stored runner-protection mode and review
// window instead of the resolver's "breakeven"/current-calibration
// fallbacks; setup construction anchors on the last COMPLETED primary
// bar instead of the freshest 1-minute print; no-bars expiries are
// marked. Grading physics and decision inputs changed, so the cohort
// boundary moves with them.
//
// 2026.08.25.macro-roles: the Treasury-rate layer's symbol routing moved
// from four hand-typed Sets and two name regexes to one per-market role
// table, and FOUR markets changed what the curve is allowed to say about
// them. ZFUSD and ZTUSD now take the rate rule their own correlation family
// already claimed for them; HOUSD and RBUSD now take the shock penalty their
// crude already carried. That moves the confidence score on both the
// single-analyze and scan paths, so the cohort boundary moves with it.
// (Prior: 2026.08.18.one-physics — R1a's grading physics; before that
// 2026.08.18.realized-r, D2's one R accountant on every filled resolution.)
// 2026.08.25.treasury-tenors: ZFUSD and ZTUSD gain headline proxies (IEI,
// SHY), so Treasury news now reaches the 5-year and 2-year the way it
// already reached the 30-year and 10-year. That changes the news penalty
// those two markets can receive, which changes their score — the same two
// markets the macro-roles bump corrected one layer up, for the same reason:
// they were onboarded on 2026-08-06 into a file nobody revisited.
// (Prior: 2026.08.25.macro-roles.)
// 2026.08.26.oscillator-conflict-abstains: AXES-9. voteMomentumDivergence read
// its two oscillators through an OR chain whose BUY arm was evaluated first and
// satisfied by EITHER indicator, so every state where RSI and MACD disagreed
// resolved to buy — both conflict cases, with no conflict producing sell or
// neutral. The sharpest was RSI 70 against a falling MACD, a textbook bearish
// divergence, voting buy. Conflict also never reached the abstention branch, so
// contradictory evidence scored 18-24 at confidence 0.62-0.72 instead of 5 at
// 0.2. Exactly two of sixteen enumerated states change, both to neutral, which
// moves the consensus score wherever that vote participated — so the cohort
// boundary moves with it. (Prior: 2026.08.25.treasury-tenors.)
// 2026.08.26.learning-neutral-point-withheld: global learning scored markets
// against a neutral win rate of 0.5. Break-even here is NOT A CONSTANT — it is
// 1 / (1 + avgWinR), and avgWinR depends on the mix of the two winning
// outcomes: a tp1_partial banks ~+0.20R (the runner then exits at entry) while
// a take_profit banks that plus a runner half carried to at least
// minimumTargetRewardRisk, ~+1.00R. So the neutral point runs from ~0.50 for a
// cohort that always reaches the runner target to ~0.83 for one that never
// does; at a 65% partial share it is ~0.68. 0.5 was right at ONE END of that
// range and wrong everywhere else, and take_profit and tp1_partial both
// increment `wins`, so the mix that decides the pivot is not even recoverable
// from what this layer stores.
// confidence_adjustment is withheld (0) until the neutral point is derived per
// market. What that is blocked on, precisely — this line said "blocked on
// setup_key carrying the symbol" and that is only half true. DERIVING a
// per-market neutral point is not blocked at all: the refresh already holds
// `row.symbol` and hands it to extractSetupKey, so it can group by market
// today. What the symbol-less key cannot do is STORE the result — one row per
// setup_key has nowhere to put a per-market adjustment. Derivation is open;
// application is not.
//
// And amendment 39 may retire the question rather than answer it. Under
// realized R the neutral point is 0, not a win rate whose pivot depends on the
// outcome mix — so the per-market break-even that motivated putting the symbol
// in the key is an artifact of learning from a frequency. Settle the R rewrite
// (R2's D1) before changing the key; changing it first would buy a cohort
// boundary for a quantity that is about to stop existing.
// Scoring input changes, so the cohort scopes again. (Prior:
// 2026.08.26.oscillator-conflict-abstains.)
export const ANALYZER_VERSION = "2026.08.27.calendar-provenance";

export type AssetType =
  | "agriculture"
  | "livestock"
  | "crypto"
  | "energies"
  | "forex"
  | "futures"
  | "indices"
  | "metals";
export type RegimeName = "compression" | "range" | "trend" | "volatile_chop";

export type CategoryCalibration = {
  // 4c axes (owner-approved 2026-08-10). Defaults preserve shipped
  // behavior exactly; the crossed grid varies them offline and 4d derives
  // per-market values behind item 3's gate before anything ships.
  //
  // How the runner half is protected once TP1 banks: "breakeven" is the
  // shipped jump-to-entry; "hold" leaves the original stop; "trail_tp1"
  // locks the stop at TP1's level.
  runnerProtection?: "breakeven" | "hold" | "trail_tp1";
  // Q4's split: multiplies ONLY the geometry-sizing hours
  // (expectedWindowMove) — patience/expiry keeps reading
  // defaultReviewHours untouched, because the baseline measured the
  // window censoring nothing (median exit 0.5h).
  //
  // REQUIRED, and that is the whole point. It was optional, no class row
  // carried it, and 72 markets set it per-symbol — so 25 markets ran at 1
  // because `?? 1` sat in the ladder arithmetic, indistinguishable from the
  // 13 markets whose derived value IS 1. R4 grades all 97 individually
  // against their own shipped configuration and could not have told a
  // decision from a fallback. Every class row now states the value, so a
  // market missing one is a type error rather than a silent 1.
  sizingHoursFactor: number;
  // Regimes in which no new setup may be initiated, regardless of score.
  // Entering elevated-volatility chop is a losing proposition across
  // classes; structure and signals both degrade.
  blockedRegimes?: RegimeName[];
  confidenceThreshold: number;
  // Score magnitude applied when CFTC speculative positioning sits at a
  // crowded extreme (contrarian). Zero until calibration validates it.
  cotScoreAdjustment?: number;
  // Per-side score adjustments. Sell setups measured better than buy setups
  // on both walk-forward splits for forex and futures over the full
  // available history, so buys carry a higher bar in those classes. This
  // tilts selection; it never blocks a side outright, because buys remained
  // profitable in the training era.
  sideScoreAdjustments?: Partial<Record<"buy" | "sell", number>>;
  // Per-regime score adjustments derived from measured follow-through
  // (positive emphasizes, negative de-emphasizes). Applied inside the
  // shared confidence score path.
  regimeScoreAdjustments?: Partial<Record<RegimeName, number>>;
  dailyTargetAtrMultiplier: number;
  dailyStopAtrMultiplier: number;
  defaultReviewHours: number;
  entryOffsetDefault: number;
  entryOffsetTrend: number;
  maxNewsPenalty: number;
  maxProviderPenalty: number;
  // Hard ceiling on stop distance in primary-ATR units. Structure may place
  // the stop nearer, never farther — risk stays on the review window's
  // timescale instead of the swing timescale.
  maxStopAtrMultiplier: number;
  minimumTargetRewardRisk: number;
  minRewardRisk: number;
  newsPenaltyPerEvent: number;
  providerWarningPenalty: number;
  // Runner ceiling as a share of the window's expected move
  // (dailyATR * sqrt(reviewHours/24)). Targets beyond what the window can
  // statistically deliver reject the setup instead of decorating it.
  runnerWindowShare: number;
  stopAtrMultiplier: number;
  timeframePenalty: number;
  tp1AtrMultiplier: number;
  // TP1 as a share of risk distance: the partial must be meaningful in R,
  // not a fixed ATR crumb against a multi-ATR stop.
  tp1RiskShare: number;
  volatilityTargetAtrMultiplier: number;
};

/**
 * The roster's classification, exported so laws about a CLASS can derive
 * their population from it rather than repeating a hand-picked list —
 * REFERENCE_SESSION_ANCHORS held one of six indices for exactly that reason
 * (2026-08-24). Read-only by convention; nothing mutates it.
 */
export const ASSET_TYPE_BY_SYMBOL: Record<AssetType, string[]> = {
  // The six grains. LE/GF/HE are deliberately NOT here: livestock produced 55
  // filled setups across all three markets and all history — not one confidence
  // bucket carries enough test fills to judge — so a livestock class could only
  // be hand-authored, which is the failure this whole exercise exists to avoid.
  // They stay in `futures` with their thinness as the stated reason, and remain
  // standing reentry candidates when more data exists.
  livestock: [
    "LEUSX",
    "GFUSX",
    "HEUSX",
  ],
  agriculture: [
    "ZCUSX",
    "ZSUSX",
    "ZLUSX",
    "ZMUSD",
    "ZOUSX",
    "ZRUSD",
  ],
  crypto: [
    "ADAUSD",
    "BCHUSD",
    "BNBUSD",
    "BTCUSD",
    "ETHUSD",
    "LTCUSD",
    "SOLUSD",
    "XRPUSD",
    // The Crypto account's other 25 (2026-08-06). Listed for the same reason
    // the nineteen futures are: getAssetType FALLS BACK TO "forex", so an
    // omission here would analyze Monero and Dogecoin with forex's threshold,
    // window, stop cap and 0.35 bps execution profile.
    "AAVEUSD",
    "ALGOUSD",
    "ARWUSD",
    "ATOMUSD",
    "AVAXUSD",
    "CAKEUSD",
    "DASHUSD",
    "DOGEUSD",
    "DOTUSD",
    "DYDXUSD",
    "EGLDUSD",
    "ETCUSD",
    "FILUSD",
    "GRTUSD",
    "HBARUSD",
    "IMXUSD",
    "LINKUSD",
    "NEARUSD",
    "THETAUSD",
    "TRUMPUSD",
    "TRXUSD",
    "UNIUSD",
    "XLMUSD",
    "XMRUSD",
    "XTZUSD",
  ],
  energies: ["BRENT", "WTI"],
  forex: [],
  futures: [
    "BZUSD",
    "CLUSD",
    "ESUSD",
    "GCUSD",
    "HGUSD",
    "MGCUSD",
    "NGUSD",
    "NQUSD",
    "RTYUSD",
    "SIUSD",
    "YMUSD",
    "ZBUSD",
    "ZNUSD",
    // The nineteen onboarded 2026-08-05. Listing them here is not cosmetic:
    // getAssetType FALLS BACK TO "forex" for any symbol it does not find, so
    // an unlisted futures contract would be analyzed with forex's threshold,
    // window, stop cap and 0.35 bps execution profile. Corn priced like a
    // currency pair is the same silent-default failure the absolute cost floor
    // was, and it is caught here rather than discovered in a sweep result.
    //
    // Grains and livestock sit in `futures` as an explicitly TEMPORARY
    // transport for their first sweep. Their measured character — minimum
    // spreads of 2-8 bps against ES's 0.32, CME day sessions rather than
    // near-24h, and daily limit moves index futures do not have — says they
    // belong in classes of their own. Those classes get created from the
    // sweep's own numbers; seeding them by hand would be inventing parameters.
    "ZFUSD",
    "ZTUSD",
    "HOUSD",
    "RBUSD",
    "PLUSD",
    "PAUSD",
    // FESX/FDAX/EMD/NKD/FDXM: dormant under amendment 32 (2026-08-09).
    "MES",
    "MNQ",
    "MYM",
    "QM",
    "QG",
    "XK",
    "XC",
  ],
  indices: ["ASX", "DAX", "DOW", "NIKKEI", "NSDQ", "SP"],
  metals: ["XAGUSD", "XAUUSD"],
};

const CALIBRATION: Record<AssetType, CategoryCalibration> = {
  // Livestock, derived 2026-08-06 — and built only after a refusal was
  // overturned. Two hours earlier this class was declined on the grounds that
  // 55 filled setups across all three markets could not calibrate anything, and
  // that was read as thin trading and thin FMP intraday. The starvation audit
  // (amendment 25, scripts/starvation-audit.ts) proved otherwise: livestock
  // reached the geometry stage 416 times and the LADDER REFUSED 396 of them, a
  // 5% survival rate against a healthy core running 73-99%. The data was there;
  // a 6-hour review window was throwing it away.
  //
  // Cattle and hogs trade a short CME session with no overnight, so
  // expectedWindowMove (dailyATR x sqrt(reviewHours/24)) is small at 6h while an
  // ATR-scaled stop is not. Risk overran the reachable band and the setup was
  // refused before it could have an outcome.
  //
  // DERIVED: defaultReviewHours 6 -> 24. Total R across both splits goes
  // +2.9/+1.4 to +32.4/+36.9 on 158 test setups against EIGHT, with planRejected
  // collapsing 474 -> 103. Per market at 24h: live cattle +0.244 (84% hit, 6%
  // stop), feeder cattle +0.237 (84%, 5%), lean hogs +0.222 (87%, 8%).
  //
  // 48h earns slightly more train R (+36.3) and less test (+33.5), and widening
  // the runner ceiling instead tops out lower (+32.4 at 2.0). The window is also
  // the lever that addresses the CAUSE — too little time — rather than widening
  // the target to compensate for it.
  //
  // Everything else is the configuration these numbers were measured under, and
  // is marked as such. Each is replaced when its own grid lands.
  livestock: {
    blockedRegimes: ["volatile_chop"],
    // DERIVED 2026-08-06 from the final 1,020,464-setup sweep at the shipped
    // geometry: derived floor, 42 test fills. No bucket in livestock's
    // 1,204-fill corpus reaches 100, so the sample guard cannot apply and the
    // derived floor stands.

    confidenceThreshold: 40,
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.38,
    // DERIVED 2026-08-06: 6 -> 24 hours. The single change that made this class
    // measurable at all.
    defaultReviewHours: 24,
    entryOffsetDefault: 0.58,
    entryOffsetTrend: 0.75,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    // DERIVED 2026-08-06, stop-cap grid over all 102 markets read by TOTAL R
    // across both splits. livestock: test R +1.4 -> +27.8, train +2.9 -> +19.3, on the 24h window.
    //
    // The mechanism is not a denominator trick. TP1 scales with risk, but the
    // runner is capped by the review window in ABSOLUTE terms — so a tighter
    // stop puts the runner further away IN R and winners pay more. Under
    // fixed-fractional sizing (position scales inversely with stop distance) a
    // 2R win is genuinely twice the dollars of a 1R win, so this is profit.
    // Confirmed on behaviour, not just totals: EURUSD's stop rate FALLS 6% -> 4%
    // and its setup count RISES 5947 -> 6259, because a nearer TP1 banks the
    // partial before the stop is reached.
    maxStopAtrMultiplier: 1.0,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.25,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    runnerWindowShare: 0.6,
    // Explicit at 1, which is EXACTLY what these markets already ran: the
    // value was absent from every class row and `?? 1` supplied it. Stating
    // it changes no number and makes the absence impossible. Deriving a
    // different value per class would be a model change, and the corpus that
    // could justify one is the invalid 4c/4d corpus.
    sizingHoursFactor: 1,
    stopAtrMultiplier: 1.3,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.4,
  },
  // Agriculture, derived 2026-08-06 from its own first sweep. The grains sat in
  // `futures` only as transport for that sweep; their measured character says
  // they do not belong there. Minimum spread from tick over price runs 1.5 bps
  // (soybean oil) to 7.9 (oats) against the E-mini S&P's 0.32, they trade a CME
  // day session rather than near-24h, and they carry daily limit moves index
  // futures do not have. Forcing them into a block calibrated on ES, GC and ZB
  // is the same category error that put oil under a doubled TP1 share.
  //
  // Measured: 6922 filled setups, 79% win, 9% stop, E=+0.205 — on par with
  // forex. Invisible to the engine before this.
  //
  // DERIVED here: confidenceThreshold, by monotone survival (test expectancy
  // positive at 30 and in every judgeable bucket above; 108 test fills at that
  // floor). Every other value is the configuration the +0.205 WAS MEASURED
  // UNDER — deliberately not a neighbour chosen by resemblance, but the exact
  // parameters that produced the recorded result, so preserving them preserves
  // the measurement. Each is replaced when its own grid lands, and each is
  // marked below.
  //
  // Session curve is recorded and deliberately NOT gated: worst UTC hours are
  // 20h +0.009, 21h +0.084, 22h +0.121, 23h +0.125, against 7h +0.260, 8h
  // +0.321, 9h +0.244 — the day session against the overnight book. All of them
  // are POSITIVE, so blocking any would forgo profit. A gate needs a negative
  // hour, not merely a weaker one.
  agriculture: {
    blockedRegimes: ["volatile_chop"],
    // HELD at 30 on 2026-08-06. The final sweep derives NO surviving floor:
    // test expectancy goes negative somewhere above every candidate (-0.003 at
    // 40, -0.053 at 90) across a 1,316-fill corpus. A floor cannot be derived
    // from that, so the standing value stays and the class waits for depth.
    confidenceThreshold: 30,
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.38,
    defaultReviewHours: 6,
    entryOffsetDefault: 0.58,
    entryOffsetTrend: 0.75,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    // DERIVED 2026-08-06, stop-cap grid over all 102 markets read by TOTAL R
    // across both splits. agriculture: test R +161 -> +194 (+20%), train +285 -> +374.
    //
    // The mechanism is not a denominator trick. TP1 scales with risk, but the
    // runner is capped by the review window in ABSOLUTE terms — so a tighter
    // stop puts the runner further away IN R and winners pay more. Under
    // fixed-fractional sizing (position scales inversely with stop distance) a
    // 2R win is genuinely twice the dollars of a 1R win, so this is profit.
    // Confirmed on behaviour, not just totals: EURUSD's stop rate FALLS 6% -> 4%
    // and its setup count RISES 5947 -> 6259, because a nearer TP1 banks the
    // partial before the stop is reached.
    maxStopAtrMultiplier: 1.0,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.25,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    // DERIVED 2026-08-06 at the NEW stop caps, and re-derived deliberately: the
    // first runner grid ran at the old caps, and tightening the stop shrinks
    // minimumTargetRewardRisk's absolute floor, which changes how many structural
    // levels qualify. The answer moved. agriculture: test R +56.6 -> +62.7 (train +154.5 -> +169.1).
    runnerWindowShare: 1.4,
    // Explicit at 1, which is EXACTLY what these markets already ran: the
    // value was absent from every class row and `?? 1` supplied it. Stating
    // it changes no number and makes the absence impossible. Deriving a
    // different value per class would be a model change, and the corpus that
    // could justify one is the invalid 4c/4d corpus.
    sizingHoursFactor: 1,
    stopAtrMultiplier: 1.3,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    // DERIVED 2026-08-06 as a validated null: every alternative loses total R on
    // both splits (0.3 -> +94.9/+22.2, 0.5 -> +88.9/+20.2, 0.6 -> +74.2/+10.8
    // against baseline +107.5/+23.8). Worth stating plainly because forex's
    // derived optimum is 0.3 and agriculture's is 0.4 — the classes genuinely
    // want different geometry, which is the whole case for separating them.
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.4,
  },
  crypto: {
    blockedRegimes: ["volatile_chop"],
    // DERIVED 2026-08-06 from the final 1,020,464-setup sweep at the shipped
    // geometry: derived floor 20 (32 test fills) raised one bucket to 25
    // (704). Test E 0.204 at 25 and positive in every judgeable bucket above.
    // THE SAMPLE GUARD (2026-08-06). Where the derived floor's own bucket
    // carries under 100 test fills AND a materially larger judgeable bucket
    // sits one step up, the floor moves up to it. Shipping a class-wide gate
    // off 32 fills is the fragility amendment 25 exists to prevent, and the
    // cost is nil: forex's band-15 bucket is 42 fills out of 452,565, so the
    // volume given up is under a hundredth of a percent. The guard only ever
    // TIGHTENS — raising the judgeable minimum outright would also silence
    // thin NEGATIVE buckets, which is how energies' floor would have fallen
    // from 85 to 75 by ignoring a -0.002 bucket on 69 fills.
    confidenceThreshold: 25,
    dailyStopAtrMultiplier: 0.16,
    dailyTargetAtrMultiplier: 0.42,
    defaultReviewHours: 12,
    entryOffsetDefault: 0.78,
    entryOffsetTrend: 0.8,
    maxNewsPenalty: 4,
    maxProviderPenalty: 8,
    // DERIVED 2026-08-06, stop-cap grid over all 102 markets read by TOTAL R
    // across both splits. crypto: test R +3627 -> +4375 (+21%), train +5869 -> +9178.
    //
    // The mechanism is not a denominator trick. TP1 scales with risk, but the
    // runner is capped by the review window in ABSOLUTE terms — so a tighter
    // stop puts the runner further away IN R and winners pay more. Under
    // fixed-fractional sizing (position scales inversely with stop distance) a
    // 2R win is genuinely twice the dollars of a 1R win, so this is profit.
    // Confirmed on behaviour, not just totals: EURUSD's stop rate FALLS 6% -> 4%
    // and its setup count RISES 5947 -> 6259, because a nearer TP1 banks the
    // partial before the stop is reached.
    maxStopAtrMultiplier: 1.0,
    minimumTargetRewardRisk: 1.7,
    minRewardRisk: 1.3,
    newsPenaltyPerEvent: 1,
    providerWarningPenalty: 3,
    // DERIVED 2026-08-06 at the NEW stop caps, and re-derived deliberately: the
    // first runner grid ran at the old caps, and tightening the stop shrinks
    // minimumTargetRewardRisk's absolute floor, which changes how many structural
    // levels qualify. The answer moved. crypto: test R +4375 -> +4377 (train +9178 -> +9604).
    runnerWindowShare: 1.0,
    // Explicit at 1, which is EXACTLY what these markets already ran: the
    // value was absent from every class row and `?? 1` supplied it. Stating
    // it changes no number and makes the absence impossible. Deriving a
    // different value per class would be a model change, and the corpus that
    // could justify one is the invalid 4c/4d corpus.
    sizingHoursFactor: 1,
    stopAtrMultiplier: 1.45,
    timeframePenalty: 6,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.8,
  },
  energies: {
    blockedRegimes: ["volatile_chop"],
    // DERIVED 2026-08-06 from the final 1,020,464-setup sweep at the shipped
    // geometry: derived floor, 122 test fills. Test E 0.308 at 85; band 80 is
    // -0.002 on 69 fills, which is what holds the floor this high.

    confidenceThreshold: 85,
    dailyStopAtrMultiplier: 0.16,
    dailyTargetAtrMultiplier: 0.42,
    defaultReviewHours: 6,
    entryOffsetDefault: 0.6,
    entryOffsetTrend: 0.48,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    // DERIVED 2026-08-06, stop-cap grid over all 102 markets read by TOTAL R
    // across both splits. energies: test R +58 -> +119 (+105%), train +70 -> +131.
    //
    // The mechanism is not a denominator trick. TP1 scales with risk, but the
    // runner is capped by the review window in ABSOLUTE terms — so a tighter
    // stop puts the runner further away IN R and winners pay more. Under
    // fixed-fractional sizing (position scales inversely with stop distance) a
    // 2R win is genuinely twice the dollars of a 1R win, so this is profit.
    // Confirmed on behaviour, not just totals: EURUSD's stop rate FALLS 6% -> 4%
    // and its setup count RISES 5947 -> 6259, because a nearer TP1 banks the
    // partial before the stop is reached.
    maxStopAtrMultiplier: 1.0,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.25,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    runnerWindowShare: 0.8,
    // Explicit at 1, which is EXACTLY what these markets already ran: the
    // value was absent from every class row and `?? 1` supplied it. Stating
    // it changes no number and makes the absence impossible. Deriving a
    // different value per class would be a model change, and the corpus that
    // could justify one is the invalid 4c/4d corpus.
    sizingHoursFactor: 1,
    stopAtrMultiplier: 1.38,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.8,
    volatilityTargetAtrMultiplier: 3.6,
  },
  forex: {
    blockedRegimes: ["volatile_chop"],
    // DERIVED 2026-08-06 from the final 1,020,464-setup sweep at the shipped
    // geometry: derived floor 15 (42 test fills) raised one bucket to 20 (479)
    // — see the sample guard below. Test E is 0.298 at 20 and positive in
    // every judgeable bucket above, to 0.317 at 95.
    // THE SAMPLE GUARD (2026-08-06). Where the derived floor's own bucket
    // carries under 100 test fills AND a materially larger judgeable bucket
    // sits one step up, the floor moves up to it. Shipping a class-wide gate
    // off 32 fills is the fragility amendment 25 exists to prevent, and the
    // cost is nil: forex's band-15 bucket is 42 fills out of 452,565, so the
    // volume given up is under a hundredth of a percent. The guard only ever
    // TIGHTENS — raising the judgeable minimum outright would also silence
    // thin NEGATIVE buckets, which is how energies' floor would have fallen
    // from 85 to 75 by ignoring a -0.002 bucket on 69 fills.
    confidenceThreshold: 20,
    // Sweep 2026-07-29 (2010-2026, both splits): sells outperformed buys
    // (train +0.042 vs +0.023, test +0.118 vs -0.010).
    sideScoreAdjustments: { buy: -6 },
    dailyStopAtrMultiplier: 0.12,
    dailyTargetAtrMultiplier: 0.35,
    defaultReviewHours: 8,
    entryOffsetDefault: 0.55,
    entryOffsetTrend: 0.55,
    maxNewsPenalty: 8,
    maxProviderPenalty: 6,
    // DERIVED 2026-08-06, stop-cap grid over all 102 markets read by TOTAL R
    // across both splits. forex: test R +30457 -> +49828 (+64%), train +56509 -> +80921.
    //
    // The mechanism is not a denominator trick. TP1 scales with risk, but the
    // runner is capped by the review window in ABSOLUTE terms — so a tighter
    // stop puts the runner further away IN R and winners pay more. Under
    // fixed-fractional sizing (position scales inversely with stop distance) a
    // 2R win is genuinely twice the dollars of a 1R win, so this is profit.
    // Confirmed on behaviour, not just totals: EURUSD's stop rate FALLS 6% -> 4%
    // and its setup count RISES 5947 -> 6259, because a nearer TP1 banks the
    // partial before the stop is reached.
    maxStopAtrMultiplier: 1.0,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.2,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 2,
    // DERIVED 2026-08-06 at the NEW stop caps, and re-derived deliberately: the
    // first runner grid ran at the old caps, and tightening the stop shrinks
    // minimumTargetRewardRisk's absolute floor, which changes how many structural
    // levels qualify. The answer moved. forex: test R +49828 -> +54316 (train +80921 -> +81236).
    runnerWindowShare: 1.0,
    // Explicit at 1, which is EXACTLY what these markets already ran: the
    // value was absent from every class row and `?? 1` supplied it. Stating
    // it changes no number and makes the absence impossible. Deriving a
    // different value per class would be a model change, and the corpus that
    // could justify one is the invalid 4c/4d corpus.
    sizingHoursFactor: 1,
    stopAtrMultiplier: 1.2,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.2,
  },
  futures: {
    blockedRegimes: ["volatile_chop"],
    // DERIVED 2026-08-06 from the final 1,020,464-setup sweep at the shipped
    // geometry: derived floor, 145 test fills. Test E 0.218 at 25 and positive
    // in every judgeable bucket above, to 0.288 at 85.

    confidenceThreshold: 25,
    // Sweep 2026-07-29: sells outperformed buys on both splits
    // (train -0.016 vs -0.035, test +0.110 vs +0.054).
    sideScoreAdjustments: { buy: -6 },
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.38,
    defaultReviewHours: 6,
    entryOffsetDefault: 0.58,
    entryOffsetTrend: 0.75,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    // DERIVED 2026-08-06, stop-cap grid over all 102 markets read by TOTAL R
    // across both splits. futures: test R +855 -> +1260 (+47%), train +987 -> +1497.
    //
    // The mechanism is not a denominator trick. TP1 scales with risk, but the
    // runner is capped by the review window in ABSOLUTE terms — so a tighter
    // stop puts the runner further away IN R and winners pay more. Under
    // fixed-fractional sizing (position scales inversely with stop distance) a
    // 2R win is genuinely twice the dollars of a 1R win, so this is profit.
    // Confirmed on behaviour, not just totals: EURUSD's stop rate FALLS 6% -> 4%
    // and its setup count RISES 5947 -> 6259, because a nearer TP1 banks the
    // partial before the stop is reached.
    maxStopAtrMultiplier: 1.0,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.25,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    // DERIVED 2026-08-06 at the NEW stop caps, and re-derived deliberately: the
    // first runner grid ran at the old caps, and tightening the stop shrinks
    // minimumTargetRewardRisk's absolute floor, which changes how many structural
    // levels qualify. The answer moved. futures: test R +1267 -> +1317 (train +1506 -> +1599).
    runnerWindowShare: 1.0,
    // Explicit at 1, which is EXACTLY what these markets already ran: the
    // value was absent from every class row and `?? 1` supplied it. Stating
    // it changes no number and makes the absence impossible. Deriving a
    // different value per class would be a model change, and the corpus that
    // could justify one is the invalid 4c/4d corpus.
    sizingHoursFactor: 1,
    stopAtrMultiplier: 1.3,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.4,
  },
  indices: {
    blockedRegimes: ["volatile_chop"],
    // HELD at 68 on 2026-08-06 under amendment 25. The final sweep derives 85,
    // and that derivation is REFUSED: this class is cash-only (SP NSDQ DOW
    // NIKKEI DAX ASX — the index FUTURES are in `futures`), and its geometry
    // stage rejects 55-70% of the decisions reaching it (DOW survives 30%, SP
    // 37%, NIKKEI 38%, NSDQ 38%, ASX 40%, DAX 45%). A starved sample yields no
    // verdict, favourable or otherwise.
    confidenceThreshold: 68,
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.36,
    // 5 -> 8 (round 28). Derived jointly with tp1RiskShare and the stop cap,
    // because those three could not be derived one at a time. The five-hour
    // window capped the runner so near that no plan could satisfy
    // minimumTargetRewardRisk against a TP1 required further out than the stop.
    defaultReviewHours: 8,
    // Deep limit offsets never filled on index cash sessions (0/15 in
    // production); entries must sit close to the market.
    entryOffsetDefault: 0.18,
    entryOffsetTrend: 0.12,
    maxNewsPenalty: 9,
    maxProviderPenalty: 7,
    // 3.0 -> 1.0 (round 28), which REVERSES a derivation from the day before
    // and is recorded rather than quietly replaced, because the reason it
    // reverses is the finding.
    //
    // 1.8 -> 3.0 was derived on 2026-08-06 and looked well-grounded: it improved
    // total R on both splits, NSDQ turned -0.081 -> +0.039, ASX -0.124 -> +0.028,
    // and provenance had PREDICTED it — indices were the one class where
    // structure-set stops (+0.048) beat cap-set (-0.135), so clipping to 1.8 ATR
    // read as putting the stop inside the ordinary noise of products that gap.
    //
    // It was measured with tp1RiskShare fixed at 1.2, and at 1.2 the partial sits
    // FURTHER OUT than the stop. So every widening of the cap pushed TP1 out with
    // it, and "wider is better" was the search climbing the wrong gradient: what
    // it kept finding was relief from a TP1 constraint, reported as a stop-cap
    // result. Once tp1RiskShare drops to 0.4 the wide stop stops paying, and 1.0
    // is better on both splits.
    //
    // The lesson is the one scripts/replay-sweep.ts's crossed grid now exists to
    // enforce: a lever downstream of risk cannot be derived at another lever's
    // old setting. Round 26 met this from the measurement side when the runner
    // grid had to be re-run after the caps moved. This is the same defect found
    // from the other side, one class later.
    maxStopAtrMultiplier: 1.0,
    minimumTargetRewardRisk: 1.5,
    minRewardRisk: 1.2,
    newsPenaltyPerEvent: 4,
    providerWarningPenalty: 3,
    // DERIVED 2026-08-06 at the NEW stop caps, and re-derived deliberately: the
    // first runner grid ran at the old caps, and tightening the stop shrinks
    // minimumTargetRewardRisk's absolute floor, which changes how many structural
    // levels qualify. The answer moved. indices: test R -5.6 -> +7.4 — POSITIVE ON BOTH SPLITS for the first time.
    runnerWindowShare: 1.0,
    // Explicit at 1, which is EXACTLY what these markets already ran: the
    // value was absent from every class row and `?? 1` supplied it. Stating
    // it changes no number and makes the absence impossible. Deriving a
    // different value per class would be a model change, and the corpus that
    // could justify one is the invalid 4c/4d corpus.
    sizingHoursFactor: 1,
    stopAtrMultiplier: 1.28,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.3,
    // ROUND 28 (2026-08-06) — the starvation was tp1RiskShare, and it is fixed.
    // Indices refused 63% of every decision reaching its geometry stage. A
    // 96-variant joint grid over stop cap x review window x runner ceiling x
    // minimumTargetRewardRisk moved survival by ONE point, from 37% to 38%, and
    // named the then-current setting as its own best combination. Four levers
    // ruled out — and a grid can be exhaustive over the wrong space and still
    // look rigorous.
    //
    // The cause was the one value left fixed: tp1RiskShare sat at 1.2 where
    // every other class runs 0.4-0.8. TP1 was required FURTHER out than the stop
    // itself, so at a 3.0 ATR stop the partial needed 3.6 ATR of room inside a
    // five-hour window. No plan could satisfy it, and the rejection surfaced as
    // planRejected — a counter that names no lever, which is why four grids
    // missed it.
    //
    //   survival 37% -> 96%   setups 512 -> 1421   train R +25.3 -> +38.2
    //   test R +7.4 -> +19.2
    //
    // Chosen over the marginally higher total-R variant at a 5-hour window
    // (train +42.7 / test +17.5, 93% survival) on the two figures that matter
    // more than the total: out-of-sample R is higher, and 96% means the sample
    // is no longer geometry-limited, which is the whole point of the exercise.
    // r12's "confidence does not rank outcomes" verdict was drawn on a sample
    // this defect had already reduced to a third of itself, and is now worth
    // re-asking.
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.3,
  },
  metals: {
    blockedRegimes: ["volatile_chop"],
    // DERIVED 2026-08-06 from the final 1,020,464-setup sweep at the shipped
    // geometry: derived floor, 101 test fills. Test E 0.185 at 30 and positive
    // in every judgeable bucket above.

    confidenceThreshold: 30,
    dailyStopAtrMultiplier: 0.14,
    dailyTargetAtrMultiplier: 0.4,
    defaultReviewHours: 8,
    entryOffsetDefault: 0.75,
    entryOffsetTrend: 0.78,
    maxNewsPenalty: 8,
    maxProviderPenalty: 7,
    // HELD at 1.6 — the one class that genuinely prefers a wider stop. At 1.0 its
    // test R improves (+127.1 -> +144.7) but train R DEGRADES (+112.1 -> +86.6),
    // so it fails the both-splits bar. Gold and silver run structural stops more
    // often than most (13% pivot) and clipping them nearer costs more than the
    // tighter risk unit returns.
    maxStopAtrMultiplier: 1.6,
    minimumTargetRewardRisk: 1.6,
    minRewardRisk: 1.25,
    newsPenaltyPerEvent: 3,
    providerWarningPenalty: 3,
    runnerWindowShare: 0.8,
    // Explicit at 1, which is EXACTLY what these markets already ran: the
    // value was absent from every class row and `?? 1` supplied it. Stating
    // it changes no number and makes the absence impossible. Deriving a
    // different value per class would be a model change, and the corpus that
    // could justify one is the invalid 4c/4d corpus.
    sizingHoursFactor: 1,
    stopAtrMultiplier: 1.32,
    timeframePenalty: 5,
    tp1AtrMultiplier: 0.5,
    tp1RiskShare: 0.4,
    volatilityTargetAtrMultiplier: 3.5,
  },
};

// Per-symbol adjustments layered over the class calibration. Sparse by
// design: an entry exists only where an asset's character diverges from its
// class and the replay sweep confirms the adjustment out-of-sample.
const SYMBOL_CALIBRATION_OVERRIDES: Record<
  string,
  Partial<CategoryCalibration>
> = {
  // NGUSD's override is REMOVED (2026-08-06). It read "natural gas runs far
  // hotter than the energy class baseline" and set maxStopAtrMultiplier 2.8 plus
  // a threshold of 70. It harmed gas three separate ways, all measured tonight:
  //
  //   1. The 2.8 stop doubled gas's risk distance, which is what made
  //      reward:risk structurally unreachable once the absolute cost floor was in
  //      play — 0 of 1689 setups could clear 1.25.
  //   2. Its own r13 comment recorded the symptom ("produced zero accepted
  //      setups ... currently inert and untestable") without recognising the
  //      override as the cause. An override cannot be validated by a corpus it
  //      is itself suppressing.
  //   3. It would have overridden this class's derived 1.0 and kept gas at 2.8
  //      after the class was fixed.
  //
  // At the class value gas is a good market: test expectancy +0.001 -> +0.265,
  // stop rate 27% -> 4%, setups 209 -> 357. The threshold override goes with it;
  // 70 was set against a suppressed sample and the class floor governs now.
  // Oil trends: earlier TP1 banking fails the test split for both oil
  // futures (r10), matching cash energies' rejection of 0.6 in r8.
  // BZUSD: round-10 banking geometry stays measured-active; the totality
  // cycle derived and confirmed the cell over it (unsizeable at smallest
  // accounts — the §19 governor states it per account at runtime).
  BZUSD: {
    tp1RiskShare: 0.6,
    runnerWindowShare: 0.8,
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  // Oats, derived 2026-08-06 from an 81-variant joint grid (round 28). It was
  // the one market of four re-gridded holdouts that a geometry change rescued:
  // at the agriculture class values it refused 56% of decisions reaching the
  // geometry stage and posted +0.001 train / -0.168 test, which read as a
  // market whose splits disagree. It was a market being asked for the wrong
  // shape.
  //
  //   survival 44% -> 69%   setups 473 -> 748   train R +0.3 -> +26.8
  //   test R -25.0 -> +12.9
  //
  // A 24-hour window is what the grain needs and it is not an outlier — the
  // same window is what made livestock measurable. Oats is the thinnest grain
  // contract E8 lists, so a five- or six-hour window asks a slow book for a
  // move it does not make; the wider stop then only works BECAUSE the window
  // gives the runner somewhere to go. Derived jointly for that reason.
  // ZOUSX: round 28's 24h window stays measured-active (it is what made
  // the grain measurable); the totality cycle derived and confirmed the
  // cell over its full span, replacing the round-28 cap.
  ZOUSX: {
    defaultReviewHours: 24,
    runnerWindowShare: 1.0,
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "hold",
    sizingHoursFactor: 3,
  },
  // ---- The 4d derived layer (2026-08-11). Thirty-nine markets, each
  // cell EXACTLY the variant that was frozen before the confirm fold's
  // one authorized read and confirmed positive on it (39 of 41; HOUSD
  // and RBUSD failed confirm and ship nothing). Derivation record:
  // docs/research/baseline-2026-08-10/4d-derivation-2026-08-11.md; the
  // artifact pins in tests/calibrationState.test.ts hold this table to
  // the JSON record in both directions. CLUSD's cell merges OVER its
  // measured-active legacy fields (tp1RiskShare/runnerWindowShare were
  // live in every corpus cell, so the confirmed delta sits on top of
  // them); capacity-gated, measure-only, starved and held-out markets
  // deliberately have no entry here.
  //
  // ---- The totality tranche (2026-08-11, owner mandate: data limits may
  // not be ambiguous). Folds re-cut per MARKET over each market's own
  // measured span with exact per-row leak containment — which un-starved
  // all 22 calendar-starved markets and gave every remaining market a
  // full-span verdict. 22 more cells confirmed (XAGUSD, DAX, ZB/ZN, ZOUSX
  // and BZUSD among them; ZOUSX/BZUSD merge OVER their measured-active
  // legacy fields); 5 refused on full-span confirm (ALGO/ARW/AVAX/NEAR/
  // ZR); 18 measure-only on full-span data. Capacity is DISCLOSURE per
  // line in the artifacts — the §19 governor refuses per account at
  // runtime. Record: 4d-derivation doc's totality addendum +
  // 4d-totality-*.json.
  AAVEUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  BNBUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "hold",
    sizingHoursFactor: 3,
  },

  CAKEUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "hold",
    sizingHoursFactor: 1,
  },
  DASHUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  DAX: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  DOGEUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 2.5,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  EGLDUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  ETCUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  GRTUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  HBARUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 2.5,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  IMXUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "hold",
    sizingHoursFactor: 1,
  },
  LINKUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 2.5,
    runnerProtection: "hold",
    sizingHoursFactor: 3,
  },
  PAUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 1,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  SOLUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  UNIUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 2.5,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  XAGUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  XLMUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 2.5,
    runnerProtection: "hold",
    sizingHoursFactor: 3,
  },
  XMRUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  ZBUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  ZNUSD: {
    // Capacity: no line sizes this at its smallest account; the §19
    // governor states it per account at runtime.
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },

  // ---- The holdout tranche (2026-08-11, owner word): the twenty
  // markets the read-time stratification kept out of every 4c/4d tuning
  // aggregate ran the SAME pipeline on their own untouched rows — derive
  // on fit+select, feasibility from published venue arithmetic, picks
  // frozen, then their confirm rows' first consultation (the corpus
  // log's acknowledged second read). Eleven of eleven frozen picks
  // confirmed positive — a perfect out-of-sample sweep on markets no
  // tuning step ever saw, EURUSD among them. The other nine were, AT
  // THIS TRANCHE, capacity-gated (BZUSD/DASH/XLM/XMR), measure-only
  // (BNBUSD) or starved (AAVEUSD/ARWUSD/HEUSX/THETAUSD). The totality
  // tranche above re-derived all nine on their own full spans: SIX
  // earned confirmed cells there (AAVEUSD, BNBUSD, BZUSD, DASHUSD,
  // XLMUSD, XMRUSD — BNB's is the r16 owner gate, answered by
  // measurement at last), ARWUSD was confirm-refused, and HEUSX and
  // THETAUSD hold full-span measure-only verdicts. Record:
  // 4d-derivation-2026-08-11.md's holdout + totality addenda and the
  // 4d-holdout-*.json / 4d-totality-*.json artifacts.
  AUDCHF: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  AUDNZD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  EURUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  GBPCAD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  NGUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  NSDQ: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  NZDCHF: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  NZDJPY: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  RTYUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  YMUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  ZMUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 2.5,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  ADAUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  AUDCAD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  AUDJPY: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  AUDUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  BCHUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  BTCUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  CADCHF: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  CADJPY: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  CHFJPY: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  CLUSD: {
    tp1RiskShare: 0.6,
    runnerWindowShare: 0.8,
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  ESUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  ETHUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  EURAUD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  EURCAD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  EURCHF: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  EURGBP: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  EURJPY: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  EURNZD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  GBPAUD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  GBPCHF: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  GBPJPY: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  GBPNZD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  GBPUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  GCUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  HGUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  LTCUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  NQUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  NZDCAD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  NZDUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  SIUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  SP: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "hold",
    sizingHoursFactor: 3,
  },
  USDCAD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  USDCHF: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  USDJPY: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  WTI: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
  XAUUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  XRPUSD: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  ZCUSX: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 3,
  },
  ZLUSX: {
    confidenceThreshold: 0,
    maxStopAtrMultiplier: 4,
    runnerProtection: "trail_tp1",
    sizingHoursFactor: 1,
  },
};

/**
 * Markets the ENGINE declines to build a setup for (amendment 36, the
 * roster law's own mechanism).
 *
 * The 2026-08-07 roster ruling settles what a losing market means:
 * "Expectancy is not a ground [for hiding]. A thin or negative market is
 * one the ENGINE declines to produce a setup for, and one per-market
 * geometry has to earn; it is not a market the product hides." So these
 * markets stay in the menu, stay scannable, and stay in every coverage
 * count under amendment 31 — the scan simply returns no setup, with the
 * measured reason, instead of offering one the engine's own corpus says
 * loses money.
 *
 * CORRECTION 2026-08-11: the second half of that rule was never
 * actually tested. LEVELFLOW_MODELED_COST_SCALE scaled
 * estimatedRoundTripCost, which the resolver never reads — the fills are
 * handed estimatedSpread and estimatedSlippage directly (sweep.ts), so
 * the "published bill only" run removed nothing from realized R and
 * differed from the full-cost run only by admitting more setups through
 * the payoff gate. Eleven of the twenty rows came back bit-identical,
 * which was the proof it did nothing rather than the agreement it was
 * read as. Amendment 36's standard is therefore UNMET for this register.
 *
 * These entries stand for now on the conservative reading only: the
 * corpus's clock defect (docs/research/) INFLATES measured expectancy,
 * so a market measured negative under it is very unlikely to be positive
 * under a correct measurement. They are re-decided — kept or restored —
 * the moment a valid corpus exists. Entry originally required: a
 * negative expectancy on the held-back fold at the market's own derived
 * cell. The register is generated from 4d-cost-sensitivity.json and
 * pinned against it in both directions.
 *
 * Every entry is a standing reentry candidate: accrued data that turns
 * the measurement positive returns the market, exactly as the dormant
 * register is re-probed each run.
 */
export type EngineDecline = {
  measuredExpectancyR: number;
  reason: string;
  reprobe: string;
};

export const ENGINE_DECLINED_MARKETS: Record<string, EngineDecline> = {
  AAVEUSD: {
    measuredExpectancyR: -0.120,
    reason:
      "measured -0.120R per setup (±0.028, n=571) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  CAKEUSD: {
    measuredExpectancyR: -0.218,
    reason:
      "measured -0.218R per setup (±0.054, n=264) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  DASHUSD: {
    measuredExpectancyR: -0.124,
    reason:
      "measured -0.124R per setup (±0.025, n=799) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  DOGEUSD: {
    measuredExpectancyR: -0.161,
    reason:
      "measured -0.161R per setup (±0.024, n=815) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  EGLDUSD: {
    measuredExpectancyR: -0.368,
    reason:
      "measured -0.368R per setup (±0.033, n=491) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  ETCUSD: {
    measuredExpectancyR: -0.163,
    reason:
      "measured -0.163R per setup (±0.024, n=880) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  GRTUSD: {
    measuredExpectancyR: -0.077,
    reason:
      "measured -0.077R per setup (±0.029, n=584) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  HBARUSD: {
    measuredExpectancyR: -0.161,
    reason:
      "measured -0.161R per setup (±0.037, n=391) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  IMXUSD: {
    measuredExpectancyR: -0.108,
    reason:
      "measured -0.108R per setup (±0.039, n=497) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  LTCUSD: {
    measuredExpectancyR: -0.115,
    reason:
      "measured -0.115R per setup (±0.017, n=1388) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  PAUSD: {
    measuredExpectancyR: -0.149,
    reason:
      "measured -0.149R per setup (±0.072, n=147) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  UNIUSD: {
    measuredExpectancyR: -0.098,
    reason:
      "measured -0.098R per setup (±0.028, n=588) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  XLMUSD: {
    measuredExpectancyR: -0.108,
    reason:
      "measured -0.108R per setup (±0.029, n=855) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  XMRUSD: {
    measuredExpectancyR: -0.095,
    reason:
      "measured -0.095R per setup (±0.024, n=803) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
  ZCUSX: {
    measuredExpectancyR: -0.208,
    reason:
      "measured -0.208R per setup (±0.065, n=127) on data held back from every tuning step, under the FULL modeled cost (spread + slippage + commission) — see the 2026-08-11 correction: the published-bill-only test that this line once claimed did not reach the resolver and measured nothing",
    reprobe:
      "It stays under analysis and returns if the measurement turns positive.",
  },
};

export function engineDeclines(symbol: string): EngineDecline | null {
  return ENGINE_DECLINED_MARKETS[symbol.toUpperCase()] ?? null;
}

/**
 * The one operator-facing sentence for a declined market.
 *
 * ONE definition because it now has two callers — `explainNoSetup` writes it
 * into `analysisDiagnostics`, and `reviewCurrentMarket` writes it into
 * `reason`, which is the only channel that survives BOTH candidate rebuilds
 * (`index.ts` scanOpportunity and `AdvisorWorkspace` setAnalysisState). Two
 * literals would drift and the coupling test in `tests/reviewCopyCoupling`
 * only extracts what the analyzer actually emits.
 *
 * WHAT IT NO LONGER CLAIMS. It used to end "...is negative after the venue's
 * published costs." That clause was false and this file's own header says so:
 * amendment 36's standard is UNMET for this register, and each entry's
 * `reason` records that the published-bill-only test "did not reach the
 * resolver and measured nothing" (`docs/research/remediation-program-2026-08-11.md`,
 * "the sentence shipped on all fifteen was false"). The engine's internal
 * record was corrected on 2026-08-11; the sentence the operator reads was not,
 * so the register and the screen disagreed for nineteen days.
 *
 * What survives is what the corpus supports: the record is negative. The
 * MAGNITUDE stays withheld (SC-5) because every `measuredExpectancyR` here
 * comes from the corpus the clock defect invalidated, and the DIRECTION
 * survives that defect only because the defect inflates expectancy — a market
 * measured negative under it is very unlikely to be positive under a correct
 * measurement. The reprobe carries the way back in.
 */
export function engineDeclineSentence(decline: EngineDecline): string {
  return "Levelflow does not produce setups for this market: its own " +
    `measured record is negative. ${decline.reprobe}`.trimEnd();
}

/**
 * True when the symbol is a Levelflow roster name — the measurement paths
 * (sweep driver, fold-spec deriver) REFUSE unknown symbols instead of
 * inheriting getAssetType's forex fallback: that silent fallback is how
 * six index CFDs, two coins and WTI ran a whole baseline under forex
 * calibration, sessions and costs (round-8 CV-1/LA-11/FR-2). The class
 * lists alone cannot answer this — forex is the fallthrough class with
 * no explicit list — so the roster (symbolMap) is the authority and the
 * class map only refines. The live analyzer keeps the fallback; anything
 * that MEASURES must name its universe exactly.
 */
export function hasKnownAssetType(symbol: string): boolean {
  return isKnownSymbol(symbol);
}

export function getAssetType(symbol: string): AssetType {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ASSET_TYPE_BY_SYMBOL.agriculture.includes(normalized)) {
    return "agriculture";
  }
  if (ASSET_TYPE_BY_SYMBOL.livestock.includes(normalized)) {
    return "livestock";
  }
  if (ASSET_TYPE_BY_SYMBOL.crypto.includes(normalized)) {
    return "crypto";
  }
  if (ASSET_TYPE_BY_SYMBOL.metals.includes(normalized)) {
    return "metals";
  }
  if (ASSET_TYPE_BY_SYMBOL.energies.includes(normalized)) {
    return "energies";
  }
  if (ASSET_TYPE_BY_SYMBOL.indices.includes(normalized)) {
    return "indices";
  }
  if (ASSET_TYPE_BY_SYMBOL.futures.includes(normalized)) {
    return "futures";
  }
  return "forex";
}

/**
 * The CLASS row alone, before any per-symbol layer — what the frozen
 * class-state pins assert, independent of which members carry derived
 * cells (4d, 2026-08-11).
 */
export function getClassCalibration(assetType: AssetType): CategoryCalibration {
  return CALIBRATION[assetType];
}

/**
 * The per-symbol layer ALONE — what was authored for this market rather than
 * applied to it. `getCategoryCalibration` merges this over the class row and
 * returns one flat object, and a merge cannot be un-merged.
 *
 * An accessor rather than the bare record, because the lookup key is
 * NORMALIZED and today's roster hides that. All 97 engine symbols are
 * alphanumeric — `^GSPC` is a PROVIDER symbol and never a key here — so a
 * caller indexing the record raw reads correctly, and would keep reading
 * correctly right up until the first market whose engine symbol carries
 * punctuation, where it would silently report "no override" for a market
 * that has one. The normalization lives here once so no caller can drift
 * from it.
 */
export function getSymbolCalibrationOverride(
  symbol: string,
): Partial<CategoryCalibration> {
  return SYMBOL_CALIBRATION_OVERRIDES[
    symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
  ] ?? {};
}

export function getCategoryCalibration(symbol: string): CategoryCalibration {
  const normalized = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const base = CALIBRATION[getAssetType(symbol)];
  const override = SYMBOL_CALIBRATION_OVERRIDES[normalized];
  return override ? { ...base, ...override } : base;
}
