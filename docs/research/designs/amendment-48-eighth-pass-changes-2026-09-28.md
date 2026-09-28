> **The pass as first written.** This log records the edit before refute round 3. The closed pass is
> [the draft](/docs/research/designs/amendment-48-draft-2026-09-28.md); where the two differ, the draft governs.

# Amendment 48, eighth pass: change log (2026-09-28)

**Subject.** The seventh pass, `docs/research/designs/amendment-48-draft-2026-09-24.md` at `main`
c00ebcb (last changed in 988ed53, #708): 526 lines, sha256
`476cbcb009890ed6576fd0027a3f859e8036c4d09c74d24e1f381da6572062b7`.
**Output.** `amendment-48-eighth-pass.md` beside this file: 671 lines, sha256 `7df6c2e6…` at the time of
writing.

**Inputs applied.** The owner's rulings of 2026-09-28 as the workflow brief relays them, "by
delegation": Q1 to Q7, OQ-1 to OQ-3 and the execution rule. Carried items: (a) #702's depth advisory,
(b) the converge's feed-check finding, (c) Q7 × Q2. Nothing else was changed on purpose; every edit
below names the ruling or item that reaches it.

**Verified for this pass, at c00ebcb.** `--days max` → `MAX_DEPTH_DAYS` 7,000
(`replay-sweep.ts`, `intradayChunks.ts`); `days` inside `conditionsOf` (`grid-totalr.ts`) and the
manifest's hashed payload; store keys `<symbol>-5min-<days>` and `feed-character.ts` reading
`-7000`; `feedCharacter` recorded per symbol with month grain and a 15-day naming floor, refused on by
nothing (`replay-sweep.ts`, `feedCharacter.ts`); the resolver's `entryLatencyBars` (FR-6) set by no
caller, and the 5-minute resolution slice starting at the decision bar's close (`sweep.ts`,
`replay.ts`); a non-finite take-profit resolving `pending`; the payoff-floor identifiers
(`minRewardRisk`, `minimumTargetRewardRisk`, `window_cannot_carry_payoff`). From the 2026-09-24
corpus manifest (no rows read): 123 flagged market-months from 2025-01 on 35 markets, 50 on bar-range
drift alone; forex 24 by the manifest's `assetType`, 22 of them bar-range drift alone at a median range
ratio ≤ 1.00167, and NZDCHF 2025-05 at 1.04836 and AUDCHF 2025-03 at 1.03247 on range drift; BNBUSD
flagged every month 2025-07 to 2026-08. Of the files the seventh pass's Facts cite, only
`replay-sweep.ts` changed since fea0a1d (usage comment and preflight hunks).

## By section

### Banner and title
- **Changed.** "Seventh pass" → "eighth pass, 2026-09-28". The banner names the rulings and the two
  carried findings, and states that the text as ruled takes one refute round before law.
- **Why.** Q1–Q7 are ruled; the remaining gate is the refute round.
- **Replaced.** "No registration is recorded, and no registry header is hashed, until the owner rules
  on Q1–Q6; the text as ruled then takes one more refute round…"

### Authority
- **Paragraph 1.** "(its grain is Q2's)" → "per market, Q2"; "(its charge point is Q3's)" → "charged
  at the freeze, Q3"; "Under the standing approval this draft settles only…" → "The standing approval
  settles only… (Q1)". Why: Q1, Q2, Q3.
- **Departures.** "Five rules… All take effect together, on the owner's ruling" and "Whether the
  standing approval may make any of them is Q1" → six rules; the owner's ruling (by delegation) is the
  explicit ruling on the five, and the sixth is Q7's. Why: Q1 and Q7.
- **Departure 2.** "Conditioning filters register (Q4)…" → "Filters, programs and removals register
  (Q4)"; none takes 46's family terms. Why: Q4.
- **Departure 5.** "…which reaches calibration programs and amendment-36 removals that Q4 leaves open"
  → "…registered or not". Why: Q4 closed the open half.
- **Departure 6 (new).** Pooled confirm, departing from 46's "a screened family takes its verdict at
  the per-market grain". States that 45's per-market verdict for a calibration change stands, since a
  program names one market. Why: Q7.
- **New closing line.** The execution rule and OQ-1 to OQ-3 reach the payoff floors and the Guide's
  order types, not 46.

