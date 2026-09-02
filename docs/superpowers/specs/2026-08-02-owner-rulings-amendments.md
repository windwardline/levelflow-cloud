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
formatAccountSize; no invented words), condensed on mobile [SUPERSEDED
2026-08-03 by the piped-dressing ruling: the piped form `E8 | FOREX | 100K`
ships at EVERY width and on every surface, and the condensed candidate does
not ship at all — `docs/design/mockups/s-switcher-v1.html`'s recorded verdict
and `AccountSwitcherMenu.tsx`'s implementation both follow the later ruling;
this clause is amendment 18's original text, kept for the record] — and activates
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

**The registry of record (§19 retrofit, Task 17e).** `src/lib/broker/
masterList.ts` is the concrete module ruling A's clause 2 describes: one row
per E8 instrument, across all three account classifications (forex,
futures, crypto), each carrying its broker-facing name, its FMP mate where
one exists, a status, a short exclusion/limitation ground, and a
reentry-candidate flag per the reentry rule above. Ninety-eight rows total
— 38 forex-classification, 27 futures, 33 crypto — generated from
`symbolMap.ts`'s 59 already-mapped instruments wherever a row already has a
source, and hand-carried only where none existed yet: the 25 crypto mates
and the 12 no-FMP-source futures names this task's own research settled
(`docs/research/e8-crypto-source-resolution-2026-08-05.md`,
`docs/research/e8-futures-account-2026-08-03.md`), plus the two
backend-only unsizeable futures instruments (`6J`/`6M`) F12 resolved
(`docs/research/e8-feed-verification-2026-08-02.md`). `symbolMap.ts`'s
`AVAILABLE_ASSET_SYMBOLS` and `visibility.ts`'s `visibleAssetSymbols` stay
unchanged and remain the one live source of truth for what is served and
what is visible today; the registry's own derivations check membership
against them directly rather than keeping an independent copy. One status
beyond ruling A's own three (`served-and-visible`,
`served-but-display-excluded`, and sizing's `offered-but-unsizeable`) —
`served-but-not-scannable` — covers the nine rows `symbolMap.ts`'s
pre-existing no-trade and feed-verification exclusions already withhold, a
calibration axis distinct from this amendment's broker↔FMP-matching
concern and named here for completeness rather than left an unrepresented
gap. `sweepUniverse()` (every row carrying an FMP mate, regardless of
display state) and `reentryList()` are the derivations a future
replay-sweep script is meant to consume; `tests/brokerMasterList.test.ts`
pins every count and every mapping literally, §19f discipline.

## Amendment 24 — the scannable offering is decided per E8 account type; a per-account-type exclusion is now expressible (owner, 2026-08-05, distilled)

**The end state.** Levelflow's scannable offering, for the account a user
is actually trading, equals exactly the markets E8 makes visible and
tradable on that account's classification — nothing broader. Two
exceptions only: a market with genuinely no FMP counterpart (amendment
20), and an owner-decided exclusion grounded in data drift or poor
replay-sweep performance. Inclusion and exclusion are decided per E8
account type — forex, crypto, futures — because E8 treats the three as
distinct products; the same market may be included on one account type
and excluded on another, since performance and E8↔FMP alignment can
differ per type. Every confirmed match stays a candidate for inclusion AND
exclusion at every sweep, so the offering stays the most complete,
money-positive set available. The app's existing account toggle is what
makes this operational — no new UI, no new menu.

**The gap this closes.** Before this task, exactly two mechanisms governed
what a user could see, and neither could express the end state above.
Classification-hiding (amendment 13, `visibility.ts`'s
`HIDDEN_ASSET_TYPES_BY_CLASSIFICATION`) was account-scoped, but only at the
coarse SecurityType level — it could hide "all Futures" from a Forex
account, never one specific symbol on one specific account type.
Display-exclusion (amendment 23's offset ruling, `offsets.ts`'s
`isDisplayExcluded`/`DISPLAY_EXCLUDED_SYMBOLS`) was symbol-level, but
applied unconditionally — its own header comment's word was "regardless of
account." A single market excluded on forex while staying visible on
crypto was inexpressible in either mechanism, or in the two composed.

**What shipped (§19 retrofit, Task 19).** One resolver,
`src/lib/broker/visibility.ts`'s `scannableSymbolsFor` — the single place
that answers "what is scannable for this account classification," reached
by `visibleAssetGroups`/`visibleAssetSymbols` (unchanged signatures, so
every existing call site — the scope menus, the scan universe, chart/
security selection, the Insights market filter — is untouched). It
computes: the account type's offered classification groups
(`OFFERED_CLASSIFICATIONS_BY_ACCOUNT_TYPE`, keyed to the registry's own
`classification` vocabulary rather than a raw SecurityType — the same
account-type boundaries `HIDDEN_ASSET_TYPES_BY_CLASSIFICATION` drew,
proven identical symbol-for-symbol rather than assumed), minus no-FMP-
source rows (vacuous today by construction — every already-served row
carries a non-nullable `fmpSymbol`), minus owner exclusions scoped to that
account type. `HIDDEN_ASSET_TYPES_BY_CLASSIFICATION` is retired, not kept
alongside the new mechanism — ruling A.1, clause 6's "the model is
universal" extends here too: one resolver, never two competing sources for
the same question.

**The exclusion register — `src/lib/broker/exclusions.ts`.** A first-class,
literal-pinned array: each entry names a Levelflow symbol, the E8 account
classification(s) it is withheld on, a ground (`no-fmp-source` |
`data-drift` | `sweep-performance`), and a citation. Every entry is a
standing reentry candidate by construction — the type carries no field
that could mark one otherwise, mirroring `masterList.ts`'s own
`reentryCandidate` derivation for the same reason amendment 23 first
stated it: no exclusion is ever final. BRENT migrates into this register
scoped to `["forex"]` — the one account type it was ever offered on, so
the scoping is a mechanism change with zero observable effect, per this
amendment's own charge. `symbolMap.ts`'s pre-existing global withholdings
(`NO_TRADE_SYMBOLS`, `TEMPORARILY_HIDDEN_ASSET_SYMBOLS` — SP/NSDQ/DOW/
NIKKEI/DAX/NGUSD/HGUSD/BNBUSD/ASX) are deliberately NOT migrated: they
operate one layer upstream, on what counts as *served* at all, a
calibration axis this amendment does not touch, and moving them would have
widened this task's diff onto ground it was not asked to cover.

**BNBUSD is the coming real case, not this amendment's own change.** The
owner has flagged that BNBUSD will eventually need include-on-crypto /
absent-on-forex — the first case where the SAME symbol needs opposite
verdicts on two account types where the underlying calibration record
supports it. This amendment proves the *mechanism* for exactly that shape
against a synthetic fixture row (`tests/brokerVisibility.test.ts`) rather
than pre-empting the owner's own ruling on BNBUSD itself, which stays
governed by `symbolMap.ts`'s global withholding until that ruling lands.

**Mechanism only — the offering is bit-for-bit unchanged.** Every visible
set this amendment's resolver produces — forex (38), crypto (7), futures
(11), and the no-account union (49) — is proven, per account type, equal
symbol-for-symbol to what the retired mechanism produced
(`tests/brokerVisibility.test.ts`'s before/after equality suite,
reconstructing the retired table from the untouched primitives it was
built from and diffing against the new resolver's output, not merely
re-asserting the same literal list twice). `masterList.ts` — Task 17e's own
registry — is untouched by this task's diff: its `sweepUniverse()` still
returns every FMP-matched row regardless of exclusion or account type
(BRENT included), its `reentryList()` is unchanged, and its own tests pass
without a single edit. `AVAILABLE_ASSET_SYMBOLS` (`symbolMap.ts`) stays the
unfiltered master 50.

**A bundle-safety finding, corrected in the same change set.**
`masterList.ts`'s own header documents, and Task 17e's own tests assert by
construction, that the registry is never imported from `src/components` or
any other client-bundled file — its ~500 lines of per-row ground and
research-doc citations are deliberately excluded from `dist/assets`. An
early draft of this task's resolver imported `masterList.ts` directly, in
service of "registry-derived truth" read too literally; inspecting the
built client bundle caught the entire registry — status strings, doc
citations, and all — leaking into the shipped JS. The fix: the live
resolver is built on `symbolMap.ts`'s already-served master 50 (which
carries everything the resolver actually needs — per-option `assetType`
and a non-nullable `fmpSymbol` — for every row that could ever be
scannable) plus the small `exclusions.ts` register, never on
`masterList.ts`'s row array. `classificationOfType`, the tiny pure mapping
from SecurityType to account classification, is duplicated one-for-one
between `masterList.ts` and `visibility.ts` rather than shared, precisely
so `visibility.ts` never depends on the module the codebase already
promises to keep out of the bundle. `tests/brokerVisibility.test.ts` pins
both the absence of a `masterList.ts` import from any client-bundled file
and the presence of the registry's own classification vocabulary,
so a future edit cannot reintroduce the leak unnoticed.


