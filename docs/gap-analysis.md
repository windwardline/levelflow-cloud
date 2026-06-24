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

## Gaps to Close

### Trade Review Logic

- Add a replay harness that runs the analyzer against historical candles and verifies fill, stop, target, and no-fill outcomes. This is the highest-value accuracy improvement available without changing the FMP plan.
- Add category-specific calibration. Forex, crypto, metals, and futures should not all use the same confidence threshold, payoff floor, event penalty, and expiry assumptions forever.
- Add a spread and execution-quality model. Current outcomes use candle high/low paths and do not model spread, slippage, partial touches, or real execution availability.
- Improve same-candle outcome handling. When stop and target both touch in one candle, LevelFlow correctly marks it as needing review, but those cases should be excluded from learning weight updates or weighted more conservatively.
- Add scan-level correlation context. The current scan checks existing active correlated ideas, but the UI should eventually explain when multiple top ideas are tightly related.
- Persist market-data health by symbol. The app should know when a market has weak coverage before a user waits on a review or scan.

### Front End

- Expand Market Scan from a ranked list into a decision surface with category filters, confidence bands, and a clear “why this market ranked here” preview.
- Continue tightening review copy as more real usage comes in. The no-idea state now shows a primary reason and limited detail, but real-user sessions will reveal which phrases still feel too technical.
- Add richer chart tools only where Lightweight Charts supports them cleanly. Current zoom, scroll, reset, scale, crosshair, OHLC, and setup lines are present; full TradingView-style drawing tools would require either a different charting product or custom drawing overlays.
- Split the largest UI file into focused panels. `src/App.tsx` is doing shell, history, insights, guide, about, profile, and utility work in one file.

### Back End

- Split the analyzer Edge Function into modules for data loading, strategy votes, setup construction, outcome review, and Supabase persistence. The current single file is testable, but too large.
- Cache FMP candle responses during scans. A full-market scan currently does independent provider requests per market, which is simple but wasteful and more vulnerable to provider latency.
- Add structured operational telemetry for Edge Function failures, slow provider responses, scan duration, and symbol-level data coverage.
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
6. Deployment migration step.
7. Persistence-table consolidation.
