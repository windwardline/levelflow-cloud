# Visual Overhaul Stage 3 — Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the entire authed workspace (shell, advisor, chart, scan, insights, guide, about, profile, donate) into the Swiss Editorial system — layout follows the user's workflow, every string is plain language, and the legacy style aliases are deleted at the end.

**Architecture:** One-page React app (no router) with a `useState` tab shell in `src/App.tsx`. Stage 3 adds a tiny `WorkspaceNavContext` so any card can send the user to the right step (Guide anchor, Advisor symbol, Insights filter) without prop-drilling, then recomposes each surface in place. Alias migration rides inside each task ("every file you touch leaves clean"); the alias definitions and `bg-white` shims are deleted in the final task once usages hit zero.

**Tech Stack:** React 19 + TypeScript, Tailwind 4 `@theme` tokens (`src/styles/index.css`), lightweight-charts, Vitest (`npm test`), Playwright e2e (`tests/e2e/`), existing contrast CI (`tests/contrast.test.ts`).

## Global Constraints

Copied from `docs/superpowers/specs/2026-07-29-levelflow-visual-overhaul-design.md` — every task inherits these.

- **Tokens only.** Colors come from the Stage-1 tokens: `paper, sheet, ink, ink-muted, hairline, accent, accent-pressed, buy, sell, caution` (light/dark: paper `#F4F1EA`/`#161411`, sheet `#FDFCF9`/`#1E1B16`, ink `#1B1B1B`/`#EDE7DA`, muted `#6B675E`/`#969082`, hairline `#D8D2C4`/`#35322B`, accent `#2244FF`/`#6B86FF`, pressed `#1A35CC`/`#7D95FF`, buy `#177245`/`#4CC38A`, sell `#B3261E`/`#E5766E`, caution `#8A5B00`/`#D9A441`). No new hex literals in components — the two canvas-drawn components (MarketChart, ConfidenceGauge) read CSS custom properties at runtime instead.
- **Leave-it-clean migration rule.** Every file a task touches must leave with ZERO legacy alias classes (`navy`, `slate`, `bullish`, `canvas`, `warning`, `danger` color utilities) and ZERO `bg-white`/`text-white`/`border-white`. Replacements: navy→ink, slate→ink-muted, bullish→accent (or buy where it marks trade direction — judge by meaning), canvas→paper, warning→caution, danger→sell, white→paper or sheet (backgrounds) / ink-on-dark contexts use paper text token.
- **Plain language (spec §7).** Working surfaces never show: `TP1`, `runner`, `out-of-sample`, `ATR`, regime jargon, or raw interval codes (`4H`, `1H`, `15M`, `5M`, `1M`, `1D`) as visible text. Replacements are pinned per task below. The Guide MAY teach precise terms parenthetically ("first target (TP1)"). Theme labels stay exactly Light / Dark / System. Sentence case, no exclamation points, one short context line max per card; depth goes to the Guide behind a `How this works` link.
- **One disclosure pattern.** The only progressive-disclosure mechanism is `HowThisWorksLink` (Task 1) pointing at a fixed Guide anchor set: `how-review-works`, `targets-and-stops`, `confidence-tiers`, `replay-record`, `cost-ratings`, `timeframes`. Tasks 3–5 link only to anchors in this list; Task 6 creates the matching sections.
- **Component kit (spec §5).** Sheets = sheet bg + hairline border; chips = small bordered marks (`.chip`, Task 3), never filled pills; tables/ladders/stat numerals = IBM Plex Mono (`font-mono tabular-nums`); tab bar stays the editorial contents-bar (already token-correct); confidence gauge is numeral-forward.
- **Accessibility (spec §9).** AA minimum both themes (CI-enforced by `tests/contrast.test.ts` — keep green), focus-visible 2px accent outline, ≥44px interactive hit targets, existing aria-labels carry forward.
- **Out of scope (spec §11).** No changes to trading logic, auth mechanics, data flow, or the analyzer. Presentation-layer label strings in `src/lib/` (outcomes.ts, replayReliability.ts, advisorReview.ts) ARE in scope — they are UI copy.
- **Tests.** Each task keeps `npx tsc --noEmit`, `npx eslint . --max-warnings 0`, `npm test`, `npm run build` green. E2e copy pins that break because copy changed intentionally are updated in the same task, and the task report must list each updated pin.
- **Commits.** Conventional Commits, one scoped commit per step group, no AI trailer.

