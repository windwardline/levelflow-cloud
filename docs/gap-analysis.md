# LevelFlow Gap Analysis

Last reviewed: 2026-06-24

## Current Strengths

- The Advisor and Market Scan paths share the same setup engine, so scan ideas and direct market reviews use the same market logic.
- The analyzer only returns limit ideas and clears stale active ideas when a fresh review no longer qualifies.
- The Advisor now clears stale UI state on market changes and uses the latest selected market when a review is requested.
- The visible asset list is intentionally limited to verified categories and sorted consistently by category, base, then quote.
- Outcome tracking and global learning are shared across users through `strategy_weightings_global`, not isolated to individual users.
- Server-only market data and analysis keep provider keys out of browser JavaScript.
- Runtime schema and code now use provider-neutral market symbol naming.
- Outcome replay, category calibration, candle caching, market-data health snapshots, analyzer event telemetry, and setup-only persistence are now part of the core backend.

## Recently Closed

- Historical replay coverage now verifies target, stop, no-fill expiry, and same-candle ambiguous outcomes through the shared replay module.
- Forex, crypto, futures, and metals now use category-specific thresholds, payoff floors, news/provider penalties, ATR construction, and review windows.
- FMP candle requests are cached briefly inside the analyzer Edge Function to reduce duplicate scan latency and provider pressure.
- `market_data_health` persists symbol-level provider health, available timeframes, candle counts, latest bar time, and warnings.
- `analyzer_events` captures structured backend events for blocked reviews, scan failures, provider errors, slow FMP calls, cache hits, and successful reviews.
- Legacy `pending_orders` persistence is consolidated into `trade_setups`; the app records ideas and outcomes, not executable orders.

## Gaps to Close

### Trade Review Logic

- Add a spread and execution-quality model. Current outcomes use candle high/low paths and do not model spread, slippage, partial touches, or real execution availability.
- Improve same-candle outcome handling. When stop and target both touch in one candle, LevelFlow correctly marks it as needing review, but those cases should be excluded from learning weight updates or weighted more conservatively.
- Add scan-level correlation context. The current scan checks existing active correlated ideas, but the UI should eventually explain when multiple top ideas are tightly related.

### Front End

- Expand Market Scan from a ranked list into a decision surface with category filters, confidence bands, and a clear “why this market ranked here” preview.
- Continue tightening review copy as more real usage comes in. The no-idea state now shows a primary reason and limited detail, but real-user sessions will reveal which phrases still feel too technical.
- Add richer chart tools only where Lightweight Charts supports them cleanly. Current zoom, scroll, reset, scale, crosshair, OHLC, and setup lines are present; full TradingView-style drawing tools would require either a different charting product or custom drawing overlays.
- Split the largest UI file into focused panels. `src/App.tsx` is doing shell, history, insights, guide, about, profile, and utility work in one file.

### Back End

- Continue splitting the analyzer Edge Function. Calibration and replay are separated now; strategy votes, market loading, and Supabase persistence should be split next.
- Add a small internal operations view for `market_data_health` and `analyzer_events` once there is enough live data to make it useful.

### Security and Reliability

- Add database migration execution to the deployment pipeline or document a required manual release step for every schema change.
- Add authenticated E2E secrets to local or CI environments where full signed-in browser tests should run. The test entrypoint is present and skips cleanly without those credentials.
- Add rate-limit and abuse tests for analyzer actions, especially Market Scan.
- Add CSP regression checks so Cloudflare header changes do not silently weaken the deployed app.

## Priority Order

1. Add a spread/execution-quality model before using outcome data for stronger learning adjustments.
2. Weight same-candle ambiguous outcomes more conservatively in global learning.
3. Expand Market Scan into a decision surface with category filters and short rationale previews.
4. Split strategy votes, data loading, and persistence into dedicated analyzer modules.
5. Add deployment automation for Supabase migrations.
6. Add CSP and analyzer abuse tests to CI.
