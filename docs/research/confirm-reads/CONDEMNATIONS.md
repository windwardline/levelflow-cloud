# Condemnations of sealed inputs

A burned confirm read cannot be retaken, so the files it was frozen from are sealed
with it: the act-3 freeze, its seven market-arm gradings, its five class-arm gradings,
and the stdout record of each (`tests/sealedArmsUnchanged.test.ts`).

Elsewhere in this repository an artifact is condemned by stamping `INVALID` into it in
place. A sealed input is never condemned that way, because the stamp rewrites the
provenance of the read. If a sealed input is found to be wrong, the condemnation is
recorded here instead, and the file's bytes are left alone.

Each entry names the file, the date, what is wrong with it, what evidence shows it, and
which verdicts that rested on it are affected.

This file is Markdown and must stay Markdown: every `.jsonl` in this directory is read
as a ledger on every confirm read.

## Entries

None recorded.