---

### Task 1: Workspace nav plumbing + shell inversion

**Files:**
- Create: `src/components/workspace/WorkspaceNav.tsx`
- Create: `src/components/workspace/HowThisWorksLink.tsx`
- Modify: `src/App.tsx` (header lines ~140–210, footer ~249–251, tab state ~33–111)
- Test: `tests/workspaceNav.test.tsx` (create), `tests/e2e/authenticated-workspace.spec.ts` (extend)

**Interfaces (later tasks consume these — exact):**

```tsx
// src/components/workspace/WorkspaceNav.tsx
import { createContext, useContext } from "react";

export type GuideAnchor =
  | "how-review-works"
  | "targets-and-stops"
  | "confidence-tiers"
  | "replay-record"
  | "cost-ratings"
  | "timeframes";

export interface WorkspaceNav {
  openGuide: (anchor: GuideAnchor) => void;
  openAdvisor: (symbol: string) => void;
  openInsights: (symbol?: string) => void;
}

export const WorkspaceNavContext = createContext<WorkspaceNav | null>(null);

export function useWorkspaceNav(): WorkspaceNav {
  const nav = useContext(WorkspaceNavContext);
  if (!nav) throw new Error("useWorkspaceNav requires WorkspaceNavContext");
  return nav;
}
```

```tsx
// src/components/workspace/HowThisWorksLink.tsx
import type { GuideAnchor } from "./WorkspaceNav";
import { useWorkspaceNav } from "./WorkspaceNav";

export function HowThisWorksLink({ anchor }: { anchor: GuideAnchor }) {
  const nav = useWorkspaceNav();
  return (
    <button
      type="button"
      onClick={() => nav.openGuide(anchor)}
      className="text-xs text-ink-muted underline decoration-hairline underline-offset-4 transition-colors hover:text-accent hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      How this works
    </button>
  );
}
```

App-level state (inside `App`):

```tsx
const [guideAnchor, setGuideAnchor] = useState<GuideAnchor | null>(null);
const [advisorRequest, setAdvisorRequest] = useState<{ symbol: string; token: number } | null>(null);
const [insightsSymbol, setInsightsSymbol] = useState<string | null>(null);

const workspaceNav = useMemo<WorkspaceNav>(() => ({
  openGuide: (anchor) => { setGuideAnchor(anchor); setActiveTab("guide"); },
  openAdvisor: (symbol) => { setAdvisorRequest({ symbol, token: Date.now() }); setActiveTab("advisor"); },
  openInsights: (symbol) => { setInsightsSymbol(symbol ?? null); setActiveTab("history"); },
}), []);
```

Wrap the authed tree in `<WorkspaceNavContext.Provider value={workspaceNav}>`. Pass-through props land in later tasks: `GuidePanel anchor={guideAnchor}` (Task 6), `AdvisorWorkspace openRequest={advisorRequest}` (Task 4), `HistoryPanel initialSymbol={insightsSymbol}` (Task 5) — Task 1 only threads the props with TODO-free default `undefined` handling (each panel ignores an undefined prop until its own task wires it).