## Amendment 25 — a market is never judged on a starved sample (owner, 2026-08-06)

A market's measured performance may not be used to exclude it unless the market
had a fair chance to produce evidence. A verdict drawn on a starved sample is a
verdict about Levelflow's configuration, not about the market.

The rule exists because one failure repeated five times in a single night, each
time as a market that looked edgeless and was in fact constrained by a parameter
we had chosen:

| market | what actually happened |
|---|---|
| oil (WTI, BRENT) | an energies TP1 share twice every healthy class's value |
| the six indices | an ATR cap clipping structural stops; the class negative was a profitable structural subset averaged with a badly negative cap-clipped one |
| copper, natural gas | an absolute cost floor exceeding their entire risk distance — 0 of 2304 and 0 of 1689 setups could clear reward:risk |
| oats, rough rice | a runner ceiling too tight to reach; rice's "-0.200" was SEVEN setups, and at a reachable ceiling it produces 71, its stop rate falls 33% to 11%, and it turns positive |
| livestock | diagnosed as too thinly traded to calibrate; the ladder in fact refused 396 of the 416 decisions that reached it |

**Mechanized, not documented.** `BrokerVisibilityExclusion` requires a
`starvationCheck` on every `sweep-performance` entry, carrying the market's
geometry-survival rate and filled-setup count with a cited source.
`tests/brokerExclusions.test.ts` refuses an exclusion below 0.33 survival or 300
filled setups, and refuses a starvation check on grounds where it would imply a
judgement never made. `scripts/starvation-audit.ts` exits non-zero when any
market is starved.

