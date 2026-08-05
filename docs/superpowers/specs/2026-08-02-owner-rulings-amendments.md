# Levelflow — Owner rulings, 2026-08-02: spec amendments

Eight rulings, eleven amendments, two target specs. This file is the
reviewable unit; the controller folds each amendment into its target and this
document then reads as the record of what changed and why.

**Every ruling below is recorded as distilled operative text, not verbatim
quotation** (owner ruling, 2026-08-05, effective retroactively to every
amendment in this document). The controller distills each ruling into tight,
professional operative prose; owner intent is the standard the distillation is
held to. Where an amendment compresses a ruling into spec prose, the distilled
operative text governs the compression — a later reader who finds the prose
narrower than the operative text reads the operative text.

**Targets.**

- **Desk spec** — `docs/superpowers/specs/2026-07-30-levelflow-desk-design.md`.
  New §17n (inserted after §17m, before §18); §18 amended in two places.
- **Sizing spec** — `docs/superpowers/specs/2026-08-02-broker-sizing-governor-design.md`.
  Preamble, §19a, §19b, §19c, §20b, §20d, §20f, §20g, §20i and §20j amended;
  one appendix added.

**Build state decides what each amendment costs.** §18 Attribution is shipped
(PR #153) — amendments 2 and 3 are rework on live code with live guards.
**§19 is shipped too** (PR #159: `src/lib/broker/` with `types.ts`,
`programs.ts`, `instruments.ts`, `bridging.ts`, `quotes.ts`, `sizing.ts`, the
migration applied live, and `tests/brokerReference.test.ts` /
`brokerSizing.test.ts` / `brokerProfile.test.ts` pinning it) — so amendments
4, 5, 9 and 10 are a **retrofit**, not green-field authoring; the original
draft of this file predated that merge and its per-amendment cost notes are
corrected below. §20 is genuinely unbuilt (no `rulebook.ts`), so amendments 6,
7 and 8 cost the edit alone. Amendment 1 is a new standing rule over shipped
code on both platforms.

---

## Amendment 1 — Desk spec: new §17n, mobile minimalism is durable law

**Target.** Desk spec, new subsection **§17n**, inserted after §17m and before
§18. Additive; nothing is deleted. §3's "All tap targets ≥44px" and §17g's
fixed-viewport discipline are unchanged and are the floors this rule works
against.

**Full new subsection.**

> ### §17n. Mobile minimalism (owner ruling, 2026-08-02, durable)
>
> **The ruling.** Shrink ancillary elements on the mobile view to the
> smallest size that stays tappable, usable, and legible where text is
> necessary and as applies. Make the resize a durable rule, and audit the
> mobile view for compliance.
>
> **The rule.** On every `<lg` surface, ancillary chrome is sized to the
> smallest form that stays tappable, usable and legible — and no larger.
> *Ancillary* is everything that is not the content the surface exists to
> deliver: pinned control rows, filter rows, record bands, eyebrows and
> section heads, the bottom tab bar, avatar-menu rows, chart tooling, badges,
> the colophon, and every label and gap between them. The content region —
> the single internal scroll region §17g gives each surface — is the budget
> being protected, and chrome yields to it.
>
> **Each test binds only where it applies** (the ruling's "as applies", and
> its "where text is necessary"): a tap target must be tappable, a control or
> region must be usable, text must be legible, and an element carrying no
> text has no legibility floor to clear. An element that clears all three at a
> smaller size is at the wrong size today.
>
> **Durable, not an occasion.** This governs every mobile element that ships
> from now on, not only the ones the audit finds. It has the standing force
> §17f's copy law has, and the two compose: §17f decides whether a string
> exists, §17n decides how large anything is. Where they meet, §17f runs
> first — a string that says what the surface already shows does not shrink,
> it dies.
>
> **The floors, and the exception discipline.** 44px remains the kit floor
> for tap targets (§3, §17g's own "44px targets still bind"), enforced in the
> kit's own CSS — `.primary-button`/`.secondary-button` at 44px, `.field` at
> 48px, `.tertiary-link` and `.cpv-copy` at 44px with negative margins so the
> reach does not inflate the layout. Exactly one owner-approved exception is
> on record: the expanded chart overlay's button cluster at 28px with its
> icons held at 16px for legibility (PR #149 — "small as stays tappable").
> Exceptions are granted per element by the owner, recorded here, and **pinned
> by a guard with the grant named** — an unpinned exception is indistinguishable
> from a regression six months later. None is ever inferred from another
> element's exception, and none is granted to a primary control.
>
> **Where a mock set the size.** §16 gives the mockups composition and §17c
> settles the precedence: "Live product outranks mock where they conflict."
> This ruling is later than both, so a mock-set dimension is in scope — the
> compact chart's 168px, the frame's 12/16px gutters, the tab bar's 10.5px
> type. The audit measures them like everything else and states the test that
> holds each one; it does not treat a mock number as exempt from the rule the
> owner wrote after approving the mock.
>
> **The compliance audit is mandated, not optional** — the ruling requires it
> directly. Every `<lg` surface and every piece of
> shared mobile chrome is measured against the **built CSS at 375×812** (the
> §19d precedent: measured, the way ProfilePanel's row budget was, never
> asserted), and the audit reports per surface: pinned-chrome height,
> content-region height, and for each ancillary element its current size, its
> proposed size, and which of the three tests holds it there. Surfaces in
> scope: Scan, Trades, Insights, Profile, and the avatar-menu surfaces (Guide,
> Donate) — plus the shared chrome: the mobile header, the bottom tab bar, the
> avatar menu including its §17g link set, the Profile colophon, and the
> full-viewport chart overlay. Findings are recorded in the wave's plan and PR
> body. Where a size can be pinned, a guard pins it (the §17c
> "languageGuard-style CI enforcement where a guard can pin it" habit).
>
> **Approved in the same ruling, ahead of the audit's own findings:** slimming
> the Insights pinned chrome. At 375×812 that chrome measures roughly 410–490px
> of a 743px content row — the record band's four stat blocks at 32px gaps with
> 24px values, then three full-width 48px selects stacking to three rows — and
> leaves the ledger something like 250–330px. That ~330px is the finding that
> prompted the ruling. The record band and the filter row above the ledger are
> approved to shrink now; the audit still measures and reports every other
> surface rather than assuming Insights was the only offender.

**Consequence for built code.** A **mobile audit wave** is obligated: measure
first, then resize. What it will find, from the current source:

- **Insights is the offender the owner named.** `HistoryPanel.tsx`'s pinned
  block is `recordBandHead` + `filterRow` inside `MOBILE_FRAME_PINNED`:
  four `StatBlock`s in a `gap-8` cluster with `text-2xl` values, a `gap-5`
  between blocks, and three `.field` selects at 48px full width that stack to
  three rows at 375px. That is the ~410–490px.
- **The tab-bar clearance is 40px of nothing, on every surface.**
  `MOBILE_FRAME_SCROLL` reserves `pb-24` (96px) against a `min-h-14` (56px)
  bar. Every `<lg` scroll region pays it.
- **Trades is already lean** (~36–60px of pinned chrome) — the audit should
  say so and leave it alone rather than churn it.
- **Scan's 290px is 168px of chart**, which is mock geometry
  (`m-scan-v3.html`) with Expand chart as its release valve. It is in scope
  per §17n's mock clause, and it is the one element where shrinking trades
  against legibility of the thing the surface exists to show.
- **The 28px exception is unpinned and unrecorded.** `ChartToolButton`'s
  `touch` branch is `h-7 w-7` with no guard asserting 28px and no comment
  naming PR #149's grant. §17n's exception discipline closes that in this
  wave.

Guards to extend, not replace — each pins the strings a resize must change:
`tests/mobileNav.test.ts` (the three `mobileFrame.ts` literals byte-exactly,
including `pb-24`, plus the tab-bar literal and per-surface roots),
`tests/surfaceComposition.test.ts` (the record-band rule `border-b-2
border-ink pb-3.5` and the filter-row literal, byte-exactly — slimming
Insights breaks this file by design), `tests/deskComposition.test.ts` (chart
tooling, the Expand trigger's `min-h-11`, the overlay close target). The
no-page-scroll mandate is **already** enforced at 375×812 in
`tests/e2e/authenticated-workspace.spec.ts` (`documentScroll() <= 0` on all
six surfaces plus internal-scroll and pinned-chrome-visibility checks), so
what the wave adds is not a fit assertion but the **budget**: the measured
chrome-versus-content split per surface, and the exception pins. Any element
proposed below 44px goes to the owner first — the audit surfaces the
candidate, it does not approve it.

---

## Amendment 2 — Desk spec §18: Attribution reads the lifetime record

**Target.** Desk spec §18, opening sentence and the "Filters do not apply"
bullet.

**The ruling** (owner, 2026-08-02): engine involvement in computing
full-history accuracy is authorized; accuracy governs.

**Change, surgical — §18's opening sentence.**

*Old:*

> Insights gains an **Attribution** section: the user's OWN resolved history
> sliced four ways, all computed from existing row data — no new columns, no
> engine involvement.

*New:*

> Insights gains an **Attribution** section: the user's OWN resolved history
> sliced four ways, computed over the **complete** history — every resolved
> setup on the account, not the page Insights happens to have loaded. Engine
> involvement is authorized for exactly that reason (owner ruling,
> 2026-08-02: engine involvement authorized in service of full accuracy), so
> the aggregate may be computed server-side over the user's own rows under
> existing RLS. No new columns: `realizedR` is read where it already lives,
> in `trade_outcomes.feedback`.

**Change, surgical — the "Filters do not apply" bullet.**

*Old:*

> - **Filters do not apply**: Attribution always reads the FULL resolved
>   history, not the filtered view — the section answers "what works",
>   not "what am I looking at" (stated so nobody wires the filters in
>   later and calls it a fix).

*New:*

> - **Filters do not apply, and neither does the page**: Attribution reads
>   the FULL resolved history — full meaning lifetime, not the filtered view
>   and not the loaded page. The ledger's 80-row read is a display window;
>   Attribution is not inside it. The section answers "what works", not "what
>   am I looking at" (stated so nobody wires the filters in later and calls it
>   a fix, and so nobody re-derives the aggregate from `setups` and calls that
>   the full history).
> - **One definition of money-positive, wherever the aggregate runs.**
>   `classifyWinLoss` stays the only definition. If the aggregate runs in SQL,
>   the SQL does not restate it: either the aggregate returns the per-slice
>   resolved rows' minimal fields and the client classifies, or a CI test
>   pins the SQL's classification against `classifyWinLoss` outcome-by-outcome
>   over the whole `SetupOutcome` domain. A second definition of a win is not
>   an implementation detail — it is a second product.

**Consequence for built code.** This obligates an **Attribution rework wave**
on shipped code.

- `src/components/workspace/attribution.ts` — `buildAttribution(setups)`
  currently aggregates whatever array it is handed. Its input becomes the
  lifetime aggregate, not `setups`.
- `src/components/workspace/HistoryPanel.tsx:250` — `buildAttribution(setups)`
  is the truncation. `tests/surfaceComposition.test.ts` pins that exact call
  text (and pins the absence of `filteredSetups`/`groupedSetups`), so the
  guard changes in the same set.
- `src/lib/tradeAnalyzer.ts` `fetchTradeSetups()` — the ceiling is an inline
  `.limit(80)` with no named constant and **no pagination anywhere in `src/`**
  (no `.range(`, no cursor). Nothing today can reach row 81. Raising the
  ledger's limit is not the fix — the fix is an aggregate that never loads
  rows into the client.
- **New data path.** No user-facing aggregate RPC exists (`public.claim_analyzer_request`
  is the only public RPC; there are no SQL views). The precedents are a
  scheduled SQL aggregation inside `private.run_e8_maintenance` and
  edge-function-side rollups in `trade-analyzer`. A `security invoker`
  RPC over the caller's own rows is the smallest addition that satisfies the
  ruling; whichever route the plan takes, the aggregate must respect existing
  RLS and read `realizedR` from the `feedback` JSON path.
- `tests/attribution.test.ts` (504 lines) keeps every slice, boundary and
  threshold assertion — the math is unchanged. What changes is what feeds it.
  `tests/attribution.test.ts` also asserts `buildAttribution.length === 1`
  as a signature guard; widening the signature is a deliberate edit to that
  line, not a silent one.
- `tests/outcomes.test.ts`'s drift-guard map (`attribution.ts: 1`) is updated
  consciously if the call count moves, per §18's own instruction.
- e2e presence checks at `tests/e2e/authenticated-workspace.spec.ts` (mobile
  ~867, desktop ~1610) stay; a lifetime aggregate needs a value assertion
  that the loaded page cannot produce.

---

## Amendment 3 — Desk spec §18: net R gains the 3-resolved gate

**Target.** Desk spec §18, the "Per slice row" bullet.

**The ruling** (owner, 2026-08-02): net R carries the same 3-resolved gate as
the rate — fidelity applies across the board.

**Change, surgical.**

*Old:*

> - **Per slice row**: label · resolved count · money-positive %
>   (classifyWinLoss through the one shared helper — the drift-guard map
>   gains the new call site consciously) · net R where every resolved row
>   in the slice recorded a realizedR, the em dash otherwise. "Learning"
>   replaces the percentage below 3 resolved — the record band's own
>   honesty pattern, threshold stated here as law.

*New:*

> - **Per slice row**: label · resolved count · money-positive %
>   (classifyWinLoss through the one shared helper — the drift-guard map gains
>   the new call site consciously) · net R.
> - **One gate, both numbers.** Below 3 resolved, **both** the percentage and
>   net R read "Learning" — the same threshold, the same word, the same
>   honesty pattern the record band already uses (owner ruling, 2026-08-02:
>   fidelity applies across the board). Three resolved is stated here as law.
>   At or above the gate, net R renders where every resolved row in the slice
>   recorded a realizedR and the em dash otherwise — the all-or-nothing rule
>   is unchanged, it now sits behind the gate rather than beside it.
> - The two withholdings are different facts and the words keep them apart:
>   **"Learning"** means not enough resolved history yet; **the em dash**
>   means enough history, and one of its rows has no R.

**Consequence for built code.** Contained, and inside the file amendment 2
already reworks.

- `src/components/workspace/attribution.ts` — `netRFor(tally)` currently
  returns `null` only on zero-resolved or a missing `realizedR`. It gains the
  `ATTRIBUTION_LEARNING_MIN_RESOLVED` gate; the constant already exists and
  is already exported.
- `src/components/workspace/HistoryPanel.tsx` — the net R cell renders
  `—`/`formatSignedR` on a single ternary today. It needs the three-way
  render, and `tests/surfaceComposition.test.ts` pins that exact ternary text,
  so the guard moves with it.
- `tests/attribution.test.ts` — the net R suite currently asserts a sum "when
  all present" without regard to count. Its fixtures below 3 resolved flip
  from a number to "Learning"; the "cancel-to-zero slice sums as `0` not
  absent" case must be re-stated at ≥3 resolved so it still tests what it was
  written to test.
- The confidence group takes its resolved count from `buildConfidenceBands`
  and its net R from the local tally: the gate must read the same resolved
  count both numbers are gated on, or the two cells can disagree on a slice.

---

## Amendment 4 — Sizing spec preamble + §19a: a third admissible class, `verified`

**Target.** Sizing spec preamble ("The boundary") and §19a (the `Provenance`
type, rule 1).

**The ruling** (owner, 2026-08-02): on their live E8 Pro Forex TradeLocker
account, the smallest forex lot size confirms at 0.01.

A value observed on the broker's live platform is neither E8-published nor
E8-method-derived, so the boundary as written excludes it. The boundary gains
a third class rather than being bent.

**Change, surgical — the preamble boundary paragraph.**

*Old:*

> **The boundary, and it governs every number in both sections.** No number
> enters this feature unless E8 publishes it, or Levelflow derives it by a
> method E8 publishes from data Levelflow already holds. There is no third
> source. Not an exchange specification, not an industry convention, not a
> figure from a third-party aggregator, not a plausible default. Where those
> two sources run out, the feature renders a word instead of a number (§19e,
> §20f) — and that refusal is the feature working, not the feature failing.

*New:*

> **The boundary, and it governs every number in both sections.** A number
> enters this feature by exactly three routes: E8 publishes it; Levelflow
> derives it by a method E8 publishes from data Levelflow already holds; or
> **the owner observes it directly on the broker's live platform and it is
> recorded dated and attributed** (owner ruling, 2026-08-02). There is no
> fourth. Not an exchange specification, not an industry convention, not a
> figure from a third-party aggregator, not a plausible default. Where the
> three run out, the feature renders a word instead of a number (§19e, §20f)
> — and that refusal is the feature working, not the feature failing.
>
> **The third route is narrow by construction.** It admits what the broker's
> own platform shows the account holder — a minimum lot increment, an order
> ticket's computed risk, an instrument's presence in the tradable list, an
> account option on the purchase screen. It carries `tag: "verified"` with the
> observation's date, the platform it was made on, and the live program it was
> made under. It is not a channel for inference: an observation establishes
> the value observed, on the instrument and account it was observed on, and
> nothing adjacent to it. Appendix A is the standing program that produces
> these observations.

**Change, additive — §19a's `Provenance` type.**

*Old:*

> ```ts
> type Provenance = {
>   article: string | null;   // "9453488" | "13004287" | null for dossier-only
>   tag: "primary" | "derived" | "secondary" | "dossier";
>   method: string | null;    // required when tag is "derived": the article publishing the method
>   url: string;
> };
> ```

*New:*

> ```ts
> type Observation = {
>   date: string;        // ISO date the owner made it
>   platform: string;    // "TradeLocker" | "E8X dashboard" | "E8 purchase screen"
>   program: string;     // the live account it was made on: "E8 Pro Forex"
>   note: string | null; // what was seen, in the owner's own terms
> };
>
> type Provenance = {
>   article: string | null;   // "9453488" | "13004287" | null for dossier-only and verified
>   tag: "primary" | "derived" | "verified" | "secondary" | "dossier";
>   method: string | null;    // required when tag is "derived": the article publishing the method
>   url: string | null;       // null only when tag is "verified"
>   observation: Observation | null; // required when tag is "verified", null otherwise
> };
> ```

**Change, additive — §19a rule 1.** The rule's two admissible tags become
three. Append to rule 1, after the `derived` paragraph:

> `verified` is the fifth tag and the third admissible one. It marks a value
> the owner observed on the broker's live platform: it carries no article and
> no url, it carries a non-null `observation` with a date, a platform and the
> live program, and CI keeps it distinguishable from `primary` so a later
> reviewer can see at a glance which numbers E8 wrote down, which its
> arithmetic produced, and which the owner watched the platform do. A
> `verified` value may support a `confirmed` row, and a `verified` observation
> may establish tradability itself — the owner seeing an instrument tradable
> on the live account is the same class of fact as E8 publishing that it is.
> `secondary` and `dossier` remain inadmissible for either. The CI implication
> widens accordingly: every `confirmed` row's tradability carries `primary` or
> `verified`, and every value its unit requires carries `primary`, `derived`
> or `verified`.

**Consequence for built code — RETROFIT (§19 is shipped).**
`src/lib/broker/types.ts` exists on main and its `Provenance` carries **four**
tags with `url: string` non-nullable and no `observation` field; its header
comment even restates the retired boundary verbatim ("There is no third
source"). The retrofit: add `verified` to the tag union, add the `Observation`
type, make `url` nullable, add `observation`, and rewrite that header comment
and the `derived`-tag docblock to the three-route boundary.
`tests/brokerReference.test.ts` moves in the same commit — the widened
`confirmed` implication plus two new assertions: every `verified` value
carries a non-null observation with a date and a platform, and no `verified`
value is also tagged `primary`. Until the type widens, the 0.01 lot step
(amendment 5) has nowhere honest to sit.

---

## Amendment 5 — Sizing spec §19c, §20f, §20i: the CFD lot step is 0.01, verified

**Target.** Sizing spec §19c Step 7 and the "What is sizeable in wave 1"
paragraph; §20f's lot-step bullet; §20i ruling 2.

**The ruling** (owner, 2026-08-02): on their live E8 Pro Forex TradeLocker
account, the smallest forex lot size confirms at 0.01.

**Change, surgical — §19c Step 7's second paragraph.**

*Old:*

> Futures step is **1 contract**, exact and confirmed. CFD step is **0.01
> lots** and is marked UNCONFIRMED: E8 publishes no minimum lot increment
> anywhere. The smallest lot E8 names in print is 0.1 (9453425, "even a
> 0.1-lot micro-trade counts") and its worked examples use 0.3 and 5 lots
> (14722843), which distinguishes nothing. 0.01 is taken over 0.1 because
> flooring to 0.1 produces **no size at all** on the small ladder tiers — a
> $5,000 account at 0.50% risk with a 30-pip EURUSD stop sizes to 0.083 lots,
> which floors to zero at a 0.1 step. The consequence of being wrong is
> stated, not hidden: a size below 0.1 lots may fall under the trading
> platform's own minimum and be refused at order entry, which is a rejected
> order (E8: "If a trade exceeds your available margin, the system will
> prevent the order") and never an account breach.

*New:*

> Futures step is **1 contract**, exact and confirmed. CFD step is **0.01
> lots**, and it is **verified, not assumed**: the owner confirmed it on their
> live E8 Pro Forex account in TradeLocker on 2026-08-02 — the smallest forex
> lot size is 0.01. The value carries `tag: "verified"` with that observation
> (§19a); E8 still publishes no
> minimum lot increment on any page, and it no longer needs to. The print
> record that forced the old assumption is kept for the reader: the smallest
> lot E8 names in print is 0.1 (9453425, "even a 0.1-lot micro-trade counts")
> and its worked examples use 0.3 and 5 lots (14722843), which distinguished
> nothing — which is why the value came in unconfirmed before the owner
> watched the platform. The reason 0.1 would have been wrong stands as
> corroboration rather than as justification: a $5,000 account at 0.50% risk
> with a 30-pip EURUSD stop sizes to 0.083 lots, which a 0.1 step floors to
> zero, so the tightest ladder tier would have produced no size at all.
>
> **The observation's scope is the account, not the instrument list.** It was
> made on a forex-line account, which is where every CFD program line's forex
> pairs trade, so the 28 pairs carry the verified step. `XAUUSD` — the 29th
> sizeable CFD market — trades on that same account, and whether it carries an
> instrument-specific minimum is not something the observation says: it keeps
> 0.01 as the working step and sits first in Appendix A's queue. The index CFDs
> raise the same question and it stays academic in wave 1, since Levelflow's
> index rows are the futures symbols and are `not_offered` on every CFD line.
> A sub-0.1-lot size no longer
> carries a "may be refused" hedge on the verified instruments — the step is
> the platform's own.

**Change, surgical — §19c's "What is sizeable in wave 1", final sentence.**

*Old:*

> Not one of those is unblockable by derivation — E8 publishes no method that
> produces a contract size it never printed.

*New:*

> Not one of those is unblockable by derivation — E8 publishes no method that
> produces a contract size it never printed. Every one of them is unblockable
> by **observation**: a single manual trade on the live platform shows what a
> lot of that instrument is worth, and Appendix A is the standing program that
> collects exactly those. The sizeable counts in this section are therefore a
> floor dated 2026-08-02, not a ceiling — each verified observation moves a
> row from a word to a number, in a change set that names the observation.

**Change, surgical — §20f's lot-step bullet.**

*Old:*

> - **The CFD minimum lot step** is NOT PUBLISHED (§19c). *Consequence:* a
>   size below 0.1 lots may be refused at order entry.

*New:*

> - **The CFD minimum lot step** is NOT PUBLISHED by E8 and is **no longer
>   open**: verified at 0.01 on the owner's live E8 Pro Forex TradeLocker
>   account, 2026-08-02 (§19c, Appendix A). *Consequence:* none on the 28
>   forex pairs. `XAUUSD`'s per-instrument minimum is the residual, and it is
>   queued, not guessed.

**Change, surgical — §20i ruling 2.**

*Old:*

> 2. **The CFD step is 0.01 lots**, UNCONFIRMED-marked, consequence stated: a
>    sub-0.1-lot size may fall under the platform's own minimum and be refused
>    at order entry — a rejected order, never an account breach. (§19c.)

*New:*

> 2. **The CFD step is 0.01 lots — verified, superseding the UNCONFIRMED
>    mark.** The controller's draft ruling reasoned to 0.01 and marked it
>    unconfirmed; the owner then confirmed it on the live platform (E8 Pro
>    Forex, TradeLocker, 2026-08-02): the smallest forex lot size is 0.01.
>    It carries `tag: "verified"` and the
>    refused-at-order-entry hedge is retired on the forex pairs. (§19a, §19c,
>    Appendix A.)

**Consequence for built code — RETROFIT (§19 is shipped).** The step is
`export const CFD_STEP = 0.01` in `src/lib/broker/sizing.ts:38`, a bare
number whose docblock above it reads "CFD step, marked UNCONFIRMED: E8
publishes no minimum lot increment anywhere" (line 29). Two changes: the
docblock restates the verified observation with its date, platform and live
program; and the value becomes a `Valued<number>` carrying `verified`
provenance rather than a bare constant, so the observation travels with the
number the way §19a requires of every other broker value. `FUTURES_STEP = 1`
is untouched. `tests/brokerSizing.test.ts`'s round-down property tests then
run against 0.01 as a verified value. The "consequence of being wrong" prose
disappears from the Size row's story for forex — and per §20j nothing in the
UI ever said it, so no rendered string changes.

---

## Amendment 6 — Sizing spec §20b: the drawdown definitions become owner-canonical

**Target.** Sizing spec §20b, additive block after "**The rulebook of
record.**" table and before "**Two dossier-level disagreements, resolved
here.**"

**The ruling.** The owner supplied both definitions verbatim as canon, with
one source: `https://intercom.help/e8/en/articles/11864596-eod-dynamic-drawdown`.

**Full new block.**

> **The two definitions, owner-canonical (2026-08-02).** The owner supplied
> these verbatim as the rulebook's definitional inputs. Where a later re-read
> of E8's pages phrases either mechanism differently, these govern the
> model's `basis`, `updateClock` and `severity`. The article citations stay
> where they are — the canon does not replace them, it states which reading of
> them is law.
>
> > 2% Daily pause - A soft daily loss limit based on your starting balance of
> > the day. If your floating or closed loss reaches 2%, trading stops until
> > the next day. Your account is not breached. It simply pauses and resets at
> > midnight
>
> > EOD Dynamic drawdown – A moving loss limit based on your highest
> > end-of-day balance. It only updates once per day at market close (intraday
> > equity swings do not move it). It locks permanently at the initial balance
> > level.
>
> Source of record for the EOD definition, owner-supplied:
> `https://intercom.help/e8/en/articles/11864596-eod-dynamic-drawdown` — article
> 11864596, already this spec's citation for the mechanism. The Daily Pause
> definition's article of record remains 11969807 unless the owner names
> another.
>
> **What each canon pins in the model.**
>
> - Daily Pause: `basis: "day_start_balance"` — *not* `initial_balance`.
>   `severity: "pauses"`, and the canon says why in words the app must never
>   soften: "Your account is not breached." `updateClock: "server_midnight"`
>   ("resets at midnight"). The trigger is **floating or closed** loss, so it
>   can fire on an open position — recorded here because V2's headroom math
>   turns on it and V1 must not imply a closed-only line.
> - EOD Dynamic: `basis: "highest_eod_balance"`, `updateClock: "market_close"`,
>   `severity: "terminates"`, and it locks permanently at the initial balance
>   level — the lock is a floor that stops trailing, not a reset. "Intraday
>   equity swings do not move it" is the operative half for a governor with no
>   telemetry: nothing a user does inside a day changes this number, which is
>   why the facts block can render it at all.
>
> Both were already the model's shape. The canon's force is that they are now
> owner-stated law rather than a reading of two help pages, and §20i ruling 3
> is decided by the first of them.

**Consequence for built code.** None yet. Wave 2 authors `rulebook.ts` with
`basis: "day_start_balance"` on the three Signature lines' Daily Pause rule —
the union member already exists in the `ProgramRule` type, and this ruling is
what puts it to use. `tests/programRulebook.test.ts` pins both canons' four fields
per rule (basis, kind, severity, updateClock) as literal expectations, in the
`calibrationState` shape §20g mandates.

---

## Amendment 7 — Sizing spec §20b/§20d/§20f/§20g/§20i: Signature's Daily loss renders a number

**Target.** Sizing spec §20b's table (three Signature rows, Daily-loss cell),
§20d's pinned-conflict paragraph, §20f's post-payout bullet, §20g's
per-line assertion, §20i ruling 3, and §20j's facts-block literal list.

**The ruling.** The canon's basis clause — "based on your starting balance of
the day" — resolves the conflict §20i ruling 3 left open. The Daily Pause
**recalculates daily**; it is not a fixed dollar figure struck at account
opening. The 11969807 reading ("never changes during the account's life") is
superseded, and with it the reason the row was withheld: the payout FAQ's
"calculated from your new balance" (15272556) is no longer a contradiction —
it is the same daily recalculation seen from the far side of a payout. The
owner's direction is that the row render real numbers again, not
`Not confirmed`.

**Change, surgical — §20d's pinned-conflict paragraph.**

*Old:*

> **One value is pinned to a conflict rather than to a number.** On
> `signature_forex`, `signature_crypto` and `signature_futures`, **at
> Performance stage only**, `Daily loss` renders **`Not confirmed`** — not the
> 2% figure, not a figure with a caveat. Two E8 pages disagree about whether the
> Daily Pause dollar amount survives a payout: 11969807 states the fixed dollar
> "never changes during the account's life", while the payout FAQ (15272556)
> states those limits are "calculated from your new balance" once a payout is
> requested, and the futures dossier's re-read confirms 11969807 is simply
> silent on the interaction rather than contradicting it. Levelflow additionally
> cannot know whether a payout has occurred, so it cannot pick the branch even
> if E8 resolved the wording. Rendering the initial-balance figure would be
> correct until the first payout and silently wrong after it — exactly the
> failure the unconfirmed discipline exists to prevent. At Challenge stage the
> row is absent, because Daily Pause does not apply there at all (11969807's own
> scope line).

*New:*

> **One value was pinned to a conflict; the owner's canon closed it.** On
> `signature_forex`, `signature_crypto` and `signature_futures`, **at
> Performance stage only**, `Daily loss` renders **`2% · Daily Pause`** — the
> rule's own invariant, not a conditional dollar. The canon (§20b) states the
> basis: "A soft daily loss limit based on your starting balance of the day."
> The limit recalculates every day, so the two pages that appeared to
> disagree do not: 11969807's "never changes during the account's life"
> describes the 2% rule, not a frozen dollar figure, and the payout FAQ's
> "calculated from your new balance" (15272556) is that same daily
> recalculation observed after a payout. There is no branch left to pick.
>
> The percent form is a controller ruling (2026-08-02, resolving this
> amendment's flagged conflict): the dollar amount depends on the day's
> starting balance, which Levelflow cannot see — a tier-derived dollar is
> exact only on a day the account starts at its tier and **overstates the
> real pause line on every day below it**, the direction §20a forbids. The
> percent is exactly true on every day of the account's life — this is the
> founding case of a general standing principle (owner ruling, 2026-08-02):
> always use the most mathematically accurate answer, a principle stated
> generally and not scoped to this row alone.
> `signature_futures`' published amounts — $500 / $1,000 / $2,000 / $3,000
> at the four tiers (11864618), which are 2% of 25K/50K/100K/150K exactly —
> stay in the rulebook data as the arithmetic corroborating itself, and CI
> pins that identity; they are not rendered.
>
> At Challenge stage the row is absent, because Daily Pause does not apply
> there at all (11969807's own scope line). That is unchanged.

**Change, surgical — §20b table, the three Signature rows' Daily-loss cell.**
Each cell keeps its wording and gains the basis, so the table cannot drift
from §20b's canon block:

- `signature_forex`: *old* "none in Challenge; Daily Pause 2%, pauses to
  00:00 server, not a breach, Performance only [11969807]" → *new* "none in
  Challenge; Daily Pause 2% of the day's starting balance, pauses to 00:00
  server, not a breach, Performance only [11969807; owner canon 2026-08-02]".
- `signature_crypto`: same edit, citations "[11864571, 11969807; owner canon
  2026-08-02]".
- `signature_futures`: *old* "none in Challenge; Daily Pause 2%,
  $500/$1,000/$2,000/$3,000, Performance only [11864618, 11969807]" → *new*
  "none in Challenge; Daily Pause 2% of the day's starting balance,
  $500/$1,000/$2,000/$3,000, Performance only [11864618, 11969807; owner canon
  2026-08-02]".

**Change, surgical — §20f's post-payout bullet.** The item leaves the open
list. Replace it with a closed-item line, so a later reader sees it was
decided rather than dropped:

*Old:*

> - **Post-payout Daily Pause behaviour.** 11969807 says the fixed dollar
>   amount "never changes during the account's life"; the payout FAQ (15272556)
>   says Daily Pause limits are "calculated from your new balance" once a
>   payout is requested. The futures dossier's re-read confirms 11969807 is
>   simply silent on payout interaction — the contradiction stands. Levelflow
>   also cannot know whether a payout has happened. *Consequence, ruled:* on the
>   three Signature lines at Performance stage, `Daily loss` renders
>   **`Not confirmed`** rather than the 2% figure (§20d). This is the one place
>   in either section where a fully published number is deliberately withheld,
>   and it is withheld because a second published page contradicts the
>   condition under which it holds.

*New:*

> - **Post-payout Daily Pause behaviour — CLOSED, owner canon 2026-08-02.**
>   The apparent contradiction between 11969807 ("never changes during the
>   account's life") and the payout FAQ (15272556, "calculated from your new
>   balance") dissolves once the basis is stated: the limit is 2% of the day's
>   starting balance and recalculates daily, so both pages describe the same
>   mechanism. *Consequence:* on the three Signature lines at Performance
>   stage, `Daily loss` renders **`2% · Daily Pause`** (§20d) — the percent,
>   because the dollar depends on a balance Levelflow cannot see. This was the
>   one place where
>   a fully published number was withheld because a second page disputed the
>   condition under which it holds, and that case is now closed. `6J` stays
>   withheld, but on arithmetic E8's own table cannot reconcile rather than on a
>   disputed condition (§19a) — a different kind of silence, and Appendix A's
>   queue is where it gets resolved.

**Change, surgical — §20g's per-line assertion.**

*Old:*

> - The three Signature lines resolve `Daily loss` to `Not confirmed` at
>   Performance and to absent at Challenge, asserted per line — the §20d
>   ruling as CI, so a later edit cannot quietly restore the 2% figure.

*New:*

> - The three Signature lines resolve `Daily loss` to **`2% · Daily Pause`** at
>   Performance and to absent at Challenge, asserted per line. Two assertions
>   ride with it: no tier-derived dollar reaches that row on any line or size
>   (the §20d percent ruling as CI), and `signature_futures`' published
>   $500/$1,000/$2,000/$3,000 equals 2% of each of its four tiers — data,
>   pinned and unrendered — so no later edit can introduce an amount that is
>   not 2% of the tier, and none can restore `Not confirmed` without deleting
>   an owner canon.

**Change, surgical — §20i ruling 3.**

*Old:*

> 3. **Signature `Daily loss` renders `Not confirmed` at Performance stage.**
>    The 11969807-vs-15272556 conflict is what the unconfirmed discipline is
>    for, and Levelflow cannot know whether a payout occurred. (§20d, §20f.)

*New:*

> 3. **SUPERSEDED by owner canon, 2026-08-02.** As drafted, this ruling
>    withheld Signature's `Daily loss` at Performance as `Not confirmed`, on
>    the reasoning that the 11969807-vs-15272556 conflict is what the
>    unconfirmed discipline is for and that Levelflow cannot know whether a
>    payout occurred. The owner's canonical definition names the basis —
>    "based on your starting balance of the day" — which recalculates daily and
>    reconciles both pages. The row renders **`2% · Daily Pause`**: the
>    percent, since the dollar depends on a balance Levelflow cannot see
>    (controller, 2026-08-02). (§20b, §20d, §20f.)

**Change, surgical — §20j's program-facts value literals, both ways.**
`2% · Daily Pause` is **licensed** as a rendered literal (added to the numeric
forms, which become five). `Not confirmed` **comes out** of the facts-block
list: it was reachable there only through this row, and with the flip it is
unreachable. It stays in §19's Size-row list, where tradability still renders
it, and §20j gains a short note saying so — because the list is checked in
both directions ("§20j names nothing the feature does not render"), the
string's absence from one list and presence in the other are both
load-bearing.

**Consequence for built code.** None yet. The obligation is that wave 2's
`rulebook.ts`, `programFacts` renderer and
`tests/programRulebook.test.ts` are authored to the amended §20d from the
start — including the 2%-of-tier identity test, which is cheap now and is the
only thing standing between a future refactor and a silently wrong daily
line.

---

## Amendment 8 — Sizing spec §20b: the EOD Dynamic amounts are tiered, not flat

**Target.** Sizing spec §20b, appended to amendment 6's canon block.

**The ruling.** The owner supplied the EOD Dynamic amounts:
**$1,000 at $25,000 · $2,000 at $50,000 · $3,000 at $100,000 · $4,500 at
$150,000.**

**Full new block.**

> **The EOD Dynamic amounts, and why they are a table and not a percentage.**
> Owner-supplied with the definition, 2026-08-02:
>
> | Account size | EOD Dynamic drawdown | Implied % |
> |---|---|---|
> | $25,000 | $1,000 | 4% |
> | $50,000 | $2,000 | 4% |
> | $100,000 | $3,000 | 3% |
> | $150,000 | $4,500 | 3% |
>
> **The ratio is tiered — 4% / 4% / 3% / 3% — not flat**, and stating that is
> the point of the table. The four amounts confirm the figures already in the
> §20b row for the Signature lines; what they add is the shape. Any single
> percentage fitted to them is wrong on two of the four tiers, so on the
> Signature lines the EOD Dynamic rule carries `percent: null` and
> `amountBySize` holds all four values. `zero_futures_starter` and
> `zero_futures_max` are unaffected: 3% is published flat on their own page
> (15935817).
>
> CI asserts the shape, not just the numbers: no flat `percent` on a Signature
> EOD rule, the amount table complete for all four tiers per §20g's
> no-partial-map rule, and the 4/4/3/3 ratio pinned so a later editor who
> "simplifies" the table to one percentage fails the suite.

**Consequence for built code.** None yet. Wave 2 authors it as an
`amountBySize` table with a null percent; the trap this closes is real —
`ProgramRule` carries both fields, and a rule with a plausible-looking flat
percent beside a complete amount table is exactly the kind of redundancy a
later refactor collapses in the wrong direction.

---

## Amendment 9 — Sizing spec §19b + §20i ruling 6: Classic and Track are discontinued

**Target.** Sizing spec §19b's opening paragraph and §20i ruling 6.

**The ruling** (owner, 2026-08-02): Classic and Track are discontinued by E8.

The exclusion's ground changes from evidence quality to product availability.
That is the stronger ground: a 404'd article and a secondary-only citation
are gaps that fresh research could close, while a discontinued product has
nothing to research.

**Change, surgical — §19b's opening paragraph, final sentence.**

*Old:*

> Neither appears in the selector, and **neither re-enters on recollection or
> a checkout screenshot — only behind a fresh primary-research pass** that
> clears the same bar the ten cleared, dated and committed to `docs/research/`
> like the rest.

*New:*

> **Neither is offered by E8 any longer** (owner ruling, 2026-08-02: Classic
> and Track are discontinued by E8), which retires the evidence question
> rather than answering it: the 404'd Classic article and Track's
> secondary-only citations are what a withdrawn product's documentation looks
> like. Neither appears in the selector, and **neither has a re-entry path** —
> there is no research pass to run against a product that is not sold. The ten
> lines are E8's current catalogue. If E8 ever reintroduces either name, it
> enters as a new product on its own primary research, dated and committed to
> `docs/research/` like the rest — a restoration of a 2026 row is never the
> mechanism.

**Change, surgical — §20i ruling 6.**

*Old:*

> 6. **Ten program lines** — the researched set less E8 Classic and E8 Track,
>    which re-enter only behind fresh primary research. (§19b.)

*New:*

> 6. **Ten program lines** — the researched set less E8 Classic and E8 Track.
>    Ground updated by owner ruling, 2026-08-02: Classic and Track are
>    discontinued by E8. Discontinued, not under-evidenced; no re-entry path,
>    and a future reappearance is a new product. (§19b.)

**Consequence for built code — RETROFIT, comment-only.**
`src/lib/broker/programs.ts:10-16` carries the old ground in its header
comment, ending "neither re-enters on recollection or a checkout screenshot —
only behind a fresh primary-research pass that clears the same bar the ten
cleared (§20i ruling 6)". That comment restates a path this ruling abolishes,
so it is rewritten to discontinuation. No data changes: the ten `ProgramLine`
values and the live `profiles_broker_program_line_valid` constraint
(migration `20260803000000_broker_program_profile.sql`) are already exactly
ten, and with the ground now "not sold" nobody widens either speculatively.

---

## Amendment 10 — Sizing spec §20b: the input contract for owner-supplied purchase-screen data

**Target.** Sizing spec §20b, additive block after amendments 6 and 8.

**The ruling** (owner, 2026-08-02): account for E8's customizable
purchase-time options and calculate accordingly for the user; the owner may
supply the purchase-screen parameters when needed.

**Full new block.**

> **The input contract — owner-supplied purchase-screen data.** The four
> customizable lines (`one`, `one_crypto`, `pro_forex`, `pro_crypto`) sell
> their loss limits as a purchase-time choice, and the definitive statement of
> what E8 offers is the purchase screen itself. The owner has offered to
> supply it. This block states what happens when they do, and what happens
> until then, so neither state is improvised.
>
> **When the tier matrix arrives**, it enters as `verified` provenance (§19a):
> one observation per program line, carrying the date, the platform
> ("E8 purchase screen") and the tiers exactly as the screen lists them.
> **This amendment's reading, for the controller to confirm:** the purchase
> screen is authoritative over a price-table reading where the two differ,
> because it is what the user actually buys from — which would also settle
> §20f's open E8 One preset conflict (11775980's 3%/4% against 8880316's
> 4%/6%). Landing it is one change set that touches four places together, or it
> is not landed: §19b item 5's selector option list, §19g's
> `broker_drawdown_tier` domain table, §20j's Drawdown option tokens, and the
> `programs.ts` module with its pinning test. Tier membership is enforced by the
> data module and the write path, not by SQL (§19g), so a tier that reaches the
> selector without reaching the domain table is a write the write path rejects —
> and a domain widened without the module is a tier CI does not know about.
>
> **Until it arrives**, the customizable lines compute from the tiers already
> primary-published — §19b item 5's five One/One Crypto pairs and three
> Pro pairs (8880316) — and nothing is invented to fill a suspected gap.
> Where a selected tier is unknown or a rulebook fact behind it is
> unpublished, the rows render §20f's word. The feature does not wait for the
> purchase screen to ship; it ships on published tiers and gets more accurate
> when the screen lands.
>
> **What this block does not authorize.** Neither Levelflow nor the owner
> composes a drawdown pair E8 does not sell. Daily and dynamic move together
> on One ("Profit Target adjusts automatically with drawdown changes"), Pro's
> daily leg is fixed at 2.5% and only its static leg moves, and the column
> holds one paired token for exactly that reason (§19g). A purchase screen
> showing a combination this spec does not list widens the domain; it never
> licenses interpolation between two listed tiers.

**Consequence for built code — RETROFIT (§19 is shipped).**
`src/lib/broker/programs.ts` holds the tiers as `drawdownTiers: string[] | null`
(`ONE_DRAWDOWN_TIERS`, `PRO_DRAWDOWN_TIERS`, null on the six preset lines) — a
bare array with no provenance, so a `verified` purchase-screen matrix cannot
replace a price-table reading without a shape change. The retrofit wraps the
field in the `Valued<>` shape every other broker value already uses, which is
the same commit as amendment 4's type work. The write path §19g mandates —
"rejects an off-ladder size and an off-domain tier; never accepts and silently
ignores either" — is what makes the four-places-together rule enforceable
rather than aspirational, and it is already built.

---

## Amendment 11 — Sizing spec: new Appendix A, the standing empirical program

**Target.** Sizing spec, new top-level section appended after §20j.

**Numbering note for the controller.** Named **Appendix A** rather than §21 so
it does not claim the next feature's section number; rename to §20k if you
prefer it inside §20's numbering.

**The ruling.** The owner offers, as a standing program: per-asset manual
trades on TradeLocker (E8 Pro Forex) reporting risk and reward per lot to
verify derived values, and the purchase of an E8 futures account to verify
account options, tradable assets and trade calculations.

**Full new section.**

> ## Appendix A. The standing empirical program (owner offer of record, 2026-08-02)
>
> Wave 1 refuses to answer wherever E8's pages stop. This appendix is how that
> silence gets resolved without loosening the boundary: the owner holds live E8
> accounts, and what the platform shows the account holder is admissible as
> `verified` provenance (§19a, and the preamble's third route).
>
> **What the owner offers.**
>
> - **Per-asset manual trades on TradeLocker, live E8 Pro Forex** — a small
>   trade on a named instrument, reporting the platform's own risk and reward
>   per lot. That single figure is the thing §19c Step 3 derives, so an
>   observation either confirms the derivation or falsifies it.
> - **An E8 futures account, to be purchased** — verifying account options
>   (the ladder and the drawdown tiers as sold), tradable assets (the
>   instrument list as the platform lists it), and trade calculations (tick
>   value per contract as the ticket computes it).
>
> **How an observation becomes data.** It is recorded as an `Observation`
> (§19a) with its date, platform and live program, attached to the specific
> `(broker, program_line, levelflow_symbol)` value it establishes, and pinned
> in `tests/brokerReference.test.ts` in the same change set — the same
> discipline every other broker number already lives under. An observation
> upgrades the row it names and no other. It never generalises across
> instruments, across program lines, or from one asset class to another.
> Where an observation contradicts an E8-published value, both are recorded,
> the contradiction is stated in the row's comment, and the spec names the
> reading it takes — the §20b habit, applied to a new kind of source.
>
> **The queue, highest value first.** Ordered by what each observation
> unblocks, and every item names the section it closes.
>
> 1. **`XAUUSD`'s minimum lot** — the residual scope of the verified 0.01 step
>    on the one non-forex market wave 1 can size (§19c Step 7). One glance at
>    the order ticket.
> 2. **Risk per lot on one USD-quoted pair, one JPY-quoted pair and one cross**
>    — verifies `perUnit = contractSize × usdPerQuote` at all three shapes:
>    the textbook $10/pip case, the `1 / USDJPY` derivation, and a bridged
>    cross. Three observations validate the derivation behind all 28 forex
>    pairs, which with item 1 is the whole sizeable CFD set (§19c Step 3, §20i
>    ruling 1).
> 3. **`SP500`'s per-point value on a live ticket** — the map's single largest
>    scale trap ($20/point where retail desks quote $1–$10; §19a rule 3,
>    §19f's SP500 property test). A published number, worth watching once.
> 4. **The unpublished contract sizes** — every crypto symbol, silver on the
>    Markets side, the energies class. These are the rows blocked purely on
>    E8's silence (§19c "What is sizeable in wave 1"), and each one an
>    observation resolves is a market that moves from `Not published` to a
>    number.
> 5. **On the futures account: `ZB` and `ZN`** — tick size and value, absent
>    from the fee table, the tick table, the canonical 45-instrument list and
>    the live symbol browser. Their absence is why both rows ship
>    `unconfirmed` (§19a).
> 6. **On the futures account: `6J`'s tick and value as the platform computes
>    them** — the one number the boundary explicitly refused to fix with an
>    exchange notional (§20i ruling 5). E8's own table gives `6J` a derived
>    $125,000,000 per price unit against its siblings' $125,000, and no
>    published source reconciles it. A live ticket does. This is the item that
>    turns the inversion machinery from property-tested-and-unused into
>    shipped — and it is the clearest case in either section for why the third
>    route exists.
> 7. **The purchase screen's drawdown tier matrix** — amendment 10's input
>    contract, on both the forex and futures sides.
>
> **What the program does not change.** The refusal stays the default: a row
> without a published or verified value renders its word (§19e, §20f), and no
> row is promoted in anticipation of an observation. Nothing is ever inferred
> from an observation's neighbourhood. And the program is the owner's to run —
> the spec records the offer and the queue; it does not schedule the owner.

**Consequence for built code.** No change to shipped behaviour, and one
durable obligation on the tests that already exist: every row's state is now
expected to move over time, so `tests/brokerReference.test.ts` must keep
promoting one row a small, legible diff — the literal per-row expectation
tables it already carries (47 futures specs cell for cell, the 13/15 bridge
split by name), never a computed roll-up that hides which row changed. The
analyzer-version discipline has no bearing here: broker reference data is not
analyzer behaviour and does not scope global learning.

---

## Conflicts flagged, not resolved

Five places where an amendment meets existing spec text I could not reconcile
without making a ruling of my own. Each is flagged for the controller.

1. **The Daily Pause amount's denominator versus the canon's basis (§19c Step
   1 / §20d).** The canon's basis is the **day's starting balance**; the only
   balance Levelflow can see is the **tier**. Amendment 7 renders 2% of the
   tier, per the owner's direction that the row show real numbers, and per
   §19c Step 1's established convention. The residual: on an account whose
   day starts *below* its tier, the rendered figure is **larger** than the
   real pause line — the direction that matters, since a user reads it as
   headroom. §19c Step 1's justification sentence is also now partly
   overtaken: "Every drawdown basis E8 publishes is the initial balance" is
   no longer literally true (Daily Pause is day-start; §20e already notes
   Daily Drawdown resetting "based on the balance at market rollover"). I did
   not rewrite that sentence, and I did not add a disclosure to the facts
   block — §17f would fight any caption, and §20a forbids implying headroom.
   **RESOLVED (controller, 2026-08-02): the row renders the percent, not a
   dollar — `2% · Daily Pause` — because the percent is the rule's invariant
   and exactly true every day, while any tier-derived dollar overstates the
   real line on below-tier days. Amendment 7's text now carries this form.
   §19c Step 1's justification sentence is rewritten by the applier to name
   its true scope (the breach-drawdown bases, not Daily Pause).**
2. **`Not confirmed` leaving the facts block (§20d / §20j).** With amendment
   7, the only path to `Not confirmed` in the program-facts block closes, so
   §20j's facts-block literal list must lose it while §19's Size-row list
   keeps it. If the controller wants the string to survive in the facts block
   for a future unresolved fact, that needs a named reachable trigger — §20j
   is checked in both directions, and a literal nothing renders fails CI.
3a. **Record-band net R vs Attribution net R (applier's follow-on flag).**
   After the lifetime extension the two surfaces share one window but keep
   different net-R inclusion rules — the band sums any present `realizedR`
   (open runners' banked partials included), Attribution requires every
   resolved row to carry one. **RESOLVED (controller, 2026-08-02): both
   stay — they answer different questions.** The band is the account's
   running pulse ("net R banked so far"); Attribution is settled evidence
   per slice. Forcing all-or-nothing onto the band would em-dash it for any
   account whose older rows predate `realizedR` — less fidelity, not more.
   The distinction stays documented at both sites (`attribution.ts:91`,
   §10/§18), and is not a fork because the two figures never claim to be
   the same fact.
3. **The 80-row truncation reaches more than Attribution (§18).** Ruling B
   names Attribution, and amendment 2 scopes to it. But `buildRecordBand(setups, now)`
   reads the same 80-row array, so the record band above the ledger carries
   the same silent truncation — and it applies no 3-resolved threshold and a
   looser net-R rule than Attribution does. Whether the accuracy ruling
   extends to the record band is an owner call I did not make. If it does,
   the lifetime aggregate serves both and amendment 2's data path should be
   designed for two consumers rather than one.
   **RESOLVED (controller, 2026-08-02): it extends — the fidelity-across-the-
   board ruling reads as the governing sentiment, and once the lifetime
   path exists the record band reading a different window than the section
   below it would be a fork of exactly the kind these rulings close. The
   record band joins amendment 2's scope; the data path is designed for both
   consumers. Owner may veto.**
4. **Verified provenance versus §19b's research bar (§19a / §19b).** §19b
   says a program line re-enters only behind "a fresh primary-research pass",
   and explicitly not on "a checkout screenshot". Amendment 10 admits the
   purchase screen as `verified` data for **tier parameters**, which is a
   different question from **whether a program line exists** — and amendment
   9 removes the case that sentence was written about. I read the two as
   compatible on that basis. If the controller reads §19b's clause as
   governing all purchase-screen data, amendment 10 needs its scope stated in
   §19b as well as §20b.
5. **§17n versus mock-set geometry (§16 / §17c / §17n).** §16 gives the
   mockups composition; §17c says live product outranks mock; §17n is later
   than both. I took the reading that mock-set sizes are in the audit's scope
   — otherwise the compact chart's 168px, the frame's 12/16px gutters and the
   tab bar's 10.5px type are permanently exempt from a rule written to cover
   exactly that kind of dimension. The residual is real: the 168px chart is
   the one place where "as small as possible" pushes against the legibility of
   the thing the surface exists to show, and Expand chart is the release valve
   the mock already built for it. If the controller wants mock geometry frozen,
   §17n needs an exclusion list naming each frozen dimension — not a general
   carve-out, which would swallow the rule.

---

## Build-wave obligations

Four waves, and their order is not arbitrary.

**Wave A — the mobile audit (amendment 1, shipped code, both platforms).**
Measure every `<lg` surface and all shared mobile chrome against the built CSS
at 375×812; report pinned-chrome height, content-region height, and
per-element current/proposed size with the test that holds each one; then
resize. Insights' record band and filter row are pre-approved; the 96px
`pb-24` clearance against a 56px tab bar is the cheapest win and it pays out
on all six surfaces; Trades needs a "already lean, left alone" line rather
than a diff. Guards move with the strings: `tests/mobileNav.test.ts`,
`tests/surfaceComposition.test.ts`, `tests/deskComposition.test.ts`. The
no-page-scroll e2e already exists — add the budget numbers and pin the one
approved sub-44px exception with PR #149 named. Any newly proposed sub-44px
target goes to the owner, not into the diff. §17n then binds every future
mobile element, so this wave ends with a rule, not just a set of smaller
numbers.

**Wave B — the Attribution rework (amendments 2 and 3, shipped code).**
A lifetime aggregate over the user's own resolved rows, engine-side,
RLS-respecting, reading `realizedR` from the `feedback` JSON path; no new
columns. `buildAttribution` stops being fed `setups`. The 3-resolved gate
extends to net R, and the three-way render ("Learning" / em dash / number)
replaces the two-way one. Guards to move in the same set:
`tests/surfaceComposition.test.ts` (it pins the call text and both
ternaries), `tests/attribution.test.ts` (its signature guard and its sub-3
net-R fixtures), `tests/outcomes.test.ts`'s drift-guard map if the call count
changes, and the e2e presence checks, which should gain a value assertion the
loaded page could not have produced. The money-positive definition must not
fork: one helper, or a CI equivalence test over the whole outcome domain.
Wave B is independent of Wave A and can run in parallel.

**Wave C — §19 retrofit (amendments 4, 5, 9, 10). CORRECTION (controller,
2026-08-02): §19 is NOT design-only — it is built and merged (PR #159,
`src/lib/broker/` on main, migration applied live). This drafter's checkout
predated that merge.** The retrofit is therefore the after-cost branch: the
`Provenance` type gains the fifth tag and the `Observation` shape, the lot
step flips to a `verified` `Valued<number>`, the ten-line enumeration's
ground restates as discontinuation, the tier data reshapes to `Valued<>`,
and `tests/brokerReference.test.ts` moves with all of it — type, tests and
data module together, gates green per commit.

**Wave D — §20 authored to the amended spec (amendments 6, 7, 8; genuinely
unbuilt today).** `basis: "day_start_balance"` on the Signature Daily Pause;
`Daily loss` rendering **`2% · Daily Pause`** at Performance (the percent
form per the resolved conflict 1) with the futures 2%-of-tier identity
pinned in CI as data, unrendered; the EOD amount table with a null percent
and the 4/4/3/3 ratio pinned; `Not confirmed` out of §20j's facts-block
list. One research obligation carried, not a code one: §20f's open-item
list shrinks by one, and the closed item stays visible as closed.

**Standing, not a wave — Appendix A.** Each owner observation lands as its own
small change set: one `Observation`, one row promoted, one test line, one
sentence in the queue struck. The queue is ordered so the first three
observations validate the derivation behind all 29 sizeable CFD markets, and
so `6J` — the row the boundary could not fix — has a route.

---

## Amendments 12–16 — the broker-architecture rulings (owner, 2026-08-03 ~01:37)

The owner defined the broker architecture on 2026-08-03, then directed that
the original be rewritten for optimality without losing intention or
introducing unchecked inferences (owner direction, 2026-08-03). These are the
approved restatements — owner intent in canonical form, refinements from the
follow-up message folded in, controller notes marked as such.

**Amendment 12 — classification-wide applicability.** Evidence gathered on
the owner's E8 Pro Forex account — the feed verification (F1–F7), the 46
instrument observations, and the measured spreads, leverage, and contract
values — applies to every E8 account of the **Forex classification**.
Account classifications (Forex · Crypto · Futures) are where assets and
data differ; program lines within a classification (One, Pro, Signature,
Zero) differ only in account rules, which the catalog record already
covers. Platform refinement (owner, 2026-08-03 follow-up): the owner does
not plan to use MatchTrader; account setup offers **Platform** as a field
wherever a classification has more than one, with MatchTrader present but
**disabled (greyed) until verified** — adopted from the owner's own
proposal, verbatim in spirit: platform as an option, MatchTrader greyed
out for now.

**Amendment 13 — market availability follows the account classification.**
E8 Forex accounts cannot trade futures, so futures markets are removed
from **user view and from scanner action and results** whenever an E8
Forex account is active. Nothing is deleted behind that curtain (owner,
follow-up, explicit): futures calibration, replay-sweep artifacts, and
learned state are all retained, and futures series may continue to serve
as internal derivation sources. Energies (WTI, BRENT) remain on Forex
accounts. The same visibility treatment extends to Crypto and Futures
accounts once each classification's tradeable markets are confirmed. The
account governs the menu; the edge record governs setups.

**Amendment 14 — the account flow and saved account profiles.** A user
confirms their broker from the supported-and-modeled list, then the
account type (for E8: Forex, Futures, or Crypto; other brokers will
differ), then that account's parameters for the sizing functionality —
every step through the static catalog (ruling 7). Confirmed accounts are
**saved**, so a user holding several can select among them without
re-entry; one account is active at a time. The engine then shows only the
active account's applicable markets, only data matching what the broker
uses for those markets, and setups tailored by the replay sweep on the
actual, confirmed matching data source.

**Amendment 15 — the Futures and Crypto sequence.** E8 Forex modeling
settles first. Futures second: the owner will purchase a Futures challenge
and provide tradeable-asset screenshots as with Pro Forex; the exact FMP
data source per instrument is then identified, the replay sweep runs
against those confirmed sources, and the E8 Futures profiles are built to
existing standards. Crypto follows later at lower priority — the final E8
work before creating the environment for a new broker altogether.

**Amendment 16 — the E8-Forex-done gate (owner, 2026-08-03 follow-up).**
Before E8 Forex accounts are marked done within Levelflow — the
precondition for moving to Futures — **BNB and the indices must have clear
include-or-exclude answers.** Those answers cannot come without direct
matching, or the absolute closest achievable, between E8's data and what
FMP offers for setups. The cross-reference is therefore revisited
instrument by instrument, with the owner's screenshots as the reference;
any newly identified FMP source that better matches what E8 actually
shows replaces the current source, and any source change **necessitates a
new replay sweep** on the confirmed sources — that sweep, together with
tonight's insights, determines inclusion for BNB, the indices, and
whatever else it reaches. Controller note, marked as such: the three
stable-offset instruments (XAGUSD, WTI, BRENT) are the prime candidates
for better-matching sources under this gate.

**Amendment 17 — docs ride along (owner, 2026-08-03, restated per the
owner's standing preference).** The Guide, every document under docs/, and
the README receive applicable updates every time a feature, change, or
launch lands that touches their intended purpose — in the same change set,
not after. A change set that touches none of them says so in its PR body
with a sentence of reasoning, and the merge-gate review checks that claim
in both directions. Also written into the global standard the same night
("Docs ride along", ~/AGENTS.md Code quality).

**Amendment 18 — the account switcher's two homes (owner, 2026-08-03,
restated per standing preference; design specifics adopted from the
controller's recommendation with the owner open to suggestions).**
Saved-account switching (amendment 14) must be incredibly easy on desktop
and mobile, in the established aesthetic, and visible in two places: the
Profile page (the broker section becomes the confirmed-accounts list with
one active) and the main app interface. The main-interface home is the
existing broker chip, evolved: it displays the ACTIVE account rather than
the bare broker — catalog vocabulary only (the §20j program labels +
formatAccountSize; no invented words), condensed on mobile — and activates
the app's existing menu machinery: an anchored menu at ≥lg, the §17g sheet
below, listing every saved account (tap to switch) plus a Manage-accounts
route to the Profile section. With no saved account the chip keeps today's
informational form and its tap routes to Profile's broker setup. A switch
re-scopes the Desk live — markets, sizing, and record follow the newly
active account through the same reactivity §19's dormancy already uses.
Targets hold the §17n floors. Lands with the §19 retrofit's multi-account
schema.

**Amendment 18a — label decisions arrive as mockups (owner, 2026-08-03).**
When the switcher's label decisions come due, they are presented as mockups
at both widths — rendered options to choose from, never prose descriptions —
per the visual-overhaul precedent where mocks are the binding composition
authority. The owner's standing preference governs the candidates: succinct
language that does not crowd nearby elements.

**Amendment 19 — the checkout record rules the catalog (owner, 2026-08-03,
restated per standing preference).** Four rulings, answering the §19
retrofit plan's open questions:

1. **The purchase-checkout screenshots are the single source of truth for
   what E8 offers**, for every E8 account class — Forex, Futures, and
   Crypto. The catalog adheres to them. Whenever an offering is uncertain
   or sources conflict, the owner's screenshots — the account checkout
   screens and the in-platform TradeLocker captures of 2026-08-02 —
   overrule every other record, the dossiers included. The `zero`
   consequence is OWNER-CONFIRMED (2026-08-03, on plan review): Zero is
   offered on Futures as two distinct account types; its absence from the
   Forex checkout screens means it does not belong on the Forex walk.
   **Unavailable options are never included, greyed or otherwise.** So:
   Zero MAX and Zero Starter stay on the Futures walk where
   the checkout sells them; the forex-family `zero` never enters the
   rendered catalog in any form. Greying remains reserved for
   sold-but-unverified (MatchTrader); unavailable is absent — a general
   rule, not a Zero-specific one. The data record stays (amendment 13:
   nothing deleted).
2. **E8 Trial is out of scope entirely.** Levelflow builds nothing for
   trial accounts. Their absence from the catalog is correct by ruling,
   not a gap.
3. **Forex-carried crypto stays forex-scoped.** The crypto markets a Forex
   account carries are confirmed part of that account's offering, but they
   are separate from what the actual E8 Crypto accounts will report and
   make available. Evidence observed on them never crosses onto
   Crypto-classification lines — the narrow reading of contract-size
   adjacency stands.
4. **Where the documentation suffices, proceed on it** — always under
   clause 1's precedence when the two conflict.

**Amendment 20 — one data foundation: FMP, maximized and aligned, or
excluded (owner, 2026-08-03, restated per standing preference).**

1. **FMP is Levelflow's single data foundation.** Maximize what it offers
   and align to it precisely before any consideration of another source.
2. **Supplemental providers are ruled out categorically.** The only path
   to different data is a wholesale REPLACEMENT of FMP by a single,
   stronger provider — on a concrete recommendation, decided by the
   owner. (Standing invitation: the controller may recommend one when the
   evidence argues for it. Recommendation of record, 2026-08-03: keep
   FMP — no single provider dominates across Levelflow's five live
   classes, and the F1–F9 identity evidence shows FMP is the same market
   the broker trades wherever a match exists. Revisit trigger: a futures-
   centered desk needing Eurex would evaluate Databento as a full
   replacement.)
3. **The exclusion rule.** An instrument observed on a broker offering
   with no FMP match is EXCLUDED from Levelflow for that offering — not
   rendered, not scanned, not analyzed there. The rule applies per
   classification and account type: a symbol excluded on one offering may
   exist on another where its match does.
4. **Universal.** Every broker integration and every analysis, present
   and future — E8 (Forex, Futures, Crypto) is the first subject, not the
   scope.

Consequences applied on arrival: F9's no-source rows (FDAX, FDXM, FESX,
FGBL, FGBM, FGBS, FGBX, NKD, EMD, UB, TN, ZW) are excluded from the
futures offering by rule. A stable basis against an existing FMP match
(XAGUSD +0.17, WTI +0.24) is NOT a missing match — the basis-handling
decision stands in the §19 retrofit. Month-offset rows are matches under
F9's month-aware comparison, and the USX-suffix resolutions
(grains/meats/softs) ARE matches.

## Amendment 21 — every account-specific percentage carries its dollar amount (owner, 2026-08-04, universal)

**The ruling** (owner, 2026-08-04): any interface listing an
account-specific percentage must also show the dollar amount — drawdown or
risk, profit target, or daily reset alike.

1. **The shape is the owner's own: `X%/$XXX`** — the percentage, a slash,
   the dollar amount that percentage means at the account's size. The
   money is exact (owner ruling, same day): cents render only when the
   arithmetic produces them, and `.00` never renders — `8%/$2,000`,
   `0.25%/$62.50`.
2. **Scope is every account-specific percentage on every interface** —
   drawdown, risk per trade, profit target, daily reset/pause, and any
   future kin. A percentage without a known account size renders alone;
   the moment a size is in scope, the amount rides.
3. **Applied on arrival**: the Profile walk's Risk-per-trade and Drawdown
   selects (the only two account-percentage surfaces live on 2026-08-04),
   computed from the draft's own selected size, reactive to size changes.
   The §20 governor build inherits this rule for every surface it adds —
   profit targets and daily-loss lines land with their amounts from birth.

## Amendment 22 — reliable sizing data is the durable, universal bar for offering Size (owner, 2026-08-05 00:54)

Raised against the futures account's two Treasury rows (`ZB`/`ZN`, tick and
value never published by E8), and immediately generalized by the owner into
a standing rule for every market, every account setup, and every broker.

**The ruling** (owner, 2026-08-05 00:54): the treasuries being unsizable
without reliable E8 data is an acceptable exclusion — sizing is a secondary
benefit for the user, so withholding it this way is fine, and it must not
restrict the market itself from being analyzed and offered. Generalized into
a durable rule whose reach the ruling itself states open-ended: reliable
data is the bar sizing must clear to be offered by Levelflow, across all
markets, all account setups, all brokers, and whatever else the rule
reaches — now and into perpetuity. The enumeration is illustrative, not a
closed list.

1. **Sizing is a layered, secondary benefit — never a gate on the market
   itself.** A market's own tradability (is it analyzed, is it offered,
   does it get setups) is decided on the amendment 19 checkout/platform
   record alone. Whether Levelflow can also attach a position size to that
   setup is a second, later question, answered only by the Size layer, and
   an unanswered second question never reaches back to veto the first.
2. **The bar for offering Size is RELIABLE data — published, verified, and
   self-consistent.** "Reliable" is not merely "present": a tick size and a
   tick value that are both non-null but cannot be reconciled against the
   instrument's own siblings (E8's own table contradicting itself) is not
   reliable data, and does not clear the bar, regardless of whether every
   individual field is non-null. Unpublished data and self-inconsistent
   data are both failures of the same bar, and both withhold the same
   layer.
3. **A sizing-data gap withholds ONLY the Size layer.** The market itself
   stays analyzed and offered — scanned, shown, eligible for setups. Only
   the position-size number is absent, rendered as the appropriate §19e/§20f
   word. Nothing about market visibility, scanning, or setup generation may
   be made to depend on whether sizing data exists.
4. **Universal, durable, in perpetuity.** This rule is not scoped to E8, to
   futures, or to the treasuries that raised it. It applies across every
   market, every account setup, and every broker Levelflow adds, now and
   going forward, without needing to be re-decided.

**Consequence for built code.** `src/lib/broker/instruments.ts`'s
`hasPublishedSizeInputs` — which drives `SIZEABLE_MARKETS_BY_LINE` — is a
pinned, test-verified derivation of what the Size layer may size, corrected
here after Task 17b's fix round 1 review (2026-08-05): it is **not** a
runtime enforcement point, because nothing in `src/` outside
`instruments.ts` itself reads `SIZEABLE_MARKETS_BY_LINE` today. It already
excludes unpublished data (a null unit value already blocks a row);
amendment 22 makes it explicit for self-inconsistent published data too —
`6J`/`6M`'s tick and value are both non-null and both `primary`-tagged, yet
cannot be reconciled against their siblings (`UNRECONCILED_TICK_AXIS`), so
the function now names the exclusion rather than relying on the
happenstance that no Levelflow symbol yet maps to either. The actual
runtime sizing path, `sizing.ts`'s `sizeInstrument`/`perUnitValue`, has no
independent knowledge of this exclusion and would compute a real (wrong)
number from `6J`/`6M`'s raw figures were a row ever to reach it with
`tradability: "confirmed"` — unreachable today (no Levelflow symbol maps to
either), with the real runtime gate landing wherever a future
futures-onboarding change first wires one of them to a Levelflow row
(`sizing.ts`'s own `perUnitValue` docblock carries this pointer, so the
gap is not left only in an ephemeral task report). This is the ruling under
which `ZB`, `ZN`, `6J` and `6M` are re-grounded in the same change set:
tradability moves under amendment 19 (all four are OFFERED); sizing stays
withheld under amendment 22 (none is RELIABLE) —
`tests/brokerReference.test.ts` pins both halves.

## Amendment 23 — the broker↔FMP matching relationship is the master list; display and matching are different questions (owner, 2026-08-05 01:14, naming addendum same dispatch)

**Ruling A — should vs can, the master list, and per-account visibility**
(owner, 2026-08-05 01:14). E8's offering dictates what Levelflow SHOULD
generate setups for; FMP's offering dictates what it CAN generate them from.
A significant offset excludes a market from user-facing display without
disconnecting its backend match to the E8 offering. Once the correct FMP
data is identified for every E8 offering across every E8 account type, that
matching relationship is saved reliably and becomes the master list for all
E8 replay sweeps, regardless of display state. The user sees only the market
categories applicable to their actual account type. This is the model for
every broker Levelflow adds.

**Ruling B — naming follows the broker; the backend reconciles** (owner,
2026-08-05 01:14, naming addendum, same dispatch). FMP's and the broker's
(E8's) naming will not always match. Levelflow always displays the broker's
own name for the tradable asset, so the user sees continuity with no
confusion; reconciling FMP's naming against the broker's is a backend
concern only.

1. **The broker dictates SHOULD; FMP dictates CAN.** What E8 offers on an
   account decides what Levelflow *should* generate setups for (amendment
   19's checkout/platform record, per market and account type). What FMP
   can actually supply for that same instrument decides what Levelflow
   *can* generate a setup from (amendment 20's data-foundation rule). The
   two questions are asked in that order and never collapsed into one.
2. **The broker↔FMP mapping is saved durably as THE master list for that
   broker's replay sweeps — regardless of display state.** Once the
   correct FMP source is identified for an E8 offering, on a given E8
   account type, the match is recorded permanently. Every E8 replay sweep
   runs against this saved master list, never against a live
   re-derivation and never against only the subset currently shown to a
   user.
3. **Offset-significant markets are display-excluded, never unmapped.**
   When a measured basis between the broker's price and FMP's is
   significant enough to impact quality setups, Levelflow excludes that
   market from what the user sees — it does not delete, weaken, or omit
   the underlying E8↔FMP match from the backend record. The match stays in
   the master list; only the user-facing display and setup generation for
   that market turn off.
4. **Account-type visibility follows amendment 13.** The user sees only
   the market categories applicable to the actual account type they are
   generating setups for — the same per-classification menu amendment 13
   already establishes, now stated as part of this broker-integration
   model rather than as a separate rule standing on its own.
5. **Display names ALWAYS follow the broker; the backend reconciles
   tickers.** Wherever FMP's and the broker's naming conventions diverge,
   the user-facing name is always the broker's own name for the tradable
   asset, so the user sees continuity between their broker and Levelflow.
   Ticker/symbol reconciliation between FMP's spelling and the broker's is
   a backend concern only, invisible to the user.
6. **The model is universal.** This is the model for every broker
   Levelflow adds, not an E8-specific pattern — the should/can split, the
   durable master list, the display-exclusion-without-unmapping rule,
   account-type visibility, and broker-first naming all carry forward
   unchanged to the next broker integration.

**Pending, not pre-decided — the offset-significance bar.** Three measured
E8-vs-FMP bases are on record
(`docs/research/e8-feed-verification-2026-08-02.md`): Brent ~2% (≈196 bp;
F4/F6/F10) and XAGUSD/WTI ~30 bp each (F1/F4/F6/F7/F10). The bar for what
counts as "significant enough to impact quality setups" under clause 3
above is proposed to the owner and awaits their word: Brent's ~2% is the
display-exclude candidate; XAGUSD's and WTI's ~30 bp are
display-plus-basis-line candidates (kept visible, the basis shown alongside
the price). This amendment records the proposal and the candidates; it does
not rule on the bar itself, which stays open until the owner decides it.

**Consequence for built code.** No display change ships from this
amendment alone — the offset-significance bar is still pending (above).
What is already true and now stated as durable law: `src/lib/symbolMap.ts`'s
`fmpSymbol` field is exactly this "master list" for the CFD/Forex/Metals/
Energies/Crypto rows already resolved, and the same discipline extends to
the Futures side as each E8 offering's FMP match is identified (this task's
own `ZB`/`ZN` — already matched — and `6J`/`6M` — newly matched; see
`docs/research/e8-futures-account-2026-08-03.md` and
`e8-feed-verification-2026-08-02.md`'s F12 entry). No source file renders
an FMP symbol to the user anywhere in this codebase already
(`tests/languageGuard.test.ts` bans `brokerSymbol`/`brokerSymbolAlt` in
JSX); this amendment makes explicit why that discipline is permanent
rather than incidental.

**The offset ruling of record (owner, 2026-08-05) — the pending bar,
decided.** XAGUSD and WTI stay in the visible universe, each carrying a
basis line on the setup surface: the recorded offset and the setup's own
entry restated on E8's own feed, rendered only while a setup is on stage.
BRENT is display-excluded — it leaves every user-visible surface (scope
menus, the scan universe, chart selection) while its FMP match and its own
basis stay recorded in the master list for backend broker-matching and
replay sweeps, exactly as ruling A above already specified. `src/lib/broker/
offsets.ts` is the guarded data module carrying all three values, with
`displayExcluded` marking BRENT's row; `src/lib/broker/visibility.ts`'s
`visibleAssetGroups`/`visibleAssetSymbols` is the one place this filter
applies, so every user surface reads the same withheld universe.
`AVAILABLE_ASSET_*` (`src/lib/symbolMap.ts`) is untouched by the filter and
stays the master list. **The enumeration of grounds for exclusion is
open-ended** — offset magnitude is the ground this ruling decides on, and a
future case may be posed and decided on an entirely different ground (a
market with no confirmed FMP source at all is one such case this ruling
does not need to reach).

**The situational offset protocol (owner, 2026-08-05).** No future offset
case is auto-decided by a formula or a fixed threshold. Each is posed to the
owner individually, carrying: the offset's magnitude, its size as a
percentage of price, how it relates to the setup's own ladder geometry
(stop distance, target distance), and a per-instrument recommended verdict.
The owner rules case by case; this amendment records the protocol the
posing follows, not a bar a future case could clear on its own.

**The reentry rule (owner, 2026-08-05).** Every excluded market, on any
exclusion ground, is a standing reentry candidate re-evaluated at every
future replay sweep — exclusion is never treated as final. An offset
exclusion gets fresh basis re-measurement plus a setup-quality
re-evaluation at that sweep; a no-source exclusion gets a source-resolution
refresh. A market's evidence changing returns it to the owner as a newly
posed case under the situational protocol above — it does not re-enter
display on its own.

**Rendered strings (spec §17f: nothing else new renders).** The basis
line's template is the one new string this ruling adds, owner-approved
copy: `E8 quotes ~+0.17 above this feed — entry there ≈ 57.97`. The two
numbers are computed live — the recorded basis constant
(`src/lib/broker/offsets.ts`) and the setup's own entry price — never part
of the registered vocabulary; the surrounding words are the registered
vocabulary (`tests/languageGuard.test.ts`). The adjusted entry these
numbers produce is display-only by construction: it never enters the
ladder's copy payload and never reaches the chart
(`tests/advisorRecommendationPanel.test.ts` pins both directions).
