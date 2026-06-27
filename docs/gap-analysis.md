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
- When FMP returns a usable bid/ask quote, execution quality uses that live spread before falling back to modeled spread estimates.
- Same-candle target/stop ambiguity now reduces global learning weight before it can adjust future confidence.

## Recently Closed

- Historical replay coverage now verifies target, stop, no-fill expiry, and same-candle ambiguous outcomes through the shared replay module.
- Forex, crypto, futures, and metals now use category-specific thresholds, payoff floors, news/provider penalties, ATR construction, and review windows.
- FMP candle requests are cached briefly inside the analyzer Edge Function to reduce duplicate scan latency and provider pressure.
- `market_data_health` persists symbol-level provider health, available timeframes, candle counts, latest bar time, and warnings.
- `analyzer_events` captures structured backend events for blocked reviews, scan failures, provider errors, slow FMP calls, cache hits, and successful reviews.
- Legacy `pending_orders` persistence is consolidated into `trade_setups`; the app records setups and outcomes, not executable orders.
- Market Scan now has group and quality filters, compact ranking cards, and short rationale previews.
- Market Scan candidates now include related-market context so clustered opportunities are easier to interpret.
- The largest Advisor workspace file was reduced by moving Market Scan into a focused component. The analyzer also now keeps execution-quality and learning math in focused pure modules.
- Profile and theme controls are split out of the top-level app shell, and FMP quote parsing is isolated for test coverage.
- CI now includes source-level analyzer abuse checks and a production security-header gate.
- CI now verifies migration files, can apply remote Supabase migrations when `SUPABASE_DB_PASSWORD` is configured, audits high-severity dependencies, and enforces a bundle-size budget after production build.
- Live authenticated E2E coverage now checks that repeated analyzer scan requests are rate-limited without server errors when CI test-user secrets are present.
- Profile now includes a data-backed review pattern card, so it shows useful user activity instead of static repetition.
- Donation URLs from deployment variables are sanitized to HTTPS-only external links before they can render.
- Advisor copy now distinguishes verified chart-feed data from live execution data and describes trading-cost impact in plainer language.

## Gaps to Close

### Trade Review Logic

- Add broker-specific execution data if a supported broker integration becomes available. Current execution quality can consume FMP bid/ask spreads when present and otherwise uses modeled spread/slippage.

### Front End

- Continue tightening review copy as more real usage comes in. The no-setup state now shows a primary reason and limited detail, but real-user sessions will reveal which phrases still feel too technical.
- Add richer chart tools only where Lightweight Charts supports them cleanly. Current zoom, scroll, reset, scale, crosshair, OHLC, and setup lines are present; full TradingView-style drawing tools would require either a different charting product or custom drawing overlays.
- Continue splitting `src/App.tsx`. Profile and theme controls are separated now; history, guide, about, donate, and shell utilities should move next as usage stabilizes.
- Persist the user’s preferred default tab or last workspace section if real usage shows traders routinely start outside Advisor.

### Back End

- Continue splitting the analyzer Edge Function. Calibration, replay, execution quality, quote parsing, and learning math are separated now; strategy votes, market loading, and Supabase persistence should be split next.
- Add a small internal operations view for `market_data_health` and `analyzer_events` once there is enough live data to make it useful.

### Security and Reliability

- Add the `SUPABASE_DB_PASSWORD` GitHub secret when the team wants CI to apply migrations automatically. Until then, CI verifies migration file integrity and skips remote apply without failing deployment.
- Keep local authenticated E2E optional. CI has the dedicated test-user secrets; local runs skip signed-in tests unless those variables are set in the shell.
- Expand live abuse tests beyond Market Scan if new analyzer actions are introduced.
- Tighten bundle budgets as more panels are split and lazy-loaded.

## Priority Order

1. Split strategy votes, data loading, and persistence into dedicated analyzer modules.
2. Split `src/App.tsx` into shell, insights, guide, about, donate, and utility modules.
3. Add a small internal operations view after enough `market_data_health` and `analyzer_events` data exists.
4. Add broker-specific execution data if a supported integration becomes available.
5. Tighten bundle budgets as additional code-splitting lands.