### Terms
- **History start H_s.** Adds that `--days max` is recorded as `days` 7,000 (`MAX_DEPTH_DAYS`), that
  rule 2 refuses any other depth, and that the freeze line carries `days`. Why: item (a). The anchor
  wording ("the freeze's anchor", which #702's round 4 called backwards but harmless) is unchanged:
  no ruling or carried item reaches it.
- **Label.** Adds a program (its candidate cell's side) and a removal (the removed cell's side). Why:
  Q4, a program kind needs a label for its B.
- **Cluster.** Adds: a program's or removal's B is computed at the freeze, since it takes no screen;
  at confirm a registration's cluster sums R across its markets at the longest recorded B. Why: Q4's
  screen exemption; Q7.
- **Execution (new).** Native orders only; an instructed action after an event or at a time graded one
  5-minute bar late (entry after its decision, timed close, review-end close on every arm; the stop
  moved after TP1 on the arming-bound arm); a marketable limit prints with full spread and slippage.
  Why: execution ruling, OQ-2, OQ-3.
- **Arms.** Adds: arming-bound is every registration's arm of record; a family whose money needs an
  automatic lock cannot register on the net arm; every verdict holds on both, so net money alone opens,
  confirms or ships nothing. Why: execution ruling; item (c)'s arms rule.

### Rule 1 (Folds)
- "Confirm is [C_s, C_s + L_m) for each named market m" → "[C_s, C_s + L), one window for every named
  market". Why: Q7, a pooled test needs one window (item c).

### Rule 2 (The read, its freeze, and L)
- **Pre-frontier sweep.** Adds full depth and two refusals: the sweep refuses any depth but
  `--days max`, and a freeze refuses a pre-frontier manifest whose `days` is not 7,000. Why: item (a).
- **Timed registration.** Adds "(for a program or removal, whose registration) landed", "(a removal
  always has one)" and "whose L at their own C_s fits their maximum confirm length". Why: Q4 (no
  screen); Q7 (a pooled L that passes the maximum would name no market and hold the pool until the
  lapse; the same latent case existed per market in the seventh pass when every L_m passed).
- **Naming.** "has a candidate" → "opens (rule 5)"; adds that a family spanning classes is read once
  per class, each read its own test and draw. Why: Q7 with rule 2's one-class read.
- **L.** Per-market L_m → one pooled L from the timed registration's pooled traded clusters per weekday,
  at its B. "A market… whose L_m would pass the maximum, leaves the read" dropped (now the timed
  registration's condition). Why: item (c).
- **Freeze line.** "per market F_s, H_s, S_m, density, floor and L_m" → per market F_s, H_s, S_m, c_m;
  the declared C_s and L; per opened registration its markets, frozen members, fit and select point
  estimates, B, pooled density, readiness floor and draw; adds the pre-frontier `days`. "each opened
  candidate's frozen member" and "c_m and each draw" folded into those. Why: items (a) and (c); Q7.
- **Confirm sweep.** Anchor "C_s + L_m + 4 days" → "C_s + L + 4 days"; the digest also holds the daily
  bars the feed check reads; `conditionsOf` equality noted to carry `days`. Why: items (b) and (c).

### Rule 3 (Registration)
- **Kind and roster.** Kinds named (family, filter, program, removal); a filter, program or removal
  names one market; one registration per program per market. Why: Q4 (its recommendation, adopted).
- **Engine and cost closure.** "for a family" → "for a family, program or removal". Why: Q4, a program
  is graded by the engine and needs the same pin.
- **Month map.** "for both kinds" → "for every kind". Why: Q4.
- **Exit geometry.** Adds OQ-1's own geometry outside the payoff floors (timed exit, catastrophe stop,
  no target), OQ-2's marketable limit, the effect's own horizon as a source of levels, amendment 39's
  ban restated, and actions graded under the execution rule. Replaced: "(order type, entry, stop rule,
  TP1, runner protection and window exit, each set from market structure and window feasibility under
  amendment 39)".
- **Program and removal (new item).** A program hashes the cell it would replace and the parameters it
  changes (amendments 33 and 39); a removal hashes the cell it removes (amendment 36). Why: Q4's
  "program kind in rule 3".
- **Grid and freeze rule.** "for both" → "for every kind but a removal"; adds: a freeze rule that
  chooses on R chooses on the arming-bound arm or on both, never on net alone. Why: execution ruling
  ("cannot register on the net arm").
