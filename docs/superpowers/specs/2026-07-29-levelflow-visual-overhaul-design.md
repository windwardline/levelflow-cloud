# Levelflow visual overhaul — design spec

Date: 2026-07-29 · Status: approved direction, pending spec review
Direction locked in brainstorming: **Swiss Editorial** (explored as "X3"
against fintech-precision palettes, brutalist/phosphor experimental
directions, institutional-terminal, and editorial-calm alternatives).

## 1. Intent

A complete, staged visual overhaul of every Levelflow surface. Layouts are
rethought where they earn it; functionality and flows do not change. The
result should read as one confident publication about markets: paper, ink,
big type, one electric accent — nothing else in trading looks like it.

## 2. Naming and brand hierarchy

- The product is **Levelflow** — one word, single capital L. This is a
  wholesale rename from "LevelFlow": user-facing copy, code strings,
  comments, internal docs, README, tests, titles, email subject, SMTP
  sender name. Only genuinely historical artifacts keep the old casing:
  committed migrations, git history, and dated round-log entries in
  docs/trade-model.md that record the past.
- **Levelflow is the star; Windward Line is the production house.** The
  current UI leads with the Windward mark and "A WINDWARD LINE PRODUCT"
  eyebrow above the product name — this inverts. The Levelflow wordmark
  (Space Grotesk, tight tracking) leads every surface; Windward Line
  appears as a quiet colophon line ("A Windward Line production") at the
  bottom of surfaces, never above the product.
- Theme naming is strictly **Light / Dark / System** in UI, code, and docs.

## 3. Color system

Two themes of one identity. Brand accent and trade semantics are separate
jobs in both.

| Token | Light | Dark |
| --- | --- | --- |
| Base | `#F4F1EA` paper | `#161411` warm ink |
| Sheet (cards) | `#FDFCF9` | `#1E1B16` |
| Ink (text) | `#1B1B1B` | `#EDE7DA` cream |
| Muted ink | `#6B675E` | `#969082` |
| Hairline | `#D8D2C4` | `#35322B` |
| Accent (brand) | `#2244FF` electric blue | `#6B86FF` |
| Accent pressed | `#1A35CC` | `#7D95FF` |
| Buy / long | `#177245` emerald | `#4CC38A` |
| Sell / short | `#B3261E` | `#E5766E` |
| Caution | `#8A5B00` | `#D9A441` |

Dark stays warm (paper-derived), never graphite — the editorial character
must survive the inversion. Every text pairing ships WCAG AA minimum, body
text AAA, verified pair-by-pair at build time and recorded in a contrast
table committed with Stage 1.

## 4. Typography

Three roles, all self-hosted via @fontsource (CSP forbids font CDNs):

- **Display — Space Grotesk**: wordmark, headlines, panel titles, hero
  numerals (confidence, prices in the recommendation ladder).
- **Text — Inter** (kept): body, labels, controls, with `tnum` for inline
  figures.
- **Numerals — IBM Plex Mono**: tables, price ladders, anywhere columns of
  money are read.

Scale: 12 / 13.5 / 15 / 18 / 24 / 34 / 48. Tight leading on display
sizes, generous on body. Eyebrow labels: small uppercase, letterspaced.

## 5. Component kit

The blue underline is the brand gesture — active states, links, focus,
the one signature motion.

- **Sheets**: sheet color on base, hairline borders, single ink rule on
  the leading edge of primary sheets. No glassmorphism, glow, or gradient
  washes.
- **Buttons**: primary = accent fill; secondary = ink outline on base;
  tertiary = text + underline. All states defined in both themes.
- **Tab navigation**: editorial contents-bar — uppercase letterspaced,
  active tab underlined in accent, no pill backgrounds.
- **Fields/selects**: flat on sheet, hairline borders, accent focus
  underline.
- **Tables**: IBM Plex Mono numerals, hairline row rules, generous row
  height; quality/cost chips as small bordered marks, not colored pills.
- **Notices**: left-ruled strips in semantic colors (info/success/warn/
  danger).
- **Confidence gauge**: numeral-forward — big Space Grotesk figure as
  hero, arc reduced to a thin supporting stroke.
- **Chart theme**: lightweight-charts tuned per theme — hairline grid,
  ink/cream axes, accent crosshair, emerald/red candles.
- **States**: skeletons, empty states, spinners, disabled, focus rings —
  all specified; nothing inherits pre-overhaul styling.

## 6. Surface inventory (exhaustive)