- [ ] **Step 1: failing tests.** `tests/workspaceNav.test.tsx`: renders a probe component inside the provider and asserts `openGuide("cost-ratings")` flips the guide tab callback; asserts `useWorkspaceNav` outside a provider throws. Run: `npm test -- workspaceNav` → FAIL (module missing).
- [ ] **Step 2: implement `WorkspaceNav.tsx` + `HowThisWorksLink.tsx` exactly as above; wire provider + state in App.** Run test → PASS.
- [ ] **Step 3: header inversion.** In `src/App.tsx`: delete the Windward Line eyebrow `<p>` and the mark `<img>` from the header lockup; the header brand block becomes wordmark first — `<p class="wordmark text-lg text-ink">Levelflow</p>` (keep the existing `wordmark` class) with `Welcome, {name}` beneath in `text-xs text-ink-muted`. Header container classes become `sticky top-0 z-20 border-b border-hairline bg-paper/90 backdrop-blur`. Keep ThemeToggle (both responsive variants), Help, Donate, Sign out — migrate their classes off aliases (`text-slate`→`text-ink-muted`, hover states to `hover:text-accent`).
- [ ] **Step 4: colophon footer.** Footer becomes: `<footer className="mx-auto w-full max-w-7xl px-4 pb-8 pt-12">` containing `<p className="colophon">A Windward Line production</p>` above `<LegalLinks />`. (`.colophon` exists in `src/styles/index.css` since Stage 2.)
- [ ] **Step 5: migrate every remaining alias/white class in App.tsx** (survey found 8 alias + 1 `bg-white/90` occurrences at lines 115–155). `bg-canvas` on `<main>` → `bg-paper`.
- [ ] **Step 6: e2e.** Extend `tests/e2e/authenticated-workspace.spec.ts`: assert header shows the Levelflow wordmark and does NOT contain "Windward Line" above it (the string appears once, in the footer colophon: `await expect(page.getByText("A Windward Line production")).toBeVisible()`). Run full gates.
- [ ] **Step 7: commit** `feat: workspace shell — Levelflow-first header, colophon, nav context`

### Task 2: Chart and gauge join the token system

**Files:**
- Modify: `src/components/charts/MarketChart.tsx` (15 hex occurrences: lines ~69–74, 162–164, 351–362; alias/white classes ~195–274)
- Modify: `src/components/trade/ConfidenceGauge.tsx` (4 hexes lines 12–17; 2 alias classes 42–43)
- Test: `tests/chartTheme.test.ts` (create)

**Interfaces:**
- Produces: `readChartTheme(): ChartTheme` exported from `MarketChart.tsx` for the unit test — `{ sheet, ink, inkMuted, hairline, accent, buy, sell }`, each a CSS color string read from custom properties.
- Consumes: CSS custom properties `--color-sheet`, `--color-ink`, `--color-ink-muted`, `--color-hairline`, `--color-accent`, `--color-buy`, `--color-sell` (Stage 1 tokens, re-valued by `html[data-theme="dark"]`).

Implementation contract:

```ts
export function readChartTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    sheet: v("--color-sheet"), ink: v("--color-ink"), inkMuted: v("--color-ink-muted"),
    hairline: v("--color-hairline"), accent: v("--color-accent"),
    buy: v("--color-buy"), sell: v("--color-sell"),
  };
}
```

- Chart options derive from `readChartTheme()`: background = sheet, text = inkMuted, grid lines = hairline, crosshair = accent, up candles = buy, down candles = sell, watermark none. Price lines: entry = accent, stop = sell, both targets = buy.
- Theme reactivity: a `useEffect` installs `new MutationObserver` on `document.documentElement` filtered to `attributeFilter: ["data-theme"]`; on change, re-read the theme and `chart.applyOptions` + `series.applyOptions` with the new colors. Disconnect on cleanup.
- The old palette (`#5B8266`, `#A94D4D`, `#101826`, etc.) disappears entirely — grep the file for `#` after.
- ConfidenceGauge: arc stroke color = buy (score ≥ 80) / caution (≥ 65) / sell (below), read the same way (module-level `getComputedStyle` at render is fine — the component re-renders per score; add the same observer only if the reviewer finds a stale-theme repro; note this choice in the report). Numeral becomes the hero: `font-display text-5xl text-ink tabular-nums` (Space Grotesk per spec §5), tier label `text-xs uppercase tracking-wide text-ink-muted`, arc `strokeWidth` reduced to a thin supporting stroke (2).
- Overlay strips, tool buttons, loading/empty states in MarketChart migrate to tokens (sheet/ink/hairline/accent + `.chip` once Task 3 lands — until then use bordered `border-hairline text-ink-muted`).

- [ ] **Step 1: failing test.** `tests/chartTheme.test.ts` (Vitest + jsdom): set `document.documentElement.style.setProperty("--color-buy", "#177245")` etc., call `readChartTheme()`, assert each field. Run → FAIL (export missing).
- [ ] **Step 2: implement + migrate both components.** Test PASSES; `grep -c '#[0-9A-Fa-f]' src/components/charts/MarketChart.tsx src/components/trade/ConfidenceGauge.tsx` → 0 in both.
- [ ] **Step 3: visual sanity via existing e2e viewport spec + build.** Full gates. Commit `feat: chart and gauge read the design tokens — warm dark, spec candles`