**Broker-agnostic by construction.** The requirement binds the exclusion
register, and every broker's exclusions land there. Run the audit against a new
broker's first sweep before reading any expectancy as a verdict.

**The floors.** 0.33 survival: the five markets that fooled us ran 5% (feeder
cattle) to 27% (rough rice), while the healthy core of the universe runs 73-99%.
300 filled setups: the smallest sample any exclusion considered tonight would
have needed to survive scrutiny.

## Amendment 29 — Insights and Attribution are exempt from account segmentation (owner, 2026-08-07)

**Numbering note.** 26, 27 and 28 are enacted on the `s19-release` branch and
land with PR #240; this is the next free number on `main`.

**The ruling, in the owner's own frame:** *"The Insights and Attribution
features track all trades, across all markets, and all accounts for the user
and are exempt from this segmentation."*

**What it supersedes.** Amendment 13 made market availability follow the account
classification, and §19 retrofit Task 8 applied that to the Insights market
filter — the filter's options were built from `visibleAssetGroups(activeAccount)`,
and an account switch reset a filter naming a market the new account could not
trade. That reading is now narrowed: amendment 13 governs surfaces that GENERATE,
and Insights generates nothing.

**Why the distinction is the right one.** The Desk is segmented for a concrete
reason — offering a futures market to a forex account produces a limit price the
operator cannot place, which is the worst failure this product has. Insights
produces no price. It is the record of what the operator has already traded, on
every account they hold, and a record that hides part of itself depending on
which account is selected today is not a record.

**What was actually wrong.** The ledger rows were never filtered by account, so
the *tracking* was already exempt. The **filter** was not: an operator on a forex
account could not slice their own history to a futures market they had traded.
The data was there and the way to look at it was not, which is the more insidious
half — nothing looked broken.

**The mechanism.** `HistoryPanel` no longer takes a `profile` prop at all. It
cannot consult the account, so the exemption is structural rather than a rule
someone has to keep. The filter's options come from `groupsForTradedSymbols`,
derived from the ledger itself: exactly the markets that have rows, in the
roster's own group order. Wider than one account's offering, and narrower than
the whole roster — a filter option for a market with no rows behind it is noise,
and on a 100+ market universe it is a lot of noise. It is also self-maintaining
as both the universe and the operator's history grow.

## Amendment 30 — a measurable offset is stated, never hidden (owner, 2026-08-07)

**The ruling:** where E8 and FMP are a real match but the price carries a
measurable offset, the market is **shown with its basis line**. The offset's
size is not a reason to withhold. Calibration is what tightens it.

**What it settles.** Amendment 23 built the basis line and drew a significance
bar, excluding BRENT at ~196bp as past it. That bar is retired. The line's whole
purpose is to make an offset legible — *"E8 quotes ~+1.67 above this feed —
entry there ≈ 85.72"* — so a larger offset is a reason to state it more plainly,
not a reason to hide a market the operator's account offers and the data
supports. XAGUSD (+0.17) and WTI (+0.24) were already shown this way; BRENT now
joins them, and the rule is general rather than per-market.

**The boundary this does NOT move.** A measurable offset is a real match. It is
categorically different from no match at all — a market E8 offers that FMP does
not carry, or carries under a spelling that resolves to a different asset
(FMP's `METUSD` is Metronome at $0.54 against E8's Micro Ether at $1,871; its
`HEUSD` is a crypto token, not lean hogs). Those have **no verifiable data
source** and stay on the dormant excluded list, re-probed each run.

So there are exactly three states, and every market is in one:
1. **Matched, no material offset** — served plainly.
2. **Matched with a measurable offset** — served with the basis line stating it.
3. **Unmatched** — dormant excluded, invisible, out of every analysis, and
   re-admitted automatically the moment a source appears.

**What follows for calibration.** An offset is a measurement about a market, so
it belongs in the per-asset tuning the owner has directed rather than being
frozen as a display constant. The basis is recorded per symbol with the frames
that measured it; a sweep that narrows it should narrow the line with it.

## Amendment 31 — full matched coverage is the resting state (owner, 2026-08-07)

The owner confirmed the shipped result on the live site and fixed it as the
position to hold:

> "I saw that all matching tradable markets are live on Levelflow on the public
> site. This is where we need to stay, unless the calibration later determines
> we add matched markets to the exclusion list."

