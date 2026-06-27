# LevelFlow Gap Analysis

Last reviewed: 2026-06-27

## Current Strengths

- The Advisor and Market Scan paths share the same setup engine, so scan setups and direct market reviews use the same market logic.
- The analyzer only returns limit setups and clears stale active setups when a fresh review no longer qualifies.
- The Advisor now clears stale UI state on market changes and uses the latest selected market when a review is requested.
- The visible asset list is intentionally limited to verified categories and sorted consistently by category, base, then quote.
- Outcome tracking and global learning are shared across users through `strategy_weightings_global`, not isolated to individual users.
- Server-only market data and analysis keep provider keys out of browser JavaScript.
- Runtime schema and code now use provider-neutral market symbol naming.
- Outcome replay, category calibration, candle caching, market-data health snapshots, analyzer event telemetry, and setup-only persistence are now part of the core backend.
- Spread, slippage, execution quality, gross payoff, and effective payoff are included before a setup can pass review.
- Same-candle target/stop ambiguity now reduces global learning weight before it can adjust future confidence.

## Recently Closed

- Historical replay coverage now verifies target, stop, no-fill expiry, and same-candle ambiguous outcomes through the shared replay module.
- Forex, crypto, futures, and metals now use category-specific thresholds, payoff floors, news/provider penalties, ATR construction, and review windows.
- FMP candle requests are cached briefly inside the analyzer Edge Function to reduce duplicate scan latency and provider pressure.
- `market_data_health` persists symbol-level provider health, available timeframes, candle counts, latest bar time, and warnings.
- `analyzer_events` captures structured backend events for blocked reviews, scan failures, provider errors, slow FMP calls, cache hits, and successful reviews.
- Legacy `pending_orders` persistence is consolidated into `trade_setups`; the app records setups and outcomes, not executable orders.
- Market Scan now has group and quality filters, compact ranking cards, and short rationale previews.
- The largest Advisor workspace file was reduced by moving Market Scan into a focused component. The analyzer also now keeps execution-quality and learning math in focused pure modules.
- CI now includes source-level analyzer abuse checks and a production security-header gate.
- Profile now includes a data-backed review pattern card, so it shows useful user activity instead of static repetition.
- Donation URLs from deployment variables are sanitized to HTTPS-only external links before they can render.
- Advisor copy now distinguishes verified chart-feed data from live execution data and describes trading-cost impact in plainer language.

## Gaps to Close

### Trade Review Logic

- Add a fuller execution-quality model once broker-specific spread data is available. The current model estimates spread and slippage from asset class, price, and volatility, but it does not yet consume live bid/ask spreads.
- Add scan-level correlation context. The current scan checks existing active correlated setups, but the UI should eventually explain when multiple top setups are tightly related.

### Front End

- Continue tightening review copy as more real usage comes in. The no-setup state now shows a primary reason and limited detail, but real-user sessions will reveal which phrases still feel too technical.
- Add richer chart tools only where Lightweight Charts supports them cleanly. Current zoom, scroll, reset, scale, crosshair, OHLC, and setup lines are present; full TradingView-style drawing tools would require either a different charting product or custom drawing overlays.
- Split the largest UI file into focused panels. `src/App.tsx` is doing shell, history, insights, guide, about, profile, and utility work in one file.
- Persist the user’s preferred default tab or last workspace section if real usage shows traders routinely start outside Advisor.

### Back End

- Continue splitting the analyzer Edge Function. Calibration, replay, execution quality, and learning math are separated now; strategy votes, market loading, and Supabase persistence should be split next.
- Add a small internal operations view for `market_data_health` and `analyzer_events` once there is enough live data to make it useful.

### Security and Reliability

- Add database migration execution to the deployment pipeline or document a required manual release step for every schema change.
- Add authenticated E2E secrets to local or CI environments where full signed-in browser tests should run. The test entrypoint is present and skips cleanly without those credentials.
- Add rate-limit and abuse tests for analyzer actions, especially Market Scan.
- Expand abuse tests from source-level checks to live authenticated request bursts against a disposable test user.
- Add a recurring dependency and bundle-size review so package drift does not quietly weaken performance or security.

## Priority Order

1. Add broker-specific bid/ask spread inputs when available from the upgraded data plan.
2. Add scan-level correlation explanations for clustered opportunities.
3. Split strategy votes, data loading, and persistence into dedicated analyzer modules.
4. Split `src/App.tsx` into shell, insights, guide, about, and profile modules.
5. Add deployment automation for Supabase migrations.
6. Add live authenticated abuse tests against a disposable test user.
7. Add recurring dependency and bundle-size review to the release checklist.
