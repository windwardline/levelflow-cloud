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
 * A fourth mode belongs to the WALK rather than to a value accessor, and
 * `positionalArgs` below closes it — `flagsOnly` for a reader that takes
 * no positional argument: a walker that skips every `--x` it does not
 * know, or a reader with no walk at all, reads a typo as nothing, so the
 * run measures the default under a line saying the dial was honoured.
 *
 * Closing that per file meant the fix reached whichever file someone
 * happened to open. This module is the one implementation FOR THE
 * READERS THAT IMPORT IT. A minority keep their own value accessors,
 * because their specific error messages are what executed tests assert,
 * and rewriting those would trade a live pin for uniformity; they share
 * `soleFlagIndex` below, so flag RESOLUTION is one implementation
 * everywhere even where the messages are not (#364 round 53, finding 1 —
 * the first version of this sentence claimed all of them and was false).
 * The split is a rule here rather than a tally: round 53's "eleven of
 * seventeen" stood in this paragraph while the population grew past
 * thirty, and a count nothing derives rots the day a reader is added.
 * A reader
 * declares which of its flags take a value and reads them through here,
 * and `tests/sweepManifest.test.ts` derives the list of files the law
 * applies to by globbing this directory rather than curating it.
 */
/**
 * An error caused by what the OPERATOR typed, as opposed to a defect in the
 * script. The distinction is not cosmetic: a reader's entry point prints a
 * refusal as one clean line and a real fault with its stack, and without a
 * discriminator it must choose one shape for both — which either buries a
 * TypeError's frames or dresses a typo up as a crash. `FLEET.md` names the
 * direction that matters: a harness failure must never read as the subject
 * refusing.
 */
export class OperatorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatorInputError";
  }
}

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
    throw new OperatorInputError(
      `${arg} was given ${occurrences.length} times — this reader will ` +
        `not choose between them; pass ${arg} exactly once`,
    );
  }
  return occurrences[0] ?? -1;
}

/**
 * Why a token cannot be a flag's value, or null if it can be.
 *
 * Exported for the same reason `soleFlagIndex` is: the six readers that
 * keep their own messages must not also keep their own idea of what a
 * usable token IS (#364 round 54, finding 1). The BLANK case is the one
 * every implementation was missing, and it was missing because the guard
 * was written against the two shapes an author types by hand:
 * `""` is not undefined and does not start with `--`, so it walked
 * through the token guard, and `Number("")`, `Number(" ")` and
 * `Number("\t")` are all **0** — finite — so it walked through the
 * parse guard too. The dial then read ZERO in silence.
 *
 * That is not a typo's shape, it is the ordinary shell one:
 * `--min-n "$MIN_N"` with the variable unset passes an empty argv entry,
 * and this repo drives these readers from shell. A zero floor reopens
 * every defect the floors were added for — no thin marker prints, the
 * starvation gate flags a two-row market and exits 1, EXCLUDE verdicts
 * resume at two filled outcomes — and `--step ""` gives the sweep driver
 * `stepBars: 0`, where `index += input.stepBars` never advances and
 * `simulateSymbol` loops forever, slicing the bar array every pass, in a
 * driver whose runs are measured in hours.
 *
 * This repo had already ruled on the coercion: round 8's `numberFromKeys`
 * SKIPS an absent-shaped raw rather than coercing it. The flag law was
 * built afterwards and did not inherit the ruling.
 */
export type TokenFault = "missing" | "flag-shaped" | "blank";

export function tokenFault(token: string | undefined): TokenFault | null {
  if (token === undefined) return "missing";
  if (token.startsWith("--")) return "flag-shaped";
  if (token.trim() === "") return "blank";
  return null;
}

/**
 * What the reader got, phrased for the operator.
 *
 * Kept beside `tokenFault` so the seven refusals describe one fault the
 * same way while each keeps its own sentence about what the fault costs
 * — which is what their executed tests assert.
 */
export function describeToken(token: string | undefined): string {
  const fault = tokenFault(token);
  if (fault === "missing") return "no value";
  if (fault === "blank") {
    return token === ""
      ? "an EMPTY token — an unset or empty shell variable expands to one"
      : "a WHITESPACE-ONLY token — an unset shell variable often expands to one";
  }
  return `"${token}"`;
}

/**
 * The same fault in the numeric readers' frame.
 *
 * Two renderers rather than one, because two message frames exist by
 * design: a value flag says what it GOT, a numeric dial says what it
 * cannot READ AS A NUMBER, and executed tests assert both wordings. What
 * they must not disagree about is which tokens are faulty, which is why
 * both read `tokenFault`.
 */