**The default is ON.** Every E8 market with a verified FMP source is visible and
usable on its account type, and that is the resting state rather than a snapshot
of one release. Amendment 30 settled how a matched market is *presented*; this
settles that it is presented at all, and that nothing needs to argue for its
inclusion.

**There is exactly one path off the list, and caution is not it.** A matched
market leaves the offering only when calibration produces evidence against it —
a measured result, on the record, in the per-asset work. Not a hunch, not an
unverified suspicion about a feed, and not the general nervousness that
originally built a 52-symbol no-trade list in which every single symbol turned
out to have a match. That list is the precedent this amendment exists to prevent
recurring.

**The asymmetry is deliberate.** Adding a market needs only a verified source.
Removing one needs a measurement. The two directions are not equally cheap
because they were not equally cheap in their consequences: a market wrongly
withheld is invisible, so nothing ever surfaces the error, while a market
wrongly served is visible and its record accumulates where the owner can see it.

**What this does not freeze.** The unmatched dormant list still re-admits
automatically the moment `scripts/verify-fmp-matches.ts` finds a source, and
still ejects a SERVED market whose feed lapses — that is a source failure, not a
calibration verdict, and it remains automatic. Amendment 31 governs the
judgment calls, not the source gate.

## Amendment 32 — a derivative is not its underlying (owner ruling, 2026-08-07)

An E8 index future with no corresponding FMP **futures** series is unmatched and
belongs on the dormant list. Cash index data may look identical, but it is a
different measurement — and that difference is precisely where the observed offset
originates. No match, no inclusion. Dormancy remains revisitable as product
offerings change.

**Universal, every broker and every account type.** Any market without a genuine
FMP match is dormant and excluded from the user's view. Data integrity outranks
coverage. This is not a futures rule or an E8 rule — it is the identity rule for
every market Levelflow will ever serve.

**A future written on X is not X.** The cash index and the future on it are two
different instruments with two different measurements, and the gap between them
is not a venue quirk to be measured off — it *is* the difference between the
instruments. Same for a currency future against its spot pair. Matching one to
the other is not a match, so amendment 31's coverage floor never applied to them
and there is nothing to remove under it: they were never matched in the first
place.

**This retires the design that briefly stood in this section.** An earlier draft
of amendment 32 proposed modelling the carry — a basis computed per decision from
rate differential and days to expiry — so these markets could keep being served.
That was the wrong answer to the right observation. Building a model to
manufacture a series we do not have is not the same as having the series, and it
would have shipped a derived number wearing a measured number's clothes. The
ruling is simpler: no match, no inclusion.

**What it covers — thirteen rows, four of them live.** `EMD` on `^MID`, `FDAX` on
`^GDAXI`, `FESX` on `^STOXX50E`, `NKD` on `^N225` were served and visible; `FDXM`
sat behind `FDAX` as a variant; and eight CME currency futures — `6E`, `6A`,
`6B`, `6N`, `6C`, `6S`, `6J`, `6M` — were mapped to spot pairs. All thirteen are
**unmatched and dormant**: invisible, out of every analysis, and out of the sweep.

**What it does NOT cover, and the line is the instrument, not the ticker.** A CFD
that tracks an instrument, matched to that instrument's own series, is a real
match and is unaffected:
- The six cash index CFDs — ASX, DAX, DOW, NIKKEI, NSDQ, SP — are *cash* products
  on cash series. Correct, and they stay.
- The static measured offsets of amendment 30 — XAGUSD +0.17, WTI +0.24,
  BRENT +1.67 — are the same instrument quoted by two venues, not two different
  instruments. Amendment 30 stands unchanged.

**Revisitable, and automatically.** This is a dormancy, not a verdict. Product
offerings change and FMP's coverage changes; `scripts/verify-fmp-matches.ts`
re-probes for a genuine futures series on every run, and any of these thirteen
returns the moment one exists. Nothing here requires a human to remember.

### The audit this ruling forces, and the one case it does not settle

Every served market was checked for instrument identity, not just the futures.
102 served, 14 whose FMP symbol differs from their Levelflow symbol. Twelve
resolve cleanly:

- **Two are spelling, same coin** — `ARWUSD`→`ARUSD` (Arweave) and
  `TRUMPUSD`→`OTRUMPUSD` (FMP's literal `TRUMPUSD` is a different, moribund
  token). Real matches.
- **Six are cash CFDs on cash series** — ASX, DAX, DOW, NIKKEI, NSDQ, SP. Real
  matches, and the contrast that makes this ruling coherent: the same `^GDAXI`
  series is a correct match for the DAX *cash* CFD and an incorrect one for the
  `FDAX` *future*.
- **Four are the index futures this ruling removes.**

**Undecided, and it needs the owner: BRENT→`BZUSD` and WTI→`CLUSD`.** Both are E8
oil CFDs mapped to FMP's oil *futures*. Broker oil CFDs are conventionally written
on the front-month future, which would make these the same instrument and a real
match — and amendment 30 ruled on them that way earlier the same day, explicitly
retiring the significance bar that had excluded BRENT.

