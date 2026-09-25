# Amendment 48, reconciled draft: refute round 1 (2026-09-23)

**Verdict: the draft stays PARKED. Six majors survive their checkers, and a seventh, scoped to minor by its checker, is kept among them because it is what parked the last pass; a fifth pass is owed.**

The subject is the "Reconciled draft 2026-09-23" section of
[`amendment-46-parameters-2026-09-21.md`](/docs/research/designs/amendment-46-parameters-2026-09-21.md)
as it stood before this round: 393 lines from its heading to the end of the file, sha256
`ba74bcc45e2e3a50c144dbdf1fe3136eccb7860b1e4e8890daaa037e958ea17f`. (The drafting branch did not merge, so no commit on main holds that text; the hash
is the anchor.) The section on main differs in one place: its header now names this round
and adds Q5 to the gate, which is half of major 3's fix. As corrected on main on
2026-09-23 (this round's verdict carried into its header), the section runs 398 lines from
its heading to the end of the file, sha256 `3563f37cb9b02813068b5f01c069ec49c88038ec5cb0239e55f86108c1265ac2`; a later edit to
it changes that hash. Four refuters attacked it through one lens each (internal consistency,
arithmetic and code, authority against amendment 46, sealing of the span-start rule), and an
independent checker per refuter tried to overturn every finding by re-reading the cited lines
and re-running the computations. 49 findings; 4 overturned; the rest hold or partly hold.
Findings are distilled here, with the checker's corrected fix where the checker changed it.
The round's journal, outside the repository:
`~/.claude/projects/-Users-peacock-Projects-levelflow-cloud/899fcfeb-a1c1-46da-9a31-765c580eb0f8/subagents/workflows/wf_07bdb5a6-119/journal.jsonl`.
*(Deleted with its session on 2026-09-24; this distillation is now the round's only record.)*
Both layouts under that session are real: `workflows/<id>.json` holds a run's record (the
check round cites those) and `subagents/workflows/<id>/` holds its agents and journal.

## Majors that survive

1. **L is a free parameter the seal cannot see** (consistency M1; sealing SS-1). Rule 1 says L
   is "not chosen", but the draft never says whose density projects it, which registration a
   freeze is timed for, or which markets the group names, and nothing records or recomputes L
   before the sweep. Test (d) holds for every L: `calendarFolds` gives select end = confirm
   start = F for every whole-day L from 6 to 4000 (3,995 values) on each of the two recorded
   frontiers, 7,990 cases. At a 30-cluster floor the shortest L is
   34 days for a seven-day market (confirm ends 2026-09-29, 81% elapsed on 09-23) and 46 days
   for a weekday market (ends 2026-10-11). A designer who has watched `[F, now)` in the cache
   or the minute bank can register after F + L and pick a confirm window already seen.
   *Fix:* a registered read's confirm dates start at max(F_s, the registration's merge time),
   rounded up to a whole UTC day; fit and select still end at F_s, and the gap belongs to no
   fold of that read. Choose the timed registration mechanically, hash the group, record L and
   its inputs before the sweep, and test that L recomputes.
2. **A family registration hashes no trade** (M2). The spec carries side rule, clock, W,
   reference price, ATR and analyzerVersion, but no stop, TP1, runner protection, order type
   or grid, while rule 6 confirms on realized R. The trade that ships is chosen after the
   screen. *Fix:* hash the exit geometry (or name, per market, the shipped cell whose geometry
   it trades), the finite grid its freeze rule chooses from, and whether it adds to or replaces
   the shipped cell.