export function describeNumericToken(token: string | undefined): string {
  const fault = tokenFault(token);
  if (fault === "missing") return "a missing value";
  if (fault === "blank") {
    return token === ""
      ? "an EMPTY token — an unset or empty shell variable expands to one"
      : "a WHITESPACE-ONLY token — an unset shell variable often expands to one";
  }
  return `"${token}"`;
}

/**
 * What values a dial may take, and WHY — the domain, not the token shape.
 *
 * Round 54 closed `--step ""` by refusing a blank token. `--step 0` walks
 * straight past it (#364 round 55, finding 2): `Number.isFinite(0)` is
 * true, so the shape guard has nothing to say, and `stepBars: 0` reaches
 * `index += input.stepBars` in `sweep.ts`, which never advances while
 * `primaryBars.slice(0, index + 1)` allocates a fresh copy every pass —
 * unbounded in both time and memory, with no output and no exit. The route
 * is not a typo: an operator wanting a decision on EVERY bar types 0 for
 * "no skipping" rather than 1, and a bisect script computing `--step
 * "$STEP"` is the other. `--step -1` is the loud mirror — the index walks
 * backward, the slice empties and `history.at(-1)!` throws.
 *
 * `basis` is required, because a bound with no recorded reason is the
 * thing this repo keeps having to re-derive. `MIN_EFFECTIVE_PAIRS` and
 * `--min-reached` both carry theirs at the constant; a domain carries its
 * own to the operator who trips it.
 */
export type NumericDomain = {
  readonly min?: number;
  readonly integer?: boolean;
  readonly basis: string;
};

export function assertInDomain(
  arg: string,
  value: number,
  domain: NumericDomain,
): void {
  if (domain.integer === true && !Number.isInteger(value)) {
    throw new OperatorInputError(
      `${arg} must be a whole number and got ${value} — ${domain.basis}`,
    );
  }
  if (domain.min !== undefined && value < domain.min) {
    throw new OperatorInputError(
      `${arg} must be at least ${domain.min} and got ${value} — ` +
        `${domain.basis}`,
    );
  }
}

/**
 * The positional arguments, with every UNKNOWN flag refused by name.
 *
 * The fourth failure mode, and the one the header's three do not cover:
 * a walker that consumes the token after a declared value flag and
 * `continue`s on every other `--x` reads a typo, a retired dial and a
 * flag meant for a sibling script all as nothing at all. The run then
 * measures the default while its shell history — and its operator —
 * says otherwise.
 *
 * `grid-totalr` closed this inline in R4 act 2 (#570), after a no-op
 * `--per-market-folds` passed the sealed guard for a day as if it were a
 * second shape of that reader. On 2026-09-21 `confirm-4d
 * --not-a-real-flag <shard>` — the script that BURNS the LA-6 confirm
 * read — reported only the corpus door's refusal and never named the
 * flag. This is that refusal declared once, with grid-totalr's wording,
 * so the reader that burns cannot drift from the gate it grades through.
 * Which readers take it is not listed here: `tests/unknownFlagRefused.test.ts`
 * derives the population from every script that reads `process.argv` and
 * executes the refusal in each.
 *
 * A reader that takes no flag passes two empty sets and refuses every
 * `--x` by name. That is not ceremony: the readers that did so filtered
 * flags away with `argv.filter((a) => !a.startsWith("--"))`, or read
 * `process.argv.slice(2)` whole as file names and refused `--x` as a
 * missing manifest — the wrong diagnosis, and the line a reader's FIRST
 * flag gets added on top of.
 *
 * A SINGLE-dash token is flag-shaped too (`-x`), and refused by the same
 * sentence: read as a path it came back "no manifest beside the emit",
 * the misdiagnosis round 38 fixed for a repeated `--seed`. A bare `-` and
 * a negative number (`-1`, `-0.5`) are values, never flags.
 *
 * A declared value flag owns the token after it UNLESS that token is
 * itself flag-shaped or absent. Then it owns nothing, the next flag is
 * walked as a flag, and the accessor refuses the missing value by name.
 * Swallowing it instead misdiagnosed the ordinary slip:
 * `market-dossier --out --net x.jsonl` would walk `--net` as --out's
 * value and refuse x.jsonl as a stray argument, when what the operator
 * got wrong is that --out has no value — the refusal
 * tests/marketDossier.test.ts pins. A value the flag DOES own is not
 * examined here: blank or unparseable, the accessor judges it.
 *
 * Boolean flags are DECLARED rather than inferred from "not a value
 * flag", which is the inversion the 4d walkers were built on and #364
 * round 44 removed: under it a typo'd or newly-added boolean silently
 * ate the shard path after it. A retired flag counts as known — both 4d
 * scripts declare `--per-market-folds` so their own refusal, which says
 * what it did to the held-back fold, wins over this generic one.
 */
