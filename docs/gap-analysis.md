# LevelFlow Gap Analysis

Last reviewed: 2026-06-23

## Current Strengths

- The Advisor and Market Scan paths share the same setup engine, so scan ideas and direct market reviews use the same market logic.
- The analyzer only returns limit ideas and clears stale active ideas when a fresh review no longer qualifies.
- The visible asset list is intentionally limited to verified categories and sorted consistently by category, base, then quote.
- Outcome tracking and global learning are shared across users through `strategy_weightings_global`, not isolated to individual users.
- Server-only market data and analysis keep provider keys out of browser JavaScript.

## Gaps to Close

### Trade Review Logic

- Add a replay harness that runs the analyzer against historical candles and verifies fill, stop, target, and no-fill outcomes. This is the highest-value accuracy improvement available without changing the FMP plan.
- Add category-specific calibration. Forex, crypto, metals, and futures should not all use the same confidence threshold, payoff floor, event penalty, and expiry assumptions forever.
- Add a spread and execution-quality model. Current outcomes use candle high/low paths and do not model spread, slippage, partial touches, or real execution availability.
- Improve same-candle outcome handling. When stop and target both touch in one candle, LevelFlow correctly marks it as needing review, but those cases should be excluded from learning weight updates or weighted more conservatively.
- Add scan-level correlation ranking. The current scan checks existing active correlated ideas, but it should also de-duplicate highly correlated candidates inside the same scan result.
- Persist market-data health by symbol. The app should know when a market has weak coverage before a user waits on a review or scan.

### Front End

- Expand Market Scan from a ranked list into a decision surface with category filters, confidence bands, and a clear “why this market ranked here” preview.
- Add stronger no-idea presentation. A blocked market should show one short primary reason and optional detail, not expose raw technical language.
- Add richer chart tools only where Lightweight Charts supports them cleanly. Current zoom, scroll, reset, scale, crosshair, OHLC, and setup lines are present; full TradingView-style drawing tools would require either a different charting product or custom drawing overlays.
- Split the largest UI file into focused panels. `src/App.tsx` is doing shell, history, insights, guide, about, profile, and utility work in one file.

### Back End

- Split the analyzer Edge Function into modules for data loading, strategy votes, setup construction, outcome review, and Supabase persistence. The current single file is testable, but too large.
- Cache FMP candle responses during scans. A full-market scan currently does independent provider requests per market, which is simple but wasteful and more vulnerable to provider latency.
- Add structured operational telemetry for Edge Function failures, slow provider responses, scan duration, and symbol-level data coverage.
- Rename the legacy `massive_symbol` database field to `provider_symbol` in a dedicated migration. This is not visible to users, but it is stale internal vocabulary.
- Decide whether `pending_orders` should remain the persistence name. The product no longer places trades, so `idea_orders` or a single `trade_setups` table with expiry fields would be clearer long term.

### Security and Reliability

- Add database migration execution to the deployment pipeline or document a required manual release step for every schema change.
- Add authenticated E2E secrets to local or CI environments where full signed-in browser tests should run. The test entrypoint is present and skips cleanly without those credentials.
- Add rate-limit and abuse tests for analyzer actions, especially Market Scan.
- Add CSP regression checks so Cloudflare header changes do not silently weaken the deployed app.

## Priority Order

1. Historical replay harness for analyzer accuracy.
2. FMP candle cache plus symbol data-health persistence.
3. Analyzer module split with targeted unit tests around each strategy vote and setup construction.
4. Market Scan decision-surface upgrade.
5. Category-specific thresholds and expiry rules.
6. Dedicated provider-symbol schema rename.
7. Deployment migration step.