What is not established is whether E8 tracks the *same expiry* FMP publishes. The
measured offsets point different ways: WTI at +0.24 on ~\$80 is about 30bp, which
is spread-shaped; BRENT at +1.67 on ~\$85 is about 196bp, which is large enough to
be a different contract month rather than a spread. A different month is a
different instrument and would fall under this ruling.

*Recommendation:* keep both serving for now — amendment 30 is a direct ruling on
these two markets and this ruling was aimed at derivatives-on-underlyings, not at
CFD-on-future. Settle it with one frame: compare E8's live BRENT and WTI quotes
against FMP's front-month **and** next-month. If E8 tracks the front month, they
are matches and amendment 30 stands unchanged. If BRENT tracks a different month,
it goes dormant under this ruling and amendment 30's BRENT clause is superseded.
Until that frame exists, neither is asserted as settled.

### The frame exists — transcribed 2026-09-01, decided 2026-08-09

**This settles the paragraph above by its own conditional, and it is a
transcription rather than a new ruling.** The owner supplied the frame on
2026-08-09 and the amendment already stated what each outcome would mean; what
was missing was that the answer never reached this file. Read on its own, the
text above still sends a reader to ask a question that was answered three weeks
ago — and because §-numbered specs outrank HANDOFF prose, this was the
highest-authority copy still saying "open" while three passages in
`docs/HANDOFF.md` (`:248`, `:358`, `:550`) recorded it settled.

**Frame F13** (`docs/research/e8-feed-verification-2026-08-02.md:768-793`), owner
capture, 2026-08-09 21:44:53/21:45:00 EDT, mid-month and post-roll, platform
clock visible:

| | E8 mid | FMP exact-minute bar | offset | verdict |
| --- | --- | --- | --- | --- |
| WTI.C | 79.152 | CLUSD 21:44 close 79.02 | **+0.10 (~13bp)**, inside E8's own 0.120 spread | **MATCH** |
| BRENT.C | 85.8205 | BZUSD 21:43 close 84.72 | **+1.10 (~130bp)**, nine spreads | **NOT the same series** |

Against F4/F6's +1.61/+1.675 a week earlier, BRENT's gap moved ~0.55 in seven
days with no roll boundary near — a contract-month spread decaying, not a venue
offset. So the antecedent of this amendment's own conditional is established:
**BRENT tracks a different month, goes dormant under this ruling, and amendment
30's BRENT clause is superseded. WTI is a match and stays served.**

The code agrees and has since that day: BRENT is absent from `knownSymbols`
(`supabase/functions/trade-analyzer/symbols.ts`), its row is dormant with
`fmpSymbol: null` (`src/lib/broker/masterList.ts:511-521`), and WTI, BZUSD and
CLUSD all scan. That row's own comment cites **this amendment** as already
decided — "Amendment 32 (2026-08-09, decided on the owner's live frame)" — so
the shipped engine has been operating under the settled reading for three weeks
while the amendment that settles it still read "undecided". The spec was the
stale copy, not the code.

*Corrected rather than deleted, and the paragraph above is left standing, for
the reason `docs/HANDOFF.md:560` gives: the record of a sentence that misled is
worth more than its absence. Flagged for the owner's confirmation on the same
principle — an agent transcribing "the owner decided" from a research file is
one step from an agent-authored amendment, and this note is only as good as F13's
attribution.*

## Amendment 33 — the calibration mandate (owner ruling, 2026-08-07)

**The standard.** Everything between here and the resumption of hedge-mind work
exists to bring the engine to one state: it identifies money-positive setups at a
high rate, can account for how each was derived, and presents figures the operator
can rely on and defend to someone else. Find, justify, defend — three obligations,
and the second is the one most often dropped. A calibration that lifts expectancy
while remaining unable to explain itself fails this as completely as one that lifts
nothing. This is the purpose of the retrofit and of the hedge-mind programme
entire, not a stage inside either, and it should be read as the bar every item
below is measured against.

**Per market, never per class.** Every broadly applied standard tested so far has
been measured wrong somewhere. Indices ran `tp1RiskShare` at 1.2 where every other
class ran 0.4–0.8. Oats starved at its class's six-hour window. Livestock was
unmeasurable until its window tripled. Execution cost was understated by
1.79–2.69× on copper and gas. In each case a class value had been imposed on a
market it did not fit. The next derivation is per market, and a class value
survives only where that market's own data supports it.

**To each market's true data limit, discovered rather than assumed.** History
depth varies by market and by timeframe. A sweep run on an assumed common span
silently truncates the markets that have more and manufactures confidence about
the markets that have less. Spans are measured first — per market, per timeframe —
and recorded before anything consumes them.

**Total scope, the model included.** Stops, TP1 and runner, entries, review
windows and timing thresholds, confidence bands or whatever replaces them, tick
and pip thresholds, starvation accounting, session gating, regime conditioning.
Preceding all of it, an honest assessment of whether the geometry model is the
right shape at all: tuning parameters inside a wrong model is the most expensive
way to learn nothing, and round 28 is the cheap demonstration of that failure.