export function positionalArgs(
  argv: readonly string[],
  valueFlags: ReadonlySet<string>,
  booleanFlags: ReadonlySet<string>,
  scriptName: string,
): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (flagShaped(token)) {
      if (!valueFlags.has(token) && !booleanFlags.has(token)) {
        throw new OperatorInputError(
          `${scriptName}: unknown flag ${token} — the flags this reader knows are ` +
            `${[...valueFlags, ...booleanFlags].sort().join(", ")}; an unknown ` +
            `flag is refused rather than ignored, because an ignored dial reads ` +
            `as a run that honoured it`,
        );
      }
      if (valueFlags.has(token) && ownsNext(argv[index + 1])) index += 1;
      continue;
    }
    positionals.push(token);
  }
  return positionals;
}

/** `--x` or `-x`; never a bare `-` and never a negative number. */
function flagShaped(token: string): boolean {
  return token.startsWith("--") || /^-[^\d.]/.test(token);
}

/** Whether a value flag may take this token as its value. */
function ownsNext(token: string | undefined): boolean {
  return token !== undefined && !flagShaped(token);
}

/**
 * The same walk for a reader that takes FLAGS ONLY, which also refuses
 * any argument left over.
 *
 * Until 2026-09-21 the readers that read their flags through
 * `flagReader` or `soleFlagIndex` had no walk at all, so nothing in them
 * ever looked at a token no accessor asked for.
 * `sweep-analysis --emit <shard> --min-nn 5` exited 0 at the default
 * `--min-n 30` and never named the typo; `derive-baselines --new-eraa`
 * ran as a plain re-derivation and reached the write of the tracked
 * `market-baselines.json` it defaults to. A stray bare token is the same
 * silence one character over — `sweep-analysis --emit a.jsonl b.jsonl`
 * reported over a.jsonl without a word — so it is refused in the same
 * sentence.
 *
 * Called FIRST, before any accessor reads a value and before any
 * credential check, so the refusal a typo earns is the one it gets: a
 * mistyped flag on a machine without the provider key must not send the
 * operator to their credentials.
 */
export function flagsOnly(
  argv: readonly string[],
  valueFlags: ReadonlySet<string>,
  booleanFlags: ReadonlySet<string>,
  scriptName: string,
): void {
  const [stray] = positionalArgs(argv, valueFlags, booleanFlags, scriptName);
  if (stray !== undefined) {
    const known = [...valueFlags, ...booleanFlags].sort();
    throw new OperatorInputError(
      `${scriptName}: stray argument ${JSON.stringify(stray)} — this reader ` +
        `takes flags only (${known.length > 0 ? known.join(", ") : "none"}); ` +
        `a stray argument is refused rather than ignored, because an ` +
        `ignored argument reads as a run that honoured it`,
    );
  }
}

export function flagReader(
  argv: readonly string[],
  valueFlags: ReadonlySet<string>,
) {
  const token = (arg: string): string | undefined => {
    if (!valueFlags.has(arg)) {
      throw new OperatorInputError(
        `${arg} is read as a value flag but is not declared in this ` +
          `script's VALUE_FLAGS — declare it there, or its value is read ` +
          `as something else entirely`,
      );
    }
    const index = soleFlagIndex(argv, arg);
    if (index === -1) return undefined;
    const next = argv[index + 1];
    if (tokenFault(next) !== null) {
      throw new OperatorInputError(
        `${arg} owns the token after it and got ${describeToken(next)} — a ` +
          `value, never a flag and never blank; pass ${arg} <value>. Falling ` +
          `back here silently is how a run measures something other than ` +
          `what was asked`,
      );
    }
    return next;
  };

  return {
    str: (arg: string): string | undefined => token(arg),
    num: (arg: string, fallback: number, domain?: NumericDomain): number => {
      const raw = token(arg);
      // The DEFAULT is checked against the domain too. A default outside
      // its own dial's domain is a defect nobody would ever see reported,
      // since the refusal only fires on what an operator typed.
      if (raw === undefined) {
        if (domain !== undefined) assertInDomain(arg, fallback, domain);
        return fallback;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw new OperatorInputError(
          `${arg} owns the token after it and cannot read "${raw}" as a ` +
            `number — a NaN dial disables every comparison it feeds ` +
            `without saying so; pass ${arg} <number>`,
        );
      }
      if (domain !== undefined) assertInDomain(arg, parsed, domain);
      return parsed;
    },
  };
}
