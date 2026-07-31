# Desk Recomposition (Visual-Fidelity Remediation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the authed app's composition match the owner-approved mockups in `docs/design/mockups/` — deleting the legacy chrome and stage furniture the first ship left in place (spec §16 kill-list).

**Architecture:** Pure presentation recomposition. All data plumbing, hooks, contracts, copy rulings, and behaviors from the 2026-07-31 ship stay: this work moves, deletes, and restyles JSX/CSS. Three tasks, one surface set each: (1) masthead/shell + Profile, (2) Desk stage + scan rail, (3) Guide + Insights flattening.

**Tech Stack:** React 18 + Tailwind v4 (px-pinned breakpoints; NEVER interpolate variant prefixes — literal class strings only), Vitest, Playwright.

## Global Constraints

- Composition authority: `docs/design/mockups/*.html` (spec §16). Read the named mock file BEFORE writing JSX. Spec governs behavior/copy; mock governs composition.
- Both directions required: mock elements present AND spec §16 kill-list elements absent. Reviews must attest to both explicitly.
- Platform parity: every ruling binds desktop AND mobile unless scoped (owner directive).
- Preserve these test contracts exactly: `data-testid="desktop-header"`, `data-testid="mobile-header"`, `data-testid="current-trades-rail"`, `aria-label="Chart view"` (e2e uses `exact: true`), Insights `aria-label`s Market/Status/Period, nav accessible names Desk/Insights/Guide/Profile, `role="menuitem"` in MobileAccountMenu, ScopeMenu exports (`formatScopeCountLine`, `MOBILE_SHEET_BREAKPOINT_PX`).
- Tailwind v4 scans source as text: never `` `lg:${x}` `` — `tests/tailwindVariantGuard.test.ts` enforces; keep it green.
- Copy rulings stand: "pending" never "resting"; "Current trades" (no "Your"); ruled-out captions stay out ("Reviewing — any market, scanned or not", "Fresh chart data on every scan — you decide when", "Strongest first, by confidence"); no origin column/filter in Insights UI.
- Update tests WITH the composition — never delete coverage wholesale; a test asserting killed furniture is rewritten to assert its absence or its replacement.
- Full gate per task: `npx tsc --noEmit && npx eslint . --max-warnings 0 && npm test` all green before commit. e2e: `npx playwright test --list` must collect cleanly (execution happens against the deploy).
- Conventional Commits; no AI co-authorship trailer.

---

### Task 1: Masthead, shell, and Profile

**Files:**
- Modify: `src/App.tsx` (desktop header block :300-356; keep mobile header :281-298 as-is)
- Modify: `src/components/workspace/ProfilePanel.tsx`
- Modify: `src/styles/index.css` (nav-link styles if utilities are needed; prefer inline Tailwind)
- Test: existing suites touching App header/Profile (locate with `grep -rl "desktop-header\|Welcome\|ProfilePanel" tests/ src/**/*.test.*`)

**Interfaces:**
- Consumes: existing `BrokerChip`, `MobileAccountMenu`, `ThemeToggle`, `SUPPORT_MAILTO`, `setActiveTab`, `TABS`.
- Produces: desktop masthead per `a-desk-v3.html:75-84`; Profile per `p-profile-v1.html` + Support card (spec §16 relocation).

- [ ] **Step 1: Read the mocks.** Read `docs/design/mockups/a-desk-v3.html` lines 1-100 (header CSS + markup) and `docs/design/mockups/p-profile-v1.html` in full.

