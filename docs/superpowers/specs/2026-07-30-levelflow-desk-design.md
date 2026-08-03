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

> **As built (2026-08-03, the beyond-window actives fix).** The rail and the
> Trades badge count the rail's own population, not the ledger's 80-row
> display window: newer resolved rows can push a still-live trade past the
> window (one active row per symbol, each bounded by its class's 5–12h
> review horizon — but nothing bounds how many resolutions land above it),
> and a rail that loses a live trade is the opposite of this surface's
> purpose. `useTradeSetups` classifies the lifetime record's rows with the
> rail's own predicate (`isActiveSetup`, the extracted gate
> `deriveTradeState` itself runs) and hydrates the actives the window
> missed by id, at the window's full width, so a reopened card still
> restores the Advisor stage from its stored analysis. In the steady state
> the hydration read never fires — every active is inside the window and
> the id list is empty. Insights keeps reading the display window (§18:
> the ledger IS that window).

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
  net R · best market). The last three read the **lifetime** aggregate, not
  the loaded page — §18 carries that ruling and the one aggregate serves
  both; "setups this week" stays the period stat it says it is.
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

## 17. Post-ship owner rulings (2026-07-31 evening, binding)

- **Timeframes are two characters universally** — 1H, 4H, 1D (every
  surface that names a timeframe: stage chart-view select, Profile's
  default-timeframe select, any option labels). The stage's action button
  is **"Review"** (not "Review market"). The stagehead must never truncate
  the market name.
- **Insights result "Not taken" is dead.** `entry_not_filled` reads
  **"Unfilled"** for every origin — a market fact (price never reached the
  entry inside the window), never a claim about what the user did. The
  label logic reads no origin.
- **Confidence meta stamp format** matches the scope menu's availability
  grammar, extended with the date: `{MMM} {D} {h}:{mm}{A|P}` — three-char
  month ALL CAPS, 1-2 digit day, minutes always two digits, single capital
  A/P with **no space** before it (e.g. `Reviewed JUL 31 2:05P · valid
  until JUL 31 10:05P`). Quiet, not intrusive; shares its time formatting
  with the menu's OPENS lines so the two can never drift.