- **Screen fold.** "for both" → "for a family or filter". Why: Q4's screen exemption.
- **Readiness floor.** "a readiness floor per market, the fewest confirm clusters…; a maximum confirm
  length per market" → one floor in pooled confirm clusters and one maximum per registration. Why:
  item (c).
- **Disclosure.** "every fit-fold result" → adds "(for a filter, program or removal, every pre-frontier
  result)". Why: Q4, those designers read select rows too.
- **Embargo refusal.** "the window exit + 24 h" → "the window exit as executed (one 5-minute bar late…)
  + 24 h". Why: OQ-3 and the execution rule.
- **Last sentence.** "A filter may read its parent's pre-frontier rows" → "A filter, program or removal
  may read its cell's". Why: Q4.

### Rule 4 (Screen)
- New lead sentence: a program or removal takes no screen, for the reason the seventh pass's Q4 gave.
  Why: Q4. The family and filter screens are unchanged.

### Rule 5 (Opening)
- Adds: no screen for a program or removal; a removal's candidate is the removal; **Q7's point floor
  on fit and select, both arms, at the freeze**; (a) readable on m unless a removal; the registration
  opens on all qualifying markets together, only if the declared span meets its pooled readiness floor
  within its maximum, on the cells' side where it filters, replaces or removes. Replaced: "the declared
  confirm span meets its readiness floor on m within its maximum confirm length, and on the shipped
  cell's side…"; "A candidate whose read falls short… takes NO VERDICT" → "on every market it opened".
- Why: Q4; Q7; item (c). The point floor at the freeze and the (a)-readable condition are this pass's
  readings (below).

### Rule 6 (Draws)
- "(a per-market reading, Q2)" → "(per market, Q2)". c_m counts registrations. **One draw per opened
  registration, the least over its markets of 0.8 × (0.05 − S_m) / c_m, charged in full to every one
  of them.** Replaced: "each draws 0.8 × (0.05 − S_m) / c_m", one draw per candidate per market. Adds
  that a burned read keeps its draw spent on every market it named.
- Why: item (c), Q7 × Q2. Charging the full draw to each market keeps every market's bound at 0.05:
  on m, the draws of one freeze sum to at most c_m × 0.8(0.05 − S_m)/c_m. Summing per-market shares
  into one larger test would let any named market ship at a size above its own cap.

### Rule 7 (Confirm)
- **Lead.** Per candidate per market → one money test per opened registration, R summed per cluster
  across its markets, at the longest B; a filter, program or removal tests its one market. Why: Q7.
- **(a), (b).** Restated pooled; (b) sums d over the markets that filter, replace or remove; markets
  where a family adds trades enter (a) only. Replaced: "A family that adds trades on m is tested on (a)
  alone there."
- **Readiness.** Pooled traded clusters; for a removal, the cell's side. Why: item (c); Q4.
- **Multiplier.** Names the registration's one draw. Why: item (c).
- **Confirm condition (new bullet).** (a) and, where any market enters (b), (b); (b) alone never
  confirms, except a removal, which confirms on (b) alone with gross. Why: Q4 registers removals and
  gives them no confirm rule; this is this pass's reading (Open 8).
- **Ship (new).** A market ships only on positive money on each of fit, select and confirm, both arms.
  Why: Q7.
- **The window's feed (new).** Before grading, the read takes the confirm manifest's `feedCharacter`
  (5-minute tier) for every month the window touches, plus a span grain over the window; escaping
  months (or the whole window) are a rule-10 exclusion: legs and point estimates hold on both
  populations, each meeting the floor; a market with no contained traded cluster cannot ship; its span,
  draw and frontier stand. Why: item (b). The span grain exists because a window's last month is
  usually cut by the anchor and the witness names a month only at 15 judged days.
- **(a) readable.** "Where neither holds, the candidate cannot confirm on m, and (b) alone never
  confirms" → "Where it is not, only a removal opens on m (rule 5)". Why: in a pooled sum a market
  that cannot confirm would still move the verdict.
- **Two confirmed on one cell.** Adds removals; "otherwise it waits on Q4" → "otherwise as a program".
  Why: Q4.

