# Condemnations of sealed files

A burned confirm read cannot be retaken, so the files it was frozen from are sealed
with it: its seven market-arm gradings, its five class-arm gradings and the stdout
record of each (the twelve sealed inputs and their twins), the freeze they were
frozen into, and the read's own artifact and printed record. The ledger line that
makes a repeat read refuse is sealed too, by the value of its fields rather than
its bytes (`tests/sealedArmsUnchanged.test.ts`). This register covers every sealed
FILE; a ledger line is not one.

Elsewhere in this repository an artifact is condemned by stamping `INVALID` into it in
place. **No sealed file is condemned that way**, because the stamp rewrites the
provenance of a read that cannot be retaken. If a sealed file is found to be wrong,
the condemnation is recorded here instead, and its bytes are left alone. Two cases
need saying:

- **The freeze.** A stamp in `docs/research/r4/frozen-candidates.json` cannot be
  taken back: `verifyFrozenCandidates` refuses a file carrying `INVALID`
  (`scripts/freeze-candidates.ts`), and `frozenHashOf` hashes every key but
  `frozenHash`, so the stamp also breaks the hash the burned read binds.
- **The read's own artifact.** `grid-totalr` carries a standing `INVALID` banner
  forward when it writes a read, which predates the seal; a pinned read is
  condemned here, never by a banner.

A printed record (`.stdout.txt`) cannot carry a machine-readable stamp at all: the
stamp is JSON-only (`scripts/researchArtifact.ts`). A condemnation-shaped edit to one
reads to the guard as tampering, so its condemnation comes straight here.

Each entry names the file, the date, what is wrong with it, what evidence shows it, and
which verdicts that rested on it are affected.

This file is Markdown and must stay Markdown: every `.jsonl` in this directory is read
as a ledger on every confirm read.

## Entries

None recorded.