### Task 3: Setup surfaces — recommendation panel, receipt, chips, language guard

**Files:**
- Modify: `src/components/workspace/AdvisorRecommendationPanel.tsx`, `src/components/workspace/SetupQualityReceipt.tsx`, `src/components/workspace/AdvisorMetricRow.tsx`, `src/lib/replayReliability.ts` (line ~36), `src/components/workspace/reviewCopy.ts` (tooltip line ~51–52), `src/styles/index.css` (add `.chip`)
- Test: `tests/languageGuard.test.ts` (create), `tests/replayReliability.test.ts` (extend existing if present, else create), `tests/e2e/authenticated-workspace.spec.ts` (update pins)

**`.chip` component class (add to `src/styles/index.css` beside `.nav-button`):**

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid color-mix(in srgb, currentColor 40%, transparent);
  border-radius: 0.125rem;
  padding: 0.125rem 0.375rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
```

Usage: `<span className="chip text-buy">Buy limit</span>` — color via text token only; never a filled background. Replace the filled `rounded-lg` side banner (AdvisorRecommendationPanel ~57–63) and any pill in these files with `.chip`.

**Copy table (exact replacements):**

| Where | Old | New |
|---|---|---|
| AdvisorRecommendationPanel ~104 | `TP1 — bank half` | `First target — bank half` |
| AdvisorRecommendationPanel ~110 | `Runner target` / `Take profit` | `Second target` / `Target` |
| AdvisorRecommendationPanel ~130–137 ladder explainer | (four-line TP1/runner methodology) | `At the first target, sell half and move the stop to your entry. The rest aims for the second target.` + `<HowThisWorksLink anchor="targets-and-stops" />` |
| AdvisorRecommendationPanel ~52–53 clipboard | `TP1 ${…}` / `Runner ${…}` | `First target ${…}` / `Second target ${…}` |
| SetupQualityReceipt "Replay record" row source — `src/lib/replayReliability.ts:36` | `In a full-history replay, filled ${assetType} setups ended money-positive ${rate}% of the time across ${n} out-of-sample setups…` | `Across ${n} past ${assetType} setups reserved for honest testing, filled setups ended money-positive ${rate}% of the time.` (keep the existing weak-record caution sentence appended unchanged) |
| reviewCopy.ts ~51–52 tooltip | `Estimated spread and slippage were checked against the setup's risk` | `Trading costs were checked against what the setup risks.` |

Receipt rows gain one `<HowThisWorksLink anchor="how-review-works" />` in the panel header area and `<HowThisWorksLink anchor="replay-record" />` beside the Replay record row. Confidence tile links `confidence-tiers`. Ladder prices and metric values get `font-mono tabular-nums`. All alias/white classes in the three components migrate (survey: 48 + 17 + 3 occurrences).

**Language guard test (`tests/languageGuard.test.ts`) — the stage's copy gate:**

```ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/components/workspace", "src/components/charts", "src/components/trade", "src/components/donations"];
const LIB_FILES = ["src/lib/outcomes.ts", "src/lib/replayReliability.ts", "src/lib/advisorReview.ts"];
const BANNED = [/\bTP1\b/, /\brunner\b/i, /out-of-sample/i, /\bATR\b/];

function stringLiterals(source: string): string[] {
  return Array.from(source.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/gs), (m) => m[2]);
}

describe("plain language on working surfaces", () => {
  const files = ROOTS.flatMap((r) => readdirSync(r).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map((f) => join(r, f))).concat(LIB_FILES);
  for (const file of files) {
    it(`${file} has no banned quant vocabulary in string literals`, () => {
      for (const literal of stringLiterals(readFileSync(file, "utf8"))) {
        for (const banned of BANNED) {
          expect(literal, `${file}: "${literal.slice(0, 60)}"`).not.toMatch(banned);
        }
      }
    });
  }
});
```

Identifiers like `runnerTarget` stay legal (only string literals are scanned). Files still failing because their rewrite lands in a LATER task (MarketScanPanel, OverviewPanel, GuidePanel, outcomes.ts, AdvisorWorkspace) get a temporary per-file skip list CONSTANT in the test with a comment naming the owning task; Tasks 4–6 each shrink the list; Task 7 asserts the list is empty.

