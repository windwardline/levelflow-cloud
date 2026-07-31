# Levelflow — The Desk (Stage 3.5) Design

Owner-approved via three mockup rounds on 2026-07-30 (The Desk concept A,
v2 refinements, v3 rulings, tab set). This spec is the authority for the
Stage 3.5 build. Token/type authority remains the visual-overhaul spec
(`2026-07-29-levelflow-visual-overhaul-design.md` §3); language rules here
extend its §7.

## 1. Goal

Recompose the workspace around the trade being taken: chart as visual
anchor, the setup and its justified context as the value, active-trade
management as a first-class surface. Kill the box-on-box layout. Mobile is
its own composition, not a narrowed desktop.

## 2. Desktop layout — The Desk

Three columns inside a fixed viewport (`height: 100vh − header`); the page
never scrolls, each column scrolls independently.

- **Header**: wordmark; nav Desk · Insights · Guide · Profile; broker chip
  (E8 Markets, green dot); Sign out.
- **Left rail (~264px)**: the scan. Eyebrow "Scan" + `Scan now` button;
  scope dropdown (§4); scoped count line; results list (§5).
- **Stage (center)**: no surface title or eyebrow — the market picker IS
  the header (same order contract as §4), followed by the side tag,
  confidence unit (§6), chart with dashed level lines, then a two-column
  sheet: ladder with per-value copy (§7) | "Why this setup" rows (Market /
  Location / Timing / Costs / Record) + "How this works" link into Guide
  anchors.
- **Right rail (~300px)**: "Current trades" (§8).

**Platform parity (owner ruling, standing)**: every ruling in this spec
applies to desktop and mobile alike unless the owner explicitly scopes it
to one. A refinement stated once binds both compositions.

**Copy discipline (owner ruling)**: no process-narration labels and no
self-explanatory blurbs. A line of copy ships only when it changes what
the user does. Ruled out by name: "Reviewing — any market, scanned or
not", "Fresh chart data on every scan — you decide when", "Strongest
first, by confidence", the trades-rail footnote. Ruled in: the
closed-market reopen time (§10b) — it tells the user when to come back.
Behavior that speaks for itself gets no caption.

**Scrollbars**: every scrollable column uses thin overlay scrollbars —
`scrollbar-width: thin; scrollbar-color: var(--hairline) transparent` plus
6px `::-webkit-scrollbar` with hairline thumb, transparent track. No
layout-consuming scrollbars anywhere, including inside the scope dropdown.

## 3. Mobile layout

Bottom tab bar: **Review · Scan · Trades (badge = current-trade count) ·
Insights**. Header: wordmark, compact broker chip, account avatar button
(opens Profile / Sign out). Each tab is the corresponding surface
recomposed for touch: Review = chart + confidence line + copy rows +
plain-language why; Scan = scope + `Scan now` + results; Trades = §8 as a
tab; Insights = §10 condensed. All tap targets ≥44px.

## 4. The scan scope menu (universal contract)

One dropdown, three scope kinds, identical on desktop and mobile (mobile
renders it as a full-screen sheet):

1. **All markets** (first row)
2. **Groups, alphabetical**: Crypto, Energies, Forex, Futures, Metals —
   each group row itself selectable, with a right-aligned uppercase
   affordance: "SCAN {N}" when open, availability label when closed
   (§10b)
3. **Markets nested under their group**, sorted alphabetically by base
   currency then quote currency

`AVAILABLE_ASSET_GROUPS` (symbolMap.ts) already stores groups and options
in exactly this order — the menu maps it without a re-sorting layer.
Selecting a market scopes the scan to that one market and the stage
follows; the stage picker stays as the direct review shortcut and the two
stay in sync. **Menus are alphabetical for finding; results are sorted by
confidence for deciding — that is the only sorting deviation, and it is
existing production behavior (`scanRanking.ts` — do not change, add a
pinning test).**

## 5. Scan behavior and counts

- **User-initiated only** (click-only engine, unchanged) and **fresh chart
  data on every scan** — no cached bars on the scan path; assert in e2e
  that consecutive scans hit the provider fetch path. No copy narrating
  either behavior (§2 copy discipline).