3. **The span rule changes 46's premise without the owner** (authority AUTH-1; m7, m8). 46
   calls the quarter rate its most consequential number and told the owner confirmation was
   years away. The frontier-anchored span buys confirm fold at the full rate, 46 days after
   the frontier for a weekday market at the floor, yet the header pins "the span rule" with no
   pending mark and only Q2 and Q3 gate registration. *Fix:* take span start out of the
   Authority list, mark the span rule pending Q5, and add Q5 to the gate. Q5 should state the
   minimum-floor case (46 days, 0.04 of the market's 0.05 at c = 1) beside Open 1's note that
   0.8 was judged on burns 9.42 years apart. *(Half taken since the round: the header now adds
   Q5 to the gate. Span start is still in the Authority list.)*
4. **The frontier is per symbol, but the price path is not** (SS-2). Four correlation groups
   cross classes (crude, gold, silver, US equity indices: 14 of 97 markets), and the overlap
   refusal is keyed by symbol. After a read that names GCUSD, its post-frontier rows are
   sanctioned design data, and a family built on them can confirm on XAUUSD over the same
   dates. *Fix:* a recorded read moves F for every member of each substitute underlying it
   names, or a registered read names every member or refuses; derive membership from
   `correlationGroups` and pin it. Forex crosses against the majors stay an open JUDGED
   question.
5. **Two routes open a confirm fold with no record** (SS-3). `grid-totalr --confirm-log-dir`
   files a confirm read outside the repository, where the next default read's prior-read scan
   never looks, and `replay-sweep --print-confirm-table` prints confirm outcomes on stdout.
   Both are deliberate and documented (the tests' seam; the r4 act-1 seal readers), and today's
   history-start spans keep them latent until 2027. Frontier-anchored spans make them usable
   within weeks, and a sweep run and abandoned before its freeze is charged nothing.
   *Fix, on the build list:* append every post-frontier sweep's manifest hash to the registry
   before it runs, treat an abandoned one as having burned its confirm span, and refuse both
   flags for any corpus whose confirm span lies past a recorded frontier.
6. **The interim ban on post-frontier fit and select dates has no mechanism** (SS-4). The
   draft forbids any sweep from placing a fit or select date after F_s, but `replay-sweep`'s
   default (60 days, anchored today) puts 7.55 decision days after F into select on 2026-09-23,
   and its stdout table seals only confirm. *Fix:* the driver refuses a folded run (not
   `--warm-only` or `--discover`) whose fit or select decisions fall after the earliest
   recorded F_s of its symbols, and seals those cells in its table; keep rule 2 item 2(b) for
   ledgered reads that are not registered until Q4 is ruled.
7. **The law's extent is undefined** (M3, partly: minor as scoped by the checker, kept here
   because it is what parked the last pass). Operative rules still live in the text the draft
   calls history ("as rule 1 item 3", "rule 2's checks stand where this section does not
   replace them"), and rule 7 cannot say which symbols a registered read records.
   *Fix:* make the section self-contained, and state whether a read records only markets with
   a candidate (which needs per-market shards) or every market the sweep requested.

## Minors that survive

- Ties within one freeze break by registry ordinal; restore "their combination is a new
  registration" (m1).
- Pin the cost model's source (a hash of `executionQuality.ts`, `venueCosts.ts` and the
  execution profiles), since #408 changed `estimatedRoundTripCost` without a version bump
  (m2); pin `modeledCostScale = 1` for a family's screen (AC6).
- A filter on an unshipped family is barred, or its timing excludes every fold the parent's
  decisions were computed on (m4).
- State whether rule 8 binds screens (m5); define F_s for a never-read symbol (m6).
- The readiness floor is the projected minimum opening requires, or NO VERDICT below it (m9);
  every freeze rule is defined when the fit fold is empty, or L may not reach the class's
  pre-frontier history (m10; AC2 restates the clipped folds exactly).
- Define a family's share for B (m11); W + 24 h within the embargo (m12).
- A refused or abandoned freeze keeps its draws, and whether its candidates may freeze again
  is stated (m13).
- Rule 9 prints confirmed candidates' summed confirm R beside the count (m15).
- "No registration is recorded, and no header is hashed" until the ruling (m17); "at or after
  F_s" throughout (m18, AC3); the 0.8 burn reason is marked open pending Open 1 (m19); the
  header notes l.64 was corrected in place (m20).
- Q2 reads "against 7.55 at c = 1" (AC1); confirm clusters are projected over
  `[F_s, F_s + L − 5 d)` (AC4); an identity-only match against a line with spans is logged and
  proceeds, on the build list (AC5).
- Authority lists the cap's size and draw count as mechanics taken (AUTH-3); Q2 cites 45's
  floor-not-bar clause and prices program-wide under charge at the freeze (AUTH-4, AUTH-9,
  m14); a check that each screen's manifest postdates the registration's merge (AUTH-5);
  "46's rule sentence", not its first (AUTH-6); decision close recommended as the reference
  price (AUTH-8); Q4 names both of a filter's exemptions (AUTH-11, AUTH-12, m3); Q1 asks by
  provenance (AUTH-13); record the choice against 45's usable-time allocation (SS-5).

## Overturned

- m16: analyzerVersion is already recorded per arm in the freeze and in the ledger identity.
- AUTH-7: 46's "until such a calendar exists" is not a sunset; read as one it would have
  lapsed the regime the day it was ruled.
- AUTH-10: "charged at registration, as 46 reads" is a fair gloss of "every family is
  registered, screened, and charged".
- SS-6: feasibility can open the sealed fold for plan fields, but rule 4 builds the freeze
  only from the confirm sweep's fit and select, so it does not reach this draft.

## For the owner, added to Q1–Q5

The fix to major 1 gives up the calendar that accrued before a registration merges; Q5 should
price it. Major 3 moves the span rule under Q5's gate. Nothing else here needs a ruling.
