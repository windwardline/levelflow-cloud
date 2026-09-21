# Condemnations of sealed files

A burned confirm read cannot be retaken, so the files it was frozen from are sealed
with it: the act-3 freeze, its seven market-arm gradings, its five class-arm gradings,
and the stdout record of each — and so are the read's own artifact file, its
printed record, the freeze its artifact binds, and the ledger line that makes a
repeat read refuse
(`tests/sealedArmsUnchanged.test.ts`).

Elsewhere in this repository an artifact is condemned by stamping `INVALID` into it in
place. A sealed input is never condemned that way, because the stamp rewrites the
provenance of the read. If a sealed input is found to be wrong, the condemnation is
recorded here instead, and the file's bytes are left alone. The same holds for a
sealed read's own artifact: `grid-totalr` carries a standing `INVALID` banner
forward when it writes a read, which predates the seal, and a pinned read is
condemned here, never by a banner.

Each entry names the file, the date, what is wrong with it, what evidence shows it, and
which verdicts that rested on it are affected.

This file is Markdown and must stay Markdown: every `.jsonl` in this directory is read
as a ledger on every confirm read.

## Entries

None recorded.