- **Count accuracy**: the line reads "`{scope} — {scanned} scanned ·
  {qualified} qualify · {time}`". `scanned` = symbols actually attempted
  (server truth), `qualified` = opportunities returned. The current UI
  ("X shown from Y reviewed" with a client-filtered X) does not reconcile;
  the new line must come from server numbers only. Server adds a
  `qualified` count to the scan response (today: `scanned` exists,
  qualified is implicit as `opportunities.length` — make it explicit).
- Row: symbol, "Buy/Sell · confidence N", cost chip (Clean / Acceptable /
  Thin). No sort caption — the order itself is the communication.

## 6. Confidence presentation

Never a bare number. Canonical unit: label **Confidence**, value
**"N of 100"**, slim meter (~150×5px, accent fill) with a tick at the
class's qualifying threshold, and a one-line note: "{Class} setups must
score {threshold} to qualify — this one clears it with room to spare"
(wording adapts when the margin is thin). Rail/mobile rows use
"confidence N" in text. Thresholds come from live calibration — never
hardcode.

## 7. The ladder and copy

- **Per-value copy everywhere** (desktop and mobile): each of Entry /
  Stop / Target 1 / Target 2 is individually copyable — value + subtle ⧉,
  flipping to ✓ on copy. **The bundled "Copy levels" button is removed**
  (`AdvisorRecommendationPanel.tsx:153` today).
- Labels: "Target 1 · bank half", "Target 2 · take-profit".
- **Canonical instruction, verbatim, everywhere the values appear**
  (desk ladder, mobile review, guide): "Set your take-profit at Target 2.
  When price reaches Target 1, close half and move your stop to your
  entry — profit locked either way."

## 8. Current trades (right rail / Trades tab)

- Title: **"Current trades"**. No explanatory footnote — the surface is
  self-explanatory. Only two statuses live here, each with
  a chip: **Pending** (order placed, not filled — caution color) and
  **Open** (filled — buy color). Closed trades leave the rail; Insights
  holds them.
- Each card: symbol · side · status chip; right-aligned progress (+N R for
  open, "—" for pending); a state-derived instruction line; the remaining
  levels in mono.
- **Instructions are computed from live state at view time**, never
  static: pending → "Order pending at {entry} — nothing to do yet";
  open pre-T1 → stop/target reminder; T1 hit → "Target 1 hit {age} —
  bank half, move stop to {entry}" (caution accent until acknowledged by
  price moving on); post-T1 → "stop should be at your entry — Target 2
  {price}". Language is TradeLocker-aligned: **"pending", never
  "resting"** (add "resting" to the languageGuard ban list).
- **Freshness**: header stamp "as of {time} · refresh". The rail
  force-refreshes outcome state **every time the surface is shown** —
  including re-navigation — bypassing the 60s throttle
  (`useTradeSetups.ts` already has `forceOutcomeRefresh`); the manual
  refresh button remains and stays.
- Event ages shown ("hit 14 min ago") from outcome timestamps.

## 9. Engine: every setup is history

- **Persist every generated setup, scan path included.** Today only the
  single-market `generate_setup` path inserts (`upsertActiveSetup`,
  index.ts:1255); `scan_opportunities` returns candidates in memory only.
  The scan handler persists each qualifying opportunity for the requesting
  user with an **`origin` column** on `trade_setups`
  (`'review' | 'scan'`, migration + backfill default `'review'`).
  Dedupe against the existing same-side active-setup logic so a scan
  followed by a review of the same market doesn't double-log.
- Outcome tracking covers scan-origin setups identically (outcome-sync is
  already setup-driven; verify the insert shape matches its query).
- Rationale (owner): "I want to iterate based on every setup it
  identifies and generates for a user, regardless of the tooling."

## 10. Insights recomposition

- Head: "Insights" + record band (setups this week · money-positive % ·
  net R · best market).
- One filter row: Market (scope menu §4), Status (All / Open / Pending /
  Closed), Period. **No origin filter and no origin column in the UI**
  (owner ruling: from the user's seat every logged setup arrives the same
  way; the distinction adds nothing). The database `origin` field (§9)
  stays as silent bookkeeping for engine analysis only.
- Day-grouped table: Market · Side · Confidence ·
  Entry · Stop · Target 1 · Target 2 · Result. Results carry outcome +
  realized R where resolved ("Open · +0.8R", "Target 2 · +2.1R",
  "Stopped · −1.0R", "Banked half · +0.4R", "Pending", "Unfilled",
  "Not taken" for scan-origin setups never placed).
- Footer: "Every setup Levelflow generates is saved here automatically,
  taken or not. Your record is tracked per broker: E8 Markets."
- `realizedR` lives in `trade_outcomes.feedback` jsonb (no column) — read
  it there; `realized_pnl` is always null today.

## 10b. Market availability (replaces the session clocks)

The old build's four session clocks are not carried forward, but their
job — telling the user what is tradeable right now — is, in a quieter
form. The engine already enforces the underlying rules (session-aware
scoring and penalties, per-class low-edge UTC hour gates, high-impact
news blocking, Friday-close cutoffs on expiry); this section is purely
about showing availability.

- **Scope menu**: a closed group or market renders muted and
  unselectable — the grey state itself says "closed"; the word never
  appears. Its right-aligned affordance (same slot as "SCAN {N}") reads
  **"OPENS {H:MM}{A|P} {DDD}"** on one line — compact time, then the
  **3-letter day, always present even when it is today** ("OPENS 6:00P
  WED", "OPENS 5:00P SUN"). The reopen moment is exact, in the **user's
  local machine timezone** (`Intl.DateTimeFormat`). The weekend is the
  case that matters most: crypto trades while every other class waits
  for its Sunday open. A date replaces the day when the reopen is beyond
  the coming week (holidays). Identical treatment on desktop and in the
  mobile sheet.
- **Scan**: closed markets are skipped and the scanned count reflects only
  markets actually attempted — the count line stays honest without extra
  copy; the menu carries the why.
- **Stage**: reviewing a closed market shows a quiet inline notice with
  the next-open time in local time instead of a chart error.
- **Implementation**: a small `marketHours` module — per-class calendars
  (forex/metals 24/5 with the Sunday open and Friday NY close, CME
  complex incl. the daily 5–6 pm ET maintenance break and weekends,
  crypto 24/7) — unit-tested against known boundary times, sharing
  constants with the existing weekly-close logic
  (`getUpcomingWeeklyCloseTime`) rather than duplicating them.

## 11. Guide and Profile

- **Guide**: sticky left anchor TOC (existing six-anchor set), editorial
  article column; the canonical instruction (§7) featured as an accent
  callout; a "what the words mean here" definition list including Bank
  half / Move your stop to your entry / Pending. Existing GuidePanel
  teaching allowlist carries over.
- **The About tab is retired.** Its relevant, non-redundant content MUST
  be absorbed into Guide (checklist, from OverviewPanel.tsx): limit
  orders only; the review intervals (setup review 4H/1H/15M, price check
  5M/1M); what a review checks (direction, price location, volatility,
  session timing, news, rates, closely linked markets, past results);
  the honesty rule that a stale setup is cleared and "no setup" is a
  real answer; the correlation rule (closely linked markets qualify
  together → the stronger setup is kept); learning is shared across
  Levelflow; and the boundary — Levelflow reviews markets, it does not
  place trades. Marketing positioning copy does not carry over.
- **Profile**: single ~620px column — Account (email, member since, sign
  out), Broker (E8 chip + "Setups are tuned to this broker's markets and
  costs, and your Insights record is kept per broker."), Appearance
  (Light/Dark/System segmented), legal links + colophon line.

## 12. Broker posture

E8 Markets is a visible chip on every surface (header, mobile compact).
It is presentation only in this stage — no toggle, no second broker.
Architecture note: per-broker calibration and per-broker history are the
declared future; keep broker identity out of hardcoded copy except where
this spec states it.

## 13. Out of scope (Stage 3.5)

Multi-broker toggle and per-broker models; Stage 4 brand finish
(favicon/og/motion); further Insights analytics beyond §10; any engine
calibration change.

## 14. Verification bar

- languageGuard: add "resting" (and keep the existing bans); canonical
  instruction string pinned by test where rendered.
- scanRanking pinning test (confidence-desc with payoff tiebreak).
- Count reconciliation test: rendered counts equal server `scanned` /
  `qualified`.
- e2e at 375px and 1280px, authed: scope menu order (All markets → groups
  alphabetical → base/quote-sorted markets), per-value copy, trades-rail
  refresh-on-navigation, scan persistence visible in Insights.
- marketHours unit tests at boundary times (Friday close, Sunday open,
  CME daily break, crypto always-open) + local-time rendering check.
- Guide review against the §11 About-content checklist before ship.
- Contrast suite unchanged (existing tokens only).
- Live verify on production behind the parking gate before close.

## 15. Current-state facts for the planner (recon 2026-07-30)

Single insert site `upsertActiveSetup` index.ts:1255 (generate_setup path
only); scan response `{ blocked, opportunities, scanned }` — no qualified
count; UI counts currently mix client-filtered numbers
(MarketScanPanel.tsx:237); workspace is a stacked grid in
AdvisorWorkspace.tsx:306-495 with the picker inline at :385-410 fed by
AVAILABLE_ASSET_GROUPS; outcome refresh path `refreshTradeOutcomes` +
`forceOutcomeRefresh` in useTradeSetups.ts (60s throttle); trade_setups
has no origin column; setup_status enum
generated|placed|filled|invalidated|cancelled|expired; outcome enum
pending|unfilled|take_profit|stop_loss|breakeven|manual_close|expired|
ambiguous|tp1_partial|expired_in_profit|expired_at_loss; "resting" does
not occur in src today; "Copy levels" occurs once
(AdvisorRecommendationPanel.tsx:153).

## 16. Visual-fidelity remediation (2026-07-31, binding)

The 2026-07-31 ship implemented this spec's behaviors but not the approved
composition: production kept the old app chrome and stage furniture inside
the new grid, and the owner rejected it against the mockups ("still the
box-on-box formatting, much of the old features remain"). Root cause: the
plan scoped the shell as "a rearrangement, not a redesign," so no task
deleted the legacy chrome, and reviews verified new-element presence but
never old-element absence.

**Authority.** The owner-approved mockups are committed at
`docs/design/mockups/` (`a-desk-v3.html`, `i-insights-v1.html`,
`g-guide-v1.html`, `p-profile-v1.html`, `m-mobile-v3.html`,
`m-mobile-v3-menu.html`, `m-scan-v1.html`, `m-trades-v1.html`,
`tokens.css`, plus reference PNGs). Where this spec's prose and a mockup's
composition disagree, **the mockup governs composition; the spec governs
behavior, data, and copy rulings.** Copy lines the owner ruled out by name
stay out even if a mockup iteration carries them.

**Kill-list (must be absent from the authed app):**

- The "Welcome, {display name}" greeting — deleted, both platforms.
- The header theme toggle (authed app) — the Profile Appearance card is
  the only theme control. Parking/Auth screens keep their compact toggle
  (out of the mockups' scope).
- Header Help and Donate buttons (desktop) — relocated, see below.
- The two-row header — replaced by the single-row masthead
  (a-desk-v3.html:75-84): wordmark + inline text nav
  (Desk/Insights/Guide/Profile; uppercase, letterspaced, muted; active =
  ink + 2px accent underline) + broker chip + ghost Sign out.
- Icon-chip nav buttons (`nav-button` pills) on desktop — replaced by the
  masthead text links.
- `DeskStatusStrip` and `MarketClockPanel` (DATA/SESSION/ADVISOR/MARKET
  HISTORY tiles; GLOBAL FX SESSION cards) — deleted with their file.
- The CHART VIEW / ADVISOR CHECKS / VALID UNTIL metric cards — deleted;
  valid-until becomes one quiet line in the ConfidenceUnit meta
  ("Reviewed {time} · valid until {time}"), no card.
- The standalone stage Refresh button — Review market is the stage's one
  action (fresh data every review); the trades rail keeps its own
  refresh link.
- The scan rail's panel title block ("Market scan / Best current
  markets") and the legend box — replaced by the mock's quiet rail
  (a-desk-v3.html:87-158): eyebrow Scan + Scan now, scope select, count
  line, result rows, single footnote.
- `terminal-panel` boxing on Desk/Insights/Guide surfaces — flat paper
  with hairlines per mocks; boxes remain only where a mock draws a card
  (position cards, Profile cards, Insights table container).

**Relocations:** Help (mailto) and Donate move to a quiet Support card on
Profile (two tertiary links) — the mobile avatar menu already carries
both. This is an addition beyond p-profile-v1.html (which shows no
support entry) so the features stay reachable on desktop; flagged for
owner review at re-present.

**Presentation rules from the mocks:** Desk columns scroll themselves with
thin scrollbars (a-desk-v3.html:14-17 `.scrolly`); Guide is an editorial
article (230px sticky TOC + flowing 62ch prose, hairline separations, no
per-section cards; g-guide-v1.html:12-21); Profile is a 620px column
("Profile" title + tight cards; p-profile-v1.html:12-15); Insights is a
flat page (record band, inline filter row, one table; i-insights-v1.html).

**Review discipline (new, standing):** every review of composition work
must verify BOTH directions against the mock — required elements present
AND kill-list elements absent — and name each direction explicitly in its
report.
