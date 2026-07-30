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
- **Stage (center)**: "Reviewing — any market, scanned or not" eyebrow;
  market picker (same order contract as §4); side tag; confidence unit
  (§6); chart with dashed level lines; below it a two-column sheet: ladder
  with per-value copy (§7) | "Why this setup" rows (Market / Location /
  Timing / Costs / Record) + "How this works" link into Guide anchors.
- **Right rail (~300px)**: "Your current trades" (§8).

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
   each group row itself selectable ("scan N" affordance on the row)
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
  that consecutive scans hit the provider fetch path. Copy near the
  button: "Fresh chart data on every scan — you decide when."
- **Count accuracy**: the line reads "`{scope} — {scanned} scanned ·
  {qualified} qualify · {time}`". `scanned` = symbols actually attempted
  (server truth), `qualified` = opportunities returned. The current UI
  ("X shown from Y reviewed" with a client-filtered X) does not reconcile;
  the new line must come from server numbers only. Server adds a
  `qualified` count to the scan response (today: `scanned` exists,
  qualified is implicit as `opportunities.length` — make it explicit).
- Sort note under the count: "Strongest first, by confidence."
- Row: symbol, "Buy/Sell · confidence N", cost chip (Clean / Acceptable /
  Thin).

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

## 8. Your current trades (right rail / Trades tab)

- Title: **"Your current trades"**. Only two statuses live here, each with
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
- One filter row: Origin (All / Scans / Reviews), Market (scope menu §4),
  Status (All / Open / Pending / Closed), Period.
- Day-grouped table: Market · Side · From (Review/Scan tag) · Confidence ·
  Entry · Stop · Target 1 · Target 2 · Result. Results carry outcome +
  realized R where resolved ("Open · +0.8R", "Target 2 · +2.1R",
  "Stopped · −1.0R", "Banked half · +0.4R", "Pending", "Unfilled",
  "Not taken" for scan-origin setups never placed).
- Footer: "Every setup Levelflow generates is saved here automatically —
  scans included, taken or not. Your record is tracked per broker: E8
  Markets."
- `realizedR` lives in `trade_outcomes.feedback` jsonb (no column) — read
  it there; `realized_pnl` is always null today.

## 11. Guide and Profile

- **Guide**: sticky left anchor TOC (existing six-anchor set), editorial
  article column; the canonical instruction (§7) featured as an accent
  callout; a "what the words mean here" definition list including Bank
  half / Move your stop to your entry / Pending. Existing GuidePanel
  teaching allowlist carries over.
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
  refresh-on-navigation, scan persistence visible in Insights with origin
  tags.
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
