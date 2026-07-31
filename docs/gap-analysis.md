# Levelflow Gap Analysis

> **Historical document (2026-07-02).** Superseded by the window-feasible
> rebuild, the 23-round calibration arc, and the visual overhaul — see
> [trade-model.md](/docs/trade-model.md) for the current engine state.
> Kept for provenance; do not act on its backlog.

Last reviewed: 2026-07-02

## Current Strengths

- The Advisor and Market Scan paths share the same setup engine, so scan setups
  and direct market reviews use the same market logic.
- The analyzer only returns limit setups and clears stale active setups when a
  fresh review no longer qualifies.
- The Advisor now clears stale UI state on market changes and uses the latest
  selected market when a review is requested.
- The visible asset list is intentionally limited to verified categories and
  sorted consistently by category, base, then quote.
- Outcome tracking and global learning are shared across users through
  `strategy_weightings_global`, not isolated to individual users.
- Server-only market data and analysis keep provider keys out of browser
  JavaScript.
- Runtime schema and code now use provider-neutral market symbol naming.
- Outcome replay, category calibration, candle caching, market-data health
  snapshots, analyzer event telemetry, and setup-only persistence are now part
  of the core backend.
- Spread, slippage, execution quality, gross payoff, and effective payoff are
  included before a setup can pass review.
- When FMP returns a usable bid/ask quote, execution quality uses that live
  spread before falling back to modeled spread estimates.
- Same-candle target/stop ambiguity now reduces global learning weight before it
  can adjust future confidence.
- Futures setups now apply contract-specific tick-size rounding and minimum
  tick-distance checks before execution quality and confidence are calculated.
- Spot metals now use a dedicated metals session label and maintenance-window
  handling instead of falling through to generic FX or futures wording.
- Strategy votes now use conservative category profiles, so crypto, energies,
  forex, futures, indices, and metals emphasize the same review lenses
  differently before the final confidence, payoff, timing, and execution
  checks.
- FMP economic calendar, earnings calendar, and targeted market headlines now
  contribute to timing risk. Scheduled high-impact events can block setups;
  medium events and recent market-moving headlines reduce confidence.
- FMP Treasury-rate data now contributes to setup quality as a small macro
  confluence check for USD pairs, metals, indices, crypto, and Treasury
  futures.

## Recently Closed

- Historical replay coverage now verifies target, stop, no-fill expiry, and
  same-candle ambiguous outcomes through the shared replay module.
- Forex, crypto, energies, futures, indices, and metals now use
  category-specific thresholds, payoff floors, news/provider penalties, ATR
  construction, and review windows.
- FMP candle requests are cached briefly inside the analyzer Edge Function to
  reduce duplicate scan latency and provider pressure.
- Analyzer market loading is now isolated in `marketLoader.ts`, including FMP
  candle/quote fetches, candle caching, primary timeframe selection, and
  market-data telemetry.
- Analyzer price construction is now isolated in `pricePlan.ts`, and targets now
  choose the nearest qualifying objective after the payoff floor instead of the
  farthest possible objective.
- `market_data_health` persists symbol-level provider health, available
  timeframes, candle counts, latest bar time, and warnings.
- `analyzer_events` captures structured backend events for blocked reviews, scan
  failures, provider errors, slow FMP calls, cache hits, and successful reviews.
- Legacy `pending_orders` persistence is consolidated into `trade_setups`; the
  app records setups and outcomes, not executable orders.
- Market Scan now has group and quality filters, compact ranking cards, and
  short rationale previews.
- Market Scan candidates now include closely linked market context so overlapping
  opportunities are easier to interpret without treating whole asset categories
  as one trade.
- The largest Advisor workspace file was reduced by moving Market Scan and
  setup-quality receipts into focused components. The analyzer also now keeps
  strategy voting, indicators, symbol routing, market loading, price planning,
  execution quality, Supabase persistence, and learning math in focused modules.
- Profile and theme controls are split out of the top-level app shell, and FMP
  quote parsing is isolated for test coverage.
- Donate is split out of the top-level app shell, and returning users resume
  from their last primary workspace tab.
- Guide, About, and Insights are split out of the top-level app shell; `App.tsx`
  now owns shell, auth, navigation, and workspace orchestration instead of full
  panel rendering.
