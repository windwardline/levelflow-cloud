# The Desk (Stage 3.5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the workspace as The Desk per `docs/superpowers/specs/2026-07-30-levelflow-desk-design.md` — three-column trade-first desktop, tab-bar mobile, drill-down scan menu with availability, labeled confidence, per-value copy, a live current-trades rail, and scan-path persistence so every generated setup reaches Insights.

**Architecture:** UI recomposition inside the existing React/Vite app (no new deps); one Supabase migration (`origin` column); one edge-function change (scan persistence + qualified count). The spec is the copy/behavior authority — every task cites its sections; where the spec text and this plan disagree, the spec governs.

**Tech Stack:** React 18 + Tailwind 4 (existing tokens/kit), Supabase JS, Deno edge function, node:test + Playwright e2e.

## Global Constraints

- Spec `2026-07-30-levelflow-desk-design.md` governs copy and behavior; §2 copy discipline binds every surface (no narration captions; ruled-out lines never ship).
- Canonical instruction, verbatim where ladder values render (spec §7): "Set your take-profit at Target 2. When price reaches Target 1, close half and move your stop to your entry — profit locked either way."
- Unfilled orders are **"pending"**, never "resting" (languageGuard-enforced).
- Menus alphabetical (All markets → groups A–Z → markets base/quote); results confidence-descending — the only sort deviation (spec §4).
- Existing design tokens only; contrast suite must stay green; tap targets ≥44px.
- Every task: typecheck + lint (0 warnings) + tests green before commit; conventional commits; no AI trailer.

---

### Task 1: marketHours module

**Files:**
- Create: `src/lib/marketHours.ts`
- Test: `tests/marketHours.test.ts`

**Interfaces:**
- Produces: `marketAvailability(assetType: SecurityType, symbol: string, now: Date): { open: true } | { open: false; opensAt: Date }` and `formatReopen(opensAt: Date, now: Date): string` (local-time, day-qualified when not today, date beyond 7 days — spec §10b).

- [ ] Write failing tests: forex closed Sat 12:00 ET → opensAt Sun 17:00 ET local; forex open Wed 14:00; CME classes (Futures/Energies/Metals) closed weekdays 17:00–18:00 ET (daily break) and weekends until Sun 18:00 ET (Metals spot follows forex 17:00 — encode per class table in spec §10b); Crypto always open; `formatReopen` renders "6:00 pm" same-day, "Sun 5:00 pm" cross-day, with `Intl.DateTimeFormat` default locale.
- [ ] Implement with per-class calendar tables (ET-anchored, converted via `Intl` timezone math — no date libs).
- [ ] Parity test: import `getUpcomingWeeklyCloseTime` from `../supabase/functions/trade-analyzer/replay.ts` in the node test and assert Friday-close boundaries agree with `marketAvailability` for EURUSD and ESUSD.
- [ ] Commit `feat: market availability clock with local-time reopen labels`.

### Task 2: scan persistence, origin, qualified count (engine)

**Files:**
- Create: `supabase/migrations/<ts>_setup_origin.sql`
- Modify: `supabase/functions/trade-analyzer/index.ts` (scan handler ~:260-407, `upsertActiveSetup` :1194-1300), `src/lib/tradeAnalyzer.ts` (response types)
- Test: `tests/sweep.test.ts` untouched; new assertions in `tests/core.test.ts` for response type; edge behavior verified via deploy e2e

**Interfaces:**
- Produces: `trade_setups.origin text not null default 'review' check (origin in ('review','scan'))`; scan response gains `qualified: number`; `upsertActiveSetup(..., origin: "review" | "scan")`.