**Iterate while it yields, then stop and say so.** Rounds continue while they
produce results. When a round returns only nulls and validations, the
diminished-returns point is declared rather than another round manufactured. The
existing stopping rule governs, and this mandate does not license change for its
own sake.

## Amendment 34 — the Guide tells the measured truth (owner ruling, 2026-08-11)

The six copy rulings drafted in `docs/research/guide-copy-review-2026-08-11.md`
are approved as recommended and land as one change set: the §5 score story
drops its unearned separation claim (measured rank correlation ≤ 0.06 in every
class); §2's stop line says what the cap does rather than what the algorithm
intends; §7's replay description matches the venue-fill engine — net of
spread, slippage and commission, not "before costs"; §3 and the canonical
instruction stop promising a free breakeven (the runner risks the round trip;
"the banked half is yours either way" replaces "profit locked either way" in
every pinned surface); §6 names the commission beside the spread; §10's
"Banked half" teaches both of its closing paths.

The general rule under the ruling: reader-facing copy about the engine
carries only claims the current instrument has measured. When the engine
moves, the copy moves in the same change set or the divergence is a defect —
the same law the deck already applies to itself, now explicitly owed to
every reader surface.

One deliberate exception recorded: the Record rows' "before costs" sentence
(`replayReliability.ts`) stays until batch 4, because the stored rows it
renders were measured by the retired cost-free engine — for that data,
before-costs IS the truth, and the rows and sentence are replaced together.

## Amendment 35 — the clean model, and where the docs duty reaches (owner ruling, 2026-08-11)

Executed on the ruling: every user logged out (sessions and refresh tokens
to zero; outstanding JWTs die within their ≤60-minute TTL behind the parked
gate) and all trade history cleared for all users — setups and outcomes to
zero, accounts untouched at thirteen. The engine's first live cohort under
`2026.08.11.engine-v2` therefore accrues from an empty table: a clean model,
with no pre-repair rows to contaminate learning or the record. The parking
page stays up; deploys recreate the E2E infrastructure account's rows by
design and those are disclosed pipeline debris, not history.

The standing duty, stated in full: whenever work shifts the context of any
project doc, user-facing legal, risk or privacy page, the Guide, the Profile
surfaces, any README, or the HANDOFF — the update lands in the same change
set as the shift. This is amendment 17's docs-ride-along law with its reach
now enumerated so no surface class can be argued out of it.

## Amendment 36 — the withdrawal standard (owner ruling, 2026-08-11)

A market may leave the offering only on evidence that is **genuinely
data-derived**, and never on a flawed parameter of our own making. The
distinction is the ruling: if a market measures negative because the
market is negative, withdrawal is defensible under amendment 31's 4d
exit; if it measures negative because of a number WE chose — a window,
a cap, a modeled spread, a sampled cost — then the parameter is the
defect and the market is not.

This is amendment 25's starvation lesson made general. Livestock looked
unmeasurable and was being refused by a six-hour window; twenty-two
markets looked starved and were being cut by a per-class fold calendar.
The pattern repeats often enough that it is now a precondition: before
any withdrawal, the negative must be shown to survive the removal of our
own modelling choices.

**CORRECTION 2026-08-11:** the mechanism this amendment originally named
did not work. `LEVELFLOW_MODELED_COST_SCALE` scaled a quantity the
resolver never reads, so the "published bill only" run removed nothing
from realized R and the test measured nothing. The STANDARD stands
unchanged and is binding; the instrument that was supposed to satisfy it
must be built before any withdrawal claims to meet it (remediation
program Phase 2).

**Withdrawal is never permanent.** A withdrawn market remains a standing
reentry candidate and returns whenever the data supports it. This is the
standard for **any** match between an E8-tradable asset and an
FMP-analyzable data source — the same rule that governs the amendment-32
dormant register, which is re-probed every run.

## Amendment 37 — the ranking is a converge question (owner ruling, 2026-08-11)

Sequence items 5 through 10 are an **explicit part of the next CONVERGE**,
which runs after the current work closes. Their ordering against item 11
(the hedge mind) is re-decided there rather than assumed from the
document's existing numbering. Until that converge runs, no item between
5 and 10 is treated as either a blocker or a skip.

## Amendment 38 — adversarial fan-out is the working method (owner ruling, 2026-08-11)

**"If adversarial fan-out caught errors, that should be how we work
moving forward."** It is now the default, not a technique reserved for
hard problems or for CONVERGE rounds.

The evidence it rests on: on 2026-08-11 every claim that changed a
decision survived only because something independent tried to kill it.
Three defects that had already shipped or were about to — a cost-scale
switch that never reached the resolver, a corpus clock artifact that
manufactured the entire measured edge, and a gate whose improvement
delta was being read as a level — were each caught by refutation, never
by the pass that produced them. Two of the finders' own claims were then
overturned in turn, which is the same principle applied once more.

The method has three parts and all three are required:

