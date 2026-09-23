// The ad-hoc spend guard (§21j Phase 1).
//
// FMP bills bytes over a trailing 30-day window and publishes no usage
// endpoint, so nothing can ask how much allowance is left — it can only be
// measured on the way past. The replay sweeps exhausted a 150 GB Ultimate
// allowance in days on 2026-08-13 because no code between the command line
// and the provider was able to refuse them. Steady-state Levelflow sits near
// 2% of the same allowance; one sweep campaign is the other 98%.
//
// This is deliberately a guard, not a gate. A script that never imports it
// spends freely — only §21d's chokepoint, which holds the key, can make the
// ad-hoc class unable to overspend. What this buys is a bound on the one
// consumer that has actually caused an outage, for one file and no
// infrastructure.

import { soleFlagIndex } from "./flagReader.ts";

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
};

/** Who refused: this machine's governor, the shared breaker, or the provider. */
export type StandDownSource = "governor" | "breaker" | "provider";

/**
 * Every refusal the governor or the breaker raises, as ONE family.
 *
 * The retry ladders recognise the base class, so a refusal added later is
 * final the day it exists instead of the day someone remembers to widen a
 * predicate — which is how the byte budget's own refusal was retried seven
 * times until the ladder learned its name. `standDownKind` and `source` are
 * what the entry point prints as its stand-down token, so a shell reader
 * classifies the refusal from what raised it rather than from prose.
 */
export class SpendRefusedError extends Error {
  constructor(
    message: string,
    readonly standDownKind: string,
    readonly source: StandDownSource,
  ) {
    super(message);
    this.name = "SpendRefusedError";
  }
}

export class ByteBudgetExceededError extends SpendRefusedError {
  constructor(readonly limitBytes: number, readonly spentBytes: number) {
    super(
      `FMP byte budget exhausted: ${spentBytes} bytes spent against a ${limitBytes} byte ` +
        `ceiling. Halting before the next fetch. Raise --byte-budget deliberately or ` +
        `narrow the sweep; do not remove the ceiling.`,
      "runBudget",
      "governor",
    );
    this.name = "ByteBudgetExceededError";
  }
}

/** The consumer class's share of the UTC day is spent, counting every process. */
export class DailyCeilingExceededError extends SpendRefusedError {
  constructor(message: string) {
    super(message, "dailyCeiling", "governor");
    this.name = "DailyCeilingExceededError";
  }
}

/** Spend or breaker evidence could not be appended; every later ceiling would be blind to it. */
export class LedgerWriteError extends SpendRefusedError {
  constructor(message: string) {
    super(message, "ledgerWriteFailed", "governor");
    this.name = "LedgerWriteError";
  }
}

/** The ledger or the breaker log exists and could not be read. Never read as zero. */
export class LedgerUnreadableError extends SpendRefusedError {
  constructor(message: string) {
    super(message, "ledgerUnreadable", "governor");
    this.name = "LedgerUnreadableError";
  }
}

/** Another consumer claimed the breaker's one probe first. */
export class ProbeLostError extends SpendRefusedError {
  constructor(kind: string, message: string) {
    super(message, kind, "breaker");
    this.name = "ProbeLostError";
  }
}

/**
 * A spender reached for its budget, its fetch or its state before main()
 * governed them. Final like every refusal here, so a catch that rethrows
 * finals ends the run red instead of filing the refusal as the provider's
 * answer for each symbol.
 */
export class UngovernedSpendError extends SpendRefusedError {
  constructor(message: string) {
    super(message, "ungoverned", "governor");
    this.name = "UngovernedSpendError";
  }
}

/** What the governor needs to close the breaker on this answer's evidence. */
export type RecordMeta = { endpointPath: string; answeredAtMs: number };

export type ByteBudget = {
  record: (bytes: number, meta?: RecordMeta) => void;
  spent: () => number;
  remaining: () => number;
};

export function createByteBudget(limitBytes: number): ByteBudget {
  // A ceiling that reads as nothing must stop the run rather than quietly
  // meaning "unlimited" — the same law the minute bank carries (#344).
  if (!Number.isFinite(limitBytes) || limitBytes <= 0) {
    throw new Error(
      `Refusing a byte budget that reads as nothing: ${String(limitBytes)}. ` +
        `Declare a positive ceiling in bytes.`,
    );
  }

  let spent = 0;

  return {
    record(bytes: number) {
      // Credit first. These bytes were served before they could be counted,
      // so refusing to record them would under-report real consumption —
      // exactly how an allowance disappears without anyone seeing it. The
      // ceiling stops the NEXT fetch; it cannot un-spend this one.
      spent += bytes;
      if (spent > limitBytes) {
        throw new ByteBudgetExceededError(limitBytes, spent);
      }
    },
    spent: () => spent,
    remaining: () => limitBytes - spent,
  };
}