- [ ] **Step 2: Recompose the desktop header** (`data-testid="desktop-header"` stays on the wrapper). Single flex row, `justify-between`:
  - Left cluster (`flex items-center gap-6`): wordmark `<p className="wordmark text-xl text-ink">Levelflow</p>`; then nav `<nav aria-label="Levelflow sections" className="flex items-center gap-6">` rendering `TABS` as text `<button>`s — `text-xs font-semibold uppercase tracking-[0.12em]`, inactive `text-ink-muted hover:text-ink`, active `text-ink border-b-2 border-accent pb-1`. **No icons in desktop nav** (drop `tab.icon` here only; the mobile tab bar keeps its icons).
  - Right cluster (`flex items-center gap-3`): `<BrokerChip />` then ghost Sign out `<button className="secondary-button min-h-10 px-3 py-2">Sign out</button>` (keep the `LogOut` icon if `secondary-button` composes it today — mock shows a plain ghost button; text-only is correct).
  - DELETE from this block: the "Welcome, {profileDisplayName(profile)}" line, the `<ThemeToggle …/>` instance, the Help `<a>` and Donate `<button>`. Remove now-unused imports (`Mail`, `Gift`, `ThemeToggle` if no other authed use, `profileDisplayName` if unused).
  - The old two-row structure (`lg:contents` wrapper holding a controls row + a `mt-3` nav row) collapses to the single row; keep `hidden lg:flex` gating with literal classes.

- [ ] **Step 3: Run the gate; fix fallout.** `npx tsc --noEmit && npx eslint . --max-warnings 0 && npm test`. Rewrite any test asserting the greeting/Help/Donate/theme-toggle in the header to assert the masthead composition instead (nav names present, greeting ABSENT: `expect(screen.queryByText(/Welcome,/)).toBeNull()`).

- [ ] **Step 4: Commit.** `git add -A && git commit -m "feat: single-row masthead — greeting, header theme toggle, Help/Donate chrome removed"`