1. **Find** — several agents, one lens each, each asked what is WRONG or
   MISSING rather than what to improve. Every finding carries file:line
   or command output, its exact affected population, and the procedural
   mechanism that let it through.
2. **Refute** — an independent pass whose brief is to KILL each finding.
   A finding survives only if the refuter personally verified it.
   Expect roughly a fifth to die, and expect some to return worse than
   filed.
3. **Verify yourself** — the driver re-derives every load-bearing claim
   personally before acting or reporting, especially any claim that
   flatters the work.

Two traps are named because they have already been paid for: **a delta
is not a level** (an improvement over a bad baseline is not a good
result), and **identical numbers from two supposedly different runs are
proof the knob did nothing**, not agreement.

Model consequence, owner-confirmed the same day: **Opus 5 in Ultracode**
over Fable 5 at max effort, because the capability is worth more spent
on many independent checks than on one deeper thread. Recorded in
HANDOFF §6c.

## Amendment 39 — profit is the measure; win rate is a result (owner ruling, 2026-08-27)

Success is **net realized R**, not frequency. A winning trade is a
money-positive one, so a rising win rate is evidence that the engine is
working — never the thing the engine is aimed at. Maximize profit,
minimize give-back, and let the rate follow.

**Nothing may publish, rank, gate, or learn on a frequency where the
underlying money is knowable.** Where realized R exists it governs;
where it does not, the surface refuses rather than substituting a count
(§19e). A rate may be shown BESIDE money, never instead of it, and never
as a superlative.