### Rule 8 (Claims, reads, burns and frontiers)
- Claims [C_s, C_s + L); lapse eligibility for a program or removal runs from its landing (no screen);
  the burn is "on every market it names", draws spent "on every market they were charged to", and a
  burned registration never freezes "on those markets" again. Replaced the per-market L_m burn. Why:
  item (c); Q4.

### Rule 9 (Folded sweeps and the door)
- Last bullet: "…until Q4 decides how such work registers" → an unregistered ledgered read ships
  nothing, since every change that could ship registers. Why: Q4.

### Rule 10 (Population)
- Adds that a confirm read's own feed check is an exclusion in force (item b); a refused filter's
  market goes to the removal test, "which registers as a removal" (Q4); "`maxCostShare` 0.15 stays;
  changing it waits on Q4" → "changing it is a program" (Q4).

### Rule 11 (Printing)
- Adds the draw as the registration's one draw; confirm R printed pooled and per shipped market;
  arming-bound named as the arm of record; a named market that did not ship prints with its reason.
  Why: Q7, execution ruling. Replaced: "the confirmed candidates' summed confirm R".

### Rule 12 (Pre-law registration)
- "(pending Q6)" → "(Q6, ruled yes on these conditions)". "For one that landed before the owner's
  ruling" → "For one" (every pre-registry spec). "Until the owner has ruled Q1–Q6" → "Until this text is
  law". Why: Q6; the ruling date has passed, so the qualifier would leave specs landing between the
  ruling and the registry ungoverned.

### Facts
- Anchor "code at `main` fea0a1d" → c00ebcb, with a line stating only `replay-sweep.ts` changed among
  the cited files. Three bullets added: the depth pin (item a), `feedCharacter` and the 2025–26 counts
  (item b), and the resolver's zero entry latency and review-end close (execution ruling).

### Registry, lines and tests
- **Header.** "with Q1–Q6 all marked pending" → "recording the rulings of 2026-09-28"; adds the
  per-market grain, the one-draw charge, the pre-frontier depth, the execution rule, and the confirm
  text's pooled ship rule and feed check.
- **Lines.** Registration line gains `kind`; the confirm line is per registration and arm (pooled), with
  per-market feed check, point estimates and ship.
- **Test (a).** Rewritten for the least-share draw charged to every named market.
- **Test (b).** "opens its candidate there" → "opens it there".
- **Test (c).** A program's or removal's B at its freeze; the window exit "as executed".
- **Test (d).** Adds the pre-frontier `days` = 7,000 (item a), point estimates, per-registration B,
  pooled density and draw, pooled cluster series, gross for every removal, the feed check recomputed
  from the digest and equal to the manifest, and the ship rule. Replaced "density and L_m".
- **Test (g).** The no-screen exception for programs and removals; execution fixtures; pooled and feed
  fixtures.
- **Mutations.** Added: a timed registration whose L passes its maximum; a pooled draw charged to fewer
  than every market or above the least share; one L per market; pooled clusters at a shorter B; a market
  named on a non-positive fit or select estimate or shipped on a non-positive confirm one; a program or
  removal sent to the screen; a program confirmed on (a) alone; a removal confirmed without gross; a
  pre-frontier sweep below full depth (item a); an instructed entry filling in the decision's first
  5-minute bar; a timed close graded at its stated time; a marketable limit without full costs; a
  freeze rule choosing on net alone; a feed check after a confirm row exists; an escaping month graded
  as contained; a short last month left unjudged. Changed: "a window exit above 96 h" → "a window exit
  that passes 96 h as executed".