- Analyzer session rules are split into a focused module with deterministic
  coverage for crypto, forex, futures, and spot metals.
- CI now includes source-level analyzer abuse checks, explicit deploy
  permissions, deploy concurrency, a job timeout, and a production
  security-header gate.
- CI now verifies migration files, can apply remote Supabase migrations when
  `SUPABASE_DB_PASSWORD` is configured, audits high-severity dependencies, and
  enforces a bundle-size budget after production build.
- Live authenticated E2E coverage now checks that repeated analyzer scan
  requests are rate-limited without server errors when CI test-user secrets are
  present.
- Profile now includes a data-backed review pattern card, so it shows useful
  user activity instead of static repetition.
- Donation URLs from deployment variables are sanitized to HTTPS-only external
  links before they can render.
- Advisor copy now distinguishes verified chart-feed data from live execution
  data, describes trading-cost impact in plainer language, and avoids raw
  internal strategy scores in the setup receipt.
- Analyzer Supabase persistence, auth lookup, admin REST calls, RPC calls, and
  fetch timeouts are isolated in `supabaseRest.ts`.
- History filtering, grouping, confidence-band math, and setup cards are split
  out of `HistoryPanel.tsx` with test coverage for shared asset ordering and
  status grouping.
- Advisor recommendation display, market status cards, session clocks, recent
  activity, and shared formatting are now split out of `AdvisorWorkspace.tsx`,
  leaving the workspace focused on orchestration, data loading, and user
  actions.
- Analyzer HTTP response handling and telemetry/data-health recording are now
  split out of the Edge Function entrypoint, keeping request routing separate
  from cross-cutting infrastructure.
- FMP Ultimate support now adds 1-minute and 5-minute charting, wider bounded
  historical lookbacks, lower-timeframe execution freshness in the analyzer,
  15-minute timing-window analysis, and authenticated E2E coverage for
  one-minute chart loading.
- FMP Ultimate macro support now adds Treasury-rate context to the same shared
  scoring path used by direct Advisor review and Market Scan.
- FMP Ultimate symbol verification now enables Indices and Energies, expands
  usable futures coverage, and keeps empty FMP futures symbols out of the
  public selector.
- Advisor and Guide copy now separate chart view from setup review intervals,
  and setup cards use a plain Valid until timestamp for the current review
  window.

## Gaps to Close

### Trade Review Logic

- Add broker-specific execution data if a supported broker integration becomes
  available. Current execution quality can consume FMP bid/ask spreads when
  present and otherwise uses modeled spread/slippage.

### Front End

- Continue tightening review copy as more real usage comes in. The no-setup
  state now shows a primary reason and limited detail, but real-user sessions
  will reveal which phrases still feel too technical.
- Add richer chart tools only where Lightweight Charts supports them cleanly.
  Current zoom, scroll, reset, scale, crosshair, OHLC, and setup lines are
  present; full TradingView-style drawing tools would require either a different
  charting product or custom drawing overlays.
- Continue splitting heavy workspace panels where doing so clarifies ownership.
  The app shell, Advisor workspace, and History workspace have been reduced
  meaningfully; future splits should target only areas that improve
  reviewability or test coverage.

### Back End

- Continue splitting the analyzer Edge Function where it improves reviewability.
  Calibration, strategy voting, indicators, replay, market loading, price
  planning, execution quality, quote parsing, learning math, session rules,
  futures contract rules, Supabase persistence, strategy profiles, and symbol
  routing are separated now.
- Add a small internal operations view for `market_data_health` and
  `analyzer_events` once there is enough live data to make it useful.

### Security and Reliability

- `SUPABASE_DB_PASSWORD` is a required deploy secret. Every deploy verifies
  migration files, then applies them with `supabase db push` before Edge
  Functions deploy.
- Keep local authenticated E2E optional. CI has the dedicated test-user secrets;
  local runs skip signed-in tests unless those variables are set in the shell.
- Expand live abuse tests beyond Market Scan if new analyzer actions are
  introduced.
- Tighten bundle budgets as more panels are split and lazy-loaded.

## Priority Order

1. Add a small internal operations view after enough `market_data_health` and
   `analyzer_events` data exists.
2. Add broker-specific execution data if a supported integration becomes
   available.
3. Tighten bundle budgets as additional code-splitting lands.