The ruling exists because the ladder makes the two diverge sharply. A
banked partial is worth about +0.20R and a stop costs −1.00R, so
break-even is not 0.5 but a range set by the outcome mix — measured
0.50 for a cohort that always reaches the runner target, 0.83 for one
that never does, about 0.68 at a partial-heavy mix. A market can win
four setups in five and shrink the account. Two live consequences had
already shipped on that confusion: global learning pushed confidence UP
on losing markets from a pivot of 0.5 (withheld, #447/#448), and the
Best market superlative crowned the most frequent winner over one making
ten times the money (#449).

**Profit potential must exceed loss potential structurally — and may
never be manufactured.** Stops and targets are derived from real market
structure and from what the window can statistically reach; the payoff
floor is a feasibility filter, not a target-stretcher, and a setup that
cannot reach its required distance is refused rather than decorated with
an unreachable target. Widening a target or tightening a stop to improve
a printed ratio is prohibited outright. Where the realized ratio is too
thin, the repair is the ladder's own economics — the partial's size and
the runner's protection — never the geometry's honesty.

Derived at this ruling from shipped calibration: a full win pays 0.95R
(indices) to 1.20R (energies) against a −1.00R loss, and a partial-only
win pays 0.20R to 0.40R by class. **The engine admits setups at a 1.6:1
gate and the ladder converts them to about 1:1 before costs.** Closing
that gap is the standing engineering priority, ahead of any work that
does not move it.

WHERE THE LOSS SITS IS A HYPOTHESIS, NOT A MEASUREMENT, and the first
version of this ruling stated it as fact. The 4b geometry review reports
the TP1 half banking positive R in every class while the runner half and
per-trade cost take back more — but it is computed over
`docs/research/baseline-2026-08-10/*`, which
`remediation-program-2026-08-11.md` lists under "What must not be trusted
until re-measured". Its DIRECTION is the best reading available and the
reason the runner leg is ranked first; its MAGNITUDES are not evidence
and may not be quoted as such until Phase 0 re-measures.

The structural half of this amendment does not depend on that corpus: a
partial banks a fraction of what a stop costs, so break-even is a range
above 0.5, and that follows from the shipped calibration constants
alone. tests/learningNeutralPoint.test.ts derives both ends from them
rather than restating a number here.

**A worked example of what the manufacturing clause catches, added
2026-08-30 because the agent holding the pen walked into it.** Asked how
to make the realized payoff exceed the loss, it proposed raising
`tp1RiskShare` from 0.4 to 0.8 — moving TP1 further out lifts the
blended full-win figure from about 1.05R to about 1.20R — and presented
it as the evidence-led option. It is not. `tp1RiskShare` is a pure risk
multiple, not a structural level and not window feasibility, so moving
it BECAUSE THE BLEND IMPROVES is the prohibited move exactly. The lever
table it built was sorted by which knob made the number largest, which
is the tell.

It is also wrong on the merits, and that is the more useful half. A
large share of fills bank at TP1 and hand the second leg back — a small
win. Put TP1 twice as far away and part of that population never reaches
it at all and takes a full −1.00R instead of about +0.19R. **The lever
converts small wins into whole losses**, and the arithmetic direction is
certain even though the magnitude needs a corpus. A ratio can be
improved by making the good outcomes rarer, and the printed figure will
not say so.

THE AXES THE EVIDENCE ACTUALLY NAMED are the runner leg's
placement/protection and the cost weight per trade (4b, Q1/Q2/Q4).
Neither is a knob on the reported ratio. Cost is additionally the one
input `remediation-program-2026-08-11.md` lists under "What stands" —
the venue bill tables are E8-published facts independent of the invalid
corpus — so it is the highest-confidence lever available and the only
one whose inputs can be trusted today.

If the realized payoff still cannot exceed the loss once those two are
measured, the honest conclusion is that this ladder SHAPE cannot meet
the standard, and the shape is the question rather than any knob on it.

## Amendment 40 — an exchange price grid may ground alignment, never a money number (owner ruling, 2026-09-01)

§6b-1 item E, closed. **An exchange contract's published price grid may
ground ALIGNMENT — the increment a displayed price is rounded to. It may
never ground a money number.** The §19/§20 boundary is unchanged: no
sizing figure enters except by E8's publication, E8's published method
over Levelflow's own data, or the owner's dated observation on E8's live
platform, and "not an exchange specification" still bars the spec sheet
there absolutely.

**The boundary was never breached, because it does not reach here.** Its
own first sentence scopes it — "it governs every number in both
sections" — and both sections are §19 and §20, the sizing governor. An
alignment tick is analyzer geometry: it decides which price is printable,
not how much money is at risk. `futures.ts` had drawn that line correctly
in a comment since 2026-08-09; this ratifies the reading rather than
changing it.

**What decided it was a control, not a doctrine.** The alternative —
re-derive every tick from the banked minute series and drop the exchange
source — was tested against the two markets where E8 publishes the
answer. It failed both:

| market | bank price-delta gcd | E8-published tick |
| --- | --- | --- |
| LEUSX | 0.005 | **0.025** |
| HEUSX | 0.005 | **0.025** |

The bank measures the finest increment the vendor's data happens to
carry, which is not the contract's tick. An instrument that misses both
known answers by a factor of five may not be used to settle the open one.
This is the same discipline amendment 39's sibling ruling applied to the
macro-role table on the same day: an instrument speaks on an open case
only after it reproduces the decided ones.

**The live blast radius is ONE market, not five.** Of the five rows citing
this precedent, ZOUSX (0.25) and ZRUSD (0.005) match their bank gcd
exactly and are therefore already grounded in Levelflow's own data;
ZFUSD and ZTUSD are confirmed by E8's own dossier conversion
(ZFU6 106'070 = 106.21875 = exactly 13,596 quarter-32nds). Only **GFUSX**
rests on the exchange grid alone.

**GFUSX's previously stated corroboration is struck.** It read that the
tick is "consistent with the live watchlist print (GFQ6 348.300) and its
LE/HE siblings' published 0.025". Neither half holds: 348.300 divides
evenly by 0.025 **and** by 0.005, so it discriminates nothing, and
reasoning from siblings is what the third route forbids in terms —
"nothing adjacent to it". The control above replaces both.

**Why the residual risk is bounded, and it is not obvious.** Where a
shipped tick is a MULTIPLE of the finest increment the data carries
(GFUSX 0.025 over 0.005), every aligned price is on-grid under either
reading. The only cost of being wrong in that direction is a wider
minimum stop — never an unfillable price. Had the relationship been the
other way, this ruling would not be safe, and a future row in that
position is a new question rather than a case of this one.

## Amendment 41 — the three coverage rulings of 2026-08-07, moved into law (owner rulings, 2026-08-07; recorded 2026-09-01)

These were given on 2026-08-07 and lived, all three, in the header comment of
`tests/e8RosterConformance.test.ts` and nowhere else. A test comment is not
where law is kept: it is invisible to anyone reading the specs, it cannot be
cited, and — as below — it drifted against itself inside the same file.
Recorded here verbatim in substance, with the drift resolved.

**Ruling 1 — coverage is nonnegotiable.** Every E8 tradable market with an FMP
data match must be visible and usable on Levelflow, because the user is working
within that account structure. The ONLY ground for withholding is the absence of
a verifiable data source. Caution is not a ground; a calibration verdict is a
different mechanism and is not this.

**Ruling 2 — an unidentifiable instrument is dormant, not forgotten.** If no
source is identified for an E8 offering, there is no FMP match and it goes to
the excluded dormant list. It is re-admitted the moment a source is confirmed.
Exclusion here is a statement about identification, never about merit.

**Ruling 3 — softs and stocks are out of scope.** "We will not trade softs and
stocks." The two watchlist tabs that were never captured are therefore outside
the offering, and **their absence is not a coverage gap**.

**The drift ruling 3 resolves.** `tests/e8RosterConformance.test.ts` stated
ruling 3 at the top of its own header — "out of scope, so their absence is no
longer a gap" — and then, twelve lines below, described the same two tabs as
"complete for eight tabs and silent about two. That silence is itself a coverage
gap and is recorded as one." Both sentences were live in one file. The ruling
governs: not a gap. Corrected in the same change set that records this.

**What this does not do.** It does not shrink §6b-1 item F to nothing. MC, BIT
and SIC remain unidentified and unmatchable, which is ruling 2's dormant list
rather than a softs-and-stocks question, and identification of them stays an
owner-only route through the platform.