- [ ] **Step 1:** write `languageGuard.test.ts` with the skip list covering exactly: `MarketScanPanel.tsx`, `OverviewPanel.tsx`, `GuidePanel.tsx`, `AdvisorWorkspace.tsx`, `outcomes.ts` — run → PASS only because targets of THIS task are not skipped and currently FAIL; iterate with Step 2 until green.
- [ ] **Step 2:** apply the copy table + chips + mono numerals + HowThisWorksLink placements + alias migration to the three components + two lib files.
- [ ] **Step 3:** update e2e pins that reference changed copy (report each). Full gates.
- [ ] **Step 4: commit** `feat: setup surfaces speak plainly — first/second targets, honest replay line, bordered chips`

### Task 4: Advisor context — workspace layout, status panels, scan

**Files:**
- Modify: `src/components/workspace/AdvisorWorkspace.tsx`, `src/components/workspace/AdvisorStatusPanels.tsx`, `src/components/workspace/VolatilityWindowPanel.tsx`, `src/components/workspace/MarketScanPanel.tsx`, `src/lib/advisorReview.ts` (~23–29)
- Test: extend `tests/languageGuard.test.ts` (remove `MarketScanPanel.tsx`, `AdvisorWorkspace.tsx` from skip list), `tests/advisorReview.test.ts` (extend or create for label helpers), e2e pins

**Binding details:**
- `advisorSignalIntervalLabel()` / `advisorExecutionIntervalLabel()` in `src/lib/advisorReview.ts` map codes to plain words before joining: `{ "1M": "1-minute", "5M": "5-minute", "15M": "15-minute", "1H": "1-hour", "4H": "4-hour", "1D": "daily" }` → e.g. `4-hour, 1-hour, 15-minute`. Unit-test the mapping. (Fixes AdvisorWorkspace ~498/501 and downstream Guide/About call sites without touching select `value`s.)
- `AdvisorWorkspace` accepts `openRequest?: { symbol: string; token: number } | null`; a `useEffect` keyed on `openRequest?.token` sets the selected market when the symbol exists in the available list, else no-ops.
- MarketScanPanel: the four-sentence methodology block (~215–220) becomes ONE line — `Scan shows the strongest qualifying setup among closely linked markets.` — followed by `<HowThisWorksLink anchor="cost-ratings" />`. The cost-label LEGEND (compact chips: Clean, Acceptable, Thin, Poor as `.chip` marks with buy/ink-muted/caution/sell text) stays per spec §6; the prose definitions move to the Guide (Task 6 provides the section). Scan preview line `Entry … / TP1 … / Runner …` → `Entry … · First target … · Second target …`. Result badges → `.chip`. Numerals mono.
- AdvisorStatusPanels: the five panels restyle to sheets + hairlines + mono numerals + `.chip` marks; RecentSetupsPanel rows each gain a quiet `View in Insights` tertiary button (text + underline pattern) calling `useWorkspaceNav().openInsights(row.symbol)`; MarketResultsPanel header gains `openInsights()` ("All results"). Engine legibility acceptance: DataHealthPanel keeps/gets a plain `Updated {relative time}` line; DeskStatusStrip's session label stays plain (already passes through reviewCopy).
- Alias migration across all four files (18 + 45 + 15 + 34 occurrences).

- [ ] **Step 1:** advisorReview label unit test (failing) → implement mapping → PASS.
- [ ] **Step 2:** layout/copy/chips/cross-links per above; shrink languageGuard skip list; full gates; e2e pins updated + reported.
- [ ] **Step 3: commit** `feat: advisor context on the editorial system — scan legend, plain intervals, insight cross-links`

### Task 5: Insights — outcome vocabulary, cross-links, editorial tables

**Files:**
- Modify: `src/components/workspace/HistoryPanel.tsx`, `src/components/workspace/HistorySetupCard.tsx`, `src/components/workspace/historyUtils.ts`, `src/lib/outcomes.ts` (~35–38)
- Test: `tests/outcomes.test.ts` (extend/create: label strings), languageGuard skip list shrinks (`outcomes.ts` out), e2e pins

