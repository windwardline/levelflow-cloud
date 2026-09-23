> **Status (recorded 2026-09-22): designed, refuted once, revised, NOT BUILT.** This is
> the revised design for the regrade that
> [`empty-fold-verdicts-2026-09-14.md`](/docs/research/empty-fold-verdicts-2026-09-14.md)
> owes. Its draft went to three refuters (provenance, reproducibility, tests), and an
> independent checker then checked each refuter. All six kept the ruling that the regrade
> is written beside the originals and never over them. Every other change in this
> revision is a checker's correction or a conflict its author settled with a check of
> their own. The revision has not been refuted since.
>
> **Landed on main since, as of 9b8d96f.**
>
> - The pin, in another shape. #657 added `tests/sealedArmsUnchanged.test.ts`, which does
>   the work this design gives `tests/sealedReadInputs.test.ts`: the seven market arms
>   against the freeze, the five class arms and every sealed input's stdout twin against
>   written-down checksums, the freeze and the read by their own bytes, and the ledger
>   line's burn fields. Build on that file rather than adding a second pin.
> - Correction 7 is withdrawn in the empty-fold note (#657), as the provenance decision
>   below requires.
> - #672 took every test write out of `docs/research/confirm-reads/`, so the fixture race
>   behind "read ONLY that file, never a confirm-log-\* glob" is gone. The rule still holds.
>
> **Still owed: the rest.** `scripts/grid-totalr.ts` still types `selectExpectancyDelta`,
> `selectSigma` and `selectTotalDelta` as `number` (:315, :338-339). `freeze-candidates`
> counts graded cells, not judged ones. `derive-4d` has no null-delta refusal.
> `docs/research/r4/regrade-2026-09-16/` does not exist, the three hour-gate reads are not
> regenerated, and `tests/emptyFoldRegrade.test.ts`, the AGENTS.md law line and the dated
> notes are unwritten. Nothing under `docs/research/r4/` has changed since 7c28f32
> (`git diff --stat 7c28f32 9b8d96f -- docs/research/r4/` is empty), so the 30 original
> hashes under Tests still describe the tree; build step 1's re-check stands. If the run
> lands on a day other than 2026-09-16, rename the directory and its constant together
> (the last item under Unestablished).
>
> **Line citations are to 7c28f32.** Main has moved `scripts/grid-totalr.ts` and the test
> files since. The prototype patch still applies to 9b8d96f with offsets
> (`git apply --check`, exit 0, 2026-09-22). That proves it applies, not that it is right.
>
> **Supporting files** are in
> [`regrade-design-revised-2026-09-16/`](regrade-design-revised-2026-09-16/), byte-identical
> to the session artifacts apart from a `.txt` suffix, so no tool runs them:
>
> - `regrade-prototype.patch.txt` is the body's `scratchpad/regrade-prototype.patch`,
>   against 7c28f32. It predates this revision: its freeze keeps the `legacy-graded` basis,
>   and its two new test files are the drafts the Tests section corrects.
> - `invariant.mjs.txt` is the body's `scratchpad/final-synth/invariant.mjs`, the per-cell
>   check behind test B.
> - `mutate.mjs.txt` is the prototype's mutation harness, `scratchpad/mutate.mjs`.
> - `mutations.txt` is its output: 23 mutations, all killed. D5's first attempt was a
>   harness error, and its re-run killed it.
>
> **Converted from JSON.** The session artifact was a JSON object saved as `.md` (44,127
> bytes, sha256 `aa7011b37726643c4ebd2b5d99aa166e071045827354fb923a62d160689d31ce`). Each
> key is a section below, headed by its key. Each string is reproduced whole. Outside code,
> `*`, `<` and `~` are escaped, and the two code spans that nest a template literal take
> double backticks.
>
> **Why this file is in the repository.** It lived only in
> `~/Library/Application Support/WindwardLineToolchain/levelflow/session-artifacts-2026-09-16/`,
> on one disk with no backup. A design that survived a refuter is a record.

# Design: the empty-fold regrade, revised (2026-09-16)

## Design (`design`)

The regrade goes beside the originals. Nothing that the burned act-3 read consumed gets rewritten. The select-delta fix also regenerates the three hour-gate reads in place, because they would otherwise stop reproducing. Enforcement uses literal hashes plus a per-cell invariant derived from the gate's own reason ladder. It does not rebuild the freeze. All six reviewers (the three refuters and the three checkers) kept the provenance ruling. Every other change below is either a checker's correction or a conflict I settled with my own check.

WHAT BINDS THE BURNED READ [verified: jq on identity fields and git log at 7c28f32, this session]: readId 65331372-2b86-4c57-9ef8-fb588846bfac; artifactHash 3a17f23378f60d01e95c5233739069c3f364da0923feae869a7a4fc21be22283; frozen.path docs/research/r4/frozen-candidates.json; frozenHash 6b1e52e0e62be47df9237d8e57ba42797d415630c2907d4212d6b053454a5cf6; ruleHash bc7deeeda482434240f04cc367171a1f9585c1ff6ebdda9ec4a2b34688c945b3. The single ledger line in confirm-log-f3b72ce8261a1d0a469f6f152950a9716703ea36a34612fe0187849459f4b062.jsonl carries the same readId, artifactHash and frozenHash. The freeze, its stdout, the read, the read's stdout and the ledger each have exactly one commit, 7c55cd3 (#573). The freeze's seven arms[].artifactSha256 equal the sha256 of the seven market gradings on disk, and each of those gradings also has one commit, 7c55cd3. The freeze read the five class gradings but recorded no path or hash for them. Those five are also single-commit 7c55cd3 files. per-market-grading-classfolds is single-commit b80ccc6 (#570) and feeds neither the freeze nor the read.

WHY A REBUILD IS NOT THE PIN: Rebuilding the freeze with main's code from the tracked gradings reproduces 6b1e52e0 [verified: executed by the design author and by both provenance and reproducibility refuters; not re-run by me]. The rebuild depends on the live getAssetType table, though. Moving AUDCAD into metals makes it refuse and blame grading W, with no sealed byte touched [verified: provenance refuter and checker, executed]. It catches a class edit that moves a decision (0f02fe9b) but not a wording-only relabel [verified: provenance checker; tests checker mutation X4]. A literal sha256 pin catches both kinds of edit and cannot misfire on a reclassification. So the rebuild, the in-test re-freeze and the legacy-graded basis are all dropped.

POPULATIONS [verified: census]: 15 tracked gradings predate the noVerdict field. They are exactly the 15 files matching docs/research/r4/\*grading\*.json, and all 15 get copies. Three more tracked gradings carry noVerdict: the hour-gate reads. The fix nulls select deltas on 25 cells (50 fields): 16 in admission-derived-grading.json, plus ASX, DAX and NIKKEI inSpan in each hour-gate read [verified: census by four agents; the 16/3/3/3 split re-confirmed this session on the patched outputs]. No tracked cell has an empty baseline select fold [verified: two independent censuses].

A PROXY THAT DOES NOT WORK [verified this session: grid-totalr.ts:192-197; 7 regraded cells]: `select.net` (figureOf) is null at ONE fill as well as at zero, because the 95% interval needs two fills. DOTUSD costShareMax=0.15 has 1 fill, select.net null, and ΔR sel +379.5. So `select.net === null` and `shipped.select.net.n` cannot stand in for emptiness. `selectExpectancy === null` can, because expectancy() is null exactly when filled is 0 (sweepStats.ts:200). The artifact carries no baseline fill count, so the invariant anchors the baseline side only in the direction that stays true: an empty baseline implies shipped.select.net is null at the market grain. The converse is not checked.

MULTIPLICITY: The tracked freeze keeps its 122.85, because its bytes are bound to the read. Future freezes count only the cells the gate judged. Corrected figures go into the note (see recordWhere).

## Provenance decision (`provenanceDecision`)

- Written to by nothing: the 15 original gradings and their 15 stdout records, frozen-candidates.json and its stdout, ledgered-read-act3.json and its stdout, the ledger file, and withdrawal-verdict-2026-09-03.json. No freeze file is written, because no read consumed a new one.
- Regraded copies go to docs/research/r4/regrade-2026-09-16/ under the same basenames, 15 .json plus 15 .stdout.txt. The path is not gitignored [verified: git check-ignore exit 1].
- The three hour-gate reads (JSON and stdout) are regenerated in place from their recorded commands. They bind no read. No script or test reads them, and no note quotes the inflated figures [verified: git grep by two checkers]. #654 set the precedent, and their note claims each command reproduces the file beside it.
- Recorded correction 7 ('re-run freeze-candidates or re-record the seven artifactSha256') is withdrawn. Re-recording a sha makes verifyFrozenCandidates refuse the file. Recomputing frozenHash or re-running the freeze breaks the binding to the read and the ledger.
- tests/sealedReadInputs.test.ts pins the chain with literals taken from the committed record, not by comparing files to each other. That makes a coordinated rewrite of the freeze, read and ledger fail. It also pins the five class inputs by bytes.
- Every regrade runs in a scripts/scratch-clone.sh copy that includes .git, taken at a clean committed checkpoint whose HEAD is recorded from inside the clone. Outputs are copied into the working tree afterwards. The note records the commit and every command.

## Resolved disagreements (`resolvedDisagreements`)

- Rebuild in tests: the provenance checker said drop it; the reproducibility checker said keep it as an extra check. DROPPED. The byte pin covers everything the rebuild catches. The rebuild adds a false red on a legitimate reclassification [verified by two agents]. Its only other unique signal is freeze-code drift, which is not a provenance break.
- Re-freeze hash in emptyFoldRegrade: the tests checker said pin aa1f386a; the provenance and reproducibility checkers said record no hash. NO HASH. aa1f386a is the hash over the prototype's scratch copies. The committed copies are regenerated, so their derivedAt differs. The re-freeze also depends on getAssetType [verified by execution in the checkers' runs]. 78e308d4 is the same construction over the superseded pre-patch copies [verified: tests checker, executed].
- Baseline-side anchor: the tests refuter proposed shipped.select.net.n; the tests checker proposed a new selectEvidenceAbsent artifact flag. NEITHER. select.net is null at 1 fill (verified this session), so the n proxy is wrong in one direction. A flag written from the same variable that nulls the deltas is circular and adds a key to 6,912 cells. The data-anchored converse (deltas null and selectExpectancy non-null ⇒ market grain and shipped.select.net null) holds on all 6,912 cells today [verified this session: invariant.mjs over the refuter's 15 patched copies and the checker's 3 regenerated hour-gate reads, 0 violations].
- Multiplicity label: the three checkers weighted 1,972 and 1,654 differently. PUBLISH BOTH with their bases, as in the table under recordWhere. 318 of the 1,972 are empty-fit 'fails' cells that `fitTotalDelta > 0` could never accept, so at most 1,654 could have been accepted.
- Transition census and class count: the tests refuter proposed literal per-file counts. They are RECORDED as dated measurements, not tested. The derived vocabulary rule plus the byte table kill the same mutants without a literal census. The class count (126) depends on getAssetType.

## Per-file disposition (`perFileDisposition`)

- File: docs/research/r4/{stop-cap,stop-cap-8,review-window,review-window-96,class-default,class-default-gate-off,admission-derived}-grading.json (+ .stdout.txt)
  - Action: leave untouched; regraded copy beside
  - Why: Arms S, S8, W, W96, C1, C2, F. Bytes bound by the freeze's artifactSha256. S, S8, W and W96 are removal arms read by register-verdict. Reason changes: 100/38/53/16/31/31/187 [verified: design and reproducibility refuter by execution].
- File: docs/research/r4/per-market-grading-classfolds.json (+ .stdout.txt)
  - Action: leave untouched; copy beside
  - Why: Cited by act 3's pre-registered money map; nothing binds its hash except the new byte table. 74 reason changes. The copy adds per-variant select and derived, plus top-level emitSha256 and derived.
- File: docs/research/r4/{admission-derived,stop-cap,stop-cap-8,review-window,review-window-96}-grading-class.json (+ .stdout.txt)
  - Action: leave untouched; copies beside
  - Why: Class inputs the freeze read, with no path or hash recorded; now pinned by literal sha256 in sealedReadInputs. Distinct class verdicts that change reason: 9/4/2/1/0.
- File: docs/research/r4/{class-default,class-default-gate-off}-grading-class.json (+ .stdout.txt)
  - Action: leave untouched; copies beside
  - Why: Pre-disposition class gradings, not freeze inputs. 2 and 0 distinct reason changes. Copied so the population rule needs no exemption.
- File: docs/research/r4/regrade-2026-09-16/ (15 .json + 15 .stdout.txt, nothing else)
  - Action: create
  - Why: Records reproducible under the patched gate. stderr goes to scratch, never into docs/.
- File: docs/research/r4/hour-gate-market-{2026-09-12,bound-2026-09-14,net-2026-09-14}.json (+ .stdout.txt)
  - Action: regenerate in place from the recorded commands under the patched gate
  - Why: 3 cells each publish select deltas over 0 variant fills: ASX/DAX/NIKKEI inSpan ΔR sel +56.16/+6.21/+17.96 (09-12 and net), +56.33/+9.27/+18.36 (bound) [verified: census by four agents]. Expected diff per JSON: derivedAt plus 6 fields. Expected diff per stdout: 3 table rows [verified: reproducibility checker by execution]. Pre-regen sha256 at 7c28f32: e3249846…/fe1882db… (09-12), 802f76f8…/a5284feb… (bound), 3f88e35e…/4962d068… (net).
- File: docs/research/r4/frozen-candidates.json, frozen-candidates.stdout.txt
  - Action: leave untouched
  - Why: frozenHash is bound by the read and the ledger. 122.85 is corrected in the notes, not in the file.
- File: docs/research/confirm-reads/ledgered-read-act3.json, ledgered-read-act3.stdout.txt, confirm-log-f3b72ce8….jsonl
  - Action: leave untouched
  - Why: Burned once. These carry the anchors the pin reads.
- File: docs/research/r4/withdrawal-verdict-2026-09-03.json
  - Action: leave untouched
  - Why: Re-derives identically, on all 16 top-level keys, from both the originals and the regraded removal arms [verified: design, executed].
- File: docs/research/baseline-2026-08-10/4d-{candidates,totality-candidates,holdout-candidates}.json
  - Action: leave untouched
  - Why: INVALID banner (clock defect) and no corpus on disk; a regrade is impossible. The recorded note stands.
- File: scripts/grid-totalr.ts
  - Action: modify
  - Why: Null select deltas and selectSigma over an empty select fold; printer dash; near() takes null; raw permutation statistic.
- File: scripts/freeze-candidates.ts
  - Action: modify
  - Why: Counts only judged cells, with refusals; no legacy basis; the summary names judged cells and graded cells.
- File: scripts/derive-4d.ts
  - Action: modify
  - Why: Type narrowing: refuse an accepted row whose delta is null.
- File: tests/acceptanceGate.test.ts, tests/freezeCandidates.test.ts, tests/absoluteExpectancyGate.test.ts, tests/gateDispositionIntegrity.test.ts
  - Action: modify
  - Why: Null-safe call sites, new unit fixtures, removal of the legacy-basis test.
- File: tests/sealedReadInputs.test.ts
  - Action: create
  - Why: Literal pin of the burned read's chain, including the class inputs.
- File: tests/emptyFoldRegrade.test.ts
  - Action: create
  - Why: Byte table, per-cell shape and vocabulary invariant, leaf comparison, classfolds anchors, register invariance, judged count.
- File: docs/research/empty-fold-verdicts-2026-09-14.md
  - Action: modify: dated section plus dated notes
  - Why: See recordWhere.
- File: docs/HANDOFF.md
  - Action: modify: replace the owed paragraphs
  - Why: Its premise that the regrade rewrites the freeze was wrong.
- File: docs/research/r4-act3-supplementary-arms-2026-09-03.md
  - Action: modify: dated pointer at §6c (line 377-378) and at line 401
  - Why: States 2,457 / 122.85 and 8 of 136.
- File: docs/research/confirm-reads/README.md
  - Action: modify: one clause at line 159
  - Why: 'binds every arm's tuning-fold grading by its bytes' is true only of the seven market gradings.
- File: AGENTS.md
  - Action: add one law line
  - Why: Correction 7 itself proposed the violation. The standard names the test that enforces it.

## Code changes (`codeChanges`)

- Reference prototype: scratchpad/regrade-prototype.patch (against 7c28f32). Apply it with the deltas below.
- scripts/grid-totalr.ts, type VariantVerdict: `selectExpectancyDelta: number | null`, `selectSigma: number | null`, `selectTotalDelta: number | null`. The doc comment states the confirmTotalDelta rule: null when either side's select fold has zero FILLS.
- scripts/grid-totalr.ts, groupVerdicts: `const selectEvidenceAbsent = aggregate.variant.select.filled === 0 || aggregate.base.select.filled === 0; const selectTotalDelta = selectEvidenceAbsent ? null : totalOf(aggregate.variant.select) - totalOf(aggregate.base.select);` `const selectSigma = selectTotalDelta === null ? null : sigma > 0 ? selectTotalDelta / sigma : 0;` `const baseExpectancy = expectancy(aggregate.base.select); const variantExpectancy = expectancy(aggregate.variant.select); const selectExpectancyDelta = baseExpectancy === null || variantExpectancy === null ? null : variantExpectancy - baseExpectancy;`
- scripts/grid-totalr.ts, groupVerdicts: pass `totalOf(aggregate.variant.select) - totalOf(aggregate.base.select)` to permutationPValue, so the shared RNG stream and every published field stay byte-identical. permutationP is written to no artifact.
- scripts/grid-totalr.ts, beatsBaseline: `selectTotalDelta !== null && selectTotalDelta > 0` and `selectExpectancyDelta !== null && selectExpectancyDelta >= 0`. These are type narrowings, equivalent in behaviour (see mutation C2), so ACCEPT_RULE's text stays unchanged.
- scripts/grid-totalr.ts, frozen-read identity: `const near = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(a - b) <= 1e-9;`
- scripts/grid-totalr.ts, table printer: `(verdict.selectTotalDelta === null ? "—" : verdict.selectTotalDelta.toFixed(1)).padStart(9)`, and the same for selectExpectancyDelta with toFixed(3). The artifact writer is unchanged and now writes JSON null.
- scripts/derive-4d.ts, accepted map: `` if (verdict.selectExpectancyDelta === null) throw new Error(`${symbol} ${variant}: accepted without a select expectancy delta — the gate's conjunction was bypassed`) `` before building the row.
- scripts/freeze-candidates.ts, types: redocument FrozenMarket.cellsTested as JUDGED cells. Add `cellsGraded?: number` (absent only in the tracked act-3 freeze). Add FrozenCandidates `multiplicityBasis?: "judged"`, whose doc says: absent means the act-3 freeze counted every graded cell, and its 122.85 is overstated; see empty-fold-verdicts-2026-09-14.md. NO multiplicity option and NO legacy basis.
- scripts/freeze-candidates.ts, freezeCandidates: helper `judged(where, verdict)`. It refuses `typeof verdict.noVerdict !== "boolean"` with: `${where} carries no noVerdict — graded before the gate wrote its disposition (2026-09-14). Freeze a regraded copy written beside the original (docs/research/r4/regrade-*/); an input of an executed confirm read is never regraded in place`. It refuses `verdict.noVerdict && verdict.accepted` with `... is accepted AND noVerdict; the gate never writes both`. It returns `!verdict.noVerdict`.
- scripts/freeze-candidates.ts, market loop: increment `cellsGraded` for every variant and `cellsJudged` when judged(...). Write `cellsTested: cellsJudged, cellsGraded`. Class loop: `` classCellsTested += block.filter(([variant, verdict]) => judged(`class arm ${arm}: ${cls} ${variant}`, verdict)).length ``. Body: `multiplicityBasis: "judged"`. expectedFalseAccepts and expectedFalseAcceptsClasses keep their formulas over the corrected counts.
- scripts/freeze-candidates.ts, main(): the summary reads `... ${expectedFalseAccepts} expected false accepts at p 0.05 over ${Σ cellsTested} judged cells of ${Σ cellsGraded} graded` and, for classes, `(${classCellsTested} judged class cells, ${expectedFalseAcceptsClasses} expected by chance)`.

## Tests (`tests`)

- tests/sealedReadInputs.test.ts (new). Constants are literals from 7c28f32: READ_ID, ARTIFACT_HASH, FROZEN_HASH and RULE_HASH as in 'design'; LEDGER = docs/research/confirm-reads/confirm-log-f3b72ce8261a1d0a469f6f152950a9716703ea36a34612fe0187849459f4b062.jsonl; and a byte table [verified: git show 7c28f32 | shasum, all equal on disk]: frozen-candidates.json cb4350693d18ba2a8f8fc3b4e15fad82b1860ddfdd8843b4a04ba06a6b05f0ca; frozen-candidates.stdout.txt c8f20228c3259c82493c3a476824c6611c3055fa3fc5b7ab39c3aacd4cd96fc5; ledgered-read-act3.json f56cea5f816be6bb163d84f8b76b9e653d2fcfec3e6fba2167a9713aed5b088e; ledgered-read-act3.stdout.txt d3da3825ad627513f3bcf4872b8d9c7c9e5a0ef2f27dd548bbc4b325d08ef9c3; LEDGER cadbdcae0e7aa7a191d6fdd16713f4d645b264a5da320feaeb912c0f8598ae40; admission-derived-grading-class.json 00d59bc05a3477764699d218bddd5770ac7985865fd6b9890b4f67b28a371080; stop-cap-grading-class.json 3e388b3a7262563df8b351d8ee1468fda2a26c15173cc421ebad252943eef5b6; stop-cap-8-grading-class.json e37c9ef73a19c949bbe8687365a6329075d99ed18e89d17dcefc4982e9bb266b; review-window-grading-class.json 68044acee5cf18e6d25c1770aac6af9c701c628c525d3f62ad1cdad9c180ea81; review-window-96-grading-class.json ab302925fe5c31537152f9691ab810a47b8c8c38e8bcc8ac2eaaa94b28e0050c.
- sealedReadInputs, test 1, 'the burned read's records are the bytes it wrote': sha256File of every byte-table entry equals its literal.
- sealedReadInputs, test 2, 'the read names this freeze and this ledger line'. verifyFrozenCandidates(FROZEN).frozenHash === FROZEN_HASH. readLedgeredArtifact(READ, {manifestHash: 021821537f28e5d2777543989baa0631a38840d592fad74c4bdb2429fb627c59) returns readId === READ_ID, artifactHash === ARTIFACT_HASH, frozen.path === FROZEN, frozen.frozenHash === FROZEN_HASH, and frozen.ruleHash === RULE_HASH === FREEZE_RULE_HASH. The read's ledgerPath basename (the field holds a sibling-worktree absolute path) equals basename(LEDGER). Read ONLY that file, never a confirm-log-\* glob: acceptanceGate.test.ts:3139-3210 writes a truncated fixture and a `null` line into the same real directory while the suite runs, and the glob version fails on both [verified: tests checker, executed]. It must hold exactly 1 line, carrying READ_ID, ARTIFACT_HASH and FROZEN_HASH.
- sealedReadInputs, test 3, 'binds every market arm's grading by its bytes': the freeze has 7 arms and removalArms [S,S8,W,W96]; the read's arm list equals the freeze's; sha256File(arm.artifactPath) === arm.artifactSha256 for each. The freeze's own bytes are pinned in test 1, so these are external anchors transitively.
- sealedReadInputs, test 4, 'no input of the burned freeze carries a disposition field': a literal list of the 12 paths (7 market plus the 5 class above) shows zero cells with a noVerdict key. This names the likely failure (an in-place regrade) more readably than a hash mismatch.
- tests/emptyFoldRegrade.test.ts (new), test A, 'byte table': literal sha256 for the 30 originals [verified this session: git show 7c28f32 | shasum]. stop-cap-grading 4d81bdfbf38c8fac2fff7d00d2c1824e7c442817fb874c9ee31b5d1fbc6c1853 / stdout acb67c752d7279ce9029337ebe88f63b3fb180516ae04e602b1e8428c14c9c19. stop-cap-8-grading 59152313f56fe4482ab9a81f5acfa1d953fb3c016ba171b62fd8b1e6bbd80f2c / bdbe11054d1edd5d109911b24adbc9121d243a6b8d3f258f8798d39a606aeab7. review-window-grading d5469a9359fd76e445a46f01b61c29608951e763087b522fce9361671db7937a / 64dc6044676c942725804b30e6f32fdd75671ae1e8a62e3daf5b93d0feec2ac5. review-window-96-grading 7942c2cf6f455da8103594b5ef481781787d3a669fcb5bd1e1aacaa59760970f / 5ab3feee068f6fc18ff6b361251650eb9c3485ac542435a8714d958b6c191bd4. class-default-grading 21c59fdbf4bec1d1fc3ed101d7ac566b8d01ae57eeb36742cd60f99210e283a4 / c22efbe722535d3daad314113b51e67cb237c7b502b51ec589b48e496efab8de. class-default-gate-off-grading 3996969b4269f7b0470a38fe2ca4adeee0b432762dd2781055a59e3297fb3d40 / d18c8c34d0d2cbec5c5180689c9b0135e41c7bdcdc84588d9aba371128d396bc. admission-derived-grading bfd5edbfce00caabdae630e7df9d85ca51f208fe567dc40bcb7b872c80c7c27c / d0c730a11813b2a4acccf2420dfc3664e2a63ce28e4cb2a64e8a46d4b1d45a26. per-market-grading-classfolds e879e14903916e0f960007e23bdc61d88e8a27ba54f13338482c72388c6054bb / 20993ca61f9662c1e0c1c2ace5fe4f8fa0a276f0cdad0f704ff796fd52708839. admission-derived-grading-class 00d59bc0… (as above) / 51274146e681ee680ff6a7f16312072e8ede17189ff78b0538bf7648ecd8fc64. stop-cap-grading-class 3e388b3a… / 170d9142849a1b80f73ccde5a3fe3fae4581f68fa0d2ee3bb3ed22e17a1392f1. stop-cap-8-grading-class e37c9ef7… / f90bb8f39a29666076a18345e356c699701ff4e46cbe84f3e795032a76484db3. review-window-grading-class 68044ace… / 708c09f592d9053dad88dfd143422e6d5206a348c487e2a06bac01aa0d1eda05. review-window-96-grading-class ab302925… / aae90c044a75b8facecb5a76c40530922ad6cf90c96eabaa967c8dcf8ae3847d. class-default-grading-class 5ef3fbcae4ad08c1175c359d0d8b6654539797f86c4086d45981399b264715f1 / b2c2d16ecb23e452fc75b5511963754a043375320dec1c9375f190f0e48a0a62. class-default-gate-off-grading-class f002076dde48c98bcf6b10a2adbc0aa9c98bbcede53bf605d45bcff515fa13b4 / da8571b03100aad9728113ad1ee77495f7362729c2d4c3d5f89dcbf938953411. Add the 30 regrade-copy hashes, computed at build step 9 from the committed copies. The table's key set must EQUAL the population derived from disk: every docs/research/r4/\*grading\*.json with no noVerdict key, plus its .stdout.txt, plus every file under the regrade directory. Refuse an empty population.
- emptyFoldRegrade, test B, 'every grading with a disposition field agrees with itself' (population by CONTENT). The population is every .json under docs/research/r4, recursively, whose markets[\*].variants[\*] cells carry a noVerdict key. It must include the 15 copies and the 3 hour-gate reads by name. For every cell: (a) typeof noVerdict === 'boolean'; (b) not accepted && noVerdict; (c) accepted iff reason === 'accept'; (d) noVerdict iff reason starts with 'NO VERDICT — ', and a judged cell's reason is 'accept', 'fails', or starts with 'LOSES MONEY — ' or 'NO PROFIT SHOWN — '; (e) selectTotalDelta === null iff selectExpectancyDelta === null; (f) selectExpectancy === null implies both deltas null; (g) both deltas null implies noVerdict; (h) both deltas null with selectExpectancy non-null implies verdictUnit 'market' and shipped.select.net === null. Never key on `select.net` or shipped n as emptiness: net is null at 1 fill. Measured: holds on 6,912/6,912 cells of the patched copies and regenerated hour-gate reads; FAILS today on the tracked hour-gate reads at (f), 9 cells [verified this session: scratchpad/final-synth/invariant.mjs].
- emptyFoldRegrade, test C, 'the copies moved no figure' (prototype test 2, amended). Top level: identical except derivedAt; shards equal by basename; `derived` and `emitSha256` allowed only where the original lacked them (checked in D). Markets and shipped blocks identical. Per variant: noVerdict and reason are skipped here (covered by B); select and derived allowed only where the original lacked them (D); every other leaf deepStrictEqual, EXCEPT selectTotalDelta and selectExpectancyDelta, which equal the original wherever the copy's value is non-null. The null census must be 16 cells, all in admission-derived-grading.json.
- emptyFoldRegrade, test D, 'what the classfolds copy adds is anchored'. Its emitSha256 deep-equals arm F's emitSha256 in frozen-candidates.json (021821537f… → 23ee6b98504c3a9c1428aea5434a431fe15ef3e368dbed37fcdaf09c52c3712f). Its top-level derived deep-equals {}. Every variant's derived === false. Every variant's select deep-equals the select of the same market and variant in the regraded admission-derived-grading.json (546/546 today [verified: tests refuter and checker]).
- emptyFoldRegrade, test E, 'the register re-derives unchanged': withdrawalArtifact({manifestHash 0218…, priorPath docs/research/baseline-2026-08-10/4d-cost-sensitivity.json, readPath the act-3 read, armsDir the regrade dir}) deep-equals every key of withdrawal-verdict-2026-09-03.json (prototype test 3, unchanged).
- emptyFoldRegrade, test F, 'the judged count the freeze overstated': count noVerdict === false over the seven arm copies (basenames taken from the freeze's arms) = 1,715 of 2,457 graded. Also, no copy's sha256 equals its arm's artifactSha256. No freezeCandidates call and no class count here, because the class count depends on getAssetType.
- tests/acceptanceGate.test.ts: keep the prototype's changes. 'covers the OTHER fold too' restates non-vacuity as droppedR −20 with deltas and selectSigma null at both grains. New tests: 'publishes no select delta when the BASELINE side … is empty'; 'treats ONE select fill as evidence'; 'writes null, not a flattering number' (Object.hasOwn); 'prints a dash in both select-delta columns' (fitOnly row). Frozen-read fixtures gain noVerdict. Null-safe guards go at the prototype's sites. NEW: add `assert.equal(verdict.selectSigma, null)` to the BASELINE-side test (kills C3). NEW: 'counts FILLS, not rows' — the baseline's select rows all carry outcome 'unfilled' while the variant fills; expect both deltas null and noVerdict true (kills C1).
- tests/freezeCandidates.test.ts: the `variant()` helper gains `noVerdict = false`; the AAA deepEqual gains `cellsGraded: 3`. Keep 'excludes a no-verdict cell' (judged 1 of 3, expectedFalseAccepts 0.1, multiplicityBasis 'judged'); 'refuses a cell whose disposition it cannot read, at both grains'; 'refuses accepted and noVerdict together'; 'counts judged class cells inside the axis prefix only'. DELETE the legacy-basis test. NEW: the accepted-and-noVerdict refusal at CLASS grain, through classArms (kills C6). NEW: extend 'writes the frozen file and says what it froze' with a noVerdict cell in the fixture, matching /expected false accepts at p 0.05 over N judged cells of M graded/ with N \< M (kills C4). Assert the missing-noVerdict refusal message names 'regraded copy written beside'.
- tests/absoluteExpectancyGate.test.ts (2 sites) and tests/gateDispositionIntegrity.test.ts (2 sites): non-null guards, as in the prototype.

## Mutations (`mutations`)

- Apply each on a COMMITTED checkpoint. Confirm the file changed, read a pass/fail verdict from the test output, and revert from the checkpoint. Empty output is no verdict.
- KILLED in the prototype harness, with the killing test unchanged here [verified: scratchpad/mutate.mjs, tree restored byte-identical]: G1 guard || to && (covers OTHER fold, BASELINE side, writes null). G2 guard drops the baseline side (BASELINE side). G3 guard drops the variant side (covers OTHER fold, writes null, prints dash). G4 filled === 0 to \<= 1 (ONE select fill). G5 expectancy delta back to (v ?? 0) − (b ?? 0) (covers OTHER fold, BASELINE side, writes null). G6 printer dash to 0.0 (prints dash). G7 writer drops the null key (writes null, hasOwn). G8 selectSigma 0 instead of null (covers OTHER fold). F1 cellsTested counts graded cells (excludes a no-verdict cell). F2 missing-noVerdict refusal removed (refuses … both grains). F3 accepted+noVerdict refusal removed (refuses … together). F4 class judged filter removed (judged class cells inside prefix). D1 stop-cap copy over its original (sealedReadInputs test 3). D2 review-window-grading-class copy over its original (sealedReadInputs test 4). D4 arm S artifactSha256 re-recorded (verify refuses). D5 sha re-recorded and frozenHash recomputed (the read's frozenHash differs). D6 pairedP nudged in a copy, and D7 W96 accepts flipped in a copy (test C). D9 BTCUSD retiring cell edited in a copy (test E).
- EXPECTED, to be demonstrated at build step 10 because the killing test is new or changed: D2 also by the class byte pin (sealedReadInputs 1). D3 classfolds copy over its original (test A). D4 and D5 also by the freeze-file literal (sealedReadInputs 1, 2). D8 unpatched admission-derived copy in the regrade dir (test B(f), test C null census). X1 stale reasons written back into the 13 copies (B(d), A). X2 copy stdouts replaced by original stdouts (A). X3 original stdouts replaced by regraded ones (A). X4 consistent relabel inside a class freeze input (sealedReadInputs 1, A). X5 bogus emitSha256, derived and select in the classfolds copy (D, A). X6 190 noVerdict flags set false (B(d), A). X7 judged and unjudged dispositions swapped in 61 markets (B(d), A). X8 classfolds copy moved over the original and the copy deleted (A: key set and bytes). X9 same move on a class freeze input (sealedReadInputs 1, 4; A). H1 an hour-gate inSpan delta restored to +56.16 (B(f)). H2 an hour-gate 'LOSES MONEY — …' reason reduced to 'fails' (B(d)). A1 coordinated rewrite of freeze, read and ledger with recomputed hashes (sealedReadInputs 1, 2 literals). C1 guard on select.n instead of filled ('counts FILLS, not rows'). C3 selectSigma nulled on the variant side only (BASELINE-side selectSigma assertion). C4 summary prints graded as judged (CLI summary regex). C6 class loop bypasses the accepted+noVerdict refusal (class-grain refusal test).
- ROBUSTNESS, not a kill: reverting sealedReadInputs test 2 to a confirm-log-\* glob fails when acceptanceGate's fixture is in state 1 (SyntaxError) or state 2 (`null`, TypeError). Reading the named file passes 4/4 with either state present [verified: tests checker, executed]. Reclassifying AUDCAD in calibration.ts must fail NO test in this change set; the prototype failed 2 [verified: provenance checker]; revised set [expected].
- EQUIVALENT, no kill claimed: C2, `(selectTotalDelta ?? Infinity) > 0` and `(selectExpectancyDelta ?? 0) >= 0` in beatsBaseline. Variant side empty: at market grain minFilled 30 makes it underpowered; at class grain with baseline fills > 0 the selective leg makes it underpowered. Baseline side empty, or both empty: the baseline has no select days, so effectivePairs is 0, below MIN_EFFECTIVE_PAIRS. That last step needs data-absent rows to never add a day. grid-totalr.ts:179-181 adds dayR for any row whose outcome is not 'unfilled', but the only producer of noBarsInReviewWindow returns outcome 'unfilled' (replay.ts:423-433), and sweep.ts:1334-1336 copies the marker beside evaluation.outcome [verified this session: code reading at 7c28f32; the corpora themselves were not scanned].
- NOT CONSTRUCTIBLE: derive-4d's null-delta throw (accepted implies non-null); near() rejecting a null (accepted candidates are never null); the permutation's observed statistic (written nowhere). Removing `!== null` from beatsBaseline fails `npm run check`, not a test.

## Acceptance bar (`acceptanceBar`)

- (a) `git diff --stat main...HEAD` lists only: scripts/grid-totalr.ts, scripts/freeze-candidates.ts, scripts/derive-4d.ts; the six test files; docs/research/r4/regrade-2026-09-16/ (30 new files); the 6 hour-gate files; the 5 docs files (empty-fold note, HANDOFF, act-3 note, confirm-reads README, AGENTS.md). Nothing under docs/research/confirm-reads except README.md.
- (b) sealedReadInputs passes against the literals above.
- (c) Each of the 15 copies differs from its 7c28f32 original ONLY in: derivedAt; shards (same basename); noVerdict added on every variant; reason strings (530 market cells: 386 fails→empty fit fold, 9 THIN→empty fit fold, 73 THIN→UNDERPOWERED, 1 THIN→pairing, 52 THIN→fails, 9 THIN→LOSES MONEY; 18 distinct class verdicts: 9/4/2/1/0/2/0 in admission-derived, stop-cap, stop-cap-8, review-window, review-window-96, class-default, class-default-gate-off); selectTotalDelta and selectExpectancyDelta null on exactly 16 cells (32 fields) in admission-derived-grading.json, costShareMax variants with 0 variant select fills, previously +0.77R to +410.24R and +0.0082 to +1.9191; and the classfolds additions anchored by test D [verified: design and reproducibility refuter by execution at 7c28f32 plus the patch; must reproduce].
- (d) accepted is identical everywhere: 29 market pairs, 8 class verdicts. emitSha256 matches on the 14 originals that carry it. 395 empty-fit cells, empty on both sides, fitTotalDelta 0, all on the 16 known markets. Stdout: 680 table rows change across the 15, only in the label and the two select-delta columns, plus the 'R column' header and the 'wrote' path.
- (e) Each hour-gate JSON differs from 7c28f32 only in derivedAt plus the 6 delta fields of ASX, DAX and NIKKEI inSpan. Each stdout differs only in those 3 table rows. The 'wrote' line and shards must match the tracked file, so run from the clone root with the recorded relative paths.
- (f) emptyFoldRegrade test B is RED on the tree before the hour-gate regeneration (9 cells at rule f) and GREEN after.
- (g) The register re-derived from the regraded removal arms deep-equals all 16 keys of withdrawal-verdict-2026-09-03.json.
- (h) 1,715 of 2,457 market cells are judged across the seven arm copies. The class count, 126 of 136, is measured once at the build commit and recorded, not tested.
- (i) Every declared gate passes in the repository itself, with .git, itemised with output: npm run check; npm run lint; npm run check:migrations; npm run audit:high; npm test; npm run build; npm run check:bundle; bash scripts/vercel-ignore-build-test.sh. Then `release: npm run test:e2e` before the PR. No Edge module changes, so no Deno check; say so in the PR.
- (j) Every mutation in the KILLED and EXPECTED lists is re-applied on a committed checkpoint and read as killed. Any survivor is a finding about the guard, not a reason to drop the mutation.

## Where it is recorded (`recordWhere`)

- docs/research/empty-fold-verdicts-2026-09-14.md, new dated section 'The regrade sits beside the originals (2026-09-16)', distilled. (1) The provenance chain and its literal anchors. (2) Correction 7 withdrawn, with the reason. (3) The one-time rebuild at 7c28f32 reproduced 6b1e52e0, recorded as a dated measurement, and the class-path inference -grading.json → -grading-class.json that it confirmed. (4) No re-freeze hash is recorded: any re-freeze hash moves with derivedAt, artifactPath and the basis keys, and 78e308d4 was computed over superseded pre-patch copies. (5) Population: 15 copies plus 3 hour-gate reads regenerated in place, and why 15 rather than 12. (6) Source commit, the clone's own `git rev-parse HEAD`, and all 18 commands verbatim. (7) The transitions, 18 class verdicts, 25 nulled cells with their prior figures. (8) The multiplicity table with bases stated; freeze-era rows are parsed from reason strings because that gate wrote no disposition field.
- Multiplicity table for the note: | basis | market cells | E[false accepts] | class cells | E | — as recorded in the freeze, every graded cell | 2,457 | 122.85 | 136 | 6.8 — freeze-era reasons: not THIN and not NO VERDICT | 1,972 | 98.60 | 113 | 5.65 — of those, excluding the 318 empty-fit 'fails' whose fitTotalDelta 0 could never pass `> 0` (at most this many could have been accepted) | 1,654 | 82.70 | 113 | 5.65 — judged by today's gate | 1,715 | 85.75 | 126 | 6.3. Class grain has no empty-fit cells, so its two freeze-era rows coincide [verified: design, reproducibility refuter and checker, tests checker by execution].
- Same note, dated corrections to the recorded corrections. #1: of 71 THIN pairs with ≥30 fills, 61 become judged (52 fails, 9 LOSES MONEY), 9 hit the empty-fit leg, 1 the pairing leg. #3: 386 is exact, not a floor. #5: the bar must allow shards paths, the null deltas and the classfolds additions. #6: stdout goes beside the copies. #7: withdrawn. Also: class-grain JSON reasons DO change (18 distinct verdicts); the originals still do not reproduce and are not meant to, while the copies do. After the paragraph 'not one numeric or boolean field moved' (#654), add a dated note that on 2026-09-16 the hour-gate reads moved 6 delta fields each, to null, and 3 printed rows each.
- docs/HANDOFF.md: replace the 'Owed and not done here' paragraph, the 'Also owed … select delta' paragraph, the 'FIFTH consumer' paragraph and the regrade half of 'Two more record gaps' with a done record. It names the copies' directory by full path, the pin tests, the corrected multiplicity, register invariance and the hour-gate regeneration. It removes the premise that 'the regrade rewrites both the gradings and the freeze'. It keeps the 4d-candidates gap and lists the still-owed items from 'unestablished'.
- docs/research/r4-act3-supplementary-arms-2026-09-03.md: a dated one-line pointer under the §6c table (2,457 / 122.85) and at line 401 (8 of 136), linking the empty-fold note's table.
- docs/research/confirm-reads/README.md:159: add that the class-axis gradings are bound by neither path nor hash in the freeze, and that tests/sealedReadInputs.test.ts pins the act-3 ones by bytes.
- AGENTS.md, Laws: 'A grading, freeze or ledger that an executed confirm read consumed is never regenerated in place; regrades go beside it (docs/research/r4/regrade-\*/), and tests/sealedReadInputs.test.ts pins the act-3 chain by literal bytes.'
- PR body: name every doc touched; say no Deno check was needed; give the squash title explicitly with --title.

## Build steps (`buildSteps`)

1. Branch from a MERGED, current main. Check `git branch --show-current` before every commit and push; the checkout is shared. If main has moved past 7c28f32, re-verify that the 30 original hashes and the 5 sealed-record hashes still equal the literals before building on them.
2. TDD, code: add the new and changed unit tests in acceptanceGate.test.ts and freezeCandidates.test.ts. Run them and see them red for the right reason. Implement the grid-totalr, freeze-candidates and derive-4d changes, update fixtures and null guards, and go green. Run npm run check and npm run lint.
3. Commit checkpoint A (fix(gate): …).
4. Write tests/sealedReadInputs.test.ts. It passes on the untouched records. Write emptyFoldRegrade test B (shape and vocabulary). Confirm it is RED on the 3 tracked hour-gate reads, 9 cells at rule f. Commit checkpoint B.
5. Confirm `git status --porcelain` is empty. Take `bash scripts/scratch-clone.sh <scratchpad>/regrade-run` WITH .git. Symlink node_modules and the 8 corpora (r3/capture-all-classfolds.jsonl, r3/capture-all-classfolds-2026-09-14.jsonl, r4/{stop-cap,stop-cap-8,review-window,review-window-96,class-default,class-default-gate-off}.jsonl), never copying them. In the clone, record `git rev-parse HEAD` (must equal checkpoint B) and an empty `git status --porcelain`.
6. From the clone root, write stdout beside each output and stderr to scratch. Market gradings: `npx tsx scripts/grid-totalr.ts <corpus> --verdict-unit market --provenance docs/research/r4/shipped-cell-provenance.json --out docs/research/r4/regrade-2026-09-16/<name>.json`. Corpora: stop-cap, stop-cap-8, review-window, review-window-96, class-default, class-default-gate-off under r4, and r3/capture-all-classfolds.jsonl for per-market-grading-classfolds. admission-derived-grading adds `--derive-filters "payoffFloor=1.5:rewardRisk>=1.5;payoffFloor=1.6:rewardRisk>=1.6;costShareMax=0.15:costShare<=0.15;costShareMax=0.2:costShare<=0.2"`. The seven class gradings use `--verdict-unit class` with no --provenance; admission-derived-class takes the same derive filters. Hour-gate reads: `npx tsx scripts/grid-totalr.ts docs/research/r3/capture-all-classfolds.jsonl --derive-filters "inSpan:decisionHourDistance<=2.5" --verdict-unit market --out docs/research/r4/hour-gate-market-2026-09-12.json`; the same on capture-all-classfolds-2026-09-14.jsonl with --out …net-2026-09-14.json; and again with `--r-arm bound` and --out …bound-2026-09-14.json. About 11 minutes for the 15 plus under 3 minutes per hour-gate read. Zero provider bytes; no --confirm-final and no --frozen.
7. In the clone, verify bars (c), (d) and (e) with leaf and stdout diffs against 7c28f32. Keep the scripts in scratch.
8. Copy the 30 regrade files and the 6 hour-gate files into the working tree while no npm test is running in that tree; confirmFoldSealed snapshots docs/.
9. Compute sha256 of the 30 committed copies and write them into test A. Finish emptyFoldRegrade tests A, C, D, E and F. Run both new test files, then the full `npm test`. Measure the class judged count at this commit for the note. Commit checkpoint C.
10. Mutation pass on checkpoint C: every KILLED and EXPECTED mutation, one at a time, each verdict read, each reverted from the committed tree, the tree hash checked at the end.
11. Docs, per recordWhere. Commit (docs: …). No npm test run while copying.
12. Run the declared gates in the repository and itemise them, then `npm run test:e2e`. Open the PR with an explicit --title, then `gh pr merge --squash --auto --delete-branch`.

## Withdrawn claims (`withdrawnClaims`)

- Correction 7 (re-run freeze-candidates, or re-record the seven artifactSha256 values).
- 'The select-delta fix touches exactly 16 cells (32 fields)': it is 25 cells (50 fields).
- 'Hour-gate reads: no select delta was nulled in them; leave untouched.'
- 'A judged-basis freeze over the copies hashes to 78e308d4…'.
- '1,654 is the count judged under the gate that made the freeze': relabelled as the upper bound on what could have been accepted.
- 'The in-test rebuild makes the chain fail loudly' and 'the legacy-graded basis must stay': the rebuild misses wording edits and fails on reclassification.
- 'A test fails if any input of the burned read changes': true only once the class inputs are pinned by bytes.
- 'emptyFoldRegrade pins what the regrade moved': labels, stdout and added keys were unpinned (X1–X8 survived the prototype).
- 'notEqual(frozenHash) shows why no freeze is rewritten': vacuous, since the path and basis keys alone force it.
- The prototype's glob over confirm-log-\*.jsonl: it races acceptanceGate's fixture.
- The record's '386 is a floor' and 'class-grain JSON was right, only the printed labels were stale'.
- The refuter's shipped.select.net.n baseline proxy and the checker's selectEvidenceAbsent flag and aa1f386a pin (see resolvedDisagreements).

## Unestablished (`unestablished`)

- No revised test has been written or run. Every EXPECTED kill, the byte table for the copies, and the RED-then-GREEN behaviour of test B on the repository tree remain to be demonstrated.
- Whole-repo gates have never run with this patch. Only --no-git scratch clones ran the suite (3,932 tests, 33 environment failures, identical on unpatched main).
- That shipped.select at market grain comes from the same baseline name groupVerdicts uses: both default to options.baselineVariant ?? 'baseline' [verified: code reading]; that both receive the same options object was not traced.
- That data-absent rows are always 'unfilled' is verified in the emitter code at 7c28f32 only. The corpora were emitted at earlier engine commits and were not scanned.
- The class judged count (126) depends on getAssetType membership at the commit where it is measured.
- fitTotalDelta still publishes 0 on the 395 empty-fit cells. Nulling it is a schema change reaching FrozenCandidate, chooseCandidate, the frozen-read identity and ClassCandidateRead, and needs a driver or owner call.
- The frozen-read poolOf (grid-totalr.ts \~2238-2255) computes fit and select deltas with no fill guard during a burn. Owed; no program burns this calendar again.
- Select deltas over 1-fill cells still print large figures beside NO VERDICT (DOTUSD costShareMax=0.15: +379.5R over 1 fill). By design, because the floors own thinness, but a reader can misread them.
- Future freezes still record no class-arm path or sha256. Schema addition owed.
- The three 4d-candidates artifacts under baseline-2026-08-10/ cannot be regraded (no corpus, INVALID corpus). 48 markets stay indistinguishable to a reader.
- The directory name regrade-2026-09-16 is baked into the tests and the note. If the run lands on another day, rename the directory and the constant together.