- **Help and Donate are first-class**: never hidden or buried, placed
  thoughtfully, same furniture and testing standards as everything else.
  Placement set: (a) the page footer's link row carries Help and Donate
  beside the legal trio on every scrolling surface; (b) the Guide article
  ends with a short Support section (email + donate, tertiary links, no
  card chrome beyond the article's own rhythm); (c) Profile keeps its
  Support card; (d) the mobile avatar menu keeps both. The Desk's fixed
  desktop shell stays footer-less — Help remains one tap away everywhere.
- **Expand chart ships on mobile** (owner: "I do not want to skip
  features just because we can"): an "Expand chart" affordance opens the
  same MarketChart full-viewport (100dvw/100dvh overlay) with its level
  lines and theme reactivity; 44px close target, Escape and focus trap,
  aria-modal, functional labels only. With it, the inline mobile chart may
  take the mock's compact height.
- **Inline Guide links on the why panel stay** (owner-confirmed; E4
  cross-links standard).
- Still awaiting owner ruling (do NOT build until given): the merged
  mobile Scan surface (m-scan-v2 mock) and the 3-vs-4 bottom-tab count.

### §17b. One lifecycle vocabulary (owner ruling, 2026-07-31)

Pending and Unfilled are the same limit-order mechanism at two moments —
Pending while the order waits inside its window, Unfilled once the window
closed without a fill — and every surface uses exactly these words, at
every opportunity: **Pending → Open (· ±R) → Unfilled / Banked half /
Target 2 / Stopped / Expired in profit / Expired at loss.** "Still
tracking" and "Tracking" are banned (languageGuard): any cell, chip,
filter, or copy that named them renders the lifecycle word the state
machine actually reports. The Status filter option spanning both
unresolved states reads "Pending & open" — existing vocabulary only. The
Guide's §10 definition ("Pending — your order is placed but has not
filled") is already the canonical teaching and stays.

### §17c. Owner live-QA rulings (2026-07-31, Safari desktop, binding)

Live product outranks mock where they conflict.

- **Desk rail empty state**: the two narration lines ("Scan every active
  market…", "Every setup Levelflow generates is saved to Insights
  automatically.") are DELETED — the approved mock's footnote is
  superseded. The empty rail is the controls, quietly stark. If anything
  ever fills that space it must be useful and succinct, not narration.
  (The same footnote leaves the pending m-scan mock at build time.)
- **Current trades top rhythm**: the rail's first line must share the
  same top offset/baseline rhythm as the SCAN eyebrow and the stagehead —
  no thin unfinished margin, and no added busy-ness: alignment, not
  decoration.
- **Insights below-table blurb** ("Every setup … taken or not. Your
  record is tracked per broker…") is DELETED — the Guide teaches it and
  the page shows it. ("taken or not" dies app-wide with it.)
- **Footer, one standard everywhere**: a single footer component,
  identical composition, dimensions, and spacing on every scrolling
  page and view, always at the true bottom of the viewport when content
  is short (flex column, footer pinned via mt-auto) and after content
  when long. Carries the §17 link row (legal trio + Help + Donate) and
  the colophon. The Desk's fixed desktop shell stays footer-less.
- **Guide TOC**: entries carry the same two-digit numbers as their
  sections (01-10); and the TOC must not jump when scrolling begins —
  its sticky offset equals its natural resting offset so engagement is
  seamless.
- **Profile revamped, desktop-first**: the card stack (p-profile-v1) is
  REJECTED on desktop ("stacked like a mobile view"). Profile becomes a
  flat editorial settings sheet: hairline-separated sections (Account,
  Broker, Appearance, Support), each a label column beside its
  content/controls, no card chrome, comfortable desktop width; mobile
  stacks the same rows naturally. Mock approval required before build.
- **Box-on-box, global and standing**: sweep every remaining gratuitous
  box on every tab, view, and platform. A bordered sheet survives only
  where it is a true interactive affordance (result/position rows, form
  fields, buttons) or the mock-drawn Insights table frame — never as
  passive grouping. languageGuard-style CI enforcement where a guard can
  pin it.
- **The deploy notice radiates (owner, 2026-08-03, mockup A of
  `docs/design/mockups/deploy-notice-v1.html`)**: the reload notice wears
  the Scan button's own kit chrome (`.primary-button`, a solid fill — not
  a bordered box) in ALL CAPS (a CSS transform; the §20j-pinned sentence
  is unchanged) and carries the app's ONE sanctioned glow — the
  `.phosphor-pulse` kit class, layered accent depth-shadows breathing on a
  2.4s alternate, held static under `prefers-reduced-motion`. The element
  exists to interrupt; nothing else may take the class. A radiance draws
  no perimeter, so the box-on-box sweep above is untouched by it. Full
  measure below lg, content-width beside the nav at ≥lg; the 44px floor
  is the kit's own.

### §17d. The result vocabulary — canonical (owner-approved verbatim, 2026-07-31)

Supersedes §17b's label table (the mechanism stands; these are the words).
Engine outcome ENUM values and classifyWinLoss are untouched — this is
label copy only. The seven results, everywhere a result renders:

- **Pending** — order placed, window open, not yet filled
- **Open · ±R** — filled and live inside the window (R only when the
  engine has one)
- **Unfilled** — window closed, never triggered
- **Banked half · +R** — first target hit, half banked, window ended
  before Target 2
- **Banked full · +R** — Target 2 reached (replaces "Target 2" as the
  result label; pairs with the Guide's "bank half" instruction language)
- **Stopped · −R** — stop hit
- **Expired · +0.6R / Expired · −0.3R** — filled, window ended, neither
  level hit; ONE word, the number says where it stood (replaces "Expired
  in profit"/"Expired at loss" as labels; bare "Expired" if no R was
  recorded)

Status-filter options and OUTCOME_COPY filter/short labels re-derive from
these words ("Pending & open" stays the unresolved bucket per §17b). The
Guide's "What the words mean here" section teaches these exact
definitions (the owner approved the definition lines verbatim — use them
as the deck text, replacing/adding entries as needed).

### §17e. Approved: the mobile merge and the Profile revamp (2026-07-31)

Owner approved, mocks committed as composition authority:

- **docs/design/mockups/m-scan-v3.html** — the merged mobile Scan surface
  (supersedes m-scan-v1/m-mobile-v3's separate Review+Scan tabs): fixed
  viewport; pinned control row (scope menu · 2-char timeframe · Scan) +
  market head + compact chart w/ Expand chart; one scrolling region below
  (single-line ladder copy rows, one-line why + Why, count line,
  qualified list; selection swaps the chart). Scanning a single-market
  scope IS the review — one surface, one verb. Bottom bar is THREE tabs:
  Scan · Trades (count badge) · Insights; Profile and Guide live in the
  avatar menu.
- **docs/design/mockups/p-profile-v2.html** — Profile as the flat
  editorial settings sheet (supersedes p-profile-v1): hairline rows
  (Account / Broker / Appearance / Support), label + approved terse
  descriptions left ("Sign-in and membership." / "Markets, costs, and
  record follow the broker." / "Saved to your account." / "We read every
  note."), content right, no cards; the standardized §17c footer pinned
  at page bottom. Description rule, standing: a row description says only
  what the row cannot show.

### §17f. The copy law (owner-crowned, 2026-07-31)

**Text says only what the surface cannot show.** This is the general form
of every copy ruling in this spec — the killed captions, the deleted
narration, the terse Profile descriptions — and it governs all future
copy on every surface, both platforms. Before any sentence ships, the
test is: does it state something the user cannot already see? If the
control, the layout, or the data shows it, the sentence does not exist.

### §17g. Mobile fixed-viewport discipline (owner ruling, 2026-08-01)

- **No mobile view scrolls as a whole screen.** Every <lg surface is a
  fixed-viewport frame (the merged Scan screen's pattern): chrome pinned,
  and the necessary list/content region scrolls within itself — flat, no
  box chrome (the box-on-box rule governs scroll regions too; hairline
  separation at most, thin scrollbars).
  - Scan: already compliant (pinned controls/head/chart; one scroll
    region).
  - Trades: the trade cards list is the scroll region; rail header
    pinned.
  - Insights: record band + filters pinned; the ledger (day groups +
    rows) is the scroll region.
  - Profile: fits the frame; if content ever exceeds it, the rows region
    scrolls internally.
  - Guide and Donate (avatar-menu surfaces): pinned title, body scrolls
    internally.
- **The footer exists on mobile ONLY inside the Profile view, reduced to
  the colophon** ("A Windward Line production"). The link set (Help ·
  Donate · Risk disclaimer · Privacy · Terms) moves to the bottom of the
  avatar account menu — as small as possible while legible and usable
  (44px targets still bind). Desktop's §17c footer standard is unchanged
  at ≥lg.

### §17h. The Levelflow mark (owner-chosen, 2026-08-01: "A")

The level lines: a rounded-square tile carrying three horizontals from the
app's own chart — target (ink, full width), entry (accent, full width),
stop (ink at 45% opacity, shorter). Canonical geometry on a 32-grid:
tile rx 7; lines x=7, heights 2.6, rx 1.3, at y 9 / 14.7 / 20.4; widths
18 / 18 / 12. Fills come from the app's real tokens — the mark IS the
palette, never approximated hexes. Tile per rendition: light = paper;
dark = the dark --color-sheet (a tile equal to its surrounding paper is a
tile with nothing under it — sheet is the app's own elevated-plane
token); on the og card's paper ground the corner mark takes the same
lesson lightward: sheet tile with a hairline edge, the app's card idiom.
Lines are ink, entry is accent, in every rendition. It becomes the favicon set
(SVG + PNG fallbacks + apple-touch), the manifest icons, the og-image's
corner mark (the card itself stays editorial: wordmark, accent rule,
"Market review — daily edition"), and replaces the borrowed
windward-line-mark.svg on the 404 and legal pages.

### §17i. The desktop frame, single-home links, and the satellite brand (owner rulings, 2026-08-01)

- **Desktop is an app-shell frame on EVERY page — no exceptions**
  (owner: "Every single page."): the authed tabs (Desk, Insights, Guide,
  Profile, Donate) AND the seldom-used set (parking, login, the legal
  trio, 404). Top chrome pinned (the masthead where one exists; the
  page's own head region otherwise), THE footer pinned bottom and always
  visible, the content region scrolling between them (100dvh frame, the
  §17g pattern lifted to ≥lg with the footer inside). The Desk's three
  columns keep scrolling internally above it. Satellite pages carry the
  same footer composition with links that work in their context (static
  pages link Donate to the app root; Help stays the mailto; legal links
  absolute).
- **Each link lives in exactly one home per platform.** Desktop: the
  footer (Help · Donate · Risk disclaimer · Privacy · Terms) — so the
  Guide's Support section and Profile's Support row are DELETED (both
  platforms; on mobile the avatar menu is the one home, as previously
  ruled, and the mobile Profile view keeps only its colophon).
- **The mark reaches the satellite pages**: mark A rendered small above
  the eyebrow on the parking page, the login hero, the legal trio, and
  the 404 — one consistent treatment. Donate and Help verified in-idiom.
- **The mobile avatar trigger renders mark A** (not the account initial);
  44px target and accessible name unchanged.
- **Favicon, org standard**: the head carries the full cross-browser set
  in the order Safari and Chrome each need (ICO + sized PNGs + SVG +
  apple-touch + manifest), on the app AND the static pages, so the icon
  shows in Safari and Chrome alike — the standard every repo follows.

### §17j. The durable parking page (owner ruling, 2026-08-01)

The parking layout is a saved, reusable standard — mark, eyebrow,
wordmark, accent rule, one body line, THE footer in the frame — and its
copy must fit ANY future pause, not the occasion that built it. The
canonical body line:

> **The desk is closed while we work on it. Sign-in resumes the moment
> it reopens.**

Fifteen words, no duration promised, no work explained (§17f — the page
cannot show why it is closed, only that the closure is deliberate and
ends). "The desk" is the product's own vocabulary. The
"UNDER CONSTRUCTION" eyebrow stays — already situation-agnostic.

### §17k. The colophon links home (owner-approved, 2026-08-01)

"A Windward Line production" is a link to https://windwardline.com —
provenance you can follow, everywhere the colophon appears (the desktop
footer on every framed page, the mobile Profile colophon, the four
static pages), with ONE treatment: muted text exactly as at rest today,
no underline until hover/focus, `target="_blank"` +
`rel="noopener noreferrer"` so it never navigates the workspace away,
44px hit target per the kit floor. A guard pins the target URL, the
new-tab behavior, and the at-rest quietness on every occurrence.

### §17l. Launch (2026-08-01, owner: "go.")

The overhaul is owner-confirmed complete. The launch runbook executed:
all trade history cleared for every account (14 setups, 10 outcomes →
0/0, verified), every session ended (427 → 0, verified; outstanding
JWTs die within their ≤60-minute TTL), and PARKING_GATE opened — the
§17j parking page preserved in the repo as the saved standard, the
quiet-entry doormat now a documented no-op. Signed-out visitors land on
sign-in. The e2e infrastructure account re-accumulates rows through the
deploy pipeline's own live suite; real users' slates are clean.

### §17m. Post-launch Desk rulings (owner live findings, 2026-08-01)

1. **All trades originate from the Scan column — no other path, desktop
   or mobile.** The stage's Review button and its market picker are
   DELETED: the stage is a pure display of the Scan column's selection
   (the chart already follows it). The rail's scope menu still contains
   single markets, so reviewing one market remains possible — through
   Scan, the only door. The stage's timeframe control stays
   (display-only).
2. **Every qualifying setup the Scan column generates persists** to
   history/Insights/the cohort — the owner observed scan results NOT
   landing while the stage's Review did: find the root cause, fix it,
   and guard it end-to-end.
3. **Stage vertical budget** (desktop): chart ≈1/3 of the region's
   height, why ≤1/3 (legible, ideally less), the setup ladder gets the
   majority; the whole stage should fit the region without scrolling
   where viewport allows. **Expand chart works on desktop too** — the
   small inline chart is the frame; the overlay is how you see a big
   one.
4. **Rail language**: the column eyebrow becomes **Markets**; the button
   becomes **Scan** — one verb, smaller button, no redundancy.
5. **Rail menu legibility**: smaller menu typography; closed-market
   availability lines must not truncate — "OPENS 6:00P SUN" reads in
   full even while the row is disabled.

### §17n. Mobile minimalism (owner ruling, 2026-08-02, durable)

The ruling, verbatim, both halves:

> I want these ancillary things to be as small as possible on the mobile
> view while still being usable and legible (where text is necessary) —
> that resize needs to be made a durable rule, and the mobile view needs
> to be audited for compliance.

> I want to have things tight on the mobile view — as small as possible
> while being tappable, usable, and legible (as applies).

**The rule.** On every <lg surface, ancillary chrome is sized to the
smallest form that stays tappable, usable and legible — and no larger.
*Ancillary* is everything that is not the content the surface exists to
deliver: pinned control rows, filter rows, record bands, eyebrows and
section heads, the bottom tab bar, avatar-menu rows, chart tooling,
badges, the colophon, and every label and gap between them. The content
region — the single internal scroll region §17g gives each surface — is
the budget being protected, and chrome yields to it.

**Each test binds only where it applies** (the ruling's "as applies", and
its "where text is necessary"): a tap target must be tappable, a control
or region must be usable, text must be legible, and an element carrying
no text has no legibility floor to clear. An element that clears all
three at a smaller size is at the wrong size today.

**Durable, not an occasion.** This governs every mobile element that
ships from now on, not only the ones the audit finds. It has the standing
force §17f's copy law has, and the two compose: §17f decides whether a
string exists, §17n decides how large anything is. Where they meet, §17f
runs first — a string that says what the surface already shows does not
shrink, it dies.

**The floors, and the exception discipline.** 44px remains the kit floor
for tap targets (§3, §17g's own "44px targets still bind"), enforced in
the kit's own CSS — `.primary-button`/`.secondary-button` at 44px,
`.field` at 48px, `.tertiary-link` and `.cpv-copy` at 44px with negative
margins so the reach does not inflate the layout. Exactly one
owner-approved exception is on record: the expanded chart overlay's
button cluster at 28px with its icons held at 16px for legibility
(PR #149 — "small as stays tappable"). Exceptions are granted per element
by the owner, recorded here, and **pinned by a guard with the grant
named** — an unpinned exception is indistinguishable from a regression six
months later. None is ever inferred from another element's exception, and
none is granted to a primary control.

**Where a mock set the size.** §16 gives the mockups composition and §17c
settles the precedence: live product outranks mock where they conflict.
This ruling is later than both, so a mock-set dimension is in scope — the
compact chart's 168px, the frame's 12/16px gutters, the tab bar's 10.5px
type. The audit measures them like everything else and states the test
that holds each one; it does not treat a mock number as exempt from the
rule the owner wrote after approving the mock.

**The compliance audit is mandated, not optional** — "the mobile view
needs to be audited for compliance." Every <lg surface and every piece of
shared mobile chrome is measured against the **built CSS at 375×812**
(measured, the way ProfilePanel's own row budget was, never asserted), and
the audit reports per surface: pinned-chrome height, content-region
height, and for each ancillary element its current size, its proposed
size, and which of the three tests holds it there. Surfaces in scope:
Scan, Trades, Insights, Profile, and the avatar-menu surfaces (Guide,
Donate) — plus the shared chrome: the mobile header, the bottom tab bar,
the avatar menu including its §17g link set, the Profile colophon, and
the full-viewport chart overlay. Findings are recorded in the wave's plan
and PR body. Where a size can be pinned, a guard pins it (§17c's
languageGuard-style enforcement habit).

**Approved in the same ruling, ahead of the audit's own findings:**
slimming the Insights pinned chrome. At 375×812 that chrome measures
roughly 410–490px of a 743px content row — the record band's four stat
blocks at 32px gaps with 24px values, then three full-width 48px selects
stacking to three rows — and leaves the ledger something like 250–330px.
That ~330px is the finding that prompted the ruling. The record band and
the filter row above the ledger are approved to shrink now; the audit
still measures and reports every other surface rather than assuming
Insights was the only offender.

### §17o. Links, in three tiers (owner ruling, 2026-08-02)

The ruling, verbatim:

> I like your recommended 3 tier approach for links. Get it done. Test
> thoroughly for all views and links and pages and states.

**The law, in one line: a new tab means you left Levelflow.** Every link
the product ships is one of three kinds, and the kind decides the
behaviour — not the taste of the surface that draws it. A reader can tell
from what happened where they now are.

**What this cures.** The same three documents were reached three
different ways: the app opened them in a new tab, the documents linked
back to the app in the same tab, and they linked to each other in the
same tab. And no in-app surface had a history entry at all, so the
browser's Back — the one navigation control every reader already knows,
and the only one an OS hands a phone — could not walk the path a reader
had actually taken through the app. It left Levelflow instead.

**Tier 1 — in-app destinations switch surfaces, never spawn.** Donate,
Guide, Insights, Profile, the Desk and its two mobile sub-surfaces are
reached through the app's own navigation, in place. Each switch pushes a
history entry, so Back walks the surface path backwards, and:

- The entry load pushes nothing. Back from the first pushed state
  restores the surface the reader entered on; from the entry state, Back
  leaves Levelflow normally. Nothing is intercepted, and no reader is
  trapped.
- A control that names the surface already showing pushes nothing. Ten
  taps on Insights leave one entry, not ten.
- The URL is not the carrier. Surfaces have no addresses; the state
  does, and the address bar stays as the reader found it — which is what
  lets the consumed `?donate` arrival compose (the arrival is cleaned
  from the URL, and the pushed model inherits it clean).

**Tier 2 — our own documents present in-frame.** Risk disclaimer,
Privacy and Terms are Levelflow's own writing, so reading them is not
leaving. Inside the app they open as a surface: at ≥lg the 880px
editorial column §17c gives Profile, below lg the §17g fixed frame with a
pinned title over one scrolling region. The document's name is its title,
in the same ruled page head the four titled surfaces already carry.

- **The static files stay canonical.** `public/legal/*.html` remain the
  published documents — direct links, search engines, and every
  signed-out reader land on them. The in-app surface is a second
  presentation of the same words, never a second copy of them: one module
  owns the prose, the surface renders it, and a guard holds the static
  files to it in both directions, so neither can drift.
- **Signed-out, the links navigate in the same tab**, and Back returns to
  sign-in. This is safe as of the 2026-08-02 session fix: a Levelflow
  session belongs to the browser session rather than to one tab, so
  leaving the tab and coming back no longer signs anyone out. The
  `target="_blank"` those links used to carry is gone from every
  signed-out surface.

**Tier 3 — a new tab is for leaving.** Only true externals get one: the
donation providers and the colophon's windwardline.com. Both carry
`rel="noopener noreferrer"`. The set is an allowlist pinned in both
directions — these get a new tab, and nothing else may.

`mailto:` is tier 3 by classification and takes neither. It leaves
Levelflow by handing the reader to their mail client, so there is no page
to open and nothing to open it in: a `_blank` mailto strands an empty tab
in several browsers, and a `rel` that governs an opened document governs
nothing here. Tier 3 is about where a link sends you, not about how many
tabs it costs.

**§17k is Tier 3 and stands verbatim.** Its rationale — a new tab "so it
never navigates the workspace away" — is why the colophon keeps its new
tab, and why our own documents no longer need one: Tier 1 and Tier 2
navigate the workspace to a surface and back, which is not navigating it
away.

**A document's footer lists itself.** Each static document's link row
names all three documents, its own included, because §17c makes that row
identical on every page. The self-link stays and is marked as the current
page rather than dropped — a row that loses one item per page is three
different rows, and a reader who cannot see which document they are in
is worse served than one who can click where they already are.

**One definition of the support address.** `Help` is the same mailto
everywhere it appears. The app builds it from one constant; the static
pages cannot import it, so a guard asserts every occurrence is equal to
that constant instead. Six spellings of one address is five chances to
be wrong.

**One consequence of the state model, named rather than discovered.**
Surfaces live in history state, and history outlives a session: after
signing out, Back still walks the entries the signed-in reader left. Each
one lands on the sign-in screen, because the auth gate decides what
renders before any surface does — no authed content returns, and nothing
is exposed; what is left is a Back press that moves nothing. That is the
honest behaviour of a model where the app decides what a state means, and
the alternative — erasing entries the app does not own — is bookkeeping
that fails quietly. If it is ever to change, it changes here first.

**Sign-in survives the trip.** Because tier 2 navigates in the same tab
when signed out, the sign-in screen keeps its own draft — the address
typed, and whether the link has already been sent — in that tab's session
storage, and picks it up on the way back. A reader who wonders what they
are agreeing to can read it and come back to the screen they left, which
is the whole point of reading it there. The draft is one address and one
flag, it never leaves the tab, and it is given up the moment a session
exists.

### §18. Attribution (hedge-mind pillar 1, owner-ordered 2026-08-01)

Insights gains an **Attribution** section: the user's OWN resolved
history sliced four ways, computed over the **complete** history — every
resolved setup on the account, not the page Insights happens to have
loaded. Engine involvement is authorized for exactly that reason (owner,
2026-08-02: "Can we let it involve the engine? If so, do it. I want
accuracy."), so the aggregate may be computed server-side over the user's
own rows under existing RLS. No new columns: `realizedR` is read where it
already lives, in `trade_outcomes.feedback`.

**The record band reads the same lifetime aggregate** (owner ruling
extended, 2026-08-02: "Yes. I want fidelity across the board"). §10's
band and this section sit one above the other, so a truncated band under
a lifetime section would be the same fork these rulings close. Precisely:
the band's **money-positive %, net R and best market** are lifetime, and
its **"setups this week"** count stays week-scoped — that one is a period
stat by §10's own definition, not a truncation. The band's own display
rules are otherwise untouched; only its window changes. One aggregate
serves both consumers.

- **Slices**: by asset class (the six); by side (Buy/Sell); by
  confidence band (the existing CONFIDENCE_TIERS via the existing
  buildConfidenceBands); by session block of the setup's creation hour
  (UTC, named in the Guide's own session vocabulary: Asia 22:00-07:00,
  Europe 07:00-13:00, US 13:00-22:00 — three blocks, hour boundaries
  stated here as law).
- **Per slice row**: label · resolved count · money-positive %
  (classifyWinLoss through the one shared helper — the drift-guard map
  gains the new call site consciously) · net R.
- **One gate, both numbers.** Below 3 resolved, **both** the percentage
  and net R read "Learning" — the same threshold, the same word, the same
  honesty pattern the record band already uses (owner, 2026-08-02: "Yes.
  I want fidelity across the board."). Three resolved is stated here as
  law. At or above the gate, net R renders where every resolved row in
  the slice recorded a realizedR and the em dash otherwise — the
  all-or-nothing rule is unchanged, it now sits behind the gate rather
  than beside it.
- The two withholdings are different facts and the words keep them
  apart: **"Learning"** means not enough resolved history yet; **the em
  dash** means enough history, and one of its rows has no R.
- **Composition**: flat rows under an "Attribution" h2 below the ledger
  — hairlines only (box discipline), the ledger's mono numerals, no
  narration (§17f: every string is a label). Desktop: after the table
  inside the frame's scroll region. Mobile §17g: same content in the
  Insights frame's scroll region below the table. Empty history renders
  the section with its four slice groups all "Learning" — the section
  never hides (its presence teaches what will accrue).
- **Filters do not apply, and neither does the page**: Attribution reads
  the FULL resolved history — full meaning lifetime, not the filtered
  view and not the loaded page. The ledger's 80-row read is a display
  window; Attribution is not inside it. The section answers "what works",
  not "what am I looking at" (stated so nobody wires the filters in
  later and calls it a fix, and so nobody re-derives the aggregate from
  `setups` and calls that the full history).
- **One definition of money-positive, wherever the aggregate runs.**
  `classifyWinLoss` stays the only definition. If the aggregate runs in
  SQL, the SQL does not restate it: either the aggregate returns the
  per-slice resolved rows' minimal fields and the client classifies, or a
  CI test pins the SQL's classification against `classifyWinLoss`
  outcome-by-outcome over the whole `SetupOutcome` domain. A second
  definition of a win is not an implementation detail — it is a second
  product.

**As built (2026-08-03).** Two reads, one taxonomy. The ledger keeps its
display window, now named `LEDGER_WINDOW_ROWS`, because reopening a row
restores the Advisor stage from its stored analysis. `fetchLifetimeSetups`
walks the caller's whole history under existing RLS in `LIFETIME_PAGE_ROWS`
pages, ordered on `(created_at, id)` so an offset page continues where the
last one stopped. It selects only what the two aggregates read, plus `id`
for the walk's own dedupe and the outcome embed — measured 2026-08-03,
`confluence` and `risk_model` are ~5.6KB of the ~5.9KB a full row weighs,
and neither aggregate reads them. Each read carries the outcome shape its
own select asks for, and both pass the one `normalizeEmbeddedOutcome` seam;
both land in one refresh under one failure flag.

**The route taken is neither of the two above.** Those two are the branches
of "if the aggregate runs in SQL" — the first still returns per-slice rows
from a SQL aggregate. This one runs no aggregate on the server at all: it
pages raw rows and computes every slice on the client, authorized by this
section's own permission that the aggregate **may** be computed
server-side, which leaves not doing so open. The forbidding clause is what
governs either way, and it is satisfied at the root: `normalizeSetupOutcome`
and `classifyWinLoss` stay the only definitions of a resolved row and a
money-positive one, because the server is asked nothing about resolution. A
`where outcome in (...)` would be the second product this section forbids,
since resolution also reads `status` and whether the entry ever filled.

The walk throws rather than return a truncated set as a lifetime. The scale
path is the RPC this section authorizes, and the number that decides it is
the row count: 23 on the largest account today, one page covering every
account forty times over.

**As built (2026-08-03, the banding wave).** The confidence slice's bands
are threshold-aware. "The existing CONFIDENCE_TIERS via the existing
buildConfidenceBands" stands, and membership now follows the same rule the
ledger's confidence column prints with (`resolveConfidenceTier`, the law
`formatConfidenceWithTier` shipped for display), in both directions: a row
whose score cleared its own class's qualifying bar has earned Qualified
even below the fixed 66 floor — Forex qualifies at 40, and its whole 40-65
range used to vanish from this aggregate while the ledger printed
"Qualified" beside every one of those rows — and a score inside the fixed
66-74 band keeps Qualified even when it did NOT clear its class's bar (a
Crypto 70 against the 82 bar), because a fixed-tier match always wins and
the threshold only ever fills the gap below 66. That second direction is
the pre-existing display rule, pinned in tests/core.test.ts. Strong and
Best stay absolute. The net R tally keys through the same resolver, so the
slice's two cells keep reading one taxonomy, and each band row carries its
tier `id` — the join key the confidence slice reads, replacing the old
positional band-to-tier contract. Band rows carry no `range`: Qualified's
lower edge is each class's own bar, so "66-74" stopped being one truth, and
a field with no reader is not carried as data (`formatConfidenceTierRange`
lost its last production reader with it and was swept; CONFIDENCE_TIERS'
own min/max stay the raw bounds of record).

A row that cleared no bar lands in no band and is returned by the builder
as an explicit `unbanded` count rather than dropped — sum of band counts
plus `unbanded` equals the rows given, on any input, enforced at the
builder level by tests. **Deliberately unrendered — decision of record
(owner, 2026-08-03).** The launch slate-clean (2026-08-01) plus the
engine's refusal to generate below the bar make the unbanded population
structurally zero on every real account, so no sentence could ever render
and none is shipped: "Why would we even reference anything predated? We
have a new engine, a new look, new bands, and will be generating new
trades." If a future calibration raise ever strands resolved rows below a
new bar, the counter is already in place and the rendering question
reopens with real rows on screen.