**Binding details:**
- `src/lib/outcomes.ts`: `filterLabel`/`label` `"TP1 reached"` → `"First target reached"`; `shortLabel` `"TP1"` → `"Target 1"`. Any sibling runner-phrased labels follow the same scheme (`"Runner reached"` → `"Second target reached"`, short `"Target 2"`) — read the whole map and normalize.
- `HistoryPanel` accepts `initialSymbol?: string | null`; when it changes (non-null), the market filter select adopts it once (an effect keyed on the value; user can clear it afterwards).
- `HistorySetupCard` header gains a tertiary `Open in Advisor` button → `useWorkspaceNav().openAdvisor(setup.symbol)`; badges (side / outcome / category, lines ~33–52) become `.chip` marks (buy/sell for sides, outcome colors via existing historyUtils class helpers translated to token text colors, category `text-ink-muted`); `historyUtils.ts` badge-class helpers (~165–179) return the token classes.
- Stat pills → mono numerals on sheet cards; filters row → `.field` selects (kit class exists); grouped lists get hairline rules and generous row height (spec §5 tables).
- Alias migration (59 + 14 + 12 occurrences).

- [ ] **Step 1:** outcomes label unit test (failing) → rewrite labels → PASS.
- [ ] **Step 2:** panel/card/API per above; languageGuard shrinks; gates; e2e pins (survey shows pins at lines 74–80 incl. "Insights" heading — heading stays "Insights") updated where copy moved.
- [ ] **Step 3: commit** `feat: insights read plainly — target vocabulary, advisor click-through, editorial tables`

### Task 6: Guide, About, Profile, Donate — depth lands where links point

**Files:**
- Modify: `src/components/workspace/GuidePanel.tsx`, `src/components/workspace/OverviewPanel.tsx`, `src/components/workspace/ProfilePanel.tsx`, `src/components/donations/DonatePanel.tsx`, `src/components/donations/DonationOptions.tsx`, `src/components/workspace/ThemeToggle.tsx`
- Test: languageGuard skip list shrinks to empty except none (remove `GuidePanel.tsx`, `OverviewPanel.tsx`), `tests/e2e/authenticated-workspace.spec.ts` (guide anchors + pins)