const encoder = new TextEncoder();

// The single point where a sweep's spend is measured. Reading the body is the
// only moment the real cost is knowable — FMP publishes no usage endpoint, and
// Content-Length is absent on chunked responses.
export async function readJsonWithBudget<T = unknown>(
  response: { text: () => Promise<string> },
  budget: ByteBudget,
  endpointPath?: string,
): Promise<T> {
  // The answer's instant is taken BEFORE the body streams. The breaker
  // closes on evidence time, and a refusal another consumer records while
  // this body is still arriving is newer than this answer.
  const answeredAtMs = Date.now();
  const text = await response.text();
  // Charge before parsing. A payload that halts the run still cost what it
  // cost, and an unparseable one is not free either.
  budget.record(
    encoder.encode(text).length,
    endpointPath === undefined ? undefined : { answeredAtMs, endpointPath },
  );
  return JSON.parse(text) as T;
}

/**
 * The argv flag each parser below reads, keyed by the parser's name
 * (2026-09-22). A reader that calls one must declare that flag in its own
 * walk, or the walk refuses the flag the parser honours. The flag is read
 * HERE, so the reader's source never names it as a read and the reader's
 * own declares-what-it-reads law cannot see it;
 * tests/unknownFlagRefused.test.ts holds every caller to this map instead,
 * and executes each parser to prove it reads the flag named here. The
 * parsers keep their literals: tests/sweepManifest.test.ts pins the
 * soleFlagIndex call by its text.
 */
export const ARGV_FLAG_OF_PARSER = {
  parseByteBudgetArg: "--byte-budget",
  parseDailyCeilingArg: "--daily-ceiling",
} as const;

export function parseByteBudgetArg(argv: readonly string[]): number {
  // Resolved through the shared step rather than indexOf (#364 round 53,
  // finding 1). This file is exempt from the VALUE_FLAGS law because the
  // size regex below already closes the missing-value and flag-shaped-value
  // modes — but the law lists THREE, and first-occurrence-only was open
  // here: `--byte-budget 2gb --byte-budget 150gb` started under the 2 GB
  // ceiling without a word, on the one dial whose whole reason for
  // existing is that nothing else can refuse an ad-hoc run's spend.
  const flagAt = soleFlagIndex(argv, "--byte-budget");
  const raw = flagAt === -1 ? undefined : argv[flagAt + 1];
  if (raw === undefined) {
    throw new Error(
      `--byte-budget is required. An ad-hoc FMP run declares its ceiling before ` +
        `it starts (e.g. --byte-budget 256mb). See §21j.`,
    );
  }
  return parseSize(raw, "--byte-budget");
}

/**
 * An owner-approved raise of the ad-hoc class's daily ceiling, or undefined.
 *
 * Absent means the class ceiling holds. Present, it must carry a readable
 * size: a raise typed without its value stops the run rather than falling
 * back to a ceiling nobody chose. Resolved through soleFlagIndex, so a raise
 * given twice is refused rather than read as whichever came first.
 */
export function parseDailyCeilingArg(argv: readonly string[]): number | undefined {
  const flagAt = soleFlagIndex(argv, "--daily-ceiling");
  if (flagAt === -1) return undefined;
  const raw = argv[flagAt + 1];
  if (raw === undefined) {
    throw new Error(
      `--daily-ceiling was given without a size. A raise names its ceiling ` +
        `(e.g. --daily-ceiling 30gb) or is not passed at all.`,
    );
  }
  return parseSize(raw, "--daily-ceiling");
}

/** A size in bytes or with a b/kb/mb/gb suffix, refused by the flag's name when unreadable. */
function parseSize(raw: string, flag: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(raw.trim());
  if (!match) {
    throw new Error(
      `${flag} could not be read: ${raw}. Use bytes or a b/kb/mb/gb suffix.`,
    );
  }

  const scale = UNITS[(match[2] ?? "b").toLowerCase()];
  return Math.floor(Number(match[1]) * scale);
}
