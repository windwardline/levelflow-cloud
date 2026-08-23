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