**Binding details:**
- `GuidePanel` accepts `anchor?: GuideAnchor | null`; an effect scrolls the matching section into view (`document.getElementById(anchor)?.scrollIntoView({ block: "start" })` after paint) — sections carry `id`s exactly matching the Global-Constraints anchor list: `how-review-works` (the 5-step workflow section), `targets-and-stops` (teaches "first target (TP1) — bank half, stop to entry" and "second target (the runner)" — the ONE place precise terms appear), `confidence-tiers` (existing tier glossary), `replay-record` (NEW section: what the replay record is, why it exists, what a weak record means — the survey found this had no explanatory home), `cost-ratings` (NEW: Clean/Acceptable/Thin/Poor definitions relocated from MarketScanPanel's old paragraph), `timeframes` (existing explainer; interval codes become plain words via the Task-4 helpers or literals).
- GuidePanel fixes the mismatched pair at ~74–76: label `Valid until`, value `The time the setup expires if price has not reached the entry.`
- The 5-step workflow section's steps each gain a tertiary link INTO the app where actionable: step 1/2/3 → `openAdvisor` (no symbol → plain `setActiveTab` via `openAdvisor("")` is NOT allowed; instead `useWorkspaceNav().openInsights` only where a symbol-less destination exists — concretely: step 5 "Review insights" links `openInsights()`; steps 1–4 get no link since Advisor needs no seed). Keep it minimal: exactly one link, on step 5.
- `OverviewPanel` (~20, 29–30): `Entry, stop, TP1 and runner targets…` → `Entry, stop, and two profit targets…`; raw `4H, 1H, 15M` / `5M, 1M` values → the Task-4 plain-label helpers.
- `ProfilePanel`: review-pattern rows gain `Open in Advisor` tertiary buttons (`openAdvisor(symbol)`); activity summaries get an `All insights` link (`openInsights()`); mono numerals; alias migration. ThemeToggle keeps Light/Dark/System, migrates its 5 alias + 1 white classes.
- Donate pair migrate their 11 alias occurrences (copy already differentiated in Stage 2 — do not change the strings).

- [ ] **Step 1:** e2e (failing): navigating via a receipt `How this works` lands on `#replay-record` visible in Guide. Implement anchors + panels → PASS.
- [ ] **Step 2:** copy + links + migration per above; languageGuard shrinks; gates; pins reported.
- [ ] **Step 3: commit** `feat: the guide becomes the depth layer — anchored sections, plain overview, linked profile`

### Task 7: Alias deletion, auth completion, guard tightening

**Files:**
- Modify: `src/components/auth/AuthScreen.tsx` (24 remaining alias/white occurrences; sign-in email field adopts the `.field` kit class), `src/styles/index.css` (delete the legacy alias lines from the `@theme` block: navy/slate/bullish/canvas/warning/danger; delete the `html[data-theme="dark"] .bg-white…` compensation overrides in `@layer utilities` ~262–305), `tests/designTokens.test.ts` (invert: assert aliases are ABSENT; add data-theme override-block pins for `public/legal/legal.css`), `tests/languageGuard.test.ts` (skip list asserted empty; extend ROOTS with `src/components/auth`), `tests/e2e/public-auth.spec.ts` (restore `emulateMedia`-based assertions that the app PRODUCES `data-theme` for system mode, alongside the existing computed-style test)
- Test: full suite is the deliverable

**Binding details:**
- Deletion order: first migrate AuthScreen (leave-it-clean), then repo-wide grep must show zero usages of every alias utility and zero `bg-white|text-white|border-white` in `src/` — only then delete the alias definitions and the `.bg-white` dark shims. If any straggler file surfaces in the grep (a file no earlier task touched), migrate it in THIS task and list it in the report.
- `tests/designTokens.test.ts`: replace the alias-presence pins (lines ~35–40) with `assert.doesNotMatch(s, /--color-navy|--color-slate|--color-bullish|--color-canvas|--color-warning|--color-danger/)`; ADD (Stage-2 carry-forward) `assert.match(legal, /html\[data-theme="dark"\]\s*\{/)` and the light twin against `public/legal/legal.css`.
- `tests/e2e/public-auth.spec.ts`: add back a test using `page.emulateMedia({ colorScheme: "dark" })` asserting `html` gets `data-theme="dark"` in System mode (the app-produces-the-attribute half the Stage-2 rewrite dropped).
- AuthScreen keeps every state branch's behavior identical — class-level migration only, except the email input shell which adopts `.field` (the Stage-2 ledger carry-forward); the computed-style e2e from Stage 2 pins the shell's resolved colors — update that pin to the `.field` values and report it.
- Final sweep: `grep -rn "bg-navy\|text-slate\|bg-canvas\|bg-white" src/` → empty; `npm test` (incl. contrast, languageGuard with empty skip list, designTokens), tsc, eslint, build, all e2e.

- [ ] **Step 1:** migrate AuthScreen + field kit; update the two e2e specs; run gates.
- [ ] **Step 2:** repo-wide grep sweep → migrate stragglers → delete alias block + white shims → invert designTokens pins → gates again.
- [ ] **Step 3: commit** `feat: the legacy palette is gone — aliases deleted, auth on the kit, guards tightened`

---

## Self-review checklist (run after writing, before dispatch)

- Spec coverage: §5 kit (chips/tables/gauge/chart/tabs) → Tasks 2–5; §6 workspace surface list → Tasks 1, 3–6; §7 plain-language + adjacency + engine legibility → Tasks 3–6 + languageGuard; §9 → constraints + contrast CI; §10 3a/3b split → Tasks 2–4 = 3a, 5–6 = 3b; Stage-2 ledger carry-forwards (field kit, AuthScreen aliases, designTokens/emulateMedia guards) → Task 7. Donate alias debt → Task 6.
- The three IA violations from the survey each have a home: outcome fragmentation → Tasks 4–5 cross-links + in-place summaries; missing disclosure pattern → Task 1 component + Tasks 3–6 placements + Task 6 anchor sections; no symbol click-through → Tasks 4–6 `openAdvisor`/`openInsights`.
- No placeholders; interfaces named exactly; anchor ids pinned once and reused.