- [ ] **Step 5: Profile page per mock.** In `ProfilePanel.tsx`: wrap content in a `mx-auto w-full max-w-[620px]` column; title exactly "Profile" (h1/h2 consistent with other surfaces' heading pattern); cards keep the bordered-sheet treatment (`p-profile-v1.html:15`: sheet bg, 1px hairline, 18/22 padding, 16px stack gap) — tighten any larger paddings/gaps to that rhythm. Keep Account/Broker/Appearance content and the save-error notice exactly as they behave today.

- [ ] **Step 6: Add the Support card** (spec §16 relocation) after Appearance:
  ```tsx
  <section className="…same card classes as the others…">
    <h3 …same heading classes…>Support</h3>
    <div className="flex flex-col items-start gap-2">
      <a className="tertiary-link" href={supportMailto}>Email support</a>
      <button className="tertiary-link" type="button" onClick={onOpenDonate}>Donate</button>
    </div>
  </section>
  ```
  Thread `supportMailto: string` and `onOpenDonate: () => void` props from App.tsx (`SUPPORT_MAILTO`, `() => setActiveTab("donate")`).

- [ ] **Step 7: Gate + commit.** Full gate green. `git commit -m "feat: Profile per mock — 620px column, tight cards, Support card carries Help/Donate"`

- [ ] **Step 8: e2e collection check.** `npx playwright test --list` collects with zero errors (locators referencing killed chrome get updated in their spec files if any exist — grep `tests/e2e/` for `Welcome`, `Help`, `Donate`, `Theme`).

---

### Task 2: Desk stage and scan rail

**Files:**
- Modify: `src/components/workspace/AdvisorWorkspace.tsx` (stage region ~:420-660)
- Modify: `src/components/workspace/MarketScanPanel.tsx`
- Modify: `src/components/workspace/ConfidenceUnit.tsx` (meta line)
- Delete: `src/components/workspace/AdvisorStatusPanels.tsx`
- Modify: `src/styles/index.css` (thin-scrollbar utility)
- Test: suites covering these components (`grep -rl "DeskStatusStrip\|MarketClockPanel\|MarketScanPanel\|ConfidenceUnit\|AdvisorWorkspace" tests/ src` — update alongside)

**Interfaces:**
- Consumes: existing `MarketChart`, `RecommendationPanel`, `ScopeMenu`, `CurrentTradesRail`, `fetchMarketData`, `generateTradeSetup`, `scanMarketOpportunities`, `marketAvailability`/`formatReopen`, `deskColumnClassName`.
- Produces: stage per `a-desk-v3.html:161-213`, rail per `a-desk-v3.html:87-158`. `AdvisorStatusPanels.tsx` no longer exists.

- [ ] **Step 1: Read the mock.** `docs/design/mockups/a-desk-v3.html` in full (234 lines).

- [ ] **Step 2: Recompose the stage** to exactly this element sequence (mock :161-213), replacing the current `terminal-panel` sections, controls row, and metric cards:
  1. **Stagehead** (`flex items-end justify-between mb-4`): left = market select styled as the heading (keep it a real `<select>` with its current options/handler; `text-2xl font-bold bg-transparent border-none text-ink p-0` — keep an accessible name, e.g. `aria-label="Market"`), beside it the side tag (`BUY LIMIT`/`SELL LIMIT` etc. from the current setup, `text-[15px] font-bold`, buy/sell color) — rendered only when a setup is showing; right = chart-view `<select>` restyled as ghost control (**keep `aria-label="Chart view"`** — e2e contract) + the `Review market` primary button (existing handler; fresh-data behavior unchanged).
  2. **ConfidenceUnit** directly under the stagehead left block (its existing score + meter + threshold note), with the valid-until datum folded into its meta line: `Reviewed {formatTimestamp(requestedAt)} · valid until {formatTimestamp(expiresAt)}` — one muted line, no card. Add `validUntil` prop if it doesn't already carry it.
  3. **Chart** (`MarketChart`, existing overlay levels) in a bordered sheet (`border border-hairline bg-sheet`).
  4. **The setup sheet** attached below the chart (`border border-hairline border-t-0 bg-sheet`, two columns `lg:grid-cols-[1.1fr_0.9fr]`, hairline divider): left = the existing ladder (RecommendationPanel's Entry/Stop/T1/T2 copy rows + canonical instruction), right = the existing "Why this setup" rows. If RecommendationPanel currently renders these inside its own `terminal-panel` chrome, strip that chrome so the sheet is the only frame.
  - DELETE: `DeskStatusStrip` + `MarketClockPanel` usage and imports, the standalone Refresh button + its `RefreshCw` import (Review market is the stage's one action; the trades rail keeps its own refresh link), the CHART VIEW/ADVISOR CHECKS/VALID UNTIL metrics builder (~:620-660) and its render, `getGlobalSessions`/`getMarketClock` imports here. Keep the closed-market availability notice exactly as it renders today (approved treatment).
  - The refresh-nonce plumbing that the deleted Refresh button drove: `Review market` already re-fetches fresh; delete `refreshNonce` only if nothing else consumes it — otherwise leave the state and remove just the button.

- [ ] **Step 3: Delete `AdvisorStatusPanels.tsx`.** `git rm src/components/workspace/AdvisorStatusPanels.tsx`. If `getGlobalSessions`/`getMarketClock`/`marketSessions` lose their last consumer, leave the lib file (engine-facing tests may pin it) but remove dead exports ONLY if zero references remain repo-wide.

- [ ] **Step 4: Recompose the rail** (`MarketScanPanel`) to mock :87-158: eyebrow "Scan" + compact `Scan now` button on one row; the existing ScopeMenu; the existing count line (`formatScopeCountLine` output, mono muted); result rows (symbol bold, `{Side} · confidence {n}` meta, cost chip right, selected row = sheet bg + inset 3px accent bar `shadow-[inset_3px_0_0_var(--color-accent)]` or a border-l-accent equivalent); the footnote "Every setup Levelflow generates is saved to Insights automatically." DELETE: the "Market scan"/"Best current markets" title block, the legend box, any empty-state illustration box (empty state = one muted line).

- [ ] **Step 5: Thin scrollbars.** Add to `src/styles/index.css`:
  ```css
  .rail-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--color-hairline) transparent;
  }
  .rail-scroll::-webkit-scrollbar { width: 6px; }
  .rail-scroll::-webkit-scrollbar-thumb { background: var(--color-hairline); border-radius: 3px; }
  .rail-scroll::-webkit-scrollbar-track { background: transparent; }
  ```
  (Match the actual hairline custom-property name used in this file.) Apply `rail-scroll` to the three Desk column scroll containers.

- [ ] **Step 6: Gate; reconcile tests.** Full gate. Tests asserting DeskStatusStrip/MarketClockPanel/metric cards/legend/panel titles are rewritten to assert the mock composition and the kill-list absences (e.g. `expect(screen.queryByText("Global FX sessions")).toBeNull()` — match the real rendered strings).

- [ ] **Step 7: Commit.** `git commit -m "feat: Desk stage and rail recomposed to the mock — status strip, session cards, metric boxes deleted"`

- [ ] **Step 8: e2e collection + built-CSS spot check.** `npx playwright test --list` clean. `npm run build && grep -c "rail-scroll" dist/assets/*.css` ≥ 1 (proves the utility survived Tailwind's pipeline).

---

### Task 3: Guide and Insights flattening

**Files:**
- Modify: `src/components/workspace/GuidePanel.tsx`
- Modify: `src/components/workspace/HistoryPanel.tsx`
- Test: their existing suites (locate by grep; update alongside)

**Interfaces:**
- Consumes: the rendered Guide deck content (verbatim — content is owner-approved; composition only) and HistoryPanel's existing data/filters/nav (`nav.openAdvisor` row navigation stays).
- Produces: Guide per `g-guide-v1.html`, Insights per `i-insights-v1.html`.

- [ ] **Step 1: Read the mocks.** `docs/design/mockups/g-guide-v1.html` and `docs/design/mockups/i-insights-v1.html` in full.

- [ ] **Step 2: Guide as editorial article** (mock :12-21, :39-48): two-column `lg:grid-cols-[230px_1fr] max-w-[1020px] mx-auto gap-9`; left = sticky TOC (`sticky top-20 self-start border-r border-hairline pr-5`; uppercase "Contents" eyebrow; anchor links to the existing section anchors); right = `<article>` — sections flow with numbered eyebrows and hairline separation (`border-t border-hairline pt-…` between sections), body copy `max-w-[62ch]`, callouts as accent-left-border blocks. DELETE the per-section card/panel wrappers. Every deck sentence stays verbatim; languageGuard stays green. TOC hidden below lg (`hidden lg:block`) — mobile reads the article straight through.

- [ ] **Step 3: Gate + commit.** `git commit -m "feat: Guide flattened to editorial article — TOC plus flowing sections, no cards"`

- [ ] **Step 4: Insights as flat page** (mock): one page column; the record band as flat stat blocks above the filters (no card chrome); the filter row inline (Market/Status/Period selects + search, aria-labels preserved); the table in the mock's single bordered container with day separations as they exist. DELETE surrounding `terminal-panel` wrappers that box the band/filters separately. No origin column/filter (standing ruling). Row-click navigation unchanged.

- [ ] **Step 5: Gate; reconcile tests; commit.** Full gate green. `git commit -m "feat: Insights flattened — record band and filters unboxed, single table frame"`

- [ ] **Step 6: Whole-app absence sweep.** `grep -rn "terminal-panel" src/` — every remaining use must be a mock-drawn card (position cards, Profile cards, Insights table frame, auth/parking screens). List the survivors in the report with one-line justifications.

---

## Final review (whole branch)

Opus reviewer with the two-direction checklist: for each of the four surfaces + header, (a) mock elements present per the named mock file, (b) spec §16 kill-list absent — each direction attested per surface. Plus the standard rubric and built-CSS verification for any new utility classes.