- [ ] Migration: add `origin` with default `'review'` (backfill implicit), index not needed.
- [ ] `scanOpportunities`: after ranking/collapse, for an authenticated user persist each returned opportunity via `upsertActiveSetup(..., "scan")` (reuse existing same-side dedupe so scan-then-review doesn't double-log); response adds `qualified: opportunities.length`.
- [ ] **Learning boundary:** the global-weightings aggregation reads review-origin outcomes only (`origin = 'review'` filter where outcomes join setups) — scan-origin rows are record, not signal, until measured (document inline + in `docs/trade-model.md` cohort note).
- [ ] No ANALYZER_VERSION bump: setup construction, scoring, and outcome semantics unchanged; persistence scope is data plumbing (state this in the commit body).
- [ ] Commit `feat: every generated setup persists — scan origin recorded, counts honest`.

### Task 3: Desk shell — nav, three columns, scroll discipline

**Files:**
- Modify: `src/App.tsx` (TABS: About removed → Desk/Insights/Guide/Profile; "Desk" replaces "Advisor" label), `src/index.css` (`.scrolly` utility per spec §2), `src/components/workspace/AdvisorWorkspace.tsx` (top-level grid → `grid-cols-[264px_1fr_300px]` fixed-height shell at ≥lg)
- Test: `tests/guideAnchors.test.ts` (nav pins), e2e updated in Task 10

- [ ] Recompose: left rail hosts MarketScanPanel content (Task 4 replaces its internals), center stage hosts chart+recommendation, right rail hosts the new CurrentTradesRail placeholder (Task 7).
- [ ] `body` no-scroll at ≥lg; columns `.scrolly` (thin scrollbars per spec §2); <lg keeps stacked flow until Task 9 mobile pass.
- [ ] Stage header: market picker as the header, no eyebrow/title (spec §2).
- [ ] Commit `feat: the Desk shell — three columns, quiet scrollbars, About retired from nav`.

### Task 4: scope menu with availability

**Files:**
- Create: `src/components/workspace/ScopeMenu.tsx`
- Modify: `AdvisorWorkspace.tsx` (both pickers), `MarketScanPanel.tsx` (scope + count line)
- Test: `tests/scopeMenu.test.tsx`

**Interfaces:**
- Consumes: `AVAILABLE_ASSET_GROUPS`, `marketAvailability`, `formatReopen` (Task 1).
- Produces: `<ScopeMenu value scope onSelect(scope: { kind: "all" } | { kind: "group"; assetType } | { kind: "symbol"; symbol })>` — accessible listbox (not native select), keyboard navigable, 44px rows on touch; mobile renders as full-screen sheet.

- [ ] Structure per spec §4: All markets → groups A–Z (selectable, "scan N") → markets base/quote-sorted; closed rows muted with "closed · opens {when}" (Task 1 formatter), non-interactive.
- [ ] Count line: "`{scope} — {scanned} scanned · {qualified} qualify · {time}`" from server numbers only (Task 2).
- [ ] Tests: rendered order matches AVAILABLE_ASSET_GROUPS exactly; closed rows inert; count renders server values.
- [ ] Commit `feat: one scope menu — drill-down, availability-aware, honest counts`.

### Task 5: confidence unit

**Files:**
- Create: `src/components/workspace/ConfidenceUnit.tsx`
- Modify: `src/lib/advisorReview.ts` (add `CONFIDENCE_THRESHOLD_BY_ASSET_TYPE` mirror), stage + scan rows to consume it
- Test: `tests/confidenceGauge.test.tsx` extended; `tests/core.test.ts` parity assertion mirror ↔ `getCategoryCalibration(...).confidenceThreshold`

- [ ] Unit per spec §6: "Confidence" label, "N of 100", meter with threshold tick, one-line qualifying note; rail rows "Buy · confidence N".
- [ ] Commit `feat: confidence reads as a measurement — scale, bar, meaning`.

### Task 6: ladder copy + canonical language

**Files:**
- Modify: `AdvisorRecommendationPanel.tsx` (remove "Copy levels" button :153; per-value `.cpv` rows with clipboard + ✓ state), `tests/languageGuard.test.ts` (ban "resting"; pin canonical sentence where rendered)

- [ ] Labels "Target 1 · bank half" / "Target 2 · take-profit"; canonical instruction under the ladder (Global Constraints, verbatim).
- [ ] Commit `feat: per-value copy and the one two-target sentence`.

### Task 7: current trades rail

**Files:**
- Create: `src/components/workspace/CurrentTradesRail.tsx`, `src/lib/tradeState.ts`
- Modify: `src/hooks/useTradeSetups.ts` (surface-show force refresh), `App.tsx` (Desk activation triggers it)
- Test: `tests/tradeState.test.ts`

**Interfaces:**
- Produces: `deriveTradeState(setup: TradeSetupRow, now: Date): { status: "pending" | "open"; instruction: string; progressR: number | null; eventAge?: string } | null` (null = closed → excluded).

- [ ] `deriveTradeState` from `status` + outcome (`pending` outcome + unfilled ⇒ Pending chip; filled ⇒ Open; tp1_partial pre-exit ⇒ "Target 1 hit {age} — bank half, move stop to {entry}"; resolved outcomes ⇒ null). `progressR` computed from prices + `feedback.realizedR` when present.
- [ ] Rail per spec §8: "Current trades", chips, stamp "as of {time} · refresh", no footnote; force refresh on every surface show + manual button.
- [ ] Tests: each state maps to its exact instruction string; closed rows excluded.
- [ ] Commit `feat: current trades — live state, plain next steps`.

### Task 8: Insights recomposition

**Files:**
- Modify: `HistoryPanel.tsx`, `historyUtils.ts`
- Test: `tests/outcomes.test.ts` extended for result labels

- [ ] Per spec §10: record band; Market/Status/Period filter row (no origin anywhere in UI); day-grouped table Market · Side · Confidence · Entry · Stop · Target 1 · Target 2 · Result; result labels per spec incl. "Not taken"; footer per spec.
- [ ] Commit `feat: Insights as a ledger — one table, three filters, every setup`.

### Task 9: Guide + Profile + mobile pass

**Files:**
- Modify: `GuidePanel.tsx` — render `docs/superpowers/specs/2026-07-30-levelflow-guide-content.md` verbatim (the owner-approved copy deck with its absorption map); callout = canonical instruction; §10 renders as the definition list, `ProfilePanel.tsx` (Account/Broker/Appearance cards per spec §11), delete `OverviewPanel.tsx` + its route/tab remnants
- Modify: `App.tsx` + workspace components for the <lg tab bar (Review/Scan/Trades/Insights) with badge; account avatar → Profile/Sign out
- Test: `tests/guideAnchors.test.ts`, e2e 375px in Task 10

- [ ] Commit `feat: Guide absorbs About; Profile consolidates; mobile gets its own composition`.

### Task 10: e2e + gates + ship

**Files:**
- Modify: `tests/e2e/*` per spec §14 (menu order, per-value copy, rail refresh-on-navigation, scan persistence in Insights, availability rendering, 375px + 1280px authed)

- [ ] Full gate (`check`, `lint`, `test`, `build`, `test:e2e`), PR, auto-merge, deploy, live verify authed on production both themes + mobile width.
- [ ] Commit `test: the Desk verification bar` + ship PR.

## Self-review notes

Spec coverage: §2→T3, §3→T9, §4→T4, §5→T2/T4, §6→T5, §7→T6, §8→T7, §9→T2, §10→T8, §10b→T1/T4, §11→T9, §12 presentation-only (T3 header chip), §14→T10. Type names cross-checked (ScopeMenu scope union consumed by T3/T4; deriveTradeState consumed by T7 only). No placeholders; exact copy lives in the spec sections each task cites.