Auth/login: form, sending/sent states, unconfigured state, error strip,
donation reveal, help; Levelflow-first hierarchy.
Workspace shell: header (wordmark, welcome, theme toggle, help/donate/
sign-out), tab bar, colophon.
Advisor: market + timeframe selectors, chart with OHLC overlay and tool
buttons, Review flow, recommendation ladder (entry/stop/TP1/runner with
receipts), quality receipt, confidence gauge.
Status panels: data health, desk status, market clock, recent setups,
market results, volatility window.
Market scan: group/quality filters, cost-label legend, results table.
Insights/history: stats, outcome records, progress displays.
Guide: all sections and explainer diagrams.
About. Profile: settings + activity.
Donate: both placements.
Legal trio: risk disclaimer, privacy, terms.
Magic-link email: name and accent update within the standing Windward
Line template (structure unchanged).
Meta: favicon/app icons/og-image/manifest/title, branded 404.
System states everywhere: loading, empty, error, disabled, focus.

## 7. Language and UX writing

Working surfaces speak plainly; depth lives in the Guide. The first
version explained methodology on the cards — the overhaul removes that.

- **Plain-language rule.** Every string on a working surface must be
  understandable by someone who knows nothing about trading systems.
  Vocabulary a first-week trader knows stays (entry, stop, target).
  Quant-internal vocabulary is translated or relocated: "R multiple" →
  reward vs. risk framing, "out-of-sample" never appears in UI,
  regime names → plain market descriptions ("choppy market"), "TP1 /
  runner" → "first target / second target" (precise terms taught in the
  Guide), "ATR" → "typical range" where user-facing.
- **Brevity rule.** A card states the fact, not the methodology. One
  short line of context maximum on working surfaces. Longer "why"
  explanations move to the Guide, reached by a consistent, quiet
  "How this works" link — one progressive-disclosure pattern everywhere.
- **Voice.** Declarative, short, sentence case, no hedging stacks, no
  exclamation points. Numbers carry the authority, not adjectives.
- **Hierarchy of attention.** One clear primary action per panel;
  supporting facts are visually subordinate; defaults work without
  configuration.
- **Execution.** Stages 2 and 3 each include a full copy inventory and
  rewrite of every string on the surfaces they touch, reviewed against
  these rules as part of the stage's verification.
- **Information follows the process.** Layout is organized around the
  user's actual workflow — survey markets → review one market → get the
  setup → act → see how past setups resolved — and every card lives at
  the step where it helps. If information is useful at a decision point,
  it appears at that decision point (inline or one disclosure away),
  never only in a separate tab. Stage 3 begins with a mapping of every
  existing card/panel onto this workflow; anything parked outside its
  step gets relocated, summarized-in-place, or linked contextually.
- **The engine is part of the UX.** The concurrently remodeled trade
  engine's behavior must be legible on the surfaces: when data was
  refreshed, why a review produced no setup (plain-language reason),
  what quality band a setup carries and what that has meant
  historically, and how pending setups resolve on the clock. Trust in
  the engine is a design deliverable, not just copy.

## 8. Motion

One signature: the accent underline draws in (~140ms ease-out) on hover/
active. Interactive transitions 120–160ms ease-out; tab content changes
fade 120ms; nothing moves untouched. `prefers-reduced-motion` collapses
all motion to instant.

## 9. Accessibility

AA minimum everywhere, AAA body text, both themes equally. Contrast table
committed with Stage 1. Focus always visible (2px accent outline,
offset). 44px hit targets and existing aria-label coverage carry forward.

## 10. Stages and delivery

Each stage ships through the standing loop: gates (typecheck, lint,
tests, build) → PR → auto-merge → deploy → live production verification
at 375/1100/1440 in both themes.

1. **Foundation** — fonts, tokens, component kit, wholesale rename
   (code/docs/tests/titles) + operator script for the two auth-config
   strings (email subject, SMTP sender name — full-SMTP-block hazard).
2. **Public surfaces** — auth recomposition, legal trio, donate, 404.
3. **Workspace** — 3a: advisor + chart + scan; 3b: insights, guide,
   about, profile.
4. **Brand finish** — mark/favicon/og-image/manifest, motion polish,
   final all-widths QA, cross-repo listing updates (Labs register,
   portfolio — commits in their own repos).

Engine calibration work proceeds in parallel; visual and calibration
files do not collide.

## 11. Out of scope

Functional changes to trading logic, flows, auth mechanics, or data.
The magic-link email's structure (standing Windward Line template).
Pricing/plan surfaces (none exist).