### Build
- Adds the pooled read, the point estimates at freeze and ship, the pre-frontier depth refusal, the feed
  check with a span grain for `dailyContainment`, the program and removal kinds, and the execution rule
  in the engine under a new `ANALYZER_VERSION` (`entryLatencyBars` 1, instructed closes one bar late, a
  no-target plan, an absolute timed exit, a marketable limit's print) for every plan the confirm sweep
  grades.

### Why
- **Both arms.** Retitled "under native execution"; states why arming-bound is the arm of record, why
  net stays required (no verdict rests on the one-bar convention), and the 16–21 UTC window's 1.3 years
  on net against about 19 on the arm of record (converge §7, corrected figures).
- **One cluster rule.** Adds that a pooled cluster counts co-moving markets once, at the longest B.
- **The per-market reading, priced** → **The per-market cap, under a pooled test.** The 0.02-per-market
  and 1.8-across-91 bound restated as a bound on false ships of a family null on every named market;
  Q7's price stated for a family real on some markets; the least-share draw's throttle named.
- **The feed is checked where it is read (new).** Item (b).
- **Table intro.** Marks the columns and rows the rulings took and declined, and adds the pooled
  requirement (0.06–0.08 against 0.20 mean ÷ SD per market-day; converge). The table is unchanged.

### Open
- 1 unchanged. 2 (46's premise), 3 (programs and removals) and 4 (authority) closed in place, one line
  each, so the numbering cited elsewhere (Open 1, Open 6) holds. 5–7 unchanged.
- New: 8 (how a removal confirms), 9 (the execution rule reaches the shipped engine), 10 (the feed
  check's strictness), 11 (the screen stays per market while confirm pools), 12 (Q7's point floor as
  read here).

### For the owner
- The seven questions and their prices removed. Each ruling recorded in one line where it was asked,
  plus OQ-1 to OQ-3 and the execution rule, which were asked in the design-round record.

## Readings this pass made, for the refute round

1. **The pooled draw** is the least over the named markets of 0.8(0.05 − S_m)/c_m, charged in full to
   every one (item c). A market with little cap left throttles every registration naming it.
2. **One window, one L, one readiness floor and one maximum per registration**; the pooled cluster takes
   the longest recorded B among the named markets.
3. **Q7's "positive point estimate across fit, select and confirm"** is read as positive on each fold
   separately, on both arms and both populations, with fit and select applied at the freeze, so a
   market that cannot ship never enters the pooled sum.
4. **Q7's "summed net R"** is read as R net of cost on both arms, not the net arm alone, since the arms
   rule requires both.
5. **A market on which (a) is unreadable is not named** (the seventh pass let it open, draw and never
   confirm).
6. **A family spanning classes** is read once per class, each read its own pooled test and draw.
7. **A removal confirms on (b) alone, gross included** (Open 8).
8. **A program's or removal's B** is computed at the freeze from its label over the pre-frontier folds.
9. **The execution rule reaches the entry and the review-end close**, not only the stop move and a
   timed close ("any instructed action"), which reaches the shipped engine (Open 9).
10. **The feed check** excludes on any of the witness's three clauses, at month grain plus a span grain,
    as a rule-10 exclusion on both populations (Open 10).
11. **The timed registration must have an L within its maximum**, closing a pool hold that the pooled L
    makes likelier.
12. **A freeze rule that chooses on R chooses on arming-bound or both**, the operative form of "cannot
    register on the net arm".
13. **Rule 12's "before the owner's ruling"** is dropped; the screen condition binds every pre-registry
    spec.

## Not resolved here

- **The execution rule and the shipped engine.** The resolver lets an entry fill in the first 5-minute
  bar after its decision and prints the review-end close at the review end, sweep and live alike. The
  rule reaches both. Applying it moves every shipped cell and leg (b)'s cell side; that is a version bump
  with its own record, outside this amendment, and its size is unmeasured.
- **Bar-range drift alone.** 50 of 123 flagged months since 2025-01 (22 forex, all of BNBUSD's since
  2025-07) escape on it at a contained range ratio. The check excludes them, as the contained-year record
  does; whether that is a feed defect or market character is unmeasured.
- **The screen stays per market.** Q7 reached confirm and ship only. A family too small per market for
  its fit-fold screen opens nothing there, pooled or not.
- **Q7's price per market.** A member with no edge ships whenever its family's pooled test passes and
  its own point estimates are positive. The floor limits this and does not bound it by the draw.
- **Records outside this file.** The converge prints AUDCHF 2025-03 at 1.033; the manifest holds
  1.03247, which is 1.032 at three decimals, and this pass uses 1.032. The design-round record still
  carries OQ-1 to OQ-3 as open questions and its superseded screen line. Neither file is in this pass's
  write scope.
- **Provenance of the rulings.** They reach this pass through the workflow brief, recorded "by
  delegation". The draft records them that way; the owner should confirm the delegation before the text
  is recorded as law.
- **The lock family.** Under native-only execution the 16–21 UTC lock window reads on the arm of record
  at about 19 years pooled. HANDOFF's sequence item 2 was conditional on the lock being available, and
  it is not.
