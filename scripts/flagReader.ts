/**
 * The guarded flag reader, declared ONCE (#364 round 50, finding 2).
 *
 * Every reader in this directory used to carry its own
 * `argv.indexOf("--" + name)` helper, which has three failure modes the
 * corpus readers spent rounds 33–38 closing one file at a time:
 *
 * - a flag typed without its value silently takes the NEXT FLAG as its
 *   value, or falls back to a default, under a confident success line;
 * - `indexOf` finds only the FIRST occurrence, so `--seed 7 --seed 8`
 *   walks "8" somewhere it does not belong;
 * - an undeclared flag reads a value nothing declared it owns.
 *
 * Closing that per file meant the fix reached whichever file someone
 * happened to open. This module is the one implementation FOR THE
 * READERS THAT IMPORT IT — eleven of seventeen. The other six keep
 * their own value accessors, because their specific error messages are
 * what executed tests assert, and rewriting those would trade a live
 * pin for uniformity; they share `soleFlagIndex` below, so flag
 * RESOLUTION is one implementation everywhere even where the messages
 * are not (#364 round 53, finding 1 — the first version of this
 * sentence claimed all of them and was false). A reader
 * declares which of its flags take a value and reads them through here,
 * and `tests/sweepManifest.test.ts` derives the list of files the law
 * applies to by globbing this directory rather than curating it.
 */
/**
 * Where a flag sits in argv, refusing a repeat.
 *
 * Exported so the readers that keep their own value accessors — six of
 * them, whose specific error messages executed tests assert — share the
 * RESOLUTION step even where they do not share the messages (#364 round
 * 53, finding 1). First-occurrence-only is mode two of the three the
 * header above lists, and round 51 made it a refusal here while leaving
 * it live in all six, including the gates that exit non-zero and the
 * script that burns the confirm read.
 */
export function soleFlagIndex(argv: readonly string[], arg: string): number {
  const occurrences = argv.reduce<number[]>(
    (found, token, at) => token === arg ? [...found, at] : found,
    [],
  );
  if (occurrences.length > 1) {
    throw new Error(
      `${arg} was given ${occurrences.length} times — this reader will ` +
        `not choose between them; pass ${arg} exactly once`,
    );
  }
  return occurrences[0] ?? -1;
}

export function flagReader(
  argv: readonly string[],
  valueFlags: ReadonlySet<string>,
) {
  const token = (arg: string): string | undefined => {
    if (!valueFlags.has(arg)) {
      throw new Error(
        `${arg} is read as a value flag but is not declared in this ` +
          `script's VALUE_FLAGS — declare it there, or its value is read ` +
          `as something else entirely`,
      );
    }
    const index = soleFlagIndex(argv, arg);
    if (index === -1) return undefined;
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(
        `${arg} owns the token after it and got ${
          next === undefined ? "no value" : `"${next}"`
        } — a value, never a flag; pass ${arg} <value>. Falling back here ` +
          `silently is how a run measures something other than what was asked`,
      );
    }
    return next;
  };

  return {
    str: (arg: string): string | undefined => token(arg),
    num: (arg: string, fallback: number): number => {
      const raw = token(arg);
      if (raw === undefined) return fallback;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new Error(
          `${arg} owns the token after it and cannot read "${raw}" as a ` +
            `number — a NaN dial disables every comparison it feeds ` +
            `without saying so; pass ${arg} <number>`,
        );
      }
      return parsed;
    },
  };
}
